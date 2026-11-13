// v.265 — regression for the "patient 15" verification (gastrectomy, golden case 胃がん_A氏58歳): general rules, not case branches.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./app-helpers');
const app = loadApp();

const mk = (text, id = 'p') => {
  const items = Array.from(app.classifyTextByRules(text)).map((c, i) => ({ id: 'c' + i, text: c.text, type: c.type, timestamp: c.timestamp, hendersonIds: Array.from(c.hendersonIds), fieldLabel: c.fieldLabel }));
  const cp = { id, title: 'T', sourceText: text, items, myAssessments: {}, carePlans: {}, missingChecks: {}, selectedDiagnosisIds: [], diagnosisCandidates: [] };
  cp.relationMap = app.buildRelationMapFromRecord(cp);
  return cp;
};
const goldenPath = path.join(__dirname, 'golden', 'cases', '胃がん_A氏58歳.txt');
const have = fs.existsSync(goldenPath);
const gold = have ? mk(fs.readFileSync(goldenPath, 'utf8').replace(/\r\n?/g, '\n'), 'p15') : null;
const label = (map, id) => (map.nodes.find(n => n.id === id) || {}).label || '';
const edgesInto = (map, re) => map.edges.filter(e => re.test(label(map, e.target))).map(e => ({ from: label(map, e.source), rel: e.relation, to: label(map, e.target) }));
const chainsText = cp => app.relationMapExportText(cp);

test('患者15：鎮痛薬・オピオイドは創部痛の原因の流れに入らない（治療は原因ではない）', { skip: !have }, () => {
  const t = chainsText(gold);
  assert.ok(gold.relationMap.edges.some(e => e.relation === 'treats'), '治療の矢印そのものは残る');
  assert.doesNotMatch(t, /(?:鎮痛薬|硬膜外PCA|オピオイド|フェンタニル)[^\n]{0,6}→ 創部痛/);
});

test('患者15：オピオイドは副作用の側（腸蠕動の低下）には残る', { skip: !have }, () => {
  assert.match(chainsText(gold), /オピオイド（フェンタニル） → 腸の動き/);
});

test('患者15：HCV抗体（感染症スクリーニング）はライン・体動制限・活動耐性の原因にならない', { skip: !have }, () => {
  const m = gold.relationMap;
  const hcv = m.nodes.filter(n => /HCV/.test(n.label));
  hcv.forEach(n => assert.equal(m.edges.filter(e => e.source === n.id || e.target === n.id).length, 0, 'HCV抗体は因果の矢印を持たない'));
  assert.doesNotMatch(chainsText(gold), /HCV[^\n]*→/);
});

test('患者15：10年前に禁煙した喫煙歴は、現在の線毛機能の低下の原因にしない', { skip: !have }, () => {
  assert.doesNotMatch(chainsText(gold), /喫煙[^\n]*→ 気道の線毛機能/);
  assert.ok(!gold.relationMap.nodes.some(n => /線毛機能の低下・分泌物の増加/.test(n.label)), '喫煙が現在でなければ線毛機能のノードは作らない');
});

test('患者15：同じ記録で現在も喫煙している場合は、従来どおり気道への影響を結ぶ', { skip: !have }, () => {
  const raw = fs.readFileSync(goldenPath, 'utf8').replace(/\r\n?/g, '\n');
  assert.match(raw, /10年前に禁煙した/);
  const cp = mk(raw.replace('10年前に禁煙した', '現在も喫煙を続けている'), 'p15s');
  assert.match(chainsText(cp), /喫煙[^\n]*→ 気道の線毛機能/);
});

test('患者15：術後床上安静と創部痛だけでは「活動耐性低下」を実在の問題にしない（リスク状態にする）', { skip: !have }, () => {
  const probs = gold.relationMap.nodes.filter(n => n.type === 'nursing_problem').map(n => n.label);
  assert.ok(!probs.some(l => /^活動耐性低下（/.test(l)), probs.join('|'));
  const act = gold.relationMap.nodes.find(n => n.type === 'nursing_problem' && /活動耐性低下リスク状態/.test(n.label));
  assert.ok(act, '活動耐性低下リスク状態');
  assert.match(act.evidence, /危険因子：[^／]*術後安静/);
  assert.match(act.evidence, /反証条件：/);
});

