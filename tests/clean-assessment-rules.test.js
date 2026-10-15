'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadApp}=require('./app-helpers');const app=loadApp();
const card=(id,text,h,timestamp='手術前日',extra={})=>({id,text,type:'o',timestamp,hendersonIds:[h],assessmentCols:{[h]:'postadmission'},...extra});
const patient=items=>({id:Math.random().toString(),title:'架空',sourceText:'胃がんの手術を受けた。',myAssessments:{},items:[...items,{id:'post-marker',text:'術後観察',type:'o',timestamp:'術後1日目',hendersonIds:[]}]});
test('Sparse Markdown lab rows become records without table debris or lost values',()=>{
 const source='入院1日目\n| 項目 | 種類 | 基準値 | A氏 | 正常・異常 |\n| :--- | :--- | :--- | :--- | :--- |\n| WBC(白血球数) | | | 5880/μL、 | |\n| RBC(赤血球数) | | | 511 万/μL | |';
 const items=Array.from(app.classifyTextByRules(source));const clinical=items.filter(i=>i.type!=='unnecessary');
 assert.equal(clinical.length,2);assert.ok(clinical.every(i=>!i.text.includes('|')));assert.match(clinical[0].text,/5880/);assert.match(clinical[1].text,/511/);
 const border={id:'legacy-border',type:'o',text:'| :--- | :--- | :--- | :--- | :--- |',timestamp:'入院1日目',hendersonIds:[],predictionSource:'rule'};assert.equal(app.refreshSavedUntaggedCards({sourceText:source,items:[border]}),1);assert.equal(border.type,'unnecessary');
});
test('Markdown comparison columns keep separate event dates and supplied reference ranges',()=>{
 const source='| 検査項目 | 基準値 | 入院時 | 術後1日目 |\n| --- | --- | --- | --- |\n| WBC | 4000〜9000/μL | 5880 | 11600 |\n| Hb | 12〜16g/dL | 13.5 | 12.2 |';
 const items=Array.from(app.classifyTextByRules(source)).filter(i=>i.type!=='unnecessary');
 assert.ok(items.some(i=>/5880/.test(i.text)&&/入院/.test(i.timestamp)));assert.ok(items.some(i=>/11600/.test(i.text)&&/術後1日目/.test(i.timestamp)));assert.ok(items.every(i=>!i.text.includes('|')));
});
test('Completed hygiene is evidence; plans and cancelled showers are not completion',()=>{
 assert.equal(app.sufficiencyCardVerdict(card('a','臍処置後、シャワー浴をする。',8),8).v,'met');
 for(const text of ['シャワー浴をする予定','シャワー浴は中止した','シャワー浴ができなかった'])assert.notEqual(app.sufficiencyCardVerdict(card('b',text,8),8).v,'met');
});
test('Education delivery and infection screening retain evidence while naming remaining confirmation',()=>{
 const cp=patient([card('a','看護師から手術オリエンテーションを受ける。',14),card('b','【感染症】HCV 抗体(-)',9)]);
 for(const h of [14,9]){const result=app.sufficiencySentence(cp,h,'preop');assert.match(result,/判定保留/);assert.doesNotMatch(result,/情報不足|充足を示す記録と未充足/);}
 assert.match(app.sufficiencySentence(cp,14,'preop'),/理解/);assert.match(app.sufficiencySentence(cp,9,'preop'),/陰性|HCV/);
});
test('Stable breathing is assessed from current findings; cessation alone does not prove fulfillment',()=>{
 assert.equal(app.sufficiencyCardVerdict(card('a','10年前に禁煙した',1),1).v,'');
 const cp=patient([card('b','10年前に禁煙した。呼吸数18回/分、SpO2 96%、呼吸困難なし。',1)]);
 assert.match(app.sufficiencySentence(cp,1,'preop'),/呼吸は充足している。$/);assert.doesNotMatch(app.sufficiencySentence(cp,1,'preop'),/満たされているため/);
});
test('Communication uses expressed concerns without treating anxiety as communication failure',()=>{
 assert.equal(app.sufficiencyCardVerdict(card('a','「手術っていろいろな合併症があるんだね。怖いね」と話す。',10,'手術前日',{type:'s'}),10).v,'pending','voicing worry shows the person can express it: not unmet, but not enough to call met');
 assert.equal(app.sufficiencyCardVerdict(card('a2','「早くリハビリを始めたいです」と話す。',10,'手術前日',{type:'s'}),10).v,'met');
 assert.equal(app.sufficiencyCardVerdict(card('b','説明が伝わらない。',10),10).v,'unmet');
 const cp=patient([card('c','「手術っていろいろな合併症があるんだね。怖いね」と話す。',10,'手術前日',{type:'s'})]);assert.match(app.sufficiencySentence(cp,10,'preop'),/「手術っていろいろな合併症があるんだね。怖いね」と話す。.*判定保留/);
});
test('Existing sheet records are cleaned and deduplicated only within the same date and classification',()=>{
 const one=card('a','| WBC(白血球数) | | | 5880/μL | |',7,'入院1日目');
 const cp=patient([one,{...one,id:'b'}, {...one,id:'c',timestamp:'術後1日目'}]);
 const out=app.buildAssessmentTableText(cp);assert.ok(!out.includes('|'));assert.equal((out.match(/WBC\(白血球数\)/g)||[]).length,2);assert.match(out,/術後1日目/);
 assert.doesNotMatch(app.buildExportPlainText(cp),/分類前の文章/);
});
test('Source headings place admission-day exams before surgery without guessing unrelated day numbers',()=>{
 const cp=patient([card('a','HCV 抗体(-)',9,'入院1日目'),card('b','「合併症があるんだね。怖いね」と話す。',10,'入院1日目',{type:'s'}),card('c','看護師から手術オリエンテーションを受ける。',14)]);
 cp.sourceText='＜実習1日目(入院1日目、手術前々日)＞\nHCV 抗体(-)';
 assert.match(app.sufficiencySentence(cp,9,'preop'),/HCV.*判定保留/);assert.match(app.sufficiencySentence(cp,10,'preop'),/合併症があるんだね.*言葉にできている.*判定保留/);
 cp.sourceText='＜実習1日目(入院1日目)＞\nHCV 抗体(-)';assert.match(app.sufficiencySentence(cp,9,'preop'),/情報不足/);
});
test('Training difficulty and fear do not establish breathing failure or lack of knowledge',()=>{
 assert.equal(app.sufficiencyCardVerdict(card('a','トライボールによる呼吸訓練を行っている。ボールを3つ上げると、維持できない。',1),1).v,'');
 assert.notEqual(app.sufficiencyCardVerdict(card('b','「合併症があるんだね。怖いね」と話す。',14,'手術前日',{type:'s'}),14).v,'unmet');
 assert.equal(app.sufficiencyCardVerdict(card('c','呼吸訓練中、呼吸困難あり。',1),1).v,'unmet');
});
test('Repeated respiratory measurements produce one explanation per measurement and event',()=>{
 const rows=[card('a','【呼吸機能】%肺活量110.6%、一秒率69.33%',1,'入院1日目'),card('b','%肺活量110.6%',1,'入院1日目'),card('c','一秒率69.33%',1,'入院1日目')];
 const parsed=app.analyzeLabData({items:rows});assert.equal(parsed.resp.length,2);
 rows.push(card('d','一秒率69.33%',1,'術後1日目'));assert.equal(app.analyzeLabData({items:rows}).resp.length,3);
});
