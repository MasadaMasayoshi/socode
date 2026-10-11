'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readAppSource } = require('./app-helpers');

test('relation-map reviewer flags inferred causal connections without evidence explanations', () => {
  const source = readAppSource();
  assert.match(source, /clinical-causality-unverified/);
  for (const relation of ['causes','contributes_to','results_in','manifests_as','increases_risk_of','may_contribute_to']) {
    assert.ok(source.includes("'"+relation+"'"), 'clinical relationship coverage: '+relation);
  }
  assert.match(source, /rmEpistemicStatus\(a\) === 'inferred'/);
  assert.match(source, /!String\(e\.evidence \|\| ''\)\.trim\(\)/);
});

test('care-plan evidence and clinical-knowledge review gates remain present', () => {
  const source = readAppSource();
  assert.match(source, /function cpQualityGate\(cp\)/);
  assert.match(source, /function validateCarePlanEvidence\(cp, /);
  assert.match(source, /function validateRelationMap\(map, cp = null\)/);
});
