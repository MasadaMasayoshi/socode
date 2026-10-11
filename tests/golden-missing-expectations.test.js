'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'golden/golden-lib.js'),'utf8');
const run=source.slice(source.indexOf('function runGolden('),source.indexOf('function formatReport('));
test('verification without approved expectations fails without writing its own answer',()=>{
 let writes=0;
 const result=vm.runInNewContext(run+'\nrunGolden()',{loadApp:()=>({}),listCases:()=>['missing'],classifyCase:()=>[{text:'a'}],readExpected:()=>null,writeExpected:()=>writes++,diffCase:()=>[]});
 assert.equal(writes,0);assert.equal(result[0].missingExpected,true);assert.ok(result[0].diff.length);
});
test('a missing answer report asks for restoration rather than regenerating its own answer',()=>{
 const fn=source.slice(source.indexOf('function formatReport('),source.indexOf('module.exports ='));
 const report=vm.runInNewContext(fn+'\nformatReport([{name:"missing",cards:1,missingExpected:true,diff:["missing"]}])');
 assert.match(report,/元の承認済みファイルから復旧/);assert.doesNotMatch(report,/npm run golden:update/);
});
