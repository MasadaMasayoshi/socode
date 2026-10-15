const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();
const mk = (text, n, extra) => ({ id: 'p', title: 'T', sourceText: text, items: [Object.assign({ id: 'a', type: 'o', text, timestamp: '入院3日目', hendersonIds: [n], assessmentCols: { [n]: 'postadmission' } }, extra || {})], myAssessments: {}, carePlans: {}, missingChecks: {} });
const post = (text, n) => app.ruleSufficiencyFor(mk(text, n))[n].post;

test('Barthel: 100 met, under 60 unmet, 60-84 not decided as met, missing -> unknown', () => {
  assert.strictEqual(post('Barthel Index 100点', 4).verdict, 'met');
  assert.strictEqual(post('Barthel Index 45点', 4).verdict, 'unmet');
  assert.notStrictEqual(post('Barthel Index 70点', 4).verdict, 'met');
  assert.notStrictEqual(post('Barthel Index 70点', 4).verdict, 'unmet');
  assert.strictEqual(post('ADLの評価を予定している', 4).verdict, 'unknown');
});

test('Braden: hospital 14 or lower is unmet for 清潔; 18 is not', () => {
  assert.strictEqual(post('ブレーデンスケール 12点', 8).verdict, 'unmet');
  assert.notStrictEqual(post('ブレーデンスケール 18点', 8).verdict, 'unmet');
  assert.strictEqual(post('Braden 16点 在宅', 8).verdict, 'unmet');
});

test('SpO2 / HbA1c / weight loss / Alb: low values unmet, normal values not', () => {
  assert.strictEqual(post('SpO2 86%', 1).verdict, 'unmet');
  assert.notStrictEqual(post('SpO2 97%', 1).verdict, 'unmet');
  assert.strictEqual(post('HbA1c 10.1%', 14).verdict, 'unmet');
  assert.notStrictEqual(post('HbA1c 6.4%', 14).verdict, 'unmet');
  assert.strictEqual(post('6か月で体重6%減少', 2).verdict, 'unmet');
  assert.strictEqual(Array.from(app.sufficiencyScoreRules('6か月で体重2%減少')).length, 0);
  assert.strictEqual(post('Alb 2.8 g/dL', 2).verdict, 'unmet');
  assert.notStrictEqual(post('Alb 4.1 g/dL', 2).verdict, 'unmet');
});

test('a 充足 verdict always has a recorded basis; need-specific, not generalised', () => {
  const r = app.ruleSufficiencyFor(mk('Barthel Index 100点', 4));
  Object.keys(r).forEach(n => Object.keys(r[n]).forEach(k => { if (r[n][k].verdict === 'met') assert.ok(r[n][k].evidence.length > 0, `${n}.${k}`); }));
  const c = mk('Barthel Index 100点。HbA1c 10.5%', 4);
  c.items[0].hendersonIds = [4, 14]; c.items[0].assessmentCols = { 4: 'postadmission', 14: 'postadmission' };
  const rr = app.ruleSufficiencyFor(c);
  assert.strictEqual(rr[4].post.verdict, 'met');
  assert.strictEqual(rr[14].post.verdict, 'unmet');
});

test('cause hint and reference standard appear beside the verdict, sentences unchanged', () => {
  const c = mk('インスリン自己注射の手技を間違える。HbA1c 10.5%', 14);
  const t = app.sufficiencyJudgmentsText(c);
  assert.match(t, /原因のヒント（参考）：[^\n]*知識/);
  assert.match(t, /参考基準：HbA1c 9%以上/);
  assert.ok(t.includes(app.sufficiencyPhaseText(c, 14, 'post')));
  assert.deepStrictEqual(Array.from(app.sufficiencyCauseHint('意欲がなく痛みで動けない')).sort(), ['体力', '意思力']);
  assert.strictEqual(app.sufficiencyCauseHint('良好').length, 0);
});

test('instruction block C asks for basis check and cause hint; existing text kept; notebook revised', () => {
  const t = app.correctionRequestInstructionsText();
  assert.match(t, /Do not reword the existing sufficiency sentences\./);
  assert.match(t, /each 充足 verdict shows a recorded basis/);
  assert.match(t, /体力 \/ 意思力 \/ 知識/);
  assert.match(app.NOTEBOOK_CONTENT_VERSION_MARK, /改訂13$/);
});
