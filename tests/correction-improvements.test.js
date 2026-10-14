'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers');
const app = loadApp();

test('manual edit still matches when only an unknown date was resolved', () => {
  const src = [{ text: '日常生活は自立している', timestamp: '入院前', type: 'o' }];
  const saved = { text: '日常生活は自立している', timestamp: '日時不明', type: 'o' };
  const hit = app.currentRuleCardForSavedItem(src, saved);
  assert.ok(hit && hit.timestamp === '入院前');
});
test('different dated records never match by relaxed rule', () => {
  const src = [{ text: '日常生活は自立している', timestamp: '10/2', type: 'o' }];
  const saved = { text: '日常生活は自立している', timestamp: '10/1', type: 'o' };
  assert.ok(!app.currentRuleCardForSavedItem(src, saved));
});
test('correction request lists rule counts and unmatched manual edits', () => {
  const mk = (id, text) => ({ id, text, type: 'unnecessary', timestamp: '日時不明', hendersonIds: [], ruleDecision: { ruleId: 'source.structure', reason: 'x', version: 'v' }, editLog: [{ kind: 'type', actor: 'user' }] });
  const cp = { title: 'T', items: [mk('1', '項目名A'), mk('2', '項目名B')], droppedManualEdits: [{ text: '失われた記録', timestamp: '日時不明', type: 'o', hendersonIds: [4] }] };
  const out = app.buildReviewRequestText(cp, '', false);
  assert.ok(/同じルールのカード 2件/.test(out));
  assert.ok(/引き継げなかった手動修正/.test(out) && /失われた記録/.test(out));
});
