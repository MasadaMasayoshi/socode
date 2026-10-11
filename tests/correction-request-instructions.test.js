'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
// Expected developer contract is authored independently of app output.
const INSTRUCTION = 'Compare source, surrounding records and edit history. Separate automatic processing from manual edits; reproduce card splits/merges and tag additions/removals from the source. Determine intended behavior vs bugs; report evidence, cause and fix. Mark unverifiable causes 『確認不能』; do not present guesses as facts. Generalize rules to similar records, not one patient. Preserve source/Japanese clinical text and approved『タグ不要』/『理由を了承』decisions. Classify Henderson needs by meaning, not S/O; assess pre/post admission separately. Honor requested corrections. Check extraction (js/03), keywords (js/01), context/tag rules (js/07). Update the classification criteria in 学習データ管理 → 分類基準 (including the reference notebook in js/02) to reflect the confirmed corrections from this request; keep the criteria and implemented rules consistent for similar records. For each confirmed rule, document the condition, a positive example and a counterexample (such as a different time or an unrelated event), remove superseded contradictory criteria, and advance the notebook version. Run relevant tests; never derive expected answers from app output or hide missing fixtures.';
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
  });
}
