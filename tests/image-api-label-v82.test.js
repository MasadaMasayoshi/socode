const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const js = fs.readFileSync(__dirname + '/../js/05-app-state-and-ui.js', 'utf8');
test('image reading is marked as an API feature in settings and related UI text', () => {
  assert.match(html, /<summary>画像の読み取り設定（API）<\/summary>/);
  assert.match(html, /外部のAPI（Google Gemini）に送って文字起こしします。利用にはAPIキーが必要です/);
  assert.match(html, /画像から読み込む（API）/);
  assert.doesNotMatch(html, /<summary>画像の読み取り設定<\/summary>/);
  assert.ok(!/「画像の読み取り設定」/.test(html + js), 'every pointer to the settings uses the (API) label');
});
