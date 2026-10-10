'use strict';
// Uses a temporary server and fictional observations only; never loads real records.
const { chromium } = require('playwright');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'nursing-browser-'));
process.env.NURSING_DATA_DIR=data;
process.env.MONGODB_URI='';
const {app}=require('../server');
(async()=>{
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 let browser;
 try {
  browser=await chromium.launch();
  fs.mkdirSync('browser-artifacts',{recursive:true});
  for(const width of [390,768,1440]){
   const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<768});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'networkidle'});
   await page.waitForFunction(()=>typeof getCurrentPatient==='function'&&!!getCurrentPatient());
   // Exercise the real file-input/OCR UI with an intercepted transport; this is not live-provider verification.
   let ocrRequests=0;
   await page.route('https://generativelanguage.googleapis.com/**', async route=>{
    const body=route.request().postDataJSON();
    assert.equal(body.contents.length,1);
    assert.equal(body.contents[0].parts.length,2);
    assert.equal(body.contents[0].parts.filter(p=>p.inline_data).length,1);
    ocrRequests++;
    await route.fulfill({json:{candidates:[{content:{parts:[{text:'架空OCR通信検証'}]},finishReason:'STOP'}]}});
   });
   await page.evaluate(()=>{globalAppData.apiKey='AIza-fictitious-browser-test-key';});
   const image={name:'fictional.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=','base64')};
   await page.locator('#ocr-file-input').setInputFiles(image);
   await page.locator('#modal-dialog').waitFor({state:'visible'});
   await page.locator('#dialog-confirm').click();
   await page.waitForFunction(()=>document.getElementById('source-text').value.includes('架空OCR通信検証'));
   const firstOcr=await page.locator('#source-text').inputValue();
   await page.locator('#ocr-file-input').setInputFiles(image);
   await page.waitForFunction(first=>document.getElementById('source-text').value.length>first,firstOcr.length);
   assert.equal(ocrRequests,2,'selecting the same image retries the real UI');
   const beforeInvalid=await page.locator('#source-text').inputValue();
   await page.locator('#ocr-file-input').setInputFiles({name:'invalid.pdf',mimeType:'application/pdf',buffer:Buffer.from('fictional invalid input')});
   assert.equal(await page.locator('#source-text').inputValue(),beforeInvalid);
   assert.equal(ocrRequests,2);
   await page.evaluate(()=>{globalAppData.apiKey='';});
   await page.unroute('https://generativelanguage.googleapis.com/**');

   const labBatch=await page.evaluate(()=>{
    const card=(id,text,timestamp)=>({id,type:'o',text,timestamp});
    const shuffled=[card('late','AST 200 U/L','術後2日目 12:00'),card('early','AST 50 U/L','術後1日目 09:00'),card('morning','AST 150 U/L','術後2日目 08:00')];
    const mixed=[card('a','WBC 5000 /μL','術前'),card('b','WBC 5 ×10^3/μL','術後1日目')];
    const text=buildLabAssessment({items:mixed}).html;
    const unknown=buildLabAssessment({items:mixed.map(i=>({...i,timestamp:'日時不明'}))}).html;
    const maternal=analyzeLabData({items:[card('child','新生児：SpO2 88%','産褥1日目'),card('mother','SpO2 98%','産褥1日目')]});
    return {order:analyzeLabData({items:shuffled}).labs.map(l=>l.itemId),sameUnits:text.includes('5,000 → 5,000 /μL'),unknown:unknown.includes('日時の順序を確認できない')&&!unknown.includes('推移：'),maternal:maternal.vitals.length===1&&maternal.vitals[0].value===98};
   });
   assert.deepEqual(labBatch,{order:['early','morning','late'],sameUnits:true,unknown:true,maternal:true});
   const labStatuses=await page.evaluate(()=>[3,5,9].flatMap(value=>
    [`${value} ×10^3/μL`,`${value*1000} /μL`].map(measurement=>
     analyzeLabCard(`WBC ${measurement} (基準値: 3.3〜8.6 ×10^3/μL)`).status)));
   assert.deepEqual(labStatuses,['low','low','normal','normal','high','high']);
   assert.deepEqual(await page.evaluate(()=>[8,20,50].map(value=>
    analyzeLabCard(`AST ${value} U/L (基準値: 10〜40 U/L)`).status)),['low','normal','high']);
   assert.equal(await page.evaluate(()=>analyzeLabCard('AST 20 U/L (基準値: 10〜40 U/L)').ref.origin),'unverified');
   assert.equal(await page.evaluate(()=>{
    const active={id:'lab-active',type:'o',text:'AST 20 U/L',timestamp:'入院前'};
    return [{deleted:true},{type:'unnecessary'},{aiSuggested:true}].every(flags=>{
     const excluded={...active,id:'lab-excluded',text:'AST 200 U/L',...flags};
     return analyzeLabData({items:[active,excluded]}).labs.length===1 &&
      !JSON.stringify(buildLabTrendTable([active,excluded])).includes('200') &&
      !JSON.stringify(buildLabAssessment({items:[active,excluded]})).includes('200');
    });
   }),true);



   await page.locator('#source-text').fill('【架空の画面検証用記録】\n体温36.8℃、脈拍72回/分。\n「昨夜はよく眠れました」と話す。');
   // Fresh browser contexts may load the fictional chart saved by an earlier
   // width from the same temporary server. Exercise the real replacement dialog.
   const existingCards=await page.evaluate(()=>getCurrentPatient().items.length);
   await page.locator('#btn-start-classify').click();
   if(existingCards>0){
    await page.locator('#modal-dialog').waitFor({state:'visible'});
    assert.equal(await page.locator('#dialog-title').innerText(),'今あるカードをどうしますか？');
    await page.locator('#dialog-confirm').click();
    await page.locator('#modal-dialog').waitFor({state:'hidden'});
   }
   await page.waitForFunction(()=>getCurrentPatient().items.some(x=>!x.deleted));
   const before=await page.evaluate(()=>getCurrentPatient().items.length);
   await page.evaluate(()=>{
    const cp=getCurrentPatient(),base=cp.items[0];
    cp.sourceText+='\n術前：架空の照合記録：痛みなし\n術後：架空の照合記録：痛みなし';
    cp.items.push({...base,id:'source-nav-smoke',text:'架空の照合記録:痛みなし',deleted:false,aiSuggested:false,type:'o'});
    cp.items.push({...base,id:'source-deleted-smoke',text:'削除済みの架空記録',deleted:true});
   });
   await page.locator('#nursing-source-compare').click();
   await page.locator('#nursing-organized-text button[data-card-id="source-nav-smoke"]').click();
   assert.match(await page.locator('#nursing-source-match-status').innerText(),/表記をそろえた一致 1／2/);
   assert.equal(await page.locator('#nursing-original-text mark').innerText(),'架空の照合記録：痛みなし');
   assert.equal(await page.locator('#nursing-organized-text button[data-card-id="source-deleted-smoke"]').count(),0);
   await page.locator('#nursing-source-next').click();
   assert.match(await page.locator('#nursing-source-match-status').innerText(),/2／2/);
   await page.locator('#nursing-source-prev').click();
   await page.evaluate(()=>{getCurrentPatient().sourceText+='\n架空の外部更新';});
   await page.locator('#nursing-source-next').click();
   assert.equal(await page.locator('#nursing-original-text mark').count(),0);
   assert.match(await page.locator('#nursing-auto-check-status').innerText(),/更新されたため表示を更新/);
   await page.screenshot({path:`browser-artifacts/${width}-source-navigation.png`});
   await page.locator('#nursing-source-compare').click();
   await page.evaluate(()=>{
    const cp=getCurrentPatient(),plan=createCarePlan(cp,{problem:'架空の根拠確認計画'});
    updateCarePlan(cp,plan.id,{evidenceIds:['source-nav-smoke']});
    addCareRecord(cp,plan.id,{response:'架空の患者反応',responseCardId:'source-nav-smoke'});
    window.__evidencePlanId=plan.id;
    carePlanOpen.add(plan.id);switchView('careplan',{buildPlans:false});
    boardSearchTerm='一致しない架空の検索語';document.getElementById('board-search').value=boardSearchTerm;
   });
   const planBeforeNavigation=await page.evaluate(()=>JSON.stringify(getCarePlan(getCurrentPatient(),window.__evidencePlanId)));
   const evidenceLinks=page.locator('[data-care-evidence-card="source-nav-smoke"]');
   assert.equal(await evidenceLinks.count(),2);
   await evidenceLinks.first().click();
   await page.locator('#view-so-board').waitFor({state:'visible'});
   await page.waitForFunction(()=>document.activeElement?.id==='source-nav-smoke');
   assert.equal(await page.locator('#board-search').inputValue(),'');
   await page.locator('#careplan-evidence-return').click();
   await page.locator('#view-careplan').waitFor({state:'visible'});
   assert.equal(await page.evaluate(()=>JSON.stringify(getCarePlan(getCurrentPatient(),window.__evidencePlanId))),planBeforeNavigation);
   await evidenceLinks.last().click();
   await page.locator('#careplan-evidence-return').click();
   await page.screenshot({path:`browser-artifacts/${width}-care-evidence.png`});
   await page.evaluate(()=>{getCurrentPatient().items.find(i=>i.id==='source-nav-smoke').deleted=true;renderCarePlans();});
   assert.equal(await evidenceLinks.count(),0);
   await page.evaluate(()=>{getCurrentPatient().items.find(i=>i.id==='source-nav-smoke').deleted=false;renderCarePlans();});
   for(const name of ['assessment','careplan','labs','relation','reference']){
    await page.locator('#tab-'+name).click();
    await page.locator('#view-'+name).waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true,`${name} must fit the viewport; tables/maps may scroll inside their containers`);
    await page.screenshot({path:`browser-artifacts/${width}-${name}.png`});
   }
   const assessmentHistory=await page.evaluate(()=>{
    const cp=getCurrentPatient(),entry=ensureMyAssessment(cp,1);
    entry.interpretation='編集前';
    onMyAssessmentInput(1,'interpretation',{value:'編集後'});
    const undone=undoMyAssessmentEdit(1)&&getMyAssessment(cp,1).interpretation==='編集前';
    const redone=undoMyAssessmentEdit(1,true)&&getMyAssessment(cp,1).interpretation==='編集後';
    getMyAssessment(cp,1).interpretation='外部更新';
    const protectedUpdate=undoMyAssessmentEdit(1)===false&&getMyAssessment(cp,1).interpretation==='外部更新';
    return {undone,redone,protectedUpdate};
   });
   assert.deepEqual(assessmentHistory,{undone:true,redone:true,protectedUpdate:true});
   const planHistory=await page.evaluate(()=>{
    const cp=getCurrentPatient(),plan=createCarePlan(cp,{problem:'架空の確認',goalShort:'編集前'});
    onCarePlanInput(plan.id,'goalShort',{value:'編集後'});
    const undone=undoCarePlanField(false)&&getCarePlan(cp,plan.id).goalShort==='編集前';
    const redone=undoCarePlanField(true)&&getCarePlan(cp,plan.id).goalShort==='編集後';
    getCarePlan(cp,plan.id).goalShort='外部更新';
    const protectedUpdate=undoCarePlanField(false)===false&&getCarePlan(cp,plan.id).goalShort==='外部更新';
    return {undone,redone,protectedUpdate};
   });
   assert.deepEqual(planHistory,{undone:true,redone:true,protectedUpdate:true});
   await page.evaluate(()=>{
    const cp=getCurrentPatient(),plan=createCarePlan(cp,{problem:'削除確認の架空計画'});
    window.__confirmationPlanId=plan.id;
    window.__confirmation=deleteCarePlanUI(plan.id);
   });
   await page.locator('#modal-dialog').waitFor({state:'visible'});
   await page.evaluate(()=>{getCarePlan(getCurrentPatient(),window.__confirmationPlanId).problem='確認中の更新';});
   await page.locator('#dialog-confirm').click();
   await page.evaluate(()=>window.__confirmation);
   assert.equal(await page.evaluate(()=>getCarePlan(getCurrentPatient(),window.__confirmationPlanId)?.problem),'確認中の更新');
   const recordProtected=await page.evaluate(()=>{
    const cp=getCurrentPatient(),plan=getCarePlan(cp,window.__confirmationPlanId);
    const record=addCareRecord(cp,plan.id,{evaluation:'編集前'});
    openCareRecord(plan.id,record.id);
    getCarePlan(cp,plan.id).records.find(r=>r.id===record.id).evaluation='外部更新';
    saveCareRecordUI();
    const protectedUpdate=getCarePlan(cp,plan.id).records.find(r=>r.id===record.id).evaluation==='外部更新';
    closeCareRecord();
    openCareRecord(plan.id,record.id);
    document.getElementById('care-record-evaluation').value='確認済み';
    saveCareRecordUI();
    const saved=getCarePlan(cp,plan.id).records.find(r=>r.id===record.id).evaluation==='確認済み';
    const undone=undoCareRecordEdit()&&getCarePlan(cp,plan.id).records.find(r=>r.id===record.id).evaluation==='外部更新';
    const redone=undoCareRecordEdit(true)&&getCarePlan(cp,plan.id).records.find(r=>r.id===record.id).evaluation==='確認済み';
    return protectedUpdate&&saved&&undone&&redone;
   });
   assert.equal(recordProtected,true);
   await page.evaluate(()=>switchView('careplan',{buildPlans:false}));
   const beforeOperation=await page.evaluate(()=>careOperationSnapshot(getCurrentPatient()));
   await page.evaluate(()=>addCarePlanUI());
   assert.equal(await page.evaluate(()=>undoCareOperation()),true);
   assert.equal(await page.evaluate(()=>careOperationSnapshot(getCurrentPatient())),beforeOperation);
   assert.equal(await page.evaluate(()=>undoCareOperation(true)),true);
   const planToDelete=await page.evaluate(()=>carePlanList(getCurrentPatient()).at(-1).id);
   const deleting=page.evaluate(id=>deleteCarePlanUI(id),planToDelete);
   await page.locator('#modal-dialog').waitFor({state:'visible'});
   await page.locator('#dialog-confirm').click();
   await deleting;
   assert.equal(await page.evaluate(()=>undoCareOperation()),true);
   assert.equal(await page.evaluate(id=>!!getCarePlan(getCurrentPatient(),id),planToDelete),true);
   assert.equal(await page.evaluate(()=>undoCareOperation(true)),true);
   await page.locator('#tab-careplan').focus();
   await page.evaluate(()=>document.getElementById('modal-settings').classList.remove('hidden'));
   await page.locator('#modal-settings').waitFor({state:'visible'});
   await page.locator('#btn-save-settings').focus();
   await page.keyboard.press('Tab');
   assert.equal(await page.evaluate(()=>document.getElementById('modal-settings').contains(document.activeElement)),true);
   await page.keyboard.press('Shift+Tab');
   assert.equal(await page.evaluate(()=>document.getElementById('modal-settings').contains(document.activeElement)),true);
   await page.keyboard.press('Escape');
   await page.locator('#modal-settings').waitFor({state:'hidden'});
   await page.waitForFunction(()=>document.activeElement.id==='tab-careplan');
   const modalIds=await page.evaluate(()=>Array.from(document.querySelectorAll('[id^="modal-"].fixed.inset-0')).map(el=>el.id).filter(id=>!['modal-dialog','modal-api-required'].includes(id)));
   for(const modalId of modalIds) {
    await page.locator('#tab-careplan').focus();
    await page.evaluate(id=>document.getElementById(id).classList.remove('hidden'),modalId);
    await page.waitForFunction(id=>document.getElementById(id).contains(document.activeElement),modalId);
    assert.equal(await page.locator('#'+modalId).getAttribute('aria-modal'),'true');
    for(const key of ['Tab','Shift+Tab']) {
     await page.keyboard.press(key);
     assert.equal(await page.evaluate(id=>document.getElementById(id).contains(document.activeElement),modalId),true,modalId);
    }
    await page.keyboard.press('Escape');
    await page.locator('#'+modalId).waitFor({state:'hidden'});
    await page.waitForFunction(()=>document.activeElement.id==='tab-careplan');
   }


   const recovery = await page.evaluate(() => {
    const cp=getCurrentPatient();
    rmCommit(cp,{version:2,nodes:[{id:'smoke-node',type:'assessment',label:'架空の検証',x:50,y:50,itemIds:[]}],edges:[]},{pushUndo:true});
    rmMutate(map=>{map.nodes[0].label='変更後';});
    rmUndoRedo(false);
    const undone=cp.relationMap.nodes[0].label==='架空の検証';
    rmUndoRedo(true);
    const redone=cp.relationMap.nodes[0].label==='変更後';
    cp.relationMap.nodes[0].label='外部更新';
    rmUndoRedo(false);
    const protectedUpdate=cp.relationMap.nodes[0].label==='外部更新';
    const checkpoint=saveImportCheckpoint({patients:[cp],currentPatientId:cp.id});
    return {undone,redone,protectedUpdate,checkpoint};
   });
   assert.deepEqual(recovery,{undone:true,redone:true,protectedUpdate:true,checkpoint:true});
   await page.evaluate(()=>{window.__smokePreview=importPatientsDataText(JSON.stringify({patients:[getCurrentPatient()],currentPatientId:getCurrentPatient().id}));});
   await page.locator('#modal-dialog').waitFor({state:'visible'});
   assert.match(await page.locator('#dialog-message').innerText(),/追加 .*枚・削除 .*枚・変更 .*枚/);
   for(let i=0;i<4;i++) {
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.getElementById('modal-dialog').contains(document.activeElement)),true);
   }
   await page.keyboard.press('Escape');
   assert.equal(await page.evaluate(()=>window.__smokePreview),false);

   await page.locator('#tab-assessment').click();
   await page.evaluate(()=>selectAssessmentNeed(1));
   await page.locator('[data-need-id="1"]').focus();
   for (const [key,id] of [['ArrowRight','2'],['End','14'],['Home','1'],['ArrowLeft','1']]) {
    await page.keyboard.press(key);
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.needId),id);
    assert.equal(await page.locator(`[data-need-id="${id}"]`).getAttribute('aria-pressed'),'true');
   }
   await page.locator('#tab-assessment').focus();
   await page.keyboard.press('ArrowRight');
   assert.equal(await page.evaluate(()=>getSelectedAssessmentNeed()),1,'ナビ外の矢印キーは表示を変更しない');
   await page.locator('#tab-so-board').click();
   await page.locator('#source-text').waitFor({state:'visible'});
   assert.ok(await page.evaluate(()=>getCurrentPatient().items.length)>=before);
   await page.goto(`http://127.0.0.1:${server.address().port}/clinical-knowledge/`,{waitUntil:'networkidle'});
   await page.locator('#compare-catalog:not([disabled])').waitFor();
   const original=await page.evaluate(()=>JSON.stringify(records));
   const previous=JSON.parse(original);
   previous[0].statement='<img src=x onerror="window.__unsafe=true"> 架空の旧版';
   previous[0].sources[0].version='架空の旧版番号';
   await page.locator('#compare-catalog').setInputFiles({name:'old-catalog.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({schemaVersion:1,claims:previous}))});
   await page.waitForFunction(()=>document.getElementById('diff-status').textContent.includes('変更 1件'));
   assert.equal(await page.locator('#catalog-diff img').count(),0);
   assert.match(await page.locator('#catalog-diff').textContent(),/架空の旧版番号/);
   assert.equal(await page.evaluate(()=>JSON.stringify(records)),original);
   await page.locator('#catalog-diff details').first().locator('summary').click();
   await page.screenshot({path:`browser-artifacts/${width}-catalog-diff.png`});
   await page.locator('#compare-catalog').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{')});
   await page.waitForFunction(()=>document.getElementById('diff-status').textContent.includes('比較できません'));
   assert.equal(await page.locator('#catalog-diff article').count(),0);
   assert.equal(await page.evaluate(()=>JSON.stringify(records)),original);
   await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'networkidle'});
   await page.waitForFunction(()=>typeof createNewPatientPage==='function');
   for (const {id,text} of require('../tests/public-case-helpers').loadPublicCases()) {
    await page.evaluate(id=>createNewPatientPage('公開架空検証 '+id),id);
    await page.locator('#tab-so-board').click();
    await page.locator('#source-text').fill(text);
    await page.locator('#btn-start-classify').click();
    await page.waitForFunction(()=>getCurrentPatient().items.some(i=>!i.deleted&&i.type==='s'));
    for(const name of ['assessment','careplan','labs','relation']) await page.locator('#tab-'+name).click();
    await page.locator('[data-rm-action="build-rules"]').click();
    await page.waitForFunction(()=>getCurrentPatient().relationMap?.nodes.length>0);
    const result=await page.evaluate(()=>{
     const cp=getCurrentPatient(),items=cp.items.filter(i=>!i.deleted),ids=new Set(items.map(i=>i.id));
     const plans=carePlanList(cp),map=cp.relationMap;
     return {items:items.length,plans:plans.length,planned:plans.every(p=>p.caseId===cp.id&&p.status==='planned'&&p.records.length===0),
      linked:plans.some(p=>(p.evidenceIds||[]).length>0),nodes:map?.nodes.length||0,refs:(map?.nodes||[]).every(n=>(n.itemIds||[]).every(id=>ids.has(id)))};
    });
    assert.ok(result.items>0&&result.plans>0&&result.nodes>0,`${width}px ${id}: empty workflow`);
    assert.ok(result.planned&&result.refs&&result.linked,`${width}px ${id}: state or evidence ownership`);
    if(id==='heart-failure') await page.screenshot({path:`browser-artifacts/${width}-public-long-relation.png`});
    console.log(`PASS ${width}px public ${id}: UI classification, assessment, plans, labs and relation map`);
   }
   assert.deepEqual(errors,[],`Uncaught browser errors at ${width}px`);
   console.log(`PASS ${width}px: classification, five views, recovery and catalog revision comparison`);
   await context.close();
  }
 } finally {
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
  fs.rmSync(data,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
