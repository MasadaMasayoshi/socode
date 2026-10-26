'use strict';
// Care-plan knowledge table: non-binding "consider adding" suggestions in the plan review; never edits the plan;
// rows count as existing knowledge for knowledge requests.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const cp0 = () => ({ id: 'p', title: 'T', items: [], carePlans: {}, sourceText: '', myAssessments: {}, missingChecks: {} });
const knowledge = plan => {
  const cp = cp0();
  const made = app.createCarePlan(cp, plan);
  const before = JSON.stringify(app.carePlanList(cp)[0]);
  const r = app.reviewCarePlan(cp, app.carePlanList(cp)[0]);
  assert.equal(JSON.stringify(app.carePlanList(cp)[0]), before, 'review never edits the plan');
  return r.items.find(i => i.key === 'knowledge');
};

test('a plan whose problem matches a row gets suggestions for missing OP/TP/EP points, with sources', () => {
  const k = knowledge({ problem: '光線過敏症に関連した皮膚障害リスク', op: ['体温測定'], tp: [], ep: [] });
  assert.ok(k, 'knowledge item present');
  assert.equal(k.level, 'info');
  assert.ok(k.msgs.every(m => /知識（参考）/.test(m) && /出典：/.test(m) && /診断ではありません/.test(m)));
  assert.deepEqual(Array.from(new Set(k.knowledge.map(x => x.section))), ['OP', 'TP', 'EP']);
});

test('a point already written in that section is not suggested again', () => {
  const k = knowledge({ problem: '光線過敏症', op: ['日光にあたった状況と発疹の分布を観察する'], tp: ['日焼け止めと帽子で遮光する'], ep: ['季節を問わず遮光を続ける', '日光を浴びたあとの症状を記録する'] });
  assert.equal(k, undefined);
});

test('a partly written plan only gets the missing section', () => {
  const k = knowledge({ problem: '関節痛', op: ['痛みの部位・程度をNRSで観察', '腫脹・熱感・可動域'], tp: ['鎮痛薬を与薬し効果を確認する', '動作を工夫する'], ep: [] });
  assert.deepEqual(Array.from(k.knowledge, x => x.section), ['EP']);
});

test('an unrelated problem gets no knowledge suggestion', () => {
  assert.equal(knowledge({ problem: '特殊な看護問題Z', op: [], tp: [], ep: [] }), undefined);
});

test('knowledge rows count as existing knowledge for knowledge requests', () => {
  assert.ok(app.CARE_PLAN_KNOWLEDGE.length >= 17);
  assert.ok(app.CARE_PLAN_KNOWLEDGE.every(r => r.source.length && r.op.length && r.tp.length && r.ep.length));
  const cp = Object.assign(cp0(), { relationMap: { nodes: [{ id: 'n1', type: 'nursing_problem', label: '光線過敏症に関連した皮膚障害', priority: 1 }], edges: [] } });
  assert.ok(!app.buildKnowledgeRequests(cp).some(r => r.kind === 'plan-missing'));
  const cp2 = Object.assign(cp0(), { relationMap: { nodes: [{ id: 'n1', type: 'nursing_problem', label: '特殊な看護問題Z', priority: 1 }], edges: [] } });
  assert.ok(app.buildKnowledgeRequests(cp2).some(r => r.kind === 'plan-missing'));
});
