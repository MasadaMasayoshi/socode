const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();
const SRC = [
  '●患者:Bさん（10歳、男児）',
  '●家族歴・家族構成：両親（父親38歳、母親36歳）、父方の祖父母（祖父66歳、祖母63歳）、兄（13歳）の6人暮らし。母方の祖父母は健在であるが、遠方のため年に数回会う程度。',
  '●生活の様子：幼いころから主として祖母が、弟の世話をしている。'
].join('\n');
const build = s => app.ggBuild({ sourceText: s, items: [] });
const hit = (a, b) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
const segBox = s => ({ x1: Math.min(s.x1, s.x2) - 1, x2: Math.max(s.x1, s.x2) + 1, y1: Math.min(s.y1, s.y2) - 1, y2: Math.max(s.y1, s.y2) + 1 });

test('geometry: no label overlaps a line or another label; symbols do not overlap labels', () => {
  [SRC, '妻と長男（28歳）、長女と同居。父は糖尿病で死亡、母は高血圧。兄と妹がいる。', '体温36.5度。'].forEach(src => {
    const geo = app.ggGeometry(build(src));
    const labels = [];
    geo.people.forEach(v => v.boxes.forEach(b => labels.push(b)));
    labels.forEach((l, i) => {
      geo.segs.forEach(sg => assert.ok(!hit(l, segBox(sg)), `label/line ${JSON.stringify(l)} ${JSON.stringify(sg)}`));
      labels.forEach((m, j) => { if (i < j) assert.ok(!hit(l, m), `label/label ${i} ${j}`); });
    });
    const syms = Array.from(geo.people.values()).map(v => v.sym);
    syms.forEach((s0, i) => syms.forEach((s1, j) => { if (i < j) assert.ok(!hit(s0, s1)); }));
  });
});

test('geometry: household outline holds every 同居 member fully and no non-member', () => {
  const geo = app.ggGeometry(build(SRC));
  const rects = geo.outline.flatMap(rs => rs.map(rc => ({ x1: rc.x1, x2: rc.x2, y1: rc.t, y2: rc.b })));
  assert.ok(rects.length >= 2);
  const inside = (b, rc) => b.x1 >= rc.x1 && b.x2 <= rc.x2 && b.y1 >= rc.y1 && b.y2 <= rc.y2;
  const members = new Set(geo.hh.map(p => p.id));
  assert.strictEqual(members.size, 6);
  geo.people.forEach((v, id) => {
    const bb = v.bbox;
    if (members.has(id)) assert.ok(rects.some(rc => inside(bb, rc)), `member outside: ${id}`);
    else assert.ok(!rects.some(rc => hit(bb, rc)), `non-member touched by box: ${id}`);
  });
});

test('layout: each side of the grandparents sits above its own parent; paternal left of maternal; descent lines do not cross', () => {
  const g = build(SRC), L = app.ggLayout(g), P = id => L.pos.get(id);
  const mid = (a, b) => (P(a).x + P(b).x) / 2;
  assert.strictEqual(mid('gfatherP', 'gmotherP'), P('father').x);
  assert.strictEqual(mid('gfatherM', 'gmotherM'), P('mother').x);
  assert.ok(P('gmotherP').x < P('gfatherM').x);
  assert.ok(P('gfatherP').y === P('father').y - 206 && P('father').y < P('index').y);
  const geo = app.ggGeometry(g);
  const vs = geo.segs.filter(s => s.x1 === s.x2), hs = geo.segs.filter(s => s.y1 === s.y2);
  vs.forEach(v => hs.forEach(h => {
    const x = v.x1, y = h.y1, inV = y > Math.min(v.y1, v.y2) + 0.5 && y < Math.max(v.y1, v.y2) - 0.5, inH = x > Math.min(h.x1, h.x2) + 0.5 && x < Math.max(h.x1, h.x2) - 0.5;
    assert.ok(!(inV && inH), `crossing at ${x},${y}`);
  }));
});

test('svg: responsive viewBox without fixed size in the editor, fixed size for export, note under the label in a readable colour, trimmed canvas', () => {
  const g = build(SRC);
  const live = app.genogramSvg(g, { interactive: true });
  const fixed = app.genogramSvg(g, {});
  const tag = x => /^<svg[^>]*>/.exec(x)[0];
  assert.ok(/viewBox="-?\d+ -?\d+ \d+ \d+"/.test(live) && !/ width="\d+" height="\d+"/.test(tag(live)));
  assert.ok(/ width="\d+" height="\d+"/.test(tag(fixed)));
  assert.ok(live.includes('#7a3b1d') && !live.includes('#B5452F'));
  const vb = /viewBox="(-?\d+) (-?\d+) (\d+) (\d+)"/.exec(fixed), geo = app.ggGeometry(g);
  assert.ok(Number(vb[3]) <= geo.bounds.x1 - geo.bounds.x0 + 60 && Number(vb[4]) <= geo.bounds.y1 - geo.bounds.y0 + 60);
  assert.ok(/data-gg-id="index"/.test(live));
  assert.ok(/<span>介＝世話・介護の担い手<\/span>/.test(app.genogramLegendHtml()));
});
