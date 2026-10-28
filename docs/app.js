import {PEOPLE, normalizeExpense, balances, settlements, money} from './core.js';
import {all, getSettings, saveSettings, enqueue, applySync} from './db.js';
import {DEFAULT_ENDPOINT} from './config.js';
const $ = selector => document.querySelector(selector);
let settings = {}, syncing = false, failureCount = 0, retryTimer, installPrompt, readyOffline = false;
let entries = [], pending = [];
function node(tag, text, className) { const element=document.createElement(tag); if(text!==undefined) element.textContent=text; if(className) element.className=className; return element; }
function message(selector, text, error=false) { $(selector).textContent=text; $(selector).classList.toggle('error', error); }
const configured = () => Boolean(settings.endpoint && settings.token && settings.person);
function showSettings() {
  $('#identity').value=settings.person || 'Mikas'; $('#endpoint').value=settings.endpoint || DEFAULT_ENDPOINT;
  $('#token').value=settings.token || ''; $('#settings-dialog').showModal();
}
function formData() { return {amount:$('#amount').value,description:$('#description').value,currency:$('#currency').value,rate:$('#rate').value,payer:$('#payer').value,participants:[...document.querySelectorAll('[name=participant]:checked')].map(n=>n.value)}; }
function preview() {
  $('#rate-wrap').hidden = $('#currency').value !== 'MAD';
  $('#rate').required = $('#currency').value === 'MAD';
  try { const data = normalizeExpense({...formData(),description:'preview'}); $('#split-preview').textContent=`Iš viso ${money(data.eurCents)} · ${data.participants.length} dalyviams. Centų likutis paskirstomas vardų eilės tvarka.`; }
  catch { $('#split-preview').textContent='Dalinama lygiomis dalimis. Pažymėk, kam tenka ši išlaida.'; }
}
async function render() {
  [entries,pending] = await Promise.all([all('expenses'),all('outbox')]);
  entries.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
  const queued = new Set(pending.map(e=>e.id));
  $('#setup-note').hidden=configured();
  const status = !navigator.onLine ? `Be ryšio · laukia ${pending.length}` : pending.length ? `Telefone saugu · laukia ${pending.length}` : configured() ? 'Įrašai telefone · ryšys yra' : 'Saugoma šiame telefone';
  $('#sync-status').textContent=status;
  const net=balances(entries); $('#balances').replaceChildren();
  for (const person of PEOPLE) {
    const row=node('div',undefined,'balance-row'), name=node('div',undefined,'balance-name');
    name.append(node('span',person[0],'avatar'),node('span',person));
    row.append(name,node('strong',(net[person]>0?'+':'')+money(net[person]),net[person]<0?'negative':'positive')); $('#balances').append(row);
  }
  $('#settlements').replaceChildren();
  const payments=settlements(net);
  payments.forEach(p=>$('#settlements').append(node('p',`${p.from} → ${p.to}: ${money(p.cents)}`)));
  if (!payments.length) $('#settlements').append(node('p',entries.length?'Visi atsiskaitę.':'Pirma įrašyk išlaidą.'));
  $('#balance-note').textContent=`+ turi atgauti · − turi grąžinti${pending.length ? ' · Yra neišsiųstų įrašų.' : ''} Bendras vaizdas atsinaujina sinchronizavus visų telefonus.`;
  $('#total').textContent=money(entries.reduce((total,e)=>total+e.eurCents,0)); $('#count').textContent=`${entries.length} įrašų`;
  $('#history-empty').hidden=entries.length>0; $('#history').replaceChildren();
  for (const expense of entries) {
    const row=node('article',undefined,'expense'), left=node('div'), right=node('div',undefined,'expense-amount');
    left.append(node('h3',expense.description),node('small',`${expense.payer} sumokėjo · ${expense.participants.join(', ')}`),node('small',new Date(expense.createdAt).toLocaleString('lt-LT',{dateStyle:'short',timeStyle:'short'})));
    right.append(node('b',new Intl.NumberFormat('lt-LT',{style:'currency',currency:expense.currency}).format(expense.amountMinor/100)));
    if(expense.currency==='MAD') right.append(node('small',`${money(expense.eurCents)} · 1 € = ${expense.rateMicros/1000000} MAD`));
    right.append(node('small',queued.has(expense.id)?'Laukia siuntimo':'Sinchronizuota',queued.has(expense.id)?'pending':'')); row.append(left,right); $('#history').append(row);
  }
}
function scheduleRetry() {
  clearTimeout(retryTimer);
  if(configured() && navigator.onLine) retryTimer=setTimeout(()=>sync(),Math.min(300000,15000*2**Math.min(failureCount,5)));
}
async function sync() {
  if(syncing || !navigator.onLine || !configured()) return;
  syncing=true; $('#sync').disabled=true; clearTimeout(retryTimer);
  try {
    do {
      const outbox=await all('outbox');
      const sent=outbox.filter(e=>e.recordedBy===settings.person).slice(0,25);
      const credentials={...settings};
      $('#sync-status').textContent='Sinchronizuojama…';
      const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),30000);
      let response;
      try {
        const result=await fetch(credentials.endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({version:1,person:credentials.person,token:credentials.token,records:sent}),credentials:'omit',redirect:'follow',cache:'no-store',signal:controller.signal});
        if(!result.ok) throw new Error('Serveris nepasiekiamas.');
        response=await result.json();
      } finally {clearTimeout(timeout);}
      if(response?.ok!==true) throw new Error(response?.error||'Sinchronizavimas nepatvirtintas.');
      if(response.person!==credentials.person) throw new Error('Raktas neatitinka pasirinkto vardo.');
      await applySync(response,sent);
      if(sent.some(e=>!response.acked.includes(e.id))) throw new Error('Dalis įrašų liko eilėje. Bandysime vėl.');
      settings.lastSync=new Date().toISOString(); await saveSettings(settings); failureCount=0;
      if(sent.length<25) break;
    } while(navigator.onLine);
    await render();
    $('#sync-status').textContent=pending.length?`Laukia ${pending.length} · patikrink pasirinktą vardą`:`Sinchronizuota ${new Date(settings.lastSync).toLocaleTimeString('lt-LT',{hour:'2-digit',minute:'2-digit'})}`;
  } catch(error) {
    failureCount++; await render();
    $('#sync-status').textContent=`Įrašai saugūs telefone · ${error.name==='AbortError'?'ryšys per lėtas':error.message}`;
    scheduleRetry();
  } finally {syncing=false; $('#sync').disabled=false;}
}
$('#expense-form').addEventListener('submit',async event=>{
  event.preventDefault(); $('#save').disabled=true;
  try {
    if(!settings.person){showSettings();message('#settings-message','Pirmiausia pasirink, kas tu esi. Ryšio nuorodą ir raktą gali pridėti vėliau.');return;}
    const expense={...normalizeExpense(formData()),id:crypto.randomUUID(),createdAt:new Date().toISOString(),recordedBy:settings.person};
    if($('#rate').value) {settings.rate=$('#rate').value;await saveSettings(settings);}
    await enqueue(expense);
    $('#amount').value='';$('#description').value='';preview();await render();
    message('#form-message','Išsaugota telefone. '+(navigator.onLine&&configured()?'Siunčiame į bendrą lentelę.':'Išsiųsime, kai bus ryšys ir prijungtas tavo raktas.')); void sync();
  } catch(error) {message('#form-message',error.message,true);}
  finally {$('#save').disabled=false;}
});
$('#expense-form').addEventListener('input',preview);
$('#settings-open').addEventListener('click',showSettings);$('#connect-open').addEventListener('click',showSettings);
$('#settings-close').addEventListener('click',()=>$('#settings-dialog').close());
$('#settings-form').addEventListener('submit',async event=>{
  event.preventDefault();
  try {
    if(syncing) throw new Error('Palauk, kol baigsis sinchronizavimas.');
    const endpoint=$('#endpoint').value.trim(),token=$('#token').value.trim(),person=$('#identity').value;
    if(endpoint && !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint)) throw new Error('Reikia Apps Script nuorodos, pasibaigiančios /exec.');
    if(token && !/^[a-f0-9]{64}$/.test(token)) throw new Error('Raktas turi būti 64 simbolių, nukopijuotas visas.');
    settings={...settings,endpoint,token,person}; await saveSettings(settings); $('#payer').value=person;
    $('#settings-dialog').close();await render();void sync();
  } catch(error) {message('#settings-message',error.message,true);}
});
$('#sync').addEventListener('click',()=>configured()?sync():showSettings());
$('#export').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),expenses:entries,pendingIds:pending.map(e=>e.id)},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=node('a');link.href=url;link.download=`morocco-split-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
$('#install').addEventListener('click',async()=>{
  if(installPrompt){await installPrompt.prompt();installPrompt=null;}
  else {$('#offline-ready').textContent=readyOffline?'Programėlės failai jau paruošti darbui be ryšio.':'Palaikyk programėlę atidarytą su internetu, kol failai bus paruošti.';$('#install-dialog').showModal();}
});
$('#install-close').addEventListener('click',()=>$('#install-dialog').close());
window.addEventListener('online',()=>sync());window.addEventListener('offline',()=>render());
window.addEventListener('focus',()=>sync());document.addEventListener('visibilitychange',()=>{if(!document.hidden)void sync();});
setInterval(()=>{if(!document.hidden)void sync();},60000);
async function boot(){
  try {
    settings=await getSettings()||{}; if(!settings.endpoint&&DEFAULT_ENDPOINT)settings.endpoint=DEFAULT_ENDPOINT;
    if(settings.person)$('#payer').value=settings.person;$('#rate').value=settings.rate||'';
    await render();preview();void sync();
    if(navigator.storage?.persist) void navigator.storage.persist();
    if('serviceWorker' in navigator){
      await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;readyOffline=true;
      $('#offline-ready').textContent='Programėlės failai paruošti darbui be ryšio.';
    }
  } catch(error){message('#form-message',`Nepavyko paruošti telefono atminties: ${error.message}. Įrašo neišsaugojome.`,true);}
}
void boot();
