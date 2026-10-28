'use strict';
// Tag audit: structural headings are not findings; the audit is read-only and never auto-fixes a changed tag.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'synthetic-postpartum.txt'), 'utf8');

test('numbered section titles and table pointers get no Henderson tag; real findings still do', () => {
  ['1 生殖器の復古', '3 乳房状態', '5 家族/役割関係', '4 心理状態', '上記表参照'].forEach(t => assert.deepEqual(Array.from(app.detectMultipleHendersonTags(t)), [], t));
  assert.ok(app.detectMultipleHendersonTags('「昨夜は授乳の時以外はよく眠れた」').includes(5));
  assert.ok(app.detectMultipleHendersonTags('2 人暮らし').length > 0, 'a counted household is not a heading');
});

test('audit lists missing/wrong tags, keeps user tags, and is read-only', () => {
  const items = [
    { id: 'a', type: 'o', text: '3 乳房状態', hendersonIds: [9] },
    { id: 'b', type: 'o', text: '「昨夜は授乳の時以外はよく眠れた」', hendersonIds: [] },
    { id: 'c', type: 'o', text: '「昨夜は授乳の時以外はよく眠れた」', hendersonIds: [5] },
    { id: 'd', type: 'o', text: '「昨夜は授乳の時以外はよく眠れた」', hendersonIds: [9] }
  ];
  const before = JSON.stringify(items);
  const rows = app.buildTagAuditRows({ items });
  assert.equal(JSON.stringify(items), before);
  const by = Object.fromEntries(rows.map(r => [r.id, r]));
  assert.deepEqual(Array.from(by.a.removeTags), [9]); assert.equal(by.a.autoFix, false);
  assert.equal(by.b.autoFix, true); assert.ok(by.b.missingTags.includes(5));
  assert.ok(!by.c || (by.c.removeTags.length === 0 && by.c.autoFix === false)); // existing tags are never removed or overwritten
  assert.equal(by.d.autoFix, false);
  assert.match(app.buildTagAuditText({ items }), /自動では変更しません/);
  assert.match(app.buildTagAuditText({ items: [] }), /修正候補はありません/);
});

test('cards not forced into a Henderson need get a destination proposal (concept / structure / background / fragment)', () => {
  const d = t => (app.proposeCardDestination(t) || {}).key;
  assert.equal(d('3 乳房状態'), 'structure');
  assert.equal(d('入院時付'), 'fragment');
  assert.equal(d('子宮の硬さ：臍下2横指、恥骨結合上13cm 良好'), 'puerperal');
  assert.equal(d('乳管開通4〜5本 乳房緊満なし 初乳がわずかに滲むていど'), 'lactation');
  assert.equal(d('児の健康状態:出生時体重2930g 仮死なし'), 'newborn');
  assert.equal(d('朝4時に陣痛が始まり、分娩開始で朝7時に入院となる'), 'delivery');
  assert.equal(d('母子ともに身体的異常はみられず'), 'overall');
  assert.equal(app.proposeCardDestination('胸痛あり'), null, 'a plain symptom needs no destination');
  const rows = app.buildTagAuditRows({ items: [{ id: 'u', type: 'unclassified', text: '悪露 赤色中等量', hendersonIds: [] }] });
  assert.equal(rows[0].destination.key, 'puerperal');
  assert.match(app.buildTagAuditText({ items: [{ id: 'u', type: 'unclassified', text: '悪露 赤色中等量', hendersonIds: [] }] }), /分類先の提案：産褥の回復/);
});

test('section titles, numbered viewpoint questions and table pointers never become cards; findings and quoted questions stay', () => {
  const text = ['産褥1日目', '3　乳房状態・授乳', '1）出産後の生活の変化を理解しているか', '・上記表参照', '5　家族／役割関係', '2 人暮らし', '3 回排便あり', '1）発熱はないか確認する。', '「夜　何かあったらどうしよう　不安ですか」'].join('\n');
  const cards = app.groupClinicalPhrasesWithTimestamps(text);
  const excluded = cards.filter(c => c.isUnnecessaryBoilerplate).map(c => c.text.normalize('NFKC'));
  ['3 乳房状態・授乳', '1)出産後の生活の変化を理解しているか', '上記表参照', '5 家族/役割関係'].forEach(h => assert.ok(excluded.some(e => e.replace(/\s/g, '') === h.replace(/\s/g, '').replace('／', '/')), `${h} should be excluded`));
  ['2 人暮らし', '3 回排便あり', '1)発熱はないか確認する。'].forEach(k => assert.ok(cards.some(c => !c.isUnnecessaryBoilerplate && c.text.normalize('NFKC').replace(/\s/g, '') === k.replace(/\s/g, '')), `${k} must stay a card`));
});

