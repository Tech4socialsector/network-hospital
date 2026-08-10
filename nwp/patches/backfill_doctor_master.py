import frappe


def execute():
	"""treating_doctor_name on Patient Claim Form just changed from free-text
	Data to a Link against the new Doctor master. Existing claims already hold
	whatever string staff typed in, so create a matching Doctor record for
	each distinct value that exists today — otherwise those old claims would
	point at a Doctor record that was never created and show as a broken link.
	"""
	distinct_names = frappe.get_all(
		"Patient Claim Form",
		filters={"treating_doctor_name": ["not in", ["", None]]},
		pluck="treating_doctor_name",
		distinct=True,
	)

	for raw_name in distinct_names:
		name = (raw_name or "").strip()
		if name and not frappe.db.exists("Doctor", name):
			frappe.get_doc({"doctype": "Doctor", "name": name}).insert(ignore_permissions=True)

	frappe.db.commit()
