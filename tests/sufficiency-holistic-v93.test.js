const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();
const card = (id, text, n, o) => Object.assign({ id, type: 'o', text, timestamp: '入院3日目', hendersonIds: [n], assessmentCols: { [n]: 'postadmission' } }, o || {});
const cpOf = items => ({ id: 'p', title: 'T', sourceText: '', items, myAssessments: {}, carePlans: {}, missingChecks: {} });
const txt = (cp, n, ph) => app.sufficiencyPhaseText(cp, n, ph);

test('shapes differ by evidence (compensated / contradicted / one-sided / confirm-needed) but every sentence ends with the verdict', () => {
  const shapes = [
    txt(cpOf([card('a', 'HbA1c 9.2%', 2), card('b', '食事摂取は全量', 2)]), 2, 'post'),
    txt(cpOf([card('a', 'HbA1c 9.2%', 2)]), 2, 'post'),
    txt(cpOf([card('a', '食事摂取は全量', 2), card('b', '食事は全量', 2)]), 2, 'post'),
    txt(cpOf([card('a', '食事摂取は全量', 2)]), 2, 'pre')];
  shapes.forEach(x => assert.match(x, /(?:充足している|未充足である|判定保留|情報不足)。$/));
  assert.strictEqual(new Set(shapes.map(x => x.replace(/^[^／]*／判定根拠：/, '').replace(/[SO]-\d+（[^）]*）/g, '').replace(/(?:充足している|未充足である|判定保留|情報不足)。$/, ''))).size >= 3, true);
  assert.ok(!/と思われる|かもしれない/.test(shapes.join('')));
});

test('mixed evidence: problematic value outweighed by a recorded compensating fact -> 充足 with 「であるが、…なので」', () => {
  const t = txt(cpOf([card('a', 'HbA1c 9.2%', 2), card('b', '食事摂取は全量', 2)]), 2, 'post');
  assert.match(t, /^判定：充足／判定根拠：O-1（HbA1c 9.2%）は参考基準の範囲外であるが、O-2（食事摂取は全量）なので、食事は充足している。$/);
  const t2 = txt(cpOf([card('a', 'HbA1c 9.2%。症状なし', 2)]), 2, 'post');
  assert.match(t2, /^判定：充足.*であるが、.*なので、食事は充足している。$/);
});

test('mixed evidence: a normal value with a recorded problem elsewhere -> 未充足', () => {
  const t = txt(cpOf([card('a', 'SpO2 97%、呼吸数16回', 1), card('b', '湿性咳嗽あり', 1)]), 1, 'post');
  assert.match(t, /^判定：未充足／判定根拠：O-1（SpO2 97%）は基準内であるが、O-2（湿性咳嗽あり）の記録があるため、呼吸は未充足である。$/);
});

test('one-sided evidence uses a plain 「<所見>のため、…」; missing -> 情報不足', () => {
  assert.match(txt(cpOf([card('a', 'HbA1c 9.2%', 2)]), 2, 'post'), /^判定：未充足／判定根拠：O-1（HbA1c 9.2%）のため、食事は未充足である。$/);
  assert.match(txt(cpOf([card('a', '食事摂取は全量', 2)]), 2, 'post'), /^判定：充足／判定根拠：O-1（食事摂取は全量）のため、食事は充足している。$/);
  assert.match(txt(cpOf([card('a', '食事摂取は全量', 2)]), 2, 'pre'), /^判定：情報不足／判定根拠：.*ので、食事は情報不足。$/);
});

test('counterexamples: a single abnormal lab without a compensating fact is not 充足; the same number is not its own compensator; disease name alone gives nothing', () => {
  const v = (items, n) => app.ruleSufficiencyFor(cpOf(items))[n].post.verdict;
  assert.notStrictEqual(v([card('a', 'HbA1c 9.2%', 2)], 2), 'met');
  assert.notStrictEqual(v([card('a', 'HbA1c 9.2%。HbA1c 9.2%は前回と同じ', 2)], 2), 'met');
  assert.notStrictEqual(v([card('a', '体温38.2℃。症状なし', 7)], 7), 'met'); // acute indicators are not compensated
  assert.strictEqual(v([card('a', '糖尿病で通院中', 2)], 2), 'unknown');
});

test('surgical patient: 術前 and 術後 are judged from their own cards only', () => {
  const cp = cpOf([
    card('a', 'HbA1c 9.4%', 2, { timestamp: '術前', assessmentCols: { 2: 'postadmission' } }),
    card('b', '食事摂取は全量', 2, { timestamp: '術前', assessmentCols: { 2: 'postadmission' } }),
    card('c', '術後 食欲不振が続き、食事摂取は2割', 2, { timestamp: '術後1日目', assessmentCols: { 2: 'postadmission' } }),
    card('d', '術後 創部の発赤あり', 8, { timestamp: '術後1日目', assessmentCols: { 8: 'postadmission' } })]);
  const r = app.ruleSufficiencyFor(cp)[2];
  assert.strictEqual(r.preop.verdict, 'met');
  assert.strictEqual(r.postop.verdict, 'unmet');
  assert.ok(!(r.postop.evidence || []).includes('a') && !(r.preop.evidence || []).includes('c'));
  assert.match(app.sufficiencyPhaseText(cp, 2, 'preop'), /であるが、.*なので、食事は充足している。$/);
  assert.match(app.sufficiencyPhaseText(cp, 2, 'postop'), /食事は未充足である。$/);
});

test('every judgement keeps the evidence cards and the 参考基準／原因ヒント as separate lines', () => {
  const cp = cpOf([card('a', 'HbA1c 10.5%', 14), card('b', 'インスリン自己注射の手技を間違える', 14)]);
  const t = app.sufficiencyJudgmentsText(cp);
  assert.match(t, /判定：未充足／判定根拠：.*未充足である。｜根拠カード：O-/);
  assert.match(t, /\n\s+原因のヒント（参考）：/);
  assert.match(t, /\n\s+参考基準：HbA1c 9%以上/);
  assert.ok(!/判定根拠：[^\n]*(?:参考基準：|原因のヒント)/.test(t));
});

test('instruction block C mentions the comprehensive per-phase judgement and the intended form; old text kept', () => {
  const t = app.correctionRequestInstructionsText();
  assert.match(t, /Do not reword the existing sufficiency sentences\./);
  assert.match(t, /comprehensive per phase/);
  assert.match(t, /wording is chosen to fit the evidence/);
  assert.match(t, /always ends with a definite verdict/);
  assert.match(app.NOTEBOOK_CONTENT_VERSION_MARK, /改訂(?:1[5-9]|2\d)$/);
});
