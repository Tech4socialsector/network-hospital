frappe.pages['central-sync-status'].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Central Sync Status',
		single_column: true,
	});

	new CentralSyncStatus(page);
};

class CentralSyncStatus {
	constructor(page) {
		this.page = page;
		this.make_fields_panel();
		this.make_filters();
		this.make_table_area();
		this.refresh();
	}

	make_fields_panel() {
		frappe.call({
			method: 'nwp.nwp.page.central_sync_status.central_sync_status.get_shared_fields',
			callback: (r) => {
				const fields = r.message || {};
				const rows = Object.keys(fields)
					.map(
						(key) => `
						<div class="nwp-css-row">
							<span class="nwp-css-k">${frappe.utils.escape_html(key)}</span>
							<span class="nwp-css-v">${fields[key].map(frappe.utils.escape_html).join(', ')}</span>
						</div>`
					)
					.join('');

				$(`
					<div class="nwp-css-panel">
						<div class="nwp-css-tag">Fields We Share With Central</div>
						${rows}
						<div class="nwp-css-row">
							<span class="nwp-css-k">Never shared</span>
							<span class="nwp-css-v nwp-css-warn">assessment answers, internal remarks, draft/unapproved claims</span>
						</div>
					</div>
				`).appendTo(this.page.body);
			},
		});

		if (!document.getElementById('nwp-css-style')) {
			const style = document.createElement('style');
			style.id = 'nwp-css-style';
			style.textContent = `
.nwp-css-panel{background:#fff;border:1px solid #e3e8ef;border-radius:10px;padding:16px 18px;margin-bottom:18px;}
.nwp-css-tag{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#5c6a62;margin-bottom:10px;}
.nwp-css-row{display:flex;gap:16px;padding:6px 0;border-top:1px solid #f0f2ef;font-size:13px;}
.nwp-css-row:first-of-type{border-top:none;}
.nwp-css-k{flex:0 0 160px;color:#7a8899;}
.nwp-css-v{flex:1;}
.nwp-css-warn{color:#b45309;}
.nwp-css-badge{display:inline-block;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:600;}
.nwp-css-badge-sent{background:#dcfce7;color:#166534;}
.nwp-css-badge-pending{background:#f1f5f9;color:#64748b;}
.nwp-css-badge-failed{background:#fee2e2;color:#991b1b;}
`;
			document.head.appendChild(style);
		}
	}

	make_filters() {
		const page = this.page;
		this.status_field = page.add_field({
			fieldname: 'status',
			label: 'Status',
			fieldtype: 'Select',
			options: '\nSent\nPending\nFailed',
			change: () => this.refresh(),
		});
		page.set_secondary_action('Refresh', () => this.refresh());
	}

	make_table_area() {
		this.$count = $('<div class="text-muted" style="margin:10px 0;"></div>').appendTo(this.page.body);
		this.$table_wrapper = $('<div></div>').appendTo(this.page.body);
	}

	refresh() {
		this.$count.text('Loading...');
		frappe.call({
			method: 'nwp.nwp.page.central_sync_status.central_sync_status.get_status',
			args: { filters: { status: this.status_field.get_value() } },
			freeze: true,
			callback: (r) => {
				const rows = r.message || [];
				this.$count.text(rows.length + ' row(s)');
				this.render_table(rows);
			},
		});
	}

	render_table(rows) {
		const badge = (status) => {
			const cls =
				status === 'Sent' ? 'nwp-css-badge-sent' : status === 'Failed' ? 'nwp-css-badge-failed' : 'nwp-css-badge-pending';
			return `<span class="nwp-css-badge ${cls}">${status}</span>`;
		};

		const columns = [
			{ name: 'Record', width: 150 },
			{ name: 'Type', width: 120 },
			{ name: 'Status', width: 120, align: 'center', format: (v) => badge(v) },
			{ name: 'Error', width: 260 },
			{ name: 'Last Modified', width: 150 },
		].map((c) => Object.assign({ editable: false, resizable: true }, c));

		const data = rows.map((row) => [
			row.record,
			row.type,
			row.status,
			row.error || '',
			row.modified ? frappe.datetime.str_to_user(String(row.modified).slice(0, 10)) : '',
		]);

		if (this.datatable) {
			this.datatable.refresh(data, columns);
			return;
		}

		this.datatable = new frappe.DataTable(this.$table_wrapper.get(0), {
			columns: columns,
			data: data,
			layout: 'fixed',
			cellHeight: 35,
			serialNoColumn: true,
			checkboxColumn: false,
			noDataMessage: __('No records yet'),
		});
	}
}
