'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
const script=html.match(/<script>(\s*\/\/ Manual source comparison[\s\S]*?)<\/script>/)[1];
function mount(initial) {
 const elements=new Map();
 function el(){return {hidden:true,textContent:'',style:{},dataset:{},children:[],attrs:{},listeners:{},addEventListener(k,f){this.listeners[k]=f;},setAttribute(k,v){this.attrs[k]=v;},replaceChildren(){this.children=[];this.textContent='';},append(...nodes){this.children.push(...nodes);},querySelectorAll(){return [];},scrollIntoView(){}};}
 const get=id=>{if(!elements.has(id))elements.set(id,el());return elements.get(id);};
 let patient=initial,saves=0;
 const events={};
 const context={console,document:{hidden:false,getElementById:get,createElement:el,createTextNode:text=>({textContent:text})},getCurrentPatient:()=>patient,saveDataAndSync:()=>saves++,touchItem:()=>{},logItemEdit:(i,e)=>{i.editLog.push({at:'2026-10-10T00:00:00Z',...e});},setInterval:()=>{},addEventListener:(k,f)=>events[k]=f};
 context.window=context;
 vm.runInNewContext(script,context);
 return {get,switch:p=>patient=p,saves:()=>saves,context};
}
const cp=(id='p')=>({id,items:[{id:'c',type:'o',text:'SpO2 98%',timestamp:'入院後',hendersonIds:[1]}],carePlans:{}});
test('undo and redo stay independent when moving between patients',()=>{
 const a=cp('a'),b=cp('b');
 for(const p of [a,b]){p.items[0].text='after-'+p.id;p.items[0].editLog=[{kind:'text',at:'2026-10-09T00:00:00Z',from:'before-'+p.id,to:'after-'+p.id}];}
 const ui=mount(a),click=id=>ui.get(id).listeners.click();
 click('nursing-undo-text');assert.equal(a.items[0].text,'before-a');
 ui.switch(b);click('nursing-undo-text');click('nursing-redo-text');
 assert.equal(b.items[0].text,'after-b');
 ui.switch(a);click('nursing-redo-text');
 assert.equal(a.items[0].text,'after-a');
 assert.equal(ui.saves(),4);
});
test('redo cannot overwrite edits made after undo',()=>{
 const a=cp();a.items[0].text='after';a.items[0].editLog=[{kind:'text',at:'t',from:'before',to:'after'}];
 const ui=mount(a);ui.get('nursing-undo-text').listeners.click();
 a.items[0].text='later';ui.get('nursing-redo-text').listeners.click();
 assert.equal(a.items[0].text,'later');assert.equal(ui.saves(),1);
});
