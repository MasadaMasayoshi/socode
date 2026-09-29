'use strict';
// 書き出しで「何がどう編集されたか」を示す機能と、短すぎる断片の結合の検証。
// 利用者からの要望：「単体で情報カードにあるのが変な情報たちです（「入室」「全身麻酔」等）。
// テキストを書き出すときに何かしら編集されていた場合、何がどう編集されたかわかるように書き出しを
// するようにしてください。あと分類前の文章も一緒に書き出すようにしてください」。

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const { describeAutoRewrite, buildSelectedCardsExportText, groupClinicalPhrasesWithTimestamps } = loadApp();
const cardsOf = text => Array.from(groupClinicalPhrasesWithTimestamps(text.normalize('NFKC'))).filter(i => !i.isUnnecessaryBoilerplate);
const rewrite = (src, text, item, items) => Array.from(describeAutoRewrite(src, text, item || { text }, items || []) || []);

test('アプリによる書き換え：元の文章のままのカードは「なし」（空配列）', () => {
  assert.deepEqual(rewrite('嘔気・嘔吐なし', '嘔気・嘔吐なし'), []);
  assert.deepEqual(rewrite('排尿: 7回/日程度（夜間2回）自立', '排尿: 7回/日程度(夜間2回)自立'), [], '全角/半角の違いは書き換えとして挙げない');
});

test('アプリによる書き換え：表の3行をまとめ、表の基準値を付け、単位を補ったことが分かる', () => {
  const src = ['WBC (白血球)', '8.1-9.0×10³/μL', '8100/μL', '10,200'].join('\n');
  const notes = rewrite(src, 'WBC (白血球) 10,200/μL (基準値: 8.1-9.0×10^3/μL)');
  assert.ok(notes.some(n => /表の基準値の列「8\.1-9\.0×10\^3\/μL」/.test(n)));
  assert.ok(notes.some(n => /元の文章の4行/.test(n)));
  assert.ok(notes.some(n => /「10,200」に単位「\/μL」を補った/.test(n)));
});

test('アプリによる書き換え：元の文章に無い基準値を補ったことが分かる', () => {
  const notes = rewrite('Hb 10.8g/dl', 'Hb 10.8 g/dL (基準値: 11.5〜16.5 g/dL)');
  assert.ok(notes.some(n => /基準値「11\.5〜16\.5 g\/dL」をアプリが補った（元の文章には無い）/.test(n)));
});

test('アプリによる書き換え：行頭の日時を外したこと、同じ行の残りを別のカードに分けたことが分かる', () => {
  assert.ok(rewrite('9:00 入室', '入室', { text: '入室', timestamp: '9:00' }).some(n => /行頭の「9:00」を本文から外し/.test(n)));
  const items = [{ text: '意識レベルクリア' }, { text: '会話可能' }];
  assert.ok(rewrite('意識レベルクリア、会話可能', '意識レベルクリア', items[0], items).some(n => /同じ行の「、会話可能」は別のカードに分けた/.test(n)));
});

test('アプリによる書き換え：見出し行から見出しを先頭に付けたことが分かる', () => {
  const src = ['疼痛:', '安静時ペインスケール「2-3」'].join('\n');
  assert.ok(rewrite(src, '疼痛: 安静時ペインスケール「2-3」').some(n => /見出し「疼痛」を先頭に付けた/.test(n) || /2行/.test(n)));
});

test('手で編集した履歴：本文の編集・分類の変更・タグの追加削除・統合が書き出される', () => {
  const cp = { title: 'X', items: [{
    id: 'a', type: 's', timestamp: '入院時', text: '疼痛あり', hendersonIds: [4],
    editLog: [
      { at: '2026-09-27T13:00:00Z', kind: 'text', from: '疼痛', to: '疼痛あり' },
      { at: '2026-09-27T13:01:00Z', kind: 'type', from: 'o', to: 's' },
      { at: '2026-09-27T13:02:00Z', kind: 'tagAdd', hId: 4 },
      { at: '2026-09-27T13:03:00Z', kind: 'tagRemove', hId: 7 },
      { at: '2026-09-27T13:04:00Z', kind: 'merge', from: ['A', 'B'] }
    ]
  }] };
  const out = buildSelectedCardsExportText(cp, ['a'], '疼痛', false);
  assert.match(out, /手で編集した履歴:\n/);
  assert.match(out, /本文を編集: 「疼痛」→「疼痛あり」/);
  assert.match(out, /分類を変更: Oデータ → Sデータ/);
  assert.match(out, /タグを追加: 姿勢/);
  assert.match(out, /タグを削除: 体温/);
  assert.match(out, /2枚のカードを統合: 「A」＋「B」/);
});

test('手で編集していないカードは「手で編集した履歴: なし」', () => {
  const cp = { title: 'X', items: [{ id: 'a', type: 'o', timestamp: '入院時', text: '嘔気・嘔吐なし', hendersonIds: [] }] };
  assert.match(buildSelectedCardsExportText(cp, ['a'], '嘔気・嘔吐なし', false), /手で編集した履歴: なし/);
});

test('「入室」「全身麻酔」のような名詞だけの短い行は、同じ日時の前後のカードにまとまる（利用者からの修正依頼）', () => {
  const cards = cardsOf(['4. 手術当日', '9:00 入室', '右大腿骨人工骨頭置換術 後方アプローチ施行', '全身麻酔', '右大腿部に創あり'].join('\n'));
  assert.ok(cards.some(c => c.text === '入室、右大腿骨人工骨頭置換術 後方アプローチ施行、全身麻酔'));
  assert.ok(!cards.some(c => c.text === '入室' || c.text === '全身麻酔'));
});

test('短くても所見として完結している行（「会話可能」等）や、列挙を分けたカード（「シャワー浴」）はまとめない（誤結合の防止）', () => {
  const a = cardsOf(['12:00', '意識レベルクリア、会話可能'].join('\n')).map(c => c.text);
  assert.ok(a.includes('会話可能'));
  const b = cardsOf('シャワー浴、弾性ストッキング着用').map(c => c.text);
  assert.ok(b.includes('シャワー浴'));
  assert.ok(b.includes('弾性ストッキング着用'));
});
