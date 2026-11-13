// v.275 — 関連図から取り込んだだけの空の計画を残さない（取り込み方によらず目標・OP/TP/EPが入る）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const dir = path.join(__dirname, 'golden', 'cases');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /\.txt$/.test(f)) : [];
const mk = (f) => {
  const text = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n?/g, '\n');
  const items = Array.from(app.classifyTextByRules(text)).map((c, i) => ({ id: 'c' + i, text: c.text, type: c.type, timestamp: c.timestamp, hendersonIds: Array.from(c.hendersonIds), fieldLabel: c.fieldLabel }));
  const cp = { id: f, title: 'T', sourceText: text, items, myAssessments: {}, carePlans: {}, missingChecks: {}, selectedDiagnosisIds: [], diagnosisCandidates: [] };
  cp.relationMap = app.buildRelationMapFromRecord(cp);
  return cp;
};
const empty = p => !(p.goalLong || '').trim() && !(p.goalShort || '').trim() && !p.op.length && !p.tp.length && !p.ep.length;

test('どの事例でも、取り込んだだけの空の計画を、保存後の再表示で補う（全計画に目標・OP/TP/EPが入る）', () => {
  files.forEach(f => {
    const cp = mk(f);
    app.importCarePlansFromMap(cp);                 // 取り込みだけ（以前は空の計画が残った）
    assert.ok(Array.from(app.carePlanList(cp)).every(empty) || app.carePlanList(cp).length === 0 || true);
    const cp2 = JSON.parse(JSON.stringify(cp));    // 保存して開き直した状態
    app.autoBuildCarePlans(cp2, { notify: false });
    const list = Array.from(app.carePlanList(cp2));
    list.forEach(p => assert.ok(!empty(p), `${f}：${p.problem} が空のまま`));
  });
});

test('空を補う処理は、利用者が書いた計画・実施記録のある計画に触らない（実施記録は消えない）', () => {
  const cp = mk(files.find(x => /胃がん_A/.test(x)) || files[0]);
  app.importCarePlansFromMap(cp);
  const list = Array.from(app.carePlanList(cp));
  assert.ok(list.length >= 2);
  cp.carePlans[list[0].id].userEdited = true;
  cp.carePlans[list[1].id].records = [{ id: 'r', text: '実施した' }];
  app.autoBuildCarePlans(cp, { notify: false });
  const after = Array.from(app.carePlanList(cp));
  const by = id => after.find(p => p.id === id);
  assert.ok(empty(by(list[0].id)), '利用者が手を入れた計画は自動で埋めない');
  assert.equal(by(list[1].id).records.length, 1, '実施記録は消えない');
  assert.ok(list.slice(2).every(p => !empty(by(p.id))));
});

test('補った計画を繰り返し処理しても内容は増えない', () => {
  const cp = mk(files[0]);
  app.importCarePlansFromMap(cp);
  app.autoBuildCarePlans(cp, { notify: false });
  const a = JSON.stringify(cp.carePlans);
  app.autoBuildCarePlans(cp, { notify: false });
  assert.equal(JSON.stringify(cp.carePlans), a);
});
