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
  assert.equal(goal.example, '本日18時までに、安静時の創部痛がNRS5からNRS3以下となり、苦痛なく休息できる');
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
  const p = app.createCarePlan(cp, { problem: '急性疼痛（手術創部の侵襲）', goalLong: '退院までに、創部痛がNRS3以下で、痛みを自分の言葉で看護師に伝えながら日常動作を行える', goalShort: '本日18時までに、安静時の創部痛がNRS5からNRS3以下となり、苦痛なく休息できる',
    op: ['疼痛の程度（NRS）・部位・性質', '痛みの持続時間と出現する時間', '体動・咳嗽時の痛みの変化', '鎮痛薬（硬膜外PCA）使用前後のNRSの変化', '表情・睡眠の状況'],
    tp: ['体動の30分前にPCAのボタンを押すよう声をかける', '創部を圧迫しないよう、枕を使って膝を軽く曲げた側臥位にする'],
    ep: ['痛みを我慢せずにナースコールで伝えてよいことを説明し、自分の言葉で伝え方を言ってもらって確認する'] });
  const r = app.reviewCarePlan(cp, p);
  assert.deepEqual(clone(r.items.filter(i => i.level !== 'ok').map(i => [i.key, i.msgs])), []);
  const g = app.cpGoalCheck('本日18時までに、安静時の創部痛がNRS5からNRS3以下となり、苦痛なく休息できる');
  assert.ok(g.deadline && g.subject && g.change && g.measure && !g.abstract);
  const n = app.cpGoalCheck('3日後までに排便を促す');
  assert.ok(!n.subject && n.msgs.some(m => /「患者が」/.test(m)), '看護師がすることの書き方');
  assert.ok(app.cpGoalCheck('').empty);
  // 目標のNRSが今の記録より下がっていない
  const bad = app.createCarePlan(cp, { problem: '急性疼痛', goalShort: '本日18時までにNRS5以下となる', op: ['NRS'] });
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

test('AIで看護計画を評価：7項目・目標の例・問いをJSONで受け取り、学生が考えるための形で表示する', () => {
  const cp = stomaPatient();
  const p = app.createCarePlan(cp, { problem: '急性疼痛', goalShort: '痛みが軽減する', op: ['バイタルサインを観察する'], tp: ['安楽な体位にする'] });
  const prompt = app.buildCarePlanReviewPrompt(cp, p);
  ['fit 看護問題との整合性', 'goal 目標の具体性・評価可能性', 'op OPの不足', 'tp TPの具体性', 'ep EPの適切さ', 'individual 患者の個別性', 'evidence 根拠データとの一致'].forEach(w => assert.ok(prompt.includes(w), w));
  assert.match(prompt, /「いつまでに」「患者が」「どうなる」「何をもって達成と判断するか」/);
  assert.match(prompt, /完成した計画を丸ごと書き換えない/);
  assert.match(prompt, /・創部痛（NRS 5）/);
  const res = app.parseCarePlanReview('```json\n{"items":[{"key":"goal","ok":false,"comment":"抽象的","suggestion":"期限と数値を入れる"},{"key":"fit","ok":true,"comment":"合っている","suggestion":"x"}],"goal":"本日18時までにNRS3以下","questions":["なぜNRS3なのか"]}\n```');
  assert.deepEqual(clone(res.items.map(i => [i.key, i.level, i.suggestion])), [['fit', 'ok', ''], ['goal', 'warn', '期限と数値を入れる']]);
  assert.equal(res.goal, '本日18時までにNRS3以下');
  assert.equal(app.parseCarePlanReview('読めない'), null);
  const h = app.carePlanReviewHtml(cp, { ...app.getCarePlan(cp, p.id), aiReview: { at: '2026-10-07T01:00:00.000Z', ...res } });
  assert.match(h, /計画のチェック（AIなし）/);
  assert.match(h, /AIの評価は参考です。採り入れるときは、この患者に必要な理由を確かめてください/);
  assert.match(h, /考えてみよう（この患者に必要な理由）[\s\S]*なぜNRS3なのか/);
  assert.match(h, /例を見ながら書き直す/);
  assert.match(h, /cpr-dot[^>]*>— いつまでに/);
});

