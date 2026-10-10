'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const corpus = require('./fixtures/public-contracts/v1.json');
const {loadApp} = require('./app-helpers');
const app = loadApp();
function checkCards(cards, checks) {
  for (const spec of checks) {
    const matches = cards.filter(c => c.type !== 'unnecessary' && c.text.includes(spec.contains));
    assert.equal(matches.length, 1, `原文の対象が一意に残る: ${spec.contains}`);
    const card = matches[0];
    assert.equal(card.type, spec.type, spec.contains);
    if (spec.timestamp) assert.equal(card.timestamp, spec.timestamp, spec.contains);
    for (const tag of spec.includeTags || []) assert.ok(card.hendersonIds.includes(tag), `${spec.contains}: 欲求${tag}が必要`);
    for (const tag of spec.excludeTags || []) assert.ok(!card.hendersonIds.includes(tag), `${spec.contains}: 欲求${tag}を推測で付けない`);
  }
}
test('公開契約データは7領域・重複なし・全て手記述の検証条件を持つ', () => {
  assert.equal(corpus.schemaVersion, 1);
  assert.equal(corpus.cases.length, 7);
  assert.equal(new Set(corpus.cases.map(c=>c.id)).size, 7);
  for (const c of corpus.cases) {
    assert.ok(c.input.trim());
    assert.ok(c.checks.length >= 2);
    for (const s of c.checks) assert.ok(c.input.includes(s.contains));
  }
});
for (const c of corpus.cases) {
  for (const [format, input] of [['LF',c.input],['CRLF',c.input.replace(/\n/g,'\r\n')]]) {
    test(`公開契約 ${c.id} (${format}): S/O・意味・日時・本文の保存`, () => {
      checkCards(Array.from(app.classifyTextByRules(input)), c.checks);
    });
  }
}
test('検証器は情報欠落・誤分類・不要タグ・時点混同を失敗にする', () => {
  const spec = corpus.cases[0].checks[0];
  const card = {text:spec.contains,type:'s',timestamp:spec.timestamp,hendersonIds:[1]};
  checkCards([card],[spec]);
  for (const cards of [[],[{...card,type:'o'}],[{...card,hendersonIds:[]}],[{...card,hendersonIds:[1,10]}],[{...card,timestamp:'入院2日目 9:00'}],[card,card]]) {
    assert.throws(()=>checkCards(cards,[spec]), assert.AssertionError);
  }
});
test('検査値と叙述中の値を区別し、別日の同時刻を保持する', () => {
  const input = '入院1日目\n9:00\nSpO2 97%(RA)\n入院2日目\n9:00\nSpO2 98%(RA)\n酸素2L鼻カニューレ開始し、SpO2 94%に上昇。';
  const cards = Array.from(app.classifyTextByRules(input)).map((c,i)=>({...c,id:`public-${i}`}));
  const table = app.buildLabTrendTable(cards);
  const row = table.rows.find(r=>r.key==='SpO2');
  assert.deepEqual(Array.from(row.cells['入院1日目 9:00'],c=>c.value),['97']);
  assert.deepEqual(Array.from(row.cells['入院2日目 9:00'],c=>c.value),['98']);
  assert.ok(!Object.values(row.cells).flat().some(c=>c.value==='94'));
});
test('入院前と入院後のアセスメント欄を混ぜない', () => {
  assert.equal(app.inferAssessmentColumn('現病歴','入院前',null),'preadmission');
  assert.equal(app.inferAssessmentColumn(null,'術後1日目 12:00',null),'postadmission');
});