test('患者15：絶食と軽度の体重減少・Alb低下だけでは「栄養摂取量不足」を確定せず、リスク状態にする', { skip: !have }, () => {
  const probs = gold.relationMap.nodes.filter(n => n.type === 'nursing_problem').map(n => n.label);
  assert.ok(!probs.some(l => /^栄養摂取量不足（/.test(l)), probs.join('|'));
  const nu = gold.relationMap.nodes.find(n => n.type === 'nursing_problem' && /栄養摂取量不足リスク状態/.test(n.label));
  assert.ok(nu);
  assert.match(nu.evidence, /危険因子：[^／]*絶食/);
  assert.match(nu.evidence, /反証条件：/);
});

test('危険因子と反証条件は書き出しにも出る', { skip: !have }, () => {
  const t = chainsText(gold);
  assert.match(t, /危険因子：[^\n]*／反証条件：/);
});

test('直接の記録がある場合は、従来どおり実在する問題になる（摂取量低下・息切れ・ADL介助）', () => {
  const cp = mk('72歳男性。胃全摘術後3日目。\n術後床上安静。\n食事は2割摂取で、食欲不振がある。体重が3kg減少した。\n動くと息切れがあり、すぐ疲れる。');
  const probs = cp.relationMap.nodes.filter(n => n.type === 'nursing_problem').map(n => n.label).join('|');
  assert.match(probs, /栄養摂取量不足(?!リスク)/);
  assert.match(probs, /活動耐性低下（/);
});

test('他科の知識を混ぜない：胃全摘術の重点アセスメントに脱臼・荷重・入院前の筋力低下を出さない', { skip: !have }, () => {
  for (const need of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) {
    const d = app.buildFocusDraft(gold, need);
    const all = `${d.focusAnalysis}\n${d.focusIntegration}\n${d.focusProblem}`;
    assert.doesNotMatch(all, /脱臼|荷重|入院前からの筋力|筋力（MMT）/, `欲求${need}`);
  }
});

test('他科の知識は、その科の記録があるときだけ出る（股関節手術では脱臼への不安を候補にできる）', () => {
  const cp = mk('入院前は自立していた。\n右大腿骨頸部骨折で人工骨頭置換術を施行した。\n術後1日目 創部痛NRS6。「動くと痛い」と話し、車いす移乗は中止した。');
  const r = app.crTopicsForNeed(cp, 4).find(x => x.topic.id === 'mobility');
  assert.ok(r, 'mobility topic');
  assert.ok(r.possible.concat(r.supported.map(x => x.label)).includes('脱臼への不安'));
});

test('「inoutバランス」「栄養バランス」は筋力・バランスの低下の根拠にならない', () => {
  const cp = mk('胃全摘術後1日目。\n【inoutバランス】in：輸液1300ml、out：出血量105g\n術後床上安静。創部痛NRS2。');
  const r = app.crTopicsForNeed(cp, 4).find(x => x.topic.id === 'mobility');
  assert.ok(!r || !r.supported.some(x => /筋力|バランス/.test(x.label)));
});

test('「HCV」「HBV」の英字に含まれる CV をカテーテルと取り違えない／本物の CV は拾う', () => {
  const a = mk('胃全摘術後。HCV抗体(-)、HBs抗原(-)。\n術後床上安静。');
  assert.ok(!a.relationMap.nodes.some(n => /HCV/.test(n.label) && a.relationMap.edges.some(e => e.source === n.id || e.target === n.id)));
  const b = mk('胃全摘術後。CV挿入中。\n術後床上安静。');
  assert.ok(b.relationMap.nodes.some(n => /CV/.test(n.label)));
});

