// v.281 — 受け持ち開始の日を、書き出しの時系列（S/Oの一覧）に印として出す
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const items = [
  { id: 'a', type: 'o', timestamp: '術前', text: '術後1日目より受け持つ', hendersonIds: [] },
  { id: 'b', type: 'o', timestamp: '術後当日 21:00', text: '血圧100/70', hendersonIds: [] },
  { id: 'c', type: 'unnecessary', timestamp: '術後1日目', text: '受持ち開始', hendersonIds: [] },
  { id: 'd', type: 'o', timestamp: '術後1日目 8:00', text: '回診: 酸素OFF', hendersonIds: [] },
  { id: 'e', type: 'o', timestamp: '術後2日目 8:00', text: '歩行練習', hendersonIds: [] }
];
test('受け持ち開始の日は、その日の最初のOデータの前に一度だけ印として出る', () => {
  const out = app.buildExportPlainText({ title: 'T', items }, app.exportSelectionFromKeys(['s', 'o']));
  const lines = out.split('\n').filter(l => /受け持ち開始/.test(l));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /\[術後1日目\]/);
  const iMark = out.indexOf('受け持ち開始'), iFirst = out.indexOf('回診: 酸素OFF');
  assert.ok(iMark > -1 && iMark < iFirst);
});
test('受け持ちの記載が無い記録には印を出さない', () => {
  const out = app.buildExportPlainText({ title: 'T', items: items.filter(i => i.id === 'b' || i.id === 'd') }, app.exportSelectionFromKeys(['o']));
  assert.doesNotMatch(out, /受け持ち開始/);
});
