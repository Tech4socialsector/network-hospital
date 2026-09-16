# Copyright (c) 2026, TFSS and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class PatientRegistration(Document):
	def validate(self):
		# Bulk imports (Data Import) create the document without ever loading
		# the form in a browser, so the client script that normally fills
		# this table on new-form-load never runs — fall back to the same
		# population here so imported records still get every question.
		if self.is_new() and not self.assessment_answers:
			self.populate_assessment_answers()
		self.total_score = sum(flt(d.score) for d in self.assessment_answers)

	def populate_assessment_answers(self):
		"""Populate one answer row per question currently defined in
		Assessment Question — the organization's question list is managed
		directly there (add/remove questions any time), not through a
		separate template."""
		questions = frappe.get_all("Assessment Question", order_by="creation", fields=["name"])
		for q in questions:
			self.append("assessment_answers", {"question": q.name})

	@frappe.whitelist()
	def get_assessment_questions(self):
		self.set("assessment_answers", [])
		self.populate_assessment_answers()


def get_or_create_location(doctype, value, filters=None):
	existing = frappe.db.get_value(doctype, {"name": value, **(filters or {})})
	if existing:
		return existing

	doc = frappe.new_doc(doctype)
	doc.name = value
	if filters:
		doc.update(filters)
	doc.insert(ignore_permissions=True)
	return doc.name


@frappe.whitelist(methods=["POST"])
def get_location_from_pincode(pincode):
	import json
	import urllib.error
	import urllib.request

	if not frappe.has_permission("Patient Registration", "create"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	if not (pincode or "").isdigit() or len(pincode) != 6:
		frappe.throw(_("Pincode must be a 6-digit number"))

	try:
		with urllib.request.urlopen(
			f"https://api.postalpincode.in/pincode/{pincode}", timeout=5
		) as response:
			result = json.loads(response.read())[0]
	except (urllib.error.URLError, TimeoutError, ValueError, IndexError):
		frappe.throw(_("Could not fetch location details for pincode {0}").format(pincode))

	if result.get("Status") != "Success" or not result.get("PostOffice"):
		frappe.throw(_("Could not find location details for pincode {0}").format(pincode))

	post_office = result["PostOffice"][0]

	state = get_or_create_location("State List", post_office.get("State"))
	district = get_or_create_location("District List", post_office.get("District"), {"state": state})

	return {
		"state": state,
		"district": district,
		"block": post_office.get("Block"),
	}
