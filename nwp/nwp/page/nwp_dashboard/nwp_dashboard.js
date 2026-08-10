frappe.pages['nwp-dashboard'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'APF Hospital Programme Dashboard',
		single_column: true,
		hide_sidebar: true
	});

	// Inject styles
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
`;
		document.head.appendChild(style);
	}

	// Remove Frappe's built-in page header and all surrounding whitespace
	if (page.head) $(page.head).hide();
	$(page.body).css({padding: '0', margin: '0'});
	$(page.body).parent().css({padding: '0', margin: '0'});
	$(wrapper).css({padding: '0', margin: '0'});
	// Stretch the body to fill remaining height so no gray gap shows below
	$(page.body).css({'min-height': 'calc(100vh - 60px)'});

	$(page.body).html(`
<div id="nwp-dash">
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Epilogue:wght@300;400;500;600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js" integrity="sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw" crossorigin="anonymous"><\/script>

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

	// ── Data & logic ──────────────────────────────────────────────────────
	var NWP_C=[], NWP_B=[], NWP_D=[], NWP_ALL_HOSPS=[];
	var FBASE = window.location.origin;

	function nwpFdb(dt,fields,filters,limit){
		return new Promise(function(resolve){
			var csrf=(frappe.csrf_token&&frappe.csrf_token!=='No')?frappe.csrf_token:'';
			fetch('/api/resource/'+encodeURIComponent(dt)+'?fields='+encodeURIComponent(JSON.stringify(fields))+'&filters='+encodeURIComponent(JSON.stringify(filters||[]))+'&limit_page_length='+(limit||2000)+'&order_by=creation+desc',{
				headers:{'X-Frappe-CSRF-Token':csrf,'Accept':'application/json'}
			})
			.then(function(r){return r.json();})
			.then(function(d){resolve((d&&d.data)?d.data:(d&&d.message)?d.message:[]);})
			.catch(function(e){console.warn('[NWP]['+dt+'] skipped:',e);resolve([]);});
		});
	}

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
			nwpFdb('Patient Claim Form',cf2,cf,2000),
			nwpFdb('Network Hospital Budget',['name','organization_name','hospital_name','date_of_approval','financial_year','start_date','end_date','grant_id','total_budget'],bf,500),
			nwpFdb('Budget Disbursement',['name','date','organization','hospital_name','disbursed_amount'],df,500),
		]);
		NWP_C=res[0];NWP_B=res[1];NWP_D=res[2];
		nwpRender();
	}

	function nwpRender(){
		var n=function(v){return Number(v)||0;};
		var CA=NWP_C.filter(function(r){return r.docstatus!==2;});
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

	// Drill into claims for a single donor within "Other Donor Contribution"
	window.nwpDrillDonor = function(donorName){
		var CA=NWP_C.filter(function(r){return r.docstatus!==2;});
		var rows=CA.filter(function(r){
			return r.does_it_require_apf_contribution==='No'&&((r.other_donor_name||'').trim()||'Other')===donorName;
		});
		var id='d'+Date.now()+Math.random().toString(36).slice(2);
		sessionStorage.setItem(id,JSON.stringify({key:'other-donor',rows:rows,title:'Other Donor Contribution — '+donorName,sub:'NWP = No claims, Donor: '+donorName,src:'C'}));
		window.open(FBASE+'/network-hospital#drill='+id,'_blank');
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

	function nwpFmt(v){return Math.round(Number(v)||0).toLocaleString('en-IN');}

	var NWP_DRILLS={
		'all':         {title:'Total Patients Supported',        sub:'All approved patient claim records',src:'C',f:null},
		'nwh':         {title:'Patients Supported under NWP',    sub:'NWP required = Yes',               src:'C',f:function(r){return r.does_it_require_apf_contribution==='Yes';}},
		'apf-sub':     {title:'NWP Contribution',                sub:'Claims with NWP contribution',     src:'C',f:function(r){return (Number(r.apf_contribution)||0)>0;}},
		'pat-contrib': {title:'Patient Contribution',            sub:'All approved claims',              src:'C',f:null},
		'hosp-default':{title:'Default Hospital Contribution',   sub:'NWP = Yes claims',                 src:'C',f:function(r){return r.does_it_require_apf_contribution==='Yes';}},
		'other-donor': {title:'Other Donor Contribution',        sub:'NWP = No claims',                  src:'C',f:function(r){return r.does_it_require_apf_contribution==='No';}},
		'hosp-add':    {title:'Additional Hospital Contribution',sub:'All approved claims',              src:'C',f:null},
		'g-approved':  {title:'Grant Approved',                  sub:'Network Hospital Budget records',  src:'B',f:null},
		'g-disbursed': {title:'Grant Disbursed',                 sub:'Budget Disbursement records',      src:'D',f:null},
		'g-utilized':  {title:'Grant Utilized',                  sub:'Claims with NWP contribution',     src:'C',f:function(r){return (Number(r.apf_contribution)||0)>0;}},
		'g-balance':   {title:'Balance Amount',                  sub:'Grant Approved − Grant Utilized',  src:'B',f:null},
	};

	window.nwpDrill = function(key){
		var cfg=NWP_DRILLS[key];if(!cfg)return;
		var CA=NWP_C.filter(function(r){return r.docstatus!==2;});
		var rows=cfg.src==='C'?(cfg.f?CA.filter(cfg.f):CA.slice()):cfg.src==='B'?NWP_B.slice():NWP_D.slice();
		// Patient claim data (diagnosis, financials, justification) — kept out
		// of the URL/browser history; network-hospital.html reads it back by
		// this short id, same convention used there for its own drill-downs.
		var id='d'+Date.now()+Math.random().toString(36).slice(2);
		sessionStorage.setItem(id,JSON.stringify({key:key,rows:rows}));
		window.open(FBASE+'/network-hospital#drill='+id,'_blank');
	};

	// ── Init ──────────────────────────────────────────────────────────────
	(async function(){
		var hosps=await nwpFdb('Hospital With Organization',['name','organization'],[],500).catch(function(){return[];});
		NWP_ALL_HOSPS=hosps||[];
		var depts=await nwpFdb('Department',['name'],[],200).catch(function(){return[];});
		var fys=await nwpFdb('Financial Year',['name'],[],50).catch(function(){return[];});
		var donorRows=await nwpFdb('Patient Claim Form',['other_donor_name'],[['other_donor_name','!=','']],2000).catch(function(){return[];});
		nwpPop('nwp-f-hosp',NWP_ALL_HOSPS);
		nwpPop('nwp-f-dept',depts);
		nwpPop('nwp-f-fy',fys);
		nwpPopulateDonorCategories(donorRows);
		nwpPopulateAllDivisions();
		await nwpLoadAll();
	})();
};
