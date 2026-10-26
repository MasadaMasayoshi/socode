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
