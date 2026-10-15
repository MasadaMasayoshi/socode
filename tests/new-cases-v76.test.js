'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const cls = t => Array.from(app.classifyTextByRules(t));
test('Ca / P / LDH / neutrophil count become lab cards', () => {
  const c = cls('検査値：Ca 7.6mg/dL、P 6.8mg/dL。\nLDH 612U/L。\n好中球数 80/μL。');
  const all = c.map(x => x.text).join('|');
  assert.ok(/Ca 7\.6/.test(all) && /P 6\.8/.test(all) && /LDH 612/.test(all));
});
test('diet limit "K 1,500mg以下" is not a blood potassium value', () => {
  const c = cls('夕食は5割摂取。カリウム制限食（K 1,500mg以下）、塩分6gの食事。');
  assert.ok(!c.some(x => /K 1,500 mEq/.test(x.text)));
  assert.ok(c.some(x => /K 1,500mg以下/.test(x.text)));
});
test('Parkinson motor signs are tagged 4', () => {
  const c = cls('四肢に筋固縮あり、手指に安静時振戦あり。小刻み歩行でありすくみ足がみられる。');
  assert.ok(c.some(x => Array.from(x.hendersonIds).includes(4)));
});
