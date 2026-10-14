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
