// Shared research backend: raw text, tags, columns and edits remain shared by owner choice.
// Learned corrections vote; merges carry votes without deleting source patterns.
// Patients merge per card with deletion tombstones; non-card state follows record timestamps.
// Map revisions are checked inside serialized writes/MongoDB CAS. Keep storage private.
// ============================================================================

// ----------------------------------------------------------------------------

//

//   { [text]: { preferredType, preferredCols, preferredHendersonIds, updatedAt, lastMergedFrom? } }

//

//

//

//

//

//
// data/*-archive.json（case-log-archive.json / card-reports-archive.json /

//

//

//

// ============================================================================

try { require('dotenv').config(); } catch (e) {   }

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

function sendServerError(res, err) {
  console.error('API request failed:', err);
  if (res.headersSent) return;
  res.status(err && err.status && err.status >= 400 ? err.status : 500).json({ ok: false, error: (err && err.message) || '保存に失敗しました' });
}
['get', 'put', 'post', 'delete'].forEach(method => {
  const original = app[method].bind(app);
  app[method] = (routePath, ...handlers) => {
    if (handlers.length === 0) return original(routePath);
    return original(routePath, ...handlers.map(h => (typeof h === 'function' && h.length < 4
      ? (req, res, next) => {
        let r;
        try { r = h(req, res, next); } catch (e) { return sendServerError(res, e); }
        if (r && typeof r.catch === 'function') r.catch(e => sendServerError(res, e));
        return undefined;
      }
      : h)));
  };
});
const PORT = process.env.PORT || 3000;

if (process.env.RENDER || process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  app.set('trust proxy', Number.isInteger(hops) && hops > 0 ? hops : 1);
}

const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function isSafeKey(key) {
  return typeof key === 'string' && key.length > 0 && !UNSAFE_OBJECT_KEYS.has(key);
}
const hasOwn = (obj, key) => obj != null && Object.prototype.hasOwnProperty.call(obj, key);
const isPlainObject = v => !!v && typeof v === 'object' && !Array.isArray(v);

const cloneJson = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'nursing_assessment';

const DATA_DIR = process.env.NURSING_DATA_DIR ? path.resolve(process.env.NURSING_DATA_DIR) : path.join(__dirname, 'data');
const DICT_FILE = path.join(DATA_DIR, 'learning-dict.json');
const LOG_FILE = path.join(DATA_DIR, 'case-log.json');
const PATIENTS_FILE = path.join(DATA_DIR, 'patients.json');
const CRITERIA_FILE = path.join(DATA_DIR, 'extraction-criteria.json');
const NOTEBOOK_CONTENT_FILE = path.join(DATA_DIR, 'notebook-content.json');
const CUSTOM_TAG_RULES_FILE = path.join(DATA_DIR, 'custom-tag-rules.json');
const REFERENCE_SOURCES_FILE = path.join(DATA_DIR, 'reference-sources.json');
const PATIENT_SNAPSHOT_FILE = path.join(DATA_DIR, 'patient-snapshots.json');
const CARD_REPORTS_FILE = path.join(DATA_DIR, 'card-reports.json');

const CASE_LOG_ARCHIVE_FILE = path.join(DATA_DIR, 'case-log-archive.json');
const CARD_REPORTS_ARCHIVE_FILE = path.join(DATA_DIR, 'card-reports-archive.json');
const PATIENT_SNAPSHOT_ARCHIVE_FILE = path.join(DATA_DIR, 'patient-snapshots-archive.json');

const PATIENT_DELETIONS_FILE = path.join(DATA_DIR, 'patient-deletions.json');

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

const GASTRIC_CANCER_REFERENCE_CONTENT = `胃がん（胃切除術）周術期看護 参考資料
（元資料：Google Docsソース https://docs.google.com/document/d/1bzNk5nDwyJTohdFfgk5pDFRBpJIpiAD2ycA48MIrzXw/edit?usp=sharing）

■ 胃がんの定義・確定診断
胃がんは消化器系悪性腫瘍の一つで、日本国内では罹患率が第1位、死亡率は肺がんに次いで高い。確定診断は内視鏡検査等で取得した検体の細胞診または組織診（生検）による。

■ 組織型分類（胃癌取扱い規約）
分化型癌：乳頭腺癌（pap）、管状腺癌（tub1, tub2）。未分化型癌：低分化腺癌（por1, por2）、印環細胞癌（sig）等。1病変内に複数の組織型が混在する場合は量的に優勢な組織像で分類する。

■ 深達度による分類
早期胃がん：粘膜層（pT1a）または粘膜下層（pT1b）にとどまる病変。進行胃がん：筋層以降（筋層・漿膜下層・漿膜等）まで浸潤した病変。

■ TNM分類とStage
T（Primary Tumor）＝原発腫瘍の深達度、N（Regional Lymph Nodes）＝胃周囲リンパ節転移の程度・個数、M（Distant Metastasis）＝遠隔転移。この3要素の組み合わせでStage I〜IVが決定される。
Stage I（IA・IB）：早期胃がん中心。リンパ節転移リスクが極めて低い場合はESD（内視鏡的粘膜下層剥離術）、それ以外は腹腔鏡・ロボット手術による胃切除。
Stage II・III：筋層深部浸潤またはリンパ節転移を伴う進行胃がん。リンパ節郭清を伴う手術＋術後補助化学療法（再発予防）や術前化学療法。
Stage IV：肝・肺・腹膜・遠隔リンパ節への遠隔転移。原則切除手術ではなく、バイオマーカー検査（HER2, PD-L1, CLDN18.2等）に基づく薬物療法が第一選択。
日本胃癌学会『胃癌治療ガイドライン』では、リンパ節転移リスクが1％未満と推定され外科的胃切除と同等の成績が得られる病変を「絶対適応病変」として内視鏡的切除（EMR/ESD）の対象とする。

■ 転移様式
リンパ節転移：胃周囲や主要血管沿いのリンパ節へ広がる。早期胃がんでも粘膜下層浸潤（SM浸潤）・潰瘍併存（UL1）・未分化型成分・脈管侵襲があるとリスクが高まり、リンパ節郭清を伴う胃切除術が必要となる。
血行性転移（遠隔転移）：肝臓・肺等への転移。大動脈周囲リンパ節転移も含めステージIVと診断され、薬物療法（抗がん剤・分子標的薬・免疫チェックポイント阻害薬）が中心となる。
腹膜播種（癌性腹膜炎）：漿膜を破って腹腔内に散らばる転移。難治性腹水・イレウス・尿管閉塞を伴う癌性腹膜炎となり、緩和ケアを含む全身管理が必要。ダグラス窩への定着はシュニッツラー転移、卵巣転移はクルッケンベルグ腫瘍と呼ばれる。

■ 原因・リスク要因
H. pylori感染（最大の要因。慢性活動性胃炎・萎縮性胃炎・腸上皮化生を経て分化型腺癌等のリスクが上昇。除菌後も異時性胃がんのリスクは継続するため長期経過観察が必要）、塩分過剰摂取、喫煙、加齢、遺伝的要素。

■ 症状
初期・早期：無症状で経過することが多く、検診で発見されることが多い。
初発・軽度症状：腹部不快感、腹部膨満感、心窩部痛、胸やけ、悪心、食欲不振、食事と無関係な鈍痛。
進行に伴う症状：潰瘍出血によるタール便・貧血（めまい、立ちくらみ、眼球結膜の貧血）、噴門部がんによる嚥下困難・つかえ感、幽門部がんによる幽門狭窄・頻回な嘔吐、進行性の体重減少。

■ 症状発症・初発受診時の看護（周術期以前）
バイタルサインと自覚症状のアセスメント（心窩部痛・胸やけ・悪心嘔吐の程度と食事との関連、貧血症状・タール便・吐血の有無、ショック徴候の迅速な評価）。
栄養状態・消化吸収障害の評価（食事摂取量・体重変化、脱水・低栄養の程度、噴門部がんによる誤嚥防止、幽門部がんによる絶飲食・補液管理の判断）。
心理的ケア（病名告知・検査治療への不安や不確定要素の受け止め）。
検査・処置の説明と管理（上部消化管内視鏡・造影検査に必要な絶飲食(NPO)の遵守、下剤等の前処置指導）。

■ 周術期の主要合併症の原因・要因・症状（まとめ）
①呼吸器合併症（無気肺・肺炎）：全身麻酔による換気量低下・気道分泌物増加、創部痛による喀痰困難、喫煙歴が要因。SpO2低下、呼吸数異常、チアノーゼ、発熱、副雑音、喀痰困難が症状。
②消化器合併症（麻痺性・癒着性イレウス）：麻酔薬による腸蠕動低下、離床の遅れ、腸管の癒着・閉塞が要因。腹部膨満、悪心嘔吐、排ガス・排便停止、腹痛が症状。
③術後せん妄：準備要因（高年齢・認知機能低下）、誘発要因（手術侵襲・麻酔・低酸素血症・疼痛）、促進要因（身体的拘束感・環境変化・睡眠障害）が複合。急性発症・日内変動を特徴とし、過活動型（興奮・妄想・自己抜去）と低活動型（活気低下・傾眠）がある。

■ NotebookLMチャット出力からの統合に関する注記
本資料は複数回のNotebookLM出力に同一内容の繰り返し（周術期看護フレームワークの3期構成が3回、術前管理・治療・検査診断の指針が2回ずつ等）が含まれていたため重複を除去し、NotebookLMインターフェース側の追加提案文（「〜について整理してみますか？」等）を取り除いた、実質的な内容のみを統合したものである。`;

