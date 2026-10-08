'use strict';
// 静かなテスト実行：全部のテストを走らせ、結果は「合計」と「いつもの失敗以外の失敗」だけを表示する（AI が読む量を減らすため）。
// いつもの失敗（サンドボックスにサーバー用の環境がないため）は BASELINE に名前で書いてある。
// 使い方： npm run test:quiet            （全部）
//          npm run test:quiet -- tests/careplan-auto.test.js   （指定したファイルだけ。速い）
const { spawnSync } = require('child_process');
const BASELINE = [
  'tests/api.test.js', 'tests/archiving.test.js', 'tests/merge-patient-record.test.js',
  'tests/rate-limit-and-utils.test.js', 'tests/review-fixes-server.test.js',
  'tests/server-multi-server-mongo.test.js', 'tests/server-save-failure-and-deletion.test.js',
  '複数の端末'
];
const files = process.argv.slice(2);
const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], { encoding: 'utf8', maxBuffer: 1 << 28 });
const out = (r.stdout || '') + (r.stderr || '');
const num = k => (out.match(new RegExp('^# ' + k + ' (\\d+)', 'm')) || [])[1] || '?';
const bad = out.split('\n').filter(l => /^not ok /.test(l)).map(l => l.replace(/^not ok \d+ - /, ''));
const fresh = bad.filter(n => !BASELINE.some(b => n.includes(b)));
console.log(`tests ${num('tests')} / pass ${num('pass')} / fail ${num('fail')}（いつもの失敗 ${bad.length - fresh.length}）`);
if (fresh.length) {
  console.log('新しい失敗:\n' + fresh.map(n => '  ' + n).join('\n'));
  process.exitCode = 1;
} else console.log('新しい失敗: なし');
