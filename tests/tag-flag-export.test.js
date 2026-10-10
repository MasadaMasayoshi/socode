'use strict';

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
