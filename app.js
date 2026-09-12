    // ヘンダーソン14項目定義
    // keywords はアップロードされた基準表（「アセスメントの視点に必要な情報項目の例」体力・意思力・知識）を
    // もとに拡充している。表内の全項目をそのまま単語化するのではなく、看護記録の文章中に実際に
    // 現れやすい語(症状名・観察項目名など)を中心に採用した。
    const HENDERSON_NEEDS = [
      { id: 1, name: "1. 正常な呼吸をする", icon: "fa-lungs", keywords: ["呼吸", "SpO2", "咳", "痰", "喘鳴", "息切れ", "チアノーゼ", "酸素", "息苦し", "PaO2", "呼吸数", "呼吸音", "動脈血ガス", "胸部X線", "胸郭", "呼吸補助筋", "起座呼吸", "wheezes", "発汗", "気道", "分泌物", "狭窄", "アレルギー", "喫煙", "人工呼吸器", "酸素マスク", "肥満", "発熱", "疼痛", "副作用", "安楽な姿勢", "体位", "枕", "湿度", "臭気", "吸入器", "在宅酸素療法", "排痰", "咳嗽"] },
      { id: 2, name: "2. 適切な飲食をする", icon: "fa-utensils", keywords: ["食事", "食欲", "摂取量", "水分量", "嚥下", "嘔吐", "悪心", "吐気", "むせ", "体重", "栄養", "飲水", "Alb", "TP", "食事量", "咀嚼", "嚥下機能", "栄養状態", "BMI", "食習慣", "間食", "外食", "宗教的習慣", "食事療法", "必要エネルギー", "透析", "造影剤", "味覚", "化学療法", "身長", "ローレル指数", "カウプ指数", "頭皮", "毛髪", "免疫", "義歯", "自助具", "口腔粘膜"] },
      { id: 3, name: "3. 身体の老廃物を排泄する", icon: "fa-toilet", keywords: ["排尿", "排便", "下痢", "便秘", "失禁", "導尿", "残尿", "BUN", "Cre", "eGFR", "おしっこ", "下血", "血尿", "ストーマ", "導尿カテーテル", "ドレーン排液", "排泄", "緩下剤", "おむつ", "肛門", "臀部", "腹部", "夜間排尿", "利尿剤", "尿道カテーテル", "ウロストミー", "混濁", "出血", "滲出液", "体臭"] },
      { id: 4, name: "4. 動いて適切な姿勢を保つ", icon: "fa-person-walking", keywords: ["歩行", "移乗", "立位", "坐位", "麻痺", "可動域", "拘縮", "転倒", "ベッド上安静", "体位変換", "移動", "運動機能", "発赤", "褥瘡", "クッション", "自助具", "ベッド柵", "輸液ライン", "滑りにくい靴", "筋力", "視覚", "聴覚", "感覚機能", "循環機能"] },
      { id: 5, name: "5. 眠りと休息をとる", icon: "fa-bed", keywords: ["睡眠", "不眠", "中途覚醒", "休息", "眠気", "疲労感", "倦怠感", "熟睡", "眠れない", "睡眠薬", "入眠困難", "無呼吸", "集中力低下", "騒音", "寝具", "日課", "だるさ", "ストレッサー", "不安", "ストレス", "対処方法"] },
      { id: 6, name: "6. 衣服を着脱する", icon: "fa-shirt", keywords: ["着脱", "衣服", "更衣", "ボタン", "靴下", "病衣交換", "パジャマ", "衣類", "洗濯", "好み", "選択基準", "動きやすさ", "自己表現"] },
      { id: 7, name: "7. 体温を正常範囲に保つ", icon: "fa-temperature-high", keywords: ["体温", "発熱", "熱感", "悪寒", "クーリング", "冷感", "KT", "BT", "℃", "WBC", "CRP", "放熱", "すきま風", "気温", "湿度"] },
      { id: 8, name: "8. 身体を清潔に保ち皮膚を保護する", icon: "fa-shower", keywords: ["清拭", "入浴", "洗髪", "皮膚発赤", "褥瘡", "創部状態", "口腔ケア", "掻痒", "保清", "毛髪", "爪", "歯", "ひげ", "化粧", "装身具", "身だしなみ", "社会的孤立"] },
      { id: 9, name: "9. 環境の危険を避け他者を傷つけない", icon: "fa-shield-halved", keywords: ["コール", "ベッド柵", "点滴ルート", "チューブ抜去", "転落防止", "身体抑制", "安全管理", "転倒", "転落", "事故", "交通事故", "身体損傷", "暴力", "感染症", "治安", "経済力", "標準予防策"] },
      { id: 10, name: "10. 他者とコミュニケーションし感情等を表現する", icon: "fa-comments", keywords: ["発話", "会話", "聞こえ", "視力", "難聴", "表出", "失語", "認知", "不安", "訴え", "話す", "語る", "コミュニケーション", "構音", "意思伝達", "手話", "識字", "聴覚", "自尊感情", "自己否定", "自傷", "価値観", "ボディイメージ", "人間関係", "依存"] },
      { id: 11, name: "11. 自分の信仰に従って礼拝する", icon: "fa-hands-praying", keywords: ["信仰", "宗教", "信条", "価値観", "お祈り", "礼拝", "牧師", "禁忌", "輸血拒否"] },
      { id: 12, name: "12. 達成感のある仕事をする", icon: "fa-trophy", keywords: ["仕事", "役割", "家事", "意欲", "自尊感情", "達成感", "作業", "職業", "離職", "生きがい", "リハビリテーション"] },
      { id: 13, name: "13. 遊びやレクリエーションに参加する", icon: "fa-gamepad", keywords: ["趣味", "テレビ視聴", "読書", "レク", "散歩", "気晴らし", "娯楽", "余暇", "余暇活動", "閉じこもり", "気分転換"] },
      { id: 14, name: "14. 学び発見し好奇心を充たす", icon: "fa-graduation-cap", keywords: ["病識", "理解度", "指導", "服薬指導", "質問", "知りたい", "学習", "説明理解", "学歴", "学習困難", "教材", "健康習慣", "血糖測定", "飲酒"] }
    ];

    const SAMPLE_TEXT = `[入院時] 現病歴3日前から咳嗽と発熱が持続し、本日呼吸苦が増悪したため救急搬送となった。
既往歴は2型糖尿病、高血圧症にて内服加療中。
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
- 医療従事者の観察所見、バイタルサイン、検査データ（WBC, CRP, Hb, BUN, Cre, 電解質等）はOデータ（客観的情報）に分類する。

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
        { id: 'patient_1', title: '患者A', items: [], sourceText: '', labEvaluationResult: '', referenceNotes: [], archived: false, updatedAt: null }
      ],
      currentPatientId: persistedPatients?.currentPatientId || 'patient_1',
      // 学習内容はこのブラウザ（localStorage）には保存せず、フォルダ内の学習専用ファイル
      // （data/learning-dict.json）だけに保存する。起動時に loadSharedLearningDict() が
      // そのファイルの内容をまるごと取得してここに読み込む（サーバー未起動時は空のまま）。
      learningUserDict: {},
      apiKey: localStorage.getItem('gemini_api_key') || '',
      notebookContent: DEFAULT_NOTEBOOK_CONTENT // 編集機能は廃止し、アップロード済みの基準表を統合した固定内容を使用
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
      updateSaveStatus();
      updateCurrentPatientMeta();
    }

    function saveDataAndSync() {
      persistData();
      renderSoBoard();
      renderAssessmentTable();
      renderReferenceList();
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
      globalAppData.patients.push({ id: newId, title: title.trim(), items: [], sourceText: '', labEvaluationResult: '', referenceNotes: [], archived: false, updatedAt: null });
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
      loadLocalState();
      renderPatientListModal();
      showUndoToast(`「${p.title}」をアーカイブしました`, () => {
        p.archived = false;
        if (wasCurrent) globalAppData.currentPatientId = id;
        loadLocalState();
        renderPatientListModal();
      });
    };

    window.unarchivePatient = function(id) {
      const p = globalAppData.patients.find(x => x.id === id);
      if (!p) return;
      p.archived = false;
      persistData();
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
      const isList = tab === 'list';
      document.getElementById('admin-tab-btn-list').classList.toggle('active', isList);
      document.getElementById('admin-tab-btn-history').classList.toggle('active', !isList);
      document.getElementById('admin-panel-list').classList.toggle('hidden', !isList);
      document.getElementById('admin-panel-list').classList.toggle('flex', isList);
      document.getElementById('admin-panel-history').classList.toggle('hidden', isList);
      document.getElementById('admin-panel-history').classList.toggle('flex', !isList);
      if (!isList) renderAdminHistoryList();
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
    document.getElementById('admin-history-search').addEventListener('input', renderAdminHistoryList);

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
              return `<span class="field-chip" style="background:${isTop ? typeColorOf(t) : 'var(--line-soft)'};color:${isTop ? '#fff' : 'var(--ink-muted)'};">${escapeHtml(typeLabelOf(t))}${c > 1 ? ` ×${c}` : ''}</span>`;
            }).join('')
          : `<span class="field-chip" style="background:var(--ink-muted);color:#fff;">未設定</span>`;

        const hendersonVotes = learned?.hendersonVotes || {};
        const tagEntries = Object.keys(hendersonVotes).length > 0
          ? Object.entries(hendersonVotes).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1])
          : (learned?.preferredHendersonIds || []).map(hId => [String(hId), 1]);
        const tagChipsHtml = tagEntries.map(([hIdStr, c]) => {
          const name = hendersonNameOf(Number(hIdStr));
          return `<span class="tag-chip">${escapeHtml(name)}${c > 1 ? ` ×${c}` : ''}</span>`;
        }).join('');

        const row = document.createElement('div');
        row.className = 'flex items-start justify-between gap-2 p-2 rounded-[var(--radius-sm)] border border-[var(--line)]';
        row.innerHTML = `
          <div class="min-w-0 flex-1">
            <div class="text-xs text-[var(--ink)] break-words">${escapeHtml(text)}</div>
            <div class="flex items-center flex-wrap gap-1 mt-1">
              ${typeChipsHtml}
              ${tagChipsHtml}
            </div>
          </div>
          <button class="icon-btn-outline danger shrink-0 admin-delete-learning-btn" data-text="${escapeHtml(text)}" title="この学習内容を削除"><i class="fa-solid fa-trash-can"></i></button>
        `;
        frag.appendChild(row);
      });
      listEl.replaceChildren(frag);
    }

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
    const ADMIN_ACTION_LABELS = { create: '新規登録', type: '分類変更', tagAdd: 'タグ追加', tagRemove: 'タグ削除', col: '欄の変更', edit: 'テキスト編集', delete: '削除' };
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

    // テキスト書き出し機能（未分類も含めて全て見やすく一覧化し、.txtファイルとしてダウンロードする）
    // AI分析結果はHTML（<br>や<b>タグ）で保持しているため、プレーンテキストに変換してから並べる。
    function htmlToPlainText(htmlStr) {
      if (!htmlStr) return '（未実施）';
      return htmlStr
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .split('\n').map(l => l.trim()).filter(Boolean).join('\n');
    }
    function docSection(title) { return `\n■ ${title}\n${'-'.repeat(40)}\n`; }
    function docList(items) { return items.length ? items.map(t => `・${t}`).join('\n') + '\n' : '（登録なし）\n'; }

    document.getElementById('btn-export-docs').addEventListener('click', () => {
      const cp = getCurrentPatient();
      const formatLine = i => `[${i.timestamp}]${i.fieldLabel ? ` [${i.fieldLabel}]` : ''} ${i.text}`;

      let body = `看護アセスメント・記録整理シート：${cp.title}\n`;
      body += `出力日時: ${new Date().toLocaleString('ja-JP')}\n`;

      body += docSection('1. 検査データ臨床評価・アセスメントノート');
      body += htmlToPlainText(DOM.labEvalContent.innerHTML) + '\n';

      const structuredItems = cp.items.filter(i => i.type !== 'unnecessary' && i.fieldLabel);
      if (structuredItems.length > 0) {
        body += docSection('2. 現病歴・既往歴・診断名・保険等');
        const lines = [];
        FIELD_LABELS.forEach(f => {
          structuredItems.filter(i => i.fieldLabel === f.key).forEach(i => lines.push(`[${f.label}] ${i.text}`));
        });
        body += docList(lines);
      }

      body += docSection('3. 主観的情報（Sデータ）');
      body += docList(cp.items.filter(i => i.type === 's').map(formatLine));

      body += docSection('4. 客観的情報（Oデータ）');
      body += docList(cp.items.filter(i => i.type === 'o').map(formatLine));

      body += docSection('5. 未分類のカード');
      body += docList(cp.items.filter(i => i.type === 'unclassified').map(formatLine));

      body += docSection('6. ヘンダーソン14項目別アセスメント整理');
      HENDERSON_NEEDS.forEach(need => {
        const matching = cp.items.filter(i => i.type !== 'unnecessary' && i.hendersonIds?.includes(need.id));
        if (matching.length === 0) return;
        body += `\n【${need.name}】\n`;
        body += docList(matching.map(i => {
          const col = i.assessmentCols?.[need.id] || 'unclassified';
          const colName = col === 'preadmission' ? '入院前' : (col === 'postadmission' ? '入院後' : (col === 'missing' ? '不足情報' : '未分類'));
          return `[${colName}] [${i.type.toUpperCase()}]${i.fieldLabel ? ` [${i.fieldLabel}]` : ''}${i.aiSuggested ? ' [AI推定]' : ''} ${i.text}`;
        }));
      });

      // AI分析ツールの結果（実施済みのものだけ載せる）
      if (cp.contradictionResult) { body += docSection('7. S/O矛盾チェック結果（AI）'); body += htmlToPlainText(cp.contradictionResult) + '\n'; }
      if (cp.diagnosisResult) { body += docSection('8. 看護診断候補（AI提案）'); body += htmlToPlainText(cp.diagnosisResult) + '\n'; }
      if (cp.timelineResult) { body += docSection('9. 経時変化サマリー（AI）'); body += htmlToPlainText(cp.timelineResult) + '\n'; }

      const notes = cp.referenceNotes || [];
      if (notes.length > 0) {
        body += docSection('10. 参考データ');
        notes.forEach(n => { body += `\n【${n.title}】\n${n.text}\n`; });
      }

      const safeTitle = (cp.title || 'カルテ').replace(/[\\/:*?"<>|]/g, '_');
      const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${safeTitle}_看護アセスメント.txt`;
      a.click();
      showToast('テキストファイル（.txt）を自動ダウンロードしました。Googleドキュメントでも「ファイル→開く→アップロード」でそのまま開けます', 'success');
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

    function formatLabValueString(str) {
      if (!str) return str;
      const cleaned = str.trim();
      if (/(?:\/μL|g\/dL|mg\/dL|U\/L|mEq\/L|%|℃|mmHg|回\/分)/.test(cleaned)) return cleaned;
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

        // 検査データの個別抽出（SpO2は "(room air)" 等の直後の注記も含めて丸ごと1枚のカードにする）
        const labRegex = /(WBC\s*\d+[\d,]*|CRP\s*\d+\.?\d*|HbA1c\s*\d+\.?\d*|Hb\s*\d+\.?\d*|RBC\s*\d+[\d,]*|Plt\s*\d+[\d,]*|BUN\s*\d+\.?\d*|Cre\s*\d+\.?\d*|Na\s*\d+|K\s*\d+\.?\d*|AST\s*\d+|ALT\s*\d+|Dダイマー\s*\d+\.?\d*|BNP\s*\d+\.?\d*|PT-INR\s*\d+\.?\d*|体温\s*\d{2}(?:\.\d)?\s*℃?|血圧\s*\d{2,3}\/\d{2,3}\s*mmHg?|SpO2\s*\d{2,3}\s*%?(?:\s*[\(（][^)）]{0,20}[\)）])?)/gi;
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
※「現病歴：」「既往歴：」「診断名：」「保険：」のように見出し付きで記載されている情報は、見出し部分を除いた本文のみを text とし、見出し名を fieldLabel に入れて1項目として切り出してください（日時の切り出しと同じ要領です）。

