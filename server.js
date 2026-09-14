// ============================================================================
// 看護アセスメント支援システム - 共有学習用バックエンド
// ----------------------------------------------------------------------------
// 事例研究での利用を想定し、カードの本文・タグ付け・どの欄に割り振られたか・
// どう編集されたかを、そのまま全利用者で共有する。
//
// data/learning-dict.json … テキストごとの「現在の学習結果」
//   { [text]: { preferredType, preferredCols, preferredHendersonIds, updatedAt, lastMergedFrom? } }
//   次に同じ文章が出てきたときの自動分類・自動タグ付けに使われる。
//   複数カードを1枚に統合した場合、統合元それぞれの学習結果（票）を合算した上で、
//   統合後の文章の学習結果として記録される（lastMergedFrom に統合元の文章一覧を残す）。
//
// data/case-log.json … 「いつ・何が・どう変わったか」を積み上げる生ログ（配列）
//   事例研究でそのまま時系列の分析対象にできる。分類ボードでの変更は
//   即座にこのログと learning-dict の両方に反映され、総合アセスメント表側の
//   自動判定にも次回classify時から使われる。
//   ARCHIVE_THRESHOLD_DAYSより古いエントリーは自動でdata/case-log-archive.jsonへ移される
//   （runArchiving参照。GET /api/case-log/archiveで取得可能）。
//
// data/patients.json … 患者カルテ本体（分類ボード・総合アセスメント表の中身、
//   および分類の抽出元になったカルテ本文=sourceText）を { [患者ID]: 患者データ } の
//   形で保存する。これにより同じ患者を別の端末・別のブラウザから開いても同じ内容が
//   見られる（学習データと同様、都度新しいファイルは作らずこの1ファイルに追加・更新・削除する）。
//   複数端末がほぼ同時に同じ患者を編集した場合、カード一覧(items)はカード単位でマージされる
//   （mergePatientRecord参照）。片方の端末しか知らないカードは削除の記録（deletedItemIds、
//   3日間だけ有効）が無い限り消さずに両方残し、同じカードが両方で編集されていた場合はカード自身の
//   書き換え時刻(_touchedAt)が新しい方を採用する。これにより、一方の保存がもう一方の新しいカードを
//   まるごと上書きして消してしまうことを防いでいる（タイトル・カルテ本文など項目単位でない
//   フィールドは、従来通り患者データ全体の更新日時(updatedAt)が新しい方を採用する）。
//
// data/extraction-criteria.json … AIによる自動抽出・分類（S/O判定、ヘンダーソンタグ、
//   検査値評価、不足情報推定）に対して、現場から出た「追加の要望」を積み上げる配列。
//   コード内のNotebookLM基準ノート自体は編集不可の固定内容だが、この一覧はウェブ画面
//   （設定モーダル）から誰でも追加・削除でき、全利用者に共有される。フロントエンド側で
//   AIへの指示文（プロンプト）に自動で追記して使う。
//
// data/extraction-log.json … 「分類開始」を押すたびに、抽出前の生のカルテ・記録テキスト
//   （分類ボードに複数のカードとして切り分けられる前の、入力欄にそのまま貼り付けられた
//   文章）をそのまま積み上げる配列。患者データ(patients.json)側のsourceTextは常に
//   「その患者の最新の1回分」しか保持しないため、新しい文章を貼り付けて上書きすると
//   それ以前に何を入力して抽出したのかが失われてしまう。この配列はそれとは別に、
//   分類開始のたびに追記していく履歴（読み取り専用・事例研究用）で、
//   学習データ管理画面の「抽出前の文章」タブから検索・閲覧できる。
//   ARCHIVE_THRESHOLD_DAYSより古いエントリーは自動で
//   data/extraction-log-archive.jsonへ移される（GET /api/extraction-log/archiveで取得可能）。
//
// data/card-reports.json … 情報カードの右上「報告」ボタンから送られた、「この情報カードの
//   書き込みが変だ」という内容を積み上げる配列。1件が { id, sessionId, patientId,
//   patientTitle, items: [{ cardText, comment, at }], createdAt, updatedAt } の形で、
//   同じブラウザタブ（sessionIdが同じ＝ページを閉じるまでの間）から複数回報告された場合は
//   新しいレコードを作らず、既存レコードのitemsに追記して1人分の投稿として扱う。
//   学習データ管理画面の「情報カードの報告」タブから検索・閲覧でき、AIによる要約機能で
//   抽出・分類ロジックを修正する際のプロンプトの参考にできる（要約結果はワンクリックで
//   extraction-criteria.jsonへ追加もできる）。ARCHIVE_THRESHOLD_DAYSより最終更新(updatedAt)が
//   古いレコードは自動でdata/card-reports-archive.jsonへ移される
//   （GET /api/card-reports/archiveで取得可能）。認証の無いAPIであるため、スパム・大量送信への
//   対策として、IPアドレスごとのレート制限（rateLimit）・文字数上限（capString）・
//   同一セッションからの1グループあたりの件数上限（CARD_REPORT_MAX_ITEMS_PER_GROUP）を設けている。
//
// data/*-archive.json（case-log-archive.json / extraction-log-archive.json /
//   card-reports-archive.json）… 上記3つの追記専用ログのうち、ARCHIVE_THRESHOLD_DAYS
//   （既定90日）より古くなったエントリーを自動整理（runArchiving、24時間おきに実行）で
//   移した先。削除はせず、対応する GET .../archive エンドポイントから引き続き参照できる。
//   これにより日常使う一覧（学習データ管理の各タブ）は軽いまま保たれる。
//
// データの永続化は単純なJSONファイルです。件数が増えてきたらSQLite等へ
// 置き換えてください（読み書きは loadJson/persist にまとまっています）。
// ============================================================================

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// NURSING_DATA_DIRを指定すると保存先フォルダを切り替えられる（自動テストが本番のdata/フォルダを
// 汚さないよう、一時フォルダを指すために使う。通常の起動では指定不要で、これまで通りdata/を使う）。
const DATA_DIR = process.env.NURSING_DATA_DIR ? path.resolve(process.env.NURSING_DATA_DIR) : path.join(__dirname, 'data');
const DICT_FILE = path.join(DATA_DIR, 'learning-dict.json');
const LOG_FILE = path.join(DATA_DIR, 'case-log.json');
const PATIENTS_FILE = path.join(DATA_DIR, 'patients.json');
const CRITERIA_FILE = path.join(DATA_DIR, 'extraction-criteria.json');
const EXTRACTION_LOG_FILE = path.join(DATA_DIR, 'extraction-log.json');
const CARD_REPORTS_FILE = path.join(DATA_DIR, 'card-reports.json');
// 自動整理（アーカイブ）先。古くなった記録は下の3ファイルから消すのではなく、こちらへ
// そのまま移して残す（研究用途で失われないようにするため）。詳細はrunArchiving()を参照。
const CASE_LOG_ARCHIVE_FILE = path.join(DATA_DIR, 'case-log-archive.json');
const EXTRACTION_LOG_ARCHIVE_FILE = path.join(DATA_DIR, 'extraction-log-archive.json');
const CARD_REPORTS_ARCHIVE_FILE = path.join(DATA_DIR, 'card-reports-archive.json');

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
let extractionCriteria = loadJson(CRITERIA_FILE, []); // [{ id, text, addedAt }] AI抽出・分類に使う追加の要望（全利用者共有）
let extractionLog = loadJson(EXTRACTION_LOG_FILE, []); // [{ id, patientId, patientTitle, text, extractedCount, at }] 分類開始のたびの「抽出前の文章」履歴
let cardReports = loadJson(CARD_REPORTS_FILE, []); // [{ id, sessionId, patientId, patientTitle, items: [{cardText, comment, at}], createdAt, updatedAt }] 情報カードの不具合報告
let caseLogArchive = loadJson(CASE_LOG_ARCHIVE_FILE, []);
let extractionLogArchive = loadJson(EXTRACTION_LOG_ARCHIVE_FILE, []);
let cardReportsArchive = loadJson(CARD_REPORTS_ARCHIVE_FILE, []);

