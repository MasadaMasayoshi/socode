'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

function setupIsolatedDataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nursing-test-'));
  process.env.NURSING_DATA_DIR = dir;
  return dir;
}

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
