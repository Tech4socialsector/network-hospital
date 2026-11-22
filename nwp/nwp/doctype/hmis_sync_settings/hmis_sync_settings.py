# Copyright (c) 2026, TFSS and contributors
# For license information, please see license.txt

from datetime import datetime, timedelta

import frappe
import requests
import urllib3
from frappe.model.document import Document
from frappe.utils import cint, flt, get_time, getdate, now_datetime, time_diff_in_seconds

# The NWP account head and the Tribal top-up rate are no longer fixed
# here — each hospital's own record (Contribution tab) holds its own
# values, read inside _standard_nwp_split() below.

# Which other account heads count as an "other donor" contribution (and
# whose) is NOT hardcoded here — it's looked up against the Other Donor
# Name list (each record's Discount Account Head field) at sync time, so
# adding a new donor is a data entry, not a code change. See
# _other_donor_for_account_head() below.

# The verify=False calls below are intentional (self-signed/expired certs
# are common on hospital-run servers, LAN-only) — this just stops urllib3
# logging a warning for every single request.
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class HMISSyncSettings(Document):
	pass


def _active_settings():
	"""One sync run per enabled hospital record — each hospital's own
	HMIS, database names and queries are entirely its own record's data,
	not anything hardcoded here. Adding a new hospital (even one on a
	different HMIS entirely) is a new record, never a code change."""
	names = frappe.get_all("HMIS Sync Settings", filters={"enable_hmis_sync": 1}, pluck="name")
	return [frappe.get_doc("HMIS Sync Settings", name) for name in names]


def _metabase_login(settings):
	url = (settings.metabase_url or "").rstrip("/")
	email = settings.metabase_email
	password = settings.get_password("metabase_password", raise_exception=False)

	if not (url and email and password):
		frappe.throw("Please fill Metabase URL, Email and Password, then Save.")

	try:
		# verify=False — this hospital's server may have an expired/
		# self-signed certificate; safe enough since the connection stays
		# inside the hospital's own network. Switch to verify=True once
		# their IT renews it.
		r = requests.post(
			f"{url}/api/session",
			json={"username": email, "password": password},
			timeout=20,
			verify=False,
		)
	except requests.exceptions.SSLError:
		frappe.throw(
			f"SSL certificate problem when connecting to {url}. "
			"This hospital's Metabase server may be using a self-signed certificate."
		)
	except requests.exceptions.RequestException as e:
		frappe.throw(
			f"Cannot reach Metabase at {url}.<br>Check the URL and that this "
			f"Frappe server has network access to it.<br><small>{e}</small>"
		)

	if r.status_code in (400, 401):
		frappe.throw("Metabase rejected the login. Check the Email and Password.")
	if not r.ok:
		frappe.throw(f"Metabase login failed (HTTP {r.status_code}): {r.text[:300]}")

	return url, r.json()["id"]


def _metabase_logout(url, token):
	try:
		requests.delete(f"{url}/api/session", headers={"X-Metabase-Session": token}, timeout=10, verify=False)
	except requests.exceptions.RequestException:
		pass


def _get_db_id(url, token, name):
	r = requests.get(f"{url}/api/database", headers={"X-Metabase-Session": token}, timeout=20, verify=False)
	r.raise_for_status()
	dbs = r.json()
	dbs = dbs.get("data", []) if isinstance(dbs, dict) else dbs
	by_name = {d["name"].lower(): d["id"] for d in dbs}
	db_id = by_name.get((name or "").lower())
	if not db_id:
		frappe.throw(f"Database '{name}' not found in Metabase (found: {', '.join(d['name'] for d in dbs)})")
	return db_id


def _native_query(url, token, db_id, sql, limit=None):
	"""Runs a native SQL query through Metabase and returns the rows as a
	list of plain dicts — column name -> value."""
	if limit:
		# Appended directly, not wrapped as "SELECT * FROM (...) t LIMIT n"
		# — that derived-table form makes MySQL enforce unique column
		# names, which a SELECT * join may intentionally not have.
		sql = f"{sql.strip().rstrip(';')} LIMIT {int(limit)}"
	r = requests.post(
		f"{url}/api/dataset",
		headers={"X-Metabase-Session": token},
		# Metabase's /api/dataset caps results at 2000 rows by default —
		# this constraint overrides that cap so a large backfill isn't
		# silently truncated.
		json={
			"database": db_id,
			"type": "native",
			"native": {"query": sql},
			"constraints": {"max-results": 1000000, "max-results-bare-rows": 1000000},
		},
		timeout=60,
		verify=False,
	)
	r.raise_for_status()
	result = r.json()
	if result.get("error") or result.get("status") == "failed":
		frappe.throw(f"Metabase query failed: {result.get('error')}")
	data = result.get("data", {})
	cols = [c.get("name") for c in data.get("cols", [])]
	return [dict(zip(cols, row)) for row in data.get("rows", [])]


