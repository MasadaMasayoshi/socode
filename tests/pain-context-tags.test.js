'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const source = '術後1日目\n10:00\n「痛みのため昨晩は眠れなかった」\n「こんなに痛くちゃ動けないし」\n創痛がある。\nレスキューでロキソプロフェン60mg 1錠内服する。';
const tags = item => Array.from(item.hendersonIds);

test('Absent allergies use environment according to the owner classification criterion', () => {
  for (const text of ['アレルギー: なし', '食物アレルギーなし', '薬剤アレルギー：なし', 'アレルギーはない']) assert.deepEqual(Array.from(app.detectMultipleHendersonTags(text)), [9]);
  assert.deepEqual(tags(app.classifyTextByRules('アレルギー：なし')[0]), [9]);
  const output = app.buildReviewRequestText({ title: '検証', items: [{ id: 'a', type: 'o', text: 'アレルギー: なし', timestamp: '入院前', hendersonIds: [] }] }, 'アレルギー：なし');
  assert.match(output, /修正してほしい内容:.*9.環境.*付与漏れ/);
});

test('Pain and rescue medication inherit explicitly affected needs with source evidence', () => {
  const items = app.classifyTextByRules(source);
  for (const text of ['創痛がある。', 'レスキューでロキソプロフェン60mg 1錠内服する。']) {
    const item = items.find(i => i.text === text);
    assert.deepEqual(tags(item), [4, 5]);
    assert.ok(item.contextTagEvidence.some(e => e.id === 5 && /痛みのため昨晩は眠れなかった/.test(e.evidence)));
    assert.ok(item.contextTagEvidence.some(e => e.id === 4 && /こんなに痛くちゃ動けない/.test(e.evidence)));
    assert.equal(item.type, 'o');
    assert.equal(item.timestamp, '術後1日目 10:00');
  }
});

test('A same-scene resting baseline can support movement assessment without changing its condition', () => {
  const items = app.classifyTextByRules('術後2日目\n10:00\nペインスケール「2」（安静時）\nホーマンズ徴候みられず、足関節の底背屈運動行う\n創部ガーゼ上層まで汚染なし\nセファゾリン投与開始\n荷重をかけ、疼痛増強 ペインスケール2→6へ');
  const baseline = items.find(i => /安静時/.test(i.text));
  assert.deepEqual(tags(baseline), [4]);
  assert.equal(baseline.text, 'ペインスケール「2」(安静時)');
  assert.match(baseline.contextTagEvidence[0].evidence, /荷重.*疼痛増強.*2→6/);
});

test('A separate rehabilitation time does not tag the earlier resting measurement', () => {
  const items = app.classifyTextByRules('術後1日目\n14:00\nペインスケール「3」（安静時）\n14:45 RH\n荷重をかけ、疼痛増強 ペインスケール2→6へ');
  assert.deepEqual(tags(items.find(i => /安静時/.test(i.text))), []);
});

test('Yesterday pain is not evidence of today elimination pain', () => {
  const items = app.classifyTextByRules('術後2日目\n10:00\n【昨日疼痛のため車いす移乗拒否し、本日より車椅子移乗しトイレ移動可。】\nペインスケール「3」でがまんできると。');
  const pain = items.find(i => /がまん/.test(i.text));
  assert.deepEqual(tags(pain), []);
  assert.ok(!app.untaggedContextEffects({ items }, pain).some(e => e.id === 3));
});

test('An explicit toilet transfer scene provides elimination and movement evidence', () => {
  const items = app.classifyTextByRules('術後2日目\n10:00\nペインスケール「3」でがまんできると。\n「体重をかけるのは怖い」と言いながら端坐位→車いすへ移乗行う\n上半身を支えることができているが苦痛表情あり、ペインスケール「6」になったと。\nトイレまで行き、移乗してみる。ゆっくり自力での移乗できるが、やや不安定。\n「歩くと痛かった」と訴えあり。');
  const pain = items.find(i => /がまん/.test(i.text));
  assert.deepEqual(tags(pain), [3, 4]);
  assert.ok(pain.contextTagEvidence.some(e => e.id === 3 && /トイレ/.test(e.evidence) && /ペインスケール/.test(e.evidence)));
});

test('Routine food, separate findings, and unknown times do not become pain effects', () => {
  const items = [{ text: '創痛あり、食事全量摂取。自尿あり', timestamp: '10:00', hendersonIds: [2, 3] }, { text: '創痛がある。', timestamp: '10:00', hendersonIds: [] }];
  app.applyPainContextTags(items);
  assert.deepEqual(items[1].hendersonIds, []);
  const unknown = [{ text: '痛みで眠れない', timestamp: '日時不明', hendersonIds: [5] }, { text: '創痛がある。', timestamp: '日時不明', hendersonIds: [] }];
  app.applyPainContextTags(unknown);
  assert.deepEqual(unknown[1].hendersonIds, []);
});

test('Context tagging respects learned classifications and explicit review decisions', () => {
  for (const extra of [{ predictionSource: 'learned' }, { predictionSource: 'fuzzy' }, { tagNotNeeded: true }, { editLog: [{ kind: 'tagRemove', hId: 4 }] }]) {
    const item = { id: 'pain', text: '創痛がある。', timestamp: '10:00', hendersonIds: [], ...extra };
    app.applyPainContextTags([{ text: '痛みで眠れない', timestamp: '10:00', hendersonIds: [5] }, item]);
    assert.deepEqual(item.hendersonIds, []);
  }
  for (const decision of ['none', 'accept']) {
    const item = { id: 'pain', text: '創痛がある。', timestamp: '10:00', hendersonIds: [] };
    const cp = { items: [{ text: '痛みで眠れない', timestamp: '10:00', hendersonIds: [5] }, item], untaggedReviews: { [app.untaggedTextKey(item.text)]: { decision } } };
    app.applyPainContextTags(cp.items, cp);
    assert.deepEqual(item.hendersonIds, []);
  }
});

test('Review export rereads the full source even if surrounding cards are missing', () => {
  const cp = { title: '検証', items: [{ id: 'pain', text: '創痛がある。', timestamp: '術後1日目 10:00', type: 'o', hendersonIds: [] }] };
  const output = app.buildReviewRequestText(cp, source, true);
  assert.match(output, /原文から確認できるタグの根拠/);
  assert.match(output, /睡眠：［術後1日目 10:00］「痛みのため昨晩は眠れなかった」/);
  assert.match(output, /修正してほしい内容: 同じ場面の原文を根拠に睡眠・姿勢を付けてください/);
  assert.match(output, /分類ルールと分類基準を修正/);
  assert.ok(output.includes(source));
  assert.deepEqual(cp.items[0].hendersonIds, []);
});
