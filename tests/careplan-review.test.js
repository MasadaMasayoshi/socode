'use strict';
// 看護計画の評価（2026-10-07.5）：「計画をチェック」（AIなし）・「AIで看護計画を評価」・関連図からの引き継ぎ・
// 「この患者に必要な理由」を書いてから使う学習の支え
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
const clone = v => JSON.parse(JSON.stringify(v));

function stomaPatient() {
  const text = fs.readFileSync(path.join(ROOT, 'tests/fixtures/relation-map/rectal_cancer_stoma.txt'), 'utf8');
  const items = app.classifyTextByRules(text).map((i, k) => ({ ...i, id: `it${k}` }));
  const cp = { id: 'p1', title: 'C氏', sourceText: text, items, carePlans: {}, selectedDiagnosisIds: [], diagnosisCandidates: [] };
  cp.relationMap = app.buildRelationMapFromRecord(cp);
  return cp;
}
const item = (r, key) => r.items.find(i => i.key === key);

test('計画をチェック：「痛みが軽減する」「バイタルサインを観察する」「安楽な体位にする」を7項目で指摘する', () => {
  const cp = stomaPatient();
  const p = app.createCarePlan(cp, { problem: '急性疼痛', goalShort: '痛みが軽減する', op: ['バイタルサインを観察する'], tp: ['安楽な体位にする'] });
  const r = app.reviewCarePlan(cp, p);
  assert.deepEqual(clone(r.items.map(i => i.key)), ['fit', 'goal', 'op', 'tp', 'ep', 'individual', 'evidence']);
  const goal = item(r, 'goal');
  assert.equal(goal.level, 'warn');
  assert.ok(goal.msgs.includes('目標が抽象的です。いつまでに・どの程度まで改善するかを設定してみてください'));
  assert.ok(goal.msgs.some(m => /いつまでに/.test(m)) && goal.msgs.some(m => /何をもって達成と判断する/.test(m)));
  // 目標の例は、この患者の記録の値（NRS 5）を使う
  assert.equal(goal.example, '2日後までに、安静時の創部痛がNRS5からNRS3以下となり、苦痛なく休息できる');
  const op = item(r, 'op');
  assert.match(op.msgs[0], /^急性疼痛の計画ですが、OPに「痛みの強さ（NRSなど）」「痛みの部位」「痛みの性質（ズキズキ・鈍いなど）」「持続時間・出現する時間」「体動・咳・深呼吸との関連」「鎮痛薬の使用と使用後の変化」/);
  assert.match(op.msgs[0], /が不足していないか確認してください$/);
  assert.ok(op.msgs.some(m => /「バイタルサインを観察する」だけでは/.test(m)));
  assert.ok(item(r, 'tp').msgs.some(m => /^「安楽な体位にする」：いつ・どのように・どのくらい/.test(m)));
  assert.equal(item(r, 'ep').level, 'warn');
  assert.equal(item(r, 'individual').level, 'warn');
  assert.ok(item(r, 'evidence').msgs.some(m => /NRS/.test(m)), '根拠データ（創部痛 NRS 5）の値を目標・OPで見ていない');
});

test('計画をチェック：期限・数値・患者の状態を含む目標と、具体的なOP/TP/EPなら指摘しない。目標の4つの要素', () => {
  const cp = stomaPatient();
  const p = app.createCarePlan(cp, { problem: '急性疼痛（手術創部の侵襲）', goalLong: '退院までに、創部痛がNRS3以下で、痛みを自分の言葉で看護師に伝えながら日常動作を行える', goalShort: '2日後までに、安静時の創部痛がNRS5からNRS3以下となり、苦痛なく休息できる',
    op: ['疼痛の程度（NRS）・部位・性質', '痛みの持続時間と出現する時間', '体動・咳嗽時の痛みの変化', '鎮痛薬（硬膜外PCA）使用前後のNRSの変化', '表情・睡眠の状況'],
    tp: ['体動の30分前にPCAのボタンを押すよう声をかける', '創部を圧迫しないよう、枕を使って膝を軽く曲げた側臥位にする'],
    ep: ['痛みを我慢せずにナースコールで伝えてよいことを説明し、自分の言葉で伝え方を言ってもらって確認する'] });
  const r = app.reviewCarePlan(cp, p);
  assert.deepEqual(clone(r.items.filter(i => i.level !== 'ok').map(i => [i.key, i.msgs])), []);
  const g = app.cpGoalCheck('2日後までに、安静時の創部痛がNRS5からNRS3以下となり、苦痛なく休息できる');
  assert.ok(g.deadline && g.subject && g.change && g.measure && !g.abstract);
  const n = app.cpGoalCheck('3日後までに排便を促す');
  assert.ok(!n.subject && n.msgs.some(m => /「患者が」/.test(m)), '看護師がすることの書き方');
  assert.ok(app.cpGoalCheck('').empty);
  // 目標のNRSが今の記録より下がっていない
  const bad = app.createCarePlan(cp, { problem: '急性疼痛', goalShort: '2日後までにNRS5以下となる', op: ['NRS'] });
  assert.ok(item(app.reviewCarePlan(cp, bad), 'evidence').msgs.some(m => /今の記録（NRS5）より下がっていません/.test(m)));
});

