// Copyright (c) 2026, TFSS and contributors
// For license information, please see license.txt

function calculate_assessment_total(frm) {
    var total = 0;
    (frm.doc.assessment_answers || []).forEach(function(row) {
        total += flt(row.score);
    });
    frm.set_value('total_score', total);
}

frappe.ui.form.on('Patient Registration', {
    setup: function(frm) {
        frm.set_query('district', function() {
            return {
                filters: {
                    state: frm.doc.state || ''
                }
            };
        });

        // Each assessment question has its own option list, so the choices
        // for 'selected_option' differ per row — scope the query to this
        // row's own question.
        frm.set_query('selected_option', 'assessment_answers', function(doc, cdt, cdn) {
            var row = locals[cdt][cdn];
            return {
                filters: {
                    question: row.question
                }
            };
        });
    },

    onload: function(frm) {
        // The organization's question list lives in Assessment Question —
        // populate one answer row per question currently defined there as
        // soon as a new registration is opened.
        if (frm.is_new() && !(frm.doc.assessment_answers || []).length) {
            frm.call({
                method: 'get_assessment_questions',
                doc: frm.doc,
                freeze: true,
                freeze_message: __('Loading assessment questions...'),
                callback: function() {
                    frm.refresh_field('assessment_answers');
                    calculate_assessment_total(frm);
                }
            });
        }
    },

    state: function(frm) {
        frm.set_value('district', '');
    },

    assessment_answers_remove: function(frm) {
        calculate_assessment_total(frm);
    },

    pincode: function(frm) {
        if (!frm.doc.pincode) {
            return;
        }
        if (!/^\d{6}$/.test(frm.doc.pincode)) {
            return;
        }
        frappe.call({
            method: 'nwp.nwp.doctype.patient_registration.patient_registration.get_location_from_pincode',
            args: { pincode: frm.doc.pincode },
            freeze: true,
            freeze_message: __('Fetching location details...'),
            callback: function(r) {
                if (!r.message) {
                    return;
                }
                // set_value on 'state' triggers the state handler above, which
                // clears district — chain district/block after it settles so
                // the API values are what's left in the form, not cleared.
                frm.set_value('state', r.message.state).then(function() {
                    frm.set_value('district', r.message.district);
                    if (r.message.block) {
                        frm.set_value('block', r.message.block);
                    }
                });
            }
        });
    },

    verified_on: function(frm) {
        if (frm.doc.assessed_on && frm.doc.verified_on) {
            if (frappe.datetime.str_to_obj(frm.doc.verified_on) < frappe.datetime.str_to_obj(frm.doc.assessed_on)) {
                frappe.msgprint(__('Verified On cannot be earlier than Assessed On.'));
                frm.set_value('verified_on', '');
            }
        }
    },

    assessed_on: function(frm) {
        if (frm.doc.assessed_on && frm.doc.verified_on) {
            if (frappe.datetime.str_to_obj(frm.doc.verified_on) < frappe.datetime.str_to_obj(frm.doc.assessed_on)) {
                frappe.msgprint(__('Verified On must be greater than or equal to Assessed On.'));
                frm.set_value('verified_on', '');
            }
        }
    }
});

frappe.ui.form.on('Patient Assessment Answer', {
    // 'score' is fetch_from'd off 'selected_option' the moment a row picks
    // one, so this fires right after the score lands on the row.
    score: function(frm) {
        calculate_assessment_total(frm);
    }
});
