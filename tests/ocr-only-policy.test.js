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
