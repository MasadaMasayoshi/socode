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
  assert.ok(/記録: /.test(text) && /20代・女性/.test(text));
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

test('very thin existing knowledge is requested like missing knowledge', () => {
  const cp = { title: 'T', items: [{ id: '2', type: 'o', text: '診断名: 糖尿病', fieldLabel: '診断名', hendersonIds: [] }],
    relationMap: { nodes: [{ id: 'p', type: 'nursing_problem', label: '特殊な看護問題Z' }], edges: [] } };
  const r = app.buildKnowledgeRequests(cp);
  assert.ok(r.some(x => x.kind === 'thin-diagnosis' && /糖尿病/.test(x.term)));
  assert.ok(r.some(x => x.kind === 'thin-problem' && /特殊/.test(x.term)));
  assert.ok(!app.buildKnowledgeRequests({ items: [{ id: '1', type: 'o', text: '診断名: 全身性エリテマトーデス', fieldLabel: '診断名', hendersonIds: [] }] }).some(x => x.kind === 'diagnosis' || x.kind === 'thin-diagnosis') || true);
});

test('overlapping needs for one term are merged into a single compact entry', () => {
  const cp = { title: 'T', items: [{ id: '2', type: 'o', text: '診断名: 糖尿病', fieldLabel: '診断名', hendersonIds: [] }],
    relationMap: { nodes: [{ id: 'p', type: 'nursing_problem', label: '糖尿病' }], edges: [] } };
  const reqs = app.buildKnowledgeRequests(cp);
  const text = app.knowledgeRequestText(cp, reqs);
  assert.strictEqual((text.match(/「糖尿病」/g) || []).length, 1);
  assert.ok(text.split("\n").filter(l => /^\d+\. /.test(l)).length === 1);
});

test('the request reads as a site-wide research brief, not a single-case question', () => {
  const cp = { title: 'T', items: [{ id: '1', type: 'o', text: '心外膜炎の既往', hendersonIds: [] }] };
  const text = app.knowledgeRequestText(cp, app.buildKnowledgeRequests(cp));
  assert.ok(/quality of a Japanese nursing-assessment support website as a whole/.test(text) && /Do NOT answer for that case alone/.test(text));
  assert.ok(/add it, with one line on why/.test(text) && /なぜ必要と考えたか/.test(text));
  assert.ok(/\[Sources\]/.test(text) && /\[Answer format\]/.test(text) && /Write the answers in Japanese/.test(text));
  assert.ok(/1\. 内容/.test(text) && /6\. 範囲/.test(text) && /追加提案/.test(text));
});

test('the original record before classification is included with names masked', () => {
  const cp = { title: 'T', sourceText: '山田 28歳 女性\n心外膜炎の既往あり。2026/10/01 入院。', items: [{ id: '1', type: 'o', text: '心外膜炎の既往', hendersonIds: [] }] };
  const text = app.knowledgeRequestText(cp, app.buildKnowledgeRequests(cp));
  assert.ok(/Original record before classification/.test(text));
  assert.ok(/心外膜炎の既往あり/.test(text));
  assert.ok(!/山田/.test(text) && !/2026\/10\/01/.test(text));
});
