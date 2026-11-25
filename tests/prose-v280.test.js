// v.280 — assessment prose: record sentences are turned into clauses, not pasted; no note-style endings or labels remain
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();

test('記録の言い回しは文として読める形に直す（見出し・時刻・「あり/なし」の体言止めを残さない）', () => {
  const a = app.sufficiencyPlainClause('O: 帰室時の状況：湿性咳嗽時々あり', 40);
  assert.doesNotMatch(a, /帰室時の状況|^O/);
  assert.match(a, /みられる$/);
  const b = app.sufficiencyPlainClause('10:30 創部出血なし', 40);
  assert.doesNotMatch(b, /^\d/);
  assert.match(b, /みられない$/);
});

test('意思表示の分析は、記録の語句を「ことから」に直結させず、不十分な点を分けて述べる', () => {
  const t = app.sufficiencySeparationNote(10, { verdict: 'met', facts: [], now: [{ text: 'のどを示しながら、苦悶の表情', pol: 'met' }] });
  assert.doesNotMatch(t, /表情ことから/);
  assert.match(t, /意思を示すことはできている/);
});

test('食事の分析は、摂取する力と栄養状態を別の面として扱う', () => {
  const t = app.sufficiencySeparationNote(2, { verdict: 'met', facts: [{ text: '朝食全量摂取', pol: 'met' }, { text: '体重59.5kg(1か月で体重2.0kg減)', pol: '' }], now: [] });
  assert.match(t, /食事摂取能力.*栄養状態の面/);
});
