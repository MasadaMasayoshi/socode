'use strict';
(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.CatalogDiff=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const MAX_BYTES=2*1024*1024;
  const labels={type:'区分',statement:'本文',scope:'適用範囲',limitations:'注意・限界',sources:'出典・版情報',status:'審査状況',reviewer:'審査者',ownerApproval:'開発上の承認',sourceVerification:'出典照合',lastChecked:'最終確認日',reviewDue:'再確認期限'};
  function canonical(value){
    if(Array.isArray(value)) return value.map(canonical);
    if(value&&typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
    return value;
  }
  function format(value){return value===undefined?'未記載':JSON.stringify(canonical(value),null,2);}
  function validate(data){
    if(!data||data.schemaVersion!==1||!Array.isArray(data.claims)||data.claims.length>1000) throw new Error('schemaVersion: 1 と claims 配列（1000件以内）が必要です。');
    const ids=new Set();
    for(const claim of data.claims){
      if(!claim||typeof claim!=='object'||Array.isArray(claim)||typeof claim.id!=='string'||!claim.id.trim()||ids.has(claim.id)) throw new Error('資料IDが空、重複、または不正です。');
      ids.add(claim.id);
      if(typeof claim.statement!=='string'||!Array.isArray(claim.sources)||claim.sources.some(s=>!s||typeof s!=='object'||Array.isArray(s))) throw new Error('各資料には本文と出典配列が必要です。');
    }
    return data.claims;
  }
  function parse(text){
    if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BYTES) throw new Error('比較ファイルは2MB以内のJSONを選んでください。');
    let data;
    try{data=JSON.parse(text);}catch(_){throw new Error('JSONを読み取れません。資料集から保存したJSONを選んでください。');}
    validate(data);return data;
  }
  function compare(previous,current){
    const old=validate(previous),now=validate(current);
    const oldMap=new Map(old.map(x=>[x.id,x])),nowMap=new Map(now.map(x=>[x.id,x]));
    const changes=[];let unchanged=0;
    for(const rec of now){
      const before=oldMap.get(rec.id);
      if(!before){changes.push({id:rec.id,kind:'added',before:null,after:rec,fields:[]});continue;}
      const fields=[...new Set([...Object.keys(before),...Object.keys(rec)])].filter(key=>key!=='id'&&format(before[key])!==format(rec[key])).sort().map(key=>({key,label:labels[key]||key,before:format(before[key]),after:format(rec[key])}));
      if(fields.length) changes.push({id:rec.id,kind:'changed',before,after:rec,fields});else unchanged++;
    }
    for(const rec of old) if(!nowMap.has(rec.id)) changes.push({id:rec.id,kind:'removed',before:rec,after:null,fields:[]});
    return {changes,unchanged,added:changes.filter(x=>x.kind==='added').length,removed:changes.filter(x=>x.kind==='removed').length,changed:changes.filter(x=>x.kind==='changed').length};
  }
  return {MAX_BYTES,parse,compare,format};
});
