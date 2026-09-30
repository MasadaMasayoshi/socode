'use strict';
// 自分のアセスメント（js/11）：ヘンダーソン14項目ごとに「情報の解釈」「考えられる原因」「今後の見通し」を書き、
// 根拠のS/Oカードを紐付け、確定した版を履歴に残し、そのあとに増えた情報・変わった根拠を知らせて再評価できる
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const clone = v => JSON.parse(JSON.stringify(v));

const card = (id, type, text, needs, extra = {}) => ({ id, type, text, timestamp: extra.timestamp || '術後1日目', hendersonIds: needs, assessmentCols: Object.fromEntries(needs.map(n => [n, extra.col || 'postadmission'])), ...extra });
function patientWithCards() {
  return {
    id: 'P', title: '患者P', sourceText: '', deletedItemIds: [], referenceNotes: [], archived: false, updatedAt: '2026-09-01T00:00:00.000Z',
    items: [
      card('s1', 's', '「お腹が張る感じがする」', [3]),
      card('o1', 'o', '術後より排便なし', [3]),
      card('o2', 'o', '腸蠕動音やや微弱', [3]),
      card('o3', 'o', 'CRP 3.8 mg/dL (基準値: 0.3以下 mg/dL)', [3, 2]),
      card('m1', 'o', '普段の排便の間隔', [3], { col: 'missing' }),
      card('x1', 's', '「昨日の夜は何回か目が覚めた」', [5])
    ]
  };
}

test('根拠のカードを足す・外す：表と同じ番号（S-1・O-2）で、表の順に並べる。消えても本文の控えが残る', () => {
  const app = loadApp();
  const cp = patientWithCards();
  assert.equal(app.linkMyEvidenceIds(cp, 3, ['o2', 's1', 'o1']), 3);
  assert.deepEqual(clone(cp.myAssessments[3].evidenceIds), ['s1', 'o1', 'o2']);
  assert.equal(app.linkMyEvidenceIds(cp, 3, ['o1']), 0, '同じカードは二重に入れない');
  assert.equal(app.linkMyEvidenceIds(cp, 3, ['nothing']), 0);
  assert.equal(cp.myAssessments[3].evidenceCache.o2.label, 'O-2');
  assert.ok(app.unlinkMyEvidenceId(cp, 3, 'o1'));
  assert.deepEqual(clone(cp.myAssessments[3].evidenceIds), ['s1', 'o2']);
  // 根拠のカードを不要にすると「消された根拠」として知らせる
  cp.items.find(i => i.id === 'o2').type = 'unnecessary';
  const st = app.myAssessmentStatus(cp, 3);
  assert.deepEqual(clone(st.removedEvidence), [{ id: 'o2', text: '腸蠕動音やや微弱' }]);
});

test('確定すると第1版として履歴に残り、そのあとに増えた情報・変わった根拠・消された根拠を知らせる（再評価が必要）', () => {
  const app = loadApp();
  const cp = patientWithCards();
  const e = app.ensureMyAssessment(cp, 3);
  e.interpretation = '術後より排便がなく（O-1）、腸蠕動音も微弱で便秘の状態にある。';
  e.cause = '床上安静による腸蠕動の低下';
  e.outlook = '腹部膨満や食欲低下につながるおそれ';
  app.linkMyEvidenceIds(cp, 3, ['s1', 'o1', 'o2']);
  assert.equal(app.myAssessmentStatus(cp, 3).dirty, true, '書きかけ（未確定）');
  const v1 = app.confirmMyAssessmentEntry(cp, 3, '2026-09-29T01:00:00.000Z');
  assert.equal(v1.version, 1);
  assert.deepEqual(clone(v1.evidence.map(x => x.label)), ['S-1', 'O-1', 'O-2']);
  assert.deepEqual(clone(v1.knownItemIds).sort(), ['o1', 'o2', 'o3', 's1'], '不足情報の欄のカードは「記録」に入れない');
  let st = app.myAssessmentStatus(cp, 3);
  assert.equal(st.version, 1);
  assert.equal(st.dirty, false);
  assert.equal(app.myAssessmentNeedsReview(st), false);
  assert.equal(st.newItems.length, 0, '確定のときからあったカード（根拠にしていない O-3 も）は「増えた情報」にしない');
});

