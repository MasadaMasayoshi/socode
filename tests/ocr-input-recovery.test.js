'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../js/10-reference-page-and-startup.js'),'utf8');
const code=source.slice(source.indexOf('    async function doOcr(file)'),source.indexOf('    // カルテスナップショット',source.indexOf('    async function doOcr(file)')));
function mount() {
 const a={id:'a',sourceText:'original-a'},b={id:'b',sourceText:'original-b'};
 let current=a,keyCalls=0,reads=0,resolveKey,reader,finished;
 const notices=[],el={classList:{add(){},remove(){}},innerHTML:''};
 const ctx={getCurrentPatient:()=>current,globalAppData:{patients:[a,b]},DOM:{sourceText:{value:'original-ui'}},requireApiKey:()=>{keyCalls++;return new Promise(r=>resolveKey=r);},showToast:(...args)=>notices.push(args),showAiErrorToast:(...args)=>notices.push(args),document:{getElementById:()=>el},callGeminiAI:async()=> 'fictional OCR',saveDataAndSync(){},schedulePatientSync(){},setTimeout(){}};
 ctx.FileReader=class {constructor(){reader=this;}readAsDataURL(){reads++;finished=this.onload({target:{result:'data:image/png;base64,AAAA'}});}};
 vm.createContext(ctx);vm.runInContext(code,ctx);
 return {ctx,a,b,notices,start:f=>ctx.doOcr(f),switch:()=>current=b,key:()=>resolveKey(true),counts:()=>({keyCalls,reads}),done:()=>finished,fail:()=>reader.onerror()};
}
const image={type:'image/png',size:4};
test('unsupported, empty and oversized input never asks for credentials or reads a file',async()=>{
 const h=mount();for(const f of [{type:'application/pdf',size:4},{...image,size:0},{...image,size:10*1024*1024+1}])await h.start(f);
 assert.deepEqual(h.counts(),{keyCalls:0,reads:0});assert.equal(h.ctx.DOM.sourceText.value,'original-ui');
});
test('patient selection during credential confirmation cannot redirect an OCR result',async()=>{
 const h=mount(),pending=h.start(image);h.switch();h.key();await pending;await h.done();
 assert.equal(h.a.sourceText,'original-a\nfictional OCR');assert.equal(h.b.sourceText,'original-b');assert.equal(h.ctx.DOM.sourceText.value,'original-ui');
});
test('a reader error reports failure while preserving existing text',async()=>{
 const h=mount();h.ctx.FileReader=class {readAsDataURL(){this.onerror();}};
 const pending=h.start(image);h.key();await pending;assert.equal(h.ctx.DOM.sourceText.value,'original-ui');assert.equal(h.a.sourceText,'original-a');assert.ok(h.notices.some(args=>args[1]==='error'));
});
