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
