'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const { buildSelectedCardsExportText } = loadApp();

const SOURCE = [
  '検査項目', '正常値', '入院時', '術後1日目',
  'WBC (白血球)', '8.1-9.0×10³/μL', '8100/μL', '10,200',
  '呼吸困難訴えなし、自力排痰可能',
  '「先生にお任せするしかない」'
].join('\n');

const cp = {
  title: '患者34',
  items: [
    { id: 'a', type: 'o', timestamp: '術後1日目', text: 'WBC (白血球) 10,200/μL (基準値: 8.1-9.0×10^3/μL)', hendersonIds: [2, 7] },
    { id: 'b', type: 's', timestamp: '12:00', text: '呼吸困難訴えなし、自力排痰可能', hendersonIds: [1] },
    { id: 'c', type: 's', timestamp: '入院時', text: '「先生にお任せするしかない」', hendersonIds: [10], fieldLabel: null },
    { id: 'd', type: 'o', timestamp: '日時不明', text: '元の文章に無いカード', hendersonIds: [] }
  ]
};

test('選択したカードだけが、分類ボードの並び順で書き出される（選択していないカードは含まれない）', () => {
  const out = buildSelectedCardsExportText(cp, new Set(['b', 'a']), SOURCE, false);
  assert.match(out, /^修正依頼メモ：患者34（選択したカード 2件）/);
  assert.ok(out.indexOf('WBC') < out.indexOf('呼吸困難'), 'クリックした順ではなくボードの並び順');
  assert.ok(!out.includes('先生にお任せ'), '選択していないカードは含まない');
  assert.match(out, /■ 1件目\n分類: Oデータ ／ 日時: 術後1日目 ／ タグ: 2\. 食事、7\. 体温|■ 1件目\n分類: Oデータ ／ 日時: 術後1日目 ／ タグ: /);
});

test('各カードに、分類・カードの内容・元の文章の該当箇所・修正内容の記入欄が付く', () => {
  const out = buildSelectedCardsExportText(cp, ['a'], SOURCE);
  assert.match(out, /カードの内容: WBC \(白血球\) 10,200\/μL/);
  assert.match(out, /元の文章: WBC \(白血球\) \/ 8\.1-9\.0×10³\/μL \/ 8100\/μL \/ 10,200/, '表の項目名から実測値までの行を「 / 」でつないで示す');
  assert.match(out, /修正してほしい内容: \n/);
});

test('S/O・見出し・タグ無しの表示と、元の文章に見つからないカードの扱い', () => {
  const out = buildSelectedCardsExportText(cp, ['b', 'd'], SOURCE);
  assert.match(out, /分類: Sデータ ／ 日時: 12:00 ／ タグ: /);
  assert.match(out, /元の文章: 呼吸困難訴えなし、自力排痰可能\n/);
  assert.match(out, /分類: Oデータ ／ 日時: 日時不明 ／ タグ: なし/);
  assert.match(out, /元の文章: （元の文章の中に見つかりませんでした）/);
});

test('見出しラベルがあるカードは「見出し」も表示される', () => {
  const cp2 = { title: 'X', items: [{ id: 'x', type: 'o', timestamp: '日時不明', fieldLabel: '家族関係', text: '妻と2人暮らし', hendersonIds: [9] }] };
  const out = buildSelectedCardsExportText(cp2, ['x'], '家族構成：妻と2人暮らし');
  assert.match(out, /見出し: 家族関係/);
  assert.match(out, /元の文章: 家族構成：妻と2人暮らし/);
});

test('分類前の文章：含めると選んだ場合だけ、ファイルの最後に入力欄の文章全体が付く（利用者からの要望）', () => {
  const withSource = buildSelectedCardsExportText(cp, ['a'], SOURCE, true);
  assert.match(withSource, /【分類前の文章（カルテ・看護記録入力欄）】\n検査項目\n正常値/);
  assert.ok(withSource.trimEnd().endsWith('「先生にお任せするしかない」'));
  const withoutSource = buildSelectedCardsExportText(cp, ['a'], SOURCE, false);
  assert.ok(!withoutSource.includes('【分類前の文章'));
});
