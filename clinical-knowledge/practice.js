'use strict';
// Synthetic educational examples. No patient record or clinical decision support.
(function(root,factory){const a=factory();if(typeof module==='object'&&module.exports)module.exports=a;if(root)root.NursingPractice=a;})(typeof window==='undefined'?null:window,function(){
const cases=Object.freeze([
{id:'practice-fall',topic:'安全・転倒',story:'架空事例：術後2日目の成人。立ち上がるとふらつきがあり、歩行時に介助が必要。入院前は独歩していた。',prompt:'入院前と入院後の状態をどのように扱いますか？',choices:['入院前・後を分けて評価し、ふらつきの時点と状況を確認する','入院後の状態を入院前にも適用する','Sデータは全てコミュニケーションに分類する'],correct:0,reason:'経過の前後を分けて情報を整理し、時点・根拠を残す。'},
{id:'practice-ocr',topic:'OCR確認',story:'架空の検査記録のOCRが「Hb 8.O g/dL」と表示された。',prompt:'安全な次の操作は？',choices:['元画像と照らし小数点・O/0・単位を確認する','8.0と確定して自動診断する','単位を消して登録する'],correct:0,reason:'誤読の可能性があるため原画像と照合する。'},
{id:'practice-plan',topic:'看護計画',story:'架空事例：看護問題の根拠カードは未登録。計画のOPだけが入力されている。',prompt:'まず何を点検しますか？',choices:['根拠の対応とTP・EP・目標の不足を確認する','必要な介入を自動で確定する','根拠なしで問題を断定する'],correct:0,reason:'教育用の不足チェックは可能だが、患者別の治療・看護判断は自動確定しない。'},
{id:'practice-map',topic:'関連図',story:'架空の関連図で矢印が二重向きになり、孤立した病態ノードがある。',prompt:'関連図の点検として適切なのは？',choices:['因果の方向と根拠、孤立ノードを確認する','すべての矢印を双方向にする','事実と予測の区別をなくす'],correct:0,reason:'矢印の向きと根拠を見直し、将来の予測は事実と区別する。'},
{"id":"practice-so","topic":"S/O分類","story":"架空事例：患者が「夜中に何度も目が覚めました」と発言した。","prompt":"まず情報カードの内容をどう整理しますか？","choices":["発言した内容をSデータとして記録し、睡眠という内容で分類を検討する","Sデータなので必ずコミュニケーションに分類する","発言をOデータとして記録する"],"correct":0,"reason":"S/Oの区別と、ヘンダーソンの分類先は別の判断。発言でも内容が睡眠なら睡眠に関係する。"},
{"id":"practice-period","topic":"充足・未充足","story":"架空事例：入院前は自力で着衣できたが、入院後は更衣に手助けが必要になった。","prompt":"時期ごとの整理として妥当なのは？","choices":["入院前・入院後を独立して扱い、援助の有無と根拠を記す","入院後が未充足なら入院前も一括して未充足とする","入院前の記録を消してしまう"],"correct":0,"reason":"充足・未充足は入院前と入院後を分け、自立度と支援の必要性を資料に基づいて検討する。"},
{"id":"practice-uncertainty","topic":"根拠と予測","story":"架空事例：痛みの報告はあるが、将来の合併症を裏づける情報は記録されていない。","prompt":"アセスメントの書き方として妥当なのは？","choices":["確認できた所見と、可能性の段階にとどまる予測を分けて記録する","病態を確定したと断言する","所見を削除し予測のみを書く"],"correct":0,"reason":"事実・解釈・予測を区別し、判断が難しいことは不確実性として示す。"},
{"id":"practice-labs","topic":"検査値","story":"架空事例：血液検査の数値と単位はあるが、施設の基準値が示されていない。","prompt":"比較の前に必要なことは？","choices":["施設・測定法・対象集団に合った基準値と出典を確認する","どの施設でも同じ基準値を仮定する","基準値なしで異常と断定する"],"correct":0,"reason":"基準値は出典・測定法・対象によって異なり得るため、先に適用条件を確認する。"},
{"id":"practice-references","topic":"参考文献","story":"架空事例：看護ケアの説明資料が2つあり、推奨番号が食い違っている。","prompt":"次に行う作業として適切なのは？","choices":["双方の最新版と原文を照合し、違いを記録する","古い資料だけを使い続ける","新しい方を無条件で正しいと扱う"],"correct":0,"reason":"原文・改訂状況・適用条件を確認して、どの推奨の違いか明らかにする。"},
{"id":"practice-discharge","topic":"看護計画","story":"架空事例：退院後の生活に関する長期目標が「理解する」だけになっている。","prompt":"目標の改善に必要なのは？","choices":["いつ何をどの方法で確認できるか、評価可能な表現にする","「理解する」を繰り返して書く","目標の期限や評価方法は省く"],"correct":0,"reason":"目標は期限と行動・理解の確認方法を具体化すると評価しやすくなる。"},
{"id":"practice-evidence","topic":"根拠追跡","story":"架空事例：看護計画が参照するカードを削除したため、根拠IDが見つからない。","prompt":"安全な対処は？","choices":["計画の根拠を再確認し、別の記録で確認できるか調べる","新しい根拠を捏造して補う","警告を無視して承認する"],"correct":0,"reason":"根拠リンクが壊れているときは記録を確認し、根拠のない判断を行わない。"},
{"id":"practice-pain","topic":"実施・評価","story":"架空事例：計画のTPは実施したが、患者の反応がまだ記録されていない。","prompt":"看護過程の継続として必要なのは？","choices":["実施した内容と患者の反応・目標達成状況を確認して記録する","TPを実施しただけで目標達成とみなす","評価欄を自動で「達成」にする"],"correct":0,"reason":"援助を実施した事実と、結果・反応・評価は分けて記録する。"},
{"id":"practice-preop","topic":"周術期の経過","story":"架空事例：術前の記録と術後1日目の記録が混在している。","prompt":"時系列の整理として適切なのは？","choices":["術前と術後を区別し、各所見の日時を明らかにする","術後の値を術前の値として扱う","同じ日の記録だと仮定してまとめる"],"correct":0,"reason":"術前と術後の違い、日時・測定条件を整理してから変化を比較する。"},
{"id":"practice-original","topic":"情報抽出","story":"架空事例：元文に「夜間に2回起きた」とあるが、カードは「夜間に起きた」となっている。","prompt":"抽出品質を点検する際は？","choices":["回数2回が失われていることを確認し、原文に沿って修正する","意味が似ているので数値の欠落を無視する","新しい回数を推測して追加する"],"correct":0,"reason":"数値・日時・程度は看護データの意味に関わるため、原文から漏らさず記録する。"}
]);
function grade(id,selected){const item=cases.find(c=>c.id===id);if(!item)throw Error('unknown practice');return {correct:item.correct===selected,answer:item.correct,reason:item.reason,topic:item.topic};}
function chooseNext(attempts){
 const byId=new Map(),byTopic=new Map();
 for(const entry of attempts||[]){
   if(entry.id){const x=byId.get(entry.id)||{ok:0,total:0};x.total++;if(entry.correct===true)x.ok++;byId.set(entry.id,x);}
   const t=byTopic.get(entry.topic)||{ok:0,total:0};t.total++;if(entry.correct===true)t.ok++;byTopic.set(entry.topic,t);
 }
 // Present each fictitious question before repetition; then prioritize the weakest topic.
 return [...cases].sort((a,b)=>{
   const x=byId.get(a.id)||{ok:0,total:0},y=byId.get(b.id)||{ok:0,total:0};
   if(x.total===0&&y.total>0)return -1;
   if(y.total===0&&x.total>0)return 1;
   if(x.total===0&&y.total===0)return 0;
   const tx=byTopic.get(a.topic)||{ok:0,total:0},ty=byTopic.get(b.topic)||{ok:0,total:0};
   return (tx.ok/tx.total)-(ty.ok/ty.total)||x.total-y.total;
 })[0];
}
function rubric(submission){const missing=[];if(!submission?.evidence)missing.push('根拠が必要です');if(!submission?.interpretation)missing.push('アセスメントの解釈が必要です');if(!submission?.plan)missing.push('看護計画が必要です');return {missing,completedFields:3-missing.length,totalFields:3,notice:'教育用の記入チェックであり臨床的な採点・診断ではありません'};}
return {cases,grade,chooseNext,rubric};
});
