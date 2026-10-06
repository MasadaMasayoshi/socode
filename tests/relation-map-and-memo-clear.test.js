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
  assert.ok(map.edges.some(e => e.source === surg.id && e.target === ca.id && e.relation === 'treats'));
  assert.ok(map.edges.some(e => e.source === pca.id && e.target === pain.id && e.relation === 'treats'));
  assert.ok(!map.edges.some(e => map.edges.some(o => o.source === e.target && o.target === e.source)), '両向きの矢印は無い');
  const svg = app.relationMapSvg(map, {});
  assert.match(svg, /<ellipse class="rm-box"/);
  assert.match(svg, /stroke="#2563EB"[^>]*marker-end="url\(#rm-arrow-blue\)"/); // 治療 → 対象 は青
  assert.match(svg, /（WBC 11600\/μL↑）/); // 検査データは（ ）
});

test('関連図：術後のWBC・CRPは感染と断定せず、手術侵襲による炎症反応との見分けとして示す', () => {
  const map = app.buildRelationMapFromRecord(patientOf(GASTRIC));
  const inflam = find(map, /手術侵襲による炎症反応（感染との見分けが必要）/);
  const wbc = find(map, /^WBC/);
  assert.ok(hasEdge(map, wbc, inflam));
  const inf = find(map, /感染などの可能性/);
  assert.equal(inf.observed, false);
  assert.ok(!map.nodes.some(n => n.observed !== false && /^(?:創部感染|感染症)$/.test(n.label)));
});

