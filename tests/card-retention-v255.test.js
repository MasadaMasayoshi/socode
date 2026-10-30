const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const cards = s => Array.from(app.classifyTextByRules(s));
test('予定表の行は不必要にせず、予定として印を付ける', () => {
  const c = cards('リハビリテーションスケジュール\n時期\tリハビリ内容\n術後1日目\t介助で車椅子\n術後2日目\t起立訓練\n術後1日目\n10:00\n介助で車椅子を使用した。');
  const row = c.find(x => x.text === '介助で車椅子');
  assert.equal(row.type, 'o'); assert.equal(row.planned, true);
  assert.ok(!c.find(x => /使用した/.test(x.text)).planned, '実施の記録は予定にしない');
});
test('表の中の判読困難はデータ品質として保持される', () => {
  const c = cards('術後3日目\t記載内容判読困難\n術後4日目\t記載内容判読困難');
  assert.ok(c.every(x => x.type !== 'unnecessary'));
  assert.equal(app.proposeCardDestination('記載内容判読困難').key, 'dataquality');
});
test('章見出しは構造情報として保持先が示される', () => {
  assert.equal(app.proposeCardDestination('5.手術当日(6月10日)').key, 'structure');
  assert.equal(app.proposeCardDestination('6.術後1日目(6月11日)').key, 'structure');
});
test('臨床の文は構造情報・出来事に振り分けない（反例）', () => {
  for (const t of ['皮膚トラブル見られず', '創部痛あり', '2.5L 酸素投与']) assert.ok(!['structure'].includes((app.proposeCardDestination(t) || {}).key), t);
});
