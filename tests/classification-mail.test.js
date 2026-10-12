'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { createClassificationMail, RECIPIENT } = require('../server/classification-mail');
const env = { SMTP_HOST: 'smtp.example.invalid', SMTP_USER: 'test@example.invalid', SMTP_PASS: 'fictional', SMTP_FROM: 'test@example.invalid' };
const payload = id => ({id:`classification_${id}`,backupText:JSON.stringify({schemaVersion:1,exportedAt:'2026-10-12T01:00:00Z',patients:[{id:'fictional',items:[],sourceText:'架空検証記録'}],currentPatientId:'fictional',learningUserDict:{}}),reviewText:'修正依頼：架空\n複数の視点で確認する。'});
async function setup(t, overrides={}) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'classification-mail-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  return {dir,mail:createClassificationMail({dataDir:dir,env,log:{warn(){}},...overrides})};
}
test('Complete backup is saved before fixed-recipient mail with two UTF-8 attachments',async t=>{
  let captured,options;const p=payload('fixed_recipient_01');
  const {dir,mail}=await setup(t,{transportFactory:o=>{options=o;return {sendMail:async message=>{
    captured=message;const saved=JSON.parse(await fs.readFile(path.join(dir,'classification-mail',p.id+'.json'),'utf8'));
    assert.equal(saved.backupText,p.backupText);assert.equal(saved.status,'pending');return {accepted:[RECIPIENT]};
  }}}});
  assert.equal((await mail.send({...p,to:'other@example.invalid'})).sent,true);
  assert.equal(captured.to,'hikaru3365@gmail.com');assert.equal(captured.attachments.length,2);
  assert.equal(captured.attachments[0].content.toString('utf8'),p.backupText);assert.equal(captured.attachments[1].content.toString('utf8'),p.reviewText);
  assert.equal(options.disableFileAccess,true);assert.equal(options.disableUrlAccess,true);
});
test('Concurrent retries and server reload reuse recorded delivery without sending again',async t=>{
  let count=0;const factory=()=>({sendMail:async()=>{count++;return {accepted:[RECIPIENT]};}});
  const {dir,mail}=await setup(t,{transportFactory:factory});const p=payload('duplicate_retry_01');
  await Promise.all([mail.send(p),mail.send(p)]);assert.equal(count,1);
  const restarted=createClassificationMail({dataDir:dir,env,transportFactory:factory});
  assert.equal((await restarted.send(p)).duplicate,true);assert.equal(count,1);
  await assert.rejects(restarted.send({...p,reviewText:'違う内容'}),e=>e.status===409);
});
test('Absent settings and delivery failures retain the private complete backup for retry',async t=>{
  const {dir,mail}=await setup(t,{env:{}});const p=payload('missing_settings_01');
  await assert.rejects(mail.send(p),e=>e.status===503);
  assert.equal(JSON.parse(await fs.readFile(path.join(dir,'classification-mail',p.id+'.json'),'utf8')).backupText,p.backupText);
  const recovered=createClassificationMail({dataDir:dir,env,log:{warn(){}},transportFactory:()=>({sendMail:async()=>({accepted:[RECIPIENT]})})});
  assert.equal((await recovered.send(p)).sent,true);
  const failed=createClassificationMail({dataDir:dir,env,log:{warn(){}},transportFactory:()=>({sendMail:async()=>{throw Object.assign(new Error('synthetic failure'),{code:'ECONNREFUSED'});}})});
  const p2=payload('transport_error_01');await assert.rejects(failed.send(p2),e=>e.status===503);
  assert.equal(JSON.parse(await fs.readFile(path.join(dir,'classification-mail',p2.id+'.json'),'utf8')).status,'pending');
});
test('Invalid paths, secret-bearing backup roots and oversized input are rejected before persistence',async t=>{
  const {mail}=await setup(t);const p=payload('validation_check_01');
  assert.throws(()=>mail.send({...p,id:'../bad'}),e=>e.status===400);
  assert.throws(()=>mail.send({...p,backupText:JSON.stringify({schemaVersion:1,patients:[{}],apiKey:'fictional-secret'})}),e=>e.status===400);
  assert.throws(()=>mail.send({...p,reviewText:'x'.repeat(11*1024*1024)}),e=>e.status===413);
});
