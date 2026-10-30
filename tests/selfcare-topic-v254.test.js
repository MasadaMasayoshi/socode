const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const cp = src => ({ id: 'p', title: 't', sourceText: src, items: Array.from(app.classifyTextByRules(src)).map((c, i) => ({ ...c, id: 'c' + i })), carePlans: {}, myAssessments: {}, selectedDiagnosisIds: [], diagnosisCandidates: [] });
test('術後の清拭・更衣の介助と痛み・動作制限から、セルフケア不足の問題が導かれる', () => {
  const r = app.crTopicsForNeed(cp('術後1日目\n11:00\n疼痛増強あり。股関節90度以上の屈曲禁止。\n看護師2名で清潔ケア（全身清拭＋陰部洗浄＋更衣）を実施\n「早くお風呂に入りたい」と話す。皮膚のべたつきあり。'), 8);
  assert.equal(r.length, 1);
  assert.equal(r[0].status, 'supported');
  assert.match(app.crProblemLine(r[0]), /痛み.*セルフケア不足/);
});
test('自立して入浴・更衣できている記録だけでは問題にしない（反例）', () => {
  const r = app.crTopicsForNeed(cp('入院前\n入浴：1回/日 自立\n更衣：自立\n歯磨き：毎食後'), 8);
  assert.equal(r.length, 0);
});
test('疼痛の記録がなければ、痛みを原因に挙げない', () => {
  const r = app.crTopicsForNeed(cp('術後1日目\n11:00\n看護師2名で清拭と更衣を実施。べたつきあり。'), 8)[0];
  assert.ok(!r.supported.some(x => x.label === '痛み'));
});
