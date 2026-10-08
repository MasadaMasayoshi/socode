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
// data/reference-sources.json … NotebookLM等の外部の参照元を「名前＋リンク（URL）＋
//   （任意で）貼り付けた内容」の形で積み上げる配列。NotebookLMには個人利用者が取得できる
//   公開APIが無く（2026年9月時点、企業向けのGemini Enterprise版のみで組織のライセンスが
//   必要）、「APIキーを取得してリンクを貼るだけで内容を自動取得する」という連携は
//   技術的に作れない。そのため名前とリンクを登録し、内容はコピー＆ペーストで貼り付けて
//   もらう方式にしている。学習データ管理画面の「分類基準」タブから追加・編集・削除でき、
//   全利用者に共有される。貼り付けられた内容（content）だけが、フロントエンド側の
//   buildEffectiveNotebookContent()経由でAIへの指示文に統合される（リンクのみで内容が
//   未貼付のものは一覧に残るが、AIの分類には反映されない）。
//
// data/*-archive.json（case-log-archive.json / card-reports-archive.json /
//   patient-snapshots-archive.json）… 上記の追記専用ログのうち、ARCHIVE_THRESHOLD_DAYS
//   （既定90日）より古くなったエントリーを自動整理（runArchiving、24時間おきに実行）で
//   移した先。削除はせず、対応する GET .../archive エンドポイントから引き続き参照できる。
//   これにより日常使う一覧（学習データ管理の各タブ）は軽いまま保たれる。
//
// （旧 data/extraction-log.json ＝「抽出前の文章」履歴は廃止した。分類ボードの入力欄に
//   貼り付けた文章はpatient-snapshots.json（カルテスナップショット）側にも同じ内容が
//   保存されるようになったため、二重に持つ必要が無くなったことによる。）
//
// データの永続化は単純なJSONファイルです。件数が増えてきたらSQLite等へ
// 置き換えてください（読み書きは loadJson/persist にまとまっています）。
//
// ---- 無料ホスティング（Render等）向けのMongoDB Atlas対応について ----
// Render・Railway・Fly.io等の無料枠は、再起動・再デプロイのたびにディスクの中身が
// 消えてしまう前提のため、上記のJSONファイル保存だけだと「共有学習」で貯まったデータが
// いつか消えてしまう。これを避けるため、環境変数 MONGODB_URI が設定されている場合は、
// 保存先をこのファイル保存ではなくMongoDB Atlas（無料のM0クラスタ）へ自動的に切り替える
// （getMongoCollection/loadFromMongo/persist参照）。MONGODB_URIが未設定の場合（ローカル開発・
// 自動テストを含む）は、これまで通りdata/以下のJSONファイルにそのまま保存する。
// どちらの保存先でも、上のPERSISTED_FILESに登録した各データ（learningDict等）を
// そのままの形（1つのJSONオブジェクト・配列）で1件のドキュメント/ファイルとして保存する
// だけなので、既存のAPI・分類・マージ等のロジックは一切変更していない。
// ============================================================================

// ---- ローカル環境とオンライン（Render）環境の設定情報を統合するための.envサポート ----
// 【背景】利用者からの要望：「ローカルとオンラインでの設定情報を統合して同期して。今後
// 別々に管理しなくていいようにして」。ローカルで`node server.js`を実行する場合と、Renderに
// デプロイされたオンライン版とで、これまでMONGODB_URIが設定されているかどうかが異なり
// （ローカル開発では通常未設定→data/以下のJSONファイル保存、Renderでは設定済み→MongoDB
// Atlas保存）、保存先のデータベース自体が別々になっていた。学習データ・患者カルテ等は
// 元々サーバー側での複数端末同期・マージの仕組みを備えている（mergePatientRecord等）ため、
// ローカルもRenderと「同じ」MongoDB Atlasデータベースを見るようにMONGODB_URIを揃えるだけで、
// 以降はコード変更なしにローカル・オンラインどちらで開いても同じデータを共有できる。
// dotenvはローカル実行時に`.env`ファイル（Gitには含めない秘密情報）からMONGODB_URI等を
// 読み込むためだけに使う。Render等の本番環境では環境変数がホスティング側の管理画面から
// 直接注入されるため.envファイル自体が存在せず、dotenv.config()は何もせず静かに終わる
// （.envが無くてもエラーにはならない）。
try { require('dotenv').config(); } catch (e) { /* dotenv未インストールでも既存の動作（環境変数を直接使う）に影響しない */ }

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
// 【保存に失敗したのに成功を返す不具合の修正】async のAPIの中で保存が失敗（reject）したら、500 と ok:false を返す。
// （express 4 は async 関数の失敗を自動では受け取らないため、ここでまとめて受け取る）
function sendServerError(res, err) {
  console.error('APIの処理に失敗しました:', err);
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
        return undefined; // 失敗はここで受け取ったので、express 側で二重に応答しないよう Promise は返さない
      }
      : h)));
  };
});
const PORT = process.env.PORT || 3000;

// 【レビューで発見】Render などのホスティングでは、利用者の通信は手前の中継サーバー（プロキシ）を通って届く。
// そのままだと req.ip が中継サーバーの住所になり、IPアドレスごとのレート制限（rateLimit）が「全利用者で1つ」に
// なっていた（例：サイト全体で情報カードの報告が1分に20件まで、患者の保存が1分に200件まで）。
// Render上（環境変数 RENDER が自動で設定される）か、TRUST_PROXY を設定したときだけ、1段目の中継サーバーが
// 伝える元の住所（X-Forwarded-For）を使う（中継サーバーの無いローカル実行では、偽装できないよう使わない）。
if (process.env.RENDER || process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  app.set('trust proxy', Number.isInteger(hops) && hops > 0 ? hops : 1);
}

// 【レビューで発見】'__proto__' などの名前を、共有データ（学習辞書・患者の一覧など、文字列をキーにした
// オブジェクト）のキーとして使うと、Object.prototype（全オブジェクトの共通の親）を書き換えてしまっていた
// （例：text='__proto__' の学習イベントで、サーバー内のすべてのオブジェクトに updatedAt などが生えた）。
// こうした名前はキーとして受け付けず、キーの有無は必ず「自分自身のキーか」（Object.hasOwn）で確かめる。
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function isSafeKey(key) {
  return typeof key === 'string' && key.length > 0 && !UNSAFE_OBJECT_KEYS.has(key);
}
const hasOwn = (obj, key) => obj != null && Object.prototype.hasOwnProperty.call(obj, key);
const isPlainObject = v => !!v && typeof v === 'object' && !Array.isArray(v);
// JSONとして保存できる内容の複製（保存に失敗したときに元へ戻すための控え）
const cloneJson = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