const DEFAULT_REFERENCE_SOURCES = [
  {
    id: 'refsrc_default_notebooklm',
    title: 'NotebookLM 基準ノート',
    url: 'https://notebook.google.com/notebook/7015c97f-8d93-419e-9871-a6e6f2b00b44/preview',
    content: '',
    addedAt: new Date().toISOString()
  },
  {
    id: 'refsrc_gastric_cancer_perioperative',
    title: '胃がん周術期看護 判断基準（Google Docsソース）',
    url: 'https://docs.google.com/document/d/1bzNk5nDwyJTohdFfgk5pDFRBpJIpiAD2ycA48MIrzXw/edit?usp=sharing',
    content: GASTRIC_CANCER_REFERENCE_CONTENT,
    addedAt: new Date().toISOString()
  }
];

let learningDict = loadJson(DICT_FILE, {});
let caseLog = loadJson(LOG_FILE, []);
let patientsDict = loadJson(PATIENTS_FILE, {});
let patientDeletions = loadJson(PATIENT_DELETIONS_FILE, {});
let extractionCriteria = loadJson(CRITERIA_FILE, []);
let notebookContentData = loadJson(NOTEBOOK_CONTENT_FILE, { text: null, updatedAt: null });
// { rules: [{ id, keyword, mode: 'add'|'exclude', hendersonIds, note, updatedAt }], updatedAt }

let customTagRules = loadJson(CUSTOM_TAG_RULES_FILE, { rules: [], updatedAt: null });
let referenceSources = loadJson(REFERENCE_SOURCES_FILE, DEFAULT_REFERENCE_SOURCES);

let patientSnapshots = loadJson(PATIENT_SNAPSHOT_FILE, []);
let patientSnapshotsArchive = loadJson(PATIENT_SNAPSHOT_ARCHIVE_FILE, []);
let cardReports = loadJson(CARD_REPORTS_FILE, []);
let caseLogArchive = loadJson(CASE_LOG_ARCHIVE_FILE, []);
let cardReportsArchive = loadJson(CARD_REPORTS_ARCHIVE_FILE, []);

const PERSISTED_FILES = [
  { mongoId: 'learning-dict', file: DICT_FILE, get: () => learningDict, set: v => { learningDict = v; } },
  { mongoId: 'case-log', file: LOG_FILE, get: () => caseLog, set: v => { caseLog = v; } },
  { mongoId: 'patients', file: PATIENTS_FILE, get: () => patientsDict, set: v => { patientsDict = v; } },
  { mongoId: 'extraction-criteria', file: CRITERIA_FILE, get: () => extractionCriteria, set: v => { extractionCriteria = v; } },
  { mongoId: 'notebook-content', file: NOTEBOOK_CONTENT_FILE, get: () => notebookContentData, set: v => { notebookContentData = v; } },
  { mongoId: 'custom-tag-rules', file: CUSTOM_TAG_RULES_FILE, get: () => customTagRules, set: v => { customTagRules = v; } },
  { mongoId: 'reference-sources', file: REFERENCE_SOURCES_FILE, get: () => referenceSources, set: v => { referenceSources = v; } },
  { mongoId: 'patient-snapshots', file: PATIENT_SNAPSHOT_FILE, get: () => patientSnapshots, set: v => { patientSnapshots = v; } },
  { mongoId: 'patient-snapshots-archive', file: PATIENT_SNAPSHOT_ARCHIVE_FILE, get: () => patientSnapshotsArchive, set: v => { patientSnapshotsArchive = v; } },
  { mongoId: 'card-reports', file: CARD_REPORTS_FILE, get: () => cardReports, set: v => { cardReports = v; } },
  { mongoId: 'case-log-archive', file: CASE_LOG_ARCHIVE_FILE, get: () => caseLogArchive, set: v => { caseLogArchive = v; } },
  { mongoId: 'card-reports-archive', file: CARD_REPORTS_ARCHIVE_FILE, get: () => cardReportsArchive, set: v => { cardReportsArchive = v; } },
  { mongoId: 'patient-deletions', file: PATIENT_DELETIONS_FILE, get: () => patientDeletions, set: v => { patientDeletions = v; } },
];

const PATIENT_STORE_IDS = new Set(['patients', 'patient-deletions']);

// data/learning-dict.json・data/case-log.json・data/patients.json・data/extraction-criteria.json・

if (!MONGODB_URI) {
  ensureDataDir();
  PERSISTED_FILES.forEach(({ file, get }) => {
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(get(), null, 2));
  });
}

let mongoDbPromise = null;
function getMongoDb() {
  if (!MONGODB_URI) return Promise.resolve(null);
  if (!mongoDbPromise) {
    mongoDbPromise = (async () => {

      const { MongoClient } = require(process.env.NURSING_MONGODB_MODULE || 'mongodb');
      const client = new MongoClient(MONGODB_URI);
      await client.connect();
      console.log(`MongoDB connected: ${MONGODB_DB_NAME}`);
      return client.db(MONGODB_DB_NAME);
    })();
  }
  return mongoDbPromise;
}
function getMongoCollection() {
  return getMongoDb().then(db => (db ? db.collection('app_state') : null));
}
function getPatientsCollection() {
  return getMongoDb().then(db => (db ? db.collection('patients') : null));
}

async function loadFromMongo() {
  const collection = await getMongoCollection();
  if (!collection) return;
  const docs = await collection.find({ _id: { $in: PERSISTED_FILES.map(p => p.mongoId) } }).toArray();
  const dataById = new Map(docs.map(d => [d._id, d.data]));
  PERSISTED_FILES.forEach(({ mongoId, set }) => {
    if (PATIENT_STORE_IDS.has(mongoId)) return;
    if (dataById.has(mongoId)) set(dataById.get(mongoId));
  });

  const legacyDeletions = dataById.get('patient-deletions');
  if (isPlainObject(legacyDeletions)) {
    const patients = await getPatientsCollection();
    for (const [id, deletedAt] of Object.entries(legacyDeletions)) {
      if (!isSafeKey(id)) continue;
      const at = typeof deletedAt === 'string' ? deletedAt : new Date().toISOString();
      try { await patients.insertOne({ _id: id, rev: 1, deleted: true, deletedAt: at, data: null, savedAt: at }); }
      catch (e) { if (!(e && e.code === 11000)) throw e; }
    }
  }
  const legacy = dataById.get('patients');
  if (legacy && typeof legacy === 'object') {
    const patients = await getPatientsCollection();
    for (const [id, data] of Object.entries(legacy)) {
      if (!id || !data || typeof data !== 'object') continue;
      try { await patients.insertOne({ _id: id, rev: 1, data, savedAt: new Date().toISOString() }); }
      catch (e) { if (!(e && e.code === 11000)) throw e; }
    }
  }
  patientsDict = {};
  patientDeletions = {};
}

