const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const key = t => (app.proposeCardDestination(t) || {}).key;
test('事務的記載は「不要な情報」の候補になる', () => {
  for (const t of ['科目：看護過程と展開', '担当：越智', '術後1日目より受け持つ', '以下省略']) assert.equal(key(t), 'unnecessary', t);
});
test('基本情報・臨床事実は不要へ振り分けない（反例）', () => {
  for (const t of ['A氏', '日付：R8年6月26日', '皮膚トラブル見られず', '担当看護師と相談し、明日膀胱留置カテーテル抜去予定となる', '「痛みのため眠れない」']) assert.notEqual(key(t), 'unnecessary', t);
});
