'use strict';
// 改善点ファイル（患者36・Gemini評価 2026/9/28）の反映の検証
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const tagsOf = t => Array.from(app.detectMultipleHendersonTags(t)).sort((a, b) => a - b);
const cards = Array.from(app.classifyTextByRules(fs.readFileSync(path.join(__dirname, 'golden', 'cases', '患者36.txt'), 'utf8')));
const find = s => cards.find(c => c.text.includes(s));

test('1：骨折・牽引・人工骨頭・術後肢位は4と9、足背動脈の観察も9', () => {
  assert.deepEqual(Array.from(find('キルシュナー鋼線けん引法').hendersonIds).sort(), [4, 9]);
  assert.deepEqual(Array.from(find('人工骨頭置換術(BHA)予定').hendersonIds).sort(), [4, 9]);
  assert.ok(Array.from(find('足背動脈触知良好').hendersonIds).includes(9));
  assert.ok(Array.from(find('術後肢位').hendersonIds).includes(9));
  assert.deepEqual(Array.from(find('と診断され、手術の説明をうけ').hendersonIds).sort((a, b) => a - b), [4, 9, 14]);
});

test('1：病状を聞いた発言・薬の思い込みは14、動けない訴えは4、入浴の希望は10', () => {
  assert.ok(tagsOf('「右足の骨は完全に折れてずれている。6/10に手術をすると聞いていて、今検査をしている」').includes(14));
  const t = tagsOf('「痛み止めって我慢できなくなってから使うものでしょう?」「こんなに痛くちゃ動けないし」');
  assert.ok(t.includes(14) && t.includes(4));
  assert.ok(tagsOf('「体がべたべたして気持ちが悪い。お風呂には入れるといいんだけど・・・」').includes(10));
});

test('1：貧血の検査値（RBC・Hb・Ht）は1.呼吸にも', () => {
  assert.ok(tagsOf('Hb 10.8 g/dL').includes(1));
  assert.ok(!tagsOf('HbA1c 6.0%').includes(1), 'HbA1cは貧血の値ではない');
});

test('2：主訴と、「診断され入院となった」以降の現病歴は「入院時」', () => {
  assert.equal(find('じっとしていると痛くない').timestamp, '入院時');
  assert.equal(find('と診断され、手術の説明をうけ').timestamp, '入院時');
  assert.equal(find('キルシュナー鋼線けん引法').timestamp, '入院時');
  assert.equal(find('人工骨頭置換術(BHA)予定').timestamp, '入院時');
  assert.equal(find('人混みの中で転倒').timestamp, '入院前', '受傷の経緯は入院前のまま');
});

test('3：「〜あるも」で途切れた観察と、荷重の一連の経過は1枚にまとめる', () => {
  assert.ok(find('車椅子移動許可あるも、痛みや動くことへの不安が生じている。'));
  assert.ok(find('なかなか荷重かけられず、荷重をかけ、疼痛増強'));
  assert.ok(!cards.some(c => c.text === '痛みや動くことへの不安が生じている。'));
  assert.ok(find('「大手術だったのに'), '間の本人の発言はそのまま残る');
});

test('3：「〜ず」で終わる観察でも、次が別の話題ならまとめない', () => {
  const c = Array.from(app.classifyTextByRules('10:00\n皮膚トラブル見られず\n創部ガーゼ上層まで汚染なし'));
  assert.equal(c.length, 2, JSON.stringify(c.map(x => x.text)));
});