let writeQueue = Promise.resolve();

let writeFileImpl = (file, text) => fs.promises.writeFile(file, text);
async function writeJsonAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFileImpl(tmp, JSON.stringify(data, null, 2));
  await fs.promises.rename(tmp, file);
}

function persist(ids) {
  const targets = PERSISTED_FILES.filter(p => (!ids || ids.includes(p.mongoId)) && !(MONGODB_URI && PATIENT_STORE_IDS.has(p.mongoId)));
  const run = writeQueue.then(async () => {
    const failures = [];
    if (MONGODB_URI) {
      const collection = await getMongoCollection();
      const results = await Promise.allSettled(targets.map(({ mongoId, get }) =>
        collection.updateOne({ _id: mongoId }, { $set: { data: get() } }, { upsert: true })
      ));
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          failures.push(targets[i].mongoId);
          console.error(`MongoDB save failed (${targets[i].mongoId}):`, r.reason);
        }
      });
    } else {
      ensureDataDir();
      const results = await Promise.allSettled(targets.map(({ file, get }) => writeJsonAtomic(file, get())));
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          failures.push(targets[i].mongoId);
          console.error(`File save failed (${targets[i].file}):`, r.reason);
        }
      });
    }
    if (failures.length) {
      const err = new Error(`データの保存に失敗しました（${failures.join('、')}）`);
      err.status = 500;
      throw err;
    }
  });
  writeQueue = run.catch(() => {});
  return run;
}

const SHARED_DOC_MAX_ATTEMPTS = 8;
const sharedDocQueues = new Map();
const sharedDocEntry = id => PERSISTED_FILES.find(p => p.mongoId === id);

async function refreshSharedDocs(ids) {
  if (!MONGODB_URI) return new Map();
  const collection = await getMongoCollection();
  const docs = await collection.find({ _id: { $in: ids } }).toArray();
  const byId = new Map(docs.map(d => [d._id, d]));
  ids.forEach(id => {
    const doc = byId.get(id);
    if (doc && doc.data !== undefined) sharedDocEntry(id).set(doc.data);
  });
  return byId;
}
async function writeSharedDocOnce(id, mutator) {
  const entry = sharedDocEntry(id);
  const collection = await getMongoCollection();
  for (let attempt = 0; attempt < SHARED_DOC_MAX_ATTEMPTS; attempt++) {
    const doc = (await refreshSharedDocs([id])).get(id);
    const result = mutator();
    const data = entry.get();
    let ok;
    try {
      if (!doc) {
        await collection.insertOne({ _id: id, rev: 1, data });
        ok = true;
      } else {
        const hasRev = typeof doc.rev === 'number';
        const r = await collection.updateOne(
          { _id: id, rev: hasRev ? doc.rev : { $exists: false } },
          { $set: { data, rev: (hasRev ? doc.rev : 0) + 1 } }
        );
        ok = !!r && r.matchedCount === 1;
      }
    } catch (e) {
      if (e && e.code === 11000) ok = false;
      else {
        console.error(`MongoDB save failed (${id}):`, e);
        const err = new Error(`データの保存に失敗しました（${id}）`);
        err.status = 500;
        throw err;
      }
    }
    if (ok) { entry.set(data); return result; }
    await new Promise(r => setTimeout(r, 5 + Math.floor(Math.random() * 20 * (attempt + 1))));
  }
  const err = new Error('ほかのサーバーからの保存と重なりました。もう一度保存してください');
  err.status = 409;
  throw err;
}

class SkipSharedWrite extends Error {
  constructor(value) { super('skip'); this.value = value; }
}
function updateSharedDoc(id, mutator) {
  const unwrapSkip = e => { if (e instanceof SkipSharedWrite) return e.value; throw e; };
  if (!MONGODB_URI) {

    const entry = sharedDocEntry(id);
    const prevFile = sharedDocQueues.get(id) || Promise.resolve();
    const runFile = prevFile.then(async () => {
      const backup = cloneJson(entry.get());
      let result;
      try {
        result = mutator();
      } catch (e) {
        if (!(e instanceof SkipSharedWrite)) entry.set(backup);
        throw e;
      }
      try {
        await persist([id]);
      } catch (e) {
        entry.set(backup);
        throw e;
      }
      return result;
    }).catch(unwrapSkip);
    sharedDocQueues.set(id, runFile.catch(() => {}));
    return runFile;
  }
  const prev = sharedDocQueues.get(id) || Promise.resolve();
  const run = prev.then(() => writeSharedDocOnce(id, mutator)).catch(unwrapSkip);
  sharedDocQueues.set(id, run.catch(() => {}));
  return run;
}

function sendSharedDoc(ids, pick) {
  return async (req, res) => {
    await refreshSharedDocs(ids);
    res.json(pick());
  };
}

const PATIENT_SAVE_MAX_ATTEMPTS = 8;
async function patientStoreGetAll() {
  const col = await getPatientsCollection();
  if (!col) return { patients: patientsDict, deletions: patientDeletions };
  const docs = await col.find({}).toArray();
  const patients = {};
  const deletions = {};
  docs.forEach(d => {
    if (d.deleted) deletions[d._id] = d.deletedAt || true;
    else if (d.data) patients[d._id] = d.data;
  });
  return { patients, deletions };
}

let patientFileQueue = Promise.resolve();
function runPatientFileOp(fn) {
  const run = patientFileQueue.then(fn);
  patientFileQueue = run.catch(() => {});
  return run;
}
function assertSafePatientId(id) {
  if (!isSafeKey(id)) {
    const err = new Error('患者IDとして使えない名前です');
    err.status = 400;
    throw err;
  }
}

