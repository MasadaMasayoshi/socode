const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();
const one = t => Array.from(app.drugsOfText(t));
const card = (id, text, n, o) => Object.assign({ id, type: 'o', text, timestamp: '入院3日目', hendersonIds: [n], assessmentCols: { [n]: 'postadmission' } }, o || {});
const cpOf = (items, extra) => Object.assign({ id: 'p', title: 'T', sourceText: '', items, myAssessments: {}, carePlans: {}, missingChecks: {} }, extra || {});

test('brand -> generic display only in metadata; the source text is not rewritten', () => {
  const d = one('ランタス4単位を就寝前に皮下注射')[0];
  assert.strictEqual(d.brand, 'ランタス'); assert.match(d.display, /^ランタス（インスリン/); assert.match(d.class, /持効型/);
  assert.strictEqual(d.provenance, app.DRUG_PROVENANCE); assert.match(app.DRUG_PROVENANCE, /出典未確認・臨床レビュー未実施/);
  const it = card('a', 'ランタス4単位を就寝前に皮下注射', 2); const before = it.text; app.refreshCardDrugs([it]);
  assert.strictEqual(it.text, before); assert.ok(Array.isArray(it.drugs));
  assert.strictEqual(it.drugs[0].generic.includes('グラルギン'), true);
  assert.strictEqual(one('amlodipine 5mg')[0].generic, 'アムロジピン');
  assert.strictEqual(one('Lantus 4U')[0].brand, 'ランタス');
});

test('dose / route / frequency / timing, full and half width, hiragana', () => {
  const d = one('ｱﾑﾛｼﾞﾋﾟﾝ５ｍｇ １日１回 朝食後 内服')[0];
  assert.deepStrictEqual([d.dose, d.unit, d.route, d.freq, d.timing], ['5', 'mg', '内服', '1日1回', '朝食後']);
  const e = one('ノボラピッド6単位 毎食前 皮下注')[0];
  assert.deepStrictEqual([e.dose, e.unit, e.route, e.freq], ['6', '単位', '皮下注', '毎食前']);
  assert.strictEqual(one('マグミット錠330mg 3錠 就寝前')[0].timing, '就寝前');
  assert.strictEqual(one('ろきそにん60mg 疼痛時 頓用')[0].status, '頓用');
  const two = one('ランタス4単位を朝食前に皮下注射、ノボラピッド6単位 毎食前');
  assert.strictEqual(two.length, 2); assert.strictEqual(two[1].timing, ''); // the first drug's timing does not leak
});

test('status: 中止 / なし / 既往 / 飲み忘れ / 拒否 / 自己中断 / 用量間違い are not "currently taking"', () => {
  const st = t => (one(t)[0] || {}).status;
  assert.strictEqual(st('ラシックス20mgは中止となった'), '中止');
  assert.strictEqual(st('以前はプレドニンを内服していた'), '既往（現在は未使用）');
  assert.strictEqual(st('ノルバスクの内服なし'), '内服なし');
  assert.strictEqual(st('アムロジピンを飲み忘れた'), '飲み忘れ');
  assert.strictEqual(st('ゾルピデム内服を拒否'), '拒否');
  assert.strictEqual(st('プレドニンを自己判断で中止した'), '自己中断');
  assert.strictEqual(st('ランタスの単位を間違えて打った'), '用量間違い');
  assert.strictEqual(st('ミカルディス40mg内服中'), '継続');
  assert.match(st('ミカルディスを処方'), /記載のみ|開始/);
});

test('unknown drug-like katakana is listed as a candidate, never replaced; ordinary words are not', () => {
  assert.deepStrictEqual(Array.from(app.drugUnknownCandidates('ネオトミン錠5mg内服')), ['ネオトミン']);
  assert.strictEqual(Array.from(app.drugUnknownCandidates('ランタス4単位')).length, 0);
  assert.strictEqual(Array.from(app.drugUnknownCandidates('ビール350mL飲む')).length, 0);
  assert.strictEqual(Array.from(app.drugUnknownCandidates('インスリン4単位')).length, 0);
});

