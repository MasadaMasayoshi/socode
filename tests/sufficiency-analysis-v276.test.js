// v.276 — 欲求の充足状況の「状況の分析」：直接関係する事実の選択 → 時期ごとの比較 → 制限と不足の区別。判定の文は変えない
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const dir = path.join(__dirname, 'golden', 'cases');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /\.txt$/.test(f)) : [];
const mkText = (text) => {
  const items = Array.from(app.classifyTextByRules(text)).map((c, i) => ({ id: 'c' + i, text: c.text, type: c.type, timestamp: c.timestamp, hendersonIds: Array.from(c.hendersonIds), fieldLabel: c.fieldLabel }));
  return { id: 'p', title: 'T', sourceText: text, items, myAssessments: {}, carePlans: {}, missingChecks: {}, selectedDiagnosisIds: [], diagnosisCandidates: [] };
};
const head = '氏名：Z氏 62歳 男性\n診断名：S状結腸がん\n手術：腹腔鏡下S状結腸切除術を全身麻酔で実施\n';
const balanced = t => ['()', '（）', '「」', '『』'].every(([o, c]) => (t.split(o).length - 1) === (t.split(c).length - 1));

test('どの事例・欲求・時期でも、分析の文章が壊れない（undefinedや閉じていない括弧が出ない）', () => {
  files.forEach(f => {
    const cp = mkText(fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n?/g, '\n'));
    app.sufficiencyUiPhases(cp).forEach(ph => { for (let n = 1; n <= 14; n++) {
      const t = app.sufficiencyAnalysis(cp, n, ph.key);
      assert.doesNotMatch(t, /undefined|\[object|NaN/, `${f} ${n} ${ph.key}`);
      assert.ok(balanced(t), `${f} ${n} ${ph.key}: ${t}`);
    } });
  });
});

test('術前と術後を分けて書き、術後の絶飲食は「治療上の制限」として、不足とは区別する', () => {
  const cp = mkText(head + '入院前\nO：食生活：朝食は毎日全量食べる\n手術前日\nO：朝食全量摂取\n術後1日目\nO：手術当日術後指示：【食事】絶飲食\n');
  const t = app.sufficiencyAnalysis(cp, 2, 'postop');
  assert.match(t, /入院前は、/);
  assert.match(t, /術前は、/);
  assert.match(t, /術後は、治療上の制限として/);
  assert.match(t, /制限が解除された後の状況をみて判断する/);
  assert.doesNotMatch(t.split('\n').filter(x => /^術後は/.test(x)).join(''), /朝食全量摂取/, '術前の摂取を術後の状態として書かない');
});

test('「制限はない」「普段は〜」を、治療上の制限・術後の事実として扱わない', () => {
  const cp = mkText('氏名：Y氏 10歳 男性\n診断名：気管支喘息\n入院日\nO：普段は学校生活に大きな制限はないが、体育の持久走後に咳が出ることがある\nO：両肺野に呼気性喘鳴あり\n');
  const t = app.sufficiencyAnalysis(cp, 1, 'post');
  assert.doesNotMatch(t, /治療上の制限/);
  assert.match(t, /入院前は、普段は学校生活/);
  assert.match(t, /入院後は、.*喘鳴/);
});

test('環境の分析に、保険・年齢性別・飲酒喫煙などの無関係な情報を入れない', () => {
  const cp = mkText('氏名：A氏 58歳 男性\n保険：社会保険\n嗜好品：喫煙20本/日\n診断名：胃がん\n手術：腹腔鏡下胃全摘術を全身麻酔で実施\n術後1日目\nO：左横隔膜下ドレーン留置、ベッド柵あり\n');
  const t = ['pre', 'preop', 'postop'].map(k => app.sufficiencyAnalysis(cp, 9, k)).join('\n');
  assert.doesNotMatch(t, /社会保険|58歳|喫煙/);
  assert.match(t, /ドレーン/);
});

test('書き出しに「状況の分析」が入り、判定の文は従来のまま残る', () => {
  const cp = mkText(head + '手術前日\nO：朝食全量摂取\n術後1日目\nO：手術当日術後指示：【食事】絶飲食\n');
  app.ensureMyAssessment(cp, 2).interpretation = '術後は絶飲食';
  const out = app.buildMyAssessmentsText(cp);
  assert.match(out, /状況の分析：/);
  assert.match(out, /術後：.*食事は判定保留。/);
});
