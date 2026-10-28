'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
let n = 0;
const mk = (text, needs) => ({ id: 'c' + (n++), type: 'o', text, fieldLabel: '入院2日目', timestamp: '入院2日目', hendersonIds: needs, assessmentCols: Object.fromEntries(needs.map(x => [x, 'postadmission'])) });
const res = (items, need) => app.judgeSufficiencyByRules({ id: 'p', items, myAssessments: {} })[need];
const verdictOf = (items, need) => { const r = res(items, need); return r && r.post ? r.post.verdict : undefined; };

test('ADLの自立は、身だしなみ・趣味など無関係な欲求の充足根拠にしない', () => {
  assert.notEqual(verdictOf([mk('ADLは自立していた', [10])], 10), 'met');
  assert.notEqual(verdictOf([mk('ADLは自立していた', [11])], 11), 'met');
});
test('反例: ADLの自立は、清潔・排泄・移動などでは従来どおり根拠になる', () => {
  assert.equal(verdictOf([mk('トイレは自立している', [3])], 3), 'met');
});
test('Na・Kの正常値だけで、食事の欲求を充足にしない', () => {
  assert.notEqual(verdictOf([mk('Na 140 mEq/L、K 4.2 mEq/L', [2])], 2), 'met');
});
test('反例: 摂取の記載と一緒なら正常値も支えになる', () => {
  const r = res([mk('食欲良好、全量摂取。Na 140 mEq/L', [2])], 2);
  assert.equal(r.post.verdict, 'met');
});
test('CRP高値だけで、安全の欲求を未充足にしない', () => {
  assert.notEqual(verdictOf([mk('CRP 8.2 mg/dL', [9])], 9), 'unmet');
});
test('反例: 感染の記載と併せたCRP高値は未充足の根拠になりうる', () => {
  assert.equal(verdictOf([mk('創部感染の所見あり。CRP 8.2 mg/dL', [9])], 9), 'unmet');
});

test('血糖110（食後・随時でも起こりうる軽いずれ）は未充足の根拠にしない。空腹時と明記、または大きなずれなら使う', () => {
  assert.equal(Array.from(app.sufficiencyLabRules('血糖 110 mg/dL')).length, 0);
  assert.equal(Array.from(app.sufficiencyLabRules('血糖 220 mg/dL')).some(r => r.v === 'unmet'), true);
});
