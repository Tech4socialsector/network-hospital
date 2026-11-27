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
	Deletions: {
		bg: '#fdf2f2',
		fg: '#b91c1c',
		icon: '<path d="M4 7h16"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/>',
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

// The reverse of STATUS_TYPE_LABEL on the Python side — needed to turn a
// clicked card/row's short label back into the real doctype name for the
// pending/failed drill-down calls.
const LABEL_TO_DOCTYPE = {
	Registration: 'Patient Registration',
	'Claim Form': 'Patient Claim Form',
	Budget: 'Network Hospital Budget',
	Disbursement: 'Budget Disbursement',
};

function svg_icon(pathData, color, size) {
	return `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="${size}" height="${size}">${pathData}</svg>`;
}

function status_badge(status) {
	const cls = status === 'Sent' ? 'nwp-badge-success' : status === 'Failed' ? 'nwp-badge-danger' : 'nwp-badge-warning';
	return `<span class="nwp-badge ${cls}">${frappe.utils.escape_html(status)}</span>`;
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
			this.make_central_deletion_table_area();
			this.make_org_status_area();
			this.refresh_central_deletions();
			this.refresh_org_status();
			return;
		}

		this.make_intro();
		this.make_summary_panel();
		this.make_fields_panel();
		this.make_recent_runs_panel();
		this.make_filters();
		this.make_group_table_area('patient');
		this.make_group_table_area('financial');
		this.make_deletion_table_area();
		this.refresh_group('patient');
		this.refresh_group('financial');
		this.refresh_deletions();
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
.nwp-stat-grid-5{grid-template-columns:repeat(5,1fr);}
@media (max-width:1100px){.nwp-stat-grid-5{grid-template-columns:repeat(3,1fr);}}
@media (max-width:900px){.nwp-stat-grid-4,.nwp-stat-grid-5{grid-template-columns:repeat(2,1fr);}}
@media (max-width:520px){.nwp-stat-grid-4,.nwp-stat-grid-5{grid-template-columns:1fr;}}
.nwp-stat-card{border:1px solid #f1f0f9;border-radius:14px;padding:16px 18px;background:#fff;box-shadow:0 1px 3px rgba(20,16,60,.05);position:relative;}
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
.nwp-chip-btn{border:none;cursor:pointer;font-family:inherit;}
.nwp-new-tag{position:absolute;top:14px;right:16px;font-size:9.5px;font-weight:700;letter-spacing:.4px;background:#dc2626;color:#fff;padding:2px 7px;border-radius:999px;}

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

/* org-reported status table */
.nwp-status-table{width:100%;border-collapse:collapse;font-size:12.5px;table-layout:fixed;}
.nwp-status-table th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.3px;color:#b2b0c4;font-weight:600;padding:0 12px 10px 0;border-bottom:1px solid #f1f0f9;white-space:nowrap;}
.nwp-status-table td{padding:14px 12px 14px 0;border-bottom:1px solid #f1f0f9;vertical-align:middle;}
.nwp-status-table tr:last-child td{border-bottom:none;}
.nwp-status-table .nwp-col-org{width:22%;}
.nwp-status-table .nwp-col-type{width:10%;}
.nwp-status-table .nwp-col-num{width:8%;}
.nwp-status-table .nwp-col-reason{width:34%;}
.nwp-status-reason{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.nwp-status-bar{display:flex;height:6px;border-radius:4px;overflow:hidden;background:#f1f0f7;min-width:120px;}
.nwp-status-asof{font-size:10.5px;color:#c2c0d1;margin-top:2px;}
.nwp-status-clickable{cursor:pointer;border:none;background:none;font:inherit;padding:0;text-decoration:underline;text-decoration-style:dotted;}

/* popup drill-down (Central Sync Status page only — not the main dashboard) */
.nwp-popup-overlay{position:fixed;inset:0;background:rgba(23,22,31,.45);z-index:999;display:none;align-items:center;justify-content:center;padding:24px;}
.nwp-popup-card{background:#fff;border-radius:14px;max-width:760px;width:100%;max-height:80vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.25);}
.nwp-popup-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #f1f0f9;position:sticky;top:0;background:#fff;}
.nwp-popup-title{font-size:14px;font-weight:700;}
.nwp-popup-close{border:none;background:#f4f3fa;color:#6b6880;width:28px;height:28px;border-radius:999px;cursor:pointer;font-size:15px;line-height:1;}
.nwp-popup-table{width:100%;border-collapse:collapse;font-size:12.5px;}
.nwp-popup-table th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.3px;color:#b2b0c4;font-weight:600;padding:10px 20px 8px;border-bottom:1px solid #f1f0f9;}
.nwp-popup-table td{padding:9px 20px;border-top:1px solid #f4f3fa;vertical-align:top;}
`;
		document.head.appendChild(style);
	}

	// ---------- popup drill-down (explicit, page-specific exception to the
	// new-tab-only rule used elsewhere in this app) ----------

	ensure_popup() {
		if (this.$popup) return;
		this.$popup = $(`
			<div class="nwp-popup-overlay">
				<div class="nwp-popup-card">
					<div class="nwp-popup-head">
						<span class="nwp-popup-title"></span>
						<button class="nwp-popup-close">&times;</button>
					</div>
					<table class="nwp-popup-table">
						<thead><tr><th>Record</th><th>Status</th><th>Reason</th></tr></thead>
						<tbody></tbody>
					</table>
				</div>
			</div>
		`).appendTo('body');
		this.$popup.on('click', (e) => {
			if (e.target === this.$popup.get(0)) this.close_popup();
		});
		this.$popup.find('.nwp-popup-close').on('click', () => this.close_popup());
	}

	// columns: [{label, render(row) -> html}] — defaults to the pending/
	// failed drill-down shape (Record / Status / Reason) used everywhere
	// except the stat-card "received records" drill-down.
	open_popup(title, rows, columns) {
		columns =
			columns || [
				{ label: 'Record', render: (r) => frappe.utils.escape_html(r.record) },
				{ label: 'Status', render: (r) => status_badge(r.status) },
				{ label: 'Reason', render: (r) => `<span style="color:#8b8aa0;">${frappe.utils.escape_html(r.reason || '')}</span>` },
			];
		this.ensure_popup();
		this.$popup.find('.nwp-popup-title').text(title);
		this.$popup.find('thead tr').html(columns.map((c) => `<th>${frappe.utils.escape_html(c.label)}</th>`).join(''));
		const body = rows.length
			? rows.map((r) => `<tr>${columns.map((c) => `<td>${c.render(r)}</td>`).join('')}</tr>`).join('')
			: `<tr><td colspan="${columns.length}" class="text-muted">No records.</td></tr>`;
		this.$popup.find('tbody').html(body);
		this.$popup.css('display', 'flex');
	}

	open_received_records_popup(label) {
		const reference_doctype = LABEL_TO_DOCTYPE[label];
		if (!reference_doctype) return;
		frappe.call({
			method: 'nwp.nwp.page.central_sync_status.central_sync_status.get_central_records',
			args: {
				filters: {
					reference_doctype,
					organization: this.organization_field.get_value(),
					hospital: this.hospital_field.get_value(),
					from_date: this.from_date_field.get_value(),
					to_date: this.to_date_field.get_value(),
					limit: 150,
				},
			},
			freeze: true,
			callback: (r) => {
				const rows = r.message || [];
				const open_link = (row) => {
					const route = frappe.utils.get_form_link(row.doctype, row.record);
					return `<a href="${route}" target="_blank" rel="noopener">${frappe.utils.escape_html(row.record)}</a>`;
				};
				const columns = [
					{ label: 'Record', render: open_link },
					{ label: 'Organization', render: (row) => frappe.utils.escape_html(row.organization || '') },
					{ label: 'Hospital', render: (row) => frappe.utils.escape_html(row.hospital || '') },
					{
						label: 'Received At',
						render: (row) => (row.received_at ? frappe.datetime.str_to_user(String(row.received_at).slice(0, 10)) : ''),
					},
				];
				const title = rows.length >= 150 ? `${label} — most recent 150` : `${label} — ${rows.length} received`;
				this.open_popup(title, rows, columns);
			},
		});
	}

	close_popup() {
		if (this.$popup) this.$popup.css('display', 'none');
	}

	open_pending_failed_popup(label, status) {
		const reference_doctype = LABEL_TO_DOCTYPE[label];
		if (!reference_doctype) return;
		frappe.call({
			method: 'nwp.nwp.page.central_sync_status.central_sync_status.get_pending_failed_detail',
			args: { reference_doctype, status },
			freeze: true,
			callback: (r) => this.open_popup(`${label} — ${status}`, r.message || []),
		});
	}

	open_deletion_popup(status) {
		frappe.call({
			method: 'nwp.nwp.page.central_sync_status.central_sync_status.get_deletions',
			args: { filters: { status } },
			freeze: true,
			callback: (r) => {
				const rows = (r.message || []).map((d) => ({ record: d.record, status: d.status, reason: d.error || '' }));
				this.open_popup(`Deletions — ${status}`, rows);
			},
		});
	}

	open_org_status_popup(organization, reference_doctype, label, status) {
		frappe.call({
			method: 'nwp.nwp.page.central_sync_status.central_sync_status.get_org_status_detail',
			args: { organization, reference_doctype, status },
			freeze: true,
			callback: (r) => this.open_popup(`${organization} · ${label} — ${status}`, r.message || []),
		});
	}

	// ---------- intro / shared bits ----------

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
			callback: (r) => {
				this.summary_counts = (r.message || {}).counts || {};
				this.maybe_render_summary();
			},
		});
		frappe.call({
			method: 'nwp.nwp.page.central_sync_status.central_sync_status.get_deletion_summary',
			callback: (r) => {
				this.deletion_summary = r.message || {};
				this.maybe_render_summary();
			},
		});
	}

	maybe_render_summary() {
		if (!this.summary_counts || !this.deletion_summary) return;
		this.render_summary(this.summary_counts, this.deletion_summary);
	}

	render_summary(counts, deletions) {
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
						<button class="nwp-chip nwp-chip-warning nwp-chip-btn" data-label="${label}" data-status="Pending">${c.pending} pending</button>
						<button class="nwp-chip nwp-chip-danger nwp-chip-btn" data-label="${label}" data-status="Failed">${c.failed} failed</button>
						<span class="nwp-chip nwp-chip-muted">${c.this_month} this month</span>
					</div>
				</div>`;
		};

		const deletionCard = `
			<div class="nwp-stat-card" style="background:${TYPE_STYLE.Deletions.bg}; border-color:transparent;">
				<span class="nwp-new-tag">NEW</span>
				<div class="nwp-stat-card-head">
					<div class="nwp-stat-icon" style="background:rgba(255,255,255,.65);">${svg_icon(TYPE_STYLE.Deletions.icon, TYPE_STYLE.Deletions.fg, 18)}</div>
					<span class="nwp-stat-label">Deletions</span>
				</div>
				<div class="nwp-stat-value" style="color:${TYPE_STYLE.Deletions.fg};">${deletions.total}</div>
				<div class="nwp-stat-caption">deleted after sync</div>
				<div class="nwp-chip-row">
					<span class="nwp-chip" style="background:#e7f8ef;color:#15803d;">${deletions.sent} sent</span>
					<button class="nwp-chip nwp-chip-warning nwp-chip-btn" data-deletion-status="Pending">${deletions.pending} pending</button>
					<button class="nwp-chip nwp-chip-danger nwp-chip-btn" data-deletion-status="Failed">${deletions.failed} failed</button>
				</div>
			</div>`;

		const labels = Object.keys(counts);
		this.$summary.html(
			`<div class="nwp-stat-grid nwp-stat-grid-5">${labels.map((l) => card(l, counts[l])).join('')}${deletionCard}</div>`
		);

		this.$summary.find('.nwp-chip-btn[data-label]').on('click', (e) => {
			const $btn = $(e.currentTarget);
			this.open_pending_failed_popup($btn.data('label'), $btn.data('status'));
		});
		this.$summary.find('.nwp-chip-btn[data-deletion-status]').on('click', (e) => {
			this.open_deletion_popup($(e.currentTarget).data('deletion-status'));
		});
	}

	make_central_intro() {
		$(`<div class="nwp-css-intro">Data received from every partner organization, all in one place.</div>`).appendTo(
			this.page.body
		);
	}

	make_central_summary_panel() {
		this.$summary = $('<div></div>').appendTo(this.page.body);
		frappe.call({
			method: 'nwp.nwp.page.central_sync_status.central_sync_status.get_central_summary',
			callback: (r) => {
				this.central_counts = (r.message || {}).counts || {};
				this.maybe_render_central_summary();
			},
		});
		frappe.call({
			method: 'nwp.nwp.page.central_sync_status.central_sync_status.get_central_deletion_summary',
			callback: (r) => {
				this.central_deletion_summary = r.message || {};
				this.maybe_render_central_summary();
			},
		});
	}

	maybe_render_central_summary() {
		if (!this.central_counts || !this.central_deletion_summary) return;
		this.render_central_summary(this.central_counts, this.central_deletion_summary);
	}

	render_central_summary(counts, deletions) {
		const card = (label, c) => {
			const style = TYPE_STYLE[label] || { bg: '#f1f2f8', fg: '#6b6880', icon: '' };
			return `
				<div class="nwp-stat-card nwp-stat-card-clickable" data-label="${label}" style="background:${style.bg}; border-color:transparent; cursor:pointer;">
					<div class="nwp-stat-card-head">
						<div class="nwp-stat-icon" style="background:rgba(255,255,255,.65);">${svg_icon(style.icon, style.fg, 18)}</div>
						<span class="nwp-stat-label">${frappe.utils.escape_html(label)}</span>
					</div>
					<div class="nwp-stat-value">${c.total}</div>
					<div class="nwp-stat-caption">total received — click to view</div>
					<span class="nwp-chip" style="background:rgba(255,255,255,.65); color:${style.fg};">${c.this_month} this month</span>
				</div>`;
		};

		const deletionCard = `
			<div class="nwp-stat-card" style="background:${TYPE_STYLE.Deletions.bg}; border-color:transparent;">
				<span class="nwp-new-tag">NEW</span>
				<div class="nwp-stat-card-head">
					<div class="nwp-stat-icon" style="background:rgba(255,255,255,.65);">${svg_icon(TYPE_STYLE.Deletions.icon, TYPE_STYLE.Deletions.fg, 18)}</div>
					<span class="nwp-stat-label">Deletions Received</span>
				</div>
				<div class="nwp-stat-value" style="color:${TYPE_STYLE.Deletions.fg};">${deletions.total}</div>
				<div class="nwp-stat-caption">removed on request of org</div>
				<span class="nwp-chip" style="background:rgba(255,255,255,.65); color:${TYPE_STYLE.Deletions.fg};">${deletions.this_month} this month</span>
			</div>`;

		const labels = Object.keys(counts);
		this.$summary.html(
			`<div class="nwp-stat-grid nwp-stat-grid-5">${labels.map((l) => card(l, counts[l])).join('')}${deletionCard}</div>`
		);

		this.$summary.find('.nwp-stat-card-clickable').on('click', (e) => {
			this.open_received_records_popup($(e.currentTarget).data('label'));
		});
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
				this.filter_organization_panel();
				this.refresh_central_deletions();
				this.refresh_org_status();
			},
		});
		this.hospital_field = page.add_field({
			fieldname: 'hospital',
			label: 'Hospital',
			fieldtype: 'Link',
			options: 'Hospital With Organization',
		});
		this.from_date_field = page.add_field({
			fieldname: 'from_date',
			label: 'Received From',
			fieldtype: 'Date',
		});
		this.to_date_field = page.add_field({
			fieldname: 'to_date',
			label: 'Received To',
			fieldtype: 'Date',
		});
		page.add_menu_item('Export Received Records (CSV)', () => this.export_central_csv());
	}

	export_central_csv() {
		frappe.call({
			method: 'nwp.nwp.page.central_sync_status.central_sync_status.get_central_records',
			args: {
				filters: {
					organization: this.organization_field.get_value(),
					hospital: this.hospital_field.get_value(),
					from_date: this.from_date_field.get_value(),
					to_date: this.to_date_field.get_value(),
				},
			},
			freeze: true,
			callback: (r) => {
				const rows = r.message || [];
				if (!rows.length) {
					frappe.msgprint(__('Nothing to export.'));
					return;
				}
				const header = ['Record', 'Type', 'Organization', 'Hospital', 'Received At'];
				const lines = [
					header,
					...rows.map((row) => [row.record, row.type, row.organization || '', row.hospital || '', row.received_at || '']),
				];
				const csv = lines.map((line) => line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
				const blob = new Blob([csv], { type: 'text/csv' });
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `central-received-${frappe.datetime.now_date()}.csv`;
				a.click();
				URL.revokeObjectURL(url);
			},
		});
	}

	// ---------- central: Deletions Received ----------

	make_central_deletion_table_area() {
		$(`
			<div class="nwp-section-header">
				<div class="nwp-section-icon" style="background:${TYPE_STYLE.Deletions.bg};">${svg_icon(TYPE_STYLE.Deletions.icon, TYPE_STYLE.Deletions.fg, 16)}</div>
				<span class="nwp-section-title">Deletions Received</span>
				<span class="nwp-new-tag" style="position:static;">NEW</span>
			</div>
		`).appendTo(this.page.body);
		$(`<div class="text-muted" style="margin:-6px 0 10px;font-size:12.5px;">What was removed here because an organization deleted it on their own site.</div>`).appendTo(
			this.page.body
		);
		this.$central_deletions_wrapper = $('<div class="nwp-table-wrapper"></div>').appendTo(this.page.body);
	}

	refresh_central_deletions() {
		frappe.call({
			method: 'nwp.nwp.page.central_sync_status.central_sync_status.get_central_deletions',
			args: { filters: { organization: this.organization_field.get_value() } },
			callback: (r) => this.render_central_deletion_table(r.message || []),
		});
	}

	render_central_deletion_table(rows) {
		const columns = [
			{ name: 'Record', width: 150 },
			{ name: 'Type', width: 110 },
			{ name: 'Organization', width: 220 },
			{ name: 'Deleted At', width: 160 },
		].map((c) => Object.assign({ editable: false, resizable: true }, c));

		const data = rows.map((row) => ({
			Record: row.record,
			Type: row.type,
			Organization: row.organization || '',
			'Deleted At': row.deleted_at ? frappe.datetime.str_to_user(String(row.deleted_at).slice(0, 16)) : '',
		}));

		if (this.central_deletions_datatable) {
			this.central_deletions_datatable.refresh(data, columns);
			return;
		}
		this.central_deletions_datatable = new frappe.DataTable(this.$central_deletions_wrapper.get(0), {
			columns: columns,
			data: data,
			layout: 'fluid',
			cellHeight: 35,
			serialNoColumn: true,
			checkboxColumn: false,
			noDataMessage: __('No deletions received yet'),
		});
	}

	// ---------- central: Organization-Reported Status ----------

	make_org_status_area() {
		$(`
			<div class="nwp-section-header">
				<div class="nwp-section-icon" style="background:${TYPE_STYLE.Deletions.bg};">${svg_icon(TYPE_STYLE.Deletions.icon, TYPE_STYLE.Deletions.fg, 16)}</div>
				<span class="nwp-section-title">Organization-Reported Status</span>
				<span class="nwp-new-tag" style="position:static;">NEW</span>
			</div>
		`).appendTo(this.page.body);
		$(`<div class="text-muted" style="margin:-6px 0 10px;font-size:12.5px;max-width:760px;">
			Reported by each organization's own site after every sync run — a snapshot as of their last run, not live.
			Click a Pending or Failed number to see those specific records and why.
		</div>`).appendTo(this.page.body);
		this.$org_status_panel = $('<div class="nwp-css-panel"></div>').appendTo(this.page.body);
	}

	refresh_org_status() {
		frappe.call({
			method: 'nwp.nwp.page.central_sync_status.central_sync_status.get_org_status_summary',
			args: { filters: { organization: this.organization_field.get_value() } },
			callback: (r) => this.render_org_status_table(r.message || []),
		});
	}

	render_org_status_table(rows) {
		if (!rows.length) {
			this.$org_status_panel.html('<div class="text-muted" style="font-size:13px;">No organization has reported its status yet.</div>');
			return;
		}

		const body = rows
			.map((row) => {
				const asOf = row.reported_at ? frappe.datetime.str_to_user(String(row.reported_at).slice(0, 16)) : '—';
				const pendingCell = row.pending
					? `<button class="nwp-status-clickable" data-org="${frappe.utils.escape_html(row.organization)}" data-doctype="${row.reference_doctype}" data-label="${row.type}" data-status="Pending" style="color:#b8740f;">${row.pending}</button>`
					: '0';
				const failedCell = row.failed
					? `<button class="nwp-status-clickable" data-org="${frappe.utils.escape_html(row.organization)}" data-doctype="${row.reference_doctype}" data-label="${row.type}" data-status="Failed" style="color:#d1403a;">${row.failed}</button>`
					: '0';
				const reasonText = row.reason || '—';
				return `
					<tr>
						<td class="nwp-col-org">
							<div style="font-weight:600;">${frappe.utils.escape_html(row.organization)}</div>
							<div class="nwp-status-asof">as of ${asOf}</div>
						</td>
						<td class="nwp-col-type">${frappe.utils.escape_html(row.type)}</td>
						<td class="nwp-col-num" style="text-align:right;font-weight:600;">${row.total}</td>
						<td class="nwp-col-num" style="text-align:right;color:#15803d;">${row.sent}</td>
						<td class="nwp-col-num" style="text-align:right;">${pendingCell}</td>
						<td class="nwp-col-num" style="text-align:right;">${failedCell}</td>
						<td class="nwp-col-reason" style="color:#8b8aa0;" title="${frappe.utils.escape_html(reasonText)}">
							<span class="nwp-status-reason">${frappe.utils.escape_html(reasonText)}</span>
						</td>
					</tr>`;
			})
			.join('');

		this.$org_status_panel.html(`
			<table class="nwp-status-table">
				<thead>
					<tr>
						<th class="nwp-col-org">Organization</th>
						<th class="nwp-col-type">Type</th>
						<th class="nwp-col-num" style="text-align:right;">Total</th>
						<th class="nwp-col-num" style="text-align:right;">Sent</th>
						<th class="nwp-col-num" style="text-align:right;">Pending</th>
						<th class="nwp-col-num" style="text-align:right;">Failed</th>
						<th class="nwp-col-reason">Why Pending / Failed</th>
					</tr>
				</thead>
				<tbody>${body}</tbody>
			</table>
		`);

		this.$org_status_panel.find('.nwp-status-clickable').on('click', (e) => {
			const $btn = $(e.currentTarget);
			this.open_org_status_popup($btn.data('org'), $btn.data('doctype'), $btn.data('label'), $btn.data('status'));
		});
	}

	// ---------- org-side: fields panel, recent runs ----------

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
		const badge = (status) => status_badge(status);

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

	// ---------- org-side: Deleted After Sync ----------

	make_deletion_table_area() {
		$(`
			<div class="nwp-section-header">
				<div class="nwp-section-icon" style="background:${TYPE_STYLE.Deletions.bg};">${svg_icon(TYPE_STYLE.Deletions.icon, TYPE_STYLE.Deletions.fg, 16)}</div>
				<span class="nwp-section-title">Deleted After Sync</span>
				<span class="nwp-new-tag" style="position:static;">NEW</span>
			</div>
		`).appendTo(this.page.body);
		const $count = $('<div class="text-muted" style="margin:-6px 0 10px;font-size:12.5px;"></div>').appendTo(this.page.body);
		this.$deletions_count = $count;
		this.$deletions_wrapper = $('<div class="nwp-table-wrapper"></div>').appendTo(this.page.body);
	}

	refresh_deletions() {
		this.$deletions_count.text('Loading...');
		frappe.call({
			method: 'nwp.nwp.page.central_sync_status.central_sync_status.get_deletions',
			callback: (r) => {
				const rows = r.message || [];
				this.deletion_rows = rows;
				this.$deletions_count.text(rows.length + ' row(s)');
				this.render_deletion_table(rows);
			},
		});
	}

	render_deletion_table(rows) {
		const columns = [
			{ name: 'Record', width: 150 },
			{ name: 'Type', width: 110 },
			{ name: 'Status', width: 100, align: 'center', format: (v) => status_badge(v) },
			{ name: 'Deleted On', width: 140 },
			{ name: 'Error', width: 220 },
		].map((c) => Object.assign({ editable: false, resizable: true }, c));

		const data = rows.map((row) => ({
			Record: row.record,
			Type: row.type,
			Status: row.status,
			'Deleted On': row.deleted_on ? frappe.datetime.str_to_user(String(row.deleted_on).slice(0, 10)) : '',
			Error: row.error || '',
		}));

		if (this.deletions_datatable) {
			this.deletions_datatable.refresh(data, columns);
			return;
		}
		this.deletions_datatable = new frappe.DataTable(this.$deletions_wrapper.get(0), {
			columns: columns,
			data: data,
			layout: 'fluid',
			cellHeight: 35,
			serialNoColumn: true,
			checkboxColumn: false,
			noDataMessage: __('Nothing deleted after sync yet'),
		});
	}
}
