'use strict';
// 利用者からの指摘（患者36）：時刻だけ（[12:00]）で抽出していたため、手術当日・術後1日目・術後2日目の
// 同じ時刻の記録が区別できなかった。日時に日（術後日数）を付け、総合アセスメント表では日ごとに区切る。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const cards = text => Array.from(app.classifyTextByRules(text)).filter(c => c.type !== 'unnecessary');
const p36 = fs.readFileSync(path.join(__dirname, 'golden', 'cases', '患者36.txt'), 'utf8');
const find = (list, s) => list.find(c => c.text.includes(s));

test('時刻には日（手術当日・術後1日目・術後2日目）を付ける', () => {
  const c = cards(p36);
  assert.equal(find(c, '入室').timestamp, '手術当日 9:00');
  assert.equal(find(c, '帰室: 個室301号室').timestamp, '手術当日 12:00');
  assert.equal(find(c, '昼食: 点滴終了').timestamp, '術後1日目 12:00');
  assert.equal(find(c, '昼食: 自力でゆっくり端坐位').timestamp, '術後2日目 12:00', '「翌日」の行で次の日に進む');
  assert.equal(find(c, '「トイレに行きたい」').timestamp, '術後2日目 16:00');
  assert.equal(find(c, '血圧100〜110').timestamp, '手術当日 21:00');
});

test('「術後排便なし」「入院時の様子」のように語が続く「術後」「入院時」は日時として剥がさない', () => {
  const c = cards(p36);
  assert.equal(find(c, '痛み止めって我慢').timestamp, '術後1日目 10:00', '以前は「術後」になっていた');
  assert.equal(find(c, '術後排便なし').timestamp, '術後1日目 10:00');
  const scene = find(c, '入院時の様子');
  assert.ok(scene && scene.text.includes('戸惑い'), '入院時の様子の文章が抜け落ちない');
  assert.equal(c.find(x => x.fieldLabel === '既往歴').timestamp, '入院前', '入院時の様子の後の既往歴が入院時にならない');
});

test('冒頭の事例紹介は日時不明ではなく入院前（入院日は入院時）、入院から手術までの経過は術前', () => {
  const c = cards(p36);
  assert.equal(c.find(x => x.fieldLabel === '現病歴').timestamp, '入院前');
  assert.equal(c.find(x => x.fieldLabel === '診断名').timestamp, '入院前');
  assert.equal(c.find(x => x.fieldLabel === '入院日').timestamp, '入院時');
  assert.equal(find(c, '食事: 常食 1,600kcal').timestamp, '入院時');
  assert.equal(find(c, '足背動脈触知良好').timestamp, '術前');
  // 検査データの表は関連する項目ごとにまとめ（日時は表の最後の時点）、項目ごとの時点は labRows に持つ
  const glucose = find(c, 'HbA1c');
  assert.equal(glucose.timestamp, '術後1日目');
  assert.match(glucose.text, /HbA1c 6\.0%（入院時のみ）/, '表の前の時刻（12:00）を引き継がない');
  // 冒頭に患者紹介の無い文章（看護記録だけ）は入院前にしない
  assert.equal(cards('弾性ストッキング着用し、フットポンプ装着\n8:00 回診\n創部 ガーゼ汚染なし')[0].timestamp, '日時不明');
});

test('日の区切りが無くても時刻が大きく戻ったら次の日、見出しの中の日（＜実習3日目（…手術当日…）＞）でも切り替える', () => {
  const a = cards('術後1日目\n8:00 回診、創部異常なし\n22:00 セファゾリン投与\n8:00 回診、ガーゼ汚染なし');
  assert.equal(a.map(x => x.timestamp).join('|'), '術後1日目 8:00|術後1日目 22:00|術後2日目 8:00');
  const b = cards('10:00 検温、発熱なし\n9:30 内服確認');
  assert.equal(b[1].timestamp, '9:30', '日の分からない時刻はそのまま');
  const g = cards('「怖いね」と話す。＜実習3日目（入院3日目、手術当日・術直後）＞\n14:00 帰室、顔色やや蒼白');
  assert.equal(find(g, '帰室').timestamp, '手術当日 14:00');
  assert.ok(!find(g, '怖いね').text.includes('実習'), '見出しが前の行の文章に残らない');
});

