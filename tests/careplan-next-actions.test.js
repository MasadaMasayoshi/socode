'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {loadApp}=require('./app-helpers');
const sourceRange=require('./source-range');
const app=loadApp();
const patient=()=>({id:'p',items:[],carePlans:{}});
const planFor=cp=>app.createCarePlan(cp,{problem:'急性疼痛',source:'manual',op:['NRS'],tp:['手で入力した援助'],ep:['手で入力した説明']});
test('Review next actions use the latest recorded outcome without changing the plan',()=>{
 const cp=patient(),plan=planFor(cp);
 app.addCareRecord(cp,plan.id,{achievement:'achieved',response:'架空の反応'},'2026-01-01T10:00:00Z');
 assert.match(app.carePlanSetNextSteps(cp).find(a=>a.planId===plan.id).text,/継続するか終了するか/);
 app.addCareRecord(cp,plan.id,{achievement:'not',response:'架空の再評価'},'2026-01-02T10:00:00Z');
 const before=JSON.stringify(plan),text=app.carePlanSetNextSteps(cp).find(a=>a.planId===plan.id).text;
 assert.match(text,/未達成.*修正案と再評価の時期/);assert.doesNotMatch(text,/目標の達成が記録/);
 assert.equal(JSON.stringify(plan),before);
});
test('Partial and unevaluable records give specific follow-up while closed plans do not prompt automatic resumption',()=>{
 const cp=patient(),plan=planFor(cp);
 app.addCareRecord(cp,plan.id,{achievement:'partial'},'2026-01-01T10:00:00Z');
 assert.match(app.carePlanSetNextSteps(cp).find(a=>a.planId===plan.id).text,/一部達成.*再評価の時期/);
 app.addCareRecord(cp,plan.id,{achievement:''},'2026-01-02T10:00:00Z');
 assert.match(app.carePlanSetNextSteps(cp).find(a=>a.planId===plan.id).text,/不足する情報と確認する時期/);
 for(const status of ['ended','resolved','paused']){
  plan.status=status;plan.tp=[];
  const action=app.carePlanSetNextSteps(cp).find(a=>a.planId===plan.id);
  assert.equal(action.missing,undefined);assert.match(action.text,/再評価・再開が必要になる条件/);
 }
 assert.match(app.carePlanSetNextSteps(patient())[0].text,/計画を作成してから/);
});
test('An unsupported blank-section suggestion reports no change and never commits a success',()=>{
 const cp=patient(),plan=app.createCarePlan(cp,{problem:'架空の未対応問題のリスク状態',source:'manual'});
 const model=app.cpModelOrFallback(cp,plan);assert.ok(model);assert.equal(model.tp.length,0);assert.equal(model.ep.length,0);
 const source=fs.readFileSync(require.resolve('../js/12-missing-checks-and-care-plan.js'),'utf8');
 const code=sourceRange(source,'    window.fillMissingCareSectionsUI = function(id) {','    function buildCarePlansText(');
 const notices=[],ctx={window:{},getCurrentPatient:()=>cp,getCarePlan:app.getCarePlan,cpModelOrFallback:app.cpModelOrFallback,
  careOperationSnapshot:()=>JSON.stringify(cp),showToast:(...args)=>notices.push(args),
  updateCarePlan(){throw Error('Unexpected update');},rememberCareOperation(){throw Error('Unexpected history');},commitCarePlanChange(){throw Error('Unexpected save');}};
 vm.createContext(ctx);vm.runInContext(code,ctx);const before=JSON.stringify(cp);
 ctx.window.fillMissingCareSectionsUI(plan.id);
 assert.equal(JSON.stringify(cp),before);assert.match(notices[0][0],/追記案がありません/);assert.equal(notices[0][1],'warn');
});