def _sync_from_date(settings):
	"""An explicit "Sync From Date" always wins; otherwise today minus
	"Sync Days" (both queries take this same cutoff). "Sync Days" = 0
	means today only — cint(0) is falsy, so this can't be "or 3" (that
	would silently turn 0 back into 3)."""
	if settings.sync_from_date:
		return getdate(settings.sync_from_date)
	days = cint(settings.sync_days) if settings.sync_days not in (None, "") else 3
	return now_datetime().date() - timedelta(days=days)


def _bahmni_patient_visit_query(settings):
	if not settings.patient_visit_query:
		frappe.throw(f"{settings.hospital_name}: Patient Visit Query is not set (Queries tab).")
	return settings.patient_visit_query.format(from_date=_sync_from_date(settings))


def _odoo_invoice_query(settings):
	if not settings.invoice_query:
		frappe.throw(f"{settings.hospital_name}: Invoice Query is not set (Queries tab).")
	return settings.invoice_query.format(from_date=_sync_from_date(settings))


@frappe.whitelist()
def preview_bahmni_patient_visits(settings_name):
	"""Read-only — runs this hospital's own patient+visit query with
	LIMIT 1 through its Metabase so the actual column values can be
	checked. Writes nothing."""
	frappe.only_for("System Manager")
	settings = frappe.get_doc("HMIS Sync Settings", settings_name)
	url, token = _metabase_login(settings)
	try:
		db_id = _get_db_id(url, token, settings.patient_visit_database)
		rows = _native_query(url, token, db_id, _bahmni_patient_visit_query(settings), limit=1)
	finally:
		_metabase_logout(url, token)
	return rows[0] if rows else {"message": "No visits found to preview."}


@frappe.whitelist()
def preview_odoo_invoices(settings_name):
	"""Read-only — runs this hospital's own invoice query with LIMIT 1
	through its Metabase. Writes nothing."""
	frappe.only_for("System Manager")
	settings = frappe.get_doc("HMIS Sync Settings", settings_name)
	url, token = _metabase_login(settings)
	try:
		db_id = _get_db_id(url, token, settings.invoice_database)
		rows = _native_query(url, token, db_id, _odoo_invoice_query(settings), limit=1)
	finally:
		_metabase_logout(url, token)
	return rows[0] if rows else {"message": "No invoices found to preview."}


def _sanitize_for_doctype(doctype, row):
	"""Frappe's Int/Float/Check columns are created NOT NULL DEFAULT 0 —
	writing Python None into one (a source value that was genuinely NULL,
	e.g. an invoice with no payment term) fails at the DB level. Swap None
	for a type-appropriate empty value using this doctype's own field
	metadata, so any null source column lands safely regardless of which
	table it is.

	Also trims a "Date" field's value to just its date part — Metabase
	returns a source DATE column as a full ISO datetime with a timezone
	offset (e.g. "2026-11-14T00:00:00+05:30"), which MySQL's own DATE
	column type rejects outright.
	"""
	meta = frappe.get_meta(doctype)
	numeric_fields = {df.fieldname for df in meta.fields if df.fieldtype in ("Int", "Float", "Currency", "Check", "Percent")}
	date_fields = {df.fieldname for df in meta.fields if df.fieldtype == "Date"}
	out = {}
	for k, v in row.items():
		if v is None and k in numeric_fields:
			v = 0
		elif v is not None and k in date_fields and isinstance(v, str):
			v = v[:10]
		out[k] = v
	return out


