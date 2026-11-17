# Copyright (c) 2026, TFSS and contributors
# For license information, please see license.txt

import frappe
import requests
import urllib3
from frappe.model.document import Document
from frappe.utils import now_datetime

# The verify=False calls below are intentional (self-signed/expired cert on
# the Bahmni server, LAN-only) — this just stops urllib3 logging a warning
# for every single request.
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Databases (as named in Metabase) and a small test query for each
TEST_DATABASES = {
	"openmrs": "SELECT COUNT(*) FROM patient WHERE voided = 0",
	"Odoo": "SELECT COUNT(*) FROM sale_order",
}

# OpenMRS's standard schema, run through Metabase's native-query endpoint
# instead of a direct DB connection — Metabase already has the DB access
# configured, so this needs no new database port/firewall access.
#
# Every real (non-audit) column from patient/person/person_name/
# patient_identifier/person_address — explicitly listed, not SELECT *,
# so the audit/system columns every OpenMRS table carries (creator,
# date_created, changed_by, date_changed, voided, voided_by, date_voided,
# void_reason, uuid) are left out; they're bookkeeping, not patient data.
# person_attribute (phone number etc.) is deliberately NOT joined here —
# it's one row per attribute per person (EAV-shaped), so joining it would
# multiply each patient into several rows; it needs its own design.
BAHMNI_PATIENT_QUERY = """
	SELECT p.patient_id, p.allergy_status,
	       pe.gender, pe.birthdate, pe.birthdate_estimated, pe.dead, pe.death_date,
	       pe.cause_of_death, pe.cause_of_death_non_coded, pe.deathdate_estimated, pe.birthtime,
	       pn.prefix, pn.given_name, pn.middle_name, pn.family_name_prefix, pn.family_name,
	       pn.family_name2, pn.family_name_suffix, pn.degree,
	       pi.identifier, pi.identifier_type,
	       pa.address1, pa.address2, pa.address3, pa.address4, pa.address5, pa.address6,
	       pa.address7, pa.address8, pa.address9, pa.address10, pa.address11, pa.address12,
	       pa.address13, pa.address14, pa.address15,
	       pa.city_village, pa.state_province, pa.postal_code, pa.country,
	       pa.county_district, pa.latitude, pa.longitude, pa.start_date AS address_start_date,
	       pa.end_date AS address_end_date
	FROM patient p
	JOIN person pe ON pe.person_id = p.patient_id
	LEFT JOIN person_name pn ON pn.person_id = p.patient_id AND pn.preferred = 1
	LEFT JOIN patient_identifier pi ON pi.patient_id = p.patient_id AND pi.preferred = 1
	LEFT JOIN person_address pa ON pa.person_id = p.patient_id AND pa.preferred = 1
	WHERE pe.voided = 0
"""

# One row per visit (not per encounter/observation, and not joined to
# visit_attribute — both are EAV-shaped, one row per encounter/attribute,
# and would multiply each visit into several rows; they'd need their own
# design). Audit/system columns left out, same reasoning as the patient
# query above. Includes the patient's identifier so a visit can be traced
# back to its Bahmni Patient Log row.
BAHMNI_VISIT_QUERY = """
	SELECT v.visit_id, v.date_started, v.date_stopped, v.location_id, v.indication_concept_id,
	       vt.name AS visit_type_name, pi.identifier
	FROM visit v
	LEFT JOIN visit_type vt ON vt.visit_type_id = v.visit_type_id
	LEFT JOIN patient_identifier pi ON pi.patient_id = v.patient_id AND pi.preferred = 1
	WHERE v.voided = 0
"""

