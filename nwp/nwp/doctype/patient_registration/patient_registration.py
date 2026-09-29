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
		self.sync_assessment_answer_fetch_fields()
		self.total_score = sum(flt(d.score) for d in self.assessment_answers)
		self.validate_duplicate_patient_id()

	def sync_assessment_answer_fetch_fields(self):
		"""score and selected_option_label are both fetch_from selected_option
		— that only runs on a live browser field-change, so a row set via
		Data Import (selected_option filled in directly, form never loaded)
		would otherwise keep score at 0 and the label blank, silently
		throwing off total_score everywhere it's used and leaving exports
		showing a raw ID instead of the readable answer."""
		for row in self.assessment_answers:
			if not row.selected_option:
				continue
			if row.score and row.selected_option_label:
				continue
			option = frappe.db.get_value(
				"Assessment Question Option", row.selected_option, ["score", "option_label"], as_dict=True
			)
			if not option:
				continue
			if not row.score:
				row.score = option.score
			if not row.selected_option_label:
				row.selected_option_label = option.option_label

	def validate_duplicate_patient_id(self):
		"""A patient only ever gets one Patient Registration document, for
		life — re-registering after their assessment expires (see the
		"Register" button in patient_registration.js) archives the old
		assessment into registration_history and updates this same
		document, it never creates a second one. So any other document
		sharing this Patient ID is always a genuine duplicate, no
		exceptions needed."""
		if not self.patient_id:
			return
		# Hospital Name narrows the check to that hospital when it's given —
		# but it isn't mandatory, so a blank Hospital Name must never skip
		# the check entirely; it just falls back to checking the Patient ID
		# on its own (across any hospital) so a duplicate is still caught.
		filters = {"patient_id": self.patient_id, "name": ["!=", self.name or ""]}
		if self.hospital_name:
			filters["hospital_name"] = self.hospital_name
		existing = frappe.db.get_value("Patient Registration", filters)
		if existing:
			frappe.throw(f"A Patient Registration ({existing}) with Patient ID '{self.patient_id}' already exists.")

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

	@frappe.whitelist()
	def start_reregistration(self):
		"""One atomic save that both archives the current assessment cycle
		and refills a blank question list ready for the new assessment. A
		patient keeps exactly one Patient Registration document for life;
		this updates it in place rather than creating a second one.

		Every individual question/answer/score gets archived too (into
		registration_history_answers), not just the total score, tagged
		with this cycle's assessment date — so an earlier cycle can be
		compared question-by-question against the fresh one to see exactly
		what improved. This can't just be nested under registration_history
		itself: Frappe's child-table rows don't support a further nested
		table of their own, so it's kept as its own flat table instead,
		correlated by assessed_on."""
		self.append(
			"registration_history",
			{
				"assessed_on": self.assessed_on,
				"assessed_by": self.assessed_by,
				"verified_on": self.verified_on,
				"verified_by": self.verified_by,
				"total_score": self.total_score,
				"remarks": self.remarks,
			},
		)
		for row in self.assessment_answers:
			self.append(
				"registration_history_answers",
				{
					"assessed_on": self.assessed_on,
					"question": row.question,
					"selected_option": row.selected_option,
					"selected_option_label": row.selected_option_label,
					"score": row.score,
				},
			)
		self.assessed_on = None
		self.assessed_by = None
		self.verified_on = None
		self.verified_by = None
		self.remarks = ""
		self.document_status = "Registration In-Progress"
		self.set("assessment_answers", [])
		self.populate_assessment_answers()
		self.save()


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
