'use strict';
// 【レビューで発見】AIの結果の読み取り・まとめて実行・書き出し・検査値の推移の不具合の確認
// （js/06・js/08・js/12・js/13）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadApp, readAppSource, APP_SCRIPT_FILES } = require('./app-helpers');

const ROOT = path.join(__dirname, '..');
const app = loadApp();
const src = readAppSource();
const plain = x => JSON.parse(JSON.stringify(x));

// グローバルの関数を差し替えたり、画面の要素の中身を見たりしたいテスト用に、同じ順番でファイルを読み込んだ環境を作る
function stubEl() {
  return {
    value: '', innerHTML: '', textContent: '', checked: false, disabled: false,
    addEventListener() {}, removeEventListener() {}, style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild() {}, append() {}, removeChild() {}, replaceChildren() {}, insertBefore() {}, insertAdjacentHTML(pos, h) { this.innerHTML = h + this.innerHTML; },
    contains() { return false; }, hasAttribute() { return false; }, removeAttribute() {},
    scrollIntoView() {}, getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    setAttribute() {}, getAttribute() { return null; }, click() {}, focus() {}, blur() {}, closest() { return null; }, remove() {}
  };
}
function loadSandbox(geminiReplies = []) {
  const els = {};
  const calls = [];
  const sb = { console };
  sb.window = sb;
  sb.document = {
    getElementById(id) { return els[id] || (els[id] = stubEl()); },
    addEventListener() {}, removeEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    createElement() { return stubEl(); }, createDocumentFragment() { return stubEl(); },
    documentElement: { getAttribute() { return null; }, setAttribute() {}, classList: { add() {}, remove() {} }, style: {} },
    body: stubEl(), visibilityState: 'visible'
  };
  sb.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  sb.sessionStorage = sb.localStorage;
  sb.fetch = async (url, opts) => {
    if (!String(url).includes('generativelanguage')) return { ok: true, status: 200, json: async () => ([]), text: async () => '' };
    calls.push(JSON.parse(opts.body));
    const r = geminiReplies.shift();
    const data = typeof r === 'string' ? { candidates: [{ content: { parts: [{ text: r }] }, finishReason: 'STOP' }] } : (r || { candidates: [] });
    return { ok: true, status: 200, json: async () => data };
  };
  sb.setInterval = () => 0; sb.setTimeout = () => 0; sb.clearInterval = () => {}; sb.clearTimeout = () => {};
  sb.navigator = { onLine: true, clipboard: { writeText: async () => {} } };
  sb.location = { href: '', search: '', reload() {} };
  sb.history = { replaceState() {}, pushState() {} };
  sb.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  sb.requestAnimationFrame = () => 0; sb.alert = () => {}; sb.confirm = () => true;
  sb.addEventListener = () => {}; sb.removeEventListener = () => {};
  sb.URL = { createObjectURL: () => '', revokeObjectURL() {} };
  sb.Blob = function Blob() {};
  sb.FileReader = function FileReader() { this.readAsText = () => {}; };
  sb.module = { exports: {} };
  vm.createContext(sb);
  APP_SCRIPT_FILES.forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f }));
  const run = code => vm.runInContext(code, sb);
  run(`globalThis.__toasts = []; showToast = (m, t) => { __toasts.push([t, typeof m === 'string' ? m : JSON.stringify(m)]); };`);
  return { sb, els, calls, run };
}
// 起動の処理（共有カルテの読み込み → 画面の読み直し）が終わるのを待つ（終わる前に試すと、後から画面が描き直される）
const settle = async () => { for (let k = 0; k < 30; k++) await new Promise(r => setImmediate(r)); };
const PATIENT_ITEMS = `[
  {id:'i1',type:'o',text:'SpO2 90%',timestamp:'入院1日目',hendersonIds:[1],assessmentCols:{1:'postadmission'}},
  {id:'i2',type:'s',text:'「息が苦しい」',timestamp:'入院1日目',hendersonIds:[1],assessmentCols:{1:'postadmission'}},
  {id:'i3',type:'o',text:'自宅で独歩',timestamp:'入院前',hendersonIds:[4],assessmentCols:{4:'preadmission'}}]`;
function setPatient(run, extra = '') {
  run(`globalAppData.apiKey='AIzaSyA1234567890123456789012345678901234';
    globalAppData.patients=[{id:'p1',title:'A',referenceNotes:[],items:${PATIENT_ITEMS}${extra}}];
    globalAppData.currentPatientId='p1';`);
}

