const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();
const rules = t => Array.from(app.sufficiencyPerNeedRules(t)).map(x => `${x.need}:${x.v}`);
const has = (t, k) => assert.ok(rules(t).includes(k), `${t} -> ${rules(t)}`);
const none = (t, n) => assert.ok(!rules(t).some(x => x.startsWith(n + ':')), `${t} -> ${rules(t)}`);
const card = (id, text, n, o) => Object.assign({ id, type: 'o', text, timestamp: '入院3日目', hendersonIds: [n], assessmentCols: { [n]: 'postadmission' } }, o || {});
const cpOf = (items, src) => ({ id: 'p', title: 'T', sourceText: src, items, myAssessments: {}, carePlans: {}, missingChecks: {} });
const flat = c => { const a = []; c.byKey.forEach(l => Array.from(l).forEach(x => a.push(x))); return a; };

test('v97 cues: recorded observations are read, with counterexamples', () => {
  has('食事は3割摂取', '2:unmet'); has('むせ込みあり', '2:unmet'); has('食事は8割摂取', '2:met');
  none('食事は13割摂取', 2); none('むせなし', 2);
  has('排尿時痛あり', '3:unmet'); none('排尿時痛なし', 3); has('最終排便は4日前', '3:unmet'); none('最終排便は1日前', 3); has('普通便あり', '3:met');
  has('病棟内の移動は一部介助', '4:unmet'); has('歩行は自立', '4:met'); none('歩行は自立していない', 4);
  has('夜間2回目が覚めた', '5:unmet'); assert.ok(!rules('睡眠: 7時間程度、現在は痛みのため眠れていない').includes('5:unmet')); none('夜間1回覚醒（排尿のため）', 5); has('5時間連続で入眠できた', '5:met'); none('3時間連続で入眠できた', 5);
  has('両肺に水泡音を聴取', '1:unmet'); none('水泡音は聴取されない', 1);
  has('口腔内乾燥あり', '8:unmet'); none('ガーゼ汚染なし', 8); has('皮膚トラブルは見られず', '8:met');
});

test('v97 cues: patient speech alone never gives a 充足; names/disease words alone give nothing', () => {
  none('「昨日はよく眠れた」', 5); none('「歩行は自立している」', 4);
  assert.strictEqual(rules('糖尿病').length, 0);
});

test('v97 candidates: time prefix stripped, one sentence under at most 2 needs, same-direction support not listed', () => {
  const src = '14:00 夜間2回目が覚め、眠りが浅いと話す。\n・夜間に血圧が高く、咳が出て食事を残した。';
  const flatList = flat(app.sufficiencySourceCandidates(cpOf([card('a', '夜間2回目が覚め、眠りが浅いと話す。', 5, { type: 's' })], src)));
  assert.ok(flatList.every(x => !/^\d{1,2}[:：]\d{2}/.test(x.text) && !/^[・〇]/.test(x.text)));
  const bySentence = {};
  flatList.forEach(x => { bySentence[x.text] = (bySentence[x.text] || 0) + 1; });
  assert.ok(Object.values(bySentence).every(n => n <= 2));
  // cited sentence is never listed for its own need; an extra sentence pointing the same way as the verdict is not a gap
  const items = [card('a', '食事は3割摂取', 2), card('b', '食事量は4割程度で経過', 2)];
  const l2 = flat(app.sufficiencySourceCandidates(cpOf(items, '食事は3割摂取。食事量は4割程度で経過。')));
  assert.ok(!l2.some(x => /^2\./.test(x.need)));
});

test('v97 verdict sentences stay frozen in shape (definite ending) with the new cues', () => {
  const items = [card('a', '夜間2回目が覚め、眠りが浅い。', 5), card('b', '食事は3割摂取。', 2)];
  const cp = cpOf(items, '');
  for (const n of [2, 5]) {
    const t = String(app.sufficiencyPhaseText(cp, n, 'post'));
    assert.match(t, /^判定：未充足／判定根拠：/);
    assert.match(t.replace(/[。\s]+$/, ''), /(充足している|未充足である|判定保留|情報不足)$/);
  }
});

test('v97 notebook revision 18 mentions the added criteria', () => {
  assert.match(String(app.NOTEBOOK_CONTENT_VERSION_MARK || app.DEFAULT_NOTEBOOK_CONTENT || ''), /改訂18/);
});
