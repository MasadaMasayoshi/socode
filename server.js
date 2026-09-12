// ============================================================================
// 看護アセスメント支援システム - 共有学習用バックエンド
// ----------------------------------------------------------------------------
// 事例研究での利用を想定し、カードの本文・タグ付け・どの欄に割り振られたか・
// どう編集されたかを、そのまま全利用者で共有する。
//
// data/learning-dict.json … テキストごとの「現在の学習結果」
//   { [text]: { preferredType, preferredCols, preferredHendersonIds, updatedAt } }
//   次に同じ文章が出てきたときの自動分類・自動タグ付けに使われる。
//
// data/case-log.json … 「いつ・何が・どう変わったか」を積み上げる生ログ（配列）
//   事例研究でそのまま時系列の分析対象にできる。分類ボードでの変更は
//   即座にこのログと learning-dict の両方に反映され、総合アセスメント表側の
//   自動判定にも次回classify時から使われる。
//
// data/patients.json … 患者カルテ本体（分類ボード・総合アセスメント表の中身、
//   および分類の抽出元になったカルテ本文=sourceText）を { [患者ID]: 患者データ } の
//   形で保存する。これにより同じ患者を別の端末・別のブラウザから開いても同じ内容が
//   見られる（学習データと同様、都度新しいファイルは作らずこの1ファイルに追加・更新・削除する）。
//
// データの永続化は単純なJSONファイルです。件数が増えてきたらSQLite等へ
// 置き換えてください（読み書きは loadJson/persist にまとまっています）。
// ============================================================================

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const DICT_FILE = path.join(DATA_DIR, 'learning-dict.json');
const LOG_FILE = path.join(DATA_DIR, 'case-log.json');
const PATIENTS_FILE = path.join(DATA_DIR, 'patients.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadJson(file, fallback) {
  ensureDataDir();
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

let learningDict = loadJson(DICT_FILE, {});
let caseLog = loadJson(LOG_FILE, []);
let patientsDict = loadJson(PATIENTS_FILE, {}); // { [patientId]: 患者データ（items・sourceText等を含む） }

// 学習専用ファイルを起動時点でフォルダ内に必ず用意しておく（初回アクセス前でも
// data/learning-dict.json・data/case-log.json・data/patients.json が存在する状態にし、
// 以後はこの1つのファイルに追加・削除を重ねていく。新しいファイルを都度作ることはしない）。
ensureDataDir();
if (!fs.existsSync(DICT_FILE)) fs.writeFileSync(DICT_FILE, JSON.stringify(learningDict, null, 2));
if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, JSON.stringify(caseLog, null, 2));
if (!fs.existsSync(PATIENTS_FILE)) fs.writeFileSync(PATIENTS_FILE, JSON.stringify(patientsDict, null, 2));

// 書き込みが競合しないよう、保存処理を1本のPromiseチェーンで直列化する
let writeQueue = Promise.resolve();
function persist() {
  writeQueue = writeQueue.then(() => Promise.all([
    new Promise((resolve, reject) => {
      ensureDataDir();
      fs.writeFile(DICT_FILE, JSON.stringify(learningDict, null, 2), err => err ? reject(err) : resolve());
    }),
    new Promise((resolve, reject) => {
      ensureDataDir();
      fs.writeFile(LOG_FILE, JSON.stringify(caseLog, null, 2), err => err ? reject(err) : resolve());
    }),
    new Promise((resolve, reject) => {
      ensureDataDir();
      fs.writeFile(PATIENTS_FILE, JSON.stringify(patientsDict, null, 2), err => err ? reject(err) : resolve());
    })
  ])).catch(err => console.error('データの保存に失敗しました:', err));
  return writeQueue;
}

function getEntry(text) {
  if (!learningDict[text]) learningDict[text] = { preferredType: null, preferredCols: {}, preferredHendersonIds: [], typeVotes: {}, hendersonVotes: {} };
  return learningDict[text];
}