test('関連図の原因の流れは、治療・管理の矢印をたどらない', () => {
  const map = { nodes: [{ id: 'a', type: 'treatment', label: '鎮痛薬' }, { id: 'b', type: 'symptom', label: '創部痛' }, { id: 'c', type: 'nursing_problem', label: '急性疼痛' }, { id: 'd', type: 'pathophysiology', label: '組織損傷' }], edges: [{ source: 'a', target: 'b', relation: 'treats' }, { source: 'd', target: 'b', relation: 'causes' }, { source: 'b', target: 'c', relation: 'results_in' }] };
  const chains = app.rmCauseChains(map, 'c').map(ch => ch.map(n => n.label).join('>'));
  assert.equal(JSON.stringify(chains), JSON.stringify(['創部痛>組織損傷']));
});

// ---- 段階B：重点アセスメント・看護問題・関連図の整合、術前術後の区別 ----
test('患者15：呼吸が満たされていないなら、同じ問題（術後呼吸器合併症リスク状態）が重点アセスメント・看護計画・関連図に一貫して出る', { skip: !have }, () => {
  const cp = mk(fs.readFileSync(goldenPath, 'utf8').replace(/\r\n?/g, '\n'), 'p15b');
  app.buildCarePlansByRules(cp);
  const d = app.buildFocusDraft(cp, 1);
  assert.match(d.focusIntegration, /呼吸は満たされていない/);
  assert.match(d.focusProblem, /術後呼吸器合併症リスク状態/);
  assert.ok(!/現時点ではない/.test(d.focusProblem));
  assert.ok(app.carePlanList(cp).some(p => /術後呼吸器合併症リスク状態/.test(p.problem)));
  assert.ok(cp.relationMap.nodes.some(n => n.type === 'nursing_problem' && /術後呼吸器合併症リスク状態/.test(n.label)));
  assert.ok(!app.cvConsistencyIssues(cp).some(x => x.id === 'need1'));
});

test('整合性検査：満たされていない欲求に対応する問題がなければ指摘し、関連図にあって計画にない問題も指摘する', { skip: !have }, () => {
  const cp = mk(fs.readFileSync(goldenPath, 'utf8').replace(/\r\n?/g, '\n'), 'p15c');
  app.buildCarePlansByRules(cp);
  const target = app.carePlanList(cp).find(p => /術後呼吸器合併症リスク状態/.test(p.problem));
  app.deleteCarePlan(cp, target.id);
  const issues = Array.from(app.cvConsistencyIssues(cp)).map(x => x.msg).join('\n');
  assert.match(issues, /「呼吸」は満たされていないと判断しているが、対応する看護問題がない/);
  assert.match(issues, /関連図の問題「術後呼吸器合併症リスク状態」が看護計画にない/);
  const audit = Array.from(app.cvAuditFindings(cp)).filter(f => f.area === '問題の整合');
  assert.ok(audit.length >= 2);
});

test('酸素投与そのものは呼吸の未充足の根拠にしない（酸素下のSpO2が94%以上のとき）', { skip: !have }, () => {
  const cp = mk(fs.readFileSync(goldenPath, 'utf8').replace(/\r\n?/g, '\n'), 'p15d');
  const r = app.ruleSufficiencyFor(cp)[1];
  assert.doesNotMatch(String(r.post.reason), /酸素/);
  assert.match(String(r.post.reason), /湿性咳嗽/);
  const only = mk('胃全摘術後。\n手術当日 帰室時の状況: 【Spo2】99%(酸素5L/分)\n');
  const r2 = app.ruleSufficiencyFor(only)[1];
  assert.notEqual(r2.post && r2.post.verdict, 'unmet');
});

test('術前から術後への変化を「悪化」と書かず、術前と比べた新たな課題として書く', { skip: !have }, () => {
  const cp = mk(fs.readFileSync(goldenPath, 'utf8').replace(/\r\n?/g, '\n'), 'p15e');
  app.buildCarePlansByRules(cp);
  const d = app.buildFocusDraft(cp, 1);
  assert.doesNotMatch(d.focusAnalysis, /経過とともに悪化/);
  assert.match(d.focusAnalysis, /術前の状態と比べて、術後に新たな課題が出てきている/);
});

