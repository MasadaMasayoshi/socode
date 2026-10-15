const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();
const cp = () => ({ id: 'p', items: [
  { id: 'a', type: 'o', text: '術後排便なし 腹部膨満あり', timestamp: '術後1日目', hendersonIds: [3], assessmentCols: { 3: 'postadmission' } },
  { id: 'b', type: 'o', text: '呼吸困難感訴えなし SpO2 98%', timestamp: '術後1日目', hendersonIds: [1], assessmentCols: { 1: 'postadmission' } }], myAssessments: {} });

test('judgement card: badge with icon and label, summary line first, grouped lists, details under 詳細', () => {
  const html = app.sufficiencyPhaseHtml(cp(), 3, 'postop');
  assert.match(html, /suf-badge suf-unmet"><i class="fa-solid [^"]+"><\/i> 未充足/, 'status is label + icon, not colour alone');
  assert.ok(html.indexOf('suf-sumline') < html.indexOf('suf-grp'), 'summary line comes before the lists');
  assert.match(html, /確認済み（根拠）[\s\S]*O-1（術後1日目：術後排便なし 腹部膨満あり）/);
  assert.match(html, /不足・気になる点[\s\S]*起こりうる合併症/);
  assert.match(html, /<details class="suf-detail"><summary>詳細<\/summary>[\s\S]*判定理由/);
  assert.match(html, /class="suf-evidence-chip"/);
});

test('met and unknown judgements use their own icon and lists', () => {
  const m = app.sufficiencyPhaseHtml(cp(), 1, 'postop');
  assert.match(m, /suf-badge suf-met"><i class="fa-solid fa-circle-check"><\/i> 充足/);
  assert.doesNotMatch(m, /不足・気になる点/);
  const u = app.sufficiencyPhaseHtml(cp(), 3, 'pre');
  assert.match(u, /suf-badge suf-unknown"><i class="fa-solid fa-circle-question"><\/i> 情報不足/);
  assert.match(u, /次に確認すること/);
});

test('header and mini views keep labels and show icons', () => {
  const head = app.sufficiencyHeaderHtml(cp(), 3);
  assert.match(head, /suf-hbody[\s\S]*suf-detail[\s\S]*suf-hwhy/);
  assert.match(app.sufficiencyMiniHtml(cp(), 3), /suf-mini-v"><i class="fa-solid [^"]+" aria-hidden="true"><\/i> 未充足/);
});

test('the displayed judgement and exported text are unchanged', () => {
  const c = cp();
  const before = JSON.stringify(c.items);
  app.sufficiencyPhaseHtml(c, 3, 'postop');
  assert.strictEqual(JSON.stringify(c.items), before);
  assert.match(app.sufficiencyPhaseText(c, 3, 'postop'), /^判定：未充足／判定根拠：O-1（術後1日目：術後排便なし 腹部膨満あり）により、排泄が現在は十分に満たされていない状態と判断し、未充足。/);
});