test('関連図から取り込む：看護問題・補足・根拠データ（疾患の背景は除く）を引き継ぎ、「この患者に必要な理由」を求める', () => {
  const cp = stomaPatient();
  const fresh = app.importCarePlansFromMap(cp);
  assert.ok(fresh.length >= 6);
  const pain = fresh.find(p => /^急性疼痛/.test(p.problem));
  assert.deepEqual(clone(pain.evidence), ['創部痛（NRS 5）']);
  assert.equal(pain.note, '手術の傷の痛みがある');
  assert.equal(pain.source, 'map');
  assert.equal(pain.reasonNeeded, true);
  assert.ok(!fresh.some(p => p.evidence.some(e => /喫煙/.test(e))), '喫煙歴（疾患の背景）は根拠データに入れない');
  const body = fresh.find(p => p.problem === 'ボディイメージ混乱');
  assert.ok(body.evidence.some(e => /人前に出られない/.test(e)));
  assert.equal(app.importCarePlansFromMap(cp).length, 0, '2回目は同じ問題を足さない');
  // カード：根拠データ・理由を書く案内（入力欄は増やさない）
  const h = app.carePlanBasisHtml(pain);
  assert.match(h, /根拠データ（関連図から）/);
  assert.match(h, /関連図から取り込んだ看護問題です。そのまま使わず、この患者に必要な理由/);
  assert.match(app.carePlanBasisHtml({ ...pain, reasons: [{ text: '術後1日目でNRS5', about: '短期目標' }] }), /この患者に必要な理由[\s\S]*短期目標[\s\S]*術後1日目でNRS5/);
  assert.equal(app.carePlanBasisHtml({ ...pain, evidence: ['<img src=x onerror=alert(1)>'], note: '', reasonNeeded: false }).includes('<img'), false);
  // 書き出しにも根拠データ・理由が入る
  pain.reasons = [{ text: '術後1日目でNRS5', about: '' }];
  assert.match(app.buildCarePlansText(cp), /根拠データ：創部痛（NRS 5）[\s\S]*この患者に必要な理由：術後1日目でNRS5/);
});


