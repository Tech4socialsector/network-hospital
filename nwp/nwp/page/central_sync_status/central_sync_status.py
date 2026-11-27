import frappe
from frappe.utils import cint, get_first_day, now_datetime

from nwp.nwp.doctype.org_sync_settings.org_sync_settings import (
	CLAIM_FIELDS,
	CLAIM_FILE_FIELDS,
	REGISTRATION_FIELDS,
	STATUS_DOCTYPES,
	excluded_claim_field_names,
	excluded_registration_field_names,
	status_detail_reason,
)

# Reference_doctype -> the short label used everywhere else on this page.
STATUS_TYPE_LABEL = {
	"Patient Registration": "Registration",
	"Patient Claim Form": "Claim Form",
	"Network Hospital Budget": "Budget",
	"Budget Disbursement": "Disbursement",
}

MAX_ROWS = 2000
# Label, which field on that doctype holds the organization (Network
# Hospital Budget calls it "organization_name" — fetched from its hospital —
# everything else calls it "organization"), which field holds the hospital
# (Patient Claim Form's is oddly named "organization_copy" despite actually
# holding the hospital, fetched from its registration), and which group it
# belongs to on the page. Patient and financial records are split into
# their own stat cards and their own table, each with its own MAX_ROWS cap —
# Budget and Disbursement are low-volume and were getting crowded out of a
# single combined, capped list by thousands of claims and registrations.
DOCTYPES = (
	("Patient Registration", "Registration", "organization", "hospital_name", "patient"),
	("Patient Claim Form", "Claim Form", "organization", "organization_copy", "patient"),
	("Network Hospital Budget", "Budget", "organization_name", "hospital_name", "financial"),
	("Budget Disbursement", "Disbursement", "organization", "hospital_name", "financial"),
)


@frappe.whitelist()
def get_page_context():
	"""Central never pushes to itself, so pushed_to_central stays 0 on
	every record it receives — the outbound push status view (this page's
	default) would show everything stuck as "Pending" forever there. The
	one site flagged as central instead gets the inbound view: how much
	has been received, broken down by partner organization."""
	return {"is_central": bool(frappe.db.get_single_value("Org Sync Settings", "is_central_site"))}


@frappe.whitelist()
def get_central_summary():
	"""Central-side volume awareness — total records held, with no
	sent/pending/failed framing since that only describes an outbound push,
	which central never does."""
	counts = {}
	for doctype, label, _org_field, _hospital_field, _group in DOCTYPES:
		counts[label] = {
			"total": frappe.db.count(doctype),
			"this_month": frappe.db.count(doctype, {"creation": [">=", get_first_day(now_datetime())]}),
		}

	return {"counts": counts}


@frappe.whitelist()
def get_central_records(filters=None):
	"""Central-side record list — what's been received, from which
	organization, and when, so someone on the central site can review
	intake for a specific period or partner and open any record directly.
	An optional reference_doctype filter supports the stat-card drill-down
	popup (one specific type only, capped small); left out, every type
	comes back up to MAX_ROWS, which is what CSV export uses."""
	filters = frappe.parse_json(filters) if isinstance(filters, str) else (filters or {})
	organization = (filters.get("organization") or "").strip()
	hospital = (filters.get("hospital") or "").strip()
	from_date = (filters.get("from_date") or "").strip()
	to_date = (filters.get("to_date") or "").strip()
	reference_doctype = (filters.get("reference_doctype") or "").strip()
	limit = cint(filters.get("limit")) or MAX_ROWS

	rows = []
	for doctype, label, org_field, hospital_field, _group in DOCTYPES:
		if reference_doctype and doctype != reference_doctype:
			continue
		doc_filters = []
		if organization:
			doc_filters.append([org_field, "=", organization])
		if hospital:
			doc_filters.append([hospital_field, "=", hospital])
		if from_date:
			doc_filters.append(["creation", ">=", from_date])
		if to_date:
			doc_filters.append(["creation", "<=", f"{to_date} 23:59:59"])

		docs = frappe.get_all(
			doctype,
			filters=doc_filters,
			fields=["name", f"{org_field} as organization", f"{hospital_field} as hospital", "creation"],
			order_by="creation desc",
			limit_page_length=limit,
		)
		for d in docs:
			rows.append(
				{
					"record": d.name,
					"doctype": doctype,
					"type": label,
					"organization": d.organization,
					"hospital": d.hospital,
					"received_at": d.creation,
				}
			)

	rows.sort(key=lambda r: str(r["received_at"]), reverse=True)
	return rows[:MAX_ROWS]


