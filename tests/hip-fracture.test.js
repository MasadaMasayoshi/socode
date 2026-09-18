'use strict';
// 大腿骨近位部骨折（頸部骨折・転子部骨折／人工骨頭置換術BHA・骨接合術）の周術期看護資料の
// 組み込みに関する検証。
//
// 【背景】利用者からアップロードいただいた「大腿骨近位部骨折の解剖・基礎知識・周術期看護」の
// 資料を、既存の胃がん周術期看護資料と同じパターンで組み込んだ：
// ①DEFAULT_NOTEBOOK_CONTENTに詳細な判断基準を追記（AI経由の分類・アセスメント・看護計画で参照）
// ②DIAGNOSIS_TAG_HINTSに大腿骨近位部骨折の診断名パターンを追加（初期タグ提案を広げる）
// ③HENDERSON_NEEDSのキーワードに脱臼予防・DVT予防装具・せん妄タイプ等の語を追加
//   （キーワードベースのローカル分類でも検出できるようにする）
// ④HIP_FRACTURE_POSTOP_EXPECTED_CHECKS・detectHipFracturePostopMissingChecksを追加
//   （「不足情報をAI推定」のAPIキー未設定時のローカル簡易ルールでも、代表的な術後観察項目の
//   欠落を検出できるようにする。既存のGASTRIC_POSTOP_EXPECTED_CHECKSと同じ設計）。

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const app = loadApp();
const {
  detectDiagnosisTagHints,
  detectMultipleHendersonTags,
  HIP_FRACTURE_POSTOP_EXPECTED_CHECKS,
  detectHipFracturePostopMissingChecks
} = app;

test('大腿骨近位部骨折・頸部骨折・転子部骨折・BHA・THAの診断名から初期タグが広く提案される', () => {
  ['大腿骨近位部骨折', '大腿骨頸部骨折', '大腿骨転子部骨折', '人工骨頭置換術', '人工股関節全置換術'].forEach(word => {
    const ids = detectDiagnosisTagHints(word);
    [1, 3, 4, 9, 10, 14].forEach(id => assert.ok(ids.includes(id), `「${word}」から${id}が提案されるはず`));
  });
});

test('BHA・THAの略称単体でも診断名パターンに一致する（単語境界で誤爆しない）', () => {
  assert.ok(detectDiagnosisTagHints('BHA施行後').includes(4));
  assert.ok(detectDiagnosisTagHints('THAの適応').includes(4));
  // 前後に英字が続く別の単語の一部としては一致しない（\bによる誤爆防止）
  assert.equal(detectDiagnosisTagHints('ALPHA値を確認').length, 0);
});

test('脱臼予防（禁忌肢位）関連のキーワードから4(姿勢)タグが検出される', () => {
  ['外転枕を使用し良肢位を保持', '禁忌肢位（屈曲・内転・内旋）を説明', '術後の脱臼に注意', '人工骨頭置換術後'].forEach(text => {
    assert.ok(detectMultipleHendersonTags(text).includes(4), `「${text}」から4(姿勢)が検出されるはず`);
  });
});

test('DVT予防の装具・徴候から1(呼吸)タグが検出される（既存の弾性ストッキング等に加えて）', () => {
  ['フットポンプを装着', '間欠的空気圧迫装置を使用', 'Homans徴候なし', '腓腹部に把握痛あり'].forEach(text => {
    assert.ok(detectMultipleHendersonTags(text).includes(1), `「${text}」から1(呼吸)が検出されるはず`);
  });
});

test('術後せん妄のタイプ（過活動型・低活動型）から10(コミュニケーション)タグが検出される', () => {
  assert.ok(detectMultipleHendersonTags('過活動型のせん妄様症状').includes(10));
  assert.ok(detectMultipleHendersonTags('低活動型で活気が無い').includes(10));
});

test('二次骨折予防・骨粗鬆症関連の語から14(学び)タグが検出される', () => {
  assert.ok(detectMultipleHendersonTags('骨折リエゾンサービス(FLS)による二次骨折予防').includes(14));
  assert.ok(detectMultipleHendersonTags('骨粗鬆症治療薬(ビスホスホネート)を開始').includes(14));
});

test('大腿骨近位部骨折以外の患者では術後観察の不足チェックは行われない', () => {
  const items = [{ text: '診断名: 市中肺炎の疑い' }, { text: '既往歴: 高血圧症' }];
  assert.equal(detectHipFracturePostopMissingChecks(items).length, 0);
});

test('大腿骨近位部骨折患者で記録が一切無ければ全項目が不足情報として検出される', () => {
  const items = [{ text: '診断名: 大腿骨頸部骨折' }, { text: '手術術式: 人工骨頭置換術(BHA)' }];
  const missing = detectHipFracturePostopMissingChecks(items);
  assert.equal(missing.length, HIP_FRACTURE_POSTOP_EXPECTED_CHECKS.length);
});

test('脱臼予防・DVT予防が記録済みなら、それぞれの不足チェックから除外される', () => {
  const items = [
    { text: '診断名: 大腿骨頸部骨折' },
    { text: '手術術式: 人工骨頭置換術(BHA)' },
    { text: '外転枕を使用し良肢位を保持、禁忌肢位について説明した。' },
    { text: '弾性ストッキング着用、フットポンプ装着中。' }
  ];
  const missing = detectHipFracturePostopMissingChecks(items);
  assert.ok(!missing.some(c => c.keywords.includes('外転枕')), '脱臼予防の記録があるため対象から除外される');
  assert.ok(!missing.some(c => c.keywords.includes('弾性ストッキング')), 'DVT予防の記録があるため対象から除外される');
  assert.ok(missing.some(c => c.keywords.includes('せん妄')), '記録の無い術後せん妄のチェックは引き続き提案される');
  assert.ok(missing.some(c => c.keywords.includes('尿道カテーテル')));
  assert.ok(missing.some(c => c.keywords.includes('疼痛')));
});
