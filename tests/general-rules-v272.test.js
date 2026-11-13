// v.272 — 一般ルールの回帰テスト（特定の事例専用の処理を入れていないことの確認を兼ねる）。
// 合成した短い記録と、複数の疾患・年齢層の既存事例の両方で確かめる。
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
const casesDir = path.join(__dirname, 'golden', 'cases');
const caseFiles = fs.existsSync(casesDir) ? fs.readdirSync(casesDir).filter(f => /\.txt$/.test(f)) : [];
const loadCase = f => fs.readFileSync(path.join(casesDir, f), 'utf8').replace(/\r\n?/g, '\n');
const labels = map => map.nodes.map(n => n.label);
const nodeBy = (map, re) => map.nodes.find(n => re.test(n.label));
const edgesTo = (map, re) => map.edges.filter(e => re.test((map.nodes.find(n => n.id === e.target) || {}).label || ''));

const GI = (extra) => `氏名：Z氏 62歳 男性\n診断名：S状結腸がん\n手術：腹腔鏡下S状結腸切除術（吻合あり）を全身麻酔で実施\n術後1日目\nO：帰室時 BP 118/70mmHg 脈拍 80回/分 SpO2 98%（酸素3L/分）。術後床上安静。吻合部近傍にドレーン留置、排液は淡血性。点滴ルート確保。食事は絶飲食。${extra}\n`;

test('疼痛の点数だけでは部位を決めない：部位の記載がなければ「創部痛」と書かず、記載があれば創部痛とする', () => {
  const noSite = mk(GI('疼痛はNRS 2。'));
  assert.ok(labels(noSite.relationMap).some(l => /^疼痛（NRS 2）・部位の記載なし/.test(l)), '部位なしの疼痛');
  assert.ok(!labels(noSite.relationMap).some(l => /^創部痛/.test(l)));
  assert.ok(!labels(noSite.relationMap).some(l => /急性疼痛（手術創部の侵襲）/.test(l)), '問題名にも創部を入れない');
  const withSite = mk(GI('創部痛あり、NRS 3。'));
  assert.ok(labels(withSite.relationMap).some(l => /^創部痛（NRS 3）/.test(l)));
});

test('疼痛が動作を妨げるかは、動作時の痛み・NRS4以上・動かない理由の記録があるときだけ確定し、なければ「可能性」', () => {
  const low = mk(GI('疼痛はNRS 2。'));
  const lowMove = low.relationMap.edges.filter(e => /動くと痛み|体動の制限/.test((low.relationMap.nodes.find(n => n.id === e.target) || {}).label || '') && e.certainty === 'possible');
  assert.ok(lowMove.length >= 1, '低いNRSだけでは動作制限への線は可能性');
  const stated = mk(GI('「動くと痛いのでベッドから起きたくない」と話す。疼痛はNRS 6。'));
  const painToMob = stated.relationMap.edges.filter(e => /動くと痛み|体動の制限/.test((stated.relationMap.nodes.find(n => n.id === e.target) || {}).label || '') && (stated.relationMap.nodes.find(n => n.id === e.source) || {}).type === 'symptom');
  assert.ok(painToMob.length && painToMob.every(e => e.certainty !== 'possible'), '動作時の痛みの記録があれば確定の線');
});

test('湿性咳嗽だけでは「痰の絡み」「痰の貯留」を確定しない（貯留への線は可能性）。痰の記録があれば確定', () => {
  const wet = mk(GI('湿性咳嗽が時々ある。'));
  assert.ok(!labels(wet.relationMap).some(l => /痰の絡み/.test(l)));
  const toSecretion = edgesTo(wet.relationMap, /分泌物の貯留/);
  assert.ok(toSecretion.length && toSecretion.every(e => e.certainty === 'possible'));
  const sputum = mk(GI('痰が絡んで出せない様子。'));
  const e2 = edgesTo(sputum.relationMap, /分泌物の貯留/);
  assert.ok(e2.length && e2.every(e => e.certainty !== 'possible'));
});

test('血栓塞栓症の候補：複数の危険因子（腹部手術・悪性腫瘍・全身麻酔・床上安静など）がある術後に出し、術後でない／危険因子がない事例には足さない', () => {
  const cp = mk(GI(''));
  assert.ok(nodeBy(cp.relationMap, /^静脈血栓塞栓症リスク状態/), '危険因子がそろう術後');
  const pDvt = nodeBy(cp.relationMap, /^静脈血栓塞栓症リスク状態/);
  assert.match(pDvt.evidence, /悪性腫瘍|腹部/);
  // 活動耐性低下とは別の問題として立つ
  assert.ok(nodeBy(cp.relationMap, /活動耐性/) ? nodeBy(cp.relationMap, /活動耐性/).id !== pDvt.id : true);
  ['事例1_肺炎_架空.txt', '事例5_産褥_架空.txt', '事例3_心不全_架空.txt'].filter(f => caseFiles.includes(f)).forEach(f => {
    const m = mk(loadCase(f), f).relationMap;
    assert.ok(!nodeBy(m, /^静脈血栓塞栓症リスク状態/), `${f} に血栓の候補を足さない`);
  });
});

test('ホーマンズ徴候の陰性だけで血栓を除外しない：根拠の文に明記し、疼痛など別の項目へは線を引かない', () => {
  const cp = mk(GI('ホーマンズ徴候は陰性。疼痛はNRS 2。'));
  const p = nodeBy(cp.relationMap, /^静脈血栓塞栓症リスク状態/);
  assert.match(p.evidence, /ホーマンズ徴候が陰性でも血栓は否定しない/);
  const intoDvt = edgesTo(cp.relationMap, /^静脈血栓塞栓症リスク状態/).map(e => (cp.relationMap.nodes.find(n => n.id === e.source) || {}).label);
  assert.ok(!intoDvt.some(l => /疼痛/.test(l)));
});

