// Read-only MongoDB size audit by default. --clear-archives empties ONLY the three archives:
// case-log-archive, card-reports-archive, patient-snapshots-archive.
// Never clear patients, learning-dict, settings or recent live logs; archive deletion is irreversible.
'use strict';
// ============================================================================

// ----------------------------------------------------------------------------

//

//   case-log-archive / card-reports-archive / patient-snapshots-archive

//

//

//        MONGODB_URI="..." node scripts/prune-archives.js --clear-archives

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'nursing_assessment';
const CLEAR = process.argv.includes('--clear-archives');

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
    console.error('MONGODB_URI is required.');
    process.exit(1);
  }
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const collection = client.db(MONGODB_DB_NAME).collection('app_state');

  const docs = await collection.find({ _id: { $in: ALL_IDS } }).toArray();
  const byId = new Map(docs.map(d => [d._id, d]));

  console.log('Stored documents (ID/count/estimated bytes):');
  let total = 0;
  ALL_IDS.forEach(id => {
    const doc = byId.get(id);
    const data = doc ? doc.data : undefined;
    const count = Array.isArray(data) ? data.length : (data && typeof data === 'object' ? Object.keys(data).length : (data == null ? 0 : 1));
    const bytes = doc ? Buffer.byteLength(JSON.stringify(data), 'utf8') : 0;
    total += bytes;
    const mark = ARCHIVE_IDS.includes(id) ? ' [archive; eligible for explicit deletion]' : '';
    console.log(`  ${id.padEnd(28)} count:${String(count).padStart(6)}  size:${formatBytes(bytes).padStart(10)}${mark}`);
  });
  console.log(`Estimated document total (excludes indexes): ${formatBytes(total)}`);

  if (!CLEAR) {
    console.log('\nRead-only audit; nothing deleted. Explicit archive deletion:');
    console.log('  MONGODB_URI="..." node scripts/prune-archives.js --clear-archives');
    console.log('Only the three archive collections are eligible.');
    await client.close();
    return;
  }

  console.log('\n--clear-archives: clearing only the three archives:');
  for (const id of ARCHIVE_IDS) {
    const before = byId.get(id);
    const beforeBytes = before ? Buffer.byteLength(JSON.stringify(before.data), 'utf8') : 0;
    await collection.updateOne({ _id: id }, { $set: { data: [] } }, { upsert: true });
    console.log(`  ${id}: ${formatBytes(beforeBytes)} → 0 B`);
  }
  console.log('\nArchive cleanup complete.');
  console.log('Dashboard usage may take a few minutes to update.');
  await client.close();
}

main().catch(err => {
  console.error('Maintenance failed:', err);
  process.exit(1);
});
