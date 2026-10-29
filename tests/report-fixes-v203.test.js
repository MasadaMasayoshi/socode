'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const cards = t => Array.from(app.groupClinicalPhrasesWithTimestamps(t)).map(c => c.text);

test('検査名の見出しと直下の測定値は1枚にまとめる／別の項目の箇条書きや数字のない行は混ぜない（反例）', () => {
  const a = cards('11月7日\n赤血球沈降速度\n* 1時間値　91mm\n* 2時間値　131mm\n心電図　異常なし');
  assert.ok(a.some(x => /^赤血球沈降速度.*1時間値 91mm.*2時間値 131mm$/.test(x)), a.join('|'));
  assert.ok(a.includes('心電図　異常なし') || a.some(x => /^心電図/.test(x)));
  const b = cards('11月7日\n血液検査\n異常なし');
  assert.ok(!b.some(x => /血液検査.*異常なし/.test(x) && /　/.test(x) && /\d/.test(x)));
});
test('壊れた文章の検出：完結した所見（「異常なし」「陰性」）は途中切れとみなさない／本当に途中で終わる行は検出する', () => {
  const r = Array.from(app.detectBrokenTextLines('心電図 異常なし\n胸部X線撮影 異常なし\nCRP 陰性\n検査結果を確認し\n次の処置について説明する。'));
  assert.ok(!r.some(x => /異常なし|陰性/.test(x.text)), JSON.stringify(r.map(x => x.text)));
  assert.ok(r.some(x => /確認し/.test(x.text)));
});
test('皮膚の発疹は清潔（皮膚の状態）の根拠になる／鑑別診断の列挙は欲求に入れない', () => {
  assert.ok(Array.from(app.detectMultipleHendersonTags('頸部に不定形の発疹が出現した。')).includes(8));
  assert.equal(app.detectMultipleHendersonTags('2)発熱・発疹:敗血症、リウマチ熱').length, 0);
});
function cp(texts) { return { id: 'p', items: texts.map((t, k) => ({ id: 'c' + k, type: 'o', text: t, timestamp: '入院2日目', hendersonIds: [2], assessmentCols: { 2: 'postadmission' } })), sourceText: '', myAssessments: {} }; }
test('判定：「嘔気はないが食欲なく何も食べていない」は良好な根拠にしない（未充足）／同じ組合せの重複表示を1つにする', () => {
  const c = cp(['嘔気はないが食欲なく昨日から何も食べていない', '発熱、摂取不良、尿量減少']);
  const r = app.ruleSufficiencyFor(c)[2].post;
  assert.equal(r.verdict, 'unmet');
  assert.ok(!(r.facts.for || []).some(f => /嘔気はない/.test(f.text)));
  const s = app.sufficiencySentence(c, 2, 'post', {});
  assert.ok(!/良好な一方/.test(s), s);
});
test('判定の知識欄：医師の説明（「〜の合併症を起こすこともある」）を、この患者の所見のつながりとして使わない', () => {
  const c = { id: 'p', sourceText: '', myAssessments: {}, items: [
    { id: 'a', type: 'o', text: '医師：「この病気は心臓に障害を起こすこともある。心筋炎による心不全で、まれに死亡例もある」', timestamp: '入院時', hendersonIds: [1], assessmentCols: { 1: 'postadmission' } },
    { id: 'b', type: 'o', text: '食欲なく昨日から何も食べていない', timestamp: '入院時', hendersonIds: [2], assessmentCols: { 2: 'postadmission' } }] };
  assert.ok(!/心不全→/.test(app.sufficiencyKnowledgeLine(c, 2, 'post')));
});
test('発疹：現在の皮膚の所見は清潔（8）／薬・造影剤などによる発疹の既往はアレルギー歴として皮膚の語に数えない（反例）', () => {
  assert.ok(Array.from(app.detectMultipleHendersonTags('体幹に発疹が出現した。')).includes(8));
  assert.ok(!Array.from(app.detectMultipleHendersonTags('造影剤で発疹の既往あり')).includes(8));
  assert.ok(!Array.from(app.detectMultipleHendersonTags('抗菌薬で皮疹が出たことがある（既往）')).includes(8));
});
