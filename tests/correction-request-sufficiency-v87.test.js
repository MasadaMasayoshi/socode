const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();
const cp = () => ({ id: 'p', title: 'T', sourceText: '術後排便なし 腹部膨満あり', items: [
  { id: 'a', type: 'o', text: '術後排便なし 腹部膨満あり', timestamp: '術後1日目', hendersonIds: [3], assessmentCols: { 3: 'postadmission' } },
  { id: 'm', type: 'o', text: '普段の排便の間隔', timestamp: '日時不明', hendersonIds: [3], assessmentCols: { 3: 'missing' } }], myAssessments: {}, carePlans: {}, missingChecks: {} });

test('the instruction block asks for the sufficiency evaluation', () => {
  const t = app.correctionRequestInstructionsText();
  assert.ok(t.includes('【充足・未充足の評価】'));
  assert.match(t, /C\. Sufficiency evaluation: also EVALUATE the app's sufficiency judgments/);
  assert.match(t, /Do not invent facts; write 確認不能 where the evidence is absent/);
});

test('the judgments section uses the unchanged sufficiency sentences, evidence refs and missing items', () => {
  const c = cp();
  const out = app.sufficiencyJudgmentsText(c);
  assert.ok(out.includes('【アプリの充足状態の判定】'));
  assert.ok(out.includes('■ 3. 排泄') && !out.includes('■ 1. 呼吸'));
  assert.ok(out.includes(app.sufficiencyPhaseText(c, 3, 'postop')), 'same text as the existing exported wording');
  assert.ok(out.includes('判定：未充足／判定根拠：O-1（術後排便なし 腹部膨満あり）のため、排泄は未充足である。'));
  assert.match(out, /根拠カード：O-1/);
  assert.ok(out.includes('不足情報／確認したい情報：普段の排便の間隔'));
});

test('the section is absent when no judgment exists, and appears in both exports', () => {
  assert.strictEqual(app.sufficiencyJudgmentsText({ id: 'q', items: [], myAssessments: {} }).includes('判定：未充足'), false);
  assert.match(app.sufficiencyJudgmentsText(cp()), /すべての時期が情報不足の項目：/);
  const c = cp();
  assert.ok(app.buildReviewRequestText(c, c.sourceText, false).includes('【アプリの充足状態の判定】'));
  assert.ok(app.buildSelectedCardsExportText(c, ['a'], c.sourceText, false).includes('【アプリの充足状態の判定】'));
});
