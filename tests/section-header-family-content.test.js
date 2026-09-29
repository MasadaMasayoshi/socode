'use strict';
// 【背景】利用者からアップロードされた出力シート（患者38）で、「年齢・社会的・文化的状況」という
// 章タイトル（実習記録によくある、年齢／社会的状況／文化的状況という複数の無関係な話題を
// まとめた中位の見出し）が、そのまま生の文字列で後続の家族構成・キーパーソン・受け持つまでの
// 経過等のカード本文の先頭に埋め込まれてしまい、「・[日時不明] 年齢・社会的・文化的状況: 妻は
// 50歳代(主婦)同居、パートで働いている。」のように、Oデータの一覧が長く漠然とした前置きだらけに
// なっていた（利用者からの指摘：「患者背景に落ちてしまった情報をSとOに振り分けるようにして」）。
// この章タイトルは以前から「二つとも社会の関係するものしかありませんよね？」等、繰り返し
// 指摘されてきた特に問題の多い見出しである。
//
// 【修正】「年齢・社会的・文化的状況」だけは、章タイトルの生の文字列をもう本文に埋め込まない
// ようにした。代わりに、家族構成・同居家族・キーパーソンに関する内容だと分かる場合は既存の
// 見出しラベル「家族関係」を付与し、それ以外はそのままの文章として残す（情報は失わず、
// 対応の不正確な前置きだけをやめる）。また、「受け持つまでの経過」「受け持つまでの状態」
// 「知的能力」「身体的ならびに身体的能力」のような、値を伴わないサブ見出しの断片が単独の
// 意味のないカードとして残ってしまっていた問題も合わせて修正した。
//
// なお「血液検査」「画像検査等」「治療方針・治療内容等」「帰室時の状況」など、単一の話題を
// まとめた他の章タイトルは、これまで通り章タイトルをそのまま前置きする（bracket-heading-split.
// test.js等で検証済みの既存の挙動を壊さないことも、この修正の一部として確認する）。

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

  // 見出し行自体（isUnnecessaryBoilerplate: true）は「不要な情報」として別途除外されるため、
  // ここでの確認対象はアセスメントに使う実際のカード（isUnnecessaryBoilerplateでないもの）のみ。
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
