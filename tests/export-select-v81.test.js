const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();
const mk = () => {
  const cp = { id: 'p', title: 'T', items: [
    { id: 'a', text: '頭痛の訴えあり', type: 's', hendersonIds: [4], timestamp: '' },
    { id: 'b', text: '体温37.0℃', type: 'o', hendersonIds: [7], timestamp: '' }], carePlans: {}, sourceText: '', myAssessments: {}, missingChecks: {} };
  const made = app.createCarePlan(cp, { problem: '急性疼痛', goalShort: '3日以内にNRS3以下', op: ['NRSの確認'], tp: ['鎮痛薬の与薬'], ep: ['痛みを伝える'], status: 'active' });
  return cp;
};

test('section list includes 全計画の評価 and all current sections', () => {
  const keys = app.EXPORT_SECTIONS.map(x => x.key);
  assert.ok(keys.includes('planEval'));
  assert.ok(app.EXPORT_SECTIONS.find(x => x.key === 'planEval').label.includes('全計画の評価'));
  ['labs', 's', 'o', 'missing', 'unclassified', 'henderson', 'own', 'plans', 'contradiction', 'diagnosis', 'timeline', 'aiPlan', 'notes'].forEach(k => assert.ok(keys.includes(k), k));
});

test('selection helper: null means everything, unknown keys are dropped', () => {
  assert.strictEqual(app.exportSectionOn(null, 's'), true);
  assert.strictEqual(app.exportSectionOn(app.exportSelectionFromKeys(['o']), 's'), false);
  assert.strictEqual(app.exportSelectionFromKeys(['o', 'zzz']).size, 1);
});

test('text export: default unchanged, unchecked sections are left out', () => {
  const cp = mk();
  const all = app.buildExportPlainText(cp);
  const same = app.buildExportPlainText(cp, app.exportSelectionFromKeys(app.EXPORT_SECTIONS.map(x => x.key)));
  assert.strictEqual(all.replace(/出力日時: .*/, ''), same.replace(/出力日時: .*/, ''));
  assert.ok(all.includes('頭痛の訴えあり') && all.includes('全計画の評価'));
  const onlyO = app.buildExportPlainText(cp, app.exportSelectionFromKeys(['o']));
  assert.ok(onlyO.includes('体温37.0') && !onlyO.includes('頭痛の訴えあり') && !onlyO.includes('全計画の評価') && !onlyO.includes('急性疼痛'));
  const onlyEval = app.buildExportPlainText(cp, app.exportSelectionFromKeys(['planEval']));
  assert.ok(onlyEval.includes('全計画の評価') && onlyEval.includes('急性疼痛') && !onlyEval.includes('体温37.0'));
});

test('evaluation section lists every plan with its evaluation records', () => {
  const cp = mk();
  app.createCarePlan(cp, { problem: '転倒リスク', op: ['歩行の確認'], tp: ['環境整備'], ep: ['ナースコール'] });
  const plans = app.carePlanList(cp);
  plans[0].records = [{ at: new Date(2026, 0, 2, 9, 0).getTime(), achievement: '', evaluation: '痛みが軽減した', revision: '', doneItems: [], doneText: '', response: '' }];
  const t = app.buildPlanEvaluationText(cp);
  assert.ok(t.includes('急性疼痛') && t.includes('転倒リスク'));
  assert.ok(t.includes('痛みが軽減した') && t.includes('評価の記録なし'));
  const h = app.buildPlanEvaluationHtml(cp, 7);
  assert.ok(h.includes('7. 全計画の評価') && h.includes('痛みが軽減した'));
  assert.strictEqual(app.buildPlanEvaluationText({ ...cp, carePlans: {} }), '');
});

test('HTML export honours the selection', () => {
  const cp = mk();
  const html = app.buildExportBodyHtml(cp, app.exportSelectionFromKeys(['s']));
  assert.ok(html.includes('頭痛の訴えあり') && !html.includes('体温37.0') && !html.includes('全計画の評価'));
  assert.ok(app.buildExportBodyHtml(cp, app.exportSelectionFromKeys(['planEval'])).includes('全計画の評価'));
});
