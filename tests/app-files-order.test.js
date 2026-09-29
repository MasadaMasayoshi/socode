'use strict';
// 改善提案8（app.js の分割）・3（版の確認）の検証。
//  ・index.html の <script> の順番が、テストで読み込む順番（APP_SCRIPT_FILES）と同じ。
//  ・古い app.js を index.html から読み込んでいない。
//  ・10ファイルすべてに同じ版が書き込まれていて、index.html の版と同じ（scripts/stamp-version.js）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { APP_SCRIPT_FILES } = require('./app-helpers');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

test('index.html は js/01〜10 をこの順番で読み込み、古い app.js は読み込まない', () => {
  const srcs = Array.from(html.matchAll(/<script src="([^"?]+)(?:\?v=[^"]*)?"><\/script>/g)).map(m => m[1]);
  assert.deepEqual(srcs, APP_SCRIPT_FILES);
  assert.doesNotMatch(html, /src="app\.js/);
});

test('10ファイルすべての版が index.html の版と同じ', () => {
  const expected = (html.match(/<meta name="app-version" content="([^"]*)">/) || [])[1];
  assert.ok(expected, 'index.html に版がある');
  APP_SCRIPT_FILES.forEach(f => {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const m = s.match(/\(window\.APP_FILE_VERSIONS = window\.APP_FILE_VERSIONS \|\| \{\}\)\['(\d\d)'\] = '([^']*)'/);
    assert.ok(m, `${f} に版の行がある`);
    assert.equal(m[1], path.basename(f).slice(0, 2));
    assert.equal(m[2], expected, `${f} の版`);
  });
});

test('ネット上の Tailwind（cdn.tailwindcss.com）を使わず、同梱の CSS を読み込む（改善提案7）', () => {
  assert.doesNotMatch(html, /<script[^>]+cdn\.tailwindcss\.com/);
  assert.match(html, /href="vendor\/tailwind\.css/);
  assert.ok(fs.existsSync(path.join(ROOT, 'vendor', 'tailwind.css')));
  assert.doesNotMatch(html, /<link[^>]+cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome/);
  assert.ok(fs.existsSync(path.join(ROOT, 'vendor', 'fontawesome', 'css', 'all.min.css')));
});
