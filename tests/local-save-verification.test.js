'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../js/05-app-state-and-ui.js'),'utf8');
const fn=source.slice(source.indexOf('    function writeLocalVerified('),source.indexOf('    function updateSaveStatus('));
function verify(back,throws=false){return vm.runInNewContext(fn+'\nwriteLocalVerified("patient", "abcd")',{localStorage:{setItem(){if(throws)throw Error('quota');},getItem(){return back;}},console:{warn(){}}});}
test('local persistence verifies exact content rather than length',()=>{assert.equal(verify('abcd'),true);assert.equal(verify('wxyz'),false);});
test('missing readback and write failure cannot be reported as saved',()=>{assert.equal(verify(null),false);assert.equal(verify(undefined),false);assert.equal(verify('abcd',true),false);});
