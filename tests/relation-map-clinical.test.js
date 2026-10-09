'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const plain = x => JSON.parse(JSON.stringify(x));
const node = (id, type, extra = {}) => ({ id, type, label: id, x: 42, y: 51, itemIds: [], observed: true, source: 'record', ...extra });

test('新しい臨床情報・時刻・薬剤状態・手動座標がJSONの再読込で保持される', () => {
  const map = { version: 2, patientId: 'p1', nodes: [node('v', 'vital', { observation: { name: 'SpO2', value: 91, unit: '%' }, effectiveTime: '入院1日目 9:00', itemIds: ['c1'] }), node('m', 'medication', { medication: { name: '薬剤A', eventType: 'order' }, epistemicStatus: 'planned' }), node('a', 'assessment', { epistemicStatus: 'assessed', certainty: 'probable', sourceRefs: [{ sourceType: 'card', sourceId: 'c1', patientId: 'p1' }] })], edges: [{ id: 'e', source: 'v', target: 'a', relation: 'supports', certainty: 'confirmed', origin: 'manual' }] };
  const normalized = app.normalizeRelationMap(map);
  const restored = app.normalizeRelationMap(plain(normalized));
  assert.deepEqual(plain(restored), plain(normalized));
  assert.equal(restored.nodes[0].observation.value, 91);
  assert.equal(restored.nodes[0].effectiveTime, '入院1日目 9:00');
  assert.equal(restored.nodes[0].x, 42);
  assert.equal(restored.nodes[1].medication.eventType, 'order');
  assert.equal(restored.nodes[2].sourceRefs[0].sourceId, 'c1');
});

test('補足や未来リスクは事実に変換されず、未知のスキーマは読み込まれない', () => {
  const m = app.normalizeRelationMap({ version: 2, nodes: [node('i', 'pathophysiology', { source: 'knowledge', epistemicStatus: 'observed' }), node('r', 'future_risk', { epistemicStatus: 'observed' })], edges: [] });
  assert.equal(m.nodes[0].epistemicStatus, 'inferred');
  assert.equal(m.nodes[1].epistemicStatus, 'predicted');
  assert.equal(app.normalizeRelationMap({ version: 2, schemaVersion: '99.0.0', nodes: [] }), null);
  assert.match(app.relationMapSvg(m), /推論/);
});

test('循環のある根拠探索は終了し、反証・別患者・削除済みカードを根拠へ取り込まない', () => {
  const refs = (sourceId, patientId = 'p1') => [{ sourceType: 'card', sourceId, patientId }];
  const map = { version: 2, patientId: 'p1', nodes: [node('v', 'vital', { sourceRefs: refs('c1') }), node('a', 'assessment'), node('p', 'nursing_problem'), node('bad', 'lab', { sourceRefs: refs('c2') }), node('other', 'lab', { sourceRefs: refs('c3', 'p2') }), node('gone', 'symptom', { sourceRefs: refs('deleted') })], edges: [{ source: 'v', target: 'a', relation: 'supports' }, { source: 'a', target: 'p', relation: 'interpreted_as' }, { source: 'p', target: 'a', relation: 'contributes_to' }, { source: 'bad', target: 'p', relation: 'contradicts' }, { source: 'other', target: 'p', relation: 'supports' }, { source: 'gone', target: 'p', relation: 'supports' }] };
  const r = app.findRelationEvidence(map, 'p', { id: 'p1', items: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }] });
  assert.deepEqual(plain(r.sourceRefs), refs('c1'));
  assert.ok(!r.nodeIds.includes('bad'));
});

test('一覧は矢印の意味と根拠を読み上げられ、患者の文字はHTMLにならない', () => {
  const map = app.normalizeRelationMap({ version: 2, patientId: 'p1', nodes: [node('v', 'vital', { label: '<img src=x onerror=alert(1)>', itemIds: ['c1'] }), node('p', 'nursing_problem')], edges: [{ id: 'e', source: 'v', target: 'p', relation: 'supports' }] });
  app.rmPrepareClinicalMap(map, { id: 'p1' });
  const html = app.relationMapTextHtml(map, { id: 'p1', items: [{ id: 'c1' }] });
  assert.ok(!html.includes('<img'));
  assert.match(html, /&lt;img/);
  assert.match(html, /card:c1/);
  assert.match(html, /データが示す（根拠）/);
  assert.match(html, /data-rm-action="select-edge"/);
});

test('薬剤の処方・実投与を分け、アセスメントの根拠カードを保持する', () => {
  const cp = { id: 'p1', items: [{ id: 'c1', text: 'フロセミドを処方予定', type: 'o' }, { id: 'c2', text: 'フロセミドを投与した', type: 'o' }], myAssessments: { '1': { interpretation: '酸素化を確認する', evidenceIds: ['c2'] } } };
  const m = { version: 2, nodes: [], edges: [] };
  app.rmImportClinicalEntities(m, cp);
  const meds = m.nodes.filter(n => n.type === 'medication');
  assert.deepEqual(plain(meds.map(n => n.medication.eventType)), ['order', 'administered']);
  assert.equal(meds[0].epistemicStatus, 'planned');
  assert.ok(m.nodes.some(n => n.type === 'assessment' && n.itemIds.includes('c2')));
  const count = m.nodes.length;
  app.rmImportClinicalEntities(m, cp);
  assert.equal(m.nodes.length, count);
});
