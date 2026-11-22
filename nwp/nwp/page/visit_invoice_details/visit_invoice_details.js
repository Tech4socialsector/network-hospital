frappe.pages['visit-invoice-details'].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Visit & Invoice Details',
		single_column: true,
	});

	new VisitInvoiceDetails(page);
};

class VisitInvoiceDetails {
	constructor(page) {
		this.page = page;
		this.make_summary_cards();
		this.make_filters();
		this.make_table_area();
		// Default view is "today" so the cards open on a dashboard-like
		// snapshot — but from here on, the cards always describe exactly
		// whatever is currently filtered, same as the table below them.
		const d = frappe.datetime.get_today();
		this.date_from_field.set_value(d);
		this.date_to_field.set_value(d);
		this.refresh();
	}

	make_summary_cards() {
		if (!document.getElementById('nwp-vid-card-style')) {
			const style = document.createElement('style');
			style.id = 'nwp-vid-card-style';
			style.textContent = `
.nwp-vid-cards{display:flex;gap:12px;margin:0 0 16px;flex-wrap:wrap;}
.nwp-vid-card{background:#fff;border:1px solid #e3e8ef;border-radius:10px;padding:12px 18px;min-width:150px;box-shadow:0 1px 3px rgba(0,0,0,.06);cursor:pointer;transition:transform .15s,box-shadow .15s;}
.nwp-vid-card:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.1);border-color:#b8c4d0;}
.nwp-vid-card .nwp-vid-cv{font-size:22px;font-weight:700;color:#0d1117;line-height:1.2;}
.nwp-vid-card .nwp-vid-cl{font-size:11px;color:#7a8899;text-transform:uppercase;letter-spacing:.5px;margin-top:3px;}
.nwp-vid-card.nwp-vid-warn .nwp-vid-cv{color:#b45309;}
`;
			document.head.appendChild(style);
		}

		this.$cards = $(`
			<div class="nwp-vid-cards">
				<div class="nwp-vid-card" data-filter="none"><div class="nwp-vid-cv" data-card="registrations">–</div><div class="nwp-vid-cl">Registrations</div></div>
				<div class="nwp-vid-card" data-filter="none"><div class="nwp-vid-cv" data-card="visits">–</div><div class="nwp-vid-cl">Visits</div></div>
				<div class="nwp-vid-card" data-filter="none"><div class="nwp-vid-cv" data-card="invoices">–</div><div class="nwp-vid-cl">Invoices</div></div>
				<div class="nwp-vid-card nwp-vid-warn" data-filter="review"><div class="nwp-vid-cv" data-card="review">–</div><div class="nwp-vid-cl">Needs Review</div></div>
			</div>
		`).appendTo(this.page.body);

		this.$cards.on('click', '.nwp-vid-card', (e) => {
			const filter = $(e.currentTarget).attr('data-filter');
			if (filter === 'review') {
				this.review_only_field.set_value(1);
				this.refresh();
			}
			this.$table_wrapper.get(0).scrollIntoView({ behavior: 'smooth', block: 'start' });
		});
	}

	update_summary_cards(rows) {
		const visit_rows = rows.filter((r) => r.visit_id);
		const invoice_rows = rows.filter((r) => r.invoice_name);
		const registrations = new Set(visit_rows.map((r) => r.patient_id)).size;
		const review = rows.filter((r) => cint(r.needs_manual_review)).length;

		this.$cards.find('[data-card="registrations"]').text(registrations);
		this.$cards.find('[data-card="visits"]').text(visit_rows.length);
		this.$cards.find('[data-card="invoices"]').text(invoice_rows.length);
		this.$cards.find('[data-card="review"]').text(review);
	}

