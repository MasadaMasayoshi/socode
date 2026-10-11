'use strict';
// Compare original fixtures against approved expectations; see tests/golden/golden-lib.js.
// npm run golden: compare only; missing inputs/answers fail.
// npm run golden:update: explicitly overwrite expectations; this does not establish approval.
const { runGolden, formatReport } = require('../tests/golden/golden-lib');
const update = process.argv.includes('--update');
const results = runGolden({ update });
console.log(formatReport(results));
if (update) console.log('\nCurrent output saved to tests/golden/expected; independent approval is not established.');
process.exitCode = !update && results.some(r => r.diff.length) ? 1 : 0;
