'use strict';
// 「同じ文言への一括反映」機能（タグ追加・削除・分類変更を、同じカルテ内の同じ文言を
// 持つ他のカードにも適用するか確認する）の判定ロジックの検証。
//
// 【背景】同じ文言のカードが複数ある場合、片方だけタグ・分類を修正して他のカードが古い
// ままだと、学習結果と実際の表示がバラバラになってしまう。利用者からの要望（分類の学習が
// しやすくなるようなアップデート案のうち採用されたものの1つ）で追加した。
// findOtherCardsWithSameText()は、実際にダイアログを出す・適用するUI処理
// （offerBulkApplySameText、window.addHendersonTag等）から独立した判定ロジックのみを
// 抜き出したもので、ここではその判定基準（本文完全一致・自分自身は除く・条件に合うものだけ）
// を検証する。

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const app = loadApp();
const { findOtherCardsWithSameText } = app;

function item(id, text, hendersonIds = []) {
  return { id, text, hendersonIds };
}

test('本文が完全一致するカードだけが対象になり、自分自身は対象から除かれる', () => {
  const source = item('a', '同じ文言のカード');
  const items = [
    source,
    item('b', '同じ文言のカード'),
    item('c', '違う文言のカード'),
    item('d', '同じ文言のカード ')  // 末尾に空白があり完全一致ではない
  ];
  const others = findOtherCardsWithSameText(items, source, () => true);
  assert.deepEqual(Array.from(others.map(i => i.id)), ['b'], '完全一致かつ自分以外のカードだけが対象になる');
});

test('needsApplyがfalseを返すカードは対象から除かれる（既に同じ状態のカードを過大に見せない）', () => {
  const source = item('a', '同じ文言', [2]);
  const items = [
    source,
    item('b', '同じ文言', [2]),  // すでにタグ2を持っている→対象外にすべき
    item('c', '同じ文言', [3])   // タグ2を持っていない→対象
  ];
  const others = findOtherCardsWithSameText(items, source, i => !(i.hendersonIds || []).includes(2));
  assert.deepEqual(Array.from(others.map(i => i.id)), ['c']);
});

test('同じ文言の他のカードが無い場合は空配列を返す', () => {
  const source = item('a', '一意な文言');
  const items = [source, item('b', '別の文言')];
  const others = findOtherCardsWithSameText(items, source, () => true);
  assert.deepEqual(Array.from(others), []);
});

test('itemsが空・未定義でも例外にならない', () => {
  const source = item('a', 'テキスト');
  assert.deepEqual(Array.from(findOtherCardsWithSameText([], source, () => true)), []);
  assert.deepEqual(Array.from(findOtherCardsWithSameText(undefined, source, () => true)), []);
});

test('sourceItemが無い場合は空配列を返す（呼び出し側のガード）', () => {
  const items = [item('a', 'テキスト')];
  assert.deepEqual(Array.from(findOtherCardsWithSameText(items, null, () => true)), []);
});
