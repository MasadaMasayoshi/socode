'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const cpOf = f => {
  const text = fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');
  const items = app.groupClinicalPhrasesWithTimestamps(text).filter(c => !c.isUnnecessaryBoilerplate).map((c, k) => {
    const ids = Array.from(new Set(app.detectMultipleHendersonTags(c.text))); const col = app.inferAssessmentColumn('', c.timestamp, null);
    return { id: 'i' + k, type: 'o', text: c.text, fieldLabel: c.fieldLabel, timestamp: c.timestamp, hendersonIds: ids, assessmentCols: Object.fromEntries(ids.map(h => [h, col || 'postadmission'])) };
  });
  return { id: f, title: f, items, carePlans: {}, sourceText: text, myAssessments: {}, missingChecks: {} };
};
const graph = f => { const cp = cpOf(f); const m = app.buildRelationMapFromRecord(cp); const by = id => m.nodes.find(n => n.id === id); return { cp, m, by, has: (a, rel, b) => m.edges.some(e => e.relation === rel && by(e.source) && by(e.target) && a.test(by(e.source).label) && b.test(by(e.target).label)) }; };

test('関連図・川崎病：診断ノードから、血管炎→炎症→所見・治療・リスクへ線が出る（スナップショット）', () => {
  const g = graph('kawasaki-5f.txt');
  const dx = g.m.nodes.find(n => n.type === 'disease');
  assert.equal(dx.label, '川崎病');
  assert.ok(g.m.edges.some(e => e.source === dx.id), '診断ノードに出る線がない');
  assert.ok(g.has(/川崎病/, 'causes', /血管の炎症/));
  assert.ok(g.has(/血管の炎症/, 'causes', /急性の炎症反応/));
  assert.ok(g.has(/炎症反応/, 'manifests_as', /発熱/));
  assert.ok(g.has(/血管の炎症/, 'manifests_as', /皮膚・粘膜/));
  assert.ok(g.has(/血管の炎症/, 'predicts', /冠動脈/));
  assert.ok(g.has(/グロブリン/, 'treats', /血管の炎症/));
  assert.ok(g.has(/アスピリン/, 'treats', /炎症反応/));
  assert.ok(g.has(/かゆみ/, 'results_in', /睡眠の妨げ/));
  assert.ok(g.has(/摂取低下/, 'predicts', /脱水/));
  assert.ok(g.has(/冠動脈/, 'results_in', /心合併症/));
});
test('関連図：冠動脈病変は「リスク」であり患者の所見として作らない／否定された所見を根拠にしない', () => {
  const g = graph('kawasaki-5f.txt');
  const cor = g.m.nodes.find(n => /冠動脈病変/.test(n.label));
  assert.equal(cor.type, 'future_risk');
  assert.ok(g.m.edges.filter(e => e.target === cor.id).every(e => ['predicts', 'treats'].includes(e.relation)));
  assert.ok(!g.m.nodes.some(n => n.type === 'symptom' && /認めない$/.test(n.label)));
});
test('関連図：すべての線に正しい種類があり、重複した線・孤立ノードがない（4症例）', () => {
  const keys = new Set(['causes', 'contributes_to', 'results_in', 'treats', 'predicts', 'supports', 'manifests_as', 'contradicts', 'interpreted_as', 'increases_risk_of', 'may_contribute_to', 'improves', 'worsens', 'managed_by', 'addresses', 'preceded_by', 'related_to']);
  ['kawasaki-5f.txt', 'synthetic-gastrectomy-58m.txt', 'synthetic-t1dm-adolescent.txt', 'synthetic-postpartum.txt'].forEach(f => {
    const { m } = graph(f); const deg = new Set(); m.edges.forEach(e => { deg.add(e.source); deg.add(e.target); });
    assert.ok(m.edges.every(e => keys.has(e.relation)), f);
    assert.equal(m.edges.length, new Set(m.edges.map(e => e.source + '>' + e.target)).size, f);
    assert.ok(m.nodes.every(n => deg.has(n.id)), f + ' 孤立');
  });
});
test('関連図：「診断名」欄が無く背景に診断が書かれた記録（1型糖尿病）でも診断ノードから線が出る／胃がんも', () => {
  const t = graph('synthetic-t1dm-adolescent.txt'); const dx = t.m.nodes.find(n => n.type === 'disease');
  assert.match(dx.label, /糖尿病/); assert.ok(t.m.edges.some(e => e.source === dx.id));
  const gc = graph('synthetic-gastrectomy-58m.txt'); const gd = gc.m.nodes.find(n => n.type === 'disease');
  assert.ok(gc.m.edges.some(e => e.source === gd.id));
});
test('関連図：列挙にまとめてかかる否定（「口唇紅潮、咽頭発赤、腹部膨満は認めない」）は列挙の全部を否定する', () => {
  const rm = loadApp();
  const cp = { id: 'n', items: [{ id: 'a', type: 'o', text: '川崎病', fieldLabel: '診断名', timestamp: '入院前', hendersonIds: [], assessmentCols: {} }, { id: 'b', type: 'o', text: '口唇紅潮、咽頭発赤、腹部膨満は認めない', timestamp: '入院時', hendersonIds: [], assessmentCols: {} }], sourceText: '診断名：川崎病', carePlans: {}, myAssessments: {} };
  const m = rm.buildRelationMapFromRecord(cp);
  assert.ok(!m.nodes.some(n => /口腔・口唇の炎症/.test(n.label)));
});
test('ヘンダーソン優先：診断・検査・治療・背景のカードは「その他」でなく、関連する欲求の候補と理由を示す（元のタグも残す）', () => {
  const a = app.hendersonAssociations('白血球　173×10²/mm³'); assert.deepEqual(Array.from(a.map(x => x.need)), [7]);
  assert.ok(a[0].reason.length > 5 && a[0].strength === 'indirect');
  assert.deepEqual(Array.from(app.hendersonAssociations('赤血球沈降速度').map(x => x.need)), [7]);
  assert.equal(app.hendersonAssociations('鑑別診断').length, 0);
  const rows = app.buildTagAuditRows({ items: [{ id: 'x', type: 'o', text: '白血球　173×10²/mm³', timestamp: '入院時', hendersonIds: [] }] });
  assert.equal(rows[0].destination.key, 'henderson-indirect'); assert.equal(rows[0].destination.retained.key, 'labdata');
  assert.equal(rows[0].autoFix, false); assert.match(rows[0].reason, /未充足の証拠ではない/);
});
test('ヘンダーソン優先：どの欲求とも定義上の関連がないカードだけが「ヘンダーソン外」になり、理由を残す', () => {
  const rows = app.buildTagAuditRows({ items: [{ id: 'y', type: 'o', text: '令和7年11月3日', timestamp: '', hendersonIds: [] }] });
  if (rows.length) { assert.equal(rows[0].outsideHenderson, true); assert.match(rows[0].reason, /関連を検討したが/); }
});