// 同じ文章に対して同じ編集（同じ分類・同じタグ）が繰り返された回数を票として数え、
// 最多得票のものを優先度が最も高い（次回の自動振り分けに使われる）結果として扱う。
// 同数の場合は先に記録された方を優先する（Object.entriesの挿入順で判定）。
function pickTopVote(votes) {
  if (!votes) return null;
  let best = null, bestCount = 0;
  for (const [key, count] of Object.entries(votes)) {
    if (count > bestCount) { best = key; bestCount = count; }
  }
  return best;
}

// ---- ミドルウェア ----
// 患者カルテ本体（カード多数・長い抽出元テキストを含む）を扱うため、上限を少し広めに取る
app.use(express.json({ limit: '5mb' }));
app.use(express.static(__dirname, { extensions: ['html'] }));

// ---- API ----

// 共有学習辞書をまるごと返す（起動時にフロントエンドがローカル学習とマージする）
app.get('/api/learning-dict', (req, res) => {
  res.json(learningDict);
});

// 事例ログの取得（研究用のダウンロード・分析向け）
app.get('/api/case-log', (req, res) => {
  res.json(caseLog);
});

// 分類ボード側での変更を、共有学習辞書＋事例ログの両方に反映する
// action: 'create' | 'type' | 'tagAdd' | 'tagRemove' | 'col' | 'edit' | 'delete'
app.post('/api/learning-event', async (req, res) => {
  const { text, action, payload, at } = req.body || {};

  if (typeof text !== 'string' || !text) {
    return res.status(400).json({ error: 'text is required' });
  }
  const validActions = ['create', 'type', 'tagAdd', 'tagRemove', 'col', 'edit', 'delete', 'adjustTypeVote', 'adjustHendersonVote'];
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: `action must be one of ${validActions.join(', ')}` });
  }

  // 削除は「学習データ管理」画面からの個別削除用。既存エントリーを新規作成せずそのまま消す。
  if (action === 'delete') {
    delete learningDict[text];
    caseLog.push({ at: at || new Date().toISOString(), text, action, payload: payload || null });
    await persist();
    return res.json({ ok: true, dict: learningDict });
  }

  const entry = getEntry(text);

  switch (action) {
    case 'create':
      // 自動抽出・自動分類の初期結果を記録するだけ（学習辞書はまだ人の判断が入っていないので更新しない）
      break;
    case 'type':
      // 「不要」判定は分類の学習には数えない。同じ分類が繰り返し選ばれた回数を票として数え、
      // 最多得票の分類をpreferredTypeとする（新規の自動振り分けより、繰り返し選ばれた編集を優先するため）。
      if (payload && payload.type != null && payload.type !== 'unnecessary') {
        entry.typeVotes = entry.typeVotes || {};
        entry.typeVotes[payload.type] = (entry.typeVotes[payload.type] || 0) + 1;
        entry.preferredType = pickTopVote(entry.typeVotes) || entry.preferredType;
      }
      break;
    case 'tagAdd':
      if (payload && typeof payload.hendersonId === 'number') {
        entry.hendersonVotes = entry.hendersonVotes || {};
        entry.hendersonVotes[payload.hendersonId] = (entry.hendersonVotes[payload.hendersonId] || 0) + 1;
        entry.preferredHendersonIds = Object.entries(entry.hendersonVotes).filter(([, c]) => c > 0).map(([id]) => Number(id));
      }
      break;
    case 'tagRemove':
      if (payload && typeof payload.hendersonId === 'number') {
        entry.hendersonVotes = entry.hendersonVotes || {};
        const cur = entry.hendersonVotes[payload.hendersonId] || 0;
        entry.hendersonVotes[payload.hendersonId] = Math.max(0, cur - 1);
        entry.preferredHendersonIds = Object.entries(entry.hendersonVotes).filter(([, c]) => c > 0).map(([id]) => Number(id));
      }
      break;
    case 'col':
      if (payload && typeof payload.hendersonId === 'number' && typeof payload.col === 'string') {
        entry.preferredCols = entry.preferredCols || {};
        entry.preferredCols[payload.hendersonId] = payload.col;
      }
      break;
    case 'edit':
      // 編集前のテキストで学習していた内容を、編集後のテキストへ引き継ぐ
      if (payload && typeof payload.newText === 'string' && payload.newText && payload.newText !== text) {
        const newEntry = getEntry(payload.newText);
        Object.assign(newEntry, entry, { lastEditedFrom: text });
        newEntry.updatedAt = at || new Date().toISOString();
      }
      break;
    case 'adjustTypeVote':
      // 学習データ管理画面からの手動修正（自動分類が明らかに誤っている場合に票を直接増減する）
      if (payload && payload.type != null && typeof payload.delta === 'number') {
        entry.typeVotes = entry.typeVotes || {};
        entry.typeVotes[payload.type] = Math.max(0, (entry.typeVotes[payload.type] || 0) + payload.delta);
        entry.preferredType = pickTopVote(entry.typeVotes) || entry.preferredType;
      }
      break;
    case 'adjustHendersonVote':
      if (payload && typeof payload.hendersonId === 'number' && typeof payload.delta === 'number') {
        entry.hendersonVotes = entry.hendersonVotes || {};
        entry.hendersonVotes[payload.hendersonId] = Math.max(0, (entry.hendersonVotes[payload.hendersonId] || 0) + payload.delta);
        entry.preferredHendersonIds = Object.entries(entry.hendersonVotes).filter(([, c]) => c > 0).map(([id]) => Number(id));
      }
      break;
  }
  entry.updatedAt = at || new Date().toISOString();

  caseLog.push({ at: at || new Date().toISOString(), text, action, payload: payload || null });

  await persist();
  res.json({ ok: true, dict: learningDict });
});

