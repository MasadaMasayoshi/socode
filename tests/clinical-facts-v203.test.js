'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const cp = items => ({ id: 'p', items: items.map((t, k) => ({ id: 'c' + k, type: 'o', text: t[0], timestamp: t[1] || '', hendersonIds: [] })), sourceText: '', myAssessments: {} });

test('構造化事実：原文・出典ID・範囲を保ち、未知の値は未知のまま（作り上げない）', () => {
  const c = cp([['腹痛なし。食事は半分摂取。', '']]);
  const f = app.buildClinicalFacts(c).facts;
  assert.equal(f.length, 2); assert.equal(f[0].sourceId, 'c0'); assert.equal(f[0].original, '腹痛なし。');
  assert.equal(f[0].eventTime, null); assert.equal(f[0].documentationTime, null); assert.equal(f[0].phase, 'unknown');
  assert.ok(Array.from(f[0].negated).some(x => /腹痛/.test(x)));
  assert.equal(c.items[0].text, '腹痛なし。食事は半分摂取。'); // 元のカードは変わらない
});
test('時系列：「入院3日目に症状が消失」は入院時の所見にしない／産科の妊娠中の検査値を産後としない／術前検査は術後指示で日付が変わらない', () => {
  assert.equal(app.cfPhaseOf('入院3日目に症状が消失した', '入院時', []).phase, 'recovery');
  assert.equal(app.cfPhaseOf('妊娠32週のHb 10.2', '産褥1日目', ['obstetric']).phase, 'pregnancy');
  assert.equal(app.cfPhaseOf('術前検査：Hb 12.0', '術後1日目', ['surgical']).phase, 'preoperative');
  const f = app.buildClinicalFacts(cp([['入院3日目に解熱した', '入院1日目']])).facts[0];
  assert.equal(f.timeConflict, true);
});
test('話者：家族の発言と母体・新生児を分ける', () => {
  const f = app.buildClinicalFacts(cp([['母親：「心配で眠れない」', ''], ['新生児：哺乳は良好', '産褥2日目'], ['子宮の硬さ良好', '産褥2日目']])).facts;
  assert.equal(f[0].subject, 'family'); assert.equal(f[1].subject, 'newborn'); assert.equal(f[2].subject, 'patient');
});
test('カード分割の提案：発言者の境界だけで分け、全文を保ち、編集済みカードに触れず、元に戻せる', () => {
  const c = cp([['母：「元気がない」父：「食べない」', '']]);
  const prop = Array.from(app.proposeCardSplits(c));
  assert.equal(prop.length, 1); assert.equal(prop[0].parts.map(p => p.text).join(''), c.items[0].text);
  const r = app.applyCardSplit(c, prop[0]); assert.ok(r.applied); assert.equal(c.items.length, 3); assert.ok(c.items[0].autoSplit);
  assert.ok(app.revertCardChange(c, r.logId).reverted); assert.equal(c.items.length, 1); assert.equal(c.items[0].autoSplit, undefined);
  const e = cp([['母：「元気がない」父：「食べない」', '']]); e.items[0].editLog = [{ at: 1 }];
  assert.equal(app.proposeCardSplits(e).length, 0);
});
test('出力の整合監査：記録にない診断・手術のない記録の術後文言・小児の産科文言を保留し、原本は変えない', () => {
  const c = cp([['患者：Cちゃん（5歳）。発熱あり', '']]);
  const out = app.auditedOutput(c, '川崎病の可能性。\n創部感染に注意する。\n発熱を観察する。');
  assert.match(out.text, /【保留】/); assert.match(out.text, /発熱を観察する。/);
  assert.ok(Array.from(out.audit.withheld).includes('unsupported_diagnosis'));
  assert.equal(c.items[0].text, '患者：Cちゃん（5歳）。発熱あり');
});
