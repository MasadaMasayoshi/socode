'use strict';
// 利用者からの要望への対応の確認
//  ・記録メモのボックスの中身を空にする（確認してから消し、「元に戻す」で戻せる。カードは消さない）
//  ・関連図を作る機能を、別のページ（上の「関連図」）に作る（js/15）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp, readAppSource } = require('./app-helpers');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
const src = readAppSource();
const app = loadApp();

const HF_TEXT = `氏名：B氏 82歳 男性
診断名：慢性心不全急性増悪（NYHA分類 III度）
主訴：息が苦しくて横になれない。足がむくんで靴が履けない
既往歴：70歳 陳旧性心筋梗塞（PCI施行）
家族関係：妻（80歳）と二人暮らし
常用薬：フロセミド20mg 1錠×朝、エナラプリル2.5mg 1錠×朝
9/28 14:30
入院後すぐに酸素2L鼻カニューレ開始、フロセミド20mg静注開始。
血圧158/92mmHg、脈拍104回/分、SpO2 90%
BNP 680 pg/mL
両下腿に圧痕性浮腫(+3)。
胸痛なし
「横になると息ができない」と訴える。
妻は「最近は塩辛いものばかり食べたがって」と話す。`;

function hfPatient(extra = {}) {
  const items = app.classifyTextByRules(HF_TEXT).map((i, k) => ({ ...i, id: `it${k}` }));
  return { id: 'p1', title: 'B氏', sourceText: HF_TEXT, items, carePlans: {}, selectedDiagnosisIds: [], diagnosisCandidates: [], ...extra };
}

