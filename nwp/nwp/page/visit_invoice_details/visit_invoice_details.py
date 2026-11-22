import frappe

MAX_ROWS = 5000

# A visit's matched invoices are its own (patient_id + invoice falls inside
# the visit's date range), except that on a same-day OPD/IPD collision the
# invoice is attributed to the IPD visit instead — same rule as the
# "Visit Invoice Matching" report, kept in sync with it.
#
# The Log tables hold every visit and every invoice as-is (so their totals
# can be checked against the hospital's own HMIS) — invoices with no real
# discount (discount_method "none" or blank) are irrelevant to NWP
# contribution tracking, so they're excluded here, at the report level,
# rather than at sync time.
MATCH_CONDITION = """
	oi.patient_id = v.patient_id
	AND oi.invoice_date BETWEEN v.date_of_visit AND IFNULL(v.date_of_discharge, v.date_of_visit)
	AND oi.discount_method IS NOT NULL AND oi.discount_method <> 'none'
	AND (
		v.treatment_category = 'IPD'
		OR NOT EXISTS (
			SELECT 1 FROM `tabBahmni Patient Visit Log` ipd
			WHERE ipd.patient_id = v.patient_id
				AND ipd.treatment_category = 'IPD'
				AND oi.invoice_date BETWEEN ipd.date_of_visit AND IFNULL(ipd.date_of_discharge, ipd.date_of_visit)
		)
	)
"""


