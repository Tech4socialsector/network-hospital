// Copyright (c) 2026, TFSS and contributors
// For license information, please see license.txt

// ============================================================
// Client Script: Patient Claim Form
// REQUIREMENT: In "Service List and Percentage" child DocType:
//   - fieldname must be "procedure_name" (not "procedure" — reserved SQL word)
//   - service field: fetch_from = "procedure_name.name_of_service"
//   - nwp_percentage field: fetch_from = "procedure_name.nwp_percentage"
// ============================================================

// This organization's NWP Settings: use_nwp_agreed_rate_model = 0 means
// there's no separately negotiated rate — the agreed rate is just the
// actual bill, and the hospital's default contribution is always zero.
// Cached after first fetch so every refresh/field-change isn't a round trip.
let _use_agreed_rate_model = null;

function with_agreed_rate_setting(callback) {
    if (_use_agreed_rate_model !== null) {
        callback(_use_agreed_rate_model);
        return;
    }
    frappe.call({
        method: 'nwp.nwp.doctype.nwp_settings.nwp_settings.get_use_nwp_agreed_rate_model',
        callback: function (r) {
            _use_agreed_rate_model = cint(r.message) ? 1 : 0;
            callback(_use_agreed_rate_model);
        }
    });
}

function apply_agreed_rate_model(frm) {
    with_agreed_rate_setting(function (use_model) {
        frm.set_df_property('total_bill_at_apf_agreed_rates_mou', 'hidden', !use_model);
        frm.set_df_property('existing_hospital_contribution', 'hidden', !use_model);
        if (!use_model) {
            frm.set_value(
                'total_bill_at_apf_agreed_rates_mou',
                frm.doc.total_actual_final_bill_in_rs
            );
        } else {
            calculate_all(frm);
        }
    });
}

frappe.ui.form.on("Patient Claim Form", {
    refresh: function (frm) {
        load_subsidy(frm);
        apply_nwp_css(frm);
        frm.set_df_property('existing_hospital_contribution', 'read_only', 1);
        apply_agreed_rate_model(frm);
        calculate_all(frm);
    },

    organization_copy: function (frm) {
        load_subsidy(frm);
    },

    total_bill_at_apf_agreed_rates_mou: function (frm) {
        calculate_all(frm);
    },

    does_it_require_apf_contribution: function (frm) {
        apply_nwp_css(frm);
        calculate_all(frm);
        calculate_other_donor_contribution(frm);
    },

    total_actual_final_bill_in_rs: function (frm) {
        apply_agreed_rate_model(frm);
        calculate_all(frm);
        calculate_other_donor_contribution(frm);
    },

    patient_contribution_yes: function (frm) {
        calculate_apf_contribution(frm);
        calculate_other_donor_contribution(frm);
    },

    additional_hospital_contribution: function (frm) {
        calculate_apf_contribution(frm);
        calculate_other_donor_contribution(frm);
    },
});

frappe.ui.form.on("Service List and Percentage", {
    form_render: function (frm, _cdt, _cdn) {
        apply_nwp_css(frm);
    },

    service: function (frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        if (!row.service) return;

        const duplicates = (frm.doc.service_and_rate || []).filter(function (r) {
            return r.service === row.service && r.name !== row.name;
        });

        if (duplicates.length > 0) {
            frappe.show_alert({
                message: __(`"${row.service}" is already added. Duplicate procedures are not allowed.`),
                indicator: "red",
            }, 5);

            locals[cdt][cdn].service        = "";
            locals[cdt][cdn].nwp_percentage = "";
            locals[cdt][cdn].procedure_name = "";

            frm.fields_dict["service_and_rate"].grid.refresh();

            setTimeout(function () {
                const grid   = frm.fields_dict["service_and_rate"].grid;
                const row_el = grid.grid_rows_by_docname[cdn];
                if (row_el) {
                    const $cell = $(row_el.row).find('[data-fieldname="procedure_name"]');
                    if ($cell.length) {
                        $cell.click();
                        const $input = $cell.find("input, textarea");
                        if ($input.length) $input.val("").focus();
                    }
                }
            }, 200);
            return;
        }
        calculate_all(frm);
    },

    nwp_percentage: function (frm) {
        calculate_all(frm);
    },
});

