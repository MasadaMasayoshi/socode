'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const plain = x => JSON.parse(JSON.stringify(x));

test('Drag preview routes retain finite coordinates and meet their source and target boxes', () => {
  const map={nodes:[{id:'a',type:'patient_fact',label:'A',x:20,y:50},{id:'b',type:'patient_fact',label:'B',x:500,y:200}],edges:[{id:'forward',source:'a',target:'b'},{id:'backward',source:'b',target:'a'}]};
  const routes=app.rmDragRoutes(map);
  assert.equal(routes.length,2);
  for(const route of routes){
    assert.ok(route.pts.flat().every(Number.isFinite));
    const source=app.rmRect(map.nodes.find(n=>n.id===route.edge.source));
    const target=app.rmRect(map.nodes.find(n=>n.id===route.edge.target));
    assert.ok([source.x1,source.x2].includes(route.pts[0][0]));
    assert.ok([target.x1,target.x2].includes(route.pts.at(-1)[0]));
  }
});

function branchingMap() {
  const types = { factor:'patient_fact', disease:'disease', treatment:'treatment', after:'patient_fact', p1:'nursing_problem', other:'patient_fact', p2:'nursing_problem', isolated:'patient_fact', p3:'nursing_problem' };
  const links = [['factor','disease'],['disease','treatment'],['treatment','after'],['after','p1'],['treatment','disease','treats'],['disease','other'],['other','p2'],['isolated','p3']];
  return { version:2, nodes:Object.entries(types).map(([id,type])=>({id,type,label:id,priority:1})), edges:links.map(([source,target,relation='causes'],k)=>({id:`e${k}`,source,target,relation})), addedStash:{nodes:[]} };
}

test('Focused problems retain the entire pre-treatment flow through treatment cycles', () => {
  const map=branchingMap(), before=JSON.stringify(map);
  const sub=app.rmProblemSubmap(map,'p1');
  assert.deepEqual(plain(sub.nodes.map(n=>n.id)),['factor','disease','treatment','after','p1']);
  assert.equal(sub.edges.length,5);
  assert.equal(sub.addedStash,undefined);
  assert.equal(JSON.stringify(map),before);
});

test('Multiple selected problems share their ancestors and exclude unrelated problem branches', () => {
  const sub=app.rmProblemSubmap(branchingMap(),['p1','p2','missing','p1']);
  assert.deepEqual(plain(sub.nodes.map(n=>n.id)),['factor','disease','treatment','after','p1','other','p2']);
  assert.equal(new Set(sub.nodes.map(n=>n.id)).size,sub.nodes.length);
  assert.equal(app.rmProblemSubmap(branchingMap(),['missing','factor']),null);
  assert.equal(app.rmProblemSubmap(branchingMap(),[]),null);
});

test('Selected postoperative problems retain the disease treated by surgery and its original factors', () => {
  const map={nodes:[
    {id:'factor',type:'patient_fact',label:'発症要因'},
    {id:'disease',type:'disease',label:'治療対象の疾患'},
    {id:'surgery',type:'treatment',label:'手術'},
    {id:'sign',type:'symptom',label:'術後の症状'},
    {id:'problem',type:'nursing_problem',label:'選択した問題'}
  ],edges:[
    {id:'e1',source:'factor',target:'disease',relation:'contributes_to'},
    {id:'e2',source:'surgery',target:'disease',relation:'treats'},
    {id:'e3',source:'surgery',target:'sign',relation:'causes'},
    {id:'e4',source:'sign',target:'problem',relation:'results_in'}
  ]};
  const sub=app.rmProblemSubmap(map,'problem');
  assert.deepEqual(plain(sub.nodes.map(n=>n.id)),['factor','disease','surgery','sign','problem']);
  assert.equal(sub.edges.length,4);
});

test('All incoming treatment evidence is traversed even when treatment only treats a selected ancestor', () => {
  const map=branchingMap();
  map.edges=map.edges.filter(e=>!(e.source==='disease'&&e.target==='treatment'));
  map.nodes.push({id:'indication',type:'patient_fact',label:'indication'});
  map.edges.push({id:'indication-edge',source:'indication',target:'treatment',relation:'causes'});
  const sub=app.rmProblemSubmap(map,'p2');
  assert.ok(sub.nodes.some(n=>n.id==='indication'));
  assert.ok(sub.edges.some(e=>e.id==='indication-edge'));
  assert.ok(!sub.nodes.some(n=>n.id==='p1'));
});

