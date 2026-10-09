'use strict';
// ②不足情報の確認状況 ③看護計画の編集・実施・評価 ④変更点の比較 ⑤提出用の書き出し（js/12・js/13）
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const clone = v => JSON.parse(JSON.stringify(v));
const card = (id, type, text, needs, extra = {}) => ({ id, type, text, timestamp: extra.timestamp || '術後1日目', hendersonIds: needs, assessmentCols: Object.fromEntries(needs.map(n => [n, extra.col || 'postadmission'])), ...extra });
function patient() {
  return {
    id: 'P', title: '患者P', sourceText: '', deletedItemIds: [], referenceNotes: [], archived: false, updatedAt: '2026-09-01T00:00:00.000Z',
    items: [
      card('s1', 's', '「お腹が張る感じがする」', [3]),
      card('o1', 'o', '術後より排便なし', [3]),
      card('o2', 'o', '疼痛 NRS 4/10（体位変換時）', [9], { timestamp: '術後2日目' }),
      card('m1', 'o', '普段の排便の間隔', [3], { col: 'missing' }),
      card('m2', 'o', '自宅の段差の有無', [9], { col: 'missing' }),
      card('f1', 'o', '右大腿骨頸部骨折', [4], { fieldLabel: '診断名', timestamp: '入院前', col: 'preadmission' })
    ]
  };
}

test('②不足情報：未確認・確認済み・該当なしを記録し、確認結果を情報カードとして追加（書き直すとカードも直る）', () => {
  const app = loadApp();
  const cp = patient();
  assert.deepEqual(clone(app.missingCheckCounts(cp)), { unchecked: 2, checked: 0, na: 0, total: 2 });
  const r = app.setMissingCheck(cp, 'm1', { status: 'checked', method: '本人に聞いた', result: '普段は2日に1回', checkedAt: new Date(2026, 8, 29, 14, 0).toISOString(), addCard: true, cardType: 's' });
  assert.equal(r.check.status, 'checked');
  assert.equal(r.card.text, '普段は2日に1回（本人に聞いた）');
  assert.equal(r.card.type, 's');
  assert.deepEqual(clone(r.card.hendersonIds), [3]);
  assert.equal(r.card.assessmentCols[3], 'postadmission');
  assert.equal(r.card.fieldLabel, '確認結果');
  assert.equal(r.card.timestamp, '9月29日 14:00');
  const again = app.setMissingCheck(cp, 'm1', { status: 'checked', method: '本人に聞いた', result: '普段は毎日', addCard: true, cardType: 's' });
  assert.equal(again.card.id, r.card.id, '同じカードを書き換える');
  assert.equal(cp.items.filter(i => i.fieldLabel === '確認結果').length, 1);
  assert.equal(again.card.text, '普段は毎日（本人に聞いた）');
  app.setMissingCheck(cp, 'm2', { status: 'na' });
  assert.deepEqual(clone(app.missingCheckCounts(cp)), { unchecked: 0, checked: 1, na: 1, total: 2 });
  assert.match(app.missingCheckCardHtml(cp, cp.items.find(i => i.id === 'm1')), /確認済み[\s\S]*普段は毎日[\s\S]*カード追加済み/);
  app.setMissingCheck(cp, 'm1', { status: 'unchecked' });
  assert.equal(cp.missingChecks.m1.checkedAt, null);
});

test('②確認済み・該当なしにした不足情報は、AIへ「不足している情報」として渡さない', () => {
  const app = loadApp();
  const cp = patient();
  cp.items.find(i => i.id === 'm1').hendersonIds = [3];
  app.setMissingCheck(cp, 'm1', { status: 'checked', result: '毎日' });
  const text = app.buildMissingInfoText(cp);
  assert.doesNotMatch(text, /普段の排便/);
  assert.match(text, /自宅の段差/);
});

