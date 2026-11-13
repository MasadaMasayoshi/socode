// v.275 — 正常値だけのときは確認できた値を示して判定保留／低いNRSだけで姿勢を未充足にしない／術後の根拠に術前の指示を入れない／足りない情報を示す
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const mkText = (text) => {
  const items = Array.from(app.classifyTextByRules(text)).map((c, i) => ({ id: 'c' + i, text: c.text, type: c.type, timestamp: c.timestamp, hendersonIds: Array.from(c.hendersonIds), fieldLabel: c.fieldLabel }));
  return { id: 'p', title: 'T', sourceText: text, items, myAssessments: {}, carePlans: {}, missingChecks: {}, selectedDiagnosisIds: [], diagnosisCandidates: [] };
};
const head = '氏名：Z氏 62歳 男性\n診断名：S状結腸がん\n手術：腹腔鏡下S状結腸切除術を全身麻酔で実施\n';
const phase = (cp, n, ph) => app.sufficiencyPhaseText(cp, n, ph);

test('記録されている体温が正常値だけのとき、「記録がない」とせず、確認できた値を示して判定保留にする（括弧つきの見出しの値も読む）', () => {
  const cp = mkText(head + '術後1日目\nO：帰室時の状況: 【バイタルサイン】108/56mmHg【脈拍】80回/分【呼吸数】16回/分【体温】36.0°C\n');
  const t = phase(cp, 7, 'postop');
  assert.match(t, /判定：判定保留/);
  assert.match(t, /体温 36\.0℃/);
  assert.match(t, /体温は判定保留。$/);
  assert.doesNotMatch(t, /直接の記録がないので/);
});

test('異常値は従来どおり判定に使う（体温39.0℃は未充足）', () => {
  const cp = mkText(head + '術後1日目\nO：【体温】39.0°C\n');
  assert.match(phase(cp, 7, 'postop'), /判定：未充足/);
});

test('痛みがNRS 2と軽いだけでは、姿勢を未充足にしない', () => {
  const cp = mkText(head + '術後1日目\nO：帰室時の状況: 疼痛はNRS 2\n');
  assert.doesNotMatch(phase(cp, 4, 'postop'), /判定：未充足/);
  const cp2 = mkText(head + '術後1日目\nO：疼痛はNRS 6 体を動かすと痛くて寝返りができない\n');
  assert.match(phase(cp2, 4, 'postop'), /判定：未充足/);
});

test('術後の判定の根拠に、手術前日の指示（常食・21時以降絶飲食）を入れない', () => {
  const cp = mkText(head + '手術前日\nO：手術前日指示：【食事】常食、21:00 以降絶飲食\n術後1日目\nO：手術当日術後指示：【食事】絶飲食\n');
  const t = phase(cp, 2, 'postop');
  assert.doesNotMatch(t, /常食/);
  assert.match(t, /絶飲食/);
});

test('情報不足のときは、何が分かれば判断できるかを書く', () => {
  const fs = require('fs'), path = require('path');
  const f = path.join(__dirname, 'golden', 'cases', '胃がん_A氏58歳.txt');
  if (!fs.existsSync(f)) return;
  const cp = mkText(fs.readFileSync(f, 'utf8').replace(/\r\n?/g, '\n'));
  assert.match(phase(cp, 1, 'pre'), /直接の記録（呼吸・脈拍・血圧・SpO2）がないので、呼吸は情報不足。/);
});

test('環境の欲求の整理に、保険・年齢性別・飲酒喫煙・基準値つきの検査値を並べない', () => {
  const cp = mkText('氏名：A氏 58歳 男性\n保険：社会保険\n嗜好品：喫煙20本/日 アルコール周1回\n診断名：胃がん\n手術：腹腔鏡下胃全摘術を全身麻酔で実施\n術後1日目\nO：Plt 23.6 ×10^4/μL (基準値: 13.0〜35.0 ×10^4/μL)\nO：ドレーン挿入部の固定を確認。ベッド柵あり\n');
  const d = app.buildFocusDraft(cp, 9);
  assert.doesNotMatch(d.focusAnalysis, /社会保険|58歳|喫煙|アルコール|Plt/);
});
