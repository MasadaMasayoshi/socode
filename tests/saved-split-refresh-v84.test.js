const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();
// Generic list-style record: a symptom-list section with a category heading, as in disease descriptions.
const SRC = '全身症状\n発熱、倦怠感、\n疲れやすい、\n体重減少など\n\n神経\nけいれん、頭痛、不安感、\n抑うつ状態など';
const base = (text, extra = {}) => ({ id: 'c_' + text, text, timestamp: '日時不明', type: 'unclassified', hendersonIds: [], assessmentCols: {}, predictionSource: 'confirmed', ...extra });
const rejected = { editLog: [{ at: '2026-10-14T09:12:00Z', kind: 'type', actor: 'user', from: 'unnecessary', to: 'unclassified' }] };
const oldExclusion = text => base(text, { type: 'unnecessary', predictionSource: 'rule', ruleDecision: { ruleId: 'source.generic-symptom-list', reason: 'old', version: 'v.54' } });

test('a category heading before list lines is a heading; the list items stay separate findings', () => {
  const cards = Array.from(app.classifyTextByRules(SRC));
  const by = t => cards.find(c => c.text === t);
  assert.strictEqual(by('神経').type, 'unnecessary');
  assert.strictEqual(by('全身症状').type, 'unnecessary');
  ['けいれん', '頭痛', '不安感', '抑うつ状態', '発熱'].forEach(t => assert.ok(by(t) && by(t).type === 'o' && by(t).diseaseGeneral, t));
  // Counterexample: a symptom name on its own line is not a heading.
  const sym = Array.from(app.classifyTextByRules('全身症状\n発熱、倦怠感、\n疲れやすい、\n体重減少など\n\n脱毛\n光線過敏症'));
  assert.ok(sym.find(c => c.text === '脱毛').type === 'o');
});

test('an old saved card holding a whole list line is matched to the fresh per-item cards', () => {
  const fresh = Array.from(app.classifyTextByRules(SRC));
  const one = app.currentRuleCardForSavedItem(fresh, base('発熱、倦怠感'));
  assert.ok(one && one._sourceMatchKind === 'split-line');
  ['発熱', '倦怠感'].forEach(t => assert.ok(one._counterparts.includes(t)));
  assert.ok([7, 4, 5].every(h => one.hendersonIds.includes(h)));
  assert.strictEqual(app.currentRuleCardForSavedItem(fresh, base('発熱、見知らぬ語')), null);
  const single = app.currentRuleCardForSavedItem(fresh, base('体重減少など'));
  assert.ok(single && single.hendersonIds.includes(2));
});

test('manual 不必要→未分類 line cards get the union of latest tags; id, text and history stay', () => {
  const item = base('けいれん、頭痛、不安感', rejected);
  const cp = { id: 'p', sourceText: SRC, items: [item, base('頭痛', { ...rejected, tagNotNeeded: true })] };
  app.refreshSavedUntaggedCards(cp, SRC);
  assert.strictEqual(item.id, 'c_けいれん、頭痛、不安感');
  assert.strictEqual(item.text, 'けいれん、頭痛、不安感');
  assert.ok([9, 10, 5].every(h => item.hendersonIds.includes(h)));
  assert.strictEqual(item.type, 'o');
  assert.strictEqual(item.editLog.length, 1);
  assert.strictEqual(cp.items[1].hendersonIds.length, 0, 'タグ不要の指定は変えない');
});

test('cards the app excluded under an older rule are refreshed; manually decided exclusions are not', () => {
  const auto = oldExclusion('発熱、倦怠感');
  const manual = oldExclusion('疲れやすい'); manual.editLog = [{ at: 'x', kind: 'type', actor: 'user', from: 'o', to: 'unnecessary' }];
  const heading = base('神経', { type: 'unnecessary', predictionSource: 'rule', ruleDecision: { ruleId: 'source.structure', reason: 'h', version: 'v.54' } });
  const cp = { id: 'p', sourceText: SRC, items: [auto, manual, heading] };
  app.refreshSavedUntaggedCards(cp, SRC);
  assert.strictEqual(auto.type, 'o'); assert.strictEqual(auto.diseaseGeneral, true); assert.ok(auto.hendersonIds.length >= 3);
  assert.strictEqual(auto.id, 'c_発熱、倦怠感');
  assert.strictEqual(manual.type, 'unnecessary');
  assert.strictEqual(heading.type, 'unnecessary');
});

test('append classification does not duplicate items already held by a saved line card', () => {
  const items = [base('けいれん、頭痛、不安感')];
  assert.strictEqual(app.coveredBySavedWholeLine(items, '頭痛', '日時不明'), true);
  assert.strictEqual(app.coveredBySavedWholeLine(items, '発熱', '日時不明'), false);
  assert.strictEqual(app.coveredBySavedWholeLine(items, '頭痛', '10/14 09:00') , true, '日時不明の保存カードは日時を問わず照合');
});

test('splitting a merged card keeps only tags each piece supports (or the user added)', () => {
  const card = base('Bさん30歳、女性、会社員(事務職)', { hendersonIds: [9, 12], assessmentCols: { 9: 'preadmission', 12: 'preadmission' }, editLog: [{ at: 'x', kind: 'merge', actor: 'user', from: ['a', 'b'] }] });
  const cp = { id: 'p', items: [card] };
  const parts = app.splitCardIntoParts(cp, card.id, ['Bさん30歳、女性', '会社員(事務職)']);
  assert.strictEqual(parts[0].hendersonIds.length, 0, '氏名・年齢・性別だけの片にタグを残さない');
  assert.deepStrictEqual(Array.from(parts[1].hendersonIds), [12]);
  const manualTag = base('Bさん30歳、女性、会社員(事務職)', { id: 'm', hendersonIds: [9], assessmentCols: { 9: 'unclassified' }, editLog: [{ at: 'x', kind: 'tagAdd', actor: 'user', hId: 9 }] });
  const cp2 = { id: 'p2', items: [manualTag] };
  const p2 = app.splitCardIntoParts(cp2, 'm', ['Bさん30歳、女性', '会社員(事務職)']);
  assert.deepStrictEqual(Array.from(p2[0].hendersonIds), [9], '利用者が手で付けたタグは残す');
});
