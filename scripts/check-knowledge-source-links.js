'use strict';
// Checks source URLs only. An accessible URL does not establish content correctness.
const fs=require('node:fs');
const path=require('node:path');
const db=JSON.parse(fs.readFileSync(path.join(__dirname,'..','clinical-knowledge','candidates.json'),'utf8'));
const sources=[...new Set(db.claims.flatMap(c=>(c.sources||[]).map(s=>s.url)))];
(async()=>{
  let errors=0;
  for(const url of sources){
    try{
      const response=await fetch(url,{method:'GET',signal:AbortSignal.timeout(12000),headers:{'User-Agent':'socode-knowledge-link-monitor/1.0'}});
      console.log(response.status+' '+url);
      if(!response.ok)errors++;
      await response.body?.cancel();
    }catch(e){errors++;console.log('ERROR '+url+' '+String(e.message||e));}
  }
  console.log('Total source URLs='+sources.length+', unavailable='+errors);
  if(errors)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
