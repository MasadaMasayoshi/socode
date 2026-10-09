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
   await page.locator('#tab-so-board').click();
   await page.locator('#source-text').waitFor({state:'visible'});
   assert.ok(await page.evaluate(()=>getCurrentPatient().items.length)>=before);
   assert.deepEqual(errors,[],`Uncaught browser errors at ${width}px`);
   console.log(`PASS ${width}px: classification and five views`);
   await context.close();
  }
 } finally {
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
  fs.rmSync(data,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