test('BMI・ブリンクマン指数の自動カード：薬の本数と別の話の年数を組み合わせない・非喫煙なら作らない・「1日20本を30年間」を読む', () => {
  const { run } = loadSandbox();
  const brinkman = texts => {
    run(`globalAppData.patients=[{id:'p1',title:'A',referenceNotes:[],items:${JSON.stringify(texts.map((t, i) => ({ id: 'b' + i, type: 'o', text: t })))}}];globalAppData.currentPatientId='p1';`);
    run('calculateAndAddDerivedMetricCards()');
    return plain(run("getCurrentPatient().items.filter(i => i.timestamp === 'AI算出').map(i => i.text)"));
  };
  assert.deepEqual(brinkman(['ラシックス 2本/日 点滴', '5年前に胃がん手術']), []);
  assert.deepEqual(brinkman(['喫煙歴なし', '輸液 3本/日、2年前から糖尿病']), []);
  assert.deepEqual(brinkman(['非喫煙者', '喫煙：20本/日×30年（家族）']), []);
  const ok = brinkman(['喫煙：1日20本を30年間']);
  assert.equal(ok.length, 1);
  assert.match(ok[0], /ブリンクマン指数 600/);
});

test('AIの看護計画の読み取り：「TPN…」「目標SpO2…」を見出しと読まない・「1. ■…」「看護問題2：…」も別の看護問題にする', () => {
  const plans = plain(app.parseCarePlanText([
    '■非効果的気道浄化', '目標', '3日後までに痰を自己喀出できる', 'OP（観察計画）', '呼吸音を観察する', 'TPN刺入部の発赤を観察する', '目標SpO2 94%以上を保てているか観察する',
    'TP（援助計画）', '体位ドレナージを行う', 'EP', '深呼吸の方法を説明する',
    '1. ■急性疼痛', '目標：NRS3以下', 'OP', '疼痛を観察する',
    '看護問題3：転倒転落リスク状態', 'TP：ベッド柵を確認する'
  ].join('\n')));
  assert.deepEqual(plans.map(p => p.problem), ['非効果的気道浄化', '急性疼痛', '転倒転落リスク状態']);
  assert.deepEqual(plans[0].op, ['呼吸音を観察する', 'TPN刺入部の発赤を観察する', '目標SpO2 94%以上を保てているか観察する']);
  assert.deepEqual(plans[0].tp, ['体位ドレナージを行う']);
  assert.equal(plans[0].goalShort, '3日後までに痰を自己喀出できる');
  assert.deepEqual(plans[1].op, ['疼痛を観察する']);
  assert.deepEqual(plans[2].tp, ['ベッド柵を確認する']);
  // AIの答え（マークダウン）→ 表示用HTML → 文字 → 読み取り、の流れでも同じ
  const html = app.formatAiResultHtml('### 要点\n- 気道浄化\n### ■非効果的気道浄化\n#### 目標\n1. 痰を出せる\n#### OP（観察計画）\n1. TPN刺入部を観察する\n### 1. ■急性疼痛\n#### OP（観察計画）\n1. NRSを観察する');
  const p2 = plain(app.parseCarePlanText(app.htmlToPlainText(html)));
  assert.deepEqual(p2.map(p => p.problem), ['非効果的気道浄化', '急性疼痛']);
  assert.deepEqual(p2[0].op, ['TPN刺入部を観察する']);
  assert.deepEqual(p2[0].tp, []);
});

test('看護診断候補の読み取り：「### ■ 診断名」「1. ■ 診断名」「■看護診断名：…」も候補にする', () => {
  const names = t => plain(app.parseDiagnosisCandidates(t).map(c => c.name));
  assert.deepEqual(names('### ■ 非効果的気道浄化\n根拠：x\n\n### ■ 急性疼痛\n根拠：y'), ['非効果的気道浄化', '急性疼痛']);
  assert.deepEqual(names('1. ■ 非効果的気道浄化\n根拠：x\n2. ■ 急性疼痛'), ['非効果的気道浄化', '急性疼痛']);
  assert.deepEqual(names('■看護診断名：非効果的気道浄化\n根拠：x'), ['非効果的気道浄化']);
  assert.equal(app.parseDiagnosisCandidates('形式が違う答え').length, 0);
});

