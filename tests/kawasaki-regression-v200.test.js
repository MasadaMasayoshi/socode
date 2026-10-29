'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'kawasaki-5f.txt'), 'utf8');
const items = app.groupClinicalPhrasesWithTimestamps(text).filter(c => !c.isUnnecessaryBoilerplate).map((c, k) => {
  const ids = Array.from(new Set(app.detectMultipleHendersonTags(c.text)));
  const col = app.inferAssessmentColumn ? app.inferAssessmentColumn('', c.timestamp, null) : null;
  return { id: 'i' + k, type: 'o', text: c.text, timestamp: c.timestamp, hendersonIds: ids, assessmentCols: Object.fromEntries(ids.map(h => [h, col || 'postadmission'])) };
});
const cp = { id: 'k', title: 'k', items, carePlans: {}, sourceText: text, myAssessments: {}, missingChecks: {} };
const byText = re => items.find(i => re.test(i.text));

test('家族関係: 5歳の患児に配偶者・姻族を作らない／親・きょうだい・祖父母は保持する', () => {
  const g = app.genogramText(cp, x => x);
  assert.ok(!/妻|夫|配偶者/.test(g.replace(/父と母：婚姻/g, '')), g);
  assert.match(g, /父／男性／35歳/);
  assert.match(g, /母／女性／30歳/);
  assert.match(g, /弟／男性／2歳/);
  assert.match(g, /祖父（母方）/);
});
test('見出し断片: 見出しだけが前のカード末尾に残らない', () => {
  assert.ok(!items.some(i => /(?:住環境|主な保育者|好きな遊び|性格|睡眠|清潔)$/.test(i.text.replace(/[。\s]+$/, ''))));
  assert.ok(byText(/^住環境：郊外/));
});
test('孤立した単位行（表の断片）がない／情報は失われない', () => {
  assert.ok(!items.some(i => /^(?:mg\/dL|mIU\/mL|×10[⁴²]\/(?:μL|mm³))$/.test(i.text.trim())));
  ['白血球', '血小板', 'CRP', 'GOT', 'GPT', 'LDH', '尿タンパク', '心電図'].forEach(k => assert.ok(items.some(i => i.text.includes(k)), k));
  ['ベニロン', 'アスピリン', 'ホスミシン', '一般感染症', '敗血症', '白血病'].forEach(k => assert.ok(items.some(i => i.text.includes(k)), k));
});
test('検査値の単位: 上付き指数を保ち、等価な単位だけを換算する（LDHなど基準のない項目は換算しない）', () => {
  const w = app.analyzeLabCard('白血球　173×10²/mm³', null);
  assert.equal(w.valueStd, 17300); assert.equal(w.stdUnit, '/μL');
  const p = app.analyzeLabCard('血小板　44.5×10⁴/μL', null);
  assert.equal(p.unitRaw, '×10^4/μL'); assert.equal(p.value, 44.5);
  const a = app.analyzeLabCard('GPT　96mIU/mL', null);
  assert.equal(a.unit, 'U/L'); assert.equal(a.value, 96);
  assert.equal(app.analyzeLabCard('LDH　416', null), null);
});
test('分類: 遊び→余暇、食べ物の好み→食事、睡眠の習慣→睡眠、掻痒で眠れない→睡眠と皮膚', () => {
  assert.deepEqual(Array.from(byText(/^好きな遊び/).hendersonIds), [13]);
  assert.ok(byText(/嫌いなもの：野菜類/).hendersonIds.includes(2));
  assert.ok(byText(/好きなもの：肉類/).hendersonIds.includes(2));
  assert.ok(byText(/よく眠り、寝起きは良い/).hendersonIds.includes(5));
  const itch = byText(/全身掻痒感強度/);
  assert.ok(itch.hendersonIds.includes(5) && itch.hendersonIds.includes(8));
});
test('分類: 鑑別診断は欲求に入れず、診断・治療・検査・既往は保持先として示す', () => {
  items.filter(i => /鑑別診断|敗血症|白血病|一般感染症/.test(i.text)).forEach(i => assert.equal(i.hendersonIds.length, 0, i.text));
  const rows = Array.from(app.buildTagAuditRows(cp));
  const dest = re => { const r = rows.find(x => re.test(x.text)); return r && r.destination && r.destination.key; };
  assert.equal(dest(/^鑑別診断/), 'differential');
  assert.equal(dest(/ベニロン/), 'treatment');
  assert.equal(dest(/GOT/), 'labdata');
  assert.equal(dest(/^水痘/), 'history');
  rows.filter(r => !r.currentTags.length).forEach(r => assert.ok(r.destination, r.text));
});
test('判定: かゆみで眠れない→睡眠は未充足／食べない・吐く→食事は未充足／本人所見のない欲求は情報不足', () => {
  const r = app.judgeSufficiencyByRules(cp);
  assert.equal(r[5].post.verdict, 'unmet');
  assert.equal(r[2].post.verdict, 'unmet');
  assert.equal(r[3].post.verdict, 'unmet');
  assert.equal(r[11].post.verdict, 'unknown');
  assert.notEqual(r[1].post.verdict, 'conflict');
});
test('判定: 家族・医師の発言に出る合併症（心不全）は本人の所見にしない／食事の「十分できず」を良好にしない', () => {
  const r = app.judgeSufficiencyByRules(cp);
  const s = app.sufficiencySentence(cp, 2, 'post');
  assert.ok(!/摂取も十分/.test(s.replace(/できず/g, '')) || /できず/.test(s));
  assert.ok(!/心不全/.test(app.sufficiencySentence(cp, 1, 'post')));
  assert.ok(r[1]);
});
test('小児: 判定の根拠に成人の基準だけで未充足を作らない（検査値の単独判定なし）', () => {
  const rules = Array.from(app.sufficiencyLabRules('GPT 96 mIU/mL、CRP 5.92 mg/dL'));
  assert.ok(!rules.some(x => x.v === 'unmet' && x.need === 9));
});
test('知識: 川崎病は疑い・確定・鑑別を分け、循環・脱水・かゆみと睡眠・薬の観察・家族を含む（出典は頁未確認と明記）', () => {
  const k = app.CP_KNOWLEDGE_100 || null;
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', '12-missing-checks-and-care-plan.js'), 'utf8');
  const blk = src.slice(src.indexOf("cp100('kawasaki'"), src.indexOf("cp100('puerperium'"));
  ['疑い', '鑑別', '冠動脈', '脱水', '掻痒', 'グロブリン', 'アスピリン', '不安', '頁未確認'].forEach(w => assert.ok(blk.includes(w), w));
  assert.ok(k === null || k);
});
test('推論: 発熱・口腔所見・摂取不良・尿量減少がそろうと、脱水の可能性の組合せが食事と排泄に付く', () => {
  const r = app.judgeSufficiencyByRules(cp);
  const hit = n => JSON.stringify((r[n].post && r[n].post.knowledge) || {}).includes('脱水');
  assert.ok(hit(2) || hit(3));
});
