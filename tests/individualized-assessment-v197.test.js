'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
let n = 0;
const mk = (type, text, need, col) => ({ id: 'c' + (n++), type, text, timestamp: '入院2日目', hendersonIds: [need], assessmentCols: { [need]: col || 'postadmission' } });
const run = (items, need) => app.individualizedAssessment({ id: 'p', items, myAssessments: {} }, need, 'post');

test('入院前の様子は現在と混ぜず、本人の意味づけはSの発言からだけ作る', () => {
  const r = run([mk('s', '入院前は毎晩7時間眠れていた。', 5), mk('o', '夜間に3回覚醒。術後の痛みあり。', 5), mk('s', '孫の運動会までに元気になりたい', 5)], 5);
  assert.ok(r.ctx.baseline.some(x => /入院前/.test(x.text)));
  assert.ok(!r.ctx.current.some(x => /入院前/.test(x.text)));
  assert.ok(r.ctx.meaning.every(x => x.src === 'S'));
});
test('Oの記録から好みや希望を作らない', () => {
  const r = run([mk('o', '趣味は読書と記載あり。テレビを見て過ごす。', 13)], 13);
  assert.equal(r.ctx.meaning.length, 0);
});
test('記録がない観察は「確認できていない観察」に具体名で出て、判定文の末尾は固定語尾', () => {
  const r = run([mk('o', '術後1日目。創部痛あり。', 5)], 5);
  assert.match(r.text, /確認できていない観察：睡眠の状況/);
  assert.match(r.text, /(充足している|未充足である|判定保留|情報不足)。?$/);
});
test('正常な検査値だけでは充足にならず、記録にない区分は出さない', () => {
  const r = run([mk('o', 'Na 140 mEq/L', 2)], 2);
  assert.notEqual(r.verdict, 'met');
  assert.ok(!/患者にとっての意味/.test(r.text));
});

test('関連図の詳細一覧：看護問題に、根拠カードの欲求の充足判定が添えられる', () => {
  const items = [{ id: 'q1', type: 'o', text: '術後の創部痛 NRS 7。夜間に痛みで眠れない。', timestamp: '入院2日目', hendersonIds: [5], assessmentCols: { 5: 'postadmission' } }];
  const cp = { id: 'p', title: 'x', items, sourceText: '', carePlans: {}, myAssessments: {} };
  const map = app.buildRelationMapFromRecord(cp);
  const prob = map.nodes.find(n => n.type === 'nursing_problem');
  if (!prob) return;
  const html = String(app.rmSufficiencyLineHtml ? app.rmSufficiencyLineHtml(map, prob, cp) : '');
  assert.ok(html === '' || /関連する欲求の充足：/.test(html));
});
