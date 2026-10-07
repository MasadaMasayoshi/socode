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

test('AI判定：根拠のカードが出せない判断は採用せず、自分で選んだ項目は上書きしない', () => {
  const mk = (id, t, n) => ({ id, type: 'o', text: t, timestamp: '術後1日目', hendersonIds: n, assessmentCols: {} });
  const cp = { id: 'p', items: [mk('a', 'SpO2 98%', [1]), mk('b', '術後排便なし', [3])], myAssessments: {} };
  const ev = { byCode: new Map([['C1', { id: 'a' }], ['C2', { id: 'b' }]]), byId: new Map() };
  const json = JSON.stringify({ needs: [
    { id: 1, verdict: 'met', reason: 'SpO2 98%で基準内', evidence: ['C1'] },
    { id: 3, verdict: 'unmet', reason: '排便なし', evidence: ['C1'] }, // C1は3の項目のカードではない → 判定できない
    { id: 5, verdict: 'unmet', reason: '根拠なし', evidence: [] }
  ] });
  const res = app.parseSufficiencyJson(json, ev, cp);
  assert.equal(res[1].verdict, 'met');
  assert.equal(res[3].verdict, 'unknown');
  assert.equal(res[5].verdict, 'unknown');
  const e1 = app.ensureMyAssessment(cp, 1); e1.sufficiency = 'unmet'; e1.sufficiencyBy = 'user';
  const r = app.applySufficiencyResult(cp, res);
  assert.equal(app.getSufficiency(cp, 1), 'unmet'); // 自分の判断を残す
  assert.equal(r.kept, 1);
  assert.equal(r.unknown, 2);
  const p = app.buildSufficiencyPrompt(cp, ev, cp.items);
  assert.match(p, /■ 1\.呼吸/);
  assert.match(p, /根拠が出せないときは unknown/);
});
