const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();

test('重点アセスメント：欲求ごとにS・Oが入院前／入院後で並び、番号が付く', () => {
  const SRC = '入院前は自立していた。\n「痛くてたまらない」\n術後2日目 創部痛NRS5。看護師の見守りで車いすに移乗した。';
  const items = Array.from(app.classifyTextByRules(SRC)).map((c, i) => ({ ...c, id: 'c' + i }));
  const cp = { id: 'p', items, myAssessments: {} };
  const need = [4, 11, 5, 3, 1].find(n => items.some(i => (i.hendersonIds || []).includes(n))) || 4;
  const data = app.focusItemsByColumn(cp, need);
  const all = [...data.cols.preadmission, ...data.cols.postadmission, ...data.cols.unclassified];
  assert.ok(all.length > 0, '分類済みのカードが拾われる');
  const html = app.focusCellHtml(need, all[0].type, data);
  assert.match(html, /(S|O)-1/);
  assert.equal(app.FOCUS_FIELDS.map(f => f.label).join('|'), ['情報の分析・解釈', '統合', '看護問題の明確化'].join('|'));
});

test('重点アセスメント：記録から分析・解釈／統合／看護問題を自動で下書きする', () => {
  const SRC = '右大腿骨頸部骨折で人工骨頭置換術を施行した。\n入院前は自立していた。\n創部痛があり、動かすと手術したところが痛い。NRS5。\n看護師の見守りでゆっくりと車いすに移乗、痛み増強する。';
  const items = Array.from(app.classifyTextByRules(SRC)).map((c, i) => ({ ...c, id: 'c' + i }));
  const cp = { id: 'p', title: 'A氏', sourceText: SRC, items, carePlans: {}, myAssessments: {}, selectedDiagnosisIds: [], diagnosisCandidates: [] };
  app.buildCarePlansByRules(cp);
  const d = app.buildFocusDraft(cp, 4);
  assert.match(d.focusAnalysis, /ことから|と考える/);
  assert.ok(d.focusIntegration.length > 0 && d.focusProblem.length > 0);
  assert.doesNotMatch(d.focusAnalysis + d.focusIntegration + d.focusProblem, /要確認/);
  // 手で直した欄は自動では上書きしない
  app.applyFocusDraft(cp, 4);
  cp.myAssessments[4].focusIntegration = '自分で書いた統合';
  app.applyFocusDraft(cp, 4);
  assert.equal(cp.myAssessments[4].focusIntegration, '自分で書いた統合');
});

test('重点アセスメント：書き出し（印刷・テキスト）に出る／書き出しの項目に追加', () => {
  const SRC = '右大腿骨頸部骨折で人工骨頭置換術を施行した。\n入院前は自立していた。\n創部痛があり、動かすと手術したところが痛い。NRS5。';
  const items = Array.from(app.classifyTextByRules(SRC)).map((c, i) => ({ ...c, id: 'c' + i }));
  const cp = { id: 'p', title: 'A氏', sourceText: SRC, items, carePlans: {}, myAssessments: {}, selectedDiagnosisIds: [], diagnosisCandidates: [] };
  app.buildCarePlansByRules(cp);
  assert.match(app.focusPrintSection(cp, 5), /重点アセスメント[\s\S]*情報の分析・解釈/);
  assert.match(app.focusAssessmentText(cp), /■情報の分析・解釈/);
  assert.ok(app.EXPORT_SECTIONS.some(x => x.key === 'focus'));
});

test('重点アセスメント：関連図・看護計画と連動（関連図の流れを分析に反映／相互に開く）', () => {
  const SRC = '右大腿骨頸部骨折で人工骨頭置換術を施行した。\n創部痛があり、動かすと手術したところが痛い。NRS5。\n看護師の見守りでゆっくりと車いすに移乗、痛み増強する。';
  const items = Array.from(app.classifyTextByRules(SRC)).map((c, i) => ({ ...c, id: 'c' + i }));
  const cp = { id: 'p', title: 'A氏', sourceText: SRC, items, carePlans: {}, myAssessments: {}, selectedDiagnosisIds: [], diagnosisCandidates: [] };
  cp.relationMap = app.buildRelationMapFromRecord(cp);
  app.buildCarePlansByRules(cp);
  const d = app.buildFocusDraft(cp, 4);
  assert.match(d.focusAnalysis, /関連図では/);
  assert.match(require('fs').readFileSync(require('path').join(__dirname, '../js/12-missing-checks-and-care-plan.js'), 'utf8'), /openFocusForNeed/);
});

test('ジェノグラム：拡大縮小のボタンと操作が用意されている', () => {
  const fs = require('fs'), path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '../js/16-genogram.js'), 'utf8');
  ['zoom-in', 'zoom-out', 'zoom-fit', 'zoom-reset'].forEach(a => { assert.ok(html.includes(`data-gg-action="${a}"`), a); assert.ok(js.includes(`'${a}'`), a); });
  assert.match(js, /pointermove[\s\S]*ggSetZoom/);
});
