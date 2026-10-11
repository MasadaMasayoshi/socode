'use strict';
const fs=require('node:fs');
function parseSummary(log){
 const result={};
 for(const name of ['tests','pass','fail','cancelled','skipped','todo']){
  const matches=[...log.matchAll(new RegExp('(?:ℹ|#) '+name+' (\\d+)','g'))];
  if(!matches.length)throw Error('Missing test summary: '+name);
  result[name]=Number(matches.at(-1)[1]);
 }
 if(!result.tests||result.pass!==result.tests||['fail','cancelled','skipped','todo'].some(k=>result[k]!==0))throw Error('Regression suite is incomplete or unsuccessful');
 return result;
}
if(require.main===module){try{
 const head=process.env.GITHUB_SHA;if(!/^[a-f0-9]{40}$/.test(head||''))throw Error('GITHUB_SHA must identify the tested commit');
 const summary=parseSummary(fs.readFileSync(process.argv[2],'utf8'));
 fs.writeFileSync(process.argv[3],JSON.stringify({schemaVersion:1,head,kind:'public-regression',status:'passed',summary},null,2)+'\n');
}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={parseSummary};
