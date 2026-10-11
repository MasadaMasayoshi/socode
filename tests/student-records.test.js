'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./app-helpers');
const DIR = path.join(__dirname, 'fixtures', 'student-records');
const app = loadApp();
const read = name => fs.readFileSync(path.join(DIR, fs.readdirSync(DIR).find(f => f.startsWith(name))), 'utf8').replace(/\r\n?/g, '\n');
const classify = name => Array.from(app.classifyTextByRules(read(name)), (c, i) => ({ ...c, id: `c${i}`, hendersonIds: Array.from(c.hendersonIds) }));
const find = (cards, re) => cards.find(c => re.test(c.text));
const N = s => String(s).normalize('NFKC').replace(/\s+/g, '').replace(/,/g, '');

test('どの記録でも、患者の情報の数字が消えない（学生の考察・指導者の助言・SOAPのA/Pは除く）', () => {
  fs.readdirSync(DIR).filter(f => f.endsWith('.txt')).forEach(f => {
    const text = read(f.slice(0, 4));
    const cards = Array.from(app.classifyTextByRules(text));
    const all = N(cards.map(c => `${c.timestamp} ${c.text}`).join('|')).replace(/月/g, '/').replace(/日/g, '');
    let student = false;
    text.split('\n').forEach((raw, i) => {
      const line = raw.trim();
      if (!line || i < 2) return;
      if (/^[【＜<]/.test(line)) student = /考察|振り返|助言|目標|行動計画|整理|学び|感想/.test(line);
      if (student || /学籍番号|^[AP][:：]/.test(line)) return;
      (line.normalize('NFKC').match(/\d+(?:\.\d+)?/g) || []).forEach(n => assert.ok(all.includes(n), `${f}：「${n}」が消えた（${line}）`));
    });
  });
});

test('母性（帝王切開後）：日付の見出しの日と時刻、書かれた基準値と↓↑、児の値は母親の表に入れない、考察・助言は不要', () => {
  const cards = classify('st07');
  assert.equal(find(cards, /^T 37\.3/).timestamp, '術後1日目 6:00');
  const hb = find(cards, /^Hb 9\.8/);
  assert.equal(hb.text, 'Hb 9.8 g/dL↓ (基準値: 11.6〜14.8)');
  assert.equal(hb.type, 'o');
  assert.equal(find(cards, /^CRP/).text, 'CRP 3.2 mg/dL↑ (基準値: 0.14以下)');
  const baby = cards.filter(c => /^児：/.test(c.text));
  assert.ok(baby.length >= 4 && baby.some(c => /HR 132/.test(c.text)));
  const rows = app.buildLabTrendTable(cards).rows.map(r => r.key);
  assert.ok(!rows.includes('呼吸数'), '児の呼吸数は母親の表に入れない');
  const pulse = app.buildLabTrendTable(cards).rows.find(r => r.key === '脈拍');
  assert.deepEqual(Object.values(pulse.cells).flat().map(x => x.value), ['88']);
  assert.equal(find(cards, /授乳の場面では/).type, 'unnecessary');
  assert.equal(find(cards, /子宮復古は順調/).type, 'unnecessary');
});

test('急性期（イレウス・問題別SOAP）：行の頭の時刻を値の時刻にし、「血液検査(…):」だけのカードを残さない。A・Pは不要', () => {
  const cards = classify('st08');
  assert.equal(find(cards, /^Na 133/).timestamp, '入院3日目 6:00');
  assert.equal(find(cards, /^BT 37\.4/).timestamp, '入院3日目 10:00');
  assert.ok(!find(cards, /^血液検査\(|^バイタル 10:00$/), '見出しと時刻だけのカードは作らない');
  assert.equal(find(cards, /胃管排液量と腹囲が減少/).type, 'unnecessary');
  assert.equal(find(cards, /^「お腹が張って苦しい/).type, 's');
  assert.ok(find(cards, /^絶飲食/).hendersonIds.includes(2));
});

test('慢性期（透析・タブ区切りの検査の表）：表を項目と日付ごとに読み、透析の前後の値を分けて残す', () => {
  const cards = classify('st09');
  assert.ok(!cards.some(c => /^BUN 8 mg/.test(c.text)), '基準値の下限を値と読まない');
  assert.equal(find(cards, /^BUN 78/).text, 'BUN 78 mg/dL (基準値: 8〜20 mg/dL)');
  assert.equal(find(cards, /^BUN 78/).timestamp, '10月2日');
  assert.equal(find(cards, /^BUN 42/).timestamp, '10月7日');
  assert.equal(find(cards, /^透析前/).text, '透析前:体重 62.4kg(DW 60.0kg)、BP 168/92mmHg、HR 78回/分');
  const table = app.buildLabTrendTable(cards);
  assert.ok(table.rows.some(r => r.key === 'P(リン)'), '表の P はリン');
  const bp = table.rows.find(r => r.key === '血圧');
  assert.deepEqual(Object.values(bp.cells).flat().map(x => `${x.value} ${x.note}`), ['168/92 透析前', '132/74 透析後']);
  assert.equal(find(cards, /体重増加が中1日で/).type, 'unnecessary');
});

test('在宅（訪問記録・箇条書き）：訪問の見出しの日時、値の後ろの注記と「整」を同じカードに残す', () => {
  const cards = classify('st10');
  assert.equal(find(cards, /^朝食前血糖 142/).timestamp, '10月7日 14:00');
  assert.equal(find(cards, /^朝食前血糖 128/).timestamp, '10月14日 14:00');
  assert.ok(find(cards, /HbA1c 7\.8% \(9\/30 受診時\)/));
  assert.ok(find(cards, /P 72回\/分 整/));
  assert.ok(find(cards, /BP 146\/82mmHg \(家庭血圧手帳:朝 130〜140台\)/));
  assert.ok(!cards.some(c => /^\(/.test(c.text)), 'かっこの注記だけのカードは作らない');
  assert.equal(find(cards, /家族の声かけで改善した/).type, 'unnecessary');
});

test('脳外科（くも膜下出血術後・略語）：「血液検査：Na …↓」を消さない、Day の日', () => {
  const cards = classify('st11');
  const na = find(cards, /^Na 131/);
  assert.equal(na.type, 'o');
  assert.equal(na.text, 'Na 131 mEq/L↓ (基準値: 138〜145)');
  assert.equal(na.timestamp, '術後5日目');
  assert.equal(find(cards, /^Na 134/).timestamp, '術後6日目');
  assert.ok(find(cards, /^瞳孔/).hendersonIds.length > 0);
  assert.equal(find(cards, /清拭、ドレーン管理の見学/).type, 'unnecessary');
});
