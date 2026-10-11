'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
test('automatic quality checks and background scanning are removed',()=>{
 assert.doesNotMatch(html,/nursing-auto-check|nursing-toggle-warnings|NursingPatientQuality|patient-quality\.js|function scan\(force\)/);
});

test('real patient source and organized cards can be inspected side-by-side without transmission',()=>{
 assert.match(html,/id="nursing-source-compare"/);
 assert.match(html,/id="nursing-original-text"/);
 assert.match(html,/id="nursing-organized-text"/);
 assert.match(html,/aria-expanded="false"/);
 assert.match(html,/sourceOutput\.textContent=String\(cp\.sourceText/);
 assert.match(html,/label\.textContent=/);
 const block=html.match(/<script>(\s*\/\/ Manual source comparison[\s\S]*?)<\/script>/);
 assert.ok(block);
 assert.doesNotThrow(()=>new vm.Script(block[1]));
});

test('clicking a classified card highlights only an exact source match',()=>{
 assert.match(html,/findSourceExactMatches\(original,snippet\)/);
 assert.match(html,/document\.createElement\('mark'\)/);
 assert.match(html,/mark\.textContent=/);
 assert.match(html,/完全一致する箇所がありません/);
 const script=html.match(/<script>(\s*\/\/ Manual source comparison[\s\S]*?)<\/script>/);
 assert.ok(script);assert.doesNotThrow(()=>new vm.Script(script[1]));
});

test('text selection in source highlights candidate cards without changing the data',()=>{
 assert.match(html,/sourceOutput\.addEventListener\('mouseup'/);
 assert.match(html,/window\.getSelection\(\)/);
 assert.match(html,/findSourceExactMatches\(button\.dataset\.cardText,selected\)/);
 assert.match(html,/候補/);
 const script=html.match(/<script>(\s*\/\/ Manual source comparison[\s\S]*?)<\/script>/);
 assert.ok(script);assert.doesNotThrow(()=>new vm.Script(script[1]));
});

test('undo and redo guard against overwriting later edits',()=>{
 assert.match(html,/id="nursing-undo-text"/);
 assert.match(html,/id="nursing-redo-text"/);
 assert.match(html,/item\.text!==entry\.before/);
 assert.match(html,/item\.text!==entry\.to/);
 assert.match(html,/undoOf:target\.entry\.at/);
 assert.match(html,/redoOf:entry\.at/);
 assert.match(html,/saveDataAndSync\(\)/);
 const match=html.match(/<script>(\s*\/\/ Manual source comparison[\s\S]*?)<\/script>/);
 assert.ok(match);assert.doesNotThrow(()=>new vm.Script(match[1]));
});


test('original source coverage reports unmatched sentences as review candidates only',()=>{
 assert.match(html,/id="nursing-source-coverage"/);
 assert.match(html,/unmatched\.length/);
 assert.match(html,/抽出漏れとは断定しません/);
 const block=html.match(/<script>(\s*\/\/ Manual source comparison[\s\S]*?)<\/script>/);
 assert.ok(block);assert.doesNotThrow(()=>new vm.Script(block[1]));
});

test('manual tools live in a closed dialog outside the main layout',()=>{
 const main=html.match(/<main[\s\S]*?<\/main>/)[0];
 assert.doesNotMatch(main,/nursing-manual-review/);
 assert.match(html,/<dialog id="nursing-manual-review" aria-labelledby=/);
 assert.match(html,/id="btn-manual-review"/);
 assert.match(html,/showModal\(\)/);
});
