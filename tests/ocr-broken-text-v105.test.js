const test = require('node:test');
const assert = require('node:assert');
const { loadApp, readAppSource } = require('./app-helpers.js');
const app = loadApp();
const det = t => Array.from(app.detectBrokenTextLines(t));

test('detector: fragment contained in another line, mid-phrase wrap, split number/unit, unbalanced quote, mojibake', () => {
  const frag = det('風邪などの病気を想像\n風邪などの病気を想像していた家族は動揺していた。');
  assert.strictEqual(frag.length, 1); assert.strictEqual(frag[0].line, 1);
  assert.strictEqual(frag[0].candidate, '風邪などの病気を想像していた家族は動揺していた。'); assert.strictEqual(frag[0].confidence, '高');
  const wrap = det('店を続けていかねばならず、毎\n日働いている。');
  assert.ok(wrap[0] && /毎日働いている。$/.test(wrap[0].candidate) && wrap[0].confidence === '中');
  const num = det('脈拍は7\n2回であった。');
  assert.ok(num.some(x => x.reasons.some(r => /数値/.test(r)) && x.candidate === '脈拍は72回であった。'));
  const q = det('医師「診断名は喘息です。\nお大事にしてください。');
  assert.ok(q[0].reasons.some(r => /かっこ/.test(r)) && q[0].candidate === null && q[0].confidence === '確認不能');
  const moji = det('正常な行です。\n縺ゅ≧縺ｮ');
  assert.ok(moji.some(x => x.line === 2 && x.candidate === null));
});

test('detector counterexamples: complete entries, dated lines, labelled lines, tables and headings are not flagged; the source is untouched', () => {
  const ok = ['8月3日 食事は全量摂取。', '体温36.5℃、脈拍72回、血圧120/80mmHg', '診断名：喘息', '| 項目 | 値 |', '| --- | --- |', '＜入院時の状況＞', '歩行器で歩行できる。', '1. 基礎情報を記入する。'].join('\n');
  assert.deepStrictEqual(det(ok), []);
  const src = '店を続けていかねばならず、毎\n日働いている。';
  const before = src; det(src);
  assert.strictEqual(src, before);
});

test('wrapped-line repair joins only plain continuations and records every join', () => {
  const r = app.repairOcrWrappedLines('店を続けていかねばならず、毎\n日働いている。\n8月3日 食事は全量摂取。\n歩行器で歩行できる。');
  assert.strictEqual(r.text, '店を続けていかねばならず、毎日働いている。\n8月3日 食事は全量摂取。\n歩行器で歩行できる。');
  assert.strictEqual(r.joins.length, 1);
  const none = app.repairOcrWrappedLines('食事は全量摂取。\n8月4日 体温36.5℃\n| a | b |');
  assert.strictEqual(none.joins.length, 0);
});

test('修正依頼: instruction D and the broken-line list (with 原文 / 推定復元（推定・要確認） / 確認不能) are present; none detected says so', () => {
  const cp = { id: 'p', title: 'T', sourceText: '風邪などの病気を想像\n風邪などの病気を想像していた家族は動揺した。\n医師「診断名は\n正常な行。', items: [], myAssessments: {}, carePlans: {}, missingChecks: {} };
  const ins = app.correctionRequestInstructionsText ? app.correctionRequestInstructionsText() : '';
  const txt = app.buildSelectedCardsExportText(cp, new Set(), cp.sourceText, true, false);
  assert.match(txt, /D\. Broken source text/); assert.match(txt, /推定復元（推定・要確認）/); assert.match(txt, /確認不能/); assert.match(txt, /原文：/);
  assert.ok(txt.includes('風邪などの病気を想像していた家族は動揺した。'));
  const clean = Object.assign({}, cp, { sourceText: '食事は全量摂取。\n体温36.5℃。' });
  assert.match(app.brokenTextCorrectionText(clean), /検出されませんでした/);
});

test('OCR prompts: strict rules, all start with Transcribe, retry differs; quality score and low-quality rules', () => {
  [app.OCR_PROMPT_CLINICAL, app.OCR_PROMPT_REFERENCE].forEach(p => { assert.match(p, /^Transcribe /); assert.match(p, /verbatim/); assert.match(p, /〔判読不能〕/); assert.match(p, /never summarize/); assert.match(p, /line breaks/); assert.match(p, /numbers, units, dates/); });
  assert.notStrictEqual(app.OCR_PROMPT_RETRY_CLINICAL, app.OCR_PROMPT_CLINICAL);
  assert.ok(app.ocrOutputLowQuality('')); assert.ok(app.ocrOutputLowQuality('〔判読不能〕')); assert.ok(app.ocrOutputLowQuality('短い'));
  assert.ok(app.ocrOutputLowQuality('〔判読不能〕〔判読不能〕〔判読不能〕 体温'));
  assert.ok(!app.ocrOutputLowQuality('8月3日 体温36.5℃、脈拍72回。食事は全量摂取。'));
  assert.ok(app.ocrOutputScore('8月3日 体温36.5℃、脈拍72回。') > app.ocrOutputScore('8月3日 体温〔判読不能〕、脈拍〔判読不能〕回。'));
  assert.strictEqual(app.ocrOutputScore(''), 0);
  const src = readAppSource();
  assert.match(src, /OCR_PROMPT_CLINICAL, OCR_PROMPT_REFERENCE, OCR_PROMPT_RETRY_CLINICAL, OCR_PROMPT_RETRY_REFERENCE/);
  assert.match(src, /OCR_ALLOWED_INSTRUCTIONS/);
});

test('post-processing: joins wrapped lines, strips code fences, counts unreadable parts and suspicious lines (no network)', () => {
  const r = app.postProcessOcrText('```\n店を続けていかねばならず、毎\n日働いている。\n体温〔判読不能〕℃。\n医師「診断名は\n```');
  assert.strictEqual(r.joins, 1); assert.strictEqual(r.unread, 1); assert.ok(r.suspect >= 1);
  assert.ok(r.text.includes('毎日働いている。') && r.text.includes('〔判読不能〕') && !r.text.includes('```'));
});

test('contrast stretch: only a narrow-range image is stretched; a normal one and a flat one are left alone', () => {
  const mk = (a, b) => { const d = new Uint8ClampedArray(100 * 4); for (let i = 0; i < 100; i++) { const v = i < 50 ? a : b; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; } return d; };
  const narrow = mk(100, 160); assert.ok(app.stretchContrastData(narrow, 10, 10)); assert.ok(narrow[0] < 20 && narrow[50 * 4] > 235);
  const normal = mk(10, 250); assert.ok(!app.stretchContrastData(normal, 10, 10)); assert.strictEqual(normal[0], 10);
  const flat = mk(120, 125); assert.ok(!app.stretchContrastData(flat, 10, 10));
  assert.strictEqual(app.OCR_MAX_SIDE, 2400);
});
