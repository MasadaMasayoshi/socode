'use strict';
// 版（バージョン）の書き込み（改善提案3：ファイルが古い版に戻ったことに気づけるようにする）。
// ------------------------------------------------------------------------
// OneDrive の同期などで一部のファイルだけが古い版に戻ると、画面は動くのに直したはずの所が
// 直っていない、という分かりにくい状態になる（実際に socode フォルダの app.js で起きた）。
// そこで、プログラムを更新するたびにこのスクリプトで同じ版を
//   ・index.html の <meta name="app-version">、js・css の読み込み（?v=版。ブラウザの古い写しも使わせない）
//   ・js/01〜10 の各ファイルの先頭の「APP_FILE_VERSIONS」の行
// に書き込む。画面の起動時に、各ファイルの版が index.html の版とそろっているかを確かめ、
// そろっていなければ画面の上に赤い警告を出す（js/10 の checkAppFileVersions 参照）。
//   使い方： node scripts/stamp-version.js [版]   （版を省略すると今日の日付＋時刻）
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { APP_SCRIPT_FILES } = require('../tests/app-helpers');

const now = new Date();
const pad = n => String(n).padStart(2, '0');
const version = process.argv[2] || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.${pad(now.getHours())}${pad(now.getMinutes())}`;
if (!/^[\w.-]{1,40}$/.test(version)) throw new Error('版には英数字・ピリオド・ハイフンだけを使ってください');

const MARK_REGEX = /^    \(window\.APP_FILE_VERSIONS = window\.APP_FILE_VERSIONS \|\| \{\}\)\['[^']*'\] = '[^']*';.*\n/m;
APP_SCRIPT_FILES.forEach(rel => {
  const file = path.join(ROOT, rel);
  let s = fs.readFileSync(file, 'utf8');
  const id = path.basename(rel).slice(0, 2);
  const line = `    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['${id}'] = '${version}'; // 版（scripts/stamp-version.js が書き込む）\n`;
  if (MARK_REGEX.test(s)) s = s.replace(MARK_REGEX, line);
  else {
    // 先頭の説明のコメントの直後（最初の空行の後）に入れる
    const i = s.indexOf('\n\n');
    s = s.slice(0, i + 2) + line + s.slice(i + 2);
  }
  fs.writeFileSync(file, s);
});

const htmlFile = path.join(ROOT, 'index.html');
let html = fs.readFileSync(htmlFile, 'utf8');
html = html.replace(/<meta name="app-version" content="[^"]*">/, `<meta name="app-version" content="${version}">`);
html = html.replace(/((?:src|href)="(?:js\/[\w-]+\.js|style\.css|vendor\/[\w./-]+\.css))(?:\?v=[\w.-]*)?"/g, `$1?v=${version}"`);
fs.writeFileSync(htmlFile, html);
console.log(`版 ${version} を書き込みました（index.html と js/01〜13）。`);
