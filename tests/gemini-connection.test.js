'use strict';
// APIキーの種類の見分け・送り先とモデルの選択・エラーの日本語化（「API設定をしたのにAIが使えない」への対応）
// 2026年から Google AI Studio のキーは「AQ.…」の新しい形式になった。AQ. も Gemini API に送り、キーはヘッダーで渡す。
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-helpers');

const STUDIO = 'AIzaSyA' + 'x'.repeat(32);
const AQ = 'AQ.Ab8RN6' + 'y'.repeat(40);

function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
}
// 起動時のサーバー読み込み（/api/...）は今まで通り空の答えを返し、Googleへの通信だけを模擬する
function googleOnly(fn) {
  return async (url, opts) => (/googleapis\.com/.test(String(url)) ? fn(String(url), opts || {}) : { ok: true, status: 200, json: async () => [], text: async () => '' });
}
function res(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}
const OK = { candidates: [{ content: { parts: [{ text: 'OK' }] } }] };

test('貼り付けたキーの余分な文字（空白・改行・引用符・key=）を取り除く', () => {
  const app = loadApp();
  assert.equal(app.normalizeApiKey(`  "${STUDIO}"\n`), STUDIO);
  assert.equal(app.normalizeApiKey(`GEMINI_API_KEY=${STUDIO}`), STUDIO);
  assert.equal(app.normalizeApiKey(`「${AQ}」`), AQ);
});

test('キーの種類を見分ける（AQ.もAIzaもGoogle AI Studioのキー）', () => {
  const app = loadApp();
  assert.equal(app.detectApiKeyKind(STUDIO).kind, 'studio');
  assert.equal(app.detectApiKeyKind(AQ).kind, 'studio_aq');
  assert.match(app.detectApiKeyKind(AQ).label, /AI Studio/);
  assert.equal(app.detectApiKeyKind('').kind, 'empty');
  assert.equal(app.detectApiKeyKind('ya29.abcdef').kind, 'oauth');
  assert.equal(app.detectApiKeyKind('hello').kind, 'unknown');
});

test('送り先：AQ.もGemini API（AI Studio）を先に試し、キーはURLではなくヘッダーで渡す', async () => {
  const app = loadApp({ localStorage: memoryStorage() });
  assert.deepEqual(Array.from(app.geminiEndpointOrder(STUDIO)), ['studio']);
  assert.deepEqual(Array.from(app.geminiEndpointOrder(AQ)), ['studio', 'vertex']);
  const calls = [];
  const app2 = loadApp({ localStorage: memoryStorage(), fetch: googleOnly(async (url, opts) => { calls.push({ url, headers: opts.headers }); return res(200, OK); }) });
  const r = await app2.testGeminiConnection(AQ);
  assert.equal(r.ok, true, r.message);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-flash-latest:generateContent$/);
  assert.equal(calls[0].headers['x-goog-api-key'], AQ);
  assert.ok(!calls[0].url.includes(AQ), 'キーをURLに入れない');
});

test('モデルが使えない（提供終了）と言われたら、使えるモデルの一覧から最新のFlashに切り替えて覚える', async () => {
  const ls = memoryStorage();
  const calls = [];
  const fetch = googleOnly(async url => {
    calls.push(url);
    if (/\/models\?pageSize/.test(url)) return res(200, { models: [
      { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.8-flash-tts', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] }
    ] });
    if (url.includes('gemini-flash-latest')) return res(401, { error: { message: 'Request had invalid authentication credentials.', status: 'UNAUTHENTICATED', details: [{ reason: 'ACCESS_TOKEN_TYPE_UNSUPPORTED' }] } });
    if (url.includes('gemini-3.8-flash:')) return res(200, OK);
    return res(404, { error: { message: 'not found' } });
  });
  // 提供の終わったモデルでは、認証の失敗に見える 401（理由は details の ACCESS_TOKEN_TYPE_UNSUPPORTED）が返る
  const app = loadApp({ localStorage: ls, fetch });
  const r = await app.testGeminiConnection(AQ);
  assert.equal(r.ok, true, r.message);
  assert.equal(ls.getItem('gemini_model'), 'gemini-3.8-flash');
  assert.ok(calls.some(u => /\/models\?pageSize/.test(u)));
  assert.match(r.message, /gemini-3\.8-flash/);
});

test('chooseBestFlashModel：lite・音声・画像・プレビューを除き、いちばん新しい安定版のFlash', () => {
  const app = loadApp();
  const pick = names => app.chooseBestFlashModel(names.map(n => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })));
  assert.equal(pick(['gemini-3.6-flash', 'gemini-3.10-flash', 'gemini-3.8-flash-lite', 'gemini-3.8-flash-tts']), 'gemini-3.10-flash');
  assert.equal(pick(['gemini-3-flash-preview']), 'gemini-3-flash-preview');
  assert.equal(pick([]), null);
});

