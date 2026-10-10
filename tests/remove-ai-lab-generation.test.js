'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
test('laboratory assessment no longer has Gemini prose generation', () => {
 const text = fs.readFileSync(path.join(root, 'js/08-assessment-tools.js'), 'utf8');
 assert.ok(text.includes('window.evaluateLabValuesAI = guardAiStep'));
 assert.ok(text.includes('const rule = buildLabAssessment(cp)'));
 assert.ok(text.includes('evaluateLabFindings(oItems)'));
 assert.ok(!text.includes('const text = await callGeminiAI('));
});
test('OCR endpoint remains and text-only calls stay blocked', () => {
 const text = fs.readFileSync(path.join(root, 'js/05-app-state-and-ui.js'), 'utf8');
 assert.ok(text.includes('p.inline_data || p.file_data'));
 assert.ok(text.includes("if (!hasImage || options.ocr !== true) throw new Error("));
});
