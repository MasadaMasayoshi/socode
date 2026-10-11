'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers');
test('AIで分類を評価の部品は、もう読み込まれない', () => {
  const app = loadApp();
  assert.strictEqual(typeof app.parseAiReviewJson, 'undefined');
  assert.strictEqual(typeof app.buildAiReviewPrompt, 'undefined');
});
