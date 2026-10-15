'use strict';
// OCR'd lab-report sheets: header/footer metadata and unfilled template rows are not findings;
// rows with a measured result become value cards with the sheet's own reference and the right category tag.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const cards = t => Array.from(app.classifyTextByRules(t));
const ids = c => Array.from(c.hendersonIds || []);
const HEAD = '項目名 | 基準値 | 単位 | 結 果\n--- | --- | --- | ---\n';

test('report header/footer metadata is unnecessary with a reason; sex/age line is basic info', () => {
  const c = cards(['1234567', 'さくらクリニック', '担当医', '診療科', '内科', 'カルテNo. 100', '採取日 2026/1/1', '受付No. 5-6', '備考', '外来', '男性', '30歳',
    '完了 0001', '責任者 田中 一郎', '東検査センター', '東検査センター 21点', '報告日 2026/1/2'].join('\n'));
  const un = c.filter(x => x.type === 'unnecessary');
  assert.equal(un.length, c.length - 1, c.map(x => x.text).join(' / '));
  const basic = c.find(x => x.type !== 'unnecessary');
  assert.match(basic.text, /30歳/);
  assert.ok(ids(basic).includes(9));
  assert.ok(un.every(x => x.ruleDecision && x.ruleDecision.ruleId === 'source.report-metadata' && x.ruleDecision.reason), JSON.stringify(un.map(x => x.ruleDecision)));
});

test('metadata patterns do not swallow clinical sentences', () => {
  assert.notEqual(cards('担当医より手術の説明あり。')[0].type, 'unnecessary');
  assert.notEqual(cards('家族と病院に行くのが不安と話す。')[0].type, 'unnecessary');
});

test('table rows with no measured value are unfilled template rows; rows with a value stay findings', () => {
  const c = cards(HEAD + '白 血 球 数 | 3500～9700 | /μL | WBC 4780\nBaso | 0.0～2.0 | % | B\nその他 1 | | |\nEBL | | | EBL\nHbA1c | 4.6～6.2 | % | A1C');
  const find = c.filter(x => x.type !== 'unnecessary');
  assert.deepEqual(find.map(x => x.text), ['WBC 4780 /μL (基準値: 3500〜9700)']);
  const tpl = c.filter(x => x.ruleDecision && x.ruleDecision.ruleId === 'source.lab-template-row');
  assert.equal(tpl.length, 3, c.map(x => x.text).join(' / '));
  assert.ok(!c.some(x => /白 血 球 数/.test(x.text)), 'no raw duplicate row beside the value card');
});

test('letter-spaced names, sex-specific references and echoed abbreviations become value cards with category tags', () => {
  const c = cards(HEAD + 'M C V | M 83～101 F 80～101 | fL | MCV 90\n尿 素 窒 素 ( U N ) | 8.0～20.0 | mg/dL | UN 12.8\n血 小 板 数 | 14.0～37.9 | ×10⁴/μL | 血小板 21.6\nγ - G T | M 79以下 F 48以下 | U/L | γ-GT 18');
  const by = k => c.find(x => x.text.startsWith(k));
  assert.equal(by('MCV 90').text, 'MCV 90 fL (基準値: 男性 83〜101／女性 80〜101)');
  assert.deepEqual(ids(by('UN 12.8')), [3]);
  assert.deepEqual(ids(by('血小板 21.6')), [9]);
  assert.ok(ids(by('γ-GT 18')).includes(2));
  const vals = c.filter(x => x.type !== 'unnecessary');
  assert.equal(vals.length, 4);
  assert.ok(vals.every(x => x.type === 'o' && ids(x).length), vals.map(x => x.text).join(' / '));
});

test('when the record states the sex, the matching sex-specific range is used', () => {
  const c = cards('女性\n' + HEAD + 'M C V | M 83～101 F 80～101 | fL | MCV 90');
  assert.ok(c.some(x => x.text === 'MCV 90 fL (基準値: 80〜101)'), c.map(x => x.text).join(' / '));
});

test('a repeated page does not create duplicate value cards', () => {
  const page = HEAD + 'Na | 135～145 | mEq/L | Na 141';
  assert.equal(cards(page + '\n\n' + page).filter(x => /^Na 141/.test(x.text)).length, 1);
});
