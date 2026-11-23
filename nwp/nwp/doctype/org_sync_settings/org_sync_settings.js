frappe.ui.form.on("Org Sync Settings", {
	refresh(frm) {
		frm.add_custom_button(__("Run Now"), () => {
			frappe.call({
				method: "nwp.nwp.doctype.org_sync_settings.org_sync_settings.run_now",
				freeze: true,
				callback: (r) => {
					frm.reload_doc();
					frappe.msgprint({
						title: __("Push Complete"),
						indicator: "green",
						message: r.message || __("Nothing to push."),
					});
				},
			});
		});
	},
});
