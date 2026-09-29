'use strict';
// 利用者からの構造化バグ報告（S/Oデータの混同、ヘンダーソン14項目の分類の誤り）の検証。
//
// 【背景・報告内容】
// (A) S/Oデータの混同：
//   客観的な観察結果（Oデータ）と患者の発言（Sデータ）が1つの文に混在しているにもかかわらず、
//   全体に[S]タグが付与されてしまう2つの実例が報告された。いずれも「まとめる例」の方針
//   （1つの場面の続きの記述は分割せず1つのtextにまとめる）により、客観的な内容の後に
//   患者の発言（「」・「話す」等）が続く長い文章になっており、これまでは「発言の手がかりが
//   文中のどこかにあれば全体をS」という単純な判定だったため、客観的内容が主体の文章まで
//   丸ごとSになっていた。predictSOTypeFromNarrative()は、発言の手がかりより前に実質的な
//   内容を持つ文（句点区切りで4文字以上）が2文以上あれば、客観的内容が主体とみなしてOと
//   判定するよう変更済み（既存のpredictLocalItemType関連の回帰テストはclassification.test.js参照）。
//
// (B) ヘンダーソン14項目の分類の誤り：
//   1. 「1. 呼吸」に「排便:1回/日、排尿:7~8回/日アレルギーはない。」（本来3.排泄のみ）が
//      混入 → id1(呼吸)のキーワード一覧にあった汎用的な「アレルギー」が原因。特定の呼吸器
//      症状（喘息等）ではなく一般的な既往歴確認の文脈でも一致してしまっていたため、
//      「アレルギー」をid1のキーワードから削除した。
//   2. 「2. 食事」に食事と無関係な家族歴（「祖母を胃がん、父を前立腺がんで亡くしている〜」）が
//      混入 → id2(食事)のキーワード「胃がん」「胃癌」（本人の消化器疾患の診断名として登録）が、
//      家族歴の文脈でも一致してしまっていたため、「(祖父母・父母・きょうだい等)を〜がんで
//      亡くした/亡くしている」という家族歴の文脈を検出した場合に限り、これらの疾患名
//      キーワードの一致を除外するガードを追加した。本人の診断名としての「胃がん」等は
//      引き続き通常どおりid2に一致する。
//   3. 「3. 排泄」に排泄と無関係な「バイタルサインの測定。看護師から手術オリエンテーション…
//      トライボールによる呼吸訓練を実施。」が混入 → これはS/Oの混同(A)と同じ文章で、
//      predictSOTypeFromNarrativeの修正によりOへ判定が変わる対象ではあるが、ヘンダーソン
//      タグ自体は「排泄」に直接関連するキーワードが元々含まれていない（「呼吸訓練」等は
//      id1に一致）。この文章が誤って3(排泄)に分類されていたのは、患者背景の受け皿ロジック
//      ではなく別経路の可能性があるため、本テストではヘンダーソンタグの一致先を直接検証する。
//   4. 「4. 姿勢」に姿勢・移動と無関係な「麻酔科で丁寧に説明してもらった。手術っていろいろな
//      合併症があるんだね。怖いね」（不安・コミュニケーションに関する発言）が混入 →
//      id4(姿勢)のキーワード一覧にあった「麻酔」「全身麻酔」「麻酔科」が原因。これらは
//      麻酔そのものの実施・回復（術後の体動制限等）を示す語ではなく、診療科名や処置名の
//      言及だけで広く一致してしまっていたため、id4のキーワードから削除した（術後の麻酔
//      回復に直結する「麻酔覚醒」「麻酔後回復室」「術後体動制限」は姿勢保持の制限に直結する
//      観察点のため残す）。
//   5. 「5. 睡眠」に睡眠と無関係な「帰室時の状況: 湿性咳嗽時々あり」（本来1.呼吸に該当）が
//      混入 → id5(睡眠)のキーワード一覧にあった「咳嗽」が原因。「咳嗽」はid1(呼吸)の
//      「咳」で既に一致するため、id5からは削除した。

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const app = loadApp();
const { predictLocalItemType, detectMultipleHendersonTags } = app;

test('predictLocalItemType: 創部・ドレーンの客観的所見の後に短い患者発言が続く記録は、全体としてO主体と判定される（利用者からの報告事例1）', () => {
  const text = '創部(腹部 3か所):出血なし、●吻合部背面ドレーン:淡血性5ml、●左横隔膜下ドレーン:10ml、●挿入部異常なし。抜去、閉塞なし。挿入部を数えると「分かりました」と話す。';
  assert.equal(predictLocalItemType({}, text, undefined), 'o',
    '創部状態やドレーン排液量という客観的な観察が文章の主体のため、Oと判定されるはず');
});

