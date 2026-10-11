'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
function crossing() {
  return { version: 2, nodes: [
    { id: 'a', type: 'pathophysiology', label: 'A', x: 0, y: 100 },
    { id: 'b', type: 'pathophysiology', label: 'B', x: 500, y: 100 },
    { id: 'c', type: 'pathophysiology', label: 'C', x: 250, y: 0 },
    { id: 'd', type: 'pathophysiology', label: 'D', x: 250, y: 300 }
  ], edges: [
    { id: 'horizontal', source: 'a', target: 'b', relation: 'treats' },
    { id: 'vertical', source: 'c', target: 'd', relation: 'causes' }
  ] };
}
test('Bridge clearance masks only the underlying stroke in either paint order', () => {
  for (const reverse of [false, true]) for (const interactive of [false, true]) {
    const map = crossing();
    if (reverse) map.edges.reverse();
    const before = JSON.stringify(map);
    const svg = app.relationMapSvg(map, { interactive });
    const index = reverse ? 0 : 1;
    assert.match(svg, new RegExp(`id="rm-cross-mask-[0-9]+-${index}"`));
    assert.match(svg, /<circle cx="[\d.]+" cy="[\d.]+" r="4" fill="black"\/>/);
    assert.match(svg, new RegExp(`data-link-id="vertical">[\\s\\S]*?<path class="rm-link-line" mask="url\\(#rm-cross-mask-[0-9]+-${index}\\)"`));
    assert.doesNotMatch(svg.match(/data-link-id="horizontal">[\s\S]*?<\/g>/)[0], / mask=/);
    assert.equal((svg.match(/class="rm-link-hit"/g) || []).length, interactive ? 2 : 0);
    assert.equal(JSON.stringify(map), before);
  }
});
test('Treatment lines have stronger strokes and unclipped terminal markers in exports', () => {
  const svg = app.relationMapSvg(crossing());
  assert.match(svg, /stroke="#2563EB" stroke-width="3"[^>]*marker-end="url\(#rm-marker-\d+-tee-blue\)"/);
  assert.match(svg, /id="rm-marker-\d+-tee-blue"[^>]*overflow="visible"/);
  assert.match(svg, /id="rm-marker-\d+-tee-sel"[^>]*overflow="visible"/);
});

test('Separate SVG renders never reuse crossing mask identifiers', () => {
  const first = app.relationMapSvg(crossing());
  const second = app.relationMapSvg(crossing());
  const id = first.match(/<mask id="([^"]+)"/)[1];
  assert.ok(!second.includes(`id="${id}"`));
});

test('Markers belong to one SVG and all endpoint references resolve locally', () => {
  const first = app.relationMapSvg(crossing(), { interactive: true });
  const second = app.relationMapSvg(crossing(), { interactive: true });
  const ids = [...first.matchAll(/<marker id="([^"]+)"/g)].map(m => m[1]);
  assert.equal(ids.length, 5);
  ids.forEach(id => assert.ok(!second.includes(`id="${id}"`)));
  for (const m of first.matchAll(/marker-end="url\(#([^)]*)\)"/g)) assert.ok(ids.includes(m[1]));
});

test('Screen arrows keep readable stroke and endpoint sizes at fit zoom, including focus view', () => {
  for (const zoom of [0.25, 0.55, 1, 2]) for (const interactive of [false, true]) {
    const svg = app.relationMapSvg(crossing(), { interactive, screen: true, zoom });
    assert.equal((svg.match(/vector-effect="non-scaling-stroke"/g) || []).length, 2);
    for (const m of svg.matchAll(/class="rm-marker-([^"]+)"[^>]*markerWidth="([^"]+)"/g)) {
      assert.ok(Math.abs(Number(m[2]) * zoom - (m[1].startsWith('tee') ? 14 : 12)) < 0.001);
    }
    assert.equal((svg.match(/class="rm-link-hit"/g) || []).length, interactive ? 2 : 0);
  }
  assert.doesNotMatch(app.relationMapSvg(crossing()), /non-scaling-stroke/);
});
