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
