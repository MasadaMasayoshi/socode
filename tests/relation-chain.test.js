'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const N = (id, type, label, extra = {}) => ({ id, type, label, ...extra });
test('short and long chains are flagged with the information to confirm', () => {
  const nodes = [N('f', 'patient_fact', '食事摂取量が減った'), N('p1', 'nursing_problem', '栄養摂取量不足', { cat: 'nutr' }), N('a', 'pathophysiology', 'a'), N('b', 'pathophysiology', 'b'), N('c', 'pathophysiology', 'c'), N('d', 'pathophysiology', 'd'), N('e', 'pathophysiology', 'e'), N('g', 'pathophysiology', 'g'), N('h', 'pathophysiology', 'h'), N('p2', 'nursing_problem', '長い問題')];
  const E = (s, t) => ({ source: s, target: t, relation: 'results_in' });
  const chain = ['f', 'a', 'b', 'c', 'd', 'e', 'g', 'h', 'p2'];
  const edges = [E('f', 'p1'), ...chain.slice(0, -1).map((x, i) => E(x, chain[i + 1]))];
  const r = app.rmChainReport({ nodes, edges });
  assert.ok(r.some(x => x.id === 'p1' && x.kind === 'short' && x.need.length > 5));
  assert.ok(r.some(x => x.id === 'p2' && x.kind === 'long'));
});
test('a medium chain is not flagged', () => {
  const nodes = [N('f', 'patient_fact', 'x'), N('a', 'pathophysiology', 'a'), N('b', 'pathophysiology', 'b'), N('p', 'nursing_problem', '問題', { cat: 'act' })];
  const edges = [['f', 'a'], ['a', 'b'], ['b', 'p']].map(([s, t]) => ({ source: s, target: t, relation: 'results_in' }));
  assert.strictEqual(app.rmChainReport({ nodes, edges }).length, 0);
});
