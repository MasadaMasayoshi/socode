'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const mk = src => { const items = Array.from(app.classifyTextByRules(src)).map((c, i) => ({ ...c, id: 'c' + i })); return { id: 'p', sourceText: src, items, carePlans: [], myAssessments: {} }; };
const SRC = '産褥2日目の褥婦。\n児の抱き方やおむつ交換は慣れてきた様子である。\n妊娠30週: Hb 10.2 g/dL\n妊娠17週 Hb10.2g/dlで鉄剤内服\n生後2日目:哺乳行動活発 手足を活発に動かしている';
test('内部の解析は元のカードを変えず、事実・主語・時期を示す', () => {
  const cp = mk(SRC); const before = JSON.stringify(cp.items);
  const i = cp.items.find(x => /おむつ交換/.test(x.text));
  const a = app.cardInternalAnalysis(cp, i.id);
  assert.equal(a.original, i.text);
  assert.ok(a.facts.length >= 1);
  assert.match(app.cardInternalAnalysisText(cp, i.id), /変更しません/);
  assert.equal(JSON.stringify(cp.items), before);
});
test('新生児の所見は母親の欲求に結ばれない（連想タグでも）', () => {
  const cp = mk(SRC);
  const n = cp.items.find(x => /哺乳行動/.test(x.text));
  assert.deepEqual(Array.from(n.hendersonIds || []), []);
});
test('品質監査：食い違い・未完成の計画を指摘し、重要な未解決があれば完成としない', () => {
  const cp = mk(SRC);
  cp.carePlans = [];
  const r = app.auditExportQuality(cp);
  assert.ok(r.findings.some(f => f.area === '記録の食い違い'));
  const withPlan = { ...cp, carePlans: { p1: { id: 'p1', problem: '便秘', status: 'planned', source: 'rules', goalShort: '', goalLong: '', op: [], tp: [], ep: [], evidence: [], relatedNeeds: [3], records: [] } } };
  const r2 = app.auditExportQuality(withPlan);
  assert.equal(r2.complete, false);
  assert.match(app.auditExportQualityText(withPlan), /完成とは言えません/);
});
