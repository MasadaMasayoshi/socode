'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('knowledge catalog remains manual, read-only and auditable', () => {
  const page = fs.readFileSync(path.join(__dirname,'..','clinical-knowledge','index.html'),'utf8');
  assert.match(page, /fetch\('\.\/candidates\.json'/);
  assert.match(page, /sourceVerification/);
  assert.match(page, /review-filter/);
  assert.match(page, /download-catalog/);
  assert.match(page, /rec\.reviewDue/);
  assert.match(page, /textContent = rec\.statement/);
  assert.doesNotMatch(page, /callGeminiAI\(/);
});
test('clinical expert registry remains isolated', () => {
  const claims = JSON.parse(fs.readFileSync(path.join(__dirname,'..','clinical-knowledge','claims.json'),'utf8'));
  const candidates = JSON.parse(fs.readFileSync(path.join(__dirname,'..','clinical-knowledge','candidates.json'),'utf8'));
  assert.equal(claims.claims.length, 0);
  assert.equal(candidates.claims.length, 29);
  assert.ok(candidates.claims.every(x => x.status === 'pending-expert-review'));
});
