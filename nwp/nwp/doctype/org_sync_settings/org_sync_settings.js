frappe.realtime.on("org_sync_push_complete", (data) => {
	frappe.msgprint({
		title: __(data.title),
		indicator: "green",
		message: data.message,
	});
	if (cur_frm && cur_frm.doctype === "Org Sync Settings") {
		cur_frm.reload_doc();
	}
});

frappe.ui.form.on("Org Sync Settings", {
	refresh(frm) {
		frm.add_custom_button(__("Run Now"), () => {
			frappe.call({
				method: "nwp.nwp.doctype.org_sync_settings.org_sync_settings.run_now",
				freeze: true,
				freeze_message: __("Starting sync..."),
				callback: (r) => {
					// This only confirms the push has been QUEUED, not that
					// it's finished — the actual work runs in the
					// background (it can involve thousands of records, so
					// it must not block here). The real "Push Complete"
					// popup arrives on its own a bit later, via the
					// progress bar and completion notification the
					// background job sends when it actually finishes.
					frappe.show_alert(
						{ message: r.message || __("Sync started."), indicator: "blue" },
						10
					);
				},
			});
		});

		frm.add_custom_button(__("Retry Failed Records (Slowly)"), () => {
			frappe.confirm(
				__(
					"This re-attempts only the records currently stuck with an error, one at a time with a real pause between each. It can take several minutes for a large number of failures. Continue?"
				),
				() => {
					frappe.call({
						method: "nwp.nwp.doctype.org_sync_settings.org_sync_settings.retry_failed_slowly",
						freeze: true,
						freeze_message: __("Starting slow retry..."),
						callback: (r) => {
							frappe.show_alert(
								{ message: r.message || __("Retry started."), indicator: "blue" },
								10
							);
						},
					});
				}
			);
		});
	},
});