test('AI Studioでキーが通らなければVertex AIも試し、つながった送り先を覚える', async () => {
  const ls = memoryStorage();
  const fetch = googleOnly(async url => {
    if (url.includes('generativelanguage')) return res(400, { error: { message: 'API key not valid. Please pass a valid API key.' } });
    return res(200, OK);
  });
  const app = loadApp({ localStorage: ls, fetch });
  const r = await app.testGeminiConnection(AQ);
  assert.equal(r.ok, true, r.message);
  assert.equal(ls.getItem('gemini_api_endpoint'), 'vertex');
});

test('エラーは次にすべきことが分かる日本語で返す', async () => {
  const cases = [
    [400, 'API key not valid. Please pass a valid API key.', /APIキーが正しくありません/],
    [403, 'Requests from referer <empty> are blocked.', /使ってよいWebサイト/],
    [403, 'Generative Language API has not been used in project 123 before or it is disabled.', /有効になっていません/],
    [429, 'Resource has been exhausted', /上限/],
    [503, 'The model is overloaded.', /混み合って/]
  ];
  for (const [status, message, re] of cases) {
    const app = loadApp({ localStorage: memoryStorage(), setTimeout: fn => { fn(); return 0; }, fetch: googleOnly(async () => res(status, { error: { message } })) });
    const r = await app.testGeminiConnection(STUDIO);
    assert.equal(r.ok, false);
    assert.match(r.message, re, `${status} ${message} → ${r.message}`);
    assert.ok(r.message.includes(message), 'Googleからの説明も添える');
  }
});

test('2か所とも断られたら、もう一方の結果も添える', async () => {
  const fetch = googleOnly(async url => (url.includes('aiplatform')
    ? res(403, { error: { message: 'Agent Platform API has not been used in project 1 before or it is disabled.' } })
    : res(400, { error: { message: 'API key not valid. Please pass a valid API key.' } })));
  const app = loadApp({ localStorage: memoryStorage(), fetch });
  const r = await app.testGeminiConnection(AQ);
  assert.equal(r.ok, false);
  assert.match(r.message, /APIキーが正しくありません/);
  assert.match(r.message, /Vertex AI 側でも失敗：HTTP 403/);
});

test('通信そのものができないときは、ネットワークや拡張機能を確かめるよう伝える', async () => {
  const app = loadApp({ localStorage: memoryStorage(), fetch: googleOnly(async () => { throw new TypeError('Failed to fetch'); }) });
  const r = await app.testGeminiConnection(STUDIO);
  assert.equal(r.ok, false);
  assert.match(r.message, /接続できませんでした/);
});

test('アクセストークン（ya29.）や空欄は送らずに案内する', async () => {
  let called = false;
  const app = loadApp({ localStorage: memoryStorage(), fetch: googleOnly(async () => { called = true; return res(200, {}); }) });
  assert.match((await app.testGeminiConnection('ya29.abc')).message, /APIキーではなく/);
  assert.match((await app.testGeminiConnection('')).message, /入力してください/);
  assert.equal(called, false);
});

test('設定画面に接続テストのボタンがある', () => {
  const fs = require('fs'); const path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="btn-test-api"/);
  assert.match(html, /id="api-test-result"/);
  assert.match(html, /id="api-key-kind"/);
});

