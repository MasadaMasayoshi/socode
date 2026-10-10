'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const base = app.DEFAULT_NOTEBOOK_CONTENT;

test('最新の統合版には、2026-09-28 版のあとに直したルールが入っている', () => {
  assert.equal(app.NOTEBOOK_CONTENT_VERSION_MARK, '統合版 2026-09-30');
  assert.ok(base.startsWith('【看護アセスメント 基準ノート（統合版 2026-09-30）】'));
  ['Day 1（月・術後3日目）', '「Sデータ」「Oデータ」だけの行', '麻酔から目が覚める', '母（パート）', 'セファゾリンNa', '(1 mg/Lから換算)', '「判定できません」', '■ 表の貼り付け', '■ 自分のアセスメント・不足情報・看護計画の記録', '「14時ごろ」']
    .forEach(k => assert.ok(base.includes(k), k));
});

test('章の決め方：カードの作り方→1、S/O→2、タグ・検査値→4、計画→8、それ以外→9', () => {
  assert.equal(app.notebookChapterFor('点滴の滴下速度の記載はカードを1枚にまとめてほしい'), 1);
  assert.equal(app.notebookChapterFor('家族からの情報はSではなくOデータにしてほしい'), 2);
  assert.equal(app.notebookChapterFor('内服薬の副作用の記載には14.学びのタグも付けてほしい'), 4);
  assert.equal(app.notebookChapterFor('看護計画のOPには不足情報の確認を必ず入れる'), 8);
  assert.equal(app.notebookChapterFor('略語は正式名称を括弧で添える'), 9);
});

test('統合：書き足された行・追加の分類基準を章に入れ、最新版と同じもの・重複は入れない', () => {
  const lines = base.split('\n');

  const server = ['【看護アセスメント 基準ノート（統合版 2026-09-28）】', lines[8], '・「ガーゼ交換」と「創部の観察」は1枚にまとめる', '・略語は正式名称を括弧で添える'].join('\n');
  const extras = [
    { id: 'x1', text: '家族からの情報はSではなくOデータにしてほしい' },
    { id: 'x2', text: '内服薬の副作用の記載には14.学びのタグも付けてほしい' },
    { id: 'x3', text: '略語は正式名称を括弧で添える' },
    { id: 'x4', text: lines[8].replace(/^・/, '') }
  ];
  const r = app.buildIntegratedNotebook({ serverText: server, extras, today: new Date(2026, 8, 30) });
  assert.deepEqual(JSON.parse(JSON.stringify(r.merged.map(m => [m.source, m.chapter, m.text]))), [
    ['notebook', 1, '「ガーゼ交換」と「創部の観察」は1枚にまとめる'],
    ['notebook', 9, '略語は正式名称を括弧で添える'],
    ['extra', 2, '家族からの情報はSではなくOデータにしてほしい'],
    ['extra', 4, '内服薬の副作用の記載には14.学びのタグも付けてほしい']
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(r.skipped.map(s => s.extraId))), ['x3', 'x4']);
  const t = r.text;

  const c1 = t.indexOf('■ 追加された基準（現場からの要望・統合 2026-09-30）\n・「ガーゼ交換」');
  assert.ok(c1 > t.indexOf('第1章') && c1 < t.indexOf('第2章'), '第1章に入る');
  const c2 = t.indexOf('・家族からの情報はSではなくOデータにしてほしい');
  assert.ok(c2 > t.indexOf('第2章') && c2 < t.indexOf('第3章'), '第2章に入る');
  const c4 = t.indexOf('・内服薬の副作用の記載には14.学びのタグも付けてほしい');
  assert.ok(c4 > t.indexOf('第4章') && c4 < t.indexOf('第5章'), '第4章に入る');
  assert.match(t, /第9章 そのほかの追加の基準（統合 2026-09-30）\n━+\n・略語は正式名称を括弧で添える\n$/);
  assert.ok(t.startsWith('【看護アセスメント 基準ノート（統合版 2026-09-30）】'));

  const again = app.buildIntegratedNotebook({ serverText: t, extras: [], today: new Date(2026, 8, 30) });
  assert.equal((again.text.match(/家族からの情報はSではなくOデータ/g) || []).length, 1);
  assert.equal((again.text.match(/第9章/g) || []).length, 1);
});

test('以前の統合版（2026-09-28）のままの行は「書き足し」として拾わない', () => {

  const old = '5.睡眠：睡眠・休息・入眠困難・中途覚醒・夜間の症状による不眠。移乗や不安そのものは5ではない（4・10）。';
  assert.ok(!base.includes(old));
  assert.deepEqual(JSON.parse(JSON.stringify(app.userAddedNotebookLines(old))), []);
});
