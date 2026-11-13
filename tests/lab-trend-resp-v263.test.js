const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();
const card = (id, text, ts, type) => ({ id, text, type: type || 'o', timestamp: ts, hendersonIds: [1] });
const keys = t => t.rows.map(r => r.key).join(',');

test('trend: spirometry values are rows in a 呼吸機能 group with a guide reference and low flags', () => {
  const t = app.buildLabTrendTable([card('a', '呼吸機能検査：1秒率62%、%肺活量78%。', '10/5 10:00'), card('b', '1秒率 68%、%肺活量 82%', '10/8 10:00')], { includeVitals: true });
  const f = t.rows.find(r => r.key === '1秒率'), v = t.rows.find(r => r.key === '%肺活量');
  assert.strictEqual(f.group, '呼吸機能'); assert.strictEqual(f.refIsGuide, true); assert.match(f.ref, /70/);
  assert.strictEqual(f.cells['10/5 10:00'][0].flag, 'low'); assert.strictEqual(f.cells['10/8 10:00'][0].flag, 'low');
  assert.strictEqual(v.cells['10/8 10:00'][0].flag, '');
  assert.strictEqual(app.buildLabTrendTable([card('a', '1秒率 62%', '10/5 10:00')], { includeVitals: false }).rows.length, 1);
});

test('trend: vitals written inside a sentence are read; trailing prose does not drop them', () => {
  const t = app.buildLabTrendTable([
    card('a', '入院時のバイタルは体温36.5℃、血圧120/70mmHg、脈拍70回/分、SpO2 98%（室内気）。', '10/5 9:00'),
    card('b', '呼吸数 24回/分、SpO2 91%（室内気）で息切れあり', '10/6 9:00')], { includeVitals: true });
  assert.strictEqual(keys(t), '体温,脈拍,血圧,呼吸数,SpO2');
  assert.strictEqual(t.rows.find(r => r.key === 'SpO2').cells['10/6 9:00'][0].flag, 'low');
  assert.strictEqual(keys(app.buildLabTrendTable([card('a', '入院時、体温36.5℃、脈拍70回/分', '10/5 9:00')], { includeVitals: false })), '');
});

test('trend: targets, thresholds and patient quotes are not measurements', () => {
  const t = app.buildLabTrendTable([
    card('a', 'SpO2 95%以上を維持する。体温37.5℃以上で報告。', '10/5 9:00'),
    card('b', '「息が苦しい。SpO2は90%くらいかな」', '10/5 9:00', 's'),
    card('c', '体温36.8℃', '10/5 9:00')], { includeVitals: true });
  assert.strictEqual(keys(t), '体温');
  assert.strictEqual(t.rows[0].cells['10/5 9:00'].length, 1);
});

test('trend: lab values stay even with words glued to the unit; a course note after an intervention is not a measurement', () => {
  const t = app.buildLabTrendTable([card('a', 'CRP 3.8mg/dLで基準値を超えている', '10/5 9:00'), card('b', 'Cr 1.3 mg/dL', '10/5 9:00'),
    card('c', '酸素2L鼻カニューレ開始し、SpO2 94%に上昇。', '10/5 9:00')], { includeVitals: true });
  assert.strictEqual(keys(t), 'CRP,Cre'.split(',').sort((x, y) => keys(t).indexOf(x) - keys(t).indexOf(y)).join(','));
  assert.ok(!keys(t).includes('SpO2'));
});
