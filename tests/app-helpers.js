'use strict';

//

//

//   if (typeof module !== 'undefined' && module.exports) { module.exports = {...}; }

const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

  APP_SCRIPT_FILES.forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(ROOT_DIR, f), 'utf8'), sandbox, { filename: f });
  });

  if (!sandbox.module.exports || Object.keys(sandbox.module.exports).length === 0) {
    throw new Error('app.js の module.exports が空です。エクスポート用ガード節が正しく実行されているか確認してください。');
  }
  return sandbox.module.exports;
}

module.exports = { loadApp, readAppSource, APP_SCRIPT_FILES };