// ── CSS: hide nwp_percentage column when APF contribution is No ───────────
function apply_nwp_css(frm) {
    const show_nwp = frm.doc.does_it_require_apf_contribution === "Yes";
    const style_id = "style_hide_nwp_service_and_rate";
    if (!show_nwp) {
        if (!$(`#${style_id}`).length) {
            $("head").append(
                `<style id="${style_id}">
                    [data-fieldname="service_and_rate"] [data-fieldname="nwp_percentage"],
                    .grid-heading-row [data-fieldname="nwp_percentage"] {
                        display: none !important;
                    }
                </style>`
            );
        }
    } else {
        $(`#${style_id}`).remove();
    }
}

// ── safe_set: set value and refresh field (works on read-only fields too) ─
function safe_set(frm, fieldname, new_value) {
    const current  = flt(frm.doc[fieldname]) || 0;
    const incoming = flt(new_value) || 0;
    if (current !== incoming) {
        frm.doc[fieldname] = incoming;
        frm.refresh_field(fieldname);
    }
}

// ── Calculations ──────────────────────────────────────────────────────────
function calculate_all(frm) {

    const total_bill =
        flt(frm.doc.total_actual_final_bill_in_rs) || 0;

    const nwp_agreed_bill =
        flt(frm.doc.total_bill_at_apf_agreed_rates_mou) || 0;

    const hospital_contribution =
        total_bill - nwp_agreed_bill;

    safe_set(
        frm,
        "existing_hospital_contribution",
        Math.max(0, hospital_contribution)
    );

    calculate_apf_contribution(frm);
    calculate_other_donor_contribution(frm);
}

function calculate_apf_contribution(frm) {

    const total_bill =
        flt(frm.doc.total_actual_final_bill_in_rs) || 0;

    const nwp_agreed_bill =
        flt(frm.doc.total_bill_at_apf_agreed_rates_mou) || 0;

    const patient_contribution =
        flt(frm.doc.patient_contribution_yes) || 0;

    const additional_hospital_contribution =
        flt(frm.doc.additional_hospital_contribution) || 0;

    const hospital_contribution =
        total_bill - nwp_agreed_bill;

    safe_set(
        frm,
        "existing_hospital_contribution",
        Math.max(0, hospital_contribution)
    );

    const apf_contribution =
        nwp_agreed_bill -
        patient_contribution -
        additional_hospital_contribution;

    safe_set(
        frm,
        "apf_contribution",
        Math.max(0, apf_contribution)
    );
}

function calculate_other_donor_contribution(frm) {

    if (frm.doc.does_it_require_apf_contribution === "No") {

        let value =
            (flt(frm.doc.total_actual_final_bill_in_rs) || 0)
            - (flt(frm.doc.patient_contribution_yes) || 0)
            - (flt(frm.doc.additional_hospital_contribution) || 0);

        frm.set_value(
            "other_donor_contribution",
            Math.max(0, value)
        );

    } else {

        frm.set_value(
            "other_donor_contribution",
            0
        );
    }
}

function load_subsidy(frm) {

    if (!frm.doc.organization_copy) return;

    frappe.db.get_list("Hospital Registrations", {
        filters: {
            hospital_name: frm.doc.organization_copy
        },
        fields: ["agreed_method_for_subsidy"],
        limit: 1
    }).then(r => {

        if (r.length) {

            let subsidy = r[0].agreed_method_for_subsidy || "";
            let $wrapper = frm.fields_dict.agreed_method_for_subsidy.$wrapper;

            // Built via DOM APIs (not an HTML string) and passed to msgprint
            // pre-escaped — "Agreed method for subsidy" is free text on
            // Hospital Registrations and must never be interpreted as HTML.
            $wrapper.empty();
            $('<a href="#">View Agreed Method For Subsidy</a>')
                .css({
                    color: '#0066cc',
                    'font-weight': 'bold',
                    'text-decoration': 'underline'
                })
                .on('click', function (e) {
                    e.preventDefault();
                    frappe.msgprint(frappe.utils.escape_html(subsidy));
                })
                .appendTo($wrapper);
        }
    });
}