def _visit_has_invoice(patient_id, date_of_visit, date_of_discharge):
	"""Checked against Odoo Invoice Log (already synced by an earlier run) —
	the patient/visit source and the billing source are separate databases
	(possibly for different HMIS entirely, per hospital), so this can't be
	a single SQL join; it's the same cross-database pattern used for
	bahmni_registration_status, just the other direction. A visit and its
	invoice landing in the very same sync run won't match here yet (the
	invoice hasn't been synced this run), but will on the next run, as
	long as the visit is still inside the "Sync Days" window by then."""
	if not patient_id or not date_of_visit:
		return False
	date_of_visit = date_of_visit[:10] if isinstance(date_of_visit, str) else date_of_visit
	date_of_discharge = date_of_discharge[:10] if isinstance(date_of_discharge, str) else date_of_discharge
	return bool(
		frappe.db.exists(
			"Odoo Invoice Log",
			{
				"patient_id": patient_id,
				"invoice_date": ["between", [date_of_visit, date_of_discharge or date_of_visit]],
			},
		)
	)


def sync_bahmni_patient_visits(url, token, settings):
	"""Lands this hospital's raw patient+visit row in Bahmni Patient Visit
	Log, as-is — no mapping into Patient Registration here. A separate,
	later step reads this log and does that mapping, once the
	fields/matching are confirmed.

	Only visits that already have a matching invoice are synced —
	pending-billing visits (patient registered, bill not generated yet)
	are skipped for now and picked up automatically once billing is done
	and a later run finds the invoice."""
	fetched = created = updated = 0
	db_id = _get_db_id(url, token, settings.patient_visit_database)
	rows = _native_query(url, token, db_id, _bahmni_patient_visit_query(settings))
	fetched = len(rows)

	for row in rows:
		visit_id = row.get("visit_id")
		if not visit_id:
			continue

		if not _visit_has_invoice(row.get("patient_id"), row.get("date_of_visit"), row.get("date_of_discharge")):
			continue

		row = _sanitize_for_doctype("Bahmni Patient Visit Log", row)
		existing = frappe.db.exists("Bahmni Patient Visit Log", visit_id)
		if existing:
			frappe.db.set_value("Bahmni Patient Visit Log", existing, row)
			updated += 1
		else:
			doc = frappe.new_doc("Bahmni Patient Visit Log")
			doc.update(row)
			doc.insert(ignore_permissions=True)
			created += 1

	return fetched, created, updated


def _other_donor_for_account_head(account_head):
	"""Looks up the Other Donor Name list for a record whose Discount
	Account Head matches this invoice's account head. Returns that
	donor's name, or None if this account head isn't any configured
	donor's — add a new donor there, not here, when a new one appears."""
	if not account_head:
		return None
	return frappe.db.get_value("Other Donor Name", {"discount_account_head": account_head}, "name")


def _standard_nwp_split(settings, row, total_bill, patient_contribution, account_head, is_tribal):
	"""Sittilingi's rule: NWP covers whatever's left after the patient's
	share and the hospital's Tribal-only top-up, for bills posted to
	THIS hospital's own NWP Discount Account Head (Contribution tab).
	Any other account head either belongs to a donor in the Other Donor
	Name list, or — if none matches — the hospital carries the whole
	discount itself."""
	is_nwp_bill = bool(account_head) and account_head == (settings.nwp_discount_account_head or "").strip()
	other_donor_name = _other_donor_for_account_head(account_head) if not is_nwp_bill else None

	result = {
		"hospital_additional_contribution": 0,
		"nwp_contribution": 0,
		"other_donor_contribution": 0,
		"other_donor_name": None,
	}

	if is_nwp_bill:
		tribal_rate = (flt(settings.tribal_hospital_contribution_rate) or 0) / 100
		hospital_additional_contribution = flt(total_bill * tribal_rate, 2) if is_tribal else 0
		result["hospital_additional_contribution"] = hospital_additional_contribution
		result["nwp_contribution"] = flt(total_bill - patient_contribution - hospital_additional_contribution, 2)
	elif other_donor_name:
		result["other_donor_contribution"] = flt(row.get("discount_amount"))
		result["other_donor_name"] = other_donor_name
	elif account_head:
		# No scheme-specific split is defined for this account head yet,
		# so the hospital is treated as carrying the whole discount itself.
		result["hospital_additional_contribution"] = flt(row.get("discount_amount"))
	# no account head at all (shouldn't happen now that "none"-method
	# invoices are excluded from the sync) — all three stay 0.

	return result


