'use strict';
// Generate a symbol index so contributors can read only relevant module ranges.
// Usage: node scripts/file-map.js -> scripts/FILE-MAP.md
// Search the index for a symbol, then read its source range.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const files = [...fs.readdirSync(path.join(ROOT, 'js')).filter(f => /^\d\d-.*\.js$/.test(f)).sort().map(f => 'js/' + f), 'server.js', 'style.css', 'index.html'];
let out = '# Symbol index (generated: node scripts/file-map.js)\n\nSearch symbols; read only relevant source ranges. Entries: name:line.\n';
for (const f of files) {
  const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split(/\r?\n/);
  out += `\n## ${f}(${lines.length} lines)\n`;
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
console.log(`Wrote scripts/FILE-MAP.md (${(out.length / 1024).toFixed(0)}KB)`);
