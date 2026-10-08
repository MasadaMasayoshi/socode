'use strict';
// AIなしの「充足・未充足の判定」と「看護計画の自動作成」の検証
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const text = [
  '診断名： 右大腿骨頸部骨折', '排泄： 尿器/便器使用（要介助）', '「体がべたべたして気持ちが悪い」', '皮膚のべたつきあり',
  '体温 36.8度 SpO2 98% 呼吸困難感訴えなし', '術後排便なし（最終術前日）', '疼痛： 体位変換時「5-6」', '「痛みのため昨晩は眠れなかった」',
  '右大腿骨人工骨頭置換術 全身麻酔', '術後肢位 股関節90度以上の屈曲禁止', '「体重かけても大丈夫なの？怖い」'
].join('\n');
const mk = () => ({ id: 'p', title: 't', sourceText: text, items: app.classifyTextByRules(text).map((x, i) => ({ id: 'i' + i, ...x, assessmentCols: {} })), referenceNotes: [] });
test('AIなしの充足・未充足：援助が必要な記録は未充足、否定（訴えなし）は充足、記録が無ければ判定できない', () => {
  const cp = mk();
  const r = app.judgeSufficiencyByRules(cp);
  assert.equal(Object.keys(r).length, 14);
  assert.ok(Object.values(r).some(v => v.all.verdict === 'unmet' && v.all.evidence.length));
  Object.values(r).forEach(v => { if (v.all.verdict !== 'unknown') assert.ok(v.all.evidence.length, '根拠のカードが入る'); });
  assert.equal(app.sufficiencyCardVerdict({ text: '呼吸困難感訴えなし' }, 1).v, 'met');
  assert.equal(app.sufficiencyCardVerdict({ text: '創部痛あり ペインスケール5' }, 5).v, 'unmet');
  assert.equal(app.sufficiencyCardVerdict({ text: '疼痛の訴えなし' }, 5).v, 'met');
});
