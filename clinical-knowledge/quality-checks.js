'use strict';
// Offline deterministic QA helpers. Never infer a diagnosis or transmit patient data.
(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NursingQualityChecks = api;
})(typeof window !== 'undefined' ? window : null, function() {
  const add = (out, code, message, evidence = '') => out.push({code, message, evidence, kind:'review-needed'});
  function classifyEvidence(item) {
    if (!item || !Array.isArray(item.tags)) return [{code:'missing-tags',message:'ヘンダーソン分類のタグが未設定'}];
    const tags = item.tags.map(x=>String(x));
    const findings = [];
    if (tags.some(x=>!/^(?:[1-9]|1[0-4])$/.test(x))) add(findings,'invalid-henderson-tag','タグは1～14のみです');
    if (item.dataType === 'S' && tags.includes('10') && !/(伝え|相談|会話|意思|話す|聞く|説明)/.test(item.text||'')) add(findings,'subjective-not-communication','Sデータだけを理由にコミュニケーションへ分類しない');
    if (!item.text || !String(item.text).trim()) add(findings,'empty-source','情報カードの原文がありません');
    return findings;
  }
  function periodSatisfaction(record) {
    const results=[];
    for(const period of ['beforeAdmission','afterAdmission']){
      const value=record?.[period];
      if(!value || !['satisfied','unsatisfied','unknown'].includes(value.status)) add(results,'missing-'+period,'入院前・入院後を分けて充足を評価してください');
      else if(value.status!=='unknown'&&!String(value.evidence||'').trim()) add(results,'missing-evidence-'+period,'充足判定の根拠が不足しています');
    }
    return results;
  }
  function nursingProblem(problem) {
    const issues=[];
    if(!String(problem?.name||'').trim()) add(issues,'problem-name','看護問題名がありません');
    if(!Array.isArray(problem?.evidenceIds)||!problem.evidenceIds.length) add(issues,'problem-evidence','根拠カードとの対応がありません');
    if(problem?.certainty==='confirmed' && problem?.evidenceIds?.length===0) add(issues,'unsupported-certainty','確定的表現を使う根拠がありません');
    return issues;
  }
  function relationMap(map) {
    const issues=[],nodes=Array.isArray(map?.nodes)?map.nodes:[],edges=Array.isArray(map?.edges)?map.edges:[];
    const ids=new Set(nodes.map(n=>String(n.id)));
    const deg=new Map(nodes.map(n=>[String(n.id),0]));
    for(const e of edges){
      const from=String(e.from ?? e.source ?? ''),to=String(e.to ?? e.target ?? '');
      if(!ids.has(from)||!ids.has(to)) add(issues,'edge-endpoint','矢印の始点または終点が存在しません');
      if(from===to) add(issues,'self-loop','自己循環の矢印があります');
      if(!String(e.evidence||'').trim() && ['causes','contributes_to','results_in','increases_risk_of'].includes(e.relation)) add(issues,'unsupported-causality','因果関係の根拠を確認してください');
      deg.set(from,(deg.get(from)||0)+1);deg.set(to,(deg.get(to)||0)+1);
    }
    for(const [id,count] of deg)if(!count)add(issues,'isolated-node','つながりのない情報があります',id);
    return issues;
  }
  function carePlan(plan){
    const issues=[];
    for(const key of ['OP','TP','EP']) {
      const value=plan?.[key]??plan?.[key.toLowerCase()];
      if(!(Array.isArray(value)?value.some(Boolean):String(value||'').trim()))add(issues,'missing-'+key,'看護計画の'+key+'が未記入です');
    }
    if(!String(plan?.goal||'').trim())add(issues,'missing-goal','看護目標が未記入です');
    return issues;
  }
  function lab(entry){
    const issues=[];
    if(!entry?.unit)add(issues,'missing-unit','検査値の単位がありません');
    if(entry?.value!==undefined && !Number.isFinite(Number(entry.value)))add(issues,'invalid-value','検査値を数値として確認できません');
    if(entry?.min!==undefined&&entry?.max!==undefined&&Number(entry.min)>Number(entry.max))add(issues,'reversed-range','基準値の下限と上限が逆です');
    if(!entry?.source)add(issues,'missing-range-source','基準範囲の施設・資料の出典がありません');
    return issues;
  }
  function ocr(source, extracted){
    const issues=[];
    if(!String(source||'').trim()||!String(extracted||'').trim())add(issues,'ocr-missing-input','元画像の転記確認またはOCR結果がありません');
    const norm=s=>String(s||'').replace(/\s+/g,'').replace(/[，．]/g,x=>x==='，'?',':'.');
    if(norm(source)!==norm(extracted))add(issues,'ocr-text-difference','元資料とOCR結果に差があります。数値・単位・日時を確認してください');
    return issues;
  }
  function history(events){
    if(!Array.isArray(events))return [{code:'missing-history',message:'修正履歴がありません',kind:'review-needed'}];
    const counts={};for(const e of events) {const k=String(e.reason||e.type||'unspecified');counts[k]=(counts[k]||0)+1;}
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([reason,count])=>({reason,count}));
  }
  function applicability(claim,context){
    const gaps=[];
    if(!claim?.scope)add(gaps,'missing-scope','知識の適用範囲が未記入です');
    if(!context || !context.ageGroup || !context.phase)add(gaps,'missing-patient-context','年齢区分・入院前後などの適用条件が未確認です');
    if(claim?.status==='pending-expert-review')add(gaps,'not-expert-approved','専門家未承認のため患者別判定には使用できません');
    return gaps;
  }
  return Object.freeze({classifyEvidence,periodSatisfaction,nursingProblem,relationMap,carePlan,lab,ocr,history,applicability});
});
