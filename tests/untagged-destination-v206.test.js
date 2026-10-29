const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const why = t => app.inferUntaggedReason({ text: t, type: 'o' }, { items: [] });

test('感情・苦痛の表出は10.コミュニケーションの根拠になる（眼の流涙は対象外）', () => {
  assert.ok(Array.from(app.detectMultipleHendersonTags('患児は不機嫌に泣いている。')).includes(10));
  assert.ok(Array.from(app.detectMultipleHendersonTags('ぐずって啼泣が続く')).includes(10));
  assert.ok(!Array.from(app.detectMultipleHendersonTags('流涙あり、結膜充血')).includes(10));
});

test('タグが付かないカードは、未設定のまま放置せず間接関連か保持先を示す', () => {
  for (const t of ['白血球 173×10^2/mm3', '4輸液、鎮静剤、解熱剤の投与', '軽快し、退院となる。', 'GOT 28mIU/ml', '5約2週間の入院予定']) {
    const r = why(t);
    assert.notEqual(r.kind, 'unset', t);
    assert.ok(r.reason && !/理由を特定できない/.test(r.reason), t);
  }
  assert.equal(why('軽快し、退院となる。').kind, 'none');
  assert.deepEqual(Array.from(why('白血球 173×10^2/mm3').candidates), [7]);
});
