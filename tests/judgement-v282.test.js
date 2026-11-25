// v.282 — 入院時に聞き取った習慣は入院前の情報、否定を含む所見、体温の推移と局所の熱感、更衣の介助量、難聴、検査値の並び順
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const TEXT = `氏名：K氏　78歳　女性
診断名：右大腿骨頸部骨折
手術術式：右人工骨頭置換術（後方アプローチ）
職業：65歳まで小学校教員。現在は独居で自炊している。
＜入院時の情報＞
食事：自炊。自力摂取。嚥下障害なし。常食1,600kcal
排泄：排尿・排便ともに自立。排便は1日1回。
睡眠：7時間。眠剤の使用なく、寝つき良好。
入浴：1回/日 自立（最終6/7）。毎日洗髪している。
趣味：友人と買い物や旅行に出かける。
術前（牽引中）
「痛くて夜は眠れなかった」
右下肢牽引中。ベッド上安静。尿器・便器の使用に介助を要す。
SpO2 98%（室内気）、呼吸音清明
術後1日目
「あまり食欲がない」「あまり動いてないし、おなかすかない」
昼食・夕食ともに摂取量半分。
BT 37.6℃、SpO2 98%（酸素3L）
排便なし（3日目なし）。腸蠕動あり、排ガスあり。腹部膨満の訴えあり。
創部：軽度の腫脹と熱感があるが、発赤・出血・排膿なし。
ホーマンズ徴候みられず。
看護師2名で全身清拭・陰部洗浄・更衣を実施。
「人工骨頭がずれたりしないかしら」
術後2日目
BT 37.0℃ → 36.8℃ → 36.7℃
SpO2 98%（RA）。深呼吸、自力排痰可能。
自力で端座位をとる。見守り下で車椅子へ移乗。
「眠れました」
聴力：難聴あり
「トイレに行きたいときはナースコールを押せばいいのよね」と話し、看護師に痛みや退院後の不安を伝えて質問している。
TP 6.2g/dL、Alb 3.7g/dL
`;
const mk = (text) => ({ id: 'p', title: 'T', sourceText: text, items: Array.from(app.classifyTextByRules(text)).map((c, i) => ({ id: 'c' + i, text: c.text, type: c.type, timestamp: c.timestamp, hendersonIds: Array.from(c.hendersonIds), fieldLabel: c.fieldLabel })), myAssessments: {}, carePlans: {}, missingChecks: {}, selectedDiagnosisIds: [], diagnosisCandidates: [] });
const cp = mk(TEXT);
const res = app.judgeSufficiencyByRules(cp);
const card = (t, n) => app.sufficiencyCardVerdict({ id: 'x', type: 'o', text: t, timestamp: '術後1日目', hendersonIds: [n] }, n, 'post');

test('入院時に聞き取った普段の生活（入浴・睡眠・排泄）は、入院前の情報として判定に使う', () => {
  [3, 5, 8].forEach(n => { assert.equal(res[n].pre.verdict, 'met', 'need' + n); });
});
test('「排便なし(3日目なし)」「排便が3日間ない」は良好な所見ではなく排便がない問題として扱う', () => {
  assert.equal(card('排便なし(3日目なし)', 3).v, 'unmet');
  assert.equal(card('3日間排便がない', 3).v, 'unmet');
  assert.equal(card('排便は3日間なし', 3).v, 'unmet');
});
test('体温は複数回の測定で通常域が続けば充足とし、創部の局所の熱感は体温の判定に使わない', () => {
  assert.equal(res[7].postop.verdict, 'met');
  assert.doesNotMatch(JSON.stringify(res[7].postop.facts || {}), /熱感/);
});
test('看護師が更衣を行った記録だけでは、本人の介助量が分からないので判定保留', () => {
  assert.equal(res[6].postop.verdict, 'conflict');
});
test('難聴の記載だけでは、コミュニケーションを未充足にしない', () => {
  assert.notEqual(res[10].postop.verdict, 'unmet');
});
test('室内気・RAのSpO2を「酸素投与中の値」と書かない', () => {
  const out = app.sufficiencyAnalysis(cp, 1, 'postop');
  assert.doesNotMatch(out, /酸素を投与している間の値/);
});
test('食事の判定の根拠は、食べた量や本人の言葉を先に、検査値は後ろに並べる', () => {
  const a = res[2].postop;
  assert.equal(a.verdict, 'unmet');
  const against = (a.facts && a.facts.against) || [];
  const iLab = against.findIndex(f => /^TP|^Alb/.test(f.text));
  const iIntake = against.findIndex(f => /摂取量|食欲/.test(f.text));
  assert.ok(iIntake > -1 && (iLab === -1 || iIntake < iLab));
});

test('整形外科の術後には、腹部・胸部の手術向けの援助（枕で創部を保護・食上げ）を入れず、人工骨頭脱臼の計画を作る', () => {
  const c2 = mk(TEXT);
  app.cpEnsureBuilt(c2);
  const plans = app.buildCarePlansText(c2);
  assert.doesNotMatch(plans, /枕・バスタオルで創部を保護|食事開始・食上げ/);
  const m = plans.match(/#\d+ [^\n]*脱臼[^\n]*\n[\s\S]*?(?=\n#\d+ |\n【)/);
  assert.ok(m, '脱臼の計画がある');
  assert.match(m[0], /OP（観察計画）[\s\S]*TP（援助計画）[\s\S]*EP（教育計画）/);
});
test('使用していない薬（眠剤の使用なく）を、転倒の原因として関連図に出さない', () => {
  const c2 = mk(TEXT);
  app.cpEnsureBuilt(c2);
  assert.doesNotMatch(JSON.stringify(c2.relationMap), /眠剤/);
});