// ---- 段階C：看護計画（問題ごとの明確化・根拠・評価指標・条件付き口腔ケア・実施済みにしない）----
const plansOf = cp => { cp.carePlans = {}; app.buildCarePlansByRules(cp); return Array.from(app.carePlanList(cp)); };

test('看護計画：問題ごとに「問題の明確化・OP/CP/EPの根拠・評価指標」が作られ、計画は実施済みと書かない', { skip: !have }, () => {
  const cp = mk(fs.readFileSync(goldenPath, 'utf8').replace(/\r\n?/g, '\n'), 'p15f');
  const plans = plansOf(cp);
  assert.ok(plans.length >= 6);
  plans.forEach(p => {
    assert.ok(p.design, p.problem);
    assert.ok(p.design.clarification && p.design.basis.op !== undefined && p.design.basis.tp && p.design.basis.ep, p.problem);
    assert.ok(p.design.indicators.length >= 2, p.problem);
    assert.match(p.design.planned, /実施済みではない/);
    assert.equal(p.records.length, 0);
    assert.ok(['draft', 'planned'].includes(p.status), `${p.problem}: ${p.status}`); // 自動で作った計画は下書き・計画作成済みまで。実施中・終了にはしない
  });
});

test('看護計画：リスク状態は危険因子と反証条件を持ち、実在の問題は所見と目標で評価する（目標の設計が別）', { skip: !have }, () => {
  const cp = mk(fs.readFileSync(goldenPath, 'utf8').replace(/\r\n?/g, '\n'), 'p15g');
  const plans = plansOf(cp);
  const risk = plans.find(p => /^術後呼吸器合併症リスク状態/.test(p.problem));
  const act = plans.find(p => /^急性疼痛/.test(p.problem));
  assert.equal(risk.design.kind, 'risk');
  assert.ok(risk.design.riskFactors.length >= 1);
  assert.match(risk.design.refutation, /問題から外す/);
  assert.match(risk.design.indicators.join('／'), /反証条件/);
  assert.equal(act.design.kind, 'actual');
  assert.match(act.design.indicators.join('／'), /長期目標の指標/);
  assert.doesNotMatch(act.design.indicators.join('／'), /反証条件/);
});

test('看護計画：術後呼吸器合併症リスクには条件確認つきの口腔ケアが入り、肺炎を完全に防ぐとは書かない', { skip: !have }, () => {
  const cp = mk(fs.readFileSync(goldenPath, 'utf8').replace(/\r\n?/g, '\n'), 'p15h');
  const p = plansOf(cp).find(q => /^術後呼吸器合併症リスク状態/.test(q.problem));
  const oral = p.tp.find(t => /^口腔ケア/.test(t));
  assert.ok(oral, 'oral care');
  ['意識', '嚥下', '咳嗽', '自分でできる', '誤嚥', '絶飲食', '口腔内'].forEach(w => assert.ok(oral.includes(w), w));
  assert.match(oral, /完全に防げるわけではなく/);
  assert.match(oral, /看護師が/); // who
  assert.match(oral, /食事の前後|就寝前|離床の前/); // when
  assert.match(oral, /座位|上体挙上/); // how / where
  assert.doesNotMatch(oral, /\d+\s*回|\d+\s*mL|\d+\s*分ごと/); // frequency and amounts are not fixed
});

test('看護計画：口腔ケアは呼吸器合併症リスク以外の問題や手術のない記録には足さない', () => {
  const cp = mk('72歳女性。心不全で入院。\n息苦しさがあり、SpO2 92%。浮腫あり。');
  plansOf(cp).forEach(p => assert.ok(!(p.tp || []).some(t => /^口腔ケア（誤嚥/.test(t)), p.problem));
});

