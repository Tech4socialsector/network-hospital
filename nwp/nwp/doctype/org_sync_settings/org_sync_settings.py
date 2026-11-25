import time
from datetime import datetime, timedelta

import frappe
import requests
from frappe.model.document import Document
from frappe.utils import cint, get_time, now_datetime, time_diff_in_seconds

# The central site's own receiving endpoint. Called by its full dotted
# path (not a bare short name) — a bare name only resolves for a Server
# Script's own "API Method" field, not a real whitelisted function like
# this one, which every central site in use so far has installed as the
# real app rather than a Server Script workaround.
RECEIVE_RECORD_METHOD = "nwp.api.org_sync.receive_record"
DELETE_RECORD_METHOD = "nwp.api.org_sync.delete_record"
# upload_file and frappe.client.set_value are Frappe's own standard,
# always-available endpoints — used for file attachments specifically,
# since those still can't travel inside the main JSON payload (kept
# consistent regardless of how central runs its own receiving endpoint).
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

# Budgets and disbursements have no approval workflow of their own (unlike
# claims) — every not-yet-pushed row is eligible to push, every run.
BUDGET_FIELDS = [
	"hospital_name", "organization_name", "date_of_approval",
	"financial_year", "start_date", "end_date", "grant_id", "total_budget",
]

DISBURSEMENT_FIELDS = ["date", "hospital_name", "organization", "disbursed_amount"]


class OrgSyncSettings(Document):
	pass


def _should_run_now(settings):
	"""Same tick-and-window scheduling rule as HMIS Sync Settings — kept
	as its own small copy here since Org Sync Settings is a Single
	doctype (one org talks to one central site) and doesn't share the
	HMIS doctype's per-hospital record shape.

	Gated on last_scheduled_run_at, never on last_run_at — the latter
	also updates on a manual "Run Now" click, which would otherwise make
	the scheduler think today's (or this interval's) automatic run had
	already happened and skip it entirely."""
	if settings.sync_frequency == "Daily At A Specific Time":
		if settings.last_scheduled_run_at and settings.last_scheduled_run_at.date() == now_datetime().date():
			return False
		today = now_datetime().date()
		target = datetime.combine(today, get_time(settings.sync_time or "05:00:00"))
		now = datetime.combine(today, now_datetime().time())
		return target <= now < target + timedelta(minutes=15)

	interval_minutes = max(15, cint(settings.poll_interval_minutes) or 60)
	if not settings.last_scheduled_run_at:
		return True
	return time_diff_in_seconds(now_datetime(), settings.last_scheduled_run_at) >= interval_minutes * 60


def _excluded_field_names(rows):
	"""Which fieldnames a Table MultiSelect's rows resolve to — read fresh
	from Org Sync Settings every run, never cached, so a change here takes
	effect on the very next push (or the very next load of the
	transparency page) without needing a code change or redeploy."""
	if not rows:
		return set()
	labels = {row.shareable_field for row in rows}
	fields = frappe.get_all(
		"Org Sync Shareable Field", filters={"name": ["in", list(labels)]}, fields=["field_name"]
	)
	return {f.field_name for f in fields}


def excluded_registration_field_names(settings):
	return _excluded_field_names(settings.excluded_registration_fields)


def excluded_claim_field_names(settings):
	return _excluded_field_names(settings.excluded_claim_fields)


def _mark_dirty_if_shared_field_changed(doc, fields):
	"""An edit to a field we actually share, made AFTER the record already
	pushed, would otherwise sit on central forever unchanged — central has
	no way to know the organization's own copy moved on. Flips the record
	back to not-yet-pushed so the very next scheduled run re-sends it with
	the correction. Uses db_set (not doc.save()) so this doesn't recurse
	back into on_update, and doesn't touch `modified`/`modified_by`, since
	this is a side-effect of the real edit, not a new edit of its own."""
	if not doc.get("pushed_to_central") or doc.is_new():
		return
	if not any(doc.has_value_changed(f) for f in fields if doc.meta.has_field(f)):
		return
	doc.db_set("pushed_to_central", 0, update_modified=False)
	doc.db_set("central_push_error", "", update_modified=False)


def mark_registration_dirty(doc, method=None):
	_mark_dirty_if_shared_field_changed(doc, REGISTRATION_FIELDS)


def mark_claim_dirty(doc, method=None):
	_mark_dirty_if_shared_field_changed(doc, CLAIM_FIELDS + CLAIM_FILE_FIELDS)


