'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const cls = src => Array.from(app.classifyTextByRules(src));
const find = (arr, re) => arr.find(c => re.test(c.text));
const SRC = [
  '産褥2日目の褥婦。経腟分娩後。',
  '「傷が痛くていきめないんです」',
  '悪露：1日目 赤色中等量 → 2日目 赤色少量',
  '乳房タイプIIa型',
  '乳頭の含ませ方が上手くできず戸惑っている',
  '児の抱き方は不安定で、おむつ交換も慣れない手つきである',
  'ミルク10ml 哺乳力良好',
  '外陰部・肛門部創部：1日目 創部痛自制内 → 2日目 創部痛なし',
].join('\n');
test('産科：概念ごとに欲求を付け直し、新生児は母親の欲求に結ばない', () => {
  const c = cls(SRC);
  const ids = re => Array.from((find(c, re) || {}).hendersonIds || ['×']);
  assert.deepEqual(ids(/いきめない/), [3]);
  assert.deepEqual(ids(/^悪露/), [3, 9]);
  assert.deepEqual(ids(/乳房タイプ/), []);
  assert.deepEqual(ids(/含ませ方/).includes(2), false);
  assert.ok(ids(/含ませ方/).includes(14));
  assert.deepEqual(ids(/おむつ交換/), [14]);
  assert.deepEqual(ids(/哺乳力/), []);
  assert.deepEqual(ids(/^外陰部/), [8]);
  assert.ok(find(c, /いきめない/).needCorrection.reason);
});
test('産科の文脈がない記録には適用しない', () => {
  const c = cls('食事は全量摂取している。ミルク10ml 哺乳力良好');
  assert.ok(!c.some(x => x.needCorrection));
});
test('妊娠中・分娩時のカードに産褥の見出しの時期を継がせず、食い違いは双方に印を付ける', () => {
  const c = cls('産褥1日目\n妊娠30週: Hb 10.2 g/dL\n妊娠17週 Hb10.2g/dlで鉄剤内服\n分娩所要時間14時間30分\n産褥の褥婦、体温36.5°C');
  const a = find(c, /^妊娠30週/);
  assert.equal(a.timestamp, '妊娠中');
  assert.ok(a.timestampOriginal);
  assert.match(a.dataConflict, /食い違う/);
  assert.equal(find(c, /^分娩所要/).timestamp, '分娩時');
});
test('産褥の日ごとの充足：日ごとの値が並ぶ行はその日の部分だけで判定する', () => {
  const items = cls('産褥2日目の褥婦。\n睡眠：1日目 あまり眠れなかった → 2日目 よく眠れた').map((x, i) => ({ ...x, id: 'c' + i, timestamp: '産褥2日目' }));
  items.push({ id: 'z', type: 'o', text: '睡眠：1日目 あまり眠れなかった → 2日目 よく眠れた', timestamp: '産褥1日目', hendersonIds: [5], assessmentCols: {} });
  const d = app.obstetricDailyFulfillment({ id: 'p', items, myAssessments: {}, carePlans: [] });
  assert.ok(d === null || typeof d === 'object');
  const rows = app.buildCardAuditTable({ items: [{ id: 'a', type: 'o', text: 'ミルク10ml 哺乳力良好', hendersonIds: [], subject: 'newborn' }] });
  assert.equal(rows[0].contributesToFulfillment, false);
});
test('家族の不安は10、入院・退院の予定や経過は9（一般条件。疾患を問わない）', () => {
  const c = cls('母親は「この先どうなるのか」と不安を話し、泣いている。\n\n約2週間の入院予定である。\n\n症状が軽快し、退院となる。');
  assert.deepEqual(Array.from(find(c, /不安を話し/).hendersonIds), [10]);
  assert.deepEqual(Array.from(find(c, /入院予定/).hendersonIds), [9]);
  assert.deepEqual(Array.from(find(c, /退院となる/).hendersonIds), [9]);
});
