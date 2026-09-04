 import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const cfg = window.CLC_CONFIG || {};
const settings = JSON.parse(localStorage.getItem('clcCloudSettings') || 'null') || { defaultLateFee: 35, paymentLink: '', reminderHours: 24 };
let supabase = null;
let currentUser = null;
let currentProfile = null;
let data = { vehicles: [], bookings: [], customers: [], rentals: [], payments: [], maintenance: [], agreements: [], inspections: [], documents: [], employeeProfiles: [] };

const roleAccess = {
  owner: ['dashboard','bookings','fleet','rentals','agreements','customers','inspections','payments','reminders','maintenance','reports','employees','settings'],
  manager: ['dashboard','bookings','fleet','rentals','agreements','customers','inspections','payments','reminders','maintenance','reports','settings'],
  rental_agent: ['dashboard','bookings','fleet','rentals','agreements','customers','inspections','payments','reminders','maintenance','settings'],
  maintenance: ['dashboard','fleet','rentals','inspections','maintenance','settings']
};

function esc(s){return String(s ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function badge(s){return `<span class="badge ${String(s).toLowerCase().replace(/\s+/g,'-')}">${esc(s)}</span>`;}
function dateOnly(v){return v ? new Date(v).toLocaleDateString() : '—';}
function money(v){return `$${Number(v || 0).toFixed(2)}`;}
function uiVehicleStatus(s){return ({available:'Available',reserved:'Reserved',rented:'Rented',maintenance:'Service',sold:'Sold'})[s] || s || 'Available';}
function dbVehicleStatus(s){return ({Available:'available',Reserved:'reserved',Rented:'rented',Service:'maintenance',Sold:'sold'})[s] || String(s).toLowerCase();}
function uiRentalStatus(s){return ({reserved:'Upcoming',active:'Active',overdue:'Overdue',completed:'Completed',cancelled:'Cancelled'})[s] || s || 'Upcoming';}
function dbRentalStatus(s){return ({Upcoming:'reserved',Active:'active',Overdue:'overdue',Completed:'completed',Cancelled:'cancelled'})[s] || String(s).toLowerCase();}
function fullName(c){return [c?.first_name,c?.last_name].filter(Boolean).join(' ') || 'Unknown customer';}
function vehicleName(v){return v ? `${v.year || ''} ${v.make || ''} ${v.model || ''}`.replace(/\s+/g,' ').trim() : 'Unknown vehicle';}
function initials(name){return String(name||'CL').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();}
function maskLicense(v){if(!v) return 'License not entered'; const s=String(v); return `•••• ${s.slice(-4)}`;}
function can(...roles){return roles.includes(currentProfile?.role);}
function showError(err, prefix=''){console.error(err); alert(`${prefix}${err?.message || err || 'Unknown error'}`);}

async function init(){
  if(!cfg.supabaseUrl || !cfg.supabasePublishableKey){
    $('#configError').textContent='Supabase configuration is missing. Confirm the two Vercel Production environment variables and redeploy.';
    $('#loginBtn').disabled=true;
    return;
  }
  supabase = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  bindUi();
  const { data: { session } } = await supabase.auth.getSession();
  if(session) await enterApp(session.user);
  supabase.auth.onAuthStateChange(async (event, session)=>{
    if(event==='SIGNED_OUT'){currentUser=null;currentProfile=null;showLogin();}
    if(event==='SIGNED_IN' && session?.user && !currentUser) await enterApp(session.user);
  });
}

function bindUi(){
  $('#loginForm').addEventListener('submit', async e=>{
    e.preventDefault(); $('#loginError').textContent=''; $('#loginBtn').disabled=true; $('#loginBtn').textContent='Signing in…';
    const {data:authData,error}=await supabase.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value});
    $('#loginBtn').disabled=false; $('#loginBtn').textContent='Sign In';
    if(error){$('#loginError').textContent=error.message;return;}
    await enterApp(authData.user);
  });
  $('#logoutBtn').onclick=()=>supabase.auth.signOut();
  $$('.nav-link').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
  $$('[data-jump]').forEach(b=>b.onclick=()=>switchView(b.dataset.jump));
  $('#menuBtn').onclick=()=>$('#sidebar').classList.toggle('open');
  $('#closeModal').onclick=()=>$('#modal').classList.add('hidden');
  $('#settingsForm').onsubmit=e=>{e.preventDefault();settings.defaultLateFee=Number($('#defaultLateFee').value);settings.paymentLink=$('#paymentLink').value.trim();settings.reminderHours=Number($('#reminderHours').value);localStorage.setItem('clcCloudSettings',JSON.stringify(settings));renderSettings();alert('Settings saved on this browser.');};
  $('#paymentLinkBtn').onclick=()=>{if(!settings.paymentLink){switchView('settings');alert('Add a Stripe or Square hosted payment link first.');return;} window.open(settings.paymentLink,'_blank','noopener');};
  $('#notificationBtn').onclick=async()=>{if(!('Notification' in window))return alert('This browser does not support notifications.');const p=await Notification.requestPermission();if(p==='granted')new Notification('City Life Cars',{body:'Browser return alerts are enabled while this site is open.'});};
  $('#exportBtn').onclick=exportFleet;
  $('#clearSignature').onclick=clearCanvas;
  setupSignaturePad();
  $('#agreementForm').onsubmit=saveAgreement;
  $('#inspectionForm').onsubmit=saveInspection;
  $('#docForm').onsubmit=saveDocuments;
}

