'use strict';
// 同時編集時のカード単位マージ（mergePatientRecord、server.js）の検証。
// 「2つの端末がほぼ同時に同じ患者カルテを保存すると、片方が知らない新しいカードが
// 消えてしまう」という不具合の修正が正しく動くことを、本物のserver.jsの関数を使って確認する。
const test = require('node:test');
const assert = require('node:assert/strict');
const { setupIsolatedDataDir } = require('./helpers');

setupIsolatedDataDir(); // server.js をrequireする前に、本番のdata/フォルダと分離しておく
const { mergePatientRecord } = require('../server.js');

const NOW = new Date('2026-09-14T12:00:00.000Z').getTime();
const at = (offsetMin) => new Date(NOW + offsetMin * 60000).toISOString();

test('同時編集: 他端末が追加した新しいカードは、古いスナップショットでの保存で消えない', () => {
  const existingOnServer = {
    id: 'p1', title: '患者A', updatedAt: at(10),
    items: [
      { id: 'itemY', text: 'Yの内容', type: 'o', _touchedAt: at(0) },
      { id: 'itemX', text: 'Xの内容（Aが追加）', type: 's', _touchedAt: at(10) },
    ],
    deletedItemIds: []
  };
  // 端末Bは、AがitemXを追加したことを知らない古いスナップショットのまま、itemYだけを編集して保存する
  const staleFromB = {
    id: 'p1', title: '患者A', updatedAt: at(15),
    items: [
      { id: 'itemY', text: 'Yの内容（Bが編集）', type: 's', _touchedAt: at(15) },
    ],
    deletedItemIds: []
  };
  const merged = mergePatientRecord(staleFromB, existingOnServer, NOW);
  const ids = merged.items.map(i => i.id).sort();
  assert.deepEqual(ids, ['itemX', 'itemY'], '他端末が追加したitemXは消えずに残る');
  assert.equal(merged.items.find(i => i.id === 'itemY').text, 'Yの内容（Bが編集）', 'Bが実際に編集した内容は反映される');
  assert.equal(merged.items.find(i => i.id === 'itemX').text, 'Xの内容（Aが追加）', 'itemXの内容はAが追加したまま変わらない');
});

test('削除: カードを削除すると結果から取り除かれ、削除の記録(tombstone)が残る', () => {
  const existing = { id: 'p1', updatedAt: at(10), items: [{ id: 'itemZ', text: 'Zの内容', _touchedAt: at(0) }], deletedItemIds: [] };
  const afterDelete = { id: 'p1', updatedAt: at(11), items: [], deletedItemIds: [{ id: 'itemZ', at: at(11) }] };
  const merged = mergePatientRecord(afterDelete, existing, NOW);
  assert.deepEqual(merged.items.map(i => i.id), [], '削除したカードは結果に含まれない');
  assert.deepEqual(merged.deletedItemIds.map(t => t.id), ['itemZ'], '削除の記録が残る');
});

test('削除: 削除を知らない未編集の古いスナップショットを送っても、削除済みカードは復活しない', () => {
  const afterDelete = { id: 'p1', updatedAt: at(11), items: [], deletedItemIds: [{ id: 'itemZ', at: at(11) }] };
  const staleFromB = {
    id: 'p1', updatedAt: at(20), // 保存時刻自体は削除より後だが、
    items: [{ id: 'itemZ', text: 'Zの内容', _touchedAt: at(0) }], // itemZ自体は未編集（_touchedAtは削除より前のまま）
    deletedItemIds: []
  };
  const merged = mergePatientRecord(staleFromB, afterDelete, NOW);
  assert.deepEqual(merged.items.map(i => i.id), [], '未編集のまま古いスナップショットを送っても削除済みカードは復活しない');
});

test('元に戻す: 削除したカードを復元すると、tombstoneより新しい書き換え時刻により復活する', () => {
  const afterDelete = { id: 'p1', updatedAt: at(11), items: [], deletedItemIds: [{ id: 'itemZ', at: at(11) }] };
  const undoSave = {
    id: 'p1', updatedAt: at(12),
    items: [{ id: 'itemZ', text: 'Zの内容', _touchedAt: at(12) }], // 削除(at11)より新しい_touchedAt
    deletedItemIds: [] // 元に戻す操作でtombstoneも取り消す
  };
  const merged = mergePatientRecord(undoSave, afterDelete, NOW);
  assert.deepEqual(merged.items.map(i => i.id), ['itemZ'], '元に戻す操作でカードが復活する');
  assert.deepEqual(merged.deletedItemIds, [], '復活後はtombstoneが消える');
});

test('削除の記録は一定期間(3日)を超えると無効になり、際限なく蓄積しない', () => {
  const veryOldTombstoneAt = new Date(NOW - 4 * 24 * 60 * 60 * 1000).toISOString(); // 4日前
  const existing = { id: 'p1', updatedAt: at(-5000), items: [], deletedItemIds: [{ id: 'itemOld', at: veryOldTombstoneAt }] };
  const incoming = { id: 'p1', updatedAt: at(0), items: [{ id: 'itemOld', text: '古いカード' }], deletedItemIds: [] };
  const merged = mergePatientRecord(incoming, existing, NOW);
  assert.deepEqual(merged.items.map(i => i.id), ['itemOld'], '3日を超えたtombstoneは無効化される');
  assert.deepEqual(merged.deletedItemIds, [], '期限切れのtombstoneは結果から取り除かれる');
});

test('同じカードを両端末が編集した場合、カード自身の書き換え時刻(_touchedAt)が新しい方が採用される', () => {
  const existing = { id: 'p1', updatedAt: at(5), items: [{ id: 'i1', text: '先に保存された内容', _touchedAt: at(5) }], deletedItemIds: [] };
  const incoming = { id: 'p1', updatedAt: at(3), items: [{ id: 'i1', text: '実際にはこちらが新しい編集', _touchedAt: at(8) }], deletedItemIds: [] };
  // 患者データ全体のupdatedAt(at3)はexisting(at5)より古いが、カード自体の_touchedAtはincomingの方が新しい(at8)
  const merged = mergePatientRecord(incoming, existing, NOW);
  assert.equal(merged.items[0].text, '実際にはこちらが新しい編集', '全体のupdatedAtでなくカード単位の書き換え時刻で新旧を判定する');
});

test('新規患者（サーバーに何も保存が無い）はそのまま採用される', () => {
  const incoming = { id: 'p2', title: '新規患者', items: [{ id: 'i1', text: 'はじめてのカード' }], deletedItemIds: [] };
  const merged = mergePatientRecord(incoming, undefined, NOW);
  assert.deepEqual(merged, incoming, '既存データが無ければそのまま採用される');
});

test('タイトル・カルテ本文などカード以外の項目は、更新日時が新しい方がまるごと採用される', () => {
  const existing = { id: 'p1', title: '現在のタイトル', sourceText: '現在の本文', updatedAt: at(10), items: [], deletedItemIds: [] };
  const staleIncoming = { id: 'p1', title: '古いスナップショットのタイトル', sourceText: '古い本文のまま', updatedAt: at(1), items: [], deletedItemIds: [] };
  const merged = mergePatientRecord(staleIncoming, existing, NOW);
  assert.equal(merged.title, '現在のタイトル', '古い保存のタイトルでは上書きされない');
  assert.equal(merged.sourceText, '現在の本文', '古い保存の本文では上書きされない');
});
