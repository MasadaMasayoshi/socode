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
  assert.match(svg, /stroke="#2563EB" stroke-width="2.2"[^>]*marker-end="url\(#rm-tee-blue\)"/);
  assert.match(svg, /id="rm-tee-blue"[^>]*overflow="visible"/);
  assert.match(svg, /id="rm-tee-sel"[^>]*overflow="visible"/);
});

test('Separate SVG renders never reuse crossing mask identifiers', () => {
  const first = app.relationMapSvg(crossing());
  const second = app.relationMapSvg(crossing());
  const id = first.match(/<mask id="([^"]+)"/)[1];
  assert.ok(!second.includes(`id="${id}"`));
});
