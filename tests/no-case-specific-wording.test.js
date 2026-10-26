'use strict';
// Owner rule (generalization): rules in js/ must not be keyed to one patient's wording (names, one-off items, event names).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, '..', 'js');
const BANNED = [/色紙/, /県大会/, /グルカゴン注射、退院/, /Aさん[はがの]/, /患者23/, /8月12日/];
test('js/ のルールに特定の患者の言い回しが入っていない', () => {
  const hits = [];
  fs.readdirSync(dir).filter(f => /^\d\d-.*\.js$/.test(f)).forEach(f => {
    fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*\/\//.test(line)) return;
      BANNED.forEach(re => { if (re.test(line)) hits.push(`${f}:${i + 1} ${re}`); });
    });
  });
  assert.deepEqual(hits, []);
});
test('修正依頼・知識リクエストの指示文に汎用化の手順が入っている', () => {
  const ex = fs.readFileSync(path.join(dir, '06-export.js'), 'utf8');
  const cp = fs.readFileSync(path.join(dir, '12-missing-checks-and-care-plan.js'), 'utf8');
  assert.ok(/3-2\. Generalization check/.test(ex) && /3-3\. Intent of merges/.test(ex));
  assert.ok(/\[Generalization\]/.test(cp));
});

test('知識リクエストの診断候補は、既往歴の文章ではなく病名になる（年齢の語尾が残らない・否定は除く）', () => {
  const { loadApp } = require('./app-helpers.js');
  const a = loadApp();
  const mk = (id, text) => ({ id, text, fieldLabel: '既往歴', type: 'o', hendersonIds: [2] });
  const terms = a.buildKnowledgeRequests({ items: [mk(1, '3歳時に肺炎で1週間入院。'), mk(2, '10歳より気管支喘息。'), mk(3, '特記すべき入院・治療歴なし')], sourceText: '' }).map(r => r.term);
  assert.ok(terms.some(t => /喘息/.test(t)));
  assert.ok(!terms.some(t => /^時|^より|なし/.test(t)));
});

test('研究から追加した知識の行：成人の喘息の行は小児喘息に出ない／各行が単独で発動する', () => {
  const { loadApp } = require('./app-helpers.js');
  const a = loadApp();
  const keys = p => a.cpKnowledgeSuggestions({ problem: p, op: [], tp: [], ep: [] }).map(x => x.row);
  assert.ok(keys('気管支喘息').includes('asthma-adult'));
  assert.ok(!keys('小児喘息').includes('asthma-adult'));
  assert.ok(keys('心房細動').includes('af') && keys('化学療法').includes('chemo') && keys('敗血症').includes('sepsis'));
});

test('検査値は共通基準範囲＋背景の条件で解釈され、薬のクラスは観察項目だけを返す', () => {
  const { loadApp } = require('./app-helpers.js');
  const a = loadApp();
  const n = a.labBackgroundNotes({ sourceText: '60歳女性。肝硬変。Hb 9.5 Alb 2.8', items: [] });
  assert.ok(n.some(x => /Hb/.test(x) && /11\.6/.test(x)) && n.some(x => /Alb/.test(x) && /合成能/.test(x)));
  assert.equal(a.labBackgroundNotes({ sourceText: '30歳男性。Hb 15', items: [] }).length, 0);
  const small = a.labBackgroundNotes({ sourceText: '5歳男児。Hb 9', items: [] });
  assert.ok(small.every(x => /年齢別/.test(x)));
  const d = a.drugClassNotes({ sourceText: '利尿薬を内服', items: [] });
  assert.ok(d.length === 1 && /観察/.test(d[0]) && !/mg|用量/.test(d[0]));
});
