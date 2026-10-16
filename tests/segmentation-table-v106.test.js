const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();
const cls = src => Array.from(app.classifyTextByRules(src));
const ids = c => Array.from(c.hendersonIds || []);

test('wrapped fragment contained in a longer line is dropped as a wrapped duplicate; the full line stays', () => {
  const cards = cls('8月3日 診断時は成人型の糖尿病と混乱していたが、情報を集めて理解するように努めていた。\n8月5日 食事は全量摂取。\n8月3日 断時は成人型の\n');
  const frag = cards.find(c => c.text === '断時は成人型の');
  assert.ok(frag && frag.type === 'unnecessary' && frag.ruleDecision.ruleId === 'source.wrapped-duplicate' && /折り返し/.test(frag.ruleDecision.reason));
  assert.ok(Number.isInteger(frag.srcStart) && frag.srcEnd > frag.srcStart, 'source offsets are kept');
  assert.ok(cards.some(c => c.type === 'o' && /^診断時は成人型の糖尿病と混乱していた/.test(c.text)), 'the full line is never deleted');
});

test('a fragment that is not contained anywhere becomes an unclassified broken-source card; complete short lines are untouched', () => {
  const cards = cls('8月3日 診断時は成人型の糖尿病と混乱していた。\n8月3日 手術後に創部の状態は\n8月4日 食事は全量摂取。\n8月4日 排便あり。\n');
  const broken = cards.find(c => /手術後に創部の状態は/.test(c.text));
  assert.ok(broken && broken.ruleDecision.ruleId !== 'source.wrapped-duplicate');
  ['食事は全量摂取。', '排便あり。'].forEach(t => { const c = cards.find(x => x.text === t); assert.ok(c && c.type !== 'unnecessary', t); });
});

test('broken table rows are re-joined cell by cell; no pipes remain; column meaning decides S/O', () => {
  const T = '| 月日 | 医療者による説明 | 家族の言動 | 本人の言動 |\n| --- | --- | --- | --- |\n| 7月28日 | 看護師が採血の手順を説明す | | 「早く帰りたい」 |\nる。 | | |\n| 7月29日 | | 母親は「大丈夫」と話し、メモをとっている。 | |\n';
  const norm = app.normalizeBrokenTableRows(T).text;
  assert.ok(/7月28日 看護師が採血の手順を説明する。/.test(norm));
  const cards = cls(T);
  const staff = cards.find(c => /採血の手順を説明する。/.test(c.text));
  assert.ok(staff && staff.type === 'o' && !/\|/.test(staff.text));
  assert.strictEqual(cards.find(c => c.text === '「早く帰りたい」').type, 's');
  assert.strictEqual(cards.find(c => /^母親は「大丈夫」/.test(c.text)).type, 'o');
  assert.ok(!cards.some(c => c.type !== 'unnecessary' && /\|/.test(c.text)));
  const intact = '| 月日 | 内容 | 備考 |\n| --- | --- | --- |\n| 7月28日 | 食事は全量摂取。 | 良好 |\n';
  assert.strictEqual(app.normalizeBrokenTableRows(intact).text, intact, 'a complete table is left untouched');
});

test('diagnosis label needs an explicit label; a word that merely starts with the label word is not a label', () => {
  const cards = cls('●診断名：喘息\n診断時は成人型と混乱していた。\n診断書を渡される。');
  assert.deepStrictEqual(cards.filter(c => c.fieldLabel === '診断名').map(c => c.text), ['喘息']);
});

test('past-history events by age are all labelled history facts; an orthodontic item is not a hygiene finding', () => {
  const cards = cls('●既往歴：1歳時に中耳炎で入院。5歳時に転倒し骨折。14歳より歯列矯正のためブラケット装着。');
  assert.strictEqual(cards.filter(c => c.fieldLabel === '既往歴').length, 3);
  const ortho = cards.find(c => /歯列矯正/.test(c.text));
  assert.ok(ortho && !ids(ortho).includes(8));
  const care = cls('●既往歴：高血圧。\n8月3日 歯みがきは介助が必要。').find(c => /歯みがき/.test(c.text));
  assert.ok(care && ids(care).includes(8), 'real oral-care wording keeps the tag');
});

