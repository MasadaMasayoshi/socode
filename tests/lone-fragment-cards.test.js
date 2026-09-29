'use strict';
// 利用者からの修正依頼：「入室だけで情報カードになってるのがおかしい」。
// ・名詞だけの短い断片の結合（mergeShortFragmentCards）を、ローカル分類だけでなくAI分類の結果にも使う。
// ・どこにもまとめられない「入室」のような移動を表す語だけのカードは不要な情報にする。

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const { mergeShortFragmentCards, groupClinicalPhrasesWithTimestamps } = loadApp();

// AI分類の結果の形（1件ずつ返ってきた断片）を模したもの
const aiLike = (rows) => rows.map((r, idx) => ({ text: r[1], timestamp: r[0], type: r[2] || 'o', hendersonIds: r[3] || [], isUnnecessaryBoilerplate: r[2] === 'unnecessary', isLabOrVital: false, _line: idx }));

test('AI分類で「入室」「全身麻酔」が別々に返ってきても、同じ時刻の手術のカードに1枚にまとまる（タグも合わせる）', () => {
  const list = aiLike([
    ['9:00', '入室', 'o', []],
    ['9:00', '右大腿骨人工骨頭置換術 後方アプローチ施行', 'o', [4]],
    ['9:00', '全身麻酔', 'o', [1]]
  ]);
  const out = Array.from(mergeShortFragmentCards(list));
  assert.equal(out.length, 1);
  assert.equal(out[0].text, '入室、右大腿骨人工骨頭置換術 後方アプローチ施行、全身麻酔');
  assert.deepEqual(Array.from(out[0].hendersonIds).sort(), [1, 4]);
});

test('AI分類で発言だけの行が返ってきても、直前の同じ日時の発言のカードの続きになる', () => {
  const out = Array.from(mergeShortFragmentCards(aiLike([
    ['入院時', '「孫に会いたい」と前向き。', 's', [10]],
    ['入院時', '「先生にお任せするしかない」', 's', [10]]
  ])));
  assert.equal(out.length, 1);
  assert.equal(out[0].text, '「孫に会いたい」と前向き。「先生にお任せするしかない」');
});

test('前後のどのカードにもまとめられない「入室」だけのカードは、不要な情報になる（利用者からの修正依頼）', () => {
  const cards = Array.from(groupClinicalPhrasesWithTimestamps('9:00 入室\n血圧: 120/70mmHg'));
  const lone = cards.find(c => c.text === '入室');
  assert.ok(lone, '「入室」自体は不要な情報として残る');
  assert.equal(lone.isUnnecessaryBoilerplate, true);
});

test('違う時刻のカードとはまとめない（誤結合の防止）', () => {
  const out = Array.from(mergeShortFragmentCards(aiLike([
    ['9:00', '右大腿骨人工骨頭置換術 後方アプローチ施行', 'o', [4]],
    ['12:00', '全身麻酔', 'o', [1]]
  ])));
  assert.equal(out.length, 2);
});
