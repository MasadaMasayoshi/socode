'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
let n = 0;
const mk = (text, need, extra) => ({ id: 'c' + (n++), type: 'o', text, timestamp: '入院2日目', hendersonIds: [need], assessmentCols: { [need]: 'postadmission' }, ...(extra || {}) });
const cpOf = (items, src) => ({ id: 'p', items, sourceText: src || '', myAssessments: {}, carePlans: {} });
const verdict = (text, need, src) => { const cp = cpOf([mk(text, need)], src); const r = app.ruleSufficiencyFor(cp)[need]; return r && r.post && r.post.verdict; };

test('否定の範囲：「吐き気はないが食事は摂れていない」は摂取不足（未充足）', () => {
  assert.equal(verdict('吐き気はないが食事は摂れていない', 2), 'unmet');
});
test('機能障害を含む文は良好にしない：「かゆみが強く眠れない」は睡眠が未充足', () => {
  assert.equal(verdict('かゆみが強く眠れない', 5), 'unmet');
});
test('「普段はよく眠れている」は睡眠の基準状態を支える根拠', () => {
  assert.equal(verdict('普段はよく眠れている', 5), 'met');
});
test('頭痛は、コミュニケーション・余暇・安全の判定を自動では作らない', () => {
  [10, 13, 9].forEach(k => { assert.notEqual(verdict('頭痛あり', k), 'unmet'); assert.notEqual(verdict('頭痛あり', k), 'met'); });
  assert.ok(!app.detectMultipleHendersonTags('頭痛あり').some(x => [9, 10, 13].includes(x)));
});
test('発熱・経口摂取量低下・尿量減少：脱水の可能性を観察対象にするが、診断として断定しない', () => {
  const cp = cpOf([mk('発熱、経口摂取量低下、尿量少ない', 2)]);
  assert.equal(app.ruleSufficiencyFor(cp)[2].post.verdict, 'unmet');
  const d = app.sufficiencyDimensions(cp, 2, 'post');
  assert.match(d.complications, /脱水/);
  assert.match(d.complications, /確定ではなく/);
  assert.ok(!/脱水症と診断|脱水である/.test(d.complications));
});
test('合併症候補は診断・症状から導く：川崎病に術後の合併症（イレウス・創部感染・褥瘡）を出さない／術後なら出す', () => {
  const kw = cpOf([mk('川崎病の疑いで入院。発熱が続き、食事は摂れていない', 2), mk('全身に発疹、口唇の発赤', 8)], '川崎病の疑いで入院');
  const all = [1, 2, 3, 4, 7, 8].map(k => app.complicationCandidates(kw, k, kw.items.map(i => i.text).join(' ')).join('、')).join('、');
  assert.match(all, /冠動脈|脱水|皮膚・粘膜/);
  assert.ok(!/イレウス|創部感染|縫合不全|褥瘡|無気肺|術後/.test(all), all);
  const po = cpOf([mk('胃切除術後2日目。創部ガーゼ少量滲出', 7)], '胃切除術後');
  assert.match(app.complicationCandidates(po, 7, '創部ガーゼ少量滲出').join('、'), /創部感染/);
});
test('検査値：換算後の値と単位が対になり、原値は別に残る／小児では成人基準で高低を言わない', () => {
  const src = '患者：Cちゃん（5歳、女児）。川崎病の疑いで入院。\n白血球　173×10²/mm³';
  const cp = cpOf([mk('白血球　173×10²/mm³', 11)], src);
  const lab = app.buildLabAssessment(cp).labs.find(l => l.key === 'WBC');
  assert.equal(lab.value, 17300); assert.equal(lab.unit, '/μL'); assert.equal(lab.originalValue, 173); assert.equal(lab.valueRaw, '173');
  assert.equal(lab.status, 'unknown');
});
