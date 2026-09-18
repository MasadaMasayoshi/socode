'use strict';
// app.js の分類ロジック（記録テキストからのカード抽出・S/O判定・ヘンダーソンタグ付与）の
// 自動テスト。
//
// app.js は module.exports で実際の分類関数をそのまま公開しているため
// (tests/app-helpers.js 参照)、ここではロジックを手作業で複製せず、実際にブラウザで
// 動くのと同一の関数を直接呼び出して検証する。これにより「テスト専用コードが本体の
// 修正から取り残されて意味の無いテストになる」という重複・乖離リスクを避けている。
//
// このセッションで実際にユーザーから報告・指摘された不具合（診断名の卵巣嚢腫タグ抜け、
// テニス等スポーツ記載のタグ付け漏れ、キーパーソン・年齢カードの二重ラベル表示、
// 検査値AI評価が英語表記の項目名にしか反応しない問題、胃がん術後の不足情報推定 等）を
// 回帰テストとして固定化する。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./app-helpers');

const app = loadApp();
const {
  HENDERSON_NEEDS,
  FIELD_LABELS,
  FIELD_LABEL_DEFAULT_TAGS,
  GASTRIC_POSTOP_EXPECTED_CHECKS,
  groupClinicalPhrasesWithTimestamps,
  detectMultipleHendersonTags,
  detectDiagnosisTagHints,
  fieldLabelHintTags,
  cleanExtractedPhrase,
  hasOwnFieldLabelPrefix,
  isBareStatusWord,
  isBareFieldHeaderOnly,
  splitIndependentActionPhrases,
  splitEnumeratedPhrases,
  predictLocalItemType,
  extractAbnormalLabFindings,
  detectGastricPostopMissingChecks,
  LAB_ITEM_NAME_REGEX
} = app;

const REAL_RECORD_PATH = '/root/.claude/uploads/29ffc676-d59b-5748-a3df-d67a84fd21bb/00bcd98c-_______________3.txt';
const hasRealRecord = fs.existsSync(REAL_RECORD_PATH);

/**
 * 「検査値APIキー未設定時のローカル簡易分類」を、実際にapp.jsが公開している関数だけを
 * 組み合わせて再現する薄いテスト用ヘルパー。btn-start-classifyのクリックハンドラ内で
 * 行われているのと同じ呼び出し順序（groupClinicalPhrasesWithTimestamps → タグ検出 →
 * predictLocalItemType）をなぞっているだけで、各関数自体の判定ロジックには一切手を
 * 加えていない。
 */
function classifyLocally(text) {
  return groupClinicalPhrasesWithTimestamps(text)
    .filter(chunk => !chunk.isUnnecessaryBoilerplate)
    .map(chunk => {
      const cleanedText = chunk.text;
      const tagIds = new Set(detectMultipleHendersonTags(cleanedText));
      // 本体（btn-start-classifyのローカル分類経路）と同様に、検査値・バイタルサインには
      // 原則2(食事：栄養・代謝状態)タグも補う（このヘルパーが本体の挙動を省略していると
      // classifyLocallyでの検証結果が実際の画面表示と食い違ってしまうため、本体の判定条件
      // <chunk.isLabOrVital || LAB_ITEM_NAME_REGEX.test(...)>をそのまま揃える）。
      if (chunk.isLabOrVital || LAB_ITEM_NAME_REGEX.test(cleanedText)) tagIds.add(2);
      if (chunk.fieldLabel) {
        fieldLabelHintTags(chunk.fieldLabel, cleanedText).forEach(id => tagIds.add(id));
      }
      const type = predictLocalItemType(chunk, cleanedText, null);
      return { text: cleanedText, timestamp: chunk.timestamp, type, hendersonIds: Array.from(tagIds), fieldLabel: chunk.fieldLabel || null };
    });
}

function findByIncludes(items, needle) {
  return items.find(i => i.text.includes(needle));
}

