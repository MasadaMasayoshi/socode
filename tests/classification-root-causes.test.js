'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadApp}=require('./app-helpers');const app=loadApp();
const card=(id,text,extra={})=>({id,text,timestamp:'手術前日',type:'o',hendersonIds:[],predictionSource:'rule',...extra});
const merge=(id,sources,text=sources.map(s=>s.text).join('、'))=>card(id,text,{predictionSource:'confirmed',editLog:[{kind:'merge',actor:'user',sourceCards:sources,resultIds:[id]}]});
test('Fresh classification keeps a patient identity in one background card, not three needs',()=>{
 for(const text of ['A 氏・58 歳・男性','A氏、58歳、男性','A氏,58歳,男性']){
  const items=app.classifyTextByRules('入院前\n'+text).filter(i=>i.type!=='unnecessary');
  assert.equal(items.length,1);assert.equal(items[0].text,text);assert.deepEqual(Array.from(items[0].hendersonIds),[]);
 }
 const parts=app.classifyTextByRules('手術当日\n輸液開始・酸素投与開始');
 assert.ok(parts.length>0);assert.ok(parts.some(i=>i.text.includes('酸素')));
 const changed=app.classifyTextByRules('入院前\nA氏・58歳・男性\n手術前日\n呼吸苦あり');
 assert.ok(changed.some(i=>i.text.includes('呼吸苦')&&i.hendersonIds.includes(1)));
});
test('Recursive merge ancestry matches source leaves and excludes changed or missing events',()=>{
 const a=card('a','【呼吸機能】%肺活量110.6%'),b=card('b','一秒率69.33%'),c=card('c','胸部レントゲン異常なし');
 const first=merge('ab',[a,b]),last=merge('abc',[first,c]);const before=JSON.stringify(last);
 const retained=app.preservedUserCardsForClassification([last],[a,b,c]);assert.deepEqual(Array.from(retained,i=>i.id),['abc']);
 for(const source of [a,b,c])assert.equal(app.coveredByManualClassification(source,retained),true);
 assert.equal(app.preservedUserCardsForClassification([last],[a,b]).length,0);
 assert.equal(app.preservedUserCardsForClassification([last],[a,b,{...c,timestamp:'術後1日目'}]).length,0);
 assert.equal(JSON.stringify(last),before);
});
test('Split descendants inside later merges count as siblings without covering a missing split',()=>{
 const parent=card('parent','食事は全量摂取。水分摂取も可能。');
 const split=['食事は全量摂取。','水分摂取も可能。'].map((text,k)=>card('split'+k,text,{editLog:[{kind:'split',actor:'user',sourceCards:[parent],resultIds:['split0','split1']}]}));
 const third=card('third','シャワー浴実施');const joined=merge('joined',[split[0],third]);
 const retained=app.preservedUserCardsForClassification([joined,split[1]],[parent,third]);assert.equal(retained.length,2);assert.equal(app.coveredByManualClassification(parent,retained),true);
 assert.equal(app.preservedUserCardsForClassification([joined],[parent,third]).length,0);assert.equal(app.coveredByManualClassification(parent,[joined]),false);
});
test('Type learning retains current field evidence and explicit tag removals remain effective',()=>{
 const chunk={fieldLabel:'アレルギー'},text='なし';
 assert.deepEqual(Array.from(app.computeLocalTagsAndType(chunk,text,{preferredType:'o'}).detectedHIds),[9]);
 assert.deepEqual(Array.from(app.computeLocalTagsAndType(chunk,text,{preferredType:'o',hendersonVotes:{9:0}}).detectedHIds),[]);
 assert.deepEqual(Array.from(app.computeLocalTagsAndType({},'A氏・58歳・男性',{preferredHendersonIds:[9]}).detectedHIds),[]);
 const title=app.computeLocalTagsAndType({isUnnecessaryBoilerplate:true},'事例紹介',{preferredType:'o',preferredHendersonIds:[9]});
 assert.equal(title.predictedType,'unnecessary');assert.deepEqual(Array.from(title.detectedHIds),[]);
});
test('Unedited learned cards acquire missing source-backed tags once, with user data unchanged',()=>{
 for(const predictionSource of ['rule','learned','fuzzy','tied']){
  const item=card('shower','シャワー浴実施',{predictionSource}),cp={sourceText:'手術前日\nシャワー浴実施',items:[item],myAssessments:{8:'手書き評価'},carePlans:{keep:{evidenceIds:['shower']}}};
  assert.equal(app.refreshSavedUntaggedCards(cp),1);assert.deepEqual(Array.from(item.hendersonIds),[8]);
  assert.equal(item.type,'o');assert.equal(item.id,'shower');assert.equal(cp.myAssessments[8],'手書き評価');assert.deepEqual(cp.carePlans.keep.evidenceIds,['shower']);
  assert.equal(app.refreshSavedUntaggedCards(cp),0);
 }
 const item=card('shower','シャワー浴実施',{predictionSource:'learned'}),cp={sourceText:'手術前日\nシャワー浴実施',items:[item]};
 assert.equal(app.refreshSavedUntaggedCards(cp,cp.sourceText,'test',{'シャワー浴実施':{hendersonVotes:{8:0}}}),0);
 for(const flags of [{predictionSource:'confirmed'},{editLog:[{kind:'tagRemove',actor:'user',hId:8}]},{tagNotNeeded:true}]){
  const protectedPatient={sourceText:cp.sourceText,items:[{...item,...flags}]};assert.equal(app.refreshSavedUntaggedCards(protectedPatient),0);
 }
});
