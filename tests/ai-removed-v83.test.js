const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();

test('export checklist has no AI sections but keeps the plan evaluation', () => {
  const keys = app.EXPORT_SECTIONS.map(x => x.key);
  ['contradiction', 'diagnosis', 'timeline', 'aiPlan'].forEach(k => assert.ok(!keys.includes(k), k));
  assert.ok(keys.includes('planEval') && keys.includes('plans') && keys.includes('labs'));
  assert.ok(app.EXPORT_SECTIONS.every(x => !/AI/.test(x.label)));
});

test('stored AI results are never written to the exports', () => {
  const cp = { id: 'p', title: 'T', items: [{ id: 'a', text: '頭痛の訴えあり', type: 's', hendersonIds: [4], timestamp: '' }], carePlans: {}, sourceText: '', myAssessments: {}, missingChecks: {},
    contradictionResult: '<p>古い矛盾結果</p>', diagnosisResult: '<p>古い診断結果</p>', timelineResult: '<p>古い経時結果</p>', carePlanResult: '<p>古い計画結果</p>' };
  const txt = app.buildExportPlainText(cp);
  const html = app.buildExportBodyHtml(cp);
  ['古い矛盾結果', '古い診断結果', '古い経時結果', '古い計画結果'].forEach(w => { assert.ok(!txt.includes(w), w); assert.ok(!html.includes(w), w); });
  assert.ok(!/（AI|AI推定|AI算出/.test(txt));
});

test('loading a record with old AI fields does not throw', () => {
  const raw = { id: 'patient_old', title: '旧データ', items: [{ id: 'i1', text: 'x', type: 'o', aiSuggested: true, timestamp: 'AI推定', hendersonIds: [] }],
    contradictionResult: { bad: 1 }, diagnosisResult: '<p>古い</p>', aiReview: { all: { agree: true } }, myAssessments: { 1: { aiFeedback: '<p>古い助言</p>', aiReview: { all: { agree: false, verdict: 'x' } } } } };
  assert.doesNotThrow(() => app.normalizeImportedPatient(raw, 0));
  assert.doesNotThrow(() => app.buildExportPlainText({ ...raw, carePlans: {}, sourceText: '', missingChecks: {} }));
});

test('image reading (OCR) stays: function, key setting and API labels', () => {
  assert.strictEqual(typeof app.callGeminiAI, 'function');
  assert.strictEqual(typeof app.requestGemini, 'function');
  const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
  assert.match(html, /id="input-api-key"/);
  assert.match(html, /画像の読み取り設定（API）/);
  assert.ok(!/AIに送る前に伏せる語句/.test(html));
});