test('看護計画：酸素投与下のSpO2は室内気と同じ基準で比べないと時期の注意に書く', { skip: !have }, () => {
  const cp = mk(fs.readFileSync(goldenPath, 'utf8').replace(/\r\n?/g, '\n'), 'p15i');
  const p = plansOf(cp).find(q => /^術後呼吸器合併症リスク状態/.test(q.problem));
  assert.match(p.design.timing, /室内気/);
});

test('看護計画：書き出し（テキスト）に問題の明確化・根拠・評価指標が出る／手動で編集した計画は上書きしない', { skip: !have }, () => {
  const cp = mk(fs.readFileSync(goldenPath, 'utf8').replace(/\r\n?/g, '\n'), 'p15j');
  const plans = plansOf(cp);
  const t = app.buildCarePlansText(cp);
  assert.match(t, /問題の明確化：/);
  assert.match(t, /OPの根拠：/);
  assert.match(t, /評価指標：/);
  const target = plans[0];
  app.updateCarePlan(cp, target.id, { tp: ['手で書いた援助'], userEdited: true });
  const before = JSON.stringify(app.getCarePlan(cp, target.id).tp);
  app.refineCarePlans(cp);
  assert.equal(JSON.stringify(app.getCarePlan(cp, target.id).tp), before);
});

// ---- 段階D：不明瞭な検査値・術後出血・循環の観察 ----
test('不明瞭な検査値：原文は直さず、理由つきの補正候補を「未確定」で示す（TP 60g/21・RBC 4587/uL・AST 2）', { skip: !have }, () => {
  const cp = mk(fs.readFileSync(goldenPath, 'utf8').replace(/\r\n?/g, '\n'), 'p15k');
  const before = JSON.stringify(cp.items.map(i => i.text));
  const msgs = Array.from(app.cvCheckLabPlausibility(cp)).map(x => x.msg);
  const all = msgs.join('\n');
  assert.match(all, /TP「TP 60g\/21」[^\n]*60 g\/L[^\n]*6\.0 g\/dL[^\n]*未確定/);
  assert.match(all, /RBC「RBC 4587\/uL」[^\n]*×10\^3[^\n]*未確定/);
  assert.match(all, /AST「AST 2U\/L」[^\n]*桁の欠落[^\n]*未確定/);
  assert.match(all, /AST 2・ALT 250/);
  assert.match(all, /ALTが術前の 14 から手術当日の 250 へ約18倍/);
  assert.equal(JSON.stringify(cp.items.map(i => i.text)), before, '検査値の確認で記録を書き換えない');
  assert.ok(Array.from(app.cvAuditFindings(cp)).some(f => f.area === '検査値の妥当性'));
});

test('不明瞭な検査値：通常の値・通常の単位（×10^4/μL など）には指摘を出さない', () => {
  const cp = mk('術前検査\nRBC(赤血球数) 511 ×10^4/μL (基準値: 400〜550 ×10^4/μL)\nHb 13.5 g/dL\nAST 24 U/L\nALT 18 U/L\nAlb 4.1 g/dL\nTP 6.8 g/dL');
  assert.equal(app.cvCheckLabPlausibility(cp).length, 0);
});

test('術後出血：術中出血・淡血性ドレーン・Hbだけではリスク状態にし、危険因子と反証条件を持つ（発生とは区別する）', { skip: !have }, () => {
  const cp = mk(fs.readFileSync(goldenPath, 'utf8').replace(/\r\n?/g, '\n'), 'p15l');
  const pr = cp.relationMap.nodes.find(n => n.type === 'nursing_problem' && /出血/.test(n.label));
  assert.ok(pr, '出血の問題');
  assert.match(pr.label, /出血リスク状態/);
  assert.match(pr.evidence, /危険因子：[^／]*術中出血量/);
  assert.match(pr.evidence, /反証条件：/);
  assert.ok(!cp.relationMap.nodes.some(n => n.type === 'nursing_problem' && /^出血（術後出血）/.test(n.label)));
});

