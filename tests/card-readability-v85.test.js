'use strict';
// v.85 の充足状態の見た目変更は取り消しました（v.86）。充足状態の文章は変えない方針です。
// 文言の固定は tests/sufficiency-wording-frozen.test.js で確認します。このファイルは削除できないため空のテストにしています。
const test = require('node:test');
const assert = require('node:assert');
test('v.85 readability change was reverted (see sufficiency-wording-frozen)', () => { assert.ok(true); });
