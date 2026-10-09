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
  if (!c.id || seen.has(c.id)) notes.push('識別子が空または重複');
  seen.add(c.id);
  if (!allowed.has(c.type)) notes.push('知識の分類が不正');
  for (const k of ['statement','scope','limitations']) if (!String(c[k] || '').trim()) notes.push(k + ' が未記入');
  if (c.ownerApproval?.status !== 'approved') notes.push('開発上の承認が未登録');
  if (c.status !== 'pending-expert-review') notes.push('専門家審査の状態を要確認');
  if (c.reviewer) notes.push('専門家の氏名があるため審査記録を別途確認');
  if (!Array.isArray(c.sources) || !c.sources.length) notes.push('出典が未登録');
  for (const src of c.sources || []) {
    if (!/^https:\/\//.test(src.url || '')) notes.push('出典URLが不正');
    if (!src.title || !src.publisher || !Number.isInteger(src.year)) notes.push('出典の書誌情報不足');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.lastChecked || '') || c.lastChecked > date) notes.push('最終確認日の不整合');
  const verification = c.sourceVerification;
  if (!verification || !['not-independently-verified', 'source-text-matched'].includes(verification.status)) notes.push('出典本文の照合状態が不明');
  if (verification?.status === 'source-text-matched') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(verification.checkedOn || '') || verification.checkedOn > date || !verification.url || !verification.note || !verification.scope) notes.push('出典原文との照合記録が不足');
    if (!(c.sources || []).some(src=>src.url === verification.url)) notes.push('照合URLが登録出典と一致しない');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.reviewDue || '') || c.reviewDue < date) notes.push('再確認期限なし、または期限切れ');
  if (c.patientId || c.patientName || c.personalData) notes.push('患者固有データは禁止');
  if (c.ownerApproval?.date > date) notes.push('承認日が未来');
  if (!c.sourceVerification?.limitations) notes.push('照合結果の限界が未記載');
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
