'use strict';
// Knowledge-request file: person names never appear (whole labelled value incl. spaces and honorifics, also in items and
// the original-record section); identity/metadata lines and lab-table vocabulary do not become topics.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const build = text => {
  const items = Array.from(app.classifyTextByRules(text)).map((i, k) => ({ ...i, id: `i${k}` }));
  const cp = { title: 'T', items, sourceText: text, carePlans: {} };
  const reqs = app.buildKnowledgeRequests(cp);
  return { cp, reqs, out: app.knowledgeRequestText(cp, reqs) };
};

test('a spaced kana/kanji name with an honorific is masked everywhere, never becomes a topic', () => {
  const src = '氏名 サンプル タロウ 様\nカルテNo. 12345\n男性\n40歳\n診断名: 糖尿病\n「タロウさんは甘い物が好き」と話す。\n山田 花子 様\n体温 37.8℃、倦怠感あり。';
  const { reqs, out } = build(src);
  ['サンプル', 'タロウ', '花子'].forEach(n => assert.ok(!out.includes(n), `${n} leaked`));
  assert.ok(!reqs.some(r => /サンプル|タロウ|花子/.test(r.term)));
  assert.match(out, /氏名: \(患者\)/);
  assert.match(out, /男性/, 'sex words are not masked as names');
});

test('kanji family/given names separated by a space are masked as a whole', () => {
  const { out } = build('名前 佐藤 次郎 さん\n40歳 男性\n発熱あり。');
  assert.ok(!/佐藤|次郎/.test(out), out);
});

test('lab-table vocabulary, report metadata and decimals are not turned into topics or dates', () => {
  const src = '1234567\nさくらクリニック\n担当医\n項目名 | 基準値 | 単位 | 結 果\n--- | --- | --- | ---\nHb | 13.6～18.3 | g/dL | Hb 15.9\n総 コ レ ス テ ロ ー ル | 150～219 | mg/dL | T-Cho\nビリルビン | (-) | | ビリルビン';
  const { reqs, out } = build(src);
  assert.equal(reqs.length, 0, reqs.map(r => r.term).join(','));
  assert.ok(!/\(日付\)/.test(out), 'reference ranges are not dates');
  assert.match(out, /13\.6/);
});

test('krTerms drops lab vocabulary and timing fragments', () => {
  assert.deepEqual(Array.from(app.krTerms('白血球数 コレステロール 毎日飲 帰室時 心窩部')), ['心窩部']);
});

test('the original-record section drops report header lines and staff or signer names', () => {
  const { loadApp } = require('./app-helpers.js');
  const app = loadApp();
  const src = 'さくら太郎クリニック\n担当医 青山 花子\n責任者 岡田 次郎\nカルテNo. 123\n発熱と咳が続く。';
  const cp = { title: 'T', sourceText: src, items: [{ id: '1', type: 'o', text: '発熱と咳が続く', hendersonIds: [] }] };
  const text = app.knowledgeRequestText(cp, app.buildKnowledgeRequests(cp));
  assert.ok(/発熱と咳が続く/.test(text));
  assert.ok(!/青山|花子|岡田|次郎|さくら太郎|カルテNo/.test(text));
});

test('only medical terms become topics: plain nouns, body parts and feeling words do not', () => {
  ['気持', '横向', '背中', '最期', '増量', 'レスキュー'].forEach(w => assert.equal(app.krIsMedicalTerm(w), false, w));
  ['光線過敏症', 'オキシコドン徐放錠', '鈍痛', '心外膜炎', 'ワーファリン'].forEach(w => assert.equal(app.krIsMedicalTerm(w), true, w));
});

test('sentence-like history entries are not requested as diagnoses', () => {
  const src = '既往歴: 10歳の時に胆結石を指摘されていたが、糖尿病\n診断名: 胃がん';
  const { reqs } = build(src);
  assert.ok(!reqs.some(r => /指摘/.test(r.term)), reqs.map(r => r.term).join(','));
});
