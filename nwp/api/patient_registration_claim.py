# HMIS API: hospital systems send Patient Registrations and Patient Claim Forms into NWP.

import hashlib
import re
from datetime import date

import frappe
from frappe import _
from frappe.utils import cint, getdate, today

# ── Access ──────────────────────────────────────────────────────────────────

# Role a hospital's API user must have. It needs NO DocType permissions: the API checks the
# hospital itself and saves on the user's behalf, so the key cannot be used on /api/resource.
API_ROLE = "NWP HMIS API"

# Roles that may use the API for any hospital (NWP admins, testing).
ADMIN_ROLES = ("System Manager",)

# ── Patient Registration ────────────────────────────────────────────────────

PATIENT_DOCTYPE = "Patient Registration"

GENDERS = ("Male", "Female", "Others")
YES_NO = ("Yes", "No")
MODES_OF_IDENTIFICATION = ("Hospital-based", "Community-based")

# Registration fields the hospital must send.
PATIENT_REQUIRED = ("patient_id", "hospital_name", "name1", "age", "gender", "district", "state")

# Registration fields the hospital is allowed to set (all other fields stay NWP-only).
PATIENT_WRITABLE = (
	"patient_id",
	"hospital_name",
	"name1",
	"age",
	"gender",
	"village_name",
	"block",
	"district",
	"state",
	"pincode",
	"pmjay_registered",
	"mode_of_identification",
)


# Registration API: POST /api/method/nwp.api.patient_registration_claim.patient_registration
@frappe.whitelist(methods=["POST"])
def patient_registration(**data):
	"""Create or update one Patient Registration from HMIS data."""
	allowed = _allowed_hospitals()
	if allowed is False:
		return _not_permitted("hospital_name")

	errors = _Errors()
	values = _clean(data, PATIENT_WRITABLE, errors)

	# Hospital check first, so nothing about another hospital is looked up or revealed.
	if "hospital_name" in values and allowed is not None and values["hospital_name"] not in allowed:
		return _not_permitted("hospital_name")

	_validate_patient(values, errors)
	if errors.items:
		return _error(422, "VALIDATION_ERROR", errors.items)

	busy = _lock(f"patient:{values['hospital_name']}:{values['patient_id']}")
	if busy:
		return busy

	# for_update reads the latest saved data, not this request's older snapshot, so a record
	# created by a request that held the lock just before this one is found and updated.
	existing = frappe.db.get_value(
		PATIENT_DOCTYPE,
		{"patient_id": values["patient_id"], "hospital_name": values["hospital_name"]},
		for_update=True,
	)
	if existing:
		doc = frappe.get_doc(PATIENT_DOCTYPE, existing)
	else:
		doc = frappe.new_doc(PATIENT_DOCTYPE)
		values.setdefault("mode_of_identification", "Hospital-based")

	doc.update(values)
	failure = _save(doc)
	if failure:
		return failure

	return _success(
		created=not existing,
		nwp_patient_id=doc.name,
		patient_id=doc.patient_id,
		registration_status=doc.document_status,
	)


# Registration validation: checks every patient field and adds all errors at once.
def _validate_patient(values, errors):
	errors.required(values, PATIENT_REQUIRED)

	if "age" in values:
		age = _to_int(values["age"])
		if age is None or age > 120:
			errors.add("age", _("Must be a whole number from 0 to 120"))
		else:
			values["age"] = age

	for field, allowed in (
		("gender", GENDERS),
		("pmjay_registered", YES_NO),
		("mode_of_identification", MODES_OF_IDENTIFICATION),
	):
		errors.one_of(values, field, allowed)

	if "pincode" in values:
		values["pincode"] = str(values["pincode"])
		if not re.fullmatch(r"\d{6}", values["pincode"]):
			errors.add("pincode", _("Must be exactly 6 digits"))

	for field in ("patient_id", "name1", "village_name", "block"):
		if field in values and len(str(values[field])) > 140:
			errors.add(field, _("Must be 140 characters or fewer"))

	errors.exists(values, "hospital_name", "Hospital With Organization")
	errors.exists(values, "state", "State List")
	errors.exists(values, "district", "District List")

	if "district" in values and "state" in values and not errors.has("district", "state"):
		district_state = frappe.db.get_value("District List", values["district"], "state")
		if district_state and district_state != values["state"]:
			errors.add(
				"district",
				_("'{0}' belongs to {1}, not {2}").format(values["district"], district_state, values["state"]),
			)


