'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const cards = s => Array.from(app.classifyTextByRules(s));
const tags = t => Array.from(app.detectMultipleHendersonTags(t));

test('Screening use, negative infection screens and imaging retain their semantic domains', () => {
  assert.deepEqual(tags('がん家系なので、検診を欠かさないようにしていた。'), [14]);
  assert.deepEqual(tags('HCV 抗体(-)'), [9]);
  assert.deepEqual(tags('梅毒(-)'), [9]);
  assert.deepEqual(tags('HBV 抗原(-)'), [9]);
  assert.deepEqual(tags('【胸部 X 線】明らかな病変はなし'), [1]);
  assert.deepEqual(tags('【胃カメラ】胃底部に25mm大の腫瘍あり'), [2]);
  for (const t of ['祖母を胃がんで亡くしている', '精密検査で胃底部にがんを指摘され、手術目的で入院の予定。', '【病理結果】T2 N0 P0 H0 M0、Stage IB']) assert.ok(!tags(t).includes(14));
  assert.deepEqual(tags('【血液型】A型'), []);
});

test('Table scaffolding is recognized before punctuation splitting without losing measurements', () => {
  const c = cards('＜実習1日目(入院1日目、手術前々日)＞\n《術前検査結果》\n| 項目 | 種類 | 基準値 | A 氏 | 正常・異常 |\n| :--- | :--- | :--- | :--- | :--- |\n| Hb | | | 13.5g/dl | |');
  assert.ok(c.some(i => i.text.includes('正常・異常') && i.type === 'unnecessary'));
  assert.ok(!c.some(i => i.text === '異常 |'));
  assert.ok(c.some(i => /Hb.*13.5/.test(i.text) && i.type === 'o' && i.timestamp === '入院1日目'));
  assert.ok(c.find(i => i.text === '《術前検査結果》').type === 'unnecessary');
});

test('Repeated course titles and detached headings never become patient findings', () => {
  const c = cards('23 期生 経過別看護過程と援助技術(急性期)\n入院前\nADL:自立\n23 期生 経過別看護過程と援助技術(急性期)\n《帰室時の状況》\n《カルテ情報》\n《カルテより手術の情報》\n《術前検査結果》 【血液検査データー】');
  assert.ok(c.filter(i => /23 期生|《/.test(i.text)).every(i => i.type === 'unnecessary'));
});

test('Allergy short values use the field label and export the correct source sentence', () => {
  const source = '架空の記録\n入院前\n既往歴:胆嚢結石で症状がない\nADL:全て自立 アレルギーはない。';
  const allergy = cards(source).find(i => i.fieldLabel === 'アレルギー');
  assert.deepEqual(Array.from(allergy.hendersonIds), [9]);
  const legacy = { id: 'a', text: 'ない', fieldLabel: 'アレルギー', timestamp: '入院前', type: 'o', hendersonIds: [], predictionSource: 'rule' };
  const cp = { title: '架空', sourceText: source, items: [legacy] };
  assert.equal(app.refreshSavedUntaggedCards(cp), 1);
  assert.equal(legacy.text, 'ない'); assert.equal(legacy.id, 'a');
  assert.deepEqual(Array.from(legacy.hendersonIds), [9]);
  const out = app.buildSelectedCardsExportText(cp, new Set(['a']), source, false);
  assert.match(out, /元の文章: ADL:全て自立 アレルギーはない。/);
  assert.doesNotMatch(out, /元の文章:.*胆嚢結石/);
  const spaced = app.buildSelectedCardsExportText(cp, new Set(['a']), '症状がない。\nアレルギー： ない', false);
  assert.match(spaced, /元の文章: アレルギー： ない/);
});

