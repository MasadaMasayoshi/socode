const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const mk = (SRC) => {
  const items = Array.from(app.classifyTextByRules(SRC)).map((c, i) => ({ ...c, id: 'c' + i }));
  return { id: 'p', title: 'A氏', sourceText: SRC, items, carePlans: {}, myAssessments: {}, selectedDiagnosisIds: [], diagnosisCandidates: [] };
};

test('否定された所見は肯定として拾わない（嘔気・嘔吐なし）／肯定は拾う', () => {
  assert.ok(!app.cvAffirmed(/嘔気|悪心/, '嘔気・嘔吐なし'));
  assert.ok(app.cvAffirmed(/嘔気|悪心/, '嘔気があり食事を残した'));
});

test('関連図：嘔気なしの記録から悪心ノードを作らない', () => {
  const cp = mk('胃切除術後2日目。嘔気・嘔吐なし。腹部膨満なし。');
  const m = app.buildRelationMapFromRecord(cp);
  const labels = (m.nodes || []).map(n => n.label).join('|');
  assert.doesNotMatch(labels, /悪心|嘔気/);
});

test('検査値：Alb低値だけで低栄養の関連図ノードを作らない', () => {
  const cp = mk('Alb 2.9 g/dL\n術後2日目。創部痛NRS4。');
  const m = app.buildRelationMapFromRecord(cp);
  assert.ok(!(m.nodes || []).some(n => /低栄養|栄養摂取量不足/.test(n.label)));
});

test('検査値：異常な単位は指摘するが原文は変えない', () => {
  const cp = mk('eGFR 45 /μL\nCRP 3.2 mg/dL');
  const before = cp.items.map(i => i.text).join('\n');
  const iss = app.cvCheckLabUnits(cp);
  assert.ok(Array.isArray(iss));
  assert.equal(cp.items.map(i => i.text).join('\n'), before);
  assert.ok(!iss.some(x => x.analyte === 'CRP'));
});

test('根拠の関連性：無関係な記述は根拠に採用しない', () => {
  assert.ok(app.cvEvidenceRelevant('急性疼痛', '創部痛NRS5で体動時に増強'));
  assert.ok(!app.cvEvidenceRelevant('悪心', '食事は全量摂取できた。歩行も安定'));
});

test('重点アセスメント：下書きに「継続した観察と援助が必要」だけの結論を出さず、要確認も使わない', () => {
  const cp = mk('右大腿骨頸部骨折で人工骨頭置換術を施行した。\n入院前は自立していた。\n創部痛があり動かすと痛い。NRS5。\n看護師の見守りで車いすに移乗した。');
  app.buildCarePlansByRules(cp);
  const d = app.buildFocusDraft(cp, 4);
  const all = d.focusAnalysis + d.focusIntegration + d.focusProblem;
  assert.doesNotMatch(all, /要確認/);
  assert.doesNotMatch(d.focusIntegration, /^継続した観察と援助が必要。?$/);
  assert.ok(d.focusProblem.length > 0);
});

test('重点アセスメント：入院前→入院後の順で書き、統合は分析の繰り返しでなく、省略記号で切らない', () => {
  const cp = mk('入院前は自立しており、一人暮らしで2階建てに住んでいた。\n右大腿骨頸部骨折で人工骨頭置換術を施行した。\n術後1日目 創部痛NRS6。「動くと痛い」と話し、車いす移乗は中止した。\n術後2日目 看護師の見守りで車いすに移乗できた。');
  app.buildCarePlansByRules(cp);
  const d = app.buildFocusDraft(cp, 4);
  const a = d.focusAnalysis;
  assert.ok(a.indexOf('入院前') >= 0 && (a.indexOf('術後1日目') < 0 || a.indexOf('入院前') < a.indexOf('術後1日目')));
  assert.ok(!/…/.test(a + d.focusIntegration + d.focusProblem));
  assert.ok(!d.focusIntegration.includes(a.split('\n')[0]));
  assert.doesNotMatch(a + d.focusIntegration, /継続した観察と援助が必要/);
});
