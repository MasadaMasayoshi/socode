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
  assert.doesNotMatch(source, /id="ai-steps"/);
  assert.doesNotMatch(source, /id="ai-results(?:-tabs)?"/);
  assert.match(source, /id="ocr-dropzone"/);
});

test('rules-based laboratory results can display, former AI results cannot', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'js/05-app-state-and-ui.js'), 'utf8');
  assert.match(html, /<details id="lab-evaluation-panel" class="lab-evaluation hidden">/);
  assert.ok(html.indexOf('id="lab-evaluation-panel"') > html.indexOf('id="view-labs"'));
  assert.doesNotMatch(source, /AI_RESULT_TABS|aiResultsActive|showAiResult|refreshAiResults/);
  for (const panel of ['contradiction-panel', 'diagnosis-panel', 'timeline-panel', 'careplan-panel']) {
    assert.ok(!html.includes('id="' + panel + '"'), 'obsolete AI panel must not reappear: ' + panel);
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
  assert.ok(source.includes('Transcribe all nursing reference text in the image verbatim, in its original language. Return text only.'));
  assert.ok(source.includes('Transcribe all clinical notes and laboratory results in the image verbatim, in their original language. Return text only.'));
});
