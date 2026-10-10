'use strict';
const sourceRange=require('./source-range');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../js/05-app-state-and-ui.js'),'utf8');
const code=sourceRange(source,'    function showUndoToast','    const dialogEl =');
function mount(){
 const owner={id:'a',items:[]};let toast,saves=0,marks=0;const notices=[];
 const ctx={globalAppData:{patients:[owner]},document:{createElement:()=>({children:[],style:{},classList:{replace(){}},append(...x){this.children.push(...x);},addEventListener(_,fn){this.click=fn;},remove(){}})},DOM:{toastContainer:{appendChild:x=>toast=x}},setTimeout(){},markPatientChanged:()=>marks++,saveDataAndSync:()=>saves++,showToast:(text,type)=>notices.push({text,type})};
 vm.createContext(ctx);vm.runInContext(code,ctx);return {ctx,owner,notices,saves:()=>saves,marks:()=>marks,click:()=>toast.children[2].click()};
}
test('undo toast refuses later patient changes, deletion or a same-ID replacement',()=>{
 for(const change of [h=>h.owner.items.push({id:'external'}),h=>h.ctx.globalAppData.patients=[],h=>h.ctx.globalAppData.patients=[{...h.owner}]]){
  const h=mount();let writes=0;h.ctx.showUndoToast('Deleted',()=>writes++,{patientId:'a'});change(h);h.click();
  assert.equal(writes,0);assert.equal(h.saves(),0);assert.equal(h.marks(),0);assert.ok(h.notices.every(x=>x.type==='warn'));
 }
});
test('failed restoration never emits a success notification or sync',()=>{
 const h=mount();h.ctx.showUndoToast('Deleted',()=>false,{patientId:'a'});h.click();assert.equal(h.saves(),0);assert.equal(h.marks(),0);assert.ok(h.notices.every(x=>x.type==='warn'));
});
test('successful undo runs once and syncs the owning patient',()=>{
 const h=mount();let writes=0;h.ctx.showUndoToast('Deleted',()=>writes++,{patientId:'a'});h.owner.updatedAt='2026-10-10T00:00:00Z';h.click();h.click();
 assert.equal(writes,1);assert.equal(h.saves(),1);assert.equal(h.marks(),1);assert.equal(h.notices[0].text,'元に戻しました');
});