function mergePatientWithRelationMap(id, incoming, existing, ifMatch) {
  const resetsCase = existing && new Date(incoming.caseResetAt || 0).getTime() > new Date(existing.caseResetAt || 0).getTime();
  const ownsMap = hasOwn(incoming, 'relationMap') || resetsCase;
  const proposed = ownsMap ? incoming.relationMap || null : existing?.relationMap;
  if (proposed != null && proposed.schemaVersion) {
    const fail = message => { const e = new Error(message); e.status = 422; throw e; };
    if (proposed.schemaVersion !== '1.0.0' || proposed.version !== 2 || !Array.isArray(proposed.nodes) || !Array.isArray(proposed.edges)) fail('関連図の形式が一致しません。元のデータを確認してください');
    if (proposed.patientId && proposed.patientId !== id) fail('関連図の患者情報が一致しません');
    if (proposed.nodes.length > 70 || proposed.edges.length > 160) fail('関連図の項目または矢印が多すぎます');
    const ids = new Set(), edgeIds = new Set();
    const types = new Set(['patient_fact', 'disease', 'pathophysiology', 'symptom', 'lab', 'vital', 'medication', 'treatment', 'assessment', 'future_risk', 'nursing_problem']);
    for (const n of proposed.nodes) {
      if (!n || typeof n.id !== 'string' || !n.id || ids.has(n.id) || !types.has(n.type) || typeof n.label !== 'string' || !n.label.trim()) fail('関連図の項目が不正です');
      ids.add(n.id);
      if (n.sourceRefs && (!Array.isArray(n.sourceRefs) || n.sourceRefs.some(r => !r || r.patientId !== id || !['card', 'assessment'].includes(r.sourceType) || typeof r.sourceId !== 'string'))) fail('関連図の根拠が患者と一致しません');
      if (n.type === 'future_risk' && n.epistemicStatus !== 'predicted') fail('今後のリスクは予測として保存してください');
      if ((n.source === 'knowledge' || n.added) && n.type !== 'future_risk' && n.epistemicStatus !== 'inferred') fail('補った推論を事実として保存することはできません');
    }
    for (const e of proposed.edges) {
      if (!e || typeof e.id !== 'string' || !e.id || edgeIds.has(e.id) || !ids.has(e.source) || !ids.has(e.target) || e.source === e.target) fail('関連図の矢印が不正です');
      edgeIds.add(e.id);
    }
  }
  const currentRevision = Number.isSafeInteger(existing?.relationMapRevision) ? existing.relationMapRevision : 0;
  if (ifMatch && ifMatch !== `"relation-map-${currentRevision}"`) {
    const e = new Error('関連図が更新されています。最新の図を確認してください'); e.status = 412; throw e;
  }
  const changed = ownsMap && JSON.stringify(proposed || null) !== JSON.stringify(existing?.relationMap || null);
  if (changed && existing && (incoming.relationMapRevision || 0) !== currentRevision) {
    const err = new Error('ほかの画面または端末で関連図が更新されています。手元の図を保持しています。最新の図を確認してから保存してください');
    err.status = 412;
    throw err;
  }
  const merged = mergePatientRecord(incoming, existing);
  if (ownsMap) merged.relationMap = proposed;
  else if (existing && hasOwn(existing, 'relationMap')) merged.relationMap = existing.relationMap;
  if (ownsMap || currentRevision || hasOwn(incoming, 'relationMapRevision')) merged.relationMapRevision = currentRevision + (changed ? 1 : 0);
  return merged;
}
async function patientStoreSave(id, incoming, { ifMatch } = {}) {
  assertSafePatientId(id);
  const col = await getPatientsCollection();
  if (!col) {
    return runPatientFileOp(async () => {
      if (hasOwn(patientDeletions, id) && patientDeletions[id]) return { deleted: true };
      const hadPrev = hasOwn(patientsDict, id);
      const prev = hadPrev ? patientsDict[id] : undefined;
      const merged = mergePatientWithRelationMap(id, incoming, prev, ifMatch);
      patientsDict[id] = merged;
      try {
        await persist(['patients']);
      } catch (e) {
        if (!hadPrev) delete patientsDict[id]; else patientsDict[id] = prev;
        throw e;
      }
      return { patient: merged };
    });
  }
  for (let attempt = 0; attempt < PATIENT_SAVE_MAX_ATTEMPTS; attempt++) {
    const doc = await col.findOne({ _id: id });
    if (doc && doc.deleted) return { deleted: true };
    const merged = mergePatientWithRelationMap(id, incoming, doc ? doc.data : undefined, ifMatch);
    const savedAt = new Date().toISOString();
    if (doc) {
      const r = await col.updateOne({ _id: id, rev: doc.rev }, { $set: { data: merged, rev: (doc.rev || 0) + 1, savedAt } });
      if (r && r.matchedCount === 1) return { patient: merged, rev: (doc.rev || 0) + 1 };
    } else {
      try {
        await col.insertOne({ _id: id, rev: 1, data: merged, savedAt });
        return { patient: merged, rev: 1 };
      } catch (e) {
        if (!(e && e.code === 11000)) throw e;
      }
    }

  }
  const err = new Error('同じ患者の保存が集中しているため、保存できませんでした。少し待ってから送り直してください。');
  err.status = 409;
  throw err;
}
async function patientStoreDelete(id) {
  assertSafePatientId(id);
  const at = new Date().toISOString();
  const col = await getPatientsCollection();
  if (!col) {
    return runPatientFileOp(async () => {
      const hadPrev = hasOwn(patientsDict, id);
      const prev = patientsDict[id];
      const hadDeletion = hasOwn(patientDeletions, id);
      const prevDeletion = patientDeletions[id];
      delete patientsDict[id];
      patientDeletions[id] = at;
      try {
        await persist(['patients', 'patient-deletions']);
      } catch (e) {
        if (hadPrev) patientsDict[id] = prev;
        if (!hadDeletion) delete patientDeletions[id]; else patientDeletions[id] = prevDeletion;
        throw e;
      }
    });
  }
  await col.updateOne({ _id: id }, { $set: { deleted: true, deletedAt: at, data: null, savedAt: at }, $inc: { rev: 1 } }, { upsert: true });
}

function getEntry(text) {
  if (!hasOwn(learningDict, text) || !isPlainObject(learningDict[text])) {
    learningDict[text] = { preferredType: null, preferredCols: {}, preferredHendersonIds: [], typeVotes: {}, hendersonVotes: {} };
    learningDictNewKeysSinceCap++;
  }
  const entry = learningDict[text];
  if (!isPlainObject(entry.typeVotes)) entry.typeVotes = {};
  if (!isPlainObject(entry.hendersonVotes)) entry.hendersonVotes = {};
  if (!isPlainObject(entry.preferredCols)) entry.preferredCols = {};
  return entry;
}

const LEARNING_TEXT_MAX_LENGTH = 2000;
const LEARNING_DICT_MAX_ENTRIES = 20000;
const LEARNING_DICT_MAX_BYTES = 8 * 1024 * 1024;
const LEARNING_DICT_CAP_CHECK_EVERY = 200;
let learningDictNewKeysSinceCap = 0;
function capLearningDict(force = false) {
  const keys = Object.keys(learningDict);
  if (!force && keys.length <= LEARNING_DICT_MAX_ENTRIES && learningDictNewKeysSinceCap < LEARNING_DICT_CAP_CHECK_EVERY) return 0;
  learningDictNewKeysSinceCap = 0;
  const sizes = new Map(keys.map(k => [k, Buffer.byteLength(JSON.stringify(k), 'utf8') + Buffer.byteLength(JSON.stringify(learningDict[k]) || '', 'utf8') + 2]));
  let total = 0;
  sizes.forEach(s => { total += s; });
  let count = keys.length;
  if (count <= LEARNING_DICT_MAX_ENTRIES && total <= LEARNING_DICT_MAX_BYTES) return 0;
  const time = k => { const e = learningDict[k]; const t = e && typeof e.updatedAt === 'string' ? new Date(e.updatedAt).getTime() : NaN; return Number.isNaN(t) ? 0 : t; };
  const oldestFirst = keys.slice().sort((a, b) => time(a) - time(b));
  let removed = 0;
  for (const k of oldestFirst) {
    if (count <= LEARNING_DICT_MAX_ENTRIES && total <= LEARNING_DICT_MAX_BYTES) break;
    total -= sizes.get(k);
    count--;
    delete learningDict[k];
    removed++;
  }
  return removed;
}

function pickTopVote(votes) {
  if (!votes) return null;
  let best = null, bestCount = 0;
  for (const [key, count] of Object.entries(votes)) {
    if (count > bestCount) { best = key; bestCount = count; }
  }
  return best;
}

const CORS_ALLOWED_ORIGINS = new Set(['https://masadamasayoshi.github.io', ...String(process.env.CORS_ORIGINS || '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean)]);
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && CORS_ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-Match');
    res.setHeader('Access-Control-Expose-Headers', 'ETag');
    res.setHeader('Access-Control-Max-Age', '600');
    if (req.method === 'OPTIONS') return res.status(204).end();
  }
  next();
});

const ROUTE_BODY_PARSER_PATHS = new Set(['/api/learning-dict/sync', '/api/patients/sync', '/api/patient-snapshot', '/api/presence/leave']);
const defaultJsonParser = express.json({ limit: '5mb' });
app.use((req, res, next) => (ROUTE_BODY_PARSER_PATHS.has(req.path) ? next() : defaultJsonParser(req, res, next)));

const PRIVATE_PATH_REGEX = /^\/(?:data|tests|scripts|node_modules|Claude outputs)(?:\/|$)|^\/(?:server\.js|package(?:-lock)?\.json|README\.md|tailwind\.[\w.]+|app-\d+\.js)$/i;

function isPrivateStaticPath(rawPath) {
  let p;
  try { p = decodeURIComponent(String(rawPath || '/')); } catch (e) { return null; }
  if (p.includes('\0')) return null;
  p = path.posix.normalize('/' + p.replace(/\\/g, '/'));
  return PRIVATE_PATH_REGEX.test(p);
}
app.use((req, res, next) => {
  const priv = isPrivateStaticPath(req.path);
  if (priv === null) return res.status(400).end();
  if (priv) return res.status(404).end();
  next();
});
app.use(express.static(__dirname, { extensions: ['html'] }));

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

