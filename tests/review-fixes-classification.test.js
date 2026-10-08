'use strict';
// コードレビューで見つかった分類（js/03・js/07）の不具合の回帰テスト。
// どれも「元の文章の文・数値が消える」「値が壊れる」「日時がずれる」「患者の情報が不要になる」ものなので、
// 実際に不具合が起きていた入力をそのまま使って、直った状態を固定する。

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const app = loadApp();
const classify = text => Array.from(app.classifyTextByRules(text)).map(c => ({ ...c, hendersonIds: Array.from(c.hendersonIds) }));
const find = (cards, re) => cards.find(c => re.test(c.text));

test('A：・P：の続きは、次の日の見出しで終わる（次の日の観察・バイタルが「不要」にならない）', () => {
  const cards = classify('術後1日目\n10:00 S：「痛い」\nO：創部発赤なし\nA：経過良好\nP：観察継続\n術後2日目\n10:00 O：歩行器歩行開始\n体温37.0℃');
  const temp = find(cards, /体温37\.0/);
  assert.equal(temp.type, 'o');
  assert.equal(temp.timestamp, '術後2日目 10:00');
  assert.ok(!cards.some(c => c.text === '術後2日目'), '日の見出しが不要のカードになっていない');

  const cards2 = classify('10月3日\nA：経過良好\nP：観察継続\n10月4日\n体温37.0℃ 食事全量摂取');
  const t2 = find(cards2, /体温37\.0/);
  assert.equal(t2.type, 'o');
  assert.equal(t2.timestamp, '10月4日');
  assert.equal(find(cards2, /食事全量摂取/).type, 'o');
});

test('【考察】の下の「不要」は、次の日付の見出しで終わる', () => {
  const cards = classify('10月7日\n10:00 体温36.8℃\n【考察】\n疼痛コントロールが必要と考える。\n10月8日\n10:00 体温37.5℃、食事5割摂取');
  assert.equal(find(cards, /疼痛コントロール/).type, 'unnecessary');
  const t = find(cards, /体温37\.5/);
  assert.equal(t.type, 'o');
  assert.equal(t.timestamp, '10月8日 10:00');
});

test('数字で始まる所見の行は、次の行が【…】でも消えず、日時にもならない', () => {
  const cards = classify('10:00 体温38.0℃\n3回嘔吐あり。\n【食事】朝食5割摂取');
  assert.ok(find(cards, /3回嘔吐あり/));
  assert.ok(cards.every(c => c.timestamp === '10:00'));
  const cards2 = classify('2日間排便なし\n【排泄】腹部膨満あり');
  assert.ok(find(cards2, /2日間排便なし/));
  assert.ok(!cards2.some(c => /日間排便なし/.test(c.timestamp)));
});

test('日付・日の語の直後に助詞が続く文は、文のまま残る（過去の日付は以降の日時にしない）', () => {
  assert.ok(find(classify('6月10日に手術予定。'), /^6月10日に手術予定。$/));
  const c1 = find(classify('術後1日目にドレーン抜去。'), /ドレーン抜去/);
  assert.equal(c1.text, '術後1日目にドレーン抜去。');
  assert.equal(c1.timestamp, '術後1日目');
  const cards = classify('既往歴：高血圧\n2020年3月1日に胃がんで胃切除術を受けた。\n食欲不振あり、摂取量5割。');
  assert.ok(find(cards, /^2020年3月1日に胃がんで胃切除術を受けた。$/));
  assert.ok(!cards.some(c => /2020年/.test(c.timestamp)), '過去の日付が日時になっていない');
});

