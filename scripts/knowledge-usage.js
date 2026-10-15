'use strict';
// Reports, per registered knowledge source, how many entries are referenced by the sufficiency (充足/未充足) judgment code.
// Usage: node scripts/knowledge-usage.js   (no AI, no network; reads the app through tests/app-helpers.js)
const { loadApp } = require('../tests/app-helpers.js');
const app = loadApp();
const size = x => x == null ? null : Array.isArray(x) ? x.length : x instanceof Set || x instanceof Map ? x.size : Object.keys(x).length;
const labKeys = Object.keys(app.LAB_STANDARDS || {});
const labUsed = labKeys.filter(k => (app.SUF_LAB_NEEDS || {})[k] || k === 'HbA1c' || k === 'Alb');
const opNeeds = row => row.op.some(([text]) => Array.from(app.detectMultipleHendersonTags(text)).length > 0);
const rows = app.CARE_PLAN_KNOWLEDGE || [];
const rm = app.RM_BRIDGE_RULES || [];
const table = [
  ['LAB_STANDARDS (検査値の基準)', labKeys.length, labUsed.length, 2],
  ['LAB_VITAL_DEFS (バイタルの基準)', 4, 4, 3],
  ['CHILD_VITAL_GUIDES (小児のバイタル)', 4, 4, 0],
  ['CARE_PLAN_KNOWLEDGE (看護計画の知識の行)', rows.length, rows.filter(opNeeds).length, 0],
  ['CP_HIGH_RISK_COMBOS (高リスクの組合せ)', size(app.CP_HIGH_RISK_COMBOS), Object.keys(app.SUF_COMBO_NEEDS || {}).filter(k => (app.CP_HIGH_RISK_COMBOS || []).some(c => c.key === k)).length, 0],
  ['RM_BRIDGE_RULES (関連図の因果の鎖)', rm.length, rm.filter(r => r.s && r.t && typeof r.s.test === 'function' && typeof r.t.test === 'function').length, 0],
  ['DISEASE_SYMPTOM_NEEDS (症状→14項目)', size(app.DISEASE_SYMPTOM_NEEDS), size(app.DISEASE_SYMPTOM_NEEDS), 0],
  ['DIAGNOSIS_TAG_HINTS (診断名→14項目、分類のタグのみ)', size(app.DIAGNOSIS_TAG_HINTS), 0, 0]
];
console.log('source | registered | used by sufficiency now | used before v.95');
table.forEach(([n, total, now, before]) => console.log(`${n} | ${total == null ? 'n/a' : total} | ${now == null ? 'n/a' : now} | ${before}`));
console.log('\nunused LAB_STANDARDS keys:', labKeys.filter(k => !labUsed.includes(k)).join(', ') || '(none)');
console.log('rows without any need-mapped OP item:', rows.filter(r => !opNeeds(r)).map(r => r.key).join(', ') || '(none)');
