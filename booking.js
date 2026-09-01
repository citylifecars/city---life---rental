import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const $ = (s) => document.querySelector(s);
const cfg = window.CLC_CONFIG || {};
let supabase = null;
let fleet = [];
let selectedVehicleId = '';

const esc = (v='') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const money = n => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n||0));
const today = new Date().toISOString().slice(0,10);

function setDateMinimums(){
  ['heroPickup','heroReturn','pickupDate','returnDate'].forEach(id=>{const el=$('#'+id); if(el) el.min=today;});
}

function rentalDays(start,end){
  if(!start || !end) return 0;
  const a=new Date(start+'T12:00:00'), b=new Date(end+'T12:00:00');
  return Math.max(0, Math.ceil((b-a)/86400000));
}

function vehicleName(v){return `${v.year||''} ${v.make||''} ${v.model||''}`.replace(/\s+/g,' ').trim();}

function renderFleet(){
  $('#fleetStatus').textContent = `${fleet.length} vehicle${fleet.length===1?'':'s'} available`;
  $('#fleetGrid').innerHTML = fleet.length ? fleet.map(v=>`
    <article class="vehicle-card">
      <div class="vehicle-image">${v.photo_url?`<img src="${esc(v.photo_url)}" alt="${esc(vehicleName(v))}">`:`<div class="vehicle-placeholder">${esc(v.make||'City Life')}</div>`}</div>
      <div class="vehicle-body">
        <div><h3>${esc(vehicleName(v))}</h3><div class="vehicle-meta"><span class="chip">Available</span>${Number(v.minimum_days||1)>1?`<span class="chip">${Number(v.minimum_days)}-day minimum</span>`:''}</div></div>
        <div class="rate-row"><div><strong>${money(v.daily_rate)}</strong><small>per day</small></div><button class="select-car" data-vehicle="${esc(v.id)}">Select</button></div>
      </div>
    </article>`).join('') : '<div class="empty-state"><h3>No vehicles are showing as available right now.</h3><p>Please check back soon or contact City Life Cars.</p></div>';
  $('#vehicleSelect').innerHTML='<option value="">Choose a vehicle</option>'+fleet.map(v=>`<option value="${esc(v.id)}">${esc(vehicleName(v))} — ${money(v.daily_rate)}/day</option>`).join('');
  document.querySelectorAll('.select-car').forEach(btn=>btn.addEventListener('click',()=>selectVehicle(btn.dataset.vehicle)));
}

function selectVehicle(id){
  selectedVehicleId=id;
  $('#vehicleSelect').value=id;
  updateQuote();
  $('#reserve').scrollIntoView({behavior:'smooth'});
}

function updateQuote(){
  const id=$('#vehicleSelect').value;
  selectedVehicleId=id;
  const v=fleet.find(x=>x.id===id);
  const start=$('#pickupDate').value, end=$('#returnDate').value;
  const days=rentalDays(start,end);
  if(!v || !days){$('#quoteCard').innerHTML='<strong>Your estimate</strong><p>Select a vehicle and valid pickup/return dates to see an estimated total.</p>';return;}
  const minDays=Math.max(1,Number(v.minimum_days||1));
  const billDays=Math.max(days,minDays);
  const rental=Number(v.daily_rate||0)*billDays;
  const deposit=Number(v.deposit_amount||0);
  $('#quoteCard').innerHTML=`<strong>${esc(vehicleName(v))}</strong><div class="quote-total">${money(rental+deposit)}</div><p>${billDays} rental day${billDays===1?'':'s'} × ${money(v.daily_rate)}${deposit?` + ${money(deposit)} estimated deposit`:''}</p><small>Estimate only. Final taxes, fees, deposit, insurance requirements, and approval may change the amount due.</small>`;
}

async function loadFleet(){
  const {data,error}=await supabase.rpc('public_available_vehicles');
  if(error) throw error;
  fleet=data||[];
  renderFleet();
}

async function submitBooking(e){
  e.preventDefault();
  const msg=$('#formMessage');
  msg.className='form-message'; msg.textContent='';
  const form=new FormData(e.target);
  const days=rentalDays(form.get('pickup_date'),form.get('return_date'));
  const v=fleet.find(x=>x.id===form.get('vehicle_id'));
  if(!v){msg.className='form-message error';msg.textContent='Please choose an available vehicle.';return;}
  if(days<1){msg.className='form-message error';msg.textContent='Return date must be after pickup date.';return;}
  const btn=$('#submitBooking'); btn.disabled=true; btn.textContent='Submitting…';
  try{
    const {data,error}=await supabase.rpc('submit_booking_request',{
      p_vehicle_id: form.get('vehicle_id'),
      p_first_name: String(form.get('first_name')||'').trim(),
      p_last_name: String(form.get('last_name')||'').trim(),
      p_email: String(form.get('email')||'').trim(),
      p_phone: String(form.get('phone')||'').trim(),
      p_pickup_date: form.get('pickup_date'),
      p_return_date: form.get('return_date'),
      p_license_state: String(form.get('license_state')||'').trim().toUpperCase(),
      p_preferred_contact: form.get('preferred_contact'),
      p_notes: String(form.get('notes')||'').trim()
    });
    if(error) throw error;
    e.target.reset(); selectedVehicleId=''; updateQuote();
    msg.className='form-message success';
    msg.textContent=`Request received${data?` — confirmation ${String(data).slice(0,8).toUpperCase()}`:''}. City Life Cars will contact you after review.`;
  }catch(err){
    console.error(err); msg.className='form-message error'; msg.textContent='We could not submit your request. Please try again or contact City Life Cars.';
  }finally{btn.disabled=false;btn.textContent='Submit Reservation Request';}
}

function wire(){
  $('#vehicleSelect').addEventListener('change',updateQuote);
  $('#pickupDate').addEventListener('change',updateQuote);
  $('#returnDate').addEventListener('change',updateQuote);
  $('#bookingForm').addEventListener('submit',submitBooking);
  $('#heroFind').addEventListener('click',()=>{
    const p=$('#heroPickup').value,r=$('#heroReturn').value;
    if(p) $('#pickupDate').value=p;if(r) $('#returnDate').value=r;
    updateQuote();$('#fleet').scrollIntoView({behavior:'smooth'});
  });
}

async function init(){
  setDateMinimums(); wire();
  if(!cfg.supabaseUrl || !cfg.supabasePublishableKey){
    $('#fleetStatus').textContent='Booking setup incomplete';
    $('#fleetGrid').innerHTML='<div class="empty-state"><h3>Online booking is being configured.</h3><p>Please check back shortly.</p></div>';
    return;
  }
  supabase=createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  try{await loadFleet();}catch(err){console.error(err);$('#fleetStatus').textContent='Unable to load fleet';$('#fleetGrid').innerHTML='<div class="empty-state"><h3>We could not load available vehicles.</h3><p>Please try again shortly.</p></div>';}
}

init();