// MongoDB Atlas（無料枠）への接続文字列。設定されていればデータの保存先をMongoDBに切り替える
// （未設定ならこれまで通りローカルのJSONファイルに保存する。ローカル開発・自動テストでは
// 通常設定しない）。接続先のデータベース名はMONGODB_DB_NAMEで変更できる（既定値あり）。
const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'nursing_assessment';

// NURSING_DATA_DIRを指定すると保存先フォルダを切り替えられる（自動テストが本番のdata/フォルダを
// 汚さないよう、一時フォルダを指すために使う。通常の起動では指定不要で、これまで通りdata/を使う）。
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
// 自動整理（アーカイブ）先。古くなった記録は下の3ファイルから消すのではなく、こちらへ
// そのまま移して残す（研究用途で失われないようにするため）。詳細はrunArchiving()を参照。
const CASE_LOG_ARCHIVE_FILE = path.join(DATA_DIR, 'case-log-archive.json');
const CARD_REPORTS_ARCHIVE_FILE = path.join(DATA_DIR, 'card-reports-archive.json');
const PATIENT_SNAPSHOT_ARCHIVE_FILE = path.join(DATA_DIR, 'patient-snapshots-archive.json');
// 完全に削除した患者の記録（{ [患者ID]: 削除した日時 }）。削除した後に別の端末から古いカルテが送られてきても、
// 患者を復活させないために使う（「完全に削除した患者が復活する」不具合の修正）。
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

// app.js側のDEFAULT_NOTEBOOK_CONTENT（基準ノート本体の初期値）の先頭には元々、
// このノートの作成元になったNotebookLMノートへのリンクが説明文として埋め込まれていた
// （「【NotebookLM 基準ノート: https://.../preview】」）。これは自動取得されるわけではない
// 単なる説明テキストで、これまでは編集も削除もできなかった。参照元リンク機能を追加した際に、
// このリンクも「参照元」の一覧に登録しておき、他の参照元と同じように編集・削除できるようにする
// （reference-sources.jsonがまだ存在しない＝初回起動時にだけ、この初期値でファイルが作られる。
// 　一度作られた後は、利用者がこの一覧上で編集・削除した内容がそのまま保持される）。
// 胃がん（胃切除術）周術期看護に関する追加の参照元。利用者が最初に提示したNotebookLMの2つの
// ノートはrobots.txtにより自動取得不可で、利用者自身も開けない/使えないリンクだったため
// コード上の出典表記からは除外し、実際に内容を統合できたGoogle Docsソースのみを出典として
// 残す（利用者からの指示：「使用できないリンクはコードから除外していいですよ」）。
// 最終的にはGoogle Docsの内容をテキストファイルで共有してもらい、重複除去・NotebookLMの
// UI提案文（「〜整理してみますか？」等）を除いた上でここに統合している。DEFAULT_NOTEBOOK_CONTENT
// （app.js）側には、AI分類のタグ付けに直結する要点（ヘンダーソン項目との対応など）を優先して
// まとめており、ここではそれを補うより詳しい臨床的な背景（組織分類・TNM/Stage・初発症状時の
// 看護等）を保持する。
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
let patientsDict = loadJson(PATIENTS_FILE, {}); // { [patientId]: 患者データ（items・sourceText等を含む） }（JSONファイル保存のときだけ使う）
let patientDeletions = loadJson(PATIENT_DELETIONS_FILE, {}); // { [patientId]: 削除した日時 }（JSONファイル保存のときだけ使う）
let extractionCriteria = loadJson(CRITERIA_FILE, []); // [{ id, text, addedAt }] AI抽出・分類に使う追加の要望（全利用者共有）
let notebookContentData = loadJson(NOTEBOOK_CONTENT_FILE, { text: null, updatedAt: null }); // { text, updatedAt } NotebookLM基準ノート本体（全利用者共有）。textがnullの間はクライアント側の初期値(DEFAULT_NOTEBOOK_CONTENT)を使う
// { rules: [{ id, keyword, mode: 'add'|'exclude', hendersonIds, note, updatedAt }], updatedAt }
// 学習データ管理の「追加キーワード」タブで登録するタグ付けのルール（全利用者共有。app.jsのcustomTagRuleSets参照）
let customTagRules = loadJson(CUSTOM_TAG_RULES_FILE, { rules: [], updatedAt: null });
let referenceSources = loadJson(REFERENCE_SOURCES_FILE, DEFAULT_REFERENCE_SOURCES); // [{ id, title, url, content, addedAt, updatedAt }] 参照元リンク（NotebookLM等。全利用者共有）。ファイルが無い初回起動時のみDEFAULT_REFERENCE_SOURCESを使う
// [{ id, clientId, patientId, patientTitle, items, sourceText, closedAt }] タブを閉じた時点の患者カルテのスナップショット履歴。
// patients.json側は他端末とカード単位でマージされ続ける「最新の共有カルテ」だが、ここはその時点の
// 内容を上書きせずそのまま記録として積み重ねる（学習データ管理画面から後で振り返れるようにするため）。
let patientSnapshots = loadJson(PATIENT_SNAPSHOT_FILE, []);
let patientSnapshotsArchive = loadJson(PATIENT_SNAPSHOT_ARCHIVE_FILE, []);
let cardReports = loadJson(CARD_REPORTS_FILE, []); // [{ id, sessionId, patientId, patientTitle, items: [{cardText, comment, at}], createdAt, updatedAt }] 情報カードの不具合報告
let caseLogArchive = loadJson(CASE_LOG_ARCHIVE_FILE, []);
let cardReportsArchive = loadJson(CARD_REPORTS_ARCHIVE_FILE, []);

