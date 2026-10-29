const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./app-helpers');
const app = loadApp();

function build(file) {
  const text = fs.readFileSync(path.join(__dirname, 'fixtures', file), 'utf8');
  const items = app.groupClinicalPhrasesWithTimestamps(text).filter(c => !c.isUnnecessaryBoilerplate).map((c, k) => {
    const ids = [...new Set(app.detectMultipleHendersonTags(c.text))];
    const col = app.inferAssessmentColumn('', c.timestamp, null);
    return { id: 'i' + k, type: 'o', text: c.text, fieldLabel: c.fieldLabel, timestamp: c.timestamp, hendersonIds: ids, assessmentCols: Object.fromEntries(ids.map(h => [h, col || 'postadmission'])) };
  });
  return { id: file, title: file, items, carePlans: {}, sourceText: text, myAssessments: {}, missingChecks: {} };
}
const row = (rows, n, ph) => rows.find(r => r.needId === n && r.phase === ph);

test('川崎病: 充足判定の9項目', () => {
  const rows = app.fulfillmentAssessmentRows(build('kawasaki-5f.txt'));
  assert.equal(row(rows, 5, '入院前').verdict, 'met');
  assert.equal(row(rows, 5, '入院後').verdict, 'unmet');
  assert.equal(row(rows, 2, '入院後').verdict, 'unmet');
  const el = row(rows, 3, '入院後');
  assert.equal(el.verdict, 'unmet');
  assert.match(el.impact, /尿量減少は現在の所見/);
  assert.notEqual(row(rows, 4, '入院後').verdict, 'unmet');
  assert.match(row(rows, 4, '入院後').impact, /安静は指示された制限/);
  assert.notEqual(row(rows, 10, '入院後').verdict, 'unmet');
  assert.notEqual(row(rows, 13, '入院後').verdict, 'met');
  assert.match(row(rows, 8, '入院後').impact, /皮膚・粘膜の状態の障害/);
  assert.notEqual(row(rows, 1, '入院後').verdict, 'unmet');
  // 記録がないことを判断保留にしない
  for (const n of [9, 14]) assert.notEqual(row(rows, n, '入院後').verdict, 'conflict');
});

for (const f of fs.readdirSync(path.join(__dirname, 'fixtures')).filter(x => /kawasaki|postpartum|産褥|t1d|diabet|gastrec|胃/i.test(x) && /\.txt$/.test(x))) {
  test('全事例の根拠参照が元記録に戻る: ' + f, () => {
    const cp = build(f);
    const rows = app.fulfillmentAssessmentRows(cp);
    assert.equal(rows.length, 28);
    for (const r of rows) {
      assert.equal(r.unresolvedRefs, 0, `${r.needId}/${r.phase}`);
      if (r.verdict === 'conflict') assert.ok(r.support.length > 0, `判断保留は実際の矛盾根拠が必要 ${r.needId}/${r.phase}`);
    }
  });
}

test('v.205 看護計画: 根拠のない褥瘡・廃用リスクを作らず、不完全な計画は下書きにする', () => {
  const cp = build('kawasaki-5f.txt');
  cp.relationMap = app.buildRelationMapFromRecord(cp);
  app.importCarePlansFromMap(cp);
  app.refineCarePlans(cp);
  const plans = Object.values(cp.carePlans);
  assert.ok(plans.length >= 2);
  for (const p of plans) {
    assert.doesNotMatch(p.problem, /褥瘡|廃用/);
    assert.doesNotMatch([p.goalShort, p.goalLong, ...p.op, ...p.tp, ...p.ep].join(''), /術前|術後|DESIGN-R/);
    assert.doesNotMatch(p.goalShort, /5時間以上続けて/);
    if (p.status === 'planned') assert.equal(app.carePlanCompleteness(p).length, 0);
    else assert.equal(p.status, 'draft');
    for (const k of ['op', 'tp', 'ep']) assert.ok(p[k].length > 0);
  }
  const fl = plans.find(p => /体液量不足/.test(p.problem));
  assert.match(fl.problem, /現在/);
  assert.ok(fl.op.some(t => /体重/.test(t)) && fl.op.some(t => /IN\/OUT/.test(t)));
});
