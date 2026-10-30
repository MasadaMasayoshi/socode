const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const tags = t => Array.from(app.detectMultipleHendersonTags(t));
test('疼痛：影響を受けている機能の欲求へ振り分ける（利用者の指定と一般的な読み方）', () => {
  assert.ok(tags('痛みのため昨晩は眠れなかった').includes(5));
  assert.ok(tags('痛みでトイレまで動けない').includes(4));
  assert.ok(tags('創部痛のため深呼吸ができない').includes(1));
  assert.ok(tags('痛くていきめない').includes(3));
  assert.ok(tags('痛みが怖くて動けない').includes(10));
  assert.ok(tags('ペインスケール5であるが、鎮痛剤希望なし').includes(10));
  assert.ok(tags('痛み止めって我慢できなくなってから使うものでしょう?').includes(14));
  assert.ok(tags('痛みのためふらつきあり').includes(9));
});
test('疼痛：反例として、痛みがない文・痛みのない我慢強さには付けない', () => {
  assert.ok(!tags('痛みはなく、よく眠れた').includes(10));
  assert.deepEqual(tags('我慢強く、しっかり者').filter(x => x === 10), []);
  assert.ok(!tags('昨夜は痛みもひどくなく、眠れた').includes(10));
  assert.ok(!tags('トイレに行きたい').includes(10));
});
