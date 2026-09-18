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
const { formatLabValueString, cleanExtractedPhrase, LAB_STANDARDS, LAB_ITEM_NAME_REGEX, suggestHendersonTagsForText } = app;

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

// 【背景】アップロードされたカルテ記録では「WBC{白血球数)」のように、OCR誤読で
// 開き括弧「(」が中括弧「{」になっている補足説明があった。従来の正規表現は
// 「（(」の開き括弧しか許容していなかったため一致せず、基準値が補われないままだった。
// 項目名だけの行を検出するBARE_LAB_KEY_REGEXは既に「{」「｛」を許容していたのを踏襲し、
// formatLabValueStringの補足説明キャプチャ側も同様に許容するよう修正した。
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

// 【背景】LAB_ITEM_NAME_REGEXは項目名の直後に数値が無い場合でも検査値らしさを判定するために
// \b（単語境界）で項目名を挟んでいたが、JSの正規表現の\bは[A-Za-z0-9_]だけを「単語文字」と
// みなすため、"血糖"・"アミラーゼ"のように全角の日本語だけで構成された項目名は、周囲が
// 常に日本語であるため\bが一致する位置自体が存在せず、事実上一度も一致できなかった。
// 利用者からアップロードされたカルテでは「血糖 89 mg/dL (基準値: 70〜109 mg/dL)」のような
// 既に基準値まで整形済みの検査値カードが、この理由でタグ2(食事)を提案されず「タグ未設定」の
// まま残っていた。日本語のみで構成される項目名は\bを外して部分一致で判定するよう修正した
// （人名イニシャルとの混同リスクがあるK・Na等のASCIIキーはそのまま\b＋敬称除外を維持）。
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

// 【背景】表・検査結果を貼り付けた際に項目名と数値の間の空白が失われ、「RBC4587」
// 「Hb12.2g/dl」のように直接くっついてしまうことがある。従来のASCIIキー末尾の\bは
// 「文字→数字」間では成立しない（数字も\bにとっては単語文字のため）ため、これらは
// 検査値として認識されずタグ未設定のまま残っていた（利用者からの報告事例）。
// 末尾を「直後に英字が続く場合だけ除外する」否定先読みに変更し、項目名の直後に数字が
// 続く表記も検出できるようにした。「Kg」のように直後に英字が続く場合は従来通り除外される。
test('LAB_ITEM_NAME_REGEX: 項目名の直後に空白なしで数値が続く表記（表の空白崩れ）も検査値として検出される（利用者からの報告事例）', () => {
  ['RBC4587', 'Hb12.2g/dl', 'Ht37.2%', 'Plt23', 'AST2', 'ALT250U/L', 'Na140mEq/L', 'K4.2mEq/L'].forEach(text => {
    assert.equal(LAB_ITEM_NAME_REGEX.test(text), true, `「${text}」は検査値として検出されるはず`);
  });
});

test('LAB_ITEM_NAME_REGEX: 項目名の直後に英字が続く場合（Kg等）は引き続き検査値として誤判定しない（回帰確認）', () => {
  assert.equal(LAB_ITEM_NAME_REGEX.test('体重60Kg'), false);
});
