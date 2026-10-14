'use strict';
// Generalised textbook-derived rules: new care plan domains and the stroke relation-map recurrence path.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();

test('New care plan domains are chosen by the diagnosis head', () => {
  const key = p => (app.cpDomainOf({ problem: p }) || {}).key;
  assert.equal(key('非効果的脳組織灌流リスク状態'), 'perfusion');
  assert.equal(key('薬物療法に伴う副作用のリスク'), 'drugAE');
  assert.equal(key('腎機能低下に伴う電解質バランス異常リスク'), 'renal');
  assert.equal(key('自尊感情状況的低下'), 'selfesteem');
  assert.equal(key('感染リスク状態'), 'inf');
  assert.equal(key('便秘リスク状態'), 'const');
});

test('Every new domain has observations and a measurable goal', () => {
  ['perfusion', 'drugAE', 'renal', 'selfesteem'].forEach(k => {
    const d = app.CP_DOMAINS.find(x => x.key === k);
    assert.ok(d.op.length >= 4);
    assert.match(d.goal({}), /まで|入院中/);
  });
});

test('Relation map still builds for a stroke record with skipped anticoagulant doses', () => {
  const text = '診断：心原性脳塞栓症\n既往：心房細動\n抗凝固薬を飲み忘れることがあった。\n右片麻痺あり。';
  const rec = { id: 'p', title: 't', sourceText: text, items: app.classifyTextByRules(text).map((i, k) => ({ ...i, id: `i${k}` })), carePlans: {} };
  const map = app.buildRelationMapFromRecord(rec);
  assert.ok(map.nodes.length > 0);
});

test('Textbook supplement notes: acute BP target, knowledge deficit vs missed doses, PD domain', () => {
  const cp = text => ({ id: 'p', title: 't', sourceText: text, items: app.classifyTextByRules(text).map((i, k) => ({ ...i, id: `i${k}` })), carePlans: {} });
  const rec = cp('脳梗塞3日目。自力摂取可能。忙しいと抗凝固薬を飲み忘れることがあった。構音障害あり。');
  const n = app.carePlanInlineNotes(rec, { problem: '治療計画についての知識不足', goalShort: '血圧180/105mmHg以下を保つ', op: ['血圧'], tp: [], ep: [], evidence: [] });
  assert.ok(n.goal.some(m => /急性期/.test(m)));
  assert.ok(n.evidence.some(m => /知識不足/.test(m)));
  assert.equal((app.cpDomainOf({ problem: '腹膜透析のセルフケア不足' }) || {}).key, 'pd');
});

test('Drug side effect and PD plans get safety notes when key observations are missing', () => {
  const cp = { id: 'p', title: 't', sourceText: '分子標的薬を開始', items: [], carePlans: {} };
  const d = app.carePlanInlineNotes(cp, { problem: '薬物療法に伴う副作用のリスク', op: ['皮疹の観察'], tp: [], ep: [], evidence: [] });
  assert.ok(d.op.some(m => /間質性肺疾患/.test(m)));
  const pd = app.carePlanInlineNotes(cp, { problem: '腹膜透析のセルフケア不足', op: ['バッグ交換の手技'], tp: [], ep: [], evidence: [] });
  assert.ok(pd.op.some(m => /混濁/.test(m)));
});

test('OCR variants of negative infection screen get need 9', () => {
  const app = loadApp();
  for (const t of ['HCV抗体(一)', '梅毒(→)', 'HBV抗原（－）']) {
    const r = app.classifyTextByRules(t);
    assert.ok(r.some(c => (c.hendersonIds || []).includes(9)), t);
  }
  const n = app.classifyTextByRules('【病理結果】T2 NO PO HO MO Stage 1B');
  assert.ok(!n.some(c => (c.hendersonIds || []).includes(9)));
});

test('test-explanation memos are excluded generally, results are kept', () => {
  const app = loadApp();
  const un = t => app.classifyTextByRules(t).every(c => c.type === 'unnecessary');
  assert.ok(un('ホーマンズ：足を背屈させたとき'));
  assert.ok(un('ブルジンスキー徴候：頸部を前屈させたとき'));
  assert.ok(!un('ホーマンズ徴候(-)'));
  assert.ok(!un('ホーマンズ：足を背屈させたとき痛みあり'));
});

