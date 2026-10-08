'use strict';
// 総合アセスメント表：14項目ごとの充足・未充足（入院前・入院後・全体）
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();

test('充足・未充足はサイトが決める：選ぶ欄は無く、記録から出た結果だけを表示し、書き出しにも出る', () => {
  const cp = { id: 'p', items: [
    { id: 'a', type: 'o', text: '術後排便なし 腹部膨満あり', timestamp: '術後1日目', hendersonIds: [3], assessmentCols: { 3: 'postadmission' } },
    { id: 'b', type: 'o', text: '呼吸困難感訴えなし SpO2 98%', timestamp: '術後1日目', hendersonIds: [1], assessmentCols: { 1: 'postadmission' } }
  ], myAssessments: {} };
  assert.equal(app.getSufficiency(cp, 3), 'unmet');
  assert.equal(app.getSufficiency(cp, 1), 'met');
  assert.equal(app.getSufficiency(cp, 6), '');
  const pre = app.sufficiencyPhaseHtml(cp, 3, 'pre'), post = app.sufficiencyPhaseHtml(cp, 3, 'post');
  assert.doesNotMatch(pre + post, /<button|ルール判定|サイト内|AIなし/);
  assert.match(pre, /入院前の判定.*情報不足.*判定根拠/);
  assert.match(post, /入院後の判定.*未充足.*判定根拠.*根拠カード：/);
  const head = app.sufficiencyHeaderHtml(cp, 3);
  assert.match(head, /入院前.*情報不足.*入院後.*未充足.*O-1により、/, '見出しに、O-1によりの形で根拠を出す');
  app.ensureMyAssessment(cp, 3).interpretation = '排便がない';
  assert.match(app.buildMyAssessmentsText(cp), /3\. 排泄\n・入院前：情報不足.*\n・入院後：未充足.*リスクが考えられるため、未充足。/);
  assert.match(app.sufficiencySummaryHtml(cp), /未充足 1/);
});

test('AIの答えの読み取り：根拠が出せない判断は採用しない（AIは評価に使う）', () => {
  const cp = { id: 'p', items: [{ id: 'a', type: 'o', text: '普段から咳や息切れなし', hendersonIds: [1], assessmentCols: { 1: 'preadmission' } }, { id: 'c', type: 'o', text: '術後排便なし', hendersonIds: [3], assessmentCols: {} }], myAssessments: {} };
  const ev = { byCode: new Map([['C1', { id: 'a' }], ['C3', { id: 'c' }]]), byId: new Map([['a', 'C1'], ['c', 'C3']]) };
  const json = JSON.stringify({ needs: [
    { id: 1, all: { verdict: 'met', agree: true, reason: '問題なし', evidence: ['C1'] } },
    { id: 3, all: { verdict: 'unmet', reason: '根拠が別項目', evidence: ['C1'] } },
    { id: 5, verdict: 'unmet', reason: '以前の形・根拠なし', evidence: [] }
  ] });
  const res = app.parseSufficiencyJson(json, ev, cp);
  assert.equal(res[1].all.verdict, 'met');
  assert.equal(res[1].all.agree, true);
  assert.equal(res[3].all.verdict, 'unknown');
  assert.equal(res[5].all.verdict, 'unknown');
  const r = app.applySufficiencyReview(cp, res);
  assert.ok(r.agree >= 1);
});

test('入院前／入院後を分けて判定し、正常所見が十分ある呼吸は充足。日時のあるカードは未分類にしない', () => {
  const mk = (id, text, ts, h) => ({ id, type: 'o', text, timestamp: ts, hendersonIds: h, assessmentCols: Object.fromEntries(h.map(x => [x, 'unclassified'])) });
  const cp = { id: 'p', myAssessments: {}, items: [
    mk('b', 'SpO2 98% 呼吸音清明', '入院前', [1]),
    mk('c', '呼吸困難なし 肺Air入り良好', '術後1日目', [1]), mk('d', '自力排痰可能 痰はやや粘稠', '術後1日目', [1]),
    mk('f', '友人と旅行を楽しむ', '入院前', [13]), mk('g', '早く治してまた旅行をしたい', '術後2日目', [13]),
    mk('l', '特別な宗教の信仰なし', '入院前', [11]), mk('m', '情けない', '術後2日目', [12])
  ] };
  assert.equal(app.getSufficiency(cp, 1, 'pre'), 'met');
  assert.equal(app.getSufficiency(cp, 1, 'post'), 'met');
  assert.equal(app.getSufficiency(cp, 13, 'pre'), 'met');
  assert.equal(app.getSufficiency(cp, 13, 'post'), 'unmet');
  assert.equal(app.getSufficiency(cp, 11, 'pre'), 'met');
  assert.equal(app.getSufficiency(cp, 12, 'post'), ''); // 情報不足は情報不足
  assert.match(app.sufficiencyTextOf(cp, 13), /入院前：充足／入院後：未充足/);
});

