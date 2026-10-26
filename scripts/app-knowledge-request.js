'use strict';
// Builds the app-wide knowledge request (not tied to one patient): which common diseases/symptoms are thinly covered by the site,
// plus structural topics. Output: docs/app-wide-knowledge-request.md. Run: node scripts/app-knowledge-request.js
const fs = require('fs');
const path = require('path');
const { loadApp } = require('../tests/app-helpers');
const app = loadApp();
const CATALOGUE = {
  '循環器': ['心不全', '心筋梗塞', '狭心症', '心房細動', '高血圧', '大動脈解離', '下肢閉塞性動脈硬化症', '深部静脈血栓症'],
  '呼吸器': ['肺炎', '慢性閉塞性肺疾患', '気管支喘息', '間質性肺炎', '肺がん', '気胸', '肺結核', '睡眠時無呼吸症候群'],
  '消化器': ['胃がん', '大腸がん', '肝硬変', '肝がん', '膵がん', '胆石症', '急性膵炎', '潰瘍性大腸炎', 'クローン病', 'イレウス', '虫垂炎'],
  '代謝・内分泌': ['糖尿病', '1型糖尿病', '甲状腺機能亢進症', '甲状腺機能低下症', 'クッシング症候群', '脂質異常症', '痛風'],
  '腎・泌尿器': ['慢性腎不全', '血液透析', 'ネフローゼ症候群', '尿路感染症', '前立腺肥大症', '前立腺がん', '膀胱がん'],
  '脳・神経': ['脳梗塞', '脳出血', 'くも膜下出血', 'パーキンソン病', '認知症', 'てんかん', '筋萎縮性側索硬化症', '多発性硬化症'],
  '精神': ['うつ病', '統合失調症', '双極性障害', '不安障害', '摂食障害', 'せん妄'],
  '運動器': ['大腿骨頸部骨折', '変形性膝関節症', '関節リウマチ', '脊柱管狭窄症', '骨粗鬆症', '人工関節置換術'],
  '血液・腫瘍': ['白血病', '悪性リンパ腫', '貧血', '乳がん', '緩和ケア', '化学療法', '放射線療法'],
  '感染・免疫': ['敗血症', '膠原病', '全身性エリテマトーデス', 'HIV感染症', '帯状疱疹'],
  '小児': ['小児喘息', 'ネフローゼ症候群', '川崎病', '先天性心疾患', '熱性けいれん', '急性胃腸炎', 'RSウイルス感染症'],
  '周産期・女性': ['妊娠高血圧症候群', '産褥', '帝王切開', '切迫早産', '子宮がん', '卵巣がん'],
  '皮膚・創傷': ['褥瘡', '熱傷', '蜂窩織炎', '糖尿病足病変'],
  '症状': ['疼痛', '発熱', '呼吸困難', '嘔気・嘔吐', '便秘', '下痢', '浮腫', '不眠', '転倒', '誤嚥', '脱水', '意識障害']
};
const rows = [];
Object.entries(CATALOGUE).forEach(([group, list]) => list.forEach(t => {
  const c = app.krCoverage ? app.krCoverage(t) : null;
  const reqs = app.buildKnowledgeRequests({ title: 'T', items: [{ id: '1', type: 'o', text: '診断名: ' + t, fieldLabel: '診断名', hendersonIds: [] }] });
  const flag = reqs.find(r => ['diagnosis', 'thin-diagnosis'].includes(r.kind));
  if (flag) rows.push({ group, term: t, kind: flag.kind });
}));
const byGroup = {};
rows.forEach(r => { (byGroup[r.group] = byGroup[r.group] || []).push(`${r.term}（${r.kind === 'diagnosis' ? '未登録' : '薄い'}）`); });
let out = `アプリ全体の知識リクエスト（${new Date().toLocaleDateString('ja-JP')}）\n\n`;
out += '[Purpose] This is a research request to raise the quality of a Japanese nursing-assessment support website as a whole. It is NOT about any one patient. Below are (A) common diseases and symptoms the site holds little or no knowledge about, and (B) structural topics where general tables are missing. Collect general nursing and medical knowledge that can be written as reusable rules or table rows.\n';
out += '[Generalization] For every topic state the general condition it rests on (disease group, symptom class, lab key, phase, age group, sex, drug class), say whether it also applies to related groups, and mark patient-specific or one-case advice as such. Prefer answers that can be written as a table row over narrative.\n';
out += '[Sources] Prefer Japanese textbooks (title, edition, page) and official guidelines (name, year, page). Write 不明 where unknown; never fill gaps with guesses.\n';
out += '[Language] Answer in Japanese. Keep nursing terms (看護問題, ヘンダーソンの14項目, OP/TP/EP).\n';
out += '[Answer format] One block per topic: 1. 内容 2. ヘンダーソン14項目（番号と理由）3. 因果（原因→途中の変化→結果）4. 看護 OP/TP/EP 5. 出典 6. 範囲（当てはまらない条件）。Add useful topics you find under 追加提案 with 理由.\n\n';
out += '## A. 知識が薄い・未登録の疾患・症状\n';
Object.entries(byGroup).forEach(([g, l]) => { out += `- ${g}: ${l.join('、')}\n`; });
if (!rows.length) out += '- （該当なし）\n';
out += `\n## B. 構造的な不足（表の形で集めてください）\n`;
[
  '検査値の基準を年齢帯・性別・病態（腎・肝・妊娠・小児・高齢者）ごとに整理した表（Hb・Cre・K・Na・CRP・Alb・血糖・HbA1c・pH・WBC・PT-INR・BNP・AST/ALT・TSH）と、各値が変動する薬剤・疾患',
  '薬剤クラスごとの作用・主な副作用・観察点・関連する検査値（利尿薬、抗凝固薬、ステロイド、インスリン、降圧薬、抗菌薬、化学療法薬、オピオイド、向精神薬、NSAIDs）。用量の助言は不要',
  '年齢帯ごとの発達段階と看護の視点（新生児・乳児・幼児・学童・思春期・成人・高齢者・周産期）。ヘンダーソン14項目との対応',
  '入院前・入院中・退院後（外来）の時期ごとに評価すべき内容と、時期で判定が変わる項目',
  '過去の出来事（既往・過去の外傷や入院）が現在の評価に影響する条件と、影響しない条件の区別',
  '正常所見・否定所見（「〜なし」「問題なし」）を充足の根拠にしてよい条件としてはいけない条件',
  '複数の疾患・薬が重なったときの高リスクの組合せ（例：薬剤と検査値、疾患と症状）の一覧と観察点',
  '患者・家族の自己管理能力（知識・意思力・体力）を評価する観察項目と、未充足の原因の見分け方'
].forEach((t, i) => { out += `${i + 1}. ${t}\n`; });
const dest = path.join(__dirname, '..', 'docs', 'app-wide-knowledge-request.md');
fs.writeFileSync(dest, out);
console.log(out);
