const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const card = (id, text, n, ts) => ({ id, type: 'o', text, timestamp: ts || '術後3日目', hendersonIds: [n], assessmentCols: { [n]: 'postadmission' } });
const cpOf = items => ({ id: 'p', title: 'A氏', sourceText: '', items, myAssessments: {}, carePlans: {}, missingChecks: {}, selectedDiagnosisIds: [], diagnosisCandidates: [] });
const bowel = () => app.CR_TOPICS.find(t => t.id === 'bowel');

test('便秘の推論：日数と腹部の張り・安静・術後があれば「可能性」とし、確定しない', () => {
  const cp = cpOf([card('a', '術後3日目まで排便なし。', 3), card('b', '「お腹が張って苦しい」と話す。腹部膨満あり。', 3), card('c', 'ベッド上安静。尿器を使用している。', 3)]);
  const r = app.crAnalyzeTopic(cp, bowel());
  assert.ok(['suspected', 'supported'].includes(r.status) && r.status !== 'confirmed');
  assert.ok(r.supported.some(x => /安静/.test(x.label)));
  const txt = app.crNarrative(r, {}).join('');
  assert.match(txt, /可能性|考える/);
  assert.doesNotMatch(txt, /便秘と診断/);
});

test('便秘の推論：記録にない水分摂取不足を作らず、不足情報として挙げる', () => {
  const cp = cpOf([card('a', '排便なし(3日目)', 3), card('b', '腹部膨満あり', 3)]);
  const r = app.crAnalyzeTopic(cp, bowel());
  assert.ok(!r.supported.some(x => /水分/.test(x.label)));
  assert.ok(r.possible.some(l => /水分/.test(l)));
  assert.ok(r.missing.some(l => /水分/.test(l)));
  assert.match(app.crNarrative(r, {}).join(''), /記録がない/);
});

test('便秘の推論：排便がない日数だけでは確定せず、排ガス・蠕動があれば材料として使う', () => {
  const only = app.crAnalyzeTopic(cpOf([card('a', '排便なし', 3)]), bowel());
  assert.ok(['insufficient', 'suspected'].includes(only.status));
  assert.notEqual(only.status, 'confirmed');
  const flat = app.crAnalyzeTopic(cpOf([card('a', '排便なし', 3), card('b', '排ガスあり。腸蠕動あり。', 3)]), bowel());
  assert.ok(flat.counter.length >= 1);
});

test('推論：否定された原因はあるものとして扱わない／所見がなければ何も出さない', () => {
  const r = app.crAnalyzeTopic(cpOf([card('a', '排便なし', 3), card('b', '悪心なし', 2)]), app.CR_TOPICS.find(t => t.id === 'nutrition'));
  assert.equal(r.status, 'none');
  assert.equal(app.crTopicsForNeed(cpOf([card('x', '体温36.5度', 7)]), 3).length, 0);
});

test('重点アセスメント：排便の欲求に推論（問題の推論→理論→患者固有の原因→候補）が入る', () => {
  const cp = cpOf([card('a', '排便なし(3日目)', 3), card('b', '腹部膨満あり', 3), card('c', 'ベッド上安静', 3)]);
  const d = app.buildFocusDraft(cp, 3);
  assert.match(d.focusAnalysis, /一般に、便秘とは/);
  assert.match(d.focusAnalysis, /この患者では/);
  assert.match(d.focusProblem, /（候補）.*便秘/);
  assert.doesNotMatch(d.focusAnalysis + d.focusProblem, /要確認/);
});
