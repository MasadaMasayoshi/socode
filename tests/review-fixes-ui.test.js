'use strict';
// 【レビューで発見】画面まわり（js/05・09・10・11）の不具合の再現と修正の確認
//  ①「ファイルから読込」：入力欄に残った前の患者の記録メモで、読み込んだ患者の記録メモが上書きされない。
//    中身の無い・形の違うファイルでは何も書き換えない。カードは整えてから読み込み、今の患者は残す
//  ②保存されたAIの結果のHTML・IDから、スクリプトが動かない（sanitizeStoredHtml・jsArg・IDの修復）
//  ③Esc でいちばん手前の画面を閉じ、後ろのカードの選択は消さない。ダイアログを続けて開いても前の答えが返る
//  ④「元に戻す」で別の患者を書き換えたら、その患者も共有先へ送り直す
//  ⑤記録メモの入力は打ち終わってからまとめて保存する（切り替え・画面を隠すときはすぐ保存）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { APP_SCRIPT_FILES } = require('./app-helpers');

const ROOT = path.join(__dirname, '..');

// ---- 動きを確かめられる程度の、小さな画面の部品のまね ----
function makeEnv() {
  const els = new Map();
  const created = [];
  const docListeners = {};
  let timers = [];
  let timerSeq = 0;
  const doc = {};
  function makeEl(tag = 'div', id = '') {
    const listeners = {};
    const classes = new Set();
    const attrs = {};
    const el = {
      tagName: String(tag).toUpperCase(), id, value: '', innerHTML: '', textContent: '', checked: false, disabled: false,
      dataset: {}, style: { setProperty() {} }, children: [], isConnected: true, offsetHeight: 0,
      classList: {
        add: (...c) => c.forEach(x => classes.add(x)), remove: (...c) => c.forEach(x => classes.delete(x)),
        toggle: (c, f) => { const on = f === undefined ? !classes.has(c) : !!f; if (on) classes.add(c); else classes.delete(c); return on; },
        contains: c => classes.has(c), replace: (a, b) => { if (classes.has(a)) { classes.delete(a); classes.add(b); } }
      },
      addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
      removeEventListener(t, f) { listeners[t] = (listeners[t] || []).filter(x => x !== f); },
      fire(t, extra = {}) {
        const ev = { type: t, target: el, currentTarget: el, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, stopImmediatePropagation() {}, ...extra };
        (listeners[t] || []).slice().forEach(f => f(ev));
        return ev;
      },
      click() { el.fire('click'); },
      focus() { doc.activeElement = el; }, blur() {}, select() {}, setSelectionRange() {},
      appendChild(c) { el.children.push(c); return c; }, append(...c) { el.children.push(...c); },
      remove() { el.isConnected = false; }, replaceChildren(...c) { el.children = c; }, insertBefore() {}, removeChild() {},
      querySelector: () => makeEl(), querySelectorAll: () => [], closest: () => null, contains: () => false,
      setAttribute(k, v) { attrs[k] = String(v); }, getAttribute: k => (k in attrs ? attrs[k] : null),
      hasAttribute: k => k in attrs, removeAttribute(k) { delete attrs[k]; },
      getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }), scrollIntoView() {}
    };
    return el;
  }
  const byId = id => { if (!els.has(id)) els.set(id, makeEl('div', id)); return els.get(id); };
  Object.assign(doc, {
    activeElement: null, visibilityState: 'visible', readyState: 'complete',
    getElementById: byId,
    addEventListener(t, f, cap) { (docListeners[t] = docListeners[t] || []).push({ f, cap: !!cap }); },
    removeEventListener(t, f) { docListeners[t] = (docListeners[t] || []).filter(x => x.f !== f); },
    querySelector: sel => (sel === '.fixed.inset-0:not(.hidden)' ? (doc.querySelectorAll(sel)[0] || null) : makeEl()),
    querySelectorAll: sel => (sel === '.fixed.inset-0:not(.hidden)' ? Array.from(els.values()).filter(e => e.isModal && !e.classList.contains('hidden')) : []),
    createElement: tag => { const e = makeEl(tag); created.push(e); return e; },
    createDocumentFragment: () => makeEl('fragment'),
    documentElement: { getAttribute() { return null; }, setAttribute() {}, classList: { add() {}, remove() {} }, style: { setProperty() {} } },
    body: makeEl('body')
  });
  // document の keydown：登録の順に、捕捉（capture）を先に呼ぶ。stopPropagation で後ろを止める
  doc.fireKey = key => {
    let stopped = false;
    const ev = { key, target: doc.activeElement || doc.body, isComposing: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault() {}, stopPropagation() { stopped = true; }, stopImmediatePropagation() { stopped = true; } };
    const ls = docListeners.keydown || [];
    for (const l of [...ls.filter(x => x.cap), ...ls.filter(x => !x.cap)]) { if (stopped) break; l.f(ev); }
  };
  doc.fireDoc = (type, ev) => (docListeners[type] || []).forEach(l => l.f(ev));
  const store = new Map();
  const localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const sandbox = {
    console, document: doc, localStorage,
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    fetch: async () => { throw new Error('サーバー未接続（テスト）'); },
    setTimeout: (f, ms) => { const id = ++timerSeq; timers.push({ id, f, ms }); return id; },
    clearTimeout: id => { timers = timers.filter(t => t.id !== id); },
    setInterval: () => 0, clearInterval() {},
    navigator: { onLine: true, sendBeacon: () => true, clipboard: { writeText: async () => {} } },
    location: { href: '', search: '', protocol: 'http:', reload() {} },
    history: { replaceState() {}, pushState() {} },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    requestAnimationFrame: () => 0, alert() {}, confirm: () => true,
    addEventListener() {}, removeEventListener() {},
    URL: { createObjectURL: () => '', revokeObjectURL() {} }, Blob: function Blob() {},
    FileReader: function FileReader() { this.readAsText = () => {}; this.readAsDataURL = () => {}; },
    module: { exports: {} }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  APP_SCRIPT_FILES.forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f }));
  const run = code => vm.runInContext(code, sandbox);
  return {
    sandbox, doc, els, created, store, run, byId,
    timers: () => timers,
    runTimers: (pred = () => true) => { const due = timers.filter(pred); timers = timers.filter(t => !due.includes(t)); due.forEach(t => t.f()); return due.length; },
    tick: () => new Promise(r => setImmediate(r))
  };
}
// 起動時の非同期の処理（共有先からの読み込み→画面の描き直し）が終わってから確かめる
async function readyEnv() {
  const env = makeEnv();
  for (let i = 0; i < 20; i++) await env.tick();
  return env;
}
const P = (id, title, text, items = []) => ({ id, title, sourceText: text, items, deletedItemIds: [], referenceNotes: [], archived: false, updatedAt: '2026-09-01T00:00:00.000Z' });
function withPatients(env, patients, current) {
  env.run('globalAppData').patients = patients;
  env.run('globalAppData').currentPatientId = current;
  env.run('loadLocalState()');
}