test('predictLocalItemType: バイタル測定・オリエンテーション等の看護行為の後に患者発言が続く記録は、全体としてO主体と判定される（利用者からの報告事例2）', () => {
  const text = 'バイタルサインの測定。看護師から手術オリエンテーション(合併症とその予防方法)を受ける。(学生同席)トライボールによる呼吸訓練を実施。腹部を押さえた起き上がりの練習を行う。「安静にしていると良くないんですね。」「痛かったら、これ、自分でできるかな?」と話す。';
  assert.equal(predictLocalItemType({}, text, undefined), 'o',
    '看護行為・実施内容という客観的な記述が文章の主体のため、Oと判定されるはず');
});

test('predictLocalItemType/predictSOTypeFromNarrative: 発言そのものがほぼ全てを占める短い文章は、これまで通りSのまま（回帰確認）', () => {
  assert.equal(predictLocalItemType({}, '「お腹が痛い」と話す', undefined), 's');
  assert.equal(predictLocalItemType({}, '夜間眠れないと訴える', undefined), 's');
  assert.equal(predictLocalItemType({}, '「あ、あ」と短く返事するのみ。のどの痛みあり。', undefined), 's');
});

test('detectMultipleHendersonTags: 「排便:1回/日、排尿:7~8回/日アレルギーはない。」は3(排泄)のみに一致し、1(呼吸)には一致しない（利用者からの報告事例）', () => {
  const tags = detectMultipleHendersonTags('排便:1回/日、排尿:7~8回/日アレルギーはない。');
  assert.ok(tags.includes(3), '3(排泄)には引き続き一致するはず');
  assert.ok(!tags.includes(1), '汎用的な「アレルギー」の一致により1(呼吸)に誤って分類されないはず');
});

test('detectMultipleHendersonTags: 家族歴（「祖母を胃がん、父を前立腺がんで亡くしている〜」）は2(食事)に一致しない（利用者からの報告事例）', () => {
  const tags = detectMultipleHendersonTags('祖母を胃がん、父を前立腺がんで亡くしている。50歳の時に大腸がんの手術を受けている。');
  assert.ok(!tags.includes(2), '家族歴の「胃がん」により2(食事)に誤って分類されないはず');
});

test('detectMultipleHendersonTags: 本人の胃がん診断名は引き続き2(食事)に一致する（回帰確認）', () => {
  const tags = detectMultipleHendersonTags('胃がん（Stage Ⅱ）の診断で胃切除術を予定している。');
  assert.ok(tags.includes(2), '本人の診断名としての「胃がん」は家族歴の文脈ではないため、引き続き2(食事)に一致するはず');
});

test('detectMultipleHendersonTags: 人工骨頭置換術後等、id4の他の疾患名キーワードは家族歴ガードの影響を受けない（回帰確認）', () => {
  assert.ok(detectMultipleHendersonTags('人工骨頭置換術後').includes(4));
});

test('detectMultipleHendersonTags: 「麻酔科で丁寧に説明してもらった。手術っていろいろな合併症があるんだね。怖いね」は4(姿勢)に一致しない（利用者からの報告事例）', () => {
  const tags = detectMultipleHendersonTags('麻酔科で丁寧に説明してもらった。手術っていろいろな合併症があるんだね。怖いね');
  assert.ok(!tags.includes(4), '診療科名「麻酔科」の言及だけで4(姿勢)に誤って分類されないはず');
});

test('detectMultipleHendersonTags: 麻酔覚醒・麻酔後回復室・術後体動制限は引き続き4(姿勢)に一致する（回帰確認）', () => {
  assert.ok(detectMultipleHendersonTags('麻酔覚醒後、術後体動制限のためベッド上安静。').includes(4));
});

test('detectMultipleHendersonTags: 「帰室時の状況: 湿性咳嗽時々あり」は1(呼吸)に一致し、5(睡眠)には一致しない（利用者からの報告事例）', () => {
  const tags = detectMultipleHendersonTags('帰室時の状況: 湿性咳嗽時々あり');
  assert.ok(tags.includes(1), '「咳」を含むため引き続き1(呼吸)に一致するはず');
  assert.ok(!tags.includes(5), '「咳嗽」の一致により5(睡眠)に誤って分類されないはず');
});

test('detectMultipleHendersonTags: 夜間中途覚醒等、睡眠そのものに関する語は引き続き5(睡眠)に一致する（回帰確認）', () => {
  assert.ok(detectMultipleHendersonTags('夜間に中途覚醒が3回あり、日中も眠気が強い。').includes(5));
});
