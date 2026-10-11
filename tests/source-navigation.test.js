'use strict';
const sourceRange=require('./source-range');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync(require('node:path').join(__dirname,'../js/09-board.js'),'utf8');
const context={window:{}};vm.createContext(context);
vm.runInContext(sourceRange(code,'','    var highlightedSourceItemId ='),context);
const match=(source,text)=>JSON.parse(JSON.stringify(context.findSourceExactMatches(source,text)));
test('all repeated literal occurrences remain separate and preserve chronological positions',()=>{
 const source='術前：痛みなし\n術後：痛みなし';
 const result=match(source,'痛みなし');assert.equal(result.kind,'literal');assert.equal(result.ranges.length,2);
 assert.deepEqual(result.ranges.map(([s,e])=>source.slice(s,e)),['痛みなし','痛みなし']);
 assert.ok(result.ranges[0][0]<result.ranges[1][0]);
});
test('fullwidth and whitespace differences are explicit normalized matches',()=>{
 const source='体温：３６．８ ℃\n体温：３６．８ ℃',result=match(source,'体温:36.8℃');
 assert.equal(result.kind,'normalized');assert.equal(result.ranges.length,2);
 assert.equal(source.slice(...result.ranges[1]),'体温：３６．８ ℃');
});
test('emoji before or within matching text never shifts UTF-16 source offsets',()=>{
 const source='🙂先頭\n記録：🙂３６．８℃';
 const result=match(source,'記録:🙂36.8℃');
 assert.equal(source.slice(...result.ranges[0]),'記録：🙂３６．８℃');
 const ranges=JSON.parse(JSON.stringify(context.findSourceHighlightRanges(source,'記録:🙂36.8℃')));
 assert.equal(source.slice(...ranges[0]),'記録：🙂３６．８℃');
});
test('normalization expansions map back to the complete original character',()=>{
 const source='🙂 ㍑',result=match(source,'リットル');
 assert.equal(result.kind,'normalized');assert.equal(source.slice(...result.ranges[0]),'㍑');
});
test('partial words and supplemented clinical text are never called exact source matches',()=>{
 assert.equal(match('痛みなし','痛みなし、食欲良好').ranges.length,0);
 assert.equal(match('体温36.8℃','体温36.8℃ (基準値:36〜37℃)').ranges.length,0);
 assert.equal(match('文字','').ranges.length,0);
});
test('literal occurrences take priority over alternate spellings',()=>{
 assert.deepEqual(match('体温：３６．８℃\n体温:36.8℃','体温:36.8℃'),{kind:'literal',ranges:[[9,17]]});
});
