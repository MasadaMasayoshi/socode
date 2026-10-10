'use strict';

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const app=require('../app-helpers').loadApp();
const {groupClinicalPhrasesWithTimestamps,detectMultipleHendersonTags,LAB_ITEM_NAME_REGEX,fieldLabelHintTags,predictLocalItemType,extractAbnormalLabFindings,detectGastricPostopMissingChecks}=app;
const REAL_RECORD_PATH=process.env.NURSING_LEGACY_RECORD_PATH || '/root/.claude/uploads/29ffc676-d59b-5748-a3df-d67a84fd21bb/00bcd98c-_______________3.txt';
function classifyLocally(text) {
  return groupClinicalPhrasesWithTimestamps(text)
    .filter(chunk => !chunk.isUnnecessaryBoilerplate)
    .map(chunk => {
      const cleanedText = chunk.text;
      const tagIds = new Set(detectMultipleHendersonTags(cleanedText));

      if (chunk.isLabOrVital || LAB_ITEM_NAME_REGEX.test(cleanedText)) tagIds.add(2);
      if (chunk.fieldLabel) {
        fieldLabelHintTags(chunk.fieldLabel, cleanedText).forEach(id => tagIds.add(id));
      }
      const type = predictLocalItemType(chunk, cleanedText, null);

      return { text: cleanedText, timestamp: chunk.timestamp, type, hendersonIds: Array.from(tagIds), fieldLabel: chunk.fieldLabel || null, ...(chunk.labRows ? { labRows: chunk.labRows } : {}) };
    });
}

function findByIncludes(items, needle) {
  return items.find(i => i.text.includes(needle));
}

test('実際の記録全文から期待通りの異常値・不足情報が検出される', () => {
  assert.ok(fs.existsSync(REAL_RECORD_PATH), '旧実記録がありません。公開仕様の検証と旧実記録の一致を区別してください。');
  const docText = fs.readFileSync(REAL_RECORD_PATH, 'utf8');
  const items = classifyLocally(docText);
  const oItems = items.filter(i => i.type === 'o');

  const findings = extractAbnormalLabFindings(oItems);
  assert.equal(findings.length, 8, '実際の記録から期待通り8件の異常値が検出される（術前の異常3件＋術後の異常5件）');
  assert.ok(findings.some(f => f.label.includes('ヘモグロビン')));
  const crp = findings.find(f => f.label === 'CRP');
  assert.ok(crp && crp.direction === 'high');

  const missing = detectGastricPostopMissingChecks(items);
  assert.ok(!missing.some(c => c.keywords.includes('弾性ストッキング')), '実際の記録の弾性ストッキング着用の記載により、DVT予防チェックは提案されない');
  assert.ok(!missing.some(c => c.keywords.includes('疼痛')), '実際の記録のNRS(疼痛)記載により、疼痛管理チェックは提案されない');
  assert.ok(missing.some(c => c.keywords.includes('せん妄')), '実際の記録に無い術後せん妄の観察記録は不足情報として検出される');

  const tennis = findByIncludes(items, 'テニス');
  assert.ok(tennis && tennis.hendersonIds.includes(4) && tennis.hendersonIds.includes(13));
});
