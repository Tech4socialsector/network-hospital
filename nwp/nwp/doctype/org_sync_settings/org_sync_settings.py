from datetime import datetime, timedelta

import frappe
import requests
from frappe.model.document import Document
from frappe.utils import cint, get_time, now_datetime, time_diff_in_seconds

# The central site's own receiving endpoint — a Server Script (not our app
# code) when central doesn't have this custom app installed, e.g. uat-nwp.
# A Server Script's sandbox can't run "import base64", so file content never
# travels inside this JSON payload — see _upload_files() below instead,
# which uses Frappe's own standard, always-available upload endpoint.
RECEIVE_RECORD_METHOD = "receive_record"
UPLOAD_FILE_METHOD = "upload_file"
SET_VALUE_METHOD = "frappe.client.set_value"

# Exactly what leaves this site for central — an explicit allow-list, not
# "every field", so nothing (assessment answers, internal remarks, a
# draft claim) travels by accident just because a new field gets added to
# either doctype later.
REGISTRATION_FIELDS = [
	"patient_id", "name1", "age", "gender", "village_name", "pincode",
	"state", "district", "block", "hospital_name", "organization",
]

CLAIM_FIELDS = [
	"patient_id", "name1", "gender", "age", "organization",
	"type_of_service", "date_of_visit", "date_of_discharge",
	"treating_doctor_name", "final_diagnosis",
	"total_actual_final_bill_in_rs", "does_it_require_apf_contribution",
	"existing_hospital_contribution", "additional_hospital_contribution",
	"patient_contribution_yes", "apf_contribution",
	"other_donor_contribution", "other_donor_name",
	"invoice_date", "invoice_number", "approval_status",
]

CLAIM_FILE_FIELDS = ["upload_prescription", "upload_final_bill"]


class OrgSyncSettings(Document):
	pass


def _should_run_now(settings):
	"""Same tick-and-window scheduling rule as HMIS Sync Settings — kept
	as its own small copy here since Org Sync Settings is a Single
	doctype (one org talks to one central site) and doesn't share the
	HMIS doctype's per-hospital record shape."""
	if settings.sync_frequency == "Daily At A Specific Time":
		if settings.last_run_at and settings.last_run_at.date() == now_datetime().date():
			return False
		today = now_datetime().date()
		target = datetime.combine(today, get_time(settings.sync_time or "05:00:00"))
		now = datetime.combine(today, now_datetime().time())
		return target <= now < target + timedelta(minutes=15)

	interval_minutes = max(15, cint(settings.poll_interval_minutes) or 60)
	if not settings.last_run_at:
		return True
	return time_diff_in_seconds(now_datetime(), settings.last_run_at) >= interval_minutes * 60


def _auth_headers(settings):
	api_secret = settings.get_password("api_secret", raise_exception=False)
	return {
		"Authorization": f"token {settings.api_key}:{api_secret}",
		# Expect: "" — some servers (including the local dev one) mishandle
		# the "Expect: 100-continue" header requests sends automatically,
		# returning a 417 instead of actually processing the request.
		"Expect": "",
	}


def _upload_files(settings, doctype, central_name, doc, file_fields):
	"""Sends each attached file through Frappe's own standard, always-
	available file-upload endpoint — never through our custom JSON payload,
	since a Server Script (what central runs when it doesn't have this app
	installed) can't decode base64 content at all. Uploading alone only
	creates the File record; it doesn't link it back to the parent's own
	field (confirmed — same standard endpoint the Desk UI itself uses), so
	a second, equally standard call sets that field explicitly."""
	upload_url = settings.central_url.rstrip("/") + f"/api/method/{UPLOAD_FILE_METHOD}"
	set_value_url = settings.central_url.rstrip("/") + f"/api/method/{SET_VALUE_METHOD}"

	for fieldname in file_fields:
		file_url = doc.get(fieldname)
		if not file_url:
			continue
		file_doc = frappe.get_doc("File", {"file_url": file_url})
		content = file_doc.get_content()
		if isinstance(content, str):
			content = content.encode("utf-8")

		response = requests.post(
			upload_url,
			files={"file": (file_doc.file_name, content)},
			data={
				"doctype": doctype,
				"docname": central_name,
				"fieldname": fieldname,
				"is_private": 1,
			},
			headers=_auth_headers(settings),
			timeout=60,
		)
		response.raise_for_status()
		uploaded_file_url = response.json().get("message", {}).get("file_url")

		response = requests.post(
			set_value_url,
			data={
				"doctype": doctype,
				"name": central_name,
				"fieldname": fieldname,
				"value": uploaded_file_url,
			},
			headers=_auth_headers(settings),
			timeout=30,
		)
		response.raise_for_status()


