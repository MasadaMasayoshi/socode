'use strict';
// 患者の切り替え・保存の通信・通知の表示の不具合の再現と修正の確認
//  ①患者Aをアーカイブ／新規作成／切り替えたとき、別の患者の本文にAの本文が入らない
//  ②保存の通信中に編集・追加・削除したカードが、遅れて返ったサーバーの応答で元に戻らない
//  ③保存に失敗したら「未保存」のまま残して送り直す。別の端末で完全に削除された患者は復活させない
//  ④通知（トースト）に患者名を出してもHTMLとして解釈しない
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
const patient = (id, title, text, items = []) => ({ id, title, sourceText: text, items, deletedItemIds: [], referenceNotes: [], archived: false, updatedAt: '2026-09-01T00:00:00.000Z' });
function setup(overrides = {}) {
  const app = loadApp({ localStorage: memoryStorage(), ...overrides });
  const h = app.__testHooks;
  const st = h.state();
  st.patients = [patient('A', '患者A', 'Aの本文'), patient('B', '患者B', 'Bの本文')];
  st.currentPatientId = 'A';
  h.DOM.sourceText.value = 'Aの本文（編集中）';
  return { app, h, st };
}
const find = (st, id) => st.patients.find(p => p.id === id);

test('①アーカイブ：表示中の患者Aをアーカイブしても、切り替え先の患者Bの本文はAの本文で上書きされない', () => {
  const { h, st } = setup();
  h.archivePatient('A');
  assert.equal(st.currentPatientId, 'B');
  assert.equal(find(st, 'B').sourceText, 'Bの本文', 'Bの本文はそのまま');
  assert.equal(find(st, 'A').sourceText, 'Aの本文（編集中）', 'Aの編集中の本文はAに保存される');
  assert.equal(find(st, 'A').archived, true);
  assert.equal(h.DOM.sourceText.value, 'Bの本文', '入力欄は切り替え先（B）の本文');
});

test('①新規作成：新しい患者の本文は空のまま、前の患者の編集中の本文は前の患者に保存される', () => {
  const { h, st } = setup();
  const newId = h.createNewPatientPage('患者C');
  assert.equal(st.currentPatientId, newId);
  assert.equal(find(st, newId).sourceText, '');
  assert.equal(find(st, 'A').sourceText, 'Aの本文（編集中）');
  assert.equal(find(st, 'B').sourceText, 'Bの本文');
  assert.equal(h.DOM.sourceText.value, '');
});

test('①切り替え：切り替え前の本文は元の患者に、入力欄には切り替え先の本文が入る（行き来しても混ざらない）', () => {
  const { h, st } = setup();
  h.switchPatient('B');
  assert.equal(find(st, 'A').sourceText, 'Aの本文（編集中）');
  assert.equal(h.DOM.sourceText.value, 'Bの本文');
  h.DOM.sourceText.value = 'Bの本文（編集）';
  h.switchPatient('A');
  assert.equal(find(st, 'B').sourceText, 'Bの本文（編集）');
  assert.equal(find(st, 'A').sourceText, 'Aの本文（編集中）');
  assert.equal(h.DOM.sourceText.value, 'Aの本文（編集中）');
});

test('①完全削除と同じ切り替え（今の患者を保存しない）：削除した患者の本文が残りの患者に入らない', () => {
  const { h, st } = setup();
  st.patients = st.patients.filter(p => p.id !== 'A'); // Aを削除した直後
  h.changeCurrentPatient('B', { saveCurrent: false });
  assert.equal(find(st, 'B').sourceText, 'Bの本文');
  assert.equal(h.DOM.sourceText.value, 'Bの本文');
});

