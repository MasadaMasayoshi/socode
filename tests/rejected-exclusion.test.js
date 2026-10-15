const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();

const SOURCE = `事例

患者プロフィール
氏名 : Aさん(仮名)
年齢 : 28歳、女性、会社員(事務職)
既往歴 : 特記事項なし
現病歴 : 2年前に全身性エリテマトーデスと診断。プレドニゾロン内服で症状コントロールしていたが、再燃のため入院。

現症
主訴 : 倦怠感、顔面の蝶形紅斑、微熱、関節痛
バイタル : T 37.6℃、P 92/分、BP 134/82mmHg、SpO2 98% (RA)

生活状況
日常生活は自立

全身症状
発熱、全身倦怠感、
疲れやすい、
体重減少など

脱毛
光線過敏症

肺・心膜
胸の痛み、動悸、息切れ
(胸膜炎、心外膜炎)など

神経
けいれん、頭痛、不安感、
抑うつ状態、認知障害など

蝶形紅斑、円板状皮疹

手指の皮膚
凍瘡様紅斑、レイノー現象など

関節痛
足や顔のむくみ
(ループス腎炎)など

筋肉痛、関節痛など

出血傾向
貧血(めまいなど)、
出血など
`;
const card = (text, extra = {}) => ({ id: 'c_' + text, text, timestamp: '日時不明', type: 'unclassified', hendersonIds: [], assessmentCols: {}, predictionSource: 'confirmed',
  editLog: [{ at: '2026-10-14T09:12:00Z', kind: 'type', actor: 'user', from: 'unnecessary', to: 'unclassified' }], ...extra });

test('a card only taken out of 不必要 is not treated as a classification decision', () => {
  assert.strictEqual(app.isRejectedExclusionOnly(card('脱毛')), true);
  assert.strictEqual(app.isRejectedExclusionOnly(card('脱毛', { tagNotNeeded: true })), false);
  assert.strictEqual(app.isRejectedExclusionOnly(card('脱毛', { hendersonIds: [8] })), false);
  assert.strictEqual(app.isRejectedExclusionOnly(card('脱毛', { editLog: [{ kind: 'text', actor: 'user' }] })), false);
  assert.strictEqual(app.savedUntaggedProtection(card('脱毛'), {}), '');
  assert.strictEqual(app.savedUntaggedProtection(card('脱毛', { tagNotNeeded: true }), {}), 'タグ不要の指定');
});

test('such cards get the latest rule tags, keeping id and text; real decisions stay untouched', () => {
  const kept = card('光線過敏症', { tagNotNeeded: true });
  const cp = { id: 'p', sourceText: SOURCE, items: [card('脱毛'), card('関節痛'), kept] };
  app.refreshSavedUntaggedCards(cp, SOURCE);
  const by = t => cp.items.find(i => i.text === t);
  assert.ok(by('脱毛').hendersonIds.length > 0 && by('脱毛').id === 'c_脱毛');
  assert.ok(by('関節痛').hendersonIds.length > 0);
  assert.strictEqual(by('脱毛').type, 'o');
  assert.deepStrictEqual(JSON.stringify(by('光線過敏症').hendersonIds), '[]');
});
