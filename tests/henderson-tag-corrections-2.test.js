'use strict';
// 利用者からのヘンダーソン14項目の分類の指摘（患者34）の回帰テスト。
//  1.呼吸：疼痛（ペインスケール・「疼痛訴えなく」）は9(安楽)、MMTは4(姿勢)、弾性ストッキングは9・6
//  2.食事：SpO2は1、Cre・BUN・eGFRは3、WBC・CRPは7、PT%・APTT・Dダイマーは9（検査値に一律2を付けない）
//  3.排泄：出血量は9
//  4.姿勢：入浴・洗髪・歯磨きの自立は8、更衣の自立は6、感覚（聴覚・視覚・平衡感覚・触覚）は9・10
//  10.コミュニケーション：「呼吸困難訴えなし…」は1（否定された「訴え」では10を付けない）
//  14.学び：飲酒は2

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const { detectMultipleHendersonTags, labCategoryTags } = loadApp();
const tags = t => Array.from(detectMultipleHendersonTags(t)).sort((a, b) => a - b);
const labTags = t => Array.from(labCategoryTags(t)).sort((a, b) => a - b);

test('疼痛に関する記載は1(呼吸)ではなく9(安楽)', () => {
  assert.deepEqual(tags('動かなければ疼痛訴えなく、鎮痛剤の内服も行わず経過。'), [9]);
  assert.ok(tags('疼痛: 安静時ペインスケール「2-3」').includes(9));
  assert.ok(!tags('疼痛: 安静時ペインスケール「2-3」').includes(1));
});

test('MMT（筋力評価）は4(姿勢)', () => {
  assert.ok(tags('右上肢・左上下肢 MMT 5。').includes(4));
  const t = tags('MMT:患肢は疼痛のため評価不可、右上肢 MMT 5');
  assert.ok(t.includes(4) && !t.includes(1));
});

// 患者36の指摘で、弾性ストッキング（血栓予防）は6(衣服)ではなく9(環境)だけにした
test('弾性ストッキングは1(呼吸)・6(衣服)ではなく9(環境)', () => {
  assert.deepEqual(tags('右下肢に弾性ストッキング着用中。'), [9]);
});

test('検査値・バイタルのタグは何の指標かで決まる（一律に2(食事)を付けない）', () => {
  assert.deepEqual(labTags('SpO2 98%(室内空気)'), [1]);
  assert.deepEqual(labTags('Cre 0.56 mg/dL'), [3]);
  assert.deepEqual(labTags('BUN 21 mg/dL'), [3]);
  assert.deepEqual(labTags('eGFR 73.6'), [3]);
  assert.deepEqual(labTags('WBC (白血球) 8100/μL'), [7]);
  assert.deepEqual(labTags('CRP (C反応性蛋白) 1.5mg/dl'), [7]);
  assert.deepEqual(labTags('PT% 96%'), [9]);
  assert.deepEqual(labTags('APTT 26.5秒'), [9]);
  assert.deepEqual(labTags('Dダイマー 2.3 μg/mL'), [9]);
  assert.deepEqual(labTags('PLT (血小板) 23.5×10^4/μL'), [9]);
});

test('栄養・代謝の指標は引き続き2(食事)（回帰確認）', () => {
  ['TP (総蛋白) 6.2g/dl', 'ALB (アルブミン) 3.7g/dl', 'Hb (ヘモグロビン) 10.8g/dL', 'FBS (空腹時血糖) 105mg/dl', 'HbA1c 6.0 %', 'AST 30 U/L']
    .forEach(t => assert.deepEqual(labTags(t), [2], t));
});

test('出血量は3(排泄)ではなく9(環境)', () => {
  assert.deepEqual(tags('出血量:350ml(輸血なし)'), [9]);
});

test('入浴・洗髪・歯磨き・更衣の「自立」は4(姿勢)にならない', () => {
  assert.deepEqual(tags('清潔: 入浴 1回/日 自立(最終日 6/7)、洗髪 1回/日 自立、歯磨き 3回/日 自立。'), [8]);
  assert.deepEqual(tags('更衣: 自立'), [6]);
  assert.ok(!tags('排尿: 7回/日程度(夜間2回)自立').includes(4));
  assert.ok(tags('活動: 自立、装具/器具の使用なし').includes(4), '活動の自立は引き続き4(姿勢)');
});

test('感覚（聴覚・視覚・平衡感覚・触覚）は4(姿勢)ではなく9(環境)と10(コミュニケーション)', () => {
  assert.deepEqual(tags('感覚: 聴覚・視覚(老眼鏡使用あり)・平衡感覚・触覚いずれも障害なし'), [9, 10]);
});

test('「訴えなし」は10(コミュニケーション)の手がかりにしない。症状を訴えるのは症状の項目（10は付けない）', () => {
  assert.deepEqual(tags('呼吸困難訴えなし、自力排痰可能、肺Air入り良好(深呼吸できる)'), [1]);
  // 【変更】以前は「痛みを訴える」にも10を付けていたが、身体の症状の報告は症状の項目の情報であり、
  // 10.コミュニケーションではない（利用者からの指摘：患者34）。ほかにどの項目も当てはまらないときだけ10。
  assert.deepEqual(tags('創部の痛みを訴える'), [9]);
  assert.deepEqual(tags('何かを訴えている様子'), [10]);
});

test('飲酒は14(学び)ではなく2(食事)', () => {
  assert.deepEqual(tags('飲酒: なし'), [2]);
});
