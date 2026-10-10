'use strict';

//

//

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const app = loadApp();
const { groupClinicalPhrasesWithTimestamps, buildExportPlainText, predictLocalItemType } = app;

test('groupClinicalPhrasesWithTimestamps: 「年齢・社会的・文化的状況」の生の章タイトルはもう本文に前置きされない（利用者からの報告事例）', () => {
  const text = [
    '年齢・社会的・文化的状況',
    '妻は50歳代(主婦)同居、パートで働いている。',
    '長男(20歳代)会社員は近所に在住、次男(20歳代)大学生は県外に在住している。',
    '4人家族。',
    'キーパーソン: 妻、50歳代、主婦、同居。パートで働いている。',
    '受け持つまでの経過',
    '受け持ち初日に入院となる。',
    '受け持つまでの状態',
    '半年前から胃のもたつき感があり、2ヶ月前の会社での検診があり貧血が指摘された。'
  ].join('\n');
  const extracted = groupClinicalPhrasesWithTimestamps(text);

  extracted.filter(item => !item.isUnnecessaryBoilerplate).forEach(item => {
    assert.ok(!item.text.includes('年齢・社会的・文化的状況'),
      `カード本文に生の章タイトルが含まれてはいけない: "${item.text}"`);
  });

  const wife = extracted.find(i => i.text.includes('妻は50歳代'));
  assert.ok(wife, '妻に関するカードが抽出されるはず');
  assert.equal(wife.fieldLabel, '家族関係', '家族構成の内容には[家族関係]の見出しラベルが付くはず');

  const sons = extracted.find(i => i.text.includes('長男'));
  assert.ok(sons, '長男・次男に関するカードが抽出されるはず');
  assert.equal(sons.fieldLabel, '家族関係');

  const familySize = extracted.find(i => i.text.includes('4人家族'));
  assert.ok(familySize, '「4人家族。」のカードが抽出されるはず');
  assert.equal(familySize.fieldLabel, '家族関係');

  const course = extracted.find(i => i.text.includes('受け持ち初日に入院'));
  assert.ok(course, '受け持ち経過に関するカードが抽出されるはず');
  assert.ok(!course.fieldLabel, '家族構成に関する内容でない文には[家族関係]を付けないはず');

  const preop = extracted.find(i => i.text.includes('胃のもたつき感'));
  assert.ok(preop, '術前の自覚症状に関するカードが抽出されるはず');
  assert.ok(!preop.fieldLabel);
});

test('groupClinicalPhrasesWithTimestamps: 「受け持つまでの経過」「受け持つまでの状態」等、値を伴わないサブ見出しの断片は単独のカードとして残らない（利用者からの報告事例）', () => {
  const text = [
    '年齢・社会的・文化的状況',
    '受け持つまでの経過',
    '受け持ち初日に入院となる。',
    '受け持つまでの状態',
    '知的能力',
    '理解良好。コミュニケーションも取れる。',
    '身体的ならびに身体的能力'
  ].join('\n');
  const extracted = groupClinicalPhrasesWithTimestamps(text)
    .filter(i => !i.isUnnecessaryBoilerplate);

  const bareFragments = ['受け持つまでの経過', '受け持つまでの状態', '知的能力', '身体的ならびに身体的能力'];
  bareFragments.forEach(fragment => {
    const leaked = extracted.find(i => i.text === fragment);
    assert.equal(leaked, undefined, `「${fragment}」だけの中身の無いカードが残ってはいけない`);
  });

  const understanding = extracted.find(i => i.text.includes('理解良好'));
  assert.ok(understanding, '「理解良好。コミュニケーションも取れる。」のカードは通常どおり抽出されるはず');
});

test('predictLocalItemType: 「年齢・社会的・文化的状況」の家族構成カードは章タイトルの前置きが無くなっても引き続きtype "o"になる（回帰確認）', () => {
  const text = [
    '年齢・社会的・文化的状況',
    '妻は50歳代(主婦)同居、パートで働いている。'
  ].join('\n');
  const extracted = groupClinicalPhrasesWithTimestamps(text);
  const wife = extracted.find(i => i.text.includes('妻は50歳代'));
  assert.equal(predictLocalItemType(wife, wife.text, null), 'o');
});

test('buildExportPlainText: 「年齢・社会的・文化的状況」という生の章タイトルは出力シートのどこにも現れない（利用者からの報告事例）', () => {
  const text = [
    '年齢・社会的・文化的状況',
    '妻は50歳代(主婦)同居、パートで働いている。',
    '受け持つまでの経過',
    '受け持ち初日に入院となる。'
  ].join('\n');
  const extracted = groupClinicalPhrasesWithTimestamps(text)
    .filter(i => !i.isUnnecessaryBoilerplate)
    .map(chunk => ({
      text: chunk.text,
      timestamp: chunk.timestamp || '日時不明',
      type: predictLocalItemType(chunk, chunk.text, null),
      hendersonIds: [],
      fieldLabel: chunk.fieldLabel || null
    }));
  const out = buildExportPlainText({ title: 'テスト患者', items: extracted });
  assert.ok(!out.includes('年齢・社会的・文化的状況'), '出力シートに生の章タイトルが含まれてはいけない');
  assert.match(out, /\[家族関係\] 妻は50歳代\(主婦\)同居、パートで働いている。/);
});

test('groupClinicalPhrasesWithTimestamps: 「帰室時の状況」等、単一の話題の章タイトルは引き続きそのまま前置きされる（回帰確認・bracket-heading-split.test.js等の既存挙動を壊さないことの確認）', () => {
  const text = [
    '帰室時の状況',
    '声を掛けると開眼し、「ああ」と短く返事をするのみ。',
    '湿性咳嗽時々あり'
  ].join('\n');
  const extracted = groupClinicalPhrasesWithTimestamps(text);
  const consciousness = extracted.find(i => i.text.includes('声を掛けると開眼し'));
  assert.equal(consciousness.text, '帰室時の状況: 声を掛けると開眼し、「ああ」と短く返事をするのみ。',
    '「帰室時の状況」は今まで通り章タイトルがそのまま前置きされるはず');
});