	make_filters() {
		const page = this.page;

		this.patient_id_field = page.add_field({
			fieldname: 'patient_id',
			label: 'Patient ID',
			fieldtype: 'Data',
		});
		this.treatment_category_field = page.add_field({
			fieldname: 'treatment_category',
			label: 'Visit Type',
			fieldtype: 'Select',
			options: '\nOPD\nIPD',
		});
		this.registration_status_field = page.add_field({
			fieldname: 'registration_status',
			label: 'Registration Status',
			fieldtype: 'Data',
		});
		this.diagnosis_field = page.add_field({
			fieldname: 'diagnosis',
			label: 'Diagnosis',
			fieldtype: 'Data',
		});
		this.discount_account_head_field = page.add_field({
			fieldname: 'discount_account_head',
			label: 'Discount Account Head',
			fieldtype: 'Data',
		});
		this.date_from_field = page.add_field({
			fieldname: 'date_from',
			label: 'Visit Date From',
			fieldtype: 'Date',
		});
		this.date_to_field = page.add_field({
			fieldname: 'date_to',
			label: 'Visit Date To',
			fieldtype: 'Date',
		});
		this.review_only_field = page.add_field({
			fieldname: 'review_only',
			label: 'Needs Manual Review Only',
			fieldtype: 'Check',
			change: () => this.refresh(),
		});

		page.set_primary_action('Apply Filters', () => this.refresh(), 'filter');
		page.set_secondary_action('Clear', () => this.clear_filters());
		page.add_inner_button('Export', () => this.export_rows());
	}

	export_rows() {
		open_url_post('/api/method/nwp.nwp.page.visit_invoice_details.visit_invoice_details.export_xlsx', {
			filters: JSON.stringify(this.get_filters()),
		});
	}

	clear_filters(do_refresh = true) {
		[
			this.patient_id_field,
			this.treatment_category_field,
			this.registration_status_field,
			this.diagnosis_field,
			this.discount_account_head_field,
			this.date_from_field,
			this.date_to_field,
			this.review_only_field,
		].forEach((f) => f.set_value(''));
		if (do_refresh) this.refresh();
	}

	get_filters() {
		return {
			patient_id: this.patient_id_field.get_value(),
			treatment_category: this.treatment_category_field.get_value(),
			registration_status: this.registration_status_field.get_value(),
			diagnosis: this.diagnosis_field.get_value(),
			discount_account_head: this.discount_account_head_field.get_value(),
			date_from: this.date_from_field.get_value(),
			date_to: this.date_to_field.get_value(),
			review_only: this.review_only_field.get_value() ? 1 : 0,
		};
	}

	make_table_area() {
		this.$count = $('<div class="text-muted" style="margin:10px 0;"></div>').appendTo(
			this.page.body
		);
		this.$totals = $(
			'<div style="margin:0 0 14px;padding:10px 16px;background:#f8fafc;border:1px solid #e3e8ef;border-radius:8px;font-size:13px;display:flex;flex-wrap:wrap;gap:20px;"></div>'
		).appendTo(this.page.body);
		this.$table_wrapper = $('<div></div>').appendTo(this.page.body);
	}

	update_totals(rows) {
		const fmt = (v) => frappe.format(v, { fieldtype: 'Currency' });
		const sum = (fieldname) => rows.reduce((acc, r) => acc + (flt(r[fieldname]) || 0), 0);

		this.$totals.html(`
			<span><b>Total Bill:</b> ${fmt(sum('total_bill'))}</span>
			<span><b>Patient Contribution:</b> ${fmt(sum('patient_contribution'))}</span>
			<span><b>Hospital Additional Contribution:</b> ${fmt(sum('hospital_additional_contribution'))}</span>
			<span><b>NWP Contribution:</b> ${fmt(sum('nwp_contribution'))}</span>
			<span><b>Other Donor Contribution:</b> ${fmt(sum('other_donor_contribution'))}</span>
		`);
	}

	refresh() {
		this.$count.text('Loading...');
		frappe.call({
			method: 'nwp.nwp.page.visit_invoice_details.visit_invoice_details.get_details',
			args: { filters: this.get_filters() },
			freeze: true,
			callback: (r) => {
				const rows = r.message || [];
				this.$count.text(
					rows.length + ' row(s)' + (rows.length >= 5000 ? ' (capped at 5000, narrow your filters)' : '')
				);
				this.update_summary_cards(rows);
				this.update_totals(rows);
				this.render_table(rows);
			},
		});
	}