const RATE_LIMIT_BUCKET_IDLE_MS = 10 * 60 * 1000;
const rateLimitCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitBuckets) {
    if (now - entry.windowStart > RATE_LIMIT_BUCKET_IDLE_MS) rateLimitBuckets.delete(key);
  }
}, 5 * 60 * 1000);
if (typeof rateLimitCleanupTimer.unref === 'function') rateLimitCleanupTimer.unref();

function capString(value, maxLen) {
  return (typeof value === 'string') ? value.slice(0, maxLen) : value;
}

function capArrayByByteSize(arr, maxBytes) {
  if (!Array.isArray(arr) || arr.length === 0) return arr;
  const sizes = arr.map(e => Buffer.byteLength(JSON.stringify(e), 'utf8'));
  let total = sizes.reduce((a, b) => a + b, 0);
  if (total <= maxBytes) return arr;
  let start = 0;
  while (start < arr.length - 1 && total > maxBytes) {
    total -= sizes[start];
    start++;
  }
  return arr.slice(start);
}

const CASE_LOG_MAX_BYTES = 6 * 1024 * 1024;
const CASE_LOG_ARCHIVE_MAX_BYTES = 12 * 1024 * 1024;
const CARD_REPORTS_MAX_BYTES = 6 * 1024 * 1024;
const CARD_REPORTS_ARCHIVE_MAX_BYTES = 12 * 1024 * 1024;

// ---- API ----

app.get('/api/learning-dict', sendSharedDoc(['learning-dict'], () => learningDict));

app.get('/api/case-log', sendSharedDoc(['case-log'], () => caseLog));

// action: 'create' | 'type' | 'tagAdd' | 'tagRemove' | 'col' | 'edit' | 'delete' | 'merge'
app.post('/api/learning-event', rateLimit('learning-event', { windowMs: 60000, max: 300 }), async (req, res) => {
  const { text, action, payload, at } = req.body || {};
  const eventAt = (typeof at === 'string' && at) ? at.slice(0, 40) : new Date().toISOString();

  if (typeof text !== 'string' || !text) {
    return res.status(400).json({ error: 'text is required' });
  }

  const newText = payload && typeof payload === 'object' ? payload.newText : undefined;
  if (!isSafeKey(text) || (action === 'edit' && typeof newText === 'string' && newText && !isSafeKey(newText))) {
    return res.status(400).json({ error: 'text cannot be used as a learning key' });
  }
  if (text.length > LEARNING_TEXT_MAX_LENGTH || (action === 'edit' && typeof newText === 'string' && newText.length > LEARNING_TEXT_MAX_LENGTH)) {
    return res.status(413).json({ error: `text is too long (max ${LEARNING_TEXT_MAX_LENGTH})` });
  }
  const validActions = ['create', 'type', 'tagAdd', 'tagRemove', 'col', 'edit', 'delete', 'adjustTypeVote', 'adjustHendersonVote', 'merge'];
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: `action must be one of ${validActions.join(', ')}` });
  }

  const touchedDict = () => {
    const out = {};
    [text, action === 'edit' ? newText : null].forEach(k => { if (isSafeKey(k) && hasOwn(learningDict, k)) out[k] = learningDict[k]; });
    return out;
  };

  const appendCaseLog = () => updateSharedDoc('case-log', () => {
    caseLog.push({ at: eventAt, text, action, payload: payload || null });
    caseLog = capArrayByByteSize(caseLog, CASE_LOG_MAX_BYTES);
  });
  if (action === 'delete') {
    await updateSharedDoc('learning-dict', () => { delete learningDict[text]; });
    await appendCaseLog();
    return res.json({ ok: true, dict: touchedDict() });
  }

  await updateSharedDoc('learning-dict', () => { applyLearningEvent(text, action, payload, eventAt); capLearningDict(); });
  await appendCaseLog();
  res.json({ ok: true, dict: touchedDict() });
});

function applyLearningEvent(text, action, payload, eventAt) {
  const entry = getEntry(text);

  if (payload && typeof payload === 'object' && payload.type != null && !isSafeKey(String(payload.type))) payload = { ...payload, type: null };

  switch (action) {
    case 'create':

      break;
    case 'type':

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

      if (payload && isSafeKey(payload.newText) && payload.newText !== text) {
        const existed = hasOwn(learningDict, payload.newText) && isPlainObject(learningDict[payload.newText]);
        const copy = cloneJson(entry);
        if (!existed) {
          learningDict[payload.newText] = { ...copy, lastEditedFrom: text, updatedAt: eventAt };
          learningDictNewKeysSinceCap++;
        } else {
          const newEntry = getEntry(payload.newText);
          newEntry.typeVotes = mergeVotesMax(newEntry.typeVotes, copy.typeVotes);
          newEntry.hendersonVotes = mergeVotesMax(newEntry.hendersonVotes, copy.hendersonVotes);
          newEntry.preferredCols = { ...(isPlainObject(copy.preferredCols) ? copy.preferredCols : {}), ...newEntry.preferredCols };
          newEntry.preferredType = pickTopVote(newEntry.typeVotes) || newEntry.preferredType || copy.preferredType || null;
          const tagIds = Object.entries(newEntry.hendersonVotes).filter(([, c]) => c > 0).map(([id]) => Number(id));
          newEntry.preferredHendersonIds = tagIds.length ? tagIds
            : Array.from(new Set([...(Array.isArray(newEntry.preferredHendersonIds) ? newEntry.preferredHendersonIds : []), ...(Array.isArray(copy.preferredHendersonIds) ? copy.preferredHendersonIds : [])]));
          newEntry.lastEditedFrom = text;
          newEntry.updatedAt = eventAt;
        }
      }
      break;
    case 'adjustTypeVote':

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

      if (payload && Array.isArray(payload.sourceTexts)) {
        const typeVotes = {};
        const hendersonVotesRaw = {};
        const preferredColsRaw = {};
        const seen = new Set();
        payload.sourceTexts.forEach(t => {
          if (typeof t !== 'string' || !t || seen.has(t)) return;
          seen.add(t);
          const src = hasOwn(learningDict, t) ? learningDict[t] : null;
          if (!isPlainObject(src)) return;
          Object.entries(src.typeVotes || {}).forEach(([k, v]) => { typeVotes[k] = (typeVotes[k] || 0) + v; });
          Object.entries(src.hendersonVotes || {}).forEach(([k, v]) => { hendersonVotesRaw[k] = (hendersonVotesRaw[k] || 0) + v; });
          Object.assign(preferredColsRaw, src.preferredCols || {});
        });
        if (payload.type && payload.type !== 'unnecessary') {
          typeVotes[payload.type] = (typeVotes[payload.type] || 0) + 1;
        }

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

        entry.lastMergedFrom = payload.sourceTexts.filter(t => typeof t === 'string').slice(0, 50).map(t => t.slice(0, LEARNING_TEXT_MAX_LENGTH));
      }
      break;
  }
  entry.updatedAt = eventAt;
}

function mergeVotesMax(a, b) {
  const out = {};
  [a, b].forEach(votes => {
    if (!isPlainObject(votes)) return;
    Object.entries(votes).forEach(([k, v]) => {
      if (!isSafeKey(k) || typeof v !== 'number' || !Number.isFinite(v) || v < 0) return;
      if (!hasOwn(out, k) || v > out[k]) out[k] = v;
    });
  });
  return out;
}

function sanitizeSyncedLearningEntry(value) {
  if (!isPlainObject(value)) return null;
  const out = {
    preferredType: typeof value.preferredType === 'string' && isSafeKey(value.preferredType) ? value.preferredType.slice(0, 40) : null,
    preferredCols: {},
    preferredHendersonIds: Array.isArray(value.preferredHendersonIds) ? value.preferredHendersonIds.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 14).slice(0, 14) : [],
    typeVotes: mergeVotesMax(value.typeVotes, null),
    hendersonVotes: mergeVotesMax(value.hendersonVotes, null)
  };
  if (isPlainObject(value.preferredCols)) {
    Object.entries(value.preferredCols).forEach(([k, v]) => { if (isSafeKey(k) && typeof v === 'string') out.preferredCols[k] = v.slice(0, 40); });
  }
  if (typeof value.updatedAt === 'string') out.updatedAt = value.updatedAt.slice(0, 40);
  if (typeof value.lastEditedFrom === 'string') out.lastEditedFrom = value.lastEditedFrom.slice(0, LEARNING_TEXT_MAX_LENGTH);
  if (Array.isArray(value.lastMergedFrom)) out.lastMergedFrom = value.lastMergedFrom.filter(t => typeof t === 'string').slice(0, 50).map(t => t.slice(0, LEARNING_TEXT_MAX_LENGTH));
  return out;
}
const learningTime = e => { const t = e && typeof e.updatedAt === 'string' ? new Date(e.updatedAt).getTime() : NaN; return Number.isNaN(t) ? 0 : t; };

