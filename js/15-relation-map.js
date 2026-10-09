    // 看護アセスメント支援システム：15-relation-map.js（全15ファイルのうち 15 番目）
    // 【関連図（版2）】利用者からの要望：「看護学生が実習で作る関連図（入院から入院後まで）のルールで、関連図の機能を向上させてください」。
    // 事実を並べた図ではなく、「原因・誘因 → 病態生理 → 身体の変化 → 症状・徴候 → 生活への影響 → 看護問題」の因果を、
    // 医学的な中間過程を補って示す関連図を作る。
    //   ・データ：四角（nodes）と矢印（edges）の構造化データ（cp.relationMap、version 2）。画像ではなく1つずつ直せる
    //     四角：type（8種類）・label・evidence（記録の根拠）・observed（事実／予測）・source（記録／医学知識で補った）・priority（看護問題の#）
    //     矢印：relation（原因→結果・寄与・結果・治療→対象・予測・根拠）・predicted（予測＝破線）・evidence（なぜAからBか）
    //   ・作り方：①記録から作る（AIなし。よくある展開のひな形で病態を補う）②AIで作る（決まりを守った構造化データを返してもらう）
    //   ・検証：作ったあとに12項目を自動で確かめ（AIは使わない）、直せるものは「自動で直す」
    //   ・描画：左から「背景・要因 → 疾患・病態 → 治療 → 身体の変化 → 看護問題（右端）」。重要な看護問題ほど上。
    //     線は直角に曲げ、つながっていない線が交わる所には飛び越え（∩）を描く。治療は楕円・検査は（ ）・予測は破線。
    // 版1（2026-10-01）の図は、開いたときに自動で版2に直す。図の文字はすべて escapeHtml を通して SVG の <text> に入れる。

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['15'] = '2026-10-09.41'; // 版（scripts/stamp-version.js が書き込む）

    // ---- 種類 ----
    const RM_TYPES = [
      // 患者情報・背景は、ほかの白い四角（病態）と見分けられるよう薄い緑にする（2026-10-06.21 色合いの調整）
      { key: 'patient_fact', label: '患者情報・背景', shape: 'rect', fill: '#EEF4EC', stroke: '#5E7458' },
      { key: 'disease', label: '疾患', shape: 'rect', fill: '#FCE4E4', stroke: '#B5452F', bold: true },
      { key: 'pathophysiology', label: '病態生理', shape: 'rect', fill: '#FFFFFF', stroke: '#6B665C' },
      { key: 'symptom', label: '症状・徴候', shape: 'rect', fill: '#FFF7EC', stroke: '#B7791F' },
      { key: 'lab', label: '検査データ', shape: 'rect', fill: '#F3F7FD', stroke: '#3A6EA5', paren: true },
      { key: 'vital', label: 'バイタルサイン', shape: 'rect', fill: '#F3F7FD', stroke: '#3A6EA5', paren: true },
      { key: 'medication', label: '薬剤', shape: 'ellipse', fill: '#EEF3FF', stroke: '#1E3A8A' },
      { key: 'assessment', label: 'アセスメント', shape: 'rect', fill: '#F5F3FF', stroke: '#7C3AED' },
      { key: 'treatment', label: '治療・処置', shape: 'ellipse', fill: '#EEF3FF', stroke: '#1E3A8A' },
      { key: 'future_risk', label: '今後のリスク', shape: 'rect', fill: '#FFFFFF', stroke: '#7A7266' },
      { key: 'nursing_problem', label: '看護問題', shape: 'rect', fill: '#FBDDE3', stroke: '#B03A55', bold: true }
    ];
    const RM_TYPE_BY_KEY = new Map(RM_TYPES.map(t => [t.key, t]));
    // 矢印の間に補った過程（＋補足）の色：ほかの四角と見分けやすい紫
    const RM_ADDED = { fill: '#F5F3FF', stroke: '#7C3AED' };
    // 矢印の間の「飛躍」を埋める病態生理の中間過程。s＝原因の四角、t＝結果の四角（どちらも文字で判定）
    const RM_BRIDGE_RULES = [
      { s: /全身麻酔|気管内挿管/, t: /咳嗽反射|気道クリアランス/, step: '麻酔薬・筋弛緩薬の残存、挿管による気道粘膜の刺激', why: '術後もしばらく反射が鈍り、分泌物も増える' },
      { s: /手術侵襲|組織の損傷/, t: /創部痛|疼痛|痛み/, step: '組織の損傷による発痛物質（プロスタグランジン等）の放出', why: '発痛物質が痛覚の神経を刺激する' },
      { s: /創部痛|腹部.*痛/, t: /深呼吸・咳嗽の抑制|呼吸の抑制/, ctx: /胃|腹|腸|肝|胆|膵|食道|胸|肺|心臓/, step: '腹部・胸部に力を入れると創部が引っ張られて痛む', why: '痛みを避けて呼吸・咳を浅くする' },
      { s: /創部痛|疼痛|痛み/, t: /深呼吸・咳嗽の抑制|呼吸の抑制/, step: '痛みで体に力を入れられない', why: '痛みを避けて呼吸・咳を浅くする' },
      { s: /深呼吸・咳嗽の抑制/, t: /排痰困難|痰/, step: '1回換気量と咳の力の低下', why: '痰を押し出す空気の流れが弱くなる' },
      { s: /咳嗽反射の低下|気道クリアランスの低下/, t: /排痰困難/, step: '気道の線毛運動・咳による痰の押し出しの低下', why: '' },
      { s: /分泌物の貯留|痰の貯留/, t: /無気肺|肺炎/, step: '末梢の気道が痰でふさがり肺胞がしぼむ（虚脱）・細菌が増える', why: 'ふさがった先に空気が入らず、痰の中で細菌が増える' },
      { s: /手術侵襲/, t: /炎症反応/, step: '侵襲に反応したサイトカイン（IL-6等）の放出', why: 'WBC・CRP・体温が上がる' },
      { s: /ドレーン|カテーテル|留置/, t: /バリア機能/, step: '体の外と中をつなぐ管（細菌の侵入経路）', why: '' },
      { s: /バリア機能の低下/, t: /感染/, step: '細菌が体内に入り込み増えやすい', why: '' },
      { s: /1回に食べられる量|摂取量の低下|食事量の低下|食欲の?低下|食事摂取/, t: /体重.*減|低栄養|栄養摂取量不足|栄養が足り|Alb/, step: 'エネルギー・たんぱく質の摂取不足', why: '必要量より少ない状態が続くと体の蓄えを使う' },
      { s: /創部痛|疼痛|痛み/, t: /体動の制限|活動耐性|離床/, step: '動くと痛みが強まるため動くことを控える', why: '' },
      { s: /ドレーン|カテーテル|点滴|ルート/, t: /体動の制限|活動耐性/, step: '管があり、動作が制約される', why: '管が入っていると、寝返り・起き上がりなどの動作がしにくくなる（「抜けるのが心配」と本人が言っていなくても言える範囲にとどめる）' },
      { s: /体動の制限|活動耐性の低下|臥床|安静/, t: /セルフケア不足|身の回りのこと/, step: '筋力・体力の低下で身の回りの動作に介助が必要', why: '' },
      { s: /抗凝固|ワルファリン|ワーファリン|エドキサバン|リクシアナ|アピキサバン|エリキュース|リバーロキサバン|イグザレルト|ヘパリン/, t: /出血/, step: '血液が固まりにくくなる（凝固能の低下）', why: '' },
      { s: /高血糖/, t: /感染/, step: '白血球（好中球）の働きの低下・血流の悪化', why: '細菌を退治する力と傷を治す力が落ちる' },
      { s: /麻痺/, t: /転倒|転落/, step: 'バランスを保つ力・踏ん張る力の低下', why: '' },
      { s: /脳の血流の途絶|神経細胞の障害|脳の出血/, t: /嚥下反射|嚥下障害|飲み込/, step: '飲み込みにかかわる脳の神経（延髄・大脳）の働きの低下', why: '' },
      { s: /嚥下反射|嚥下障害|むせ/, t: /誤嚥/, step: '食べ物・唾液が気管に入りやすい（喉頭の閉鎖が遅れる）', why: '' },
      { s: /利尿薬|フロセミド|ラシックス/, t: /脱水|電解質|体液量/, step: '尿量の増加（水分とカリウムが尿に出る）', why: '' },
      { s: /利尿薬|フロセミド|ラシックス/, t: /ふらつ|トイレ|眠れ|睡眠|夜間/, step: '夜間頻尿（夜中に何度もトイレに起きる）', why: '' },
      { s: /心拍出量の低下|肺うっ血/, t: /呼吸困難|息切れ|酸素化|SpO2/, step: '肺に水分がたまり酸素の取り込みが妨げられる', why: '' },
      { s: /貧血|出血による/, t: /活動耐性|ふらつ|転倒|体動の制限/, step: '全身へ運ぶ酸素が減る（疲れやすさ・ふらつきが出やすい）', why: 'ヘモグロビンが少ないと、体へ運ぶ酸素が減る。疲れ・ふらつきが記録にないときは「出やすい」にとどめる' },
      { s: /認知症|せん妄|脳機能の一時的な低下/, t: /転倒|転落|自己抜去/, step: '危険の判断やナースコールで人を呼ぶことが難しい', why: '' },
      { s: /\d+歳|高齢|加齢/, t: /転倒|転落/, step: '筋力・バランス・視力の低下', why: '' },
      { s: /手術|入院|診断|生活の変化/, t: /家族の不安/, step: '家族が介護や今後の生活の見通しを持てない', why: '' },
      { s: /手術|入院|診断|生活の変化/, t: /不安/, step: '先の見通しが立たない・これまでの生活や役割を続けられるかの心配', why: '' },
      { s: /人工骨頭|人工股関節/, t: /脱臼/, step: '術後は関節を包む組織（関節包）が弱く、特定の姿勢で外れやすい', why: '' },
      { s: /圧迫|ずれ|皮膚の血流低下/, t: /発赤|褥瘡|皮膚/, step: '皮膚・皮下組織への酸素と栄養の不足（虚血）', why: '' },
      { s: /疼痛|痛み/, t: /睡眠|不眠|眠れ/, step: '痛みで寝つけない・目が覚める', why: '' },
      { s: /体動の制限|臥床|安静/, t: /便秘|腸蠕動|排便/, step: '腸の動き（蠕動運動）の低下', why: '' },
      { s: /オピオイド|モルヒネ|フェンタニル|麻酔/, t: /便秘|腸蠕動|排便/, step: '薬による腸の動き（蠕動運動）の抑制', why: '' },
      { s: /静脈血のうっ滞|凝固能の亢進/, t: /深部静脈血栓|肺塞栓/, step: 'ふくらはぎ・骨盤の深い静脈に血の塊（血栓）ができる', why: '血栓がはがれて肺に流れると肺塞栓になる' },
      { s: /腸の動き|蠕動運動の低下/, t: /排ガス|膨満|嘔吐|便/, step: '腸の内容物やガスが先へ進まずたまる', why: '' },
      { s: /呼吸に使うエネルギーの増加/, t: /食事|摂取|体重/, step: '食事中の息切れで食べ続けられない・消費エネルギーの増加', why: '' },
      { s: /塩分制限/, t: /味がしない|味が薄|食事|摂取/, step: '味が薄く感じて食欲がわかない', why: '' },
      { s: /心不全/, t: /食事|摂取/, step: '消化管のうっ血（むくみ）・息切れで食欲が落ちる', why: '' },
      { s: /塩分・水分の過剰|内服の中断/, t: /心不全/, step: '体に水分がたまり心臓の負担（前負荷）が増える', why: '' },
      // ---- 2026-10-06.11 で追加（関連図に使える知識集：2021〜2026年の最新のガイドラインを根拠に選んだもの） ----
      // 心不全（2025年改訂版 心不全診療ガイドライン：うっ血と心拍出量の低下、低心拍出→腎血流の低下）
      { s: /心拍出量の低下|左心機能の低下/, t: /腎血流|体液の貯留/, step: '腎臓がナトリウムと水をためこむ（レニン・アンジオテンシン・アルドステロン系）', why: '腎血流が減ると体は血液量を増やそうとする' },
      { s: /心拍出量の低下|左心機能の低下|心筋の障害/, t: /活動耐性|体動の制限|息切れ/, step: '動いたときに全身へ送る血液を増やせない', why: '筋肉への酸素が足りず、すぐ疲れ息切れする' },
      { s: /起座呼吸|横になれない|横になると息/, t: /眠れ|睡眠|不眠/, ctx: /心不全|心拍出量|肺うっ血/, step: '横になると心臓に戻る血液が増え、肺のうっ血が強まる', why: '息苦しさで寝つけない・目が覚める' },
      { s: /心房細動/, t: /血栓/, step: '心房が細かくふるえて血液がよどむ', why: '' },
      // 呼吸器（COPDガイドライン第7版2026・GOLD 2026・BTS酸素ガイドライン・成人肺炎診療ガイドライン2024）
      { s: /気道・肺胞への慢性的な刺激|喫煙/, t: /COPD|慢性閉塞性肺疾患|肺気腫/, step: '気道の慢性的な炎症と肺胞の壁の壊れ（肺気腫）', why: '息を吐き出す力が戻らなくなる' },
      { s: /CO2の貯留|二酸化炭素の貯留/, t: /意識|傾眠|頭痛|ナルコーシス/, step: '血液中のCO2が増え、脳の働きが落ちる', why: '酸素の投与が多すぎると換気がさらに減ることがある（目標SpO2 88〜92%）' },
      { s: /肺胞でのガス交換の低下|酸素化の低下/, t: /活動耐性|体動の制限/, step: '動くと酸素の需要が増え、取り込みが追いつかない', why: '歩行・入浴などでSpO2が下がる' },
      { s: /誤嚥(?!リスク)/, t: /肺炎/, step: '口の中の細菌が唾液・食べ物と一緒に肺に入り増える', why: '口腔ケアで細菌を減らすと予防になる' },
      { s: /\d+歳|高齢|加齢/, t: /嚥下反射|咳反射/, step: '飲み込む筋力と、のどの感覚の低下', why: '気づかないうちに誤嚥する（不顕性誤嚥）' },
      { s: /誤嚥性肺炎|肺炎|感染/, t: /栄養状態の低下|低栄養|体重.*減/, step: '炎症で消費エネルギーが増え、食事量が減る', why: '炎症は低栄養の原因の1つ（GLIM）' },
      // 周術期（ERAS Society 2025・肺血栓塞栓症/深部静脈血栓症ガイドライン2025・NICE せん妄）
      { s: /手術侵襲/, t: /腸の動き|蠕動運動の低下/, step: '手術操作・痛みによる交感神経の緊張と腸の炎症', why: '医療用麻薬（オピオイド）も腸の動きを抑える' },
      { s: /手術侵襲/, t: /静脈血のうっ滞|凝固能/, step: '血管の内側の傷・血流の停滞・固まりやすさ（ウィルヒョウの3つの要因）', why: '' },
      { s: /手術侵襲/, t: /高血糖|インスリン/, step: 'ストレスで血糖を上げるホルモンが増え、インスリンが効きにくくなる', why: '' },
      { s: /手術侵襲|感染|肺炎|発熱|疼痛|痛み/, t: /せん妄|脳機能の一時的な低下/, step: '炎症・痛み・低酸素・睡眠の乱れが脳の働きを乱す（直接因子・誘発因子）', why: '' },
      { s: /\d+歳|高齢|加齢|認知症|アルツハイマー/, t: /せん妄|脳機能の一時的な低下/, step: '脳の予備力の低下（せん妄を起こしやすい準備因子）', why: '' },
      // 絶食は「腸が動き出すまで」とは限らない（誤嚥性肺炎の絶食に、この過程が入っていた：2026-10-07.6）。腸の動きの低下だけ
      { s: /腸の動き|蠕動運動の低下/, t: /栄養状態の低下|摂取量|低栄養/, step: '腸が動き出すまで食事を始められない・食べる量が少ない', why: '' },
      // 高齢者・生活（高齢者の安全な薬物療法ガイドライン2025・高血圧管理・治療ガイドライン2025・World Falls Guidelines・AWGS 2025・褥瘡予防・管理ガイドライン第5版）
      { s: /睡眠薬|睡眠導入|ベンゾジアゼピン|抗不安薬|抗コリン|多剤|ポリファーマシー/, t: /転倒|ふらつ|せん妄/, step: '薬による眠気・ふらつき・注意力の低下', why: '5剤以上の服用で転倒が増える' },
      { s: /降圧薬|アムロジピン|エナラプリル|利尿薬|フロセミド|ラシックス/, t: /転倒|ふらつ|めまい/, step: '血圧が下がりすぎ、立ち上がったときにふらつく（起立性低血圧）', why: '' },
      { s: /体動の制限|臥床|安静|活動耐性の低下/, t: /筋力|廃用|ADL|サルコペニア/, step: '使わない筋肉がやせて筋力が落ちる（廃用・サルコペニア）', why: '' },
      { s: /体動の制限|臥床|安静|麻痺/, t: /圧迫|ずれ|皮膚の血流低下/, step: '自分で体の向きを変えられず、同じ部位に体重がかかり続ける', why: '' },
      { s: /\d+歳|高齢|加齢/, t: /脱水|体液量不足|水分摂取の不足/, step: 'のどの渇きを感じにくく、体の水分の割合も少ない', why: '' }
    ];
    const RM_RELATIONS = [
      { key: 'causes', label: '原因 → 結果' },
      { key: 'contributes_to', label: '要因になる（寄与）' },
      { key: 'results_in', label: '結果として起こる' },
      { key: 'treats', label: '治療 → 治療の対象' },
      { key: 'predicts', label: '今後起こりうる（予測）' },
      { key: 'supports', label: 'データが示す（根拠）' },
      { key: 'manifests_as', label: '症状・徴候として現れる' },
      { key: 'contradicts', label: '一致しない' },
      { key: 'interpreted_as', label: '〜と評価する' },
      { key: 'increases_risk_of', label: 'リスクを高める' },
      { key: 'may_contribute_to', label: '影響する可能性' },
      { key: 'improves', label: '改善に働く' },
      { key: 'worsens', label: '悪化に働く' },
      { key: 'managed_by', label: '治療・ケアする' },
      { key: 'addresses', label: '対応する' },
      { key: 'preceded_by', label: '時間的に先行する' },
      { key: 'related_to', label: '関連する' }
    ];
    const RM_RELATION_KEYS = new Set(RM_RELATIONS.map(r => r.key));
    // 版1の種類 → 版2の種類
    const RM_V1_KIND = { patient: 'patient_fact', psychosocial: 'patient_fact', disease: 'disease', treatment: 'treatment', pathology: 'pathophysiology', symptom: 'symptom', problem: 'nursing_problem', risk: 'nursing_problem' };

    // 文字は14px（画面で小さく縮めても読めるように）。四角の幅もそれに合わせて広げる
    const RM_RECT_W = 196, RM_ELLIPSE_W = 214;
    const RM_FONT = 14, RM_LINE_H = 19, RM_PAD = 10, RM_HEAD_H = 0;
    // 看護問題の補足（名前の下の小さい説明文）
    const RM_NOTE_FONT = 11.5, RM_NOTE_LINE_H = 15, RM_NOTE_GAP = 7, RM_NOTE_MAX = 60;
    // 「記録から作る」の作り方を直したら上げる。古い作り方で保存された図（source が rules のもの）は、開いたときに1度だけ作り直す
    const RM_BUILD_VERSION = 2;
    const RM_LAYOUT_STYLE = 3; // 四角の大きさを変えたら上げる（前の大きさで並べた図は自動で並べ直す）
    const RM_COL_GAP = 80, RM_ROW_GAP = 28;
    // 列のすき間は、通る線（縦の線）の本数に合わせて広げる（少ないと狭く、多いと広く。2026-10-07.16）
    const RM_COL_GAP_MIN = 72, RM_COL_GAP_MAX = 170, RM_COL_GAP_PER_LINE = 9, RM_COL_GAP_BASE = 56;
    const RM_MAX_NODES = 70, RM_MAX_EDGES = 160, RM_TEXT_MAX = 120, RM_UNDO_MAX = 40;
    const RM_BRIDGE_R = 6;
    // 図の地の色（画面）。白い四角が浮き出て見えるよう、ごく薄い色にする（印刷・画像は白）
    const RM_PAPER = '#F5F3EE';
    // 予測（起こるおそれ）の流れは薄い色にして、今ある事実の流れを目立たせる（利用者が選んだ案。2026-10-06.20）
    const RM_PRED_LINE = '#A8A29E', RM_PRED_TEXT = '#6B655C';

    // ---- 文字の折り返し ----
    function rmCharWidth(ch) { return /[\u0000-\u00ff\uff61-\uff9f]/.test(ch) ? 0.56 : 1; }
    function rmWrapText(text, maxEm = 13, maxLines = 6) {
      const lines = [];
      String(text || '').split(/\n/).forEach(para => {
        let cur = '', w = 0;
        for (const ch of Array.from(para)) {
          const cw = rmCharWidth(ch);
          // 行の頭に閉じかっこ・句読点だけが来ないようにする（「（PaCO2 58 → 55Torr↑」の次の行が「）」だけになっていた）
          if (w + cw > maxEm && cur && !/[)）」』、。，．・ー↑↓]/.test(ch)) {
            // 行の終わりに開きかっこだけが残らないようにする（「消化管運動機能障害（」で改行していた）
            const open = /[(（「『]$/.test(cur) && cur.length > 1 ? cur.slice(-1) : '';
            lines.push(open ? cur.slice(0, -1) : cur); cur = open; w = open ? rmCharWidth(open) : 0;
          }
          cur += ch; w += cw;
        }
        lines.push(cur);
      });
      if (lines.length > maxLines) {
        const kept = lines.slice(0, maxLines);
        kept[maxLines - 1] = kept[maxLines - 1].replace(/.$/, '') + '…';
        return kept;
      }
      return lines.length ? lines : [''];
    }
    function rmShorten(text, max = 46) {
      let t = String(text || '').replace(/\s+/g, ' ').trim();
      if (t.length <= max) return t;
      // 長いときは、まず後ろのかっこ書き（「(BMI 28.4)」「（場面：…）」など）から外す。途中で「…」と切れて
      // 読めない四角が出ていた（長文事例のテスト：「2型糖尿病(…)、肥満(BM…」「腹腔ドレーン(淡血性…)、…」）
      for (let k = 0; k < 6 && t.length > max; k++) {
        const m = [...t.matchAll(/[(（][^()（）]{1,40}[)）]/g)].pop();
        if (!m) break;
        t = (t.slice(0, m.index) + t.slice(m.index + m[0].length)).replace(/\s{2,}/g, ' ').trim();
      }
      if (t.length <= max) return t;
      // それでも長ければ、区切り（、。）の所で切る
      const cut = t.slice(0, max - 1);
      const at = Math.max(cut.lastIndexOf('、'), cut.lastIndexOf('。'));
      return (at >= max * 0.5 ? cut.slice(0, at) : cut) + '…';
    }
    function rmNewId(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }
    function rmSafeId(id) { return /^[\w.:-]{1,80}$/.test(String(id || '')) ? String(id) : null; }
    function rmType(n) { return RM_TYPE_BY_KEY.get(n && n.type) || RM_TYPE_BY_KEY.get('pathophysiology'); }
    // 画面に出す文字（検査データは（ ）で囲む・看護問題は #番号 を付ける）
    function rmDisplayLabel(n) {
      const t = rmType(n);
      let s = String(n.label || '');
      if (t.paren && !/^[（(]/.test(s)) s = `（${s}）`;
      if (n.type === 'nursing_problem') s = `#${n.priority || '?'} ${s}`;
      return s;
    }
    function rmNodeSize(n) {
      const t = rmType(n);
      const ell = t.shape === 'ellipse';
      const lines = rmWrapText(rmDisplayLabel(n), ell ? 11 : 12.5);
      const w = ell ? RM_ELLIPSE_W : RM_RECT_W;
      // 看護問題の補足は、小さい字で名前の下に（字が小さいぶん1行に多く入る）
      const noteLines = n.type === 'nursing_problem' && n.note ? rmWrapText(n.note, 15, 4) : [];
      const h = RM_PAD * 2 + RM_HEAD_H + lines.length * RM_LINE_H + (ell ? 16 : 0) + (noteLines.length ? RM_NOTE_GAP + noteLines.length * RM_NOTE_LINE_H : 0);
      return { w, h, lines, noteLines };
    }

    // 臨床情報は描画用の型と分け、旧版の observed/source も保持する。
    const RM_STATUSES = { observed: '記録された事実', reported: '患者さんから得た情報', assessed: 'アセスメント', inferred: '推論・補足', predicted: '今後の予測', planned: '予定' };
    const RM_CERTAINTIES = { confirmed: '確認済み', probable: '可能性が高い', possible: '可能性がある', uncertain: '未確認' };
    function rmEpistemicStatus(n) {
      if (n.type === 'future_risk') return 'predicted';
      if (n.source === 'knowledge' || n.added) return 'inferred';
      if (Object.hasOwn(RM_STATUSES, n.epistemicStatus)) return n.epistemicStatus;
      if (n.observed === false) return 'predicted';
      return n.type === 'assessment' ? 'assessed' : 'observed';
    }
    function rmClinicalFields(n) {
      const epistemicStatus = rmEpistemicStatus(n);
      const fields = { epistemicStatus, certainty: Object.hasOwn(RM_CERTAINTIES, n.certainty) ? n.certainty : 'uncertain', origin: ['manual', 'rule', 'import', 'ai', 'migration'].includes(n.origin) ? n.origin : n.source === 'user' ? 'manual' : n.source === 'ai' ? 'ai' : n.source === 'knowledge' ? 'rule' : 'import' };
      if (typeof n.effectiveTime === 'string') fields.effectiveTime = n.effectiveTime.slice(0, 80);
      if (typeof n.ruleVersion === 'string') fields.ruleVersion = n.ruleVersion.slice(0, 40);
      if (Array.isArray(n.sourceRefs)) fields.sourceRefs = n.sourceRefs.filter(r => r && ['card', 'assessment'].includes(r.sourceType) && rmSafeId(r.sourceId) && typeof r.patientId === 'string').slice(0, 40).map(r => ({ sourceType: r.sourceType, sourceId: r.sourceId, patientId: r.patientId.slice(0, 120) }));
      if (n.observation && typeof n.observation === 'object') {
        const o = n.observation;
        fields.observation = { name: String(o.name || '').slice(0, 80), value: typeof o.value === 'number' && Number.isFinite(o.value) ? o.value : String(o.value == null ? '' : o.value).slice(0, 80), unit: String(o.unit || '').slice(0, 40) };
      }
      if (n.type === 'medication') fields.medication = { name: String(n.medication?.name || n.label || '').slice(0, 120), eventType: ['order', 'administered', 'reported', 'stopped', 'unknown'].includes(n.medication?.eventType) ? n.medication.eventType : 'unknown' };
      return fields;
    }
    function rmPrepareClinicalMap(map, cp) {
      if (!map) return map;
      map.schemaVersion = '1.0.0';
      if (cp && cp.id) map.patientId = cp.id;
      map.nodes.forEach(n => {
        if (!n.origin && map.source === 'rules') { n.origin = 'rule'; n.ruleVersion = String(map.buildVersion || RM_BUILD_VERSION); }
        Object.assign(n, rmClinicalFields(n));
        if (!n.sourceRefs && map.patientId) n.sourceRefs = (n.itemIds || []).map(id => ({ sourceType: 'card', sourceId: id, patientId: map.patientId }));
      });
      return map;
    }
    // 支持・因果の根拠だけをたどる。反証、関連、時間順序は根拠へ変換しない。
    function findRelationEvidence(map, problemId, cp) {
      const byId = new Map((map?.nodes || []).map(n => [n.id, n]));
      const seen = new Set(), stack = [problemId], refs = new Map();
      const relations = new Set(['supports', 'causes', 'contributes_to', 'results_in', 'manifests_as', 'interpreted_as', 'predicts', 'increases_risk_of', 'may_contribute_to', 'improves', 'worsens']);
      const cards = cp ? new Set((cp.items || []).map(i => i.id)) : null;
      while (stack.length) {
        const id = stack.pop();
        if (seen.has(id)) continue;
        seen.add(id);
        const n = byId.get(id);
        if (!n) continue;
        if (id !== problemId && !['inferred', 'predicted', 'planned'].includes(rmEpistemicStatus(n))) {
          const sources = n.sourceRefs || (n.itemIds || []).map(sourceId => ({ sourceType: 'card', sourceId, patientId: map.patientId || cp?.id || '' }));
          sources.forEach(r => {
            if ((cp && r.patientId !== cp.id) || (map.patientId && r.patientId !== map.patientId) || (r.sourceType === 'card' && cards && !cards.has(r.sourceId))) return;
            refs.set(`${r.sourceType}:${r.sourceId}`, { ...r });
          });
        }
        (map.edges || []).forEach(e => { if (e.target === id && relations.has(e.relation)) stack.push(e.source); });
      }
      return { nodeIds: [...seen].filter(id => byId.has(id)), sourceRefs: [...refs.values()] };
    }

    // 独立した取り込み。記録にない投与状態や因果関係は作らない。
    function rmImportClinicalEntities(map, cp, { includeUnlinked = true } = {}) {
      const items = (cp.items || []).filter(i => i && i.id && i.text && !i.aiSuggested && i.type !== 'unnecessary');
      const add = n => {
        if (map.nodes.length >= RM_MAX_NODES) return null;
        n.x = 30; n.y = 30 + map.nodes.length * 100;
        map.nodes.push(n);
        return n;
      };
      map.nodes.forEach(n => {
        if (!n.effectiveTime) { const i = items.find(i => (n.itemIds || []).includes(i.id)); if (i?.timestamp) n.effectiveTime = String(i.timestamp).slice(0, 80); }
        if (n.type === 'treatment' && typeof findDrugsInText === 'function') {
          const drugs = findDrugsInText(n.label);
          if (drugs.length && !/手術|カテーテル|ドレーン|酸素投与|挿管/.test(n.label)) {
            n.type = 'medication';
            n.medication = { name: drugs.map(d => d.term).join('・'), eventType: 'unknown' };
          }
        }
      });
      items.forEach(i => {
        if (!includeUnlinked) return;
        if (typeof findDrugsInText !== 'function') return;
        findDrugsInText(i.text).forEach(({ drug, term }) => {
          // 薬名の近くの記録だけで状態を判定。他の薬の投与記録を流用しない。
          const text = String(i.text).normalize('NFKC'), at = text.indexOf(term);
          const local = at < 0 ? '' : text.slice(at, at + term.length + 24).split(/[。\n、]/)[0];
          const eventType = /中止/.test(local) ? 'stopped' : /予定|処方|指示/.test(local) ? 'order' : /投与済|投与した|内服した|服用した/.test(local) ? 'administered' : i.type === 's' ? 'reported' : 'unknown';
          if (map.nodes.some(n => n.type === 'medication' && (n.itemIds || []).includes(i.id) && (n.medication?.name || n.label).includes(term))) return;
          add({ id: rmNewId('n'), type: 'medication', label: term, evidence: String(i.text).slice(0, 200), source: 'record', observed: eventType !== 'order', epistemicStatus: eventType === 'order' ? 'planned' : i.type === 's' ? 'reported' : 'observed', origin: 'import', priority: 0, itemIds: [i.id], ...(i.timestamp ? { effectiveTime: String(i.timestamp) } : {}), medication: { name: drug.name, eventType } });
        });
      });
      Object.entries(cp.myAssessments || {}).forEach(([needId, a]) => {
        if (!includeUnlinked || !a || !a.interpretation || map.nodes.some(n => (n.sourceRefs || []).some(r => r.sourceType === 'assessment' && r.sourceId === needId && r.patientId === cp.id))) return;
        const ids = (a.evidenceIds || []).filter(id => items.some(i => i.id === id));
        const n = add({ id: rmNewId('n'), type: 'assessment', label: String(a.interpretation).slice(0, RM_TEXT_MAX * 2), evidence: String(a.cause || '').slice(0, 200), source: 'user', observed: true, epistemicStatus: 'assessed', origin: 'import', priority: 0, itemIds: ids, sourceRefs: [{ sourceType: 'assessment', sourceId: needId, patientId: cp.id }, ...ids.map(sourceId => ({ sourceType: 'card', sourceId, patientId: cp.id }))] });
        if (!n) return;
        map.nodes.filter(x => x.id !== n.id && (x.itemIds || []).some(id => ids.includes(id)) && !['inferred', 'predicted', 'planned'].includes(rmEpistemicStatus(x))).forEach(x => {
          if (map.edges.length < RM_MAX_EDGES) map.edges.push({ id: rmNewId('e'), source: x.id, target: n.id, relation: 'supports', predicted: false, origin: 'import', evidence: '選択された根拠カード' });
        });
      });
      return rmPrepareClinicalMap(map, cp);
    }
    function relationMapTextHtml(map, cp) {
      const byId = new Map(map.nodes.map(n => [n.id, n]));
      const esc = escapeHtml;
      const events = { order: '処方・指示', administered: '投与済み', reported: '申告', stopped: '中止', unknown: '状態未確認' };
      return `<p>矢印の意味と根拠を一覧で確認できます。項目を選ぶと上の操作ボタンで編集できます。</p><ol>${map.nodes.map(n => `<li><button type="button" class="btn btn-outline" data-rm-action="select-node" data-node-id="${esc(n.id)}">${esc(rmType(n).label)}：${esc(rmDisplayLabel(n))}</button><p>${esc(RM_STATUSES[rmEpistemicStatus(n)])}／${esc(RM_CERTAINTIES[n.certainty] || '未確認')}${n.effectiveTime ? `／${esc(n.effectiveTime)}` : ''}${n.medication ? `／${esc(events[n.medication.eventType] || events.unknown)}` : ''}</p>${n.evidence ? `<p>根拠：${esc(n.evidence)}</p>` : ''}${(n.sourceRefs || []).length ? `<p>参照：${(n.sourceRefs || []).map(r => esc(`${r.sourceType}:${r.sourceId}`)).join('、')}</p>` : ''}${n.type === 'nursing_problem' ? `<p>根拠カード：${findRelationEvidence(map, n.id, cp).sourceRefs.map(r => esc(`${r.sourceType}:${r.sourceId}`)).join('、') || '根拠がありません'}</p>` : ''}</li>`).join('')}</ol><h3>矢印の意味</h3><ul>${map.edges.map(e => `<li><button type="button" class="btn btn-outline" data-rm-action="select-edge" data-edge-id="${esc(e.id)}">${esc(byId.get(e.source)?.label || '不明')} → ${esc(byId.get(e.target)?.label || '不明')}</button>：${esc(RM_RELATIONS.find(r => r.key === e.relation)?.label || '関連する')}${e.predicted ? '（予測）' : ''}${e.evidence ? `／${esc(e.evidence)}` : ''}</li>`).join('')}</ul>`;
    }

    // ---- 保存されている図を安全な形にそろえる（版1からの変換もここで行う） ----
    function normalizeRelationMap(raw) {
      if (!raw || typeof raw !== 'object' || !Array.isArray(raw.nodes)) return null;
      if (raw.schemaVersion && raw.schemaVersion !== '1.0.0') return null;
      const v1 = raw.version !== 2;
      const nodes = [];
      const seen = new Set();
      raw.nodes.slice(0, RM_MAX_NODES).forEach(n => {
        if (!n || typeof n !== 'object') return;
        let id = rmSafeId(n.id);
        if (!id || seen.has(id)) id = rmNewId('n');
        seen.add(id);
        let type = v1 ? (RM_V1_KIND[n.kind] || 'pathophysiology') : (RM_TYPE_BY_KEY.has(n.type) ? n.type : 'pathophysiology');
        let label = String((v1 ? n.text : n.label) == null ? '' : (v1 ? n.text : n.label)).slice(0, RM_TEXT_MAX * 2);
        let priority = Number.isFinite(Number(n.priority)) ? Number(n.priority) : 0;
        if (v1 && type === 'symptom' && /^(?:検査|バイタル)[:：]/.test(label)) { type = 'lab'; label = label.replace(/^(?:検査|バイタル)[:：]\s*/, ''); }
        if (type === 'nursing_problem') {
          const m = label.match(/^#\s*(\d+)\s*/);
          if (m) { if (!priority) priority = Number(m[1]); label = label.slice(m[0].length); }
        }
        nodes.push({
          id, type, label,
          ...rmClinicalFields({ ...n, type, label }),
          evidence: String(n.evidence || '').slice(0, 200),
          observed: v1 ? true : n.observed !== false,
          source: ['record', 'knowledge', 'user', 'plan', 'ai'].includes(n.source) ? n.source : (v1 ? 'user' : 'record'),
          added: !v1 && n.added === true,
          ...(typeof n.attachTo === 'string' && rmSafeId(n.attachTo) ? { attachTo: n.attachTo } : {}),
          ...(n.detached === true ? { detached: true } : {}),
          ...(type === 'nursing_problem' && typeof n.note === 'string' && n.note.trim() ? { note: n.note.trim().slice(0, RM_NOTE_MAX) } : {}),
          priority: type === 'nursing_problem' ? priority : 0,
          x: Number.isFinite(Number(n.x)) ? Number(n.x) : 0,
          y: Number.isFinite(Number(n.y)) ? Number(n.y) : 0,
          itemIds: Array.isArray(n.itemIds) ? n.itemIds.filter(x => rmSafeId(x)).slice(0, 20) : [],
          ...([0, 1, 2].includes(n.phase) ? { phase: n.phase } : {})
        });
      });
      const byId = new Map(nodes.map(n => [n.id, n]));
      nodes.forEach(n => { if (n.attachTo && !byId.has(n.attachTo)) delete n.attachTo; });
      const edges = [];
      const pairs = new Set();
      const rawEdges = v1 ? (Array.isArray(raw.links) ? raw.links.map(l => l && ({ source: l.from, target: l.to, predicted: !!l.dashed, relation: 'causes', evidence: l.label || '' })) : [])
        : (Array.isArray(raw.edges) ? raw.edges : []);
      rawEdges.slice(0, RM_MAX_EDGES * 2).forEach(e => {
        if (!e || !byId.has(e.source) || !byId.has(e.target) || e.source === e.target) return;
        let source = e.source, target = e.target, relation = RM_RELATION_KEYS.has(e.relation) ? e.relation : 'related_to';
        // 版1は「疾患 → 治療」で描いていた。版2は「治療 → 治療の対象」にする
        if (v1) {
          const a = byId.get(source), b = byId.get(target);
          if (['treatment', 'medication'].includes(b.type) && !['treatment', 'medication'].includes(a.type)) { source = b.id; target = a.id; relation = 'treats'; }
          else if (['treatment', 'medication'].includes(a.type) && b.type === 'disease') relation = 'treats';
        }
        const pk = `${source}>${target}:${relation}`;
        if (pairs.has(pk)) return;
        pairs.add(pk);
        const edgeId = rmSafeId(e.id);
        edges.push({ id: edgeId && !edges.some(x => x.id === edgeId) ? edgeId : rmNewId('e'), source, target, relation, predicted: !!e.predicted, certainty: Object.hasOwn(RM_CERTAINTIES, e.certainty) ? e.certainty : 'uncertain', origin: ['manual', 'rule', 'import', 'ai', 'migration'].includes(e.origin) ? e.origin : 'migration', evidence: String(e.evidence || '').slice(0, 200) });
      });
      const map = { version: 2, nodes, edges: edges.slice(0, RM_MAX_EDGES), bands: Array.isArray(raw.bands) && !v1 ? raw.bands.filter(b => b && Number.isFinite(b.y1) && Number.isFinite(b.y2)).slice(0, 12).map(b => ({ y1: b.y1, y2: b.y2, p: Number(b.p) || 0 })) : [], headers: Array.isArray(raw.headers) && !v1 ? raw.headers.filter(h => h && Number.isFinite(h.x1) && Number.isFinite(h.x2)).slice(0, 8).map(h => ({ x1: h.x1, x2: h.x2, label: String(h.label || '').slice(0, 30) })) : [],
        source: String(raw.source || 'manual'), layoutStyle: Number(raw.layoutStyle) || 1, buildVersion: Number(raw.buildVersion) || 0,
        ...(raw.addedStash && Array.isArray(raw.addedStash.nodes) && Array.isArray(raw.addedStash.edges) ? { addedStash: { nodes: raw.addedStash.nodes.slice(0, RM_MAX_NODES), edges: raw.addedStash.edges.slice(0, RM_MAX_EDGES), created: Array.isArray(raw.addedStash.created) ? raw.addedStash.created.slice(0, RM_MAX_EDGES) : [], positions: raw.addedStash.positions && typeof raw.addedStash.positions === 'object' ? raw.addedStash.positions : {}, bands: Array.isArray(raw.addedStash.bands) ? raw.addedStash.bands : [], headers: Array.isArray(raw.addedStash.headers) ? raw.addedStash.headers : [] } } : {}), createdAt: raw.createdAt || null, updatedAt: raw.updatedAt || null };
      rmRenumberProblems(map, { keepOrder: true });
      if (typeof raw.patientId === 'string') map.patientId = raw.patientId;
      rmPrepareClinicalMap(map);
      if (v1 && nodes.length) layoutRelationMap(map); // 版1の段の並びは版2の列の並びに直す
      return map;
    }
    // 看護問題の # を 1,2,3… の通し番号にそろえる（今の順を保つ）
    function rmRenumberProblems(map, { keepOrder = true } = {}) {
      const probs = map.nodes.filter(n => n.type === 'nursing_problem');
      probs.sort((a, b) => (keepOrder ? ((a.priority || 999) - (b.priority || 999)) : 0) || map.nodes.indexOf(a) - map.nodes.indexOf(b));
      probs.forEach((p, i) => { p.priority = i + 1; });
      return map;
    }

    // ---- 看護問題の分類（優先順位の目安）：生命・呼吸 → 循環 → 合併症（感染など） → 疼痛 → 栄養 → 安全 → 活動 → 睡眠 → 心理・社会 ----
    // 看護問題の種類（並べる目安・似た問題の見分け）。看護問題の名前は診断名（NANDA）に合わせず、患者の状態をそのまま
    // 書く（利用者の希望：2026-10-06.27）。看護計画・AI の名前（診断名でも、ふつうの言葉でも）に当たるように言葉を広く持つ
    // 看護問題の「補足」：名前（短い看護問題名）だけでは分かりにくいので、患者の状態をそのまま書いた説明を
    // 四角の名前の下に小さく添える（利用者の指摘「看護問題がわかりにくくなった。補足として今の説明を」：2026-10-07.1）
    const RM_PROBLEM_NOTES = {
      'ボディイメージ混乱': '体の変化を、まだ受け止めきれずにいる',
      '非効果的気道浄化': '痰をうまく出せず、気道に分泌物がたまっている',
      '術後呼吸器合併症リスク状態': '術後に無気肺・肺炎を起こすおそれがある',
      '非効果的呼吸パターン': '呼吸が浅く、十分に換気できていない',
      'ガス交換障害': '酸素を十分に取り込めず、息苦しさがある',
      '体液量過剰': '体に水分がたまり、むくみがある',
      '非効果的健康自主管理（塩分制限・内服の継続）': '塩分制限や内服を続けることが難しい',
      '血糖不安定リスク状態': '血糖が上がったり下がったりするおそれがある',
      '嚥下障害': 'うまく飲み込めず、むせがある',
      '誤嚥リスク状態': '誤嚥（食べ物・唾液が気管に入る）のおそれがある',
      '体液量不足（脱水）': '体の水分が足りず、脱水がある',
      '言語的コミュニケーション障害': '言葉で思いを伝えにくい',
      '出血リスク状態': '抗凝固薬で出血するおそれがある',
      '体液量不足リスク状態（利尿薬による過剰な利尿）': '利尿薬で水分が出すぎて、脱水になるおそれがある',
      '感染リスク状態': '創部や管から感染を起こすおそれがある',
      '急性疼痛（手術創部の侵襲）': '手術の傷の痛みがある',
      '消化管運動機能障害（術後の腸蠕動の低下）': '術後に腸の動きが弱まり、お腹が張っている',
      '消化管運動機能障害リスク状態（術後イレウス）': '術後イレウス（腸閉塞）を起こすおそれがある',
      '栄養摂取量不足（消化吸収の変化に関連した低栄養状態）': '胃の手術後で食べられる量が少なく、栄養が足りていない',
      '栄養摂取量不足': '食事が十分にとれず、栄養が足りていない',
      '皮膚組織統合性障害（糖尿病性足潰瘍）': '足の傷（潰瘍）があり、痛みを感じにくく治りにくい',
      '非効果的健康自主管理（食事療法・インスリン・受診の継続）': '食事・インスリン・通院を続けることが難しい',
      '家族の知識不足（食事の準備・飲酒への対応）': '家族が食事づくりや飲酒への対応をどうすればよいかわからない',
      '栄養摂取量不足（消化吸収の変化に関連）': '胃の手術後で食べられる量が少なく、栄養が足りなくなるおそれがある',
      '静脈血栓塞栓症リスク状態（深部静脈血栓症・肺塞栓症）': '足の静脈に血栓ができ、肺塞栓を起こすおそれがある',
      '急性混乱（術後せん妄）': '術後せん妄があり、混乱している',
      '急性混乱リスク状態（術後せん妄）': '術後せん妄を起こすおそれがある',
      'セルフケア不足（活動制限・体力の低下）': '身の回りのこと（清潔・着替えなど）を自分でできない',
      '活動耐性低下（動くと息切れ・体力の低下）': '動くと息切れ・疲れが強く、活動を続けられない',
      '身体可動性障害': '自分で体を動かす・歩くことが難しい',
      '皮膚統合性障害（褥瘡）': '褥瘡（床ずれ）ができている',
      '褥瘡のリスク状態': '褥瘡（床ずれ）ができるおそれがある',
      '転倒転落リスク状態': '転倒・転落の危険性がある',
      '人工骨頭脱臼のリスク（術後の股関節の動き）': '人工骨頭が脱臼するおそれがある',
      '便秘': '便秘がある',
      '排尿障害（尿閉）': '尿を自分で出せない（尿閉）',
      '悪心': '吐き気がある',
      '睡眠パターン混乱': '夜によく眠れていない',
      '家族の不安（退院後の生活の変化に関連）': '家族が退院後の生活に不安を持っている',
      '知識不足（治療・退院後の生活）': '治療や退院後の生活について、わからないことがある'
    };
    // ---- 看護理論・ライフサイクル・発達課題・障害受容（利用者の要望：2026-10-07.2） ----
    // エリクソンの心理社会的発達段階と、ハヴィガーストの発達課題（その時期の主なもの）
    const RM_LIFE_STAGES = [
      { max: 1, stage: '乳児期', crisis: '基本的信頼 対 不信', task: '養育者との信頼関係' },
      { max: 3, stage: '幼児前期', crisis: '自律性 対 恥・疑惑', task: '排泄・食事などの身辺の自立' },
      { max: 6, stage: '幼児後期', crisis: '自主性 対 罪悪感', task: '遊びを通した自発性・言葉の発達' },
      { max: 12, stage: '学童期', crisis: '勤勉性 対 劣等感', task: '学校生活・友人関係・学習の習慣' },
      { max: 22, stage: '青年期', crisis: '同一性 対 同一性の混乱', task: '自分らしさの確立・進路の選択' },
      { max: 39, stage: '成人前期', crisis: '親密性 対 孤立', task: '仕事に就く・家庭を築く' },
      { max: 64, stage: '壮年期', crisis: '生殖性 対 停滞', task: '仕事・家庭での責任を果たす・次の世代を育てる' },
      { max: 200, stage: '老年期', crisis: '統合 対 絶望', task: '体力・健康の衰えや退職・配偶者との死別に適応し、人生を受け入れる' }
    ];
    function rmLifeStage(age) { return Number.isFinite(age) && age >= 0 ? RM_LIFE_STAGES.find(s => age <= s.max) : null; }
    // 障害受容の段階（コーンの5段階。フィンクの危機モデルとの対応）。本人の言葉から、いちばん当てはまる段階を選ぶ。
    // 段階は行ったり来たりするので「今の言動から見た段階」として示す
    const RM_ACCEPT_STAGES = [
      { key: 'adapt', stage: '適応期', fink: '適応', re: /受け入れ|この体で|付き合っていく|付き合っていこう|工夫して|できることを増や|今の自分で/ },
      { key: 'defense', stage: '防衛期', fink: '承認', re: /できることは自分で|自分でやりたい|リハビリを?頑張|練習したい|少しずつでも/ },
      { key: 'grief', stage: '悲嘆期', fink: '防御的退行', re: /もうだめ|情けない|役に立たない|こんな体|見ようとし(?:ない|ません)|見ようとせず|触ろうとし(?:ない|ません)|人前に出られない|どうして(?:私|自分|俺)|なぜ(?:私|自分|俺)|生きていても|落ち込|涙|泣い|迷惑ばかり/ },
      { key: 'hope', stage: '回復への期待期', fink: '防御的退行', re: /元に戻る|元通り|また歩ける|すぐ(?:に)?(?:良く|よく)なる|治ったら|治るはず|戻るはず|前みたいに/ },
      { key: 'shock', stage: 'ショック期', fink: '衝撃', re: /信じられない|実感がない|夢みたい|何が起き|頭が真っ白/ }
    ];
    // 後天的な障害・体の大きな変化（障害受容の過程が始まるもの）
    const RM_DISABILITY_RE = /片麻痺|対麻痺|四肢麻痺|麻痺|失語|切断|人工肛門|ストーマ|ストマ|脊髄損傷|失明|視力を失|喉頭摘出|透析導入|永久気管孔/;
    // 本人の役割（ロイ適応モデルの「役割機能」）
    const RM_ROLE_RE = /仕事|職場|復職|会社|店を|自営|農業|畑|家事|主婦|孫の世話|介護して|世話をして|自治会|役員|大学|高校|中学|学校|学業|部活/;

    // 補足の引き当て（看護計画から来た名前は半角かっこ・空白ちがいでも同じ名前として扱う）
    const rmNoteKey = l => String(l || '').normalize('NFKC').replace(/\s+/g, '');
    const RM_PROBLEM_NOTE_BY_KEY = new Map(Object.entries(RM_PROBLEM_NOTES).map(([k, v]) => [rmNoteKey(k), v]));
    function rmPlainNote(label) { return RM_PROBLEM_NOTE_BY_KEY.get(rmNoteKey(label)) || ''; }
    const RM_PROBLEM_CATEGORIES = [
      { key: 'resp', rank: 1, re: /気道|呼吸|ガス交換|換気|無気肺|肺炎|肺合併症|誤嚥|窒息|排痰|痰|息苦し|酸素を十分/ },
      { key: 'circ', rank: 2, re: /心拍出|循環|出血|ショック|体液量|組織灌流|不整脈|血栓|塞栓|神経血管|脱水|水分がたまり|むくみ|浮腫/ },
      { key: 'inf', rank: 3, re: /感染/ },
      { key: 'skin', rank: 3.5, re: /皮膚|褥瘡|床ずれ|血糖/ },
      { key: 'pain', rank: 4, re: /疼痛|痛/ },
      { key: 'disloc', rank: 4.6, re: /脱臼/ },
      { key: 'fall', rank: 4.5, re: /転倒|転落|せん妄|急性混乱|身体損傷/ }, // 安全（せん妄・転倒）は疼痛の次、栄養より前
      { key: 'nutr', rank: 5, re: /栄養|摂取|嚥下|飲み込|悪心|嘔気|吐き気|食事が/ },
      { key: 'act', rank: 7, re: /セルフケア|活動|可動性|ADL|移動|入浴|身の回り|体を動かす|歩く|歩行/ },
      { key: 'elim', rank: 7.5, re: /排泄|排便|排尿|便秘|消化管|腸|お腹|イレウス|尿/ },
      { key: 'sleep', rank: 8, re: /睡眠|眠れ/ },
      { key: 'mgmt', rank: 8.5, re: /健康管理|健康自主管理|自己管理|服薬|治療計画|内服|塩分制限/ },
      { key: 'comm', rank: 8.2, re: /コミュニケーション|言語|言葉で/ },
      { key: 'anx', rank: 9, re: /不安|恐怖|心理|ボディイメージ|知識|コーピング|役割|家族|わからない/ }
    ];

    // 看護問題の言葉ごとに、根拠になりやすい記録の言葉（看護計画の看護問題が、ひな形に無いときに使う）
    const RM_PROBLEM_EVIDENCE = {
      act: /歩行|歩け|移動|車椅子|車いす|ベッド上|安静|臥床|筋力|ADL|介助|立位|座位|起き上が|麻痺|骨折|リハビリ|MMT|ふらつ|動け|寝返り/,
      fall: /転倒|転落|ふらつ|せん妄|夜間.{0,6}トイレ|つまず|見当識/,
      disloc: /脱臼|人工骨頭|人工股関節|股関節|内転|内旋/,
      pain: /痛|NRS|VAS/,
      nutr: /食事|摂取|食欲|体重|Alb|アルブミン|嚥下|むせ|残食/,
      sleep: /眠|睡眠|不眠|中途覚醒/,
      elim: /排便|排尿|便秘|尿|ガス/,
      anx: /不安|心配|怖|恐|落ち込|眠れない/,
      resp: /呼吸|SpO2|痰|咳|息切れ|息苦し|喘鳴/,
      circ: /血圧|脈拍|浮腫|むくみ|出血|Hb|尿量/,
      inf: /発熱|体温|WBC|CRP|創|ドレーン|カテーテル/,
      skin: /皮膚|発赤|褥瘡|浮腫|ブレーデン|乾燥/,
      mgmt: /服薬|飲み忘れ|自己管理|塩分|指導|理解|知識/,
      comm: /言葉|話せ|失語|構音|聞こえ/
    };
    // 看護計画の看護問題と記録の間に入れる病態（＋補足。記録から看護問題へいきなり矢印を引かないため）
    const RM_PROBLEM_MECHANISM = {
      act: '安静・痛み・筋力低下で体を動かしにくい',
      disloc: '術後しばらくは股関節が外れやすい姿勢がある',
      fall: 'ふらつき・筋力低下・注意力の低下で転びやすい',
      pain: '組織の損傷・炎症で痛みが続く',
      nutr: '必要な量の栄養・水分を取れない',
      sleep: '症状・環境の変化で眠りが妨げられる',
      elim: '活動量の低下・治療の影響で排泄の働きが変わる',
      anx: '病気・治療・今後の生活の見通しが立たない',
      resp: '呼吸の働き・痰を出す力の低下',
      circ: '心臓・血管の働きの変化で循環が不安定',
      inf: '体を守る働きの低下・細菌の入り口がある',
      skin: '圧迫・湿潤・栄養低下で皮膚が弱くなる',
      mgmt: '病気・治療の理解や生活の調整が難しい',
      comm: '思いや必要なことを伝えにくい'
    };
    // 看護問題の名前の頭に付いた番号（「#2」「2.」「2）」「①」など）を外す（「#3 2. 身体可動性障害」のように番号が重ならないように）
    function rmCleanProblemLabel(label) {
      let t = String(label || '').trim().replace(/^[①-⑳]\s*/, '').normalize('NFKC').trim();
      for (let k = 0; k < 3; k++) t = t.replace(/^(?:#\s*\d+|看護問題\s*\d*|\d+\s*[.、):]|\(\d+\)|[①-⑳])\s*/, '').trim();
      return t;
    }
    // 似た看護問題を見分ける鍵（同じ種類・同じ「リスク／今ある」。活動は 移動／セルフケア／活動耐性 に分ける）
    function rmProblemSimKey(label) {
      const lb = String(label || ''), c = rmProblemCategory(lb).key;
      if (c === 'other') return null;
      const sub = c === 'act' ? (/セルフケア|入浴|更衣|整容|排泄の自立|身の回り|清潔|着替え/.test(lb) ? 'self' : /活動耐性|耐久|活動を続け|疲れ/.test(lb) ? 'tol' : 'mob') : '';
      return `${c}${sub}|${/リスク|可能性|おそれ|危険/.test(lb) ? 'r' : 'a'}`;
    }
    function rmProblemCategory(label) { return RM_PROBLEM_CATEGORIES.find(c => c.re.test(String(label || ''))) || { key: 'other', rank: 8.5 }; }

    // ---- 並べ方：列（左→右の因果の深さ）と、列の中の上下（重要な看護問題の流れほど上）を決める ----
    function rmFlowEdges(map) {
      // 治療は「治療の対象」と同じ列（対象のすぐ下）に置く。以前は対象の右に置いていたが、治療 → 対象 の矢印が
      // 左向きになり、利用者から「左向きの矢印では（時間を）さかのぼれない」との声があった（2026-10-06.18）。
      // 並べるときは「対象 → 治療」の流れとして扱い、深さは同じ（+0）にする（treat: true）。
      return map.edges.map(e => e.relation === 'treats' ? { from: e.target, to: e.source, treat: true } : { from: e.source, to: e.target });
    }
    const RM_ATTACH_GAP = 0; // 検査データは親の四角にぴったりくっつける
    // 【横長を抑える】1本道の流れ（A→B だけでつながり、B へ入る矢印が A からだけ）は、同じ列に縦に積む（下向きの矢印）。
    // 1つの列に積むのは3つまで。矢印を通すため、積んだ四角の間は少し空ける。
    const RM_STACK_MAX = 3, RM_STACK_GAP = 30;
    // くっつける検査データ：矢印が入って来ず、出る先（検査データ以外）がある。出る先が複数なら看護問題以外の最初の先
    function rmLabAttachments(map) {
      const byId = new Map(map.nodes.map(n => [n.id, n]));
      const res = new Map();
      map.nodes.forEach(n => {
        if (!['lab', 'vital'].includes(n.type) || n.detached || map.edges.some(e => e.target === n.id)) return;
        const outs = map.edges.filter(e => e.source === n.id && byId.has(e.target) && !['lab', 'vital'].includes(byId.get(e.target).type) && e.relation !== 'treats');
        if (!outs.length) return;
        const host = outs.find(e => byId.get(e.target).type !== 'nursing_problem') || outs[0];
        res.set(n.id, host.target);
      });
      return res;
    }
    // 【時系列】四角の元になったカードの日時から、時期を決める（0：入院前・既往・生活／1：発症・入院時・術前・手術当日／
    // 2：術後・入院2日目以降）。並べるときに、後の時期の四角が前の時期の治療より左に来ないようにする。分からなければ null。
    function rmPhaseOfItems(items) {
      let best = null;
      (items || []).forEach(i => {
        if (!i) return;
        const t = String(i.timestamp || '').normalize('NFKC');
        let p = null;
        if (/入院前|既往|生活歴|現病歴/.test(t) || i.admissionPhase === 'preadmission') p = 0;
        if (/入院時|術前|手術当日|術当日|入院当日|入院1日目|発症/.test(t)) p = 1;
        const m = t.match(/(?:入院|術後|病日)\s*(\d+)\s*日目|術後|POD\s*\d+/);
        if (m) p = /術後|POD/.test(m[0]) ? 2 : (Number(m[1]) >= 2 ? 2 : 1);
        if (p !== null && (best === null || p > best)) best = p;
      });
      return best;
    }
    // 並べ方：線の長さを整える（看護問題の手前へ寄せる）並べ方と、整えない並べ方の両方を試し、線の交差が少ない方を使う
    // （交差を減らすことをいちばんに、同じなら看護問題への線が短い方。関連図の評価のレイアウトの優先順位：2026-10-07.6）
    function layoutRelationMap(map) {
      if (!map || !map.nodes.length) return map;
      layoutRelationMapOnce(map, { balance: true });
      let plain = null;
      try { plain = JSON.parse(JSON.stringify(map)); layoutRelationMapOnce(plain, { balance: false }); } catch (e) { return map; }
      const cross = m => { try { return rmRouteEdges(m).bridges; } catch (e) { return Infinity; } };
      if (cross(plain) < cross(map)) {
        const pos = new Map(plain.nodes.map(n => [n.id, n]));
        map.nodes.forEach(n => { const q = pos.get(n.id); if (!q) return; n.x = q.x; n.y = q.y; if (q.attachTo) n.attachTo = q.attachTo; else delete n.attachTo; });
        Object.keys(plain).filter(k => !['nodes', 'edges'].includes(k)).forEach(k => { map[k] = plain[k]; });
      }
      return map;
    }
    function layoutRelationMapOnce(map, { balance = true } = {}) {
      if (!map || !map.nodes.length) return map;
      map.layoutStyle = RM_LAYOUT_STYLE;
      const byId = new Map(map.nodes.map(n => [n.id, n]));
      // 検査データは、根拠になる四角のすぐ下にくっつけて置く（別の列に離して置かない）
      const attach = rmLabAttachments(map);
      map.nodes.forEach(n => { if (attach.has(n.id)) n.attachTo = attach.get(n.id); else delete n.attachTo; });
      const hung = new Map(); // 親の四角 → くっつく検査データ
      attach.forEach((host, lab) => { if (!hung.has(host)) hung.set(host, []); hung.get(host).push(byId.get(lab)); });
      const blockH = n => rmNodeSize(n).h + (hung.get(n.id) || []).reduce((h, l) => h + rmNodeSize(l).h + RM_ATTACH_GAP, 0);
      const ids = map.nodes.filter(n => !attach.has(n.id)).map(n => n.id);
      // くっつけた検査データから出るほかの矢印（体温 → 不感蒸泄 など）は、くっついている親の四角から出るものとして並べる
      // （先の四角が親より左に置かれ、矢印が左向きになるのを防ぐ）
      const flows = rmFlowEdges(map).map(f => (attach.has(f.from) && !f.treat ? { ...f, from: attach.get(f.from) } : f))
        .filter(f => byId.has(f.from) && byId.has(f.to) && f.from !== f.to && !attach.has(f.from) && !attach.has(f.to));
      const out = new Map(ids.map(id => [id, []])), inn = new Map(ids.map(id => [id, []]));
      // 循環（A→B→A）は、深さを決めるときだけ無視する
      const state = new Map();
      const keep = [];
      const visit = id => {
        state.set(id, 1);
        flows.filter(f => f.from === id).forEach(f => {
          const s = state.get(f.to);
          if (s === 1) return; // 戻る矢印
          keep.push(f);
          if (!s) visit(f.to);
        });
        state.set(id, 2);
      };
      ids.filter(id => !flows.some(f => f.to === id)).concat(ids).forEach(id => { if (!state.get(id)) visit(id); });
      const uniq = new Set();
      const treatFlow = new Set(); // 「対象 → 治療」（同じ列に置く。深さを足さない）
      keep.forEach(f => { const k = `${f.from}>${f.to}`; if (f.treat) treatFlow.add(k); if (uniq.has(k)) return; uniq.add(k); out.get(f.from).push(f.to); inn.get(f.to).push(f.from); });
      const step = (p, id) => (treatFlow.has(`${p}>${id}`) ? 0 : 1);
      // 深さ（いちばん長い道のり）
      const hasFacts = map.nodes.some(n => n.type === 'patient_fact');
      const minRank = n => (n.type === 'patient_fact' || !hasFacts ? 0 : 1);
      const rank = new Map();
      const order = [];
      const indeg = new Map(ids.map(id => [id, inn.get(id).length]));
      const queue = ids.filter(id => !indeg.get(id));
      while (queue.length) { const id = queue.shift(); order.push(id); out.get(id).forEach(t => { indeg.set(t, indeg.get(t) - 1); if (!indeg.get(t)) queue.push(t); }); }
      ids.forEach(id => { if (!order.includes(id)) order.push(id); });
      order.forEach(id => {
        const n = byId.get(id);
        const r = Math.max(minRank(n), ...inn.get(id).map(p => (rank.get(p) ?? 0) + step(p, id)));
        rank.set(id, n.type === 'patient_fact' && !inn.get(id).length ? 0 : r);
      });
      // 矢印の入って来ない四角（検査データなど）は、つながる先のすぐ左に置く（遠くから長い線を引かない＝交差を減らす）
      const probIds = new Set(map.nodes.filter(n => n.type === 'nursing_problem').map(n => n.id));
      const maxNonProb = Math.max(0, ...ids.filter(id => !probIds.has(id)).map(id => rank.get(id)));
      [...order].reverse().forEach(id => {
        const n = byId.get(id);
        if (n.type === 'patient_fact' || n.type === 'nursing_problem' || inn.get(id).length || !out.get(id).length) return;
        const succ = Math.min(...out.get(id).map(t => (probIds.has(t) ? maxNonProb + 1 : rank.get(t))));
        if (succ - 1 > rank.get(id)) rank.set(id, succ - 1);
      });
      // 看護問題はいちばん右の列にまとめる
      const nonProb = ids.map(id => byId.get(id)).filter(n => n.type !== 'nursing_problem');
      let lastRank = (nonProb.length ? Math.max(...nonProb.map(n => rank.get(n.id))) : 0) + 1;
      ids.forEach(id => { if (byId.get(id).type === 'nursing_problem') rank.set(id, lastRank); });
      // その四角がつながる看護問題のうち、いちばん優先度の高い番号（＝上から並べる帯）
      const band = new Map();
      const bandOf = (id, seenSet = new Set()) => {
        if (band.has(id)) return band.get(id);
        if (seenSet.has(id)) return 999;
        seenSet.add(id);
        const n = byId.get(id);
        let b = n.type === 'nursing_problem' ? (n.priority || 999) : 999;
        out.get(id).forEach(t => { b = Math.min(b, bandOf(t, seenSet)); });
        band.set(id, b);
        return b;
      };
      ids.forEach(id => bandOf(id));
      // 【一体感】利用者から「関連図に一体感がない」との声（2026-10-06.18）。看護問題ごとの帯に分けて上から積むと、
      // 小さな図が何枚も重なって見えた。疾患と、半分以上の看護問題へつながる病態（手術侵襲など）を「幹」として
      // 図の上下のまん中に置き、幹から上下の看護問題の流れへ枝分かれさせる（原因は左から幹へ合流する）。
      // 帯の番号：看護問題の優先順位。幹は、上半分の看護問題と下半分の看護問題の間（例：#1〜#3 と #4〜#6 の間）
      const probPri = map.nodes.filter(n => n.type === 'nursing_problem').map(n => n.priority || 999).sort((a, b) => a - b);
      if (probPri.length >= 3) {
        const reach = new Map();
        const reachOf = (id, seenSet = new Set()) => {
          if (reach.has(id)) return reach.get(id);
          if (seenSet.has(id)) return new Set();
          seenSet.add(id);
          const r = new Set(byId.get(id).type === 'nursing_problem' ? [id] : []);
          out.get(id).forEach(t => reachOf(t, seenSet).forEach(x => r.add(x)));
          reach.set(id, r);
          return r;
        };
        ids.forEach(id => reachOf(id));
        const trunkVal = probPri[Math.ceil(probPri.length / 2) - 1] + 0.5;
        ids.forEach(id => {
          const n = byId.get(id);
          if (n.type === 'nursing_problem') return;
          if (n.type === 'disease' || reach.get(id).size * 2 >= probPri.length) band.set(id, trunkVal);
        });
      }
      // 看護問題へ流れの続かない治療（鎮痛薬 → 創部痛 など）は、治療の対象と同じ帯に置く
      map.edges.forEach(e => { if (e.relation === 'treats' && band.get(e.source) === 999 && band.has(e.target)) band.set(e.source, band.get(e.target)); });
      // 治療は対象のすぐ下に置くので、対象と同じ帯に入れる（帯が違うと、上下の矢印がほかの四角の上を通る）
      treatFlow.forEach(k => { const [t, tr] = k.split('>'); if (band.has(t) && byId.get(tr) && ['treatment', 'medication'].includes(byId.get(tr).type)) band.set(tr, band.get(t)); });
      // 【横長を抑える】利用者からの要望：「関連図が横長になりすぎている」。以前は因果の深さごとに1列にしていたため、
      // 1本道の長い流れ（「＋補足」をはさむと特に）で列が12〜18個になり、横に長くなっていた。1本道の続き
      // （A の矢印が B だけへ出て、B へ入る矢印が A からだけ。同じ看護問題の帯の中）は、A と同じ列の下に積む。
      // 背景（患者情報）・治療・看護問題は積まない。積んだまとまりを1つの四角として、列・並び順・高さを決め直す。
      const head = new Map(), members = new Map();
      const treatTargets = new Set([...treatFlow].map(k => k.split('>')[0]));
      const stackable = (u, v) => {
        const nu = byId.get(u), nv = byId.get(v);
        // 治療（楕円）は「治療」の列にまとめて見せるので積まない
        if (!nu || !nv || probIds.has(u) || probIds.has(v) || [nu.type, nv.type].some(t => ['patient_fact', 'treatment', 'medication'].includes(t))) return false;
        // 治療の対象になる四角の下には治療を置くので、その下へは積まない
        if (treatTargets.has(u)) return false;
        return out.get(u).length === 1 && inn.get(v).length === 1 && band.get(u) === band.get(v);
      };
      order.forEach(id => {
        const p = inn.get(id).length === 1 ? inn.get(id)[0] : null;
        if (p && head.has(p) && stackable(p, id)) {
          const h = head.get(p), mem = members.get(h);
          if (mem.length < RM_STACK_MAX && mem[mem.length - 1] === p) { mem.push(id); head.set(id, h); return; }
        }
        head.set(id, id); members.set(id, [id]);
      });
      const lastOf = h => members.get(h)[members.get(h).length - 1];
      const heads = ids.filter(id => head.get(id) === id);
      const sInn = new Map(heads.map(h => [h, [...new Set(inn.get(h).map(x => head.get(x)))].filter(x => x !== h)]));
      const sOut = new Map(heads.map(h => [h, [...new Set(out.get(lastOf(h)).map(x => head.get(x)))].filter(x => x !== h)]));
      const hr = new Map();
      // 積んだまとまり x から h へ：治療の対象 → 治療 の流れだけなら同じ列（+0）、ほかの矢印もあれば右の列（+1）
      const hstep = (x, h) => (members.get(x).some(m => out.get(m).includes(h) && !treatFlow.has(`${m}>${h}`)) ? 1 : members.get(x).some(m => treatFlow.has(`${m}>${h}`)) ? 0 : 1);
      const phaseOf = h => Math.max(-1, ...members.get(h).map(m => (Number.isInteger(byId.get(m).phase) ? byId.get(m).phase : -1)));
      const rankHeads = floorOf => {
        hr.clear();
        order.filter(id => head.get(id) === id && !probIds.has(id)).forEach(h => {
          const n = byId.get(h), ps = sInn.get(h).filter(x => !probIds.has(x));
          hr.set(h, n.type === 'patient_fact' && !ps.length ? 0 : Math.max(minRank(n), floorOf(h), ...ps.map(x => (hr.get(x) ?? 0) + hstep(x, h))));
        });
      };
      rankHeads(() => 0);
      // 【時系列】利用者からの要望：「時系列は気にするように」。術後・入院2日目以降の記録から作った四角は、
      // 治療（手術など）の列より右に置く（治療より前に起きたように見えないようにする）
      const treatRanks = heads.filter(h => !probIds.has(h) && ['treatment', 'medication'].includes(byId.get(h).type) && phaseOf(h) !== 2).map(h => hr.get(h));
      if (treatRanks.length) { const tr = Math.min(...treatRanks); rankHeads(h => (phaseOf(h) === 2 && !['treatment', 'medication'].includes(byId.get(h).type) ? tr + 1 : 0)); }
      const maxHr = Math.max(0, ...hr.values());
      [...order].reverse().forEach(h => {
        if (head.get(h) !== h || probIds.has(h)) return;
        const n = byId.get(h);
        if (n.type === 'patient_fact' || sInn.get(h).length || !sOut.get(h).length) return;
        if (members.get(h).some(m => treatTargets.has(m))) return; // 治療の対象は、治療と同じ列のまま
        const succ = Math.min(...sOut.get(h).map(t => (probIds.has(t) ? maxHr + 1 : hr.get(t))));
        if (succ - 1 > hr.get(h)) hr.set(h, succ - 1);
      });
      // 【線を短く】各まとまりを、入ってくる線と出ていく線の長さの合計がいちばん短くなる列（つながる先・元の列のまん中）へ動かす。
      // 前の列より左・次の列より右には動かさない（左向きの矢印を作らない）。看護問題の手前の「直接の原因・状態」が看護問題の近くへ寄り、
      // 中央から右端へ伸びる長い線が減る（関連図の評価：2026-10-07.6。右へ寄せるだけの方法は、線の合計が増えたので使わない）
      if (balance) {
        const lastR = Math.max(0, ...hr.values()) + 1;
        const rOf = t => (probIds.has(t) ? lastR : hr.get(t));
        for (let pass = 0; pass < 4; pass++) {
          let moved = false;
          [...order].reverse().forEach(h => {
            if (head.get(h) !== h || probIds.has(h)) return;
            if (members.get(h).some(m => ['patient_fact', 'disease'].includes(byId.get(m).type) || treatTargets.has(m))) return;
            const ins = sInn.get(h).filter(x => !probIds.has(x)), outs = sOut.get(h);
            if (!ins.length || !outs.length) return;
            const lo = Math.max(...ins.map(x => hr.get(x) + hstep(x, h)));
            const hi = Math.min(...outs.map(t => rOf(t) - hstep(h, t)));
            if (!(hi >= lo)) return;
            // 線の長さの合計が同じなら、看護問題へつながるまとまりは看護問題の近く（右）へ、それ以外は原因の近く（左）へ
            const toProb = outs.some(t => probIds.has(t));
            const cost = r => ins.reduce((c, x) => c + (r - hr.get(x)), 0) + outs.reduce((c, t) => c + (rOf(t) - r), 0) + (toProb ? (hi - r) : (r - lo)) * 0.01;
            let best = hr.get(h), bc = cost(best);
            for (let r = lo; r <= hi; r++) { const c = cost(r); if (c < bc - 1e-9) { bc = c; best = r; } }
            if (best !== hr.get(h)) { hr.set(h, best); moved = true; }
          });
          if (!moved) break;
        }
      }
      lastRank = Math.max(0, ...hr.values()) + 1;
      // 【看護問題の位置】いちばん右の列にそろえる（2026-10-06.16 で原因のすぐ右に置いたが、利用者から「前のほうがよかった」。
      // 右端にそろえ、重要なものほど上。見つけやすくするための「看護問題」の一覧は、ツールバーのボタンから開く）
      ids.forEach(id => rank.set(id, probIds.has(id) ? lastRank : hr.get(head.get(id))));
      const stackW = h => Math.max(...members.get(h).map(m => rmNodeSize(byId.get(m)).w));
      const stackH = h => members.get(h).reduce((sum, m) => sum + blockH(byId.get(m)), 0) + (members.get(h).length - 1) * RM_STACK_GAP;
      const cols = [];
      heads.forEach(id => { const r = rank.get(id); (cols[r] = cols[r] || []).push({ id, i: ids.indexOf(id) }); });
      for (let r = 0; r < cols.length; r++) cols[r] = cols[r] || [];
      const pos = new Map();
      const setPos = () => cols.forEach(c => c.forEach((e, k) => pos.set(e.id, k)));
      const sortCol = (c, nb, isProb) => {
        c.forEach(e => { const ps = nb(e.id).map(x => pos.get(x)).filter(v => v !== undefined); e.bary = ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : e.bary ?? e.i; });
        c.sort((a, b) => isProb ? (byId.get(a.id).priority - byId.get(b.id).priority) : ((band.get(a.id) - band.get(b.id)) || (a.bary - b.bary) || (a.i - b.i)));
      };
      cols.forEach(c => c.forEach(e => { e.bary = e.i; }));
      cols.forEach((c, r) => sortCol(c, () => [], r === lastRank));
      setPos();
      // 交差を減らす（左から・右からの並べ替えを数回）
      for (let it = 0; it < 4; it++) {
        for (let r = 1; r < cols.length; r++) { sortCol(cols[r], id => sInn.get(id), r === lastRank); setPos(); }
        for (let r = cols.length - 2; r >= 0; r--) { sortCol(cols[r], id => sOut.get(id), false); setPos(); }
      }
      // 治療（楕円）は、同じ列の「治療の対象」のすぐ下に置く（上向きの短い矢印になる）
      cols.forEach(c => {
        const tr = c.filter(e => ['treatment', 'medication'].includes(byId.get(e.id).type) && members.get(e.id).length === 1);
        tr.forEach(e => {
          const tgtHeads = [...treatFlow].filter(k => k.endsWith(`>${e.id}`)).map(k => head.get(k.split('>')[0]));
          const k0 = c.findIndex(x => tgtHeads.includes(x.id));
          if (k0 < 0) return;
          c.splice(c.indexOf(e), 1);
          let k = c.findIndex(x => tgtHeads.includes(x.id));
          while (k + 1 < c.length && ['treatment', 'medication'].includes(byId.get(c[k + 1].id).type) && tr.includes(c[k + 1])) k++;
          c.splice(k + 1, 0, e);
        });
      });
      setPos();
      // x：列ごとに、いちばん幅の広い四角に合わせる
      const colX = [];
      let x = 0;
      const rankOf = new Map();
      cols.forEach((c, r) => c.forEach(e => members.get(e.id).forEach(m => rankOf.set(m, r))));
      const gapAfter = r => {
        const outs = new Set(), ins = new Set();
        map.edges.forEach(e => {
          const a = rankOf.get(e.source), b = rankOf.get(e.target);
          if (a === undefined || b === undefined || a >= b) return;
          if (a === r) outs.add(e.source);
          if (b === r + 1) ins.add(e.target);
        });
        return Math.max(RM_COL_GAP_MIN, Math.min(RM_COL_GAP_MAX, RM_COL_GAP_BASE + RM_COL_GAP_PER_LINE * (outs.size + ins.size)));
      };
      cols.forEach((c, r) => {
        colX[r] = x;
        const w = c.length ? Math.max(...c.map(e => stackW(e.id))) : RM_RECT_W;
        c.forEach(e => members.get(e.id).forEach(m => { const n = byId.get(m); n.x = Math.round(x + (w - rmNodeSize(n).w) / 2); }));
        x += w + gapAfter(r);
      });
      // y：看護問題ごとの「帯」に分けて上から並べる（#1 の流れがいちばん上の帯、#2 がその下…）。
      // それぞれの四角は、つながる看護問題のうち優先度のいちばん高い帯に入る（複数の問題に効く四角は上の帯）。
      // 帯の中では列ごとに縦に積み、帯の高さの中央にそろえる（その問題の流れが1つの行に並び、根拠を左へたどりやすい）。
      const bands = [...new Set(ids.map(id => band.get(id)))].sort((p, q) => p - q);
      let top = 0;
      const stripes = [];
      bands.forEach(bv => {
        const perCol = cols.map(c => c.filter(e => band.get(e.id) === bv));
        const colH = perCol.map(c => c.reduce((h, e) => h + stackH(e.id), 0) + Math.max(0, c.length - 1) * RM_ROW_GAP);
        const bandH = Math.max(0, ...colH);
        perCol.forEach((c, r) => {
          let y = top + (bandH - colH[r]) / 2;
          c.forEach(e => { members.get(e.id).forEach((m, k) => { const n = byId.get(m); if (k) y += RM_STACK_GAP; n.y = Math.round(y); y += blockH(n); }); y += RM_ROW_GAP; });
        });
        if (bandH > 0) { stripes.push({ y1: top - RM_ROW_GAP * 0.9, y2: top + bandH + RM_ROW_GAP * 0.9, p: bv }); top += bandH + RM_ROW_GAP * 2; }
      });
      // 【看護問題の高さ】利用者から「看護問題は上から順に並べなくてよい（#番号があるから）」（2026-10-06.25）。
      // 右端の看護問題は、つながる原因の四角の高さのまん中に置く（線がまっすぐ短くなる）。重なるときは下へずらす
      const probCol = (cols[lastRank] || []).map(e => byId.get(e.id)).filter(n => n && n.type === 'nursing_problem');
      if (probCol.length) {
        const cyOf = n => n.y + rmNodeSize(n).h / 2;
        const want = new Map(probCol.map(p => {
          const ps = map.edges.filter(e => e.target === p.id).map(e => byId.get(e.source)).filter(n => n && !attach.has(n.id) && n.type !== 'nursing_problem');
          return [p.id, ps.length ? ps.reduce((sum, n) => sum + cyOf(n), 0) / ps.length - rmNodeSize(p).h / 2 : p.y];
        }));
        probCol.sort((a, b) => want.get(a.id) - want.get(b.id) || a.priority - b.priority);
        let bottom = -Infinity;
        probCol.forEach(p => { p.y = Math.round(Math.max(want.get(p.id), bottom + RM_ROW_GAP)); bottom = p.y + blockH(p); });
      }
      // くっつける検査データの位置：親の四角の真下（すき間なし）に、上から順に重ねる
      hung.forEach((labs, hostId) => {
        const host = byId.get(hostId), hs = rmNodeSize(host);
        let y = host.y + hs.h + RM_ATTACH_GAP;
        labs.forEach(l => { const ls = rmNodeSize(l); l.x = Math.round(host.x + (hs.w - ls.w) / 2); l.y = Math.round(y); y += ls.h + RM_ATTACH_GAP; });
      });
      const minY = Math.min(...map.nodes.map(n => n.y));
      map.nodes.forEach(n => { n.y = Math.round(n.y - minY); });
      // 看護問題ごとの帯（背景に薄い色を交互に付け、どの流れがどの看護問題のものかを見分けやすくする）
      // 看護問題ごとの帯の背景色は付けない（図が横に切れて見え、一体感がなくなるため。2026-10-06.18）
      map.bands = [];
      // 列の見出し（生活背景・疾患・治療・治療後・看護問題）は、利用者からの要望で出さない（列にとらわれず、時系列と因果で並べる）
      map.headers = [];
      return map;
    }

    // ---- 線の道筋（直角に曲げる）と飛び越え ----
    function rmRect(n) { const s = rmNodeSize(n); return { x1: n.x, y1: n.y, x2: n.x + s.w, y2: n.y + s.h, cx: n.x + s.w / 2, cy: n.y + s.h / 2, w: s.w, h: s.h }; }
    function rmHitsRects(seg, rects, skip) {
      let c = 0;
      rects.forEach(r => {
        if (skip.has(r.id)) return;
        if (seg.y !== undefined) { if (seg.y > r.y1 && seg.y < r.y2 && Math.max(seg.a, seg.b) > r.x1 && Math.min(seg.a, seg.b) < r.x2) c++; }
        else if (seg.x > r.x1 && seg.x < r.x2 && Math.max(seg.a, seg.b) > r.y1 && Math.min(seg.a, seg.b) < r.y2) c++;
      });
      return c;
    }
    function rmRouteEdges(map) {
      const byId = new Map(map.nodes.map(n => [n.id, n]));
      const rects = map.nodes.map(n => ({ id: n.id, ...rmRect(n) }));
      const rectById = new Map(rects.map(r => [r.id, r]));
      const routes = [];
      // 列のすき間（縦の線を通す所）。四角の左右の端から求める
      const cols = [];
      rects.slice().sort((p, q) => p.x1 - q.x1).forEach(r => {
        const c = cols.find(c => r.x1 < c.x2 - 4 && r.x2 > c.x1 + 4);
        if (c) { c.x1 = Math.min(c.x1, r.x1); c.x2 = Math.max(c.x2, r.x2); } else cols.push({ x1: r.x1, x2: r.x2 });
      });
      cols.sort((p, q) => p.x1 - q.x1);
      const gapRight = x => { const k = cols.findIndex(c => c.x1 >= x - 1); return k > 0 ? { key: k, x1: cols[k - 1].x2, x2: cols[k].x1 } : null; }; // x より右の最初のすき間
      const gapLeft = x => { let k = -1; cols.forEach((c, i) => { if (c.x2 <= x + 1) k = i; }); return k >= 0 && k + 1 < cols.length ? { key: k + 1, x1: cols[k].x2, x2: cols[k + 1].x1 } : null; };
      // 同じ四角から出る線・同じ四角へ入る線の数（幹にまとめるかを決める）
      const dirOf = e => { const a = rectById.get(e.source), b = rectById.get(e.target); return !a || !b ? 0 : b.x1 > a.x2 + 8 ? 1 : a.x1 > b.x2 + 8 ? -1 : 0; };
      const bent = e => { const a = rectById.get(e.source), b = rectById.get(e.target); return dirOf(e) && Math.abs(a.cy - b.cy) >= 2; };
      const fanOut = new Map(), fanIn = new Map();
      map.edges.forEach(e => { if (!bent(e)) return; const d = dirOf(e); fanOut.set(e.source + d, (fanOut.get(e.source + d) || 0) + 1); fanIn.set(e.target + d, (fanIn.get(e.target + d) || 0) + 1); });
      const groups = new Map(); // すき間ごと・幹ごとに縦の線をまとめる
      const attachedEdge = e => { const s = byId.get(e.source); return !!(s && s.attachTo === e.target); };
      map.edges.forEach(e => {
        const a = rectById.get(e.source), b = rectById.get(e.target);
        if (!a || !b || attachedEdge(e)) return; // くっつけた検査データは、くっついていること自体が矢印の代わり
        const d = dirOf(e);
        if (d) {
          const right = d > 0;
          const sx = right ? a.x2 : a.x1, tx = right ? b.x1 : b.x2;
          // 【左へ向かう矢印・行き来する矢印を見やすく】左へ向かう線は、受ける側の右端で「その四角から右へ出る線」と同じ点に重なり、
          // 矢じりがどちらの線のものか見分けにくかった。左向きは少し下の高さで出入りし、A→B と B→A がある2本は上下に分ける（2026-10-07.15）
          const lane = (d < 0 ? 7 : 0) + (map.edges.some(o => o.source === e.target && o.target === e.source) ? (e.source < e.target ? -6 : 6) : 0);
          const sy = a.cy + lane, ty = b.cy + lane;
          // 同じ高さならまっすぐ。ただし途中の四角の後ろを通るときは回り込む（「加齢による呼吸予備力の低下」からの線が
          // 「全身麻酔」の楕円を通り抜け、麻酔の原因のように見えていた。2026-10-06.21）
          if (Math.abs(sy - ty) < 2 && !rmHitsRects({ y: sy, a: sx, b: tx }, rects, new Set([e.source, e.target]))) { routes.push({ edge: e, pts: [[sx, sy], [tx, ty]] }); return; }
          const gS = right ? gapRight(sx) : gapLeft(sx), gT = right ? gapLeft(tx) : gapRight(tx);
          const mid = g => g ? (g.x1 + g.x2) / 2 : null;
          const nearS = mid(gS) ?? sx + d * RM_COL_GAP / 2, nearT = mid(gT) ?? tx - d * RM_COL_GAP / 2;
          const skip = new Set([e.source, e.target]);
          const costS = rmHitsRects({ y: ty, a: nearS, b: tx }, rects, skip) + rmHitsRects({ x: nearS, a: sy, b: ty }, rects, skip);
          const costT = rmHitsRects({ y: sy, a: sx, b: nearT }, rects, skip) + rmHitsRects({ x: nearT, a: sy, b: ty }, rects, skip);
          // 合流（同じ四角へ入る）・分岐（同じ四角から出る）は1本の幹にまとめる。四角に重なる方は避ける
          let useT = costT <= costS;
          if (costT === costS) { if ((fanIn.get(e.target + d) || 0) > 1) useT = true; else if ((fanOut.get(e.source + d) || 0) > 1) useT = false; }
          const route = { edge: e, pts: null, sx, sy, tx, ty };
          routes.push(route);
          // どちらで曲がっても四角の後ろを通ってしまう長い線は、空いている高さ（通り道）を通して回り込む
          if (costS > 0 && costT > 0 && gS && gT && gS.key !== gT.key) {
            const xa = Math.min(nearS, nearT), xb = Math.max(nearS, nearT);
            const cands = [sy, ty];
            let topY = Infinity;
            rects.forEach(r => { if (r.x2 > xa && r.x1 < xb) { cands.push(r.y1 - 9, r.y2 + 9); topY = Math.min(topY, r.y1); } });
            if (topY < Infinity) cands.push(topY - 14);
            // ほかの矢印の縦の線をいくつ横切るか（おおよそ）
            const spans = map.edges.filter(o => o !== e).map(o => { const p = rectById.get(o.source), q = rectById.get(o.target); return p && q ? { a: Math.min(p.cy, q.cy), b: Math.max(p.cy, q.cy), x1: Math.min(p.x2, q.x2), x2: Math.max(p.x1, q.x1) } : null; }).filter(Boolean);
            const crossEst = y => spans.filter(o => y > o.a + 1 && y < o.b - 1 && o.x2 > xa && o.x1 < xb).length;
            const free = cands.filter(y => !rmHitsRects({ y, a: xa, b: xb }, rects, skip) && !rmHitsRects({ x: nearS, a: sy, b: y }, rects, skip) && !rmHitsRects({ x: nearT, a: y, b: ty }, rects, skip));
            if (free.length) {
              const score = y => crossEst(y) * 60 + Math.abs(y - sy) + Math.abs(y - ty);
              const yc = free.sort((p, q) => score(p) - score(q))[0];
              route.yc = yc;
              [['S', gS, sy, yc], ['T', gT, yc, ty]].forEach(([part, g, ya, yb]) => {
                if (g.x2 - g.x1 < 16) { route['x' + part] = (g.x1 + g.x2) / 2; return; }
                const key = `${g.key}|C${e.id}${part}`;
                groups.set(key, { gap: g, routes: [], parts: [[route, part]], hs: [{ y: ya, side: right ? 'L' : 'R' }, { y: yb, side: right ? 'R' : 'L' }] });
              });
              return;
            }
          }
          const g = useT ? gT : gS;
          if (!g || g.x2 - g.x1 < 16) { route.pts = [[sx, sy], [useT ? nearT : nearS, sy], [useT ? nearT : nearS, ty], [tx, ty]]; return; }
          const key = `${g.key}|${useT ? 'T' + e.target : 'S' + e.source}|${d}`;
          if (!groups.has(key)) groups.set(key, { gap: g, routes: [], hs: [] });
          const gr = groups.get(key);
          gr.routes.push(route);
          gr.hs.push({ y: sy, side: right ? 'L' : 'R' }, { y: ty, side: right ? 'R' : 'L' });
        } else {
          // 同じ列（上下）
          const down = b.cy > a.cy;
          // 下にくっつけた検査データがある四角は、検査データの下の端までを1つのまとまりとして線をつなぐ
          // （治療「┤」の先が検査データの後ろに隠れ、どこを抑えるのか見えなかった。長文事例のテスト）
          const blockBottom = r => Math.max(r.y2, ...map.nodes.filter(n => n.attachTo === r.id).map(n => rectById.get(n.id)?.y2 ?? r.y2));
          const sy = down ? blockBottom(a) : a.y1, ty = down ? b.y1 : blockBottom(b);
          let pts;
          if (Math.abs(a.cx - b.cx) < 2) pts = [[a.cx, sy], [b.cx, ty]];
          else { const my = (sy + ty) / 2; pts = [[a.cx, sy], [a.cx, my], [b.cx, my], [b.cx, ty]]; }
          routes.push({ edge: e, pts });
        }
      });
      // すき間ごとに、幹を等間隔に並べる。順番は交差がいちばん少なくなるように選ぶ
      const byGap = new Map();
      groups.forEach(gr => { gr.y1 = Math.min(...gr.hs.map(h => h.y)); gr.y2 = Math.max(...gr.hs.map(h => h.y)); const k = gr.gap.key; if (!byGap.has(k)) byGap.set(k, []); byGap.get(k).push(gr); });
      const inside = (y, g) => y > g.y1 + 1 && y < g.y2 - 1;
      const pairCost = (L, R) => R.hs.filter(h => h.side === 'L' && inside(h.y, L)).length + L.hs.filter(h => h.side === 'R' && inside(h.y, R)).length; // L を左、R を右に置いたときの交差
      byGap.forEach(list => {
        let order;
        if (list.length <= 6) {
          let best = null, bestCost = Infinity;
          const perm = (rest, cur) => {
            if (!rest.length) { let c = 0; for (let i = 0; i < cur.length; i++) for (let j = i + 1; j < cur.length; j++) c += pairCost(cur[i], cur[j]); if (c < bestCost) { bestCost = c; best = cur.slice(); } return; }
            rest.forEach((g, i) => perm(rest.filter((_, k) => k !== i), cur.concat([g])));
          };
          perm(list, []);
          order = best;
        } else {
          order = [];
          list.slice().sort((p, q) => (p.y2 - p.y1) - (q.y2 - q.y1)).forEach(g => {
            let bi = 0, bc = Infinity;
            for (let i = 0; i <= order.length; i++) { const t = order.slice(0, i).concat([g], order.slice(i)); let c = 0; for (let a = 0; a < t.length; a++) for (let b = a + 1; b < t.length; b++) c += pairCost(t[a], t[b]); if (c < bc) { bc = c; bi = i; } }
            order.splice(bi, 0, g);
          });
        }
        const gap = list[0].gap, n = order.length;
        const step = Math.min(14, (gap.x2 - gap.x1 - 16) / Math.max(1, n - 1));
        const mid = (gap.x1 + gap.x2) / 2;
        order.forEach((gr, i) => { const x = n === 1 ? mid : mid + (i - (n - 1) / 2) * step; gr.routes.forEach(r => { r.pts = [[r.sx, r.sy], [x, r.sy], [x, r.ty], [r.tx, r.ty]]; }); (gr.parts || []).forEach(([r, part]) => { r['x' + part] = x; }); });
      });
      routes.forEach(r => { if (r.yc != null) r.pts = [[r.sx, r.sy], [r.xS, r.sy], [r.xS, r.yc], [r.xT, r.yc], [r.xT, r.ty], [r.tx, r.ty]].filter((p, k, a) => !k || Math.abs(p[0] - a[k - 1][0]) + Math.abs(p[1] - a[k - 1][1]) > 0.5); });
      // 飛び越え：横の線が、ほかの矢印の縦の線と交わる所
      const verticals = [];
      routes.forEach((r, ri) => { for (let k = 0; k < r.pts.length - 1; k++) { const [x1, y1] = r.pts[k], [x2, y2] = r.pts[k + 1]; if (Math.abs(x1 - x2) < 0.5) verticals.push({ ri, x: x1, a: Math.min(y1, y2), b: Math.max(y1, y2) }); } });
      // ほかの矢印が曲がる点（縦の線に入る・縦の線から出る所）は「つながる所」。そこを飛び越えると線が二重に見えるので飛び越えない
      const turnPoints = [];
      routes.forEach((r, ri) => { for (let k = 1; k < r.pts.length - 1; k++) turnPoints.push({ ri, x: r.pts[k][0], y: r.pts[k][1] }); });
      let bridges = 0;
      routes.forEach((r, ri) => {
        r.segs = [];
        for (let k = 0; k < r.pts.length - 1; k++) {
          const [x1, y1] = r.pts[k], [x2, y2] = r.pts[k + 1];
          const seg = { x1, y1, x2, y2, cross: [] };
          if (Math.abs(y1 - y2) < 0.5) {
            const lo = Math.min(x1, x2) + RM_BRIDGE_R + RM_CORNER_R + 2, hi = Math.max(x1, x2) - RM_BRIDGE_R - RM_CORNER_R - 2; // 曲がり角の丸みと重ならない所だけ
            verticals.forEach(v => {
              if (v.ri === ri || routes[v.ri].edge.target === r.edge.target || routes[v.ri].edge.source === r.edge.source) return; // 同じ所へ合流・同じ所から分岐する線は交差ではない
              if (turnPoints.some(t => t.ri !== ri && Math.abs(t.x - v.x) < 22 && Math.abs(t.y - y1) < 1.5)) return; // 別の線が同じ高さで合流・分岐する所の近くは、飛び越えない（飛び越えと曲がり角が重なって線が二重に見える）
              if (v.x > lo && v.x < hi && y1 > v.a + 1 && y1 < v.b - 1) seg.cross.push(v.x);
            });
            seg.cross.sort((p, q) => (x2 > x1 ? p - q : q - p));
            bridges += seg.cross.length;
          }
          r.segs.push(seg);
        }
      });
      // 【重なった横の線は、そろって飛び越える】同じ四角から分かれる線などは、横の線が同じ所に重なる。片方だけが飛び越え、
      // もう片方がまっすぐのままだと、∩ の下に線が残って見える（利用者の指摘：「下に張ったのがそのままで線が変」）。
      // 同じ高さで重なっている横の線は、どれかが飛び越える所では全部が飛び越える
      const hops = [];
      routes.forEach(r => r.segs.forEach(sg => sg.cross.forEach(x => { if (!hops.some(h => Math.abs(h.x - x) < 0.5 && Math.abs(h.y - sg.y1) < 0.5)) hops.push({ x, y: sg.y1 }); })));
      routes.forEach(r => r.segs.forEach(sg => {
        if (Math.abs(sg.y1 - sg.y2) >= 0.5) return;
        const lo = Math.min(sg.x1, sg.x2) + RM_BRIDGE_R + 2, hi = Math.max(sg.x1, sg.x2) - RM_BRIDGE_R - 2;
        let added = false;
        hops.forEach(h => { if (Math.abs(h.y - sg.y1) < 0.5 && h.x > lo && h.x < hi && !sg.cross.some(x => Math.abs(x - h.x) < 0.5)) { sg.cross.push(h.x); added = true; } });
        if (added) sg.cross.sort((p, q) => (sg.x2 > sg.x1 ? p - q : q - p));
      }));
      bridges = hops.length;
      return { routes, bridges };
    }
    // 曲がり角は丸める（直角の線が重なって見分けにくくならないように）。飛び越えは横の線の途中に描く
    const RM_CORNER_R = 7;
    function rmRoutePath(r) {
      const f = v => Math.round(v * 10) / 10;
      const segs = r.segs;
      const rad = k => {
        if (k >= segs.length - 1) return 0;
        const a = segs[k], b = segs[k + 1];
        const la = Math.hypot(a.x2 - a.x1, a.y2 - a.y1), lb = Math.hypot(b.x2 - b.x1, b.y2 - b.y1);
        return Math.max(0, Math.min(RM_CORNER_R, la / 2, lb / 2));
      };
      let d = `M${f(r.pts[0][0])},${f(r.pts[0][1])}`;
      segs.forEach((s, k) => {
        const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1;
        const ux = (s.x2 - s.x1) / len, uy = (s.y2 - s.y1) / len;
        const rEnd = rad(k);
        const dir = s.x2 >= s.x1 ? 1 : -1;
        s.cross.forEach(cx => {
          d += ` L${f(cx - dir * RM_BRIDGE_R)},${f(s.y1)} A${RM_BRIDGE_R},${RM_BRIDGE_R} 0 0 ${dir > 0 ? 1 : 0} ${f(cx + dir * RM_BRIDGE_R)},${f(s.y1)}`;
        });
        if (rEnd > 0) {
          const n = segs[k + 1];
          const ln = Math.hypot(n.x2 - n.x1, n.y2 - n.y1) || 1;
          d += ` L${f(s.x2 - ux * rEnd)},${f(s.y2 - uy * rEnd)} Q${f(s.x2)},${f(s.y2)} ${f(s.x2 + (n.x2 - n.x1) / ln * rEnd)},${f(s.y2 + (n.y2 - n.y1) / ln * rEnd)}`;
        } else d += ` L${f(s.x2)},${f(s.y2)}`;
      });
      return d;
    }

    // ---- 描く ----
    function rmBounds(map) {
      if (!map.nodes.length) return { x: 0, y: 0, w: 600, h: 300 };
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      map.nodes.forEach(n => { const r = rmRect(n); x1 = Math.min(x1, r.x1); y1 = Math.min(y1, r.y1); x2 = Math.max(x2, r.x2); y2 = Math.max(y2, r.y2); });
      (map.bands || []).forEach(st => { y1 = Math.min(y1, st.y1); y2 = Math.max(y2, st.y2); });
      const pad = 34;
      const top = 0; // 列の見出しは出さない（前に保存した図に見出しが残っていても描かない）
      return { x: x1 - pad, y: y1 - pad - top, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2 + top };
    }
    function rmEdgesSvg(map, { interactive }) {
      const { routes } = rmRouteEdges(map);
      const nodeById = new Map(map.nodes.map(n => [n.id, n]));
      // 医学知識で補った四角・補足の四角につながる矢印は、記録から読み取れた流れと区別するため、うすい点線にする
      const isKnow = id => { const n = nodeById.get(id); return !!n && (n.added || (n.source === 'knowledge' && n.type !== 'nursing_problem')); };
      // 飛び越え（∩）の下の線は消さない（2026-10-06.20 で地の色の丸で隠したが、交差している線まで消えて見えたのでやめた。
      // 代わりに、重なった横の線がそろって飛び越えるようにした：rmRouteEdges）
      return routes.map(r => {
        const e = r.edge;
        const d = rmRoutePath(r);
        const treat = e.relation === 'treats';
        const know = !treat && !e.predicted && (isKnow(e.source) || isKnow(e.target));
        const sel = interactive && rmState.selected && rmState.selected.type === 'edge' && rmState.selected.id === e.id;
        // 治療の線は、始まり（治療）の近くに「治療」と書いて、T字の先が治療の対象だと分かるようにする
        const tl = treat && r.pts && r.pts.length > 1 ? `<text class="rm-treat-label" x="${Math.round((r.pts[0][0] + r.pts[1][0]) / 2) + 6}" y="${Math.round((r.pts[0][1] + r.pts[1][1]) / 2) + 3}" font-size="10" fill="#2563EB" font-weight="700">治療</text>` : '';
        return `<g class="rm-link${treat ? ' is-treat' : ''}${sel ? ' is-selected' : ''}" data-link-id="${escapeHtml(e.id)}">
          ${interactive ? `<path class="rm-link-hit" d="${d}" fill="none" stroke="transparent" stroke-width="20"/>` : ''}
          <path class="rm-link-line" d="${d}" fill="none" stroke="${treat ? '#2563EB' : e.predicted || know ? RM_PRED_LINE : '#57534E'}" stroke-width="${know ? 1.1 : 1.4}"${e.predicted ? ' stroke-dasharray="6 4"' : know ? ' stroke-dasharray="2 3"' : ''} marker-end="url(#rm-${treat ? 'tee-blue' : e.predicted || know ? 'arrow-pred' : 'arrow'})"/>${tl}
        </g>`;
      }).join('');
    }
    function rmNodeSvg(n, { interactive }) {
      const t = rmType(n);
      const s = rmNodeSize(n);
      const sel = interactive && rmState.selected && rmState.selected.type === 'node' && rmState.selected.id === n.id;
      const from = interactive && rmState.connectFrom === n.id;
      const status = rmEpistemicStatus(n);
      const dashed = ['predicted', 'planned'].includes(status) || n.observed === false;
      // 予測の四角（看護問題を除く）は、線と文字を薄くして、今ある事実の流れを目立たせる
      const faint = dashed && n.type !== 'nursing_problem';
      const fill = n.added ? RM_ADDED.fill : t.fill;
      const stroke = faint ? (n.added ? '#B79CF3' : RM_PRED_LINE) : (n.added ? RM_ADDED.stroke : t.stroke);
      const shape = t.shape === 'ellipse'
        ? `<ellipse class="rm-box" cx="${s.w / 2}" cy="${s.h / 2}" rx="${s.w / 2}" ry="${s.h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"${dashed ? ' stroke-dasharray="6 4"' : ''}/>`
        : `<rect class="rm-box" width="${s.w}" height="${s.h}" rx="${n.type === 'nursing_problem' ? 6 : 3}" fill="${fill}" stroke="${stroke}" stroke-width="${t.bold || n.added ? 1.8 : 1.3}"${dashed ? ' stroke-dasharray="6 4"' : ''}/>`;
      const ell = t.shape === 'ellipse';
      // 文字は四角のまん中にそろえる（左詰めだと行の長さがばらばらに見え、読みにくい。利用者の指摘：2026-10-06.19）
      const textX = s.w / 2;
      const anchor = ' text-anchor="middle"';
      const tag = [n.added ? '＋補足' : '', status === 'inferred' ? '推論' : status === 'planned' ? '予定' : dashed ? '予測' : '', ['vital', 'medication', 'assessment'].includes(n.type) ? rmType(n).label : ''].filter(Boolean).join(' ');
      const tagW = Array.from(tag).reduce((w, ch) => w + (ch === ' ' ? 4 : 10), 0) + 12;
      const tagColor = faint ? stroke : n.added ? RM_ADDED.stroke : t.stroke;
      return `<g class="rm-node${n.added ? ' is-added' : ''}${faint ? ' is-pred' : ''}${sel ? ' is-selected' : ''}${from ? ' is-connect-from' : ''}" data-node-id="${escapeHtml(n.id)}" data-kind="${escapeHtml(n.type)}" transform="translate(${n.x},${n.y})"${interactive ? ` tabindex="0" role="button" aria-label="${escapeHtml(`${t.label}${dashed ? '（予測）' : ''}：${rmDisplayLabel(n)}`)}"` : ''}>
        ${shape}
        <title>${escapeHtml(`${t.label}${dashed ? '（予測）' : ''}${n.added ? '（矢印の間に補った過程）' : n.source === 'knowledge' ? '（医学知識で補った）' : ''}`)}</title>
        ${tag ? `<g class="rm-tag"><rect x="${s.w - tagW - 6}" y="-8" width="${tagW}" height="16" rx="8" fill="${n.added ? tagColor : '#FFFFFF'}" stroke="${tagColor}" stroke-width="0.9"/><text class="rm-kind" x="${s.w - tagW / 2 - 6}" y="4" text-anchor="middle" font-size="10" fill="${n.added ? '#FFFFFF' : tagColor}" font-weight="700">${escapeHtml(tag)}</text></g>` : ''}
        <text class="rm-text" x="${textX}" y="${RM_PAD + RM_HEAD_H + RM_FONT + (ell ? 8 : 0)}"${anchor} font-size="${RM_FONT}" fill="${faint ? RM_PRED_TEXT : '#1C1917'}"${t.bold ? ' font-weight="700"' : ''}>${s.lines.map((line, i) => `<tspan x="${textX}" dy="${i ? RM_LINE_H : 0}">${escapeHtml(line)}</tspan>`).join('')}</text>
        ${s.noteLines.length ? (() => { const y0 = RM_PAD + RM_HEAD_H + s.lines.length * RM_LINE_H + RM_NOTE_GAP / 2; return `<line class="rm-note-sep" x1="14" y1="${y0}" x2="${s.w - 14}" y2="${y0}" stroke="${t.stroke}" stroke-opacity="0.35" stroke-width="0.8"/><text class="rm-note" x="${textX}" y="${y0 + RM_NOTE_GAP / 2 + RM_NOTE_FONT}"${anchor} font-size="${RM_NOTE_FONT}" fill="#57534E">${s.noteLines.map((line, i) => `<tspan x="${textX}" dy="${i ? RM_NOTE_LINE_H : 0}">${escapeHtml(line)}</tspan>`).join('')}</text>`; })() : ''}
      </g>`;
    }
    function rmHeadersSvg(map, b) {
      return [].map(h => `<g class="rm-header"><rect x="${h.x1}" y="${b.y + 6}" width="${Math.max(10, h.x2 - h.x1)}" height="28" rx="3" fill="#ECEAE4"/><text x="${(h.x1 + h.x2) / 2}" y="${b.y + 25}" text-anchor="middle" font-size="14" font-weight="700" fill="#3F3B35">${escapeHtml(h.label)}</text></g>`).join('');
    }
    function relationMapSvg(map, { interactive = false, zoom = 1, title = '' } = {}) {
      const b = rmBounds(map);
      // 小さく表示しても読みやすいゴシック体（明朝体は細い線がつぶれやすい）
      const font = "'Noto Sans JP','Hiragino Kaku Gothic ProN','Hiragino Sans','Yu Gothic UI','Yu Gothic','Meiryo',sans-serif";
      const marker = (id, color) => `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${color}"/></marker>`;
      return `<svg xmlns="http://www.w3.org/2000/svg" class="rm-svg" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" width="${Math.round(b.w * zoom)}" height="${Math.round(b.h * zoom)}" font-family="${escapeHtml(font)}" role="img" aria-label="${escapeHtml(title || '関連図')}">
        <defs>${marker('rm-arrow', '#3F3B35')}${marker('rm-arrow-blue', '#2563EB')}${marker('rm-arrow-sel', '#C2410C')}${marker('rm-arrow-pred', RM_PRED_LINE)}<marker id="rm-tee-blue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M8,0 L8,10" stroke="#2563EB" stroke-width="2.6" fill="none"/></marker></defs>
        <rect class="rm-bg${interactive ? ' is-paper' : ''}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${interactive ? RM_PAPER : '#FFFFFF'}"/>
        <g class="rm-headers">${rmHeadersSvg(map, b)}</g>
        <g class="rm-links">${rmEdgesSvg(map, { interactive })}</g>
        <g class="rm-nodes">${map.nodes.map(n => rmNodeSvg(n, { interactive })).join('')}</g>
      </svg>`;
    }
    function rmLegendHtml() {
      const sw = (t, extra = '') => `<span class="rm-legend-swatch${RM_TYPE_BY_KEY.get(t).shape === 'ellipse' ? ' is-ellipse' : ''}" data-kind="${t}" style="background:${RM_TYPE_BY_KEY.get(t).fill};border-color:${RM_TYPE_BY_KEY.get(t).stroke};${extra}"></span>`;
      const line = (color, dash) => `<svg width="34" height="10" aria-hidden="true"><line x1="0" y1="5" x2="28" y2="5" stroke="${color}" stroke-width="1.6"${dash ? ' stroke-dasharray="6 4"' : ''}/><path d="M27,1 L34,5 L27,9 z" fill="${color}"/></svg>`;
      return [
        `<span class="rm-legend-item">${sw('patient_fact')}患者情報・背景</span>`,
        `<span class="rm-legend-item">${sw('symptom')}症状・徴候</span>`,
        `<span class="rm-legend-item">${sw('treatment')}治療・処置（楕円）</span>`,
        `<span class="rm-legend-item">${sw('pathophysiology')}現象・状態</span>`,
        `<span class="rm-legend-item">${sw('lab')}（ ）検査データ</span>`,
        `<span class="rm-legend-item">${sw('disease')}疾患</span>`,
        `<span class="rm-legend-item">${sw('nursing_problem')}看護問題（#＝優先順位）</span>`,
        `<span class="rm-legend-item">${line('#3F3B35')}原因 → 結果</span>`,
        // 治療の線の先は「┤」（抑える・和らげる）。矢印（→）だと「鎮痛薬 → 創部痛」が「鎮痛薬で痛くなる」に見えるため（2026-10-06.21）
        `<span class="rm-legend-item"><svg width="34" height="10" aria-hidden="true"><line x1="0" y1="5" x2="31" y2="5" stroke="#2563EB" stroke-width="1.6"/><line x1="32" y1="0" x2="32" y2="10" stroke="#2563EB" stroke-width="2.4"/></svg>治療 ┤ 治療の対象（抑える・和らげる）</span>`,
        `<span class="rm-legend-item">${line('#3F3B35', true)}予測・可能性（破線）</span>`
      ].join('');
    }

    // ---- 自動チェック（AIは使わない） ----
    function rmNormLabel(s) { return String(s || '').normalize('NFKC').replace(/[\s、。・,.()（）「」:：#\d]/g, ''); }
    function rmReach(map, startIds, dirOut) {
      const seen = new Set(startIds);
      const stack = [...startIds];
      while (stack.length) {
        const id = stack.pop();
        map.edges.forEach(e => {
          const [a, b] = [e.source, e.target];
          // さかのぼるとき、治療からは「治療の対象」へも進む（膀胱留置カテーテル ┤ 神経因性膀胱 ← 頸髄損傷：管は対象があるから入っている）
          const next = dirOut ? (a === id ? b : null) : (b === id ? a : (e.relation === 'treats' && a === id ? b : null));
          if (next && !seen.has(next)) { seen.add(next); stack.push(next); }
        });
      }
      return seen;
    }
    function validateRelationMap(map, cp = null) {
      const issues = [];
      if (!map || !map.nodes.length) return issues;
      const byId = new Map(map.nodes.map(n => [n.id, n]));
      const name = n => rmShorten(rmDisplayLabel(n), 18);
      const add = (level, code, msg, extra = {}) => issues.push({ level, code, msg, ...extra });
      if (cp && map.patientId && map.patientId !== cp.id) add('error', 'patient-mismatch', '患者情報が一致しないため、この関連図を使えません');
      const cards = cp ? new Set((cp.items || []).map(i => i.id)) : null;
      map.nodes.forEach(n => {
        if (!RM_TYPE_BY_KEY.has(n.type)) add('error', 'unknown-type', '読み込めない項目の種類があります', { nodeIds: [n.id] });
        if (rmEpistemicStatus(n) === 'inferred') add('info', 'inferred', `「${name(n)}」は記録に直接書かれた事実ではなく、推論・補足です。根拠を確認してください`, { nodeIds: [n.id] });
        if (['lab', 'vital'].includes(n.type) && n.observation && !n.observation.unit) add('warn', 'missing-unit', `「${name(n)}」の単位が確認できません`, { nodeIds: [n.id] });
        if (n.type === 'medication' && (!n.medication || n.medication.eventType === 'unknown')) add('warn', 'medication-event', `「${name(n)}」の処方・投与済み・中止が区別されていません`, { nodeIds: [n.id] });
        (n.sourceRefs || []).forEach(r => {
          if ((map.patientId && r.patientId !== map.patientId) || (cp && r.patientId !== cp.id)) add('error', 'evidence-patient', '別の患者の根拠が含まれています', { nodeIds: [n.id] });
          else if (cards && r.sourceType === 'card' && !cards.has(r.sourceId)) add('warn', 'stale-evidence', `「${name(n)}」の元のカードがありません。再評価してください`, { nodeIds: [n.id] });
        });
      });
      // 1 浮島
      map.nodes.forEach(n => { if (!map.edges.some(e => e.source === n.id || e.target === n.id)) add('error', 'isolated', `どこにもつながっていない四角：「${name(n)}」。原因・結果・治療の対象・看護問題のどれかにつなぐか、要らなければ消してください`, { nodeIds: [n.id], fix: 'remove-node' }); });
      // 2 重複
      const seenLabel = new Map();
      map.nodes.forEach(n => {
        const k = `${rmNormLabel(n.label)}`;
        if (k.length < 2) return;
        if (seenLabel.has(k)) add('warn', 'duplicate', `同じ内容の四角が2つあります：「${name(n)}」。1つの四角から枝分かれさせてください`, { nodeIds: [seenLabel.get(k), n.id], fix: 'merge-duplicate' });
        else seenLabel.set(k, n.id);
      });
      const pair = new Set(map.edges.map(e => `${e.source}>${e.target}`));
      map.edges.forEach(e => {
        const a = byId.get(e.source), b = byId.get(e.target);
        if (!a || !b) return;
        // 臨床的な推論による因果関係は、単なる時間的前後関係と区別して根拠を確認する。
        // 記録に直接書かれた観察データと、医学知識から補った病態の間に因果の矢印を
        // 引く場合、根拠説明がないまま確定扱いにしない。画面配置は変更しない。
        if (['causes', 'contributes_to', 'results_in', 'manifests_as', 'increases_risk_of', 'may_contribute_to'].includes(e.relation) &&
            (rmEpistemicStatus(a) === 'inferred' || rmEpistemicStatus(b) === 'inferred') &&
            !String(e.evidence || '').trim()) {
          add('warn', 'clinical-causality-unverified',
            `「${name(a)}」から「${name(b)}」への因果関係に検証可能な根拠の説明がありません。病態生理の出典と適用条件を確認してください`,
            { edgeIds: [e.id] });
        }
        // 3 相互矢印
        if (pair.has(`${e.target}>${e.source}`) && e.source < e.target) add('warn', 'mutual', `「${name(a)}」と「${name(b)}」の間に両向きの矢印があります。相互作用か、向きの誤りかを確認してください`, { edgeIds: [e.id] });
        // 4 治療 → 治療の対象
        if (e.relation === 'treats' && !['treatment', 'medication'].includes(a.type)) add('error', 'treat-source', `「治療 → 対象」の矢印の元が治療ではありません：「${name(a)}」→「${name(b)}」`, { edgeIds: [e.id], fix: 'relation-causes' });
        if (['treatment', 'medication'].includes(a.type) && e.relation !== 'treats' && b.type === 'disease') add('warn', 'treat-direction', `「${name(a)}」は「${name(b)}」に対する治療なら、種類を「治療 → 治療の対象」にしてください`, { edgeIds: [e.id], fix: 'relation-treats' });
        if (['treatment', 'medication'].includes(b.type) && e.relation !== 'treats' && (a.type === 'disease' || a.type === 'symptom')) add('warn', 'treat-reverse', `「${name(a)} → ${name(b)}」は治療の向きが逆の可能性があります（治療 → 治療の対象 にする）`, { edgeIds: [e.id], fix: 'reverse-treats' });
        // 5 原因 → 結果
        if (a.type === 'nursing_problem') add('error', 'from-problem', `看護問題から矢印が出ています：「${name(a)}」→「${name(b)}」。看護問題は右端の結論にします`, { edgeIds: [e.id], fix: 'reverse' });
        if (b.type === 'patient_fact' && e.relation !== 'treats') add('warn', 'into-fact', `患者の背景（「${name(b)}」）が結果になっています。向きを確かめてください`, { edgeIds: [e.id] });
        // 6 事実と予測
        if (b.type === 'future_risk' && !e.predicted) add('warn', 'risk-solid', `今後のリスク「${name(b)}」への矢印が実線です（予測は破線）`, { edgeIds: [e.id], fix: 'edge-predicted' });
        if (a.observed === false && b.observed !== false && b.type !== 'nursing_problem') add('warn', 'pred-to-fact', `予測の「${name(a)}」から、事実の「${name(b)}」へつながっています。事実と予測が混ざっていないか確かめてください`, { edgeIds: [e.id] });
        if (b.observed === false && !e.predicted && b.type !== 'nursing_problem') add('info', 'edge-to-pred', `予測の四角「${name(b)}」への矢印は破線にします`, { edgeIds: [e.id], fix: 'edge-predicted' });
      });
      map.nodes.forEach(n => { if (n.type === 'future_risk' && n.observed !== false) add('warn', 'risk-observed', `「${name(n)}」は今後のリスクなので「予測」にします`, { nodeIds: [n.id], fix: 'node-predicted' }); });
      // 7 看護問題の根拠の道筋
      const probs = map.nodes.filter(n => n.type === 'nursing_problem');
      const factIds = map.nodes.filter(n => !['inferred', 'predicted', 'planned'].includes(rmEpistemicStatus(n)) && ['patient_fact', 'disease', 'symptom', 'lab', 'vital', 'medication'].includes(n.type)).map(n => n.id);
      probs.forEach(p => {
        const back = rmReach(map, [p.id], false);
        if (!factIds.some(id => back.has(id))) add('error', 'no-evidence', `看護問題「${name(p)}」まで、患者に実際にある情報（症状・データ・背景）からたどれる矢印がありません`, { nodeIds: [p.id] });
      });
      // 8 #番号
      const pr = probs.map(p => p.priority);
      if (pr.some(v => !v) || new Set(pr).size !== pr.length || Math.max(0, ...pr) !== pr.length) add('warn', 'numbering', '看護問題の#番号が通し番号になっていません', { fix: 'renumber' });
      // 9 優先順位の目安
      const sorted = [...probs].sort((a, b) => a.priority - b.priority);
      for (let i = 1; i < sorted.length; i++) {
        const ca = rmProblemCategory(sorted[i - 1].label), cb = rmProblemCategory(sorted[i].label);
        if (cb.rank + 2 <= ca.rank) { add('info', 'priority', `優先順位の確認：「${name(sorted[i])}」（${cb.rank <= 2 ? '生命・呼吸・循環' : 'より身体的な問題'}）を「${name(sorted[i - 1])}」より上にする方がよいかもしれません（患者の状態で判断してください）`, { nodeIds: [sorted[i].id], fix: 'priority-sort' }); break; }
      }
      // 10 情報の入れすぎ
      if (map.nodes.filter(n => !n.added).length > 40) add('warn', 'too-many', `四角が${map.nodes.filter(n => !n.added).length}個あります（＋補足は除く）。看護問題に関係の薄い情報を減らすと読みやすくなります`);
      const facts = map.nodes.filter(n => n.type === 'patient_fact').length;
      if (facts > 6) add('info', 'too-many-facts', `患者の背景の四角が${facts}個あります。看護問題につながらないプロフィールは省いてください`);
      if (!probs.length) add('warn', 'no-problem', '看護問題がありません。右端に #1〜 の看護問題を置いてください');
      // 検査データが矢印の途中にある（A → 検査 → B）。検査は原因ではなく根拠なので、A → B にして検査は B の根拠として横に付ける
      map.nodes.forEach(n => {
        if (!['lab', 'vital'].includes(n.type)) return;
        const ins = map.edges.filter(e => e.target === n.id && e.relation !== 'treats');
        if (ins.length) add('warn', 'lab-in-chain', `検査データ「${name(n)}」が矢印の途中にあります。検査は原因ではなく根拠なので、前後を直接つなぎ、検査は横に付けます`, { nodeIds: [n.id], fix: 'lab-as-evidence' });
      });
      // 似た看護問題（同じ種類：「身体可動性障害」と「移動能力低下」など）が2つ以上ある
      const byCat = new Map();
      // 看護計画から入れた看護問題どうしで、同じ種類・同じ「リスク／今ある」のもの（活動は 移動／セルフケア／活動耐性 に分ける）
      const simKey = p => rmProblemSimKey(p.label);
      probs.filter(p => p.source === 'plan').forEach(p => { const c = simKey(p); if (!c) return; if (!byCat.has(c)) byCat.set(c, []); byCat.get(c).push(p); });
      byCat.forEach(ps => { if (ps.length > 1) add('info', 'similar-problems', `似た看護問題が${ps.length}つあります：${ps.map(p => `「${name(p)}」`).join('・')}。同じことを言っていないか、1つにまとめられないか確かめてください`, { nodeIds: ps.map(p => p.id) }); });
      // 基本情報（氏名・年齢・血液型など）から、看護問題へ直接の矢印
      map.edges.forEach(e => { const a = byId.get(e.source), b = byId.get(e.target); if (a && b && b.type === 'nursing_problem' && /血液型|Rh\s*[+\-]|氏\s*\d+\s*歳/.test(String(a.label).normalize('NFKC'))) add('warn', 'basic-to-problem', `基本情報「${name(a)}」から看護問題「${name(b)}」へ直接つながっています。間の病態・症状（例：筋力低下・痛み）を入れるか、根拠になる記録につなぎ直してください`, { edgeIds: [e.id] }); });
      // 左向きの矢印（結果が原因より左にある。時間をさかのぼって見える）
      const leftward = map.edges.filter(e => { const a = byId.get(e.source), b = byId.get(e.target); if (!a || !b || a.attachTo === b.id) return false; const ra = rmRect(a), rb = rmRect(b); return rb.x2 < ra.x1 - 4; });
      if (leftward.length) add('info', 'leftward', `左向きの矢印が${leftward.length}本あります（結果が原因より左にあり、流れをさかのぼって見えます）。「並べ直す」で左から右へそろいます。向きが逆なら、矢印を押して「向きを逆にする」`, { edgeIds: leftward.map(e => e.id), fix: 'relayout' });
      // 11・12 線の交差（交差する所は飛び越えで描く）
      const { bridges } = rmRouteEdges(map);
      if (bridges) {
        // 「並べ直す」で本当に減るときだけ勧める（作った直後の図は並べ直しても同じなので、勧めない）
        let alt = bridges;
        try { const c = JSON.parse(JSON.stringify(map)); layoutRelationMap(c); alt = rmRouteEdges(c).bridges; } catch (e) { /* 数えられなければ勧めない */ }
        if (alt < bridges) add('info', 'crossing', `線の交差が${bridges}か所あります（飛び越え∩で描いています）。「並べ直す」で${alt}か所に減らせます`, { fix: 'relayout' });
        else add('info', 'crossing', `線の交差が${bridges}か所あります（飛び越え∩で描いています）。四角を動かすと減らせることがあります`);
      }
      // 根拠の書かれていない矢印（AIで作った図）
      const noEv = map.edges.filter(e => !e.evidence).length;
      if (map.source === 'ai' && noEv) add('info', 'no-edge-evidence', `理由の書かれていない矢印が${noEv}本あります（矢印を押して「なぜ？」で確かめられます）`);
      return issues;
    }
    function rmApplyFixes(map, issues) {
      let n = 0;
      const byId = new Map(map.nodes.map(x => [x.id, x]));
      const edgeById = () => new Map(map.edges.map(e => [e.id, e]));
      issues.forEach(is => {
        if (!is.fix) return;
        const eb = edgeById();
        const e = is.edgeIds && eb.get(is.edgeIds[0]);
        if (is.fix === 'remove-node' && is.nodeIds) { map.nodes = map.nodes.filter(x => x.id !== is.nodeIds[0]); n++; }
        else if (is.fix === 'merge-duplicate' && is.nodeIds) {
          const [keepId, dropId] = is.nodeIds;
          if (!byId.get(keepId) || !byId.get(dropId)) return;
          map.edges.forEach(x => { if (x.source === dropId) x.source = keepId; if (x.target === dropId) x.target = keepId; });
          map.edges = map.edges.filter((x, i, arr) => x.source !== x.target && arr.findIndex(y => y.source === x.source && y.target === x.target) === i);
          map.nodes = map.nodes.filter(x => x.id !== dropId); n++;
        } else if (e && is.fix === 'remove-edge') { map.edges = map.edges.filter(x => x !== e); n++; }
        else if (e && is.fix === 'relation-causes') { e.relation = 'causes'; n++; }
        else if (e && is.fix === 'relation-treats') { e.relation = 'treats'; n++; }
        else if (e && is.fix === 'reverse-treats') { const t = e.source; e.source = e.target; e.target = t; e.relation = 'treats'; n++; }
        else if (e && is.fix === 'reverse') { if (!map.edges.some(o => o.source === e.target && o.target === e.source)) { const t = e.source; e.source = e.target; e.target = t; } else map.edges = map.edges.filter(x => x !== e); n++; }
        else if (e && is.fix === 'edge-predicted') { e.predicted = true; n++; }
        else if (is.fix === 'node-predicted' && is.nodeIds) { const x = byId.get(is.nodeIds[0]); if (x) { x.observed = false; n++; } }
        else if (is.fix === 'renumber') { rmRenumberProblems(map); n++; }
        else if (is.fix === 'lab-as-evidence' && is.nodeIds) {
          const id = is.nodeIds[0];
          const ins = map.edges.filter(x => x.target === id && x.relation !== 'treats'), outs = map.edges.filter(x => x.source === id);
          ins.forEach(a => {
            if (outs.length) outs.forEach(b => { if (a.source !== b.target && !map.edges.some(x => x.source === a.source && x.target === b.target)) map.edges.push({ id: rmNewId('e'), source: a.source, target: b.target, relation: a.relation === 'supports' ? 'causes' : a.relation, predicted: !!(a.predicted || b.predicted), evidence: a.evidence || b.evidence || '' }); });
            else if (!map.edges.some(x => x.source === id && x.target === a.source)) map.edges.push({ id: rmNewId('e'), source: id, target: a.source, relation: 'supports', predicted: false, evidence: a.evidence || '' });
          });
          map.edges = map.edges.filter(x => !ins.includes(x));
          map.edges.forEach(x => { if (x.source === id) x.relation = 'supports'; });
          n++;
        }
        else if (is.fix === 'priority-sort') {
          const probs = map.nodes.filter(x => x.type === 'nursing_problem');
          probs.sort((a, b) => (rmProblemCategory(a.label).rank - rmProblemCategory(b.label).rank) || (a.priority - b.priority));
          probs.forEach((p, i) => { p.priority = i + 1; }); n++;
        }
      });
      // 消した四角への矢印も消す
      const ids = new Set(map.nodes.map(x => x.id));
      map.edges = map.edges.filter(e => ids.has(e.source) && ids.has(e.target));
      if (issues.some(i => i.fix === 'relayout') || n) layoutRelationMap(map);
      return n;
    }

    // ---- 記録から作る（AIなし）：記録の事実を集め、よくある展開のひな形で病態の中間過程を補う ----
    const RM_NEG_AFTER = /^[^、。,，\n]{0,6}?(?:なし|無し|無い|ない|認めず|みられず|見られず|\(-\)|（-）|陰性|消失)/;
    function rmPositiveMatch(re, text) {
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      const t = String(text || '').normalize('NFKC');
      let m;
      while ((m = g.exec(t)) !== null) {
        if (!RM_NEG_AFTER.test(t.slice(m.index + m[0].length))) return m;
        if (m[0] === '') g.lastIndex++;
      }
      return null;
    }
    function rmIsFamilySpeech(text) { try { return typeof isFamilySpeech === 'function' && isFamilySpeech(text); } catch (e) { return false; } }
    // 病気の成り立ちの要因（背景 → 中間の過程 → 疾患）。記録に両方の言葉があるときだけ使う
    const RM_DISEASE_FACTORS = [
      { disease: /胃がん|胃癌/, factor: /喫煙|タバコ|たばこ/, mid: '胃粘膜への慢性的な刺激・防御機能の低下' },
      { disease: /胃がん|胃癌/, factor: /ピロリ/, mid: 'ピロリ菌感染による慢性胃炎・萎縮' },
      { disease: /肺がん|肺癌|COPD|慢性閉塞/, factor: /喫煙|タバコ|たばこ/, mid: '気道・肺胞への慢性的な刺激' },
      { disease: /大腸がん|大腸癌|直腸がん/, factor: /飲酒|肥満|喫煙/, mid: '腸粘膜への慢性的な影響' },
      { disease: /心不全/, factor: /心筋梗塞|狭心症/, mid: '心筋の障害・左心機能の低下' },
      { disease: /心不全/, factor: /高血圧/, mid: '長い間の後負荷の増大・心肥大' },
      { disease: /心筋梗塞|狭心症/, factor: /喫煙|脂質異常|高脂血症|糖尿病|高血圧/, mid: '冠動脈の動脈硬化の進行' },
      { disease: /脳梗塞|脳出血|脳卒中/, factor: /高血圧|糖尿病|脂質異常|喫煙/, mid: '脳血管の動脈硬化の進行' },
      { disease: /肝硬変|肝がん|肝癌/, factor: /飲酒|アルコール|肝炎/, mid: '肝細胞の慢性的な障害・線維化' },
      { disease: /骨折/, factor: /骨粗鬆症/, mid: '骨密度の低下・骨の脆弱化' },
      { disease: /骨折/, factor: /転倒|転落/, mid: '転倒による外力（大腿骨・脊椎などへの衝撃）' },
      { disease: /脳梗塞|脳塞栓|心原性/, factor: /心房細動/, mid: '心房内の血栓の形成（血栓が脳の血管に詰まる）' }
    ];

    function buildRelationMapFromRecord(cp) {
      const items = ((cp && cp.items) || []).filter(i => i && i.text && i.type !== 'unnecessary' && !i.aiSuggested
        && !(typeof isMissingInfoOnlyItem === 'function' && isMissingInfoOnlyItem(i)));
      const all = [cp.sourceText || '', ...items.map(i => i.text)].join('\n').normalize('NFKC');
      const nodes = new Map();
      const edges = [];
      const byItem = new Map(); // 1枚のカードからは1つの四角だけ（同じ情報を複数の場所に置かない）
      const N = (key, type, label, o = {}) => {
        if (nodes.has(key)) return nodes.get(key);
        const srcItems = (o.items || []).filter(Boolean);
        if (srcItems.length === 1 && ['patient_fact', 'symptom'].includes(type) && byItem.has(srcItems[0])) { const ex = byItem.get(srcItems[0]); nodes.set(key, ex); return ex; }
        const n = { id: rmNewId('n'), key, type, label: rmShorten(label, o.max || 44), evidence: o.evidence || '', observed: o.observed !== false, source: o.source || 'record', priority: 0, x: 0, y: 0, itemIds: (o.items || []).map(i => i && i.id).filter(Boolean).slice(0, 10), cat: o.cat };
        if (type === 'nursing_problem') { const note = o.note != null ? o.note : rmPlainNote(label); if (note) n.note = rmShorten(note, RM_NOTE_MAX); }
        const ph = rmPhaseOfItems(srcItems);
        if (ph !== null) n.phase = ph;
        nodes.set(key, n);
        if (srcItems.length === 1 && ['patient_fact', 'symptom'].includes(type)) byItem.set(srcItems[0], n);
        return n;
      };
      const E = (a, b, relation = 'causes', o = {}) => {
        if (!a || !b || a === b) return;
        if (edges.some(e => (e.source === a.id && e.target === b.id) || (e.source === b.id && e.target === a.id))) return;
        edges.push({ id: rmNewId('e'), source: a.id, target: b.id, relation, predicted: !!o.predicted, evidence: o.evidence || '', ...(o.noBridge ? { noBridge: true } : {}) });
      };
      const has = re => !!rmPositiveMatch(re, all);
      const findItem = (re, filter = () => true) => items.find(i => filter(i) && rmPositiveMatch(re, i.text));
      // 今の状態は、いちばん新しい記録を使う（入院前の経過の文より、入院後の観察を優先する）
      const findLast = (re, filter = () => true) => [...items].reverse().find(i => filter(i) && rmPositiveMatch(re, i.text));
      const notDxS = i => !(i.fieldLabel && /診断|病名|既往/.test(i.fieldLabel)) && !/^既往/.test(String(i.text));
      const notHist = i => !(i.fieldLabel && /現病歴|既往|診断|病名|生活歴/.test(i.fieldLabel)) && !/^(?:現病歴|既往)/.test(String(i.text));
      const dmItem0 = items.find(i => /糖尿病|\bDM\b/.test(String(i.text).normalize('NFKC')));
      const o2Label = () => { const m = o2Item && String(o2Item.text).normalize('NFKC').match(/(?:鼻カニュ[ラー]|マスク|リザーバー[^\s]*|ネーザル)?\s*(?:酸素|O2)\s*\d+(?:\.\d+)?\s*L(?:\/分|\/min)?/); return m ? `酸素投与（${m[0].trim()}）` : '酸素投与'; };
      // カードの文は、要点（最初の一文）だけにする（長い文をそのまま載せると図が読みにくい）
      const short = (i, max = 34, re = null) => {
        let t = String(i.text).replace(/^【[^】]{1,10}】/, '').replace(/^\d{1,2}[:：]\d{2}\s*/, '').trim();
        // 見たい言葉（re）があれば、その言葉を含む文を使う（「歩行器で歩行。歩行後に息切れ」なら後ろの文）
        const sents = t.split(/。/).filter(x => x.trim());
        const first = (re && sents.find(x => re.test(x))) || sents[0] || t;
        if (first.length >= 6 && first.length < t.length) t = first;
        // 「…」の途中で切れたら閉じる（「夜も苦しくて眠れない → 「夜も苦しくて眠れない」）
        let r = rmShorten(t, max);
        if ((r.match(/「/g) || []).length > (r.match(/」/g) || []).length) r += '」';
        return r;
      };

      let basics = {};
      try { basics = extractClinicalBasics(cp.sourceText || items.map(i => i.text).join('\n')) || {}; } catch (e) { basics = {}; }
      const age = basics.age;
      let table = { rows: [], columns: [] };
      try { table = buildLabTrendTable(items, { includeVitals: true, sourceText: cp.sourceText || '' }); } catch (e) { /* 表が作れなくても続ける */ }
      // 検査値：いちばん新しい値（と、最初の値から変わっていれば「最初 → 最新」）
      const lab = key => {
        const row = table.rows.find(r => r.key === key);
        if (!row) return null;
        const cells = table.columns.map(c => (row.cells[c.key] || [])[0]).filter(Boolean);
        if (!cells.length) return null;
        const last = cells[cells.length - 1], first = cells[0];
        const flag = last.flag === 'high' ? '↑' : last.flag === 'low' ? '↓' : '';
        const it = items.find(i => i.id === last.itemId);
        return { key, flag: last.flag, value: last.value, unit: row.unit || '', text: `${key} ${first !== last && first.value !== last.value ? `${first.value} → ` : ''}${last.value}${row.unit || ''}${flag}`, item: it };
      };
      const labNode = (l, key) => {
        if (!l) return null;
        const vital = /^(?:SpO2|体温|脈拍|心拍数|呼吸数|血圧|収縮期血圧|拡張期血圧|体重)$/.test(l.key);
        const n = N(key || `lab_${l.key}`, vital ? 'vital' : 'lab', l.text, { items: [l.item] });
        n.observation = { name: l.key, value: l.value, unit: l.unit };
        return n;
      };

      // ① 疾患
      // 「予定術式：…」「術式：…」の記録は手術であって疾患ではない（疾患の四角と治療の楕円に同じ手術が2つ出ていた）
      const notSurgeryLine = i => !/^【?\s*(?:予定)?(?:術式|手術(?:名|予定)?)\s*】?\s*[:：]/.test(String(i.text || '').normalize('NFKC')) && !/^(?:予定)?術式$/.test(i.fieldLabel || '');
      const dxItems = items.filter(i => i.fieldLabel && /^(?:診断名|病名|主病名|疾患名|主診断)$/.test(i.fieldLabel) && notSurgeryLine(i));
      const dxText = dxItems.length ? dxItems : items.filter(i => /^【?(?:診断名?|病名|疾患名)】?\s*[:：]/.test(String(i.text).normalize('NFKC')) && notSurgeryLine(i));
      // 診断名の欄に「予定術式：…」まで入っているときは、術式の部分を外す。診断名が残らなければ、記録の中のがんの病名を探す
      const cleanDx = t => String(t).normalize('NFKC').replace(/^【?(?:診断名?|病名|疾患名)】?\s*[:：]\s*/, '').replace(/[\s、,，]*[（(]?\s*(?:予定)?(?:術式|手術名?)\s*[:：][\s\S]*$/, '').trim();
      let dxLabel0 = dxText[0] ? cleanDx(dxText[0].text) : '';
      let dxHost = dxText[0] || null;
      if (dxText[0] && !dxLabel0) {
        const cancerItem = items.find(i => /(?:胃|大腸|結腸|直腸|肝|膵|肺|乳腺|食道|前立腺|子宮|卵巣)(?:がん|癌)/.test(String(i.text).normalize('NFKC')) && notSurgeryLine(i));
        if (cancerItem) { dxHost = cancerItem; dxLabel0 = ((String(cancerItem.text).normalize('NFKC').match(/(?:胃|大腸|結腸|直腸|肝|膵|肺|乳腺|食道|前立腺|子宮|卵巣)(?:がん|癌)[^、。\n]{0,30}/) || [])[0] || '').trim(); }
      }
      // 【疾患の四角が消える対策】「診断名」という欄名が付かない書き方（文中の「診断名：胃がん」・「胃がんのため手術」など）でも、
      // 本人のがんの病名を記録の中から探して疾患の四角にする（家族歴・既往・術式の行は除く）
      if (!dxHost || !dxLabel0) {
        const CA = '(?:胃|大腸|結腸|直腸|肝|膵|肺|乳腺|食道|前立腺|子宮|卵巣|胆嚢|胆管|腎|膀胱|甲状腺|咽頭|喉頭)(?:がん|癌)';
        const famRe = /家族|祖父|祖母|父|母|兄|姉|弟|妹|既往|亡くし|術式\s*[:：]/;
        const reCa = new RegExp(CA + '[^、。\\n]{0,30}');
        const reInline = new RegExp('診断名?\\s*[:：]\\s*[^\\n。]*' + CA);
        let hit = null;
        for (const pass of [0, 1]) {
          for (const i of items) {
            if (hit || /既往|家族/.test(i.fieldLabel || '') || !notSurgeryLine(i)) continue;
            const sents = String(i.text).normalize('NFKC').split(/(?<=[。\n])/).filter(x => x.trim());
            for (const st of sents) {
              if (famRe.test(st) || !(pass === 0 ? reInline : reCa).test(st)) continue;
              const m = st.match(reCa);
              if (m) { hit = { item: i, label: m[0].trim() }; break; }
            }
          }
          if (hit) break;
        }
        // 「胃底部に25mm大のがんを指摘され」のように、病名が「臓器＋に…がん」の形で書かれている記録
        if (!hit) {
          const ORG = '(?:胃|大腸|結腸|直腸|肝|膵|肺|乳腺|食道|前立腺|子宮|卵巣|胆嚢|胆管|腎|膀胱|甲状腺|咽頭|喉頭)';
          const reSite = new RegExp('(' + ORG + '[^。\\n、]{0,8})に[^。\\n、]{0,14}?(?:がん|癌)');
          for (const i of items) {
            if (hit || /既往|家族/.test(i.fieldLabel || '') || !notSurgeryLine(i)) continue;
            for (const st of String(i.text).normalize('NFKC').split(/(?<=[。\n])/)) {
              if (famRe.test(st)) continue;
              const m = st.match(reSite);
              if (!m) continue;
              const organ = (m[1].match(new RegExp('^' + ORG)) || [''])[0];
              const size = (st.match(/(\d+(?:\.\d+)?)\s*(mm|cm)/) || []);
              const detail = [m[1] !== organ ? m[1] : '', size[0] ? size[1] + size[2] : ''].filter(Boolean).join(' ');
              hit = { item: i, label: organ + 'がん' + (detail ? '（' + detail + '）' : '') };
              break;
            }
          }
        }
        if (hit) { dxHost = hit.item; dxLabel0 = hit.label.replace(/(?:のため|のために|のことで|により|となり|で|に対して?|と診断.*)$/, '').trim(); }
      }
      const disease = dxHost && dxLabel0 ? N('disease', 'disease', dxLabel0, { items: [dxHost] }) : null;
      const dxLabel = disease ? disease.label : '';
      // ② 背景・要因（疾患の成り立ち）
      const historyText = items.filter(i => /既往|生活歴|嗜好|喫煙|飲酒/.test(`${i.fieldLabel || ''}${i.text}`)).map(i => i.text).join('\n');
      const smokeItem = findItem(/喫煙|タバコ|たばこ|煙草/, i => !/非喫煙|喫煙[^\n]{0,4}(?:なし|無)|吸わない/.test(String(i.text).normalize('NFKC')));
      const smoke = smokeItem ? N('smoke', 'patient_fact', short(smokeItem), { items: [smokeItem] }) : null;
      if (disease) {
        RM_DISEASE_FACTORS.forEach((f, k) => {
          if (!f.disease.test(dxLabel)) return;
          const it = findItem(f.factor, i => i !== dxText[0]);
          if (!it || !f.factor.test(historyText + '\n' + it.text)) return;
          const fact = f.factor.test('喫煙') && smoke ? smoke : N(`factor_${k}`, 'patient_fact', short(it), { items: [it] });
          const mid = N(`factor_mid_${k}`, 'pathophysiology', f.mid, { source: 'knowledge' });
          E(fact, mid, 'contributes_to', { evidence: '医学的に知られている要因' });
          E(mid, disease, 'contributes_to', { evidence: '発症に関係する要因（この患者で原因と断定はしない）' });
        });
      }
      const elderly = Number.isFinite(age) && age >= 65;
      const aging = elderly ? N('aging', 'patient_fact', `${age}歳（高齢）`) : null;

      // ③ 治療
      const surgeryRe = /([^\s、。,:：「」()（）]{0,16}(?:全摘出?術|部分切除術?|切除術|切断術|摘出術|摘除術|郭清|再建術?|置換術|形成術|吻合術|固定術|造設術|開腹術|PCI|CABG|開頭術|バイパス術|ステント留置))/;
      // 既往歴の手術（「70歳 PCI施行」など）は今回の治療にしない
      const surgeryItem = findItem(surgeryRe, i => !/既往/.test(i.fieldLabel || '') && !/^既往|\d+\s*歳|年前/.test(String(i.text).normalize('NFKC')));
      const surgeryDone = !!surgeryItem && has(/術後|手術|術式|術日|施行/);
      let surgery = null;
      if (surgeryItem) {
        const m = String(surgeryItem.text).normalize('NFKC').match(new RegExp(`${surgeryRe.source}[^、。]{0,24}`));
        const sLabel = (m ? m[0] : short(surgeryItem, 30)).replace(/^[^、。]*?(?:下で|下に|にて)/, '').replace(/(?:を)?(?:施行|実施|予定)[。.]?$/, '').replace(/を$/, '');
        surgery = N('surgery', 'treatment', sLabel, { items: [surgeryItem] });
        // がんの手術は、このあと「手術の理由」の流れ（病期 → 手術の目的 → 手術）も足す
        if (disease && !/がん|癌/.test(dxLabel)) E(surgery, disease, 'treats', { evidence: '疾患に対する手術' });
      }
      // 【がんの手術の理由】手術だけが「胃がん」につながっていて、なぜ手術をするのかが読み取れなかった（関連図の評価：2026-10-07.14）。
      // 精査・診断 → 病期（T・N・M）の意味 → 手術の理由 の順に、記録にある言葉を使ってつなぐ（手術は「治療 → 胃がん」で真下に置く）。
      if (disease && surgery && /がん|癌/.test(dxLabel)) {
        const tnm = dxLabel.normalize('NFKC').match(/T\s*(\d)[a-c]?\s*N\s*(\d)[a-c]?\s*M\s*(\d)/i);
        const examItem = findItem(/精査|健診|検診|内視鏡|生検|造影|CT|MRI/, i => !/既往/.test(i.fieldLabel || '') && i !== dxText[0] && !/FEV|SpO2|WBC|CRP/.test(String(i.text)));
        const where = (dxLabel.match(/(胃底部|噴門部?|胃体部|幽門部?|前庭部|上行結腸|下行結腸|S状結腸|直腸[^\s、,]{0,3}|[^\s、,（(]{1,4}部)/) || [])[1] || '';
        const size = (dxLabel.normalize('NFKC').match(/(\d+(?:\.\d+)?)\s*(?:mm|cm)/) || [])[0] || '';
        let exam = null;
        if (examItem) {
          const et = String(examItem.text).normalize('NFKC');
          const parts = [];
          if (/貧血/.test(et)) parts.push('貧血を指摘');
          if (/健診|検診/.test(et)) parts.unshift('健診で');
          const lead = parts.length ? parts.join('') + 'され、' : '';
          exam = N('dx_exam', 'patient_fact', `${lead}精査を受けて診断された（検査の内容は記録なし）`, { items: [examItem], max: 60 });
          E(exam, disease, 'results_in', { evidence: '精査の結果、診断された' });
        }
        const tName = { 1: '粘膜〜粘膜下層まで', 2: '固有筋層まで', 3: '漿膜下層まで', 4: '漿膜・他の臓器まで' };
        let stage = null;
        if (tnm) {
          const [, t, nn, mm] = tnm;
          const parts = [`T${t}：${tName[t] || '壁に'}浸潤`, nn === '0' ? 'N0：リンパ節転移なし' : `N${nn}：リンパ節転移あり`, mm === '0' ? 'M0：遠隔転移なし' : `M${mm}：遠隔転移あり`];
          stage = N('dx_stage', 'pathophysiology', `${where ? where + 'の' : ''}腫瘍${size ? '（' + size + '）' : ''}の広がり（${parts.join('、')}）`, { source: 'knowledge', max: 80 });
          E(disease, stage, 'results_in', { evidence: '病期分類（TNM）の読み方' });
        }
        const gast = /胃/.test(dxLabel + surgery.label);
        const aim = N('dx_aim', 'pathophysiology', '手術の対象と目的：腫瘍と周囲のリンパ節を切除し、根治をめざす', { source: 'knowledge', max: 60, evidence: gast && /全摘/.test(surgery.label) ? '切除範囲は腫瘍の位置・広がりで決まる。全摘を選んだ理由は医師の説明で確認する' : '' });
        E(stage || disease, aim, 'results_in', { evidence: tnm ? '遠隔転移がなく、切除で根治をめざせる進行度' : 'がんの根治をめざす治療方針' });
        E(surgery, aim, 'treats', { evidence: '手術の対象・目的' });
      }
      const gastric = surgery && /胃/.test(surgery.label + dxLabel) && /全摘|切除/.test(surgery.label);
      // 薬（分類ごと。何に対する治療かが分かる薬だけ）
      const drugs = typeof findDrugsInText === 'function' ? findDrugsInText(all).map(x => x.drug) : [];
      const diuretic = drugs.find(d => /利尿/.test(d.cls));

      // ④ 術後の呼吸（全身麻酔・創部痛・喫煙・加齢が「排痰困難」に合流する）
      // 術後の痛みの記録（受傷時の「転倒して痛くて動けない」などは術後の創部痛にしない）
      const painItem = findItem(/創部痛|創痛|NRS/) || findItem(/疼痛|痛み|痛い/, i => !/転倒|受傷|搬送|入院前|自宅/.test(i.text));
      const nrs = (all.match(/NRS\s*[:：]?\s*(\d+(?:\s*\/\s*10)?)/) || [])[1];
      const sputumItem = findItem(/喀痰|痰|湿性咳嗽/);
      // 【今ある／リスクの判定】「痰がある」だけでは非効果的気道浄化にしない。痰を出せない・多い・咳が弱い・湿性咳嗽・
      // ラ音・喘鳴など、実際の症状があるときだけ（看護問題の判定基準の見直し：2026-10-06.25）
      // （「出せない」の「ない」で打ち消しと読まれないよう、「ない」まで含めて探す）
      // 【言い切れる根拠】痰を出せない・出しにくい・咳が弱い・ラ音など、気道浄化の障害を示す所見だけを「排痰困難」の根拠にする。
      // 湿性咳嗽が「時々ある」だけでは、排痰できていないとは言えない（観察すべき所見として別に扱う）
      const sputumActual = findItem(/痰[^\n]{0,8}(?:出せない|出せず|出し(?:にく|づら)い|貯留|絡んで(?:出せ|取れ)ない)|喀出困難|咳[^\n]{0,4}(?:弱い|弱く|できない)|ラ音|副雑音|喘鳴/);
      const sputumWet = sputumActual ? null : findItem(/湿性咳嗽|痰[^\n]{0,8}(?:多い|多く|絡む|絡ん|からみ|からむ)|咳嗽[^\n]{0,6}あり/);
      const patternItem = findItem(/浅い呼吸|呼吸が浅|努力呼吸|呼吸補助筋|肩呼吸|頻呼吸|鼻翼呼吸|陥没呼吸/, i => notHist(i));
      const secretionObs = has(/副雑音|ラ音|痰貯留|分泌物の?貯留/);
      const atelObs = items.some(i => i.type !== 'unnecessary' && !/[「」]/.test(String(i.text)) && /(?:無気肺|肺炎)(?:と診断|を発症|を併発|を認め|あり|の所見|疑い)|(?:胸部[XＸ]-?[PＰ]|CT|レントゲン)[^\n。]{0,24}(?:無気肺|肺炎|浸潤影)/.test(String(i.text).normalize('NFKC')) && !/リスク|予防|の可能性|の恐れ|のおそれ|なし|認めず/.test(String(i.text)));
      const spo2 = lab('SpO2');
      const wbcEarly = lab('WBC'), crpEarly = lab('CRP');
      const o2Item = findItem(/酸素\s*\d|(?<!Sp)O2\s*\d|カニュ[ラー]|酸素マスク|リザーバー|酸素投与/);
      const fev = all.match(/FEV1(?:\.0)?\s*%?\s*[:：]?\s*(\d+(?:\.\d+)?)\s*%/);
      let invasion = null, pain = null;
      if (surgery && surgeryDone) {
        invasion = N('invasion', 'pathophysiology', '手術侵襲（組織の損傷）', { source: 'knowledge' });
        E(surgery, invasion, 'causes', { evidence: '手術により組織が損傷する' });
        pain = N('pain', 'symptom', `創部痛${nrs ? `（NRS ${nrs.replace(/\s/g, '')}）` : ''}`, { items: [painItem], observed: !!painItem });
        E(invasion, pain, 'causes', { evidence: '組織損傷による疼痛刺激', predicted: !painItem });
        const analgesiaItem = findItem(/PCA|硬膜外|鎮痛|ロキソ|アセトアミノフェン|カロナール|フェンタニル|モルヒネ|オキシコドン/);
        if (analgesiaItem && painItem) { const an = N('analgesia', 'treatment', /PCA|硬膜外/.test(analgesiaItem.text) ? '鎮痛薬・硬膜外PCA' : '鎮痛薬', { items: [analgesiaItem] }); E(an, pain, 'treats', { evidence: '創部痛に対する鎮痛' }); }
        const suppress = N('suppress', 'pathophysiology', '深呼吸・咳嗽の抑制', { source: 'knowledge', observed: !!painItem });
        // 【呼吸のひな形】麻酔 → 咳嗽反射の低下、疼痛 → 深呼吸・咳嗽の抑制 の2本を「排痰困難」で合流させ、→ 分泌物の貯留 →
        // 無気肺・肺炎の可能性。この流れの間には＋補足を入れない（同じ内容の四角が並んでいた。関連図の評価：2026-10-07.6）
        E(pain, suppress, 'causes', { evidence: '痛みで深く息を吸う・咳をするのを控える', predicted: !painItem, noBridge: true });
        const anesMentioned = has(/全身麻酔|挿管/);
        const anes = N('anes', 'treatment', '全身麻酔・気管内挿管（手術時）', { source: anesMentioned ? 'record' : 'knowledge' });
        const reflex = N('reflex', 'pathophysiology', '咳嗽反射の低下・気道クリアランスの低下', { source: 'knowledge' });
        E(anes, reflex, 'causes', { evidence: '麻酔薬・挿管による気道の線毛運動・咳嗽反射の低下', noBridge: true });
        E(surgery, anes, 'results_in', { evidence: '手術のための麻酔' });
        const sputum = N('sputum', 'symptom', sputumActual ? `排痰困難（${short(sputumActual, 24)}）` : sputumWet ? `湿性咳嗽・痰の絡み（${short(sputumWet, 24)}）` : '排痰困難', { items: [sputumActual || sputumWet], observed: !!(sputumActual || sputumWet) });
        E(suppress, sputum, 'causes', { evidence: '咳が弱く痰を出しにくい', predicted: !sputumActual, noBridge: true });
        E(reflex, sputum, 'contributes_to', { evidence: '気道の分泌物を出す力が下がる', predicted: !sputumActual, noBridge: true });
        let reserve = null;
        if (smoke || aging || fev) {
          reserve = N('reserve', 'pathophysiology', smoke ? '気道の線毛機能の低下・分泌物の増加（呼吸予備力の低下）' : '加齢による呼吸予備力の低下', { source: 'knowledge' });
          if (smoke) E(smoke, reserve, 'contributes_to', { evidence: '喫煙による気道への影響' });
          if (aging) E(aging, reserve, 'contributes_to', { evidence: '加齢による呼吸機能の低下' });
          if (fev) E(N('lab_fev', 'lab', `FEV1% ${fev[1]}%`), reserve, 'supports', { evidence: 'FEV1%70%未満は閉塞性の換気障害の目安' });
          E(reserve, sputum, 'contributes_to', { evidence: '分泌物が多く出しにくい', predicted: !sputumActual });
        }
        const secretion = N('secretion', 'pathophysiology', '気道内の分泌物の貯留', { source: secretionObs ? 'record' : 'knowledge', observed: secretionObs });
        E(sputum, secretion, 'causes', { predicted: !secretionObs, evidence: '出せない痰が気道にたまる' });
        const atel = N('atel', atelObs ? 'symptom' : 'future_risk', atelObs ? '無気肺・肺炎' : '無気肺・肺炎の可能性', { observed: atelObs, source: atelObs ? 'record' : 'knowledge' });
        E(secretion, atel, atelObs ? 'causes' : 'predicts', { predicted: !atelObs, evidence: '分泌物で気道が詰まり肺胞がつぶれる・感染する', noBridge: true });
        const pResp = N('p_resp', 'nursing_problem', sputumActual ? '非効果的気道浄化' : '術後呼吸器合併症リスク状態', { cat: 'resp' });
        E(sputum, pResp, 'results_in', { evidence: '排痰困難', predicted: !sputumActual });
        // 浅い呼吸・努力呼吸などが記録にあれば「非効果的呼吸パターン」（痛みで深呼吸を控える → 浅い呼吸）
        if (patternItem) { const pt = N('pattern_sign', 'symptom', short(patternItem, 30, /浅い|努力|補助筋|肩呼吸|頻呼吸|鼻翼|陥没/), { items: [patternItem] }); E(suppress, pt, 'causes', { evidence: '痛みで深く息を吸えない' }); E(pt, N('p_pattern', 'nursing_problem', '非効果的呼吸パターン', { cat: 'resp' }), 'results_in'); }
        E(atel, pResp, 'results_in', { predicted: !atelObs, evidence: '術後呼吸器合併症の予防が必要' });
        if (spo2 && (spo2.flag || o2Item)) {
          const sp = labNode(spo2, 'lab_spo2');
          if (o2Item) sp.label = /SpO2/i.test(o2Item.text) ? short(o2Item, 30) : rmShorten(`${spo2.text}（${short(o2Item, 14)}）`, 40);
          E(sp, pResp, 'supports', { evidence: '酸素化の状態を示す' });
        }
      }

      // ⑤ 心不全
      if (/心不全/.test(dxLabel || all)) {
        const hf = N('hf_path', 'pathophysiology', '心拍出量の低下・肺うっ血', { source: 'knowledge' });
        if (disease) E(disease, hf, 'causes', { evidence: '左心機能の低下' });
        const bnp = lab('BNP') || lab('NT-proBNP');
        if (bnp) E(labNode(bnp), hf, 'supports', { evidence: '心臓への負担を示す' });
        const dysItem = findItem(/呼吸困難|起座呼吸|息切れ|息が苦し|横になれない/, i => notHist(i) && i.type !== 's') || findItem(/呼吸困難|起座呼吸|息切れ|息が苦し|横になれない/);
        let dys = null;
        if (dysItem) { dys = N('dyspnea', 'symptom', short(dysItem, 36, /呼吸困難|起座呼吸|息切れ|息が苦し|横になれない/), { items: [dysItem] }); E(hf, dys, 'causes', { evidence: '肺うっ血でガス交換が妨げられる' }); }
        if (spo2 && spo2.flag === 'low' || dys) {
          const hyp = N('hypoxia', 'pathophysiology', '酸素化の低下', { source: 'knowledge', observed: !!(spo2 && spo2.flag === 'low') || !!dys });
          E(hf, hyp, 'causes');
          if (spo2) E(labNode(spo2, 'lab_spo2'), hyp, 'supports', { evidence: 'SpO2の低下' });
          if (o2Item) E(N('o2', 'treatment', o2Label(), { items: [o2Item] }), hyp, 'treats', { evidence: '酸素化の維持' });
          // ガス交換障害は、SpO2の低下だけでは決めない（呼吸困難・酸素が要ることと合わせる）
          if ((spo2 && spo2.flag === 'low' && (dys || o2Item)) || (dys && o2Item)) {
            const pGas = N('p_gas', 'nursing_problem', 'ガス交換障害', { cat: 'resp' });
            E(hyp, pGas, 'results_in'); if (dys) E(dys, pGas, 'results_in');
          } else if (dys) E(dys, N('p_pattern', 'nursing_problem', '非効果的呼吸パターン', { cat: 'resp' }), 'results_in');
        }
        const edemaItem = findItem(/浮腫|むくみ/, notHist) || findItem(/浮腫|むくみ|体重[^\n]{0,8}増加/);
        if (edemaItem) {
          const fluid = N('fluid', 'pathophysiology', '腎血流量の低下・体液の貯留', { source: 'knowledge' });
          E(hf, fluid, 'causes');
          const ed = N('edema', 'symptom', short(edemaItem, 36, /浮腫|むくみ/), { items: [edemaItem] });
          E(fluid, ed, 'causes');
          const pFluid = N('p_fluid', 'nursing_problem', '体液量過剰', { cat: 'circ' });
          E(ed, pFluid, 'results_in');
          if (diuretic) { const du = N('diuretic', 'treatment', `利尿薬（${diuretic.name}）`); E(du, fluid, 'treats', { evidence: '体液の貯留に対して' }); }
        }
        // 増悪の誘因：塩分のとりすぎ・内服の飲み忘れ（認知機能の低下があれば、それも）→ 退院後の自己管理の問題
        const saltItem = findItem(/塩辛|漬物|塩分[^\n]{0,6}(?:多|とりすぎ|摂りすぎ)|味の濃い/);
        const medItem = findItem(/飲み忘れ|内服を忘れ|薬[^\n]{0,6}忘れ|服薬[^\n]{0,6}(?:中断|自己中断)/);
        if (saltItem || medItem) {
          const trig = N('hf_trigger', 'pathophysiology', '塩分・水分の過剰や内服の中断による心不全の増悪', { source: 'knowledge' });
          if (saltItem) E(N('salt', 'patient_fact', short(saltItem, 30), { items: [saltItem] }), trig, 'contributes_to', { evidence: '塩分で体に水分がたまる' });
          if (medItem) {
            const md = N('med_forget', 'patient_fact', short(medItem, 30), { items: [medItem] });
            E(md, trig, 'contributes_to', { evidence: '利尿薬・心臓の薬が効かない' });
            const dem = findItem(/認知症|物忘れ|認知機能(?:の)?低下/);
            if (dem) E(N('dementia', 'patient_fact', short(dem, 30), { items: [dem] }), trig, 'contributes_to', { evidence: '薬や食事の管理を覚えておくことが難しい' });
          }
          E(trig, disease || hf, 'contributes_to', { evidence: '心臓の負担が増える' });
          E(trig, N('p_mgmt', 'nursing_problem', '非効果的健康自主管理（塩分制限・内服の継続）', { cat: 'mgmt' }), 'results_in');
        }
      }
      // ⑤-2 肺炎など（手術の無い呼吸器の感染）：炎症 → 痰・ラ音 → 気道浄化／酸素化の低下 → ガス交換。抗菌薬・吸引・酸素は治療 → 対象
      if (!(surgery && surgeryDone) && /肺炎|気管支炎|COPD|慢性閉塞|呼吸不全|肺気腫/.test(dxLabel)) {
        const lung = N('lung_inflam', 'pathophysiology', '肺胞・気道の炎症・分泌物（滲出液）の増加', { source: 'knowledge' });
        if (disease) E(disease, lung, 'causes', { evidence: '病原体による炎症' });
        const fever = lab('体温');
        // 炎症の値は、肺の炎症の四角にくっつける（値だけの四角を離れた所に置かない）
        [wbcEarly, crpEarly, fever].filter(l => l && l.flag === 'high').forEach(l => E(labNode(l), lung, 'supports', { evidence: '炎症の強さを示す' }));
        // COPD：気道の閉塞・肺の過膨張 → 息を吐き出しにくい → CO2の貯留・呼吸にエネルギーを使う
        if (/COPD|慢性閉塞|肺気腫/.test(dxLabel)) {
          const obst = N('copd_obst', 'pathophysiology', '末梢気道の閉塞・肺の過膨張（息を吐き出しにくい）', { source: 'knowledge' });
          if (disease) E(disease, obst, 'causes', { evidence: '長年の喫煙などで気道と肺胞が壊れる' });
          const work = N('copd_work', 'pathophysiology', '呼吸に使うエネルギーの増加（呼吸補助筋を使う）', { source: 'knowledge' });
          E(obst, work, 'causes');
          // 動脈血ガスは表に出ないことがあるので、記録の文から最新の PaCO2 を読む（45Torrを超えれば高い）
          const paMatches = [...String(all).normalize('NFKC').matchAll(/PaCO2\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(?:Torr|mmHg)?/gi)];
          const paco2 = lab('PaCO2') || (paMatches.length ? (() => { const v = paMatches[paMatches.length - 1][1]; return { key: 'PaCO2', value: v, flag: Number(v) > 45 ? 'high' : '', text: `PaCO2 ${paMatches.length > 1 && paMatches[0][1] !== v ? `${paMatches[0][1]} → ` : ''}${v}Torr${Number(v) > 45 ? '↑' : ''}`, item: findItem(/PaCO2/) }; })() : null);
          if (paco2 && paco2.flag === 'high') { const co2 = N('co2', 'pathophysiology', 'CO2の貯留（換気の不足）', { source: 'knowledge' }); E(obst, co2, 'causes', { evidence: '息を吐ききれずCO2が出ていかない' }); E(labNode(paco2), co2, 'supports', { evidence: 'CO2がたまっている' }); }
        }
        // ステロイド：気道の炎症を抑える治療。副作用で血糖が上がる
        const sterItem = findItem(/ステロイド|プレドニ|メチルプレド|ソル・?メドロール|デキサメタゾン/);
        if (sterItem) {
          const st = N('steroid', 'treatment', `ステロイド${(String(sterItem.text).match(/プレドニゾロン\s*\d+\s*mg|メチルプレドニゾロン\s*\d+\s*mg/) || [''])[0] ? `（${String(sterItem.text).match(/プレドニゾロン\s*\d+\s*mg|メチルプレドニゾロン\s*\d+\s*mg/)[0]}）` : ''}`, { items: [sterItem] });
          E(st, lung, 'treats', { evidence: '気道の炎症を抑える' });
          const g2 = lab('血糖') || lab('BS');
          if (g2 && (g2.flag === 'high' || Number(String(g2.value).replace(/[^\d.]/g, '')) >= 140)) {
            if (!/↑$/.test(g2.text)) g2.text += '↑';
            const hg = N('hyperglycemia', 'pathophysiology', 'ステロイドの副作用による高血糖（インスリンの効きが悪くなる）', { source: 'knowledge' });
            E(st, hg, 'causes', { evidence: '糖を作る働きが強まる' });
            E(labNode(g2), hg, 'supports');
            // 今ある高血糖（事実）と、これからの血糖の変動（予測）を分ける
            const gv = N('glu_var', 'future_risk', 'これからも血糖が変動する可能性（高血糖・低血糖）', { source: 'knowledge', observed: false });
            E(hg, gv, 'predicts', { predicted: true, evidence: '治療・食事量・薬の量の変化で血糖が上下する' });
            E(gv, N('p_glu', 'nursing_problem', '血糖不安定リスク状態', { cat: 'skin' }), 'results_in', { predicted: true });
          }
        }
        const abx = drugs.find(d => /抗菌|抗生|ペニシリン|セフェム|セファロ|カルバペネム|マクロライド|キノロン|β-?ラクタム/.test(d.cls));
        const abxItem = abx ? null : findItem(/抗菌薬|抗生剤|抗生物質/);
        if ((abx || abxItem) && disease) E(N('abx', 'treatment', abx ? `抗菌薬（${abx.name}）` : '抗菌薬', { items: [abxItem] }), disease, 'treats', { evidence: '原因の細菌に対して' });
        const sputItem = findLast(/ラ音|水泡音|副雑音|喘鳴/) || findLast(/痰|吸引/);
        if (sputItem) {
          const sp = N('lung_sputum', 'symptom', short(sputItem, 36), { items: [sputItem] });
          // 分泌物の増加 → 出しきれず気道にたまる → 湿性ラ音など → 非効果的気道浄化（看護問題の根拠を1段ずつ見せる。
          // 吸引は「たまった分泌物」に対する治療。関連図の評価への対応：2026-10-06.24）
          const retain = N('airway_retain', 'pathophysiology', '痰を出しきれず気道に分泌物がたまる', { source: 'knowledge' });
          E(lung, retain, 'causes', { evidence: '分泌物が増え、咳で出す力が追いつかない' });
          E(retain, sp, 'causes', { evidence: 'たまった分泌物の音・所見' });
          const suc = findItem(/吸引/);
          if (suc) E(N('suction', 'treatment', '吸引', { items: [suc] }), retain, 'treats', { evidence: '自力で出せない痰に対して' });
          E(sp, N('p_airway', 'nursing_problem', '非効果的気道浄化', { cat: 'resp' }), 'results_in');
        }
        const rr = lab('呼吸数');
        const dysS = items.find(i => i.type === 's' && /苦し|息/.test(i.text) && !rmIsFamilySpeech(i.text));
        if ((spo2 && spo2.flag === 'low') || (rr && rr.flag === 'high') || dysS) {
          const hyp = N('lung_hyp', 'pathophysiology', '肺胞でのガス交換の低下（酸素化の低下）', { source: 'knowledge' });
          E(lung, hyp, 'causes', { evidence: '炎症で肺胞に空気が入りにくい' });
          if (nodes.has('copd_obst')) E(nodes.get('copd_obst'), hyp, 'causes', { evidence: '古い空気が肺に残る' });
          if (nodes.has('co2')) E(nodes.get('co2'), nodes.get('p_gas') || N('p_gas', 'nursing_problem', 'ガス交換障害', { cat: 'resp' }), 'results_in');
          if (spo2) E(labNode(spo2, 'lab_spo2'), hyp, 'supports', { evidence: '酸素化を示す' });
          if (rr && rr.flag) E(labNode(rr), hyp, 'supports', { evidence: '呼吸数で補っている' });
          if (o2Item) E(N('o2', 'treatment', o2Label(), { items: [o2Item] }), hyp, 'treats', { evidence: '酸素化の維持' });
          // ガス交換障害は SpO2 の低下＋呼吸困難（または酸素が要る）、または CO2 の貯留があるとき。
          // 呼吸数が多い・努力呼吸だけなら「非効果的呼吸パターン」
          const gasOk = (spo2 && spo2.flag === 'low' && (dysS || o2Item)) || nodes.has('co2');
          const pg = gasOk ? N('p_gas', 'nursing_problem', 'ガス交換障害', { cat: 'resp' }) : N('p_pattern', 'nursing_problem', '非効果的呼吸パターン', { cat: 'resp' });
          E(hyp, pg, 'results_in');
          // 本人の「息が苦しい」は、ガス交換の低下の結果として間に置く（原因の無い四角として左端に置くと、
          // 線が重なって「息苦しさ → 気道の閉塞」のように見えていた。長文事例のテスト：COPD）
          if (dysS) { const ds = N('dys_s', 'symptom', `S：${short(dysS, 24)}`, { items: [dysS] }); E(hyp, ds, 'causes', { evidence: '酸素が足りず息苦しい' }); E(ds, pg, 'results_in'); }
        }
      }
      // ⑤-3 嚥下機能の低下 → 誤嚥（誤嚥性肺炎の原因・再発のおそれ）
      const notDx = i => !(disease && disease.itemIds.includes(i.id)) && !(i.fieldLabel && /診断|病名/.test(i.fieldLabel));
      const swallowItem = findLast(/むせ|嚥下(?:障害|機能の?低下|困難)/, notDx) || findLast(/誤嚥/, notDx);
      if (swallowItem) {
        const sw = N('swallow', 'pathophysiology', '嚥下反射・咳反射の低下', { source: 'knowledge' });
        // むせ・湿性嗄声・飲み込みにくさが実際にある → 今ある「嚥下障害」。無ければ「誤嚥リスク状態」
        const swSign = /むせ|湿性嗄声|飲み込(?:み|め)(?:にく|づら|ない)|嚥下困難|口に溜め|食物残留/.test(String(swallowItem.text));
        const swNode = N('swallow_sign', swSign ? 'symptom' : 'patient_fact', short(swallowItem, 36), { items: [swallowItem] });
        if (swSign) E(sw, swNode, 'causes', { evidence: '飲み込む力・咳の反射が弱い' });
        else E(swNode, sw, 'supports', { evidence: '誤嚥の記録' });
        const histNeuro = findItem(/脳梗塞|脳出血|パーキンソン|認知症|ALS/, i => i !== swallowItem && !(disease && disease.itemIds.includes(i.id)));
        if (histNeuro) E(N('neuro_hist', 'patient_fact', short(histNeuro, 34), { items: [histNeuro] }), sw, 'contributes_to', { evidence: '脳・神経の病気で嚥下にかかわる神経・筋の働きが落ちる' });
        if (aging) E(aging, sw, 'contributes_to', { evidence: '加齢による嚥下機能の低下' });
        const oral = findItem(/口腔[^\n]{0,6}(?:乾燥|汚染|不良)|舌苔|口臭/);
        const asp = N('aspiration', 'future_risk', /肺炎/.test(dxLabel) ? '誤嚥（誤嚥性肺炎の再発）の可能性' : '誤嚥・誤嚥性肺炎の可能性', { source: 'knowledge', observed: false });
        E(sw, asp, 'predicts', { predicted: true, evidence: '食物・唾液が気道に入る' });
        if (oral) E(N('oral', 'symptom', short(oral, 30), { items: [oral] }), asp, 'contributes_to', { predicted: true, evidence: '口の中の細菌が増える' });
        if (disease && /肺炎/.test(dxLabel)) E(sw, disease, 'contributes_to', { evidence: '口腔内細菌を含む唾液・食物が気道へ入る' });
        if (swSign) {
          const pDys = N('p_dysphagia', 'nursing_problem', '嚥下障害', { cat: 'nutr' });
          E(swNode, pDys, 'results_in');
          E(asp, pDys, 'results_in', { predicted: true, evidence: 'このままだと誤嚥・肺炎を繰り返す' });
        } else E(asp, N('p_asp', 'nursing_problem', '誤嚥リスク状態', { cat: 'resp' }), 'results_in', { predicted: true });
      }
      // ⑤-4 脱水（発熱・絶食・水分摂取の不足）
      const feverL = lab('体温');
      const fastItem = findItem(/絶食|禁食|摂取[^\n]{0,4}(?:不良|低下|少な)|飲水[^\n]{0,4}(?:少な|不足|低下)/);
      const dryItem = findItem(/口腔[^\n]{0,6}乾燥|皮膚[^\n]{0,4}乾燥|尿[^\n]{0,6}濃|ツルゴール|口渇/);
      const bun = lab('BUN'), na = lab('Na');
      if ((feverL && feverL.flag === 'high' || fastItem) && (dryItem || (bun && bun.flag === 'high') || (na && na.flag === 'high'))) {
        const loss = N('fluid_loss', 'pathophysiology', `${feverL && feverL.flag === 'high' ? '発熱による不感蒸泄の増加・' : ''}水分摂取の不足`, { source: 'knowledge' });
        if (feverL && feverL.flag === 'high') E(labNode(feverL), loss, 'contributes_to');
        if (fastItem) E(N('fast', 'symptom', short(fastItem, 30), { items: [fastItem] }), loss, 'contributes_to');
        const dry = dryItem ? N('dry', 'symptom', short(dryItem, 32), { items: [dryItem] }) : N('dry_lab', 'pathophysiology', '血液の濃縮', { source: 'knowledge' });
        E(loss, dry, 'causes');
        [bun, na].filter(l => l && l.flag === 'high').forEach(l => E(labNode(l), dry, 'supports', { evidence: '脱水で上がる' }));
        const ivItem = findItem(/輸液|補液|点滴(?!静注)/);
        if (ivItem) E(N('iv', 'treatment', '輸液', { items: [ivItem] }), loss, 'treats', { evidence: '水分・電解質の補充' });
        E(dry, N('p_dehyd', 'nursing_problem', '体液量不足（脱水）', { cat: 'circ' }), 'results_in');
      }
      // ⑤-5 脳梗塞・脳出血：脳の神経細胞の障害 → 片麻痺・失語・嚥下障害など。抗凝固薬は血栓に対する治療で、出血のおそれ
      if (/脳梗塞|脳塞栓|脳出血|脳卒中|くも膜下/.test(dxLabel)) {
        const brainLesion = N('brain_lesion', 'pathophysiology', /出血/.test(dxLabel) ? '脳の出血・圧迫による神経細胞の障害' : '脳の血流の途絶・神経細胞の障害', { source: 'knowledge' });
        if (disease) E(disease, brainLesion, 'causes');
        const para = findLast(/片麻痺|麻痺|MMT|筋力低下/, notDxS);
        const aph = findLast(/失語|構音障害|言葉が出|呂律/, notDxS);
        const sens = findLast(/感覚(?:鈍麻|障害|低下)|しびれ/, notDxS);
        if (nodes.has('swallow')) E(brainLesion, nodes.get('swallow'), 'causes', { evidence: '嚥下にかかわる神経の障害' });
        if (para) {
          const pn = N('paralysis', 'symptom', short(para, 34), { items: [para] });
          E(brainLesion, pn, 'causes', { evidence: '運動の神経の通り道の障害' });
          if (sens && sens !== para) E(brainLesion, N('sensory', 'symptom', short(sens, 26), { items: [sens] }), 'causes');
        }
        if (aph) {
          const an = N('aphasia', 'symptom', short(aph, 34), { items: [aph] });
          E(brainLesion, an, 'causes', { evidence: '言語中枢の障害' });
          E(an, N('p_comm', 'nursing_problem', '言語的コミュニケーション障害', { cat: 'comm' }), 'results_in');
        }
        const anticoag = drugs.find(d => /抗凝固|抗血栓|DOAC|ワルファリン|ヘパリン/.test(d.cls + d.name));
        if (anticoag) {
          const ac = N('anticoag', 'treatment', `抗凝固薬（${anticoag.name}）`);
          const clot = [...nodes.values()].find(n => /心房内の血栓/.test(n.label));
          E(ac, clot || disease, 'treats', { evidence: '血栓ができるのを防ぐ（再発予防）' });
          const bleed = N('bleed', 'future_risk', '出血（脳出血・消化管出血など）の可能性', { source: 'knowledge', observed: false });
          E(ac, bleed, 'predicts', { predicted: true, evidence: '血液が固まりにくくなる' });
          const inr = lab('PT-INR');
          if (inr) E(labNode(inr), bleed, 'supports', { predicted: true, evidence: '凝固の状態を示す' });
          E(bleed, N('p_bleed', 'nursing_problem', '出血リスク状態', { cat: 'circ' }), 'results_in', { predicted: true });
        }
      }
      // ⑤-6 糖尿病：高血糖（インスリン作用の不足） → 血糖不安定
      const glu = lab('血糖') || lab('BS'), a1c = lab('HbA1c');
      if (dmItem0 && ((glu && glu.flag === 'high') || (a1c && a1c.flag === 'high'))) {
        const hg = N('hyperglycemia', 'pathophysiology', 'インスリン作用の不足による高血糖', { source: 'knowledge' });
        if (surgery && surgeryDone && invasion) E(invasion, hg, 'contributes_to', { evidence: '手術のストレスで血糖が上がる' });
        // 診断名の行そのものが糖尿病なら、その疾患の四角から高血糖へ（同じ診断名の四角を2つ作らない）
        E(disease && /診断|病名/.test(dmItem0.fieldLabel || '') ? disease : N('dm', 'patient_fact', short(dmItem0, 30), { items: [dmItem0] }), hg, 'causes');
        [glu, a1c].filter(l => l && l.flag === 'high').forEach(l => E(labNode(l), hg, 'supports'));
        const gv = N('glu_var', 'future_risk', 'これからも血糖が変動する可能性（高血糖・低血糖）', { source: 'knowledge', observed: false });
        E(hg, gv, 'predicts', { predicted: true, evidence: '手術の侵襲・食事量・インスリンの量の変化で血糖が上下する' });
        E(gv, N('p_glu', 'nursing_problem', '血糖不安定リスク状態', { cat: 'skin' }), 'results_in', { predicted: true });
      }
      // ⑤-7 糖尿病の療養・合併症（教育入院・足潰瘍・低血糖・家族）：利用者の長文事例のテスト（2026-10-07.8）
      //  高血糖 → 末梢神経障害（足の感覚の鈍さ）→ 痛みを感じず傷に気づかない → 足潰瘍 → 皮膚組織統合性障害／感染リスク。
      //  インスリン → 低血糖（実際に起きたこと）→ 血糖の変動。受診・食事・内服が続かない → 自己管理。家族の言葉 → 家族の知識不足
      if (disease && /糖尿病/.test(dxLabel)) {
        const hgN = nodes.get('hyperglycemia');
        const notTx = i => notDxS(i) && !/^治療/.test(String(i.text)) && !(i.fieldLabel && /治療/.test(i.fieldLabel));
        const ulcer = findItem(/潰瘍|壊疽|足(?:底|趾)[^\n]{0,8}(?:びらん)/, notTx);
        const neuro = findItem(/モノフィラメント|感覚[^\n]{0,8}(?:鈍|低下)|足趾の感覚|しびれ/, notDxS);
        if (ulcer) {
          const un = N('dm_ulcer', 'symptom', short(ulcer, 40, /潰瘍/), { items: [ulcer] });
          let from = hgN;
          if (neuro) {
            const nn = N('dm_neuro', 'symptom', short(neuro, 60, /モノフィラメント|感覚/).replace(/^\d{1,2}[:：]\d{2}\s*/, ''), { items: [neuro], max: 60 });
            if (hgN) E(hgN, nn, 'causes', { evidence: '高血糖が続くと末梢の神経・血管が傷む' });
            from = nn;
            const painless = findItem(/痛くない|痛みの訴えはなし|NRS\s*0/, i => notDxS(i) && i !== ulcer) || (/痛みの訴えはなし|NRS\s*0/.test(ulcer.text) ? ulcer : null);
            // 「感覚低下 → 痛みを感じにくく、傷に気づかず放置」が原因の流れ。患者の発言は、その根拠として横から添える（潰瘍の原因には見せない）
            const unaware = N('dm_unaware', 'pathophysiology', '痛みを感じにくく、傷に気づかず放置した', { source: 'knowledge' });
            E(nn, unaware, 'causes', { evidence: '足の感覚が鈍く、傷が痛みとして伝わらない' });
            if (painless && painless !== ulcer) {
              const pn = N('dm_painless', 'symptom', `S：${short(painless, 60, /痛くない|痛み/)}`, { items: [painless], max: 60 });
              E(pn, unaware, 'supports', { evidence: '本人の言葉（根拠）' });
            }
            E(unaware, un, 'contributes_to', { evidence: '気づかず放置して悪化した' });
            const shoe = findItem(/革靴|靴[^\n]{0,6}(?:合わ|きつ|硬)|素足/);
            if (shoe) E(N('dm_shoe', 'patient_fact', short(shoe, 30, /靴/), { items: [shoe] }), un, 'contributes_to', { evidence: '足への圧迫・摩擦' });
          } else if (hgN) E(hgN, un, 'contributes_to', { evidence: '高血糖で傷が治りにくい' });
          const unload = findItem(/免荷|荷重制限/);
          if (unload) E(N('dm_unload', 'treatment', '足への荷重制限（免荷）', { items: [unload] }), un, 'treats', { evidence: '潰瘍への圧迫を減らす' });
          E(un, N('p_skin', 'nursing_problem', '皮膚組織統合性障害（糖尿病性足潰瘍）', { cat: 'skin' }), 'results_in');
          // 感染：潰瘍は皮膚のバリアが壊れた状態。高血糖は免疫・創傷治癒を下げる。炎症反応は見分けに使うデータ
          const ir = N('dm_inf_risk', 'future_risk', '潰瘍部からの感染（蜂窩織炎・骨髄炎）の可能性', { source: 'knowledge', observed: false });
          E(un, ir, 'predicts', { predicted: true, evidence: '皮膚のバリアが壊れ、病原体が入りやすい' });
          if (hgN) {
            const imm = N('immune', 'pathophysiology', '免疫機能・創傷治癒の低下', { source: 'knowledge' });
            E(hgN, imm, 'contributes_to', { evidence: '高血糖による白血球機能の低下' });
            E(imm, ir, 'predicts', { predicted: true });
          }
          const pInf = N('p_inf', 'nursing_problem', '感染リスク状態', { cat: 'inf', note: '潰瘍＋炎症所見＋高血糖で、感染が悪化しやすく最優先', evidence: '潰瘍（皮膚のバリアが壊れている）・WBC/CRPの上昇・高血糖が重なり、感染すると重症化しやすいため優先度1' });
          E(ir, pInf, 'results_in', { predicted: true });
          const wbcL = lab('WBC'), crpL = lab('CRP');
          if ((wbcL && wbcL.flag === 'high') || (crpL && crpL.flag === 'high')) {
            const inf = N('inflam', 'pathophysiology', '現在の炎症所見（感染かどうかは未確定。観察が必要）', { source: 'knowledge' });
            [wbcL, crpL].filter(l => l && l.flag === 'high').forEach(l => E(labNode(l), inf, 'supports', { evidence: '炎症反応を示す（これだけで感染とは言えない）' }));
            E(inf, pInf, 'supports', { evidence: '感染の徴候がないかを見るデータ（危険因子ではない）', predicted: true });
          }
        }
        // 低血糖（実際に起きたこと）
        const hypo = findItem(/ふらふら|手が震え|冷や?汗/, i => notHist(i) && /(?:低血糖|(?<!\d)[3-6]\d\s*mg\/dL)/.test(i.text)) || findItem(/低血糖|血糖[^\n]{0,10}(?<!\d)(?:[3-6]\d)\s*mg\/dL|手が震え|冷や?汗|ふらふら/, notHist);
        if (hypo && /低血糖|(?<!\d)(?:[3-6]\d)\s*mg\/dL/.test(hypo.text)) {
          const bgm = hypo.text.match(/(?<!\d)([3-6]\d)\s*mg\/dL/);
          const hn = N('hypo', 'symptom', `低血糖の症状${bgm ? `（血糖${bgm[1]}mg/dL）` : ''}：${/震え/.test(hypo.text) ? 'ふらふら・手の震え' : short(hypo, 30, /低血糖|ふらふら|mg\/dL/)}`, { items: [hypo] });
          const ins = items.find(i => /インスリン/.test(i.text) && i.fieldLabel && /治療/.test(i.fieldLabel));
          if (ins) E(N('insulin', 'treatment', 'インスリン強化療法', { items: [ins] }), hn, 'contributes_to', { evidence: '食事量・活動量とのずれで効きすぎる' });
          // 時系列：血糖62・症状 → ブドウ糖を摂取（治療）→ 15分後に再測定82。症状が消えたかは記録に無いので補わない
          let recheckNode = null;
          const dex = findItem(/ブドウ糖/, notHist);
          if (dex) {
            const dn = N('dextrose', 'treatment', 'ブドウ糖を摂取', { items: [dex] });
            E(dn, hn, 'treats', { evidence: '低血糖への補正' });
            const rc = String(dex.text).normalize('NFKC').match(/再測定\s*(\d{2,3})\s*mg\/dL/);
            if (rc) { const rn = N('hypo_recheck', 'symptom', `15分後の再測定 血糖${rc[1]}mg/dL`, { max: 40 }); E(dn, rn, 'results_in', { evidence: '補正後の血糖値' }); recheckNode = rn; }
          }
          const gvN = nodes.get('glu_var');
          if (recheckNode && gvN) E(recheckNode, gvN, 'supports', { predicted: true, evidence: '補正で戻ったあとも、血糖は変動しうる（症状が消えたかは記録なし）' });
          if (gvN) E(hn, gvN, 'predicts', { predicted: true, evidence: '退院後も起こる可能性がある' });
          else E(hn, N('p_glu', 'nursing_problem', '血糖不安定リスク状態', { cat: 'skin' }), 'results_in', { predicted: true });
        }
        // 自己管理：受診・内服・食事・飲酒・インスリン手技
        const stopItem = findItem(/自己中断|通院[^\n]{0,6}(?:中断|やめ)|内服[^\n]{0,6}不規則|飲み忘れ/);
        const lifeItem = findItem(/外食|菓子パン|21時以降/, notHist) || findItem(/外食|菓子パン|21時以降/);
        const drinkItem = findItem(/飲酒は|飲酒[^\n]{0,6}週|ビール/);
        const skillItem = findItem(/単位[^\n]{0,8}間違|覚えることが多|頭に入らない|手技[^\n]{0,8}(?:間違|できない)/, notHist);
        const careless = findItem(/面倒|やめられない|続けられ/, notHist);
        const mg = [stopItem, lifeItem, drinkItem, skillItem].filter(Boolean);
        if (mg.length >= 2) {
          // 記録にある事実だけを、そのまま看護問題への根拠にする（「食事が続かない」のような記録に無い断定はしない）
          const pm = N('p_mgmt', 'nursing_problem', '非効果的健康自主管理（食事療法・インスリン・受診の継続）', { cat: 'mgmt' });
          // 事実から看護問題へ直接つながず、「今の状態」を表す四角を1つはさむ。ここは記録の事実（通院・内服・手技）だけを述べ、
          // 記録に無いこと（食事が続かない等）は書かない。食事・飲酒の習慣は、血糖に影響する背景として添える
          const state = N('dm_selfcare', 'pathophysiology', '通院・内服・インスリン手技を、自分で続ける力がまだ十分でない', { source: 'knowledge' });
          if (stopItem) {
            const sn = N('dm_stop', 'patient_fact', '通院を自己中断・内服が不規則だった', { items: [stopItem], max: 60 });
            if (hgN) E(sn, hgN, 'contributes_to', { evidence: '治療が途切れた' });
            E(sn, state, 'causes', { noBridge: true });
          }
          if (skillItem) E(N('dm_skill', 'symptom', short(skillItem, 60, /単位|覚える|頭に入/), { items: [skillItem], max: 60 }), state, 'causes', { noBridge: true });
          const lifeItems = [lifeItem, drinkItem].filter(Boolean);
          if (lifeItems.length) E(N('dm_life', 'patient_fact', [lifeItem && '外食・菓子パン中心、夕食は21時以降', drinkItem && '飲酒は週3回'].filter(Boolean).join('。'), { items: lifeItems, max: 60 }), state, 'contributes_to', { noBridge: true, evidence: '食事の時間・内容や飲酒の習慣（記録の生活歴）も、血糖の管理に影響する' });
          E(state, pm, 'results_in', { noBridge: true });
        }
        // 家族（妻）の言葉：食事づくり・飲酒への対応・仕事復帰後の注射
        const famItems = items.filter(i => i.type === 's' && rmIsFamilySpeech(i.text) && /食事|お酒|飲酒|注射|どうすれば|わからない|自信/.test(i.text));
        if (famItems.length) {
          const fstate = N('fam_state', 'pathophysiology', '家族が、食事づくり・飲酒への対応・仕事復帰後の支え方を、具体的にまだ知らない', { source: 'knowledge' });
          const pf = N('p_family', 'nursing_problem', '家族の知識不足（食事の準備・飲酒への対応）', { cat: 'anx' });
          // 家族の発言は、「 」ごとに全文を別の四角にする（途中で切らない。飲酒への対応の根拠は妻の発言）
          const quotes = [];
          famItems.forEach(i => String(i.text).normalize('NFKC').replace(/「([^」]{4,80})」/g, (m, q) => { if (!quotes.some(x => x.q === q)) quotes.push({ q, i }); }));
          (quotes.length ? quotes.slice(0, 3) : [{ q: null, i: famItems[0] }]).forEach((x, k) => {
            const firstOfItem = quotes.findIndex(y => y.i === x.i) === k;
            const fw = N(`fam_words${k}`, 'symptom', `妻の言葉：「${x.q || short(x.i, 50)}」`.replace(/「「/, '「').replace(/」」/, '」'), { items: firstOfItem ? [x.i] : [], max: 64 });
            E(fw, fstate, 'causes', { noBridge: true });
          });
          E(fstate, pf, 'results_in', { noBridge: true });
        }
      }
      // ⑥ 利尿薬の今後のリスク
      if (diuretic) {
        const du = N('diuretic', 'treatment', `利尿薬（${diuretic.name}）`);
        if (disease && !edges.some(e => e.source === du.id)) E(du, disease, 'treats');
        // 時間の流れを分ける：今は体液量過剰（#体液量過剰）→ 治療の利尿薬 → これから過剰に水分が出る可能性（#体液量不足リスク）。
        // K が低いと記録にあれば、低K血症はもう起きている事実として別に置き、脱力・ふらつき・不整脈の可能性へつなぐ
        // （「体液量不足リスク」と実際の低K血症を1つの箱にまとめていた。関連図の評価への対応：2026-10-06.24）
        const k = lab('K');
        const kLow = !!(k && k.flag === 'low');
        // 利尿薬だけでは決めない。食事・水分の摂取の不足、発熱、下痢、尿が多いことのどれかが記録にあるとき
        const dehydFactor = findItem(/摂取[^\n]{0,4}[0-4]割|[0-4]割(?:摂取|程度)|食欲(?:不振|低下|がない)|水分[^\n]{0,6}(?:とれ|摂れ|不足|少)|下痢|38\.?\d?\s*°?C|発熱|尿量[^\n]{0,12}(?:\d{4}|多|増)/, i => notHist(i));
        if (dehydFactor) {
          const dehyd = N('dehyd', 'future_risk', '過剰な利尿による脱水の可能性', { source: 'knowledge', observed: false });
          E(du, dehyd, 'predicts', { predicted: true, evidence: '尿量の増加による' });
          E(dehyd, N('p_dehyd', 'nursing_problem', '体液量不足リスク状態（利尿薬による過剰な利尿）', { cat: 'circ' }), 'results_in', { predicted: true });
        }
        if (kLow) {
          const hk = N('hypok', 'pathophysiology', '低カリウム血症（カリウムが尿に出る）', { source: 'knowledge' });
          E(du, hk, 'causes', { evidence: 'カリウムが尿に出る' });
          E(labNode(k), hk, 'supports', { evidence: '低K血症を示す' });
          E(hk, N('hypok_eff', 'future_risk', '脱力・ふらつき・不整脈の可能性', { source: 'knowledge', observed: false }), 'predicts', { predicted: true, evidence: '筋肉・心臓の働きに影響する' });
        } else if (k && k.flag && nodes.has('dehyd')) E(labNode(k), nodes.get('dehyd'), 'supports', { predicted: true });
      }

      // ⑦ 感染（手術侵襲・ドレーン/カテーテル・糖尿病・炎症反応）
      const lineItem = findItem(/ドレーン|カテーテル|膀胱留置|バルーン|中心静脈|CV|PICC|ルート確保|持続点滴/);
      const dmItem = findItem(/糖尿病|DM\b/);
      const wbc = lab('WBC'), crp = lab('CRP');
      if ((surgery && surgeryDone) || lineItem) {
        // 【感染の経路を分ける】手術創 → 創部感染、膀胱留置カテーテル → 尿路感染 は途中まで別の流れにして、最後に
        // 感染リスク状態へ合流させる（何がどの感染を起こすかが分かるように。関連図の評価：2026-10-07.3）
        const abdominal = surgery && /胃|腸|腹腔|肝|胆|膵|脾|虫垂|ヘルニア/.test(surgery.label + dxLabel);
        const urinary = !!lineItem && /膀胱|尿道|バルーン/.test(lineItem.text);
        const ln = lineItem ? N('lines', 'treatment', short(lineItem, 30), { items: [lineItem] }) : null;
        if (ln && surgery && !edges.some(e => e.target === ln.id)) E(surgery, ln, 'results_in');
        const risks = [];
        let barrier = null;
        if ((surgery && surgeryDone) || (ln && !urinary)) {
          barrier = N('barrier', 'pathophysiology', surgery && surgeryDone ? '創部：皮膚・粘膜のバリア機能の低下' : '皮膚・粘膜のバリア機能の低下（侵襲的な処置）', { source: 'knowledge' });
          if (invasion) E(invasion, barrier, 'causes', { evidence: '創部ができる' });
          if (ln && !urinary) E(ln, barrier, 'causes', { evidence: '体の中へ管が入っている' });
          const r = N('inf_risk', 'future_risk', surgery && surgeryDone ? `創部感染${abdominal ? '・腹腔内感染' : ''}の可能性` : 'カテーテル関連感染の可能性', { source: 'knowledge', observed: false });
          E(barrier, r, 'predicts', { predicted: true, evidence: '病原体が入りやすい' });
          risks.push(r);
        }
        if (ln && urinary) {
          const up = N('uti_path', 'pathophysiology', '管を伝って尿道から細菌が膀胱へ入りやすい', { source: 'knowledge' });
          E(ln, up, 'causes', { evidence: '膀胱留置カテーテルは尿路感染のいちばん多い原因' });
          const r = N('inf_uti', 'future_risk', '尿路感染の可能性', { source: 'knowledge', observed: false });
          E(up, r, 'predicts', { predicted: true });
          risks.push(r);
        }
        const infRisk = risks[0];
        if (dmItem) {
          const dm = N('dm', 'patient_fact', short(dmItem, 30), { items: [dmItem] });
          const imm = N('immune', 'pathophysiology', '免疫機能・創傷治癒の低下', { source: 'knowledge' });
          E(nodes.get('hyperglycemia') || dm, imm, 'contributes_to', { evidence: '高血糖による白血球機能の低下' });
          risks.forEach(r => E(imm, r, 'predicts', { predicted: true }));
        }
        if ((wbc && wbc.flag === 'high') || (crp && crp.flag === 'high')) {
          const inf = N('inflam', 'pathophysiology', surgery ? '手術侵襲による炎症反応（感染との見分けが必要）' : '炎症反応の上昇（原因の確認が必要）', { source: 'knowledge' });
          if (invasion) E(invasion, inf, 'causes', { evidence: '術後は手術侵襲でも炎症反応が上がる' });
          [wbc, crp, lab('体温')].filter(l => l && l.flag === 'high').forEach(l => E(labNode(l), inf, 'supports', { evidence: '炎症反応を示す（これだけで感染とは言えない）' }));
        }
        const pInf = N('p_inf', 'nursing_problem', '感染リスク状態', { cat: 'inf' });
        risks.forEach(r => E(r, pInf, 'results_in', { predicted: true }));
        // 炎症反応は「感染しやすい理由（危険因子）」ではない。感染の徴候が出ていないかを見るためのデータとして
        // 看護問題へ「根拠」の線でつなぐ（「感染の可能性」の手前には置かない。看護問題の判定基準の見直し：2026-10-06.25）
        // （主な流れは「創部・管 → 感染の経路 → 感染リスク」。炎症反応は見分けに使う観察データなので、破線の細い線にして目立たせない：2026-10-07.3）
        if (nodes.has('inflam')) E(nodes.get('inflam'), pInf, 'supports', { evidence: '感染の徴候がないかを見るデータ（危険因子ではない）', predicted: true });
      }

      // ⑦-2 脊髄損傷：頸髄・胸髄の損傷 → 呼吸筋の麻痺で咳が弱い（→ 排痰困難）、膀胱の神経の障害 → 尿を自分で出せない（→ 留置カテーテル）
      // （手術・カテーテルの「治療」だけから看護問題へつながり、患者の事実からたどれなかった：頸髄損傷の事例 2026-10-07.3）
      if (disease && /脊髄損傷|頸髄損傷|胸髄損傷|脊損|頸損/.test(dxLabel)) {
        const cervical = /頸髄|頸損|C[1-8]/.test(dxLabel);
        // 麻痺（損傷した高さより下の運動・感覚の麻痺）。身体可動性障害・褥瘡・障害受容のもとになる
        const sciPara = findLast(/麻痺|MMT|筋力低下|感覚(?:障害|低下|脱失)/, notDxS);
        if (sciPara && !nodes.has('paralysis')) {
          const pn = N('paralysis', 'symptom', short(sciPara, 34, /麻痺|MMT|筋力|感覚/).replace(/^\d{1,2}\/\d{1,2}\s*/, ''), { items: [sciPara] });
          E(disease, pn, 'causes', { evidence: '損傷した高さより下の神経の命令が届かない' });
        }
        if (cervical && nodes.has('sputum')) {
          const rm = N('sci_resp', 'pathophysiology', '呼吸筋（肋間筋・腹筋）の麻痺で咳が弱い', { source: 'knowledge' });
          E(disease, rm, 'causes', { evidence: '頸髄の損傷で、呼吸を助ける筋肉が動かない' });
          E(rm, nodes.get('sputum'), 'causes', { evidence: '強い咳ができず、痰を出しにくい', predicted: !sputumActual });
        }
        const ln = nodes.get('lines');
        if (ln && /膀胱|尿道|バルーン/.test(ln.label)) {
          const nb = N('sci_bladder', 'pathophysiology', '神経因性膀胱（自分で尿を出せない）', { source: 'knowledge' });
          E(disease, nb, 'causes', { evidence: '脊髄の損傷で、排尿の神経の命令が届かない' });
          E(ln, nb, 'treats', { evidence: '自分で出せない尿を管で出す' });
        }
      }

      // ⑧ 疼痛
      if (pain && painItem) E(pain, N('p_pain', 'nursing_problem', '急性疼痛（手術創部の侵襲）', { cat: 'pain' }), 'results_in');

      // ⑧-2 腹部の手術後の腸の動きの低下（術後イレウス）：手術操作・麻酔・オピオイド・安静 → 腸蠕動の低下 → 腹部膨満・排ガスなし
      const abdOp = surgery && surgeryDone && /胃|腸|結腸|直腸|腹腔|肝|胆|膵|脾|虫垂|ヘルニア|子宮|卵巣/.test(surgery.label + dxLabel);
      const ileusItem = abdOp && findItem(/排ガス(?:なし|が無い|がない)|腸蠕動[^\n]{0,4}(?:弱|低下|減弱|聴取できず)|腹部膨満|イレウス|嘔吐|悪心|嘔気/);
      const opiItem = findItem(/オピオイド|フェンタニル|モルヒネ|オキシコドン/);
      if (abdOp) {
        const il = N('ileus_path', 'pathophysiology', '腸の動き（蠕動運動）の低下', { source: 'knowledge', observed: !!ileusItem });
        E(invasion || surgery, il, 'causes', { evidence: '手術で腸を触ったり麻酔を使ったりすると腸の動きが止まる', predicted: !ileusItem });
        // 腸の動きの低下は、手術操作だけでなく、麻酔・鎮痛薬からも（関連図の評価：2026-10-07.3）
        if (nodes.has('anes')) E(nodes.get('anes'), il, 'contributes_to', { evidence: '麻酔薬で腸の動きが一時的に止まる', predicted: !ileusItem });
        const anaN = nodes.get('analgesia');
        if (!opiItem && anaN && /PCA|硬膜外|オピオイド|麻薬/.test(anaN.label)) E(anaN, il, 'contributes_to', { evidence: '鎮痛薬にオピオイドを含むと腸の動きを抑える', predicted: true });
        if (opiItem && pain && painItem) E(N('opioid', 'treatment', `オピオイド（${(String(opiItem.text).match(/フェンタニル|モルヒネ|オキシコドン/) || ['鎮痛薬'])[0]}）`, { items: [opiItem] }), pain, 'treats', { evidence: '痛みを和らげる' });
        if (opiItem) E(N('opioid', 'treatment', `オピオイド（${(String(opiItem.text).match(/フェンタニル|モルヒネ|オキシコドン/) || ['鎮痛薬'])[0]}）`, { items: [opiItem] }), il, 'contributes_to', { evidence: '副作用で腸の動きを抑える' });
        const ileusRisk = N('ileus_risk', 'future_risk', '術後イレウス（腸閉塞）の可能性', { source: 'knowledge', observed: false });
        // 【今ある／リスク】腹部膨満・排ガスなし・腸蠕動の低下・悪心・嘔吐が実際にある → 今ある「消化管運動機能障害」。
        // まだ無い（腹部の手術・麻酔・オピオイド・安静の要因だけ）→「消化管運動機能障害リスク状態」。
        // 「便秘」とイレウスは別のもの（看護問題の判定基準の見直し：2026-10-06.25）
        if (ileusItem) {
          const sign = N('ileus_sign', 'symptom', short(ileusItem, 30, /排ガス|蠕動|膨満|イレウス|嘔吐|悪心|嘔気/), { items: [ileusItem] });
          E(il, sign, 'causes');
          E(sign, ileusRisk, 'predicts', { predicted: true });
          const pGi = N('p_elim', 'nursing_problem', '消化管運動機能障害（術後の腸蠕動の低下）', { cat: 'elim' });
          E(sign, pGi, 'results_in');
          E(ileusRisk, pGi, 'results_in', { predicted: true, evidence: '進むと術後イレウスになる' });
        } else {
          E(il, ileusRisk, 'predicts', { predicted: true });
          E(ileusRisk, N('p_elim', 'nursing_problem', '消化管運動機能障害リスク状態（術後イレウス）', { cat: 'elim' }), 'results_in', { predicted: true });
        }
      }

      // ⑨ 栄養
      const albL = lab('Alb') || lab('TP');
      const weightItem = findItem(/体重[^\n]{0,12}(?:減少|減|kg減)|kg減少/);
      const intakeItem = findItem(/摂取[^\n]{0,4}[0-4]割|[0-4]割摂取|食事量[^\n]{0,6}(?:低下|減)|食欲(?:不振|低下|がない)|絶食|禁食/);
      let nutrSign = null;
      if (gastric && surgeryDone) {
        const loss = N('gastric_loss', 'pathophysiology', '胃の貯留機能の消失（胃切除後）', { source: 'knowledge' });
        E(surgery, loss, 'causes', { evidence: '胃を切除したため' });
        const once = N('intake_once', 'pathophysiology', '1回に食べられる量の低下・食事の急速な流入', { source: 'knowledge' });
        E(loss, once, 'causes');
        E(once, N('dumping', 'future_risk', 'ダンピング症候群の可能性', { source: 'knowledge', observed: false }), 'predicts', { predicted: true, evidence: '食べ物が急に小腸へ流れ込む' });
        const b12 = N('b12', 'future_risk', 'ビタミンB12の吸収障害 → 巨赤芽球性貧血の可能性', { source: 'knowledge', observed: false });
        E(loss, b12, 'predicts', { predicted: true, evidence: '内因子の分泌がなくなる' });
        nutrSign = once;
      }
      // 食事を全量〜8割食べている（体重も減っていない）ときは、Albが少し低いだけでは栄養摂取量不足にしない（糖尿病の長文事例：2026-10-07.8）
      const fullIntake = /糖尿病/.test(dxLabel) && !weightItem && !intakeItem && findItem(/全量摂取|[7-9]割(?:を)?摂取|10割/);
      if (!fullIntake && (weightItem || (albL && albL.flag === 'low') || intakeItem)) {
        // 主な流れは「食事摂取の低下 → 栄養摂取量不足」。Albは横から根拠データとして付ける（関連図の評価：2026-10-07.6）
        const low = (weightItem || intakeItem)
          ? N('undernutrition', 'symptom', [weightItem && short(weightItem, 20), intakeItem && short(intakeItem, 16)].filter(Boolean).join('・'), { items: [weightItem, intakeItem] })
          : N('undernutrition', 'pathophysiology', '食事摂取量の低下', { source: 'knowledge' });
        // Alb は「食事量の低下の結果」ではなく、栄養状態を考える客観データ。食事量・体重の記録があるときは、
        // 看護問題（栄養摂取量不足）の根拠として横（下）に付ける（関連図の評価への対応：2026-10-06.24）
        const albToProblem = !!albL;
        if (albL && !albToProblem) E(labNode(albL), low, 'supports', { evidence: '栄養状態を示す' });
        if (nutrSign) E(nutrSign, low, 'causes');
        else if (nodes.has('ileus_path') && nodes.get('ileus_path').observed !== false) E(nodes.get('ileus_path'), low, 'causes', { evidence: '食事を進められない' });
        else if (nodes.has('copd_work')) E(nodes.get('copd_work'), low, 'causes', { evidence: '食べると息切れし、呼吸でエネルギーを使う' });
        else if (intakeItem && /絶食|禁食/.test(intakeItem.text) && [...nodes.values()].some(n => /嚥下反射|嚥下機能|誤嚥/.test(n.label) && n.type !== 'nursing_problem' && n.type !== 'future_risk'))
          E([...nodes.values()].find(n => /嚥下反射|嚥下機能|誤嚥/.test(n.label) && n.type !== 'nursing_problem' && n.type !== 'future_risk'), low, 'contributes_to', { evidence: '誤嚥を防ぐため食事を止めている' });
        else if (disease) E(disease, low, 'contributes_to');
        const lowSalt = findItem(/塩分制限|減塩/);
        if (lowSalt && intakeItem && /味がしない|味が薄|おいしくない/.test(intakeItem.text)) E(N('lowsalt', 'treatment', '塩分制限食', { items: [lowSalt] }), low, 'contributes_to', { evidence: '味が薄く食欲が落ちる' });
        const pNutr = N('p_nutr', 'nursing_problem', gastric ? '栄養摂取量不足（消化吸収の変化に関連した低栄養状態）' : '栄養摂取量不足', { cat: 'nutr' });
        E(low, pNutr, 'results_in', { noBridge: true }); // 「食事摂取の低下 → 栄養摂取量不足」の間に同じ意味の四角を入れない
        if (albToProblem) E(labNode(albL), pNutr, 'supports', { evidence: '栄養状態を示す客観データ' });
      } else if (nutrSign) E(nutrSign, N('p_nutr', 'nursing_problem', '栄養摂取量不足（消化吸収の変化に関連）', { cat: 'nutr' }), 'results_in', { predicted: true });

      // ⑨-2 貧血（術後の出血など）
      const hb = lab('Hb');
      if (hb && hb.flag === 'low') {
        const anemia = N('anemia', 'pathophysiology', surgery && surgeryDone ? '術中・術後の出血による貧血（酸素運搬能の低下）' : '貧血（酸素運搬能の低下）', { source: 'knowledge' });
        E(labNode(hb), anemia, 'supports', { evidence: 'Hbの低下' });
        if (surgery && surgeryDone) E(invasion || surgery, anemia, 'contributes_to', { evidence: '手術中・後の出血' });
      }
      // ⑨-3 深部静脈血栓症（下肢・骨盤の手術、長い臥床、Dダイマー）
      const ddMatch = all.match(/D\s*-?\s*ダイマー\s*[:：]?\s*(\d+(?:\.\d+)?)/);
      const lowerLimbOp = surgery && /股関節|大腿|膝|下肢|人工骨頭|人工関節|骨盤|脊椎/.test(surgery.label + dxLabel);
      if (lowerLimbOp || (ddMatch && Number(ddMatch[1]) >= 1)) {
        const stasis = N('stasis', 'pathophysiology', lowerLimbOp ? '安静・下肢の手術による静脈血のうっ滞・凝固能の亢進' : '術後の安静による静脈血のうっ滞・手術侵襲による凝固能の亢進', { source: 'knowledge' });
        const obeseItem = findItem(/肥満|BMI\s*[:：]?\s*(?:2[5-9]|[3-4]\d)/);
        if (obeseItem) E(N('obese', 'patient_fact', (String(obeseItem.text).match(/肥満(?:\s*[（(]BMI\s*[\d.]+[）)])?|BMI\s*[\d.]+/) || ['肥満'])[0], { items: [obeseItem] }), stasis, 'contributes_to', { evidence: '肥満は血栓の危険因子' });
        if (invasion) E(invasion, stasis, 'contributes_to', { evidence: '手術侵襲で血液が固まりやすくなる' });
        const dvt = N('dvt', 'future_risk', '深部静脈血栓症・肺塞栓症の可能性', { source: 'knowledge', observed: false });
        E(stasis, dvt, 'predicts', { predicted: true, evidence: '血栓ができやすい' });
        const pDvt = N('p_dvt', 'nursing_problem', '静脈血栓塞栓症リスク状態（深部静脈血栓症・肺塞栓症）', { cat: 'circ' });
        E(dvt, pDvt, 'results_in', { predicted: true });
        // Dダイマーは「血栓ができやすい理由」ではなく、血栓を疑うときの検査データ。看護問題の根拠として横（下）に付ける
        if (ddMatch) E(N('lab_dd', 'lab', `Dダイマー ${ddMatch[1]}μg/mL`, { items: [findItem(/ダイマー/)] }), pDvt, 'supports', { evidence: '血栓を疑うときに参考にする検査（危険因子ではない）' });
      }
      // ⑨-4 人工骨頭・人工股関節の脱臼
      const dislocation = surgery && /人工骨頭|人工股関節|THA|BHA/.test(surgery.label);
      // ⑨-5 術後せん妄・認知機能
      const delItem = findItem(/せん妄|見当識|ここはどこ|家に帰る|大声|点滴を触|ルートを触|自己抜去|興奮|つじつま/);
      const dementiaItem = findItem(/認知症|認知機能(?:の)?低下/);
      if (delItem) {
        const del = N('delirium', 'symptom', short(delItem, 36), { items: [delItem] });
        const brain = N('brain', 'pathophysiology', '脳機能の一時的な低下・環境の変化（術後せん妄）', { source: 'knowledge' });
        E(brain, del, 'causes', { evidence: '手術・入院・痛み・環境の変化が重なる' });
        if (aging) E(aging, brain, 'contributes_to', { evidence: '高齢はせん妄の要因' });
        if (dementiaItem) E(N('dementia', 'patient_fact', short(dementiaItem, 30), { items: [dementiaItem] }), brain, 'contributes_to', { evidence: '認知症はせん妄の要因' });
        if (invasion) E(invasion, brain, 'contributes_to');
        if (pain && painItem) E(pain, brain, 'contributes_to', { evidence: '痛みはせん妄を誘発する' });
        const selfRemove = N('self_remove', 'future_risk', '点滴・ドレーン・カテーテルの自己抜去の可能性', { source: 'knowledge', observed: false });
        E(del, selfRemove, 'predicts', { predicted: true });
        E(del, N('p_delirium', 'nursing_problem', '急性混乱（術後せん妄）', { cat: 'fall' }), 'results_in');
        E(selfRemove, nodes.get('p_delirium'), 'results_in', { predicted: true });
      } else if (surgery && surgeryDone && (dementiaItem || (aging && /(?:[89]\d|7[5-9])\s*歳/.test(aging.label)) || findItem(/眠れ(?:ない|なかった|ず)|不眠|睡眠薬|眠剤/))) {
        // せん妄の症状はまだ無いが、高齢（75歳以上）・認知症・睡眠不足・手術・環境の変化がある →「急性混乱リスク状態」
        const brainR = N('brain', 'pathophysiology', '手術・入院による環境の変化（せん妄を起こしやすい）', { source: 'knowledge' });
        if (aging) E(aging, brainR, 'contributes_to', { evidence: '高齢はせん妄の要因' });
        if (dementiaItem) E(N('dementia', 'patient_fact', short(dementiaItem, 30), { items: [dementiaItem] }), brainR, 'contributes_to', { evidence: '認知症はせん妄の要因' });
        if (invasion) E(invasion, brainR, 'contributes_to');
        const delR = N('delirium_risk', 'future_risk', '術後せん妄の可能性', { source: 'knowledge', observed: false });
        E(brainR, delR, 'predicts', { predicted: true });
        E(delR, N('p_delirium', 'nursing_problem', '急性混乱リスク状態（術後せん妄）', { cat: 'fall' }), 'results_in', { predicted: true });
      }
      // ⑩ 活動・セルフケア
      // 動くこと・移動の記録（「食事を介助で摂取」などは活動の制限にしない）
      const bedItem = findLast(/安静(?!時)|臥床|ADL[^\n]{0,6}(?:低下|介助|一部)|車椅子|移乗|歩行[^\n]{0,8}(?:介助|困難|不安定)|トイレ[^\n]{0,8}介助|(?:清拭|更衣|入浴)[^\n]{0,6}(?:全?介助)|動くと[^\n]{0,4}息切れ|歩くと[^\n]{0,14}(?:低下|息切れ)/, i => notHist(i) && !/食事|摂取|むせ/.test(i.text));
      if ((pain && painItem) || bedItem || nodes.has('paralysis')) {
        const mob = N('mobility', 'pathophysiology', '体動の制限・活動耐性の低下', { source: 'knowledge' });
        if (bedItem) E(N('bed', 'symptom', short(bedItem, 32, /安静|臥床|介助|車椅子|移乗|歩行|息切れ|低下/), { items: [bedItem] }), mob, 'causes');
        if (pain && painItem) E(pain, mob, 'causes', { evidence: '痛みで動きにくい' });
        if (lineItem && nodes.has('lines')) E(nodes.get('lines'), mob, 'contributes_to', { evidence: '管があり動きにくい' });
        if (nodes.has('paralysis')) E(nodes.get('paralysis'), mob, 'causes', { evidence: '麻痺で体を動かしにくい' });
        // 清拭・更衣・排泄などに実際に介助が要る記録があれば「セルフケア不足」。無ければ、根拠があるのは「活動耐性低下」
        // （「歩くとSpO2が下がる」だけでセルフケア不足にしていた。関連図の評価への対応：2026-10-06.24）
        const adlItem = findLast(/(?:清拭|更衣|入浴|排泄|整容|洗面|トイレ|身の回り)[^\n]{0,10}(?:全?介助|一部介助|できない|手伝|見守り)|ADL[^\n]{0,6}(?:介助|一部)/, i => notHist(i));
        // 「活動耐性低下（動くと息切れ・体力の低下）」は、息切れ・SpO2の低下・疲れやすさなどの記録があるときだけ。
        // 麻痺・骨折などで「動かせない」だけなら身体可動性障害にまかせる（頸髄損傷の事例で、息切れが無いのに
        // 活動耐性低下になっていた：2026-10-07.3）
        const tolItem = findLast(/息切れ|息が切れ|SpO2[^\n]{0,12}(?:低下|↓|下が)|疲れやす|すぐ疲れ|疲労感|倦怠感/, i => notHist(i));
        const mobOnly = !adlItem && !tolItem && !(nodes.get('lung_hyp') || nodes.get('hypoxia'))
          && items.some(i => notHist(i) && /(?:寝返り|起き上が|立ち上が|起立|端坐位|歩行|移乗)[^\n]{0,10}(?:困難|できない|全?介助)|免荷|荷重(?:制限|不可)|麻痺/.test(i.text));
        const pAct = mobOnly ? null : N('p_act', 'nursing_problem', adlItem ? 'セルフケア不足（活動制限・体力の低下）' : '活動耐性低下（動くと息切れ・体力の低下）', { cat: 'act' });
        // 介助が要る記録は、図の中に根拠として見せる（「清拭・更衣に介助が必要」が「トイレまで歩くと…」と同じカードにあり、
        // 図に出ていなかった）。活動の制限 → 介助が要る → セルフケア不足
        const adlRe = /清拭|更衣|入浴|排泄|整容|洗面|身の回り|ADL|介助/;
        const adlText = adlItem ? short(adlItem, 30, adlRe) : '';
        const bedNode = nodes.get('bed');
        if (adlItem && adlRe.test(adlText) && !(bedNode && bedNode.label === adlText)) {
          const adl = N('adl', 'symptom', adlText, { items: adlItem === bedItem ? [] : [adlItem] });
          E(mob, adl, 'causes', { evidence: '動ける範囲が限られる' });
          E(adl, pAct, 'results_in');
        } else if (pAct) E(mob, pAct, 'results_in');
        if (nodes.has('ileus_path')) E(mob, nodes.get('ileus_path'), 'contributes_to', { evidence: '動かないと腸の動きも戻りにくい' });
        // 寝返り・起き上がり・立ち上がり・歩行が実際に難しい記録（麻痺・痛み・術後の制限など）→「身体可動性障害」
        const mobItem = findLast(/(?:寝返り|起き上が|立ち上が|起立|端坐位|歩行|移乗)[^\n]{0,10}(?:困難|できない|介助|不安定|ふらつ|痛)|免荷|荷重(?:制限|不可)|片麻痺|麻痺[^\n]{0,6}(?:あり|で動かない)|ベッド上安静/, i => notHist(i) && !/食事|摂取/.test(i.text));
        if (mobItem) {
          const mi = [...nodes.values()].find(n => (n.itemIds || []).includes(mobItem.id)) || N('mob_sign', 'symptom', short(mobItem, 30, /寝返り|起き上が|立ち上が|起立|端坐位|歩行|移乗|免荷|荷重|麻痺|安静/), { items: [mobItem] });
          // 麻痺があれば「疾患 → 麻痺 → 寝返り・起き上がりの介助 → 身体可動性障害」の一本道にする（体動の制限の四角を
          // 経由すると、カテーテルなどの線と近くなり視線が迷う。関連図の評価：2026-10-07.3）
          const paraN = nodes.get('paralysis');
          if (paraN && paraN !== mi) E(paraN, mi, 'causes', { evidence: '麻痺で自分では体を動かせない' });
          else if (mi !== nodes.get('bed')) E(mob, mi, 'causes', { evidence: '体を動かす力・範囲が限られる' });
          E(mi, N('p_mobility', 'nursing_problem', '身体可動性障害', { cat: 'act' }), 'results_in');
        }
        const hypN = nodes.get('lung_hyp') || nodes.get('hypoxia');
        if (hypN) E(hypN, mob, 'contributes_to', { evidence: '動くと酸素が足りず息切れする' });
      }
      if (nodes.has('mobility') && nodes.has('anemia')) E(nodes.get('anemia'), nodes.get('mobility'), 'contributes_to', { evidence: '貧血で疲れやすく動きにくい' });
      // ⑩-2 褥瘡（発赤・体位変換の困難・低栄養）
      const skinItem = findItem(/褥瘡|発赤|体位変換[^\n]{0,6}(?:困難|できない|全介助)|骨突出|DESIGN/);
      if (skinItem && !nodes.has('dm_ulcer')) {
        const sk = N('skin_sign', 'symptom', short(skinItem, 34), { items: [skinItem] });
        const press = N('pressure', 'pathophysiology', '同じ部位への長い圧迫・ずれによる皮膚の血流低下', { source: 'knowledge' });
        if (nodes.has('mobility')) E(nodes.get('mobility'), press, 'causes', { evidence: '自分で体の向きを変えにくい' });
        // 低栄養は皮膚を弱くする（Albは原因ではなく根拠データなので、栄養の四角から。無ければ「低栄養」の四角にAlbを根拠として付ける）
        if (albL && albL.flag === 'low') {
          const nu = nodes.get('undernutrition') || N('skin_nutr', 'pathophysiology', '低栄養で皮膚・皮下組織が傷つきやすい', { source: 'knowledge' });
          if (nu.key === 'skin_nutr') E(labNode(albL), nu, 'supports', { evidence: '栄養状態を示す客観データ' });
          E(nu, sk, 'contributes_to', { evidence: '低栄養で皮膚が弱くなる' });
        }
        E(press, sk, 'causes');
        E(sk, N('p_skin', 'nursing_problem', /褥瘡|d\s*[1-4]|D[3-5U]/i.test(skinItem.text) ? '皮膚統合性障害（褥瘡）' : '褥瘡のリスク状態', { cat: 'skin' }), 'results_in');
      }
      // ⑪ 転倒
      const fallItem = findItem(/ふらつ|転倒|夜間[^\n]{0,8}トイレ|頻尿/, i => !nodes.get('bed') || !nodes.get('bed').itemIds.includes(i.id)) || findItem(/ふらつ|転倒|せん妄|夜間[^\n]{0,8}トイレ|頻尿/);
      if (fallItem && (elderly || diuretic || /ふらつ|転倒/.test(fallItem.text))) {
        const fs = N('fall_sign', 'symptom', short(fallItem, 32), { items: [fallItem] });
        const fr = N('fall_risk', 'future_risk', '転倒・転落の可能性', { source: 'knowledge', observed: false });
        E(fs, fr, 'predicts', { predicted: true });
        if (aging) E(aging, fr, 'contributes_to', { predicted: true, evidence: '筋力・バランス機能の低下' });
        if (diuretic && nodes.has('diuretic')) E(nodes.get('diuretic'), fs, 'contributes_to', { evidence: '尿量が増え夜間もトイレへ行く' });
        if (nodes.has('delirium')) E(nodes.get('delirium'), fr, 'contributes_to', { predicted: true, evidence: '危険の判断がしにくい' });
        if (nodes.has('paralysis')) E(nodes.get('paralysis'), fr, 'contributes_to', { predicted: true, evidence: '麻痺側に倒れやすい' });
        const callItem = findLast(/ナースコール[^\n]{0,10}(?:押さない|押せない|使わない)|一人で[^\n]{0,8}(?:降り|立ち|歩)/);
        if (callItem && callItem !== fallItem) E(N('nocall', 'symptom', short(callItem, 34), { items: [callItem] }), fr, 'contributes_to', { predicted: true, evidence: '一人で動こうとする' });
        if (nodes.has('anemia')) E(nodes.get('anemia'), fr, 'contributes_to', { predicted: true, evidence: 'ふらつきやすい' });
        if (dislocation) {
          const dis = N('dislocation', 'future_risk', '人工骨頭の脱臼の可能性（脱臼肢位：内転・内旋・過屈曲）', { source: 'knowledge', observed: false });
          E(surgery, dis, 'predicts', { predicted: true, evidence: '術後しばらくは関節が不安定' });
          E(fr, dis, 'contributes_to', { predicted: true, evidence: '転倒で脱臼しやすい' });
        }
        // 転倒と人工骨頭の脱臼は原因が違う（転倒：高齢・筋力やバランスの低下・移動の不安定さ／脱臼：術後の股関節の動き）ので、
        // 1つの看護問題にまとめず別々にする（看護介入も違う。2026-10-06.21）
        E(fr, N('p_fall', 'nursing_problem', '転倒転落リスク状態', { cat: 'fall' }), 'results_in', { predicted: true });
        if (nodes.has('dislocation')) E(nodes.get('dislocation'), N('p_disloc', 'nursing_problem', '人工骨頭脱臼のリスク（術後の股関節の動き）', { cat: 'disloc' }), 'results_in', { predicted: true });
      } else if (dislocation) {
        const dis = N('dislocation', 'future_risk', '人工骨頭の脱臼の可能性（脱臼肢位：内転・内旋・過屈曲）', { source: 'knowledge', observed: false });
        E(surgery, dis, 'predicts', { predicted: true });
        E(dis, N('p_disloc', 'nursing_problem', '人工骨頭脱臼のリスク（術後の股関節の動き）', { cat: 'disloc' }), 'results_in', { predicted: true });
      }
      // 体液量不足リスクの根拠になる記録（利尿薬の節で四角を先に作ると、夜間頻尿の四角と同じカードを取り合うので、ここでつなぐ）
      if (nodes.has('dehyd')) {
        // 根拠になる記録：尿が多い・夜間に何度もトイレ（利尿薬が効いている所見）
        const urineItem = findItem(/尿量[^\n]{0,12}(?:\d|多|増)/, i => notHist(i)) || findLast(/尿量[^\n]{0,10}(?:\d|多|増)|夜間頻尿|頻尿|夜中に[^\n]{0,6}トイレ|おしっこで[^\n]{0,8}起き/, i => notHist(i));
        // 【今ある所見とリスクを分ける】尿量の増加が記録にあれば、それは今ある所見（実線）。利尿薬 → 尿量の増加（記録）→ 脱水の可能性
        // （予測）の順にし、「尿量の増加」を予測の＋補足で描かない（関連図の評価：2026-10-07.6）
        if (urineItem) {
          const ex = [...nodes.values()].find(n => (n.itemIds || []).includes(urineItem.id));
          const un = ex || N('urine_obs', 'symptom', short(urineItem, 30, /尿|トイレ|おしっこ/), { items: [urineItem] });
          const du = nodes.get('diuretic');
          if (du && !ex) {
            E(du, un, 'causes', { evidence: '利尿薬で尿が多く出る' });
            const k = edges.findIndex(e => e.source === du.id && e.target === nodes.get('dehyd').id);
            if (k >= 0) edges.splice(k, 1);
          }
          E(un, nodes.get('dehyd'), 'predicts', { predicted: true, evidence: '尿が多く出ている', noBridge: true });
        }
      }
      // 低K血症の先（脱力・ふらつき・不整脈の可能性）は、転倒の看護問題があればそこへ、無ければ体液量不足リスクへ
      if (nodes.has('hypok_eff')) {
        const tgt = nodes.get('fall_risk_node') || [...nodes.values()].find(n => n.type === 'future_risk' && /転倒/.test(n.label)) || nodes.get('p_fall') || nodes.get('p_dehyd');
        if (tgt) E(nodes.get('hypok_eff'), tgt, tgt.type === 'nursing_problem' ? 'results_in' : 'contributes_to', { predicted: true, evidence: '力が入りにくく、ふらつきやすい' });
      }
      // ⑪-2 便秘・排尿障害（尿閉）・悪心：実際の症状が記録にあるときだけ（今ある問題）
      const constItem = findLast(/便秘|硬便|排便困難|\d日間?排便(?:なし|がない|が無い|がみられない)|排便[^\n]{0,6}(?:なし|が無い|がない|みられない)/, i => notHist(i));
      if (constItem) {
        const cs = N('const_sign', 'symptom', short(constItem, 30, /便/), { items: [constItem] });
        const gut = N('const_path', 'pathophysiology', '活動量・食事量の低下や薬で腸の動きが弱い', { source: 'knowledge' });
        if (nodes.has('mobility')) E(nodes.get('mobility'), gut, 'contributes_to', { evidence: '動かないと腸の動きが弱まる' });
        if (nodes.has('opioid')) E(nodes.get('opioid'), gut, 'contributes_to', { evidence: 'オピオイドで腸の動きが弱まる' });
        if (nodes.has('undernutrition')) E(nodes.get('undernutrition'), gut, 'contributes_to', { evidence: '食べる量・水分が少ない' });
        if (!edges.some(e => e.target === gut.id) && disease) E(disease, gut, 'contributes_to');
        E(gut, cs, 'causes');
        E(cs, N('p_const', 'nursing_problem', '便秘', { cat: 'elim' }), 'results_in');
      }
      const urineRetItem = findLast(/尿閉|排尿(?:困難|できない|が無い|がない|なし)|自尿(?:なし|が出ない|がない)|残尿感?|膀胱(?:膨満|緊満)|導尿/, i => notHist(i));
      if (urineRetItem) {
        const ur = N('urine_ret', 'symptom', short(urineRetItem, 30, /尿|膀胱/), { items: [urineRetItem] });
        const bl = N('bladder', 'pathophysiology', '膀胱の収縮の低下・排尿の反射の抑制（麻酔・鎮痛薬・カテーテル抜去後）', { source: 'knowledge' });
        if (nodes.has('anes')) E(nodes.get('anes'), bl, 'contributes_to', { evidence: '麻酔の影響が残る' });
        if (nodes.has('opioid') || nodes.has('analgesia')) E(nodes.get('opioid') || nodes.get('analgesia'), bl, 'contributes_to', { evidence: '鎮痛薬（とくにオピオイド・硬膜外麻酔）で排尿しにくい' });
        if (!edges.some(e => e.target === bl.id)) E(surgery || disease, bl, 'contributes_to');
        E(bl, ur, 'causes');
        E(ur, N('p_urine', 'nursing_problem', '排尿障害（尿閉）', { cat: 'elim' }), 'results_in');
      }
      const nauseaItem = findLast(/悪心|嘔気|吐き気|気持ち(?:が)?悪い|むかむか|ムカムカ/, i => notHist(i));
      if (nauseaItem && !(nodes.get('ileus_sign') && (nodes.get('ileus_sign').itemIds || []).includes(nauseaItem.id))) {
        const ns = N('nausea_sign', 'symptom', short(nauseaItem, 30, /悪心|嘔気|吐き気|気持ち|むかむか|ムカムカ/), { items: [nauseaItem] });
        const nsrc = nodes.get('opioid') || nodes.get('analgesia') || nodes.get('anes') || nodes.get('ileus_path') || disease;
        if (nsrc) E(nsrc, ns, nsrc.type === 'treatment' ? 'contributes_to' : 'causes', { evidence: '薬・麻酔・腸の動きの低下で吐き気が出る' });
        E(ns, N('p_nausea', 'nursing_problem', '悪心', { cat: 'nutr' }), 'results_in');
      }
      // ⑫ 睡眠
      const sleepItem = findItem(/眠れ(?:ない|なかった|ず)|不眠|中途覚醒/);
      if (sleepItem) {
        const sl = N('sleep', 'symptom', short(sleepItem, 32), { items: [sleepItem] });
        let linked = false;
        if (nodes.has('diuretic') && /トイレ|尿|おしっこ|頻尿/.test(sleepItem.text)) { E(nodes.get('diuretic'), sl, 'contributes_to', { evidence: '夜中もトイレに起きる' }); linked = true; }
        const dysN = nodes.get('dyspnea') || nodes.get('dys_s') || nodes.get('lung_sputum');
        if (dysN && /苦し|息|咳/.test(sleepItem.text)) { E(dysN, sl, 'causes', { evidence: '横になると息苦しい・咳で目が覚める' }); linked = true; }
        if (!linked && nodes.has('fall_sign') && /夜間|トイレ/.test(sleepItem.text + nodes.get('fall_sign').label)) E(nodes.get('fall_sign'), sl, 'causes');
        else if (!linked && pain && painItem) E(pain, sl, 'contributes_to');
        E(sl, N('p_sleep', 'nursing_problem', '睡眠パターン混乱', { cat: 'sleep' }), 'results_in');
      }
      // ⑬ 心理・社会（本人の不安の言葉 → 生活の変化 → 不安）
      // 本人の不安の言葉を先に、家族の心配の言葉も使う（家族だけのときは「家族の不安」とする）
      const anxAll = items.filter(i => i.type === 's' && /不安|心配|迷惑|仕事|戻れ|帰れ|怖|どうなる|どうしよう|家族|歩ける|やっていけ|大丈夫か/.test(i.text));
      const anxItems = [...anxAll.filter(i => !rmIsFamilySpeech(i.text)), ...anxAll.filter(i => rmIsFamilySpeech(i.text))].slice(0, 2);
      const familyOnly = anxItems.length && anxItems.every(i => rmIsFamilySpeech(i.text));
      if (anxItems.length) {
        // 言葉は「…」の中だけを短く（長いときは「…」の中で切る）。本人と家族の言葉が混ざるときはそう書く
        const quote = i => { const m = String(i.text).match(/「([^」]{1,80})」/); const q = m ? m[1] : short(i, 20).replace(/[「」]/g, ''); const t = q.split(/。/).filter(Boolean).pop() || q; return `「${t.length > 20 ? t.slice(0, 19) + '…' : t}」`; };
        const mixed = !familyOnly && anxItems.some(i => rmIsFamilySpeech(i.text));
        const words = N('anx_words', 'patient_fact', `${anxItems.map(i => (rmIsFamilySpeech(i.text) && mixed ? '家族' : '') + quote(i)).join('')}（${familyOnly ? '家族の' : mixed ? '本人・家族の' : ''}不安の言動）`, { items: anxItems, max: 70 });
        const change = N('life_change', 'pathophysiology', `${disease ? '診断・' : ''}${surgery ? '手術・' : ''}入院・今後の生活の変化`, { source: 'knowledge' });
        E(words, change, 'contributes_to', { evidence: '本人の言葉' });
        if (surgery) E(surgery, change, 'contributes_to');
        E(change, N('p_anx', 'nursing_problem', familyOnly ? '家族の不安（退院後の生活の変化に関連）' : `不安（${disease ? '診断・' : ''}${surgery ? '手術・' : ''}生活の変化に関連）`, { cat: 'anx', note: familyOnly ? '' : `${disease ? '病気・' : ''}${surgery ? '手術・' : ''}今後の生活に不安がある` }), 'results_in');
      }
      // ⑬-2 知識不足：治療・服薬・食事・退院後の生活について、本人が「わからない」「大丈夫なの？」と言っている
      const knowItem = items.find(i => i.type === 's' && !anxItems.includes(i) && !rmIsFamilySpeech(i.text) && /わからない|分からない|知らなかった|教えて|大丈夫なの|していいの|かけていいの|どうしたら|何に気を付け|気をつければ/.test(i.text));
      if (knowItem) {
        const kw = N('know_words', 'symptom', `S：${short(knowItem, 30)}`, { items: [knowItem] });
        const newInfo = nodes.get('life_change') || N('know_change', 'pathophysiology', `${surgery ? '手術・' : ''}治療・退院後の生活について、初めて知ることが多い`, { source: 'knowledge' });
        if (!edges.some(e => e.target === newInfo.id)) E(surgery || disease, newInfo, 'contributes_to');
        E(newInfo, kw, 'causes', { evidence: '説明を受けても、まだわからないことがある' });
        E(kw, N('p_know', 'nursing_problem', '知識不足（治療・退院後の生活）', { cat: 'anx' }), 'results_in');
      }
      // ⑬-3 看護理論・ライフサイクル・発達課題・障害受容（利用者の要望：2026-10-07.2）
      //  ・ライフサイクル／発達課題：年齢からエリクソンの発達段階（ハヴィガーストの発達課題）。入院・生活の変化で
      //    その時期の課題がおびやかされることを、生活の変化（→ 不安）の手前に置く
      //  ・役割（ロイ適応モデルの役割機能）：仕事・家事・介護など、本人の役割の記録があれば「役割を果たせない」へ
      //  ・障害受容（コーンの5段階・フィンクの危機モデル）：麻痺・失語・人工肛門などの後天的な障害があれば、本人の
      //    言葉から段階を示す（言葉が無ければ予測＝破線）。ショック期・回復への期待期・悲嘆期で、ほかに心理の看護問題が
      //    無ければ「ボディイメージ混乱」を看護問題にする
      // どこにもつながらない四角は作らない（つなぎ先が無ければ入れない）
      const psychoTarget = () => nodes.get('life_change') || nodes.get('know_change') || null;
      // 役割は、本人の言葉（「…」の中）か、職業・生活歴などの欄から（家族の言葉は使わない）
      // （「仕事もできない」の「ない」を打ち消しと読まないよう、言葉があるかだけを見る）
      const roleItem = [...items].reverse().find(i => RM_ROLE_RE.test(String(i.text).normalize('NFKC')) && !rmIsFamilySpeech(i.text) && (i.type === 's' || (i.fieldLabel && /職業|生活歴|社会|役割/.test(i.fieldLabel))
        || /^(?:職業|仕事)/.test(String(i.text).normalize('NFKC')) || [...String(i.text).matchAll(/「([^」]*)」/g)].some(m => RM_ROLE_RE.test(m[1]))));
      // 障害の記録は、観察・治療のカードを先に（本人の言葉のカードは障害受容の段階の根拠に使う）
      const disItem = findLast(RM_DISABILITY_RE, i => notHist(i) && i.type !== 's') || findLast(RM_DISABILITY_RE, i => notHist(i));
      // 障害の四角は、麻痺 → 失語 → 記録のカードの四角 の順（体の変化として大きいもの）
      const disNode = disItem ? (nodes.get('paralysis') || nodes.get('aphasia')
        || [...nodes.values()].find(n => (n.itemIds || []).includes(disItem.id) && n.type !== 'nursing_problem')) : null;
      let accept = null;
      if (disItem) {
        const speech = items.filter(i => i.type === 's' && !rmIsFamilySpeech(i.text));
        let hit = null;
        for (const st of RM_ACCEPT_STAGES) { const it = speech.find(i => st.re.test(String(i.text).normalize('NFKC'))); if (it) { hit = { st, it }; break; } }
        const what = (String(disItem.text).normalize('NFKC').match(RM_DISABILITY_RE) || ['障害'])[0];
        // 障害の四角が図に無ければ作る（人工肛門は手術の結果としての体の変化。ストーマの事例で図に出ていなかった）
        let src = disNode;
        if (!src) {
          const body = /ストーマ|ストマ|人工肛門/.test(what) ? 'ストーマ（人工肛門）の造設' : /永久気管孔|喉頭摘出/.test(what) ? '永久気管孔（声を失う）' : /切断/.test(what) ? '四肢の切断' : '';
          src = body ? N('dis_body', 'patient_fact', body, { items: [disItem] }) : N('dis_body', 'symptom', short(disItem, 30, RM_DISABILITY_RE), { items: [disItem] });
          if (body && surgery) E(surgery, src, 'results_in', { evidence: '手術で体のつくり・見た目が変わる' });
          else if (disease) E(disease, src, 'causes');
        }
        accept = N('accept', 'pathophysiology', hit ? `障害受容：${hit.st.stage}（コーン）` : '障害受容の過程（段階は言動から確認）', {
          source: 'knowledge', observed: !!hit, items: hit ? [hit.it] : [],
          evidence: hit ? `本人の言葉「${short(hit.it, 24).replace(/[「」]/g, '')}」から（フィンクの危機モデルでは「${hit.st.fink}」）` : `${what}を受け止める過程（ショック期→回復への期待期→悲嘆期→防衛期→適応期。行きつ戻りつする）`
        });
        E(src || disease, accept, 'contributes_to', { evidence: `${what}という体の変化を受け止める過程が始まる`, predicted: !hit });
        // 段階の根拠になった本人の言葉・様子も四角で見せる（同じカードの四角があればそれを使う）
        // 不安の言動の四角に同じカードがあれば、それを使う（同じ言葉を2か所に出さない）
        const anxW = hit && nodes.get('anx_words') && (nodes.get('anx_words').itemIds || []).includes(hit.it.id) ? nodes.get('anx_words') : null;
        if (anxW) E(anxW, accept, 'supports', { evidence: '段階を判断した本人の言葉・様子' });
        else if (hit) E(N('accept_words', 'patient_fact', (() => { const q = String(hit.it.text).match(/「([^」]{1,40})」/); return q ? `「${q[1]}」` : short(hit.it, 34); })(), { items: [hit.it] }), accept, 'supports', { evidence: '段階を判断した本人の言葉・様子' });
        const pAnx = nodes.get('p_anx');
        // ショック期・回復への期待期・悲嘆期は、体の変化をまだ受け止めきれていない →「ボディイメージ混乱」を看護問題にする
        if (hit && ['shock', 'hope', 'grief'].includes(hit.st.key)) {
          E(accept, N('p_body', 'nursing_problem', 'ボディイメージ混乱', { cat: 'anx', note: `${/ストーマ|ストマ|人工肛門/.test(what) ? 'ストーマ' : what}による体の変化を、まだ受け止めきれずにいる` }), 'results_in');
        } else if (pAnx && psychoTarget()) E(accept, psychoTarget(), 'contributes_to', { evidence: '障害の受け止めが、今後の生活への見通しに影響する', predicted: !hit });
        else {
          const rehab = nodes.get('p_mobility') || nodes.get('p_act');
          if (rehab) E(accept, rehab, 'contributes_to', { predicted: true, evidence: '受け止め方が、リハビリ・自分で動く意欲に影響する' });
        }
      }
      const target = psychoTarget() || (nodes.get('p_body') ? accept : null);
      const stage = rmLifeStage(age);
      if (stage && target) {
        const dev = N('dev_task', 'pathophysiology', `${stage.stage}の発達課題：${stage.crisis}（エリクソン）`, { source: 'knowledge',
          evidence: `${age}歳。ハヴィガーストの発達課題：${stage.task}` });
        const ageSrc = aging || null;
        if (ageSrc) E(ageSrc, dev, 'results_in', { evidence: '年齢から見たライフサイクルの時期' });
        else if (!roleItem) E(disease || surgery, dev, 'contributes_to', { evidence: `${age}歳の${stage.stage}に入院・治療が重なる` });
        if (roleItem) {
          const w = (String(roleItem.text).normalize('NFKC').match(RM_ROLE_RE) || ['仕事'])[0];
          const roleWord = { '畑': '畑仕事', '店を': '店', '介護して': '家族の介護', '世話をして': '家族の世話', '職場': '仕事', '復職': '仕事', '会社': '仕事', '自営': '仕事', '役員': '地域の役員', '大学': '学業', '高校': '学業', '中学': '学業', '学校': '学業', '部活': '部活動' }[w] || w;
          const role = N('role', 'pathophysiology', `入院で${roleWord}などの役割を果たせない（ロイ：役割機能）`, { source: 'knowledge', items: [roleItem],
            evidence: `記録：${short(roleItem, 30)}` });
          // 主な流れは「本人の言葉（仕事・家庭の役割）→ 役割を果たせない → 不安」。発達段階（理論）は補足として横から添える
          const words = [...nodes.values()].find(x => ['patient_fact', 'symptom'].includes(x.type) && x.itemIds && x.itemIds.includes(roleItem.id));
          if (words) E(words, role, 'causes', { evidence: '本人の言葉' });
          E(dev, role, 'contributes_to', { predicted: true, evidence: '補足：その時期に担っている役割（仕事・家庭）' });
          E(role, target, 'contributes_to', { evidence: '入院で仕事・家庭での役割を果たせなくなる' });
        } else E(dev, target, 'contributes_to', { evidence: `${stage.stage}の課題（${stage.task}）が、入院・生活の変化でおびやかされる` });
      }
      // 疾患と、手術が無い場合の症状（主訴・外れた値）
      if (disease && !surgery) {
        const chief = items.find(i => i.fieldLabel === '主訴');
        if (chief && !nodes.has('dyspnea')) { const c = N('chief', 'symptom', `主訴：${short(chief, 34)}`, { items: [chief] }); E(disease, c, 'causes'); }
      }

      // 絶食で食事がとれない（栄養の流れ）は、疾患からでなく「嚥下反射の低下」など誤嚥を防ぐ理由の四角から（栄養の節は嚥下の節より先に作るため、ここで直す）
      {
        const low = nodes.get('undernutrition');
        const sw = [...nodes.values()].find(n => /嚥下反射|嚥下機能/.test(n.label) && n.type === 'pathophysiology');
        if (low && sw && disease && intakeItem && /絶食|禁食/.test(intakeItem.text)) {
          const k = edges.findIndex(e => e.source === disease.id && e.target === low.id);
          if (k >= 0) { edges.splice(k, 1); E(sw, low, 'contributes_to', { evidence: '誤嚥を防ぐため食事を止めている' }); }
        }
      }

      // ⑭ 看護計画・選んだ看護診断があれば、その看護問題の名前と順番を使う
      const userProblems = (() => {
        const plans = typeof carePlanList === 'function' ? carePlanList(cp).filter(p => String(p.problem || '').trim()) : [];
        if (plans.length) return plans.map(p => ({ label: rmCleanProblemLabel(p.problem), needs: p.relatedNeeds || [] }));
        const sel = new Set(cp.selectedDiagnosisIds || []);
        return (cp.diagnosisCandidates || []).filter(c => sel.has(c.id) && String(c.name || '').trim()).map(c => ({ label: rmCleanProblemLabel(c.name), needs: [] }));
      })().filter(up => up.label);
      // 看護問題の根拠にしないカード：氏名・年齢・性別・血液型などの基本情報（「A氏 76歳 女性 血液型 A Rh+」から
      // いきなり看護問題へ矢印が出ると、病態の流れが途切れて見える。利用者からの指摘：2026-10-06.18）
      const isBasicInfo = i => (i.fieldLabel && /氏名|基本情報|患者情報|プロフィール|血液型|性別|年齢/.test(i.fieldLabel))
        || /血液型|Rh\s*[+\-]|^\s*\S{0,6}氏\s*\d+\s*歳|\d+\s*歳\s*(?:男|女)/.test(String(i.text).normalize('NFKC'));
      const usedEv = new Set();
      const pendingUser = [];
      const tplProblems = [...nodes.values()].filter(n => n.type === 'nursing_problem');
      const usedTpl = new Set();
      const ordered = [];
      userProblems.forEach(up => {
        const cat = rmProblemCategory(up.label).key;
        const match = tplProblems.find(t => !usedTpl.has(t) && (t.cat === cat || (cat === 'resp' && t.cat === 'resp')));
        if (match) {
          // 補足：計画の問題名に決まった補足があればそれ。ひな形と同じ中身（呼吸の今ある問題 など）なら、ひな形の補足をそのまま使う。
          // 中身がちがえば（同じ「呼吸」でもリスクと今ある問題など）補足は外す（名前と合わない説明を出さない）
          const plainNote = rmPlainNote(up.label);
          if (plainNote) match.note = plainNote;
          else if (rmProblemSimKey(up.label) !== rmProblemSimKey(match.label)) delete match.note;
          usedTpl.add(match); match.label = rmShorten(up.label, 60); match.source = 'plan'; ordered.push(match); return;
        }
        // ひな形に無い看護問題：根拠の道筋は、ひな形の看護問題が全部決まってから引く（下の pendingUser）
        const p = N(`p_user_${ordered.length}`, 'nursing_problem', up.label, { source: 'plan', max: 60 });
        pendingUser.push({ p, cat, up });
        ordered.push(p);
      });
      // 【根拠の道筋】記録のカードから看護問題へ直接の矢印は引かない（「骨折 → 身体可動性障害」のように、間の病態が抜けて見える。
      // 利用者からの指摘：2026-10-06.19）。
      // ① 同じ種類のひな形の看護問題（セルフケア不足 など）が図にあれば、その手前の病態の四角から枝分かれさせる
      // ② 無ければ、疾患 → ＋補足の病態（種類ごとの決まった言葉）→ 問題の言葉に合う記録（基本情報・入院前の様子は使わない）→ 看護問題
      pendingUser.forEach(({ p, cat, up }) => {
        const same = tplProblems.filter(t => t !== p && t.cat === cat);
        const preds = [];
        same.forEach(t => edges.filter(e => e.target === t.id).forEach(e => {
          const src = [...nodes.values()].find(n => n.id === e.source);
          if (src && !['patient_fact', 'lab', 'nursing_problem'].includes(src.type) && !preds.includes(src)) preds.push(src);
        }));
        if (cat !== 'other' && preds.length) { preds.slice(0, 2).forEach(src => E(src, p, 'results_in', { evidence: `「${rmShorten(same[0].label, 20)}」と同じ病態から` })); return; }
        const needs = new Set((up.needs || []).map(Number));
        const kw = RM_PROBLEM_EVIDENCE[cat];
        const past = i => /していた|以前は|入院前|もともと|元々/.test(String(i.text)) || i.admissionPhase === 'preadmission';
        const score = i => (kw && rmPositiveMatch(kw, i.text) ? 2 : 0) + ((i.hendersonIds || []).some(h => needs.has(Number(h))) ? 1 : 0) - (usedEv.has(i) ? 0.5 : 0) - (past(i) ? 1.5 : 0);
        const cands = items.filter(i => !isBasicInfo(i) && notDxS(i) && (i.type === 's' || rmPositiveMatch(/なし|ない/, i.text) === null) && score(i) >= 1);
        const ev = cands.sort((a, b) => score(b) - score(a))[0];
        const mechLabel = RM_PROBLEM_MECHANISM[cat];
        const mech = mechLabel ? N(`mech_${cat}`, 'pathophysiology', mechLabel, { source: 'knowledge' }) : null;
        if (mech) mech.added = true;
        if (ev) {
          usedEv.add(ev);
          // 同じ記録がすでに図の四角になっていれば、その四角から矢印を引く（同じ情報の四角を2つ作らない）
          const exist = [...nodes.values()].find(n => n.type !== 'nursing_problem' && (n.itemIds || []).includes(ev.id));
          const evNode = exist || N(`evn_${p.id}`, 'symptom', `${ev.type === 's' ? 'S：' : ''}${short(ev, 34, kw)}`, { items: [ev] });
          // 病態（＋補足）→ 記録（症状・観察）→ 看護問題 の順。病態は疾患からつなぎ、図の流れの中に入れる
          if (mech) { if (disease && !edges.some(e => e.target === mech.id)) E(disease, mech, 'contributes_to'); E(mech, evNode, 'causes'); }
          E(evNode, p, 'results_in', { evidence: '看護計画の根拠になる記録' });
        } else if (disease) {
          if (mech) { E(disease, mech, 'contributes_to', { evidence: '看護計画の看護問題（つながりを確かめてください）' }); E(mech, p, 'results_in'); }
          else E(disease, p, 'contributes_to', { evidence: '看護計画の看護問題（つながりを確かめてください）' });
        }
      });
      // 看護計画に無いひな形の看護問題は「候補」として後ろに並べる（分類の目安の順）
      const rest = tplProblems.filter(t => !usedTpl.has(t)).sort((a, b) => rmProblemCategory(a.label).rank - rmProblemCategory(b.label).rank);
      rest.forEach(t => { if (userProblems.length) { t.label = `${t.label}（候補）`; t.evidence = '記録から考えられる候補（看護計画には未登録）'; } ordered.push(t); });
      // 看護問題は多くても7つ（看護計画の看護問題はすべて残す）。載せすぎると何が大事か分からなくなる
      // 【似た看護問題は1つに】看護計画に同じことを指す看護問題が2つあるとき（「身体可動性障害」と「移動能力低下」など）は、
      // 看護診断の名前に近い方を看護問題に残し、もう一方はそこへ至る途中の状態として置く（看護計画そのものは変えない）。
      // 利用者から「チェックで分かるなら最初からそうして」（2026-10-06.21）
      const nandaLike = lb => /障害|不足|リスク状態|状態$|過剰|混乱|浄化/.test(lb);
      const simGroups = new Map();
      ordered.filter(p => p.source === 'plan').forEach(p => { const k = rmProblemSimKey(p.label); if (!k) return; if (!simGroups.has(k)) simGroups.set(k, []); simGroups.get(k).push(p); });
      simGroups.forEach(ps => {
        if (ps.length < 2) return;
        const keeper = ps.find(p => nandaLike(p.label)) || ps[0];
        ps.filter(p => p !== keeper).forEach(p => {
          p.type = 'pathophysiology'; p.cat = undefined; p.priority = 0;
          p.evidence = `看護計画の「${p.label}」は「${keeper.label}」と同じことを指すため、そこへ至る途中の状態として置いた`;
          // keeper へ直接入っていた原因のうち、p にも入っているものは p を通す（原因 → p → keeper）
          const intoP = new Set(edges.filter(e => e.target === p.id).map(e => e.source));
          for (let i = edges.length - 1; i >= 0; i--) if (edges[i].target === keeper.id && intoP.has(edges[i].source)) edges.splice(i, 1);
          E(p, keeper, 'results_in', { evidence: '同じことを指す看護問題をまとめた' });
          ordered.splice(ordered.indexOf(p), 1);
        });
      });
      const MAX_PROBLEMS = Math.max(10, ordered.filter(p => p.source === 'plan').length);
      const kept = ordered.slice(0, MAX_PROBLEMS);
      kept.forEach((p, i) => { p.priority = i + 1; });
      // 残した看護問題・疾患につながらない四角は載せない（その看護問題だけのための流れごと外す）
      const uniqNodes = [...new Set(nodes.values())];
      const keepIds = new Set(kept.map(p => p.id));
      uniqNodes.filter(n => n.type === 'disease').forEach(n => keepIds.add(n.id));
      let grew = true;
      while (grew) {
        grew = false;
        edges.forEach(e => {
          // 結果の側が残るなら原因も残す。治療は、治療の対象が残るなら残す
          if (keepIds.has(e.target) && !keepIds.has(e.source) && !uniqNodes.find(n => n.id === e.source && n.type === 'nursing_problem')) { keepIds.add(e.source); grew = true; }
          // 残る治療の「治療の対象」も残す（膀胱留置カテーテル ┤ 神経因性膀胱：何に対する管かを線で分かるように。2026-10-07.6）
          if (e.relation === 'treats' && keepIds.has(e.source) && !keepIds.has(e.target)) { keepIds.add(e.target); grew = true; }
        });
      }

      // 浮島（どこにもつながらない四角）は載せない
      const list = uniqNodes.filter(n => keepIds.has(n.id) && n.label && edges.some(e => (e.source === n.id && keepIds.has(e.target)) || (e.target === n.id && keepIds.has(e.source))));
      const ids = new Set(list.map(n => n.id));
      const map = {
        version: 2,
        nodes: list.slice(0, RM_MAX_NODES).map(({ key, cat, ...n }) => n),
        edges: edges.filter(e => ids.has(e.source) && ids.has(e.target)).slice(0, RM_MAX_EDGES),
        headers: [], source: 'rules', buildVersion: RM_BUILD_VERSION, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      };
      rmApplyBridges(map); // 矢印の間の飛躍を医学知識で埋める（＋補足）
      map.edges.forEach(e => { delete e.noBridge; });
      rmLabsAsEvidence(map); // 検査値は原因にしない（根拠・客観データ）
      rmMergeDuplicateProblems(map); // 原因・根拠が同じ看護問題は1つにまとめる
      rmReduceShortcuts(map); // 別の道筋で同じ所へ行ける「近道」の矢印を省く（中央の線を減らす）
      layoutRelationMap(map);
      rmAutoFixBuilt(map);
      rmImportClinicalEntities(map, cp, { includeUnlinked: false });
      rmPrepareClinicalMap(map, cp);
      return map;
    }
    // 【検査値は原因にしない】Dダイマー・Alb・CRP・WBC・Hb・体温などの検査値・測定値は、看護問題や病態の「根拠・客観データ」。
    // 「Alb低値 → 皮膚の血流低下」「体温 → 不感蒸泄」のような因果の矢印にせず、根拠（supports）の線にする（関連図の評価：2026-10-07.6）
    function rmLabsAsEvidence(map) {
      const byId = new Map(map.nodes.map(n => [n.id, n]));
      let n = 0;
      map.edges.forEach(e => {
        const a = byId.get(e.source);
        if (a && ['lab', 'vital'].includes(a.type) && e.relation !== 'supports') { e.relation = 'supports'; n++; }
      });
      return n;
    }
    // 【看護問題の重複をまとめる】同じ種類（呼吸・活動など）の看護問題で、今ある／リスクが同じで、たどれる記録の事実（症状・検査・
    // 患者の情報）がまったく同じなら、同じ問題を2つの名前で書いている。優先順位の高い方へまとめる（例：活動耐性低下と身体可動性障害が
    // 同じ「麻痺・介助」の記録だけから出ている。今ある問題と将来のリスクは別の問題なのでまとめない。関連図の評価：2026-10-07.6）
    function rmMergeDuplicateProblems(map) {
      const byId = new Map(map.nodes.map(n => [n.id, n]));
      const facts = p => {
        const seen = new Set([p.id]), stack = [p.id];
        while (stack.length) { const id = stack.pop(); map.edges.forEach(e => { if (e.target === id && !seen.has(e.source)) { seen.add(e.source); stack.push(e.source); } }); }
        return [...seen].map(id => byId.get(id)).filter(n => n && n.observed !== false && n.source !== 'knowledge' && ['symptom', 'lab', 'vital', 'medication', 'patient_fact'].includes(n.type)).map(n => n.id).sort().join('|');
      };
      // まとめるのは、同じことを別の名前で書きやすい組だけ（活動耐性低下 と 身体可動性障害）。排尿と排便のように
      // 同じ「排泄」でも別の問題はまとめない
      const kind = p => (/^(?:活動耐性低下|身体可動性障害)/.test(p.label) ? 'act-move' : `x:${p.id}`);
      const probs = map.nodes.filter(n => n.type === 'nursing_problem' && n.source !== 'plan').sort((a, b) => (a.priority || 99) - (b.priority || 99));
      const drop = new Set();
      probs.forEach((p, i) => probs.slice(i + 1).forEach(q => {
        if (drop.has(p.id) || drop.has(q.id) || kind(p) !== kind(q)) return;
        const fp = facts(p);
        if (!fp || fp !== facts(q)) return;
        map.edges.filter(e => e.target === q.id).forEach(e => {
          if (map.edges.some(x => x.source === e.source && x.target === p.id)) e._drop = true; else e.target = p.id;
        });
        drop.add(q.id);
      }));
      if (!drop.size) return 0;
      map.edges = map.edges.filter(e => !e._drop && !drop.has(e.source) && !drop.has(e.target));
      map.nodes = map.nodes.filter(n => !drop.has(n.id));
      return drop.size;
    }
    // 【近道の矢印を省く】A → B のほかに A → … → B（2本以上の矢印）の道筋があるとき、A → B は同じことを言っている。
    // 線が多いと図の中央が混み、「この線はどこから来たのか」を探すことになる（利用者の声：2026-10-06.26）。
    // 省くのは、看護問題・治療（┤）・検査データの根拠の矢印以外で、事実の矢印を予測（点線）の道筋で置き換えない場合だけ
    function rmReduceShortcuts(map) {
      const byId = new Map(map.nodes.map(n => [n.id, n]));
      let removed = 0;
      const outOf = id => map.edges.filter(e => e.source === id && e.relation !== 'treats');
      const altPath = (e) => {
        // e を使わずに source から target へ、2本以上の矢印でたどれるか（事実の矢印なら事実の矢印だけで）
        const seen = new Set([e.source]);
        const queue = outOf(e.source).filter(x => x !== e && (e.predicted || !x.predicted)).map(x => ({ id: x.target, len: 1 }));
        while (queue.length) {
          const { id, len } = queue.shift();
          if (id === e.target) { if (len >= 2) return true; continue; }
          if (seen.has(id)) continue;
          seen.add(id);
          const n = byId.get(id);
          if (!n || n.type === 'nursing_problem') continue;
          outOf(id).forEach(x => { if (x !== e && (e.predicted || !x.predicted)) queue.push({ id: x.target, len: len + 1 }); });
        }
        return false;
      };
      [...map.edges].forEach(e => {
        const a = byId.get(e.source), b = byId.get(e.target);
        if (!a || !b || e.relation === 'treats' || e.relation === 'supports' || ['lab', 'vital'].includes(a.type) || b.type === 'nursing_problem') return;
        if (altPath(e)) { map.edges = map.edges.filter(x => x !== e); removed++; }
      });
      return removed;
    }
    // 【作った直後に直す】利用者からの要望：「チェックで分かるなら最初からそうして」（2026-10-06.19）。
    // 作った図を「チェック」と同じ決まりで確かめ、自動で直せるもの（浮島・同じ内容の四角・両向きの矢印・治療の向き・
    // 予測の破線・#番号・看護問題から出る矢印）は、見せる前に直す。看護問題の順番（看護計画の順）と、似た看護問題の
    // まとめ方は、利用者が決めることなので変えない（チェックで知らせるだけ）。
    const RM_AUTOFIX_CODES = ['lab-in-chain', 'isolated', 'duplicate', 'mutual', 'treat-source', 'treat-direction', 'treat-reverse', 'from-problem', 'risk-solid', 'risk-observed', 'edge-to-pred', 'numbering'];
    function rmAutoFixBuilt(map) {
      let total = 0;
      for (let k = 0; k < 3; k++) {
        const fixes = validateRelationMap(map).filter(i => i.fix && RM_AUTOFIX_CODES.includes(i.code));
        if (!fixes.length) break;
        const n = rmApplyFixes(map, fixes);
        total += n;
        if (!n) break;
      }
      return total;
    }

    // ---- 矢印の間を補う（＋補足） ----
    // 矢印 A→B を A→［間の過程］→B にする。補った四角は added:true（紫・「＋補足」の札で一目で分かる）
    function rmInsertBetween(map, edge, label, { why = '' } = {}) {
      if (!edge || map.nodes.length >= RM_MAX_NODES || map.edges.length >= RM_MAX_EDGES) return null;
      const a = map.nodes.find(n => n.id === edge.source), b = map.nodes.find(n => n.id === edge.target);
      if (!a || !b) return null;
      // 行き先が今ある事実（疾患・症状など）なら、間の過程も事実（予測の点線にしない。「予測 → 事実」にならないように）
      const factTarget = b.observed !== false && !['future_risk', 'nursing_problem'].includes(b.type);
      const pred = !!edge.predicted && !factTarget;
      const node = { id: rmNewId('n'), type: 'pathophysiology', label: rmShorten(String(label || '').trim(), RM_TEXT_MAX), evidence: rmShorten(why, 120), observed: !pred, source: 'knowledge', added: true, priority: 0, x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2), itemIds: [] };
      if (!node.label) return null;
      map.nodes.push(node);
      if (!pred) edge.predicted = false;
      map.edges.push({ id: rmNewId('e'), source: node.id, target: b.id, relation: edge.relation === 'treats' ? 'causes' : edge.relation, predicted: pred, evidence: edge.evidence || '' });
      edge.target = node.id;
      edge.relation = 'causes';
      edge.evidence = why || '';
      return node;
    }
    // 決まった知識（RM_BRIDGE_RULES）で、矢印の間の飛躍を埋める。補った数を返す
    function rmApplyBridges(map) {
      if (!map || !Array.isArray(map.edges)) return 0;
      const norm = t => String(t || '').replace(/[\s・、（）()]/g, '');
      let added = 0;
      const ctx = map.nodes.filter(n => n.type === 'disease' || n.type === 'treatment').map(n => n.label).join(' ');
      map.edges.slice().forEach(e => {
        if (e.relation === 'treats' || e.noBridge) return;
        const a = map.nodes.find(n => n.id === e.source), b = map.nodes.find(n => n.id === e.target);
        if (!a || !b || a.added || b.added) return;
        const rule = RM_BRIDGE_RULES.find(r => r.s.test(a.label) && r.t.test(b.label) && (!r.ctx || r.ctx.test(ctx)));
        if (!rule) return;
        const key = norm(rule.step);
        const same = map.nodes.find(n => norm(n.label) === key);
        if (same) {
          // 同じ原因から同じ過程をもう補っていれば、その四角を通す（A→［X］→B1 と A→B2 なら A→［X］→B2 にする）
          if (same.added && map.edges.some(x => x.source === a.id && x.target === same.id) && !map.edges.some(x => x.source === same.id && x.target === b.id)) {
            e.source = same.id; e.relation = e.relation === 'treats' ? 'causes' : e.relation;
            // 行き先が今ある事実なら、通す過程も事実にする（「予測 → 事実」にならないように）
            if (b.observed !== false && !['future_risk', 'nursing_problem'].includes(b.type) && same.observed === false) {
              same.observed = true; e.predicted = false;
              map.edges.forEach(x => { if (x.source === a.id && x.target === same.id) x.predicted = false; });
            }
          }
          return; // 同じ過程がもう図にある
        }
        if (rmInsertBetween(map, e, rule.step, { why: rule.why })) added++;
      });
      return added;
    }


    // ＋補足を隠す：補った四角を外して、前後を直接の矢印でつなぐ（外したものは addedStash に取っておき、表示で元に戻す）
    function rmHideAdded(map) {
      const added = map.nodes.filter(n => n.added);
      if (!added.length) return 0;
      const old = map.addedStash && typeof map.addedStash === 'object' ? map.addedStash : null;
      const stash = { nodes: old ? old.nodes.slice() : [], edges: old ? old.edges.slice() : [], created: old ? old.created.slice() : [],
        positions: Object.fromEntries(map.nodes.map(n => [n.id, { x: n.x, y: n.y, attachTo: n.attachTo || null }])), bands: map.bands || [], headers: map.headers || [] };
      const created = new Set(stash.created);
      added.forEach(x => {
        const ins = map.edges.filter(e => e.target === x.id), outs = map.edges.filter(e => e.source === x.id);
        ins.forEach(i => outs.forEach(o => {
          if (i.source === o.target || map.edges.some(e => e.source === i.source && e.target === o.target)) return;
          const ne = { id: rmNewId('e'), source: i.source, target: o.target, relation: o.relation, predicted: !!(i.predicted || o.predicted), evidence: o.evidence || i.evidence || '' };
          map.edges.push(ne); created.add(ne.id);
        }));
        [...ins, ...outs].forEach(e => { if (created.has(e.id)) created.delete(e.id); else stash.edges.push(e); });
        map.edges = map.edges.filter(e => e.source !== x.id && e.target !== x.id);
        map.nodes = map.nodes.filter(n => n !== x);
        stash.nodes.push(x);
      });
      stash.created = [...created];
      map.addedStash = stash;
      layoutRelationMap(map);
      return added.length;
    }
    // ＋補足を表示：取っておいた四角と矢印を戻す（隠している間に消した四角につながるものは戻さない）
    function rmShowAdded(map) {
      const st = map.addedStash;
      delete map.addedStash;
      if (!st || !Array.isArray(st.nodes) || !st.nodes.length) return 0;
      const created = new Set(st.created || []);
      map.edges = map.edges.filter(e => !created.has(e.id));
      const ids = new Set(map.nodes.map(n => n.id));
      st.nodes.forEach(n => { if (n && !ids.has(n.id)) { map.nodes.push(n); ids.add(n.id); } });
      (st.edges || []).forEach(e => { if (e && ids.has(e.source) && ids.has(e.target) && !map.edges.some(x => x.id === e.id || (x.source === e.source && x.target === e.target))) map.edges.push(e); });
      // 前か後ろが無くなった補足は戻さない
      let changed = true;
      while (changed) {
        changed = false;
        map.nodes.filter(n => n.added).forEach(n => {
          if (map.edges.some(e => e.target === n.id) && map.edges.some(e => e.source === n.id)) return;
          map.nodes = map.nodes.filter(x => x !== n); map.edges = map.edges.filter(e => e.source !== n.id && e.target !== n.id); changed = true;
        });
      }
      const clean = normalizeRelationMap({ ...map, version: 2 });
      map.nodes = clean.nodes; map.edges = clean.edges;
      // 隠す前と同じ四角のままなら、前の位置に戻す。変わっていれば並べ直す
      const pos = st.positions || {};
      if (map.nodes.every(n => pos[n.id])) {
        map.nodes.forEach(n => { n.x = pos[n.id].x; n.y = pos[n.id].y; if (pos[n.id].attachTo) n.attachTo = pos[n.id].attachTo; else delete n.attachTo; });
        map.bands = st.bands || []; map.headers = st.headers || [];
      } else layoutRelationMap(map);
      return map.nodes.filter(n => n.added).length;
    }
    // ボタン1つで ＋補足 のあり・なしを入れ替える（隠したものが無く、補足も無いときは決まった知識で補う）
    function rmToggleAdded() {
      const map = rmMap();
      if (!map || !map.nodes.length) return;
      if (map.nodes.some(n => n.added)) { let n = 0; rmMutate(m => { n = rmHideAdded(m); }); showToast(`＋補足を隠しました（${n}個）。もう一度押すと戻ります`, 'info'); }
      else if (map.addedStash) { let n = 0; rmMutate(m => { n = rmShowAdded(m); }); showToast(`＋補足を表示しました（${n}個）`, 'success'); }
      else rmBridgeAll();
      rmRenderToolbarState();
    }
    // 図全体：決まった知識で矢印の間を補う
    function rmBridgeAll() {
      const map = rmMap();
      if (!map || !map.edges.length) return;
      let n = 0;
      rmMutate(m => { n = rmApplyBridges(m); if (n) layoutRelationMap(m); }, { render: true });
      if (n) showToast(`矢印の間に${n}個の過程を補いました（紫の「＋補足」の四角）。合っているか確かめてください。「元に戻す」で戻せます`, 'success', 7000);
      else showToast('決まった知識で補える所は見つかりませんでした。手で四角を足すこともできます', 'info', 6000);
    }
    // 選んだ矢印の間に、空の四角を入れて文字を書いてもらう
    async function rmBridgeEdgeManual(edgeId) {
      const map = rmMap();
      const e = map && map.edges.find(x => x.id === edgeId);
      if (!e) return;
      const a = rmNodeById(map, e.source), b = rmNodeById(map, e.target);
      const v = await openDialog({ title: '矢印の間に過程を入れる', message: `「${rmDisplayLabel(a)}」→［ここ］→「${rmDisplayLabel(b)}」`, inputValue: '', placeholder: '例：発痛物質の放出', confirmLabel: '入れる' });
      if (v === null || v === undefined || !String(v).trim()) return;
      let node = null;
      rmMutate(m => { const x = m.edges.find(y => y.id === edgeId); node = rmInsertBetween(m, x, String(v).trim()); if (node) { node.source = 'user'; layoutRelationMap(m); } });
      if (!node) showToast('これ以上四角を増やせません（上限です）', 'warn');
      else rmSelect({ type: 'node', id: node.id });
    }

    // ---- 画面の状態 ----
    const rmState = { patientId: null, selected: null, connectFrom: null, zoom: 1, undo: [], redo: [], drag: null, lastTap: null, problemsOpen: false, moreOpen: false, focusProblem: null, textView: false };
    function rmMap(cp = getCurrentPatient()) {
      if (!cp) return null;
      if (cp.relationMap?.patientId && cp.relationMap.patientId !== cp.id) return null;
      if (cp.relationMap && !cp.relationMap.__normalized) {
        const m = normalizeRelationMap(cp.relationMap);
        if (!m || (m.patientId && m.patientId !== cp.id)) {
          showToast('この関連図は現在の形式または患者情報と一致しません。元のデータは保持しています', 'error');
          return null;
        }
        rmPrepareClinicalMap(m, cp);
        if (m.nodes.length && m.layoutStyle !== RM_LAYOUT_STYLE) layoutRelationMap(m); // 文字を大きくする前に並べた図は、重ならないように並べ直す
        Object.defineProperty(m, '__normalized', { value: true, enumerable: false, configurable: true });
        cp.relationMap = m;

      }
      return cp.relationMap || null;
    }
    function rmSnapshot(cp) { return JSON.stringify(cp.relationMap || null); }
    function rmPushUndo(cp) {
      rmState.undo.push(rmSnapshot(cp));
      if (rmState.undo.length > RM_UNDO_MAX) rmState.undo.shift();
      rmState.redo = [];
    }
    function rmCommit(cp, map, { pushUndo = false, render = true } = {}) {
      // 図を作り直した・書き換えたときは、全体の図に戻す（看護問題ごとの図は見るだけ）
      if (cp.id === rmState.patientId) rmState.focusProblem = null;
      // 「元に戻す」の記録は、表示している患者の分だけ（AIの結果が、別の患者に切り替えた後に届いたときは積まない）
      if (pushUndo && cp.id === rmState.patientId && cp.id === getCurrentPatient().id) rmPushUndo(cp);
      if (map) {
        rmPrepareClinicalMap(map, cp);
        map.updatedAt = new Date().toISOString();
        Object.defineProperty(map, '__normalized', { value: true, enumerable: false, configurable: true });
      }
      cp.relationMap = map;
      if (cp.id === getCurrentPatient().id) persistData();
      else { cp.updatedAt = new Date().toISOString(); if (typeof schedulePatientSync === 'function') schedulePatientSync(cp.id); if (typeof savePatientsLocally === 'function') savePatientsLocally(); }
      if (render && cp.id === getCurrentPatient().id) renderRelationMap();
    }
    async function rmConfirmReplace(cp) {
      const m = rmMap(cp);
      if (!m || !m.nodes.length) return true;
      const ok = await openDialog({ title: '今の関連図を作り直しますか？', message: '今の関連図（手で直した所も含む）は、新しく作った図に置き換わります。作ったあとも「元に戻す」で前の図に戻せます。', confirmLabel: '作り直す' });
      return ok === true;
    }
    async function rmBuild() {
      const cp = getCurrentPatient();
      if (!(cp.items || []).some(i => i.type !== 'unnecessary')) { showToast('先に「分類開始」で記録をカードに分けてください', 'warn'); return; }
      if (!(await rmConfirmReplace(cp))) return;
      const map = buildRelationMapFromRecord(cp);
      if (!map.nodes.length) { showToast('記録から関連図に使える情報が見つかりませんでした。「追加」で手で作ってください', 'warn'); return; }
      rmCommit(cp, map, { pushUndo: true });
      rmZoom('fit-readable'); // 作った直後は全体が見える大きさにする
      rmShowCheckIfNeeded(map);
      const nAdded = map.nodes.filter(n => n.added).length;
      showToast(`記録から関連図を作りました（${map.nodes.length}個${nAdded ? `・うち紫の「＋補足」${nAdded}個は矢印の間に補った過程` : ''}）。病態のつながりを確かめて直してください`, 'success', 8000);
    }

    // ---- 描画 ----
    function rmNodeById(map, id) { return map.nodes.find(n => n.id === id) || null; }
    function renderRelationMap() {
      const view = document.getElementById('view-relation');
      if (!view) return;
      const cp = getCurrentPatient();
      if (rmState.patientId !== cp.id) { rmState.patientId = cp.id; rmState.undo = []; rmState.redo = []; rmState.selected = null; rmState.connectFrom = null; rmState.focusProblem = null; rmShowCheck(null); }
      const map = rmMap(cp);
      const wrap = document.getElementById('rm-canvas-wrap');
      const empty = document.getElementById('rm-empty');
      const has = !!(map && map.nodes.length);
      if (empty) empty.classList.toggle('hidden', has);
      if (wrap) {
        wrap.classList.toggle('hidden', !has || rmState.textView);
        const keep = { left: wrap.scrollLeft, top: wrap.scrollTop };
        const fresh = !wrap.querySelector('svg');
        // 図のまわりに余白（.rm-stage の padding）を付け、端まで動かしても少し先までドラッグできるようにする
        // （利用者からの要望：「端に行くとそこで止まるので、もう少し余裕が欲しい」2026-10-06.19）
        // 看護問題ごとに見ているときは、その流れだけを並べ直した図（見るだけ。編集は全体の図で）
        const focusSub = has && rmState.focusProblem ? rmProblemSubmap(map, rmState.focusProblem) : null;
        if (has && rmState.focusProblem && !focusSub) rmState.focusProblem = null;
        view.classList.toggle('rm-focus-view', !!focusSub);
        wrap.innerHTML = has ? `<div class="rm-stage">${focusSub ? relationMapSvg(focusSub, { interactive: false, zoom: rmState.zoom, title: `${cp.title || ''}の関連図（看護問題ごと）` }).replace('<svg ', '<svg data-focus="1" class="rm-svg rm-svg-focus" ').replace('class="rm-svg" ', '') : relationMapSvg(map, { interactive: true, zoom: rmState.zoom, title: `${cp.title || ''}の関連図` })}</div>` : '';
        if (has && fresh) rmScrollToMapStart(wrap);
        else { wrap.scrollLeft = keep.left; wrap.scrollTop = keep.top; }
        wrap.classList.toggle('is-connecting', !!rmState.connectFrom);
        if (has) rmApplySelectionClasses();
      }
      const textView = document.getElementById('rm-text-view');
      if (textView) { textView.classList.toggle('hidden', !has || !rmState.textView); textView.innerHTML = has ? relationMapTextHtml(map, cp) : ''; }
      const textToggle = view.querySelector('[data-rm-action="toggle-text"]');
      if (textToggle) { textToggle.setAttribute('aria-pressed', String(rmState.textView)); textToggle.textContent = rmState.textView ? '図で表示' : '関連図を一覧で表示'; }
      rmRenderProblemList(map);
      const legend = document.getElementById('rm-legend');
      if (legend && !legend.dataset.ready) { legend.innerHTML = rmLegendHtml(); legend.dataset.ready = '1'; }
      const info = document.getElementById('rm-info');
      if (info) info.textContent = has ? `${map.nodes.length}個の四角・${map.edges.length}本の矢印・看護問題${map.nodes.filter(n => n.type === 'nursing_problem').length}個${map.updatedAt ? `（最終更新 ${new Date(map.updatedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}）` : ''}` : '';
      rmRenderSelectionBar();
      rmRenderToolbarState();
      const conflictBtn = document.getElementById('rm-conflict-button');
      if (conflictBtn) conflictBtn.classList.toggle('hidden', !(typeof hasRelationMapConflict === 'function' && hasRelationMapConflict(cp.id)));
      const backupBtn = document.getElementById('rm-backup-button');
      if (backupBtn) { try { backupBtn.classList.toggle('hidden', !localStorage.getItem(`nursing_relation_map_conflict_${cp.id}`)); } catch (e) { backupBtn.classList.add('hidden'); } }
    }
    // 【看護問題の一覧】看護問題を優先順位（#）の順に並べ、押すとその四角を選んで図の真ん中に見せる。
    // 利用者から「図の上の一覧は邪魔」との声があり、ツールバー（全画面では右上）の「看護問題」ボタンで開く小さな一覧にした。
    // 開いた一覧は図の上に重ねて出すので、図の場所をとらない。項目を押す・外を押す・Esc で閉じる。
    function rmRenderProblemList(map) {
      const box = document.getElementById('rm-problems');
      if (!box) return;
      const probs = map ? map.nodes.filter(n => n.type === 'nursing_problem').sort((a, b) => (a.priority || 999) - (b.priority || 999)) : [];
      if (!probs.length) rmState.problemsOpen = false;
      const open = !!rmState.problemsOpen;
      box.classList.toggle('hidden', !open);
      document.querySelectorAll('#view-relation [data-rm-action="toggle-problems"]').forEach(b => {
        b.setAttribute('aria-expanded', open ? 'true' : 'false');
        b.disabled = !probs.length;
        const c = b.querySelector('.rm-prob-count');
        if (c) c.textContent = probs.length ? String(probs.length) : ''; // 数は丸い札の中に（ボタンの色づけ：2026-10-07.2）
      });
      // 押すと、その看護問題へつながる流れだけを取り出した図にする（全体の図は線が多く、縮めると読みにくいため）
      box.innerHTML = open ? `<span class="rm-problems-title">看護問題ごとに見る（押すとその流れだけの図になります）</span>`
        + `<button type="button" role="menuitem" class="rm-prob-all${rmState.focusProblem ? '' : ' is-on'}" data-rm-action="focus-all">すべての流れ（全体の図）</button>`
        + probs.map(n => `<button type="button" role="menuitem" class="rm-prob-btn${/リスク|可能性|おそれ|危険/.test(n.label) ? ' is-risk' : ''}${rmState.focusProblem === n.id ? ' is-on' : ''}" data-rm-action="focus-problem" data-node-id="${escapeHtml(n.id)}" title="${escapeHtml(n.note ? `${n.note}（この看護問題へつながる流れだけを表示します）` : 'この看護問題へつながる流れだけを表示します')}">${escapeHtml(rmDisplayLabel(n))}${n.note ? `<small class="rm-prob-note">${escapeHtml(n.note)}</small>` : ''}</button>`).join('') : '';
    }
    // 【右クリックのメニュー】利用者からの要望：「右クリックで編集できるように。追加も右クリックで」（2026-10-06.21）。
    // 四角の上：文字の編集・事実／予測・矢印でつなぐ・優先度・削除。矢印（線）の上：向きを逆にする・事実／予測・間に四角・なぜ？・削除。
    // 何もない所：その場所に四角を追加（種類を選ぶ）。項目は選択バーと同じ操作（data-rm-action）を使う
    function rmShowCtx(e) {
      const box = document.getElementById('rm-ctx');
      const map = rmMap();
      if (!box) return;
      const g = e.target.closest('.rm-node'), l = !g && e.target.closest('.rm-link');
      const item = (act, html, extra = '') => `<button type="button" role="menuitem" class="rm-ctx-item${extra}" data-rm-action="${act}">${html}</button>`;
      let html = '';
      if (g && map) {
        const n = rmNodeById(map, g.dataset.nodeId);
        if (!n) return;
        rmSelect({ type: 'node', id: n.id });
        const prob = n.type === 'nursing_problem';
        html = `<div class="rm-ctx-title">${escapeHtml(rmShorten(rmDisplayLabel(n), 22))}</div>`
          + item('edit-node', '<i class="fa-solid fa-pen"></i> 文字を編集')
          + (prob ? item('edit-note', '<i class="fa-solid fa-comment-dots"></i> 補足（説明）を編集') : '')
          + item('connect', '<i class="fa-solid fa-arrow-right-long"></i> ここから矢印でつなぐ')
          + item('toggle-observed', n.observed === false ? '<i class="fa-solid fa-check"></i> 事実にする' : '<i class="fa-solid fa-ellipsis"></i> 予測にする（破線）')
          + (prob ? item('priority-up', '<i class="fa-solid fa-arrow-up"></i> 優先度を上げる') + item('priority-down', '<i class="fa-solid fa-arrow-down"></i> 優先度を下げる') : '')
          + (n.evidence ? item('node-evidence', '<i class="fa-solid fa-circle-info"></i> 根拠') : '')
          + item('delete', '<i class="fa-solid fa-trash"></i> 削除', ' rm-danger');
      } else if (l && map) {
        const ed = map.edges.find(x => x.id === l.dataset.linkId);
        if (!ed) return;
        rmSelect({ type: 'edge', id: ed.id });
        html = '<div class="rm-ctx-title">矢印</div>'
          + item('reverse', '<i class="fa-solid fa-right-left"></i> 向きを逆にする')
          + item('toggle-predicted', ed.predicted ? '<i class="fa-solid fa-check"></i> 事実にする（実線）' : '<i class="fa-solid fa-ellipsis"></i> 予測にする（破線）')
          + item('mid-add', '<i class="fa-solid fa-plus"></i> 間に四角を入れる')
          + item('delete', '<i class="fa-solid fa-trash"></i> 削除', ' rm-danger');
      } else {
        rmSelect(null);
        rmState.ctxPoint = rmClientToMap(e);
        html = '<div class="rm-ctx-title">ここに四角を追加</div>' + RM_TYPES.map(t => `<button type="button" role="menuitem" class="rm-ctx-item" data-rm-action="ctx-add" data-kind="${t.key}"><span class="rm-ctx-swatch${t.shape === 'ellipse' ? ' is-ellipse' : ''}" style="background:${t.fill};border-color:${t.stroke}"></span>${escapeHtml(t.label)}</button>`).join('');
      }
      box.innerHTML = html;
      box.classList.remove('hidden');
      const w = box.offsetWidth, h = box.offsetHeight;
      box.style.left = `${Math.max(6, Math.min(e.clientX, window.innerWidth - w - 6))}px`;
      box.style.top = `${Math.max(6, Math.min(e.clientY, window.innerHeight - h - 6))}px`;
      box.querySelector('.rm-ctx-item')?.focus({ preventScroll: true });
    }
    function rmHideCtx() { const box = document.getElementById('rm-ctx'); if (box && !box.classList.contains('hidden')) { box.classList.add('hidden'); box.innerHTML = ''; } }
    // 「その他」（印刷・画像で保存・すべて消す）の小さな一覧
    function rmSetMoreOpen(open) {
      rmState.moreOpen = !!open;
      const box = document.getElementById('rm-more');
      if (box) box.classList.toggle('hidden', !rmState.moreOpen);
      document.querySelectorAll('#view-relation [data-rm-action="toggle-more"]').forEach(b => b.setAttribute('aria-expanded', rmState.moreOpen ? 'true' : 'false'));
    }
    function rmSetProblemsOpen(open) {
      rmState.problemsOpen = !!open;
      rmRenderProblemList(rmMap());
    }
    function rmScrollToNode(id) {
      const wrap = document.getElementById('rm-canvas-wrap');
      const g = wrap && wrap.querySelector(`.rm-node[data-node-id="${rmCssEsc(id)}"]`);
      if (!g) return;
      const r = g.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
      wrap.scrollLeft += (r.left + r.width / 2) - (wr.left + wrap.clientWidth / 2);
      wrap.scrollTop += (r.top + r.height / 2) - (wr.top + wrap.clientHeight / 2);
    }
    function rmRenderEdgesOnly(map) {
      const g = document.querySelector('#rm-canvas-wrap .rm-links');
      if (g) g.innerHTML = rmEdgesSvg(map, { interactive: true });
    }
    function rmRenderToolbarState() {
      const set = (act, dis) => { const b = document.querySelector(`[data-rm-action="${act}"]`); if (b) b.disabled = dis; };
      set('undo', !rmState.undo.length);
      set('redo', !rmState.redo.length);
      const map = rmMap();
      const has = !!(map && map.nodes.length);
      document.querySelectorAll('[data-rm-needs-map]').forEach(b => { b.disabled = !has; });
      const tg = document.querySelector('[data-rm-action="toggle-added"]');
      if (tg) {
        const on = !!(map && map.nodes.some(n => n.added)), hidden = !!(map && map.addedStash);
        tg.setAttribute('aria-pressed', on ? 'true' : 'false');
        tg.classList.toggle('is-on', on);
        tg.innerHTML = `<i class="fa-solid ${on ? 'fa-eye' : 'fa-eye-slash'}"></i> ＋補足：${on ? 'あり' : 'なし'}${hidden && !on ? `（${map.addedStash.nodes.length}個を隠しています）` : ''}`;
      }
    }
    function rmCssEsc(id) { return (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(String(id)) : String(id).replace(/["\\]/g, '\\$&'); }
    function rmApplySelectionClasses() {
      const wrap = document.getElementById('rm-canvas-wrap');
      if (!wrap) return;
      const sel = rmState.selected;
      wrap.querySelectorAll('.rm-node').forEach(g => {
        g.classList.toggle('is-selected', !!sel && sel.type === 'node' && sel.id === g.dataset.nodeId);
        g.classList.toggle('is-connect-from', rmState.connectFrom === g.dataset.nodeId);
      });
      wrap.querySelectorAll('.rm-link').forEach(g => g.classList.toggle('is-selected', !!sel && sel.type === 'edge' && sel.id === g.dataset.linkId));
      wrap.classList.toggle('is-connecting', !!rmState.connectFrom);
      // 選んだ四角の「原因（左へたどる流れ）」と「結果（右へ進む流れ）」だけを濃く、ほかを薄く表示する
      // （看護問題を選ぶと、その問題を挙げた根拠の道筋がひと目で分かる）
      const map = rmMap();
      const svg = wrap.querySelector('svg');
      if (!svg || !map) return;
      const path = new Set();
      const pathEdges = new Set();
      if (sel && sel.type === 'node' && !rmState.connectFrom) {
        const walk = (start, up) => {
          const st = [start]; const seen = new Set([start]);
          while (st.length) {
            const id = st.pop(); path.add(id);
            map.edges.forEach(e => {
              const next = up ? (e.target === id ? e.source : null) : (e.source === id ? e.target : null);
              if (!next) return;
              pathEdges.add(e.id);
              if (!seen.has(next)) { seen.add(next); st.push(next); }
            });
          }
        };
        walk(sel.id, true); walk(sel.id, false);
      } else if (sel && sel.type === 'edge') {
        const e = map.edges.find(x => x.id === sel.id);
        if (e) { path.add(e.source); path.add(e.target); pathEdges.add(e.id); }
      }
      svg.classList.toggle('rm-focus', path.size > 0);
      wrap.querySelectorAll('.rm-node').forEach(g => g.classList.toggle('is-path', path.has(g.dataset.nodeId)));
      wrap.querySelectorAll('.rm-link').forEach(g => g.classList.toggle('is-path', pathEdges.has(g.dataset.linkId)));
    }
    function rmSelect(sel) { rmState.selected = sel; rmApplySelectionClasses(); rmRenderSelectionBar(); }
    function rmBtn(act, html, cls = 'btn-outline') { return `<button type="button" class="btn ${cls} text-[11px] py-1" data-rm-action="${act}">${html}</button>`; }
    function rmRenderSelectionBar() {
      const bar = document.getElementById('rm-selection-bar');
      if (!bar) return;
      const map = rmMap();
      const sel = rmState.selected;
      if (rmState.focusProblem && map) {
        const p = rmNodeById(map, rmState.focusProblem);
        bar.innerHTML = `<span class="rm-sel-label"><i class="fa-solid fa-filter"></i> 「${escapeHtml(p ? rmDisplayLabel(p) : '')}」へつながる流れだけを表示しています（見るだけ。直すときは全体の図で）</span>${rmBtn('focus-all', '<i class="fa-solid fa-diagram-project"></i> 全体の図に戻す', 'btn-primary')}`;
        return;
      }
      if (rmState.connectFrom) {
        bar.innerHTML = `<span class="rm-sel-label"><i class="fa-solid fa-arrow-right-long"></i> 矢印の行き先の四角を押してください（治療からなら「治療 → 対象」になります）</span>${rmBtn('cancel-connect', 'やめる（Esc）')}`;
        return;
      }
      // 何も選んでいないときの案内は1行だけ（長い説明は「操作のしかた」を開いたときだけ。ごちゃごちゃして見えないように）
      if (!map || !sel) { bar.innerHTML = '<span class="rm-sel-hint"><details class="rm-help"><summary>四角や矢印（線）を押す・右クリック（スマホは長押し）すると、編集できます（何もない所で右クリック・長押しすると追加） <span class="rm-help-more">操作のしかた</span></summary><div>四角を押すと、文字の編集・種類・事実／予測・矢印でつなぐ・削除ができます（2回続けて押すと文字の編集）。矢印（線）を押すと、<b>向きを逆にする</b>・種類・事実／予測・「なぜ？」が選べます。<br><b>図を動かす</b>：何もない所をドラッグ（スマホは指でスワイプ）。<b>拡大・縮小</b>：右下の ＋・－、2本指で広げる・つまむ、または左クリックを押したまま（または Ctrl を押しながら）ホイール。スマホで四角を動かすときは、一度タップして選んでからドラッグします。</div></details></span>'; return; }
      if (sel.type === 'node') {
        const n = rmNodeById(map, sel.id);
        if (!n) { rmState.selected = null; return rmRenderSelectionBar(); }
        const prob = n.type === 'nursing_problem';
        bar.innerHTML = `<span class="rm-sel-label">選んだ四角</span>
          ${rmBtn('edit-node', '<i class="fa-solid fa-pen"></i> 文字を編集')}
          ${prob ? rmBtn('edit-note', '<i class="fa-solid fa-comment-dots"></i> 補足（説明）') : ''}
          <label class="rm-kind-select"><span class="sr-only">種類</span><select class="field text-[11px] py-1" data-rm-action="kind">${RM_TYPES.map(t => `<option value="${t.key}"${t.key === n.type ? ' selected' : ''}>${escapeHtml(t.label)}</option>`).join('')}</select></label>
          <label class="rm-kind-select">情報の状態<select class="field" data-rm-action="status">${Object.entries(RM_STATUSES).map(([key, label]) => `<option value="${key}"${key === rmEpistemicStatus(n) ? ' selected' : ''}${(n.source === 'knowledge' || n.added) && key !== 'inferred' || n.type === 'future_risk' && key !== 'predicted' ? ' disabled' : ''}>${label}</option>`).join('')}</select></label>
          <label class="rm-kind-select">確からしさ<select class="field" data-rm-action="certainty">${Object.entries(RM_CERTAINTIES).map(([key, label]) => `<option value="${key}"${key === n.certainty ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
          ${n.type === 'medication' ? `<label class="rm-kind-select">薬剤の状態<select class="field" data-rm-action="medication-event">${Object.entries({ unknown: '状態未確認', order: '処方・指示', administered: '投与済み', reported: '申告', stopped: '中止' }).map(([key, label]) => `<option value="${key}"${key === n.medication?.eventType ? ' selected' : ''}>${label}</option>`).join('')}</select></label>` : ''}
          ${prob ? `${rmBtn('priority-up', '<i class="fa-solid fa-arrow-up"></i> 優先度を上げる')}${rmBtn('priority-down', '<i class="fa-solid fa-arrow-down"></i> 下げる')}` : ''}
          ${rmBtn('connect', '<i class="fa-solid fa-arrow-right-long"></i> ここから矢印でつなぐ', 'btn-primary')}
          ${n.evidence ? rmBtn('node-evidence', '<i class="fa-solid fa-circle-info"></i> 根拠') : ''}
          ${n.itemIds && n.itemIds.length ? rmBtn('show-card', '<i class="fa-solid fa-table-cells-large"></i> 元のカード') : ''}
          ${rmBtn('delete', '<i class="fa-solid fa-trash"></i> 削除', 'btn-outline rm-danger')}`;
      } else {
        const e = map.edges.find(x => x.id === sel.id);
        if (!e) { rmState.selected = null; return rmRenderSelectionBar(); }
        bar.innerHTML = `<span class="rm-sel-label">選んだ矢印</span>
          <label class="rm-kind-select"><span class="sr-only">矢印の意味</span><select class="field text-[11px] py-1" data-rm-action="relation">${RM_RELATIONS.map(r => `<option value="${r.key}"${r.key === e.relation ? ' selected' : ''}>${escapeHtml(r.label)}</option>`).join('')}</select></label>
          <label class="rm-kind-select">確からしさ<select class="field" data-rm-action="certainty">${Object.entries(RM_CERTAINTIES).map(([key, label]) => `<option value="${key}"${key === e.certainty ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
          ${rmBtn('toggle-predicted', e.predicted ? '事実にする（実線）' : '予測にする（破線）')}
          ${rmBtn('mid-add', '<i class="fa-solid fa-plus"></i> 間に四角を入れる')}
          ${rmBtn('reverse', '<i class="fa-solid fa-right-left"></i> 向きを逆にする', 'btn-primary')}
          ${rmBtn('delete', '<i class="fa-solid fa-trash"></i> 削除', 'btn-outline rm-danger')}`;
      }
    }
    // チェックの結果
    let rmLastIssues = null;
    function rmShowCheck(issues) {
      rmLastIssues = issues;
      const box = document.getElementById('rm-check');
      if (!box) return;
      if (!issues) { box.innerHTML = ''; box.classList.add('hidden'); return; }
      box.classList.remove('hidden');
      const fixable = issues.filter(i => i.fix).length;
      const icon = { error: 'fa-circle-xmark', warn: 'fa-triangle-exclamation', info: 'fa-circle-info' };
      box.innerHTML = `<div class="rm-check-head"><b><i class="fa-solid fa-list-check"></i> 関連図のチェック</b>
        <span>${issues.length ? `${issues.filter(i => i.level === 'error').length}件の要修正・${issues.filter(i => i.level === 'warn').length}件の確認・${issues.filter(i => i.level === 'info').length}件のヒント` : '問題は見つかりませんでした'}</span>
        ${fixable ? `<button type="button" class="btn btn-primary text-[11px] py-1" data-rm-action="autofix"><i class="fa-solid fa-wand-magic"></i> 自動で直す（${fixable}件）</button>` : ''}
        <button type="button" class="btn btn-outline text-[11px] py-1" data-rm-action="close-check">閉じる</button></div>
        ${issues.length ? `<ul class="rm-check-list">${issues.map((i, k) => `<li class="rm-check-${i.level}"><i class="fa-solid ${icon[i.level]}"></i> <span>${escapeHtml(i.msg)}</span>${(i.nodeIds || i.edgeIds) ? ` <button type="button" class="rm-check-show" data-rm-action="show-issue" data-issue="${k}">図で見る</button>` : ''}</li>`).join('')}</ul>` : ''}`;
    }

    // ---- 操作 ----
    function rmMutate(fn, { message, render = true } = {}) {
      const cp = getCurrentPatient();
      const map = rmMap(cp);
      if (!map) return;
      rmPushUndo(cp);
      fn(map);
      rmCommit(cp, map, { render });
      if (message) showToast(message, 'success');
    }
    async function rmEditNodeText(id) {
      const map = rmMap();
      const n = map && rmNodeById(map, id);
      if (!n) return;
      const v = await openDialog({ title: '四角の文字を編集', inputValue: n.label, placeholder: '例：深呼吸・咳嗽の抑制', confirmLabel: '更新する' });
      if (v === null || v === undefined) return;
      const t = String(v).trim().replace(/^#\s*\d+\s*/, '');
      if (!t) { showToast('空にはできません。消すときは「削除」を使ってください', 'warn'); return; }
      rmMutate(m => { const x = rmNodeById(m, id); if (x) {
        x.label = t.slice(0, RM_TEXT_MAX * 2); if (x.source === 'knowledge' || x.source === 'ai') x.source = 'user';
        // 看護問題の名前を、補足のある名前に書きかえたときは、その補足も付ける
        if (x.type === 'nursing_problem' && rmPlainNote(x.label)) x.note = rmPlainNote(x.label);
      } });
    }
    // 看護問題の補足（名前の下の小さい説明文）を直す。空にすると補足を消す
    async function rmEditNodeNote(id) {
      const map = rmMap();
      const n = map && rmNodeById(map, id);
      if (!n || n.type !== 'nursing_problem') return;
      const v = await openDialog({ title: '看護問題の補足（患者の状態をそのまま書いた説明）', inputValue: n.note || '', placeholder: '例：痰をうまく出せず、気道に分泌物がたまっている（空にすると補足を消します）', confirmLabel: '更新する' });
      if (v === null || v === undefined) return;
      const t = String(v).trim().slice(0, RM_NOTE_MAX);
      rmMutate(m => { const x = rmNodeById(m, id); if (x) { if (t) x.note = t; else delete x.note; } });
    }
    async function rmAddNode(type, at = null) {
      const t = RM_TYPE_BY_KEY.get(type) || RM_TYPE_BY_KEY.get('pathophysiology');
      const v = await openDialog({ title: `「${t.label}」の四角を追加`, inputValue: '', placeholder: type === 'nursing_problem' ? '例：非効果的気道浄化' : type === 'lab' ? '例：WBC 11600/μL' : type === 'treatment' ? '例：酸素投与' : '文字を入力', confirmLabel: '追加する' });
      if (v === null || v === undefined || !String(v).trim()) return;
      const cp = getCurrentPatient();
      const map = rmMap(cp) || { version: 2, nodes: [], edges: [], headers: [], source: 'manual', createdAt: new Date().toISOString() };
      if (map.nodes.length >= RM_MAX_NODES) { showToast(`四角は${RM_MAX_NODES}個までです`, 'warn'); return; }
      rmPushUndo(cp);
      const wrap = document.getElementById('rm-canvas-wrap');
      let x = 0, y = 0;
      if (map.nodes.length && wrap && !wrap.classList.contains('hidden')) {
        const b = rmBounds(map);
        x = b.x + (wrap.scrollLeft + wrap.clientWidth / 2) / rmState.zoom - RM_RECT_W / 2;
        y = b.y + (wrap.scrollTop + 60) / rmState.zoom;
        if (type === 'nursing_problem') { const probs = map.nodes.filter(n => n.type === 'nursing_problem'); if (probs.length) { x = probs[0].x; y = Math.max(...probs.map(n => n.y + rmNodeSize(n).h)) + RM_ROW_GAP; } }
      }
      // 右クリックした場所に置く（右クリックの「ここに追加」）
      if (at && Number.isFinite(at.x) && Number.isFinite(at.y)) { x = at.x - RM_RECT_W / 2; y = at.y - 20; }
      const priority = type === 'nursing_problem' ? map.nodes.filter(n => n.type === 'nursing_problem').length + 1 : 0;
      const node = { id: rmNewId('n'), type: t.key, label: String(v).trim().replace(/^#\s*\d+\s*/, '').slice(0, RM_TEXT_MAX * 2), evidence: '', observed: type !== 'future_risk', source: 'user', priority, x: Math.round(x), y: Math.round(y), itemIds: [] };
      map.nodes.push(node);
      rmState.selected = { type: 'node', id: node.id };
      rmCommit(cp, map);
      showToast('追加しました。「ここから矢印でつなぐ」で原因・結果につないでください（つながらない四角は浮島になります）', 'info');
    }
    function rmDeleteSelected() {
      const sel = rmState.selected;
      if (!sel) return;
      rmMutate(map => {
        if (sel.type === 'node') {
          map.nodes = map.nodes.filter(n => n.id !== sel.id);
          map.edges = map.edges.filter(e => e.source !== sel.id && e.target !== sel.id);
          rmRenumberProblems(map);
        } else map.edges = map.edges.filter(e => e.id !== sel.id);
      });
      rmState.selected = null;
      renderRelationMap();
      showToast('削除しました（「元に戻す」で戻せます）', 'info');
    }
    function rmConnectTo(targetId) {
      const from = rmState.connectFrom;
      rmState.connectFrom = null;
      if (!from || from === targetId) { rmApplySelectionClasses(); rmRenderSelectionBar(); return; }
      const map = rmMap();
      if (map.edges.some(e => (e.source === from && e.target === targetId) || (e.source === targetId && e.target === from))) { showToast('この2つの間にはもう矢印があります（両向きの矢印は作りません。向きは「向きを逆に」で変えられます）', 'info'); rmApplySelectionClasses(); rmRenderSelectionBar(); return; }
      if (map.edges.length >= RM_MAX_EDGES) { showToast(`矢印は${RM_MAX_EDGES}本までです`, 'warn'); return; }
      const a = rmNodeById(map, from), b = rmNodeById(map, targetId);
      const id = rmNewId('e');
      rmMutate(m => { m.edges.push({ id, source: from, target: targetId, relation: ['treatment', 'medication'].includes(a.type) && !['treatment', 'medication'].includes(b.type) && b.type !== 'nursing_problem' ? 'treats' : ['lab', 'vital'].includes(a.type) ? 'supports' : 'related_to', predicted: b.observed === false, evidence: '' }); });
      rmState.selected = { type: 'edge', id };
      renderRelationMap();
    }
    function rmUndoRedo(redo) {
      const cp = getCurrentPatient();
      const from = redo ? rmState.redo : rmState.undo, to = redo ? rmState.undo : rmState.redo;
      if (!from.length) return;
      to.push(rmSnapshot(cp));
      const snap = from.pop();
      let map = null;
      try { map = normalizeRelationMap(JSON.parse(snap)); } catch (e) { map = null; }
      rmState.selected = null; rmState.connectFrom = null;
      rmCommit(cp, map);
      showToast(redo ? 'やり直しました' : '元に戻しました', 'info');
    }
    function rmZoom(factor) {
      if (factor === 'fit' || factor === 'fit-readable') {
        const wrap = document.getElementById('rm-canvas-wrap');
        const map = rmMap();
        // 「全体」は図全体が入る大きさ。作った直後（fit-readable）は、文字が読める大きさ（85%）より小さくしない（はみ出す分は横にスクロール）
        if (wrap && map && map.nodes.length) { const b = rmBounds((rmState.focusProblem && rmProblemSubmap(map, rmState.focusProblem)) || map); rmState.zoom = Math.max(factor === 'fit' ? 0.25 : wrap.clientWidth < 600 ? 0.55 : 0.85, Math.min(1.2, Math.min((wrap.clientWidth - 8) / b.w, (wrap.clientHeight - 8) / b.h))); }
        else rmState.zoom = 1;
      } else rmState.zoom = Math.max(0.25, Math.min(2, Math.round(rmState.zoom * factor * 100) / 100));
      renderRelationMap();
      if (factor === 'fit' || factor === 'fit-readable') rmScrollToMapStart(document.getElementById('rm-canvas-wrap'), factor === 'fit');
    }
    // 図の左上（余白の内側）が見える位置へ。center なら、図が枠より小さいときはまん中に
    function rmScrollToMapStart(wrap, center = false) {
      const svg = wrap && wrap.querySelector('svg');
      if (!svg) return;
      const dx = center ? Math.max(0, (wrap.clientWidth - svg.clientWidth) / 2) : 8;
      const dy = center ? Math.max(0, (wrap.clientHeight - svg.clientHeight) / 2) : 8;
      const r = svg.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
      wrap.scrollLeft = Math.max(0, r.left - wr.left + wrap.scrollLeft - dx);
      wrap.scrollTop = Math.max(0, r.top - wr.top + wrap.scrollTop - dy);
      // 図が枠より高いとき（スマホなど）は、疾患（図のまん中の幹）が枠の上下のまん中に来るようにする
      // （左上から見せると、何もない所しか見えないことがあった）
      if (!center && svg.clientHeight > wrap.clientHeight) {
        const dis = wrap.querySelector('.rm-node[data-kind="disease"]');
        if (dis) { const d = dis.getBoundingClientRect(); wrap.scrollTop = Math.max(0, wrap.scrollTop + (d.top + d.height / 2) - (wr.top + wrap.clientHeight / 2)); }
      }
    }
    // 作った直後のチェック結果は、直すべきこと（要修正・確認）があるときだけ出す。ヒントだけなら出さない
    // （スマホで図の上がチェックの枠で埋まり、図が見えにくかった。2026-10-06.22）。「チェック」を押せばいつでも見られる
    function rmShowCheckIfNeeded(map) {
      const issues = validateRelationMap(map);
      rmShowCheck(issues.some(i => i.level !== 'info') ? issues : null);
    }
    async function rmClearAll() {
      const map = rmMap();
      if (!map || !map.nodes.length) return;
      const ok = await openDialog({ title: '関連図をすべて消しますか？', message: 'この患者の関連図の四角と矢印をすべて消します。消したあとも「元に戻す」で戻せます（ページを開き直すと戻せなくなります）。', confirmLabel: 'すべて消す', danger: true });
      if (ok !== true) return;
      rmState.selected = null; rmState.connectFrom = null;
      rmCommit(getCurrentPatient(), null, { pushUndo: true });
      rmShowCheck(null);
      showToast('関連図を消しました（「元に戻す」で戻せます）', 'info');
    }
    function rmMoveProblem(id, dir) {
      rmMutate(map => {
        const probs = map.nodes.filter(n => n.type === 'nursing_problem').sort((a, b) => a.priority - b.priority);
        const k = probs.findIndex(n => n.id === id);
        const j = k + dir;
        if (k < 0 || j < 0 || j >= probs.length) return;
        [probs[k], probs[j]] = [probs[j], probs[k]];
        probs.forEach((p, i) => { p.priority = i + 1; });
        // 右端の列の上下も入れ替える
        const ys = probs.map(p => p.y).sort((a, b) => a - b);
        probs.forEach((p, i) => { p.y = ys[i]; });
      });
    }

    // ---- 印刷・画像 ----
    function relationMapPrintHtml(cp, map, { perProblem = false } = {}) {
      const now = new Date().toLocaleString('ja-JP');
      const probs = map.nodes.filter(n => n.type === 'nursing_problem').sort((a, b) => a.priority - b.priority);
      return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>${escapeHtml(`${cp.title || '患者'}_関連図`)}</title><style>
  @page { size: A4 landscape; margin: 8mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; background: #fff; }
  body { font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif; color: #1f1d1a; font-size: 9pt; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2pt solid #2c4a3e; padding-bottom: 3pt; margin-bottom: 4pt; }
  .head h1 { font-size: 14pt; margin: 0; }
  .meta { font-size: 8pt; color: #4a463f; text-align: right; }
  .fig svg { display: block; width: 100%; height: auto; max-height: 160mm; }
  .legend { margin-top: 3pt; font-size: 7.5pt; color: #4a463f; display: flex; flex-wrap: wrap; gap: 3pt 10pt; align-items: center; }
  .rm-legend-item { display: inline-flex; align-items: center; gap: 3pt; }
  .rm-legend-swatch { display: inline-block; width: 12pt; height: 8pt; border: 1pt solid; border-radius: 2pt; }
  .rm-legend-swatch.is-ellipse { border-radius: 50%; }
  .probs { font-size: 8pt; margin-top: 2pt; }
  /* 看護問題ごとの図は1問題1ページ（A4に大きく出せる） */
  .page { break-before: page; page-break-before: always; }
</style></head><body>
<div class="head"><h1>関連図</h1><div class="meta">患者：${escapeHtml(cp.title || '')}<br>出力日時：${escapeHtml(now)}</div></div>
<div class="fig">${relationMapSvg(map, { interactive: false, title: `${cp.title || ''}の関連図` })}</div>
<div class="legend">${rmLegendHtml()}</div>
${probs.length ? `<div class="probs">看護問題：${probs.map(p => escapeHtml(rmDisplayLabel(p))).join('　')}</div>` : ''}
${perProblem ? probs.map(p => { const sub = rmProblemSubmap(map, p.id); return sub ? `<section class="page"><div class="head"><h1>${escapeHtml(rmDisplayLabel(p))} の関連図</h1><div class="meta">患者：${escapeHtml(cp.title || '')}</div></div><div class="fig">${relationMapSvg(sub, { interactive: false, title: `${rmDisplayLabel(p)}の関連図` })}</div></section>` : ''; }).join('') : ''}
</body></html>`;
    }
    // 【看護問題ごとの図】その看護問題へたどれる四角（原因・症状・病態・背景）と、それらへの治療・検査データだけを
    // 取り出して並べ直した図。全体の図は中央に線が集まり、スマホやA4に縮めると読みにくい（利用者の声：2026-10-06.26）
    function rmProblemSubmap(map, problemId) {
      const p = map && map.nodes.find(n => n.id === problemId && n.type === 'nursing_problem');
      if (!p) return null;
      const keep = new Set([p.id]);
      const stack = [p.id];
      while (stack.length) {
        const id = stack.pop();
        map.edges.forEach(e => { if (e.target === id && e.relation !== 'treats' && !keep.has(e.source)) { const s = map.nodes.find(n => n.id === e.source); if (s && s.type !== 'nursing_problem') { keep.add(s.id); stack.push(s.id); } } });
      }
      // 取り出した四角への治療（┤）と、その四角にくっつく検査データも入れる
      map.edges.forEach(e => { if (keep.has(e.target) && !keep.has(e.source)) { const s = map.nodes.find(n => n.id === e.source); if (s && (e.relation === 'treats' || ['lab', 'vital'].includes(s.type))) keep.add(s.id); } });
      const sub = JSON.parse(JSON.stringify({ ...map, nodes: map.nodes.filter(n => keep.has(n.id)), edges: map.edges.filter(e => keep.has(e.source) && keep.has(e.target)) }));
      delete sub.addedStash;
      layoutRelationMap(sub);
      return sub;
    }
    function rmPrint(perProblem = false) {
      const cp = getCurrentPatient();
      const map = rmMap(cp);
      if (!map || !map.nodes.length) { showToast('印刷する関連図がありません', 'warn'); return; }
      printHtmlDocument(relationMapPrintHtml(cp, map, { perProblem }), { keepSvg: true });
      showToast(isMobilePrintTarget() ? '印刷用の見本を開きました。上の「印刷・PDFに保存」を押してください' : '印刷画面を開きます。「送信先」で「PDFに保存」を選ぶとPDFになります（A4横）', 'info');
    }
    function rmSavePng() {
      const cp = getCurrentPatient();
      const map = rmMap(cp);
      if (!map || !map.nodes.length) { showToast('保存する関連図がありません', 'warn'); return; }
      const svg = relationMapSvg(map, { interactive: false, zoom: 2, title: `${cp.title || ''}の関連図` });
      const img = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      const fail = () => showToast('画像を作れませんでした。「印刷 / PDF」を使ってください', 'error');
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width; canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(blob => {
            if (!blob) return fail();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${String(cp.title || '患者').replace(/[\\/:*?"<>|]/g, '_')}_関連図.png`;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 10000);
            showToast('関連図を画像（PNG）で保存しました', 'success');
          }, 'image/png');
        } catch (e) { fail(); } finally { URL.revokeObjectURL(url); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); fail(); };
      img.src = url;
    }

    // ---- 画面の操作の受け取り ----
    // 指（またはマウス）の位置を中心に拡大・縮小する。図を描き直さず、大きさだけ変える（2本指の操作でも軽い）
    function rmZoomAt(z, clientX, clientY) {
      const wrap = document.getElementById('rm-canvas-wrap');
      const svg = wrap && wrap.querySelector('svg.rm-svg');
      if (!svg) return;
      z = Math.max(0.25, Math.min(2, z));
      const old = rmState.zoom;
      if (Math.abs(z - old) < 0.001) return;
      const r = svg.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
      const mx = (clientX - r.left) / old, my = (clientY - r.top) / old; // 指の下にある図の位置
      const left = r.left - wr.left + wrap.scrollLeft, top = r.top - wr.top + wrap.scrollTop;
      const vb = svg.viewBox.baseVal;
      rmState.zoom = Math.round(z * 1000) / 1000;
      svg.setAttribute('width', Math.round(vb.width * rmState.zoom));
      svg.setAttribute('height', Math.round(vb.height * rmState.zoom));
      wrap.scrollLeft = left + mx * rmState.zoom - (clientX - wr.left);
      wrap.scrollTop = top + my * rmState.zoom - (clientY - wr.top);
    }
    function rmClientToMap(e) {
      const svg = document.querySelector('#rm-canvas-wrap svg');
      if (!svg) return { x: 0, y: 0 };
      const r = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      return { x: vb.x + (e.clientX - r.left) / rmState.zoom, y: vb.y + (e.clientY - r.top) / rmState.zoom };
    }
    // 【全画面】利用者からの要望：「関連図に全画面機能を」「サイト全体ではなく関連図の範囲だけを広げる」。図の枠だけを画面いっぱいに広げる（CSS の .rm-fullscreen）。
    // もう一度押すか Esc キーで元に戻る。ほかのページに切り替えたときも元に戻す（js/05 の switchView）。
    function rmSetFullscreen(force) {
      const view = document.getElementById('view-relation');
      if (!view) return false;
      const on = typeof force === 'boolean' ? force : !view.classList.contains('rm-fullscreen');
      view.classList.toggle('rm-fullscreen', on);
      document.body.classList.toggle('rm-fs-open', on);
      const b = document.querySelector('.rm-zoom-pad [data-rm-action="fullscreen"]');
      if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false');
      // 広げた後・戻した後の大きさで、図が見える位置を保つ（拡大率はそのまま）
      document.getElementById('rm-canvas-wrap')?.focus({ preventScroll: true });
      return on;
    }
    window.rmSetFullscreen = rmSetFullscreen;
    function initRelationMapUi() {
      const view = document.getElementById('view-relation');
      if (!view || view.dataset.ready) return;
      view.dataset.ready = '1';
      view.addEventListener('click', e => {
        const btn = e.target.closest('[data-rm-action]');
        if (!btn || btn.tagName === 'SELECT') return;
        const act = btn.dataset.rmAction;
        const sel = rmState.selected;
        if (btn.closest('#rm-ctx')) rmHideCtx();
        if (act === 'ctx-add') rmAddNode(btn.dataset.kind || 'pathophysiology', rmState.ctxPoint);
        else if (act === 'toggle-text') { rmState.textView = !rmState.textView; renderRelationMap(); }
        else if (act === 'resolve-conflict' && typeof resolveRelationMapConflict === 'function') resolveRelationMapConflict();
        else if (act === 'export-conflict-backup') {
          try { const text = localStorage.getItem(`nursing_relation_map_conflict_${getCurrentPatient().id}`); if (text) downloadTextBlob(new Blob([text], { type: 'application/json' }), '関連図_競合時の控え.json'); }
          catch (err) { showToast('控えを保存できませんでした', 'error'); }
        }
        else if (act === 'select-node') { if (rmState.connectFrom) rmConnectTo(btn.dataset.nodeId); else rmSelect({ type: 'node', id: btn.dataset.nodeId }); }
        else if (act === 'select-edge') rmSelect({ type: 'edge', id: btn.dataset.edgeId });
        else if (act === 'import-clinical') rmMutate(map => { rmImportClinicalEntities(map, getCurrentPatient()); rmPrepareClinicalMap(map, getCurrentPatient()); });
        else if (act === 'build-rules') rmBuild();
        else if (act === 'add') rmAddNode(document.getElementById('rm-add-kind')?.value || 'pathophysiology');
        else if (act === 'relayout') rmMutate(map => layoutRelationMap(map), { message: '並べ直しました（重要な看護問題ほど上・看護問題は右端）' });
        else if (act === 'undo') rmUndoRedo(false);
        else if (act === 'redo') rmUndoRedo(true);
        else if (act === 'check') { const m = rmMap(); rmShowCheck(m ? validateRelationMap(m, getCurrentPatient()) : []); }
        else if (act === 'autofix' && rmLastIssues) { let n = 0; rmMutate(map => { n = rmApplyFixes(map, rmLastIssues); }); rmShowCheck(validateRelationMap(rmMap())); showToast(`${n}件を直しました（「元に戻す」で戻せます）`, 'success'); }
        else if (act === 'close-check') rmShowCheck(null);
        else if (act === 'show-issue' && rmLastIssues) {
          const is = rmLastIssues[Number(btn.dataset.issue)];
          if (is && is.nodeIds) rmSelect({ type: 'node', id: is.nodeIds[0] });
          else if (is && is.edgeIds) rmSelect({ type: 'edge', id: is.edgeIds[0] });
          document.getElementById('rm-canvas-wrap')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
        else if (act === 'zoom-in') rmZoom(1.2);
        else if (act === 'zoom-out') rmZoom(1 / 1.2);
        else if (act === 'zoom-fit') rmZoom('fit');
        else if (act === 'zoom-100') { rmState.zoom = 1; renderRelationMap(); }
        else if (act === 'bridge') rmBridgeAll();
        else if (act === 'toggle-added') rmToggleAdded();
        else if (act === 'fullscreen') rmSetFullscreen();
        else if (act === 'toggle-problems') { rmSetMoreOpen(false); rmSetProblemsOpen(!rmState.problemsOpen); }
        else if (act === 'toggle-more') { rmSetProblemsOpen(false); rmSetMoreOpen(!rmState.moreOpen); }
        else if (act === 'goto-problem') { const id = btn.dataset.nodeId; rmSetProblemsOpen(false); if (rmNodeById(rmMap(), id)) { rmSelect({ type: 'node', id }); rmScrollToNode(id); } }
        else if (act === 'print') { rmSetMoreOpen(false); rmPrint(); }
        else if (act === 'print-per-problem') { rmSetMoreOpen(false); rmPrint(true); }
        else if (act === 'focus-problem') { rmSetProblemsOpen(false); rmState.focusProblem = btn.dataset.nodeId || null; rmState.selected = null; rmState.connectFrom = null; renderRelationMap(); rmZoom('fit'); }
        else if (act === 'focus-all') { rmSetProblemsOpen(false); rmState.focusProblem = null; renderRelationMap(); rmZoom('fit'); }
        else if (act === 'png') { rmSetMoreOpen(false); rmSavePng(); }
        else if (act === 'clear') { rmSetMoreOpen(false); rmClearAll(); }
        else if (!sel) return;
        else if (act === 'edit-node') rmEditNodeText(sel.id);
        else if (act === 'edit-note') rmEditNodeNote(sel.id);
        else if (act === 'connect') { rmState.connectFrom = sel.id; rmApplySelectionClasses(); rmRenderSelectionBar(); }
        else if (act === 'cancel-connect') { rmState.connectFrom = null; rmApplySelectionClasses(); rmRenderSelectionBar(); }
        else if (act === 'delete') rmDeleteSelected();
        else if (act === 'toggle-observed') rmMutate(m => { const n = rmNodeById(m, sel.id); if (n) { n.observed = n.observed === false; delete n.epistemicStatus; } });
        else if (act === 'priority-up') rmMoveProblem(sel.id, -1);
        else if (act === 'priority-down') rmMoveProblem(sel.id, 1);
        else if (act === 'node-evidence') { const n = rmNodeById(rmMap(), sel.id); if (n) openDialog({ title: 'この四角の根拠', message: `${rmDisplayLabel(n)}\n\n${n.evidence}`, confirmLabel: '閉じる' }); }
        else if (act === 'show-card') {
          const n = rmNodeById(rmMap(), sel.id);
          const id = n && n.itemIds && n.itemIds.find(x => (getCurrentPatient().items || []).some(i => i.id === x));
          if (id && typeof jumpToBoardCard === 'function') jumpToBoardCard(id); else showToast('元のカードが見つかりません（消したか、分類し直した可能性があります）', 'warn');
        }
        else if (act === 'toggle-predicted') rmMutate(m => { const x = m.edges.find(y => y.id === sel.id); if (x) x.predicted = !x.predicted; });
        else if (act === 'mid-add') rmBridgeEdgeManual(sel.id);
        else if (act === 'reverse') {
          // 向きを逆にしたら並べ直す（左向きの矢印を残さない）。「治療 → 対象」を逆にしたときは、ふつうの矢印にする
          rmMutate(m => { const x = m.edges.find(y => y.id === sel.id); if (x) { const t = x.source; x.source = x.target; x.target = t; const src = m.nodes.find(n => n.id === x.source); if (x.relation === 'treats' && (!src || !['treatment', 'medication'].includes(src.type))) x.relation = 'causes'; layoutRelationMap(m); } });
          showToast('矢印の向きを逆にして、左から右へ並べ直しました（「元に戻す」で戻せます）', 'success');
        }
      });
      view.addEventListener('change', e => {
        const s = e.target.closest('select[data-rm-action]');
        if (!s || !rmState.selected) return;
        const id = rmState.selected.id;
        if (s.dataset.rmAction === 'kind') rmMutate(m => { const n = rmNodeById(m, id); if (n && RM_TYPE_BY_KEY.has(s.value)) { n.type = s.value; delete n.epistemicStatus; if (s.value === 'future_risk') n.observed = false; rmRenumberProblems(m); } });
        else if (s.dataset.rmAction === 'status') rmMutate(m => { const n = rmNodeById(m, id); if (n && Object.hasOwn(RM_STATUSES, s.value)) { n.epistemicStatus = s.value; n.observed = !['predicted', 'planned'].includes(s.value); } });
        else if (s.dataset.rmAction === 'certainty') rmMutate(m => { const n = rmState.selected.type === 'node' ? rmNodeById(m, id) : m.edges.find(x => x.id === id); if (n && Object.hasOwn(RM_CERTAINTIES, s.value)) n.certainty = s.value; });
        else if (s.dataset.rmAction === 'medication-event') rmMutate(m => { const n = rmNodeById(m, id); if (n && ['order', 'administered', 'reported', 'stopped', 'unknown'].includes(s.value)) { n.medication = { name: n.medication?.name || n.label, eventType: s.value }; n.epistemicStatus = s.value === 'order' ? 'planned' : s.value === 'reported' ? 'reported' : 'observed'; n.observed = s.value !== 'order'; } });
        else if (s.dataset.rmAction === 'relation') rmMutate(m => { const x = m.edges.find(y => y.id === id); if (x && RM_RELATION_KEYS.has(s.value)) { x.relation = s.value; if (s.value === 'predicts') x.predicted = true; } });
      });
      const wrap = document.getElementById('rm-canvas-wrap');
      if (!wrap) return;
      let raf = 0;
      // ボードを動かす：何もない所（スマホは四角の上も）をドラッグ・スワイプするとスクロール。2本指で拡大・縮小
      const pointers = new Map();
      let pan = null, pinch = null;
      const longPress = { timer: 0, fired: false, sx: 0, sy: 0 };
      const nodeTap = id => {
        if (rmState.connectFrom) { rmConnectTo(id); return; }
        // 同じ四角を続けて2回押したら文字の編集（pointerdown で既定の動きを止めているため、dblclick は使わない）
        const now = Date.now();
        const last = rmState.lastTap;
        rmState.lastTap = { id, at: now };
        if (last && last.id === id && now - last.at < 450) { rmState.lastTap = null; rmSelect({ type: 'node', id }); rmEditNodeText(id); }
        else rmSelect({ type: 'node', id });
      };
      const startPinch = () => {
        const [a, b] = [...pointers.values()];
        pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: rmState.zoom };
        pan = null;
        if (rmState.drag) { const d = rmState.drag; rmState.drag = null; if (d.moved) { rmState.undo.push(d.before); rmState.redo = []; rmCommit(getCurrentPatient(), rmMap()); } }
      };
      wrap.addEventListener('pointerdown', e => {
        if (e.button !== undefined && e.button !== 0) return;
        if (!e.target.closest('svg')) return; // ボードの外（スクロールバーなど）はブラウザに任せる
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        try { wrap.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
        if (pointers.size === 2) { startPinch(); e.preventDefault(); return; }
        if (pointers.size > 2) return;
        const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
        // 看護問題ごとの図（見るだけ）では、どこを触っても図を動かすだけ
        const g = rmState.focusProblem ? null : e.target.closest('.rm-node');
        const lg = rmState.focusProblem ? null : e.target.closest('.rm-link');
        // 【長押しでメニュー】スマホ・タブレットは右クリックの代わりに、動かさずに長押し（0.55秒）で同じメニューを出す
        clearTimeout(longPress.timer);
        longPress.fired = false;
        if (touch) {
          const tgt = e.target, cx = e.clientX, cy = e.clientY, pid = e.pointerId;
          longPress.sx = cx; longPress.sy = cy;
          longPress.timer = setTimeout(() => {
            if (rmState.focusProblem) return;
            if (pointers.size !== 1 || (pan && pan.moved) || (rmState.drag && rmState.drag.moved)) return;
            if (pan && pan.pointerId === pid) { pan = null; wrap.classList.remove('is-panning'); }
            if (rmState.drag && rmState.drag.pointerId === pid) rmState.drag = null;
            longPress.fired = true;
            rmShowCtx({ target: tgt, clientX: cx, clientY: cy });
          }, 550);
        }
        const startPan = tap => { pan = { pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, sl: wrap.scrollLeft, st: wrap.scrollTop, moved: false, tap }; };
        if (g) {
          const map = rmMap();
          const node = map && rmNodeById(map, g.dataset.nodeId);
          if (!node) return;
          const selectedHere = rmState.selected && rmState.selected.type === 'node' && rmState.selected.id === node.id;
          // スマホ・タブレットでは、選んでいない四角の上のスワイプはボードを動かす（四角を動かすのは、選んでから）
          if (touch && !selectedHere && !rmState.connectFrom) { startPan({ type: 'node', id: node.id }); e.preventDefault(); return; }
          const p = rmClientToMap(e);
          rmState.drag = { id: node.id, dx: p.x - node.x, dy: p.y - node.y, sx: e.clientX, sy: e.clientY, moved: false, before: rmSnapshot(getCurrentPatient()), pointerId: e.pointerId };
          e.preventDefault();
        } else if (lg) { startPan({ type: 'edge', id: lg.dataset.linkId }); e.preventDefault(); }
        else { startPan({ type: 'bg' }); e.preventDefault(); }
      });
      wrap.addEventListener('pointermove', e => {
        if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (longPress.timer && Math.hypot(e.clientX - longPress.sx, e.clientY - longPress.sy) > 8) { clearTimeout(longPress.timer); longPress.timer = 0; }
        if (pinch && pointers.size >= 2) {
          const [a, b] = [...pointers.values()];
          const z = pinch.z0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0;
          rmZoomAt(z, (a.x + b.x) / 2, (a.y + b.y) / 2);
          return;
        }
        if (pan && pan.pointerId === e.pointerId) {
          if (!pan.moved && Math.hypot(e.clientX - pan.sx, e.clientY - pan.sy) < 5) return;
          pan.moved = true;
          wrap.classList.add('is-panning');
          wrap.scrollLeft = pan.sl - (e.clientX - pan.sx);
          wrap.scrollTop = pan.st - (e.clientY - pan.sy);
          return;
        }
        const d = rmState.drag;
        if (!d || d.pointerId !== e.pointerId) return;
        if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
        d.moved = true;
        const map = rmMap();
        const node = map && rmNodeById(map, d.id);
        if (!node) return;
        const p = rmClientToMap(e);
        const nx = Math.round(p.x - d.dx), ny = Math.round(p.y - d.dy), mx = nx - node.x, my = ny - node.y;
        node.x = nx; node.y = ny;
        if (node.attachTo) delete node.attachTo; // くっついていた検査データを引きはがしたら、矢印で表示する
        const moveG = n => { const g = wrap.querySelector(`.rm-node[data-node-id="${rmCssEsc(n.id)}"]`); if (g) g.setAttribute('transform', `translate(${n.x},${n.y})`); };
        moveG(node);
        map.nodes.forEach(l => { if (l.attachTo === node.id) { l.x += mx; l.y += my; moveG(l); } }); // くっついている検査データも一緒に動かす
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; rmRenderEdgesOnly(map); });
      });
      const endDrag = e => {
        pointers.delete(e.pointerId);
        clearTimeout(longPress.timer); longPress.timer = 0;
        if (longPress.fired) { longPress.fired = false; return; } // 長押しでメニューを出したときは、タップとして扱わない
        if (pinch) { if (pointers.size < 2) pinch = null; return; }
        if (pan && pan.pointerId === e.pointerId) {
          const p = pan;
          pan = null;
          wrap.classList.remove('is-panning');
          if (p.moved || e.type !== 'pointerup') return;
          // 動かさずに離した＝タップ
          if (p.tap.type === 'node') nodeTap(p.tap.id);
          else if (p.tap.type === 'edge') { if (!rmState.connectFrom) rmSelect({ type: 'edge', id: p.tap.id }); }
          else if (rmState.connectFrom) { rmState.connectFrom = null; rmApplySelectionClasses(); rmRenderSelectionBar(); }
          else if (rmState.selected) rmSelect(null);
          return;
        }
        const d = rmState.drag;
        if (!d || d.pointerId !== e.pointerId) return;
        rmState.drag = null;
        const cp = getCurrentPatient();
        if (d.moved) {
          rmState.undo.push(d.before);
          if (rmState.undo.length > RM_UNDO_MAX) rmState.undo.shift();
          rmState.redo = [];
          rmCommit(cp, rmMap(cp));
        } else if (e.type === 'pointerup') nodeTap(d.id);
      };
      wrap.addEventListener('pointerup', endDrag);
      wrap.addEventListener('pointercancel', endDrag);
      // Ctrl（Mac は ⌘）＋ホイール、トラックパッドのピンチで拡大・縮小（ふつうのホイールはスクロール）
      // 【拡大・縮小】Ctrl（Mac は ⌘）＋ホイールに加え、利用者からの要望でパソコンでは「左クリックを押したまま＋ホイール」でも
      // 拡大・縮小する（四角を動かしている最中は除く）。押したままのボードの移動（pan）は、拡大・縮小した後の位置から続ける。
      // 左ボタンを押しているかは自分でも覚えておく（ブラウザによってはホイールの e.buttons に押したボタンが入らない）
      let mouseLeftDown = false;
      wrap.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button === 0) mouseLeftDown = true; });
      ['pointerup', 'pointercancel', 'blur'].forEach(t => window.addEventListener(t, () => { mouseLeftDown = false; }));
      wrap.addEventListener('wheel', e => {
        const leftHeld = ((e.buttons & 1) === 1 || mouseLeftDown) && !rmState.drag;
        if (!(e.ctrlKey || e.metaKey || leftHeld) || !rmMap()) return;
        e.preventDefault();
        rmZoomAt(rmState.zoom * Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY);
        if (pan) { pan.sx = e.clientX; pan.sy = e.clientY; pan.sl = wrap.scrollLeft; pan.st = wrap.scrollTop; pan.moved = true; }
      }, { passive: false });
      wrap.addEventListener('contextmenu', e => { if (!rmMap()) return; e.preventDefault(); if (!rmState.focusProblem) rmShowCtx(e); });
      document.addEventListener('pointerdown', e => { if (!(e.target.closest && e.target.closest('#rm-ctx'))) rmHideCtx(); }, true);
      wrap.addEventListener('scroll', rmHideCtx, { passive: true });
      // 看護問題の一覧は、一覧とボタンの外を押すと閉じる
      document.addEventListener('click', e => {
        if (rmState.moreOpen && !(e.target.closest && e.target.closest('#rm-more, [data-rm-action="toggle-more"]'))) rmSetMoreOpen(false);
        if (!rmState.problemsOpen) return;
        if (e.target.closest && e.target.closest('#rm-problems, [data-rm-action="toggle-problems"]')) return;
        rmSetProblemsOpen(false);
      });
      document.addEventListener('keydown', e => {
        if (e.key !== 'Escape' || e.defaultPrevented) return;
        const ctx = document.getElementById('rm-ctx');
        if (ctx && !ctx.classList.contains('hidden')) { rmHideCtx(); return; }
        if (rmState.problemsOpen) { rmSetProblemsOpen(false); return; }
        if (rmState.moreOpen) { rmSetMoreOpen(false); return; }
        const view = document.getElementById('view-relation');
        if (!view || !view.classList.contains('rm-fullscreen')) return;
        if (rmState.connectFrom || rmState.selected) return;
        rmSetFullscreen(false);
      });
      wrap.addEventListener('keydown', e => {
        const g = e.target.closest('.rm-node');
        if (e.key === 'Escape' && (rmState.connectFrom || rmState.selected)) { e.stopPropagation(); rmState.connectFrom = null; rmSelect(null); return; }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); rmUndoRedo(e.shiftKey); return; }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); rmUndoRedo(true); return; }
        if (!g || !rmMap()) return;
        const id = g.dataset.nodeId;
        const refocus = () => requestAnimationFrame(() => document.querySelector(`#rm-canvas-wrap .rm-node[data-node-id="${rmCssEsc(id)}"]`)?.focus());
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (rmState.connectFrom) rmConnectTo(id);
          else if (rmState.selected && rmState.selected.type === 'node' && rmState.selected.id === id) rmEditNodeText(id);
          else rmSelect({ type: 'node', id });
          refocus();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          rmState.selected = { type: 'node', id };
          rmDeleteSelected();
        } else if (/^Arrow/.test(e.key)) {
          e.preventDefault();
          const step = e.shiftKey ? 40 : 10;
          rmMutate(m => { const n = rmNodeById(m, id); if (!n) return; if (e.key === 'ArrowLeft') n.x -= step; if (e.key === 'ArrowRight') n.x += step; if (e.key === 'ArrowUp') n.y -= step; if (e.key === 'ArrowDown') n.y += step; });
          rmState.selected = { type: 'node', id };
          refocus();
        }
      });
    }
    // 患者を切り替えたとき・読み込んだとき（js/05 の loadLocalState から呼ばれる）
    function onRelationMapPatientReloaded() {
      const view = document.getElementById('view-relation');
      if (view && !view.classList.contains('hidden')) renderRelationMap();
    }
    window.renderRelationMap = renderRelationMap;
    if (typeof document !== 'undefined' && document.getElementById && document.getElementById('view-relation')) initRelationMapUi();

if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, { RM_TYPES, RM_RELATIONS, rmWrapText, rmDisplayLabel, normalizeRelationMap, rmClinicalFields, rmEpistemicStatus, rmPrepareClinicalMap, findRelationEvidence, relationMapTextHtml, rmImportClinicalEntities, layoutRelationMap, buildRelationMapFromRecord, relationMapSvg, relationMapPrintHtml, rmRouteEdges, rmRoutePath, rmRect, rmApplyBridges, rmInsertBetween, RM_BRIDGE_RULES, rmZoomAt, rmHideAdded, rmShowAdded, rmLabAttachments, validateRelationMap, rmApplyFixes, rmProblemCategory, rmSetFullscreen, rmPhaseOfItems, rmCleanProblemLabel, rmShorten, rmProblemSubmap, rmReduceShortcuts, rmNodeSize, RM_PROBLEM_NOTES, rmPlainNote, rmLifeStage, rmMergeDuplicateProblems, rmLabsAsEvidence, layoutRelationMapOnce });
}
