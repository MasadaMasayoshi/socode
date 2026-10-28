'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const mk = (id, text, label) => ({ id, type: 's', text, fieldLabel: label, timestamp: label, hendersonIds: [5], assessmentCols: { 5: 'postadmission' } });
const verdict = items => app.judgeSufficiencyByRules({ id: 'p', items, myAssessments: {} })[5].post.verdict;

test('一般条件: 前日の未充足は、最新日が改善なら履歴として扱う（睡眠・痛みに限らない）', () => {
  assert.notEqual(verdict([mk('a', '「昨夜はあまり眠れなかった」「腕と腰の痛みがあります」', '産褥1日目'), mk('b', '「腕と腰の痛みは随分軽くなりました」「昨夜はよく眠れた」', '産褥2日目')]), 'unmet');
});
test('反例: 最新日も未充足なら未充足のまま', () => {
  assert.equal(verdict([mk('a', '「昨夜はよく眠れた」', '産褥1日目'), mk('b', '「昨夜は眠れなかった」「痛みがあります」', '産褥2日目')]), 'unmet');
});
test('反例: 経過日が読めないときは従来どおり（最新を決められない）', () => {
  assert.equal(verdict([mk('a', '「眠れなかった」「痛みがあります」', ''), mk('b', '「痛みは軽くなりました」「よく眠れた」', '')]) === 'met', false);
});
test('反例: 改善でも否定が続く場合は改善とみなさない', () => {
  assert.equal(app.sufficiencyCardVerdict({ text: '「痛みが改善せず、眠れない」', type: 's' }, 5, 'post').v, 'unmet');
});
