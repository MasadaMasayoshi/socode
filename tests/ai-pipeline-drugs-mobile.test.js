'use strict';
// 利用者からの要望への対応の確認
//  ・薬の情報（js/14）：記録の中の薬の名前（一般名・商品名）を見つけ、分類・観ること・添付文書へのリンクを出す
//  ・ボタン1つで ①不足情報 → ②看護診断候補 → ③看護計画 → 看護計画タブへの取り込み まで進める
//  ・APIキーが無いときは、取得のページと設定へ案内する
//  ・スマホでは、印刷用のページを新しいタブで開いてPDFに保存できるようにする
//  ・カードの「︙」を目立たせる、経時変化サマリーの名前を戻す
//  ・子どもの記録では、脈拍・呼吸数を年齢の目安で見て、大人の基準値を書き足さない
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp, readAppSource } = require('./app-helpers');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
const src = readAppSource();
const app = loadApp();

test('薬の情報：一般名・商品名・書き方の揺れで見つけ、似た言葉（ベランダ・RBC・グランド・PCI）には当てない', () => {
  assert.ok(app.DRUG_REFERENCE.length >= 250, `薬の件数 ${app.DRUG_REFERENCE.length}`);
  const names = t => Array.from(app.findDrugsInText(t), x => x.drug.name);
  assert.deepEqual(names('ラシックス錠20mg 1錠'), ['フロセミド']);
  assert.deepEqual(names('ソリタ T3号 80ml/h'), ['維持液（3号液）']);
  assert.deepEqual(names('インスリン グラルギン 8単位 眠前'), ['インスリン グラルギン']);
  assert.deepEqual(names('セファメジンα 1g 点滴'), ['セファゾリン']);
  assert.deepEqual(names('ワーファリンとアムロジピン'), ['ワルファリン', 'アムロジピン']);
  ['ベランダで洗濯物を干す', 'RBC 4.2', 'グランドゴルフが趣味', 'PCI後', 'PT 12.0秒'].forEach(t => assert.deepEqual(names(t), [], t));
  // 1件ずつ、分類・使い道・観ることが書いてある
  app.DRUG_REFERENCE.forEach(d => { assert.ok(d.name && d.cls && d.use && d.watch, d.name); });
  // 最新の添付文書を確かめるリンク（KEGG MEDICUS の薬の名前での検索）
  assert.equal(app.drugLabelSearchUrl(app.DRUG_REFERENCE.find(d => d.name === 'フロセミド')), 'https://www.kegg.jp/medicus-bin/search_drug?search_keyword=' + encodeURIComponent('フロセミド'));
  assert.match(html, /https:\/\/www\.pmda\.go\.jp\/PmdaSearch\/iyakuSearch\//);
});

test('薬の情報：AIへの指示に記録の薬を添え、カードに「薬」の印、薬だけのカードに分類からのタグ', () => {
  const sec = app.drugPromptSection({ sourceText: '内服：フロセミド 20mg、ワーファリン 2mg', items: [] });
  assert.match(sec, /【記録に出てくる薬/);
  assert.match(sec, /フロセミド（ラシックス）：ループ利尿薬/);
  assert.match(sec, /ワルファリン.*特に注意が必要な薬/);
  assert.equal(app.drugPromptSection({ sourceText: '薬なし', items: [] }), '');
  assert.match(src, /\$\{drugChipHtml\(item\)\}\$\{confidenceBadgeHtml\}/);
  assert.match(src, /\$\{fieldTag\}\$\{time\}\$\{drugChipHtml\(item\)\}/);
  const cards = Array.from(app.classifyTextByRules('内服：タムスロシン 0.2mg 1錠'));
  assert.ok(cards.some(c => Array.from(c.hendersonIds).includes(3)), JSON.stringify(cards));
  assert.match(html, /<script src="js\/14-drug-reference\.js\?v=/);
  assert.match(html, /id="modal-drug-info"/);
});



test('スマホでは印刷用の文書を同じ画面の上に重ねて開き、「印刷・PDFに保存」のボタンと保存のしかたを出す', () => {
  assert.match(src, /function isMobilePrintTarget\(\)/);
  // スマホは新しいタブ（blob）を開かず、同じ画面の上に文書を重ねて印刷する（ホーム画面のアプリ等で開けなかったため）
  assert.match(src, /if \(isMobilePrintTarget\(\)\) return showMobilePrintView\(html, options\);/);
  assert.doesNotMatch(src, /window\.open\(url, '_blank'\)/);
  assert.match(src, /html\.print-view-open body > \*:not\(#print-view\) \{ display: none !important; \}/);
  assert.match(src, /印刷・PDFに保存/);
  assert.match(src, /"ファイル"に保存/);
  assert.match(src, /PDFとして保存/);
});


test('子どもの記録：年齢の区分を見分け（家族の年齢は読まない）、脈拍・呼吸数は子どもの目安で判定し、大人の基準値を書き足さない', () => {
  assert.equal(app.detectAgeGroupFromText('患児：Jくん 生後5か月 男児\n家族：父・母・兄（3歳）'), 'infant');
  assert.equal(app.detectAgeGroupFromText('患児：K ちゃん 3歳2か月 女児\n家族：父（34歳）'), 'toddler');
  assert.equal(app.detectAgeGroupFromText('受け持ち児：I ちゃん（男児）\n現在 日齢14、修正33週2日'), 'neonate');
  assert.equal(app.detectAgeGroupFromText('患者：L さん 13歳 女子'), null);
  assert.equal(app.detectAgeGroupFromText('受け持ち：C氏（32歳・初産婦）\n＜児（新生児）＞ 日齢1'), null);
  const items = [
    { id: 'a', type: 'o', timestamp: '入院2日目 8:30', text: 'HR 138回/分、RR 36回/分' },
    { id: 'b', type: 'o', timestamp: '入院2日目 8:30', text: 'BP 88/50mmHg' }
  ];
  const infant = app.buildLabTrendTable(items, { sourceText: '患児：生後5か月 男児' });
  const flags = key => Object.values(infant.rows.find(r => r.key === key).cells).flat().map(x => x.flag);
  assert.deepEqual(flags('脈拍'), ['']);
  assert.deepEqual(flags('呼吸数'), ['']);
  assert.deepEqual(flags('血圧'), [''], '子どもの血圧は判定しない');
  assert.match(infant.rows.find(r => r.key === '脈拍').ref, /110〜140（乳児）/);
  const adult = app.buildLabTrendTable(items, { sourceText: '患者：70歳 男性' });
  assert.deepEqual(Object.values(adult.rows.find(r => r.key === '脈拍').cells).flat().map(x => x.flag), ['high']);
  const kid = Array.from(app.classifyTextByRules('患児：K ちゃん 3歳 女児\n血液検査：WBC 12400/μL、CRP 4.8 mg/dL'), c => c.text);
  assert.ok(kid.includes('WBC 12400 /μL'), JSON.stringify(kid));
  assert.ok(kid.some(t => /^CRP 4\.8 mg\/dL \(基準値:/.test(t)), 'CRP は年齢で変わらないので書き足す');
});

