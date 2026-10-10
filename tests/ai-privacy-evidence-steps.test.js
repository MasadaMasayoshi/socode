'use strict';
// AI機能の改善（F・A・D）の検証。
//  F：AIに送る前に、個人情報らしい語句を〈伏せ字N〉にし、AIの答えでは元の語句に戻す。
//  A：AIに渡すカードに〔C番号〕を付け、答えの中の番号を「根拠のカード」ボタンにする。
//  D：看護診断候補を1件ずつ選べる形に分け、「①不足情報 → ②看護診断候補 → ③看護計画」の進み具合を出す。
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const app = loadApp();
const mask = (text, terms = []) => { const ctx = app.createMaskContext(terms); return { out: app.maskPersonalInfo(text, ctx), ctx }; };

test('F：学籍番号・学生氏名など見出しの後の値を伏せ字にし、元に戻せる', () => {
  const src = '学籍番号: 2501021\n学生氏名: 森 友夏葉\n氏名: A氏 (男)\n年齢: 50歳代';
  const { out, ctx } = mask(src);
  assert.match(out, /学籍番号: 〈伏せ字\d〉/);
  assert.match(out, /学生氏名: 〈伏せ字\d〉/);
  assert.doesNotMatch(out, /2501021|森 友夏葉/);
  assert.match(out, /氏名: A氏 \(男\)/, 'すでに匿名のA氏は伏せない');
  assert.match(out, /年齢: 50歳代/, '年齢は臨床情報なので伏せない');
  assert.equal(app.restoreMaskedText(out, ctx), src);
});

test('F：電話・メール・施設名・敬称付きの名前を伏せ、続柄・職種・一般的な施設名・医学の言い回しは伏せない', () => {
  const { out } = mask('田中さんが来院。息子さん・看護師長さん同席。山田先生より説明。桜台総合病院から転院。総合病院。苦悶様顔貌。訪問看護師さん。TEL: 03-1234-5678。a.b@example.com');
  ['田中', '山田', '桜台総合病院', '03-1234-5678', 'a.b@example.com'].forEach(w => assert.ok(!out.includes(w), `${w} が伏せられていない：${out}`));
  ['息子さん', '看護師長さん', '総合病院。', '苦悶様顔貌', '訪問看護師さん'].forEach(w => assert.ok(out.includes(w), `${w} まで伏せられている：${out}`));
});

test('F：設定で登録した語句を伏せ、同じ語句には同じ記号を使う。AIが返した記号は元に戻す', () => {
  const { out, ctx } = mask('さくら整形外科クリニックを受診。さくら整形外科クリニックで処方。', ['さくら整形外科クリニック']);
  assert.equal(out, '〈伏せ字1〉を受診。〈伏せ字1〉で処方。');
  assert.equal(app.restoreMaskedText('〈伏せ字1〉の受診歴あり。〈伏せ字 1 〉。〈伏せ字9〉', ctx), 'さくら整形外科クリニックの受診歴あり。さくら整形外科クリニック。〈伏せ字9〉');
});

test('F：公開用の架空7事例では、臨床の内容を伏せない', () => {
  const cases = require('./public-case-helpers').loadPublicCases();
  assert.equal(cases.length, 7);
  for (const {id,text} of cases) {
    const {ctx} = mask(text.normalize('NFKC'));
    assert.deepEqual(Array.from(ctx.originals), [], `${id} で臨床内容を伏せた`);
  }
});

test('A：答えの中の〔C番号〕を、根拠のカードへのボタンにする（無い番号はそのまま）', () => {
  const items = [{ id: 'item_a', type: 's', text: '「痛くて眠れない」', timestamp: '術後1日目' }, { id: 'item_b', type: 'o', text: '夜間 良眠との記録', timestamp: '術後1日目' }];
  const ev = app.buildEvidenceIndex(items);
  const html = app.formatAiResultHtml('発言〔C1〕と記録〔C2〕が食い違う。〔C1、C2〕参照。〔C9〕は無い。SpO2 <90%', undefined, ev);
  assert.equal((html.match(/class="ai-evidence-chip/g) || []).length, 4);
  // 【レビューで発見】IDは onclick の文字列ではなく data-evidence-id に入れる（js/05 の document のクリックで移動）
  assert.match(html, /data-evidence-id="item_a"/);
  assert.doesNotMatch(html, /onclick=/);
  assert.match(html, /〔S 「痛くて眠れない」〕/);
  assert.match(html, /〔C9〕/, '一覧に無い番号はボタンにしない');
  assert.match(html, /SpO2 &lt;90%/, 'AIの答えの「<」で表示が崩れない');
});

test('D：「■ 診断名」の並びを1件ずつの候補に分ける', () => {
  const text = '**■ 急性疼痛**\n根拠：〔C1〕\n理由：術後の創痛\n\n■ 転倒転落リスク状態〔C3〕\n根拠：…';
  const cands = Array.from(app.parseDiagnosisCandidates(text));
  assert.deepEqual(cands.map(c => c.name), ['急性疼痛', '転倒転落リスク状態']);
  assert.match(cands[0].body, /理由：術後の創痛/);
  assert.equal(app.parseDiagnosisCandidates('形式が違う答え').length, 0);
});

test('D：進み具合（①不足情報 → ②看護診断候補 → ③看護計画）と「次はここ」', () => {
  const cp = { items: [{ type: 'o', hendersonIds: [1], assessmentCols: { 1: 'missing' }, text: '原因: …' }], aiRunAt: { missing: '2026-09-28T01:00:00Z' }, diagnosisCandidates: [{ id: 'd1' }, { id: 'd2' }], selectedDiagnosisIds: ['d2'] };
  const steps = Array.from(app.computeAiStepStatus(cp));
  assert.equal(steps[0].done, true);
  assert.match(steps[0].detail, /済・1件/);
  assert.equal(steps[1].done, false, '診断候補は aiRunAt が無くても diagnosisResult が無ければ未');
  assert.match(steps[1].detail, /2件中 1件を選択/);
  assert.equal(steps[1].next, true);
  assert.equal(app.isMissingInfoOnlyItem(cp.items[0]), true);
  assert.equal(app.isMissingInfoOnlyItem({ hendersonIds: [1, 2], assessmentCols: { 1: 'missing', 2: 'postadmission' } }), false);
});
