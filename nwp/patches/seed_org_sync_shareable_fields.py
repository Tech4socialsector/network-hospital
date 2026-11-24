import frappe

# Every field an organization is allowed to opt out of sharing with central,
# grouped by which form it's pushed from — label -> actual fieldname.
# Deliberately excludes patient_id, organization, and approval_status from
# both lists: those three are always sent regardless, since central relies
# on them to identify and correctly link records.
REGISTRATION_SHAREABLE_FIELDS = {
	"Patient Name": "name1",
	"Age": "age",
	"Gender": "gender",
	"Village Name": "village_name",
	"Pincode": "pincode",
	"State": "state",
	"District": "district",
	"Block": "block",
	"Hospital Name": "hospital_name",
}

CLAIM_SHAREABLE_FIELDS = {
	"Patient Name": "name1",
	"Age": "age",
	"Gender": "gender",
	"Type Of Service": "type_of_service",
	"Date Of Visit": "date_of_visit",
	"Date Of Discharge": "date_of_discharge",
	"Treating Doctor Name": "treating_doctor_name",
	"Final Diagnosis": "final_diagnosis",
	"Total Actual Final Bill": "total_actual_final_bill_in_rs",
	"Does It Require APF Contribution": "does_it_require_apf_contribution",
	"Existing Hospital Contribution": "existing_hospital_contribution",
	"Additional Hospital Contribution": "additional_hospital_contribution",
	"Patient Contribution": "patient_contribution_yes",
	"APF Contribution": "apf_contribution",
	"Other Donor Contribution": "other_donor_contribution",
	"Other Donor Name": "other_donor_name",
	"Invoice Date": "invoice_date",
	"Invoice Number": "invoice_number",
	"Prescription Upload": "upload_prescription",
	"Final Bill Upload": "upload_final_bill",
}


def _seed(fields, applies_to):
	for label, field_name in fields.items():
		# Patient Name/Age/Gender exist on both forms — suffixed so each
		# shows up as its own, unambiguous option under its own form's list.
		full_label = f"{label} ({applies_to.replace('Patient ', '')})"
		if frappe.db.exists("Org Sync Shareable Field", full_label):
			continue
		frappe.get_doc(
			{
				"doctype": "Org Sync Shareable Field",
				"label": full_label,
				"field_name": field_name,
				"applies_to": applies_to,
			}
		).insert(ignore_permissions=True)


def execute():
	_seed(REGISTRATION_SHAREABLE_FIELDS, "Patient Registration")
	_seed(CLAIM_SHAREABLE_FIELDS, "Patient Claim Form")
	frappe.db.commit()
