'use strict';
// Review aid only: metadata checks do not establish medical correctness.
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '..', 'clinical-knowledge', 'candidates.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }); // GitHub Actions uses UTC; records are dated in Japan local time
const problems = [];
const seen = new Set();
const allowed = new Set(['assessment-criterion','nursing-intervention','pathophysiology','causal-link','treatment-indication','contraindication']);
for (const c of data.claims || []) {
  const notes = [];
  if (!c.id || seen.has(c.id)) notes.push('Missing or duplicate ID');
  seen.add(c.id);
  if (!allowed.has(c.type)) notes.push('Invalid claim type');
  for (const k of ['statement','scope','limitations']) if (!String(c[k] || '').trim()) notes.push(k + ' is missing');
  if (c.ownerApproval?.status !== 'approved') notes.push('Owner approval missing');
  if (c.status !== 'pending-expert-review') notes.push('Expert review status requires inspection');
  if (c.reviewer) notes.push('Reviewer present; inspect review record');
  if (!Array.isArray(c.sources) || !c.sources.length) notes.push('Sources missing');
  for (const src of c.sources || []) {
    if (!/^https:\/\//.test(src.url || '')) notes.push('Invalid source URL');
    if (!src.title || !src.publisher || !Number.isInteger(src.year)) notes.push('Incomplete source metadata');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.lastChecked || '') || c.lastChecked > date) notes.push('Invalid last-checked date');
  const verification = c.sourceVerification;
  if (!verification || !['not-independently-verified', 'source-text-matched'].includes(verification.status)) notes.push('Unknown source correspondence status');
  if (verification?.status === 'source-text-matched') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(verification.checkedOn || '') || verification.checkedOn > date || !verification.url || !verification.note || !verification.scope) notes.push('Incomplete source correspondence record');
    if (!(c.sources || []).some(src=>src.url === verification.url)) notes.push('Correspondence URL not in registered sources');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.reviewDue || '') || c.reviewDue < date) notes.push('Review deadline missing or expired');
  if (c.patientId || c.patientName || c.personalData) notes.push('Patient-specific fields prohibited');
  if (c.ownerApproval?.date > date) notes.push('Approval date is in the future');
  if (!c.sourceVerification?.limitations) notes.push('Correspondence limitations missing');
  if (notes.length) problems.push({id:c.id,issues:notes});
}
console.log('Knowledge entries: ' + (data.claims || []).length);
console.log('Owner-approved entries: ' + (data.claims || []).filter(c=>c.ownerApproval?.status==='approved').length);
console.log('Expert-reviewed entries: 0 (no expert review is recorded in this registry)');
console.log('Source-text matched entries: ' + (data.claims || []).filter(c=>c.sourceVerification?.status === 'source-text-matched').length);
console.log('Source-text review pending: ' + (data.claims || []).filter(c=>c.sourceVerification?.status !== 'source-text-matched').length);
if (problems.length) {
  console.log(JSON.stringify(problems,null,2));
  process.exitCode = 1;
} else console.log('Metadata checks passed. Clinical validity has NOT been verified.');