test('generic symptom enumerations are not patient evidence; patient sentences are kept', () => {
  const app = loadApp();
  const un = t => app.classifyTextByRules(t).every(c => c.type === 'unnecessary');
  assert.ok(un('全身倦怠感、疲れやすい、体重減少など、脱毛、光線過敏症、心膜'));
  assert.ok(un('胸の痛み、動悸、息切れ、(胸膜炎、心外膜炎)など、神経'));
  assert.ok(!un('疲労感が強く、最近は休みの日は寝て過ごしている、全身症状'));
  assert.ok(!un('頭痛、嘔気などあり'));
  assert.ok(!un('咳や痰などがみられる'));
});

test('non-surgical nutrition plan has no surgery/fasting template and no invented targets', () => {
  const app = loadApp();
  const m = app.cpModelFor({ problem: '栄養摂取量不足', title: '栄養摂取量不足' }, { text: '食事は外食が多い。疲労感が強い', surgical: false });
  if (!m) return;
  const all = [...(m.op || []), ...(m.tp || []), ...(m.ep || []), m.goalShort, m.goalLong].join('\n');
  assert.ok(!/絶飲食|食上げ|手術後|7割/.test(all));
});

test('worry statement alone is not unmet communication', () => {
  const app = loadApp();
  const r = app.sufficiencyCardVerdict && app.sufficiencyCardVerdict({ text: '精神面 : 仕事ができないことに不安。「また再燃したらどうしよう」と発言あり。', type: 's' }, 10, 'pre');
  if (r) assert.notEqual(r.v, 'unmet');
});

test('fatigue problem gets its own activity-rest plan; activity-intolerance stays in act', () => {
  const app = loadApp();
  const f = app.cpModelFor({ problem: '強い疲労感による生活への影響', title: '強い疲労感による生活への影響' }, { text: '', surgical: false });
  assert.ok(f && /休息/.test(f.goalShort));
  assert.ok(!/SpO2|絶飲食|手術/.test(JSON.stringify(f)));
  const a = app.cpModelFor({ problem: '活動耐性低下（息切れ・易疲労）', title: '活動耐性低下（息切れ・易疲労）' }, { text: '', surgical: false });
  assert.ok(!a || !/休息を取り入れた過ごし方/.test(JSON.stringify(a)));
});

test('immunosuppression infection risk without wounds does not use wound templates; fatigue-based activity intolerance uses the fatigue plan', () => {
  const app = loadApp();
  const text = 'プレドニゾロン増量、免疫抑制薬投与開始。WBC 3,000';
  const m = app.cpModelFor({ problem: '免疫抑制療法に関連した感染リスク', title: '免疫抑制療法に関連した感染リスク' }, { text, surgical: false, immunoOnly: true });
  assert.ok(m && /手洗い/.test(JSON.stringify(m)));
  assert.ok(!/傷|創部|刺入部|ドレーン/.test(JSON.stringify(m)));
  const a = app.cpModelFor({ problem: '疲労に関連した活動耐性の低下', title: '疲労に関連した活動耐性の低下' }, { text: '疲労感が強い。休みの日は寝て過ごす', surgical: false });
  assert.ok(a && /休息/.test(JSON.stringify(a)) && !/SpO2/.test(JSON.stringify(a)));
});

test('vital-sign and lab changes are merged into one regular "name a→b unit（time→time）" form', () => {
  const app = loadApp();
  const mk = (id, text, ts) => ({ id, type: 'o', text, timestamp: ts, hendersonIds: [7], assessmentCols: { 7: 'postadmission' } });
  const out = app.collapseVitalCards([mk('a', '体温 37.2°C、血圧 118/70mmHg', '術後1日目 8:00'), mk('b', 'SpO2 98%(室内気)', '術後1日目 8:00'), mk('c', '体温 37.0°C、SpO2 97%(酸素2L)', '術後1日目 10:00'), mk('d', '創部の発赤なし', '術後1日目 10:00')], 7);
  assert.equal(out.length, 2);
  assert.equal(out[0].text, '体温 37.2→37.0°C（8:00→10:00）／血圧 118/70mmHg（8:00）／SpO2 98%(室内気)→97%(酸素2L)（8:00→10:00）');
  assert.equal(app.collapseVitalCards([mk('a', '体温 37.2°C', '術後1日目 8:00'), mk('b', '体温 36.8°C', '術後2日目 8:00')], 7).length, 2);
  const lab = app.collapseLabCards([mk('a', 'WBC 11200 /μL (基準値: 4,000〜9,000 /μL)', '入院時'), mk('b', 'WBC 9800 /μL (基準値: 4,000〜9,000 /μL)', '術後1日目'), mk('c', 'WBC 5 g/dL', '術後2日目')], 7);
  assert.equal(lab[0].text, 'WBC 11200→9800 /μL（入院時→術後1日目）（基準値: 4,000〜9,000 /μL）');
  assert.equal(lab.length, 2);
});
