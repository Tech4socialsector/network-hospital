-- One row per calendar day this sync agent has touched, showing how many
-- records landed that day in each log — "registrations" here means
-- distinct patients first seen (Bahmni Patient Visit Log has no separate
-- registration-level doctype yet, so this is the closest proxy until
-- that mapping exists).
SELECT
	d.sync_date AS "Date:Date:120",

	IFNULL((
		SELECT COUNT(DISTINCT v.patient_id)
		FROM `tabBahmni Patient Visit Log` v
		WHERE DATE(v.creation) = d.sync_date
	), 0) AS "Registrations (Distinct Patients):Int:170",

	IFNULL((
		SELECT COUNT(*)
		FROM `tabBahmni Patient Visit Log` v
		WHERE DATE(v.creation) = d.sync_date
	), 0) AS "Visits Synced:Int:120",

	IFNULL((
		SELECT COUNT(*)
		FROM `tabOdoo Invoice Log` oi
		WHERE DATE(oi.creation) = d.sync_date
	), 0) AS "Invoices Synced:Int:130"

FROM (
	SELECT DISTINCT DATE(creation) AS sync_date FROM `tabBahmni Patient Visit Log`
	UNION
	SELECT DISTINCT DATE(creation) AS sync_date FROM `tabOdoo Invoice Log`
) d
ORDER BY d.sync_date DESC
