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
  if(hits.length!==1)issues.push(`事例${n}_*.txt：${hits.length===0?'missing':'multiple matches; inspect originals'}`);
  required.push(...hits.map(x=>x.slice(0,-4)));
 }
 const seen=new Set();
 for(const name of [...required,...names.map(x=>x.slice(0,-4))]){
  if(seen.has(name))continue;seen.add(name);
  const file=path.join(cases,name+'.txt');
  if(!fs.existsSync(file)){issues.push(name+'.txt：missing');continue;}
  const bytes=fs.readFileSync(file);
  if(!bytes.toString('utf8').trim())issues.push(name+'.txt：empty file');
  files.push({name:name+'.txt',bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 }
 for(const name of ['例文',...seen]){
  const file=path.join(expected,name+'.json');
  if(!fs.existsSync(file)){issues.push(name+'.json：approved expectations missing');continue;}
  try{
   const data=JSON.parse(fs.readFileSync(file,'utf8'));
   if(data.case!==name||!Array.isArray(data.cards)||!data.cards.length||data.cards.some(c=>!c||typeof c.text!=='string'||!['s','o','unclassified','unnecessary'].includes(c.type)||!Array.isArray(c.hendersonIds)||c.hendersonIds.some(h=>!Number.isInteger(h)||h<1||h>14)))throw Error('invalid format');
  }catch(_){issues.push(name+'.json：invalid JSON/card format');}
 }
 return {complete:issues.length===0,files,issues,limitation:'Presence, format and hashes only; original identity and approval are not established.'};
}
if(require.main===module){const result=auditPrivateFixtures();console.log(JSON.stringify(result,null,2));process.exitCode=result.complete?0:1;}
module.exports={auditPrivateFixtures};
