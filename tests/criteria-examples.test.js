'use strict';
// Notebook examples (tests/golden/criteria-examples.json) must keep holding in the code.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const { examples } = require('./golden/criteria-examples.json');
const app = loadApp();

for (const ex of examples) {
  test(`criteria example: ${ex.rule} / ${ex.text}`, () => {
    const cards = Array.from(app.classifyTextByRules(ex.text));
    const ids = new Set(cards.flatMap(c => Array.from(c.hendersonIds || [])));
    (ex.has || []).forEach(id => assert.ok(ids.has(id), `need ${id} missing`));
    (ex.not || []).forEach(id => assert.ok(!ids.has(id), `need ${id} must not be set`));
    // Since v.59 a disease-description symptom list is split into one card per symptom, each flagged diseaseGeneral.
    if (ex.diseaseGeneral) {
      assert.ok(cards.length > 1 && cards.every(c => c.diseaseGeneral === true && c.type !== 'unnecessary'));
    }
    if (typeof ex.unnecessary === 'boolean') {
      assert.equal(cards.every(c => c.type === 'unnecessary'), ex.unnecessary);
    }
  });
}
