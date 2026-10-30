const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const cards = t => Array.from(app.classifyTextByRules(t)).filter(c => c.type !== 'unnecessary');
test('氏名・年齢・性別は表題の行でも表の行でも1枚にまとまる', () => {
  const c = cards('A氏・76歳女性／右大腿骨頸部骨折\n事例紹介\n項目\t内容\n氏名\tA氏\n年齢・性別\t76歳 女性\n血液型\tA Rh+');
  const id = c.filter(x => /氏名：A氏/.test(x.text));
  assert.equal(id.length, 1);
  assert.match(id[0].text, /年齢：76歳.*性別：女性/);
  assert.equal(c.filter(x => /^(?:A氏|性別|年齢)/.test(x.text)).length, 0);
});
test('氏名だけ・無関係なカードはまとめない（反例）', () => {
  const c = cards('A氏\n血液型\tA Rh+');
  assert.ok(c.some(x => /血液型/.test(x.text)));
  assert.ok(!c.some(x => /氏名：/.test(x.text)));
});
test('保険は環境（9）：健康保険も介護保険も', () => {
  for (const t of ['保険\t国民健康保険', '介護保険\t申請していない']) assert.equal(cards('入院情報\n項目\t内容\n' + t).find(x => /保険/.test(x.text)).hendersonIds.join(), "9", t);
});
