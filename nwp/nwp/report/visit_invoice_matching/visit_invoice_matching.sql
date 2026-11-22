-- Matches each Bahmni visit to its Odoo invoice(s) by date range (patient_id +
-- invoice_date falling between date_of_visit and date_of_discharge), summing
-- across however many invoices fall in that range — one visit can have several
-- (room/lab/pharmacy as separate bills), so this is one-to-many, not one-to-one.
--
-- Same-day collision rule: when a patient has an OPD visit and an IPD visit
-- starting the same day, that day's invoice(s) are attributed to the IPD visit
-- (the bigger admission event) instead of being double-counted on both — this
-- matches the hospital's real workflow (every patient enters as OP, then
-- becomes IP only once the doctor admits them), so it is NOT flagged for
-- review. Only a visit matching zero invoices is flagged under
-- "Needs Manual Review".
SELECT
	v.visit_id AS "Visit ID:Data:100",
	v.patient_id AS "Patient ID:Data:100",
	v.treatment_category AS "Type:Data:70",
	v.date_of_visit AS "Date Of Visit:Date:110",
	v.date_of_discharge AS "Date Of Discharge:Date:110",
	v.visit_status AS "Visit Status:Data:90",
	v.registration_status AS "Registration Status:Data:130",
	v.diagnosis AS "Diagnosis:Data:200",

	(
		SELECT COUNT(*)
		FROM `tabOdoo Invoice Log` oi
		WHERE oi.patient_id = v.patient_id
			AND oi.invoice_date BETWEEN v.date_of_visit AND IFNULL(v.date_of_discharge, v.date_of_visit)
			AND (
				v.treatment_category = 'IPD'
				OR NOT EXISTS (
					SELECT 1 FROM `tabBahmni Patient Visit Log` ipd
					WHERE ipd.patient_id = v.patient_id
						AND ipd.treatment_category = 'IPD'
						AND oi.invoice_date BETWEEN ipd.date_of_visit AND IFNULL(ipd.date_of_discharge, ipd.date_of_visit)
				)
			)
	) AS "Matched Invoices:Int:60",

	IFNULL((
		SELECT SUM(oi.total_bill)
		FROM `tabOdoo Invoice Log` oi
		WHERE oi.patient_id = v.patient_id
			AND oi.invoice_date BETWEEN v.date_of_visit AND IFNULL(v.date_of_discharge, v.date_of_visit)
			AND (
				v.treatment_category = 'IPD'
				OR NOT EXISTS (
					SELECT 1 FROM `tabBahmni Patient Visit Log` ipd
					WHERE ipd.patient_id = v.patient_id
						AND ipd.treatment_category = 'IPD'
						AND oi.invoice_date BETWEEN ipd.date_of_visit AND IFNULL(ipd.date_of_discharge, ipd.date_of_visit)
				)
			)
	), 0) AS "Total Bill:Currency:110",

	IFNULL((
		SELECT SUM(oi.patient_contribution)
		FROM `tabOdoo Invoice Log` oi
		WHERE oi.patient_id = v.patient_id
			AND oi.invoice_date BETWEEN v.date_of_visit AND IFNULL(v.date_of_discharge, v.date_of_visit)
			AND (
				v.treatment_category = 'IPD'
				OR NOT EXISTS (
					SELECT 1 FROM `tabBahmni Patient Visit Log` ipd
					WHERE ipd.patient_id = v.patient_id
						AND ipd.treatment_category = 'IPD'
						AND oi.invoice_date BETWEEN ipd.date_of_visit AND IFNULL(ipd.date_of_discharge, ipd.date_of_visit)
				)
			)
	), 0) AS "Patient Contribution:Currency:130",

	IFNULL((
		SELECT SUM(oi.hospital_additional_contribution)
		FROM `tabOdoo Invoice Log` oi
		WHERE oi.patient_id = v.patient_id
			AND oi.invoice_date BETWEEN v.date_of_visit AND IFNULL(v.date_of_discharge, v.date_of_visit)
			AND (
				v.treatment_category = 'IPD'
				OR NOT EXISTS (
					SELECT 1 FROM `tabBahmni Patient Visit Log` ipd
					WHERE ipd.patient_id = v.patient_id
						AND ipd.treatment_category = 'IPD'
						AND oi.invoice_date BETWEEN ipd.date_of_visit AND IFNULL(ipd.date_of_discharge, ipd.date_of_visit)
				)
			)
	), 0) AS "Hospital Additional Contribution:Currency:160",

	IFNULL((
		SELECT SUM(oi.nwp_contribution)
		FROM `tabOdoo Invoice Log` oi
		WHERE oi.patient_id = v.patient_id
			AND oi.invoice_date BETWEEN v.date_of_visit AND IFNULL(v.date_of_discharge, v.date_of_visit)
			AND (
				v.treatment_category = 'IPD'
				OR NOT EXISTS (
					SELECT 1 FROM `tabBahmni Patient Visit Log` ipd
					WHERE ipd.patient_id = v.patient_id
						AND ipd.treatment_category = 'IPD'
						AND oi.invoice_date BETWEEN ipd.date_of_visit AND IFNULL(ipd.date_of_discharge, ipd.date_of_visit)
				)
			)
	), 0) AS "NWP Contribution:Currency:120",

	IFNULL((
		SELECT SUM(oi.other_donor_contribution)
		FROM `tabOdoo Invoice Log` oi
		WHERE oi.patient_id = v.patient_id
			AND oi.invoice_date BETWEEN v.date_of_visit AND IFNULL(v.date_of_discharge, v.date_of_visit)
			AND (
				v.treatment_category = 'IPD'
				OR NOT EXISTS (
					SELECT 1 FROM `tabBahmni Patient Visit Log` ipd
					WHERE ipd.patient_id = v.patient_id
						AND ipd.treatment_category = 'IPD'
						AND oi.invoice_date BETWEEN ipd.date_of_visit AND IFNULL(ipd.date_of_discharge, ipd.date_of_visit)
				)
			)
	), 0) AS "Other Donor Contribution:Currency:140",

	CASE
		WHEN (
			SELECT COUNT(*)
			FROM `tabOdoo Invoice Log` oi
			WHERE oi.patient_id = v.patient_id
				AND oi.invoice_date BETWEEN v.date_of_visit AND IFNULL(v.date_of_discharge, v.date_of_visit)
		) = 0 THEN 1
		ELSE 0
	END AS "Needs Manual Review:Check:60"

FROM `tabBahmni Patient Visit Log` v
ORDER BY v.date_of_visit DESC
