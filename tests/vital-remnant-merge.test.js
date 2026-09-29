'use strict';
// 「バイタルサインは血圧140/85mmHgに落ち着く。」「バイタルサインは安定している。」
// 「意識は清明だが、ベッド上で顔をしかめている。」のように、「バイタルサイン」「意識」
// という語だけで書かれた所見が、ヘンダーソン14項目のどのキーワードにも一致せず
// 「患者背景（基本情報／医学情報）」の受け皿に誤って振り分けられてしまっていた不具合の検証。
//
// 【背景】利用者から2つの記録（A氏・B氏）で計5件報告・確認された：
//   ①「バイタルサインは血圧140/85mmHgに落ち着く。」→ 値「血圧140/85mmHg」は検査値カードとして
//     正しく切り出されるが、残った「バイタルサインはに落ち着く。」が単独の別カードとして残る。
//   ②「徒歩で病棟へ案内される。バイタルサインは体温36.5℃、血圧120/75mmHg、脈拍70回/分。」→
//     値部分が切り出された後の「徒歩で病棟へ案内される。バイタルサインは。」が、
//     「バイタルサイン」で始まらない（前に別の文がある）ため①の対処だけでは救えない。
//   ③「バイタルサインは安定している。」→ 値を全く伴わない要約の文で、そもそも検査値抽出が
//     一度も走らない。
//   ④「意識は清明だが、ベッド上で顔をしかめている。」→ 「意識」もヘンダーソンのどの
//     キーワードにも未登録だった。
// いずれも「バイタルサイン」「意識」という総称の語自体がヘンダーソン14項目のキーワード
// 辞書に登録されていなかったことが根本原因のため、この2語を1(呼吸：循環動態・意識レベルを
// 含む)のキーワードに追加した（NotebookLM基準ノートも「循環器系・後出血：血圧・脈拍・
// 意識レベル…」のように意識レベルを循環動態の観察と並べて扱っている）。
// これにより②③④はキーワード一致だけで解決する。①のように値のカードと同じ行にある
// 「バイタルサインは」で始まる残骸は、キーワード一致の有無に関わらず、常に値のカードへ
// つなぎ戻して1枚にまとめる（BARE_DURATION_REGEX等の既存の「単独では意味が読み取れない
// 断片はつなぎ戻す」という仕組みに、この場合を追加しただけで、他の既存の挙動には影響しない）。

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
  // 血圧140/85mmHgカード自体は「血圧」キーワードで1(呼吸・循環)に一致するため、
  // 患者背景に振り分けられるべき「ヘンダーソンタグが1つも無い」状態ではない。
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
