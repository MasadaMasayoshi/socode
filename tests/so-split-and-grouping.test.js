'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const cards = text => Array.from(app.classifyTextByRules(text)).filter(c => c.type !== 'unnecessary');
const p36 = fs.readFileSync(path.join(__dirname, 'fixtures', 'public-cases', 'hip-contract.txt'), 'utf8');
const all = cards(p36);
const find = s => all.find(c => c.text.includes(s));

test('同じ場面の発言（S）と観察（O）は無理に分けず、1枚のS/O混在カードにまとめる', () => {
  ['あまり食欲がない', '動いてないからお腹が張っている', '体重をかけるのは怖い'].forEach(q => {
    const m = all.find(c => c.text.includes(q));
    assert.ok(m, q);
    assert.equal(m.soMixed, true);
    assert.ok(!m.sceneId);
  });
  assert.match(all.find(c => c.text.includes('あまり食欲がない')).text, /昼食摂取、半分のみ摂取/);
  const scene = all.filter(c => c.text.startsWith('入院時の様子'));
  assert.equal(scene.length, 1);
  assert.equal(scene[0].soMixed, true);
  assert.ok(find('「トイレに行きたい」とナースコールあり'), '観察が短すぎる（ナースコールあり）ときは分けない');
  assert.ok(!find('「トイレに行きたい」とナースコールあり').soMixed);
});

test('発言だけのカード・医療者の説明・短い返事・「と聞いて」の続きは分けない', () => {
  assert.ok(!find('経過は良好だと聞いている').sceneId, '本人より「…」と話す。は発言だけ');
  assert.ok(!find('担当看護師より「今、少しずつ').sceneId, '看護師の説明は分けない');
  const g = app.groupClinicalPhrasesWithTimestamps('声を掛けると開眼し、「ああ」と短く返事をするのみ。');
  assert.equal(g.length, 1);
  const h = app.groupClinicalPhrasesWithTimestamps('「右足の骨は折れている。6/10に手術をする」と聞いて、今検査をしている。');
  assert.equal(h.length, 1);
});

test('S/O混在カードには発言と観察の両方のタグが付く', () => {
  assert.ok(all.find(c => c.text.includes('動いてないからお腹が張っている')).hendersonIds.includes(3));
  assert.deepEqual(Array.from(all.find(c => c.text.startsWith('入院時の様子')).hendersonIds), [10]);
});

test('同じ時刻のバイタルは体温→血圧→脈拍→呼吸→SpO2の順に1枚にまとめる', () => {
  assert.equal(find('体温37.6度').text, '体温37.6度、血圧140/70mmHg、脈拍80回/分整、呼吸20回/分、SpO2 98%(酸素3L経鼻下)');
  assert.equal(find('体温37.6度').timestamp, '手術当日 12:00');

  assert.equal(find('体温 37.0度').text, '検温: 体温 37.0度、血圧125/70、脈拍 74回/分 整、呼吸数 17回/分、SpO2 98% (RA)', '単位の無い血圧もまとめる');
  assert.ok(!all.some(c => c.text === '検温'), '「検温」だけのカードは残らない');
  assert.ok(!all.some(c => /^脈拍 74/.test(c.text)));
});

test('Independent care changes keep their own cards and timestamps', () => {
  const r = find('酸素OFF');
  assert.equal(r.text, '回診: 酸素OFF');
  assert.equal(find('硬膜外麻酔抜去').text, '回診: 硬膜外麻酔抜去');
  assert.equal(find('フットポンプOFF').text, '回診: フットポンプOFF');
  assert.deepEqual(Array.from(r.hendersonIds), [1]);
  assert.deepEqual(Array.from(find('フットポンプOFF').hendersonIds), [9]);
  assert.equal(r.timestamp, '術後1日目 8:00');
  assert.equal(app.splitEnumeratedPhrases('シャワー浴、弾性ストッキング着用').length, 2, '別々の看護行為は引き続き分ける');
});

test('入院時・術後1日目の検査データは関連する項目ごとに変化の分かる1枚にまとめ、異常値も時点ごとに見つかる', () => {
  const anemia = find('貧血・出血（入院時→術後1日目）');
  assert.ok(anemia);
  assert.match(anemia.text, /Hb \(ヘモグロビン\) 14\.0 g\/dl→10\.8g\/dl/);
  assert.equal(anemia.timestamp, '術後1日目');
  assert.ok(find('炎症（入院時→術後1日目）').text.includes('CRP'));
  const findings = app.extractAbnormalLabFindings(all.filter(c => c.type === 'o'));
  const hb = findings.find(f => /ヘモグロビン/.test(f.label) && f.timestamp === '術後1日目');
  assert.ok(hb && hb.direction === 'low', JSON.stringify(findings.map(f => [f.label, f.value, f.timestamp])));
});

test('退院後の生活の知識不足・学びたい気持ちの発言は14.学び', () => {
  assert.ok(find('何に気を付けないといけないのか').hendersonIds.includes(14));
  assert.ok(app.detectMultipleHendersonTags('「家に帰ってから気を付けることは、わからないのでまた教えてください。」').includes(14));
  assert.ok(!app.detectMultipleHendersonTags('「痛い」と話す').includes(14));
});

test('総合アセスメント表：同じ場面のSとOは横並びの枠にまとめる（片方だけならそのまま）', () => {
  const items = [
    { id: 'a', type: 'o', timestamp: '術後1日目 12:00', sceneId: 'x', text: '昼食摂取、半分' },
    { id: 'b', type: 's', timestamp: '術後1日目 12:00', sceneId: 'x', text: '「食欲がない」' },
    { id: 'c', type: 'o', timestamp: '術後1日目 14:00', text: '体温36.8度' },
    { id: 'd', type: 's', timestamp: '術後1日目 18:00', text: '「おなかすかない」' },
    { id: 'e', type: 'o', timestamp: '術後1日目 18:00', text: '夕食摂取量半分' }
  ];
  const scenes = app.groupItemsByScene(items);
  assert.equal(scenes.map(s => `${s.items.map(i => i.id).join('')}:${s.paired}`).join(' '), 'ab:true c:false de:true');
  const html = app.buildAssessmentPrintHtml({ title: 'X', items: items.map(i => ({ ...i, hendersonIds: [2], assessmentCols: { 2: 'postadmission' } })) });
  assert.match(html, /<li class="scene"><table class="so"><tr><td><div>.*「食欲がない」<\/div><\/td><td><div>.*昼食摂取、半分<\/div><\/td><\/tr><\/table><\/li>/, '印刷も左にS・右にO');
});