// ==========================================================================
// Request L: 診断・検査結果・指示・処置内容はOデータとして分類され、
// スポーツ等の客観的な記載には姿勢(4)・余暇(13)タグが付与される
// ==========================================================================
test('診断・検査結果、スポーツの記載、医療従事者の指示・処置内容がOデータとして分類される', () => {
  const sampleText = `知的能力・身体的ならびに身体的能力
知的能力: 理解良好。コミュニケーションも取れる。
運動能力の低下・喪失: 障害なし (週末テニスをしている)

画像検査等
【術前】
胃カメラ：胃前庭部に25mm大の腫瘍。病期: Stage IB
【術中・術後】
治療方針・治療内容等
【術中】
点滴：ヴィーンF 500ml 2本、生食50ml＋セフメタゾール1g
胃管(サンプチューブ)留置
【術後】
硬膜外PCA (0.25% ポプスカイン 200ml ＋ フェンタニル 10ml を 2ml/hで持続注入)
【術中・術後詳細および指示】
＜指示＞ Aライン、Vライン、胃管留置時は抜去しない。`;

  const items = classifyLocally(sampleText);

  const gastroscopy = findByIncludes(items, '胃前庭部に25mm大の腫瘍');
  assert.ok(gastroscopy, '「胃カメラ」の検査結果カードが抽出される');
  assert.equal(gastroscopy.type, 'o', '検査結果（病期・Stage含む）はOデータに分類される');

  const tennis = findByIncludes(items, 'テニス');
  assert.ok(tennis, '「週末テニスをしている」カードが抽出される');
  assert.equal(tennis.type, 'o', '運動能力に関する客観的記載はOデータに分類される');
  assert.ok(tennis.hendersonIds.includes(4), 'スポーツの記載から4(姿勢)タグが付与される');
  assert.ok(tennis.hendersonIds.includes(13), 'スポーツの記載から13(余暇)タグが付与される');

  const instruction = findByIncludes(items, '胃管留置時は抜去しない');
  assert.ok(instruction, '「＜指示＞」カードが抽出される');
  assert.equal(instruction.type, 'o', '医療従事者の指示はOデータに分類される');

  const drip = findByIncludes(items, 'ヴィーンF');
  assert.ok(drip, '「点滴」カードが抽出される');
  assert.equal(drip.type, 'o', '点滴の処置内容はOデータに分類される');

  const tube = findByIncludes(items, 'サンプチューブ');
  assert.ok(tube, '「胃管留置」カードが抽出される');
  assert.equal(tube.type, 'o', 'ドレーン・チューブ類の留置はOデータに分類される');

  const pca = findByIncludes(items, '硬膜外PCA');
  assert.ok(pca, '「硬膜外PCA」カードが抽出される');
  assert.equal(pca.type, 'o', '持続注入等の処置内容もOデータに分類される');
});

test('患者本人の発言（カギ括弧）は引き続きSデータのまま（回帰確認）', () => {
  const items = classifyLocally('「あ、あ」と短く返事するのみ。のどの痛みあり。');
  assert.equal(items[0].type, 's');
});

test('HENDERSON_NEEDS の姿勢(4)・余暇(13)キーワードにスポーツ関連語が含まれる', () => {
  assert.ok(HENDERSON_NEEDS.find(n => n.id === 4).keywords.includes('テニス'));
  assert.ok(HENDERSON_NEEDS.find(n => n.id === 13).keywords.includes('テニス'));
});

// ==========================================================================
// Request O: 診断名「卵巣嚢腫」の誤字修正、キーパーソン・受け持つまでの経過は環境(9)
// ==========================================================================
test('診断名「卵巣嚢腫」に4(姿勢)タグが付与される（誤字「卵巣嚴腫」修正の回帰確認）', () => {
  const tagIds = detectDiagnosisTagHints('53歳 卵巣嚢腫');
  assert.ok(tagIds.includes(4), '「卵巣嚢腫」の表記で正しくタグ4が検出される');
});

test('キーパーソン・受け持つまでの経過のキーワードが9(環境)に登録されている', () => {
  const env = HENDERSON_NEEDS.find(n => n.id === 9);
  assert.ok(env.keywords.includes('キーパーソン'));
  assert.ok(env.keywords.includes('受け持つまでの経過'));
});

// ==========================================================================
// Request N, P: 年齢は環境・姿勢タグ、二重ラベル（章タイトルの重複付与）の防止
// ==========================================================================
test('「年齢」フィールドラベルの初期提案タグに4(姿勢)・9(環境)が含まれる', () => {
  // FIELD_LABEL_DEFAULT_TAGS は vm サンドボックス内(別レルム)で作られた配列のため、
  // Array.from() でこのテストファイルのレルムの配列に変換してから比較する
  // （そのまま deepEqual すると、値は同じでも realm が異なるため一致しないと判定される）。
  assert.deepEqual(Array.from(FIELD_LABEL_DEFAULT_TAGS['年齢']).sort(), [4, 9]);
});

test('自前のラベル（コロン付き見出し）を持つ行には章タイトルが二重に付与されない', () => {
  assert.equal(hasOwnFieldLabelPrefix('キーパーソン: 夫'), true);
  assert.equal(hasOwnFieldLabelPrefix('50歳代'), false);
});

test('fieldLabelバッジを持つカードには章タイトルの前置きが付かない（職業・保険等の二重表示防止）', () => {
  const text = `年齢・社会的・文化的状況:
職業：会社員
保険：社会保険`;
  const items = classifyLocally(text);
  const job = findByIncludes(items, '会社員');
  assert.ok(job, '「職業」カードが抽出される');
  assert.equal(job.fieldLabel, '職業');
  assert.ok(!job.text.startsWith('年齢・社会的・文化的状況'), 'fieldLabelバッジ付きカードに章タイトルが前置きされない');
});

