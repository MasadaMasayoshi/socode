'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();

const card = (id, text, timestamp) => ({ id, type: 'o', text, timestamp, hendersonIds: [2], assessmentCols: {} });
const cp = () => ({ id: 'p', myAssessments: {}, items: [
  card('a', 'TP 60g/21', '術前'),
  card('b', 'RBC(赤血球数) 511 ×10^4/μL (基準値: 400〜550 ×10^4/μL)', '術前'),
  card('c', 'Hb(ヘモグロビン) 13.5 g/dL (基準値: 11.5〜16.5 g/dL)', '術前'),
  card('d', 'AST (GOT) 150 U/L (基準値: 10〜40 U/L)', '術前'),
  card('e', 'ALT (GPT) 14 U/L (基準値: 5〜45 U/L)', '術前'),
  card('f', 'ALP 221 U/L (基準値: 38〜113 U/L)', '術前'),
  card('g', '【呼吸機能】%肺活量 110.6%', '術前'), card('h', '一秒率69.33%', '術前'),
  card('i', '【血圧】112/72mmHg【脈拍】74回/分【呼吸数】16回/分', '手術前日'),
  card('j', 'RBC4587/uL', '手術当日'),
  card('k', 'Hb 12.2 g/dL (基準値: 11.5〜16.5 g/dL)', '手術当日'),
  card('l', 'AST 2 U/L (基準値: 10〜40 U/L)', '手術当日'),
  card('m', 'ALT 250 U/L (基準値: 5〜45 U/L)', '手術当日'),
  card('n', '7/ ML. . PE5-t 264U/L. . .', '手術当日'),
  card('o', 'WBC 11600 /μL (基準値: 4,000〜9,000 /μL)', '手術当日'),
  card('p', '【食事】絶飲食 腹腔鏡下胃全摘術', '手術当日'),
  card('q', '喫煙20本/日 10年前に禁煙', '入院前')
] });

test('原文は書き換えず、単位・桁が崩れた値は「要確認」にして、予想は別に出す（確度が中以上のときだけ値を出す）', () => {
  const tp = app.analyzeLabCard('TP 60g/21', null);
  assert.equal(tp.source, 'TP 60g/21');
  assert.equal(tp.quality, 'suspicious');
  assert.equal(tp.status, 'review');
  assert.equal(tp.prediction.confidence, 'medium');
  assert.equal(tp.prediction.text, 'TP 6.0 g/dL');
  assert.equal(tp.valueRaw, '60');
  const rbc = app.analyzeLabCard('RBC4587/uL', { valueStd: 511, phase: '術前' });
  assert.equal(rbc.status, 'review');
  assert.equal(rbc.prediction.confidence, 'high');
  assert.match(rbc.prediction.text, /RBC 458\.7/);
  assert.equal(rbc.source, 'RBC4587/uL');
});

test('極端な変化は原本確認が必要。予想の値は作らない。CRPの術後の上昇は変化の確認から除く', () => {
  const ast = app.analyzeLabCard('AST 2 U/L (基準値: 10〜40 U/L)', { valueStd: 150, phase: '術前' });
  assert.equal(ast.status, 'review');
  assert.equal(ast.prediction, null);
  const alt = app.analyzeLabCard('ALT 250 U/L', { valueStd: 14, phase: '術前' });
  assert.equal(alt.status, 'review');
  const crp = app.analyzeLabCard('CRP 8.0 mg/dL', { valueStd: 0.3, phase: '術前' });
  assert.equal(crp.quality, 'valid');
  assert.equal(crp.status, 'high');
});

