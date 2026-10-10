'use strict';
// 検査値の推移のページ（検査値・バイタルサインを「項目 × 日時」の表にする）の確認
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const cardsOf = t => Array.from(app.classifyTextByRules(t)).map((c, i) => ({ ...c, id: 'c' + i }));
const plain = x => JSON.parse(JSON.stringify(x));
const cell = (table, key, col) => plain( (table.rows.find(r => r.key === key)?.cells[col] || []).map(x => x.value + (x.flag === 'high' ? '↑' : x.flag === 'low' ? '↓' : '')));

test('バイタルサインのカードを項目ごとに分け、日ごとの列に並べる（Day形式の実習記録）', () => {
  const src = 'Day 1（月・術後3日目）\nOデータ\nバイタル：BT 37.1℃、HR 82回/分、BP 138/80mmHg、SpO2 97%(RA)\nDay 2（火・術後4日目）\nOデータ\nバイタル：BT 36.8℃、HR 76回/分、BP 132/76mmHg、SpO2 98%(RA)';
  const t = app.buildLabTrendTable(cardsOf(src));
  assert.deepEqual(plain(t.columns.map(c => c.key)), ['術後3日目', '術後4日目']);
  assert.deepEqual(plain(t.rows.map(r => r.key)), ['体温', '脈拍', '血圧', 'SpO2']);
  assert.deepEqual(cell(t, '体温', '術後3日目'), ['37.1']);
  assert.deepEqual(cell(t, '血圧', '術後4日目'), ['132/76']);
  assert.equal(t.rows.find(r => r.key === 'SpO2').cells['術後3日目'][0].note, 'RA');
});

test('検査の比較表（入院時→入院3日目）は基準値と比べて↑↓を付け、同じ日の時刻は時刻順に並べる（心不全の事例）', () => {
  const src = fs.readFileSync(path.join(__dirname, 'fixtures', 'public-cases', 'circulation-contract.txt'), 'utf8');
  const t = app.buildLabTrendTable(cardsOf(src));
  assert.deepEqual(cell(t, 'BNP', '入院時'), ['1,250↑']);
  assert.deepEqual(cell(t, 'BNP', '入院3日目'), ['680↑']);
  assert.deepEqual(cell(t, 'K', '入院時'), ['3.8']);
  assert.deepEqual(cell(t, 'K', '入院3日目'), ['3.4↓']);
  assert.deepEqual(cell(t, '体重', '入院2日目 6:00'), ['66.5']);
  assert.deepEqual(cell(t, '血圧', '入院1日目 14:30'), ['158/92↑']);
  assert.deepEqual(cell(t, 'SpO2', '入院1日目 14:30'), ['90↓']);
  const keys = t.columns.map(c => c.key);
  assert.ok(keys.indexOf('入院1日目 14:30') < keys.indexOf('入院1日目 21:00'));
  assert.ok(keys.indexOf('入院2日目 10:00') < keys.indexOf('入院3日目 10:00'));
  // 文の途中の値（「SpO2 94%に上昇」「K 3.4mEq/Lのため…」「歩行後SpO2 92%まで低下」）は表に入れない
  const spo2 = t.rows.find(r => r.key === 'SpO2');
  assert.ok(!Object.values(spo2.cells).flat().some(x => x.value === '94' || x.value === '92'));
  assert.deepEqual(cell(t, 'K', '入院3日目 11:00'), []);
  // グループの順番：バイタルサイン → 身体計測 → 検査
  assert.equal(t.rows[0].group, 'バイタルサイン');
  assert.ok(t.rows.findIndex(r => r.group === '身体計測') < t.rows.findIndex(r => r.key === 'BNP'));
});

test('文の読み取り：前置きの見出しを外す・随時血糖は別の行・基準値の範囲の読み方', () => {
  const e = app.parseLabTrendEntries('検温: 体温36.6度、血圧128/78mmHg、脈拍86回/分 不整、呼吸22回/分、SpO2 96%(酸素2L)');
  assert.deepEqual(plain(e.map(x => x.key)), ['体温', '血圧', '脈拍', '呼吸数', 'SpO2']);
  assert.equal(e[2].note, '不整');
  assert.equal(e[0].unit, '°C');
  assert.equal(app.parseLabTrendEntries('酸素2L鼻カニューレ開始し、SpO2 94%に上昇。'), null);
  assert.equal(app.parseLabTrendEntries('歩行後SpO2 92%まで低下'), null);
  assert.equal(app.parseLabTrendEntries('血糖(随時) 246 mg/dL')[0].key, '血糖(随時)');
  const lh = r => ({ low: r.low, high: r.high });
  assert.deepEqual(lh(app.parseLabReferenceRange('4,000〜9,000')), { low: 4000, high: 9000 });
  assert.deepEqual(lh(app.parseLabReferenceRange('0.14mg/dL以下')), { low: null, high: 0.14 });
  assert.deepEqual(lh(app.parseLabReferenceRange('3.6-4.8mEq/L')), { low: 3.6, high: 4.8 });
  assert.equal(app.parseLabReferenceRange('100未満').highExclusive, true);
});

