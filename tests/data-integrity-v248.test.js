const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const mk = SRC => ({ id: 'p', title: 'A氏', sourceText: SRC, items: Array.from(app.classifyTextByRules(SRC)).map((c, i) => ({ ...c, id: 'c' + i })), carePlans: {}, myAssessments: {}, selectedDiagnosisIds: [], diagnosisCandidates: [] });

test('時期：見出しの術後N日目を使い、本文中の別の日数（〜術後5日目まで）で上書きしない', () => {
  const day = (ts, text) => app.cvTimeOf({ timestamp: ts, text });
  assert.equal(day('術後1日目 10:00', '抗生剤 セファゾリン 2×朝夕(〜術後5日目まで)').postopDay, 1);
  assert.equal(day('術後2日目 8:00', '入院4日目から開始').postopDay, 2);
  assert.equal(day('入院4日目', '術後1日目の記録').hospDay, 4);
  assert.equal(day('入院4日目', '術後1日目の記録').postopDay, null);
  assert.equal(day('手術当日 12:00', '〜術後5日目まで').postopDay, 0);
  assert.equal(day('', '本文だけ').source, 'none');
});

test('時期：術後の記録が術前の時期になっている／日付と術後日数が合わないときに検出する', () => {
  const cp = { id: 'p', items: [
    { id: 'a', type: 'o', text: '6月10日 人工骨頭置換術を施行', timestamp: '6月10日' },
    { id: 'b', type: 'o', text: '術後1日目 創部痛NRS5', timestamp: '術前' },
    { id: 'c', type: 'o', text: '歩行訓練を実施', timestamp: '6月12日 術後1日目' }] };
  const kinds = app.cvTimelineIssues(cp).map(x => x.id + ':' + x.kind);
  assert.ok(kinds.includes('b:phase'));
  assert.ok(kinds.includes('c:date'));
  assert.equal(app.cvTimelineIssues({ id: 'p', items: [{ id: 'z', type: 'o', text: '術後1日目 NRS3', timestamp: '術後1日目 9:00' }] }).length, 0);
});

test('検査値：RBCの単位が違っても、基準値と同じ単位で比べて誤判定しない（原文も併記）', () => {
  const cp = mk('【検査データ】\n入院時\nRBC 3.52 ×10^6/μL (基準値: 3.86〜4.92)\nCre 0.56 mg/dL (基準値: 0.46〜0.79)\nK 3.9 mEq/L (基準値: 3.6〜4.8)\nWBC 10,200 /μL (基準値: 3,300〜8,600)');
  const t = app.buildLabAssessment(cp).text;
  assert.match(t, /RBC[^\n]*\n　判定：低値/);
  assert.match(t, /原文：3\.52 ×10\^6\/μL/);
  assert.match(t, /Cre：0\.56 mg\/dL\n　判定：基準範囲内/);
  assert.match(t, /K：3\.9 mEq\/L\n　判定：基準範囲内/);
  assert.match(t, /WBC：10,200 \/μL\n　判定：高値/);
  assert.equal(app.cvCheckLabParse(cp).length, 0);
});

test('検査値：解析値が原文にないときは指摘する', () => {
  const cp = { items: [{ id: 'a', type: 'o', text: 'Cre 0.56 mg/dL (基準値: 0.46〜0.79)', timestamp: '入院時' }] };
  assert.equal(app.cvCheckLabParse(cp).length, 0);
});

