'use strict';
// 利用者からの指摘（患者36）の検証。適切であれば複数のタグを付けてよい。
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const cards = text => Array.from(app.classifyTextByRules(text)).map(c => ({ text: c.text, type: c.type, tags: Array.from(c.hendersonIds) }));
const tagsOf = text => Array.from(app.detectMultipleHendersonTags(text));

test('診断名の大腿骨頸部骨折は4・9（1.呼吸・10・14にしない）', () => {
  const c = cards('診断名： 右大腿骨頸部骨折（Garden分類 ステージⅣ型）');
  assert.deepEqual(c[0].tags, [4, 9]);
});

test('全身麻酔は1.呼吸ではなく9.環境', () => {
  const t = tagsOf('入室: 右大腿骨人工骨頭置換術 後方アプローチ施行 全身麻酔');
  assert.ok(t.includes(9));
  assert.ok(!t.includes(1));
});

test('嗜好品のタバコと飲酒は別のカードに分ける', () => {
  const c = cards('嗜好品： タバコ なし 飲酒 なし');
  assert.deepEqual(c.map(x => [x.text, x.tags]), [['嗜好品: タバコ なし', [1]], ['嗜好品: 飲酒 なし', [2]]]);
});

test('呼吸数・呼吸状態の観察は1.呼吸（嘔気なしで2を付けない）', () => {
  assert.deepEqual(tagsOf('呼吸20回/分'), [1]);
  assert.deepEqual(tagsOf('呼吸困難感訴えなし、肺Air入り良好、嘔気・嘔吐なし'), [1]);
  assert.ok(tagsOf('【症状】胃のむかつき感あり、嘔吐なし。').includes(2), 'むかつき「あり」は2.食事のまま');
});

test('「担当看護師より」の次の行からの説明は看護師の説明(O)として1枚にし、4・14', () => {
  const src = [
    '15:00',
    '担当看護師より',
    '「今、少しずつリハビリを進めている状況であり、徐々に歩行できるようになってくる。」',
    '「PTの計画をもとにRHを行っており、無理はしないようにしてほしい。」',
    '「日常生活を行う上で、気を付けてほしい姿勢があるため、今後指導を行う予定である。」など、説明する。',
    '本人より',
    '「まだ手術したばっかりやからゆっくりしか動けんけど、足が痛い。」'
  ].join('\n');
  const c = cards(src);
  const ns = c.find(x => x.text.startsWith('担当看護師より「今、'));
  assert.ok(ns, JSON.stringify(c));
  assert.equal(ns.type, 'o');
  assert.deepEqual(ns.tags, [4, 14]);
  const pt = c.find(x => x.text.startsWith('本人より「まだ'));
  assert.ok(pt, '本人よりは次の発言の頭に付く');
  assert.equal(pt.type, 's');
  assert.ok(!c.some(x => /本人より$/.test(x.text)), '前のカードの末尾に「本人より」が残らない');
});

test('発言の後の短い観察（自尿あり）は別カード', () => {
  const c = cards('16:00\n「体重をかけるのは痛みが増す」と話す。自尿あり。');
  assert.equal(c.length, 2);
  assert.equal(c[0].type, 's');
  assert.deepEqual(c[1].tags, [3]);
});

test('謝罪の発言と、トイレについての別の発言はまとめない（10のみ）', () => {
  const c = cards('16:00\n「ごめんなさいね。迷惑かけますね」「息子のお嫁さんには申し訳なくて頼れないし・・・かといって息子は仕事があるから、迷惑はかけられないわ」\n「最初は右足に体重をかけるのは痛みが増して怖かったけど、看護師さんに手伝ってもらってトイレに行けてよかった。」');
  assert.equal(c.length, 2);
  assert.deepEqual(c[0].tags, [10]);
});

test('見出しで決まる項目（趣味13・疼痛9・義歯2・睡眠5）', () => {
  assert.deepEqual(tagsOf('趣味: 友人と旅行を楽しむなど、活動的に生活している'), [13]);
  assert.deepEqual(tagsOf('疼痛: 安静時ペインスケール「2-3」 体位変換時「5-6」'), [4]);
  assert.deepEqual(tagsOf('嚥下・咀嚼障害: なし 上下義歯があるが不具合はない'), [2]);
  assert.deepEqual(tagsOf('睡眠: 7時間程度(眠剤の使用なく、寝つきはよい)。現在は痛みのため眠れていない'), [5]);
});

test('ペインスケールの条件の姿勢では4を付けない／弾性ストッキングは9', () => {
  assert.deepEqual(tagsOf('ペインスケール「5-6」 側臥位時、外転枕使用している'), [9]);
  assert.deepEqual(tagsOf('弾性ストッキング着用し、フットポンプ装着'), [9]);
});

test('食事の場面は2（食事の時間を目安にしただけの記録は2にしない）', () => {
  assert.ok(tagsOf('昼食、自力でゆっくり端坐位になり、食事摂取する 疼痛増強なし').includes(2));
  assert.ok(tagsOf('朝食全量摂取').includes(2));
  assert.ok(!tagsOf('昼食後よりカロナール600mgで内服開始').includes(2));
  assert.ok(!tagsOf('昼食、点滴終了、抗生剤のみとなったため、ヘパリンロック行う').includes(2));
});

test('帰室の行は検査値を切り出した後の余分な空白が残らない', () => {
  const c = cards('12:00 帰室： 個室301号室 意識レベルクリア 会話可能 血圧140/70mmHg 脈拍80回/分整 呼吸困難感訴えなし');
  const main = c.find(x => x.text.startsWith('帰室'));
  assert.ok(main && !/\s{2,}/.test(main.text), JSON.stringify(c));
  assert.ok(main.tags.includes(1));
});

test('理学療法士の意味のPTは検査値（プロトロンビン時間）扱いしない', () => {
  assert.ok(!app.LAB_ITEM_NAME_REGEX.test('PTの計画をもとにRHを行う'));
  assert.ok(!app.LAB_ITEM_NAME_REGEX.test('PTより説明あり'));
});
