'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','js','10-reference-page-and-startup.js'),'utf8');
test('export contains a timestamp and a version tag',()=>{
 const app=require('./app-helpers').loadApp();
 const stamp='2026-10-12T01:00:00.000Z';
 const backup=app.buildPatientBackupData(stamp);
 assert.equal(backup.schemaVersion,1);assert.equal(backup.exportedAt,stamp);
 assert.ok(Array.isArray(backup.patients));assert.equal(Object.hasOwn(backup,'apiKey'),false);
 assert.match(src,/const backup = buildPatientBackupData\(\)/);
});
test('a same-ID import prepares a backup before replacement',()=>{
 const backupIndex=src.indexOf("reason: 'before-import-conflict'");
 const replaceIndex=src.indexOf('const byId = new Map(data.patients.map');
 assert.ok(backupIndex>0&&replaceIndex>backupIndex);
 assert.ok(src.includes('if (replacing > 0)'));
 assert.ok(src.includes('nursing_before_import_'));
});
test('import still validates and asks for confirmation first',()=>{
 assert.ok(src.includes('parseImportedDataText(text)'));
 assert.ok(src.includes('if (ok !== true) return false;'));
});
