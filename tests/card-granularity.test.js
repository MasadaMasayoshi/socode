'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const cards = text => Array.from(app.classifyTextByRules(text)).filter(c => c.type !== 'unnecessary');

test('Admission history separates habitual sleep from the current symptom', () => {
  const result = cards('氏名：A氏 76歳 女性\n入院日：2026年6月8日\n睡眠：7時間程度（寝つきはよい）現在は痛みのため眠れていない\n術後1日目\n10:00 呼吸数17回/分');
  const before = result.find(c => /7時間/.test(c.text));
  const current = result.find(c => /現在は/.test(c.text));
  assert.equal(before.timestamp, '入院前');
  assert.ok(!before.text.includes('眠れていない'));
  assert.equal(current.timestamp, '入院時');
  assert.ok(!current.text.includes('7時間'));
  assert.deepEqual(Array.from(before.hendersonIds), [5]);
  assert.deepEqual(Array.from(current.hendersonIds), [5]);
});

test('Rehabilitation observations retain the sequence and keep patient speech separate', () => {
  const result = cards('術後1日目\n14:45 RH\n理学療法士によるリハビリ開始\nマッサージと関節可動域訓練開始「動かし始めは痛いけど、大丈夫」と本人\n本日、PTとともにベッド上でセッティング・SLR・足関節ROMの訓練実施。\n14:50 ペインスケール「5」\n明日車いす移動予定');
  const observation = result.find(c => c.type === 'o' && /理学療法士/.test(c.text));
  assert.match(observation.text, /関節可動域訓練/);
  assert.match(observation.text, /セッティング・SLR・足関節ROM/);
  assert.ok(!observation.text.includes('動かし始めは痛い'));
  assert.equal(observation.timestamp, '術後1日目 14:45');
  const speech = result.find(c => c.type === 's');
  assert.match(speech.text, /動かし始めは痛いけど、大丈夫/);
  assert.equal(speech.sceneId, observation.sceneId);
  assert.equal(result.find(c => /ペインスケール/.test(c.text)).timestamp, '術後1日目 14:50');
  assert.ok(result.some(c => /明日車いす移動予定/.test(c.text) && c !== observation));
});

test('Physical improvement is not automatically emotional or communication evidence', () => {
  assert.deepEqual(Array.from(app.detectMultipleHendersonTags('「昨夜は痛みもひどくなく、眠れた。痛み止めが効いているのかな。」と本人')), [5]);
  assert.ok(app.detectMultipleHendersonTags('「体重をかけるのが怖い」と話す').includes(10));
  assert.ok(app.detectMultipleHendersonTags('「息子には迷惑をかけたくない」').includes(10));
});

test('Nearby routine food and elimination findings do not become pain effects', () => {
  const cp = { items: [
    { id: 'food', type: 'o', text: '食事全量摂取', timestamp: '術後1日目 10:00' },
    { id: 'pain', type: 'o', text: '創痛がある。', timestamp: '術後1日目 10:00' },
    { id: 'urine', type: 'o', text: '自尿あり', timestamp: '術後1日目 10:00' },
    { id: 'sleep', type: 's', text: '痛みのため眠れない', timestamp: '術後2日目 10:00' }
  ] };
  assert.deepEqual(Array.from(app.untaggedContextEffects(cp, cp.items[1])), []);
  cp.items[2].text = '痛みでトイレまで歩けない';
  assert.ok(app.untaggedContextEffects(cp, cp.items[1]).some(e => e.id === 3));
  cp.items[2].deleted = true;
  assert.deepEqual(Array.from(app.untaggedContextEffects(cp, cp.items[1])), []);
});

test('Independent care changes preserve their targets and measured values stay together', () => {
  const result = cards('術後1日目\n8:00 回診\n酸素OFF、硬膜外麻酔抜去、フットポンプOFF\n10:00 体温37.0度 血圧125/70 脈拍74回/分 呼吸数17回/分 SpO2 98%');
  for (const text of ['酸素OFF', '硬膜外麻酔抜去', 'フットポンプOFF']) {
    const c = result.find(c => c.text.endsWith(text));
    assert.ok(c);
    assert.equal(c.timestamp, '術後1日目 8:00');
  }
  const vital = result.filter(c => /125\/70|74回\/分|17回\/分|98%/.test(c.text));
  assert.equal(vital.length, 1);
  assert.match(vital[0].text, /37\.0度/);
});

test('Lab hints do not restore an unrelated nutrition tag removed by relevance filtering', () => {
  const result = cards('術後1日目\nHb 10.8g/dl');
  assert.ok(result[0].hendersonIds.includes(1));
  assert.ok(!result[0].hendersonIds.includes(2));
});
