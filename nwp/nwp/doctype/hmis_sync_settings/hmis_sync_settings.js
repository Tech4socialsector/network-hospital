// Copyright (c) 2026, TFSS and contributors
// For license information, please see license.txt

frappe.ui.form.on("HMIS Sync Settings", {
	refresh(frm) {
		frm.add_custom_button(__("Test Connection"), () => {
			frappe.show_alert({ message: __("Testing Bahmni and Odoo connections..."), indicator: "blue" });
			frappe.call({
				method: "nwp.nwp.doctype.hmis_sync_settings.hmis_sync_settings.test_connection",
				callback: (r) => {
					if (!r.message) return;
					const { bahmni, odoo } = r.message;
					frappe.msgprint({
						title: __("Connection Test"),
						message:
							`<b>Bahmni:</b> ${bahmni.ok ? "✅ " + __("Connected") : "❌ " + frappe.utils.escape_html(bahmni.error || "Failed")}` +
							"<br>" +
							`<b>Odoo:</b> ${odoo.ok ? "✅ " + __("Connected") : "❌ " + frappe.utils.escape_html(odoo.error || "Failed")}`,
						indicator: bahmni.ok && odoo.ok ? "green" : "orange",
					});
				},
			});
		});

		frm.add_custom_button(
			__("Preview Bahmni Fields"),
			() => {
				frappe.call({
					method: "nwp.nwp.doctype.hmis_sync_settings.hmis_sync_settings.preview_bahmni_fields",
					freeze: true,
					callback: (r) => show_preview_dialog(__("Bahmni — Sample Patient Record"), r.message),
				});
			},
			__("Preview Fields")
		);

		frm.add_custom_button(
			__("Preview Bahmni Visit/Clinical Fields"),
			() => {
				frappe.call({
					method: "nwp.nwp.doctype.hmis_sync_settings.hmis_sync_settings.preview_bahmni_visit",
					freeze: true,
					callback: (r) => show_preview_dialog(__("Bahmni — Sample Visit Record"), r.message),
				});
			},
			__("Preview Fields")
		);

		frm.add_custom_button(
			__("Preview Odoo Fields"),
			() => {
				frappe.call({
					method: "nwp.nwp.doctype.hmis_sync_settings.hmis_sync_settings.preview_odoo_fields",
					freeze: true,
					callback: (r) => show_preview_dialog(__("Odoo — Sample Invoice Record"), r.message),
				});
			},
			__("Preview Fields")
		);

		frm.add_custom_button(__("Run Now"), () => {
			frappe.show_alert({ message: __("Running sync — this may take a moment..."), indicator: "blue" });
			frappe.call({
				method: "nwp.nwp.doctype.hmis_sync_settings.hmis_sync_settings.run_now",
				freeze: true,
				freeze_message: __("Syncing with Bahmni and Odoo..."),
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

function show_preview_dialog(title, data) {
	if (!data) return;
	const d = new frappe.ui.Dialog({
		title,
		fields: [
			{
				fieldtype: "Code",
				fieldname: "preview",
				options: "JSON",
				read_only: 1,
			},
		],
	});
	d.set_value("preview", JSON.stringify(data, null, 2));
	d.show();
}