test('background factors: a paragraph is split by meaning without mid-word cuts', () => {
  const src = '生活の様子:自営業のため、早朝から深夜まで両親は忙しく働いている。幼いころから主として祖母が、きょうだいの世話をしている。中学校は自転車で20分かけて通学している。';
  const cards = cls(src);
  const cp = { id: 'p', title: 'T', sourceText: src, items: cards.map((c, i) => ({ id: 'i' + i, type: c.type, text: c.text, timestamp: '入院前', fieldLabel: c.fieldLabel, hendersonIds: ids(c) })) };
  const t = app.backgroundFactorsText(cp);
  assert.ok(/生活歴（職業）/.test(t) && /生活歴（世話の担い手）/.test(t) && /生活歴（学校生活・通学）/.test(t));
  assert.ok(/通学している。/.test(t), 'the last sentence is complete');
});

test('drug layer: a particle kana in front of a known word is not an unregistered candidate; insulin types are listed', () => {
  assert.deepStrictEqual(Array.from(app.drugUnknownCandidates('へグルカゴン注射、トインスリン注射、ヤインスリン注射')), []);
  assert.ok(Array.from(app.drugUnknownCandidates('ケルナビクス錠')).includes('ケルナビクス'), 'a genuine unregistered name is still listed');
  ['超速効型インスリン', '速効型インスリン', '持効型インスリン', '持続型インスリン'].forEach(w => assert.ok(app.drugsOfText(w).length >= 1, w));
});

test('genogram: a relative that appears only inside a quotation is not a family member', () => {
  const src = '●患者：Aさん（10歳、女児）\n●家族構成：両親と本人の3人暮らし。\n8月1日：「お兄ちゃんがびっくりするかな」と話す。\n';
  const cards = cls(src);
  const cp = { id: 'p', title: 'T', sourceText: src, items: cards.map((c, i) => ({ id: 'i' + i, type: c.type, text: c.text, timestamp: c.timestamp, hendersonIds: ids(c) })) };
  assert.ok(!app.ggExtract(cp).persons.some(p => p.role === '兄'));
  const src2 = src.replace('両親と本人の3人暮らし。', '両親、兄（15歳）の4人暮らし。');
  const cp2 = Object.assign({}, cp, { sourceText: src2 });
  assert.ok(app.ggExtract(cp2).persons.some(p => p.role === '兄'));
});

test('sufficiency: a bare symptom word or an explanation sentence gives no verdict; a numeric respiration rate is read', () => {
  const mk = lines => { const src = lines.join('\n'); const cards = cls(src); return { id: 'p', title: 'T', sourceText: src, items: cards.map((c, i) => ({ id: 'i' + i, type: c.type, text: c.text, timestamp: c.timestamp, fieldLabel: c.fieldLabel, hendersonIds: ids(c), assessmentCols: Object.fromEntries(ids(c).map(h => [h, 'postadmission'])) })), myAssessments: {}, carePlans: {}, missingChecks: {} }; };
  const bare = app.ruleSufficiencyFor(mk(['8月3日 低血糖に注意して過ごす。']), 9, 'postadmission')[9];
  assert.ok(!bare.post || bare.post.verdict === 'unknown' || !bare.post.verdict);
  const rr = app.ruleSufficiencyFor(mk(['8月3日 呼吸25/分。']), 1, 'postadmission')[1];
  assert.ok(rr.post && rr.post.verdict && rr.post.verdict !== 'unknown');
});

test('edit history: two changes from 不必要 to 未分類 are surfaced as evidence in the request', () => {
  const mkItem = n => ({ id: 'a', type: 'unclassified', text: '食事は全量摂取。', timestamp: '8月3日', hendersonIds: [], editLog: Array.from({ length: n }, () => ({ kind: 'type', from: 'unnecessary', to: 'unclassified', at: 1 })) });
  const text = n => app.buildCardsReportText ? app.buildCardsReportText({ id: 'p', title: 'T', sourceText: '', items: [mkItem(n)] }, [mkItem(n)], '', 'H', false) : '';
  const two = text(2), one = text(1);
  assert.ok(/不必要 → 未分類」へ2回/.test(two), 'twice is evidence');
  assert.ok(!/不必要 → 未分類」へ/.test(one), 'once is not');
});
