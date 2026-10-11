'use strict';

//

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const app = loadApp();
const { detectAdmissionPhaseSignal, inferAssessmentColumn, groupClinicalPhrasesWithTimestamps } = app;

test('detectAdmissionPhaseSignal: 空文字・null・undefinedは手がかり無し（null）', () => {
  assert.equal(detectAdmissionPhaseSignal(''), null);
  assert.equal(detectAdmissionPhaseSignal(null), null);
  assert.equal(detectAdmissionPhaseSignal(undefined), null);
  assert.equal(detectAdmissionPhaseSignal('   '), null);
});

test('detectAdmissionPhaseSignal: 「入院前」は明示的に入院前へ戻す強い手がかり', () => {
  assert.equal(detectAdmissionPhaseSignal('入院前'), 'preadmission');
  assert.equal(detectAdmissionPhaseSignal('【入院前の生活歴】'), 'preadmission');
});

test('detectAdmissionPhaseSignal: 「入院」「実習」「術前」「術中」「術後」「◯日目」「検査データ」は入院後への切り替わりの手がかり（利用者からの報告事例）', () => {
  ['入院', '実習', '術前', '術中', '術後', '3日目', '検査データ', '＜実習1日目　9/10（水）＞'].forEach(text => {
    assert.equal(detectAdmissionPhaseSignal(text), 'postadmission', `「${text}」は入院後の手がかりのはず`);
  });
});

test('detectAdmissionPhaseSignal: 「入院前」は「入院」を含んでいても入院後より優先される（優先順位の確認）', () => {

  assert.equal(detectAdmissionPhaseSignal('入院前の生活歴について本人・家族に確認'), 'preadmission');
});

test('detectAdmissionPhaseSignal: どちらの手がかりも無い普通の文章はnull（呼び出し側は状態を変えない）', () => {
  assert.equal(detectAdmissionPhaseSignal('既往歴'), null);
  assert.equal(detectAdmissionPhaseSignal('WBC(白血球数) 5880 /μL'), null);
  assert.equal(detectAdmissionPhaseSignal('A氏・58歳、男性'), null);
});

test('inferAssessmentColumn: タイムスタンプ・見出しラベルのどちらからも判断できない場合、admissionPhaseの引き読みをフォールバックとして使う（利用者からの提案）', () => {
  assert.equal(inferAssessmentColumn(null, '', 'preadmission'), 'preadmission');
  assert.equal(inferAssessmentColumn(null, '', 'postadmission'), 'postadmission');
  assert.equal(inferAssessmentColumn(null, '', undefined), null, 'admissionPhaseすら無ければ引き続きnull（未分類のまま）');
  assert.equal(inferAssessmentColumn(null, '', null), null);
});

test('inferAssessmentColumn: タイムスタンプ・見出しラベルの明確な手がかりは、admissionPhaseより優先される（回帰確認）', () => {

  assert.equal(inferAssessmentColumn('治療方針', '', 'preadmission'), 'postadmission');

  assert.equal(inferAssessmentColumn(null, '入院前', 'postadmission'), 'preadmission');
});

test('groupClinicalPhrasesWithTimestamps: 「＜実習1日目…＞」を通過する前と後で、各カードのadmissionPhaseが入院前→入院後に自動的に切り替わる（利用者からの報告事例そのもの）', () => {
  const text = [
    'A氏・58歳、男性',
    '＜実習1日目　9/10（水）＞',
    'WBC(白血球数) 5880 /μL'
  ].join('\n');
  const extracted = groupClinicalPhrasesWithTimestamps(text);

  const beforeItem = extracted.find(e => e.text.includes('58歳'));
  const afterItem = extracted.find(e => e.text.includes('5880'));

  assert.ok(beforeItem, '「A氏・58歳、男性」のカードが抽出されるはず');
  assert.ok(afterItem, '「WBC(白血球数) 5880 /μL」のカードが抽出されるはず');
  assert.equal(beforeItem.admissionPhase, 'preadmission', '見出しキーワードに到達する前は入院前のまま');
  assert.equal(afterItem.admissionPhase, 'postadmission', '「実習1日目」の見出しを通過した後は入院後に切り替わる');
});

test('groupClinicalPhrasesWithTimestamps: 見出しキーワードが一度も現れない場合は、既定値の入院前のまますべてのカードに付与される（回帰確認）', () => {
  const text = ['氏名：A氏', '性別：男性', '生活歴：喫煙歴なし'].join('\n');
  const extracted = groupClinicalPhrasesWithTimestamps(text);
  assert.ok(extracted.length > 0);
  extracted.forEach(item => {
    assert.equal(item.admissionPhase, 'preadmission');
  });
});

test('groupClinicalPhrasesWithTimestamps: 「【入院当日】」「【入院2日目】」のような全角鉤括弧の入院日数見出しも時系列マーカーとして認識され、見出し語だけの意味の無いカードを作らない（利用者からの報告事例）', () => {
  const text = [
    '【入院当日】',
    '救急搬送され入院。血圧150/90mmHg。',
    '【入院2日目】',
    '血圧140/85mmHgに落ち着く。'
  ].join('\n');
  const extracted = groupClinicalPhrasesWithTimestamps(text);
  assert.ok(!extracted.some(e => e.text.includes('【入院当日】') || e.text.includes('【入院2日目】')),
    '見出し行自体はカード化されないはず');
  const bp = extracted.find(e => e.text.includes('血圧150/90mmHg'));
  assert.ok(bp, '見出し後の内容は引き続きカードとして抽出されるはず');
  assert.equal(bp.timestamp, '入院当日', '見出しの内容がその後のカードのタイムスタンプに反映されるはず');
  assert.equal(bp.admissionPhase, 'postadmission', '「入院」を含む見出しを通過した後は入院後になるはず');
  const bp2 = extracted.find(e => e.text.includes('血圧140/85mmHg'));
  assert.ok(bp2);
  assert.equal(bp2.timestamp, '入院2日目');
});