test('読み取れない文字列は検査値にせず（原文不明瞭）、ヘンダーソンの分類にも入れない', () => {
  const b = app.analyzeLabCard('7/ ML. . PE5-t 264U/L. . .', null);
  assert.equal(b.kind, 'broken');
  assert.equal(b.quality, 'corrupted');
  assert.equal(app.isLabTextUnreliable('7/ ML. . PE5-t 264U/L. . .'), true);
  assert.equal(app.isLabTextUnreliable('TP 60g/21'), true);
  assert.equal(app.isLabTextUnreliable('RBC4587/uL'), true);
  assert.equal(app.isLabTextUnreliable('Hb 12.2 g/dL'), false);
  assert.equal(app.isLabTextUnreliable('AST 2 U/L'), false);
  assert.deepEqual(Array.from(app.detectMultipleHendersonTags('TP 60g/21')), []);
  assert.deepEqual(Array.from(app.labCategoryTags('RBC4587/uL')), []);
});

test('基準値の判定・推移・呼吸機能・バイタルサイン・考察（〜ではないかと考えられる）を、事実と分けて出す', () => {
  const a = app.buildLabAssessment(cp());
  assert.equal(a.has, true);
  assert.deepEqual(Array.from(a.checks), []);
  const t = a.text;
  assert.match(t, /【検査データ臨床評価・アセスメントノート】/);
  assert.doesNotMatch(t, /まだ行っていません/);
  assert.match(t, /TP：原文「TP 60g\/21」[\s\S]*判定：要確認[\s\S]*TP 6\.0 g\/dL 前後ではないかと予想されます（推定確度：中）/);
  assert.match(t, /Hb：13\.5 → 12\.2 g\/dL\n　判定：基準範囲内[\s\S]*推移：術前より低下しています（基準範囲内の変化）/);
  assert.match(t, /WBC：.*\n　判定：高値/);
  assert.match(t, /RBC：原文「RBC4587\/uL」[\s\S]*推定確度：高/);
  assert.match(t, /AST：原文「AST 2 U\/L[^」]*」[\s\S]*判定：要確認/);
  assert.match(t, /ALT：原文「ALT 250 U\/L[^」]*」[\s\S]*判定：要確認/);
  assert.match(t, /原文「7\/ ML\. \. PE5-t 264U\/L\. \. \.」[\s\S]*判定：原文不明瞭/);
  assert.match(t, /%肺活量：110\.6%[\s\S]*基準範囲内/);
  assert.match(t, /1秒率：69\.33%[\s\S]*低値（一般的な目安 70%以上。年齢・性別・施設・判定法で基準が異なる/);
  assert.match(t, /血圧：112\/72mmHg[\s\S]*基準範囲内/);
  assert.match(t, /Hbが術前より低下しているため、手術に伴う出血や周術期の影響ではないかと考えられる/);
  assert.match(t, /WBCの上昇は術後の炎症反応によるものではないかと考えられるが、感染徴候/);
  assert.doesNotMatch(t, /感染している|正しい値は|修正しました/);
  // 要確認の値は推移・考察に使わない（ASTの考察は、術前の値だけで出る高値の考察）
  assert.doesNotMatch(t, /ALTが高値/);
});

test('検査値が無い記録では評価を作らず、保存されたAIの結果があればそちらを優先する', () => {
  assert.equal(app.buildLabAssessment({ items: [{ id: 'x', type: 's', text: '食欲あり' }] }).has, false);
});


test('換算済みの実測値を原文の基準値と同じ単位で比較する', () => {
  for (const [value, expected] of [[3, 'low'], [5, 'normal'], [9, 'high']]) {
    for (const measurement of [`${value} ×10^3/μL`, `${value * 1000} /μL`]) {
      const result = app.analyzeLabCard(`WBC ${measurement} (基準値: 3.3〜8.6 ×10^3/μL)`);
      assert.equal(result.status, expected, measurement);
      assert.equal(result.valueStd, value * 1000, '推移のための内蔵単位は維持');
    }
  }
  assert.equal(app.analyzeLabCard('WBC 5000 /μL (基準値: 3.3〜8.6 mg/dL)').status, 'unknown', '換算不能な単位は判定しない');
});
