'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const q=require('../clinical-knowledge/quality-checks.js');
test('Henderson tags are semantic and constrained to 1-14',()=>{
 assert.ok(q.classifyEvidence({dataType:'S',text:'足が痛い',tags:['10']}).some(x=>x.code==='subjective-not-communication'));
 assert.equal(q.classifyEvidence({dataType:'O',text:'歩行時ふらつき',tags:['4']}).length,0);
});
test('satisfaction evaluates before and after admission separately',()=>{
 const r=q.periodSatisfaction({beforeAdmission:{status:'satisfied',evidence:'自立'},afterAdmission:{status:'unsatisfied',evidence:'介助が必要'}});
 assert.equal(r.length,0);
 assert.ok(q.periodSatisfaction({beforeAdmission:{status:'satisfied',evidence:'自立'}}).some(x=>x.code==='missing-afterAdmission'));
});
test('problems must cite evidence',()=>assert.ok(q.nursingProblem({name:'転倒リスク',evidenceIds:[]}).some(x=>x.code==='problem-evidence')));
test('map flags isolated nodes and unsupported arrows',()=>{
 const issues=q.relationMap({nodes:[{id:'a'},{id:'b'},{id:'c'}],edges:[{from:'a',to:'b',relation:'causes'}]});
 assert.ok(issues.some(x=>x.code==='isolated-node'));assert.ok(issues.some(x=>x.code==='unsupported-causality'));
});
test('OP TP EP and goal completeness',()=>assert.equal(q.carePlan({OP:['観察'],TP:['援助'],EP:['教育'],goal:'安全に歩ける'}).length,0));
test('lab checks missing units and references',()=>assert.ok(q.lab({value:7,min:10,max:5}).some(x=>x.code==='reversed-range')));
test('OCR comparisons identify discrepancies',()=>assert.equal(q.ocr('WBC 6000/μL','WBC 6000/μL').length,0));
test('revision patterns count deterministically',()=>assert.deepEqual(q.history([{reason:'tag'},{reason:'tag'},{reason:'period'}])[0],{reason:'tag',count:2}));
test('unreviewed medical knowledge never automatically applies',()=>assert.ok(q.applicability({scope:'成人',status:'pending-expert-review'},{ageGroup:'adult',phase:'afterAdmission'}).some(x=>x.code==='not-expert-approved')));
