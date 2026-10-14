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
    if (typeof ex.unnecessary === 'boolean') {
      assert.equal(cards.every(c => c.type === 'unnecessary'), ex.unnecessary);
    }
  });
}
