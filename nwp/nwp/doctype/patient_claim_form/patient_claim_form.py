# Copyright (c) 2026, TFSS and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import getdate, today

APPROVER_EDITABLE_FIELDS = {"approval_status", "comment", "approver"}
NON_DATA_FIELDTYPES = {"Section Break", "Column Break", "Tab Break", "HTML", "Button"}

# Fields fetched from the linked Patient Registration (PRID). Normally the
# client-side "fetch_from" on each field handles this the moment prid is
# picked in the browser, but that never runs when a claim is created without
# the form loading — a Data Import, the API, or prid typed in and saved
# without the fetch round-trip completing. Target fieldname -> source
# fieldname on Patient Registration.
FETCH_FROM_PRID = {
	"name1": "name1",
	"gender": "gender",
	"age": "age",
	"patient_id": "patient_id",
	"organization_copy": "hospital_name",
	"organization": "organization",
}


class PatientClaimForm(Document):
	def validate(self):
		self.restrict_approver_to_approval_fields()
		self.resolve_prid_from_patient_id()
		self.sync_fields_from_registration()
		self.validate_date_of_visit()
		self.sync_date_of_discharge()
		self.sync_invoice_date()
		self.clear_contribution_fields_for_other_side()

	def validate_date_of_visit(self):
		if self.date_of_visit and getdate(self.date_of_visit) > getdate(today()):
			frappe.throw("Date of visit / admission cannot be a future date.")

	def sync_date_of_discharge(self):
		"""Out Patient / Day Care visits are same-day, so discharge always
		matches the visit date — only In Patient stays a manual entry, since
		an admission can run for several days."""
		if self.type_of_service != "In Patient Service":
			self.date_of_discharge = self.date_of_visit

	def sync_invoice_date(self):
		"""Default invoice_date from date_of_discharge — a suggestion only,
		never overwrites a value that's already been entered."""
		if self.date_of_discharge and not self.invoice_date:
			self.invoice_date = self.date_of_discharge

	def resolve_prid_from_patient_id(self):
		"""Some bulk imports typed patient_id in directly but left prid (the
		actual link field everything else fetches from) blank — found and
		fixed once via a live data recovery, since a Data Import can write a
		read-only field like patient_id without ever setting prid at all.
		This is the permanent guard so it can't recur. Only resolves when
		patient_id matches exactly one Patient Registration; an ambiguous
		(shared) patient_id is left alone rather than guessed."""
		if self.prid or not self.patient_id:
			return
		matches = frappe.get_all(
			"Patient Registration", filters={"patient_id": self.patient_id}, pluck="name"
		)
		if len(matches) == 1:
			self.prid = matches[0]

	def sync_fields_from_registration(self):
		if not self.prid:
			return
		missing = [target for target in FETCH_FROM_PRID if not self.get(target)]
		if not missing:
			return
		registration = frappe.db.get_value(
			"Patient Registration", self.prid, list(FETCH_FROM_PRID.values()), as_dict=True
		)
		if not registration:
			return
		for target in missing:
			self.set(target, registration.get(FETCH_FROM_PRID[target]))

	def clear_contribution_fields_for_other_side(self):
		"""does_it_require_apf_contribution picks one of two mutually exclusive
		funding paths — the client-side script already zeroes out the other
		side's fields when toggling this in the browser, but that never runs
		for a Data Import, the API, or a document saved without the form
		reloading. This is the one place guaranteed to run on every save,
		regardless of how the document was created, so a value left over from
		the other side (or imported along with it) never lingers."""
		if self.does_it_require_apf_contribution == "Yes":
			self.other_donor_contribution = 0
		else:
			self.total_bill_at_apf_agreed_rates_mou = 0
			self.existing_hospital_contribution = 0
			self.apf_contribution = 0

	def restrict_approver_to_approval_fields(self):
		"""NWP Approver can see the whole claim but should only ever change the
		approval decision (approval_status/comment) — permlevel alone can't express
		this, since permlevel-0 write is also the base gate for being allowed to save
		at all, so it has to stay on. Anything else a pure Approver submits gets
		silently reverted to what it was before this save. Skipped for System
		Manager/NWP Data Entry, who are meant to edit the rest of the form.
		Note: child table rows aren't covered by this check.
		"""
		if self.is_new():
			return
		roles = frappe.get_roles()
		if "System Manager" in roles or "NWP Data Entry" in roles:
			return
		if "NWP Approver" not in roles:
			return

		before = self.get_doc_before_save()
		if not before:
			return

		for df in self.meta.fields:
			if df.fieldname in APPROVER_EDITABLE_FIELDS or df.fieldtype in NON_DATA_FIELDTYPES:
				continue
			self.set(df.fieldname, before.get(df.fieldname))
