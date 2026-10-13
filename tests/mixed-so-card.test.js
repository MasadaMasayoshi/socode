'use strict';
// Speech and observation of the same situation stay in one mixed card (user request), and the relation map still sees both.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');
const app = loadApp();

const TEXT = '術後1日目\n10:00 離床\n10:05 端坐位から車いすへ移乗を行う。上半身を支えることができている。「体重をかけるのは怖い」と話す。';

test('Same-situation speech and observation become one soMixed card', () => {
  const cards = Array.from(app.classifyTextByRules(TEXT)).filter(c => c.type !== 'unnecessary');
  const mixed = cards.filter(c => /体重をかけるのは怖い/.test(c.text));
  assert.equal(mixed.length, 1);
  assert.equal(mixed[0].soMixed, true);
  assert.match(mixed[0].text, /車いすへ移乗/);
  assert.ok(!mixed[0].sceneId);
});

test('Quote-only and observation-only cards are not marked mixed', () => {
  const cards = Array.from(app.classifyTextByRules('術後1日目\n10:00 「痛い」と訴える。\n10:10 体温37.2℃')).filter(c => c.type !== 'unnecessary');
  assert.ok(cards.every(c => !c.soMixed));
});
