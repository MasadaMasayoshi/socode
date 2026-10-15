'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const good = { title: '皮膚症状の知識', entries: [
  { kind: 'symptom_need', pattern: 'ブルーライト過敏', needs: [8, 9], source: '看護学テキスト' },
  { kind: 'bridge', from: 'ステロイド', to: '感染', step: '免疫が抑えられ感染しやすくなる', source: '薬理学テキスト' }] };
test('valid pack passes and each entry keeps its source', () => {
  const r = app.validateKnowledgePack(JSON.stringify(good));
  assert.ok(r.ok && r.entries.length === 2 && r.entries.every(e => e.source));
});
test('entries without source, patient-specific or unsafe patterns are rejected', () => {
  const bad = (e) => app.validateKnowledgePack({ title: 't', entries: [e] });
  assert.ok(!bad({ kind: 'symptom_need', pattern: '発熱', needs: [7] }).ok);
  assert.ok(!bad({ kind: 'symptom_need', pattern: '28歳の女性', needs: [7], source: 's' }).ok);
  assert.ok(!bad({ kind: 'symptom_need', pattern: '(a+)+', needs: [7], source: 's' }).ok);
  assert.ok(!bad({ kind: 'symptom_need', pattern: '発熱', needs: [0, 15], source: 's' }).ok);
  assert.ok(!app.validateKnowledgePack('{broken').ok);
});
test('applying a pack changes classification and is idempotent', () => {
  const before = Array.from(app.classifyTextByRules('全身症状\n発熱、ブルーライト過敏、疲れやすい、体重減少など')).find(c => /ブルーライト/.test(c.text));
  const res = app.validateKnowledgePack(good);
  const n1 = app.applyKnowledgePacks([res.pack]);
  const n2 = app.applyKnowledgePacks([res.pack]);
  const after = Array.from(app.classifyTextByRules('全身症状\n発熱、ブルーライト過敏、疲れやすい、体重減少など')).find(c => /ブルーライト/.test(c.text));
  assert.ok(n1 >= 1 && n2 === 0);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(after.hendersonIds)), [8, 9]);
  assert.ok(!before || JSON.stringify(before.hendersonIds) !== '[8,9]');
});
