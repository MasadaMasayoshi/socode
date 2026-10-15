const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();
const rec = (o) => Object.assign({ at: '2026-01-01T10:00', achievement: '', doneItems: [], doneText: '', response: '', evaluation: '', revision: '' }, o);
const kinds = (cp) => Array.from(app.peQualityWarnings(cp)).map(w => w.kind);
const base = (text, plan) => {
  const cp = { id: 'c', title: 'T', items: [{ id: 'a', text, type: 'o', hendersonIds: [1], timestamp: '' }], carePlans: {}, sourceText: '', myAssessments: {}, missingChecks: {} };
  if (plan) app.createCarePlan(cp, plan);
  return cp;
};

test('no records -> 評価不能（情報不足）, never 達成', () => {
  assert.strictEqual(app.peEvalStatus({ goalShort: '毎日できる', records: [] }).label, '評価不能（情報不足）');
  assert.strictEqual(app.peEvalStatus({ records: [rec({ achievement: 'unevaluable' })] }).label, '評価不能（情報不足）');
  assert.strictEqual(app.peEvalStatus({ goalShort: '説明できる', records: [rec({ achievement: 'achieved' })] }).label, '達成');
  assert.strictEqual(app.peEvalStatus({ records: [rec({ achievement: 'partial' })] }).label, '一部達成');
  assert.strictEqual(app.peEvalStatus({ records: [rec({ achievement: 'not' })] }).label, '未達成');
});

test('repeated-success goal: one success is not 達成', () => {
  assert.strictEqual(app.peRepeatNeed('3回連続で実施できる'), 3);
  assert.strictEqual(app.peRepeatNeed('入院中に自分で説明できる'), 0);
  const one = app.peEvalStatus({ goalShort: '3回連続で実施できる', records: [rec({ achievement: 'achieved', evaluation: '1回できた' })] });
  assert.strictEqual(one.label, '一部達成'); assert.ok(one.unconfirmed && one.evidence.length === 1);
  const three = app.peEvalStatus({ goalShort: '3回連続で実施できる', records: [1, 2, 3].map(d => rec({ at: `2026-01-0${d}T10:00`, achievement: 'achieved' })) });
  assert.strictEqual(three.label, '達成');
});

test('condition improvement alone does not satisfy a self-care goal; counterexample passes', () => {
  const mk = (ev) => { const cp = base('創部の観察', { problem: '知識不足', goalShort: '創部を自分で観察できる', op: ['観察'], tp: ['指導'], ep: ['説明'] });
    const p = app.carePlanList(cp)[0]; p.records = [rec({ achievement: 'achieved', evaluation: ev })]; return cp; };
  assert.ok(kinds(mk('CRPが低下し創部サイズが縮小')).includes('conditionVsSelfCare'));
  assert.ok(!kinds(mk('自分で創部を観察し説明できた。CRPも低下')).includes('conditionVsSelfCare'));
});

test('実施済み without implementation record is flagged; with record is not', () => {
  const cp = base('x', { problem: '転倒リスク', op: ['a'], tp: ['b'], ep: ['c'], status: 'done' });
  assert.ok(kinds(cp).includes('noImplementation'));
  app.carePlanList(cp)[0].records = [rec({ doneText: '環境整備を実施' })];
  assert.ok(!kinds(cp).includes('noImplementation'));
});

test('lab series: reversed order, contradictory trend, infection claim', () => {
  const rev = Array.from(app.peLabSeriesWarnings('CRP 5/3 8.0 5/1 12.0')).map(w => w.kind);
  assert.ok(rev.includes('labReversed'));
  assert.ok(Array.from(app.peLabSeriesWarnings('CRP 5/1 4.0 5/3 9.0 改善')).some(w => w.kind === 'labTrend'));
  assert.strictEqual(app.peLabSeriesWarnings('CRP 5/1 12.0 5/3 8.0 改善').length, 0);
  assert.strictEqual(app.peLabSeriesWarnings('Alb 5/1 3.0 5/3 3.5 改善').length, 0);
  assert.ok(Array.from(app.peLabSeriesWarnings('CRPが低下したので感染は否定できる')).some(w => w.kind === 'infectionRuledOut'));
  assert.strictEqual(app.peLabSeriesWarnings('CRPが低下。感染の有無は症状と合わせて判断').length, 0);
});

test('problem without supporting findings; 便秘 with no elimination data; counterexample', () => {
  assert.ok(kinds(base('NRS 0。食事摂取良好', { problem: '急性疼痛', op: ['a'], tp: ['b'], ep: ['c'] })).includes('noSupport'));
  assert.ok(kinds(base('食事摂取良好', { problem: '便秘', op: ['a'], tp: ['b'], ep: ['c'] })).includes('noSupport'));
  assert.ok(!kinds(base('排便3日なし。腹部膨満', { problem: '便秘', op: ['a'], tp: ['b'], ep: ['c'] })).includes('noSupport'));
  assert.ok(!kinds(base('NRS 6 創が痛い', { problem: '急性疼痛', op: ['a'], tp: ['b'], ep: ['c'] })).includes('noSupport'));
});

test('plan mentions findings absent from records; duplicates; contradictions', () => {
  assert.ok(kinds(base('食事摂取良好', { problem: '安楽の変調', op: ['創部痛の観察'], tp: ['b'], ep: ['c'] })).includes('planBeyondRecords'));
  assert.ok(!kinds(base('創部が痛い', { problem: '安楽の変調', op: ['創部痛の観察'], tp: ['b'], ep: ['c'] })).includes('planBeyondRecords'));
  assert.ok(kinds(base('x', { problem: '転倒リスク', op: ['歩行の確認', '歩行の確認。'], tp: ['b'], ep: ['c'] })).includes('duplicate'));
  const cp = base('x', { problem: '転倒リスク', op: ['a'], tp: ['b'], ep: ['c'] });
  app.carePlanList(cp)[0].records = [rec({ achievement: 'achieved', evaluation: 'ok' }), rec({ achievement: 'not', evaluation: 'ng' })];
  assert.ok(kinds(cp).includes('contradiction'));
});

test('export carries status and warnings with the four fields; warnings never alter saved data', () => {
  const cp = base('食事摂取良好', { problem: '便秘', op: ['a'], tp: ['b'], ep: ['c'] });
  const before = JSON.stringify(cp);
  const t = app.buildPlanEvaluationText(cp);
  assert.ok(t.includes('評価状態：評価不能（情報不足）'));
  ['問題箇所：', '根拠：', '修正案：', '確認が必要な情報：'].forEach(s => assert.ok(t.includes(s), s));
  assert.ok(app.buildPlanEvaluationHtml(cp, 9).includes('確認が必要な情報'));
  assert.strictEqual(JSON.stringify(cp), before);
});
