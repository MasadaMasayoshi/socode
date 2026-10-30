const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const SRC = 'A氏\n氏名\tA氏\n入院日\t2026年6月8日\n主訴\n動くと右足が痛い。\n入院時の様子\n「大丈夫よ」と言っていた。\n2．生活習慣・身体情報\n嗜好品\nタバコ：なし\n睡眠\n7時間睡眠\n清潔\n入浴：1回/日 自立\nきれい好きで毎日お風呂に入れないと気持ちが悪い。\n更衣\n自立\n4．入院から手術までの経過\n入院時の状況（6月8日）\n入浴：不可　全身清拭\n右大腿骨人工骨頭置換術を施行\n6．術後1日目（6月11日）\n10:00\n疼痛増強あり。「痛みのため昨晩は眠れなかった」\n11:00\n看護師2名で清潔ケア（全身清拭＋陰部洗浄＋更衣）を実施\n7．術後2日目（6月12日）\n8:00\n「昨夜は痛みもひどくなく、眠れた。」と本人\n10:00\n「体がべたべたして気持ちが悪い。」\n皮膚のべたつきあり。';
const cp = () => { const items = Array.from(app.classifyTextByRules(SRC)).map((c, i) => ({ ...c, id: 'c' + i })); const c = { id: 'p', title: 't', sourceText: SRC, items, carePlans: {}, myAssessments: {}, selectedDiagnosisIds: [], diagnosisCandidates: [] }; app.judgeSufficiencyByRules(c); return c; };
const draft = n => { const d = app.buildFocusDraft(cp(), n); return [d.focusAnalysis, d.focusIntegration, d.focusProblem].join('\n'); };
test('文章：定型句・二重の候補表示・崩れた引用を出さない', () => {
  for (const n of [2, 3, 4, 5, 8, 14]) {
    const t = draft(n);
    assert.doesNotMatch(t, /起こるとは限らない|残存能力を活かし|現在残る問題は|この欲求から明確になる看護問題である/, `need ${n}`);
    assert.doesNotMatch(t, /（候補）[^\n]*（候補/, `need ${n}`);
    assert.doesNotMatch(t, /」ことから|ことことから|ないがあり/, `need ${n}`);
    (t.match(/「[^」\n]*」/g) || []).forEach(q => assert.equal((q.match(/『/g) || []).length, (q.match(/』/g) || []).length, q));
  }
});
test('文章：入院前の段落に主訴・入院時の記録や見出し語を入れず、ラベルは「〜は」にする', () => {
  const t = draft(8);
  const pre = (t.split('\n').find(l => l.startsWith('入院前は')) || '');
  assert.match(pre, /入浴は1回\/日 自立/);
  assert.doesNotMatch(pre, /不可|清拭|更衣$|、更衣/);
  assert.doesNotMatch(draft(4).split('\n').find(l => l.startsWith('入院前は')) || '', /右足が痛い/);
});
test('文章：経過は記録の呼び方（術後N日目）で書き、睡眠の改善を不眠と同じ意味にしない', () => {
  const t = draft(5);
  assert.match(t, /術後1日目は/);
  assert.match(t, /休息がとれるようになってきている/);
  assert.doesNotMatch(t, /睡眠の障害の疑い/);
});
