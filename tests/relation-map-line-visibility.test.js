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
    assert.match(svg, /class="rm-bridge-clearance"[^>]+fill="none" stroke="black" stroke-width="3.2"/);
    assert.match(svg, new RegExp(`data-link-id="vertical">[\\s\\S]*?<path class="rm-link-line" mask="url\\(#rm-cross-mask-[0-9]+-${index}\\)"`));
    assert.doesNotMatch(svg.match(/data-link-id="horizontal">[\s\S]*?<\/g>/)[0], / mask=/);
    assert.equal((svg.match(/class="rm-link-hit"/g) || []).length, interactive ? 2 : 0);
    assert.equal(JSON.stringify(map), before);
  }
});
test('All relation types use uniform strokes and unclipped terminal markers in exports', () => {
  const svg = app.relationMapSvg(crossing());
  assert.match(svg, /stroke="#2563EB" stroke-width="1.5"[^>]*marker-end="url\(#rm-marker-\d+-arrow-blue\)"/);
  assert.match(svg, /id="rm-marker-\d+-arrow-blue"[^>]*overflow="visible"/);
  assert.match(svg, /id="rm-marker-\d+-arrow-treat-sel"[^>]*overflow="visible"/);
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
      assert.ok(Math.abs(Number(m[2]) * zoom - 8) < 0.001);
    }
    assert.equal((svg.match(/class="rm-link-hit"/g) || []).length, interactive ? 2 : 0);
  }
  assert.doesNotMatch(app.relationMapSvg(crossing()), /non-scaling-stroke/);
});

// Small fit zoom must not turn local crossing clearance into a broad eraser.
test('crossing clearance stays inside a six-unit bridge at all zoom levels', () => {
  for (const zoom of [.25, .55, 1, 2]) {
    const svg = app.relationMapSvg(crossing(), {interactive:true, zoom});
    assert.match(svg, /mask-type:luminance/);
    assert.doesNotMatch(svg, /<circle/);
    const m = svg.match(/class="rm-bridge-clearance"[^>]+stroke-width="([^"]+)"/);
    assert.ok(m && Math.abs(Number(m[1])*zoom-3.2)<.001);
    assert.match(svg, /class="rm-marker-arrow-blue"[^>]+><path d="M0,1.5 L10,5 L0,8.5 z"/);
  }
});
test('off-center treatment endpoints lie on the actual ellipse outline', () => {
  const map = {nodes:[
    {id:'t',type:'treatment',label:'治療',x:500,y:100},
    {id:'d',type:'disease',label:'疾患',x:0,y:220}
  ],edges:[{id:'e',source:'t',target:'d',relation:'treats'}]};
  const r = app.rmRouteEdges(map).routes[0], n = app.rmRect(map.nodes[0]);
  const [x,y] = r.pts[0];
  assert.ok(Math.abs(((x-n.cx)/(n.w/2))**2+((y-n.cy)/(n.h/2))**2-1) < .001);
});

test('close crossings use one hop without backtracking in either direction', () => {
  for (const right of [true,false]) {
    const [a,b] = right ? [0,100] : [100,0];
    const r = {pts:[[a,30],[b,30]],segs:[{x1:a,y1:30,x2:b,y2:30,cross:right?[40,46,51]:[51,46,40]}]};
    const d = app.rmRoutePath(r);
    assert.equal((d.match(/ Q/g)||[]).length,2);
    assert.doesNotMatch(d,/ A/);
    const xs=[...d.matchAll(/[MLQ](-?[\d.]+),/g)].map(m=>Number(m[1]));
    assert.ok(xs.every((x,i)=>!i||(right?x>=xs[i-1]:x<=xs[i-1])),d);
  }
});
