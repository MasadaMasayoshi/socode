const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();

test('タグを付けないカードにも、画面用の置き場（保持先・間接関連）が出る', () => {
  for (const t of ['軽快し、退院となる。', '4輸液、鎮静剤、解熱剤の投与', '白血球 173×10^2/mm3', 'GOT 28mIU/ml']) {
    const p = app.cardPlacementOf({ text: t });
    assert.ok(p && p.label && p.title, t);
  }
  assert.equal(app.cardPlacementOf({ text: '' }), null);
});

test('薬の辞書: 抗菌薬の商品名と免疫グロブリンの商品名を拾い、未登録薬剤候補に残さない', () => {
  const t = '抗生剤（ホスミシン600mg）\nγ-グロブリンの大量投与（ベニロン7.5g×4日）';
  const names = Array.from(app.findDrugsInText(t)).map(x => x.term);
  assert.ok(names.includes('ホスミシン') && names.includes('ベニロン'));
  const items = t.split('\n').map((x, k) => ({ id: 'i' + k, type: 'o', text: x }));
  assert.equal(Array.from(app.drugUnknownCandidates(items)).length, 0);
});