app.post('/api/learning-dict/sync', express.json({ limit: '5mb', type: () => true }), rateLimit('learning-dict-sync', { windowMs: 60000, max: 30 }), async (req, res) => {
  const incoming = req.body;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return res.status(400).json({ error: 'body must be an object' });
  }
  const accepted = [];
  let rejected = 0;
  Object.entries(incoming).forEach(([text, value]) => {
    const clean = isSafeKey(text) && text.length <= LEARNING_TEXT_MAX_LENGTH ? sanitizeSyncedLearningEntry(value) : null;
    if (clean) accepted.push([text, clean]); else rejected++;
  });
  await updateSharedDoc('learning-dict', () => {
    accepted.forEach(([text, inc]) => {
      const cur = hasOwn(learningDict, text) && isPlainObject(learningDict[text]) ? learningDict[text] : null;
      if (!cur) { learningDict[text] = cloneJson(inc); learningDictNewKeysSinceCap++; return; }
      if (learningTime(cur) > learningTime(inc)) return;
      const merged = { ...cur, ...inc };
      merged.typeVotes = mergeVotesMax(cur.typeVotes, inc.typeVotes);
      merged.hendersonVotes = mergeVotesMax(cur.hendersonVotes, inc.hendersonVotes);
      merged.preferredCols = { ...(isPlainObject(cur.preferredCols) ? cur.preferredCols : {}), ...inc.preferredCols };
      merged.preferredType = pickTopVote(merged.typeVotes) || inc.preferredType || cur.preferredType || null;
      const tagIds = Object.entries(merged.hendersonVotes).filter(([, c]) => c > 0).map(([k]) => Number(k));
      merged.preferredHendersonIds = tagIds.length ? tagIds
        : Array.from(new Set([...(Array.isArray(cur.preferredHendersonIds) ? cur.preferredHendersonIds : []), ...inc.preferredHendersonIds]));
      if (!merged.updatedAt) delete merged.updatedAt;
      learningDict[text] = merged;
    });
    capLearningDict();
  });
  res.json({ ok: true, accepted: accepted.length, rejected });
});

function isNotStale(incomingPatient, existingPatient) {
  if (!existingPatient) return true;
  const incomingTime = incomingPatient?.updatedAt ? new Date(incomingPatient.updatedAt).getTime() : 0;
  const existingTime = existingPatient?.updatedAt ? new Date(existingPatient.updatedAt).getTime() : 0;
  return incomingTime >= existingTime;
}

const ITEM_TOMBSTONE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

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

const PATIENT_KEYED_RECORD_FIELDS = ['myAssessments', 'missingChecks', 'untaggedReviews', 'carePlans', 'checkpoints'];
function recordTime(r) {
  const t = r && typeof r.updatedAt === 'string' ? new Date(r.updatedAt).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
}
function fillMissingFields(primary, secondary) {

  const isMap = v => v && typeof v === 'object' && !Array.isArray(v);
  const isEmpty = v => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
  if (!isMap(primary) || !isMap(secondary)) return primary;
  const out = { ...primary };
  Object.keys(secondary).forEach(k => {
    if (k === 'id' || k === 'updatedAt' || k === '_touchedAt' || k === 'deleted') return;
    if (isEmpty(out[k])) { if (!isEmpty(secondary[k])) out[k] = secondary[k]; }
    else if (isMap(out[k]) && isMap(secondary[k])) out[k] = fillMissingFields(out[k], secondary[k]);
  });
  return out;
}
function mergeKeyedRecords(a, b) {
  const isMap = v => v && typeof v === 'object' && !Array.isArray(v);
  if (!isMap(a)) return isMap(b) ? b : a;
  if (!isMap(b)) return a;
  const out = { ...a };
  Object.keys(b).forEach(k => {
    if (!(k in out)) out[k] = b[k];
    else if (recordTime(b[k]) > recordTime(out[k])) out[k] = fillMissingFields(b[k], out[k]);
    else out[k] = fillMissingFields(out[k], b[k]);
  });
  return out;
}
function mergeKeyedPatientFields(first, second) {
  const out = {};
  PATIENT_KEYED_RECORD_FIELDS.forEach(f => {
    if (first && f in first || second && f in second) out[f] = mergeKeyedRecords(first && first[f], second && second[f]);
  });
  return out;
}

const CASE_DERIVED_FIELDS = ['myAssessments', 'missingChecks', 'untaggedReviews', 'carePlans', 'checkpoints', 'relationMap'];

function applyCaseReset(a, b) {
  const t = r => (r && r.caseResetAt ? new Date(r.caseResetAt).getTime() || 0 : 0);
  const reset = Math.max(t(a), t(b));
  if (!reset) return [a, b, null];
  const strip = r => {
    if (!r || t(r) >= reset) return r;
    const c = { ...r };
    CASE_DERIVED_FIELDS.forEach(f => { delete c[f]; });
    return c;
  };
  return [strip(a), strip(b), new Date(reset).toISOString()];
}
function mergePatientRecord(incoming, existing, now = Date.now()) {
  if (!existing) return incoming;
  if (!incoming) return existing;
  const __cr = applyCaseReset(incoming, existing);
  incoming = __cr[0]; existing = __cr[1];

  const incomingWins = isNotStale(incoming, existing);
  const base = incomingWins ? fillMissingFields(incoming, existing) : fillMissingFields(existing, incoming);

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
        survivingTombstoneIds.delete(id);
        return;
      }
      if (existingItem && itemEffectiveTime(existingItem, existing.updatedAt) > tombstoneTime) {
        mergedItems.push(existingItem);
        survivingTombstoneIds.delete(id);
        return;
      }
      return;
    }

    if (existingItem && incomingItem) {
      const incomingTime = itemEffectiveTime(incomingItem, incoming.updatedAt);
      const existingTime = itemEffectiveTime(existingItem, existing.updatedAt);
      mergedItems.push(existingTime > incomingTime ? fillMissingFields(existingItem, incomingItem) : fillMissingFields(incomingItem, existingItem));
    } else {
      mergedItems.push(incomingItem || existingItem);
    }
  });

  const mergedTombstones = [...tombstonesById.values()].filter(t => survivingTombstoneIds.has(t.id));
  const incomingUpdatedTime = incoming.updatedAt ? new Date(incoming.updatedAt).getTime() : 0;
  const existingUpdatedTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;

  return {
    ...base,
    ...mergeKeyedPatientFields(existing, incoming),
    items: mergedItems,
    deletedItemIds: mergedTombstones,
    ...(__cr[2] ? { caseResetAt: __cr[2] } : {}),
    updatedAt: (incomingUpdatedTime >= existingUpdatedTime ? incoming.updatedAt : existing.updatedAt) || new Date(now).toISOString()
  };
}

app.get('/api/patients', async (req, res) => {
  const { patients } = await patientStoreGetAll();
  res.json(patients);
});
app.get('/api/patients/:id/relation-map', async (req, res) => {
  assertSafePatientId(req.params.id);
  const { patients } = await patientStoreGetAll();
  const patient = patients[req.params.id];
  if (!patient) return res.status(404).json({ error: '患者がありません' });
  res.set('Cache-Control', 'no-store');
  res.set('ETag', `"relation-map-${patient.relationMapRevision || 0}"`);
  res.json({ relationMap: patient.relationMap || null, relationMapRevision: patient.relationMapRevision || 0 });
});

