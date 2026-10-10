'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp, readAppSource } = require('./app-helpers');
const ROOT = path.join(__dirname, '..');
const app = loadApp();
const src = readAppSource();
const plain = v => JSON.parse(JSON.stringify(v));

test('AIのJSON：```json の囲み・前置き・最後の余分な「,」があっても読める', () => {
  const v = app.parseAiJsonLoose('以下が不足情報です。\n```json\n[{"hendersonId":1,"text":"a"},\n{"hendersonId":2,"text":"b"},\n]\n```');
  assert.equal(v.length, 2);
  assert.equal(app.parseAiJsonArray('説明\n```json\n[{"hendersonId":3,"text":"c"},]\n```').length, 1);
});

test('AIのJSON：答えが途中で切れたときは、閉じ終わった所までを読み、途中切れだと分かる', () => {
  const r = app.parseAiJsonLooseInfo('[{"text":"a"},{"text":"b"},{"text":"途中');
  assert.equal(r.truncated, true);
  assert.deepEqual(plain(r.value.map(x => x.text)), ['a', 'b']);
  assert.equal(app.parseAiJsonLoose('説明 [JSON形式] です'), undefined);
});

test('看護診断候補：「■」が無く「## 1. **診断名**」「1. 診断名」の見出しで返っても候補を読める', () => {
  const a = app.parseDiagnosisCandidates('候補は次のとおりです。\n\n## 1. **心拍出量減少**\n根拠：EF 35%〔C55〕\n理由：…\n\n## 2. **活動耐性低下**\n根拠：歩行でSpO2低下\n理由：…');
  assert.deepEqual(plain(a.map(c => c.name)), ['心拍出量減少', '活動耐性低下']);
  const b = app.parseDiagnosisCandidates('1. 非効果的健康自主管理\n根拠：自己判断で中断\n理由：…');
  assert.deepEqual(plain(b.map(c => c.name)), ['非効果的健康自主管理']);

  assert.deepEqual(plain(app.parseDiagnosisCandidates('■ 活動耐性低下\n根拠：…').map(c => c.name)), ['活動耐性低下']);
});

test('看護計画の取り込み：最初の「要点」の「#1 …」を、中身の無い看護計画として取り込まない', () => {
  const text = `要点
#1 活動耐性低下：労作時のSpO2低下に合わせて活動量を調整する。
#2 非効果的健康自主管理：服薬・塩分・体重測定を続けられるよう支援する。

■活動耐性低下
目標
1. 3日後までに病棟内を100m歩いてもSpO2 93%以上を保てる。
OP（観察計画）
1. 活動の前後のSpO2を測る。
TP（援助計画）
1. 清拭は休憩をはさむ。
EP（教育計画）
1. 息切れを感じたら休むよう説明する。

■非効果的健康自主管理
目標
1. 退院までに利尿薬の目的を言える。
OP（観察計画）
1. 服薬の発言を確かめる。`;
  const plans = app.parseCarePlanText(text);
  assert.deepEqual(plain(plans.map(p => p.problem)), ['活動耐性低下', '非効果的健康自主管理']);
  assert.equal(plans[0].op.length, 1);

  assert.deepEqual(plain(app.parseCarePlanText('#1 転倒リスク\nOP：\n1. ふらつきを観察する').map(p => p.problem)), ['転倒リスク']);
});

test('旧AIパーサーの互換性を残しても、共通API入口は画像なしのAI分類要求を拒否する', () => {
  assert.match(src, /if \(!hasImage \|\| options\.ocr !== true\) throw new Error\('AI機能は画像の文字認識/);
  assert.ok(src.indexOf('if (!hasImage || options.ocr !== true) throw new Error') < src.indexOf('requestGemini(globalAppData.apiKey, body)'));
});