def _push(settings, doctype, name, fields, file_fields=None, source_prid=None):
	doc = frappe.get_doc(doctype, name)
	payload = {f: doc.get(f) for f in fields}

	body = {"doctype": doctype, "source_name": name, "data": payload}
	if source_prid:
		# The claim's own linked registration, by its ORG-side name — not
		# meaningful to central on its own, but lets central look up which
		# of ITS OWN registration copies (same source_org) to link this
		# claim to, instead of blindly reusing the org's prid value.
		body["source_prid"] = source_prid

	url = settings.central_url.rstrip("/") + f"/api/method/{RECEIVE_RECORD_METHOD}"
	response = requests.post(url, json=body, headers=_auth_headers(settings), timeout=30)
	response.raise_for_status()
	result = response.json().get("message", {})
	if not result.get("ok"):
		raise Exception(result.get("error") or "Central site rejected the record.")

	if file_fields:
		_upload_files(settings, doctype, result["name"], doc, file_fields)


def push_approved_records(settings=None):
	"""Pushes every not-yet-pushed, Approved Patient Claim Form (and the
	Patient Registration it links to) to the central site. Registrations
	go first, since a claim's own push assumes its registration already
	exists on central."""
	settings = settings or frappe.get_single("Org Sync Settings")

	pushed_registrations = pushed_claims = 0
	errors = []

	claims = frappe.get_all(
		"Patient Claim Form",
		filters={"approval_status": "Approved", "pushed_to_central": 0},
		fields=["name", "prid"],
	)

	registration_names = {c.prid for c in claims if c.prid}
	for reg_name in registration_names:
		if frappe.db.get_value("Patient Registration", reg_name, "pushed_to_central"):
			continue
		try:
			_push(settings, "Patient Registration", reg_name, REGISTRATION_FIELDS)
			frappe.db.set_value("Patient Registration", reg_name, {"pushed_to_central": 1, "central_push_error": ""})
			pushed_registrations += 1
		except Exception:
			error = frappe.get_traceback()
			frappe.db.set_value("Patient Registration", reg_name, "central_push_error", error[:140])
			errors.append(f"Patient Registration {reg_name}: FAILED")

	for c in claims:
		if c.prid and frappe.db.get_value("Patient Registration", c.prid, "central_push_error"):
			# This claim's own registration just failed to push — pushing
			# the claim now would arrive with no registration to link to
			# on central. Skip it this run; picked up automatically once
			# the registration push succeeds.
			continue
		try:
			_push(settings, "Patient Claim Form", c.name, CLAIM_FIELDS, CLAIM_FILE_FIELDS, source_prid=c.prid)
			frappe.db.set_value("Patient Claim Form", c.name, {"pushed_to_central": 1, "central_push_error": ""})
			pushed_claims += 1
		except Exception:
			error = frappe.get_traceback()
			frappe.db.set_value("Patient Claim Form", c.name, "central_push_error", error[:140])
			errors.append(f"Patient Claim Form {c.name}: FAILED")

	frappe.db.commit()
	summary = f"Patient Registration: {pushed_registrations} pushed | Patient Claim Form: {pushed_claims} pushed"
	if errors:
		summary += " | " + " | ".join(errors)
	return summary


@frappe.whitelist()
def run_now():
	frappe.only_for("System Manager")
	return scheduled_push(manual=True)


def scheduled_push(manual=False):
	settings = frappe.get_single("Org Sync Settings")
	if not settings.enable_sync:
		return None
	if not manual and not _should_run_now(settings):
		return None

	try:
		summary = push_approved_records(settings)
	except Exception:
		summary = "FAILED — " + frappe.get_traceback()[:200]

	settings.db_set("last_run_at", now_datetime())
	settings.db_set("last_run_status", summary)
	frappe.db.commit()
	return summary
