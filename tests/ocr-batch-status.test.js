'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const sourceRange=require('./source-range');
const source=fs.readFileSync(require.resolve('../js/10-reference-page-and-startup.js'),'utf8');
const code=sourceRange(source,'    let ocrBatchBusy = false;','    async function doOcr(file, options = {})');
const image=name=>({name,type:'image/png',size:4});
function mount(results,changePatient=false){
 const hidden=new Set(['hidden']),status={classList:{remove:k=>hidden.delete(k),toggle(k,on){if(on)hidden.add(k);else hidden.delete(k);}}};
 const text={textContent:''},input={disabled:false},calls=[],notices=[],a={id:'a',title:'架空A'},b={id:'b',title:'架空B'};
 let current=a;
 const ctx={document:{getElementById:id=>id==='ocr-status'?status:text},ocrFileInput:input,getCurrentPatient:()=>current,
  globalAppData:{patients:[a,b]},requireApiKey:async()=>true,showToast:(...args)=>notices.push(args),
  async doOcr(file,options){calls.push({name:file.name,patientId:options.patientId});if(changePatient)current=b;return results[calls.length-1];}};
 vm.createContext(ctx);vm.runInContext(code,ctx);
 return {run:files=>ctx.doOcrBatch(files),hidden,text,input,calls,notices};
}
test('Partial image failure remains visible, identifies only failed files and releases the input',async()=>{
 const h=mount([true,false,true]);await h.run([image('first.png'),image('failed.png'),image('last.png')]);
 assert.deepEqual(h.calls.map(c=>c.name),['first.png','failed.png','last.png']);
 assert.equal(h.hidden.has('hidden'),false);assert.equal(h.input.disabled,false);
 assert.match(h.text.textContent,/2 \/ 3枚.*failed\.png/);
 assert.doesNotMatch(h.text.textContent,/first\.png|last\.png/);
 assert.match(h.text.textContent,/原画像の順/);
});
test('Batch results retain original patient ownership and successful imports clear old failure status',async()=>{
 const h=mount([false,true,true],true);await h.run([image('failed.png'),image('last.png')]);
 assert.ok(h.calls.every(c=>c.patientId==='a'));assert.match(h.text.textContent,/「架空A」/);
 await h.run([image('retry.png')]);
 assert.equal(h.calls[2].patientId,'b');assert.equal(h.hidden.has('hidden'),true);assert.equal(h.input.disabled,false);
});
