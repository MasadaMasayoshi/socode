const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();

test('重点アセスメント：欲求ごとにS・Oが入院前／入院後で並び、番号が付く', () => {
  const SRC = '入院前は自立していた。\n「痛くてたまらない」\n術後2日目 創部痛NRS5。看護師の見守りで車いすに移乗した。';
  const items = Array.from(app.classifyTextByRules(SRC)).map((c, i) => ({ ...c, id: 'c' + i }));
  const cp = { id: 'p', items, myAssessments: {} };
  const need = [4, 11, 5, 3, 1].find(n => items.some(i => (i.hendersonIds || []).includes(n))) || 4;
  const data = app.focusItemsByColumn(cp, need);
  const all = [...data.cols.preadmission, ...data.cols.postadmission, ...data.cols.unclassified];
  assert.ok(all.length > 0, '分類済みのカードが拾われる');
  const html = app.focusCellHtml(need, all[0].type, data);
  assert.match(html, /(S|O)-1/);
  assert.equal(app.FOCUS_FIELDS.map(f => f.label).join('|'), ['情報の分析・解釈', '統合', '看護問題の明確化'].join('|'));
});
