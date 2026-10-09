'use strict';const t=require('node:test'),a=require('node:assert/strict'),p=require('../clinical-knowledge/practice.js');t('cases are fictional and have explicit explanations',()=>{a.equal(p.cases.length,4);for(const c of p.cases){a.ok(c.story.includes('架空'));a.ok(c.reason);a.ok(c.correct>=0&&c.correct<c.choices.length)}});t('quiz grades without AI',()=>{a.equal(p.grade('practice-fall',0).correct,true);a.equal(p.grade('practice-fall',1).correct,false)});t('weak topics prioritized for repeat practice',()=>{let x=p.chooseNext([{topic:'安全・転倒',correct:false},{topic:'OCR確認',correct:true},{topic:'看護計画',correct:true},{topic:'関連図',correct:true}]);a.equal(x.topic,'安全・転倒')});t('rubric warns not diagnoses',()=>{let x=p.rubric({evidence:'原文'});a.equal(x.completedFields,1);a.ok(x.notice.includes('診断'))});
t('practice UI rotates option positions while preserving original answer values',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const html=fs.readFileSync(path.join(__dirname,'..','clinical-knowledge','practice.html'),'utf8');
 a.match(html,/attempts\.length\)%active\.choices\.length/);
 a.match(html,/input\.value=String\(i\)/);
});
