'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const { groupClinicalPhrasesWithTimestamps, detectMultipleHendersonTags } = loadApp();
const extract = t => Array.from(groupClinicalPhrasesWithTimestamps(t.normalize('NFKC')));
const cards = t => extract(t).filter(c => !c.isUnnecessaryBoilerplate);

test('「21時」のように分の無い時刻は、カードにならず次の行の日時になる', () => {
  const c = cards(['21時', '血圧100〜110/80〜70mmHg'].join('\n'));
  assert.ok(!c.some(x => x.text === '21時'));
  assert.equal(c.find(x => x.text.startsWith('血圧')).timestamp, '21:00', '「21時」は「21:00」にそろえる');
  assert.ok(!cards('3時間おきに体位変換').some(x => x.timestamp === '3時'), '「3時間」は時刻ではない');
});

test('「受持ち開始」（学生の受け持ちの記述）は不必要な情報', () => {
  const all = extract('術後1日目 受持ち開始');
  const item = all.find(x => x.text.includes('受持ち開始'));
  assert.ok(item && item.isUnnecessaryBoilerplate);
});

test('予定表の列見出し（術後1日目〜術後4〜5日目・退院目標(2W後)）はカードにならず、後の行の日時も上書きしない', () => {
  const text = ['8:00 回診', 'リハビリテーションスケジュール：術後1日目から開始', '術後1日目', '術後2日目', '術後3日目', '術後4〜5日目', '退院目標（2W後）', '介助で車椅子'].join('\n');
  const c = cards(text);
  assert.ok(!c.some(x => /4〜5日目|退院目標\(2W後\)/.test(x.text)), JSON.stringify(c.map(x => x.text)));
  assert.equal(c.find(x => x.text.includes('介助で車椅子')).timestamp, '8:00', '見出しの前の日時に戻る');
  assert.ok(cards('退院目標：杖歩行で自宅退院').some(x => x.text.includes('杖歩行')), '中身のある退院目標はカードのまま');
});

test('「ガーゼ汚染なし」は前の行（創部の観察）の続きとして1枚になり、タグ（9.環境）が付く', () => {
  const c = cards(['8:00 回診', '創部 軽度腫脹と熱感あるが、発赤・出血・排膿なし', 'ガーゼ汚染なし'].join('\n'));
  const wound = c.find(x => x.text.includes('ガーゼ汚染なし'));
  assert.ok(wound, 'ガーゼ汚染なしのカードは残る');
  assert.ok(!detectMultipleHendersonTags(wound.text).includes(9));
});

test('前の行が離れている・日時が違う・検査値の場合は、続きとしてまとめない（誤結合の防止）', () => {
  const c = cards(['8:00 回診', '創部 軽度腫脹と熱感あるが、発赤・出血・排膿なし', '10:00', 'ガーゼ汚染なし'].join('\n'));
  assert.ok(c.some(x => x.text === 'ガーゼ汚染なし'), '日時が違えばまとめない');
  const d = cards(['体温 36.7度', 'ガーゼ汚染なし'].join('\n'));
  assert.ok(d.some(x => x.text === 'ガーゼ汚染なし'), '検査値・バイタルのカードにはまとめない');
});

test('キルシュナー牽引は4、輸液量・住居は9（患者34でタグ未設定だったもの）', () => {
  assert.ok(detectMultipleHendersonTags('入院後、キルシュナー牽引4kg実施。').includes(4));
  assert.ok(!detectMultipleHendersonTags('輸液量:2,320ml、').includes(9), '輸液は9.環境にしない');
  assert.ok(detectMultipleHendersonTags('住居: 2階建て(階段あり)').includes(9));
});
