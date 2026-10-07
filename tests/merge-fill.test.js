'use strict';
// 片方にしか無い項目の取り込み（fillMissingFields）の検証。server.jsから関数だけ取り出して確かめる
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const a = src.indexOf('function recordTime(');
const b = src.indexOf('function mergeKeyedPatientFields(');
const { mergeKeyedRecords } = new Function(src.slice(a, b) + '\nreturn { mergeKeyedRecords };')();
test('新しい方が勝っても、片方にしか無い項目は取り込む', () => {
  const x = { n1: { updatedAt: '2026-01-02T00:00:00Z', text: 'new' } };
  const y = { n1: { updatedAt: '2026-01-01T00:00:00Z', text: 'old', sufficiencyPre: 'sufficient' } };
  const m = mergeKeyedRecords(x, y);
  assert.equal(m.n1.text, 'new');
  assert.equal(m.n1.sufficiencyPre, 'sufficient');
});
