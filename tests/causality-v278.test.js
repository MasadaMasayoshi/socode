// v.278 — causal path vs. observation, risk factors vs. devices, evidence hand-off, separation of assessment aspects
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const dir = path.join(__dirname, 'golden', 'cases');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /\.txt$/.test(f)) : [];
const mk = (text, id = 'p') => {
  const items = Array.from(app.classifyTextByRules(text)).map((c, i) => ({ id: 'c' + i, text: c.text, type: c.type, timestamp: c.timestamp, hendersonIds: Array.from(c.hendersonIds), fieldLabel: c.fieldLabel }));
  return { id, title: 'T', sourceText: text, items, myAssessments: {}, carePlans: {}, missingChecks: {}, selectedDiagnosisIds: [], diagnosisCandidates: [] };
};
const caseOf = f => { const cp = mk(fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n?/g, '\n'), 'c' + f); app.cpEnsureBuilt(cp); return cp; };
const gastric = files.find(f => /胃がん_A/.test(f));

test('観察所見（湿性咳嗽・浅い呼吸）は、病態の「原因」ではなく、病態から現れる所見として結ぶ（全事例）', () => {
  files.forEach(f => {
    const cp = caseOf(f); const m = cp.relationMap; if (!m) return;
    const byId = new Map(m.nodes.map(n => [n.id, n]));
    m.edges.forEach(e => {
      const s = byId.get(e.source), t = byId.get(e.target);
      if (s && t && s.type === 'symptom' && /湿性咳嗽|浅い呼吸|呼吸が浅/.test(s.label) && t.type === 'pathophysiology' && ['causes', 'contributes_to'].includes(e.relation)) assert.fail(`${f}: ${s.label} -> ${t.label}`);
    });
  });
});

test('ドレーン・ライン類は、縫合不全・イレウスの危険因子に入れない（感染・転倒などには入る）', () => {
  if (!gastric) return;
  const cp = caseOf(gastric);
  app.carePlanList(cp).forEach(p => {
    const fs_ = ((p.design || {}).riskFactors || []).join('・');
    if (/縫合不全|イレウス|消化管運動|出血/.test(p.problem)) assert.doesNotMatch(fs_, /ライン|ドレーン/, p.problem);
  });
  const leak = app.carePlanList(cp).find(p => /縫合不全/.test(p.problem));
  assert.ok(leak);
  assert.doesNotMatch(String(leak.design.clarification), /ドレーン/);
});

test('出血リスクの危険因子に、排液の性状・Hbなど現在の観察所見を入れない（観察所見として別に書く）', () => {
  if (!gastric) return;
  const cp = caseOf(gastric);
  const b = app.carePlanList(cp).find(p => /出血リスク/.test(p.problem));
  assert.ok(b);
  const rf = b.design.riskFactors.join('・');
  assert.doesNotMatch(rf, /Hb|排液/);
  assert.match(b.design.clarification, /があり、.*(?:ドレーン|Hb)/);
});

test('根拠になる記録がある計画は、根拠データが空にならない', () => {
  if (!gastric) return;
  const cp = caseOf(gastric);
  app.carePlanList(cp).forEach(p => assert.ok((p.evidence || []).length > 0, `${p.problem}`));
});

test('呼吸の目標に、SpO2 95%などの一律の基準を置かない', () => {
  files.forEach(f => {
    const cp = caseOf(f);
    app.carePlanList(cp).forEach(p => { if (/呼吸|気道|痰|肺/.test(p.problem)) assert.doesNotMatch(`${p.goalLong}${p.goalShort}`, /SpO2\s*95|95\s*%\s*未満/, `${f} ${p.problem}`); });
  });
});

test('疼痛の部位は、記録が痛みと結びつけて書いたときだけ「創部痛」とする', () => {
  const a = app.cpRecordContext ? app.cpRecordContext(mk('氏名：Z氏 62歳 男性\n診断名：S状結腸がん\n術後1日目\nO：創部：発赤なし\nO：疼痛はNRS 2\n')) : null;
  if (a) assert.equal(a.painSite, '');
  const b = app.cpRecordContext ? app.cpRecordContext(mk('氏名：Z氏 62歳 男性\n診断名：S状結腸がん\n術後1日目\nO：創部痛あり NRS 3\n')) : null;
  if (b) assert.equal(b.painSite, '創部痛');
});

test('関連図の「つながっていない項目」は、どの種類の線でも看護問題につながっている項目を含めない', () => {
  if (!gastric) return;
  const cp = caseOf(gastric);
  const t = app.relationMapExportText(cp);
  assert.doesNotMatch(t, /どの看護問題ともつながっていない項目/);
});

