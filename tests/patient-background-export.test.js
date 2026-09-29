'use strict';
// 出力シート（Word・PDF書き出し／プレーンテキスト書き出し）における、年齢・既往歴・
// 診断名・家族構成・職業・保険等の「基本情報」の扱いの検証。
//
// 【経緯】
// 一度は、見出しラベル（FIELD_LABELS）付きの項目やヘンダーソン14項目のどれにも一致
// しなかった患者背景フォールバック項目（item.patientBackground）を「2. 患者背景」という
// 独立したセクションにまとめる形にしていたが、利用者からの指摘：看護記録の原則では、
// 年齢・既往歴・診断名・家族構成・職業・保険等のカルテ・アナムネ由来の基本情報も、
// 患者本人の発言でない限りすべて客観的事実（Oデータ）であり、「患者背景」というS/Oの
// どちらでもない第三の区分を作るべきではない。
// このため「2. 患者背景」という独立セクションは廃止し、見出しラベル付きの項目も他の
// 項目と同様にtype（s/o/unclassified）でそのままS/O/未分類の一覧に含めるように戻した
// （=このセクションが無かった頃の構成に戻した）。見出しラベルがあれば、行頭に
// 「[見出し語]」が付いた状態でS/Oデータの一覧の中にそのまま並ぶ
// （例：「・[家族構成] 夫、長男と同居」がOデータの一覧の中に現れる）。
// セクション番号は「2. 患者背景」が無くなった分、1つずつ繰り上がっている
// （1.検査データ → 2.Sデータ → 3.Oデータ → 4.未分類 → 5.ヘンダーソン14項目別 → 6〜10.AI分析等）。

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const app = loadApp();
const {
  groupClinicalPhrasesWithTimestamps, detectMultipleHendersonTags, fieldLabelHintTags,
  predictLocalItemType, classifyPatientBackground, LAB_ITEM_NAME_REGEX,
  buildExportPlainText, normalizeFieldLabelHeadingWord
} = app;

// btn-start-classifyのローカル分類経路（本体コード）と同じ呼び出し順序・同じ条件で
// patientBackgroundまで含めて再現する検証用ヘルパー（classification.test.jsのclassifyLocally
// はpatientBackgroundを計算しないため、ここでは別に用意する）。
function classifyLocallyFull(text) {
  return groupClinicalPhrasesWithTimestamps(text)
    .filter(chunk => !chunk.isUnnecessaryBoilerplate)
    .map(chunk => {
      const cleanedText = chunk.text;
      const detectedHIds = Array.from(new Set(detectMultipleHendersonTags(cleanedText)));
      if ((chunk.isLabOrVital || LAB_ITEM_NAME_REGEX.test(cleanedText)) && !detectedHIds.includes(2)) detectedHIds.push(2);
      if (chunk.fieldLabel) {
        fieldLabelHintTags(chunk.fieldLabel, cleanedText).forEach(hid => { if (!detectedHIds.includes(hid)) detectedHIds.push(hid); });
      }
      const predictedType = predictLocalItemType(chunk, cleanedText, null);
      const patientBackground = (predictedType !== 'unnecessary' && detectedHIds.length === 0)
        ? classifyPatientBackground(chunk.fieldLabel)
        : null;
      return { text: cleanedText, timestamp: chunk.timestamp || '日時不明', type: predictedType, hendersonIds: detectedHIds, fieldLabel: chunk.fieldLabel || null, patientBackground };
    });
}

test('normalizeFieldLabelHeadingWord: 「家族構成」は「家族関係」の別名として正規化される（利用者からの報告事例）', () => {
  assert.equal(normalizeFieldLabelHeadingWord('家族構成'), '家族関係');
});

test('normalizeFieldLabelHeadingWord: 「診断」は「診断名」の別名として正規化される（回帰確認）', () => {
  assert.equal(normalizeFieldLabelHeadingWord('診断'), '診断名');
});

test('groupClinicalPhrasesWithTimestamps: 「家族構成：」という見出しも「家族関係」のfieldLabelとして切り出される（利用者からの報告事例）', () => {
  const items = classifyLocallyFull('家族構成：夫と長男の3人暮らし。');
  const item = items.find(i => i.text.includes('夫と長男'));
  assert.ok(item, '「家族構成：」の内容がカードとして抽出されるはず');
  assert.equal(item.fieldLabel, '家族関係', '見出し語が「家族構成」でもfieldLabelは本来の表記「家族関係」に統一されるはず');
});

test('groupClinicalPhrasesWithTimestamps: 「学歴：」「アレルギー：」も見出しラベルとして切り出される（利用者からの報告事例）', () => {
  const items = classifyLocallyFull('学歴：高校卒業。\nアレルギー：食物アレルギーなし。');
  const edu = items.find(i => i.text.includes('高校卒業'));
  const allergy = items.find(i => i.text.includes('食物アレルギー'));
  assert.equal(edu?.fieldLabel, '学歴');
  assert.equal(allergy?.fieldLabel, 'アレルギー');
});

test('classifyLocallyFull: 年齢・既往歴・診断名・家族構成・職業・保険等の見出しラベル付き項目は、患者本人の発言でない限り全てtype "o"（客観的情報）になる（回帰確認・看護記録の原則）', () => {
  const items = classifyLocallyFull([
    '年齢：58歳',
    '職業：会社員',
    '家族構成：妻と2人暮らし',
    '保険：社会保険',
    '既往歴：50歳の時に高血圧を指摘された'
  ].join('\n'));
  items.forEach(i => assert.equal(i.type, 'o', `「${i.text}」はOデータであるはず`));
});

test('buildExportPlainText: 「2. 患者背景」のような独立したセクションは存在せず、見出しラベル付きの項目は行頭に[見出し語]を付けたままOデータの一覧に含まれる（利用者からの指摘の反映）', () => {
  const text = [
    '家族構成：夫、長男と同居。',
    '学歴：高校卒業後、会社員として勤務。',
    'アレルギー：食物アレルギーなし。',
    '本日のバイタルサインは安定している。'
  ].join('\n');
  const items = classifyLocallyFull(text);
  const out = buildExportPlainText({ title: 'テスト患者', items });

  assert.ok(!out.includes('患者背景'), '「患者背景」という独立したセクション・区分はもう出力しないはず');

  const section3 = out.split('【3.')[1].split('【4.')[0];
  assert.match(section3, /\[家族関係\] 夫、長男と同居/, '家族構成はOデータの一覧内に[家族関係]付きの1行として現れるはず');
  assert.match(section3, /\[学歴\] 高校卒業後、会社員として勤務/);
  assert.match(section3, /\[アレルギー\] 食物アレルギーなし/);
  assert.match(section3, /本日のバイタルサインは安定している/, '通常の日々の観察所見も同じOデータの一覧に含まれるはず');
});

test('buildExportPlainText: セクション番号は「2. 患者背景」が無くなった分、1つずつ繰り上がっている（回帰確認）', () => {
  const items = classifyLocallyFull('本日のバイタルサインは安定している。');
  const out = buildExportPlainText({ title: 'テスト患者', items });
  assert.match(out, /【1\. 検査データ臨床評価・アセスメントノート】/);
  assert.match(out, /【2\. 主観的情報（Sデータ）】/);
  assert.match(out, /【3\. 客観的情報（Oデータ）】/);
  assert.match(out, /【4\. 未分類のカード】/);
  assert.match(out, /【5\. ヘンダーソン14項目別アセスメント整理】/);
});
