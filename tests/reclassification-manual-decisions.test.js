'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadApp}=require('./app-helpers');const app=loadApp();
const original=(id,text,timestamp='手術前日')=>({id,text,timestamp,type:'o',hendersonIds:[],predictionSource:'rule'});
const sources=[original('a','【呼吸機能】%肺活量110.6%'),original('b','一秒率69.33%')];
const merged=()=>({...original('merged','%肺活量110.6%、一秒率69.33%'),predictionSource:'confirmed',editLog:[{kind:'merge',actor:'user',sourceCards:structuredClone(sources),resultIds:['merged']}]});
test('Same-event merge and exclusion decisions survive replacement without mutating their IDs or histories',()=>{
 const merge=merged(),exclude={...original('exclude','記録者:担当者'),type:'unnecessary',predictionSource:'confirmed',editLog:[{kind:'type',actor:'user',from:'o',to:'unnecessary'}]};
 const existing=[merge,exclude,original('automatic','自動カード')],before=JSON.stringify(existing);
 const actual=app.preservedUserCardsForClassification(existing,[...sources,original('current','記録者:担当者')]);
 assert.deepEqual(Array.from(actual,i=>i.id),['merged','exclude']);assert.equal(JSON.stringify(existing),before);
 for(const part of sources)assert.equal(app.coveredByManualClassification(part,actual),true);
});
test('Changed source, missing merge input and different dates do not replay old user decisions',()=>{
 const merge=merged();assert.equal(app.preservedUserCardsForClassification([merge],[sources[0]]).length,0);
 assert.equal(app.preservedUserCardsForClassification([merge],sources.map(s=>({...s,timestamp:'術後1日目'}))).length,0);
 assert.equal(app.coveredByManualClassification({...sources[0],timestamp:'術後1日目'},[merge]),false);
 assert.equal(app.coveredByManualClassification({...sources[0],text:sources[0].text+'。追加所見あり。'},[merge]),false);
 assert.equal(app.preservedUserCardsForClassification([],[...sources]).length,0);
});
test('Historical short identity fragments match only their complete ordered same-event source card',()=>{
 const fragments=['A氏','58歳','男性'].map((text,k)=>original('name'+k,text,'入院前'));
 const item={...original('identity','A氏、58歳、男性','入院前'),predictionSource:'confirmed',editLog:[{kind:'merge',actor:'user',sourceCards:fragments}]};
 const parent=original('combined','A氏58歳男性','入院前');
 assert.equal(app.preservedUserCardsForClassification([item],[parent]).length,1);assert.equal(app.coveredByManualClassification(parent,[item]),true);
 for(const p of [{...parent,text:'A氏58歳女性'},{...parent,timestamp:'入院1日目'},{...parent,text:parent.text+'。別の記録'}])assert.equal(app.preservedUserCardsForClassification([item],[p]).length,0);
});
test('Complete manual split groups also prevent re-creating the original combined card',()=>{
 const parent=original('source','食事は全量摂取。水分摂取も可能。');
 const items=['食事は全量摂取。','水分摂取も可能。'].map((text,k)=>({...original('split'+k,text),editLog:[{kind:'split',actor:'user',sourceCards:[parent],resultIds:['split0','split1']}]}));
 const retained=app.preservedUserCardsForClassification(items,[parent]);assert.equal(retained.length,2);assert.equal(app.coveredByManualClassification(parent,retained),true);
 assert.equal(app.preservedUserCardsForClassification(items.slice(0,1),[parent]).length,0);assert.equal(app.coveredByManualClassification(parent,items.slice(0,1)),false);
});
test('An exclusion applies to its own source and event, including after serialization',()=>{
 const item={...original('excluded','記録者:担当者'),type:'unnecessary',predictionSource:'confirmed'};
 assert.equal(app.preservedUserCardsForClassification(JSON.parse(JSON.stringify([item])),[original('src',item.text)]).length,1);
 assert.equal(app.preservedUserCardsForClassification([item],[original('src','別の担当者')]).length,0);
 assert.equal(app.preservedUserCardsForClassification([item],[original('src',item.text,'術後1日目')]).length,0);
});