app.get('/api/patient-deletions', async (req, res) => {
  const { deletions } = await patientStoreGetAll();
  res.json(deletions);
});

app.put('/api/patients/:id', rateLimit('patients-put', { windowMs: 60000, max: 200 }), async (req, res) => {
  const { id } = req.params;
  const patient = req.body;
  if (!id) return res.status(400).json({ error: 'id is required' });
  if (!patient || typeof patient !== 'object' || Array.isArray(patient)) {
    return res.status(400).json({ error: 'body must be a patient object' });
  }
  const result = await patientStoreSave(id, patient, { ifMatch: req.get('If-Match') });
  if (result.deleted) return res.status(410).json({ ok: false, deleted: true, error: 'この患者は完全に削除されています' });
  res.json({ ok: true, patient: result.patient });
});

app.delete('/api/patients/:id', async (req, res) => {
  const { id } = req.params;
  await patientStoreDelete(id);
  res.json({ ok: true });
});

app.post('/api/patients/sync', express.json({ limit: '8mb', type: () => true }), rateLimit('patients-sync', { windowMs: 60000, max: 60 }), async (req, res) => {
  const incoming = req.body;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return res.status(400).json({ error: 'body must be an object' });
  }
  const deleted = [];
  const failed = [];
  for (const [id, patient] of Object.entries(incoming)) {
    if (isSafeKey(id) && patient && typeof patient === 'object') {
      try {
        const r = await patientStoreSave(id, patient);
        if (r.deleted) deleted.push(id);
      } catch (e) {
        console.error(`Patient bulk sync failed (${id}):`, e);
        failed.push(id);
      }
    }
  }
  res.status(failed.length ? 500 : 200).json({ ok: failed.length === 0, deleted, failed });
});

const presence = new Map();
const PRESENCE_TIMEOUT_MS = 45000;

function prunePresence() {
  const now = Date.now();
  for (const [clientId, lastSeen] of presence) {
    if (now - lastSeen > PRESENCE_TIMEOUT_MS) presence.delete(clientId);
  }
}

app.post('/api/presence/heartbeat', (req, res) => {
  const { clientId } = req.body || {};
  if (typeof clientId === 'string' && clientId) presence.set(clientId, Date.now());
  prunePresence();
  res.json({ count: presence.size });
});

app.post('/api/presence/leave', express.json({ limit: '10kb', type: () => true }), (req, res) => {
  const { clientId } = req.body || {};
  if (typeof clientId === 'string' && clientId) presence.delete(clientId);
  res.json({ ok: true });
});

app.get('/api/extraction-criteria', sendSharedDoc(['extraction-criteria'], () => extractionCriteria));

app.post('/api/extraction-criteria', rateLimit('extraction-criteria', { windowMs: 60000, max: 30 }), async (req, res) => {
  const { text } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  const entry = { id: 'crit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), text: capString(text.trim(), 2000), addedAt: new Date().toISOString() };
  await updateSharedDoc('extraction-criteria', () => { extractionCriteria.push(entry); });
  res.json(extractionCriteria);
});

app.put('/api/extraction-criteria/:id', rateLimit('extraction-criteria', { windowMs: 60000, max: 30 }), async (req, res) => {
  const { id } = req.params;
  const { text } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  const found = await updateSharedDoc('extraction-criteria', () => {
    const entry = extractionCriteria.find(c => c.id === id);
    if (!entry) throw new SkipSharedWrite(false);
    entry.text = capString(text.trim(), 2000);
    entry.updatedAt = new Date().toISOString();
    return true;
  });
  if (!found) {
    return res.status(404).json({ error: 'not found' });
  }
  res.json(extractionCriteria);
});

app.delete('/api/extraction-criteria/:id', async (req, res) => {
  const { id } = req.params;
  await updateSharedDoc('extraction-criteria', () => { extractionCriteria = extractionCriteria.filter(c => c.id !== id); });
  res.json(extractionCriteria);
});

app.get('/api/notebook-content', sendSharedDoc(['notebook-content'], () => notebookContentData));

app.put('/api/notebook-content', rateLimit('notebook-content', { windowMs: 60000, max: 20 }), async (req, res) => {
  const { text } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  await updateSharedDoc('notebook-content', () => { notebookContentData = { text: capString(text.trim(), 50000), updatedAt: new Date().toISOString() }; });
  res.json(notebookContentData);
});

const CUSTOM_TAG_RULES_MAX = 500;
function sanitizeCustomTagRules(rules) {
  if (!Array.isArray(rules)) return null;
  return rules.slice(0, CUSTOM_TAG_RULES_MAX).map(r => ({
    id: typeof r?.id === 'string' && /^[\w-]{1,40}$/.test(r.id) ? r.id : 'rule_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    keyword: typeof r?.keyword === 'string' ? r.keyword.normalize('NFKC').trim().slice(0, 40) : '',
    mode: r?.mode === 'exclude' ? 'exclude' : 'add',
    hendersonIds: Array.from(new Set((Array.isArray(r?.hendersonIds) ? r.hendersonIds : []).map(Number).filter(h => Number.isInteger(h) && h >= 1 && h <= 14))).sort((a, b) => a - b),
    note: typeof r?.note === 'string' ? r.note.trim().slice(0, 200) : '',
    updatedAt: typeof r?.updatedAt === 'string' ? r.updatedAt.slice(0, 40) : new Date().toISOString()
  })).filter(r => r.keyword && r.hendersonIds.length > 0);
}
app.get('/api/custom-tag-rules', sendSharedDoc(['custom-tag-rules'], () => customTagRules));
app.put('/api/custom-tag-rules', rateLimit('custom-tag-rules', { windowMs: 60000, max: 30 }), async (req, res) => {
  const rules = sanitizeCustomTagRules(req.body?.rules);
  if (!rules) return res.status(400).json({ error: 'rules must be an array' });
  await updateSharedDoc('custom-tag-rules', () => { customTagRules = { rules, updatedAt: new Date().toISOString() }; });
  res.json(customTagRules);
});

app.get('/api/reference-sources', sendSharedDoc(['reference-sources'], () => referenceSources));

app.post('/api/reference-sources', rateLimit('reference-sources', { windowMs: 60000, max: 30 }), async (req, res) => {
  const { title, url, content } = req.body || {};
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'url is required' });
  }

  if (!/^https?:\/\//i.test(url.trim())) {
    return res.status(400).json({ error: 'url must start with http:// or https://' });
  }
  const entry = {
    id: 'refsrc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    title: capString(title.trim(), 200),
    url: capString(url.trim(), 2000),
    content: capString((typeof content === 'string' ? content.trim() : ''), 30000),
    addedAt: new Date().toISOString()
  };
  await updateSharedDoc('reference-sources', () => { referenceSources.push(entry); });
  res.json(referenceSources);
});

app.put('/api/reference-sources/:id', rateLimit('reference-sources', { windowMs: 60000, max: 30 }), async (req, res) => {
  const { id } = req.params;
  const { title, url, content } = req.body || {};
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'url is required' });
  }

  if (!/^https?:\/\//i.test(url.trim())) {
    return res.status(400).json({ error: 'url must start with http:// or https://' });
  }
  const found = await updateSharedDoc('reference-sources', () => {
    const entry = referenceSources.find(r => r.id === id);
    if (!entry) throw new SkipSharedWrite(false);
    entry.title = capString(title.trim(), 200);
    entry.url = capString(url.trim(), 2000);
    entry.content = capString((typeof content === 'string' ? content.trim() : ''), 30000);
    entry.updatedAt = new Date().toISOString();
    return true;
  });
  if (!found) {
    return res.status(404).json({ error: 'not found' });
  }
  res.json(referenceSources);
});

app.delete('/api/reference-sources/:id', async (req, res) => {
  const { id } = req.params;
  await updateSharedDoc('reference-sources', () => { referenceSources = referenceSources.filter(r => r.id !== id); });
  res.json(referenceSources);
});

const PATIENT_SNAPSHOT_MAX_PATIENTS_PER_REQUEST = 50;
const PATIENT_SNAPSHOT_MAX_ITEMS_PER_PATIENT = 500;

