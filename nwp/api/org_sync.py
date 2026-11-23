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


def _upsert(doctype, source_org, source_name, data):
	existing = frappe.db.get_value(doctype, {"source_org": source_org, "source_name": source_name})
	if existing:
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

	if doctype == "Patient Claim Form":
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

	name = _upsert(doctype, source_org, source_name, data)

	for fieldname, file_payload in files.items():
		file_url = _attach_file(doctype, name, fieldname, file_payload)
		if file_url:
			frappe.db.set_value(doctype, name, fieldname, file_url)

	frappe.db.commit()
	return {"ok": True, "name": name}
