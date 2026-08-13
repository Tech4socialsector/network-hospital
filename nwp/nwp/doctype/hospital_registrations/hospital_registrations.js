// Copyright (c) 2026, TFSS and contributors
// For license information, please see license.txt

// ============================================================
// Client Script: Hospital Registrations
// Feature: "Update for New Year" button → same pattern as
// Service List and Rates' "Update Now": a dialog shows what will be
// archived, the new year's figures are entered right there, and one
// atomic save both logs the old figures to Yearly Data (history) and
// applies the new figures to the form — never a plain field edit.
// yearly_data child table is always read-only (audit log).
// ============================================================

const YEARLY_FIELD_GROUPS = [
	{
		section: "Hospital stats",
		fields: [
			{ fieldname: "data_twdi", fieldtype: "Data", label: "OPD patients" },
			{ fieldname: "data_ipd", fieldtype: "Data", label: "IPD admissions" },
			{ fieldname: "ndel", fieldtype: "Data", label: "Normal deliveries" },
			{ fieldname: "cdel", fieldtype: "Data", label: "C-section deliveries" },
			{ fieldname: "data_surgeries", fieldtype: "Data", label: "Surgeries (excluding minor procedures)" },
		],
	},
	{
		section: "Income",
		fields: [
			{ fieldname: "income_from_patient", fieldtype: "Currency", label: "Income from patient" },
			{ fieldname: "data_wafl", fieldtype: "Currency", label: "Income from nursing school/college" },
			{ fieldname: "grants_donations_govt_supportreimburse", fieldtype: "Currency", label: "Grants, Donations" },
			{ fieldname: "supportreimbursements_from_government", fieldtype: "Currency", label: "Support/Reimbursements from Government" },
			{ fieldname: "bankinterest", fieldtype: "Currency", label: "Bank interest (savings + FD)" },
			{ fieldname: "other_income", fieldtype: "Data", label: "Other income" },
			{ fieldname: "add_details_of_other_income_below", fieldtype: "Small Text", label: "Add details of other income below" },
		],
	},
	{
		section: "Expenditure",
		fields: [
			{ fieldname: "opex", fieldtype: "Currency", label: "Hospital operating expenses" },
			{ fieldname: "charity", fieldtype: "Currency", label: "Charity / Discount for patients" },
			{ fieldname: "adminex", fieldtype: "Currency", label: "Admin expense" },
			{ fieldname: "other_expenses_school_nursing_college_agriculture_etc", fieldtype: "Currency", label: "Other expenses (school, nursing college, agriculture etc.)" },
			{ fieldname: "comm_work", fieldtype: "Currency", label: "Community work" },
		],
	},
	{
		section: "Balance sheet",
		fields: [
			{ fieldname: "general__corpus_fund", fieldtype: "Data", label: "Corpus fund" },
			{ fieldname: "general_fund", fieldtype: "Data", label: "General fund" },
			{ fieldname: "other_earmarked_funds", fieldtype: "Data", label: "Other earmarked funds" },
			{ fieldname: "liabilities", fieldtype: "Data", label: "Liabilities (Long+Short Term)" },
		],
	},
];

// Computed on save, not entered in the dialog — same as the main form.
const COMPUTED_FIELDNAMES = [
	"last_3_years_average_hospital_expenditure_in_rs_copy", // Total income
	"last_3_years_average_hospital_expenditure_in_rs", // Total expenditure
	"last_3_year_average_annual_surplus__deficit_in_rs", // Surplus/Deficit
];

const ALL_YEARLY_FIELDNAMES = YEARLY_FIELD_GROUPS.flatMap((g) => g.fields.map((f) => f.fieldname)).concat(COMPUTED_FIELDNAMES);

frappe.ui.form.on("Hospital Registrations", {
	refresh(frm) {
		calculate_totals(frm);

		frm.set_df_property("yearly_data", "read_only", 1);
		if (frm.get_field("yearly_data").grid) {
			frm.get_field("yearly_data").grid.cannot_add_rows = true;
			frm.get_field("yearly_data").grid.cannot_delete_rows = true;
		}
		frm.refresh_field("yearly_data");

		if (!frm.is_new()) {
			frm.add_custom_button(__("Update for New Year"), () => show_update_year_dialog(frm)).addClass("btn-primary");
		}
	},

	income_from_patient(frm) { calculate_totals(frm); },
	data_wafl(frm) { calculate_totals(frm); },
	grants_donations_govt_supportreimburse(frm) { calculate_totals(frm); },
	supportreimbursements_from_government(frm) { calculate_totals(frm); },
	bankinterest(frm) { calculate_totals(frm); },
	other_income(frm) { calculate_totals(frm); },
	opex(frm) { calculate_totals(frm); },
	charity(frm) { calculate_totals(frm); },
	adminex(frm) { calculate_totals(frm); },
	other_expenses_school_nursing_college_agriculture_etc(frm) { calculate_totals(frm); },
	comm_work(frm) { calculate_totals(frm); },
});

