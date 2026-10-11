'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();

const cp = () => ({
  title: '患者A',
  items: Array.from(app.classifyTextByRules(app.SAMPLE_TEXT)).map((c, k) => ({
    ...c, id: `item_${k}`, hendersonIds: Array.from(c.hendersonIds),
    assessmentCols: Object.fromEntries(Array.from(c.hendersonIds).map(h => [h, k < 6 ? 'preadmission' : 'postadmission']))
  })),
  diagnosisCandidates: [{ id: 'd1', name: '非効果的呼吸パターン', bodyHtml: '根拠：…' }, { id: 'd2', name: '高体温', bodyHtml: '' }],
  selectedDiagnosisIds: ['d1'],
  carePlanDiagnoses: ['非効果的呼吸パターン'],
  carePlanResult: '<b>■非効果的呼吸パターン</b><br>OP：呼吸数'
});

test('総合アセスメント表の印刷用文書：A4横で、操作ボタンを含まない', () => {
  const html = app.buildAssessmentPrintHtml(cp());
  assert.match(html, /@page \{ size: A4 landscape; \}/);
  assert.doesNotMatch(html, /<button|onclick=|setAssessmentCol|moveAssessmentCard|editItemText/);
  assert.match(html, /<th>入院前<\/th><th>入院後<\/th><th>不足情報<\/th>/);
  assert.doesNotMatch(html, /<th>未分類<\/th>/, '未分類のカードが無いときは未分類の列を出さない');
  assert.match(html, /<span class="lb lb-o">O-1<\/span>/);
  assert.match(html, /1\. 呼吸/);
  assert.match(html, /✓ 非効果的呼吸パターン/, '看護計画に使った診断に印');
  assert.match(html, /選んだ看護診断：<\/b>非効果的呼吸パターン/);
});

test('記録整理シート（PDF書き出し）：A4縦で、S/Oデータは表、操作ボタンを含まない', () => {
  const html = app.buildExportDocument(cp());
  assert.match(html, /@page \{ size: A4 portrait; \}/);
  assert.doesNotMatch(html, /<button|onclick=/);
  assert.match(html, /<h2>1\. 主観的情報（Sデータ）<\/h2><table>/);
  assert.match(html, /<th>日時<\/th><th>内容<\/th><th>タグ<\/th>/);
  assert.match(html, /ヘンダーソン14項目別アセスメント整理/);
});