def mark_budget_dirty(doc, method=None):
	_mark_dirty_if_shared_field_changed(doc, BUDGET_FIELDS)


def mark_disbursement_dirty(doc, method=None):
	_mark_dirty_if_shared_field_changed(doc, DISBURSEMENT_FIELDS)


def log_deletion_for_sync(doc, method=None):
	"""A record deleted here after it already reached central would
	otherwise leave a stale copy on central forever — this sync only ever
	pushed new/changed data, nothing ever told central a record was gone.
	Only logs it if central actually has a copy to remove (central_pushed_at
	set at some point); a record deleted before it ever synced needs no
	message sent anywhere."""
	if not doc.get("central_pushed_at"):
		return
	frappe.get_doc(
		{
			"doctype": "Org Sync Deletion",
			"reference_doctype": doc.doctype,
			"record_name": doc.name,
		}
	).insert(ignore_permissions=True)


def _auth_headers(settings):
	api_secret = settings.get_password("api_secret", raise_exception=False)
	# No Expect header here on purpose — `requests` never sends one of its
	# own accord (confirmed by inspecting the raw request on the wire), so
	# explicitly setting "Expect": "" doesn't suppress anything; it just
	# puts a literal blank Expect header on every request, which is what
	# was actually causing some servers to reject the push with a 417
	# Expectation Failed in the first place.
	return {"Authorization": f"token {settings.api_key}:{api_secret}"}


def _validate_files(doc, file_fields):
	"""Checked and must raise BEFORE anything is sent to central — a file
	problem has to block the claim's entire push, not just its own file
	field. Run too late (after the main record already pushed, which is
	how this worked originally), a wrong file value still left the rest
	of the claim's data sitting on central even though the push as a
	whole showed "Failed" locally — a quiet partial success masquerading
	as a full failure. Pure validation, no network calls, so it's safe to
	run first."""
	for fieldname in file_fields:
		file_url = doc.get(fieldname)
		if not file_url:
			# Genuinely blank is "nothing uploaded yet", not bad data —
			# allowed through same as always.
			continue
		if not frappe.db.exists("File", {"file_url": file_url}):
			# Seen in real data: a bad import once put something that
			# isn't a real file path (e.g. a date) into an attachment
			# field.
			label = doc.meta.get_label(fieldname)
			frappe.throw(
				f"'{label}' does not have a valid file attached (found {file_url!r} instead of "
				f"a real document). Please re-upload the correct file on this claim before it "
				f"can sync to central."
			)


def _upload_files(settings, doctype, central_name, doc, file_fields):
	"""Sends each attached file through Frappe's own standard, always-
	available file-upload endpoint — never through our custom JSON payload,
	since a Server Script (what central runs when it doesn't have this app
	installed) can't decode base64 content at all. Uploading alone only
	creates the File record; it doesn't link it back to the parent's own
	field (confirmed — same standard endpoint the Desk UI itself uses), so
	a second, equally standard call sets that field explicitly. Files are
	already known-valid by the time this runs — _validate_files() checked
	before the main record was ever pushed."""
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


def _extract_error_message(response):
	"""Frappe's own error responses carry the real, specific reason in
	the response body (usually under _server_messages) — requests' own
	HTTPError string never includes it, only the generic status line."""
	try:
		body = response.json()
	except ValueError:
		return (response.text or str(response.status_code))[:500]

	server_messages = body.get("_server_messages")
	if server_messages:
		try:
			parsed = [frappe.parse_json(m).get("message", m) for m in frappe.parse_json(server_messages)]
			if parsed:
				return " | ".join(parsed)
		except Exception:
			pass

	return body.get("exception") or body.get("message") or str(response.status_code)


