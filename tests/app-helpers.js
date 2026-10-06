'use strict';
// 【ファイル分割後】以前の app.js は、内容ごとに js/01〜10 の10ファイルに分けた（改善提案8）。
// ブラウザでは index.html の <script> で順番に読み込み、1つのプログラムとして動く。ここでも
// 同じ順番で同じ1つの環境（vm のコンテキスト）に読み込むので、以下の説明は分割後もそのまま当てはまる。
//
// app.js はブラウザ向けの単一スクリプトで、モジュールとして書かれていないため
// (トップレベルで document.getElementById(...) 等を直接呼び出している)、
// 通常の require() では読み込めない。
// そこで、Node の vm モジュールでブラウザに近い最小限のDOMモック環境を用意し、
// その中で app.js を「まるごと」実行することで、実際にブラウザで動くコードと
// 完全に同一のロジックをテストする（分類ロジックだけを手作業でコピーした
// テスト専用コードを別途保守する、という重複・乖離リスクを避けるため）。
//
// app.js の末尾には
//   if (typeof module !== 'undefined' && module.exports) { module.exports = {...}; }
// というガード付きのエクスポート文があり、これはブラウザでは module が
// 存在しないため常に無視される。ここでは sandbox.module を用意しておくことで
// そのエクスポートを受け取る。

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 読み込む順番（index.html の <script src="js/..."> と同じ順番。tests/app-files-order.test.js で確認）
const APP_SCRIPT_FILES = [
  'js/01-henderson-keywords.js',
  'js/02-reference-data.js',
  'js/03-extraction-helpers.js',
  'js/04-server-sync.js',
  'js/05-app-state-and-ui.js',
  'js/06-export.js',
  'js/07-classification.js',
  'js/08-assessment-tools.js',
  'js/09-board.js',
  'js/10-reference-page-and-startup.js',
  'js/11-own-assessment.js',
  'js/12-missing-checks-and-care-plan.js',
  'js/13-compare-and-report.js',
  'js/14-drug-reference.js',
  'js/15-relation-map.js'
];
const ROOT_DIR = path.join(__dirname, '..');
// すべてのファイルをつなげたプログラムの文章（ソースの中身を確かめるテストで使う）
function readAppSource() {
  return APP_SCRIPT_FILES.map(f => fs.readFileSync(path.join(ROOT_DIR, f), 'utf8')).join('\n');
}

function stubEl() {
  return {
    value: '', innerHTML: '', textContent: '', checked: false,
    addEventListener() {}, removeEventListener() {},
    style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild() {}, append() {}, removeChild() {}, replaceChildren() {}, insertBefore() {},
    contains() { return false; }, hasAttribute() { return false; }, removeAttribute() {},
    scrollIntoView() {}, getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; },
    querySelector() { return stubEl(); }, querySelectorAll() { return []; },
    setAttribute() {}, getAttribute() { return null; },
    click() {}, focus() {}, blur() {}, closest() { return null; }, remove() {}
  };
}

/**
 * app.js を vm サンドボックス内で実際に実行し、
 * module.exports で公開されている分類ロジックの関数・データ一式を返す。
 * (毎回まっさらな状態で読み込むため、テスト間の状態共有は無い)
 */
// overrides：fetch や localStorage などを差し替えたいテスト用（例：AIへの通信を模擬する）
function loadApp(overrides = {}) {
  const sandbox = { console };
  sandbox.window = sandbox;
  sandbox.document = {
    getElementById() { return stubEl(); },
    addEventListener() {}, removeEventListener() {},
    querySelector() { return stubEl(); }, querySelectorAll() { return []; },
    createElement() { return stubEl(); },
    createDocumentFragment() { return stubEl(); },
    documentElement: { getAttribute() { return null; }, setAttribute() {}, classList: { add() {}, remove() {} }, style: {} },
    body: stubEl(), visibilityState: 'visible'
  };
  sandbox.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  sandbox.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  sandbox.fetch = async () => ({ ok: true, json: async () => ([]), text: async () => '' });
  sandbox.setInterval = () => 0;
  sandbox.setTimeout = () => 0;
  sandbox.clearInterval = () => {};
  sandbox.clearTimeout = () => {};
  sandbox.navigator = { onLine: true, clipboard: { writeText: async () => {} } };
  sandbox.location = { href: '', search: '', reload() {} };
  sandbox.history = { replaceState() {}, pushState() {} };
  sandbox.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  sandbox.requestAnimationFrame = () => 0;
  sandbox.alert = () => {};
  sandbox.confirm = () => true;
  sandbox.addEventListener = () => {};
  sandbox.removeEventListener = () => {};
  sandbox.URL = { createObjectURL: () => '', revokeObjectURL() {} };
  sandbox.Blob = function Blob() {};
  sandbox.FileReader = function FileReader() { this.readAsText = () => {}; };
  sandbox.module = { exports: {} };

  Object.assign(sandbox, overrides);
  vm.createContext(sandbox);
  // ブラウザと同じく、ファイルごとに別々のスクリプトとして順番に実行する（トップレベルの const・let・
  // function は、同じ環境の後のファイルからも見える）
  APP_SCRIPT_FILES.forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(ROOT_DIR, f), 'utf8'), sandbox, { filename: f });
  });

  if (!sandbox.module.exports || Object.keys(sandbox.module.exports).length === 0) {
    throw new Error('app.js の module.exports が空です。エクスポート用ガード節が正しく実行されているか確認してください。');
  }
  return sandbox.module.exports;
}

module.exports = { loadApp, readAppSource, APP_SCRIPT_FILES };
