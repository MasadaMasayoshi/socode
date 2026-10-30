const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const cards = s => Array.from(app.classifyTextByRules(s));
const cp = s => ({ id: 'p', title: 't', sourceText: s, items: cards(s).map((c, i) => ({ ...c, id: 'c' + i })), carePlans: {}, myAssessments: {}, selectedDiagnosisIds: [], diagnosisCandidates: [] });
const verdict = (t, need, phase, ts = '術後2日目 8:00', type = 'o') => app.sufficiencyCardVerdict({ id: 'x', text: t, timestamp: ts, hendersonIds: [need], type }, need, phase).v;
const SRC = 'A氏\n氏名\tA氏\n入院日\t2026年6月8日\n入院時の様子\n「大丈夫よ」と言っていた。\n職業\n専業主婦\n2．生活習慣・身体情報\n睡眠\n7時間睡眠（眠剤の使用なく、寝つきはよい）\n現在は痛みのため眠れていない\n4．入院から手術までの経過\n入院時の状況（6月8日）\n入浴：不可　全身清拭\n6．術後1日目（6月11日）\n10:00\n体温37.0度';

test('時期：入院時の見出しのあとの生活習慣の項は入院前、「現在」の文と入院時の状況は入院時のまま', () => {
  const c = cards(SRC).filter(x => x.type !== 'unnecessary');
  const ts = re => c.find(x => re.test(x.text)).timestamp;
  assert.equal(ts(/7時間睡眠/), '入院前');
  assert.equal(ts(/専業主婦/), '入院前');
  assert.equal(ts(/現在は痛み/), '入院時');
  assert.equal(ts(/入浴/), '入院時');
});
test('時期：入院時の見出しがなく生活習慣の項がない記録は変えない（反例）', () => {
  const c = cards('入院時の様子\n「痛い」と話す。\n家族が付き添っている。').filter(x => x.type !== 'unnecessary');
  assert.ok(c.every(x => x.timestamp === '入院時'));
});
test('睡眠：入院時の「現在は眠れていない」は術前の未充足、本人の「眠れた」は充足の根拠になる', () => {
  assert.equal(verdict('現在は痛みのため眠れていない', 5, 'pre', '入院時'), 'unmet');
  assert.equal(verdict('現在は痛みのため眠れていない', 5, 'pre', '入院前'), '');
  assert.equal(verdict('「昨夜は眠れた。」と本人', 5, 'post', undefined, 's'), 'met');
  assert.equal(verdict('「食事はおいしい」と本人', 2, 'post', undefined, 's'), '', '睡眠以外は発言だけで充足にしない');
});
test('「痛み止め」は痛みの所見ではない／「〜ないと気持ちが悪い」は習慣で、今の不快ではない', () => {
  assert.equal(verdict('痛み止めが効いているのかな', 5, 'post'), '');
  assert.equal(verdict('痛みのため眠れなかった', 5, 'post'), 'unmet');
  assert.equal(verdict('きれい好きで毎日お風呂に入れないと気持ちが悪い', 8, 'pre', '入院前'), '');
  assert.equal(verdict('体がべたべたして気持ちが悪い', 8, 'post'), 'unmet');
});
test('仕事：本人の職業・役割の記録は入院前の充足、家族の職業は根拠にしない', () => {
  assert.equal(verdict('専業主婦（65歳までは小学校の教員をしていた）', 12, 'pre', '入院前'), 'met');
  assert.equal(verdict('夫は会社員', 12, 'pre', '入院前'), '');
});
test('学び：説明を理解している文は欲求14、説明があっただけでは付けない', () => {
  assert.ok(Array.from(app.detectMultipleHendersonTags('手術の説明について、本人は理解している')).includes(14));
  assert.ok(!Array.from(app.detectMultipleHendersonTags('医師より手術の説明あり')).includes(14));
});
test('学び：質問や「わからない」から知識の不足を導き、疼痛を学びの問題にしない', () => {
  const r = app.crTopicsForNeed(cp('術後2日目\n15:00\n「家に帰ってから気を付けることは、わからないのでまた教えてください。」\n「体重かけても大丈夫なの？怖い」\n理解良好\n疼痛増強あり'), 14);
  assert.equal(r.map(x => x.topic.id).join(), 'knowledge');
  assert.match(app.crProblemLine(r[0]), /知識の不足/);
  assert.doesNotMatch(app.crNarrative(r[0], {}).join(''), /意思力|意欲がない/);
});