// サーバーへの保存（PUT）の応答を、テストの好きなときに返せるようにする
function deferredFetch() {
  const calls = [];
  const fetch = (url, opts = {}) => {
    if (!/\/api\/patients\//.test(String(url))) return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    let resolve;
    const p = new Promise(r => { resolve = r; });
    calls.push({ url: String(url), body: opts.body ? JSON.parse(opts.body) : null, resolve });
    return p;
  };
  return { fetch, calls };
}
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const tick = () => new Promise(r => setImmediate(r));

test('②保存の通信中に編集・追加・削除したカードは、遅れて返った応答で元に戻らない（他の端末のカードは取り込む）', async () => {
  const { fetch, calls } = deferredFetch();
  const { h, st } = setup({ fetch });
  const A = find(st, 'A');
  A.items = [{ id: 'c1', type: 'o', text: '体温37.0' }, { id: 'c2', type: 'o', text: '消す予定のカード' }, { id: 'c3', type: 'o', text: 'そのままのカード' }];
  const sending = h.syncPatientToServer('A');
  assert.equal(calls.length, 1);
  // 通信中の編集
  A.items[0] = { ...A.items[0], text: '体温37.8（通信中に編集）' };
  A.items = A.items.filter(i => i.id !== 'c2');
  A.items.push({ id: 'c4', type: 'o', text: '通信中に追加したカード' });
  h.schedulePatientSync('A');
  // サーバーの応答は送った時点の内容＋別の端末が足したカード
  calls[0].resolve(reply(200, { ok: true, patient: { ...calls[0].body, items: [...calls[0].body.items, { id: 'x9', type: 'o', text: '別の端末のカード' }] } }));
  await sending;
  const texts = A.items.map(i => i.text);
  assert.ok(texts.includes('体温37.8（通信中に編集）'), JSON.stringify(texts));
  assert.ok(texts.includes('通信中に追加したカード'));
  assert.ok(!texts.includes('消す予定のカード'), '通信中に消したカードは復活しない');
  assert.ok(texts.includes('そのままのカード'));
  assert.ok(texts.includes('別の端末のカード'), '他の端末のカードは取り込む');
  assert.ok(h.unsyncedPatientIds.has('A'), '通信中の編集はまだ送っていないので未保存のまま');
});

test('②通信中に編集が無ければ、サーバーの結果をそのまま使う・同じ患者は1本ずつ送る', async () => {
  const { fetch, calls } = deferredFetch();
  const { h, st } = setup({ fetch });
  const A = find(st, 'A');
  A.items = [{ id: 'c1', type: 'o', text: '元' }];
  h.schedulePatientSync('A');
  const first = h.syncPatientToServer('A');
  h.syncPatientToServer('A'); // 通信中にもう一度 → 待たされる
  assert.equal(calls.length, 1, '通信中は2本目を送らない');
  calls[0].resolve(reply(200, { ok: true, patient: { ...calls[0].body, items: [{ id: 'c1', type: 'o', text: '元' }, { id: 'x1', type: 'o', text: '他端末' }] } }));
  await first;
  await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(A.items.map(i => i.id))), ['c1', 'x1']);
  assert.equal(calls.length, 2, '終わってから続けて送る');
  calls[1].resolve(reply(200, { ok: true, patient: calls[1].body }));
  await tick();
});

test('③保存に失敗（500・ok:false）したら未保存のまま残し、自動の再送を予約する', async () => {
  const timers = [];
  const { fetch, calls } = deferredFetch();
  const { h, st } = setup({ fetch, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; } });
  h.schedulePatientSync('A');
  const p1 = h.syncPatientToServer('A');
  calls[0].resolve(reply(500, { ok: false, error: '保存に失敗しました' }));
  await p1;
  assert.ok(h.unsyncedPatientIds.has('A'));
  assert.ok(timers.some(t => t.ms === 3000), '3秒後に送り直す');
  const p2 = h.syncPatientToServer('A');
  calls[1].resolve(reply(200, { ok: false, error: 'disk full' })); // 200でも ok:false は失敗
  await p2;
  assert.ok(h.unsyncedPatientIds.has('A'));
  assert.ok(timers.some(t => t.ms === 10000), '次は10秒後');
  const p3 = h.syncPatientToServer('A');
  calls[2].resolve(reply(200, { ok: true, patient: calls[2].body }));
  await p3;
  assert.ok(!h.unsyncedPatientIds.has('A'), '保存できたら未保存を外す');
});

