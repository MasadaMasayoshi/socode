'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const build = file => {
  const text = fs.readFileSync(path.join(__dirname, 'fixtures', file), 'utf8');
  const items = app.groupClinicalPhrasesWithTimestamps(text).filter(c => !c.isUnnecessaryBoilerplate).map((c, k) => {
    const ids = Array.from(new Set(app.detectMultipleHendersonTags(c.text)));
    return { id: `i${k}`, type: 'o', text: c.text, timestamp: c.timestamp, hendersonIds: ids, assessmentCols: Object.fromEntries(ids.map(h => [h, 'postadmission'])) };
  });
  const cp = { id: 'x', title: 'x', items, carePlans: {}, sourceText: text, myAssessments: {}, missingChecks: {} };
  app.buildCarePlansByRules(cp);
  return Array.from(app.carePlanList(cp)).map(p => p.problem).join('|');
};

test('病名に依存しない所見由来の問題: 疼痛・活動耐性・骨髄抑制・睡眠・家族の負担が記録にあれば計画になる', () => {
  const t = build('synthetic-lung-chemo-70f.txt');
  ['疼痛', '活動耐性', '感染リスク', '睡眠', '家族介護者'].forEach(w => assert.match(t, new RegExp(w), w));
});
test('反例: 過去のがんがあっても、イレウスの腹痛を「がん性疼痛」にしない／所見がなければ作らない', () => {
  assert.doesNotMatch(build('student-records/st08_ileus_soap.txt'), /がん性疼痛/);
  assert.doesNotMatch(build('synthetic-postpartum.txt'), /家族介護者|感染リスク状態（骨髄/);
});

test('退院後の支援・本人の希望と価値観は、関連図に前提として載り、価値観の表出は判定保留になる', () => {
  const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'synthetic-lung-chemo-70f.txt'), 'utf8');
  const items = app.groupClinicalPhrasesWithTimestamps(text).filter(c => !c.isUnnecessaryBoilerplate).map((c, k) => ({ id: `i${k}`, type: 'o', text: c.text, timestamp: c.timestamp, hendersonIds: Array.from(new Set(app.detectMultipleHendersonTags(c.text))), assessmentCols: {} }));
  const cp = { id: 'x', title: 'x', items, carePlans: {}, sourceText: text, myAssessments: {}, missingChecks: {} };
  const labels = app.buildRelationMapFromRecord(cp).nodes.map(n => n.label).join('|');
  assert.match(labels, /訪問看護/);
  assert.match(labels, /お墓|葬儀/);
  assert.equal(app.sufficiencyCardVerdict({ text: '「お墓や葬儀のことは夫と話し始めた」と話す。', type: 's' }, 11, 'post').v, 'pending');
  assert.equal(app.sufficiencyCardVerdict({ text: '「痛みがつらい」と話す。', type: 's' }, 11, 'post').v, '', '価値観の表出がなければ判定しない');
});
