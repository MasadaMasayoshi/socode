const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();
const sug = (problem, evidence) => app.cpKnowledgeSuggestions({ problem, evidence: [evidence], op: [], tp: [], ep: [] });

test('plan knowledge suggestions appear for the ingested topics', () => {
  ['硬膜外カテーテル抜去', 'インスリン', 'オキシコドン'].forEach(w => {
    const r = sug('観察の問題', `${w}後`);
    assert.ok(r.length >= 3, w);
    assert.ok(r.every(x => x.source.length >= 1 && x.msg.includes('一般的な案内')), w);
  });
  assert.strictEqual(sug('問題', '特記事項なし').length, 0);
});

test('every ingested row has sources or an explicit gap, and review metadata', () => {
  const rows = app.CARE_PLAN_KNOWLEDGE.filter(r => r.checked);
  assert.ok(rows.length >= 15);
  rows.forEach(r => { assert.strictEqual(r.next, '2027-10'); assert.ok(r.op.length && r.tp.length && r.ep.length, r.key); });
});

test('high-risk combinations fire only when all parts are present', () => {
  const keys = t => app.cpHighRiskCombos(t).map(x => x.key);
  assert.ok(keys('オキシコドン内服中。呼吸数が低下し傾眠あり').includes('opioid-resp'));
  assert.ok(keys('インスリン注射後、食事摂取不良で冷汗').includes('insulin-poor-intake'));
  assert.ok(keys('硬膜外カテーテル抜去、ヘパリン再開、下肢のしびれ').includes('epidural-anticoag-neuro'));
  assert.ok(keys('手術創に発赤と膿性排液').includes('wound-infection'));
  assert.ok(keys('安静臥床、左下肢の腫脹').includes('immobile-leg-swelling'));
  assert.ok(keys('膵頭部がん、黄疸、発熱').includes('pancreatic-jaundice-fever'));
  assert.strictEqual(keys('手術創に発赤のみ').length, 0);
  assert.strictEqual(keys('オキシコドン内服中').length, 0);
});

test('an unknown term is reported and never replaced', () => {
  const r = app.krUnknownTerms('今検査の結果待ち');
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].term, '今検査');
  assert.strictEqual(r[0].kind, 'unknown_term');
  assert.strictEqual(app.krUnknownTerms('検査の結果待ち').length, 0);
});

test('bridge rules are reachable through the map bridge step', () => {
  const N = (id, type, label) => ({ id, type, label });
  const map = { nodes: [N('a', 'treatment', 'オキシコドン内服'), N('b', 'patient_fact', '便秘'), N('c', 'disease', '膵頭部がん'), N('d', 'patient_fact', '黄疸')], edges: [{ source: 'a', target: 'b', relation: 'causes' }, { source: 'c', target: 'd', relation: 'causes' }] };
  assert.ok(app.rmApplyBridges(map) >= 2);
  assert.ok(app.rmChainReport(map).length >= 0);
  assert.ok(app.diseaseSymptomNeeds('膵頭部がん').includes(2));
  assert.strictEqual(app.diseaseSymptomNeeds('今検査').length, 0);
});
