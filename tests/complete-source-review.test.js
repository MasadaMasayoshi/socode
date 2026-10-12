'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadApp}=require('./app-helpers');const app=loadApp();
const cards=s=>Array.from(app.classifyTextByRules(s));
const saved=(text,timestamp,extra={})=>({id:'saved',text,timestamp,type:'o',hendersonIds:[],predictionSource:'rule',...extra});
const source='手術当日\n胃体部と膵体部の\n着があり剥離した。また、胆嚢内に結石が認められ、同時に摘出した。\n【病理結果】T2 N0 P0 H0 M0、Stage IB';
test('A readable operative clause is classified while the missing characters stay unresolved',()=>{
 const item=saved('着があり剥離した。また、胆嚢内に結石が認められ、同時に摘出した。','手術当日');
 const cp={sourceText:source,items:[item],carePlans:{written:'保持'},myAssessments:{2:'手書き'}};
 const before=JSON.stringify([item.id,item.text,item.type,cp.carePlans,cp.myAssessments]);
 assert.equal(app.refreshSavedUntaggedCards(cp),1);assert.deepEqual(Array.from(item.hendersonIds),[2]);
 assert.equal(JSON.stringify([item.id,item.text,item.type,cp.carePlans,cp.myAssessments]),before);
 assert.match(item.contextTagEvidence[0].evidence,/胆嚢内に結石/);assert.ok(!item.text.includes('癒着'));
 const r=app.inferUntaggedReason(item,cp);assert.equal(r.kind,'source');assert.deepEqual(Array.from(r.candidates),[2]);assert.match(r.reason,/一部/);
 assert.equal(app.refreshSavedUntaggedCards(cp),0);
 assert.deepEqual(Array.from(app.detectMultipleHendersonTags('着があり剥離した。')),[]);
});
test('Split-card matching uses only the fragment own domain and requires the same event time',()=>{
 const src='手術当日\n胃を全摘した。胆嚢内に結石が認められ、同時に摘出した。呼吸数16回/分。';
 const part='胆嚢内に結石が認められ、同時に摘出した。';
 const c=cards(src),found=app.currentRuleCardForSavedItem(c,saved(part,'手術当日'));
 assert.ok(found);assert.deepEqual(Array.from(found.hendersonIds),[2]);assert.equal(found._sourceMatchKind,'fragment');
 assert.equal(app.currentRuleCardForSavedItem(c,saved(part,'術後1日目')),null);
});
test('Pathology splits map to complete records without learning tags or resolving spelling ambiguity',()=>{
 const src=source+'\n【病理結果】T2 NO PO HO M0、Stage IB',c=cards(src);
 for(const text of ['【病理結果】T2 N0 P0 H0 M0','【病理結果】T2 NO PO HO M0','Stage IB']){
  const item=saved(text,'手術当日'),r=app.currentRuleCardForSavedItem(c,item);assert.ok(r);assert.deepEqual(Array.from(r.hendersonIds),[]);
  const out=app.buildReviewRequestText({title:'架空',items:[item]},src,false);
  assert.match(out,/最新ルールでは統合された原文カードの一部に一致/);
  assert.doesNotMatch(out,/確認不能（本文と日時が一致する原文カードなし）/);
  if(text==='Stage IB')assert.match(out,/親カードの一意な特定は確認不能/);
 }
});
test('Identity and blood type have explicit background reasons without forced need tags',()=>{
 for(const text of ['Q氏、64歳、女性','【血液型】B 型']){
  const r=app.inferUntaggedReason(saved(text,'入院前'));assert.equal(r.kind,'none');assert.equal(r.confidence,'高');assert.deepEqual(Array.from(r.candidates),[]);
 }
});
test('Fresh and legacy excluded day headings own their dates; manual decisions stay intact',()=>{
 const src='入院1日目\n14:00\n呼吸数18回/分\n＜実習2日目(入院2日目、手術前日)＞\n9:00\n呼吸数16回/分';
 const c=cards(src);assert.equal(c.find(i=>i.text.includes('実習2日目')).timestamp,'手術前日');assert.equal(c.find(i=>i.text.includes('16')).timestamp,'手術前日 9:00');
 const heading=saved('<実習2日目(入院2日目、手術前日)>','入院1日目 14:00',{type:'unnecessary'}),cp={sourceText:src,items:[heading]};
 assert.equal(app.refreshSavedUntaggedCards(cp),1);assert.equal(heading.timestamp,'手術前日');assert.equal(heading.type,'unnecessary');
 heading.timestamp='入院1日目 14:00';heading.predictionSource='confirmed';assert.equal(app.refreshSavedUntaggedCards(cp),0);assert.equal(heading.timestamp,'入院1日目 14:00');
});
test('A stale section label is not retained as the time of an explanatory note',()=>{
 const src='手術当日\n【検査データ】\nWBC 10500/μL\nホーマンズ:\n足を背屈させたとき';
 const item=saved('ホーマンズ: 足を背屈させたとき','検査データ'),cp={sourceText:src,items:[item]};
 assert.equal(app.refreshSavedUntaggedCards(cp),1);assert.equal(item.timestamp,'手術当日');assert.equal(item.type,'unnecessary');
});
test('Course staff metadata is excluded by context without excluding unrelated care assignments',()=>{
 const c=cards('23期生 経過別看護過程と援助技術(急性期)\n担当:教員\n事例紹介\n入院前\n担当:長男');
 assert.equal(c.find(i=>i.text.includes('教員')).type,'unnecessary');assert.equal(c.find(i=>i.text.includes('長男')).type,'o');
});
test('Append coverage excludes only fully represented source parents and never partial or other-day evidence',()=>{
 const full='胃を全摘した。胆嚢内に結石が認められ、同時に摘出した。';
 const items=[saved('胃を全摘した。','手術当日'),saved('胆嚢内に結石が認められ、同時に摘出した。','手術当日')];
 // Both fragments must meet the substantive length threshold.
 assert.equal(app.hasCompleteSavedSourceCoverage(items,full,'手術当日'),false);
 items[0].text='腹腔鏡下で胃を全摘した。';const longer=items[0].text+items[1].text;
 assert.equal(app.hasCompleteSavedSourceCoverage(items,longer,'手術当日'),true);
 assert.equal(app.hasCompleteSavedSourceCoverage(items.slice(1),longer,'手術当日'),false);
 assert.equal(app.hasCompleteSavedSourceCoverage(items,longer,'術後1日目'),false);
 assert.equal(app.hasCompleteSavedSourceCoverage(items,longer+'尿量100ml。','手術当日'),false);
});
test('Confirmed, learned and approved fragment decisions are never silently replaced',()=>{
 for(const flags of [{predictionSource:'confirmed'},{predictionSource:'learned'},{tagNotNeeded:true},{editLog:[{kind:'tagRemove',hId:2}]}]){
  const cp={sourceText:source,items:[saved('着があり剥離した。また、胆嚢内に結石が認められ、同時に摘出した。','手術当日',flags)]};const before=JSON.stringify(cp);
  assert.equal(app.refreshSavedUntaggedCards(cp),0);assert.equal(JSON.stringify(cp),before);
 }
});