test('術後出血：鮮血性の排液が増えるなど出血の所見が記録にあるときは実在の問題になる', () => {
  const raw = fs.readFileSync(goldenPath, 'utf8').replace(/\r\n?/g, '\n') + '\n術後1日目 ドレーン排液が鮮血性に変わり、出血が持続している。血圧92/50、脈拍108。\n';
  const cp = mk(raw, 'p15m');
  assert.ok(cp.relationMap.nodes.some(n => n.type === 'nursing_problem' && /^出血（術後出血）/.test(n.label)));
});

test('術後出血：看護計画に排液・創部・循環・Hbの観察、報告、ドレーン保護が入り、頻度を固定しない', { skip: !have }, () => {
  const cp = mk(fs.readFileSync(goldenPath, 'utf8').replace(/\r\n?/g, '\n'), 'p15n');
  const p = plansOf(cp).find(q => /出血/.test(q.problem));
  assert.ok(p, '出血の看護計画');
  const op = p.op.join('\n'), tp = p.tp.join('\n');
  assert.match(op, /ドレーン排液/);
  assert.match(op, /血圧・脈拍・顔色/);
  assert.match(op, /Hb/);
  assert.match(tp, /院内の報告基準/);
  assert.match(tp, /頻度を固定しない/);
  assert.equal(p.design.kind, 'risk');
});

test('手術のない記録では、出血の看護計画に術後出血の内容を入れない', () => {
  const cp = mk('68歳男性。肝硬変で入院。\n歯肉出血があり、血小板が低下している。');
  const p = plansOf(cp).find(q => /出血/.test(q.problem));
  if (p) assert.doesNotMatch(p.op.concat(p.tp).join('\n'), /ドレーン排液|術後/);
});

// ---- 呼吸予備力：1秒率とブリンクマン指数を関連図に組み込む（v.267）----
test('関連図：1秒率70%未満とブリンクマン指数（本数×年数）が呼吸予備力の低下につながる／繊毛機能の低下とは書かない', { skip: !have }, () => {
  const t = chainsText(gold);
  assert.match(t, /ブリンクマン指数 560（20本\/日×28年） → 閉塞性の換気障害の傾向（呼吸予備力の低下）/);
  assert.match(t, /（1秒率 69\.33%） → 閉塞性の換気障害の傾向/);
  const edge = gold.relationMap.edges.find(e => /ブリンクマン/.test(label(gold.relationMap, e.source)));
  assert.match(edge.evidence, /繊毛機能そのものの評価ではない/);
  assert.doesNotMatch(t, /喫煙[^\n]*→ 気道の線毛機能/);
});

test('関連図：1秒率が70%以上なら呼吸予備力の低下の根拠にしない／従来の「FEV1%」表記も読む', () => {
  const base = fs.readFileSync(goldenPath, 'utf8').replace(/\r\n?/g, '\n');
  const normal = mk(base.replace('一秒率69.33％', '一秒率82.10％'), 'p15fn');
  assert.doesNotMatch(chainsText(normal), /1秒率 82/);
  const old = mk(base.replace('一秒率69.33％', 'FEV1% 62%'), 'p15fo');
  assert.match(chainsText(old), /1秒率 62%/);
});

test('関連図：ブリンクマン指数が400未満なら結ばない／年数の書き方（喫煙歴○年）も読む', () => {
  const base = fs.readFileSync(goldenPath, 'utf8').replace(/\r\n?/g, '\n');
  assert.ok(base.includes('20歳から喫煙（20本／日）していたが、10年前に禁煙した'));
  const low = mk(base.replace('20歳から喫煙（20本／日）していたが、10年前に禁煙した', '喫煙歴5年（10本／日）、10年前に禁煙した'), 'p15bl');
  assert.doesNotMatch(chainsText(low), /ブリンクマン/);
  const yrs = mk(base.replace('20歳から喫煙（20本／日）していたが、10年前に禁煙した', '喫煙歴30年（20本／日）、10年前に禁煙した'), 'p15by');
  assert.match(chainsText(yrs), /ブリンクマン指数 600（20本\/日×30年）/);
});

