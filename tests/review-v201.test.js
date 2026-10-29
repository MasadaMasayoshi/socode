'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./app-helpers');
const app = loadApp();
let n = 0;
const card = (type, text, need, col) => ({ id: 'r' + (n++), type, text, timestamp: '入院2日目', hendersonIds: need ? [need] : [], assessmentCols: need ? { [need]: col || 'postadmission' } : {} });
const kText = fs.readFileSync(path.join(__dirname, 'fixtures', 'kawasaki-5f.txt'), 'utf8');
const kItems = app.groupClinicalPhrasesWithTimestamps(kText).filter(c => !c.isUnnecessaryBoilerplate).map((c, k) => ({ id: 'k' + k, type: 'o', text: c.text, timestamp: c.timestamp, hendersonIds: Array.from(new Set(app.detectMultipleHendersonTags(c.text))), assessmentCols: {} }));

// 1. 発言者
test('発言者: 母親・父親・医師を区別し、家族の不安を本人のコミュニケーション障害にしない／家族の発言は家族看護用に取り出せる', () => {
  assert.equal(app.cardSpeaker('母親：「どうして」と泣く').role, 'mother');
  assert.equal(app.cardSpeaker('父親：「落ち着かないと」').role, 'father');
  assert.equal(app.cardSpeaker('医師：「経過を見る」').role, 'physician');
  assert.equal(app.cardSpeaker('本人：「痛い」').role, 'patient');
  assert.equal(app.cardSpeaker('腹痛を訴える').role, '');
  const m = kItems.find(i => /^母親：「どうして/.test(i.text));
  assert.ok(!m.hendersonIds.includes(10));
  const fs1 = Array.from(app.familyStatements({ items: kItems }));
  assert.ok(fs1.some(x => x.speaker === 'mother' && /突然死/.test(x.text)));
  assert.ok(fs1.some(x => x.speaker === 'father'));
  const dest = app.buildTagAuditRows({ items: kItems }).find(r => /^父親：「まだそんな/.test(r.text));
  assert.equal(dest.destination.key, 'familyvoice');
});
test('発言者: 本人の発言（話者なし）は従来どおり本人の欲求になる／本人の伝達に触れた家族の発言は10を残す', () => {
  assert.ok(app.detectMultipleHendersonTags('「不安で眠れない」と話す').length > 0);
  assert.ok(app.detectMultipleHendersonTags('母：「この子は不安で言葉にできず、話さない」').includes(10));
});
// 2. 薬
test('薬: 指示・投与済み・中止を区別して構造化し、抗生剤だけで9.環境にしない／薬名から観察を推測しない', () => {
  const recs = Array.from(app.treatmentRecords({ items: kItems }));
  const st = re => (recs.find(r => re.test(r.source)) || {}).status;
  assert.equal(st(/①抗生剤/), 'prescribed');
  assert.equal(st(/ボルタレン/), 'administered');
  assert.equal(app.treatmentStatusOf('アスピリンを中止した'), 'discontinued');
  const aspirin = recs.find(r => /アスピリン540/.test(r.source));
  assert.equal(aspirin.dose, '540mg/日');
  assert.deepEqual(Array.from(app.detectMultipleHendersonTags('①抗生剤（ホスミシン600mg）')), []);
  assert.ok(!app.detectMultipleHendersonTags('抗生剤の点滴を開始した').includes(9));
  assert.deepEqual(Array.from(app.treatmentObservationLinks({ source: '架空薬Xを開始' })), []);
});
// 3. 症状汚染
test('症状: 頭痛ひとつで、無関係な欲求（姿勢・環境・コミュニケーション）に判定保留を作らない', () => {
  const cp = { id: 'p', items: [card('o', '頭痛あり', 1), card('o', '入浴は自立している', 8)], myAssessments: {} };
  const r = app.judgeSufficiencyByRules(cp);
  [4, 9, 10].forEach(nd => assert.notEqual(r[nd].post.verdict, 'conflict', 'need ' + nd));
});
test('判定の根拠の状態: 充足確認／未充足確認／食い違い・不完全／関連根拠なし を分ける', () => {
  const cp = { id: 'p', items: [card('s', '「昨夜は眠れなかった」', 5), card('o', '毎食全量摂取、食欲あり', 2), card('o', '病棟内を歩行している', 14)], myAssessments: {} };
  assert.equal(app.sufficiencyEvidenceState(cp, 5, 'post'), 'confirmed_unmet');
  assert.equal(app.sufficiencyEvidenceState(cp, 2, 'post'), 'confirmed_met');
  assert.equal(app.sufficiencyEvidenceState(cp, 11, 'post'), 'no_relevant_evidence');
  assert.ok(['incomplete', 'conflicting', 'no_relevant_evidence'].includes(app.sufficiencyEvidenceState(cp, 14, 'post')));
});
// 4. ジェノグラム
const gg = (text, items) => app.genogramText({ id: 'g', items: items || [], sourceText: text, myAssessments: {} }, x => x);
test('ジェノグラム: 原文に「父方は健在」とあれば父方の親族を載せ、祖父母とは断定しない／関係は作り上げない', () => {
  const g = gg(kText, kItems);
  assert.match(g, /父方の親族/);
  assert.ok(!/祖父（父方）|祖母（父方）/.test(g));
  assert.ok(!/父方の親族と/.test(g));
});
test('ジェノグラム: 配偶者は原文の根拠で検証する（成人の「妻と2人暮らし」は残す／父の発言中の「妻」や小児の本人には付けない）', () => {
  assert.match(gg('患者：Aさん（68歳、男性）。妻（65歳）と2人暮らし。長男（40歳）は別居。'), /妻／女性／65歳/);
  assert.ok(!/本人と妻/.test(gg(kText, kItems)));
  assert.ok(!/・妻／/.test(gg(kText, kItems)));
  assert.ok(/・母／女性／30歳/.test(gg(kText, kItems)));
});
// 6. 検査値
test('検査値: 元の文は変えず、指数を保ち、換算は数学的に正しく、不確かな値は換算しない', () => {
  const src = '白血球　173×10²/mm³';
  const w = app.analyzeLabCard(src, null);
  assert.equal(w.source, src);
  assert.equal(w.unitRaw, '×10^2/mm3'); assert.equal(w.valueRaw, '173'); assert.equal(w.valueStd, 17300);
  assert.equal(app.analyzeLabCard('血小板　44.5×10⁴/μL', null).unitRaw, '×10^4/μL');
  assert.equal(app.analyzeLabCard('GPT　96mIU/mL', null).valueStd, 96);
  const bad = app.analyzeLabCard('白血球　173×10²/dl', null);
  assert.ok(!bad || bad.quality !== 'valid' || bad.unitRaw !== '', 'unknown unit must not silently become valid with a made-up conversion');
  assert.equal(app.analyzeLabCard('フェリチン　416', null), null);
});
test('検査値: 小児では成人の基準で高値・低値を判定しない（CRPなど小児で使える基準は使う）', () => {
  const run = f => app.withExtractionContext(kText, f);
  const plt = run(() => app.analyzeLabCard('血小板　44.5×10⁴/μL', null));
  assert.equal(plt.status, 'unknown'); assert.equal(plt.valueStd, 44.5); assert.ok(plt.adultReferenceNotUsed);
  assert.equal(run(() => app.analyzeLabCard('CRP　5.92mg/dL', null)).status, 'high');
  assert.equal(app.analyzeLabCard('血小板　44.5×10⁴/μL', null).status, 'high'); // 成人の文脈では従来どおり
});
