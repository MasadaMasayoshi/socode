'use strict';

//

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const app = loadApp();
const { formatLabValueString, cleanExtractedPhrase, LAB_STANDARDS, LAB_ITEM_NAME_REGEX, suggestHendersonTagsForText, groupClinicalPhrasesWithTimestamps } = app;

test('項目名の直後に日本語の補足説明がある検査値にも、補足説明を残したまま基準値が補われる（利用者からの報告事例）', () => {
  assert.equal(formatLabValueString('RBC(赤血球数) 511万/uL'), 'RBC(赤血球数) 511 ×10^4/μL (基準値: 400〜550 ×10^4/μL)');
  assert.equal(formatLabValueString('Hb(ヘモグロビン) 13.5g/dl'), 'Hb(ヘモグロビン) 13.5 g/dL (基準値: 11.5〜16.5 g/dL)');
  assert.equal(formatLabValueString('Ht(ヘマトクリット) 41.8%'), 'Ht(ヘマトクリット) 41.8 % (基準値: 35〜50 %)');
  assert.equal(formatLabValueString('Plt(血小板数) 28.7万/uL'), 'Plt(血小板数) 28.7 ×10^4/μL (基準値: 13.0〜35.0 ×10^4/μL)');
  assert.equal(formatLabValueString('PT(プロトロンビン時間) 10.8秒'), 'PT(プロトロンビン時間) 10.8 秒 (基準値: 10〜13 秒)');
});

test('項目名の直後に英語の補足説明（半角スペース区切り）がある検査値にも、補足説明を残したまま基準値が補われる', () => {

  assert.equal(formatLabValueString('AST (GOT) 150/L'), 'AST (GOT) 150 U/L (単位「/L」をU/Lと読み替え) (基準値: 10〜40 U/L)');
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

test('項目名の直後にOCR誤読で中括弧になった補足説明がある場合も基準値が補われる（利用者からの報告事例）', () => {
  assert.equal(formatLabValueString('WBC{白血球数) 7500/uL'), 'WBC{白血球数) 7500 /μL (基準値: 4,000〜9,000 /μL)');
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

test('LAB_ITEM_NAME_REGEX: 日本語のみで構成される項目名（血糖・アミラーゼ）も検査値として検出される（利用者からの報告事例）', () => {
  assert.equal(LAB_ITEM_NAME_REGEX.test('血糖 89 mg/dL (基準値: 70〜109 mg/dL)'), true);
  assert.equal(LAB_ITEM_NAME_REGEX.test('アミラーゼ 120 U/L'), true);
});

test('タグ提案(suggestHendersonTagsForText)でも血糖・アミラーゼの検査値カードに2(食事)が提案される', () => {
  assert.ok(suggestHendersonTagsForText('血糖 89 mg/dL (基準値: 70〜109 mg/dL)', null, undefined).includes(2));
  assert.ok(suggestHendersonTagsForText('アミラーゼ 120 U/L', null, undefined).includes(2));
});

test('ASCIIキー（K等）の人名イニシャル除外は引き続き機能する（回帰確認）', () => {
  assert.equal(LAB_ITEM_NAME_REGEX.test('Kさんが訪室した'), false, '「Kさん」は人名のため検査値として誤判定しない');
  assert.equal(LAB_ITEM_NAME_REGEX.test('K 4.2 mEq/L'), true, '数値が伴う場合は引き続き検査値として検出される');
});

test('LAB_ITEM_NAME_REGEX: 項目名の直後に空白なしで数値が続く表記（表の空白崩れ）も検査値として検出される（利用者からの報告事例）', () => {
  ['RBC4587', 'Hb12.2g/dl', 'Ht37.2%', 'Plt23', 'AST2', 'ALT250U/L', 'Na140mEq/L', 'K4.2mEq/L'].forEach(text => {
    assert.equal(LAB_ITEM_NAME_REGEX.test(text), true, `「${text}」は検査値として検出されるはず`);
  });
});

test('LAB_ITEM_NAME_REGEX: 項目名の直後に英字が続く場合（Kg等）は引き続き検査値として誤判定しない（回帰確認）', () => {
  assert.equal(LAB_ITEM_NAME_REGEX.test('体重60Kg'), false);
});

test('formatLabValueString: 項目名の直後に空白なしで数値が続く表記（表の空白崩れ）にも基準値が補われる（利用者からの報告事例）', () => {
  assert.equal(formatLabValueString('WBC11600'), 'WBC 11600 /μL (基準値: 4,000〜9,000 /μL)');

  assert.equal(formatLabValueString('RBC4587'), 'RBC4587');
  assert.equal(formatLabValueString('RBC458'), 'RBC 458 ×10^4/μL (基準値: 400〜550 ×10^4/μL)');
  assert.equal(formatLabValueString('Hb12.2g/dl'), 'Hb 12.2 g/dL (基準値: 11.5〜16.5 g/dL)');
  assert.equal(formatLabValueString('Ht37.2%'), 'Ht 37.2 % (基準値: 35〜50 %)');
  assert.equal(formatLabValueString('Plt23'), 'Plt 23 ×10^4/μL (基準値: 13.0〜35.0 ×10^4/μL)');
  assert.equal(formatLabValueString('AST2'), 'AST 2 U/L (基準値: 10〜40 U/L)');
  assert.equal(formatLabValueString('ALT250U/L'), 'ALT 250 U/L (基準値: 5〜45 U/L)');
  assert.equal(formatLabValueString('Na140mEq/L'), 'Na 140 mEq/L (基準値: 135〜145 mEq/L)');
});

test('formatLabValueString: 数値を伴わない人名（Kさん等）は区切り文字を緩めても引き続き誤判定しない（回帰確認）', () => {
  assert.equal(formatLabValueString('Kさんが訪室した'), 'Kさんが訪室した');
});

test('formatLabValueString: 数値の直後の残りが既知の単位として説明できない場合は、誤った数値を作らずそのまま残す（利用者からの報告事例）', () => {

  assert.equal(formatLabValueString('TP 60g/21'), 'TP 60g/21');
});

test('formatLabValueString: 既知の単位として説明できる場合は引き続き正しく基準値が補われる（回帰確認）', () => {
  assert.equal(formatLabValueString('TP 6.8g/dL'), 'TP 6.8 g/dL (基準値: 6.6〜8.1 g/dL)');
});

test('groupClinicalPhrasesWithTimestamps: 項目名の行の直後の値が既知の単位表記に一致しない場合でも、項目名の行自体が消えずに値とそのまま結合される（利用者からの報告事例）', () => {
  const extracted = groupClinicalPhrasesWithTimestamps('TP\n60g/21');
  const texts = extracted.map(e => e.text);
  assert.ok(texts.includes('TP 60g/21'), '「TP」が消えずに値と結合された1枚のカードとして残るはず');
  assert.ok(!texts.some(t => t.trim() === '60g/21'), 'ラベルの無い値だけの断片が別に残ってはいけない');
});

test('groupClinicalPhrasesWithTimestamps: 項目名の直後に値になりうる行が全く無い場合は、項目名だけのカードとして残る（無かったことにはしない）', () => {
  const extracted = groupClinicalPhrasesWithTimestamps('TP\n次の文章はラベルとは無関係の長い説明文です');
  const texts = extracted.map(e => e.text);
  assert.ok(texts.some(t => t.trim() === 'TP'), '値と結合できない場合でも「TP」自体は消えずに残るはず');
});
