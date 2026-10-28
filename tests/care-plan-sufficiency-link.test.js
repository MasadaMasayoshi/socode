'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const mk = (id, text, needs) => ({ id, type: 'o', text, fieldLabel: '', timestamp: '', hendersonIds: needs, assessmentCols: Object.fromEntries(needs.map(n => [n, 'postadmission'])) });
const notes = (items, plan) => Array.from(app.carePlanInlineNotes({ id: 'p', items, myAssessments: {} }, { problem: '#1', evidenceIds: plan, op: [], tp: [], ep: [] }).evidence).join('|');

test('一般条件: 計画の根拠のニーズが「充足」「情報不足」「未充足で根拠が計画に未登録」のときだけ知らせる', () => {
  assert.match(notes([mk('a', '呼吸困難なし、SpO2 97%', [1])], ['a']), /充足/);
  assert.match(notes([mk('a', '喫煙歴あり', [1])], ['a']), /情報不足/);
  assert.match(notes([mk('a', '呼吸困難あり', [1]), mk('b', '息苦しい', [1])], ['b']), /根拠カード/);
});
test('反例: 未充足の根拠が計画に入っていれば知らせない／根拠なしの計画は何も出さない', () => {
  assert.equal(notes([mk('a', '呼吸困難あり', [1])], ['a']), '');
  assert.equal(notes([mk('a', '呼吸困難あり', [1])], []), '');
});