test('③別の端末で完全に削除された患者（410）は、この端末からも外し、起動時の読み込みでも復活させない', async () => {
  const { fetch, calls } = deferredFetch();
  const { h, st } = setup({ fetch });
  const p1 = h.syncPatientToServer('B');
  calls[0].resolve(reply(410, { ok: false, deleted: true }));
  await p1;
  assert.ok(!st.patients.some(p => p.id === 'B'));
  assert.ok(h.deletedPatientIds.has('B'));
  assert.equal(h.DOM.sourceText.value, 'Aの本文（編集中）', '表示中の患者Aはそのまま');
  // 削除した患者は、もう送らない
  h.schedulePatientSync('B');
  await h.syncPatientToServer('B');
  assert.equal(calls.length, 1);
});

test('③起動時の読み込み：サーバーの削除の記録にある患者は、手元に残っていても外す', async () => {
  const app = loadApp({ localStorage: memoryStorage(), fetch: async url => {
    if (/\/api\/patient-deletions/.test(url)) return reply(200, { B: '2026-09-02T00:00:00.000Z' });
    if (/\/api\/patients$/.test(url)) return reply(200, { A: patient('A', '患者A', 'Aの本文') });
    return reply(200, []);
  } });
  const h = app.__testHooks;
  const st = h.state();
  st.patients = [patient('A', '患者A', 'Aの本文'), patient('B', '患者B（古い）', 'Bの本文')];
  st.currentPatientId = 'A';
  await h.loadSharedPatients();
  assert.deepEqual(JSON.parse(JSON.stringify(st.patients.map(p => p.id))), ['A']);
});

test('④通知に患者名を出しても、HTMLとして解釈しない（textContentで入れる）', () => {
  const created = [];
  const doc = {
    getElementById() { return mk(); }, addEventListener() {}, removeEventListener() {},
    querySelector() { return mk(); }, querySelectorAll() { return []; },
    createElement(tag) { const e = mk(); e.tag = tag; created.push(e); return e; },
    createDocumentFragment() { return mk(); },
    documentElement: { getAttribute() { return null; }, setAttribute() {}, classList: { add() {}, remove() {} }, style: {} },
    body: mk(), visibilityState: 'visible'
  };
  function mk() {
    const e = { value: '', textContent: '', checked: false, style: {}, dataset: {}, children: [],
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; }, replace() {} },
      addEventListener() {}, removeEventListener() {}, append(...c) { e.children.push(...c); }, appendChild(c) { e.children.push(c); },
      replaceChildren() {}, insertBefore() {}, removeChild() {}, remove() {}, querySelector() { return mk(); }, querySelectorAll() { return []; },
      setAttribute() {}, getAttribute() { return null; }, hasAttribute() { return false; }, removeAttribute() {},
      contains() { return false; }, closest() { return null; }, focus() {}, blur() {}, click() {}, scrollIntoView() {},
      getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; } };
    let html = '';
    Object.defineProperty(e, 'innerHTML', { get: () => html, set: v => { html = String(v); e.htmlSet = (e.htmlSet || []).concat(String(v)); } });
    return e;
  }
  const app = loadApp({ document: doc, localStorage: memoryStorage() });
  created.length = 0;
  const evil = '「<img src=x onerror=alert(1)>」のカルテに切り替えました';
  app.__testHooks.showToast(evil, 'info');
  assert.ok(created.every(e => !(e.htmlSet || []).some(v => v.includes('<img'))), '患者名をinnerHTMLに入れない');
  assert.ok(created.some(e => e.textContent === evil), '文字として表示する');
});
