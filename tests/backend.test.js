import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {normalizeExpense,PEOPLE} from '../docs/core.js';
const source=fs.readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
function harness(){
  const rows=[],props={},key='a'.repeat(64);let locked=false;
  const sheet={getLastRow:()=>rows.length+1,getRange:(r,c,h,w)=>({getValues:()=>r===1?[['ID','Sukurta','Mokėtojas','Aprašymas','Suma','Valiuta','Kursas MAD/EUR','Suma EUR','Mikas dalinasi','Alfonsas dalinasi','Linas dalinasi','Įrašė','Atnaujinta']]:rows.slice(r-2,r-2+h),setValues:values=>{assert.ok(locked);values.forEach((value,i)=>rows[r-2+i]=value);}})};
  const context=vm.createContext({console,SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet}),flush:()=>{}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v})},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,text)=>[...crypto.createHash('sha256').update(text).digest()]},LockService:{getScriptLock:()=>({waitLock:()=>locked=true,releaseLock:()=>locked=false})},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>text})}});
  vm.runInContext(source,context);props.KEY_HASH_Mikas=crypto.createHash('sha256').update(key).digest('hex');
  const post=(records,changes={})=>JSON.parse(context.doPost({postData:{contents:JSON.stringify({version:1,person:'Mikas',token:key,records,...changes})}}));
  return {rows,post,context};
}
const make=(changes={})=>({...normalizeExpense({amount:'100',currency:'MAD',rate:'10.8',description:'=IMPORTXML("bad")',payer:'Linas',participants:PEOPLE}),id:crypto.randomUUID(),createdAt:new Date().toISOString(),recordedBy:'Mikas',...changes});
test('lost-response retry is idempotent, formulas stored safely and read back',()=>{
  const h=harness(),entry=make();const first=h.post([entry]);assert.equal(first.ok,true);assert.equal(h.rows.length,1);assert.equal(h.rows[0][3][0],'\u200b');
  const retry=h.post([entry]);assert.equal(retry.ok,true);assert.deepEqual(retry.acked,[entry.id]);assert.equal(h.rows.length,1);assert.equal(retry.records[0].description,entry.description);
});
test('same ID different content is rejected without replacing the first row',()=>{
  const h=harness(),entry=make();h.post([entry]);assert.equal(h.post([{...entry,description:'Changed'}]).ok,false);assert.equal(h.rows.length,1);
});
test('invalid token, impersonation and forged EUR totals cannot write',()=>{
  const h=harness(),entry=make();
  assert.equal(h.post([entry],{token:'b'.repeat(64)}).ok,false);
  assert.equal(h.post([{...entry,recordedBy:'Linas'}]).ok,false);
  assert.equal(h.post([{...entry,eurCents:1}]).ok,false);
  assert.equal(h.rows.length,0);
});
test('batch validates before writing and duplicate IDs within a batch write once',()=>{
  const h=harness(),entry=make();assert.equal(h.post([entry,make({participants:[]})]).ok,false);assert.equal(h.rows.length,0);
  assert.equal(h.post([entry,entry]).ok,true);assert.equal(h.rows.length,1);
});
test('empty authenticated sync reads other participants entries; unauthenticated GET exposes no records',()=>{
  const h=harness(),entry=make();h.post([entry]);assert.equal(h.post([]).records.length,1);assert.equal(JSON.parse(h.context.doGet()).records,undefined);
});
test('correction updates the same row, preserves rate and retries after a lost response',()=>{
  const h=harness(),entry=make();h.post([entry]);
  const changed={...entry,amountMinor:20000,eurCents:Math.round(20000*1000000/entry.rateMicros),description:'Pataisyta',baseRecord:entry};
  const response=h.post([changed]);assert.equal(response.ok,true);assert.equal(h.rows.length,1);
  assert.equal(response.records[0].description,'Pataisyta');assert.equal(response.records[0].rateMicros,entry.rateMicros);
  assert.equal(h.post([changed]).ok,true);assert.equal(h.rows.length,1);
});
test('stale correction and forged ownership cannot overwrite a row or partially add a batch',()=>{
  const h=harness(),entry=make();h.post([entry]);
  const changed={...entry,description:'First edit',baseRecord:entry};assert.equal(h.post([changed]).ok,true);
  assert.equal(h.post([make(),{...entry,description:'Stale edit',baseRecord:entry}]).ok,false);
  assert.equal(h.rows.length,1);assert.equal(h.post([]).records[0].description,'First edit');
  h.rows[0][11]='Linas';
  assert.equal(h.post([{...entry,description:'Stolen',baseRecord:entry}]).ok,false);
  assert.equal(h.rows[0][3],'First edit');
});
test('offline correction before first sync creates only the corrected expense',()=>{
  const h=harness(),entry=make();const response=h.post([{...entry,description:'Corrected offline',baseRecord:entry}]);
  assert.equal(response.ok,true);assert.equal(h.rows.length,1);assert.equal(response.records[0].description,'Corrected offline');
});
test('deletion clears expense details and is idempotent; stale clients cannot resurrect it',()=>{
  const h=harness(),entry=make();h.post([entry]);
  const deletion={...entry,deleted:true,baseRecord:entry};
  assert.equal(h.post([deletion]).ok,false,'v1 must not accept deletion');
  const response=h.post([deletion],{version:2});assert.equal(response.ok,true);
  assert.equal(h.rows.length,1);assert.equal(h.rows[0][0],'deleted:'+entry.id);
  assert.ok(h.rows[0].slice(1,11).every(v=>v===''),'expense content removed');
  assert.equal(response.records[0].deleted,true);assert.equal(response.records[0].description,undefined);
  assert.equal(h.post([deletion],{version:2}).ok,true);
  const stale=h.post([entry]);assert.equal(stale.ok,true);assert.equal(stale.records[0].deleted,true);
  assert.equal(h.rows[0][0],'deleted:'+entry.id);
});
test('deletion before first upload never inserts an active expense',()=>{
  const h=harness(),entry=make();
  const response=h.post([{...entry,deleted:true,baseRecord:entry}],{version:2});
  assert.equal(response.ok,true);assert.equal(response.records[0].deleted,true);assert.equal(h.rows[0][3],'');
});
test('deletion checks ownership and stale versions before writing the batch',()=>{
  const h=harness(),entry=make();h.post([entry]);
  const changed={...entry,description:'Changed',baseRecord:entry};h.post([changed]);
  assert.equal(h.post([make(),{...entry,deleted:true,baseRecord:entry}],{version:2}).ok,false);
  assert.equal(h.rows.length,1);assert.equal(h.rows[0][3],'Changed');
  h.rows[0][11]='Linas';
  assert.equal(h.post([{...changed,deleted:true,baseRecord:changed}],{version:2}).ok,false);
  assert.equal(h.rows[0][3],'Changed');
});
