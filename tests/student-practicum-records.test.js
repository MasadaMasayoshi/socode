'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const cards = t => Array.from(app.classifyTextByRules(t));
const byText = (c, re) => c.find(x => re.test(x.text));

test('【本日の目標】【行動計画】【考察】【明日の課題】の下は学生の計画・考えなので不要カード。計画の時刻で実施の記録がずれない', () => {
  const c = cards('成人看護学実習Ⅱ　実習記録（3日目）\n【本日の目標】\n疼痛の状況を把握する。\n【行動計画】\n9:00　バイタルサイン測定\n【実施したこと・患者の反応】\n9:00　創部に発赤なし。\n【考察】\n疼痛は軽減していると考える。\n【明日の課題】\n・歩行時のふらつきの原因を調べる');
  assert.equal(c[0].type, 'unnecessary', '題名');
  assert.equal(byText(c, /疼痛の状況を把握/).type, 'unnecessary');
  assert.equal(byText(c, /バイタルサイン測定/).type, 'unnecessary');
  assert.equal(byText(c, /疼痛は軽減/).type, 'unnecessary');
  assert.equal(byText(c, /ふらつきの原因/).type, 'unnecessary');
  const obs = byText(c, /創部に発赤なし/);
  assert.equal(obs.type, 'o');
  assert.equal(obs.timestamp, '9:00');
});

test('ヘンダーソンの用紙：「1．正常に呼吸する」の下の S：・O： は印を外し、その項目のタグも付ける。「アセスメント：」は不要', () => {
  const c = cards('情報収集・アセスメント用紙（ヘンダーソン）\n4．身体の位置を動かし、よい姿勢を保持する\nS：「膝が痛くて、あまり歩かないようにしている」\nO：1日の歩数は約2,000歩。\nアセスメント：活動量が少ない。\n\n5．睡眠と休息をとる\nO：22時〜6時まで入眠。');
  assert.equal(c[0].type, 'unnecessary');
  const s = c.find(x => x.text === '「膝が痛くて、あまり歩かないようにしている」');
  assert.ok(s, JSON.stringify(c.map(x => x.text)));
  assert.equal(s.type, 's');
  assert.ok(s.hendersonIds.includes(4));
  assert.equal(byText(c, /^アセスメント/).type, 'unnecessary');
  const sleep = byText(c, /22時〜6時まで入眠/);
  assert.ok(!/^O[:：]/.test(sleep.text), sleep.text);
  assert.ok(sleep.hendersonIds.includes(5));
});

test('日々の記録：題名の日付を日の区切りにし、夜勤Ns.からの情報はO、振り返り・指導者の助言は不要', () => {
  const c = cards('老年看護学実習　日々の記録　10/7（火）\n夜勤Ns.より「夜中は少しそわそわしていた」と情報を得た。\n8:30\nバイタル：体温36.4度、脈拍84回/分（不整あり）、血圧112/62、SpO2 95%（酸素1L）\n15:00\n学生の関わりの振り返り：足浴はリラックスできたと思う。\n指導者より「食事中の姿勢にも注目してみてください」とアドバイスをいただいた。');
  const ns = byText(c, /夜勤Ns\./);
  assert.equal(ns.type, 'o');
  assert.equal(ns.timestamp, '10月7日');
  const v = byText(c, /体温36\.4度/);
  assert.match(v.text, /血圧112\/62/);
  assert.match(v.text, /脈拍84回\/分\(不整あり\)/);
  assert.ok(!c.some(x => /^バイタル/.test(x.text)), JSON.stringify(c.map(x => x.text)));
  assert.equal(byText(c, /振り返り/).type, 'unnecessary');
  assert.equal(byText(c, /指導者より/).type, 'unnecessary');
});

test('プロセスレコード：「私が感じたこと・考えたこと」「私の言動」は不要、「患者の言動：」は見出しを外して患者の言動だけ', () => {
  const c = cards('精神看護学実習　プロセスレコード\n場面を選んだ理由：初めて家族の話をしてくれたため。\n①患者の言動：「母がね、たまに来るの」とうつむいた。\n②私が感じたこと・考えたこと：自分を責めているように感じた。\n③私の言動：しばらく黙ってそばに座っていた。');
  assert.equal(byText(c, /場面を選んだ理由/).type, 'unnecessary');
  const p = byText(c, /母がね/);
  assert.equal(p.text, '「母がね、たまに来るの」とうつむいた。');
  assert.equal(p.type, 's');
  assert.equal(byText(c, /感じたこと/).type, 'unnecessary');
  assert.equal(byText(c, /私の言動/).type, 'unnecessary');
});

