// v.265 — regression for the "patient 15" verification (gastrectomy, golden case 胃がん_A氏58歳): general rules, not case branches.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./app-helpers');
const app = loadApp();

const mk = (text, id = 'p') => {
  const items = Array.from(app.classifyTextByRules(text)).map((c, i) => ({ id: 'c' + i, text: c.text, type: c.type, timestamp: c.timestamp, hendersonIds: Array.from(c.hendersonIds), fieldLabel: c.fieldLabel }));
  const cp = { id, title: 'T', sourceText: text, items, myAssessments: {}, carePlans: {}, missingChecks: {}, selectedDiagnosisIds: [], diagnosisCandidates: [] };
  cp.relationMap = app.buildRelationMapFromRecord(cp);
  return cp;
};
const goldenPath = path.join(__dirname, 'golden', 'cases', '胃がん_A氏58歳.txt');
const have = fs.existsSync(goldenPath);
const gold = have ? mk(fs.readFileSync(goldenPath, 'utf8').replace(/\r\n?/g, '\n'), 'p15') : null;
const label = (map, id) => (map.nodes.find(n => n.id === id) || {}).label || '';
const edgesInto = (map, re) => map.edges.filter(e => re.test(label(map, e.target))).map(e => ({ from: label(map, e.source), rel: e.relation, to: label(map, e.target) }));
const chainsText = cp => app.relationMapExportText(cp);

test('患者15：鎮痛薬・オピオイドは創部痛の原因の流れに入らない（治療は原因ではない）', { skip: !have }, () => {
  const t = chainsText(gold);
  assert.ok(gold.relationMap.edges.some(e => e.relation === 'treats'), '治療の矢印そのものは残る');
  assert.doesNotMatch(t, /(?:鎮痛薬|硬膜外PCA|オピオイド|フェンタニル)[^\n]{0,6}→ 創部痛/);
});

test('患者15：オピオイドは副作用の側（腸蠕動の低下）には残る', { skip: !have }, () => {
  assert.match(chainsText(gold), /オピオイド（フェンタニル） → 腸の動き/);
});

test('患者15：HCV抗体（感染症スクリーニング）はライン・体動制限・活動耐性の原因にならない', { skip: !have }, () => {
  const m = gold.relationMap;
  const hcv = m.nodes.filter(n => /HCV/.test(n.label));
  hcv.forEach(n => assert.equal(m.edges.filter(e => e.source === n.id || e.target === n.id).length, 0, 'HCV抗体は因果の矢印を持たない'));
  assert.doesNotMatch(chainsText(gold), /HCV[^\n]*→/);
});

test('患者15：10年前に禁煙した喫煙歴は、現在の線毛機能の低下の原因にしない', { skip: !have }, () => {
  assert.doesNotMatch(chainsText(gold), /喫煙[^\n]*→ 気道の線毛機能/);
  assert.ok(!gold.relationMap.nodes.some(n => /線毛機能の低下・分泌物の増加/.test(n.label)), '喫煙が現在でなければ線毛機能のノードは作らない');
});

test('患者15：同じ記録で現在も喫煙している場合は、従来どおり気道への影響を結ぶ', { skip: !have }, () => {
  const raw = fs.readFileSync(goldenPath, 'utf8').replace(/\r\n?/g, '\n');
  assert.match(raw, /10年前に禁煙した/);
  const cp = mk(raw.replace('10年前に禁煙した', '現在も喫煙を続けている'), 'p15s');
  assert.match(chainsText(cp), /喫煙[^\n]*→ 気道の線毛機能/);
});

test('患者15：術後床上安静と創部痛だけでは「活動耐性低下」を実在の問題にしない（リスク状態にする）', { skip: !have }, () => {
  const probs = gold.relationMap.nodes.filter(n => n.type === 'nursing_problem').map(n => n.label);
  assert.ok(!probs.some(l => /^活動耐性低下（/.test(l)), probs.join('|'));
  const act = gold.relationMap.nodes.find(n => n.type === 'nursing_problem' && /活動耐性低下リスク状態/.test(n.label));
  assert.ok(act, '活動耐性低下リスク状態');
  assert.match(act.evidence, /危険因子：[^／]*術後安静/);
  assert.match(act.evidence, /反証条件：/);
});

