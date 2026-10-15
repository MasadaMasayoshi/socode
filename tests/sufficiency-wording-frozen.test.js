// The wording and structure of the sufficiency (充足状態) texts are frozen. Change them only when the user explicitly asks.
const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();
const cp = () => ({ id: 'p', items: [
  { id: 'a', type: 'o', text: '術後排便なし 腹部膨満あり', timestamp: '術後1日目', hendersonIds: [3], assessmentCols: { 3: 'postadmission' } },
  { id: 'b', type: 'o', text: '呼吸困難感訴えなし SpO2 98%', timestamp: '術後1日目', hendersonIds: [1], assessmentCols: { 1: 'postadmission' } }], myAssessments: {} });

test('judgement labels are frozen', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(app.SUFFICIENCY_LABELS || { met: '充足', unmet: '未充足', conflict: '判定保留', unknown: '情報不足' })), { met: '充足', unmet: '未充足', conflict: '判定保留', unknown: '情報不足' });
});

test('phase block: same sentences, same order, no added summary or group titles', () => {
  const un = app.sufficiencyPhaseHtml(cp(), 3, 'postop');
  assert.ok(un.includes('<span class="suf-reason-label">判定理由</span><p>O-1（術後1日目：術後排便なし 腹部膨満あり）により、排泄が現在は十分に満たされていない状態と判断し、未充足。（起こりうる合併症：便秘・尿閉・腸閉塞（イレウス）。確定ではなく、予防のための観察対象）</p>'));
  assert.ok(un.indexOf('suf-phase-head') < un.indexOf('判定理由') && un.indexOf('判定理由') < un.indexOf('根拠カード'));
  assert.ok(app.sufficiencyPhaseHtml(cp(), 3, 'pre').includes('<p>入院前の記録がないため、情報不足。</p>'));
  assert.ok(app.sufficiencyPhaseHtml(cp(), 1, 'postop').includes('<p>O-1（術後1日目：呼吸困難感訴えなし SpO2 98%）。呼吸状態を保てていると判断し、充足。</p>'));
  ['記録から、保たれていると判断', '確認済み（根拠）', '不足・気になる点', '次に確認すること', '<details', '<summary'].forEach(w => assert.ok(!un.includes(w), w));
});

test('header and mini views: same wording and structure', () => {
  const head = app.sufficiencyHeaderHtml(cp(), 3);
  assert.ok(head.includes('<span class="suf-hwhy">入院前の記録がないため、<b class="suf-end suf-end-情報不足">情報不足</b>。</span>'));
  assert.ok(head.includes('により、排泄が現在は十分に満たされていない状態と判断し、未充足。（起こりうる合併症：便秘・尿閉・腸閉塞（イレウス）。確定ではなく、予防のための観察対象）'));
  assert.ok(!head.includes('suf-hbody') && !head.includes('<details'));
  assert.strictEqual(app.sufficiencyMiniHtml(cp(), 3), '<div class="suf-mini-wrap" aria-label="充足状況の一覧"><span class="suf-mini suf-mini-unknown"><span class="suf-mini-ph">入院前</span><span class="suf-mini-v">情報不足</span></span><span class="suf-mini suf-mini-unknown"><span class="suf-mini-ph">術前</span><span class="suf-mini-v">情報不足</span></span><span class="suf-mini suf-mini-unmet"><span class="suf-mini-ph">術後</span><span class="suf-mini-v">未充足</span></span></div>');
});

test('exported sufficiency text is frozen', () => {
  assert.strictEqual(app.sufficiencyPhaseText(cp(), 3, 'postop'), '判定：未充足／判定根拠：O-1（術後1日目：術後排便なし 腹部膨満あり）により、排泄が現在は十分に満たされていない状態と判断し、未充足。（起こりうる合併症：便秘・尿閉・腸閉塞（イレウス）。確定ではなく、予防のための観察対象）');
});
