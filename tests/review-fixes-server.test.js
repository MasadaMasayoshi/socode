'use strict';
// レビューで見つかったサーバー（server.js）・同期（js/04-server-sync.js）の不具合の再現と修正の確認
//  ①「//data/…」「/%2fdata/…」「/js/../data/…」の書き方で、全患者のカルテや server.js を取得できた
//  ②text='__proto__' の学習イベントで Object.prototype（全オブジェクトの親）が書き換わった
//  ③タブを閉じたときの学習の一括同期が、ほかの利用者の票を古い内容へ巻き戻していた・壊れた値で以後 500 になった
//  ④同じ患者への保存が重なると、先の保存の失敗で後の保存（200 を返した分）の内容が消えていた
//  ⑤文章を編集すると、編集前と編集後の文章の票が同じ入れ物を共有していた
//  ⑦学習イベントのたびに学習辞書「全体」を返していた・文章の長さに上限が無かった
//  ⑨（JSONファイル保存）保存に失敗した基準などが、500 を返した後も一覧に残っていた
//  ⑩経路ごとの受け取りの上限が使われていなかった（共通の読み取りが先に読んでいた）
//  ⑪MongoDB：以前の形式の「完全に削除した患者の記録」が移行されず、削除した患者が復活できた
//  ⑫画面：送り直しても変わらない断り（413 など）を永遠に送り直していた・保存できた後も送り直しのタイマーが残った
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { setupIsolatedDataDir, startEphemeralServer, baseUrl, stopServer } = require('./helpers');
const { loadApp } = require('./app-helpers');