test('看護計画の画面：チェック・AIで評価・関連図から取り込むボタン。提案は理由を書いてから使う（学習の支え）。実施→評価の流れはそのまま', () => {
  assert.match(html, /onclick="importCarePlansFromMapUI\(\)"[^>]*>[\s\S]*?関連図から取り込む/);
  const cp = stomaPatient();
  const p = app.createCarePlan(cp, { problem: '急性疼痛' });
  const card = app.carePlanCardHtml(cp, p, 0, 1);
  assert.doesNotMatch(card, /計画をチェック/, '閉じた計画には出さない');
  assert.match(src, /onclick="toggleCarePlanReview\('\$\{pid\}'\)"/);
  assert.match(src, /AIで看護計画を評価/);
  assert.match(src, /onclick="openCareRecord\('\$\{pid\}'\)"><i class="fa-solid fa-plus"><\/i> 実施・評価を記録/);
  // 目標の例はそのまま入れない（例のままなら理由を書く）、OPの不足は理由を書いてから足す
  assert.match(src, /例のままですが、よいですか？/);
  assert.match(src, /const why = await askCareReason\('OPに足す理由'/);
  assert.match(src, /if \(t\.length < 6\) \{ showToast\('理由を、記録のデータを使って書いてください/);
  // AIの看護計画から取り込んだ計画も、理由を求める
  assert.match(src, /forEach\(f => add\(\{ \.\.\.f, source: 'ai', reasonNeeded: true \}\)\)/);
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

test('全計画の評価：重複（分割食）・別の計画に書かれた家族への指導・仕事への配慮を「全体では入っている」とする。AIの答えの読み取り', () => {
  const cp = stomaPatient();
  cp.sourceText = (cp.sourceText || '') + '\n妻がキーパーソン。仕事は営業職で外回りが多い。';
  app.createCarePlan(cp, { problem: '栄養摂取行動非効率', goalShort: '退院までに分割食の方法を自分の言葉で説明できる', tp: ['分割食の進め方を一緒に確認する'], ep: ['分割食の方法を妻にも説明し、理解を確認する'] });
  app.createCarePlan(cp, { problem: '自己管理体制不全', goalShort: '3日後までにインスリン手技を実演できる', tp: ['手技を一緒に行う'], ep: ['分割食の方法を説明し、自分の言葉で言ってもらう', '外回りの仕事の合間の血糖測定の方法を相談する'] });
  const r = app.reviewCarePlanSet(cp);
  assert.ok(r.dups.some(d => d.title === '分割食' && /栄養摂取行動非効率.*自己管理体制不全/.test(d.msg)));
  assert.ok(r.covered.some(c => c.title === '家族への指導・支援') && r.covered.some(c => c.title === '仕事・生活への配慮'));
  assert.ok(!r.gaps.length);
  assert.ok(/他の看護計画/.test(app.buildCarePlanReviewPrompt(cp, app.carePlanList(cp)[0])) && /未来だから不適切/.test(app.buildCarePlanReviewPrompt(cp, app.carePlanList(cp)[0])));
  assert.ok(/全ての看護計画/.test(app.buildAllCarePlansReviewPrompt(cp)));
  const res = app.parseAllCarePlansReview(JSON.stringify({ summary: '全体は概ね良い', duplicates: [{ title: '分割食', comment: '2つに重複', suggestion: '栄養の問題に統合' }], complements: [{ title: '家族', comment: '栄養の計画で妻に指導' }], gaps: [], priority: '' }));
  assert.equal(res.duplicates.length, 1);
  app.carePlanSetState.open = true; app.carePlanSetState.ai[cp.id] = res;
  assert.ok(/AIの評価（全計画）/.test(app.carePlanSetReviewHtml(cp)));
});
