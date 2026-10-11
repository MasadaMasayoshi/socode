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
 assert.equal(disease.label,'胃がん');assert.ok(tumor);assert.match(tumor.label,/胃底部.*腫瘍.*25mm/);assert.match(tumor.evidence,/内視鏡/);
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
 const tumor=map.nodes.find(n=>/腫瘍.*25mm/.test(n.label.normalize('NFKC')));
 const family=map.nodes.find(n=>/祖母.*胃がん.*父.*前立腺/.test(n.label));
 const history=map.nodes.find(n=>/胆嚢結石/.test(n.label));
 assert.ok(tumor);assert.ok(family);assert.ok(history);
 assert.equal(map.nodes.filter(n=>n.type==='disease').length,1);
 const pain=map.nodes.find(n=>n.type==='nursing_problem'&&/痛/.test(n.label));assert.ok(pain);
 const focused=app.rmProblemSubmap(map,pain.id);
 for(const n of [tumor,family,history])assert.ok(focused.nodes.some(x=>x.id===n.id));
});

test('Repeated background clauses consolidate with all source cards and separate family from diagnostic history', () => {
 const text='【診断】胃がん\n【メディカルヒストリー】\nがん家系なので検診を受けている。半年前から胃のむかつきがあった。精密検査で胃底部に25mm大のがんが見つかった。\n【ファミリーヒストリー】\n祖母は胃がん、父は前立腺がんで亡くなった。\n【普段の生活】\n嗜好品：20歳から喫煙（20本/日）していたが10年前に禁煙した。\n【胃カメラ】胃底部に25㎜大の腫瘍あり。\n胃全摘術を施行。\n術後1日目：創部痛 NRS2。';
 const cp=patient(text),tumorCard=cp.items.find(i=>/胃カメラ/.test(i.text)),smoking=cp.items.find(i=>/喫煙/.test(i.text));
 cp.items.push({...tumorCard,id:'tumor-copy',text:'【胸部X線】病変なし 【胃カメラ】胃底部に25 mm大の腫瘍あり。'});
 cp.items.push({...smoking,id:'smoking-copy',text:smoking.text.replace('嗜好品：','嗜好品: ')});
 cp.items.push({id:'path-zero',text:'【病理結果】T2 N0 P0 H0 M0',type:'o',timestamp:'手術当日'});
 cp.items.push({id:'path-letter',text:'【病理結果】T2 NO PO HO M0',type:'o',timestamp:'手術当日'});
 const before=JSON.stringify(cp.items),map=app.buildRelationMapFromRecord(cp);
 const tumors=map.nodes.filter(n=>n.type==='patient_fact'&&/腫瘍.*25mm/.test(n.label));assert.equal(tumors.length,1);
 for(const id of [tumorCard.id,'tumor-copy'])assert.ok(tumors[0].itemIds.includes(id));
 assert.match(tumors[0].evidence,/胸部X線/);assert.match(tumors[0].evidence,/精密検査/);
 const smokers=map.nodes.filter(n=>n.type==='patient_fact'&&/喫煙/.test(n.label));assert.equal(smokers.length,1);assert.ok(smokers[0].itemIds.includes('smoking-copy'));
 assert.ok(map.nodes.filter(n=>/^家族歴/.test(n.label)).every(n=>!/半年前|むかつき|25mm/.test(n.label)));
 assert.ok(map.nodes.some(n=>/半年前から胃のむかつき/.test(n.label)));
 const pathology=map.nodes.filter(n=>/病理結果/.test(n.label));assert.equal(pathology.length,1);assert.match(pathology[0].label,/要確認/);assert.match(pathology[0].evidence,/N0/);assert.match(pathology[0].evidence,/NO/);
 const restored=app.normalizeRelationMap(JSON.parse(JSON.stringify(map)));assert.match(restored.nodes.find(n=>n.id===pathology[0].id).evidence,/NO/);
 const pain=map.nodes.find(n=>n.type==='nursing_problem'&&/痛/.test(n.label));assert.ok(app.rmProblemSubmap(map,pain.id).nodes.some(n=>n.id===tumors[0].id));
 assert.equal(JSON.stringify(cp.items),before);
});

test('Different tumor measurements and distinct pathology times do not collapse', () => {
 const cp=patient('診断名：胃がん\n【胃カメラ】胃底部に25mmの腫瘍あり。\n【胃カメラ】胃底部に30mmの腫瘍あり。\n【胃カメラ】胃体部に25mmの腫瘍あり。\n胃全摘術を施行。\n術後1日目：創部痛 NRS2。');
 cp.items.push({id:'p1',type:'o',text:'【病理結果】T2 N0 M0',timestamp:'術前'});
 cp.items.push({id:'p2',type:'o',text:'【病理結果】T2 NO M0',timestamp:'術後1日目'});
 const map=app.buildRelationMapFromRecord(cp);
 assert.equal(map.nodes.filter(n=>n.type==='patient_fact'&&/腫瘍.*(?:25|30)mm/.test(n.label)).length,3);
 assert.equal(map.nodes.filter(n=>/病理結果/.test(n.label)).length,2);
});

test('Examination findings and complication fears retain their recorded context', () => {
 const cp=patient('診断名：胃がん\n【胃カメラ】胃底部に25mm大の腫瘍あり。\n胃全摘術を予定。\n入院1日目\n14:00 麻酔科から帰室。「麻酔科で丁寧に説明してもらった。手術っていろいろな合併症があるんだね。怖いね」と話す。');
 const map=app.buildRelationMapFromRecord(cp),disease=map.nodes.find(n=>n.type==='disease'),tumor=map.nodes.find(n=>/腫瘍.*25mm/.test(n.label)),words=map.nodes.find(n=>/不安の言動/.test(n.label)),problem=map.nodes.find(n=>n.type==='nursing_problem'&&/不安/.test(n.label));
 assert.match(tumor.label,/胃カメラで確認/);assert.ok(linked(map,tumor,disease,'supports'));assert.ok(!linked(map,tumor,disease,'causes'));
 assert.match(words.label,/麻酔科.*手術の合併症.*怖い/);assert.match(words.evidence,/手術っていろいろな合併症があるんだね。怖いね/);assert.match(words.evidence,/入院1日目.*14:00/);assert.ok(words.itemIds.length);
 assert.match(problem.label,/手術の合併症/);assert.ok(linked(map,words,problem,'supports'));assert.ok(!map.nodes.some(n=>/入院・今後の生活の変化/.test(n.label)));
 assert.match(app.normalizeRelationMap(JSON.parse(JSON.stringify(map))).nodes.find(n=>n.id===words.id).evidence,/麻酔科/);
 const other=app.buildRelationMapFromRecord(patient('診断名：胃がん\n「検査の結果がどうなるのか。怖いね」と話す。'));
 const otherWords=other.nodes.find(n=>/不安の言動/.test(n.label));assert.match(otherWords.label,/検査の結果がどうなるのか/);assert.doesNotMatch(otherWords.label,/麻酔科|手術の合併症/);
});
