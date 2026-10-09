'use strict';
// Compact output must preserve every failure and the runner exit status.
const { spawnSync } = require('child_process');
const { testTargets, testEnv } = require('./run-tests');
const files = process.argv.slice(2);
const targets = testTargets(files);
const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...targets], { encoding: 'utf8', maxBuffer: 1 << 28, env: testEnv() });
const out = (r.stdout || '') + (r.stderr || '');
const num = k => (out.match(new RegExp('^# ' + k + ' (\\d+)', 'm')) || [])[1] || '?';
const bad = out.split('\n').filter(l => /^not ok /.test(l));
console.log(`tests ${num('tests')} / pass ${num('pass')} / fail ${num('fail')}`);
if (bad.length) console.log(bad.join('\n'));
if (r.error || r.signal || r.status !== 0 || num('tests') === '?') {
  if (r.error) console.error(r.error.message);
  if (!bad.length) console.error(out.slice(-4000));
  process.exitCode = r.status || 1;
}