test('Save destination writes the supplied blob and cancellation does not fall back to a download', async () => {
  const events=[], blob={content:'fictional'};
  const saved=loadApp({showSaveFilePicker:async options=>{events.push(options.suggestedName);return {createWritable:async()=>({write:async value=>events.push(value),close:async()=>events.push('closed')})};}});
  assert.equal(await saved.downloadTextBlob(blob,'fictional.txt'),true);
  assert.deepEqual(events,['fictional.txt',blob,'closed']);
  const canceled=loadApp({showSaveFilePicker:async()=>{const error=new Error('cancel');error.name='AbortError';throw error;},URL:{createObjectURL(){throw Error('Unexpected fallback');}}});
  assert.equal(await canceled.downloadTextBlob(blob,'fictional.txt'),false);
});

test('Duplicate identity normalizes whitespace and terminal punctuation without collapsing different times', () => {
  assert.equal(app.clinicalCardDuplicateKey('創痛あり。','術後１日目 10:00'),app.clinicalCardDuplicateKey(' 創痛 あり ','術後1日目10:00'));
  assert.notEqual(app.clinicalCardDuplicateKey('創痛あり','術後1日目10:00'),app.clinicalCardDuplicateKey('創痛あり','術後1日目14:00'));
});

test('Domain fallback plans contain OP, TP and EP while review gives a concrete action for missing sections', () => {
  const cp={id:'p',items:[],carePlans:{}};
  const plan=app.createCarePlan(cp,{problem:'出血のリスク',op:['出血の徴候を観察する'],tp:[],ep:[]});
  const model=app.cpModelOrFallback(cp,plan);
  for(const key of ['op','tp','ep'])assert.ok(model[key].length,key);
  const actions=app.carePlanSetNextSteps(cp);
  assert.ok(actions.some(a=>a.planId===plan.id&&a.missing&&/TP・EP/.test(a.text)));
  app.carePlanSetState.open=true;
  const html=app.carePlanSetReviewHtml(cp);
  app.carePlanSetState.open=false;
  assert.match(html,/次に行うこと/);
  assert.match(html,/空欄に追記案を入れる/);
});

test('Disease factors reread the source when a relevant original observation is absent from cards', () => {
  const source='診断名：右大腿骨頸部骨折\n入院前\n自宅で転倒し受傷した。\n既往歴：骨粗鬆症。\n術後1日目\n創部痛 NRS 4。';
  const items=app.classifyTextByRules(source).filter(i=>!i.text.includes('転倒')).map((i,k)=>({...i,id:`i${k}`}));
  const map=app.buildRelationMapFromRecord({id:'p',sourceText:source,items,carePlans:{}});
  const factors=map.nodes.filter(n=>n.type==='patient_fact'&&/転倒|骨粗鬆症/.test(n.evidence));
  assert.ok(factors.some(n=>/転倒/.test(n.evidence)));
  assert.ok(factors.some(n=>/骨粗鬆症/.test(n.evidence)));
  const disease=map.nodes.find(n=>n.type==='disease');
  const ancestors=new Set([disease.id]);
  for(let change=true;change;){change=false;for(const e of map.edges)if(ancestors.has(e.target)&&!ancestors.has(e.source)){ancestors.add(e.source);change=true;}}
  factors.forEach(n=>assert.ok(ancestors.has(n.id)));
});

test('Negative and family-history factors do not become patient disease causes', () => {
  const source='診断名：脳梗塞\n入院前\n既往歴：高血圧なし。糖尿病なし。\n家族歴：父は高血圧。\n入院時\n右片麻痺あり。';
  const items=app.classifyTextByRules(source).map((i,k)=>({...i,id:`i${k}`}));
  const map=app.buildRelationMapFromRecord({id:'p',sourceText:source,items,carePlans:{}});
  assert.equal(map.edges.filter(e=>/原文の要因：/.test(e.evidence)).length,0);
});
