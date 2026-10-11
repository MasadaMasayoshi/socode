'use strict';

//

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const app = loadApp();
const { hasBalancedBrackets, splitIndependentActionPhrases, splitByNakatenList, splitEnumeratedPhrases, groupClinicalPhrasesWithTimestamps } = app;

test('hasBalancedBrackets: 開き括弧と閉じ括弧の対応数が同じ場合はtrue', () => {
  assert.equal(hasBalancedBrackets('<実習2日目(入院2日目、手術前日)>'), true);
  assert.equal(hasBalancedBrackets('シャワー浴'), true, '括弧を含まない文字列も対応が取れているとみなす');
});

test('hasBalancedBrackets: 開き括弧だけ・閉じ括弧だけが残る場合はfalse', () => {
  assert.equal(hasBalancedBrackets('<実習2日目(入院2日目'), false, '開き括弧が2つ・閉じ括弧が0で不一致');
  assert.equal(hasBalancedBrackets('手術前日)>'), false, '閉じ括弧が2つ・開き括弧が0で不一致');
});

test('splitIndependentActionPhrases: 括弧付き見出し全体は読点で分割されない（利用者からの報告事例）', () => {
  const result = splitIndependentActionPhrases('<実習2日目(入院2日目、手術前日)>');
  assert.deepEqual(Array.from(result), ['<実習2日目(入院2日目、手術前日)>'], '括弧の対応が崩れるため1つのまま');
});

test('splitIndependentActionPhrases: 括弧を含まない従来通りの列挙は引き続き分割される（既存機能の回帰確認）', () => {
  const result = splitIndependentActionPhrases('シャワー浴、弾性ストッキング着用');
  assert.deepEqual(Array.from(result), ['シャワー浴', '弾性ストッキング着用']);
});

test('splitEnumeratedPhrases経由でも括弧付き見出しは分割されない', () => {
  const result = splitEnumeratedPhrases('<実習2日目(入院2日目、手術前日)>');
  assert.deepEqual(Array.from(result), ['<実習2日目(入院2日目、手術前日)>']);
});

test('groupClinicalPhrasesWithTimestamps: 括弧付き見出しの行が1枚のカードとして抽出される（分裂しない）', () => {
  const extracted = groupClinicalPhrasesWithTimestamps('<実習2日目(入院2日目、手術前日)>');
  const texts = Array.from(extracted.map(e => e.text));
  assert.equal(texts.length, 1, '2枚に分裂せず1枚のカードになる');
  assert.equal(texts[0], '<実習2日目(入院2日目、手術前日)>');
});

test('splitByNakatenList: 「・」でも括弧の対応が崩れる場合は分割されない', () => {
  const result = splitByNakatenList('＜手術・処置＞');
  assert.deepEqual(Array.from(result), ['＜手術・処置＞']);
});

test('groupClinicalPhrasesWithTimestamps: 日数を含む山括弧見出しは「不要」として抽出される（利用者からの報告事例）', () => {
  const extracted = groupClinicalPhrasesWithTimestamps('＜実習2日目（入院2日目、手術前日）＞');
  assert.equal(extracted.length, 1);
  assert.equal(extracted[0].text, '＜実習2日目（入院2日目、手術前日）＞');
  assert.equal(extracted[0].isUnnecessaryBoilerplate, true, '数字を含む見出しも不要判定されるべき');
});

test('groupClinicalPhrasesWithTimestamps: 山括弧形式の章見出し（「＜帰室時の状況）」等）の直後の、自前ラベルの無い観察に章タイトルが補われる（利用者からの報告事例）', () => {
  const text = [
    '＜帰室時の状況）',
    '声を掛けると開眼し、「ああ」と短く返事をするのみ。',
    '湿性咳嗽時々あり'
  ].join('\n');
  const extracted = groupClinicalPhrasesWithTimestamps(text);
  const heading = extracted.find(e => e.text.includes('帰室時の状況）'));
  assert.ok(heading, '見出し行自体は「不要な情報」として残るはず');
  assert.equal(heading.isUnnecessaryBoilerplate, true);
  const consciousness = extracted.find(e => e.text.includes('声を掛けると開眼し'));
  assert.ok(consciousness, '意識レベルの観察カードが抽出されるはず');
  assert.equal(consciousness.text, '帰室時の状況: 声を掛けると開眼し、「ああ」と短く返事をするのみ。',
    '章タイトルが補われ、帰室直後の観察であることが文章から分かるようになるはず');
  const cough = extracted.find(e => e.text.includes('湿性咳嗽'));
  assert.equal(cough.text, '帰室時の状況: 湿性咳嗽時々あり', '同じ章の後続カードにも同様に章タイトルが補われるはず');
});
