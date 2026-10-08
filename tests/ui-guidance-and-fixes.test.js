'use strict';
// 利用者からの見直しの一覧への対応の確認
//  ・文言（AIの注意書き・検査値の簡易チェック・モデルの表記・保存先と状態）
//  ・通知（成功は短く消える／失敗は×を押すまで残る／入力の不足は注意）
//  ・手直し（元に戻す・カードを分ける）、作業の流れ、AIの結果が別の患者の画面に出ない
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp, readAppSource } = require('./app-helpers');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const src = readAppSource();
const clone = v => JSON.parse(JSON.stringify(v));

test('文言：NotebookLM に問い合わせているような表示・性能や混雑を保証する表記・「明確な異常所見は見つかりませんでした」を使わない', () => {
  assert.doesNotMatch(src, /NotebookLM基準に照らして|NotebookLM基準による検査値評価|NotebookLM基準により/);
  assert.match(src, /登録された基準で検査値を確認しています/);
  assert.doesNotMatch(html, /いちばん賢い|混みにくい/);
  assert.match(html, /標準（Flash）/);
  assert.match(html, /軽量（Flash-Lite）/);
  assert.doesNotMatch(src, /明確な異常所見|明確な欠落|明確な不足情報/);
  assert.match(src, /簡易チェックでは異常値を検出できませんでした/);
  assert.match(src, /すべての項目を判定できるわけではありません/);
});

test('文言：AIの結果の注意書きは1つの文にそろえ、詳しい説明はたたむ。カード操作の説明は短くし、詳しくは「操作方法」', () => {
  const notes = html.match(/<details class="ai-note"[^>]*><summary>[\s\S]*?<\/summary>/g) || [];
  assert.equal(notes.length, 5);
  notes.forEach(n => assert.match(n, /AIの参考案です。根拠を確認し、最終判断は医療従事者が行ってください/));
  assert.match(html, /カードを選ぶと、分類やタグを変更できます/);
  assert.doesNotMatch(html, /Ctrl\(⌘\)\+クリックで複数選択、またはカード左上/);
  assert.match(html, /id="modal-help"/);
  assert.match(html, /data-help-section="keys"/);
});

test('保存の表示：保存先と状態（このブラウザ／共有先・保存済み／失敗）を分けて出し、このブラウザへの保存は読み直して確かめる', () => {
  assert.match(src, /このブラウザに保存済み・共有先へ保存中/);
  assert.match(src, /共有先に保存済み/);
  assert.match(src, /共有先への保存に失敗（このブラウザには保存済み・押すと再送）/);
  assert.match(src, /このブラウザに保存できませんでした/);
  assert.match(src, /function writeLocalVerified[\s\S]*?localStorage\.getItem\(key\)/);
});

function toastApp() {
  const created = [];
  const mk = () => {
    const e = { value: '', textContent: '', style: {}, dataset: {}, children: [], className: '',
      classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle() {}, contains(c) { return this._s.has(c); }, replace() {} },
      addEventListener(t, fn) { (e._l = e._l || {})[t] = fn; }, removeEventListener() {}, append(...c) { e.children.push(...c); }, appendChild(c) { e.children.push(c); },
      replaceChildren() {}, insertBefore() {}, removeChild() {}, remove() { e.removed = true; }, querySelector() { return mk(); }, querySelectorAll() { return []; },
      setAttribute(k, v) { e['attr_' + k] = v; }, getAttribute() { return null; }, hasAttribute() { return false; }, removeAttribute() {},
      contains() { return false; }, closest() { return null; }, focus() {}, blur() {}, click() {}, scrollIntoView() {}, getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; } };
    return e;
  };
  const container = mk();
  const doc = { getElementById(id) { return id === 'toast-container' ? container : mk(); }, addEventListener() {}, removeEventListener() {}, querySelector() { return mk(); }, querySelectorAll() { return []; },
    createElement(tag) { const e = mk(); e.tag = tag; created.push(e); return e; }, createDocumentFragment() { return mk(); },
    documentElement: { getAttribute() { return null; }, setAttribute() {}, classList: { add() {}, remove() {} }, style: {} }, body: mk(), visibilityState: 'visible' };
  const timers = [];
  const app = loadApp({ document: doc, setTimeout: (fn, ms) => { timers.push(ms); return timers.length; } });
  return { app, container, timers };
}
test('通知：成功は数秒で消える／失敗は×を押すまで残り、次にすることを添える／入力の不足は「注意」', () => {
  const { app, container, timers } = toastApp();
  timers.length = 0;
  app.__testHooks.showToast('保存しました', 'success', 8000);
  assert.ok(timers.some(ms => ms <= 3000), '成功は3秒以内に消す');
  timers.length = 0;
  app.__testHooks.showToast(['保存できませんでした', { text: 'もう一度押してください', detail: true }], 'error', 9000);
  assert.ok(!timers.some(ms => ms >= 1000), '失敗は時間で消さない');
  const err = container.children[container.children.length - 1];
  assert.ok(err.children.some(c => c.className === 'toast-close'), '×（閉じる）がある');
  assert.equal(err.attr_role, 'alert');
  // 失敗の通知には、次にすることの行（detail）が付いている
  const failures = src.match(/showToast\(\[[^\]]*?できませんでした[^\]]*?\{ text: [^\]]+\], 'error'\)/g) || [];
  assert.ok(failures.length >= 10, `失敗の通知に次にすること（${failures.length}件）`);
  assert.doesNotMatch(src, /showToast\('(?:内容|名前|文章|キーワード)を入力してください', 'error'\)/, '入力の不足は error ではなく warn');
});

