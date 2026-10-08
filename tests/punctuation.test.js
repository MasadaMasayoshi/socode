const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers');
test('punctuation is chosen automatically for split and merged compound sentences', () => {
  const app = loadApp();
  assert.deepEqual(Array.from(app.splitCompoundSentences('ペインスケール5まで上昇したが、帰室後2となっている')), ['ペインスケール5まで上昇した。', '帰室後2となっている。']);
  assert.deepEqual(Array.from(app.splitCompoundSentences('「痛いけど、頑張る」と話す')), ['「痛いけど、頑張る」と話す。']);
  assert.equal(app.punctuateClause('創痛がある'), '創痛がある。');
  assert.equal(app.punctuateClause('創痛がある。'), '創痛がある。');
  assert.equal(app.joinWithPunctuation(['創痛がある。', '内服する']), '創痛がある。内服する。');
  assert.equal(app.joinWithPunctuation(['車椅子に移乗して', '歩行訓練を行う']), '車椅子に移乗して、歩行訓練を行う。');
});
