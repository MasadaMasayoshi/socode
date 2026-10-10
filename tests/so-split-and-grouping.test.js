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

test('発言（S）と観察（O）が混ざったカードは同じ場面の2枚に分け、Sには何の場面か分かるよう（場面：…）を添える', () => {

  const pairs = [
    ['「あまり食欲がない」（場面：ベッドアップし、昼食摂取、半分のみ摂取、疼痛増強見られず）', 'ベッドアップし、昼食摂取、半分のみ摂取、疼痛増強見られず'],
    ['「動いてないからお腹が張っている」（場面：排便なし(3日目なし)腸蠕動あり、排ガスあり）', '排便なし(3日目なし)腸蠕動あり、排ガスあり'],
    ['「体重をかけるのは怖い」（場面：端坐位→車いすへ移乗行う）', '端坐位→車いすへ移乗行う']
  ];
  pairs.forEach(([sText, oText]) => {
    const s = all.find(c => c.text === sText);
    const o = all.find(c => c.text === oText);
    assert.ok(s && o, `${sText} / ${oText}`);
    assert.equal(s.type, 's');
    assert.equal(o.type, 'o');
    assert.ok(s.sceneId && s.sceneId === o.sceneId, '同じ場面の印');
    assert.equal(s.timestamp, o.timestamp);
  });
  const scene = all.filter(c => c.text.startsWith('入院時の様子'));
  assert.equal(scene.length, 2);
  assert.equal(scene.find(c => c.type === 's').text, '入院時の様子: 息子たちの前では、「大丈夫よ。心配しないで」と言っていた。受持ち看護師には、「嫁には頼れないしね・・・かといって息子は仕事もあるし、迷惑はかけられないわ」とも言っていた。', '誰に言ったのかを残す');
  assert.equal(scene.find(c => c.type === 'o').text, '入院時の様子: 怪我での入院、手術と初めてのことばかりで戸惑いも多い様子だった。入院診療計画書には、自宅退院までおよそ14日程度を要すると記載されていた。');
  assert.ok(find('「トイレに行きたい」とナースコールあり'), '観察が短すぎる（ナースコールあり）ときは分けない');
});

test('発言だけのカード・医療者の説明・短い返事・「と聞いて」の続きは分けない', () => {
  assert.ok(!find('経過は良好だと聞いている').sceneId, '本人より「…」と話す。は発言だけ');
  assert.ok(!find('担当看護師より「今、少しずつ').sceneId, '看護師の説明は分けない');
  const g = app.groupClinicalPhrasesWithTimestamps('声を掛けると開眼し、「ああ」と短く返事をするのみ。');
  assert.equal(g.length, 1);
  const h = app.groupClinicalPhrasesWithTimestamps('「右足の骨は折れている。6/10に手術をする」と聞いて、今検査をしている。');
  assert.equal(h.length, 1);
});

test('分けた発言に話題のタグが無ければ同じ場面の観察のタグを付け、観察にタグが無ければ発言のタグを付ける', () => {
  assert.ok(all.find(c => c.text.startsWith('「動いてないからお腹が張っている」')).hendersonIds.includes(3));
  assert.deepEqual(Array.from(all.find(c => c.type === 'o' && c.text.startsWith('入院時の様子')).hendersonIds), [10]);
});

test('同じ時刻のバイタルは体温→血圧→脈拍→呼吸→SpO2の順に1枚にまとめる', () => {
  assert.equal(find('体温37.6度').text, '体温37.6度、血圧140/70mmHg、脈拍80回/分整、呼吸20回/分、SpO2 98%(酸素3L経鼻下)');
  assert.equal(find('体温37.6度').timestamp, '手術当日 12:00');

  assert.equal(find('体温 37.0度').text, '検温: 体温 37.0度、血圧125/70、脈拍 74回/分 整、呼吸数 17回/分、SpO2 98% (RA)', '単位の無い血圧もまとめる');
  assert.ok(!all.some(c => c.text === '検温'), '「検温」だけのカードは残らない');
  assert.ok(!all.some(c => /^脈拍 74/.test(c.text)));
});

test('同じ時刻の処置の列挙（酸素OFF、硬膜外麻酔抜去、フットポンプOFF）は「回診:」の1枚', () => {
  const r = find('酸素OFF');
  assert.equal(r.text, '回診: 酸素OFF、硬膜外麻酔抜去、フットポンプOFF');
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
