'use strict';

//

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const app = loadApp();
const { groupClinicalPhrasesWithTimestamps } = app;

test('改行で折り返された「●ラベル」＋「数値、続き」が1つの所見に結合される（利用者からの報告事例・生テキスト）', () => {
  const text = '●創部（腹部 3か所）：出血なし、●吻合部背面ドレーン：淡血性5ml、●左横隔膜下ドレーン\n10ml、●挿入部異常なし。抜去、閉塞なし。挿入部を数えると「分かりました」と話す。';
  const extracted = groupClinicalPhrasesWithTimestamps(text);
  const joined = extracted.map(e => e.text).find(t => t.includes('左横隔膜下ドレーン'));
  assert.ok(joined, '「左横隔膜下ドレーン」を含むカードが抽出されるはず');
  assert.ok(joined.includes('左横隔膜下ドレーン：10ml'), 'ラベルと値が1つの所見として結合されるはず（コロンで正しく連結）');
  assert.ok(!extracted.some(e => e.text.trim() === '左横隔膜下ドレーン' || e.text.trim() === '●左横隔膜下ドレーン'), '値の無い意味の無いラベルだけの断片は残らないはず');
  assert.ok(!extracted.some(e => /^10ml/.test(e.text.trim())), 'ラベルの無い数値だけで始まる断片は残らないはず');
});

test('同じ内容が改行無しの1行にまとまっている場合と同じ結果になる（回帰確認・結合後は既存の列挙処理に委ねる）', () => {
  const wrapped = '●創部（腹部 3か所）：出血なし、●吻合部背面ドレーン：淡血性5ml、●左横隔膜下ドレーン\n10ml、●挿入部異常なし。抜去、閉塞なし。';
  const unwrapped = '●創部（腹部 3か所）：出血なし、●吻合部背面ドレーン：淡血性5ml、●左横隔膜下ドレーン：10ml、●挿入部異常なし。抜去、閉塞なし。';
  assert.deepEqual(
    groupClinicalPhrasesWithTimestamps(wrapped).map(e => e.text),
    groupClinicalPhrasesWithTimestamps(unwrapped).map(e => e.text)
  );
});

test('「●ラベル」の直後の行が数値から始まらない場合は結合しない（誤爆防止の回帰確認）', () => {

  const text = '【挿入したもの】●Aライン、Vライン●胃（左55cm固定）退室時去、●吻合部背面ドレーン\n左横隔膜下ドレーン、●硬膜外チューブ（Th7/8）';
  const extracted = groupClinicalPhrasesWithTimestamps(text);

  assert.ok(!extracted.some(t => /吻合部背面ドレーン：?左横隔膜下ドレーン/.test(t.text)), '値を伴わないデバイス名の列挙を誤って結合してはならない');
});
