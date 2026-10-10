'use strict';
const sourceRange=require('./source-range');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../js/05-app-state-and-ui.js'),'utf8');
const rename=sourceRange(source,"    document.getElementById('btn-rename-patient').addEventListener",'    window.deletePatient =');
const deletion=source.slice(source.indexOf('    window.hardDeletePatientFromList ='),source.indexOf('    // ==========================================================================',source.indexOf('    window.hardDeletePatientFromList =')));
function mount(){
 const a={id:'a',title:'Original',items:[]},b={id:'b',title:'Other',items:[]};let confirm,renameHandler,deletions=0;
 const ctx={globalAppData:{patients:[a,b],currentPatientId:'a'},document:{getElementById:()=>({addEventListener:(_,fn)=>renameHandler=fn})},DOM:{currentPatientTitle:{textContent:'Original'}},patientSyncTimers:{},getCurrentPatient:()=>ctx.globalAppData.patients.find(p=>p.id===ctx.globalAppData.currentPatientId),openDialog:()=>new Promise(r=>confirm=r),showToast(){},saveDataAndSync(){},renderPatientTabs(){},persistData(){},savePatientsLocally(){},renderPatientListModal(){},rememberDeletedPatient(){},deletePatientFromServer:()=>deletions++,changeCurrentPatient:id=>ctx.globalAppData.currentPatientId=id};
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(rename+deletion,ctx);
 return {ctx,a,b,rename:()=>renameHandler(),confirm:v=>confirm(v),deletions:()=>deletions};
}
test('page rename refuses patient switches, target replacement and edits during confirmation',async()=>{
 for(const change of [h=>h.ctx.globalAppData.currentPatientId='b',h=>h.a.title='External',h=>h.ctx.globalAppData.patients[0]={...h.a}]){
  const h=mount(),pending=h.rename();change(h);h.confirm('Renamed');await pending;
  assert.notEqual(h.ctx.globalAppData.patients[0].title,'Renamed');assert.equal(h.b.title,'Other');assert.equal(h.ctx.DOM.currentPatientTitle.textContent,'Original');
 }
});
test('page rename accepts an unchanged target and trims the confirmed name',async()=>{const h=mount(),pending=h.rename();h.confirm(' Renamed ');await pending;assert.equal(h.a.title,'Renamed');assert.equal(h.ctx.DOM.currentPatientTitle.textContent,'Renamed');});
test('permanent deletion refuses changed targets, patient switches and a newly last page',async()=>{
 for(const change of [h=>h.ctx.globalAppData.currentPatientId='b',h=>h.a.items.push({id:'external'}),h=>h.ctx.globalAppData.patients[0]={...h.a},h=>h.ctx.globalAppData.patients.pop()]){
  const h=mount(),pending=h.ctx.hardDeletePatientFromList('a');change(h);h.confirm(true);await pending;
  assert.ok(h.ctx.globalAppData.patients.some(p=>p.id==='a'));assert.equal(h.deletions(),0);
 }
});
test('permanent deletion requires explicit confirmation and keeps the remaining page selected',async()=>{
 for(const confirmed of [false,'yes',true]){
  const h=mount(),pending=h.ctx.hardDeletePatientFromList('a');h.confirm(confirmed);await pending;
  assert.equal(h.deletions(),confirmed===true?1:0);assert.equal(h.ctx.globalAppData.currentPatientId,confirmed===true?'b':'a');
 }
});
