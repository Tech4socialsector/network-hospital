# Copyright (c) 2026, TFSS and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

APPROVER_EDITABLE_FIELDS = {"approval_status", "comment", "approver"}
NON_DATA_FIELDTYPES = {"Section Break", "Column Break", "Tab Break", "HTML", "Button"}


class PatientClaimForm(Document):
	def validate(self):
		self.restrict_approver_to_approval_fields()

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
