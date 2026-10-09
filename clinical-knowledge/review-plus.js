'use strict';
/* Rule-only nursing study review utilities. Advisory, not diagnosis. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.NursingReviewPlus=api;})(typeof window==='undefined'?null:window,function(){
const flag=(code,message,refs=[])=>({code,message,refs});
const text=x=>String(x??'').trim();
const norm=x=>text(x).normalize('NFKC').replace(/\s+/g,'').toLowerCase();
const date=x=>{const n=Date.parse(x);return Number.isFinite(n)?n:null};
function traceExtraction(source,cards){
 const original=norm(source),list=(cards||[]).map((c,i)=>({id:c.id??i,text:text(c.text??c.content)}));
 const missing=list.filter(c=>c.text&&!original.includes(norm(c.text))).map(c=>flag('not-verbatim','原文に一致しないカードがあります',[c.id]));
 const duplicate=[];const found=new Map();
 for(const c of list){const n=norm(c.text);if(!n)continue;if(found.has(n))duplicate.push(flag('duplicate','同内容の情報カードが重複しています',[found.get(n),c.id]));else found.set(n,c.id);}
 const covered=list.map(c=>norm(c.text)).filter(Boolean).join('');
 const gaps=original&&!covered.includes(original)?[flag('needs-source-review','原文全体の網羅は自動保証できません。文節ごとの照合が必要です')]:[];
 return {missing,duplicate,gaps};
}
function chronology(cards){
 const ordered=(cards||[]).map((c,i)=>({id:c.id??i,moment:date(c.timestamp)})).filter(c=>c.moment!==null);
 const warnings=[];
 for(let i=1;i<ordered.length;i++)if(ordered[i].moment<ordered[i-1].moment)warnings.push(flag('out-of-order','時刻の並びが逆転しています',[ordered[i-1].id,ordered[i].id]));
 return warnings;
}
function assessNarrative(a){
 const warnings=[];if(!text(a.evidence))warnings.push(flag('assessment-evidence','患者データの根拠が未記入'));
 if(!text(a.interpretation))warnings.push(flag('assessment-interpretation','根拠からの解釈が未記入'));
 if(a.prediction&&!a.uncertainty)warnings.push(flag('assessment-prediction','予測を断定せず不確実性を記録してください'));
 if(a.evidenceIds&&!Array.isArray(a.evidenceIds))warnings.push(flag('assessment-links','根拠カードIDは配列で指定してください'));
 return warnings;
}
function contradiction(records){
 const result=[];const groups=new Map();
 for(const r of records||[]){const key=norm(r.metric)+'@'+text(r.period);if(!r.metric||!r.period)continue;
 const arr=groups.get(key)||[];arr.push(r);groups.set(key,arr);}
 for(const [key,items] of groups)if(new Set(items.map(x=>norm(x.value))).size>1)result.push(flag('conflicting-observations','同時点の記録値が異なります。日時や測定条件を確認してください',items.map(x=>x.id)));
 return result;
}
function problemPriority(p){
 const score=({emergency:4,high:3,moderate:2,low:1})[p?.urgency]||0;
 return {rankHint:score,warning:!score?'緊急度が未評価です。優先順位は担当者が確認してください':null};
}
function overlappingProblems(plans){
 const seen=new Map(),issues=[];
 for(const p of plans||[]){const key=norm(p.problem??p.name);if(!key)continue;
 if(seen.has(key))issues.push(flag('duplicate-problem','看護問題の名称が重複しています',[seen.get(key),p.id]));
 else seen.set(key,p.id);}
 return issues;
}
function crossCheckPlan(map,plans){
 const problems=(map?.nodes||[]).filter(x=>['nursing-problem','nursingProblem','problem'].includes(x.type)).map(x=>norm(x.label));
 return (plans||[]).filter(p=>!problems.includes(norm(p.problem))).map(p=>flag('plan-not-in-map','計画の看護問題が関連図に見つかりません',[p.id]));
}
function measurableGoal(goal){
 const v=text(goal);return !v?[flag('missing-goal','目標がありません')]:!/(\d|までに|以内|回|日|NRS|SpO2|できる|行える|実施)/i.test(v)?[flag('goal-review','達成の判定方法・期限を確認してください')]:[];
}
function labRanges(e){const errors=[];if(!e.source)errors.push(flag('lab-reference-source','基準範囲の出典がありません'));
 if(!e.unit)errors.push(flag('lab-unit','単位がありません'));
 if(e.referenceVersion===undefined)errors.push(flag('lab-version','基準範囲の版が未指定'));
 if(e.ageGroup===undefined)errors.push(flag('lab-population','対象年齢が未指定'));
 if(Number.isFinite(+e.low)&&Number.isFinite(+e.high)&&+e.low>+e.high)errors.push(flag('lab-bounds','基準値の上下限が逆転'));
 return errors;}
function ocrRisk(s){const out=[];const v=text(s);if(/[OIｌ|]/.test(v)&&/\d/.test(v))out.push(flag('ocr-lookalikes','0/O、1/I/l、区切り記号の誤読に注意'));
 if(/\d+[,.]\d+/.test(v))out.push(flag('ocr-decimal','小数点やカンマを原画像で確認'));
 if(/\b(?:mg|mL|mmol|g)\b/i.test(v))out.push(flag('ocr-units','検査値・薬剤量の単位を原画像で確認'));
 return out;}
function ruleSuggestion(events){const counts={};for(const x of events||[])counts[text(x.reason)||'未指定']=(counts[text(x.reason)||'未指定']||0)+1;
 return Object.keys(counts).sort((a,b)=>counts[b]-counts[a]).map(reason=>({reason,count:counts[reason],proposal:'ルール修正前に実例と誤検出を確認'}));}
function applicability(claim,context){const issues=[];
 if(claim.status!=='approved'||!claim.reviewer)issues.push(flag('clinical-approval','臨床専門家承認なし：個別患者の自動判断には利用不可'));
 for(const key of ['ageGroup','phase','setting'])if(!context||!text(context[key]))issues.push(flag('context-'+key,key+'の適用条件が不明'));
 return issues;}
function bibliography(claims){return [...new Map((claims||[]).flatMap(x=>x.sources||[]).map(s=>[s.url,[s.publisher,s.year,s.title,s.url].filter(Boolean).join(' / ')])).values()];}
function learningStats(attempts){const groups={};for(const a of attempts||[]){const k=text(a.topic)||'その他';const x=groups[k]||{correct:0,total:0};x.total++;if(a.correct===true)x.correct++;groups[k]=x;}return Object.entries(groups).sort((a,b)=>a[1].correct/a[1].total-b[1].correct/b[1].total).map(([topic,x])=>({topic,...x,accuracy:x.correct/x.total}));}
return Object.freeze({traceExtraction,chronology,assessNarrative,contradiction,problemPriority,overlappingProblems,crossCheckPlan,measurableGoal,labRanges,ocrRisk,ruleSuggestion,applicability,bibliography,learningStats});
});