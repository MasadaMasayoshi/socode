'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const note = app.DEFAULT_NOTEBOOK_CONTENT;

test('8章の構成で、版の印が入っている', () => {
  assert.ok(note.includes(app.NOTEBOOK_CONTENT_VERSION_MARK));
  ['第1章 情報カードの作り方', '第2章 S/O・不必要の判定', '第3章 ヘンダーソン14の基本的欲求', '第4章 タグ付けのルール', '第5章 アセスメントの考え方', '第6章 周術期看護の共通の判断基準', '第7章 疾患別の判断基準', '第8章 記録・計画の作り方']
    .forEach(h => assert.ok(note.includes(h), h));
});

test('利用者が指摘したタグの修正が書かれている', () => {
  [/「高血圧（症）」は1にしない/, /「市中肺炎の疑い」に2\.食事・5\.睡眠・8\.清潔は付けない/, /「訴える」「話す」という言葉だけで10にしない/,
    /家族の仕事（「息子は仕事があるから」/, /「体重をかける／のせる」は荷重なので4/, /看護計画の「TP：」（援助計画）は総蛋白TPではない/,
    /DVT予防の装具・徴候（弾性ストッキング・フットポンプ・Homans徴候）は1ではなく9/, /立位保持・歩行訓練/, /生活歴の短い項目の並びは1項目ずつに分ける/]
    .forEach(re => assert.match(note, re));
});

test('古い版の矛盾した記述が残っていない', () => {
  assert.doesNotMatch(note, /1\.呼吸＝[^／]*フットポンプ/, 'DVT予防の装具を1.呼吸にしていた古い対応表');
  assert.doesNotMatch(note, /2\.食事・5\.睡眠・7\.体温・8\.清潔/, '肺炎の病名に広いタグを付ける古い記述');
  assert.doesNotMatch(note, /notebook\.google\.com/, '使えないNotebookLMのリンク');
});

test('ノートに書いた例が、実際のルール分類と一致する', () => {
  const tags = t => Array.from(app.detectMultipleHendersonTags(t.normalize('NFKC'))).sort((a, b) => a - b);
  assert.ok(!tags('既往歴は高血圧症').includes(1));
  assert.ok(!tags('「息苦しくて夜もあまり眠れなかった」と訴える').includes(10));
  assert.ok(!tags('「かといって息子は仕事があるから」').includes(12));
  assert.ok(tags('弾性ストッキング着用、フットポンプ装着').includes(9));
  assert.ok(!tags('弾性ストッキング着用、フットポンプ装着').includes(1));
});

test('追加キーワードも、AIへの指示文に入る', () => {
  app.setCustomTagRulesForTest([{ keyword: '生殖', mode: 'add', hendersonIds: [14], note: '授業の基準' }]);
  const content = app.buildEffectiveNotebookContent();
  assert.match(content, /【追加キーワード（学習データ管理で登録したタグ付けのルール・全員共有）】/);
  assert.match(content, /「生殖」を含むとき、14\.学び のタグを付ける（授業の基準）/);
});
