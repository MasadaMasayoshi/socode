'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
// Fictional source; expectations are written independently of app output.
const SOURCE = '【氏名・年齢・性別・】\nA 氏・58 歳・男性\n\n【既往歴】\n53 歳の時に胆嚢結石を指摘されていたが、症状がないため経過観察中\n\n＜実習 1 日目(入院 1 日目、手術前々日)＞\n《術前検査結果》\n【血液型】A 型\n';
const patient = () => ({ id: 'p', title: '架空患者', sourceText: SOURCE, items: app.classifyTextByRules(SOURCE).map((i, k) => ({ ...i, id: `c${k}` })) });

test('Identity, past history and blood type get the basic-information tag, not the missing-tag warning', () => {
  const basic = patient().items.filter(i => app.isBasicInfoItem(i)).map(i => i.text.replace(/\s/g, ''));
  assert.ok(basic.includes('A氏・58歳・男性'));
  assert.ok(basic.some(t => t.startsWith('53歳の時に胆嚢結石')));
  assert.ok(basic.includes('【血液型】A型'));
  patient().items.filter(i => app.isBasicInfoItem(i)).forEach(i => assert.equal(app.isUntaggedItem(i), false));
});

test('Tagged cards and unrelated findings are not basic information', () => {
  assert.equal(app.isBasicInfoItem({ type: 'o', text: '【血液型】A 型', hendersonIds: [9] }), false);
  assert.equal(app.isBasicInfoItem({ type: 'o', text: '【病理結果】T2 N0 P0 H0 M0', hendersonIds: [] }), false);
});

test('Review request omits routine heading exclusions and boilerplate, and keeps the required instruction once', () => {
  const cp = patient();
  const out = app.buildReviewRequestText(cp, SOURCE, false);
  const REQUIRED = '原文・前後の記録・編集履歴を照合し、なぜカードが分割・統合されたのか';
  assert.equal(out.split(REQUIRED).length - 1, 1);
  assert.ok(!out.includes('書き換えの判定方法'));
  assert.ok(!out.includes('手で編集した履歴: なし'));
  assert.ok(!/カードの内容: 事例紹介|カードの内容: 《術前検査結果》/.test(out));
  assert.ok(!out.includes('タグ未設定のカード 3件'));
});

test('A past condition treated within the same operation is treated by its own procedure', () => {
  const text = '【診断】胃がん\n予定術式：腹腔鏡下胃全摘術(R-Y再建)+胆嚢摘出術+リンパ節郭清\n【既往歴】53歳の時に胆嚢結石を指摘され、症状はなく経過観察中。\n';
  const items = app.classifyTextByRules(text).map((i, k) => ({ ...i, id: `i${k}` }));
  const map = app.buildRelationMapFromRecord({ id: 'p', title: 't', sourceText: text, items, carePlans: {}, selectedDiagnosisIds: [], diagnosisCandidates: [] });
  const byId = new Map(map.nodes.map(n => [n.id, n]));
  const history = map.nodes.find(n => /胆嚢結石/.test(n.label));
  const proc = map.nodes.find(n => n.type === 'treatment' && /胆嚢摘出術$/.test(n.label));
  assert.ok(history && proc);
  assert.ok(map.edges.some(e => e.source === proc.id && e.target === history.id && e.relation === 'treats'));
  assert.ok(!map.edges.some(e => e.source === history.id && byId.get(e.target).type === 'treatment'));
  // The procedure is split out of the combined operation box, not shown twice.
  assert.equal(map.nodes.filter(n => /胆嚢摘出術/.test(n.label) && n.type === 'treatment').length, 1);
});