// ===================== ① ファイルから読込 =====================
test('①読み込み：入力欄に残った前の患者の記録メモで、読み込んだ患者の記録メモを上書きしない', async () => {
  const env = await readyEnv();
  withPatients(env, [P('A', '患者A', 'Aのメモ')], 'A');
  env.byId('source-text').value = 'Aのメモ（編集中）';
  const file = JSON.stringify({ patients: [P('B', '患者B', 'Bの記録（ファイル）', [{ id: 'b1', text: '体温37.5℃', type: 'o', hendersonIds: [7] }])], currentPatientId: 'B' });
  const done = env.run('importPatientsDataText')(file);
  await env.tick();
  env.run('closeDialog(true)');
  assert.equal(await done, true);
  const st = env.run('globalAppData');
  const b = st.patients.find(p => p.id === 'B');
  assert.equal(b.sourceText, 'Bの記録（ファイル）', '読み込んだ患者の記録メモはそのまま');
  assert.equal(st.patients.find(p => p.id === 'A').sourceText, 'Aのメモ（編集中）', '前の患者の書きかけは前の患者に保存される');
  assert.equal(st.currentPatientId, 'B');
  assert.equal(env.byId('source-text').value, 'Bの記録（ファイル）');
  assert.deepEqual(JSON.parse(JSON.stringify(b.items[0].assessmentCols)), { 7: 'unclassified' }, 'タグの欄の記録を補う');
  assert.ok(JSON.parse(env.store.get('nursing_patients_data')).patients.some(p => p.id === 'B'), 'このブラウザにも保存');
});