test('再評価の流れ：新しいカード・根拠の本文の変更を知らせ、「確認した」で消せる。確定し直すと第2版になり差分が分かる', () => {
  const app = loadApp();
  const cp = patientWithCards();
  const e = app.ensureMyAssessment(cp, 3);
  e.interpretation = '排便がなく便秘の状態にある。';
  app.linkMyEvidenceIds(cp, 3, ['s1', 'o1']);
  app.confirmMyAssessmentEntry(cp, 3, '2026-09-29T01:00:00.000Z');
  let st = app.myAssessmentStatus(cp, 3);
  assert.equal(st.newItems.length, 0, '確定のときにあったカードは「新しい情報」にしない');

  // 確定のあとに：新しいカードが増え、根拠のカードの本文が書き換わった
  cp.items.push(card('o9', 'o', '午後、軟便中量あり', [3], { timestamp: '術後3日目' }));
  cp.items.find(i => i.id === 'o1').text = '術後より排便なし（2日間）';
  st = app.myAssessmentStatus(cp, 3);
  assert.deepEqual(clone(st.newItems.map(i => i.id)), ['o9']);
  assert.deepEqual(clone(st.changedEvidence), [{ id: 'o1', before: '術後より排便なし', after: '術後より排便なし（2日間）' }]);
  assert.equal(app.myAssessmentNeedsReview(st), true);
  const html = app.renderMyAssessmentRowHtml(cp, app.HENDERSON_NEEDS[2], false);
  assert.match(html, /前回の評価（第1版/);
  assert.match(html, /新しく増えた情報（1）/);
  assert.match(html, /再評価として確定（第2版）/);

  // 「確認した」：その本文のままなら知らせない
  e.acknowledged.o1 = '術後より排便なし（2日間）';
  assert.equal(app.myAssessmentStatus(cp, 3).changedEvidence.length, 0);
  // 新しいカードを根拠に加え、解釈を書き直して再評価
  app.linkMyEvidenceIds(cp, 3, ['o9']);
  e.interpretation = '排便があり、便秘の状態は改善した。';
  e.revisionNote = '軟便があったため判断を変えた';
  assert.equal(app.myAssessmentStatus(cp, 3).newItems.length, 0, '根拠に加えたカードは「新しい情報」から外れる');
  const v2 = app.confirmMyAssessmentEntry(cp, 3, '2026-09-30T01:00:00.000Z');
  assert.equal(v2.version, 2);
  assert.equal(v2.revisionNote, '軟便があったため判断を変えた');
  assert.equal(e.revisionNote, '', '確定したら「変えたこと」は履歴に移る');
  const d = app.diffMyAssessmentVersions(e.history[0], e.history[1]);
  assert.deepEqual(clone(d.changedFields), ['情報の解釈']);
  assert.deepEqual(clone(d.addedEvidence.map(x => x.id)), ['o9']);
  assert.equal(app.myAssessmentNeedsReview(app.myAssessmentStatus(cp, 3)), false);
  // 前の版に戻す（書きかけに写すだけ）
  assert.ok(app.restoreMyAssessmentFromHistory(cp, 3, 1));
  assert.equal(e.interpretation, '排便がなく便秘の状態にある。');
  assert.deepEqual(clone(e.evidenceIds), ['s1', 'o1']);
  assert.equal(e.history.length, 2);
  assert.equal(app.myAssessmentStatus(cp, 3).dirty, true);
});

test('何も書いていなければ確定しない', () => {
  const app = loadApp();
  const cp = patientWithCards();
  app.ensureMyAssessment(cp, 3);
  assert.equal(app.confirmMyAssessmentEntry(cp, 3), null);
});