# Registry for the "Contribution Logic" select on HMIS Sync Settings — a
# hospital needing a genuinely different formula gets a NEW function and
# a new key here, never by editing an existing hospital's function.
CONTRIBUTION_SPLIT_LOGIC = {
	"Standard NWP Split": _standard_nwp_split,
}


def _calculate_contribution_split(settings, row, total_bill, patient_contribution, account_head, is_tribal):
	logic_name = settings.contribution_logic or "Standard NWP Split"
	fn = CONTRIBUTION_SPLIT_LOGIC.get(logic_name)
	if not fn:
		frappe.throw(f"{settings.hospital_name}: unknown Contribution Logic '{logic_name}'.")
	return fn(settings, row, total_bill, patient_contribution, account_head, is_tribal)


def sync_odoo_invoices(url, token, settings):
	"""Lands this curated set of billing fields in Odoo Invoice Log — no
	mapping into Patient Claim Form here. A separate, later step reads
	this log and does that mapping, once the patient-matching field is
	confirmed."""
	fetched = created = updated = 0
	db_id = _get_db_id(url, token, settings.invoice_database)
	rows = _native_query(url, token, db_id, _odoo_invoice_query(settings))
	fetched = len(rows)

	for row in rows:
		invoice_name = row.get("invoice_name")
		if not invoice_name:
			continue

		# No patient linked to this invoice at all (e.g. a counter/pharmacy
		# sale with no registered patient) — nothing to match it to, so skip.
		if not row.get("patient_id"):
			continue

		# registration_status lives in the patient/visit source, not the
		# billing source — pulled from the Bahmni Patient Visit Log row
		# already synced for this patient (that sync runs before this one
		# in the same run), not from another cross-database query.
		row["bahmni_registration_status"] = frappe.db.get_value(
			"Bahmni Patient Visit Log",
			{"patient_id": row.get("patient_id")},
			"registration_status",
			order_by="creation desc",
		)

		total_bill = flt(row.get("total_bill"))
		patient_contribution = flt(row.get("invoice_total"))
		account_head = (row.get("discount_account_head") or "").strip()
		is_tribal = (row.get("bahmni_registration_status") or "").strip().lower() == "tribal"

		row["patient_contribution"] = patient_contribution
		row.update(_calculate_contribution_split(settings, row, total_bill, patient_contribution, account_head, is_tribal))

		values = _sanitize_for_doctype("Odoo Invoice Log", row)

		existing = frappe.db.exists("Odoo Invoice Log", invoice_name)
		if existing:
			frappe.db.set_value("Odoo Invoice Log", existing, values)
			updated += 1
		else:
			doc = frappe.new_doc("Odoo Invoice Log")
			doc.update(values)
			doc.insert(ignore_permissions=True)
			created += 1

	return fetched, created, updated


@frappe.whitelist()
def test_metabase_connection(settings_name):
	frappe.only_for("System Manager")
	settings = frappe.get_doc("HMIS Sync Settings", settings_name)

	url, token = _metabase_login(settings)
	lines = ["✅ Logged in to Metabase"]

	try:
		for label, db_name in (
			("Patient Visit Database", settings.patient_visit_database),
			("Invoice Database", settings.invoice_database),
		):
			try:
				_get_db_id(url, token, db_name)
				lines.append(f"✅ {label} ('{db_name}'): found in Metabase")
			except Exception as e:
				lines.append(f"❌ {label} ('{db_name}'): {e}")
	finally:
		_metabase_logout(url, token)

	return "<br>".join(lines)


def _log_run(settings, source, status, fetched=0, created=0, updated=0, error=None):
	frappe.get_doc(
		{
			"doctype": "HMIS Sync Log",
			"hmis_sync_settings": settings.name,
			"source": source,
			"status": status,
			"records_fetched": fetched,
			"records_created": created,
			"records_updated": updated,
			"error_message": error,
		}
	).insert(ignore_permissions=True)


@frappe.whitelist()
def run_now(settings_name=None):
	frappe.only_for("System Manager")
	return scheduled_sync(manual=True, settings_name=settings_name)


