'use strict';

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
const serverA = loadServerInstance();
const serverB = loadServerInstance();
let httpA, httpB, urlA, urlB;
test.before(async () => {
  httpA = await startEphemeralServer(serverA.app); urlA = baseUrl(httpA);
  httpB = await startEphemeralServer(serverB.app); urlB = baseUrl(httpB);
});
test.after(async () => { await stopServer(httpA); await stopServer(httpB); });
const put = (url, id, body) => fetch(`${url}/api/patients/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const patient = (id, items, extra = {}) => ({ id, title: id, items, deletedItemIds: [], updatedAt: new Date().toISOString(), ...extra });

test('関連図を別サーバーから同時更新しても古い図を上書きしない', async () => {
  const id = 'mongo-map-race';
  const saved = await serverA.patientStoreSave(id, patient(id, [], { relationMap: { version: 2, nodes: [{ id: 'n', type: 'symptom', label: '最初' }], edges: [] } }));
  const a = structuredClone(saved.patient), b = structuredClone(saved.patient);
  a.relationMap.nodes[0].label = 'Aの編集'; b.relationMap.nodes[0].label = 'Bの編集';
  const results = await Promise.allSettled([serverA.patientStoreSave(id, a), serverB.patientStoreSave(id, b)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const rejected = results.find(r => r.status === 'rejected');
  assert.equal(rejected.reason.status, 412);
  const all = await (await fetch(`${urlA}/api/patients`)).json();
  assert.equal(all[id].relationMapRevision, 2);
});

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

const post = (url, p, body) => fetch(`${url}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('学習データ・事例ログ：別々のサーバーで同時に学習しても、両方の票とログが残る', async () => {
  const sends = [];
  for (let i = 0; i < 6; i++) {
    sends.push(post(i % 2 ? urlA : urlB, '/api/learning-event', { text: '同時に学習する文', action: 'type', payload: { type: 'o' } }));
    sends.push(post(i % 2 ? urlB : urlA, '/api/learning-event', { text: `別の文${i}`, action: 'type', payload: { type: 's' } }));
  }
  const results = await Promise.all(sends);
  results.forEach(r => assert.equal(r.status, 200));
  for (const url of [urlA, urlB]) {
    const dict = await (await fetch(`${url}/api/learning-dict`)).json();
    assert.equal(dict['同時に学習する文'].typeVotes.o, 6, `${url}：票が6票とも残る`);
    for (let i = 0; i < 6; i++) assert.ok(dict[`別の文${i}`], `${url}：別の文${i} が消えていない`);
    const log = await (await fetch(`${url}/api/case-log`)).json();
    assert.equal(log.filter(e => e.text === '同時に学習する文' || /^別の文/.test(e.text)).length, 12, `${url}：事例ログが12件とも残る`);
  }
});

test('カードの報告・スナップショット・追加の基準：2台から交互に追加しても消えない', async () => {
  await Promise.all([
    post(urlA, '/api/card-reports', { sessionId: 'sA', cardText: 'Aの報告' }),
    post(urlB, '/api/card-reports', { sessionId: 'sB', cardText: 'Bの報告' }),
    post(urlA, '/api/patient-snapshot', { clientId: 'cA', patients: [{ patientId: 'p1', items: [] }] }),
    post(urlB, '/api/patient-snapshot', { clientId: 'cB', patients: [{ patientId: 'p2', items: [] }] }),
    post(urlA, '/api/extraction-criteria', { text: 'Aの基準' }),
    post(urlB, '/api/extraction-criteria', { text: 'Bの基準' })
  ]);
  const reports = await (await fetch(`${urlB}/api/card-reports`)).json();
  assert.deepEqual(reports.map(r => r.items[0].cardText).sort(), ['Aの報告', 'Bの報告']);
  const snaps = await (await fetch(`${urlA}/api/patient-snapshots`)).json();
  assert.deepEqual(snaps.map(s => s.clientId).sort(), ['cA', 'cB']);
  const crit = await (await fetch(`${urlA}/api/extraction-criteria`)).json();
  assert.deepEqual(crit.map(c => c.text).sort(), ['Aの基準', 'Bの基準']);

  const idB = crit.find(c => c.text === 'Bの基準').id;
  const put2 = await fetch(`${urlA}/api/extraction-criteria/${idB}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Bの基準（Aで直した）' }) });
  assert.equal(put2.status, 200);
  const crit2 = await (await fetch(`${urlB}/api/extraction-criteria`)).json();
  assert.ok(crit2.some(c => c.text === 'Bの基準（Aで直した）'));

  await post(urlB, '/api/card-reports', { sessionId: 'sA', cardText: 'Aの2件目' });
  const reports2 = await (await fetch(`${urlA}/api/card-reports`)).json();
  assert.equal(reports2.find(r => r.sessionId === 'sA').items.length, 2);
});

test('以前の形式（版の無い文書）も、最初の保存で版を付けて上書きの競合を見つけられる', async () => {
  const client = new fakeMongo.MongoClient('mongodb://fake-for-test/shared');
  await client.connect();
  const col = client.db(process.env.MONGODB_DB_NAME || 'nursing_assessment').collection('app_state');
  await col.updateOne({ _id: 'reference-sources' }, { $set: { data: [{ id: 'old', title: '古い', url: 'https://example.com', content: '' }] } }, { upsert: true });
  await Promise.all([
    post(urlA, '/api/reference-sources', { title: 'A', url: 'https://a.example' }),
    post(urlB, '/api/reference-sources', { title: 'B', url: 'https://b.example' })
  ]);
  const doc = await col.findOne({ _id: 'reference-sources' });
  assert.deepEqual(doc.data.map(r => r.title).sort(), ['A', 'B', '古い']);
  assert.equal(doc.rev, 2);
});

test('自動整理：2台で同時に整理しても、アーカイブへ二重に入れず、新しい記録を消さない', async () => {
  const client = new fakeMongo.MongoClient('mongodb://fake-for-test/shared');
  await client.connect();
  const col = client.db(process.env.MONGODB_DB_NAME || 'nursing_assessment').collection('app_state');
  const old = new Date(Date.now() - 200 * 86400000).toISOString();
  const cur = await col.findOne({ _id: 'patient-snapshots' });
  const data = cur.data.concat([{ id: 'oldsnap', clientId: 'x', patientId: 'p', items: [], closedAt: old }]);
  await col.updateOne({ _id: 'patient-snapshots' }, { $set: { data, rev: cur.rev + 1 } });
  await Promise.all([serverA.runArchiving(), serverB.runArchiving(), post(urlA, '/api/patient-snapshot', { clientId: 'new', patients: [{ patientId: 'p3', items: [] }] })]);
  const arc = await (await fetch(`${urlB}/api/patient-snapshots/archive`)).json();
  assert.equal(arc.filter(s => s.id === 'oldsnap').length, 1);
  const snaps = await (await fetch(`${urlB}/api/patient-snapshots`)).json();
  assert.ok(!snaps.some(s => s.id === 'oldsnap'));
  assert.ok(snaps.some(s => s.clientId === 'new'));
  assert.ok(snaps.some(s => s.clientId === 'cA'));
});