test('バイタルサインを隠すと検査値だけの表になり、Excelに貼れるタブ区切りにできる', () => {
  const src = '入院時\nWBC 12,000/μL\nCRP 3.2 mg/dL\n体温38.2℃、脈拍110回/分\n術後1日目\nWBC 9,800/μL\nCRP 5.1 mg/dL';
  const t = app.buildLabTrendTable(cardsOf(src), { includeVitals: false });
  assert.deepEqual(plain(t.rows.map(r => r.key)), ['WBC', 'CRP']);
  assert.deepEqual(cell(t, 'WBC', '入院時'), ['12,000↑']);
  const tsv = app.labTrendTableToTsv(t);
  assert.match(tsv.split('\n')[0], /^項目\t単位\t基準値\t入院時\t術後1日目$/);
  assert.match(tsv, /CRP\tmg\/dL\t[^\t]*\t3\.2↑\t5\.1↑/);
});

test('画面：「検査値の推移」のタブ・ページと、記録メモの全画面ボタンがある', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="tab-labs"[^>]*>\s*検査値の推移/);
  assert.match(html, /id="view-labs"/);
  assert.match(html, /id="lab-trend-table-wrap"/);
  assert.match(html, /id="source-editor"[\s\S]*id="btn-source-fullscreen"[\s\S]*id="source-text"[\s\S]*id="source-highlight-view"/);
});

const indicesOf = src => { const r = app.computeClinicalIndices(src, cardsOf(src)); return { ...r, get: k => r.indices.find(x => x.key === k) }; };

test('自動計算：BMI・標準体重・普段からの体重の変化・ブリンクマン指数・純アルコール量・eGFR（心不全の事例）', () => {
  const src = fs.readFileSync(path.join(__dirname, 'fixtures', 'public-cases', 'circulation-contract.txt'), 'utf8');
  const r = indicesOf(src);
  assert.equal(r.basics.age, 82);
  assert.equal(r.basics.sex, 'male');
  assert.equal(r.get('bmi').value, '25.0');
  assert.match(r.get('bmi').note, /肥満（1度）/);
  assert.equal(r.get('ibw').value, 59.9);
  assert.equal(r.get('wchange').value, '+3');
  assert.equal(r.get('wtrend').value, '-2.8');
  assert.equal(r.get('brinkman').value, 800);
  assert.equal(r.get('packyears').value, 40);
  assert.equal(r.get('alcohol').value, 14);
  assert.equal(r.get('egfr').value, 37.3);
  assert.match(r.get('egfr').note, /G3b/);
  assert.equal(r.get('bee').value, 1272);
});

test('自動計算：喫煙の書き方の違い・家族の年齢は使わない・半年前の体重・子どもはカウプ/ローレル指数', () => {
  assert.deepEqual({ ...app.extractSmoking('喫煙：40本/日×50年、5年前から禁煙', 79) }, { perDay: 40, years: 50, src: '40本/日×50年' });
  assert.equal(app.extractSmoking('1日20本を30年吸っていた', 70).years, 30);
  assert.equal(app.extractSmoking('20歳から喫煙（20本／日）していたが、10年前に禁煙した。', 58).years, 28);
  assert.equal(indicesOf('A氏 70歳 男性\n20歳から喫煙（20本／日）していたが、10年前に禁煙した。').get('brinkman').value, 800);
  assert.match(indicesOf('嗜好品：20歳から喫煙（20本／日）していたが、10年前に禁煙した。').missing[0].need, /年齢/);
  assert.equal(indicesOf('タバコ: なし').missing.length, 0);
  assert.equal(app.extractClinicalBasics('家族構成：妻（80歳）と二人暮らし\n氏名：B氏 82歳 男性').age, 82);
  const a = indicesOf('Hさん 68歳 女性\n身長152cm、体重41.2kg（半年前は52kg）');
  assert.equal(a.get('wchange').name, '半年前からの体重の変化');
  assert.equal(a.get('wchange').level, 'warn');
  assert.match(a.get('bmi').note, /低体重/);
  assert.equal(indicesOf('Qちゃん 4歳 女児\n身長100cm、体重16kg').get('kaup').value, 16);
  assert.ok(indicesOf('Rくん 10歳 男児\n身長140cm、体重35kg').get('rohrer'));
});

// 2026-10-06.22：「体重 1か月で2.0kg減少」の「1」（期間）を体重の値として表に出していた
test('検査値の推移：「体重 1か月で2.0kg減少」は体重の値（1）として読まない', () => {
  assert.equal(app.parseLabTrendEntries('体重 1か月で2.0kg減少。'), null);
  const e = app.parseLabTrendEntries('体重 52.4kg');
  assert.equal(e[0].key, '体重');
  assert.equal(e[0].value, '52.4');
});
