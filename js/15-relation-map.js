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

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['15'] = '2026-10-06.22'; // 版（scripts/stamp-version.js が書き込む）

    // ---- 種類 ----
    const RM_TYPES = [
      // 患者情報・背景は、ほかの白い四角（病態）と見分けられるよう薄い緑にする（2026-10-06.21 色合いの調整）
      { key: 'patient_fact', label: '患者情報・背景', shape: 'rect', fill: '#EEF4EC', stroke: '#5E7458' },
      { key: 'disease', label: '疾患', shape: 'rect', fill: '#FCE4E4', stroke: '#B5452F', bold: true },
      { key: 'pathophysiology', label: '病態生理', shape: 'rect', fill: '#FFFFFF', stroke: '#6B665C' },
      { key: 'symptom', label: '症状・徴候', shape: 'rect', fill: '#FFF7EC', stroke: '#B7791F' },
      { key: 'lab', label: '検査データ', shape: 'rect', fill: '#F3F7FD', stroke: '#3A6EA5', paren: true },
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
      { s: /1回に食べられる量|摂取量の低下|食事量の低下|食欲の?低下|食事摂取/, t: /体重.*減|低栄養|栄養摂取量不足|Alb/, step: 'エネルギー・たんぱく質の摂取不足', why: '必要量より少ない状態が続くと体の蓄えを使う' },
      { s: /創部痛|疼痛|痛み/, t: /体動の制限|活動耐性|離床/, step: '動くと痛みが強まるため動くことを控える', why: '' },
      { s: /ドレーン|カテーテル|点滴|ルート/, t: /体動の制限|活動耐性/, step: '管があり、動作が制約される', why: '管が入っていると、寝返り・起き上がりなどの動作がしにくくなる（「抜けるのが心配」と本人が言っていなくても言える範囲にとどめる）' },
      { s: /体動の制限|活動耐性の低下|臥床|安静/, t: /セルフケア不足/, step: '筋力・体力の低下で身の回りの動作に介助が必要', why: '' },
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
      { s: /腸の動き|蠕動運動の低下|絶食/, t: /栄養状態の低下|摂取量|低栄養/, step: '腸が動き出すまで食事を始められない・食べる量が少ない', why: '' },
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
      { key: 'supports', label: 'データが示す（根拠）' }
    ];
    const RM_RELATION_KEYS = new Set(RM_RELATIONS.map(r => r.key));
    // 版1の種類 → 版2の種類
    const RM_V1_KIND = { patient: 'patient_fact', psychosocial: 'patient_fact', disease: 'disease', treatment: 'treatment', pathology: 'pathophysiology', symptom: 'symptom', problem: 'nursing_problem', risk: 'nursing_problem' };

    // 文字は14px（画面で小さく縮めても読めるように）。四角の幅もそれに合わせて広げる
    const RM_RECT_W = 196, RM_ELLIPSE_W = 214;
    const RM_FONT = 14, RM_LINE_H = 19, RM_PAD = 10, RM_HEAD_H = 0;
    const RM_LAYOUT_STYLE = 2; // 四角の大きさを変えたら上げる（前の大きさで並べた図は自動で並べ直す）
    const RM_COL_GAP = 80, RM_ROW_GAP = 22;
    const RM_MAX_NODES = 60, RM_MAX_EDGES = 140, RM_TEXT_MAX = 120, RM_UNDO_MAX = 40;
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
          if (w + cw > maxEm && cur) { lines.push(cur); cur = ''; w = 0; }
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
      const t = String(text || '').replace(/\s+/g, ' ').trim();
      return t.length > max ? t.slice(0, max - 1) + '…' : t;
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
      const h = RM_PAD * 2 + RM_HEAD_H + lines.length * RM_LINE_H + (ell ? 16 : 0);
      return { w, h, lines };
    }

    // ---- 保存されている図を安全な形にそろえる（版1からの変換もここで行う） ----
    function normalizeRelationMap(raw) {
      if (!raw || typeof raw !== 'object' || !Array.isArray(raw.nodes)) return null;
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
          evidence: String(n.evidence || '').slice(0, 200),
          observed: v1 ? true : n.observed !== false,
          source: ['record', 'knowledge', 'user', 'plan', 'ai'].includes(n.source) ? n.source : (v1 ? 'user' : 'record'),
          added: !v1 && n.added === true,
          ...(typeof n.attachTo === 'string' && rmSafeId(n.attachTo) ? { attachTo: n.attachTo } : {}),
          ...(n.detached === true ? { detached: true } : {}),
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
        let source = e.source, target = e.target, relation = RM_RELATION_KEYS.has(e.relation) ? e.relation : 'causes';
        // 版1は「疾患 → 治療」で描いていた。版2は「治療 → 治療の対象」にする
        if (v1) {
          const a = byId.get(source), b = byId.get(target);
          if (b.type === 'treatment' && a.type !== 'treatment') { source = b.id; target = a.id; relation = 'treats'; }
          else if (a.type === 'treatment' && b.type === 'disease') relation = 'treats';
        }
        const pk = `${source}>${target}`;
        if (pairs.has(pk)) return;
        pairs.add(pk);
        edges.push({ id: rmSafeId(e.id) || rmNewId('e'), source, target, relation, predicted: !!e.predicted, evidence: String(e.evidence || '').slice(0, 200) });
      });
      const map = { version: 2, nodes, edges: edges.slice(0, RM_MAX_EDGES), bands: Array.isArray(raw.bands) && !v1 ? raw.bands.filter(b => b && Number.isFinite(b.y1) && Number.isFinite(b.y2)).slice(0, 12).map(b => ({ y1: b.y1, y2: b.y2, p: Number(b.p) || 0 })) : [], headers: Array.isArray(raw.headers) && !v1 ? raw.headers.filter(h => h && Number.isFinite(h.x1) && Number.isFinite(h.x2)).slice(0, 8).map(h => ({ x1: h.x1, x2: h.x2, label: String(h.label || '').slice(0, 30) })) : [],
        source: String(raw.source || 'manual'), layoutStyle: Number(raw.layoutStyle) || 1,
        ...(raw.addedStash && Array.isArray(raw.addedStash.nodes) && Array.isArray(raw.addedStash.edges) ? { addedStash: { nodes: raw.addedStash.nodes.slice(0, RM_MAX_NODES), edges: raw.addedStash.edges.slice(0, RM_MAX_EDGES), created: Array.isArray(raw.addedStash.created) ? raw.addedStash.created.slice(0, RM_MAX_EDGES) : [], positions: raw.addedStash.positions && typeof raw.addedStash.positions === 'object' ? raw.addedStash.positions : {}, bands: Array.isArray(raw.addedStash.bands) ? raw.addedStash.bands : [], headers: Array.isArray(raw.addedStash.headers) ? raw.addedStash.headers : [] } } : {}), createdAt: raw.createdAt || null, updatedAt: raw.updatedAt || null };
      rmRenumberProblems(map, { keepOrder: true });
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
    const RM_PROBLEM_CATEGORIES = [
      { key: 'resp', rank: 1, re: /気道|呼吸|ガス交換|換気|無気肺|肺炎|排痰|窒息|誤嚥/ },
      { key: 'circ', rank: 2, re: /心拍出|循環|出血|ショック|体液量|組織灌流|不整脈|血栓|塞栓|神経血管/ },
      { key: 'inf', rank: 3, re: /感染/ },
      { key: 'skin', rank: 3.5, re: /皮膚|褥瘡|血糖/ },
      { key: 'pain', rank: 4, re: /疼痛|痛/ },
      { key: 'nutr', rank: 5, re: /栄養|摂取|嚥下|脱水/ },
      { key: 'disloc', rank: 4.6, re: /脱臼/ },
      { key: 'fall', rank: 4.5, re: /転倒|転落|せん妄|混乱|身体損傷/ }, // 安全（せん妄・転倒）は疼痛の次、栄養より前
      { key: 'act', rank: 7, re: /セルフケア|活動|可動性|ADL|移動|入浴/ },
      { key: 'elim', rank: 7.5, re: /排泄|排便|排尿|便秘/ },
      { key: 'sleep', rank: 8, re: /睡眠/ },
      { key: 'mgmt', rank: 8.5, re: /健康管理|健康自主管理|自己管理|服薬|治療計画/ },
      { key: 'comm', rank: 8.2, re: /コミュニケーション|言語/ },
      { key: 'anx', rank: 9, re: /不安|恐怖|心理|ボディイメージ|知識|コーピング|役割|家族/ }
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
      const sub = c === 'act' ? (/セルフケア|入浴|更衣|整容|排泄の自立/.test(lb) ? 'self' : /活動耐性|耐久/.test(lb) ? 'tol' : 'mob') : '';
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
        if (n.type !== 'lab' || n.detached || map.edges.some(e => e.target === n.id)) return;
        const outs = map.edges.filter(e => e.source === n.id && byId.has(e.target) && byId.get(e.target).type !== 'lab' && e.relation !== 'treats');
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
    function layoutRelationMap(map) {
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
      treatFlow.forEach(k => { const [t, tr] = k.split('>'); if (band.has(t) && byId.get(tr) && byId.get(tr).type === 'treatment') band.set(tr, band.get(t)); });
      // 【横長を抑える】利用者からの要望：「関連図が横長になりすぎている」。以前は因果の深さごとに1列にしていたため、
      // 1本道の長い流れ（「＋補足」をはさむと特に）で列が12〜18個になり、横に長くなっていた。1本道の続き
      // （A の矢印が B だけへ出て、B へ入る矢印が A からだけ。同じ看護問題の帯の中）は、A と同じ列の下に積む。
      // 背景（患者情報）・治療・看護問題は積まない。積んだまとまりを1つの四角として、列・並び順・高さを決め直す。
      const head = new Map(), members = new Map();
      const treatTargets = new Set([...treatFlow].map(k => k.split('>')[0]));
      const stackable = (u, v) => {
        const nu = byId.get(u), nv = byId.get(v);
        // 治療（楕円）は「治療」の列にまとめて見せるので積まない
        if (!nu || !nv || probIds.has(u) || probIds.has(v) || [nu.type, nv.type].some(t => t === 'patient_fact' || t === 'treatment')) return false;
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
      const treatRanks = heads.filter(h => !probIds.has(h) && byId.get(h).type === 'treatment' && phaseOf(h) !== 2).map(h => hr.get(h));
      if (treatRanks.length) { const tr = Math.min(...treatRanks); rankHeads(h => (phaseOf(h) === 2 && byId.get(h).type !== 'treatment' ? tr + 1 : 0)); }
      const maxHr = Math.max(0, ...hr.values());
      [...order].reverse().forEach(h => {
        if (head.get(h) !== h || probIds.has(h)) return;
        const n = byId.get(h);
        if (n.type === 'patient_fact' || sInn.get(h).length || !sOut.get(h).length) return;
        if (members.get(h).some(m => treatTargets.has(m))) return; // 治療の対象は、治療と同じ列のまま
        const succ = Math.min(...sOut.get(h).map(t => (probIds.has(t) ? maxHr + 1 : hr.get(t))));
        if (succ - 1 > hr.get(h)) hr.set(h, succ - 1);
      });
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
        const tr = c.filter(e => byId.get(e.id).type === 'treatment' && members.get(e.id).length === 1);
        tr.forEach(e => {
          const tgtHeads = [...treatFlow].filter(k => k.endsWith(`>${e.id}`)).map(k => head.get(k.split('>')[0]));
          const k0 = c.findIndex(x => tgtHeads.includes(x.id));
          if (k0 < 0) return;
          c.splice(c.indexOf(e), 1);
          let k = c.findIndex(x => tgtHeads.includes(x.id));
          while (k + 1 < c.length && byId.get(c[k + 1].id).type === 'treatment' && tr.includes(c[k + 1])) k++;
          c.splice(k + 1, 0, e);
        });
      });
      setPos();
      // x：列ごとに、いちばん幅の広い四角に合わせる
      const colX = [];
      let x = 0;
      cols.forEach((c, r) => {
        colX[r] = x;
        const w = c.length ? Math.max(...c.map(e => stackW(e.id))) : RM_RECT_W;
        c.forEach(e => members.get(e.id).forEach(m => { const n = byId.get(m); n.x = Math.round(x + (w - rmNodeSize(n).w) / 2); }));
        x += w + RM_COL_GAP;
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
        if (bandH > 0) { stripes.push({ y1: top - RM_ROW_GAP * 0.9, y2: top + bandH + RM_ROW_GAP * 0.9, p: bv }); top += bandH + RM_ROW_GAP * 1.3; }
      });
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
          const sy = a.cy, ty = b.cy;
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
          const sy = down ? a.y2 : a.y1, ty = down ? b.y1 : b.y2;
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
      // 飛び越え（∩）の下の線は消さない（2026-10-06.20 で地の色の丸で隠したが、交差している線まで消えて見えたのでやめた。
      // 代わりに、重なった横の線がそろって飛び越えるようにした：rmRouteEdges）
      return routes.map(r => {
        const e = r.edge;
        const d = rmRoutePath(r);
        const treat = e.relation === 'treats';
        const sel = interactive && rmState.selected && rmState.selected.type === 'edge' && rmState.selected.id === e.id;
        return `<g class="rm-link${treat ? ' is-treat' : ''}${sel ? ' is-selected' : ''}" data-link-id="${escapeHtml(e.id)}">
          ${interactive ? `<path class="rm-link-hit" d="${d}" fill="none" stroke="transparent" stroke-width="20"/>` : ''}
          <path class="rm-link-line" d="${d}" fill="none" stroke="${treat ? '#2563EB' : e.predicted ? RM_PRED_LINE : '#57534E'}" stroke-width="1.4"${e.predicted ? ' stroke-dasharray="6 4"' : ''} marker-end="url(#rm-${treat ? 'tee-blue' : e.predicted ? 'arrow-pred' : 'arrow'})"/>
        </g>`;
      }).join('');
    }
    function rmNodeSvg(n, { interactive }) {
      const t = rmType(n);
      const s = rmNodeSize(n);
      const sel = interactive && rmState.selected && rmState.selected.type === 'node' && rmState.selected.id === n.id;
      const from = interactive && rmState.connectFrom === n.id;
      const dashed = n.observed === false;
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
      const tag = [n.added ? '＋補足' : '', dashed ? '予測' : '', n.source === 'knowledge' && !n.added ? '※知識' : ''].filter(Boolean).join(' ');
      const tagW = Array.from(tag).reduce((w, ch) => w + (ch === ' ' ? 4 : 10), 0) + 12;
      const tagColor = faint ? stroke : n.added ? RM_ADDED.stroke : t.stroke;
      return `<g class="rm-node${n.added ? ' is-added' : ''}${faint ? ' is-pred' : ''}${sel ? ' is-selected' : ''}${from ? ' is-connect-from' : ''}" data-node-id="${escapeHtml(n.id)}" data-kind="${escapeHtml(n.type)}" transform="translate(${n.x},${n.y})"${interactive ? ` tabindex="0" role="button" aria-label="${escapeHtml(`${t.label}${dashed ? '（予測）' : ''}：${rmDisplayLabel(n)}`)}"` : ''}>
        ${shape}
        <title>${escapeHtml(`${t.label}${dashed ? '（予測）' : ''}${n.added ? '（矢印の間に補った過程）' : n.source === 'knowledge' ? '（医学知識で補った）' : ''}`)}</title>
        ${tag ? `<g class="rm-tag"><rect x="${s.w - tagW - 6}" y="-8" width="${tagW}" height="16" rx="8" fill="${n.added ? tagColor : '#FFFFFF'}" stroke="${tagColor}" stroke-width="0.9"/><text class="rm-kind" x="${s.w - tagW / 2 - 6}" y="4" text-anchor="middle" font-size="10" fill="${n.added ? '#FFFFFF' : tagColor}" font-weight="700">${escapeHtml(tag)}</text></g>` : ''}
        <text class="rm-text" x="${textX}" y="${RM_PAD + RM_HEAD_H + RM_FONT + (ell ? 8 : 0)}"${anchor} font-size="${RM_FONT}" fill="${faint ? RM_PRED_TEXT : '#1C1917'}"${t.bold ? ' font-weight="700"' : ''}>${s.lines.map((line, i) => `<tspan x="${textX}" dy="${i ? RM_LINE_H : 0}">${escapeHtml(line)}</tspan>`).join('')}</text>
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
        `<span class="rm-legend-item"><span class="rm-legend-swatch" style="background:${RM_ADDED.fill};border-color:${RM_ADDED.stroke};border-width:2px"></span><b style="color:${RM_ADDED.stroke}">＋補足</b>：矢印の間に補った過程</span>`,
        `<span class="rm-legend-item">${line('#3F3B35')}原因 → 結果</span>`,
        // 治療の線の先は「┤」（抑える・和らげる）。矢印（→）だと「鎮痛薬 → 創部痛」が「鎮痛薬で痛くなる」に見えるため（2026-10-06.21）
        `<span class="rm-legend-item"><svg width="34" height="10" aria-hidden="true"><line x1="0" y1="5" x2="31" y2="5" stroke="#2563EB" stroke-width="1.6"/><line x1="32" y1="0" x2="32" y2="10" stroke="#2563EB" stroke-width="2.4"/></svg>治療 ┤ 治療の対象（抑える・和らげる）</span>`,
        `<span class="rm-legend-item">${line('#3F3B35', true)}予測・可能性（破線）</span>`,
        '<span class="rm-legend-item"><svg width="34" height="12" aria-hidden="true"><path d="M0,8 L12,8 A5,5 0 0 1 22,8 L34,8" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="17" y1="0" x2="17" y2="12" stroke="currentColor" stroke-width="1.5"/></svg>線の飛び越え（つながっていない）</span>',
        '<span class="rm-legend-item"><b>※知識</b>＝医学知識で補った過程</span>'
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
          const [a, b] = e.relation === 'treats' ? [e.source, e.target] : [e.source, e.target];
          const next = dirOut ? (a === id ? b : null) : (b === id ? a : null);
          if (next && !seen.has(next)) { seen.add(next); stack.push(next); }
        });
      }
      return seen;
    }
    function validateRelationMap(map) {
      const issues = [];
      if (!map || !map.nodes.length) return issues;
      const byId = new Map(map.nodes.map(n => [n.id, n]));
      const name = n => rmShorten(rmDisplayLabel(n), 18);
      const add = (level, code, msg, extra = {}) => issues.push({ level, code, msg, ...extra });
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
        // 3 相互矢印
        if (pair.has(`${e.target}>${e.source}`) && e.source < e.target) add('error', 'mutual', `「${name(a)}」と「${name(b)}」の間に両向きの矢印があります。どちらが原因かを決めて1本にしてください`, { edgeIds: [e.id], fix: 'remove-edge' });
        // 4 治療 → 治療の対象
        if (e.relation === 'treats' && a.type !== 'treatment') add('error', 'treat-source', `「治療 → 対象」の矢印の元が治療ではありません：「${name(a)}」→「${name(b)}」`, { edgeIds: [e.id], fix: 'relation-causes' });
        if (a.type === 'treatment' && e.relation !== 'treats' && b.type === 'disease') add('warn', 'treat-direction', `「${name(a)}」は「${name(b)}」に対する治療なら、種類を「治療 → 治療の対象」にしてください`, { edgeIds: [e.id], fix: 'relation-treats' });
        if (b.type === 'treatment' && e.relation !== 'treats' && (a.type === 'disease' || a.type === 'symptom')) add('warn', 'treat-reverse', `「${name(a)} → ${name(b)}」は治療の向きが逆の可能性があります（治療 → 治療の対象 にする）`, { edgeIds: [e.id], fix: 'reverse-treats' });
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
      const factIds = map.nodes.filter(n => n.observed !== false && n.source !== 'knowledge' && ['patient_fact', 'disease', 'symptom', 'lab'].includes(n.type)).map(n => n.id);
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
        if (n.type !== 'lab') return;
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
        const ph = rmPhaseOfItems(srcItems);
        if (ph !== null) n.phase = ph;
        nodes.set(key, n);
        if (srcItems.length === 1 && ['patient_fact', 'symptom'].includes(type)) byItem.set(srcItems[0], n);
        return n;
      };
      const E = (a, b, relation = 'causes', o = {}) => {
        if (!a || !b || a === b) return;
        if (edges.some(e => (e.source === a.id && e.target === b.id) || (e.source === b.id && e.target === a.id))) return;
        edges.push({ id: rmNewId('e'), source: a.id, target: b.id, relation, predicted: !!o.predicted, evidence: o.evidence || '' });
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
        return { key, flag: last.flag, value: last.value, text: `${key} ${first !== last && first.value !== last.value ? `${first.value} → ` : ''}${last.value}${row.unit || ''}${flag}`, item: it };
      };
      const labNode = (l, key) => l && N(key || `lab_${l.key}`, 'lab', l.text, { items: [l.item] });

      // ① 疾患
      const dxItems = items.filter(i => i.fieldLabel && /^(?:診断名|病名|主病名|疾患名|主診断)$/.test(i.fieldLabel));
      const dxText = dxItems.length ? dxItems : items.filter(i => /^【?(?:診断名?|病名|疾患名)】?\s*[:：]/.test(String(i.text).normalize('NFKC')));
      const disease = dxText[0] ? N('disease', 'disease', String(dxText[0].text).normalize('NFKC').replace(/^【?(?:診断名?|病名|疾患名)】?\s*[:：]\s*/, ''), { items: [dxText[0]] }) : null;
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
      const surgeryRe = /([^\s、。,:：「」()（）]{0,16}(?:全摘出?術|部分切除術?|切除術|摘出術|摘除術|郭清|再建術?|置換術|形成術|吻合術|PCI|CABG|開頭術|バイパス術|ステント留置))/;
      // 既往歴の手術（「70歳 PCI施行」など）は今回の治療にしない
      const surgeryItem = findItem(surgeryRe, i => !/既往/.test(i.fieldLabel || '') && !/^既往|\d+\s*歳|年前/.test(String(i.text).normalize('NFKC')));
      const surgeryDone = !!surgeryItem && has(/術後|手術|術式|術日|施行/);
      let surgery = null;
      if (surgeryItem) {
        const m = String(surgeryItem.text).normalize('NFKC').match(new RegExp(`${surgeryRe.source}[^、。]{0,24}`));
        const sLabel = (m ? m[0] : short(surgeryItem, 30)).replace(/^[^、。]*?(?:下で|下に|にて)/, '').replace(/(?:を)?(?:施行|実施|予定)[。.]?$/, '').replace(/を$/, '');
        surgery = N('surgery', 'treatment', sLabel, { items: [surgeryItem] });
        if (disease) E(surgery, disease, 'treats', { evidence: '疾患に対する手術' });
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
      const secretionObs = has(/副雑音|ラ音|痰貯留|分泌物の?貯留/);
      const atelObs = /(?:無気肺|肺炎)(?![^\n]{0,6}(?:リスク|予防|の可能性|の恐れ|のおそれ))/.test(all) && has(/無気肺|肺炎/);
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
        E(pain, suppress, 'causes', { evidence: '痛みで深く息を吸う・咳をするのを控える', predicted: !painItem });
        const anesMentioned = has(/全身麻酔|挿管/);
        const anes = N('anes', 'treatment', '全身麻酔・気管内挿管（手術時）', { source: anesMentioned ? 'record' : 'knowledge' });
        const reflex = N('reflex', 'pathophysiology', '咳嗽反射の低下・気道クリアランスの低下', { source: 'knowledge' });
        E(anes, reflex, 'causes', { evidence: '麻酔薬・挿管による気道の線毛運動・咳嗽反射の低下' });
        E(surgery, anes, 'results_in', { evidence: '手術のための麻酔' });
        const sputum = N('sputum', 'symptom', sputumItem ? `排痰困難（${short(sputumItem, 24)}）` : '排痰困難', { items: [sputumItem], observed: !!sputumItem });
        E(suppress, sputum, 'causes', { evidence: '咳が弱く痰を出しにくい', predicted: !sputumItem });
        E(reflex, sputum, 'contributes_to', { evidence: '気道の分泌物を出す力が下がる', predicted: !sputumItem });
        let reserve = null;
        if (smoke || aging || fev) {
          reserve = N('reserve', 'pathophysiology', smoke ? '気道の線毛機能の低下・分泌物の増加（呼吸予備力の低下）' : '加齢による呼吸予備力の低下', { source: 'knowledge' });
          if (smoke) E(smoke, reserve, 'contributes_to', { evidence: '喫煙による気道への影響' });
          if (aging) E(aging, reserve, 'contributes_to', { evidence: '加齢による呼吸機能の低下' });
          if (fev) E(N('lab_fev', 'lab', `FEV1% ${fev[1]}%`), reserve, 'supports', { evidence: 'FEV1%70%未満は閉塞性の換気障害の目安' });
          E(reserve, sputum, 'contributes_to', { evidence: '分泌物が多く出しにくい', predicted: !sputumItem });
        }
        const secretion = N('secretion', 'pathophysiology', '気道内の分泌物の貯留', { source: secretionObs ? 'record' : 'knowledge', observed: secretionObs });
        E(sputum, secretion, 'causes', { predicted: !secretionObs, evidence: '出せない痰が気道にたまる' });
        const atel = N('atel', atelObs ? 'symptom' : 'future_risk', atelObs ? '無気肺・肺炎' : '無気肺・肺炎の可能性', { observed: atelObs, source: atelObs ? 'record' : 'knowledge' });
        E(secretion, atel, atelObs ? 'causes' : 'predicts', { predicted: !atelObs, evidence: '分泌物で気道が詰まり肺胞がつぶれる・感染する' });
        const pResp = N('p_resp', 'nursing_problem', sputumItem ? '非効果的気道浄化' : '術後呼吸器合併症のリスク状態（無気肺・肺炎）', { cat: 'resp' });
        E(sputum, pResp, 'results_in', { evidence: '排痰困難', predicted: !sputumItem });
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
          const pGas = N('p_gas', 'nursing_problem', 'ガス交換障害', { cat: 'resp' });
          E(hyp, pGas, 'results_in'); if (dys) E(dys, pGas, 'results_in');
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
            E(hg, N('p_glu', 'nursing_problem', '血糖不安定リスク状態', { cat: 'skin' }), 'results_in', { predicted: true });
          }
        }
        const abx = drugs.find(d => /抗菌|抗生|ペニシリン|セフェム|セファロ|カルバペネム|マクロライド|キノロン|β-?ラクタム/.test(d.cls));
        const abxItem = abx ? null : findItem(/抗菌薬|抗生剤|抗生物質/);
        if ((abx || abxItem) && disease) E(N('abx', 'treatment', abx ? `抗菌薬（${abx.name}）` : '抗菌薬', { items: [abxItem] }), disease, 'treats', { evidence: '原因の細菌に対して' });
        const sputItem = findLast(/ラ音|水泡音|副雑音|喘鳴/) || findLast(/痰|吸引/);
        if (sputItem) {
          const sp = N('lung_sputum', 'symptom', short(sputItem, 36), { items: [sputItem] });
          E(lung, sp, 'causes', { evidence: '分泌物が増え気道にたまる' });
          const suc = findItem(/吸引/);
          if (suc) E(N('suction', 'treatment', '吸引', { items: [suc] }), sp, 'treats', { evidence: '自力で出せない痰に対して' });
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
          const pg = N('p_gas', 'nursing_problem', 'ガス交換障害', { cat: 'resp' });
          E(hyp, pg, 'results_in');
          if (dysS) E(N('dys_s', 'symptom', `S：${short(dysS, 24)}`, { items: [dysS] }), pg, 'results_in');
        }
      }
      // ⑤-3 嚥下機能の低下 → 誤嚥（誤嚥性肺炎の原因・再発のおそれ）
      const notDx = i => !(disease && disease.itemIds.includes(i.id)) && !(i.fieldLabel && /診断|病名/.test(i.fieldLabel));
      const swallowItem = findLast(/むせ|嚥下(?:障害|機能の?低下|困難)/, notDx) || findLast(/誤嚥/, notDx);
      if (swallowItem) {
        const sw = N('swallow', 'pathophysiology', '嚥下反射・咳反射の低下', { source: 'knowledge' });
        E(N('swallow_sign', 'patient_fact', short(swallowItem, 36), { items: [swallowItem] }), sw, 'supports', { evidence: 'むせ・誤嚥の記録' });
        const histNeuro = findItem(/脳梗塞|脳出血|パーキンソン|認知症|ALS/, i => i !== swallowItem && !(disease && disease.itemIds.includes(i.id)));
        if (histNeuro) E(N('neuro_hist', 'patient_fact', short(histNeuro, 34), { items: [histNeuro] }), sw, 'contributes_to', { evidence: '脳・神経の病気で嚥下にかかわる神経・筋の働きが落ちる' });
        if (aging) E(aging, sw, 'contributes_to', { evidence: '加齢による嚥下機能の低下' });
        const oral = findItem(/口腔[^\n]{0,6}(?:乾燥|汚染|不良)|舌苔|口臭/);
        const asp = N('aspiration', 'future_risk', /肺炎/.test(dxLabel) ? '誤嚥（誤嚥性肺炎の再発）の可能性' : '誤嚥・誤嚥性肺炎の可能性', { source: 'knowledge', observed: false });
        E(sw, asp, 'predicts', { predicted: true, evidence: '食物・唾液が気道に入る' });
        if (oral) E(N('oral', 'symptom', short(oral, 30), { items: [oral] }), asp, 'contributes_to', { predicted: true, evidence: '口の中の細菌が増える' });
        if (disease && /肺炎/.test(dxLabel)) E(sw, disease, 'contributes_to', { evidence: '口腔内細菌を含む唾液・食物が気道へ入る' });
        E(asp, N('p_asp', 'nursing_problem', '誤嚥リスク状態', { cat: 'resp' }), 'results_in', { predicted: true });
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
        E(N('dm', 'patient_fact', short(dmItem0, 30), { items: [dmItem0] }), hg, 'causes');
        [glu, a1c].filter(l => l && l.flag === 'high').forEach(l => E(labNode(l), hg, 'supports'));
        E(hg, N('p_glu', 'nursing_problem', '血糖不安定リスク状態', { cat: 'skin' }), 'results_in', { predicted: true });
      }
      // ⑥ 利尿薬の今後のリスク
      if (diuretic) {
        const du = N('diuretic', 'treatment', `利尿薬（${diuretic.name}）`);
        if (disease && !edges.some(e => e.source === du.id)) E(du, disease, 'treats');
        const dehyd = N('dehyd', 'future_risk', '脱水・電解質異常（低K血症など）の可能性', { source: 'knowledge', observed: false });
        E(du, dehyd, 'predicts', { predicted: true, evidence: '尿量の増加による' });
        const k = lab('K');
        if (k && k.flag) E(labNode(k), dehyd, 'supports', { predicted: true });
        E(dehyd, N('p_dehyd', 'nursing_problem', '体液量不足リスク状態（利尿薬による脱水・電解質異常）', { cat: 'circ' }), 'results_in', { predicted: true });
      }

      // ⑦ 感染（手術侵襲・ドレーン/カテーテル・糖尿病・炎症反応）
      const lineItem = findItem(/ドレーン|カテーテル|膀胱留置|バルーン|中心静脈|CV|PICC|ルート確保|持続点滴/);
      const dmItem = findItem(/糖尿病|DM\b/);
      const wbc = lab('WBC'), crp = lab('CRP');
      if ((surgery && surgeryDone) || lineItem) {
        const barrier = N('barrier', 'pathophysiology', '皮膚・粘膜のバリア機能の低下（侵襲的な処置）', { source: 'knowledge' });
        if (invasion) E(invasion, barrier, 'causes', { evidence: '創部ができる' });
        if (lineItem) { const ln = N('lines', 'treatment', short(lineItem, 30), { items: [lineItem] }); E(ln, barrier, 'causes', { evidence: '体の中へ管が入っている' }); if (surgery && !edges.some(e => e.target === ln.id)) E(surgery, ln, 'results_in'); }
        const abdominal = surgery && /胃|腸|腹腔|肝|胆|膵|脾|虫垂|ヘルニア/.test(surgery.label + dxLabel);
        const urinary = !!lineItem && /膀胱|尿道|バルーン/.test(lineItem.text);
        const infRisk = N('inf_risk', 'future_risk', surgery ? `創部感染${abdominal ? '・腹腔内感染' : ''}${urinary ? '・尿路感染' : ''}などの可能性` : 'カテーテル関連感染の可能性', { source: 'knowledge', observed: false });
        E(barrier, infRisk, 'predicts', { predicted: true, evidence: '病原体が入りやすい' });
        if (dmItem) {
          const dm = N('dm', 'patient_fact', short(dmItem, 30), { items: [dmItem] });
          const imm = N('immune', 'pathophysiology', '免疫機能・創傷治癒の低下', { source: 'knowledge' });
          E(nodes.get('hyperglycemia') || dm, imm, 'contributes_to', { evidence: '高血糖による白血球機能の低下' });
          E(imm, infRisk, 'predicts', { predicted: true });
        }
        if ((wbc && wbc.flag === 'high') || (crp && crp.flag === 'high')) {
          const inf = N('inflam', 'pathophysiology', surgery ? '手術侵襲による炎症反応（感染との見分けが必要）' : '炎症反応の上昇（原因の確認が必要）', { source: 'knowledge' });
          if (invasion) E(invasion, inf, 'causes', { evidence: '術後は手術侵襲でも炎症反応が上がる' });
          [wbc, crp, lab('体温')].filter(l => l && l.flag === 'high').forEach(l => E(labNode(l), inf, 'supports', { evidence: '炎症反応を示す（これだけで感染とは言えない）' }));
          E(inf, infRisk, 'predicts', { predicted: true, evidence: '値の経過・熱・創部の状態で見分ける' });
        }
        E(infRisk, N('p_inf', 'nursing_problem', '感染リスク状態', { cat: 'inf' }), 'results_in', { predicted: true });
      }

      // ⑧ 疼痛
      if (pain && painItem) E(pain, N('p_pain', 'nursing_problem', '急性疼痛（手術創部の侵襲）', { cat: 'pain' }), 'results_in');

      // ⑧-2 腹部の手術後の腸の動きの低下（術後イレウス）：手術操作・麻酔・オピオイド・安静 → 腸蠕動の低下 → 腹部膨満・排ガスなし
      const abdOp = surgery && surgeryDone && /胃|腸|結腸|直腸|腹腔|肝|胆|膵|脾|虫垂|ヘルニア|子宮|卵巣/.test(surgery.label + dxLabel);
      const ileusItem = abdOp && findItem(/排ガス(?:なし|が無い|がない)|腸蠕動[^\n]{0,4}(?:弱|低下|減弱|聴取できず)|腹部膨満|イレウス|嘔吐/);
      if (ileusItem) {
        const il = N('ileus_path', 'pathophysiology', '腸の動き（蠕動運動）の低下', { source: 'knowledge' });
        E(invasion || surgery, il, 'causes', { evidence: '手術で腸を触ったり麻酔を使ったりすると腸の動きが止まる' });
        const opi = findItem(/オピオイド|フェンタニル|モルヒネ|オキシコドン/);
        if (opi) E(N('opioid', 'treatment', `オピオイド（${(String(opi.text).match(/フェンタニル|モルヒネ|オキシコドン/) || ['鎮痛薬'])[0]}）`, { items: [opi] }), il, 'contributes_to', { evidence: '副作用で腸の動きを抑える' });
        const sign = N('ileus_sign', 'symptom', short(ileusItem, 30, /排ガス|蠕動|膨満|イレウス|嘔吐/), { items: [ileusItem] });
        E(il, sign, 'causes');
        const ileusRisk = N('ileus_risk', 'future_risk', '術後イレウス（腸閉塞）の可能性', { source: 'knowledge', observed: false });
        E(sign, ileusRisk, 'predicts', { predicted: true });
        E(ileusRisk, N('p_elim', 'nursing_problem', '便秘リスク状態（術後の腸蠕動の低下）', { cat: 'elim' }), 'results_in', { predicted: true });
      }

      // ⑨ 栄養
      const albL = lab('Alb') || lab('TP');
      const weightItem = findItem(/体重[^\n]{0,12}(?:減少|減|kg減)|kg減少/);
      const intakeItem = findItem(/摂取[^\n]{0,4}[0-4]割|[0-4]割摂取|食事量[^\n]{0,6}(?:低下|減)|食欲(?:不振|低下|がない)/);
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
      if (weightItem || (albL && albL.flag === 'low') || intakeItem) {
        const low = N('undernutrition', 'symptom', [weightItem && short(weightItem, 20), intakeItem && short(intakeItem, 16)].filter(Boolean).join('・') || '栄養状態の低下', { items: [weightItem, intakeItem] });
        if (albL) E(labNode(albL), low, 'supports', { evidence: '栄養状態を示す' });
        if (nutrSign) E(nutrSign, low, 'causes');
        else if (nodes.has('ileus_path')) E(nodes.get('ileus_path'), low, 'causes', { evidence: '食事を進められない' });
        else if (nodes.has('copd_work')) E(nodes.get('copd_work'), low, 'causes', { evidence: '食べると息切れし、呼吸でエネルギーを使う' });
        else if (disease) E(disease, low, 'contributes_to');
        const lowSalt = findItem(/塩分制限|減塩/);
        if (lowSalt && intakeItem && /味がしない|味が薄|おいしくない/.test(intakeItem.text)) E(N('lowsalt', 'treatment', '塩分制限食', { items: [lowSalt] }), low, 'contributes_to', { evidence: '味が薄く食欲が落ちる' });
        E(low, N('p_nutr', 'nursing_problem', gastric ? '栄養摂取量不足（消化吸収の変化に関連した低栄養状態）' : '栄養摂取量不足', { cat: 'nutr' }), 'results_in');
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
        if (ddMatch) E(N('lab_dd', 'lab', `Dダイマー ${ddMatch[1]}μg/mL`, { items: [findItem(/ダイマー/)] }), dvt, 'supports', { predicted: true, evidence: '血栓の存在を疑う所見（確定ではない）' });
        E(dvt, N('p_dvt', 'nursing_problem', '深部静脈血栓症（肺塞栓症）のリスク状態', { cat: 'circ' }), 'results_in', { predicted: true });
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
        E(mob, N('p_act', 'nursing_problem', 'セルフケア不足（活動制限・体力の低下）', { cat: 'act' }), 'results_in');
        if (nodes.has('ileus_path')) E(mob, nodes.get('ileus_path'), 'contributes_to', { evidence: '動かないと腸の動きも戻りにくい' });
        const hypN = nodes.get('lung_hyp') || nodes.get('hypoxia');
        if (hypN) E(hypN, mob, 'contributes_to', { evidence: '動くと酸素が足りず息切れする' });
      }
      if (nodes.has('mobility') && nodes.has('anemia')) E(nodes.get('anemia'), nodes.get('mobility'), 'contributes_to', { evidence: '貧血で疲れやすく動きにくい' });
      // ⑩-2 褥瘡（発赤・体位変換の困難・低栄養）
      const skinItem = findItem(/褥瘡|発赤|体位変換[^\n]{0,6}(?:困難|できない|全介助)|骨突出|DESIGN/);
      if (skinItem) {
        const sk = N('skin_sign', 'symptom', short(skinItem, 34), { items: [skinItem] });
        const press = N('pressure', 'pathophysiology', '同じ部位への長い圧迫・ずれによる皮膚の血流低下', { source: 'knowledge' });
        if (nodes.has('mobility')) E(nodes.get('mobility'), press, 'causes', { evidence: '自分で体の向きを変えにくい' });
        if (albL && albL.flag === 'low') E(labNode(albL), press, 'contributes_to', { evidence: '低栄養で皮膚が弱くなる' });
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
        E(change, N('p_anx', 'nursing_problem', familyOnly ? '家族の不安（退院後の生活の変化に関連）' : `不安（${disease ? '診断・' : ''}${surgery ? '手術・' : ''}生活の変化に関連）`, { cat: 'anx' }), 'results_in');
      }
      // 疾患と、手術が無い場合の症状（主訴・外れた値）
      if (disease && !surgery) {
        const chief = items.find(i => i.fieldLabel === '主訴');
        if (chief && !nodes.has('dyspnea')) { const c = N('chief', 'symptom', `主訴：${short(chief, 34)}`, { items: [chief] }); E(disease, c, 'causes'); }
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
        if (match) { usedTpl.add(match); match.label = rmShorten(up.label, 60); match.source = 'plan'; ordered.push(match); return; }
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
      const MAX_PROBLEMS = Math.max(8, ordered.filter(p => p.source === 'plan').length);
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
        });
      }

      // 浮島（どこにもつながらない四角）は載せない
      const list = uniqNodes.filter(n => keepIds.has(n.id) && n.label && edges.some(e => (e.source === n.id && keepIds.has(e.target)) || (e.target === n.id && keepIds.has(e.source))));
      const ids = new Set(list.map(n => n.id));
      const map = {
        version: 2,
        nodes: list.slice(0, RM_MAX_NODES).map(({ key, cat, ...n }) => n),
        edges: edges.filter(e => ids.has(e.source) && ids.has(e.target)).slice(0, RM_MAX_EDGES),
        headers: [], source: 'rules', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      };
      rmApplyBridges(map); // 矢印の間の飛躍を医学知識で埋める（＋補足）
      layoutRelationMap(map);
      rmAutoFixBuilt(map);
      return map;
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
        if (e.relation === 'treats') return;
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

    // ---- AIで作る（決まりを守った構造化データを1回で返してもらい、画面の中で確かめて描く） ----
    function rmParseAiJsonObject(text) {
      const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
      const a = t.indexOf('{'), b = t.lastIndexOf('}');
      if (a < 0 || b <= a) throw new Error('AIの答えから関連図の形（JSON）を読み取れませんでした');
      try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {
        // 最後の余分な「,」・答えの途中切れなどは直して読む（js/05 の parseAiJsonLoose）
        const v = typeof parseAiJsonLoose === 'function' ? parseAiJsonLoose(t) : undefined;
        if (v && typeof v === 'object' && !Array.isArray(v)) return v;
        throw new Error('AIの答えから関連図の形（JSON）を読み取れませんでした');
      }
    }
    function relationMapFromAiJson(obj) {
      const rawNodes = obj && (obj.n || obj.nodes);
      if (!Array.isArray(rawNodes) || !rawNodes.length) throw new Error('AIの答えに四角（nodes）がありませんでした');
      const idMap = new Map();
      const nodes = [];
      rawNodes.slice(0, RM_MAX_NODES).forEach(n => {
        if (!n || typeof n !== 'object') return;
        const label = n.l ?? n.label;
        if (typeof label !== 'string' || !label.trim()) return;
        const id = rmNewId('n');
        const key = n.i ?? n.id;
        if (key != null) idMap.set(String(key), id);
        const type = RM_TYPE_BY_KEY.has(n.t ?? n.type) ? (n.t ?? n.type) : 'pathophysiology';
        const obs = n.o ?? n.observed_or_predicted ?? n.observed;
        nodes.push({ id, type, label: rmShorten(label, RM_TEXT_MAX), evidence: rmShorten(n.e ?? n.evidence ?? '', 120),
          observed: type === 'future_risk' ? false : !(obs === 0 || obs === false || obs === 'predicted'),
          source: (n.k ?? n.knowledge ?? n.a ?? n.added) ? 'knowledge' : 'ai', added: !!(n.a ?? n.added), priority: Number(n.p ?? n.priority) || 0, x: 0, y: 0, itemIds: [] });
      });
      const rawEdges = obj.e || obj.edges || [];
      const edges = (Array.isArray(rawEdges) ? rawEdges : []).map(e => e && ({
        id: rmNewId('e'), source: idMap.get(String(e.s ?? e.source)), target: idMap.get(String(e.d ?? e.target)),
        relation: RM_RELATION_KEYS.has(e.r ?? e.relation) ? (e.r ?? e.relation) : 'causes',
        predicted: !!(e.x ?? e.is_predicted ?? e.predicted), evidence: rmShorten(e.e ?? e.evidence ?? '', 120)
      })).filter(e => e && e.source && e.target && e.source !== e.target);
      const map = normalizeRelationMap({ version: 2, nodes, edges, source: 'ai', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      if (!map || !map.nodes.length) throw new Error('AIの答えに使える四角がありませんでした');
      // 確かめて、安全に直せるもの（浮島・相互矢印・予測の破線・#番号・治療の向き）は直してから並べる
      const autoFix = validateRelationMap(map).filter(i => ['isolated', 'mutual', 'risk-solid', 'risk-observed', 'edge-to-pred', 'numbering', 'treat-source', 'from-problem'].includes(i.code));
      rmApplyFixes(map, autoFix);
      rmApplyBridges(map); // AIが飛ばした間の過程も、決まった知識で埋める
      layoutRelationMap(map);
      rmAutoFixBuilt(map); // 埋めた後にもう一度確かめて直す
      return map;
    }
    // AIに送る記録はしぼる（入力のトークンを抑える）：項目名のあるカード・症状のS・異常のあるO・治療・不安の言葉
    // 【AI機能の評価で発見】長い記録（心不全の事例・121枚）では、EF 35%・心胸比・K・Cre・ALB・水泡音・頸静脈怒張、
    // 悪化のきっかけの「塩分制限を守れていない」「利尿薬を自己判断で飲まなかった」、喫煙歴が選ばれずにAIへ送られて
    // いなかった（Sの発言が先に枠を埋めていた・「ALB」は大文字で一致しなかった）。病態・悪化のきっかけ・検査と
    // 身体所見を優先し、送る枚数も増やす（1枚90字までに縮めるので、100枚でも7千字ほど）。
    function rmSelectCardsForAi(items, max = 100) {
      const score = i => {
        const t = String(i.text || '');
        if (i.fieldLabel && /診断|病名|主訴|現病歴|既往|手術|術式|生活歴|喫煙|嗜好/.test(i.fieldLabel)) return 10;
        if (/術|麻酔|ドレーン|カテーテル|酸素|PCA|鎮痛|輸液|点滴|静注|内服開始|投与/.test(t)) return 8;
        if (/基準値|EF|心胸比|X線|CT|MRI|エコー|心電図|水泡音|副雑音|喘鳴|頸静脈|呼吸音|SpO2|BNP|WBC|CRP|Alb|Hb|Cre|BUN|eGFR|Na\b|K\b|血糖|HbA1c|mEq|mg\/dL|g\/dL/i.test(t)) return 8;
        if (/守れていない|自己判断|任せ|飲まな|飲み忘|中断|塩分|塩辛|漬物|喫煙|タバコ|飲酒|間食|枕を|起座|息苦し|息切れ|眠れ|目が覚め|夜間|尿量|排便|便秘|浮腫|むくみ|体重/.test(t)) return 7;
        if (i.type === 's' && /痛|苦し|息|不安|心配|迷惑|眠れ|食|だる|情けな|生きている意味/.test(t)) return 7;
        if (/↑|↓|NRS|痰|咳|発熱|ふらつ|転倒|せん妄|褥瘡|発赤/.test(t)) return 6;
        if (i.type === 's') return 4;
        return 1;
      };
      return items.map((i, k) => ({ i, k, s: score(i) })).sort((a, b) => b.s - a.s || a.k - b.k).slice(0, max).sort((a, b) => a.k - b.k).map(x => x.i);
    }
    function buildRelationMapPrompt(cp) {
      const items = (cp.items || []).filter(i => i && i.text && i.type !== 'unnecessary' && !i.aiSuggested);
      const cards = rmSelectCardsForAi(items).map(i => `[${i.type === 's' ? 'S' : 'O'}]${i.fieldLabel ? `【${i.fieldLabel}】` : ''}${i.timestamp && i.timestamp !== '日時不明' ? `(${i.timestamp})` : ''} ${rmShorten(i.text, 90)}`).join('\n');
      const plans = typeof carePlanList === 'function' ? carePlanList(cp).map(p => String(p.problem || '').trim()).filter(Boolean) : [];
      const sel = new Set(cp.selectedDiagnosisIds || []);
      const dx = (cp.diagnosisCandidates || []).filter(c => sel.has(c.id)).map(c => c.name);
      const drugs = typeof findDrugsInText === 'function' ? findDrugsInText([cp.sourceText || '', ...items.map(i => i.text)].join('\n')).slice(0, 12).map(x => `${x.drug.name}（${x.drug.cls}）`).join('、') : '';
      return `あなたは看護教員です。看護学生の実習記録から、学生が書く「関連図」を構造化データで作ってください。
${typeof AI_ACCURACY_RULES === 'string' ? AI_ACCURACY_RULES : ''}
【目的】事実を並べた図ではなく「原因・誘因→病態生理→身体の変化→症状・徴候→生活への影響→看護問題」の因果を、医学的な中間過程を補って示す（悪い例：喫煙→胃がん→手術→疼痛。良い例：喫煙→胃粘膜への慢性的刺激→防御機能の低下→胃がんに関連する要因）。
【決まり】
1 全部は載せない。優先：生命に関わる→今の看護問題につながる→病態の説明に必要→治療・処置→合併症の予測→ADL・心理社会。看護問題との関連が弱いプロフィールは省く。四角は全部で15〜40個（補った過程を含む）。
2 病態の矢印は原因→結果。治療は「治療→治療の対象」（例：胃全摘出術→胃がん、鎮痛薬・硬膜外PCA→創部痛、酸素投与→酸素化の低下）でrはtreats。治療は1つずつ別の四角。同じ2つの間に両向きの矢印は禁止。
3 患者に実際に起きた事実はo=1。今後起こりうること・リスクはo=0、その矢印はx=1。記録に無いことを事実にしない。医学知識で補った中間過程はk=1。
4 検査データはt=labで値を書く（例：WBC 11600/μL、Alb 4.1→3.5g/dL）。値だけでなく、何を示すかの四角へつなぐ。術後のWBC・CRP上昇は手術侵襲による炎症反応との見分けが必要で、感染と断定しない。
5 看護問題（t=nursing_problem）はpに優先順位（1から）。生命→呼吸・循環→術後合併症→疼痛→栄養→活動→心理社会を目安に、この患者で判断。各看護問題へは、左の事実から矢印をたどって根拠に届くこと。複数の原因が1つの問題へ合流する形にする。${plans.length ? '看護問題は下の「看護計画の看護問題」を使う。' : dx.length ? '看護問題は下の「選んだ看護診断」を使う。' : ''}
6 どこにもつながらない四角・同じ内容の重複は作らない。同じ情報は1つの四角から枝分かれさせる。
7 各矢印のeに「なぜAからBか」を30字以内。各四角のeに記録の根拠を20字以内（知識で補ったものは空でよい）。
8 矢印を1本ずつ「AからBへ本当に一足飛びか？」と考え、間に病態生理の過程が入るなら必ず四角を補う（例：手術侵襲→［発痛物質の放出］→創部痛、創部痛→［腹部に力を入れると痛む］→深呼吸・咳嗽の抑制、抗凝固薬→［凝固能の低下］→出血の可能性）。補った四角はa=1・k=1。
【形】JSONだけを返す：{"n":[{"i":"n1","t":"種類","l":"文字(30字以内)","o":1,"k":0,"a":0,"p":0,"e":"根拠"}],"e":[{"s":"n1","d":"n2","r":"関係","x":0,"e":"理由"}]}
種類t：patient_fact disease pathophysiology symptom lab treatment nursing_problem future_risk
関係r：causes contributes_to results_in treats predicts supports

${plans.length ? `【看護計画の看護問題】\n${plans.join('\n')}\n` : ''}${dx.length ? `【選んだ看護診断】\n${dx.join('\n')}\n` : ''}${drugs ? `【記録に出てくる薬】${drugs}\n` : ''}【記録（[S/O]【項目名】(日時) 本文）】
${cards}`;
    }
    let rmAiRunning = false;
    async function buildRelationMapWithAi() {
      if (rmAiRunning) { showToast('関連図をAIで作っています。終わるまでお待ちください', 'info'); return; }
      const ok = await requireApiKey('関連図をAIで作る', { fallbackLabel: '記録から作る（AIなし）' });
      if (ok === 'fallback') return rmBuild('rules');
      if (!ok) return;
      const cp = getCurrentPatient();
      if (!(cp.items || []).some(i => i.type !== 'unnecessary')) { showToast('先に「分類開始」で記録をカードに分けてください', 'warn'); return; }
      if (!(await rmConfirmReplace(cp))) return;
      rmAiRunning = true;
      rmRenderToolbarState();
      showToast('関連図をAIで作っています（30秒〜1分ほどかかります）', 'info');
      try {
        const text = await callGeminiAI([{ parts: [{ text: buildRelationMapPrompt(cp) }] }], { json: true });
        const map = relationMapFromAiJson(rmParseAiJsonObject(text));
        rmCommit(cp, map, { pushUndo: true });
        if (cp.id === getCurrentPatient().id) rmZoom('fit-readable');
        rmShowCheckIfNeeded(map);
        showToast(`関連図の案を作りました（${map.nodes.length}個の四角）。下のチェックと内容を確かめて、必要なら直してください`, 'success', 7000);
      } catch (err) {
        showAiErrorToast('関連図をAIで作れませんでした（前の図はそのまま残しています）。', err);
      } finally {
        rmAiRunning = false;
        rmRenderToolbarState();
      }
    }
    // 「この矢印はなぜ？」：保存してある理由を出す。無いときだけAIに短く聞く
    async function rmExplainEdge(edgeId) {
      const cp = getCurrentPatient();
      const map = rmMap(cp);
      const e = map && map.edges.find(x => x.id === edgeId);
      if (!e) return;
      const a = rmNodeById(map, e.source), b = rmNodeById(map, e.target);
      const rel = (RM_RELATIONS.find(r => r.key === e.relation) || {}).label || '';
      if (e.evidence) { await openDialog({ title: 'この矢印はなぜつながる？', message: `「${rmDisplayLabel(a)}」→「${rmDisplayLabel(b)}」（${rel}${e.predicted ? '・予測' : ''}）\n\n${e.evidence}`, confirmLabel: '閉じる' }); return; }
      const ok = await requireApiKey('矢印の理由の説明');
      if (!ok) return;
      try {
        const text = await callGeminiAI([{ parts: [{ text: `看護学生の関連図の矢印「${rmDisplayLabel(a)}」→「${rmDisplayLabel(b)}」（関係：${rel}${e.predicted ? '、予測' : ''}）が、なぜつながるのかを、病態生理の言葉で2文（80字以内）で説明してください。前置きは不要。つながりが医学的に不適切なら、そう指摘してください。` }] }]);
        const ev = rmShorten(String(text).replace(/\s+/g, ' '), 160);
        rmMutate(m => { const x = m.edges.find(y => y.id === edgeId); if (x) x.evidence = ev; }, { render: false });
        await openDialog({ title: 'この矢印はなぜつながる？（AIの説明）', message: `「${rmDisplayLabel(a)}」→「${rmDisplayLabel(b)}」\n\n${ev}`, confirmLabel: '閉じる' });
      } catch (err) { showAiErrorToast('理由を説明できませんでした。', err); }
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
      else showToast('決まった知識で補える所は見つかりませんでした。矢印を選んで「間の過程をAIで考える」も使えます', 'info', 6000);
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
    // 選んだ矢印の間の過程をAIに考えてもらう（1〜2個）
    async function rmBridgeEdgeWithAi(edgeId) {
      const map = rmMap();
      const e = map && map.edges.find(x => x.id === edgeId);
      if (!e) return;
      const a = rmNodeById(map, e.source), b = rmNodeById(map, e.target);
      const ok = await requireApiKey('矢印の間の過程を考える');
      if (!ok) return;
      showToast('矢印の間の過程をAIで考えています…', 'info');
      try {
        const text = await callGeminiAI([{ parts: [{ text: `看護学生の関連図で「${rmDisplayLabel(a)}」→「${rmDisplayLabel(b)}」という矢印があります。この間に入る病態生理・身体の変化の中間過程を、原因に近い順に1〜2個、各25字以内で考えてください。すでに一足飛びでなく直接つながるなら空の配列にしてください。JSONだけを返す：{"steps":["過程1","過程2"],"why":"30字以内の理由"}` }] }], { json: true });
        const obj = rmParseAiJsonObject(text);
        // 【AI機能の評価で発見】steps を配列でなく「A、B」「A→B」の1つの文字で返すことがあり、以前は「間に入る過程は無い」と表示していた
        const rawSteps = Array.isArray(obj.steps) ? obj.steps : (typeof obj.steps === 'string' ? obj.steps.split(/\s*(?:→|->|、|,|，|\n)\s*/) : []);
        const steps = rawSteps.map(x => String(x || '').trim()).filter(Boolean).slice(0, 2);
        if (!steps.length) { showToast('AIの答え：この矢印は直接つながっていて、間に入る過程は特にありません', 'info', 6000); return; }
        let last = null;
        rmMutate(m => {
          let edge = m.edges.find(y => y.id === edgeId);
          steps.forEach((st, k) => { const node = rmInsertBetween(m, edge, st, { why: k === 0 ? rmShorten(obj.why || '', 120) : '' }); if (node) { last = node; edge = m.edges.find(y => y.source === node.id); } });
          if (last) layoutRelationMap(m);
        });
        if (last) showToast(`間に${steps.length}個の過程を入れました（紫の「＋補足」）。内容を確かめてください`, 'success', 6000);
      } catch (err) { showAiErrorToast('間の過程を考えられませんでした。', err); }
    }

    // ---- 画面の状態 ----
    const rmState = { patientId: null, selected: null, connectFrom: null, zoom: 1, undo: [], redo: [], drag: null, lastTap: null, problemsOpen: false, moreOpen: false };
    function rmMap(cp = getCurrentPatient()) {
      if (!cp) return null;
      if (cp.relationMap && !cp.relationMap.__normalized) {
        const m = normalizeRelationMap(cp.relationMap);
        if (!m) return null;
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
      // 「元に戻す」の記録は、表示している患者の分だけ（AIの結果が、別の患者に切り替えた後に届いたときは積まない）
      if (pushUndo && cp.id === rmState.patientId && cp.id === getCurrentPatient().id) rmPushUndo(cp);
      if (map) {
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
      if (!map.nodes.length) { showToast('記録から関連図に使える情報が見つかりませんでした。「追加」で手で作るか「AIで作る」を使ってください', 'warn'); return; }
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
      if (rmState.patientId !== cp.id) { rmState.patientId = cp.id; rmState.undo = []; rmState.redo = []; rmState.selected = null; rmState.connectFrom = null; rmShowCheck(null); }
      const map = rmMap(cp);
      const wrap = document.getElementById('rm-canvas-wrap');
      const empty = document.getElementById('rm-empty');
      const has = !!(map && map.nodes.length);
      if (empty) empty.classList.toggle('hidden', has);
      if (wrap) {
        wrap.classList.toggle('hidden', !has);
        const keep = { left: wrap.scrollLeft, top: wrap.scrollTop };
        const fresh = !wrap.querySelector('svg');
        // 図のまわりに余白（.rm-stage の padding）を付け、端まで動かしても少し先までドラッグできるようにする
        // （利用者からの要望：「端に行くとそこで止まるので、もう少し余裕が欲しい」2026-10-06.19）
        wrap.innerHTML = has ? `<div class="rm-stage">${relationMapSvg(map, { interactive: true, zoom: rmState.zoom, title: `${cp.title || ''}の関連図` })}</div>` : '';
        if (has && fresh) rmScrollToMapStart(wrap);
        else { wrap.scrollLeft = keep.left; wrap.scrollTop = keep.top; }
        wrap.classList.toggle('is-connecting', !!rmState.connectFrom);
        if (has) rmApplySelectionClasses();
      }
      rmRenderProblemList(map);
      const legend = document.getElementById('rm-legend');
      if (legend && !legend.dataset.ready) { legend.innerHTML = rmLegendHtml(); legend.dataset.ready = '1'; }
      const info = document.getElementById('rm-info');
      if (info) info.textContent = has ? `${map.nodes.length}個の四角・${map.edges.length}本の矢印・看護問題${map.nodes.filter(n => n.type === 'nursing_problem').length}個${map.updatedAt ? `（最終更新 ${new Date(map.updatedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}）` : ''}` : '';
      rmRenderSelectionBar();
      rmRenderToolbarState();
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
        if (c) c.textContent = probs.length ? `（${probs.length}）` : '';
      });
      box.innerHTML = open ? `<span class="rm-problems-title">看護問題の一覧（押すと図の中へ移ります）</span>` + probs.map(n => `<button type="button" role="menuitem" class="rm-prob-btn${/リスク|可能性|おそれ|危険/.test(n.label) ? ' is-risk' : ''}" data-rm-action="goto-problem" data-node-id="${escapeHtml(n.id)}" title="図の中のこの看護問題へ移ります">${escapeHtml(rmDisplayLabel(n))}</button>`).join('') : '';
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
          + item('why', '<i class="fa-solid fa-circle-question"></i> この矢印はなぜ？')
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
      const aiBtn = document.querySelector('[data-rm-action="build-ai"]');
      if (aiBtn) { aiBtn.disabled = rmAiRunning; aiBtn.innerHTML = rmAiRunning ? '<i class="fa-solid fa-spinner fa-spin"></i> AIで作成中…' : '<i class="fa-solid fa-wand-magic-sparkles"></i> AIで作る'; }
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
          <label class="rm-kind-select"><span class="sr-only">種類</span><select class="field text-[11px] py-1" data-rm-action="kind">${RM_TYPES.map(t => `<option value="${t.key}"${t.key === n.type ? ' selected' : ''}>${escapeHtml(t.label)}</option>`).join('')}</select></label>
          ${rmBtn('toggle-observed', n.observed === false ? '事実にする' : '予測にする（破線）')}
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
          ${rmBtn('toggle-predicted', e.predicted ? '事実にする（実線）' : '予測にする（破線）')}
          ${rmBtn('why', '<i class="fa-solid fa-circle-question"></i> この矢印はなぜ？')}
          ${rmBtn('mid-ai', '<i class="fa-solid fa-wand-magic-sparkles"></i> 間の過程をAIで考える')}
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
      rmMutate(m => { const x = rmNodeById(m, id); if (x) { x.label = t.slice(0, RM_TEXT_MAX * 2); if (x.source === 'knowledge' || x.source === 'ai') x.source = 'user'; } });
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
      rmMutate(m => { m.edges.push({ id, source: from, target: targetId, relation: a.type === 'treatment' && b.type !== 'treatment' && b.type !== 'nursing_problem' ? 'treats' : b.type === 'lab' ? 'supports' : 'causes', predicted: b.observed === false, evidence: '' }); });
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
        if (wrap && map && map.nodes.length) { const b = rmBounds(map); rmState.zoom = Math.max(factor === 'fit' ? 0.25 : wrap.clientWidth < 600 ? 0.55 : 0.85, Math.min(1.2, Math.min((wrap.clientWidth - 8) / b.w, (wrap.clientHeight - 8) / b.h))); }
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
    function relationMapPrintHtml(cp, map) {
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
</style></head><body>
<div class="head"><h1>関連図</h1><div class="meta">患者：${escapeHtml(cp.title || '')}<br>出力日時：${escapeHtml(now)}</div></div>
<div class="fig">${relationMapSvg(map, { interactive: false, title: `${cp.title || ''}の関連図` })}</div>
<div class="legend">${rmLegendHtml()}</div>
${probs.length ? `<div class="probs">看護問題：${probs.map(p => escapeHtml(rmDisplayLabel(p))).join('　')}</div>` : ''}
</body></html>`;
    }
    function rmPrint() {
      const cp = getCurrentPatient();
      const map = rmMap(cp);
      if (!map || !map.nodes.length) { showToast('印刷する関連図がありません', 'warn'); return; }
      printHtmlDocument(relationMapPrintHtml(cp, map), { keepSvg: true });
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
        else if (act === 'build-rules') rmBuild();
        else if (act === 'build-ai') buildRelationMapWithAi();
        else if (act === 'add') rmAddNode(document.getElementById('rm-add-kind')?.value || 'pathophysiology');
        else if (act === 'relayout') rmMutate(map => layoutRelationMap(map), { message: '並べ直しました（重要な看護問題ほど上・看護問題は右端）' });
        else if (act === 'undo') rmUndoRedo(false);
        else if (act === 'redo') rmUndoRedo(true);
        else if (act === 'check') { const m = rmMap(); rmShowCheck(m ? validateRelationMap(m) : []); }
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
        else if (act === 'png') { rmSetMoreOpen(false); rmSavePng(); }
        else if (act === 'clear') { rmSetMoreOpen(false); rmClearAll(); }
        else if (!sel) return;
        else if (act === 'edit-node') rmEditNodeText(sel.id);
        else if (act === 'connect') { rmState.connectFrom = sel.id; rmApplySelectionClasses(); rmRenderSelectionBar(); }
        else if (act === 'cancel-connect') { rmState.connectFrom = null; rmApplySelectionClasses(); rmRenderSelectionBar(); }
        else if (act === 'delete') rmDeleteSelected();
        else if (act === 'toggle-observed') rmMutate(m => { const n = rmNodeById(m, sel.id); if (n) n.observed = n.observed === false; });
        else if (act === 'priority-up') rmMoveProblem(sel.id, -1);
        else if (act === 'priority-down') rmMoveProblem(sel.id, 1);
        else if (act === 'node-evidence') { const n = rmNodeById(rmMap(), sel.id); if (n) openDialog({ title: 'この四角の根拠', message: `${rmDisplayLabel(n)}\n\n${n.evidence}`, confirmLabel: '閉じる' }); }
        else if (act === 'show-card') {
          const n = rmNodeById(rmMap(), sel.id);
          const id = n && n.itemIds && n.itemIds.find(x => (getCurrentPatient().items || []).some(i => i.id === x));
          if (id && typeof jumpToBoardCard === 'function') jumpToBoardCard(id); else showToast('元のカードが見つかりません（消したか、分類し直した可能性があります）', 'warn');
        }
        else if (act === 'toggle-predicted') rmMutate(m => { const x = m.edges.find(y => y.id === sel.id); if (x) x.predicted = !x.predicted; });
        else if (act === 'why') rmExplainEdge(sel.id);
        else if (act === 'mid-ai') rmBridgeEdgeWithAi(sel.id);
        else if (act === 'mid-add') rmBridgeEdgeManual(sel.id);
        else if (act === 'reverse') {
          // 向きを逆にしたら並べ直す（左向きの矢印を残さない）。「治療 → 対象」を逆にしたときは、ふつうの矢印にする
          rmMutate(m => { const x = m.edges.find(y => y.id === sel.id); if (x) { const t = x.source; x.source = x.target; x.target = t; const src = m.nodes.find(n => n.id === x.source); if (x.relation === 'treats' && (!src || src.type !== 'treatment')) x.relation = 'causes'; layoutRelationMap(m); } });
          showToast('矢印の向きを逆にして、左から右へ並べ直しました（「元に戻す」で戻せます）', 'success');
        }
      });
      view.addEventListener('change', e => {
        const s = e.target.closest('select[data-rm-action]');
        if (!s || !rmState.selected) return;
        const id = rmState.selected.id;
        if (s.dataset.rmAction === 'kind') rmMutate(m => { const n = rmNodeById(m, id); if (n && RM_TYPE_BY_KEY.has(s.value)) { n.type = s.value; if (s.value === 'future_risk') n.observed = false; rmRenumberProblems(m); } });
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
        const g = e.target.closest('.rm-node');
        const lg = e.target.closest('.rm-link');
        const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
        // 【長押しでメニュー】スマホ・タブレットは右クリックの代わりに、動かさずに長押し（0.55秒）で同じメニューを出す
        clearTimeout(longPress.timer);
        longPress.fired = false;
        if (touch) {
          const tgt = e.target, cx = e.clientX, cy = e.clientY, pid = e.pointerId;
          longPress.sx = cx; longPress.sy = cy;
          longPress.timer = setTimeout(() => {
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
      wrap.addEventListener('contextmenu', e => { if (!rmMap()) return; e.preventDefault(); rmShowCtx(e); });
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
    window.buildRelationMapWithAi = buildRelationMapWithAi;
    if (typeof document !== 'undefined' && document.getElementById && document.getElementById('view-relation')) initRelationMapUi();

if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, { RM_TYPES, RM_RELATIONS, rmWrapText, rmDisplayLabel, normalizeRelationMap, layoutRelationMap, buildRelationMapFromRecord, relationMapFromAiJson, rmParseAiJsonObject, buildRelationMapPrompt, relationMapSvg, relationMapPrintHtml, rmRouteEdges, rmRoutePath, rmRect, rmApplyBridges, rmInsertBetween, RM_BRIDGE_RULES, rmZoomAt, rmHideAdded, rmShowAdded, rmLabAttachments, validateRelationMap, rmApplyFixes, rmProblemCategory, rmSelectCardsForAi, rmSetFullscreen, rmPhaseOfItems, rmCleanProblemLabel });
}
