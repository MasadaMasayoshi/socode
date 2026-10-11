'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadApp}=require('./app-helpers');
const audit=require('../clinical-knowledge/patient-quality');
const app=loadApp();
const card=(text,extra={})=>({id:'c',text,type:'o',timestamp:'入院後',hendersonIds:[1],assessmentCols:{1:'postadmission'},...extra});
const plan=()=>({problem:'呼吸状態',goalShort:'明日までに実施できる',evidence:['SpO2 98%'],op:['呼吸数を測定する'],tp:['指示された範囲で援助する'],ep:['知らせる症状を説明する']});
test('same-length evidence edits invalidate cached satisfaction',()=>{
 const cp={id:'p',items:[card('SpO2 98%')]};
 const before=app.ruleSufficiencyFor(cp);
 cp.items[0].text='SpO2 88%';
 const after=app.ruleSufficiencyFor(cp);
 assert.notStrictEqual(after,before);
 assert.equal(after[1].post.verdict,'unmet');
});
test('timestamp-only edits invalidate cached admission-phase results',()=>{
 const cp={id:'p',items:[card('SpO2 98%',{assessmentCols:{1:'unclassified'},timestamp:'入院前'})]};
 const before=app.ruleSufficiencyFor(cp);
 cp.items[0].timestamp='術後1日目';
 const after=app.ruleSufficiencyFor(cp);
 assert.notStrictEqual(before,after);
});
test('historical-only findings cannot establish a current nursing problem',()=>{
 const cp={items:[card('SpO2 88%',{admissionPhase:'preadmission',timestamp:'入院前'})]};
 const result=app.validateCarePlanEvidence(cp,{problem:'ガス交換障害',evidence:['SpO2 88%']});
 assert.notEqual(result.kind,'existing');
});
test('new plans capture unique evidence IDs and persistent review snapshots',()=>{
 const cp={id:'p',items:[card('SpO2 98%')]};
 const p=app.createCarePlan(cp,plan());
 assert.deepEqual(Array.from(p.evidenceIds),['c']);
 cp.items[0].text='SpO2 88%';
 const unchanged=JSON.stringify(cp);
 assert.ok(audit.audit(cp).findings.some(f=>f.code==='evidence-updated'));
 assert.ok(audit.audit(cp).findings.some(f=>f.code==='evidence-updated'));
 assert.equal(JSON.stringify(cp),unchanged,'audit never writes to chart');
 // Reopening from persisted JSON retains the warning.
 assert.ok(audit.audit(JSON.parse(JSON.stringify(cp))).findings.some(f=>f.code==='evidence-updated'));
 app.updateCarePlan(cp,p.id,{goalShort:'別の目標'});
 assert.ok(audit.audit(cp).findings.some(f=>f.code==='evidence-updated'),'goal edits do not acknowledge evidence');
 app.updateCarePlan(cp,p.id,{evidence:['SpO2 88%']});
 assert.ok(!audit.audit(cp).findings.some(f=>f.code==='evidence-updated'));
});
test('ambiguous evidence text does not invent a link',()=>{
 const cp={id:'p',items:[card('SpO2 98%'),card('SpO2 98%',{id:'d'})]};
 assert.equal(app.createCarePlan(cp,plan()).evidenceIds.length,0);
});
test('deleted evidence and phase changes request plan review',()=>{
 const cp={id:'p',items:[card('SpO2 98%')]};
 app.createCarePlan(cp,plan());
 cp.items[0].timestamp='入院前';
 assert.ok(audit.audit(cp).findings.some(f=>f.code==='evidence-updated'));
 cp.items[0].deleted=true;
 assert.ok(audit.audit(cp).findings.some(f=>f.code==='broken-evidence'));
});
test('intentional untagged background does not produce false warning',()=>{
 const cp={items:[card('アレルギー：なし',{hendersonIds:[]}),card('血液型A',{id:'b',hendersonIds:[],tagNotNeeded:true})]};
 assert.equal(audit.audit(cp,{untaggedReason:app.inferUntaggedReason}).findings.length,0);
});
test('repeated interventions and unsupported inferred arrows have clear reasons',()=>{
 const cp={items:[],carePlans:{p:{id:'p',...plan(),tp:['呼吸数を測定する']}},relationMap:{nodes:[{id:'a',observed:false},{id:'b',type:'nursing_problem',label:'別の問題'}],edges:[{id:'e',source:'a',target:'b',relation:'increases_risk_of'}]}};
 const codes=audit.audit(cp).findings.map(f=>f.code);
 for(const code of ['plan-duplicate','causal-basis','plan-map-review'])assert.ok(codes.includes(code),code);
});
test('evidence review previews changes, rejects collisions and records accepted revisions',()=>{
 const cp={id:'p',items:[card('SpO2 98%')]};
 const p=app.createCarePlan(cp,plan());
 cp.items[0].text='SpO2 88%';
 const changes=app.carePlanEvidenceChanges(cp,p);
 assert.match(app.carePlanBasisHtml(p,cp),/変更内容を確認して根拠を更新/);
 assert.equal(app.refreshCarePlanEvidence(cp,p.id,'stale'),false);
 assert.equal(app.refreshCarePlanEvidence(cp,p.id,JSON.stringify(changes)),true);
 assert.equal(p.evidence[0],'SpO2 88%');
 assert.equal(p.evidenceReviewHistory.length,1);
 assert.equal(app.carePlanEvidenceChanges(cp,p).length,0);
 assert.equal(p.goalShort,'明日までに実施できる');
 cp.items[0].deleted=true;
 assert.equal(app.refreshCarePlanEvidence(cp,p.id,JSON.stringify(app.carePlanEvidenceChanges(cp,p))),false);
});
test('discarded and AI-suggested observations do not determine satisfaction',()=>{
 const cp={id:'p',items:[card('SpO2 88%',{deleted:true}),card('SpO2 88%',{id:'d',aiSuggested:true})]};
 assert.equal(app.ruleSufficiencyFor(cp)[1].post.verdict,'unknown');
});
test('test discovery excludes executable scripts and proxy bypass stays local',()=>{
 const {testTargets,testEnv}=require('../scripts/run-tests');
 assert.ok(testTargets().every(p=>p.endsWith('.test.js')));
 assert.ok(!testTargets().some(p=>p.includes('test-quiet')));
 assert.ok(testEnv().NO_PROXY.includes('127.0.0.1'));
});
test('a plan cannot validate itself with an unrecorded current observation',()=>{
 const cp={items:[card('SpO2 98%')]};
 const result=app.validateCarePlanEvidence(cp,{problem:'ガス交換障害',evidence:['SpO2 88%']});
 assert.notEqual(result.kind,'existing');
});

test('native map source references and plan mapEvidenceRefs detect deleted and foreign cards',()=>{
 const patient={id:'p',items:[{id:'live',text:'記録',type:'o',hendersonIds:[1]}],carePlans:{plan:{id:'plan',evidence:['記録'],mapEvidenceRefs:[{sourceType:'card',sourceId:'live',patientId:'other'}]}},relationMap:{nodes:[{id:'node',itemIds:['deleted'],sourceRefs:[{sourceType:'card',sourceId:'missing',patientId:'p'}]}],edges:[]}};
 const findings=audit.audit(patient).findings;
 assert.ok(findings.some(f=>f.code==='foreign-evidence'));
 assert.equal(findings.filter(f=>f.code==='broken-evidence').length,2);
});
