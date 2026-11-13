// v.273 — 古い版の自動作成データを、新しい版へ安全に更新する。
// 古い保存データ（旧名・旧文・生成版なし）を作って、関連図の作り直し→看護計画の更新までの動きと、手編集・削除済み・実施記録つきの計画の保護を確かめる。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./app-helpers');
const app = loadApp();

const casesDir = path.join(__dirname, 'golden', 'cases');
const load = f => fs.readFileSync(path.join(casesDir, f), 'utf8').replace(/\r\n?/g, '\n');
const mk = (f) => {
  const text = load(f);
  const items = Array.from(app.classifyTextByRules(text)).map((c, i) => ({ id: 'c' + i, text: c.text, type: c.type, timestamp: c.timestamp, hendersonIds: Array.from(c.hendersonIds), fieldLabel: c.fieldLabel }));
  const cp = { id: 'p', title: 'T', sourceText: text, items, myAssessments: {}, carePlans: {}, missingChecks: {}, selectedDiagnosisIds: [], diagnosisCandidates: [] };
  cp.relationMap = app.buildRelationMapFromRecord(cp);
  return cp;
};
const plans = cp => Array.from(app.carePlanList(cp));
const flat = t => String(t).normalize('NFKC').replace(/[\s()（）]/g, '');
const probs = map => map.nodes.filter(n => n.type === 'nursing_problem').map(n => flat(n.label.replace(/（候補）$/, '')));
// 古い版で保存された状態を模す: 生成版なし、名前と文が旧版のもの。
const makeStale = cp => {
  plans(cp).forEach(p => { delete p.genVersion; });
  const pain = plans(cp).find(p => /疼痛/.test(p.problem));
  if (pain) { pain.problem = '急性疼痛（手術創部の侵襲）'; pain.goalShort = '3日後までにNRS3以下'; pain.goalLong = '退院までに、創部痛がNRS3以下で'; pain.genKey = 'old'; }
  return pain;
};
const CASE = '胃がん_A氏58歳.txt';

test('関連図を作り直すと、自動作成の古い計画の名前に引きずられず、新しく作った場合と同じ看護問題になる', () => {
  const fresh = mk(CASE);
  app.buildCarePlansByRules(fresh);
  const want = probs(fresh.relationMap).sort();
  const stale = mk(CASE);
  app.buildCarePlansByRules(stale);
  makeStale(stale);
  stale.relationMap = app.buildRelationMapFromRecord(stale);
  assert.deepEqual(probs(stale.relationMap).sort(), want, '作り直した関連図が新規作成と同じ');
  assert.ok(probs(stale.relationMap).some(l => /静脈血栓塞栓症/.test(l)), '新しい看護問題が落ちない');
  assert.ok(!probs(stale.relationMap).some(l => /手術創部の侵襲/.test(l)), '古い名前が残らない');
});

test('古い自動作成の計画は、次に計画を作る処理で新しい内容に更新され、更新前の内容が残る', () => {
  const cp = mk(CASE);
  app.buildCarePlansByRules(cp);
  const n0 = plans(cp).length;
  makeStale(cp);
  cp.relationMap = app.buildRelationMapFromRecord(cp);
  const r = app.buildCarePlansByRules(cp, { skipDeleted: true });
  assert.ok(r.updated >= 1, '更新された');
  const p = plans(cp).find(x => /疼痛/.test(x.problem));
  assert.match(p.problem, /手術侵襲に関連/);
  assert.doesNotMatch(p.goalShort + p.goalLong, /3日後までに/);
  assert.equal(p.genVersion, app.CP_GEN_VERSION);
  assert.ok(p.regenBackups && p.regenBackups.length === 1 && /手術創部の侵襲/.test(p.regenBackups[0].problem) && /3日後まで/.test(p.regenBackups[0].goalShort), '更新前の内容が残る');
  assert.equal(plans(cp).length, n0, '計画が増えたり減ったりしない');
  // 関連図と計画の番号が一致する
  const mp = cp.relationMap.nodes.filter(n => n.type === 'nursing_problem');
  plans(cp).forEach((pl, i) => { const n = mp.find(x => flat(x.label.replace(/（候補）$/, '')) === flat(pl.problem)); if (n) assert.equal(n.priority, i + 1); });
});

