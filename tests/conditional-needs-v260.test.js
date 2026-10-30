const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const tags = t => Array.from(app.detectMultipleHendersonTags(t));
const has = (t, n) => assert.ok(tags(t).includes(n), `${t} → ${n} (got ${tags(t)})`);
const not = (t, n) => assert.ok(!tags(t).includes(n), `${t} ✕ ${n} (got ${tags(t)})`);
test('条件で分かれる情報：同じ文に書かれた影響の欲求にも付ける', () => {
  has('呼吸困難のため夜間眠れない', 5); has('階段で息切れがある', 4);
  has('掻痒感が強く熟睡できず', 5); has('下痢が続き肛門周囲に発赤あり', 8);
  has('失禁があり「恥ずかしい」と話す', 10); has('足がむくんで靴が履けない', 6);
  has('発熱があり、発汗多量で寝衣交換', 8); has('不安で眠れない', 5);
  has('手術のことがわからなくて不安', 14); has('右片麻痺のため更衣に介助を要する', 6);
  has('難聴があり説明が聞き取りにくい', 14); has('点滴があり動きにくい', 4);
  has('せん妄で昼夜逆転している', 5); has('むせがあり誤嚥の危険', 1);
  has('低血糖でふらつきあり', 9); has('ベッド上安静で退屈だと話す', 13);
});
test('条件で分かれる情報：症状や影響が否定されていれば付けない（反例）', () => {
  not('嘔気なく食事全量摂取', 5); not('下痢なし', 8);
  not('右下肢の筋力低下はみられるが、ふらつきは少ない', 9);
  not('両下腿に圧痕性浮腫(++)あり', 8);
  not('退院指導：むくみの悪化があれば受診し、服薬を続ける', 6);
});
test('分類基準の文書に、条件で分かれる情報の節がある', () => {
  const t = require('fs').readFileSync(require('path').join(__dirname, '../js/02-reference-data.js'), 'utf8');
  assert.match(t, /■ 条件によって振り分け先が分かれる情報/);
  assert.match(t, /疼痛：眠れない・夜間覚醒→5/);
});
