'use strict';
// Review notes sit next to the care plan text, are rule-based for any patient, and never rewrite the plan.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();

const cp = (text, plan) => ({ id: 'p', title: 't', sourceText: text, items: app.classifyTextByRules(text).map((i, k) => ({ ...i, id: `i${k}` })), carePlans: {}, ...(plan ? { plans: [plan] } : {}) });
const record = '術後1日目\n10:00 胃管は退室時に抜去。創部ドレーン挿入あり。SpO2 99%（酸素 5L/分）。NRS 2。自主的な体動はない。\n【感染症】HCV抗体(-)';

test('Lab results are not accepted as evidence for lines; meal text is not ADL evidence', () => {
  const inf = app.carePlanInlineNotes(cp(record), { problem: '感染リスク状態', evidence: ['血管内・硬膜外のライン：HCV抗体（－）'], op: ['創部の観察'], tp: [], ep: [] });
  assert.ok(inf.evidence.some(m => /HCV/.test(m) && /挿入物/.test(m)));
  const act = app.carePlanInlineNotes(cp(record), { problem: '廃用症候群リスク状態', evidence: ['仕事が忙しく短時間で済ませる'], op: [], tp: [], ep: [] });
  assert.ok(act.evidence.some(m => /食事の記録/.test(m)));
});

test('Removed tube, goal conditions and vague goals get notes without changing the plan text', () => {
  const plan = { problem: '消化管運動機能障害リスク状態', op: ['胃管排液の量・性状'], tp: [], ep: [], goalShort: '3日後までにSpO2 95%以上を保つ。異常時に対応できる' };
  const before = JSON.stringify(plan);
  const n = app.carePlanInlineNotes(cp(record), plan);
  assert.ok(n.op.some(m => /胃管/.test(m)));
  assert.ok(n.goal.some(m => /酸素の投与条件/.test(m)));
  assert.ok(n.goal.some(m => /援助する側/.test(m)));
  assert.ok(n.goal.some(m => /起点/.test(m)));
  assert.equal(JSON.stringify(plan), before);
});

test('A plan without these problems gets no notes', () => {
  const n = app.carePlanInlineNotes(cp(record), { problem: '急性疼痛', op: ['NRS（安静時・体動時）'], tp: [], ep: [], goalShort: '術後2日目までに、体動時のNRSが3以下で深呼吸・起き上がりができる' });
  assert.deepEqual([n.goal.length, n.evidence.length, n.op.length], [0, 0, 0]);
});
