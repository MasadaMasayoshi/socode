'use strict';

//

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const app = loadApp();
const { groupClinicalPhrasesWithTimestamps, detectMultipleHendersonTags } = app;

test('groupClinicalPhrasesWithTimestamps: 「バイタルサインは○○に落ち着く。」の値部分が切り出された後の残骸は、値のカードへつなぎ戻され単独の意味の無いカードにならない（利用者からの報告事例）', () => {
  const extracted = groupClinicalPhrasesWithTimestamps('バイタルサインは血圧140/85mmHgに落ち着く。');
  const bareRemnant = extracted.find(e => e.text === 'バイタルサインはに落ち着く。');
  assert.ok(!bareRemnant, '「バイタルサインはに落ち着く。」だけの単独カードは残らないはず');
  const merged = extracted.find(e => e.text.includes('血圧140/85mmHg'));
  assert.ok(merged, '血圧の値を含むカードが1件は残るはず');
  assert.ok(merged.text.includes('落ち着く'), '残骸の内容は捨てずに値のカードへつなぎ戻されるはず');

  assert.ok(detectMultipleHendersonTags(merged.text).length > 0,
    '値を含むカードにはヘンダーソンのキーワードが1つ以上一致するはず（患者背景に落ちない）');
});

test('groupClinicalPhrasesWithTimestamps: 値を伴わず「バイタルサインを測定した。」のように単独で書かれた文はこの経路の対象外で、通常どおり1枚のカードとして残る（回帰確認）', () => {
  const extracted = groupClinicalPhrasesWithTimestamps('バイタルサインを測定した。');
  const item = extracted.find(e => e.text.includes('バイタルサインを測定した'));
  assert.ok(item, '同じ行に検査値が無い場合は、つなぎ戻す対象にはならず通常のカードとして残るはず');
});

test('groupClinicalPhrasesWithTimestamps: 「バイタルサインは体温36.8℃、血圧150/90mmHg、脈拍82回/分。左の手足に軽度の麻痺がある。」のように、残骸の後に別の所見が続く場合はそちらのカードに正しく統合される（回帰確認）', () => {
  const extracted = groupClinicalPhrasesWithTimestamps(
    'バイタルサインは体温36.8℃、血圧150/90mmHg、脈拍82回/分。左の手足に軽度の麻痺がある。'
  );
  assert.ok(!extracted.some(e => e.text === 'バイタルサインは。左の手足に軽度の麻痺がある。' && detectMultipleHendersonTags(e.text).length === 0),
    'この場合は「麻痺」キーワードで元々ヘンダーソンタグが付くため、患者背景には振り分けられないはず');
  const paralysis = extracted.find(e => e.text.includes('麻痺'));
  assert.ok(paralysis);
  assert.ok(detectMultipleHendersonTags(paralysis.text).includes(4), '麻痺は4(姿勢)に一致するはず');
});

test('detectMultipleHendersonTags: 「バイタルサイン」「意識」という総称の語だけでも1(呼吸：循環動態・意識レベルを含む)に一致する（利用者からの報告事例）', () => {
  assert.ok(detectMultipleHendersonTags('バイタルサインは安定している。').includes(1),
    '値を伴わない要約の文でも、値の有無に関わらずタグが付くはず');
  assert.ok(detectMultipleHendersonTags('意識は清明だが、ベッド上で顔をしかめている。').includes(1),
    '「意識」も同様に1に一致するはず');
});

test('groupClinicalPhrasesWithTimestamps: 「徒歩で病棟へ案内される。バイタルサインは体温36.5℃、血圧120/75mmHg、脈拍70回/分。」のように、値が切り出された後に「バイタルサインは」以外の文が前に付いている残骸も、「バイタルサイン」というキーワード自体でタグが付き患者背景に落ちない（利用者からの報告事例）', () => {
  const extracted = groupClinicalPhrasesWithTimestamps(
    '徒歩で病棟へ案内される。バイタルサインは体温36.5℃、血圧120/75mmHg、脈拍70回/分。'
  );
  const remnant = extracted.find(e => e.text.includes('徒歩で病棟へ案内される'));
  assert.ok(remnant, '「徒歩で病棟へ案内される。バイタルサインは。」という残骸のカードが残るはず');
  assert.ok(detectMultipleHendersonTags(remnant.text).length > 0,
    '「バイタルサイン」というキーワード自体でヘンダーソンタグが付き、患者背景には振り分けられないはず');
});

test('groupClinicalPhrasesWithTimestamps: 「バイタルサインは安定している。」のように値を全く伴わない要約の文も、通常の1枚のカードとしてヘンダーソンタグ付きで残る（利用者からの報告事例）', () => {
  const extracted = groupClinicalPhrasesWithTimestamps('バイタルサインは安定している。');
  const item = extracted.find(e => e.text.includes('バイタルサインは安定している'));
  assert.ok(item);
  assert.ok(detectMultipleHendersonTags(item.text).includes(1));
});

test('groupClinicalPhrasesWithTimestamps: 「意識は清明だが、ベッド上で顔をしかめている。」も通常の1枚のカードとしてヘンダーソンタグ付きで残る（利用者からの報告事例）', () => {
  const extracted = groupClinicalPhrasesWithTimestamps('意識は清明だが、ベッド上で顔をしかめている。');
  const item = extracted.find(e => e.text.includes('意識は清明'));
  assert.ok(item);
  assert.ok(detectMultipleHendersonTags(item.text).includes(1));
});
