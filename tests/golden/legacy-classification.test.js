'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runGolden, formatReport } = require('./golden-lib');

test('これまでの患者さんの文章の分類結果が、保存してある正しい分類結果から変わっていない', () => {
  const results = runGolden();
  const changed = results.filter(r => r.diff.length);
  assert.equal(changed.length, 0, '\n' + formatReport(results));
});
