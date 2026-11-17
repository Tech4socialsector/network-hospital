# Copyright (c) 2026, TFSS and contributors
# For license information, please see license.txt

from datetime import datetime, timedelta

import frappe
import requests
import urllib3
from frappe.model.document import Document
from frappe.utils import cint, get_time, getdate, now_datetime, time_diff_in_seconds

# The verify=False calls below are intentional (self-signed/expired cert on
# the Bahmni server, LAN-only) — this just stops urllib3 logging a warning
# for every single request.
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Databases (as named in Metabase) and a small test query for each
TEST_DATABASES = {
	"openmrs": "SELECT COUNT(*) FROM patient WHERE voided = 0",
	"Odoo": "SELECT COUNT(*) FROM sale_order",
}

# One row per visit, with the patient's registration details alongside —
# exactly the fields the team's existing Excel report uses, built from the
# query that produces that report (not a guess). "{from_date}" is filled
# in below (either "Sync From Date", or today minus "Sync Days") as a
# plain 'YYYY-MM-DD' string — valid directly against both MySQL (here)
# and PostgreSQL (the Odoo query below), unlike each engine's own
# INTERVAL syntax, which differ.
BAHMNI_PATIENT_VISIT_QUERY = """
	SELECT
	  (SELECT pi.identifier FROM patient_identifier pi
	    WHERE pi.patient_id = v.patient_id AND pi.voided = 0
	    ORDER BY pi.preferred DESC LIMIT 1)                     AS patient_id,
	  v.visit_id                                                 AS visit_id,
	  TIMESTAMPDIFF(YEAR, p.birthdate, v.date_started)           AS age,
	  CASE p.gender WHEN 'M' THEN 'Male' WHEN 'F' THEN 'Female' ELSE 'Other' END AS gender,
	  vt.name                                                    AS treatment_category,
	  ad.county_district                                         AS district,
	  ad.state_province                                          AS state,
	  DATE(v.date_started)                                       AS date_of_visit,
	  DATE(v.date_stopped)                                       AS date_of_discharge,
	  CASE WHEN v.date_stopped IS NULL THEN 'Active' ELSE 'Closed' END AS visit_status,
	  (SELECT COALESCE(cn.name, pa.value)
	     FROM person_attribute pa
	     JOIN person_attribute_type pat ON pat.person_attribute_type_id = pa.person_attribute_type_id
	     LEFT JOIN concept_name cn ON pat.format = 'org.openmrs.Concept'
	          AND cn.concept_id = pa.value AND cn.locale = 'en'
	          AND cn.concept_name_type = 'FULLY_SPECIFIED' AND cn.voided = 0
	    WHERE pa.person_id = p.person_id AND pat.name = 'status' AND pa.voided = 0
	    LIMIT 1)                                                 AS registration_status,
	  (SELECT GROUP_CONCAT(DISTINCT COALESCE(dn.name, o.value_text) SEPARATOR ', ')
	     FROM encounter e
	     JOIN obs o ON o.encounter_id = e.encounter_id AND o.voided = 0
	     JOIN concept_name q ON q.concept_id = o.concept_id
	          AND q.name IN ('Coded Diagnosis', 'Non-coded Diagnosis')
	          AND q.concept_name_type = 'FULLY_SPECIFIED' AND q.voided = 0
	     LEFT JOIN concept_name dn ON dn.concept_id = o.value_coded AND dn.locale = 'en'
	          AND dn.concept_name_type = 'FULLY_SPECIFIED' AND dn.voided = 0
	    WHERE e.visit_id = v.visit_id AND e.voided = 0)          AS diagnosis,
	  (SELECT GROUP_CONCAT(CONCAT(vat.name, ': ', va.value_reference) SEPARATOR ' | ')
	     FROM visit_attribute va
	     JOIN visit_attribute_type vat ON vat.visit_attribute_type_id = va.attribute_type_id
	    WHERE va.visit_id = v.visit_id AND va.voided = 0)        AS visit_details
	FROM visit v
	JOIN person p      ON p.person_id = v.patient_id
	JOIN visit_type vt ON vt.visit_type_id = v.visit_type_id
	LEFT JOIN person_address ad ON ad.person_id = p.person_id AND ad.preferred = 1 AND ad.voided = 0
	WHERE v.voided = 0
	  AND (v.date_started >= '{from_date}'
	       OR v.date_stopped >= '{from_date}')
	ORDER BY v.date_started
"""

# Same caveat as above — account_move and res_partner share a few column
# names (id, create_date, write_date, company_id, etc.); the last table's
# value wins for those. "name" (-> invoice_name) is unique to account_move.
# Filtered on invoice_date (the bill's own date), not write_date — an old
# invoice's write_date jumps to today on any edit (a payment update, a
# status change), which isn't the same thing as a new bill from today and
# was pulling in far more rows than actually billed in the window.
ODOO_INVOICE_QUERY = """
	SELECT am.*, rp.*
	FROM account_move am
	LEFT JOIN res_partner rp ON rp.id = am.partner_id
	WHERE am.move_type = 'out_invoice'
	  AND am.invoice_date >= '{from_date}'
	ORDER BY am.invoice_date DESC
"""


