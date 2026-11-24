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
		this.ensure_style();
		frappe.call({
			method: 'nwp.nwp.page.central_sync_status.central_sync_status.get_page_context',
			callback: (r) => {
				this.is_central = !!(r.message || {}).is_central;
				this.build();
			},
		});
	}

	build() {
		if (this.is_central) {
			this.make_central_intro();
			this.make_central_summary_panel();
			this.make_organization_panel();
			this.make_central_filters();
			this.make_table_area();
			this.refresh_central();
			return;
		}

		this.make_intro();
		this.make_summary_panel();
		this.make_fields_panel();
		this.make_recent_runs_panel();
		this.make_filters();
		this.make_table_area();
		this.refresh();
	}

	ensure_style() {
		if (document.getElementById('nwp-css-style')) return;
		const style = document.createElement('style');
		style.id = 'nwp-css-style';
		style.textContent = `
.nwp-css-panel{background:var(--card-bg);border:1px solid var(--border-color);border-radius:10px;padding:18px 20px;margin-bottom:16px;}
.nwp-css-tag{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:12px;}
.nwp-css-intro{color:var(--text-light);font-size:13px;margin:-4px 0 16px;}

/* fields panel */
.nwp-fields-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;}
.nwp-field-card{background:var(--subtle-accent);border-radius:8px;padding:12px 14px;}
.nwp-field-card.nwp-field-warn{background:var(--alert-bg-warning);}
.nwp-field-card-title{font-size:12px;font-weight:600;color:var(--text-color);margin-bottom:6px;}
.nwp-field-card-title.nwp-warn-text{color:var(--alert-text-warning);}
.nwp-field-card-body{font-size:12.5px;color:var(--text-light);line-height:1.6;}
.nwp-never-shared{margin-top:14px;font-size:12px;color:var(--alert-text-warning);background:var(--alert-bg-warning);border-radius:8px;padding:10px 14px;}

/* stat tiles */
.nwp-stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px;}
.nwp-stat-card{border:1px solid var(--border-color);border-radius:10px;padding:16px 18px;background:var(--fg-color);}
.nwp-stat-label{font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.3px;}
.nwp-stat-value{font-size:34px;font-weight:700;color:var(--text-color);line-height:1.2;margin-top:4px;}
.nwp-stat-caption{font-size:12px;color:var(--text-light);margin-bottom:10px;}
.nwp-chip-row{display:flex;flex-wrap:wrap;gap:6px;}
.nwp-chip{font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;}
.nwp-chip-warning{background:var(--alert-bg-warning);color:var(--alert-text-warning);}
.nwp-chip-danger{background:var(--alert-bg-danger);color:var(--alert-text-danger);}
.nwp-chip-muted{background:var(--subtle-accent);color:var(--text-light);}

/* ranked bar (claims by type of service) */
.nwp-rank-row{display:grid;grid-template-columns:140px 1fr 36px;align-items:center;gap:10px;padding:6px 0;}
.nwp-rank-label{font-size:12.5px;color:var(--text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.nwp-rank-track{height:8px;border-radius:4px;background:var(--subtle-accent);overflow:hidden;}
.nwp-rank-fill{height:100%;border-radius:4px;background:var(--blue-500);}
.nwp-rank-value{font-size:12.5px;color:var(--text-light);text-align:right;}

/* recent runs */
.nwp-runs-table{width:100%;border-collapse:collapse;font-size:12.5px;}
.nwp-runs-table th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.3px;color:var(--text-muted);font-weight:600;padding:0 10px 8px 0;border-bottom:1px solid var(--border-color);}
.nwp-runs-table td{padding:8px 10px 8px 0;border-bottom:1px solid var(--border-color);color:var(--text-color);vertical-align:top;}
.nwp-runs-table tr:last-child td{border-bottom:none;}
.nwp-badge{display:inline-block;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:600;white-space:nowrap;}
.nwp-badge-success{background:var(--alert-bg-success);color:var(--alert-text-success);}
.nwp-badge-warning{background:var(--alert-bg-warning);color:var(--alert-text-warning);}
.nwp-badge-danger{background:var(--alert-bg-danger);color:var(--alert-text-danger);}

/* record table */
.nwp-table-wrapper .dt-scrollable{border-radius:8px;border:1px solid var(--border-color);}
`;
		document.head.appendChild(style);
	}

	make_intro() {
		$(`<div class="nwp-css-intro">Exactly what this organization has shared with the central site, and what's still pending.</div>`).appendTo(
			this.page.body
		);
	}

	make_summary_panel() {
		this.$summary = $('<div class="nwp-css-panel"><div class="nwp-css-tag">What\'s Gone To Central</div>Loading…</div>').appendTo(
			this.page.body
		);
		this.load_summary();
	}

	load_summary() {
		frappe.call({
			method: 'nwp.nwp.page.central_sync_status.central_sync_status.get_summary',
			callback: (r) => this.render_summary(r.message || {}),
		});
	}

	render_summary(data) {
		const counts = data.counts || {};

		const card = (label, c) => `
			<div class="nwp-stat-card">
				<div class="nwp-stat-label">${frappe.utils.escape_html(label)}</div>
				<div class="nwp-stat-value">${c.sent}</div>
				<div class="nwp-stat-caption">sent to central</div>
				<div class="nwp-chip-row">
					<span class="nwp-chip nwp-chip-warning">${c.pending} pending</span>
					<span class="nwp-chip nwp-chip-danger">${c.failed} failed</span>
					<span class="nwp-chip nwp-chip-muted">${c.this_month} this month</span>
				</div>
			</div>`;

		const statsHtml = Object.keys(counts)
			.map((label) => card(label, counts[label]))
			.join('');

		const byService = data.by_service || [];
		const maxCount = Math.max(1, ...byService.map((r) => r.count));
		const rankHtml = byService
			.map(
				(row) => `
				<div class="nwp-rank-row">
					<span class="nwp-rank-label">${frappe.utils.escape_html(row.service || 'Not set')}</span>
					<div class="nwp-rank-track"><div class="nwp-rank-fill" style="width:${(row.count / maxCount) * 100}%"></div></div>
					<span class="nwp-rank-value">${row.count}</span>
				</div>`
			)
			.join('');

		this.$summary.html(`
			<div class="nwp-css-tag">What's Gone To Central</div>
			<div class="nwp-stat-grid">${statsHtml}</div>
			${
				rankHtml
					? `<div class="nwp-css-tag" style="margin-top:18px;">Claims By Type Of Service</div>${rankHtml}`
					: ''
			}
		`);
	}

	make_central_intro() {
		$(`<div class="nwp-css-intro">Data received from every partner organization, all in one place.</div>`).appendTo(
			this.page.body
		);
	}

	make_central_summary_panel() {
		this.$summary = $('<div class="nwp-css-panel"><div class="nwp-css-tag">Data Received</div>Loading…</div>').appendTo(
			this.page.body
		);
		frappe.call({
			method: 'nwp.nwp.page.central_sync_status.central_sync_status.get_central_summary',
			callback: (r) => this.render_central_summary(r.message || {}),
		});
	}

	render_central_summary(data) {
		const counts = data.counts || {};

		const card = (label, c) => `
			<div class="nwp-stat-card">
				<div class="nwp-stat-label">${frappe.utils.escape_html(label)}</div>
				<div class="nwp-stat-value">${c.total}</div>
				<div class="nwp-stat-caption">total received</div>
				<div class="nwp-chip-row">
					<span class="nwp-chip nwp-chip-muted">${c.this_month} this month</span>
				</div>
			</div>`;

		const statsHtml = Object.keys(counts)
			.map((label) => card(label, counts[label]))
			.join('');

		const byService = data.by_service || [];
		const maxCount = Math.max(1, ...byService.map((r) => r.count));
		const rankHtml = byService
			.map(
				(row) => `
				<div class="nwp-rank-row">
					<span class="nwp-rank-label">${frappe.utils.escape_html(row.service || 'Not set')}</span>
					<div class="nwp-rank-track"><div class="nwp-rank-fill" style="width:${(row.count / maxCount) * 100}%"></div></div>
					<span class="nwp-rank-value">${row.count}</span>
				</div>`
			)
			.join('');

		this.$summary.html(`
			<div class="nwp-css-tag">Data Received</div>
			<div class="nwp-stat-grid">${statsHtml}</div>
			${
				rankHtml
					? `<div class="nwp-css-tag" style="margin-top:18px;">Claims By Type Of Service</div>${rankHtml}`
					: ''
			}
		`);
	}

	make_organization_panel() {
		this.$orgs = $('<div class="nwp-css-panel"><div class="nwp-css-tag">Data Received By Partner Organization</div>Loading…</div>').appendTo(
			this.page.body
		);
		frappe.call({
			method: 'nwp.nwp.page.central_sync_status.central_sync_status.get_intake_by_organization',
			callback: (r) => {
				this.org_rows = r.message || [];
				this.filter_organization_panel();
			},
		});
	}

	filter_organization_panel() {
		if (!this.org_rows) return;
		const organization = this.organization_field ? this.organization_field.get_value() : '';
		const rows = organization ? this.org_rows.filter((row) => row.organization === organization) : this.org_rows;
		this.render_organizations(rows);
	}

	render_organizations(rows) {
		if (!rows.length) {
			this.$orgs.html(
				'<div class="nwp-css-tag">Data Received By Partner Organization</div><div class="text-muted" style="font-size:13px;">No data yet.</div>'
			);
			return;
		}

		const list_link = (doctype, organization, count) => {
			if (!count) return count;
			const slug = doctype.toLowerCase().replace(/ /g, '-');
			const route = `/desk/${slug}${frappe.utils.make_query_string({ organization })}`;
			return `<a href="${route}" target="_blank" rel="noopener">${count}</a>`;
		};

		const body = rows
			.map(
				(row) => `
				<tr>
					<td>${frappe.utils.escape_html(row.organization || 'Not set')}</td>
					<td>${list_link('Patient Registration', row.organization, row.registrations)}</td>
					<td>${list_link('Patient Claim Form', row.organization, row.claims)}</td>
					<td><b>${row.registrations + row.claims}</b></td>
				</tr>`
			)
			.join('');

		this.$orgs.html(`
			<div class="nwp-css-tag">Data Received By Partner Organization</div>
			<table class="nwp-runs-table">
				<thead><tr><th>Organization</th><th>Registrations</th><th>Claims</th><th>Total</th></tr></thead>
				<tbody>${body}</tbody>
			</table>
		`);
	}

	make_central_filters() {
		const page = this.page;
		this.organization_field = page.add_field({
			fieldname: 'organization',
			label: 'Organization',
			fieldtype: 'Link',
			options: 'Organization Name',
			change: () => {
				this.refresh_central();
				this.filter_organization_panel();
			},
		});
		this.from_date_field = page.add_field({
			fieldname: 'from_date',
			label: 'Received From',
			fieldtype: 'Date',
			change: () => this.refresh_central(),
		});
		this.to_date_field = page.add_field({
			fieldname: 'to_date',
			label: 'Received To',
			fieldtype: 'Date',
			change: () => this.refresh_central(),
		});
		page.set_secondary_action('Refresh', () => this.refresh_central());
		page.add_menu_item('Export Visible Rows (CSV)', () => this.export_central_csv());
	}

	refresh_central() {
		this.$count.text('Loading...');
		frappe.call({
			method: 'nwp.nwp.page.central_sync_status.central_sync_status.get_central_records',
			args: {
				filters: {
					organization: this.organization_field.get_value(),
					from_date: this.from_date_field.get_value(),
					to_date: this.to_date_field.get_value(),
				},
			},
			freeze: true,
			callback: (r) => {
				this.rows = r.message || [];
				this.$count.text(this.rows.length + ' row(s)');
				this.render_central_table(this.rows);
			},
		});
	}

	export_central_csv() {
		const rows = this.rows || [];
		if (!rows.length) {
			frappe.msgprint(__('Nothing to export.'));
			return;
		}
		const header = ['Record', 'Type', 'Organization', 'Received At'];
		const lines = [
			header,
			...rows.map((r) => [r.record, r.type, r.organization || '', r.received_at || '']),
		];
		const csv = lines.map((line) => line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `central-received-${frappe.datetime.now_date()}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	render_central_table(rows) {
		const open_link = (doctype, name) => {
			const route = frappe.utils.get_form_link(doctype, name);
			return `<a href="${route}" target="_blank" rel="noopener">${frappe.utils.escape_html(name)}</a>`;
		};

		const columns = [
			{ name: 'Record', width: 150, format: (v, row, col, data) => open_link(data._doctype, v) },
			{ name: 'Type', width: 120 },
			{ name: 'Organization', width: 220 },
			{ name: 'Received At', width: 150 },
		].map((c) => Object.assign({ editable: false, resizable: true }, c));

		const data = rows.map((row) => ({
			Record: row.record,
			Type: row.type,
			Organization: row.organization || '',
			'Received At': row.received_at ? frappe.datetime.str_to_user(String(row.received_at).slice(0, 10)) : '',
			_doctype: row.doctype,
		}));

		if (this.datatable) {
			this.datatable.refresh(data, columns);
			return;
		}

		this.datatable = new frappe.DataTable(this.$table_wrapper.get(0), {
			columns: columns,
			data: data,
			layout: 'fluid',
			cellHeight: 35,
			serialNoColumn: true,
			checkboxColumn: false,
			noDataMessage: __('No records yet'),
		});
	}

	make_fields_panel() {
		frappe.call({
			method: 'nwp.nwp.page.central_sync_status.central_sync_status.get_shared_fields',
			callback: (r) => {
				const fields = r.message || {};
				const cards = Object.keys(fields)
					.map((key) => {
						const isExcluded = key === 'Excluded By This Organization';
						return `
						<div class="nwp-field-card${isExcluded ? ' nwp-field-warn' : ''}">
							<div class="nwp-field-card-title${isExcluded ? ' nwp-warn-text' : ''}">${frappe.utils.escape_html(key)}</div>
							<div class="nwp-field-card-body">${fields[key].map(frappe.utils.escape_html).join(', ')}</div>
						</div>`;
					})
					.join('');

				$(`
					<div class="nwp-css-panel">
						<div class="nwp-css-tag">Fields We Share With Central</div>
						<div class="nwp-fields-grid">${cards}</div>
						<div class="nwp-never-shared">Never shared: assessment answers, internal remarks, draft/unapproved claims.</div>
					</div>
				`).appendTo(this.page.body);
			},
		});
	}

	make_recent_runs_panel() {
		this.$runs = $('<div class="nwp-css-panel"><div class="nwp-css-tag">Recent Sync Runs</div>Loading…</div>').appendTo(
			this.page.body
		);
		frappe.call({
			method: 'nwp.nwp.page.central_sync_status.central_sync_status.get_recent_runs',
			callback: (r) => this.render_recent_runs(r.message || []),
		});
	}

	render_recent_runs(runs) {
		const badgeClass = (status) =>
			status === 'Success' ? 'nwp-badge-success' : status === 'Failed' ? 'nwp-badge-danger' : 'nwp-badge-warning';

		if (!runs.length) {
			this.$runs.html('<div class="nwp-css-tag">Recent Sync Runs</div><div class="text-muted" style="font-size:13px;">No runs logged yet.</div>');
			return;
		}

		const rows = runs
			.map(
				(run) => `
				<tr>
					<td>${frappe.datetime.str_to_user(run.run_at)}</td>
					<td><span class="nwp-badge ${badgeClass(run.status)}">${run.status}</span></td>
					<td>${run.registrations_pushed}</td>
					<td>${run.claims_pushed}</td>
					<td>${run.failed_count}</td>
				</tr>`
			)
			.join('');

		this.$runs.html(`
			<div class="nwp-css-tag">Recent Sync Runs</div>
			<table class="nwp-runs-table">
				<thead><tr><th>When</th><th>Status</th><th>Registrations</th><th>Claims</th><th>Failed</th></tr></thead>
				<tbody>${rows}</tbody>
			</table>
		`);
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
		this.from_date_field = page.add_field({
			fieldname: 'from_date',
			label: 'Sent From',
			fieldtype: 'Date',
			change: () => this.refresh(),
		});
		this.to_date_field = page.add_field({
			fieldname: 'to_date',
			label: 'Sent To',
			fieldtype: 'Date',
			change: () => this.refresh(),
		});
		page.set_secondary_action('Refresh', () => this.refresh());
		page.add_menu_item('Export Visible Rows (CSV)', () => this.export_csv());
	}

	make_table_area() {
		this.$count = $('<div class="text-muted" style="margin:10px 0;font-size:12.5px;"></div>').appendTo(this.page.body);
		this.$table_wrapper = $('<div class="nwp-table-wrapper"></div>').appendTo(this.page.body);
	}

	refresh() {
		this.$count.text('Loading...');
		frappe.call({
			method: 'nwp.nwp.page.central_sync_status.central_sync_status.get_status',
			args: {
				filters: {
					status: this.status_field.get_value(),
					from_date: this.from_date_field.get_value(),
					to_date: this.to_date_field.get_value(),
				},
			},
			freeze: true,
			callback: (r) => {
				this.rows = r.message || [];
				this.$count.text(this.rows.length + ' row(s)');
				this.render_table(this.rows);
				this.load_summary();
			},
		});
	}

	export_csv() {
		const rows = this.rows || [];
		if (!rows.length) {
			frappe.msgprint(__('Nothing to export.'));
			return;
		}
		const header = ['Record', 'Type', 'Status', 'Error', 'Sent At', 'Last Modified'];
		const lines = [
			header,
			...rows.map((r) => [r.record, r.type, r.status, r.error || '', r.pushed_at || '', r.modified || '']),
		];
		const csv = lines.map((line) => line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `central-sync-status-${frappe.datetime.now_date()}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	render_table(rows) {
		const badge = (status) => {
			const cls = status === 'Sent' ? 'nwp-badge-success' : status === 'Failed' ? 'nwp-badge-danger' : 'nwp-badge-warning';
			return `<span class="nwp-badge ${cls}">${status}</span>`;
		};

		const open_link = (doctype, name) => {
			const route = frappe.utils.get_form_link(doctype, name);
			return `<a href="${route}" target="_blank" rel="noopener">${frappe.utils.escape_html(name)}</a>`;
		};

		const columns = [
			{ name: 'Record', width: 150, format: (v, row, col, data) => open_link(data._doctype, v) },
			{ name: 'Type', width: 110 },
			{ name: 'Status', width: 100, align: 'center', format: (v) => badge(v) },
			{ name: 'Error', width: 180 },
			{ name: 'Sent At', width: 140 },
			{ name: 'Last Modified', width: 140 },
		].map((c) => Object.assign({ editable: false, resizable: true }, c));

		const data = rows.map((row) => ({
			Record: row.record,
			Type: row.type,
			Status: row.status,
			Error: row.error || '',
			'Sent At': row.pushed_at ? frappe.datetime.str_to_user(String(row.pushed_at).slice(0, 10)) : '',
			'Last Modified': row.modified ? frappe.datetime.str_to_user(String(row.modified).slice(0, 10)) : '',
			_doctype: row.doctype,
		}));

		if (this.datatable) {
			this.datatable.refresh(data, columns);
			return;
		}

		this.datatable = new frappe.DataTable(this.$table_wrapper.get(0), {
			columns: columns,
			data: data,
			layout: 'fluid',
			cellHeight: 35,
			serialNoColumn: true,
			checkboxColumn: false,
			noDataMessage: __('No records yet'),
		});
	}
}