// ==========================================================================
// Request M: 検査値AI評価 - 日本語名や表形式でも異常値を検出できる（英語表記の決め打ちに限定されない）
// ==========================================================================
test('基準値付きの検査値カードから、日本語名・英語名を問わず異常値が検出される', () => {
  const oItems = [
    { text: '赤血球 350×10^4/μL ↓ (基準値: 380〜500 ×10^4/μL)' },
    { text: 'CRP 3.8 mg/dL ↑ (基準値: 0〜0.3 mg/dL)' },
    { text: '白血球 5.8 ×10^3/μL (基準値: 3.3〜8.6 ×10^3/μL)' }
  ];
  const findings = extractAbnormalLabFindings(oItems);
  assert.ok(findings.some(f => f.label.includes('赤血球')), '日本語名「赤血球」の異常値が検出される');
  assert.equal(findings.find(f => f.label.includes('赤血球')).direction, 'low');
  assert.ok(findings.some(f => f.label === 'CRP'), '英語名「CRP」の異常値が引き続き検出される');
  assert.ok(!findings.some(f => f.label.includes('白血球')), '正常範囲内の項目は誤検出されない');
});

test('基準値の無い一文形式でも英語表記の検査値が検出される（回帰確認）', () => {
  const legacyItems = [{ text: '[検査データ] WBC 11200, CRP 3.8, Hb 10.2', type: 'o', timestamp: '入院時' }];
  const findings = extractAbnormalLabFindings(legacyItems);
  assert.ok(findings.some(f => f.label.includes('WBC')));
  assert.ok(findings.some(f => f.label === 'CRP'));
  assert.ok(findings.some(f => f.label.includes('Hb')));
});

// ==========================================================================
// Request Q: AIの不足情報推定 - 胃がん周術期の判断基準に基づくチェック
// ==========================================================================
test('胃がん以外の患者では術後観察の不足チェックは行われない', () => {
  const items = [{ text: '診断名: 市中肺炎の疑い' }, { text: '既往歴: 高血圧症' }];
  assert.equal(detectGastricPostopMissingChecks(items).length, 0);
});

test('胃がん患者で記録が一切無ければ全項目が不足情報として検出される', () => {
  const items = [{ text: '診断名: 胃がん' }, { text: '手術術式: 腹腔鏡下胃全摘術(R-Y再建)' }];
  const missing = detectGastricPostopMissingChecks(items);
  assert.equal(missing.length, GASTRIC_POSTOP_EXPECTED_CHECKS.length);
});

test('ドレーン管理・弾性ストッキングが記録済みなら、それぞれの不足チェックから除外される', () => {
  const items = [
    { text: '診断名: 胃がん' },
    { text: '吻合部・胃管ドレーン：滲出液 5ml。' },
    { text: '治療方針・治療内容等: シャワー浴、弾性ストッキング着用' }
  ];
  const missing = detectGastricPostopMissingChecks(items);
  assert.ok(!missing.some(c => c.keywords.includes('ドレーン')));
  assert.ok(!missing.some(c => c.keywords.includes('弾性ストッキング')));
  assert.ok(missing.some(c => c.keywords.includes('せん妄')), '記録の無い術後せん妄のチェックは引き続き提案される');
  assert.ok(missing.some(c => c.keywords.includes('疼痛')));
  assert.ok(missing.some(c => c.keywords.includes('尿道カテーテル')));
});

