frappe.pages['central-sync-status'].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Central Sync Status',
		single_column: true,
	});

	new CentralSyncStatus(page);
};

// Which color/icon each record type gets, everywhere on the page — one
// place to change if a new synced doctype is ever added.
const TYPE_STYLE = {
	Registration: {
		bg: '#eef2ff',
		fg: '#4f46e5',
		icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
	},
	'Claim Form': {
		bg: '#f0f9ff',
		fg: '#0284c7',
		icon: '<path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>',
	},
	Budget: {
		bg: '#ecfdf5',
		fg: '#059669',
		icon: '<path d="M3 10l9-6 9 6"/><path d="M5 10v9M9 10v9M15 10v9M19 10v9"/><path d="M3 21h18"/>',
	},
	Disbursement: {
		bg: '#fffbeb',
		fg: '#d97706',
		icon: '<rect x="2" y="7" width="20" height="10" rx="2"/><circle cx="12" cy="12" r="2.3"/><path d="M6 7v10M18 7v10"/>',
	},
};

const GROUP_STYLE = {
	patient: {
		label: 'Patient Data',
		caption: 'Registrations and claims',
		bg: '#eef2ff',
		fg: '#4f46e5',
		icon: '<path d="M20.8 4.6a5 5 0 0 0-7.1 0L12 6.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21l8.8-9.3a5 5 0 0 0 0-7.1z"/>',
	},
	financial: {
		label: 'Financial Data',
		caption: 'Budgets and disbursements',
		bg: '#ecfdf5',
		fg: '#059669',
		icon: '<rect x="2" y="7" width="20" height="10" rx="2"/><circle cx="12" cy="12" r="2.3"/><path d="M6 7v10M18 7v10"/>',
	},
};

