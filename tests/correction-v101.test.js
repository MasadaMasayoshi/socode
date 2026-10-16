const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();
const cards = t => Array.from(app.classifyTextByRules(t));
const by = (list, s) => list.find(c => c.text.includes(s));
const cpOf = (items, src) => ({ id: 'p', title: 'T', sourceText: src || '', items, myAssessments: {}, carePlans: {}, missingChecks: {} });
const it = (id, text, ts, ids) => ({ id, type: 'o', text, timestamp: ts, hendersonIds: ids, assessmentCols: Object.fromEntries(ids.map(x => [x, /入院前/.test(ts) ? 'preadmission' : 'postadmission'])) });

test('structure lines (worksheet instruction, table caption, header words, generic statements) are unnecessary; counterexamples are kept', () => {
  const typeOf = s => (cards('入院2日目\n' + s)[0] || { type: 'none' }).type;
  ['※以下の内容をグループワークにて完成する。', '3. ~~関連図を作成する。~~', '表2 経過', '入院から退院までの経過を表2に示す。', '月日 医療者による説明など 家族の言動', '手術を受ける患者さんもおおぜいいます。'].forEach(s => assert.strictEqual(typeOf(s), 'unnecessary', s));
  ['体重が3kg減少した。', '看護計画を立案し、実施した。', '患者さんは「おおぜいの前で話すのは苦手」と話す。'].forEach(s => assert.notStrictEqual(typeOf(s), 'unnecessary', s));
});

test('a wrapped-line fragment contained in another line is unnecessary; a distinct short line is kept', () => {
  const src = '8月3日\n風邪などの一般的な病気を想像\n風邪などの一般的な病気を想像していた家族は動揺していた。\n8月4日\n歩行器で歩行できる。';
  const list = cards(src);
  const frag = list.find(c => c.text === '風邪などの一般的な病気を想像');
  assert.ok(!frag || frag.type === 'unnecessary');
  assert.notStrictEqual((by(list, '歩行器で歩行できる') || {}).type, 'unnecessary');
});

test('generic cue words tag communication/study/school role', () => {
  const t = s => Array.from((cards('入院2日目\n' + s)[0] || { hendersonIds: [] }).hendersonIds);
  assert.ok(t('母親は涙ぐみながら説明を聞いていた。').includes(10));
  assert.ok(t('普段は学校生活に大きな制限はない。').includes(12));
});

test('age-stamped history and "no notable history" lines are basic info, not untagged', () => {
  const mk = text => ({ type: 'o', text, hendersonIds: [], timestamp: '入院前' });
  assert.ok(app.isBasicInfoItem(mk('5歳時に骨折で入院。')));
  assert.ok(app.isBasicInfoItem(mk('その他、特記すべき入院・治療歴なし。')));
  assert.ok(!app.isBasicInfoItem(mk('最近、夜に何度も目が覚める。')));
});

test('a diagnosis name alone, preference, wish, question and age-stamped event give no verdict', () => {
  const g = (text, n) => app.getSufficiency(cpOf([it('a', text, '入院2日目', [n])]), n, 'post');
  assert.notStrictEqual(g('魚が苦手', 2), 'unmet');
  assert.notStrictEqual(g('試合に出たい', 4), 'unmet');
  assert.notStrictEqual(g('早く退院できないか', 4), 'unmet');
  assert.notStrictEqual(g('8歳時に転倒し骨折', 4), 'unmet');
  assert.strictEqual(g('食事摂取量が半分のみ', 2), 'unmet');
  assert.strictEqual(g('現在も歩行できず介助が必要', 4), 'unmet');
  assert.ok(!['met', 'unmet', 'conflict'].includes(g('1型糖尿病で入院。', 3)));
});

test('respiratory and hygiene met need their own findings; pulse/BP/consciousness alone do not', () => {
  const g = (items, n) => app.getSufficiency(cpOf(items), n, 'post');
  assert.notStrictEqual(g([it('a', '意識清明。脈拍72回、血圧110/70。', '入院2日目', [1])], 1), 'met');
  assert.notStrictEqual(g([it('a', '意識清明。', '入院2日目', [8])], 8), 'met');
  assert.strictEqual(g([it('a', 'SpO2 98% 呼吸音清明', '入院2日目', [1])], 1), 'met');
});

test('knowledge checks: age-stamped fall history does not trigger the fall row; drug OP stays in its phase', () => {
  const cp = cpOf([it('a', '7歳時に転倒して骨折。', '入院前', [4, 9])]);
  const labels = [1, 10].map(n => Array.from(app.sufficiencyKnowledgeChecks(cp, n)).map(c => c.label));
  assert.deepStrictEqual(labels, [[], []]);
  const cp2 = cpOf([it('d', 'グルカゴンを使用する。', '入院3日目', [2])]);
  assert.strictEqual(Array.from(app.drugObservationPoints(cp2, 2, 'pre')).length, 0);
});

test('genogram: side-qualified relatives, generic child words, generic siblings, staff job and nearby disease', () => {
  const g = s => app.ggExtract({ sourceText: s, items: [] });
  const ids = s => g(s).persons.map(p => p.id);
  assert.ok(!ids('母方の祖父母は遠方に住む。').includes('mother'));
  assert.ok(!ids('母方の祖父母は遠方に住む。').includes('gfather'));
  assert.ok(!ids('子どものあいさつにはしつけが厳しい。').includes('child'));
  assert.ok(ids('子ども2人がいる。').some(i => /^child/.test(i)));
  const p = g('兄（15歳）、きょうだいの世話は祖母が行う。').persons;
  assert.ok(p.some(x => x.id === 'brotherO') && !p.some(x => x.id === 'sibling'));
  const m = g('母親は糖尿病教室に参加し、看護師から説明を受けた。').persons.find(x => x.id === 'mother');
  assert.ok(m && m.occupation === '' && !m.notes.includes('糖尿病'));
  assert.ok(g('母親は糖尿病で通院中。').persons.find(x => x.id === 'mother').notes.includes('糖尿病'));
  assert.strictEqual(g('母親は看護師として働く。').persons.find(x => x.id === 'mother').occupation, '看護師');
  const idx = g('患者:Aさん（14歳、女児）\n父親（40歳）').persons.find(x => x.index);
  assert.strictEqual(idx.sex, 'f');
});

test('source-candidate lines skip profile/diagnosis lines and do not read 尿 in 糖尿病 as excretion', () => {
  const src = '患者プロフィール ＜糖尿病＞\n診断名：糖尿病\n入院後は毎日血糖測定を行い、食事は全量摂取している。';
  const cp = cpOf([it('a', '食事は全量摂取している。', '入院2日目', [2])], src);
  const text = Array.from(app.sufficiencySourceCandidates(cp).byKey.values()).flat().map(x => JSON.stringify(x)).join('');
  assert.ok(!/プロフィール|診断名/.test(text));
});