test('legacy cards stay unchanged: no drugs field unless refreshed, and a drug-free text gets none', () => {
  const legacy = card('a', '体温36.8℃', 7); const copy = JSON.stringify(legacy);
  app.refreshCardDrugs([legacy]); assert.strictEqual(JSON.stringify(legacy), copy);
  const withDrug = card('b', 'ランタス4単位', 2); assert.strictEqual(withDrug.drugs, undefined);
  assert.strictEqual(Array.from(app.drugsOfItem(Object.assign({}, withDrug, { type: 'unnecessary' }))).length, 0);
});

test('dictionary rows carry class defaults and provenance', () => {
  const r = app.drugDictionaryRow(app.findDrugsInText('ランタス')[0].drug);
  assert.strictEqual(r.provenance, app.DRUG_PROVENANCE); assert.ok(r.route && r.unit === '単位'); assert.ok(r.needs.includes(2) && r.needs.includes(14)); assert.ok(r.op && r.caution);
  assert.ok(!/(?:投与量は|\d+単位を投与してよい)/.test(r.op + r.caution));
});

test('classification hint adds a tag only through the existing hint, never removes tags', () => {
  const c = Array.from(app.classifyTextByRules('インスリンを4単位皮下注射した。'));
  assert.ok(c.length > 0);
  const tagged = Array.from(app.classifyTextByRules('入浴の介助を行った。ロキソニン60mgを内服した。')).flatMap(x => Array.from(x.hendersonIds));
  assert.ok(tagged.includes(8));
});

test('sufficiency: a drug status problem is a finding; a drug name alone gives no verdict', () => {
  const v = (items, n) => app.ruleSufficiencyFor(cpOf(items))[n].post.verdict;
  assert.strictEqual(v([card('a', 'ランタスの打ち忘れがあった。', 14)], 14), 'unmet');
  assert.strictEqual(v([card('a', 'ランタス4単位を皮下注射', 14)], 14), 'unknown');
  assert.strictEqual(v([card('a', 'アムロジピンを内服している。', 14)], 14), 'unknown');
  assert.strictEqual(v([card('a', 'ゾルピデムの内服を拒否した。', 5)], 5), 'unmet');
  assert.strictEqual(v([card('a', 'ゾルピデムの内服なし。', 5)], 5), 'unknown');
  const t = String(app.sufficiencyPhaseText(cpOf([card('a', 'ランタスの打ち忘れがあった。', 14)]), 14, 'post'));
  assert.match(t.replace(/[。\s]+$/, ''), /(充足している|未充足である|判定保留|情報不足)$/);
});

test('observation points are asked for when a related drug is recorded and the need has no verdict', () => {
  const cp = cpOf([card('a', 'ラシックス20mg内服', 3)]);
  const ops = Array.from(app.drugObservationPoints(cp, 3));
  assert.ok(ops.length > 0 && /尿量/.test(ops[0].op));
  assert.strictEqual(Array.from(app.drugObservationPoints(cpOf([card('a', 'ラシックスは中止した', 3)]), 3)).length, 0);
});

test('export: 薬剤の情報 is a selectable section; the 修正依頼 carries it with masking and the developer line', () => {
  const keys = app.EXPORT_SECTIONS.map(x => x.key); assert.ok(keys.includes('drugs'));
  const cp = cpOf([card('a', 'ランタス4単位を皮下注射。山田太郎さんは自己注射を継続。ネオトミン錠5mg内服', 2)], { sourceText: '氏名：山田 太郎\n' });
  const on = app.buildExportPlainText(cp, app.exportSelectionFromKeys(['drugs']));
  assert.match(on, /薬剤の情報/); assert.match(on, /ランタス（インスリン/); assert.match(on, /未登録薬剤候補/);
  const off = app.buildExportPlainText(cp, app.exportSelectionFromKeys(['o']));
  assert.ok(!/薬剤の情報/.test(off));
  const req = app.buildReviewRequestText(cp, cp.sourceText, true);
  assert.match(req, /Developer instruction: verify the drug extraction/); assert.match(req, /未登録薬剤候補/);
  assert.ok(!req.split('\n').filter(l => /薬剤|ランタス/.test(l)).some(l => l.includes('太郎')));
});
