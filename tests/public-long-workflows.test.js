'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {loadApp} = require('./app-helpers');
const {loadPublicCases} = require('./public-case-helpers');
const critical = {
  pneumonia: ['苦しい', 's'],
  'colon-postoperative': ['お腹が痛くて動けない', 's'],
  'heart-failure': ['息苦しくて眠れない', 's'],
  stroke: ['手が動かない', 's'],
  maternity: ['昨日より歩きやすい', 's'],
  'child-asthma': ['あまり眠れなかった', 's'],
  'diabetic-foot': ['痛くないから放っておいた', 's']
};
for (const {id,text} of loadPublicCases()) {
  test(`公開長文 ${id}: 重要発言・関連図・計画状態・患者参照の一貫性`, () => {
    let network = 0;
    const app = loadApp({fetch:async()=>{network++;return {ok:true,json:async()=>[],text:async()=>''};}});
    network = 0; // 起動時の共有データ読込モックと、以下の分類・図・計画操作を区別する。
    const items = Array.from(app.classifyTextByRules(text)).map((c,i)=>({...c,id:`${id}-${i}`}));
    const [needle,type] = critical[id];
    const found = items.filter(c=>c.text.includes(needle));
    assert.ok(found.length>0, needle);
    assert.ok(found.every(c=>c.type===type), needle);
    const cp = {id:`public-${id}`,title:id,sourceText:text,items,carePlans:{},myAssessments:{},selectedDiagnosisIds:[],diagnosisCandidates:[]};
    const map = app.buildRelationMapFromRecord(cp);
    assert.ok(map.nodes.length>0);
    const nodeIds = new Set(map.nodes.map(n=>n.id));
    const itemIds = new Set(items.map(i=>i.id));
    for (const e of map.edges) assert.ok(nodeIds.has(e.source)&&nodeIds.has(e.target));
    for (const n of map.nodes) for (const ref of n.itemIds||[]) assert.ok(itemIds.has(ref), `${id}: 別患者の根拠`);
    app.autoBuildCarePlans(cp,{notify:false});
    const plans = app.carePlanList(cp);
    assert.ok(plans.length>0);
    assert.equal(new Set(plans.map(p=>p.problem)).size,plans.length);
    for (const p of plans) {
      assert.equal(p.caseId,cp.id);
      assert.equal(p.status,'planned');
      assert.equal(p.records.length,0);
      assert.equal(app.evaluateCarePlanFromRecords(p).result,'unevaluable');
      for (const ref of p.evidenceIds||[]) assert.ok(itemIds.has(ref));
    }
    const p = plans[0];
    p.goalShort = '本人と相談して記載した個別の目標';
    p.userEdited = true;
    app.autoBuildCarePlans(cp,{notify:false});
    assert.equal(p.goalShort,'本人と相談して記載した個別の目標');
    assert.equal(app.carePlanList(cp).length,plans.length);
    assert.equal(network,0,'分類・図・計画でAIや外部APIを呼ばない');
  });
}
test('公開胃がん事例: 術式と家族歴を病名にせず、治療矢印を疾患へ向ける', () => {
  const app=loadApp();
  const sourceText=fs.readFileSync(path.join(__dirname,'fixtures/public-cases/gastric-contract.txt'),'utf8');
  const items=Array.from(app.classifyTextByRules(sourceText)).map((c,i)=>({...c,id:`gastric-${i}`}));
  const map=app.buildRelationMapFromRecord({id:'public-gastric',sourceText,items,carePlans:{},selectedDiagnosisIds:[],diagnosisCandidates:[]});
  const disease=map.nodes.filter(n=>n.type==='disease');
  assert.equal(disease.length,1);
  assert.match(disease[0].label,/^胃がん/);
  assert.doesNotMatch(disease[0].label,/術|前立腺/);
  const surgery=map.nodes.find(n=>n.type==='treatment'&&/胃全摘/.test(n.label));
  assert.ok(surgery);
  assert.ok(map.edges.some(e=>e.source===surgery.id&&e.target===disease[0].id&&e.relation==='treats'));
  assert.ok(!map.edges.some(e=>e.source===disease[0].id&&e.target===surgery.id));
});
test('診断欄が術式だけ・がんの記載が家族歴だけなら、本人のがんを推測で作らない', () => {
  const app=loadApp(), sourceText='氏名：Q氏 58歳 男性\n診断名：腹腔鏡下胃全摘術予定\n家族歴：父は前立腺がん、祖母は胃がん';
  const items=Array.from(app.classifyTextByRules(sourceText)).map((c,i)=>({...c,id:`family-${i}`}));
  const map=app.buildRelationMapFromRecord({id:'family-only',sourceText,items,carePlans:{},selectedDiagnosisIds:[],diagnosisCandidates:[]});
  assert.equal(map.nodes.filter(n=>n.type==='disease').length,0);
});
test('単位に続く説明の数値は推移表へ転記せず、実測値は残す', () => {
  const app=loadApp();
  for(const text of ['K 3.4mEq/Lのため指示を確認した。','SpO2 94%に上昇。','SpO2 92%まで低下。']) assert.equal(app.parseLabTrendEntries(text),null,text);
  assert.equal(app.parseLabTrendEntries('K 3.4mEq/L')[0].value,'3.4');
  assert.equal(app.parseLabTrendEntries('SpO2 94%')[0].value,'94');
});
