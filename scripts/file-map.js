'use strict';
// ファイルの目次（FILE-MAP.md）を作る。巨大な js/01〜15 を全部読まずに、Grep で「どのファイルの何行目に何があるか」を引くため。
//   使い方： node scripts/file-map.js   → scripts/FILE-MAP.md
//   Claude向けの使い方： FILE-MAP.md は読まずに Grep（例：関数名）で引き、必要な行だけ Read（offset/limit）する。
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const files = [...fs.readdirSync(path.join(ROOT, 'js')).filter(f => /^\d\d-.*\.js$/.test(f)).sort().map(f => 'js/' + f), 'server.js', 'style.css', 'index.html'];
let out = '# ファイルの目次（自動生成：node scripts/file-map.js）\n\nこのファイルは読まずに Grep で引く。形式：`ファイル:行 名前`（関数・定数・window.xxx）。\n';
for (const f of files) {
  const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split(/\r?\n/);
  out += `\n## ${f}（${lines.length}行）\n`;
  if (f.endsWith('.js')) {
    const names = [];
    lines.forEach((l, i) => {
      const m = l.match(/^\s{0,4}(?:async\s+)?function\s+([A-Za-z0-9_$]+)/) || l.match(/^\s{0,4}window\.([A-Za-z0-9_$]+)\s*=/) || l.match(/^\s{0,4}const\s+([A-Z][A-Z0-9_]{3,})\s*=/);
      if (m) names.push(`${m[1]}:${i + 1}`);
    });
    out += names.join(' ') + '\n';
  } else if (f === 'style.css') {
    const marks = [];
    lines.forEach((l, i) => { const m = l.match(/^\s*\/\*\s*(.{4,40}?)[（(：:\s]/); if (m) marks.push(`${m[1].trim()}:${i + 1}`); });
    out += marks.slice(0, 80).join(' ') + '\n';
  }
}
fs.writeFileSync(path.join(__dirname, 'FILE-MAP.md'), out);
console.log(`scripts/FILE-MAP.md を作りました（${(out.length / 1024).toFixed(0)}KB）`);
