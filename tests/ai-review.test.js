'use strict';
// AI classification review (ask Gemini to evaluate tags/timeline/extraction) was retired:
// AI is image-OCR only and quality checks are local rules (AGENTS.md, docs/public-regression-migration-20261010.md).
// These tests pin that decision so the review UI/prompt builders do not come back by accident.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp, readAppSource } = require('./app-helpers');
const app = loadApp();
const src = readAppSource();
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('AI review prompt/answer parsers are retired (AI is OCR-only)', () => {
  ['buildAiReviewPrompt', 'parseAiReviewJson', 'openAiReview', 'downloadAiReview'].forEach(n => {
    assert.equal(typeof app[n], 'undefined', n);
    assert.doesNotMatch(src, new RegExp(`function ${n}\\b`), n);
  });
});

test('No AI review entry point remains in the board or the assessment table tools', () => {
  assert.doesNotMatch(html, /btn-open-ai-review|modal-ai-review|openAiReview\(|downloadAiReview\(/);
  assert.doesNotMatch(src, /label: '分類の評価'.*openAiReview/);
});

test('The only remaining Gemini text calls are image transcription', () => {
  const calls = src.match(/callGeminiAI\(\[\{ parts: \[\{ text: "[^"]{0,40}/g) || [];
  assert.ok(calls.length >= 1);
  calls.forEach(c => assert.match(c, /Transcribe/, c));
});