@frappe.whitelist()
def get_status(filters=None):
	filters = frappe.parse_json(filters) if isinstance(filters, str) else (filters or {})
	status = (filters.get("status") or "").strip()
	from_date = (filters.get("from_date") or "").strip()
	to_date = (filters.get("to_date") or "").strip()
	group = (filters.get("group") or "").strip()

	rows = []
	for doctype, label, _org_field, _hospital_field, doc_group in DOCTYPES:
		if group and group != doc_group:
			continue
		docs = frappe.get_all(
			doctype,
			fields=["name", "pushed_to_central", "central_push_error", "central_pushed_at", "modified"],
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

			# A date range is about reviewing what was actually sent in that
			# window, so it's checked against when the record was pushed, not
			# when it was last edited — a record never pushed has no
			# pushed_at at all and is naturally excluded once a range is set.
			if from_date or to_date:
				if not d.central_pushed_at:
					continue
				pushed_date = str(d.central_pushed_at)[:10]
				if from_date and pushed_date < from_date:
					continue
				if to_date and pushed_date > to_date:
					continue

			rows.append(
				{
					"record": d.name,
					"doctype": doctype,
					"type": label,
					"status": row_status,
					"error": d.central_push_error,
					"pushed_at": d.central_pushed_at,
					"modified": d.modified,
				}
			)

	rows.sort(key=lambda r: str(r["modified"]), reverse=True)
	return rows[:MAX_ROWS]


@frappe.whitelist()
def get_summary():
	"""Volume-level awareness, not just a per-record table — how much has
	actually gone to central, broken down by status and by month, so an
	organization can sense the scale without counting rows themselves."""
	counts = {}
	for doctype, label, _org_field, _hospital_field, group in DOCTYPES:
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
			"group": group,
		}

	return {"counts": counts}


@frappe.whitelist()
def get_intake_by_organization():
	"""How much data this site actually holds from each partner
	organization — meaningful mainly on the central site, where records
	from many organizations accumulate in one place."""
	registration_counts = {
		r.organization: r.count
		for r in frappe.get_all(
			"Patient Registration",
			filters={"organization": ["is", "set"]},
			fields=["organization", {"COUNT": "name", "as": "count"}],
			group_by="organization",
		)
	}
	claim_counts = {
		r.organization: r.count
		for r in frappe.get_all(
			"Patient Claim Form",
			filters={"organization": ["is", "set"]},
			fields=["organization", {"COUNT": "name", "as": "count"}],
			group_by="organization",
		)
	}

	organizations = set(registration_counts) | set(claim_counts)
	rows = [
		{
			"organization": org,
			"registrations": registration_counts.get(org, 0),
			"claims": claim_counts.get(org, 0),
		}
		for org in organizations
	]
	rows.sort(key=lambda r: r["registrations"] + r["claims"], reverse=True)
	return rows


@frappe.whitelist()
def get_deletion_summary():
	"""Org-side: this site's own outbound deletion queue (Org Sync
	Deletion) — how many records deleted here after they'd already synced
	have been told to central, and how many are still stuck."""
	total = frappe.db.count("Org Sync Deletion")
	sent = frappe.db.count("Org Sync Deletion", {"sent_to_central": 1})
	failed = frappe.db.count(
		"Org Sync Deletion", {"sent_to_central": 0, "central_delete_error": ["is", "set"]}
	)
	return {"total": total, "sent": sent, "pending": total - sent - failed, "failed": failed}


@frappe.whitelist()
def get_deletions(filters=None):
	"""Org-side: the record-by-record view behind get_deletion_summary."""
	filters = frappe.parse_json(filters) if isinstance(filters, str) else (filters or {})
	status = (filters.get("status") or "").strip()

	rows = frappe.get_all(
		"Org Sync Deletion",
		fields=["reference_doctype", "record_name", "sent_to_central", "central_delete_error", "creation"],
		order_by="creation desc",
		limit_page_length=MAX_ROWS,
	)
	out = []
	for d in rows:
		if d.sent_to_central:
			row_status = "Sent"
		elif d.central_delete_error:
			row_status = "Failed"
		else:
			row_status = "Pending"
		if status and status != row_status:
			continue
		out.append(
			{
				"record": d.record_name,
				"type": STATUS_TYPE_LABEL.get(d.reference_doctype, d.reference_doctype),
				"status": row_status,
				"error": d.central_delete_error,
				"deleted_on": d.creation,
			}
		)
	return out


@frappe.whitelist()
def get_pending_failed_detail(reference_doctype, status):
	"""Org-side popup drill-down: which specific records (of this site's
	own data) are Pending or Failed, and why — live, straight from the
	real doctype, since this is the organization's own data, not a
	snapshot someone has to report."""
	if reference_doctype not in STATUS_DOCTYPES:
		return []
	fields = ["name", "central_push_error"]
	if reference_doctype == "Patient Claim Form":
		fields.append("approval_status")
	rows = frappe.get_all(
		reference_doctype,
		filters={"pushed_to_central": 0},
		fields=fields,
		order_by="modified desc",
		limit_page_length=500,
	)
	out = []
	for row in rows:
		row_status = "Failed" if row.get("central_push_error") else "Pending"
		if row_status != status:
			continue
		out.append({"record": row.name, "status": row_status, "reason": status_detail_reason(reference_doctype, row)})
	return out