test('欲求ごとの分析で、判定の材料が別の面にまたがるときは面を分けて書く', () => {
  const n2 = app.sufficiencySeparationNote(2, { verdict: 'met', facts: [{ text: '朝食全量摂取', pol: 'met' }, { text: '体重59.5kg(1か月で体重2.0kg減)', pol: '' }], now: [] });
  assert.match(n2, /摂る力.*栄養状態.*別の面/);
  const n9 = app.sufficiencySeparationNote(9, { verdict: 'unknown', facts: [{ text: '点滴：末梢静脈ラインより滴下' }, { text: '挿入したもの：●Aライン' }], now: [{ text: '点滴：末梢静脈ラインより滴下' }] });
  assert.match(n9, /危険因子の面.*安全対策の面/);
  const n10 = app.sufficiencySeparationNote(10, { verdict: 'met', facts: [], now: [{ text: 'のどを示しながら、苦悶の表情', pol: 'met' }] });
  assert.match(n10, /意思表示の方法の面.*必要なことを十分に/);
  const n14 = app.sufficiencySeparationNote(14, { verdict: 'unmet', facts: [{ text: '呼吸訓練を促すと「やっぱりやらなくちゃいけないの?」と聞いてくる' }, { text: 'オリエンテーションを受ける' }], now: [] });
  assert.match(n14, /知識.*意欲.*どれが関わるか/);
  assert.equal(app.sufficiencySeparationNote(9, { verdict: 'met', facts: [{ text: '点滴ライン' }, { text: 'ナースコールを手元に置く' }], now: [] }), '');
});

test('関連図の解釈は、その欲求に属する看護問題に限り、ドレーンなど治療の線は要因に入れない', () => {
  if (!gastric) return;
  const cp = caseOf(gastric);
  for (const n of [2, 9]) ['pre', 'preop', 'postop'].forEach(ph => {
    const t = app.sufficiencyAnalysis(cp, n, ph);
    assert.doesNotMatch(t, /縫合不全リスク状態.*につながる要因/, `need ${n} ${ph}`);
  });
});

test('術後イレウス：手術操作・炎症→腸の動きの低下の経路を主とし、排ガス・膨満・嘔吐は「現れる所見」として結ぶ（全事例）', () => {
  files.forEach(f => {
    const cp = caseOf(f); const m = cp.relationMap; if (!m) return;
    const il = m.nodes.find(n => n.key === 'ileus_path' || /^腸の動き（蠕動運動）の低下$/.test(n.label));
    if (!il) return;
    const byId = new Map(m.nodes.map(n => [n.id, n]));
    const into = m.edges.filter(e => e.target === il.id);
    assert.ok(into.some(e => e.relation === 'causes' && /手術操作|炎症/.test(byId.get(e.source).label)), `${f}: 手術操作・炎症の経路がない`);
    m.edges.filter(e => e.source === il.id).forEach(e => { if (byId.get(e.target).type === 'symptom' && /排ガス|膨満|嘔吐|悪心|嘔気|蠕動/.test(byId.get(e.target).label)) assert.equal(e.relation, 'manifests_as', `${f}: ${byId.get(e.target).label}`); });
    into.forEach(e => assert.ok(!/ライン|ドレーン/.test(byId.get(e.source).label), `${f}: 管類が腸の動きの原因になっている`));
  });
});

test('術前の「嘔吐なし」「胃のむかつき」や、悪心・嘔吐だけでは、イレウスの所見・実際の問題にしない', () => {
  const head = '氏名：Z氏 62歳 男性\n診断名：S状結腸がん\n手術：腹腔鏡下S状結腸切除術を全身麻酔で実施\n';
  const a = mk(head + '手術前日\nO：症状：胃のむかつき感あり、嘔吐なし\n術後1日目\nO：疼痛はNRS 2\n');
  app.cpEnsureBuilt(a);
  assert.ok(!(a.relationMap.nodes || []).some(n => n.type === 'nursing_problem' && /^消化管運動機能障害（/.test(n.label)));
  const b = mk(head + '術後1日目\nO：悪心あり、嘔吐1回\n');
  app.cpEnsureBuilt(b);
  assert.ok(!(b.relationMap.nodes || []).some(n => n.type === 'nursing_problem' && /^消化管運動機能障害（/.test(n.label)));
  const c = mk(head + '術後2日目\nO：腹部膨満あり、排ガスなし\n');
  app.cpEnsureBuilt(c);
  assert.ok((c.relationMap.nodes || []).some(n => n.type === 'nursing_problem' && /^消化管運動機能障害（/.test(n.label)));
});
