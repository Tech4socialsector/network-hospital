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
	"""No saved Metabase question is configured to pull from yet — this
	just confirms the Metabase login still works, and logs that, so
	"Run Now"/the scheduler have something real to report instead of
	silently doing nothing. Add the question(s) to pull from, and the
	actual fetch + field-mapping code, once those are decided."""
	settings = _settings()
	if not manual and not settings.enable_hmis_sync:
		return

	try:
		url, token = _metabase_login(settings)
		_metabase_logout(url, token)
		_log_run("Bahmni", "Success", 0, 0, 0)
		settings.db_set("last_run_at", now_datetime())
		settings.db_set("last_run_status", "Metabase login OK — no question configured to sync yet")
		frappe.db.commit()
		return "Metabase login OK — no question configured to sync yet"
	except Exception:
		error = frappe.get_traceback()
		_log_run("Bahmni", "Failed", error=error)
		_notify_failure(settings, "Metabase login", error)
		settings.db_set("last_run_at", now_datetime())
		settings.db_set("last_run_status", "Metabase login FAILED — see HMIS Sync Log")
		frappe.db.commit()
		return "Metabase login FAILED — see HMIS Sync Log"


def _notify_failure(settings, source, error):
	if not settings.send_email_on_failure or not settings.failure_email_recipient:
		return
	frappe.sendmail(
		recipients=[settings.failure_email_recipient],
		subject=f"NWP HMIS Sync Failed — {source}",
		message=f"<pre>{frappe.utils.escape_html(error)}</pre>",
	)
