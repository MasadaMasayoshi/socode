'use strict';

//

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const app = loadApp();
const { classifyPatientBackground, PATIENT_BACKGROUND_BASIC_FIELD_LABELS, suggestHendersonTagsForText, isUntaggedItem } = app;

test('氏名・性別・生活歴・入院日は「基本情報」に振り分けられる', () => {
  ['氏名', '性別', '生活歴', '入院日'].forEach(fieldLabel => {
    assert.equal(classifyPatientBackground(fieldLabel), '基本情報', `「${fieldLabel}」は基本情報のはず`);
  });
});

test('診断名・既往歴・治療方針等の臨床的な見出しラベルは「医学情報」に振り分けられる', () => {
  ['診断名', '既往歴', '治療方針', '治療内容', '手術術式', '感染症', '主訴'].forEach(fieldLabel => {
    assert.equal(classifyPatientBackground(fieldLabel), '医学情報', `「${fieldLabel}」は医学情報のはず`);
  });
});

test('見出しラベルが無い場合（血液型・病期・OCR破損等）は「医学情報」に振り分けられる（最後の受け皿としての既定値）', () => {
  assert.equal(classifyPatientBackground(null), '医学情報');
  assert.equal(classifyPatientBackground(undefined), '医学情報');
});

test('PATIENT_BACKGROUND_BASIC_FIELD_LABELSに登録された見出しラベルの一覧が想定通り（回帰確認）', () => {

  assert.deepEqual(Array.from(PATIENT_BACKGROUND_BASIC_FIELD_LABELS).sort(), ['入院日', 'アレルギー', '学歴', '性別', '氏名', '生活歴'].sort());
});

test('isUntaggedItem: 患者背景の目印が付いたカードでも、タグが無ければ「タグ未設定」の警告対象になる', () => {
  const item = { type: 'o', hendersonIds: [], patientBackground: '医学情報' };
  assert.equal(isUntaggedItem(item), true);
});

test('isUntaggedItem: 患者背景が未設定でヘンダーソンタグも無いカードは、引き続き警告対象になる（回帰確認）', () => {
  const item = { type: 'o', hendersonIds: [] };
  assert.equal(isUntaggedItem(item), true);
});

test('isUntaggedItem: 「不要」判定済みのカードは患者背景の有無を問わず警告対象にならない（回帰確認）', () => {
  assert.equal(isUntaggedItem({ type: 'unnecessary', hendersonIds: [] }), false);
  assert.equal(isUntaggedItem({ type: 'unnecessary', hendersonIds: [], patientBackground: '医学情報' }), false);
});

test('血液型はヘンダーソンタグが提案されず、病期・病理結果は学び(14)にしない（疾患の分類。タグ不要の理由として示す）', () => {

  assert.deepEqual(Array.from(suggestHendersonTagsForText('【血液型】 A型', null, undefined)), []);
  assert.deepEqual(Array.from(suggestHendersonTagsForText('Stage 1B', null, undefined)).sort(), []);
  assert.deepEqual(Array.from(suggestHendersonTagsForText('【病理結果】T2 NO PO HO MO', null, undefined)).sort(), []);
});
