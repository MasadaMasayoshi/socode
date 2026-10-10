'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','clinical-knowledge','ocr-compare.html'),'utf8');
test('OCR comparison accepts only image files and remains local-only',()=>{
 assert.match(html,/image\/jpeg/);assert.match(html,/image\/png/);assert.match(html,/image\/webp/);
 assert.match(html,/URL\.createObjectURL/);assert.match(html,/URL\.revokeObjectURL/);
 assert.match(html,/NursingQualityChecks\.ocr/);
 assert.doesNotMatch(html,/callGeminiAI\(|fetch\(|XMLHttpRequest|localStorage/);
});
test('OCR review never implicitly treats OCR as source of truth',()=>{
 assert.match(html,/手入力した原文/);assert.match(html,/数値の個数・順序・表記に違い/);
});
