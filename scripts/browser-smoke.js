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
   await context.addInitScript(() => localStorage.setItem('nursing_font', 'serif'));
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'networkidle'});
   await page.waitForFunction(()=>typeof getCurrentPatient==='function'&&!!getCurrentPatient());
   const fontCheck = await page.evaluate(() => {
    const family = getComputedStyle(document.body).fontFamily;
    const defaultLabel = document.getElementById('font-current-label').textContent;
    const persistedDefault = localStorage.getItem('nursing_font_v2');
    setAppFont('gothic');
    toggleAppFont();
    const explicitSerif = localStorage.getItem('nursing_font_v2') === 'serif' && getComputedStyle(document.body).fontFamily.includes('Noto Serif');
    localStorage.removeItem('nursing_font_v2');
    document.documentElement.removeAttribute('data-font');
    updateAppFontLabel();
    return {family, defaultLabel, persistedDefault, explicitSerif};
   });
   assert.ok(fontCheck.family.includes(width >= 1024 ? 'IBM Plex Sans JP' : 'Noto Serif'));
   assert.equal(fontCheck.defaultLabel, width >= 1024 ? 'ゴシック' : '明朝');
   assert.equal(fontCheck.persistedDefault, null);
   assert.equal(fontCheck.explicitSerif, true);
   // Exercise the real file-input/OCR UI with an intercepted transport; this is not live-provider verification.
   let ocrRequests=0;
   await page.route('https://generativelanguage.googleapis.com/**', async route=>{
    const body=route.request().postDataJSON();
    assert.equal(body.contents.length,1);
    assert.equal(body.contents[0].parts.length,2);
    assert.equal(body.contents[0].parts.filter(p=>p.inline_data).length,1);
    ocrRequests++;
    await route.fulfill({json:{candidates:[{content:{parts:[{text:`架空OCR通信検証${ocrRequests}`}]},finishReason:'STOP'}]}});
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
   await page.waitForFunction(()=>!document.getElementById('ocr-file-input').disabled);
   await page.locator('#ocr-file-input').setInputFiles([image,{...image,name:'fictional-2.png'},{...image,name:'fictional-3.png'}]);
   await page.waitForFunction(()=>!document.getElementById('ocr-file-input').disabled&&document.getElementById('source-text').value.includes('架空OCR通信検証5'));
   const batchText=await page.locator('#source-text').inputValue();
   assert.ok(batchText.indexOf('架空OCR通信検証3')<batchText.indexOf('架空OCR通信検証4')&&batchText.indexOf('架空OCR通信検証4')<batchText.indexOf('架空OCR通信検証5'));
   const beforeInvalid=await page.locator('#source-text').inputValue();
   await page.locator('#ocr-file-input').setInputFiles({name:'invalid.pdf',mimeType:'application/pdf',buffer:Buffer.from('fictional invalid input')});
   assert.equal(await page.locator('#source-text').inputValue(),beforeInvalid);
   assert.equal(ocrRequests,5);
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
   assert.equal(await page.locator('#ai-steps').count(),0);
   assert.equal(await page.locator('#nursing-auto-check').count(),0);
   assert.equal(await page.locator('#nursing-manual-review').isVisible(),false);
   assert.equal(await page.locator('main #nursing-manual-review').count(),0);
   assert.equal(await page.locator('a[href="clinical-knowledge/checks.html"]').count(),0);
   const existingCards=await page.evaluate(()=>getCurrentPatient().items.length);
   await page.locator('#btn-start-classify').click();
   if(existingCards>0){
    await page.locator('#modal-dialog').waitFor({state:'visible'});
    assert.equal(await page.locator('#dialog-title').innerText(),'今あるカードをどうしますか？');
    await page.locator('#dialog-confirm').click();
    await page.locator('#modal-dialog').waitFor({state:'hidden'});
   }
   await page.waitForFunction(()=>getCurrentPatient().items.some(x=>!x.deleted));
   const cardFont = await page.locator('.rec-card .card-text').first().evaluate(el => getComputedStyle(el).fontSize);
   assert.equal(cardFont, width >= 1024 ? '14px' : '11.2px');
   await page.screenshot({path:`browser-artifacts/${width}-reading-font.png`});
   const before=await page.evaluate(()=>getCurrentPatient().items.length);
   await page.evaluate(()=>{
    const cp=getCurrentPatient(),base=cp.items[0];
    cp.sourceText+='\n術前：架空の照合記録：痛みなし\n術後：架空の照合記録：痛みなし';
    cp.items.push({...base,id:'source-nav-smoke',text:'架空の照合記録:痛みなし',deleted:false,aiSuggested:false,type:'o'});
    cp.items.push({...base,id:'source-deleted-smoke',text:'削除済みの架空記録',deleted:true});
   });
   await page.locator('[data-menu-toggle="more-menu"]').click();
   assert.deepEqual((await page.locator('#more-menu [role="menuitem"]').allTextContents()).map(t=>t.replace(/\s+/g,' ').trim()),['保存・復元','設定']);
   await page.locator('#more-menu').screenshot({path:`browser-artifacts/${width}-simple-menu.png`});
   await page.locator('#btn-data-tools').click();
   assert.equal(await page.locator('#data-tools').isVisible(),true);
   assert.equal(await page.locator('#data-tools .data-tools-actions button').count(),3);
   await page.keyboard.press('Escape');
   await page.locator('[data-menu-toggle="more-menu"]').click();
   await page.locator('#btn-open-settings').click();
   assert.equal(await page.locator('#settings-ocr').getAttribute('open'),null);
   assert.equal(await page.locator('#btn-toggle-font').isVisible(),true);
   assert.equal(await page.locator('#btn-open-admin').isVisible(),true);
   await page.locator('#modal-settings .modal-surface').screenshot({path:`browser-artifacts/${width}-simple-settings.png`});
   await page.locator('#settings-ocr > summary').click();
   assert.equal(await page.locator('#input-api-key').isVisible(),true);
   await page.keyboard.press('Escape');
   const classifyButton=await page.locator('#btn-start-classify').boundingBox();
   const reviewButton=await page.locator('#btn-manual-review').boundingBox();
   assert.ok(reviewButton.y>=classifyButton.y+classifyButton.height);
   await page.locator('#btn-manual-review').locator('..').screenshot({path:`browser-artifacts/${width}-source-actions.png`});
   await page.locator('#btn-manual-review').click();
   assert.equal(await page.locator('#nursing-source-review').isVisible(),true);
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
   assert.match(await page.locator('#nursing-manual-review-status').innerText(),/更新されたため表示を更新/);
   await page.screenshot({path:`browser-artifacts/${width}-source-navigation.png`});
   await page.locator('#nursing-source-compare').click();
   await page.locator('#nursing-manual-review button').filter({hasText:'閉じる'}).click();
   assert.equal(await page.locator('#nursing-manual-review').isVisible(),false);
   const boardHistory = await page.evaluate(()=>{
    const cp=getCurrentPatient(),card=cp.items.find(i=>i.id==='source-nav-smoke');
    const before=JSON.stringify(cp.items),original=card.text;
    card.text='架空のカード履歴確認';pushUndo(cp.id,before,'本文の編集');
    const undone=undoLastEdit()&&cp.items.find(i=>i.id===card.id).text===original;
    const redone=undoLastEdit(true)&&cp.items.find(i=>i.id===card.id).text==='架空のカード履歴確認';
    cp.items.find(i=>i.id===card.id).text='架空の外部更新';
    const protectedUpdate=undoLastEdit()===false;
    cp.items.find(i=>i.id===card.id).text=original;
    return {undone,redone,protectedUpdate};
   });
   assert.deepEqual(boardHistory,{undone:true,redone:true,protectedUpdate:true});
   await page.evaluate(()=>{
    const cp=getCurrentPatient();window.__toastUndoWrites=0;
    showUndoToast('架空の復元確認',()=>window.__toastUndoWrites++,{patientId:cp.id});
    cp.items.push({id:'toast-later-update',text:'架空の後続更新',type:'o'});
   });
   await page.locator('#toast-container button').filter({hasText:'元に戻す'}).last().click();
   assert.equal(await page.evaluate(()=>window.__toastUndoWrites),0);
   assert.match(await page.locator('#toast-container').innerText(),/元に戻していません/);
   await page.evaluate(()=>{getCurrentPatient().items=getCurrentPatient().items.filter(i=>i.id!=='toast-later-update');});


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
   await page.mouse.move(0,0);
   const lineVisibility = await page.evaluate(() => {
    const host = document.createElement('div');
    host.className = 'rm-canvas-wrap';
    host.id = 'smoke-line-visibility';
    host.style.cssText = 'position:fixed;top:100px;left:10px;width:calc(100vw - 20px);max-width:800px;height:320px;z-index:100';
    document.body.append(host);
    const map = {nodes: [
      {id:'a',type:'pathophysiology',label:'A',x:0,y:100},
      {id:'b',type:'pathophysiology',label:'B',x:500,y:100},
      {id:'c',type:'pathophysiology',label:'C',x:250,y:0},
      {id:'d',type:'pathophysiology',label:'D',x:250,y:300}
    ],edges:[{id:'horizontal',source:'a',target:'b',relation:'treats'},
      {id:'vertical',source:'c',target:'d',relation:'causes'}]};
    window.__visibilityMap = map;
    const originalTheme = document.documentElement.dataset.theme;
    const results = [];
    for (const theme of ['light','dark']) for (const reverse of [false,true]) for (const zoom of [.25,.55,1,2]) {
      document.documentElement.dataset.theme = theme;
      if (reverse) map.edges.reverse();
      host.innerHTML = relationMapSvg(map,{interactive:true,zoom});
      const line = host.querySelector('[data-link-id="horizontal"] .rm-link-line');
      const vertical = host.querySelector('[data-link-id="vertical"] .rm-link-line');
      const mask = vertical.getAttribute('mask');
      const width = getComputedStyle(line).strokeWidth;
      const opacity = getComputedStyle(line).opacity;
      const marker = host.querySelector('.rm-marker-arrow-blue');
      line.parentElement.classList.add('is-selected');
      const selectedId = getComputedStyle(line).markerEnd.match(/#([^)"]+)/)[1];
      const selectedMarker = host.querySelector(`[id="${selectedId}"]`);
      results.push({width,opacity,selectedOpacity:getComputedStyle(line).opacity,maskExists:!!mask && !!host.querySelector(mask.slice(4,-1)),
        vectorEffect:getComputedStyle(line).vectorEffect,
        endpointSize:marker.markerWidth.baseVal.value * zoom,
        markerOverflow:getComputedStyle(marker).overflow,
        selectedMarker:!!selectedMarker && selectedMarker.classList.contains('rm-marker-arrow-treat-sel')});
      if (reverse) map.edges.reverse();
    }
    if (originalTheme === undefined) delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = originalTheme;
    host.innerHTML = relationMapSvg(map, {interactive:true, zoom:.55});
    return results;
   });
   for (const result of lineVisibility) {
    assert.equal(result.width,'1.5px');
    assert.equal(result.opacity,'0.65');
    assert.equal(result.selectedOpacity,'1');
    assert.equal(result.vectorEffect,'non-scaling-stroke');
    assert.ok(Math.abs(result.endpointSize - 8) < .001);
    assert.equal(result.maskExists,true);
    assert.equal(result.markerOverflow,'visible');
    assert.equal(result.selectedMarker,true);
   }
   for (const theme of ['light','dark']) {
    const prior = await page.evaluate(theme => {
      const prior = document.documentElement.dataset.theme;
      document.documentElement.dataset.theme = theme;
      return prior;
    }, theme);
    await page.locator('#smoke-line-visibility').screenshot({path:`browser-artifacts/${width}-arrow-fit-${theme}.png`});
    await page.evaluate(prior => {
      if (prior === undefined) delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = prior;
    }, prior);
   }
   await page.evaluate(() => { document.getElementById('smoke-line-visibility').remove(); delete window.__visibilityMap; });
   console.log(`PASS ${width}px bridge clearance, treatment contrast and selected endpoints in both themes/orders`);
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
   const savedTagSource='入院前\nアレルギー：なし\n食物アレルギー：なし\n術後1日目\n8:00 回診\n硬膜外麻酔抜去\n10:00\n「痛みのため昨晩は眠れなかった」\n「こんなに痛くちゃ動けないし」\n創痛がある。\nレスキューでロキソプロフェン60mg 1錠内服する。\n14:00\nペインスケール「3」（安静時）\n14:45 RH\n荷重をかけ、疼痛増強 ペインスケール2→6へ';
   await page.evaluate(source=>{
    createNewPatientPage('保存済みタグ更新の架空検証');
    const cp=getCurrentPatient();cp.sourceText=source;DOM.sourceText.value=source;
    const card=(id,text,timestamp,extra={})=>({id,text,timestamp,type:'o',hendersonIds:[],assessmentCols:{},predictionSource:'rule',...extra});
    cp.items=[card('allergy','アレルギー: なし','入院前'),card('pain','創痛がある。','術後1日目 10:00'),
     card('rescue','レスキューでロキソプロフェン60mg 1錠内服する。','術後1日目 10:00'),
     card('epidural','回診: 硬膜外麻酔抜去','術後1日目 8:00'),card('resting','ペインスケール「3」(安静時)','術後1日目 14:00'),
     card('manual','食物アレルギー: なし','入院前',{predictionSource:'confirmed',editLog:[{kind:'tagRemove',hId:9}]})];
    cp.myAssessments={existing:{text:'手書き評価'}};
    cp.carePlans={saved:{id:'saved',problem:'架空計画',op:[],tp:[],ep:[],relatedNeeds:[],records:[],evidenceIds:['pain']}};
    saveDataAndSync();
   },savedTagSource);
   await page.reload({waitUntil:'networkidle'});
   await page.waitForFunction(()=>getCurrentPatient().items.find(i=>i.id==='pain')?.hendersonIds.includes(5));
   const restoredTags=await page.evaluate(()=>{
    const cp=getCurrentPatient();
    const stored=JSON.parse(localStorage.getItem('nursing_patients_data')).patients.find(p=>p.id===cp.id);
    return {tags:cp.items.map(i=>[i.id,i.hendersonIds]),persisted:stored.items.find(i=>i.id==='pain').hendersonIds,
     assessment:cp.myAssessments.existing.text,plan:cp.carePlans.saved.evidenceIds};
   });
   assert.deepEqual(restoredTags,{tags:[['allergy',[9]],['pain',[4,5]],['rescue',[4,5]],['epidural',[]],['resting',[]],['manual',[]]],persisted:[4,5],assessment:'手書き評価',plan:['pain']});
   await page.evaluate(()=>{const pain=getCurrentPatient().items.find(i=>i.id==='pain');pain.hendersonIds=[];delete pain.contextTagEvidence;saveDataAndSync();});
   await page.locator('#tab-so-board').click();
   await page.locator('#btn-start-classify').click();
   await page.locator('#modal-dialog').waitFor({state:'visible'});
   await page.locator('#dialog-secondary').click();
   await page.waitForFunction(()=>getCurrentPatient().items.find(i=>i.id==='pain').hendersonIds.includes(5));
   assert.deepEqual(await page.evaluate(()=>getCurrentPatient().items.filter(i=>i.text==='創痛がある。').map(i=>({id:i.id,tags:i.hendersonIds}))),[{id:'pain',tags:[4,5]}]);
   await page.evaluate(()=>createNewPatientPage('カード単位の架空検証'));
   await page.locator('#tab-so-board').click();
   const episodeSource='氏名：A氏 76歳 女性\n入院日：2026年6月8日\n睡眠：7時間程度（寝つきはよい）現在は痛みのため眠れていない\n術後1日目\n8:00 回診\n酸素OFF、硬膜外麻酔抜去、フットポンプOFF\n14:45 RH\n理学療法士によるリハビリ開始\nマッサージと関節可動域訓練開始「動かし始めは痛いけど、大丈夫」と本人\n本日、PTとともにベッド上でセッティング・SLR・足関節ROMの訓練実施。';
   await page.locator('#source-text').fill(episodeSource);
   await page.locator('#btn-start-classify').click();
   await page.waitForFunction(()=>getCurrentPatient().items.some(i=>i.type==='s'));
   const episodes=await page.evaluate(()=>{
    const items=getCurrentPatient().items.filter(i=>!i.deleted&&i.type!=='unnecessary');
    const before=items.find(i=>i.text.includes('7時間')),current=items.find(i=>i.text.includes('現在は'));
    const rehabilitation=items.find(i=>i.type==='o'&&i.text.includes('理学療法士'));
    const speech=items.find(i=>i.type==='s');
    return {before:before.timestamp,current:current.timestamp,currentCol:current.assessmentCols[5],
     joined:rehabilitation.text.includes('関節可動域訓練')&&rehabilitation.text.includes('セッティング・SLR・足関節ROM'),
     separate:!rehabilitation.text.includes('動かし始めは痛い')&&speech.sceneId===rehabilitation.sceneId,
     careChanges:items.filter(i=>/OFF$|硬膜外麻酔抜去$/.test(i.text)).length};
   });
   assert.deepEqual(episodes,{before:'入院前',current:'入院時',currentCol:'postadmission',joined:true,separate:true,careChanges:3});
   assert.equal(await page.locator('#source-text').inputValue(),episodeSource);
   assert.equal(await page.locator('#btn-board-export-review').isVisible(),true);
   const countBeforeRetry=await page.evaluate(()=>getCurrentPatient().items.filter(i=>!i.deleted).length);
   await page.locator('#btn-start-classify').click();
   await page.locator('#modal-dialog').waitFor({state:'visible'});
   await page.locator('#dialog-secondary').click();
   await page.waitForFunction(()=>document.getElementById('modal-dialog').classList.contains('hidden'));
   assert.equal(await page.evaluate(()=>getCurrentPatient().items.filter(i=>!i.deleted).length),countBeforeRetry);
   await page.locator('#btn-source-fullscreen').click();
   const fullBox=await page.locator('#source-editor').boundingBox();
   assert.ok(Math.abs(fullBox.x)<1&&Math.abs(fullBox.y)<1&&Math.abs(fullBox.width-width)<1&&Math.abs(fullBox.height-900)<1);
   assert.equal(await page.evaluate(()=>document.getElementById('source-editor').parentNode===document.body),true);
   await page.keyboard.press('Escape');
   assert.equal(await page.evaluate(()=>document.getElementById('source-editor').parentNode===document.body),false);
   await page.locator('#btn-manual-review').click();
   assert.equal(await page.locator('#nursing-source-review').isVisible(),true);
   assert.match(await page.locator('#nursing-original-text').textContent(),/A氏/);
   await page.locator('#nursing-manual-review').screenshot({path:`browser-artifacts/${width}-original-review.png`});
   await page.locator('#nursing-manual-review').getByRole('button',{name:'閉じる',exact:true}).click();
   await page.evaluate(()=>{
    window.__exports=[];window.__cancelExport=false;
    window.showSaveFilePicker=async options=>{
     if(window.__cancelExport)throw new DOMException('Canceled','AbortError');
     return {createWritable:async()=>({write:async blob=>window.__exports.push({name:options.suggestedName,type:blob.type,size:blob.size,text:blob.type.startsWith('text/')?await blob.text():''}),close:async()=>{}})};
    };
   });
   await page.locator('#btn-board-export-review').click();
   await page.waitForFunction(()=>window.__exports.length===1);
   assert.match(await page.evaluate(()=>window.__exports[0].text),/分類基準|classification criteria/);
   await page.evaluate(()=>{window.__cancelExport=true;});
   await page.locator('#btn-board-export-review').click();
   assert.equal(await page.evaluate(()=>window.__exports.length),1);
   await page.evaluate(()=>{window.__cancelExport=false;});

   await page.locator('#tab-assessment').click();
   await page.evaluate(()=>selectAssessmentNeed(4));
   await page.locator('#assessment-single').screenshot({path:`browser-artifacts/${width}-grouped-episode.png`});
   for (const {id,text} of [...require('../tests/public-case-helpers').loadPublicCases(), {id:'gastric-arrows',text:fs.readFileSync('tests/fixtures/relation-map/gastric_postop.txt','utf8')}]) {
    await page.evaluate(id=>createNewPatientPage('公開架空検証 '+id),id);
    await page.locator('#tab-so-board').click();
    await page.locator('#source-text').fill(text);
    await page.locator('#btn-start-classify').click();
    await page.waitForFunction(()=>getCurrentPatient().items.some(i=>!i.deleted&&i.type==='s'));
    for(const name of ['assessment','careplan','labs','relation']) await page.locator('#tab-'+name).click();
    assert.equal(await page.locator('#rm-add-kind').count(),0);
    assert.equal(await page.locator('[data-rm-action="check"]').count(),0);
    assert.equal(await page.locator('#rm-check').count(),0);
    if(id==='gastric-arrows') {
     await page.locator('[data-rm-action="add"]').click();
     await page.locator('#modal-dialog').waitFor({state:'visible'});
     assert.match(await page.locator('#dialog-title').innerText(),/四角を追加/);
     await page.locator('#dialog-cancel').click();
    }
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
    await page.locator('#tab-careplan').click();
    await page.evaluate(()=>{for(const p of carePlanList(getCurrentPatient())){p.qa=[{level:'warn',msg:'保存済み自動警告'}];carePlanOpen.add(p.id);}renderCarePlans();});
    assert.doesNotMatch(await page.locator('#careplan-list').innerText(),/表示前の自動チェック|保存済み自動警告|そのまま使わず|現在のカードを表示します|優先順位：|根拠カードに変更があります|変更内容を確認して根拠を更新/);
    if(id==='gastric-arrows') await page.screenshot({path:`browser-artifacts/${width}-careplan-no-auto-check.png`});
    if(id==='gastric-arrows') {
     await page.locator('#tab-assessment').click();
     await page.waitForFunction(()=>Object.values(patientSyncState).every(st=>!st.inFlight&&!st.pending) && Object.keys(patientSyncTimers).length===0);
     // Explicit phase labels isolate layout coverage from narrative date extraction.
     await page.evaluate(()=>{
      const cp=getCurrentPatient();window.__phaseItems=cp.items;
      cp.items=[
       {id:'phase-pre',type:'o',text:'普段は呼吸困難なし',timestamp:'入院前',hendersonIds:[1],assessmentCols:{1:'preadmission'}},
       {id:'phase-preop',type:'o',text:'呼吸困難なし',timestamp:'術前',hendersonIds:[1],assessmentCols:{1:'postadmission'}},
       {id:'phase-postop',type:'o',text:'浅い呼吸、湿性咳嗽あり、喀痰あり',timestamp:'術後1日目',hendersonIds:[1],assessmentCols:{1:'postadmission'}}
      ];selectAssessmentNeed(1);
     });
     assert.equal(await page.locator('#assessment-single .suf-phase-block').count(),0,'Card headings and rows contain no verdicts');
     const status=page.locator('#assessment-status');
     assert.equal(await status.locator('.suf-expanded').count(),3);
     assert.equal(await status.locator('details').count(),0);
     assert.deepEqual(await status.locator('.suf-expanded').evaluateAll(els=>els.map(el=>el.dataset.sufPhase)),['pre','preop','postop']);
     const dataBox=await page.locator('.assessment-data').boundingBox(),statusBox=await status.boundingBox();
     assert.ok(statusBox.y>=dataBox.y+dataBox.height,'Verdicts occupy a separate section after the card table');
     await page.locator('#toast-container').evaluate(el=>el.replaceChildren());
     await status.screenshot({path:`browser-artifacts/${width}-sufficiency-panel.png`});
     if(width===1440) await page.locator('#assessment-layout').screenshot({path:`browser-artifacts/${width}-assessment-layout.png`});
     const postop=status.locator('[data-suf-phase="postop"]');
     for (const phase of ['pre','preop','postop']) assert.equal(await status.locator(`[data-suf-phase="${phase}"] .suf-phase-why`).isVisible(),true,'Every phase shows its evidence without opening a disclosure');
     await page.evaluate(()=>renderAssessmentTable());
     assert.equal(await postop.locator('.suf-phase-why').isVisible(),true,'Evidence remains visible after refresh');
     await page.keyboard.press('Escape');
     await page.locator('#assessment-status-title').click();
     assert.equal(await postop.locator('.suf-phase-why').isVisible(),true,'Evidence does not collapse on Escape or an outside click');
     await page.evaluate(()=>selectAssessmentNeed('all'));
     assert.equal(await page.locator('#assessment-tbody .suf-phase-block').count(),0,'Overview rows contain no verdicts');
     assert.equal(await status.locator('.suf-status-need').count(),14);
     assert.equal(await page.locator('#ai-results').count(),0);
     await page.locator('#tab-labs').click();
     assert.equal(await page.locator('#lab-evaluation-panel').isVisible(),true);
     await page.locator('#lab-evaluation-panel > summary').click();
     assert.equal(await page.locator('#lab-evaluation-content').isVisible(),true);
     await page.evaluate(()=>{getCurrentPatient().items=window.__phaseItems;delete window.__phaseItems;selectAssessmentNeed(1);});
    }
    await page.locator('#tab-relation').click();
    const layout=await page.evaluate(()=>{
     const map=getCurrentPatient().relationMap,rects=map.nodes.map(rmRect);
     let overlaps=0;for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];if(a.x1<b.x2&&a.x2>b.x1&&a.y1<b.y2&&a.y2>b.y1)overlaps++;}
     return {height:Math.max(...rects.map(r=>r.y2))-Math.min(...rects.map(r=>r.y1)),overlaps};
    });
    assert.equal(layout.overlaps,0,`${id}: map nodes do not overlap`);
    if(id==='gastric-arrows'||id==='heart-failure') assert.ok(layout.height<=1800,`${id}: compact long-record layout (${layout.height}px)`);
    if(id==='gastric-arrows') {
     await page.evaluate(()=>{rmState.zoom=.55;renderRelationMap();});
     await page.locator('#rm-canvas-wrap svg').screenshot({path:`browser-artifacts/${width}-compact-relation.png`});
     for (const zoom of [.55,1,2]) {
      await page.evaluate(zoom=>{
       const cp=getCurrentPatient(),map=cp.relationMap;
       const edge=map.edges.find(e=>e.relation==='treats' && map.nodes.find(n=>n.id===e.target)?.type==='disease');
       if(!edge)throw Error('Missing gastric treatment target');
       const target=map.nodes.find(n=>n.id===edge.target),source=map.nodes.find(n=>n.id===edge.source);
       rmState.zoom=zoom;renderRelationMap();
       const wrap=document.getElementById('rm-canvas-wrap');
       wrap.scrollLeft=Math.max(0,(Math.min(source.x,target.x)-rmBounds(map).x)*zoom-20);
       wrap.scrollTop=Math.max(0,(Math.min(source.y,target.y)-rmBounds(map).y)*zoom-20);
       const svg=wrap.querySelector('svg');
       const line=svg.querySelector(`[data-link-id="${edge.id}"] .rm-link-line`);
       const id=line.getAttribute('marker-end').match(/#([^)]*)/)[1];
       const marker=svg.querySelector(`[id="${id}"]`);
       if(marker.querySelector('path').getAttribute('d')!=='M0,1.5 L10,5 L0,8.5 z')throw Error('Treatment endpoint is not an arrow');
       if(Math.abs(marker.markerWidth.baseVal.value*zoom-8)>.01)throw Error('Treatment arrow shrinks with zoom');
      },zoom);
      await page.locator('#toast-container').evaluate(el=>el.replaceChildren());
      await page.locator('#rm-canvas-wrap').screenshot({path:`browser-artifacts/${width}-gastric-arrows-${zoom}.png`});
      await page.evaluate(zoom=>{
       const wrap=document.getElementById('rm-canvas-wrap'),bounds=wrap.getBoundingClientRect();
       const next=zoom===2?1.5:2;
       rmZoomAt(next,bounds.left+bounds.width/2,bounds.top+bounds.height/2);
       const svg=wrap.querySelector('svg');
       if([...svg.querySelectorAll('marker')].some(m=>Math.abs(Number(m.getAttribute('markerWidth'))*rmState.zoom-8)>.01))throw Error('Live zoom changes arrow size');
       if([...svg.querySelectorAll('.rm-bridge-clearance')].some(p=>Math.abs(Number(p.getAttribute('stroke-width'))*rmState.zoom-3.2)>.01))throw Error('Live zoom changes crossing clearance');
      },zoom);

     }
    }
    if(id==='gastric-arrows') {
     const problems=await page.evaluate(()=>getCurrentPatient().relationMap.nodes.filter(n=>n.type==='nursing_problem').map(n=>n.id));
     assert.ok(problems.length>=3);
     const background=await page.locator('#rm-canvas-wrap svg').evaluate(el=>({paper:getComputedStyle(el.querySelector('.rm-bg')).fill,canvas:getComputedStyle(el.closest('.rm-canvas-wrap')).backgroundColor}));
     assert.equal(background.paper,background.canvas);
     assert.equal(background.paper,'rgb(245, 243, 238)');
     // Reproduce direct node selection, rather than testing only the problem menu.
     const problemNode=page.locator(`#rm-canvas-wrap .rm-node[data-node-id="${problems[0]}"]`);
     await problemNode.scrollIntoViewIfNeeded();
     if(width<768)await problemNode.tap();else await problemNode.click();
     const direct=await page.evaluate(()=>({
      focus:rmState.focusProblem,
      nodes:Array.from(document.querySelectorAll('#rm-canvas-wrap .rm-node')).map(el=>({id:el.dataset.nodeId,opacity:getComputedStyle(el).opacity})),
      legacy:document.querySelector('#rm-canvas-wrap svg').classList.contains('rm-focus')
     }));
     assert.deepEqual(direct.focus,[problems[0]]);
     assert.ok(await page.evaluate(()=>rmState.zoom>=0.9),'Automatic selection must keep text readable');
     assert.equal(direct.legacy,false);
     assert.ok(direct.nodes.every(n=>n.opacity==='1'),'Direct problem selection must not fade source evidence');
     assert.deepEqual(direct.nodes.filter(n=>problems.includes(n.id)).map(n=>n.id),[problems[0]]);
     assert.equal(await page.evaluate(()=>{
      const map=getCurrentPatient().relationMap,ids=new Set(Array.from(document.querySelectorAll('#rm-canvas-wrap .rm-node')).map(el=>el.dataset.nodeId));
      return map.edges.filter(e=>ids.has(e.target)&&map.nodes.find(n=>n.id===e.source)?.type!=='nursing_problem').every(e=>ids.has(e.source))&&map.edges.filter(e=>ids.has(e.source)&&e.relation==='treats'&&['disease','symptom','pathophysiology'].includes(map.nodes.find(n=>n.id===e.target)?.type)).every(e=>ids.has(e.target));
     }),true,'Direct selection preserves factors, disease and treatment indications');
     await page.locator('#rm-canvas-wrap').screenshot({path:`browser-artifacts/${width}-direct-problem.png`});
     await page.locator('#rm-selection-bar [data-rm-action="focus-all"]').click();
     if(width===1440){
      await page.locator(`#rm-canvas-wrap .rm-node[data-node-id="${problems[0]}"]`).focus();
      await page.keyboard.press('Enter');
      assert.deepEqual(await page.evaluate(()=>rmState.focusProblem),[problems[0]]);
      await page.locator('#rm-selection-bar [data-rm-action="focus-all"]').click();
     }
     await page.locator('.rm-prob-menu [data-rm-action="toggle-problems"]').click();
     for(const problem of problems.slice(0,2))await page.locator(`#rm-problems [data-node-id="${problem}"]`).click();
     assert.equal(await page.locator('#rm-problems [aria-pressed="true"]').count(),2);
     await page.locator('#rm-problems [data-rm-action="focus-apply"]').click();
     const selected=await page.evaluate(()=>Array.from(document.querySelectorAll('#rm-canvas-wrap .rm-node[data-node-id]')).map(el=>el.dataset.nodeId));
     for(const problem of problems.slice(0,2))assert.ok(selected.includes(problem));
     for(const problem of problems.slice(2))assert.ok(!selected.includes(problem));
     assert.deepEqual(await page.locator('#rm-canvas-wrap svg').evaluate(el=>({paper:getComputedStyle(el.querySelector('.rm-bg')).fill,canvas:getComputedStyle(el.closest('.rm-canvas-wrap')).backgroundColor})),background);
     const closure=await page.evaluate(()=>{
      const map=getCurrentPatient().relationMap,ids=new Set(Array.from(document.querySelectorAll('#rm-canvas-wrap .rm-node[data-node-id]')).map(el=>el.dataset.nodeId));
      return map.edges.filter(e=>ids.has(e.target)&&map.nodes.find(n=>n.id===e.source)?.type!=='nursing_problem').every(e=>ids.has(e.source))&&map.edges.filter(e=>ids.has(e.source)&&e.relation==='treats'&&['disease','symptom','pathophysiology'].includes(map.nodes.find(n=>n.id===e.target)?.type)).every(e=>ids.has(e.target));
     });
     assert.equal(closure,true,'Focused diagrams preserve incoming evidence, including the pre-treatment flow');
     for(const theme of ['light','dark'])for(const fullscreen of [false,true]){
      const layers=await page.evaluate(({theme,fullscreen})=>{
       document.documentElement.setAttribute('data-theme',theme);rmSetFullscreen(fullscreen);
       const wrap=document.getElementById('rm-canvas-wrap'),stage=wrap.querySelector('.rm-stage'),svg=wrap.querySelector('svg');
       const w=wrap.getBoundingClientRect(),s=stage.getBoundingClientRect(),g=svg.getBoundingClientRect();
       return {canvas:getComputedStyle(wrap).backgroundColor,stage:getComputedStyle(stage).backgroundColor,svg:getComputedStyle(svg).backgroundColor,paper:getComputedStyle(svg.querySelector('.rm-bg')).fill,outline:getComputedStyle(svg).outlineStyle,shadow:getComputedStyle(wrap).boxShadow,
        margins:[g.left-s.left,g.top-s.top,s.right-g.right,s.bottom-g.bottom],scrollable:wrap.scrollWidth>w.width&&wrap.scrollHeight>w.height};
      },{theme,fullscreen});
      assert.equal(layers.stage,layers.canvas);assert.equal(layers.svg,layers.canvas);assert.equal(layers.paper,layers.canvas);
      assert.equal(layers.outline,'none');assert.equal(layers.shadow,'none');
      assert.ok(layers.margins.every(value=>value>=100),'Keep usable empty space on all four sides');
      assert.equal(layers.scrollable,true,'Even a filtered map must pan in both directions');
     }
     await page.evaluate(()=>{rmSetFullscreen(false);document.documentElement.setAttribute('data-theme','light');});
     await page.locator('#rm-canvas-wrap').screenshot({path:`browser-artifacts/${width}-selected-problems.png`});
     await page.evaluate(()=>rmSavePng());
     await page.waitForFunction(()=>window.__exports.some(e=>e.type==='image/png'));
     await page.locator('.rm-prob-menu [data-rm-action="toggle-problems"]').click();
     await page.locator('#rm-problems [data-rm-action="focus-all"]').click();
     if(width===1440){
      const wrap=page.locator('#rm-canvas-wrap');
      for(const side of ['left','right','top','bottom']){
       const before=await wrap.evaluate((el,side)=>{
        const style=getComputedStyle(el.querySelector('.rm-stage'));
        el.scrollLeft=side==='left'?0:side==='right'?el.scrollWidth-el.clientWidth:Number.parseFloat(style.paddingLeft);
        el.scrollTop=side==='top'?0:side==='bottom'?el.scrollHeight-el.clientHeight:Number.parseFloat(style.paddingTop);
        return {left:el.scrollLeft,top:el.scrollTop};
       },side);
       const area=await wrap.boundingBox(),x=side==='right'?area.x+area.width-12:area.x+12,y=side==='bottom'?area.y+area.height-12:area.y+12;
       const dx=side==='left'?-35:side==='right'?35:0,dy=side==='top'?-35:side==='bottom'?35:0;
       await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:3});await page.mouse.up();
       const after=await wrap.evaluate(el=>({left:el.scrollLeft,top:el.scrollTop}));
       assert.ok(side==='left'?after.left>before.left:side==='right'?after.left<before.left:side==='top'?after.top>before.top:after.top<before.top,`${side} margin accepts dragging`);
      }
      await wrap.evaluate(el=>{el.scrollLeft=0;el.scrollTop=0;});
      const area=await wrap.boundingBox();
      await page.mouse.move(area.x+12,area.y+12);
      await page.mouse.down();
      await page.mouse.move(area.x-23,area.y-23,{steps:3});
      await page.mouse.up();
      assert.ok(await wrap.evaluate(el=>el.scrollLeft>0&&el.scrollTop>0),'The outer whitespace must support dragging');
      const previousZoom=await page.evaluate(()=>rmState.zoom);
      await page.locator('.rm-zoom-pad [data-rm-action="map-start"]').click();
      assert.equal(await page.evaluate(()=>rmState.zoom),previousZoom);
      const position=await wrap.evaluate(el=>{const area=el.getBoundingClientRect(),svg=el.querySelector('svg').getBoundingClientRect();return {x:svg.left-area.left,y:svg.top-area.top};});
      assert.ok(position.x>=6&&position.x<=12&&position.y>=6&&position.y<=12,'Return to diagram aligns the visible paper edge');
      const dragged=page.locator('#rm-canvas-wrap .rm-node').first();
      await dragged.scrollIntoViewIfNeeded();
      const box=await dragged.boundingBox();
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
      await page.mouse.down();
      await page.mouse.move(box.x+box.width/2+35,box.y+box.height/2+20,{steps:3});
      await page.waitForFunction(()=>document.getElementById('rm-canvas-wrap').classList.contains('is-dragging'));
      assert.equal(await page.locator('#rm-canvas-wrap .rm-link-line').evaluateAll(lines=>lines.every(line=>!/(?:NaN|undefined|Infinity)/.test(line.getAttribute('d')))),true);
      await page.mouse.up();
      assert.equal(await page.locator('#rm-canvas-wrap').evaluate(el=>el.classList.contains('is-dragging')),false);
      await page.evaluate(()=>rmUndoRedo(false));
     }

    }
    if(id==='heart-failure') await page.screenshot({path:`browser-artifacts/${width}-public-long-relation.png`});
    console.log(`PASS ${width}px public ${id}: UI classification, assessment, plans, labs and relation map`);
   }
   assert.deepEqual(errors,[],`Uncaught browser errors at ${width}px`);
   console.log(`PASS ${width}px: classification, five views, recovery and catalog revision comparison`);
   await page.goto(`http://127.0.0.1:${server.address().port}/clinical-knowledge/practice.html`,{waitUntil:'networkidle'});
   await page.waitForFunction(()=>!!window.NursingPractice);
   assert.equal(await page.evaluate(()=>window.NursingPractice.cases.length),36);
   assert.match(await page.locator('#progress').innerText(),/既回答 0\/36問/);
   await page.locator('input[name="choice"][value="0"]').check();
   await page.locator('button[type="submit"]').click();
   assert.match(await page.locator('#feedback').innerText(),/^正解/);
   assert.match(await page.locator('#progress').innerText(),/既回答 1\/36問/);
   await page.reload({waitUntil:'networkidle'});
   assert.match(await page.locator('#progress').innerText(),/既回答 1\/36問/);
   await page.locator('summary').click();assert.equal(await page.locator('#coverage li').count(),15);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   await page.screenshot({path:`browser-artifacts/${width}-practice-coverage.png`});
   await page.evaluate(()=>{window.__practiceSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw Error('Fictional storage failure');};});
   await page.locator('input[name="choice"][value="0"]').check();await page.locator('button[type="submit"]').click();
   assert.match(await page.locator('#feedback').innerText(),/学習履歴を保存できません/);
   await page.evaluate(()=>{Storage.prototype.setItem=window.__practiceSetItem;window.__practiceRemoveItem=Storage.prototype.removeItem;Storage.prototype.removeItem=function(){throw Error('Fictional deletion failure');};});
   page.once('dialog',dialog=>dialog.accept());await page.locator('#reset-progress').click();
   assert.match(await page.locator('#feedback').innerText(),/学習履歴を消去できません/);
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('socode-nursing-practice-v1')).length),1);
   await page.evaluate(()=>{Storage.prototype.removeItem=window.__practiceRemoveItem;});
   page.once('dialog',dialog=>dialog.accept());await page.locator('#reset-progress').click();
   assert.match(await page.locator('#progress').innerText(),/既回答 0\/36問/);
   assert.deepEqual(errors,[],`Uncaught browser errors after practice at ${width}px`);
   console.log(`PASS ${width}px: 36-question practice, coverage, persistent progress and reset`);
   await context.close();
  }
  const head=require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  fs.writeFileSync('browser-artifacts/validation-evidence.json',JSON.stringify({schemaVersion:1,head,kind:'browser-smoke',status:'passed',widths:[390,768,1440],scenarioCount:8,uncaughtErrors:0,ocrTransport:'intercepted',liveOcrVerified:false},null,2)+'\n');
 } finally {
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
  fs.rmSync(data,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
