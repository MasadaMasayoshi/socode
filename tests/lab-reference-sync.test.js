'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();

test('一般条件: 2つの検査値基準表が正常／異常で食い違う値は、充足判定の根拠にしない（単位が違えば比べない）', () => {
  const rules = t => Array.from(app.sufficiencyLabRules(t));
  assert.equal(rules('CRP 0.2 mg/dL').length, 0, '表では高値・判定側では正常：どちらとも言えない');
  assert.equal(rules('K 4.0 mmol/L').some(r => r.v === 'met'), true, '両方で正常ならこれまでどおり支持所見');
  assert.equal(rules('CRP 3.2 mg/dL').some(r => r.v === 'unmet'), true, '両方で異常なら未充足の根拠');
  assert.equal(rules('WBC 8800/μL').some(r => r.v === 'met'), true, '単位が違えば比較しない（これまでどおり）');
});
