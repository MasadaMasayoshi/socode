'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {allowed}=require('../scripts/prepare-release');
const {parseSummary}=require('../scripts/write-regression-evidence');
const {evaluate,REQUIRED}=require('../scripts/check-release-readiness');
test('static payload excludes records, credentials and private fixtures but preserves runtime assets and licenses',()=>{
 for(const p of ['data/patients.json','.env','tests/golden/cases/case.txt','tests/fixtures/public-contracts/v1.json','server.js','docs/release-conditions.json','vendor/.secret.json'])assert.equal(allowed(p),false,p);
 for(const p of ['index.html','js/01-henderson-keywords.js','clinical-knowledge/index.html','vendor/fontawesome/LICENSE.txt','vendor/fonts/OFL-NotoSerifJP.txt','vendor/fonts/NotoSerifJP-subset.woff2'])assert.equal(allowed(p),true,p);
});
test('validation evidence rejects missing summaries, hidden skips, cancellations and failures',()=>{
 const good='# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0';
 assert.equal(parseSummary(good).tests,2);assert.throws(()=>parseSummary('PASS'));
 for(const name of ['fail','cancelled','skipped','todo'])assert.throws(()=>parseSummary(good.replace('# '+name+' 0','# '+name+' 1')));
 assert.throws(()=>parseSummary(good.replace('# pass 2','# pass 1')));
});
test('release decision requires latest-head evidence and every recorded release condition',()=>{
 const head='a'.repeat(40),regression={schemaVersion:1,head,kind:'public-regression',status:'passed',summary:{tests:2,pass:2,fail:0,cancelled:0,skipped:0,todo:0}};
 const browser={schemaVersion:1,head,kind:'browser-smoke',status:'passed',widths:[390,768,1440],scenarioCount:7,uncaughtErrors:0};
 const conditions=Object.fromEntries(REQUIRED.map(k=>[k,{status:'complete',evidence:['review-record']}])) ;
 assert.equal(evaluate(head,regression,browser,conditions).ready,true);
 assert.equal(evaluate('b'.repeat(40),regression,browser,conditions).ready,false);
 assert.equal(evaluate(head,regression,{...browser,widths:[1440]},conditions).ready,false);
 for(const name of REQUIRED)assert.equal(evaluate(head,regression,browser,{...conditions,[name]:{status:'pending',evidence:[]}}).ready,false,name);
 assert.equal(evaluate(head,regression,browser,require('../docs/release-conditions.json')).ready,false);
});