async function enterApp(user){
  currentUser=user;
  const {data:profile,error}=await supabase.from('employee_profiles').select('id,full_name,phone,role,active').eq('id',user.id).single();
  if(error || !profile){await supabase.auth.signOut();$('#loginError').textContent='Your login exists, but no employee profile was found. Ask the Owner to add your employee profile.';return;}
  if(!profile.active){await supabase.auth.signOut();$('#loginError').textContent='This employee account is inactive.';return;}
  currentProfile=profile;
  $('#profileName').textContent=profile.full_name || user.email;
  $('#profileAvatar').textContent=initials(profile.full_name);
  $('#roleLabel').textContent=profile.role.replace('_',' ');
  applyRoleUi();
  $('#loginScreen').classList.add('hidden'); $('#app').classList.remove('hidden');
  await loadAll();
}

function showLogin(){
  $('#app').classList.add('hidden'); $('#loginScreen').classList.remove('hidden');
  $('#password').value='';
}

function applyRoleUi(){
  const allowed=roleAccess[currentProfile.role]||[];

  $$('.nav-link').forEach(b=>b.hidden=!allowed.includes(b.dataset.view));

  $$('.action-fleet-add').forEach(x=>x.hidden=!can('owner','manager'));
  $$('.action-rental').forEach(x=>x.hidden=!can('owner','manager','rental_agent'));
  $$('.action-customer').forEach(x=>x.hidden=!can('owner','manager','rental_agent'));
  $$('.action-payment').forEach(x=>x.hidden=!can('owner','manager','rental_agent'));
  $$('.action-inspection').forEach(x=>x.hidden=!can('owner','manager','rental_agent','maintenance'));
  $$('.action-maintenance').forEach(x=>x.hidden=!can('owner','manager','maintenance'));

  $$('.owner-only').forEach(x=>x.hidden=currentProfile?.role!=='owner');
} 


function switchView(id){
  if(!(roleAccess[currentProfile?.role]||[]).includes(id)) return;
  $$('.view').forEach(v=>v.classList.remove('active-view')); $('#'+id).classList.add('active-view');
  $$('.nav-link').forEach(n=>n.classList.toggle('active',n.dataset.view===id));
  $('#pageTitle').textContent=id[0].toUpperCase()+id.slice(1); $('#sidebar').classList.remove('open');
}

async function loadAll(){
  const [
    vehicles,
    bookings,
    customers,
    rentals,
    payments,
    maintenance,
    agreements,
    inspections,
    documents,
    employeeProfiles
  ] = await Promise.all([
    supabase.from('vehicles').select('*').order('created_at',{ascending:false}),

    can('owner','manager','rental_agent')
      ? supabase.from('booking_requests').select('*').order('created_at',{ascending:false})
      : Promise.resolve({data:[],error:null}),

    can('owner','manager','rental_agent')
      ? supabase.from('customers').select('*').order('created_at',{ascending:false})
      : Promise.resolve({data:[],error:null}),

    supabase
      .from('rentals')
      .select('*, customers(id,first_name,last_name), vehicles(id,year,make,model)')
      .order('pickup_at',{ascending:false}),

    can('owner','manager','rental_agent')
      ? supabase.from('payments').select('*, rentals(id,customers(first_name,last_name))').order('paid_at',{ascending:false})
      : Promise.resolve({data:[],error:null}),

    supabase
      .from('maintenance_records')
      .select('*, vehicles(id,year,make,model)')
      .order('service_date',{ascending:false}),

    can('owner','manager','rental_agent')
      ? supabase.from('rental_agreements').select('*, rentals(id,customers(first_name,last_name),vehicles(year,make,model))').order('created_at',{ascending:false})
      : Promise.resolve({data:[],error:null}),

    supabase
      .from('vehicle_inspections')
      .select('*, rentals(id,customers(first_name,last_name),vehicles(year,make,model))')
      .order('created_at',{ascending:false}),

    can('owner','manager','rental_agent')
      ? supabase.from('customer_documents').select('*').order('uploaded_at',{ascending:false})
      : Promise.resolve({data:[],error:null}),

    can('owner')
      ? supabase.from('employee_profiles').select('id,full_name,phone,role,active').order('full_name',{ascending:true})
      : Promise.resolve({data:[],error:null})
  ]);

  const results = [
    vehicles,
    bookings,
    customers,
    rentals,
    payments,
    maintenance,
    agreements,
    inspections,
    documents,
    employeeProfiles
  ];

  const failed = results.find(r => r.error);
  if(failed?.error){
    showError(failed.error,'Could not load cloud data: ');
    return;
  }

  data = {
    vehicles: vehicles.data || [],
    bookings: bookings.data || [],
    customers: customers.data || [],
    rentals: rentals.data || [],
    payments: payments.data || [],
    maintenance: maintenance.data || [],
    agreements: agreements.data || [],
    inspections: inspections.data || [],
    documents: documents.data || [],
    employeeProfiles: employeeProfiles.data || []
  };

  data.bookings.forEach(b => {
    b.vehicles = data.vehicles.find(v => v.id === b.vehicle_id) || null;
  });

  await updateOverdueStatuses();
  renderAll();
}

async function updateOverdueStatuses(){
  const now=Date.now(); const overdue=data.rentals.filter(r=>['reserved','active'].includes(r.status) && new Date(r.due_at).getTime()<now);
  if(!overdue.length)return;
  await Promise.all(overdue.map(r=>supabase.from('rentals').update({status:'overdue'}).eq('id',r.id)));
  overdue.forEach(r=>r.status='overdue');
}

