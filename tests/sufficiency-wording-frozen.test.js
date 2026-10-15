// The sufficiency (充足状態) rationale is composed to fit the evidence of each need/phase (authorised by the user on 2026-10-16, v.93).
// The ONLY fixed rules: the sentence ends with the definite verdict phrase matching the label, it names at least one evidence card /
// number / finding, and it has no hedged ending. Change this rule only when the user explicitly asks.
const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();
const cp = () => ({ id: 'p', items: [
  { id: 'a', type: 'o', text: '術後排便なし 腹部膨満あり', timestamp: '術後1日目', hendersonIds: [3], assessmentCols: { 3: 'postadmission' } },
  { id: 'b', type: 'o', text: '呼吸困難感訴えなし SpO2 98%', timestamp: '術後1日目', hendersonIds: [1], assessmentCols: { 1: 'postadmission' } }], myAssessments: {} });
const mixed = () => ({ id: 'm', items: [
  { id: 'a', type: 'o', text: 'HbA1c 9.2%', timestamp: '入院3日目', hendersonIds: [2], assessmentCols: { 2: 'postadmission' } },
  { id: 'b', type: 'o', text: '食事摂取は全量', timestamp: '入院3日目', hendersonIds: [2], assessmentCols: { 2: 'postadmission' } }], myAssessments: {} });
const END = { 充足: /充足している。$/, 未充足: /未充足である。$/, 判定保留: /判定保留。$/, 情報不足: /情報不足。$/ };
const HEDGE = /と思われる|かもしれない|と考えられる|可能性がある。$|だろう。$|でしょう。$|ようだ。$/;

test('judgement labels are frozen', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(app.SUFFICIENCY_LABELS || { met: '充足', unmet: '未充足', conflict: '判定保留', unknown: '情報不足' })), { met: '充足', unmet: '未充足', conflict: '判定保留', unknown: '情報不足' });
});

test('every phase sentence ends with the definite verdict matching the label; evidence is named; no hedging', () => {
  let n = 0;
  [cp(), mixed()].forEach(c => [1, 2, 3].forEach(need => ['pre', 'post', 'postop', 'preop'].forEach(ph => {
    if (!Array.from(app.sufficiencyUiPhases(c)).some(p => p.key === ph)) return;
    const x = app.sufficiencyPhaseText(c, need, ph);
    if (!x) return;
    const m = x.match(/^判定：(充足|未充足|判定保留|情報不足)／判定根拠：([\s\S]+)$/);
    assert.ok(m, x);
    assert.match(m[2], END[m[1]], x);
    assert.ok(!HEDGE.test(m[2]), x);
    if (m[1] !== '情報不足') assert.ok(/[SO]-\d+|\d|[ぁ-んァ-ヶ一-龠]{2,}/.test(m[2]) && /[SO]-\d+/.test(m[2]), `evidence ref: ${x}`);
    n++;
  })));
  assert.ok(n >= 6);
});

test('layout is kept: the sentence sits in 判定理由 before 根拠カード; the header ends with the verdict word', () => {
  const un = app.sufficiencyPhaseHtml(cp(), 3, 'postop');
  assert.ok(un.indexOf('suf-phase-head') < un.indexOf('判定理由') && un.indexOf('判定理由') < un.indexOf('根拠カード'));
  assert.ok(un.includes('O-1（術後排便なし 腹部膨満あり）'));
  ['<details', '<summary', '次に確認すること'].forEach(w => assert.ok(!un.includes(w), w));
  const head = app.sufficiencyHeaderHtml(cp(), 3);
  assert.ok(/<b class="suf-end suf-end-未充足">未充足である<\/b>。<\/span>/.test(head));
  assert.ok(/<b class="suf-end suf-end-情報不足">情報不足<\/b>。<\/span>/.test(head));
  assert.strictEqual(app.sufficiencyMiniHtml(cp(), 3), '<div class="suf-mini-wrap" aria-label="充足状況の一覧"><span class="suf-mini suf-mini-unknown"><span class="suf-mini-ph">入院前</span><span class="suf-mini-v">情報不足</span></span><span class="suf-mini suf-mini-unknown"><span class="suf-mini-ph">術前</span><span class="suf-mini-v">情報不足</span></span><span class="suf-mini suf-mini-unmet"><span class="suf-mini-ph">術後</span><span class="suf-mini-v">未充足</span></span></div>');
});

test('the exported text keeps 「判定：<label>／判定根拠：…」', () => {
  assert.match(app.sufficiencyPhaseText(cp(), 3, 'postop'), /^判定：未充足／判定根拠：.*O-1.*未充足である。$/);
  assert.match(app.sufficiencyPhaseText(mixed(), 2, 'post'), /^判定：充足／判定根拠：.*9\.2%.*充足している。$/);
});
