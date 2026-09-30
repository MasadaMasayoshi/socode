'use strict';
// 検査値の単位・小数・カンマの扱いと、異常値の判定の不具合の再現と修正の確認
//  ・「CRP 1 mg/L」が換算されずに「CRP 1 mg/dL」になっていた
//  ・「Plt 28.7万/uL」が「Plt 28」と「.7万/uL」の2枚に分かれていた
//  ・「WBC 2000」「WBC 12,000」「Dダイマー 10」「BNP 500」が、基準値を外れていても「異常なし」になっていた
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const texts = t => JSON.parse(JSON.stringify(Array.from(app.classifyTextByRules(t)).map(c => c.text)));
const evaluate = t => { const r = app.evaluateLabFindings(Array.from(app.classifyTextByRules(t))); return JSON.parse(JSON.stringify(r)); };

test('単位：基準値と違う単位は換算し、換算したことを書き添える（CRP mg/L・Cre μmol/L・WBC ×10^3・Plt /μL・血糖 mmol/L）', () => {
  assert.deepEqual(texts('CRP 1 mg/L'), ['CRP 0.10 mg/dL (1 mg/Lから換算) (基準値: 0.3以下 mg/dL)']);
  assert.deepEqual(texts('Cre 88 μmol/L'), ['Cre 1.00 mg/dL (88 μmol/Lから換算) (基準値: 0.6〜1.1 mg/dL)']);
  assert.deepEqual(texts('WBC 5.6 ×10^3/μL'), ['WBC 5,600 /μL (5.6 ×10^3/μLから換算) (基準値: 4,000〜9,000 /μL)']);
  assert.deepEqual(texts('Plt 287000/μL'), ['Plt 28.7 ×10^4/μL (287000 /μLから換算) (基準値: 13.0〜35.0 ×10^4/μL)']);
  assert.deepEqual(texts('血糖 7.2 mmol/L'), ['血糖 130 mg/dL (7.2 mmol/Lから換算) (基準値: 70〜109 mg/dL)']);
});

test('単位：同じ意味の単位（万/μL・mmol/L）はそろえ、換算できない単位・ありえない値は原文のまま残す', () => {
  assert.deepEqual(texts('Plt 28.7万/uL'), ['Plt 28.7 ×10^4/μL (基準値: 13.0〜35.0 ×10^4/μL)']);
  assert.deepEqual(texts('Na 140 mmol/L'), ['Na 140 mEq/L (基準値: 135〜145 mEq/L)']);
  assert.deepEqual(texts('BUN 5 mmol/L'), ['BUN 5 mmol/L'], '換算の決まっていない単位は、mg/dLに書き換えない');
  assert.deepEqual(texts('WBC 5.6'), ['WBC 5.6'], '単位の無い 5.6 を /μL と決めつけない');
});

test('小数：どの項目も小数点以下を切らず、1枚のカードのまま（Plt・RBC・WBC）', () => {
  assert.deepEqual(texts('Plt 23.4 ×10^4/μL'), ['Plt 23.4 ×10^4/μL (基準値: 13.0〜35.0 ×10^4/μL)']);
  assert.deepEqual(texts('RBC 4.5 ×10^6/μL'), ['RBC 450 ×10^4/μL (4.5 ×10^6/μLから換算) (基準値: 400〜550 ×10^4/μL)']);
  assert.equal(texts('Plt23.6 Hb12.2g/dl').length, 2);
});

test('カンマ：「12,000」は1つの数、「WBC 11200, CRP 3.8」の区切りのカンマは数に含めない', () => {
  assert.deepEqual(texts('WBC 12,000'), ['WBC 12,000 /μL (基準値: 4,000〜9,000 /μL)']);
  const r = evaluate('[検査データ] WBC 11200, CRP 3.8, Hb 10.2');
  assert.deepEqual(r.findings.map(f => f.label), ['WBC', 'CRP', 'Hb']);
});

test('異常値：アプリの基準値を外れた値を見落とさない（低い値・カンマ入り・「以下」の基準）', () => {
  const cases = [['WBC 2000', 'low'], ['WBC 12,000', 'high'], ['Dダイマー 10', 'high'], ['BNP 500', 'high'], ['白血球 3200', 'low']];
  cases.forEach(([src, dir]) => {
    const r = evaluate(src);
    assert.equal(r.findings.length, 1, `${src}: ${JSON.stringify(r)}`);
    assert.equal(r.findings[0].direction, dir, src);
  });
  assert.equal(evaluate('CRP 1 mg/L').findings.length, 0, '1 mg/L＝0.1 mg/dL は基準値内');
  assert.equal(evaluate('CRP 0.3 mg/dL').findings.length, 0, '「0.3以下」の0.3は基準値内');
});

test('異常値：基準値の書き方（「<0.2」「〜」のカンマ）・値と基準値で単位が違う表も判定する', () => {
  const find = arr => app.evaluateLabFindings(arr).findings.map(f => `${f.label}:${f.direction}`);
  assert.deepEqual(JSON.parse(JSON.stringify(find([{ text: 'CRP 0.826mg/dl (基準値: <0.2mg/dl)' }]))), ['CRP:high']);
  assert.deepEqual(JSON.parse(JSON.stringify(find([{ text: 'WBC (白血球) 10,200/μL (基準値: 8.1-9.0×10^3/μL)' }]))), ['WBC (白血球):high']);
  assert.deepEqual(JSON.parse(JSON.stringify(find([{ text: 'WBC 2,000 /μL (基準値: 4,000〜9,000 /μL)' }]))), ['WBC:low']);
});

test('判定できない値は「異常なし」にせず、「判定できません」として理由を出す', () => {
  const r = evaluate('BUN 5 mmol/L\nWBC 5.6');
  assert.equal(r.findings.length, 0);
  assert.equal(r.checked, 0);
  assert.equal(r.undetermined.length, 2);
  assert.match(r.undetermined[0].reason, /換算できません/);
  assert.match(r.undetermined[1].reason, /単位が書かれておらず/);
  const odd = app.evaluateLabFindings([{ text: 'Dダイマー 11μg/ml (基準値: 2.3μg/ml)' }]);
  assert.equal(odd.findings.length, 0);
  assert.equal(odd.undetermined.length, 1, '基準値が1つの数だけで上限か下限か分からない');
});

test('薬の名前の中の「Na」（セファゾリンNa 1g）は検査値として判定しない', () => {
  assert.equal(evaluate('抗生剤 セファゾリンNa 1g＋生食100ml').findings.length, 0);
});
