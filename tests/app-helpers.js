'use strict';
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

const APP_JS_PATH = path.join(__dirname, '..', 'app.js');

function stubEl() {
  return {
    value: '', innerHTML: '', textContent: '', checked: false,
    addEventListener() {}, removeEventListener() {},
    style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild() {}, removeChild() {}, replaceChildren() {}, insertBefore() {},
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
function loadApp() {
  const src = fs.readFileSync(APP_JS_PATH, 'utf8');
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

  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'app.js' });

  if (!sandbox.module.exports || Object.keys(sandbox.module.exports).length === 0) {
    throw new Error('app.js の module.exports が空です。エクスポート用ガード節が正しく実行されているか確認してください。');
  }
  return sandbox.module.exports;
}

module.exports = { loadApp };
