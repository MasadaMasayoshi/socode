'use strict';
// 看護計画の印刷・PDF書き出し（実施・評価の記録も含む）
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();

test('看護計画の印刷用HTMLに、目標・OP/TP/EP・実施評価の記録が入り、消した計画は入らない', () => {
  const cp = { id: 'p', title: '患者X', items: [], carePlans: {
    a: { id: 'a', problem: '疼痛', relatedNeeds: [4], goalLong: '退院までに歩行できる', goalShort: '3日以内に痛みNRS3以下', op: ['疼痛の程度'], tp: ['鎮痛薬を調整'], ep: ['痛みを伝える'], status: 'active', order: 1,
      records: [{ id: 'r1', at: '2026-10-08T09:00:00.000Z', doneItems: ['鎮痛薬を調整'], doneText: '鎮痛薬を使用', response: '「楽になった」', achievement: 'partial', evaluation: '一部達成', revision: '', responseCardId: '' }] },
    b: { id: 'b', deleted: true, updatedAt: 'x' }
  } };
  const html = app.buildCarePlansPrintHtml(cp);
  assert.match(html, /看護計画・実施・評価/);
  assert.match(html, /#1 疼痛/);
  assert.match(html, /長期目標.*退院までに歩行できる/);
  assert.match(html, /OP（観察計画）.*疼痛の程度/);
  assert.match(html, /実施・評価の記録[\s\S]*鎮痛薬を使用[\s\S]*一部達成/);
  assert.doesNotMatch(html, /<h2>#2 /);
});
