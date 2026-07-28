SELECT
    nhb.organization_name AS "Organization Name:Data:220",
    nhb.hospital_name AS "Hospital Name:Data:220",
    nhb.financial_year AS "Financial Year:Date:120",
    nhb.start_date AS "Start Date:Date:120",
    nhb.end_date AS "End Date:Date:120",
    nhb.grant_id AS "Grant ID:Data:150",

    nhb.total_budget AS "Approved Budget:Currency:150",

    IFNULL((
        SELECT SUM(bd.disbursed_amount)
        FROM `tabBudget Disbursement` bd
        WHERE bd.organization = nhb.organization_name
    ), 0) AS "Disbursed Amount:Currency:150",

    IFNULL((
        SELECT SUM(pcf.apf_contribution)
        FROM `tabPatient Claim Form` pcf
        WHERE pcf.organization = nhb.organization_name
    ), 0) AS "Utilization Amount:Currency:150",

    (
        nhb.total_budget -

        IFNULL((
            SELECT SUM(pcf.apf_contribution)
            FROM `tabPatient Claim Form` pcf
            WHERE pcf.organization = nhb.organization_name
        ), 0)

    ) AS "Balance Amount:Currency:150"

FROM `tabNetwork Hospital Budget` nhb
