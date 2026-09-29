'use strict';
// 「タグ指摘を書き出し」（タグの□に「おかしい」の印を付けて書き出す機能）は、利用者からの要望
// （「タグ基準値再チェックとタグ指摘書き出し機能やっぱり削除してください」）により削除した。
// 以前の印（flaggedTagIds）が残っているカードでも、書き出しに指摘欄が出ないことを確認する。

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const app = loadApp();

test('タグ指摘の書き出し用の関数は公開されていない（機能ごと削除済み）', () => {
  assert.equal(app.buildFlaggedTagsExportText, undefined);
  assert.equal(app.explainHendersonTagReason, undefined);
});

test('以前付けた「おかしい」の印が残っていても、選択したカードの書き出しに指摘欄は出ない', () => {
  const cp = { title: 'X', items: [{ id: 'a', type: 'o', timestamp: '入院時', text: 'CRP 0.8', hendersonIds: [7], flaggedTagIds: [7] }] };
  const out = app.buildSelectedCardsExportText(cp, ['a'], 'CRP 0.8', false);
  assert.ok(!out.includes('おかしいと指摘したタグ'));
  assert.ok(!out.includes('付いた理由'));
});
