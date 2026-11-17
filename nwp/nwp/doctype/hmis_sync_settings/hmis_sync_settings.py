# Copyright (c) 2026, TFSS and contributors
# For license information, please see license.txt

import frappe
import pymysql
import psycopg2
import psycopg2.extras
from frappe.model.document import Document
from frappe.utils import cint, now_datetime

GENDER_MAP = {"M": "Male", "F": "Female", "O": "Others"}

# OpenMRS's standard schema — a fresh registration/person join, read-only.
# Only pulled for a sample preview or for the sync's own small, named
# column list; nothing broader is ever selected.
BAHMNI_PATIENT_QUERY = """
	SELECT p.patient_id,
	       pi.identifier,
	       pn.given_name,
	       pn.family_name,
	       pe.gender,
	       pe.birthdate,
	       pe.date_changed
	FROM patient p
	JOIN person pe ON pe.person_id = p.patient_id
	LEFT JOIN person_name pn ON pn.person_id = p.patient_id AND pn.preferred = 1
	LEFT JOIN patient_identifier pi ON pi.patient_id = p.patient_id AND pi.preferred = 1
	WHERE pe.voided = 0
"""

BAHMNI_VISIT_QUERY = """
	SELECT v.visit_id,
	       v.patient_id,
	       v.date_started,
	       v.date_stopped,
	       vt.name AS visit_type,
	       v.date_changed
	FROM visit v
	LEFT JOIN visit_type vt ON vt.visit_type_id = v.visit_type_id
	WHERE v.voided = 0
"""

ODOO_INVOICE_QUERY = """
	SELECT am.id,
	       am.name,
	       am.invoice_date,
	       am.amount_total,
	       am.ref,
	       am.state,
	       rp.name AS partner_name,
	       am.write_date
	FROM account_move am
	LEFT JOIN res_partner rp ON rp.id = am.partner_id
	WHERE am.move_type = 'out_invoice'
"""


class HMISSyncSettings(Document):
	pass


def _settings():
	return frappe.get_single("HMIS Sync Settings")


def _bahmni_conn(settings):
	return pymysql.connect(
		host=settings.bahmni_db_host,
		port=cint(settings.bahmni_db_port) or 3306,
		user=settings.bahmni_db_username,
		password=settings.get_password("bahmni_db_password", raise_exception=False),
		database=settings.bahmni_db_name,
		connect_timeout=10,
		cursorclass=pymysql.cursors.DictCursor,
	)


def _odoo_conn(settings):
	return psycopg2.connect(
		host=settings.odoo_db_host,
		port=cint(settings.odoo_db_port) or 5432,
		user=settings.odoo_db_username,
		password=settings.get_password("odoo_db_password", raise_exception=False),
		dbname=settings.odoo_db_name,
		connect_timeout=10,
	)


def _test_bahmni(settings):
	if not settings.bahmni_db_host or not settings.bahmni_db_username:
		return {"ok": False, "error": "Bahmni DB Host / Username not set"}
	try:
		conn = _bahmni_conn(settings)
		with conn.cursor() as cur:
			cur.execute("SELECT 1")
		conn.close()
		return {"ok": True}
	except Exception as e:
		return {"ok": False, "error": str(e)}


def _test_odoo(settings):
	if not settings.odoo_db_host or not settings.odoo_db_username:
		return {"ok": False, "error": "Odoo DB Host / Username not set"}
	try:
		conn = _odoo_conn(settings)
		cur = conn.cursor()
		cur.execute("SELECT 1")
		conn.close()
		return {"ok": True}
	except Exception as e:
		return {"ok": False, "error": str(e)}


@frappe.whitelist()
def test_connection():
	frappe.only_for("System Manager")
	settings = _settings()
	return {"bahmni": _test_bahmni(settings), "odoo": _test_odoo(settings)}


@frappe.whitelist()
def preview_bahmni_fields():
	"""Read-only — runs the patient/registration query with LIMIT 1 so the
	actual column values on this Bahmni instance can be checked. Writes
	nothing."""
	frappe.only_for("System Manager")
	settings = _settings()
	conn = _bahmni_conn(settings)
	try:
		with conn.cursor() as cur:
			cur.execute(BAHMNI_PATIENT_QUERY + " LIMIT 1")
			row = cur.fetchone()
	finally:
		conn.close()
	return row or {"message": "No patients found to preview."}


@frappe.whitelist()
def preview_bahmni_visit():
	"""Read-only — runs the visit query with LIMIT 1. Writes nothing."""
	frappe.only_for("System Manager")
	settings = _settings()
	conn = _bahmni_conn(settings)
	try:
		with conn.cursor() as cur:
			cur.execute(BAHMNI_VISIT_QUERY + " ORDER BY v.visit_id DESC LIMIT 1")
			row = cur.fetchone()
	finally:
		conn.close()
	return row or {"message": "No visits found to preview."}