test('混雑（503）のときは少し待って送り直し、通ればそのまま使う（利用者からの報告：ずっと混雑と出る）', async () => {
  const calls = [];
  let n = 0;
  const app = loadApp({ localStorage: memoryStorage(), setTimeout: fn => { fn(); return 0; }, fetch: googleOnly(async url => {
    calls.push(url);
    n++;
    return n < 3 ? res(503, { error: { status: 'UNAVAILABLE', message: 'The model is overloaded. Please try again later.' } }) : res(200, OK);
  }) });
  const r = await app.testGeminiConnection(STUDIO);
  assert.equal(r.ok, true, r.message);
  assert.equal(calls.length, 3, '2回まで送り直す');
  assert.ok(calls.every(u => /gemini-flash-latest/.test(u)));
});

test('送り直しても混雑なら別のモデル（安定版のFlash-Lite）に切り替える。普段のモデルとしては覚えず、30分だけ先に使う', async () => {
  const ls = memoryStorage();
  const calls = [];
  const app = loadApp({ localStorage: ls, setTimeout: fn => { fn(); return 0; }, fetch: googleOnly(async url => {
    calls.push(url);
    if (/\/models\?pageSize/.test(url)) return res(200, { models: [{ name: 'models/gemini-3.6-flash' }, { name: 'models/gemini-3.6-flash-lite' }] });
    if (/gemini-flash-latest/.test(url)) return res(503, { error: { status: 'UNAVAILABLE', message: 'The model is overloaded.' } });
    return res(200, OK);
  }) });
  const r = await app.testGeminiConnection(STUDIO);
  assert.equal(r.ok, true, r.message);
  assert.ok(calls.some(u => /gemini-3\.6-flash-lite:generateContent/.test(u)), JSON.stringify(calls));
  assert.equal(ls.getItem('gemini_model'), null, '一時的な切り替え先はモデルとして覚えない');
  assert.equal(JSON.parse(ls.getItem('gemini_busy_model')).model, 'gemini-3.6-flash-lite');
  // 次の依頼は、混雑回避で使えたモデルに最初から送る（待たされない）
  calls.length = 0;
  const r2 = await app.testGeminiConnection(STUDIO);
  assert.equal(r2.ok, true);
  assert.match(calls[0], /gemini-3\.6-flash-lite:generateContent/);
  assert.match(r2.message, /gemini-3\.6-flash-lite/);
});

test('1日の回数の上限（429・PerDay）は同じモデルに送り直さず、どれも使えなければ上限の説明を出す', async () => {
  const calls = [];
  const app = loadApp({ localStorage: memoryStorage(), setTimeout: fn => { fn(); return 0; }, fetch: googleOnly(async url => {
    calls.push(url);
    if (/\/models\?pageSize/.test(url)) return res(200, { models: [] });
    return res(429, { error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 250, GenerateRequestsPerDayPerProjectPerModel' } });
  }) });
  const r = await app.testGeminiConnection(STUDIO);
  assert.equal(r.ok, false);
  assert.match(r.message, /今日のAIの利用回数の上限/);
  const gen = calls.filter(u => /generateContent/.test(u));
  assert.equal(gen.filter(u => /gemini-flash-latest/.test(u)).length, 1, '同じモデルには送り直さない');
  assert.ok(gen.length <= 5);
});

test('「API設定」で「軽くて混みにくい」を選ぶと、最初から Flash-Lite に送る', async () => {
  const ls = memoryStorage();
  ls.setItem('gemini_model_pref', 'lite');
  const calls = [];
  const app = loadApp({ localStorage: ls, fetch: googleOnly(async url => { calls.push(url); return res(200, OK); }) });
  const r = await app.testGeminiConnection(STUDIO);
  assert.equal(r.ok, true);
  assert.match(calls[0], /gemini-flash-lite-latest:generateContent/);
  assert.equal(ls.getItem('gemini_model'), null, '選んだモデルは普段のモデルの記録を上書きしない');
});
