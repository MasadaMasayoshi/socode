'use strict';
// 利用者からの要望：「ページ内にGeminiの評価を受ける方法」。①ヘンダーソンの分類の誤り ②時系列の整理
// ③情報の抜き出し（まとめる・分ける）④タグ未設定のタグ、をまとめて尋ね、提案を適用・改善点ファイルに保存できる。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('評価の指示には4つの質問・分類前の文章・カード一覧（今のタグ・タグ未設定の印）・基準ノートが入る', () => {
  const items = [
    { id: 'a', type: 'o', timestamp: '術後1日目 12:00', text: '昼食摂取、半分', hendersonIds: [2] },
    { id: 'b', type: 'o', timestamp: '入院前', text: '生殖: 特に問題なし', hendersonIds: [] }
  ];
  const ev = app.buildEvidenceIndex(items);
  const prompt = app.buildAiReviewPrompt({ sourceText: '分類前の元の文章' }, ev, items);
  ['tagIssues', 'timeline', 'extractionIssues', 'untagged', '分類前の元の文章', '〔C1〕[O][術後1日目 12:00] 昼食摂取、半分 {タグ:2}', '〔C2〕[O][入院前] 生殖: 特に問題なし {タグ:タグ未設定}', '基準ノート', '適切なタグは複数あってよい']
    .forEach(s => assert.ok(prompt.includes(s), s));
});

test('AIの答え（```json付き・番号の表記ゆれ・範囲外のタグ）を読み取れる', () => {
  const r = app.parseAiReviewJson('```json\n{"overview":"総評","tagIssues":{"summary":"s","items":[{"card":"c 3","currentTags":[1],"suggested":[1,9,15],"reason":"x"}]},"timeline":{"summary":"良い","items":[{"card":"C2","suggestedTimestamp":"術後1日目 12:00"}]},"extractionIssues":{"items":[{"kind":"merge","cards":["C3","C4"],"mergedText":"A、B"},{"kind":"zzz","cards":["C1"]},{"kind":"split","cards":["C5"],"parts":[{"type":"s","text":"「痛い」"},"観察"]}]},"untagged":{"items":[{"card":"C9","suggested":[9]}]},"advice":["a"]}\n```');
  assert.equal(r.overview, '総評');
  assert.equal(r.extractionIssues[2].parts[0].type, 's');
  assert.equal(r.extractionIssues[2].parts[1].text, '観察', '文字列だけの分け方も読める');
  assert.equal(r.tagIssues[0].card, 'C3');
  assert.deepEqual(Array.from(r.tagIssues[0].suggested), [1, 9], '15は捨てる');
  assert.equal(r.timeline.issues[0].suggestedTimestamp, '術後1日目 12:00');
  assert.equal(r.extractionIssues[0].kind, 'merge');
  assert.equal(r.extractionIssues[1].kind, 'other', '知らない種類はその他');
  assert.equal(r.untagged[0].card, 'C9');
  assert.throws(() => app.parseAiReviewJson('評価できませんでした'));
});

test('改善点ファイル（Claudeに渡す用）：総評・4つの項目（見出し・現状・修正案・理由）・アドバイス・分類前の文章', () => {
  const result = app.parseAiReviewJson(JSON.stringify({
    overview: 'おおむね良い。', advice: ['Sには場面を添える'],
    tagIssues: { summary: '1件', items: [] }, timeline: { summary: '良い', items: [] },
    extractionIssues: { summary: 'S/Oの混在', items: [{ kind: 'split', cards: ['C1'], title: '術後1日目の昼食', current: 'SとOが混在', parts: [{ type: 's', text: '「食欲がない」' }, { type: 'o', text: '半分摂取' }], reason: '正確なアセスメント' }] },
    untagged: { summary: '', items: [{ card: 'C1', suggested: [9], reason: '疼痛' }] }
  }));
  const cp = { title: '患者X', sourceText: '元の文章', items: [{ id: 'a', type: 's', timestamp: '10:00', text: '「痛い」', hendersonIds: [] }],
    aiReview: { at: '2026-09-28T00:00:00Z', codes: { C1: 'a' }, applied: { 'untag:0': true }, result } };
  const md = app.buildAiReviewMarkdown(cp);
  ['## 総評', 'おおむね良い。', '## 1. ヘンダーソンの分類', '## 2. 時系列の整理', '## 3. 情報の抜き出し', '### 【分ける】術後1日目の昼食', '- 現状：', 'C1 [S][10:00] 「痛い」', 'SとOが混在', '- 修正案：次のように分ける：【Sデータ】「食欲がない」 ／ 【Oデータ】半分摂取', '- 理由：正確なアセスメント', '## 4. タグ未設定のカード', '（アプリで適用済み）', '## 改善のためのアドバイス', '- Sには場面を添える', '元の文章']
    .forEach(t => assert.ok(md.includes(t), t));
});

test('以前の形（配列だけ）の答えも読み取れる', () => {
  const r = app.parseAiReviewJson('{"tagIssues":[{"card":"C1","current":[1],"suggested":[1,9]}],"untagged":[]}');
  assert.equal(r.tagIssues[0].card, 'C1');
  assert.deepEqual(Array.from(r.tagIssues[0].current), [1]);
  assert.equal(r.overview, '');
});

test('分類ボードと総合アセスメント表のAI分析ツールから開ける', () => {
  assert.match(html, /id="btn-open-ai-review" onclick="openAiReview\(\)"/);
  // 総合アセスメント表では、AIのボタンの列（js/08 の renderAiSteps）に「分類の評価」として出す
  assert.match(require('fs').readFileSync(require('path').join(__dirname, '..', 'js', '08-assessment-tools.js'), 'utf8'), /label: '分類の評価'.*action: 'openAiReview\(\)'/);
  assert.match(html, /id="modal-ai-review"/);
  assert.match(html, /onclick="downloadAiReview\(\)"/);
});
