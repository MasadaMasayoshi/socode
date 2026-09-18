'use strict';
// テスト共通のユーティリティ。
// 各テストファイルは、server.js をrequireする前に setupIsolatedDataDir() を呼び、
// 本番の data/ フォルダとは別の一時フォルダを使うようにする（実データを一切触らない）。
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

function setupIsolatedDataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nursing-test-'));
  process.env.NURSING_DATA_DIR = dir;
  return dir;
}

// server.js がエクスポートするExpressアプリ(app)を、実際に空いているポートで一時的に待ち受け、
// テスト終了時に閉じられるようにする。テストはfetchで本物のHTTPリクエストを送る。
function startEphemeralServer(app) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function baseUrl(server) {
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

function stopServer(server) {
  return new Promise(resolve => server.close(() => resolve()));
}

module.exports = { setupIsolatedDataDir, startEphemeralServer, baseUrl, stopServer };