// 保存対象データの一覧。getは常にその時点の最新の値を返し、setはMongoDBから読み込んだ内容で
// 変数を丸ごと入れ替える（いずれも再代入されるlet変数をクロージャで参照するため、後から
// reassign されても正しく最新の内容を保存・反映できる）。mongoIdはMongoDB利用時の
// ドキュメントの_id（ファイル名の代わり）。起動時のファイル作成チェック・persist()・
// loadFromMongo()のすべてでこの一覧を使い回し、データを1つ増減する際の変更箇所を1か所にまとめる。
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
// MongoDBを使うとき、患者カルテ（と削除の記録）は app_state の1つの文書ではなく、patients コレクションに
// 患者1人＝1文書で保存する（下の「患者カルテの保存先」を参照）。persist() では書かない。
const PATIENT_STORE_IDS = new Set(['patients', 'patient-deletions']);

// 学習専用ファイルを起動時点でフォルダ内に必ず用意しておく（初回アクセス前でも
// data/learning-dict.json・data/case-log.json・data/patients.json・data/extraction-criteria.json・
// data/card-reports.json・data/patient-snapshots.json・各アーカイブファイルが存在する状態にし、
// 以後はこの1つのファイルに追加・削除を重ねていく。新しいファイルを都度作ることはしない）。
// MongoDBを使う場合（MONGODB_URI設定時）はこのファイル作成自体が不要かつ無意味（無料ホスティングの
// ディスクは再起動で消える前提のため）なので、ローカルのJSONファイルを使う場合のみ実行する。
if (!MONGODB_URI) {
  ensureDataDir();
  PERSISTED_FILES.forEach(({ file, get }) => {
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(get(), null, 2));
  });
}

// ---- MongoDB Atlas接続（MONGODB_URI設定時のみ使う）----
// "mongodb"パッケージは、ローカル開発・自動テスト（MONGODB_URI未設定）では一切requireされない
// （このサンドボックス環境や、npm installしていない環境でもserver.js自体は問題なく動く）。
// 実際にRenderなど本番環境でMONGODB_URIを設定してnpm installした場合にのみ、遅延require
// （関数の中でrequireする）によって読み込まれる。
let mongoDbPromise = null;
function getMongoDb() {
  if (!MONGODB_URI) return Promise.resolve(null);
  if (!mongoDbPromise) {
    mongoDbPromise = (async () => {
      // NURSING_MONGODB_MODULE は自動テスト用（本物のMongoDBの代わりに、テスト用の小さな模擬DBを使う）
      const { MongoClient } = require(process.env.NURSING_MONGODB_MODULE || 'mongodb');
      const client = new MongoClient(MONGODB_URI);
      await client.connect();
      console.log(`MongoDB Atlas（データベース: ${MONGODB_DB_NAME}）に接続しました。`);
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

// サーバー起動時に一度だけ、MongoDB上にある前回までの保存内容を読み込み、対応するlet変数へ
// 反映する（ドキュメントがまだ無いデータ＝初回起動時はloadJsonで設定済みの既定値のまま残す）。
async function loadFromMongo() {
  const collection = await getMongoCollection();
  if (!collection) return;
  const docs = await collection.find({ _id: { $in: PERSISTED_FILES.map(p => p.mongoId) } }).toArray();
  const dataById = new Map(docs.map(d => [d._id, d.data]));
  PERSISTED_FILES.forEach(({ mongoId, set }) => {
    if (PATIENT_STORE_IDS.has(mongoId)) return;
    if (dataById.has(mongoId)) set(dataById.get(mongoId));
  });
  // 以前の形式（app_state の 'patients' 文書に全患者をまとめて保存）からの移行：患者1人＝1文書にする。
  // すでに patients コレクションにある患者は上書きしない（移行を何度実行しても安全）。
  // 【レビューで発見】以前の形式の「完全に削除した患者の記録」（app_state の 'patient-deletions' 文書）が
  // 移されずに無視されていたため、削除の後に古い端末から保存が来ると、削除した患者が復活していた。
  // 患者の移行より先に、削除済みの印の文書として移す（すでに patients コレクションにある患者は上書きしない）。
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

// 書き込みが競合しないよう、保存処理を1本のPromiseチェーンで直列化する
let writeQueue = Promise.resolve();
// JSONファイルは、一時ファイルに書いてから名前を変えて置き換える（書き込みの途中で止まっても壊れたファイルを残さない）。
// writeFileImpl は自動テストで「書き込みの失敗」を起こすために差し替えられるようにしてある。
let writeFileImpl = (file, text) => fs.promises.writeFile(file, text);
async function writeJsonAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFileImpl(tmp, JSON.stringify(data, null, 2));
  await fs.promises.rename(tmp, file);
}
// 【保存に失敗したのに成功を返す不具合の修正】以前は保存の失敗をログに出すだけで、APIは 200 / ok:true を返していた。
// 失敗したら Promise を失敗（reject）で終わらせ、呼び出し元（各API）が 500 と ok:false を返せるようにする
// （画面側は「未保存」のまま残して送り直す）。ids を渡すと、そのデータだけを書く（MongoDB利用時に、変えていない
// データまで各サーバーの手元の古い内容で上書きしないように）。
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
          console.error(`データの保存に失敗しました（MongoDB: ${targets[i].mongoId}）:`, r.reason);
        }
      });
    } else {
      ensureDataDir();
      const results = await Promise.allSettled(targets.map(({ file, get }) => writeJsonAtomic(file, get())));
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          failures.push(targets[i].mongoId);
          console.error(`データの保存に失敗しました（ファイル: ${targets[i].file}）:`, r.reason);
        }
      });
    }
    if (failures.length) {
      const err = new Error(`データの保存に失敗しました（${failures.join('、')}）`);
      err.status = 500;
      throw err;
    }
  });
  writeQueue = run.catch(() => {}); // 1回の失敗で、後の保存が止まらないようにする
  return run;
}

