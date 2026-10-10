'use strict';
const fs=require('node:fs');
const REQUIRED=['liveOcr','facilityRanges','clinicalSources','manualAccessibility','reversibleOperations','curriculumCoverage'];
function evaluate(head,regression,browser,conditions){
 const blockers=[];
 if(!/^[a-f0-9]{40}$/.test(head||''))blockers.push('Invalid expected commit');
 for(const [name,record,kind] of [['regression',regression,'public-regression'],['browser',browser,'browser-smoke']]){
  if(record?.schemaVersion!==1||record.head!==head||record.kind!==kind||record.status!=='passed')blockers.push(name+': missing, stale or failed evidence');
 }
 const summary=regression?.summary;
 if(!summary?.tests||summary.pass!==summary.tests||['fail','cancelled','skipped','todo'].some(k=>summary[k]!==0))blockers.push('regression: incomplete test summary');
 if(![390,768,1440].every(w=>browser?.widths?.includes(w))||browser?.scenarioCount!==7||browser?.uncaughtErrors!==0)blockers.push('browser: incomplete workflow coverage');
 const policy=conditions?.releasePolicy;
 const accepted=policy?.mode==='public-regression-and-browser'&&policy.ownerDecision==='tests-are-sufficient'&&/^\d{4}-\d{2}-\d{2}$/.test(policy.acceptedOn||'');
 if(policy&&!accepted)blockers.push('Invalid or unrecorded owner release policy');
 const waived=new Set(accepted&&Array.isArray(policy.waivedAsPublicationPrerequisites)?policy.waivedAsPublicationPrerequisites:[]);
 if([...waived].some(name=>!REQUIRED.includes(name)))blockers.push('Unknown waived condition');
 for(const name of REQUIRED){const item=conditions?.[name];if(!waived.has(name)&&(item?.status!=='complete'||!Array.isArray(item.evidence)||!item.evidence.length||item.evidence.some(x=>typeof x!=='string'||!x.trim())))blockers.push(name+': incomplete evidence');}
 return {ready:blockers.length===0,head,blockers,policy:accepted?policy.mode:'all-recorded-conditions',followUp:REQUIRED.filter(name=>conditions?.[name]?.status!=='complete')};
}
if(require.main===module){try{
 const [head,...paths]=process.argv.slice(2);if(paths.length!==3)throw Error('Usage: node scripts/check-release-readiness.js SHA regression.json browser.json conditions.json');
 const result=evaluate(head,...paths.map(p=>JSON.parse(fs.readFileSync(p,'utf8'))));console.log(JSON.stringify(result,null,2));if(!result.ready)process.exitCode=1;
}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={evaluate,REQUIRED};
