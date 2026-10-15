const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers');
test('compare table renders flags, change and caps columns', () => {
  const app = loadApp();
  const table = { columns: [1,2,3].map(n => ({ key: 'k'+n, day: 'D'+n, time: '' })), rows: [{ key: 'X', group: 'g', unit: 'u', ref: '1-5', cells: { k1: [{ value: '3', flag: '' }], k2: [{ value: '4', flag: '' }], k3: [{ value: '9', flag: 'high' }] } }] };
  const html = app.compareValuesTableHtml(table, { maxCols: 2 });
  assert.match(html, /cmp-table/);
  assert.match(html, /lt-high/);
  assert.match(html, /▲/);
  assert.doesNotMatch(html, /D1</);
  assert.strictEqual(app.renderCompareValuesHtml([], {}), '');
});
