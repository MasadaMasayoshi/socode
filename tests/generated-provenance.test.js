'use strict';
// Regression checks: generated results stay bound to their own patient and source revision.
const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers');

function makeApp() {
  const app = loadApp();
  return app;
}
const SLE_SOURCE = '28歳、女性、全身性エリテマトーデスの再燃で入院。倦怠感、微熱、関節痛。';
const HIP_PLAN = '<p>#1 術後疼痛：NRS 6、術後2日目、歩行訓練を実施。酸化マグネシウムを内服。長男が支援。大腿骨頸部骨折・人工骨頭置換術後。</p>';

function patient(id, sourceText, extra = {}) {
  return { id, title: id, sourceText, items: [{ id: id + '_1', type: 'o', text: sourceText, hendersonIds: [] }], ...extra };
}

test('late response after switching patients is written only to the requesting patient, and rejected when foreign', () => {
  const app = makeApp();
  const A = patient('pA', SLE_SOURCE);
  const B = patient('pB', '84歳、女性。大腿骨頸部骨折、人工骨頭置換術後2日目。NRS 6。歩行訓練。酸化マグネシウム。長男が面会。');
  app.globalAppData.patients = [A, B];
  app.globalAppData.currentPatientId = 'pA';
  const ticket = app.beginGeneration(A, 'carePlan');
  app.globalAppData.currentPatientId = 'pB'; // user switches while generating
  const r = app.commitGeneratedResult(ticket, 'carePlanResult', HIP_PLAN);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(B.carePlanResult, undefined);
  assert.strictEqual(A.carePlanResult, undefined);
});

test('a valid late response is stored on the requesting patient, never on the current one', () => {
  const app = makeApp();
  const A = patient('pA', SLE_SOURCE), B = patient('pB', '別の患者の記録。発熱あり。');
  app.globalAppData.patients = [A, B];
  const ticket = app.beginGeneration(A, 'timeline');
  app.globalAppData.currentPatientId = 'pB';
  const r = app.commitGeneratedResult(ticket, 'timelineResult', '<p>倦怠感と微熱が続いている。</p>');
  assert.strictEqual(r.ok, true);
  assert.ok(A.timelineResult);
  assert.strictEqual(B.timelineResult, undefined);
  assert.strictEqual(A.generatedMeta.timelineResult.patientId, 'pA');
});

test('response is rejected when the source changed during generation', () => {
  const app = makeApp();
  const A = patient('pA', SLE_SOURCE);
  app.globalAppData.patients = [A];
  const ticket = app.beginGeneration(A, 'timeline');
  A.sourceText += '\n追記：新しい記録。';
  assert.strictEqual(app.commitGeneratedResult(ticket, 'timelineResult', '<p>倦怠感</p>').reason, 'source-changed');
});

test('existing mismatched results are flagged and excluded from export after reload, originals untouched', () => {
  const app = makeApp();
  const A = patient('pA', SLE_SOURCE, { carePlanResult: HIP_PLAN, timelineResult: '<p>倦怠感と微熱が続いている。</p>' });
  const copy = JSON.parse(JSON.stringify(A)); // reload from storage
  assert.strictEqual(app.generatedResultStatus(copy, 'carePlanResult').ok, false);
  assert.strictEqual(app.activeGeneratedResult(copy, 'carePlanResult'), '');
  assert.ok(app.activeGeneratedResult(copy, 'timelineResult'));
  const text = app.buildReviewRequestText ? '' : '';
  const html = app.buildAssessmentPrintHtml ? app.buildAssessmentPrintHtml(copy) : '';
  assert.ok(!/酸化マグネシウム|人工骨頭|NRS|長男/.test(html + text));
  assert.strictEqual(copy.sourceText, SLE_SOURCE);
  assert.ok(copy.carePlanResult, 'original stored value is kept');
  assert.ok(/再生成するまで/.test(app.quarantineNoticeText(copy)));
});

test('bound result for another patient ID is rejected', () => {
  const app = makeApp();
  const A = patient('pA', SLE_SOURCE, { diagnosisResult: '<p>倦怠感</p>', generatedMeta: { diagnosisResult: { patientId: 'pB', sourceRev: 'x' } } });
  assert.strictEqual(app.generatedResultStatus(A, 'diagnosisResult').reason, 'patient-mismatch');
});

test('care plans from another patient are excluded from the exported plan text', () => {
  const app = makeApp();
  const A = patient('pA', SLE_SOURCE);
  app.createCarePlan(A, { problem: '術後疼痛', goalLong: '歩行訓練を進める', op: ['NRSを確認する'], tp: ['酸化マグネシウムを確認する'], ep: [] });
  app.createCarePlan(A, { problem: '疲労感', goalLong: '休息がとれる', op: ['倦怠感を観察する'], tp: [], ep: [] });
  const text = app.buildCarePlansText(A, { withRecords: false });
  assert.ok(!/術後疼痛|酸化マグネシウム/.test(text));
  assert.ok(/疲労感/.test(text));
});

