'use strict';
// 「入院前／入院後」の自動判定（利用者からの要望）の検証。
//
// 【背景】利用者からの要望（原文の要旨）：
//   ・最初は「入院前」と記憶して処理をスタートする（前半の基本情報や普段の生活習慣を拾うため）。
//   ・行の中に「入院」「実習」「術前」「術後」などの見出しキーワードを見つけたら、
//     記憶を「入院後」に切り替える。
//   ・見出し以外のデータ行には、その時点で記憶している時期タグ（入院前 or 入院後）を
//     自動的に付与する。
// detectAdmissionPhaseSignal()は、この「切り替わりの手がかり」を1行分のテキストから
// 判定する純粋関数（ローカル抽出・AI抽出の両方、および既存カードへの遡及反映
// （window.reapplyTagRulesToUntagged）から共通で呼ばれる）。groupClinicalPhrasesWithTimestamps
// は、この判定結果を使って「今何の時期を読んでいるか」を上から順に記憶しながら、
// 抽出した各カードにadmissionPhaseを自動的に書き足す。

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
  // 「入院前の生活歴」のように「入院」という字面上は入院後の手がかりも含む文字列でも、
  // 明示的な「入院前」を優先して入院前に戻す（巻き戻しの手がかりを取り逃さないため）。
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
  // 「治療方針」は見出しラベルの手がかりでpostadmission確定のため、
  // admissionPhaseがpreadmissionでも上書きされない。
  assert.equal(inferAssessmentColumn('治療方針', '', 'preadmission'), 'postadmission');
  // タイムスタンプに「入院前」があれば、admissionPhaseがpostadmissionでも上書きされない。
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

// 【背景】利用者からのアップロード文書で発覚：「【入院当日】」「【入院2日目】」「【入院3日目】」
// のように、山括弧（＜＞）ではなく全角鉤括弧（【】）で、かつ日付・時刻ではなく入院からの
// 経過日数だけで区切りを表す見出し行が、時系列マーカー（TIME_MARKER_REGEXの「\d+日目」等）
// としても、山括弧見出し（＜実習1日目…＞等）としても認識されず、見出し語だけの意味の無い
// カードとして残ってしまっていた。しかもこのカードはヘンダーソン14項目のどのキーワードにも
// 一致しないため、「患者背景（基本情報／医学情報）」の受け皿に誤って振り分けられてしまう
// （利用者からの質問：「なぜ患者背景に分類された？」）という二重の不具合になっていた。
// 「\d+日目」だけでは「入院」の分だけ手前にずれてしまい一致できない（見出し全体が数字から
// 始まっていないため）ことが原因。「入院当日」「入院◯日目」を時系列マーカーの候補に追加し、
// 他の「術前」「術後」等と同様に、見出し行自体はカード化せず（意味の無いカードを作らない）、
// globalTimestamp・admissionPhaseの更新だけに使われるようにした。
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
