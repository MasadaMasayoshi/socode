'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const registry = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'clinical-knowledge', 'claims.json'), 'utf8'));
const TODAY = new Date().toISOString().slice(0, 10);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TYPES = new Set(['pathophysiology', 'causal-link', 'treatment-indication', 'nursing-intervention', 'contraindication', 'assessment-criterion']);
const EVIDENCE_KINDS = new Set(['guideline','peer-reviewed','textbook','official-standard']);

test('clinical claims have reviewable, non-patient-specific evidence and scope', () => {
  assert.equal(registry.schemaVersion, 1);
  assert.ok(Array.isArray(registry.claims));
  const seen = new Set();
  for (const claim of registry.claims) {
    assert.match(claim.id || '', /^[a-z0-9][a-z0-9-]{3,}$/);
    assert.ok(!seen.has(claim.id), 'duplicate clinical claim ID: ' + claim.id);
    seen.add(claim.id);
    assert.ok(TYPES.has(claim.type), claim.id + ': unsupported claim type');
    assert.ok(typeof claim.statement === 'string' && claim.statement.trim().length >= 12, claim.id + ': statement required');
    assert.ok(typeof claim.scope === 'string' && claim.scope.trim().length >= 6, claim.id + ': explicit applicability required');
    assert.ok(typeof claim.limitations === 'string' && claim.limitations.trim(), claim.id + ': limitations required');
    assert.ok(Array.isArray(claim.sources) && claim.sources.length > 0, claim.id + ': clinical source required');
    for (const source of claim.sources) {
      assert.ok(EVIDENCE_KINDS.has(source.kind), claim.id + ': source kind');
      assert.ok(typeof source.title === 'string' && source.title.trim(), claim.id + ': source title');
      assert.ok(typeof source.publisher === 'string' && source.publisher.trim(), claim.id + ': publisher');
      assert.ok(typeof source.url === 'string' && /^https:\/\//.test(source.url), claim.id + ': https source URL');
      assert.ok(Number.isInteger(source.year) && source.year >= 1990 && source.year <= 2100, claim.id + ': source year');
    }
    assert.ok(DATE.test(claim.lastReviewed || '') && !Number.isNaN(Date.parse(claim.lastReviewed)), claim.id + ': review date');
    assert.ok(DATE.test(claim.reviewDue || '') && !Number.isNaN(Date.parse(claim.reviewDue)), claim.id + ': review due');
    assert.ok(claim.reviewDue >= claim.lastReviewed, claim.id + ': invalid review interval');
    assert.ok(claim.reviewDue >= TODAY, claim.id + ': expired evidence review');
    assert.equal(claim.status, 'approved', claim.id + ': only approved knowledge may be used');
    assert.ok(typeof claim.reviewer === 'string' && claim.reviewer.trim(), claim.id + ': reviewer required');
    assert.ok(!('patientId' in claim) && !('patientName' in claim), claim.id + ': personal patient fields are not allowed');
  }
});

test('source candidates are isolated from approved clinical knowledge', () => {
  const candidates = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'clinical-knowledge', 'candidates.json'), 'utf8'));
  assert.equal(candidates.schemaVersion, 1);
  const approvedIds = new Set(registry.claims.map(x => x.id));
  assert.ok(Array.isArray(candidates.claims));
  for (const claim of candidates.claims) {
    assert.equal(claim.status, 'pending-expert-review');
    assert.ok(!approvedIds.has(claim.id), 'unapproved claim must not be in approved registry: ' + claim.id);
    assert.ok(TYPES.has(claim.type));
    assert.ok(typeof claim.scope === 'string' && claim.scope.trim());
    assert.ok(typeof claim.limitations === 'string' && claim.limitations.trim());
    assert.ok(Array.isArray(claim.sources) && claim.sources.length > 0);
    claim.sources.forEach(src => {
      assert.ok(EVIDENCE_KINDS.has(src.kind));
      assert.ok(typeof src.url === 'string' && src.url.startsWith('https://'));
      assert.ok(src.title && src.publisher);
    });
  }
});