# ── Patient Claim Form ──────────────────────────────────────────────────────

CLAIM_DOCTYPE = "Patient Claim Form"
IN_PATIENT_SERVICE = "In Patient Service"

# Approval status every new claim starts with; any other status means NWP has started review (claim locked).
PENDING_APPROVAL = "Pending for approval"

# Claim fields the hospital must send.
CLAIM_REQUIRED = (
	"prid",
	"date_of_visit",
	"type_of_service",
	"treatment_category",
	"treating_doctor_name",
	"final_diagnosis",
	"total_actual_final_bill_in_rs",
	"invoice_number",
)

# Claim fields the hospital is allowed to set (contributions are calculated, never taken from the request).
CLAIM_WRITABLE = (
	"prid",
	"date_of_visit",
	"date_of_discharge",
	"type_of_service",
	"treatment_category",
	"if_other_treatment_please_mention",
	"treating_doctor_name",
	"final_diagnosis",
	"why_this_patient_is_eligible_for_subsidy_for_this_service",
	"total_actual_final_bill_in_rs",
	"invoice_number",
	"invoice_date",
	"patient_contribution_yes",
	"additional_hospital_contribution",
	"package_and_service",
	"service_and_rate",
	"does_it_require_apf_contribution",
	"total_bill_at_apf_agreed_rates_mou",
	"justification",
	"other_donor_name",
)

# Claim fields checked as YYYY-MM-DD dates / whole-rupee amounts.
CLAIM_DATE_FIELDS = ("date_of_visit", "date_of_discharge", "invoice_date")
CLAIM_AMOUNT_FIELDS = (
	"total_actual_final_bill_in_rs",
	"patient_contribution_yes",
	"additional_hospital_contribution",
	"total_bill_at_apf_agreed_rates_mou",
)


# Claim Form API: POST /api/method/nwp.api.patient_registration_claim.patient_claim_form
@frappe.whitelist(methods=["POST"])
def patient_claim_form(**data):
	"""Create or update one Patient Claim Form (one per patient visit) from HMIS data."""
	allowed = _allowed_hospitals()
	if allowed is False:
		return _not_permitted("prid")

	errors = _Errors()
	values = _clean(data, CLAIM_WRITABLE, errors)

	# Patient + hospital check first: an unknown patient and another hospital's patient get the
	# same 404, so nothing about other hospitals is revealed.
	patient_hospital = None
	if "prid" in values:
		patient = frappe.db.get_value(PATIENT_DOCTYPE, values["prid"], ["name", "hospital_name"], as_dict=True)
		if not patient or (allowed is not None and patient.hospital_name not in allowed):
			return _error(
				404,
				"PATIENT_NOT_FOUND",
				[{"field": "prid", "message": _("Patient {0} not found; send the patient first").format(values["prid"])}],
			)
		patient_hospital = patient.hospital_name

	_validate_claim(values, errors, patient_hospital)
	if errors.items:
		return _error(422, "VALIDATION_ERROR", errors.items)

	busy = _lock(f"claim:{values['prid']}:{values['date_of_visit']}")
	if busy:
		return busy

	# for_update: latest saved data, so a claim created just before (under the lock) is found.
	existing = frappe.db.get_value(
		CLAIM_DOCTYPE,
		{"prid": values["prid"], "date_of_visit": values["date_of_visit"]},
		["name", "approval_status"],
		as_dict=True,
		for_update=True,
	)
	if existing and existing.approval_status and existing.approval_status != PENDING_APPROVAL:
		return _error(
			409,
			"CLAIM_LOCKED",
			[
				{
					"field": None,
					"message": _("Claim {0} is already under NWP review ({1}); contact the NWP team to change it").format(
						existing.name, existing.approval_status
					),
				}
			],
		)

	doc = frappe.get_doc(CLAIM_DOCTYPE, existing.name) if existing else frappe.new_doc(CLAIM_DOCTYPE)

	rows = values.pop("service_and_rate", None)
	doc.update(values)
	if rows is not None:
		# Sending the list replaces the whole table, so a resend never doubles rows.
		doc.set("service_and_rate", [])
		for row in rows:
			doc.append("service_and_rate", row)

	# Amount checks on the complete claim (saved values + this request), not just this request.
	merged_errors = _validate_merged_claim(doc)
	if merged_errors:
		return _error(422, "VALIDATION_ERROR", merged_errors)

	_calculate_contributions(doc)

	failure = _save(doc)
	if failure:
		return failure

	return _success(
		created=not existing,
		nwp_claim_id=doc.name,
		nwp_patient_id=doc.prid,
		patient_id=doc.patient_id,
		document_status=doc.document_status,
		approval_status=doc.approval_status,
		does_it_require_apf_contribution=doc.does_it_require_apf_contribution,
		total_actual_final_bill_in_rs=cint(doc.total_actual_final_bill_in_rs),
		total_bill_at_apf_agreed_rates_mou=cint(doc.total_bill_at_apf_agreed_rates_mou),
		existing_hospital_contribution=cint(doc.existing_hospital_contribution),
		additional_hospital_contribution=cint(doc.additional_hospital_contribution),
		patient_contribution_yes=cint(doc.patient_contribution_yes),
		apf_contribution=cint(doc.apf_contribution),
		other_donor_contribution=cint(doc.other_donor_contribution),
		other_donor_name=doc.other_donor_name,
	)