# Same caveat as above — account_move and res_partner share a few column
# names (id, create_date, write_date, company_id, etc.); the last table's
# value wins for those. "name" (-> invoice_name) is unique to account_move.
ODOO_INVOICE_QUERY = """
	SELECT am.*, rp.*
	FROM account_move am
	LEFT JOIN res_partner rp ON rp.id = am.partner_id
	WHERE am.move_type = 'out_invoice'
	ORDER BY am.write_date DESC
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


@frappe.whitelist()
def preview_bahmni_patients():
	"""Read-only — runs the patient query with LIMIT 1 through Metabase so
	the actual column values on this instance can be checked. Writes
	nothing."""
	frappe.only_for("System Manager")
	settings = _settings()
	url, token = _metabase_login(settings)
	try:
		db_id = _get_db_id(url, token, "openmrs")
		rows = _native_query(url, token, db_id, BAHMNI_PATIENT_QUERY, limit=1)
	finally:
		_metabase_logout(url, token)
	return rows[0] if rows else {"message": "No patients found to preview."}


@frappe.whitelist()
def preview_bahmni_visits():
	"""Read-only — runs the visit query with LIMIT 1 through Metabase.
	Writes nothing."""
	frappe.only_for("System Manager")
	settings = _settings()
	url, token = _metabase_login(settings)
	try:
		db_id = _get_db_id(url, token, "openmrs")
		rows = _native_query(url, token, db_id, BAHMNI_VISIT_QUERY, limit=1)
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
		rows = _native_query(url, token, db_id, ODOO_INVOICE_QUERY, limit=1)
	finally:
		_metabase_logout(url, token)
	return rows[0] if rows else {"message": "No invoices found to preview."}


def _sanitize_for_doctype(doctype, row):
	"""Frappe's Int/Float/Check columns are created NOT NULL DEFAULT 0 —
	writing Python None into one (a source value that was genuinely NULL,
	e.g. an invoice with no payment term) fails at the DB level. Swap None
	for a type-appropriate empty value using this doctype's own field
	metadata, so any null source column lands safely regardless of which
	table it is."""
	numeric_fields = {
		df.fieldname
		for df in frappe.get_meta(doctype).fields
		if df.fieldtype in ("Int", "Float", "Currency", "Check", "Percent")
	}
	return {k: (0 if v is None and k in numeric_fields else v) for k, v in row.items()}


def sync_bahmni_patients(url, token):
	"""Lands the raw Bahmni row in Bahmni Patient Log, as-is — no mapping
	into Patient Registration here. A separate, later step reads this log
	and does that mapping, once the fields/matching are confirmed."""
	fetched = created = updated = 0
	db_id = _get_db_id(url, token, "openmrs")
	rows = _native_query(url, token, db_id, BAHMNI_PATIENT_QUERY)
	fetched = len(rows)

	for row in rows:
		identifier_value = row.get("identifier")
		if not identifier_value:
			continue

		row = _sanitize_for_doctype("Bahmni Patient Log", row)
		existing = frappe.db.exists("Bahmni Patient Log", identifier_value)
		if existing:
			frappe.db.set_value("Bahmni Patient Log", existing, row)
			updated += 1
		else:
			doc = frappe.new_doc("Bahmni Patient Log")
			doc.update(row)
			doc.insert(ignore_permissions=True)
			created += 1

	return fetched, created, updated


def sync_bahmni_visits(url, token):
	"""Lands the raw Bahmni visit row in Bahmni Visit Log, as-is — no
	mapping anywhere else here. A separate, later step reads this log."""
	fetched = created = updated = 0
	db_id = _get_db_id(url, token, "openmrs")
	rows = _native_query(url, token, db_id, BAHMNI_VISIT_QUERY)
	fetched = len(rows)

	for row in rows:
		visit_id = row.get("visit_id")
		if not visit_id:
			continue

		row = _sanitize_for_doctype("Bahmni Visit Log", row)
		existing = frappe.db.exists("Bahmni Visit Log", visit_id)
		if existing:
			frappe.db.set_value("Bahmni Visit Log", existing, row)
			updated += 1
		else:
			doc = frappe.new_doc("Bahmni Visit Log")
			doc.update(row)
			doc.insert(ignore_permissions=True)
			created += 1

	return fetched, created, updated


def sync_odoo_invoices(url, token):
	"""Lands the raw Odoo row in Odoo Invoice Log, as-is — no mapping into
	Patient Claim Form here. A separate, later step reads this log and
	does that mapping, once the patient-matching field is confirmed."""
	fetched = created = updated = 0
	db_id = _get_db_id(url, token, "Odoo")
	rows = _native_query(url, token, db_id, ODOO_INVOICE_QUERY)
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


def scheduled_sync(manual=False):
	settings = _settings()
	if not manual and not settings.enable_hmis_sync:
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
		fetched, created, updated = sync_bahmni_patients(url, token)
		_log_run("Bahmni", "Success", fetched, created, updated)
		summary_lines.append(f"Bahmni Patient Log: {fetched} fetched, {created} created, {updated} updated")
		settings.db_set("last_bahmni_sync_on", now_datetime())
	except Exception:
		error = frappe.get_traceback()
		_log_run("Bahmni", "Failed", error=error)
		summary_lines.append("Bahmni Patient Log: FAILED — see HMIS Sync Log")
		_notify_failure(settings, "Bahmni Patient Log", error)

	try:
		fetched, created, updated = sync_bahmni_visits(url, token)
		_log_run("Bahmni", "Success", fetched, created, updated)
		summary_lines.append(f"Bahmni Visit Log: {fetched} fetched, {created} created, {updated} updated")
	except Exception:
		error = frappe.get_traceback()
		_log_run("Bahmni", "Failed", error=error)
		summary_lines.append("Bahmni Visit Log: FAILED — see HMIS Sync Log")
		_notify_failure(settings, "Bahmni Visit Log", error)

	try:
		fetched, created, updated = sync_odoo_invoices(url, token)
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
