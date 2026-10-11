'use strict';

//

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
    item('d', '同じ文言のカード ')
  ];
  const others = findOtherCardsWithSameText(items, source, () => true);
  assert.deepEqual(Array.from(others.map(i => i.id)), ['b'], '完全一致かつ自分以外のカードだけが対象になる');
});

test('needsApplyがfalseを返すカードは対象から除かれる（既に同じ状態のカードを過大に見せない）', () => {
  const source = item('a', '同じ文言', [2]);
  const items = [
    source,
    item('b', '同じ文言', [2]),
    item('c', '同じ文言', [3])
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
