'use strict';
// 利用者からの指摘（患者36・4.姿勢の欄）：「牽引、安静、荷重、ROM、移乗、歩行訓練は適切。一方『氏名・76歳・血液型』は
// 明らかに不要。診断名などは背景情報として置くなら可だが、主タグにはしなくてよい」
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./app-helpers');
const app = loadApp();

const P36 = fs.readFileSync(path.join(__dirname, 'golden', 'cases', '患者36.txt'), 'utf8');
const cards = Array.from(app.classifyTextByRules(P36));

test('「氏名・76歳・血液型」のカードは4.姿勢にしない', () => {
  const c = cards.find(x => x.text.includes('76歳'));
  assert.ok(c);
  assert.ok(!Array.from(c.hendersonIds).includes(4), JSON.stringify(c.hendersonIds));
});

test('4.姿勢の欄には牽引・安静・荷重・ROM・移乗・歩行訓練の記録が残る', () => {
  const four = cards.filter(x => Array.from(x.hendersonIds).includes(4)).map(x => x.text).join('\n');
  ['牽引', '安静', '荷重', 'ROM', '移乗', '歩行訓練'].forEach(w => assert.ok(four.includes(w), w));
});

test('診断名・現病歴・「〜と診断され」は欄の一番上の「背景」にまとめ、観察・ケアの記録と分ける', () => {
  const list = [
    { id: 'a', text: '入院後すぐにキルシュナー鋼線けん引法4kg開始する。', timestamp: '入院前', type: 'o' },
    { id: 'b', text: '右大腿骨頸部骨折(Garden分類 ステージIV型)', fieldLabel: '診断名', timestamp: '入院前', type: 'o' },
    { id: 'c', text: '右下肢X線、CTでは、右大腿骨頸部骨折と診断され、手術の説明をうけ入院となった。', timestamp: '入院前', type: 'o' },
    { id: 'd', text: '荷重をかけ、疼痛増強', timestamp: '術後1日目 10:00', type: 'o' }
  ];
  const groups = Array.from(app.assessmentDayGroups('preadmission', list));
  assert.equal(groups[0].background, true);
  assert.deepEqual(groups[0].items.map(i => i.id), ['b', 'c']);
  assert.ok(!groups.slice(1).some(g => g.items.some(i => i.id === 'b' || i.id === 'c')));
  assert.ok(groups.slice(1).some(g => g.items.some(i => i.id === 'a')));
});

test('背景のカードが無ければ今まで通り（見出しを増やさない）', () => {
  const list = [{ id: 'a', text: '歩行: 禁止', fieldLabel: '歩行', timestamp: '入院前', type: 'o' }];
  const groups = Array.from(app.assessmentDayGroups('preadmission', list));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].day, '');
});