test('書き出した整理シートを貼り直しても、「O-1 [入院前]」「[未分類] [O]」の行の入院前が入院後にならない', () => {
  const t = '【3. 客観的情報】\n・[術後2日目 16:00] 体温37.0度\n【4. 未分類のカード】\n・[未分類] [O] [既往歴] 60歳 高血圧症\n【5. 整理】\n■ 1. 呼吸\n  [入院前]\n    ・O-1 [入院前] 嗜好品: タバコ なし\n  [入院後]\n    ・S-1 [術後1日目 10:00] 「痛い」';
  const r = Array.from(app.groupClinicalPhrasesWithTimestamps(t));
  const ts = s => r.find(x => x.text.includes(s)).timestamp;
  assert.equal(ts('嗜好品'), '入院前');
  assert.equal(ts('「痛い」'), '術後1日目 10:00');
  assert.equal(r.find(x => x.text.includes('高血圧症')).admissionPhase, 'preadmission');
});

test('教員の指導：結論を言い切る理由文と、未充足のときは考えられるリスクまで書く', () => {
  const cp = { id: 'p', myAssessments: {}, items: [{ id: 'a', type: 'o', text: '術後排便なし 腹部膨満あり', timestamp: '術後1日目', hendersonIds: [3], assessmentCols: { 3: 'postadmission' } }] };
  const s = app.sufficiencySentence(cp, 3, 'post');
  assert.match(s, /より、.*リスクが考えられるため、未充足。$/);
  assert.match(app.sufficiencySentence(cp, 3, 'pre'), /情報不足。$/);
});

test('共通ルール：入院前・入院後それぞれで自立して満たされているかを見る', () => {
  const mk = (id, text, ts, h, col) => ({ id, type: 'o', text, timestamp: ts, hendersonIds: h, assessmentCols: Object.fromEntries(h.map(x => [x, col])) });
  const cp = { id: 'p', myAssessments: {}, items: [
    mk('a', '呼吸状態:呼吸器疾患既往なし SpO2 98%', '入院前', [1], 'preadmission'),
    mk('b', '呼吸困難なし 自力排痰可能', '術後1日目', [1], 'postadmission'),
    mk('c', '排泄: 排尿 7回/日 自立 便秘なし', '入院前', [3], 'preadmission'),
    mk('d', '膀胱留置カテーテル挿入中 排便なし 「お腹が張っている」', '術後2日目', [3], 'postadmission'),
    mk('e', '睡眠: 7時間程度(寝つきはよい)現在は痛みのため眠れていない', '入院前', [5], 'preadmission')
  ] };
  assert.equal(app.getSufficiency(cp, 1, 'pre'), 'met');
  assert.equal(app.getSufficiency(cp, 1, 'post'), 'met');
  assert.equal(app.getSufficiency(cp, 3, 'pre'), 'met');
  assert.equal(app.getSufficiency(cp, 3, 'post'), 'unmet');
  assert.equal(app.getSufficiency(cp, 5, 'pre'), 'met');
});

