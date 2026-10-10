'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const diff=require('../clinical-knowledge/catalog-diff');
const claim=()=>({id:'a',statement:'架空の資料',sources:[{url:'https://example.test',version:'1'}],status:'pending-expert-review'});
const catalog=(...claims)=>({schemaVersion:1,claims});
test('catalog diff identifies additions, removals and unchanged records without mutating input',()=>{
 const old=catalog(claim(),{...claim(),id:'removed'}),now=catalog(claim(),{...claim(),id:'added'});
 const original=JSON.stringify([old,now]),result=diff.compare(old,now);
 assert.deepEqual([result.added,result.removed,result.changed,result.unchanged],[1,1,0,1]);
 assert.equal(JSON.stringify([old,now]),original);
});
test('body, citation versions and approval changes are shown separately',()=>{
 const old=catalog(claim()),now=catalog({...claim(),statement:'改訂本文',sources:[{url:'https://example.test/new',version:'2'}],status:'approved',reviewer:'架空の比較入力',ownerApproval:{status:'approved'}});
 const result=diff.compare(old,now);
 assert.deepEqual(result.changes[0].fields.map(x=>x.key),['ownerApproval','reviewer','sources','statement','status']);
 assert.equal(old.claims[0].status,'pending-expert-review');
});
test('object key order and catalog record order do not create false changes',()=>{
 const old=catalog(claim(),{...claim(),id:'b'}),now=catalog({...claim(),id:'b'},{sources:[{version:'1',url:'https://example.test'}],status:'pending-expert-review',statement:'架空の資料',id:'a'});
 assert.equal(diff.compare(old,now).unchanged,2);
});
test('unrecognized record metadata is compared, export-level metadata is ignored',()=>{
 const old={...catalog(claim()),exportedAt:'old'},now={...catalog({...claim(),edition:'2'}),exportedAt:'new'};
 assert.equal(diff.compare(old,now).changes[0].fields[0].key,'edition');
});
test('malformed JSON and unsupported schemas fail visibly',()=>{
 assert.throws(()=>diff.parse('{'),/JSON/);
 assert.throws(()=>diff.parse(JSON.stringify({schemaVersion:2,claims:[]})),/schemaVersion/);
 assert.throws(()=>diff.compare(catalog(),{schemaVersion:1,claims:{}}),/claims/);
});
test('duplicate IDs, missing text and invalid sources are rejected',()=>{
 assert.throws(()=>diff.compare(catalog(claim(),claim()),catalog()),/ID/);
 for(const bad of [{...claim(),id:' '},{...claim(),statement:null},{...claim(),sources:[null]}]) assert.throws(()=>diff.compare(catalog(bad),catalog()));
});
test('oversized UTF-8 files and excessive record counts are rejected',()=>{
 assert.throws(()=>diff.parse('あ'.repeat(diff.MAX_BYTES/3+1)),/2MB/);
 assert.throws(()=>diff.compare(catalog(...Array.from({length:1001},(_,i)=>({...claim(),id:String(i)}))),catalog()),/1000/);
});
test('real catalog can be exported and compared without losing review restrictions',()=>{
 const current=require('../clinical-knowledge/candidates.json');
 const result=diff.compare(diff.parse(JSON.stringify({schemaVersion:1,claims:current.claims})),current);
 assert.equal(result.unchanged,29);assert.equal(result.changed,0);
 assert.ok(current.claims.every(x=>x.status==='pending-expert-review'));
});
