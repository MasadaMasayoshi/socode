'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const folder=path.join(__dirname,'..','clinical-knowledge');
const data=JSON.parse(fs.readFileSync(path.join(folder,'learning-modules.json'),'utf8'));
const page=fs.readFileSync(path.join(folder,'learning.html'),'utf8');
test('all four nursing process stages have substantial non-AI lessons',()=>{
 assert.equal(data.schemaVersion,1);assert.equal(data.modules.length,4);
 for(const m of data.modules){assert.ok(m.intro.length>=25);assert.ok(m.sections.length>=3);assert.ok(m.exercise.includes('架空'));for(const s of m.sections){assert.ok(s.heading);assert.ok(s.text.length>=70);}}
});
test('course is accessible and uses escaped text, not patient data',()=>{
 assert.match(page,/aria-label="講義の目次"/);
 assert.match(page,/textContent=part\.text/);
 assert.match(page,/learning-modules\.json/);
 assert.doesNotMatch(page,/callGeminiAI/);
 const scripts=[...page.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);assert.doesNotThrow(()=>new vm.Script(scripts[0][1]));
});
