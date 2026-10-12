'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {loadApp}=require('./app-helpers');
const storage=()=>{const entries=new Map();return {getItem:k=>entries.get(k)||null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k),entries};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const setup=(overrides={})=>{const s=storage();const app=loadApp({localStorage:s,console:{...console,warn(){}},...overrides});const st=app.__testHooks.state();st.patients=[{id:'fictional',title:'架空患者',items:[],sourceText:'架空原文'}];st.currentPatientId='fictional';st.apiKey='fictional-key-never-export';return {app,st,s};};
test('Each classification attachment uses the Save schema and full review instructions without credentials',async()=>{
 const requests=[];const {app,st}=setup({fetch:async(url,options)=>{if (!url.endsWith('/classification-delivery')) return {ok:true,json:async()=>[]};requests.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({sent:true,id:JSON.parse(options.body).id})};}});
 const job=app.queueClassificationDelivery(st.patients[0]);await tick();
 assert.equal(requests.length,1);assert.match(requests[0].url,/classification-delivery$/);
 assert.equal(job.backupText.includes('fictional-key-never-export'),false);
 const backup=JSON.parse(job.backupText);assert.equal(backup.schemaVersion,1);assert.equal(backup.patients[0].sourceText,'架空原文');
 assert.match(job.reviewText,/抽出・原文対応・S\/O/);assert.match(job.reviewText,/その後、添付資料全体から意味や場面が類似する情報/);
 assert.equal(job.reviewText.split('【タグ未設定の追加調査】').length-1,1);
});
test('Offline jobs survive reload, retain their captured content and are removed only after confirmed delivery',async()=>{
 const s=storage();const first=setup({localStorage:s,navigator:{onLine:false}});const job=first.app.queueClassificationDelivery(first.st.patients[0]);
 first.st.patients[0].sourceText='後から編集';assert.equal(JSON.parse(job.backupText).patients[0].sourceText,'架空原文');
 let requests=0;const second=setup({localStorage:s,fetch:async(url,options)=>{if (!url.endsWith('/classification-delivery')) return {ok:true,json:async()=>[]};requests++;return {ok:requests>1,json:async()=>({sent:requests>1,id:JSON.parse(options.body).id})};}});
 await second.app.flushClassificationDeliveries();assert.equal(JSON.parse(s.getItem('nursing_classification_mail_outbox_v1')).length,1);
 await second.app.flushClassificationDeliveries();assert.equal(requests,2);assert.equal(s.getItem('nursing_classification_mail_outbox_v1'),'[]');
});
test('Both export variants carry one ordered multi-perspective review and similar-information collection request',()=>{
 const {app,st}=setup();const cp=st.patients[0];for(const out of [app.buildReviewRequestText(cp,cp.sourceText),app.buildSelectedCardsExportText(cp,[],cp.sourceText)]){
  assert.equal(out.split('【タグ未設定の追加調査】').length-1,1);assert.match(out,/既にタグがあっても別のタグを追加できる情報/);
  assert.ok(out.indexOf('各視点から調査')<out.indexOf('その後、添付資料全体'));
 }
});
test('Classification saves before queueing, cancels do not enqueue and delivery never adds UI notifications',()=>{
 const classification=fs.readFileSync(require.resolve('../js/07-classification.js'),'utf8');
 assert.match(classification,/saveDataAndSync\(\);\s*queueClassificationDelivery\(cp\);\s*showToast/);
 assert.ok(classification.indexOf('if (answer === null) return;')<classification.indexOf('queueClassificationDelivery(cp)'));
 const sync=fs.readFileSync(require.resolve('../js/04-server-sync.js'),'utf8').split('const CLASSIFICATION_MAIL_OUTBOX_KEY')[1].split('// { [text]')[0];
 assert.doesNotMatch(sync,/showToast|openDialog|alert\(/);
});
