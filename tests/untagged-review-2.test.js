'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp, readAppSource } = require('./app-helpers');
const app = loadApp();
const tagsOf = t => Array.from(app.detectMultipleHendersonTags(t));
const card = (text, s) => Array.from(app.classifyTextByRules(text)).find(c => c.text.includes(s));

test('家族の住まい・支援者・アレルギー・常用薬・入院歴・病期はキーワードで9（病期は14も。常用薬は薬剤そのものなので14にしない：患者36の指摘）', () => {
  assert.ok(tagsOf('長男(53歳)・次男(50歳)はそれぞれ結婚し、別世帯に暮らしている。').includes(9));
  assert.ok(tagsOf('長男夫婦が同町内に住んでいる。').includes(9));
  assert.ok(tagsOf('援助者:長男とその嫁(主に長男が世話を行っている)').includes(9));
  assert.ok(!tagsOf('アレルギー: なし').includes(9));
  assert.ok(!tagsOf('常用薬: ノルバスク2.5mg 1錠×朝').includes(9));
  assert.ok(tagsOf('出産時以外入院歴なし、手術歴なし').includes(9));
  assert.ok(!tagsOf('Stage 1B').includes(14));
  assert.ok(tagsOf('精神状態は現状認識できている。').includes(10));
  assert.ok(tagsOf('胃底部の病変があり、胃を全摘し、R-Y法で再建した。').includes(2));
});

test('年齢・性別だけの基本情報は年齢と同じ9（4.姿勢は付けない：患者36の指摘）、病名の行は診断名と同じく病名から推測', () => {
  assert.deepEqual(Array.from(card('事例：B氏（65歳・女性）', 'B氏').hendersonIds), [9]);
  assert.ok(card('疾患：右アテローム血栓性脳梗塞', '脳梗塞').hendersonIds.includes(4));
  assert.deepEqual(Array.from(card('学歴：大学卒', '大学卒').hendersonIds), [14]);
});

test('OCRで読み取れなかった検査値の残りは不要な情報（読める検査値の行はそのまま）', () => {
  assert.equal(app.isUnnecessaryBoilerplateText('/uL. /uL. . . .6 7/ ML. . PE5-t 264U/L. . mEa/L.'), true);
  assert.equal(app.isUnnecessaryBoilerplateText('WBC11600/uL. RBC4587/uL. Hb12.2g/dl. Ht37.2%. Plt23.6'), false);
});

test('生殖は基準ノートどおり「追加キーワード」で決めるので自動では付けず、理由を「タグ未設定」の印に出す', () => {
  assert.deepEqual(tagsOf('生殖: 特に問題なし 出産歴2回、閉経50歳'), []);
  const src = readAppSource();
  assert.match(src, /function untaggedReasonOf/);
  assert.match(src, /title="\$\{escapeHtml\(untaggedReasonOf\(item\)\)\}"/, '分類ボードの「タグ未設定」に理由');
  assert.match(src, /title="\$\{escapeHtml\(untaggedReasonOf\(i\)\)\}"/, '一覧表示の「タグ未設定」に理由');
});

test('公開用の架空7事例の未タグカードは、理由と手動確認候補を持ち、点検で本文やタグを変更しない', () => {
  const cases = require('./public-case-helpers').loadPublicCases();
  assert.equal(cases.length, 7);
  let reviewed = 0;
  for (const {id,text} of cases) {
    const cards = Array.from(app.classifyTextByRules(text));
    assert.ok(cards.length > 0, id);
    for (const card of cards.filter(c=>c.type!=='unnecessary' && c.hendersonIds.length===0)) {
      const before = JSON.stringify(card);
      const review = app.inferUntaggedReason(card);
      assert.ok(typeof review.reason==='string' && review.reason.trim(), `${id}: ${card.text}`);
      assert.ok(Array.isArray(review.candidates));
      assert.equal(JSON.stringify(card), before);
      reviewed++;
    }
  }
  assert.ok(reviewed > 0, '未タグ確認の検証対象が必要');
});
