const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();
const rules = t => Array.from(app.sufficiencyPerNeedRules(t)).map(x => `${x.need}:${x.v}`);
const rowsFor = t => app.CARE_PLAN_KNOWLEDGE.filter(r => r.re.test(t)).map(r => r.key);
const card = (id, text, n) => ({ id, type: 'o', text, timestamp: '入院3日目', hendersonIds: [n], assessmentCols: { [n]: 'postadmission' } });
const cpOf = items => ({ id: 'p', title: 'T', sourceText: '', items, myAssessments: {}, carePlans: {}, missingChecks: {} });

test('nine knowledge rows carry scope, provenance, edition and review dates; sourceless topics are labelled', () => {
  const rows = Array.from(app.CPK_ROWS_100);
  assert.strictEqual(rows.length, 9);
  rows.forEach(r => { assert.ok(r.scope && r.checked && r.next && r.edition); assert.ok(r.source.some(s => /出典未確認/.test(s))); assert.ok(r.op.length && r.tp.length && r.ep.length); });
  ['diagnosis-explained', 'home-therapy', 'smbg'].forEach(k => assert.ok(rows.find(r => r.key === k).source.length === 1)); // provenance label only
  assert.match(rows.find(r => r.key === 'dka').scope, /HHS/);
  assert.match(rows.find(r => r.key === 'insulin-therapy').scope, /インスリン療法を行っているときのみ/);
});

test('applicability limits: acute otitis media only; DKA not HHS; insulin only when insulin is recorded', () => {
  assert.ok(rowsFor('急性中耳炎で耳痛あり').includes('otitis-media-acute'));
  ['滲出性中耳炎', '慢性中耳炎', '外耳炎', '内耳炎'].forEach(t => assert.ok(!rowsFor(t).includes('otitis-media-acute'), t));
  assert.ok(rowsFor('ケトアシドーシスの疑い').includes('dka')); assert.ok(!rowsFor('高血糖高浸透圧症候群').includes('dka'));
  assert.ok(!rowsFor('経口血糖降下薬のみで管理している2型糖尿病').includes('insulin-therapy'));
  assert.ok(rowsFor('インスリン自己注射を指導').includes('insulin-injection-technique'));
  assert.ok(!rowsFor('筋肉注射を実施').includes('insulin-injection-technique'));
  assert.ok(rowsFor('嘔吐下痢症の疑い').includes('viral-gastroenteritis'));
});

test('sufficiency: a disease name alone gives no finding; recorded observations do (no thresholds added)', () => {
  ['嘔吐下痢症の診断', '診断名：糖尿病性ケトアシドーシス', '急性中耳炎', '1型糖尿病でインスリン療法中', '在宅療法を予定'].forEach(t => assert.strictEqual(rules(t).length, 0, t));
  assert.ok(rules('クスマウル呼吸あり').includes('1:unmet')); assert.ok(rules('皮膚乾燥と眼球陥凹あり').includes('3:unmet'));
  assert.ok(rules('尿ケトン体陽性').includes('9:unmet')); assert.ok(rules('難聴の訴えあり').includes('10:unmet'));
  assert.ok(rules('注射針の使い回しがあった').includes('14:unmet')); assert.ok(rules('診断名を理解できていない').includes('14:unmet'));
  assert.ok(rules('診断名を理解している').includes('14:met'));
  assert.ok(!rules('難聴なし').includes('10:unmet')); assert.ok(!rules('診断名を受け入れられない').includes('14:met'));
});

test('symptom words (not disease names) tag; the knowledge OP appears as 確認したい情報 for a need without a verdict', () => {
  const t = app.DISEASE_SYMPTOM_NEEDS.map(([re, ids]) => [re, ids]);
  const hit = w => t.filter(([re]) => re.test(w)).flatMap(([, ids]) => Array.from(ids));
  assert.ok(hit('アセトン臭').includes(9)); assert.ok(hit('耳漏').includes(9)); assert.strictEqual(hit('急性中耳炎').length, 0);
  const cp = cpOf([card('a', '血糖自己測定の指導を行った。', 14)]);
  const line = app.sufficiencyKnowledgeLine(cp, 14, 'post');
  assert.ok(typeof line === 'string');
});

test('bridge rules are conditional and exist for the chains in the source; none for 診断名 / 在宅療法', () => {
  const find = (s, t) => app.RM_BRIDGE_RULES.some(r => r.s.test(s) && r.t.test(t));
  assert.ok(find('上気道感染', '中耳炎')); assert.ok(find('注射針の使い回し', '低血糖')); assert.ok(find('インスリン不足', 'ケトアシドーシス'));
  assert.ok(find('ケトアシドーシス', '脱水'));
  assert.ok(!app.RM_BRIDGE_RULES.some(r => /診断名|在宅療法/.test(r.s.source)));
  assert.ok(app.RM_BRIDGE_RULES.filter(r => /ことがある/.test(r.step || '')).length >= 6);
});

test('notebook revision is bumped and states the scopes; the research note is saved', () => {
  assert.match(app.NOTEBOOK_CONTENT_VERSION_MARK, /改訂2\d$/);
  assert.match(app.DEFAULT_NOTEBOOK_CONTENT, /適用範囲を守る/);
  assert.ok(require('fs').existsSync(require('path').join(__dirname, '..', 'docs', 'research-notes', '2026-10-16-insulin-diabetes.md')));
});
