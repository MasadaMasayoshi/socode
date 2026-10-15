const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();

test('SLE disease-list symptoms get Henderson items from the ingested knowledge', () => {
  const ids = t => JSON.stringify(app.diseaseSymptomNeeds ? app.diseaseSymptomNeeds(t) : null);
  assert.ok(app.diseaseSymptomNeeds, 'diseaseSymptomNeeds is exported');
  assert.strictEqual(ids('心外膜炎'), '[1,4,5,9]');
  assert.strictEqual(ids('貧血'), '[1,4,5,9,12]');
  assert.strictEqual(ids('光線過敏症'), '[8,9,14]');
  assert.strictEqual(ids('レイノー現象'), '[4,8,9]');
  assert.ok(JSON.parse(ids('神経')).includes(10));
  assert.strictEqual(ids('特記事項なし'), '[]');
});

test('relation-map bridge rules cover the SLE mechanisms', () => {
  const rules = app.RM_BRIDGE_RULES;
  const has = (a, b) => rules.some(r => r.s.test(a) && r.t.test(b));
  assert.ok(has('紫外線曝露', '紅斑'));
  assert.ok(has('免疫抑制薬', '感染リスク'));
  assert.ok(has('蛋白尿', '浮腫'));
  assert.ok(has('胸膜炎', '息切れ'));
  assert.ok(has('心外膜炎', 'タンポナーデ'));
  assert.ok(has('貧血', '息切れ'));
  assert.ok(has('抗リン脂質抗体', '血栓'));
});
