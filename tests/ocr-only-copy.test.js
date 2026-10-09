'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
test('legacy AI workflow help is removed, manual care plans remain', () => {
 const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
 const care = fs.readFileSync(path.join(root, 'js/12-missing-checks-and-care-plan.js'), 'utf8');
 assert.ok(!care.includes('「AI分析ツール」で作った看護計画'));
 assert.ok(care.includes('「＋看護計画を追加」から看護問題'));
 assert.ok(html.includes('画像OCRの読取結果は必ず原画像と照合してください'));
 assert.ok(html.includes('OCR）のみに使用します'));
});
