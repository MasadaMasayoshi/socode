'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { readAppSource } = require('./app-helpers');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const app = readAppSource();

test('表の上に1〜14の切り替えボタン（前後・すべて）を置き、選んだ欲求の行だけを表示する', () => {
  assert.match(html, /<div id="assessment-need-nav" class="need-nav"/);
  const render = app.slice(app.indexOf('function renderAssessmentTable'), app.indexOf('function renderAssessmentCellCard'));
  assert.match(render, /const hiddenRow = selectedNeed !== 'all' && Number\(selectedNeed\) !== need\.id;\s*if \(hiddenRow\) tr\.classList\.add\('hidden'\)/);
  assert.match(render, /renderNeedNavigator\(activeItems\)/);
  assert.match(app, /onclick="selectAssessmentNeed\(\$\{need\.id\}\)"/);
  assert.match(app, /onclick="stepAssessmentNeed\(-1\)"/);
  assert.match(app, /onclick="selectAssessmentNeed\('all'\)"/);
  assert.match(app, /return n >= 1 && n <= 14 \? n : 1;/, '最初は1.呼吸のページ');
});

test('← →キーでも前後の欲求に移る（入力中・一覧表示中・ダイアログ表示中は動かない）', () => {
  const key = app.slice(app.indexOf("if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;"));
  assert.match(key, /view-assessment/);
  assert.match(key, /nav.contains\(e.target\)/);
  assert.match(key, /getSelectedAssessmentNeed\(\)\}.*focus\(\)/);
  assert.match(key, /isCardOverviewOpen\(\)/);
  assert.match(key, /INPUT\|TEXTAREA\|SELECT/);
  assert.match(key, /stepAssessmentNeed\(e\.key === 'ArrowLeft' \? -1 : 1\)/);
});
