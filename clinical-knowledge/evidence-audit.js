'use strict';
// Deterministic, read-only evidence graph and nursing-process audit. No AI, persistence or network.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.NursingEvidenceAudit=api;})(typeof window==='undefined'?null:window,function(){
  const str=v=>String(v??'').trim();
  const ids=v=>Array.isArray(v)?v.map(str).filter(Boolean):[];
  function audit(patient){
    const issues=[],items=(patient?.items||[]).filter(x=>x&&!x.deleted&&x.type!=='unnecessary');
    const cards=new Map(items.map(c=>[str(c.id),c]));
    const plans=Object.values(patient?.carePlans||{}).filter(x=>x&&!x.deleted);
    const nodes=patient?.relationMap?.nodes||[],edges=patient?.relationMap?.edges||[];
    const nodesById=new Map(nodes.map(n=>[str(n.id),n]));
    const add=(type,message,entityId,links=[])=>issues.push({type,message,entityId:str(entityId),evidenceIds:links});
    const cardIdsOf=(record)=>ids(record.evidenceIds).concat(ids(record.cardIds),ids(record.sourceCardIds),ids(record.refs?.filter?.(v=>typeof v==='string')));
    function checkLinks(record,kind){
      const cited=[...new Set(cardIdsOf(record))];
      for(const id of cited)if(!cards.has(id))add('broken-evidence','根拠カードが見つかりません',record.id||kind,[id]);
      return cited;
    }
    for(const item of items){
      if(!str(item.text))add('empty-card','情報カードの内容が空です',item.id);
      if(!Array.isArray(item.hendersonIds)||!item.hendersonIds.length)add('unclassified','基本的欲求の分類が未設定です',item.id);
    }
    const names=new Map();
    for(const plan of plans){
      const key=str(plan.problem).normalize('NFKC').replace(/\s+/g,'');
      if(key&&names.has(key))add('duplicate-plan','看護問題が重複しています',plan.id,[names.get(key)]);
      if(key)names.set(key,str(plan.id));
      const linked=checkLinks(plan,'care-plan');
      const evidenceText=Array.isArray(plan.evidence)?plan.evidence.map(str).filter(Boolean):[];
      if(!linked.length&&!evidenceText.length)add('missing-evidence','看護問題の根拠を確認してください',plan.id);
      if(!str(plan.goalLong)&&!str(plan.goalShort))add('missing-goal','看護目標が未記入です',plan.id);
      for(const key of ['op','tp','ep']){
        const entries=Array.isArray(plan[key])?plan[key]:[];
        if(!entries.some(x=>str(x)))add('missing-'+key,key.toUpperCase()+'が未記入です',plan.id);
      }
    }
    const touched=new Set();
    for(const edge of edges){
      const from=str(edge.from??edge.source),to=str(edge.to??edge.target);
      if(!nodesById.has(from)||!nodesById.has(to))add('broken-arrow','関連図の矢印の接続先が見つかりません',edge.id);
      if(from&&to&&from===to)add('self-arrow','矢印が同じ情報を指しています',edge.id);
      touched.add(from);touched.add(to);
    }
    for(const node of nodes){
      if(!touched.has(str(node.id)))add('isolated-node','関連図に接続のない情報があります',node.id);
      checkLinks(node,'relation-node');
      if(node.observed===false&&!str(node.evidence))add('prediction-no-basis','予測に関する根拠の確認が必要です',node.id);
    }
    return {patientId:str(patient?.id),checked:{cards:items.length,plans:plans.length,nodes:nodes.length,edges:edges.length},issues};
  }
  function summarize(issues){
    const counts={};for(const issue of issues||[])counts[issue.type]=(counts[issue.type]||0)+1;
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([type,count])=>({type,count}));
  }
  function compareSourceCoverage(source,items){
    // Exact textual correspondence only. Paraphrases and split cards remain manual-review items.
    const clean=v=>str(v).normalize('NFKC').replace(/\\s+/g,'');
    const chunks=str(source).split(/\\n|(?<=。)/u).map(v=>v.trim()).filter(v=>clean(v).length>=8);
    const texts=(items||[]).filter(x=>x&&x.type!=='unnecessary').map(x=>clean(x.text||'')).filter(Boolean);
    const matched=[],needsReview=[];
    chunks.forEach((chunk,index)=>{
      const hit=texts.some(t=>t.includes(clean(chunk)));
      const entry={index,excerpt:chunk.slice(0,160)};
      (hit?matched:needsReview).push(entry);
    });
    return {segments:chunks.length,matched,needsReview,notice:'文字列の完全一致のみです。言い換え・分割・日時見出しにより要確認が増える場合があります。'};
  }
  return Object.freeze({audit,summarize,compareSourceCoverage});
});