setupIsolatedDataDir();
const serverPath = require.resolve('../server.js');
delete require.cache[serverPath];
const server = require('../server.js');
let http, url;
test.before(async () => { http = await startEphemeralServer(server.app); url = baseUrl(http); });
test.after(async () => { server.setWriteFileImplForTest(null); await stopServer(http); });
const uniq = () => crypto.randomBytes(6).toString('hex');
const post = (p, body) => fetch(`${url}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const event = (text, action, payload) => post('/api/learning-event', { text, action, payload });
const getDict = async () => (await fetch(`${url}/api/learning-dict`)).json();

test('①非公開のファイルは、「//」「%2f」「..」を使った書き方でも取得できない', async () => {
  for (const p of ['/data/patients.json', '//data/patients.json', '/%2fdata/patients.json', '/js/../data/patients.json',
    '/js/%2e%2e/data/patients.json', '/./server.js', '//server.js', '/%5cdata%5cpatients.json', '/js/../../tests/helpers.js']) {
    assert.equal(server.isPrivateStaticPath(p), true, p);
  }
  for (const p of ['/', '/index.html', '/js/04-server-sync.js', '/style.css', '/vendor/x.js']) {
    assert.equal(server.isPrivateStaticPath(p), false, p);
  }
  assert.equal(server.isPrivateStaticPath('/%E0%A4%A'), null, '不正な書き方は 400');
  // 実際のHTTPでも（修正前は /%2fdata/patients.json で患者のカルテがそのまま返っていた）
  for (const p of ['/%2fdata/patients.json', '/%2Fserver.js']) {
    const res = await fetch(`${url}${p}`);
    assert.equal(res.status, 404, p);
  }
});

test('②text が __proto__ などの学習イベントは断り、Object.prototype を書き換えない', async () => {
  for (const text of ['__proto__', 'constructor', 'prototype']) {
    const res = await event(text, 'type', { type: 's' });
    assert.equal(res.status, 400, text);
  }
  const edit = await event('普通の文 ' + uniq(), 'edit', { newText: '__proto__' });
  assert.equal(edit.status, 400, '編集後の文章が __proto__ の場合も断る');
  assert.equal(({}).preferredType, undefined);
  assert.equal(({}).updatedAt, undefined);
  assert.equal(({}).typeVotes, undefined);
  // 'toString' など、親から受け継いだ名前と同じ文章も、自分の学習として正しく記録する
  const res = await event('toString', 'type', { type: 'o' });
  assert.equal(res.status, 200);
  const dict = await getDict();
  assert.equal(dict.toString.preferredType, 'o');
  assert.deepEqual({ ...dict.toString.typeVotes }, { o: 1 });
  // 票のキー（分類名）が __proto__ でも、おかしな票は数えない
  const t2 = '分類名がおかしい ' + uniq();
  assert.equal((await event(t2, 'type', { type: '__proto__' })).status, 200);
  assert.deepEqual({ ...(await getDict())[t2].typeVotes }, {});
});

test('③一括同期：__proto__ のキー・壊れた値は受け付けず、以後の学習イベントも 500 にならない', async () => {
  const bad = 'こわれた値 ' + uniq();
  const raw = `{"__proto__":{"typeVotes":{"s":9}},"${bad}":"garbage","ok ${bad}":{"typeVotes":{"s":1}}}`;
  const res = await fetch(`${url}/api/learning-dict/sync`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: raw });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.accepted, 1);
  assert.equal(body.rejected, 2);
  assert.equal(({}).typeVotes, undefined, 'Object.prototype は変わらない');
  const dict = await getDict();
  assert.ok(!Object.prototype.hasOwnProperty.call(dict, bad));
  assert.equal(dict['ok ' + bad].typeVotes.s, 1);
  assert.equal((await event(bad, 'tagAdd', { hendersonId: 1 })).status, 200, '以前は以後ずっと 500 だった');
});

test('③一括同期：古いタブの内容で、ほかの利用者が加えた票を巻き戻さない（新しい分は票ごとに多い方を残す）', async () => {
  const text = '一括同期の文 ' + uniq();
  const loadedAt = new Date(Date.now() - 60000).toISOString();
  // タブAが開いた時点：s が1票
  await post('/api/learning-dict/sync', { [text]: { typeVotes: { s: 1 }, hendersonVotes: {}, preferredType: 's', updatedAt: loadedAt } });
  // その後、ほかの利用者が s に2票
  await event(text, 'type', { type: 's' });
  await event(text, 'type', { type: 's' });
  assert.equal((await getDict())[text].typeVotes.s, 3);
  // タブAが閉じられ、開いた時点の古い内容を一括同期してくる
  const stale = await post('/api/learning-dict/sync', { [text]: { typeVotes: { s: 1 }, hendersonVotes: {}, preferredType: 's', updatedAt: loadedAt } });
  assert.equal(stale.status, 200);
  assert.equal((await getDict())[text].typeVotes.s, 3, '以前はここで1票に巻き戻っていた');
  // このタブで後から付けた票（届いていなかった分）は取り込む
  await post('/api/learning-dict/sync', { [text]: { typeVotes: { s: 1, o: 5 }, hendersonVotes: { 3: 2 }, updatedAt: new Date(Date.now() + 1000).toISOString() } });
  const merged = (await getDict())[text];
  assert.deepEqual({ ...merged.typeVotes }, { s: 3, o: 5 });
  assert.equal(merged.preferredType, 'o');
  assert.deepEqual([...merged.preferredHendersonIds], [3]);
});

test('④（JSONファイル保存）同じ患者への保存が重なり先の保存が失敗しても、後の保存（200）の内容は消えない', async () => {
  const id = 'race_' + uniq();
  const base = { id, title: '元', items: [{ id: 'a', text: '元のカード' }], deletedItemIds: [], updatedAt: '2026-01-01T00:00:00.000Z' };
  await server.patientStoreSave(id, base);
  let n = 0;
  server.setWriteFileImplForTest((f, t) => (/patients\.json/.test(f) && n++ === 0 ? Promise.reject(new Error('EIO')) : fs.promises.writeFile(f, t)));
  try {
    const pA = server.patientStoreSave(id, { ...base, title: 'A', items: [...base.items, { id: 'fromA', text: 'A' }], updatedAt: '2026-01-02T00:00:00.000Z' }).then(() => 'ok', () => 'failed');
    const pB = server.patientStoreSave(id, { ...base, title: 'B', items: [...base.items, { id: 'fromB', text: 'B' }], updatedAt: '2026-01-03T00:00:00.000Z' }).then(r => r, () => 'failed');
    assert.equal(await pA, 'failed');
    const rB = await pB;
    assert.notEqual(rB, 'failed');
    const ids = rB.patient.items.map(i => i.id);
    assert.ok(ids.includes('fromB'));
    assert.ok(!ids.includes('fromA'), '失敗した保存の内容は含めない');
  } finally {
    server.setWriteFileImplForTest(null);
  }
  const all = await (await fetch(`${url}/api/patients`)).json();
  assert.deepEqual(all[id].items.map(i => i.id), ['a', 'fromB'], '200 を返した保存の内容が手元に残る');
  const disk = JSON.parse(fs.readFileSync(path.join(server.DATA_DIR, 'patients.json'), 'utf8'));
  assert.deepEqual(disk[id].items.map(i => i.id), ['a', 'fromB'], 'ファイルにも残る');
});

test('④患者IDに __proto__ などは使えない（400）', async () => {
  const res = await fetch(`${url}/api/patients/constructor`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'constructor', items: [] }) });
  assert.equal(res.status, 400);
  const sync = await post('/api/patients/sync', JSON.parse('{"__proto__":{"id":"x","items":[]}}'));
  assert.equal(sync.status, 200);
  assert.equal(({}).items, undefined);
});

test('⑤文章を編集しても、編集前と編集後の文章の票は別々（編集後の文章の票も消さない）', async () => {
  const a = '編集前 ' + uniq(), b = '編集後 ' + uniq();
  await event(a, 'type', { type: 's' });
  await event(a, 'edit', { newText: b });
  await event(b, 'type', { type: 'o' });
  await event(b, 'type', { type: 'o' });
  let dict = await getDict();
  assert.deepEqual({ ...dict[a].typeVotes }, { s: 1 }, '以前は編集前の文章の票まで o:2 になっていた');
  assert.deepEqual({ ...dict[b].typeVotes }, { s: 1, o: 2 });
  assert.equal(dict[b].lastEditedFrom, a);
  // 既に学習のある文章へ編集した場合は、票ごとに多い方を残す（上書きで消さない）
  const c = '既存 ' + uniq(), d = '別の文 ' + uniq();
  for (let i = 0; i < 3; i++) await event(c, 'type', { type: 'o' });
  await event(d, 'type', { type: 's' });
  await event(d, 'edit', { newText: c });
  dict = await getDict();
  assert.deepEqual({ ...dict[c].typeVotes }, { o: 3, s: 1 });
  assert.equal(dict[c].preferredType, 'o');
});

test('⑦学習イベントの応答は変わった文章の分だけ・長すぎる文章は断る', async () => {
  const t = '応答の確認 ' + uniq();
  const res = await event(t, 'type', { type: 's' });
  const body = await res.json();
  assert.deepEqual(Object.keys(body.dict), [t]);
  assert.equal(body.dict[t].preferredType, 's');
  const long = 'あ'.repeat(server.LEARNING_TEXT_MAX_LENGTH + 1);
  assert.equal((await event(long, 'type', { type: 's' })).status, 413);
});

test('⑨（JSONファイル保存）保存に失敗した基準は一覧に残らない・重なった後の保存は消えない', async () => {
  const failText = '失敗する基準 ' + uniq(), okText = '成功する基準 ' + uniq();
  let n = 0;
  server.setWriteFileImplForTest((f, t) => (/extraction-criteria/.test(f) && n++ === 0 ? Promise.reject(new Error('EIO')) : fs.promises.writeFile(f, t)));
  try {
    const [r1, r2] = await Promise.all([post('/api/extraction-criteria', { text: failText }), post('/api/extraction-criteria', { text: okText })]);
    assert.equal(r1.status, 500);
    assert.equal(r2.status, 200);
  } finally {
    server.setWriteFileImplForTest(null);
  }
  const list = await (await fetch(`${url}/api/extraction-criteria`)).json();
  assert.ok(!list.some(c => c.text === failText), '以前は 500 を返した基準が一覧に残っていた');
  assert.ok(list.some(c => c.text === okText));
  const disk = JSON.parse(fs.readFileSync(path.join(server.DATA_DIR, 'extraction-criteria.json'), 'utf8'));
  assert.ok(!disk.some(c => c.text === failText));
  assert.ok(disk.some(c => c.text === okText));
});

test('⑩経路ごとの読み取りを持つ経路も、application/json で送った内容を正しく受け取る', async () => {
  const id = 'sync_' + uniq();
  const res = await post('/api/patients/sync', { [id]: { id, title: '一括', items: [{ id: 'c', text: 'x' }], updatedAt: new Date().toISOString() } });
  assert.equal(res.status, 200);
  assert.ok((await (await fetch(`${url}/api/patients`)).json())[id]);
  const snap = await post('/api/patient-snapshot', { clientId: 'c', patients: [{ patientId: id, items: [] }] });
  assert.equal(snap.status, 200);
  const leave = await post('/api/presence/leave', { clientId: 'c' });
  assert.equal(leave.status, 200);
});

test('⑪MongoDB：以前の形式の「完全に削除した患者の記録」を移行し、古い端末からの保存で復活させない', async () => {
  const fakeMongoPath = path.join(__dirname, 'fixtures', 'fake-mongodb.js');
  const fakeMongo = require(fakeMongoPath);
  const uri = 'mongodb://fake-for-test/review-legacy-deletions-' + uniq();
  const client = new fakeMongo.MongoClient(uri);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB_NAME || 'nursing_assessment');
  await db.collection('app_state').updateOne({ _id: 'patient-deletions' }, { $set: { data: { gone1: '2026-08-01T00:00:00.000Z' } } }, { upsert: true });
  await db.collection('app_state').updateOne({ _id: 'patients' }, { $set: { data: { live1: { id: 'live1', items: [] } } } }, { upsert: true });
  const prevUri = process.env.MONGODB_URI, prevMod = process.env.NURSING_MONGODB_MODULE;
  process.env.MONGODB_URI = uri;
  process.env.NURSING_MONGODB_MODULE = fakeMongoPath;
  delete require.cache[serverPath];
  let s;
  try {
    s = require('../server.js');
    await s.loadFromMongo(); // 模擬DBの読み込みは最初の接続のときに行われる
  } finally {
    if (prevUri === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI = prevUri;
    if (prevMod === undefined) delete process.env.NURSING_MONGODB_MODULE; else process.env.NURSING_MONGODB_MODULE = prevMod;
    delete require.cache[serverPath];
  }
  const gone = await db.collection('patients').findOne({ _id: 'gone1' });
  assert.equal(gone.deleted, true);
  assert.equal(gone.deletedAt, '2026-08-01T00:00:00.000Z');
  assert.ok((await db.collection('patients').findOne({ _id: 'live1' })).data);
  const r = await s.patientStoreSave('gone1', { id: 'gone1', items: [{ id: 'x' }], updatedAt: new Date().toISOString() });
  assert.equal(r.deleted, true, '古い端末からの保存で復活させない');
  await s.loadFromMongo(); // 何度起動しても安全
  assert.equal((await db.collection('patients').findOne({ _id: 'gone1' })).rev, 1);
});

// ---- 画面側（js/04-server-sync.js） ----
function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
function setupApp() {
  const timers = [];
  const cleared = [];
  const calls = [];
  const fetchStub = (u, opts = {}) => {
    if (!/\/api\/patients\//.test(String(u))) return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    let resolve;
    const p = new Promise(r => { resolve = r; });
    calls.push({ body: opts.body ? JSON.parse(opts.body) : null, resolve });
    return p;
  };
  const app = loadApp({
    localStorage: memoryStorage(), fetch: fetchStub,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: id => { cleared.push(id); }
  });
  const h = app.__testHooks;
  const st = h.state();
  st.patients = [{ id: 'A', title: '患者A', sourceText: '', items: [], deletedItemIds: [], referenceNotes: [], archived: false, updatedAt: '2026-09-01T00:00:00.000Z' }];
  st.currentPatientId = 'A';
  return { h, timers, cleared, calls };
}
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const RETRY_WAITS = [3000, 10000, 30000, 60000, 120000];

test('⑫画面：413 など送り直しても変わらない断りは、自動で送り直さない（未保存のまま残す）', async () => {
  const { h, timers, calls } = setupApp();
  const p = h.syncPatientToServer('A');
  calls[0].resolve(reply(413, null));
  await p;
  assert.ok(h.unsyncedPatientIds.has('A'), '未保存のまま');
  assert.ok(!timers.some(t => RETRY_WAITS.includes(t.ms)), '送り直しを予約しない');
  // 429（送信の集中）は、これまでどおり送り直す
  const p2 = h.syncPatientToServer('A');
  calls[1].resolve(reply(429, { error: '短時間に送信が集中しています' }));
  await p2;
  assert.ok(timers.some(t => t.ms === 3000), '429 は送り直す');
});

test('⑫画面：保存できたら、前の失敗で予約した送り直しのタイマーを止める', async () => {
  const { h, timers, cleared, calls } = setupApp();
  const p1 = h.syncPatientToServer('A');
  calls[0].resolve(reply(500, { ok: false, error: '保存に失敗しました' }));
  await p1;
  const retryIdx = timers.findIndex(t => t.ms === 3000);
  assert.ok(retryIdx >= 0);
  const p2 = h.syncPatientToServer('A'); // 待たずに（編集などで）送り直した
  calls[1].resolve(reply(200, { ok: true, patient: calls[1].body }));
  await p2;
  assert.ok(cleared.includes(retryIdx + 1), '残っていた送り直しのタイマーを止める');
  assert.ok(!h.unsyncedPatientIds.has('A'));
});
