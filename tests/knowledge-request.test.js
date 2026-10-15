'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers');
const app = loadApp();
test('the app asks for knowledge it lacks: untagged words and unknown diagnoses', () => {
  const cp = { title: 'T', items: [
    { id: '1', type: 'o', text: '心外膜炎の既往', hendersonIds: [] },
    { id: '2', type: 'o', text: '診断名: 成人スチル病', fieldLabel: '診断名', hendersonIds: [] },
    { id: '3', type: 'o', text: '氏名: 山田花子', fieldLabel: '氏名', hendersonIds: [] }] };
  const r = app.buildKnowledgeRequests(cp);
  assert.ok(r.some(x => x.kind === 'tag' && /心外膜炎/.test(x.term)));
  assert.ok(r.some(x => x.kind === 'diagnosis' && /スチル病/.test(x.term)));
  assert.ok(!r.some(x => /山田/.test(x.term)));
  const text = app.knowledgeRequestText(cp, r);
  assert.ok(/回答：/.test(text) && /出典：/.test(text) && !/山田/.test(text));
});
test('a well-covered patient produces no requests', () => {
  assert.strictEqual(app.buildKnowledgeRequests({ items: [{ id: '1', type: 'o', text: '発熱あり', hendersonIds: [7] }] }).length, 0);
});
