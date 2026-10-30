const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const map = text => {
  const items = Array.from(app.classifyTextByRules(text)).map((c, i) => ({ ...c, id: 'c' + i }));
  const m = app.buildRelationMapFromRecord({ id: 'p', title: 't', sourceText: text, items, carePlans: {}, selectedDiagnosisIds: [], diagnosisCandidates: [] });
  const lab = Object.fromEntries(m.nodes.map(n => [n.id, n.label]));
  return { m, targets: m.edges.filter(e => /喫煙/.test(lab[e.from || e.source])).map(e => lab[e.to || e.target]) };
};
const base = d => `X氏 70歳男性\n診断名：${d}\n嗜好品\n喫煙：20本/日×40年\n入院後\n10:00\n発熱、咳嗽あり。SpO2 92%。むせあり`;
test('喫煙歴は肺炎の炎症へ、脳梗塞の誤嚥性肺炎リスクへつながる', () => {
  assert.ok(map(base('肺炎')).targets.some(t => /炎症/.test(t)));
  assert.ok(map(base('脳梗塞')).targets.some(t => /誤嚥/.test(t)));
});
test('術後・術前の呼吸器合併症へも喫煙がつながる', () => {
  const t = map('D氏 80歳女性\n診断名：左大腿骨頸部骨折\n人工骨頭置換術を施行\n嗜好品\n喫煙：20本/日×40年\n術後1日目\n10:00\n創部痛あり。').targets;
  assert.ok(t.some(x => /気道の線毛/.test(x)));
});
test('非喫煙なら喫煙ノードを作らない（反例）', () => {
  assert.equal(map(base('肺炎').replace('20本/日×40年', 'なし')).targets.length, 0);
});