test('縫合不全の候補：消化管の切除・吻合・再建のある術後に出し、消化管でない手術（大腿骨）には出さない', () => {
  assert.ok(nodeBy(mk(GI('')).relationMap, /^縫合不全リスク状態/));
  const hip = caseFiles.includes('学生記録6_大腿骨頸部骨折_Day形式.txt') ? mk(loadCase('学生記録6_大腿骨頸部骨折_Day形式.txt')).relationMap : null;
  if (hip) assert.ok(!nodeBy(hip, /^縫合不全リスク状態/));
});

test('転倒転落の候補：術後の離床開始前に複数の要因（鎮痛薬・ライン類・安静・貧血・高齢）がそろうときだけ。要因が少ない術後には足さない', () => {
  const many = mk(GI('硬膜外PCAでフェンタニルを持続投与。Hb 9.1g/dL。'));
  assert.ok(nodeBy(many.relationMap, /^転倒転落リスク状態（離床開始時）/));
  const few = mk('氏名：Y氏 30歳 女性\n診断名：急性虫垂炎\n手術：腹腔鏡下虫垂切除術を実施\n術後1日目\nO：体温36.8℃ 創部に出血なし。歩行可。\n');
  assert.ok(!nodeBy(few.relationMap, /^転倒転落リスク状態（離床開始時）/));
});

test('絶飲食など医学的な制限の期間は、検査値だけで「充足」にしない（術前の摂取量も術後の根拠にしない）', () => {
  const cp = mk(`氏名：Z氏 62歳 男性\n診断名：S状結腸がん\n手術：腹腔鏡下S状結腸切除術を全身麻酔で実施\n手術前日\nO：朝食は全量摂取。\n術後1日目\nO：食事は絶飲食。点滴で管理。Alb 3.5g/dL。\n`);
  const r = app.ruleSufficiencyFor(cp)[2];
  assert.ok(r && r.postop, '術後の欄がある');
  assert.notEqual(r.postop.verdict, 'met');
  const facts = [...((r.postop.facts || {}).for || [])].map(f => f.text).join('|');
  assert.doesNotMatch(facts, /全量摂取/, '術前の全量摂取を術後の根拠にしない');
});

test('どの事例でも：関連図・看護計画の看護問題番号が一致し、本人に頼む言い方（〜してもらう）と固定日数の目標が出ない', () => {
  caseFiles.forEach(f => {
    const cp = mk(loadCase(f), f);
    app.buildCarePlansByRules(cp);
    const plans = Array.from(app.carePlanList(cp));
    const probs = cp.relationMap.nodes.filter(n => n.type === 'nursing_problem');
    const norm = t => String(t).replace(/（候補）$/, '').replace(/\s+/g, '');
    plans.forEach((p, i) => {
      const n = probs.find(x => norm(x.label) === norm(p.problem));
      if (n) assert.equal(n.priority, i + 1, `${f}：${p.problem} の番号`);
    });
    const nums = probs.map(n => n.priority);
    assert.equal(new Set(nums).size, nums.length, `${f}：番号が重複しない`);
    const gen = plans.filter(p => ['rules', 'map'].includes(p.source));
    const text = gen.map(p => [p.goalShort, p.goalLong, ...(p.op || []), ...(p.tp || []), ...(p.ep || [])].join('\n')).join('\n');
    assert.doesNotMatch(text, /もらう|もらい|もらっ/, `${f}：頼む言い方を残さない`);
    assert.doesNotMatch(text, /\d日後までに|術後\d日目までに|\d週間後までに/, `${f}：根拠のない期間を固定しない`);
  });
});

test('関連図の書き出し：根拠として参照する線と可能性の線を区別し、同じ経路（途中を省いただけの経路）を重ねて出さない', () => {
  const cp = mk(GI('湿性咳嗽が時々ある。疼痛はNRS 2。'));
  const t = app.relationMapExportText(cp);
  assert.match(t, /―根拠として参照→/);
  assert.match(t, /―可能性→/);
  const lines = t.split('\n').filter(l => /^　流れ/.test(l));
  const seq = l => l.replace(/^　流れ\d+：/, '').split(/ → | ―[^→]+→ /);
  lines.forEach((a, i) => lines.forEach((b, j) => {
    if (i === j) return;
    const A = seq(a), B = seq(b);
    if (A.length < B.length && A[0] === B[0] && A[A.length - 1] === B[B.length - 1]) {
      let k = 0; for (const x of B) if (x === A[k]) k++;
      assert.notEqual(k, A.length, '途中を省いただけの経路が重複している');
    }
  }));
});

test('どの事例でも、患者の記録にない固有名（特定の患者名）を生成文に入れない', () => {
  caseFiles.forEach(f => {
    const cp = mk(loadCase(f), f);
    const text = app.relationMapExportText(cp);
    assert.doesNotMatch(text, /A氏の場合は/);
  });
});

test('痛みの目標：現在のNRSが3以下の患者に「NRS3以下にする」という改善目標を立てない', () => {
  const cp = mk(GI('創部痛あり、NRS 2。'));
  app.buildCarePlansByRules(cp);
  const p = Array.from(app.carePlanList(cp)).find(x => /疼痛/.test(x.problem));
  assert.ok(p, '疼痛の計画');
  assert.doesNotMatch(`${p.goalLong}\n${p.goalShort}`, /NRS\s?3以下/);
});
