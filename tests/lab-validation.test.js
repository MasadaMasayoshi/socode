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
  assert.equal(tp.prediction.confidence, 'unknown'); // unit read-over AND decimal shift: confidence is not claimed
  assert.equal(tp.prediction.text, 'TP 6.0 g/dL');
  assert.equal(tp.valueRaw, '60');
  const rbc = app.analyzeLabCard('RBC4587/uL', { valueStd: 511, phase: '術前' });
  assert.equal(rbc.status, 'review');
  assert.equal(rbc.prediction.confidence, 'unknown');
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
  assert.match(t, /TP：原文「TP 60g\/21」[\s\S]*判定：要確認[\s\S]*TP 6\.0 g\/dL 前後ではないかと予想されます（推定確度：不明/);
  assert.match(t, /この候補どおりなら低値になります/);
  assert.doesNotMatch(t, /一般的な範囲に収まる読み方/);
  assert.match(t, /Hb：13\.5 → 12\.2 g\/dL\n　判定：基準範囲内[\s\S]*推移：術前より低下しています（基準範囲内の変化）/); // sex not written: the common range is used as before
  assert.match(t, /WBC：.*\n　判定：高値/);
  assert.match(t, /RBC：原文「RBC4587\/uL」[\s\S]*推定確度：不明/);
  assert.match(t, /AST：原文「AST 2 U\/L[^」]*」[\s\S]*判定：要確認/);
  assert.match(t, /ALT：原文「ALT 250 U\/L[^」]*」[\s\S]*判定：要確認/);
  assert.match(t, /原文「7\/ ML\. \. PE5-t 264U\/L\. \. \.」[\s\S]*判定：項目不明・判定不可/);
  assert.doesNotMatch(t, /ALP 264/);
  assert.match(t, /ALT：原文[\s\S]*確認の優先度：高（原文どおりなら基準の上限の約5\.6倍/);
  assert.match(t, /ALP：221 U\/L\n　判定：判定保留（測定法が記録にないため。IFCC法の基準（38〜113 U\/L）なら高値、JSCC法の基準（106〜322 U\/L）なら基準範囲内）/);
  assert.doesNotMatch(t, /ALPが高値/);
  assert.match(t, /ASTが150 U\/Lと高値である。肝細胞の障害のほか、骨格筋由来や溶血/);
  assert.match(t, /%肺活量：110\.6%[\s\S]*基準範囲内/);
  assert.match(t, /1秒率：69\.33%[\s\S]*低値（一般的な目安 70%以上。年齢・性別・施設・判定法で基準が異なる/);
  assert.match(t, /血圧：112\/72mmHg[\s\S]*基準範囲内/);
  assert.match(t, /Hbが13\.5から12\.2 g\/dLに低下している。手術に伴う出血や輸液による希釈などが影響した可能性がある/);
  assert.match(t, /WBCは11,600\/μLと高値である。手術侵襲による炎症反応の可能性があるが、数値だけでは感染の有無を判断できない/);
  assert.match(t, /手術当日の値は、採血時刻（手術の前か後か）が記録から分からないため、術後の変化と決めずに/);
  assert.doesNotMatch(t, /感染している|正しい値は|修正しました/);

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

test('基準値の数値が内蔵値と同じでも、記録の由来を自動承認しない', () => {
  const builtIn = app.analyzeLabCard('AST 20 U/L');
  assert.equal(builtIn.ref.origin, 'general');
  const matching = app.analyzeLabCard('AST 20 U/L (基準値: 10〜40 U/L)');
  assert.equal(matching.ref.origin, 'unverified');
  assert.equal(matching.status, 'normal');
  const different = app.analyzeLabCard('AST 20 U/L (基準値: 5〜35 U/L)');
  assert.equal(different.ref.origin, 'source');
  const result = app.buildLabAssessment({items:[card('x','AST 20 U/L (基準値: 10〜40 U/L)','入院前')]});
  assert.match(JSON.stringify(result), /内蔵値と一致・由来未確認/);
});

test('同じ標準単位の基準値では低値・正常・高値を判定する', () => {
  for (const [value, status] of [[8,'low'],[20,'normal'],[50,'high']]) {
    assert.equal(app.analyzeLabCard(`AST ${value} U/L (基準値: 10〜40 U/L)`).status,status);
  }
});

