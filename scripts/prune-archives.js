'use strict';
// ============================================================================
// MongoDB Atlas（無料枠 0.5GB）の容量を圧迫している「研究用の積み上げログ」を
// 確認・削除するための、その場限りのメンテナンススクリプト。
// ----------------------------------------------------------------------------
// 【背景】server.jsは、患者カルテ本体（patients）以外にも、
//   ・case-log / case-log-archive        … カード作成・編集・タグ変更等、全操作の記録
//   ・card-reports / card-reports-archive … カードの不具合報告
//   ・patient-snapshots / patient-snapshots-archive … タブを開いている間5分おき＋
//     閉じるたびに全患者のカード内容を丸ごと記録したもの
// を「積み上げるだけで自動では消えない」形でMongoDBに保存している（90日を過ぎると
// live→archiveへ移すだけで、archive自体は無制限に増え続けていた）。今回、
// バイト数上限（capArrayByByteSize）をこの3種類のarchiveにも追加したので今後は
// 増え続けなくなるが、すでに書き込まれた分はこのスクリプトを実行しないと減らない。
//
// このスクリプトが削除するのは、以下の3つの「archive」コレクションだけ：
//   case-log-archive / card-reports-archive / patient-snapshots-archive
// これらは90日より古い記録の「研究用の控え」であり、GET /api/*/archive でしか
// 参照されない（分類ロジック・タグ付け・総合アセスメント表など、アプリの動作には
// 一切使われていない）。そのため削除してもアプリの見た目・動作・患者カルテ本体
// （patients）・共有学習結果（learning-dict）には何の影響も無い。
//
// 【削除しないもの（絶対に対象に含めない）】
//   patients（患者カルテ本体）・learning-dict（共有学習結果）・
//   extraction-criteria / notebook-content / reference-sources（設定・分類基準）・
//   case-log / card-reports / patient-snapshots（archiveへ移す前の、直近90日分の現役データ）
//
// 【使い方】
//   1. まず現状確認だけ（何も削除しない）：
//        MONGODB_URI="（Renderの環境変数と同じ接続文字列）" node scripts/prune-archives.js
//      → 11個の保存データそれぞれの件数・サイズが表示され、archiveの3つが
//        全体のどれくらいを占めているか一目でわかる。
//   2. 実際に3つのarchiveを空にする：
//        MONGODB_URI="..." node scripts/prune-archives.js --clear-archives
//      → 確認表示の後、対象の3つだけをその場で空配列にして保存し直す。
//   3. 実行環境：このスクリプトはRenderの中では動かせない（無料プランにシェルが無いため）。
//      お使いのPCで、Node.jsとこのリポジトリさえあれば動く（npm install済みであること）。
//      接続文字列はRenderの管理画面（Environment）に設定してあるMONGODB_URIの値と
//      同じものを使う（Atlas側でIPアドレス制限をしている場合は、実行するPCのIPを
//      一時的にAtlas側の許可リストに追加する必要がある）。

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'nursing_assessment';
const CLEAR = process.argv.includes('--clear-archives');

// server.js側のPERSISTED_FILESと同じ11個のmongoId。ARCHIVE_IDSだけが削除対象。
const ALL_IDS = [
  'learning-dict', 'case-log', 'patients', 'extraction-criteria', 'notebook-content',
  'reference-sources', 'patient-snapshots', 'patient-snapshots-archive',
  'card-reports', 'case-log-archive', 'card-reports-archive'
];
const ARCHIVE_IDS = ['case-log-archive', 'card-reports-archive', 'patient-snapshots-archive'];

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  if (!MONGODB_URI) {
    console.error('環境変数 MONGODB_URI が設定されていません（Renderの環境変数と同じ値を指定してください）。');
    process.exit(1);
  }
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const collection = client.db(MONGODB_DB_NAME).collection('app_state');

  const docs = await collection.find({ _id: { $in: ALL_IDS } }).toArray();
  const byId = new Map(docs.map(d => [d._id, d]));

  console.log('現在の保存内容（mongoId・件数・おおよそのサイズ）:');
  let total = 0;
  ALL_IDS.forEach(id => {
    const doc = byId.get(id);
    const data = doc ? doc.data : undefined;
    const count = Array.isArray(data) ? data.length : (data && typeof data === 'object' ? Object.keys(data).length : (data == null ? 0 : 1));
    const bytes = doc ? Buffer.byteLength(JSON.stringify(data), 'utf8') : 0;
    total += bytes;
    const mark = ARCHIVE_IDS.includes(id) ? ' ← 削除対象（研究用の控えのみ。アプリの動作には使われない）' : '';
    console.log(`  ${id.padEnd(28)} 件数:${String(count).padStart(6)}  サイズ:${formatBytes(bytes).padStart(10)}${mark}`);
  });
  console.log(`合計（この11個の文書だけの概算。Atlas上の実際の使用量にはインデックス等も別途含まれます）: ${formatBytes(total)}`);

  if (!CLEAR) {
    console.log('\n何も削除していません（確認のみ）。実際に3つのarchiveを空にする場合は、');
    console.log('  MONGODB_URI="..." node scripts/prune-archives.js --clear-archives');
    console.log('を実行してください。');
    await client.close();
    return;
  }

  console.log('\n--clear-archives が指定されたため、以下の3つを空配列にします:');
  for (const id of ARCHIVE_IDS) {
    const before = byId.get(id);
    const beforeBytes = before ? Buffer.byteLength(JSON.stringify(before.data), 'utf8') : 0;
    await collection.updateOne({ _id: id }, { $set: { data: [] } }, { upsert: true });
    console.log(`  ${id}: ${formatBytes(beforeBytes)} → 0 B`);
  }
  console.log('\n完了しました。Atlasのダッシュボード（Database → Collections）の使用量表示は、');
  console.log('反映まで数分かかることがあります。');
  await client.close();
}

main().catch(err => {
  console.error('エラーが発生しました:', err);
  process.exit(1);
});
