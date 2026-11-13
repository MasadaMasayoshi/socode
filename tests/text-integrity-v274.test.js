// v.274 — 切れた文の防止・正常値だけの充足判定の禁止・時期ごとの側面評価・根拠参照の線の区別
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const casesDir = path.join(__dirname, 'golden', 'cases');
const caseFiles = fs.existsSync(casesDir) ? fs.readdirSync(casesDir).filter(f => /\.txt$/.test(f)) : [];
const load = f => fs.readFileSync(path.join(casesDir, f), 'utf8').replace(/\r\n?/g, '\n');
const mkText = (text, id = 'p') => {
  const items = Array.from(app.classifyTextByRules(text)).map((c, i) => ({ id: 'c' + i, text: c.text, type: c.type, timestamp: c.timestamp, hendersonIds: Array.from(c.hendersonIds), fieldLabel: c.fieldLabel }));
  const cp = { id, title: 'T', sourceText: text, items, myAssessments: {}, carePlans: {}, missingChecks: {}, selectedDiagnosisIds: [], diagnosisCandidates: [] };
  cp.relationMap = app.buildRelationMapFromRecord(cp);
  return cp;
};
const verdictOf = (t, need) => { const r = app.ruleSufficiencyFor(mkText(`氏名：Z氏 60歳 男性\nO：${t}`))[need]; const v = r && (r.all || r.post || r.pre); return v ? v.verdict : 'unknown'; };

test('長い記録を切るときは、括弧・語の途中で切らず「…」も付けない。適切な切れ目がなければ全文を返す', () => {
  const t = '予定術式:腹腔鏡下胃全摘術(RY再建)+ 胆摘出術+リンパ節郭清(入院翌々日)';
  [20, 34, 44].forEach(n => {
    const r = app.clauseClip(t, n);
    assert.ok(!/…/.test(r));
    assert.equal((r.match(/[(（]/g) || []).length, (r.match(/[)）]/g) || []).length, `${n}字：括弧が閉じている`);
    assert.ok(!/[+＋]$/.test(r));
  });
  assert.equal(app.clauseClip('短い文', 10), '短い文');
  assert.equal(app.clauseClip('喫煙していたが、10年前に禁煙した', 6).endsWith('が'), false, '「〜が」で終わる形で切らない');
});

test('どの事例でも、関連図の項目名が「…」で終わらず、手術名の括弧が閉じている', () => {
  caseFiles.forEach(f => {
    const cp = mkText(load(f), f);
    cp.relationMap.nodes.forEach(n => {
      assert.ok(!/…$/.test(n.label), `${f}：${n.label}`);
      if (n.type === 'treatment' && /術/.test(n.label)) assert.equal((n.label.match(/[(（]/g) || []).length, (n.label.match(/[)）]/g) || []).length, `${f}：${n.label}`);
    });
  });
});

test('正常な体温・SpO2・呼吸数・Albの値だけでは、欲求を「充足」と判定しない（値は補助の根拠）', () => {
  assert.notEqual(verdictOf('体温36.5℃', 7), 'met');
  assert.notEqual(verdictOf('SpO2 98%', 1), 'met');
  assert.notEqual(verdictOf('呼吸数 16回/分', 1), 'met');
  assert.notEqual(verdictOf('Alb 4.2g/dL', 2), 'met');
  // 異常値は従来どおり判定に使う
  assert.equal(verdictOf('SpO2 88%', 1), 'unmet');
  assert.equal(verdictOf('体温39.0℃', 7), 'unmet');
});

test('術後は絶飲食のとき、術前の全量摂取を理由に「実際の摂取量は保たれている」と書かない', () => {
  const cp = mkText('氏名：Z氏 62歳 男性\n診断名：S状結腸がん\n手術：腹腔鏡下S状結腸切除術を全身麻酔で実施\n手術前日\nO：朝食は全量摂取。\n術後1日目\nO：食事は絶飲食。点滴で管理。\n');
  const d = app.buildFocusDraft(cp, 2);
  const all = `${d.focusAnalysis}\n${d.focusIntegration}`;
  assert.doesNotMatch(all, /実際の摂取量は保たれている/);
  assert.notEqual(app.ruleSufficiencyFor(cp)[2].postop.verdict, 'met');
});

test('関連図の一覧・書き出しで、検査値から問題への線は「根拠として参照」と書き、原因の矢印にしない', () => {
  const cp = mkText(load('胃がん_A氏58歳.txt'), 'p14');
  const t = app.relationMapExportText(cp);
  const alb = t.split('\n').filter(l => /流れ\d+：（?Alb/.test(l));
  assert.ok(alb.length > 0);
  alb.forEach(l => assert.match(l, /―根拠として参照→/, 'Albから問題への線は根拠参照として書く'));
});
