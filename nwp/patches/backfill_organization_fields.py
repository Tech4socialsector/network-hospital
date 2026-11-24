import frappe

# Mirrors Patient Claim Form's own sync_fields_from_registration() mapping —
# kept as a plain literal here rather than imported, since a patch should
# stay correct even if that function's logic changes later.
FETCH_FROM_PRID = {
	"name1": "name1",
	"gender": "gender",
	"age": "age",
	"patient_id": "patient_id",
	"organization_copy": "hospital_name",
	"organization": "organization",
}


def _flag_for_resync(doctype, name, was_pushed):
	"""If this record had already been pushed to central with the old,
	blank value, flag it to go out again now that it's correct."""
	if was_pushed:
		frappe.db.set_value(
			doctype, name, {"pushed_to_central": 0, "central_push_error": ""}, update_modified=False
		)


def _backfill_registration_organization():
	"""Patient Registration's own Organization field only ever auto-fills
	via the browser form's client-side fetch_from — never for a bulk
	import or an API-created record, which is how most historical data
	got in. Recoverable because Hospital With Organization's own
	`organization` field is always set directly by a human, never fetched."""
	hospital_orgs = {
		h.name: h.organization
		for h in frappe.get_all("Hospital With Organization", fields=["name", "organization"])
		if h.organization
	}
	if not hospital_orgs:
		return 0

	# "hospital_name not in ['', None]" would silently match nothing — SQL's
	# NOT IN with a NULL in the list makes every row's comparison NULL, which
	# WHERE treats as false. `["is", "set"]` is the correct way to say
	# "not blank" for a nullable column.
	rows = frappe.get_all(
		"Patient Registration",
		filters={"organization": ["in", ["", None]], "hospital_name": ["is", "set"]},
		fields=["name", "hospital_name", "pushed_to_central"],
	)

	updated = 0
	for row in rows:
		org = hospital_orgs.get(row.hospital_name)
		if not org:
			continue
		frappe.db.set_value("Patient Registration", row.name, "organization", org, update_modified=False)
		_flag_for_resync("Patient Registration", row.name, row.pushed_to_central)
		updated += 1

	return updated


def _resolve_missing_prids():
	"""Some historical bulk imports typed patient_id in directly but left
	prid (the actual link field everything else fetches from) blank — a
	Data Import can write a read-only field like patient_id without ever
	setting prid. Found and fixed once live via a System Console script;
	this is the same repair as a permanent patch, for any install still
	carrying the gap. Only resolves an exact one-to-one patient_id match;
	an ambiguous (shared) patient_id is left alone rather than guessed."""
	registrations = frappe.get_all("Patient Registration", fields=["name", "patient_id"])
	by_patient_id = {}
	ambiguous = set()
	for r in registrations:
		if not r.patient_id:
			continue
		if r.patient_id in by_patient_id:
			ambiguous.add(r.patient_id)
		else:
			by_patient_id[r.patient_id] = r.name

	claims = frappe.get_all(
		"Patient Claim Form",
		filters={"prid": ["is", "not set"], "patient_id": ["is", "set"]},
		fields=["name", "patient_id"],
	)

	resolved = 0
	for c in claims:
		if c.patient_id in ambiguous:
			continue
		prid = by_patient_id.get(c.patient_id)
		if not prid:
			continue
		frappe.db.set_value("Patient Claim Form", c.name, "prid", prid, update_modified=False)
		resolved += 1

	return resolved


def _backfill_claim_form_fields():
	"""Same gap, one level further down — Patient Claim Form fetches these
	fields from its own linked Patient Registration, so a claim created
	via bulk import/API never got them either, and any that pulled from a
	Registration before its own Organization was fixed above inherited
	the blank too."""
	claims = frappe.get_all(
		"Patient Claim Form", fields=["name", "prid", "pushed_to_central", *FETCH_FROM_PRID.keys()]
	)
	prids = {c.prid for c in claims if c.prid}
	if not prids:
		return 0

	registrations = {
		r.name: r
		for r in frappe.get_all(
			"Patient Registration",
			filters={"name": ["in", list(prids)]},
			fields=["name", *set(FETCH_FROM_PRID.values())],
		)
	}

	updated = 0
	for c in claims:
		registration = registrations.get(c.prid)
		if not registration:
			continue
		values = {
			target: registration.get(source)
			for target, source in FETCH_FROM_PRID.items()
			if not c.get(target) and registration.get(source)
		}
		if not values:
			continue
		frappe.db.set_value("Patient Claim Form", c.name, values, update_modified=False)
		_flag_for_resync("Patient Claim Form", c.name, c.pushed_to_central)
		updated += 1

	return updated


def execute():
	registrations_fixed = _backfill_registration_organization()
	prids_resolved = _resolve_missing_prids()
	claims_fixed = _backfill_claim_form_fields()
	frappe.db.commit()
	frappe.logger().info(
		f"backfill_organization_fields: fixed {registrations_fixed} Patient Registration, "
		f"resolved {prids_resolved} missing prid link(s), "
		f"fixed {claims_fixed} Patient Claim Form record(s)"
	)
