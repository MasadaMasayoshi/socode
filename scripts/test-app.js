'use strict';
// 環境（サーバー・DB・ネットワーク）が要るテストを除いた、画面とロジックだけの高速テスト。
const fs = require('fs'), cp = require('child_process');
const skip = new Set(['api', 'archiving', 'merge-patient-record', 'public-contracts', 'rate-limit-and-utils', 'review-fixes-server', 'server-multi-server-mongo', 'server-save-failure-and-deletion']);
const files = fs.readdirSync('tests').filter(x => x.endsWith('.test.js') && !skip.has(x.slice(0, -8))).map(x => 'tests/' + x);
process.exit(cp.spawnSync('node', ['--test', ...files], { stdio: 'inherit' }).status || 0);