def _should_run_now(settings):
	"""The scheduler itself ticks every 15 minutes (hooks.py) — this
	decides, on each of those ticks, whether it's actually time to hit
	this hospital's Metabase, based on its own chosen Sync Frequency."""
	if settings.sync_frequency == "Daily At A Specific Time":
		if settings.last_run_at and getdate(settings.last_run_at) == getdate(now_datetime()):
			return False  # already ran today
		today = now_datetime().date()
		target = datetime.combine(today, get_time(settings.sync_time or "02:00:00"))
		now = datetime.combine(today, now_datetime().time())
		return target <= now < target + timedelta(minutes=15)

	interval_minutes = max(15, cint(settings.poll_interval_minutes) or 60)
	if not settings.last_run_at:
		return True
	return time_diff_in_seconds(now_datetime(), settings.last_run_at) >= interval_minutes * 60


def scheduled_sync(manual=False, settings_name=None):
	"""Background scheduler tick (hooks.py, manual=False): runs every
	enabled hospital whose own Sync Frequency says it's time, one
	independently of the next — one hospital's failure doesn't block
	another's. A manual "Run Now" (manual=True) either runs one specific
	hospital (settings_name given, from that hospital's own form) or
	every enabled hospital right now, ignoring each one's own timing."""
	if settings_name:
		candidates = [frappe.get_doc("HMIS Sync Settings", settings_name)]
	else:
		candidates = _active_settings()

	summaries = []
	for settings in candidates:
		if not manual and not _should_run_now(settings):
			continue
		summaries.append(f"<b>{settings.hospital_name}</b><br>{_run_sync_for(settings)}")

	if not summaries:
		return None
	return "<br><br>".join(summaries)


def _run_sync_for(settings):
	try:
		url, token = _metabase_login(settings)
	except Exception:
		error = frappe.get_traceback()
		_log_run(settings, "Bahmni", "Failed", error=error)
		_notify_failure(settings, "Metabase login", error)
		settings.db_set("last_run_at", now_datetime())
		settings.db_set("last_run_status", "Metabase login FAILED — see HMIS Sync Log")
		frappe.db.commit()
		return "Metabase login FAILED — see HMIS Sync Log"

	summary_lines = []
	try:
		fetched, created, updated = sync_bahmni_patient_visits(url, token, settings)
		_log_run(settings, "Bahmni", "Success", fetched, created, updated)
		summary_lines.append(f"Bahmni Patient Visit Log: {fetched} fetched, {created} created, {updated} updated")
		settings.db_set("last_bahmni_sync_on", now_datetime())
	except Exception:
		error = frappe.get_traceback()
		_log_run(settings, "Bahmni", "Failed", error=error)
		summary_lines.append("Bahmni Patient Visit Log: FAILED — see HMIS Sync Log")
		_notify_failure(settings, "Bahmni Patient Visit Log", error)

	try:
		fetched, created, updated = sync_odoo_invoices(url, token, settings)
		_log_run(settings, "Odoo", "Success", fetched, created, updated)
		summary_lines.append(f"Odoo Invoice Log: {fetched} fetched, {created} created, {updated} updated")
		settings.db_set("last_odoo_sync_on", now_datetime())
	except Exception:
		error = frappe.get_traceback()
		_log_run(settings, "Odoo", "Failed", error=error)
		summary_lines.append("Odoo Invoice Log: FAILED — see HMIS Sync Log")
		_notify_failure(settings, "Odoo Invoice Log", error)
	finally:
		_metabase_logout(url, token)

	try:
		from nwp.nwp.page.visit_invoice_details.visit_invoice_details import map_synced_records

		organization = frappe.db.get_value("Hospital With Organization", settings.hospital_name, "organization")
		map_synced_records(settings.hospital_name, organization)
		_log_run(settings, "Mapping", "Success")
	except Exception:
		error = frappe.get_traceback()
		_log_run(settings, "Mapping", "Failed", error=error)
		summary_lines.append("Patient Registration / Claim Form mapping: FAILED — see HMIS Sync Log")
		_notify_failure(settings, "Patient Registration / Claim Form mapping", error)

	settings.db_set("is_first_run", 0)
	settings.db_set("last_run_at", now_datetime())
	settings.db_set("last_run_status", " | ".join(summary_lines))
	frappe.db.commit()
	return "<br>".join(summary_lines)


def _notify_failure(settings, source, error):
	if not settings.send_email_on_failure or not settings.failure_email_recipient:
		return
	frappe.sendmail(
		recipients=[settings.failure_email_recipient],
		subject=f"NWP HMIS Sync Failed — {settings.hospital_name} — {source}",
		message=f"<pre>{frappe.utils.escape_html(error)}</pre>",
	)
