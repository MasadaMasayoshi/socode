'use strict';
// 看護計画の品質管理：重複の統合・根拠の検証・優先順位・目標・OP/TP/EP・参照・状態・自動チェック・検査値のOCR（2026-10-08.24）
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();

const card = (id, text, ts = '術後1日目', type = 'o') => ({ id, type, text, timestamp: ts, hendersonIds: [1], assessmentCols: { 1: 'postadmission' } });
const surgery = (extra = []) => ({ id: 'p19', title: '患者19', myAssessments: {}, carePlans: {}, sourceText: '胃がん 幽門側胃切除術後 全身麻酔', items: [
  card('a', '術後1日目 創部痛あり NRS2 体動時に痛む'), card('b', '湿性咳嗽あり 痰は自分で出せている 呼吸音に副雑音なし'),
  card('c', '術後床上安静 絶飲食 点滴あり'), card('d', 'WBC 11600 CRP 0.66→0.8'), card('e', '「呼吸の練習はなぜするのですか。やり方は合っていますか」', '術後1日目', 's'),
  card('f', '「いつから食べていいですか」「合併症が心配です」', '術後1日目', 's'), ...extra] });
const mk = (problem, extra = {}) => ({ problem, source: 'rules', op: [], tp: [], ep: [], ...extra });