test('variant OCR glyphs for 歳 are read as the age for matching; source text is not changed', () => {
  const src = 'A氏•58歲,男性';
  const b = app.extractClinicalBasics(`[年齢] ${src}`);
  assert.equal(b.age, 58);
  assert.equal(b.sex, 'male');
  assert.equal(app.extractClinicalBasics('生後3日の男児').age, 0);
  assert.equal(src, 'A氏•58歲,男性');
  const ctx = app.labBackgroundContext({ sourceText: '58歲男性', items: [] });
  assert.equal(ctx.age, 58);
});

test('relation map shows patient age/sex beside the disease (also for OCR glyph variants); nothing is shown when unrecorded', () => {
  const mk = t => ({ id: 'x', title: 'x', sourceText: t, items: [{ id: 'a', type: 'o', text: t, fieldLabel: '年齢', hendersonIds: [], timestamp: '入院前' }, { id: 'b', type: 'o', text: '胃がんで腹腔鏡下胃全摘術を受けた。', hendersonIds: [2] }], carePlans: {}, myAssessments: {}, missingChecks: {} });
  const labels = cp => (app.buildRelationMapFromRecord(cp).nodes || []).map(n => n.label);
  assert.ok(labels(mk('A氏•58歲,男性')).includes('58歳男性'));
  assert.ok(labels(mk('A氏58歳,男性')).includes('58歳男性'));
  assert.ok(!labels(mk('胃がんの術後')).some(l => /歳|男性|女性/.test(l)));
});

test('patient wishes get a cross-cutting destination; an unmet verdict with improving evidence is not rated high', () => {
  assert.equal((app.proposeCardDestination('早く部活に戻りたいと話す') || {}).key, 'goal');
  assert.equal(app.proposeCardDestination('胸痛あり'), null);
  const items = [
    { id: 'a', type: 's', text: '「昨夜はあまり眠れなかった」', timestamp: '産褥1日目', hendersonIds: [5], assessmentCols: { 5: 'postadmission' } },
    { id: 'b', type: 's', text: '「昨夜は授乳の時以外はよく眠れた」', timestamp: '産褥2日目', hendersonIds: [5], assessmentCols: { 5: 'postadmission' } }
  ];
  const cp = { id: 'p', title: 'p', items, carePlans: {}, sourceText: '', myAssessments: {}, missingChecks: {} };
  app.judgeSufficiencyByRules(cp);
  assert.match(app.sufficiencyDimensionLines(cp, 5, 'post').join('\n'), /根拠の確かさ：中（経過で改善を示す記録を含む/);
  const only = { ...cp, items: [items[0]] };
  app.judgeSufficiencyByRules(only);
  assert.doesNotMatch(app.sufficiencyDimensionLines(only, 5, 'post').join('\n'), /経過で改善を示す/);
});

test('新分類先（データ品質・自己管理の工程・支援の可用性）: 一般条件で提案し、反例は提案しない', () => {
  const key = t => (app.proposeCardDestination(t) || {}).key;
  ['原文が不明瞭で単位が読み取れない', '原本確認が必要な転記', '判読不能の値あり'].forEach(t => assert.equal(key(t), 'dataquality', t));
  ['自己注射の手技を確認した', '低血糖のときは連絡できると話す', '補食の判断を説明できる'].forEach(t => assert.equal(key(t), 'selfmgmt', t));
  ['実家は車で10分', '母は仕事で夜まで不在', '支援者は限られる'].forEach(t => assert.equal(key(t), 'availability', t));
  ['血糖値は120mg/dL', '夫が面会に来た'].forEach(t => assert.notEqual(['dataquality', 'selfmgmt', 'availability'].includes(key(t)), true, t));
});
