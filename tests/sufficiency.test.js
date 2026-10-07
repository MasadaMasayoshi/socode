'use strict';
// 総合アセスメント表：14項目ごとの充足・未充足
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();

test('充足・未充足を選べ、押し直すと未判定に戻り、テキスト書き出しに出る', () => {
  const cp = { id: 'p', items: [], myAssessments: {} };
  assert.equal(app.getSufficiency(cp, 3), '');
  const e = app.ensureMyAssessment(cp, 3);
  e.sufficiency = 'unmet';
  assert.equal(app.getSufficiency(cp, 3), 'unmet');
  assert.match(app.sufficiencyControlHtml(cp, 3), /suf-unmet is-on/);
  assert.match(app.buildMyAssessmentsText(cp), /3\..*【未充足】/);
  assert.match(app.sufficiencySummaryHtml(cp), /未充足 1/);
  assert.equal(app.myAssessmentHasContent(e), true);
});
