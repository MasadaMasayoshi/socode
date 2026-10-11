'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../js/12-missing-checks-and-care-plan.js'),'utf8');
const snippet=code.slice(code.indexOf('    const carePlanOpen ='),code.indexOf('    function renderCarePlans()'));
function mount(){
 const a={id:'a',items:[{id:'c',text:'架空の根拠',type:'o'}],carePlans:{p:{id:'p',problem:'架空の計画',evidenceIds:['c'],records:[{id:'r',responseCardId:'c'}]}}};
 let current=a,jumps=0,views=[];const elements=new Map();
 const ctx={getCurrentPatient:()=>current,getCarePlan:(cp,id)=>cp.carePlans[id],jumpToBoardCard:id=>{if(!current.items.some(x=>x.id===id&&!x.deleted&&x.type!=='unnecessary'&&!x.aiSuggested))return false;jumps++;return true;},showToast(){},switchView:(...args)=>views.push(args),safeDomId:String,escapeHtml:s=>String(s).replace(/</g,'&lt;').replace(/"/g,'&quot;'),jsArg:x=>JSON.stringify(x),document:{getElementById:id=>{if(!elements.has(id))elements.set(id,{style:{},textContent:'',addEventListener(){}});return elements.get(id);},querySelector:()=>null}};
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(snippet,ctx);
 return {ctx,a,switch:cp=>current=cp,jumps:()=>jumps,views,elements};
}
test('plan evidence navigation and return preserve clinical data and disable regeneration',()=>{
 const h=mount(),before=JSON.stringify(h.a);
 assert.equal(h.ctx.openCarePlanEvidenceCard('a','p','c'),true);
 assert.equal(h.ctx.returnToCarePlanEvidenceOrigin(),true);
 assert.equal(h.views[0][0],'careplan');assert.equal(h.views[0][1].buildPlans,false);
 assert.equal(JSON.stringify(h.a),before);assert.equal(h.jumps(),1);
});
test('record response card is followed only while the record owns the link',()=>{
 const h=mount();assert.equal(h.ctx.openCarePlanEvidenceCard('a','p','c','r'),true);
 h.a.carePlans.p.records[0].responseCardId='other';
 assert.equal(h.ctx.openCarePlanEvidenceCard('a','p','c','r'),false);
 assert.equal(h.ctx.openCarePlanEvidenceCard('a','p','c','missing'),false);
});
test('another patient with matching plan and card IDs cannot use stale links or return',()=>{
 const h=mount();h.ctx.openCarePlanEvidenceCard('a','p','c');h.switch({...h.a,id:'b'});
 assert.equal(h.ctx.openCarePlanEvidenceCard('a','p','c'),false);
 assert.equal(h.ctx.returnToCarePlanEvidenceOrigin(),false);assert.equal(h.views.length,0);
});
test('deleted plans, removed links and missing or excluded cards stop navigation',()=>{
 for(const mutate of [h=>h.a.carePlans.p.deleted=true,h=>h.a.carePlans.p.evidenceIds=[],h=>h.a.items=[],h=>h.a.items[0].deleted=true,h=>h.a.items[0].type='unnecessary',h=>h.a.items[0].aiSuggested=true]){
  const h=mount();mutate(h);assert.equal(h.ctx.openCarePlanEvidenceCard('a','p','c'),false);assert.equal(h.jumps(),0);
 }
});
test('deleted return target and cleared origin cannot switch views',()=>{
 const h=mount();h.ctx.openCarePlanEvidenceCard('a','p','c');h.a.carePlans.p.deleted=true;
 assert.equal(h.ctx.returnToCarePlanEvidenceOrigin(),false);
 h.ctx.clearCarePlanEvidenceNavigation();assert.equal(h.ctx.returnToCarePlanEvidenceOrigin(),false);
 assert.equal(h.elements.get('careplan-evidence-origin').textContent,'');
});
test('link labels render untrusted text as text and missing cards as unavailable',()=>{
 const h=mount();h.a.items[0].text='<script>unsafe</script>';
 const html=h.ctx.carePlanLinkedCardHtml(h.a,h.a.carePlans.p,'c');
 assert.ok(html.includes('&lt;script>'));assert.ok(!html.includes('<script>'));
 assert.match(h.ctx.carePlanLinkedCardHtml(h.a,h.a.carePlans.p,'missing'),/参照先のカードがありません/);
});
