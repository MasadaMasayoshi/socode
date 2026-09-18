'use strict';
// 「タグ未設定に再提案」機能（既存の（保存済みの）カードに、現在の分類ルールで
// タグを再算出する）の検証。
//
// 【背景】DIAGNOSIS_TAG_HINTS（胆石症・胆結石等）やLAB_STANDARDS（Ht・PT等）の
// ような分類ルールは繰り返し改善されてきたが、ルール追加より前に抽出・保存済みの
// カードには自動で反映されない（新規抽出時にしかルールが適用されないため）。
// 利用者からの報告：同じA氏のカルテに「タグ未設定」のまま残っているカードがあり、
// 該当ルール自体は既に追加されているのに古いカードだけ直っていなかった。
// suggestHendersonTagsForText()は、window.reapplyTagRulesToUntagged()（UIから
// タグ未設定カードだけを対象に再提案するボタン）が使う、新規抽出時と同じ判定ロジックを
// 抜き出した純粋な関数で、ここではその判定基準を検証する。

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const app = loadApp();
const { suggestHendersonTagsForText, hasLearnedSignal } = app;

test('既往歴フィールドの「胆結石」は2(食事)タグが提案される（利用者からの報告事例）', () => {
  const ids = suggestHendersonTagsForText('53歳の時に胆結石を指摘されていたが、症状がないため経過観察中', '既往歴', undefined);
  assert.ok(Array.from(ids).includes(2), '胆結石(胆石症の別表記)はfieldLabelHintTags経由で2(食事)が提案される');
});

test('年齢フィールドラベルには4・9タグが提案される', () => {
  const ids = suggestHendersonTagsForText('A氏・58歳、男性', '年齢', undefined);
  assert.deepEqual(Array.from(ids).sort(), [4, 9]);
});

test('保険フィールドラベルには9タグが提案される', () => {
  const ids = suggestHendersonTagsForText('社会保険', '保険', undefined);
  assert.deepEqual(Array.from(ids), [9]);
});

test('fieldLabelが無くても検査値らしい文章（Ht等）には2(食事・栄養代謝)タグが提案される', () => {
  const ids = suggestHendersonTagsForText('Ht(ヘマトクリット) 41.8%', null, undefined);
  assert.ok(Array.from(ids).includes(2), 'LAB_ITEM_NAME_REGEXでHtが検出され2が提案される');
});

test('学習結果（userLearned）がある場合は、検査値ヒント・見出しラベルヒントより学習結果を優先する', () => {
  // 学習結果でタグ5が選ばれている場合、fieldLabelヒント(保険→9)やlab値ヒント(2)を
  // 上書きせず、学習結果のタグをそのまま使う（新規抽出時のロジックと同じ考え方）。
  const userLearned = { preferredHendersonIds: [5], hendersonVotes: { 5: 3 } };
  const ids = suggestHendersonTagsForText('社会保険', '保険', userLearned);
  assert.deepEqual(Array.from(ids), [5], '学習結果がある場合はfieldLabelヒント(9)を追加しない');
});

test('キーワード検出（detectMultipleHendersonTags）による通常のタグ付けも引き続き機能する', () => {
  // 「食事量が減っている」等の一般的なキーワードは、fieldLabelが無くても検出される。
  const ids = suggestHendersonTagsForText('食事量が減っている', null, undefined);
  assert.ok(Array.from(ids).includes(2));
});

test('何のルールにも一致しない文章（本当に判定できない断片）は空配列を返す', () => {
  const ids = suggestHendersonTagsForText('60g/21', null, undefined);
  assert.deepEqual(Array.from(ids), [], '手がかりの無い断片には何も提案しない（誤タグ付けを避ける）');
});

// 【背景】サーバー側の共有学習辞書（learningDict）は、getEntry(text)が「その文言について
// 学習イベントが一度でも起きた」だけで、preferredType/preferredHendersonIds/typeVotes/
// hendersonVotesがすべて空の「スタブ」エントリを自動作成してしまう（新規カード抽出時に
// 毎回発火する'create'イベント経由）。このスタブは「ユーザーが実際に何かを選んだ・投票した」
// ことを意味しないが、以前はsuggestHendersonTagsForTextが!userLearnedという真偽値だけで
// 判定していたため、スタブが存在するだけで検査値ヒント・見出しラベルヒントが永久に
// 効かなくなっていた（＝一度でも抽出されたことのある文言は、以後ずっとタグ未設定のまま）。
// hasLearnedSignal()はこの「スタブか、実際の学習結果か」を区別するための関数。
test('hasLearnedSignal: 中身が空のスタブ学習エントリは「学習済み」とみなさない', () => {
  const stub = { preferredType: null, preferredCols: {}, preferredHendersonIds: [], typeVotes: {}, hendersonVotes: {} };
  assert.equal(hasLearnedSignal(stub), false, '空のスタブは実際の学習結果ではない');
  assert.equal(hasLearnedSignal(undefined), false);
  assert.equal(hasLearnedSignal({ preferredType: 'o' }), true, 'preferredTypeがあれば学習済み');
  assert.equal(hasLearnedSignal({ preferredHendersonIds: [2] }), true, 'preferredHendersonIdsがあれば学習済み');
  assert.equal(hasLearnedSignal({ typeVotes: { o: 1 } }), true, 'typeVotesがあれば学習済み');
  assert.equal(hasLearnedSignal({ hendersonVotes: { 2: 1 } }), true, 'hendersonVotesがあれば学習済み');
});

test('中身が空のスタブ学習エントリがあっても、検査値ヒント・見出しラベルヒントは通常通り効く（スタブ誤認バグの再発防止）', () => {
  const stub = { preferredType: null, preferredCols: {}, preferredHendersonIds: [], typeVotes: {}, hendersonVotes: {} };
  const idsLab = suggestHendersonTagsForText('Ht(ヘマトクリット) 41.8%', null, stub);
  assert.ok(Array.from(idsLab).includes(2), 'スタブだけでは検査値ヒント(2)をブロックしない');
  const idsField = suggestHendersonTagsForText('社会保険', '保険', stub);
  assert.deepEqual(Array.from(idsField), [9], 'スタブだけでは見出しラベルヒント(9)をブロックしない');
});
