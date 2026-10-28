import test from 'node:test';
import assert from 'node:assert/strict';
import {PEOPLE,normalizeExpense,balances,settlements,decimal} from '../docs/core.js';
const expense=overrides=>normalizeExpense({amount:'30',description:'Vakarienė',currency:'EUR',payer:'Mikas',participants:PEOPLE,...overrides});
test('EUR, comma decimals and real MAD exchange rate',()=>{
  assert.equal(expense({amount:'12,34'}).eurCents,1234);
  assert.equal(expense({amount:'108',currency:'MAD',rate:'10,8'}).eurCents,1000);
  assert.equal(expense({amount:'100',currency:'MAD',rate:'10.23'}).eurCents,978);
});
test('one payer, three sharers settle without floating point drift',()=>{
  assert.deepEqual(balances([expense()]),{Mikas:2000,Alfonsas:-1000,Linas:-1000});
  assert.deepEqual(settlements(balances([expense()])),[{from:'Alfonsas',to:'Mikas',cents:1000},{from:'Linas',to:'Mikas',cents:1000}]);
});
test('payer need not participate; cent remainder is deterministic',()=>{
  assert.deepEqual(balances([expense({amount:'0.01',payer:'Linas'})]),{Mikas:-1,Alfonsas:0,Linas:1});
  assert.deepEqual(balances([expense({participants:['Linas']})]),{Mikas:3000,Alfonsas:0,Linas:-3000});
});
test('many mixed expenses preserve zero-sum and settlements close every balance',()=>{
  const rows=Array.from({length:500},(_,i)=>expense({amount:((i+1)*1.37).toFixed(2),payer:PEOPLE[i%3],participants:i%2?PEOPLE:[PEOPLE[(i+1)%3]]}));
  const net=balances(rows);assert.equal(Object.values(net).reduce((a,b)=>a+b,0),0);
  for(const transfer of settlements(net)){net[transfer.from]+=transfer.cents;net[transfer.to]-=transfer.cents;}
  assert.deepEqual(net,{Mikas:0,Alfonsas:0,Linas:0});
});
test('reject invalid amount, currency, rate and empty sharers',()=>{
  for(const value of ['-1','1.001','1e3','NaN','0','1 000'])assert.throws(()=>decimal(value));
  for(const change of [{participants:[]},{currency:'USD'},{amount:'1000001'},{currency:'MAD',rate:''},{currency:'MAD',rate:'0'},{description:''}])assert.throws(()=>expense(change));
});
