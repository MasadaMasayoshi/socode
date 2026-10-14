'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const run = t => Array.from(app.classifyTextByRules(t));

test('hard-wrapped line is rejoined', () => {
  const r = run('現病歴 : 数年前から服薬を続けていたが、最近は仕事\nの忙しさで疲労感が強まり、入院となった。');
  assert.ok(r.some(c => /仕事の忙しさで/.test(c.text || c.content || '')));
});
test('short colon-less section headings do not become card text', () => {
  const r = run('生活状況\n紫外線対策は意識していなかった\n食事は外食が多い');
  assert.ok(!r.some(c => /生活状況、|生活状況/.test((c.text || c.content || '').replace(/^生活状況$/, '')) ));
  assert.ok(r.some(c => /^紫外線対策/.test(c.text || c.content || '')));
});
test('a line ending in a particle-less sentence is not joined to the next real line', () => {
  const r = run('食事は全量摂取した。\nのどの痛みを訴える。');
  assert.ok(r.some(c => /食事は全量摂取した。/.test(c.text || c.content || '')) && r.some(c => /のどの痛み/.test(c.text || c.content || '')));
});

test('noun-only blocks after a generic symptom list stay part of the list', () => {
  const r = run('全身症状\n発熱、倦怠感、\n疲れやすい、\n体重減少など\n\n脱毛\n光線過敏症\n\n生活状況\n紫外線対策は意識していなかった');
  const t = c => c.text || c.content || '';
  assert.ok(r.filter(c => /光線過敏症|脱毛/.test(t(c))).every(c => c.type === 'unnecessary' || c.category === 'unnecessary'));
  assert.ok(r.some(c => /^紫外線対策/.test(t(c)) && !(c.type === 'unnecessary' || c.category === 'unnecessary')));
});
test('lab unit written with lowercase l (μl, dl) is read like μL, dL', () => {
  const r = app.analyzeLabCard('WBC 3,000/μl (減少)', null);
  assert.strictEqual(r.quality, 'valid');
});
