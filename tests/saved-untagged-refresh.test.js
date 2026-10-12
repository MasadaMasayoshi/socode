'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const source = '入院前\nアレルギー：なし\n術後1日目\n8:00 回診\n硬膜外麻酔抜去\n10:00\n「痛みのため昨晩は眠れなかった」\n「こんなに痛くちゃ動けないし」\n創痛がある。\nレスキューでロキソプロフェン60mg 1錠内服する。\n14:00\nペインスケール「3」（安静時）\n14:45 RH\n荷重をかけ、疼痛増強 ペインスケール2→6へ';
const saved = (text, timestamp, extra = {}) => ({ id: text, text, timestamp, type: 'o', hendersonIds: [], assessmentCols: {}, predictionSource: 'rule', ...extra });
const tags = item => Array.from(item.hendersonIds);

test('Existing automatic cards receive source-supported tags without replacing patient work', () => {
  const cp = { sourceText: source, items: [
    saved('アレルギー: なし', '入院前'),
    saved('回診: 硬膜外麻酔抜去', '術後1日目 8:00'),
    saved('創痛がある。', '術後1日目 10:00'),
    saved('レスキューでロキソプロフェン60mg 1錠内服する。', '術後1日目 10:00'),
    saved('ペインスケール「3」(安静時)', '術後1日目 14:00')
  ], myAssessments: { 4: '手書き評価' }, carePlans: { plan: { evidenceIds: ['創痛がある。'] } }, relationMap: { nodes: [{ itemIds: ['創痛がある。'] }] } };
  const work = JSON.stringify([cp.myAssessments, cp.carePlans, cp.relationMap]);
  const identity = cp.items.map(i => [i.id, i.text, i.timestamp, i.type]);
  assert.equal(app.refreshSavedUntaggedCards(cp, cp.sourceText, '2026-10-11T20:00:00Z'), 3);
  assert.deepEqual(cp.items.map(tags), [[9], [], [4, 5], [4, 5], []]);
  assert.deepEqual(cp.items.map(i => [i.id, i.text, i.timestamp, i.type]), identity);
  assert.equal(JSON.stringify([cp.myAssessments, cp.carePlans, cp.relationMap]), work);
  assert.match(cp.items[2].contextTagEvidence.find(e => e.id === 5).evidence, /痛みのため昨晩は眠れなかった/);
  assert.equal(cp.items[2]._touchedAt, '2026-10-11T20:00:00Z');
  const after = JSON.stringify(cp);
  assert.equal(app.refreshSavedUntaggedCards(cp), 0);
  assert.equal(JSON.stringify(cp), after);
});

test('Manual, approved and deleted cards keep their original decisions', () => {
  for (const extra of [{ predictionSource: 'confirmed' }, { tagNotNeeded: true }, { deleted: true }, { aiSuggested: true }, { editLog: [{ kind: 'tagRemove', hId: 9 }] }, { editLog: [{ kind: 'text', before: '別の文章' }] }]) {
    const cp = { sourceText: source, items: [saved('アレルギー: なし', '入院前', extra)] };
    const before = JSON.stringify(cp);
    assert.equal(app.refreshSavedUntaggedCards(cp), 0);
    assert.equal(JSON.stringify(cp), before);
  }
  for (const decision of ['none', 'accept', 'assign']) {
    const item = saved('アレルギー: なし', '入院前');
    const cp = { sourceText: source, items: [item], untaggedReviews: { [app.untaggedTextKey(item.text)]: { decision } } };
    assert.equal(app.refreshSavedUntaggedCards(cp), 0);
    assert.deepEqual(item.hendersonIds, []);
  }
});

test('A legacy automatic card is updated only when source text and event time match', () => {
  const cp = { sourceText: source, items: [
    saved('アレルギー: なし', '入院前', { predictionSource: undefined }),
    saved('創痛がある。', '術後2日目 10:00'),
    saved('創痛が強い。', '術後1日目 10:00'),
    saved('創痛がある。', '術後1日目 10:00', { hendersonIds: [9] })
  ] };
  assert.equal(app.refreshSavedUntaggedCards(cp), 2);
  assert.deepEqual(cp.items.map(tags), [[9], [], [], [4, 5, 9]]);
  assert.equal(app.refreshSavedUntaggedCards({ items: [saved('アレルギー: なし', '入院前')] }), 0);
});

test('Correction export includes unedited learned gaps and distinguishes unmatched source', () => {
  const cp = { title: '架空検証', items: [saved('創痛がある。', '術後1日目 10:00')] };
  const before = JSON.stringify(cp);
  const out = app.buildReviewRequestText(cp, source);
  assert.match(out, /確認できた差分: 最新ルールではタグが付きますが、保存済みカードには反映されていません/);
  assert.match(out, /保存済みの分類経路: rule／自動タグ更新: 対象/);
  assert.match(out, /原文を最新ルールで再分類したタグ: 姿勢・睡眠/);
  assert.match(out, /existing saved data after reload and append classification with duplicate records/);
  assert.equal(JSON.stringify(cp), before);
  cp.items[0].predictionSource = 'learned';
  const protectedOut = app.buildReviewRequestText(cp, source);
  assert.match(protectedOut, /保存済みの分類経路: learned／自動タグ更新: 対象/);
  assert.match(protectedOut, /確認できた差分:/);
  cp.items[0].timestamp = '術後2日目 10:00';
  assert.match(app.buildReviewRequestText(cp, source), /確認不能（本文と日時が一致する原文カードなし）/);
});

test('Retired shipped pain-to-environment criteria do not return as user additions', () => {
  const old = '1.呼吸＝PTE（突然の呼吸困難・SpO2低下）・循環動態・麻酔管理／2.食事＝低栄養（Alb・BMI。せん妄の要因）／3.排泄＝尿道カテーテル・早期抜去・トイレ動作／4.姿勢＝良肢位・禁忌肢位・脱臼予防・外転枕・牽引・早期離床・移乗・段階的荷重・リハビリテーション／9.環境＝疼痛（ペインスケール）・創部（SSI・発赤・熱感・腫脹）・ドレーン管理・カットアウト・DVT予防（弾性ストッキング・フットポンプ・Homans徴候）・転倒予防／10.コミュニケーション＝術後せん妄・荷重や歩行への不安・恐怖の表出／14.学び＝脱臼予防の日常生活指導・骨粗鬆症治療の理解・二次骨折予防（FLS）。';
  assert.deepEqual(Array.from(app.userAddedNotebookLines(old)), []);
  assert.match(app.DEFAULT_NOTEBOOK_CONTENT, /保存済みの未設定カードにも反映/);
  assert.doesNotMatch(app.DEFAULT_NOTEBOOK_CONTENT, /9.環境＝疼痛（ペインスケール）/);
});
