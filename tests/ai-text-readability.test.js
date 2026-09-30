'use strict';
// AIの文章を読みやすく（利用者からの要望：「AIが作成した文章をもう少し読みやすく、要点を分かりやすく」）
//  ・前置き（「〜の視点から…まとめました」）と区切り線を取り除く
//  ・見出し（###）・箇条書き（* - 1.）・引用（>）を記号のまま出さず、見出し・箇条書きにする
//  ・【要点】は枠で囲む。根拠のカードの後ろに取り残されていた「。」を前に移す
//  ・AIへの指示文で、最初に要点を書かせ、前置きを書かせない
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, readAppSource } = require('./app-helpers');
const app = loadApp();
const src = readAppSource();

// 利用者の書き出し（患者38）に出ていたAIの答えの形
const LAB = `熟練した看護師長・指導者の視点から、ご提示いただいた患者のOデータおよび「NotebookLM 基準ノート」の検査値評価規則に基づき、総合評価欄向けに臨床的意味を解説・アセスメント文章としてまとめました。
---
### 要点
* WBC・CRPが高く、感染による炎症が強い〔C2〕。
* SpO2 93%で酸素化が低下している〔C1〕。
### 【総合評価：検査値・バイタルサインの臨床的アセスメント】
#### 1. 呼吸器・循環動態の評価
* バイタル・所見：SpO2 93%（room air）と軽度低酸素血症を認めます〔C1〕。
  さらに喘鳴を聴取します。
* 臨床的意味：呼吸状態の継続的なモニタリングが必要です〔C1〕〔C1〕。
---
> 本患者は、市中肺炎に伴う換気障害が生じている。
1. 呼吸数の推移
2. 喀痰の性状`;

test('前置き・区切り線を消し、見出し・箇条書き・引用を表示用の形にする（記号のまま出さない）', () => {
  const ev = app.buildEvidenceIndex([{ id: 'a', type: 'o', text: '体温37.8°C、SpO2 93%' }, { id: 'b', type: 'o', text: 'WBC 11200' }]);
  const html = app.formatAiResultHtml(LAB, undefined, ev);
  assert.doesNotMatch(html, /視点から|まとめました/, '前置きは消す');
  assert.doesNotMatch(html, /###|####|^\* |<p>\* |---|&gt; 本患者/, '記号のまま出さない');
  assert.match(html, /<div class="ai-key"><div class="ai-key-title"><i[^>]*><\/i> 要点<\/div><ul class="ai-list"><li>WBC・CRPが高く、感染による炎症が強い。<span[^>]*ai-evidence-chip/);
  assert.match(html, /<h4 class="ai-h">総合評価：検査値・バイタルサインの臨床的アセスメント<\/h4>/);
  assert.match(html, /<h4 class="ai-h">1\. 呼吸器・循環動態の評価<\/h4>/);
  assert.match(html, /<li><b class="ai-label">臨床的意味<\/b>：/);
  assert.match(html, /を認めます。<span[^>]*>〔O 体温37\.8°C、SpO…〕<\/span><br>さらに喘鳴を聴取します。/, '「。」は番号の前・字下げした続きは同じ項目');
  assert.equal((html.match(/必要です。<span/g) || []).length, 1);
  assert.equal((html.match(/必要です。<span[^>]*>[^<]*<\/span><span/g) || []).length, 0, '同じ番号が続いたら1つ');
  assert.match(html, /<blockquote class="ai-quote">本患者は、市中肺炎に伴う換気障害が生じている。<\/blockquote>/);
  assert.match(html, /<ol class="ai-list"><li>呼吸数の推移<\/li><li>喀痰の性状<\/li><\/ol>/);
});

test('HTMLとして解釈しない・空の答えは代わりの文', () => {
  const html = app.formatAiResultHtml('### <img src=x onerror=alert(1)>\n- SpO2 <90%');
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /SpO2 &lt;90%/);
  assert.match(app.formatAiResultHtml('', '結果なし'), /結果なし/);
});