// ページを閉じる際などにブラウザ側の学習内容をまとめて反映するための一括同期。
// 個別イベントの送信が何らかの理由で届いていなかった場合の保険（フォールバック）で、
// キーごとに上書きするだけで、ここに含まれないキーを消したりはしない
// （学習専用ファイルへの「追加」であり、他利用者分を巻き込んで消さないため）。
app.post('/api/learning-dict/sync', express.json({ limit: '2mb', type: () => true }), async (req, res) => {
  const incoming = req.body;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return res.status(400).json({ error: 'body must be an object' });
  }
  for (const [text, value] of Object.entries(incoming)) {
    if (typeof text === 'string' && text) learningDict[text] = value;
  }
  await persist();
  res.json({ ok: true });
});

// ---- 患者カルテ本体（複数端末での共有用） ----
// 学習データと同じ考え方で、患者IDをキーにしたオブジェクトとしてサーバー側にも保存する。
// これにより、ある端末で入力したカルテ（分類ボードの中身・総合アセスメント表の状態・
// 分類の抽出元になったカルテ本文=sourceText）を、別の端末・別のブラウザからも同じ内容で開ける。
// 全患者を1つのオブジェクトで置き換えるのではなく患者単位で読み書きすることで、
// 複数人が別々の患者を同時に編集していても互いのデータを消し合わないようにしている。

// ある端末から届いた患者データが、今サーバーに保存されている内容より古くないかを判定する。
// これが無いと、しばらく開きっぱなしだった別端末が後から（更新日時の古い内容のまま）保存してきた時に、
// 既に他端末で加えられた新しい変更を上書きして消してしまう（例：ページを閉じる際の保険の一括送信が、
// 自分がまだ知らない他端末の更新を巻き戻してしまう）。updatedAtが無い/同じ場合は許可する。
function isNotStale(incomingPatient, existingPatient) {
  if (!existingPatient) return true;
  const incomingTime = incomingPatient?.updatedAt ? new Date(incomingPatient.updatedAt).getTime() : 0;
  const existingTime = existingPatient?.updatedAt ? new Date(existingPatient.updatedAt).getTime() : 0;
  return incomingTime >= existingTime;
}

// 共有されている患者カルテを全件返す（起動時にフロントエンドがこのブラウザ内のカルテとマージする）
app.get('/api/patients', (req, res) => {
  res.json(patientsDict);
});

