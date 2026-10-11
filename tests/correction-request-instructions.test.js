'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
// Owner-provided wording, independent of app output.
const INSTRUCTION = '原文・前後の記録・編集履歴を照合し、なぜカードが分割・統合されたのか、なぜタグが付与・除外されたのかを調査してください。アプリの自動処理と利用者の手編集を区別し、該当する処理を原文で再現して原因を確認してください。意図した処理か不具合かを判断し、根拠・原因・修正方針を示してください。確認できない理由は推測で断定せず『確認不能』としてください。特定の患者だけに合わせず、同じ種類の記録にも適用できる規則として修正してください。';
const SOURCE = '入院前：食事は全量摂取。\n入院後：創痛がある。\n前後の記録も残す。';
const patient = () => ({ title: '架空患者', items: [
  { id: 'a', text: '食事は全量摂取。', type: 's', timestamp: '入院前', hendersonIds: [2], assessmentCols: { 2: 'preadmission' }, editLog: [
    { kind: 'tagAdd', hId: 2 }, { kind: 'tagRemove', hId: 10 }
  ] },
  { id: 'b', text: '創痛がある。', type: 'o', timestamp: '入院後', hendersonIds: [], tagNotNeeded: true }
] });

for (const includeSource of [false, true]) {
  for (const assessment of [false, true]) {
    test(`selected export includes one instruction and preserves content (source=${includeSource}, assessment=${assessment})`, () => {
      const cp = patient(), before = JSON.stringify(cp);
      const out = app.buildSelectedCardsExportText(cp, ['a', 'b'], SOURCE, includeSource, assessment);
      assert.equal(out.split(INSTRUCTION).length - 1, 1);
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
    assert.match(out, /^修正依頼：架空患者/);
    assert.ok(out.includes('カードの内容: 食事は全量摂取。'));
    assert.match(out, /状況（手で編集済み）:/);
    assert.ok(out.includes('利用者が「タグ不要」「理由を了承」と確定したカードは、その判断を変えない。'));
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
  });
}
