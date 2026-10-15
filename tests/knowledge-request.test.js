'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const base = () => ({ title: 'T', items: [
  { id: '0', type: 'o', text: '氏名: 山田花子', fieldLabel: '氏名', hendersonIds: [] },
  { id: '0b', type: 'o', text: '山田花子 28歳 女性', hendersonIds: [] },
  { id: '1', type: 'o', text: '10/12 山田花子さんは心外膜炎の既往がある', hendersonIds: [] },
  { id: '2', type: 'o', text: '診断名: 成人スチル病', fieldLabel: '診断名', hendersonIds: [] }] });

test('requests carry de-identified source context and a patient summary', () => {
  const cp = base();
  const r = app.buildKnowledgeRequests(cp);
  const term = r.find(x => x.purpose === 'tag' && /心外膜炎/.test(x.term));
  assert.ok(term && term.context.some(c => /心外膜炎/.test(c)));
  const text = app.knowledgeRequestText(cp, r);
  assert.ok(/元の記録/.test(text) && /20代・女性/.test(text));
  assert.ok(!/山田|10\/12/.test(text));
});
test('care-plan and relation-map gaps are requested, not only tagging', () => {
  const cp = base();
  cp.relationMap = { nodes: [{ id: 'p', type: 'nursing_problem', label: '感染リスク状態' }], edges: [] };
  cp.carePlans = { a: { id: 'a', problem: '活動耐性低下', op: ['疲労感'], tp: [], ep: [], order: 1 } };
  const r = app.buildKnowledgeRequests(cp);
  assert.ok(r.some(x => x.purpose === 'plan' && x.kind === 'plan-missing' && /感染/.test(x.term)));
  assert.ok(r.some(x => x.purpose === 'plan' && x.kind === 'plan-section' && /TP/.test(x.question)));
  assert.ok(r.some(x => x.purpose === 'map' && x.kind === 'map-diagnosis' && /スチル病/.test(x.term)));
  assert.ok(r.some(x => x.purpose === 'map' && x.kind === 'mechanism'));
});
test('a well-covered patient produces no requests', () => {
  assert.strictEqual(app.buildKnowledgeRequests({ items: [{ id: '1', type: 'o', text: '発熱あり', hendersonIds: [7] }] }).length, 0);
});