@frappe.whitelist()
def get_details(filters=None):
	filters = frappe.parse_json(filters) if isinstance(filters, str) else (filters or {})

	patient_id = (filters.get("patient_id") or "").strip()
	treatment_category = (filters.get("treatment_category") or "").strip()
	registration_status = (filters.get("registration_status") or "").strip()
	diagnosis = (filters.get("diagnosis") or "").strip()
	discount_account_head = (filters.get("discount_account_head") or "").strip()
	date_from = filters.get("date_from") or None
	date_to = filters.get("date_to") or None
	review_only = frappe.utils.cint(filters.get("review_only"))

	visit_conditions = []
	visit_values = {}
	if patient_id:
		visit_conditions.append("v.patient_id LIKE %(patient_id)s")
		visit_values["patient_id"] = f"%{patient_id}%"
	if treatment_category:
		visit_conditions.append("v.treatment_category = %(treatment_category)s")
		visit_values["treatment_category"] = treatment_category
	if registration_status:
		visit_conditions.append("v.registration_status LIKE %(registration_status)s")
		visit_values["registration_status"] = f"%{registration_status}%"
	if diagnosis:
		visit_conditions.append("v.diagnosis LIKE %(diagnosis)s")
		visit_values["diagnosis"] = f"%{diagnosis}%"
	if discount_account_head:
		visit_conditions.append("oi.discount_account_head LIKE %(discount_account_head)s")
		visit_values["discount_account_head"] = f"%{discount_account_head}%"
	if date_from:
		visit_conditions.append("v.date_of_visit >= %(date_from)s")
		visit_values["date_from"] = date_from
	if date_to:
		visit_conditions.append("v.date_of_visit <= %(date_to)s")
		visit_values["date_to"] = date_to

	# A visit whose only invoice is a no-discount ("none") one isn't a review
	# case — it's just not relevant to NWP tracking, so it's left out of this
	# report entirely rather than flagged. Only a visit with NO invoice at
	# all (of any discount_method) is a genuine "needs manual review" case.
	visit_conditions.append(
		f"""(
			oi.invoice_name IS NOT NULL
			OR NOT EXISTS (
				SELECT 1 FROM `tabOdoo Invoice Log` any_oi
				WHERE any_oi.patient_id = v.patient_id
					AND any_oi.invoice_date BETWEEN v.date_of_visit AND IFNULL(v.date_of_discharge, v.date_of_visit)
			)
		)"""
	)

	visit_where = ("WHERE " + " AND ".join(visit_conditions)) if visit_conditions else ""

	matched_rows = frappe.db.sql(
		f"""
		SELECT
			v.visit_id, v.patient_id, v.age, v.gender, v.treatment_category,
			v.district, v.state, v.date_of_visit, v.date_of_discharge,
			v.visit_status, v.registration_status, v.diagnosis, v.visit_details,
			oi.invoice_name, oi.invoice_date, oi.invoice_total, oi.total_bill,
			oi.discount_amount, oi.discount_method, oi.discount_account_head, oi.doctor_name,
			oi.patient_contribution, oi.hospital_additional_contribution,
			oi.nwp_contribution, oi.other_donor_contribution,
			oi.mapped_to_patient_claim_form,
			CASE
				WHEN oi.invoice_name IS NULL THEN 1
				ELSE 0
			END AS needs_manual_review
		FROM `tabBahmni Patient Visit Log` v
		LEFT JOIN `tabOdoo Invoice Log` oi ON {MATCH_CONDITION}
		{visit_where}
		ORDER BY v.date_of_visit DESC
		LIMIT {MAX_ROWS}
		""",
		visit_values,
		as_dict=True,
	)

	# Invoices that don't fall inside any visit's date range at all. Only
	# meaningful when no visit-only filter (type/registration/diagnosis) is
	# active, since an orphan invoice has none of those fields to match on.
	orphan_rows = []
	if not (treatment_category or registration_status or diagnosis):
		orphan_conditions = [
			f"NOT EXISTS (SELECT 1 FROM `tabBahmni Patient Visit Log` v WHERE {MATCH_CONDITION})",
			"oi.discount_method IS NOT NULL AND oi.discount_method <> 'none'",
		]
		orphan_values = {}
		if patient_id:
			orphan_conditions.append("oi.patient_id LIKE %(patient_id)s")
			orphan_values["patient_id"] = f"%{patient_id}%"
		if discount_account_head:
			orphan_conditions.append("oi.discount_account_head LIKE %(discount_account_head)s")
			orphan_values["discount_account_head"] = f"%{discount_account_head}%"
		if date_from:
			orphan_conditions.append("oi.invoice_date >= %(date_from)s")
			orphan_values["date_from"] = date_from
		if date_to:
			orphan_conditions.append("oi.invoice_date <= %(date_to)s")
			orphan_values["date_to"] = date_to

		orphan_rows = frappe.db.sql(
			f"""
			SELECT
				NULL AS visit_id, oi.patient_id AS patient_id, NULL AS age, NULL AS gender,
				NULL AS treatment_category, NULL AS district, NULL AS state,
				NULL AS date_of_visit, NULL AS date_of_discharge, NULL AS visit_status,
				NULL AS registration_status, NULL AS diagnosis, NULL AS visit_details,
				oi.invoice_name, oi.invoice_date, oi.invoice_total, oi.total_bill,
				oi.discount_amount, oi.discount_method, oi.discount_account_head, oi.doctor_name,
				oi.patient_contribution, oi.hospital_additional_contribution,
				oi.nwp_contribution, oi.other_donor_contribution,
				oi.mapped_to_patient_claim_form,
				1 AS needs_manual_review
			FROM `tabOdoo Invoice Log` oi
			WHERE {" AND ".join(orphan_conditions)}
			ORDER BY oi.invoice_date DESC
			LIMIT {MAX_ROWS}
			""",
			orphan_values,
			as_dict=True,
		)

	rows = list(matched_rows) + list(orphan_rows)
	if review_only:
		rows = [r for r in rows if r.get("needs_manual_review")]

	rows.sort(key=lambda r: str(r.get("date_of_visit") or r.get("invoice_date") or ""), reverse=True)
	return rows[:MAX_ROWS]


EXPORT_COLUMNS = [
	("visit_id", "OP/IP ID"),
	("patient_id", "Patient ID"),
	("treatment_category", "Visit Type"),
	("date_of_visit", "Date Of Visit"),
	("date_of_discharge", "Date Of Discharge"),
	("visit_status", "Visit Status"),
	("registration_status", "Registration Status"),
	("diagnosis", "Diagnosis"),
	("invoice_name", "Invoice Name"),
	("invoice_date", "Invoice Date"),
	("total_bill", "Total Bill"),
	("discount_amount", "Discount Amount"),
	("discount_method", "Discount Method"),
	("discount_account_head", "Discount Account Head"),
	("doctor_name", "Doctor Name"),
	("invoice_total", "Invoice Total"),
	("patient_contribution", "Patient Contribution"),
	("hospital_additional_contribution", "Hospital Additional Contribution"),
	("nwp_contribution", "NWP Contribution"),
	("other_donor_contribution", "Other Donor Contribution"),
	("mapped_to_patient_claim_form", "Mapped To Claim Form"),
	("needs_manual_review", "Needs Manual Review"),
]