class HMISSyncSettings(Document):
	pass


def _settings():
	return frappe.get_single("HMIS Sync Settings")


def _metabase_login(settings):
	url = (settings.metabase_url or "").rstrip("/")
	email = settings.metabase_email
	password = settings.get_password("metabase_password", raise_exception=False)

	if not (url and email and password):
		frappe.throw("Please fill Metabase URL, Email and Password, then Save.")

	try:
		# verify=False — this Bahmni server's SSL certificate is expired/
		# self-signed; safe enough since the connection stays inside the
		# hospital's own network. Switch to verify=True once IT renews it.
		r = requests.post(
			f"{url}/api/session",
			json={"username": email, "password": password},
			timeout=20,
			verify=False,
		)
	except requests.exceptions.SSLError:
		frappe.throw(
			f"SSL certificate problem when connecting to {url}. "
			"The Bahmni server may be using a self-signed certificate."
		)
	except requests.exceptions.RequestException as e:
		frappe.throw(
			f"Cannot reach Metabase at {url}.<br>Check the URL and that this "
			f"Frappe server has internet/network access to it.<br><small>{e}</small>"
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
	db_id = by_name.get(name.lower())
	if not db_id:
		frappe.throw(f"Database '{name}' not found in Metabase (found: {', '.join(d['name'] for d in dbs)})")
	return db_id


def _native_query(url, token, db_id, sql, limit=None):
	"""Runs a native SQL query through Metabase and returns the rows as a
	list of plain dicts — column name -> value."""
	if limit:
		# Appended directly, not wrapped as "SELECT * FROM (...) t LIMIT n"
		# — that derived-table form makes MySQL enforce unique column
		# names, which our SELECT * joins intentionally don't have.
		sql = f"{sql.strip().rstrip(';')} LIMIT {int(limit)}"
	r = requests.post(
		f"{url}/api/dataset",
		headers={"X-Metabase-Session": token},
		json={"database": db_id, "type": "native", "native": {"query": sql}},
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
	"Sync Days" (both tables' queries take this same cutoff). "Sync Days"
	= 0 means today only — cint(0) is falsy, so this can't be "or 3"
	(that would silently turn 0 back into 3)."""
	if settings.sync_from_date:
		return getdate(settings.sync_from_date)
	days = cint(settings.sync_days) if settings.sync_days not in (None, "") else 3
	return now_datetime().date() - timedelta(days=days)


def _bahmni_patient_visit_query(settings):
	return BAHMNI_PATIENT_VISIT_QUERY.format(from_date=_sync_from_date(settings))


def _odoo_invoice_query(settings):
	return ODOO_INVOICE_QUERY.format(from_date=_sync_from_date(settings))


@frappe.whitelist()
def preview_bahmni_patient_visits():
	"""Read-only — runs the combined patient+visit query with LIMIT 1
	through Metabase so the actual column values on this instance can be
	checked. Writes nothing."""
	frappe.only_for("System Manager")
	settings = _settings()
	url, token = _metabase_login(settings)
	try:
		db_id = _get_db_id(url, token, "openmrs")
		rows = _native_query(url, token, db_id, _bahmni_patient_visit_query(settings), limit=1)
	finally:
		_metabase_logout(url, token)
	return rows[0] if rows else {"message": "No visits found to preview."}


@frappe.whitelist()
def preview_odoo_invoices():
	"""Read-only — runs the invoice query with LIMIT 1 through Metabase.
	Writes nothing."""
	frappe.only_for("System Manager")
	settings = _settings()
	url, token = _metabase_login(settings)
	try:
		db_id = _get_db_id(url, token, "Odoo")
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
	returns MySQL DATE columns as a full ISO datetime with a timezone
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


def sync_bahmni_patient_visits(url, token, settings):
	"""Lands the raw Bahmni row in Bahmni Patient Visit Log, as-is — no
	mapping into Patient Registration here. A separate, later step reads
	this log and does that mapping, once the fields/matching are
	confirmed."""
	fetched = created = updated = 0
	db_id = _get_db_id(url, token, "openmrs")
	rows = _native_query(url, token, db_id, _bahmni_patient_visit_query(settings))
	fetched = len(rows)

	for row in rows:
		visit_id = row.get("visit_id")
		if not visit_id:
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


def sync_odoo_invoices(url, token, settings):
	"""Lands the raw Odoo row in Odoo Invoice Log, as-is — no mapping into
	Patient Claim Form here. A separate, later step reads this log and
	does that mapping, once the patient-matching field is confirmed."""
	fetched = created = updated = 0
	db_id = _get_db_id(url, token, "Odoo")
	rows = _native_query(url, token, db_id, _odoo_invoice_query(settings))
	fetched = len(rows)

	for row in rows:
		invoice_name = row.get("name")
		if not invoice_name:
			continue

		# "name" is a reserved Frappe fieldname (the doc's own id), so the
		# raw account_move.name column is stored under "source_name" on
		# this doctype — set both that and our own key field from it.
		values = dict(row)
		values.pop("name", None)
		values["source_name"] = invoice_name
		values["invoice_name"] = invoice_name
		values = _sanitize_for_doctype("Odoo Invoice Log", values)

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
def test_metabase_connection():
	frappe.only_for("System Manager")
	settings = _settings()

	url, token = _metabase_login(settings)
	headers = {"X-Metabase-Session": token}
	lines = ["✅ Logged in to Metabase"]

	try:
		r = requests.get(f"{url}/api/database", headers=headers, timeout=20, verify=False)
		r.raise_for_status()
		dbs = r.json()
		dbs = dbs.get("data", []) if isinstance(dbs, dict) else dbs  # newer vs older Metabase
		by_name = {d["name"].lower(): d["id"] for d in dbs}

		for db_name, sql in TEST_DATABASES.items():
			db_id = by_name.get(db_name.lower())
			if not db_id:
				lines.append(
					f"❌ Database '{db_name}' not found in Metabase "
					f"(found: {', '.join(d['name'] for d in dbs)})"
				)
				continue

			q = requests.post(
				f"{url}/api/dataset",
				headers=headers,
				json={"database": db_id, "type": "native", "native": {"query": sql}},
				timeout=60,
				verify=False,
			).json()

			if q.get("error") or q.get("status") == "failed":
				lines.append(f"❌ {db_name}: query failed: {q.get('error')}")
			else:
				count = q["data"]["rows"][0][0]
				lines.append(f"✅ {db_name}: connected ({count:,} records found)")
	finally:
		_metabase_logout(url, token)

	return "<br>".join(lines)


def _log_run(source, status, fetched=0, created=0, updated=0, error=None):
	frappe.get_doc(
		{
			"doctype": "HMIS Sync Log",
			"source": source,
			"status": status,
			"records_fetched": fetched,
			"records_created": created,
			"records_updated": updated,
			"error_message": error,
		}
	).insert(ignore_permissions=True)


@frappe.whitelist()
def run_now():
	frappe.only_for("System Manager")
	return scheduled_sync(manual=True)


def _should_run_now(settings):
	"""The scheduler itself ticks every 15 minutes (hooks.py) — this
	decides, on each of those ticks, whether it's actually time to hit
	Metabase, based on the chosen Sync Frequency."""
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


def scheduled_sync(manual=False):
	settings = _settings()
	if not manual:
		if not settings.enable_hmis_sync:
			return
		if not _should_run_now(settings):
			return

	try:
		url, token = _metabase_login(settings)
	except Exception:
		error = frappe.get_traceback()
		_log_run("Bahmni", "Failed", error=error)
		_notify_failure(settings, "Metabase login", error)
		settings.db_set("last_run_at", now_datetime())
		settings.db_set("last_run_status", "Metabase login FAILED — see HMIS Sync Log")
		frappe.db.commit()
		return "Metabase login FAILED — see HMIS Sync Log"

	summary_lines = []
	try:
		fetched, created, updated = sync_bahmni_patient_visits(url, token, settings)
		_log_run("Bahmni", "Success", fetched, created, updated)
		summary_lines.append(f"Bahmni Patient Visit Log: {fetched} fetched, {created} created, {updated} updated")
		settings.db_set("last_bahmni_sync_on", now_datetime())
	except Exception:
		error = frappe.get_traceback()
		_log_run("Bahmni", "Failed", error=error)
		summary_lines.append("Bahmni Patient Visit Log: FAILED — see HMIS Sync Log")
		_notify_failure(settings, "Bahmni Patient Visit Log", error)

	try:
		fetched, created, updated = sync_odoo_invoices(url, token, settings)
		_log_run("Odoo", "Success", fetched, created, updated)
		summary_lines.append(f"Odoo Invoice Log: {fetched} fetched, {created} created, {updated} updated")
		settings.db_set("last_odoo_sync_on", now_datetime())
	except Exception:
		error = frappe.get_traceback()
		_log_run("Odoo", "Failed", error=error)
		summary_lines.append("Odoo Invoice Log: FAILED — see HMIS Sync Log")
		_notify_failure(settings, "Odoo Invoice Log", error)
	finally:
		_metabase_logout(url, token)

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
		subject=f"NWP HMIS Sync Failed — {source}",
		message=f"<pre>{frappe.utils.escape_html(error)}</pre>",
	)
