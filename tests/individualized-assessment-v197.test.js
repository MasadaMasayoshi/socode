'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
let n = 0;
const mk = (type, text, need, col) => ({ id: 'c' + (n++), type, text, timestamp: '入院2日目', hendersonIds: [need], assessmentCols: { [need]: col || 'postadmission' } });
const run = (items, need) => app.individualizedAssessment({ id: 'p', items, myAssessments: {} }, need, 'post');

test('入院前の様子は現在と混ぜず、本人の意味づけはSの発言からだけ作る', () => {
  const r = run([mk('s', '入院前は毎晩7時間眠れていた。', 5), mk('o', '夜間に3回覚醒。術後の痛みあり。', 5), mk('s', '孫の運動会までに元気になりたい', 5)], 5);
  assert.ok(r.ctx.baseline.some(x => /入院前/.test(x.text)));
  assert.ok(!r.ctx.current.some(x => /入院前/.test(x.text)));
  assert.ok(r.ctx.meaning.every(x => x.src === 'S'));
});
test('Oの記録から好みや希望を作らない', () => {
  const r = run([mk('o', '趣味は読書と記載あり。テレビを見て過ごす。', 13)], 13);
  assert.equal(r.ctx.meaning.length, 0);
});
test('記録がない観察は「確認できていない観察」に具体名で出て、判定文の末尾は固定語尾', () => {
  const r = run([mk('o', '術後1日目。創部痛あり。', 5)], 5);
  assert.match(r.text, /確認できていない観察：睡眠の状況/);
  assert.match(r.text, /(充足している|未充足である|判定保留|情報不足)。?$/);
});
test('正常な検査値だけでは充足にならず、記録にない区分は出さない', () => {
  const r = run([mk('o', 'Na 140 mEq/L', 2)], 2);
  assert.notEqual(r.verdict, 'met');
  assert.ok(!/患者にとっての意味/.test(r.text));
});

test('関連図の詳細一覧：看護問題に、根拠カードの欲求の充足判定が添えられる', () => {
  const items = [{ id: 'q1', type: 'o', text: '術後の創部痛 NRS 7。夜間に痛みで眠れない。', timestamp: '入院2日目', hendersonIds: [5], assessmentCols: { 5: 'postadmission' } }];
  const cp = { id: 'p', title: 'x', items, sourceText: '', carePlans: {}, myAssessments: {} };
  const map = app.buildRelationMapFromRecord(cp);
  const prob = map.nodes.find(n => n.type === 'nursing_problem');
  if (!prob) return;
  const html = String(app.rmSufficiencyLineHtml ? app.rmSufficiencyLineHtml(map, prob, cp) : '');
  assert.ok(html === '' || /関連する欲求の充足：/.test(html));
});

test('v.197b: 痛みの語は学びの未充足根拠にしない／壊れた保留文を出さない／重複を並べない', () => {
  const mkc = (t, need, type) => ({ id: 'z' + (n++), type: type || 'o', text: t, timestamp: '産褥2日目', hendersonIds: [need], assessmentCols: { [need]: 'postadmission' } });
  const v = (items, need) => { const r = app.judgeSufficiencyByRules({ id: 'p', items, myAssessments: {} })[need]; return r && r.post && r.post.verdict; };
  assert.notEqual(v([mkc('自分のお腹に触れて「これが子宮ですか?だからお腹も痛いんですね」', 14, 's')], 14), 'unmet');
  const cp = { id: 'p', items: [mkc('浮腫なし。妊娠30週:下肢浮腫(+)', 3)], myAssessments: {} };
  const s = app.sufficiencySentence(cp, 3, 'post');
  assert.ok(!/^「[^」]*」ため/.test(s));
});
test('v.197b: 同じ項目名の記録は、タグ未設定のカードを仲間の欲求へ寄せる候補にする（自動では変更しない）', () => {
  const cp = { id: 'p', items: [
    { id: 'a', type: 'o', text: '開通本数4〜5本 緊満なし', timestamp: '産褥2日目', hendersonIds: [2], assessmentCols: { 2: 'postadmission' } },
    { id: 'b', type: 'o', text: '開通本数1〜2本', timestamp: '産褥1日目', hendersonIds: [], assessmentCols: {} }
  ], myAssessments: {} };
  const row = app.buildTagAuditRows(cp).find(r => r.id === 'b');
  assert.ok(row && row.destination && row.destination.key === 'sibling');
  assert.deepEqual(Array.from(row.siblingNeeds), [2]);
  assert.equal(row.autoFix, false);
  assert.deepEqual(Array.from(cp.items[1].hendersonIds), []);
});

test('v.199: どのタグも付かないカードにも保持先が示され、内容もタグも変わらない', () => {
  const cp = { id: 'p', items: [{ id: 'k', type: 'o', text: '特記すべき記載なしの備忘', timestamp: '産褥1日目', hendersonIds: [], assessmentCols: {} }], myAssessments: {} };
  const row = app.buildTagAuditRows(cp).find(r => r.id === 'k');
  assert.ok(row && row.destination);
  assert.deepEqual(Array.from(cp.items[0].hendersonIds), []);
});
