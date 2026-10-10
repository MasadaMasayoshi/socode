'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const quality=require('../clinical-knowledge/patient-quality');
const html=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
const script=html.match(/<script>(\s*\/\/ Local, read-only checks[\s\S]*?)<\/script>/)[1];
function mount(initial) {
 const elements=new Map();
 function el(){return {hidden:true,textContent:'',style:{},dataset:{},children:[],attrs:{},listeners:{},addEventListener(k,f){this.listeners[k]=f;},setAttribute(k,v){this.attrs[k]=v;},replaceChildren(){this.children=[];this.textContent='';},append(...nodes){this.children.push(...nodes);},querySelectorAll(){return [];},scrollIntoView(){}};}
 const get=id=>{if(!elements.has(id))elements.set(id,el());return elements.get(id);};
 let patient=initial,saves=0;
 const events={};
 const context={console,document:{hidden:false,getElementById:get,createElement:el,createTextNode:text=>({textContent:text})},getCurrentPatient:()=>patient,saveDataAndSync:()=>saves++,touchItem:()=>{},logItemEdit:(i,e)=>{i.editLog.push({at:'2026-10-10T00:00:00Z',...e});},setInterval:()=>{},addEventListener:(k,f)=>events[k]=f,NursingPatientQuality:quality};
 context.window=context;
 vm.runInNewContext(script,context);
 return {get,scan:()=>get('nursing-auto-check-run').listeners.click(),switch:p=>patient=p,saves:()=>saves,context};
}
const cp=(id='p')=>({id,items:[{id:'c',type:'o',text:'SpO2 98%',timestamp:'入院後',hendersonIds:[1]}],carePlans:{}});
test('integrated patient audit runs, keeps changed-evidence warnings and respects background pause',()=>{
 const patient=cp(),ui=mount(patient);
 patient.carePlans.p={id:'p',problem:'呼吸状態',goalShort:'翌日までに実施',evidence:['SpO2 98%'],evidenceIds:['c'],evidenceSnapshot:[{...patient.items[0]}],op:['呼吸数を測定'],tp:['援助'],ep:['説明']};
 ui.scan();
 patient.items[0].text='SpO2 88%';ui.scan();
 assert.ok(ui.get('nursing-auto-check-results').children.some(x=>/変更されています/.test(x.textContent)));
 patient.items[0].timestamp='術後1日目';ui.scan();
 assert.ok(ui.get('nursing-auto-check-results').children.some(x=>/変更されています/.test(x.textContent)));
 const old=ui.get('nursing-auto-check-status').textContent;
 ui.context.document.hidden=true;
 patient.items=[];
 // Timer callbacks are read-only; manual scan remains available in a hidden tab.
 ui.scan();
 assert.notEqual(ui.get('nursing-auto-check-status').textContent,old);
 assert.equal(ui.saves(),0);
});
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
test('same observation at a different time is not reported as duplicate',()=>{
 const p=cp();p.items.push({...p.items[0],id:'d',timestamp:'術後1日目'});
 const ui=mount(p);ui.scan();
 assert.ok(!ui.get('nursing-auto-check-results').children.some(x=>/カードが重複/.test(x.textContent)));
});
