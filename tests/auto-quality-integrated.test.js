'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
test('main patient view mounts automatic read-only checks',()=>{
 for(const token of ['id="nursing-auto-check"','id="nursing-auto-check-results"','id="nursing-auto-check-run"','cp.items','cp.carePlans','cp.relationMap','window.setInterval(()=>scan(false),5000)'])assert.ok(html.includes(token),token);
});
test('automatic checks never send patient records or invoke generative AI',()=>{
 const match=html.match(/<script>(\s*\/\/ Local, read-only checks[\s\S]*?)<\/script>/);
 assert.ok(match);
 const src=match[1];
 assert.doesNotThrow(()=>new vm.Script(src));
 assert.doesNotMatch(src,/\bfetch\s*\(|XMLHttpRequest|callGeminiAI|localStorage\.setItem|persistData|saveDataAndSync/);
 assert.match(src,/output\.replaceChildren\(\)/);
 assert.match(src,/div\.textContent=/);
});

test('real patient source and organized cards can be inspected side-by-side without transmission',()=>{
 assert.match(html,/id="nursing-source-compare"/);
 assert.match(html,/id="nursing-original-text"/);
 assert.match(html,/id="nursing-organized-text"/);
 assert.match(html,/aria-expanded="false"/);
 assert.match(html,/sourceOutput\.textContent=String\(cp\.sourceText/);
 assert.match(html,/label\.textContent=/);
 const block=html.match(/<script>(\s*\/\/ Local, read-only checks[\s\S]*?)<\/script>/);
 assert.ok(block);
 assert.doesNotThrow(()=>new vm.Script(block[1]));
});

test('clicking a classified card highlights only an exact source match',()=>{
 assert.match(html,/original\.indexOf\(snippet\)/);
 assert.match(html,/document\.createElement\('mark'\)/);
 assert.match(html,/mark\.textContent=/);
 assert.match(html,/完全一致する箇所がありません/);
 const script=html.match(/<script>(\s*\/\/ Local, read-only checks[\s\S]*?)<\/script>/);
 assert.ok(script);assert.doesNotThrow(()=>new vm.Script(script[1]));
});

test('text selection in source highlights candidate cards without changing the data',()=>{
 assert.match(html,/sourceOutput\.addEventListener\('mouseup'/);
 assert.match(html,/window\.getSelection\(\)/);
 assert.match(html,/dataset\.cardText\.includes\(selected\)/);
 assert.match(html,/候補/);
 const script=html.match(/<script>(\s*\/\/ Local, read-only checks[\s\S]*?)<\/script>/);
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
 const match=html.match(/<script>(\s*\/\/ Local, read-only checks[\s\S]*?)<\/script>/);
 assert.ok(match);assert.doesNotThrow(()=>new vm.Script(match[1]));
});