	make_table_style() {
		if (document.getElementById('nwp-vid-table-style')) return;
		const style = document.createElement('style');
		style.id = 'nwp-vid-table-style';
		style.textContent = `
.nwp-vid-badge{display:inline-block;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:600;white-space:nowrap;}
.nwp-vid-badge-warn{background:#fef3c7;color:#92400e;}
.nwp-vid-badge-ok{background:#dcfce7;color:#166534;}
.nwp-vid-badge-muted{background:#f1f5f9;color:#64748b;}
.nwp-vid-badge-opd{background:#dbeafe;color:#1e40af;}
.nwp-vid-badge-ipd{background:#fee2e2;color:#991b1b;}
`;
		document.head.appendChild(style);
	}

	render_table(rows) {
		this.make_table_style();

		const currency = (v) => (v === null || v === undefined || v === '' ? '' : frappe.format(v, { fieldtype: 'Currency' }));
		const user_date = (v) => (v ? frappe.datetime.str_to_user(String(v).slice(0, 10)) : '');
		const badge = (cls, label) => `<span class="nwp-vid-badge ${cls}">${frappe.utils.escape_html(label)}</span>`;

		const columns = [
			{ name: 'OP/IP ID', width: 100 },
			{ name: 'Patient ID', width: 110 },
			{
				name: 'Visit Type',
				width: 90,
				align: 'center',
				format: (v) => (v ? badge(v === 'IPD' ? 'nwp-vid-badge-ipd' : 'nwp-vid-badge-opd', v) : ''),
			},
			{ name: 'Date Of Visit', width: 100 },
			{ name: 'Date Of Discharge', width: 110 },
			{ name: 'Visit Status', width: 90, align: 'center' },
			{ name: 'Registration Status', width: 120 },
			{ name: 'Diagnosis', width: 170 },
			{ name: 'Invoice Name', width: 150 },
			{ name: 'Invoice Date', width: 100 },
			{ name: 'Total Bill', width: 110, align: 'right' },
			{ name: 'Discount Amount', width: 110, align: 'right' },
			{ name: 'Discount Method', width: 110, align: 'center' },
			{ name: 'Discount Account Head', width: 210 },
			{ name: 'Doctor Name', width: 160 },
			{ name: 'Invoice Total', width: 110, align: 'right' },
			{ name: 'Patient Contribution', width: 130, align: 'right' },
			{ name: 'Hospital Additional Contribution', width: 170, align: 'right' },
			{ name: 'NWP Contribution', width: 120, align: 'right' },
			{ name: 'Other Donor Contribution', width: 150, align: 'right' },
			{
				name: 'Mapped To Claim Form',
				width: 130,
				align: 'center',
				format: (v) => badge(cint(v) ? 'nwp-vid-badge-ok' : 'nwp-vid-badge-muted', cint(v) ? 'Mapped' : 'Not Mapped'),
			},
			{
				name: 'Needs Manual Review',
				width: 140,
				align: 'center',
				format: (v) => badge(cint(v) ? 'nwp-vid-badge-warn' : 'nwp-vid-badge-ok', cint(v) ? '⚠ Review' : 'OK'),
			},
		].map((c) => Object.assign({ editable: false, resizable: true }, c));

		const data = rows.map((row) => [
			row.visit_id || '',
			row.patient_id || '',
			row.treatment_category || '',
			user_date(row.date_of_visit),
			user_date(row.date_of_discharge),
			row.visit_status || '',
			row.registration_status || '',
			row.diagnosis || '',
			row.invoice_name || '',
			user_date(row.invoice_date),
			currency(row.total_bill),
			currency(row.discount_amount),
			row.discount_method || '',
			row.discount_account_head || '',
			row.doctor_name || '',
			currency(row.invoice_total),
			currency(row.patient_contribution),
			currency(row.hospital_additional_contribution),
			currency(row.nwp_contribution),
			currency(row.other_donor_contribution),
			row.mapped_to_patient_claim_form,
			row.needs_manual_review,
		]);

		if (this.datatable) {
			this.datatable.refresh(data, columns);
			return;
		}

		this.datatable = new frappe.DataTable(this.$table_wrapper.get(0), {
			columns: columns,
			data: data,
			layout: 'fixed',
			cellHeight: 36,
			serialNoColumn: true,
			checkboxColumn: false,
			noDataMessage: __('No matching visits or invoices'),
		});
	}
}
