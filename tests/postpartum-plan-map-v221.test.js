const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers');
const SRC = `産褥2日目。経腟分娩後の褥婦。
経腟分娩後、会陰切開あり。母乳が出るか心配で、夜中に赤ちゃんが泣くと眠れない。
排便はまだない。腹部膨満感が軽度ある。
31歳女性。初産婦。`;
test('産褥期の記録から病態ノードが作られ、関連図が短くならない（母子・母乳の語で家族扱いされない）', () => {
  const a = loadApp();
  const items = Array.from(a.classifyTextByRules(SRC)).map((c, i) => ({ ...c, id: 'c' + i }));
  const m = a.buildRelationMapFromRecord({ id: 'p', title: 'D', sourceText: SRC, items, carePlans: [], myAssessments: {} });
  const nodes = Array.from(m.nodes);
  assert.ok(nodes.some(n => n.type === 'disease' && /産褥/.test(n.label)));
  assert.ok(nodes.length >= 9, 'nodes ' + nodes.length);
});
test('短期目標だけの自動計画に長期目標が補われる', () => {
  const a = loadApp();
  assert.match(a.cpDeriveLongGoal('3日後までに、排便があり腹部の張りが強くならない'), /^退院までに、排便があり/);
  assert.strictEqual(a.cpDeriveLongGoal(''), '');
});
test('大腿骨骨折：診断の記載がなくても、記録の病名から診断ノードが作られ、他のノードとつながる', () => {
  const a = loadApp();
  const SRC2 = '右大腿骨頸部骨折で入院し、人工骨頭置換術を施行した。\n動かすと右足が痛い。荷重をかけると疼痛が増強し、車椅子への移乗は中止した。\n術後に創部痛があり、鎮痛薬を使用した。';
  const items = Array.from(a.classifyTextByRules(SRC2)).map((c, i) => ({ ...c, id: 'c' + i }));
  const m = a.buildRelationMapFromRecord({ id: 'p', title: 'D', sourceText: SRC2, items, carePlans: [], myAssessments: {} });
  const d = Array.from(m.nodes).find(n => n.type === 'disease');
  assert.ok(d && /大腿骨/.test(d.label));
});
test('骨折の高齢患者：加齢→骨密度低下→骨折が示され、身体可動性障害は観察の四角でなく体動の制限から出る', () => {
  const a = loadApp();
  const SRC3 = '76歳女性。右大腿骨頸部骨折で入院し、人工骨頭置換術を施行した。\n創部痛があり、動かすと手術したところが痛い。\n看護師の見守りでゆっくりと車いすに移乗、痛み増強する。右下肢は免荷の指示。';
  const items = Array.from(a.classifyTextByRules(SRC3)).map((c, i) => ({ ...c, id: 'c' + i }));
  const m = a.buildRelationMapFromRecord({ id: 'p', title: 'D', sourceText: SRC3, items, carePlans: [], myAssessments: {} });
  const N = new Map(Array.from(m.nodes).map(n => [n.id, n]));
  const E = Array.from(m.edges);
  const bone = Array.from(m.nodes).find(n => /骨密度/.test(n.label));
  assert.ok(bone && bone.source === 'knowledge', '骨密度の低下は一般知識の仕組みとして示す');
  assert.ok(E.some(e => N.get(e.source).type === 'patient_fact' && e.target === bone.id));
  assert.ok(E.some(e => e.source === bone.id && N.get(e.target).type === 'disease'));
  const p = Array.from(m.nodes).find(n => /身体可動性障害/.test(n.label));
  assert.ok(p);
  E.filter(e => e.target === p.id).forEach(e => assert.notEqual(N.get(e.source).type, 'symptom', '観察の四角から直接つながない'));
});
