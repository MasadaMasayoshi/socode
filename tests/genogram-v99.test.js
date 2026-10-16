const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();
const cpOf = (src, extra) => Object.assign({ id: 'p', title: 'T', sourceText: src, items: [], myAssessments: {}, carePlans: {}, missingChecks: {} }, extra || {});
const ps = src => Array.from(app.ggBuild(cpOf(src)).persons);
const by = (list, id) => list.find(p => p.id === id);

test('extraction: spouse, children (with counts), parents, siblings, sex from the kinship word', () => {
  const l = ps('58歳男性。妻（55歳・会社員）と長男（28歳）、長女と同居。父は糖尿病で死亡、母は高血圧。兄と妹がいる。');
  assert.strictEqual(by(l, 'index').sex, 'm'); assert.strictEqual(by(l, 'index').age, 58);
  const w = by(l, 'wife'); assert.strictEqual(w.sex, 'f'); assert.strictEqual(w.age, 55); assert.strictEqual(w.occupation, '会社員'); assert.strictEqual(w.partner, 'index');
  assert.strictEqual(by(l, 'son1').age, 28); assert.strictEqual(by(l, 'son1').occupation, ''); // the wife's job does not leak to the son
  assert.deepStrictEqual(Array.from(by(l, 'son1').parents), ['index', 'wife']);
  assert.strictEqual(by(l, 'daughter1').sex, 'f');
  assert.ok(by(l, 'brotherO') && by(l, 'sisterY'));
  const c = ps('家族構成：妻と子ども2人と同居。');
  assert.strictEqual(c.filter(p => /^child#/.test(p.id)).length, 2);
  assert.ok(c.filter(p => /^child#/.test(p.id)).every(p => p.age === null && p.sex === 'u'));
});

test('extraction: deceased, living together, family-history disease, key person, quality, divorce', () => {
  const l = ps('父は10年前に心筋梗塞で死亡、母は健在。長男夫婦と同居、キーパーソンは長男の妻。弟とは疎遠。前妻とは離婚。');
  assert.strictEqual(by(l, 'father').deceased, true); assert.ok(by(l, 'father').notes.includes('心筋梗塞'));
  assert.strictEqual(by(l, 'mother').deceased, false);
  assert.strictEqual(by(l, 'son1').living, '同居');
  const dil = by(l, '長男の妻'); assert.ok(dil && dil.keyPerson && dil.partner === 'son1');
  assert.ok(!by(l, 'son1').keyPerson);
  assert.strictEqual(by(l, 'brotherY').quality, 'distant');
});

test('extraction: negations, no invention, ordinary words are not kin', () => {
  assert.strictEqual(ps('子どもはいない。兄弟なし。').length, 0);
  assert.strictEqual(ps('体温37.2℃。母乳は良好。工夫して食事した。丈夫な体。').length, 0);
  assert.strictEqual(ps('体温37.2℃。血圧130/80。').length, 0);
  const g = app.ggBuild(cpOf('体温37.2℃。'));
  assert.ok(g.notice && Array.from(g.persons).length === 0);
  const l = ps('妻と二人暮らし。子どもはいない。');
  assert.ok(by(l, 'wife') && !l.some(p => /^child/.test(p.id)));
});

test('extraction: a bare "family" mention becomes one generic family node; family-voice quote still yields the spouse; 母親の介護 stays a note', () => {
  const f = ps('家族が毎日面会に来ている。キーパーソンは家族。').filter(p => !p.index);
  assert.strictEqual(f.length, 1); assert.strictEqual(f[0].role, '家族');
  const q = ps('妻「本人は甘いものをやめられない」');
  assert.ok(by(q, 'wife'));
  const c = ps('母親の介護をしている。');
  const m = by(c, 'mother'); assert.ok(m); assert.strictEqual(m.caregiver, false); assert.ok(m.notes.some(n => /介護/.test(n)));
  assert.strictEqual(by(ps('妻が主に介護している。'), 'wife').caregiver, true);
});

test('layout: generations ordered, no overlaps, children centred under the couple', () => {
  const g = app.ggBuild(cpOf('58歳男性。妻と長男、長女と同居。父は死亡、母は健在。兄と弟がいる。'));
  assert.strictEqual(app.ggOverlaps(g).length, 0);
  const L = app.ggLayout(g);
  assert.ok(L.pos.get('father').y < L.pos.get('index').y && L.pos.get('index').y < L.pos.get('son1').y);
  assert.ok(L.pos.get('brotherO').x < L.pos.get('index').x && L.pos.get('index').x < L.pos.get('brotherY').x);
  const single = app.ggBuild(cpOf('母と二人暮らし。'));
  assert.strictEqual(app.ggOverlaps(single).length, 0); // single parent, missing partner
});

test('SVG: square / circle / diamond / double outline / X, legend, masked labels', () => {
  const g = app.ggBuild(cpOf('58歳男性。妻と同居。父は死亡。配偶者以外にパートナーはいない。'));
  const svg = app.genogramSvg(g, {});
  assert.match(svg, /<rect x="[\d.]+" y="[\d.]+" width="40"/); assert.match(svg, /<circle /);
  const unknown = app.ggBuild(cpOf('子どもが2人いる。'));
  assert.match(app.genogramSvg(unknown, {}), /<polygon /);
  // index double outline: two shapes for the index; deceased X: two diagonal lines
  const idx = app.ggBuild(cpOf('58歳男性。父は死亡。'));
  assert.ok((app.genogramSvg(idx, {}).match(/<rect x="[\d.]+" y="[\d.]+" width="(?:40|48)"/g) || []).length >= 3);
  assert.ok((app.genogramSvg(idx, {}).match(/stroke-width="1.8"\/><line/g) || []).length >= 1);
  assert.match(app.genogramLegendHtml(), /本人/);
  assert.strictEqual(app.genogramSvg(app.ggBuild(cpOf('なし')), {}), '');
});

test('regenerate keeps manual edits, never resurrects deleted members, adds new ones', () => {
  const base = app.ggBuild(cpOf('妻と長男と同居。'));
  const old = JSON.parse(JSON.stringify(base));
  by(old.persons, 'wife').manual = true; by(old.persons, 'wife').age = 61; by(old.persons, 'wife').notes = ['手で追加したメモ'];
  by(old.persons, 'son1').deleted = true; by(old.persons, 'son1').manual = true;
  old.persons.push({ id: 'manual_x', role: '友人', sex: 'u', gen: 0, ord: 30, manual: true });
  const fresh = app.ggBuild(cpOf('妻と長男と同居。長女（20歳）がいる。'));
  const { genogram, report } = app.ggMerge(app.ggNormalize(old), fresh);
  const ids = Array.from(genogram.persons).map(p => p.id);
  assert.strictEqual(by(genogram.persons, 'wife').age, 61); assert.deepStrictEqual(Array.from(by(genogram.persons, 'wife').notes), ['手で追加したメモ']);
  assert.strictEqual(by(genogram.persons, 'son1').deleted, true);
  assert.ok(ids.includes('manual_x') && ids.includes('daughter1'));
  assert.strictEqual(report.skippedDeleted, 1); assert.match(genogram.notice, /再び追加しません/);
});

test('legacy patient without cp.genogram is unaffected; nothing is stored by viewing / exporting', () => {
  const cp = cpOf('妻と同居。');
  const before = JSON.stringify(cp);
  app.genogramText(cp); app.genogramCorrectionText(cp); app.buildExportPlainText(cp, null);
  assert.strictEqual(JSON.stringify(cp), before); assert.strictEqual(cp.genogram, undefined);
  assert.strictEqual(Array.from(app.ggNormalize({ persons: [{ id: 'a', parents: ['zzz'], partner: 'qqq' }] }).persons[0].parents).length, 0);
});

test('export: ジェノグラム is a selectable section (text outline), masked; 修正依頼 has the data section and the developer line', () => {
  assert.ok(app.EXPORT_SECTIONS.map(x => x.key).includes('genogram'));
  const cp = cpOf('氏名：山田 太郎\n妻と二人暮らし。妻は糖尿病。キーパーソンは妻。山田 太郎の長男は別居。');
  const on = app.buildExportPlainText(cp, app.exportSelectionFromKeys(['genogram']));
  assert.match(on, /ジェノグラム/); assert.match(on, /キーパーソン：妻/); assert.match(on, /内蔵辞書 2026-10-16（出典未確認）/);
  assert.ok(!on.includes('太郎'));
  assert.ok(!/ジェノグラム/.test(app.buildExportPlainText(cp, app.exportSelectionFromKeys(['o']))));
  const req = app.buildReviewRequestText(cp, cp.sourceText, true);
  assert.match(req, /【アプリが作成したジェノグラム】/); assert.match(req, /Developer instruction: compare the family members/);
  assert.ok(!req.split('\n').filter(l => /ジェノグラム|家族の|　・/.test(l) && /妻|長男/.test(l)).some(l => l.includes('太郎')));
  assert.ok(!/ジェノグラム/.test(app.genogramCorrectionText(cpOf('体温37.0℃'))));
});
