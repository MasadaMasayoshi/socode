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
   assert.deepEqual(errors,[],`Uncaught browser errors at ${width}px`);
   console.log(`PASS ${width}px: classification, five views and recovery`);
   await context.close();
  }
 } finally {
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
  fs.rmSync(data,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
