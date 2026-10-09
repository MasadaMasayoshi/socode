'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const mapSource=fs.readFileSync(path.join(__dirname,'../js/15-relation-map.js'),'utf8');
function history(){
 let patient,saves=0;const messages=[];
 const select=mapSource.slice(mapSource.indexOf('    const rmPatientHistories'),mapSource.indexOf('    function rmCommit'));
 const undo=mapSource.slice(mapSource.indexOf('    function rmUndoRedo'),mapSource.indexOf('    function rmZoom('));
 const ctx={rmState:{patientId:null,undo:[],redo:[]},RM_UNDO_MAX:40,getCurrentPatient:()=>patient,normalizeRelationMap:x=>x===null?null:x&&Array.isArray(x.nodes)?x:null,showToast:m=>messages.push(m),rmCommit:(cp,map)=>{cp.relationMap=map;ctx.rmState.historyExpected=JSON.stringify(map);saves++;}};
 vm.createContext(ctx);vm.runInContext(select+'\n'+undo,ctx);
 return {ctx,messages,saves:()=>saves,set:p=>patient=p,select:p=>ctx.rmSelectHistory(p),push:p=>ctx.rmPushUndo(p),undo:()=>ctx.rmUndoRedo(false),redo:()=>ctx.rmUndoRedo(true)};
}
const patient=id=>({id,relationMap:{nodes:[{id:'n',label:'before'}],edges:[]}});
function edit(h,p){h.select(p);h.push(p);p.relationMap.nodes[0].label='after';h.ctx.rmState.historyExpected=JSON.stringify(p.relationMap);}
test('map undo/redo histories survive patient switches without crossing patients',()=>{
 const h=history(),a=patient('a'),b=patient('b');h.set(a);edit(h,a);h.undo();h.set(b);edit(h,b);h.undo();h.redo();h.set(a);h.select(a);h.redo();assert.equal(a.relationMap.nodes[0].label,'after');assert.equal(b.relationMap.nodes[0].label,'after');assert.equal(h.saves(),4);
});
test('external update and corrupt history cannot overwrite or erase a map',()=>{
 const h=history(),p=patient('p');h.set(p);edit(h,p);p.relationMap.nodes[0].label='external';h.undo();assert.equal(p.relationMap.nodes[0].label,'external');assert.equal(h.saves(),0);
 h.ctx.rmState.historyExpected=JSON.stringify(p.relationMap);h.ctx.rmState.undo=['broken'];h.undo();assert.equal(p.relationMap.nodes[0].label,'external');assert.equal(h.ctx.rmState.undo.length,1);assert.equal(h.saves(),0);
});
const startup=fs.readFileSync(path.join(__dirname,'../js/10-reference-page-and-startup.js'),'utf8');
const checkpoint=startup.slice(startup.indexOf('    const IMPORT_CHECKPOINT_KEY'),startup.indexOf('    async function importPatientsDataText'));
test('import checkpoints retain three versions and restoration goes through import preview',async()=>{
 const data=new Map();let restored;
 const ctx={localStorage:{getItem:k=>data.get(k)||null},writeLocalVerified:(k,v)=>{data.set(k,v);return true;},importPatientsDataText:async text=>{restored=JSON.parse(text);return true;},showToast(){}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(checkpoint,ctx);
 for(let i=0;i<5;i++)assert.equal(ctx.saveImportCheckpoint({patients:[{id:String(i)}]}),true);
 assert.equal(JSON.parse([...data.values()][0]).length,3);assert.equal(await ctx.restoreImportCheckpoint(),true);assert.equal(restored.patients[0].id,'4');
});
test('checkpoint write failure blocks replacement before patient data changes',()=>{
 const ctx={localStorage:{getItem:()=>null},writeLocalVerified:()=>false};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(checkpoint,ctx);assert.equal(ctx.saveImportCheckpoint({patients:[]}),false);
 const body=startup.slice(startup.indexOf('    async function importPatientsDataText'));
 assert.ok(body.indexOf('if (!saveImportCheckpoint(snapshot))')<body.indexOf('globalAppData.patients = [...kept'));
});