test('v.270: full text and print exports lead each need with its verdict AND the reason (existing wording), then the records', { skip: !have }, () => {
  const txt = app.buildExportPlainText(gold), html = app.buildExportBodyHtml(gold);
  assert.match(txt, /【5\. 欲求の充足状況（判定の理由と記録）】/);
  assert.doesNotMatch(txt, /ヘンダーソン14項目別アセスメント整理/);
  const needs = app.HENDERSON_NEEDS.filter(n => app.sufficiencyTextOf(gold, n.id));
  assert.ok(needs.length >= 10);
  for (const n of needs) {
    const head = `${n.id}. ${n.name}　＝${app.sufficiencyTextOf(gold, n.id)}`;
    assert.ok(txt.includes(head), 'verdict line for need ' + n.id);
    const at = txt.indexOf(head), next = txt.indexOf('\n\n', at) > 0 ? txt.indexOf('\n\n', at) : txt.length;
    const block = txt.slice(at, next > at ? next : txt.length);
    if (block.includes('判定と理由')) assert.ok(block.indexOf('判定と理由') < (block.indexOf('  記録') < 0 ? Infinity : block.indexOf('  記録')), 'reason comes before the records');
  }
  // the reason sentence is the existing (frozen) one
  const ph = app.sufficiencyUiPhases(gold)[0], x = app.sufficiencyPhaseText(gold, needs[0].id, ph.key);
  assert.ok(x && txt.includes(x.match(/判定根拠：([\s\S]*)$/)[1]), 'text detail uses the frozen sentence');
  assert.match(txt, /▶説明：/);
  assert.match(html, /<h3>1\. 呼吸[^<]*<span[^>]*>＝/);
  assert.match(html, /の判定：[\s\S]*<table>/);
  assert.ok(html.indexOf('の判定：') < html.indexOf('<table>', html.indexOf('<h3>1.')), 'print: reason before the card table');
});

test('v.270: lab evaluation follows the review memo (sex-specific Hb, ALP method, Alb/CRP context, OCR estimates, timing)', { skip: !have }, () => {
  const t = app.buildLabAssessment(gold).text;
  assert.match(t, /Hb：13\.5 → 12\.2 g\/dL\n　判定：記録の基準値[^\n]*ただし男性の貧血の目安/);
  assert.match(t, /ALP：221 U\/L\n　判定：判定保留/);
  assert.doesNotMatch(t, /ALPが高値のため/);
  assert.match(t, /WBCは5,880から11,600\/μLに増加している。手術侵襲による炎症反応の可能性があるが、数値だけでは感染の有無を判断できない/);
  assert.match(t, /Albが4\.1から3\.5 g\/dLに低下している[^\n]*低栄養と断定せず/);
  assert.match(t, /CRPは術前から0\.66と高く[^\n]*術後の変化だけが原因とはいえない/);
  assert.match(t, /手術当日の値は、採血時刻（手術の前か後か）が記録から分からない/);
  assert.equal((t.match(/採血時刻（手術の前か後か）/g) || []).length, 1, 'said once');
  assert.match(t, /ALT：原文「ALT 250[^\n]*\n[\s\S]*確認の優先度：高/);
  assert.match(t, /TP 6\.0 g\/dL 前後[^\n]*推定確度：不明/);
  assert.match(t, /RBC 458\.7[^\n]*推定確度：不明/);
  assert.match(t, /項目不明・判定不可/);
  assert.doesNotMatch(t, /ALP 264/);
  assert.match(t, /血圧：133\/80mmHg[^\n]*診察室血圧の分類では高値血圧/);
  assert.match(t, /1秒率：69\.33%[\s\S]*検査を実施した日の記載がありません/);
  assert.match(t, /%肺活量は110\.6%と目安の範囲内である一方、1秒率が69\.33%/);
});
