const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();

const mkCp = () => ({
  id: 'p', title: 'T', sourceText: '', items: [], myAssessments: {}, carePlans: {}, missingChecks: {},
  relationMap: normalized()
});
function normalized() {
  const m = app.normalizeRelationMap({
    version: 2, schemaVersion: '1.0.0',
    nodes: [
      { id: 'a', type: 'symptom', label: '夜間の頻尿', x: 0, y: 0 },
      { id: 'b', type: 'pathophysiology', label: '睡眠の分断', x: 0, y: 0 },
      { id: 'c', type: 'nursing_problem', label: '睡眠パターンの乱れ', priority: 1, x: 0, y: 0 },
      { id: 'z', type: 'symptom', label: '独立した項目', x: 0, y: 0 }
    ],
    edges: [{ id: 'e1', source: 'a', target: 'b', relation: 'causes' }, { id: 'e2', source: 'b', target: 'c', relation: 'causes' }]
  });
  m.__normalized = true;
  return m;
}

test('書き出しの項目に「関連図」があり、選ぶと看護問題ごとの流れと孤立項目が出る', () => {
  assert.ok(app.EXPORT_SECTIONS.some(x => x.key === 'relation' && x.label === '関連図'));
  const cp = mkCp();
  const txt = app.buildExportPlainText(cp, app.exportSelectionFromKeys(['relation']));
  assert.match(txt, /関連図/);
  assert.match(txt, /看護問題 #1 睡眠パターンの乱れ/);
  assert.match(txt, /夜間の頻尿 → 睡眠の分断 → 睡眠パターンの乱れ/);
  assert.match(txt, /どの看護問題ともつながっていない項目/);
  assert.match(txt, /独立した項目/);
  assert.ok(!/関連図/.test(app.buildExportPlainText(cp, app.exportSelectionFromKeys(['o']))));
});

test('関連図が無いときは何も出さず、印刷用には図（SVG）が入る', () => {
  const empty = { id: 'p', title: 'T', items: [], myAssessments: {}, carePlans: {}, missingChecks: {} };
  assert.strictEqual(app.relationMapExportText(empty), '');
  assert.strictEqual(app.relationMapPrintSection(empty, 3), '');
  const html = app.relationMapPrintSection(mkCp(), 3);
  assert.match(html, /<h2>3\. 関連図<\/h2>/);
  assert.match(html, /<svg/);
});

test('重点アセスメントの拡大・スワイプ機能は外れ、ジェノグラムの拡大・移動は残る', () => {
  const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
  const focus = html.slice(html.indexOf('id="view-focus"'), html.indexOf('id="view-genogram"'));
  assert.ok(!/focusZoom|focus-zoom|fa-zoom-wrap|スワイプ/.test(focus));
  const gg = html.slice(html.indexOf('id="view-genogram"'), html.indexOf('id="view-relation"'));
  assert.match(gg, /data-gg-action="zoom-in"/);
  assert.match(gg, /data-gg-action="zoom-fit"/);
  assert.ok(!/focusZoom/.test(fs.readFileSync(__dirname + '/../js/18-focus-assessment.js', 'utf8')));
});
