'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { setupIsolatedDataDir, startEphemeralServer, baseUrl, stopServer } = require('./helpers');
setupIsolatedDataDir();
const { app } = require('../server');
let server, url;
test.before(async () => { server = await startEphemeralServer(app); url = baseUrl(server); });
test.after(async () => { await stopServer(server); });
const graph = id => ({ version: 2, schemaVersion: '1.0.0', patientId: id, nodes: [{ id: 'v', type: 'vital', label: 'SpO2 91%', epistemicStatus: 'observed', sourceRefs: [{ sourceType: 'card', sourceId: 'c1', patientId: id }], itemIds: ['c1'], observation: { name: 'SpO2', value: 91, unit: '%' } }], edges: [] });
const patient = id => ({ id, items: [{ id: 'c1', text: 'SpO2 91%', type: 'o' }], updatedAt: new Date().toISOString(), relationMap: graph(id) });
const put = (id, body) => fetch(`${url}/api/patients/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('図の同時保存は片方を412で拒否し、保存済みの根拠が再読込で残る', async () => {
  const id = 'map-race';
  const initial = await (await put(id, patient(id))).json();
  assert.equal(initial.patient.relationMapRevision, 1);
  const a = structuredClone(initial.patient), b = structuredClone(initial.patient);
  a.relationMap.nodes[0].label = 'Aの編集'; b.relationMap.nodes[0].label = 'Bの編集';
  const results = await Promise.all([put(id, a), put(id, b)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 412]);
  const res = await fetch(`${url}/api/patients/${id}/relation-map`);
  assert.equal(res.headers.get('etag'), '"relation-map-2"');
  const restored = await res.json();
  assert.equal(restored.relationMapRevision, 2);
  assert.equal(restored.relationMap.nodes[0].sourceRefs[0].sourceId, 'c1');
  assert.equal(restored.relationMap.nodes[0].observation.value, 91);
});

test('古い一括同期でも新しい図は上書きされず、図を省略したカード保存は保持する', async () => {
  const id = 'map-beacon';
  const initial = await (await put(id, patient(id))).json();
  const newer = structuredClone(initial.patient); newer.relationMap.nodes[0].label = '新しい図';
  assert.equal((await put(id, newer)).status, 200);
  const stale = structuredClone(initial.patient); stale.relationMap.nodes[0].label = '古い同期';
  const r = await fetch(`${url}/api/patients/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [id]: stale }) });
  assert.equal(r.status, 500);
  assert.deepEqual((await r.json()).failed, [id]);
  assert.equal((await put(id, { id, items: [{ id: 'c2', text: '追記' }], updatedAt: new Date().toISOString() })).status, 200);
  const latest = await (await fetch(`${url}/api/patients/${id}/relation-map`)).json();
  assert.equal(latest.relationMap.nodes[0].label, '新しい図');
  assert.equal(latest.relationMapRevision, 2);
});

test('別患者の図・根拠・未来の形式・切れた矢印を保存しない', async () => {
  for (const mutate of [p => { p.relationMap.patientId = 'other'; }, p => { p.relationMap.nodes[0].sourceRefs[0].patientId = 'other'; }, p => { p.relationMap.schemaVersion = '99.0.0'; }, p => { p.relationMap.edges.push({ id: 'e', source: 'v', target: 'missing' }); }]) {
    const p = patient('invalid'); mutate(p);
    assert.equal((await put(p.id, p)).status, 422);
  }
});

test('事例置換で古い図を消し、古い端末から復活させない', async () => {
  const id = 'map-reset';
  const initial = await (await put(id, patient(id))).json();
  const reset = { ...initial.patient, caseResetAt: new Date().toISOString(), items: [], updatedAt: new Date().toISOString() };
  delete reset.relationMap;
  const result = await put(id, reset);
  assert.equal(result.status, 200);
  assert.equal((await result.json()).patient.relationMap, null);
  assert.equal((await put(id, initial.patient)).status, 412);
});