test('③看護計画：作成・書き換え・優先順位の入れ替え・削除、実施・評価の記録（日時順）', () => {
  const app = loadApp();
  const cp = patient();
  const a = app.createCarePlan(cp, { problem: '急性疼痛', relatedNeeds: [9] });
  const b = app.createCarePlan(cp, { problem: '便秘', relatedNeeds: [3] });
  assert.deepEqual(clone(app.carePlanList(cp).map(p => p.problem)), ['急性疼痛', '便秘']);
  assert.ok(app.moveCarePlan(cp, b.id, 'up'));
  assert.deepEqual(clone(app.carePlanList(cp).map(p => p.problem)), ['便秘', '急性疼痛']);
  app.updateCarePlan(cp, a.id, { op: app.carePlanLinesToList('・疼痛の程度（NRS）\n\n2. 鎮痛薬の効果\nOP3：表情'), goalShort: '3日後までにNRS3以下' });
  assert.deepEqual(clone(app.getCarePlan(cp, a.id).op), ['疼痛の程度（NRS）', '鎮痛薬の効果', '表情']);
  app.addCareRecord(cp, a.id, { at: '2026-09-30T01:00:00.000Z', doneItems: ['OP1 疼痛の程度（NRS）'], response: '「楽になった」', achievement: 'partial', evaluation: 'NRS5→3' });
  app.addCareRecord(cp, a.id, { at: '2026-09-29T01:00:00.000Z', doneText: '体位変換を介助', achievement: 'bogus' });
  const recs = app.getCarePlan(cp, a.id).records;
  assert.deepEqual(clone(recs.map(r => r.at)), ['2026-09-29T01:00:00.000Z', '2026-09-30T01:00:00.000Z'], '日時の順');
  assert.equal(recs[0].achievement, '', '決まった値以外は「評価しない」');
  const text = app.buildCarePlansText(cp);
  assert.match(text, /#2 急性疼痛（実施中）[\s\S]*短期目標：3日後までにNRS3以下[\s\S]*OP1\. 疼痛の程度（NRS）[\s\S]*患者の反応：「楽になった」/);
  assert.ok(app.deleteCareRecord(cp, a.id, recs[0].id));
  assert.ok(app.deleteCarePlan(cp, b.id));
  assert.deepEqual(clone(app.carePlanList(cp).map(p => p.problem)), ['急性疼痛']);
  assert.equal(cp.carePlans[b.id].deleted, true, '消した計画は削除の印を残す（別の端末で復活させない）');
  const html = app.carePlanCardHtml(cp, { ...app.getCarePlan(cp, a.id), problem: '<img src=x onerror=alert(1)>' }, 0, 1);
  assert.doesNotMatch(html, /<img src=x/);
});

test('③旧形式の計画文章は解析できても、廃止したAI自動取り込みは許可しない', () => {
  const app = loadApp();
  const plans = app.parseCarePlanText('看護計画です。\n**■#1 術後の創部痛に関連した急性疼痛**\n目標：3日以内に疼痛がNRS3以下になる〔S 痛い〕\nOP（観察計画）\n・疼痛の部位・程度\n・鎮痛薬の効果\nTP：\n1. 体位の工夫\nEP\n- 痛みを伝えるよう説明する\n\n■便秘リスク状態\n長期目標：退院まで排便が保たれる\nO-P: 排便の有無\n');
  assert.equal(plans.length, 2);
  assert.deepEqual(clone(plans[0]), { problem: '術後の創部痛に関連した急性疼痛', goalLong: '', goalShort: '3日以内に疼痛がNRS3以下になる', op: ['疼痛の部位・程度', '鎮痛薬の効果'], tp: ['体位の工夫'], ep: ['痛みを伝えるよう説明する'] });
  assert.equal(plans[1].goalLong, '退院まで排便が保たれる');
  assert.deepEqual(clone(plans[1].op), ['排便の有無']);
  const cp = patient();
  cp.carePlanResult = '<b>■術後の創部痛に関連した急性疼痛</b><br>目標：NRS3以下<br>OP<br>・疼痛の程度';
  assert.equal(app.importCarePlans(cp, 'ai').length, 0, 'AI由来の看護計画は取り込まない');
  assert.equal(app.carePlanList(cp).length, 0, '旧AIデータを看護計画に混入させない');
  cp.diagnosisCandidates = [{ id: 'd1', name: '便秘' }, { id: 'd2', name: '転倒転落リスク状態' }];
  cp.selectedDiagnosisIds = ['d2'];
  assert.deepEqual(clone(app.importCarePlans(cp, 'dx').map(x => x.problem)), [], '旧AI診断からの自動取り込みも廃止');
});

test('④変更点の比較：同じIDどうし、分類し直してIDが変わったカードは本文で対応させ、追加・変更・削除を出す', () => {
  const app = loadApp();
  const cp = patient();
  const c = app.createCheckpoint(cp, { label: '提出前', kind: 'manual' }, '2026-09-29T00:00:00.000Z');
  // 今のカード：o1 の本文を変えた・s1 をO にした・o2 を消した・分類し直して f1 のIDが変わった・新しいカード
  cp.items.find(i => i.id === 'o1').text = '術後より排便なし（2日間）';
  const s1 = cp.items.find(i => i.id === 's1'); s1.type = 'o'; s1.hendersonIds = [3, 10]; s1.assessmentCols = { 3: 'missing', 10: 'postadmission' };
  cp.items = cp.items.filter(i => i.id !== 'o2');
  cp.items.find(i => i.id === 'f1').id = 'f1-new';
  cp.items.push(card('n1', 'o', '軟便中量あり', [3]));
  const d = app.diffCards(c.items, cp.items);
  assert.deepEqual(clone(d.added.map(i => i.id)), ['n1']);
  assert.deepEqual(clone(d.removed.map(i => i.id)), ['o2']);
  assert.equal(d.same, 3, 'm1・m2・（IDが変わった）f1');
  const byId = Object.fromEntries(d.changed.map(x => [x.after.id, x.changes.map(ch => ch.label)]));
  assert.deepEqual(clone(byId), { s1: ['分類', 'タグ', '欄（3.排泄）'], o1: ['本文'] });
  assert.match(app.inlineTextDiffHtml('術後より排便なし', '術後より排便なし（2日間）'), /^術後より排便なし<ins>（2日間）<\/ins>$/);
  // 消したカードを元に戻す
  assert.ok(app.restoreCardFromCheckpoint(cp, c.id, 'o2'));
  assert.equal(app.diffCards(c.items, cp.items).removed.length, 0);
});

test('④記録は8件まで（自動の記録から消す）・消した記録は削除の印を残す・開いたときは30分以上たって変わっていれば記録', () => {
  const app = loadApp();
  const cp = patient();
  const manual = app.createCheckpoint(cp, { kind: 'manual' }, '2026-09-01T00:00:00.000Z');
  for (let k = 0; k < 9; k++) app.createCheckpoint(cp, { kind: 'classify' }, `2026-09-0${k + 2}T00:00:00.000Z`);
  const list = app.checkpointList(cp);
  assert.equal(list.length, app.CHECKPOINT_MAX);
  assert.ok(list.some(c => c.id === manual.id), '手で記録したものは残す');
  assert.ok(app.deleteCheckpoint(cp, manual.id));
  assert.equal(cp.checkpoints[manual.id].deleted, true);
  const cp2 = patient();
  app.createCheckpoint(cp2, { kind: 'manual' }, new Date(Date.now() - 60 * 60 * 1000).toISOString());
  assert.equal(app.maybeCheckpointOnOpen(cp2), null, '変わっていなければ記録しない');
  const cp3 = { ...patient(), id: 'P3' };
  app.createCheckpoint(cp3, { kind: 'manual' }, new Date(Date.now() - 60 * 60 * 1000).toISOString());
  cp3.items.push(card('n9', 's', '「眠れた」', [5]));
  assert.ok(app.maybeCheckpointOnOpen(cp3));
  assert.equal(app.maybeCheckpointOnOpen(cp3), null, '同じ画面の中では1回だけ');
});

test('複数の端末：記録した時点・看護計画・不足情報の確認は、それぞれ新しい方を残す（サーバー）', () => {
  const server = require('../server.js');
  const a = { id: 'P', items: [], updatedAt: '2026-09-29T02:00:00.000Z', carePlans: { p1: { id: 'p1', problem: 'A', updatedAt: '2026-09-29T02:00:00.000Z' } }, checkpoints: { c1: { id: 'c1', items: [], updatedAt: '2026-09-29T02:00:00.000Z' } } };
  const b = { id: 'P', items: [], updatedAt: '2026-09-29T01:00:00.000Z', carePlans: { p2: { id: 'p2', problem: 'B', updatedAt: '2026-09-29T01:00:00.000Z' } }, missingChecks: { m1: { status: 'checked', updatedAt: '2026-09-29T01:00:00.000Z' } } };
  const m = server.mergePatientRecord(a, b);
  assert.deepEqual(Object.keys(m.carePlans).sort(), ['p1', 'p2']);
  assert.equal(m.missingChecks.m1.status, 'checked');
  assert.ok(m.checkpoints.c1);
});

test('⑤SOAP形式：看護問題ごとに S・O・A・P、項目と順番を選べて、日で絞れる', () => {
  const app = loadApp();
  const cp = patient();
  const e = app.ensureMyAssessment(cp, 3);
  e.interpretation = '便秘の状態にある';
  app.linkMyEvidenceIds(cp, 3, ['s1', 'o1']);
  const p = app.createCarePlan(cp, { problem: '便秘', relatedNeeds: [3], goalShort: '2日以内に排便がある', op: ['排便の有無'], tp: ['腹部マッサージ'] });
  app.addCareRecord(cp, p.id, { at: '2026-09-29T03:00:00.000Z', doneItems: ['TP1 腹部マッサージ'], response: '「すっきりした」', achievement: 'achieved', evaluation: '排便あり', revision: 'TP1を終了' });
  const r = app.buildReport(cp, { format: 'soap' });
  const txt = app.reportToText(cp, r);
  assert.match(txt, /■ #1 便秘（3\.排泄）\nS：\n　\[術後1日目\] 「お腹が張る感じがする」\nO：\n　\[術後1日目\] 術後より排便なし\nA：\n　【3\.排泄】\n　情報の解釈：便秘の状態にある\n　根拠：S-1・O-1\n　評価（[^）]+）：排便あり\nP：\n　短期目標：2日以内に排便がある\n　OP1\. 排便の有無\n　TP1\. 腹部マッサージ\n　計画の修正（[^）]+）：TP1を終了/);
  assert.doesNotMatch(txt, /普段の排便の間隔/, '不足情報の欄のカードはOに入れない');
  // 項目と順番を選ぶ：A・S だけ、Aを先に
  const layout = [{ key: 'A', on: true }, { key: 'S', on: true }, { key: 'O', on: false }, { key: 'P', on: false }, { key: 'I', on: false }, { key: 'E', on: true }];
  const t2 = app.reportToText(cp, app.buildReport(cp, { format: 'soap', layout }));
  assert.match(t2, /A：[\s\S]*S：[\s\S]*E：\n　【[^】]+】目標：達成　排便あり/);
  assert.doesNotMatch(t2, /^O：/m);
  // 日で絞る
  const days = app.reportDayOptions(cp);
  assert.ok(days.includes('術後1日目') && days.includes('術後2日目'));
  const t3 = app.reportToText(cp, app.buildReport(cp, { format: 'soap', day: '術後2日目' }));
  assert.match(t3, /^SOAP（術後2日目の記録）/);
  assert.doesNotMatch(t3, /お腹が張る/);
});

test('⑤実習記録の様式：患者の概要・14項目・不足情報・看護問題・計画・実施評価。HTMLはエスケープする', () => {
  const app = loadApp();
  const cp = patient();
  app.setMissingCheck(cp, 'm1', { status: 'checked', result: '毎日', method: 'カルテ' });
  app.createCarePlan(cp, { problem: '<b>急性疼痛</b>', relatedNeeds: [9] });
  const r = app.buildReport(cp, { format: 'practicum' });
  const txt = app.reportToText(cp, r);
  assert.match(txt, /■ 患者の概要\n患者：患者P\n診断名：右大腿骨頸部骨折/);
  assert.match(txt, /■ ヘンダーソン14項目の情報とアセスメント\n3\.排泄：\n　S-1 \[術後1日目\] 「お腹が張る感じがする」\n　O-1 \[術後1日目\] 術後より排便なし/);
  assert.match(txt, /■ 不足情報と確認結果\n\[確認済み [^\]]+\] 3\.排泄：普段の排便の間隔 → 毎日（カルテ）\n\[未確認\] 9\.環境：自宅の段差の有無/);
  assert.match(txt, /■ 看護問題（優先順位）\n#1 <b>急性疼痛<\/b>（計画作成済み）/);
  const html = app.reportToHtml(cp, r);
  assert.doesNotMatch(html, /<b>急性疼痛/);
  assert.match(html, /&lt;b&gt;急性疼痛/);
});
