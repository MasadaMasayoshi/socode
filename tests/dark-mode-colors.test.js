'use strict';
// ダークモードで白い部品が残ったり、明るい塗りの上の白い文字が読めなくなったりしないことの確認
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('画面の部品に白（#fff・bg-white・text-white）を直接書かない（テーマの色 var(--…) を使う）', () => {
  const files = ['index.html', 'js/05-app-state-and-ui.js', 'js/08-assessment-tools.js', 'js/09-board.js', 'js/10-reference-page-and-startup.js', 'js/11-own-assessment.js', 'js/12-missing-checks-and-care-plan.js'];
  files.forEach(f => {
    const src = read(f);
    const hits = src.match(/#fff\b|#ffffff\b|bg-white\/9|text-white|color:#262420|bg-\[#262420\]/gi) || [];
    assert.deepEqual(hits, [], `${f} に直接の色指定: ${hits.join(', ')}`);
  });
  const css = read('style.css');
  const noPrint = css.replace(/@media print\s*\{[\s\S]*?\n    \}\n/, '');
  assert.ok(!/color:\s*#fff\b/i.test(noPrint), 'style.css の塗りの上の文字は var(--on-fill)');
});

test('ダークモードの色の組み合わせ：塗りと文字、背景と文字のコントラストが十分', () => {
  const css = read('style.css');
  const block = css.slice(css.indexOf('html[data-theme="dark"] {'));
  const v = name => (block.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`)) || [])[1];
  const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  ['accent', 'gold', 'slate', 'brick'].forEach(k => assert.ok(cr(v(k), v('on-fill')) >= 4.5, `${k} の塗りの上の文字 ${cr(v(k), v('on-fill')).toFixed(2)}`));
  ['ink', 'ink-muted', 'accent', 'accent-dark'].forEach(k => assert.ok(cr(v(k), v('surface')) >= 4.5, `${k} の文字 ${cr(v(k), v('surface')).toFixed(2)}`));
  assert.ok(cr(v('accent-dark'), v('accent-soft')) >= 4.5, 'タグの文字');
  assert.ok(cr(v('bar-btn-ink'), v('bar-btn-bg')) >= 4.5, '選択時の操作バーのボタン');
});
