'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {loadApp} = require('./app-helpers');
const make = id => ({id,items:[{id:'card',text:'Before'}],carePlans:{}});
function change(app,p,text) {
 const before=JSON.stringify(p.items); p.items[0].text=text;
 app.pushUndo(p.id,before,'Edit',p);
}
test('board history supports successive undo and redo without timestamp collisions',()=>{
 const app=loadApp(),p=make('p'); change(app,p,'First'); change(app,p,'Second');
 assert.ok(app.undoLast(p));assert.equal(p.items[0].text,'First');
 assert.ok(app.undoLast(p));assert.equal(p.items[0].text,'Before');
 assert.ok(app.undoLast(p,true));assert.equal(p.items[0].text,'First');
 assert.ok(app.undoLast(p,true));assert.equal(p.items[0].text,'Second');
});
test('board history refuses to overwrite later cards or linked care plans',()=>{
 for (const field of ['items','carePlans','myAssessments','missingChecks','relationMap']) {
  const app=loadApp(),p=make('p');change(app,p,'Edited');
  if(field==='items')p.items.push({id:'external'});else p[field]={external:true};
  assert.equal(app.undoLast(p),null,field);assert.equal(p.items[0].text,'Edited');
 }
});
test('new board operations clear redo and patient identifiers cannot share history',()=>{
 const app=loadApp(),p=make('__proto__'),q=make('q');change(app,p,'First');
 assert.equal(app.undoLast(q),null);assert.ok(app.undoLast(p));change(app,p,'New');
 assert.equal(app.undoLast(p,true),null);assert.equal(p.items[0].text,'New');
});
