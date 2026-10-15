'use strict';
// A bare phase word (入院前 / 術前 ...) as the very first line is a time heading, like after a title line.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const ts = t => Array.from(app.classifyTextByRules(t), c => [c.text, c.timestamp]);

test('first-line phase word sets the time of the following lines', () => {
  assert.deepEqual(ts('入院前\nADL:自立'), [['ADL:自立', '入院前']]);
  assert.deepEqual(ts('術前\nADL:自立\n術後\nADL:要介助'), [['ADL:自立', '術前'], ['ADL:要介助', '術後']]);
});
test('same result with a title line before it; plain first lines stay undated', () => {
  assert.deepEqual(ts('記録\n入院前\nADL:自立').pop(), ['ADL:自立', '入院前']);
  assert.equal(ts('ADL:自立')[0][1], '日時不明');
});
