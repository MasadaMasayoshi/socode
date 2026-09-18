'use strict';
// 括弧で囲まれた1つの見出し・区切りマーカー（「＜実習2日目（入院2日目、手術前日）＞」等）が、
// 「・」「、」による列挙分割で括弧の対応が崩れた意味の無い断片に分裂してしまう不具合の検証。
//
// 【背景】利用者からのアップロード文書で発覚：「＜実習2日目（入院2日目、手術前日）＞」の
// 1行が、読点による列挙分割（splitIndependentActionPhrases。各要素がひらがなを含まない
// 短い体言止めの語句なら安全に分割する、というルール）に引っかかり、「＜実習2日目（入院2日目」
// 「手術前日）＞」という2枚の、意味が読み取れず・タグ付けもできないカードに分裂していた。
// 分割後の要素の括弧の対応数（hasBalancedBrackets）を見て、崩れる場合は分割自体を
// 取りやめるようにした。

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
