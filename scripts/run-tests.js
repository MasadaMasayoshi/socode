'use strict';
// Explicit discovery works on Windows too and cannot recursively launch test-quiet.js.
const { readdirSync } = require('fs');
const { join } = require('path');
const { spawnSync } = require('child_process');
function testTargets(files = []) {
  return files.length ? files : readdirSync(join(__dirname, '..', 'tests')).filter(f => f.endsWith('.test.js')).sort().map(f => join(__dirname, '..', 'tests', f));
}
function testEnv() {
  // Only loopback HTTP bypasses a configured proxy, enabling isolated Express integration tests.
  const bypass = [process.env.NO_PROXY, process.env.no_proxy, '127.0.0.1', 'localhost', '::1'].filter(Boolean).join(',');
  return {...process.env, NO_PROXY:bypass, no_proxy:bypass};
}
if (require.main === module) {
  const r = spawnSync(process.execPath, ['--test', ...testTargets(process.argv.slice(2))], {stdio:'inherit', env:testEnv()});
  if (r.error) console.error(r.error.message);
  process.exitCode = r.status ?? 1;
}
module.exports = {testTargets,testEnv};
