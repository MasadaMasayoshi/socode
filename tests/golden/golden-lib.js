'use strict';
// 分類結果の自動チェック（改善提案4）の共通処理。
// ------------------------------------------------------------------------
// これまでの患者さんの元の文章（tests/golden/cases/*.txt）を、今のプログラムの簡易ルール分類
// （学習データを使わない分類。app.jsのclassifyTextByRules）にかけ、保存してある「正しい分類結果」
// （tests/golden/expected/*.json）と比べる。プログラムを直すたびに、直すつもりの無かった
// カードまで変わっていないかを確かめるために使う。
//   ・確認： npm run golden          （変わったカードだけを日本語で一覧表示）
//   ・承認： npm run golden:update   （今の結果を新しい「正しい分類結果」として保存）
// 「例文」は、画面の「例文をセット」の文章（app.jsのSAMPLE_TEXT）を使う。

const fs = require('fs');
const path = require('path');
const { loadApp } = require('../app-helpers');

const CASES_DIR = path.join(__dirname, 'cases');
const EXPECTED_DIR = path.join(__dirname, 'expected');
const SAMPLE_CASE = '例文';

function listCases() {
  const files = fs.readdirSync(CASES_DIR).filter(f => f.endsWith('.txt')).sort();
  return [SAMPLE_CASE, ...files.map(f => f.replace(/\.txt$/, ''))];
}

function classifyCase(app, name) {
  // Windows の Git が改行を CRLF に変えても同じ結果になるよう、改行を \n にそろえる（画面の入力欄と同じ）
  const text = name === SAMPLE_CASE ? app.SAMPLE_TEXT : fs.readFileSync(path.join(CASES_DIR, `${name}.txt`), 'utf8').replace(/\r\n?/g, '\n');
  return Array.from(app.classifyTextByRules(text)).map(c => ({
    timestamp: c.timestamp, type: c.type, hendersonIds: Array.from(c.hendersonIds), fieldLabel: c.fieldLabel, text: c.text
  }));
}

function readExpected(name) {
  const file = path.join(EXPECTED_DIR, `${name}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).cards : null;
}

function writeExpected(name, cards) {
  fs.mkdirSync(EXPECTED_DIR, { recursive: true });
  const body = { case: name, note: 'npm run golden:update で作り直したファイルです。手で編集しないでください。', cards };
  fs.writeFileSync(path.join(EXPECTED_DIR, `${name}.json`), JSON.stringify(body, null, 1) + '\n');
}

const TYPE_LABEL = { s: 'S', o: 'O', unnecessary: '不必要', unclassified: '未分類' };
function describeCard(app, c) {
  const tagNames = c.hendersonIds.map(h => `${h}.${app.HENDERSON_NEEDS.find(n => n.id === h)?.name || h}`).join('・') || 'タグ未設定';
  return `[${TYPE_LABEL[c.type] || c.type}] ${tagNames}`;
}

// 本文＋時刻が同じカード同士を対応させ、違いを日本語の行の一覧にする（違いが無ければ空配列）
function diffCase(app, expected, actual) {
  const key = c => `${c.timestamp}\u0000${c.text}`;
  const pool = new Map();
  expected.forEach(c => { const k = key(c); (pool.get(k) || pool.set(k, []).get(k)).push(c); });
  const lines = [];
  const added = [];
  actual.forEach(c => {
    const list = pool.get(key(c));
    const old = list && list.shift();
    if (!old) { added.push(c); return; }
    const changes = [];
    if (old.type !== c.type) changes.push(`分類 ${TYPE_LABEL[old.type] || old.type} → ${TYPE_LABEL[c.type] || c.type}`);
    if (old.hendersonIds.join(',') !== c.hendersonIds.join(',')) changes.push(`タグ ${describeCard(app, old).replace(/^\[[^\]]*\] /, '')} → ${describeCard(app, c).replace(/^\[[^\]]*\] /, '')}`);
    if ((old.fieldLabel || null) !== (c.fieldLabel || null)) changes.push(`見出し ${old.fieldLabel || 'なし'} → ${c.fieldLabel || 'なし'}`);
    if (changes.length) lines.push(`  変更: 「${c.text}」（${c.timestamp}）\n        ${changes.join(' ／ ')}`);
  });
  // 見た目が同じで、改行・空白などの見えない文字だけが違うカードは、消えた／新しいではなく1行にまとめる
  const visible = c => `${c.timestamp}\u0000${c.text.replace(/\s/g, '')}`;
  const removed = [];
  pool.forEach(list => list.forEach(c => removed.push(c)));
  removed.forEach(c => {
    const i = added.findIndex(a => visible(a) === visible(c));
    if (i >= 0) { added.splice(i, 1); lines.push(`  変更: 「${c.text.replace(/\s+/g, ' ')}」（${c.timestamp}）\n        見えない文字（改行・空白）だけの違い`); return; }
    lines.push(`  消えた: 「${c.text}」（${c.timestamp}） ${describeCard(app, c)}`);
  });
  added.forEach(c => lines.push(`  新しい: 「${c.text}」（${c.timestamp}） ${describeCard(app, c)}`));
  return lines;
}

// すべての事例を比べる。update=true なら今の結果を「正しい分類結果」として保存する。
function runGolden({ update = false } = {}) {
  const app = loadApp();
  const results = listCases().map(name => {
    const actual = classifyCase(app, name);
    const expected = readExpected(name);
    if (!update && !expected) {
      return { name, cards: actual.length, missingExpected: true, diff: ['  正解データがありません。承認済みの元データを復元してください。'] };
    }
    if (update) {
      writeExpected(name, actual);
      return { name, cards: actual.length, created: !expected, diff: [] };
    }
    return { name, cards: actual.length, diff: diffCase(app, expected, actual) };
  });
  return results;
}

function formatReport(results) {
  const changed = results.filter(r => r.diff.length);
  const out = [];
  results.forEach(r => out.push(`${r.diff.length ? '×' : '○'} ${r.name}（${r.cards}枚）${r.created ? ' … 正しい分類結果を新しく保存しました' : r.diff.length ? ` … ${r.diff.length}か所 変わりました` : ''}`));
  changed.forEach(r => { out.push('', `【${r.name}】`, ...r.diff); });
  if (changed.length) {
    if(results.some(r=>r.missingExpected))out.push('', '不足した正解データは、元の承認済みファイルから復旧してください。現在の分類結果を生成して穴埋めしないでください。');
    else out.push('', '変わった内容を元教材と照合し、正解として承認された場合だけ npm run golden:update で保存してください。');
    out.push(
      '意図していない変更なら、プログラムの修正が別のカードに影響しています。');
  }
  return out.join('\n');
}

module.exports = { runGolden, formatReport, listCases };
