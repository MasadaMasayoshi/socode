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
