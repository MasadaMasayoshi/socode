'use strict';
// 主要なAPIエンドポイントのHTTP結合テスト。
// 実際にサーバー(server.jsがエクスポートするExpressアプリ)を一時的なポートで起動し、
// 本物のHTTPリクエストを送って検証する（本番のdata/フォルダとは別の一時フォルダを使う）。
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { setupIsolatedDataDir, startEphemeralServer, baseUrl, stopServer } = require('./helpers');

setupIsolatedDataDir();
const { app } = require('../server.js');

let server, url;

test.before(async () => {
  server = await startEphemeralServer(app);
  url = baseUrl(server);
});

test.after(async () => {
  await stopServer(server);
});

// テストごとに一意なIDを使い、他のテストケースと状態が衝突しないようにする
const uniq = () => crypto.randomBytes(6).toString('hex');

test('患者カルテ: 新規保存したカルテがGET /api/patientsに反映される', async () => {
  const id = 'test_patient_' + uniq();
  const patient = { id, title: 'テスト患者', items: [{ id: 'item1', text: 'カード1', type: 'o' }], updatedAt: new Date().toISOString(), deletedItemIds: [] };
  const putRes = await fetch(`${url}/api/patients/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patient)
  });
  assert.equal(putRes.status, 200, 'PUTは200を返す');
  const putBody = await putRes.json();
  assert.equal(putBody.ok, true);
  assert.equal(putBody.patient.items.length, 1, 'レスポンスに保存後の内容(マージ結果)が含まれる');

  const getRes = await fetch(`${url}/api/patients`);
  const all = await getRes.json();
  assert.ok(all[id], '保存した患者がGET /api/patientsに含まれる');
  assert.equal(all[id].title, 'テスト患者');
});

test('患者カルテ: 同時編集時、片方しか知らないカードが消えずにマージされる（不具合修正の確認）', async () => {
  const id = 'test_concurrent_' + uniq();
  const t0 = new Date();
  const iso = (offsetMs) => new Date(t0.getTime() + offsetMs).toISOString();

  // 端末Aが先に保存（カードXを追加）
  const fromA = {
    id, title: '同時編集テスト', updatedAt: iso(1000),
    items: [{ id: 'itemX', text: 'Aが追加したカード', type: 's', _touchedAt: iso(1000) }],
    deletedItemIds: []
  };
  await fetch(`${url}/api/patients/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fromA) });

  // 端末Bは、Aの追加を知らない（items配列にitemXが無い）まま、患者データを保存する
  const fromB = {
    id, title: '同時編集テスト', updatedAt: iso(2000),
    items: [], // Aが追加したitemXを知らない
    deletedItemIds: []
  };
  const res = await fetch(`${url}/api/patients/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fromB) });
  const body = await res.json();

  assert.ok(body.patient.items.some(i => i.id === 'itemX'), 'Aが追加したカードは、Bの保存でも消えずに残る');
});

test('学習イベント: textが無いと400、正しい形式なら200で学習辞書が更新される', async () => {
  const badRes = await fetch(`${url}/api/learning-event`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'type' })
  });
  assert.equal(badRes.status, 400, 'textが無い場合は400');

  const text = 'テストカード' + uniq();
  const okRes = await fetch(`${url}/api/learning-event`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, action: 'type', payload: { type: 's' } })
  });
  assert.equal(okRes.status, 200, '正しい形式なら200');
  const okBody = await okRes.json();
  assert.equal(okBody.dict[text].preferredType, 's', '学習辞書に分類結果が反映される');

  const logRes = await fetch(`${url}/api/case-log`);
  const log = await logRes.json();
  assert.ok(log.some(e => e.text === text), '事例ログにも記録される');
});

test('情報カードの報告: cardTextが無いと400、送ると記録され、同じセッションIDは1件にまとまる', async () => {
  const badRes = await fetch(`${url}/api/card-reports`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment: 'テスト' })
  });
  assert.equal(badRes.status, 400, 'cardTextが無い場合は400');

  const sessionId = 'session_' + uniq();
  await fetch(`${url}/api/card-reports`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, cardText: '1件目の報告', comment: 'コメント1' })
  });
  await fetch(`${url}/api/card-reports`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, cardText: '2件目の報告', comment: 'コメント2' })
  });

  const listRes = await fetch(`${url}/api/card-reports`);
  const list = await listRes.json();
  const group = list.find(g => g.sessionId === sessionId);
  assert.ok(group, '報告のグループが作られる');
  assert.equal(group.items.length, 2, '同じセッションIDからの2件は1つのグループにまとまる');
});

test('情報カードの報告: 極端に長い本文は上限の文字数に切り詰められて保存される', async () => {
  const sessionId = 'session_long_' + uniq();
  const longText = 'x'.repeat(5000); // 上限(2000文字)より長い
  await fetch(`${url}/api/card-reports`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, cardText: longText })
  });
  const listRes = await fetch(`${url}/api/card-reports`);
  const list = await listRes.json();
  const group = list.find(g => g.sessionId === sessionId);
  assert.ok(group.items[0].cardText.length <= 2000, '保存される本文は上限文字数以内に切り詰められる');
});

test('抽出・分類基準への要望: 追加・一覧取得・削除が一通り行える', async () => {
  const text = '追加テスト要望' + uniq();
  const addRes = await fetch(`${url}/api/extraction-criteria`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text })
  });
  assert.equal(addRes.status, 200);
  const afterAdd = await addRes.json();
  const entry = afterAdd.find(c => c.text === text);
  assert.ok(entry, '追加した要望が一覧に含まれる');

  const delRes = await fetch(`${url}/api/extraction-criteria/${entry.id}`, { method: 'DELETE' });
  const afterDel = await delRes.json();
  assert.ok(!afterDel.some(c => c.id === entry.id), '削除した要望は一覧から消える');
});

test('参照元リンク: 初回起動時、以前から基準ノート本体に埋め込まれていたNotebookLMリンクが初期登録されており、通常の参照元と同様に編集・削除できる', async () => {
  const listRes = await fetch(`${url}/api/reference-sources`);
  const list = await listRes.json();
  const defaultEntry = list.find(r => r.id === 'refsrc_default_notebooklm');
  assert.ok(defaultEntry, '初期登録されたNotebookLMリンクが一覧に含まれる');
  assert.equal(defaultEntry.url, 'https://notebook.google.com/notebook/7015c97f-8d93-419e-9871-a6e6f2b00b44/preview', '基準ノート本体に元々書かれていたリンクと一致する');

  // 通常の参照元と全く同じPUT/DELETEで編集・削除できることを確認する（特別扱いではない）
  const putRes = await fetch(`${url}/api/reference-sources/${defaultEntry.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '編集後のタイトル', url: defaultEntry.url, content: '貼り付けた内容' })
  });
  assert.equal(putRes.status, 200, '初期登録されたリンクも他の参照元と同様にPUTで編集できる');
  const afterUpdate = await putRes.json();
  assert.equal(afterUpdate.find(r => r.id === defaultEntry.id).title, '編集後のタイトル');

  const delRes = await fetch(`${url}/api/reference-sources/${defaultEntry.id}`, { method: 'DELETE' });
  const afterDel = await delRes.json();
  assert.ok(!afterDel.some(r => r.id === defaultEntry.id), '初期登録されたリンクも他の参照元と同様にDELETEで削除できる');
});