test('同じ処理を繰り返しても、計画も更新前の記録も増えない', () => {
  const cp = mk(CASE);
  app.buildCarePlansByRules(cp);
  makeStale(cp);
  cp.relationMap = app.buildRelationMapFromRecord(cp);
  app.buildCarePlansByRules(cp, { skipDeleted: true });
  const snap = JSON.stringify(cp.carePlans);
  const r2 = app.buildCarePlansByRules(cp, { skipDeleted: true });
  const r3 = app.buildCarePlansByRules(cp, { skipDeleted: true });
  assert.equal(r2.updated, 0); assert.equal(r3.updated, 0);
  assert.equal(r2.fresh.length, 0);
  assert.equal(plans(cp).length, plans(cp).filter(p => p).length);
  assert.equal(JSON.stringify(cp.carePlans), snap, '2回目以降は何も変わらない');
});

test('手で編集した計画・看護問題名を打ち直した計画・実施記録のある計画は、書き換えない', () => {
  const cp = mk(CASE);
  app.buildCarePlansByRules(cp);
  makeStale(cp);
  const L = plans(cp);
  const edited = L.find(p => /縫合不全/.test(p.problem)); edited.userEdited = true; edited.goalShort = '利用者が書いた短期目標'; edited.op = ['利用者が書いたOP'];
  const renamed = L.find(p => /出血/.test(p.problem)); renamed.problem = '術後の出血が心配な状態'; renamed.problemUserSet = true;
  const rec = L.find(p => /血栓/.test(p.problem)); app.addCareRecord(cp, rec.id, { at: new Date().toISOString(), note: '実施した', achievement: '' });
  const body = p => JSON.stringify([p.problem, p.goalShort, p.goalLong, p.op, p.tp, p.ep]);
  const before = [edited, rec].map(body);
  cp.relationMap = app.buildRelationMapFromRecord(cp);
  app.buildCarePlansByRules(cp, { skipDeleted: true });
  assert.deepEqual([edited, rec].map(p => body(app.getCarePlan(cp, p.id))), before, '編集済み・実施記録つきの計画は一字も変わらない');
  assert.equal(app.getCarePlan(cp, renamed.id).problem, '術後の出血が心配な状態', '打ち直した名前は元に戻されない');
  assert.ok(!(app.getCarePlan(cp, edited.id).regenBackups || []).length && !(app.getCarePlan(cp, rec.id).regenBackups || []).length, '更新対象にならない');
  // 打ち直した看護問題名は関連図にも反映される
  assert.ok(probs(cp.relationMap).some(l => /術後の出血が心配な状態/.test(l)));
});

test('削除した看護問題は、更新・関連図の作り直しで復活しない', () => {
  const cp = mk(CASE);
  app.buildCarePlansByRules(cp);
  makeStale(cp);
  const target = plans(cp).find(p => /感染リスク状態/.test(p.problem));
  app.deleteCarePlan(cp, target.id);
  cp.relationMap = app.buildRelationMapFromRecord(cp);
  app.buildCarePlansByRules(cp, { skipDeleted: true });
  app.buildCarePlansByRules(cp, { skipDeleted: true });
  assert.ok(!plans(cp).some(p => /感染リスク状態/.test(p.problem)));
});

test('他の事例（心不全・脳梗塞・大腿骨）でも、古い版の計画の更新で計画数・番号・手編集が保たれる', () => {
  ['心不全_B氏82歳_架空.txt', '脳梗塞_A氏75歳.txt', '学生記録6_大腿骨頸部骨折_Day形式.txt'].filter(f => fs.existsSync(path.join(casesDir, f))).forEach(f => {
    const cp = mk(f);
    app.buildCarePlansByRules(cp);
    const names0 = plans(cp).map(p => p.problem).length;
    plans(cp).forEach(p => { delete p.genVersion; });
    cp.relationMap = app.buildRelationMapFromRecord(cp);
    const r = app.buildCarePlansByRules(cp, { skipDeleted: true });
    assert.equal(plans(cp).length, names0, `${f}：計画数が変わらない`);
    assert.ok(r.updated >= 1, `${f}：更新される`);
    const nums = cp.relationMap.nodes.filter(n => n.type === 'nursing_problem').map(n => n.priority);
    assert.equal(new Set(nums).size, nums.length, `${f}：番号が重複しない`);
    const again = app.buildCarePlansByRules(cp, { skipDeleted: true });
    assert.equal(again.updated, 0, `${f}：繰り返しても更新されない`);
  });
});