# NWP Settings check: is the agreed-rate model switched on?
def _use_agreed_rate_model():
	"""Same switch the claim form reads (NWP Settings): off means there is no
	separate agreed rate, so the agreed bill is simply the actual bill."""
	return cint(frappe.db.get_single_value("NWP Settings", "use_nwp_agreed_rate_model"))


# Contribution calculation: hospital default, NWP and other donor amounts.
def _calculate_contributions(doc):
	"""The claim form's own contribution formula (patient_claim_form.js:
	calculate_all / calculate_apf_contribution / calculate_other_donor_contribution),
	applied here because that script only runs in a browser. Uses the values
	now on the document, so an update that sends only some amounts still
	recalculates from the complete claim."""
	total = cint(doc.total_actual_final_bill_in_rs)
	patient = cint(doc.patient_contribution_yes)
	additional = cint(doc.additional_hospital_contribution)

	if doc.does_it_require_apf_contribution == "Yes":
		if not _use_agreed_rate_model():
			doc.total_bill_at_apf_agreed_rates_mou = total
		agreed = cint(doc.total_bill_at_apf_agreed_rates_mou)
		doc.existing_hospital_contribution = max(0, total - agreed)
		doc.apf_contribution = max(0, agreed - patient - additional)
		doc.other_donor_contribution = 0
		doc.other_donor_name = None  # NWP pays; no other donor on this claim
	elif doc.does_it_require_apf_contribution == "No":
		# The form's controller zeroes the agreed-rate side for "No" on save.
		doc.other_donor_contribution = max(0, total - patient - additional)


# Claim validation: checks every field sent in this request and adds all errors at once.
def _validate_claim(values, errors, patient_hospital):
	errors.required(values, CLAIM_REQUIRED)

	# Only In Patient Service keeps its own discharge date; NWP sets it to the visit date for
	# every other type of service, so a sent value is ignored rather than checked.
	if values.get("type_of_service") != IN_PATIENT_SERVICE:
		values.pop("date_of_discharge", None)

	for field in CLAIM_DATE_FIELDS:
		if field in values:
			parsed = _to_date(values[field])
			if parsed is None:
				errors.add(field, _("Must be a date in YYYY-MM-DD format"))
			else:
				values[field] = parsed

	visit = values.get("date_of_visit")
	discharge = values.get("date_of_discharge")
	if isinstance(visit, date):
		if visit > getdate(today()):
			errors.add("date_of_visit", _("Cannot be a future date"))
		if isinstance(discharge, date) and discharge < visit:
			errors.add("date_of_discharge", _("Cannot be before date_of_visit"))

	if values.get("type_of_service") == IN_PATIENT_SERVICE and "date_of_discharge" not in values:
		if not errors.has("date_of_discharge"):
			errors.add("date_of_discharge", _("Required for In Patient Service"))

	for field in CLAIM_AMOUNT_FIELDS:
		if field in values:
			amount = _to_int(values[field])
			if amount is None:
				errors.add(field, _("Must be a whole number of rupees, 0 or more"))
			else:
				values[field] = amount

	if "invoice_number" in values:
		number = _to_int(values["invoice_number"])
		if number is None:
			errors.add("invoice_number", _("Must contain digits only"))
		else:
			values["invoice_number"] = number

	errors.one_of(values, "does_it_require_apf_contribution", YES_NO)
	errors.exists(values, "other_donor_name", "Other Donor Name")
	errors.exists(values, "type_of_service", "Type of service")
	errors.exists(values, "treatment_category", "Department")
	errors.exists(values, "treating_doctor_name", "Doctor")

	if "service_and_rate" in values:
		values["service_and_rate"] = _validate_service_rows(values["service_and_rate"], patient_hospital, errors)


