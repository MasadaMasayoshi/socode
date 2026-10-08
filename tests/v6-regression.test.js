const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers');
test('pathology/stage and blood type text is not tagged to respiration; real respiratory text is', () => {
  const app = loadApp();
  const tags = t => Array.from(app.detectMultipleHendersonTags(t));
  assert.ok(!tags('病理結果: Stage IB、腫瘍マーカーCEA正常').includes(1));
  assert.ok(tags('SpO2 98%、呼吸苦なし').includes(1));
});
