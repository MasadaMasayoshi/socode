const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const cards = s => Array.from(app.classifyTextByRules(s));
const find = (c, re) => c.find(x => re.test(x.text));
test('時系列：予定表の行の「術後4～5日目」が、表のあとの記録の日付にならない', () => {
  const c = cards('6．術後1日目（6月11日）\n8:00　回診\n医師：外転枕抜去\nリハビリテーションスケジュール：術後1日目から開始\n時期\tリハビリ内容\n術後1日目\t介助で車椅子\n術後4～5日目\t記載内容判読困難\n10:00　検温\n体温37.0度\n7．術後2日目（6月12日）\n10:00\n体温36.7度');
  assert.match(find(c, /体温37\.0/).timestamp, /^術後1日目 10:00/);
  assert.match(find(c, /体温36\.7/).timestamp, /^術後2日目/);
  assert.equal(find(c, /介助で車椅子/).planned, true);
});
test('時系列：反例として、日付だけの見出し行は従来どおり後ろの記録の日付になる', () => {
  const c = cards('術後3日目\n10:00\n体温36.5度');
  assert.match(find(c, /体温36\.5/).timestamp, /^術後3日目/);
});
test('書類情報（担当・日付・科目）は不必要な情報、担当医・担当看護師の記録は残す', () => {
  const c = cards('日付：R8年6月26日（金）\n担当：越智\n科目：看護過程\n担当医：山田\n術後1日目\n10:00\n担当看護師と相談し、明日抜去予定となる');
  assert.equal(find(c, /^日付/).type, 'unnecessary');
  assert.equal(find(c, /^担当:越智|^担当：越智/).type, 'unnecessary');
  assert.notEqual(find(c, /担当医/).type, 'unnecessary');
  assert.notEqual(find(c, /担当看護師/).type, 'unnecessary');
});
test('検査表：「—」の欄はカードにせず、基準値の「以下」を測定値の単位に混ぜない', () => {
  const c = cards('検査データ\n検査項目\t正常値（資料記載）\t入院時\t術後1日目\nCRP（C反応性蛋白）\t0.2mg/dL以下\t0.262mg/dL\t1.5\nCr\t0.5～0.9mg/dL\t0.56mg/dL\t—');
  const crp = c.filter(x => /^CRP/.test(x.text)).map(x => x.text);
  assert.ok(crp.some(t => /1\.5 mg\/dL \(基準値/.test(t)), crp.join('|'));
  assert.ok(!c.some(x => /^Cr\s*—/.test(x.text)));
});
test('訂正表：「入院時WBC」の行は入院時の値として記録され、前後の記録の日付を変えない', () => {
  const c = cards('7．術後2日目（6月12日）\n16:00\n自尿あり。\n項目\t訂正後\n入院時WBC\t8,100/μL\n術後1日目WBC\t10,200/μL\n入院時HbA1c\t6.0%');
  assert.match(find(c, /^WBC 8,100/).timestamp, /入院時/);
  assert.match(find(c, /^WBC 10,200/).timestamp, /術後1日目/);
  assert.match(find(c, /^HbA1c 6\.0/).timestamp, /入院時/);
  assert.match(find(c, /自尿/).timestamp, /術後2日目/);
});
test('箇条書きの「* 」は本文に残さず、「* 入院後、…」を見出しとして切らない', () => {
  const c = cards('入院から手術までの経過\n* 入院後、キルシュナー牽引4kg実施\n* 足背動脈触知良好、左右差なし');
  assert.ok(find(c, /^入院後、キルシュナー/));
  assert.ok(!c.some(x => /^\*/.test(x.text)));
});
test('重点アセスメント：看護問題は主な欲求で詳しく述べ、ほかの欲求では参照にとどめる', () => {
  const plan = p => ({ problem: p, relatedNeeds: [4, 9] });
  assert.equal(app.focusHomeNeed(plan('転倒転落リスク状態')), 9);
  assert.equal(app.focusHomeNeed(plan('身体可動性障害')), 4);
  assert.equal(app.focusHomeNeed({ problem: '身体可動性障害', relatedNeeds: [] }), 4);
  assert.equal(app.focusHomeNeed({ problem: '術後呼吸器合併症リスク状態', relatedNeeds: [1, 9] }), 1);
});
