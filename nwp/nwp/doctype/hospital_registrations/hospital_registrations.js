// Copyright (c) 2026, TFSS and contributors
// For license information, please see license.txt

frappe.ui.form.on('Hospital Registrations', {
    refresh(frm) {
        calculate_totals(frm);
    },

    income_from_patient(frm) {
        calculate_totals(frm);
    },

    data_wafl(frm) {
        calculate_totals(frm);
    },

    grants_donations_govt_supportreimburse(frm) {
        calculate_totals(frm);
    },

    supportreimbursements_from_government(frm) {
        calculate_totals(frm);
    },

    bankinterest(frm) {
        calculate_totals(frm);
    },

    other_income(frm) {
        calculate_totals(frm);
    },

    opex(frm) {
        calculate_totals(frm);
    },

    charity(frm) {
        calculate_totals(frm);
    },

    adminex(frm) {
        calculate_totals(frm);
    },

    other_expenses_school_nursing_college_agriculture_etc(frm) {
        calculate_totals(frm);
    },

    comm_work(frm) {
        calculate_totals(frm);
    }
});

function calculate_totals(frm) {

    // Total Income
    let total_income =
        flt(frm.doc.income_from_patient) +
        flt(frm.doc.data_wafl) +
        flt(frm.doc.grants_donations_govt_supportreimburse) +
        flt(frm.doc.supportreimbursements_from_government) +
        flt(frm.doc.bankinterest) +
        flt(frm.doc.other_income);

    frm.set_value(
        'last_3_years_average_hospital_expenditure_in_rs_copy',
        total_income
    );

    // Total Expenditure
    let total_expenditure =
        flt(frm.doc.opex) +
        flt(frm.doc.charity) +
        flt(frm.doc.adminex) +
        flt(frm.doc.other_expenses_school_nursing_college_agriculture_etc) +
        flt(frm.doc.comm_work);

    frm.set_value(
        'last_3_years_average_hospital_expenditure_in_rs',
        total_expenditure
    );

    // Annual Surplus / Deficit
    let surplus_deficit =
        total_income + total_expenditure;

    frm.set_value(
        'last_3_year_average_annual_surplus__deficit_in_rs',
        surplus_deficit
    );
}