test('検査値ではない語（1hr・PT 2単位・TP1）を検査値として切り出さない', () => {
  const c1 = classify('点滴を1hr 100mlで投与した');
  assert.equal(c1.length, 1);
  assert.equal(c1[0].text, '点滴を1hr 100mlで投与した');
  const c2 = classify('14:00 PT 2単位実施。平行棒内歩行10m。');
  assert.ok(!c2.some(c => /秒|基準値/.test(c.text)), '記録に無い単位・基準値が作られていない');
  assert.ok(find(c2, /PT 2単位実施/));
  const c3 = classify('TP1 清拭を実施する');
  assert.ok(!c3.some(c => /g\/dL/.test(c.text)));
  // 本物の検査値はこれまで通り
  assert.ok(find(classify('TP 6.8 g/dL'), /^TP 6\.8 g\/dL \(基準値/));
  assert.ok(find(classify('HR 110回/分'), /^HR 110回\/分$/));
});

test('「体温37度2分」の「2分」が別のバイタルの値にくっつかない', () => {
  const cards = classify('10:00 体温37度2分、血圧 130/80mmHg');
  assert.ok(cards.some(c => /体温37度2分/.test(c.text)));
  assert.ok(!cards.some(c => /mmHg\s*2分|120\/708|130\/802/.test(c.text)));
  const cards2 = classify('体温36度8分、脈拍60〜70回/分、血圧 120/70、呼吸数 18');
  assert.ok(!cards2.some(c => /120\/708/.test(c.text)));
  assert.ok(cards2.some(c => /36度8分/.test(c.text)));
});

test('「2026/10/05 10:00」「10/6(火) 10:00」「10/7 14:00」「翌朝6:00」を日時として読む', () => {
  const cards = classify('10月4日 9:00 入院。\n2026/10/05 10:00 体温37.2℃、倦怠感あり\n10/6(火) 10:00 食事8割摂取\n10/7 14:00 歩行訓練開始');
  assert.equal(find(cards, /体温37\.2/).timestamp, '10月5日 10:00');
  const meal = find(cards, /食事8割摂取/);
  assert.equal(meal.timestamp, '10月6日 10:00');
  assert.equal(meal.text, '食事8割摂取');
  assert.equal(find(cards, /歩行訓練開始/).timestamp, '10月7日 14:00');
  const c2 = classify('10月3日\n21:00 入眠。\n翌朝6:00 「ぐっすり眠れた」と笑顔。');
  assert.equal(find(c2, /ぐっすり/).timestamp, '10月4日 6:00');
  // 分数は日付にしない
  assert.ok(find(classify('1/2量摂取。'), /1\/2量摂取/));
});

test('「血液検査（10/8 6:00）」の日付を読み捨てない', () => {
  const cards = classify('10月7日\n10:00 体温36.8℃\n血液検査（10/8 6:00）：Na 133 mEq/L、K 3.3 mEq/L');
  assert.equal(find(cards, /^Na 133/).timestamp, '10月8日 6:00');
});

test('番号付き・○の箇条書きの所見は「不要」にしない（見出しはこれまで通り不要）', () => {
  const cards = classify('10:00\n1. 食事は全粥5割摂取\n2. 夜間頻尿で3回覚醒\n3) 右下肢に浮腫を認める\n4. 38度台の発熱持続');
  ['全粥5割', '3回覚醒', '浮腫を認める', '発熱持続'].forEach(w => assert.equal(find(cards, new RegExp(w)).type, 'o', w));
  const bullets = classify('10:00 観察\n○ 腹痛なし\n○ 嘔気あり\n○ 排ガスあり、排便なし');
  ['腹痛なし', '嘔気あり', '排ガスあり'].forEach(w => assert.equal(find(bullets, new RegExp(w)).type, 'o', w));
  assert.equal(find(classify('1. 生活習慣・身体的機能（左ページ）\n食事は3食摂取'), /生活習慣/).type, 'unnecessary');
});

test('見出しの次の行が数値の幅で始まっても、見出しの行が消えない', () => {
  assert.ok(find(classify('排便習慣\n2〜3日に1回、硬便傾向'), /^排便習慣: 2〜3日に1回、硬便傾向$/));
  assert.ok(find(classify('昼食\n5〜6割摂取'), /^昼食: 5〜6割摂取$/));
  assert.ok(find(classify('睡眠状況\n4-5時間で中途覚醒あり'), /睡眠状況/));
});

test('既往歴「病名（◯歳）」の列挙で、病名と年齢の組がずれない', () => {
  const cards = classify('既往歴：高血圧（60歳）、糖尿病（65歳）、脳梗塞（70歳）');
  assert.deepEqual(cards.map(c => c.text), ['高血圧(60歳)', '糖尿病(65歳)', '脳梗塞(70歳)']);
  // 年齢が前に書かれた形はこれまで通り
  const cards2 = classify('既往歴：53歳 卵巣嚢腫、50歳代 胆石症 (症状がないため経過観察中)');
  assert.deepEqual(cards2.map(c => c.text), ['53歳 卵巣嚢腫', '50歳代 胆石症 (症状がないため経過観察中)']);
});

test('日の書かれていない記録の「翌日」が2回あっても、別の日になる（同じ文章が1枚に減らない）', () => {
  const cards = classify('10:00 食事全量摂取。\n翌日\n10:00 食事全量摂取。\n翌日\n10:00 食事全量摂取。');
  assert.equal(cards.length, 3);
  assert.deepEqual(cards.map(c => c.timestamp), ['10:00', '翌日 10:00', '翌々日 10:00']);
  assert.equal(app.nextDayLabel('翌々日'), '3日後');
  assert.equal(app.nextDayLabel('3日後'), '4日後');
});

test('検査値の異常の印（↑↓・H・L）が値のカードに残る', () => {
  const cards = classify('K 5.8 mEq/L↑、Na 131↓、eGFR 42 mL/min/1.73m2');
  assert.ok(find(cards, /^K 5\.8 mEq\/L↑/));
  assert.ok(find(cards, /^Na 131 mEq\/L↓/));
  assert.ok(!cards.some(c => /^[↑↓]/.test(c.text)));
  const hl = classify('採血結果 WBC 11200 H、CRP 3.8 H、Hb 9.1 L');
  assert.ok(find(hl, /^WBC 11200 \/μL H/));
  assert.ok(find(hl, /^Hb 9\.1 g\/dL L/));
  assert.ok(!hl.some(c => /採血結果 H/.test(c.text)));
  assert.ok(find(classify('Hb 9.1↓、倦怠感強い'), /^倦怠感強い$/));
});

test('タブ区切りの検査の表の後ろの記録は、表の前の日付のまま', () => {
  const cards = classify('10月5日\n9:00 倦怠感あり。\n項目\t基準値\t10/2\t10/7\nBUN\t8〜20\t78\t42\nCre\t0.6〜1.1\t8.2\t6.1\n14:00 透析後ふらつきあり。');
  assert.equal(find(cards, /^BUN 42/).timestamp, '10月7日');
  assert.equal(find(cards, /透析後ふらつき/).timestamp, '10月5日 14:00');
});

test('前に分類した別の患者（子ども・骨折）の状態が、後のカードの整えに残らない', () => {
  app.classifyTextByRules('患児 3歳 女児 右大腿骨骨折で入院。');
  assert.match(app.cleanExtractedPhrase('WBC 12000/μL'), /基準値/);
  assert.equal(app.cleanExtractedPhrase('創部：発赤なし'), '腹部創部（手術創）：発赤なし');
  // 分類している文章の中では、これまで通り子どもの記録として扱う
  assert.ok(find(classify('患児 3歳 女児\nWBC 12000/μL'), /^WBC 12000 \/μL$/));
});

test('家族の年齢で大人の記録を子どもの記録と判定しない', () => {
  assert.equal(app.detectAgeGroupFromText('78歳男性。患者の孫（3歳）が面会に来て笑顔。'), null);
  assert.ok(find(classify('78歳男性。患者の孫（3歳）が面会に来て笑顔。\nWBC 12000/μL'), /WBC 12000 \/μL \(基準値/));
  assert.equal(app.detectAgeGroupFromText('患児 3歳 女児'), 'toddler');
});

test('ヘンダーソンの項目の見出しの下で、2行にまたがる発言に制御文字が入らない', () => {
  const cards = classify('2．適切に飲食する\n「最近食欲がなくて、\nご飯が半分しか食べられない」と話す。\n本人より\n「甘いものは好き」\n体重45kg');
  assert.ok(cards.every(c => !/[\u0001-\u0003]/.test(c.text)));
  assert.ok(find(cards, /^「最近食欲がなくて、ご飯が半分しか食べられない」と話す。$/));
  assert.ok(find(cards, /^本人より「甘いものは好き」$/));
  assert.ok(find(cards, /体重45kg/).hendersonIds.includes(2));
});

test('日の順番：入院前日・年またぎ・2月29日', () => {
  assert.equal(app.nextDayLabel('入院前日'), '入院当日');
  assert.deepEqual(Array.from(app.groupItemsByDay([{ timestamp: '入院当日 10:00' }, { timestamp: '入院2日目 10:00' }, { timestamp: '入院前日 22:00' }]), g => g.day),
    ['入院前日', '入院当日', '入院2日目']);
  assert.deepEqual(Array.from(app.groupItemsByDay([{ timestamp: '12月31日 22:00' }, { timestamp: '1月1日 6:00' }]), g => g.day), ['12月31日', '1月1日']);
  assert.equal(app.nextDayLabel('2月29日'), '3月1日');
  assert.equal(app.nextDayLabel('2月28日'), '3月1日');
  const cards = classify('入院前日\n22:00 不安で眠れないと訴えあり。\n6:00 起床、表情硬い。');
  assert.equal(find(cards, /起床/).timestamp, '入院当日 6:00');
});

test('「Pt」（患者）を検査のPTと読まない・×10³ を ×103 にしない', () => {
  assert.ok(!classify('Ptは午前中ずっと臥床していた')[0].hendersonIds.includes(2));
  assert.ok(classify('PT 12.5秒')[0].hendersonIds.includes(2));
  const wbc = classify('WBC 11.2×10³/μL')[0].text;
  assert.ok(!/×103/.test(wbc), wbc);
  assert.match(wbc, /11,200 \/μL/);
});