test('見直しのポイント（AIなし）：根拠なし・検査値の異常の見落とし・本文の番号が根拠に無い・不足情報・SかOだけ', () => {
  const app = loadApp();
  const cp = patientWithCards();
  const texts = () => app.reviewMyAssessment(cp, 3).map(h => `${h.level}:${h.text}${h.itemId ? `[${h.itemId}]` : ''}`);
  assert.match(texts()[0], /まず「情報の解釈」から/);
  const e = app.ensureMyAssessment(cp, 3);
  e.interpretation = '「お腹が張る」（S-1）とあり、排便がない（O-1）ことから便秘の状態にあると考える。';
  let t = texts();
  assert.ok(t.some(x => /^warn:根拠のカードが選ばれていません/.test(x)), t.join('\n'));
  assert.ok(t.some(x => /本文に書いた S-1.*\[s1\]$/.test(x)), t.join('\n'));
  assert.ok(t.some(x => /^warn:基準値を外れた検査値 O-3「CRP 3.8 mg\/dL ↑」.*\[o3\]$/.test(x)), t.join('\n'));
  assert.ok(t.some(x => /不足情報が1件/.test(x)));
  assert.ok(t.some(x => /考えられる原因」が空/.test(x)));
  app.linkMyEvidenceIds(cp, 3, ['s1']);
  t = texts();
  assert.ok(t.some(x => /根拠がSデータ（患者の言葉）だけ/.test(x)), t.join('\n'));
  assert.ok(!t.some(x => /本文に書いた S-1/.test(x)), '根拠に入れたら消える');
  app.linkMyEvidenceIds(cp, 3, ['o1', 'o3']);
  t = texts();
  assert.ok(!t.some(x => /検査値/.test(x)));
  assert.ok(!t.some(x => /だけです/.test(x)));
});

test('表示：書いた文章・カードの本文はHTMLとして解釈しない。「すべて」表示では書いていない項目を1行にたたむ', () => {
  const app = loadApp();
  const cp = patientWithCards();
  cp.items[0].text = '<img src=x onerror=alert(1)>';
  const e = app.ensureMyAssessment(cp, 3);
  e.interpretation = '<script>alert(1)</script>';
  app.linkMyEvidenceIds(cp, 3, ['s1']);
  const html = app.renderMyAssessmentRowHtml(cp, app.HENDERSON_NEEDS[2], false);
  assert.doesNotMatch(html, /<img src=x|<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /data-my-asm-field="interpretation"/);
  const folded = app.renderMyAssessmentRowHtml(cp, app.HENDERSON_NEEDS[4], true);
  assert.match(folded, /my-asm-collapsed/);
  assert.match(folded, /まだ書いていません/);
});

test('根拠のカードを選ぶ画面：この項目のカードは表の番号で、「ほかの項目」でS/Oすべて。絞り込みもできる', () => {
  const app = loadApp();
  const cp = patientWithCards();
  const own = app.evidencePickerCandidates(cp, 3);
  assert.deepEqual(clone(own.map(c => `${c.label}:${c.item.id}`)), ['S-1:s1', 'O-1:o1', 'O-2:o2', 'O-3:o3'], '不足情報の欄のカードは出さない');
  const all = app.evidencePickerCandidates(cp, 3, { includeOthers: true });
  assert.deepEqual(clone(all.filter(c => !c.own).map(c => c.item.id)), ['x1']);
  assert.deepEqual(clone(app.evidencePickerCandidates(cp, 3, { query: 'crp' }).map(c => c.item.id)), ['o3']);
});