test('手直し：カードを分ける（1行目は元のカード・日時とタグを引き継ぐ）・元に戻すで分ける前に戻る', () => {
  const app = loadApp();
  const cp = { id: 'P', items: [{ id: 'a', type: 'o', text: '疼痛NRS4。創部に発赤なし。', timestamp: '術後1日目', hendersonIds: [9], assessmentCols: { 9: 'postadmission' } }], deletedItemIds: [] };
  const before = JSON.stringify(cp.items);
  const res = app.splitCardIntoParts(cp, 'a', ['疼痛NRS4。', '', '創部に発赤なし。']);
  assert.equal(res.length, 2);
  assert.deepEqual(clone(cp.items.map(i => [i.text, i.timestamp, i.hendersonIds])), [['疼痛NRS4。', '術後1日目', [9]], ['創部に発赤なし。', '術後1日目', [9]]]);
  assert.equal(cp.items[0].id, 'a');
  assert.equal(app.splitCardIntoParts(cp, 'a', ['1行だけ']), null, '1行だけでは分けない');
  app.pushUndo('P', before, 'カードを分ける');
  const last = app.undoLast(cp);
  assert.equal(last.label, 'カードを分ける');
  assert.deepEqual(clone(cp.items.map(i => i.text)), ['疼痛NRS4。創部に発赤なし。']);
  assert.ok(cp.deletedItemIds.some(t => t.id === res[1].id), '分けて増えたカードは削除の印を付ける（別の端末で復活させない）');
  assert.equal(app.undoLast(cp), null);
});


test('作業の流れ：次に進む所に印（情報収集 → アセスメント → 看護計画 → 書き出し。記録を貼る・分類・手直しは「情報収集」に1つ）', () => {
  const app = loadApp();
  const st = app.__testHooks.state();
  const cp = st.patients[0];
  cp.items = []; cp.sourceText = '';
  const cur = () => app.workflowStatus(cp).find(s => s.current).key;
  assert.deepEqual(JSON.parse(JSON.stringify(app.workflowStatus(cp).map(s => s.label))), ['情報収集', 'アセスメント', '看護計画', '書き出し']);
  assert.equal(cur(), 'collect');
  cp.sourceText = '体温37.8℃';
  assert.equal(cur(), 'collect');
  cp.items = [{ id: 'a', type: 'unclassified', text: '体温37.8℃', hendersonIds: [7] }];
  assert.equal(cur(), 'collect');
  assert.match(app.workflowStatus(cp).find(s => s.key === 'collect').note, /1枚・未分類1/);
  cp.items[0].type = 'o';
  assert.equal(cur(), 'assess');
  const e = app.ensureMyAssessment(cp, 7); e.interpretation = '発熱している'; app.linkMyEvidenceIds(cp, 7, ['a']); app.confirmMyAssessmentEntry(cp, 7);
  assert.equal(cur(), 'plan');
  app.createCarePlan(cp, { problem: '高体温' });
  assert.equal(cur(), 'export');
  assert.match(html, /id="workflow-steps"/);
});