【NotebookLM 基準ノート】
${globalAppData.notebookContent}

【カルテ・記録テキスト】
${text}

出力は余計な解説を含めず、必ず有効なJSON配列のみを出力してください。`;

          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${globalAppData.apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] })
          });
          if (!res.ok) throw new Error(`Gemini API error (HTTP ${res.status})`);
          const data = await res.json();
          const jsonMatch = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').match(/\[\s*\{[\s\S]*\}\s*\]/);
          if (jsonMatch) {
            let added = 0;
            JSON.parse(jsonMatch[0]).forEach(pi => {
              if (!pi.text) return;
              const cleanedText = cleanExtractedPhrase(pi.text);
              if (cleanedText.length < 2) return;
              const itemTimestamp = pi.timestamp || "日時不明";
              if (!cp.items.some(i => i.text === cleanedText && i.timestamp === itemTimestamp)) {
                const hIds = pi.hendersonIds?.length ? pi.hendersonIds : detectMultipleHendersonTags(cleanedText);
                const aCols = {};
                hIds.forEach(hid => aCols[hid] = 'unclassified');
                const validFieldLabel = FIELD_LABELS.some(f => f.key === pi.fieldLabel) ? pi.fieldLabel : null;
                const fallbackType = validFieldLabel ? (FIELD_LABELS.find(f => f.key === validFieldLabel)?.type || 'o') : 'unclassified';
                cp.items.push({ id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6), text: cleanedText, timestamp: itemTimestamp, type: pi.type || fallbackType, hendersonIds: hIds, assessmentCols: aCols, fieldLabel: validFieldLabel });
                added++;
              }
            });
            saveDataAndSync();
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
        const userLearned = globalAppData.learningUserDict[cleanedText]; // ロード時に共有学習辞書とマージ済み
        // タグ付けも、過去に人が付け直した学習結果があればそれを優先し、なければ固定キーワード辞書で判定
        const detectedHIds = userLearned?.preferredHendersonIds?.length ? userLearned.preferredHendersonIds : detectMultipleHendersonTags(cleanedText);
        // 分類の優先順位: ①学習結果(自分のブラウザ＋全利用者共有、完全一致) → ②見出しラベル → ③固定ルール
        let predictedType = userLearned?.preferredType
          || (chunk.fieldLabel ? (FIELD_LABELS.find(f => f.key === chunk.fieldLabel)?.type || 'o') : null)
          || (/["「][^"「」]+["」]/.test(cleanedText) || /訴え|発言|話す/.test(cleanedText) ? 's' : (chunk.isLabOrVital || /聴取|所見|認める|WBC|CRP|Hb|回\/分|℃|mmHg|上昇/.test(cleanedText) ? 'o' : 'unclassified'));
        const assessmentCols = {};
        detectedHIds.forEach(hId => assessmentCols[hId] = userLearned?.preferredCols?.[hId] || 'unclassified');

        const newItem = { id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6), text: cleanedText, timestamp: chunk.timestamp || "日時不明", type: predictedType, hendersonIds: detectedHIds, assessmentCols, fieldLabel: chunk.fieldLabel || null };
        cp.items.push(newItem);
        // どう自動抽出・自動分類されたかを事例ログに残す（研究用）
        reportLearningEvent(cleanedText, 'create', { type: predictedType, hendersonIds: detectedHIds, assessmentCols, fieldLabel: newItem.fieldLabel });
        addedCount++;
      });
      saveDataAndSync();
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
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${globalAppData.apiKey}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: `あなたは熟練した看護師長・指導者です。以下の「NotebookLM 基準ノート」の検査値評価規則を根拠にして、患者のOデータに含まれる検査値やバイタルの臨床的意味を評価し、総合評価欄向けに分かりやすく解説・アセスメント文章を作成してください。\n【NotebookLM 基準ノート】\n${globalAppData.notebookContent}\n【患者のOデータ一覧】\n${labTexts}\n出力は簡潔かつ専門的で、マークダウン記号を用いた分かりやすいアセスメント文章にまとめてください。` }] }] })
        });
        if (!res.ok) throw new Error(`Gemini API error (HTTP ${res.status})`);
        const data = await res.json();
        DOM.labEvalContent.innerHTML = (cp.labEvaluationResult = (data.candidates?.[0]?.content?.parts?.[0]?.text || '評価の生成に失敗しました。').replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'));
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
${globalAppData.notebookContent}

【参考データ】
${referenceText || '(登録なし)'}

【ヘンダーソン項目ごとの入院前後の記録】
${perNeedSummary.map(n => `${n.name}\n入院前: ${n.pre.join(' / ') || '(記録なし)'}\n入院後: ${n.post.join(' / ') || '(記録なし)'}`).join('\n\n')}

【Oデータ（検査値・バイタル等）一覧】
${labTexts || '(なし)'}

各不足情報は必ず "原因: <不足に至った理由> → <補足すべき内容>と考えられる" という文言そのものを text とし、対応するヘンダーソン番号(1〜14の整数)を hendersonId とするJSON配列のみを出力してください。該当がなければ空配列 [] を返してください。余計な説明やMarkdown記号は出力しないでください。
例: [{"hendersonId":1,"text":"原因: 入院後のSpO2測定記録がない → 呼吸状態の再アセスメントが必要と考えられる"}]`;

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${globalAppData.apiKey}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] })
        });
        if (!res.ok) throw new Error(`Gemini API error (HTTP ${res.status})`);
        const data = await res.json();
        const jsonMatch = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').match(/\[[\s\S]*\]/);
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
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${globalAppData.apiKey}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: `あなたは熟練した看護師長です。以下は患者のSデータ（主観的情報＝患者の発言）とOデータ（客観的情報＝観察所見・検査値）の一覧です。SデータとOデータの間で内容が食い違っている、あるいは併せて考えると注意が必要な組み合わせがあれば指摘してください。矛盾が見当たらない場合はその旨を一言述べてください。\n\n【S/Oデータ一覧】\n${list}\n\n出力は簡潔な箇条書きで、根拠となった発言・所見を引用しながら記述してください。強調したい語のみ太字(**語**)にし、それ以外の記号は使わないでください。` }] }] })
        });
        if (!res.ok) throw new Error(`Gemini API error (HTTP ${res.status})`);
        const data = await res.json();
        const resultText = (data.candidates?.[0]?.content?.parts?.[0]?.text || '結果を取得できませんでした。').replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
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
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${globalAppData.apiKey}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: `あなたは熟練した看護師長・指導者です。以下はヘンダーソン14の基本的欲求ごとに整理された患者のアセスメント情報です。この内容から、想定される看護診断の候補を優先度が高いと思われる順に2〜4個程度提案してください。各候補には診断名・関連するアセスメント根拠・簡単な理由を含めてください。\n\n【ヘンダーソン項目別アセスメント情報】\n${perNeedText}\n\n出力は簡潔な箇条書きで、診断名のみ太字(**診断名**)で示してください。` }] }] })
        });
        if (!res.ok) throw new Error(`Gemini API error (HTTP ${res.status})`);
        const data = await res.json();
        const resultText = (data.candidates?.[0]?.content?.parts?.[0]?.text || '結果を取得できませんでした。').replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
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
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${globalAppData.apiKey}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: `あなたは熟練した看護師です。以下はヘンダーソン14の基本的欲求ごとの、入院前と入院後の記録の比較です。項目ごとに入院前後でどのように変化したかを簡潔にまとめてください。変化が読み取れない項目は省略して構いません。\n\n${perNeedText}\n\n出力は項目名のみ太字(**項目名**)にした簡潔な箇条書きでお願いします。` }] }] })
        });
        if (!res.ok) throw new Error(`Gemini API error (HTTP ${res.status})`);
        const data = await res.json();
        const resultText = (data.candidates?.[0]?.content?.parts?.[0]?.text || '結果を取得できませんでした。').replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
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

    // 不足情報欄にAI推定カードを1件追加する共通処理（AI推定であることが分かるよう aiSuggested フラグを付ける）
    function pushMissingInfoCard(hendersonId, text) {
      const cp = getCurrentPatient();
      cp.items.push({
        id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        text, timestamp: "AI推定", type: 'o',
        hendersonIds: [hendersonId],
        assessmentCols: { [hendersonId]: 'missing' },
        aiSuggested: true
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
      // カードクリックで選択（数字キーでのタグ追加対象にする）。Ctrl/Cmdクリックで複数選択に追加。
      // ボタン・セレクト等の操作要素の上でのクリックは選択に影響させない。
      card.addEventListener('click', e => {
        if (e.target.closest('button, select, a, input')) return;
        toggleCardSelection(item.id, e.ctrlKey || e.metaKey || e.shiftKey);
      });

      const tagsHtml = (item.hendersonIds || []).map(hId => {
        const need = HENDERSON_NEEDS.find(n => n.id === hId);
        return need ? `<span class="tag-chip">${need.name} <button onclick="removeHendersonTag('${item.id}', ${need.id})" class="text-[var(--accent)]/60 hover:text-[var(--brick)] transition"><i class="fa-solid fa-times"></i></button></span>` : '';
      }).join('');
      const untaggedWarningHtml = isUntagged ? `<span class="field-chip" style="background:var(--brick);color:#fff;"><i class="fa-solid fa-triangle-exclamation mr-0.5"></i>タグ未設定</span>` : '';

      const fieldDef = item.fieldLabel ? FIELD_LABELS.find(f => f.key === item.fieldLabel) : null;
      const fieldChipHtml = fieldDef ? `<span class="field-chip" style="background:${fieldDef.bg};color:${fieldDef.color};"><i class="fa-solid ${fieldDef.icon} mr-0.5"></i>${escapeHtml(fieldDef.label)}</span>` : '';
      const timeChipHtml = item.timestamp && item.timestamp !== "日時不明" ? `<span class="time-chip"><i class="fa-regular fa-clock mr-0.5"></i>${escapeHtml(item.timestamp)}</span>` : '';

      card.innerHTML = `
        <div class="flex items-center justify-between gap-1">
          <div class="flex items-center gap-1 flex-wrap">${untaggedWarningHtml}${fieldChipHtml}${timeChipHtml}</div>
          <div class="flex items-center space-x-0.5 ml-auto shrink-0">
            <button onclick="editItemText('${item.id}')" class="icon-btn-outline" title="内容を編集"><i class="fa-solid fa-pen"></i></button>
            <button onclick="deleteItem('${item.id}')" class="icon-btn-outline danger" title="完全削除"><i class="fa-solid fa-times"></i></button>
            ${item.type !== 'unnecessary' ? `<button onclick="setItemType('${item.id}', 'unnecessary')" class="icon-btn-outline" style="border-color:#E4D9C4;color:var(--gold);" title="不要判定"><i class="fa-solid fa-ban"></i></button>` : ''}
          </div>
        </div>
        <p class="font-medium leading-snug break-words text-[var(--ink)]">${escapeHtml(item.text)}</p>
        <div class="flex flex-wrap gap-1 items-center">
          ${tagsHtml}
          <select onchange="addHendersonTag('${item.id}', this.value); this.value='';" class="max-w-[92px] w-auto text-[9px] bg-[var(--paper)] hover:bg-[var(--line-soft)] border ${isUntagged ? 'border-[var(--brick)]' : 'border-[var(--line)]'} rounded-[var(--radius-sm)] px-1 py-0.5 text-[var(--ink-muted)] cursor-pointer focus:outline-none mt-0.5" style="max-width:92px;"><option value="">＋ タグ追加</option>${HENDERSON_NEEDS.map(n => `<option value="${n.id}">${n.name}</option>`).join('')}</select>
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

    function toggleCardSelection(id, additive) {
      if (!additive) {
        // 単独クリック: 同じカードだけが選択されていれば選択解除、それ以外は単独選択に切り替える
        if (selectedCardIds.size === 1 && selectedCardIds.has(id)) selectedCardIds.clear();
        else { selectedCardIds.clear(); selectedCardIds.add(id); }
      } else {
        if (selectedCardIds.has(id)) selectedCardIds.delete(id); else selectedCardIds.add(id);
      }
      renderSoBoard();
    }
    window.clearSelection = function() { selectedCardIds.clear(); renderSoBoard(); };

    function renderBulkActionBar() {
      const bar = document.getElementById('bulk-action-bar');
      if (!bar) return;
      if (selectedCardIds.size === 0) { bar.classList.add('hidden'); return; }
      bar.classList.remove('hidden');
      document.getElementById('bulk-action-count').textContent = `${selectedCardIds.size}件選択中`;
    }

    window.bulkSetType = function(type) {
      const cp = getCurrentPatient();
      let count = 0;
      cp.items.forEach(i => { if (selectedCardIds.has(i.id)) { i.type = type; count++; } });
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
          count++;
        }
      });
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

    window.editItemText = async function(id) {
      const item = getCurrentPatient().items.find(i => i.id === id);
      if (!item) return;
      const oldText = item.text;
      const newText = await openDialog({ title: 'カードの内容を編集', inputValue: item.text, confirmLabel: '更新する' });
      if (newText !== null && (item.text = cleanExtractedPhrase(newText))) {
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
        // 「同じタグ付けが何回選ばれたか」を票として数え、票のあるタグ（0票超）を優先タグとして扱う
        const learned = globalAppData.learningUserDict[item.text] = { ...globalAppData.learningUserDict[item.text] };
        learned.hendersonVotes = { ...(learned.hendersonVotes || {}) };
        learned.hendersonVotes[hId] = (learned.hendersonVotes[hId] || 0) + 1;
        learned.preferredHendersonIds = Object.entries(learned.hendersonVotes).filter(([, c]) => c > 0).map(([k]) => Number(k));
        saveDataAndSync();
        reportLearningEvent(item.text, 'tagAdd', { hendersonId: hId, voteCount: learned.hendersonVotes[hId] });
      }
    };

    window.removeHendersonTag = function(id, hId) {
      const item = getCurrentPatient().items.find(i => i.id === id);
      if (item?.hendersonIds) {
        item.hendersonIds = item.hendersonIds.filter(idNum => idNum !== hId);
        delete item.assessmentCols[hId];
        const learned = globalAppData.learningUserDict[item.text] = { ...globalAppData.learningUserDict[item.text] };
        learned.hendersonVotes = { ...(learned.hendersonVotes || {}) };
        learned.hendersonVotes[hId] = Math.max(0, (learned.hendersonVotes[hId] || 0) - 1);
        learned.preferredHendersonIds = Object.entries(learned.hendersonVotes).filter(([, c]) => c > 0).map(([k]) => Number(k));
        saveDataAndSync();
        reportLearningEvent(item.text, 'tagRemove', { hendersonId: hId, voteCount: learned.hendersonVotes[hId] });
      }
    };

    window.setItemType = function(id, type) {
      const item = getCurrentPatient().items.find(i => i.id === id);
      if (item) {
        const prevType = item.type;
        item.type = type;
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
            if (it) it.type = prevType;
          });
        }
      }
    };

    window.deleteItem = function(id) {
      const cp = getCurrentPatient();
      const idx = cp.items.findIndex(i => i.id === id);
      if (idx === -1) return;
      const [removed] = cp.items.splice(idx, 1);
      const patId = cp.id;
      selectedCardIds.delete(id);
      saveDataAndSync();
      showUndoToast('カードを削除しました', () => {
        const p = globalAppData.patients.find(x => x.id === patId);
        if (p) p.items.splice(Math.min(idx, p.items.length), 0, removed);
      });
    };

    window.clearUnnecessary = function() {
      const cp = getCurrentPatient();
      const removed = cp.items.filter(i => i.type === 'unnecessary');
      if (removed.length === 0) return showToast('不要な情報はありません', 'info');
      cp.items = cp.items.filter(i => i.type !== 'unnecessary');
      const patId = cp.id;
      saveDataAndSync();
      showUndoToast(`不要な情報を${removed.length}件消去しました`, () => {
        const p = globalAppData.patients.find(x => x.id === patId);
        if (p) p.items.push(...removed);
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

        // その欲求の行の中で、上から出てくる順にS/Oそれぞれ通し番号を振る（S-1, S-2 / O-1, O-2 ...）
        let sSeq = 0, oSeq = 0;
        const seqLabels = {};
        matching.forEach(i => {
          if (i.type === 's') seqLabels[i.id] = `S-${++sSeq}`;
          else if (i.type === 'o') seqLabels[i.id] = `O-${++oSeq}`;
        });

        const categorize = col => matching.filter(i => (i.assessmentCols?.[need.id] || 'unclassified') === col).map(i => renderAssessmentCellCard(i, need.id, seqLabels[i.id])).join('');

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
      renderAssessmentProgress(activeItems);
    }

    // ヘンダーソン14項目のうち「情報あり」「不足情報あり」「未入力」がそれぞれ何件かを
    // セグメント帯（14マス）とサマリー文で表示する
    function renderAssessmentProgress(activeItems) {
      const bar = document.getElementById('assessment-progress-bar');
      const summary = document.getElementById('assessment-progress-summary');
      if (!bar || !summary) return;
      let ok = 0, missing = 0, empty = 0;
      const frag = document.createDocumentFragment();
      HENDERSON_NEEDS.forEach(need => {
        const matching = activeItems.filter(i => i.hendersonIds?.includes(need.id));
        let state = 'empty';
        if (matching.length > 0) {
          state = matching.some(i => (i.assessmentCols?.[need.id] || 'unclassified') === 'missing') ? 'missing' : 'ok';
        }
        if (state === 'ok') ok++; else if (state === 'missing') missing++; else empty++;
        const seg = document.createElement('div');
        seg.className = 'h-2 rounded-[3px] flex-1';
        seg.title = `${need.id}. ${need.name.replace(/^\d+\.\s*/, '')}：${state === 'ok' ? '情報あり' : state === 'missing' ? '不足情報あり' : '未入力'}`;
        seg.style.background = state === 'ok' ? 'var(--accent)' : state === 'missing' ? 'var(--brick)' : 'var(--line)';
        frag.appendChild(seg);
      });
      bar.replaceChildren(frag);
      summary.textContent = `情報あり ${ok}/14　不足あり ${missing}件　未入力 ${empty}件`;
    }

    function renderAssessmentCellCard(item, hId, seqLabel) {
      const currentCol = item.assessmentCols?.[hId] || 'unclassified';
      const isS = item.type === 's';
      const isO = item.type === 'o';
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
        <div id="asc_${item.id}_${hId}" draggable="true" ondragstart="handleAssessmentDragStart(event, '${item.id}')" ondragend="handleAssessmentDragEnd(event)" class="p-1.5 rounded-[var(--radius-sm)] border ${item.aiSuggested ? 'border-dashed' : ''} border-[var(--line)] text-[10px] flex flex-col gap-1 cursor-grab active:cursor-grabbing hover:border-[var(--accent)] transition" style="background:${cardBg};border-left-width:3px;border-left-color:${accentColor};">
          <div class="flex items-start justify-between gap-1">
            <div class="flex items-start gap-1 flex-1 min-w-0">
              <div class="shrink-0 mt-0.5 flex items-center gap-0.5 flex-wrap">${badge} ${aiTag} ${fieldTag} ${time}</div>
              <span class="text-[var(--ink)] font-medium break-words leading-tight">${escapeHtml(item.text)}</span>
            </div>
            <div class="flex items-center space-x-1 shrink-0">
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

    window.handleAssessmentDragStart = (e, id) => { e.dataTransfer.setData('text/plain', 'asc_' + id); e.currentTarget.classList.add('card-dragging'); };
    window.handleAssessmentDragEnd = e => e.currentTarget.classList.remove('card-dragging');
    window.handleAssessmentDrop = (e, hId, targetCol) => {
      e.preventDefault();
      const dragData = e.dataTransfer.getData('text/plain');
      if (dragData?.startsWith('asc_')) setAssessmentCol(dragData.replace('asc_', ''), hId, targetCol);
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
        getCurrentPatient().items.push({ id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6), text, timestamp: "追記", type: 'o', hendersonIds: [hId], assessmentCols: { [hId]: 'missing' } });
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
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${globalAppData.apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: "画像に含まれる看護基準・プロトコル・参考資料の内容を正確に文字起こししてください。" }, { inline_data: { mime_type: file.type || "image/jpeg", data: e.target.result.split(',')[1] } }] }] })
          });
          if (!res.ok) throw new Error(`Gemini API error (HTTP ${res.status})`);
          const data = await res.json();
          const ocrText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
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

    document.getElementById('btn-open-settings').addEventListener('click', () => { document.getElementById('input-api-key').value = globalAppData.apiKey; document.getElementById('modal-settings').classList.remove('hidden'); });
    document.getElementById('btn-close-settings').addEventListener('click', () => document.getElementById('modal-settings').classList.add('hidden'));
    document.getElementById('btn-save-settings').addEventListener('click', () => { globalAppData.apiKey = document.getElementById('input-api-key').value.trim(); localStorage.setItem('gemini_api_key', globalAppData.apiKey); document.getElementById('modal-settings').classList.add('hidden'); showToast('設定を保存しました', 'success'); });
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
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${globalAppData.apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: "画像に含まれるカルテ記載や検査データ結果（WBC, CRP, Hb, クレアチニン等）を正確に文字起こししてください。" }, { inline_data: { mime_type: file.type || "image/jpeg", data: e.target.result.split(',')[1] } }] }] })
          });
          if (!res.ok) throw new Error(`Gemini API error (HTTP ${res.status})`);
          const data = await res.json();
          const ocrText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
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

