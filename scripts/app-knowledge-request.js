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
const ledgerPath = path.join(__dirname, '..', 'docs', 'request-ledger.json');
const LEDGER = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : {};
const ledgerKey = t => String(t).replace(/^【最優先】/, '').slice(0, 16);
const rows = [];
Object.entries(CATALOGUE).forEach(([group, list]) => list.forEach(t => {
  const c = app.krCoverage ? app.krCoverage(t) : null;
  const reqs = app.buildKnowledgeRequests({ title: 'T', items: [{ id: '1', type: 'o', text: '診断名: ' + t, fieldLabel: '診断名', hendersonIds: [] }] });
  const flag = reqs.find(r => ['diagnosis', 'thin-diagnosis'].includes(r.kind));
  const le = LEDGER['A:' + t];
  if (flag && !(le && le.status !== 'open')) rows.push({ group, term: t, kind: flag.kind });
}));
const byGroup = {};
rows.forEach(r => { (byGroup[r.group] = byGroup[r.group] || []).push(`${r.term}（${r.kind === 'diagnosis' ? '未登録' : '薄い'}）`); });
let out = `アプリ全体の知識リクエスト（${new Date().toLocaleDateString('ja-JP')}）\n\n`;
out += '[Purpose] This is a research request to raise the quality of a Japanese nursing-assessment support website as a whole. It is NOT about any one patient. Below are (A) common diseases and symptoms the site holds little or no knowledge about, and (B) structural topics where general judgment tables are missing. Answer B first: it has the largest effect. Collect general nursing and medical knowledge that can be written as reusable rules or table rows.\n';
out += '[Generalization] For every topic state the general condition it rests on (disease group, symptom class, lab key, phase, age group, sex, drug class), say whether it also applies to related groups, and mark patient-specific or one-case advice as such. Prefer answers that can be written as a table row over narrative.\n';
out += '[Sources] Prefer Japanese textbooks (title, edition, page) and official guidelines (name, year, page). Write 不明 where unknown; never fill gaps with guesses.\n';
out += '[New categories] If a piece of information does not fit any of the 14 needs or the existing concept tags without distortion, do not force it. Say where it belongs and whether a NEW concept/category is warranted: give the general condition (disease group, phase, subject, age group), at least 3 distinct cases it would cover, and why an existing destination is insufficient.\n';
out += '[Language] Answer in Japanese. Keep nursing terms (看護問題, ヘンダーソンの14項目, OP/TP/EP).\n';
out += '[Answer format] One block per topic: 1. 内容 2. ヘンダーソン14項目（番号と理由）3. 因果（原因→途中の変化→結果）4. 看護 OP/TP/EP 5. 出典 6. 範囲（当てはまらない条件）。Add useful topics you find under 追加提案 with 理由.\n\n';
out += '## A. 知識が薄い・未登録の疾患・症状\n';
Object.entries(byGroup).forEach(([g, l]) => { out += `- ${g}: ${l.join('、')}\n`; });
if (!rows.length) out += '- （該当なし）\n';
out += `\n## B. 構造的な不足（表の形で集めてください）\n`;
[
  // Priority 1: judgment rules that decide fulfilled / unmet / pending (largest effect on assessment quality)
  '【最優先】ヘンダーソン14項目ごとの「充足・未充足・判定保留」の判定規則表：各項目で（a）充足の根拠になる所見、（b）未充足の根拠になる所見、（c）単独では根拠にしてはいけない所見（例：正常な検査値だけ・治療上の制限・指示だけで実施の記録がない・既往だけ）、（d）時期（入院前・術前後・退院後・産褥日）で判定が変わる条件。看護の教科書・看護過程の資料に基づく',
  '【最優先】検査値と基本的欲求の関連表：検査項目（Hb・RBC・Ht・Na・K・血糖・CRP・WBC・Alb・TP・Cre・BUN・AST・ALT・HbA1c・pH・PT-INR・BNP・Dダイマー）ごとに、どの欲求の判断材料になるか／ならないか、単独で使える条件と他の所見が必要な条件、見かけ上の異常（OCR・単位ずれ・値の取り違え）の見分け方',
  '【最優先】治療上の制限（絶飲食・安静度・酸素投与・点滴・ドレーン・禁忌）と、本人の能力の不足の区別：制限中の欲求を「判定保留（理由付き）」にする条件、制限下でも評価できる項目、酸素投与中のSpO2など条件付きの値の読み方',
  // Priority 2: phase / developmental / life-context reasoning
  '術式・処置ごとの術後経過の時期別観察表（胃切除・大腸切除・肝胆膵・開胸・開腹・人工関節・帝王切開・心臓外科）：合併症（縫合不全・出血・イレウス・肺合併症・静脈血栓・ダンピング・栄養障害など）の好発時期、観察項目、看護、退院後の生活（食事・仕事・外食・旅行）への影響。診断を決めない書き方で',
  '周産期の時期別表（妊娠期・分娩期・産褥日ごと・新生児）：子宮復古・悪露・後陣痛・会陰創・乳房と授乳・排尿排便・睡眠・母親役割の正常経過と逸脱の目安、検査値（Hb など）の妊娠期・産褥期の基準、母と新生児の情報の区別、家族役割',
  '年齢帯ごとの発達段階と看護の視点（新生児・乳児・幼児・学童・思春期・成人・高齢者・周産期）と14項目の対応。特に思春期の慢性疾患（自律・身体像・仲間・学校・部活動・家族の関わり）と、自己管理を「手技・目的の理解・結果の解釈・行動の判断・生活での実行・援助要請」に分けて評価する観察項目',
  '慢性疾患（1型・2型糖尿病、心不全、COPD、腎不全、てんかん、喘息）の療養と生活（仕事・学校・運動・旅行・食事）の両立：運動の可否を一律に制限しない安全評価の観点、家族の役割移行と介護負担の評価',
  // Priority 3: evidence handling
  '正常所見・否定所見（「〜なし」「問題なし」）や過去の出来事（既往・過去の外傷・以前の入院）を充足・リスクの根拠にしてよい条件としてはいけない条件、時間が経った情報の扱い',
  '根拠の確かさの評価基準（直接性・新しさ・一貫性・独立性・矛盾の有無）。同じ内容の重複で確かさが上がらないための考え方、矛盾する記録（年齢・週数・時刻・数値）を勝手に統一しない確認手順',
  '複数の疾患・薬・検査値が重なったときの高リスクの組合せ一覧と観察点（薬剤クラス：利尿薬、抗凝固薬、ステロイド、インスリン、降圧薬、抗菌薬、化学療法薬、オピオイド、向精神薬、NSAIDs。用量の助言は不要）',
  '検査値の基準を年齢帯・性別・病態（腎・肝・妊娠・小児・高齢者・糖尿病治療中）ごとに整理した表と、各値が変動する薬剤・疾患。治療目標値（HbA1cなど）と一般の基準範囲の区別',
  '看護問題の優先順位の付け方（現在の問題とリスク、緊急度、本人の希望、実際の生活への影響）と、過去の出来事や診断名だけから問題を作らないための除外条件。OP/TP/EPを患者の生活に合わせて個別化する方法（測定可能な目標の書き方を含む）'
].filter(t => { const e = LEDGER[ledgerKey(t)]; return !e || e.status === 'open'; }).forEach((t, i) => { out += `${i + 1}. ${t}\n`; });
// 回収済み・反映済みの項目は再依頼しない（台帳 docs/request-ledger.json）。新しい項目は台帳に無い＝未依頼として出す。
const skipped = Object.keys(LEDGER).filter(k => LEDGER[k].status !== 'open').length;
if (skipped) out += `\n（回収済みで再依頼しない項目: ${skipped}件。台帳 docs/request-ledger.json）\n`;
const dest = path.join(__dirname, '..', 'docs', 'app-wide-knowledge-request.md');
fs.writeFileSync(dest, out);
console.log(out);