BOOL_FIELDS = {"mapped_to_patient_claim_form", "needs_manual_review"}


@frappe.whitelist()
def export_xlsx(filters=None):
	from frappe.desk.utils import provide_binary_file
	from frappe.utils.xlsxutils import make_xlsx

	rows = get_details(filters)

	data = [[label for _fieldname, label in EXPORT_COLUMNS]]
	for row in rows:
		line = []
		for fieldname, _label in EXPORT_COLUMNS:
			value = row.get(fieldname)
			if fieldname in BOOL_FIELDS:
				value = "Yes" if frappe.utils.cint(value) else "No"
			elif value is None:
				value = ""
			line.append(value)
		data.append(line)

	xlsx_file = make_xlsx(data, "Visit Invoice Details")
	provide_binary_file(f"Visit-Invoice-Details-{frappe.utils.today()}", "xlsx", xlsx_file.getvalue())


# ---------------------------------------------------------------------------
# Mapping into Patient Registration / Patient Claim Form. Runs once per sync,
# right after both logs are synced for that hospital — only ever reads
# unmapped rows, so it's safe to call every run; already-mapped rows are
# never touched again.
# ---------------------------------------------------------------------------

TYPE_OF_SERVICE_MAP = {"OPD": "Out Patient Service", "IPD": "In Patient Service"}


def _get_or_create_patient_registration(visit, hospital_name, organization):
	"""One Patient Registration per patient, for life (same rule the
	doctype's own validate() enforces) — reused across every visit of
	theirs, never duplicated."""
	existing = frappe.db.get_value("Patient Registration", {"patient_id": visit.patient_id})
	if existing:
		return existing

	from nwp.nwp.doctype.patient_registration.patient_registration import get_or_create_location

	doc = frappe.new_doc("Patient Registration")
	doc.patient_id = visit.patient_id
	doc.hospital_name = hospital_name
	doc.organization = organization
	doc.age = visit.age
	doc.gender = visit.gender

	district = (visit.district or "").strip()
	state = (visit.state or "").strip()
	if district and state:
		try:
			state_name = get_or_create_location("State List", state.title())
			doc.state = state_name
			doc.district = get_or_create_location("District List", district.title(), {"state": state_name})
		except Exception:
			frappe.log_error(title="HMIS sync: state/district lookup failed for Patient Registration")

	doc.insert(ignore_permissions=True)
	return doc.name


def _map_visits_to_registration(hospital_name, organization):
	unmapped = frappe.db.sql(
		"""
		SELECT name, patient_id, age, gender, district, state
		FROM `tabBahmni Patient Visit Log`
		WHERE IFNULL(mapped_to_patient_registration, 0) = 0
		""",
		as_dict=True,
	)
	for visit in unmapped:
		if not visit.patient_id:
			continue
		_get_or_create_patient_registration(visit, hospital_name, organization)
		frappe.db.set_value("Bahmni Patient Visit Log", visit.name, "mapped_to_patient_registration", 1)


def _get_or_create_doctor(doctor_name):
	"""Treating Doctor Name on Patient Claim Form is a Link to the Doctor
	master list, not free text — create one if this name hasn't been seen
	before. Sourced from Odoo's own account_move.doctor_name (a real
	res_partner record, is_doctor=True) — reliable, unlike Bahmni's
	encounter data where most entries are logged under a shared ward/
	counter account rather than the individual doctor's own login."""
	doctor_name = (doctor_name or "").strip()
	if not doctor_name:
		return None
	if frappe.db.exists("Doctor", doctor_name):
		return doctor_name
	doc = frappe.new_doc("Doctor")
	doc.name = doctor_name
	doc.insert(ignore_permissions=True)
	return doc.name


