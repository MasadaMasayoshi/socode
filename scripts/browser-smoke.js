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
   const context=await browser.newContext({viewport:{width,height:900}});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'networkidle'});
   await page.waitForFunction(()=>typeof getCurrentPatient==='function'&&!!getCurrentPatient());
   await page.locator('#source-text').fill('【架空の画面検証用記録】\n体温36.8℃、脈拍72回/分。\n「昨夜はよく眠れました」と話す。');
   await page.locator('#btn-start-classify').click();
   await page.waitForFunction(()=>getCurrentPatient().items.some(x=>!x.deleted));
   const before=await page.evaluate(()=>getCurrentPatient().items.length);
   for(const name of ['assessment','careplan','labs','relation','reference']){
    await page.locator('#tab-'+name).click();
    await page.locator('#view-'+name).waitFor({state:'visible'});
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
