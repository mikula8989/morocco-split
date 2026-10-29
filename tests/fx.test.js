import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRate,latestRate} from '../docs/fx.js';
import {normalizeExpense} from '../docs/core.js';
const now=Date.UTC(2026,9,29,12);
const payload={result:'success',base_code:'EUR',rates:{EUR:1,MAD:10.970409},time_last_update_unix:(now-3600000)/1000,time_next_update_unix:(now+23*3600000)/1000};
test('live provider rate becomes exact six-place snapshot used by MAD expense',async()=>{
  const result=await latestRate(null,{now,fetchImpl:async()=>({ok:true,json:async()=>payload})});
  assert.equal(result.rate.rateMicros,10970409);assert.equal(result.refreshed,true);
  const entry=normalizeExpense({amount:'109.70',currency:'MAD',rate:(result.rate.rateMicros/1000000).toFixed(6),payer:'Mikas',description:'Taksi',participants:['Mikas','Linas']});
  assert.equal(entry.eurCents,1000);
});
test('fresh cached rate and offline rate make no network requests',async()=>{
  const cached=parseRate(payload,now);const fetchImpl=()=>{throw Error('should not fetch');};
  assert.equal((await latestRate(cached,{now:now+1000,fetchImpl})).rate,cached);
  assert.equal((await latestRate(cached,{now:now+3*86400000,online:false,fetchImpl})).rate,cached);
});
test('unavailable API or invalid payload preserves old rate; no invented first-use rate',async()=>{
  const cached=parseRate(payload,now),later=now+3*86400000;
  const fetchImpl=async()=>({ok:false});
  const result=await latestRate(cached,{now:later,fetchImpl});assert.equal(result.rate,cached);assert.equal(result.refreshFailed,true);
  await assert.rejects(()=>latestRate(null,{now,online:false}),/Pirmą kartą/);
  await assert.rejects(()=>latestRate(null,{now,fetchImpl}),/Nepavyko gauti/);
});
test('wrong base, missing MAD, nonpositive rates and future dates are rejected',()=>{
  for(const change of [{base_code:'USD'},{rates:{}},{rates:{MAD:0}},{rates:{MAD:NaN}},{result:'error'},{time_last_update_unix:(now+3600000)/1000}])assert.throws(()=>parseRate({...payload,...change},now));
});
test('updated rates do not change saved expenses or retry payloads',()=>{
  const saved=normalizeExpense({amount:'100',currency:'MAD',rate:'10',description:'Dinner',payer:'Mikas',participants:['Mikas']});
  const next=parseRate(payload,now);assert.notEqual(next.rateMicros,saved.rateMicros);assert.equal(saved.eurCents,1000);assert.equal(saved.rateMicros,10000000);
});