def _map_invoices_to_claim_form(organization):
	"""Only a clean visit+invoice match (the same MATCH_CONDITION the report
	uses) gets a claim — a row still needing manual review is left alone
	until the underlying data issue is resolved and a later sync produces a
	real match."""
	unmapped = frappe.db.sql(
		f"""
		SELECT
			oi.name, oi.patient_id, oi.invoice_date, oi.total_bill, oi.doctor_name,
			oi.patient_contribution, oi.hospital_additional_contribution,
			oi.nwp_contribution, oi.other_donor_contribution, oi.other_donor_name,
			v.treatment_category, v.date_of_visit, v.date_of_discharge, v.diagnosis
		FROM `tabOdoo Invoice Log` oi
		JOIN `tabBahmni Patient Visit Log` v ON {MATCH_CONDITION}
		WHERE IFNULL(oi.mapped_to_patient_claim_form, 0) = 0
		""",
		as_dict=True,
	)

	for row in unmapped:
		prid = frappe.db.get_value("Patient Registration", {"patient_id": row.patient_id})
		if not prid:
			# Registration for this patient hasn't landed yet (shouldn't
			# normally happen, since visits are mapped first) — picked up
			# automatically on the next sync once it has.
			continue

		is_apf_bill = frappe.utils.flt(row.nwp_contribution) > 0

		doc = frappe.new_doc("Patient Claim Form")
		doc.prid = prid
		doc.patient_id = row.patient_id
		doc.organization = organization
		doc.type_of_service = TYPE_OF_SERVICE_MAP.get(row.treatment_category)
		doc.date_of_visit = row.date_of_visit
		doc.date_of_discharge = row.date_of_discharge
		doc.final_diagnosis = row.diagnosis
		doc.treating_doctor_name = _get_or_create_doctor(row.doctor_name)
		doc.total_actual_final_bill_in_rs = row.total_bill
		doc.total_bill_at_apf_agreed_rates_mou = row.total_bill
		doc.patient_contribution_yes = row.patient_contribution
		doc.additional_hospital_contribution = row.hospital_additional_contribution
		doc.does_it_require_apf_contribution = "Yes" if is_apf_bill else "No"
		if is_apf_bill:
			doc.apf_contribution = row.nwp_contribution
		else:
			doc.other_donor_contribution = row.other_donor_contribution
			doc.other_donor_name = row.other_donor_name
		doc.invoice_date = row.invoice_date
		doc.insert(ignore_permissions=True)

		frappe.db.set_value("Odoo Invoice Log", row.name, "mapped_to_patient_claim_form", 1)


def _backfill_claim_form_fields():
	"""final_diagnosis and treating_doctor_name are snapshotted onto the
	Patient Claim Form at the moment it's first mapped — but Bahmni/Odoo's
	own data can still be blank at that moment and get filled in later
	(e.g. a diagnosis added only at discharge, after the bill was already
	raised and the claim already created). This catches those up on every
	sync. It only ever fills a field that's still blank — never overwrites
	one that already has a value, whether set by us earlier or typed in by
	staff."""
	rows = frappe.db.sql(
		f"""
		SELECT pcf.name AS pcf_name, pcf.final_diagnosis, pcf.treating_doctor_name,
			v.diagnosis AS visit_diagnosis, oi.doctor_name AS invoice_doctor_name
		FROM `tabPatient Claim Form` pcf
		JOIN `tabOdoo Invoice Log` oi ON oi.patient_id = pcf.patient_id AND oi.invoice_date = pcf.invoice_date
		JOIN `tabBahmni Patient Visit Log` v ON {MATCH_CONDITION}
		WHERE (
			(IFNULL(pcf.final_diagnosis, '') = '' AND IFNULL(v.diagnosis, '') != '')
			OR (IFNULL(pcf.treating_doctor_name, '') = '' AND IFNULL(oi.doctor_name, '') != '')
		)
		""",
		as_dict=True,
	)

	for row in rows:
		updates = {}
		if not (row.final_diagnosis or "").strip() and (row.visit_diagnosis or "").strip():
			updates["final_diagnosis"] = row.visit_diagnosis
		if not (row.treating_doctor_name or "").strip() and (row.invoice_doctor_name or "").strip():
			updates["treating_doctor_name"] = _get_or_create_doctor(row.invoice_doctor_name)
		if updates:
			frappe.db.set_value("Patient Claim Form", row.pcf_name, updates)


def map_synced_records(hospital_name, organization):
	_map_visits_to_registration(hospital_name, organization)
	_map_invoices_to_claim_form(organization)
	_backfill_claim_form_fields()
