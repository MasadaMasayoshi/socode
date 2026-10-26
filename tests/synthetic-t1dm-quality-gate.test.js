'use strict';
// Regression + quality gate on a synthetic adolescent type 1 diabetes record (not a real patient).
// Criteria are fixed in advance; critical errors fail the gate regardless of the score.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./app-helpers');
const app = loadApp();

const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'synthetic-t1dm-adolescent.txt'), 'utf8');
function build() {
  const items = app.groupClinicalPhrasesWithTimestamps(text).filter(c => !c.isUnnecessaryBoilerplate).map((c, k) => {
    const ids = Array.from(new Set(app.detectMultipleHendersonTags(c.text)));
    if ((c.isLabOrVital || app.LAB_ITEM_NAME_REGEX.test(c.text)) && !ids.includes(2)) ids.push(2);
    const col = app.inferAssessmentColumn ? app.inferAssessmentColumn('', c.timestamp, null) : null;
    return { id: `i${k}`, type: 'o', text: c.text, timestamp: c.timestamp, hendersonIds: ids, assessmentCols: Object.fromEntries(ids.map(h => [h, col || 'postadmission'])) };
  });
  return { id: 'syn', title: 'syn', items, carePlans: {}, sourceText: text, myAssessments: {}, missingChecks: {} };
}

test('quality gate: critical errors fail regardless of score', () => {
  const cp = build();
  app.buildCarePlansByRules(cp);
  app.prioritizeCarePlans(cp);
  const plans = app.carePlanList(cp);
  const all = JSON.stringify(plans);
  const critical = [];
  // Unsupported / foreign content (surgical, steroid, alcohol, orthopedic complication templates) must not appear.
  for (const re of [/術後|創部|ステロイド|飲酒|アルコール|脱臼|復職|ドレーン/]) if (re.test(all)) critical.push(`foreign term ${re}`);
  // Every plan is complete.
  plans.forEach(p => { if (!String(p.problem || '').trim()) critical.push('unnamed plan'); if (!(p.op || []).length) critical.push(`no OP: ${p.problem}`); });
  assert.equal(JSON.stringify(critical), '[]');
  assert.equal(JSON.stringify(Array.from(app.cpConsistencyWarnings(cp)).filter(w => /空|記録にない用語/.test(w))), '[]');
});

test('score: auditable criteria for this record (weights follow the owner spec)', () => {
  const cp = build();
  app.buildCarePlansByRules(cp);
  app.prioritizeCarePlans(cp);
  const plans = app.carePlanList(cp);
  const res = app.judgeSufficiencyByRules(cp);
  const crit = [
    ['plans', 10, plans.some(p => /自主管理/.test(p.problem)) && plans.some(p => /血糖/.test(p.problem))],
    ['no stale nutrition plan after intake recovery', 10, !plans.some(p => /栄養摂取量不足/.test(p.problem))],
    ['no stale ketoacidosis dehydration after follow-up', 10, !plans.some(p => /体液量不足/.test(p.problem))],
    ['respiration: tachypnea/acid-base is unmet, not 保留', 20, res[1] && res[1].post && res[1].post.verdict === 'unmet'],
    ['learning: unmet with strengths kept', 20, res[14] && res[14].post && res[14].post.verdict === 'unmet' && (res[14].post.facts.for || []).length >= 1],
    ['nutrition: not unmet from admission-time glucose/HbA1c', 15, res[2] && res[2].post && res[2].post.verdict !== 'unmet'],
    ['post-discharge goals', 15, plans.every(p => !/^退院までに|^入院中/.test(p.goalLong || ''))]
  ];
  const score = crit.reduce((a, [, w, ok]) => a + (ok ? w : 0), 0);
  const failed = crit.filter(c => !c[2]).map(c => c[0]);
  assert.ok(score >= 85, `score ${score}, failed: ${failed.join(' / ')}`);
});

test('regression: unrelated patient groups keep their own plans (no diabetes content leaks)', () => {
  (app.SAMPLE_CASES || []).filter(c => !/糖尿病/.test(c.label)).forEach(c => {
    const cp = { id: 's', title: 's', items: [], carePlans: {}, sourceText: c.text, myAssessments: {}, missingChecks: {} };
    const items = app.groupClinicalPhrasesWithTimestamps(c.text).filter(x => !x.isUnnecessaryBoilerplate).map((x, k) => ({ id: `s${k}`, type: 'o', text: x.text, timestamp: x.timestamp, hendersonIds: Array.from(new Set(app.detectMultipleHendersonTags(x.text))), assessmentCols: {} }));
    cp.items = items;
    app.buildCarePlansByRules(cp);
    const body = JSON.stringify(app.carePlanList(cp));
    assert.ok(!/注射部位を毎回|補食と報告/.test(body), `diabetes self-management lines leaked into ${c.label}`);
  });
});