const PATIENT_SNAPSHOT_MAX_BYTES = 6 * 1024 * 1024;
const PATIENT_SNAPSHOT_ARCHIVE_MAX_BYTES = 12 * 1024 * 1024;

app.post('/api/patient-snapshot', express.json({ limit: '8mb', type: () => true }), rateLimit('patient-snapshot', { windowMs: 60000, max: 60 }), async (req, res) => {
  const { clientId, patients } = req.body || {};
  if (!Array.isArray(patients) || patients.length === 0) {
    return res.status(400).json({ error: 'patients is required' });
  }
  const at = new Date().toISOString();
  const entries = patients
    .filter(p => p && typeof p === 'object' && typeof p.patientId === 'string' && p.patientId)
    .slice(0, PATIENT_SNAPSHOT_MAX_PATIENTS_PER_REQUEST)
    .map(p => ({
      id: 'snap_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      clientId: typeof clientId === 'string' ? clientId : null,
      patientId: p.patientId,
      patientTitle: capString(typeof p.patientTitle === 'string' ? p.patientTitle : '', 200),
      items: Array.isArray(p.items) ? p.items.slice(0, PATIENT_SNAPSHOT_MAX_ITEMS_PER_PATIENT) : [],
      sourceText: capString(typeof p.sourceText === 'string' ? p.sourceText : '', 50000),
      closedAt: at
    }));
  if (entries.length === 0) return res.status(400).json({ error: 'no valid patient snapshots' });
  await updateSharedDoc('patient-snapshots', () => {
    patientSnapshots.push(...entries);
    patientSnapshots = capArrayByByteSize(patientSnapshots, PATIENT_SNAPSHOT_MAX_BYTES);
  });
  res.json({ ok: true, count: entries.length });
});

app.get('/api/patient-snapshots', sendSharedDoc(['patient-snapshots'], () => patientSnapshots));

app.get('/api/card-reports', sendSharedDoc(['card-reports'], () => cardReports));

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

  const newGroupId = 'rpt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const group = await updateSharedDoc('card-reports', () => {
    let g = (typeof sessionId === 'string' && sessionId) ? cardReports.find(x => x.sessionId === sessionId) : null;
    if (g && g.items.length >= CARD_REPORT_MAX_ITEMS_PER_GROUP) throw new SkipSharedWrite(null);
    if (g) {
      g.items.push(newItem);
      g.updatedAt = now;
    } else {
      g = {
        id: newGroupId,
        sessionId: typeof sessionId === 'string' ? sessionId : null,
        patientId: newItem.patientId,
        patientTitle: newItem.patientTitle,
        items: [newItem],
        createdAt: now,
        updatedAt: now
      };
      cardReports.push(g);
    }
    cardReports = capArrayByByteSize(cardReports, CARD_REPORTS_MAX_BYTES);
    return JSON.parse(JSON.stringify(g));
  });
  if (!group) {
    return res.status(429).json({ error: '同じセッションからの報告件数が上限に達しました。' });
  }
  res.json(group);
});

const ARCHIVE_THRESHOLD_DAYS = 90;
const ARCHIVE_INTERVAL_MS = 24 * 60 * 60 * 1000;

function isOlderThanThresholdDays(isoString, thresholdDays) {
  if (!isoString) return false;
  const t = new Date(isoString).getTime();
  if (Number.isNaN(t)) return false;
  return (Date.now() - t) > thresholdDays * 24 * 60 * 60 * 1000;
}

const ARCHIVE_KINDS = [
  { label: '事例ログ', srcId: 'case-log', archiveId: 'case-log-archive', dateKey: 'at', srcMax: CASE_LOG_MAX_BYTES, archiveMax: CASE_LOG_ARCHIVE_MAX_BYTES },
  { label: '情報カードの報告', srcId: 'card-reports', archiveId: 'card-reports-archive', dateKey: 'updatedAt', srcMax: CARD_REPORTS_MAX_BYTES, archiveMax: CARD_REPORTS_ARCHIVE_MAX_BYTES },
  { label: 'カルテスナップショット', srcId: 'patient-snapshots', archiveId: 'patient-snapshots-archive', dateKey: 'closedAt', srcMax: PATIENT_SNAPSHOT_MAX_BYTES, archiveMax: PATIENT_SNAPSHOT_ARCHIVE_MAX_BYTES }
];
const archiveRecordKey = e => (e && e.id ? 'id:' + e.id : 'json:' + JSON.stringify(e));
async function archiveOneKind(kind) {
  const src = sharedDocEntry(kind.srcId);
  const arc = sharedDocEntry(kind.archiveId);
  const isOld = e => isOlderThanThresholdDays(e && e[kind.dateKey], ARCHIVE_THRESHOLD_DAYS);
  await refreshSharedDocs([kind.srcId]);
  const oldEntries = (src.get() || []).filter(isOld);
  let archiveTrimmed = false, sourceTrimmed = false, moved = 0;

  await updateSharedDoc(kind.archiveId, () => {
    const current = Array.isArray(arc.get()) ? arc.get() : [];
    const have = new Set(current.map(archiveRecordKey));
    const add = oldEntries.filter(e => !have.has(archiveRecordKey(e)));
    const next = capArrayByByteSize(current.concat(add), kind.archiveMax);
    archiveTrimmed = next.length !== current.length + add.length;
    if (add.length === 0 && !archiveTrimmed) throw new SkipSharedWrite();
    arc.set(next);
  });

  await updateSharedDoc(kind.srcId, () => {
    const current = Array.isArray(src.get()) ? src.get() : [];
    const kept = current.filter(e => !isOld(e));
    const next = capArrayByByteSize(kept, kind.srcMax);
    moved = current.length - kept.length;
    sourceTrimmed = next.length !== kept.length;
    if (moved === 0 && !sourceTrimmed) throw new SkipSharedWrite();
    src.set(next);
  });
  return { moved, trimmed: archiveTrimmed || sourceTrimmed };
}
async function runArchiving() {
  const results = [];
  for (const kind of ARCHIVE_KINDS) {
    try {
      results.push({ kind, ...(await archiveOneKind(kind)) });
    } catch (e) {
      console.error(`Archive save failed (${kind.srcId}); retry on next cycle:`, e);
      results.push({ kind, moved: 0, trimmed: false });
    }
  }
  const trimmedAnything = results.some(r => r.trimmed);
  if (results.some(r => r.moved > 0) || trimmedAnything) {
    console.log(`Archived: ${results.map(r => `${r.kind.srcId}:${r.moved}`).join(', ')}${trimmedAnything ? '; oldest entries capped' : ''}`);
  }
}

app.get('/api/case-log/archive', sendSharedDoc(['case-log-archive'], () => caseLogArchive));
app.get('/api/card-reports/archive', sendSharedDoc(['card-reports-archive'], () => cardReportsArchive));
app.get('/api/patient-snapshots/archive', sendSharedDoc(['patient-snapshots-archive'], () => patientSnapshotsArchive));

async function startServer() {
  if (MONGODB_URI) {
    await loadFromMongo();
  }
  runArchiving();
  setInterval(runArchiving, ARCHIVE_INTERVAL_MS);

  app.listen(PORT, () => {
    console.log(`Server http://localhost:${PORT}; storage: ${MONGODB_URI ? 'MongoDB' : 'local JSON'}`);
  });
}
if (require.main === module) {
  startServer().catch(err => {
    console.error('Server startup failed:', err);
    process.exit(1);
  });
}

module.exports = {
  app,
  loadFromMongo,
  persist,
  patientStoreSave,

  setWriteFileImplForTest: fn => { writeFileImpl = fn || ((file, text) => fs.promises.writeFile(file, text)); },
  DATA_DIR,
  mergePatientRecord,
  mergeKeyedRecords,
  isNotStale,
  pruneTombstones,
  itemEffectiveTime,
  isOlderThanThresholdDays,
  runArchiving,
  updateSharedDoc,
  refreshSharedDocs,
  rateLimit,
  capString,
  capArrayByByteSize,
  pickTopVote,
  isPrivateStaticPath,
  isSafeKey,
  LEARNING_TEXT_MAX_LENGTH
};
