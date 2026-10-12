'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setupIsolatedDataDir,startEphemeralServer,baseUrl,stopServer}=require('./helpers');
const dir=setupIsolatedDataDir();
for(const key of ['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASS','SMTP_FROM'])delete process.env[key];
const {app}=require('../server');let server,url;
test.before(async()=>{server=await startEphemeralServer(app);url=baseUrl(server);});
test.after(async()=>{await stopServer(server);await fs.rm(dir,{recursive:true,force:true});});
const body={id:'classification_api_fixture_1234',backupText:JSON.stringify({schemaVersion:1,patients:[{id:'fictional',items:[]}]}),reviewText:'架空検証'};
const send=origin=>fetch(url+'/api/classification-delivery',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});
test('Unconfigured delivery saves privately, reports a retryable failure and exposes no server module',async()=>{
 const res=await send('https://masadamasayoshi.github.io');assert.equal(res.status,503);assert.equal((await res.json()).ok,false);
 const saved=JSON.parse(await fs.readFile(path.join(dir,'classification-mail',body.id+'.json'),'utf8'));
 assert.equal(saved.backupText,body.backupText);assert.equal(saved.status,'pending');
 for(const p of ['/server/classification-mail.js','/server%2Fclassification-mail.js','/data/classification-mail/'+body.id+'.json'])assert.equal((await fetch(url+p)).status,404);
});
test('Cross-origin delivery attempts are refused outside configured origins',async()=>{
 assert.equal((await send('https://unrelated.example.invalid')).status,403);
});