function daysLate(r){if(r.status==='completed')return 0; const diff=Date.now()-new Date(r.due_at).getTime();return Math.max(0,Math.ceil(diff/86400000));}
function lateFee(r){return Number(r.late_fee_total || 0) || daysLate(r)*Number(r.late_fee_per_day || settings.defaultLateFee || 0);}
function rentalCustomer(r){return fullName(r.customers);}
function rentalVehicle(r){return vehicleName(r.vehicles);}

function renderAll(){
  const active=data.rentals.filter(r=>['active','overdue'].includes(r.status)).length;
  const available=data.vehicles.filter(v=>v.status==='available').length;
  const overdue=data.rentals.filter(r=>r.status==='overdue').length;
  const revenue=data.payments.filter(p=>p.status==='paid').reduce((a,p)=>a+Number(p.amount),0);
  $('#statsGrid').innerHTML=[[available,'Vehicles Available','Ready to rent'],[active,'Active Rentals','Currently on the road'],[overdue,'Overdue Returns','Needs attention'],[money(revenue),'Revenue Recorded','Cloud payments']].map(x=>`<div class="stat-card"><small>${x[1]}</small><strong>${x[0]}</strong><div class="trend">${x[2]}</div></div>`).join('');
  $('#dueList').innerHTML=data.rentals.filter(r=>r.status!=='completed'&&r.status!=='cancelled').map(r=>`<div class="due-row"><div><strong>${esc(rentalCustomer(r))}</strong><div class="muted">${esc(rentalVehicle(r))} • Return ${dateOnly(r.due_at)}${daysLate(r)?` • ${daysLate(r)} day(s) late`:''}</div></div>${badge(uiRentalStatus(r.status))}</div>`).join('')||'<p class="muted">No open rentals.</p>';
  $('#fleetStatus').innerHTML=['available','rented','maintenance'].map(s=>`<div class="status-row"><span>${uiVehicleStatus(s)}</span><strong>${data.vehicles.filter(v=>v.status===s).length}</strong></div>`).join('');
  $('#fleetTable').innerHTML=data.vehicles.map(v=>`<tr><td><strong>${esc(vehicleName(v))}</strong></td><td>${esc(v.license_plate||'—')}</td><td>${Number(v.mileage||0).toLocaleString()}</td><td>${money(v.daily_rate)}</td><td>${v.gps_url?`<a href="${esc(v.gps_url)}" target="_blank" rel="noopener">Open GPS</a>`:'—'}</td><td>${badge(v.status||'available')} <button class="outline-btn" onclick="editVehicle('${v.id}')">Edit</button></td></tr>`).join('');
  $('#rentalsTable').innerHTML=data.rentals.map(r=>`<tr class="${r.status==='overdue'?'overdue-row':''}"><td><strong>${esc(rentalCustomer(r))}</strong></td><td>${esc(rentalVehicle(r))}</td><td>${dateOnly(r.pickup_at)}</td><td>${dateOnly(r.due_at)}</td><td>${money(Number(r.balance_due||0)+lateFee(r))}</td><td>${badge(uiRentalStatus(r.status))}</td></tr>`).join('');
  renderBookingRequests(); renderCustomers(); renderPayments(); renderMaintenance(); renderAgreements(); renderInspections(); renderReminders(); renderReports(); renderSettings(); renderEmployees();
}
function renderEmployees(){
  const tbody = $('#employeesTable');
  if(!tbody) return;

  if(!can('owner')){
    tbody.innerHTML = '';
    return;
  }

  const employees = data.employeeProfiles || [];

  tbody.innerHTML = employees.map(p => `
    <tr>
      <td><strong>${esc(p.full_name || 'Employee')}</strong></td>
      <td>${esc(p.id === currentUser?.id ? (currentUser.email || '—') : '—')}</td>
      <td>${esc((p.role || '').replaceAll('_',' '))}</td>
      <td>${badge(p.active ? 'Active' : 'Inactive')}</td>
      <td>${p.id === currentUser?.id ? 'Owner Account' : '—'}</td>
    </tr>
  `).join('');
}
function bookingConfirmation(b){return String(b?.id||'').replaceAll('-','').slice(0,8).toUpperCase() || '—';}
function bookingStatusLabel(s){return ({pending:'Pending',approved:'Approved',declined:'Declined',cancelled:'Cancelled',converted:'Converted'})[s] || s || 'Pending';}
function bookingEstimate(b){
  if(!b?.pickup_date || !b?.return_date) return 0;
  const start=new Date(`${b.pickup_date}T12:00:00`), end=new Date(`${b.return_date}T12:00:00`);
  const days=Math.max(1,Math.round((end-start)/86400000));
  return days*Number(b.estimated_daily_rate||0)+Number(b.estimated_deposit||0);
}
function renderBookingRequests(){
  if(!can('owner','manager','rental_agent')) return;
  const pending=data.bookings.filter(b=>b.status==='pending').length;
  const approved=data.bookings.filter(b=>b.status==='approved').length;
  const declined=data.bookings.filter(b=>b.status==='declined').length;
  const navCount=$('#bookingNavCount'); if(navCount){navCount.textContent=pending?pending:''; navCount.hidden=!pending;}
  $('#bookingStats').innerHTML=[
    [pending,'Pending Review'],[approved,'Approved'],[declined,'Declined'],[data.bookings.length,'Total Requests']
  ].map(x=>`<div class="stat-card"><small>${x[1]}</small><strong>${x[0]}</strong></div>`).join('');

  $('#bookingRequestsTable').innerHTML=data.bookings.map(b=>{
    const contact=[b.phone,b.email].filter(Boolean).map(esc).join('<br>');
    const action=b.status==='pending'
      ? `<div class="booking-actions"><button class="approve-btn" onclick="reviewBooking('${b.id}','approved')">Approve</button><button class="danger-btn" onclick="reviewBooking('${b.id}','declined')">Decline</button></div>`
      : `<button class="outline-btn" onclick="reviewBooking('${b.id}','pending')">Return to Pending</button>`;
    return `<tr>
      <td><strong>${esc(b.first_name)} ${esc(b.last_name)}</strong><div class="muted">#${bookingConfirmation(b)} • ${esc(b.preferred_contact||'text')}</div></td>
      <td>${contact}</td>
      <td><strong>${esc(vehicleName(b.vehicles))}</strong><div class="muted">${dateOnly(b.pickup_date)} → ${dateOnly(b.return_date)}</div></td>
      <td>${money(bookingEstimate(b))}<div class="muted">Rate ${money(b.estimated_daily_rate)}/day${Number(b.estimated_deposit||0)?` • Deposit ${money(b.estimated_deposit)}`:''}</div></td>
      <td>${esc(b.license_state||'—')}<div class="muted booking-note">${esc(b.notes||'No notes')}</div></td>
      <td>${badge(bookingStatusLabel(b.status))}<div class="muted">${b.reviewed_at?`Reviewed ${dateOnly(b.reviewed_at)}`:`Received ${dateOnly(b.created_at)}`}</div></td>
      <td>${action}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" class="muted">No customer booking requests yet.</td></tr>';
}

window.reviewBooking=async(id,status)=>{
  if(!can('owner','manager','rental_agent')) return;
  const booking=data.bookings.find(b=>b.id===id); if(!booking) return;
  const label=bookingStatusLabel(status);
  if(status==='approved' && !confirm(`Approve ${booking.first_name} ${booking.last_name}'s request for ${vehicleName(booking.vehicles)}?`)) return;
  let staffNotes=booking.staff_notes||null;
  if(status==='declined'){
    const reason=prompt('Optional: enter a reason or staff note for this decline.',staffNotes||'');
    if(reason===null) return;
    staffNotes=reason.trim()||null;
  }
  const patch=status==='pending'
    ? {status:'pending',staff_notes:staffNotes,reviewed_by:null,reviewed_at:null}
    : {status,staff_notes:staffNotes,reviewed_by:currentUser.id,reviewed_at:new Date().toISOString()};
  const {error}=await supabase.from('booking_requests').update(patch).eq('id',id);
  if(error){showError(error,'Could not update booking request: ');return;}
  booking.status=status; booking.staff_notes=staffNotes; booking.reviewed_by=patch.reviewed_by; booking.reviewed_at=patch.reviewed_at;
  renderBookingRequests();
  if(status==='approved'){
  try{
    const depositAmount =
      Number(booking.estimated_deposit || booking.vehicles?.deposit_amount || 0);

    if(!depositAmount || depositAmount <= 0){
      alert(`Booking #${bookingConfirmation(booking)} approved, but no deposit amount is set for this vehicle.`);
      return;
    }

    const response = await fetch('/api/create-checkout-session',{
      method:'POST',
      headers:{
        'Content-Type':'application/json'
      },
      body:JSON.stringify({
        bookingRequestId: booking.id,
        customerName: `${booking.first_name || ''} ${booking.last_name || ''}`.trim(),
        customerEmail: booking.email || '',
        vehicleName: vehicleName(booking.vehicles),
        depositAmount
      })
    });

    const result = await response.json();

    if(!response.ok || !result.url){
      throw new Error(result.error || 'Unable to create Stripe payment link');
    }

 window.location.href = result.url;   

    alert(
      `Booking #${bookingConfirmation(booking)} approved. Stripe deposit checkout opened in a new tab.`
    );
  }catch(err){
    console.error(err);
    alert(
      `Booking approved, but the Stripe deposit link could not be created: ${err.message}`
    );
  }
}
  else if(status==='declined') alert(`Booking #${bookingConfirmation(booking)} declined.`);
  else alert(`Booking #${bookingConfirmation(booking)} returned to Pending.`);
};
window.editVehicle = async function(id){
  const vehicle = data.vehicles.find(v => v.id === id);
  if(!vehicle){
    alert('Vehicle not found.');
    return;
  }

  const dailyRate = prompt(
    'Daily rate:',
    String(vehicle.daily_rate ?? '')
  );
  if(dailyRate === null) return;

  const depositAmount = prompt(
    'Deposit amount:',
    String(vehicle.deposit_amount ?? '')
  );
  if(depositAmount === null) return;

  const mileage = prompt(
    'Mileage:',
    String(vehicle.mileage ?? 0)
  );
  if(mileage === null) return;

  const status = prompt(
    'Status: available, reserved, rented, maintenance',
    String(vehicle.status ?? 'available')
  );
  if(status === null) return;

  const gpsUrl = prompt(
    'GPS link:',
    String(vehicle.gps_url ?? '')
  );
  if(gpsUrl === null) return;

  const patch = {
    daily_rate: Number(dailyRate || 0),
    deposit_amount: Number(depositAmount || 0),
    mileage: Number(mileage || 0),
    status: status.trim().toLowerCase(),
    gps_url: gpsUrl.trim() || null
  };

  const { error } = await supabase
    .from('vehicles')
    .update(patch)
    .eq('id', id);

  if(error){
    showError(error, 'Could not update vehicle.');
    return;
  }

  Object.assign(vehicle, patch);
  renderAll();

  alert(`${vehicleName(vehicle)} updated successfully.`);
};
function renderCustomers(){
  if(!can('owner','manager','rental_agent')){$('#customerCards').innerHTML='<p class="muted">Your role does not include customer records.</p>';return;}
  $('#customerCards').innerHTML=data.customers.map(c=>{const docs=data.documents.filter(d=>d.customer_id===c.id);const hasL=docs.some(d=>d.document_type==='drivers_license'),hasI=docs.some(d=>d.document_type==='insurance');return `<article class="customer-card"><h3>${esc(fullName(c))}</h3><p>${esc(c.phone||'')}</p><p>${esc(c.email||'')}</p><p>${esc(maskLicense(c.drivers_license_number))}</p><div class="doc-status"><span class="mini-pill">License: ${hasL?'✓':'Missing'}</span><span class="mini-pill">Insurance: ${hasI?'✓':'Missing'}</span></div><button class="outline-btn" onclick="openDocModal('${c.id}')">Documents</button></article>`;}).join('')||'<p class="muted">No customers yet.</p>';
}

function renderPayments(){
  if(!can('owner','manager','rental_agent'))return;
  const paid=data.payments.filter(p=>p.status==='paid').reduce((a,p)=>a+Number(p.amount),0),pending=data.payments.filter(p=>p.status==='pending').reduce((a,p)=>a+Number(p.amount),0);
  $('#paymentStats').innerHTML=[[money(paid),'Payments Collected'],[money(pending),'Pending Payments'],[data.payments.length,'Transactions'],['Hosted','Card Processing']].map(x=>`<div class="stat-card"><small>${x[1]}</small><strong>${x[0]}</strong></div>`).join('');
  $('#paymentsTable').innerHTML=data.payments.map(p=>`<tr><td>${dateOnly(p.paid_at)}</td><td>${esc(fullName(p.rentals?.customers))}</td><td>${esc(p.payment_type||'rental')}</td><td>${esc(p.payment_method||'')}</td><td>${money(p.amount)}</td><td>${badge(p.status||'pending')}</td></tr>`).join('');
}

function renderMaintenance(){
  $('#maintenanceList').innerHTML=data.maintenance.map(m=>`<article class="maintenance-card"><h3>${esc(vehicleName(m.vehicles))}</h3><p>${esc(m.service_type)}</p><p><strong>${dateOnly(m.service_date)}</strong></p><p>${m.next_service_date?`Next: ${dateOnly(m.next_service_date)}`:''}${m.next_service_mileage?` • ${Number(m.next_service_mileage).toLocaleString()} mi`:''}</p>${badge(m.next_service_date && new Date(m.next_service_date)<new Date()?'Due':'Service')}</article>`).join('')||'<p class="muted">No maintenance records.</p>';
}

function renderReports(){
  const paid=data.payments.filter(p=>p.status==='paid').reduce((a,p)=>a+Number(p.amount),0),active=data.rentals.filter(r=>['active','overdue'].includes(r.status)).length,outstanding=data.rentals.reduce((a,r)=>a+Number(r.balance_due||0)+lateFee(r),0);
  $('#reportStats').innerHTML=[[money(paid),'Recorded Revenue'],[`${data.vehicles.length?Math.round(active/data.vehicles.length*100):0}%`,'Fleet Utilization'],[money(outstanding),'Outstanding + Late Fees'],[data.vehicles.length,'Vehicles']].map(x=>`<div class="stat-card"><small>${x[1]}</small><strong>${x[0]}</strong></div>`).join('');
  const revByVehicle={}; data.payments.filter(p=>p.status==='paid').forEach(p=>{const r=data.rentals.find(x=>x.id===p.rental_id);if(r)revByVehicle[r.vehicle_id]=(revByVehicle[r.vehicle_id]||0)+Number(p.amount);});
  const max=Math.max(1,...Object.values(revByVehicle)); $('#revenueBars').innerHTML=data.vehicles.map(v=>{const rev=revByVehicle[v.id]||0;return `<div class="bar-row"><span>${esc(v.make)} ${esc(v.model)}</span><div class="bar-track"><div class="bar-fill" style="width:${rev/max*100}%"></div></div><strong>${money(rev)}</strong></div>`;}).join('');
}

const modalForms={
  vehicle:{title:'Add Vehicle'}, customer:{title:'Add Customer'}, rental:{title:'Create Rental'}, payment:{title:'Record Payment'}, service:{title:'Add Maintenance'}
};
window.openModal=(type)=>{
  $('#modalTitle').textContent=modalForms[type].title; $('#recordForm').dataset.type=type;
  if(type==='vehicle') $('#recordForm').innerHTML=`<label>Year<input name="year" type="number"></label><label>Make<input name="make" required></label><label>Model<input name="model" required></label><label>VIN<input name="vin" required></label><label>License Plate<input name="license_plate"></label><label>Mileage<input name="mileage" type="number" value="0"></label><label>Daily Rate<input name="daily_rate" type="number" step="0.01" value="0"></label><label>GPS Link<input name="gps_url" type="url"></label><label>Status<select name="status"><option>Available</option><option>Reserved</option><option>Rented</option><option>Service</option><option>Sold</option></select></label><button class="primary-btn" type="submit">Save Vehicle</button>`;
  if(type==='customer') $('#recordForm').innerHTML=`<label>First Name<input name="first_name" required></label><label>Last Name<input name="last_name" required></label><label>Phone<input name="phone" type="tel"></label><label>Email<input name="email" type="email"></label><label>Driver's License Number<input name="drivers_license_number"></label><label>License State<input name="drivers_license_state"></label><label>License Expiration<input name="drivers_license_expiration" type="date"></label><label>Insurance Company<input name="insurance_company"></label><label>Policy Number<input name="insurance_policy_number"></label><label>Insurance Expiration<input name="insurance_expiration" type="date"></label><button class="primary-btn" type="submit">Save Customer</button>`;
  if(type==='rental') $('#recordForm').innerHTML=`<label>Customer<select name="customer_id" required>${data.customers.map(c=>`<option value="${c.id}">${esc(fullName(c))}</option>`).join('')}</select></label><label>Vehicle<select name="vehicle_id" required>${data.vehicles.filter(v=>['available','reserved'].includes(v.status)).map(v=>`<option value="${v.id}">${esc(vehicleName(v))}</option>`).join('')}</select></label><label>Pickup<input name="pickup_at" type="datetime-local" required></label><label>Due Return<input name="due_at" type="datetime-local" required></label><label>Daily Rate<input name="daily_rate" type="number" step="0.01" value="0"></label><label>Security Deposit<input name="security_deposit" type="number" step="0.01" value="0"></label><label>Late Fee / Day<input name="late_fee_per_day" type="number" step="0.01" value="${settings.defaultLateFee}"></label><label>Balance Due<input name="balance_due" type="number" step="0.01" value="0"></label><label>Status<select name="status"><option>Upcoming</option><option>Active</option><option>Overdue</option><option>Completed</option><option>Cancelled</option></select></label><button class="primary-btn" type="submit">Save Rental</button>`;
  if(type==='payment') $('#recordForm').innerHTML=`<label class="full">Rental<select name="rental_id" required>${data.rentals.map(r=>`<option value="${r.id}">${esc(rentalCustomer(r))} — ${esc(rentalVehicle(r))}</option>`).join('')}</select></label><label>Amount<input name="amount" type="number" step="0.01" required></label><label>Type<select name="payment_type"><option value="rental">Rental</option><option value="deposit">Deposit</option><option value="late_fee">Late Fee</option><option value="damage">Damage</option><option value="other">Other</option></select></label><label>Method<select name="payment_method"><option>Cash</option><option>Card - Hosted Checkout</option><option>Cash App</option><option>Zelle</option><option>Apple Pay</option></select></label><label>Status<select name="status"><option value="paid">Paid</option><option value="pending">Pending</option></select></label><button class="primary-btn" type="submit">Record Payment</button>`;
  if(type==='service') $('#recordForm').innerHTML=`<label class="full">Vehicle<select name="vehicle_id" required>${data.vehicles.map(v=>`<option value="${v.id}">${esc(vehicleName(v))}</option>`).join('')}</select></label><label>Service Type<input name="service_type" required></label><label>Service Date<input name="service_date" type="date" required></label><label>Mileage<input name="mileage" type="number"></label><label>Cost<input name="cost" type="number" step="0.01"></label><label>Vendor<input name="vendor"></label><label>Next Service Date<input name="next_service_date" type="date"></label><label>Next Service Mileage<input name="next_service_mileage" type="number"></label><label class="full">Notes<textarea name="notes"></textarea></label><button class="primary-btn" type="submit">Save Service</button>`;
  $('#modal').classList.remove('hidden');
};

$('#recordForm').onsubmit=async e=>{
  e.preventDefault(); const type=e.currentTarget.dataset.type; const obj=Object.fromEntries(new FormData(e.currentTarget)); let q;
  try{
    if(type==='vehicle'){obj.year=obj.year?Number(obj.year):null;obj.mileage=Number(obj.mileage||0);obj.daily_rate=Number(obj.daily_rate||0);obj.status=dbVehicleStatus(obj.status);q=await supabase.from('vehicles').insert(obj);}
    if(type==='customer'){for(const k of ['drivers_license_expiration','insurance_expiration'])if(!obj[k])obj[k]=null;q=await supabase.from('customers').insert(obj);}
    if(type==='rental'){obj.daily_rate=Number(obj.daily_rate||0);obj.security_deposit=Number(obj.security_deposit||0);obj.late_fee_per_day=Number(obj.late_fee_per_day||0);obj.balance_due=Number(obj.balance_due||0);obj.status=dbRentalStatus(obj.status);obj.created_by=currentUser.id;q=await supabase.from('rentals').insert(obj); if(!q.error && ['active','overdue'].includes(obj.status)) await supabase.from('vehicles').update({status:'rented'}).eq('id',obj.vehicle_id);}
    if(type==='payment'){obj.amount=Number(obj.amount);obj.payment_type=obj.payment_type||'rental';obj.payment_processor=obj.payment_method.includes('Hosted')?'hosted_link':null;q=await supabase.from('payments').insert(obj);}
    if(type==='service'){obj.mileage=obj.mileage?Number(obj.mileage):null;obj.cost=Number(obj.cost||0);obj.next_service_mileage=obj.next_service_mileage?Number(obj.next_service_mileage):null;if(!obj.next_service_date)obj.next_service_date=null;q=await supabase.from('maintenance_records').insert(obj);}
    if(q?.error) throw q.error; $('#modal').classList.add('hidden'); e.target.reset(); await loadAll();
  }catch(err){showError(err,'Could not save record: ');}
};

function renderAgreements(){
  if(!can('owner','manager','rental_agent'))return;
  $('#agreementCards').innerHTML=data.agreements.map(a=>`<article class="customer-card"><h3>${esc(fullName(a.rentals?.customers))}</h3><p>${esc(vehicleName(a.rentals?.vehicles))}</p><p>Signed ${dateOnly(a.signed_at)}</p><p>Initials: ${esc(a.renter_initials||'—')}</p><div class="agreement-actions"><button class="outline-btn" onclick="viewSignature('${a.customer_signature_path||''}')">View Signature</button></div></article>`).join('')||'<p class="muted">No signed agreements yet.</p>';
}
window.openAgreementModal=()=>{if(!data.rentals.length)return alert('Create a rental first.');$('#agreementRental').innerHTML=data.rentals.map(r=>`<option value="${r.id}">${esc(rentalCustomer(r))} — ${esc(rentalVehicle(r))}</option>`).join('');$('#agreementTerms').value=`CITY LIFE CARS RENTAL AGREEMENT\n\nThe renter agrees to return the vehicle by the scheduled return date and time, in substantially the same condition, subject to normal wear. The renter is responsible for authorized charges, fuel, tolls, parking/traffic violations, damage not covered by applicable insurance, and late fees described in the rental record. No unauthorized driver may operate the vehicle. The renter agrees to notify City Life Cars promptly of accidents, theft, mechanical problems, or any change affecting the rental.\n\nThis electronic signature confirms the renter reviewed and accepted these terms.`;$('#agreementDate').value=new Date().toISOString().slice(0,10);clearCanvas();$('#agreementModal').classList.remove('hidden');};
window.closeAgreementModal=()=>$('#agreementModal').classList.add('hidden');

let canvas,ctx,drawing=false;
function setupSignaturePad(){canvas=$('#signaturePad');ctx=canvas.getContext('2d');const pos=e=>{const r=canvas.getBoundingClientRect(),p=e.touches?e.touches[0]:e;return{x:(p.clientX-r.left)*(canvas.width/r.width),y:(p.clientY-r.top)*(canvas.height/r.height)}};const start=e=>{drawing=true;const p=pos(e);ctx.beginPath();ctx.moveTo(p.x,p.y);e.preventDefault()};const move=e=>{if(!drawing)return;const p=pos(e);ctx.lineWidth=2.2;ctx.lineCap='round';ctx.strokeStyle='#111827';ctx.lineTo(p.x,p.y);ctx.stroke();e.preventDefault()};['mousedown','touchstart'].forEach(x=>canvas.addEventListener(x,start,{passive:false}));['mousemove','touchmove'].forEach(x=>canvas.addEventListener(x,move,{passive:false}));['mouseup','mouseleave','touchend'].forEach(x=>canvas.addEventListener(x,()=>drawing=false));}
function clearCanvas(){ctx?.clearRect(0,0,canvas.width,canvas.height);}
async function canvasBlob(){return await new Promise(res=>canvas.toBlob(res,'image/png'));}
async function saveAgreement(e){e.preventDefault();try{const rentalId=$('#agreementRental').value;const blob=await canvasBlob();if(!blob)throw new Error('Please add the renter signature.');const path=`${rentalId}/${Date.now()}-signature.png`;const up=await supabase.storage.from('signatures').upload(path,blob,{contentType:'image/png',upsert:false});if(up.error)throw up.error;const insert=await supabase.from('rental_agreements').insert({rental_id:rentalId,agreement_version:'CLC-2026-1',terms:$('#agreementTerms').value,renter_initials:$('#agreementInitials').value,signed_at:new Date($('#agreementDate').value+'T12:00:00').toISOString(),customer_signature_path:path});if(insert.error)throw insert.error;closeAgreementModal();e.target.reset();await loadAll();}catch(err){showError(err,'Could not save agreement: ');}}
window.viewSignature=async path=>{if(!path)return alert('No signature file.');const {data:signed,error}=await supabase.storage.from('signatures').createSignedUrl(path,120);if(error)return showError(error);window.open(signed.signedUrl,'_blank','noopener');};

window.openDocModal=id=>{$('#docCustomerId').value=id;$('#docModal').classList.remove('hidden');}; window.closeDocModal=()=>$('#docModal').classList.add('hidden');
function safeExt(file){const fromName=(file.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'');return fromName||'bin';}
async function uploadCustomerDoc(customerId,type,file){if(!file)return;const path=`${customerId}/${type}-${Date.now()}.${safeExt(file)}`;const up=await supabase.storage.from('customer-documents').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});if(up.error)throw up.error;const rec=await supabase.from('customer_documents').insert({customer_id:customerId,document_type:type,storage_path:path});if(rec.error)throw rec.error;}
async function saveDocuments(e){e.preventDefault();try{const id=$('#docCustomerId').value,lf=$('#licenseFile').files[0],ins=$('#insuranceFile').files[0];if(!lf&&!ins)throw new Error('Choose at least one document.');if(lf)await uploadCustomerDoc(id,'drivers_license',lf);if(ins)await uploadCustomerDoc(id,'insurance',ins);e.target.reset();closeDocModal();await loadAll();}catch(err){showError(err,'Upload failed: ');}}