test('今の状態を優先し、言葉だけでは充足にしない：絶飲食・留置カテーテル・床上安静・術後の呼吸所見は入院後を未充足、発言や挿入部の所見は根拠にしない', () => {
  const mk = (id, text, ts, h, col) => ({ id, type: 'o', text, timestamp: ts, hendersonIds: h, assessmentCols: Object.fromEntries(h.map(x => [x, col])) });
  const cp = { id: 'p', myAssessments: {}, items: [
    mk('a', '昼食は常食 朝食全量摂取', '手術前日 12:00', [2], 'postadmission'),
    mk('b', '【食事】絶飲食', '手術当日', [2], 'postadmission'),
    mk('c', '膀胱留置カテーテル', '手術当日', [3], 'postadmission'),
    mk('d', '挿入部異常なし', '手術当日', [3], 'postadmission'),
    mk('e', '【安静度】術後床上安静', '手術当日', [4], 'postadmission'),
    mk('f', '「痛かったら、これ、自分でできるかな？」と話す', '手術当日', [4], 'postadmission'),
    mk('g', 'Spo2 99%(酸素5L/分) 湿性咳嗽時々あり 息遣いは浅い', '手術当日', [1], 'postadmission'),
    mk('h', 'ボールを3つとも上げると、維持できない', '手術当日', [1], 'postadmission'),
    mk('i', '体重2.0kg減 朝食はほとんど食べない 野菜嫌い', '入院前', [2], 'preadmission'),
    mk('j', '排便:1回/日、排尿:7~8回/日', '入院前', [3], 'preadmission'),
    mk('k', 'ADL:全て自立', '入院前', [4], 'preadmission')
  ] };
  assert.equal(app.getSufficiency(cp, 2, 'pre'), 'unmet');
  assert.equal(app.getSufficiency(cp, 2, 'post'), 'unmet');
  assert.equal(app.getSufficiency(cp, 3, 'pre'), 'met');
  assert.equal(app.getSufficiency(cp, 3, 'post'), 'unmet');
  assert.equal(app.getSufficiency(cp, 4, 'pre'), 'met');
  assert.equal(app.getSufficiency(cp, 4, 'post'), 'unmet');
  assert.equal(app.getSufficiency(cp, 1, 'post'), 'unmet');
  assert.match(app.judgeSufficiencyByRules(cp)[1].post.reason, /酸素|湿性咳嗽/);
  assert.doesNotMatch(app.judgeSufficiencyByRules(cp)[1].post.reason, /ボール/);
  // 絶飲食のあとに食事の再開が書かれていれば、制限は終わったと見る
  cp.items.push(mk('l', '流動食を開始、全量摂取', '術後2日目', [2], 'postadmission'));
  assert.notEqual(app.getSufficiency(cp, 2, 'post'), 'unmet');
  // 「できる」「大丈夫」「分かりました」の発言・疑問は、できている証拠にしない
  assert.equal(app.sufficiencyCardVerdict({ text: '「痛かったら、これ、自分でできるかな？」と話す' }, 4).v, '');
  assert.equal(app.sufficiencyCardVerdict({ text: '挿入部を数えると「分かりました」と話す' }, 3).v, '');
  assert.equal(app.sufficiencyCardVerdict({ text: '挿入部異常なし' }, 3).v, '');
  // 記録が無い欲求は「情報不足」と明示して出す
  assert.equal(app.sufficiencyTextOf(cp, 6), '入院前：情報不足／入院後：情報不足');
});

test('分類：治療・やり方への理解や疑問の発言は14.学び（10にしない）、環境はPCA・検査値・病期・痛みや不安だけでは付けない', () => {
  const t = s => Array.from(app.detectMultipleHendersonTags(s));
  assert.deepEqual(t('「安静にしていると良くないんですね。」「痛かったら、これ、自分でできるかな?」と話す。').slice(0, 1), [14]);
  assert.ok(!t('「手術をしたら、ゆっくりたべなきゃいけないんだよね。」と話す。').includes(10));
  assert.deepEqual(t('「手術をしたら、ゆっくりたべなきゃいけないんだよね。」と話す。').slice(0, 2), [2, 14]);
  assert.equal(t('「これで肺炎になりにくくなるんだったよね?このやり方で大丈夫?」と話す。')[0], 14);
  ['【疼痛時指示】1PCA', 'Plt 23.6 ×10^4/μL', 'アミラーゼ 106 U/L', 'Stage 1B', '「手術って合併症があるんだね。怖いね」'].forEach(x => assert.ok(!t(x).includes(9), x));
  assert.ok(t('転倒の危険があり、見守りが必要').includes(9));
});
