const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();
const sug = (problem, evidence) => app.cpKnowledgeSuggestions({ problem, evidence: [evidence], op: [], tp: [], ep: [] });

test('every ingested row has a provenance label, edition and review date; no source gating', () => {
  const rows = app.CPK_ROWS_79;
  assert.ok(rows.length >= 24);
  rows.forEach(r => {
    assert.ok(r.source.length && r.source.every(x => String(x).trim()), r.key);
    assert.ok(r.edition && r.checked && r.next, r.key);
    assert.ok(r.op.length && r.tp.length && r.ep.length, r.key);
  });
  ['liver-meta', 'peritoneal', 'old-mi'].forEach(k => assert.ok(rows.some(r => r.key === k), k));
  assert.ok(rows.find(r => r.key === 'peritoneal').source[0].includes('出典未確認'));
});

test('cross-cutting areas and common problems give suggestions', () => {
  ['無気肺', '心不全', 'COPD', '慢性腎臓病', '脳梗塞', 'パーキンソン病', 'オピオイド', '小児喘息', 'うつ病', '降圧薬', '褥瘡', '排尿障害', '不安', '離床開始期'].forEach(w => assert.ok(sug('観察', w).length >= 2, w));
  assert.strictEqual(sug('問題', '特記事項なし').length, 0);
});

test('negated, historical and new-symptom wording for combos', () => {
  const keys = t => Array.from(app.cpHighRiskCombos(t)).map(x => x.key);
  assert.strictEqual(keys('オキシコドン内服中。呼吸数低下なし、傾眠なし').length, 0);
  assert.strictEqual(keys('陳旧性心筋梗塞。胸痛なし').length, 0);
  assert.ok(keys('陳旧性心筋梗塞。新規の胸痛あり').includes('old-mi-new-symptom'));
  assert.ok(keys('術後、安静臥床、右下肢の腫脹と疼痛').includes('postop-immobile-leg'));
  assert.ok(keys('血栓のリスク。突然の息苦しさ').includes('dvt-sudden-dyspnea'));
  assert.strictEqual(app.cpHighRiskCombos('膵頭部がん疑い、黄疸、発熱')[0].certainty, 'suspected');
});

test('unknown term reaches the knowledge request screen and is not replaced', () => {
  const cp = { id: 'p', title: 'T', items: [{ id: 'i1', text: '今検査の結果待ち', type: 'o', hendersonIds: [] }, { id: 'i2', text: '血圧安定', type: 'o', hendersonIds: [4] }], carePlans: {}, sourceText: '', myAssessments: {}, missingChecks: {} };
  const reqs = app.buildKnowledgeRequests(cp);
  assert.ok(reqs.some(r => r.kind === 'unknown_term' && r.term === '今検査'));
  assert.strictEqual(cp.items[0].text, '今検査の結果待ち');
});

test('symptom table adds multi-tag items without dropping existing ones', () => {
  const ids = t => Array.from(app.diseaseSymptomNeeds(t));
  assert.ok(ids('動悸').includes(4) && ids('動悸').includes(9));
  assert.ok(ids('夜間頻尿').includes(3) && ids('夜間頻尿').includes(5));
  assert.ok(ids('抑うつ').includes(12) && ids('抑うつ').includes(13));
  assert.ok(ids('肝転移').includes(2));
  assert.ok(ids('光線過敏症').includes(14));
});

test('bridge rules for the common problems are present', () => {
  const has = (a, b) => app.RM_BRIDGE_RULES.some(r => r.s.test(a) && r.t.test(b));
  assert.ok(has('筋力低下', 'ふらつき'));
  assert.ok(has('不動', '褥瘡'));
  assert.ok(has('息切れ', '活動量低下'));
  assert.ok(has('廃用', '耐容能低下'));
  assert.ok(has('残尿', '尿路感染'));
  assert.ok(has('情報不足', '不安'));
  assert.ok(has('肝転移', '黄疸'));
});
