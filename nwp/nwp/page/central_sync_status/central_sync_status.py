import frappe

from nwp.nwp.doctype.org_sync_settings.org_sync_settings import CLAIM_FIELDS, REGISTRATION_FIELDS

MAX_ROWS = 2000


@frappe.whitelist()
def get_status(filters=None):
	filters = frappe.parse_json(filters) if isinstance(filters, str) else (filters or {})
	status = (filters.get("status") or "").strip()

	rows = []
	for doctype, label in (("Patient Registration", "Registration"), ("Patient Claim Form", "Claim Form")):
		docs = frappe.get_all(
			doctype,
			fields=["name", "pushed_to_central", "central_push_error", "modified"],
			order_by="modified desc",
			limit_page_length=MAX_ROWS,
		)
		for d in docs:
			if d.pushed_to_central:
				row_status = "Sent"
			elif d.central_push_error:
				row_status = "Failed"
			else:
				row_status = "Pending"

			if status and status != row_status:
				continue

			rows.append(
				{
					"record": d.name,
					"type": label,
					"status": row_status,
					"error": d.central_push_error,
					"modified": d.modified,
				}
			)

	rows.sort(key=lambda r: str(r["modified"]), reverse=True)
	return rows[:MAX_ROWS]


@frappe.whitelist()
def get_shared_fields():
	"""The fixed, published list of exactly which fields leave this site
	for central — same source the push job itself reads from, so this
	can never silently drift out of sync with what's actually sent."""
	return {
		"Patient Registration": REGISTRATION_FIELDS,
		"Patient Claim Form": CLAIM_FIELDS,
		"Files": ["upload_prescription", "upload_final_bill"],
	}
