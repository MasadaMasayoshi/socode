'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const SOURCE = '診断名：胃がん\n現病歴：健診で貧血を指摘された。内視鏡で胃底部に25mmの腫瘍を認めた。\n家族歴：父が胃がんで亡くなった。母は乳がん治療歴あり。\n生活歴：20歳から20本/日喫煙していたが、10年前に禁煙した。\n胃全摘術を施行。\n術後1日目：創部痛 NRS2、喀痰あり。';
const patient = text => ({id:'source-history',sourceText:text,items:Array.from(app.classifyTextByRules(text),(i,k)=>({...i,id:'i'+k})),carePlans:{}});
const linked = (map,a,b,relation) => map.edges.some(e=>e.source===a.id&&e.target===b.id&&(!relation||e.relation===relation));

test('Separate tumor size and actual examination history remain recorded evidence in full and focused maps', () => {
 const cp=patient(SOURCE),before=JSON.stringify(cp.items),map=app.buildRelationMapFromRecord(cp);
 const disease=map.nodes.find(n=>n.type==='disease'),tumor=map.nodes.find(n=>/25mm/.test(n.label)),exam=map.nodes.find(n=>/健診で貧血/.test(n.label));
 assert.equal(disease.label,'胃がん');assert.ok(tumor);assert.match(tumor.label,/内視鏡.*胃底部.*25mm.*腫瘍/);
 assert.equal(tumor.source,'record');assert.ok(tumor.itemIds.length);assert.match(tumor.evidence,/25mm/);
 assert.ok(linked(map,tumor,disease,'supports'));assert.ok(linked(map,exam,disease,'supports'));
 assert.ok(!map.nodes.some(n=>/検査の内容は記録なし/.test(n.label)));
 const pain=map.nodes.find(n=>n.type==='nursing_problem'&&/痛/.test(n.label));assert.ok(pain);
 const focused=app.rmProblemSubmap(map,pain.id);
 assert.ok(focused.nodes.some(n=>n.id===tumor.id));assert.ok(focused.nodes.some(n=>n.id===exam.id));
 assert.equal(JSON.stringify(cp.items),before);
});

test('Family cancer history remains background without becoming a patient diagnosis or asserted cause', () => {
 const map=app.buildRelationMapFromRecord(patient(SOURCE));
 const disease=map.nodes.find(n=>n.type==='disease'),family=map.nodes.find(n=>/^家族歴/.test(n.label));
 assert.ok(family);assert.match(family.label,/父.*胃がん.*母.*乳がん/);assert.equal(family.type,'patient_fact');assert.equal(family.source,'record');
 assert.ok(linked(map,family,disease,'related_to'));assert.ok(!linked(map,family,disease,'causes'));
 assert.equal(map.nodes.filter(n=>n.type==='disease').length,1);
 const pain=map.nodes.find(n=>n.type==='nursing_problem'&&/痛/.test(n.label));
 assert.ok(app.rmProblemSubmap(map,pain.id).nodes.some(n=>n.id===family.id));
 const familyOnly=app.buildRelationMapFromRecord(patient('家族歴：父が胃がんで亡くなった。母は乳がん治療歴あり。'));
 assert.equal(familyOnly.nodes.filter(n=>n.type==='disease').length,0);
});

test('Source reread preserves omitted history but respects explicit card exclusions and negative findings', () => {
 const cp=patient(SOURCE);cp.items=cp.items.filter(i=>!/25mm|家族歴/.test(i.text));
 let map=app.buildRelationMapFromRecord(cp);assert.ok(map.nodes.some(n=>/25mm/.test(n.label)));assert.ok(map.nodes.some(n=>/^家族歴/.test(n.label)));
 const original=patient(SOURCE);original.items.filter(i=>/25mm|家族歴/.test(i.text)).forEach(i=>i.type='unnecessary');
 map=app.buildRelationMapFromRecord(original);assert.ok(!map.nodes.some(n=>/25mm/.test(n.label)));assert.ok(!map.nodes.some(n=>/^家族歴/.test(n.label)));
 map=app.buildRelationMapFromRecord(patient('診断名：胃がん\n家族歴：がん歴なし\n病変：25mmの腫瘍なし\n血圧：125mmHg\n胃全摘術を施行。\n術後1日目：創部痛 NRS2。'));
 assert.ok(!map.nodes.some(n=>/^家族歴/.test(n.label)));assert.ok(!map.nodes.some(n=>/25mm/.test(n.label)));
});

test('Factor extraction keeps distinct histories and cessation wording without duplicating keyword aliases', () => {
 const cp=patient(SOURCE.replace('生活歴：','既往歴：ピロリ菌感染を指摘された。\n生活歴：')+'\n生活歴：ピロリ菌の除菌治療を受けた。');
 const map=app.buildRelationMapFromRecord(cp),disease=map.nodes.find(n=>n.type==='disease');
 const smoke=map.nodes.find(n=>/20歳から20本/.test(n.label));assert.ok(smoke);assert.match(smoke.label,/10年前に禁煙/);
 const factors=map.nodes.filter(n=>n.type==='patient_fact'&&/ピロリ/.test(n.label));assert.equal(factors.length,2);
 assert.ok(factors.every(n=>map.edges.some(e=>e.source===n.id)));assert.ok(disease);
});

// Anonymous excerpts from the supplied record reproduce the original omissions.
test('Supplied record headings preserve tumor size, family history and relevant past history', () => {
 const text='【診断】胃がん\n予定術式：腹腔鏡下胃全摘術(R-Y再建)+胆嚢摘出術+リンパ節郭清\n【既往歴】53歳の時に胆嚢結石を指摘され、症状はなく経過観察中。\n【メディカルヒストリー】がん家系なので、検診を欠かさず受けている。\n半年前から胃のむかつきがあり、2か月前に会社の検診で貧血を指摘された。精密検査で胃底部に25mmのがんが見つかり、手術目的で入院した。\n【ファミリーヒストリー】祖母は胃がん、父は前立腺がんで亡くしている。\n【胃カメラ】胃底部に25㎜大の腫瘍あり。\n術後1日目：創部痛 NRS2、喀痰あり。';
 const cp=patient(text),map=app.buildRelationMapFromRecord(cp);
 const tumor=map.nodes.find(n=>/25mm.*腫瘍/.test(n.label.normalize('NFKC')));
 const family=map.nodes.find(n=>/祖母.*胃がん.*父.*前立腺/.test(n.label));
 const history=map.nodes.find(n=>/胆嚢結石/.test(n.label));
 assert.ok(tumor);assert.ok(family);assert.ok(history);
 assert.equal(map.nodes.filter(n=>n.type==='disease').length,1);
 const pain=map.nodes.find(n=>n.type==='nursing_problem'&&/痛/.test(n.label));assert.ok(pain);
 const focused=app.rmProblemSubmap(map,pain.id);
 for(const n of [tumor,family,history])assert.ok(focused.nodes.some(x=>x.id===n.id));
});
