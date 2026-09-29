'use strict';
// 改善提案5・6の検証。
//  6「追加キーワード」：学習データ管理の画面から、プログラムを直さずにタグ付けのルールを登録できる。
//    ・「付ける」（mode 'add'）：文章にキーワードを含むとき、選んだタグを付ける（例：生殖）。
//    ・「付けない」（mode 'exclude'）：既定のキーワードでは、そのタグを付けない（他のキーワードでは付く）。
//  5「ルール見直し候補」：カードの手直しの記録（editLog）から、よく外されるタグのキーワード・
//    よく手で追加されるタグ・S/Oの手直しを集計する。

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const tags = (app, text) => Array.from(app.detectMultipleHendersonTags(text)).sort((a, b) => a - b);

test('「付ける」ルール：14項目に入らない情報（生殖）に、登録したタグが付く', () => {
  const app = loadApp();
  const text = '生殖: 特に問題なし(出産歴2回、閉経50歳)';
  assert.deepEqual(tags(app, text), [], '登録前はタグ未設定');
  app.setCustomTagRulesForTest([{ keyword: '生殖', mode: 'add', hendersonIds: [8] }]);
  assert.deepEqual(tags(app, text), [8]);
  assert.deepEqual(tags(app, '食事摂取量8割'), [2], 'キーワードを含まない文章には影響しない');
});

test('「付けない」ルール：そのキーワードでは付かなくなるが、他のキーワードで付く場合は付く', () => {
  const app = loadApp();
  const need = app.HENDERSON_NEEDS.find(n => n.id === 1);
  assert.ok(need.keywords.includes('発熱'), '前提：「発熱」は1.呼吸の既定のキーワード');
  assert.ok(tags(app, '発熱あり').includes(1));
  app.setCustomTagRulesForTest([{ keyword: '発熱', mode: 'exclude', hendersonIds: [1] }]);
  assert.ok(!tags(app, '発熱あり').includes(1), '「発熱」だけでは1.呼吸が付かない');
  assert.ok(tags(app, '発熱あり、SpO2 95%').includes(1), '「SpO2」があれば1.呼吸は付く');
});

test('ルールの中身の検査：空のキーワード・範囲外のタグ番号は捨て、全角は半角にそろえる', () => {
  const app = loadApp();
  const out = Array.from(app.normalizeCustomTagRules([
    { keyword: ' ＳｐＯ２ ', mode: 'add', hendersonIds: [1, '1', 20] },
    { keyword: '', hendersonIds: [3] },
    { keyword: 'x', hendersonIds: [] },
    { keyword: '枕', mode: 'unknown', hendersonIds: [4] }
  ]));
  assert.equal(out.length, 2);
  assert.equal(out[0].keyword, 'SpO2');
  assert.deepEqual(Array.from(out[0].hendersonIds), [1]);
  assert.equal(out[1].mode, 'add', '不明なmodeは「付ける」扱い');
  assert.equal(app.isBuiltInKeywordOf(1, '発熱'), true);
  assert.equal(app.isBuiltInKeywordOf(1, '生殖'), false);
});

test('ルール見直し候補：外されたタグはキーワードごと、手で追加したタグ・S/Oの手直しも数える', () => {
  const app = loadApp();
  const item = (text, hendersonIds, type, editLog) => ({ text, hendersonIds, type, editLog });
  const patients = [
    { items: [
      item('体位変換時に発熱あり', [4], 'o', [{ kind: 'tagRemove', hId: 1 }, { kind: 'tagAdd', hId: 4 }]),
      item('発熱なく経過', [7], 'o', [{ kind: 'tagRemove', hId: 1 }, { kind: 'tagAdd', hId: 7 }]),
      item('手で付けて外し直した', [], 'o', [{ kind: 'tagAdd', hId: 9 }, { kind: 'tagRemove', hId: 9 }]),
      item('「痛い」', [10], 's', [{ kind: 'type', from: 'o', to: 's' }])
    ] },
    { items: [ item('編集なし', [1], 'o', undefined) ] }
  ];
  const c = app.computeRuleReviewCandidates(patients);
  const fever = c.removedKeywords.find(r => r.hendersonId === 1 && r.keyword === '発熱');
  assert.ok(fever, '「発熱」で付いた1.呼吸が外された');
  assert.equal(fever.count, 2);
  assert.deepEqual({ ...fever.movedTo }, { 4: 1, 7: 1 }, '付け直し先も数える');
  assert.deepEqual(Array.from(c.addedTags.map(r => [r.hendersonId, r.count])).sort(), [[4, 1], [7, 1]], '付けて外し直したタグ9は数えない');
  assert.equal(c.typeChanges.length, 1);
  assert.equal(c.typeChanges[0].from, 'o');
  assert.equal(c.typeChanges[0].to, 's');
  const report = app.buildRuleReviewReportText(c, '2026/9/28');
  assert.match(report, /キーワード「発熱」：2回外された → 付け直し先: /);
  assert.match(report, /Oデータ → Sデータ：1回/);
});
