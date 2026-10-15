const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();
const cp = () => ({ id: 'p', title: 'T', sourceText: '氏名 : Cさん(仮名)\n年齢 : 40歳、男性\n職業 : 教員\n喫煙 : 20本/日', items: [
  { id: 'n', text: 'Cさん(仮名)', fieldLabel: '氏名', type: 'o', hendersonIds: [], timestamp: '日時不明' },
  { id: 'a', text: '40歳、男性', fieldLabel: '年齢', type: 'o', hendersonIds: [9], patientBackground: null, timestamp: '日時不明' },
  { id: 'j', text: '教員', fieldLabel: '職業', type: 'o', hendersonIds: [12], timestamp: '日時不明' },
  { id: 'x', text: '体温37.0', type: 'o', hendersonIds: [7], timestamp: '日時不明' }], carePlans: {}, myAssessments: {}, missingChecks: {} });

test('the instruction block asks for background factors to be extracted and checked', () => {
  const t = app.correctionRequestInstructionsText();
  assert.ok(t.includes('【患者背景の因子】'));
  assert.match(t, /B\. Background factors: also extract the PATIENT BACKGROUND FACTORS/);
  assert.match(t, /基本情報／医学情報 classification \(classifyPatientBackground\)/);
  assert.match(t, /List every factor that is missing or misclassified together with its source line/);
});

test('the extracted-factors list reflects labelled cards, without names', () => {
  const out = app.backgroundFactorsText(cp());
  assert.ok(out.includes('【アプリが抽出済みの患者背景の因子】'));
  assert.ok(out.includes('・年齢 → 40歳、男性｜医学情報｜9'));
  assert.ok(out.includes('・職業 → 教員｜医学情報｜12'));
  assert.ok(!out.includes('氏名 →') && !out.includes('Cさん') && !out.includes('体温'));
  assert.strictEqual(app.backgroundFactorsText({ items: [] }), '');
});

test('the correction request text carries the instruction and the list, with names masked', () => {
  const c = cp();
  const txt = app.buildReviewRequestText(c, c.sourceText, false);
  assert.ok(txt.includes('B. Background factors') && txt.includes('・年齢 → 40歳、男性'));
  assert.ok(!/Cさん\(仮名\)\s*\n[^\n]*年齢/.test(txt.split('【アプリが抽出済み')[1] || ''));
});
