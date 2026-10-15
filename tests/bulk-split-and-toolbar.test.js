'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const bar = html.slice(html.indexOf('id="bulk-action-bar"'), html.indexOf('id="bulk-action-bar"') + 4000);
const toolbar = html.slice(html.indexOf('id="board-toolbar"'), html.indexOf('id="board-toolbar"') + 6000);

test('the selection bar offers a split button next to merge', () => {
  assert.ok(/id="btn-bulk-split"[^>]*onclick="splitSelectedCard\(\)"/.test(bar));
  assert.ok(bar.indexOf('btn-bulk-split') < bar.indexOf('btn-bulk-merge'));
});
test('improvement and knowledge buttons live in the more-menu, not the crowded toolbar row', () => {
  const menuStart = toolbar.indexOf('board-menu-panel');
  assert.ok(menuStart > 0);
  assert.ok(toolbar.indexOf('btn-improvement-cycle') > menuStart && toolbar.indexOf('btn-knowledge-intake') > menuStart);
});