test('記録メモ：「空にする」ボタンがあり、確認してから消し、元に戻せる（カードは消さない）', () => {
  assert.match(html, /id="btn-source-clear"[^>]*onclick="clearSourceText\(\)"/);
  assert.match(html, /<span>空にする<\/span>/);
  assert.match(src, /window\.clearSourceText = async function\(\)/);
  const body = src.slice(src.indexOf('window.clearSourceText = async function()'), src.indexOf('window.clearSourceText = async function()') + 1600);
  assert.match(body, /openDialog\(\{[\s\S]*?danger: true/);
  assert.match(body, /if \(ok !== true\) return;/);
  assert.match(body, /cancelSourceTextSave\(\);/); // 保存待ちの古い文章で上書きしない
  assert.match(body, /DOM\.sourceText\.value = '';/);
  assert.match(body, /showUndoToast\('記録メモを空にしました'/);
  assert.match(body, /\{ patientId: patId \}/);
  assert.doesNotMatch(body, /\.items\s*=/); // カードには触らない
  assert.match(css, /\.source-clear-btn \{ color: var\(--brick\); \}/);
});

test('関連図：別のページ（タブ）として切り替えられ、js/15 を読み込む', () => {
  assert.match(html, /<button id="tab-relation" class="tab-pill">\s*関連図\s*<\/button>/);
  assert.match(html, /<div id="view-relation" class="hidden surface/);
  assert.match(html, /<script src="js\/15-relation-map\.js\?v=[\w.-]+"><\/script>/);
  assert.match(src, /document\.getElementById\('tab-relation'\)\?\.addEventListener\('click', \(\) => switchView\('relation'\)\)/);
  assert.match(src, /if \(viewName === 'relation' && typeof renderRelationMap === 'function'\) renderRelationMap\(\);/);
  assert.match(src, /onRelationMapPatientReloaded\(cp\)/);
  assert.match(src, /'13', '14', '15'\]/); // 版のそろいの確認にも入れる
  // 操作はインラインの onclick ではなく data-rm-action（IDを属性のJavaScriptに入れない）
  const view = html.slice(html.indexOf('<div id="view-relation"'), html.indexOf('<div id="view-reference"'));
  assert.doesNotMatch(view, /onclick=/);
  ['build-rules', 'build-ai', 'add', 'relayout', 'undo', 'zoom-fit', 'print', 'png', 'clear'].forEach(a => assert.match(view, new RegExp(`data-rm-action="${a}"`), a));
});


// ---- 関連図（版2）：看護学生が実習で書く関連図のルール ----
const GASTRIC = fs.readFileSync(path.join(ROOT, 'tests/fixtures/relation-map/gastric_postop.txt'), 'utf8');
function patientOf(text, extra = {}) {
  const items = app.classifyTextByRules(text).map((i, k) => ({ ...i, id: `it${k}` }));
  return { id: 'p1', title: 'A氏', sourceText: text, items, carePlans: {}, selectedDiagnosisIds: [], diagnosisCandidates: [], ...extra };
}
const plain = v => JSON.parse(JSON.stringify(v));
const find = (map, re) => map.nodes.find(n => re.test(n.label));
const hasEdge = (map, a, b) => map.edges.some(e => e.source === a.id && e.target === b.id);
// b から矢印を逆にたどって a に届くか
function reaches(map, a, b) {
  const seen = new Set([b.id]); const st = [b.id];
  while (st.length) { const id = st.pop(); if (id === a.id) return true; map.edges.forEach(e => { if (e.target === id && !seen.has(e.source)) { seen.add(e.source); st.push(e.source); } }); }
  return false;
}

// 直接の矢印か、間に「＋補足」の四角を1つはさんだ矢印
const linked = (map, a, b) => hasEdge(map, a, b) || map.nodes.some(m => m.added && hasEdge(map, a, m) && hasEdge(map, m, b));
test('関連図：事実図ではなく、病態の中間過程を補い、複数の原因が #1 呼吸の問題へ合流する（胃全摘・術後）', () => {
  const map = app.buildRelationMapFromRecord(patientOf(GASTRIC));
  const p1 = map.nodes.find(n => n.type === 'nursing_problem' && n.priority === 1);
  assert.match(p1.label, /非効果的気道浄化/);
  const smoke = find(map, /^喫煙/), anes = find(map, /全身麻酔・気管内挿管/), pain = find(map, /^創部痛（NRS 2）/), fev = find(map, /FEV1% 69\.33%/);
  [smoke, anes, pain, fev].forEach(n => assert.ok(n && reaches(map, n, p1), `${n && n.label} → #1`));
  // 中間過程（深呼吸・咳嗽の抑制 → 排痰困難）と、予測（破線）の無気肺・肺炎
  const suppress = find(map, /深呼吸・咳嗽の抑制/), sputum = find(map, /^排痰困難/);
  assert.ok(linked(map, pain, suppress) && linked(map, suppress, sputum));
  const atel = find(map, /無気肺・肺炎の可能性/);
  assert.equal(atel.type, 'future_risk'); assert.equal(atel.observed, false);
  assert.ok(map.edges.filter(e => e.target === atel.id).every(e => e.predicted), '予測への矢印は破線');
  // 喫煙 → 胃粘膜への慢性的な刺激 → 胃がん（「喫煙 → 胃がん」と直接つながない）
  const ca = map.nodes.find(n => n.type === 'disease');
  assert.ok(!hasEdge(map, smoke, ca));
  const mid = find(map, /胃粘膜への慢性的な刺激/);
  assert.ok(hasEdge(map, smoke, mid) && hasEdge(map, mid, ca));
  assert.equal(mid.source, 'knowledge'); // 医学知識で補った印
});

test('関連図：治療は楕円で「治療 → 治療の対象」、治療ごとに別の四角', () => {
  const map = app.buildRelationMapFromRecord(patientOf(GASTRIC));
  const surg = find(map, /^胃全摘出術/), ca = map.nodes.find(n => n.type === 'disease'), pca = find(map, /硬膜外PCA/), pain = find(map, /^創部痛/);
  assert.equal(surg.type, 'treatment');
  assert.doesNotMatch(surg.label, /全身麻酔下で|施行/);
  // がんの手術の対象は「手術の対象と目的」の四角（病期 → 手術の対象と目的 ← 手術）。胃がんから直接の線は引かない
  assert.ok(map.edges.some(e => e.source === surg.id && e.relation === 'treats' && /手術の対象と目的/.test(map.nodes.find(n => n.id === e.target).label)));
  assert.ok(map.edges.some(e => e.source === pca.id && e.target === pain.id && e.relation === 'treats'));
  assert.ok(!map.edges.some(e => map.edges.some(o => o.source === e.target && o.target === e.source)), '両向きの矢印は無い');
  const svg = app.relationMapSvg(map, {});
  assert.match(svg, /<ellipse class="rm-box"/);
  assert.match(svg, /stroke="#2563EB"[^>]*marker-end="url\(#rm-tee-blue\)"/); // 治療 ┤ 対象 は青（線の先は「┤」＝抑える）
  assert.match(svg, /（WBC 11600\/μL↑）/); // 検査データは（ ）
});

test('関連図：術後のWBC・CRPは感染と断定せず、手術侵襲による炎症反応との見分けとして示す', () => {
  const map = app.buildRelationMapFromRecord(patientOf(GASTRIC));
  const inflam = find(map, /手術侵襲による炎症反応（感染との見分けが必要）/);
  const wbc = find(map, /^WBC/);
  assert.ok(hasEdge(map, wbc, inflam));
  const inf = find(map, /感染(?:など)?の可能性/);
  assert.equal(inf.observed, false);
  assert.ok(!map.nodes.some(n => n.observed !== false && /^(?:創部感染|感染症)$/.test(n.label)));
});

test('関連図：看護問題は右端・#の優先順位の順に上から並び、すべてに根拠の道筋がある。浮島は無い', () => {
  const map = app.buildRelationMapFromRecord(patientOf(GASTRIC));
  const probs = map.nodes.filter(n => n.type === 'nursing_problem').sort((a, b) => a.priority - b.priority);
  assert.deepEqual(plain(probs.map(p => p.priority)), plain(probs.map((p, i) => i + 1)));
  assert.ok(probs.length >= 5, probs.map(p => p.label).join(' / '));
  assert.deepEqual(plain(probs.map(p => app.rmProblemCategory(p.label).key)), ['resp', 'resp', 'inf', 'pain', 'nutr', 'act', 'elim', 'anx']);
  // 2026-10-06.17：利用者から「前のほうがよかった」。看護問題は右端にそろえる（一覧はボタンで開く）
  const maxX = Math.max(...map.nodes.filter(n => n.type !== 'nursing_problem' && !n.attachTo).map(n => n.x));
  probs.forEach(p => assert.ok(p.x > maxX, '看護問題は右端'));
  assert.equal(new Set(probs.map(p => p.x)).size, 1, '看護問題は1つの列にそろえる');
  // 2026-10-06.25：利用者「看護問題は上から順に並べなくてよい（#番号があるから）」。右端の看護問題は重ならず、
  // つながる原因の四角の高さの近くに置く（線がまっすぐ短くなる）
  const byY = probs.slice().sort((a, b) => a.y - b.y);
  for (let i = 1; i < byY.length; i++) assert.ok(byY[i].y >= byY[i - 1].y + app.rmRect(byY[i - 1]).h, '看護問題が重ならない');
  const issues = app.validateRelationMap(map);
  assert.deepEqual(plain(issues.filter(i => i.level === 'error')), []);
  map.nodes.forEach(n => assert.ok(map.edges.some(e => e.source === n.id || e.target === n.id), `浮島：${n.label}`));
  // 列の見出しは出さない（利用者からの要望）
  assert.deepEqual(plain(map.headers), []);
});

test('関連図：看護計画があれば、その看護問題の名前と順番を使う（記録から考えられる別の問題は「候補」）', () => {
  const cp = patientOf(GASTRIC, { carePlans: {
    a: { id: 'a', order: 1, problem: '急性疼痛', relatedNeeds: [], records: [] },
    b: { id: 'b', order: 2, problem: '非効果的気道浄化', relatedNeeds: [1], records: [] }
  } });
  const map = app.buildRelationMapFromRecord(cp);
  const probs = map.nodes.filter(n => n.type === 'nursing_problem').sort((a, b) => a.priority - b.priority);
  assert.equal(probs[0].label, '急性疼痛');
  assert.equal(probs[1].label, '非効果的気道浄化');
  assert.ok(probs.slice(2).every(p => /（候補）$/.test(p.label)));
  assert.ok(reaches(map, find(map, /^創部痛/), probs[0]));
  // 優先順位の目安のヒント（呼吸を疼痛より上にする方がよいかも）
  const hint = app.validateRelationMap(map).find(i => i.code === 'priority');
  assert.ok(hint && hint.fix === 'priority-sort');
});

test('関連図：既往歴の手術（「70歳 PCI施行」）は今回の手術にしない。心不全は病態→症状→看護問題につながる', () => {
  const map = app.buildRelationMapFromRecord(hfPatient());
  assert.ok(!map.nodes.some(n => /非効果的気道浄化|手術侵襲/.test(n.label)));
  const hf = find(map, /心拍出量の低下・肺うっ血/);
  const dx = map.nodes.find(n => n.type === 'disease');
  assert.ok(hasEdge(map, dx, hf));
  const gas = find(map, /ガス交換障害/), fluid = find(map, /体液量過剰/);
  assert.ok(gas && fluid && reaches(map, hf, gas) && reaches(map, hf, fluid));
  const du = find(map, /^利尿薬/);
  assert.equal(du.type, 'treatment');
  assert.ok(map.edges.some(e => e.source === du.id && e.relation === 'treats'));
  // 2026-10-06.25：体液量不足リスクは利尿薬だけで決めない（この短い記録には摂取量の低下・発熱・尿量の記録が無い）
  assert.ok(!map.nodes.some(n => /体液量不足リスク/.test(n.label)), '利尿薬だけでは体液量不足リスクにしない');
});

test('関連図：自動チェック（浮島・重複・相互矢印・治療の向き・予測・根拠・#番号・交差）と自動で直す', () => {
  const m = app.normalizeRelationMap({ version: 2, nodes: [
    { id: 'a', type: 'disease', label: '胃がん' }, { id: 'b', type: 'treatment', label: '胃全摘出術' },
    { id: 'c', type: 'pathophysiology', label: '手術侵襲' }, { id: 'c2', type: 'pathophysiology', label: '手術 侵襲' },
    { id: 'd', type: 'future_risk', label: '肺炎の可能性', observed: true }, { id: 'p', type: 'nursing_problem', label: '不安', priority: 3 },
    { id: 'q', type: 'nursing_problem', label: '非効果的気道浄化', priority: 5 }, { id: 'z', type: 'symptom', label: 'ぽつん' }
  ], edges: [
    { id: 'e1', source: 'a', target: 'b', relation: 'causes' }, { id: 'e2', source: 'b', target: 'c' }, { id: 'e3', source: 'c', target: 'b' },
    { id: 'e4', source: 'c', target: 'd' }, { id: 'e5', source: 'd', target: 'q' }, { id: 'e6', source: 'c2', target: 'p' }, { id: 'e7', source: 'p', target: 'a' }
  ] });
  const codes = app.validateRelationMap(m).map(i => i.code);
  ['isolated', 'duplicate', 'mutual', 'treat-reverse', 'risk-solid', 'risk-observed', 'from-problem', 'no-evidence', 'priority'].forEach(c => assert.ok(codes.includes(c), c));
  // normalize で #番号は通し番号にそろう
  assert.deepEqual(plain(m.nodes.filter(n => n.type === 'nursing_problem').map(n => n.priority).sort()), [1, 2]);
  app.rmApplyFixes(m, app.validateRelationMap(m));
  const after = app.validateRelationMap(m).map(i => i.code);
  ['isolated', 'duplicate', 'mutual', 'risk-solid', 'risk-observed', 'from-problem'].forEach(c => assert.ok(!after.includes(c), `直った：${c}`));
  assert.ok(!m.nodes.some(n => n.label === 'ぽつん'));
});

test('関連図：交差する線は飛び越え（∩）で描く', () => {
  const m = { version: 2, headers: [], nodes: [
    { id: 'a', type: 'pathophysiology', label: 'A', x: 0, y: 100 }, { id: 'b', type: 'pathophysiology', label: 'B', x: 500, y: 100 },
    { id: 'c', type: 'pathophysiology', label: 'C', x: 250, y: 0 }, { id: 'd', type: 'pathophysiology', label: 'D', x: 250, y: 300 }
  ], edges: [{ id: 'e1', source: 'a', target: 'b', relation: 'causes' }, { id: 'e2', source: 'c', target: 'd', relation: 'causes' }] };
  const { routes, bridges } = app.rmRouteEdges(m);
  assert.equal(bridges, 1);
  const d = app.rmRoutePath(routes.find(r => r.edge.id === 'e1'));
  assert.match(d, / A6,6 0 0 1 /);
  const svg = app.relationMapSvg(m, {});
  assert.match(svg, / A6,6 0 0 1 /);
  // 飛び越えの下の線は消さない。同じ高さで重なる横の線は、そろって飛び越える（片方だけまっすぐだと ∩ の下に線が残る）
  assert.doesNotMatch(svg, /rm-gap/);
  ['gastric_postop', 'hip_fracture', 'heart_failure_long'].forEach(name => {
    const { routes } = app.rmRouteEdges(caseMap(name));
    const hs = [];
    routes.forEach(r => (r.segs || []).forEach(sg => { if (Math.abs(sg.y1 - sg.y2) < 0.5) hs.push(sg); }));
    hs.forEach(a => a.cross.forEach(x => hs.forEach(b => {
      if (Math.abs(a.y1 - b.y1) < 0.5 && x > Math.min(b.x1, b.x2) + 8 && x < Math.max(b.x1, b.x2) - 8) assert.ok(b.cross.some(c => Math.abs(c - x) < 0.5), `${name}: 重なった横の線の片方だけが飛び越えている（x=${x}, y=${a.y1}）`);
    })));
  });
});

test('関連図：AIの答え（短い名前のJSON）を読み取り、確かめて安全に直してから並べる', () => {
  const text = '```json\n{"n":[{"i":"n1","t":"disease","l":"胃がん","o":1},{"i":"n2","t":"treatment","l":"胃全摘出術","o":1},{"i":"n3","t":"pathophysiology","l":"手術侵襲","o":1,"k":1},{"i":"n4","t":"future_risk","l":"無気肺・肺炎","o":1},{"i":"n5","t":"nursing_problem","l":"非効果的気道浄化","p":1},{"i":"n6","t":"symptom","l":"ぽつん"},{"i":"n7","t":"weird","l":"謎"}],"e":[{"s":"n2","d":"n1","r":"treats","e":"胃がんへの手術"},{"s":"n2","d":"n3","r":"causes"},{"s":"n3","d":"n4","r":"predicts","x":0},{"s":"n4","d":"n5","r":"results_in","x":1},{"s":"n3","d":"n7"},{"s":"n7","d":"n3"}]}\n```';
  const map = app.relationMapFromAiJson(app.rmParseAiJsonObject(text));
  assert.ok(!map.nodes.some(n => n.label === 'ぽつん'), '浮島は消す');
  const risk = map.nodes.find(n => n.label === '無気肺・肺炎');
  assert.equal(risk.observed, false);
  assert.ok(map.edges.filter(e => e.target === risk.id).every(e => e.predicted));
  assert.equal(map.edges.find(e => e.relation === 'treats').evidence, '胃がんへの手術');
  assert.equal(map.nodes.find(n => n.label === '手術侵襲').source, 'knowledge');
  assert.ok(!map.edges.some(e => map.edges.some(o => o.source === e.target && o.target === e.source)));
  assert.throws(() => app.rmParseAiJsonObject('作れません'), /読み取れません/);
  // 指示文：ルールの要点と、入力をしぼること
  const prompt = app.buildRelationMapPrompt(patientOf(GASTRIC));
  ['事実を並べた図ではなく', '治療は「治療→治療の対象」', 'o=0、その矢印はx=1', '感染と断定しない', '複数の原因が1つの問題へ合流', 'どこにもつながらない四角', '"n":[{"i":"n1"'].forEach(s => assert.ok(prompt.includes(s), s));
  assert.ok(app.rmSelectCardsForAi(Array.from({ length: 200 }, (_, k) => ({ type: 'o', text: `記録${k}` }))).length <= 100) // 長い記録で大事な検査・所見が漏れないよう、2026-10-06.10 で70枚→100枚に;
});

test('関連図：版1の図は開いたときに版2へ直す（治療の向き・看護問題の#・検査データ）', () => {
  const v1 = { nodes: [
    { id: 'a', kind: 'disease', text: '心不全' }, { id: 'b', kind: 'treatment', text: '利尿薬' },
    { id: 'c', kind: 'symptom', text: '検査：BNP 680↑' }, { id: 'd', kind: 'problem', text: '#2 体液量過剰' }, { id: 'e', kind: 'risk', text: '#1 転倒リスク' }
  ], links: [{ from: 'a', to: 'b' }, { from: 'c', to: 'd', dashed: true }, { from: 'a', to: 'c' }, { from: 'a', to: 'e' }] };
  const m = app.normalizeRelationMap(v1);
  assert.equal(m.version, 2);
  const e = m.edges.find(x => x.relation === 'treats');
  assert.ok(e && e.source === 'b' && e.target === 'a');
  assert.equal(m.nodes.find(n => n.id === 'c').type, 'lab');
  assert.equal(m.nodes.find(n => n.id === 'c').label, 'BNP 680↑');
  assert.deepEqual(plain(m.nodes.filter(n => n.type === 'nursing_problem').map(n => [n.label, n.priority])), [['体液量過剰', 2], ['転倒リスク', 1]]);
  assert.equal(app.rmDisplayLabel(m.nodes.find(n => n.id === 'e')), '#1 転倒リスク');
  assert.equal(app.rmDisplayLabel(m.nodes.find(n => n.id === 'c')), '（BNP 680↑）');
});

test('関連図：画面の操作（やり直す・チェック・事実／予測・優先順位・なぜ？）と、文字の安全な表示', () => {
  ['data-rm-action="redo"', 'data-rm-action="check"', 'id="rm-check"', '<option value="future_risk">'].forEach(s => assert.ok(html.includes(s), s));
  ['toggle-observed', 'toggle-predicted', 'priority-up', 'priority-down', "'why'", 'autofix', 'relation'].forEach(s => assert.ok(src.includes(s), s));
  assert.match(src, /requireApiKey\('関連図をAIで作る', \{ fallbackLabel: '記録から作る（AIなし）' \}\)/);
  const norm = app.normalizeRelationMap({ version: 2, nodes: [{ id: "x');alert(1);('", type: 'disease', label: '<img src=x onerror=alert(1)>' }], edges: [] });
  assert.match(norm.nodes[0].id, /^n_/);
  const svg = app.relationMapSvg(norm, {});
  assert.doesNotMatch(svg, /<img/);
  const doc = app.relationMapPrintHtml({ title: '<b>患者</b>' }, norm);
  assert.match(doc, /@page \{ size: A4 landscape;/);
  assert.match(doc, /&lt;b&gt;患者&lt;\/b&gt;/);
  assert.match(src, /printHtmlDocument\(relationMapPrintHtml\(cp, map, \{ perProblem \}\), \{ keepSvg: true \}\)/);
  assert.deepEqual(plain(app.rmWrapText('あいうえおかきくけこさしすせそたちつてと', 13)), ['あいうえおかきくけこさしす', 'せそたちつてと']);
});

// ---- 3つの事例で作って確かめる（1回目：大腿骨頸部骨折の術後／2回目：誤嚥性肺炎／3回目：心原性脳塞栓症） ----
const caseMap = name => app.buildRelationMapFromRecord(patientOf(fs.readFileSync(path.join(ROOT, `tests/fixtures/relation-map/${name}.txt`), 'utf8')));
const probLabels = map => map.nodes.filter(n => n.type === 'nursing_problem').sort((a, b) => a.priority - b.priority).map(n => n.label);
function commonChecks(map, label) {
  const issues = app.validateRelationMap(map);
  assert.deepEqual(plain(issues.filter(i => i.level === 'error').map(i => i.msg)), [], `${label}：要修正なし`);
  map.nodes.forEach(n => assert.ok(map.edges.some(e => e.source === n.id || e.target === n.id), `${label}：浮島 ${n.label}`));
  const probs = map.nodes.filter(n => n.type === 'nursing_problem');
  assert.ok(probs.length >= 4 && probs.length <= 10, `${label}：看護問題 ${probs.length}`); // 2026-10-06.25：判定する看護問題を増やしたので上限10
  // 不安の言葉は、同じカードの別の文（「…」）を使うことがあるので重複の確認から外す
  const ids = new Set(); map.nodes.forEach(n => n.itemIds.forEach(id => { if ((n.type === 'symptom' || n.type === 'patient_fact') && !/不安の言動）$/.test(n.label)) { assert.ok(!ids.has(id), `${label}：同じカードが2つの四角に`); ids.add(id); } }));
  map.edges.filter(e => e.relation === 'treats').forEach(e => assert.equal(map.nodes.find(n => n.id === e.source).type, 'treatment'));
  map.nodes.filter(n => n.type === 'future_risk').forEach(n => assert.equal(n.observed, false));
}

test('事例1（大腿骨頸部骨折・人工骨頭置換術・84歳）：DVT・褥瘡・せん妄・脱臼・骨粗鬆症からの骨折の成り立ち', () => {
  const map = caseMap('hip_fracture');
  commonChecks(map, '事例1');
  const probs = probLabels(map);
  ['深部静脈血栓症', '皮膚統合性障害（褥瘡）', '急性混乱（術後せん妄）', '人工骨頭脱臼', '急性疼痛', '感染リスク'].forEach(w => assert.ok(probs.some(p => p.includes(w)), `${w} / ${probs.join('、')}`));
  // 2026-10-06.21：転倒と人工骨頭の脱臼は原因が違うので、別々の看護問題にする（1つにまとめない）
  assert.ok(probs.includes('転倒転落リスク状態'), probs.join('、'));
  assert.ok(!probs.some(p => /転倒/.test(p) && /脱臼/.test(p)), '転倒と脱臼を1つにまとめない');
  assert.ok(probs.indexOf(probs.find(p => /深部静脈/.test(p))) < probs.indexOf(probs.find(p => /疼痛/.test(p))), '血栓（循環）は疼痛より上');
  const osteo = find(map, /骨密度の低下・骨の脆弱化/), fx = map.nodes.find(n => n.type === 'disease');
  assert.ok(osteo && hasEdge(map, osteo, fx));
  assert.ok(!map.nodes.some(n => /腹腔内感染/.test(n.label)), '股関節の手術で腹腔内感染とは書かない');
  assert.ok(find(map, /Dダイマー 8\.5/));
  const pain = find(map, /^創部痛（NRS 5）/);
  assert.ok(pain && !/転倒/.test(pain.label), '受傷時の痛みを術後の創部痛にしない');
  assert.ok(!map.nodes.some(n => n.type === 'treatment' && /SpO2|体温/.test(n.label)), '「SpO2 95」を酸素投与と取り違えない');
});

test('事例2（誤嚥性肺炎・88歳・手術なし）：炎症→痰→気道浄化、酸素化→ガス交換、嚥下→誤嚥、発熱・絶食→脱水', () => {
  const map = caseMap('aspiration_pneumonia');
  commonChecks(map, '事例2');
  const probs = probLabels(map);
  assert.deepEqual(plain(probs.slice(0, 3)), ['非効果的気道浄化', 'ガス交換障害', '体液量不足（脱水）']);
  // 2026-10-06.25：むせが記録にある → 今ある「嚥下障害」（誤嚥リスク状態にしない）
  assert.ok(probs.includes('嚥下障害') && !probs.includes('誤嚥リスク状態'), probs.join('、'));
  const dx = map.nodes.find(n => n.type === 'disease');
  const abx = find(map, /^抗菌薬（アンピシリン/), o2 = find(map, /^酸素投与（鼻カニュラ酸素2L\/分）$/), suc = find(map, /^吸引$/);
  assert.ok(abx && map.edges.some(e => e.source === abx.id && e.target === dx.id && e.relation === 'treats'));
  assert.ok(o2 && suc, '酸素・吸引は「治療 → 対象」');
  assert.ok(find(map, /湿性ラ音/), '痰は入院後の観察の記録を使う');
  assert.equal(map.nodes.filter(n => /誤嚥性肺炎$/.test(n.label)).length, 1, '診断名を2つの四角にしない');
  assert.ok(linked(map, find(map, /嚥下反射・咳反射の低下/), dx), '嚥下機能の低下 →［気管に入りやすい］→ 誤嚥性肺炎');
  assert.ok(find(map, /BUN 32/) && find(map, /Na 148/));
});

test('事例3（心原性脳塞栓症・72歳）：心房細動→血栓→脳塞栓→麻痺・失語・嚥下、抗凝固薬→出血リスク、糖尿病→血糖', () => {
  const map = caseMap('cerebral_infarction');
  commonChecks(map, '事例3');
  const probs = probLabels(map);
  ['嚥下障害', '出血リスク状態', '血糖不安定リスク状態', '転倒転落リスク状態', '言語的コミュニケーション障害', 'セルフケア不足', '身体可動性障害'].forEach(w => assert.ok(probs.some(p => p.includes(w)), `${w} / ${probs.join('、')}`));
  const clot = find(map, /心房内の血栓/), dx = map.nodes.find(n => n.type === 'disease'), lesion = find(map, /脳の血流の途絶/);
  assert.ok(hasEdge(map, clot, dx) && hasEdge(map, dx, lesion));
  ['麻痺', '失語'].forEach(w => assert.ok(map.edges.some(e => e.source === lesion.id && map.nodes.find(n => n.id === e.target).label.includes(w)), w));
  assert.ok(linked(map, lesion, find(map, /嚥下反射・咳反射の低下/)));
  const ac = find(map, /^抗凝固薬（エドキサバン）/);
  assert.ok(map.edges.some(e => e.source === ac.id && e.target === clot.id && e.relation === 'treats'), '抗凝固薬 → 血栓（治療 → 対象）');
  const bleed = find(map, /出血（脳出血/);
  assert.ok(linked(map, ac, bleed) && map.edges.some(e => e.target === bleed.id && e.predicted), '抗凝固薬 ⇢［凝固能の低下］⇢ 出血の可能性');
  assert.ok(!map.nodes.some(n => n.type === 'pathophysiology' && /体動の制限/.test(n.label) && map.edges.some(e => e.target === n.id && /食事/.test(map.nodes.find(x => x.id === e.source).label))), '食事の介助を活動の制限にしない');
});

test('関連図の見やすさ：一体感（帯の色分けなし・疾患は上下のまん中の幹）・丸めた曲がり角・選んだ四角の流れだけを濃く・カードの文は要点だけ', () => {
  const map = caseMap('hip_fracture');
  // 2026-10-06.18：利用者から「一体感がない」。看護問題ごとの帯の背景色はやめ、疾患を上下のまん中に置く
  assert.deepEqual(plain(map.bands), []);
  const svg = app.relationMapSvg(map, {});
  assert.doesNotMatch(svg, /<rect class="rm-band/);
  ['gastric_postop', 'hip_fracture', 'heart_failure_long'].forEach(name => {
    const m = caseMap(name);
    const dis = m.nodes.find(n => n.type === 'disease');
    const probs = m.nodes.filter(n => n.type === 'nursing_problem').sort((a, b) => a.priority - b.priority);
    const ys = probs.map(p => p.y);
    assert.ok(dis.y > Math.min(...ys) && dis.y < Math.max(...ys), `${name}：疾患は看護問題のいちばん上と下の間の高さ`);
  });
  assert.match(svg, / Q-?\d/, '曲がり角を丸める');
  assert.match(src, /svg\.classList\.toggle\('rm-focus', path\.size > 0\)/);
  assert.match(css, /\.rm-svg\.rm-focus \.rm-node:not\(\.is-path\) \{ opacity: \.22; \}/);
  map.nodes.filter(n => n.type === 'symptom' && n.itemIds.length).forEach(n => assert.ok(n.label.length <= 40, n.label));
  assert.ok(!map.nodes.some(n => /^\d{1,2}:\d{2}/.test(n.label)), '時刻は四角に入れない');
});

test('関連図の線の整理：同じ四角からの線は1本の幹・回り込む線は四角の後ろを通らない・四角の見出しは札だけ', () => {
  ['gastric_postop', 'hip_fracture', 'aspiration_pneumonia', 'cerebral_infarction'].forEach(name => {
    const map = caseMap(name);
    const { routes } = app.rmRouteEdges(map);
    const attachedN = map.edges.filter(e => (map.nodes.find(n => n.id === e.source) || {}).attachTo === e.target).length;
    assert.equal(routes.length, map.edges.length - attachedN, name);
    // 回り込み（通り道）を使った線の横の部分は、ほかの四角に重ならない
    routes.filter(r => r.pts.length === 6).forEach(r => {
      const [xa, y] = r.pts[2], xb = r.pts[3][0];
      map.nodes.forEach(n => {
        if (n.id === r.edge.source || n.id === r.edge.target) return;
        const b = app.rmRect(n);
        assert.ok(!(y > b.y1 && y < b.y2 && Math.max(xa, xb) > b.x1 && Math.min(xa, xb) < b.x2), `${name}: ${n.label}`);
      });
    });
    // 同じすき間で、同じ四角から出る（または同じ四角へ入る）線の縦の位置はそろう
    const trunk = new Map();
    routes.filter(r => r.pts.length === 4 && Math.abs(r.pts[0][1] - r.pts[1][1]) < 0.5).forEach(r => {
      const k = `${r.edge.target}|${Math.round(r.pts[3][0])}|${Math.round(r.pts[3][1])}`;
      if (!trunk.has(k)) trunk.set(k, new Set());
      trunk.get(k).add(Math.round(r.pts[1][0]));
    });
    const mergedIntoOne = [...trunk.values()].filter(set => set.size === 1).length;
    assert.ok(mergedIntoOne >= trunk.size * 0.7, `${name}: 合流が幹にまとまる`);
  });
  const svg = app.relationMapSvg(caseMap('gastric_postop'), {});
  assert.ok(!/class="rm-kind"[^>]*>病態生理/.test(svg), '四角の上の種類名はなくす（色と凡例で区別）');
  assert.match(svg, /<g class="rm-tag">/, '予測・知識は小さな札で示す');
  assert.match(svg, /<title>[^<]*（医学知識で補った）/);
});

test('関連図の読みやすさ：文字14pxのゴシック体・作った直後は85%より小さくしない・100%ボタン・前の大きさの図は並べ直す', () => {
  const svg = app.relationMapSvg(caseMap('gastric_postop'), {});
  assert.match(svg, /font-size="14"[^>]*fill="#1C1917"/);
  assert.match(svg, /font-family="[^"]*Noto Sans JP[^"]*sans-serif"/);
  assert.match(css, /\.rm-svg text, \.rm-svg tspan \{ font-family: 'Noto Sans JP'[^}]*sans-serif; \}/, 'ページ全体の明朝体より優先');
  assert.match(src, /factor === 'fit' \? 0\.25 : wrap\.clientWidth < 600 \? 0\.55 : 0\.85/, 'パソコンは85%、スマホの幅は55%より小さくしない');
  assert.match(html, /data-rm-action="zoom-100"/);
  assert.match(src, /m\.layoutStyle !== RM_LAYOUT_STYLE\) layoutRelationMap\(m\)/);
  const old = app.normalizeRelationMap({ version: 2, nodes: [{ id: 'a', type: 'symptom', label: 'x', x: 0, y: 0 }], edges: [] });
  assert.equal(old.layoutStyle, 1, '保存してあった図は版を持たない → 並べ直しの対象');
});

test('矢印の間を補う：決まった知識で中間過程を入れ、紫の「＋補足」で一目で分かる・手で/AIで入れる操作もある', () => {
  const map = caseMap('gastric_postop');
  const added = map.nodes.filter(n => n.added);
  assert.ok(added.length >= 8, `補足 ${added.length}`);
  // 手術侵襲 →［発痛物質の放出］→ 創部痛
  const inv = find(map, /^手術侵襲（組織の損傷）/), pain = find(map, /^創部痛（NRS 2）/), mid = find(map, /発痛物質/);
  assert.ok(mid.added && hasEdge(map, inv, mid) && hasEdge(map, mid, pain));
  // 補足は前後どちらにもつながる（浮島にならない）、同じ過程は重ならない
  added.forEach(n => assert.ok(map.edges.some(e => e.target === n.id) && map.edges.some(e => e.source === n.id), n.label));
  assert.equal(new Set(added.map(n => n.label)).size, added.length);
  assert.ok(!app.validateRelationMap(map).some(i => i.level === 'error'), '補ってもエラーにならない');
  // 股関節の手術では「腹部」の過程は入れない
  assert.ok(!caseMap('hip_fracture').nodes.some(n => /腹部・胸部に力/.test(n.label)));
  // 予測の矢印の間の補足は予測（破線）のまま
  const m2 = { version: 2, nodes: [{ id: 'a', type: 'pathophysiology', label: '皮膚・粘膜のバリア機能の低下', observed: true, source: 'knowledge', x: 0, y: 0 }, { id: 'b', type: 'future_risk', label: '感染の可能性', observed: false, source: 'knowledge', x: 0, y: 0 }], edges: [{ id: 'e', source: 'a', target: 'b', relation: 'predicts', predicted: true }] };
  assert.equal(app.rmApplyBridges(m2), 1);
  const x = m2.nodes.find(n => n.added);
  assert.equal(x.observed, false);
  assert.ok(m2.edges.every(e => e.predicted));
  assert.equal(app.rmApplyBridges(m2), 0, '2回目は増えない');
  // 見た目：紫の枠・「＋補足」の札・凡例
  const svg = app.relationMapSvg(map, {});
  assert.match(svg, /class="rm-node is-added/);
  assert.match(svg, /stroke="#7C3AED"/);
  assert.match(svg, />＋補足/);
  // 保存しても added は残る
  assert.ok(app.normalizeRelationMap(JSON.parse(JSON.stringify(map))).nodes.some(n => n.added));
  // 操作：図全体を補うボタン・選んだ矢印の間に入れる（手で/AIで）・AIの形に a
  assert.match(html, /data-rm-action="toggle-added"/);
  assert.match(src, /rmBtn\('mid-ai'/); assert.match(src, /rmBtn\('mid-add'/);
  assert.match(src, /"a":0/);
  const ai = app.relationMapFromAiJson({ n: [{ i: 'n1', t: 'pathophysiology', l: '手術侵襲', o: 1 }, { i: 'n2', t: 'pathophysiology', l: '発痛物質の放出', o: 1, k: 1, a: 1 }, { i: 'n3', t: 'nursing_problem', l: '急性疼痛', p: 1 }], e: [{ s: 'n1', d: 'n2', r: 'causes' }, { s: 'n2', d: 'n3', r: 'results_in' }] });
  assert.ok(ai.nodes.find(n => n.label === '発痛物質の放出').added);
});

test('＋補足のあり・なしをボタン1つで入れ替える（隠すと前後を直接つなぎ、戻すと同じ位置に戻る）', () => {
  const map = caseMap('gastric_postop');
  const before = plain({ nodes: map.nodes.map(n => [n.id, n.x, n.y]).sort(), edges: map.edges.map(e => `${e.source}>${e.target}`).sort() });
  const nAdded = map.nodes.filter(n => n.added).length;
  assert.equal(app.rmHideAdded(map), nAdded);
  assert.ok(!map.nodes.some(n => n.added));
  const inv = find(map, /^手術侵襲（組織の損傷）/), pain = find(map, /^創部痛（NRS 2）/);
  assert.ok(hasEdge(map, inv, pain), '隠すと 手術侵襲 → 創部痛 を直接つなぐ');
  assert.ok(!app.validateRelationMap(map).some(i => i.level === 'error'));
  // 保存して読み込み直しても、隠したものは取っておける
  const saved = app.normalizeRelationMap(JSON.parse(JSON.stringify(map)));
  assert.equal(saved.addedStash.nodes.length, nAdded);
  assert.equal(app.rmShowAdded(saved), nAdded);
  assert.ok(!saved.addedStash);
  const after = plain({ nodes: saved.nodes.map(n => [n.id, n.x, n.y]).sort(), edges: saved.edges.map(e => `${e.source}>${e.target}`).sort() });
  assert.deepEqual(after, before, '戻すと元どおり（位置も同じ）');
  // 隠している間に四角を消しても壊れない
  app.rmHideAdded(saved);
  saved.nodes = saved.nodes.filter(n => n.id !== pain.id); saved.edges = saved.edges.filter(e => e.source !== pain.id && e.target !== pain.id);
  app.rmShowAdded(saved);
  saved.nodes.filter(n => n.added).forEach(n => assert.ok(saved.edges.some(e => e.target === n.id) && saved.edges.some(e => e.source === n.id)));
  assert.match(src, /act === 'toggle-added'\) rmToggleAdded\(\)/);
  assert.match(src, /＋補足：\$\{on \? 'あり' : 'なし'\}/);
});

test('検査データは根拠になる四角のすぐ下にくっつける（同じ四角の中ではなく、別の四角をぴったり付ける）', () => {
  const map = caseMap('gastric_postop');
  const labs = map.nodes.filter(n => n.type === 'lab');
  assert.ok(labs.length >= 3);
  labs.forEach(l => {
    assert.ok(l.attachTo, l.label);
    const host = map.nodes.find(n => n.id === l.attachTo), hr = app.rmRect(host), lr = app.rmRect(l);
    assert.ok(map.edges.some(e => e.source === l.id && e.target === host.id), 'データとしての矢印は残す');
    assert.ok(Math.abs(lr.cx - hr.cx) < 1, '親の真下');
    assert.ok(lr.y1 >= hr.y2 - 0.5 && lr.y1 - hr.y2 < 200, '親の下にくっつく');
    assert.ok(!map.nodes.some(o => o !== l && o !== host && !o.attachTo && (() => { const r = app.rmRect(o); return r.x1 < lr.x2 && r.x2 > lr.x1 && r.y1 < lr.y2 && r.y2 > lr.y1; })()), '他の四角と重ならない');
  });
  const wbc = find(map, /WBC/), crp = find(map, /CRP/);
  assert.equal(wbc.attachTo, crp.attachTo, 'WBC・CRP は同じ「炎症反応」の下に重ねる');
  assert.ok(app.rmRect(crp).y1 >= app.rmRect(wbc).y2 - 0.5);
  // くっつけたデータの矢印は描かない（くっついていること自体が矢印の代わり）
  const { routes } = app.rmRouteEdges(map);
  assert.ok(!routes.some(r => labs.some(l => r.edge.source === l.id && r.edge.target === l.attachTo)));
  // 親を動かすとデータも一緒に動く／データを引きはがすと矢印で描く
  assert.match(src, /l\.attachTo === node\.id\) \{ l\.x \+= mx; l\.y \+= my;/);
  assert.match(src, /if \(node\.attachTo\) delete node\.attachTo;/);
});

// ---- 長文の事例3つ：＋補足なし（前）と＋補足あり（後）で比べる ----
const jumpEdges = map => {
  const byId = new Map(map.nodes.map(n => [n.id, n]));
  // 薬の効果そのものが記録にある所見（利尿薬 → 尿量の増加：記録）は一足飛びではない（2026-10-07.6）
  const drugEffect = e => /^利尿薬/.test(byId.get(e.source).label) && /尿量/.test(byId.get(e.target).label) && byId.get(e.target).observed !== false;
  return map.edges.filter(e => e.relation !== 'treats' && !drugEffect(e) && ['treatment', 'disease', 'patient_fact'].includes(byId.get(e.source).type) && ['symptom', 'nursing_problem', 'future_risk'].includes(byId.get(e.target).type));
};
const depthAvg = map => {
  const memo = new Map();
  const depth = id => { if (memo.has(id)) return memo.get(id); memo.set(id, 0); const ins = map.edges.filter(e => e.target === id); const d = ins.length ? 1 + Math.max(...ins.map(e => depth(e.source))) : 0; memo.set(id, d); return d; };
  const probs = map.nodes.filter(n => n.type === 'nursing_problem');
  return probs.reduce((s, p) => s + depth(p.id), 0) / probs.length;
};
const beforeAfter = name => {
  const after = caseMap(name);
  const before = JSON.parse(JSON.stringify(after));
  app.rmHideAdded(before);
  commonChecks(after, `${name}（補足あり）`);
  commonChecks(before, `${name}（補足なし）`);
  assert.ok(jumpEdges(after).length === 0, `${name}：一足飛びの矢印 ${jumpEdges(after).map(e => e.id).join(',')}`);
  assert.ok(jumpEdges(after).length <= jumpEdges(before).length);
  assert.ok(depthAvg(after) > depthAvg(before), `${name}：根拠の段が深くなる`);
  return { after, before };
};

test('長文事例A（COPD急性増悪・細菌性肺炎・78歳）：気道閉塞・CO2貯留・ステロイドの高血糖・呼吸のエネルギーと栄養', () => {
  const { after: map } = beforeAfter('copd_exacerbation_long');
  const probs = probLabels(map);
  ['非効果的気道浄化', 'ガス交換障害', '血糖不安定', '睡眠', '栄養摂取量不足', 'セルフケア不足', '不安'].forEach(w => assert.ok(probs.some(p => p.includes(w)), `${w} / ${probs.join('、')}`));
  const obst = find(map, /末梢気道の閉塞/), co2 = find(map, /CO2の貯留/), paco2 = find(map, /PaCO2/);
  assert.ok(hasEdge(map, obst, co2) && paco2.attachTo === co2.id, 'PaCO2 は CO2貯留にくっつく');
  const st = find(map, /^ステロイド（プレドニゾロン30mg）/), hg = find(map, /ステロイドの副作用による高血糖/);
  assert.ok(hasEdge(map, st, hg) && map.edges.some(e => e.source === st.id && e.relation === 'treats'), 'ステロイドは治療、副作用で高血糖');
  assert.ok(['WBC', 'CRP'].every(k => find(map, new RegExp(k)).attachTo === find(map, /肺胞・気道の炎症/).id), '炎症の値は肺の炎症にくっつく');
  assert.ok(!map.nodes.some(n => /在宅酸素療法 安静時/.test(n.label) && n.type === 'symptom'), '既往の「安静時」を活動の制限にしない');
  assert.ok(linked(map, find(map, /呼吸に使うエネルギーの増加/), find(map, /^食事は息切れのため3割摂取/)));
  const words = find(map, /不安の言動/);
  assert.ok(/本人・家族/.test(words.label) && (words.label.match(/「/g) || []).length === (words.label.match(/」/g) || []).length, words.label);
});

test('長文事例B（S状結腸がん・腹腔鏡下手術・糖尿病）：術後イレウス・DVT（腹部の手術）・高血糖→感染・オピオイド', () => {
  const { after: map, before } = beforeAfter('colon_cancer_postop_long');
  const probs = probLabels(map);
  ['術後呼吸器合併症', '静脈血栓塞栓症', '感染リスク', '血糖不安定', '急性疼痛', '栄養摂取量不足', '活動耐性低下', '消化管運動機能障害', '便秘'].forEach(w => assert.ok(probs.some(p => p.includes(w)), `${w} / ${probs.join('、')}`));
  const il = find(map, /^腸の動き（蠕動運動）の低下/), opi = find(map, /^オピオイド（フェンタニル）/);
  assert.ok(hasEdge(map, opi, il) && hasEdge(map, find(map, /^体動の制限/), il));
  assert.ok(linked(map, il, find(map, /^腹部膨満あり/)) && find(map, /術後イレウス/).observed === false);
  assert.ok(find(map, /^術後の安静による静脈血のうっ滞/), '腹部の手術で「下肢の手術」と書かない');
  assert.ok(!map.nodes.some(n => /下肢の手術/.test(n.label)));
  assert.ok(hasEdge(map, find(map, /インスリン作用の不足による高血糖/), find(map, /免疫機能・創傷治癒の低下/)), '高血糖 → 免疫・創傷治癒');
  // 呼吸のひな形（麻酔 → 咳嗽反射の低下、疼痛 → 深呼吸・咳嗽の抑制 → 排痰困難で合流）の間には＋補足を入れない（2026-10-07.6）
  assert.ok(!map.nodes.some(n => /腹部・胸部に力|1回換気量と咳の力|気道の線毛運動・咳による|末梢の気道が痰でふさがり/.test(n.label)), '呼吸の流れに同じ内容の四角を並べない');
  assert.ok(map.nodes.filter(n => n.added).length >= 10 && !before.nodes.some(n => n.added));
});

test('長文事例C（慢性心不全の急性増悪・84歳・独居）：増悪の誘因（塩分・飲み忘れ）・利尿薬→夜間頻尿→転倒/睡眠・塩分制限食と食欲', () => {
  const { after: map, before } = beforeAfter('heart_failure_long');
  const probs = probLabels(map);
  ['ガス交換障害', '体液量過剰', '体液量不足リスク', '転倒転落', '睡眠', '栄養摂取量不足', 'セルフケア不足', '健康自主管理'].forEach(w => assert.ok(probs.some(p => p.includes(w)), `${w} / ${probs.join('、')}`));
  assert.ok(find(map, /^呼吸困難あり、起座呼吸/), '入院後の観察（現病歴の文ではなく）');
  assert.ok(find(map, /^両下腿に圧痕性浮腫/));
  const trig = find(map, /塩分・水分の過剰や内服の中断/);
  assert.ok(hasEdge(map, find(map, /^塩辛い漬物/), trig) && hasEdge(map, find(map, /^内服を飲み忘れる/), trig));
  const du = find(map, /^利尿薬（フロセミド）/), noct = find(map, /^夜間頻尿/);
  assert.ok(noct.added && hasEdge(map, du, noct) && hasEdge(map, noct, find(map, /^夜間トイレに行く途中、ふらつき/)) && hasEdge(map, noct, find(map, /夜はおしっこで何度も起きる/)), '利尿薬 →［夜間頻尿］→ ふらつき・睡眠（同じ補足を通す）');
  assert.equal(map.nodes.filter(n => /^夜間頻尿/.test(n.label)).length, 1);
  assert.ok(linked(map, find(map, /^塩分制限食/), find(map, /^食事は「味がしない」/)));
  assert.ok(jumpEdges(before).length >= 4, '補足なしでは一足飛びの矢印が残っている');
  const headers = map.headers.map(h => h.label);
  assert.ok(!headers.includes('治療'), `内科の事例で治療が散らばるときは「治療」の列を作らない：${headers.join('、')}`);
});

test('関連図のボードをドラッグ・スワイプで動かす／2本指・Ctrl＋ホイールで拡大縮小', () => {
  assert.match(css, /\.rm-canvas-wrap svg \{ display: block; touch-action: none; cursor: grab;/);
  assert.match(css, /\.rm-canvas-wrap\.is-panning/);
  assert.match(src, /wrap\.scrollLeft = pan\.sl - \(e\.clientX - pan\.sx\)/);
  assert.match(src, /if \(touch && !selectedHere && !rmState\.connectFrom\) \{ startPan/, 'スマホは選んでいない四角の上でもスワイプで動かす');
  assert.match(src, /if \(pointers\.size === 2\) \{ startPinch\(\)/);
  assert.match(src, /wrap\.addEventListener\('wheel', e => \{[\s\S]{0,120}if \(!\(e\.ctrlKey \|\| e\.metaKey \|\| leftHeld\)/);
  assert.equal(typeof app.rmZoomAt, 'function');
});

test('関連図：スマホでは関連図のページを開いている間だけ、上の見出し（ヘッダー）を固定しない（図の上の方が隠れないように）', () => {
  assert.match(src, /document\.body\.classList\.toggle\('is-relation-view', viewName === 'relation'\)/);
  assert.match(css, /@media \(max-width: 767px\) \{ body\.is-relation-view > header \{ position: static; \} \}/);
  // パソコンの画面や、ほかのページでは今までどおり固定する
  assert.match(html, /<header class="[^"]*sticky top-0/);
});

// 2026-10-06.11：関連図に使える知識集（2021〜2026年の最新のガイドライン）から「＋補足」の知識を追加
test('関連図：最新のガイドラインを根拠にした「＋補足」が、矢印の間に入る（心不全・誤嚥性肺炎・COPD・術後）', () => {
  const addedBetween = (map, a, b, re) => map.nodes.some(m => m.added && re.test(m.label) && hasEdge(map, a, m) && hasEdge(map, m, b));
  const hf = beforeAfter('heart_failure_long').after;
  assert.ok(addedBetween(hf, find(hf, /^心拍出量の低下・肺うっ血/), find(hf, /^腎血流量の低下/), /アンジオテンシン/), '低心拍出→腎臓がナトリウムと水をためこむ→体液の貯留');
  assert.ok(hf.nodes.some(m => m.added && /横になると心臓に戻る血液が増え/.test(m.label)), '起座呼吸→肺のうっ血が強まる→眠れない');
  const asp = beforeAfter('aspiration_pneumonia').after;
  assert.ok(addedBetween(asp, find(asp, /^88歳/), find(asp, /^嚥下反射・咳反射の低下/), /のどの感覚の低下/), '加齢→のどの感覚の低下→嚥下反射の低下');
  // （2026-10-07.6：栄養の主な流れは「食事摂取の低下 → 栄養摂取量不足」。誤嚥性肺炎では 嚥下反射の低下 → 絶食 → 栄養摂取量不足）
  const fast = find(asp, /^絶食中/), nutr = find(asp, /^栄養摂取量不足/);
  assert.ok(fast && hasEdge(asp, find(asp, /^嚥下反射・咳反射の低下/), fast) && hasEdge(asp, fast, nutr), '嚥下反射の低下 → 絶食 → 栄養摂取量不足');
  const copd = beforeAfter('copd_exacerbation_long').after;
  assert.ok(addedBetween(copd, find(copd, /^気道・肺胞への慢性的な刺激/), find(copd, /COPD/), /肺気腫/), '喫煙の刺激→気道の炎症と肺胞の壊れ→COPD');
  assert.ok(linked(copd, find(copd, /^末梢気道の閉塞/), find(copd, /^CO2の貯留/)), '気道閉塞→CO2の貯留は今までどおり');
  assert.ok(!copd.nodes.some(m => m.added && /心臓に戻る血液/.test(m.label)), 'COPDの起座呼吸に心不全の過程を入れない');
  const colon = beforeAfter('colon_cancer_postop_long').after;
  assert.ok(colon.nodes.some(m => m.added && /交感神経の緊張と腸の炎症/.test(m.label)), '手術侵襲→交感神経の緊張・腸の炎症→腸の動きの低下');
  assert.ok(colon.nodes.some(m => m.added && /ウィルヒョウ/.test(m.label)), '手術侵襲→ウィルヒョウの3つの要因→静脈血のうっ滞');
  // 新しい知識で四角が増えすぎない（上限70個を超えない。2026-10-06.25：判定する看護問題を増やしたので60→70）
  [hf, asp, copd, colon].forEach(m => assert.ok(m.nodes.length <= 70, String(m.nodes.length)));
});

// 2026-10-06.12：利用者からの要望「関連図は全画面機能の追加、説明書きの削除、補足ありのボタンを記録から作るの横に配置」
test('関連図：全画面ボタンがあり、Esc・ほかのページへの切り替えで元に戻る／上の説明書きを消し、＋補足のボタンは「記録から作る」の横／左クリック＋ホイールで拡大・縮小', () => {
  const view = html.slice(html.indexOf('<div id="view-relation"'), html.indexOf('<div id="view-reference"'));
  assert.match(view, /data-rm-action="fullscreen"/);
  assert.doesNotMatch(view, /事実を並べた図ではなく/);
  assert.match(view, /自動で作った図はたたき台です/, '消すのは上の説明だけ（下の注意書きは残す）');
  assert.match(src, /const leftHeld = \(\(e\.buttons & 1\) === 1 \|\| mouseLeftDown\) && !rmState\.drag;/, 'パソコンは左クリック＋ホイールで拡大・縮小');
  const order = [...view.matchAll(/data-rm-action="([\w-]+)"/g)].map(m => m[1]);
  assert.equal(order.indexOf('toggle-added'), order.indexOf('build-rules') + 1, order.join(','));
  assert.match(src, /else if \(act === 'fullscreen'\) rmSetFullscreen\(\);/);
  assert.match(src, /if \(viewName !== 'relation' && typeof window\.rmSetFullscreen === 'function'\) window\.rmSetFullscreen\(false\);/);
  assert.match(css, /#view-relation\.rm-fullscreen \.rm-canvas-wrap \{ position: fixed; inset: 0; z-index: 50;/, '広げるのは図の枠だけ');
  assert.doesNotMatch(css, /#view-relation\.rm-fullscreen \{ position: fixed/, 'ページ全体は広げない');
  assert.match(view, /class="rm-fs-controls"[\s\S]*?data-rm-action="fullscreen"/, '全画面の中に「元の大きさ」');
  assert.equal(typeof app.rmSetFullscreen, 'function');
});

// 2026-10-06.15：利用者からの要望「関連図が横長になりすぎている」。1本道の流れは同じ列に縦に積む（3つまで）
test('関連図：1本道の流れを同じ列に縦に積み、横長になりすぎない（幅が高さの2倍以内）', () => {
  ['gastric_postop', 'hip_fracture', 'colon_cancer_postop_long', 'copd_exacerbation_long'].forEach(name => {
    const map = caseMap(name);
    const rects = map.nodes.map(n => app.rmRect(n));
    const W = Math.max(...rects.map(r => r.x2)), H = Math.max(...rects.map(r => r.y2));
    assert.ok(W <= H * 2, `${name}: ${W} x ${H}`);
    const byId = new Map(map.nodes.map(n => [n.id, app.rmRect(n)]));
    assert.ok(map.edges.some(e => { const a = byId.get(e.source), b = byId.get(e.target); return Math.abs(a.cx - b.cx) < 2 && b.y1 > a.y2; }), `${name}: 縦に積んだ流れ（下向きの矢印）がある`);
    // 背景・治療・看護問題は積まない
    map.edges.forEach(e => { const s = map.nodes.find(n => n.id === e.source), t = map.nodes.find(n => n.id === e.target); const a = byId.get(e.source), b = byId.get(e.target);
      if (Math.abs(a.cx - b.cx) < 2 && b.y1 > a.y2 && !t.attachTo) assert.ok(![s.type, t.type].some(x => ['patient_fact', 'treatment', 'nursing_problem'].includes(x)), `${s.label} → ${t.label}`); });
  });
});

// 2026-10-06.16：時系列・看護問題の一覧
test('関連図：術後・入院2日目以降の記録の四角は治療より右（時系列）／看護問題の一覧（ボタンで開き、押すとその四角へ）', () => {
  assert.equal(app.rmPhaseOfItems([{ timestamp: '入院前' }]), 0);
  assert.equal(app.rmPhaseOfItems([{ timestamp: '入院時' }]), 1);
  assert.equal(app.rmPhaseOfItems([{ timestamp: '術後2日目 9:00' }]), 2);
  assert.equal(app.rmPhaseOfItems([{ timestamp: '入院3日目 10:00' }]), 2);
  assert.equal(app.rmPhaseOfItems([{ timestamp: '9:00' }]), null);
  const items = app.classifyTextByRules(GASTRIC).map((i, k) => ({ ...i, id: `it${k}`, timestamp: i.timestamp === '入院前' ? i.timestamp : `術後2日目 ${i.timestamp}` }));
  const map = app.buildRelationMapFromRecord({ id: 'p1', title: 'A氏', sourceText: GASTRIC, items, carePlans: {}, selectedDiagnosisIds: [], diagnosisCandidates: [] });
  const treat = map.nodes.filter(n => n.type === 'treatment' && n.phase !== 2);
  if (treat.length) {
    const tx = Math.min(...treat.map(n => n.x));
    map.nodes.filter(n => n.phase === 2 && n.type !== 'treatment' && n.type !== 'nursing_problem' && !n.attachTo).forEach(n => assert.ok(n.x > tx, `治療より右：${n.label}`));
  }
  // 2026-10-06.17：図の上に置いた一覧は「邪魔」との声で、ツールバーと全画面の右上の「看護問題」ボタンで開く小さな一覧にした
  assert.match(html, /class="rm-prob-menu">[\s\S]*?data-rm-action="toggle-problems"[\s\S]*?id="rm-problems" class="rm-problems hidden" role="menu"/);
  assert.match(html, /class="rm-fs-controls"[\s\S]*?data-rm-action="toggle-problems"/, '全画面でも開ける');
  assert.doesNotMatch(html, /<div id="rm-problems"[^>]*><\/div>\s*<div id="rm-selection-bar"/, '図の上には置かない');
  assert.match(css, /\.rm-problems \{ position: absolute;/, '図の上に重ねて出し、場所をとらない');
  assert.match(src, /else if \(act === 'toggle-problems'\) \{ rmSetMoreOpen\(false\); rmSetProblemsOpen\(!rmState\.problemsOpen\); \}/);
  assert.match(src, /else if \(act === 'goto-problem'\)/);
  assert.match(src, /data-rm-action="focus-problem" data-node-id=/, '2026-10-06.26：一覧から看護問題ごとの図にする');
});

// 2026-10-06.18：利用者からの指摘「矢印が左に伸びていると、さかのぼれない」「基本情報からいきなり看護問題（同じ情報が2つ）」
test('関連図：左向きの矢印を作らない（治療は対象と同じ列のすぐ下・くっつけた検査データの先は親より右）', () => {
  ['gastric_postop', 'hip_fracture', 'aspiration_pneumonia', 'cerebral_infarction', 'colon_cancer_postop_long', 'copd_exacerbation_long', 'heart_failure_long'].forEach(name => {
    const map = caseMap(name);
    const byId = new Map(map.nodes.map(n => [n.id, n]));
    map.edges.forEach(e => {
      const s = byId.get(e.source), t = byId.get(e.target);
      if (s.attachTo === t.id) return;
      const a = app.rmRect(s), b = app.rmRect(t);
      assert.ok(b.x2 >= a.x1 - 4, `${name}: 左向き ${s.label} → ${t.label}`);
      if (e.relation === 'treats') assert.ok(Math.abs(a.cx - b.cx) < 2 && a.y1 > b.y1, `${name}: 治療は対象の真下 ${s.label} → ${t.label}`);
    });
    assert.ok(!app.validateRelationMap(map).some(i => i.code === 'leftward'), name);
  });
  // 手で動かして左向きになったら、チェックで知らせる
  const m = app.normalizeRelationMap({ version: 2, nodes: [{ id: 'a', type: 'symptom', label: '痛み', x: 600, y: 0 }, { id: 'b', type: 'nursing_problem', label: '急性疼痛', x: 0, y: 0, priority: 1 }], edges: [{ id: 'e', source: 'a', target: 'b', relation: 'results_in' }] });
  assert.ok(app.validateRelationMap(m).some(i => i.code === 'leftward'));
});

test('関連図：看護計画の看護問題の頭の番号（「2.」など）を外し、基本情報（氏名・年齢・血液型）を根拠にしない／似た看護問題はチェックで知らせる', () => {
  assert.equal(app.rmCleanProblemLabel('2. 身体可動性障害'), '身体可動性障害');
  assert.equal(app.rmCleanProblemLabel('#3 2. 移動能力低下'), '移動能力低下');
  assert.equal(app.rmCleanProblemLabel('①不安'), '不安');
  assert.equal(app.rmCleanProblemLabel('2型糖尿病に関連した血糖不安定リスク状態'), '2型糖尿病に関連した血糖不安定リスク状態');
  const text = 'A氏 76歳 女性 血液型 A Rh+\n診断名：変形性膝関節症\n入院時\n「膝が痛くて歩くのがつらい」と話す。\n歩行時は杖を使用し、トイレまでの移動に見守りが必要。\nNRS 5';
  const items = app.classifyTextByRules(text).map((i, k) => ({ ...i, id: `it${k}` }));
  const plan = (id, order, problem) => ({ id, order, problem, relatedNeeds: [4, 9], records: [] });
  const map = app.buildRelationMapFromRecord({ id: 'p1', title: 'A氏', sourceText: text, items, carePlans: { a: plan('a', 1, '1. 急性疼痛'), b: plan('b', 2, '2. 身体可動性障害'), c: plan('c', 3, '2. 移動能力低下') }, selectedDiagnosisIds: [], diagnosisCandidates: [] });
  const probs = map.nodes.filter(n => n.type === 'nursing_problem');
  probs.forEach(p => assert.doesNotMatch(p.label, /^\d/, p.label));
  const byId = new Map(map.nodes.map(n => [n.id, n]));
  map.edges.filter(e => byId.get(e.target).type === 'nursing_problem').forEach(e => assert.doesNotMatch(byId.get(e.source).label, /血液型|76歳/, '基本情報から看護問題へつながない'));
  const mob = probs.find(p => /身体可動性/.test(p.label));
  // 2026-10-06.21：同じことを指す「移動能力低下」は看護問題から外し、「身体可動性障害」へ至る途中の状態にする
  const mid = map.nodes.find(n => n.label === '移動能力低下');
  assert.equal(mid.type, 'pathophysiology');
  assert.ok(map.edges.some(e => e.source === mid.id && e.target === mob.id));
  assert.ok(map.edges.some(e => e.target === mid.id && /歩行|移動/.test(byId.get(e.source).label)), '歩行・移動の記録を根拠にする');
  assert.ok(!app.validateRelationMap(map).some(i => i.code === 'similar-problems'), 'まとめたのでチェックの知らせは出ない');
  // 似た看護問題の知らせ自体は残る（手で看護問題を足したとき）
  const m2 = app.normalizeRelationMap({ version: 2, nodes: [{ id: 'a', type: 'symptom', label: '歩行時ふらつき', x: 0, y: 0 }, { id: 'b', type: 'nursing_problem', label: '身体可動性障害', priority: 1, source: 'plan', x: 300, y: 0 }, { id: 'c', type: 'nursing_problem', label: '移動能力低下', priority: 2, source: 'plan', x: 300, y: 100 }], edges: [{ id: 'e1', source: 'a', target: 'b', relation: 'results_in' }, { id: 'e2', source: 'a', target: 'c', relation: 'results_in' }] });
  assert.ok(app.validateRelationMap(m2).some(i => i.code === 'similar-problems'));
});

// 2026-10-06.19：利用者の声「記録から看護問題へ直接は変」「チェックで分かるなら最初からそうして」「矢印の向きを変えたい」
// 「端で止まるので余裕が欲しい」「文字が左詰めで読みにくい」「検査値の推移と看護計画のタブを逆に」
test('関連図：看護計画の看護問題は、記録から直接ではなく病態の流れの中から（同じ種類の問題の手前の病態、または＋補足の病態 → 記録 → 問題）', () => {
  const text = 'A氏 76歳 女性 血液型 A Rh+\n診断名：変形性膝関節症\n入院時\n「膝が痛くて歩くのがつらい」と話す。\n歩行時は杖を使用し、トイレまでの移動に見守りが必要。\nNRS 5';
  const items = app.classifyTextByRules(text).map((i, k) => ({ ...i, id: `it${k}` }));
  const plan = (id, order, problem) => ({ id, order, problem, relatedNeeds: [4, 9], records: [] });
  const map = app.buildRelationMapFromRecord({ id: 'p1', title: 'A氏', sourceText: text, items, carePlans: { a: plan('a', 1, '1. 急性疼痛'), b: plan('b', 2, '2. 身体可動性障害'), c: plan('c', 3, '2. 移動能力低下') }, selectedDiagnosisIds: [], diagnosisCandidates: [] });
  const byId = new Map(map.nodes.map(n => [n.id, n]));
  map.nodes.filter(n => n.type === 'nursing_problem').forEach(p => {
    map.edges.filter(e => e.target === p.id).forEach(e => assert.ok(map.edges.some(x => x.target === e.source), `「${byId.get(e.source).label}」→「${p.label}」の手前にも流れがある`));
  });
  // ひな形の同じ種類の看護問題があれば、その手前の病態から枝分かれ（大腿骨頸部骨折）
  const hipText = fs.readFileSync(path.join(ROOT, 'tests/fixtures/relation-map/hip_fracture.txt'), 'utf8');
  const hipItems = app.classifyTextByRules(hipText).map((i, k) => ({ ...i, id: `it${k}` }));
  const hip = app.buildRelationMapFromRecord({ id: 'p2', title: 'B氏', sourceText: hipText, items: hipItems, carePlans: { a: plan('a', 1, '急性疼痛'), b: plan('b', 2, 'セルフケア不足'), c: plan('c', 3, '身体可動性障害') }, selectedDiagnosisIds: [], diagnosisCandidates: [] });
  const hb = new Map(hip.nodes.map(n => [n.id, n]));
  const mob = hip.nodes.find(n => n.label === '身体可動性障害');
  const srcs = hip.edges.filter(e => e.target === mob.id).map(e => hb.get(e.source));
  assert.ok(srcs.length && srcs.every(n => !['patient_fact', 'lab'].includes(n.type)), srcs.map(n => n.type + ':' + n.label).join(' / '));
});

test('関連図：作った直後に、チェックで自動で直せるものは直してある（予測 → 事実もない）／交差は「並べ直す」で減るときだけ勧める', () => {
  ['gastric_postop', 'hip_fracture', 'aspiration_pneumonia', 'cerebral_infarction', 'colon_cancer_postop_long', 'copd_exacerbation_long', 'heart_failure_long'].forEach(name => {
    const issues = app.validateRelationMap(caseMap(name));
    const left = issues.filter(i => i.fix && ['isolated', 'duplicate', 'mutual', 'treat-source', 'treat-direction', 'treat-reverse', 'from-problem', 'risk-solid', 'risk-observed', 'edge-to-pred', 'numbering', 'leftward'].includes(i.code));
    assert.deepEqual(plain(left.map(i => i.code)), [], name);
    assert.ok(!issues.some(i => i.code === 'pred-to-fact'), `${name}：予測 → 事実`);
    const cr = issues.find(i => i.code === 'crossing');
    assert.ok(!cr || !cr.fix, `${name}：作った直後は並べ直しても同じなので勧めない`);
  });
  assert.match(src, /function rmAutoFixBuilt\(map\)/);
});

test('関連図：矢印の向きを逆にする（並べ直して左向きを残さない）・文字はまん中ぞろえ・図のまわりに余白・タブは 看護計画 → 検査値の推移 の順', () => {
  assert.match(src, /rmBtn\('reverse', '<i class="fa-solid fa-right-left"><\/i> 向きを逆にする', 'btn-primary'\)/);
  assert.match(src, /else if \(act === 'reverse'\) \{[\s\S]{0,400}layoutRelationMap\(m\);/);
  assert.match(src, /stroke="transparent" stroke-width="20"/, '線を押しやすく');
  const svg = app.relationMapSvg(caseMap('gastric_postop'), {});
  assert.ok(!/<text class="rm-text"(?![^>]*text-anchor="middle")/.test(svg), '文字はまん中ぞろえ');
  assert.match(src, /<div class="rm-stage">\$\{focusSub \? relationMapSvg\(focusSub/);
  assert.match(css, /\.rm-stage \{ display: inline-block; padding: min\(28vh, 220px\) min\(28vw, 320px\);/);
  assert.ok(html.indexOf('id="tab-careplan"') < html.indexOf('id="tab-labs"'), '看護計画のタブが先');
  assert.ok(html.indexOf('id="tab-labs"') < html.indexOf('id="tab-relation"'));
});

// 2026-10-06.20：利用者の声「操作のボタンがごちゃごちゃ」「背景を見やすく」「予測の流れを薄く（案3）」
test('関連図：操作は 作る｜編集｜見る・出す にまとめ、拡大・縮小は図の右下、印刷・画像・すべて消すは「その他」の中／地の色・予測は薄く', () => {
  const view = html.slice(html.indexOf('<div id="view-relation"'), html.indexOf('<div id="view-reference"'));
  const bar = view.slice(view.indexOf('class="rm-toolbar"'), view.indexOf('id="rm-selection-bar"'));
  assert.match(bar, /class="rm-group rm-group-sep" aria-label="編集"/);
  assert.match(bar, /class="rm-group rm-group-end" aria-label="見る・出す"/);
  assert.match(bar, /id="rm-more" class="rm-problems rm-more hidden"[\s\S]*?data-rm-action="print"[\s\S]*?data-rm-action="png"[\s\S]*?data-rm-action="clear"/, '印刷・画像・すべて消すは「その他」の中');
  assert.doesNotMatch(bar, /data-rm-action="zoom-/, '拡大・縮小はツールバーに置かない');
  assert.match(view, /class="rm-zoom-pad"[\s\S]*?data-rm-action="zoom-in"[\s\S]*?data-rm-action="zoom-out"[\s\S]*?data-rm-action="zoom-fit"[\s\S]*?data-rm-action="zoom-100"/);
  assert.match(css, /\.rm-zoom-pad \{ position: absolute; right: 18px; bottom: 18px;/);
  assert.match(src, /else if \(act === 'toggle-more'\)/);
  assert.match(src, /<details class="rm-help"><summary>四角や矢印（線）を押す・右クリック（スマホは長押し）すると、編集できます/, '案内は1行（くわしくは開いたときだけ）');
  // 地の色（画面）と、予測の流れは薄く
  const map = caseMap('gastric_postop');
  const live = app.relationMapSvg(map, { interactive: true });
  assert.match(live, /<rect class="rm-bg is-paper"[^>]*fill="#F5F3EE"/);
  assert.match(app.relationMapSvg(map, {}), /<rect class="rm-bg"[^>]*fill="#FFFFFF"/, '印刷・画像は白');
  const pe = map.edges.find(e => e.predicted);
  assert.ok(pe);
  assert.match(live, /stroke="#A8A29E" stroke-width="1.4" stroke-dasharray="6 4" marker-end="url\(#rm-arrow-pred\)"/);
  assert.match(live, /class="rm-node[^"]* is-pred"/);
});

// 2026-10-06.21：看護関連図としての評価（7点）と、利用者の声（右クリックで編集・追加、全画面は図の中、色合い・ダークモード）
test('関連図の評価への対応：治療の線の先は「┤」・線が四角の後ろを通らない・検査は矢印の途中に置かない・転倒と脱臼は別・推論を強くしすぎない', () => {
  // 治療（鎮痛薬 ┤ 創部痛）は矢印でなく「┤」（抑える）。凡例にも書く
  const gas = caseMap('gastric_postop');
  const svg = app.relationMapSvg(gas, {});
  assert.match(svg, /<marker id="rm-tee-blue"/);
  assert.doesNotMatch(svg, /url\(#rm-arrow-blue\)/);
  assert.match(src, /治療 ┤ 治療の対象（抑える・和らげる）/);
  // 線が途中の四角の後ろを通らない（「加齢による呼吸予備力の低下 → 全身麻酔」に見えていた）
  ['gastric_postop', 'hip_fracture', 'heart_failure_long', 'aspiration_pneumonia'].forEach(name => {
    const m = caseMap(name);
    const rects = m.nodes.map(n => ({ n, ...app.rmRect(n) }));
    app.rmRouteEdges(m).routes.forEach(r => {
      if (!r.pts) return;
      for (let k = 0; k < r.pts.length - 1; k++) {
        const [a, b] = [r.pts[k], r.pts[k + 1]];
        if (Math.abs(a[1] - b[1]) >= 0.5) continue;
        rects.forEach(R => {
          if ([r.edge.source, r.edge.target].includes(R.n.id) || [r.edge.source, r.edge.target].includes(R.n.attachTo)) return;
          assert.ok(!(a[1] > R.y1 + 1 && a[1] < R.y2 - 1 && Math.max(a[0], b[0]) > R.x1 + 1 && Math.min(a[0], b[0]) < R.x2 - 1), `${name}: 線が「${R.n.label}」の後ろを通る`);
        });
      }
    });
  });
  // 検査データが矢印の途中（A → 検査 → B）にあれば、A → B にして検査は根拠として横に付ける（作った直後に直す）
  const lm = app.normalizeRelationMap({ version: 2, nodes: [{ id: 'a', type: 'pathophysiology', label: '静脈血のうっ滞', x: 0, y: 0 }, { id: 'l', type: 'lab', label: 'Dダイマー 2.3μg/mL', x: 200, y: 0 }, { id: 'b', type: 'future_risk', label: '深部静脈血栓症の可能性', observed: false, x: 400, y: 0 }], edges: [{ id: 'e1', source: 'a', target: 'l', relation: 'causes' }, { id: 'e2', source: 'l', target: 'b', relation: 'causes', predicted: true }] });
  assert.ok(app.validateRelationMap(lm).some(i => i.code === 'lab-in-chain'));
  app.rmApplyFixes(lm, app.validateRelationMap(lm).filter(i => i.code === 'lab-in-chain'));
  assert.ok(lm.edges.some(e => e.source === 'a' && e.target === 'b'), 'A → B');
  assert.ok(!lm.edges.some(e => e.target === 'l'), '検査へ入る矢印はない');
  assert.equal(lm.nodes.find(n => n.id === 'l').attachTo, 'b', '検査は根拠として横（下）に付く');
  // 推論を強くしすぎない（記録にない「心配」「ふらつく」を言い切らない）
  assert.doesNotMatch(src, /管が抜けないか心配で動きにくい/);
  assert.match(src, /step: '全身へ運ぶ酸素が減る（疲れやすさ・ふらつきが出やすい）'/);
  // 痰が出しにくいことが記録にあれば、実際に起きている「非効果的気道浄化」（リスクと混ぜた名前にしない）
  assert.doesNotMatch(src, /非効果的気道浄化（無気肺・肺炎のリスク状態）/);
});

test('関連図：右クリックで編集（四角・矢印）と追加（何もない所）／全画面のボタンは図の中／色合い（患者情報は薄い緑）・ダークモード', () => {
  assert.match(html, /<div id="rm-ctx" class="rm-ctx hidden" role="menu"/);
  assert.match(src, /wrap\.addEventListener\('contextmenu', e => \{ if \(!rmMap\(\)\) return; e\.preventDefault\(\); if \(!rmState\.focusProblem\) rmShowCtx\(e\); \}\);/);
  assert.match(src, /if \(act === 'ctx-add'\) rmAddNode\(btn\.dataset\.kind \|\| 'pathophysiology', rmState\.ctxPoint\);/);
  ['edit-node', 'connect', 'toggle-observed', 'reverse', 'toggle-predicted', 'mid-add', 'why', 'delete'].forEach(a => assert.match(src.slice(src.indexOf('function rmShowCtx'), src.indexOf('function rmHideCtx')), new RegExp(`item\\('${a}'`), a));
  const view = html.slice(html.indexOf('<div id="view-relation"'), html.indexOf('<div id="view-reference"'));
  const bar = view.slice(view.indexOf('class="rm-toolbar"'), view.indexOf('id="rm-selection-bar"'));
  assert.doesNotMatch(bar, /data-rm-action="fullscreen"/, '全画面はツールバーでなく図の中');
  assert.match(view, /class="rm-zoom-pad"[^>]*>\s*<button type="button" data-rm-action="fullscreen"/);
  assert.match(src, /document\.querySelector\('\.rm-zoom-pad \[data-rm-action="fullscreen"\]'\)/);
  assert.match(src, /key: 'patient_fact', label: '患者情報・背景', shape: 'rect', fill: '#EEF4EC'/);
  assert.match(css, /html\[data-theme="dark"\] \.rm-canvas-wrap \.rm-node\[data-kind="patient_fact"\] \.rm-box \{ fill: #1F2A1F;/);
  assert.match(css, /html\[data-theme="dark"\] \.rm-canvas-wrap \.rm-link-line\[stroke-dasharray\] \{ stroke: #7A7366; \}/);
});

// 2026-10-06.22：利用者「スマホ版が見づらい」
test('スマホ：見出しのボタンを小さく・保存の状態は折り返す（横にはみ出さない）／関連図は長押しでメニュー・最初は疾患を上下のまん中に・チェックは直すことがあるときだけ', () => {
  const mob = css.slice(css.indexOf('/* ===== スマホの見やすさ'));
  assert.match(mob, /@media \(max-width: 639px\) \{/);
  assert.match(mob, /#save-status \{ white-space: normal; min-width: 0;/);
  assert.match(mob, /#presence-indicator \{ display: none; \}/);
  assert.match(mob, /\.rm-group-sep \{ padding-left: 0; border-left: 0; \}/);
  assert.match(src, /const longPress = \{ timer: 0, fired: false, sx: 0, sy: 0 \};/);
  assert.match(src, /longPress\.fired = true;\s*rmShowCtx\(\{ target: tgt, clientX: cx, clientY: cy \}\);/);
  assert.match(src, /const dis = wrap\.querySelector\('\.rm-node\[data-kind="disease"\]'\);/);
  assert.match(src, /rmShowCheck\(issues\.some\(i => i\.level !== 'info'\) \? issues : null\);/);
});

// 2026-10-06.23：長文事例（心不全・大腸がん術後・COPD）のテストで見つけたこと
test('長文事例の見直し：長い文はかっこ書きから外して「…」で切らない・本人の息苦しさはガス交換の低下の結果・Kが低ければ電解質異常は事実・治療の「┤」は検査データの下の端まで', () => {
  assert.equal(app.rmShorten('2型糖尿病(15年前から、インスリン自己注射)、肥満(BMI 28.4)、脂質異常症', 40), '2型糖尿病(15年前から、インスリン自己注射)、肥満、脂質異常症');
  assert.equal(app.rmShorten('「息が苦しくて横になれない」（場面：呼吸困難の訴えあり）', 24), '「息が苦しくて横になれない」');
  assert.deepEqual(plain(app.rmWrapText('（PaCO2 58 → 55Torr↑）', 13)), ['（PaCO2 58 → 55Torr↑）'], '閉じかっこだけの行を作らない');
  ['colon_cancer_postop_long', 'heart_failure_long', 'copd_exacerbation_long'].forEach(name => {
    caseMap(name).nodes.forEach(n => assert.doesNotMatch(n.label, /[(（][^)）]*…$/, `${name}: かっこの途中で切れている「${n.label}」`));
  });
  const copd = caseMap('copd_exacerbation_long');
  const ds = copd.nodes.find(n => /^S：「息が苦しくて横になれない」/.test(n.label));
  const into = copd.edges.filter(e => e.target === ds.id).map(e => copd.nodes.find(n => n.id === e.source).label);
  assert.ok(into.some(l => /ガス交換の低下/.test(l)), into.join(' / '));
  const hf = caseMap('heart_failure_long');
  const el = hf.nodes.find(n => /低カリウム血症/.test(n.label));
  assert.notEqual(el.observed, false, 'K 3.2↓ が記録にあるので事実');
  // 治療（楕円）から、検査データが下にくっついた四角への「┤」は、検査データの下の端で止まる（隠れない）
  const by = new Map(copd.nodes.map(n => [n.id, n]));
  const { routes } = app.rmRouteEdges(copd);
  routes.filter(r => r.edge.relation === 'treats' && copd.nodes.some(n => n.attachTo === r.edge.target)).forEach(r => {
    const bottom = Math.max(...copd.nodes.filter(n => n.attachTo === r.edge.target || n.id === r.edge.target).map(n => app.rmRect(n).y2));
    assert.ok(Math.abs(r.pts[r.pts.length - 1][1] - bottom) < 1, `${by.get(r.edge.source).label} ┤ ${by.get(r.edge.target).label}`);
  });
});

// 2026-10-06.24：長文事例3つの関連図の評価への対応
test('関連図の評価（長文事例）：セルフケア不足は介助の記録があるときだけ・気道浄化は分泌物の貯留を通す・血糖は今の高血糖と今後の変動を分ける・Albは看護問題の根拠・イレウスと便秘を分ける・体液量不足リスクと低K血症を分ける', () => {
  const by = m => new Map(m.nodes.map(n => [n.id, n]));
  const srcOf = (m, id) => m.edges.filter(e => e.target === id).map(e => by(m).get(e.source));
  // COPD：清拭・更衣に介助が必要（記録にある）→ セルフケア不足。その記録を図の中に見せる
  const copd = caseMap('copd_exacerbation_long');
  const act = copd.nodes.find(n => n.type === 'nursing_problem' && /セルフケア不足/.test(n.label));
  assert.ok(act && srcOf(copd, act.id).some(n => /介助/.test(n.label)), '介助が要る記録から');
  // COPD：分泌物の増加 → 気道にたまる → 湿性ラ音 → 非効果的気道浄化。吸引はたまった分泌物に
  const retain = copd.nodes.find(n => /気道に分泌物がたまる/.test(n.label));
  assert.ok(retain);
  assert.ok(copd.edges.some(e => e.relation === 'treats' && e.target === retain.id && /吸引/.test(by(copd).get(e.source).label)));
  // 血糖：今の高血糖（事実）→ これからの変動の可能性 → 血糖不安定リスク状態
  const glu = copd.nodes.find(n => /血糖不安定/.test(n.label));
  assert.ok(srcOf(copd, glu.id).every(n => n.type === 'future_risk' && /変動/.test(n.label)));
  // 大腸がん術後：介助の記録が無い → 活動耐性低下／イレウスの流れは「消化管運動機能障害リスク状態」／呼吸は「術後肺合併症リスク状態」
  const colon = caseMap('colon_cancer_postop_long');
  const probs = colon.nodes.filter(n => n.type === 'nursing_problem').map(n => n.label);
  assert.ok(probs.some(l => /^活動耐性低下/.test(l)) && !probs.some(l => /セルフケア不足/.test(l)), probs.join('、'));
  // 腹部膨満などが実際にある → 今ある「消化管運動機能障害」（リスクにしない）。便秘は排便の記録から別に
  assert.ok(probs.some(l => /^消化管運動機能障害（/.test(l)), probs.join('、'));
  assert.ok(probs.includes('術後呼吸器合併症リスク状態'), probs.join('、'));
  // Alb は看護問題（栄養摂取量不足）の根拠として付く（食事量の低下の結果としない）。食事量・体重の記録が無ければ「栄養状態の低下」の根拠
  // （2026-10-07.6：食事量・体重の記録が無くても、主な流れは「食事摂取量の低下 → 栄養摂取量不足」。Albは看護問題の横に根拠として付く）
  assert.match(colon.nodes.find(n => n.id === colon.nodes.find(x => x.type === 'lab' && /Alb/.test(x.label)).attachTo).label, /^栄養摂取量不足/);
  [copd, caseMap('heart_failure_long')].forEach(m => {
    const alb = m.nodes.find(n => n.type === 'lab' && /Alb/.test(n.label));
    const nutr = m.nodes.find(n => n.type === 'nursing_problem' && /栄養摂取量不足/.test(n.label));
    assert.equal(alb.attachTo, nutr.id);
  });
  // 心不全：今は体液量過剰 → 利尿薬 → 過剰な利尿による脱水の可能性 → 体液量不足リスク。低K血症は事実として別
  const hf = caseMap('heart_failure_long');
  const dh = hf.nodes.find(n => /体液量不足リスク/.test(n.label));
  assert.doesNotMatch(dh.label, /電解質/);
  assert.ok(srcOf(hf, dh.id).some(n => /過剰な利尿による脱水の可能性/.test(n.label)));
  const hk = hf.nodes.find(n => /低カリウム血症/.test(n.label));
  assert.notEqual(hk.observed, false);
  assert.ok(!hf.edges.some(e => e.source === hk.id && e.target === dh.id), '低K血症を体液量不足リスクに混ぜない');
  // 心不全：清拭は全介助の記録があるので、セルフケア不足のまま
  assert.ok(hf.nodes.some(n => n.type === 'nursing_problem' && /セルフケア不足/.test(n.label)));
});

// 2026-10-06.25：看護問題の判定基準の見直し（今ある問題／リスク状態を症状の有無で分ける・追加の看護問題）
test('看護問題の判定：症状があれば今ある問題、無ければリスク状態／炎症反応・Dダイマーは危険因子にしない／追加の看護問題', () => {
  const by = m => new Map(m.nodes.map(n => [n.id, n]));
  const labels = m => m.nodes.filter(n => n.type === 'nursing_problem').map(n => n.label);
  const build = text => app.buildRelationMapFromRecord(patientOf(text));
  // 腹部の手術：腹部膨満があれば今ある「消化管運動機能障害」、無ければ「消化管運動機能障害リスク状態」
  const colon = caseMap('colon_cancer_postop_long');
  assert.ok(labels(colon).some(l => /^消化管運動機能障害（/.test(l)));
  assert.ok(labels(caseMap('gastric_postop')).some(l => /^消化管運動機能障害リスク状態/.test(l)));
  // 感染リスク状態の手前（感染の可能性）に炎症反応を置かない。看護問題の根拠のデータとしてつなぐ
  const infRisk = colon.nodes.find(n => n.type === 'future_risk' && /感染/.test(n.label));
  colon.edges.filter(e => e.target === infRisk.id).forEach(e => assert.doesNotMatch(by(colon).get(e.source).label, /炎症反応/));
  // Dダイマーは静脈血栓塞栓症の「可能性」の原因にしない（看護問題の根拠として下に付く）
  const dd = colon.nodes.find(n => /ダイマー/.test(n.label));
  assert.match(by(colon).get(dd.attachTo).label, /^静脈血栓塞栓症リスク状態/);
  // 痰の記録だけ（出せない・多い等が無い）なら非効果的気道浄化にしない
  const base = '診断名：胃がん\n10/1 胃全摘出術施行（全身麻酔）\n<10/2 術後1日目>\n';
  assert.ok(labels(build(base + '喀痰あり。創部痛 NRS 4。')).includes('術後呼吸器合併症リスク状態'));
  assert.ok(labels(build(base + '痰が多く自力で出せない。創部痛 NRS 4。')).includes('非効果的気道浄化'));
  // 浅い呼吸 → 非効果的呼吸パターン／悪心 → 悪心／排尿できない → 排尿障害（尿閉）／便秘
  const m2 = build(base + '浅い呼吸。創部痛 NRS 4。「気持ちが悪い」と話す。カテーテル抜去後、排尿できず導尿。3日間排便なし。');
  ['非効果的呼吸パターン', '悪心', '排尿障害（尿閉）', '便秘'].forEach(w => assert.ok(labels(m2).includes(w), `${w} / ${labels(m2).join('、')}`));
  // 知識不足：本人が「わからない」「大丈夫なの？」
  const hip = caseMap('hip_fracture');
  assert.ok(app.rmProblemCategory('知識不足（治療・退院後の生活）').key === 'anx');
  // 体液量不足リスク状態は利尿薬だけで決めない（摂取量の低下・尿量などがあるとき）
  assert.ok(labels(caseMap('heart_failure_long')).some(l => /体液量不足リスク状態/.test(l)));
  // 急性混乱リスク状態：せん妄の症状は無いが、高齢・手術などがある
  const old = build('80歳 男性\n診断名：大腸がん\n10/1 結腸切除術施行（全身麻酔）\n<10/2 術後1日目>\n創部痛 NRS 3。');
  assert.ok(labels(old).some(l => /^急性混乱リスク状態/.test(l)), labels(old).join('、'));
  // 嚥下：むせがあれば「嚥下障害」
  assert.ok(labels(caseMap('aspiration_pneumonia')).includes('嚥下障害'));
  // 身体可動性障害：片麻痺など
  assert.ok(labels(caseMap('cerebral_infarction')).includes('身体可動性障害'));
});

// 2026-10-06.26：利用者の声「中央の線と箱が集中」「横に長く、スマホ・A4で小さくなる」
test('関連図：近道の矢印を省く・看護問題ごとの図（その流れだけ）を画面と印刷で見られる', () => {
  // 近道：A → B と A → C → B があれば A → B を省く（看護問題・治療・検査の根拠の矢印は残す）
  const m = app.normalizeRelationMap({ version: 2, nodes: [{ id: 'a', type: 'pathophysiology', label: 'A', x: 0, y: 0 }, { id: 'c', type: 'pathophysiology', label: 'C', x: 0, y: 0 }, { id: 'b', type: 'symptom', label: 'B', x: 0, y: 0 }, { id: 'p', type: 'nursing_problem', label: '急性疼痛', priority: 1, x: 0, y: 0 }],
    edges: [{ id: 'ab', source: 'a', target: 'b', relation: 'causes' }, { id: 'ac', source: 'a', target: 'c', relation: 'causes' }, { id: 'cb', source: 'c', target: 'b', relation: 'causes' }, { id: 'bp', source: 'b', target: 'p', relation: 'results_in' }, { id: 'ap', source: 'a', target: 'p', relation: 'results_in' }] });
  assert.equal(app.rmReduceShortcuts(m), 1);
  assert.ok(!m.edges.some(e => e.id === 'ab') && m.edges.some(e => e.id === 'ap'), '看護問題への矢印は残す');
  // 看護問題ごとの図：その看護問題へたどれる四角＋治療＋検査データだけ
  const colon = caseMap('colon_cancer_postop_long');
  const pain = colon.nodes.find(n => n.type === 'nursing_problem' && /急性疼痛/.test(n.label));
  const sub = app.rmProblemSubmap(colon, pain.id);
  assert.ok(sub.nodes.length < colon.nodes.length / 2, `${sub.nodes.length} / ${colon.nodes.length}`);
  assert.equal(sub.nodes.filter(n => n.type === 'nursing_problem').length, 1);
  assert.ok(sub.nodes.some(n => /創部痛/.test(n.label)) && sub.nodes.some(n => n.type === 'treatment' && /鎮痛/.test(n.label)));
  const W = Math.max(...sub.nodes.map(n => app.rmRect(n).x2));
  assert.ok(W < 1400, '小さな図になる：' + W);
  // 画面：一覧から選ぶと、その流れだけの図（見るだけ）。全体の図に戻すボタン
  assert.match(src, /else if \(act === 'focus-problem'\)/);
  assert.match(src, /rmBtn\('focus-all', '<i class="fa-solid fa-diagram-project"><\/i> 全体の図に戻す', 'btn-primary'\)/);
  // 印刷：全体の図の後に、看護問題ごとに1ページずつ
  assert.match(html, /data-rm-action="print-per-problem"/);
  const doc = app.relationMapPrintHtml({ title: 'A氏' }, colon, { perProblem: true });
  assert.equal((doc.match(/<section class="page">/g) || []).length, colon.nodes.filter(n => n.type === 'nursing_problem').length);
});

// 2026-10-07.1：利用者「看護問題がわかりにくくなった。補足として今の説明をするように」。
// 名前は短い看護問題名に戻し、患者の状態をそのまま書いた説明を「補足」として名前の下に小さく添える
test('看護問題の補足：短い名前の下に、患者の状態をそのまま書いた説明を添える（図・一覧・編集・保存・AI）', () => {
  ['gastric_postop', 'hip_fracture', 'aspiration_pneumonia', 'cerebral_infarction', 'colon_cancer_postop_long', 'copd_exacerbation_long', 'heart_failure_long'].forEach(name => {
    caseMap(name).nodes.filter(n => n.type === 'nursing_problem' && !/（候補）$/.test(n.label)).forEach(p => {
      assert.ok(p.note && p.note.length >= 4, `${name}：「${p.label}」に補足がない`);
      assert.match(p.note, /(?:ある|いる|ない|難しい|おそれがある|（尿閉）|伝えにくい)$/, `${name}：${p.note}`);
    });
  });
  const colon = caseMap('colon_cancer_postop_long');
  const pain = colon.nodes.find(n => n.type === 'nursing_problem' && /^急性疼痛/.test(n.label));
  assert.equal(pain.note, '手術の傷の痛みがある');
  // 図：補足のぶん四角が高くなり、名前の下に小さい字で描く
  const plainSize = app.rmNodeSize({ ...pain, note: '' }), withNote = app.rmNodeSize(pain);
  assert.ok(withNote.h > plainSize.h && withNote.noteLines.length >= 1);
  const svg = app.relationMapSvg(colon, {});
  assert.match(svg, /<text class="rm-note"[^>]*>.*手術の傷の痛みがある/);
  // 保存しても残る（看護問題だけ）
  const norm = app.normalizeRelationMap(JSON.parse(JSON.stringify(colon)));
  assert.equal(norm.nodes.find(n => n.id === pain.id).note, '手術の傷の痛みがある');
  assert.ok(!norm.nodes.some(n => n.type !== 'nursing_problem' && n.note));
  // 看護計画の問題名：決まった補足があればそれ、中身がちがう名前なら補足は外す
  const plan = problem => app.buildRelationMapFromRecord(patientOf(GASTRIC, { carePlans: { a: { id: 'a', order: 1, problem, relatedNeeds: [], records: [] } } }));
  const m1 = plan('急性疼痛（手術創部の侵襲）');
  assert.equal(m1.nodes.find(n => n.type === 'nursing_problem' && /^急性疼痛/.test(n.label)).note, '手術の傷の痛みがある');
  assert.equal(app.rmPlainNote('急性疼痛(手術創部の侵襲)'), '手術の傷の痛みがある');
  // 行の終わりに開きかっこだけが残らない
  app.rmWrapText('#9 消化管運動機能障害（術後の腸蠕動の低下）', 12.5).forEach(l => assert.doesNotMatch(l, /[（(]$/, l));
  // 編集：右クリック・選んだときのボタンから補足を直せる。一覧にも補足を出す
  assert.match(src, /item\('edit-note', '<i class="fa-solid fa-comment-dots"><\/i> 補足（説明）を編集'\)/);
  assert.match(src, /else if \(act === 'edit-note'\) rmEditNodeNote\(sel\.id\);/);
  assert.match(src, /<small class="rm-prob-note">/);
  assert.match(css, /\.rm-prob-note \{/);
  assert.match(css, /html\[data-theme="dark"\] \.rm-canvas-wrap \.rm-note \{/);
  // AI：l は短い看護問題名、m に補足
  assert.match(src, /mに補足として患者の状態をそのまま書いた説明/);
  assert.match(src, /"m":"看護問題の補足"/);
});

// 2026-10-07.2：利用者「看護問題の一覧を開くボタンに色づけ。看護理論・ライフサイクル・発達課題・障害受容を図に四角で入れる」
test('関連図：看護理論・ライフサイクル（発達課題）・役割・障害受容の四角を、心理社会の看護問題の手前に入れる', () => {
  const by = m => new Map(m.nodes.map(n => [n.id, n]));
  const outs = (m, n) => m.edges.filter(e => e.source === n.id).map(e => by(m).get(e.target));
  // 脳梗塞：72歳 → 老年期の発達課題、麻痺 → 障害受容（「涙ぐむ」から悲嘆期）→ 生活の変化 → 不安
  const cva = caseMap('cerebral_infarction');
  const dev = find(cva, /^老年期の発達課題：統合 対 絶望（エリクソン）$/);
  assert.ok(dev && dev.source === 'knowledge' && /ハヴィガースト/.test(dev.evidence));
  const acc = find(cva, /^障害受容：悲嘆期（コーン）$/);
  assert.ok(acc && acc.observed !== false && /フィンク/.test(acc.evidence));
  assert.ok(cva.edges.some(e => e.target === acc.id && by(cva).get(e.source).key === undefined && /麻痺/.test(by(cva).get(e.source).label)), '麻痺から障害受容へ');
  assert.ok(find(cva, /^入院で仕事などの役割を果たせない（ロイ：役割機能）$/), '本人の言葉「仕事も囲碁もできない」から役割');
  // 胃がん術後：58歳 → 壮年期の発達課題 → 仕事の役割 → 生活の変化（→ 不安）
  const gas = caseMap('gastric_postop');
  const dev2 = find(gas, /^壮年期の発達課題：生殖性 対 停滞（エリクソン）$/), role = find(gas, /役割を果たせない（ロイ：役割機能）$/);
  assert.ok(dev2 && role && hasEdge(gas, dev2, role));
  assert.ok(outs(gas, role).some(n => /生活の変化/.test(n.label)));
  // 心理社会の流れが無い図には入れない（浮島を作らない）
  const hip = caseMap('hip_fracture');
  assert.ok(!find(hip, /発達課題|障害受容|役割機能/));
  ['cerebral_infarction', 'gastric_postop', 'copd_exacerbation_long', 'heart_failure_long'].forEach(name => commonChecks(caseMap(name), name));
  // 障害受容：本人の言葉が無ければ、段階は決めず予測（破線）。悲嘆期などで心理の看護問題が無ければ「ボディイメージ混乱」
  const base = '診断名：左中大脳動脈領域の脳梗塞\n70歳 男性\n右片麻痺あり。\n';
  const m1 = app.buildRelationMapFromRecord(patientOf(base + '「もうだめだ、情けない」と話す。'));
  assert.ok(find(m1, /^障害受容：悲嘆期（コーン）$/));
  const body = m1.nodes.find(n => n.type === 'nursing_problem' && n.label === 'ボディイメージ混乱');
  assert.ok(body && /受け止めきれず/.test(body.note));
  assert.equal(app.rmLifeStage(8).stage, '学童期');
  assert.equal(app.rmLifeStage(45).crisis, '生殖性 対 停滞');
  // AIへの指示にも、理論の見方を四角で入れてよいと書く
  assert.match(src, /障害受容の段階（コーン：ショック期・回復への期待期・悲嘆期・防衛期・適応期/);
  // 一覧を開くボタンの色（看護問題と同じピンク・開いているときは濃い色・数は丸い札）
  assert.equal((html.match(/class="btn btn-outline rm-prob-toggle /g) || []).length, 2);
  assert.match(css, /\.rm-prob-toggle \{ background: #FBDDE3; border-color: #B03A55;/);
  assert.match(css, /\.rm-prob-toggle\[aria-expanded="true"\] \{ background: #B03A55;/);
  assert.match(css, /html\[data-theme="dark"\] \.rm-prob-toggle \{/);
});

// 2026-10-07.3：ほかの事例（直腸がん・ストーマ造設 46歳、頸髄損傷 19歳）でのテストで分かったことの修正
test('事例：直腸がん・ストーマ造設（46歳）と頸髄損傷（19歳）：障害受容・ボディイメージ・発達課題・役割、脊髄損傷の病態', () => {
  const by = m => new Map(m.nodes.map(n => [n.id, n]));
  const stoma = caseMap('rectal_cancer_stoma');
  commonChecks(stoma, 'ストーマ');
  // 「直腸切断術」「ストーマ造設術」も手術として読む
  assert.ok(stoma.nodes.some(n => n.type === 'treatment' && /直腸切断術/.test(n.label)));
  assert.ok(stoma.nodes.some(n => n.type === 'nursing_problem' && /^急性疼痛/.test(n.label)));
  // 手術 → ストーマ（体の変化）→ 障害受容：悲嘆期（本人の言葉が根拠）→ ボディイメージ混乱
  const st = find(stoma, /^ストーマ（人工肛門）の造設$/), acc = find(stoma, /^障害受容：悲嘆期（コーン）$/);
  assert.ok(st && acc && hasEdge(stoma, st, acc));
  assert.ok(stoma.edges.some(e => e.target === acc.id && e.relation === 'supports' && /人前に出られない|こんな体/.test(by(stoma).get(e.source).label)));
  const body = stoma.nodes.find(n => n.type === 'nursing_problem' && n.label === 'ボディイメージ混乱');
  assert.ok(body && hasEdge(stoma, acc, body) && body.note === 'ストーマによる体の変化を、まだ受け止めきれずにいる');
  assert.equal(app.rmProblemCategory('ボディイメージ混乱').key, 'anx', '「混乱」でせん妄・転倒の種類にしない');
  assert.ok(find(stoma, /^壮年期の発達課題：生殖性 対 停滞（エリクソン）$/) && find(stoma, /^入院で仕事などの役割を果たせない/));
  // 頸髄損傷：麻痺の四角・呼吸筋の麻痺 → 排痰困難・神経因性膀胱 → 膀胱留置カテーテル。息切れの記録が無いので活動耐性低下にしない
  const sci = caseMap('cervical_spinal_cord_injury');
  commonChecks(sci, '頸髄損傷');
  const dis = sci.nodes.find(n => n.type === 'disease');
  assert.ok(sci.edges.some(e => e.source === dis.id && /麻痺/.test(by(sci).get(e.target).label)));
  assert.ok(find(sci, /^呼吸筋（肋間筋・腹筋）の麻痺で咳が弱い$/) && find(sci, /^神経因性膀胱/));
  assert.ok(!sci.nodes.some(n => n.type === 'nursing_problem' && /活動耐性低下/.test(n.label)));
  assert.ok(sci.nodes.some(n => n.type === 'nursing_problem' && n.label === '身体可動性障害'));
  assert.ok(find(sci, /^障害受容：回復への期待期（コーン）$/) && find(sci, /^青年期の発達課題：同一性 対 同一性の混乱（エリクソン）$/));
  assert.ok(find(sci, /^入院で学業などの役割を果たせない/));
});

// 2026-10-07.3：関連図の評価（直腸がん術後・頸髄損傷）への対応
test('関連図の評価への対応：感染の経路を分けて合流・炎症反応は破線の観察データ・イレウスは麻酔/鎮痛薬からも・麻痺から可動性障害へ一本道', () => {
  const by = m => new Map(m.nodes.map(n => [n.id, n]));
  const sci = caseMap('cervical_spinal_cord_injury');
  const pInf = sci.nodes.find(n => n.type === 'nursing_problem' && n.label === '感染リスク状態');
  const into = sci.edges.filter(e => e.target === pInf.id).map(e => by(sci).get(e.source).label);
  assert.ok(into.includes('尿路感染の可能性') && into.some(l => /^創部感染/.test(l)), into.join('、'));
  const cath = find(sci, /膀胱留置カテーテル/), uti = find(sci, /^管を伝って尿道から細菌が膀胱へ入りやすい$/);
  assert.ok(hasEdge(sci, cath, uti) && hasEdge(sci, uti, find(sci, /^尿路感染の可能性$/)));
  assert.ok(!sci.edges.some(e => e.source === cath.id && /バリア機能/.test(by(sci).get(e.target).label)), '尿道カテーテルは創部の流れに入れない');
  // 麻痺 → 寝返り・起き上がりの介助 → 身体可動性障害
  const para = sci.nodes.find(n => /麻痺/.test(n.label) && n.type === 'symptom'), mob = find(sci, /寝返り/);
  assert.ok(hasEdge(sci, para, mob));
  // ストーマ：腸の動きの低下へ、手術侵襲のほか麻酔・硬膜外PCAからも。炎症反応 → 感染リスク は破線
  const st = caseMap('rectal_cancer_stoma');
  const il = find(st, /^腸の動き（蠕動運動）の低下$/);
  ['全身麻酔', '硬膜外PCA'].forEach(w => assert.ok(st.edges.some(e => e.target === il.id && by(st).get(e.source).label.includes(w)), w));
  const inflam = find(st, /手術侵襲による炎症反応/), p2 = st.nodes.find(n => n.label === '感染リスク状態');
  assert.ok(st.edges.some(e => e.source === inflam.id && e.target === p2.id && e.predicted));
});

// 2026-10-07.6：関連図の評価（9事例・88点）への対応
test('関連図の評価への対応（2026-10-07.6）：検査値は根拠・今ある所見とリスクを分ける・治療は対象がわかる・栄養の主経路・重複の統合・看護問題への線を短く', () => {
  const names = ['hip_fracture', 'aspiration_pneumonia', 'cerebral_infarction', 'gastric_postop', 'colon_cancer_postop_long', 'copd_exacerbation_long', 'heart_failure_long', 'rectal_cancer_stoma', 'cervical_spinal_cord_injury'];
  const maps = Object.fromEntries(names.map(n => [n, caseMap(n)]));
  const by = m => new Map(m.nodes.map(n => [n.id, n]));
  // 検査値（Dダイマー・Alb・CRP・WBC・Hb・体温…）から出る線は、すべて「根拠」
  names.forEach(n => { const b = by(maps[n]); maps[n].edges.filter(e => b.get(e.source).type === 'lab').forEach(e => assert.equal(e.relation, 'supports', `${n}：${b.get(e.source).label}`)); });
  // Alb は栄養摂取量不足の横に根拠として付き、主な流れは「食事摂取の低下 → 栄養摂取量不足」
  names.forEach(n => {
    const m = maps[n], nut = m.nodes.find(x => /^栄養摂取量不足/.test(x.label)), alb = m.nodes.find(x => x.type === 'lab' && /^Alb/.test(x.label));
    if (nut && alb && m.edges.some(e => e.source === alb.id && e.target === nut.id)) assert.equal(alb.attachTo, nut.id, n);
    if (nut) assert.ok(m.edges.some(e => e.target === nut.id && e.relation !== 'supports' && /摂取|食事|絶食|体重|1回に食べられる/.test(by(m).get(e.source).label)), `${n}：食事摂取の流れ`);
  });
  // 低Alb は皮膚の血流低下の原因にしない（低栄養の四角から）
  assert.ok(!maps.hip_fracture.edges.some(e => /^Alb/.test(by(maps.hip_fracture).get(e.source).label) && /皮膚の血流低下/.test(by(maps.hip_fracture).get(e.target).label)));
  // 今ある所見（尿量 2400mL）は実線、脱水は予測。尿量の増加を予測の＋補足で重ねて描かない
  const hf = maps.heart_failure_long, hb = by(hf);
  const urine = hf.nodes.find(n => /^尿量は利尿薬投与後に増加/.test(n.label));
  assert.ok(urine.observed !== false && hf.edges.some(e => hb.get(e.source).label.startsWith('利尿薬') && e.target === urine.id && !e.predicted));
  assert.ok(!hf.nodes.some(n => n.added && /^尿量の増加/.test(n.label)));
  assert.ok(find(hf, /^低カリウム血症/).observed !== false, '低K血症は今ある所見');
  // 治療は「何に対する治療か」が線でわかる：オピオイド ┤ 創部痛、膀胱留置カテーテル ┤ 神経因性膀胱
  const colon = maps.colon_cancer_postop_long;
  assert.ok(colon.edges.some(e => e.relation === 'treats' && /^オピオイド/.test(by(colon).get(e.source).label) && /^創部痛/.test(by(colon).get(e.target).label)));
  const sci = maps.cervical_spinal_cord_injury;
  assert.ok(sci.edges.some(e => e.relation === 'treats' && /膀胱留置カテーテル/.test(by(sci).get(e.source).label) && /^神経因性膀胱/.test(by(sci).get(e.target).label)));
  // 誤嚥性肺炎の絶食に「腸が動き出すまで」の過程を入れない
  assert.ok(!maps.aspiration_pneumonia.nodes.some(n => /腸が動き出すまで/.test(n.label)));
  // 重複の統合：活動耐性低下と身体可動性障害が同じ記録だけから出ていたら1つにまとめる（排尿と排便などはまとめない）
  const toy = { nodes: [
    { id: 'f', type: 'symptom', label: '麻痺あり', observed: true, source: 'record' }, { id: 'm', type: 'pathophysiology', label: '体動の制限', source: 'knowledge' },
    { id: 'p1', type: 'nursing_problem', label: '身体可動性障害', priority: 1 }, { id: 'p2', type: 'nursing_problem', label: '活動耐性低下（動くと息切れ・体力の低下）', priority: 2 },
    { id: 'u', type: 'symptom', label: '3日間排便なし・排尿できず', observed: true, source: 'record' }, { id: 'p3', type: 'nursing_problem', label: '便秘', priority: 3 }, { id: 'p4', type: 'nursing_problem', label: '排尿障害（尿閉）', priority: 4 }],
    edges: [{ id: 'e1', source: 'f', target: 'm' }, { id: 'e2', source: 'm', target: 'p1' }, { id: 'e3', source: 'm', target: 'p2' }, { id: 'e4', source: 'u', target: 'p3' }, { id: 'e5', source: 'u', target: 'p4' }] };
  assert.equal(app.rmMergeDuplicateProblems(toy), 1);
  assert.deepEqual(plain(toy.nodes.filter(n => n.type === 'nursing_problem').map(n => n.label)), ['身体可動性障害', '便秘', '排尿障害（尿閉）']);
  // 並べ方：看護問題への最後の線を短くしても、線の交差は増やさない（増えるなら整えない並べ方を使う）
  names.forEach(n => {
    const m = maps[n];
    const plainMap = JSON.parse(JSON.stringify(m));
    app.layoutRelationMapOnce(plainMap, { balance: false });
    assert.ok(app.rmRouteEdges(m).bridges <= app.rmRouteEdges(plainMap).bridges, `${n}：交差が増えていない`);
  });
  assert.match(src, /cross\(plain\) < cross\(map\)/);
});

test('関連図：がんの手術は「精査・診断 → 病期の意味 → 手術の対象と目的」でなぜ手術をするかが分かる（胃がん）', () => {
  const text = fs.readFileSync(path.join(ROOT, 'tests/fixtures/relation-map/gastric_postop.txt'), 'utf8');
  const items = app.classifyTextByRules(text).map((i, k) => ({ ...i, id: 'it' + k }));
  const cp = { id: 'p1', title: 'A', sourceText: text, items, carePlans: {}, selectedDiagnosisIds: [], diagnosisCandidates: [] };
  const map = app.buildRelationMapFromRecord(cp);
  const by = re => map.nodes.find(n => re.test(n.label));
  const exam = by(/貧血を指摘.*精査/), disease = by(/^胃がん/), stage = by(/胃底部の腫瘍.*T2.*固有筋層.*N0.*M0/), aim = by(/手術の対象と目的/), surg = by(/胃全摘/);
  [exam, disease, stage, aim, surg].forEach(n => assert.ok(n));
  const has = (a, b) => map.edges.some(e => e.source === a.id && e.target === b.id);
  assert.ok(has(exam, disease) && has(disease, stage) && has(stage, aim) && map.edges.some(e => e.source === surg.id && e.target === aim.id && e.relation === 'treats'));
});