@frappe.whitelist()
def get_central_deletion_summary():
	"""Central-side: records removed here because an organization deleted
	its own copy after it had already synced."""
	total = frappe.db.count("Central Sync Deletion Log")
	this_month = frappe.db.count(
		"Central Sync Deletion Log", {"deleted_at": [">=", get_first_day(now_datetime())]}
	)
	return {"total": total, "this_month": this_month}


@frappe.whitelist()
def get_central_deletions(filters=None):
	filters = frappe.parse_json(filters) if isinstance(filters, str) else (filters or {})
	organization = (filters.get("organization") or "").strip()

	doc_filters = {}
	if organization:
		doc_filters["organization"] = organization

	rows = frappe.get_all(
		"Central Sync Deletion Log",
		filters=doc_filters,
		fields=["reference_doctype", "organization", "record_name", "deleted_at"],
		order_by="deleted_at desc",
		limit_page_length=MAX_ROWS,
	)
	return [
		{
			"record": d.record_name,
			"type": STATUS_TYPE_LABEL.get(d.reference_doctype, d.reference_doctype),
			"organization": d.organization,
			"deleted_at": d.deleted_at,
		}
		for d in rows
	]


def _reason_rollup(organization, reference_doctype):
	"""A short 'N× reason' summary line for the Organization-Reported
	Status table — the full per-record list (every reason, not just the
	most common ones) is still available via get_org_status_detail for
	the popup drill-down."""
	rows = frappe.get_all(
		"Org Sync Status Detail",
		filters={"organization": organization, "reference_doctype": reference_doctype},
		fields=["reason"],
	)
	if not rows:
		return ""
	counts = {}
	for r in rows:
		reason = r.reason or "No reason given"
		counts[reason] = counts.get(reason, 0) + 1
	# Only the single most common reason — the table row needs to stay one
	# line; the full breakdown (every reason, not just the top one) is
	# still available via get_org_status_detail for the popup drill-down.
	top_reason, top_count = max(counts.items(), key=lambda kv: kv[1])
	suffix = f" (+{len(counts) - 1} more)" if len(counts) > 1 else ""
	return f"{top_count}× {top_reason}{suffix}"


@frappe.whitelist()
def get_org_status_summary(filters=None):
	"""Central-side: what each organization's own site holds, as that site
	itself last reported it (Org Sync Status Summary) — not inferred from
	what's arrived, since central never sees what never arrived."""
	filters = frappe.parse_json(filters) if isinstance(filters, str) else (filters or {})
	organization = (filters.get("organization") or "").strip()

	doc_filters = {}
	if organization:
		doc_filters["organization"] = organization

	rows = frappe.get_all(
		"Org Sync Status Summary",
		filters=doc_filters,
		fields=["organization", "reference_doctype", "total", "sent", "pending", "failed", "reported_at"],
		order_by="organization asc, reference_doctype asc",
	)
	return [
		{
			"organization": r.organization,
			"type": STATUS_TYPE_LABEL.get(r.reference_doctype, r.reference_doctype),
			"reference_doctype": r.reference_doctype,
			"total": r.total,
			"sent": r.sent,
			"pending": r.pending,
			"failed": r.failed,
			"reported_at": r.reported_at,
			"reason": _reason_rollup(r.organization, r.reference_doctype),
		}
		for r in rows
	]


@frappe.whitelist()
def get_org_status_detail(organization, reference_doctype, status):
	"""Central-side popup drill-down behind get_org_status_summary — the
	individual records an organization reported as Pending/Failed, with
	its own stated reason. Capped at the source (MAX_STATUS_DETAIL_ROWS in
	org_sync_settings.py) — a huge not-yet-approved backlog is normal, not
	something enumerated in full."""
	rows = frappe.get_all(
		"Org Sync Status Detail",
		filters={"organization": organization, "reference_doctype": reference_doctype, "status": status},
		fields=["record_name", "status", "reason"],
		order_by="creation desc",
	)
	return [{"record": r.record_name, "status": r.status, "reason": r.reason} for r in rows]


@frappe.whitelist()
def get_recent_runs():
	return frappe.get_all(
		"Org Sync Log",
		fields=[
			"run_at", "status", "registrations_pushed", "claims_pushed",
			"budgets_pushed", "disbursements_pushed", "failed_count", "summary",
		],
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
