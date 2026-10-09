'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const plans=fs.readFileSync(path.join(__dirname,'../js/12-missing-checks-and-care-plan.js'),'utf8'),assessment=fs.readFileSync(path.join(__dirname,'../js/11-own-assessment.js'),'utf8');
const planDelete=plans.slice(plans.indexOf('    window.deleteCarePlanUI ='),plans.indexOf('    // 旧AIの結果'));
const recordDelete=plans.slice(plans.indexOf('    window.deleteCareRecordUI ='),plans.indexOf('    // ==========================================================================',plans.indexOf('    window.deleteCareRecordUI =')));
const restore=assessment.slice(assessment.indexOf('    window.restoreMyAssessmentVersion ='),assessment.indexOf('    window.clearMyAssessmentAi ='));
const patient=id=>({id,carePlans:{p:{id:'p',problem:'before',records:[{id:'r',evaluation:'before'}]}},myAssessments:{1:{interpretation:'before'}}});
function mount(code,cp){let current=cp,resolve,mutations=0;const ctx={getCurrentPatient:()=>current,getCarePlan:(p,id)=>p?.carePlans[id],getMyAssessment:(p,n)=>p?.myAssessments[n],openDialog:()=>new Promise(r=>resolve=r),deleteCarePlan:()=>{mutations++;return true;},deleteCareRecord:()=>{mutations++;return true;},restoreMyAssessmentFromHistory:()=>{mutations++;return true;},commitCarePlanChange(){},commitMyAssessmentChange(){},showToast(){}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(code,ctx);return {ctx,switch:p=>current=p,confirm:()=>resolve(true),mutations:()=>mutations};}
for(const [name,code,invoke,change] of [
 ['plan deletion',planDelete,c=>c.deleteCarePlanUI('p'),p=>p.carePlans.p.problem='otherx'],
 ['record deletion',recordDelete,c=>c.deleteCareRecordUI('p','r'),p=>p.carePlans.p.records[0].evaluation='otherx'],
 ['assessment restoration',restore,c=>c.restoreMyAssessmentVersion(1,1),p=>p.myAssessments[1].interpretation='otherx']
]){
 test(name+' protects a different patient with matching IDs',async()=>{const a=patient('a'),h=mount(code,a),pending=invoke(h.ctx);h.switch(patient('b'));h.confirm();await pending;assert.equal(h.mutations(),0);});
 test(name+' protects updates made during confirmation',async()=>{const a=patient('a'),h=mount(code,a),pending=invoke(h.ctx);change(a);h.confirm();await pending;assert.equal(h.mutations(),0);});
 test(name+' applies an unchanged confirmed target',async()=>{const a=patient('a'),h=mount(code,a),pending=invoke(h.ctx);h.confirm();await pending;assert.equal(h.mutations(),1);});
}
test('record editor does not create cards or write into a patient selected after opening',()=>{
 const a=patient('a'),b=patient('b');let writes=0;
 const fn=plans.slice(plans.indexOf('    window.saveCareRecordUI ='),plans.indexOf('    window.deleteCareRecordUI ='));
 const ctx={careRecordEditing:{patientId:a.id,planId:'p',recId:'r'},getCurrentPatient:()=>b,getCarePlan:(p,id)=>p.carePlans[id],showToast(){},createOwnInfoCard:()=>writes++,updateCareRecord:()=>writes++,addCareRecord:()=>writes++};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fn,ctx);ctx.saveCareRecordUI();assert.equal(writes,0);assert.notEqual(ctx.careRecordEditing,null);
});
