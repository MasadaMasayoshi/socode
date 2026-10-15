'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const vitalsOf = t => app.analyzeLabData({ items: [{ id: 'x', type: 'o', text: t, timestamp: '10/12 9:00', hendersonIds: [7] }], sourceText: '' }).vitals.map(v => `${v.key}=${v.raw || v.value}`).sort().join(' ');

test('abbreviated vitals in one line are all read', () => {
  assert.strictEqual(vitalsOf('BT36.8 HR80 BP120/70 RR18 SpO2 98%'), 'SpO2=98 体温=36.8 呼吸数=18 脈拍=80 血圧=120/70');
  assert.strictEqual(vitalsOf('T 36.5 P 78 R 16 BP 118/72'), '体温=36.5 呼吸数=16 脈拍=78 血圧=118/72');
  assert.strictEqual(vitalsOf('KT:37.2'), '体温=37.2');
});
test('lab abbreviations and implausible numbers are not mistaken for vitals', () => {
  assert.strictEqual(vitalsOf('CRP 0.3 TP 6.5 T-Bil 1.2'), '');
  assert.strictEqual(vitalsOf('PR間隔 160ms'), '');
  assert.strictEqual(vitalsOf('R 2回'), '');
});
test('the evaluation lists vitals together with lab values', () => {
  const cp = { items: [{ id: '1', type: 'o', text: 'BT 37.8℃ HR 104', timestamp: '10/12 9:00', hendersonIds: [7] }, { id: '2', type: 'o', text: 'WBC 3,000/μL', timestamp: '10/12 9:00', hendersonIds: [7] }], sourceText: '' };
  const a = app.buildLabAssessment(cp);
  assert.ok(/体温：37\.8℃/.test(a.text) && /脈拍：104/.test(a.text) && /WBC/.test(a.text));
});
