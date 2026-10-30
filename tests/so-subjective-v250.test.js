const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const typeOf = t => Array.from(app.classifyTextByRules('術後2日目\n10:00\n' + t)).filter(c => c.type !== 'unnecessary').map(c => c.type);

test('S/O：引用符のない患者の希望・不快の訴えはSに分類する', () => {
  for (const t of ['早くお風呂に入りたいと話す。', '体がべたべたして気持ちが悪い', 'トイレに行きたいと希望あり', 'お風呂に入りたいとのこと', '体が気持ち悪いと訴える。'])
    assert.deepEqual(typeOf(t), ['s'], t);
});
test('S/O：看護師の観察・実施はOのまま（反例）', () => {
  for (const t of ['不安がある様子', '全身にべたつきあり。清拭を実施した。', '本人の希望により入浴介助を実施した。'])
    assert.ok(typeOf(t).every(x => x === 'o'), t);
});
