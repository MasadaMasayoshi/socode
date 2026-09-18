'use strict';
// 学習傾向レポート（学習データ管理画面の「学習傾向レポート」タブ）の検証。
//
// 【背景】これまでbuildLearningTrendSummary()は、同じ文言への修正が繰り返され確立した
// 傾向（票数2以上）をAIへの指示文にだけ自動で織り込んでおり、実際に何がどれだけ
// 繰り返し確認されているのかを人が見て確かめる場所が無かった（利用者からの要望：
// 「分類の学習がしやすくなるようなアップデート案」の1つとして採用）。
// computeLearningTrendRows()はbuildLearningTrendSummary（AIへの指示文用）と
// renderLearningTrendsList（画面表示用）の両方から使われる共通ロジックで、
// ここではその判定基準（票数2以上のみ、確立度の高い順）を検証する。

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const app = loadApp();
const { computeLearningTrendRows, buildLearningTrendSummary, HENDERSON_NEEDS } = app;

function hendersonName(id) { return HENDERSON_NEEDS.find(n => n.id === id)?.name; }

test('computeLearningTrendRows: 合計得票が2未満の文言は傾向として反映されない', () => {
  const dict = {
    '一度しか修正されていない文章': { typeVotes: { s: 1 }, hendersonVotes: {} }
  };
  const rows = computeLearningTrendRows(dict);
  assert.equal(rows.length, 0, '票数合計1（2未満）は傾向に含めない');
});

test('computeLearningTrendRows: 合計得票2以上の文言は、分類・タグ情報とともに反映される', () => {
  const dict = {
    '繰り返し確認された文章': { typeVotes: { s: 2 }, hendersonVotes: { 2: 2, 3: 1 } }
  };
  const rows = computeLearningTrendRows(dict);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.text, '繰り返し確認された文章');
  assert.equal(row.totalVotes, 5, 'typeVotes(2)+hendersonVotes(2+1)の合計');
  assert.equal(row.typeLabel, 'S(主観的情報)');
  assert.deepEqual(Array.from(row.tagNames), [hendersonName(2), hendersonName(3)], 'タグは得票の多い順');
});

test('computeLearningTrendRows: 分類もタグも無い（部分的にvotesがあるだけの）行は除外される', () => {
  const dict = {
    // typeVotesの合計はあるが最多得票が無い（0票のみ）などの端数データ
    '空の傾向': { typeVotes: {}, hendersonVotes: {} }
  };
  const rows = computeLearningTrendRows(dict);
  assert.equal(rows.length, 0);
});

test('computeLearningTrendRows: 確立度（合計得票）の高い順に並ぶ', () => {
  const dict = {
    '得票3': { typeVotes: { s: 3 }, hendersonVotes: {} },
    '得票5': { typeVotes: { o: 5 }, hendersonVotes: {} },
    '得票2': { typeVotes: {}, hendersonVotes: { 1: 2 } }
  };
  const rows = computeLearningTrendRows(dict);
  assert.deepEqual(Array.from(rows.map(r => r.text)), ['得票5', '得票3', '得票2']);
});

test('computeLearningTrendRows: 70件のうち票数2以上のもの全てが対象になる（プロンプトへの上位60件への絞り込みは呼び出し側=buildLearningTrendSummaryの責務）', () => {
  const dict = {};
  for (let i = 0; i < 70; i++) {
    dict[`文言${i}`] = { typeVotes: { s: 2 + i }, hendersonVotes: {} }; // 得票が大きいほど新しいindex
  }
  const rows = computeLearningTrendRows(dict);
  assert.equal(rows.length, 70, '判定基準としては70件とも票数2以上で対象になる（件数の絞り込みはしない）');
  assert.equal(rows[0].text, '文言69', '得票が最大のものが先頭に来る');
});

test('buildLearningTrendSummary: 学習データが無い（既定状態の）場合は空文字を返す', () => {
  // loadApp()直後のglobalAppData.learningUserDictは空のため、AIへの指示文には何も追加されない。
  assert.equal(buildLearningTrendSummary(), '', '学習データが無ければ傾向テキストは空');
});