def _push(settings, doctype, name, fields, file_fields=None, source_prid=None):
	doc = frappe.get_doc(doctype, name)
	if file_fields:
		# Must happen before any network call — a bad file blocks the
		# WHOLE push, not just its own field (see _validate_files).
		_validate_files(doc, file_fields)
	payload = {f: doc.get(f) for f in fields}

	body = {"doctype": doctype, "source_name": name, "data": payload}
	if source_prid:
		# The claim's own linked registration, by its ORG-side name — not
		# meaningful to central on its own, but lets central look up which
		# of ITS OWN registration copies (same source_org) to link this
		# claim to, instead of blindly reusing the org's prid value.
		body["source_prid"] = source_prid

	url = settings.central_url.rstrip("/") + f"/api/method/{RECEIVE_RECORD_METHOD}"
	# frappe.as_json(), not json=body — a Date/Datetime field (e.g.
	# date_of_visit) comes back from doc.get() as a real Python date
	# object, which plain json.dumps() (what requests' own json= uses)
	# can't serialize at all; Frappe's own as_json() already knows how.
	headers = {**_auth_headers(settings), "Content-Type": "application/json"}
	data = frappe.as_json(body)

	# Up to 3 attempts with a fresh connection each time ("Connection:
	# close") — cheap insurance against an occasional real network blip,
	# though the actual cause of most failures turned out to be a real
	# validation error (see _resolve_claim_links), not a transient one.
	last_error = None
	for attempt in range(3):
		try:
			response = requests.post(
				url, data=data, headers={**headers, "Connection": "close"}, timeout=30
			)
			response.raise_for_status()
			break
		except requests.exceptions.HTTPError as e:
			# requests' own HTTPError message ("417 Client Error: ...")
			# never includes the response BODY — which is exactly where
			# Frappe puts the real, specific reason for the failure. This
			# is what kept the actual cause hidden for a long time.
			last_error = Exception(_extract_error_message(e.response) if e.response is not None else str(e))
			if e.response is not None and e.response.status_code == 417 and attempt < 2:
				time.sleep(2)
				continue
			raise last_error
	else:
		raise last_error

	result = response.json().get("message", {})
	if not result.get("ok"):
		raise Exception(result.get("error") or "Central site rejected the record.")

	if file_fields:
		_upload_files(settings, doctype, result["name"], doc, file_fields)


def _notify_progress(notify_user, done, total):
	if not notify_user or not total:
		return
	frappe.publish_realtime(
		"progress",
		{
			"title": "Pushing to central",
			"progress": [done, total],
			"description": f"{done} of {total} records processed",
		},
		user=notify_user,
	)


def _push_unsent_simple(settings, doctype, fields, notify_user, done_steps, total_steps):
	"""Pushes every not-yet-pushed row of a doctype that — unlike claims —
	has no approval gate and no dependency on another record already being
	on central (budgets and disbursements are both this simple: just push
	whatever hasn't gone yet)."""
	pushed = 0
	errors = []
	names = frappe.get_all(doctype, filters={"pushed_to_central": 0}, pluck="name")

	for i, name in enumerate(names):
		if i % 50 == 0:
			frappe.db.commit()
		done_steps += 1
		_notify_progress(notify_user, done_steps, total_steps)
		try:
			_push(settings, doctype, name, fields)
			frappe.db.set_value(
				doctype,
				name,
				{"pushed_to_central": 1, "central_push_error": "", "central_pushed_at": now_datetime()},
			)
			pushed += 1
		except Exception as e:
			frappe.db.set_value(doctype, name, "central_push_error", str(e)[:2000])
			errors.append(f"{doctype} {name}: FAILED")

	return pushed, done_steps, errors


def _push_deletions(settings, notify_user, done_steps, total_steps):
	"""Tells central to remove its own copy of anything deleted here after
	it already synced — this sync otherwise only ever pushes new/changed
	data, so a deletion would silently leave a stale copy on central
	forever with nothing to ever clean it up."""
	pending = frappe.get_all(
		"Org Sync Deletion", filters={"sent_to_central": 0}, fields=["name", "reference_doctype", "record_name"]
	)
	url = settings.central_url.rstrip("/") + f"/api/method/{DELETE_RECORD_METHOD}"
	sent = 0
	errors = []

	for i, d in enumerate(pending):
		if i % 50 == 0:
			frappe.db.commit()
		done_steps += 1
		_notify_progress(notify_user, done_steps, total_steps)
		try:
			response = requests.post(
				url,
				data={"doctype": d.reference_doctype, "source_name": d.record_name},
				headers={**_auth_headers(settings), "Connection": "close"},
				timeout=30,
			)
			response.raise_for_status()
			result = response.json().get("message", {})
			if not result.get("ok"):
				raise Exception(result.get("error") or "Central site rejected the delete.")
			frappe.db.set_value("Org Sync Deletion", d.name, {"sent_to_central": 1, "central_delete_error": ""})
			sent += 1
		except Exception as e:
			frappe.db.set_value("Org Sync Deletion", d.name, "central_delete_error", str(e)[:2000])
			errors.append(f"{d.reference_doctype} {d.record_name}: delete FAILED")

	return sent, done_steps, errors


