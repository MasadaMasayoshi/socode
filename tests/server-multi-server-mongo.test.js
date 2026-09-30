'use strict';
// 複数のサーバー（ローカル版と公開版）が同じMongoDBを使うときの不具合の再現と修正の確認（模擬DBを使う）
//  ・以前は各サーバーが手元の全患者を1つの文書に上書き保存し、一方が登録した患者をもう一方が消していた
//  ・患者1人＝1文書にし、DBから読み直してマージ・版（rev）で更新の競合を見つける
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { setupIsolatedDataDir, startEphemeralServer, baseUrl, stopServer } = require('./helpers');

setupIsolatedDataDir();
process.env.MONGODB_URI = 'mongodb://fake-for-test/shared';
process.env.NURSING_MONGODB_MODULE = path.join(__dirname, 'fixtures', 'fake-mongodb.js');
const serverPath = require.resolve('../server.js');
function loadServerInstance() {
  delete require.cache[serverPath];
  return require('../server.js');
}
const fakeMongo = require('./fixtures/fake-mongodb.js');
const serverA = loadServerInstance(); // ローカル版
const serverB = loadServerInstance(); // 公開版（別のプロセスと同じく、手元のデータは別）
let httpA, httpB, urlA, urlB;
test.before(async () => {
  httpA = await startEphemeralServer(serverA.app); urlA = baseUrl(httpA);
  httpB = await startEphemeralServer(serverB.app); urlB = baseUrl(httpB);
});
test.after(async () => { await stopServer(httpA); await stopServer(httpB); });
const put = (url, id, body) => fetch(`${url}/api/patients/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const patient = (id, items, extra = {}) => ({ id, title: id, items, deletedItemIds: [], updatedAt: new Date().toISOString(), ...extra });

test('別々のサーバーが登録した患者を、互いに消さない（どちらのサーバーからも両方見える）', async () => {
  assert.equal((await put(urlA, 'pA', patient('pA', [{ id: 'a1', text: 'ローカル版で登録' }]))).status, 200);
  assert.equal((await put(urlB, 'pB', patient('pB', [{ id: 'b1', text: '公開版で登録' }]))).status, 200);
  for (const url of [urlA, urlB]) {
    const all = await (await fetch(`${url}/api/patients`)).json();
    assert.ok(all.pA && all.pB, `${url} から両方の患者が見える`);
  }
});

test('同じ患者を別々のサーバーで同時に保存しても、両方のカードが残る（更新の競合を見つけて読み直す）', async () => {
  await put(urlA, 'pC', patient('pC', [{ id: 'c0', text: '最初のカード' }]));
  const [ra, rb] = await Promise.all([
    serverA.patientStoreSave('pC', patient('pC', [{ id: 'c0', text: '最初のカード' }, { id: 'cA', text: 'ローカル版で追加', _touchedAt: new Date().toISOString() }])),
    serverB.patientStoreSave('pC', patient('pC', [{ id: 'c0', text: '最初のカード' }, { id: 'cB', text: '公開版で追加', _touchedAt: new Date().toISOString() }]))
  ]);
  assert.ok(ra.patient && rb.patient);
  const all = await (await fetch(`${urlA}/api/patients`)).json();
  const ids = all.pC.items.map(i => i.id).sort();
  assert.deepEqual(ids, ['c0', 'cA', 'cB']);
});

test('一方のサーバーで完全に削除した患者は、もう一方のサーバーへの古い保存で復活しない', async () => {
  await put(urlA, 'pD', patient('pD', [{ id: 'd1', text: 'カード' }]));
  assert.equal((await fetch(`${urlB}/api/patients/pD`, { method: 'DELETE' })).status, 200);
  const stale = await put(urlA, 'pD', patient('pD', [{ id: 'd1', text: 'カード' }]));
  assert.equal(stale.status, 410);
  const all = await (await fetch(`${urlA}/api/patients`)).json();
  assert.ok(!all.pD);
  const deletions = await (await fetch(`${urlA}/api/patient-deletions`)).json();
  assert.ok(deletions.pD);
});

test('以前の形式（全患者を1つの文書に保存）からの移行：起動時に患者1人＝1文書に分け、既にある患者は上書きしない', async () => {
  const uri = 'mongodb://fake-for-test/legacy';
  const client = new fakeMongo.MongoClient(uri);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB_NAME || 'nursing_assessment');
  await db.collection('app_state').updateOne({ _id: 'patients' }, { $set: { data: { old1: patient('old1', [{ id: 'x', text: '古い形式の患者' }]) } } }, { upsert: true });
  await db.collection('patients').insertOne({ _id: 'old2', rev: 5, data: patient('old2', []) });
  await db.collection('app_state').updateOne({ _id: 'patients' }, { $set: { data: { old1: patient('old1', [{ id: 'x', text: '古い形式の患者' }]), old2: patient('old2', [{ id: 'y', text: '古いほう' }]) } } }, { upsert: true });
  process.env.MONGODB_URI = uri;
  const s = loadServerInstance();
  await s.loadFromMongo();
  process.env.MONGODB_URI = 'mongodb://fake-for-test/shared';
  const old1 = await db.collection('patients').findOne({ _id: 'old1' });
  const old2 = await db.collection('patients').findOne({ _id: 'old2' });
  assert.equal(old1.data.items[0].text, '古い形式の患者');
  assert.equal(old2.rev, 5, '既にある患者は上書きしない');
});
