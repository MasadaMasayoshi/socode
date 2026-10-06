'use strict';
// 版（バージョン）の書き込み（改善提案3：ファイルが古い版に戻ったことに気づけるようにする）。
// ------------------------------------------------------------------------
// OneDrive の同期などで一部のファイルだけが古い版に戻ると、画面は動くのに直したはずの所が
// 直っていない、という分かりにくい状態になる（実際に socode フォルダの app.js で起きた）。
// そこで、プログラムを更新するたびにこのスクリプトで同じ版を
//   ・index.html の <meta name="app-version">、js・css の読み込み（?v=版。ブラウザの古い写しも使わせない）
//   ・js/01〜15 の各ファイルの先頭の「APP_FILE_VERSIONS」の行（中身が変わったファイルだけ。下の説明を参照）
// に書き込む。画面の起動時に、各ファイルの版が index.html の版とそろっているかを確かめ、
// そろっていなければ画面の上に赤い警告を出す（js/10 の checkAppFileVersions 参照）。
//   使い方： node scripts/stamp-version.js [版] [--all]   （版を省略すると今日の日付＋時刻。--all ですべてのファイルの版を上げる）
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { APP_SCRIPT_FILES } = require('../tests/app-helpers');

const now = new Date();
const pad = n => String(n).padStart(2, '0');
const version = process.argv[2] || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.${pad(now.getHours())}${pad(now.getMinutes())}`;
if (!/^[\w.-]{1,40}$/.test(version)) throw new Error('版には英数字・ピリオド・ハイフンだけを使ってください');

const MARK_REGEX = /^    \(window\.APP_FILE_VERSIONS = window\.APP_FILE_VERSIONS \|\| \{\}\)\['[^']*'\] = '[^']*';.*\n/m;
const MARK_VERSION = /\(window\.APP_FILE_VERSIONS = window\.APP_FILE_VERSIONS \|\| \{\}\)\['[^']*'\] = '([^']*)'/;

// 【中身が変わったファイルだけ版を上げる】利用者からの指摘：「不必要なファイルの更新がされている」。
// 以前は版を上げるたびに js の15ファイルすべての版の行を書き換えていたため、中身を直していないファイルまで
// 毎回「変更あり」になり、コミットに入っていた。今は各ファイルの中身（版の行を除く）の指紋（ハッシュ）を
// scripts/file-versions.json に覚えておき、指紋が変わったファイルだけ新しい版を書き込む。
// index.html には全体の版（app-version）と、ファイルごとの版（app-file-versions）を書く。起動時の確認（js/10）は
// ファイルごとの版と比べるので、古いファイルに戻ったことには今までどおり気づける。
const crypto = require('crypto');
const MANIFEST = path.join(ROOT, 'scripts', 'file-versions.json');
const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
const fingerprint = s => crypto.createHash('sha1').update(s.replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
const all = process.argv.includes('--all'); // すべてのファイルの版を上げたいとき
const fileVersions = {};
const changed = [];

APP_SCRIPT_FILES.forEach(rel => {
  const file = path.join(ROOT, rel);
  let s = fs.readFileSync(file, 'utf8');
  const id = path.basename(rel).slice(0, 2);
  const fp = fingerprint(s.replace(MARK_REGEX, ''));
  const current = (s.match(MARK_VERSION) || [])[1];
  const prev = manifest[rel];
  const same = !all && current && prev && prev.hash === fp && prev.version === current;
  const v = same ? current : version;
  if (!same) {
    const line = `    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['${id}'] = '${v}'; // 版（scripts/stamp-version.js が書き込む）\n`;
    if (MARK_REGEX.test(s)) s = s.replace(MARK_REGEX, line);
    else {
      // 先頭の説明のコメントの直後（最初の空行の後）に入れる
      const i = s.indexOf('\n\n');
      s = s.slice(0, i + 2) + line + s.slice(i + 2);
    }
    fs.writeFileSync(file, s);
    changed.push(rel);
  }
  manifest[rel] = { version: v, hash: fp };
  fileVersions[id] = v;
});

// CSS（ファイルの中は書き換えない。index.html の ?v= だけ、中身が変わったときに新しい版にする）
const CSS_FILES = ['style.css', 'vendor/tailwind.css', 'vendor/fontawesome/css/all.min.css'];
const cssVersions = {};
CSS_FILES.forEach(rel => {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return;
  const fp = fingerprint(fs.readFileSync(file, 'utf8'));
  const prev = manifest[rel];
  const same = !all && prev && prev.hash === fp;
  cssVersions[rel] = same ? prev.version : version;
  if (!same) changed.push(rel);
  manifest[rel] = { version: cssVersions[rel], hash: fp };
});

const htmlFile = path.join(ROOT, 'index.html');
let html = fs.readFileSync(htmlFile, 'utf8');
html = html.replace(/<meta name="app-version" content="[^"]*">/, `<meta name="app-version" content="${version}">`);
const fvText = Object.keys(fileVersions).sort().map(id => `${id}:${fileVersions[id]}`).join(',');
if (/<meta name="app-file-versions" content="[^"]*">/.test(html)) html = html.replace(/<meta name="app-file-versions" content="[^"]*">/, `<meta name="app-file-versions" content="${fvText}">`);
else html = html.replace(/(<meta name="app-version" content="[^"]*">)/, `$1\n  <meta name="app-file-versions" content="${fvText}">`);
html = html.replace(/((?:src|href)=")(js\/[\w-]+\.js|style\.css|vendor\/[\w./-]+\.css)(?:\?v=[\w.-]*)?"/g, (m, pre, rel) => {
  const v = rel.startsWith('js/') ? fileVersions[path.basename(rel).slice(0, 2)] : cssVersions[rel];
  return `${pre}${rel}?v=${v || version}"`;
});
fs.writeFileSync(htmlFile, html);
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`版 ${version} を書き込みました。版を上げたファイル：${changed.length ? changed.join('、') : '（なし。index.html だけ）'}`);
