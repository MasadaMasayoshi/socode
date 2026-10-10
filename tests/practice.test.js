'use strict';const t=require('node:test'),a=require('node:assert/strict'),p=require('../clinical-knowledge/practice.js');t('cases are fictional and have explicit explanations',()=>{a.equal(p.cases.length,36);a.equal(new Set(p.cases.map(c=>c.id)).size,p.cases.length);for(const c of p.cases){a.ok(c.story.includes('架空'));a.ok(c.reason);a.ok(c.correct>=0&&c.correct<c.choices.length)}});t('quiz grades without AI',()=>{a.equal(p.grade('practice-fall',0).correct,true);a.equal(p.grade('practice-fall',1).correct,false)});t('new questions precede repeats, then weak topics get review',()=>{const one=p.cases[0];const unseen=p.chooseNext([{id:one.id,topic:one.topic,correct:false}]);a.notEqual(unseen.id,one.id);const attempts=p.cases.map(c=>({id:c.id,topic:c.topic,correct:c.id!==one.id}));a.equal(p.chooseNext(attempts).topic,one.topic)});t('rubric warns not diagnoses',()=>{let x=p.rubric({evidence:'原文'});a.equal(x.completedFields,1);a.ok(x.notice.includes('診断'))});
t('practice UI rotates option positions while preserving original answer values',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const html=fs.readFileSync(path.join(__dirname,'..','clinical-knowledge','practice.html'),'utf8');
 a.match(html,/attempts\.length\)%active\.choices\.length/);
 a.match(html,/input\.value=String\(i\)/);
});

t('practice UI stores question identifiers for distinct topics',()=>{const fs=require('node:fs'),path=require('node:path');const html=fs.readFileSync(path.join(__dirname,'..','clinical-knowledge','practice.html'),'utf8');a.match(html,/attempts\.push\(\{id:active\.id,topic:result\.topic/);});

t('practice progress is private, bounded and user-clearable',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const html=fs.readFileSync(path.join(__dirname,'..','clinical-knowledge','practice.html'),'utf8');
 a.match(html,/PROGRESS_KEY='socode-nursing-practice-v1'/);
 a.match(html,/known\.has\(x\.id\)/);
 a.match(html,/attempts\.slice\(-500\)/);
 a.match(html,/localStorage\.removeItem\(PROGRESS_KEY\)/);
 a.match(html,/id="reset-progress"/);
});

t('coverage counts distinct questions and the latest valid answer, not repeated attempts',()=>{
 const id='practice-need-1',r=p.coverage([{id,correct:true},{id,correct:false},{id:'unknown',correct:true},{id:'practice-need-2',correct:'yes'}]);
 a.equal(r.total,36);a.equal(r.answered,1);a.equal(r.lastCorrect,0);a.equal(r.needs.length,14);a.ok(r.needs.every(n=>n.total===1));a.equal(r.process.total,22);
 a.equal(p.coverage([{id,correct:false},{id,correct:true}]).needs[0].lastCorrect,1);
});
