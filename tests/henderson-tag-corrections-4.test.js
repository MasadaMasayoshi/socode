'use strict';
// 利用者からの指摘（タグの誤り3件）の検証。適切であれば複数のタグを付けてよい。
//  ①リハビリの進み具合・歩行・日常生活で気をつける姿勢の看護師からの説明が「2. 食事」になっていた
//    → 4.姿勢・14.学び（看護計画の「TP：」を総蛋白TPと取り違えない。「自助具」は2.食事から外す）
//  ②「膀胱留置カテーテル抜去。尿700ml破棄。トイレ時はナースコールしてもらうよう伝える。理解力あり」
//    → 3.排泄を必ず付ける（ナースコールの指導の9.環境、説明の理解の14.学びも付いてよい）
//  ③トイレへの移乗・疼痛と「息子は仕事があるから、迷惑はかけられないわ」の記録が「12. 仕事」になっていた
//    → 家族の仕事は本人の12.仕事ではない。3.排泄・4.姿勢・9.環境・10.コミュニケーション
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const tags = t => Array.from(app.detectMultipleHendersonTags(t.normalize('NFKC'))).sort((a, b) => a - b);

test('①リハビリ・姿勢の説明は4.姿勢と14.学びで、2.食事ではない', () => {
  const a = tags('リハビリは順調に進んでおり、杖歩行へ移行。退院後の日常生活で気をつける姿勢（深くしゃがむ、正座）について看護師より説明。ソックスエイド等の自助具の使用も説明した');
  assert.ok(!a.includes(2), `2.食事が付いている: ${a}`);
  assert.ok(a.includes(4) && a.includes(14), `${a}`);
  const b = tags('EP：日常生活で気をつける姿勢を説明する TP：歩行練習の付き添い');
  assert.ok(!b.includes(2), `看護計画のTPを総蛋白と取り違えている: ${b}`);
  assert.deepEqual(tags('TP 6.5g/dl Alb 3.2g/dl'), [2], '検査値の総蛋白は引き続き2.食事');
  assert.deepEqual(tags('INPUT 1500ml OUTPUT 1200ml'), [], '英単語の一部（OUTPUTの中のTP）には一致しない');
  assert.ok(tags('食事は自助具のスプーンで自力摂取').includes(2), '食事用の自助具は「食事」の語で2.食事');
});

test('②カテーテル抜去・尿の破棄の記録には3.排泄が付く', () => {
  const a = tags('帰室後、膀胱留置カテーテル抜去。 バック内の尿700ml破棄する トイレ時は、ナースコールしてもらうよう伝える。理解力あり');
  assert.ok(a.includes(3), `${a}`);
});

test('③家族の仕事の話は12.仕事にしない。トイレ移乗・疼痛・気持ちの表出のタグが付く', () => {
  const a = tags('トイレへ車いすで移乗する際、右股関節の疼痛あり、ペインスケール6。「かといって息子は仕事があるから、迷惑はかけられないわ」');
  assert.deepEqual(a, [3, 4, 10]); // 疼痛は9.環境にしない
  assert.ok(tags('退院後は仕事に復帰したいと話す').includes(12), '本人の仕事は引き続き12.仕事');
  assert.ok(tags('夫の仕事が忙しく面会は週末のみ').every(t => t !== 12), '夫の仕事も12.仕事にしない');
});

test('願い・希望（「〜したい」）の発言は、ほかのタグがあっても10.コミュニケーション', () => {
  assert.ok(tags('「早く自分でトイレに行けるようになりたい」との言葉も聞かれる').includes(10));
});

test('「分類開始」はいつもルール（AIなし）。AIによる分類・評価は禁止', () => {
  const src = require('./app-helpers').readAppSource();
  assert.match(src, /function getClassifyMode\(\) \{\s*return 'rules';/); // 分類は、いつもサイト内のルール（AIなし）
  assert.doesNotMatch(src, /if \(classifyMode === 'ai' && globalAppData\.apiKey && globalAppData\.notebookContent\)/);
  const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  assert.doesNotMatch(html, /data-classify-mode=/); // 切り替えボタンは廃止
  assert.doesNotMatch(html, /data-classify-mode="ai"/); // 分類はAIなし（ルール）が先。AIは評価に使う
});
