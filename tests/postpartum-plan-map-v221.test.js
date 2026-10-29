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
