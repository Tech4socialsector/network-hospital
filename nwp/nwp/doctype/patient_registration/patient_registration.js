// Copyright (c) 2026, TFSS and contributors
// For license information, please see license.txt

frappe.ui.form.on('Patient Registration', {
    setup: function(frm) {
        frm.set_query('district', function() {
            return {
                filters: {
                    state: frm.doc.state || ''
                }
            };
        });
    },

    state: function(frm) {
        frm.set_value('district', '');
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