test('①読み込み：患者が0人・形の違うファイルでは、今のカルテを何も書き換えない（画面が動かなくならない）', async () => {
  const env = await readyEnv();
  withPatients(env, [P('A', '患者A', 'Aのメモ')], 'A');
  for (const bad of [JSON.stringify({ patients: [], currentPatientId: 'Z' }), '{"foo":1}', 'これはJSONではない', '[]', JSON.stringify({ patients: [1, null, 'x'] })]) {
    assert.equal(await env.run('importPatientsDataText')(bad), false, bad);
    const st = env.run('globalAppData');
    assert.equal(st.patients.length, 1);
    assert.equal(st.currentPatientId, 'A');
    assert.equal(env.run('getCurrentPatient()').id, 'A');
  }
});

test('①読み込み：確認でやめたら何も変わらない。カードの配列だけのファイルは、今の患者を残して新しいページとして加える', async () => {
  const env = await readyEnv();
  withPatients(env, [P('A', '患者A', 'Aのメモ')], 'A');
  const arr = JSON.stringify([{ id: "x');alert(1);('", text: '食欲あり', type: 'zzz', hendersonIds: [2, 99, '3'] }]);
  let p = env.run('importPatientsDataText')(arr);
  await env.tick(); env.run('closeDialog(null)');
  assert.equal(await p, false);
  assert.equal(env.run('globalAppData').patients.length, 1);
  p = env.run('importPatientsDataText')(arr);
  await env.tick(); env.run('closeDialog(true)');
  assert.equal(await p, true);
  const st = env.run('globalAppData');
  assert.equal(st.patients.length, 2, '今の患者Aは残る');
  const imported = st.patients.find(x => x.id !== 'A');
  const item = imported.items[0];
  assert.match(item.id, /^[\w.:-]+$/, 'IDを作り直す');
  assert.equal(item.type, 'unclassified');
  assert.deepEqual(Array.from(item.hendersonIds), [2, 3]);
  // タグの追加・削除が assessmentCols の無さで失敗しない
  env.sandbox.addHendersonTag(item.id, '5');
  assert.ok(item.hendersonIds.includes(5));
});

// ===================== ② 保存されたHTML・ID =====================
test('②sanitizeStoredHtml：DOMParser の無い環境では、タグを外して文字として返す', async () => {
  const env = await readyEnv();
  const s = env.run('sanitizeStoredHtml');
  const out = s('<div class="ai-text"><p>要点<br>次</p><img src=x onerror="alert(1)"><script>alert(2)</script></div>');
  assert.doesNotMatch(out, /<img|<script|onerror|alert\(2\)/);
  assert.match(out, /要点<br>次/);
  assert.equal(s(''), '');
  assert.equal(s(null), '');
});

test('②保存されたAIの結果は、表示の前に sanitizeStoredHtml を通す（js/05 の患者の切り替え・js/11 の助言）', async () => {
  const src05 = fs.readFileSync(path.join(ROOT, 'js/05-app-state-and-ui.js'), 'utf8');
  const src11 = fs.readFileSync(path.join(ROOT, 'js/11-own-assessment.js'), 'utf8');
  ['labEvaluationResult', 'contradictionResult', 'timelineResult', 'carePlanResult'].forEach(f => {
    assert.match(src05, new RegExp(`innerHTML = sanitizeStoredHtml\\(cp\\.${f}\\)`), f);
    assert.doesNotMatch(src05, new RegExp(`innerHTML = cp\\.${f}`), f);
  });
  assert.match(src11, /\$\{sanitizeStoredHtml\(e\.aiFeedback\)\}/);
  const env = await readyEnv();
  withPatients(env, [{ ...P('A', '患者A', ''), labEvaluationResult: '<img src=x onerror="alert(1)">結果' }], 'A');
  assert.doesNotMatch(env.byId('lab-evaluation-content').innerHTML, /onerror|<img/);
});