// 保存対象ファイルの一覧。getは常にその時点の最新の値を返す（再代入されるlet変数をクロージャで
// 参照するため、後から reassign されても正しく最新の内容を保存できる）。起動時のファイル作成
// チェックと persist() の両方でこの一覧を使い回し、ファイルを1つ増減する際の変更箇所を1か所にまとめる。
const PERSISTED_FILES = [
  { file: DICT_FILE, get: () => learningDict },
  { file: LOG_FILE, get: () => caseLog },
  { file: PATIENTS_FILE, get: () => patientsDict },
  { file: CRITERIA_FILE, get: () => extractionCriteria },
  { file: EXTRACTION_LOG_FILE, get: () => extractionLog },
  { file: CARD_REPORTS_FILE, get: () => cardReports },
  { file: CASE_LOG_ARCHIVE_FILE, get: () => caseLogArchive },
  { file: EXTRACTION_LOG_ARCHIVE_FILE, get: () => extractionLogArchive },
  { file: CARD_REPORTS_ARCHIVE_FILE, get: () => cardReportsArchive },
];

// 学習専用ファイルを起動時点でフォルダ内に必ず用意しておく（初回アクセス前でも
// data/learning-dict.json・data/case-log.json・data/patients.json・data/extraction-criteria.json・
// data/extraction-log.json・data/card-reports.json・各アーカイブファイルが存在する状態にし、
// 以後はこの1つのファイルに追加・削除を重ねていく。新しいファイルを都度作ることはしない）。
ensureDataDir();
PERSISTED_FILES.forEach(({ file, get }) => {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(get(), null, 2));
});
// 書き込みが競合しないよう、保存処理を1本のPromiseチェーンで直列化する
let writeQueue = Promise.resolve();
function persist() {
  writeQueue = writeQueue.then(() => {
    ensureDataDir();
    return Promise.all(PERSISTED_FILES.map(({ file, get }) =>
      fs.promises.writeFile(file, JSON.stringify(get(), null, 2))
    ));
  }).catch(err => console.error('データの保存に失敗しました:', err));
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

// ---- 簡易レート制限（スパム・大量送信への防御） ----
// この仕組みには認証機能が無く、誰でもAPIへ直接送信できてしまうため、card-reports.json等の
// データを書き込む系のAPIに対して、IPアドレスごとの簡易的なレート制限をかける。第三者ライブラリを
// 増やさず（npm install が使えない環境でも動くよう）標準機能のみで実装したシンプルな固定ウィンドウ方式。
// 通常のブラウザ操作（クリック連打などを含む）では上限に達しない程度に余裕を持たせている。
const rateLimitBuckets = new Map(); // key: `${bucketName}:${ip}` -> { count, windowStart(ms) }

function rateLimit(bucketName, { windowMs, max }) {
  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${bucketName}:${ip}`;
    const now = Date.now();
    let entry = rateLimitBuckets.get(key);
    if (!entry || now - entry.windowStart >= windowMs) {
      entry = { count: 0, windowStart: now };
      rateLimitBuckets.set(key, entry);
    }
    entry.count++;
    if (entry.count > max) {
      return res.status(429).json({ error: '短時間に送信が集中しています。しばらく待ってから再度お試しください。' });
    }
    next();
  };
}

// 使われなくなった（しばらく送信の無い）バケットを定期的に掃除し、メモリが際限なく増えないようにする。
// unref()しておくことで、この定期処理だけがプロセスの終了を妨げないようにする
// （自動テストがサーバーを起動せずrequireだけした場合に、プロセスが終了できなくなるのを防ぐ）。
const RATE_LIMIT_BUCKET_IDLE_MS = 10 * 60 * 1000;
const rateLimitCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitBuckets) {
    if (now - entry.windowStart > RATE_LIMIT_BUCKET_IDLE_MS) rateLimitBuckets.delete(key);
  }
}, 5 * 60 * 1000);
if (typeof rateLimitCleanupTimer.unref === 'function') rateLimitCleanupTimer.unref();

// 文字列フィールドの長さ上限（1回の送信サイズ自体はexpress.jsonの上限で制限されているが、
// それとは別に、1件あたりの記録が異常に肥大化してファイル全体を圧迫しないようにする）
function capString(value, maxLen) {
  return (typeof value === 'string') ? value.slice(0, maxLen) : value;
}

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
// action: 'create' | 'type' | 'tagAdd' | 'tagRemove' | 'col' | 'edit' | 'delete' | 'merge'
app.post('/api/learning-event', rateLimit('learning-event', { windowMs: 60000, max: 300 }), async (req, res) => {
  const { text, action, payload, at } = req.body || {};
  const eventAt = at || new Date().toISOString(); // このリクエスト内で使う日時は1回だけ計算し使い回す

  if (typeof text !== 'string' || !text) {
    return res.status(400).json({ error: 'text is required' });
  }
  const validActions = ['create', 'type', 'tagAdd', 'tagRemove', 'col', 'edit', 'delete', 'adjustTypeVote', 'adjustHendersonVote', 'merge'];
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: `action must be one of ${validActions.join(', ')}` });
  }

  // 削除は「学習データ管理」画面からの個別削除用。既存エントリーを新規作成せずそのまま消す。
  if (action === 'delete') {
    delete learningDict[text];
    caseLog.push({ at: eventAt, text, action, payload: payload || null });
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
        newEntry.updatedAt = eventAt;
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
    case 'merge':
      // 複数カードを1枚に統合した際の学習：統合元それぞれの学習結果（票）をこの統合後の文章の
      // エントリーへ合算し、さらに今回ユーザーが選んだ分類・タグにも1票加える（統合という編集も、
      // 他の編集と同じくユーザーの判断として学習に反映するため）。統合元自体のエントリーは、
      // 別の場所で同じ文章がそのまま使われる可能性を考えて消さずに残す。
      if (payload && Array.isArray(payload.sourceTexts)) {
        const typeVotes = {};
        const hendersonVotesRaw = {};
        const preferredColsRaw = {};
        const seen = new Set();
        payload.sourceTexts.forEach(t => {
          if (typeof t !== 'string' || !t || seen.has(t)) return;
          seen.add(t);
          const src = learningDict[t];
          if (!src) return;
          Object.entries(src.typeVotes || {}).forEach(([k, v]) => { typeVotes[k] = (typeVotes[k] || 0) + v; });
          Object.entries(src.hendersonVotes || {}).forEach(([k, v]) => { hendersonVotesRaw[k] = (hendersonVotesRaw[k] || 0) + v; });
          Object.assign(preferredColsRaw, src.preferredCols || {});
        });
        if (payload.type && payload.type !== 'unnecessary') {
          typeVotes[payload.type] = (typeVotes[payload.type] || 0) + 1;
        }
        // ヘンダーソンタグの票・欄は、統合後に実際に選ばれたタグだけを引き継ぐ。
        // 統合元にあった別のタグの残り票までそのまま持ち越すと、統合の際にあえて外したタグが
        // 次回このまったく同じ文章が出てきたときに復活してしまうため、最終的に選ばれたタグに絞り込む
        // （タグごとの票自体は、外したタグを含め統合元のエントリー側にはそのまま残り続ける）。
        const hendersonVotes = {};
        const preferredCols = {};
        const finalTagIds = Array.isArray(payload.hendersonIds) ? payload.hendersonIds.filter(hId => typeof hId === 'number') : [];
        finalTagIds.forEach(hId => {
          hendersonVotes[hId] = (hendersonVotesRaw[hId] || 0) + 1;
          const col = (payload.cols && payload.cols[hId]) || preferredColsRaw[hId];
          if (col) preferredCols[hId] = col;
        });

        entry.typeVotes = typeVotes;
        entry.hendersonVotes = hendersonVotes;
        entry.preferredType = pickTopVote(typeVotes) || (payload.type && payload.type !== 'unnecessary' ? payload.type : entry.preferredType);
        entry.preferredHendersonIds = Object.entries(hendersonVotes).filter(([, c]) => c > 0).map(([id]) => Number(id));
        entry.preferredCols = preferredCols;
        entry.lastMergedFrom = payload.sourceTexts;
      }
      break;
  }
  entry.updatedAt = eventAt;

  caseLog.push({ at: eventAt, text, action, payload: payload || null });

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

// ---- 同時編集時のカード単位マージ ----
// 以前は「患者カルテをまるごと」保存する方式だったため、2つの端末がほぼ同時に同じ患者を編集すると、
// 後から届いた保存が先に届いた保存の内容（相手だけが知っている新しいカード等）をまるごと
// 上書きして消してしまうことがあった（updatedAtでの新旧判定だけでは、カード単位の食い違いは防げない）。
// これを防ぐため、items（カード一覧）だけはカード単位でマージする：
//   - 片方にしか無いカードは、削除された記録（tombstone）が無い限り両方とも残す
//     （＝自分の端末が知らないカードを、保存のたびに誤って消してしまわない）。
//   - 両方にあるカードは、フロント側が付与する _touchedAt（カードが最後に書き換えられた時刻）が
//     新しい方を採用する。
//   - カードの削除は、削除した端末が deletedItemIds に {id, at} を積んで送ってくることで伝える
//     （ITEM_TOMBSTONE_WINDOW_MS以内のものだけ有効。それより古いものは削除の記録ごと消える）。
//     tombstone より新しい _touchedAt を持つカードが届いた場合（＝「元に戻す」で復元された場合）は
//     削除を取り消し、そのカードを復活させる。
// items・deletedItemIds以外の項目（タイトル・カルテ本文・検査値評価結果など）は、
// 従来通りupdatedAtが新しい方（isNotStale）をまるごと採用する（こちらは項目単位のマージ対象外）。
const ITEM_TOMBSTONE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 3日：これより古い削除記録は無効として扱う

function pruneTombstones(list, now) {
  if (!Array.isArray(list)) return [];
  return list.filter(t => t && typeof t.id === 'string' && typeof t.at === 'string' && (now - new Date(t.at).getTime()) <= ITEM_TOMBSTONE_WINDOW_MS);
}

function itemEffectiveTime(item, wholePatientUpdatedAt) {
  if (item && typeof item._touchedAt === 'string') {
    const t = new Date(item._touchedAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (wholePatientUpdatedAt) {
    const t = new Date(wholePatientUpdatedAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

function mergePatientRecord(incoming, existing, now = Date.now()) {
  if (!existing) return incoming; // 新規患者、またはサーバー側にまだ保存が無い場合はそのまま採用
  if (!incoming) return existing;

  // items・deletedItemIds以外の項目は、従来通りupdatedAtが新しい方をまるごと採用する
  const base = isNotStale(incoming, existing) ? incoming : existing;

  const existingItems = Array.isArray(existing.items) ? existing.items : [];
  const incomingItems = Array.isArray(incoming.items) ? incoming.items : [];
  const existingById = new Map(existingItems.filter(i => i && i.id).map(i => [i.id, i]));
  const incomingById = new Map(incomingItems.filter(i => i && i.id).map(i => [i.id, i]));

  const tombstonesById = new Map();
  [...pruneTombstones(existing.deletedItemIds, now), ...pruneTombstones(incoming.deletedItemIds, now)].forEach(t => {
    const prev = tombstonesById.get(t.id);
    if (!prev || new Date(t.at).getTime() > new Date(prev.at).getTime()) tombstonesById.set(t.id, t);
  });
  const survivingTombstoneIds = new Set(tombstonesById.keys());

  // 並び順はincoming（今回保存された内容）を基本にし、そちらに無い（他端末だけが持つ）カードは末尾に足す
  const orderedIds = incomingItems.filter(i => i && i.id).map(i => i.id);
  existingItems.forEach(i => { if (i && i.id && !incomingById.has(i.id)) orderedIds.push(i.id); });

  const mergedItems = [];
  const seen = new Set();
  orderedIds.forEach(id => {
    if (seen.has(id)) return;
    seen.add(id);
    const existingItem = existingById.get(id);
    const incomingItem = incomingById.get(id);
    const tombstone = tombstonesById.get(id);

    if (tombstone) {
      const tombstoneTime = new Date(tombstone.at).getTime();
      if (incomingItem && itemEffectiveTime(incomingItem, incoming.updatedAt) > tombstoneTime) {
        mergedItems.push(incomingItem);
        survivingTombstoneIds.delete(id); // 削除より後に書き換えられている＝復元されたとみなす
        return;
      }
      if (existingItem && itemEffectiveTime(existingItem, existing.updatedAt) > tombstoneTime) {
        mergedItems.push(existingItem);
        survivingTombstoneIds.delete(id);
        return;
      }
      return; // 削除が有効。カードは含めない
    }

    if (existingItem && incomingItem) {
      const incomingTime = itemEffectiveTime(incomingItem, incoming.updatedAt);
      const existingTime = itemEffectiveTime(existingItem, existing.updatedAt);
      mergedItems.push(existingTime > incomingTime ? existingItem : incomingItem);
    } else {
      mergedItems.push(incomingItem || existingItem);
    }
  });

  const mergedTombstones = [...tombstonesById.values()].filter(t => survivingTombstoneIds.has(t.id));
  const incomingUpdatedTime = incoming.updatedAt ? new Date(incoming.updatedAt).getTime() : 0;
  const existingUpdatedTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;

  return {
    ...base,
    items: mergedItems,
    deletedItemIds: mergedTombstones,
    updatedAt: (incomingUpdatedTime >= existingUpdatedTime ? incoming.updatedAt : existing.updatedAt) || new Date(now).toISOString()
  };
}

// 共有されている患者カルテを全件返す（起動時にフロントエンドがこのブラウザ内のカルテとマージする）
app.get('/api/patients', (req, res) => {
  res.json(patientsDict);
});

// 1人分の患者カルテをまるごと保存（作成・更新の両方を兼ねる）。
// カード内容が変わるたびにフロントエンドから送られてくる想定（送信側で送りすぎないよう間隔を空けている）。
// 既に他端末の保存内容がある場合は、まるごと置き換えるのではなくカード単位でマージする
// （mergePatientRecord参照）。マージ後の内容をレスポンスで返し、フロント側もそれを取り込むことで、
// 他端末だけが持っていたカードがこの端末の画面から消えたままにならないようにしている。
app.put('/api/patients/:id', rateLimit('patients-put', { windowMs: 60000, max: 200 }), async (req, res) => {
  const { id } = req.params;
  const patient = req.body;
  if (!id) return res.status(400).json({ error: 'id is required' });
  if (!patient || typeof patient !== 'object' || Array.isArray(patient)) {
    return res.status(400).json({ error: 'body must be a patient object' });
  }
  const merged = mergePatientRecord(patient, patientsDict[id]);
  patientsDict[id] = merged;
  await persist();
  res.json({ ok: true, patient: merged });
});

// 患者ページの完全削除（アーカイブはpatientオブジェクト内のarchivedフラグの更新＝PUTで済ませる）
app.delete('/api/patients/:id', async (req, res) => {
  const { id } = req.params;
  delete patientsDict[id];
  await persist();
  res.json({ ok: true });
});

// ページを閉じる際などに、このブラウザが知っている全患者カルテをまとめて反映するための一括同期
// （保険用のフォールバック）。学習データの一括同期と同様、患者IDごとに処理するだけで、
// ここに含まれない他の患者を消したりはしない。PUTと同様にmergePatientRecordでカード単位に
// マージするため、この保険送信（ページを閉じる直前の、やや古いスナップショットのことがある）が
// 他端末による新しいカードを消してしまうことはない。
app.post('/api/patients/sync', express.json({ limit: '8mb', type: () => true }), rateLimit('patients-sync', { windowMs: 60000, max: 60 }), async (req, res) => {
  const incoming = req.body;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return res.status(400).json({ error: 'body must be an object' });
  }
  for (const [id, patient] of Object.entries(incoming)) {
    if (typeof id === 'string' && id && patient && typeof patient === 'object') {
      patientsDict[id] = mergePatientRecord(patient, patientsDict[id]);
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

// ---- AIによる抽出・分類基準への「追加の要望」（全利用者共有） ----
// NotebookLM基準ノート自体はコード内の固定内容（編集不可）だが、現場で「こういう時はこう
// 抽出／分類してほしい」という要望が出た際に、コードを触らずウェブ画面から追加できるように
// しておき、フロントエンド側でAIへの指示文（プロンプト）に自動で追記して使う。
// 学習データ・患者カルテと同様、1つのファイルに追加・削除を重ねる方式。

app.get('/api/extraction-criteria', (req, res) => {
  res.json(extractionCriteria);
});

app.post('/api/extraction-criteria', rateLimit('extraction-criteria', { windowMs: 60000, max: 30 }), async (req, res) => {
  const { text } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  const entry = { id: 'crit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), text: capString(text.trim(), 2000), addedAt: new Date().toISOString() };
  extractionCriteria.push(entry);
  await persist();
  res.json(extractionCriteria);
});

app.put('/api/extraction-criteria/:id', rateLimit('extraction-criteria', { windowMs: 60000, max: 30 }), async (req, res) => {
  const { id } = req.params;
  const { text } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  const entry = extractionCriteria.find(c => c.id === id);
  if (!entry) {
    return res.status(404).json({ error: 'not found' });
  }
  entry.text = capString(text.trim(), 2000);
  entry.updatedAt = new Date().toISOString();
  await persist();
  res.json(extractionCriteria);
});

app.delete('/api/extraction-criteria/:id', async (req, res) => {
  const { id } = req.params;
  extractionCriteria = extractionCriteria.filter(c => c.id !== id);
  await persist();
  res.json(extractionCriteria);
});

// ---- 抽出前の文章の履歴（「分類開始」を押すたびに蓄積・全利用者共有） ----
// 患者カルテ本体(patients.json)側のsourceTextは、その患者の「最新の1回分」しか保持しない
// （新しい文章を貼り付けて上書きすると、以前入力していた文章は残らない）。
// この履歴は分類開始のたびに追記していく別の記録で、学習データ・事例ログと同様に
// 1つのファイルへ追加を重ねていく（都度新しいファイルは作らない・削除機能は持たない）。
app.get('/api/extraction-log', (req, res) => {
  res.json(extractionLog);
});

app.post('/api/extraction-log', rateLimit('extraction-log', { windowMs: 60000, max: 30 }), async (req, res) => {
  const { patientId, patientTitle, text, extractedCount } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  const entry = {
    id: 'ext_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    patientId: typeof patientId === 'string' ? patientId : null,
    patientTitle: capString(typeof patientTitle === 'string' ? patientTitle : '', 200),
    text: capString(text, 50000),
    extractedCount: typeof extractedCount === 'number' ? extractedCount : null,
    at: new Date().toISOString()
  };
  extractionLog.push(entry);
  await persist();
  res.json(entry);
});

// ---- 情報カードの不具合報告（カード右上の「報告」ボタンから送られる。全利用者共有） ----
// 同じブラウザタブ（sessionIdが同じ＝ページを閉じるまでの間）から2件目・3件目の報告が
// 来た場合は新しいレコードを作らず、既存レコードのitemsに追記して1人分の投稿としてまとめる。
// sessionIdが無い（あるいは一致するレコードが見つからない）場合は新規レコードを作る。
app.get('/api/card-reports', (req, res) => {
  res.json(cardReports);
});

// 同じセッション（同じブラウザタブ）からの報告が際限なく1件のレコードへ積み上がらないよう、
// 1グループあたりの件数にも上限を設ける（レート制限とは別に、長時間かけて送り続けるケースへの対策）
const CARD_REPORT_MAX_ITEMS_PER_GROUP = 200;

app.post('/api/card-reports', rateLimit('card-reports', { windowMs: 60000, max: 20 }), async (req, res) => {
  const { sessionId, patientId, patientTitle, cardText, comment } = req.body || {};
  if (typeof cardText !== 'string' || !cardText.trim()) {
    return res.status(400).json({ error: 'cardText is required' });
  }
  const now = new Date().toISOString();
  const newItem = {
    cardText: capString(cardText, 2000),
    comment: capString(typeof comment === 'string' ? comment.trim() : '', 1000),
    patientId: typeof patientId === 'string' ? patientId : null,
    patientTitle: capString(typeof patientTitle === 'string' ? patientTitle : '', 200),
    at: now
  };

  let group = (typeof sessionId === 'string' && sessionId) ? cardReports.find(g => g.sessionId === sessionId) : null;
  if (group && group.items.length >= CARD_REPORT_MAX_ITEMS_PER_GROUP) {
    return res.status(429).json({ error: '同じセッションからの報告件数が上限に達しました。' });
  }
  if (group) {
    group.items.push(newItem);
    group.updatedAt = now;
  } else {
    group = {
      id: 'rpt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      sessionId: typeof sessionId === 'string' ? sessionId : null,
      patientId: newItem.patientId,
      patientTitle: newItem.patientTitle,
      items: [newItem],
      createdAt: now,
      updatedAt: now
    };
    cardReports.push(group);
  }
  await persist();
  res.json(group);
});

// ---- 自動整理（アーカイブ） ----
// case-log.json・extraction-log.json・card-reports.jsonは追記のみで削除機能を持たないため、
// 運用が長くなるとファイルが肥大化し続ける。ここでは「消す」のではなく、一定期間より古い
// 記録をそれぞれ専用のアーカイブファイルへ移すことで、日常使う一覧（学習データ管理の各タブ）
// を軽く保ちつつ、研究用途で参照したい古い記録もdata/*-archive.jsonから引き続き取得できる
// ようにする（GET /api/*/archive）。件数の多いデータからでも同期的に読める規模のJSONファイル
// を前提にしており、それ以上の規模になる場合はSQLite等への置き換えを検討してください。
const ARCHIVE_THRESHOLD_DAYS = 90; // これより古い記録をアーカイブへ退避する
const ARCHIVE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24時間おきに自動整理を実行する

function isOlderThanThresholdDays(isoString, thresholdDays) {
  if (!isoString) return false; // 日時が不明なものは誤って移動しないよう対象外にする
  const t = new Date(isoString).getTime();
  if (Number.isNaN(t)) return false;
  return (Date.now() - t) > thresholdDays * 24 * 60 * 60 * 1000;
}

// 起動時・定期実行の両方から呼ばれる。実際に何か移した場合のみpersist()する。
async function runArchiving() {
  let movedCaseLog = 0, movedExtractionLog = 0, movedCardReports = 0;

  const oldCaseLogEntries = caseLog.filter(e => isOlderThanThresholdDays(e.at, ARCHIVE_THRESHOLD_DAYS));
  if (oldCaseLogEntries.length > 0) {
    caseLogArchive = caseLogArchive.concat(oldCaseLogEntries);
    caseLog = caseLog.filter(e => !isOlderThanThresholdDays(e.at, ARCHIVE_THRESHOLD_DAYS));
    movedCaseLog = oldCaseLogEntries.length;
  }

  const oldExtractionEntries = extractionLog.filter(e => isOlderThanThresholdDays(e.at, ARCHIVE_THRESHOLD_DAYS));
  if (oldExtractionEntries.length > 0) {
    extractionLogArchive = extractionLogArchive.concat(oldExtractionEntries);
    extractionLog = extractionLog.filter(e => !isOlderThanThresholdDays(e.at, ARCHIVE_THRESHOLD_DAYS));
    movedExtractionLog = oldExtractionEntries.length;
  }

  // 報告は1レコードに複数の報告(items)がまとまっているため、最後の更新(updatedAt)を基準に
  // レコードごと（中のitemsも含めて）アーカイブする。
  const oldReportGroups = cardReports.filter(g => isOlderThanThresholdDays(g.updatedAt, ARCHIVE_THRESHOLD_DAYS));
  if (oldReportGroups.length > 0) {
    cardReportsArchive = cardReportsArchive.concat(oldReportGroups);
    cardReports = cardReports.filter(g => !isOlderThanThresholdDays(g.updatedAt, ARCHIVE_THRESHOLD_DAYS));
    movedCardReports = oldReportGroups.length;
  }

  if (movedCaseLog > 0 || movedExtractionLog > 0 || movedCardReports > 0) {
    await persist();
    console.log(`自動整理: 事例ログ${movedCaseLog}件・抽出前の文章${movedExtractionLog}件・情報カードの報告${movedCardReports}件をアーカイブへ退避しました`);
  }
}

// 研究用にアーカイブ済みの記録もそのまま取得できるようにする（現役データと同じ形のまま）
app.get('/api/case-log/archive', (req, res) => {
  res.json(caseLogArchive);
});
app.get('/api/extraction-log/archive', (req, res) => {
  res.json(extractionLogArchive);
});
app.get('/api/card-reports/archive', (req, res) => {
  res.json(cardReportsArchive);
});

// このファイルを直接実行した時（`node server.js` / `npm start`）だけサーバーを起動する。
// tests/ から require('../server.js') して app やロジック関数だけをテストする場合は、
// 実際にポートを待ち受けたり定期処理(setInterval)を開始したりしない（テストがすぐ終了できるように）。
if (require.main === module) {
  runArchiving(); // 起動のたびに一度実行し、長期間再起動していなかった場合でもすぐ整理する
  setInterval(runArchiving, ARCHIVE_INTERVAL_MS);

  app.listen(PORT, () => {
    console.log(`看護アセスメント支援システム サーバー起動: http://localhost:${PORT}`);
  });
}

// テスト（tests/）から個別の関数を直接検証できるようにする。
// appそのものをエクスポートすることで、実際にポートを開かずに（http.createServerで一時的な
// ポートに載せて）本物のExpressアプリへHTTPリクエストを送るテストも書ける。
module.exports = {
  app,
  DATA_DIR,
  mergePatientRecord,
  isNotStale,
  pruneTombstones,
  itemEffectiveTime,
  isOlderThanThresholdDays,
  runArchiving,
  rateLimit,
  capString,
  pickTopVote
};
