'use strict';
// 情報カードをクリックした時に、元の文章（カルテ・看護記録入力欄）の該当箇所に印を付ける機能の
// 位置探索（findSourceHighlightRanges）の検証。
// 利用者からの要望：「情報カードをクリックすると元文章のどこにあったのかわかるように、
// 情報カードクリック時に文章の単語をマーカーをつけてわかるようにして」。
// カードの文章は抽出時に書き換わる（全角/半角、改行の結合、表の項目名・値・基準値の結合、
// 単位や「(基準値: …)」の補足等）ため、単純な文字列検索では見つからない場合も含めて確認する。

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const app = loadApp();
const { findSourceHighlightRanges, groupClinicalPhrasesWithTimestamps } = app;

const marked = (source, cardText) =>
  Array.from(findSourceHighlightRanges(source, cardText)).map(([s, e]) => source.slice(s, e));

const SOURCE = [
  '■ 排泄',
  '排尿: 7回/日程度（夜間2回）自立',
  '検査項目', '正常値', '入院時', '術後1日目',
  'WBC (白血球)', '8.1-9.0×10³/μL', '8100/μL', '10,200',
  'Hb (ヘモグロビン)', '12.0-16.0g/dL', '14.0g/dL', '10.8',
  '4. 手術当日',
  '術中輸液量：2,320ml、Hb 10.8g/dl',
  '嘔気・嘔吐なし',
  '「先生にお任せするしかない」'
].join('\n');

test('文章カード：全角括弧・全角コロンに正規化されたカードでも、元の文章の該当行全体に印が付く', () => {
  assert.deepEqual(marked(SOURCE, '排尿: 7回/日程度(夜間2回)自立'), ['排尿: 7回/日程度（夜間2回）自立']);
  assert.deepEqual(marked(SOURCE, '「先生にお任せするしかない」'), ['「先生にお任せするしかない」']);
  assert.deepEqual(marked(SOURCE, '嘔気・嘔吐なし'), ['嘔気・嘔吐なし']);
});

test('表から作られた検査値カード：項目名と、その列の実測値のセルに印が付く（補った単位・基準値は無視される）', () => {
  assert.deepEqual(marked(SOURCE, 'WBC (白血球) 10,200/μL (基準値: 8.1-9.0×10^3/μL)'), ['WBC (白血球', '10,200']);
  assert.deepEqual(marked(SOURCE, 'WBC (白血球) 8100/μL (基準値: 8.1-9.0×10^3/μL)'), ['WBC (白血球', '8100']);
});

test('同じ数値が2か所にある場合：表の「10.8」と手術中の「Hb 10.8g/dl」を、カードの内容からそれぞれ正しく区別する', () => {
  assert.deepEqual(marked(SOURCE, 'Hb (ヘモグロビン) 10.8g/dL (基準値: 12.0-16.0g/dL)'), ['Hb (ヘモグロビン', '10.8'],
    '表の術後1日目の列のセルを示す（手術中の記録ではない）');
  assert.deepEqual(marked(SOURCE, 'Hb 10.8 g/dL (基準値: 11.5〜16.5 g/dL)'), ['Hb 10.8g/dl'],
    '手術中の記録のカードは手術中の行を示す');
});

test('元の文章に無いカード・空の文章では何も示さない（誤った場所に印を付けない）', () => {
  assert.equal(findSourceHighlightRanges(SOURCE, '全く関係のない記載').length, 0);
  assert.equal(findSourceHighlightRanges('', '嘔気・嘔吐なし').length, 0);
  assert.equal(findSourceHighlightRanges(SOURCE, '').length, 0);
});

test('実際の分類結果のカードは、すべて元の文章の中に該当箇所が見つかる（ローカル分類との組み合わせ確認）', () => {
  const items = groupClinicalPhrasesWithTimestamps(SOURCE.normalize('NFKC')).filter(i => !i.isUnnecessaryBoilerplate);
  assert.ok(items.length >= 5); // 比較できる表は関連する項目ごとの1枚にまとまる（患者36の指摘）
  items.forEach(i => assert.ok(findSourceHighlightRanges(SOURCE, i.text).length > 0, `「${i.text}」の該当箇所が見つかるはず`));
});
