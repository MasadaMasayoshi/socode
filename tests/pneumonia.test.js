'use strict';

//

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const app = loadApp();
const {
  detectDiagnosisTagHints,
  detectMultipleHendersonTags,
  PNEUMONIA_EXPECTED_CHECKS,
  detectPneumoniaMissingChecks
} = app;

test('肺炎の診断名からは、呼吸(1)・体温(7)・感染対策(9)を提案する（食事・睡眠・清潔は付けない。利用者からの指摘：患者34）', () => {
  ['市中肺炎', '院内肺炎', '医療介護関連肺炎', '医療・介護関連肺炎'].forEach(word => {
    const ids = Array.from(detectDiagnosisTagHints(word)).sort((a, b) => a - b);
    assert.deepEqual(ids, [1, 7, 9], `「${word}」`);
  });

  assert.deepEqual(Array.from(detectDiagnosisTagHints('誤嚥性肺炎')).sort((a, b) => a - b), [1, 2, 7, 9, 14]);
});

test('CAP・HAP・NHCAP・VAPの略称単体でも診断名パターンに一致する（単語境界で誤爆しない）', () => {
  assert.ok(detectDiagnosisTagHints('CAP疑い').includes(1));
  assert.ok(detectDiagnosisTagHints('HAP発症').includes(7));
  assert.ok(detectDiagnosisTagHints('NHCAPの診断').includes(9));
  assert.ok(detectDiagnosisTagHints('VAP予防').includes(1));

  const falsePositiveIds = detectDiagnosisTagHints('CAPTCHA認証');
  assert.ok(![1, 7, 9].every(id => falsePositiveIds.includes(id)), '「CAPTCHA認証」から肺炎のタグ一式が誤って提案されてはならない');
});

test('既存の汎用パターン（肺炎→呼吸のみ）は残っている（回帰確認）', () => {
  assert.ok(detectDiagnosisTagHints('肺炎').includes(1));
});

test('酸素療法デバイス・CO2ナルコーシス関連のキーワードから1(呼吸)タグが検出される', () => {
  ['鼻カニューレ2L/分で投与', '簡易酸素マスク使用中', 'ベンチュリマスクにて管理', 'HFNC装着', 'CO2ナルコーシスに注意', 'スクイージングを実施', '体位ドレナージを行った'].forEach(text => {
    assert.ok(detectMultipleHendersonTags(text).includes(1), `「${text}」から1(呼吸)が検出されるはず`);
  });
});

test('誤嚥・嚥下機能関連のキーワードから2(食事)タグが検出される', () => {
  ['食事中にむせがあり誤嚥を疑う', '嚥下調整食を提供', 'とろみをつけて水分を提供', 'RSSTを実施'].forEach(text => {
    assert.ok(detectMultipleHendersonTags(text).includes(2), `「${text}」から2(食事)が検出されるはず`);
  });
});

test('口腔ケアの具体的な手技から8(清潔)タグが検出される', () => {
  ['義歯ブラシでバイオフィルムを除去', '舌苔が付着している', '口腔乾燥が見られる'].forEach(text => {
    assert.ok(detectMultipleHendersonTags(text).includes(8), `「${text}」から8(清潔)が検出されるはず`);
  });
});

test('ワクチン接種の啓発関連の語から14(学び)タグが検出される', () => {
  assert.ok(detectMultipleHendersonTags('肺炎球菌ワクチン(PPSV23)の接種歴を確認').includes(14));
  assert.ok(detectMultipleHendersonTags('インフルエンザワクチンの接種を勧奨した').includes(14));
});

test('肺炎以外の患者では観察の不足チェックは行われない', () => {
  const items = [{ text: '診断名: 大腿骨頸部骨折' }, { text: '既往歴: 高血圧症' }];
  assert.equal(detectPneumoniaMissingChecks(items).length, 0);
});

test('肺炎患者で記録が一切無ければ全項目が不足情報として検出される', () => {
  const items = [{ text: '診断名: 市中肺炎の疑い' }];
  const missing = detectPneumoniaMissingChecks(items);
  assert.equal(missing.length, PNEUMONIA_EXPECTED_CHECKS.length);
});

test('酸素療法・口腔ケアが記録済みなら、それぞれの不足チェックから除外される', () => {
  const items = [
    { text: '診断名: 市中肺炎の疑い' },
    { text: '鼻カニューレ2L/分でSpO2 95%を維持。' },
    { text: '毎食後に義歯ブラシで口腔ケアを実施。' }
  ];
  const missing = detectPneumoniaMissingChecks(items);
  assert.ok(!missing.some(c => c.keywords.includes('SpO2')), '酸素療法の記録があるため対象から除外される');
  assert.ok(!missing.some(c => c.keywords.includes('口腔ケア')), '口腔ケアの記録があるため対象から除外される');
  assert.ok(missing.some(c => c.keywords.includes('誤嚥')), '記録の無い嚥下機能評価のチェックは引き続き提案される');
  assert.ok(missing.some(c => c.keywords.includes('体温')));
  assert.ok(missing.some(c => c.keywords.includes('肺炎球菌ワクチン')));
});
