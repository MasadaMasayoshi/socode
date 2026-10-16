const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();
const tags = t => Array.from(app.detectMultipleHendersonTags(t));
const cardsOf = t => Array.from(app.classifyTextByRules(t));
const item = (id, text, extra) => Object.assign({ id, type: 'o', text, timestamp: '入院3日目', hendersonIds: [8], assessmentCols: { 8: 'postadmission' } }, extra || {});
const cpOf = (items, extra) => Object.assign({ id: 'p', title: 'T', sourceText: items.map(i => i.text).join('\n'), items, myAssessments: {}, carePlans: {}, missingChecks: {} }, extra || {});

test('1: visit/medication non-adherence is 14; counterexamples are not', () => {
  assert.ok(tags('数か月前から通院を自己中断し、内服も不規則だった').includes(14));
  assert.ok(tags('服薬のアドヒアランス不良がある').includes(14));
  assert.ok(!tags('内服は規則的で、通院も中断なし').includes(14));
});

test('2: several labs in one sentence are valid labs; admission reason with a lab is 2 (+14 for 教育入院)', () => {
  const r = app.analyzeLabCard('血糖 412mg/dL、HbA1c 11.2%で教育入院となる。', null);
  assert.strictEqual(r.quality, 'valid');
  const t = tags('血糖 412mg/dL、HbA1c 11.2%で教育入院となる。');
  assert.ok(t.includes(2) && t.includes(14));
  assert.ok(!tags('検査で異常を指摘された。外来で経過をみる。').includes(2));
  assert.strictEqual(app.analyzeLabCard('CRP 3.1mg/dL', null).quality, 'valid');
});

test('3: a date/day header line never joins the previous record', () => {
  ['＜10/5 入院3日目＞', '【10/5 入院3日目】', '10/5 入院3日目', '＜10月5日＞'].forEach(h => {
    const out = cardsOf(`喫煙は20本/日を30年。\n${h}\n7:00 体温36.5℃ 血圧138/84mmHg`).map(c => c.text);
    assert.ok(out.every(x => !/入院3日目|10\/5|10月5日/.test(x)), `${h}: ${out.join('|')}`);
    assert.ok(out.some(x => x.includes('36.5')));
  });
  // counterexample: a sentence that merely starts with a date stays a sentence
  assert.ok(cardsOf('10/5に退院を予定している。').some(c => c.text.includes('退院')));
});

test('4a: a skin lesion finding is never 充足 for 清潔; a negated finding is allowed', () => {
  const lesion = cpOf([item('a', '右足底に潰瘍あり、周囲に発赤と熱感がある。シャワー浴を実施した')]);
  assert.notStrictEqual(app.ruleSufficiencyFor(lesion)[8].post.verdict, 'met');
  assert.strictEqual(app.ruleSufficiencyFor(lesion)[8].post.verdict, 'unmet');
  const clean = cpOf([item('a', '創部の発赤なし。シャワー浴を実施した')]);
  assert.notStrictEqual(app.ruleSufficiencyFor(clean)[8].post.verdict, 'unmet');
});

test('4b: self-care practice errors / reluctance are 未充足 evidence for 14; success is not', () => {
  const mk = text => cpOf([item('a', text, { hendersonIds: [14], assessmentCols: { 14: 'postadmission' } })]);
  assert.strictEqual(app.ruleSufficiencyFor(mk('インスリン自己注射の手技練習で、単位の合わせ方を2回間違える'))[14].post.verdict, 'unmet');
  assert.strictEqual(app.ruleSufficiencyFor(mk('足の観察の説明に「面倒」と話す'))[14].post.verdict, 'unmet');
  assert.notStrictEqual(app.ruleSufficiencyFor(mk('自己注射の手技を問題なく実施できた'))[14].post.verdict, 'unmet');
});

test('4c: a treatment/order card alone does not make other needs 未充足', () => {
  const order = cpOf([item('a', '治療：足への荷重制限（免荷）、糖尿病食1800kcal/日の指示', { timestamp: '入院前', fieldLabel: '', hendersonIds: [2, 4, 9], assessmentCols: { 2: 'preadmission', 4: 'preadmission', 9: 'preadmission' } })]);
  const r = app.ruleSufficiencyFor(order);
  [2, 4, 9].forEach(n => assert.notStrictEqual(r[n].pre.verdict, 'unmet', `need ${n}`));
  // counterexample: a stated problem on a non-order card still counts
  const prob = cpOf([item('b', '歩行時にふらつきがあり、転倒しそうになる', { timestamp: '入院前', hendersonIds: [4], assessmentCols: { 4: 'preadmission' } })]);
  assert.strictEqual(app.ruleSufficiencyFor(prob)[4].pre.verdict, 'unmet');
});

test('5: lost manual edits are listed only when they belong to the current source', () => {
  const cp = { droppedManualEdits: [
    { text: '術後の創部痛が強く、鎮痛薬を使用した', timestamp: '術後1日目' },
    { text: '半年前から通院を自己中断し内服も不規則だった', timestamp: '入院前' }] };
  const out = Array.from(app.droppedEditsForCase(cp, '半年前から通院を自己中断し、内服も不規則だった。血糖412mg/dL'));
  assert.strictEqual(out.length, 1);
  assert.ok(out[0].text.includes('通院'));
  const none = Array.from(app.droppedEditsForCase(cp, '妻と二人暮らし。営業職。'));
  assert.strictEqual(none.length, 0);
  const text = app.buildReviewRequestText(Object.assign({ id: 'q', title: 'T', items: [], carePlans: {}, myAssessments: {} }, cp), '妻と二人暮らし。営業職で外回りが多い。');
  assert.ok(!text.includes('引き継げなかった手動修正'));
});

test('6: background factors without a field label are named and listed', () => {
  const mk = (text, extra) => Object.assign({ id: text, type: 'o', text, timestamp: '入院前', hendersonIds: [], assessmentCols: {} }, extra || {});
  const cp = cpOf([mk('営業職で外回りが多い。'), mk('飲酒は週3回。'), mk('喫煙は20本/日を30年。運動習慣はない。'), mk('右足底に潰瘍あり', { timestamp: '入院3日目' }), mk('今日は37.0℃')]);
  const t = app.backgroundFactorsText(cp);
  ['職業', '飲酒', '喫煙', '運動'].forEach(w => assert.ok(t.includes(w), w));
  assert.ok(!t.includes('潰瘍') && !t.includes('37.0'));
  assert.ok(tags('営業職で外回りが多い。').includes(12));
});

test('notebook revision advanced', () => {
  assert.match(app.NOTEBOOK_CONTENT_VERSION_MARK, /改訂(?:1[2-9]|2\d)$/);
});
