// Copyright (c) 2026, TFSS and contributors
// For license information, please see license.txt

frappe.ui.form.on("HMIS Sync Settings", {
	refresh(frm) {
		frm.add_custom_button(__("Test Connection"), () => {
			if (frm.is_dirty()) {
				frappe.msgprint(__("Please Save first, then test."));
				return;
			}
			frappe.call({
				method: "nwp.nwp.doctype.hmis_sync_settings.hmis_sync_settings.test_metabase_connection",
				freeze: true,
				freeze_message: __("Connecting to Metabase..."),
				callback(r) {
					frappe.msgprint({
						title: __("Connection Test"),
						indicator: r.message.includes("❌") ? "orange" : "green",
						message: r.message,
					});
				},
			});
		});

		add_preview_button(frm, __("Preview Patient Visits"), "preview_bahmni_patient_visits", __("Metabase — Sample Patient Visit Row"));
		add_preview_button(frm, __("Preview Invoices"), "preview_odoo_invoices", __("Metabase — Sample Invoice Row"));

		frm.add_custom_button(__("Run Now"), () => {
			if (frm.is_dirty()) {
				frappe.msgprint(__("Please Save first, then run."));
				return;
			}
			frappe.call({
				method: "nwp.nwp.doctype.hmis_sync_settings.hmis_sync_settings.run_now",
				freeze: true,
				freeze_message: __("Syncing via Metabase..."),
				callback: (r) => {
					frm.reload_doc();
					if (!r.message) return;
					frappe.msgprint({
						title: __("Sync Complete"),
						message: r.message,
						indicator: "green",
					});
				},
			});
		});
	},
});

function add_preview_button(frm, label, method_name, dialog_title) {
	frm.add_custom_button(label, () => {
		if (frm.is_dirty()) {
			frappe.msgprint(__("Please Save first, then preview."));
			return;
		}
		frappe.call({
			method: `nwp.nwp.doctype.hmis_sync_settings.hmis_sync_settings.${method_name}`,
			freeze: true,
			callback: (r) => {
				if (!r.message) return;
				const d = new frappe.ui.Dialog({
					title: dialog_title,
					fields: [{ fieldtype: "Code", fieldname: "preview", options: "JSON", read_only: 1 }],
				});
				d.set_value("preview", JSON.stringify(r.message, null, 2));
				d.show();
			},
		});
	});
}