def push_approved_records(settings=None, notify_user=None):
	"""Pushes every not-yet-pushed, Approved Patient Claim Form (and the
	Patient Registration it links to) to the central site, plus every
	not-yet-pushed Network Hospital Budget and Budget Disbursement row (no
	approval gate on those — they push every run). Registrations go first,
	since a claim's own push assumes its registration already exists on
	central."""
	settings = settings or frappe.get_single("Org Sync Settings")
	excluded_registration = excluded_registration_field_names(settings)
	excluded_claim = excluded_claim_field_names(settings)
	registration_fields = [f for f in REGISTRATION_FIELDS if f not in excluded_registration]
	claim_fields = [f for f in CLAIM_FIELDS if f not in excluded_claim]
	claim_file_fields = [f for f in CLAIM_FILE_FIELDS if f not in excluded_claim]

	pushed_registrations = pushed_claims = 0
	errors = []

	claims = frappe.get_all(
		"Patient Claim Form",
		filters={"approval_status": "Approved", "pushed_to_central": 0},
		fields=["name", "prid"],
	)

	registration_names = list({c.prid for c in claims if c.prid})
	budget_count = frappe.db.count("Network Hospital Budget", filters={"pushed_to_central": 0})
	disbursement_count = frappe.db.count("Budget Disbursement", filters={"pushed_to_central": 0})
	deletion_count = frappe.db.count("Org Sync Deletion", filters={"sent_to_central": 0})
	total_steps = len(registration_names) + len(claims) + budget_count + disbursement_count + deletion_count
	done_steps = 0

	for i, reg_name in enumerate(registration_names):
		if i % 50 == 0:
			# Commit as we go, not just once at the very end — a large
			# backlog can take long enough that the job gets stopped
			# before finishing; without this, none of that work would be
			# saved even though it genuinely succeeded.
			frappe.db.commit()
		done_steps += 1
		_notify_progress(notify_user, done_steps, total_steps)
		if frappe.db.get_value("Patient Registration", reg_name, "pushed_to_central"):
			continue
		try:
			_push(settings, "Patient Registration", reg_name, registration_fields)
			frappe.db.set_value(
				"Patient Registration",
				reg_name,
				{"pushed_to_central": 1, "central_push_error": "", "central_pushed_at": now_datetime()},
			)
			pushed_registrations += 1
		except Exception as e:
			# str(e) is the actual reason ("A Patient Registration with
			# Patient ID 'X' already exists.", a timeout, an HTTP error,
			# etc) — frappe.get_traceback()[:140] kept only the stack
			# trace's opening file-path lines and cut off before the
			# message itself, which is always at the end, leaving nothing
			# actionable on screen.
			frappe.db.set_value("Patient Registration", reg_name, "central_push_error", str(e)[:2000])
			errors.append(f"Patient Registration {reg_name}: FAILED")

	for i, c in enumerate(claims):
		if i % 50 == 0:
			frappe.db.commit()
		done_steps += 1
		_notify_progress(notify_user, done_steps, total_steps)
		if c.prid and frappe.db.get_value("Patient Registration", c.prid, "central_push_error"):
			# This claim's own registration just failed to push — pushing
			# the claim now would arrive with no registration to link to
			# on central. Skip it this run; picked up automatically once
			# the registration push succeeds.
			continue
		try:
			_push(settings, "Patient Claim Form", c.name, claim_fields, claim_file_fields, source_prid=c.prid)
			frappe.db.set_value(
				"Patient Claim Form",
				c.name,
				{"pushed_to_central": 1, "central_push_error": "", "central_pushed_at": now_datetime()},
			)
			pushed_claims += 1
		except Exception as e:
			frappe.db.set_value("Patient Claim Form", c.name, "central_push_error", str(e)[:2000])
			errors.append(f"Patient Claim Form {c.name}: FAILED")

	pushed_budgets, done_steps, budget_errors = _push_unsent_simple(
		settings, "Network Hospital Budget", BUDGET_FIELDS, notify_user, done_steps, total_steps
	)
	errors += budget_errors

	pushed_disbursements, done_steps, disbursement_errors = _push_unsent_simple(
		settings, "Budget Disbursement", DISBURSEMENT_FIELDS, notify_user, done_steps, total_steps
	)
	errors += disbursement_errors

	pushed_deletions, done_steps, deletion_errors = _push_deletions(settings, notify_user, done_steps, total_steps)
	errors += deletion_errors

	frappe.db.commit()
	summary = (
		f"Patient Registration: {pushed_registrations} pushed | Patient Claim Form: {pushed_claims} pushed"
		f" | Network Hospital Budget: {pushed_budgets} pushed | Budget Disbursement: {pushed_disbursements} pushed"
		f" | Deletions: {pushed_deletions} sent"
	)
	if errors:
		# The full reason for each failure is already saved on that record's
		# own central_push_error field — this is just a short recap for the
		# run history, so it must stay well under the column's limit even
		# when hundreds or thousands of records fail in one run.
		shown = errors[:20]
		summary += " | " + " | ".join(shown)
		if len(errors) > len(shown):
			summary += f" | ...and {len(errors) - len(shown)} more"
	summary = summary[:60000]
	# A short, one-line version for "Last Run Status" on the settings form
	# itself — just the counts, nothing to scroll through. Full detail
	# (per-record reasons) belongs in Central Sync Status / Org Sync Log,
	# not repeated here.
	short_summary = (
		f"Patient Registration: {pushed_registrations} pushed | Patient Claim Form: {pushed_claims} pushed"
		f" | Budget: {pushed_budgets} pushed | Disbursement: {pushed_disbursements} pushed"
		f" | Deletions: {pushed_deletions} sent"
	)
	if errors:
		short_summary += f" | {len(errors)} failed"
	return {
		"registrations_pushed": pushed_registrations,
		"deletions_pushed": pushed_deletions,
		"claims_pushed": pushed_claims,
		"budgets_pushed": pushed_budgets,
		"disbursements_pushed": pushed_disbursements,
		"failed_count": len(errors),
		"summary": summary,
		"short_summary": short_summary,
	}


