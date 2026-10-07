'use strict';
// 改善点ファイル（患者21）への対応：①発言の途中で行が分かれたとき ②見出し（担当看護師より・本人より）の発言者の引き継ぎ ③ガーゼ汚染なし→9
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();

test('空行で分かれた発言の続きは1枚のS、観察は別のO（同じ日時）', () => {
  const src = ['術後2日目', '10:00 検温', '', '「体がべたべたして気持ちが悪い。髪も気持ち悪くなってきた。', '', '早く動けるようになってお風呂には入れるといいんだけど・・・」', '', '皮膚のべたつきあり、頭髪もべたつきあり、掻痒感はない。臭いはない。'].join('\n');
  const c = app.classifyTextByRules(src);
  const s = c.find(x => /体がべたべた/.test(x.text));
  const o = c.find(x => /皮膚のべたつきあり/.test(x.text));
  assert.ok(s && o, JSON.stringify(c.map(x => x.text)));
  assert.equal(s.type, 's');
  assert.match(s.text, /お風呂には入れる/, '発言の続きがSに入る');
  assert.doesNotMatch(s.text, /皮膚のべたつき/);
  assert.equal(o.type, 'o');
  assert.equal(o.timestamp, s.timestamp, '同じ日時（同じ場面）');
});

test('「担当看護師より」「本人より」は空行をはさんでも発言者を引き継ぎ、見出しだけのカードを作らない（看護師の説明はO、本人はS）', () => {
  const src = ['術後2日目', '15:00', '', '担当看護師より', '', '「今、少しずつリハビリを進めている状況であり、徐々に歩行できるようになってくる。」', '', '「PTの計画をもとにRHを行っており、無理はしないようにしてほしい。」', '', '本人より', '', '「まだ手術したばっかりやからゆっくりしか動けんけど、足が痛い。」', '', '「手術した足をつくのは怖くて不安です。」'].join('\n');
  const c = app.classifyTextByRules(src);
  assert.ok(!c.some(x => /^(?:担当看護師|本人)より$/.test(x.text.trim())), '見出しだけのカードは無い：' + JSON.stringify(c.map(x => x.text)));
  const nurse = c.find(x => /^担当看護師より「今、/.test(x.text));
  const self = c.find(x => /^本人より「まだ/.test(x.text));
  assert.ok(nurse && self);
  assert.equal(nurse.type, 'o');
  assert.equal(self.type, 's');
});

test('ガーゼ汚染の観察は創部の語が無くても9.環境。感染の有無はタグで判定しない', () => {
  const c = app.classifyTextByRules('術後2日目\n8:00 回診\n\n創部 軽度腫脹と熱感あるが、発赤・出血・排膿なし\n\nガーゼ汚染なし\n\n10:00 検温\n\nガーゼ汚染なし');
  const g = c.filter(x => /ガーゼ汚染なし/.test(x.text));
  assert.ok(g.length >= 1);
  g.forEach(x => assert.ok((x.hendersonIds || []).includes(9), x.text));
});
