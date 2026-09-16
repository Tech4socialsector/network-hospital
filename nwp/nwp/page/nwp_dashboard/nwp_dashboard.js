frappe.pages['nwp-dashboard'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'APF Hospital Programme Dashboard',
		single_column: true,
		hide_sidebar: true
	});

	// Inject styles (shared by both the main dashboard and the drill/claim
	// detail views this page can also render when opened with a #nwpdrill=
	// or #nwpclaim= hash in a new tab).
	if (!document.getElementById('nwp-dash-style')) {
		var style = document.createElement('style');
		style.id = 'nwp-dash-style';
		style.textContent = `
:root{
  --ink:#0d1117;--ink-mid:#3d4a5c;--ink-soft:#7a8899;--ink-pale:#b8c4d0;
  --surface:#f4f6f9;--white:#fff;--border:#e3e8ef;
  --green:#0e7a5f;--green-2:#12a07a;--green-bg:#e6f5f1;
  --blue:#1a5fa8;--blue-bg:#e8f0fb;
  --amber:#b45309;--amber-bg:#fef3e2;
  --violet:#5b21b6;
  --r:14px;
  --sh:0 1px 3px rgba(0,0,0,.07),0 2px 8px rgba(0,0,0,.05);
  --sh2:0 2px 8px rgba(0,0,0,.08),0 8px 24px rgba(0,0,0,.06);
}
#nwp-dash *{box-sizing:border-box;}
#nwp-dash{font-family:'Epilogue',sans-serif;background:var(--surface);color:var(--ink);font-size:14px;padding:0;min-height:calc(100vh - 60px);}
.nwp-topbar{background:#e8f5f1;border-bottom:2px solid #b2ddd4;padding:0 32px;height:56px;display:flex;align-items:center;justify-content:space-between;}
.nwp-tb-left{display:flex;align-items:center;gap:12px;}
.nwp-tb-logo{width:30px;height:30px;border-radius:7px;background:linear-gradient(135deg,var(--green-2),#0a5e47);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#fff;font-family:'Syne',sans-serif;flex-shrink:0;}
.nwp-tb-name{font-family:'Syne',sans-serif;font-size:15px;font-weight:700;color:var(--green);letter-spacing:-.3px;}
.nwp-tb-sub{font-size:11px;color:var(--ink-soft);margin-top:1px;}
.nwp-tb-live{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--ink-soft);}
.nwp-ldot{width:6px;height:6px;border-radius:50%;background:#22c55e;animation:nwp-pulse 2s infinite;}
@keyframes nwp-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.55;transform:scale(1.35);}}
.nwp-fstrip{background:var(--white);border-bottom:1px solid var(--border);padding:14px 32px;display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;}
.nwp-fg{display:flex;flex-direction:column;gap:5px;min-width:140px;flex:1;}
.nwp-fg label{font-size:10px;font-weight:600;letter-spacing:.7px;text-transform:uppercase;color:var(--ink-soft);}
.nwp-fg select,.nwp-fg input{padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-family:'Epilogue',sans-serif;font-size:13px;color:var(--ink);background:var(--surface);outline:none;transition:border-color .2s,box-shadow .2s;}
.nwp-fg select:focus,.nwp-fg input:focus{border-color:var(--green-2);box-shadow:0 0 0 3px rgba(18,160,122,.12);}
.nwp-fbtns{display:flex;gap:8px;padding-bottom:1px;}
.nwp-btn{padding:8px 18px;border-radius:8px;font-family:'Epilogue',sans-serif;font-size:13px;font-weight:500;cursor:pointer;border:none;transition:all .18s;}
.nwp-btn-p{background:var(--green);color:#fff;}
.nwp-btn-p:hover{background:#0a5e47;transform:translateY(-1px);box-shadow:0 4px 12px rgba(14,122,95,.3);}
.nwp-btn-g{background:transparent;color:var(--ink-mid);border:1px solid var(--border);}
.nwp-btn-g:hover{background:var(--surface);}
.nwp-page{padding:22px 32px;max-width:1500px;margin:0 auto;}
.nwp-slabel{font-family:'Inter',sans-serif;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--ink-soft);margin-bottom:10px;display:flex;align-items:center;gap:8px;}
.nwp-slabel::after{content:'';flex:1;height:1px;background:var(--border);}
.nwp-card-row{display:flex;justify-content:center;gap:10px;margin-bottom:20px;flex-wrap:nowrap;align-items:stretch;}
.nwp-card-divider{width:1px;background:var(--border);margin:4px 4px;flex-shrink:0;}
.nwp-card{background:var(--white);border:1px solid var(--border);border-radius:10px;padding:12px 14px 10px;box-shadow:var(--sh);cursor:pointer;transition:transform .2s,box-shadow .2s;border-top:3px solid var(--nwp-cc,var(--green));user-select:none;display:flex;flex-direction:column;justify-content:flex-end;width:160px;height:80px;flex-shrink:0;}
.nwp-card:hover{transform:translateY(-2px);box-shadow:var(--sh2);}
.nwp-cv{font-family:'Inter',sans-serif;font-size:14px;font-weight:700;line-height:1.2;color:var(--ink);margin-bottom:3px;font-variant-numeric:tabular-nums;letter-spacing:-0.3px;}
.nwp-cl{font-family:'Inter',sans-serif;font-size:10px;color:var(--ink-soft);font-weight:500;line-height:1.3;}
.nwp-contrib-table-wrap{background:var(--white);border:1px solid var(--border);border-radius:var(--r);box-shadow:var(--sh);overflow:hidden;margin-bottom:28px;display:block;width:100%;}
.nwp-contrib-table{width:100%;border-collapse:collapse;font-family:'Inter',sans-serif;font-size:12px;}
.nwp-contrib-table thead th{padding:7px 10px;text-align:right;font-size:10px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--ink-soft);background:var(--surface);border-bottom:2px solid var(--border);}
.nwp-contrib-table thead th:first-child{text-align:left;white-space:nowrap;width:1%;}
.nwp-contrib-table thead th.nwp-col-nwp{color:var(--green);background:#f0faf6;}
.nwp-contrib-table thead th.nwp-col-out{color:var(--blue);background:#eef4fd;}
.nwp-contrib-table tr.nwp-clickable{cursor:pointer;transition:background .1s;}
.nwp-contrib-table tr.nwp-clickable:hover{background:#e6f5f1;}
.nwp-contrib-table tr.nwp-clickable td{padding:7px 10px;border-bottom:1px solid var(--border);text-align:right;}
.nwp-contrib-table tr.nwp-clickable td:first-child{text-align:left;white-space:nowrap;width:1%;}
.nwp-contrib-table td.nwp-row-label{font-weight:500;color:var(--ink);padding-left:6px !important;white-space:nowrap;}
.nwp-contrib-table td.nwp-amount{font-weight:600;font-variant-numeric:tabular-nums;}
.nwp-contrib-table td.nwp-col-nwp.nwp-amount{color:var(--green);}
.nwp-contrib-table td.nwp-col-out.nwp-amount{color:var(--blue);}
.nwp-contrib-table td.nwp-col-total.nwp-amount{color:var(--ink-mid);}
.nwp-contrib-table td.nwp-muted{color:var(--ink-pale);}
.nwp-contrib-table .nwp-caret{display:inline-block;width:14px;font-size:9px;color:var(--ink-soft);transition:transform .15s;}
.nwp-contrib-table .nwp-caret.open{transform:rotate(90deg);}
.nwp-contrib-table td.nwp-sub-label{padding-left:26px !important;font-weight:400;color:var(--ink-mid);}
.nwp-contrib-table td.nwp-sub-label::before{content:'•';color:var(--ink-pale);margin-right:6px;}
.nwp-contrib-table tr.nwp-sub-row td{background:#fafbfc;}
.nwp-contrib-table tr.nwp-sub-row:hover td{background:#e6f5f1;}
.nwp-contrib-table tr.nwp-grand-total td{padding:7px 10px;background:var(--surface);border-top:2px solid var(--border);font-weight:700;text-align:right;font-size:12.5px;font-variant-numeric:tabular-nums;}
.nwp-contrib-table tr.nwp-grand-total td:first-child{text-align:left;font-weight:700;color:var(--ink);white-space:nowrap;width:1%;}
.nwp-contrib-table tr.nwp-grand-total td.nwp-col-nwp{color:var(--green);}
.nwp-contrib-table tr.nwp-grand-total td.nwp-col-out{color:var(--blue);}
.nwp-contrib-table tr.nwp-grand-total td.nwp-col-total{color:var(--ink-mid);}
#nwp-dash-drill,#nwp-dash-claim{font-family:'Inter',sans-serif;background:var(--surface);color:var(--ink);min-height:calc(100vh - 60px);display:flex;flex-direction:column;}
</style>`;
		document.head.appendChild(style);
	}

	// Make sure the Excel export library is available regardless of which
	// view (dashboard, drill, or claim detail) this tab ends up rendering.
	if (!window.XLSX) {
		var xlsxScript = document.createElement('script');
		xlsxScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
		xlsxScript.integrity = 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw';
		xlsxScript.crossOrigin = 'anonymous';
		document.head.appendChild(xlsxScript);
	}

	// Remove Frappe's built-in page header and all surrounding whitespace
	if (page.head) $(page.head).hide();
	$(page.body).css({padding: '0', margin: '0'});
	$(page.body).parent().css({padding: '0', margin: '0'});
	$(wrapper).css({padding: '0', margin: '0'});
	$(page.body).css({'min-height': 'calc(100vh - 60px)'});

	var FBASE = window.location.origin;
	var hash = window.location.hash;

	// ── This same page, opened in a new tab with a #nwpdrill=/#nwpclaim=
	// hash, renders just that detail view instead of the normal dashboard —
	// no separate web page needed for drill-downs anymore.
	if (hash && hash.indexOf('#nwpdrill=') === 0) {
		renderDrillPage(page, hash.replace('#nwpdrill=', ''));
		return;
	}
	if (hash && hash.indexOf('#nwpclaim=') === 0) {
		renderClaimPage(page, hash.replace('#nwpclaim=', ''));
		return;
	}

	renderMainDashboard(page, FBASE);

	// ── Shared helpers ──────────────────────────────────────────────────
	function nwpFmt(v) { return Math.round(Number(v) || 0).toLocaleString('en-IN'); }
	function nwpEsc(v) { return frappe.utils.escape_html(String(v)); }
	function nwpDv(v) { return (v === undefined || v === null || v === '') ? '—' : nwpEsc(v); }
	function nwpRs(v) { return '₹' + nwpFmt(v); }

	function nwpFdb(dt, fields, filters) {
		// limit_page_length=0 means "no limit" in Frappe — fetch every
		// matching record, however many there are, now or in the future.
		return new Promise(function(resolve){
			var csrf=(frappe.csrf_token&&frappe.csrf_token!=='No')?frappe.csrf_token:'';
			fetch('/api/resource/'+encodeURIComponent(dt)+'?fields='+encodeURIComponent(JSON.stringify(fields))+'&filters='+encodeURIComponent(JSON.stringify(filters||[]))+'&limit_page_length=0&order_by=creation+desc',{
				headers:{'X-Frappe-CSRF-Token':csrf,'Accept':'application/json'}
			})
			.then(function(r){return r.json();})
			.then(function(d){resolve((d&&d.data)?d.data:(d&&d.message)?d.message:[]);})
			.catch(function(e){console.warn('[NWP]['+dt+'] skipped:',e);resolve([]);});
		});
	}

	// ── Drill-down list view (rendered when opened via #nwpdrill=<id>) ───
	function renderDrillPage(page, id) {
		try {
			var raw = sessionStorage.getItem(id);
			var payload = raw ? JSON.parse(raw) : null;
			var key = payload && payload.key, rows = (payload && payload.rows) || [];
			var NWP_DRILLS = nwpDrillDefs();
			var cfg = (payload && payload.title) ? {title:payload.title, sub:payload.sub||'', src:payload.src||(NWP_DRILLS[key]?NWP_DRILLS[key].src:'C')} : NWP_DRILLS[key];
			if (!cfg) { renderMainDashboard(page, window.location.origin); return; }
			document.title = cfg.title;

			var PS = 50, curPage = 0;
			var ths = 'style="padding:9px 11px;text-align:left;font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#7a8899;background:#f4f6f9;border-bottom:1px solid #e3e8ef;white-space:nowrap;position:sticky;top:0;z-index:2;"';
			var tds = 'style="padding:9px 11px;border-bottom:1px solid #e3e8ef;white-space:nowrap;vertical-align:middle;"';
			var hov = 'onmouseover="this.style.background=\'#e6f5f1\'" onmouseout="this.style.background=\'\'"';

			function svcP(s){if(s==='In Patient Service')return '<span style="background:#e8f0fb;color:#1a5fa8;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;">IPD</span>';if(s==='Out Patient Service')return '<span style="background:#e6f5f1;color:#0e7a5f;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;">OPD</span>';if(s==='Day Care Service')return '<span style="background:#fef3e2;color:#b45309;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;">Daycare</span>';return nwpDv(s);}
			function aprP(v){if(v==='Approved')return '<span style="background:#dcfce7;color:#16a34a;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;">Approved</span>';if(v==='Rejected')return '<span style="background:#fee2e2;color:#dc2626;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;">Rejected</span>';if(v==='Sent back for revision')return '<span style="background:#fef3e2;color:#b45309;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;">Revision</span>';return nwpDv(v);}
			function nwpP(v){return v==='Yes'?'<span style="background:#e6f5f1;color:#0e7a5f;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;">Yes</span>':v==='No'?'<span style="background:#f4f6f9;color:#7a8899;border:1px solid #e3e8ef;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;">No</span>':nwpDv(v);}

			function buildTable(pr, offset) {
				if (cfg.src === 'C') {
					var th='<thead><tr><th '+ths+'>#</th><th '+ths+'>PRID</th><th '+ths+'>Hospital</th><th '+ths+'>Division</th><th '+ths+'>Age</th><th '+ths+'>Gender</th><th '+ths+'>Service Type</th><th '+ths+'>Department</th><th '+ths+'>NWP Required</th><th '+ths+'>Default Hosp (₹)</th><th '+ths+'>Add. Hosp (₹)</th><th '+ths+'>Patient Contrib (₹)</th><th '+ths+'>NWP Contribution (₹)</th><th '+ths+'>Other Donor Name</th><th '+ths+'>Other Donor Contrib (₹)</th><th '+ths+'>Approval Status</th></tr></thead>';
					var tb='<tbody>'+pr.map(function(r,i){var idx=offset+i;return '<tr style="cursor:pointer;" '+hov+' onclick="nwpOpenClaim('+idx+')">'
						+'<td style="padding:9px 11px;border-bottom:1px solid #e3e8ef;color:#b8c4d0;font-size:11px;">'+(idx+1)+'</td>'
						+'<td '+tds+'>'+nwpDv(r.prid)+'</td><td '+tds+'>'+nwpDv(r.organization_copy)+'</td><td '+tds+'>'+nwpDv(r.organization)+'</td>'
						+'<td '+tds+'>'+nwpDv(r.age)+'</td><td '+tds+'>'+nwpDv(r.gender)+'</td>'
						+'<td '+tds+'>'+svcP(r.type_of_service)+'</td><td '+tds+'>'+nwpDv(r.treatment_category)+'</td>'
						+'<td '+tds+'>'+nwpP(r.does_it_require_apf_contribution)+'</td>'
						+'<td '+tds+'>'+nwpRs(r.existing_hospital_contribution)+'</td>'
						+'<td '+tds+'>'+nwpRs(r.additional_hospital_contribution)+'</td>'
						+'<td '+tds+'>'+nwpRs(r.patient_contribution_yes)+'</td>'
						+'<td '+tds+'><strong style="color:#1a5fa8;">'+nwpRs(r.apf_contribution)+'</strong></td>'
						+'<td '+tds+'>'+nwpDv(r.other_donor_name)+'</td><td '+tds+'>'+nwpRs(r.other_donor_contribution)+'</td>'
						+'<td '+tds+'>'+aprP(r.approval_status)+'</td></tr>';
					}).join('')+'</tbody>';
					return '<div style="overflow-x:auto;"><table style="border-collapse:collapse;font-size:12px;font-family:Inter,sans-serif;width:max-content;min-width:100%;">'+th+tb+'</table></div>';
				}
				if (cfg.src === 'B') {
					var thB='<thead><tr><th '+ths+'>#</th><th '+ths+'>Record ID</th><th '+ths+'>Division</th><th '+ths+'>Hospital</th><th '+ths+'>Date of Approval</th><th '+ths+'>Financial Year</th><th '+ths+'>Start Date</th><th '+ths+'>End Date</th><th '+ths+'>Grant ID</th><th '+ths+'>Total Budget (₹)</th></tr></thead>';
					var tbB='<tbody>'+pr.map(function(r,i){return '<tr><td style="padding:9px 11px;border-bottom:1px solid #e3e8ef;color:#b8c4d0;font-size:11px;">'+(offset+i+1)+'</td><td '+tds+'><strong>'+nwpDv(r.name)+'</strong></td><td '+tds+'>'+nwpDv(r.organization_name)+'</td><td '+tds+'>'+nwpDv(r.hospital_name)+'</td><td '+tds+'>'+nwpDv(r.date_of_approval)+'</td><td '+tds+'>'+nwpDv(r.financial_year)+'</td><td '+tds+'>'+nwpDv(r.start_date)+'</td><td '+tds+'>'+nwpDv(r.end_date)+'</td><td '+tds+'>'+nwpDv(r.grant_id)+'</td><td '+tds+'><strong>'+nwpRs(r.total_budget)+'</strong></td></tr>';}).join('')+'</tbody>';
					return '<div style="overflow-x:auto;"><table style="border-collapse:collapse;font-size:12px;font-family:Inter,sans-serif;width:max-content;min-width:100%;">'+thB+tbB+'</table></div>';
				}
				var thD='<thead><tr><th '+ths+'>#</th><th '+ths+'>Record ID</th><th '+ths+'>Date</th><th '+ths+'>Division</th><th '+ths+'>Hospital</th><th '+ths+'>Disbursed Amount (₹)</th></tr></thead>';
				var tbD='<tbody>'+pr.map(function(r,i){return '<tr><td style="padding:9px 11px;border-bottom:1px solid #e3e8ef;color:#b8c4d0;font-size:11px;">'+(offset+i+1)+'</td><td '+tds+'><strong>'+nwpDv(r.name)+'</strong></td><td '+tds+'>'+nwpDv(r.date)+'</td><td '+tds+'>'+nwpDv(r.organization)+'</td><td '+tds+'>'+nwpDv(r.hospital_name)+'</td><td '+tds+'><strong>'+nwpRs(r.disbursed_amount)+'</strong></td></tr>';}).join('')+'</tbody>';
				return '<div style="overflow-x:auto;"><table style="border-collapse:collapse;font-size:12px;font-family:Inter,sans-serif;width:max-content;min-width:100%;">'+thD+tbD+'</table></div>';
			}

			function sumBar() {
				var nn=function(v){return Number(v)||0;};
				var si=function(l,v){return '<div style="display:flex;flex-direction:column;gap:2px;min-width:100px;"><span style="font-size:10px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:#7a8899;">'+l+'</span><span style="font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;">'+v+'</span></div>';};
				var w='<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;padding:12px 14px;background:#f4f6f9;border-radius:10px;border:1px solid #e3e8ef;">';
				if (cfg.src === 'C') {
					var tA=0,tAg=0,tP=0,tN=0,tHD=0,tHA=0;
					rows.forEach(function(r){tA+=nn(r.total_actual_final_bill_in_rs);tAg+=nn(r.total_bill_at_apf_agreed_rates_mou);tP+=nn(r.patient_contribution_yes);tN+=nn(r.apf_contribution);tHD+=nn(r.existing_hospital_contribution);tHA+=nn(r.additional_hospital_contribution);});
					return w+si('Records',rows.length)+si('Total Actual Bill',nwpRs(tA))+si('Bill @ NWP Rates',nwpRs(tAg))+si('Default Hosp',nwpRs(tHD))+si('Add. Hosp',nwpRs(tHA))+si('Patient Contrib',nwpRs(tP))+si('NWP Contrib',nwpRs(tN))+'</div>';
				}
				if (cfg.src === 'B') {
					var tot=rows.reduce(function(s,b){return s+nn(b.total_budget);},0);
					return w+si('Records',rows.length)+si('Total Budget',nwpRs(tot))+'</div>';
				}
				var totD=rows.reduce(function(s,d){return s+nn(d.disbursed_amount);},0);
				return w+si('Records',rows.length)+si('Total Disbursed',nwpRs(totD))+'</div>';
			}

			function renderP() {
				var s = curPage*PS, e = Math.min(s+PS, rows.length);
				document.getElementById('nwp-dbody').innerHTML = sumBar() + buildTable(rows.slice(s, e), s);
				var tot = Math.ceil(rows.length/PS), pg = document.getElementById('nwp-dpager');
				if (tot > 1) {
					pg.style.display = 'flex';
					document.getElementById('nwp-dinfo').textContent = 'Showing '+(s+1)+'–'+e+' of '+rows.length+' | Page '+(curPage+1)+' of '+tot;
					document.getElementById('nwp-dprev').disabled = curPage === 0;
					document.getElementById('nwp-dnext').disabled = curPage >= tot-1;
				} else {
					pg.style.display = 'none';
				}
			}

			$(page.body).html(
				'<div id="nwp-dash-drill">'
				+'<div style="background:#fff;border-bottom:1px solid #e3e8ef;padding:0 24px;height:52px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">'
				+'<div><div style="font-size:15px;font-weight:700;color:#0d1117;">'+nwpEsc(cfg.title)+'</div><div style="font-size:12px;color:#7a8899;margin-top:2px;">'+nwpEsc(cfg.sub)+' ('+rows.length+' records)</div></div>'
				+'<button onclick="nwpDlExcel()" style="padding:7px 14px;border-radius:8px;border:1px solid #0e7a5f;background:#e6f5f1;color:#0e7a5f;font-size:12px;font-weight:600;cursor:pointer;">&#8681; Download Excel</button>'
				+'</div>'
				+'<div id="nwp-dbody" style="padding:16px 24px;overflow:auto;flex:1;"></div>'
				+'<div id="nwp-dpager" style="display:none;align-items:center;justify-content:center;gap:16px;padding:12px 24px;border-top:1px solid #e3e8ef;background:#fff;">'
				+'<button id="nwp-dprev" onclick="nwpChgPage(-1)" style="padding:7px 16px;border-radius:8px;border:1px solid #e3e8ef;background:#f4f6f9;cursor:pointer;font-size:13px;">&#8592; Prev</button>'
				+'<span id="nwp-dinfo" style="font-size:12px;color:#7a8899;"></span>'
				+'<button id="nwp-dnext" onclick="nwpChgPage(1)" style="padding:7px 16px;border-radius:8px;border:1px solid #e3e8ef;background:#f4f6f9;cursor:pointer;font-size:13px;">Next &#8594;</button>'
				+'</div></div>'
			);

			window.nwpChgPage = function(dir) {
				curPage = Math.max(0, Math.min(curPage+dir, Math.ceil(rows.length/PS)-1));
				renderP();
				document.getElementById('nwp-dbody').scrollTop = 0;
			};
			window.nwpOpenClaim = function(idx) {
				var r = rows[idx]; if (!r) return;
				var cid = 'c'+Date.now()+Math.random().toString(36).slice(2);
				sessionStorage.setItem(cid, JSON.stringify(r));
				window.open(window.location.origin+'/app/nwp-dashboard#nwpclaim='+cid, '_blank');
			};
			window.nwpDlExcel = function() {
				if (!window.XLSX) { frappe.msgprint(__('Excel library still loading — try again in a moment.')); return; }
				var data = [];
				if (cfg.src === 'C') {
					data.push(['PRID','Hospital','Division','Age','Gender','Service Type','Department','NWP Required','Default Hosp (Rs)','Add. Hosp (Rs)','Patient Contrib (Rs)','NWP Contribution (Rs)','Other Donor Name','Other Donor Contrib (Rs)','Approval Status']);
					rows.forEach(function(r){data.push([r.prid,r.organization_copy,r.organization,r.age,r.gender,r.type_of_service,r.treatment_category,r.does_it_require_apf_contribution,Number(r.existing_hospital_contribution)||0,Number(r.additional_hospital_contribution)||0,Number(r.patient_contribution_yes)||0,Number(r.apf_contribution)||0,r.other_donor_name,Number(r.other_donor_contribution)||0,r.approval_status]);});
				} else if (cfg.src === 'B') {
					data.push(['Record ID','Division','Hospital','Date of Approval','Financial Year','Start Date','End Date','Grant ID','Total Budget (Rs)']);
					rows.forEach(function(r){data.push([r.name,r.organization_name,r.hospital_name,r.date_of_approval,r.financial_year,r.start_date,r.end_date,r.grant_id,Number(r.total_budget)||0]);});
				} else {
					data.push(['Record ID','Date','Division','Hospital','Disbursed Amount (Rs)']);
					rows.forEach(function(r){data.push([r.name,r.date,r.organization,r.hospital_name,Number(r.disbursed_amount)||0]);});
				}
				var ws = XLSX.utils.aoa_to_sheet(data);
				var wb = XLSX.utils.book_new();
				XLSX.utils.book_append_sheet(wb, ws, cfg.title.replace(/[^a-zA-Z0-9 ]/g,'').substring(0,31));
				ws['!cols'] = data[0].map(function(h,ci){var mx=String(h).length;data.slice(1).forEach(function(row){var l=String(row[ci]||'').length;if(l>mx)mx=l;});return{wch:Math.min(mx+2,40)};});
				XLSX.writeFile(wb, cfg.title.replace(/[^a-zA-Z0-9 ]/g,'_')+'.xlsx');
			};

			renderP();
		} catch (e) {
			console.error('NWP drill render error', e);
			renderMainDashboard(page, window.location.origin);
		}
	}

	// ── Single-claim detail view (rendered when opened via #nwpclaim=<id>) ─
	function renderClaimPage(page, id) {
		try {
			var raw = sessionStorage.getItem(id);
			var r = raw ? JSON.parse(raw) : null;
			if (!r || !r.name) { renderMainDashboard(page, window.location.origin); return; }
			document.title = (r.name || '') + ' — ' + (r.name1 || '');

			var isYes = r.does_it_require_apf_contribution === 'Yes';
			var sl = r.type_of_service==='In Patient Service'?'IPD':r.type_of_service==='Out Patient Service'?'OPD':r.type_of_service==='Day Care Service'?'Day Care':nwpDv(r.type_of_service);
			var sc = r.type_of_service==='In Patient Service'?'#1d4ed8':r.type_of_service==='Out Patient Service'?'#0e7a5f':'#b45309';
			var sb = r.type_of_service==='In Patient Service'?'#dbeafe':r.type_of_service==='Out Patient Service'?'#e6f5f1':'#fef3e2';
			function row(l,v){return '<tr><td style="padding:8px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#7a8899;width:40%;border-bottom:1px solid #f0f2f5;white-space:nowrap;">'+l+'</td><td style="padding:8px 14px;font-size:13px;color:#0d1117;font-weight:500;border-bottom:1px solid #f0f2f5;">'+v+'</td></tr>';}
			function rowAmt(l,v){return '<tr><td style="padding:8px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#7a8899;width:40%;border-bottom:1px solid #f0f2f5;white-space:nowrap;">'+l+'</td><td style="padding:8px 14px;font-size:14px;font-weight:800;font-variant-numeric:tabular-nums;color:#0d1117;border-bottom:1px solid #f0f2f5;">'+v+'</td></tr>';}
			function sec(t,c){return '<div style="background:#fff;border:1px solid #e3e8ef;border-radius:8px;overflow:hidden;margin-bottom:12px;"><div style="padding:8px 14px;background:#f4f6f9;border-bottom:1px solid #e3e8ef;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#7a8899;">'+t+'</div><table style="width:100%;border-collapse:collapse;">'+c+'</table></div>';}
			function pill(v){if(v==='Approved')return '<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">Approved</span>';if(v==='Rejected')return '<span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">Rejected</span>';if(v==='Sent back for revision')return '<span style="background:#fef3e2;color:#b45309;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">Revision</span>';if(v==='Claim form fully filled')return '<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">Fully Filled</span>';if(v==='Claim form partially filled')return '<span style="background:#fef9c3;color:#854d0e;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">Partially Filled</span>';return nwpDv(v);}

			$(page.body).html(
				'<div id="nwp-dash-claim">'
				+'<div style="background:#fff;border-bottom:1px solid #e3e8ef;padding:0 20px;height:46px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;"><div style="display:flex;align-items:center;gap:8px;"><div style="width:24px;height:24px;border-radius:5px;background:linear-gradient(135deg,#12a07a,#0a5e47);display:flex;align-items:center;justify-content:center;font-size:12px;">🏥</div><div style="font-size:13px;font-weight:700;color:#0e7a5f;">Network Hospital Programme</div><div style="font-size:10px;color:#7a8899;margin-left:4px;">— Patient Claim Detail</div></div><div style="display:flex;align-items:center;gap:8px;"><a href="/app/patient-claim-form/'+encodeURIComponent(r.name)+'" target="_blank" style="padding:4px 12px;border-radius:6px;background:#0e7a5f;color:#fff;font-size:11px;font-weight:600;text-decoration:none;">Open in Frappe ↗</a><button onclick="window.close()" style="padding:4px 12px;border-radius:6px;border:1px solid #e3e8ef;background:#f4f6f9;font-size:11px;cursor:pointer;color:#3d4a5c;">✕ Close</button></div></div>'
				+'<div style="background:linear-gradient(135deg,#e6f5f1,#f0f9f6);border-bottom:1px solid #c8e8e0;padding:10px 20px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex-shrink:0;"><span style="font-size:11px;background:#fff;border:1px solid #e3e8ef;border-radius:20px;padding:2px 9px;color:#7a8899;">'+nwpDv(r.patient_id)+'</span><span style="font-size:11px;background:#fff;border:1px solid #e3e8ef;border-radius:20px;padding:2px 9px;color:#7a8899;">'+nwpDv(r.age)+' yrs, '+nwpDv(r.gender)+'</span><span style="font-size:11px;background:#fff;border:1px solid #e3e8ef;border-radius:20px;padding:2px 9px;color:#7a8899;">'+nwpDv(r.organization_copy)+'</span><span style="font-size:11px;background:'+sb+';border-radius:20px;padding:2px 9px;color:'+sc+';font-weight:600;">'+sl+'</span><span style="font-size:11px;background:'+(isYes?'#dcfce7':'#f4f6f9')+';border-radius:20px;padding:2px 9px;color:'+(isYes?'#166534':'#7a8899')+';font-weight:600;">NWP: '+(isYes?'Yes':'No')+'</span></div>'
				+'<div style="flex:1;overflow:auto;display:flex;gap:12px;padding:12px 20px;"><div style="display:flex;flex-direction:column;gap:12px;flex:1;min-width:0;">'
				+sec('Patient Information',row('PRID',nwpDv(r.prid))+row('Patient ID',nwpDv(r.patient_id))+row('Age',nwpDv(r.age)+' years')+row('Gender',nwpDv(r.gender))+row('Division',nwpDv(r.organization))+row('Hospital',nwpDv(r.organization_copy)))
				+sec('Visit Information',row('Date of Visit',nwpDv(r.date_of_visit))+row('Date of Discharge',nwpDv(r.date_of_discharge))+row('Service Type',sl)+row('Department',nwpDv(r.treatment_category))+(r.if_other_treatment_please_mention?row('Other Treatment',nwpDv(r.if_other_treatment_please_mention)):'')+(r.treating_doctor_name?row('Doctor',nwpDv(r.treating_doctor_name)):'')+row('NWP Required',nwpDv(r.does_it_require_apf_contribution))+(r.justification?row('Remarks',nwpDv(r.justification)):''))
				+'</div><div style="display:flex;flex-direction:column;gap:12px;flex:1;min-width:0;">'
				+sec('Financial Details',rowAmt('Total Actual Bill',nwpRs(r.total_actual_final_bill_in_rs))+(isYes?rowAmt('Bill @ NWP Rate',nwpRs(r.total_bill_at_apf_agreed_rates_mou)):'')+rowAmt('Default Hosp Contribution',nwpRs(r.existing_hospital_contribution))+rowAmt('Add. Hosp Contribution',nwpRs(r.additional_hospital_contribution))+rowAmt('Patient Contribution',nwpRs(r.patient_contribution_yes))+(isYes?rowAmt('NWP Contribution',nwpRs(r.apf_contribution)):'')+row('Other Donor Name',nwpDv(r.other_donor_name))+rowAmt('Other Donor Contribution',nwpRs(r.other_donor_contribution)))
				+sec('Status',row('Document Status',pill(r.document_status))+row('Approval Status',pill(r.approval_status))+(r.comment?row('Comment',nwpDv(r.comment)):''))
				+'</div></div></div>'
			);
		} catch (e) {
			console.error('NWP claim render error', e);
			renderMainDashboard(page, window.location.origin);
		}
	}

	// ── Drill definitions (shared by the main dashboard and #nwpdrill=) ──
	function nwpDrillDefs() {
		return {
			'all':         {title:'Total Patients Supported',        sub:'All approved patient claim records',src:'C',f:null},
			'nwh':         {title:'Patients Supported under NWP',    sub:'NWP required = Yes',               src:'C',f:function(r){return r.does_it_require_apf_contribution==='Yes';}},
			'apf-sub':     {title:'NWP Contribution',                sub:'NWP required = Yes claims',        src:'C',f:function(r){return r.does_it_require_apf_contribution==='Yes';}},
			'pat-contrib': {title:'Patient Contribution',            sub:'All approved claims',              src:'C',f:null},
			'hosp-default':{title:'Default Hospital Contribution',   sub:'NWP = Yes claims',                 src:'C',f:function(r){return r.does_it_require_apf_contribution==='Yes';}},
			'other-donor': {title:'Other Donor Contribution',        sub:'NWP = No claims',                  src:'C',f:function(r){return r.does_it_require_apf_contribution==='No';}},
			'hosp-add':    {title:'Additional Hospital Contribution',sub:'All approved claims',              src:'C',f:null},
			'g-approved':  {title:'Grant Approved',                  sub:'Network Hospital Budget records',  src:'B',f:null},
			'g-disbursed': {title:'Grant Disbursed',                 sub:'Budget Disbursement records',      src:'D',f:null},
			'g-utilized':  {title:'Grant Utilized',                  sub:'NWP required = Yes claims',        src:'C',f:function(r){return r.does_it_require_apf_contribution==='Yes';}},
			'g-balance':   {title:'Balance Amount',                  sub:'Grant Approved − Grant Utilized',  src:'B',f:null},
		};
	}

	// ── Main overview dashboard ───────────────────────────────────────────
	function renderMainDashboard(page, FBASE) {
		document.title = 'APF Hospital Programme Dashboard';
		$(page.body).html(`
<div id="nwp-dash">
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Epilogue:wght@300;400;500;600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">

<div class="nwp-topbar">
  <div class="nwp-tb-left">
    <div class="nwp-tb-logo">H</div>
    <div><div class="nwp-tb-name">Network Hospital Programme</div><div class="nwp-tb-sub">Patient Claims &amp; Grant Tracking Dashboard</div></div>
  </div>
  <div style="display:flex;align-items:center;gap:16px;">
    <div class="nwp-tb-live"><div class="nwp-ldot"></div><span>Live</span></div>
    <button class="nwp-btn nwp-btn-p" onclick="frappe.set_route('')" style="font-size:12px;padding:6px 14px;">Open Workspace</button>
  </div>
</div>

<div class="nwp-fstrip">
  <div class="nwp-fg">
    <label>Hospital</label>
    <select id="nwp-f-hosp" onchange="nwpOnHospChange()"><option value="">All Hospitals</option></select>
  </div>
  <div class="nwp-fg">
    <label>Division</label>
    <select id="nwp-f-org"><option value="">All Divisions</option></select>
  </div>
  <div class="nwp-fg"><label>Department</label><select id="nwp-f-dept"><option value="">All Departments</option></select></div>
  <div class="nwp-fg"><label>Service Type</label>
    <select id="nwp-f-svc">
      <option value="">All Service Types</option>
      <option value="In Patient Service">In Patient (IPD)</option>
      <option value="Out Patient Service">Out Patient (OPD)</option>
      <option value="Day Care Service">Day Care</option>
    </select>
  </div>
  <div class="nwp-fg"><label>Financial Year</label><select id="nwp-f-fy"><option value="">All Years</option></select></div>
  <div class="nwp-fg"><label>From Date</label><input type="date" id="nwp-f-fromdate"></div>
  <div class="nwp-fg"><label>To Date</label><input type="date" id="nwp-f-todate"></div>
  <div class="nwp-fg"><label>Donor Category</label><select id="nwp-f-donor"><option value="">All Donors</option></select></div>
  <div class="nwp-fbtns">
    <button class="nwp-btn nwp-btn-g" onclick="nwpClearFilters()">Clear</button>
    <button class="nwp-btn nwp-btn-p" onclick="nwpApplyFilters()">Apply</button>
  </div>
</div>

<div class="nwp-page">
  <div style="width:fit-content;margin:0 auto;">
  <div class="nwp-slabel">Overview</div>
  <div class="nwp-card-row">
    <div class="nwp-card" style="--nwp-cc:var(--green)" onclick="nwpDrill('all')"><div class="nwp-cv" id="nwp-m-total"></div><div class="nwp-cl">Total Patients Supported</div></div>
    <div class="nwp-card" style="--nwp-cc:var(--blue)"  onclick="nwpDrill('nwh')"><div class="nwp-cv" id="nwp-m-nwh"></div><div class="nwp-cl">Patients Supported under NWP</div></div>
    <div class="nwp-card-divider"></div>
    <div class="nwp-card" style="--nwp-cc:var(--blue)"   onclick="nwpDrill('g-approved')"><div class="nwp-cv" id="nwp-g-approved"></div><div class="nwp-cl">Grant Approved</div></div>
    <div class="nwp-card" style="--nwp-cc:var(--amber)"  onclick="nwpDrill('g-disbursed')"><div class="nwp-cv" id="nwp-g-disbursed"></div><div class="nwp-cl">Grant Disbursed</div></div>
    <div class="nwp-card" style="--nwp-cc:var(--green)"  onclick="nwpDrill('g-utilized')"><div class="nwp-cv" id="nwp-g-utilized"></div><div class="nwp-cl">Grant Utilized</div></div>
    <div class="nwp-card" style="--nwp-cc:var(--violet)" onclick="nwpDrill('g-balance')"><div class="nwp-cv" id="nwp-g-balance"></div><div class="nwp-cl">Balance Amount</div></div>
  </div>
  <div class="nwp-slabel">Contribution Summary</div>
  <div class="nwp-contrib-table-wrap">
    <table class="nwp-contrib-table">
      <thead>
        <tr>
          <th>Contribution Type</th>
          <th class="nwp-col-nwp">NWP</th>
          <th class="nwp-col-out">Others</th>
          <th class="nwp-col-total">Total</th>
        </tr>
      </thead>
      <tbody>
        <tr onclick="nwpDrill('hosp-default')" class="nwp-clickable">
          <td class="nwp-row-label">Default Hospital Contribution</td>
          <td class="nwp-col-nwp nwp-amount" id="nwp-ct-hosp-default-nwp">—</td><td class="nwp-col-out nwp-muted">—</td>
          <td class="nwp-col-total nwp-amount" id="nwp-ct-hosp-default-total">—</td>
        </tr>
        <tr onclick="nwpDrill('hosp-add')" class="nwp-clickable">
          <td class="nwp-row-label">Additional Hospital Contribution</td>
          <td class="nwp-col-nwp nwp-amount" id="nwp-ct-hosp-add-nwp">—</td><td class="nwp-col-out nwp-amount" id="nwp-ct-hosp-add-out">—</td>
          <td class="nwp-col-total nwp-amount" id="nwp-ct-hosp-add-total">—</td>
        </tr>
        <tr onclick="nwpDrill('apf-sub')" class="nwp-clickable">
          <td class="nwp-row-label">NWP Contribution</td>
          <td class="nwp-col-nwp nwp-amount" id="nwp-ct-nwp-nwp">—</td><td class="nwp-col-out nwp-muted">—</td>
          <td class="nwp-col-total nwp-amount" id="nwp-ct-nwp-total">—</td>
        </tr>
        <tr onclick="nwpToggleOtherDonor()" class="nwp-clickable">
          <td class="nwp-row-label"><span class="nwp-caret" id="nwp-other-donor-caret">&#9656;</span>Other Donor Contribution</td>
          <td class="nwp-col-nwp nwp-muted">—</td><td class="nwp-col-out nwp-amount" id="nwp-ct-donor-out">—</td>
          <td class="nwp-col-total nwp-amount" id="nwp-ct-donor-total">—</td>
        </tr>
      </tbody>
      <tbody id="nwp-other-donor-subrows" style="display:none;"></tbody>
      <tbody>
        <tr class="nwp-grand-total">
          <td class="nwp-row-label">Total Subsidy</td>
          <td class="nwp-col-nwp" id="nwp-ct-grand-nwp">—</td><td class="nwp-col-out" id="nwp-ct-grand-out">—</td>
          <td class="nwp-col-total" id="nwp-ct-grand-total">—</td>
        </tr>
        <tr onclick="nwpDrill('pat-contrib')" class="nwp-clickable">
          <td class="nwp-row-label">Patient Contribution</td>
          <td class="nwp-col-nwp nwp-amount" id="nwp-ct-pat-nwp">—</td><td class="nwp-col-out nwp-amount" id="nwp-ct-pat-out">—</td>
          <td class="nwp-col-total nwp-amount" id="nwp-ct-pat-total">—</td>
        </tr>
        <tr class="nwp-grand-total">
          <td class="nwp-row-label">Total Bill</td>
          <td class="nwp-col-nwp" id="nwp-ct-bill-nwp">—</td><td class="nwp-col-out" id="nwp-ct-bill-out">—</td>
          <td class="nwp-col-total" id="nwp-ct-bill-total">—</td>
        </tr>
      </tbody>
    </table>
  </div>
  </div>
</div>
</div>
`);

		// ── Data & logic ────────────────────────────────────────────────
		var NWP_C=[], NWP_B=[], NWP_D=[], NWP_ALL_HOSPS=[];

		function nwpPop(id,list){
			var sel=document.getElementById(id);if(!sel)return;
			(list||[]).forEach(function(o){
				var opt=document.createElement('option');
				opt.value=opt.text=o.name;
				sel.appendChild(opt);
			});
		}

		function nwpPopulateDonorCategories(rows){
			var sel=document.getElementById('nwp-f-donor');if(!sel)return;
			sel.innerHTML='<option value="">All Donors</option>';
			var seen={};
			(rows||[]).forEach(function(r){
				var nm=(r.other_donor_name||'').trim();
				if(nm&&!seen[nm]){
					seen[nm]=true;
					var opt=document.createElement('option');
					opt.value=opt.text=nm;
					sel.appendChild(opt);
				}
			});
		}

		function nwpPopulateAllDivisions(){
			var sel=document.getElementById('nwp-f-org');if(!sel)return;
			sel.innerHTML='<option value="">All Divisions</option>';
			var seen={};
			NWP_ALL_HOSPS.forEach(function(h){
				if(h.organization&&!seen[h.organization]){
					seen[h.organization]=true;
					var opt=document.createElement('option');
					opt.value=opt.text=h.organization;
					sel.appendChild(opt);
				}
			});
		}

		window.nwpOnHospChange = function(){
			var hosp=document.getElementById('nwp-f-hosp').value;
			var sel=document.getElementById('nwp-f-org');
			sel.innerHTML='<option value="">All Divisions</option>';
			if(!hosp){nwpPopulateAllDivisions();return;}
			var matched=NWP_ALL_HOSPS.filter(function(h){return h.name===hosp;});
			var seen={};
			matched.forEach(function(h){
				if(h.organization&&!seen[h.organization]){
					seen[h.organization]=true;
					var opt=document.createElement('option');
					opt.value=opt.text=h.organization;
					sel.appendChild(opt);
				}
			});
			if(sel.options.length===2) sel.value=sel.options[1].value;
		};

		window.nwpApplyFilters = function(){nwpLoadAll();};
		window.nwpClearFilters = function(){
			['nwp-f-hosp','nwp-f-org','nwp-f-dept','nwp-f-svc','nwp-f-fy','nwp-f-fromdate','nwp-f-todate','nwp-f-donor'].forEach(function(id){
				var el=document.getElementById(id);if(el)el.value='';
			});
			nwpPopulateAllDivisions();
			nwpLoadAll();
		};

		function nwpGv(id){var el=document.getElementById(id);return el?el.value:'';}

		async function nwpLoadAll(){
			var org=nwpGv('nwp-f-org'),dept=nwpGv('nwp-f-dept'),fy=nwpGv('nwp-f-fy'),svc=nwpGv('nwp-f-svc'),hosp=nwpGv('nwp-f-hosp');
			var fromDate=nwpGv('nwp-f-fromdate'),toDate=nwpGv('nwp-f-todate'),donor=nwpGv('nwp-f-donor');
			var cf=[],bf=[],df=[];
			if(hosp){cf.push(['organization_copy','=',hosp]);bf.push(['hospital_name','=',hosp]);df.push(['hospital_name','=',hosp]);}
			if(org){cf.push(['organization','=',org]);bf.push(['organization_name','=',org]);df.push(['organization','=',org]);}
			if(dept){cf.push(['treatment_category','=',dept]);}
			if(svc){cf.push(['type_of_service','=',svc]);}
			if(fy){bf.push(['financial_year','=',fy]);}
			if(fromDate){cf.push(['date_of_visit','>=',fromDate]);bf.push(['date_of_approval','>=',fromDate]);df.push(['date','>=',fromDate]);}
			if(toDate){cf.push(['date_of_visit','<=',toDate]);bf.push(['date_of_approval','<=',toDate]);df.push(['date','<=',toDate]);}
			if(donor){cf.push(['other_donor_name','=',donor]);}
			var cf2=['name','docstatus','prid','patient_id','organization','organization_copy','name1','age','gender','type_of_service','date_of_visit','date_of_discharge','treating_doctor_name','treatment_category','final_diagnosis','total_actual_final_bill_in_rs','does_it_require_apf_contribution','justification','total_bill_at_apf_agreed_rates_mou','existing_hospital_contribution','other_donor_contribution','other_donor_name','patient_contribution_yes','additional_hospital_contribution','apf_contribution','document_status','approval_status','comment','why_this_patient_is_eligible_for_subsidy_for_this_service','if_other_treatment_please_mention'];
			var res=await Promise.all([
				nwpFdb('Patient Claim Form',cf2,cf),
				nwpFdb('Network Hospital Budget',['name','organization_name','hospital_name','date_of_approval','financial_year','start_date','end_date','grant_id','total_budget'],bf),
				nwpFdb('Budget Disbursement',['name','date','organization','hospital_name','disbursed_amount'],df),
			]);
			NWP_C=res[0];NWP_B=res[1];NWP_D=res[2];
			nwpRender();
		}

		function nwpRender(){
			var n=function(v){return Number(v)||0;};
			// Only Approved claims count towards every total and drill-down —
			// matches the rule the standalone web page always used.
			var CA=NWP_C.filter(function(r){return r.approval_status==='Approved';});
			var yes=CA.filter(function(r){return r.does_it_require_apf_contribution==='Yes';});
			var no=CA.filter(function(r){return r.does_it_require_apf_contribution==='No';});
			nwpCu('nwp-m-total',CA.length,false);
			nwpCu('nwp-m-nwh',yes.length,false);
			var hDef=yes.reduce(function(s,r){return s+n(r.existing_hospital_contribution);},0);
			var hAddY=yes.reduce(function(s,r){return s+n(r.additional_hospital_contribution);},0);
			var hAddN=no.reduce(function(s,r){return s+n(r.additional_hospital_contribution);},0);
			var patY=yes.reduce(function(s,r){return s+n(r.patient_contribution_yes);},0);
			var patN=no.reduce(function(s,r){return s+n(r.patient_contribution_yes);},0);
			var donor=no.reduce(function(s,r){return s+n(r.other_donor_contribution);},0);
			var nwp=yes.reduce(function(s,r){return s+n(r.apf_contribution);},0);
			nwpSetCell('nwp-ct-hosp-default-nwp',hDef);nwpSetCell('nwp-ct-hosp-default-total',hDef);
			nwpSetCell('nwp-ct-hosp-add-nwp',hAddY);nwpSetCell('nwp-ct-hosp-add-out',hAddN);nwpSetCell('nwp-ct-hosp-add-total',hAddY+hAddN);
			nwpSetCell('nwp-ct-nwp-nwp',nwp);nwpSetCell('nwp-ct-nwp-total',nwp);
			nwpSetCell('nwp-ct-donor-out',donor);nwpSetCell('nwp-ct-donor-total',donor);
			nwpRenderOtherDonorBreakdown(no);
			var gN=hDef+hAddY+nwp,gO=hAddN+donor;
			nwpSetCell('nwp-ct-grand-nwp',gN);nwpSetCell('nwp-ct-grand-out',gO);nwpSetCell('nwp-ct-grand-total',gN+gO);
			nwpSetCell('nwp-ct-pat-nwp',patY);nwpSetCell('nwp-ct-pat-out',patN);nwpSetCell('nwp-ct-pat-total',patY+patN);
			nwpSetCell('nwp-ct-bill-nwp',gN+patY);nwpSetCell('nwp-ct-bill-out',gO+patN);nwpSetCell('nwp-ct-bill-total',gN+gO+patY+patN);
			var approved=NWP_B.reduce(function(s,b){return s+(Number(b.total_budget)||0);},0);
			var disbursed=NWP_D.reduce(function(s,d){return s+(Number(d.disbursed_amount)||0);},0);
			nwpCu('nwp-g-approved',approved,true);nwpCu('nwp-g-disbursed',disbursed,true);
			nwpCu('nwp-g-utilized',nwp,true);nwpCu('nwp-g-balance',approved-nwp,true);
		}

		// Group "Other Donor Contribution" (NWP=No) claims by donor name for the drill-down breakdown rows
		function nwpRenderOtherDonorBreakdown(no){
			var byDonor={};
			(no||[]).forEach(function(r){
				var nm=(r.other_donor_name||'').trim()||'Other';
				byDonor[nm]=(byDonor[nm]||0)+(Number(r.other_donor_contribution)||0);
			});
			var tbody=document.getElementById('nwp-other-donor-subrows');if(!tbody)return;
			tbody.innerHTML='';
			Object.keys(byDonor).sort().forEach(function(nm){
				var tr=document.createElement('tr');
				tr.className='nwp-clickable nwp-sub-row';
				tr.onclick=function(){nwpDrillDonor(nm);};
				var tdLabel=document.createElement('td');
				tdLabel.className='nwp-row-label nwp-sub-label';
				tdLabel.textContent=nm;
				var tdNwp=document.createElement('td');
				tdNwp.className='nwp-col-nwp nwp-muted';
				tdNwp.textContent='—';
				var tdOut=document.createElement('td');
				tdOut.className='nwp-col-out nwp-amount';
				tdOut.textContent='₹'+nwpFmt(byDonor[nm]);
				var tdTotal=document.createElement('td');
				tdTotal.className='nwp-col-total nwp-amount';
				tdTotal.textContent='₹'+nwpFmt(byDonor[nm]);
				tr.appendChild(tdLabel);tr.appendChild(tdNwp);tr.appendChild(tdOut);tr.appendChild(tdTotal);
				tbody.appendChild(tr);
			});
		}

		window.nwpToggleOtherDonor = function(){
			var tbody=document.getElementById('nwp-other-donor-subrows');
			var caret=document.getElementById('nwp-other-donor-caret');
			if(!tbody||!caret)return;
			var open=tbody.style.display!=='none';
			tbody.style.display=open?'none':'table-row-group';
			caret.classList.toggle('open',!open);
		};

		function nwpOpenDrillTab(payload) {
			var id='d'+Date.now()+Math.random().toString(36).slice(2);
			sessionStorage.setItem(id,JSON.stringify(payload));
			window.open(FBASE+'/app/nwp-dashboard#nwpdrill='+id,'_blank');
		}

		// Drill into claims for a single donor within "Other Donor Contribution"
		window.nwpDrillDonor = function(donorName){
			var CA=NWP_C.filter(function(r){return r.approval_status==='Approved';});
			var rows=CA.filter(function(r){
				return r.does_it_require_apf_contribution==='No'&&((r.other_donor_name||'').trim()||'Other')===donorName;
			});
			nwpOpenDrillTab({key:'other-donor',rows:rows,title:'Other Donor Contribution — '+donorName,sub:'NWP = No claims, Donor: '+donorName,src:'C'});
		};

		function nwpSetCell(id,val){
			var el=document.getElementById(id);if(!el)return;
			var dur=700,t0=performance.now(),target=val;
			(function tick(now){var p=Math.min((now-t0)/dur,1),v=Math.round(p*target);el.textContent='₹'+nwpFmt(v);if(p<1)requestAnimationFrame(tick);})(t0);
		}

		function nwpCu(id,target,currency){
			var el=document.getElementById(id);if(!el)return;
			var dur=700,t0=performance.now();
			(function tick(now){var p=Math.min((now-t0)/dur,1),v=Math.round(p*target);el.textContent=currency?'₹'+nwpFmt(v):v.toLocaleString('en-IN');if(p<1)requestAnimationFrame(tick);})(t0);
		}

		window.nwpDrill = function(key){
			var NWP_DRILLS = nwpDrillDefs();
			var cfg=NWP_DRILLS[key];if(!cfg)return;
			var CA=NWP_C.filter(function(r){return r.approval_status==='Approved';});
			var rows=cfg.src==='C'?(cfg.f?CA.filter(cfg.f):CA.slice()):cfg.src==='B'?NWP_B.slice():NWP_D.slice();
			// Patient claim data (diagnosis, financials, justification) is kept
			// out of the URL/browser history — passed via sessionStorage and a
			// short id instead, read back by this same page in the new tab.
			nwpOpenDrillTab({key:key,rows:rows});
		};

		// ── Init ──────────────────────────────────────────────────────────
		(async function(){
			var hosps=await nwpFdb('Hospital With Organization',['name','organization'],[]).catch(function(){return[];});
			NWP_ALL_HOSPS=hosps||[];
			var depts=await nwpFdb('Department',['name'],[]).catch(function(){return[];});
			var fys=await nwpFdb('Financial Year',['name'],[]).catch(function(){return[];});
			var donorRows=await nwpFdb('Patient Claim Form',['other_donor_name'],[['other_donor_name','!=','']]).catch(function(){return[];});
			nwpPop('nwp-f-hosp',NWP_ALL_HOSPS);
			nwpPop('nwp-f-dept',depts);
			nwpPop('nwp-f-fy',fys);
			nwpPopulateDonorCategories(donorRows);
			nwpPopulateAllDivisions();
			await nwpLoadAll();
		})();
	}
};
