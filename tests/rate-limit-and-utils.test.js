'use strict';
// スパム・大量送信への防御（rateLimit・capString）と、日付しきい値判定(isOlderThanThresholdDays)の検証。
const test = require('node:test');
const assert = require('node:assert/strict');
const { setupIsolatedDataDir } = require('./helpers');

setupIsolatedDataDir();
const { rateLimit, capString, isOlderThanThresholdDays, pickTopVote, capArrayByByteSize } = require('../server.js');

function makeReqRes(ip) {
  const req = { ip };
  const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(obj) { this.body = obj; } };
  return { req, res };
}

test('rateLimit: 上限件数までは通過し、それを超えると429で拒否される', () => {
  const mw = rateLimit('test-bucket-a', { windowMs: 60000, max: 3 });
  let passed = 0;
  for (let i = 0; i < 5; i++) {
    const { req, res } = makeReqRes('1.2.3.4');
    mw(req, res, () => { passed++; });
  }
  assert.equal(passed, 3, '上限3件までは通過する');
  const { req, res } = makeReqRes('1.2.3.4');
  let called = false;
  mw(req, res, () => { called = true; });
  assert.equal(called, false, '4件目以降はnext()が呼ばれず拒否される');
  assert.equal(res.statusCode, 429, '拒否時は429を返す');
});

test('rateLimit: IPアドレスが違えば別バケットとして扱われる', () => {
  const mw = rateLimit('test-bucket-b', { windowMs: 60000, max: 1 });
  const a1 = makeReqRes('9.9.9.9'); let aPassed = 0;
  mw(a1.req, a1.res, () => aPassed++);
  const a2 = makeReqRes('9.9.9.9'); let aPassed2 = 0;
  mw(a2.req, a2.res, () => aPassed2++);
  const b1 = makeReqRes('8.8.8.8'); let bPassed = 0;
  mw(b1.req, b1.res, () => bPassed++);
  assert.equal(aPassed, 1, 'IP 9.9.9.9: 1件目は通過する');
  assert.equal(aPassed2, 0, 'IP 9.9.9.9: 上限超えの2件目は拒否される');
  assert.equal(bPassed, 1, '別IPの8.8.8.8は独立してカウントされ1件目は通過する');
});

test('capString: 上限を超える文字列は切り詰められ、それ以外はそのまま通る', () => {
  assert.equal(capString('あ'.repeat(10), 5), 'あああああ', '上限を超える分は切り詰められる');
  assert.equal(capString('短い文字列', 100), '短い文字列', '上限未満の文字列はそのまま');
  assert.equal(capString(null, 5), null, '文字列以外はそのまま通す');
  assert.equal(capString(undefined, 5), undefined, 'undefinedもそのまま通す');
});

test('isOlderThanThresholdDays: 日数しきい値の境界を正しく判定する', () => {
  const now = new Date('2026-09-14T00:00:00.000Z');
  const daysAgo = d => new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString();
  const realNow = Date.now;
  Date.now = () => now.getTime();
  try {
    assert.equal(isOlderThanThresholdDays(daysAgo(100), 90), true, '90日を超えていれば古いと判定される');
    assert.equal(isOlderThanThresholdDays(daysAgo(90), 90), false, 'ちょうど90日は「超えていない」ので古いと判定されない');
    assert.equal(isOlderThanThresholdDays(daysAgo(10), 90), false, '90日未満なら古いと判定されない');
    assert.equal(isOlderThanThresholdDays(null, 90), false, '日時が無い場合は古いと判定しない');
    assert.equal(isOlderThanThresholdDays('invalid-date', 90), false, '不正な日時文字列は古いと判定しない');
  } finally {
    Date.now = realNow;
  }
});

test('pickTopVote: 最多得票を選び、同数の場合は先に記録された方を優先する', () => {
  assert.equal(pickTopVote({ s: 2, o: 1 }), 's', '票が多い方を選ぶ');
  assert.equal(pickTopVote({ s: 1, o: 1 }), 's', '同数の場合は先に記録された方（Object.entriesの挿入順）を優先する');
  assert.equal(pickTopVote({}), null, '票が無ければnullを返す');
  assert.equal(pickTopVote(null), null, '未定義でもnullを返す');
});

// カルテスナップショット等の「積み上げる配列」がMongoDBの1ドキュメント上限（16MB）に
// 達して以後の保存が静かに失敗し続ける、という不具合（利用者からの報告：
// 「カルテスナップショットに全然保存されていません」）を防ぐための間引きロジックの検証。
test('capArrayByByteSize: 合計バイト数が上限以下ならそのまま、上限を超えたら古い方から間引く', () => {
  const arr = [
    { id: 'a', text: 'x'.repeat(100) },
    { id: 'b', text: 'x'.repeat(100) },
    { id: 'c', text: 'x'.repeat(100) },
    { id: 'd', text: 'x'.repeat(100) }
  ];
  const untouched = capArrayByByteSize(arr, 10_000);
  assert.equal(untouched, arr, '上限以下なら元の配列をそのまま返す（新しい配列を作らない）');

  const eachSize = Buffer.byteLength(JSON.stringify(arr[0]), 'utf8');
  const capped = capArrayByByteSize(arr, eachSize * 2 + 1);
  assert.deepEqual(capped.map(e => e.id), ['c', 'd'], '古い（先頭の）ものから間引かれ、新しいものが残る');

  // 1件だけでも上限を超える場合は、最新の1件だけは残す（全滅させない）
  const oversizedLast = capArrayByByteSize(arr, 1);
  assert.deepEqual(oversizedLast.map(e => e.id), ['d'], '上限が極端に小さくても最低限最新の1件は残す');

  assert.deepEqual(capArrayByByteSize([], 100), [], '空配列はそのまま空配列');
  assert.equal(capArrayByByteSize(null, 100), null, '配列以外はそのまま通す');
});
