'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
test('non-image Gemini requests are rejected at common entry point', () => {
  const source = fs.readFileSync(path.join(root, 'js/05-app-state-and-ui.js'), 'utf8');
  assert.match(source, /async function callGeminiAIOnce\(contents, options = \{\}\)/);
  assert.match(source, /if \(!hasImage \|\| options\.ocr !== true\) throw new Error\('AI機能は画像の文字認識/);
  assert.match(source, /p\.inline_data \|\| p\.file_data/);
  assert.ok(source.indexOf('if (!hasImage || options.ocr !== true) throw new Error') < source.indexOf('requestGemini(globalAppData.apiKey, body)'), 'network request must follow gate');
});
test('AI analysis results remain hidden, non-AI checks and OCR remain available', () => {
  const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(source, /id="ai-steps" class="ai-steps"/);
  assert.match(source, /id="ai-results" class="ai-results hidden"/);
  assert.match(source, /画像OCRドロップゾーン/);
});

test('rules-based laboratory results can display, former AI results cannot', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'js/05-app-state-and-ui.js'), 'utf8');
  assert.ok(html.includes('id="ai-results" class="ai-results hidden"'));
  assert.ok(!html.includes('id="ai-results" class="ai-results hidden" hidden'));
  const tabs = source.split('const AI_RESULT_TABS = [')[1].split('];')[0];
  assert.ok(tabs.includes("'lab-evaluation-panel'"));
  for (const panel of ['contradiction-panel', 'diagnosis-panel', 'timeline-panel', 'careplan-panel']) {
    assert.ok(!tabs.includes("'" + panel + "'"), 'obsolete AI tab must not reappear: ' + panel);
  }
});

test('both image-upload workflows explicitly opt into OCR only', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/10-reference-page-and-startup.js'), 'utf8');
  const calls = source.match(/callGeminiAI\(\[\{ parts: \[/g) || [];
  assert.equal(calls.length, 2);
  assert.equal((source.match(/\], \{ ocr: true \}\);/g) || []).length, 2);
});

test('OCR gate permits exactly one image with a supported MIME type', () => {
 const source = fs.readFileSync(path.join(root, 'js/05-app-state-and-ui.js'), 'utf8');
 assert.ok(source.includes('contents.length !== 1 || parts.length !== 2 || images.length !== 1 || textParts.length !== 1'));
 assert.ok(source.includes("imagePart.mime_type || ''"));
 assert.ok(source.includes('image\\/(?:jpeg|png|webp|gif)'));
 assert.ok(source.indexOf('contents.length !== 1') < source.indexOf('requestGemini(globalAppData.apiKey, body)'));
});

test('OCR-only API gate rejects arbitrary image-attached prompts', () => {
  const source = fs.readFileSync(path.join(root, 'js/05-app-state-and-ui.js'), 'utf8');
  assert.ok(source.includes('const OCR_ALLOWED_INSTRUCTIONS = new Set(['));
  assert.ok(source.includes('OCR_ALLOWED_INSTRUCTIONS.has(textParts[0])'));
  assert.ok(source.includes('画像に含まれる看護基準・プロトコル・参考資料の内容を正確に文字起こししてください。'));
  assert.ok(source.includes('画像に含まれるカルテ記載や検査データ結果（WBC, CRP, Hb, クレアチニン等）を正確に文字起こししてください。'));
});