@frappe.whitelist()
def run_now():
	"""Queues the push instead of running it inline — with a large backlog,
	each record needs a real network round-trip to central, so running
	this directly in the web request that the Run Now button triggers can
	easily take longer than the browser/server will wait for, showing as
	a timeout even though the work would have kept going. Running in the
	background removes that limit entirely; check Central Sync Status or
	Org Sync Log shortly afterward for the result."""
	frappe.only_for("System Manager")
	frappe.enqueue(
		scheduled_push, queue="long", timeout=3600, manual=True, notify_user=frappe.session.user
	)
	return "Sync queued — watch the progress bar, or check Central Sync Status / Org Sync Log shortly for the result."


@frappe.whitelist()
def retry_failed_slowly():
	"""Diagnostic/recovery tool for records still failing after a normal
	run — re-attempts only those, one at a time, with a real pause
	between each, well away from the speed of a big bulk push. Tells
	apart "these specific records have a genuine, lasting problem" from
	"sending this many requests this fast is itself what central/its
	infrastructure doesn't like" — the two look identical in a bulk
	run's results, but call for completely different fixes."""
	frappe.only_for("System Manager")
	frappe.enqueue(_retry_failed_slowly, queue="long", timeout=3600, notify_user=frappe.session.user)
	return "Retrying currently-failing records slowly, one at a time — watch the progress bar for the result."


