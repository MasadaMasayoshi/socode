'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();

test('Review exports include unnecessary cards without treating exclusion as proof of a bug', () => {
  const cp = { title: '架空', items: [
    { id: 'excluded', text: '架空の除外記録', type: 'unnecessary', hendersonIds: [], predictionSource: 'rule' },
    { id: 'deleted', text: '削除済み', type: 'unnecessary', deleted: true },
    { id: 'active', text: '食事全量', type: 'o', hendersonIds: [2] }
  ] };
  const before = JSON.stringify(cp);
  assert.deepEqual(Array.from(app.reviewRequestTargets(cp), i => i.id), ['excluded']);
  const out = app.buildReviewRequestText(cp, '架空の除外記録', false);
  assert.match(out, /不必要のカード 1件/);
  assert.match(out, /問題の種類: 不必要に分類/);
  assert.match(out, /なぜ不必要に分類されたか/);
  assert.match(out, /妥当なら根拠を示し/);
  assert.match(out, /自動処理の理由・ルール: 記録なし/);
  assert.match(out, /カードID: excluded／保存済みの分類経路: rule/);
  assert.doesNotMatch(out, /カードの内容: 削除済み|カードの内容: 食事全量/);
  assert.equal(JSON.stringify(cp), before);
});

test('Explicit split records preserve source history and every result ID across serialization', () => {
  const original = { id: 'original', text: '疼痛あり。食事全量。', type: 'o', timestamp: '入院後', hendersonIds: [2, 4], editLog: [{ kind: 'tagRemove', hId: 9, reason: '架空の修正理由' }] };
  const cp = { title: '架空', items: [JSON.parse(JSON.stringify(original))] };
  const split = app.splitCardIntoParts(cp, 'original', ['疼痛あり。', '食事全量。'], '別の基本的欲求を分けて確認する');
  const restored = JSON.parse(JSON.stringify(cp));
  for (const item of restored.items) {
    const event = item.editLog.at(-1);
    assert.equal(event.kind, 'split');
    assert.equal(event.actor, 'user');
    assert.equal(event.reason, '別の基本的欲求を分けて確認する');
    assert.deepEqual(event.sourceCards, [original]);
    assert.deepEqual(event.resultIds, Array.from(split, i => i.id));
    assert.deepEqual(event.parts, ['疼痛あり。', '食事全量。']);
  }
  for (const out of [app.buildReviewRequestText(restored, original.text, false), app.buildSelectedCardsExportText(restored, restored.items.map(i => i.id), original.text, false)]) {
    assert.match(out, /カードを分割:/);
    assert.match(out, /編集理由: 別の基本的欲求を分けて確認する/);
    assert.match(out, /元カード・履歴: .*original.*架空の修正理由/);
    assert.match(out, /変更後カードID: original/);
    assert.match(out, /Explicit split\/merge records show actions, not proof/);
  }
});

test('Missing and historical reasons remain unknown rather than inferred from text edits', () => {
  const cp = { title: '架空', items: [{ id: 'old', type: 'o', text: '前半', hendersonIds: [4], editLog: [{ kind: 'text', from: '前半。後半。', to: '前半' }] }] };
  const out = app.buildReviewRequestText(cp, '前半。後半。', false);
  assert.match(out, /本文差分からの推定・分割操作かは確認不能/);
  assert.match(out, /編集理由: 理由未記録（調査してください）/);
  assert.match(out, /処理主体の明示記録なし/);
  const split = app.splitCardIntoParts(cp, 'old', ['前', '半']);
  assert.equal(split[0].editLog.at(-1).reason, null);
});

 test('Saved review notes remain visible in both exports', () => {
  const cp = { title: '架空', items: [{ id: 'a', type: 'o', text: '架空の記録', hendersonIds: [], tagNotNeeded: true, editLog: [{kind: 'tagRemove', hId: 4}] }] };
  app.setUntaggedReview(cp, 'a', { decision: 'none', note: '原文を確認した利用者の判断' });
  for (const out of [app.buildSelectedCardsExportText(cp, ['a'], '', false), app.buildReviewRequestText(cp, '', false)]) {
    assert.match(out, /保存済みのレビュー判断: none／理由: 原文を確認した利用者の判断/);
  }
});