test('関連図：看護問題は右端・#の優先順位の順に上から並び、すべてに根拠の道筋がある。浮島は無い', () => {
  const map = app.buildRelationMapFromRecord(patientOf(GASTRIC));
  const probs = map.nodes.filter(n => n.type === 'nursing_problem').sort((a, b) => a.priority - b.priority);
  assert.deepEqual(plain(probs.map(p => p.priority)), plain(probs.map((p, i) => i + 1)));
  assert.ok(probs.length >= 5, probs.map(p => p.label).join(' / '));
  assert.deepEqual(plain(probs.map(p => app.rmProblemCategory(p.label).key)), ['resp', 'inf', 'pain', 'nutr', 'act', 'anx']);
  // 2026-10-06.17：利用者から「前のほうがよかった」。看護問題は右端にそろえる（一覧はボタンで開く）
  const maxX = Math.max(...map.nodes.filter(n => n.type !== 'nursing_problem' && !n.attachTo).map(n => n.x));
  probs.forEach(p => assert.ok(p.x > maxX, '看護問題は右端'));
  assert.equal(new Set(probs.map(p => p.x)).size, 1, '看護問題は1つの列にそろえる');
  for (let i = 1; i < probs.length; i++) assert.ok(probs[i].y > probs[i - 1].y, '重要な問題ほど上');
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
  assert.ok(find(map, /脱水・電解質異常/).observed === false);
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
  assert.match(d, / A5,5 0 0 1 /);
  assert.match(app.relationMapSvg(m, {}), / A5,5 0 0 1 /);
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
  assert.match(src, /printHtmlDocument\(relationMapPrintHtml\(cp, map\), \{ keepSvg: true \}\)/);
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
  assert.ok(probs.length >= 4 && probs.length <= 8, `${label}：看護問題 ${probs.length}`);
  // 不安の言葉は、同じカードの別の文（「…」）を使うことがあるので重複の確認から外す
  const ids = new Set(); map.nodes.forEach(n => n.itemIds.forEach(id => { if ((n.type === 'symptom' || n.type === 'patient_fact') && !/不安の言動）$/.test(n.label)) { assert.ok(!ids.has(id), `${label}：同じカードが2つの四角に`); ids.add(id); } }));
  map.edges.filter(e => e.relation === 'treats').forEach(e => assert.equal(map.nodes.find(n => n.id === e.source).type, 'treatment'));
  map.nodes.filter(n => n.type === 'future_risk').forEach(n => assert.equal(n.observed, false));
}

test('事例1（大腿骨頸部骨折・人工骨頭置換術・84歳）：DVT・褥瘡・せん妄・脱臼・骨粗鬆症からの骨折の成り立ち', () => {
  const map = caseMap('hip_fracture');
  commonChecks(map, '事例1');
  const probs = probLabels(map);
  ['深部静脈血栓症', '皮膚統合性障害（褥瘡）', '急性混乱（術後せん妄）', '人工骨頭の脱臼', '急性疼痛', '感染リスク'].forEach(w => assert.ok(probs.some(p => p.includes(w)), `${w} / ${probs.join('、')}`));
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
  assert.deepEqual(plain(probs.slice(0, 4)), ['非効果的気道浄化', 'ガス交換障害', '誤嚥リスク状態', '体液量不足（脱水）']);
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
  ['誤嚥リスク状態', '出血リスク状態', '血糖不安定リスク状態', '転倒転落リスク状態', '言語的コミュニケーション障害', 'セルフケア不足'].forEach(w => assert.ok(probs.some(p => p.includes(w)), `${w} / ${probs.join('、')}`));
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

test('関連図の見やすさ：看護問題ごとの帯・丸めた曲がり角・選んだ四角の流れだけを濃く・カードの文は要点だけ', () => {
  const map = caseMap('hip_fracture');
  assert.ok(map.bands.length >= 5, '看護問題ごとの帯');
  const svg = app.relationMapSvg(map, {});
  assert.match(svg, /<rect class="rm-band/);
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
  assert.match(src, /factor === 'fit' \? 0\.25 : 0\.85/);
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
  return map.edges.filter(e => e.relation !== 'treats' && ['treatment', 'disease', 'patient_fact'].includes(byId.get(e.source).type) && ['symptom', 'nursing_problem', 'future_risk'].includes(byId.get(e.target).type));
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
  ['術後呼吸器合併症', '深部静脈血栓症', '感染リスク', '血糖不安定', '急性疼痛', '栄養摂取量不足', 'セルフケア不足', '便秘リスク'].forEach(w => assert.ok(probs.some(p => p.includes(w)), `${w} / ${probs.join('、')}`));
  const il = find(map, /^腸の動き（蠕動運動）の低下/), opi = find(map, /^オピオイド（フェンタニル）/);
  assert.ok(hasEdge(map, opi, il) && hasEdge(map, find(map, /^体動の制限/), il));
  assert.ok(linked(map, il, find(map, /^腹部膨満あり/)) && find(map, /術後イレウス/).observed === false);
  assert.ok(find(map, /^術後の安静による静脈血のうっ滞/), '腹部の手術で「下肢の手術」と書かない');
  assert.ok(!map.nodes.some(n => /下肢の手術/.test(n.label)));
  assert.ok(hasEdge(map, find(map, /インスリン作用の不足による高血糖/), find(map, /免疫機能・創傷治癒の低下/)), '高血糖 → 免疫・創傷治癒');
  assert.ok(!map.nodes.some(n => /腹部・胸部に力/.test(n.label)) === false, '腹部の手術では腹部の痛みの過程を補う');
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
  assert.ok(asp.nodes.some(m => m.added && /炎症で消費エネルギーが増え/.test(m.label)), '肺炎→炎症で消費エネルギーが増える→栄養状態の低下');
  const copd = beforeAfter('copd_exacerbation_long').after;
  assert.ok(addedBetween(copd, find(copd, /^気道・肺胞への慢性的な刺激/), find(copd, /COPD/), /肺気腫/), '喫煙の刺激→気道の炎症と肺胞の壊れ→COPD');
  assert.ok(linked(copd, find(copd, /^末梢気道の閉塞/), find(copd, /^CO2の貯留/)), '気道閉塞→CO2の貯留は今までどおり');
  assert.ok(!copd.nodes.some(m => m.added && /心臓に戻る血液/.test(m.label)), 'COPDの起座呼吸に心不全の過程を入れない');
  const colon = beforeAfter('colon_cancer_postop_long').after;
  assert.ok(colon.nodes.some(m => m.added && /交感神経の緊張と腸の炎症/.test(m.label)), '手術侵襲→交感神経の緊張・腸の炎症→腸の動きの低下');
  assert.ok(colon.nodes.some(m => m.added && /ウィルヒョウ/.test(m.label)), '手術侵襲→ウィルヒョウの3つの要因→静脈血のうっ滞');
  // 新しい知識で四角が増えすぎない（上限60個を超えない）
  [hf, asp, copd, colon].forEach(m => assert.ok(m.nodes.length <= 60, String(m.nodes.length)));
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
  assert.match(src, /else if \(act === 'toggle-problems'\) rmSetProblemsOpen\(!rmState\.problemsOpen\);/);
  assert.match(src, /else if \(act === 'goto-problem'\)/);
  assert.match(src, /data-rm-action="goto-problem" data-node-id=/);
});
