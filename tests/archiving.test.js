'use strict';
// 古いログの自動整理（アーカイブ）の検証。90日より古い記録がGET .../archive側へ移り、
// 通常の一覧(GET /api/case-log 等)には出てこなくなることを確認する。
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { setupIsolatedDataDir, startEphemeralServer, baseUrl, stopServer } = require('./helpers');

setupIsolatedDataDir();
const { app, runArchiving } = require('../server.js');

let server, url;

test.before(async () => {
  server = await startEphemeralServer(app);
  url = baseUrl(server);
});

test.after(async () => {
  await stopServer(server);
});

const uniq = () => crypto.randomBytes(6).toString('hex');

test('90日より古い事例ログはrunArchiving()実行後、通常一覧から消えアーカイブ側に現れる', async () => {
  const oldText = '古い事例' + uniq();
  const recentText = '最近の事例' + uniq();

  // 直接daysAgoの日時を指定して記録する（atを明示的に渡せる/api/learning-eventの仕様を利用）
  const daysAgo = d => new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();
  await fetch(`${url}/api/learning-event`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: oldText, action: 'type', payload: { type: 's' }, at: daysAgo(100) })
  });
  await fetch(`${url}/api/learning-event`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: recentText, action: 'type', payload: { type: 's' }, at: daysAgo(1) })
  });

  await runArchiving();

  const logRes = await fetch(`${url}/api/case-log`);
  const log = await logRes.json();
  assert.ok(!log.some(e => e.text === oldText), '90日より古い記録は通常の事例ログ一覧から消える');
  assert.ok(log.some(e => e.text === recentText), '最近の記録は通常の事例ログ一覧に残る');

  const archiveRes = await fetch(`${url}/api/case-log/archive`);
  const archive = await archiveRes.json();
  assert.ok(archive.some(e => e.text === oldText), '90日より古い記録はアーカイブ側に移動している');
  assert.ok(!archive.some(e => e.text === recentText), '最近の記録はアーカイブ側には無い');
});

test('runArchiving()を続けて呼んでも、移動対象が無ければ状態は変化しない（べき等性）', async () => {
  const before = await (await fetch(`${url}/api/case-log`)).json();
  await runArchiving();
  await runArchiving();
  const after = await (await fetch(`${url}/api/case-log`)).json();
  assert.equal(after.length, before.length, '移動対象が無い状態で繰り返し実行しても件数は変わらない');
});
