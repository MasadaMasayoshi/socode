'use strict';
// 総合アセスメント表：14項目ごとの充足・未充足（入院前・入院後・全体）
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();

test('充足・未充足を入院前・入院後・全体で別々に選べ、書き出しに出る', () => {
  const cp = { id: 'p', items: [], myAssessments: {} };
  assert.equal(app.getSufficiency(cp, 3), '');
  const e = app.ensureMyAssessment(cp, 3);
  e.sufficiency = 'unmet';
  e.sufficiencyPre = 'met';
  assert.equal(app.getSufficiency(cp, 3, 'pre'), 'met');
  assert.equal(app.getSufficiency(cp, 3, 'post'), '');
  assert.match(app.sufficiencyControlHtml(cp, 3), /suf-unmet is-on/);
  assert.match(app.buildMyAssessmentsText(cp), /3\..*【入院前：充足／全体：未充足】/);
  assert.match(app.sufficiencySummaryHtml(cp), /入院前<\/span><b class="suf-met-n">充足 1</);
  assert.equal(app.myAssessmentHasContent(e), true);
});

test('AI判定：入院前・入院後・全体を別々に入れ、根拠が出せない判断は採用せず、自分で選んだ欄は上書きしない', () => {
  const mk = (id, t, n) => ({ id, type: 'o', text: t, timestamp: '術後1日目', hendersonIds: n, assessmentCols: { [n[0]]: id === 'a' ? 'preadmission' : 'postadmission' } });
  const cp = { id: 'p', items: [mk('a', '普段から咳や息切れなし', [1]), mk('b', 'SpO2 90% 酸素2L', [1]), mk('c', '術後排便なし', [3])], myAssessments: {} };
  const ev = { byCode: new Map([['C1', { id: 'a' }], ['C2', { id: 'b' }], ['C3', { id: 'c' }]]), byId: new Map([['a', 'C1'], ['b', 'C2'], ['c', 'C3']]) };
  const json = JSON.stringify({ needs: [
    { id: 1, pre: { verdict: 'met', reason: '普段は問題なし', evidence: ['C1'] }, post: { verdict: 'unmet', reason: 'SpO2低下', evidence: ['C2'] }, all: { verdict: 'unmet', reason: '術後に援助が必要', evidence: ['C2'] } },
    { id: 3, pre: { verdict: 'met', reason: '根拠が別項目', evidence: ['C1'] }, post: { verdict: 'unmet', reason: '排便なし', evidence: ['C3'] } },
    { id: 5, verdict: 'unmet', reason: '以前の形・根拠なし', evidence: [] }
  ] });
  const res = app.parseSufficiencyJson(json, ev, cp);
  assert.equal(res[1].pre.verdict, 'met');
  assert.equal(res[1].post.verdict, 'unmet');
  assert.equal(res[3].pre.verdict, 'unknown'); // C1 は3のカードではない
  assert.equal(res[3].post.verdict, 'unmet');
  assert.equal(res[5].all.verdict, 'unknown');
  const e1 = app.ensureMyAssessment(cp, 1); e1.sufficiencyPost = 'met'; e1.sufficiencyPostBy = 'user';
  const r = app.applySufficiencyResult(cp, res);
  assert.equal(app.getSufficiency(cp, 1, 'pre'), 'met');
  assert.equal(app.getSufficiency(cp, 1, 'post'), 'met'); // 自分の判断を残す
  assert.equal(app.getSufficiency(cp, 1, 'all'), 'unmet');
  assert.equal(r.kept, 1);
  assert.match(app.sufficiencyTextOf(cp, 1), /入院前：充足／入院後：充足／全体：未充足/);
  assert.match(app.sufficiencyReasonHtml(cp, 1), /自分の判断と異なります/);
  const p = app.buildSufficiencyPrompt(cp, ev, cp.items);
  assert.match(p, /普段から咳.*\{タグ:1前\}/);
  assert.match(p, /SpO2 90%.*\{タグ:1後\}/);
});