test('日の計算', () => {
  assert.equal(app.nextDayLabel('手術当日'), '術後1日目');
  assert.equal(app.nextDayLabel('術後2日目'), '術後3日目');
  assert.equal(app.nextDayLabel('入院当日'), '入院2日目');
  assert.equal(app.nextDayLabel('6月30日'), '7月1日');
  assert.equal(app.nextDayLabel('入院時'), null);
  assert.equal(app.timestampDayPart('術後1日目 12:00'), '術後1日目');
  assert.equal(app.timestampDayPart('12:00'), '');
  assert.equal(app.timestampClockPart('術後1日目 12:00'), '12:00');
  assert.equal(app.inferAssessmentColumn(null, '手術当日 12:00', null), 'postadmission');
  assert.equal(app.inferAssessmentColumn('現病歴', '入院前', null), 'preadmission');
});

test('総合アセスメント表（画面・印刷）は入院後の欄を日ごとに区切る', () => {
  const groups = app.assessmentDayGroups('postadmission', [
    { timestamp: '手術当日 12:00' }, { timestamp: '術後1日目 8:00' }, { timestamp: '術後1日目 12:00' }, { timestamp: '術後2日目 8:00' }]);
  assert.equal(JSON.stringify(groups.map(g => [g.day, g.items.length])), JSON.stringify([['手術当日', 1], ['術後1日目', 2], ['術後2日目', 1]]));
  assert.equal(app.assessmentDayGroups('missing', [{ timestamp: '術後1日目 8:00' }])[0].day, '', '不足情報の欄は区切らない');
  const src = app.buildAssessmentPrintHtml({ title: 'X', items: [
    { id: 'a', type: 'o', timestamp: '術後1日目 12:00', text: '昼食', hendersonIds: [2], assessmentCols: { 2: 'postadmission' } },
    { id: 'b', type: 'o', timestamp: '術後2日目 12:00', text: '昼食自力', hendersonIds: [2], assessmentCols: { 2: 'postadmission' } }] });
  assert.match(src, /<li class="day">術後1日目<\/li><li>.*?<span class="tm">12:00<\/span>昼食<\/li><li class="day">術後2日目<\/li>/);
});

test('入院時・術後1日目の値が交互に並ぶ検査データも日ごとにまとめて時系列順にし、番号もその順で付ける', () => {
  const items = [
    { id: 'w1', type: 'o', timestamp: '入院時', text: 'WBC 8100', hendersonIds: [7], assessmentCols: { 7: 'postadmission' } },
    { id: 'w2', type: 'o', timestamp: '術後1日目', text: 'WBC 10200', hendersonIds: [7], assessmentCols: { 7: 'postadmission' } },
    { id: 'c1', type: 'o', timestamp: '入院時', text: 'CRP 0.8', hendersonIds: [7], assessmentCols: { 7: 'postadmission' } },
    { id: 'c2', type: 'o', timestamp: '術後1日目', text: 'CRP 1.5', hendersonIds: [7], assessmentCols: { 7: 'postadmission' } },
    { id: 't0', type: 'o', timestamp: '手術当日 12:00', text: '体温37.6度', hendersonIds: [7], assessmentCols: { 7: 'postadmission' } }
  ];
  const groups = app.assessmentDayGroups('postadmission', items);
  assert.equal(groups.map(g => `${g.day}:${g.items.map(i => i.id).join(',')}`).join(' / '), '入院時:w1,c1 / 手術当日:t0 / 術後1日目:w2,c2');
  const out = app.buildAssessmentTableText({ title: 'Z', items });
  assert.match(out, /〈入院時〉\n    ・O-1 \[入院時\] WBC 8100\n    ・O-2 \[入院時\] CRP 0.8\n   〈手術当日〉\n    ・O-3 \[手術当日 12:00\] 体温37.6度\n   〈術後1日目〉\n    ・O-4/);
});