// ==========================================================================
// 実際にアップロードされた記録全文での統合確認（環境にファイルが無い場合はスキップ）
// ==========================================================================
test('実際の記録全文から期待通りの異常値・不足情報が検出される', { skip: !hasRealRecord && '検証用の実記録ファイルがこの環境に無いためスキップ' }, () => {
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

// ==========================================================================
// Request S: 「感染症: 無」のような一語の状態語カードで見出しの文脈が失われる問題、
// 「人間関係は環境」タグの付け先修正、卵巣嚢腫は排泄・姿勢の両方に該当
// ==========================================================================
test('「無」のような一語の状態語だけの本文には見出し語が本文にも残る（バッジだけに頼らない）', () => {
  assert.equal(isBareStatusWord('無'), true);
  assert.equal(isBareStatusWord('無 (MRSA、HIV、HB、HCV、梅毒、その他)'), true);
  assert.equal(isBareStatusWord('高血圧症'), false, '内容のある本文は状態語だけとは判定されない');

  const items = classifyLocally('感染症: 無 (MRSA、HIV、HB、HCV、梅毒、その他)。');
  const infection = items.find(i => i.fieldLabel === '感染症');
  assert.ok(infection, '「感染症」カードが抽出される');
  assert.ok(infection.text.startsWith('感染症: '), '本文に見出し語「感染症」が残り、バッジが無くても内容が分かる');
});

test('見出しの本文に具体的な内容がある場合は、見出し語を重ねて付けない（回帰確認）', () => {
  const items = classifyLocally('診断名: 胃がん');
  const diagnosis = items.find(i => i.fieldLabel === '診断名');
  assert.ok(diagnosis);
  assert.equal(diagnosis.text, '胃がん', '内容のある本文には見出し語を重ねて付けない（バッジのみで十分なため）');
});

test('「人間関係」は10(コミュニケーション)ではなく9(環境)のキーワードとして登録されている', () => {
  assert.ok(HENDERSON_NEEDS.find(n => n.id === 9).keywords.includes('人間関係'), '9(環境)に「人間関係」が含まれる');
  assert.ok(!HENDERSON_NEEDS.find(n => n.id === 10).keywords.includes('人間関係'), '10(コミュニケーション)には「人間関係」を含めない');
});

test('キーパーソンについての記載は9(環境)タグとして分類される', () => {
  const items = classifyLocally('キーパーソン: 妻、50歳代、主婦、同居。パートで働いている。');
  const keyPerson = findByIncludes(items, 'キーパーソン');
  assert.ok(keyPerson, '「キーパーソン」カードが抽出される');
  assert.ok(keyPerson.hendersonIds.includes(9), 'キーパーソンの記載には9(環境)タグが付与される');
});

test('診断名「卵巣嚢腫」に3(排泄)・4(姿勢)の両方のタグが付与される', () => {
  const tagIds = detectDiagnosisTagHints('53歳 卵巣嚢腫');
  assert.ok(tagIds.includes(3), '排泄(3)タグが付与される（腫瘤が膀胱・直腸を圧迫しうるため）');
  assert.ok(tagIds.includes(4), '姿勢(4)タグは引き続き付与される（機能的な病態のため）');
});

test('他の卵巣・子宮系疾患は引き続き4(姿勢)のみが初期提案される（回帰確認）', () => {
  const tagIds = detectDiagnosisTagHints('子宮筋腫');
  assert.ok(tagIds.includes(4));
  assert.ok(!tagIds.includes(3), '卵巣嚢腫以外まで排泄タグを広げすぎない');
});

// ==========================================================================
// Request T: 読点だけでつながれた無関係な看護行為（シャワー浴、弾性ストッキング着用）が
// 1枚のカードにまとめられてしまう問題
// ==========================================================================
test('読点で区切られた、ひらがなを含まない短い行為名の列挙は別々のカードに分割される', () => {
  const parts = splitIndependentActionPhrases('シャワー浴、弾性ストッキング着用');
  assert.deepEqual(Array.from(parts), ['シャワー浴', '弾性ストッキング着用']);
});

test('通常の文章中の読点（ひらがなの助詞・活用語尾を含む）は分割されない（回帰確認）', () => {
  assert.deepEqual(Array.from(splitIndependentActionPhrases('妻は50歳代(主婦)同居、パートで働いている。')), ['妻は50歳代(主婦)同居、パートで働いている。']);
  assert.deepEqual(Array.from(splitIndependentActionPhrases('身長: 165.6 cm、体重: 59.5 kg')), ['身長: 165.6 cm、体重: 59.5 kg']);
});

test('「治療方針・治療内容等」セクション内の「シャワー浴、弾性ストッキング着用」が別々のカードとして抽出され、それぞれ正しくタグ付けされる', () => {
  const text = `治療方針・治療内容等
【術後】
シャワー浴、弾性ストッキング着用`;
  const items = classifyLocally(text);
  const shower = findByIncludes(items, 'シャワー浴');
  const stocking = findByIncludes(items, '弾性ストッキング着用');
  assert.ok(shower, '「シャワー浴」が独立したカードとして抽出される');
  assert.ok(stocking, '「弾性ストッキング着用」が独立したカードとして抽出される');
  assert.notEqual(shower.text, stocking.text, '2つは別々のカードになる（1枚にまとまらない）');
  assert.ok(shower.hendersonIds.includes(8), '「シャワー浴」には8(清潔)タグが付与される');
});

// ==========================================================================
// Request U: 「創部：出血なし。」だけでは、周術期記録に複数存在しうる創（腹部の手術創・
// 吻合部・ドレーン刺入部等）のうちどれを指すか分からなくなる問題（利用者に確認の上、
// 単独の「創部」は腹部の手術創であることを明示する対応で合意）
// ==========================================================================
test('単独の「創部」見出しは、腹部の手術創であることが本文にも明示される', () => {
  assert.equal(cleanExtractedPhrase('創部：出血なし。'), '腹部創部（手術創）：出血なし。');
  assert.equal(cleanExtractedPhrase('創部:発赤なし'), '腹部創部（手術創）：発赤なし');
});

test('他の部位名とセットの「〜ドレーン」等の見出しは変更しない（回帰確認）', () => {
  assert.equal(cleanExtractedPhrase('吻合部・胃管ドレーン：滲出液 5ml。'), '吻合部・胃管ドレーン：滲出液 5ml。');
  assert.equal(cleanExtractedPhrase('左腹腔ドレーン：淡血性 10ml。'), '左腹腔ドレーン：淡血性 10ml。');
  assert.equal(cleanExtractedPhrase('創部感染の徴候なし。'), '創部感染の徴候なし。', '文中の「創部感染」のように単独の見出しでない場合は変更しない');
});

test('実際の記録の「創部：出血なし。」が明確化され、ドレーン関連のカードは変更されない', () => {
  const items = classifyLocally('【術中・術後】\n創部：出血なし。\n吻合部・胃管ドレーン：滲出液 5ml。');
  assert.ok(findByIncludes(items, '腹部創部（手術創）：出血なし'), '「創部」カードが腹部創部（手術創）として明確化される');
  assert.ok(findByIncludes(items, '吻合部・胃管ドレーン'), '「吻合部・胃管ドレーン」カードは変更されずそのまま抽出される');
});

// ==========================================================================
// Request V: 学習データ管理（カルテスナップショット）で他の利用者が作成したページを見ると、
// 「氏名」「年齢」「性別」という見出し語だけで、実際の値が全く無いカードが並んでしまう問題。
// 「氏名 年齢 性別」のような表形式の見出し行から、対応する値を見つけられなかった場合に
// 見出し語だけがそのままカードのtextとして残ってしまうことが原因（AI経由・ローカル経由の
// いずれの分類でも起こりうるため、isBareFieldHeaderOnlyで両経路とも一律に除外する）。
// 併せて、これまで「性別」がFIELD_LABELSに未登録だったため、氏名・年齢と違って見出しとして
// 構造化されずにいた点も登録して統一した。
// ==========================================================================
test('「性別」がFIELD_LABELSに氏名・年齢と同様の基本情報項目として登録されている', () => {
  const genderField = FIELD_LABELS.find(f => f.key === '性別');
  assert.ok(genderField, '性別が見出しラベルとして登録されている');
  assert.equal(genderField.type, 'o');
});

test('isBareFieldHeaderOnly: 見出し語だけの文字列（値が無い）を検出する', () => {
  assert.ok(isBareFieldHeaderOnly('氏名'));
  assert.ok(isBareFieldHeaderOnly('年齢'));
  assert.ok(isBareFieldHeaderOnly('性別'));
  assert.ok(isBareFieldHeaderOnly('診断名：'), '末尾のコロンがあっても見出し語のみと判定する');
  assert.ok(!isBareFieldHeaderOnly('性別：女性'), '値が伴っている場合は見出し語のみとは判定しない');
  assert.ok(!isBareFieldHeaderOnly('田中花子'), '見出し語と無関係な文字列は対象外');
});

test('「氏名　年齢　性別」という値の無い表の見出し行だけでは、見出し語だけのカードが作られない', () => {
  const items = classifyLocally('氏名　年齢　性別\n');
  assert.ok(!findByIncludes(items, '氏名'), '値が見つからない「氏名」だけのカードは作られない');
  assert.ok(!findByIncludes(items, '年齢'), '値が見つからない「年齢」だけのカードは作られない');
  assert.ok(!findByIncludes(items, '性別'), '値が見つからない「性別」だけのカードは作られない');
});

test('氏名・年齢・性別に実際の値がある場合は、それぞれ正しく値を含むカードとして抽出される（回帰確認）', () => {
  const items = classifyLocally('氏名：田中花子\n年齢：72歳\n性別：女性');
  const name = findByIncludes(items, '田中花子');
  const age = findByIncludes(items, '72歳');
  const gender = findByIncludes(items, '女性');
  assert.ok(name, '氏名の値を含むカードが抽出される');
  assert.equal(name.fieldLabel, '氏名');
  assert.ok(age, '年齢の値を含むカードが抽出される');
  assert.equal(age.fieldLabel, '年齢');
  assert.ok(gender, '性別の値を含むカードが抽出される');
  assert.equal(gender.fieldLabel, '性別');
});

// ==========================================================================
// Request W: 血液検査の表を貼り付けた際、「WBC(白血球数)」「AST(GOT)」のように英語略語に
// 日本語名・別名が括弧書きで添えられている項目名の行が、直後の数値行と結合されず、
// 項目名だけの意味の無いカードになってしまう問題（利用者のスクリーンショット報告：
// 「TP」「WBC(白血球数)」「RBC(赤血球数)」「Hb(ヘモグロビン)」「Plt(血小板数)」
// 「AST(GOT)」「ALT(GPT)」「γGTP」「Alb」が値の無いカードとして並んでいた）。
// あわせて、TP（総蛋白）・Alb（アルブミン）・γGTPがこれまでLAB_STANDARDSに未登録で、
// 単独行の検査値としても認識できていなかった点も登録して統一した。
// ==========================================================================
test('項目名に括弧書きの別名が付いた検査値の表（項目名の行→数値の行）が、値を含む1枚のカードに正しく結合される', () => {
  const text = [
    'TP', '6.8g/dL',
    'WBC(白血球数)', '8200/μL',
    'RBC(赤血球数)', '450×10^4/μL',
    'Hb(ヘモグロビン)', '13.5g/dL',
    'Plt(血小板数)', '23.0×10^4/μL',
    'AST(GOT)', '28U/L',
    'ALT(GPT)', '32U/L',
    'γGTP', '45U/L',
    'Alb', '3.9g/dL'
  ].join('\n');
  const items = classifyLocally(text);
  assert.ok(findByIncludes(items, 'TP 6.8g/dL'), 'TPが値と結合される');
  assert.ok(findByIncludes(items, 'WBC(白血球数) 8200/μL'), '括弧書きの別名付きWBCが値と結合される');
  assert.ok(findByIncludes(items, 'RBC(赤血球数) 450'), '括弧書きの別名付きRBCが値と結合される');
  assert.ok(findByIncludes(items, 'Hb(ヘモグロビン) 13.5g/dL'), '括弧書きの別名付きHbが値と結合される');
  assert.ok(findByIncludes(items, 'Plt(血小板数) 23.0'), '括弧書きの別名付きPltが値と結合される');
  assert.ok(findByIncludes(items, 'AST(GOT) 28U/L'), '括弧書きの別名付きASTが値と結合される');
  assert.ok(findByIncludes(items, 'ALT(GPT) 32U/L'), '括弧書きの別名付きALTが値と結合される');
  assert.ok(findByIncludes(items, 'γGTP 45U/L'), 'γGTPが値と結合される');
  assert.ok(findByIncludes(items, 'Alb 3.9g/dL'), 'Albが値と結合される');
  // 見出し語だけ・値だけの中身の無いカードが残っていないことを確認する
  ['TP', 'WBC(白血球数)', 'RBC(赤血球数)', 'Hb(ヘモグロビン)', 'Plt(血小板数)', 'AST(GOT)', 'ALT(GPT)', 'γGTP', 'Alb']
    .forEach(bareKey => assert.ok(!items.some(i => i.text === bareKey), `「${bareKey}」だけの中身の無いカードが残っていない`));
});

test('TP・Alb・γGTPは同じ行に値が書かれた形式でも1枚のカードとして抽出される（回帰確認）', () => {
  const items = classifyLocally('検査データ\nTP6.8g/dL、Alb3.9g/dL、γGTP45U/L');
  assert.ok(findByIncludes(items, 'TP6.8g/dL'));
  assert.ok(findByIncludes(items, 'Alb3.9g/dL'));
  assert.ok(findByIncludes(items, 'γGTP45U/L'));
});

test('Ht(ヘマトクリット)・PT(プロトロンビン時間)も表形式で値と正しく結合される', () => {
  const items = classifyLocally(['Ht(ヘマトクリット)', '41.8%', 'PT(プロトロンビン時間)', '12.5秒'].join('\n'));
  assert.ok(findByIncludes(items, 'Ht(ヘマトクリット) 41.8%'), 'Htが値と結合される');
  assert.ok(findByIncludes(items, 'PT(プロトロンビン時間) 12.5秒'), 'PTが値と結合される');
  ['Ht(ヘマトクリット)', 'PT(プロトロンビン時間)'].forEach(bareKey =>
    assert.ok(!items.some(i => i.text === bareKey), `「${bareKey}」だけの中身の無いカードが残っていない`));
});

test('PT-INRはPTの追加後も引き続き正しく抽出される（前方一致の回帰確認）', () => {
  const items = classifyLocally('PT-INR\n1.2');
  assert.ok(findByIncludes(items, 'PT-INR 1.2'), 'PT-INRがPTと誤認識されず正しく抽出される');
});

// ==========================================================================
// Request X: 実際にアップロードされた実習記録で見つかった2つの不具合。
// (1)「①手術前日指示」「③手術当日術後指示」のような丸数字＋見出し語だけの行
//    （NFKC正規化で「1手術前日指示」等になる）が、直後の【点滴】【食事】等の箇条書きの
//    内容を伴わないまま、それ自体が意味の無いカードになってしまっていた。
// (2)「【点滴】なし【内服】眠前薬1/2本」のように、見出し＋本文が同じ行にあるにも関わらず、
//    行頭の「【点滴】」が誤って除去され、「なし」だけが残って何についての「なし」か
//    分からなくなってしまっていた（利用者からの指摘：「学習データ管理からほかのユーザーが
//    作成したページを閲覧すると…」の調査で発覚。過去の「感染症：無」の問題と同種）。
// ==========================================================================
test('丸数字（NFKC正規化後は半角数字）＋見出し語だけの行は、直後の箇条書きに続く時系列マーカーとして扱われ、見出し行自体はカード化されない', () => {
  const text = '1手術前日指示\n【点滴】なし【内服】眠前薬1/2本\n【食事】常食、21:00以降絶飲食';
  const items = classifyLocally(text);
  assert.ok(!items.some(i => i.text === '1手術前日指示'), '見出し行自体はカード化されない');
  const drip = findByIncludes(items, '【点滴】なし');
  assert.ok(drip, '「【点滴】なし」カードが見出しの文脈を保ったまま抽出される');
  assert.equal(drip.timestamp, '手術前日指示', '見出し語が時系列マーカーとして引き継がれる');
});

test('数字で始まっていても直後が箇条書き（【】）でない場合は、通常の文章としてそのまま抽出される（回帰確認）', () => {
  const items = classifyLocally('2か月前に会社の検診があり、貧血を指摘された。');
  assert.ok(findByIncludes(items, '2か月前に会社の検診があり'), '通常の文章は誤って時系列マーカーとして吸収されない');
});

test('見出し＋本文が同じ行にある場合、行頭の見出し（【点滴】等）が失われず本文と一緒に抽出される', () => {
  const items = classifyLocally('【点滴】なし【内服】眠前薬1/2本');
  assert.ok(findByIncludes(items, '【点滴】なし'), '「【点滴】」の見出しが失われない');
});

test('見出しだけで本文が無い行（【身長・体重】等）は引き続きカード化されない（回帰確認）', () => {
  const items = classifyLocally('【身長・体重】\n身長165.6cm、体重59.5kg');
  assert.ok(!items.some(i => i.text.includes('【身長・体重】')), '見出しだけの行はそのままカードにならない');
  assert.ok(findByIncludes(items, '身長165.6cm'), '実際の値の行は通常通り抽出される');
});

test('マーカー除去後に見出しの続きだけが残る場合は引き続き除去される（回帰確認：創部の明確化と合わせて確認）', () => {
  const items = classifyLocally('【術中・術後詳細および指示】\n創部：出血なし。');
  const wound = findByIncludes(items, '腹部創部（手術創）：出血なし');
  assert.ok(wound, '「創部」カードが腹部創部として明確化される');
  assert.equal(wound.timestamp, '術中・術後', 'マーカー除去後の見出しの続き（詳細および指示）は引き続き取り除かれる');
});

// ==========================================================================
// Request Y: タグ未設定の情報カードの見直しと適切なタグの付与
// ------------------------------------------------------------------------
// 実際にアップロードされた実習記録（胃全摘術・A氏58歳男性の事例）を
// groupClinicalPhrasesWithTimestamps/classifyLocallyに通したところ、多数の
// 「⚠タグ未設定」カードが見つかった。原因は主に3種類：
// ①見出しラベル（【保険】等）と値が別々の行に分かれている記録形式で、見出し行が
//   単純に破棄され、値の行が見出しの文脈（＝タグの手がかり）を失っていた。
// ②検査値の表形式の結合（BARE_LAB_KEY_REGEX／BARE_LAB_VALUE_REGEX）が、実際の
//   OCR由来の表記ゆれ（小文字dl、mEa/L、万u/L、｛｝→NFKC後の半角{}等）に対応できず
//   結合に失敗し、項目名の無い値だけのカードが残っていた。
// ③ヘンダーソン14項目のキーワード辞書に、記録で実際に使われる語（食生活・ADL・自立・
//   検温・安静・顔色等）が登録されていなかった。
// ==========================================================================
test('「氏名・年齢・性別・】」のような複合見出し行は、次の行の値カードに引き継がれ、氏名・年齢・性別単独の意味の無いカードは残らない', () => {
  const items = classifyLocally('氏名・年齢・性別・】\nA氏・58歳、男性');
  assert.ok(!items.some(i => i.text === '氏名' || i.text === '年齢' || i.text === '性別'), '見出し語単独のカードは残らない');
  const demographic = findByIncludes(items, 'A氏');
  assert.ok(demographic, '氏名・年齢・性別の値の行はカードとして残る');
  assert.equal(demographic.fieldLabel, '年齢', '複合見出しのうち初期提案タグを持つ「年齢」がfieldLabelとして選ばれる');
  assert.ok(demographic.hendersonIds.includes(4) && demographic.hendersonIds.includes(9), '「年齢」の初期提案タグ（4姿勢・9環境）が付与される');
});

test('「【保険】」のように見出しラベルと値が別の行にある場合、値の行に見出しラベルが引き継がれタグが付与される', () => {
  const items = classifyLocally('【保険】\n社会保険');
  const insurance = findByIncludes(items, '社会保険');
  assert.ok(insurance, '「社会保険」カードが抽出される');
  assert.equal(insurance.fieldLabel, '保険', '見出し行から引き継いだ「保険」がfieldLabelになる');
  assert.ok(insurance.hendersonIds.includes(9), '「保険」の初期提案タグ（9環境）が付与される');
});

test('OCRで閉じ括弧が丸括弧になっている「【診断)」のような見出し行も「診断名」として引き継がれる（診断の別名対応）', () => {
  const items = classifyLocally('【診断)\n予定術式：腹腔鏡下胃全摘術（RY再建）');
  const diagnosis = findByIncludes(items, '腹腔鏡下胃全摘術');
  assert.ok(diagnosis, '診断名の値の行が抽出される');
  assert.equal(diagnosis.fieldLabel, '診断名', '「診断」は「診断名」の別名として認識される');
  assert.ok(diagnosis.hendersonIds.includes(1) && diagnosis.hendersonIds.includes(9), '胃がん（胃全摘）の診断名ヒントから複数タグが推測される');
});

test('既往歴の「胆結石」（「胆石症」の別表記）にも診断名ヒントのタグが付与される', () => {
  const items = classifyLocally('【既往歴】\n53歳の時に胆結石を指摘されていたが、症状がないため経過観察中');
  const history = findByIncludes(items, '胆結石');
  assert.ok(history, '既往歴カードが抽出される');
  assert.equal(history.fieldLabel, '既往歴');
  assert.ok(history.hendersonIds.includes(2), '「胆結石」からも「胆石症」と同様に2(食事)タグが推測される');
});

test('山括弧だけの区切り見出し行（＜バイタルサイン)等、OCRで閉じ括弧が丸括弧になっている場合を含む）は不要な情報として除外される', () => {
  const items = classifyLocally('＜バイタルサイン)\n【血圧】112/72mmHg');
  assert.ok(!items.some(i => i.text.includes('バイタルサイン')), '区切り見出し行自体はカードとして残らない');
  assert.ok(findByIncludes(items, '112/72'), '後続の実際の値のカードは通常通り抽出される');
});

test('数字を含む山括弧行（実習日数の見出し等）は誤って除外されない（回帰確認）', () => {
  const items = classifyLocally('＜実習2日目（入院2日目、手術前日）＞\n体温36.5℃');
  assert.ok(findByIncludes(items, '体温36.5'), '数字を含む行の後続カードは通常通り抽出される');
});

test('検査値の項目名と実測値が別の行に分かれた表形式で、OCRの単位表記ゆれ（小文字dl・万u/L・mEa/L・半角波括弧）があっても項目名と値が結合される', () => {
  const items = classifyLocally(
    'WBC{白血球数)\n\n\n5880/ML.\n\nHb（ヘモグロビン）\n\n\n13.5g/dl\n\nPlt（血小板数）\n\n\n28.7万u/L\n\nNa\n\n\n140mEa/L\n\nCr\n\n\n0.87 mg/dl'
  );
  const wbc = findByIncludes(items, '5880');
  assert.ok(wbc && wbc.text.startsWith('WBC'), '半角化された波括弧「{}」でも項目名「WBC」と値が結合される');
  const hb = findByIncludes(items, '13.5g/dl');
  assert.ok(hb && hb.text.startsWith('Hb'), '値の単位が小文字「g/dl」でも項目名「Hb」と結合される');
  const plt = findByIncludes(items, '28.7万u/L');
  assert.ok(plt && plt.text.startsWith('Plt'), '「万u/L」（万単位＋uをμの代わりに使った表記）でも項目名「Plt」と結合される');
  const na = findByIncludes(items, '140');
  assert.ok(na && na.text.startsWith('Na'), '「mEa/L」（mEq/Lのqがaに誤認識された表記）でも項目名「Na」と結合される');
  const cr = findByIncludes(items, '0.87');
  assert.ok(cr && cr.text.startsWith('Cr'), '「Cr」（Creの略称）も項目名として認識され値と結合される');
});

test('「y GTP」（γGTPのOCR誤認識）も項目名として認識され、値と結合される', () => {
  const items = classifyLocally('y GTP\n\n\n15U/L');
  const ggtp = findByIncludes(items, '15U/L');
  assert.ok(ggtp && ggtp.text.startsWith('γGTP'), '「y GTP」が正式表記「γGTP」に正規化され、値と結合される');
});

test('患者本人の直接の発言（「〜」）を含むカードは、他のキーワードと一致しなくても10(コミュニケーション)タグが付与される', () => {
  const items = classifyLocally('朝のあいさつで訪室すると「やっぱりやらなくちゃいけないの?」と聞いてくる。');
  const card = findByIncludes(items, 'やっぱりやらなくちゃいけないの');
  assert.ok(card, '患者の発言を含むカードが抽出される');
  assert.ok(card.hendersonIds.includes(10), '患者の直接の発言から10(コミュニケーション)タグが付与される');
});

test('「【検温】帰室時、15分、30分、1時間…」のようなバイタル再検間隔の列挙は、断片化せず1枚のカードにまとまる', () => {
  const items = classifyLocally('【検温】帰室時、15分、30分、1時間、2時間【安静度】術後床上安静');
  assert.ok(!items.some(i => i.text === '15分' || i.text === '30分' || i.text === '1時間'), '数値＋単位だけの断片は単独カードにならない');
  const vitals = findByIncludes(items, '帰室時');
  assert.ok(vitals, '「検温」のカードが1枚にまとまって残る');
  assert.ok(vitals.hendersonIds.includes(7), '「検温」から7(体温)タグが付与される');
});

test('「食生活」「ADL」「自立」「顔色」「蒼白」等、実際の記録で使われる表記からもヘンダーソンタグが付与される（キーワード追加の確認）', () => {
  const items = classifyLocally(
    '食生活：肉全般とラーメンが好き、野菜嫌い。\nADL：全て自立\n顔色やや蒼白、息遣いは浅い。'
  );
  const diet = findByIncludes(items, '食生活');
  assert.ok(diet && diet.hendersonIds.includes(2), '「食生活」から2(食事)タグが付与される');
  const adl = findByIncludes(items, 'ADL');
  assert.ok(adl && adl.hendersonIds.includes(4), '「ADL：全て自立」から4(姿勢)タグが付与される');
  const pallor = findByIncludes(items, '蒼白');
  assert.ok(pallor && pallor.hendersonIds.includes(1), '「顔色」「蒼白」から1(呼吸・循環)タグが付与される');
});
