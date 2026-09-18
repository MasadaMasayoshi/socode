'use strict';
// 「患者背景（基本情報／医学情報）」の検証。
//
// 【背景】利用者からの要望：「タグ未設定」のまま残ってしまうカードの中には、氏名・性別・
// 血液型・病期(Stage)・病理結果・臨時指示のように、そもそもヘンダーソンの14の基本的欲求
// のどれにも自然には当てはまらない内容が一定数ある。これらを「タグ未設定」という要対応の
// 警告のまま放置するのではなく、「患者背景」という独立した受け皿（ヘンダーソンタグの
// 一覧・総合アセスメント表とは完全に別枠）に振り分け、さらに氏名・性別等の属人的な
// 「基本情報」と、血液型・病期・治療方針等の臨床的な「医学情報」の2つに分ける。
// classifyPatientBackground()は、「他のどのヘンダーソンタグにも一致しなかった場合の
// 最後の受け皿」として、カード作成時・「タグ・基準値を再チェック」実行時の両方から呼ばれる
// 純粋な振り分け関数で、ここではその判定基準を検証する。

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
  assert.deepEqual(Array.from(PATIENT_BACKGROUND_BASIC_FIELD_LABELS).sort(), ['入院日', '性別', '氏名', '生活歴'].sort());
});

// isUntaggedItemは、カードの赤枠・「タグ未設定」警告表示を決める中心的な判定関数。
// 患者背景に振り分けられたカードは、意図的にヘンダーソンタグが無いカードのため、
// 「要対応の警告」を出してはならない（利用者からの報告：患者背景に振り分けたつもりの
// カードにまで赤い警告が出ていては本来の目的を果たせない）。
test('isUntaggedItem: 患者背景に振り分けられたカードは「タグ未設定」の警告対象にならない', () => {
  const item = { type: 'o', hendersonIds: [], patientBackground: '医学情報' };
  assert.equal(isUntaggedItem(item), false);
});

test('isUntaggedItem: 患者背景が未設定でヘンダーソンタグも無いカードは、引き続き警告対象になる（回帰確認）', () => {
  const item = { type: 'o', hendersonIds: [] };
  assert.equal(isUntaggedItem(item), true);
});

test('isUntaggedItem: 「不要」判定済みのカードは患者背景の有無を問わず警告対象にならない（回帰確認）', () => {
  assert.equal(isUntaggedItem({ type: 'unnecessary', hendersonIds: [] }), false);
  assert.equal(isUntaggedItem({ type: 'unnecessary', hendersonIds: [], patientBackground: '医学情報' }), false);
});

// 実際にどのヘンダーソンタグにも一致しない実例（利用者からの報告事例）で、
// suggestHendersonTagsForTextが空配列を返すこと（＝患者背景の受け皿に振り分けられる前提条件）
// を確認する。
test('血液型・病期・病理結果のような記述はヘンダーソンタグが1件も提案されない（患者背景に振り分けられる前提の確認）', () => {
  // Array.fromで包むのは、app.jsをvmサンドボックス内で実行しているため（サンドボックス側の
  // Arrayとテスト側のArrayが別レルムになり、空配列同士でも参照が異なるとdeepStrictEqualが
  // 失敗することがある。他のテストファイルの既存の書き方に合わせる）。
  assert.deepEqual(Array.from(suggestHendersonTagsForText('【血液型】 A型', null, undefined)), []);
  assert.deepEqual(Array.from(suggestHendersonTagsForText('Stage 1B', null, undefined)), []);
  assert.deepEqual(Array.from(suggestHendersonTagsForText('【病理結果】T2 NO PO HO MO', null, undefined)), []);
});
