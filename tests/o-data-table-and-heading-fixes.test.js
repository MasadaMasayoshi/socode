'use strict';
// 利用者からのアップロード文書（患者34：分類前の文章と分類後の出力シート）で見つかった、
// Oデータ欄の分類の問題と「不必要な情報」に検査値が入っていた問題の回帰テスト。
//
// 1. 「検査項目／正常値／入院時／術後1日目」の表が表として認識されず（「基準値」しか列見出しと
//    して認識していなかった）、基準値だけのカード・項目名だけのカード・数値だけのカードに
//    バラバラに分かれていた。列見出し「術後1日目」が時系列マーカーとして以降すべての日時を
//    上書きし、CRPの基準値「<0.2mg/dl」は山括弧見出し「<…>」と誤認され「不必要な情報」に入っていた。
// 2. 「■ 嗜好品」「■ 活動・睡眠・清潔・更衣」「1. 生活習慣・身体的機能（左ページ）」のような
//    見出しが、見出し語だけのOデータのカード（「活動」「睡眠」…）になっていた。
// 3. 「嘔気・嘔吐なし」が「嘔気」「嘔吐なし」に分割され、「嘔気」だけのカードが「嘔気あり」とも
//    読める状態になっていた（所見の意味の逆転）。
// 4. 「疼痛訴えなく」「呼吸困難訴えなし」（訴えが無いという観察）や、「ペインスケール「2-3」」
//    （数字だけを「」で囲んだ評価値）がSデータになっていた。
// 5. 「術後1日目より受け持つ。」から日時だけが剥がされ「より受け持つ。」というOデータになっていた。

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const app = loadApp();
const { groupClinicalPhrasesWithTimestamps, predictLocalItemType, predictSOTypeFromNarrative, splitByNakatenList, detectMultipleHendersonTags } = app;

const LAB_TABLE = [
  '2. 血液データ（入院時・術後）',
  '検査項目', '正常値', '入院時', '術後1日目',
  'WBC (白血球)', '8.1-9.0×10³/μL', '8100/μL', '10,200',
  'CRP (C反応性蛋白)', '<0.2mg/dl', '0.826mg/dl', '1.5',
  'FBS (空腹時血糖)', 'ー', '100mg/dl', '105',
  'HbA1c', 'ー', '6.0%', 'ー',
  '',
  '3. 入院時の状況・疾患に対する認識（右ページ）'
].join('\n').normalize('NFKC');

function extract(text) {
  return groupClinicalPhrasesWithTimestamps(text.normalize('NFKC'));
}

// 【変更】患者36の指摘（「関連する項目をグループ化し、入院時→術後1日目の比較としてまとめると、貧血の進行や
// 炎症反応の程度をアセスメントしやすい」）により、2つ以上の時点の列がある表は、項目・時点ごとの1枚ずつではなく、
// 関連する項目（炎症・血糖…）ごとに「入院時→術後1日目」の変化が分かる1枚にまとめるようにした。
test('「正常値」の列見出しの表：関連する項目ごとに、入院時→術後1日目の変化と基準値が分かる1枚になる（利用者からの報告事例）', () => {
  const items = extract(LAB_TABLE);
  const inflammation = items.find(i => i.text.startsWith('炎症（入院時→術後1日目）'));
  assert.ok(inflammation, items.map(i => i.text).join(' / '));
  assert.equal(inflammation.timestamp, '術後1日目', '日時は表の最後の時点');
  assert.equal(inflammation.isLabOrVital, true);
  assert.match(inflammation.text, /WBC \(白血球\) 8100\/μL→10,200\/μL \(基準値: 8\.1-9\.0×10\^3\/μL\)/, '単位の省略された2列目にも同じ行の単位が補われる');
  assert.ok(!items.some(i => /^WBC/.test(i.text)), '項目・時点ごとのカードは作らない');
  const wbcRow = inflammation.labRows.find(r => r.key.startsWith('WBC'));
  assert.equal(JSON.stringify(wbcRow.values), JSON.stringify([{ phase: '入院時', value: '8100/μL' }, { phase: '術後1日目', value: '10,200/μL' }]), '異常値の検出用に時点ごとの値を持つ');
});

test('基準値「<0.2mg/dl」は「不必要な情報」にならず、CRPの基準値として付く（利用者からの報告事例）', () => {
  const items = extract(LAB_TABLE);
  assert.ok(!items.some(i => i.isUnnecessaryBoilerplate && /0\.2/.test(i.text)), '検査値が不必要な情報に入ってはいけない');
  const inflammation = items.find(i => i.text.startsWith('炎症'));
  assert.match(inflammation.text, /CRP \(C反応性蛋白\) 0\.826mg\/dl→1\.5mg\/dl \(基準値: <0\.2mg\/dl\)/);
});

test('基準値の列が「ー」の項目：基準値なしで実測値だけ、「ー」（測定なし）の時点は「のみ」と分かる', () => {
  const items = extract(LAB_TABLE);
  const glucose = items.find(i => i.text.startsWith('血糖（入院時→術後1日目）'));
  assert.ok(glucose);
  assert.match(glucose.text, /FBS \(空腹時血糖\) 100mg\/dl→105mg\/dl、/);
  assert.match(glucose.text, /HbA1c 6\.0%（入院時のみ）/, '術後1日目が「ー」のHbA1cは入院時の値だけ');
  const order = items.filter(i => i.isLabOrVital).map(i => i.text.split('（')[0]);
  assert.deepEqual(Array.from(order), ['炎症', '血糖'], '表で先に出てくる項目のまとまりから並べる');
});