@frappe.whitelist()
def preview_odoo_fields():
	"""Read-only — runs the invoice query with LIMIT 1. Writes nothing."""
	frappe.only_for("System Manager")
	settings = _settings()
	conn = _odoo_conn(settings)
	try:
		cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
		cur.execute(ODOO_INVOICE_QUERY + " ORDER BY am.id DESC LIMIT 1")
		row = cur.fetchone()
	finally:
		conn.close()
	return dict(row) if row else {"message": "No invoices found to preview."}


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


def sync_bahmni_patients(settings):
	"""Best-effort mapping from OpenMRS's standard patient/person schema —
	checked against this instance's real Preview Fields output before
	relying on it. The identifier column used as the match key especially
	needs confirming against the real data (a patient can have more than
	one identifier type)."""
	fetched = created = updated = 0
	match_field = settings.match_field or "patient_id"

	query = BAHMNI_PATIENT_QUERY
	params = []
	from_date = settings.last_bahmni_sync_on or settings.sync_from_date
	if from_date:
		query += " AND pe.date_changed >= %s"
		params.append(from_date)
	if settings.sync_to_date:
		query += " AND pe.date_changed <= %s"
		params.append(settings.sync_to_date)
	query += " ORDER BY pe.date_changed ASC LIMIT %s"
	params.append(cint(settings.batch_size) or 50)

	conn = _bahmni_conn(settings)
	try:
		with conn.cursor() as cur:
			cur.execute(query, params)
			rows = cur.fetchall()
	finally:
		conn.close()

	fetched = len(rows)
	for row in rows:
		identifier_value = row.get("identifier")
		if not identifier_value:
			continue

		existing = frappe.db.get_value("Patient Registration", {match_field: identifier_value}, "name")
		gender = GENDER_MAP.get((row.get("gender") or "").upper(), row.get("gender"))
		display_name = " ".join(filter(None, [row.get("given_name"), row.get("family_name")]))
		values = {
			match_field: identifier_value,
			"name1": display_name,
			"gender": gender,
		}
		if existing:
			frappe.db.set_value("Patient Registration", existing, values)
			updated += 1
		else:
			doc = frappe.new_doc("Patient Registration")
			doc.update(values)
			doc.insert(ignore_permissions=True)
			created += 1

	return fetched, created, updated


def sync_odoo_invoices(settings):
	"""Fetches recent invoices only — does NOT yet create/update Patient
	Claim Form records. We don't yet know how an Odoo invoice references
	the Bahmni/NWP patient on this instance (partner name match? a custom
	field? the invoice reference?), so writing that mapping now would risk
	silently attaching bills to the wrong patient. Confirm the link field
	first."""
	query = ODOO_INVOICE_QUERY
	params = []
	from_date = settings.last_odoo_sync_on or settings.sync_from_date
	if from_date:
		query += " AND am.write_date >= %s"
		params.append(from_date)
	if settings.sync_to_date:
		query += " AND am.write_date <= %s"
		params.append(settings.sync_to_date)
	query += " ORDER BY am.write_date ASC LIMIT %s"
	params.append(cint(settings.batch_size) or 50)

	conn = _odoo_conn(settings)
	try:
		cur = conn.cursor()
		cur.execute(query, params)
		rows = cur.fetchall()
	finally:
		conn.close()

	return len(rows), 0, 0


@frappe.whitelist()
def run_now():
	frappe.only_for("System Manager")
	return scheduled_sync(manual=True)


def scheduled_sync(manual=False):
	settings = _settings()
	if not manual and not settings.enable_hmis_sync:
		return

	summary_lines = []

	try:
		fetched, created, updated = sync_bahmni_patients(settings)
		_log_run("Bahmni", "Success", fetched, created, updated)
		summary_lines.append(f"Bahmni: {fetched} fetched, {created} created, {updated} updated")
		settings.db_set("last_bahmni_sync_on", now_datetime())
	except Exception:
		error = frappe.get_traceback()
		_log_run("Bahmni", "Failed", error=error)
		summary_lines.append("Bahmni: FAILED — see HMIS Sync Log")
		_notify_failure(settings, "Bahmni", error)

	try:
		fetched, created, updated = sync_odoo_invoices(settings)
		_log_run("Odoo", "Success", fetched, created, updated)
		summary_lines.append(f"Odoo: {fetched} invoices fetched (mapping to claims not yet configured)")
		settings.db_set("last_odoo_sync_on", now_datetime())
	except Exception:
		error = frappe.get_traceback()
		_log_run("Odoo", "Failed", error=error)
		summary_lines.append("Odoo: FAILED — see HMIS Sync Log")
		_notify_failure(settings, "Odoo", error)

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