function svg_icon(pathData, color, size) {
	return `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="${size}" height="${size}">${pathData}</svg>`;
}

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
		this.make_group_table_area('patient');
		this.make_group_table_area('financial');
		this.refresh_group('patient');
		this.refresh_group('financial');
	}

	ensure_style() {
		if (document.getElementById('nwp-css-style')) return;
		const style = document.createElement('style');
		style.id = 'nwp-css-style';
		style.textContent = `
.nwp-css-panel{background:#fff;border:1px solid #f1f0f9;border-radius:14px;box-shadow:0 1px 3px rgba(20,16,60,.05);padding:18px 20px;margin-bottom:16px;}
.nwp-css-tag{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:12px;}
.nwp-css-intro{color:#8b8aa0;font-size:13px;margin:-4px 0 16px;}

/* page header */
.nwp-page-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;}
.nwp-page-header-left{display:flex;align-items:center;gap:14px;}
.nwp-page-logo{width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.nwp-page-title{font-size:20px;font-weight:800;margin:0;letter-spacing:-.3px;color:var(--text-color);}
.nwp-page-subtitle{font-size:13px;color:#8b8aa0;margin-top:2px;}

/* section header */
.nwp-section-header{display:flex;align-items:center;gap:10px;margin:4px 0 14px;}
.nwp-section-icon{width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.nwp-section-title{font-size:14.5px;font-weight:700;color:var(--text-color);}
.nwp-section-caption{font-size:12px;color:#b2b0c4;}

/* fields panel */
.nwp-fields-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;}
.nwp-field-card{background:#f8f8fc;border-radius:10px;padding:12px 14px;}
.nwp-field-card.nwp-field-warn{background:var(--alert-bg-warning);}
.nwp-field-card-title{font-size:12px;font-weight:600;color:var(--text-color);margin-bottom:6px;}
.nwp-field-card-title.nwp-warn-text{color:var(--alert-text-warning);}
.nwp-field-card-body{font-size:12.5px;color:#8b8aa0;line-height:1.6;}
.nwp-never-shared{margin-top:14px;font-size:12px;color:var(--alert-text-warning);background:var(--alert-bg-warning);border-radius:8px;padding:10px 14px;}

/* stat tiles */
.nwp-stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin-bottom:16px;}
.nwp-stat-grid-4{grid-template-columns:repeat(4,1fr);}
@media (max-width:900px){.nwp-stat-grid-4{grid-template-columns:repeat(2,1fr);}}
@media (max-width:520px){.nwp-stat-grid-4{grid-template-columns:1fr;}}
.nwp-stat-card{border:1px solid #f1f0f9;border-radius:14px;padding:16px 18px;background:#fff;box-shadow:0 1px 3px rgba(20,16,60,.05);}
.nwp-stat-card-head{display:flex;align-items:center;gap:10px;margin-bottom:12px;}
.nwp-stat-icon{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.nwp-stat-label{font-size:13px;font-weight:600;color:#6b6880;}
.nwp-stat-value{font-size:30px;font-weight:800;color:var(--text-color);line-height:1.1;}
.nwp-stat-caption{font-size:12px;color:#b2b0c4;margin-bottom:10px;}
.nwp-chip-row{display:flex;flex-wrap:wrap;gap:6px;}
.nwp-chip{font-size:11px;font-weight:600;padding:4px 10px;border-radius:999px;}
.nwp-chip-warning{background:#fff4e0;color:#b8740f;}
.nwp-chip-danger{background:#fdeaea;color:#d1403a;}
.nwp-chip-muted{background:#f1f2f8;color:#8b8aa0;}

/* ranked bar (claims by type of service) */
.nwp-rank-row{display:grid;grid-template-columns:140px 1fr 36px;align-items:center;gap:10px;padding:6px 0;}
.nwp-rank-label{font-size:12.5px;color:var(--text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.nwp-rank-track{height:8px;border-radius:4px;background:#eef0f2;overflow:hidden;}
.nwp-rank-fill{height:100%;border-radius:4px;background:#4f46e5;}
.nwp-rank-value{font-size:12.5px;color:#8b8aa0;text-align:right;}

/* recent runs */
.nwp-runs-table{width:100%;border-collapse:collapse;font-size:12.5px;}
.nwp-runs-table th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.3px;color:#b2b0c4;font-weight:600;padding:0 10px 8px 0;border-bottom:1px solid #f1f0f9;}
.nwp-runs-table td{padding:8px 10px 8px 0;border-bottom:1px solid #f4f3fa;color:var(--text-color);vertical-align:top;}
.nwp-runs-table tr:last-child td{border-bottom:none;}
.nwp-runs-table th.nwp-col-financial{color:#059669;}
.nwp-badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap;}
.nwp-badge-success{background:#e7f8ef;color:#15803d;}
.nwp-badge-warning{background:#fff4e0;color:#b8740f;}
.nwp-badge-danger{background:#fdeaea;color:#d1403a;}

/* record table */
.nwp-table-wrapper{margin-bottom:18px;}
.nwp-table-wrapper .dt-scrollable{border-radius:12px;border:1px solid #f1f0f9;}
`;
		document.head.appendChild(style);
	}

	make_intro() {
		$(`<div class="nwp-css-intro">What this site has shared with central, and what's still on the way.</div>`).appendTo(
			this.page.body
		);
	}

	make_summary_panel() {
		this.$summary = $('<div></div>').appendTo(this.page.body);
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

		const card = (label, c) => {
			const style = TYPE_STYLE[label] || { bg: '#f1f2f8', fg: '#6b6880', icon: '' };
			return `
				<div class="nwp-stat-card" style="background:${style.bg}; border-color:transparent;">
					<div class="nwp-stat-card-head">
						<div class="nwp-stat-icon" style="background:rgba(255,255,255,.65);">${svg_icon(style.icon, style.fg, 18)}</div>
						<span class="nwp-stat-label">${frappe.utils.escape_html(label)}</span>
					</div>
					<div class="nwp-stat-value">${c.sent}</div>
					<div class="nwp-stat-caption">sent to central</div>
					<div class="nwp-chip-row">
						<span class="nwp-chip nwp-chip-warning">${c.pending} pending</span>
						<span class="nwp-chip nwp-chip-danger">${c.failed} failed</span>
						<span class="nwp-chip nwp-chip-muted">${c.this_month} this month</span>
					</div>
				</div>`;
		};

		const labels = Object.keys(counts);
		this.$summary.html(`
			<div class="nwp-stat-grid nwp-stat-grid-4">${labels.map((l) => card(l, counts[l])).join('')}</div>
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
					<td>${run.budgets_pushed || 0}</td>
					<td>${run.disbursements_pushed || 0}</td>
					<td>${run.failed_count}</td>
				</tr>`
			)
			.join('');

		this.$runs.html(`
			<div class="nwp-css-tag">Recent Sync Runs</div>
			<table class="nwp-runs-table">
				<thead><tr><th>When</th><th>Status</th><th>Registrations</th><th>Claims</th><th class="nwp-col-financial">Budgets</th><th class="nwp-col-financial">Disbursements</th><th>Failed</th></tr></thead>
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
			change: () => this.refresh_all(),
		});
		this.from_date_field = page.add_field({
			fieldname: 'from_date',
			label: 'Sent From',
			fieldtype: 'Date',
			change: () => this.refresh_all(),
		});
		this.to_date_field = page.add_field({
			fieldname: 'to_date',
			label: 'Sent To',
			fieldtype: 'Date',
			change: () => this.refresh_all(),
		});
		page.set_secondary_action('Refresh', () => this.refresh_all());
		page.add_menu_item('Export Patient Rows (CSV)', () => this.export_csv('patient'));
		page.add_menu_item('Export Financial Rows (CSV)', () => this.export_csv('financial'));
	}

	refresh_all() {
		this.refresh_group('patient');
		this.refresh_group('financial');
	}

	make_group_table_area(group) {
		const gs = GROUP_STYLE[group];
		$(`
			<div class="nwp-section-header">
				<div class="nwp-section-icon" style="background:${gs.bg};">${svg_icon(gs.icon, gs.fg, 16)}</div>
				<span class="nwp-section-title">${gs.label} Records</span>
			</div>
		`).appendTo(this.page.body);
		const $count = $('<div class="text-muted" style="margin:-6px 0 10px;font-size:12.5px;"></div>').appendTo(this.page.body);
		const $wrapper = $('<div class="nwp-table-wrapper"></div>').appendTo(this.page.body);

		this[`$${group}_count`] = $count;
		this[`$${group}_wrapper`] = $wrapper;
	}

	refresh_group(group) {
		const $count = this[`$${group}_count`];
		$count.text('Loading...');
		frappe.call({
			method: 'nwp.nwp.page.central_sync_status.central_sync_status.get_status',
			args: {
				filters: {
					group: group,
					status: this.status_field.get_value(),
					from_date: this.from_date_field.get_value(),
					to_date: this.to_date_field.get_value(),
				},
			},
			freeze: group === 'patient',
			callback: (r) => {
				const rows = r.message || [];
				this[`${group}_rows`] = rows;
				$count.text(rows.length + ' row(s)');
				this.render_group_table(group, rows);
			},
		});
	}

	export_csv(group) {
		const rows = this[`${group}_rows`] || [];
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
		a.download = `central-sync-status-${group}-${frappe.datetime.now_date()}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	render_group_table(group, rows) {
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
			{ name: 'Error', width: 200 },
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

		const key = `${group}_datatable`;
		if (this[key]) {
			this[key].refresh(data, columns);
			return;
		}

		this[key] = new frappe.DataTable(this[`$${group}_wrapper`].get(0), {
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
