'use strict';
// 検査値カードに基準値（LAB_STANDARDS）が正しく反映されない不具合の検証。
//
// 【背景】利用者からの報告：RBC・Hb・Ht・Plt・PT・AST・ALT・ALP・Clの検査値カードに
// 基準値が表示されていなかった。LAB_STANDARDSにはこれらすべての基準値が既に登録
// 済みだったが、formatLabValueString()に2つの不具合があった。
// ①「単位らしき文字列（g/dL・U/L・%等）を含むかどうか」で「既に基準値まで整形済み」と
// 　誤判定していたため、単位だけが書かれていて基準値がまだ無いカード（Ht(...) 41.8%、
// 　ALP 221U/L、Cl 105mEq/L等）が、実際には未整形なのに「済み」として処理をスキップ
// 　されてしまっていた。
// ②項目名の直後に「(赤血球数)」「 (GOT)」のような日本語・英語の補足説明が挟まっている
// 　場合、項目名の直後に空白・コロン等が続く場合しか一致しない正規表現では値と結合できず、
// 　基準値が補われないままになっていた。
// 両方を修正し、①単位が既に書かれている検査値にも基準値を追記するようにし、②項目名の
// 直後の括弧書きの補足説明（利用者が自分で書き添えたもの）はそのまま残したうえで基準値
// だけを追記するようにした。既存の分（血糖・T-Bil・Na・K・CRP等、既に基準値付きで
// 保存されているカード）を再度処理しても基準値が重複しないことも確認する。

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const app = loadApp();
const { formatLabValueString, cleanExtractedPhrase, LAB_STANDARDS } = app;

test('項目名の直後に日本語の補足説明がある検査値にも、補足説明を残したまま基準値が補われる（利用者からの報告事例）', () => {
  assert.equal(formatLabValueString('RBC(赤血球数) 511万/uL'), 'RBC(赤血球数) 511 ×10^4/μL (基準値: 400〜550 ×10^4/μL)');
  assert.equal(formatLabValueString('Hb(ヘモグロビン) 13.5g/dl'), 'Hb(ヘモグロビン) 13.5 g/dL (基準値: 11.5〜16.5 g/dL)');
  assert.equal(formatLabValueString('Ht(ヘマトクリット) 41.8%'), 'Ht(ヘマトクリット) 41.8 % (基準値: 35〜50 %)');
  assert.equal(formatLabValueString('Plt(血小板数) 28.7万/uL'), 'Plt(血小板数) 28.7 ×10^4/μL (基準値: 13.0〜35.0 ×10^4/μL)');
  assert.equal(formatLabValueString('PT(プロトロンビン時間) 10.8秒'), 'PT(プロトロンビン時間) 10.8 秒 (基準値: 10〜13 秒)');
});

test('項目名の直後に英語の補足説明（半角スペース区切り）がある検査値にも、補足説明を残したまま基準値が補われる', () => {
  assert.equal(formatLabValueString('AST (GOT) 150/L'), 'AST (GOT) 150 U/L (基準値: 10〜40 U/L)');
  assert.equal(formatLabValueString('ALT (GPT) 14U/L'), 'ALT (GPT) 14 U/L (基準値: 5〜45 U/L)');
});

test('単位だけが書かれていて基準値が未整形の検査値にも基準値が補われる（誤って「整形済み」と判定されない）', () => {
  assert.equal(formatLabValueString('ALP 221U/L'), 'ALP 221 U/L (基準値: 38〜113 U/L)');
  assert.equal(formatLabValueString('Cl 105mEq/L'), 'Cl 105 mEq/L (基準値: 98〜108 mEq/L)');
});

test('既に基準値まで整形済みの検査値は変更されない（重複追加の防止・回帰確認）', () => {
  const already = [
    '血糖 89 mg/dL (基準値: 70〜109 mg/dL)',
    'T-Bil 0.6 mg/dL (基準値: 0.2〜1.2 mg/dL)',
    'Na 140 mEq/L (基準値: 135〜145 mEq/L)',
    'K 4.4 mEq/L (基準値: 3.5〜5.0 mEq/L)',
    'CRP 0.66 mg/dL (基準値: 0.3以下 mg/dL)'
  ];
  already.forEach(text => assert.equal(formatLabValueString(text), text));
});

test('HbA1cのように項目名が別の項目名の前方一致になる場合は誤って一致しない（回帰確認）', () => {
  const result = formatLabValueString('HbA1c 6.2%');
  assert.ok(result.startsWith('HbA1c'), 'HbをキーにHbA1cの先頭だけを誤って一致させない');
});

test('LAB_STANDARDSには画面で報告された検査値がすべて既に登録されている（基準値の設定漏れは無い）', () => {
  ['RBC', 'Hb', 'Ht', 'Plt', 'PT', 'AST', 'ALT', 'ALP', 'Cl', 'γGTP', 'アミラーゼ', '血糖', 'T-Bil', 'Na', 'K', 'CRP'].forEach(key => {
    assert.ok(LAB_STANDARDS[key], `${key}の基準値がLAB_STANDARDSに存在するはず`);
  });
});

test('cleanExtractedPhrase経由（実際の抽出処理と同じ経路）でも基準値が補われる', () => {
  const result = cleanExtractedPhrase('RBC(赤血球数) 511万/uL');
  assert.equal(result, 'RBC(赤血球数) 511 ×10^4/μL (基準値: 400〜550 ×10^4/μL)');
});
