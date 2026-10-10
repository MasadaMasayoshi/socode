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
 const ctx={localStorage:{getItem:k=>data.get(k)||null},writeLocalVerified:(k,v)=>{data.set(k,v);return true;},openDialog:async()=>'1',importPatientsDataText:async text=>{restored=JSON.parse(text);return true;},showToast(){}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(checkpoint,ctx);
 for(let i=0;i<5;i++)assert.equal(ctx.saveImportCheckpoint({patients:[{id:String(i)}]}),true);
 assert.equal(JSON.parse([...data.values()][0]).length,3);assert.equal(await ctx.restoreImportCheckpoint(),true);assert.equal(restored.patients[0].id,'4');
});
test('checkpoint write failure blocks replacement before patient data changes',()=>{
 const ctx={localStorage:{getItem:()=>null},writeLocalVerified:()=>false};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(checkpoint,ctx);assert.equal(ctx.saveImportCheckpoint({patients:[]}),false);
 const body=startup.slice(startup.indexOf('    async function importPatientsDataText'));
 assert.ok(body.indexOf('if (!saveImportCheckpoint(snapshot))')<body.indexOf('globalAppData.patients = [...kept'));
});
const changesFn=startup.slice(startup.indexOf('    function importCardChanges'),startup.indexOf('    async function importPatientsDataText'));
test('import preview counts changed, added and deleted active cards',()=>{
 const ctx={};vm.createContext(ctx);vm.runInContext(changesFn,ctx);
 const d=ctx.importCardChanges({items:[{id:'a',text:'old'},{id:'b'},{id:'gone',deleted:true}]},{items:[{id:'a',text:'new'},{id:'c'}]});
 assert.deepEqual(JSON.parse(JSON.stringify(d)),{added:1,removed:1,changed:1});
});
test('a patient updated while an import preview is open is protected',async()=>{
 let resolve,changed=false;
 const p={id:'p',items:[{id:'c',text:'before'}]};
 const fn=startup.slice(startup.indexOf('    async function importPatientsDataText'),startup.indexOf("    document.getElementById('input-load-data')"));
 const ctx={globalAppData:{patients:[p]},parseImportedDataText:()=>({patients:[{id:'p',items:[]}]}),openDialog:()=>new Promise(r=>resolve=r),showToast:()=>{},persistData:()=>{changed=true;}};
 vm.createContext(ctx);vm.runInContext(changesFn+fn,ctx);
 const pending=ctx.importPatientsDataText('unused');p.items[0].text='later';resolve(true);
 assert.equal(await pending,false);assert.equal(p.items[0].text,'later');assert.equal(changed,false);
});
test('a newly synced same-ID patient cannot be overwritten by a pending import',async()=>{
 let resolve;
 const fn=startup.slice(startup.indexOf('    async function importPatientsDataText'),startup.indexOf("    document.getElementById('input-load-data')"));
 const ctx={globalAppData:{patients:[]},parseImportedDataText:()=>({patients:[{id:'new',items:[]}]}),openDialog:()=>new Promise(r=>resolve=r),showToast:()=>{}};
 vm.createContext(ctx);vm.runInContext(changesFn+fn,ctx);
 const pending=ctx.importPatientsDataText('unused');ctx.globalAppData.patients.push({id:'new',items:[{id:'c',text:'synced'}]});resolve(true);
 assert.equal(await pending,false);assert.equal(ctx.globalAppData.patients[0].items[0].text,'synced');
});
