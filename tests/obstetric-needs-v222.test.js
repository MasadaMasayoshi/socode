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
