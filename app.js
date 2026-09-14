    // ヘンダーソン14項目定義
    // keywords はアップロードされた基準表（「アセスメントの視点に必要な情報項目の例」体力・意思力・知識）を
    // もとに拡充している。表内の全項目をそのまま単語化するのではなく、看護記録の文章中に実際に
    // 現れやすい語(症状名・観察項目名など)を中心に採用した。
    // 基本欲求の行の名称は簡潔な一語表記（呼吸・食事・排泄...）に統一している。
    // 各行の左端に表示される番号(1〜14)は別途need.idから振られるため、name自体に
    // 番号や説明的な文章を含める必要は無い（以前はname内に「1. 正常な呼吸をする」の
    // ように番号・説明文を含めていたが、行見出し以外にもタグチップ・タグ追加の選択肢・
    // AIへの指示文など様々な場所でname がそのまま使われるため、簡潔にした方が全体で見やすい）。
    const HENDERSON_NEEDS = [
      { id: 1, name: "呼吸", icon: "fa-lungs", keywords: ["呼吸", "SpO2", "咳", "痰", "喘鳴", "息切れ", "チアノーゼ", "酸素", "息苦し", "PaO2", "呼吸数", "呼吸音", "動脈血ガス", "胸部X線", "胸郭", "呼吸補助筋", "起座呼吸", "wheezes", "発汗", "気道", "分泌物", "狭窄", "アレルギー", "喫煙", "人工呼吸器", "酸素マスク", "肥満", "発熱", "疼痛", "副作用", "安楽な姿勢", "体位", "枕", "湿度", "臭気", "吸入器", "在宅酸素療法", "排痰", "咳嗽"] },
      { id: 2, name: "食事", icon: "fa-utensils", keywords: ["食事", "食欲", "摂取量", "水分量", "嚥下", "嘔吐", "悪心", "吐気", "むせ", "体重", "栄養", "飲水", "Alb", "TP", "食事量", "咀嚼", "嚥下機能", "栄養状態", "BMI", "食習慣", "間食", "外食", "宗教的習慣", "食事療法", "必要エネルギー", "透析", "造影剤", "味覚", "化学療法", "身長", "ローレル指数", "カウプ指数", "頭皮", "毛髪", "免疫", "義歯", "自助具", "口腔粘膜"] },
      { id: 3, name: "排泄", icon: "fa-toilet", keywords: ["排尿", "排便", "下痢", "便秘", "失禁", "導尿", "残尿", "BUN", "Cre", "eGFR", "おしっこ", "下血", "血尿", "ストーマ", "導尿カテーテル", "ドレーン排液", "排泄", "緩下剤", "おむつ", "肛門", "臀部", "腹部", "夜間排尿", "利尿剤", "尿道カテーテル", "ウロストミー", "混濁", "出血", "滲出液", "体臭"] },
      { id: 4, name: "姿勢", icon: "fa-person-walking", keywords: ["歩行", "移乗", "立位", "坐位", "麻痺", "可動域", "拘縮", "転倒", "ベッド上安静", "体位変換", "移動", "運動機能", "発赤", "褥瘡", "クッション", "自助具", "ベッド柵", "輸液ライン", "滑りにくい靴", "筋力", "視覚", "聴覚", "感覚機能", "循環機能"] },
      { id: 5, name: "睡眠", icon: "fa-bed", keywords: ["睡眠", "不眠", "中途覚醒", "休息", "眠気", "疲労感", "倦怠感", "熟睡", "眠れない", "睡眠薬", "入眠困難", "無呼吸", "集中力低下", "騒音", "寝具", "日課", "だるさ", "ストレッサー", "不安", "ストレス", "対処方法"] },
      { id: 6, name: "衣服", icon: "fa-shirt", keywords: ["着脱", "衣服", "更衣", "ボタン", "靴下", "病衣交換", "パジャマ", "衣類", "洗濯", "好み", "選択基準", "動きやすさ", "自己表現"] },
      { id: 7, name: "体温", icon: "fa-temperature-high", keywords: ["体温", "発熱", "熱感", "悪寒", "クーリング", "冷感", "KT", "BT", "℃", "WBC", "CRP", "放熱", "すきま風", "気温", "湿度"] },
      { id: 8, name: "清潔", icon: "fa-shower", keywords: ["清拭", "入浴", "洗髪", "皮膚発赤", "褥瘡", "創部状態", "口腔ケア", "掻痒", "保清", "毛髪", "爪", "歯", "ひげ", "化粧", "装身具", "身だしなみ", "社会的孤立"] },
      { id: 9, name: "環境", icon: "fa-shield-halved", keywords: ["コール", "ベッド柵", "点滴ルート", "チューブ抜去", "転落防止", "身体抑制", "安全管理", "転倒", "転落", "事故", "交通事故", "身体損傷", "暴力", "感染症", "治安", "経済力", "標準予防策"] },
      { id: 10, name: "コミュニケーション", icon: "fa-comments", keywords: ["発話", "会話", "聞こえ", "視力", "難聴", "表出", "失語", "認知", "不安", "訴え", "話す", "語る", "コミュニケーション", "構音", "意思伝達", "手話", "識字", "聴覚", "自尊感情", "自己否定", "自傷", "価値観", "ボディイメージ", "人間関係", "依存"] },
      { id: 11, name: "信仰", icon: "fa-hands-praying", keywords: ["信仰", "宗教", "信条", "価値観", "お祈り", "礼拝", "牧師", "禁忌", "輸血拒否"] },
      { id: 12, name: "仕事", icon: "fa-trophy", keywords: ["仕事", "役割", "家事", "意欲", "自尊感情", "達成感", "作業", "職業", "離職", "生きがい", "リハビリテーション"] },
      { id: 13, name: "余暇", icon: "fa-gamepad", keywords: ["趣味", "テレビ視聴", "読書", "レク", "散歩", "気晴らし", "娯楽", "余暇", "余暇活動", "閉じこもり", "気分転換"] },
      { id: 14, name: "学び", icon: "fa-graduation-cap", keywords: ["病識", "理解度", "指導", "服薬指導", "質問", "知りたい", "学習", "説明理解", "学歴", "学習困難", "教材", "健康習慣", "血糖測定", "飲酒"] }
    ];

    const SAMPLE_TEXT = `[入院時] 現病歴3日前から咳嗽と発熱が持続し、本日呼吸苦が増悪したため救急搬送となった。
既往歴は2型糖尿病、高血圧症にて内服加療中。
家族関係：長男夫婦と同居、キーパーソンは長男の妻。
生活歴：元会社員（20年前に退職）、喫煙歴なし、機会飲酒あり。
診断名：市中肺炎の疑い
保険：社会保険（本人）
入院日：2026年9月10日
主訴：呼吸が苦しい
[10:00] 入院時、患者は「息苦しくて夜もあまり眠れなかった。横になると特に苦しい」と訴える。
[10:15] 体温37.8℃、脈拍92回/分、血圧142/86mmHg、SpO2 93%(room air)。軽度の起座呼吸あり。喘鳴(wheezes)を聴取。
[検査データ] WBC 11200, CRP 3.8, Hb 10.2, Cre 1.1, Na 136, K 4.2
[14:30] 「少し呼吸が楽になった」と話すが、再度体温を測定すると38.2℃に上昇していた。`;

    const DEFAULT_NOTEBOOK_CONTENT = `【NotebookLM 基準ノート: https://notebook.google.com/notebook/7015c97f-8d93-419e-9871-a6e6f2b00b44/preview】
このノートは編集不可の固定基準です。以下はアップロードされた基準表（体力・意思力・知識別 アセスメント情報項目一覧）を統合した内容です。

【S/O判定】
- 患者の直接の発言（「〜」）はSデータ（主観的情報）に分類する。
- 医療従事者の観察所見、バイタルサイン、検査データ（WBC, CRP, Hb, BUN, Cre, 電解質等）はOデータ（客観的情報）に分類する。表情・笑顔・顔色・様子など、患者本人の発言ではなく医療従事者が見て客観的に評価した所見も観察所見としてOデータに分類する。

【ヘンダーソン14の基本的欲求 タグ判定基準（体力・意思力・知識）】
1. 正常に呼吸する：体力=呼吸状態・外観(発汗,チアノーゼ)・気道の状態・検査データ(SpO2,動脈血液ガス,胸部X線)・呼吸に影響する要因(肥満,発熱,疼痛,薬剤の副作用)／意思力=呼吸機能への認識／知識=呼吸機能と管理方法(吸入器,在宅酸素療法)の知識
2. 適切に飲食する：体力=食習慣・栄養水分摂取量と内容・栄養状態(身長体重,BMI,血液検査)・食事のセルフケアや摂食嚥下機能(義歯,口腔粘膜)／意思力=食習慣や栄養状態への認識／知識=栄養・食事管理の知識
3. あらゆる経路から排泄する：体力=排便・排尿のパターンと性状・セルフケア自立度・発汗/痰/その他排泄物の状態／意思力=排泄への認識／知識=排泄コントロールの知識
4. 身体の位置を動かし良い姿勢を保持する：体力=動作・姿勢の自立度、皮膚の状態(発赤,褥瘡)、運動器・感覚・呼吸循環機能／意思力=動作姿勢保持のセルフケアへの認識／知識=安全な動作・姿勢保持の知識
5. 睡眠と休息をとる：体力=睡眠習慣と症状(入眠困難,中途覚醒)、休息習慣、ストレッサーとストレス反応／意思力=睡眠・休息・ストレスへの認識／知識=睡眠コントロール・ストレス対処法の知識
6. 適切な衣類を選び着脱する：体力=衣生活のセルフケア能力、衣類の選択基準と清潔保持／意思力=衣生活への認識／知識=衣生活管理の知識
7. 体温を生理的範囲内に維持する：体力=体温、衣類・寝具の選択、活動要因、環境要因(気温,湿度,すきま風)／意思力=体温調節への認識／知識=体温調節の知識
8. 身体を清潔に保ち皮膚を保護する：体力=皮膚・毛髪・爪・口腔等の清潔状態、身だしなみ、セルフケア能力／意思力=清潔保持への認識／知識=清潔保持管理の知識
9. 環境の危険を避け他者を傷害しない：体力=環境の状態・安全性、転倒転落・事故・暴力の有無、標準予防策の実施状況／意思力=安全性への認識／知識=環境維持・安全管理の知識
10. コミュニケーションで感情等を表現する：体力=言語・聴覚視覚等の伝達機能、感情/欲求/自己概念/自尊感情の状態、他者との人間関係／意思力=自分の感情理解や他者理解への認識／知識=伝達機能・感情理解の知識
11. 信仰に従って礼拝する：体力=信仰する宗教、価値観、生活習慣・規則(禁忌,輸血拒否等)／意思力=信仰・価値観への認識／知識=信仰保持の知識
12. 達成感をもたらす仕事をする：体力=職業・役割、達成感、周囲の理解や評価、リハビリテーション活動／意思力=役割・活動への認識／知識=役割維持の知識
13. 遊びやレクリエーションに参加する：体力=趣味・余暇活動、レクリエーション参加状況、閉じこもりの有無／意思力=気分転換への認識／知識=気分転換・レクリエーションの知識
14. 学習し発見し好奇心を満たす：体力=学習に必要な能力、生活習慣(血糖測定,飲酒等)、健康管理の実行状況／意思力=健康・学習への認識／知識=健康に関する知識、学習方法の知識`;

    const LAB_STANDARDS = {
      "WBC": { unit: "/μL", ref: "4,000〜9,000" },
      "RBC": { unit: "×10^4/μL", ref: "400〜550" },
      "Hb": { unit: "g/dL", ref: "11.5〜16.5" },
      "Plt": { unit: "×10^4/μL", ref: "13.0〜35.0" },
      "CRP": { unit: "mg/dL", ref: "0.3以下" },
      "AST": { unit: "U/L", ref: "10〜40" },
      "ALT": { unit: "U/L", ref: "5〜45" },
      "BUN": { unit: "mg/dL", ref: "8〜20" },
      "Cre": { unit: "mg/dL", ref: "0.6〜1.1" },
      "Na": { unit: "mEq/L", ref: "135〜145" },
      "K": { unit: "mEq/L", ref: "3.5〜5.0" },
      "Cl": { unit: "mEq/L", ref: "98〜108" },
      "Dダイマー": { unit: "μg/mL", ref: "1.0以下" },
      "BNP": { unit: "pg/mL", ref: "18.4以下" },
      "PT-INR": { unit: "", ref: "0.9〜1.1" },
      "HbA1c": { unit: "%", ref: "4.6〜6.2" }
    };

    // ==========================================================================
    // 検査値カードの抽出：値のすぐ後（スペースの有無を問わず）に単位まで書かれている場合、
    // 値と単位が別々のカードに分かれてしまう不具合の対策。
    // ------------------------------------------------------------------------
    // 以前は「WBC\s*\d+[\d,]*」のように数値までしか正規表現がマッチしなかったため、
    // 記録に「WBC 11200/μL」のように単位まで直接書かれていると、単位部分（"/μL"）が
    // 数値側の抽出から漏れて別の断片として残り、"不自然な始まり"の除外条件（助詞等）にも
    // 該当しないため、捨てられずにそのまま別カードとして生成されてしまっていた。
    // ここでは各項目の正規表現に、LAB_STANDARDSに登録済みの単位を「あれば続けて拾う」
    // 形でoptionalに含めることで、単位が書かれていてもいなくても値と同じカードにまとまる
    // ようにする（単位が無い場合は従来通りformatLabValueStringが自動で単位・基準値を補う）。
    // ==========================================================================
    function escapeRegExp(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    // 元のlabRegexにあった項目と並び順をそのまま踏襲（Hb/HbA1cのように前方一致しうる項目は
    // より長いキーを先に置く）。Clのみ、LAB_STANDARDSには定義済みだったが元の正規表現に
    // 含まれておらず単独では抽出できていなかったため、電解質の並び(Na/K/Cl)にあわせて追加する。
    const LAB_KEY_NUM_PATTERNS = [
      ['WBC', '\\d+[\\d,]*'], ['CRP', '\\d+\\.?\\d*'], ['HbA1c', '\\d+\\.?\\d*'], ['Hb', '\\d+\\.?\\d*'],
      ['RBC', '\\d+[\\d,]*'], ['Plt', '\\d+[\\d,]*'], ['BUN', '\\d+\\.?\\d*'], ['Cre', '\\d+\\.?\\d*'],
      ['Na', '\\d+'], ['K', '\\d+\\.?\\d*'], ['Cl', '\\d+'], ['AST', '\\d+'], ['ALT', '\\d+'],
      ['Dダイマー', '\\d+\\.?\\d*'], ['BNP', '\\d+\\.?\\d*'], ['PT-INR', '\\d+\\.?\\d*']
    ];
    const LAB_REGEX_SOURCE = LAB_KEY_NUM_PATTERNS.map(([key, numPattern]) => {
      const unit = LAB_STANDARDS[key] ? LAB_STANDARDS[key].unit : '';
      const unitSuffix = unit ? `(?:\\s*${escapeRegExp(unit)})?` : '';
      return `${escapeRegExp(key)}\\s*${numPattern}${unitSuffix}`;
    }).concat([
      // 体温・血圧・SpO2はLAB_STANDARDSに無いバイタルサインのため、単位はこれまで通り直接指定する
      '体温\\s*\\d{2}(?:\\.\\d)?\\s*℃?',
      '血圧\\s*\\d{2,3}\\/\\d{2,3}\\s*mmHg?',
      'SpO2\\s*\\d{2,3}\\s*%?(?:\\s*[\\(（][^)）]{0,20}[\\)）])?'
    ]).join('|');
    // AI抽出結果など、chunk.isLabOrVitalのようなフラグを持たない文章に対して「検査値・バイタルサインらしさ」を
    // 判定するための正規表現（食事タグの自動付与などに使う。LAB_REGEX_SOURCE自体は抽出用に前後一致を厳密には
    // 求めていないため、ここでは文章中に含まれているかどうかの簡易判定として流用する）。
    const LAB_VALUE_TEST_REGEX = new RegExp(LAB_REGEX_SOURCE, 'i');

    // 単独では意味が読み取れない断片（助詞・接続表現から始まる等）を検出するための正規表現。
    // これに該当する場合、直前のカードがあればそこへ文章をつなぎ戻し、つなぎ戻す先がなければ
    // 情報として不完全なのでカード化せずに読点区切りで捨てる。
    const UNNATURAL_START_REGEX = /^(の|は|が|を|に|で|と|も|へ|や|し|って|といった|という|ため|により|による|たり|して|しつつ|つつ|なり|ながら|とともに|において|に対して|について|よって)/;

    // 「7月3日(金)」のように日付だけの断片（スクリーンショットの日時表示をOCRで取り込んだ場合などに発生）は、
    // それ単体では意味のある情報にならないため、これに完全一致する場合はカード化しない。
    const DATE_ONLY_REGEX = /^(?:\d{1,4}年)?\d{1,2}月\d{1,2}日(?:\s*[\(（][月火水木金土日][\)）])?$|^\d{1,2}[\/／]\d{1,2}$|^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}$/;

    // 現病歴・診断名・保険等、時刻と同様に「見出しラベル」として本文から切り出し、
    // カード上ではバッジとして常に同じ場所・同じ見た目で表示する構造化項目。
    // type: この見出しが付いた本文をS/Oどちらの初期分類にするか（主訴は患者の訴えなのでS、それ以外は記録上の客観情報としてO）
    // 項目を追加したい場合はここに { key, label, color, bg, icon, type } を足すだけでよい。
    const FIELD_LABELS = [
      { key: "現病歴", label: "現病歴", color: "var(--slate)", bg: "var(--slate-soft)", icon: "fa-notes-medical", type: "o" },
      { key: "既往歴", label: "既往歴", color: "var(--slate)", bg: "var(--slate-soft)", icon: "fa-clock-rotate-left", type: "o" },
      { key: "家族関係", label: "家族関係", color: "var(--slate)", bg: "var(--slate-soft)", icon: "fa-people-roof", type: "o" },
      { key: "生活歴", label: "生活歴", color: "var(--slate)", bg: "var(--slate-soft)", icon: "fa-shoe-prints", type: "o" },
      { key: "診断名", label: "診断名", color: "var(--brick)", bg: "var(--brick-soft)", icon: "fa-stethoscope", type: "o" },
      { key: "保険", label: "保険", color: "var(--gold)", bg: "var(--gold-soft)", icon: "fa-file-shield", type: "o" },
      { key: "入院日", label: "入院日", color: "var(--accent-dark)", bg: "var(--accent-soft)", icon: "fa-calendar-check", type: "o" },
      { key: "主訴", label: "主訴", color: "var(--gold)", bg: "var(--gold-soft)", icon: "fa-comment-medical", type: "s" }
    ];
    // 「現病歴：」のようにコロン付きでも、「現病歴は」「現病歴」のようにコロンなしでも検出できるよう、
    // 見出し語の直後にコロン／読点／「は」いずれかが来ても来なくても切り出せる正規表現をここで組み立てる。
    const FIELD_LABEL_KEYS = FIELD_LABELS.map(f => f.key).join('|');
    const FIELD_LABEL_REGEX_SOURCE = `(?:^|[、。\\s])(${FIELD_LABEL_KEYS})(?:[:：]\\s*|は)?`;

    // ==========================================================================
    // 共有学習（全利用者・全カードで共有する学習データ）
    // ------------------------------------------------------------------------
    // 事例研究用途のため、個人情報の遮断は行わず、カードの本文・タグ付け・
    // どの欄に割り振られたか・どう編集されたかを、そのままサーバーに送って
    // 全利用者で共有する。学習内容はこのブラウザ（localStorage）には保存せず、
    // フォルダ内にあらかじめ用意された学習専用ファイルだけに保存・蓄積していく。
    // サーバー側は同じ形の辞書(learning-dict.json)と、生のイベント履歴
    // (case-log.json)の両方をこの1組のファイルに保存する（都度新しいファイルは作らない）。
    //   - learning-dict: テキストごとの「現在の学習結果」（S/O・ヘンダーソン
    //     タグ・欄・直前の編集）。次回同じ/似た文章が出てきたときの自動分類に使う。
    //     ページを開いた時に自動で全件読み込み、変更のたびに自動でこのファイルへ反映される。
    //   - case-log: いつ・何が・どう変わったかの生ログ。事例研究でそのまま
    //     時系列の分析対象にできる。
    // サーバー（server.js）を起動していない場合は学習専用ファイルに触れられないため、
    // 学習内容はその場限り（画面を離れると失われる）になる。
    // ==========================================================================
    const API_BASE = '/api';
    // { [text]: { preferredType, preferredCols, preferredHendersonIds, typeVotes, hendersonVotes, lastEditedFrom, updatedAt } }
    // typeVotes / hendersonVotes は「同じ文章に対して同じ編集が何回行われたか」のカウント（例:｛s:2, o:1｝）。
    // 新規の自動振り分け（'create'）は投票に数えず、ユーザーが実際に選び直した場合だけ加算することで、
    // 自動振り分けよりユーザーの編集を優先し、さらに票数が多いものほど次回の抽出で優先されるようにする。
    let sharedLearningDict = {};

    // 投票（typeVotes / hendersonVotes）の中から最多得票の値を選ぶ。同数の場合は先に記録された方を優先する。
    function pickTopVote(votes) {
      if (!votes) return null;
      let best = null, bestCount = 0;
      for (const [key, count] of Object.entries(votes)) {
        if (count > bestCount) { best = key; bestCount = count; }
      }
      return best;
    }

    async function loadSharedLearningDict() {
      try {
        const res = await fetch(`${API_BASE}/learning-dict`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        sharedLearningDict = await res.json();
        // 学習内容はこのブラウザには保存しないため、学習専用ファイル（サーバー）の内容が
        // そのまま学習辞書になる。既存キーがあれば（起動直後の再取得等）そちらを優先する。
        globalAppData.learningUserDict = { ...sharedLearningDict, ...globalAppData.learningUserDict };
      } catch (e) {
        console.warn('学習専用ファイルの読み込みに失敗しました（サーバーが起動していないか、通信できません。学習内容はこの表示中のみ有効で、保存されません）:', e);
      }
    }

    // ==========================================================================
    // 患者カルテ本体の共有保存（複数端末での共有用）
    // ------------------------------------------------------------------------
    // 患者ごとの分類ボード・総合アセスメント表の中身、および分類の抽出元になった
    // カルテ本文(sourceText)を、学習データと同じ考え方でサーバー側の1ファイル
    // （data/patients.json、患者IDをキーにしたオブジェクト）へ保存する。
    // これにより、ある端末で入力した内容を別の端末・別のブラウザからも同じ内容で開ける。
    // 全患者を毎回まるごと置き換えるのではなく、変更のあった患者だけをPUTすることで、
    // 複数人が別々の患者を同時に編集していても互いのデータを消し合わないようにしている。
    // さらに同じ患者をほぼ同時に編集した場合に備え、サーバー側はカード一覧(items)をカード単位で
    // マージする（server.js の mergePatientRecord）。そのための印として、カードの内容を書き換える
    // 操作のたびに touchItem() でカードへ _touchedAt（最後に書き換えた時刻）を付与し、カードを
    // 削除する操作のたびに markItemDeleted() で patient.deletedItemIds へ削除の記録を残す
    // （「元に戻す」の場合は unmarkItemDeleted() で取り消す）。PUT成功時にサーバーから返る
    // マージ後の内容は syncPatientToServer() がこの端末にも反映し、他端末だけが持っていた
    // カードが画面から消えたままにならないようにしている。
    // サーバー未接続の場合はこのブラウザのタブ内（sessionStorage）だけで、これまで通り動作する。
    // ==========================================================================
    const patientSyncTimers = {};
    const PATIENT_SYNC_DEBOUNCE_MS = 800; // カルテ本文の入力中など、変更のたびに毎回送らないよう少し待ってまとめて送る

    function schedulePatientSync(patientId) {
      if (!patientId) return;
      if (patientSyncTimers[patientId]) clearTimeout(patientSyncTimers[patientId]);
      patientSyncTimers[patientId] = setTimeout(() => syncPatientToServer(patientId), PATIENT_SYNC_DEBOUNCE_MS);
    }
    async function syncPatientToServer(patientId) {
      const patient = globalAppData.patients.find(p => p.id === patientId);
      if (!patient) return;
      try {
        const res = await fetch(`${API_BASE}/patients/${encodeURIComponent(patientId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patient)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // サーバー側は、他端末が同じ患者を同時に編集していた場合、カード単位で
        // マージした結果（他端末だけが持っていたカードを消さずに残した結果）を返す。
        // それをこの端末にも反映しておかないと、次にこの端末が保存するまで
        // 他端末のカードが画面に出てこないままになってしまう。入力中の欄
        // （カルテ本文=sourceText等）には触れず、カード一覧とその削除記録だけを合わせる。
        const result = await res.json().catch(() => null);
        if (result && result.patient && Array.isArray(result.patient.items)) {
          const current = globalAppData.patients.find(p => p.id === patientId);
          if (current) {
            const changed = JSON.stringify(current.items) !== JSON.stringify(result.patient.items);
            current.items = result.patient.items;
            current.deletedItemIds = Array.isArray(result.patient.deletedItemIds) ? result.patient.deletedItemIds : [];
            if (result.patient.updatedAt) current.updatedAt = result.patient.updatedAt;
            if (changed) {
              try {
                sessionStorage.setItem(PATIENTS_STORAGE_KEY, JSON.stringify({ patients: globalAppData.patients, currentPatientId: globalAppData.currentPatientId }));
              } catch (e) { /* 容量超過などは無視して表示だけ更新する */ }
              if (getCurrentPatient().id === patientId) {
                renderSoBoard();
                renderAssessmentTable();
              }
            }
          }
        }
      } catch (e) {
        console.warn('患者カルテのサーバーへの保存に失敗しました（この端末内には保存されています。サーバー未接続の場合は他端末と共有されません）:', e);
      }
    }
    async function deletePatientFromServer(patientId) {
      try {
        const res = await fetch(`${API_BASE}/patients/${encodeURIComponent(patientId)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (e) {
        console.warn('患者カルテのサーバーからの削除に失敗しました:', e);
      }
    }
    // 起動時に一度、サーバー側の共有カルテを取得し、このブラウザ内のカルテとマージする。
    // 同じ患者IDが両方に存在する場合は、更新日時(updatedAt)が新しい方を採用する
    // （他端末での更新が新しければそちらを取り込み、このタブでの未送信の変更が新しければそれを残す）。
    async function loadSharedPatients() {
      try {
        const res = await fetch(`${API_BASE}/patients`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const serverPatientsDict = await res.json();
        const merged = {};
        (globalAppData.patients || []).forEach(p => { merged[p.id] = p; });
        Object.entries(serverPatientsDict).forEach(([id, serverPatient]) => {
          const localPatient = merged[id];
          if (!localPatient) { merged[id] = serverPatient; return; }
          const localTime = localPatient.updatedAt ? new Date(localPatient.updatedAt).getTime() : 0;
          const serverTime = serverPatient.updatedAt ? new Date(serverPatient.updatedAt).getTime() : 0;
          if (serverTime > localTime) merged[id] = serverPatient;
        });
        const mergedList = Object.values(merged);
        if (mergedList.length > 0) {
          globalAppData.patients = mergedList;
          if (!globalAppData.patients.some(p => p.id === globalAppData.currentPatientId)) {
            globalAppData.currentPatientId = (globalAppData.patients.find(p => !p.archived) || globalAppData.patients[0]).id;
          }
        }
      } catch (e) {
        console.warn('患者カルテの共有ファイルの読み込みに失敗しました（サーバーが起動していないか、通信できません。このブラウザ内のカルテのみで動作します）:', e);
      }
    }

    // ==========================================================================
    // AIによる抽出・分類基準への「追加の要望」（全利用者共有）
    // ------------------------------------------------------------------------
    // NotebookLM基準ノート（DEFAULT_NOTEBOOK_CONTENT）自体は編集不可の固定内容だが、
    // 現場で「こういう場合はこう抽出／分類してほしい」という要望が出た時に、コードを
    // 触らずに「学習データ管理」画面（パスワード保護）の「抽出基準」タブから追加・編集・
    // 削除できるようにする。ここで追加・編集した内容はサーバー側の
    // data/extraction-criteria.json に保存され、全利用者・全端末で共有される。
    // AIへの指示文（プロンプト）を組み立てる際は、必ず buildEffectiveNotebookContent()
    // 経由でNotebookLM基準ノートと結合したものを使う。
    // ==========================================================================
    function buildEffectiveNotebookContent() {
      const extras = (globalAppData.additionalCriteria || []).map(c => `- ${c.text}`).join('\n');
      if (!extras) return globalAppData.notebookContent;
      return `${globalAppData.notebookContent}\n\n【利用者からの追加の抽出・分類基準（現場からの要望・全員共有）】\n${extras}`;
    }

    async function loadSharedCriteria() {
      try {
        const res = await fetch(`${API_BASE}/extraction-criteria`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        globalAppData.additionalCriteria = await res.json();
        renderExtraCriteriaList();
      } catch (e) {
        console.warn('追加の抽出基準の読み込みに失敗しました（サーバーが起動していないか、通信できません。この表示中のみで動作します）:', e);
      }
    }

    async function addExtraCriteria(text) {
      try {
        const res = await fetch(`${API_BASE}/extraction-criteria`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        globalAppData.additionalCriteria = await res.json();
        renderExtraCriteriaList();
        return true;
      } catch (e) {
        console.warn('追加の抽出基準の保存に失敗しました:', e);
        showToast('サーバーに保存できませんでした（サーバーが起動していない可能性があります）', 'error');
        return false;
      }
    }

    window.deleteExtraCriteria = async function(id) {
      try {
        const res = await fetch(`${API_BASE}/extraction-criteria/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        globalAppData.additionalCriteria = await res.json();
        if (editingCriteriaId === id) editingCriteriaId = null;
        renderExtraCriteriaList();
        showToast('追加の要望を削除しました', 'success');
      } catch (e) {
        console.warn('追加の抽出基準の削除に失敗しました:', e);
        showToast('削除に失敗しました（サーバーが起動していない可能性があります）', 'error');
      }
    };

    // 既存の要望を編集する（追加・削除だけでなく、内容そのものを直接書き換えられるようにする）。
    // 編集中は該当行だけがテキストエリア表示に切り替わる（editingCriteriaIdで管理）。
    let editingCriteriaId = null;
    window.startEditExtraCriteria = function(id) {
      editingCriteriaId = id;
      renderExtraCriteriaList();
    };
    window.cancelEditExtraCriteria = function() {
      editingCriteriaId = null;
      renderExtraCriteriaList();
    };
    window.saveEditExtraCriteria = async function(id) {
      const textarea = document.getElementById(`edit-extra-criteria-${id}`);
      const text = textarea ? textarea.value.trim() : '';
      if (!text) return showToast('内容を入力してください', 'error');
      try {
        const res = await fetch(`${API_BASE}/extraction-criteria/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        globalAppData.additionalCriteria = await res.json();
        editingCriteriaId = null;
        renderExtraCriteriaList();
        showToast('抽出基準を更新しました（全員に共有されます）', 'success');
      } catch (e) {
        console.warn('追加の抽出基準の更新に失敗しました:', e);
        showToast('更新に失敗しました（サーバーが起動していない可能性があります）', 'error');
      }
    };

    function renderExtraCriteriaList() {
      const el = document.getElementById('list-extra-criteria');
      if (!el) return;
      const items = globalAppData.additionalCriteria || [];
      if (items.length === 0) {
        el.innerHTML = `<p class="text-[10px] text-[var(--ink-muted)]">まだ追加された要望はありません。</p>`;
        return;
      }
      el.innerHTML = items.map(c => {
        if (c.id === editingCriteriaId) {
          return `
            <div class="flex flex-col gap-1.5 p-1.5 rounded-[var(--radius-sm)] border border-[var(--accent)] text-[11px]" style="background:var(--surface);">
              <textarea id="edit-extra-criteria-${c.id}" rows="2" class="field resize-none text-[11px]">${escapeHtml(c.text)}</textarea>
              <div class="flex justify-end gap-1.5">
                <button onclick="cancelEditExtraCriteria()" class="btn btn-ghost" style="padding:2px 8px;font-size:10px;">キャンセル</button>
                <button onclick="saveEditExtraCriteria('${c.id}')" class="btn btn-primary" style="padding:2px 8px;font-size:10px;">保存</button>
              </div>
            </div>
          `;
        }
        return `
          <div class="flex items-start justify-between gap-2 p-1.5 rounded-[var(--radius-sm)] border border-[var(--line-soft)] text-[11px]" style="background:var(--surface);">
            <span class="flex-1 break-words text-[var(--ink)]">${escapeHtml(c.text)}</span>
            <div class="flex items-center gap-1 shrink-0">
              <button onclick="startEditExtraCriteria('${c.id}')" class="icon-btn" title="この要望を編集"><i class="fa-solid fa-pen text-[9px]"></i></button>
              <button onclick="deleteExtraCriteria('${c.id}')" class="icon-btn danger" title="この要望を削除"><i class="fa-solid fa-trash text-[9px]"></i></button>
            </div>
          </div>
        `;
      }).join('');
    }

    // ==========================================================================
    // 同時接続人数の表示：複数人で使うことを踏まえ、今このシステムを開いている人数の
    // 目安をヘッダーに表示する（タブごとに固有のIDを持ち、定期的にサーバーへ生存報告する）。
    // ==========================================================================
    const PRESENCE_ID_KEY = 'nursing_presence_id';
    let presenceClientId = null;
    try { presenceClientId = sessionStorage.getItem(PRESENCE_ID_KEY); } catch (e) { /* noop */ }
    if (!presenceClientId) {
      presenceClientId = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      try { sessionStorage.setItem(PRESENCE_ID_KEY, presenceClientId); } catch (e) { /* noop */ }
    }
    function updatePresenceUI(count) {
      const el = document.getElementById('presence-count');
      if (!el) return;
      el.textContent = typeof count === 'number' ? String(count) : '?';
    }
    async function sendPresenceHeartbeat() {
      try {
        const res = await fetch(`${API_BASE}/presence/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: presenceClientId })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        updatePresenceUI(data.count);
      } catch (e) {
        updatePresenceUI(null); // サーバー未接続時は人数不明として表示する（エラー扱いにはしない）
      }
    }
    sendPresenceHeartbeat();
    setInterval(sendPresenceHeartbeat, 20000);

    // ==========================================================================
    // 情報カードの不具合報告：カードごとの「報告」ボタンから送る内容を、
    // 同じブラウザタブ（＝ページを閉じるまで）の間は同じsessionIdで送ることで、
    // サーバー側で1人分の投稿としてまとめて記録できるようにする（presenceの仕組みと同様、
    // sessionStorageを使うのでタブを閉じれば次回は新しいsessionIdになる）。
    // ==========================================================================
    const CARD_REPORT_SESSION_KEY = 'nursing_card_report_session_id';
    let cardReportSessionId = null;
    try { cardReportSessionId = sessionStorage.getItem(CARD_REPORT_SESSION_KEY); } catch (e) { /* noop */ }
    if (!cardReportSessionId) {
      cardReportSessionId = 'rpt_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      try { sessionStorage.setItem(CARD_REPORT_SESSION_KEY, cardReportSessionId); } catch (e) { /* noop */ }
    }

    // 学習によって「何がどう変わったか」をユーザー自身が確認できるよう、サーバーへの送信とは別に
    // このブラウザ内にも変更履歴を保存しておく（サーバー未接続でも履歴が見られるようにするため）。
    const LEARNING_HISTORY_KEY = 'nursing_learning_history';
    const LEARNING_HISTORY_MAX = 300;
    let learningHistory = [];
    try { learningHistory = JSON.parse(localStorage.getItem(LEARNING_HISTORY_KEY) || '[]'); } catch (e) { learningHistory = []; }
    function addLearningHistoryEntry(text, action, payload) {
      learningHistory.push({ at: new Date().toISOString(), text, action, payload });
      if (learningHistory.length > LEARNING_HISTORY_MAX) learningHistory = learningHistory.slice(-LEARNING_HISTORY_MAX);
      try { localStorage.setItem(LEARNING_HISTORY_KEY, JSON.stringify(learningHistory)); } catch (e) { console.warn('学習履歴の保存に失敗しました:', e); }
    }

    // action: 'create' | 'type' | 'tagAdd' | 'tagRemove' | 'col' | 'edit' | 'delete'
    async function reportLearningEvent(text, action, payload) {
      addLearningHistoryEntry(text, action, payload); // サーバーの成否によらず、必ずローカル履歴には残す
      try {
        const res = await fetch(`${API_BASE}/learning-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, action, payload, at: new Date().toISOString() })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const updated = await res.json();
        if (updated && updated.dict) sharedLearningDict = updated.dict;
      } catch (e) {
        console.warn('共有学習イベントの送信に失敗しました（サーバー未接続の場合はローカル学習のみで動作します）:', e);
      }
    }

    // ページを更新（リロード）した場合は入力済みのカルテ内容を保持しつつ、
    // ブラウザ／タブを閉じて新しくアクセスし直した場合は保持しないようにしたいので、
    // localStorageではなくタブ単位で消えるsessionStorageに患者データ一式を保存する。
    const PATIENTS_STORAGE_KEY = 'nursing_patients_data';
    function loadPersistedPatients() {
      try {
        const raw = sessionStorage.getItem(PATIENTS_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.patients) && parsed.patients.length) return parsed;
      } catch (e) {
        console.warn('保存済みのカルテデータの読み込みに失敗しました:', e);
      }
      return null;
    }
    const persistedPatients = loadPersistedPatients();

    let globalAppData = {
      patients: persistedPatients?.patients || [
        { id: 'patient_1', title: '患者A', items: [], sourceText: '', labEvaluationResult: '', referenceNotes: [], archived: false, updatedAt: null, deletedItemIds: [] }
      ],
      currentPatientId: persistedPatients?.currentPatientId || 'patient_1',
      // 学習内容はこのブラウザ（localStorage）には保存せず、フォルダ内の学習専用ファイル
      // （data/learning-dict.json）だけに保存する。起動時に loadSharedLearningDict() が
      // そのファイルの内容をまるごと取得してここに読み込む（サーバー未起動時は空のまま）。
      learningUserDict: {},
      apiKey: localStorage.getItem('gemini_api_key') || '',
      notebookContent: DEFAULT_NOTEBOOK_CONTENT, // 編集機能は廃止し、アップロード済みの基準表を統合した固定内容を使用
      // NotebookLM基準ノート自体は編集不可だが、現場からの「こう抽出・分類してほしい」という
      // 追加の要望はここに積み上げる（サーバー側 data/extraction-criteria.json に保存され、全利用者で共有）。
      additionalCriteria: []
    };

    const DOM = {
      tabSoBoard: document.getElementById('tab-so-board'),
      tabAssessment: document.getElementById('tab-assessment'),
      tabReference: document.getElementById('tab-reference'),
      viewSoBoard: document.getElementById('view-so-board'),
      viewAssessment: document.getElementById('view-assessment'),
      viewReference: document.getElementById('view-reference'),
      sourceText: document.getElementById('source-text'),
      toastContainer: document.getElementById('toast-container'),
      patientTabs: document.getElementById('patient-tabs-container'),
      labEvalContent: document.getElementById('lab-evaluation-content'),
      currentPatientTitle: document.getElementById('current-patient-title-label')
    };

    // ダークモード切り替え（夜勤帯向け）。この設定自体は学習データではなく個人の画面設定なので、
    // これまで通りlocalStorageに保存する（学習内容とは別の話）。
    const THEME_KEY = 'nursing_theme';
    function applyThemeIcon() {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const icon = document.querySelector('#btn-toggle-theme i');
      if (icon) icon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }
    document.getElementById('btn-toggle-theme').addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* 保存できなくても表示上の切り替えは有効 */ }
      applyThemeIcon();
    });
    applyThemeIcon(); // <head>の先読みスクリプトが設定したテーマに合わせて、アイコンを起動時から一致させる

    function getCurrentPatient() {
      let p = globalAppData.patients.find(x => x.id === globalAppData.currentPatientId);
      if (!p) { p = globalAppData.patients.find(x => !x.archived) || globalAppData.patients[0]; globalAppData.currentPatientId = p.id; }
      if (!p.referenceNotes) p.referenceNotes = []; // 古い保存データとの互換性維持
      if (p.archived === undefined) p.archived = false;
      return p;
    }

    // 「n分前」「n時間前」のような相対時刻表示（患者一覧・ヘッダーの最終更新表示用）
    function formatRelativeTime(iso) {
      if (!iso) return '';
      const diffMs = Date.now() - new Date(iso).getTime();
      const min = Math.floor(diffMs / 60000);
      if (min < 1) return 'たった今';
      if (min < 60) return `${min}分前`;
      const hr = Math.floor(min / 60);
      if (hr < 24) return `${hr}時間前`;
      const day = Math.floor(hr / 24);
      if (day < 7) return `${day}日前`;
      const d = new Date(iso);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    }

    function updateSaveStatus() {
      const el = document.getElementById('save-status-time');
      if (el) el.textContent = `保存済み ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;
    }

    function updateCurrentPatientMeta() {
      const cp = getCurrentPatient();
      const el = document.getElementById('current-patient-updated');
      if (el) el.textContent = cp.updatedAt ? `(更新: ${formatRelativeTime(cp.updatedAt)})` : '';
    }

    function showToast(message, type = 'info') {
      const toast = document.createElement('div');
      const styles = {
        success: 'background:var(--accent-soft);color:var(--accent-dark);border-color:#D7E2DC;',
        error: 'background:var(--brick-soft);color:var(--brick);border-color:#E7CFC8;',
        info: 'background:var(--surface);color:var(--ink);border-color:var(--line);'
      };
      toast.className = `toast-enter p-3 rounded-[var(--radius-sm)] border text-xs font-medium flex items-center gap-2 panel-shadow`;
      toast.style.cssText = styles[type] || styles.info;
      const icon = type === 'success' ? 'fa-check' : type === 'error' ? 'fa-circle-exclamation' : 'fa-info-circle';
      toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
      DOM.toastContainer.appendChild(toast);
      setTimeout(() => { toast.classList.replace('toast-enter', 'toast-exit'); setTimeout(() => toast.remove(), 300); }, 3000);
    }

    // 削除・リセット系の操作の直後に「元に戻す」ボタン付きトーストを出す共通処理。
    // undoFn は元に戻す処理そのもの（呼び出し側でsaveDataAndSync等の再描画も行う）。
    function showUndoToast(message, undoFn) {
      const toast = document.createElement('div');
      toast.className = 'toast-enter p-3 rounded-[var(--radius-sm)] border text-xs font-medium flex items-center gap-3 panel-shadow';
      toast.style.cssText = 'background:var(--surface);color:var(--ink);border-color:var(--line);pointer-events:auto;';
      toast.innerHTML = `<i class="fa-solid fa-clock-rotate-left text-[var(--ink-muted)]"></i><span class="flex-1">${escapeHtml(message)}</span><button class="font-bold text-[var(--accent)] hover:underline whitespace-nowrap">元に戻す</button>`;
      const undoBtn = toast.querySelector('button');
      let dismissed = false;
      const dismiss = () => { if (dismissed) return; dismissed = true; toast.classList.replace('toast-enter', 'toast-exit'); setTimeout(() => toast.remove(), 300); };
      undoBtn.addEventListener('click', () => {
        undoFn();
        saveDataAndSync();
        dismiss();
        showToast('元に戻しました', 'info');
      });
      DOM.toastContainer.appendChild(toast);
      setTimeout(dismiss, 6000);
    }

    // 汎用ダイアログ（window.prompt / window.confirm の代替。見た目をアプリ全体と統一する）
    const dialogEl = document.getElementById('modal-dialog');
    const dialogTitleEl = document.getElementById('dialog-title');
    const dialogMessageEl = document.getElementById('dialog-message');
    const dialogInputEl = document.getElementById('dialog-input');
    const dialogCancelBtn = document.getElementById('dialog-cancel');
    const dialogConfirmBtn = document.getElementById('dialog-confirm');
    let dialogResolve = null;

    function openDialog({ title, message = '', inputValue, placeholder = '', confirmLabel = 'OK', danger = false }) {
      return new Promise(resolve => {
        dialogResolve = resolve;
        dialogTitleEl.textContent = title;
        if (message) { dialogMessageEl.textContent = message; dialogMessageEl.classList.remove('hidden'); } else { dialogMessageEl.classList.add('hidden'); }
        if (inputValue !== undefined) {
          dialogInputEl.classList.remove('hidden');
          dialogInputEl.value = inputValue;
          dialogInputEl.placeholder = placeholder;
        } else {
          dialogInputEl.classList.add('hidden');
        }
        dialogConfirmBtn.textContent = confirmLabel;
        dialogConfirmBtn.style.cssText = danger ? 'background:var(--brick);border-color:var(--brick);color:#fff;' : '';
        dialogEl.classList.remove('hidden');
        if (inputValue !== undefined) setTimeout(() => { dialogInputEl.focus(); dialogInputEl.select(); }, 30);
      });
    }
    function closeDialog(result) {
      dialogEl.classList.add('hidden');
      if (dialogResolve) { dialogResolve(result); dialogResolve = null; }
    }
    dialogCancelBtn.addEventListener('click', () => closeDialog(null));
    dialogConfirmBtn.addEventListener('click', () => closeDialog(dialogInputEl.classList.contains('hidden') ? true : dialogInputEl.value.trim()));
    dialogInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); dialogConfirmBtn.click(); } });
    dialogEl.addEventListener('click', e => { if (e.target === dialogEl) closeDialog(null); });

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }

    // ---- Gemini AI呼び出しの共通処理 ----
    // アプリ内の全AI機能（分類抽出・検査値評価・矛盾チェック・看護診断候補・経時変化サマリー・
    // 看護計画生成・不足情報推定・報告要約・OCR）が、この1つの関数を通してGemini APIを呼び出す。
    // contentsにはGemini APIの"contents"配列をそのまま渡す（通常のテキストプロンプトは
    // [{ role: "user", parts: [{ text: prompt }] }]、画像を含むOCRの場合は
    // [{ parts: [{ text }, { inline_data }] }] の形）。成功時は応答テキストをそのまま返し、
    // HTTPエラー時は分かりやすいメッセージで例外を投げる（呼び出し側のtry/catchで拾う想定）。
    async function callGeminiAI(contents) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${globalAppData.apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents })
      });
      if (!res.ok) throw new Error(`Gemini API error (HTTP ${res.status})`);
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    // AIの応答テキスト（改行と**強調**だけを使う簡易マークダウン形式で返ってくる想定）を
    // 表示用HTMLに変換する共通処理。応答が空だった場合はfallbackの文言を使う。
    function formatAiResultHtml(text, fallback = '結果を取得できませんでした。') {
      return (text || fallback).replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    }

    function persistData() {
      const cp = getCurrentPatient();
      cp.sourceText = DOM.sourceText.value;
      cp.updatedAt = new Date().toISOString();
      // 学習内容はブラウザ（localStorage）には保存しない。学習専用ファイル（data/learning-dict.json）への
      // 反映は、変更のたびに reportLearningEvent() が個別に、ページを閉じる時に beforeunload の
      // sendBeacon がまとめて、それぞれサーバーへ送ることで行う。
      try {
        sessionStorage.setItem(PATIENTS_STORAGE_KEY, JSON.stringify({ patients: globalAppData.patients, currentPatientId: globalAppData.currentPatientId }));
      } catch (e) {
        // 容量超過などで保存できない場合も画面表示自体は続行する
        console.warn('カルテデータの自動保存に失敗しました（ブラウザの保存容量が不足している可能性があります）:', e);
      }
      schedulePatientSync(cp.id); // 複数端末で共有できるよう、この患者カルテをサーバー側にも保存する（連続入力時は少し待ってまとめて送る）
      updateSaveStatus();
      updateCurrentPatientMeta();
    }

    function saveDataAndSync() {
      persistData();
      renderSoBoard();
      renderAssessmentTable();
      renderReferenceList();
    }

    // ---- 複数端末での同時編集マージ用のしるし ----
    // 同じ患者カルテを複数端末が同時に編集すると、片方の端末が送った「カード一覧まるごと」が
    // もう片方の端末だけが知っている新しいカードを消してしまうことがある。これを防ぐため、
    // サーバー側（server.js の mergePatientRecord）はカード単位でマージする。その判断材料として、
    // 「このカードが最後にいつ書き換えられたか」(touchItem)と「このカードがいつ削除されたか」
    // (markItemDeleted、一定期間だけ保持する削除の記録＝tombstone)をカード操作のたびに付与する。
    function touchItem(item) {
      if (item) item._touchedAt = new Date().toISOString();
    }
    function markItemDeleted(cp, itemId) {
      if (!cp || !itemId) return;
      if (!Array.isArray(cp.deletedItemIds)) cp.deletedItemIds = [];
      cp.deletedItemIds = cp.deletedItemIds.filter(t => t && t.id !== itemId);
      cp.deletedItemIds.push({ id: itemId, at: new Date().toISOString() });
    }
    function unmarkItemDeleted(cp, itemId) {
      if (!cp || !Array.isArray(cp.deletedItemIds)) return;
      cp.deletedItemIds = cp.deletedItemIds.filter(t => t && t.id !== itemId);
    }

    function loadLocalState() {
      const cp = getCurrentPatient();
      DOM.sourceText.value = cp.sourceText || '';
      DOM.labEvalContent.innerHTML = cp.labEvaluationResult || '「検査値AI総合評価」ボタンを押すと、入力されたOデータ中の検査値をノートブックの基準に基づいて自動抽出し、臨床的意味を評価します。';
      DOM.currentPatientTitle.textContent = cp.title;

      // 前回のAI分析結果（矛盾チェック・看護診断候補・経時変化サマリー）があれば患者切り替え時にも復元する
      const contradictionPanel = document.getElementById('contradiction-panel');
      if (cp.contradictionResult) { contradictionPanel.classList.remove('hidden'); document.getElementById('contradiction-content').innerHTML = cp.contradictionResult; }
      else { contradictionPanel.classList.add('hidden'); document.getElementById('contradiction-content').innerHTML = ''; }
      const diagnosisPanel = document.getElementById('diagnosis-panel');
      if (cp.diagnosisResult) { diagnosisPanel.classList.remove('hidden'); document.getElementById('diagnosis-content').innerHTML = cp.diagnosisResult; }
      else { diagnosisPanel.classList.add('hidden'); document.getElementById('diagnosis-content').innerHTML = ''; }
      const timelinePanel = document.getElementById('timeline-panel');
      if (cp.timelineResult) { timelinePanel.classList.remove('hidden'); document.getElementById('timeline-content').innerHTML = cp.timelineResult; }
      else { timelinePanel.classList.add('hidden'); document.getElementById('timeline-content').innerHTML = ''; }
      const carePlanPanel = document.getElementById('careplan-panel');
      if (cp.carePlanResult) { carePlanPanel.classList.remove('hidden'); document.getElementById('careplan-content').innerHTML = cp.carePlanResult; }
      else { carePlanPanel.classList.add('hidden'); document.getElementById('careplan-content').innerHTML = ''; }

      selectedCardIds.clear();
      boardSearchTerm = '';
      const searchInput = document.getElementById('board-search');
      if (searchInput) searchInput.value = '';

      renderPatientTabs();
      renderSoBoard();
      renderAssessmentTable();
      renderReferenceList();
      updateCurrentPatientMeta();
    }

    function renderPatientTabs() {
      const frag = document.createDocumentFragment();
      // アーカイブ済みのページはタブには出さない（「一覧」から確認・復元できる）
      const visible = globalAppData.patients.filter(pat => !pat.archived);
      visible.forEach(pat => {
        const isActive = pat.id === globalAppData.currentPatientId;
        const btn = document.createElement('div');
        btn.className = `patient-chip ${isActive ? 'active' : ''}`;
        btn.innerHTML = `
          <i class="fa-solid fa-user-injured text-[9px]"></i>
          <span onclick="switchPatient('${pat.id}')">${escapeHtml(pat.title)}</span>
          ${visible.length > 1 ? `<button onclick="deletePatient('${pat.id}', event)" class="icon-btn danger" title="アーカイブする（「一覧」からいつでも復元できます）"><i class="fa-solid fa-box-archive text-[9px]"></i></button>` : ''}
        `;
        frag.appendChild(btn);
      });
      DOM.patientTabs.replaceChildren(frag);
    }

    window.switchPatient = function(patId) {
      persistData();
      globalAppData.currentPatientId = patId;
      loadLocalState();
      showToast(`「${getCurrentPatient().title}」のカルテに切り替えました`, 'info');
    };

    document.getElementById('btn-new-patient').addEventListener('click', async () => {
      const title = await openDialog({ title: '新しい患者ページを作成', inputValue: `患者${globalAppData.patients.length + 1}`, placeholder: '患者名またはページ名', confirmLabel: '作成する' });
      if (!title) return;
      const newId = 'patient_' + Date.now();
      globalAppData.patients.push({ id: newId, title: title.trim(), items: [], sourceText: '', labEvaluationResult: '', referenceNotes: [], archived: false, updatedAt: null, deletedItemIds: [] });
      globalAppData.currentPatientId = newId;
      persistData();
      loadLocalState();
      showToast(`新規ページ「${title}」を作成しました`, 'success');
    });

    document.getElementById('btn-rename-patient').addEventListener('click', async () => {
      const cp = getCurrentPatient();
      const newTitle = await openDialog({ title: 'ページ名を変更', inputValue: cp.title, confirmLabel: '変更する' });
      if (newTitle && newTitle.trim()) {
        cp.title = newTitle.trim();
        saveDataAndSync();
        DOM.currentPatientTitle.textContent = cp.title;
        renderPatientTabs();
        showToast('ページ名を変更しました', 'success');
      }
    });

    // タブ上の「アーカイブ」ボタンは、誤操作でも「一覧」からすぐ復元できるようアーカイブ扱いにする
    // （完全な削除は「一覧」モーダルの削除ボタンからのみ行う）
    window.deletePatient = function(patId, e) {
      e.stopPropagation();
      archivePatient(patId);
    };

    window.archivePatient = function(id) {
      const p = globalAppData.patients.find(x => x.id === id);
      if (!p) return;
      const nonArchivedCount = globalAppData.patients.filter(x => !x.archived).length;
      if (!p.archived && nonArchivedCount <= 1) return showToast('最後のページはアーカイブできません', 'error');
      p.archived = true;
      const wasCurrent = globalAppData.currentPatientId === id;
      if (wasCurrent) {
        const next = globalAppData.patients.find(x => !x.archived);
        if (next) globalAppData.currentPatientId = next.id;
      }
      persistData();
      schedulePatientSync(id); // アーカイブしたページ自身も明示的に同期する（現在のページと異なる場合、persistDataだけでは同期されないため）
      loadLocalState();
      renderPatientListModal();
      showUndoToast(`「${p.title}」をアーカイブしました`, () => {
        p.archived = false;
        if (wasCurrent) globalAppData.currentPatientId = id;
        schedulePatientSync(id);
        loadLocalState();
        renderPatientListModal();
      });
    };

    window.unarchivePatient = function(id) {
      const p = globalAppData.patients.find(x => x.id === id);
      if (!p) return;
      p.archived = false;
      persistData();
      schedulePatientSync(id);
      renderPatientTabs();
      renderPatientListModal();
      showToast(`「${p.title}」を復元しました`, 'success');
    };

    window.switchPatientFromList = function(id) {
      switchPatient(id);
      renderPatientListModal();
    };

    window.hardDeletePatientFromList = async function(id) {
      const target = globalAppData.patients.find(p => p.id === id);
      if (globalAppData.patients.length <= 1) return showToast('最後のページは削除できません', 'error');
      const confirmed = await openDialog({ title: '完全に削除しますか？', message: `「${target ? target.title : ''}」のデータを完全に削除します。アーカイブと違い、この操作は元に戻せません。`, confirmLabel: '完全に削除する', danger: true });
      if (!confirmed) return;
      const idx = globalAppData.patients.findIndex(p => p.id === id);
      if (idx === -1) return;
      globalAppData.patients.splice(idx, 1);
      if (globalAppData.currentPatientId === id) {
        const next = globalAppData.patients.find(x => !x.archived) || globalAppData.patients[0];
        globalAppData.currentPatientId = next.id;
      }
      if (patientSyncTimers[id]) { clearTimeout(patientSyncTimers[id]); delete patientSyncTimers[id]; }
      deletePatientFromServer(id); // サーバー側の共有カルテからも削除する（他端末にも削除が反映される）
      persistData();
      loadLocalState();
      renderPatientListModal();
      showToast('完全に削除しました', 'info');
    };

    // ==========================================================================
    // 患者ページ一覧モーダル：検索・並び替え・アーカイブ表示切り替え
    // ==========================================================================
    function renderPatientListModal() {
      const body = document.getElementById('patient-list-body');
      if (!body) return;
      const term = (document.getElementById('patient-list-search').value || '').trim().toLowerCase();
      const showArchived = document.getElementById('patient-list-show-archived').checked;
      const sortMode = document.getElementById('patient-list-sort').value;
      let list = globalAppData.patients.filter(p => showArchived || !p.archived);
      if (term) list = list.filter(p => p.title.toLowerCase().includes(term));
      list = list.slice().sort((a, b) => sortMode === 'name' ? a.title.localeCompare(b.title, 'ja') : (b.updatedAt || '').localeCompare(a.updatedAt || ''));

      if (list.length === 0) {
        const p = document.createElement('p');
        p.className = 'text-xs text-[var(--ink-muted)] text-center py-6';
        p.textContent = '該当する患者ページがありません。';
        body.replaceChildren(p);
        return;
      }
      const frag = document.createDocumentFragment();
      list.forEach(pat => {
        const row = document.createElement('div');
        row.className = `flex items-center justify-between gap-2 p-2 rounded-[var(--radius-sm)] border ${pat.id === globalAppData.currentPatientId ? 'border-[var(--accent)]' : 'border-[var(--line)]'}`;
        row.style.background = pat.id === globalAppData.currentPatientId ? 'var(--accent-soft)' : 'var(--surface)';
        row.innerHTML = `
          <div class="min-w-0 flex-1 cursor-pointer" onclick="switchPatientFromList('${pat.id}')">
            <div class="text-xs font-semibold text-[var(--ink)] truncate">${escapeHtml(pat.title)}${pat.archived ? ' <span class="text-[9px] text-[var(--ink-muted)] font-normal">(アーカイブ済み)</span>' : ''}</div>
            <div class="text-[10px] text-[var(--ink-muted)]">${pat.updatedAt ? formatRelativeTime(pat.updatedAt) : '更新履歴なし'}・${(pat.items || []).length}件のカード</div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            ${pat.archived
              ? `<button onclick="unarchivePatient('${pat.id}')" class="icon-btn-outline" title="復元"><i class="fa-solid fa-box-open"></i></button>`
              : `<button onclick="archivePatient('${pat.id}')" class="icon-btn-outline" title="アーカイブ"><i class="fa-solid fa-box-archive"></i></button>`}
            <button onclick="hardDeletePatientFromList('${pat.id}')" class="icon-btn-outline danger" title="完全に削除"><i class="fa-solid fa-trash-can"></i></button>
          </div>
        `;
        frag.appendChild(row);
      });
      body.replaceChildren(frag);
    }

    document.getElementById('btn-patient-list').addEventListener('click', () => {
      document.getElementById('patient-list-search').value = '';
      document.getElementById('patient-list-show-archived').checked = false;
      renderPatientListModal();
      document.getElementById('modal-patient-list').classList.remove('hidden');
    });
    document.getElementById('btn-close-patient-list').addEventListener('click', () => document.getElementById('modal-patient-list').classList.add('hidden'));
    document.getElementById('patient-list-search').addEventListener('input', renderPatientListModal);
    document.getElementById('patient-list-sort').addEventListener('change', renderPatientListModal);
    document.getElementById('patient-list-show-archived').addEventListener('change', renderPatientListModal);
    document.getElementById('modal-patient-list').addEventListener('click', e => { if (e.target.id === 'modal-patient-list') document.getElementById('modal-patient-list').classList.add('hidden'); });

    // ===== 学習データ管理（パスワード保護） =====
    // 分類ボード／総合アセスメント表とは別の入り口（ヘッダーの「学習データ管理」ボタン）から、
    // 全利用者共有の学習内容（learningUserDict）を一覧・編集・削除できるようにする。
    // 保存・読み込みは個別ファイルを都度作るのではなく、サーバー側の学習専用ファイル
    // （data/learning-dict.json）に自動で反映される（ページを開いた時に自動読込／変更のたびに自動保存）。
    const ADMIN_PASSWORD = '1739';
    // 一度パスワードを通したら、このタブを閉じて新しくページを開き直すまでは再入力を求めない。
    // （sessionStorageなので、リロードでは保持され、新しいタブ/ウィンドウで開き直すと消える＝再度パスワードが必要）
    const ADMIN_UNLOCK_KEY = 'nursing_admin_unlocked';
    const adminPasswordModal = document.getElementById('modal-admin-password');
    const adminPasswordInput = document.getElementById('input-admin-password');
    const adminPasswordError = document.getElementById('admin-password-error');
    const adminModal = document.getElementById('modal-admin');

    function openAdminPasswordModal() {
      adminPasswordInput.value = '';
      adminPasswordError.classList.add('hidden');
      adminPasswordModal.classList.remove('hidden');
      setTimeout(() => adminPasswordInput.focus(), 30);
    }
    function closeAdminPasswordModal() { adminPasswordModal.classList.add('hidden'); }
    function switchAdminTab(tab) {
      const isList = tab === 'list', isHistory = tab === 'history', isCaselog = tab === 'caselog', isExtraction = tab === 'extraction', isReports = tab === 'reports', isCriteria = tab === 'criteria';
      document.getElementById('admin-tab-btn-list').classList.toggle('active', isList);
      document.getElementById('admin-tab-btn-history').classList.toggle('active', isHistory);
      document.getElementById('admin-tab-btn-caselog').classList.toggle('active', isCaselog);
      document.getElementById('admin-tab-btn-extraction').classList.toggle('active', isExtraction);
      document.getElementById('admin-tab-btn-reports').classList.toggle('active', isReports);
      document.getElementById('admin-tab-btn-criteria').classList.toggle('active', isCriteria);
      document.getElementById('admin-panel-list').classList.toggle('hidden', !isList);
      document.getElementById('admin-panel-list').classList.toggle('flex', isList);
      document.getElementById('admin-panel-history').classList.toggle('hidden', !isHistory);
      document.getElementById('admin-panel-history').classList.toggle('flex', isHistory);
      document.getElementById('admin-panel-caselog').classList.toggle('hidden', !isCaselog);
      document.getElementById('admin-panel-caselog').classList.toggle('flex', isCaselog);
      document.getElementById('admin-panel-extraction').classList.toggle('hidden', !isExtraction);
      document.getElementById('admin-panel-extraction').classList.toggle('flex', isExtraction);
      document.getElementById('admin-panel-reports').classList.toggle('hidden', !isReports);
      document.getElementById('admin-panel-reports').classList.toggle('flex', isReports);
      document.getElementById('admin-panel-criteria').classList.toggle('hidden', !isCriteria);
      document.getElementById('admin-panel-criteria').classList.toggle('flex', isCriteria);
      if (isHistory) renderAdminHistoryList();
      if (isCaselog) loadAndRenderCaseLog();
      if (isExtraction) loadAndRenderExtractionLog();
      if (isReports) loadAndRenderCardReports();
      // 抽出基準タブを開くたびに再取得し、他端末が追加・編集した内容も見えるようにする
      if (isCriteria) { editingCriteriaId = null; loadSharedCriteria(); }
    }
    function openAdminPanel() {
      document.getElementById('admin-learning-search').value = '';
      document.getElementById('admin-history-search').value = '';
      renderAdminLearningList();
      switchAdminTab('list');
      adminModal.classList.remove('hidden');
    }
    function submitAdminPassword() {
      if (adminPasswordInput.value === ADMIN_PASSWORD) {
        try { sessionStorage.setItem(ADMIN_UNLOCK_KEY, '1'); } catch (e) { /* 保存できなくても今回のパスワード確認自体は成立させる */ }
        closeAdminPasswordModal();
        openAdminPanel();
      } else {
        adminPasswordError.classList.remove('hidden');
        adminPasswordInput.value = '';
        adminPasswordInput.focus();
      }
    }

    document.getElementById('btn-open-admin').addEventListener('click', () => {
      let unlocked = false;
      try { unlocked = sessionStorage.getItem(ADMIN_UNLOCK_KEY) === '1'; } catch (e) { unlocked = false; }
      if (unlocked) openAdminPanel(); else openAdminPasswordModal();
    });
    document.getElementById('btn-close-admin-password').addEventListener('click', closeAdminPasswordModal);
    document.getElementById('btn-cancel-admin-password').addEventListener('click', closeAdminPasswordModal);
    document.getElementById('btn-submit-admin-password').addEventListener('click', submitAdminPassword);
    adminPasswordInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submitAdminPassword(); } });
    adminPasswordModal.addEventListener('click', e => { if (e.target === adminPasswordModal) closeAdminPasswordModal(); });

    document.getElementById('btn-close-admin').addEventListener('click', () => adminModal.classList.add('hidden'));
    adminModal.addEventListener('click', e => { if (e.target === adminModal) adminModal.classList.add('hidden'); });
    document.getElementById('admin-learning-search').addEventListener('input', renderAdminLearningList);
    document.getElementById('admin-tab-btn-list').addEventListener('click', () => switchAdminTab('list'));
    document.getElementById('admin-tab-btn-history').addEventListener('click', () => switchAdminTab('history'));
    document.getElementById('admin-tab-btn-caselog').addEventListener('click', () => switchAdminTab('caselog'));
    document.getElementById('admin-tab-btn-extraction').addEventListener('click', () => switchAdminTab('extraction'));
    document.getElementById('admin-tab-btn-reports').addEventListener('click', () => switchAdminTab('reports'));
    document.getElementById('admin-tab-btn-criteria').addEventListener('click', () => switchAdminTab('criteria'));
    document.getElementById('admin-history-search').addEventListener('input', renderAdminHistoryList);
    document.getElementById('admin-caselog-search').addEventListener('input', renderCaseLogList);
    document.getElementById('admin-caselog-action-filter').addEventListener('change', renderCaseLogList);
    document.getElementById('admin-extraction-search').addEventListener('input', renderExtractionLogList);
    document.getElementById('admin-reports-search').addEventListener('input', renderCardReportsList);
    document.getElementById('btn-summarize-reports').addEventListener('click', summarizeCardReportsAI);

    function renderAdminLearningList() {
      const listEl = document.getElementById('admin-learning-list');
      const countEl = document.getElementById('admin-learning-count');
      const term = (document.getElementById('admin-learning-search').value || '').trim().toLowerCase();
      const dict = globalAppData.learningUserDict || {};
      let entries = Object.entries(dict).filter(([text]) => !!text);
      if (term) entries = entries.filter(([text]) => text.toLowerCase().includes(term));
      countEl.textContent = `${entries.length}件（全${Object.keys(dict).length}件）`;

      if (entries.length === 0) {
        listEl.innerHTML = '<p class="text-xs text-[var(--ink-muted)] text-center py-6">学習データがありません。</p>';
        return;
      }
      const typeColorOf = t => t === 's' ? 'var(--gold)' : (t === 'o' ? 'var(--slate)' : (t === 'unnecessary' ? 'var(--brick)' : 'var(--ink-muted)'));
      const typeLabelOf = t => t === 's' ? 'S' : (t === 'o' ? 'O' : (t === 'unnecessary' ? '不要' : t));

      const frag = document.createDocumentFragment();
      entries.forEach(([text, learned]) => {
        // typeVotes / hendersonVotes（同じ編集が繰り返された回数）があればそれを表示し、
        // 古い形式のデータ（votesを持たない）は preferredType / preferredHendersonIds をそのまま表示する。
        const typeVotes = learned?.typeVotes || {};
        const topType = pickTopVote(typeVotes) || learned?.preferredType || null;
        const typeEntries = Object.keys(typeVotes).length > 0
          ? Object.entries(typeVotes).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1])
          : (learned?.preferredType ? [[learned.preferredType, 1]] : []);
        const typeChipsHtml = typeEntries.length > 0
          ? typeEntries.map(([t, c]) => {
              const isTop = t === topType;
              return `<span class="field-chip" style="background:${isTop ? typeColorOf(t) : 'var(--line-soft)'};color:${isTop ? '#fff' : 'var(--ink-muted)'};gap:.3rem;">${escapeHtml(typeLabelOf(t))}${c > 1 ? ` ×${c}` : ''}
                <button class="vote-adjust-btn admin-vote-btn" data-text="${escapeHtml(text)}" data-kind="type" data-value="${escapeHtml(t)}" data-delta="-1" title="この分類の票を1つ減らす" style="background:transparent;border-color:currentColor;color:inherit;">−</button>
                <button class="vote-adjust-btn admin-vote-btn" data-text="${escapeHtml(text)}" data-kind="type" data-value="${escapeHtml(t)}" data-delta="1" title="この分類の票を1つ増やす" style="background:transparent;border-color:currentColor;color:inherit;">＋</button>
              </span>`;
            }).join('')
          : `<span class="field-chip" style="background:var(--ink-muted);color:#fff;">未設定</span>`;
        // 現在票の無い分類にも手動で票を追加できるよう、S/Oの追加ボタンを常に用意する
        const typeAddHtml = ['s', 'o'].filter(t => !(typeVotes[t] > 0)).map(t =>
          `<button class="vote-adjust-btn admin-vote-btn" data-text="${escapeHtml(text)}" data-kind="type" data-value="${t}" data-delta="1" title="「${typeLabelOf(t)}」の票を追加">＋${typeLabelOf(t)}</button>`
        ).join('');

        const hendersonVotes = learned?.hendersonVotes || {};
        const tagEntries = Object.keys(hendersonVotes).length > 0
          ? Object.entries(hendersonVotes).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1])
          : (learned?.preferredHendersonIds || []).map(hId => [String(hId), 1]);
        const tagChipsHtml = tagEntries.map(([hIdStr, c]) => {
          const name = hendersonNameOf(Number(hIdStr));
          return `<span class="tag-chip" style="gap:.3rem;">${escapeHtml(name)}${c > 1 ? ` ×${c}` : ''}
            <button class="vote-adjust-btn admin-vote-btn" data-text="${escapeHtml(text)}" data-kind="tag" data-value="${hIdStr}" data-delta="-1" title="このタグの票を1つ減らす">−</button>
            <button class="vote-adjust-btn admin-vote-btn" data-text="${escapeHtml(text)}" data-kind="tag" data-value="${hIdStr}" data-delta="1" title="このタグの票を1つ増やす">＋</button>
          </span>`;
        }).join('');
        const existingTagIds = new Set(tagEntries.map(([hIdStr]) => Number(hIdStr)));
        const tagAddSelectHtml = `<select class="admin-vote-add-tag-select text-[9px] bg-[var(--paper)] border border-[var(--line)] rounded-[var(--radius-sm)] px-1 py-0.5 text-[var(--ink-muted)] cursor-pointer" data-text="${escapeHtml(text)}"><option value="">＋タグの票を追加</option>${HENDERSON_NEEDS.filter(n => !existingTagIds.has(n.id)).map(n => `<option value="${n.id}">${n.name}</option>`).join('')}</select>`;

        const row = document.createElement('div');
        row.className = 'flex items-start justify-between gap-2 p-2 rounded-[var(--radius-sm)] border border-[var(--line)]';
        row.innerHTML = `
          <div class="min-w-0 flex-1">
            <div class="text-xs text-[var(--ink)] break-words">${escapeHtml(text)}</div>
            <div class="flex items-center flex-wrap gap-1 mt-1">
              ${typeChipsHtml}${typeAddHtml}
              ${tagChipsHtml}${tagAddSelectHtml}
            </div>
          </div>
          <button class="icon-btn-outline danger shrink-0 admin-delete-learning-btn" data-text="${escapeHtml(text)}" title="この学習内容を削除"><i class="fa-solid fa-trash-can"></i></button>
        `;
        frag.appendChild(row);
      });
      listEl.replaceChildren(frag);
    }

    // 学習データ管理：票数の手動修正（自動分類が明らかに間違っている/古い場合に、票を直接調整できるようにする）
    window.adjustAdminTypeVote = function(text, type, delta) {
      const learned = globalAppData.learningUserDict[text] = { ...globalAppData.learningUserDict[text] };
      learned.typeVotes = { ...(learned.typeVotes || {}) };
      learned.typeVotes[type] = Math.max(0, (learned.typeVotes[type] || 0) + delta);
      learned.preferredType = pickTopVote(learned.typeVotes);
      saveDataAndSync();
      reportLearningEvent(text, 'adjustTypeVote', { type, delta, voteCount: learned.typeVotes[type] });
      renderAdminLearningList();
    };
    window.adjustAdminHendersonVote = function(text, hId, delta) {
      const learned = globalAppData.learningUserDict[text] = { ...globalAppData.learningUserDict[text] };
      learned.hendersonVotes = { ...(learned.hendersonVotes || {}) };
      learned.hendersonVotes[hId] = Math.max(0, (learned.hendersonVotes[hId] || 0) + delta);
      learned.preferredHendersonIds = Object.entries(learned.hendersonVotes).filter(([, c]) => c > 0).map(([k]) => Number(k));
      saveDataAndSync();
      reportLearningEvent(text, 'adjustHendersonVote', { hendersonId: hId, delta, voteCount: learned.hendersonVotes[hId] });
      renderAdminLearningList();
    };
    document.getElementById('admin-learning-list').addEventListener('click', e => {
      const btn = e.target.closest('.admin-vote-btn');
      if (!btn) return;
      const { text, kind, value, delta } = btn.dataset;
      if (kind === 'type') adjustAdminTypeVote(text, value, Number(delta));
      else if (kind === 'tag') adjustAdminHendersonVote(text, Number(value), Number(delta));
    });
    document.getElementById('admin-learning-list').addEventListener('change', e => {
      const sel = e.target.closest('.admin-vote-add-tag-select');
      if (sel && sel.value) { adjustAdminHendersonVote(sel.dataset.text, Number(sel.value), 1); }
    });

    async function deleteAdminLearningEntry(text) {
      const confirmed = await openDialog({ title: 'この学習内容を削除しますか？', message: text, confirmLabel: '削除する', danger: true });
      if (!confirmed) return;
      delete globalAppData.learningUserDict[text];
      saveDataAndSync();
      reportLearningEvent(text, 'delete', {}); // フォルダ内の学習専用ファイル（data/learning-dict.json）からも削除する
      renderAdminLearningList();
      showToast('学習内容を削除しました', 'success');
    }
    // クリックされた削除ボタンのdata-text属性から対象を判定する（イベント委譲）。
    // テキストに引用符等の特殊文字が含まれてもHTML属性が壊れないよう、inline onclickではなくこちらを使う。
    document.getElementById('admin-learning-list').addEventListener('click', e => {
      const btn = e.target.closest('.admin-delete-learning-btn');
      if (btn) deleteAdminLearningEntry(btn.dataset.text);
    });

    // 学習データの保存・読み込みは、都度ファイルを作る／選ぶのではなく自動化されている：
    //   ・ページを開いた時：起動時に loadSharedLearningDict() がフォルダ内の学習専用ファイル
    //     （data/learning-dict.json）からすべてのデータを自動で読み込む。
    //   ・変更のたびに：分類・タグ付け・削除などの操作ごとに reportLearningEvent() が
    //     即座にその1ファイルへ反映する（新しいファイルは作らず、同じファイルに追加・削除する）。
    //   ・ページを閉じる時：beforeunloadで念のためまとめて同期する（通信できていなかった分の保険）。

    // 変更履歴（学習した結果、何がどう変わったか）の表示
    const ADMIN_ACTION_LABELS = { create: '新規登録', type: '分類変更', tagAdd: 'タグ追加', tagRemove: 'タグ削除', col: '欄の変更', edit: 'テキスト編集', delete: '削除', adjustTypeVote: '票の手動修正(分類)', adjustHendersonVote: '票の手動修正(タグ)', merge: 'カード統合' };
    const ADMIN_TYPE_LABELS = { s: 'S', o: 'O', unnecessary: '不要', unclassified: '未分類', undefined: '未設定' };
    function hendersonNameOf(hId) { return HENDERSON_NEEDS.find(n => n.id === hId)?.name || `項目${hId}`; }
    function assessmentColLabel(col) { return col === 'preadmission' ? '入院前' : (col === 'postadmission' ? '入院後' : (col === 'missing' ? '不足情報' : '未分類')); }
    function formatHistoryDetail(entry) {
      const p = entry.payload || {};
      switch (entry.action) {
        case 'type': return `${ADMIN_TYPE_LABELS[p.from] || '未設定'} → ${ADMIN_TYPE_LABELS[p.type] || p.type}${p.voteCount > 1 ? `（この選択は${p.voteCount}回目・×${p.voteCount}）` : ''}`;
        case 'tagAdd': return `「${hendersonNameOf(p.hendersonId)}」を追加${p.voteCount > 1 ? `（×${p.voteCount}）` : ''}`;
        case 'tagRemove': return `「${hendersonNameOf(p.hendersonId)}」を削除${typeof p.voteCount === 'number' ? `（残り×${p.voteCount}）` : ''}`;
        case 'col': return `「${hendersonNameOf(p.hendersonId)}」の欄 → ${assessmentColLabel(p.col)}`;
        case 'edit': return `「${entry.text}」→「${p.newText}」`;
        case 'create': return `初期分類: ${ADMIN_TYPE_LABELS[p.type] || p.type}${(p.hendersonIds || []).length ? ' / タグ: ' + p.hendersonIds.map(hendersonNameOf).join('、') : ''}`;
        case 'delete': return '学習内容を削除';
        case 'adjustTypeVote': return `${ADMIN_TYPE_LABELS[p.type] || p.type} の票を${p.delta > 0 ? '+1' : '-1'}（管理画面で手動修正・現在×${p.voteCount}）`;
        case 'adjustHendersonVote': return `「${hendersonNameOf(p.hendersonId)}」の票を${p.delta > 0 ? '+1' : '-1'}（管理画面で手動修正・現在×${p.voteCount}）`;
        case 'merge': return `${(p.sourceTexts || []).length}件のカードを統合 → 分類:${ADMIN_TYPE_LABELS[p.type] || p.type}${(p.hendersonIds || []).length ? ' / タグ: ' + p.hendersonIds.map(hendersonNameOf).join('、') : ''}`;
        default: return JSON.stringify(p);
      }
    }
    function renderAdminHistoryList() {
      const listEl = document.getElementById('admin-history-list');
      const countEl = document.getElementById('admin-history-count');
      const term = (document.getElementById('admin-history-search').value || '').trim().toLowerCase();
      let entries = learningHistory.slice().reverse(); // 新しい変更を上に表示
      if (term) entries = entries.filter(e =>
        e.text.toLowerCase().includes(term) ||
        formatHistoryDetail(e).toLowerCase().includes(term) ||
        (ADMIN_ACTION_LABELS[e.action] || e.action).toLowerCase().includes(term)
      );
      countEl.textContent = `${entries.length}件（全${learningHistory.length}件）`;

      if (entries.length === 0) {
        listEl.innerHTML = '<p class="text-xs text-[var(--ink-muted)] text-center py-6">まだ変更履歴がありません。カードのタイプやタグを変更すると、ここに記録されていきます。</p>';
        return;
      }
      const frag = document.createDocumentFragment();
      entries.forEach(entry => {
        const time = new Date(entry.at).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        const row = document.createElement('div');
        row.className = 'flex flex-col gap-0.5 p-2 rounded-[var(--radius-sm)] border border-[var(--line)]';
        row.innerHTML = `
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="time-chip">${escapeHtml(time)}</span>
            <span class="tag-chip">${escapeHtml(ADMIN_ACTION_LABELS[entry.action] || entry.action)}</span>
          </div>
          <div class="text-[11px] text-[var(--ink-muted)] break-words">${escapeHtml(entry.text)}</div>
          <div class="text-xs text-[var(--ink)] break-words">${escapeHtml(formatHistoryDetail(entry))}</div>
        `;
        frag.appendChild(row);
      });
      listEl.replaceChildren(frag);
    }
    document.getElementById('btn-admin-clear-history').addEventListener('click', async () => {
      const confirmed = await openDialog({ title: 'このブラウザに保存されている変更履歴を消去しますか？', message: '現在の学習内容（タグ・分類の状態）自体は消えません。', confirmLabel: '消去する', danger: true });
      if (!confirmed) return;
      learningHistory = [];
      try { localStorage.setItem(LEARNING_HISTORY_KEY, JSON.stringify(learningHistory)); } catch (e) { /* noop */ }
      renderAdminHistoryList();
      showToast('変更履歴を消去しました', 'success');
    });

    // ===== 事例ログ（case-log.json）ビューア（分析・研究用途） =====
    // サーバー側に蓄積された「いつ・何が・どう変わったか」の生ログをそのまま検索・閲覧できるようにする。
    // 変更履歴（learningHistory）はこのブラウザだけの簡易ログだが、事例ログは全利用者共有の記録。
    let cachedCaseLog = null;
    async function loadAndRenderCaseLog() {
      const listEl = document.getElementById('admin-caselog-list');
      listEl.innerHTML = `<div class="flex items-center text-[var(--ink-muted)] text-xs p-2"><i class="fa-solid fa-spinner fa-spin mr-2"></i> 事例ログを読み込み中...</div>`;
      try {
        const res = await fetch(`${API_BASE}/case-log`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        cachedCaseLog = await res.json();
      } catch (e) {
        cachedCaseLog = null;
        listEl.innerHTML = `<p class="text-xs text-[var(--brick)] text-center py-6">事例ログの取得に失敗しました（サーバーに接続できません）。</p>`;
        document.getElementById('admin-caselog-count').textContent = '';
        document.getElementById('admin-caselog-stats').textContent = '';
        return;
      }
      renderCaseLogList();
    }
    function renderCaseLogList() {
      const listEl = document.getElementById('admin-caselog-list');
      const countEl = document.getElementById('admin-caselog-count');
      const statsEl = document.getElementById('admin-caselog-stats');
      if (!Array.isArray(cachedCaseLog)) return;
      const term = (document.getElementById('admin-caselog-search').value || '').trim().toLowerCase();
      const actionFilter = document.getElementById('admin-caselog-action-filter').value;

      // 操作種別ごとの件数（全体の傾向をひと目で把握できるように）
      const actionCounts = {};
      cachedCaseLog.forEach(e => { actionCounts[e.action] = (actionCounts[e.action] || 0) + 1; });
      statsEl.textContent = `全${cachedCaseLog.length}件　` + Object.entries(actionCounts).map(([a, c]) => `${ADMIN_ACTION_LABELS[a] || a}:${c}`).join('　');

      let entries = cachedCaseLog.slice().reverse(); // 新しいものを上に
      if (actionFilter) entries = entries.filter(e => e.action === actionFilter);
      if (term) entries = entries.filter(e =>
        (e.text || '').toLowerCase().includes(term) ||
        (ADMIN_ACTION_LABELS[e.action] || e.action || '').toLowerCase().includes(term) ||
        JSON.stringify(e.payload || {}).toLowerCase().includes(term)
      );
      countEl.textContent = `${entries.length}件（全${cachedCaseLog.length}件）`;

      const MAX_RENDER = 500; // 大量ログでも画面が重くならないよう表示件数に上限を設ける
      const shown = entries.slice(0, MAX_RENDER);
      if (shown.length === 0) {
        listEl.innerHTML = '<p class="text-xs text-[var(--ink-muted)] text-center py-6">条件に一致する事例ログがありません。</p>';
        return;
      }
      const frag = document.createDocumentFragment();
      shown.forEach(entry => {
        const time = entry.at ? new Date(entry.at).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '(日時不明)';
        const row = document.createElement('div');
        row.className = 'flex flex-col gap-0.5 p-2 rounded-[var(--radius-sm)] border border-[var(--line)]';
        row.innerHTML = `
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="time-chip">${escapeHtml(time)}</span>
            <span class="tag-chip">${escapeHtml(ADMIN_ACTION_LABELS[entry.action] || entry.action || '不明')}</span>
          </div>
          <div class="text-[11px] text-[var(--ink-muted)] break-words">${escapeHtml(entry.text || '')}</div>
          <div class="text-xs text-[var(--ink)] break-words font-mono">${escapeHtml(JSON.stringify(entry.payload || {}))}</div>
        `;
        frag.appendChild(row);
      });
      if (entries.length > MAX_RENDER) {
        const note = document.createElement('p');
        note.className = 'text-[10px] text-[var(--ink-muted)] text-center py-2';
        note.textContent = `※ 表示件数が多いため最新${MAX_RENDER}件のみ表示しています（検索・絞り込みで対象を狭めてください）`;
        frag.appendChild(note);
      }
      listEl.replaceChildren(frag);
    }

    // ===== 抽出前の文章ビューア（extraction-log.json）=====
    // 患者カルテ本体(patients.json)のsourceTextはその患者の最新の1回分しか保持しないため、
    // 「分類開始」を押すたびに、その時点の入力欄の文章をそのまま蓄積しておく別の履歴を表示する。
    // 事例ログと同様、全利用者共有・閲覧のみ（削除機能は無い）。
    let cachedExtractionLog = null;
    async function loadAndRenderExtractionLog() {
      const listEl = document.getElementById('admin-extraction-list');
      listEl.innerHTML = `<div class="flex items-center text-[var(--ink-muted)] text-xs p-2"><i class="fa-solid fa-spinner fa-spin mr-2"></i> 抽出前の文章を読み込み中...</div>`;
      try {
        const res = await fetch(`${API_BASE}/extraction-log`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        cachedExtractionLog = await res.json();
      } catch (e) {
        cachedExtractionLog = null;
        listEl.innerHTML = `<p class="text-xs text-[var(--brick)] text-center py-6">抽出前の文章の取得に失敗しました（サーバーに接続できません）。</p>`;
        document.getElementById('admin-extraction-count').textContent = '';
        return;
      }
      renderExtractionLogList();
    }
    function renderExtractionLogList() {
      const listEl = document.getElementById('admin-extraction-list');
      const countEl = document.getElementById('admin-extraction-count');
      if (!Array.isArray(cachedExtractionLog)) return;
      const term = (document.getElementById('admin-extraction-search').value || '').trim().toLowerCase();

      let entries = cachedExtractionLog.slice().reverse(); // 新しいものを上に
      if (term) entries = entries.filter(e =>
        (e.text || '').toLowerCase().includes(term) ||
        (e.patientTitle || '').toLowerCase().includes(term)
      );
      countEl.textContent = `${entries.length}件（全${cachedExtractionLog.length}件）`;

      const MAX_RENDER = 200; // 抽出前の文章は1件が長文になりやすいため、事例ログより控えめな上限にする
      const shown = entries.slice(0, MAX_RENDER);
      if (shown.length === 0) {
        listEl.innerHTML = '<p class="text-xs text-[var(--ink-muted)] text-center py-6">条件に一致する抽出前の文章がありません（「分類開始」を押すと、ここに記録されていきます）。</p>';
        return;
      }
      const frag = document.createDocumentFragment();
      shown.forEach(entry => {
        const time = entry.at ? new Date(entry.at).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '(日時不明)';
        const row = document.createElement('div');
        row.className = 'flex flex-col gap-1 p-2 rounded-[var(--radius-sm)] border border-[var(--line)]';
        row.innerHTML = `
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="time-chip">${escapeHtml(time)}</span>
            ${entry.patientTitle ? `<span class="tag-chip">${escapeHtml(entry.patientTitle)}</span>` : ''}
            ${typeof entry.extractedCount === 'number' ? `<span class="field-chip" style="background:var(--accent-soft);color:var(--accent-dark);">${entry.extractedCount}件抽出</span>` : ''}
          </div>
          <pre class="text-xs text-[var(--ink)] whitespace-pre-wrap break-words font-sans bg-[var(--paper)] border border-[var(--line-soft)] rounded-[var(--radius-sm)] p-2" style="max-height:180px; overflow-y:auto;">${escapeHtml(entry.text || '')}</pre>
        `;
        frag.appendChild(row);
      });
      if (entries.length > MAX_RENDER) {
        const note = document.createElement('p');
        note.className = 'text-[10px] text-[var(--ink-muted)] text-center py-2';
        note.textContent = `※ 表示件数が多いため最新${MAX_RENDER}件のみ表示しています（検索で対象を狭めてください）`;
        frag.appendChild(note);
      }
      listEl.replaceChildren(frag);
    }

    // 「分類開始」を押すたびに、抽出前の生の文章をそのままサーバーへ記録する（研究用の履歴）。
    // 患者カルテのsourceTextと違い、こちらは上書きせずに積み上げていく。
    async function reportExtractionLog(patient, text, extractedCount) {
      try {
        await fetch(`${API_BASE}/extraction-log`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patientId: patient.id, patientTitle: patient.title, text, extractedCount, at: new Date().toISOString() })
        });
      } catch (e) {
        console.warn('抽出前の文章の記録に失敗しました（サーバー未接続の場合は保存されません）:', e);
      }
    }

    // ===== 情報カードの不具合報告ビューア（card-reports.json）=====
    // カード右上の旗アイコンから送られた「この情報カードの書き込みが変だ」という内容の一覧。
    // 事例ログ・抽出前の文章と同様、全利用者共有・閲覧のみ（削除機能は無い）。
    // 同じ人がページを閉じるまでに送った複数件は、サーバー側で1つのレコード（items配列）にまとめられている。
    let cachedCardReports = null;
    async function loadAndRenderCardReports() {
      const listEl = document.getElementById('admin-reports-list');
      listEl.innerHTML = `<div class="flex items-center text-[var(--ink-muted)] text-xs p-2"><i class="fa-solid fa-spinner fa-spin mr-2"></i> 報告を読み込み中...</div>`;
      document.getElementById('admin-reports-summary').classList.add('hidden');
      cachedReportSummaryLines = []; // タブを開き直したら前回の要約結果（行番号）は破棄する
      try {
        const res = await fetch(`${API_BASE}/card-reports`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        cachedCardReports = await res.json();
      } catch (e) {
        cachedCardReports = null;
        listEl.innerHTML = `<p class="text-xs text-[var(--brick)] text-center py-6">報告の取得に失敗しました（サーバーに接続できません）。</p>`;
        document.getElementById('admin-reports-count').textContent = '';
        return;
      }
      renderCardReportsList();
    }

    function renderCardReportsList() {
      const listEl = document.getElementById('admin-reports-list');
      const countEl = document.getElementById('admin-reports-count');
      if (!Array.isArray(cachedCardReports)) return;
      const term = (document.getElementById('admin-reports-search').value || '').trim().toLowerCase();

      let groups = cachedCardReports.slice().reverse(); // 新しい投稿を上に
      if (term) groups = groups.filter(g =>
        (g.patientTitle || '').toLowerCase().includes(term) ||
        (g.items || []).some(it => (it.cardText || '').toLowerCase().includes(term) || (it.comment || '').toLowerCase().includes(term))
      );
      const totalItems = cachedCardReports.reduce((sum, g) => sum + (g.items?.length || 0), 0);
      countEl.textContent = `${groups.length}件の投稿（全${cachedCardReports.length}件・報告${totalItems}件）`;

      if (groups.length === 0) {
        listEl.innerHTML = '<p class="text-xs text-[var(--ink-muted)] text-center py-6">条件に一致する報告がありません（カードの旗アイコンから送ると、ここに記録されていきます）。</p>';
        return;
      }
      const frag = document.createDocumentFragment();
      groups.forEach(group => {
        const time = group.updatedAt ? new Date(group.updatedAt).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '(日時不明)';
        const row = document.createElement('div');
        row.className = 'flex flex-col gap-1.5 p-2 rounded-[var(--radius-sm)] border border-[var(--line)]';
        const itemsHtml = (group.items || []).map(it => `
          <div class="pl-2 border-l-2 border-[var(--brick-soft)] flex flex-col gap-0.5">
            <p class="text-xs text-[var(--ink)] break-words">${escapeHtml(it.cardText || '')}</p>
            ${it.comment ? `<p class="text-[11px] text-[var(--brick)] break-words"><i class="fa-solid fa-comment-dots mr-1"></i>${escapeHtml(it.comment)}</p>` : ''}
          </div>
        `).join('');
        row.innerHTML = `
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="time-chip">${escapeHtml(time)}</span>
            ${group.patientTitle ? `<span class="tag-chip">${escapeHtml(group.patientTitle)}</span>` : ''}
            <span class="field-chip" style="background:var(--brick-soft);color:var(--brick);">${(group.items || []).length}件の報告（1人分の投稿）</span>
          </div>
          <div class="flex flex-col gap-1.5">${itemsHtml}</div>
        `;
        frag.appendChild(row);
      });
      listEl.replaceChildren(frag);
    }

    // 「AIで要約」：寄せられた報告全体をGeminiに渡し、不具合パターンごとの修正指示を1行1件で
    // 生成する。各行はそのまま「抽出・分類基準への追加の要望」として単体で意味が通る文にしてもらい、
    // 行ごとに「基準に追加」ボタンを添えることで、報告→要約→ワンクリックでの基準反映まで
    // その場で完結できるようにする（extraction-criteria.jsonへの追加はaddExtraCriteria()を再利用）。
    let cachedReportSummaryLines = [];
    async function summarizeCardReportsAI() {
      if (!Array.isArray(cachedCardReports) || cachedCardReports.length === 0) return showToast('要約できる報告がありません', 'error');
      if (!globalAppData.apiKey) return showToast('API設定からGemini APIキーを入力してください', 'error');

      const summaryEl = document.getElementById('admin-reports-summary');
      summaryEl.classList.remove('hidden');
      summaryEl.innerHTML = `<div class="flex items-center text-[var(--brick)]"><i class="fa-solid fa-spinner fa-spin mr-2"></i> 寄せられた報告をAIで要約中...</div>`;

      const reportTexts = cachedCardReports.flatMap(g => (g.items || []).map(it =>
        `カード内容: ${it.cardText}${it.comment ? ` ／ 報告コメント: ${it.comment}` : ''}`
      )).join('\n');

      try {
        const text = await callGeminiAI([{ role: "user", parts: [{ text: `あなたはこの看護アセスメント支援システムの開発者です。以下は現場の利用者から寄せられた、情報カードの抽出・分類（S/O判定、ヘンダーソンタグ、検査値と単位の切り分けなど）に関する不具合報告の一覧です。よくある不具合のパターンごとに、「どう直すべきか」の指示文を1パターンにつき1行で書いてください。それぞれの行は、抽出・分類AIへの指示文としてその1行だけを渡しても意味が通るように、具体的かつ自己完結した文にしてください。出力は1行1パターンの指示文のみとし、見出し・番号・記号・前置きや説明文は付けないでください。\n【報告一覧】\n${reportTexts}` }] }]);
        // 番号・記号・空行を取り除き、1行=1件の指示文として扱う
        cachedReportSummaryLines = text.split('\n')
          .map(line => line.replace(/^[\s・\-*0-9.、）)]+/, '').trim())
          .filter(line => line.length > 0);
        renderReportSummaryLines();
      } catch (err) {
        console.warn('報告の要約エラー:', err);
        cachedReportSummaryLines = [];
        summaryEl.innerHTML = `<span class="text-[var(--brick)]">要約中にエラーが発生しました（${escapeHtml(err.message || '通信エラー')}）。APIキーや通信状況をご確認ください。</span>`;
      }
    }

    function renderReportSummaryLines() {
      const summaryEl = document.getElementById('admin-reports-summary');
      if (cachedReportSummaryLines.length === 0) {
        summaryEl.innerHTML = `<p class="text-xs text-[var(--ink-muted)]">要約結果を生成できませんでした。もう一度お試しください。</p>`;
        return;
      }
      summaryEl.innerHTML = `
        <p class="text-[10px] text-[var(--ink-muted)] mb-1.5">パターンごとの修正指示です。「基準に追加」を押すと、その行がそのまま「抽出・分類基準への追加の要望」として登録され、全員に共有されます。</p>
        <div class="flex flex-col gap-1.5">
          ${cachedReportSummaryLines.map((line, i) => `
            <div class="flex items-start gap-2 p-1.5 rounded-[var(--radius-sm)] border border-[var(--line-soft)]" style="background:var(--surface);">
              <span class="flex-1 text-xs text-[var(--ink)] break-words">${escapeHtml(line)}</span>
              <button id="btn-add-summary-line-${i}" onclick="addSummaryLineToCriteria(${i})" class="btn btn-outline shrink-0" style="padding:2px 8px;font-size:10px;"><i class="fa-solid fa-plus mr-1"></i>基準に追加</button>
            </div>
          `).join('')}
        </div>
      `;
    }

    // 要約結果の1行を、抽出・分類基準への追加の要望としてそのまま登録する（addExtraCriteriaを再利用）。
    // 登録後はボタンを「追加済み」表示に変え、誤って同じ内容を二重登録しないようにする。
    window.addSummaryLineToCriteria = async function(idx) {
      const line = cachedReportSummaryLines[idx];
      if (!line) return;
      const btn = document.getElementById(`btn-add-summary-line-${idx}`);
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
      const ok = await addExtraCriteria(line);
      if (ok) {
        showToast('抽出・分類基準への追加の要望として登録しました', 'success');
        if (btn) { btn.innerHTML = '<i class="fa-solid fa-check mr-1"></i>追加済み'; btn.style.opacity = '0.6'; btn.style.cursor = 'default'; }
      } else if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-plus mr-1"></i>基準に追加';
      }
    };

    DOM.tabSoBoard.addEventListener('click', () => switchView('so'));
    DOM.tabAssessment.addEventListener('click', () => switchView('assessment'));
    DOM.tabReference.addEventListener('click', () => switchView('reference'));

    function switchView(viewName) {
      DOM.viewSoBoard.classList.toggle('hidden', viewName !== 'so');
      DOM.viewAssessment.classList.toggle('hidden', viewName !== 'assessment');
      DOM.viewReference.classList.toggle('hidden', viewName !== 'reference');
      DOM.tabSoBoard.className = `tab-pill ${viewName === 'so' ? 'active' : ''}`;
      DOM.tabAssessment.className = `tab-pill ${viewName === 'assessment' ? 'active' : ''}`;
      DOM.tabReference.className = `tab-pill ${viewName === 'reference' ? 'active' : ''}`;
      if (viewName === 'assessment') renderAssessmentTable();
      if (viewName === 'reference') renderReferenceList();
    }

    // 総合アセスメント表のS/Oバッジから、分類ボード側の同じカードへジャンプして一瞬ハイライトする
    window.jumpToBoardCard = function(itemId) {
      switchView('so');
      requestAnimationFrame(() => {
        const el = document.getElementById(itemId);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('card-flash');
        setTimeout(() => el.classList.remove('card-flash'), 1600);
      });
    };

    DOM.sourceText.addEventListener('input', () => saveDataAndSync());
    document.getElementById('btn-load-sample').addEventListener('click', () => { DOM.sourceText.value = SAMPLE_TEXT; saveDataAndSync(); });

    // ==========================================================================
    // 書式付き書き出し（Word / PDF）
    // ------------------------------------------------------------------------
    // 以前はプレーンテキスト(.txt)での書き出しのみだったが、提出物としてそのまま使える
    // よう、見出し・箇条書きなどの書式を保った1つのHTML文書を組み立て、それを
    // 「Word書き出し」ではWordが直接開けるHTML形式の.docファイルとしてダウンロードし、
    // 「PDF書き出し」では新しいタブで開いてブラウザの印刷ダイアログ（PDFとして保存）を
    // 自動で呼び出す、という2通りの出口で使い回す。ライブラリ等を追加せず、ブラウザ標準の
    // 機能だけで完結する（オフラインでも動作する）。
    // AI分析結果は元々<br>や<b>タグを含むHTMLとして保持しているため、そのまま埋め込む。
    function exportHtmlOrPlaceholder(htmlStr) {
      return htmlStr ? htmlStr : '<p style="color:#776F62;">（未実施）</p>';
    }
    function exportSectionTitle(title) {
      return `<h2 style="font-size:14px;font-weight:700;border-bottom:1.5px solid #262420;padding-bottom:4px;margin:20px 0 8px;">${escapeHtml(title)}</h2>`;
    }
    function exportList(htmlLines) {
      if (htmlLines.length === 0) return `<p style="color:#776F62;">（登録なし）</p>`;
      return `<ul style="margin:0 0 8px 22px;padding:0;">${htmlLines.map(t => `<li style="margin-bottom:4px;">${t}</li>`).join('')}</ul>`;
    }

    // 患者の現在の状態から、書き出す文書のHTML本文（<body>の中身だけ）を組み立てる。
    // Word書き出し・PDF書き出しの両方でこの関数の結果をそのまま使う。
    function buildExportBodyHtml(cp) {
      const formatLineHtml = i => `<b>[${escapeHtml(i.timestamp)}]</b>${i.fieldLabel ? ` [${escapeHtml(i.fieldLabel)}]` : ''} ${escapeHtml(i.text)}`;

      let body = `<h1 style="font-size:18px;margin:0 0 4px;">看護アセスメント・記録整理シート：${escapeHtml(cp.title)}</h1>`;
      body += `<p style="color:#776F62;font-size:11px;margin:0 0 12px;">出力日時: ${escapeHtml(new Date().toLocaleString('ja-JP'))}</p>`;

      body += exportSectionTitle('1. 検査データ臨床評価・アセスメントノート');
      body += exportHtmlOrPlaceholder(DOM.labEvalContent.innerHTML);

      const structuredItems = cp.items.filter(i => i.type !== 'unnecessary' && i.fieldLabel);
      if (structuredItems.length > 0) {
        body += exportSectionTitle('2. 現病歴・既往歴・診断名・保険等');
        const lines = [];
        FIELD_LABELS.forEach(f => {
          structuredItems.filter(i => i.fieldLabel === f.key).forEach(i => lines.push(`[${escapeHtml(f.label)}] ${escapeHtml(i.text)}`));
        });
        body += exportList(lines);
      }

      body += exportSectionTitle('3. 主観的情報（Sデータ）');
      body += exportList(cp.items.filter(i => i.type === 's').map(formatLineHtml));

      body += exportSectionTitle('4. 客観的情報（Oデータ）');
      body += exportList(cp.items.filter(i => i.type === 'o').map(formatLineHtml));

      body += exportSectionTitle('5. 未分類のカード');
      body += exportList(cp.items.filter(i => i.type === 'unclassified').map(formatLineHtml));

      body += exportSectionTitle('6. ヘンダーソン14項目別アセスメント整理');
      HENDERSON_NEEDS.forEach(need => {
        const matching = cp.items.filter(i => i.type !== 'unnecessary' && i.hendersonIds?.includes(need.id));
        if (matching.length === 0) return;
        body += `<h3 style="font-size:12px;font-weight:700;margin:10px 0 4px;">${escapeHtml(need.id)}. ${escapeHtml(need.name)}</h3>`;
        body += exportList(matching.map(i => {
          const col = i.assessmentCols?.[need.id] || 'unclassified';
          const colName = col === 'preadmission' ? '入院前' : (col === 'postadmission' ? '入院後' : (col === 'missing' ? '不足情報' : '未分類'));
          return `[${colName}] [${escapeHtml(i.type.toUpperCase())}]${i.fieldLabel ? ` [${escapeHtml(i.fieldLabel)}]` : ''}${i.aiSuggested ? ' [AI推定]' : ''} ${escapeHtml(i.text)}`;
        }));
      });

      // AI分析ツールの結果（実施済みのものだけ載せる）
      if (cp.contradictionResult) { body += exportSectionTitle('7. S/O矛盾チェック結果（AI）'); body += exportHtmlOrPlaceholder(cp.contradictionResult); }
      if (cp.diagnosisResult) { body += exportSectionTitle('8. 看護診断候補（AI提案）'); body += exportHtmlOrPlaceholder(cp.diagnosisResult); }
      if (cp.timelineResult) { body += exportSectionTitle('9. 経時変化サマリー（AI）'); body += exportHtmlOrPlaceholder(cp.timelineResult); }
      if (cp.carePlanResult) { body += exportSectionTitle('10. 看護計画（AI自動生成）'); body += exportHtmlOrPlaceholder(cp.carePlanResult); }

      const notes = cp.referenceNotes || [];
      if (notes.length > 0) {
        body += exportSectionTitle('11. 参考データ');
        notes.forEach(n => {
          body += `<h3 style="font-size:12px;font-weight:700;margin:10px 0 4px;">${escapeHtml(n.title)}</h3>`;
          body += `<p style="white-space:pre-wrap;">${escapeHtml(n.text)}</p>`;
        });
      }
      return body;
    }

    // Word・PDFのどちらでも使う、文書全体（<html>〜</html>）を組み立てる。
    // MS Office独自の名前空間(xmlns:o/xmlns:w)を付けておくと、Wordがこれを見て
    // 「Word文書として開く」を自然に選べるようになる（.docファイルとして保存した場合）。
    function buildExportDocument(cp) {
      const title = escapeHtml(`${cp.title}_看護アセスメント`);
      const bodyHtml = buildExportBodyHtml(cp);
      return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  body { font-family: 'IBM Plex Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif; color: #262420; font-size: 12.5px; line-height: 1.6; }
  h1, h2, h3 { font-family: inherit; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
    }

    document.getElementById('btn-export-docs').addEventListener('click', () => {
      const cp = getCurrentPatient();
      const safeTitle = (cp.title || 'カルテ').replace(/[\\/:*?"<>|]/g, '_');
      // Wordは拡張子.docのHTMLファイルをそのまま「Word文書」として開ける（Office独自のHTML変換機能）。
      // 新しいOOXML形式(.docx)そのものではないが、追加のライブラリ無しで書式付き文書を確実に
      // 生成できる、オフラインでも動く軽量な方式のため採用している。
      const blob = new Blob(['﻿' + buildExportDocument(cp)], { type: 'application/msword;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${safeTitle}_看護アセスメント.doc`;
      a.click();
      showToast('Word文書（.doc）を自動ダウンロードしました。Word・Googleドキュメントでそのまま開けます', 'success');
    });

    document.getElementById('btn-export-pdf').addEventListener('click', () => {
      const cp = getCurrentPatient();
      const printWin = window.open('', '_blank');
      if (!printWin) {
        showToast('新しいタブを開けませんでした。ブラウザのポップアップブロックを確認してください', 'error');
        return;
      }
      printWin.document.write(buildExportDocument(cp));
      printWin.document.close();
      // 描画完了を待ってから印刷ダイアログを開く（すぐ呼ぶと空白ページのまま印刷されることがあるため）
      printWin.onload = () => { printWin.focus(); printWin.print(); };
      showToast('新しいタブに書式付き文書を開きました。印刷ダイアログの保存先で「PDFに保存」を選んでください', 'success');
    });

    function detectMultipleHendersonTags(text) {
      const tags = new Set();
      for (const need of HENDERSON_NEEDS) {
        if (need.keywords.some(kw => text.includes(kw))) {
          tags.add(need.id);
        }
      }
      return Array.from(tags);
    }

    // ==========================================================================
    // 表記ゆれの吸収（類似した文章にも学習結果を適用する）
    // ------------------------------------------------------------------------
    // 学習は基本的に完全一致で管理しているが、句読点や助詞など軽微な表記の違いで
    // せっかくの学習結果が効かないのはもったいないため、完全一致が無い場合に限り、
    // 文字2-gramのDice係数で最も近い学習済みテキストを探し、十分似ていれば
    // （しきい値以上）その学習結果を「類似学習」として適用する。
    // ==========================================================================
    const FUZZY_MATCH_THRESHOLD = 0.82; // 誤字脱字・軽微な言い回しの違いは吸収しつつ、別内容の文章とは混同しない程度の高さ
    function normalizeForFuzzyMatch(text) {
      return (text || '').replace(/[\s　、。，．・「」『』（）()\[\]【】"'".,]/g, '').toLowerCase();
    }
    function bigramSet(text) {
      const s = new Set();
      if (text.length <= 1) { if (text) s.add(text); return s; }
      for (let i = 0; i < text.length - 1; i++) s.add(text.slice(i, i + 2));
      return s;
    }
    function textSimilarity(a, b) {
      const na = normalizeForFuzzyMatch(a), nb = normalizeForFuzzyMatch(b);
      if (!na || !nb) return 0;
      if (na === nb) return 1;
      const sa = bigramSet(na), sb = bigramSet(nb);
      if (sa.size === 0 || sb.size === 0) return 0;
      let overlap = 0;
      sa.forEach(g => { if (sb.has(g)) overlap++; });
      return (2 * overlap) / (sa.size + sb.size);
    }
    // 完全一致がない場合に、学習辞書の中から最も似ているテキストを探す。
    // 辞書サイズが大きくなりすぎない前提の単純な全件走査（十分な速度で動く想定）。
    function findFuzzyLearnedMatch(text) {
      const dict = globalAppData.learningUserDict || {};
      let bestKey = null, bestScore = 0;
      for (const key of Object.keys(dict)) {
        if (!key || key === text) continue;
        const score = textSimilarity(text, key);
        if (score > bestScore) { bestScore = score; bestKey = key; }
      }
      return bestScore >= FUZZY_MATCH_THRESHOLD ? { key: bestKey, score: bestScore, learned: dict[bestKey] } : null;
    }
    // 票（typeVotes等）の最多得票が複数の値で並んでいる（拮抗している）かどうか
    function isVoteTied(votes) {
      if (!votes) return false;
      const counts = Object.values(votes).filter(c => c > 0);
      if (counts.length < 2) return false;
      const max = Math.max(...counts);
      return counts.filter(c => c === max).length > 1;
    }

    function formatLabValueString(str) {
      if (!str) return str;
      const cleaned = str.trim();
      if (/(?:\/μL|g\/dL|mg\/dL|U\/L|mEq\/L|μg\/mL|pg\/mL|%|℃|mmHg|回\/分)/.test(cleaned)) return cleaned;
      for (const [key, info] of Object.entries(LAB_STANDARDS)) {
        const match = cleaned.match(new RegExp(`^(${key})[\\s:=]+([\\d\\.,]+)`, 'i'));
        if (match) return `${match[1]} ${match[2]} ${info.unit} (基準値: ${info.ref} ${info.unit})`;
      }
      return cleaned;
    }

    function cleanExtractedPhrase(str) {
      if (!str) return '';
      let cleaned = str.trim().replace(/^[\]\)\]〕』】〉、。・,\.\-\s〜〜]+/g, '').replace(/[,\-\s〜〜（〈〔『【「『]+$/g, '');
      return formatLabValueString(cleaned);
    }

    // 前後のつながりや接続詞（「〜と話すが、〜」など）を分断せず、一塊の自然な文章として抽出
    function groupClinicalPhrasesWithTimestamps(text) {
      const extracted = [];
      let globalTimestamp = "日時不明";

      // 助詞・接続表現から始まる断片、および日付だけの断片は新規カードにしない。
      // 同じ行で直前に抜き出したカードがあれば、そこへ文章をつなぎ戻して1枚に統合する。
      // つなぎ戻す先がない場合は、情報として使えないので中途半端なカードとして残さずに捨てる。
      function pushOrMerge(fragmentText, lineStartIndex, extraProps) {
        if (UNNATURAL_START_REGEX.test(fragmentText) || DATE_ONLY_REGEX.test(fragmentText)) {
          if (extracted.length > lineStartIndex) {
            const prev = extracted[extracted.length - 1];
            prev.text = cleanExtractedPhrase(prev.text + fragmentText);
          }
          // つなぎ戻す先がない場合は破棄
          return;
        }
        extracted.push({ text: fragmentText, timestamp: globalTimestamp, ...extraProps });
      }

      text.split(/\r?\n/).forEach(line => {
        let cleanLine = line.trim();
        if (!cleanLine) return;
        // 行頭の時刻・日付・「入院時」等のマーカーは複数連続することがある
        // （例:「11:46 7月3日(金)」のようなスクリーンショットの日時表示をOCRで取り込んだ場合）ので、
        // マッチしなくなるまで繰り返し剥がす。剥がした最後のものを、その行の日時として採用する。
        const TIME_MARKER_REGEX = /^\[?(\d{1,2}[:時]\d{2}(?:分)?|(?:\d{1,4}年)?\d{1,2}月\d{1,2}日(?:\s*[\(（][月火水木金土日][\)）])?|入院時|\d+日目|検査データ)\]?\s*/;
        let marker;
        while ((marker = cleanLine.match(TIME_MARKER_REGEX))) {
          globalTimestamp = marker[1].replace(/[\[\]]/g, '');
          cleanLine = cleanLine.slice(marker[0].length).trim();
        }
        if (!cleanLine) return;

        const lineStartIndex = extracted.length;

        // 検査データの個別抽出（SpO2は "(room air)" 等の直後の注記も含めて丸ごと1枚のカードにする。
        // 各項目の単位もLAB_REGEX_SOURCEにoptionalで含まれているため、「WBC 11200/μL」のように
        // 単位まで直接書かれていても、値と単位が分かれずに1つのカードとして抽出される）
        const labRegex = new RegExp(`(${LAB_REGEX_SOURCE})`, 'gi');
        let lMatch, lSubText = cleanLine;
        while ((lMatch = labRegex.exec(cleanLine)) !== null) {
          const lClean = cleanExtractedPhrase(lMatch[0]);
          if (lClean.length >= 2) extracted.push({ text: lClean, timestamp: globalTimestamp, isLabOrVital: true });
          lSubText = lSubText.replace(lMatch[0], '');
        }
        // 値を抜いた後に残る空カッコや連続する読点・句点など、不自然な残骸を整える
        lSubText = lSubText
          .replace(/[\(（]\s*[\)）]/g, '')
          .replace(/[、。](?=[、。])/g, '')
          .trim();

        // 現病歴・既往歴・診断名・保険・入院日・主訴などの見出しラベル付き項目を、日時と同様に構造化して切り出す
        // 「現病歴：」のようなコロン付きだけでなく、「現病歴は」「現病歴」(コロンなし)でも検出する
        const fieldRegex = new RegExp(FIELD_LABEL_REGEX_SOURCE, 'g');
        const fieldMatches = [];
        let fMatch;
        while ((fMatch = fieldRegex.exec(lSubText)) !== null) {
          fieldMatches.push({ key: fMatch[1], start: fMatch.index, contentStart: fMatch.index + fMatch[0].length });
        }

        if (fieldMatches.length > 0) {
          // 最初のラベルより前にある文章はそのまま一般カードとして残す（不自然な始まりなら直前カードへ統合）
          const leading = lSubText.slice(0, fieldMatches[0].start).trim();
          if (leading) {
            const cleanedLeading = cleanExtractedPhrase(leading.replace(/^(?:入院時[、,]?)?(?:患者は|本日は)?/, ''));
            if (cleanedLeading.length >= 2) pushOrMerge(cleanedLeading, lineStartIndex, { isPhrase: true });
          }
          fieldMatches.forEach((m, idx) => {
            const hardEnd = idx + 1 < fieldMatches.length ? fieldMatches[idx + 1].start : lSubText.length;
            // 見出しの内容は基本的に最初の句点「。」までとし、それ以降は無関係な別の文として切り離す
            // （読点「、」は同じ文の中の列挙とみなし、句点が出るまでは１つの内容として扱う）
            const periodIdx = lSubText.indexOf('。', m.contentStart);
            const segmentEnd = (periodIdx !== -1 && periodIdx < hardEnd) ? periodIdx + 1 : hardEnd;
            const content = cleanExtractedPhrase(lSubText.slice(m.contentStart, segmentEnd).replace(/[、。]\s*$/, ''));
            if (content.length >= 1) extracted.push({ text: content, timestamp: globalTimestamp, fieldLabel: m.key });
            // 見出しの内容にも次の見出しにも属さない残りの文章は、一般カードとして別に拾う
            if (segmentEnd < hardEnd) {
              const leftover = cleanExtractedPhrase(lSubText.slice(segmentEnd, hardEnd));
              if (leftover.length >= 2) pushOrMerge(leftover, lineStartIndex, { isPhrase: true });
            }
          });
          return;
        }

        // 行全体の文脈（引用や「〜と話すが、〜」などの接続表現を含む塊）をそのまま一つの文章として保持
        // （不自然な始まりなら、同じ行で直前に抜き出したカード＝多くは検査値カードへ文章をつなぎ戻す）
        let remainderText = lSubText.trim();
        remainderText = remainderText.replace(/^(?:入院時[、,]?)?(?:患者は|本日は)?/, '').trim();
        const remainder = cleanExtractedPhrase(remainderText);
        if (remainder.length >= 2) {
          pushOrMerge(remainder, lineStartIndex, { isPhrase: true });
        }
      });
      return extracted;
    }

    document.getElementById('btn-start-classify').addEventListener('click', async () => {
      const text = DOM.sourceText.value.trim();
      if (!text) return showToast('文章を入力してください', 'error');
      const cp = getCurrentPatient();

      if (globalAppData.apiKey && globalAppData.notebookContent) {
        showToast('NotebookLM基準ノートに基づいて高精度分類中...', 'info');
        try {
          const prompt = `あなたは看護アセスメント支援AIです。以下の公式「NotebookLM基準ノート」を根拠として、カルテ・記録から重要な所見、患者発言、検査値を抽出してJSON形式（配列）で返してください。
各要素には "text", "timestamp", "type" ("s", "o", "unnecessary"), "hendersonIds" (1〜14の適切な複数タグ配列。関連する項目がない場合は空配列), "fieldLabel" (該当する場合のみ ${FIELD_LABEL_KEYS} のいずれか1つ、該当しなければ null) を含めてください。
※「〜と話すが、〜」などの接続表現や患者発言は分断せず、前後の文脈がつながった1つの自然な文章として抽出してください。
※血液検査データは正しい単位と基準値レンジを記載してください。
※「現病歴：」「既往歴：」「家族関係：」「生活歴：」「診断名：」「保険：」のように見出し付きで記載されている情報は、見出し部分を除いた本文のみを text とし、見出し名を fieldLabel に入れて1項目として切り出してください（日時の切り出しと同じ要領です）。
※「7月3日(金)」「11:46」のような日付・時刻だけの断片は、それ単体では意味のある情報にならないため、text として抽出しないでください（その日時は前後の所見の timestamp として扱ってください）。前後の文章とつながらず日付・時刻しか残らない場合は、その項目自体を出力しないでください。
※血液検査データ・バイタルサイン（WBC, CRP, Hb, BUN, Cre, Na, K 等）は、栄養・代謝状態の指標としてhendersonIdsに原則2(食事)を含めてください。他により適切なタグがあれば、それに加えて2も含めてください。

【NotebookLM 基準ノート】
${buildEffectiveNotebookContent()}

【カルテ・記録テキスト】
${text}

出力は余計な解説を含めず、必ず有効なJSON配列のみを出力してください。`;

          const aiText = await callGeminiAI([{ role: "user", parts: [{ text: prompt }] }]);
          const jsonMatch = aiText.match(/\[\s*\{[\s\S]*\}\s*\]/);
          if (jsonMatch) {
            let added = 0;
            JSON.parse(jsonMatch[0]).forEach(pi => {
              if (!pi.text) return;
              const cleanedText = cleanExtractedPhrase(pi.text);
              if (cleanedText.length < 2) return;
              // 日付・時刻だけの断片はプロンプトで除外を指示しているが、AIが誤って出力した場合に備え、
              // ローカル抽出（groupClinicalPhrasesWithTimestamps）と同じ条件で二重にフィルタする。
              if (DATE_ONLY_REGEX.test(cleanedText)) return;
              const itemTimestamp = pi.timestamp || "日時不明";
              if (!cp.items.some(i => i.text === cleanedText && i.timestamp === itemTimestamp)) {
                // 過去にユーザーが手直しした学習結果（完全一致 → 表記ゆれ類似の順）を調べる。
                // NotebookLM基準ノートに基づくAIの判定を「基準」としつつ、ここで見つかった学習結果を
                // 完全に置き換えるのではなく統合する（下のタグ・分類それぞれの扱いを参照）。
                let userLearned = globalAppData.learningUserDict[cleanedText];
                let predictionSource = null, isFuzzyMatch = false;
                if (userLearned && (userLearned.preferredType || userLearned.preferredHendersonIds?.length)) {
                  predictionSource = isVoteTied(userLearned.typeVotes) ? 'tied' : 'learned';
                } else {
                  const fuzzy = findFuzzyLearnedMatch(cleanedText);
                  if (fuzzy && fuzzy.learned && (fuzzy.learned.preferredType || fuzzy.learned.preferredHendersonIds?.length)) {
                    userLearned = fuzzy.learned;
                    isFuzzyMatch = true;
                    predictionSource = isVoteTied(userLearned.typeVotes) ? 'tied' : 'fuzzy';
                  } else {
                    userLearned = null;
                  }
                }
                // タグは複数持てるため、AIの判定と学習結果のどちらか一方を切り捨てず、両方を合わせて採用する
                // （NotebookLM基準ノートに基づく判定を土台に、学習結果で見つかったタグを積み増す統合方式）。
                const aiHIds = pi.hendersonIds?.length ? pi.hendersonIds : detectMultipleHendersonTags(cleanedText);
                const hIds = Array.from(new Set([...aiHIds, ...(userLearned?.preferredHendersonIds || [])]));
                // 検査値・バイタルサインには原則食事(2)タグを補うが、この文章について既に学習結果がある場合は
                // （あえて外した、等の）ユーザーの判断を尊重してここでは追加しない
                if (!userLearned && LAB_VALUE_TEST_REGEX.test(cleanedText) && !hIds.includes(2)) hIds.push(2);
                const aCols = {};
                hIds.forEach(hid => aCols[hid] = userLearned?.preferredCols?.[hid] || 'unclassified');
                const validFieldLabel = FIELD_LABELS.some(f => f.key === pi.fieldLabel) ? pi.fieldLabel : null;
                const fallbackType = validFieldLabel ? (FIELD_LABELS.find(f => f.key === validFieldLabel)?.type || 'o') : 'unclassified';
                // 分類(S/O/不要)は複数の値を同時に持てないため統合はできない。完全一致する学習結果がある場合のみ
                // その判断を優先し、表記ゆれ類似(fuzzy)の場合は精度が落ちるため分類についてはAIの判定を基準のまま活かす
                // （タグは上でfuzzyの結果も含めて統合済み）。
                const itemType = (!isFuzzyMatch && userLearned?.preferredType) || pi.type || fallbackType;
                cp.items.push({ id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6), text: cleanedText, timestamp: itemTimestamp, type: itemType, hendersonIds: hIds, assessmentCols: aCols, fieldLabel: validFieldLabel, predictionSource: predictionSource || undefined, _touchedAt: new Date().toISOString() });
                added++;
              }
            });
            saveDataAndSync();
            reportExtractionLog(cp, text, added);
            return showToast(`NotebookLM基準により${added}件を高精度抽出しました`, 'success');
          }
        } catch (e) {
          console.warn('Notebook AI fallback:', e);
          showToast('AI高精度分類に失敗したため簡易ルールで分類します', 'error');
        }
      }

      let addedCount = 0;
      groupClinicalPhrasesWithTimestamps(text).forEach(chunk => {
        const cleanedText = cleanExtractedPhrase(chunk.text);
        if (cleanedText.length < 2 || cp.items.some(i => i.text === cleanedText && i.timestamp === chunk.timestamp)) return;
        let userLearned = globalAppData.learningUserDict[cleanedText]; // ロード時に共有学習辞書とマージ済み
        let predictionSource = null;
        let fuzzyMatchedText = null;
        if (userLearned && (userLearned.preferredType || userLearned.preferredHendersonIds?.length)) {
          predictionSource = isVoteTied(userLearned.typeVotes) ? 'tied' : 'learned';
        } else {
          // 完全一致がなければ、表記ゆれ（言い回し・句読点の違い）が近い学習済みの文章を探す
          const fuzzy = findFuzzyLearnedMatch(cleanedText);
          if (fuzzy && fuzzy.learned && (fuzzy.learned.preferredType || fuzzy.learned.preferredHendersonIds?.length)) {
            userLearned = fuzzy.learned;
            fuzzyMatchedText = fuzzy.key;
            predictionSource = isVoteTied(userLearned.typeVotes) ? 'tied' : 'fuzzy';
          }
        }
        // タグは複数持てるため、固定キーワード辞書での判定結果と過去の学習結果のどちらかを切り捨てず、
        // 両方を合わせて採用する（固定ルールを土台に、学習結果で見つかったタグを積み増す統合方式。
        // AI抽出経路でのNotebookLM基準×学習結果の統合と同じ考え方）。
        const ruleHIds = detectMultipleHendersonTags(cleanedText);
        const detectedHIds = Array.from(new Set([...ruleHIds, ...(userLearned?.preferredHendersonIds || [])]));
        // 検査値・バイタルサインは、体力面の指標として原則ヘンダーソン2.食事（栄養・代謝状態）のタグも付与する
        // （この文章について既に学習結果がある場合は、あえて外した等のユーザーの判断を尊重してここでは追加しない）
        if (chunk.isLabOrVital && !userLearned && !detectedHIds.includes(2)) detectedHIds.push(2);
        // 分類の優先順位: ①学習結果(完全一致 → 表記ゆれ類似) → ②見出しラベル → ③固定ルール
        let predictedType = userLearned?.preferredType
          || (chunk.fieldLabel ? (FIELD_LABELS.find(f => f.key === chunk.fieldLabel)?.type || 'o') : null)
          // 表情・笑顔・顔色・様子などは、患者の発言そのものではなく看護師が客観的に観察・評価した所見なのでOデータとして扱う
          || (/["「][^"「」]+["」]/.test(cleanedText) || /訴え|発言|話す/.test(cleanedText) ? 's' : (chunk.isLabOrVital || /聴取|所見|認める|表情|笑顔|顔色|様子|WBC|CRP|Hb|回\/分|℃|mmHg|上昇/.test(cleanedText) ? 'o' : 'unclassified'));
        if (!predictionSource) predictionSource = 'rule';
        const assessmentCols = {};
        detectedHIds.forEach(hId => assessmentCols[hId] = userLearned?.preferredCols?.[hId] || 'unclassified');

        const newItem = { id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6), text: cleanedText, timestamp: chunk.timestamp || "日時不明", type: predictedType, hendersonIds: detectedHIds, assessmentCols, fieldLabel: chunk.fieldLabel || null, predictionSource, _touchedAt: new Date().toISOString() };
        cp.items.push(newItem);
        // どう自動抽出・自動分類されたかを事例ログに残す（研究用）
        reportLearningEvent(cleanedText, 'create', { type: predictedType, hendersonIds: detectedHIds, assessmentCols, fieldLabel: newItem.fieldLabel, predictionSource, fuzzyMatchedText: fuzzyMatchedText || undefined });
        addedCount++;
      });
      saveDataAndSync();
      reportExtractionLog(cp, text, addedCount);
      showToast(`${addedCount}件のデータを抽出・カード化しました`, 'success');
    });

    window.evaluateLabValuesAI = async function() {
      const cp = getCurrentPatient();
      const oItems = cp.items.filter(i => i.type === 'o');
      if (oItems.length === 0) return showToast('Oデータ（検査値やバイタル）がありません。先に分類してください', 'error');

      const labTexts = oItems.map(i => `[${i.timestamp}] ${i.text}`).join('\n');
      DOM.labEvalContent.innerHTML = `<div class="flex items-center text-[var(--accent-dark)]"><i class="fa-solid fa-spinner fa-spin mr-2"></i> NotebookLM基準に照らして検査値を評価中...</div>`;

      if (!globalAppData.apiKey) {
        setTimeout(() => {
          let evaluation = `【NotebookLM基準 検査データ臨床的評価】\n`;
          const foundWbc = labTexts.match(/WBC\s*(\d+)/i);
          const foundCrp = labTexts.match(/CRP\s*([\d\.]+)/i);
          const foundHb = labTexts.match(/Hb\s*([\d\.]+)/i);
          if (foundWbc && parseInt(foundWbc[1]) > 9000) evaluation += `・WBC (${foundWbc[1]}/μL): 基準値上限を超えており、体内で細菌感染や炎症反応が生じている可能性が示唆されます。\n`;
          if (foundCrp && parseFloat(foundCrp[1]) > 0.3) evaluation += `・CRP (${foundCrp[1]} mg/dL): 高値を示しており、急性炎症反応の存在を強く裏付ける所見です。\n`;
          if (foundHb && parseFloat(foundHb[1]) < 12.0) evaluation += `・Hb (${foundHb[1]} g/dL): 軽度貧血状態であり、組織への酸素運搬能低下に留意した観察が必要です。\n`;
          if (!foundWbc && !foundCrp && !foundHb) evaluation += `抽出されたOデータ内の検査値に基づき、ヘンダーソン14項目の生理学的バランスとバイタルサインを確認しました。`;
          
          DOM.labEvalContent.innerHTML = (cp.labEvaluationResult = evaluation.replace(/\n/g, '<br>'));
          saveDataAndSync(); showToast('検査値の評価を完了しました', 'success');
        }, 800);
        return;
      }

      try {
        const text = await callGeminiAI([{ role: "user", parts: [{ text: `あなたは熟練した看護師長・指導者です。以下の「NotebookLM 基準ノート」の検査値評価規則を根拠にして、患者のOデータに含まれる検査値やバイタルの臨床的意味を評価し、総合評価欄向けに分かりやすく解説・アセスメント文章を作成してください。\n【NotebookLM 基準ノート】\n${buildEffectiveNotebookContent()}\n【患者のOデータ一覧】\n${labTexts}\n出力は簡潔かつ専門的で、マークダウン記号を用いた分かりやすいアセスメント文章にまとめてください。` }] }]);
        DOM.labEvalContent.innerHTML = (cp.labEvaluationResult = formatAiResultHtml(text, '評価の生成に失敗しました。'));
        saveDataAndSync(); showToast('NotebookLM基準による検査値評価を完了しました', 'success');
      } catch (err) {
        console.warn('Lab evaluation error:', err);
        DOM.labEvalContent.innerHTML = `<span class="text-[var(--brick)]">評価中にエラーが発生しました（${escapeHtml(err.message || '通信エラー')}）。APIキーや通信状況をご確認ください。</span>`;
        showToast('検査値評価に失敗しました', 'error');
      }
    };

    // 「不足情報をAI推定」：入院前後の記録の差分・Oデータの医学的所見・参考データを根拠に、
    // ヘンダーソン各項目の「不足情報」欄へ "原因: ... → ...と考えられる" の形式でカードを追加する。
    window.evaluateMissingInfoAI = async function() {
      const cp = getCurrentPatient();
      const activeItems = cp.items.filter(i => i.type !== 'unnecessary');
      if (activeItems.length === 0) return showToast('カードがありません。先にカルテを分類してください', 'error');

      const oItems = activeItems.filter(i => i.type === 'o');
      const labTexts = oItems.map(i => `[${i.timestamp}] ${i.text}`).join('\n');
      const referenceText = (cp.referenceNotes || []).map(r => `【${r.title}】\n${r.text}`).join('\n\n');

      // ヘンダーソン各項目について、入院前／入院後にどんな記録があるかをまとめる
      const perNeedSummary = HENDERSON_NEEDS.map(need => {
        const matching = activeItems.filter(i => i.hendersonIds?.includes(need.id));
        if (matching.length === 0) return null;
        const pre = matching.filter(i => (i.assessmentCols?.[need.id] || 'unclassified') === 'preadmission').map(i => i.text);
        const post = matching.filter(i => (i.assessmentCols?.[need.id] || 'unclassified') === 'postadmission').map(i => i.text);
        return { id: need.id, name: need.name, pre, post };
      }).filter(Boolean);

      if (perNeedSummary.length === 0) return showToast('ヘンダーソンタグが付いたカードがありません。先にタグ付けしてください', 'error');

      showToast('入院前後の記録・医学的所見から不足情報を推定中...', 'info');

      if (!globalAppData.apiKey) {
        // ローカル簡易ルール：①入院前後どちらかの記録が欠けている項目 ②異常検査値があるのに関連項目の入院後記録がない場合
        let added = 0;
        perNeedSummary.forEach(n => {
          if (n.pre.length > 0 && n.post.length === 0) {
            pushMissingInfoCard(n.id, `原因: 入院前の記録はあるが入院後「${n.name.replace(/^\d+\.\s*/, '')}」に関する再評価の記録が見当たらない → 入院後の状態を再アセスメントして追記する必要があると考えられる`);
            added++;
          } else if (n.post.length > 0 && n.pre.length === 0) {
            pushMissingInfoCard(n.id, `原因: 入院後の記録はあるが入院前のベースラインが確認できない → 入院前の状態を家族・本人へ確認し追記する必要があると考えられる`);
            added++;
          }
        });
        const foundWbc = labTexts.match(/WBC\s*(\d+)/i);
        const foundCrp = labTexts.match(/CRP\s*([\d\.]+)/i);
        if ((foundWbc && parseInt(foundWbc[1]) > 9000) || (foundCrp && parseFloat(foundCrp[1]) > 0.3)) {
          const need1 = perNeedSummary.find(n => n.id === 1);
          if (need1 && need1.post.length === 0) {
            pushMissingInfoCard(1, `原因: WBC・CRP等の炎症所見があるが呼吸状態の入院後の記録が不足している → 呼吸数・SpO2・喘鳴の有無等の観察記録が必要と考えられる`);
            added++;
          }
        }
        saveDataAndSync();
        showToast(added > 0 ? `${added}件の不足情報を推定しました（簡易ルール）` : '入院前後の記録に明確な欠落は見つかりませんでした', added > 0 ? 'success' : 'info');
        return;
      }

      try {
        const prompt = `あなたは熟練した看護師長・指導者です。以下の患者情報をもとに、ヘンダーソン14の基本的欲求ごとに「不足している可能性が高い情報」を推定してください。
判断材料は次の3点です。
①入院前後の記録を比較し、どちらかにしか記録がない項目（記録の欠落）
②Oデータに含まれる医学的所見・検査値と、それに対応する記録の有無
③参考データ（看護基準・プロトコル等）に照らして通常確認すべきだが記録がない項目

【NotebookLM 基準ノート】
${buildEffectiveNotebookContent()}

【参考データ】
${referenceText || '(登録なし)'}

【ヘンダーソン項目ごとの入院前後の記録】
${perNeedSummary.map(n => `${n.name}\n入院前: ${n.pre.join(' / ') || '(記録なし)'}\n入院後: ${n.post.join(' / ') || '(記録なし)'}`).join('\n\n')}

【Oデータ（検査値・バイタル等）一覧】
${labTexts || '(なし)'}

各不足情報は必ず "原因: <不足に至った理由> → <補足すべき内容>と考えられる" という文言そのものを text とし、対応するヘンダーソン番号(1〜14の整数)を hendersonId とするJSON配列のみを出力してください。該当がなければ空配列 [] を返してください。余計な説明やMarkdown記号は出力しないでください。
例: [{"hendersonId":1,"text":"原因: 入院後のSpO2測定記録がない → 呼吸状態の再アセスメントが必要と考えられる"}]`;

        const aiText = await callGeminiAI([{ role: "user", parts: [{ text: prompt }] }]);
        const jsonMatch = aiText.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error('AI応答からJSONを取得できませんでした');
        const suggestions = JSON.parse(jsonMatch[0]);
        let added = 0;
        suggestions.forEach(s => {
          const hId = parseInt(s.hendersonId, 10);
          if (!HENDERSON_NEEDS.some(n => n.id === hId) || !s.text) return;
          pushMissingInfoCard(hId, s.text);
          added++;
        });
        saveDataAndSync();
        showToast(added > 0 ? `${added}件の不足情報をAIが推定しました` : 'AIは明確な不足情報を検出しませんでした', added > 0 ? 'success' : 'info');
      } catch (err) {
        console.warn('Missing info estimation error:', err);
        showToast(`不足情報の推定に失敗しました: ${err.message || '通信エラー'}`, 'error');
      }
    };

    // AI分析ツールのドロップダウンメニュー開閉
    const aiToolsToggle = document.getElementById('btn-ai-tools-toggle');
    if (aiToolsToggle) {
      aiToolsToggle.addEventListener('click', e => {
        e.stopPropagation();
        document.getElementById('ai-tools-menu').classList.toggle('hidden');
      });
      document.addEventListener('click', e => {
        const menu = document.getElementById('ai-tools-menu');
        if (menu && !menu.classList.contains('hidden') && !e.target.closest('#ai-tools-menu') && !e.target.closest('#btn-ai-tools-toggle')) menu.classList.add('hidden');
      });
    }
    window.closeAiToolsMenu = () => document.getElementById('ai-tools-menu')?.classList.add('hidden');

    // 「S/O矛盾チェック」：SデータとOデータの間で内容が食い違っていないかをAIに確認してもらう
    window.checkContradictionsAI = async function() {
      const cp = getCurrentPatient();
      const activeItems = cp.items.filter(i => i.type === 's' || i.type === 'o');
      const panel = document.getElementById('contradiction-panel');
      const content = document.getElementById('contradiction-content');
      if (activeItems.length < 2) return showToast('S/Oのカードが少ないためチェックできません', 'error');
      panel.classList.remove('hidden');
      content.innerHTML = `<div class="flex items-center text-[var(--ink-muted)]"><i class="fa-solid fa-spinner fa-spin mr-2"></i> S/Oデータの矛盾を確認中...</div>`;
      if (!globalAppData.apiKey) {
        content.innerHTML = `<span class="text-[var(--ink-muted)]">この機能はAPIキー設定時のみ利用できます（「API設定」からGemini APIキーを登録してください）。</span>`;
        return;
      }
      const list = activeItems.map(i => `[${i.type.toUpperCase()}] [${i.timestamp}] ${i.text}`).join('\n');
      try {
        const text = await callGeminiAI([{ role: "user", parts: [{ text: `あなたは熟練した看護師長です。以下は患者のSデータ（主観的情報＝患者の発言）とOデータ（客観的情報＝観察所見・検査値）の一覧です。SデータとOデータの間で内容が食い違っている、あるいは併せて考えると注意が必要な組み合わせがあれば指摘してください。矛盾が見当たらない場合はその旨を一言述べてください。\n\n【S/Oデータ一覧】\n${list}\n\n出力は簡潔な箇条書きで、根拠となった発言・所見を引用しながら記述してください。強調したい語のみ太字(**語**)にし、それ以外の記号は使わないでください。` }] }]);
        const resultText = formatAiResultHtml(text);
        content.innerHTML = resultText;
        cp.contradictionResult = resultText;
        saveDataAndSync();
        showToast('矛盾チェックが完了しました', 'success');
      } catch (err) {
        console.warn('Contradiction check error:', err);
        content.innerHTML = `<span class="text-[var(--brick)]">チェック中にエラーが発生しました（${escapeHtml(err.message || '通信エラー')}）。</span>`;
        showToast('矛盾チェックに失敗しました', 'error');
      }
    };

    // 「看護診断候補を提案」：ヘンダーソン項目別のアセスメント内容から看護診断の候補をAIに挙げてもらう
    window.suggestNursingDiagnosesAI = async function() {
      const cp = getCurrentPatient();
      const activeItems = cp.items.filter(i => i.type !== 'unnecessary');
      const panel = document.getElementById('diagnosis-panel');
      const content = document.getElementById('diagnosis-content');
      if (activeItems.length === 0) return showToast('カードがありません。先にカルテを分類してください', 'error');
      panel.classList.remove('hidden');
      content.innerHTML = `<div class="flex items-center text-[var(--ink-muted)]"><i class="fa-solid fa-spinner fa-spin mr-2"></i> アセスメント内容から看護診断候補を検討中...</div>`;
      if (!globalAppData.apiKey) {
        content.innerHTML = `<span class="text-[var(--ink-muted)]">この機能はAPIキー設定時のみ利用できます（「API設定」からGemini APIキーを登録してください）。</span>`;
        return;
      }
      const perNeedText = HENDERSON_NEEDS.map(need => {
        const matching = activeItems.filter(i => i.hendersonIds?.includes(need.id));
        if (matching.length === 0) return null;
        return `${need.name}\n` + matching.map(i => `- [${i.type.toUpperCase()}] ${i.text}`).join('\n');
      }).filter(Boolean).join('\n\n');
      if (!perNeedText) { content.innerHTML = `<span class="text-[var(--ink-muted)]">ヘンダーソンタグが付いたカードがありません。先にタグ付けしてください。</span>`; return; }
      try {
        const text = await callGeminiAI([{ role: "user", parts: [{ text: `あなたは熟練した看護師長・指導者です。以下はヘンダーソン14の基本的欲求ごとに整理された患者のアセスメント情報です。この内容から、想定される看護診断の候補を優先度が高いと思われる順に2〜4個程度提案してください。各候補には診断名・関連するアセスメント根拠・簡単な理由を含めてください。\n\n【ヘンダーソン項目別アセスメント情報】\n${perNeedText}\n\n出力は簡潔な箇条書きで、診断名のみ太字(**診断名**)で示してください。` }] }]);
        const resultText = formatAiResultHtml(text);
        content.innerHTML = resultText;
        cp.diagnosisResult = resultText;
        saveDataAndSync();
        showToast('看護診断候補の提案が完了しました', 'success');
      } catch (err) {
        console.warn('Diagnosis suggestion error:', err);
        content.innerHTML = `<span class="text-[var(--brick)]">生成中にエラーが発生しました（${escapeHtml(err.message || '通信エラー')}）。</span>`;
        showToast('看護診断候補の生成に失敗しました', 'error');
      }
    };

    // 「経時変化サマリー」：入院前後で記録がどう変化したかをヘンダーソン項目ごとにAIが要約する
    window.generateTimelineSummaryAI = async function() {
      const cp = getCurrentPatient();
      const activeItems = cp.items.filter(i => i.type !== 'unnecessary');
      const panel = document.getElementById('timeline-panel');
      const content = document.getElementById('timeline-content');
      panel.classList.remove('hidden');
      content.innerHTML = `<div class="flex items-center text-[var(--ink-muted)]"><i class="fa-solid fa-spinner fa-spin mr-2"></i> 入院前後の変化を要約中...</div>`;
      if (!globalAppData.apiKey) {
        content.innerHTML = `<span class="text-[var(--ink-muted)]">この機能はAPIキー設定時のみ利用できます（「API設定」からGemini APIキーを登録してください）。</span>`;
        return;
      }
      const perNeedText = HENDERSON_NEEDS.map(need => {
        const matching = activeItems.filter(i => i.hendersonIds?.includes(need.id));
        const pre = matching.filter(i => (i.assessmentCols?.[need.id] || 'unclassified') === 'preadmission').map(i => i.text);
        const post = matching.filter(i => (i.assessmentCols?.[need.id] || 'unclassified') === 'postadmission').map(i => i.text);
        if (pre.length === 0 && post.length === 0) return null;
        return `${need.name}\n入院前: ${pre.join(' / ') || '(記録なし)'}\n入院後: ${post.join(' / ') || '(記録なし)'}`;
      }).filter(Boolean).join('\n\n');
      if (!perNeedText) { content.innerHTML = `<span class="text-[var(--ink-muted)]">入院前・入院後に振り分けられたカードがありません。総合アセスメント表で「前」「後」に分類してください。</span>`; return; }
      try {
        const text = await callGeminiAI([{ role: "user", parts: [{ text: `あなたは熟練した看護師です。以下はヘンダーソン14の基本的欲求ごとの、入院前と入院後の記録の比較です。項目ごとに入院前後でどのように変化したかを簡潔にまとめてください。変化が読み取れない項目は省略して構いません。\n\n${perNeedText}\n\n出力は項目名のみ太字(**項目名**)にした簡潔な箇条書きでお願いします。` }] }]);
        const resultText = formatAiResultHtml(text);
        content.innerHTML = resultText;
        cp.timelineResult = resultText;
        saveDataAndSync();
        showToast('経時変化サマリーを生成しました', 'success');
      } catch (err) {
        console.warn('Timeline summary error:', err);
        content.innerHTML = `<span class="text-[var(--brick)]">生成中にエラーが発生しました（${escapeHtml(err.message || '通信エラー')}）。</span>`;
        showToast('経時変化サマリーの生成に失敗しました', 'error');
      }
    };

    // 「看護計画を自動生成」：ヘンダーソン項目別のアセスメント内容（＋看護診断候補があればそれも参考に）から
    // 観察計画(OP)・援助計画(TP)・教育計画(EP)の形で看護計画の叩き台をAIに作成してもらう
    window.generateCarePlanAI = async function() {
      const cp = getCurrentPatient();
      const activeItems = cp.items.filter(i => i.type !== 'unnecessary');
      const panel = document.getElementById('careplan-panel');
      const content = document.getElementById('careplan-content');
      if (activeItems.length === 0) return showToast('カードがありません。先にカルテを分類してください', 'error');
      panel.classList.remove('hidden');
      content.innerHTML = `<div class="flex items-center text-[var(--ink-muted)]"><i class="fa-solid fa-spinner fa-spin mr-2"></i> アセスメント内容から看護計画を作成中...</div>`;
      if (!globalAppData.apiKey) {
        content.innerHTML = `<span class="text-[var(--ink-muted)]">この機能はAPIキー設定時のみ利用できます（「API設定」からGemini APIキーを登録してください）。</span>`;
        return;
      }
      const perNeedText = HENDERSON_NEEDS.map(need => {
        const matching = activeItems.filter(i => i.hendersonIds?.includes(need.id));
        if (matching.length === 0) return null;
        return `${need.name}\n` + matching.map(i => `- [${i.type.toUpperCase()}] ${i.text}`).join('\n');
      }).filter(Boolean).join('\n\n');
      if (!perNeedText) { content.innerHTML = `<span class="text-[var(--ink-muted)]">ヘンダーソンタグが付いたカードがありません。先にタグ付けしてください。</span>`; return; }
      const diagnosisContext = cp.diagnosisResult ? `\n\n【参考：既に提案済みの看護診断候補】\n${cp.diagnosisResult.replace(/<br>/g, '\n').replace(/<\/?b>/g, '')}` : '';
      try {
        const text = await callGeminiAI([{ role: "user", parts: [{ text: `あなたは熟練した看護師・看護計画の指導者です。以下はヘンダーソン14の基本的欲求ごとに整理された患者のアセスメント情報です。この内容から、優先度の高い看護問題を1〜3個選び、それぞれについて看護計画（観察計画OP・援助計画TP・教育計画EPの3区分、各3〜5項目程度）を具体的に作成してください。\n\n【ヘンダーソン項目別アセスメント情報】\n${perNeedText}${diagnosisContext}\n\n出力形式は、看護問題ごとに「■看護問題名」を太字(**看護問題名**)で示し、その下にOP・TP・EPそれぞれの箇条書きを続けてください。個別性のある具体的な内容にし、一般論だけで終わらせないでください。` }] }]);
        const resultText = formatAiResultHtml(text);
        content.innerHTML = resultText;
        cp.carePlanResult = resultText;
        saveDataAndSync();
        showToast('看護計画を生成しました', 'success');
      } catch (err) {
        console.warn('Care plan generation error:', err);
        content.innerHTML = `<span class="text-[var(--brick)]">生成中にエラーが発生しました（${escapeHtml(err.message || '通信エラー')}）。</span>`;
        showToast('看護計画の生成に失敗しました', 'error');
      }
    };

    // 不足情報欄にAI推定カードを1件追加する共通処理（AI推定であることが分かるよう aiSuggested フラグを付ける）
    function pushMissingInfoCard(hendersonId, text) {
      const cp = getCurrentPatient();
      cp.items.push({
        id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        text, timestamp: "AI推定", type: 'o',
        hendersonIds: [hendersonId],
        assessmentCols: { [hendersonId]: 'missing' },
        aiSuggested: true,
        _touchedAt: new Date().toISOString()
      });
    }

    // ヘンダーソンタグが1つも付いていない（かつ「不要」判定でもない）カードを判定するヘルパー
    function isUntaggedItem(item) {
      return item.type !== 'unnecessary' && (!item.hendersonIds || item.hendersonIds.length === 0);
    }

    function renderSoBoard() {
      const cp = getCurrentPatient();
      const columns = { unclassified: document.createDocumentFragment(), s: document.createDocumentFragment(), o: document.createDocumentFragment(), unnecessary: document.createDocumentFragment() };
      const totalCounts = { unclassified: 0, s: 0, o: 0 };
      const shownCounts = { unclassified: 0, s: 0, o: 0 };

      // タグ未設定のカードを列の先頭に浮上させ、編集しやすくする（未設定同士・設定済み同士の並び順は維持）
      const sortedItems = cp.items
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
          const diff = (isUntaggedItem(a.item) ? 0 : 1) - (isUntaggedItem(b.item) ? 0 : 1);
          return diff !== 0 ? diff : a.index - b.index;
        })
        .map(x => x.item);

      sortedItems.forEach(item => {
        if (item.type !== 'unnecessary') totalCounts[item.type]++;
        if (!itemMatchesSearch(item, boardSearchTerm)) return; // 検索語に一致しないカードは列に表示しない
        columns[item.type].appendChild(createCardElement(item));
        if (item.type !== 'unnecessary') shownCounts[item.type]++;
      });

      Object.keys(columns).forEach(key => document.getElementById(`col-${key}`).replaceChildren(columns[key]));
      ['unclassified', 's', 'o'].forEach(key => {
        document.getElementById(`badge-count-${key}`).textContent = boardSearchTerm ? `${shownCounts[key]}/${totalCounts[key]}` : totalCounts[key];
      });
      renderBulkActionBar();
    }

    // 自動分類の確信度バッジ（学習結果が完全一致していない/割れている場合に、要確認であることを可視化する）
    function confidenceBadgeFor(predictionSource) {
      switch (predictionSource) {
        case 'fuzzy':
          return `<span class="confidence-badge confidence-fuzzy" title="表記ゆれが近い過去の学習内容から自動分類しました。内容を確認してください">類似</span>`;
        case 'tied':
          return `<span class="confidence-badge confidence-tied" title="過去の編集で票が同数のため、自動分類の確信度が低くなっています。内容を確認してください">?</span>`;
        case 'rule':
          return `<span class="confidence-badge confidence-rule" title="学習データがまだ無く、固定ルールで自動分類しました。内容を確認してください">仮</span>`;
        default:
          return '';
      }
    }

    function createCardElement(item) {
      const card = document.createElement('div');
      card.id = item.id;
      card.draggable = true;
      const isUntagged = isUntaggedItem(item);
      const isSelected = selectedCardIds.has(item.id);
      card.className = `rec-card cursor-pointer active:cursor-grabbing relative group ${item.type === 'unnecessary' ? 'opacity-60 line-through text-[var(--ink-muted)]' : ''} ${isSelected ? 'card-selected' : ''}`;
      if (isUntagged && !isSelected) card.style.cssText = 'border:1.5px solid var(--brick);background:var(--brick-soft);';
      card.ondragstart = e => { e.dataTransfer.setData('text/plain', item.id); card.classList.add('card-dragging'); };
      card.ondragend = () => card.classList.remove('card-dragging');
      // カードクリックで選択（数字キーでのタグ追加対象にする）。既に他のカードを選択中でも、
      // 別のカードをクリックするだけで選択が消えてしまわないよう、常に「そのカード自身の
      // 選択/解除だけ」を切り替える（他のカードの選択状態はそのまま保つ）。
      // ボタン・セレクト等の操作要素の上でのクリックは選択に影響させない
      // （左上のチェックボックスもinput要素なのでここで除外され、setCardSelectedだけで処理される）。
      // まとめて選択を解除したいときは、一括操作バーの「選択解除」ボタンか、Escapeキーを使う。
      card.addEventListener('click', e => {
        if (e.target.closest('button, select, a, input')) return;
        toggleCardSelection(item.id);
      });

      const tagsHtml = (item.hendersonIds || []).map(hId => {
        const need = HENDERSON_NEEDS.find(n => n.id === hId);
        return need ? `<span class="tag-chip">${need.name} <button onclick="removeHendersonTag('${item.id}', ${need.id})" class="text-[var(--accent)]/60 hover:text-[var(--brick)] transition"><i class="fa-solid fa-times"></i></button></span>` : '';
      }).join('');
      const untaggedWarningHtml = isUntagged ? `<span class="field-chip" style="background:var(--brick);color:#fff;"><i class="fa-solid fa-triangle-exclamation mr-0.5"></i>タグ未設定</span>` : '';

      const fieldDef = item.fieldLabel ? FIELD_LABELS.find(f => f.key === item.fieldLabel) : null;
      const fieldChipHtml = fieldDef ? `<span class="field-chip" style="background:${fieldDef.bg};color:${fieldDef.color};"><i class="fa-solid ${fieldDef.icon} mr-0.5"></i>${escapeHtml(fieldDef.label)}</span>` : '';
      const timeChipHtml = item.timestamp && item.timestamp !== "日時不明" ? `<span class="time-chip"><i class="fa-regular fa-clock mr-0.5"></i>${escapeHtml(item.timestamp)}</span>` : '';
      const confidenceBadgeHtml = confidenceBadgeFor(item.predictionSource);

      card.innerHTML = `
        <div class="flex items-center justify-between gap-1">
          <div class="flex items-center gap-1 flex-wrap">
            <label class="card-select-wrap" title="選択（複数選択の追加/解除。タップ操作のみで複数選択できます）">
              <input type="checkbox" class="card-select-checkbox" onchange="setCardSelected('${item.id}', this.checked)" ${isSelected ? 'checked' : ''}>
            </label>
            ${untaggedWarningHtml}${fieldChipHtml}${timeChipHtml}${confidenceBadgeHtml}
          </div>
          <div class="flex items-center space-x-0.5 ml-auto shrink-0">
            <button onclick="openCardReportModal('${item.id}')" class="icon-btn-outline" style="border-color:#EFD9CE;color:var(--brick);" title="このカードの書き込みが変だと報告する"><i class="fa-solid fa-flag"></i></button>
            <button onclick="editItemText('${item.id}')" class="icon-btn-outline" title="内容を編集"><i class="fa-solid fa-pen"></i></button>
            <button onclick="deleteItem('${item.id}')" class="icon-btn-outline danger" title="完全削除"><i class="fa-solid fa-times"></i></button>
            ${item.type !== 'unnecessary' ? `<button onclick="setItemType('${item.id}', 'unnecessary')" class="icon-btn-outline" style="border-color:#E4D9C4;color:var(--gold);" title="不要判定"><i class="fa-solid fa-ban"></i></button>` : ''}
          </div>
        </div>
        <p class="font-medium leading-snug break-words text-[var(--ink)]">${escapeHtml(item.text)}</p>
        <div class="flex flex-wrap gap-1 items-center">
          ${tagsHtml}
          <select onchange="addHendersonTagFromDropdown('${item.id}', this.value); this.value='';" class="max-w-[92px] w-auto text-[9px] bg-[var(--paper)] hover:bg-[var(--line-soft)] border ${isUntagged ? 'border-[var(--brick)]' : 'border-[var(--line)]'} rounded-[var(--radius-sm)] px-1 py-0.5 text-[var(--ink-muted)] cursor-pointer focus:outline-none mt-0.5" style="max-width:92px;"><option value="">＋ タグ追加</option>${HENDERSON_NEEDS.map(n => `<option value="${n.id}">${n.name}</option>`).join('')}</select>
        </div>
        <div class="flex items-center justify-end space-x-1 pt-1 border-t border-[var(--line-soft)]">
          ${item.type === 'unnecessary' ? `<button onclick="setItemType('${item.id}', 'unclassified')" class="type-btn type-btn-restore">復帰</button>` : ''}
          ${item.type !== 's' && item.type !== 'unnecessary' ? `<button onclick="setItemType('${item.id}', 's')" class="type-btn type-btn-s">→S</button>` : ''}
          ${item.type !== 'o' && item.type !== 'unnecessary' ? `<button onclick="setItemType('${item.id}', 'o')" class="type-btn type-btn-o">→O</button>` : ''}
        </div>
      `;
      return card;
    }

    // ==========================================================================
    // 分類ボード：カード選択・数字キーでのタグ追加・複数選択一括操作
    // ==========================================================================
    let selectedCardIds = new Set();
    let boardSearchTerm = '';

    // 常にそのカード自身の選択/非選択だけを切り替える（他のカードの選択状態には影響しない）。
    // 以前は修飾キー無しのクリックだと選択中の他のカードが巻き添えで全解除されてしまい、
    // 複数選択した状態で別のカードを押すたびに選択がリセットされる不具合の原因になっていた。
    // 選択をまとめて解除したい場合はclearSelection()（一括操作バーの「選択解除」ボタン/Escapeキー）を使う。
    function toggleCardSelection(id) {
      if (selectedCardIds.has(id)) selectedCardIds.delete(id); else selectedCardIds.add(id);
      renderSoBoard();
    }
    window.clearSelection = function() { selectedCardIds.clear(); renderSoBoard(); };

    // カード左上のチェックボックスによる選択（PC以外の環境でもタップだけで複数選択できるようにするため）。
    // Ctrl/Cmd/Shiftキーが無いスマートフォン・タブレットでも、このチェックボックスなら
    // 他のカードの選択状態を保ったまま追加/解除できる。
    window.setCardSelected = function(id, selected) {
      if (selected) selectedCardIds.add(id); else selectedCardIds.delete(id);
      renderSoBoard();
    };

    function renderBulkActionBar() {
      const bar = document.getElementById('bulk-action-bar');
      if (!bar) return;
      if (selectedCardIds.size === 0) { bar.classList.add('hidden'); return; }
      bar.classList.remove('hidden');
      document.getElementById('bulk-action-count').textContent = `${selectedCardIds.size}件選択中`;
      // 統合は2件以上選んでいる時だけ実行できる（1件以下では押せないよう見た目も含めて無効化する）
      const mergeBtn = document.getElementById('btn-bulk-merge');
      if (mergeBtn) {
        const disabled = selectedCardIds.size < 2;
        mergeBtn.disabled = disabled;
        mergeBtn.style.opacity = disabled ? '0.45' : '1';
        mergeBtn.style.pointerEvents = disabled ? 'none' : '';
        mergeBtn.style.cursor = disabled ? 'not-allowed' : 'pointer';
      }
    }

    window.bulkSetType = function(type) {
      const cp = getCurrentPatient();
      let count = 0;
      cp.items.forEach(i => { if (selectedCardIds.has(i.id)) { i.type = type; touchItem(i); count++; } });
      selectedCardIds.clear();
      saveDataAndSync();
      showToast(`${count}件を変更しました`, 'success');
    };

    window.bulkAddTag = function(hIdStr) {
      if (!hIdStr) return;
      const hId = parseInt(hIdStr, 10);
      const cp = getCurrentPatient();
      let count = 0;
      cp.items.forEach(i => {
        if (selectedCardIds.has(i.id)) {
          if (!(i.hendersonIds || (i.hendersonIds = [])).includes(hId)) { i.hendersonIds.push(hId); (i.assessmentCols = i.assessmentCols || {})[hId] = 'unclassified'; }
          touchItem(i);
          count++;
        }
      });
      // 他の一括操作（bulkSetTypeなど）と同様、操作完了後は選択を解除する。
      // ここで解除しないと、タグ追加後も一括操作バーが開いたままになってしまう。
      selectedCardIds.clear();
      saveDataAndSync();
      showToast(`${count}件に「${HENDERSON_NEEDS.find(n => n.id === hId)?.name.replace(/^\d+\.\s*/, '')}」タグを追加しました`, 'success');
    };

    // 分類ボード内のカード検索（本文・時刻・付与済みタグ名で絞り込み）
    function itemMatchesSearch(item, term) {
      if (!term) return true;
      const t = term.toLowerCase();
      if ((item.text || '').toLowerCase().includes(t)) return true;
      if (item.timestamp && item.timestamp.toLowerCase().includes(t)) return true;
      const tagNames = (item.hendersonIds || []).map(hId => HENDERSON_NEEDS.find(n => n.id === hId)?.name || '').join(' ');
      return tagNames.toLowerCase().includes(t);
    }

    const boardSearchInput = document.getElementById('board-search');
    if (boardSearchInput) boardSearchInput.addEventListener('input', e => { boardSearchTerm = e.target.value.trim(); renderSoBoard(); });

    // タグ選択肢を一括操作バーに反映（ヘンダーソン14項目は固定なので起動時に一度だけ）
    const bulkTagSelect = document.getElementById('bulk-tag-select');
    if (bulkTagSelect) HENDERSON_NEEDS.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n.id;
      opt.textContent = n.name;
      bulkTagSelect.appendChild(opt);
    });

    // カードを1件だけ選択している状態で数字キーを押すと、その数字をヘンダーソン番号としてタグ付けする
    // （0.5秒以内に2桁目が来れば10〜14として扱う。入力欄にフォーカスがある間や、分類ボード非表示時は無効）
    let keyBuffer = '';
    let keyBufferTimeout = null;
    document.addEventListener('keydown', e => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;
      if (!DOM.viewSoBoard || DOM.viewSoBoard.classList.contains('hidden')) return;
      if (e.key === 'Escape' && selectedCardIds.size > 0) { selectedCardIds.clear(); renderSoBoard(); return; }
      if (selectedCardIds.size !== 1) return;
      if (/^[0-9]$/.test(e.key)) {
        keyBuffer += e.key;
        clearTimeout(keyBufferTimeout);
        keyBufferTimeout = setTimeout(() => {
          const hId = parseInt(keyBuffer, 10);
          keyBuffer = '';
          if (hId >= 1 && hId <= 14) {
            const id = [...selectedCardIds][0];
            window.addHendersonTag(id, String(hId));
            showToast(`「${HENDERSON_NEEDS.find(n => n.id === hId)?.name.replace(/^\d+\.\s*/, '')}」タグを追加しました（数字キー）`, 'success');
          }
        }, 500);
        e.preventDefault();
      }
    });

    // ==========================================================================
    // 複数カードの統合（選択した2件以上のカードの本文を1枚にまとめる）
    // ------------------------------------------------------------------------
    // 統合後のカードは通常のカードと同じように扱われ、統合という操作自体も他の編集
    // （分類・タグ付け）と同じく共有学習に記録する。統合元それぞれが持っていた学習結果
    // （票）は合算して統合後の文章の学習結果に引き継ぎ、さらにここで選んだ分類・タグにも
    // 1票加える（＝ユーザーが確定させた内容を優先して次回以降の自動分類に使うため）。
    // 統合元の文章自体の学習結果は、他のカードで同じ文章がそのまま使われる可能性を
    // 考慮して消さずに残す。
    // ==========================================================================
    let mergeSourceItems = [];

    function joinTextsForMerge(items) {
      return items.map(i => (i.text || '').trim()).filter(Boolean).join('。');
    }

    // 統合元それぞれのtypeVotes/hendersonVotes/preferredColsを合算する（サーバー側の'merge'処理と同じロジック）
    function combineLearnedEntriesForMerge(sourceTexts) {
      const typeVotes = {}, hendersonVotes = {}, preferredCols = {};
      const seen = new Set();
      sourceTexts.forEach(t => {
        if (!t || seen.has(t)) return;
        seen.add(t);
        const e = globalAppData.learningUserDict[t];
        if (!e) return;
        Object.entries(e.typeVotes || {}).forEach(([k, v]) => { typeVotes[k] = (typeVotes[k] || 0) + v; });
        Object.entries(e.hendersonVotes || {}).forEach(([k, v]) => { hendersonVotes[k] = (hendersonVotes[k] || 0) + v; });
        Object.assign(preferredCols, e.preferredCols || {});
      });
      return { typeVotes, hendersonVotes, preferredCols };
    }

    window.openMergeModal = function() {
      const cp = getCurrentPatient();
      mergeSourceItems = cp.items.filter(i => selectedCardIds.has(i.id));
      if (mergeSourceItems.length < 2) return showToast('統合するカードを2件以上選択してください', 'info');

      document.getElementById('merge-source-count').textContent = String(mergeSourceItems.length);
      document.getElementById('merge-source-list').innerHTML = mergeSourceItems.map(i =>
        `<div class="text-[11px] text-[var(--ink-muted)] break-words p-1 border-b border-[var(--line-soft)] last:border-0">${escapeHtml(i.text)}</div>`
      ).join('');

      document.getElementById('merge-text').value = joinTextsForMerge(mergeSourceItems);

      // 分類の初期値：「不要」以外の中で最も多い分類（同数ならO）。すべて「不要」だった場合もOを初期値にする。
      const typeCounts = {};
      mergeSourceItems.forEach(i => { if (i.type !== 'unnecessary') typeCounts[i.type] = (typeCounts[i.type] || 0) + 1; });
      const defaultType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'o';
      document.querySelectorAll('input[name="merge-type"]').forEach(r => { r.checked = r.value === defaultType; });

      // タグの初期値：選択したカードのヘンダーソンタグの和集合をチェック済みにする
      const unionTagIds = new Set();
      mergeSourceItems.forEach(i => (i.hendersonIds || []).forEach(hId => unionTagIds.add(hId)));
      document.getElementById('merge-tags-list').innerHTML = HENDERSON_NEEDS.map(n => `
        <label class="flex items-center gap-1 text-[11px] text-[var(--ink)] border border-[var(--line-soft)] rounded-[var(--radius-sm)] px-1.5 py-0.5 cursor-pointer">
          <input type="checkbox" class="merge-tag-checkbox" value="${n.id}" ${unionTagIds.has(n.id) ? 'checked' : ''}> ${escapeHtml(n.name)}
        </label>
      `).join('');

      document.getElementById('modal-merge').classList.remove('hidden');
    };

    window.closeMergeModal = function() {
      document.getElementById('modal-merge').classList.add('hidden');
      mergeSourceItems = [];
    };
    document.getElementById('btn-close-merge').addEventListener('click', closeMergeModal);
    document.getElementById('btn-cancel-merge').addEventListener('click', closeMergeModal);
    document.getElementById('modal-merge').addEventListener('click', e => { if (e.target === document.getElementById('modal-merge')) closeMergeModal(); });

    document.getElementById('btn-confirm-merge').addEventListener('click', () => {
      if (mergeSourceItems.length < 2) return closeMergeModal();
      const cp = getCurrentPatient();
      const mergedText = cleanExtractedPhrase(document.getElementById('merge-text').value);
      if (!mergedText) return showToast('統合後の内容を入力してください', 'error');
      const finalType = document.querySelector('input[name="merge-type"]:checked')?.value || 'o';
      const finalHendersonIds = [...document.querySelectorAll('.merge-tag-checkbox:checked')].map(el => Number(el.value));

      // 欄(未分類/入院前/入院後/不足情報)は、統合前にそのタグを持っていたカードの割り当てを踏襲する
      const finalCols = {};
      finalHendersonIds.forEach(hId => {
        const src = mergeSourceItems.find(i => i.assessmentCols && i.assessmentCols[hId]);
        finalCols[hId] = src ? src.assessmentCols[hId] : 'unclassified';
      });

      // 見出しラベル・時刻は、統合元が全て同じ場合のみ引き継ぐ（バラバラなら統合後は空にする）
      const fieldLabels = new Set(mergeSourceItems.map(i => i.fieldLabel || null));
      const fieldLabel = fieldLabels.size === 1 ? [...fieldLabels][0] : null;
      const timestampCandidate = mergeSourceItems.find(i => i.timestamp && i.timestamp !== '日時不明')?.timestamp;

      const sourceTexts = mergeSourceItems.map(i => i.text);
      const sourceIds = new Set(mergeSourceItems.map(i => i.id));
      let insertIndex = Infinity;
      cp.items.forEach((i, idx) => { if (sourceIds.has(i.id) && idx < insertIndex) insertIndex = idx; });

      const mergedItem = {
        id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        text: mergedText,
        timestamp: timestampCandidate || '日時不明',
        type: finalType,
        hendersonIds: finalHendersonIds,
        assessmentCols: finalCols,
        fieldLabel,
        _touchedAt: new Date().toISOString(),
        predictionSource: 'confirmed'
      };

      // 学習内容の引き継ぎ：統合元それぞれの学習結果(票)を合算し、さらに今回選んだ分類・タグにも票を1つ加える。
      // タグ・欄については、統合後に実際に選ばれたタグだけに絞り込む（統合の際にあえて外したタグの
      // 残り票をそのまま持ち越すと、次回このまったく同じ文章が出てきたときに復活してしまうため）。
      // 統合元自体の学習内容（typeVotes/hendersonVotes）はここでは変更せず、そのまま残す。
      const combined = combineLearnedEntriesForMerge(sourceTexts);
      if (finalType !== 'unnecessary') combined.typeVotes[finalType] = (combined.typeVotes[finalType] || 0) + 1;
      const finalHendersonVotes = {};
      const finalPreferredCols = {};
      finalHendersonIds.forEach(hId => {
        finalHendersonVotes[hId] = (combined.hendersonVotes[hId] || 0) + 1;
        const col = finalCols[hId] || combined.preferredCols[hId];
        if (col) finalPreferredCols[hId] = col;
      });
      globalAppData.learningUserDict[mergedText] = {
        typeVotes: combined.typeVotes,
        hendersonVotes: finalHendersonVotes,
        preferredType: pickTopVote(combined.typeVotes) || finalType,
        preferredHendersonIds: Object.entries(finalHendersonVotes).filter(([, c]) => c > 0).map(([k]) => Number(k)),
        preferredCols: finalPreferredCols,
        lastMergedFrom: sourceTexts
      };

      // 統合元カードを削除し、統合後の1枚を元の並び位置に挿入する
      const removedItems = cp.items.filter(i => sourceIds.has(i.id));
      cp.items = cp.items.filter(i => !sourceIds.has(i.id));
      sourceIds.forEach(sid => markItemDeleted(cp, sid)); // 統合元は消費されて無くなるカードとして記録する
      const clampedIndex = Math.min(insertIndex, cp.items.length);
      cp.items.splice(clampedIndex, 0, mergedItem);

      const patId = cp.id;
      selectedCardIds.clear();
      closeMergeModal();
      saveDataAndSync();
      showToast(`${removedItems.length}件のカードを1枚に統合しました`, 'success');
      reportLearningEvent(mergedText, 'merge', { sourceTexts, type: finalType, hendersonIds: finalHendersonIds, cols: finalCols });
      showUndoToast('カードの統合を取り消せます', () => {
        const p = globalAppData.patients.find(x => x.id === patId);
        if (!p) return;
        p.items = p.items.filter(i => i.id !== mergedItem.id);
        markItemDeleted(p, mergedItem.id); // 統合後の1枚は取り消しにより消えるカードとして記録する
        const idx = Math.min(clampedIndex, p.items.length);
        removedItems.forEach(i => { touchItem(i); unmarkItemDeleted(p, i.id); }); // 統合元は復元された扱いにする
        p.items.splice(idx, 0, ...removedItems);
      });
    });

    // ==========================================================================
    // 情報カードの不具合報告：カード右上の旗アイコンから、「この内容の書き込みが変だ」という
    // 内容をサイト側（card-reports.json）へ送る。同じブラウザタブから送った複数件は、
    // サーバー側でcardReportSessionIdをキーに1人分の投稿としてまとめて記録される。
    // ==========================================================================
    let cardReportTargetItem = null;
    window.openCardReportModal = function(id) {
      const item = getCurrentPatient().items.find(i => i.id === id);
      if (!item) return;
      cardReportTargetItem = item;
      document.getElementById('card-report-target-text').textContent = item.text;
      document.getElementById('card-report-comment').value = '';
      document.getElementById('modal-card-report').classList.remove('hidden');
      setTimeout(() => document.getElementById('card-report-comment').focus(), 30);
    };
    window.closeCardReportModal = function() {
      document.getElementById('modal-card-report').classList.add('hidden');
      cardReportTargetItem = null;
    };
    document.getElementById('btn-close-card-report').addEventListener('click', closeCardReportModal);
    document.getElementById('btn-cancel-card-report').addEventListener('click', closeCardReportModal);
    document.getElementById('modal-card-report').addEventListener('click', e => { if (e.target === document.getElementById('modal-card-report')) closeCardReportModal(); });

    document.getElementById('btn-confirm-card-report').addEventListener('click', async () => {
      if (!cardReportTargetItem) return closeCardReportModal();
      const cp = getCurrentPatient();
      const comment = document.getElementById('card-report-comment').value.trim();
      const cardText = cardReportTargetItem.text;
      closeCardReportModal();
      try {
        await fetch(`${API_BASE}/card-reports`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: cardReportSessionId, patientId: cp.id, patientTitle: cp.title, cardText, comment })
        });
        showToast('報告を送信しました。ご協力ありがとうございます', 'success');
      } catch (e) {
        console.warn('情報カードの報告送信に失敗しました:', e);
        showToast('報告の送信に失敗しました（サーバーに接続できません）', 'error');
      }
    });

    window.editItemText = async function(id) {
      const item = getCurrentPatient().items.find(i => i.id === id);
      if (!item) return;
      const oldText = item.text;
      const newText = await openDialog({ title: 'カードの内容を編集', inputValue: item.text, confirmLabel: '更新する' });
      if (newText !== null && (item.text = cleanExtractedPhrase(newText))) {
        touchItem(item);
        saveDataAndSync(); showToast('カード内容を更新しました', 'success');
        if (item.text !== oldText) {
          // 編集前→編集後の書き換えを、そのまま事例ログ・共有学習に記録する
          reportLearningEvent(oldText, 'edit', { newText: item.text });
        }
      }
    };

    window.addHendersonTag = function(id, hIdStr) {
      if (!hIdStr) return;
      const hId = parseInt(hIdStr, 10), item = getCurrentPatient().items.find(i => i.id === id);
      if (item && !(item.hendersonIds || (item.hendersonIds = [])).includes(hId)) {
        item.hendersonIds.push(hId); item.assessmentCols[hId] = 'unclassified';
        item.predictionSource = 'confirmed'; // 人が確認・編集したことを示し、自動分類バッジを消す
        // 「同じタグ付けが何回選ばれたか」を票として数え、票のあるタグ（0票超）を優先タグとして扱う
        const learned = globalAppData.learningUserDict[item.text] = { ...globalAppData.learningUserDict[item.text] };
        learned.hendersonVotes = { ...(learned.hendersonVotes || {}) };
        learned.hendersonVotes[hId] = (learned.hendersonVotes[hId] || 0) + 1;
        learned.preferredHendersonIds = Object.entries(learned.hendersonVotes).filter(([, c]) => c > 0).map(([k]) => Number(k));
        touchItem(item);
        saveDataAndSync();
        reportLearningEvent(item.text, 'tagAdd', { hendersonId: hId, voteCount: learned.hendersonVotes[hId] });
      }
    };

    // カード自身の「＋タグ追加」ドロップダウンから設定した場合専用の呼び出し口。数字キー
    // ショートカット（同じ1枚のカードに複数のタグを続けて素早く追加する用途があり、選択状態を
    // 保つ必要がある）は引き続きaddHendersonTagを直接呼ぶため、addHendersonTag自体には手を
    // 加えない。ドロップダウンでの操作は1回で完結する行為とみなし、追加後にそのカードの選択を
    // 解除する（deleteItemと同様の扱い。これが無いと、そのカード1枚だけを選んでいた場合に
    // 一括操作バーが開いたままになってしまう。複数選択中に他のカードも選んでいた場合、
    // そちらの選択は残る）。
    window.addHendersonTagFromDropdown = function(id, hIdStr) {
      selectedCardIds.delete(id);
      window.addHendersonTag(id, hIdStr);
    };

    window.removeHendersonTag = function(id, hId) {
      const item = getCurrentPatient().items.find(i => i.id === id);
      if (item?.hendersonIds) {
        item.hendersonIds = item.hendersonIds.filter(idNum => idNum !== hId);
        delete item.assessmentCols[hId];
        item.predictionSource = 'confirmed';
        const learned = globalAppData.learningUserDict[item.text] = { ...globalAppData.learningUserDict[item.text] };
        learned.hendersonVotes = { ...(learned.hendersonVotes || {}) };
        learned.hendersonVotes[hId] = Math.max(0, (learned.hendersonVotes[hId] || 0) - 1);
        learned.preferredHendersonIds = Object.entries(learned.hendersonVotes).filter(([, c]) => c > 0).map(([k]) => Number(k));
        selectedCardIds.delete(id); // タグ追加時と同様、このカード自身の操作で選択を解除する
        touchItem(item);
        saveDataAndSync();
        reportLearningEvent(item.text, 'tagRemove', { hendersonId: hId, voteCount: learned.hendersonVotes[hId] });
      }
    };

    window.setItemType = function(id, type) {
      const item = getCurrentPatient().items.find(i => i.id === id);
      if (item) {
        const prevType = item.type;
        item.type = type;
        item.predictionSource = 'confirmed'; // 人が確認・編集したことを示し、自動分類バッジを消す
        touchItem(item);
        if (type !== 'unnecessary') {
          // 「不要」判定は分類の学習には数えない（S/Oどちらでもない一時的な判断のため）。
          // 同じ文章に同じ分類（S/O等）が繰り返し選ばれた回数を票として数え、最多得票を優先分類にする。
          const learned = globalAppData.learningUserDict[item.text] = { ...globalAppData.learningUserDict[item.text] };
          learned.typeVotes = { ...(learned.typeVotes || {}) };
          learned.typeVotes[type] = (learned.typeVotes[type] || 0) + 1;
          learned.preferredType = pickTopVote(learned.typeVotes);
          saveDataAndSync();
          const voteCount = learned.typeVotes[type];
          showToast(`分類(${type})を学習しました${voteCount > 1 ? `（×${voteCount}）` : ''}`);
          reportLearningEvent(item.text, 'type', { type, from: prevType, voteCount }); // 全利用者で共有する学習データとして送信（研究用途のため本文も含む）
        } else {
          saveDataAndSync();
          const patId = getCurrentPatient().id;
          showUndoToast('不要判定にしました', () => {
            const p = globalAppData.patients.find(x => x.id === patId);
            const it = p?.items.find(i => i.id === id);
            if (it) { it.type = prevType; touchItem(it); }
          });
        }
      }
    };

    window.deleteItem = function(id) {
      const cp = getCurrentPatient();
      const idx = cp.items.findIndex(i => i.id === id);
      if (idx === -1) return;
      const [removed] = cp.items.splice(idx, 1);
      markItemDeleted(cp, id); // 他端末との同時編集マージ時に、このカードが誤って復活しないようにする
      const patId = cp.id;
      selectedCardIds.delete(id);
      saveDataAndSync();
      showUndoToast('カードを削除しました', () => {
        const p = globalAppData.patients.find(x => x.id === patId);
        if (p) {
          touchItem(removed); // 「元に戻す」＝この端末が今このカードを復元したという印を残す
          unmarkItemDeleted(p, id);
          p.items.splice(Math.min(idx, p.items.length), 0, removed);
        }
      });
    };

    window.clearUnnecessary = function() {
      const cp = getCurrentPatient();
      const removed = cp.items.filter(i => i.type === 'unnecessary');
      if (removed.length === 0) return showToast('不要な情報はありません', 'info');
      cp.items = cp.items.filter(i => i.type !== 'unnecessary');
      removed.forEach(i => markItemDeleted(cp, i.id));
      const patId = cp.id;
      saveDataAndSync();
      showUndoToast(`不要な情報を${removed.length}件消去しました`, () => {
        const p = globalAppData.patients.find(x => x.id === patId);
        if (p) {
          removed.forEach(i => { touchItem(i); unmarkItemDeleted(p, i.id); });
          p.items.push(...removed);
        }
      });
    };

    window.allowDrop = e => e.preventDefault();
    window.handleDrop = (e, targetType) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      if (id && !id.startsWith('asc_')) setItemType(id, targetType);
    };

    function renderAssessmentTable() {
      const activeItems = getCurrentPatient().items.filter(i => i.type !== 'unnecessary');
      const frag = document.createDocumentFragment();

      HENDERSON_NEEDS.forEach(need => {
        const matching = activeItems.filter(i => i.hendersonIds?.includes(need.id));

        // その欲求の行の中で、上から出てくる順にS/Oそれぞれ通し番号を振る（S-1, S-2 / O-1, O-2 ...）。
        // 「不足情報」欄はS/Oの区別を持たせないため、番号付けの対象からも除外する。
        let sSeq = 0, oSeq = 0;
        const seqLabels = {};
        matching.forEach(i => {
          if ((i.assessmentCols?.[need.id] || 'unclassified') === 'missing') return;
          if (i.type === 's') seqLabels[i.id] = `S-${++sSeq}`;
          else if (i.type === 'o') seqLabels[i.id] = `O-${++oSeq}`;
        });

        // 同じ欄の中でのカードの並び順（上下移動ボタンの有効/無効の判定に使う。一番上/一番下のカードは
        // それぞれ上へ/下へのボタンを押せないようにする）
        const categorize = col => {
          const list = matching.filter(i => (i.assessmentCols?.[need.id] || 'unclassified') === col);
          return list.map((i, idx) => renderAssessmentCellCard(i, need.id, seqLabels[i.id], idx === 0, idx === list.length - 1)).join('');
        };

        const needLabel = need.name.replace(/^\d+\.\s*/, '');
        const tr = document.createElement('tr');
        tr.className = "border-b border-[var(--line)] hover:bg-[var(--paper)]/60";
        tr.innerHTML = `
          <td class="need-cell border border-[var(--line)] p-3 bg-[var(--paper)] align-top w-56">
            <div class="flex items-start gap-2.5">
              <span class="need-number shrink-0 w-7 h-7 rounded-full bg-[var(--accent)] text-white font-display font-semibold text-[13px] flex items-center justify-center">${need.id}</span>
              <div class="flex items-start gap-1.5 min-w-0 pt-0.5">
                <i class="fa-solid ${need.icon} text-[var(--accent)] text-[11px] shrink-0 mt-0.5"></i>
                <span class="text-[12.5px] leading-snug font-semibold text-[var(--ink)] break-words font-sans">${needLabel}</span>
              </div>
            </div>
          </td>
          <td class="border border-[var(--line)] p-1.5 align-top min-h-[60px]" ondragover="allowDrop(event)" ondrop="handleAssessmentDrop(event, ${need.id}, 'unclassified')"><div class="space-y-1.5">${categorize('unclassified')}</div></td>
          <td class="border border-[var(--line)] p-1.5 align-top bg-[var(--slate-soft)]/30 min-h-[60px]" ondragover="allowDrop(event)" ondrop="handleAssessmentDrop(event, ${need.id}, 'preadmission')"><div class="space-y-1.5">${categorize('preadmission')}</div></td>
          <td class="border border-[var(--line)] p-1.5 align-top bg-[var(--accent-soft)]/40 min-h-[60px]" ondragover="allowDrop(event)" ondrop="handleAssessmentDrop(event, ${need.id}, 'postadmission')"><div class="space-y-1.5">${categorize('postadmission')}</div></td>
          <td class="border border-[var(--line)] p-1.5 align-top bg-[var(--brick-soft)]/40 min-h-[60px]" ondragover="allowDrop(event)" ondrop="handleAssessmentDrop(event, ${need.id}, 'missing')">
            <div class="space-y-1.5">${categorize('missing')}</div>
            <button onclick="openMissingModal(${need.id})" class="mt-1.5 text-[10px] text-[var(--brick)] hover:text-[var(--ink)] font-medium flex items-center w-full justify-center p-1 border border-dashed border-[#DEC0B8] rounded-[var(--radius-sm)]"><i class="fa-solid fa-plus mr-1"></i> 追加</button>
          </td>
        `;
        frag.appendChild(tr);
      });
      document.getElementById('assessment-tbody').replaceChildren(frag);
    }

    function renderAssessmentCellCard(item, hId, seqLabel, isFirst, isLast) {
      const currentCol = item.assessmentCols?.[hId] || 'unclassified';
      const isMissingCol = currentCol === 'missing';
      // 「不足情報」欄はS/Oの分類を必要としないため、この欄に置かれたカードにはS/Oのバッジ・色分けを付けない。
      const isS = item.type === 's' && !isMissingCol;
      const isO = item.type === 'o' && !isMissingCol;
      // Sは金、Oは藍と色分けし、通し番号(S-1/O-2等)を太字ラベルで表示。カード左端にも同色のバーを付けて色でも一目で判別できるようにする
      // バッジをクリックすると分類ボード側の該当カードへジャンプ・ハイライトする
      const badge = isS
        ? `<span onclick="jumpToBoardCard('${item.id}')" class="px-1.5 py-[1px] rounded-[var(--radius-sm)] font-bold text-[9px] tracking-tight cursor-pointer" title="分類ボードの該当カードを表示" style="background:var(--gold);color:#fff;">${seqLabel || 'S'}</span>`
        : (isO
          ? `<span onclick="jumpToBoardCard('${item.id}')" class="px-1.5 py-[1px] rounded-[var(--radius-sm)] font-bold text-[9px] tracking-tight cursor-pointer" title="分類ボードの該当カードを表示" style="background:var(--slate);color:#fff;">${seqLabel || 'O'}</span>`
          : '');
      const cardBg = isS ? 'var(--gold-soft)' : (isO ? 'var(--slate-soft)' : 'var(--surface)');
      const accentColor = isS ? 'var(--gold)' : (isO ? 'var(--slate)' : 'var(--line)');
      const time = item.timestamp && item.timestamp !== "日時不明" ? `<span class="text-[8px] text-[var(--ink-muted)] bg-[var(--line-soft)] px-1 rounded-[var(--radius-sm)] font-semibold">${escapeHtml(item.timestamp)}</span>` : '';
      const fieldDef = item.fieldLabel ? FIELD_LABELS.find(f => f.key === item.fieldLabel) : null;
      const fieldTag = fieldDef ? `<span class="text-[8px] px-1 rounded-[var(--radius-sm)] font-bold" style="background:${fieldDef.bg};color:${fieldDef.color};">${escapeHtml(fieldDef.label)}</span>` : '';
      const aiTag = item.aiSuggested ? `<span class="text-[8px] px-1 rounded-[var(--radius-sm)] font-bold" style="background:var(--brick-soft);color:var(--brick);"><i class="fa-solid fa-wand-magic-sparkles mr-0.5"></i>AI推定</span>` : '';

      // 未・前・後・欠それぞれに専用色を持たせ、選択されていない時も枠線の色で見分けられるようにする
      const COL_COLORS = { unclassified: 'var(--ink-muted)', preadmission: 'var(--slate)', postadmission: 'var(--accent)', missing: 'var(--brick)' };
      const colBtn = (col, label) => {
        const c = COL_COLORS[col];
        const active = currentCol === col;
        return `<button onclick="setAssessmentCol('${item.id}', ${hId}, '${col}')" class="px-1 py-0.5 rounded-[var(--radius-sm)] text-[8px] font-bold border-2 transition" style="${active ? `background:${c};border-color:${c};color:#fff;` : `border-color:${c};color:${c};background:var(--surface);`}">${label}</button>`;
      };

      return `
        <div id="asc_${item.id}_${hId}" draggable="true"
          ondragstart="handleAssessmentDragStart(event, '${item.id}')"
          ondragend="handleAssessmentDragEnd(event)"
          ondragover="event.preventDefault(); event.stopPropagation();"
          ondragenter="event.preventDefault(); event.currentTarget.classList.add('drag-over');"
          ondragleave="event.currentTarget.classList.remove('drag-over');"
          ondrop="handleAssessmentCardDrop(event, '${item.id}', ${hId})"
          class="p-1.5 rounded-[var(--radius-sm)] border ${item.aiSuggested ? 'border-dashed' : ''} border-[var(--line)] text-[10px] flex flex-col gap-1 cursor-grab active:cursor-grabbing hover:border-[var(--accent)] transition" style="background:${cardBg};border-left-width:3px;border-left-color:${accentColor};">
          <div class="flex items-start justify-between gap-1">
            <div class="flex items-start gap-1 flex-1 min-w-0">
              <div class="shrink-0 mt-0.5 flex items-center gap-0.5 flex-wrap">${badge} ${aiTag} ${fieldTag} ${time}</div>
              <span class="text-[var(--ink)] font-medium break-words leading-tight">${escapeHtml(item.text)}</span>
            </div>
            <div class="flex items-center space-x-1 shrink-0">
              <button onclick="moveAssessmentCard('${item.id}', ${hId}, 'up')" ${isFirst ? 'disabled' : ''} class="icon-btn" title="この欄の中で1つ上へ移動" style="${isFirst ? 'opacity:.3;cursor:not-allowed;' : ''}"><i class="fa-solid fa-chevron-up text-[9px]"></i></button>
              <button onclick="moveAssessmentCard('${item.id}', ${hId}, 'down')" ${isLast ? 'disabled' : ''} class="icon-btn" title="この欄の中で1つ下へ移動" style="${isLast ? 'opacity:.3;cursor:not-allowed;' : ''}"><i class="fa-solid fa-chevron-down text-[9px]"></i></button>
              <button onclick="editItemText('${item.id}')" class="icon-btn" title="内容を編集"><i class="fa-solid fa-pen text-[9px]"></i></button>
              <button onclick="setItemType('${item.id}', 'unnecessary')" class="icon-btn danger" title="不要判定"><i class="fa-solid fa-ban text-[9px]"></i></button>
            </div>
          </div>
          <div class="flex items-center justify-end gap-0.5 pt-1 border-t border-[var(--line-soft)]">
            ${colBtn('unclassified', '未')}${colBtn('preadmission', '前')}${colBtn('postadmission', '後')}${colBtn('missing', '欠')}
          </div>
        </div>
      `;
    }

    // 総合アセスメント表：同じ欄（未分類/入院前/入院後/不足情報）の中でのカードの表示順を
    // ワンクリックで入れ替える（ドラッグ＆ドロップが難しいタッチ環境でも並べ替えしやすくするため）。
    // ドラッグ＆ドロップでの並べ替え（handleAssessmentCardDrop）と同じく、cp.items配列内の位置を
    // 直接入れ替えることで並び順を変える。欄をまたいでの移動はしない（同じ欄の中だけの移動）。
    window.moveAssessmentCard = function(itemId, hId, direction) {
      const cp = getCurrentPatient();
      const activeItems = cp.items.filter(i => i.type !== 'unnecessary');
      const matching = activeItems.filter(i => i.hendersonIds?.includes(hId));
      const item = matching.find(i => i.id === itemId);
      if (!item) return;
      const col = item.assessmentCols?.[hId] || 'unclassified';
      const group = matching.filter(i => (i.assessmentCols?.[hId] || 'unclassified') === col);
      const idx = group.findIndex(i => i.id === itemId);
      const neighborIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (neighborIdx < 0 || neighborIdx >= group.length) return; // 既に一番上/一番下なら何もしない
      const neighbor = group[neighborIdx];

      const draggedIdx = cp.items.findIndex(i => i.id === itemId);
      const [draggedItem] = cp.items.splice(draggedIdx, 1);
      const neighborNewIdx = cp.items.findIndex(i => i.id === neighbor.id);
      const insertAt = direction === 'up' ? neighborNewIdx : neighborNewIdx + 1;
      cp.items.splice(insertAt, 0, draggedItem);
      saveDataAndSync();
    };

    window.handleAssessmentDragStart = (e, id) => { e.dataTransfer.setData('text/plain', 'asc_' + id); e.currentTarget.classList.add('card-dragging'); };
    window.handleAssessmentDragEnd = e => {
      e.currentTarget.classList.remove('card-dragging');
      // ドラッグ中にハイライトしたカードが残っていれば消しておく（drop先を通らずに終了した場合の保険）
      document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    };
    window.handleAssessmentDrop = (e, hId, targetCol) => {
      e.preventDefault();
      const dragData = e.dataTransfer.getData('text/plain');
      if (dragData?.startsWith('asc_')) setAssessmentCol(dragData.replace('asc_', ''), hId, targetCol);
    };
    // 総合アセスメント表内で、同じ欄・別の欄を問わずカードをカードの上にドロップした時の並べ替え。
    // ドロップ先カードの直前に移動させることで表示順を入れ替え、S-1/S-2やO-1/O-2の通し番号は
    // 再描画時（renderAssessmentTable）にその新しい並び順から自動的に振り直される。
    window.handleAssessmentCardDrop = (e, targetItemId, hId) => {
      e.preventDefault();
      e.stopPropagation(); // 親要素（欄セル）のondropで二重に処理されないようにする
      e.currentTarget.classList.remove('drag-over');
      const dragData = e.dataTransfer.getData('text/plain');
      if (!dragData?.startsWith('asc_')) return;
      const draggedId = dragData.replace('asc_', '');
      if (draggedId === targetItemId) return;
      const cp = getCurrentPatient();
      const draggedIdx = cp.items.findIndex(i => i.id === draggedId);
      const targetItem = cp.items.find(i => i.id === targetItemId);
      if (draggedIdx === -1 || !targetItem) return;
      const targetCol = targetItem.assessmentCols?.[hId] || 'unclassified';
      const [draggedItem] = cp.items.splice(draggedIdx, 1);
      const prevCol = draggedItem.assessmentCols?.[hId] || 'unclassified';
      (draggedItem.assessmentCols = draggedItem.assessmentCols || {})[hId] = targetCol;
      const newTargetIdx = cp.items.findIndex(i => i.id === targetItemId);
      cp.items.splice(newTargetIdx, 0, draggedItem); // ドロップ先カードの直前に挿入し、その位置に応じてS-1/O-1等が振り直される
      saveDataAndSync();
      if (prevCol !== targetCol) {
        const dict = globalAppData.learningUserDict[draggedItem.text] = globalAppData.learningUserDict[draggedItem.text] || {};
        (dict.preferredCols = dict.preferredCols || {})[hId] = targetCol;
        reportLearningEvent(draggedItem.text, 'col', { hendersonId: hId, col: targetCol });
      }
    };

    window.setAssessmentCol = function(id, hId, colName) {
      const item = getCurrentPatient().items.find(i => i.id === id);
      if (item) {
        (item.assessmentCols = item.assessmentCols || {})[hId] = colName;
        const dict = globalAppData.learningUserDict[item.text] = globalAppData.learningUserDict[item.text] || {};
        (dict.preferredCols = dict.preferredCols || {})[hId] = colName;
        saveDataAndSync();
        reportLearningEvent(item.text, 'col', { hendersonId: hId, col: colName });
      }
    };

    const modalMissing = document.getElementById('modal-missing');
    window.openMissingModal = hId => {
      document.getElementById('missing-henderson-id').value = hId;
      document.getElementById('input-missing-text').value = '';
      modalMissing.classList.remove('hidden'); document.getElementById('input-missing-text').focus();
    };
    window.closeMissingModal = () => modalMissing.classList.add('hidden');
    window.saveMissingInfo = () => {
      const text = cleanExtractedPhrase(document.getElementById('input-missing-text').value);
      const hId = parseInt(document.getElementById('missing-henderson-id').value, 10);
      if (text) {
        getCurrentPatient().items.push({ id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6), text, timestamp: "追記", type: 'o', hendersonIds: [hId], assessmentCols: { [hId]: 'missing' }, _touchedAt: new Date().toISOString() });
        saveDataAndSync(); closeMissingModal();
      }
    };

    // ==========================================================================
    // 参考データ ページ：看護基準・院内プロトコル等をユーザーが自由に登録・編集できる。
    // 「不足情報をAI推定」の判断材料としても使われる（evaluateMissingInfoAI 参照）。
    // ==========================================================================
    function renderReferenceList() {
      const cp = getCurrentPatient();
      const notes = cp.referenceNotes || [];
      const listEl = document.getElementById('reference-list');
      const emptyEl = document.getElementById('reference-empty');
      emptyEl.classList.toggle('hidden', notes.length > 0);
      const frag = document.createDocumentFragment();
      notes.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).forEach(note => {
        const card = document.createElement('div');
        card.className = 'rec-card';
        card.innerHTML = `
          <div class="flex items-start justify-between gap-1">
            <span class="font-semibold text-[var(--ink)] text-xs break-words">${escapeHtml(note.title || '(無題)')}</span>
            <div class="flex items-center space-x-0.5 shrink-0">
              <button onclick="openReferenceModal('${note.id}')" class="icon-btn" title="編集"><i class="fa-solid fa-pen"></i></button>
              <button onclick="deleteReferenceEntry('${note.id}')" class="icon-btn danger" title="削除"><i class="fa-solid fa-trash-can"></i></button>
            </div>
          </div>
          <p class="text-[var(--ink-muted)] leading-relaxed whitespace-pre-wrap break-words">${escapeHtml(note.text || '')}</p>
        `;
        frag.appendChild(card);
      });
      listEl.replaceChildren(frag);
    }

    let referenceOcrPrefill = '';
    window.openReferenceModal = (id, prefillText) => {
      const cp = getCurrentPatient();
      const note = id ? (cp.referenceNotes || []).find(n => n.id === id) : null;
      document.getElementById('reference-editing-id').value = id || '';
      document.getElementById('reference-modal-title').textContent = note ? '参考データを編集' : '参考データを追加';
      document.getElementById('input-reference-title').value = note ? note.title : '';
      document.getElementById('input-reference-text').value = note ? note.text : (prefillText || referenceOcrPrefill || '');
      referenceOcrPrefill = '';
      document.getElementById('modal-reference-entry').classList.remove('hidden');
      setTimeout(() => document.getElementById('input-reference-title').focus(), 30);
    };
    window.closeReferenceModal = () => document.getElementById('modal-reference-entry').classList.add('hidden');
    document.getElementById('btn-close-reference').addEventListener('click', closeReferenceModal);
    document.getElementById('btn-reference-add').addEventListener('click', () => openReferenceModal(null));
    document.getElementById('btn-save-reference').addEventListener('click', () => {
      const cp = getCurrentPatient();
      const id = document.getElementById('reference-editing-id').value;
      const title = document.getElementById('input-reference-title').value.trim() || '(無題)';
      const text = document.getElementById('input-reference-text').value.trim();
      if (!text) return showToast('内容を入力してください', 'error');
      cp.referenceNotes = cp.referenceNotes || [];
      const now = new Date().toISOString();
      if (id) {
        const note = cp.referenceNotes.find(n => n.id === id);
        if (note) { note.title = title; note.text = text; note.updatedAt = now; }
      } else {
        cp.referenceNotes.push({ id: 'ref_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6), title, text, updatedAt: now });
      }
      saveDataAndSync(); closeReferenceModal(); showToast('参考データを保存しました', 'success');
    });
    window.deleteReferenceEntry = async (id) => {
      const confirmed = await openDialog({ title: '参考データを削除しますか？', confirmLabel: '削除する', danger: true });
      if (!confirmed) return;
      const cp = getCurrentPatient();
      cp.referenceNotes = cp.referenceNotes || [];
      const idx = cp.referenceNotes.findIndex(n => n.id === id);
      if (idx === -1) return;
      const [removed] = cp.referenceNotes.splice(idx, 1);
      const patId = cp.id;
      saveDataAndSync();
      showUndoToast('参考データを削除しました', () => {
        const p = globalAppData.patients.find(x => x.id === patId);
        if (p) { p.referenceNotes = p.referenceNotes || []; p.referenceNotes.splice(Math.min(idx, p.referenceNotes.length), 0, removed); }
      });
    };

    const referenceOcrInput = document.getElementById('reference-ocr-input');
    document.getElementById('btn-reference-ocr').addEventListener('click', e => { e.preventDefault(); referenceOcrInput.click(); });
    referenceOcrInput.addEventListener('change', e => { if (e.target.files[0]) doReferenceOcr(e.target.files[0]); e.target.value = ''; });

    async function doReferenceOcr(file) {
      if (!globalAppData.apiKey) return showToast('API設定からキーを入力してください', 'error');
      showToast('画像から文字起こし中...', 'info');
      const reader = new FileReader();
      reader.onload = async e => {
        try {
          const ocrText = await callGeminiAI([{ parts: [{ text: "画像に含まれる看護基準・プロトコル・参考資料の内容を正確に文字起こししてください。" }, { inline_data: { mime_type: file.type || "image/jpeg", data: e.target.result.split(',')[1] } }] }]);
          if (!ocrText) throw new Error('文字起こし結果が空でした');
          referenceOcrPrefill = ocrText;
          openReferenceModal(null, ocrText);
          showToast('文字起こしが完了しました。内容を確認して保存してください', 'success');
        } catch (err) {
          console.warn('Reference OCR error:', err);
          showToast(`OCR失敗: ${err.message || '通信エラー'}`, 'error');
        }
      };
      reader.readAsDataURL(file);
    }

    document.getElementById('btn-save-data').addEventListener('click', () => {
      saveDataAndSync();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(globalAppData, null, 2)], { type: 'application/json' }));
      a.download = `nursing_assessment_all_patients_${Date.now()}.json`;
      a.click(); showToast('全患者データを保存しました', 'success');
    });

    document.getElementById('input-load-data').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const parsed = JSON.parse(ev.target.result);
          if (parsed.patients && Array.isArray(parsed.patients)) {
            globalAppData.patients = parsed.patients;
            globalAppData.currentPatientId = parsed.currentPatientId || parsed.patients[0].id;
            if (parsed.learningUserDict) globalAppData.learningUserDict = parsed.learningUserDict;
            // notebookContent は編集不可の固定基準のため、読み込みファイルの値では上書きしない
          } else if (Array.isArray(parsed)) {
            globalAppData.patients = [{ id: 'patient_1', title: '読み込みデータ', items: parsed, sourceText: '', labEvaluationResult: '', referenceNotes: [], archived: false, updatedAt: null }];
            globalAppData.currentPatientId = 'patient_1';
          }
          persistData(); loadLocalState(); showToast('データを読み込みました', 'success');
        } catch (err) { showToast('ファイル形式が不正です', 'error'); }
      };
      reader.readAsText(file, 'utf-8');
      e.target.value = '';
    });

    // NotebookLM連携はUIには表示せず、globalAppData.notebookContent（DEFAULT_NOTEBOOK_CONTENT）として
    // 裏側で常時グラウンディングに使用する（evaluateLabValuesAI / evaluateMissingInfoAI / 分類抽出プロンプト参照）。

    document.getElementById('btn-open-settings').addEventListener('click', () => {
      document.getElementById('input-api-key').value = globalAppData.apiKey;
      document.getElementById('modal-settings').classList.remove('hidden');
    });
    document.getElementById('btn-close-settings').addEventListener('click', () => document.getElementById('modal-settings').classList.add('hidden'));
    document.getElementById('btn-save-settings').addEventListener('click', () => {
      globalAppData.apiKey = document.getElementById('input-api-key').value.trim();
      localStorage.setItem('gemini_api_key', globalAppData.apiKey);
      document.getElementById('modal-settings').classList.add('hidden');
      showToast('設定を保存しました', 'success');
    });
    document.getElementById('btn-add-extra-criteria').addEventListener('click', async () => {
      const input = document.getElementById('input-extra-criteria');
      const text = input.value.trim();
      if (!text) return showToast('内容を入力してください', 'error');
      const ok = await addExtraCriteria(text);
      if (ok) { input.value = ''; showToast('追加の要望を保存しました（全員に共有されます）', 'success'); }
    });
    window.resetLearningData = async () => {
      const confirmed = await openDialog({ title: '今の画面の学習内容をリセットしますか？', message: '現在表示されているS/O振り分け等の学習内容をこの画面上から消去します（元に戻すにはページを再度開いてください）。', confirmLabel: 'リセットする', danger: true });
      if (confirmed) {
        const old = globalAppData.learningUserDict;
        globalAppData.learningUserDict = {};
        saveDataAndSync();
        showUndoToast('学習データをリセットしました', () => { globalAppData.learningUserDict = old; });
      }
    };

    const ocrDropzone = document.getElementById('ocr-dropzone'), ocrFileInput = document.getElementById('ocr-file-input');
    ocrDropzone.addEventListener('click', () => ocrFileInput.click());
    ocrDropzone.addEventListener('dragover', e => { e.preventDefault(); ocrDropzone.classList.add('drag-over'); });
    ocrDropzone.addEventListener('dragleave', () => ocrDropzone.classList.remove('drag-over'));
    ocrDropzone.addEventListener('drop', e => { e.preventDefault(); ocrDropzone.classList.remove('drag-over'); if(e.dataTransfer.files[0]) doOcr(e.dataTransfer.files[0]); });
    ocrFileInput.addEventListener('change', e => { if(e.target.files[0]) doOcr(e.target.files[0]); });

    async function doOcr(file) {
      if (!globalAppData.apiKey) return showToast('API設定からキーを入力してください', 'error');
      document.getElementById('ocr-status').classList.remove('hidden');
      const reader = new FileReader();
      reader.onload = async e => {
        try {
          const ocrText = await callGeminiAI([{ parts: [{ text: "画像に含まれるカルテ記載や検査データ結果（WBC, CRP, Hb, クレアチニン等）を正確に文字起こししてください。" }, { inline_data: { mime_type: file.type || "image/jpeg", data: e.target.result.split(',')[1] } }] }]);
          if (!ocrText) throw new Error('文字起こし結果が空でした');
          DOM.sourceText.value += (DOM.sourceText.value ? '\n' : '') + ocrText;
          saveDataAndSync(); document.getElementById('ocr-status-text').innerHTML = '<i class="fa-solid fa-check"></i> 完了';
          setTimeout(() => document.getElementById('ocr-status').classList.add('hidden'), 2000);
        } catch (err) {
          console.warn('OCR error:', err);
          showToast(`OCR失敗: ${err.message || '通信エラー'}`, 'error');
          document.getElementById('ocr-status').classList.add('hidden');
        }
      };
      reader.readAsDataURL(file);
    }

    // カルテ内容はタブを閉じると消える（sessionStorageのため）。何か入力・登録済みの状態でタブを
    // 閉じよう／離脱しようとした場合は、ブラウザ標準の確認ダイアログで一声かける。
    // あわせて、学習内容（learningUserDict）をフォルダ内の学習専用ファイル（data/learning-dict.json）に
    // 念のためまとめて同期しておく。通常は変更のたびに即座に送信済みだが、通信できていなかった分の保険。
    window.addEventListener('beforeunload', e => {
      try {
        const blob = new Blob([JSON.stringify(globalAppData.learningUserDict)], { type: 'application/json' });
        navigator.sendBeacon(`${API_BASE}/learning-dict/sync`, blob);
      } catch (err) { /* サーバー未接続などの場合は何もしない（ブラウザ内学習には影響なし） */ }
      try {
        // 同時接続人数の表示から即座に外れるよう、タイムアウトを待たず退出を伝える
        const leaveBlob = new Blob([JSON.stringify({ clientId: presenceClientId })], { type: 'application/json' });
        navigator.sendBeacon(`${API_BASE}/presence/leave`, leaveBlob);
      } catch (err) { /* noop */ }
      try {
        // 患者カルテも、個別の同期（schedulePatientSync）が間に合っていなかった場合の保険として
        // このタブが知っている全患者分をまとめて送っておく（他の患者のデータを消すことはない）
        const patientsById = {};
        globalAppData.patients.forEach(p => { patientsById[p.id] = p; });
        const patientsBlob = new Blob([JSON.stringify(patientsById)], { type: 'application/json' });
        navigator.sendBeacon(`${API_BASE}/patients/sync`, patientsBlob);
      } catch (err) { /* サーバー未接続などの場合は何もしない（ブラウザ内のカルテには影響なし） */ }

      const hasData = globalAppData.patients.some(p =>
        (p.items && p.items.length > 0) ||
        (p.referenceNotes && p.referenceNotes.length > 0) ||
        (p.sourceText && p.sourceText.trim().length > 0)
      );
      if (hasData) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    loadLocalState();
    loadSharedLearningDict(); // 起動時に一度、共有学習データ（全利用者分）を取得してローカル学習にマージ
    loadSharedPatients().then(() => loadLocalState()); // 起動時に一度、共有カルテ（他端末分）を取得してマージし、画面を再描画する
    loadSharedCriteria(); // 起動時に一度、AI抽出・分類基準への追加の要望（全利用者分）を取得しておく