test('患者15：絶食と軽度の体重減少・Alb低下だけでは「栄養摂取量不足」を確定せず、リスク状態にする', { skip: !have }, () => {
  const probs = gold.relationMap.nodes.filter(n => n.type === 'nursing_problem').map(n => n.label);
  assert.ok(!probs.some(l => /^栄養摂取量不足（/.test(l)), probs.join('|'));
  const nu = gold.relationMap.nodes.find(n => n.type === 'nursing_problem' && /栄養摂取量不足リスク状態/.test(n.label));
  assert.ok(nu);
  assert.match(nu.evidence, /危険因子：[^／]*絶食/);
  assert.match(nu.evidence, /反証条件：/);
});

test('危険因子と反証条件は書き出しにも出る', { skip: !have }, () => {
  const t = chainsText(gold);
  assert.match(t, /危険因子：[^\n]*／反証条件：/);
});

test('直接の記録がある場合は、従来どおり実在する問題になる（摂取量低下・息切れ・ADL介助）', () => {
  const cp = mk('72歳男性。胃全摘術後3日目。\n術後床上安静。\n食事は2割摂取で、食欲不振がある。体重が3kg減少した。\n動くと息切れがあり、すぐ疲れる。');
  const probs = cp.relationMap.nodes.filter(n => n.type === 'nursing_problem').map(n => n.label).join('|');
  assert.match(probs, /栄養摂取量不足(?!リスク)/);
  assert.match(probs, /活動耐性低下（/);
});

test('他科の知識を混ぜない：胃全摘術の重点アセスメントに脱臼・荷重・入院前の筋力低下を出さない', { skip: !have }, () => {
  for (const need of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) {
    const d = app.buildFocusDraft(gold, need);
    const all = `${d.focusAnalysis}\n${d.focusIntegration}\n${d.focusProblem}`;
    assert.doesNotMatch(all, /脱臼|荷重|入院前からの筋力|筋力（MMT）/, `欲求${need}`);
  }
});

test('他科の知識は、その科の記録があるときだけ出る（股関節手術では脱臼への不安を候補にできる）', () => {
  const cp = mk('入院前は自立していた。\n右大腿骨頸部骨折で人工骨頭置換術を施行した。\n術後1日目 創部痛NRS6。「動くと痛い」と話し、車いす移乗は中止した。');
  const r = app.crTopicsForNeed(cp, 4).find(x => x.topic.id === 'mobility');
  assert.ok(r, 'mobility topic');
  assert.ok(r.possible.concat(r.supported.map(x => x.label)).includes('脱臼への不安'));
});

test('「inoutバランス」「栄養バランス」は筋力・バランスの低下の根拠にならない', () => {
  const cp = mk('胃全摘術後1日目。\n【inoutバランス】in：輸液1300ml、out：出血量105g\n術後床上安静。創部痛NRS2。');
  const r = app.crTopicsForNeed(cp, 4).find(x => x.topic.id === 'mobility');
  assert.ok(!r || !r.supported.some(x => /筋力|バランス/.test(x.label)));
});

test('「HCV」「HBV」の英字に含まれる CV をカテーテルと取り違えない／本物の CV は拾う', () => {
  const a = mk('胃全摘術後。HCV抗体(-)、HBs抗原(-)。\n術後床上安静。');
  assert.ok(!a.relationMap.nodes.some(n => /HCV/.test(n.label) && a.relationMap.edges.some(e => e.source === n.id || e.target === n.id)));
  const b = mk('胃全摘術後。CV挿入中。\n術後床上安静。');
  assert.ok(b.relationMap.nodes.some(n => /CV/.test(n.label)));
});

test('関連図の原因の流れは、治療・管理の矢印をたどらない', () => {
  const map = { nodes: [{ id: 'a', type: 'treatment', label: '鎮痛薬' }, { id: 'b', type: 'symptom', label: '創部痛' }, { id: 'c', type: 'nursing_problem', label: '急性疼痛' }, { id: 'd', type: 'pathophysiology', label: '組織損傷' }], edges: [{ source: 'a', target: 'b', relation: 'treats' }, { source: 'd', target: 'b', relation: 'causes' }, { source: 'b', target: 'c', relation: 'results_in' }] };
  const chains = app.rmCauseChains(map, 'c').map(ch => ch.map(n => n.label).join('>'));
  assert.equal(JSON.stringify(chains), JSON.stringify(['創部痛>組織損傷']));
});
