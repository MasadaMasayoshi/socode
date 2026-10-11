'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { readAppSource } = require('./app-helpers');
const app = readAppSource();
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const fnBody = name => {
  const start = app.indexOf(`window.${name} = function`);
  assert.ok(start >= 0, `${name} が見つからない`);
  return app.slice(start, app.indexOf('\n    };', start));
};

test('一覧のカードのクリック・チェックは selectCardFromOverview を呼ぶ（ボードへの移動だけではない）', () => {
  const build = app.slice(app.indexOf('function buildCardOverviewHtml'), app.indexOf('function fitCardOverview'));

  assert.match(build, /onclick="selectCardFromOverview\('\$\{safeDomId\(i\.id\)\}', true\)"/);
  assert.match(build, /onchange="selectCardFromOverview\('\$\{safeDomId\(i\.id\)\}', this\.checked\)"/);
  assert.doesNotMatch(build, /closeCardOverview\(\); jumpToBoardCard/);
});

test('選択すると一覧を閉じて元の文章を表示し、それまでの選択は保持する', () => {
  const body = fnBody('selectCardFromOverview');
  assert.match(body, /selectedCardIds\.add\(id\)/);
  assert.doesNotMatch(body, /selectedCardIds\.clear\(\)/);
  assert.match(body, /showSourceHighlight\(item\)/);
  assert.match(body, /modal-card-overview'\)\.classList\.add\('hidden'\)/);
  assert.match(body, /cardOverviewReturnState = \{ untaggedOnly: cardOverviewUntaggedOnly/);
});

test('「一覧に戻る」ボタンが元の文章の帯と一括操作の帯にあり、同じ状態の一覧を開き直す', () => {
  assert.match(html, /id="btn-source-back-to-overview" onclick="openCardOverview\(true\)"/);
  assert.match(html, /id="btn-bulk-back-to-overview" onclick="openCardOverview\(true\)"/);
  assert.match(fnBody('openCardOverview'), /restore \? cardOverviewReturnState : null/);
});

test('一覧を Esc で閉じても選択は解除されない', () => {
  const esc = app.slice(app.indexOf("if (e.key !== 'Escape') return;"), app.indexOf('function renderSoBoard'));
  assert.match(esc, /e\.stopImmediatePropagation\(\);\s*closeCardOverview\(\);/);
});

test('最小の文字でも1画面に収まらないときはページに分け、前へ／次へ（←→キー）で切り替える', () => {
  assert.match(html, /id="card-overview-pager" class="ov-pager hidden"/);
  assert.match(html, /id="btn-ov-prev" onclick="changeCardOverviewPage\(-1\)"/);
  assert.match(html, /id="btn-ov-next" onclick="changeCardOverviewPage\(1\)"/);
  const fit = app.slice(app.indexOf('function fitCardOverview'), app.indexOf('function renderCardOverviewPage'));
  assert.match(fit, /cardOverviewOverflows\(body\)/);
  assert.match(fit, /cardOverviewPageRanges = ranges/);
  assert.match(fnBody('changeCardOverviewPage'), /renderCardOverviewPage\(\)/);
  assert.match(fnBody('selectCardFromOverview'), /page: cardOverviewPage/, '一覧に戻ったときに同じページを開く');
  assert.match(app, /e\.key === 'ArrowLeft' \|\| e\.key === 'ArrowRight'/);
});