test('Untouched structure cards are repaired in place; protected decisions remain intact', () => {
  const source = '入院1日目\n《術前検査結果》\n| 項目 | 種類 | 基準値 | A 氏 | 正常・異常 |';
  const mk = extra => ({ id: 'x', text: '《術前検査結果》', timestamp: '入院1日目', type: 'o', hendersonIds: [], predictionSource: 'rule', ...extra });
  const cp = { sourceText: source, items: [mk({})] };
  assert.equal(app.refreshSavedUntaggedCards(cp), 1);
  assert.equal(cp.items[0].type, 'unnecessary'); assert.equal(cp.items[0].id, 'x');
  assert.ok(cp.items[0].ruleCorrectionReason);
  assert.equal(app.refreshSavedUntaggedCards(cp), 0);
  for (const extra of [{ predictionSource: 'confirmed' }, { tagNotNeeded: true }, { editLog: [{kind:'text'}] }]) {
    const cp = { sourceText: source, items: [mk(extra)] }, before = JSON.stringify(cp);
    assert.equal(app.refreshSavedUntaggedCards(cp), 0); assert.equal(JSON.stringify(cp), before);
  }
  for (const predictionSource of ['learned','fuzzy','tied']) {
    const learned = {sourceText:source,items:[mk({predictionSource,hendersonIds:[9]})]};
    assert.equal(app.refreshSavedUntaggedCards(learned),1);assert.equal(learned.items[0].type,'unnecessary');assert.deepEqual(Array.from(learned.items[0].hendersonIds),[]);
    assert.equal(app.refreshSavedUntaggedCards(learned),0);
  }
  const fragment = { sourceText: source, items: [mk({text:'異常 |'})] };
  assert.equal(app.refreshSavedUntaggedCards(fragment), 1); assert.equal(fragment.items[0].type, 'unnecessary');
});

test('Pathology remains complete, wrapped source is literal and explanations do not become signs', () => {
  const c = cards('＜実習3日目(入院3日目、手術当日・術直後)＞\n【病理結果】T2 N0 P0 H0 M0、Stage IB\n胃体部と膵体部の\n着があり剥離した。また、胆嚢内に結石が認められ、同時に摘出した。\n【検査データ】\nWBC 11600/μL\nホーマンズ:\n足を背屈させたとき');
  const pathology = c.find(i => i.text.includes('病理結果'));
  assert.match(pathology.text, /Stage IB/); assert.deepEqual(Array.from(pathology.hendersonIds), []);
  assert.ok(!c.some(i => /^Stage/.test(i.text)));
  const wrapped = c.find(i => i.text.includes('膵体部の着'));
  assert.ok(wrapped); assert.ok(!wrapped.text.includes('癒着'));
  assert.equal(app.inferUntaggedReason(wrapped).kind, 'source');
  const note = c.find(i => i.text.includes('足を背屈'));
  assert.equal(note.type, 'unnecessary'); assert.equal(note.timestamp, '手術当日');
  assert.ok(c.filter(i => i.type !== 'unnecessary').every(i => i.timestamp !== '検査データ'));
});

test('Corrected clinical tags migrate only at matching times and remain idempotent with duplicates', () => {
  const source = '入院1日目\n【胸部 X 線】明らかな病変はなし\nHCV 抗体(-)';
  const mk = ts => ({id:ts,text:'【胸部 X 線】明らかな病変はなし',timestamp:ts,type:'o',hendersonIds:[],predictionSource:'rule'});
  const cp = { sourceText:source,items:[mk('入院1日目'),mk('術後1日目')] };
  assert.equal(app.refreshSavedUntaggedCards(cp),1);
  assert.deepEqual(cp.items.map(i=>Array.from(i.hendersonIds)),[[1],[]]);
  assert.equal(app.refreshSavedUntaggedCards(cp),0);
  const one=cards(source), twice=cards(source+'\n'+source);
  assert.deepEqual(twice,one);
});


test('Additional explicit domains are retained in equivalent source expressions', () => {
  assert.deepEqual(tags('睡眠:6~7時間/日 排便:1回/日、排尿:7~8回/日'), [5, 3]);
  assert.deepEqual(tags('精密検査で胃底部に25mm大のがんを指摘され、手術目的で入院の予定。'), [2]);
  assert.ok(tags('看護師から手術オリエンテーション(合併症とその予防方法)を受ける。').includes(14));
  assert.ok(tags('疼痛はNRS2。自主的な体動はない。ホーマンズ徴候(-)').includes(4));
  const cr = cards('入院1日目\n| Cr | | | 0.87 mg/dl | |').find(i => /Cr/.test(i.text));
  assert.deepEqual(Array.from(cr.hendersonIds), [3]);
  const history = cards('祖母を胃がん、父を前立腺がんで亡くしている').find(i => /祖母/.test(i.text));
  assert.deepEqual(Array.from(history.hendersonIds), []);
  assert.ok(!tags('術前オリエンテーションの予定なし').includes(14));
});
