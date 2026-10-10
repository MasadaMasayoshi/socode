'use strict';
// 分類結果の自動チェック（改善提案4。tests/golden/golden-lib.jsの説明を参照）。
// これまでの患者さんの文章の分類結果が、保存してある正しい分類結果から変わっていないかを確かめる。
// 変わっていたら、変わったカードを日本語で表示して失敗する。
const test = require('node:test');
const assert = require('node:assert/strict');
const { runGolden, formatReport } = require('./golden-lib');

test('これまでの患者さんの文章の分類結果が、保存してある正しい分類結果から変わっていない', () => {
  const results = runGolden();
  const changed = results.filter(r => r.diff.length);
  assert.equal(changed.length, 0, '\n' + formatReport(results));
});