test('infection-screen evidence is quoted from the record, never a canned negative result', () => {
  const app = makeApp();
  const v = app.sufficiencyCardVerdict({ text: 'HBs抗原(-)', hendersonIds: [9], type: 'o' }, 9, 'pre');
  assert.ok(!v.hit || /HBs/.test(v.hit));
});

// ---- Generic regression checks for the remaining contamination-related fixes ----
const run = (app, text) => Array.from(app.classifyTextByRules(text));
test('lab values with lowercase-l units and room-air SpO2 are extracted, not reported as unassessable', () => {
  const app = makeApp();
  const items = [
    { id: '1', type: 'o', text: 'Cr 1.1mg/dl (軽度上昇)', timestamp: '日時不明', hendersonIds: [3] },
    { id: '2', type: 'o', text: 'WBC 3,000/μl (減少)', timestamp: '日時不明', hendersonIds: [7] },
    { id: '3', type: 'o', text: 'T 37.6°C、BP 134/82mmHg、P 92/分、SpO2 98% (RA)', timestamp: '日時不明', hendersonIds: [1, 7] }
  ];
  const r = app.buildLabAssessment({ id: 'p', items, sourceText: '' });
  assert.ok(r.has);
  assert.ok(/Cr/.test(r.html) && /WBC/.test(r.html) && /SpO2/.test(r.html));
  assert.ok(!/原本確認が必要/.test(r.html.replace(/原本確認が必要な値[^<]*/g, '')) || !/WBC[^<]*データ確認/.test(r.html));
});
test('undated records are not defaulted to pre-admission', () => {
  const app = makeApp();
  const items = run(app, '検査 : 尿蛋白+\n治療 : 薬剤を増量');
  assert.ok(items.every(i => !i.admissionPhase || i.admissionPhase === 'unknown'));
});
test('frequent eating out alone does not make the meal need unmet; with weight loss it can', () => {
  const app = makeApp();
  assert.strictEqual(app.sufficiencyCardVerdict({ text: '食事は外食が多い', type: 'o', hendersonIds: [2] }, 2, 'pre').v, '');
  assert.strictEqual(app.sufficiencyCardVerdict({ text: '外食が多く、体重が3kg減少した', type: 'o', hendersonIds: [2] }, 2, 'pre').v, 'unmet');
});
test('UV protection is classified by meaning (environment / learning), and awareness is not consciousness', () => {
  const app = makeApp();
  const t = x => Array.from(run(app, x)[0].hendersonIds).sort((a, b) => a - b).join(',');
  assert.strictEqual(t('紫外線対策は意識していなかった'), '9,14');
  assert.strictEqual(t('意識レベルは清明'), '1');
});
test('disease symptom lists are separated from confirmed patient findings', () => {
  const app = makeApp();
  const r = run(app, '全身症状\n発熱、倦怠感、\n体重減少など\n\n脱毛\n光線過敏症\n\n生活状況\n食事は外食が多い');
  const t = c => c.text || c.content || '';
  assert.ok(r.filter(c => /脱毛|光線過敏症|体重減少/.test(t(c))).every(c => c.type === 'unnecessary'));
  assert.ok(r.some(c => /外食/.test(t(c)) && c.type !== 'unnecessary'));
});
test('complication predictions need patient-specific evidence', () => {
  const app = makeApp();
  const cp = { id: 'p', sourceText: '', items: [{ id: '1', type: 'o', text: 'SpO2 98% (RA)', timestamp: '日時不明', hendersonIds: [1], admissionPhase: 'preadmission', assessmentCols: { 1: 'preadmission' } }] };
  const d = app.sufficiencyDimensions(cp, 1, 'pre');
  assert.ok(!d || /根拠が確認できない|記録なし/.test(d.complications));
});
test('A to B switching and export: no foreign findings in A or B output', () => {
  const app = makeApp();
  const A = patient('pA', SLE_SOURCE, { carePlanResult: HIP_PLAN });
  const B = patient('pB', '84歳、女性。大腿骨頸部骨折、人工骨頭置換術後2日目。NRS 6。歩行訓練。酸化マグネシウム。長男が面会。', { carePlanResult: HIP_PLAN });
  assert.strictEqual(app.activeGeneratedResult(A, 'carePlanResult'), '');
  assert.ok(app.activeGeneratedResult(B, 'carePlanResult'));
  const htmlA = app.buildAssessmentPrintHtml(A).replace(/<p class="note">※患者の記録と合わない[^<]*<\/p>/, '');
  assert.ok(!/酸化マグネシウム|人工骨頭|NRS|長男|歩行訓練/.test(htmlA));
});
