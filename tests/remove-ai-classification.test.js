'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
test('AI classification path is absent and rule-based extraction remains', () => {
  const source = fs.readFileSync(path.join(root, 'js/07-classification.js'), 'utf8');
  assert.ok(source.includes('withExtractionContext(text, () => groupClinicalPhrasesWithTimestamps(text)'));
  assert.ok(!source.includes("if (classifyMode === 'ai' && globalAppData.apiKey && globalAppData.notebookContent)"));
  assert.ok(!source.includes('const prompt = `あなたは看護アセスメント支援AIです'));
  assert.ok(source.includes("return 'rules'"));
});