window.openInspectionModal=()=>{if(!data.rentals.length)return alert('Create a rental first.');$('#inspectionRental').innerHTML=data.rentals.map(r=>`<option value="${r.id}">${esc(rentalCustomer(r))} — ${esc(rentalVehicle(r))}</option>`).join('');$('#inspectionModal').classList.remove('hidden');};window.closeInspectionModal=()=>$('#inspectionModal').classList.add('hidden');
async function saveInspection(e){e.preventDefault();try{const rentalId=$('#inspectionRental').value,paths=[];for(const [i,file] of [...$('#inspectionPhotos').files].slice(0,8).entries()){const path=`${rentalId}/${Date.now()}-${i}.${safeExt(file)}`;const up=await supabase.storage.from('inspection-photos').upload(path,file,{contentType:file.type||'image/jpeg',upsert:false});if(up.error)throw up.error;paths.push(path);}const q=await supabase.from('vehicle_inspections').insert({rental_id:rentalId,inspection_type:$('#inspectionType').value,mileage:Number($('#inspectionMileage').value),fuel_level:$('#inspectionFuel').value,damage_notes:$('#inspectionNotes').value,photo_paths:paths,inspected_by:currentUser.id});if(q.error)throw q.error;e.target.reset();closeInspectionModal();await loadAll();}catch(err){showError(err,'Could not save inspection: ');}}
function renderInspections(){$('#inspectionCards').innerHTML=data.inspections.map(i=>`<article class="maintenance-card"><h3>${esc(vehicleName(i.rentals?.vehicles))}</h3><p>${esc(i.inspection_type)} • ${Number(i.mileage||0).toLocaleString()} miles • Fuel: ${esc(i.fuel_level||'—')}</p><p>${esc(i.damage_notes||'No damage notes')}</p>${i.photo_paths?.length?`<button class="outline-btn" onclick="openInspectionPhoto('${i.photo_paths[0]}')">View Photo (${i.photo_paths.length})</button>`:''}</article>`).join('')||'<p class="muted">No inspections recorded.</p>';}
window.openInspectionPhoto=async path=>{const {data:signed,error}=await supabase.storage.from('inspection-photos').createSignedUrl(path,120);if(error)return showError(error);window.open(signed.signedUrl,'_blank','noopener');};

