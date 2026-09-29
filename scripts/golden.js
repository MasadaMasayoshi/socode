'use strict';
// 分類結果の自動チェック（tests/golden/golden-lib.jsの説明を参照）。
//   npm run golden          … 今のプログラムの分類結果を、保存してある正しい分類結果と比べる
//   npm run golden:update   … 今の分類結果を新しい正しい分類結果として保存する
const { runGolden, formatReport } = require('../tests/golden/golden-lib');
const update = process.argv.includes('--update');
const results = runGolden({ update });
console.log(formatReport(results));
if (update) console.log('\n今の分類結果を、正しい分類結果として保存しました（tests/golden/expected/）。');
process.exitCode = !update && results.some(r => r.diff.length) ? 1 : 0;