test('表の列見出し（入院時・術後1日目）は、表の後ろのカードの日時を上書きしない（利用者からの報告事例）', () => {
  const items = extract(LAB_TABLE + '\n食事: 常食');
  const meal = items.find(i => i.text.includes('常食'));
  assert.notEqual(meal.timestamp, '術後1日目');
  assert.notEqual(meal.timestamp, '1日目');
});

test('表の見出し行（検査項目・正常値）と番号付きの章見出しは「不必要な情報」になる', () => {
  const items = extract(LAB_TABLE);
  ['検査項目', '正常値'].forEach(h => {
    const it = items.find(i => i.text === h);
    assert.ok(it && it.isUnnecessaryBoilerplate, `「${h}」は不必要な情報`);
  });
  const chapter = items.find(i => i.text.includes('血液データ'));
  assert.equal(chapter.isUnnecessaryBoilerplate, true);
});

test('■付きの区切り見出しは、見出し語だけのOデータのカードにならず「不必要な情報」1件になる（利用者からの報告事例）', () => {
  const items = extract(['■ 嗜好品', 'タバコ: なし', '■ 活動・睡眠・清潔・更衣', '活動: 自立'].join('\n'));
  const cards = items.filter(i => !i.isUnnecessaryBoilerplate);
  assert.deepEqual(Array.from(cards.map(i => i.text)), ['タバコ: なし', '活動: 自立']);
  assert.ok(items.some(i => i.isUnnecessaryBoilerplate && i.text === '活動・睡眠・清潔・更衣'), '「・」で分割されず見出し全体で1件');
});

test('「■ 入院時の状況」のような時期を表す■見出しは、以降のカードの日時として引き継がれる', () => {
  const items = extract(['■ 入院時の状況', '歩行: 禁止'].join('\n'));
  assert.equal(items.find(i => i.text.includes('歩行')).timestamp, '入院時');
});

test('■で始まっていても値を伴う行（「■ 食事: 常食」）は所見として残る（誤爆防止）', () => {
  const items = extract('■ 食事: 常食');
  assert.ok(items.some(i => !i.isUnnecessaryBoilerplate && i.text.includes('常食')));
});

test('番号付きの章見出し：「1. 生活習慣・身体的機能（左ページ）」は不必要、「1. 疼痛あり」のような番号付きの所見は残る', () => {
  const heading = extract('1. 生活習慣・身体的機能（左ページ）');
  assert.equal(heading.length, 1);
  assert.equal(heading[0].isUnnecessaryBoilerplate, true, '「・」で分割されず見出し全体で1件');
  const finding = extract('1. 疼痛あり');
  assert.ok(finding.some(i => !i.isUnnecessaryBoilerplate), '所見を表す語を含む番号付きの行は見出しとみなさない');
});

test('「嘔気・嘔吐なし」は分割されない（「嘔気」だけが残ると意味が逆転するため。利用者からの報告事例）', () => {
  assert.deepEqual(Array.from(splitByNakatenList('嘔気・嘔吐なし')), ['嘔気・嘔吐なし']);
  assert.deepEqual(Array.from(splitByNakatenList('発赤・腫脹・熱感なし')), ['発赤・腫脹・熱感なし']);
});

test('「シャワー浴・弾性ストッキング着用」のような通常の列挙は、引き続き分割される（回帰確認）', () => {
  assert.deepEqual(Array.from(splitByNakatenList('シャワー浴・弾性ストッキング着用')), ['シャワー浴', '弾性ストッキング着用']);
});

test('「訴えなし」「訴えなく」は観察所見なのでOデータ、「痛みを訴える」はSデータ（利用者からの報告事例）', () => {
  assert.equal(predictSOTypeFromNarrative('動かなければ疼痛訴えなく、鎮痛剤の内服も行わず経過。'), 'o');
  assert.equal(predictSOTypeFromNarrative('呼吸困難訴えなし、自力排痰可能'), 'o');
  assert.equal(predictSOTypeFromNarrative('創部の痛みを訴える'), 's');
});

test('数字だけを「」で囲んだ評価値はOデータ、かな・漢字の発言はSデータ（利用者からの報告事例）', () => {
  assert.equal(predictSOTypeFromNarrative('疼痛: 安静時ペインスケール「2-3」'), 'o');
  assert.equal(predictSOTypeFromNarrative('疼痛: 「動かなかったら痛くないよ」'), 's');
  assert.ok(!detectMultipleHendersonTags('安静時ペインスケール「2-3」').includes(10), '数字だけの括弧で10(コミュニケーション)は付かない');
  assert.ok(detectMultipleHendersonTags('「先生にお任せするしかない」').includes(10), '発言には引き続き10が付く');
});

test('「術後1日目より受け持つ。」は日時が剥がされず、学生の受け持ち開始の記述として不必要な情報になる（利用者からの報告事例）', () => {
  const items = extract('術後1日目より受け持つ。');
  assert.equal(items.length, 1);
  assert.equal(items[0].text, '術後1日目より受け持つ。');
  assert.equal(predictLocalItemType(items[0], items[0].text, null), 'unnecessary');
});
