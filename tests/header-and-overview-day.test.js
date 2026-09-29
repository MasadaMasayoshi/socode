'use strict';
// 利用者からの要望：
//  1. 「UIがごちゃごちゃしすぎている」→ ヘッダーは「書き出し」と「︙」メニューにまとめる（ボタンのidはそのまま）
//  2. 「一覧表示後も日時で分かりやすく区切られたほうがいい」→ カード一覧は既定で日時ごとの帯で区切る
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { readAppSource } = require('./app-helpers');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const app = readAppSource();

test('ヘッダー：テキスト書き出し・PDF書き出し・ダークモードはボタンのまま、保存・読込・設定は︙メニューの中', () => {
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  const moreMenu = header.slice(header.indexOf('id="more-menu"'));
  ['btn-export-docs', 'btn-export-pdf', 'btn-toggle-theme'].forEach(id => {
    assert.match(header, new RegExp(`id="${id}"`), id);
    assert.ok(!moreMenu.includes(`id="${id}"`), `${id} はメニューの外（好評だった見た目のまま）`);
  });
  ['btn-save-data', 'input-load-data', 'btn-open-settings', 'btn-open-admin'].forEach(id => assert.match(moreMenu, new RegExp(`id="${id}"`), id));
  assert.ok(!/人が接続中/.test(header), '接続人数は数字だけの小さな表示');
  assert.match(header, /id="presence-count"/);
  assert.match(app, /function closeHeaderMenus/);
});

// 利用者からの要望：「左上のカルテページが増えるたびにごちゃごちゃする」
test('カルテの切り替えは今のカルテの名前のボタン1つ＋一覧（検索・新しいページ・すべてのページ）', () => {
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  const menu = header.slice(header.indexOf('id="patient-menu"'), header.indexOf('<!-- 【UIの見直し】'));
  assert.match(header, /id="btn-patient-switcher" class="patient-switcher" data-menu-toggle="patient-menu"/);
  ['patient-menu-search', 'patient-tabs-container', 'btn-new-patient', 'btn-patient-list'].forEach(id => assert.match(menu, new RegExp(`id="${id}"`), id));
  const render = app.slice(app.indexOf('function renderPatientTabs'), app.indexOf('window.switchPatient'));
  assert.match(render, /patient-switcher-label/);
  assert.match(render, /visible\.length < 6/, '6件未満なら検索欄は出さない');
});

test('カード一覧：既定は日時ごとの区切り（全幅の帯）、S・Oごとにも切り替えられる', () => {
  assert.match(html, /id="btn-overview-mode" onclick="toggleCardOverviewMode\(\)"/);
  const sections = app.slice(app.indexOf('function overviewSections'), app.indexOf('function overviewOrderedItems'));
  assert.match(sections, /groupItemsByDay\(active\)/);
  assert.match(app, /return localStorage\.getItem\(OVERVIEW_MODE_KEY\) === 'type' \? 'type' : 'day'/, '既定は日時ごと');
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8'), /\.ov-day-heading \{ column-span: all;/);
});
