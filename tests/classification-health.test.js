'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const dir = path.join(__dirname, 'golden', 'cases');

test('untagged share stays low on every golden case (guards against a flood of unclassified cards)', () => {
  const over = [];
  fs.readdirSync(dir).filter(f => f.endsWith('.txt')).forEach(f => {
    const items = Array.from(app.classifyTextByRules(fs.readFileSync(path.join(dir, f), 'utf8')));
    const h = app.classificationHealth(items);
    if (h.total >= 10 && h.ratio > 0.3) over.push(`${f}: ${h.untagged}/${h.total}`);
  });
  assert.deepStrictEqual(over, []);
});
test('disease background cards are never counted as untagged', () => {
  const items = Array.from(app.classifyTextByRules('全身症状\n発熱、倦怠感、\n疲れやすい、\n心外膜炎など'));
  assert.ok(items.some(c => c.diseaseGeneral));
  assert.strictEqual(app.classificationHealth(items).untagged, 0);
});
test('a flood of untagged cards is reported as degraded', () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ id: String(i), type: 'o', text: `x${i}`, hendersonIds: [] }));
  assert.ok(app.classificationHealth(items).degraded);
});