test('根拠：看護問題に関係しない記録（Hb・手術予定）は根拠IDに入らず、退けた理由が残る', () => {
  const cp = mk('右大腿骨人工骨頭置換術(BHA)予定\nHb 10.8 g/dL (基準値: 11.5〜16.5 g/dL)\n術後1日目 創部痛NRS5。動くと痛い。\n歩行時にふらつきあり。');
  cp.relationMap = app.buildRelationMapFromRecord(cp);
  app.buildCarePlansByRules(cp);
  const by = new Map(cp.items.map(i => [String(i.id), i]));
  app.carePlanList(cp).forEach(p => {
    (p.evidenceIds || []).forEach(id => {
      const txt = by.get(String(id)).text;
      assert.ok(app.cvEvidenceRelevant(p.problem, txt), `${p.problem} ← ${txt}`);
      if (/脱臼|可動|疼痛/.test(p.problem)) assert.doesNotMatch(txt, /^Hb /);
    });
  });
  assert.ok(!app.cvEvidenceRelevant('感染リスク状態', '右大腿骨人工骨頭置換術(BHA)予定'));
});

test('原因・症状・介入：鎮痛薬を急性疼痛の関連要因に並べず、症状・介入として分ける', () => {
  const SRC = '右大腿骨頸部骨折で人工骨頭置換術を施行した。\n創部痛があり、動かすと手術したところが痛い。NRS5。鎮痛薬を使用した。';
  const cp = mk(SRC);
  cp.relationMap = app.buildRelationMapFromRecord(cp);
  app.buildCarePlansByRules(cp);
  const d = app.buildFocusDraft(cp, 4);
  const line = (d.focusProblem.match(/関連要因：[^\n]*/) || [''])[0];
  assert.doesNotMatch(line, /鎮痛/);
});

const cls = t => Array.from(app.classifyTextByRules(t));

test('見出し：番号と日付つきの見出し（5．手術当日（6月10日））で時期が切り替わり、前のカードに混ざらない', () => {
  const r = cls('4．入院から手術までの経過\n* 入院後、牽引4kg実施\n5．手術当日（6月10日）\n9:00\n右大腿部に創あり\n12:00\n安静時ペインスケール「2~3」\n6．術後1日目（6月11日）\n10:00\n疼痛増強なし\n7．術後2日目（6月12日）\n10:00\nバック内の尿700ml破棄する。');
  const ts = t => r.find(c => c.text.includes(t)).timestamp;
  assert.equal(ts('右大腿部に創あり'), '手術当日 9:00');
  assert.equal(ts('ペインスケール'), '手術当日 12:00');
  assert.equal(ts('疼痛増強なし'), '術後1日目 10:00');
  assert.equal(ts('尿700ml'), '術後2日目 10:00');
  assert.ok(!r.some(c => c.type !== 'unnecessary' && /手術当日\(6月10日\)|術後1日目\(6月11日\)/.test(c.text)));
  assert.ok(!r.some(c => /4~5日目/.test(c.timestamp)));
});

test('見出し：数字を含まない通常の文や、日付つきでない見出しは従来どおり', () => {
  const r = cls('6．術後1日目\n10:00\n疼痛増強なし');
  assert.equal(r.find(c => c.text.includes('疼痛増強なし')).timestamp, '術後1日目 10:00');
});

test('検査表：最初の行を列の見出しに取り違えず、各行に自分の基準値と測定値だけが入る', () => {
  const r = cls('検査データ\n検査項目\t正常値（資料記載）\t入院時\t術後1日目\nWBC（白血球）\t3,500～9,000/μL\t10,800/μL\t10,240/μL\nCr\t0.5～0.9mg/dL\t0.56mg/dL\t—\nK\t3.5～5.0mEq/L\t3.9mEq/L\t—');
  const cr = r.find(c => /^Cr/.test(c.text)), k = r.find(c => /^K\b/.test(c.text));
  assert.ok(cr && k);
  assert.doesNotMatch(cr.text + k.text, /3,500|10,800|10,240/);
  assert.match(cr.text, /0\.56/);
  assert.match(cr.text, /0\.5~0\.9/);
  assert.match(k.text, /3\.9/);
});

test('検査表：数値と単位の入った行は、見出し行として扱わない（反例：「1日目」「2日目」の見出しは見出し）', () => {
  const r = cls('項目\t1日目\t2日目\n体温\t36.5\t37.0');
  assert.ok(r.some(c => /体温/.test(c.text)));
});