# Complete-claim validation: funder and amount rules on saved values + this request together.
def _validate_merged_claim(doc):
	errors = _Errors()
	total = cint(doc.total_actual_final_bill_in_rs)
	paid = cint(doc.patient_contribution_yes) + cint(doc.additional_hospital_contribution)
	funded = doc.does_it_require_apf_contribution

	if funded not in YES_NO:
		errors.add("does_it_require_apf_contribution", _("Required: Yes or No"))

	if paid > total:
		errors.add(
			"patient_contribution_yes",
			_("patient_contribution_yes + additional_hospital_contribution ({0}) is more than the total bill ({1})").format(
				paid, total
			),
		)

	if funded == "Yes" and _use_agreed_rate_model():
		agreed = cint(doc.total_bill_at_apf_agreed_rates_mou)
		if not agreed:
			errors.add("total_bill_at_apf_agreed_rates_mou", _("Required when does_it_require_apf_contribution is Yes"))
		elif agreed > total:
			errors.add(
				"total_bill_at_apf_agreed_rates_mou",
				_("NWP agreed-rate bill ({0}) cannot be more than the total bill ({1})").format(agreed, total),
			)
		elif paid > agreed:
			errors.add(
				"patient_contribution_yes",
				_(
					"patient_contribution_yes + additional_hospital_contribution ({0}) is more than the NWP agreed-rate bill ({1})"
				).format(paid, agreed),
			)

	if funded == "No" and not doc.other_donor_name:
		errors.add("other_donor_name", _("Required when does_it_require_apf_contribution is No"))

	return errors.items


# Service rows validation: agreed services of this patient's hospital, no duplicates.
def _validate_service_rows(rows, patient_hospital, errors):
	if not isinstance(rows, list):
		errors.add("service_and_rate", _("Must be a list"))
		return []

	clean_rows, seen = [], set()
	for i, row in enumerate(rows):
		field = f"service_and_rate[{i}]"
		if not isinstance(row, dict):
			errors.add(field, _("Each entry must be an object with 'service' and 'procedure'"))
			continue
		service = row.get("service")
		if not isinstance(service, str) or not service.strip():
			errors.add(f"{field}.service", _("Required, as text"))
			continue
		service = service.strip()
		procedure = row.get("procedure")
		if procedure is not None and not isinstance(procedure, str):
			errors.add(f"{field}.procedure", _("Must be text"))
			continue
		if service in seen:
			errors.add(f"{field}.service", _("'{0}' is listed more than once").format(service))
			continue
		seen.add(service)

		service_hospital = frappe.db.get_value("Service List and Rates", service, "hospital_name")
		if not service_hospital or (patient_hospital and service_hospital != patient_hospital):
			# Same message whether the service is unknown or another hospital's, so nothing leaks.
			errors.add(f"{field}.service", _("'{0}' is not an agreed service for this hospital").format(service))
			continue

		clean_rows.append({"service": service, "procedure": procedure.strip() if procedure else procedure})
	return clean_rows


# ── Shared helpers ──────────────────────────────────────────────────────────


# Hospital access: None = any hospital (NWP admin), a set = only these hospitals, False = not allowed.
def _allowed_hospitals():
	roles = frappe.get_roles()
	if any(role in roles for role in ADMIN_ROLES):
		return None
	if API_ROLE not in roles:
		return False
	return set(
		frappe.get_all(
			"User Permission",
			filters={"user": frappe.session.user, "allow": "Hospital With Organization"},
			pluck="for_value",
		)
	)