test('看護計画の叩き台の新しい形（見出し・番号付き）も「看護計画」タブに取り込める', () => {
  const html = app.formatAiResultHtml('### 要点\n- 呼吸を最優先\n### ■非効果的呼吸様式\n#### 目標\n1. SpO2 95%以上を保つ\n#### OP（観察計画）\n1. 呼吸数の推移\n2. 喀痰の性状\n#### TP（援助計画）\n1. ファーラー位を保つ\n#### EP（教育計画）\n1. 息苦しいときは知らせるよう説明する');
  const plans = app.parseCarePlanText(app.htmlToPlainText ? app.htmlToPlainText(html) : html.replace(/<[^>]+>/g, '\n'));
  assert.equal(plans.length, 1);
  assert.equal(plans[0].problem, '非効果的呼吸様式');
  assert.equal(plans[0].goalShort, 'SpO2 95%以上を保つ');
  assert.deepEqual(JSON.parse(JSON.stringify(plans[0].op)), ['呼吸数の推移', '喀痰の性状']);
  assert.deepEqual(JSON.parse(JSON.stringify(plans[0].ep)), ['息苦しいときは知らせるよう説明する']);
});

test('AIへの指示文：最初に要点・前置きなし・短い箇条書き。NotebookLM に問い合わせているような言い方をしない', () => {
  assert.match(src, /const AI_STYLE_INSTRUCTION = '【書き方】前置き・あいさつ/);
  assert.equal((src.match(/\$\{AI_STYLE_INSTRUCTION\}/g) || []).length, 3, '検査値・矛盾チェック・経時変化');
  assert.match(src, /最初に「### 要点」として看護問題の優先順位/);
  assert.match(src, /最初に「### 要点」として、いちばん大事な助言/);
  assert.doesNotMatch(src, /「NotebookLM 基準ノート」の検査値評価規則|【NotebookLM 基準ノート】/);
});

test('不足情報のAI推定：推定し直すと、前回のAI推定のうち未確認・未編集のものは置き換える（増え続けない）', () => {
  assert.match(src, /function isUntouchedAiMissing\(cp, i\)/);
  const cp = { items: [
    { id: 'a1', type: 'o', text: '原因: A', aiSuggested: true, hendersonIds: [2], assessmentCols: { 2: 'missing' } },
    { id: 'a2', type: 'o', text: '原因: B', aiSuggested: true, hendersonIds: [3], assessmentCols: { 3: 'missing' }, editLog: [{ kind: 'text' }] },
    { id: 'a3', type: 'o', text: '原因: C', aiSuggested: true, hendersonIds: [5], assessmentCols: { 5: 'missing' } },
    { id: 'm1', type: 'o', text: '普段の排便', hendersonIds: [3], assessmentCols: { 3: 'missing' } }
  ] };
  app.setMissingCheck(cp, 'a3', { status: 'checked', result: 'よく眠れている' });
  assert.deepEqual(cp.items.filter(i => app.isUntouchedAiMissing(cp, i)).map(i => i.id), ['a1']);
});

test('書き出し：不足情報はS/Oの表に混ぜず、確認状況といっしょに別の節にする', () => {
  const cp = { title: 'P', items: [
    { id: 'o1', type: 'o', text: '体温38.2°C', timestamp: '入院時', hendersonIds: [7], assessmentCols: { 7: 'postadmission' } },
    { id: 'm1', type: 'o', text: '原因: 睡眠の記録がない → 夜間の睡眠時間を確かめる', timestamp: 'AI推定', aiSuggested: true, hendersonIds: [5], assessmentCols: { 5: 'missing' } }
  ] };
  const txt = app.buildExportPlainText(cp);
  const oSection = txt.slice(txt.indexOf('【3. 客観的情報（Oデータ）】'), txt.indexOf('【不足情報と確認状況】'));
  assert.doesNotMatch(oSection, /睡眠の記録がない/);
  assert.match(txt, /【不足情報と確認状況】\n・\[未確認\] \[AI推定\] 睡眠の記録がない → 夜間の睡眠時間を確かめる/);
});
