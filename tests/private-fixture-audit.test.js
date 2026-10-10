'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {auditPrivateFixtures}=require('../scripts/audit-private-fixtures');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'fixture-audit-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'cases'));fs.mkdirSync(path.join(root,'expected'));return root;}
function fill(root){const names=['患者36','胃がん_A氏58歳','心不全_B氏82歳_架空',...Array.from({length:7},(_,i)=>'事例'+(i+1)+'_架空')];for(const name of names)fs.writeFileSync(path.join(root,'cases',name+'.txt'),'架空の検証文章');for(const name of ['例文',...names])fs.writeFileSync(path.join(root,'expected',name+'.json'),JSON.stringify({case:name,cards:[{text:'架空',type:'o',hendersonIds:[9]}]}));}
test('missing files fail explicitly and the audit writes no answers',t=>{
 const root=fixture(t),result=auditPrivateFixtures(root);assert.equal(result.complete,false);assert.ok(result.issues.some(x=>x.includes('事例7')));assert.ok(result.issues.some(x=>x.includes('例文.json')));assert.equal(fs.readdirSync(path.join(root,'expected')).length,0);
});
test('complete file inventory is distinct from original identity and approval',t=>{
 const root=fixture(t);fill(root);const result=auditPrivateFixtures(root);assert.equal(result.complete,true);assert.equal(result.files.length,10);assert.match(result.files[0].sha256,/^[a-f0-9]{64}$/);assert.match(result.limitation,/approval are not established/);
});
test('seven files with duplicate indices cannot disguise a missing case',t=>{
 const root=fixture(t);fill(root);fs.renameSync(path.join(root,'cases','事例7_架空.txt'),path.join(root,'cases','事例1_重複.txt'));const result=auditPrivateFixtures(root);assert.equal(result.complete,false);assert.ok(result.issues.some(x=>x.includes('事例1')&&x.includes('multiple matches')));assert.ok(result.issues.some(x=>x.includes('事例7')&&x.includes('missing')));
});
test('empty input, corrupted JSON and wrong-case expectations remain failures',t=>{
 const root=fixture(t);fill(root);fs.writeFileSync(path.join(root,'cases','患者36.txt'),' ');fs.writeFileSync(path.join(root,'expected','胃がん_A氏58歳.json'),'{');fs.writeFileSync(path.join(root,'expected','例文.json'),JSON.stringify({case:'wrong',cards:[]}));const result=auditPrivateFixtures(root);assert.equal(result.complete,false);assert.equal(result.issues.length,3);
});
