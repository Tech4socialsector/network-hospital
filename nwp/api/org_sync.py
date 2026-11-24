import base64

import frappe

ALLOWED_DOCTYPES = {"Patient Registration", "Patient Claim Form"}


def _source_org():
	"""Organization identity comes from WHO is authenticated (the API
	user tied to their key+secret), never from anything in the request
	body — so one organization can never claim to be another just by
	putting a different name in the payload."""
	org = frappe.db.get_value("Sync Partner Organization", {"api_user": frappe.session.user})
	if not org:
		frappe.throw("This API user is not registered as a Sync Partner Organization.")
	return org


def _get_or_create_link(doctype, value, filters=None):
	"""Central aggregates from many different organizations, each of which
	can introduce a state/district/hospital name central has never seen
	before — so a missing Link target here isn't an error, it just means
	this is the first time this particular value has arrived. Creates it
	as a bare master record (named exactly as pushed) rather than
	rejecting the whole record."""
	if not value:
		return value
	existing = frappe.db.get_value(doctype, {"name": value, **(filters or {})})
	if existing:
		return existing
	doc = frappe.new_doc(doctype)
	doc.name = value
	if filters:
		doc.update(filters)
	doc.insert(ignore_permissions=True)
	if doc.name != value:
		# A doctype with no explicit "autoname" rule (e.g. Hospital With
		# Organization) silently ignores a pre-set name and generates a
		# random hash instead — force it to the intended name afterward.
		frappe.rename_doc(doctype, doc.name, value, force=True)
	return value


def _resolve_registration_links(data):
	"""Patient Registration links to State List / District List / Hospital
	With Organization — all three can be brand new to central the first
	time any given organization's data arrives."""
	if data.get("state"):
		data["state"] = _get_or_create_link("State List", data["state"])
	if data.get("district"):
		data["district"] = _get_or_create_link(
			"District List", data["district"], {"state": data.get("state")} if data.get("state") else None
		)
	if data.get("hospital_name"):
		data["hospital_name"] = _get_or_create_link("Hospital With Organization", data["hospital_name"])


def _resolve_claim_links(data):
	"""Patient Claim Form links to Type of service / Doctor / Approve
	Status — same situation as the registration's own links. Approval
	Status is normally a small fixed set ("Approved" etc.) that should
	already exist from the app's own setup, but auto-creating it here too
	means a claim never gets rejected just because central's own fixture
	data hasn't been seeded yet."""
	if data.get("type_of_service"):
		data["type_of_service"] = _get_or_create_link("Type of service", data["type_of_service"])
	if data.get("treating_doctor_name"):
		data["treating_doctor_name"] = _get_or_create_link("Doctor", data["treating_doctor_name"])
	if data.get("approval_status"):
		data["approval_status"] = _get_or_create_link("Approve Status", data["approval_status"])


def _attach_file(doctype, docname, fieldname, file_payload):
	if not file_payload:
		return None
	content = base64.b64decode(file_payload["content_base64"])
	file_doc = frappe.get_doc(
		{
			"doctype": "File",
			"file_name": file_payload["file_name"],
			"attached_to_doctype": doctype,
			"attached_to_name": docname,
			"attached_to_field": fieldname,
			"content": content,
			"is_private": 1,
		}
	)
	file_doc.insert(ignore_permissions=True)
	return file_doc.file_url


def _upsert(doctype, source_org, source_name, data, natural_key_filters=None):
	existing = frappe.db.get_value(doctype, {"source_org": source_org, "source_name": source_name})

	if not existing and natural_key_filters:
		# Covers data that reached central some other way before this
		# organization ever synced it — e.g. a hand-imported Excel
		# baseline of existing patients. Only ever matches a record with
		# no source_org of its own (never synced via the API by anyone),
		# so this can never reassign or overwrite another organization's
		# already-synced record just because of a coincidentally shared
		# Patient ID.
		existing = frappe.db.get_value(doctype, natural_key_filters)

	if existing:
		data = dict(data, source_org=source_org, source_name=source_name)
		frappe.db.set_value(doctype, existing, data)
		return existing

	doc = frappe.new_doc(doctype)
	doc.update(data)
	doc.source_org = source_org
	doc.source_name = source_name
	doc.insert(ignore_permissions=True)
	return doc.name


@frappe.whitelist(methods=["POST"])
def receive_record(doctype, source_name, data, files=None, source_prid=None):
	if doctype not in ALLOWED_DOCTYPES:
		return {"ok": False, "error": f"'{doctype}' is not synced to central."}

	source_org = _source_org()
	data = frappe.parse_json(data) if isinstance(data, str) else dict(data or {})
	files = frappe.parse_json(files) if isinstance(files, str) else (files or {})

	if doctype == "Patient Registration":
		_resolve_registration_links(data)

	if doctype == "Patient Claim Form":
		_resolve_claim_links(data)
		if source_prid:
			central_prid = frappe.db.get_value(
				"Patient Registration", {"source_org": source_org, "source_name": source_prid}
			)
			if not central_prid:
				return {
					"ok": False,
					"error": f"Registration '{source_prid}' for this claim hasn't synced to central yet.",
				}
			data["prid"] = central_prid

	natural_key_filters = None
	if doctype == "Patient Registration" and data.get("patient_id"):
		# A real patient keeps exactly one Patient Registration for life, so
		# Patient ID is a safe natural key here. Patient Claim Form has no
		# equivalent — one patient can have several genuinely separate
		# claims, so a Patient ID match alone can't tell "the same claim
		# synced twice" apart from "a new visit" — it always inserts fresh.
		natural_key_filters = {"patient_id": data["patient_id"], "source_org": ["is", "not set"]}

	name = _upsert(doctype, source_org, source_name, data, natural_key_filters)

	for fieldname, file_payload in files.items():
		file_url = _attach_file(doctype, name, fieldname, file_payload)
		if file_url:
			frappe.db.set_value(doctype, name, fieldname, file_url)

	frappe.db.commit()
	return {"ok": True, "name": name}
