'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const card = (id, text, hId, extra = {}) => ({ id, text, type: 'o', timestamp: '日時不明', hendersonIds: [hId], editLog: [{ kind: 'tagAdd', hId, actor: 'user' }], ...extra });

test('proposes a keyword from a manual tag the auto rules missed', () => {
  const r = app.buildImprovementProposals({ items: [card('1', 'ブルーライト対策を意識している', 9)] });
  assert.ok(r.length >= 1 && r.every(p => p.hendersonId === 9 && p.keyword.length >= 2));
});
test('contested keywords and disease background cards are never proposed', () => {
  const removed = { id: '2', text: 'ブルーライト対策なし', type: 'o', hendersonIds: [], editLog: [{ kind: 'tagRemove', hId: 9, actor: 'user' }] };
  assert.strictEqual(app.buildImprovementProposals({ items: [card('1', 'ブルーライト対策を意識している', 9), removed] }).filter(p => p.keyword.includes('ブルーライト')).length, 0);
  assert.strictEqual(app.buildImprovementProposals({ items: [card('3', 'ブルーライト対策を意識している', 9, { diseaseGeneral: true })] }).length, 0);
});
test('cards without manual tag additions produce no proposals', () => {
  assert.strictEqual(app.buildImprovementProposals({ items: [{ id: '4', text: '発熱あり', type: 'o', hendersonIds: [7], editLog: [] }] }).length, 0);
});
