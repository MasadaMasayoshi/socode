'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {summarize,failureExcerpt}=require('../scripts/test-quiet');
const {readSource,excerpt,outline}=require('../scripts/context');
test('bounded source reads preserve line identity and expose truncation',()=>{
 const result=excerpt(['first','second','third'],1,{maxLines:2,maxChars:100});
 assert.equal(result.text,'1: first\n2: second\n');assert.equal(result.nextLine,3);
 const long=excerpt(['x'.repeat(100)],1,{maxChars:20});assert.equal(long.text.length,20);assert.equal(long.truncatedLine,true);assert.equal(long.nextLine,1);
 assert.deepEqual(outline(['function example() {}']),[{name:'example',line:1}]);
});
test('source reader rejects credentials, private storage and untracked files',()=>{
 for(const file of ['.env','data/patients.json','../outside.js','scripts/not-tracked.js'])assert.throws(()=>readSource(file));
 assert.equal(readSource('js/01-henderson-keywords.js').file,'js/01-henderson-keywords.js');
});
test('compact output rejects missing summaries and zero executed tests',()=>{
 assert.throws(()=>summarize('# tests 1\n# pass 1\n'));
 assert.throws(()=>summarize('# tests 0\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n'));
});
test('large failure diagnostics are visibly bounded without pretending success',()=>{
 const result=failureExcerpt('not ok 1 - failed\n  ---\n  error: '+ 'x'.repeat(10000)+'\n  ...',100);
 assert.match(result,/not ok 1/);assert.match(result,/truncated/);assert.ok(result.length<200);
});
test('compact runner retains failed assertions and returns nonzero',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'socode-output-test-'));
 try{
  const fixture=path.join(directory,'failure.test.js');fs.writeFileSync(fixture,"require('node:test')('failure sentinel',()=>{throw Error('diagnostic sentinel')});\n");
  const env={...process.env,SOCODE_TEST_LOG:path.join(directory,'full.log')};delete env.NODE_TEST_CONTEXT;
  const result=spawnSync(process.execPath,[path.join(__dirname,'../scripts/test-quiet.js'),fixture],{encoding:'utf8',env});
  assert.equal(result.status,1);assert.match(result.stdout,/# fail 1/);assert.match(result.stderr,/diagnostic sentinel/);assert.match(fs.readFileSync(path.join(directory,'full.log'),'utf8'),/failure sentinel/);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
