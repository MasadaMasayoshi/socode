'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const nodemailer = require('nodemailer');
const RECIPIENT = 'hikaru3365@gmail.com';
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function createClassificationMail({ dataDir, env = process.env, transportFactory = nodemailer.createTransport, log = console } = {}) {
  const dir = path.join(dataDir, 'classification-mail');
  const running = new Map();
  let transport;
  const error = (message, status) => Object.assign(new Error(message), { status });
  function settings() {
    const port = Number(env.SMTP_PORT || 465);
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM) throw error('メール送信設定が未完了です', 503);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw error('メール送信設定を確認してください', 503);
    return { host: env.SMTP_HOST, port, secure: port === 465, requireTLS: port !== 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }, connectionTimeout: 15000, socketTimeout: 30000,
      disableFileAccess: true, disableUrlAccess: true };
  }
  function validate(body) {
    if (!body || !/^classification_[A-Za-z0-9_-]{10,100}$/.test(body.id || '') ||
      typeof body.backupText !== 'string' || typeof body.reviewText !== 'string') throw error('送信データが不正です', 400);
    if (Buffer.byteLength(body.backupText) + Buffer.byteLength(body.reviewText) > MAX_ATTACHMENT_BYTES) throw error('添付データが大きすぎます', 413);
    let backup;
    try { backup = JSON.parse(body.backupText); } catch (_) { throw error('保存データが不正です', 400); }
    const keys = new Set(['schemaVersion', 'exportedAt', 'patients', 'currentPatientId', 'learningUserDict']);
    if (!backup || backup.schemaVersion !== 1 || !Array.isArray(backup.patients) || !backup.patients.length ||
      Object.keys(backup).some(k => !keys.has(k))) throw error('保存データが不正です', 400);
    return { id: body.id, backupText: body.backupText, reviewText: body.reviewText };
  }
  async function save(file, job) {
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temp, JSON.stringify(job), { mode: 0o600 });
    try { await fs.rename(temp, file); } finally { await fs.rm(temp, { force: true }); }
  }
  async function deliver(payload) {
    const hash = crypto.createHash('sha256').update(payload.backupText).update('\0').update(payload.reviewText).digest('hex');
    const file = path.join(dir, `${payload.id}.json`);
    let job;
    try { job = JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (job && job.hash !== hash) throw error('同じ送信番号の内容が一致しません', 409);
    if (job?.status === 'sent') return { ok: true, sent: true, duplicate: true, id: payload.id };
    if (!job) {
      job = { ...payload, hash, status: 'pending', savedAt: new Date().toISOString() };
      await save(file, job); // Save the complete backup before any external transmission.
    }
    const config = settings();
    if (!transport) transport = transportFactory(config);
    try {
      const result = await transport.sendMail({ from: env.SMTP_FROM, to: RECIPIENT,
        subject: '看護アセスメント：分類後の自動保存・修正依頼',
        text: '分類完了時の保存データと修正依頼を添付します。',
        messageId: `<${payload.id}@socode.local>`,
        attachments: [
          { filename: `nursing_assessment_all_patients_${payload.id}.json`, content: Buffer.from(payload.backupText, 'utf8'), contentType: 'application/json; charset=utf-8' },
          { filename: `correction_request_${payload.id}.txt`, content: Buffer.from(payload.reviewText, 'utf8'), contentType: 'text/plain; charset=utf-8' }
        ], disableFileAccess: true, disableUrlAccess: true });
      if (!Array.isArray(result.accepted) || !result.accepted.some(a => String(a).toLowerCase() === RECIPIENT)) throw error('メール送信先が受理されませんでした', 503);
      job.status = 'sent'; job.sentAt = new Date().toISOString();
      await save(file, job);
      return { ok: true, sent: true, id: payload.id };
    } catch (e) {
      log.warn('Classification delivery failed; private backup retained:', e.code || 'delivery-error');
      throw error('メール送信を完了できませんでした。保存データは再送待ちです', 503);
    }
  }
  function send(body) {
    const payload = validate(body);
    // Serializing same-ID retries prevents duplicate concurrent sends.
    const previous = running.get(payload.id) || Promise.resolve();
    const pending = previous.catch(() => {}).then(() => deliver(payload));
    running.set(payload.id, pending);
    pending.finally(() => { if (running.get(payload.id) === pending) running.delete(payload.id); }).catch(() => {});
    return pending;
  }
  return { send };
}
module.exports = { createClassificationMail, RECIPIENT };
