'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadApp}=require('./app-helpers');
const card=(id,extra={})=>({id,text:'呼吸数24回/分',type:'o',timestamp:'入院1日目',hendersonIds:[1],...extra});
function map(refs){return {patientId:'p',nodes:[{id:'fact',type:'patient_fact',label:'観察要約',epistemicStatus:'observed',sourceRefs:refs},{id:'problem',type:'nursing_problem',label:'ガス交換障害',priority:1}],edges:[{id:'link',source:'fact',target:'problem',relation:'supports'}]};}
test('図の要約と本文が異なっても、同じ患者の明示カード参照は計画へ引き継ぐ',()=>{
 const app=loadApp(),cp={id:'p',items:[card('a')],carePlans:{}};
 const [p]=app.importCarePlansFromMap(cp,'2026-10-10T00:00:00Z',map([{sourceType:'card',patientId:'p',sourceId:'a'}]));
 assert.deepEqual(Array.from(p.evidenceIds),['a']);
 assert.equal(p.evidenceSnapshot[0].text,'呼吸数24回/分');
 cp.items[0].text='呼吸数28回/分';
 assert.equal(app.carePlanEvidenceChanges(cp,p).length,1,'後からの変更を元の控えと照合');
 assert.equal(p.evidenceSnapshot[0].text,'呼吸数24回/分');
});
test('別患者・不存在・削除・除外・AI提案・評価参照をカードへ変換しない',()=>{
 const app=loadApp(),cp={id:'p',items:[card('good'),card('deleted',{deleted:true}),card('excluded',{type:'unnecessary'}),card('ai',{aiSuggested:true})],carePlans:{}};
 const refs=[['p','good'],['other','good'],['p','missing'],['p','deleted'],['p','excluded'],['p','ai']].map(([patientId,sourceId])=>({sourceType:'card',patientId,sourceId}));
 refs.push({sourceType:'assessment',patientId:'p',sourceId:'good'});
 const [p]=app.importCarePlansFromMap(cp,undefined,map(refs));
 assert.deepEqual(Array.from(p.evidenceIds),['good']);
 assert.equal(p.evidenceSnapshot.length,1);
});
test('参照の更新時も患者所有を確認し、似た文章だけではカードIDを作らない',()=>{
 const app=loadApp(),cp={id:'p',items:[card('a')],carePlans:{}};
 const p=app.createCarePlan(cp,{caseId:'p',problem:'手動計画',evidence:['呼吸数24']});
 assert.equal(p.evidenceIds.length,0);
 app.updateCarePlan(cp,p.id,{mapEvidenceRefs:[{sourceType:'card',sourceId:'a',patientId:'other'}]});
 assert.equal(p.evidenceIds.length,0);
 app.updateCarePlan(cp,p.id,{mapEvidenceRefs:[{sourceType:'card',sourceId:'a',patientId:'p'}]});
 assert.deepEqual(Array.from(p.evidenceIds),['a']);
 const foreign=app.createCarePlan(cp,{caseId:'other',problem:'他患者の計画',mapEvidenceRefs:[{sourceType:'card',sourceId:'a',patientId:'p'}]});
 assert.equal(foreign.evidenceIds.length,0);
});
