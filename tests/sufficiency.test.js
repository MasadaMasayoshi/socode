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
  const ctl = app.sufficiencyControlHtml(cp, 3);
  assert.doesNotMatch(ctl, /<button|ルール判定/);
  assert.match(ctl, /術前の充足状態.*判定保留.*術後の充足状態.*未充足/);
  assert.match(app.sufficiencyReasonHtml(cp, 3), /根拠：/);
  assert.doesNotMatch(app.sufficiencyReasonHtml(cp, 3), /ルール判定|サイト内|AIなし/);
  app.ensureMyAssessment(cp, 3).interpretation = '排便がない';
  assert.match(app.buildMyAssessmentsText(cp), /3\. 排泄\n・入院前：判定保留.*\n・入院後：未充足.*リスクが考えられるため、未充足。/);
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
  assert.equal(app.getSufficiency(cp, 12, 'post'), ''); // 情報不足は判定保留
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
  assert.match(app.sufficiencySentence(cp, 3, 'pre'), /判定保留。$/);
});

test('共通ルール：入院前・入院後それぞれで自立して満たされているかを見る（術前の基準は入院前、問題は入院後）', () => {
  const mk = (id, text, ts, h, col) => ({ id, type: 'o', text, timestamp: ts, hendersonIds: h, assessmentCols: Object.fromEntries(h.map(x => [x, col])) });
  const cp = { id: 'p', myAssessments: {}, items: [
    mk('a', '呼吸状態:呼吸器疾患既往なし SpO2 98%', '術前', [1], 'postadmission'),
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