def _retry_failed_slowly(notify_user=None):
	settings = frappe.get_single("Org Sync Settings")
	if not settings.enable_sync:
		return
	excluded_registration = excluded_registration_field_names(settings)
	excluded_claim = excluded_claim_field_names(settings)
	registration_fields = [f for f in REGISTRATION_FIELDS if f not in excluded_registration]
	claim_fields = [f for f in CLAIM_FIELDS if f not in excluded_claim]
	claim_file_fields = [f for f in CLAIM_FILE_FIELDS if f not in excluded_claim]

	failing_regs = frappe.get_all(
		"Patient Registration",
		filters={"pushed_to_central": 0, "central_push_error": ["is", "set"]},
		pluck="name",
	)
	failing_claims = frappe.get_all(
		"Patient Claim Form",
		filters={"pushed_to_central": 0, "central_push_error": ["is", "set"]},
		fields=["name", "prid"],
	)

	total = len(failing_regs) + len(failing_claims)
	done = succeeded = 0

	for reg_name in failing_regs:
		done += 1
		_notify_progress(notify_user, done, total)
		try:
			_push(settings, "Patient Registration", reg_name, registration_fields)
			frappe.db.set_value(
				"Patient Registration",
				reg_name,
				{"pushed_to_central": 1, "central_push_error": "", "central_pushed_at": now_datetime()},
			)
			succeeded += 1
		except Exception as e:
			frappe.db.set_value("Patient Registration", reg_name, "central_push_error", str(e)[:2000])
		frappe.db.commit()
		time.sleep(5)

	for c in failing_claims:
		done += 1
		_notify_progress(notify_user, done, total)
		try:
			_push(settings, "Patient Claim Form", c.name, claim_fields, claim_file_fields, source_prid=c.prid)
			frappe.db.set_value(
				"Patient Claim Form",
				c.name,
				{"pushed_to_central": 1, "central_push_error": "", "central_pushed_at": now_datetime()},
			)
			succeeded += 1
		except Exception as e:
			frappe.db.set_value("Patient Claim Form", c.name, "central_push_error", str(e)[:2000])
		frappe.db.commit()
		time.sleep(5)

	if notify_user:
		frappe.publish_realtime(
			"org_sync_push_complete",
			{"title": "Slow Retry Complete", "message": f"{succeeded} of {total} succeeded this time."},
			user=notify_user,
		)


def _log_run(result):
	pushed_anything = (
		result["registrations_pushed"]
		or result["claims_pushed"]
		or result["budgets_pushed"]
		or result["disbursements_pushed"]
		or result["deletions_pushed"]
	)
	status = "Success" if not result["failed_count"] else ("Failed" if not pushed_anything else "Partial Failure")
	frappe.get_doc(
		{
			"doctype": "Org Sync Log",
			"run_at": now_datetime(),
			"status": status,
			"registrations_pushed": result["registrations_pushed"],
			"claims_pushed": result["claims_pushed"],
			"budgets_pushed": result["budgets_pushed"],
			"disbursements_pushed": result["disbursements_pushed"],
			"deletions_pushed": result["deletions_pushed"],
			"failed_count": result["failed_count"],
			"summary": result["summary"],
		}
	).insert(ignore_permissions=True)
	return status


def _maybe_send_failure_alert(settings, status):
	"""Fires exactly once when the failure streak first reaches the
	threshold — not on every run after that — so a broken sync doesn't
	spam the inbox for as long as it stays broken. A later success (which
	breaks the streak) re-arms it for next time."""
	if not settings.alert_email or status == "Success":
		return
	threshold = cint(settings.failure_alert_threshold) or 3
	recent = frappe.get_all(
		"Org Sync Log", fields=["status"], order_by="run_at desc", limit_page_length=threshold
	)
	streak = 0
	for row in recent:
		if row.status == "Success":
			break
		streak += 1
	if streak != threshold:
		return
	frappe.sendmail(
		recipients=[settings.alert_email],
		subject="NWP: Central sync has failed for several runs in a row",
		message=(
			f"The push to central has now failed or partially failed {threshold} runs in a row.<br>"
			f"Latest run: {settings.last_run_status}<br><br>"
			"Check Central Sync Status or Org Sync Log for details."
		),
	)


def scheduled_push(manual=False, notify_user=None):
	settings = frappe.get_single("Org Sync Settings")
	if not settings.enable_sync:
		return None
	if not manual and not _should_run_now(settings):
		return None

	try:
		result = push_approved_records(settings, notify_user=notify_user)
	except Exception:
		error_summary = "FAILED — " + frappe.get_traceback()[:200]
		result = {
			"registrations_pushed": 0,
			"claims_pushed": 0,
			"budgets_pushed": 0,
			"disbursements_pushed": 0,
			"deletions_pushed": 0,
			"failed_count": 1,
			"summary": error_summary,
			"short_summary": error_summary,
		}

	settings.db_set("last_run_at", now_datetime())
	settings.db_set("last_run_status", result["short_summary"])
	if not manual:
		settings.db_set("last_scheduled_run_at", now_datetime())
	frappe.db.commit()

	status = _log_run(result)
	_maybe_send_failure_alert(settings, status)
	frappe.db.commit()

	if notify_user:
		frappe.publish_realtime(
			"org_sync_push_complete",
			{"title": "Push Complete", "message": result["short_summary"]},
			user=notify_user,
		)
	return result["summary"]
