const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();
const mk = (text, n, extra) => ({ id: 'p', title: 'T', sourceText: text, items: [Object.assign({ id: 'a', type: 'o', text, timestamp: '入院3日目', hendersonIds: [n], assessmentCols: { [n]: 'postadmission' } }, extra || {})], myAssessments: {}, carePlans: {}, missingChecks: {} });
const v = (text, n, extra) => app.ruleSufficiencyFor(mk(text, n, extra))[n].post.verdict;
const rules = t => Array.from(app.sufficiencyScaleRules(t));

test('Barthel item scores: need-specific met / unmet; a normal item never unmet; no scale or item name -> not parsed', () => {
  assert.strictEqual(v('Barthel 食事10点', 2), 'met');
  assert.strictEqual(v('Barthel 食事5点', 2), 'unmet');
  assert.strictEqual(v('Barthel 排尿10点', 3), 'met');
  assert.strictEqual(v('Barthel 排便0点', 3), 'unmet');
  assert.strictEqual(v('Barthel 歩行15点', 4), 'met');
  assert.strictEqual(v('Barthel 移乗5点', 4), 'unmet');
  assert.strictEqual(v('Barthel 更衣10点', 6), 'met');
  assert.strictEqual(v('Barthel 更衣5点', 6), 'unmet');
  assert.strictEqual(v('Barthel 入浴5点', 8), 'met');
  assert.strictEqual(v('Barthel 入浴0点', 8), 'unmet');
  assert.strictEqual(rules('Barthel 食事10点、更衣10点、入浴5点').filter(x => x.v === 'unmet').length, 0);
  assert.strictEqual(rules('食事5点').length, 0);              // no scale name
  assert.strictEqual(rules('Barthel 10点').length, 0);          // no item name
  assert.strictEqual(v('Barthel 食事5点', 3), 'unknown');       // item rules act only on their own need
});

test('5 睡眠 / 7 体温 cues', () => {
  assert.strictEqual(v('連続2時間未満しか眠れず、日中の眠気がある', 5), 'unmet');
  assert.strictEqual(v('睡眠7時間以上で良眠感あり', 5), 'met');
  assert.strictEqual(v('本日は検査があった', 5), 'unknown');
  assert.strictEqual(v('発汗が多く、暑くて眠れない', 7), 'unmet');
  assert.strictEqual(v('室温調整が可能で寒暖の訴えなし', 7), 'met');
  assert.notStrictEqual(v('発汗なし', 7), 'unmet');
});

test('9 環境', () => {
  assert.strictEqual(v('転倒アセスメントスコアは高リスク', 9), 'unmet');
  assert.strictEqual(v('認知混乱があり、ベッド柵なし', 9), 'unmet');
  assert.strictEqual(v('段差があり、コードが放置されている', 9), 'unmet');
  assert.strictEqual(v('意識清明でナースコールは手元にある', 9), 'met');
  assert.notStrictEqual(v('転倒防止策を実施。低リスク', 9), 'unmet');
  assert.strictEqual(v('環境状況は不明', 9), 'unknown');
});

test('11 信仰/スピリチュアル: explicit distress or practice only; no statement -> 情報不足', () => {
  assert.strictEqual(v('死への恐怖があり、生きる意味がわからないと話す', 11), 'unmet');
  assert.strictEqual(v('スピリチュアルペインの訴えあり', 11), 'unmet');
  assert.strictEqual(v('毎朝の祈りを継続できている', 11), 'met');
  assert.strictEqual(v('家族の協力で礼拝を継続している', 11), 'met');
  assert.strictEqual(v('信仰表明なし', 11), 'unknown');
  assert.strictEqual(v('信仰の有無は確認できず', 11), 'unknown');
  assert.strictEqual(v('「納得して治療を受けたい」と話す', 11), 'unknown');
});

test('12 仕事 / 13 余暇 / 14 学習', () => {
  assert.strictEqual(v('仕事ができず、周囲に迷惑がかかると話す', 12), 'unmet');
  assert.strictEqual(v('退職後は地域活動に参加し満足している', 12), 'met');
  assert.strictEqual(v('退職している', 12), 'unknown');           // retired alone is not 未充足
  assert.strictEqual(v('趣味の園芸ができなくなり、意欲低下がある', 13), 'unmet');
  assert.strictEqual(v('趣味再開の意欲あり', 13), 'met');
  assert.strictEqual(v('GDS-15 8点', 13), 'unmet');
  assert.notStrictEqual(v('GDS-15 3点', 13), 'unmet');
  assert.strictEqual(rules('8点').length, 0);                      // scale name required
  assert.strictEqual(v('退院指導に協力的で、病状を理解している', 14), 'met');
  assert.strictEqual(v('学習困難があり、関心が低下している', 14), 'unmet');
  assert.strictEqual(v('MMSE 20点', 14), 'unmet');
  assert.notStrictEqual(v('MMSE 29点', 14), 'unmet');
});

test('missing-information phrases give 情報不足, not 未充足', () => {
  ['確認不可', '患者発言なし', '環境状況不明'].forEach(t => [9, 10, 11, 14].forEach(n => assert.strictEqual(v(t, n), 'unknown', `${t}/${n}`)));
});

test('cause hints: bone/pain -> 体力, depression -> 意思力, not understanding -> 知識, pain + passive -> 体力+意思力', () => {
  const h = t => Array.from(app.sufficiencyCauseHint(t));
  assert.deepStrictEqual(h('骨折'), ['体力']);
  assert.deepStrictEqual(h('抑うつ'), ['意思力']);
  assert.deepStrictEqual(h('理解できない'), ['知識']);
  assert.deepStrictEqual(h('疼痛で動作が消極的'), ['体力', '意思力']);
});

test('generic case patterns', () => {
  const surg = { id: 'p', title: 'T', sourceText: '', myAssessments: {}, carePlans: {}, missingChecks: {}, items: [
    { id: 'a', type: 'o', text: '利き手側の骨折で更衣に部分介助が必要', timestamp: '術後1日目', hendersonIds: [6], assessmentCols: { 6: 'postadmission' } },
    { id: 'b', type: 'o', text: '夜間に認知混乱があり、ベッド柵なし', timestamp: '術後1日目', hendersonIds: [9], assessmentCols: { 9: 'postadmission' } }] };
  const r = app.ruleSufficiencyFor(surg);
  assert.strictEqual(r[6].post.verdict, 'unmet'); assert.strictEqual(r[9].post.verdict, 'unmet');
  assert.strictEqual(v('毎朝の祈りを継続できている', 11), 'met');
  assert.strictEqual(v('退職後は地域活動に参加し満足している', 12), 'met');
  assert.strictEqual(v('死への恐怖があり、生きる意味がわからない', 11), 'unmet');
  assert.match(app.sufficiencyPhaseText(mk('死への恐怖があり、生きる意味がわからない', 11), 11, 'post'), /未充足である。$/);
});
