const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();
const MARK = '分類前文章の未使用記録（判断基準の追加候補）';
const card = (id, text, n, o) => Object.assign({ id, type: 'o', text, timestamp: '入院3日目', hendersonIds: [n], assessmentCols: { [n]: 'postadmission' } }, o || {});
const cpOf = (items, src, extra) => Object.assign({ id: 'p', title: 'T', sourceText: src, items, myAssessments: {}, carePlans: {}, missingChecks: {} }, extra || {});
const cand = cp => app.sufficiencyJudgmentsText(cp).split('\n').filter(l => l.includes(MARK));
const SENT_A = '夜間は排尿のため3回起きて眠れていない。';
const SENT_B = '食事は半分ほど残し、食欲がないと話す。';

test('a: uncited source sentence with a recorded cue yields a candidate line in the fixed format', () => {
  const items = [card('a', SENT_B, 2)];
  const lines = cand(cpOf(items, SENT_B + SENT_A));
  assert.ok(lines.length > 0);
  assert.ok(lines.every(l => /^　　・.+：.+｜関係しそうな欲求：\d+\. .+｜状態：.+$/.test(l)));
  assert.ok(lines.some(l => l.includes('排尿') || l.includes('眠れ')));
});

test('b: a sentence already cited as evidence is not listed for that need', () => {
  const items = [card('a', SENT_B, 2)];
  const lines = cand(cpOf(items, SENT_B));
  assert.ok(!lines.some(l => l.includes('食欲がない') && l.includes('関係しそうな欲求：2.')));
});

test('c: no source text -> no candidate lines', () => {
  assert.strictEqual(cand(cpOf([card('a', SENT_B, 2)], '')).length, 0);
});

test('d: verdict sentences unchanged by the source text and still end with a verdict phrase', () => {
  const items = [card('a', SENT_B, 2), card('b', 'Hb 7.8 g/dL', 1)];
  const a = cpOf(items, ''), b = cpOf(items, SENT_B + SENT_A);
  for (const n of [1, 2]) {
    const x = app.sufficiencyPhaseText(a, n, 'post'), y = app.sufficiencyPhaseText(b, n, 'post');
    assert.strictEqual(x, y);
    assert.match(String(y).replace(/[。\s]+$/, ''), /(充足している|未充足である|判定保留|情報不足)$/);
  }
  const t = app.sufficiencyJudgmentsText(b).split('\n').filter(l => /判定根拠：/.test(l)).map(l => l.replace(/^.*判定根拠：/, '').replace(/｜.*$/, ''));
  assert.ok(t.length > 0);
  assert.ok(t.every(l => /(充足している|未充足である|判定保留|情報不足)。?$/.test(l)));
});

test('e: names are masked in candidate lines', () => {
  const src = '氏名：山田 太郎\n山田 太郎さんは夜間に排尿のため3回起きて眠れていない。';
  const cp = cpOf([card('a', SENT_B, 2)], src);
  const out = app.sufficiencyJudgmentsText(cp);
  const lines = out.split('\n').filter(l => l.includes(MARK));
  assert.ok(lines.length > 0);
  assert.ok(!lines.some(l => l.includes('太郎')));
});

test('f: output is bounded (5 per need/phase, 40 total, then omitted count)', () => {
  const src = Array.from({ length: 80 }, (_, i) => `夜間${i}回目の排尿で起きて眠れず食欲もなく${i}日目。`).join('');
  const out = app.sufficiencyJudgmentsText(cpOf([card('a', SENT_B, 2)], src));
  const lines = out.split('\n').filter(l => l.includes(MARK) && l.includes('｜'));
  assert.ok(lines.length <= 40);
  const perNeed = {};
  lines.forEach(l => { const k = l.match(/関係しそうな欲求：(\d+)\./)[1]; perNeed[k] = (perNeed[k] || 0) + 1; });
  assert.ok(Object.values(perNeed).every(v => v <= 5 * 3));
  assert.match(out, /他\d+件省略/);
});
