'use strict';
// Synthetic educational examples. No patient record or clinical decision support.
(function(root,factory){const a=factory();if(typeof module==='object'&&module.exports)module.exports=a;if(root)root.NursingPractice=a;})(typeof window==='undefined'?null:window,function(){
const cases=Object.freeze([
{id:'practice-fall',topic:'安全・転倒',story:'架空事例：術後2日目の成人。立ち上がるとふらつきがあり、歩行時に介助が必要。入院前は独歩していた。',prompt:'入院前と入院後の状態をどのように扱いますか？',choices:['入院前・後を分けて評価し、ふらつきの時点と状況を確認する','入院後の状態を入院前にも適用する','Sデータは全てコミュニケーションに分類する'],correct:0,reason:'経過の前後を分けて情報を整理し、時点・根拠を残す。'},
{id:'practice-ocr',topic:'OCR確認',story:'架空の検査記録のOCRが「Hb 8.O g/dL」と表示された。',prompt:'安全な次の操作は？',choices:['元画像と照らし小数点・O/0・単位を確認する','8.0と確定して自動診断する','単位を消して登録する'],correct:0,reason:'誤読の可能性があるため原画像と照合する。'},
{id:'practice-plan',topic:'看護計画',story:'架空事例：看護問題の根拠カードは未登録。計画のOPだけが入力されている。',prompt:'まず何を点検しますか？',choices:['根拠の対応とTP・EP・目標の不足を確認する','必要な介入を自動で確定する','根拠なしで問題を断定する'],correct:0,reason:'教育用の不足チェックは可能だが、患者別の治療・看護判断は自動確定しない。'},
{id:'practice-map',topic:'関連図',story:'架空の関連図で矢印が二重向きになり、孤立した病態ノードがある。',prompt:'関連図の点検として適切なのは？',choices:['因果の方向と根拠、孤立ノードを確認する','すべての矢印を双方向にする','事実と予測の区別をなくす'],correct:0,reason:'矢印の向きと根拠を見直し、将来の予測は事実と区別する。'}
]);
function grade(id,selected){const item=cases.find(c=>c.id===id);if(!item)throw Error('unknown practice');return {correct:item.correct===selected,answer:item.correct,reason:item.reason,topic:item.topic};}
function chooseNext(attempts){const topics=new Map();for(const a of attempts||[]){const old=topics.get(a.topic)||{ok:0,total:0};old.total++;if(a.correct===true)old.ok++;topics.set(a.topic,old);}
return [...cases].sort((a,b)=>{const x=topics.get(a.topic)||{ok:0,total:0},y=topics.get(b.topic)||{ok:0,total:0};return x.total===0?-1:y.total===0?1:(x.ok/x.total)-(y.ok/y.total);})[0];}
function rubric(submission){const missing=[];if(!submission?.evidence)missing.push('根拠が必要です');if(!submission?.interpretation)missing.push('アセスメントの解釈が必要です');if(!submission?.plan)missing.push('看護計画が必要です');return {missing,completedFields:3-missing.length,totalFields:3,notice:'教育用の記入チェックであり臨床的な採点・診断ではありません'};}
return {cases,grade,chooseNext,rubric};
});
