'use strict';
// 利用者からの7事例（肺炎・大腸がん術後・心不全・脳梗塞・産褥・小児喘息・糖尿病足病変）のテストで
// 見つかった不具合の修正の確認
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./app-helpers');
const app = loadApp();
const cards = t => Array.from(app.classifyTextByRules(t));
const texts = t => cards(t).map(c => c.text);
const tagsOf = t => Array.from(app.detectMultipleHendersonTags(t)).sort((a, b) => a - b);

test('①文章が消えない：「入院当日の夜は…」の文がそのまま残り、日も入院当日になる', () => {
  const c = cards('入院当日の夜は咳が続き、3時頃に覚醒していた。');
  assert.equal(c.length, 1);
  assert.equal(c[0].text, '入院当日の夜は咳が続き、3時頃に覚醒していた。');
  assert.equal(c[0].timestamp, '入院当日');
  assert.deepEqual(Array.from(c[0].hendersonIds).sort((a, b) => a - b), [1, 5]);
});

test('①公開用の架空7事例で、元の文章の主な文がどこかのカードに残っている', () => {
  const cases = require('./public-case-helpers').loadPublicCases();
  assert.equal(cases.length, 7);
  cases.forEach(({id:f,text:src}) => {
    const all = cards(src).map(c => c.text).join('\n').replace(/\s/g, '');
    // 20文字以上の文（「」の外で句点まで）の言葉がカードに残っていること
    const sentences = src.split(/\r?\n/).flatMap(l => l.split(/(?<=。)(?![^「]*」)/)).map(s => s.trim())
      .filter(s => s.length >= 20 && !/^#/.test(s) && !/^[【＜]/.test(s));
    assert.ok(sentences.length > 0, `${f}: 検証する文がない`);
    // 発言や値は取り出して並べ替えるので、文の2文字の組（漢字・かな）の6割以上がどこかに残っていればよい
    const bigrams = x => x.split(/[^ぁ-んァ-ヶ一-龠々]+/).flatMap(k => { const out = []; for (let i = 0; i + 1 < k.length; i++) out.push(k.slice(i, i + 2)); return out; });
    const lost = sentences.filter(s => {
      if (/^血液検査[^：:]*[:：]/.test(s)) {
        // 表の前置き語は除去される仕様。代わりに明示された数値の欠落を確認する。
        const values = s.replace(/^血液検査[^：:]*[:：]/,'').replace(/,/g,'').match(/\d+(?:\.\d+)?/g) || [];
        const output = all.normalize('NFKC').replace(/,/g,'');
        return !values.length || values.some(v=>!new RegExp(`(?<![\\d.])${v.replace(/\./g,'\\.')}(?![\\d.])`).test(output));
      }
      const b = bigrams(s);
      return b.length && b.filter(x => all.includes(x)).length / b.length < 0.6;
    });
    assert.equal(lost.length, 0, `${f}: ${JSON.stringify(lost.slice(0, 5))}`);
  });
});

test('②発言を取り出した後に「と本人は」「との言葉も聞かれる」のような壊れた残りが出ない', () => {
  const t = texts('14:00\n「早く帰りたい」と本人は繰り返し話している。\n15:00\n「足が痛い」との言葉も聞かれる。');
  assert.ok(!t.some(x => /^(?:と本人|との言葉|と話|と訴)/.test(x)), JSON.stringify(t));
});

test('④見出し：# の題名は不要カード、### 術後1日目 は日の区切り、【産褥1日目 7:00】は日と時刻', () => {
  const c = cards('# 事例9 テスト\n## 形式：時系列\n### 術後1日目\n8:00\n創部に出血なし。');
  assert.equal(c[0].type, 'unnecessary');
  assert.equal(c[1].type, 'unnecessary');
  assert.equal(c[2].timestamp, '術後1日目 8:00');
  const v = cards('【産褥1日目 7:00】\nT 36.8℃\nP 78回/分\nBP 112/68mmHg');
  assert.equal(v.length, 1, JSON.stringify(v.map(x => x.text)));
  assert.equal(v[0].timestamp, '産褥1日目 7:00');
  assert.match(v[0].text, /T 36\.8°C/);
  assert.match(v[0].text, /BP 112\/68mmHg/);
  assert.match(v[0].text, /P 78回\/分/);
  assert.ok(Array.from(v[0].hendersonIds).includes(1) && Array.from(v[0].hendersonIds).includes(7));
  const n = cards('入院2日目\n10:00\n翌日、病棟内を歩行した。');
  assert.equal(n[0].timestamp, '入院3日目');
  assert.equal(n[0].text, '病棟内を歩行した。');
});

test('⑤会話形式：看護師の問いは答えのカードに（問い：…）で付く・「妻：「…」」は家族の発言', () => {
  const c = cards('看護師：「昨日は眠れましたか」\n「あまり眠れなかった」');
  assert.equal(c.length, 1, JSON.stringify(c.map(x => x.text)));
  assert.equal(c[0].text, '「あまり眠れなかった」（問い：昨日は眠れましたか）');
  assert.deepEqual(Array.from(c[0].hendersonIds), [5]);
  const f = cards('妻：「最近食べる量が減っていました」');
  assert.equal(f[0].type, 's');
  assert.ok(app.isFamilySpeech(f[0].text));
  // 問いの文はタグの判定に使わない
  assert.deepEqual(tagsOf('「大丈夫です」（問い：トイレは行けていますか）'), tagsOf('「大丈夫です」'));
});

test('⑥「、」で終わる行・発言だけの行・「と話す。」の行を1つの文につなぐ', () => {
  const t = texts('トイレに誘導すると、\n「まだ大丈夫」\n「あとで行く」\nと話す。');
  assert.deepEqual(t, ['トイレに誘導すると、「まだ大丈夫」「あとで行く」と話す。']);
  // 発言だけの行が並んでいるだけ（後に「と話す」が無い）ときは今まで通り別のカード
  const sep = texts('16:00\n「トイレへ行けるようになって良かった。」\n「ごめんなさいね。迷惑かけますね」');
  assert.equal(sep.length, 2, JSON.stringify(sep));
});

test('⑧足りなかった語：産科・食事・排泄・姿勢・環境・学び', () => {
  assert.ok(tagsOf('子宮底は臍下1横指、悪露は赤色で中等量。').includes(9));
  assert.ok(tagsOf('授乳時に乳頭の痛みあり。').includes(2));
  assert.ok(tagsOf('いつもはご飯を茶碗1杯食べる。').includes(2));
  assert.ok(tagsOf('尿意がはっきりしない。').includes(3));
  assert.ok(tagsOf('立位時に膝折れがある。').includes(4));
  assert.ok(tagsOf('足の傷が悪化した。').includes(9));
  assert.ok(tagsOf('薬を飲み忘れることが多い。').includes(14));
  assert.ok(tagsOf('大腸がんの手術目的で入院。').includes(3) || app.detectDiagnosisTagHints('大腸がん').includes(3));
  // 広すぎる語で余計なタグが付かない（受傷・麻酔からの覚醒・出産歴）
  assert.ok(!tagsOf('今回の受傷について: 息子たちの前では、気丈な言動あり').includes(9));
  assert.ok(!tagsOf('麻酔からの覚醒も良好。').includes(5));
  assert.deepEqual(tagsOf('生殖: 特に問題なし 出産歴2回、閉経50歳'), []);
  assert.ok(tagsOf('パート勤務。').includes(12));
  assert.ok(!tagsOf('妻:58歳、主婦、同居、パートで働いている').includes(12));
});

test('⑦「随時血糖」「空腹時血糖」の「随時・空腹時」を消さず、随時・食後の血糖には空腹時の基準値を付けない', () => {
  const t = texts('HbA1c 9.1％、随時血糖246mg/dL。');
  assert.ok(t.includes('血糖(随時) 246 mg/dL'), JSON.stringify(t));
  assert.ok(!t.some(x => /^随時/.test(x)), JSON.stringify(t));
  assert.deepEqual(texts('空腹時血糖 130mg/dL'), ['血糖(空腹時) 130 mg/dL (基準値: 70〜109 mg/dL)']);
  // 値を抜いた後に「血液検査では。」のような前置きだけの文を残さない
  const r = texts('入院時\n血液検査ではWBC 14,200/μL、CRP 12.8mg/dL。');
  assert.ok(!r.some(x => /^血液検査では/.test(x)), JSON.stringify(r));
});