function reminderInfo(r){const due=new Date(r.due_at),hrs=Math.round((due-new Date())/3600000);if(['completed','cancelled'].includes(r.status))return null;if(hrs<0)return{label:'OVERDUE',text:`Return was due about ${Math.abs(hrs)} hour(s) ago.`};if(hrs<=Number(settings.reminderHours||24))return{label:'DUE SOON',text:`Return due in about ${hrs} hour(s).`};return{label:'SCHEDULED',text:`Reminder window begins in about ${Math.max(0,hrs-Number(settings.reminderHours||24))} hour(s).`};}
function renderReminders(){const list=data.rentals.map(r=>[r,reminderInfo(r)]).filter(x=>x[1]);$('#reminderList').innerHTML=list.map(([r,i])=>`<article class="customer-card reminder-card"><strong>${esc(rentalCustomer(r))} — ${esc(rentalVehicle(r))}</strong><p>${dateOnly(r.due_at)} • ${esc(i.text)}</p>${badge(i.label==='OVERDUE'?'Overdue':'Service')}</article>`).join('')||'<p class="muted">No reminders needed.</p>';}
function renderSettings(){$('#defaultLateFee').value=settings.defaultLateFee??35;$('#paymentLink').value=settings.paymentLink||'';$('#reminderHours').value=settings.reminderHours??24;$('#roleLabel').textContent=currentProfile?.role?.replace('_',' ')||'—';}
function exportFleet(){const rows=[['Year','Make','Model','VIN','Plate','Mileage','Daily Rate','Status','GPS'],...data.vehicles.map(v=>[v.year,v.make,v.model,v.vin,v.license_plate,v.mileage,v.daily_rate,v.status,v.gps_url||''])];const csv=rows.map(r=>r.map(x=>`"${String(x??'').replaceAll('"','""')}"`).join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`city-life-rental-fleet-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}

init();
window.openAddEmployeeModal = async () => {
  if (!currentProfile || currentProfile.role !== 'owner') {
    return alert('Owner access required.');
  }

  const fullName = prompt('Employee full name:');
  if (!fullName) return;

  const email = prompt('Employee email address:');
  if (!email) return;

  const password = prompt('Temporary password (at least 8 characters):');
  if (!password) return;

  if (password.length < 8) {
    return alert('Temporary password must be at least 8 characters.');
  }

  const role = prompt(
    'Employee role: manager, rental_agent, or maintenance',
    'rental_agent'
  );

  if (!['manager', 'rental_agent', 'maintenance'].includes(role)) {
    return alert('Please enter manager, rental_agent, or maintenance.');
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    if (!token) {
      return alert('Your login session has expired. Please sign in again.');
    }

    const response = await fetch('/api/create-employee', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        fullName,
        email,
        password,
        role
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Unable to create employee.');
    }

    alert(`${fullName} was added successfully.`);
    await loadAll();

  } catch (error) {
    console.error(error);
    alert(error.message || 'Unable to create employee.');
  }
};
init();
