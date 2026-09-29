'use strict';
// 利用者からの指摘（患者34＝例文の文章）の検証。適切であれば複数のタグを付けてよい。
//  ・既往歴「2型糖尿病、高血圧症にて内服加療中」は呼吸器の病気ではない → 1.呼吸にしない（2.食事・14.学び）
//  ・生活歴「元会社員（20年前に退職）、喫煙歴なし、機会飲酒あり」は項目ごとに分ける → 12.仕事／1.呼吸／2.食事
//  ・診断名「市中肺炎の疑い」は 2.食事・5.睡眠・8.清潔 にしない → 1.呼吸・7.体温・9.環境
//  ・「息苦しくて夜もあまり眠れなかった…」と訴える、「少し呼吸が楽になった」と話す は症状の報告
//    → 10.コミュニケーションにしない（1.呼吸・5.睡眠・7.体温）
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const byText = () => {
  const map = {};
  Array.from(app.classifyTextByRules(app.SAMPLE_TEXT)).forEach(c => { map[c.text] = Array.from(c.hendersonIds); });
  return map;
};

test('既往歴の高血圧・糖尿病は1.呼吸にしない', () => {
  assert.deepEqual(byText()['2型糖尿病、高血圧症にて内服加療中'], [2, 14]);
  assert.ok(app.detectMultipleHendersonTags('血圧142/86mmHg').includes(1), '測った血圧は引き続き1.呼吸（循環）');
});

test('生活歴は項目ごとのカードに分ける', () => {
  const m = byText();
  assert.deepEqual(m['元会社員(20年前に退職)'], [12]);
  assert.deepEqual(m['喫煙歴なし'], [1]);
  assert.deepEqual(m['機会飲酒あり'], [2]);
  const one = Array.from(app.classifyTextByRules('生活歴：仕事は退職し、現在は妻と二人暮らし'));
  assert.equal(one.length, 1, '文として続いている生活歴は分けない');
});

test('肺炎の診断名は1.呼吸・7.体温・9.環境', () => {
  assert.deepEqual(byText()['市中肺炎の疑い'], [1, 7, 9]);
});

test('症状を訴える・話す発言には10.コミュニケーションを付けない', () => {
  const m = byText();
  assert.deepEqual(m['「息苦しくて夜もあまり眠れなかった。横になると特に苦しい」と訴える。'], [1, 5]);
  // 発言（S）と観察（O）は別のカードに分ける（患者36の指摘）
  assert.deepEqual(m['「少し呼吸が楽になった」と話す。'], [1]);
  assert.deepEqual(m['再度体温を測定すると38.2°Cに上昇していた。'], [7]);
  assert.ok(app.detectMultipleHendersonTags('「緊張のせいか食欲がない」と話す').includes(10), '気持ち（緊張）の表出は10');
});

test('家族の職業は12.仕事にしない', () => {
  assert.ok(!app.detectMultipleHendersonTags('長男:23歳、会社員、近所に在住').includes(12));
});
