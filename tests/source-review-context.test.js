'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const app=require('./app-helpers').loadApp();
const family='祖母を胃がん、父を前立腺がんで亡くしている';
const screening='がん家系なので、検診を欠かさないようにしていた。';
const source='入院前\n【メディカルヒストリー】\n'+screening+'\n【ファミリーヒストリー】\n'+family;
const card=(id,text,extra={})=>({id,text,type:'o',timestamp:'入院前',hendersonIds:[],predictionSource:'rule',...extra});
test('Family cancer history links only to the documented personal screening behavior',()=>{
 const items=app.classifyTextByRules(source),item=items.find(i=>i.text===family);
 assert.deepEqual(Array.from(item.hendersonIds),[14]);assert.equal(item.contextTagEvidence[0].evidence,screening);assert.equal(item.ruleDecision.ruleId,'context.family-screening');
 assert.deepEqual(Array.from(app.detectMultipleHendersonTags(family)),[]);
 for(const action of ['', '会社の検診を受けた。','がん家系なので検診を受けていない。','がん家系なので検診を受ける予定。','父はがん家系なので検診を受けた。']){
  const result=app.classifyTextByRules('入院前\n'+action+'\n【ファミリーヒストリー】\n'+family).find(i=>i.text===family);
  assert.deepEqual(Array.from(result.hendersonIds),[]);
 }
 const otherTime=app.classifyTextByRules('入院前\n'+screening+'\n手術前日\n'+family).find(i=>i.text===family);assert.deepEqual(Array.from(otherTime.hendersonIds),[]);
 assert.equal(app.inferUntaggedReason(card('f',family)).kind,'none');
});
test('Saved family history updates once without rewriting source, IDs, handwritten work or rejected tags',()=>{
 const item=card('f',family),cp={sourceText:source,items:[item],myAssessments:{14:'手書き'},carePlans:{p:{evidenceIds:['f']}}};
 assert.equal(app.refreshSavedUntaggedCards(cp),1);assert.equal(item.id,'f');assert.equal(item.text,family);assert.deepEqual(Array.from(item.hendersonIds),[14]);assert.equal(cp.myAssessments[14],'手書き');assert.deepEqual(cp.carePlans.p.evidenceIds,['f']);assert.equal(app.refreshSavedUntaggedCards(cp),0);
 for(const flags of [{predictionSource:'confirmed'},{tagNotNeeded:true},{editLog:[{kind:'tagRemove',hId:14}]}])assert.equal(app.refreshSavedUntaggedCards({sourceText:source,items:[card('f',family,flags)]}),0);
 assert.equal(app.refreshSavedUntaggedCards({sourceText:source,items:[card('f',family)]},source,'test',{[family]:{hendersonVotes:{14:0}}}),0);
});
test('Pathology zero/letter variants are retained and flagged only for the same recorded event',()=>{
 const a=card('a','【病理結果】T2 N0 P0 H0 M0、Stage IB',{timestamp:'手術当日'}),b=card('b','【病理結果】T2 NO PO HO M0、Stage IB',{timestamp:'手術当日'}),cp={items:[a,b]};
 const before=JSON.stringify(cp);for(const item of cp.items){const reason=app.inferUntaggedReason(item,cp);assert.equal(reason.kind,'source');assert.match(reason.reason,/数字の0と英字のO/);assert.deepEqual(Array.from(reason.candidates),[]);}
 assert.equal(JSON.stringify(cp),before);b.timestamp='術後1日目';assert.equal(app.inferUntaggedReason(a,cp).kind,'none');
});
test('Fresh structure decisions have provenance; old cards receive an explicitly current replay',()=>{
 const raw='23期生 経過別看護過程と援助技術(急性期)\n担当:教員\n事例紹介\n入院前\nA氏・58歳・男性\n手術当日\n| :--- | :--- |\nホーマンズ:\n足を背屈させたとき';
 const items=app.classifyTextByRules(raw).map((i,k)=>({...i,id:'r'+k}));
 for(const i of items.filter(i=>i.type==='unnecessary'))assert.ok(i.ruleDecision?.reason);
 const identity=items.find(i=>i.text==='A氏・58歳・男性');assert.doesNotMatch(app.inferUntaggedReason(identity).reason,/利用者による統合/);
 const cp={title:'架空',sourceText:raw,items};let out=app.buildSelectedCardsExportText(cp,new Set(items.map(i=>i.id)),raw,false);assert.match(out,/source.table-separator/);assert.match(out,/source.course-staff/);
 items.forEach(i=>delete i.ruleDecision);const before=JSON.stringify(cp);out=app.buildSelectedCardsExportText(cp,new Set(items.map(i=>i.id)),raw,false);assert.match(out,/現在のルールによる再照合（過去の実行理由とは別）/);assert.equal(JSON.stringify(cp),before);
});
test('Complete same-event composites are suppressed; partial, changed, cross-time and edited records remain',()=>{
 const left=card('a',screening),right=card('b','半年前から胃のむかつき感があった。'),parent=card('p',screening+right.text);
 assert.deepEqual(Array.from(app.removeCoveredCompositeCards([parent,left,right]),i=>i.id),['a','b']);
 for(const others of [[left],[left,{...right,text:'半年前から胃痛があった。'}],[left,{...right,timestamp:'手術前日'}]])assert.ok(app.removeCoveredCompositeCards([parent,...others]).includes(parent));
 const manual={...parent,predictionSource:'confirmed'};assert.ok(app.removeCoveredCompositeCards([manual,left,right]).includes(manual));
 const cp={title:'架空',items:[parent,left,right]},before=JSON.stringify(cp);assert.equal((app.buildExportPlainText(cp).match(/がん家系なので/g)||[]).length,1);assert.equal(JSON.stringify(cp),before);
});