// 1人分の患者カルテをまるごと保存（作成・更新の両方を兼ねる）。
// カード内容が変わるたびにフロントエンドから送られてくる想定（送信側で送りすぎないよう間隔を空けている）。
app.put('/api/patients/:id', async (req, res) => {
  const { id } = req.params;
  const patient = req.body;
  if (!id) return res.status(400).json({ error: 'id is required' });
  if (!patient || typeof patient !== 'object' || Array.isArray(patient)) {
    return res.status(400).json({ error: 'body must be a patient object' });
  }
  if (!isNotStale(patient, patientsDict[id])) {
    // 他端末が既により新しい内容で保存済み。古い内容での上書きは行わない。
    return res.json({ ok: true, skipped: true, current: patientsDict[id] });
  }
  patientsDict[id] = patient;
  await persist();
  res.json({ ok: true });
});

// 患者ページの完全削除（アーカイブはpatientオブジェクト内のarchivedフラグの更新＝PUTで済ませる）
app.delete('/api/patients/:id', async (req, res) => {
  const { id } = req.params;
  delete patientsDict[id];
  await persist();
  res.json({ ok: true });
});

// ページを閉じる際などに、このブラウザが知っている全患者カルテをまとめて反映するための一括同期
// （保険用のフォールバック）。学習データの一括同期と同様、患者IDごとに上書きするだけで、
// ここに含まれない他の患者を消したりはしない。PUTと同様に、古い内容（更新日時が今の保存内容より
// 古いもの）での上書きは行わない（例えば、ページを閉じる直前の保険の送信内容が、実はその前に別端末が
// 加えていたより新しい変更より古い、というケースを防ぐ）。
app.post('/api/patients/sync', express.json({ limit: '8mb', type: () => true }), async (req, res) => {
  const incoming = req.body;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return res.status(400).json({ error: 'body must be an object' });
  }
  for (const [id, patient] of Object.entries(incoming)) {
    if (typeof id === 'string' && id && patient && typeof patient === 'object' && isNotStale(patient, patientsDict[id])) {
      patientsDict[id] = patient;
    }
  }
  await persist();
  res.json({ ok: true });
});

// ---- 同時接続人数のカウント（メモリ上のみ・ファイルには保存しない） ----
// 各ブラウザタブが一定間隔で「まだ開いています」を送り（ハートビート）、
// 一定時間ハートビートが無いタブは閉じられた（切断された）とみなす簡易的な仕組み。
// 秒単位の厳密なリアルタイム性は求めず、「だいたい今何人開いているか」が分かれば十分という前提。
const presence = new Map(); // clientId(タブごとの識別子) -> 最終ハートビート時刻(ms)
const PRESENCE_TIMEOUT_MS = 45000; // これより長くハートビートが無いタブは切断とみなして数えない

function prunePresence() {
  const now = Date.now();
  for (const [clientId, lastSeen] of presence) {
    if (now - lastSeen > PRESENCE_TIMEOUT_MS) presence.delete(clientId);
  }
}

// 20秒おきに呼ばれる想定。呼ばれるたびに現在の接続人数（有効なハートビートの数）を返す。
app.post('/api/presence/heartbeat', (req, res) => {
  const { clientId } = req.body || {};
  if (typeof clientId === 'string' && clientId) presence.set(clientId, Date.now());
  prunePresence();
  res.json({ count: presence.size });
});

// タブを閉じる時にbeforeunloadのsendBeaconで即時に退出を伝え、45秒のタイムアウトを待たず
// 人数表示へすぐ反映されるようにする（保険として届かなくても、いずれタイムアウトで自動的に減る）。
app.post('/api/presence/leave', express.json({ limit: '10kb', type: () => true }), (req, res) => {
  const { clientId } = req.body || {};
  if (typeof clientId === 'string' && clientId) presence.delete(clientId);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`看護アセスメント支援システム サーバー起動: http://localhost:${PORT}`);
});
