'use strict';

//

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const app = loadApp();
const { mergePatientRecordClient } = app;

function baseItem(id, text, touchedAt) {
  return { id, text, _touchedAt: touchedAt };
}

test('サーバー側のupdatedAtが新しくても、このブラウザだけが持つカードは消えない', () => {
  const local = {
    id: 'p1', title: 'A氏', updatedAt: '2026-09-10T00:00:00.000Z',
    items: [baseItem('local-only', '新しく追加したカード', '2026-09-10T00:00:00.000Z')],
    deletedItemIds: []
  };
  const server = {
    id: 'p1', title: 'A氏', updatedAt: '2026-09-15T00:00:00.000Z',
    items: [],
    deletedItemIds: []
  };
  const merged = mergePatientRecordClient(local, server);
  assert.ok(merged.items.some(i => i.id === 'local-only'), 'サーバーのupdatedAtが新しくても、ローカルだけが知る新規カードは残る');
});

test('サーバー側だけが持つカード（他端末で追加）はローカルにも取り込まれる', () => {
  const local = { id: 'p1', updatedAt: '2026-09-10T00:00:00.000Z', items: [], deletedItemIds: [] };
  const server = {
    id: 'p1', updatedAt: '2026-09-10T00:00:00.000Z',
    items: [baseItem('server-only', '他端末で追加されたカード', '2026-09-10T00:00:00.000Z')],
    deletedItemIds: []
  };
  const merged = mergePatientRecordClient(local, server);
  assert.ok(merged.items.some(i => i.id === 'server-only'), '他端末（サーバー）だけが持つカードも取り込まれる');
});

test('このブラウザで削除した（tombstoneを持つ）カードは、サーバーにまだ残っていても復活しない', () => {

  const now = Date.now();
  const hoursAgo = h => new Date(now - h * 60 * 60 * 1000).toISOString();
  const local = {
    id: 'p1', updatedAt: hoursAgo(1), items: [],
    deletedItemIds: [{ id: 'deleted-1', at: hoursAgo(1) }]
  };
  const server = {
    id: 'p1', updatedAt: hoursAgo(2),
    items: [baseItem('deleted-1', '削除したはずのカード', hoursAgo(2))],
    deletedItemIds: []
  };
  const merged = mergePatientRecordClient(local, server, now);
  assert.ok(!merged.items.some(i => i.id === 'deleted-1'), '削除記録（tombstone）より古いカードは復活しない');
});

test('削除より後にカードが書き換えられていた場合（元に戻す等）は、削除記録より優先して復活する', () => {
  const now = Date.now();
  const hoursAgo = h => new Date(now - h * 60 * 60 * 1000).toISOString();
  const local = {
    id: 'p1', updatedAt: hoursAgo(2), items: [],
    deletedItemIds: [{ id: 'restored-1', at: hoursAgo(2) }]
  };
  const server = {
    id: 'p1', updatedAt: hoursAgo(1),
    items: [baseItem('restored-1', '削除後に他端末で復元・編集されたカード', hoursAgo(1))],
    deletedItemIds: []
  };
  const merged = mergePatientRecordClient(local, server, now);
  assert.ok(merged.items.some(i => i.id === 'restored-1'), '削除記録より後に書き換えられたカードは復活する');
});

test('同じカードが両方にある場合、_touchedAtが新しい方の内容が採用される', () => {
  const local = {
    id: 'p1', updatedAt: '2026-09-10T00:00:00.000Z',
    items: [baseItem('shared-1', 'ローカルで編集した内容', '2026-09-12T00:00:00.000Z')],
    deletedItemIds: []
  };
  const server = {
    id: 'p1', updatedAt: '2026-09-11T00:00:00.000Z',
    items: [baseItem('shared-1', '他端末での古い内容', '2026-09-09T00:00:00.000Z')],
    deletedItemIds: []
  };
  const merged = mergePatientRecordClient(local, server);
  const card = merged.items.find(i => i.id === 'shared-1');
  assert.equal(card.text, 'ローカルで編集した内容', '_touchedAtが新しい方（ローカル）の内容が採用される');
});