test('小児の箇条書き：「〇情報（朝）」は見出し、「〇家族：」は印を外して9.環境、体温の（腋窩）も値に含める、「〇気づいたこと」の下は不要', () => {
  const c = cards('小児看護学実習　記録　（10/14）\n〇家族：父（会社員）、母（パート）。母が日中付き添い。\n〇情報（朝）\n・体温37.6℃（腋窩）、脈拍118回/分\n〇気づいたこと\n母の疲労が強いと感じた。');
  const fam = byText(c, /^家族:/);
  assert.ok(fam, JSON.stringify(c.map(x => x.text)));
  assert.ok(fam.hendersonIds.includes(9));
  assert.ok(!fam.hendersonIds.includes(12));
  assert.equal(byText(c, /情報\(朝\)/).type, 'unnecessary');
  assert.ok(byText(c, /体温37\.6°C\(腋窩\)/));
  assert.ok(!c.some(x => /^\(腋窩\)/.test(x.text)));
  assert.equal(byText(c, /母の疲労/).type, 'unnecessary');
  assert.equal(byText(c, /体温/).timestamp, '10月14日');
});

test('「14時ごろ、…」の行頭の時刻を読む・「学籍番号：********」の伏せてある値は伏せ字にしない', () => {
  const c = cards('10/9\n14時ごろ、デイルームで一人で座っていた。');
  assert.equal(c[0].timestamp, '10月9日 14:00');
  assert.equal(c[0].text, 'デイルームで一人で座っていた。');
  const ctx = app.createMaskContext([]);
  assert.equal(app.maskPersonalInfo('学籍番号:******** 氏名:********', ctx), '学籍番号:******** 氏名:********');
  const ctx2 = app.createMaskContext([]);
  assert.equal(app.maskPersonalInfo('学籍番号：12345678　氏名：山田 花子', ctx2), '学籍番号：〈伏せ字1〉　氏名：〈伏せ字2〉');
});

test('「Day 1（月・術後3日目）」はかっこの中の日で区切り、「Sデータ」「Oデータ」だけの行は見出し（利用者の実習記録）', () => {
  const c = cards('実習開始時の状況：術後3日目（月曜日）から1週間受け持つ設定。\nDay 1（月・術後3日目）\nSデータ\n\n「昨日の夜は、何回か目が覚めてしまったわ。」\n\nOデータ\n\nバイタル：BT 37.1℃、HR 82回/分、BP 138/80mmHg、SpO2 97%(RA)\n\nDay 2（火・術後4日目）\nSデータ\n\n「お腹が少し張る感じがするね。」');
  assert.equal(byText(c, /受け持つ設定/).type, 'unnecessary');
  assert.equal(byText(c, /^Day 1/).type, 'unnecessary');
  assert.equal(byText(c, /^Sデータ$/).type, 'unnecessary');
  const s1 = byText(c, /目が覚めて/);
  assert.equal(s1.timestamp, '術後3日目');
  assert.ok(s1.hendersonIds.includes(5));
  assert.equal(byText(c, /BT 37\.1/).timestamp, '術後3日目');
  const s2 = byText(c, /お腹が少し張る/);
  assert.equal(s2.timestamp, '術後4日目');
  assert.ok(s2.hendersonIds.includes(3));
});

test('「理学療法士（PT）と共に」「PT見守り」「PT、MSW」のPTは検査値ではない・「麻酔から目が覚める」は5.睡眠にしない', () => {
  const tags = t => Array.from(app.detectMultipleHendersonTags(t));
  assert.ok(!cards('活動：理学療法士（PT）と共にベッドサイド端坐位')[0].hendersonIds.includes(2));
  assert.ok(!cards('活動：T字杖歩行の訓練開始（PT見守り）')[0].hendersonIds.includes(2));
  assert.ok(!cards('病棟看護師、PT、MSWを交えてカンファレンスを実施予定')[0].hendersonIds.includes(2));
  assert.ok(!tags('麻酔からちゃんと目が覚めるか心配です').includes(5));
});
