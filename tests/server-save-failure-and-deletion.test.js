'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { setupIsolatedDataDir, startEphemeralServer, baseUrl, stopServer } = require('./helpers');

setupIsolatedDataDir();
const server = require('../server.js');
let http, url;
test.before(async () => { http = await startEphemeralServer(server.app); url = baseUrl(http); });
test.after(async () => { server.setWriteFileImplForTest(null); await stopServer(http); });
const uniq = () => crypto.randomBytes(6).toString('hex');
const put = (id, body) => fetch(`${url}/api/patients/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const patient = (id, items = []) => ({ id, title: 'テスト', items, deletedItemIds: [], updatedAt: new Date().toISOString() });

test('保存障害：ファイルの書き込みに失敗したら 500 / ok:false を返し、保存できなかった患者は一覧に出さない', async () => {
  const id = 'fail_' + uniq();
  server.setWriteFileImplForTest(async () => { throw new Error('ENOSPC: no space left on device'); });
  const res = await put(id, patient(id, [{ id: 'c1', text: 'カード' }]));
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.match(body.error, /保存に失敗/);
  const all = await (await fetch(`${url}/api/patients`)).json();
  assert.ok(!all[id], '保存できなかった変更はサーバーの手元にも残さない');

  server.setWriteFileImplForTest(null);
  const retry = await put(id, patient(id, [{ id: 'c1', text: 'カード' }]));
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).ok, true);
});

test('保存障害：学習データなど他のAPIも、書き込みに失敗したら 500 / ok:false を返す', async () => {
  server.setWriteFileImplForTest(async () => { throw new Error('EACCES'); });
  const res = await fetch(`${url}/api/extraction-criteria`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'テスト基準 ' + uniq() }) });
  server.setWriteFileImplForTest(null);
  assert.equal(res.status, 500);
  assert.equal((await res.json()).ok, false);
});

test('完全削除：削除した患者に古い同期（PUT・一括同期）が来ても復活させず、削除の記録を返す', async () => {
  const id = 'del_' + uniq();
  assert.equal((await put(id, patient(id, [{ id: 'c1', text: '古いカード' }]))).status, 200);
  const del = await fetch(`${url}/api/patients/${id}`, { method: 'DELETE' });
  assert.equal(del.status, 200);

  const stale = await put(id, { ...patient(id, [{ id: 'c1', text: '古いカード' }]), updatedAt: new Date(Date.now() + 60000).toISOString() });
  assert.equal(stale.status, 410);
  assert.equal((await stale.json()).deleted, true);
  const sync = await fetch(`${url}/api/patients/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [id]: patient(id) }) });
  const syncBody = await sync.json();
  assert.deepEqual(syncBody.deleted, [id]);
  const all = await (await fetch(`${url}/api/patients`)).json();
  assert.ok(!all[id], '削除した患者は一覧に出ない');
  const deletions = await (await fetch(`${url}/api/patient-deletions`)).json();
  assert.ok(deletions[id], '削除の記録を返す');
});
