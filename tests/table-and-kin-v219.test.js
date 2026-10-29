'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const texts = src => Array.from(app.classifyTextByRules(src)).map(c => c.text);

test('表：先頭の角セルが空の見出し行と、途中の空セルの列位置を保つ', () => {
  const t = texts('経過\n\n\t朝\t昼\t夜\n項目甲\t良好\t良好\t良好\n項目乙\t\t軽度\t軽度\n');
  assert.ok(t.some(x => /^項目甲：朝 良好 → 昼 良好 → 夜 良好$/.test(x)), t.join('|'));
  assert.ok(t.some(x => /^項目乙：昼 軽度 → 夜 軽度$/.test(x)), t.join('|'));
});

test('表：2列だけの表や数値の見出しは表として読み替えない', () => {
  const t = texts('項目\t値\nA\t1\nB\t2\n');
  assert.ok(!t.some(x => /→/.test(x)));
});

test('時期ラベル付きの行から切り出された検査値にラベルを戻し、ラベルだけの断片を残さない', () => {
  const t = texts('・妊娠30週：Hb10.2g/dl　鉄剤内服\n・妊娠36週：Hb11.1g/dl\n');
  assert.ok(t.some(x => /^妊娠30週: Hb 10\.2/.test(x)), t.join('|'));
  assert.ok(t.some(x => /^妊娠36週: Hb 11\.1/.test(x)), t.join('|'));
  assert.ok(!t.some(x => /^妊娠36週:\s*$/.test(x)));
});

test('ジェノグラム：複合語の「母親」と夫婦それぞれの親から家族を作らず、年齢の食い違いは注記する', () => {
  const g = app.ggBuild({ sourceText: '31歳。34歳の夫と2人暮らし。どちらの両親にとっても初孫。母親学級に参加。母児同室。夫:31歳 会社員。', items: [] });
  const roles = Array.from(g.persons).map(p => p.role);
  assert.ok(!roles.includes('母') && !roles.includes('父'), roles.join());
  const husband = Array.from(g.persons).find(p => p.role === '夫');
  assert.equal(husband.age, 34);
  assert.ok(Array.from(husband.notes).some(n => /年齢の記載が異なる/.test(n)));
  const g2 = app.ggBuild({ sourceText: '5歳。両親（父親35歳、母親30歳）と同居。', items: [] });
  const by = r => Array.from(g2.persons).find(p => p.role === r);
  assert.equal(by('父').age, 35); assert.equal(by('母').age, 30);
});
