'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const mk = (cards) => ({ id: 'p', items: cards.map((c, i) => ({ id: 'c' + i, type: c.type || 'o', text: c.text, timestamp: c.ts || '術後1日目', hendersonIds: [c.need], assessmentCols: { [c.need]: c.col || 'postadmission' } })), myAssessments: {} });
const verdict = (cp, need, ph = 'post') => app.phaseVerdictOf(cp, need, ph);

test('A: 酸素投与中でも呼吸困難なし・安定なら未充足にしない', () => {
  const cp = mk([{ need: 1, text: '酸素2L投与中 呼吸困難感の訴えなし SpO2 98%' }]);
  assert.notEqual(verdict(cp, 1), 'unmet');
});
test('B: 尿道カテ留置でも排尿流出良好なら未充足にしない', () => {
  const cp = mk([{ need: 3, text: '尿道カテーテル留置中 尿流出良好 尿量1200mL/日' }]);
  assert.notEqual(verdict(cp, 3), 'unmet');
});
test('C: 術後3日間絶食で栄養供給不足が確認されれば食事の未充足', () => {
  const cp = mk([{ need: 2, text: '術後3日間絶食 補液のみで栄養摂取量が不足、体重減少あり' }]);
  assert.equal(verdict(cp, 2), 'unmet');
});
test('D: 術前絶食8時間・水分補給計画ありは未充足にしない', () => {
  const cp = mk([{ need: 2, text: '術前絶食8時間 補液で水分補給の予定あり', ts: '手術前日' }]);
  assert.notEqual(verdict(cp, 2), 'unmet');
});
test('E: 昨夜眠れない・昼間も強い眠気は睡眠の未充足', () => {
  const cp = mk([{ need: 5, text: '昨夜は眠れなかった 日中も強い眠気あり' }]);
  assert.equal(verdict(cp, 5), 'unmet');
});
test('F: 感染リスクのみ・兆候なし・対策実施は未充足にしない', () => {
  const cp = mk([{ need: 7, text: '術後の感染リスクあり 発熱なし 創部発赤なし 手指衛生など感染対策を実施' }, { need: 9, text: '術後の感染リスクあり 感染対策を実施 兆候なし' }]);
  assert.notEqual(verdict(cp, 7), 'unmet');
  assert.notEqual(verdict(cp, 9), 'unmet');
});
test('G: 「分かりました」と答えても誤った手技を実演したら学びは充足にしない', () => {
  const cp = mk([{ need: 14, type: 's', text: '「分かりました」と話す' }, { need: 14, text: 'インスリン自己注射の手技を実演 手順を誤る' }]);
  assert.notEqual(verdict(cp, 14), 'met');
});
test('H: 宗教の情報なしは情報不足', () => {
  const cp = mk([{ need: 11, text: '宗教についての記載なし' }, { need: 1, text: '呼吸困難なし' }]);
  assert.notEqual(verdict(cp, 11), 'met');
  assert.notEqual(verdict(cp, 11), 'unmet');
});
test('I: 診断名のみ・ADL自立なら姿勢を未充足にしない', () => {
  const cp = mk([{ need: 4, text: '慢性腎不全あり ADL自立 自分で歩行し散歩を続けている' }]);
  assert.notEqual(verdict(cp, 4), 'unmet');
});
test('J: 発言は可能でも難聴で説明が伝わらなければコミュニケーションは未充足', () => {
  const cp = mk([{ need: 10, text: '会話は可能だが難聴のため説明がほとんど伝わらない' }]);
  assert.equal(verdict(cp, 10), 'unmet');
});
