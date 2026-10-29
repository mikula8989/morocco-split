/* Bound to the existing private Google Sheet. No secrets belong in this file. */
var SHEET_ID = '1v9SBMMI3Ur5kP4p-PqcVCJBU6X2sc3vTrCxxtLixqYg';
var TAB = 'Išlaidos';
var PEOPLE = ['Mikas', 'Alfonsas', 'Linas'];
var HEADERS = ['ID','Sukurta','Mokėtojas','Aprašymas','Suma','Valiuta','Kursas MAD/EUR','Suma EUR','Mikas dalinasi','Alfonsas dalinasi','Linas dalinasi','Įrašė','Atnaujinta'];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Morocco Split')
    .addItem('Paruošti ir sukurti dalyvių raktus', 'initialize')
    .addItem('Pakeisti vieno dalyvio raktą', 'rotateParticipantKey').addToUi();
}
function sheet_() {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(TAB);
  if (!sheet) throw new Error('Nerastas lapas Išlaidos.');
  var current = sheet.getRange(1,1,1,13).getValues()[0];
  if (JSON.stringify(current)!==JSON.stringify(HEADERS)) throw new Error('Lentelės antraštės neatitinka. Duomenų nekeitėme.');
  return sheet;
}
function hash_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text,Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
}
function constantEqual_(a,b) {
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  var different=0;for(var i=0;i<a.length;i++)different|=a.charCodeAt(i)^b.charCodeAt(i);return different===0;
}
function createKey_() {return (Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,'').toLowerCase();}
function initialize() {
  var sheet=sheet_(), props=PropertiesService.getScriptProperties(), keys={};
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try {
    if(PEOPLE.some(function(p){return props.getProperty('KEY_HASH_'+p);})) {
      SpreadsheetApp.getUi().alert('Raktai jau sukurti. Jei vieną pametei, pasirink meniu „Pakeisti vieno dalyvio raktą“. Esamų raktų nekeičiame.');return;
    }
    PEOPLE.forEach(function(p){keys[p]=createKey_();props.setProperty('KEY_HASH_'+p,hash_(keys[p]));});
    props.setProperty('SCHEMA_VERSION','1');
    sheet.setFrozenRows(1);
  } finally {lock.releaseLock();}
  showKeys_(keys);
}
function rotateParticipantKey() {
  var ui=SpreadsheetApp.getUi(),answer=ui.prompt('Kurio dalyvio raktą pakeisti?','Mikas, Alfonsas arba Linas. Senasis raktas iškart nustos veikti.',ui.ButtonSet.OK_CANCEL);
  if(answer.getSelectedButton()!==ui.Button.OK)return;
  var person=answer.getResponseText().trim();if(PEOPLE.indexOf(person)<0)throw new Error('Nežinomas vardas.');
  var key=createKey_(), lock=LockService.getScriptLock();lock.waitLock(20000);
  try{PropertiesService.getScriptProperties().setProperty('KEY_HASH_'+person,hash_(key));}finally{lock.releaseLock();}
  var keys={};keys[person]=key;showKeys_(keys);
}
function showKeys_(keys) {
  // Raw keys exist only in this one-time owner dialog, never in logs, the Sheet or GitHub.
  var html='<div style="font:14px system-ui;padding:16px"><h2>Asmeniniai raktai</h2><p>Nukopijuok dabar. Kiekvienam perduok tik jo raktą privačiai. Uždarius šį langą raktų atkurti nebus galima; galima tik pakeisti.</p>';
  Object.keys(keys).forEach(function(person){html+='<h3>'+person+'</h3><textarea readonly style="width:100%;height:65px;font:13px monospace">'+keys[person]+'</textarea>';});
  html+='<p>Apps Script nustatymuose saugomos tik SHA-256 raktų maišos.</p></div>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(560).setHeight(590),'Morocco Split · raktai');
}
function doGet() {return json_({ok:true,service:'Morocco Split',version:1,editing:true,message:'Sinchronizavimui naudojamas tik autentifikuotas POST.'});}
function doPost(e) {
  try {
    if(!e||!e.postData||e.postData.contents.length>60000)throw new Error('Neteisinga užklausa.');
    var payload=JSON.parse(e.postData.contents);
    if(payload.version!==1||PEOPLE.indexOf(payload.person)<0||typeof payload.token!=='string'||!/^[a-f0-9]{64}$/.test(payload.token))throw new Error('Netinkamas vardas arba raktas.');
    var expected=PropertiesService.getScriptProperties().getProperty('KEY_HASH_'+payload.person);
    if(!expected||!constantEqual_(hash_(payload.token),expected))throw new Error('Netinkamas vardas arba raktas.');
    if(!Array.isArray(payload.records)||payload.records.length>25)throw new Error('Vienu metu galima siųsti iki 25 įrašų.');
    var validated=payload.records.map(function(record){return validate_(record,payload.person);});
    var bases=payload.records.map(function(record){return record.baseRecord ? validate_(record.baseRecord,payload.person) : null;});
    var lock=LockService.getScriptLock();lock.waitLock(20000);
    try {
      var sheet=sheet_(),lastRow=sheet.getLastRow();
      if(lastRow>10000)throw new Error('Pasiektas kelionės įrašų limitas. Kreipkis į Miką.');
      var rows=lastRow>1?sheet.getRange(2,1,lastRow-1,13).getValues():[];
      var records=rows.filter(function(row){return row[0]!=='';}).map(decode_);
      var byId={};records.forEach(function(record){if(byId[record.id])throw new Error('Lentelėje yra pasikartojančių ID.');byId[record.id]=record;});
      var additions=[],updates=[],acked=[],seen={};
      var rowById={};rows.forEach(function(row,i){if(row[0])rowById[String(row[0])]=i+2;});
      // Check ownership and the original version before writing any correction.
      validated.forEach(function(record,index){
        if(seen[record.id] && seen[record.id]!==fingerprint_(record))throw new Error('Pakete kartojasi skirtingos tos pačios išlaidos versijos.');
        seen[record.id]=fingerprint_(record);
        if(byId[record.id]) {
          var current=byId[record.id],base=bases[index];
          if(current.recordedBy!==payload.person)throw new Error('Taisyti galima tik savo įvestas išlaidas.');
          if(fingerprint_(current)!==fingerprint_(record)) {
            if(!base || base.id!==record.id || base.createdAt!==record.createdAt || fingerprint_(current)!==fingerprint_(base))throw new Error('Išlaida jau pakeista kitur arba neatitinka pradinės versijos. Pataisymas liko telefone.');
            updates.push(record);byId[record.id]=record;
          }
        } else {byId[record.id]=record;additions.push(record);}
        acked.push(record.id);
      });
      if(records.length+additions.length>9999)throw new Error('Pasiektas kelionės įrašų limitas.');
      if(additions.length || updates.length) {
        var now=new Date().toISOString();
        additions.forEach(function(record){record.updatedAt=now;});
        updates.forEach(function(record){record.updatedAt=now;sheet.getRange(rowById[record.id],1,1,13).setValues([encode_(record)]);});
        if(additions.length)sheet.getRange(lastRow+1,1,additions.length,13).setValues(additions.map(encode_));
        SpreadsheetApp.flush();
        records=records.map(function(record){return byId[record.id];}).concat(additions);
      }
      // Success is returned only after the Sheet write is flushed; a lost reply is safe to retry.
      return json_({ok:true,version:1,person:payload.person,acked:acked,records:records});
    } finally {lock.releaseLock();}
  } catch(error) {return json_({ok:false,error:String(error.message||'Sinchronizavimas nepavyko.').slice(0,220)});}
}
function validate_(record,person) {
  if(!record||typeof record.id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(record.id))throw new Error('Netinkamas ID.');
  if(record.recordedBy!==person)throw new Error('Šis įrašas priskirtas kitam dalyviui.');
  if(typeof record.createdAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(record.createdAt)||!isFinite(Date.parse(record.createdAt)))throw new Error('Netinkama data.');
  if(PEOPLE.indexOf(record.payer)<0||['EUR','MAD'].indexOf(record.currency)<0)throw new Error('Neteisingas mokėtojas arba valiuta.');
  if(!Number.isSafeInteger(record.amountMinor)||record.amountMinor<1||record.amountMinor>100000000)throw new Error('Neteisinga suma.');
  if(!Number.isSafeInteger(record.rateMicros)||record.rateMicros<1||record.rateMicros>1000000000)throw new Error('Neteisingas kursas.');
  if(record.currency==='EUR'&&record.rateMicros!==1000000)throw new Error('Neteisingas EUR kursas.');
  var eurCents=record.currency==='EUR'?record.amountMinor:Math.round(record.amountMinor*1000000/record.rateMicros);
  if(eurCents<1||eurCents>100000000||record.eurCents!==eurCents)throw new Error('Neteisinga suma eurais.');
  if(typeof record.description!=='string'||!record.description.trim()||record.description.length>160||record.description.indexOf('\u200b')>=0)throw new Error('Neteisingas aprašymas.');
  if(!Array.isArray(record.participants)||record.participants.length<1||record.participants.some(function(p){return PEOPLE.indexOf(p)<0;})||new Set(record.participants).size!==record.participants.length)throw new Error('Neteisingi dalyviai.');
  return {id:record.id.toLowerCase(),createdAt:record.createdAt,payer:record.payer,description:record.description.trim(),amountMinor:record.amountMinor,currency:record.currency,rateMicros:record.rateMicros,eurCents:eurCents,participants:PEOPLE.filter(function(p){return record.participants.indexOf(p)>=0;}),recordedBy:person};
}
function safeText_(text){return /^[\s]*[=+\-@]/.test(text)?'\u200b'+text:text;}
function encode_(r){return [r.id,r.createdAt,r.payer,safeText_(r.description),r.amountMinor/100,r.currency,r.currency==='MAD'?r.rateMicros/1000000:1,r.eurCents/100,r.participants.indexOf('Mikas')>=0,r.participants.indexOf('Alfonsas')>=0,r.participants.indexOf('Linas')>=0,r.recordedBy,r.updatedAt];}
function decode_(row){
  var record={id:String(row[0]),createdAt:row[1] instanceof Date?row[1].toISOString():String(row[1]),payer:String(row[2]),description:String(row[3]).replace(/^\u200b/,''),amountMinor:Math.round(Number(row[4])*100),currency:String(row[5]),rateMicros:Math.round(Number(row[6])*1000000),eurCents:Math.round(Number(row[7])*100),participants:PEOPLE.filter(function(p,i){return row[8+i]===true||String(row[8+i]).toUpperCase()==='TRUE';}),recordedBy:String(row[11]),updatedAt:row[12] instanceof Date?row[12].toISOString():String(row[12])};
  validate_(record,record.recordedBy);return record;
}
function fingerprint_(r){return JSON.stringify([r.id,r.createdAt,r.payer,r.description,r.amountMinor,r.currency,r.rateMicros,r.eurCents,r.participants,r.recordedBy]);}
function json_(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
