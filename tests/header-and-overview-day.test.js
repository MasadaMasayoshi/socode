'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { readAppSource } = require('./app-helpers');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const app = readAppSource();

test('Header retains export controls and groups utility actions into three menu choices', () => {
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  const moreMenu = header.slice(header.indexOf('id="more-menu"'));
  ['btn-export-docs', 'btn-export-pdf', 'btn-toggle-theme'].forEach(id => {
    assert.match(header, new RegExp(`id="${id}"`), id);
    assert.ok(!moreMenu.includes(`id="${id}"`), `${id} はメニューの外（好評だった見た目のまま）`);
  });
  ['btn-manual-review', 'btn-data-tools', 'btn-open-settings'].forEach(id => assert.match(moreMenu, new RegExp(`id="${id}"`), id));
  assert.equal((moreMenu.match(/role="menuitem"/g) || []).length, 3);
  for (const id of ['btn-save-data', 'input-load-data', 'btn-open-admin', 'btn-toggle-font']) assert.ok(!header.includes(`id="${id}"`));
  const backup = html.slice(html.indexOf('<dialog id="data-tools"'), html.indexOf('</dialog>', html.indexOf('<dialog id="data-tools"')));
  ['btn-save-data', 'input-load-data', 'btn-load-data', 'btn-restore-import'].forEach(id => assert.ok(backup.includes(`id="${id}"`)));
  const settings = html.slice(html.indexOf('id="modal-settings"'), html.indexOf('id="modal-missing"'));
  ['btn-open-admin', 'btn-toggle-font', 'settings-ocr'].forEach(id => assert.ok(settings.includes(`id="${id}"`)));
  assert.ok(!/人が接続中/.test(header), '接続人数は数字だけの小さな表示');
  assert.match(header, /id="presence-count"/);
  assert.match(app, /function closeHeaderMenus/);
});

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
