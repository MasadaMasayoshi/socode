'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {audit,summarize}=require('../clinical-knowledge/evidence-audit.js');
test('checks evidence links without mutating patient data',()=>{
 const patient={id:'synthetic',items:[{id:'c1',text:'架空の所見',hendersonIds:[4]}],carePlans:{p1:{id:'p1',problem:'転倒リスク',goalLong:'安全に移動する',op:['観察'],tp:['援助'],ep:['説明'],evidenceIds:['deleted-card']}}};
 const before=JSON.stringify(patient),result=audit(patient);
 assert.ok(result.issues.some(x=>x.type==='broken-evidence'));assert.equal(JSON.stringify(patient),before);
});
test('separate careplan and map issues are reported with counts',()=>{
 const result=audit({id:'mock',items:[],carePlans:{p:{id:'p',problem:'転倒',op:[],tp:[],ep:[]}},relationMap:{nodes:[{id:'n1',label:'架空'}],edges:[]}});
 assert.ok(result.issues.some(x=>x.type==='isolated-node'));assert.ok(result.issues.some(x=>x.type==='missing-goal'));assert.equal(result.checked.plans,1);
 assert.ok(summarize(result.issues).length>0);
});
test('correct simple links produce no evidence-link warnings',()=>{
 const result=audit({id:'mock',items:[{id:'c',text:'所見',hendersonIds:[4]}],carePlans:{p:{id:'p',problem:'問題',goalShort:'目標',op:['観察'],tp:['援助'],ep:['説明'],evidenceIds:['c']}},relationMap:{nodes:[],edges:[]}});
 assert.ok(!result.issues.some(x=>x.type==='broken-evidence'||x.type==='missing-evidence'));
});

test('source coverage distinguishes exact text from manual-review paraphrases',()=>{
 const {compareSourceCoverage}=require('../clinical-knowledge/evidence-audit.js');
 const source='入院前は自分で歩いていた。\n術後は歩行に付き添いが必要になった。';
 const x=compareSourceCoverage(source,[{text:'入院前は自分で歩いていた。'},{text:'術後は介助を要する。'}]);
 assert.equal(x.segments,2);
 assert.equal(x.matched.length,1);
 assert.equal(x.needsReview.length,1);
 assert.match(x.notice,/完全一致/);
});
