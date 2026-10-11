'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const tagsOf = text => Array.from(app.detectMultipleHendersonTags(text)).sort((a, b) => a - b);
const has = (text, ...ids) => { const t = tagsOf(text); ids.forEach(h => assert.ok(t.includes(h), `${text} に ${h} が無い: ${t}`)); };
const cards = text => Array.from(app.classifyTextByRules(text));

test('7：「知覚異常、冷感なし」は患肢の循環・神経の評価なので9（7にしない）', () => {
  assert.deepEqual(tagsOf('知覚異常、冷感なし'), [9]);
  assert.ok(tagsOf('悪寒・冷感あり、体温38.2度').includes(7), '体温と一緒なら7のまま');
});

test('7：「検温」だけのカードは次の測定値と1枚にする', () => {
  const c = cards('10:00 検温\n体温 37.0度 血圧125/70 脈拍 74回/分 整');
  assert.ok(!c.some(x => x.text === '検温'), JSON.stringify(c.map(x => x.text)));
  assert.ok(c.some(x => /^検温: 体温 37\.0度/.test(x.text)), JSON.stringify(c.map(x => x.text)));
});

test('14：診断名・高血圧・薬剤そのものは14にしない', () => {
  assert.ok(!tagsOf('常用薬: ノルバスク2.5mg 1錠×朝').includes(14));
  assert.ok(!Array.from(app.detectDiagnosisTagHints('高血圧症')).includes(14));
  assert.ok(!Array.from(app.detectDiagnosisTagHints('右大腿骨頸部骨折')).includes(14));
});

test('14：本人の治療・動作への疑問や知識不足は14（と4・9）', () => {
  has('「大手術だったのに、もう起きていいの?人工骨頭がずれたりしないかしら?」', 14, 4, 9);
  has('「体重かけても大丈夫なの?怖い」', 4, 14, 9);
  has('本人より「退院して、何に気を付けないといけないのか。がわからない」', 14, 9);
  has('「家に帰ってから気を付けることは、わからないのでまた教えてください。」と返答あり', 14, 9);
  assert.ok(!tagsOf('「大丈夫よ」「心配しないで」').includes(14), '家族を安心させる「大丈夫よ」は14にしない');
});

test('タグの不足：旅行→13、情けない→12、動けるようになってきた→4・12', () => {
  has('「早く治してまた旅行をしたい」', 13, 10);
  has('「情けないわ。こんなに思うように動けなくて」', 10, 12);
  has('「自分で少しは動けるようになってきた」と話す', 4, 12);
  has('トイレ時は、ナースコールしてもらうよう伝える。理解力あり', 9, 3, 14);
});

test('生殖などの14項目外の情報は「タグ未設定」ではなく基本情報（14項目外）', () => {
  const item = { type: 'o', text: '生殖: 特に問題なし 出産歴2回、閉経50歳', hendersonIds: [] };
  assert.equal(app.isOtherBasicInfoItem(item), true);
  assert.equal(app.isUntaggedItem(item), false);
  assert.equal(app.isUntaggedItem({ type: 'o', text: '受持ち開始', hendersonIds: [] }), true, 'それ以外のタグ無しは今まで通り警告');
});
