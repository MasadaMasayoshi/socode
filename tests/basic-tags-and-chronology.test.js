'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {loadApp}=require('./app-helpers');const app=loadApp();
const tags=text=>Array.from(app.basicInfoTags({text,type:'o'}),t=>t.id);
const patient=text=>({id:'fictional',sourceText:text,items:Array.from(app.classifyTextByRules(text),(i,k)=>({...i,id:'c'+k})),carePlans:{}});
test('Background facts receive distinct tags without assigning a need or hiding unknown text',()=>{
 for(const [text,id] of [['A氏・58歳・男性','identity'],['身長170cm 体重60kg','body'],['血液型：A型 Rh陽性','blood'],['既往歴：胆嚢結石','history'],['父は胃がんで亡くなった','family'],['アレルギー：なし','allergy'],['妻と同居','social'],['職業：会社員','occupation'],['10年前に禁煙した','habits'],['閉経50歳','reproductive']])assert.ok(tags(text).includes(id),text);
 assert.equal(app.isUntaggedItem({text:'アレルギー：なし',type:'o',hendersonIds:[]}),true,'A background tag must not conceal a missing environment tag');
 assert.deepEqual(tags('原因不明の症状を訴えた'),[]);assert.equal(app.isUntaggedItem({text:'原因不明の症状',type:'o',hendersonIds:[]}),true);
 assert.deepEqual(Array.from(app.basicInfoTags({text:'血液型：A型',type:'unnecessary'})),[]);
 const item={text:'血液型：A型',type:'o',hendersonIds:[],basicTagOverrides:{blood:false,social:true}};
 assert.deepEqual(Array.from(app.basicInfoTags(JSON.parse(JSON.stringify(item))),t=>t.id),['social']);assert.deepEqual(item.hendersonIds,[]);
});
test('Treatment targets, associations and postoperative findings have distinct directions',()=>{
 const cp=patient('診断名：胃がん\n家族歴：父は胃がん。\n【胃カメラ】胃底部25mmの腫瘍。\n胃全摘術を施行。\n入院1日目\n麻酔科の受診から帰室。\n手術当日\n【病理結果】T2 N0 P0 H0 M0、Stage IB\n術後1日目：創部痛 NRS2。');
 const map=app.buildRelationMapFromRecord(cp),dx=map.nodes.find(n=>n.type==='disease'),op=map.nodes.find(n=>n.type==='treatment'&&/胃全摘/.test(n.label)),path=map.nodes.find(n=>/^病理結果/.test(n.label));
 assert.ok(map.edges.some(e=>e.source===op.id&&e.target===dx.id&&e.relation==='treats'));
 assert.equal(path.phase,2);assert.ok(path.x>op.x,`pathology ${path.x} must follow surgery ${op.x}`);
 assert.ok(!map.nodes.some(n=>/受診から帰室/.test(n.label)));
 const svg=app.relationMapSvg(map,{}),association=map.edges.find(e=>e.relation==='related_to');assert.ok(association);
 const group=svg.match(new RegExp('<g[^>]*data-link-id="'+association.id+'"[^>]*>([\\s\\S]*?)</g>'));
 assert.ok(group);assert.doesNotMatch(group[1],/marker-end/);
});
test('A planned or cancelled operation cannot become a completed operation',()=>{
 const map=app.buildRelationMapFromRecord(patient('診断名：胃がん\n予定術式：胃全摘術\n「手術が怖い」と話す。'));
 const surgery=map.nodes.find(n=>n.type==='treatment'&&/胃全摘/.test(n.label));assert.ok(surgery);assert.match(surgery.label,/予定/);
 const cancelled=app.buildRelationMapFromRecord(patient('診断名：胃がん\n胃全摘術は中止。\n「手術が怖い」と話す。'));
 assert.ok(!cancelled.nodes.some(n=>n.type==='treatment'&&/胃全摘/.test(n.label)));
});

test('Completed operative records outrank plans and reconstruction fragments',()=>{
 const map=app.buildRelationMapFromRecord(patient('診断名：胃がん\n予定術式：胃全摘術（R-Y再建）\n手術当日\n【術式名】予定通り腹腔鏡下胃全摘術（R-Y再建）を実施\n胃を全摘し、R-Y法で再建した。\n術後1日目：創部痛 NRS2。'));
 const op=map.nodes.find(n=>n.type==='treatment'&&/胃全摘/.test(n.label));assert.ok(op);assert.doesNotMatch(op.label,/（予定）/);assert.ok(!map.nodes.some(n=>n.type==='treatment'&&/^法で再建/.test(n.label)));
});