test('削除・除外・AI提案の値を判定・推移・考察の根拠にしない', () => {
  const active = card('active','AST 20 U/L','入院前');
  for (const extra of [{deleted:true},{type:'unnecessary'},{aiSuggested:true}]) {
    const excluded = {...card('excluded','AST 200 U/L','入院後'),...extra};
    const patient = {items:[active,excluded]};
    const labs = app.analyzeLabData(patient).labs;
    assert.deepEqual(Array.from(labs,l=>l.itemId),['active']);
    assert.equal(app.evaluateLabFindings([excluded]).checked,0);
    assert.equal(app.evaluateLabFindings([excluded]).findings.length,0);
    const table = app.buildLabTrendTable([active,excluded]);
    assert.doesNotMatch(JSON.stringify(table), /200/);
    assert.doesNotMatch(JSON.stringify(app.buildLabAssessment(patient)), /200/);
  }
});

test('カードを並べ替えても日付と時刻で検査推移を比較する', () => {
  const items = [card('late','AST 200 U/L','術後2日目 12:00'),card('early','AST 50 U/L','術後1日目 09:00'),card('morning','AST 150 U/L','術後2日目 08:00')];
  assert.deepEqual(Array.from(app.analyzeLabData({items}).labs,l=>l.itemId),['early','morning','late']);
  assert.deepEqual(Array.from(app.analyzeLabData({items:items.slice().reverse()}).labs,l=>l.itemId),['early','morning','late']);
  const unknown = card('unknown','AST 1000 U/L','日時不明');
  const known = card('known','AST 20 U/L','術後1日目');
  assert.equal(app.analyzeLabData({items:[unknown,known]}).labs.find(l=>l.itemId==='known').reasonKinds.includes('change'),false,'日付不明を前回値にしない');
});

test('異なる単位を混ぜた推移表示と日時不明の並びを誤解させない', () => {
  const items=[card('a','WBC 5000 /μL','術前'),card('b','WBC 5 ×10^3/μL','術後1日目')];
  const output=JSON.stringify(app.buildLabAssessment({items}));
  assert.match(output,/5,000 → 5,000/);
  assert.doesNotMatch(output,/5,000 → 5 /);
  const unknown=JSON.stringify(app.buildLabAssessment({items:items.map(i=>({...i,timestamp:'日時不明'}))}));
  assert.match(unknown,/日時の順序を確認できない/);
  assert.doesNotMatch(unknown,/→|推移：/);
});

test('新生児の値を母親の検査判定に混ぜない', () => {
  const child=card('child','新生児：SpO2 88%','産褥1日目');
  const mother=card('mother','SpO2 98%','産褥1日目');
  const result=app.analyzeLabData({items:[child,mother]});
  assert.equal(result.vitals.length,1);
  assert.equal(result.vitals[0].value,98);
  assert.doesNotMatch(JSON.stringify(app.buildLabAssessment({items:[child,mother]})),/88/);
});

test('性別が書かれている記録では、性別ごとの定義を使う（男性のHb 13.0未満は貧血の目安に該当）。性別が不明なら使わない', () => {
  const male = cp(); male.items.push(card('s', '58歳 男性', '入院前'));
  const t = app.buildLabAssessment(male).text;
  assert.match(t, /Hb：13\.5 → 12\.2 g\/dL\n　判定：記録の基準値（11\.5〜16\.5 g\/dL）の範囲内。ただし男性の貧血の目安（13\.0 g\/dL未満・WHO 2024・成人）に該当します\n　推移：術前より低下しています。/);
  assert.match(t, /Hbが13\.5から12\.2 g\/dLに低下している。男性では貧血を示唆する所見であり、手術に伴う出血や輸液による希釈/);
  assert.doesNotMatch(app.buildLabAssessment(cp()).text, /貧血の目安/);
});

test('測定法が記録にある場合や、施設の基準値が書かれている場合はALPを判定保留にしない', () => {
  const withMethod = cp(); withMethod.items.push(card('t', 'ALP測定法：IFCC法', '術前'));
  assert.doesNotMatch(app.buildLabAssessment(withMethod).text, /ALP：221 U\/L\n　判定：判定保留/);
  const own = cp(); own.items = own.items.map(i => i.id === 'f' ? { ...i, text: 'ALP 221 U/L (基準値: 106〜322 U/L)' } : i);
  const t = app.buildLabAssessment(own).text;
  assert.match(t, /ALP：221 U\/L\n　判定：基準範囲内/);
});

test('血圧は診察室血圧の分類（高血圧治療ガイドライン2019）も併記し、1回の値で高血圧とは判断しない', () => {
  const x = { id: 'b', myAssessments: {}, items: [card('a', '【血圧】133/80mmHg', '術後'), card('b', '【血圧】112/72mmHg', '術前')] };
  const t = app.buildLabAssessment(x).text;
  assert.match(t, /血圧：133\/80mmHg[^\n]*診察室血圧の分類では高値血圧/);
  assert.match(t, /1回の値で高血圧とは判断せず/);
  assert.doesNotMatch(t, /血圧：112\/72mmHg[^\n]*診察室血圧の分類/);
});