function calculate_totals(frm) {
	let total_income =
		flt(frm.doc.income_from_patient) +
		flt(frm.doc.data_wafl) +
		flt(frm.doc.grants_donations_govt_supportreimburse) +
		flt(frm.doc.supportreimbursements_from_government) +
		flt(frm.doc.bankinterest) +
		flt(frm.doc.other_income);

	frm.set_value("last_3_years_average_hospital_expenditure_in_rs_copy", total_income);

	let total_expenditure =
		flt(frm.doc.opex) +
		flt(frm.doc.charity) +
		flt(frm.doc.adminex) +
		flt(frm.doc.other_expenses_school_nursing_college_agriculture_etc) +
		flt(frm.doc.comm_work);

	frm.set_value("last_3_years_average_hospital_expenditure_in_rs", total_expenditure);

	frm.set_value("last_3_year_average_annual_surplus__deficit_in_rs", total_income + total_expenditure);
}

function show_update_year_dialog(frm) {
	let total_income = flt(frm.doc.last_3_years_average_hospital_expenditure_in_rs_copy);
	let total_expenditure = flt(frm.doc.last_3_years_average_hospital_expenditure_in_rs);

	let dialog_fields = [
		{
			fieldtype: "HTML",
			fieldname: "current_data_banner",
			options: `
				<div style="background:#f4f5f7;border:1px solid #d1d8dd;border-radius:6px;
					padding:12px 16px;margin-bottom:8px;">
					<div style="font-size:11px;color:#6c757d;font-weight:700;
						text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px;">
						Current data (will be saved to Yearly Data history)
					</div>
					<div style="font-size:13px;color:#333;display:flex;flex-wrap:wrap;gap:20px;">
						<span><strong>Total Income:</strong> ${format_currency(total_income)}</span>
						<span><strong>Total Expenditure:</strong> ${format_currency(total_expenditure)}</span>
						<span><strong>OPD patients:</strong> ${frm.doc.data_twdi || "—"}</span>
						<span><strong>IPD admissions:</strong> ${frm.doc.data_ipd || "—"}</span>
					</div>
				</div>`,
		},
		{
			fieldtype: "Link",
			fieldname: "financial_year",
			options: "Financial Year",
			label: __("Which Financial Year does the CURRENT data above belong to?"),
			reqd: 1,
		},
	];

	YEARLY_FIELD_GROUPS.forEach((group, gi) => {
		dialog_fields.push({ fieldtype: "Section Break", label: __(group.section + " — enter the new year's figures") });
		group.fields.forEach((f, fi) => {
			if (fi > 0 && fi % 2 === 0) dialog_fields.push({ fieldtype: "Column Break" });
			dialog_fields.push({
				fieldtype: f.fieldtype,
				fieldname: f.fieldname,
				label: __(f.label),
			});
		});
	});

	let dialog = new frappe.ui.Dialog({
		title: __("Update for New Year"),
		size: "large",
		fields: dialog_fields,
		primary_action_label: __("Archive & Save New Year"),
		primary_action: function (values) {
			frappe.confirm(
				__("This will save the current data shown above into Yearly Data history for {0}, and replace the form with the new figures you entered. Continue?", [values.financial_year]),
				function () {
					let history_row = { financial_year: values.financial_year };
					ALL_YEARLY_FIELDNAMES.forEach((fieldname) => {
						history_row[fieldname] = frm.doc[fieldname];
					});
					let yearly_data = (frm.doc.yearly_data || []).map((r) => r);
					yearly_data.push(history_row);

					let updated_fields = { yearly_data: yearly_data };
					YEARLY_FIELD_GROUPS.forEach((group) => {
						group.fields.forEach((f) => {
							updated_fields[f.fieldname] = values[f.fieldname];
						});
					});

					frappe.call({
						method: "frappe.client.set_value",
						args: {
							doctype: "Hospital Registrations",
							name: frm.doc.name,
							fieldname: updated_fields,
						},
						freeze: true,
						freeze_message: __("Archiving and updating..."),
						callback: function (r) {
							if (!r.exc) {
								frappe.show_alert({ message: __("Archived and updated for the new year!"), indicator: "green" }, 5);
								dialog.hide();
								frm.reload_doc();
							} else {
								frappe.msgprint({
									title: __("Update Failed"),
									indicator: "red",
									message: __("Could not update the record. Please check permissions or try again."),
								});
							}
						},
					});
				}
			);
		},
	});

	dialog.show();
}
