'use strict';
const t=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const P=path.join(__dirname,'..','clinical-knowledge');
const files=['index.html','checks.html','practice.html','japan.html','ocr-compare.html'];
for(const file of files)t('inline UI JavaScript parses: '+file,()=>{
 const html=fs.readFileSync(path.join(P,file),'utf8');
 const blocks=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
 a.ok(blocks.length>0,file+': missing inline script');
 blocks.forEach((code,i)=>a.doesNotThrow(()=>new vm.Script(code,{filename:file+':script'+i})));
});
