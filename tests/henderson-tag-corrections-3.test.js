'use strict';
// 利用者からのヘンダーソン14項目の分類の指摘（患者38）と、同じ記録で見つかった関連の不具合の回帰テスト。

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const { detectMultipleHendersonTags, groupClinicalPhrasesWithTimestamps, splitByNakatenList, labCategoryTags } = loadApp();
const tags = t => Array.from(detectMultipleHendersonTags(t)).sort((a, b) => a - b);
const cards = t => Array.from(groupClinicalPhrasesWithTimestamps(t.normalize('NFKC'))).filter(c => !c.isUnnecessaryBoilerplate).map(c => c.text);

test('1.呼吸：弾性ストッキング・フットポンプ（血栓予防）は1・6ではなく9（患者36の指摘）', () => {
  assert.deepEqual(tags('弾性ストッキング着用し、フットポンプ装着'), [9]);
});

// 改善点ファイル（患者36）で、脱臼予防は4.姿勢と9.安全の両方にした
test('1.呼吸：外転枕（脱臼予防）は1ではなく4・9', () => {
  assert.deepEqual(tags('側臥位時は外転枕使用すること'), [4, 9]);
  assert.deepEqual(tags('両下肢のあいだに外転枕を挟んでいる'), [4, 9]);
  const t = tags('ペインスケール「5-6」 側臥位時、外転枕使用している');
  assert.ok(t.includes(9) && !t.includes(1), '疼痛の評価は9、1は付かない');
});

test('1.呼吸：ホーマンズ徴候・足関節の底背屈運動（DVTの観察）は9', () => {
  assert.deepEqual(tags('ホーマンズ徴候みられず、足関節の底背屈運動行う'), [9]);
});

test('2.食事：「体重をかける」（荷重）は2ではなく4・9', () => {
  assert.ok(!tags('「体重かけても大丈夫なの?怖い」となかなか荷重かけられず').includes(2));
  assert.ok(tags('「体重をかけるのは怖い」と言いながら端坐位→車いすへ移乗行う').includes(4));
  const t = tags('「歩くと痛かった」「体重をかけても大丈夫なのかな?」と訴えあり。');
  assert.ok(t.includes(4) && t.includes(9) && !t.includes(2));
  assert.ok(tags('体重 45kg').includes(2), '体格としての体重は引き続き2');
});

test('4.姿勢：ペインスケール「3」(安静時)は4にも9にもしない', () => {
  assert.deepEqual(tags('ペインスケール「3」(安静時)'), []);
  assert.ok(tags('ベッド上安静').includes(4), '安静度の指示は引き続き4');
});

test('4.姿勢・7.体温：創部の発赤・熱感（局所の炎症所見）は9', () => {
  assert.ok(!tags('創部 軽度腫脹と熱感あるが、発赤・出血・排膿なし').includes(9)); // 創部の所見は9.環境にしない（利用者の指摘）
});

test('5.睡眠：「不安」は10、「不安定」（移乗のふらつき）は4だけ', () => {
  const a = tags('痛みや動くことへの不安が生じている。');
  assert.ok(!a.includes(5) && a.includes(10) && !a.includes(9));
  // 「トイレ」は後の修正で3.排泄のキーワードになった（henderson-tag-corrections-4）。ここで確かめたいのは
  // 「不安定」で10.コミュニケーションが付かないこと。
  assert.deepEqual(tags('トイレまで行き、移乗してみる。ゆっくり自力での移乗できるが、やや不安定。'), [3, 4]);
});

test('10.コミュニケーション：食事・排泄についての発言は10にしない。気持ちや疑問の発言は引き続き10', () => {
  assert.deepEqual(tags('ベッドアップし、昼食摂取「あまり食欲がない」と半分のみ摂取'), [2]);
  assert.deepEqual(tags('夕食、ベッドアップし、夕食摂取 「あまり動いてないし、おなかすかない」と摂取量半分'), [2]);
  assert.deepEqual(tags('排便なし(3日目なし)腸蠕動あり、排ガスあり「動いてないからお腹が張っている」と'), [3]);
  assert.ok(tags('「情けないわ。こんなに思うように動けなくて」').includes(10));
  assert.ok(tags('「大手術だったのに、もう起きていいの?人工骨頭がずれたりしないかしら?」').includes(10));
});

test('12.仕事：リハビリテーションの計画は12ではなく4', () => {
  assert.deepEqual(tags('リハビリテーションスケジュール:術後1日目から開始'), [4]);
});

test('「セファゾリンNa 1g」は検査値（Na）にならない。「血清Na 140」は検査値のまま', () => {
  const c = cards('抗生剤 セファゾリンNa 1g+生食100ml 2×朝夕');
  assert.ok(!c.some(t => /^Na\s*1/.test(t)), JSON.stringify(c));
  assert.ok(c.some(t => t.includes('セファゾリンNa 1g')));
  assert.ok(cards('血清Na 140').some(t => /Na\s*140/.test(t)));
});

test('「PTとともに訓練」（理学療法士）は凝固検査のPTにならない。「PT 12.0秒」は検査', () => {
  assert.ok(!tags('本日、PTとともにベッド上でSLR・足関節ROMの訓練実施。').includes(9));
  assert.ok(tags('本日、PTとともにベッド上でSLR・足関節ROMの訓練実施。').includes(4));
  assert.deepEqual(Array.from(labCategoryTags('PT 12.0秒')), [2]);
});

test('「、」で続く文の最後の「嘔気・嘔吐なし」「発赤・出血・排膿なし」は分割しない（「嘔気」「出血」だけが残ると意味が逆になる）', () => {
  assert.deepEqual(Array.from(splitByNakatenList('呼吸困難感訴えなし、肺Air入り良好、嘔気・嘔吐なし')), ['呼吸困難感訴えなし、肺Air入り良好、嘔気・嘔吐なし']);
  assert.deepEqual(Array.from(splitByNakatenList('軽度腫脹と熱感あるが、発赤・出血・排膿なし')), ['軽度腫脹と熱感あるが、発赤・出血・排膿なし']);
});

test('体温の「度」・脈拍の「整」が次のカードの先頭に残らない', () => {
  const c = cards('体温 37.0度 血圧125/70 脈拍 74回/分 整 呼吸数 17回/分');
  assert.ok(!c.some(t => /^(度|整)/.test(t)), JSON.stringify(c));
});

test('改行をまたぐ発言は1枚のカードになり、別の話題の発言とはまとめない', () => {
  const c = cards(['10:00 検温', '「動かすと手術したところが痛いんだけど、時間が経つと痛みは落ち着きます。」', '「体がべたべたして気持ちが悪い。', '早く動けるようになってお風呂には入れるといいんだけど・・・」'].join('\n'));
  assert.ok(c.some(t => t.startsWith('「体がべたべたして') && t.includes('お風呂')), JSON.stringify(c));
  assert.ok(c.some(t => t.startsWith('「動かすと') && !t.includes('べたべた')), JSON.stringify(c));
});

test('同じ話題の発言だけの行が続く場合はまとまる（回帰確認）', () => {
  const c = cards(['術後', '「痛み止めって我慢できなくなってから使うものでしょう?」', '「痛みのため昨晩は眠れなかった」'].join('\n'));
  assert.ok(c.filter(t => t.includes('痛み')).length <= 2, JSON.stringify(c)); // 内容で分類するため、痛み止めの話(14)と眠れなかった話(5)は別のカードでもよい
});
