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
# Label, which field on that doctype holds the organization (Network
# Hospital Budget calls it "organization_name" — fetched from its hospital —
# everything else calls it "organization"), and which group it belongs to on
# the page. Patient and financial records are split into their own stat
# cards and their own table, each with its own MAX_ROWS cap — Budget and
# Disbursement are low-volume and were getting crowded out of a single
# combined, capped list by thousands of claims and registrations.
DOCTYPES = (
	("Patient Registration", "Registration", "organization", "patient"),
	("Patient Claim Form", "Claim Form", "organization", "patient"),
	("Network Hospital Budget", "Budget", "organization_name", "financial"),
	("Budget Disbursement", "Disbursement", "organization", "financial"),
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
	"""Central-side volume awareness — total records held and the service
	mix, with no sent/pending/failed framing since that only describes an
	outbound push, which central never does."""
	counts = {}
	for doctype, label, _org_field, _group in DOCTYPES:
		counts[label] = {
			"total": frappe.db.count(doctype),
			"this_month": frappe.db.count(doctype, {"creation": [">=", get_first_day(now_datetime())]}),
		}

	by_service = frappe.get_all(
		"Patient Claim Form",
		fields=["type_of_service as service", {"COUNT": "name", "as": "count"}],
		group_by="type_of_service",
		order_by="count desc",
	)

	return {"counts": counts, "by_service": by_service}


@frappe.whitelist()
def get_central_records(filters=None):
	"""Central-side record list — what's been received, from which
	organization, and when, so someone on the central site can review
	intake for a specific period or partner and open any record directly."""
	filters = frappe.parse_json(filters) if isinstance(filters, str) else (filters or {})
	organization = (filters.get("organization") or "").strip()
	from_date = (filters.get("from_date") or "").strip()
	to_date = (filters.get("to_date") or "").strip()

	rows = []
	for doctype, label, org_field, _group in DOCTYPES:
		doc_filters = []
		if organization:
			doc_filters.append([org_field, "=", organization])
		if from_date:
			doc_filters.append(["creation", ">=", from_date])
		if to_date:
			doc_filters.append(["creation", "<=", f"{to_date} 23:59:59"])

		docs = frappe.get_all(
			doctype,
			filters=doc_filters,
			fields=["name", f"{org_field} as organization", "creation"],
			order_by="creation desc",
			limit_page_length=MAX_ROWS,
		)
		for d in docs:
			rows.append(
				{
					"record": d.name,
					"doctype": doctype,
					"type": label,
					"organization": d.organization,
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
	for doctype, label, _org_field, doc_group in DOCTYPES:
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
	for doctype, label, _org_field, group in DOCTYPES:
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
