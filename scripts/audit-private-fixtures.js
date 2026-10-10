'use strict';
// Inventory only: never derives expected answers from application output.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const FIXED=['患者36','胃がん_A氏58歳','心不全_B氏82歳_架空'];
function auditPrivateFixtures(root=path.join(__dirname,'../tests/golden')){
 const cases=path.join(root,'cases'),expected=path.join(root,'expected'),issues=[],files=[];
 const names=fs.existsSync(cases)?fs.readdirSync(cases).filter(x=>x.endsWith('.txt')):[];
 const required=[...FIXED];
 for(let n=1;n<=7;n++){
  const hits=names.filter(x=>new RegExp('^事例'+n+'_.*\\.txt$').test(x));
  if(hits.length!==1)issues.push(`事例${n}_*.txt：${hits.length===0?'未復旧':'複数あり。元教材を確認'}`);
  required.push(...hits.map(x=>x.slice(0,-4)));
 }
 const seen=new Set();
 for(const name of [...required,...names.map(x=>x.slice(0,-4))]){
  if(seen.has(name))continue;seen.add(name);
  const file=path.join(cases,name+'.txt');
  if(!fs.existsSync(file)){issues.push(name+'.txt：未復旧');continue;}
  const bytes=fs.readFileSync(file);
  if(!bytes.toString('utf8').trim())issues.push(name+'.txt：空ファイル');
  files.push({name:name+'.txt',bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 }
 for(const name of ['例文',...seen]){
  const file=path.join(expected,name+'.json');
  if(!fs.existsSync(file)){issues.push(name+'.json：承認済み正解データが未復旧');continue;}
  try{
   const data=JSON.parse(fs.readFileSync(file,'utf8'));
   if(data.case!==name||!Array.isArray(data.cards)||!data.cards.length||data.cards.some(c=>!c||typeof c.text!=='string'||!['s','o','unclassified','unnecessary'].includes(c.type)||!Array.isArray(c.hendersonIds)||c.hendersonIds.some(h=>!Number.isInteger(h)||h<1||h>14)))throw Error('形式不正');
  }catch(_){issues.push(name+'.json：JSONまたはカード形式が不正');}
 }
 return {complete:issues.length===0,files,issues,limitation:'ファイルの存在・形式・ハッシュを点検するだけです。元教材との同一性や正解の承認を保証しません。'};
}
if(require.main===module){const result=auditPrivateFixtures();console.log(JSON.stringify(result,null,2));process.exitCode=result.complete?0:1;}
module.exports={auditPrivateFixtures};
