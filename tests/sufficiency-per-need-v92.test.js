const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();
const mk = (text, n, extra) => ({ id: 'p', title: 'T', sourceText: text, items: [Object.assign({ id: 'a', type: 'o', text, timestamp: '入院3日目', hendersonIds: [n], assessmentCols: { [n]: 'postadmission' } }, extra || {})], myAssessments: {}, carePlans: {}, missingChecks: {} });
const v = (text, n, extra) => app.ruleSufficiencyFor(mk(text, n, extra))[n].post.verdict;
const CASES = [
  // [need, 充足, 未充足, 情報不足(記録なし/無関係), 反例（未充足にしない）]
  [1, 'SpO2 97%、呼吸困難なし', '喘鳴を認め、努力呼吸あり', '本日は検査の予定がある', 'ラ音なし、呼吸困難なし'],
  [2, '食事は全量摂取。食欲良好', '食事は即席麺ばかりで、血糖が高い', '体重測定の予定', 'BMI 22、Alb 4.0'],
  [3, '排便は順調で、腹部膨満なし', '3日間便秘が続き、水分を控えている', '本日は説明を行った', '下痢なし、失禁なし'],
  [4, '端座位保持が安定している', '麻痺のため座位保持が困難', '家族が面会に来た', '体位変換は自力で可能'],
  [5, 'ぐっすり眠れ、睡眠7時間', '睡眠は3時間で、頻回に覚醒する', '本日は検査があった', '中途覚醒なし'],
  [6, '更衣は自分で可能', 'ボタン操作に介助が必要で、更衣が困難', '本日は検査があった', '着替えに介助は不要'],
  [7, '体温36.8℃、寒気なし', '体温38.2℃', '本日は説明を行った', '体温36.4℃'],
  [8, '入浴を実施し、皮膚に異常なし', '口腔内の不潔と舌苔あり', '本日は説明を行った', '皮膚の発赤なし'],
  [9, '転倒防止対策を実施。見当識は保たれている', 'せん妄があり、点滴ルートを自己抜去した', '家族が面会に来た', 'せん妄なし'],
  [10, '意思疎通は良好', '無反応で、意思疎通が困難', '本日は検査があった', '聴覚障害なし'],
  [11, '礼拝の習慣は支障なく守られている', '宗教上の理由で輸血を拒否している', '本日は説明を行った', '宗教の制限なし'],
  [12, '仕事に達成感を感じている', '仕事ができず、役割を失ったと感じる', '本日は説明を行った', '休職の不安はない'],
  [13, '趣味の園芸を続けて楽しんでいる', '趣味ができなくなり、退屈している', '本日は説明を行った', '退屈はしていない'],
  [14, '病状を理解して質問できる', '説明は全然わからなかったと話す', '本日は検査があった', '無関心ではない']
];
CASES.forEach(([n, met, unmet, unknown, counter]) => {
  test(`need ${n}: met / unmet / missing / counterexample`, () => {
    assert.strictEqual(v(met, n), 'met', 'met');
    assert.strictEqual(v(unmet, n), 'unmet', 'unmet');
    assert.strictEqual(v(unknown, n), 'unknown', 'missing -> 情報不足');
    assert.notStrictEqual(v(counter, n), 'unmet', 'counterexample');
  });
});

test('thresholds: normal values never unmet; boundary bands are 判定保留', () => {
  assert.strictEqual(v('体温37.4℃', 7), 'conflict');
  assert.strictEqual(v('体温37.0℃', 7), 'met');
  assert.strictEqual(v('体温37.8℃', 7), 'unmet');
  assert.strictEqual(v('BMI 27', 2), 'conflict');
  assert.strictEqual(Array.from(app.sufficiencyPerNeedRules('eGFR 75')).filter(x => x.v === 'unmet').length, 0);
  assert.strictEqual(Array.from(app.sufficiencyPerNeedRules('eGFR 40')).filter(x => x.v === 'unmet').length, 1);
});

test('respiration needs both gas exchange and comfortable breathing for met; SpO2 alone is not enough here', () => {
  assert.strictEqual(Array.from(app.sufficiencyPerNeedRules('SpO2 98%')).filter(x => x.v === 'met').length, 0);
  assert.strictEqual(Array.from(app.sufficiencyPerNeedRules('SpO2 98%、呼吸数16回')).filter(x => x.v === 'met').length, 1);
});

test('no verdict from disease name, age or comorbidity alone', () => {
  ['糖尿病で通院中', '高齢で認知症の既往', 'COPDの既往', '85歳女性、慢性腎臓病'].forEach(t => assert.strictEqual(Array.from(app.sufficiencyPerNeedRules(t)).length, 0, t));
});

test('unconscious with no speech observation: need 10 is not 未充足', () => {
  assert.notStrictEqual(v('JCS 300で昏睡。無反応', 10), 'unmet');
});

test('信仰: a plain wish about treatment is not evidence; explicit cues are', () => {
  assert.strictEqual(v('「納得して治療を受けたい」と話す', 11), 'unknown');
  assert.strictEqual(v('信仰上の理由で食事に制限がある', 11), 'unmet');
  assert.strictEqual(v('価値観を大切にしたいと話す', 11), 'unknown');
});

test('cause hints extended for the new rules', () => {
  assert.deepStrictEqual(Array.from(app.sufficiencyCauseHint('即席麺中心の偏り')), ['知識']);
  assert.ok(Array.from(app.sufficiencyCauseHint('学習意欲の低下')).includes('意思力'));
  assert.ok(Array.from(app.sufficiencyCauseHint('座位保持が困難')).includes('体力'));
});
