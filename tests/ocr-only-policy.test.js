'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
test('non-image Gemini requests are rejected at common entry point', () => {
  const source = fs.readFileSync(path.join(root, 'js/05-app-state-and-ui.js'), 'utf8');
  assert.match(source, /async function callGeminiAIOnce\(contents, options = \{\}\)/);
  assert.match(source, /if \(!hasImage\) throw new Error\('AI機能は画像の文字認識/);
  assert.match(source, /p\.inline_data \|\| p\.file_data/);
  assert.ok(source.indexOf('if (!hasImage) throw new Error') < source.indexOf('requestGemini(globalAppData.apiKey, body)'), 'network request must follow gate');
});
test('AI analysis panels remain hidden and OCR input remains visible', () => {
  const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(source, /id="ai-steps" class="ai-steps hidden"/);
  assert.match(source, /id="ai-results" class="ai-results hidden"/);
  assert.match(source, /画像OCRドロップゾーン/);
});
