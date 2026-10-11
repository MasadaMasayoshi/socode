'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'js/12-missing-checks-and-care-plan.js'), 'utf8');
test('deprecated AI plan import is disabled', () => {
 assert.ok(source.includes("window.importCarePlansUI = function()"));
 assert.ok(source.includes("AIの結果からの取り込みは廃止しました"));
 assert.ok(!source.includes("const aiCount = cp.carePlanResult ?"));
});
test('manual care-plan and relation-map import are still available', () => {
 assert.ok(source.includes("function importCarePlansFromMap("));
 assert.ok(source.includes("window.importCarePlansFromMapUI = function()"));
 assert.ok(source.includes("function createCarePlan("));
});