test('書き出し・印刷・AIへの指示文に自分のアセスメントが入る', () => {
  const app = loadApp();
  const cp = patientWithCards();
  const e = app.ensureMyAssessment(cp, 3);
  e.interpretation = '便秘の状態にある';
  e.outlook = '食欲低下のおそれ';
  app.linkMyEvidenceIds(cp, 3, ['s1', 'o1']);
  const text = app.buildMyAssessmentsText(cp);
  assert.match(text, /^3\. 排泄/m);
  assert.match(text, /情報の解釈：便秘の状態にある/);
  assert.doesNotMatch(text, /考えられる原因/, '空の欄は書かない');
  assert.match(text, /根拠：S-1「「お腹が張る感じがする」」／O-1「術後より排便なし」/);
  const html = app.buildMyAssessmentsPrintHtml(cp, 2);
  assert.match(html, /<h2>2\. 自分のアセスメント<\/h2>/);
  assert.match(html, /未確定/);
  const prompt = app.buildMyAssessmentAiPrompt(cp, 3);
  assert.match(prompt, /【学生が根拠に選んだカード】\n〔C1〕\[S\]/);
  assert.match(prompt, /【この項目のほかのカード（学生は根拠にしていない）】\n〔C3〕\[O\]/);
  assert.match(prompt, /【この項目の不足情報】\n- 普段の排便の間隔/);
});

test('複数の端末：別々の欲求のアセスメントを書いても消えない（サーバー・起動時の読み込み・保存の応答）', async () => {
  const app = loadApp();
  const server = require('../server.js');
  const a = { id: 'P', items: [], updatedAt: '2026-09-29T02:00:00.000Z', myAssessments: { 3: { interpretation: 'A端末', updatedAt: '2026-09-29T02:00:00.000Z' } } };
  const b = { id: 'P', items: [], updatedAt: '2026-09-29T01:00:00.000Z', myAssessments: { 5: { interpretation: 'B端末', updatedAt: '2026-09-29T01:00:00.000Z' }, 3: { interpretation: 'B端末の古い3', updatedAt: '2026-09-29T00:00:00.000Z' } } };
  const s = server.mergePatientRecord(a, b);
  assert.equal(s.myAssessments[3].interpretation, 'A端末');
  assert.equal(s.myAssessments[5].interpretation, 'B端末');
  const s2 = server.mergePatientRecord(b, a);
  assert.equal(s2.myAssessments[3].interpretation, 'A端末', '古い方が後から届いても新しい方を使う');
  const c = app.mergePatientRecordClient(clone(b), clone(a));
  assert.equal(c.myAssessments[3].interpretation, 'A端末');
  assert.equal(c.myAssessments[5].interpretation, 'B端末');
  assert.ok(!('myAssessments' in server.mergePatientRecord({ id: 'Q', items: [] }, { id: 'Q', items: [] })), '無い患者には項目を作らない');
});

test('保存の応答：通信中に書いたアセスメントは戻らず、別の端末で書いた欲求は取り込む', async () => {
  const m = new Map();
  const storage = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
  const calls = [];
  const fetch = (url, opts = {}) => {
    if (!/\/api\/patients\//.test(String(url))) return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    return new Promise(r => calls.push({ body: JSON.parse(opts.body), resolve: r }));
  };
  const app = loadApp({ localStorage: storage, fetch });
  const h = app.__testHooks;
  const st = h.state();
  const p = patientWithCards();
  st.patients = [p];
  st.currentPatientId = 'P';
  const e = app.ensureMyAssessment(p, 3);
  e.interpretation = '送った内容';
  e.updatedAt = '2026-09-29T01:00:00.000Z';
  const sending = h.syncPatientToServer('P');
  // 通信中に書き足す
  e.interpretation = '送った後に書き足した内容';
  e.updatedAt = '2026-09-29T01:00:05.000Z';
  h.schedulePatientSync('P');
  const serverPatient = { ...calls[0].body, myAssessments: { ...calls[0].body.myAssessments, 5: { interpretation: '別の端末', updatedAt: '2026-09-29T01:00:03.000Z' } } };
  calls[0].resolve({ ok: true, status: 200, json: async () => ({ ok: true, patient: serverPatient }) });
  await sending;
  assert.equal(p.myAssessments[3].interpretation, '送った後に書き足した内容');
  assert.equal(p.myAssessments[5].interpretation, '別の端末');
});