test('看護計画の画面：非AIチェック・関連図から取り込むボタン。AI生成の評価や取り込みは禁止', () => {
  assert.match(html, /onclick="importCarePlansFromMapUI\(\)"[^>]*>[\s\S]*?関連図から取り込む/);
  const cp = stomaPatient();
  const p = app.createCarePlan(cp, { problem: '急性疼痛' });
  const card = app.carePlanCardHtml(cp, p, 0, 1);
  assert.doesNotMatch(card, /計画をチェック/, '閉じた計画には出さない');
  assert.match(src, /onclick="toggleCarePlanReview\('\$\{pid\}'\)"/);
  assert.doesNotMatch(src, /AIで看護計画を評価/, 'OCR以外のAIによる計画評価は禁止');
  assert.match(src, /onclick="openCareRecord\('\$\{pid\}'\)"><i class="fa-solid fa-plus"><\/i> 実施・評価を記録/);
  // 目標の例はそのまま入れない（例のままなら理由を書く）、OPの不足は理由を書いてから足す
  assert.match(src, /例のままですが、よいですか？/);
  assert.match(src, /const why = await askCareReason\('OPに足す理由'/);
  assert.match(src, /if \(t\.length < 6\) \{ showToast\('理由を、記録のデータを使って書いてください/);
  // AIの看護計画から取り込んだ計画も、理由を求める
  assert.doesNotMatch(src, /forEach\(f => add\(\{ \.\.\.f, source: 'ai', reasonNeeded: true \}\)\)/);
  assert.match(css, /\.cpr-item \{/);
  assert.match(css, /\.cp-reason-need \{/);
});

test('実機評価の反映：曖昧な期限・「理解する」目標、観察のTP、中身のないEP、長期目標の空欄を指摘する', () => {
  const cp = stomaPatient();
  const v = app.cpGoalCheck('数日後に食事療法を理解する');
  assert.ok(!v.deadline && v.msgs.some(m => /「数日」では、いつ評価するのか/.test(m)) && v.msgs.some(m => /「理解する」だけでは/.test(m)) && v.abstract);
  assert.ok(app.cpGoalCheck('退院までに、低血糖の症状と対処を3つ、自分の言葉で説明できる').msgs.length === 0);
  assert.ok(app.cpGoalCheck('入院中に退院後の生活のイメージを持つ').msgs.some(m => /イメージを持/.test(m)));
  const p = app.createCarePlan(cp, { problem: '自己管理体制不全', goalShort: '3日後までにインスリン手技を看護師の前で実演できる',
    op: ['血糖値'], tp: ['血糖測定やインスリン補正の状況を把握する', '手技を一緒に行い、できた点をその場で伝える'], ep: ['症状が現れた際の対応方法を伝える'] });
  const r = app.reviewCarePlan(cp, p);
  assert.ok(item(r, 'tp').msgs.some(m => /観察・把握なので.*OP/.test(m)) && item(r, 'tp').moveToOp.length === 1);
  assert.ok(item(r, 'ep').msgs.some(m => /何を説明するのか/.test(m)) && item(r, 'ep').msgs.some(m => /理解をどう確認するか/.test(m)));
  assert.ok(item(r, 'goal').msgs.some(m => /長期目標が空欄/.test(m)));
  // AIの文章を取り込むときは、観察のTPはOPへ移す
  const plans = app.parseCarePlanText('■自己管理体制不全\n長期目標\n1. 退院までに自分で血糖測定ができる\n短期目標\n1. 3日後までに手技を実演できる\nOP（観察計画）\n1. 血糖値\nTP（援助計画）\n1. 血糖測定の状況を把握する\n2. 手技を一緒に行う');
  assert.deepEqual(clone(plans[0].tp), ['手技を一緒に行う']);
  assert.ok(plans[0].op.includes('血糖測定の状況を把握する') && plans[0].goalLong);
});


test('実習向け：「18時までに」「本日中に」は期限として使えない。手本（目標・TP・EP）を示し、空欄にだけ入れる。糖尿病の長文事例の看護計画', () => {
  const cp = stomaPatient();
  const g = app.cpGoalCheck('本日18時までに創部痛がNRS3以下になる');
  assert.ok(!g.deadline && g.msgs.some(m => /実習中に評価しにくい期限/.test(m)));
  assert.ok(app.cpGoalCheck('2日後までに、安静時の創部痛がNRS3以下になる').deadline);
  assert.ok(!/18時/.test(JSON.stringify(app.CP_DOMAINS.map(d => d.goal ? d.goal({}) : ''))));
  const p = app.createCarePlan(cp, { problem: '急性疼痛（手術創部の侵襲）' });
  const r = app.reviewCarePlan(cp, p);
  assert.ok(r.model && /^退院までに/.test(r.model.goalLong) && r.model.tp.length >= 3 && r.model.ep.every(t => /(確認|実演|言ってもらって|答えてもらって|やってもらう)/.test(t)));
  assert.ok(!/18時/.test(JSON.stringify(r.model)));
  assert.ok(/applyCareModelUI/.test(app.carePlanReviewHtml(cp, p)));
  // 糖尿病の事例：6つの看護問題すべてに手本があり、足潰瘍は褥瘡ではなく足の観察、分割食はTP/EPで重ならない
  const text = fs.readFileSync(path.join(ROOT, 'tests/fixtures/relation-map/diabetes_education_foot_long.txt'), 'utf8');
  const items = app.classifyTextByRules(text).map((i, k) => ({ ...i, id: `it${k}` }));
  const dm = { id: 'p2', title: 'D氏', sourceText: text, items, carePlans: {}, selectedDiagnosisIds: [], diagnosisCandidates: [] };
  dm.relationMap = app.buildRelationMapFromRecord(dm);
  const names = dm.relationMap.nodes.filter(n => n.type === 'nursing_problem').map(n => n.label);
  assert.ok(names.some(n => /足潰瘍/.test(n)) && names.some(n => /感染リスク/.test(n)) && names.some(n => /血糖不安定/.test(n)) && names.some(n => /自主管理/.test(n)) && names.some(n => /家族の知識不足/.test(n)));
  assert.ok(!names.some(n => /褥瘡|栄養摂取量不足/.test(n)));
  const plans = app.importCarePlansFromMap(dm);
  plans.forEach(pl => assert.ok(app.reviewCarePlan(dm, pl).model, `${pl.problem} の手本`));
  const foot = plans.find(pl => /足潰瘍/.test(pl.problem));
  assert.equal(app.cpDomainOf(foot).key, 'dmfoot');
  const tpep = key => plans.map(pl => (app.reviewCarePlan(dm, pl).model || {})[key] || []).flat().join('\n');
  assert.equal((tpep('ep').match(/分割食/g) || []).length, 0, '分割食の指示は記録にあるが、手本には他疾患の定型として入れない（栄養士の指導内容に合わせる）');
  // 看護計画の修正指示（2026-10-07.12）：低血糖は意識・嚥下で分岐／初回所見を基準に／インスリンは指示・手順／原因の確認
  const all = plans.map(pl => app.reviewCarePlan(dm, pl).model).map(m => JSON.stringify(m)).join('\n');
  assert.ok(/意識がはっきりして飲み込めるときだけ/.test(all) && /119番/.test(all) && /15分後も低い/.test(all) && /緊急対応/.test(all));
  assert.ok(/初回所見/.test(all) && !/直径1\.5cm以下/.test(all) && !/発赤・滲出液が減り/.test(all));
  assert.ok(/医師の指示・院内の手順/.test(all) && !/半分以下/.test(all));
  assert.ok(/通院を中断した理由/.test(all) && /視力・手指の操作・理解/.test(all) && /3回続けて/.test(all));
  assert.ok(!/眠れたと言える/.test(all) && /睡眠の状況/.test(all));
  plans.forEach(pl => { const g = app.reviewCarePlan(dm, pl).model.goalShort; assert.ok(app.cpGoalCheck(g).deadline, `${pl.problem} の目標に期限`); });
});

test('糖尿病の関連図の評価（2026-10-07.9）：低血糖の時系列・事実だけを根拠に・発言は根拠として添える・妻の発言は全文・理論は補足', () => {
  const text = fs.readFileSync(path.join(ROOT, 'tests/fixtures/relation-map/diabetes_education_foot_long.txt'), 'utf8');
  const items = app.classifyTextByRules(text).map((i, k) => ({ ...i, id: `it${k}` }));
  const cp = { id: 'p3', sourceText: text, items, carePlans: {} };
  const map = app.buildRelationMapFromRecord(cp);
  const by = re => map.nodes.find(n => re.test(n.label));
  const edge = (a, b) => map.edges.find(e => e.source === a.id && e.target === b.id);
  // 1 治療（ブドウ糖）と再測定は別の四角。症状が消えたとは書かない
  const dex = by(/^ブドウ糖を摂取$/), re = by(/15分後の再測定 血糖82/), hypo = by(/^低血糖の症状（血糖62/);
  assert.ok(dex && re && hypo && edge(dex, hypo).relation === 'treats' && edge(dex, re));
  assert.ok(!map.nodes.some(n => /症状(?:が)?(?:消失|消え)/.test(n.label)));
  // 2 「食事・内服・受診が続かず」と断定せず、記録の事実（通院中断・内服・手技の間違い）を直接つなぐ
  assert.ok(!by(/食事・内服・受診が続かず/) && by(/通院を自己中断・内服が不規則/) && by(/単位の合わせ方を2回間違える/));
  // 3 感覚低下 → 痛みを感じにくく放置 → 潰瘍。患者の発言は「放置」の根拠として添える
  const neuro = by(/モノフィラメント/), unaware = by(/痛みを感じにくく、傷に気づかず放置/), ulcer = by(/直径2cmの潰瘍/), said = by(/痛くないから放っておいた/);
  assert.ok(edge(neuro, unaware) && edge(unaware, ulcer) && edge(said, unaware).relation === 'supports' && !edge(said, ulcer));
  // 4 炎症所見は感染の確定にしない
  assert.ok(by(/感染かどうかは未確定/) && /最優先|優先度1/.test(by(/^感染リスク状態/).note + by(/^感染リスク状態/).evidence));
  // 5 妻の発言は全文（省略「…」なし）。飲酒の根拠もある
  assert.ok(map.nodes.filter(n => /^妻の言葉/.test(n.label)).every(n => !/…/.test(n.label)) && by(/お酒をやめさせられるか自信がない」$/));
  assert.ok(!map.nodes.some(n => n.type !== 'nursing_problem' && /…$/.test(n.label)));
  // 6 理論（発達課題）は補足（予測の線）。主な流れは本人の言葉 → 役割を果たせない
  const role = by(/役割を果たせない/), dev = by(/発達課題/), words = by(/早く退院したい/);
  assert.ok(edge(words, role) && edge(dev, role).predicted && !map.edges.some(e => e.target === dev.id));
  // 7 治療の線には「治療」の文字を添える
  assert.ok(/class="rm-treat-label"[^`]*>治療<\/text>/.test(src));
});

test('手本のOP：ドレーン・カテーテルの記録が無い患者の感染の手本に、ドレーン排液・尿を出さない', () => {
  const cp = { id: 'p4', sourceText: '足底に潰瘍あり。発赤と熱感。', items: [], carePlans: {} };
  const m = app.cpModelFor({ problem: '感染リスク状態' }, app.cpRecordContext(cp));
  assert.ok(!m.op.some(t => /ドレーン|尿の/.test(t)) && m.op.some(t => /傷の滲出液/.test(t)));
});
