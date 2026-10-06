'use strict';
// 長い事例（心不全・121枚）で、実装されているAI機能をすべて動かして評価したときに見つかった問題の確認
// （AIの答えは、AIがよく返す崩れた形を模擬したもの。本物のAPIキーは使わない）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp, readAppSource } = require('./app-helpers');
const ROOT = path.join(__dirname, '..');
const app = loadApp();
const src = readAppSource();
const plain = v => JSON.parse(JSON.stringify(v));
const HF = fs.readFileSync(path.join(ROOT, 'tests/golden/cases/心不全_B氏82歳_架空.txt'), 'utf8');

test('AIのJSON：```json の囲み・前置き・最後の余分な「,」があっても読める', () => {
  const v = app.parseAiJsonLoose('以下が不足情報です。\n```json\n[{"hendersonId":1,"text":"a"},\n{"hendersonId":2,"text":"b"},\n]\n```');
  assert.equal(v.length, 2);
  assert.equal(app.parseAiJsonArray('説明\n```json\n[{"hendersonId":3,"text":"c"},]\n```').length, 1);
});

test('AIのJSON：答えが途中で切れたときは、閉じ終わった所までを読み、途中切れだと分かる', () => {
  const r = app.parseAiJsonLooseInfo('[{"text":"a"},{"text":"b"},{"text":"途中');
  assert.equal(r.truncated, true);
  assert.deepEqual(plain(r.value.map(x => x.text)), ['a', 'b']);
  assert.equal(app.parseAiJsonLoose('説明 [JSON形式] です'), undefined);
});

test('関連図のAI：崩れたJSON（囲み・最後の「,」）でも読み取れる', () => {
  const obj = app.rmParseAiJsonObject('関連図です\n```json\n{"n":[{"i":"n1","t":"disease","l":"心不全"},{"i":"n2","t":"symptom","l":"息切れ"},],"e":[{"s":"n1","d":"n2","r":"causes"},]}\n```\n補足：…');
  assert.equal(obj.n.length, 2);
  assert.equal(obj.e.length, 1);
});

test('看護診断候補：「■」が無く「## 1. **診断名**」「1. 診断名」の見出しで返っても候補を読める', () => {
  const a = app.parseDiagnosisCandidates('候補は次のとおりです。\n\n## 1. **心拍出量減少**\n根拠：EF 35%〔C55〕\n理由：…\n\n## 2. **活動耐性低下**\n根拠：歩行でSpO2低下\n理由：…');
  assert.deepEqual(plain(a.map(c => c.name)), ['心拍出量減少', '活動耐性低下']);
  const b = app.parseDiagnosisCandidates('1. 非効果的健康自主管理\n根拠：自己判断で中断\n理由：…');
  assert.deepEqual(plain(b.map(c => c.name)), ['非効果的健康自主管理']);
  // 「■」の形は今までどおり
  assert.deepEqual(plain(app.parseDiagnosisCandidates('■ 活動耐性低下\n根拠：…').map(c => c.name)), ['活動耐性低下']);
});

test('看護診断候補：読み取れなかったときは、前の候補と選んだチェックを消さない', () => {
  assert.match(src, /if \(!cands\.length && \(cp\.diagnosisCandidates \|\| \[\]\)\.length\) throw new Error/);
});

test('看護計画の取り込み：最初の「要点」の「#1 …」を、中身の無い看護計画として取り込まない', () => {
  const text = `要点
#1 活動耐性低下：労作時のSpO2低下に合わせて活動量を調整する。
#2 非効果的健康自主管理：服薬・塩分・体重測定を続けられるよう支援する。

■活動耐性低下
目標
1. 3日後までに病棟内を100m歩いてもSpO2 93%以上を保てる。
OP（観察計画）
1. 活動の前後のSpO2を測る。
TP（援助計画）
1. 清拭は休憩をはさむ。
EP（教育計画）
1. 息切れを感じたら休むよう説明する。

■非効果的健康自主管理
目標
1. 退院までに利尿薬の目的を言える。
OP（観察計画）
1. 服薬の発言を確かめる。`;
  const plans = app.parseCarePlanText(text);
  assert.deepEqual(plain(plans.map(p => p.problem)), ['活動耐性低下', '非効果的健康自主管理']);
  assert.equal(plans[0].op.length, 1);
  // 「#1 …」の見出しだけで書かれた計画（要点が無い）は今までどおり読む
  assert.deepEqual(plain(app.parseCarePlanText('#1 転倒リスク\nOP：\n1. ふらつきを観察する').map(p => p.problem)), ['転倒リスク']);
});

test('関連図のAI：長い記録でも、EF・心胸比・K・Cre・ALB・水泡音と、悪化のきっかけ（塩分・服薬の中断）・喫煙を送る', () => {
  const items = app.classifyTextByRules(HF).map((i, k) => ({ ...i, id: `it${k}` }));
  const prompt = app.buildRelationMapPrompt({ id: 'p1', title: 'B氏', sourceText: HF, items, carePlans: {}, selectedDiagnosisIds: [], diagnosisCandidates: [] });
  ['EF\\)?35%', '心胸比62%', 'K 3\\.8', 'Cre 1\\.35', 'ALB 3\\.3', '水泡音聴取', '塩分制限\\(6g\\/日\\)を指導されていたが守れていない', '自己判断で飲まなかった', 'タバコ 20本'].forEach(re => assert.match(prompt, new RegExp(re), re));
});

test('検査値の評価・不足情報の推定には、基準ノートの第1〜4章（カードの作り方・タグ付け）を送らない', () => {
  const full = app.buildEffectiveNotebookContent();
  const short = app.buildAssessmentNotebookContent();
  assert.ok(short.length < full.length * 0.7, `${short.length} / ${full.length}`);
  assert.doesNotMatch(short, /第1章 情報カードの作り方/);
  assert.match(short, /第5章 アセスメントの考え方/);
  assert.match(short, /第7章 疾患別の判断基準/);
  assert.equal((src.match(/buildAssessmentNotebookContent\(\)\}/g) || []).length, 2);
});

test('AIの答えが途中で切れたこと（MAX_TOKENS）を知らせる・AIでの分類が読み取れないときはルールで分類したと知らせる', () => {
  assert.match(src, /finish === 'MAX_TOKENS'/);
  assert.match(src, /AIの答えが長すぎて、ここで途中で切れています/);
  assert.match(src, /AIの答えを読み取れなかったため、AIなし（ルール）で分類しました/);
  assert.match(src, /callGeminiAI\(\[\{ role: "user", parts: \[\{ text: prompt \}\] \}\], \{ json: true, quietTruncation: true \}\)/);
});

test('関連図の「間の過程をAIで考える」：steps が1つの文字（「A、B」）で返っても過程として入れる', () => {
  assert.match(src, /typeof obj\.steps === 'string' \? obj\.steps\.split\(/);
});