test('参照元リンク: 胃がん周術期看護の参照元（Google Docsソースを統合したもの）が初期登録されており、通常の参照元と同様に編集・削除できる', async () => {
  const listRes = await fetch(`${url}/api/reference-sources`);
  const list = await listRes.json();
  const gastricEntry = list.find(r => r.id === 'refsrc_gastric_cancer_perioperative');
  assert.ok(gastricEntry, '初期登録された胃がん周術期看護の参照元が一覧に含まれる');
  assert.equal(gastricEntry.url, 'https://docs.google.com/document/d/1bzNk5nDwyJTohdFfgk5pDFRBpJIpiAD2ycA48MIrzXw/edit?usp=sharing');
  assert.ok(gastricEntry.content && gastricEntry.content.includes('胃がん'), '統合済みの内容が含まれる');

  const putRes = await fetch(`${url}/api/reference-sources/${gastricEntry.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '編集後のタイトル', url: gastricEntry.url, content: gastricEntry.content })
  });
  assert.equal(putRes.status, 200, '初期登録されたリンクも他の参照元と同様にPUTで編集できる');
  const afterUpdate = await putRes.json();
  assert.equal(afterUpdate.find(r => r.id === gastricEntry.id).title, '編集後のタイトル');

  const delRes = await fetch(`${url}/api/reference-sources/${gastricEntry.id}`, { method: 'DELETE' });
  const afterDel = await delRes.json();
  assert.ok(!afterDel.some(r => r.id === gastricEntry.id), '初期登録されたリンクも他の参照元と同様にDELETEで削除できる');
});

test('参照元リンク: title/urlが無いと400、追加・一覧取得・編集・削除が一通り行える', async () => {
  const noTitleRes = await fetch(`${url}/api/reference-sources`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com' })
  });
  assert.equal(noTitleRes.status, 400, 'titleが無い場合は400');

  const noUrlRes = await fetch(`${url}/api/reference-sources`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'テスト参照元' })
  });
  assert.equal(noUrlRes.status, 400, 'urlが無い場合は400');

  const title = 'テスト参照元' + uniq();
  const url1 = 'https://notebook.google.com/notebook/test-' + uniq();
  const addRes = await fetch(`${url}/api/reference-sources`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, url: url1, content: '貼り付けた内容' })
  });
  assert.equal(addRes.status, 200);
  const afterAdd = await addRes.json();
  const entry = afterAdd.find(r => r.title === title);
  assert.ok(entry, '追加した参照元が一覧に含まれる');
  assert.equal(entry.url, url1);
  assert.equal(entry.content, '貼り付けた内容');

  const listRes = await fetch(`${url}/api/reference-sources`);
  const list = await listRes.json();
  assert.ok(list.some(r => r.id === entry.id), 'GET /api/reference-sourcesの一覧にも反映される');

  const updatedTitle = title + '(更新後)';
  const putRes = await fetch(`${url}/api/reference-sources/${entry.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: updatedTitle, url: url1, content: '更新後の内容' })
  });
  assert.equal(putRes.status, 200);
  const afterUpdate = await putRes.json();
  const updatedEntry = afterUpdate.find(r => r.id === entry.id);
  assert.equal(updatedEntry.title, updatedTitle, '編集した名前が反映される');
  assert.equal(updatedEntry.content, '更新後の内容', '編集した内容が反映される');

  const putMissingRes = await fetch(`${url}/api/reference-sources/nonexistent_${uniq()}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'x', url: 'https://example.com' })
  });
  assert.equal(putMissingRes.status, 404, '存在しないIDの編集は404');

  const delRes = await fetch(`${url}/api/reference-sources/${entry.id}`, { method: 'DELETE' });
  const afterDel = await delRes.json();
  assert.ok(!afterDel.some(r => r.id === entry.id), '削除した参照元は一覧から消える');
});

// 「分類前の文章」履歴（抽出前の文章ビューア）は、同じ内容がカルテスナップショットに
// 保存されるようになったため廃止した（利用者からの要望：「学習データ管理の分類前文章はいりません」）。
// 古いエンドポイントが残っていないことを確認する。
test('抽出前の文章履歴のエンドポイントは廃止されている', async () => {
  const getRes = await fetch(`${url}/api/extraction-log`);
  assert.equal(getRes.status, 404, 'GET /api/extraction-logはもう存在しない');
  const postRes = await fetch(`${url}/api/extraction-log`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '何か' + uniq() })
  });
  assert.equal(postRes.status, 404, 'POST /api/extraction-logももう存在しない');
});

// カルテスナップショットは「保存されない」報告があった不具合の対策として、保存の都度
// バイト数上限で古いものから間引くようにした（詳細はserver.jsのPATIENT_SNAPSHOT_MAX_BYTES参照）。
// 上限を大きく超える量を送っても、常に最新の記録が残り、一覧取得が壊れないことを確認する。
test('カルテスナップショット: サイズ上限を超えても最新の記録は残り、一覧取得は壊れない', async () => {
  const patientId = 'p_' + uniq();
  // 1回で6MB前後になるよう、大きめのsourceTextを持つ患者を複数含めて何度か送る
  const bigSourceText = 'あ'.repeat(50000); // サーバー側で50000文字にcapされる上限そのもの
  for (let i = 0; i < 8; i++) {
    const res = await fetch(`${url}/api/patient-snapshot`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: 'client_' + uniq(),
        patients: Array.from({ length: 20 }, (_, j) => ({
          patientId: `${patientId}_${i}_${j}`,
          patientTitle: `テスト患者${i}-${j}`,
          items: [{ id: 'item1', text: 'カード内容' }],
          sourceText: bigSourceText
        }))
      })
    });
    assert.equal(res.status, 200, `${i}回目の送信は成功する`);
  }

  const listRes = await fetch(`${url}/api/patient-snapshots`);
  assert.equal(listRes.status, 200, '間引き後も一覧取得は200で返る');
  const list = await listRes.json();
  const approxBytes = Buffer.byteLength(JSON.stringify(list), 'utf8');
  assert.ok(approxBytes < 8 * 1024 * 1024, `MongoDBの1ドキュメント上限(16MB)に対して十分小さい範囲に収まっている（実測 ${approxBytes} バイト）`);
  assert.ok(list.some(e => e.patientId.startsWith(`${patientId}_7_`)), '最後に送った最新の記録は間引かれず残っている');
});

test('事例ログ・情報カードの報告のアーカイブ取得エンドポイントも配列を返す', async () => {
  const caseLogArchiveRes = await fetch(`${url}/api/case-log/archive`);
  assert.ok(Array.isArray(await caseLogArchiveRes.json()));
  const cardReportsArchiveRes = await fetch(`${url}/api/card-reports/archive`);
  assert.ok(Array.isArray(await cardReportsArchiveRes.json()));
});