test('②jsArg：属性の中のJavaScriptに、引用符を含むIDを安全な文字列として書ける', async () => {
  const env = await readyEnv();
  const jsArg = env.run('jsArg');
  const evil = `x');alert(1);('"<>&`;
  const attr = jsArg(evil);
  assert.doesNotMatch(attr, /['"<>]/, '属性を閉じる文字・タグの文字が残らない');
  const decoded = attr.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  assert.equal(new Function(`return ${decoded};`)(), evil, 'ブラウザが属性を読んだ後は、元のIDそのものの文字列になる');
});

test('②カードの部品：IDは onclick に引用符で直接書かず、jsArg を使う（js/09・js/11）', async () => {
  const src09 = fs.readFileSync(path.join(ROOT, 'js/09-board.js'), 'utf8');
  const src11 = fs.readFileSync(path.join(ROOT, 'js/11-own-assessment.js'), 'utf8');
  assert.doesNotMatch(src09, /'\$\{(?:escapeHtml\()?(?:item|scenePartner)\.id\)?\}'/);
  assert.doesNotMatch(src11, /'\$\{escapeHtml\((?:id|i\.id|c\.id|r\.id|h\.itemId)\)\}'/);
  const env = await readyEnv();
  withPatients(env, [P('A', '患者A', '', [])], 'A');
  const card = env.run('createCardElement')({ id: "q');alert(1);('", text: 'ラシックス内服', type: 'o', hendersonIds: [1], assessmentCols: { 1: 'unclassified' } });
  assert.doesNotMatch(card.innerHTML, /\('q'\);alert/);
  assert.match(card.innerHTML, /openCardMenu\(event, &quot;q&#39;\);alert\(1\);\(&#39;&quot;\)/);
});

test('②患者・参考データの一覧は、IDを data-* に入れてまとめて受け取る（inline の onclick に書かない）', async () => {
  const src05 = fs.readFileSync(path.join(ROOT, 'js/05-app-state-and-ui.js'), 'utf8');
  const src10 = fs.readFileSync(path.join(ROOT, 'js/10-reference-page-and-startup.js'), 'utf8');
  assert.doesNotMatch(src05, /onclick="(?:switchPatient|deletePatient|switchPatientFromList|unarchivePatient|archivePatient|hardDeletePatientFromList)\(/);
  assert.match(src05, /data-patient-action="switch" data-patient-id="\$\{escapeHtml\(pat\.id\)\}"/);
  assert.doesNotMatch(src10, /onclick="(?:openReferenceModal|deleteReferenceEntry)\('\$\{note\.id\}'\)"/);
  // まとめた受け取り口で切り替えられる
  const env = await readyEnv();
  withPatients(env, [P('A', '患者A', 'a'), P('B', '患者B', 'b')], 'A');
  const btn = { getAttribute: k => ({ 'data-patient-id': 'B', 'data-patient-action': 'switch' }[k]) };
  env.run('handlePatientActionClick')({ target: { closest: () => btn }, stopPropagation() {} });
  assert.equal(env.run('globalAppData').currentPatientId, 'B');
});

test('②IDの修復：使えない文字を含む患者・カード・参考データのIDは、毎回同じ安全なIDに直し、古いIDは削除の記録に残す', async () => {
  const env = await readyEnv();
  const bad = "x\" onmouseover=\"alert(1)";
  const list = () => [{ id: "p'1", title: 't', items: [{ id: bad, text: 'a' }, { id: bad, text: 'a(重複)' }, { id: 'ok_1', text: 'b' }], referenceNotes: [{ id: '<r>', text: 'n' }] }];
  const r1 = env.run('repairPatientsList')(list());
  const r2 = env.run('repairPatientsList')(list());
  const p = r1.patients[0];
  assert.match(p.id, /^patient_fix_/);
  assert.equal(r1.idMap["p'1"], p.id);
  assert.equal(p.items.length, 2, '同じIDのカードは1枚にまとめる');
  assert.match(p.items[0].id, /^item_fix_/);
  assert.equal(p.items[0].id, r2.patients[0].items[0].id, '同じ元のIDからは同じIDになる（共有先から何度届いても重ならない）');
  assert.equal(p.items[1].id, 'ok_1');
  assert.ok(p.deletedItemIds.some(t => t.id === bad), '古いIDのカードは共有先で消えるように削除の記録を残す');
  assert.match(p.referenceNotes[0].id, /^ref_fix_/);
  // 共有先から届いた記録（起動時のまとめ）も直す
  const merged = env.run('mergePatientRecordClient')(P('A', '患者A', ''), { ...P('A', '患者A', ''), items: [{ id: "z');x('", text: 'c' }] });
  assert.ok(merged.items.every(i => /^[\w.:-]+$/.test(i.id)));
});

test('②localStorage に残っていた不正なIDも、起動時に直す（今開いている患者のIDも合わせる）', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/05-app-state-and-ui.js'), 'utf8');
  const fn = src.slice(src.indexOf('function loadPersistedPatients'), src.indexOf('const persistedPatients'));
  assert.match(fn, /repairPatientsList\(parsed\.patients\)/);
  assert.match(fn, /r\.idMap\[parsed\.currentPatientId\]/);
});

// ===================== ③ Esc・ダイアログ =====================
function openModal(env, id, z = 60) {
  const m = env.byId(id);
  m.isModal = true;
  m.classList.add('fixed', 'inset-0');
  m.classList.remove('hidden');
  m.zIndex = z;
  return m;
}
test('③Esc：いちばん手前の画面の「閉じる」を押したのと同じように閉じ、後ろのカードの選択は消さない', async () => {
  const env = await readyEnv();
  withPatients(env, [P('A', '患者A', '', [{ id: 'c1', text: 'a', type: 'o', hendersonIds: [], assessmentCols: {} }])], 'A');
  env.sandbox.getComputedStyle = el => ({ zIndex: String(el.zIndex || 0) });
  env.run('selectedCardIds').add('c1');
  const back = openModal(env, 'modal-patient-list', 60);
  const front = openModal(env, 'modal-merge', 68);
  let frontClosed = 0;
  const closeBtn = { click: () => { frontClosed++; front.classList.add('hidden'); } };
  front.querySelector = () => closeBtn;
  back.querySelector = () => ({ click: () => back.classList.add('hidden') });
  env.doc.fireKey('Escape');
  assert.equal(frontClosed, 1, '手前の画面だけ閉じる');
  assert.ok(!back.classList.contains('hidden'));
  assert.equal(env.run('selectedCardIds').size, 1, '後ろのカードの選択は消えない');
  env.doc.fireKey('Escape');
  assert.ok(back.classList.contains('hidden'));
  // 画面が開いていなければ、これまで通り Esc で選択を解除する
  env.byId('view-so-board').classList.remove('hidden');
  env.byId('modal-card-overview').classList.add('hidden'); // ブラウザでは最初から隠れている
  env.doc.fireKey('Escape');
  assert.equal(env.run('selectedCardIds').size, 0);
});

test('③Esc：APIキーの案内の画面は、自分の Esc の処理に任せる（js/05 では閉じない）', async () => {
  const env = await readyEnv();
  env.sandbox.getComputedStyle = el => ({ zIndex: String(el.zIndex || 0) });
  const m = openModal(env, 'modal-api-required', 62);
  m.querySelector = () => { throw new Error('触らない'); };
  env.doc.fireKey('Escape');
  assert.ok(!m.classList.contains('hidden'));
});

test('③ダイアログ：答えの出ていないダイアログがあるうちに次を開くと、前のダイアログは「キャンセル」で終わる。確認ボタンにフォーカスを移す', async () => {
  const env = await readyEnv();
  const first = env.run('openDialog')({ title: '1つ目' });
  assert.equal(env.doc.activeElement, env.byId('dialog-confirm'), '入力欄が無いときは確認ボタンへ');
  const second = env.run('openDialog')({ title: '2つ目' });
  assert.equal(await first, null);
  env.run('closeDialog(true)');
  assert.equal(await second, true);
});

// ===================== ④ 元に戻す =====================
test('④元に戻す：削除の後に別の患者へ切り替えてから押しても、削除した患者の更新日時を進め、共有先へ送る', async () => {
  const env = await readyEnv();
  withPatients(env, [P('A', '患者A', 'a', [{ id: 'c1', text: 'a', type: 'o', hendersonIds: [], assessmentCols: {} }]), P('B', '患者B', 'b')], 'A');
  env.sandbox.deleteItem('c1');
  const undoBtn = env.created.filter(e => e.textContent === '元に戻す').pop();
  env.run("changeCurrentPatient('B')");
  env.runTimers(); // 削除の送信などを済ませる
  const st = env.run('globalAppData');
  st.patients.find(p => p.id === 'A').updatedAt = '2026-01-01T00:00:00.000Z'; // 同じミリ秒で比べないように古くしておく
  env.run('unsyncedPatientIds').delete('A');
  const before = st.patients.find(p => p.id === 'A').updatedAt;
  undoBtn.click();
  const a = st.patients.find(p => p.id === 'A');
  assert.ok(a.items.some(i => i.id === 'c1'), '戻る');
  assert.notEqual(a.updatedAt, before, '更新日時を進める');
  assert.ok(env.run('unsyncedPatientIds').has('A'), '患者Aを共有先へ送る予約をする');
  const src = fs.readFileSync(path.join(ROOT, 'js/09-board.js'), 'utf8');
  assert.equal((src.match(/\}, \{ patientId: patId \}\)/g) || []).length, 4, '統合・不要・削除・不要の消去の4か所');
});

// ===================== ⑤ 記録メモの入力 =====================
test('⑤記録メモ：1文字ごとには保存・描き直しをせず、打ち終わってからまとめて保存する', async () => {
  const env = await readyEnv();
  withPatients(env, [P('A', '患者A', ''), P('B', '患者B', 'Bのメモ')], 'A');
  env.runTimers();
  env.store.delete('nursing_patients_data');
  const ta = env.byId('source-text');
  ta.value = 'あ'; ta.fire('input');
  ta.value = 'あい'; ta.fire('input');
  const st = env.run('globalAppData');
  assert.equal(st.patients[0].sourceText, 'あい', '患者の本文はすぐ書き換える');
  assert.equal(env.store.has('nursing_patients_data'), false, 'まだ保存はしない');
  env.runTimers(t => t.ms === 600);
  assert.equal(JSON.parse(env.store.get('nursing_patients_data')).patients[0].sourceText, 'あい');
});

test('⑤記録メモ：保存待ちのまま患者を切り替える・画面を隠しても、書いた内容は今の患者に入り、切り替え先は変わらない', async () => {
  const env = await readyEnv();
  withPatients(env, [P('A', '患者A', ''), P('B', '患者B', 'Bのメモ')], 'A');
  const ta = env.byId('source-text');
  ta.value = 'Aに書いた'; ta.fire('input');
  env.run("changeCurrentPatient('B')");
  const st = env.run('globalAppData');
  assert.equal(st.patients.find(p => p.id === 'A').sourceText, 'Aに書いた');
  const bUpdated = st.patients.find(p => p.id === 'B').updatedAt;
  assert.equal(env.timers().filter(t => t.ms === 600).length, 0, '保存待ちは取り消す（切り替え先の更新日時を進めない）');
  assert.equal(st.patients.find(p => p.id === 'B').updatedAt, bUpdated);
  assert.equal(st.patients.find(p => p.id === 'B').sourceText, 'Bのメモ');
  // 画面を隠したとき
  ta.value = 'Bに書いた'; ta.fire('input');
  env.doc.visibilityState = 'hidden';
  env.doc.fireDoc('visibilitychange', {});
  assert.equal(JSON.parse(env.store.get('nursing_patients_data')).patients.find(p => p.id === 'B').sourceText, 'Bに書いた');
});
