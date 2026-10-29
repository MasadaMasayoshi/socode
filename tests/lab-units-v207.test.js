const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const lab = t => app.analyzeLabCard(t, null);

test('全角・特殊文字の単位でも検査値と標準単位の値が読める', () => {
  const cases = [['白血球 173×10²/mm³', 'WBC', 17300], ['血小板 44.5×10⁴/μℓ', 'Plt', 44.5], ['CRP 5.92mg/dℓ', 'CRP', 5.92], ['GOT 28mIU/mℓ', 'AST', 28], ['LDH 416mIU/mℓ', 'LDH', 416], ['CK 120 U/ℓ', 'CK', 120], ['Hb 12.1g/㎗', 'Hb', 12.1], ['PLT 15.2万/μL', 'Plt', 15.2], ['K 4.1 mmol/ℓ', 'K', 4.1]];
  for (const [t, key, v] of cases) {
    const r = lab(t);
    assert.ok(r, t);
    assert.equal(r.kind, 'lab', t);
    assert.equal(r.key, key, t);
    assert.equal(Number(r.valueStd), v, t);
  }
});

test('単位の読み違い（桁の違う単位）は換算または保留し、そのまま誤判定しない', () => {
  const r = lab('白血球 8.2×10³/μL');
  assert.equal(Number(r.valueStd), 8200);
});

test('尿の定性所見は排泄の間接の手がかりとして拾う', () => {
  const a = app.hendersonAssociations('尿タンパク（＋）');
  assert.ok(Array.from(a).some(x => x.need === 3));
  assert.ok(Array.from(app.hendersonAssociations('LDH 416mIU/mℓ')).some(x => x.need === 2));
});