// ---- 患者以外の共有データ（学習データ・事例ログ・スナップショット・カードの報告・基準など）の保存 ----
// 【複数サーバーからの保存でデータが消える不具合の修正（患者以外）】以前は、起動時に1回だけ読んだ手元の内容に
// 追加して、種類ごとの1文書をまるごと上書きしていた。サーバーが2台以上あると、後から保存したサーバーが
// 先に保存したサーバーの追加分（学習の票・事例ログ・報告など）を消していた。MongoDB利用時は：
//  ・変更の直前にDBから今の内容を読み直し、そこへ変更を加える（mutator）。
//  ・読んだときの版（rev）が変わっていなければ書く。他のサーバーが先に書いていたら、読み直してやり直す。
//  ・1つのサーバーの中では、同じ文書への変更を順番に処理する（無駄なやり直しを減らす）。
// ローカルのJSONファイル利用時（サーバー1台）は、これまでどおり手元の内容に変更を加えて保存する。
const SHARED_DOC_MAX_ATTEMPTS = 8;
const sharedDocQueues = new Map();
const sharedDocEntry = id => PERSISTED_FILES.find(p => p.mongoId === id);
// DBから読み直して手元の内容を最新にする（読む系のAPIの前にも使う。他のサーバーの保存がすぐ見える）
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
    const data = entry.get(); // 変更した直後に取り出す（この後の await の間に手元の変数が変わっても影響しない）
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
      if (e && e.code === 11000) ok = false; // 同時に別のサーバーが最初の文書を作った
      else {
        console.error(`データの保存に失敗しました（MongoDB: ${id}）:`, e);
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
// id の文書に mutator の変更を加えて保存する。mutator は手元の変数（learningDict など）を直接変える同期関数で、
// やり直しのたびに最新の内容で呼ばれる。保存しないで終えたい場合（見つからない等）は SkipSharedWrite を投げる。
class SkipSharedWrite extends Error {
  constructor(value) { super('skip'); this.value = value; }
}
function updateSharedDoc(id, mutator) {
  const unwrapSkip = e => { if (e instanceof SkipSharedWrite) return e.value; throw e; };
  if (!MONGODB_URI) {
    // 【レビューで発見】以前は保存（ファイルの書き込み）に失敗しても、手元の変数に加えた変更が残っていた
    // （500・「保存できませんでした」と返したのに、直後の一覧取得には出てきて、次の保存でファイルにも入る。
    // 利用者が送り直すと同じ基準が2件になる）。変更の前に控えを取り、失敗したら元に戻す。
    // 同じ文書への変更は1つずつ順番に行う（先の保存の失敗で元に戻したときに、後から加えた別の変更まで
    // 一緒に消し、その消えた内容を「保存できた」と返してしまわないように）。
    const entry = sharedDocEntry(id);
    const prevFile = sharedDocQueues.get(id) || Promise.resolve();
    const runFile = prevFile.then(async () => {
      const backup = cloneJson(entry.get());
      let result;
      try {
        result = mutator();
      } catch (e) {
        if (!(e instanceof SkipSharedWrite)) entry.set(backup); // 途中まで変えてから失敗した場合も元に戻す
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
// 読む系のAPI用：MongoDB利用時は、返す前にDBから読み直す
function sendSharedDoc(ids, pick) {
  return async (req, res) => {
    await refreshSharedDocs(ids);
    res.json(pick());
  };
}

// ---- 患者カルテの保存先（患者1人ずつ・更新の競合を見つける）----
// 【複数サーバーからの保存でデータが消える不具合の修正】以前は MongoDB を起動時に1回だけ読み、その後は各サーバーが
// 手元の全患者を1つの文書にまるごと上書き保存していた。ローカル版と公開版が同じDBを使うと、一方が登録した患者を
// もう一方の古い手元の内容が消していた。MongoDB利用時は：
//  ・患者1人＝1文書（patients コレクション）にし、読むときは毎回DBから読む（他のサーバーの保存もすぐ見える）。
//  ・保存は「DBから今の内容を読む → カード単位でマージ（mergePatientRecord）→ 読んだときの版（rev）が
//    変わっていなければ書く」。他のサーバーが先に書いて版が変わっていたら、読み直してもう一度マージする。
//  ・完全削除は、文書に「削除済み」の印を残す（削除の後に古い同期が来ても復活させない）。
// JSONファイル保存（1つのサーバーだけで使う）では、これまで通り手元のデータを使い、削除の記録を別ファイルに残す。
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
// 【レビューで発見】JSONファイル保存では、患者の保存・削除を1つずつ順番に行う。以前は同じ患者への保存Aと保存Bが
// 重なると、Aの書き込みの失敗で「Aの前の内容」へ戻したときにBのマージ結果まで消え、その消えた内容のままBの
// 書き込みが成功して、Bには 200（保存済み）を返していた（Bの端末は保存済みと思い、変更が失われる）。
// patients.json は全患者で1つのファイルなので、患者が違っても順番に行う。
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
async function patientStoreSave(id, incoming) {
  assertSafePatientId(id);
  const col = await getPatientsCollection();
  if (!col) {
    return runPatientFileOp(async () => {
      if (hasOwn(patientDeletions, id) && patientDeletions[id]) return { deleted: true };
      const hadPrev = hasOwn(patientsDict, id);
      const prev = hadPrev ? patientsDict[id] : undefined;
      const merged = mergePatientRecord(incoming, prev);
      patientsDict[id] = merged;
      try {
        await persist(['patients']);
      } catch (e) {
        if (!hadPrev) delete patientsDict[id]; else patientsDict[id] = prev; // 保存できなかった変更は取り消す
        throw e;
      }
      return { patient: merged };
    });
  }
  for (let attempt = 0; attempt < PATIENT_SAVE_MAX_ATTEMPTS; attempt++) {
    const doc = await col.findOne({ _id: id });
    if (doc && doc.deleted) return { deleted: true };
    const merged = mergePatientRecord(incoming, doc ? doc.data : undefined);
    const savedAt = new Date().toISOString();
    if (doc) {
      const r = await col.updateOne({ _id: id, rev: doc.rev }, { $set: { data: merged, rev: (doc.rev || 0) + 1, savedAt } });
      if (r && r.matchedCount === 1) return { patient: merged, rev: (doc.rev || 0) + 1 };
    } else {
      try {
        await col.insertOne({ _id: id, rev: 1, data: merged, savedAt });
        return { patient: merged, rev: 1 };
      } catch (e) {
        if (!(e && e.code === 11000)) throw e; // 11000＝同時に他のサーバーが同じ患者を作った → 読み直す
      }
    }
    // 読んだ後に他のサーバーが書き換えていた（更新の競合）→ 読み直してもう一度マージする
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

// 【レビューで発見】以前は learningDict[text] をそのまま見ていたため、'__proto__'・'toString' のような
// 文章では Object.prototype などの「親から受け継いだ値」を学習の記録として扱い、書き換えていた。
// また、一括同期などで学習の記録が文字列・数値などに壊れていると、以後その文章の学習イベントが
// 毎回 500 になっていた。自分自身のキーだけを見て、形が壊れている記録は作り直す。
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

// 【レビューで発見】学習辞書（learning-dict）には件数・大きさの上限が無く、MongoDB利用時に1文書の上限（16MB）を
// 超えると、以後すべての学習イベントの保存が失敗し続けてしまう（事例ログ等には capArrayByByteSize があるが、
// 学習辞書には無かった）。文章（キー）の長さに上限を設け、件数・合計の大きさが上限を超えたら、最後に
// 更新された日時（updatedAt）が古いものから外す。大きさの計算は重いので、新しい文章が一定数増えたとき・
// 件数が上限を超えたときだけ行う。
const LEARNING_TEXT_MAX_LENGTH = 2000; // 統合したカードなど長めの文章も学習できるよう、少し余裕を持たせる
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
// 【GitHub と Render を1つに統合】GitHub Pages（https://masadamasayoshi.github.io）で開いた画面からも、この
// サーバーの記録（API）を使えるようにする（別のオリジンからの通信を許す）。許すのは下の送り元だけで、
// 環境変数 CORS_ORIGINS（カンマ区切り）で足せる。/api 以外には付けない。
const CORS_ALLOWED_ORIGINS = new Set(['https://masadamasayoshi.github.io', ...String(process.env.CORS_ORIGINS || '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean)]);
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && CORS_ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
    if (req.method === 'OPTIONS') return res.status(204).end();
  }
  next();
});
// 患者カルテ本体（カード多数・長い抽出元テキストを含む）を扱うため、上限を少し広めに取る
// 【レビューで発見】一括同期・スナップショットなど、経路ごとに受け取る大きさの上限（8mb・10kb など）を
// 決めている経路があるが、画面側は Content-Type: application/json で送るため、先にこの共通の読み取り（5mb）が
// 中身を読んでしまい、経路ごとの上限が一度も使われていなかった（5mbを超える一括同期・スナップショットは 413）。
// 経路ごとの読み取りを持つ経路は、ここでは読まずにそちらに任せる。
const ROUTE_BODY_PARSER_PATHS = new Set(['/api/learning-dict/sync', '/api/patients/sync', '/api/patient-snapshot', '/api/presence/leave']);
const defaultJsonParser = express.json({ limit: '5mb' });
app.use((req, res, next) => (ROUTE_BODY_PARSER_PATHS.has(req.path) ? next() : defaultJsonParser(req, res, next)));
// 画面のファイル以外（患者の記録を含むdata/・分類の自動チェック用の事例の文章tests/・サーバーの
// プログラムや設定など）は、URLを知っていても開けないようにする（公開した場合に備える）。
// .envなど「.」で始まるファイルは、express.staticの既定で公開されない。
const PRIVATE_PATH_REGEX = /^\/(?:data|tests|scripts|node_modules|Claude outputs)(?:\/|$)|^\/(?:server\.js|package(?:-lock)?\.json|README\.md|tailwind\.[\w.]+|app-\d+\.js)$/i;
// 【レビューで発見】以前は受け取ったパスをそのまま調べていたため、express.static（send）が後で行う
// パスの整理（「//」を1つにまとめる・「..」をたどる）で同じファイルに行き着く書き方
// （例：//data/patients.json・/%2fdata/patients.json・/js/../data/patients.json）で、
// 全患者のカルテや server.js をそのまま取得できていた。static と同じように整理してから調べる。
function isPrivateStaticPath(rawPath) {
  let p;
  try { p = decodeURIComponent(String(rawPath || '/')); } catch (e) { return null; } // null＝パスとして不正
  if (p.includes('\0')) return null;
  p = path.posix.normalize('/' + p.replace(/\\/g, '/')); // 「//」「/./」「..」を整理する（ルートより上には出ない）
  return PRIVATE_PATH_REGEX.test(p);
}
app.use((req, res, next) => {
  const priv = isPrivateStaticPath(req.path);
  if (priv === null) return res.status(400).end();
  if (priv) return res.status(404).end();
  next();
});
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

// 「積み上げる配列」(caseLog・patientSnapshots等)は件数ではなく古いものから順に、
// 直列化した合計バイト数がmaxBytesを超えないよう先頭（古い方）から間引く。
// MongoDB利用時は1コレクション=1ドキュメントなので、単一ドキュメントの上限（16MB）を
// 超えると以後そのコレクションだけ保存が静かに失敗し続けてしまう（persist()参照）。
// 90日基準のアーカイブ（runArchiving）だけでは「短期間に大量発生」した場合に間に合わないため、
// 保存のたびにこのバイト数ベースの上限でも必ず抑える。
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

// 事例ログ（caseLog／caseLogArchive）と情報カードの報告（cardReports／cardReportsArchive）は、
// カルテスナップショット（patientSnapshots）と同じ「積み上げるだけで削除機能を持たない」配列
// でありながら、これまでバイト数上限（capArrayByByteSize）を適用していなかった（90日基準の
// アーカイブ移動（runArchiving）はするが、移動先のアーカイブ自体も無制限に増え続ける）。
// 利用者からの報告：長期間の運用でMongoDB Atlas無料枠（0.5GB）の容量を使い切ってしまい、
// 本番環境（Render）へのデプロイ・書き込みができなくなった。事例ログは全利用者・全操作
// （カード作成・編集・タグ変更等）1件ごとに記録され続けるため、実際には運用歴が長くなるほど
// 一番増えやすいデータである。patientSnapshotsと同じ安全策をこの2種類にも適用し、今後の
// 肥大化を防ぐ（既に肥大化した分は、Atlas側で古いアーカイブを手動で削除するなどの対応も別途必要）。
const CASE_LOG_MAX_BYTES = 6 * 1024 * 1024;
const CASE_LOG_ARCHIVE_MAX_BYTES = 12 * 1024 * 1024;
const CARD_REPORTS_MAX_BYTES = 6 * 1024 * 1024;
const CARD_REPORTS_ARCHIVE_MAX_BYTES = 12 * 1024 * 1024;

// ---- API ----

// 共有学習辞書をまるごと返す（起動時にフロントエンドがローカル学習とマージする）
app.get('/api/learning-dict', sendSharedDoc(['learning-dict'], () => learningDict));

// 事例ログの取得（研究用のダウンロード・分析向け）
app.get('/api/case-log', sendSharedDoc(['case-log'], () => caseLog));

// 分類ボード側での変更を、共有学習辞書＋事例ログの両方に反映する
// action: 'create' | 'type' | 'tagAdd' | 'tagRemove' | 'col' | 'edit' | 'delete' | 'merge'
app.post('/api/learning-event', rateLimit('learning-event', { windowMs: 60000, max: 300 }), async (req, res) => {
  const { text, action, payload, at } = req.body || {};
  const eventAt = (typeof at === 'string' && at) ? at.slice(0, 40) : new Date().toISOString(); // このリクエスト内で使う日時は1回だけ計算し使い回す

  if (typeof text !== 'string' || !text) {
    return res.status(400).json({ error: 'text is required' });
  }
  // 【レビューで発見】'__proto__' などは学習辞書のキーにできない（Object.prototype を書き換えてしまうため。isSafeKey参照）。
  // また、極端に長い文章は学習辞書を肥大化させるため受け付けない（LEARNING_TEXT_MAX_LENGTH参照）。
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
  // 【レビューで発見】以前は学習イベント1件ごとに学習辞書「全体」を返していた（件数が増えるほど毎回数MBの応答になる）。
  // 画面側（reportLearningEvent）は応答の dict を起動後に使っていないため、今回変わった文章の分だけを返す。
  const touchedDict = () => {
    const out = {};
    [text, action === 'edit' ? newText : null].forEach(k => { if (isSafeKey(k) && hasOwn(learningDict, k)) out[k] = learningDict[k]; });
    return out;
  };

  // 削除は「学習データ管理」画面からの個別削除用。既存エントリーを新規作成せずそのまま消す。
  // 学習データ（票）と事例ログは別々の文書なので、それぞれ「最新を読み直して変更を加える」形で保存する
  // （MongoDB利用時、ほかのサーバーが同時に加えた票やログを消さない。updateSharedDoc参照）。
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

// 学習の1件の変更（票の加算など）を learningDict に加える（やり直しのたびに最新の内容へ加え直せるよう関数にしてある）
function applyLearningEvent(text, action, payload, eventAt) {
  const entry = getEntry(text);
  // 票のキー（分類名）に '__proto__' などが来た場合は、票として数えない（isSafeKey参照）
  if (payload && typeof payload === 'object' && payload.type != null && !isSafeKey(String(payload.type))) payload = { ...payload, type: null };

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
      // 【レビューで発見】以前は Object.assign(newEntry, entry) で、票の入れ物（typeVotes 等）を編集前と
      // 編集後の文章で「共有」してしまい、以後どちらかに票を入れると両方の票が変わっていた。さらに編集後の文章に
      // 既にあった学習（票）を、編集前の文章の内容でまるごと上書きして消していた。
      // 複製して引き継ぎ、編集後の文章に既に票があれば、票ごとに多い方を残す（同じ編集が2回届いても票が倍にならない）。
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
          const src = hasOwn(learningDict, t) ? learningDict[t] : null; // 【レビューで発見】親から受け継いだ値を統合元として扱わない
          if (!isPlainObject(src)) return;
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
        // 【レビューで発見】統合元の一覧は記録用なので、件数・長さに上限を設ける（学習辞書の肥大化を防ぐ）
        entry.lastMergedFrom = payload.sourceTexts.filter(t => typeof t === 'string').slice(0, 50).map(t => t.slice(0, LEARNING_TEXT_MAX_LENGTH));
      }
      break;
  }
  entry.updatedAt = eventAt;
}

// 票（{ キー: 回数 }）を、キーごとに多い方を残してまとめる（同じ内容が何度届いても票が増えない）
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
// 一括同期で届いた1件の学習の記録を、決まった形に整える（形が違うものは null＝受け付けない）
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

// ページを閉じる際などにブラウザ側の学習内容をまとめて反映するための一括同期。
// 個別イベントの送信が何らかの理由で届いていなかった場合の保険（フォールバック）で、
// ここに含まれないキーを消したりはしない（学習専用ファイルへの「追加」であり、他利用者分を巻き込んで消さないため）。
// 【レビューで発見】以前はキーごとに「まるごと上書き」していたため、タブを開いた時点（や数日前の
// このブラウザの控え）の古い学習を持ったタブが閉じられるたびに、その後にほかの利用者が加えた票が
// 巻き戻って消えていた。また中身を確かめていなかったため、壊れた値（文字列など）が届くと、以後その文章の
// 学習イベントが毎回 500 になっていた。今は：
//  ・中身を決まった形に整え、形の違うもの・'__proto__' などのキーは受け付けない
//  ・サーバー側の記録の方が新しい（updatedAt）場合は、古い同期として何もしない（管理画面で減らした票も戻さない）
//  ・そうでなければ、票はキーごとに多い方を残してまとめる（画面側の mergeLearningDicts と同じ考え方）
//  ・送信の回数にもレート制限をかける
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
      if (learningTime(cur) > learningTime(inc)) return; // サーバー側の方が新しい＝古い同期
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

// 自分のアセスメント（myAssessments：欲求ごと）・不足情報の確認（missingChecks）・看護計画（carePlans）のように、
// 1つの項目の中に「キー → { …, updatedAt }」の形で記録を持つものは、キーごとに updatedAt が新しい方を使う
// （別の端末で別の欲求のアセスメントを書いても、片方が消えないように）。
const PATIENT_KEYED_RECORD_FIELDS = ['myAssessments', 'missingChecks', 'carePlans', 'checkpoints'];
function recordTime(r) {
  const t = r && typeof r.updatedAt === 'string' ? new Date(r.updatedAt).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
}
function fillMissingFields(primary, secondary) {
  // 新しい方(primary)を土台にし、そこに無い・空の部分だけ、もう一方(secondary)から取り込む（新しい方が丸ごと勝って他端末の追記が消えるのを防ぐ）
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

const CASE_DERIVED_FIELDS = ['myAssessments', 'missingChecks', 'carePlans', 'checkpoints', 'relationMap'];
// 「置き換えて分類」で別の事例に替えたとき（caseResetAt）、替える前の事例から作られた記録（関連図・看護計画・自分のアセスメント等）が
// 他端末・共有先に残っていて戻ってこないよう、リセットを知らない側の派生データは捨てる
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
  if (!existing) return incoming; // 新規患者、またはサーバー側にまだ保存が無い場合はそのまま採用
  if (!incoming) return existing;
  const __cr = applyCaseReset(incoming, existing);
  incoming = __cr[0]; existing = __cr[1];

  // items・deletedItemIds以外の項目は、従来通りupdatedAtが新しい方をまるごと採用する
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

// 共有されている患者カルテを全件返す（起動時にフロントエンドがこのブラウザ内のカルテとマージする）。
// MongoDB利用時は毎回DBから読む（他のサーバーが保存した患者もすぐ見える）。完全に削除した患者は含めない。
app.get('/api/patients', async (req, res) => {
  const { patients } = await patientStoreGetAll();
  res.json(patients);
});
// 完全に削除した患者の一覧（{ [患者ID]: 削除した日時 }）。画面側は起動時に読み、手元に残っている患者を外す。
app.get('/api/patient-deletions', async (req, res) => {
  const { deletions } = await patientStoreGetAll();
  res.json(deletions);
});

// 1人分の患者カルテを保存（作成・更新の両方を兼ねる）。
// 既に他端末・他サーバーの保存内容がある場合は、まるごと置き換えるのではなくカード単位でマージする
// （mergePatientRecord参照）。マージ後の内容をレスポンスで返し、フロント側もそれを取り込む。
// 完全に削除した患者への保存は 410 で断る（削除の後の古い同期で復活させない）。保存に失敗したら 500。
app.put('/api/patients/:id', rateLimit('patients-put', { windowMs: 60000, max: 200 }), async (req, res) => {
  const { id } = req.params;
  const patient = req.body;
  if (!id) return res.status(400).json({ error: 'id is required' });
  if (!patient || typeof patient !== 'object' || Array.isArray(patient)) {
    return res.status(400).json({ error: 'body must be a patient object' });
  }
  const result = await patientStoreSave(id, patient);
  if (result.deleted) return res.status(410).json({ ok: false, deleted: true, error: 'この患者は完全に削除されています' });
  res.json({ ok: true, patient: result.patient });
});

// 患者ページの完全削除（アーカイブはpatientオブジェクト内のarchivedフラグの更新＝PUTで済ませる）。
// 削除した記録を残し、以後この患者への保存・一括同期は受け付けない。
app.delete('/api/patients/:id', async (req, res) => {
  const { id } = req.params;
  await patientStoreDelete(id);
  res.json({ ok: true });
});

// ページを閉じる際などに、このブラウザが知っている全患者カルテをまとめて反映するための一括同期
// （保険用のフォールバック）。患者IDごとにPUTと同じ保存をするだけで、ここに含まれない他の患者を消したりはしない。
// 完全に削除した患者は受け付けず（deleted に入れて返す）、保存に失敗した患者があれば 500 を返す。
app.post('/api/patients/sync', express.json({ limit: '8mb', type: () => true }), rateLimit('patients-sync', { windowMs: 60000, max: 60 }), async (req, res) => {
  const incoming = req.body;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return res.status(400).json({ error: 'body must be an object' });
  }
  const deleted = [];
  const failed = [];
  for (const [id, patient] of Object.entries(incoming)) {
    if (isSafeKey(id) && patient && typeof patient === 'object') { // 【レビューで発見】'__proto__' などの患者IDは受け付けない
      try {
        const r = await patientStoreSave(id, patient);
        if (r.deleted) deleted.push(id);
      } catch (e) {
        console.error(`患者カルテの一括同期に失敗しました（${id}）:`, e);
        failed.push(id);
      }
    }
  }
  res.status(failed.length ? 500 : 200).json({ ok: failed.length === 0, deleted, failed });
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

// NotebookLM基準ノート本体（notebookContent）。textがnullの場合はまだ誰も保存しておらず、
// クライアント側の初期値（DEFAULT_NOTEBOOK_CONTENT）を使うべきことを示す。
app.get('/api/notebook-content', sendSharedDoc(['notebook-content'], () => notebookContentData));

app.put('/api/notebook-content', rateLimit('notebook-content', { windowMs: 60000, max: 20 }), async (req, res) => {
  const { text } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  await updateSharedDoc('notebook-content', () => { notebookContentData = { text: capString(text.trim(), 50000), updatedAt: new Date().toISOString() }; });
  res.json(notebookContentData);
});

// 追加キーワード（タグ付けのルール）。一覧をまるごと置き換える方式（件数が少なく、画面側で
// 追加・削除した後の一覧を送る）。中身は画面側と同じ基準で検査し、おかしな値は捨てる。
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

// 参照元リンク（NotebookLM等）。NotebookLMには個人利用者が取得できる公開APIが無いため、
// ここではリンクの自動取得は行わず、利用者が貼り付けたtitle/url/contentをそのまま保存する。
// title・urlは必須（一覧表示の見出し・リンク先として必要）、contentは任意
// （貼り付けがあればAIへの指示文に統合され、無ければリンクのみの一覧として残る）。
app.get('/api/reference-sources', sendSharedDoc(['reference-sources'], () => referenceSources));

app.post('/api/reference-sources', rateLimit('reference-sources', { windowMs: 60000, max: 30 }), async (req, res) => {
  const { title, url, content } = req.body || {};
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'url is required' });
  }
  // 【レビューで発見】リンクの形を確かめていなかったため、javascript: などのリンクを登録でき、押した人の画面で
  // スクリプトが動くおそれがあった。http(s) のリンクだけを受け付ける。
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
  // 【レビューで発見】リンクの形を確かめていなかったため、javascript: などのリンクを登録でき、押した人の画面で
  // スクリプトが動くおそれがあった。http(s) のリンクだけを受け付ける。
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

// ---- タブを閉じた時点の患者カルテのスナップショット（全利用者共有・学習データ管理画面から閲覧） ----
// beforeunloadのsendBeaconから送られてくる想定（Content-Typeがtext/plainになるため type: () => true で
// 強制的にJSONとして解釈する。他のbeforeunload系エンドポイントと同じ扱い）。
// patients.json（PUT /api/patients/:id）は他端末のカードとマージされ続ける「最新の共有カルテ」だが、
// ここは「その端末がタブを閉じた瞬間、何をどう分類していたか」をマージせずそのまま記録として積み重ねる。
const PATIENT_SNAPSHOT_MAX_PATIENTS_PER_REQUEST = 50; // 1回の送信で記録する患者数の上限（暴走防止）
const PATIENT_SNAPSHOT_MAX_ITEMS_PER_PATIENT = 500; // 1患者あたりのカード数の上限（暴走防止）
// タブを開いている間5分おき＋閉じるたびに全患者分（カード本文・カルテ本文含む）を積み上げるため、
// 90日基準のアーカイブ（runArchiving）を待つ前に、MongoDBの1ドキュメント上限（16MB）へ
// 短期間で達してしまうことがある（達した瞬間から以後の保存が全て静かに失敗し続ける＝
// 「カルテスナップショットが全然保存されていない」という report の実体）。保存の都度、
// 古いものから間引いて安全な範囲（余裕を持って6MB）に収める。
const PATIENT_SNAPSHOT_MAX_BYTES = 6 * 1024 * 1024;
const PATIENT_SNAPSHOT_ARCHIVE_MAX_BYTES = 12 * 1024 * 1024; // アーカイブ側も同じ理由で無制限に増やさない

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

// ---- 情報カードの不具合報告（カード右上の「報告」ボタンから送られる。全利用者共有） ----
// 同じブラウザタブ（sessionIdが同じ＝ページを閉じるまでの間）から2件目・3件目の報告が
// 来た場合は新しいレコードを作らず、既存レコードのitemsに追記して1人分の投稿としてまとめる。
// sessionIdが無い（あるいは一致するレコードが見つからない）場合は新規レコードを作る。
app.get('/api/card-reports', sendSharedDoc(['card-reports'], () => cardReports));

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

// ---- 自動整理（アーカイブ） ----
// case-log.json・card-reports.json・patient-snapshots.jsonは追記のみで削除機能を持たないため、
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

// 起動時・定期実行の両方から呼ばれる。実際に何か移した・間引いた場合だけ保存する。
// 【複数サーバー対応】種類ごとに「①古い記録をアーカイブへ足す（同じ記録は二重に足さない）→ ②元の一覧から除く」
// の順に、それぞれ最新の内容を読み直してから変更する（updateSharedDoc）。2台のサーバーが同時に整理しても、
// その間に追加された新しい記録を消したり、アーカイブへ二重に入れたりしない。
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
  // ① アーカイブへ足す（まだ入っていないものだけ）＋サイズ上限で間引く
  await updateSharedDoc(kind.archiveId, () => {
    const current = Array.isArray(arc.get()) ? arc.get() : [];
    const have = new Set(current.map(archiveRecordKey));
    const add = oldEntries.filter(e => !have.has(archiveRecordKey(e)));
    const next = capArrayByByteSize(current.concat(add), kind.archiveMax);
    archiveTrimmed = next.length !== current.length + add.length;
    if (add.length === 0 && !archiveTrimmed) throw new SkipSharedWrite();
    arc.set(next);
  });
  // ② 元の一覧から古い記録を除く＋サイズ上限で間引く
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
      console.error(`自動整理の保存に失敗しました（${kind.label}。次回の自動整理でもう一度行います）:`, e);
      results.push({ kind, moved: 0, trimmed: false });
    }
  }
  const trimmedAnything = results.some(r => r.trimmed);
  if (results.some(r => r.moved > 0) || trimmedAnything) {
    console.log(`自動整理: ${results.map(r => `${r.kind.label}${r.moved}件`).join('・')}をアーカイブへ退避しました${trimmedAnything ? '（サイズ上限により一部の古い記録を間引きました）' : ''}`);
  }
}

// 研究用にアーカイブ済みの記録もそのまま取得できるようにする（現役データと同じ形のまま）
app.get('/api/case-log/archive', sendSharedDoc(['case-log-archive'], () => caseLogArchive));
app.get('/api/card-reports/archive', sendSharedDoc(['card-reports-archive'], () => cardReportsArchive));
app.get('/api/patient-snapshots/archive', sendSharedDoc(['patient-snapshots-archive'], () => patientSnapshotsArchive));

// このファイルを直接実行した時（`node server.js` / `npm start`）だけサーバーを起動する。
// tests/ から require('../server.js') して app やロジック関数だけをテストする場合は、
// 実際にポートを待ち受けたり定期処理(setInterval)を開始したりしない（テストがすぐ終了できるように）。
// MongoDB利用時（MONGODB_URI設定時）は、前回までの保存内容の読み込み（loadFromMongo）が
// 完了してからでないとapp.listen()しない（読み込み中に古い/空のデータへリクエストが
// 来てしまわないようにするため）。
async function startServer() {
  if (MONGODB_URI) {
    await loadFromMongo();
  }
  runArchiving(); // 起動のたびに一度実行し、長期間再起動していなかった場合でもすぐ整理する
  setInterval(runArchiving, ARCHIVE_INTERVAL_MS);

  app.listen(PORT, () => {
    console.log(`看護アセスメント支援システム サーバー起動: http://localhost:${PORT}（保存先: ${MONGODB_URI ? 'MongoDB Atlas' : 'ローカルのJSONファイル'}）`);
  });
}
if (require.main === module) {
  startServer().catch(err => {
    console.error('サーバーの起動に失敗しました:', err);
    process.exit(1);
  });
}

// テスト（tests/）から個別の関数を直接検証できるようにする。
// appそのものをエクスポートすることで、実際にポートを開かずに（http.createServerで一時的な
// ポートに載せて）本物のExpressアプリへHTTPリクエストを送るテストも書ける。
module.exports = {
  app,
  loadFromMongo,
  persist,
  patientStoreSave,
  // 自動テスト用：ファイルの書き込みを失敗させる（保存の失敗を正しく伝えるかの確認）
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
