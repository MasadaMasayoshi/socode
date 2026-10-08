'use strict';
// 看護計画は記録から自動で作る（AIなし）。手で消した計画は作り直さない
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();

const mkCp = () => ({ id: 'p', title: 'A', myAssessments: {}, carePlans: {}, items: [
  { id: 'a', type: 'o', text: '創部痛あり NRS 7 離床できず', timestamp: '術後1日目', hendersonIds: [4, 5], assessmentCols: { 4: 'postadmission', 5: 'postadmission' } },
  { id: 'b', type: 's', text: '「痛くて眠れない」', timestamp: '術後1日目', hendersonIds: [5], assessmentCols: { 5: 'postadmission' } },
  { id: 'c', type: 'o', text: 'SpO2 90% 酸素2L 呼吸困難あり', timestamp: '術後1日目', hendersonIds: [1], assessmentCols: { 1: 'postadmission' } }
] });

test('記録から看護計画が自動で作られ、2回目は重複せず、消した計画は作り直されない', () => {
  const cp = mkCp();
  const n = app.autoBuildCarePlans(cp, { notify: false });
  assert.ok(n > 0, '自動で作られる');
  const list = app.carePlanList(cp);
  assert.equal(list.length, n);
  assert.ok(list.every(p => p.problem && (p.op.length || p.tp.length || p.goalShort)), '目標やOP/TPの手本が入る');
  assert.equal(app.autoBuildCarePlans(cp, { notify: false }), 0, '2回目は増えない');
  const gone = list[0];
  app.deleteCarePlan(cp, gone.id);
  assert.equal(app.autoBuildCarePlans(cp, { notify: false }), 0, '消した計画は戻らない');
  assert.ok(!app.carePlanList(cp).some(p => p.problem === gone.problem));
});

test('カードが無い患者では何も作らない', () => {
  assert.equal(app.autoBuildCarePlans({ id: 'q', items: [], carePlans: {}, myAssessments: {} }, { notify: false }), 0);
});
