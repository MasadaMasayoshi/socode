'use strict';
// 新しい長文事例（SOAP形式の緩和ケア・略語の多いCOPD・表と聞き取りの認知症＋骨折）のテストで
// 見つかった不具合の修正の確認
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const cards = t => Array.from(app.classifyTextByRules(t));
const texts = t => cards(t).map(c => c.text);
const tagsOf = t => Array.from(app.detectMultipleHendersonTags(t)).sort((a, b) => a - b);

test('SOAP形式：「10/1」は日の区切り、S)・O)の印は外し、A)・P)は記録した人の判断なので不要カード', () => {
  const c = cards('10/1\nS)「背中が重たく痛む」\nO)右側臥位で膝を曲げた姿勢をとっている。\nA)がん性疼痛のコントロールが不十分。\nP)安楽な体位の工夫を継続。\n\n10/2\nS)「少し眠れた」');
  const s1 = c.find(x => x.text === '「背中が重たく痛む」');
  assert.ok(s1, JSON.stringify(c.map(x => x.text)));
  assert.equal(s1.timestamp, '10月1日');
  assert.equal(s1.type, 's');
  const o1 = c.find(x => x.text.startsWith('右側臥位'));
  assert.equal(o1.type, 'o');
  assert.equal(c.find(x => /^A\)/.test(x.text)).type, 'unnecessary');
  assert.equal(c.find(x => /^P\)/.test(x.text)).type, 'unnecessary');
  assert.equal(c.find(x => x.text === '「少し眠れた」').timestamp, '10月2日');
});

test('1行目の「事例A …」の題名は不要カード（年齢・性別が書いてある行は患者の情報なので残す）', () => {
  assert.equal(cards('事例C　アルツハイマー型認知症・大腿骨転子部骨折術後　家族からの聞き取りと表\nJさん、86歳、女性。')[0].type, 'unnecessary');
  assert.notEqual(cards('事例:B氏(65歳・女性)\n胃がん')[0].type, 'unnecessary');
});

test('BT・HR・RR（単位なし）も1枚のバイタルのカードにまとめ、1.呼吸と7.体温を付ける', () => {
  const c = cards('6時\nBT 37.2℃　HR 96　BP 138/80　RR 22　SpO2 93%');
  assert.equal(c.length, 1, JSON.stringify(c.map(x => x.text)));
  assert.match(c[0].text, /BT 37\.2°C/);
  assert.match(c[0].text, /HR 96/);
  assert.match(c[0].text, /RR 22/);
  assert.deepEqual(Array.from(c[0].hendersonIds).sort((a, b) => a - b), [1, 7]);
});

test('「PT介入」は理学療法士（検査のPTではない）・「起座位」は4.姿勢にしない', () => {
  assert.deepEqual(Array.from(cards('PT介入：ベッド端座位10分、足踏み20回')[0].hendersonIds), [4]);
  assert.ok(!tagsOf('起座位で肩呼吸あり。').includes(4));
});

test('「Ns「…」」（コロン無し）の問いも、次の家族の答えに（問い：…）で付ける', () => {
  const c = cards('Ns「夜は眠れていましたか」\n次女「夜中に起きて、探し物をすることがありました」');
  assert.equal(c.length, 1, JSON.stringify(c.map(x => x.text)));
  assert.equal(c[0].text, '次女「夜中に起きて、探し物をすることがありました」（問い：夜は眠れていましたか）');
});

test('家族の発言の「仕事」・「仕事を休ませて」は本人の12.仕事にしない／姪の発言は家族の発言', () => {
  assert.ok(!tagsOf('次女「退院したら家でみたいけど、仕事があるので日中はどうしたらいいか」').includes(12));
  assert.ok(!tagsOf('「娘が毎日来てくれるのはうれしいけど、仕事を休ませてしまって申し訳ない」').includes(12));
  assert.ok(app.isFamilySpeech('姪「一人暮らしはもう無理だと思っています」'));
});

test('タブ区切りの表は「食事：入院前 自立 → 術後5日目 一部介助」の形で、列の見出しを残す', () => {
  const t = texts('項目\t入院前\t術後5日目\n食事\t自立（スプーン使用）\t一部介助\n移動\t独歩\t車椅子（全介助）');
  assert.ok(t.includes('食事：入院前 自立(スプーン使用) → 術後5日目 一部介助'), JSON.stringify(t));
  assert.ok(t.includes('移動：入院前 独歩 → 術後5日目 車椅子(全介助)'), JSON.stringify(t));
});

test('骨折の手術の事例では「創部：」に「腹部」を付けない', () => {
  const c = texts('右大腿骨転子部骨折で骨接合術。\n7:00\n創部：発赤・腫脹なし。');
  assert.ok(c.includes('創部（手術創）：発赤・腫脹なし。'), JSON.stringify(c));
  assert.ok(texts('胃切除術後。\n7:00\n創部：出血なし。').includes('腹部創部（手術創）：出血なし。'));
});

test('「血糖 186mg/dL（食前）」の（食前）を項目名に付け、「(食前)、」だけの断片を残さない・「Dr.回診」は次のカードの見出し', () => {
  const t = texts('血糖 186mg/dL（食前）、インスリン4単位皮下注。');
  assert.ok(t.some(x => /^血糖\(食前\) 186 mg\/dL/.test(x)), JSON.stringify(t));
  assert.ok(!t.some(x => /^\(食前\)/.test(x)), JSON.stringify(t));
  assert.ok(texts('9時　Dr.回診\n血ガス：pH 7.36').some(x => /^Dr\.回診: /.test(x)));
});

test('別の話題の発言は「〜と訴える」のカードにまとめない', () => {
  const t = texts('14:30\n「マスクが苦しい、外したい」と繰り返し訴える\n「ラジオは持ってきてくれたか」');
  assert.equal(t.length, 2, JSON.stringify(t));
});
