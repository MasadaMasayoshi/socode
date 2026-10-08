'use strict';
// 利用者からの要望と、確認項目（繰り返し入力・キーボード操作・AIの途中でページを閉じたとき）への対応の確認
//  ・分類ボードのカードの検査値にも、検査値の推移と同じ色分け（高い＝赤↑・低い＝青↓）を付ける
//  ・分類ボードの並びは、分類の前も後も同じ（自動で入力欄を広げない）
//  ・総合アセスメント表：自分のアセスメントは既定では挟まない／AIのボタンは1列、結果はタブで1つだけ
//  ・記録に書かれた基準値は、値と同じカードに残す（アプリの基準値に置き換えない）
//  ・「Day1（入院時）」「Day2」の見出しの下のカードに日を付ける
//  ・AIの処理の途中でページを閉じたら、次に開いたときに知らせる
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp, readAppSource } = require('./app-helpers');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const src = readAppSource();

test('カードの検査値の色分け：検査値の推移の表と同じ判定で、高い値・低い値に色と矢印を付ける', () => {
  const app = loadApp();
  const st = app.__testHooks.state();
  const cp = st.patients.find(p => p.id === st.currentPatientId) || st.patients[0];
  cp.items = [
    { id: 'a', type: 'o', timestamp: '入院時', text: 'WBC 12000/μL (基準値: 3300〜8600)', hendersonIds: [7] },
    { id: 'b', type: 'o', timestamp: '入院時', text: 'Na 134 mEq/L (基準値: 138-145mEq/L)、K 4.0 mEq/L (基準値: 3.6-4.8mEq/L)', hendersonIds: [2] },
    { id: 'c', type: 'o', timestamp: '入院時', text: '酸素2L開始し、SpO2 94%に上昇', hendersonIds: [1] },
    { id: 'd', type: 'o', timestamp: '入院時', text: 'Hb 14.0 g/dL (基準値: 13.7-16.8)', hendersonIds: [1] }
  ];
  app.resetCardLabFlags();
  const a = app.cardTextWithLabFlagsHtml(cp.items[0]);
  assert.match(a, /<span class="lt-val lt-high card-lab-flag"[^>]*>12000<span class="lt-arrow">↑<\/span><\/span>/);
  const b = app.cardTextWithLabFlagsHtml(cp.items[1]);
  assert.match(b, /lt-low card-lab-flag[^>]*>134</);
  assert.doesNotMatch(b, /card-lab-flag[^>]*>4\.0/, 'Kは基準内なので色を付けない');
  // 文の途中の値は表に入れないので、色も付けない。基準内の値にも付けない
  assert.doesNotMatch(app.cardTextWithLabFlagsHtml(cp.items[2]), /card-lab-flag/);
  assert.doesNotMatch(app.cardTextWithLabFlagsHtml(cp.items[3]), /card-lab-flag/);
  // 文字は安全な形にする
  assert.equal(app.cardTextWithLabFlagsHtml({ id: 'zz', text: '<b>x</b>' }), '&lt;b&gt;x&lt;/b&gt;');
  // 分類ボードと総合アセスメント表のカードで使う
  assert.match(src, /card-text[^`]*\$\{cardTextWithLabFlagsHtml\(item\)\}/);
  assert.equal((src.match(/\$\{cardTextWithLabFlagsHtml\(item\)\}/g) || []).length, 2);
});

test('記録に書かれた基準値は値と同じカードに残し、アプリの基準値に置き換えない', () => {
  const app = loadApp();
  const texts = s => Array.from(app.groupClinicalPhrasesWithTimestamps(s.normalize('NFKC')), i => i.text);
  assert.deepEqual(texts('WBC 12000/μL (基準値: 3300〜8600)'), ['WBC 12000/μL (基準値: 3300〜8600)']);
  assert.deepEqual(texts('Hb 11.8 g/dL（基準値：13.7-16.8）'), ['Hb 11.8 g/dL (基準値: 13.7-16.8)']);
  // 基準値の書かれていない値には、これまでどおりアプリの基準値を付ける
  assert.deepEqual(texts('WBC 12000/μL'), ['WBC 12000 /μL (基準値: 4,000〜9,000 /μL)']);
});

test('「Day1（入院時）」「Day2」の見出しの下のカードに日を付ける（Day2 は直前の Day から数える）', () => {
  const app = loadApp();
  const stamps = s => Array.from(app.groupClinicalPhrasesWithTimestamps(s.normalize('NFKC'))).filter(i => !i.isUnnecessaryBoilerplate).map(i => `${i.timestamp}|${i.text}`);
  assert.deepEqual(stamps('Day1（入院時）\nBT 37.8℃\nDay2\nBT 37.0℃\n【Day3】\nBT 36.8℃'), ['入院時|BT 37.8°C', '入院2日目|BT 37.0°C', '入院3日目|BT 36.8°C']);
  assert.deepEqual(stamps('Day3（金・術後1日目）\nBT 37.0℃\nDay5\nBT 36.5℃'), ['術後1日目|BT 37.0°C', '術後3日目|BT 36.5°C']);
  assert.deepEqual(stamps('Day1\nBT 37.2℃\nDay2\nBT 36.6℃'), ['1日目|BT 37.2°C', '2日目|BT 36.6°C']);
});

test('分類ボードの並びは分類の前も後も同じ（カードが無くても入力欄を広げない。広げるのは「↔」を押したときだけ）', () => {
  assert.match(src, /function updateSourcePaneLayout\(\) \{[\s\S]*?const wide = sourcePaneManual === 'wide';[\s\S]*?view\.classList\.remove\('no-cards'\)/);
  assert.doesNotMatch(src, /sourcePaneManual = null; \/\/ 患者を切り替えたら/);
  assert.doesNotMatch(src, /sourcePaneManual = 'wide'; updateSourcePaneLayout\(\);/);
  // 入力欄のまわりは、利用者が示した画面のとおり（大きい写真の枠・「AIなしで分類」・「テスト用：例文をセット」）
  assert.match(html, /記録メモ・検査結果写真をドラッグ＆ドロップ/);
  assert.doesNotMatch(html, /AIなしで分類<\/button>/); // 「AIなしで分類」ボタンは廃止（分類はいつもAIなし）
  assert.match(html, /id="btn-load-sample"[^>]*>例文をセット</);
});

test('総合アセスメント表：自分のアセスメントは「表示／非表示」の2つ（既定は非表示。1行だけの形は無い）', () => {
  const app = loadApp();
  assert.equal(app.myAssessmentAlwaysShown(), false);
  assert.match(html, /id="btn-my-asm-show"[^>]*onclick="toggleMyAssessmentShown\(\)"/);
  assert.match(html, /自分のアセスメント：<span class="my-asm-show-state">非表示<\/span>/);
  assert.match(src, /selectedNeed === 'all' && myAssessmentAlwaysShown\(\)/);
  assert.match(src, /renderMyAssessmentRowHtml === 'function' && myAssessmentAlwaysShown\(\) \? `<div class="asm-own">\$\{renderMyAssessmentRowHtml\(cp, need, false\)\}/);
  assert.match(src, /label\.textContent = myAsmAlwaysShown \? '表示' : '非表示'/);
  assert.match(src, /localStorage\.setItem\('nursing_my_asm_show'/);
});

test('総合アセスメント表：AIのボタンは1列にまとめて見せ、結果はタブで1つだけ表示する（表の上に積み重ねない）', () => {
  assert.doesNotMatch(html, /id="ai-tools-menu"/);
  assert.match(html, /<div id="ai-results" class="ai-results hidden">[\s\S]*id="ai-results-tabs"[\s\S]*id="lab-evaluation-panel" class="ai-panel hidden[\s\S]*id="careplan-panel"[\s\S]*<\/div>\s*<\/div><!-- \/ai-results -->/);
  ['evaluateMissingInfoAI()', 'suggestNursingDiagnosesAI()', 'reviewAllCarePlansAiUI()', 'evaluateLabValuesAI()', 'checkContradictionsAI()', 'generateTimelineSummaryAI()', 'openAiReview()'].forEach(a => assert.ok(src.includes(a), a));
  assert.match(src, /function refreshAiResults\(keepActive = true\)/);
  assert.match(src, /window\.showAiResult = function/);
  // AIの失敗は結果の欄に出すので、通知は消えるもの（注意）にする
  assert.match(src, /S\/O矛盾チェックができませんでした[^\n]*'warn'\);/);
});

test('AIの処理の途中でページを閉じたら、次に開いたときに知らせる（ほかのタブで実行中の新しい記録には触れない）', () => {
  const store = new Map();
  const localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const app = loadApp({ localStorage });
  const now = Date.parse('2026-09-30T12:00:00Z');
  store.set('nursing_ai_pending', JSON.stringify([
    { id: 'old', at: '2026-09-30T11:40:00Z', patient: '患者A' },
    { id: 'new', at: '2026-09-30T11:59:30Z', patient: '患者B' }
  ]));
  assert.equal(app.notifyLostAiRequests(now), 1);
  assert.deepEqual(JSON.parse(store.get('nursing_ai_pending')).map(p => p.id), ['new']);
  assert.equal(app.notifyLostAiRequests(now), 0);
  assert.match(src, /hasData \|\| aiRequestsRunning > 0/);
});

test('キーボード：ボードを描き直しても、同じカードの同じ部品へフォーカスを戻す。︙メニューで移したカードへも戻す', () => {
  assert.match(src, /const focusBefore = captureBoardFocus\(\);/);
  assert.match(src, /restoreBoardFocus\(focusBefore\);/);
  // （レビューの修正で、IDは属性用に変換して入れるようになった：escapeHtml(item.id)）
  assert.match(src, /class="card-menu-btn" data-card-id="\$\{(?:escapeHtml\()?item\.id\)?\}"/);
  assert.match(src, /if \(e\.detail === 0\) document\.getElementById\(id\)\?\.querySelector\('\.card-menu-btn'\)\?\.focus\(\);/);
});