test('重複：言い回しが違っても同じ意味の看護問題は1つにまとまり、固有の援助は残り、何度やっても増えない', () => {
  const cp = surgery();
  const a = app.createCarePlan(cp, mk('急性疼痛', { tp: ['創部を枕で保護する'], goalShort: '2日後までに…' }));
  const b = app.createCarePlan(cp, mk('術後創部痛に関連した急性疼痛', { tp: ['鎮痛薬を離床前に使う'], op: ['NRS'] }));
  const c = app.createCarePlan(cp, mk('急性疼痛', { ep: ['痛みを我慢しない'] }));
  const d = app.createCarePlan(cp, mk('消化管運動機能障害リスク状態'));
  const e = app.createCarePlan(cp, mk('術後イレウスのリスク状態'));
  assert.equal(app.mergeDuplicateCarePlans(cp), 3 - 1 + 1 - 0 === 3 ? 3 : 3);
  const list = app.carePlanList(cp);
  assert.equal(list.length, 2);
  const pain = list.find(p => /疼痛/.test(p.problem));
  assert.ok(pain.tp.length === 2 && pain.ep.length === 1 && pain.op.length === 1, '固有の援助・教育・観察は残る');
  assert.equal(app.mergeDuplicateCarePlans(cp), 0, '2回目は何も変わらない');
  assert.ok([a, b, c, d, e].every(p => app.getCarePlan(cp, p.id) || cp.carePlans[p.id].mergedInto));
});
test('重複：リスクと現在の問題は別の問題として残し、違いを書く。気道浄化とガス交換も別', () => {
  const cp = surgery();
  app.createCarePlan(cp, mk('急性疼痛')); app.createCarePlan(cp, mk('疼痛のリスク状態'));
  app.createCarePlan(cp, mk('非効果的気道浄化')); app.createCarePlan(cp, mk('ガス交換障害'));
  assert.equal(app.mergeDuplicateCarePlans(cp), 0);
  app.refineCarePlans(cp);
  assert.ok(app.carePlanList(cp).filter(p => /疼痛/.test(p.problem)).every(p => /別の問題/.test(p.distinct)));
});
test('根拠の検証：湿性咳嗽・床上安静・絶飲食・WBC/CRPだけでは、現在の問題と言い切らない', () => {
  const cp = surgery();
  const resp = app.validateCarePlanEvidence(cp, mk('非効果的気道浄化'));
  assert.equal(resp.kind, 'risk'); assert.equal(resp.riskName, '術後呼吸器合併症リスク状態');
  assert.equal(app.validateCarePlanEvidence(cp, mk('活動耐性低下')).kind, 'risk');
  assert.equal(app.validateCarePlanEvidence(cp, mk('栄養摂取量不足')).riskName, '栄養摂取量不足リスク状態');
  assert.equal(app.validateCarePlanEvidence(cp, mk('感染')).riskName, '感染リスク状態');
  assert.equal(app.validateCarePlanEvidence(cp, mk('消化管運動機能障害')).riskName, '消化管運動機能障害リスク状態');
  const p = app.createCarePlan(cp, mk('非効果的気道浄化', { evidence: ['湿性咳嗽'] }));
  app.applyCarePlanValidation(cp, p);
  assert.equal(p.problem, '術後呼吸器合併症リスク状態');
  assert.match(p.validation.msgs[0], /湿性咳嗽/);
});
test('根拠の検証：直接の所見があれば現在の問題、矛盾する所見があれば判定保留、情報がなければ不足と書く', () => {
  const ex = { id: 'e', carePlans: {}, sourceText: '', items: [card('x', '痰が貯留し自己喀出困難 副雑音あり SpO2 91%')] };
  assert.equal(app.validateCarePlanEvidence(ex, mk('非効果的気道浄化')).kind, 'existing');
  const conflict = surgery([card('y', '排痰困難 自己喀出良好')]);
  assert.equal(app.validateCarePlanEvidence(conflict, mk('非効果的気道浄化')).kind, 'conflict');
  const none = { id: 'z', items: [card('q', '食事は全量摂取')], carePlans: {}, sourceText: '' };
  assert.equal(app.validateCarePlanEvidence(none, mk('不安')).kind, 'insufficient');
  assert.match(app.validateCarePlanEvidence(none, mk('不安')).msgs[0], /情報が不足/);
});
test('根拠の検証：入院前の所見だけで現在の問題にしない（時期）', () => {
  const cp = { id: 'k', carePlans: {}, sourceText: '', items: [{ ...card('a', '息切れあり'), admissionPhase: 'preadmission', assessmentCols: { 1: 'preadmission' } }, card('b', '術後床上安静')] };
  assert.equal(app.validateCarePlanEvidence(cp, mk('活動耐性低下')).kind, 'risk');
});
test('目標：リスクは予防・早期発見の目標、現在の問題は回復の目標。すでに達成済みのNRS目標にしない', () => {
  const cp = surgery();
  const risk = app.cpRiskGoalFor(mk('消化管運動機能障害リスク状態'), app.cpRecordContext(cp));
  assert.match(risk.short, /腹部膨満・反復する嘔吐・排ガス停止などの異常を認めず/);
  assert.ok(!/改善する/.test(risk.short + risk.long));
  const painPlan = app.createCarePlan(cp, mk('急性疼痛'));
  const m = app.cpModelFor(painPlan, app.cpRecordContext(cp));
  assert.match(m.goalShort, /許容範囲に収まり、必要な深呼吸や体位変換を実施できる/);
  assert.ok(!/NRS3以下/.test(m.goalShort), '現在NRS2なので、NRS3以下は達成済み');
  assert.ok(app.cpGoalCheck(m.goalShort).deadline);
  const high = { ...cp, items: [card('h', '創部痛 NRS7')] };
  assert.match(app.cpModelFor(painPlan, app.cpRecordContext(high)).goalShort, /NRS7から/);
});
test('OP/TP/EP：定型文にせず、記録にある質問から教育計画を作る。「分かりました」だけで習得とはしない', () => {
  const cp = surgery();
  const p = app.createCarePlan(cp, mk('術後呼吸器合併症リスク状態'));
  const m = app.cpModelFor(p, app.cpRecordContext(cp));
  assert.match(m.ep[0], /呼吸訓練の目的.*患者自身に実施してもらい/);
  assert.match(m.ep.join(''), /分かりました」の返事だけで習得したとはみなさない/);
  assert.ok(m.op.every(t => t.length > 12) && m.tp.every(t => t.length > 20));
  assert.ok(![...m.op, ...m.tp, ...m.ep].some(t => /患者の状態に合わせて|を和らげる援助/.test(t)));
  const ileus = app.cpModelFor(app.createCarePlan(cp, mk('消化管運動機能障害リスク状態')), app.cpRecordContext(cp));
  assert.match(ileus.ep[0], /食事の開始時期/);
  assert.ok(!ileus.op.some(t => /胃管|ドレーン/.test(t)), '記録にない胃管・ドレーンは観察項目に入れない');
});
test('感染：WBC/CRPだけで感染とせず、一律の37.5℃報告にしない', () => {
  const cp = surgery([card('w', '創部ガーゼ汚染なし')]);
  const p = app.createCarePlan(cp, mk('感染リスク状態'));
  const m = app.cpModelFor(p, app.cpRecordContext(cp));
  const all = JSON.stringify(m);
  assert.ok(!/37\.5/.test(all) && /院内の報告基準・医師の指示/.test(all) && /炎症反応との区別/.test(all));
});
test('優先順位：固定の順番にせず、理由を添える。番号は削除・統合のあとも1から連続する', () => {
  const cp = surgery([card('s', 'SpO2 91% 呼吸困難あり')]);
  const pain = app.createCarePlan(cp, mk('急性疼痛')); const resp = app.createCarePlan(cp, mk('術後呼吸器合併症リスク状態')); const anx = app.createCarePlan(cp, mk('不安'));
  app.refineCarePlans(cp);
  const l = app.carePlanList(cp);
  assert.equal(l[0].id, resp.id, 'ABCに関わるリスクが、NRS2の痛みより先');
  assert.ok(l.every((p, i) => p.order === i + 1 && p.priorityReason));
  app.deleteCarePlan(cp, anx.id); app.refineCarePlans(cp);
  assert.equal(JSON.stringify(app.carePlanList(cp).map(p => p.order)), '[1,2]');
  assert.ok(pain);
});
test('参照：計画のIDで持ち、消した・まとめた計画は自動で外し、存在しない計画への文章の参照は取り除く', () => {
  const cp = surgery([card('t', '低血糖が心配')]);
  const a = app.createCarePlan(cp, mk('不安', { ep: ['呼吸を確認する（対処手順の説明は「血糖不安定」の計画で行う）'] }));
  const g = app.createCarePlan(cp, mk('血糖不安定リスク状態'));
  a.refs = [{ id: g.id, why: '低血糖時の対処の説明' }, { id: 'plan_nothing', why: 'x' }];
  app.cpSanitizeRefs(cp);
  assert.equal(a.refs.length, 1);
  assert.ok(!/血糖不安定/.test(a.ep[0]) === false, '血糖不安定の計画があるので文章の参照は残る');
  app.deleteCarePlan(cp, g.id); app.cpSanitizeRefs(cp);
  assert.equal(a.refs.length, 0); assert.ok(!/血糖不安定/.test(a.ep[0]));
});
test('別の患者の流用：記録にない手術・処置・薬の言葉が計画に出たら印をつける', () => {
  const cp = surgery();
  const p = app.createCarePlan(cp, mk('急性疼痛', { tp: ['股関節の脱臼肢位に注意して体位を整える', 'インスリンを実施する'] }));
  assert.equal(JSON.stringify(app.cpForeignTerms(cp, p).sort()), JSON.stringify(['インスリン', '股関節'].sort()));
  app.createCarePlan(cp, { ...mk('不安'), caseId: 'someone-else' });
  const gate = app.cpQualityGate(cp);
  assert.ok(gate.some(g => g.qa.some(q => q.code === 'foreign')));
});
test('状態と評価：新しい計画は「実施中」にならず、記録を足したときだけ実施中。記録がなければ評価不能。実施・評価は自動で作らない', () => {
  const cp = surgery();
  const p = app.createCarePlan(cp, mk('急性疼痛'));
  assert.equal(p.status, 'planned');
  assert.deepEqual(['planned', 'scheduled', 'active', 'evaluating', 'continue', 'revise', 'ended'].filter(k => !app.CARE_PLAN_STATUSES.some(s => s.key === k)), []);
  assert.equal(app.evaluateCarePlanFromRecords(p).result, 'unevaluable');
  assert.ok(app.CARE_ACHIEVEMENTS.some(a => a.label === '評価不能'));
  app.refineCarePlans(cp);
  assert.equal(p.records.length, 0, '自動チェックは記録を作らない');
  app.addCareRecord(cp, p.id, { doneText: '鎮痛薬を使って離床した', response: '「楽になった」', achievement: 'partial', evaluation: '体動時の痛みは残る' });
  assert.equal(p.status, 'active');
  assert.equal(app.evaluateCarePlanFromRecords(p).result, 'partial');
});
test('自動チェック：リスクの目標が治療の書き方・定型文・安静度に反する援助・実施中なのに記録なしを見つける', () => {
  const cp = surgery([card('r', '安静度：ベッド上安静')]);
  const p = app.createCarePlan(cp, mk('術後呼吸器合併症リスク状態', { goalShort: '3日後までに、肺炎のリスク状態が改善する', op: ['状態を観察する'], tp: ['端座位から歩行を進める'], status: 'active' }));
  const codes = app.cpQualityGate(cp).find(g => g.id === p.id).qa.map(q => q.code);
  ['risk-as-treatment', 'placeholder', 'order-conflict', 'active-without-record'].forEach(c => assert.ok(codes.includes(c), c + ' / ' + codes));
});
test('自動作成：何度作っても重複せず、リスクへ直した問題も作り直さず、手動で動かした順番は戻さない', () => {
  const cp = surgery();
  const n = app.autoBuildCarePlans(cp, { notify: false });
  assert.ok(n > 0);
  const names = app.carePlanList(cp).map(p => p.problem);
  assert.equal(new Set(names).size, names.length);
  assert.equal(app.autoBuildCarePlans(cp, { notify: false }), 0);
  assert.equal(app.carePlanList(cp).length, names.length);
  assert.ok(app.carePlanList(cp).every(p => p.status === 'planned' && p.caseId === 'p19'));
});
test('検査値：OCRで要確認でも、本物の異常値かもしれない値は「仮に原文どおりなら」を条件つきで示し、確定の根拠にはしない', () => {
  const a = app.analyzeLabCard('ALT 250 U/L', { valueStd: 14, phase: '術前' });
  assert.equal(a.quality, 'suspicious');
  assert.equal(a.asWritten, '高値');
  assert.equal(a.status, 'review', '判定は要確認のまま（確定の根拠にしない）');
  const cp = { id: 'l', items: [card('m1', 'ALT (GPT) 14 U/L (基準値: 5〜45 U/L)', '術前'), card('m2', 'ALT 250 U/L (基準値: 5〜45 U/L)', '手術当日')], carePlans: {}, sourceText: '' };
  const t = app.buildLabAssessment(cp).text;
  assert.match(t, /データ確認：原本確認が必要/);
  assert.match(t, /仮に原文どおりなら：高値/);
  assert.doesNotMatch(t, /ALTが高値/);
});
test('別の手術の流用なし：大腿骨頸部骨折（人工骨頭置換術）の患者に、胃切除・インスリン・ストーマの計画が入らない', () => {
  const hip = { id: 'pa', carePlans: {}, sourceText: '右大腿骨頸部骨折 人工骨頭置換術後 脱臼肢位に注意', items: [card('h1', '術後1日目 創部痛 NRS5 体動時に痛む'), card('h2', '脱臼肢位の指示あり 荷重は医師の指示')] };
  app.autoBuildCarePlans(hip, { notify: false });
  const all = JSON.stringify(app.carePlanList(hip));
  assert.ok(!/インスリン|ストーマ|胃管|パウチ/.test(all));
  assert.equal(app.carePlanList(hip).filter(p => app.cpForeignTerms(hip, p).length).length, 0);
  assert.ok(app.carePlanList(hip).every(p => p.status === 'planned'));
});
