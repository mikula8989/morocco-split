import {PEOPLE, normalizeExpense, balances, settlements, money} from './core.js';
import {all, getSettings, saveSettings, enqueue, applySync, getFxRate, saveFxRate} from './db.js';
import {DEFAULT_ENDPOINT} from './config.js';
import {latestRate, validRate} from './fx.js';
const $ = selector => document.querySelector(selector);
let settings = {}, syncing = false, failureCount = 0, retryTimer, installPrompt, readyOffline = false;
let entries = [], pending = [];
let editing = null, saving = false, savedTimer, highlightedId;
let fxRate = null, fxPromise, fxError = '', fxRefreshFailed = false, nextFxAttempt = 0;
function node(tag, text, className) { const element=document.createElement(tag); if(text!==undefined) element.textContent=text; if(className) element.className=className; return element; }
function message(selector, text, error=false) { $(selector).textContent=text; $(selector).classList.toggle('error', error); }
const configured = () => Boolean(settings.endpoint && settings.token && settings.person);
function showSettings() {
  if(editing) {message('#form-message','Pirmiausia išsaugok arba atšauk taisymą.',true);return;}
  $('#identity').value=settings.person || 'Mikas'; $('#endpoint').value=settings.endpoint || DEFAULT_ENDPOINT;
  $('#token').value=settings.token || ''; $('#settings-dialog').showModal();
}
function formData() {
  const rate=editing?.currency==='MAD' ? editing.rateMicros : fxRate?.rateMicros;
  return {amount:$('#amount').value,description:$('#description').value,currency:$('#currency').value,rate:rate ? (rate/1000000).toFixed(6) : '',payer:$('#payer').value,participants:[...document.querySelectorAll('[name=participant]:checked')].map(n=>n.value)};
}
function saveLabel(text, icon) { $('#save').replaceChildren(document.createTextNode(text+' '),node('span',icon)); }
function finishEditing() {
  editing=null;$('#edit-note').hidden=true;$('#amount').value='';$('#description').value='';
  saveLabel('Išsaugoti išlaidą','＋');preview();
}
function startEditing(expense) {
  if(syncing || saving) {message('#form-message','Palauk, kol baigsis išsaugojimas ir sinchronizavimas.',true);return;}
  clearTimeout(savedTimer);$('#save').classList.remove('saved');
  editing=expense;$('#edit-note').hidden=false;
  $('#amount').value=(expense.amountMinor/100).toFixed(2);$('#description').value=expense.description;
  $('#currency').value=expense.currency;$('#payer').value=expense.payer;
  document.querySelectorAll('[name=participant]').forEach(n=>n.checked=expense.participants.includes(n.value));
  saveLabel('Išsaugoti pataisymą','✓');message('#form-message','');preview();
  $('.entry-card').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
  $('#amount').focus({preventScroll:true});
}
async function refreshRate() {
  if(fxPromise) return fxPromise;
  if(Date.now() < nextFxAttempt) return fxRate;
  fxPromise=(async()=>{
    try {
      const result=await latestRate(fxRate,{online:navigator.onLine});
      fxRate=result.rate;fxRefreshFailed=result.refreshFailed;fxError='';
      if(result.refreshed) await saveFxRate(fxRate);
      nextFxAttempt=Date.now()+(result.refreshFailed ? 60000 : 0);
    } catch(error) {fxError=error.message;fxRefreshFailed=true;nextFxAttempt=Date.now()+60000;}
    return fxRate;
  })();
  preview();
  try {return await fxPromise;} finally {fxPromise=undefined;preview();}
}
function preview() {
  $('#rate-info').hidden=$('#currency').value!=='MAD';
  if(editing?.currency==='MAD') {
    $('#rate-info').textContent=`Išlaidos kursas: 1 EUR = ${editing.rateMicros/1000000} MAD · taisant išlaikomas pradinis kursas`;
  } else if(fxRate) {
    const date=new Date(fxRate.updatedAt).toLocaleDateString('lt-LT');
    const cached=!navigator.onLine || fxRefreshFailed || Date.now()>=fxRate.nextUpdateAt;
    $('#rate-info').textContent=`${cached?'Paskutinis gautas kursas':'Automatinis kursas'}: 1 EUR = ${new Intl.NumberFormat('lt-LT',{maximumFractionDigits:6}).format(fxRate.rateMicros/1000000)} MAD · ${date}${!navigator.onLine?' · be ryšio':''}`;
  } else {$('#rate-info').textContent=fxPromise?'Gaunamas MAD kursas…':fxError||'Gaunamas MAD kursas…';}
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
    if(expense.id===highlightedId) row.classList.add('expense-saved');
    left.append(node('h3',expense.description),node('small',`${expense.payer} sumokėjo · ${expense.participants.join(', ')}`),node('small',new Date(expense.createdAt).toLocaleString('lt-LT',{dateStyle:'short',timeStyle:'short'})));
    right.append(node('b',new Intl.NumberFormat('lt-LT',{style:'currency',currency:expense.currency}).format(expense.amountMinor/100)));
    if(expense.currency==='MAD') right.append(node('small',`${money(expense.eurCents)} · 1 € = ${expense.rateMicros/1000000} MAD`));
    right.append(node('small',queued.has(expense.id)?'Laukia siuntimo':'Sinchronizuota',queued.has(expense.id)?'pending':''));
    if(expense.recordedBy===settings.person) {
      const edit=node('button','Taisyti','text-button edit-expense');edit.type='button';
      edit.setAttribute('aria-label',`Taisyti išlaidą: ${expense.description}`);
      edit.addEventListener('click',()=>startEditing(expense));right.append(edit);
    }
    row.append(left,right); $('#history').append(row);
  }
}
function scheduleRetry() {
  clearTimeout(retryTimer);
  if(configured() && navigator.onLine) retryTimer=setTimeout(()=>sync(),Math.min(300000,15000*2**Math.min(failureCount,5)));
}
async function sync() {
  if(syncing || editing || saving || !navigator.onLine || !configured()) return;
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
      if(response?.ok!==true) {
        if(sent.some(e=>e.baseRecord) && response?.error?.startsWith('ID konfliktas:')) throw new Error('Pataisymas liko telefone. Reikia atnaujinti Google sinchronizavimo paslaugą.');
        throw new Error(response?.error||'Sinchronizavimas nepatvirtintas.');
      }
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
  event.preventDefault();if(saving)return;saving=true;clearTimeout(savedTimer);
  $('#save').disabled=true;$('#save').classList.remove('saved');$('#save').setAttribute('aria-busy','true');saveLabel('Saugoma…','…');
  let success=false;
  try {
    if(!settings.person){showSettings();message('#settings-message','Pirmiausia pasirink, kas tu esi. Ryšio nuorodą ir raktą gali pridėti vėliau.');return;}
    if($('#currency').value==='MAD' && editing?.currency!=='MAD') {
      await refreshRate();
      if(!fxRate) throw new Error(fxError||'MAD kursas dar negautas. Pabandyk su internetu dar kartą.');
    }
    const expense={...normalizeExpense(formData()),id:editing?.id||crypto.randomUUID(),createdAt:editing?.createdAt||new Date().toISOString(),recordedBy:settings.person};
    if(editing) expense.baseRecord=editing.baseRecord||editing;
    await enqueue(expense,editing);
    highlightedId=expense.id;finishEditing();await render();success=true;
    saveLabel('Išsaugota','✓');$('#save').classList.add('saved');
    message('#form-message','Išsaugota telefone ✓ '+(navigator.onLine&&configured()?'Siunčiame į bendrą lentelę.':'Išsiųsime, kai bus ryšys ir prijungtas tavo raktas.'));
  } catch(error) {message('#form-message',error.message,true);}
  finally {
    $('#save').removeAttribute('aria-busy');
    if(success) savedTimer=setTimeout(()=>{saving=false;highlightedId=null;$('#save').disabled=false;$('#save').classList.remove('saved');saveLabel('Išsaugoti išlaidą','＋');void sync();},1400);
    else {saving=false;$('#save').disabled=false;saveLabel(editing?'Išsaugoti pataisymą':'Išsaugoti išlaidą',editing?'✓':'＋');}
  }
});
$('#edit-cancel').addEventListener('click',()=>{if(saving)return;finishEditing();message('#form-message','Taisymas atšauktas.');void sync();});
$('#expense-form').addEventListener('input',preview);
$('#currency').addEventListener('change',()=>{preview();if($('#currency').value==='MAD')void refreshRate();});
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
$('#sync').addEventListener('click',()=>{nextFxAttempt=0;void refreshRate();return configured()?sync():showSettings();});
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
window.addEventListener('online',()=>{nextFxAttempt=0;void refreshRate();void sync();});window.addEventListener('offline',()=>{preview();void render();});
window.addEventListener('focus',()=>{void refreshRate();void sync();});document.addEventListener('visibilitychange',()=>{if(!document.hidden){void refreshRate();void sync();}});
setInterval(()=>{if(!document.hidden){void refreshRate();void sync();}},60000);
async function boot(){
  try {
    settings=await getSettings()||{}; if(!settings.endpoint&&DEFAULT_ENDPOINT)settings.endpoint=DEFAULT_ENDPOINT;
    if(settings.person)$('#payer').value=settings.person;
    const cachedRate=await getFxRate();fxRate=validRate(cachedRate)?cachedRate:null;
    await render();preview();void sync();
    void refreshRate();
    if(navigator.storage?.persist) void navigator.storage.persist();
    if('serviceWorker' in navigator){
      await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;readyOffline=true;
      $('#offline-ready').textContent='Programėlės failai paruošti darbui be ryšio.';
    }
  } catch(error){message('#form-message',`Nepavyko paruošti telefono atminties: ${error.message}. Įrašo neišsaugojome.`,true);}
}
void boot();
