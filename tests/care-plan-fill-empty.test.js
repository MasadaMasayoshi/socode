'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const mkCp = plan => ({ id: 'p', items: [{ id: 'a', type: 'o', text: '疼痛はNRS 2。術後床上安静。', hendersonIds: [4], assessmentCols: { 4: 'postadmission' } }], myAssessments: {}, carePlans: { x: { id: 'x', problem: '急性疼痛（手術創部の侵襲）', status: 'planned', records: [], goalShort: '', goalLong: '', op: [], tp: [], ep: [], ...plan } } });

test('一般条件: 自動で作られた計画の空欄（OP・目標）は手本から補い、書かれた内容は変えない', () => {
  const cp = mkCp({ source: 'rules', tp: ['既存のTP'], ep: ['既存のEP'] });
  app.refineCarePlans(cp);
  const p = cp.carePlans.x;
  assert.ok(p.op.length > 0, 'OPが補われる');
  assert.ok(p.goalShort || p.goalLong, '目標が補われる');
  assert.deepEqual(Array.from(p.tp), ['既存のTP']);
});
test('反例: 利用者が編集した計画の空欄は自動で埋めない', () => {
  const cp = mkCp({ source: 'rules', userEdited: true, tp: ['既存のTP'], ep: ['既存のEP'] });
  app.refineCarePlans(cp);
  assert.equal(cp.carePlans.x.op.length, 0);
});
