'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../js/12-missing-checks-and-care-plan.js'), 'utf8');
const historySource = source.slice(source.indexOf('    const careOperationHistories'), source.indexOf('    const carePlanFieldHistories'));
function mount() {
 let patient, saves=0;
 const ctx={getCurrentPatient:()=>patient,saveDataAndSync:()=>saves++,renderCarePlans(){},showToast(){}};
 ctx.window=ctx; vm.createContext(ctx); vm.runInContext(historySource,ctx);
 return {ctx,set:p=>patient=p,saves:()=>saves,change:p=>ctx.careOperationSnapshot(p),remember:(p,b)=>ctx.rememberCareOperation(p,b)};
}
const make=id=>({id,carePlans:{},items:[]});
test('structural history restores plans, records and response cards together',()=>{
 const h=mount(),p=make('p');h.set(p);const before=h.change(p);
 p.carePlans.plan={id:'plan',records:[{id:'record',responseCardId:'response'}]};p.items.push({id:'response',text:'Fictional response'});h.remember(p,before);
 assert.equal(h.ctx.undoCareOperation(),true);assert.equal(Object.keys(p.carePlans).length,0);assert.equal(p.items.length,0);
 assert.equal(h.ctx.undoCareOperation(true),true);assert.equal(p.carePlans.plan.records[0].responseCardId,p.items[0].id);assert.equal(h.saves(),2);
});
test('deletion restoration remains patient-scoped and refuses later updates',()=>{
 const h=mount(),a=make('a'),b=make('b');a.carePlans.p={id:'p',deleted:false};h.set(a);const before=h.change(a);a.carePlans.p.deleted=true;h.remember(a,before);
 h.set(b);assert.equal(h.ctx.undoCareOperation(),false);h.set(a);a.items.push({id:'external',text:'Later edit'});assert.equal(h.ctx.undoCareOperation(),false);assert.equal(a.carePlans.p.deleted,true);
 a.items=[];assert.equal(h.ctx.undoCareOperation(),true);assert.equal(a.carePlans.p.deleted,false);
});
test('a new structural operation discards redo and unchanged operations create no history',()=>{
 const h=mount(),p=make('p');h.set(p);h.remember(p,h.change(p));assert.equal(h.ctx.undoCareOperation(),false);
 let before=h.change(p);p.carePlans.a={id:'a'};h.remember(p,before);h.ctx.undoCareOperation();before=h.change(p);p.carePlans.b={id:'b'};h.remember(p,before);assert.equal(h.ctx.undoCareOperation(true),false);assert.ok(p.carePlans.b);
});

test('later changes to assessment, missing checks or map dependencies block structural restoration',()=>{
 for(const field of ['myAssessments','missingChecks','relationMap']) {
  const h=mount(),p=make('p');h.set(p);const before=h.change(p);p.items.push({id:'response'});h.remember(p,before);
  p[field]={later:true};assert.equal(h.ctx.undoCareOperation(),false,field);assert.equal(p.items.length,1);
 }
});
