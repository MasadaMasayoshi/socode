'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
// Expected developer contract is authored independently of app output.
const INSTRUCTION = '【依頼対象：サイトのコード修正】';
const SOURCE = '入院前：食事は全量摂取。\n入院後：創痛がある。\n前後の記録も残す。';
const patient = () => ({ title: '架空患者', items: [
  { id: 'a', text: '食事は全量摂取。', type: 's', timestamp: '入院前', hendersonIds: [2], assessmentCols: { 2: 'preadmission' }, editLog: [
    { kind: 'tagAdd', hId: 2 }, { kind: 'tagRemove', hId: 10 }
  ] },
  { id: 'b', text: '創痛がある。', type: 'o', timestamp: '入院後', hendersonIds: [], tagNotNeeded: true }
] });

function assertCodeFixContract(out) {
  assert.match(out, /文章を訂正して返す作業ではありません/);
  assert.match(out, /次回の分類・判定・表示・書き出し/);
  assert.match(out, /fix the actual extraction/);
  assert.match(out, /Rewriting a sample report, prompt or one patient is not completion/);
  assert.match(out, /positive examples and counterexamples/);
  assert.match(out, /existing saved data after reload and append classification/);
  assert.match(out, /Preserve manual edits, learned decisions/);
  assert.match(out, /push the tested commit to GitHub/);
  assert.match(out, /verify the deployed code/);
  const card = out.indexOf('カードの内容:');
  if (card >= 0) assert.ok(out.indexOf(INSTRUCTION) < card);
}

for (const includeSource of [false, true]) {
  for (const assessment of [false, true]) {
    test(`selected export includes one instruction and preserves content (source=${includeSource}, assessment=${assessment})`, () => {
      const cp = patient(), before = JSON.stringify(cp);
      const out = app.buildSelectedCardsExportText(cp, ['a', 'b'], SOURCE, includeSource, assessment);
      assert.equal(out.split(INSTRUCTION).length - 1, 1);
      assertCodeFixContract(out);
      assert.equal(out.split('[Developer instructions]').length - 1, 1);
      assert.ok(!out.includes('【調査・修正の指示】'));
      assert.match(out, /^修正依頼メモ：架空患者（選択したカード 2件）/);
      assert.ok(out.includes('分類: Sデータ ／ 日時: 入院前 ／ タグ: 食事'));
      assert.ok(out.includes('分類: Oデータ ／ 日時: 入院後 ／ タグ: なし'));
      assert.ok(out.includes('カードの内容: 創痛がある。'));
      assert.match(out, /手で編集した履歴:\n/);
      assert.match(out, /タグを追加: 食事/);
      assert.match(out, /タグを削除: コミュニケーション/);
      assert.equal(out.includes('【総合アセスメント表'), assessment);
      assert.equal(out.includes('【分類前の文章'), includeSource);
      if (includeSource) assert.ok(out.endsWith(SOURCE + '\n'));
      assert.equal(JSON.stringify(cp), before);
    });
  }
  test(`review export includes one instruction and preserves guidance (source=${includeSource})`, () => {
    const cp = patient(), before = JSON.stringify(cp);
    const out = app.buildReviewRequestText(cp, SOURCE, includeSource);
    assert.equal(out.split(INSTRUCTION).length - 1, 1);
      assertCodeFixContract(out);
    assert.match(out, /^修正依頼：架空患者/);
    assert.ok(out.includes('カードの内容: 食事は全量摂取。'));
    assert.match(out, /状況（手で編集済み）:/);
    assert.ok(out.includes('approved『タグ不要』/『理由を了承』decisions'));
    assert.equal(out.includes('【分類前の文章'), includeSource);
    if (includeSource) assert.ok(out.endsWith(SOURCE + '\n'));
    assert.equal(JSON.stringify(cp), before);
  });
}

for (const kind of ['selected', 'review']) {
  test(`${kind} export includes one instruction with no cards`, () => {
    const cp = { title: '空', items: [] };
    const out = kind === 'selected'
      ? app.buildSelectedCardsExportText(cp, [], '', false)
      : app.buildReviewRequestText(cp, '', false);
    assert.equal(out.split(INSTRUCTION).length - 1, 1);
      assertCodeFixContract(out);
  });
}