# Request lock: one request at a time per patient / visit, held until this request's transaction ends.
def _lock(key):
	"""Without this, two identical requests arriving together (an HMIS retry after a timeout)
	could both find no record and both create one. Returns an error reply if the lock
	could not be taken, else None."""
	if frappe.db.db_type != "mariadb":
		return None
	name = "hmis_api_" + hashlib.md5(key.encode()).hexdigest()  # MariaDB lock names are limited to 64 characters
	if not frappe.db.sql("SELECT GET_LOCK(%s, 10)", name)[0][0]:
		return _error(
			409, "BUSY", [{"field": None, "message": _("This record is being saved by another request; retry shortly")}]
		)

	# Start a fresh transaction, so this request sees what the request that held the lock before
	# it saved (otherwise it keeps reading its older snapshot and creates a duplicate).
	# Nothing has been written by this request yet, so this commits nothing.
	frappe.db.commit()

	def release():
		frappe.db.sql("SELECT RELEASE_LOCK(%s)", name)

	frappe.db.after_commit.add(release)
	frappe.db.after_rollback.add(release)
	return None


# Error collector: gathers field errors into one list for the reply.
class _Errors:
	def __init__(self):
		self.items = []

	def add(self, field, message):
		self.items.append({"field": field, "message": message})

	def has(self, *fields):
		return any(e["field"] in fields for e in self.items)

	def required(self, values, fields):
		for field in fields:
			if field not in values and not self.has(field):
				self.add(field, _("Required"))

	def one_of(self, values, field, allowed):
		if field in values and values[field] not in allowed:
			self.add(field, _("Must be one of: {0}").format(", ".join(allowed)))

	def exists(self, values, field, doctype):
		if field in values and not frappe.db.exists(doctype, values[field]):
			self.add(field, _("'{0}' is not in NWP's {1}").format(values[field], doctype))


# Input cleaning: keeps only allowed fields, trims text, drops empty values, rejects lists/objects.
def _clean(data, writable, errors):
	values = {}
	for key in writable:
		value = data.get(key)
		if isinstance(value, str):
			value = value.strip()
		if value is None or value == "":
			continue
		# A list or object in a single-value field would be read as a database filter; only
		# service_and_rate may be a list.
		if key != "service_and_rate" and (isinstance(value, bool) or not isinstance(value, (str, int, float))):
			errors.add(key, _("Must be text or a number"))
			continue
		values[key] = value
	return values


# Number check: whole number 0 or more.
def _to_int(value):
	"""A whole number >= 0 from an int, a whole float or a digit string; else None."""
	if isinstance(value, bool):
		return None
	if isinstance(value, int):
		return value if value >= 0 else None
	if isinstance(value, float):
		return int(value) if value.is_integer() and value >= 0 else None
	if isinstance(value, str) and re.fullmatch(r"\d+", value):
		return cint(value)
	return None


# Date check: YYYY-MM-DD only.
def _to_date(value):
	if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
		return None
	try:
		return date.fromisoformat(value)
	except ValueError:
		return None


# Safe save: NWP validations run; permissions are not checked again (the hospital was checked above).
def _save(doc):
	"""Saves on the API user's behalf: the user needs no DocType permission, so its key cannot
	change records through /api/resource. Undoes only this save on failure."""
	frappe.db.savepoint("hmis_api_save")
	try:
		doc.save(ignore_permissions=True)  # insert() for a new doc
	except frappe.ValidationError as e:
		frappe.db.rollback(save_point="hmis_api_save")
		frappe.clear_messages()
		return _error(422, "VALIDATION_ERROR", [{"field": None, "message": str(e)}])
	return None


# Not-permitted reply: the same answer for any hospital the user may not use.
def _not_permitted(field):
	return _error(403, "NOT_PERMITTED", [{"field": field, "message": _("Not permitted for this hospital")}])


# Success reply: status_code 201 (created) or 200 (updated).
def _success(created, **fields):
	status_code = 201 if created else 200
	frappe.local.response["http_status_code"] = status_code
	return {
		"status_code": status_code,
		"status": "success",
		"action": "created" if created else "updated",
		**fields,
	}


# Error reply: status_code, error_code and the list of field errors.
def _error(http_status, code, errors):
	frappe.local.response["http_status_code"] = http_status
	return {"status_code": http_status, "status": "error", "error_code": code, "errors": errors}
