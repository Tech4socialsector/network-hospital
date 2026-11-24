import frappe
from frappe.utils import get_first_day, now_datetime

from nwp.nwp.doctype.org_sync_settings.org_sync_settings import (
	CLAIM_FIELDS,
	CLAIM_FILE_FIELDS,
	REGISTRATION_FIELDS,
	excluded_claim_field_names,
	excluded_registration_field_names,
)

MAX_ROWS = 2000
DOCTYPES = (("Patient Registration", "Registration"), ("Patient Claim Form", "Claim Form"))


@frappe.whitelist()
def get_status(filters=None):
	filters = frappe.parse_json(filters) if isinstance(filters, str) else (filters or {})
	status = (filters.get("status") or "").strip()

	rows = []
	for doctype, label in DOCTYPES:
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
					"doctype": doctype,
					"type": label,
					"status": row_status,
					"error": d.central_push_error,
					"modified": d.modified,
				}
			)

	rows.sort(key=lambda r: str(r["modified"]), reverse=True)
	return rows[:MAX_ROWS]


@frappe.whitelist()
def get_summary():
	"""Volume-level awareness, not just a per-record table — how much has
	actually gone to central, broken down by status, by service type, and
	by month, so an organization can sense the scale without counting rows
	themselves."""
	counts = {}
	for doctype, label in DOCTYPES:
		total = frappe.db.count(doctype)
		sent = frappe.db.count(doctype, {"pushed_to_central": 1})
		failed = frappe.db.count(doctype, {"pushed_to_central": 0, "central_push_error": ["is", "set"]})
		this_month = frappe.db.count(
			doctype, {"pushed_to_central": 1, "central_pushed_at": [">=", get_first_day(now_datetime())]}
		)
		counts[label] = {
			"total": total,
			"sent": sent,
			"failed": failed,
			"pending": total - sent - failed,
			"this_month": this_month,
		}

	# Only what's actually reached central — this answers "how much have we
	# sent", not overall local volume (that's what the stat tiles above
	# already show via total/pending/failed).
	by_service = frappe.get_all(
		"Patient Claim Form",
		filters={"pushed_to_central": 1},
		fields=["type_of_service as service", {"COUNT": "name", "as": "count"}],
		group_by="type_of_service",
		order_by="count desc",
	)

	return {"counts": counts, "by_service": by_service}


@frappe.whitelist()
def get_recent_runs():
	return frappe.get_all(
		"Org Sync Log",
		fields=["run_at", "status", "registrations_pushed", "claims_pushed", "failed_count", "summary"],
		order_by="run_at desc",
		limit_page_length=10,
	)


@frappe.whitelist()
def get_shared_fields():
	"""Exactly which fields leave this site for central right now — same
	constants AND the same live exclusion list the push job itself reads
	from, so this can never silently drift out of sync with what's
	actually sent."""
	settings = frappe.get_single("Org Sync Settings")
	excluded_registration = excluded_registration_field_names(settings)
	excluded_claim = excluded_claim_field_names(settings)

	result = {
		"Patient Registration": [f for f in REGISTRATION_FIELDS if f not in excluded_registration],
		"Patient Claim Form": [f for f in CLAIM_FIELDS if f not in excluded_claim],
		"Files": [f for f in CLAIM_FILE_FIELDS if f not in excluded_claim],
	}

	excluded_all = excluded_registration | excluded_claim
	if excluded_all:
		excluded_labels = frappe.get_all(
			"Org Sync Shareable Field", filters={"field_name": ["in", list(excluded_all)]}, pluck="label"
		)
		result["Excluded By This Organization"] = excluded_labels

	return result
