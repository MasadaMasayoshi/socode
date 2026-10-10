'use strict';
// Successful runs print counts; complete diagnostics remain in the full log.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { testTargets, testEnv } = require('./run-tests');
function summarize(log) {
 const counts = {};
 for (const key of ['tests','pass','fail','cancelled','skipped','todo']) {
  const matches = [...log.matchAll(new RegExp('^# '+key+' (\\d+)\\s*$', 'gm'))];
  if (!matches.length) throw Error('Missing test summary: '+key);
  counts[key] = Number(matches.at(-1)[1]);
 }
 if (!counts.tests) throw Error('No tests executed');
 return counts;
}
function failureExcerpt(log, limit = 8000) {
 const blocks = log.match(/^\s*not ok[^\n]*(?:\n[ \t]+[^\n]*)*/gm) || [];
 const details = blocks.length ? blocks.join('\n') : log;
 return details.length <= limit ? details : details.slice(0, limit) + '\n[Diagnostic excerpt truncated; complete output is in the full log.]\n';
}
function run(files = [], options = {}) {
 const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'socode-tests-'));
 const logPath = path.resolve(options.logPath || path.join(directory, 'full.log'));
 fs.mkdirSync(path.dirname(logPath), {recursive:true});
 const fd = fs.openSync(logPath, 'w');
 let result;
 try { result = spawnSync(process.execPath, ['--test','--test-reporter=tap',...testTargets(files)], {stdio:['ignore',fd,fd],env:testEnv()}); }
 finally { fs.closeSync(fd); }
 const log = fs.readFileSync(logPath, 'utf8');
 let counts;
 try { counts = summarize(log); } catch (error) { console.error(error.message); }
 if (counts) for (const [key,value] of Object.entries(counts)) console.log('# '+key+' '+value);
 const failed = result.error || result.signal || result.status !== 0 || !counts || counts.pass !== counts.tests || ['fail','cancelled','skipped','todo'].some(key=>counts[key]!==0);
 console.log('Full log: '+logPath);
 if (failed) {
  if (result.error) console.error(result.error.message);
  if (result.signal) console.error('Test runner interrupted: '+result.signal);
  // Report every failure count; cap repeated diagnostics without dropping the full log.
  process.stderr.write(failureExcerpt(log));
 }
 return failed ? (result.status || 1) : 0;
}
if (require.main === module) {
 if (!process.argv.slice(2).length) console.log('Public specifications only; archival comparisons: npm run test:legacy (missing fixtures fail).');
 try { process.exitCode = run(process.argv.slice(2), {logPath:process.env.SOCODE_TEST_LOG}); }
 catch (error) { console.error(error.message);process.exitCode=1; }
}
module.exports = {summarize,failureExcerpt,run};
