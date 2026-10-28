const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();
const card = (id, text, n, o) => Object.assign({ id, type: 'o', text, timestamp: '入院3日目', hendersonIds: [n], assessmentCols: { [n]: 'postadmission' } }, o || {});
const cpOf = (items, extra) => Object.assign({ id: 'p', title: 'T', sourceText: '', items, myAssessments: {}, carePlans: {}, missingChecks: {} }, extra || {});
const verdict = (items, n, ph = 'post', extra) => app.ruleSufficiencyFor(cpOf(items, extra))[n][ph].verdict;

test('labs: abnormal with name+unit -> problem finding for the mapped needs; normal -> no verdict alone; missing name/unit -> not parsed', () => {
  assert.strictEqual(verdict([card('a', 'Hb 7.8 g/dL', 1)], 1), 'unmet');
  assert.strictEqual(verdict([card('a', 'BUN 48 mg/dL', 3)], 3), 'unmet');
  assert.strictEqual(verdict([card('a', 'CRP 9.5 mg/dL', 9)], 9), 'unknown');   // v.197: CRP alone is not evidence of unsafe environment
  assert.strictEqual(verdict([card('a', '創部感染の疑い。CRP 9.5 mg/dL', 9)], 9), 'unmet');
  assert.strictEqual(verdict([card('a', 'CRP 9.5 mg/dL', 7)], 7), 'unknown');   // CRP alone does not show impaired temperature regulation
  assert.strictEqual(verdict([card('a', 'Hb 13.2 g/dL', 1)], 1), 'unknown');           // normal value alone: no verdict
  assert.strictEqual(verdict([card('a', 'BUN 14 mg/dL', 3)], 3), 'unknown');
  assert.strictEqual(Array.from(app.sufficiencyLabRules('Hb 7.8')).length, 0);          // no unit
  assert.strictEqual(Array.from(app.sufficiencyLabRules('7.8 g/dL')).length, 0);        // no name
  assert.strictEqual(Array.from(app.sufficiencyLabRules('Hb 13.2 g/dL')).filter(x => x.v === 'unmet').length, 0);
});

test('labs: a normal value is a supporting finding beside a recorded problem; a soft abnormal lab can be outweighed, an acute one cannot', () => {
  const t = app.sufficiencyPhaseText(cpOf([card('a', 'Hb 13.2 g/dL', 1), card('b', '湿性咳嗽あり', 1)]), 1, 'post');
  assert.match(t, /^判定：未充足／判定根拠：O-1（Hb 13\.2 g\/dL）は基準内であるが、O-2（湿性咳嗽あり）の記録があるため、呼吸は未充足である。$/);
  const comp = cpOf([card('a', 'BUN 48 mg/dL', 3), card('b', '排尿・排便は順調で症状なし', 3)]);
  assert.strictEqual(app.ruleSufficiencyFor(comp)[3].post.verdict, 'met');
  assert.notStrictEqual(verdict([card('a', 'CRP 9.5 mg/dL。症状なし', 7)], 7), 'met');
});

test('vitals: pulse and blood pressure use the app ranges; children use the child ranges', () => {
  assert.strictEqual(verdict([card('a', '脈拍 130回/分', 1)], 1), 'unmet');
  assert.strictEqual(verdict([card('a', '血圧 196/108 mmHg', 1)], 1), 'unmet');
  assert.strictEqual(verdict([card('a', '血圧 142/78 mmHg', 1)], 1), 'conflict');
  assert.strictEqual(verdict([card('a', '脈拍 72回/分、血圧 118/70 mmHg', 1)], 1), 'unknown');
  const child = { sourceText: '患児 4歳。' };
  assert.notStrictEqual(verdict([card('a', '脈拍 100回/分', 1)], 1, 'post', child), 'unmet');   // within the child range 90-120
  assert.strictEqual(verdict([card('a', '脈拍 100回/分', 1)], 1), 'unknown');                  // adult normal
  assert.strictEqual(verdict([card('a', 'Hb 7.8 g/dL', 1)], 1, 'post', child), 'unknown');   // adult lab ranges are not applied to children
});

test('high-risk combinations: risk only -> 判定保留, never 未充足; negated / history -> nothing; shown as a reference', () => {
  const combo = [card('a', 'フェンタニル使用中', 1), card('b', '傾眠あり', 1)];
  assert.strictEqual(verdict(combo, 1), 'conflict');
  assert.match(app.sufficiencyKnowledgeLine(cpOf(combo), 1, 'post'), /高リスクの組合せ＝オピオイドと呼吸数低下・傾眠/);
  assert.notStrictEqual(verdict([card('a', 'フェンタニル使用中', 1), card('b', '傾眠なし', 1)], 1), 'conflict');
  assert.strictEqual(verdict([card('a', 'フェンタニル使用中', 1)], 1), 'unknown');
});

test('knowledge rows: OP items not yet recorded are listed for 情報不足, outside the sentence; disease name alone gives no verdict', () => {
  const cp = cpOf([card('a', '糖尿病で通院中', 2, { fieldLabel: '既往歴' })]);
  assert.strictEqual(app.ruleSufficiencyFor(cp)[2].post.verdict, 'unknown');
  const checks = Array.from(app.sufficiencyKnowledgeChecks(cp, 2));
  assert.ok(checks.length > 0 && checks[0].points.length > 0 && checks[0].source);
  assert.ok(!app.sufficiencyPhaseText(cp, 2, 'post').includes(checks[0].points[0]));
  assert.match(app.sufficiencyKnowledgeLine(cp, 2, 'post'), /確認したい情報/);
  assert.match(app.sufficiencyJudgmentsText(cp), /知識の利用：/);
});

test('chains: upstream + downstream recorded -> a reference line only, no verdict change', () => {
  const items = [card('a', '創部痛あり', 4), card('b', '深呼吸・咳嗽の抑制がみられる', 1)];
  const cp = cpOf(items);
  const before = JSON.stringify(Object.keys(app.ruleSufficiencyFor(cpOf([card('b', '深呼吸・咳嗽の抑制がみられる', 1)]))[1].post).sort());
  assert.ok(before.length > 0);
  assert.match(app.sufficiencyKnowledgeLine(cp, 1, 'post'), /関連：.*→/);
  assert.ok(!/関連：/.test(app.sufficiencyKnowledgeLine(cpOf([card('b', '深呼吸・咳嗽の抑制がみられる', 1)]), 1, 'post')));
});

test('symptom words recorded in an untagged card inform the needs (判定保留 only); disease-general cards give nothing', () => {
  const sym = cpOf([card('a', '倦怠感が強い', 1)]);
  assert.strictEqual(app.ruleSufficiencyFor(sym)[5].post.verdict, 'conflict');
  const dis = cpOf([card('a', '倦怠感が強い', 1, { diseaseGeneral: true })]);
  assert.strictEqual(app.ruleSufficiencyFor(dis)[5].post.verdict, 'unknown');
  assert.strictEqual(app.ruleSufficiencyFor(cpOf([card('a', '倦怠感なし', 1)]))[5].post.verdict, 'unknown');
});

test('sentence still ends with the definite verdict and the standards appear as a separate line', () => {
  const cp = cpOf([card('a', 'Hb 7.8 g/dL', 1)]);
  assert.match(app.sufficiencyPhaseText(cp, 1, 'post'), /^判定：未充足／判定根拠：.*7\.8.*未充足である。$/);
  const t = app.sufficiencyJudgmentsText(cp);
  assert.match(t, /知識の利用：基準＝Hbの基準/);
  assert.ok(!/判定根拠：[^\n]*知識の利用/.test(t));
});