test('不足情報のAIの答え（JSON）：前後の説明・```json・{"items":[…]} があっても読める。読めなければ null', () => {
  const p = t => plain(app.parseAiJsonArray(t, ['items']));
  assert.deepEqual(p('[{"hendersonId":1,"text":"原因: a"}]\n\n※[参考] 優先度順です'), [{ hendersonId: 1, text: '原因: a' }]);
  assert.deepEqual(p('以下の通りです [JSON形式]:\n[{"hendersonId":2,"text":"原因: b"}]'), [{ hendersonId: 2, text: '原因: b' }]);
  assert.deepEqual(p('```json\n{"items":[{"hendersonId":3,"text":"原因: c [注]"}]}\n```'), [{ hendersonId: 3, text: '原因: c [注]' }]);
  assert.equal(app.parseAiJsonArray('JSONではありません'), null);
  assert.match(src, /callGeminiAI\(\[\{ role: "user", parts: \[\{ text: prompt \}\] \}\], \{ json: true \}\)/);
});

test('不足情報のAI推定：null や文字列だけの要素は飛ばし、JSONの答えを指定して頼む', async () => {
  const { run, calls } = loadSandbox(['[null,"x",{"hendersonId":1,"text":"原因: SpO2の推移がない → 安静時と労作時のSpO2を確かめる"},{"hendersonId":99,"text":"原因: z"}]\n※[補足]']);
  setPatient(run);
  await run('evaluateMissingInfoAI()');
  assert.equal(calls[0].generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(plain(run("getCurrentPatient().items.filter(i => i.timestamp === 'AI推定').map(i => i.hendersonIds[0])")), [1]);
  assert.ok(run("getCurrentPatient().aiRunAt.missing"));
});

test('不足情報の簡易チェック（APIキーなし）：押すたびに同じカードが増えない', async () => {
  const { run } = loadSandbox();
  run(`requireApiKey = async () => 'fallback'; globalAppData.apiKey='';
    globalAppData.patients=[{id:'p1',title:'A',referenceNotes:[],items:[
      {id:'i1',type:'o',text:'胃がん 幽門側胃切除術後',timestamp:'術後1日目',hendersonIds:[1],assessmentCols:{1:'postadmission'}},
      {id:'i3',type:'o',text:'自宅で独歩',timestamp:'入院前',hendersonIds:[4],assessmentCols:{4:'preadmission'}}]}];
    globalAppData.currentPatientId='p1';`);
  const count = () => run("getCurrentPatient().items.filter(i => i.timestamp === 'AI推定').length");
  await run('evaluateMissingInfoAI()');
  const first = count();
  assert.ok(first >= 5, `胃がんの術後の観察項目などを提案する: ${first}`);
  await run('evaluateMissingInfoAI()');
  await run('evaluateMissingInfoAI()');
  assert.equal(count(), first);
});

test('検査値の推移：「P 3.5 mg/dL」はリンの行にし、脈拍をリンの基準値で判定しない', () => {
  const t = app.buildLabTrendTable([
    { id: 'a', type: 'o', text: 'P 3.5 mg/dL (基準値: 2.5〜4.5)', timestamp: '入院時' },
    { id: 'b', type: 'o', text: 'HR 72回/分', timestamp: '入院時 10:00' },
    { id: 'c', type: 'o', text: '脈拍 88回/分', timestamp: '入院2日目' }
  ]);
  const pulse = t.rows.find(r => r.key === '脈拍');
  assert.equal(pulse.ref, '60〜100');
  assert.deepEqual(plain(Object.values(pulse.cells).flat().map(c => c.flag)), ['', '']);
  assert.ok(t.rows.find(r => r.key === 'P(リン)'));
});

test('検査値の推移：値ごとに、そのカードの基準値→行の基準値の順に使い、単位が違えば換算する（換算できなければ印を付けない）', () => {
  const flags = items => {
    const t = app.buildLabTrendTable(items);
    return plain(Object.fromEntries(t.rows.flatMap(r => Object.entries(r.cells).map(([k, v]) => [`${r.key}@${k}`, v.map(x => x.value + (x.flag ? `:${x.flag}` : ''))]))));
  };
  const wbc = flags([
    { id: 'a', type: 'o', text: 'WBC 8100 /μL (基準値: 3300〜8600)', timestamp: '入院時' },
    { id: 'b', type: 'o', text: 'WBC 12.5 ×10^3/μL', timestamp: '入院3日目' }
  ]);
  assert.deepEqual(wbc['WBC@入院時'], ['8100']);
  assert.deepEqual(wbc['WBC@入院3日目'], ['12.5:high']);
  const own = flags([
    { id: 'a', type: 'o', text: 'Hb 14.0 g/dL (基準値: 13.5〜17.6)', timestamp: '入院時' },
    { id: 'b', type: 'o', text: 'Hb 12.0 g/dL (基準値: 11.3〜15.2)', timestamp: '入院3日目' }
  ]);
  assert.deepEqual(own['Hb@入院3日目'], ['12.0'], 'そのカードに書かれた基準値で判定する');
  const odd = flags([
    { id: 'a', type: 'o', text: 'CRP 0.2 mg/dL (基準値: 0〜0.3)', timestamp: '入院時' },
    { id: 'b', type: 'o', text: 'CRP 5 mmol/L', timestamp: '入院3日目' }
  ]);
  assert.deepEqual(odd['CRP@入院3日目'], ['5'], '換算できない単位は判定しない');
});

test('看護計画までまとめて実行：看護計画はAIなしで記録から自動で作り、AIは評価だけに使う（診断候補の答えが空なら途中で止まる）', async () => {
  const { run, calls } = loadSandbox(['[]', '', '']);
  setPatient(run);
  await run('runAiPipelineToCarePlan()');
  assert.equal(run('window.aiPipelineStatus.running'), false);
  assert.deepEqual(plain(run('carePlanList(getCurrentPatient())')), [], '診断候補が作れなかったので、計画の自動作成まで進まない');
  assert.ok(plain(run('__toasts')).some(([t, m]) => t === 'warn' && /看護診断候補を作れなかった/.test(m)));
  assert.ok(calls.length <= 2, 'AIで看護計画を作る依頼は出さない');
});

test('看護計画まとめて実行：診断候補のあと、計画を自動作成し、AIには評価を依頼する（作る依頼は出さない）', async () => {
  const { run, calls } = loadSandbox(['```json\n[]\n```', '### ■ ガス交換障害\n根拠：SpO2低下〔C1〕\n\n### ■ 活動耐性低下\n根拠：x', '{"plans":[]}']);
  setPatient(run);
  await run('runAiPipelineToCarePlan()');
  assert.deepEqual(plain(run('getCurrentPatient().diagnosisCandidates.map(c => c.name)')), ['ガス交換障害', '活動耐性低下']);
  assert.ok(run('carePlanList(getCurrentPatient()).length') > 0, '記録から看護計画が自動で作られる');
  assert.ok(run('carePlanList(getCurrentPatient()).every(p => p.source === "rules" || p.source === "map")'));
  assert.equal(calls.length, 3, '①不足情報・②診断候補・③計画の評価の3回だけ');
  assert.equal(run('getCurrentPatient().carePlanResult'), undefined);
});

test('AIのボタンを続けて押しても、同じ患者・同じ機能の依頼は1つだけ走る。まとめて実行の途中は①②③を押せない', async () => {
  const { run, calls, els } = loadSandbox(['■ ガス交換障害\n根拠：x', '■ ガス交換障害\n根拠：x']);
  setPatient(run);
  const a = run('suggestNursingDiagnosesAI()');
  const b = run('suggestNursingDiagnosesAI()');
  await Promise.all([a, b]);
  assert.equal(calls.length, 1);
  assert.equal(run("isAiStepRunning(getCurrentPatient(), 'diagnosis')"), false, '終わったら実行中の印を外す');
});

test('AIの失敗：結果の欄にエラーを出しつつ、前の結果も残す（保存してある結果は書き換えない）', async () => {
  const { run, els } = loadSandbox([{ candidates: [] }]);
  await settle();
  setPatient(run, `, timelineResult: '<div class="ai-text"><p>前のサマリー</p></div>'`);
  await run('generateTimelineSummaryAI()');
  assert.equal(run('getCurrentPatient().timelineResult'), '<div class="ai-text"><p>前のサマリー</p></div>');
  assert.match(els['timeline-content'].innerHTML, /エラーが発生しました[\s\S]*前の結果(?:を|は)そのまま残しています[\s\S]*前のサマリー/);
});

test('書き出し（テキスト・PDF）に、自分で立てた看護計画と実施・評価の記録を載せる', () => {
  const cp = { id: 'p1', title: 'A', items: [], referenceNotes: [] };
  const plan = app.createCarePlan(cp, { problem: '急性疼痛', goalShort: 'NRS3以下', op: ['疼痛の程度'], tp: ['体位の工夫'], ep: [] });
  app.addCareRecord(cp, plan.id, { at: '2026-09-29T05:00:00.000Z', doneText: '体位を整えた', response: '楽になった', achievement: 'partial', evaluation: 'NRS4' });
  const text = app.buildExportPlainText(cp);
  assert.match(text, /【看護計画と実施・評価】[\s\S]*#1 急性疼痛[\s\S]*短期目標：NRS3以下[\s\S]*OP1\. 疼痛の程度[\s\S]*実施内容：体位を整えた[\s\S]*評価：NRS4/);
  const html = app.buildExportBodyHtml(cp);
  assert.match(html, /看護計画と実施・評価<\/h2>[\s\S]*#1 急性疼痛[\s\S]*患者の反応：楽になった/);
});

test('印刷・PDF：保存されたAIの結果の動く部品は入れない。IDは onclick に入れる前に形を確かめる', () => {
  const cp = { id: 'p1', title: 'A<&>"', items: [], carePlanResult: '<p>計画</p><img src=x onerror="alert(1)"><script>alert(2)</script>', carePlanDiagnoses: ['急性疼痛'],
    diagnosisCandidates: [{ id: 'dx_1', name: '急性疼痛', bodyHtml: '<b onmouseover="alert(3)">根拠</b>' }], selectedDiagnosisIds: ['dx_1'] };
  const html = app.buildPrintAiSectionsHtml(cp, 1);
  assert.doesNotMatch(html, /onerror|onmouseover|<script|alert\(/);
  assert.match(html, /選んだ看護診断：<\/b>急性疼痛/);
  assert.match(app.buildAssessmentPrintHtml(cp), /<title>A&lt;&amp;&gt;&quot;_総合アセスメント表<\/title>/);
  assert.equal(app.safeDomId("x');alert(1);//"), '');
  assert.equal(app.safeDomId('item_123_ab'), 'item_123_ab');
  const card = app.carePlanCardHtml({ items: [] }, { id: "p');alert(1);//", problem: 'x', relatedNeeds: [], records: [], status: 'active', op: [], tp: [], ep: [] }, 0, 1);
  assert.doesNotMatch(card, /alert\(1\)/);
  // 印刷の見本（スマホ）でも、文書の中の動く部品を取り除いてから画面に入れる
  assert.match(src, /stripActivePrintContent\(parsed\.body, \{ keepSvg: !!options\.keepSvg \}\);/);
});

test('手で編集した履歴：AIの分類の評価で適用した編集を、内部の名前ではなく内容で書き出す', () => {
  assert.match(app.formatEditLogEntry({ kind: 'aiReviewTags', from: [1], to: [1, 9] }), /AIの評価でタグを変更: 1\.[^→]*→ 1\.[^・]*・9\./);
  assert.match(app.formatEditLogEntry({ kind: 'aiReviewTimestamp', from: '12:00', to: '術後1日目 12:00' }), /AIの評価で日時を変更: 12:00 → 術後1日目 12:00/);
  assert.match(app.formatEditLogEntry({ kind: 'aiReviewType', from: 'o', to: 's' }), /AIの評価で分類を変更: Oデータ → Sデータ/);
  assert.doesNotMatch(app.formatEditLogEntry({ kind: 'aiReview', from: ['a', 'b'] }), /^aiReview$/);
});

test('テキストの保存は、リンクをページに追加してから押す（書き出し・提出用の書き出し）。分類の評価は頼んだ患者に保存する', () => {
  const exp = fs.readFileSync(path.join(ROOT, 'js/06-export.js'), 'utf8');
  const rep = fs.readFileSync(path.join(ROOT, 'js/13-compare-and-report.js'), 'utf8');
  assert.match(exp, /function downloadTextBlob\(blob, filename\) \{[\s\S]*document\.body\.appendChild\(a\);[\s\S]*a\.remove\(\);[\s\S]*revokeObjectURL/);
  assert.match(exp, /downloadTextBlob\(blob, `\$\{safeTitle\}_看護アセスメント\.txt`\)/);
  assert.match(rep, /downloadTextBlob\(blob, `/);
  assert.match(src, /finishAiResult\(cp, \(\) => renderAiReview\(\), '分類の評価'\)/);
});
