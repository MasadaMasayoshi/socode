'use strict';
// テキスト書き出しで「総合アセスメント表」のページを選べるようにした機能の検証
// （利用者からの要望：「テキスト書き出しの選択項目に総合アセスメント表のページを選べるようにしてください」）。

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const { buildAssessmentTableText, buildSelectedCardsExportText } = loadApp();

const cp = {
  title: '患者X',
  items: [
    { id: 'a', type: 's', timestamp: '入院時', text: '「息苦しい」', hendersonIds: [1], assessmentCols: { 1: 'postadmission' } },
    { id: 'b', type: 'o', timestamp: '10:00', text: 'SpO2 95%', hendersonIds: [1], assessmentCols: { 1: 'postadmission' } },
    { id: 'c', type: 'o', timestamp: '日時不明', text: '喫煙歴なし', hendersonIds: [1], assessmentCols: { 1: 'preadmission' } },
    { id: 'd', type: 'o', timestamp: '日時不明', text: '体重測定が必要', hendersonIds: [2], assessmentCols: { 2: 'missing' } },
    { id: 'e', type: 'unnecessary', timestamp: '日時不明', text: '学籍番号', hendersonIds: [1] }
  ]
};

test('14項目ごとに「未分類／入院前／入院後／不足情報」の欄に分け、画面と同じS-1・O-1の番号を付ける', () => {
  const out = buildAssessmentTableText(cp);
  // 入院後の欄は日ごとの小見出し（〈入院時〉）で区切る。日の分からない「10:00」は直前の日の続きに入れる
  // 番号は画面に並ぶ順（未分類→入院前→入院後）に付ける（利用者の指摘「O-1、O-2の順番が整理されていない」）
  assert.match(out, /■ 1\. 呼吸\n  ・入院前：情報不足[^\n]*\n  ・入院後：未充足　S-1（入院時：息苦しい）により、[^\n]*未充足。\n  \[入院前\]\n    ・O-1 喫煙歴なし\n  \[入院後\]\n   〈入院時〉\n    ・S-1 \[入院時\] 「息苦しい」\n    ・O-2 \[10:00\] SpO2 95%\n/);
  assert.match(out, /■ 2\. 食事\n  ・入院前：情報不足[^\n]*\n  ・入院後：情報不足[^\n]*\n  \[不足情報\]\n    ・体重測定が必要\n/, '不足情報の欄はS/Oの番号を付けない');
  assert.match(out, /■ 5\. 睡眠\n  ・入院前：情報不足[^\n]*\n  ・入院後：情報不足[^\n]*\n  （カードなし）/, 'カードの無い項目も「カードなし」として並べる');
  assert.ok(!out.includes('学籍番号'), '不要な情報のカードは含めない');
});

test('選択したカードだけの場合は、そのカードだけを書き出し（番号は画面と同じ）、カードの無い項目は省く', () => {
  const out = buildAssessmentTableText(cp, new Set(['b']));
  assert.match(out, /■ 1\. 呼吸\n  \[入院後\]\n    ・O-2 \[10:00\] SpO2 95%\n/);
  assert.ok(!out.includes('息苦しい'));
  assert.ok(!out.includes('■ 2.'));
});

test('選択したカードの書き出しで、総合アセスメント表を含めると選んだ場合だけ、その欄が付く', () => {
  const withTable = buildSelectedCardsExportText(cp, ['a'], '', false, true);
  assert.match(withTable, /【総合アセスメント表（選択したカードのみ）】\n\n■ 1\. 呼吸\n  \[入院後\]\n   〈入院時〉\n    ・S-1/);
  const without = buildSelectedCardsExportText(cp, ['a'], '', false, false);
  assert.ok(!without.includes('総合アセスメント表'));
});

test('入院後の欄は、手術当日・術後1日目・術後2日目のように日が変わるところで区切る（患者36の指摘）', () => {
  const cp2 = { title: 'Y', items: [
    { id: 'p', type: 'o', timestamp: '手術当日 12:00', text: '帰室', hendersonIds: [9], assessmentCols: { 9: 'postadmission' } },
    { id: 'q', type: 'o', timestamp: '術後1日目 12:00', text: '昼食、点滴終了', hendersonIds: [9], assessmentCols: { 9: 'postadmission' } },
    { id: 'r', type: 's', timestamp: '術後1日目 14:00', text: '「痛い」', hendersonIds: [9], assessmentCols: { 9: 'postadmission' } },
    { id: 's', type: 'o', timestamp: '術後2日目 12:00', text: '自力で端坐位', hendersonIds: [9], assessmentCols: { 9: 'postadmission' } }
  ] };
  const out = buildAssessmentTableText(cp2);
  assert.match(out, /\[入院後\]\n   〈手術当日〉\n    ・O-1 \[手術当日 12:00\] 帰室\n   〈術後1日目〉\n    ・O-2 \[術後1日目 12:00\] 昼食、点滴終了\n    ・S-1 \[術後1日目 14:00\] 「痛い」\n   〈術後2日目〉\n    ・O-3 \[術後2日目 12:00\] 自力で端坐位\n/);
});
