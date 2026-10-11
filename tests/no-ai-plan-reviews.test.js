'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js/12-missing-checks-and-care-plan.js'), 'utf8');

test('non-AI nursing plan review remains available', () => {
  assert.ok(src.includes('function cpQualityGate(cp)'));
  assert.ok(src.includes('function reviewCarePlanSet(cp)'));
  assert.ok(src.includes('function carePlanSetReviewHtml(cp)'));
  assert.ok(src.includes('function buildCarePlansPrintHtml(cp'));
});
test('legacy AI review output is no longer presented', () => {
  assert.ok(!src.includes('const ai = p.aiReview && Array.isArray(p.aiReview.items) ? p.aiReview : null;'));
  assert.ok(!src.includes('const ai = carePlanSetState.ai[cp.id];'));
  assert.ok(!src.includes('${modelHtml}${aiHtml}</div>'));
});
