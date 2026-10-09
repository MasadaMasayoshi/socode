'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
test('main patient view mounts automatic read-only checks',()=>{
 for(const token of ['id="nursing-auto-check"','id="nursing-auto-check-results"','id="nursing-auto-check-run"','cp.items','cp.carePlans','cp.relationMap','window.setInterval(()=>scan(false),5000)'])assert.ok(html.includes(token),token);
});
test('automatic checks never send patient records or invoke generative AI',()=>{
 const match=html.match(/<script>\s*\/\/ Local, read-only checks([\s\S]*?)<\/script>/);
 assert.ok(match);
 const src=match[1];
 assert.doesNotThrow(()=>new vm.Script(src));
 assert.doesNotMatch(src,/\bfetch\s*\(|XMLHttpRequest|callGeminiAI|localStorage\.setItem|persistData|saveDataAndSync/);
 assert.match(src,/output\.replaceChildren\(\)/);
 assert.match(src,/div\.textContent=/);
});
