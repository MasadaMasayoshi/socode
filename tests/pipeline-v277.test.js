// v.277 — 出力の前に看護問題・計画を必ず作る／時期の取り違えの防止／種類の違う記録を比べない／症状でない語を拾わない
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const dir = path.join(__dirname, 'golden', 'cases');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /\.txt$/.test(f)) : [];
const mkText = (text, id = 'p') => {
  const items = Array.from(app.classifyTextByRules(text)).map((c, i) => ({ id: 'c' + i, text: c.text, type: c.type, timestamp: c.timestamp, hendersonIds: Array.from(c.hendersonIds), fieldLabel: c.fieldLabel }));
  return { id, title: 'T', sourceText: text, items, myAssessments: {}, carePlans: {}, missingChecks: {}, selectedDiagnosisIds: [], diagnosisCandidates: [] };
};
const head = '氏名：Z氏 62歳 男性\n診断名：S状結腸がん\n手術：腹腔鏡下S状結腸切除術を全身麻酔で実施\n';
const post = (cp, n, ph) => app.sufficiencyPhaseText(cp, n, ph);

test('看護計画の画面を開いていなくても、書き出し・重点アセスメントの前に、看護問題と計画が作られる（どの事例でも）', () => {
  files.forEach(f => {
    const text = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n?/g, '\n');
    const a = mkText(text, 'a' + f), b = mkText(text, 'b' + f), c = mkText(text, 'c' + f);
    assert.equal(Array.from(app.carePlanList(a)).length, 0);
    app.buildCarePlansText(a);
    assert.ok(Array.from(app.carePlanList(a)).length > 0, `${f}：計画の書き出しで空`);
    app.buildFocusDraft(b, 1);
    assert.ok(Array.from(app.carePlanList(b)).length > 0, `${f}：重点アセスメントで空`);
    app.buildExportPlainText(c, undefined);
    assert.ok(Array.from(app.carePlanList(c)).length > 0, `${f}：全文書き出しで空`);
  });
});

test('見出しが「受け持ち前」「術前」のカードは、手術当日の指示書に載っていても術前の記録として扱う（術後の判定に使わない）', () => {
  const cp = mkText(head + '手術前日\nO：【体温】35.9°C\n術後1日目\nO：<バイタルサイン(受け持ち前)>【血圧】133/80mmHg【脈拍】72回/分【体温】36.5°C\nO：【体温】36.0°C\n');
  const t = post(cp, 7, 'postop');
  assert.match(t, /36\.0/);
  assert.doesNotMatch(t, /36\.5/);
});

test('「自己調節頭痛法」のような「〜痛法」は症状として拾わない', () => {
  const cp = mkText(head + '術後1日目\nO：自己調節頭痛法\n');
  assert.doesNotMatch(post(cp, 5, 'postop'), /「頭痛」/);
});

test('短い返事・のどを示す動作は意思表示として扱う（コミュニケーションの記録がないとしない）', () => {
  const cp = mkText(head + '術後1日目\nO：声を掛けると開眼し、「ああ」と短く返事をするのみ。喉を指さして痛みを伝える\n');
  assert.match(post(cp, 10, 'postop'), /判定：充足/);
});

test('種類の違う記録（体重の変化と1回の食事量）を、変化・改善として比べない', () => {
  const cp = mkText(head + '入院前\nO：体重59.5kg(1か月で体重2.0kg減)\n手術前日\nO：朝食全量摂取\n術後1日目\nO：手術当日術後指示：【食事】絶飲食\n');
  const t = app.sufficiencyAnalysis(cp, 2, 'postop');
  assert.doesNotMatch(t, /体重[^。]*改善/);
});

test('術後の分析に、関連図で確かめられた要因が入る（記録にない原因は書かない）', () => {
  const f = files.find(x => /胃がん_A/.test(x));
  if (!f) return;
  const cp = mkText(fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n?/g, '\n'));
  app.cpEnsureBuilt(cp);
  const t = app.sufficiencyAnalysis(cp, 1, 'postop');
  assert.match(t, /につながる要因として、.*が考えられる/);
  assert.match(t, /SpO2は酸素を投与している間の値/);
});
