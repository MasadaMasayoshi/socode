    // 看護アセスメント支援システム：07-classification.js（全10ファイルのうち 7 番目）
    // 分類：タグの判定（detectMultipleHendersonTags）、追加キーワード、文章からカードへの切り分け（groupClinicalPhrasesWithTimestamps）、「分類開始」ボタン。
    // index.html の <script> で 01〜10 の順に読み込み、1つのプログラムとして動きます
    // （順番を入れ替えないでください。以前の app.js を内容ごとに分けたものです）。

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['07'] = '2026-10-06.10'; // 版（scripts/stamp-version.js が書き込む）
    // 「祖母を胃がん、父を前立腺がんで亡くしている〜」のような家族歴の文は、本人の食事・栄養
    // 状態の所見ではないにもかかわらず、id2(食事)の疾患名キーワード（「胃がん」等）に一致して
    // しまい、食事に無関係な家族歴が「2. 食事」に混入していた（利用者からの報告事例）。
    // 「（祖父母・父母・きょうだい・おじおば）を〜がんで亡くした/亡くしている」という家族歴の
    // 文脈が検出された場合に限り、本人の疾患名としてのみ意味を持つキーワード（「胃がん」等、
    // id2で本人の消化器疾患の診断名として登録されているもの）の一致を除外する。他の一般的な
    // 食事・栄養関連キーワード（「食欲」「摂取量」等）はこのガードの対象外で、家族歴の文でも
    // 引き続き通常どおり判定される。
    const FAMILY_HISTORY_DISEASE_CONTEXT_REGEX =
      /(祖父|祖母|父|母|兄|姉|弟|妹|叔父|叔母|伯父|伯母)を?[^。、]{0,20}(がん|癌)[^。]{0,15}(亡くな|亡くし|他界|死去)/;
    const OWN_DIAGNOSIS_ONLY_KEYWORDS = new Set(["胃がん", "胃癌"]);
    const NEGATABLE_SPEECH_KEYWORDS = new Set(["訴え", "話す", "語る"]);
    // キーワードの直後が特定の語のときは、別の意味で使われているため一致させない（利用者からの指摘：患者38）。
    //  「体重をかける」「体重をのせる」＝荷重（4.姿勢）であり、体格の「体重」（2.食事）ではない
    //  「安静時」＝ペインスケール等の評価の条件であり、安静度の指示（4.姿勢）ではない
    //  「不安定」＝動作のふらつき（4.姿勢）であり、心理的な「不安」（10.コミュニケーション）ではない
    //  「TP：〜」＝看護計画の援助計画（OP・TP・EP）であり、検査値の総蛋白（2.食事）ではない（利用者からの指摘：
    //   リハビリ・日常生活の姿勢の説明のカードが2.食事になっていた）
    const KEYWORD_FOLLOWING_EXCLUSIONS = {
      "体重": /^\s*(?:を|が|は|も)?\s*(?:かけ|掛け|のせ|乗せ|負荷|支持|免荷)/,
      "安静": /^時/,
      // 「昼食後より内服開始」「昼食、点滴終了」のように食事の時間を目安として書いただけのものは2.食事にしない
      "朝食": /^(?:後|前|時|まで|より|から|[、:：]\s*(?:点滴|抗|内服|投与|与薬|検温|処置))/,
      "昼食": /^(?:後|前|時|まで|より|から|[、:：]\s*(?:点滴|抗|内服|投与|与薬|検温|処置))/,
      "夕食": /^(?:後|前|時|まで|より|から|[、:：]\s*(?:点滴|抗|内服|投与|与薬|検温|処置))/,
      "不安": /^定/,
      // 「活動的に生活している」＝性格・生活ぶりの表現であり、動作の情報（4.姿勢）ではない（利用者からの指摘：患者36）
      "活動": /^的/,
      // 「（娘に）仕事を休ませてしまって」＝家族の仕事（新しい長文事例のテスト：緩和ケアの事例）
      "仕事": /^を休ませ/,
      "TP": /^\s*[:：]\s*[^\d\s.]|^\s*[（(]\s*援助/
    };
    // キーワードの直前が特定の語のときも、別の意味なので一致させない（利用者からの指摘）。
    //  「息子は仕事があるから」＝家族の仕事であり、患者本人の仕事・役割（12.仕事）ではない
    //  「高血圧」＝病名（既往歴）であり、その場で測った血圧（1.呼吸の循環の観察）ではない（利用者からの指摘：患者34）
    //  「義歯」の「歯」＝口腔の清潔（8）ではなく、咀嚼（2.食事）の情報（利用者からの指摘：患者36）
    const KEYWORD_PRECEDING_EXCLUSIONS = {
      "歯": /義$/,
      // 「起座位」は呼吸が苦しくて座る姿勢（1.呼吸）で、4.姿勢の「座位」ではない
      "座位": /起$/,
      // 「麻酔から目が覚めなかったら」は手術の不安で、夜間の睡眠（5）ではない
      "目が覚め": /麻酔から[^。」]{0,5}$/,
      "血圧": /高$/,
      // 「長男:23歳、会社員」のような家族の職業は、患者本人の仕事（12.仕事）ではない
      "会社員": /(?:息子|娘|夫|妻|嫁|婿|長男|次男|三男|長女|次女|三女|主人|旦那|孫|兄|姉|弟|妹|父|母)[^。]{0,10}$/,
      "退職": /(?:息子|娘|夫|妻|嫁|婿|長男|次男|三男|長女|次女|三女|主人|旦那|孫|兄|姉|弟|妹|父|母)[^。]{0,10}$/,
      "パート": /(?:息子|娘|夫|妻|嫁|婿|長男|次男|三男|長女|次女|三女|主人|旦那|孫|兄|姉|弟|妹|父|母)[^。]{0,14}$/,
      "勤務": /(?:息子|娘|夫|妻|嫁|婿|長男|次男|三男|長女|次女|三女|主人|旦那|孫|兄|姉|弟|妹|父|母)[^。]{0,14}$/,
      "教員": /(?:息子|娘|夫|妻|嫁|婿|長男|次男|三男|長女|次女|三女|主人|旦那|孫|兄|姉|弟|妹|父|母)[^。]{0,14}$/,
      "定年": /(?:息子|娘|夫|妻|嫁|婿|長男|次男|三男|長女|次女|三女|主人|旦那|孫|兄|姉|弟|妹|父|母)[^。]{0,10}$/,
      "仕事": /(?:息子|娘|夫|妻|嫁|婿|家族|長男|次男|三男|長女|次女|三女|主人|旦那|孫|兄|姉|弟|妹|子ども|子供|親|父|母)(?:さん|たち|達)?(?:は|も|が|の|には|にも)?[^。、」「]{0,6}$/
    };
    // 英字だけのキーワード（TP・VF・BT等）は、ほかの英単語の一部（「OUTPUT」の中の「TP」等）には一致させない
    const ASCII_KEYWORD_REGEX = /^[A-Za-z0-9]+$/;
    function isValidKeywordOccurrence(text, kw, idx) {
      const after = text.slice(idx + kw.length);
      if (KEYWORD_FOLLOWING_EXCLUSIONS[kw] && KEYWORD_FOLLOWING_EXCLUSIONS[kw].test(after)) return false;
      if (KEYWORD_PRECEDING_EXCLUSIONS[kw] && KEYWORD_PRECEDING_EXCLUSIONS[kw].test(text.slice(Math.max(0, idx - 20), idx))) return false;
      if (ASCII_KEYWORD_REGEX.test(kw) && (/[A-Za-z]$/.test(text.slice(0, idx)) || /^[A-Za-z]/.test(after))) return false;
      return true;
    }
    function hasValidKeywordOccurrence(text, kw) {
      let idx = text.indexOf(kw);
      while (idx !== -1) {
        if (isValidKeywordOccurrence(text, kw, idx)) return true;
        idx = text.indexOf(kw, idx + 1);
      }
      return false;
    }
    // 以前の呼び出し口（他の処理から使われている）も残す
    function hasOccurrenceNotFollowedBy(text, kw, excludeRegex) {
      let idx = text.indexOf(kw);
      while (idx !== -1) {
        if (!excludeRegex.test(text.slice(idx + kw.length))) return true;
        idx = text.indexOf(kw, idx + 1);
      }
      return false;
    }
    // 看護師・療法士が患者に説明・指導したこと（日常生活で気をつける姿勢、ナースコールの使い方等）は、
    // 患者の学び（14.学び）の情報でもある（利用者からの指摘：リハビリ・姿勢の説明は「14. 学び」）。
    // 医師からの病状説明（「主治医より経過良好と説明あり」）は対象にしない。
    const LEARNING_NEED_IN_QUOTE_REGEX = /(?:気を付け|気をつけ|注意し)(?:ないと|ないといけない|れば|たらいい|ること)|(?:わから|分から)ない(?:ので|から)?.{0,8}(?:教えて|知りたい)|教えて(?:ください|ほしい|欲しい)|知りたい|どうしたら(?:いい|よい)の?|何に気を/;
    // 治療・動作についての本人の疑問（「〜しても大丈夫なの？」「もう起きていいの？」「ずれたりしないかしら？」）
    const TREATMENT_QUESTION_IN_QUOTE_REGEX = /(?:ても|でも)(?:大丈夫|いい|平気)な(?:の|のかな|んですか|んでしょうか)|もう(?:起きて|動いて|歩いて)(?:も)?(?:いい|大丈夫)|ずれたりしない|外れたりしない/;
    const PATIENT_EDUCATION_REGEX = /(?:看護師|Ns|ナース|理学療法士|作業療法士|PT|OT|担当者)(?:より|から|が|は)[^。]{0,40}(?:説明|指導|伝え|練習)|(?:よう|ように)(?:に)?(?:説明|指導|伝え|声かけ|声掛け)|気をつけ(?:る|て|ましょう)|注意点|生活上の注意|退院指導|生活指導|パンフレット|(?<![A-Za-z])EP\s*[:：]/;
    // 発言（「」内）が気持ちや疑問・心配を表しているか（その場合は10.コミュニケーションの所見とする）
    // 「迷惑はかけられない」「遠慮」のような家族への気がねも、気持ちの表出として扱う（利用者からの指摘）
    // 「〜したい」「〜してほしい」のような願い・希望の表出も同様（「早く自分でトイレに行けるようになりたい」）
    const QUOTE_FEELING_OR_QUESTION_REGEX = /(気持ち(?:が)?悪|いいんだけど|いいのに|といいな|緊張|たい(?:な|なあ|ね|わ|よ|です)?(?=[」。、!！?？]|$)|ほしい|欲しい|迷惑|遠慮|気がね|気兼ね|怖|恐|不安|心配|情けな|つら|辛|悲し|寂し|さみし|嫌|いや|困|悩|落ち込|イライラ|恥ずかし|悔し|嬉し|うれし|楽しみ|ありがと|申し訳|すみません|\?|？|かしら|かな(?=[?？。」、!！]|$)|だろう|でしょう)/;
    const SPEECH_NEGATION_REGEX = /^\s*(?:なし|無し|なく|無く|ない|無い|は(?:なし|無し|ない|無い|なく)|も(?:なし|なく|ない))/;
    function hasNonNegatedOccurrence(text, kw) {
      let idx = text.indexOf(kw);
      while (idx !== -1) {
        if (!SPEECH_NEGATION_REGEX.test(text.slice(idx + kw.length))) return true;
        idx = text.indexOf(kw, idx + 1);
      }
      return false;
    }
    // 【見出し付きの生活の情報】「睡眠: 7時間程度…現在は痛みのため眠れていない」「趣味: 友人と旅行を楽しむ
    // など、活動的に生活している」「嚥下・咀嚼障害: なし 上下義歯があるが不具合はない」のように、生活習慣・
    // 身体機能の欄の見出しが行頭にあるカードは、その見出しの項目の情報として扱い、そのタグだけを付ける
    // （利用者からの指摘：患者36。以前は本文の「痛み」「活動」「歯」等の語で9.環境・4.姿勢・8.清潔も付いていた）。
    const LABEL_PRIMARY_NEEDS = {
      '睡眠': [5], '休息': [5], '食事': [2], '嚥下・咀嚼障害': [2], '嚥下': [2], '咀嚼': [2], '体格': [2], '栄養': [2],
      '排泄': [3], '排尿': [3], '排便': [3], '清潔': [8], '入浴': [8], '更衣': [6], '活動': [4], '歩行': [4], '運動': [4], '移動': [4],
      '趣味': [13], '余暇': [13], '宗教': [11], '信仰': [11], '性格': [10], 'コミュニケーション障害': [10], '聴覚': [10], '視覚': [10],
      '平衡感覚': [9], '触覚': [9], '疼痛': [9], '呼吸状態': [1], '呼吸機能検査結果': [1], '循環動態': [1], '理解力': [14]
    };
    function labelPrimaryNeeds(text) {
      const m = (text || '').match(/^([^:：「」、。\s]{1,14})\s*[:：]/);
      return m && LABEL_PRIMARY_NEEDS[m[1]] ? LABEL_PRIMARY_NEEDS[m[1]] : null;
    }
    // 【「なし」と否定された症状】「呼吸困難感訴えなし、肺Air入り良好、嘔気・嘔吐なし」の「嘔気・嘔吐なし」、
    // 「端坐位になり、食事摂取する 疼痛増強なし」の「疼痛増強なし」のように、ほかの観察に添えて「〜なし」と
    // 書かれた症状は、そのカードの主な内容ではない（利用者からの指摘：患者36）。その項目のキーワードが
    // すべて否定された症状だけのときは、ほかの項目のタグがあればその項目のタグを付けない（その症状だけの
    // カード「嘔気・嘔吐なし」「疼痛増強見られず」なら、これまで通りその項目に付ける）。
    const WEAK_WHEN_NEGATED = { 2: ['嘔気', '嘔吐', '悪心', '吐気', 'むかつき'], 9: ['疼痛', '痛み', '痛'] };
    const SYMPTOM_NEGATION_REGEX = /^(?:[・、](?:嘔気|嘔吐|悪心|吐気|むかつき|疼痛|痛み))*[^、。「」]{0,4}?(?:なし|無し|認めず|みられず|見られず|はない|はなし|なく|ない|\(-\))/;
    function isNegatedEverywhere(text, kw) {
      let idx = text.indexOf(kw);
      if (idx === -1) return false;
      while (idx !== -1) {
        if (!SYMPTOM_NEGATION_REGEX.test(text.slice(idx + kw.length))) return false;
        idx = text.indexOf(kw, idx + 1);
      }
      return true;
    }
    // 【痛みの評価のカードの「〇〇時」】「安静時ペインスケール「2-3」 体位変換時「5-6」」「ペインスケール「5-6」
    // 側臥位時、外転枕使用している」のように、痛みの評価の条件として書かれた姿勢の語では4.姿勢を付けない
    // （利用者からの指摘：患者36「疼痛や安楽の確保は9」）。荷重・移乗・歩行・リハビリ等の動作が書かれていれば4も付ける。
    const PAIN_SCORE_REGEX = /ペインスケール|NRS|VAS|フェイススケール/;
    const POSTURE_ACTIVITY_REGEX = /荷重|移乗|歩行|歩く|歩け|リハビリ|離床|端坐位|立位|移動|ROM|SLR|可動域|起立/;
    function detectMultipleHendersonTags(text) {
      // 会話形式で答えに添えた看護師の問い（「（問い：薬は毎日飲めていましたか）」）は、タグの判定に使わない
      text = String(text || '').replace(/（問い：[^）]*）/g, '');
      const tags = new Set();
      const skipOwnDiagnosisKeywords = FAMILY_HISTORY_DISEASE_CONTEXT_REGEX.test(text);
      // 利用者が「学習データ管理」→「追加キーワード」で登録したルール（customTagRuleSets参照）
      const custom = customTagRuleSets();
      const primary = labelPrimaryNeeds(text);
      if (primary) {
        primary.forEach(h => tags.add(h));
        custom.add.forEach(r => { if (text.includes(r.keyword)) r.hendersonIds.forEach(h => tags.add(h)); });
        return Array.from(tags);
      }
      const weakNeeds = [];
      for (const need of HENDERSON_NEEDS) {
        const hits = need.keywords.filter(kw => {
          if (custom.excluded.has(`${need.id}\u0000${kw}`)) return false; // 「このキーワードでは付けない」
          if (skipOwnDiagnosisKeywords && OWN_DIAGNOSIS_ONLY_KEYWORDS.has(kw)) return false;
          // 「呼吸困難訴えなし」「疼痛訴えなく」のように、訴え・発言が「無い」ことの記載は看護師による
          // 観察の所見であり、10.コミュニケーションの手がかりにはしない（利用者からの指摘）。
          // 「訴える」「話す」は、それだけでは10.コミュニケーションにしない（下で判定する）
          if (NEGATABLE_SPEECH_KEYWORDS.has(kw)) return false;
          return hasValidKeywordOccurrence(text, kw);
        });
        if (hits.length) {
          tags.add(need.id);
          const weakList = WEAK_WHEN_NEGATED[need.id];
          if (weakList && hits.every(kw => weakList.includes(kw) && isNegatedEverywhere(text, kw))) weakNeeds.push(need.id);
        }
      }
      // 患者本人の直接の発言（「〜」）は、内容そのもの（OCRの乱れ等でキーワード辞書のどれとも
      // 一致しない場合を含む）にかかわらず、コミュニケーション（10.感情等の表出・伝達能力）の
      // 所見そのものである（S/O判定でも「〜」を患者本人の発言＝Sデータの手がかりとして
      // 扱っている基準と同じ考え方）。利用者からのアップロード文書で発覚：OCRで一部の文字が
      // 誤読され、他のキーワードとも一致しない患者の発言（「やっぱりやらなくちゃいけないの?」
      // 「ああ」等）を含むカードがタグ未設定のまま残っていた。
      // ただし「ペインスケール「2-3」」のように数字・記号だけを囲んだ括弧は発言ではないため
      // 対象外とする（S_QUOTE_REGEXの説明を参照。利用者からのアップロード文書で発覚）。
      // 【修正】発言を含むだけで一律に10を付けると、「「あまり食欲がない」と半分のみ摂取」（2.食事）や
      // 「排便なし…「動いてないからお腹が張っている」」（3.排泄）のように、発言の中身がはっきり別の欲求に
      // ついての情報でも10に入ってしまっていた（利用者からの指摘：患者38）。発言が気持ち（怖い・不安・
      // 情けない等）や疑問・心配（「〜なの？」「〜かしら」）を表している場合、または他のどの項目にも
      // 当てはまらない場合だけ10を付ける。
      // 医師・看護師等の言葉の「」（「担当看護師より「無理はしないようにしてほしい」」）は患者の気持ちの
      // 表出ではないので、ここでは数えない（stripStaffQuotes。利用者からの指摘：患者36）。
      const patientText = stripStaffQuotes(text);
      const QUOTED_SPEECH_REGEX = /「[^」]{0,300}[ぁ-んァ-ヶ一-龠々][^」]{0,300}」/;
      if (QUOTED_SPEECH_REGEX.test(patientText)) {
        const quotes = (patientText.match(/「[^」]*」/g) || []).join('');
        if (tags.size === 0 || QUOTE_FEELING_OR_QUESTION_REGEX.test(quotes)) tags.add(10);
      }
      // 「息苦しくて眠れなかった」と訴える、「少し呼吸が楽になった」と話す のように、身体の症状を伝えている
      // 場合は、その症状の項目（1.呼吸・5.睡眠等）の情報であり、10.コミュニケーション（気持ちの表出・
      // 伝達の障害）ではない（利用者からの指摘：患者34）。「訴え」「話す」「語る」は、ほかにどの項目も
      // 当てはまらないときだけ10.コミュニケーションの手がかりにする（発言の「」の扱いと同じ考え方）。
      if (tags.size === 0 && Array.from(NEGATABLE_SPEECH_KEYWORDS).some(kw => hasNonNegatedOccurrence(text, kw))) tags.add(10);
      if (PATIENT_EDUCATION_REGEX.test(text)) tags.add(14);
      // 患者の発言の中の「何に気を付けないといけないのかわからない」「また教えてください」のような、
      // 退院後の生活についての知識不足・学びたい気持ちの表出は14.学び（利用者からの指摘：患者36）
      const patientQuotes = (patientText.match(/「[^」]*」/g) || []).join('');
      if (LEARNING_NEED_IN_QUOTE_REGEX.test(patientQuotes)) {
        tags.add(14);
        // 退院後・家での生活についての心配は、安全（転倒・脱臼の予防）の情報でもある（9を追加）
        if (/退院|家に帰|自宅|家の中|帰って/.test(patientQuotes)) tags.add(9);
      }
      // 【利用者からの指摘・患者36（14.学び・タグ不足）】治療や動くことへの疑問・心配（「人工骨頭がずれたりしない？」
      // 「体重かけても大丈夫なの？」「もう起きていいの？」）は、知識の不足＝14.学びの情報。
      // 人工骨頭のずれ（脱臼）の心配は4.姿勢・9.安全、荷重の心配は4.姿勢・9.安全にもかかわる。
      if (patientQuotes) {
        if (TREATMENT_QUESTION_IN_QUOTE_REGEX.test(patientQuotes)) tags.add(14);
        if (/人工骨頭|人工関節|脱臼|ずれたり/.test(patientQuotes)) { tags.add(4); tags.add(9); tags.add(14); }
        if (/体重を?かけ(?:て|ても)(?:も)?大丈夫|(?:足を)?つい(?:て|ても)大丈夫/.test(patientQuotes)) { tags.add(4); tags.add(9); tags.add(14); }
        // 思うように動けない情けなさ・できるようになってきた手応えは、12.達成感の情報でもある
        if (/情けな|思うように(?:動け|でき|なら)な/.test(patientQuotes)) tags.add(12);
        if (/(?:動ける|歩ける|できる|立てる)ように(?:なって|なっ)き/.test(patientQuotes)) { tags.add(12); if (/動け|歩け|立て/.test(patientQuotes)) tags.add(4); }
        // 旅行などの楽しみの発言は13.余暇。ただし「出かける日は（薬を）飲みたくない」のような服薬の話は13にしない（心不全事例）
        const aboutMedicine = /薬|飲み|飲ま|飲ませ|内服|服薬/.test(patientQuotes);
        if (/旅行|趣味|遊びに/.test(patientQuotes) || (/出かけ/.test(patientQuotes) && !aboutMedicine)) tags.add(13);
        // 服薬の自己判断（「出かける日は飲みたくない」「飲ませていませんでした」）・薬を知らない（「何を飲んでいるかは知らない」）は14
        if (aboutMedicine && /飲みたくない|飲まない|飲まなかった|飲ませて(?:い)?(?:ない|ません)|やめ|知らない|わからない|分からない/.test(patientQuotes)) tags.add(14);
        // 知らなかったことに気づいた発言（「漬物1切れでそんなに塩が入っているのか。知らなかった」）は14
        if (/知らなかった|初めて知った|知りませんでした/.test(patientQuotes)) tags.add(14);
        // 自己管理の難しさ（「毎朝体重を測るのは面倒」「家には体重計がない」「手帳は家内に書いてもらう」）は14
        if (/体重計|測る(?:の)?(?:は|が)?面倒|記録(?:する|を)|手帳/.test(patientQuotes)) tags.add(14);
        // 【改善点ファイル・患者36】病状・治療について聞いたこと（「6/10に手術をすると聞いていて」）は病識・理解度＝14.学び
        if (/と聞いて(?:いる|いて|いた)|と言われて(?:いる|いて|いた)|と説明され/.test(patientQuotes)) tags.add(14);
        // 薬の使い方の思い込み（「痛み止めって我慢できなくなってから使うものでしょう？」）は14.学び
        if (/(?:痛み止め|鎮痛(?:剤|薬)|薬)[^」]{0,24}(?:もの|の)(?:でしょう|なの|じゃない|かしら)|我慢(?:でき)?なくなってから/.test(patientQuotes)) tags.add(14);
        // 「痛くちゃ動けない」のような動けなさの訴えは4.姿勢（離床・動作の制限）
        if (/動けな(?:い|く)|動けん/.test(patientQuotes)) tags.add(4);
      }
      // 【改善点ファイル・患者36】骨折・牽引・人工骨頭・術後肢位（脱臼予防）・患肢の循環は、4.姿勢と9.安全（合併症・
      // 脱臼の予防、牽引中の安全管理・足背動脈など患肢の循環）が表裏一体なので、4に加えて9も付ける。
      if ((tags.has(4) && /骨折|人工骨頭|置換術|(?<![A-Za-z])(?:BHA|THA)(?![A-Za-z])|牽引|けん引|キルシュナー|外転枕|脱臼|内旋|屈曲禁止/.test(text))) tags.add(9);
      // 薬を忘れる（「長期管理薬について、最近は使用を忘れる日がある」）は、発言でなくても14.学び（服薬の自己管理）
      if (/薬/.test(text) && /忘れ/.test(text)) tags.add(14);
      // 手術・治療の説明を受けて入院した経緯は、病識・治療の理解（14.学び）にかかわる
      if (/(?:手術|治療|病状)の説明を(?:う|受)け/.test(text)) tags.add(14);
      // 貧血の検査値（RBC・Hb・Ht）は、酸素を運ぶ力の低下を通して呼吸・循環（1.呼吸）にもかかわる
      if (/貧血|RBC|赤血球|ヘモグロビン|ヘマトクリット|(?<![A-Za-z])(?:Hb|Hgb|Ht|Hct)(?![A-Za-z0-9])/.test(text) && /\d/.test(text)) tags.add(1);
      // 【利用者からの指摘・患者36（7.体温）】「知覚異常、冷感なし」は患肢の循環・神経の評価であり、体温調節ではなく9.安全
      if (tags.has(7) && /知覚|しびれ|痺れ|足背動脈|患肢|末梢|チアノーゼ|感覚/.test(text) && !/体温|発熱|悪寒|熱感|℃|°C|検温|(?<![A-Za-z])(?:KT|BT)(?![A-Za-z])/.test(text)) {
        tags.delete(7); tags.add(9);
      }
      // 否定された症状だけの項目（上の WEAK_WHEN_NEGATED）は、ほかのタグがあれば外す
      weakNeeds.forEach(h => { if (tags.size > 1) tags.delete(h); });
      // 痛みの評価の条件としての姿勢の語だけなら、4.姿勢は付けない（上の PAIN_SCORE_REGEX の説明を参照）
      if (tags.has(4) && tags.has(9) && PAIN_SCORE_REGEX.test(text) && !POSTURE_ACTIVITY_REGEX.test(text)) tags.delete(4);
      // 「このキーワードを含むときは〇〇のタグを付ける」（14項目の既定のキーワードに無い語・
      // 「生殖」のようにどの項目に入れるかを現場で決める情報の受け皿）
      // 家族の発言（「次女「仕事があるので日中はどうしたらいいか」」）の仕事は家族の仕事で、本人の12.仕事ではない
      if (tags.has(12) && new RegExp(`^${FAMILY_SPEAKER_WORD}(?:さん)?(?:[:：]|より|から|は|が)?\\s*「`).test(text.trim()) &&
        !/(?:本人|患者|[母父]|祖[母父])(?:さん)?(?:は|の|が|も)?[^。」]{0,8}(?:仕事|勤務|退職|会社|職場)/.test(text)) tags.delete(12);
      custom.add.forEach(r => { if (text.includes(r.keyword)) r.hendersonIds.forEach(h => tags.add(h)); });
      return Array.from(tags);
    }

    // ==========================================================================
    // 追加キーワード（利用者が画面から登録できるタグ付けルール）
    // ------------------------------------------------------------------------
    // 利用者への改善提案6：「14項目に入らない情報（例：生殖）の扱いを決めて、アプリの設定から
    // 変えられるようにする」。プログラムを直さなくても、学習データ管理の「追加キーワード」タブで
    //   ・mode 'add'    ：文章に keyword を含むとき、hendersonIds のタグを付ける
    //   ・mode 'exclude'：14項目の既定のキーワード keyword では、hendersonIds のタグを付けない
    //                    （例：「枕」で1.呼吸が付くのをやめる。他のキーワードで付く場合は付く）
    // を登録できる。サーバー（data/custom-tag-rules.json／MongoDB）に保存され全員で共有される。
    // サーバーに繋がらないときのために、このブラウザにも写しを保存しておく。
    // ==========================================================================
    const CUSTOM_TAG_RULES_CACHE_KEY = 'nursing_custom_tag_rules';
    function normalizeCustomTagRules(rules) {
      if (!Array.isArray(rules)) return [];
      return rules.map(r => ({
        id: typeof r?.id === 'string' && r.id ? r.id : 'rule_' + Math.random().toString(36).slice(2, 10),
        keyword: typeof r?.keyword === 'string' ? r.keyword.normalize('NFKC').trim().slice(0, 40) : '',
        mode: r?.mode === 'exclude' ? 'exclude' : 'add',
        hendersonIds: Array.from(new Set((Array.isArray(r?.hendersonIds) ? r.hendersonIds : []).map(Number).filter(h => Number.isInteger(h) && h >= 1 && h <= 14))).sort((a, b) => a - b),
        note: typeof r?.note === 'string' ? r.note.trim().slice(0, 200) : '',
        updatedAt: typeof r?.updatedAt === 'string' ? r.updatedAt : null
      })).filter(r => r.keyword && r.hendersonIds.length > 0);
    }
    function loadCachedCustomTagRules() {
      try { return normalizeCustomTagRules(JSON.parse(localStorage.getItem(CUSTOM_TAG_RULES_CACHE_KEY) || '[]')); } catch (e) { return []; }
    }
    // 起動直後は、このブラウザに保存してある写しを使う（サーバーの共有内容は loadCustomTagRules で取得）
    globalAppData.customTagRules = loadCachedCustomTagRules();
    // detectMultipleHendersonTags から毎回呼ばれるため、ルールが変わったときだけ作り直す
    var customTagRuleSetsCache = null;
    function customTagRuleSets() {
      const rules = (typeof globalAppData !== 'undefined' && globalAppData && globalAppData.customTagRules) || [];
      if (customTagRuleSetsCache && customTagRuleSetsCache.source === rules) return customTagRuleSetsCache;
      const excluded = new Set();
      rules.filter(r => r.mode === 'exclude').forEach(r => r.hendersonIds.forEach(h => excluded.add(`${h}\u0000${r.keyword}`)));
      customTagRuleSetsCache = { source: rules, add: rules.filter(r => r.mode === 'add'), excluded };
      return customTagRuleSetsCache;
    }
    // 「このキーワードでは付けない」を登録しても効くのは、そのタグの既定のキーワードそのものの場合だけ
    // （画面で登録前に確認する。既定のキーワードに無い語なら、そもそもそのタグは付かない）
    function isBuiltInKeywordOf(hendersonId, keyword) {
      const need = HENDERSON_NEEDS.find(n => n.id === hendersonId);
      return !!need && need.keywords.includes(keyword);
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

    // formatLabValueStringが数値の直後に続く文字列（単位のはずの部分）を検証するための正規表現。
    // 【原因と修正】以前は数値を捕捉した後に続く文字列を検証せず無条件に捨てて正式な単位に
    // 置き換えていたため、「511万/uL」「41.8%」のような正しくOCRされた単位表記だけでなく、
    // 「60g/21」（おそらく「6.0g/dL」の「.」と「dL」がOCRで失われ、小数点の位置も分からなく
    // なった破損表記）のような、単位として認識できない残骸まで無条件に切り捨てて「60 g/dL」
    // という誤った数値を作り出してしまう恐れがあった（利用者からの報告：術前検査結果の表で
    // 「TP」という項目名の行自体が消え、値の行「60g/21」だけがラベルの無いカードとして残っていた
    // 実例の調査で発覚。原因は「TP」＋「60g/21」の結合を試みる際、値の行が単位として認識できず
    // 結合自体に失敗し、項目名の行が読み進める側で捨てられてしまっていたこと）。
    // 数値の直後の残りが、既知の単位（万・×10^n表記・g/dL等）や上下矢印(↑↓)等の組み合わせで
    // 説明できる場合に限って変換を行い、説明できない残骸が残る場合は数値を誤って作り出すより
    // 元の文字列をそのまま残す方が安全と判断し、変換しない。
    const LAB_VALUE_TRAILING_UNIT_REGEX =
      /^\s*万?\s*(?:[×xX]\s*10\s*(?:\^?\s*\d+|[⁰¹²³⁴⁵⁶⁷⁸⁹]+))?\s*(?:千|万)?\s*(?:\/\s*[μu从µ]L|\/mm3|\/mm³|\/μl|\/mL|[μuµmnp]?g\/(?:dL|L|mL)|I?U\/L|\/L|mE[qa]\/L|[mμuµ]mol\/L|fL|%|℃|°C|°c|mmHg|回\/分|秒)?\s*[↑↓HLhl]?\.?\s*$/i;

    function formatLabValueString(str) {
      if (!str) return str;
      const cleaned = str.trim();
      // 既に基準値まで補われた文字列を再度処理して基準値を重複させないための判定。
      // 【原因と修正】以前は「単位らしき文字列（g/dL・U/L・%等）を含むかどうか」で
      // 「既に整形済み」と判定していたが、これでは基準値がまだ一度も補われていない
      // 検査値（例：「Ht(ヘマトクリット) 41.8%」「ALP 221U/L」のように、元の記録に
      // 単位だけが書かれていて基準値が付いていないもの）まで「済み」と誤判定してしまい、
      // LAB_STANDARDSに登録済みの項目であっても基準値が永久に補われないままになっていた
      // （利用者からの報告：RBC・Hb・Ht・Plt・PT・AST・ALT・ALP・Clに基準値が付かない）。
      // 「基準値」の文字列そのものが含まれているかどうかで判定することで、この誤判定を避ける。
      if (/基準値/.test(cleaned)) return cleaned;
      for (const [key, info] of Object.entries(LAB_STANDARDS)) {
        // 項目名の直後に「(赤血球数)」「(プロトロンビン時間)」「 (GOT)」のような日本語・英語の
        // 補足説明が挟まれている場合も値と結合できるよう、任意の括弧書き1つを許容する
        // （利用者が自分で書き添えた補足なので、そのまま残して基準値だけ追記する）。
        // 【原因と修正】以前は項目名の直後に空白・コロン等が続く場合しか一致せず、このような
        // 補足付きの項目名では基準値が補われないままになっていた（利用者からの報告事例）。
        // さらに、紙のカルテのスキャン・OCR由来のテキストでは、丸括弧の開き側だけが波括弧
        // 「｛」「{」に誤認識されることがある（例：「WBC{白血球数)」。BARE_LAB_KEY_REGEXと同様、
        // 開き括弧・閉じ括弧をそれぞれ独立した候補として扱うことで、開閉の組み合わせが
        // 一致していないOCR誤認識にも対応する（利用者からのアップロード文書で発覚）。
        // 【原因と修正】表を貼り付けた際に空白が失われ「WBC11600」「Plt23」「Na140mEq/L」
        // のように項目名と数値の間の区切り文字が一切無くなることがある。LAB_ITEM_NAME_REGEX
        // （検査値として検出しタグを提案する側）は既にこの区切り無しの表記に対応済みだったが、
        // formatLabValueString（基準値を補う側）は区切り文字を1文字以上要求する`+`のままだった
        // ため、検出（タグ付け）はされるのに基準値だけが永久に補われないという不一致が生じていた
        // （利用者からの報告：WBC11600・RBC4587・Hb12.2g/dl・Ht37.2%・Plt23・AST2・ALT250U/L・
        // Na140mEq/Lに基準値が付かない）。区切り文字を0文字以上（`*`）に緩め、両者の判定基準を揃える。
        const match = cleaned.match(new RegExp(`^(${escapeRegExp(key)})(\\s*[（(｛{][^）)｝}]*[）)｝}])?[\\s:=]*([\\d.,]+)`, 'i'));
        if (match) {
          // 数値の直後に続く残り（本来は単位のはずの部分）が、既知の単位表記として説明できない
          // 場合は変換しない（LAB_VALUE_TRAILING_UNIT_REGEXの説明を参照）。
          const trailing = cleaned.slice(match[0].length);
          if (!LAB_VALUE_TRAILING_UNIT_REGEX.test(trailing)) continue;
          const alias = match[2] || '';
          // 異常の印（↑↓、空白の後の H・L）と末尾の「.」を除いた部分が、書かれた単位（「mg/L」の L は単位の一部なので消さない）
          const written = trailing.replace(/[↑↓]/g, '').replace(/\s+[HLhl]\s*$/, '').replace(/\.\s*$/, '').trim();
          // 【レビューで発見】空白の後の H・L（高値・低値の印）は、単位を読むときに外したまま戻していなかった（印が消えていた）
          const hlFlag = trailing.match(/\s([HLhl])\s*\.?\s*$/);
          const flag = (trailing.match(/[↑↓]/) || [''])[0] || (hlFlag ? ` ${hlFlag[1].toUpperCase()}` : '');
          const unitInfo = resolveLabUnit(key, match[3], written);
          // 換算できない単位・ありえない値（単位が書かれていない「WBC 5.6」など）は、原文のまま残す（基準値は付けない）
          if (!unitInfo) return cleaned;
          const { value, unit, note } = unitInfo;
          const shownUnit = unit || info.unit;
          const noteText = note ? ` (${note})` : '';
          // 随時・食後の血糖には、空腹時の基準値（70〜109）を付けない
          if (/随時|食後/.test(alias)) return `${match[1]}${alias} ${value} ${shownUnit}${flag}${noteText}`;
          // 子どもの記録では、年齢で変わる基準値は大人の値を書き足さない（js/03 の detectAgeGroupFromText）
          if (extractionContext().child && !CHILD_SAFE_LAB_REFERENCE_KEYS.has(key)) return `${match[1]}${alias} ${value} ${shownUnit}${flag}${noteText}`;
          return `${match[1]}${alias} ${value} ${shownUnit}${flag}${noteText} (基準値: ${info.ref} ${shownUnit})`;
        }
      }
      return cleaned;
    }

    // 単位の書き方をそろえる（µ・u→μ、dl→dL、ml→mL、x→×、⁴→^4、空白を詰める）
    function normalizeLabUnit(u) {
      return String(u || '').replace(/\s+/g, '').replace(/从/g, 'μ').replace(/mEa\/L/i, 'mEq/L').replace(/万[uμµ]\/L/i, '万/μL').replace(/[µu](?=[gLl]|mol)/g, 'μ').replace(/^x(?=10)/i, '×')
        .replace(/10⁴/g, '10^4').replace(/10³/g, '10^3').replace(/10²/g, '10^2')
        .replace(/dl$/, 'dL').replace(/ml$/, 'mL').replace(/(^|\/)l$/, '$1L').replace(/mm³/g, 'mm3')
        .replace(/meq\/l/i, 'mEq/L').replace(/mmol\/l/i, 'mmol/L').replace(/iu\/l/i, 'IU/L').replace(/^u\/l$/i, 'U/L');
    }
    // 項目ごとの「同じ意味の単位」と「換算できる単位」。factor を掛けるとアプリの基準値の単位になる。
    const LAB_UNIT_EQUIVALENTS = {
      WBC: ['/μL', '/mm3'], RBC: ['×10^4/μL', '万/μL', '万/mm3'], Plt: ['×10^4/μL', '万/μL', '万/mm3', '万'],
      Na: ['mEq/L', 'mmol/L'], K: ['mEq/L', 'mmol/L'], Cl: ['mEq/L', 'mmol/L'], 'Dダイマー': ['μg/mL', 'mg/L'],
      AST: ['U/L', 'IU/L'], ALT: ['U/L', 'IU/L'], ALP: ['U/L', 'IU/L'], 'γGTP': ['U/L', 'IU/L'], 'アミラーゼ': ['U/L', 'IU/L']
    };
    const LAB_UNIT_CONVERSIONS = {
      CRP: { 'mg/L': 0.1 }, Hb: { 'g/L': 0.1 }, TP: { 'g/L': 0.1 }, Alb: { 'g/L': 0.1 },
      Cre: { 'μmol/L': 1 / 88.4 }, Cr: { 'μmol/L': 1 / 88.4 }, BUN: {}, 'T-Bil': { 'μmol/L': 1 / 17.1 },
      '血糖': { 'mmol/L': 18 },
      WBC: { '×10^3/μL': 1000, '千/μL': 1000, '×10^2/μL': 100 },
      Plt: { '×10^3/μL': 0.1, '/μL': 0.0001, '/mm3': 0.0001 },
      RBC: { '×10^6/μL': 100 }
    };
    // 単位が書かれていないときに、アプリの基準値の単位として読んでよい値の範囲（外れていたら換算せず原文のまま）
    const LAB_PLAUSIBLE_WITHOUT_UNIT = { WBC: [100, 300000], Plt: [0.1, 200], RBC: [50, 1000], Hb: [1, 30], CRP: [0, 60] };
    function formatConvertedNumber(v) {
      const abs = Math.abs(v);
      const digits = abs >= 1000 ? 0 : abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
      if (abs >= 1000) return Math.round(v).toLocaleString('en-US');
      return v.toFixed(digits);
    }
    // 書かれた数値と単位から、表示する値・単位を決める。読めない・換算できないときは null（原文のまま残す）
    function resolveLabUnit(key, rawValue, writtenUnit) {
      const std = LAB_STANDARDS[key] ? normalizeLabUnit(LAB_STANDARDS[key].unit) : '';
      const num = Number(String(rawValue).replace(/,/g, ''));
      if (!Number.isFinite(num)) return null;
      const u = normalizeLabUnit(writtenUnit);
      if (!u) {
        const range = LAB_PLAUSIBLE_WITHOUT_UNIT[key];
        if (range && (num < range[0] || num > range[1])) return null;
        return { value: rawValue, unit: '' };
      }
      if (u === std || (!std && !u)) return { value: rawValue, unit: LAB_STANDARDS[key].unit };
      // OCRの読み違い：μ が M に化けた「/ML」（白血球など）、U が消えた「/L」（AST などの U/L）は基準値の単位と読み替える
      if ((/^\/ML$/.test(String(writtenUnit).replace(/\s+/g, '')) && /\/μL$/.test(std)) || (u === '/L' && std === 'U/L')) {
        return { value: rawValue, unit: LAB_STANDARDS[key].unit, note: `単位「${String(writtenUnit).trim()}」を${LAB_STANDARDS[key].unit}と読み替え` };
      }
      // 同じ意味の単位（万/μL＝×10^4/μL、mmol/L＝mEq/L など）は、基準値と同じ書き方にそろえる
      if ((LAB_UNIT_EQUIVALENTS[key] || []).includes(u)) return { value: rawValue, unit: LAB_STANDARDS[key].unit };
      const factor = (LAB_UNIT_CONVERSIONS[key] || {})[u];
      if (factor) return { value: formatConvertedNumber(num * factor), unit: LAB_STANDARDS[key].unit, note: `${rawValue} ${u}から換算` };
      return null;
    }

    // 「創部：出血なし。」のように「創部」という一語だけの見出しでは、周術期の記録に複数
    // 存在しうる創（腹部の手術創、吻合部、ドレーン刺入部等）のうちどれを指すか分からなくなる
    // （利用者からの指摘：「なんの創部なのかがわからなくなってる」）。「吻合部・胃管ドレーン」
    // 「左腹腔ドレーン」のように他の部位名とセットで書かれている場合は対象外とし、「創部」が
    // 単独で見出しとして使われている場合に限り、周術期看護で最も一般的に指す腹部の手術創
    // であることを明示する（ユーザーへの確認の上での対応）。
    const BARE_WOUND_LABEL_REGEX = /^創部[:：]/;
    // 骨折・人工関節・脊椎などの手術の事例では、創部は腹部ではないので「腹部」を付けない（新しい長文事例のテスト：大腿骨転子部骨折）
    const NON_ABDOMINAL_SURGERY_REGEX = /骨折|骨接合|人工骨頭|人工関節|γネイル|ガンマネイル|BHA|THA|TKA|椎弓|脊椎|開頭|乳房切除|甲状腺/;
    // 【レビューで発見】以前は「子どもの記録か」「創部を腹部とするか」を groupClinicalPhrasesWithTimestamps が読むたびに
    // 書き換える1つの状態として持っていたため、前に分類した別の患者の状態が、AIでの分類やカードの手直し（js/09）に
    // 残っていた（小児・骨折の患者を分類した後は、別の大人の患者の検査値に基準値が付かず、「創部：」が
    // 「創部（手術創）：」になっていた）。今は、分類中の文章（withExtractionContext）、それが無ければ今の患者の
    // 元の文章から、その都度決める。
    let extractionContextOverride = null;
    let extractionContextCache = { text: null, child: false, wound: '腹部創部（手術創）：' };
    function withExtractionContext(text, fn) {
      const prev = extractionContextOverride;
      extractionContextOverride = String(text || '');
      try { return fn(); } finally { extractionContextOverride = prev; }
    }
    function extractionContext() {
      let t = extractionContextOverride;
      if (t === null) {
        try {
          const cp = typeof getCurrentPatient === 'function' ? getCurrentPatient() : null;
          t = String((cp && cp.sourceText) || '').normalize('NFKC');
        } catch (e) { t = ''; }
      }
      if (extractionContextCache.text !== t) {
        extractionContextCache = {
          text: t,
          child: !!detectAgeGroupFromText(t),
          wound: NON_ABDOMINAL_SURGERY_REGEX.test(t) && !/腹腔鏡|開腹|胃切除|胃全摘|結腸|直腸|胆嚢/.test(t) ? '創部（手術創）：' : '腹部創部（手術創）：'
        };
      }
      return extractionContextCache;
    }
    function cleanExtractedPhrase(str) {
      if (!str) return '';
      // 行の頭の「:」（「入院時：胸痛…」の「入院時」を日時として外した残り）と、文の終わりの「、」も外す（実習生の記録のテスト）
      let cleaned = str.trim().replace(/^[\]\)\]〕』】〉、。・,\.\-\s〜〜:：]+/g, '').replace(/[,\-\s〜〜（〈〔『【「『、]+$/g, '');
      cleaned = formatLabValueString(cleaned);
      if (BARE_WOUND_LABEL_REGEX.test(cleaned)) cleaned = cleaned.replace(BARE_WOUND_LABEL_REGEX, extractionContext().wound);
      // 文中の検査値・バイタルを別カードに切り出した後に残る連続した空白は1つにする（患者36の帰室の行）
      cleaned = cleaned.replace(/[ \t　]{2,}/g, ' ');
      // 「バイタルサインは体温36.5℃、…」の値を切り出した後に残る「バイタルサインは」だけの言い回しを消す
      // （「血圧140/85mmHgバイタルサインはに落ち着く」→「血圧140/85mmHgに落ち着く」）
      if (/バイタル(?:サイン)?は(?=[にで。、]|$)/.test(cleaned)) {
        cleaned = cleaned.replace(/バイタル(?:サイン)?は(?=[にで。、]|$)/g, '').replace(/。{2,}/g, '。').replace(/^[。、\s]+/, '').trim();
      }
      // 「バイタル：体温36.4度、…」の値を切り出した後に残る「バイタル：、」だけの行も消す（実習記録のテスト）
      if (/^(?:バイタル(?:サイン)?|VS|V\/S)\s*[:：]?[、。,\s]*$/i.test(cleaned)) cleaned = '';
      return cleaned;
    }

    // 見出しラベルが付いていない一般的な文章（行頭の残り・見出しに属さない残りの文章等）は、
    // これまで句点「。」で区切らず行全体を1つのカードにしていたため、「シャワー浴を実施した。
    // 弾性ストッキングを着用した。」のように本来は別々の看護行為（清潔ケア／循環ケア等、
    // ヘンダーソンの分類も異なりうる）が1枚のカードに混ざってしまっていた。句点ごとに文を
    // 分割し、それぞれを独立したカードの候補として扱う（末尾に句点が無い断片はそのまま1つ）。
    function splitIntoSentenceFragments(text) {
      if (!text) return [];
      // 「」『』で囲まれた患者の発言・引用の中にある句点では分割しない
      // （例:「息苦しくて夜もあまり眠れなかった。横になると特に苦しい」と訴える。を
      // 発言の途中で2つに割ってしまわないようにする）。
      const fragments = [];
      let depth = 0;
      let start = 0;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '「' || ch === '『') depth++;
        else if (ch === '」' || ch === '』') depth = Math.max(0, depth - 1);
        else if (ch === '。' && depth === 0) {
          fragments.push(text.slice(start, i + 1));
          start = i + 1;
        }
      }
      if (start < text.length) fragments.push(text.slice(start));
      return fragments.map(s => s.trim()).filter(s => s.length > 0);
    }

    // splitIntoSentenceFragmentsは句点「。」ごとに機械的に分割するため、シャワー浴／弾性
    // ストッキングのように別々の看護行為が並んでいる文には有効だが、「麻酔からの覚醒も良好。
    // 声を掛けると「あ、あ」と短く返事するのみ。のどの痛みあり。…」のように、1つの出来事
    // （麻酔からの覚醒）について続けて観察所見を述べている一連の文章まで機械的に分断してしまう
    // という指摘を受けた。句点の有無・文の長さだけでは「別々の行為の列挙」と「同じ出来事の
    // 継続した記述」を区別できないため、見出しの付いていない一般的な文章（行頭の残り・
    // 見出しに属さない残りの文章）については句点による分割自体は行わないことにし、構造的に
    // 明確な列挙の合図である「・」（なかてん）が使われている場合だけを安全に分割対象とする。
    // （「・」は「シャワー浴・弾性ストッキング着用を実施」のように単語・短い句を並べる用途に
    // 限られ、文中に句点を含むような長い文の一部として使われることは無いため、誤分割の
    // リスクが低い。）
    // 「＜実習2日目（入院2日目、手術前日）＞」のような、＜＞【】（）[]等で囲まれた1つの
    // 見出し・区切りマーカー全体を、「・」や「、」で機械的に分割すると、括弧の対応が崩れた
    // 意味の無い断片（「＜実習2日目（入院2日目」「手術前日）＞」等）に分かれてしまうことがある
    // （利用者からのアップロード文書で発覚：この見出し行が2枚のタグ未設定カードに分裂していた）。
    // 分割後のいずれかの要素で開き括弧・閉じ括弧の対応数が崩れる場合は、列挙ではなく
    // 1つのまとまった見出し・文章とみなし、分割自体を取りやめる。
    const BRACKET_PAIRS = [['<', '>'], ['＜', '＞'], ['(', ')'], ['（', '）'], ['[', ']'], ['【', '】']];
    function hasBalancedBrackets(str) {
      return BRACKET_PAIRS.every(([open, close]) => str.split(open).length === str.split(close).length);
    }
    function splitByNakatenList(text) {
      if (!text) return [];
      const trimmed = text.trim();
      if (!trimmed) return [];
      if (!trimmed.includes('・')) return [trimmed];
      // 「眼鏡・コンタクトレンズ: 眼鏡使用」「装着器具・自助具の有無:」のように、「・」でつないだ
      // 複数の語が1つの複合的な見出し（ラベル）を構成し、その後にコロンで共通の値が続く
      // （またはコロンだけで終わる）形式のことがある。この場合の「・」は別々の事実の列挙ではなく
      // 見出し語の一部であり、「・」で分割すると見出しと値が分断されて意味を失ってしまう
      // （例：「眼鏡」「コンタクトレンズ: 眼鏡使用」の2枚に分かれ、1枚目の「眼鏡」だけでは
      // 何のことか分からなくなる）。行内にコロン（：/:）があれば「・」による分割は行わず、
      // 元の文をそのまま1つとして返す。
      if (/[:：]/.test(trimmed)) return [trimmed];
      const parts = trimmed.split('・').map(s => s.trim()).filter(Boolean);
      // 分割後のいずれかの要素に句点が含まれる場合は、単語の列挙ではなく文中の一部として
      // 「・」が使われている可能性が高いため、誤って分割しないよう元の文をそのまま返す。
      if (parts.length < 2 || parts.some(p => p.includes('。'))) return [trimmed];
      if (parts.some(p => !hasBalancedBrackets(p))) return [trimmed];
      // 「〜リハビリ室に移動 立位保持・歩行訓練、関節可動域訓練やマッサージ行う〜」のように、「・」が
      // 長い文の途中で2つの語（立位保持・歩行訓練）をつないでいるだけの場合も分割しない（利用者からの
      // 修正依頼：患者34「変なところで区切られてる」）。分けた要素のどれかが読点「、」を含む、または
      // 30文字を超える長い文なら、単語の列挙ではなく文の一部とみなす。
      if (parts.some(p => /[、,]/.test(p) || p.length > 30)) return [trimmed];
      // 「嘔気・嘔吐なし」「発赤・腫脹なし」のように、最後の要素にだけ「なし」「あり」等の有無・
      // 状態の語が付き、それより前の要素は名詞だけの場合、その語は列挙したすべてにかかっている
      // （嘔気もなし、嘔吐もなし）。分割すると「嘔気」だけのカードが「嘔気がある」とも読めてしまい、
      // 所見の意味が逆転する危険がある（利用者からのアップロード文書で発覚）ため、分割しない。
      const SHARED_STATUS_SUFFIX_REGEX = /(なし|無し|なく|ない|無|あり|有り|有|良好|不良|陰性|陽性|認めず|みられず|見られず|\([-+±]\)|（[-+±]）)$/;
      const lastPart = parts[parts.length - 1];
      // 「呼吸困難感訴えなし、肺Air入り良好、嘔気・嘔吐なし」「軽度腫脹と熱感あるが、発赤・出血・排膿なし」のように
      // 「、」で続く文の最後の部分で「・」が使われている場合も同じ（前の要素は「、」「。」より後ろの語だけを見る）。
      const tailOf = p => p.split(/[、。,]/).pop().trim();
      if (SHARED_STATUS_SUFFIX_REGEX.test(lastPart) && parts.slice(0, -1).every(p => !SHARED_STATUS_SUFFIX_REGEX.test(tailOf(p)) && tailOf(p).length <= 10)) {
        return [trimmed];
      }
      return parts;
    }

    // 「シャワー浴、弾性ストッキング着用」のように、句点「。」も「・」も使われず読点「、」だけで
    // 別々の看護行為が並べて書かれることがある（利用者からの指摘：「シャワー浴と弾性ストッキングが
    // 一緒になってしまっています。関連性のない二つの単語なので別々になるようにしてください」）。
    // 読点は通常の文章中でも助詞・活用語尾（「〜で」「〜あり」等）を挟んで広く使われるため、
    // 無条件に分割すると意味のある1つの文を誤って分断してしまう。そこで、読点で区切られた
    // 各要素がひらがな（助詞・活用語尾）を一切含まない、短い体言止めの語句（「シャワー浴」
    // 「弾性ストッキング着用」「口腔ケア」等、看護記録で名詞・行為名だけを並べる書き方に典型的）
    // だけで構成されている場合に限り、安全に分割対象とする。
    const HIRAGANA_REGEX = /[ぁ-ゖ]/;
    function splitIndependentActionPhrases(text) {
      if (!text) return [text];
      const trimmed = text.trim();
      if (!trimmed.includes('、')) return [trimmed];
      if (/[:：]/.test(trimmed)) return [trimmed];
      const parts = trimmed.split('、').map(s => s.trim()).filter(Boolean);
      if (parts.length < 2 || parts.some(p => p.length < 2 || p.length > 20 || p.includes('。') || HIRAGANA_REGEX.test(p))) return [trimmed];
      // 「入院後、キルシュナー牽引4kg実施」の「入院後」のように、先頭が時を表す語なら列挙ではなく文の一部（患者36）
      if (/^(?:入院後|入院時|入院前|術後|術前|帰室後|帰室時|翌日|翌朝|その後|食後|食前|夜間|日中|朝|夕方)$/.test(parts[0])) return [trimmed];
      // 「酸素OFF、硬膜外麻酔抜去、フットポンプOFF」のように、医療機器・処置の開始／終了を並べたものは同じ場面
      // （回診で安静度が進んだ）の1つの情報なので分けない（利用者からの指摘：患者36「同一時刻の指示や処置は1つに」）
      if (parts.every(p => /(?:OFF|ON|オフ|オン|off|on|抜去|抜針|中止|終了|開始|再開|装着|除去|解除)$/.test(p))) return [trimmed];
      // hasBalancedBracketsの説明を参照（＜実習2日目（入院2日目、手術前日）＞のような
      // 括弧付き見出し全体を、読点でも意味の無い断片に分けてしまわないようにする）。
      if (parts.some(p => !hasBalancedBrackets(p))) return [trimmed];
      return parts;
    }

    // 上の「・」による列挙分割と、読点による独立行為の列挙分割を、まとめて安全な順序で試す。
    // 「・」の方がより明確な列挙の合図のため先に試し、分割できなければ読点側を試す。
    function splitEnumeratedPhrases(text) {
      const byNakaten = splitByNakatenList(text);
      if (byNakaten.length > 1) return byNakaten;
      return splitIndependentActionPhrases(byNakaten[0]);
    }

    // 「53歳 卵巣嚢腫、50歳代 胆石症 (症状がないため経過観察中)」のように、既往歴では
    // 「◯歳（代）＋病名」の組が読点でつながれた列挙として記載されることが多い。この場合、
    // 句点が無いため上記のsplitByNakatenListでは分割できず、かつ内容としては明確に複数の
    // 既往（診断）を並べたものなので、1枚のカードにまとめず年齢の出現ごとに分割する。
    // 年齢表記が1回しか出てこない場合は列挙ではなく単に発症年齢を含む1件の既往なので分割しない。
    // 生活歴は「元会社員（20年前に退職）、喫煙歴なし、機会飲酒あり」のように、仕事・喫煙・飲酒など
    // 別々のことを読点で並べることが多い。1枚のままだと喫煙（1.呼吸）・飲酒（2.食事）・仕事（12.仕事）の
    // どのタグがどの内容のものか分からないため、短い項目の並びなら1項目ずつのカードに分ける（利用者からの
    // 指摘：患者34「元会社員であることや飲酒習慣は呼吸に直接関係しないため、12. 仕事や2. 食事に分ける」）。
    // 「仕事は退職し、現在は妻と二人暮らし」のように文として続いている場合は分けない。
    const EXPLANATION_LEAD_REGEX = /(?:主治医|担当医|執刀医|医師|Dr\.?)(?:より|から|が)[^。]{0,30}説明/;
    const PLAN_CONTINUATION_REGEX = /(?:開始する|開始となる|開始予定|行う予定|予定となる|予定である|予定。?$|方針|目標\s*[:：]|とする。?$)/;
    function mergeExplanationContinuations(extracted) {
      for (let i = 0; i < extracted.length; i++) {
        const lead = extracted[i];
        if (lead.isUnnecessaryBoilerplate || lead.fieldLabel || lead.isLabOrVital || !EXPLANATION_LEAD_REGEX.test(lead.text)) continue;
        let j = i + 1;
        let lastLine = lead._line;
        const absorbed = [];
        while (j < extracted.length && absorbed.length < 3) {
          const next = extracted[j];
          const adjacent = lastLine === undefined || next._line === undefined || next._line - lastLine <= 1;
          if (!adjacent || next.isUnnecessaryBoilerplate || next.fieldLabel || next.isLabOrVital || next.timestamp !== lead.timestamp ||
            next.text.length > 40 || /「/.test(next.text) || !PLAN_CONTINUATION_REGEX.test(next.text)) break;
          absorbed.push(next);
          lastLine = next._line;
          j++;
        }
        if (!absorbed.length) continue;
        lead.text = cleanExtractedPhrase([lead.text, ...absorbed.map(a => a.text)].reduce((acc, t) => acc + (/[。]$/.test(acc) ? '' : '。') + t));
        if (lastLine !== undefined) lead._line = lastLine;
        extracted.splice(i + 1, absorbed.length);
      }
    }
    // コロンの無い見出し語だけの行を「〇〇:」の見出しとして扱う語（上の行の読み取り処理の説明を参照）
    const BARE_BLOCK_HEADING_REGEX = /^(?:術後肢位|肢位|良肢位|禁忌肢位|安静度|安静度指示|指示|指示事項|注意事項|禁止事項|禁忌事項|病室環境|観察項目|観察ポイント|生活上の注意|日常生活の注意|退院指導)$/;
    function splitLifeHistoryItems(content) {
      if (!content || !/[、,]/.test(content) || content.includes('。')) return [content];
      const parts = content.split(/[、,]/).map(p => p.trim()).filter(Boolean);
      if (parts.length < 2) return [content];
      // 「退職し」「〜して」のように文が続いている形なら分けない（「喫煙歴なし」「機会飲酒あり」の「し」「り」は除く）
      if (parts.some(p => p.length < 2 || p.length > 25 || /(?:[てでがくけ]|(?<![な無])し|(?<![あ有])り)$/.test(p) || !hasBalancedBrackets(p))) return [content];
      return parts;
    }
    const HISTORY_AGE_MARKER_REGEX = /\d{1,3}歳代?/g;
    function splitHistoryByAgeMarkers(content) {
      if (!content) return [content];
      const indices = [];
      let m;
      const regex = new RegExp(HISTORY_AGE_MARKER_REGEX);
      while ((m = regex.exec(content)) !== null) indices.push(m.index);
      if (indices.length < 2) return [content];
      // 【レビューで発見】「高血圧（60歳）、糖尿病（65歳）、脳梗塞（70歳）」のように年齢が病名の後ろに書かれていると、
      // 年齢の位置で切るため「高血圧(60歳)、糖尿病(」「65歳)、脳梗塞(」のように、かっこが崩れ、病名と年齢の組が
      // ずれていた（タグも別の病名のカードに付いていた）。読点で分けた各部分に年齢がちょうど1つずつあり、
      // かっこも閉じているなら、読点の位置で分ける（年齢が前でも後ろでも、病名と年齢の組が崩れない）。
      const commaParts = content.split(/[、,]/).map(p => p.trim()).filter(Boolean);
      if (commaParts.length === indices.length && commaParts.every(p => (p.match(new RegExp(HISTORY_AGE_MARKER_REGEX)) || []).length === 1 && hasBalancedBrackets(p))) {
        return commaParts;
      }
      const parts = [];
      for (let i = 0; i < indices.length; i++) {
        const start = indices[i];
        const end = i + 1 < indices.length ? indices[i + 1] : content.length;
        parts.push(content.slice(start, end));
      }
      if (indices[0] > 0) parts[0] = content.slice(0, indices[0]) + parts[0];
      return parts
        .map(p => p.replace(/^[、,\s]+/, '').replace(/[、,\s]+$/, '').trim())
        .filter(Boolean);
    }

    // 【細かく分割しすぎないための結合】ローカル分類（groupClinicalPhrasesWithTimestamps）と
    // AI分類の結果の両方に共通で使う（利用者からの修正依頼：「分割されすぎている」「入室だけで
    // 情報カードになってるのがおかしい」。以前はローカル分類にしか無く、AI分類では効いていなかった）。
    // list の各要素は { text, timestamp, fieldLabel, isLabOrVital, isUnnecessaryBoilerplate, _line,
    // hendersonIds? } の形。結合した場合は text をつなぎ、hendersonIds があれば両方を合わせる。
    //  ①「「先生にお任せするしかない」」のように患者の発言だけの行は、直前のカードも同じ日時の患者の
    //    発言を含む場合、その続きとして1枚にまとめる。
    //  ②「入室」「全身麻酔」のように名詞だけの非常に短い行（6文字以下で、数値・見出し・発言・
    //    「なし」「可能」等の所見を表す語を含まないもの）は、同じ日時の直前のカード（無ければ直後の
    //    カード）の続きにする（例：「9:00 入室」＋「右大腿骨人工骨頭置換術 後方アプローチ施行」＋
    //    「全身麻酔」→1枚）。「会話可能」「発熱あり」のように短くても所見として完結している行や、
    //    同じ行から列挙の分割で作られたカード（「シャワー浴、弾性ストッキング着用」→2枚。利用者の要望で
    //    意図的に分けたもの）はそのまま残す。
    const FRAGMENT_QUOTE_WITH_WORDS_REGEX = /「[^」]*[ぁ-んァ-ヶ一-龠々][^」]*」/;
    const BARE_NOUN_FRAGMENT_STATUS_REGEX = /(なし|無し|あり|有り|良好|不良|可能|不可|困難|清明|クリア|自立|介助|禁止|陰性|陽性|著明|軽度|中等度|重度|みられ|認め)/;
    // 【同じ時刻のバイタルサインを1枚に】「12:00 帰室: … 血圧140/70mmHg 脈拍80回/分整 呼吸20回/分 体温37.6度
    // SpO2 98%…」のように1行に並んだバイタルサインは、1つずつのカードにせず1枚にまとめる（利用者からの指摘：
    // 患者36「1時点の情報を一つにまとめると、循環・呼吸動態がひと目で把握できる」）。同じ行・同じ日時で続けて
    // 切り出されたバイタルだけを対象にする（別々の行の検査値はまとめない）。
    const VITAL_SIGN_CARD_REGEX = /^(?:血圧|脈拍|心拍数?|呼吸(?:数)?|体温|SpO2|SPO2|Spo2|SpO₂|酸素飽和度|HR|BP|RR|BT|KT|P\s*\d|R\s*\d|T\s*\d)/;
    const VITAL_ORDER = [/^(?:体温|BT|KT|T\s*\d)/, /^(?:血圧|BP)/, /^(?:脈拍|心拍|HR|P\s*\d)/, /^(?:呼吸|RR|R\s*\d)/, /^(?:SpO2|SPO2|Spo2|SpO₂|酸素飽和度)/];
    const vitalOrderOf = t => { const k = VITAL_ORDER.findIndex(re => re.test(t)); return k === -1 ? VITAL_ORDER.length : k; };
    // 【「検温」だけのカードを測定値と1枚にする】利用者からの指摘（患者36・7.体温）：「『検温』だけのカードは不要で、
    // 測定値と一体化した方がよい」。「10:00 検温」の次（同じ日時）にバイタルの値のカードがあれば、「検温: 体温…」の
    // 1枚にまとめる。値のカードが見つからなければそのまま残す。
    const VITAL_CHECK_HEADING_REGEX = /^(?:検温|バイタル(?:サイン)?(?:測定|チェック)?|VS(?:測定|チェック)?|V\/S(?:測定)?)\s*[:：。]?$/i;
    function mergeVitalCheckHeadings(list) {
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        if (!VITAL_CHECK_HEADING_REGEX.test((it.text || '').trim())) continue;
        for (let j = i + 1; j < Math.min(list.length, i + 4); j++) {
          const next = list[j];
          if (next.timestamp !== it.timestamp) break;
          if (next.isUnnecessaryBoilerplate || !VITAL_SIGN_CARD_REGEX.test(next.text || '')) continue;
          list[j] = { ...next, text: `${it.text.trim().replace(/[:：。]$/, '')}: ${next.text}` };
          list.splice(i, 1);
          i--;
          break;
        }
      }
    }
    function mergeSameTimeVitals(list) {
      // 同じ行・同じ日時のバイタルのカード（間に別のカードが挟まっていてもよい）を、最初のカードの位置に
      // 体温→血圧→脈拍→呼吸→SpO2 の順で1枚にまとめる
      const groups = new Map();
      let lastVital = null;
      list.forEach((it, idx) => {
        // 「血圧125/70」のように単位が無く検査値として切り出されなかったバイタルも、値だけのカードなら対象にする
        const valueOnly = /^(?:血圧|脈拍|心拍数?|呼吸数?|体温|SpO2|SPO2|Spo2|BP|HR|RR|BT|KT|[TPR](?=\s*\d))\s*[\d〜~\-\/.,()（）\s]+(?:mmHg|回\/分|度|°C|℃|%|bpm)?[^、。「」]{0,8}$/.test(it.text);
        if (!(it.isLabOrVital || valueOnly) || it.isUnnecessaryBoilerplate || it._lab || it.fieldLabel || it._line === undefined || !VITAL_SIGN_CARD_REGEX.test(it.text)) return;
        // 「T 36.8℃」「P 78回/分」「BP 112/68mmHg」のように1行に1つずつ書かれた、すぐ前の行のバイタルとも同じ日時ならまとめる（産褥の事例）
        const prevVital = lastVital;
        lastVital = { idx, key: null, line: it._line, ts: it.timestamp };
        let key = `${it._line}\u0000${it.timestamp}`;
        if (prevVital && prevVital.ts === it.timestamp && prevVital.idx === idx - 1 && prevVital.line !== it._line) key = prevVital.key;
        lastVital.key = key;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(idx);
      });
      const remove = new Set();
      groups.forEach(idxs => {
        if (idxs.length < 2) return;
        const cards = idxs.map(i => list[i]).slice().sort((a, b) => vitalOrderOf(a.text) - vitalOrderOf(b.text));
        list[idxs[0]] = { ...list[idxs[0]], text: cleanExtractedPhrase(cards.map(c => c.text.replace(/[、。\s]+$/, '')).join('、')) };
        idxs.slice(1).forEach(i => remove.add(i));
      });
      if (remove.size) {
        const kept = list.filter((_, i) => !remove.has(i));
        list.splice(0, list.length, ...kept);
      }
    }
    // 【比較できる検査データの表をまとめる】「検査項目／正常値／入院時／術後1日目」のように2つ以上の時点の列がある
    // 表は、項目・時点ごとの1行ずつのカードにせず、関連する項目（貧血・炎症・栄養…）ごとに「入院時→術後1日目」の
    // 変化が分かる1枚にまとめる（利用者からの指摘：患者36「術後の出血による貧血の進行具合や炎症反応の程度を
    // アセスメントしやすくなる」）。日時は表の最後の時点にする。
    const LAB_GROUP_DEFS = [
      ['心不全', /^(?:BNP|NT-?proBNP)/i],
      ['血糖', /^(?:FBS|BS|血糖|空腹時血糖|HbA1c|グルコース)/i],
      ['貧血・出血', /^(?:RBC|Hb|Hgb|Ht|Hct|赤血球|ヘモグロビン|ヘマトクリット)/i],
      ['炎症', /^(?:WBC|CRP|白血球|C反応)/i],
      ['凝固・血栓', /^(?:PLT|Plt|血小板|PT|APTT|D\s*[-‐]?\s*ダイマー|Dダイマー|FDP|フィブリノ|INR)/i],
      ['栄養', /^(?:TP|ALB|Alb|総蛋白|総タンパク|アルブミン|TC|T-?Cho|コレステロール|TG|中性脂肪)/i],
      ['腎機能', /^(?:BUN|Cre|Cr|eGFR|UA|尿素窒素|クレアチニン|尿酸)/i],
      ['肝・胆道', /^(?:AST|ALT|GOT|GPT|γ-?GTP|ALP|LDH|T-?Bil|D-?Bil|ビリルビン|アミラーゼ|AMY)/i],
      ['電解質', /^(?:Na|K|Cl|Ca|Mg|P\b|ナトリウム|カリウム|クロール|カルシウム)/i]
    ];
    function groupComparisonLabTables(list) {
      const tables = new Map();
      list.forEach((it, idx) => {
        if (!it._lab || it.isUnnecessaryBoilerplate) return;
        const phases = (it._lab.phases || []).filter(Boolean);
        if (phases.length < 2) return; // 時点が1つだけの表は、今まで通り1項目ずつ
        if (!tables.has(it._lab.table)) tables.set(it._lab.table, []);
        tables.get(it._lab.table).push(idx);
      });
      const remove = new Set();
      const inserts = []; // [位置, カード]
      tables.forEach(idxs => {
        const phases = list[idxs[0]]._lab.phases.filter(Boolean);
        const rows = new Map(); // key -> { key, values: {phase: value}, ref }
        idxs.forEach(idx => {
          const it = list[idx];
          const row = rows.get(it._lab.key) || { key: it._lab.key, values: {}, ref: null };
          row.values[it._lab.phase] = restoreLabUnitSpacing(it._lab.value);
          const refMatch = it.text.match(/\(基準値[:：]\s*([^)]*)\)/);
          row.ref = row.ref || it._lab.ref || (refMatch ? refMatch[1] : null);
          rows.set(it._lab.key, row);
        });
        const groups = new Map();
        rows.forEach(row => {
          const def = LAB_GROUP_DEFS.find(([, re]) => re.test(row.key.replace(/^\s+/, '')));
          const name = def ? def[0] : 'その他の検査';
          if (!groups.has(name)) groups.set(name, []);
          groups.get(name).push(row);
        });
        const lastPhase = phases[phases.length - 1];
        const cards = [];
        // 表で先に出てくる項目のまとまりから順に並べる
        groups.forEach((gRows, name) => {
          const parts = gRows.map(row => {
            const present = phases.filter(ph => row.values[ph] !== undefined);
            const valueText = present.length > 1
              ? present.map(ph => row.values[ph]).join('→')
              : `${row.values[present[0]]}（${present[0]}のみ）`;
            return `${row.key} ${valueText}${row.ref ? ` (基準値: ${row.ref})` : ''}`;
          });
          // 異常値の検出（extractAbnormalLabFindings）で時点ごとの値を使えるよう、元の値も持たせておく
          const labRows = gRows.map(row => ({ key: row.key, ref: row.ref || null, values: phases.filter(ph => row.values[ph] !== undefined).map(ph => ({ phase: ph, value: row.values[ph] })) }));
          cards.push({ text: cleanExtractedPhrase(`${name}（${phases.join('→')}）: ${parts.join('、')}`), timestamp: lastPhase, isLabOrVital: true, labRows, admissionPhase: list[idxs[0]].admissionPhase, _line: list[idxs[0]]._line });
        });
        idxs.forEach(i => remove.add(i));
        inserts.push([idxs[0], cards]);
      });
      if (!inserts.length) return;
      const out = [];
      list.forEach((it, idx) => {
        const ins = inserts.find(([pos]) => pos === idx);
        if (ins) out.push(...ins[1]);
        if (!remove.has(idx)) out.push(it);
      });
      list.splice(0, list.length, ...out);
    }
    function restoreLabUnitSpacing(v) { return (v || '').replace(/\s+/g, ' ').trim(); }

    // 【S（発言）とO（観察）が1枚に混ざったカードを分ける】利用者からの指摘（患者36）：
    // 「ベッドアップし、昼食摂取「あまり食欲がない」と半分のみ摂取」「「体重をかけるのは怖い」と言いながら端坐位→
    // 車いすへ移乗行う」のように、患者の発言（S）と看護師の観察（O）が1枚になっていると、正確なアセスメントが
    // できない。発言だけのカード（S）と、発言を除いた観察のカード（O）に分ける。ただし同じ場面の情報であることが
    // 分からなくならないよう、2枚には同じ場面の印（sceneId）を付け、総合アセスメント表では横に並べて表示する。
    // 医師・看護師の説明の「」（STAFF_QUOTE_REGEXES）や、数字だけの「」（ペインスケール「5」）は発言ではないので分けない。
    // 【発言の言い回しを最後まで取り除く】7事例のテストで、「と訴えたため救急要請され」から「と訴え」だけを除いて
    // 「たため救急要請され」、「と話していた」から「と話し」だけを除いて「ていた」、「と回答」「と答えた」「と質問している」
    // が残る壊れた文が多数あった。発言の動詞（言う・話す・訴える・答える・回答・質問・尋ねる・希望・相談・つぶやく）の後ろの
    // ひらがな（活用・「ため」「という」等）までまとめて取り除く。
    const SPEECH_TAIL_REGEX = /^\s*(?:と(?:本人|患者)(?:は|が)?|との(?:言葉|発言)(?:も|が)?(?:聞かれる|聞かれた|あり)?|と?(?:も)?(?:(?:本人|患者)(?:は|が)?)?(?:言|話|訴え|答え|返答|回答|質問|尋ね|希望|発言|相談|つぶや|呟|頼)[ぁ-ん]{0,8}|と?の(?:こと|発言)(?:あり|である|です|だった|だ)?)?/;
    const PATIENT_WORD_QUOTE_REGEX = /「[^「」]*[ぁ-んァ-ヶ一-龠々][^「」]*」/g;
    const DANGLING_CLAUSE_END_REGEX = /(?:には|では|に対して|に|へ|から|より|は|が|も|の|と)$/;
    // 【家族の発言】心不全事例のテストで発覚：「妻「…」」「長女が面会。「…」」のような家族の発言が、本人の発言と
    // 同じSとして区別なく並び、「妻は「…」と話していた」をS/Oに分けると「妻は、ていた」という壊れた文が残っていた。
    // 家族の発言は、①本人の発言と同じ文にあっても文ごとに分け、②S/Oには分けず、③カードに「家族」の印を付ける（表示時に判定）。
    const FAMILY_SPEAKER_WORD = '(?:妻|夫|長女|長男|次女|次男|三女|三男|娘|息子|嫁|婿|家族|母親?|父親?|孫|姉|妹|兄|弟|姪|甥|義母|義父|叔母|叔父|伯母|伯父)';
    const FAMILY_QUOTE_REGEX = new RegExp(`(?:^|[:：、。\\s])${FAMILY_SPEAKER_WORD}(?:さん)?(?:[:：]|からは|より|から|は|が|も)?(?:、)?(?:面会(?:時)?(?:に)?[。、]?)?\\s*「`);
    function isFamilySpeech(text) { return FAMILY_QUOTE_REGEX.test(text || ''); }
    // 【会話形式の看護師の質問】「看護師：「薬は毎日飲めていましたか」」の次に「Cさん：「だいたい飲んでいたよ」」が続く会話形式では、
    // 看護師の質問が患者の発言（S）として1枚になっていた（7事例のテスト）。質問は、すぐ後の答えのカードに（問い：…）として添える
    // （タグの判定・S/Oの分け方には使わない）。
    const STAFF_QUESTION_LINE_REGEX = /^(?:看護師|Ns|NS|Dr\.?|医師|主治医|助産師|療法士|理学療法士|作業療法士|保健師|薬剤師|学生)(?:さん)?[:：]?\s*「([^「」]+)」\s*$/;
    function attachStaffQuestions(list) {
      for (let i = 0; i < list.length - 1; i++) {
        const m = (list[i].text || '').match(STAFF_QUESTION_LINE_REGEX);
        if (!m) continue;
        const next = list[i + 1];
        if (!next || next.isUnnecessaryBoilerplate || STAFF_QUESTION_LINE_REGEX.test(next.text || '') || !/^(?:[^:：「」、。]{1,10}[:：]?\s*)?「/.test(next.text || '')) continue;
        list[i + 1] = { ...next, text: `${next.text}（問い：${m[1]}）` };
        list.splice(i, 1);
        i--;
      }
    }
    // 本人の発言と家族の発言が同じカードにあるときは、文（句点）ごとに分ける
    function splitFamilySpeechSentences(list) {
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        const text = it.text || '';
        if (it.isUnnecessaryBoilerplate || it.isLabOrVital || !isFamilySpeech(text) || (text.match(/「/g) || []).length < 2) continue;
        const labelMatch = text.match(/^([^:：「」、。\s]{1,14})\s*[:：]\s*/);
        const prefix = labelMatch ? `${labelMatch[1]}: ` : '';
        const body = labelMatch ? text.slice(labelMatch[0].length) : text;
        const quotes = [];
        const masked = body.replace(/「[^「」]*」/g, q => `\u0001${quotes.push(q) - 1}\u0002`);
        const unmask = t => t.replace(/\u0001(\d+)\u0002/g, (m, k) => quotes[Number(k)]);
        const sentences = masked.split(/(?<=。)/).map(s => unmask(s).trim()).filter(Boolean);
        const groups = [];
        sentences.forEach(s => {
          const fam = isFamilySpeech(`。${s}`);
          if (groups.length && groups[groups.length - 1].fam === fam) groups[groups.length - 1].text += s;
          else groups.push({ fam, text: s });
        });
        if (groups.length < 2 || !groups.some(g => g.fam) || !groups.some(g => !g.fam)) continue;
        const parts = groups.map(g => { const c = { ...it, text: cleanExtractedPhrase(`${prefix}${g.text}`) }; delete c.sceneId; delete c.soRole; return c; });
        list.splice(i, 1, ...parts);
        i += parts.length - 1;
      }
    }
    // 【途中で切れた観察をつなぐ】改善点ファイル（患者36）：「本日より離床開始の許可あり…車椅子移動許可あるも」と
    // 「痛みや動くことへの不安が生じている。」、「なかなか荷重かけられず」と「荷重をかけ、疼痛増強…移乗は中止。」が
    // 別のカードになり、文末が不自然。「〜あるも」「〜ものの」「〜けど」で終わる観察は、同じ日時の次の観察と1枚にする
    // （間にある本人の発言（S）は飛ばす）。「〜ず」で終わる短い観察は、次の観察が同じ動作（荷重・移乗など）のときだけ。
    const DANGLING_OBSERVATION_END_REGEX = /(?:あるも|するも|したが|ものの|けれど|けれども|けど|だが)$/;
    const SAME_ACTION_TERM_REGEX = /荷重|移乗|歩行|体重|離床|リハビリ|端坐位|立位|起立/g;
    function mergeDanglingObservations(list) {
      const isSpeech = t => /「[^」]{5,}」/.test(t);
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        const text = (it.text || '').trim();
        if (it.isUnnecessaryBoilerplate || it.isLabOrVital || it.fieldLabel || !text || isSpeech(text)) continue;
        const dangling = DANGLING_OBSERVATION_END_REGEX.test(text);
        const shortZu = text.length <= 20 && /ず$/.test(text);
        if (!dangling && !shortZu) continue;
        for (let j = i + 1; j < Math.min(list.length, i + 4); j++) {
          const n = list[j];
          if (n.timestamp !== it.timestamp) break;
          if (n.isUnnecessaryBoilerplate || isSpeech(n.text || '')) continue;
          if (n.isLabOrVital || n.fieldLabel) break;
          if (shortZu && !dangling) {
            const terms = new Set(text.match(SAME_ACTION_TERM_REGEX) || []);
            if (!(n.text.match(SAME_ACTION_TERM_REGEX) || []).some(w => terms.has(w))) break;
          }
          list[i] = { ...it, text: `${text}、${n.text.trim()}` };
          list.splice(j, 1);
          break;
        }
      }
    }
    function splitMixedSubjectiveObjective(list) {
      let serial = 0;
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        if (it.isUnnecessaryBoilerplate || it.isLabOrVital || it.sceneId) continue;
        const text = it.text;
        if (stripStaffQuotes(text) !== text) continue; // 医療者の説明を含むカードは分けない
        if (isFamilySpeech(text)) continue; // 家族の発言は、発言と観察に分けない（「妻は「…」と話していた」）
        if (/（問い：[^）]*）$/.test(text)) continue; // 看護師の問いを添えた答えは分けない
        const quotes = text.match(PATIENT_WORD_QUOTE_REGEX);
        if (!quotes) continue;
        // 「ああ」「はい」のような短い返事は、意識・反応の観察（O）の一部なので分けない（「声を掛けると開眼し、「ああ」と…」）
        if (quotes.every(q => q.length - 2 <= 4)) continue;
        // 「「…手術をすると」と聞いて、今検査をしている」のように、「」の後も本人の話の続き（伝聞・考え）なら分けない
        if (/」\s*と(?:聞いて|聞いた|聞いている|思って|思う|思い|考えて|考え)/.test(text)) continue;
        const labelMatch = text.match(/^([^:：「」、。\s]{1,14})\s*[:：]\s*/);
        const label = labelMatch ? labelMatch[1] : '';
        const body = labelMatch ? text.slice(labelMatch[0].length) : text;
        // 「」の中の句点・読点で文を切らないよう、発言の「」をいったん番号付きの印に置き換えてから文・節に分ける
        const quoteList = [];
        const masked = body.replace(PATIENT_WORD_QUOTE_REGEX, q => `\u0001${quoteList.push(q) - 1}\u0002`);
        const MARK_REGEX = /\u0001\d+\u0002/;
        const unmask = t => t.replace(/\u0001(\d+)\u0002/g, (m, k) => quoteList[Number(k)]);
        const sentences = masked.split(/(?<=。)/).map(x => x.trim()).filter(Boolean);
        // 発言を含む部分から「「…」と言いながら」のような発言の言い回しごと取り除いた残り（述語の無い残りは''）
        const removeSpeech = part => {
          const segs = part.split(/(?:\u0001\d+\u0002)+/);
          let rest = segs.map((seg, k) => (k === 0 ? seg : seg.replace(SPEECH_TAIL_REGEX, '').replace(/^\s*と(?:も)?(?=[^\s、。]|$)/, ''))).map(x => x.trim()).filter(Boolean).join('、');
          rest = rest.replace(/(?:^|、)(?:本人|患者)(?:より|から|が|は)(?=、|$)/g, '').replace(/^、/, '');
          const core = rest.replace(/[、。\s]+$/g, '');
          if (!core || DANGLING_CLAUSE_END_REGEX.test(core)) return '';
          return rest;
        };
        // 【分けても意味が分かるように】利用者からの指摘：「ひとつながりの文章をOとSに分けてしまっているので、何について
        // 言及しているのか分かりにくい」。Sのカードには、発言だけでなく「誰に・どんな場面で」言ったのかを残す。
        //  ・「息子たちの前では、「大丈夫よ」と言っていたが、〜」のように節に分けられる文は、発言を含む節をそのままSにする
        //    （「息子たちの前では「大丈夫よ」と言っていた」）
        //  ・節に分けられない文（「ベッドアップし、昼食摂取「あまり食欲がない」と半分のみ摂取」）は、発言の後ろに
        //    （場面：ベッドアップし、昼食摂取、半分のみ摂取）のように同じ文の観察を添える
        //    （「受持ち看護師には、「…」とも言っていた。」のように観察の無い文はそのままSにする）
        const kept = [];
        const subjectiveParts = [];
        sentences.forEach(sentence => {
          if (!MARK_REGEX.test(sentence)) { kept.push(sentence); return; }
          // 「〜と言っていたが、〜」のように「が、」「けど、」で区切られた節ごとに見て、発言を含む節は言い回しごと除く
          const clauses = sentence.split(/(?<=(?:が|けど|けれど|ものの|ながら))、/);
          if (clauses.length > 1) {
            clauses.filter(c => MARK_REGEX.test(c)).forEach(c => subjectiveParts.push(unmask(c).replace(/(?:が|けど|けれど|ものの|ながら)$/, '').replace(/[、。\s]+$/, '') + '。'));
          } else {
            // 節に分けられない文：発言を除いた残り（同じ文の観察）を（場面：…）として発言に添える。残りが無い
            // （「受持ち看護師には、「…」とも言っていた。」のように言った相手と言い回しだけの）文は、そのままSにする
            const quoted = sentence.match(/\u0001\d+\u0002/g) || [];
            const rest = removeSpeech(sentence).replace(/[、。\s]+$/, '');
            if (!rest) subjectiveParts.push(unmask(sentence).replace(/[、\s]+$/, ''));
            else {
              const note = unmask(rest).replace(/\s*、\s*/g, '、').replace(/、{2,}/g, '、').replace(/^[、。\s]+/, '');
              subjectiveParts.push(`${quoted.map(unmask).join('')}（場面：${note.length > 40 ? `${note.slice(0, 40)}…` : note}）`);
            }
          }
          const parts = clauses.map(c => (MARK_REGEX.test(c) ? removeSpeech(c) : c)).map(c => c.replace(/[、。\s]+$/, '')).filter(Boolean);
          if (!parts.length) return;
          // 後ろの節を除いたために最後が「〜が」「〜けど」で終わる場合は、その接続の語を外す
          parts[parts.length - 1] = parts[parts.length - 1].replace(/(?:が|けど|けれど|ものの)$/, '');
          kept.push(parts.join('、') + (/。$/.test(sentence) ? '。' : ''));
        });
        let objective = unmask(kept.join('')).replace(/\s*、\s*/g, '、').replace(/、{2,}/g, '、').replace(/、。/g, '。').replace(/^[、。\s]+|[、\s]+$/g, '').trim();
        // 観察として残ったのが言い回しだけ、または「ナースコールあり」のように短すぎて単独では何のことか分からない
        // 場合は分けない（1枚のまま「「トイレに行きたい」とナースコールあり」とする）
        const meaningful = objective.replace(/[、。\s]/g, '');
        if (meaningful.length < 10 || /^(?:と|とも)?(?:話す|話した|訴える|訴えあり|言う|言っていた|返答あり|発言あり|本人より|患者より|本人|患者)+$/.test(meaningful)) continue;
        const sceneId = `scene_${Date.now().toString(36)}_${++serial}`;
        const prefix = label ? `${label}: ` : '';
        const subjectiveText = subjectiveParts.join('').replace(/。{2,}/g, '。');
        const subjectiveCard = { ...it, text: cleanExtractedPhrase(`${prefix}${subjectiveText}`), sceneId, soRole: 's' };
        const objectiveCard = { ...it, text: cleanExtractedPhrase(`${prefix}${objective}`), sceneId, soRole: 'o' };
        // 元の文章で先に書かれている方を先に並べる
        const quoteFirst = /^「/.test(body.trim());
        list.splice(i, 1, ...(quoteFirst ? [subjectiveCard, objectiveCard] : [objectiveCard, subjectiveCard]));
        i++;
      }
    }

    const SCENE_EVENT_WORD_REGEX = /^(?:(?:Dr\.?|医師|主治医)?回診|検温|ケア|清拭|RH|リハビリ|心臓リハビリ|心リハ|栄養指導|服薬指導|退院指導|朝食|昼食|夕食|配膳|処置|訪室|与薬|包交|ラウンド)$/;
    function mergeShortFragmentCards(list) {
      const absorb = (target, frag, joined) => {
        target.text = cleanExtractedPhrase(joined);
        if (Array.isArray(target.hendersonIds) || Array.isArray(frag.hendersonIds)) {
          target.hendersonIds = Array.from(new Set([...(target.hendersonIds || []), ...(frag.hendersonIds || [])]));
        }
      };
      for (let qi = 1; qi < list.length;) {
        const cur = list[qi];
        const prev = list[qi - 1];
        const isBareQuote = /^「[^「」]*」$/.test(cur.text.trim()) && FRAGMENT_QUOTE_WITH_WORDS_REGEX.test(cur.text);
        // 直前のカードも発言だけの場合（別々の発言が続いている場合）は、同じ話題（ヘンダーソンの同じ項目）に
        // ついての発言どうしのときだけまとめる（例：「痛み止めって…」「痛みのため昨晩は眠れなかった」は
        // まとめるが、「動かすと…痛い」と「体がべたべたして…お風呂に…」は別の話題なのでまとめない）。
        const prevIsBareQuote = /^「[^「」]*」(?:「[^「」]*」)*$/.test(prev.text.trim());
        const topicTags = t => detectMultipleHendersonTags(t).filter(h => h !== 10);
        const sameTopic = () => {
          const a = topicTags(prev.text), b = topicTags(cur.text);
          // 片方だけ話題が分からない発言（「ごめんなさいね。迷惑かけますね」＝10）と、話題のはっきりした発言
          // （「…トイレに行けてよかった」＝3・4）はまとめない（患者36）。どちらも話題が分からない場合はまとめる。
          return (a.length === 0 && b.length === 0) || a.some(h => b.includes(h));
        };
        // 医師・看護師の説明（「主治医より「…」と説明あり」）のカードには、次の行の本人の発言をまとめない（心不全事例）
        const prevIsStaffSpeech = stripStaffQuotes(prev.text) !== prev.text || STAFF_QUESTION_LINE_REGEX.test(prev.text.trim());
        const canMerge = isBareQuote && !prevIsStaffSpeech && !cur.isUnnecessaryBoilerplate && !prev.isUnnecessaryBoilerplate &&
          !prev.fieldLabel && !prev.isLabOrVital && prev.timestamp === cur.timestamp && FRAGMENT_QUOTE_WITH_WORDS_REGEX.test(prev.text) &&
          (!prevIsBareQuote ? (!/(?:訴え|話|言)[^「」]{0,6}$/.test(prev.text) || sameTopic()) : sameTopic());
        if (canMerge) {
          absorb(prev, cur, prev.text + cur.text);
          list.splice(qi, 1); // 同じ位置に次の行が来るので、qiは進めずにもう一度確認する
        } else {
          qi++;
        }
      }
      const cardsPerLine = new Map();
      list.forEach(it => { if (!it.isUnnecessaryBoilerplate && it._line !== undefined) cardsPerLine.set(it._line, (cardsPerLine.get(it._line) || 0) + 1); });
      const isBareNounFragment = it => !it.isUnnecessaryBoilerplate && !it.fieldLabel && !it.isLabOrVital &&
        (it._line === undefined || (cardsPerLine.get(it._line) || 0) <= 1) &&
        it.text.length <= 6 && !/[\d:：「」。、]/.test(it.text) && !BARE_NOUN_FRAGMENT_STATUS_REGEX.test(it.text);
      // 患者の発言だけのカード（「…」）には、「検温」「入室」のような看護師側の記録の語をまとめない
      const canAbsorbFragment = (target, frag) => !!target && !target.isUnnecessaryBoilerplate && !target.fieldLabel && !target.isLabOrVital &&
        target.timestamp === frag.timestamp && !hasOwnFieldLabelPrefix(target.text) && !isBareNounFragment(target) &&
        !/^「/.test(target.text.trim());
      for (let fi = 0; fi < list.length;) {
        const frag = list[fi];
        if (!isBareNounFragment(frag)) { fi++; continue; }
        const prevItem = list[fi - 1];
        const nextItem = list[fi + 1];
        if (canAbsorbFragment(prevItem, frag)) {
          absorb(prevItem, frag, `${prevItem.text}${/[。、]$/.test(prevItem.text) ? '' : '、'}${frag.text}`);
          list.splice(fi, 1);
        } else if (canAbsorbFragment(nextItem, frag) || (SCENE_EVENT_WORD_REGEX.test(frag.text) && nextItem && !nextItem.isUnnecessaryBoilerplate &&
          !nextItem.isLabOrVital && nextItem.timestamp === frag.timestamp && !/^「/.test(nextItem.text.trim()))) {
          // 「回診」「検温」のような出来事の語は「回診: 酸素OFF、…」のように見出しとして前に付ける
          absorb(nextItem, frag, `${frag.text}${SCENE_EVENT_WORD_REGEX.test(frag.text) ? ': ' : '、'}${nextItem.text}`);
          list.splice(fi, 1);
        } else {
          fi++;
        }
      }
      // ④それ単独ではどのヘンダーソン項目にも当てはまらない短いカード（例：「ガーゼ汚染なし」）が、元の文章の
      //   すぐ前の行（同じ日時）のカードの続きとして書かれている場合は、その続きとして1枚にまとめる
      //   （利用者からの指摘：「ガーゼ汚染なしの前後のつながりをしっかり見てください」。「創部 軽度腫脹と
      //   熱感あるが、発赤・出血・排膿なし」の次の行の「ガーゼ汚染なし」は創部のガーゼのことだが、単独の
      //   カードにすると何のガーゼか分からず、タグも付かなかった）。直前の行のカードが検査値・見出し付き・
      //   発言だけの場合や、行が離れている場合はまとめない（まとめられなければ「タグ未設定」のまま残す）。
      for (let ci = 1; ci < list.length;) {
        const cur = list[ci];
        const prev = list[ci - 1];
        const isOrphan = !cur.isUnnecessaryBoilerplate && !cur.fieldLabel && !cur.isLabOrVital &&
          cur.text.length <= 15 && !/[「」]/.test(cur.text) && detectMultipleHendersonTags(cur.text).length === 0;
        const isAdjacentLine = cur._line === undefined || prev._line === undefined || cur._line - prev._line <= 1;
        const prevCanContinue = !prev.isUnnecessaryBoilerplate && !prev.fieldLabel && !prev.isLabOrVital &&
          prev.timestamp === cur.timestamp && isAdjacentLine && !/^「[^」]*」$/.test(prev.text.trim()) &&
          detectMultipleHendersonTags(prev.text).length > 0;
        if (isOrphan && prevCanContinue) {
          absorb(prev, cur, `${prev.text}${/[。、]$/.test(prev.text) ? '' : '、'}${cur.text}`);
          list.splice(ci, 1);
        } else {
          ci++;
        }
      }
      // ③前後のどのカードにもまとめられなかった「入室」「帰室」のような移動を表す語だけのカードは、
      //   それ単独では所見にならないため不要な情報にする（日時は他のカードの日時として残っている）。
      list.forEach(it => {
        if (!it.isUnnecessaryBoilerplate && /^(?:入室|退室|帰室|入院|転棟|転室|手術室入室)$/.test((it.text || '').trim())) {
          it.isUnnecessaryBoilerplate = true;
        }
      });
      return list;
    }

    // 前後のつながりや接続詞（「〜と話すが、〜」など）を分断せず、一塊の自然な文章として抽出
    // ==========================================================================
    // 【いろいろな書き方の事例文への対応】利用者からのテスト用の7事例（段落形式・時系列記録型・会話形式・申し送り・
    // 電子カルテ風・Markdownの見出し付き）で、次のことが起きていた。行単位の処理の前に、行の形を整える。
    //  ①「# 事例1 高齢者・肺炎」「## 形式:…」の見出しが「・」で割れたカードや、発言を含むSのカードになっていた
    //    → 見出しは不要な情報（記録の見出し）にする。「### 術後2日目」は日の見出しとして読む。
    //  ②【産褥1日目 7:00】のように日と時刻が1つの見出しにまとまっていると読めなかった → 日と時刻に分ける。
    //  ③「翌日、呼吸状態は改善し…」の「翌日」で日が切り替わらなかった → 日の区切りにする。
    //  ④「母親が帰宅しようとすると、」の次の行に「「今日ずっといて」」、さらに次の行に「と顔をしかめる。」のように、
    //    1つの文が行に分かれていると、場面・発言・言い回しが別々のカードになっていた → 1行につなぐ。
    //  ⑤1つの段落に何文も続く書き方（段落形式）では、咳・発熱・食事量・水分・家族の話が1枚のカードになっていた
    //    → 3文以上ある長い段落（見出しの無いもの）は、文ごとの行に分ける。
    // ==========================================================================
    const SOURCE_TITLE_MARK = '\u0002TITLE\u0002';
    const DAY_HEADING_WORD_SOURCE = '(?:入院前日|入院当日|手術前日|手術当日|手術翌日|術後\\s*\\d+\\s*日目|産褥\\s*\\d+\\s*日目|入院\\s*\\d+\\s*日目|翌日|翌朝)';
    const DAY_HEADING_ONLY_REGEX = new RegExp(`^${DAY_HEADING_WORD_SOURCE}$`);
    const QUOTE_ONLY_LINE_REGEX = /^(?:「[^「」]*」\s*)+$/;
    const SPEECH_FOLLOW_LINE_REGEX = /^と(?:[^「」、。]{0,20})[。]?$/;
    function splitSentencesOutsideQuotes(line) {
      const out = [];
      let depth = 0, buf = '';
      for (const ch of line) {
        buf += ch;
        if (ch === '「') depth++;
        else if (ch === '」') depth = Math.max(0, depth - 1);
        else if (ch === '。' && depth === 0) { out.push(buf.trim()); buf = ''; }
      }
      if (buf.trim()) out.push(buf.trim());
      return out.filter(Boolean);
    }
    // SOAP形式の記録の「S)」「O)」「A)」「P)」（新しい長文事例のテスト：緩和ケアの事例）
    // 学生の記録でよく使う「S：」「O：」も同じ（「P：72回/分」のように数字が続くものは脈拍なので除く）
    const SOAP_PREFIX_REGEX = /^(?:([SO])\s*[)）:：]|([AP])\s*(?:[)）]|[:：](?!\s*\d)))\s*/;
    const SOAP_ASSESSMENT_MARK = '\u0002SOAP\u0002';
    // 【学生の実習記録】目標・行動計画・考察・明日の課題・振り返り・指導者からの助言は、学生自身の計画や考えで
    // 患者の情報ではないので不要カードにする（実習記録のテスト：以前は「9:00 バイタルサイン測定」の計画が
    // 実施した記録と同じ時刻のカードになり、考察の文にもタグが付いていた）
    // 「【学生の考察】」「【指導者からの助言】」「【情報の整理（学生）】」も学生・指導者の書いた部分（実習生の記録のテストで発覚：
    // 見出しが消え、中身が患者の観察（O）のカードになっていた）
    const STUDENT_SECTION_HEADING_REGEX = /^[【\[＜<■●◆]\s*(?:本日の|今日の|明日の|実習|学生の)?(?:目標|行動計画|看護計画|計画|考察|評価|自己評価|課題|学び|感想|振り返り|反省|気づき|明日への課題|今後の課題|指導者(?:から|より)?の?(?:助言|コメント|指導)|指導者より|助言|情報の整理)(?:[・と][^】\]＞>]{0,12})?\s*(?:[(（]\s*(?:学生|自分)[^)）]{0,6}[)）])?\s*[】\]＞>]?\s*$/;
    const STUDENT_NOTE_LINE_REGEX = /^(?:学生の(?:関わりの)?)?(?:アセスメント|考察|振り返り|感想|反省|今日の学び|学び|明日の課題|今後の課題|自己評価|看護問題|看護計画|目標|場面を選んだ理由|この場面を選んだ理由|気づいたこと|気付いたこと)\s*[:：]/;
    // プロセスレコード：「②私が感じたこと・考えたこと：」「③私の言動：」は学生の考えや働きかけなので不要カード。
    // 「①患者の言動：」は見出しを外して、患者の言動だけを残す（①はNFKCで「1」になる）
    const PROCESS_RECORD_STUDENT_REGEX = /^\d{0,2}\s*(?:私|学生|自分)(?:が|の)?(?:感じたこと|考えたこと|思ったこと|言動|行動|かかわり|関わり|対応)[^:：]{0,12}[:：]/;
    const PROCESS_RECORD_PATIENT_REGEX = /^\d{0,2}\s*(?:患者|本人|対象者?|[A-ZＡ-Ｚ]さん|[A-ZＡ-Ｚ]氏)(?:さん)?の(?:言動|反応|言葉|様子)\s*[:：]\s*/;
    // 「〇情報（朝）」「◎ケア」のような記号付きの短い見出し（句点・コロン・数字の無いもの）
    const BULLET_HEADING_REGEX = /^[〇○◎]\s*([^。:：\d「」]{1,15})$/;
    const BULLET_MARK_REGEX = /^[〇○◎]\s*/;
    // 【レビューで発見】「○ 腹痛なし」「○ 嘔気あり」「○ 排ガスあり、排便なし」のような○の箇条書きの所見も、短いため
    // 上の見出しと判定され「不要」になっていた（●の箇条書きは所見のまま）。有無・程度・状態を表す語や読点を含む行は見出しにしない。
    const BULLET_OBSERVATION_WORD_REGEX = /なし|無し|あり|有り|良好|不良|可能|不可|困難|自立|介助|認め|みられ|見られ|摂取|低下|上昇|増強|軽減|著明|軽度|中等度|重度|陰性|陽性|[(（][-+±][)）]|[、,]/;
    // 【レビューで発見】「A：」「P：」（アセスメント・計画）や【考察】の下の行は、次の見出しまで「不要」にするが、
    // 以前は空行か時刻で始まる行でしか終わらなかったため、続けて書かれた次の日の見出し（「術後2日目」「10月4日」）と
    // その下の観察・バイタルまで「不要」に入り、日も切り替わらなかった。日・日付の見出しの行で終わりにする。
    const DAY_BOUNDARY_LINE_REGEX = new RegExp(
      `^[【\\[<＜■●◆]?\\s*(?:(?:\\d{1,4}年)?\\d{1,2}月\\d{1,2}日(?:\\s*[(（][月火水木金土日祝](?:曜日?)?[)）])?|\\d{4}[\\/\\-]\\d{1,2}[\\/\\-]\\d{1,2}|\\d{1,2}\\/\\d{1,2}(?:\\s*[(（][月火水木金土日祝][)）])?|${DAY_HEADING_WORD_SOURCE})\\s*[】\\]>＞]?(?=\\s*$|\\s*\\d{1,2}[:時]\\d{0,2})`
    );
    // 表の日付の列を読んだ後に、表の前の日時に戻すための印（expandTabSeparatedLabTables の説明を参照）
    const DAY_SAVE_MARK = '\u0002DAYSAVE\u0002';
    const DAY_RESTORE_MARK = '\u0002DAYRESTORE\u0002';
    const STUDENT_ADVICE_LINE_REGEX = /^(?:臨床)?(?:実習)?(?:指導者|担当教員|教員|指導ナース|指導看護師)(?:さん|の[^、。]{0,6})?(?:より|から|に|が)/;
    // 「1．正常に呼吸する」「4.身体の位置を動かし、よい姿勢を保持する」のようなヘンダーソンの項目の見出し。
    // 見出しの下の行は、学生がその項目の情報として書いたものなので、その項目のタグも付ける（needHint）
    const HENDERSON_HEADING_WORDS = [
      [1, /呼吸/], [2, /飲食|食事|食べ|飲む/], [3, /排泄/], [4, /身体の位置|姿勢|体位|移動/], [5, /睡眠|休息|眠る/],
      [6, /衣類|衣服|着脱|更衣/], [7, /体温/], [8, /清潔|身だしなみ|皮膚を保護/], [9, /環境|危険/],
      [10, /コミュニケーション|感情|意思|欲求|恐怖/], [11, /信仰|宗教|価値観/], [12, /仕事|達成感|生産的/],
      [13, /遊び|レクリエーション|余暇|娯楽/], [14, /学習|学ぶ|好奇心/]
    ];
    const NEED_HEADING_MARK = '\u0002NEED';
    const NEED_HINT_REGEX = /^\u0003(\d{1,2})\u0003/;
    function hendersonHeadingNeed(line) {
      const m = line.match(/^(?:[【\[＜<]\s*)?(\d{1,2})\s*[.．、)）:：]\s*([^「」。]{2,40}?)\s*[】\]＞>]?$/);
      if (!m) return null;
      const n = Number(m[1]);
      if (n < 1 || n > 14) return null;
      // 【レビューで発見】「2. 食事は全粥5割摂取」のような番号付きの所見まで項目の見出しにしていた。見出しに数値は無い
      if (/\d/.test(m[2])) return null;
      const hit = HENDERSON_HEADING_WORDS.find(([id]) => id === n);
      return hit && hit[1].test(m[2]) ? n : null;
    }
    // 1行目・2行目の「成人看護学実習Ⅱ 実習記録（3日目）」「情報収集・アセスメント用紙」のような題名
    const STUDENT_TITLE_WORD_REGEX = /実習|記録|用紙|アセスメント|情報収集|看護過程|ケーススタディ|事例|症例/;
    function preprocessFreeFormLines(raw) {
      const step1 = [];
      const firstIdx = raw.findIndex(l => String(l).trim() !== '');
      let soapPart = null;
      let babySection = false; // 「＜児（新生児）＞」の見出しの下を読んでいる間
      let lastDayHeading = null; // 直前の「Day N（…）」の見出し（{ n, label }）。かっこの無い「Day N」の日を決めるのに使う
      raw.forEach((original, idx) => {
        const line = original.trim();
        // 表の前の日時に戻すための印は、そのまま通す（expandTabSeparatedLabTables）
        if (line === DAY_SAVE_MARK || line === DAY_RESTORE_MARK) { step1.push(line); return; }
        // 1行目の「事例A 膵がん終末期…」「症例2：…」のような題名（句点の無い短い行）は不要カード
        if (idx === firstIdx && line.length <= 80 && !/[。「]/.test(line) && !/\d+\s*歳|男性|女性/.test(line) &&
          (/^[◆■●◇□○＜<【]?\s*(?:事例|症例|ケース|紙上事例)\s*[A-Za-zＡ-Ｚ0-9０-９一二三四五六七八九十]*(?:[\s　:：・]|$)/.test(line) ||
            (/実習|記録用紙|アセスメント用紙|情報収集|看護過程|ケーススタディ/.test(line) && !/[:：]/.test(line) && !/^[<＜【\[(（]/.test(line)))) {
          step1.push(SOURCE_TITLE_MARK + line);
          // 題名の中の日付（「日々の記録 10/7（火）」）は、その日の区切りとして使う
          const titleDate = line.match(/(?:^|[^\d])(\d{1,2})[\/月](\d{1,2})日?(?![\d])/);
          if (titleDate && Number(titleDate[1]) >= 1 && Number(titleDate[1]) <= 12 && Number(titleDate[2]) >= 1 && Number(titleDate[2]) <= 31) step1.push(`${Number(titleDate[1])}月${Number(titleDate[2])}日`);
          return;
        }
        // 「Day 1（月・術後3日目）」のような日の見出しは、かっこの中の日（術後3日目）を日の区切りとして使う
        // 「Sデータ」「Oデータ」だけの行は見出し（中身の発言・観察でS／Oは決まる）（利用者の実習記録のテスト）
        const dayNHeading = line.match(/^[【\[<＜]?\s*(?:Day|DAY|day)\s*(\d{1,2})\s*(?:[(（]([^)）]*)[)）])?\s*[】\]>＞]?$/);
        if (dayNHeading) {
          const inner = (dayNHeading[2] || '').replace(/\s+/g, '');
          const innerDay = inner.match(new RegExp(DAY_HEADING_WORD_SOURCE));
          step1.push(SOURCE_TITLE_MARK + line);
          // 【Day の見出しの日】繰り返し入力の確認で発覚：「Day1（入院時）」「Day2」の下のカードが「日時不明」になっていた。
          //  ・かっこの中が「入院時」「術前」なども日として使う。
          //  ・かっこの無い「Day2」は、直前の Day の見出しから数える（Day1＝入院時なら Day2＝入院2日目、
          //    Day3＝術後1日目なら Day5＝術後3日目）。数えられないときは「2日目」とする。
          const n = Number(dayNHeading[1]);
          let label = innerDay ? normalizeDayLabel(innerDay[0]) : ((inner.match(/入院時|入院当日|手術当日|術前|入院前/) || [])[0] || null);
          if (!label && !inner) {
            const prev = lastDayHeading;
            const diff = prev ? n - prev.n : null;
            let m;
            if (prev && diff > 0) {
              if (/^(?:入院時|入院当日)$/.test(prev.label)) label = `入院${1 + diff}日目`;
              else if ((m = prev.label.match(/^入院(\d+)日目$/))) label = `入院${Number(m[1]) + diff}日目`;
              else if ((m = prev.label.match(/^術後(\d+)日目$/))) label = `術後${Number(m[1]) + diff}日目`;
              else if (prev.label === '手術当日') label = `術後${diff}日目`;
              else if ((m = prev.label.match(/^産褥(\d+)日目$/))) label = `産褥${Number(m[1]) + diff}日目`;
            }
            if (!label) label = `${n}日目`;
          }
          if (label) {
            step1.push(label);
            lastDayHeading = { n, label };
          }
          soapPart = null;
          return;
        }
        // 【日付の見出し】実習生の記録のテストで発覚：「10/7（火）術後1日目」「10/7（月）透析日」のような日付＋曜日の見出しが
        // 見出しとして読まれず、その下のカードが「日時不明」や時刻だけ（「6:00」）になっていた。
        // かっこの曜日の後ろの短い言葉に日の呼び方（術後1日目・入院3日目 など）があればそれを、無ければ日付（10月7日）を日の区切りにする。
        // 【母性：児（新生児）の記録】実習生の記録のテストで発覚：「＜児（新生児）＞」の下の体温・心拍・体重が母親のカードと
        // 区別できず、検査値の推移では母親の脈拍・呼吸数として「高い」と表示されていた。児の見出しの下の行には「児：」を付け、
        // 次の見出し・日付・時刻まで続ける（「児：」の付いたカードは、検査値の推移の表に入れない）。
        if (/^[<＜【\[■●◆]?\s*(?:児|新生児|赤ちゃん|ベビー)\s*(?:[(（][^)）]{0,10}[)）])?\s*(?:の(?:状態|様子|観察|記録))?\s*[>＞】\]]?\s*$/.test(line)) {
          babySection = true; step1.push(SOURCE_TITLE_MARK + line); return;
        }
        if (babySection) {
          if (!line) { step1.push(original); return; }
          if (/^[<＜【\[■●◆]/.test(line) || /^\d{1,2}[:：時]\d{0,2}/.test(line) || /^(?:Day|DAY|day)\s*\d/.test(line) || /^\d{1,2}\s*[\/月]\s*\d{1,2}/.test(line)) babySection = false;
          else { step1.push(/^(?:児|新生児)\s*[:：]/.test(line) || /^[「『]/.test(line) ? line : `児：${line}`); return; }
        }
        const dateHeading = line.match(/^[【\[<＜]?\s*(\d{1,2})\s*[\/月]\s*(\d{1,2})\s*日?\s*[(（]\s*[月火水木金土日](?:曜日?)?\s*[)）]\s*([^、。,:：「」]{0,20}?)\s*[】\]>＞]?$/);
        if (dateHeading && Number(dateHeading[1]) >= 1 && Number(dateHeading[1]) <= 12 && Number(dateHeading[2]) >= 1 && Number(dateHeading[2]) <= 31) {
          const restDay = (dateHeading[3] || '').match(new RegExp(DAY_HEADING_WORD_SOURCE));
          step1.push(SOURCE_TITLE_MARK + line);
          step1.push(restDay ? normalizeDayLabel(restDay[0]) : `${Number(dateHeading[1])}月${Number(dateHeading[2])}日`);
          soapPart = null;
          return;
        }
        // 「実習1日目（入院2日目）10/8」のように、かっこで囲まない実習の日の見出し（実習生の記録のテスト：乳児のRSウイルス）
        const practiceDay = line.match(/^[・]?\s*実習\s*\d+\s*日目\s*(?:[(（]([^)）]{1,20})[)）])?\s*(?:(\d{1,2})\s*[\/月]\s*(\d{1,2})\s*日?)?\s*(?:[(（][月火水木金土日][)）])?\s*$/);
        if (practiceDay && (practiceDay[1] || practiceDay[2])) {
          const inner = extractDayLabelFromHeading(practiceDay[1] || '');
          const date = practiceDay[2] && Number(practiceDay[2]) <= 12 && Number(practiceDay[3]) <= 31 ? `${Number(practiceDay[2])}月${Number(practiceDay[3])}日` : null;
          if (inner || date) {
            step1.push(SOURCE_TITLE_MARK + line);
            step1.push(inner || date);
            soapPart = null;
            return;
          }
        }
        // 「訪問1回目（10/7 14:00〜15:00）」のような訪問の見出し：日付と始めの時刻を、その下のカードの日時にする
        const visitHeading = line.match(/^[【\[<＜・]?\s*(?:訪問|面接|実習)\s*\d+\s*(?:回目|日目)\s*[(（]\s*(\d{1,2})\s*[\/月]\s*(\d{1,2})\s*日?\s*(?:[(（][月火水木金土日][)）])?\s*(\d{1,2}:\d{2})?[^)）]*[)）]\s*[】\]>＞]?$/);
        if (visitHeading && Number(visitHeading[1]) >= 1 && Number(visitHeading[1]) <= 12 && Number(visitHeading[2]) >= 1 && Number(visitHeading[2]) <= 31) {
          step1.push(SOURCE_TITLE_MARK + line);
          step1.push(`${Number(visitHeading[1])}月${Number(visitHeading[2])}日`);
          if (visitHeading[3]) step1.push(visitHeading[3]);
          soapPart = null;
          return;
        }
        if (/^(?:[SO]\s*データ|[SO]\s*情報|主観的(?:データ|情報)|客観的(?:データ|情報))\s*[:：]?$/.test(line)) { step1.push(SOURCE_TITLE_MARK + line); return; }
        if (/^実習開始時の状況\s*[:：]|受け持つ設定/.test(line)) { step1.push(SOAP_ASSESSMENT_MARK + line); return; }
        // 学生の目標・計画・考察などの見出しの下は、次の見出し（【…】）まで不要カード
        const bulletHeadingRaw = line.match(BULLET_HEADING_REGEX);
        // 所見（「○ 腹痛なし」）は見出しにしない（BULLET_OBSERVATION_WORD_REGEX の説明を参照）
        const bulletHeading = bulletHeadingRaw && !BULLET_OBSERVATION_WORD_REGEX.test(bulletHeadingRaw[1]) ? bulletHeadingRaw : null;
        const headingBody = bulletHeading ? `【${bulletHeading[1].trim()}】` : line;
        if (STUDENT_SECTION_HEADING_REGEX.test(headingBody) || (bulletHeading && /気づ|気付|考察|振り返|感想|反省|学び|課題|目標|計画/.test(bulletHeading[1]))) {
          soapPart = 'STUDENT'; step1.push(SOAP_ASSESSMENT_MARK + line); return;
        }
        if (soapPart === 'STUDENT') {
          if (/^[【\[＜<■●◆〇○◎]/.test(line) || /^\d{1,2}\/\d{1,2}/.test(line) || DAY_BOUNDARY_LINE_REGEX.test(line)) soapPart = null;
          else { if (line) step1.push(SOAP_ASSESSMENT_MARK + line); else step1.push(original); return; }
        }
        if (bulletHeading) { step1.push(SOURCE_TITLE_MARK + line); return; }
        if (PROCESS_RECORD_STUDENT_REGEX.test(line)) { step1.push(SOAP_ASSESSMENT_MARK + line); return; }
        const processPatient = line.match(PROCESS_RECORD_PATIENT_REGEX);
        if (processPatient) { step1.push(line.slice(processPatient[0].length)); return; }
        if (BULLET_MARK_REGEX.test(line) && line.replace(BULLET_MARK_REGEX, '').length >= 2) { step1.push(line.replace(BULLET_MARK_REGEX, '')); return; }
        if (STUDENT_NOTE_LINE_REGEX.test(line) || STUDENT_ADVICE_LINE_REGEX.test(line)) { step1.push(SOAP_ASSESSMENT_MARK + line); return; }
        const needHead = hendersonHeadingNeed(line);
        if (needHead) { step1.push(`${NEED_HEADING_MARK}${needHead}\u0002${line}`); soapPart = null; return; }
        // 「10/1」「10/1（月）」だけの行は日の区切り（「10月1日」として読む）
        const slashDate = line.match(/^(\d{1,2})\/(\d{1,2})(?:\s*[\(（][月火水木金土日][\)）])?$/);
        if (slashDate && Number(slashDate[1]) >= 1 && Number(slashDate[1]) <= 12 && Number(slashDate[2]) >= 1 && Number(slashDate[2]) <= 31) {
          step1.push(`${Number(slashDate[1])}月${Number(slashDate[2])}日`);
          soapPart = null;
          return;
        }
        // S)・O)は印を外して本文だけにする。A)（アセスメント）・P)（計画）は記録した人の判断で患者の情報ではないので不要カード
        const soap = line.match(SOAP_PREFIX_REGEX);
        if (soap) {
          soapPart = soap[1] || soap[2];
          const body = line.slice(soap[0].length);
          if (/[AP]/.test(soapPart)) step1.push(SOAP_ASSESSMENT_MARK + `${soapPart}) ${body}`);
          else if (body) step1.push(body);
          return;
        }
        // 次の日・日付の見出しの行で A・P の続きは終わり（DAY_BOUNDARY_LINE_REGEX の説明を参照）
        if (soapPart && /[AP]/.test(soapPart) && DAY_BOUNDARY_LINE_REGEX.test(line)) soapPart = null;
        if (soapPart && /[AP]/.test(soapPart) && line && !/^\d{1,2}[:時]\d{2}/.test(line)) { step1.push(SOAP_ASSESSMENT_MARK + line); return; }
        if (!line) soapPart = soapPart && /[AP]/.test(soapPart) ? null : soapPart;
        const md = line.match(/^#{1,6}\s*(.+)$/);
        if (md) {
          const inner = md[1].trim();
          if (DAY_HEADING_ONLY_REGEX.test(inner.replace(/\s+/g, ''))) step1.push(inner.replace(/\s+/g, ''));
          else step1.push(SOURCE_TITLE_MARK + inner);
          return;
        }
        const bracketDay = line.match(new RegExp(`^【\\s*(${DAY_HEADING_WORD_SOURCE})\\s*(\\d{1,2}[:時]\\d{2})?\\s*([^】]*)】$`));
        if (bracketDay) {
          step1.push(bracketDay[1].replace(/\s+/g, ''));
          const rest = [bracketDay[2], bracketDay[3]].filter(x => x && x.trim()).join(' ').trim();
          if (rest) step1.push(bracketDay[2] ? rest : `【${rest}】`);
          return;
        }
        const nextDay = line.match(/^(翌日|翌朝)[、,]\s*(.+)$/);
        if (nextDay) { step1.push(nextDay[1]); step1.push(nextDay[2]); return; }
        step1.push(original);
      });
      // タブ区切りの表（「項目	入院前	術後5日目」）は、行ごとに「食事：入院前 自立 → 術後5日目 一部介助」の形にする
      // （以前は列の見出しが消え、どちらが入院前の状態か分からなかった。新しい長文事例のテスト：ADLの表）
      for (let i = 0; i < step1.length; i++) {
        const header = step1[i].trim().split(/\t+/).map(c => c.trim());
        if (header.length < 3 || header.some(c => !c) || /基準|正常値|検査|単位/.test(header.join(' ')) || header.slice(1).some(c => /^[\d.,]+$/.test(c))) continue;
        let j = i + 1;
        const rows = [];
        while (j < step1.length) {
          const cells = step1[j].trim().split(/\t+/).map(c => c.trim());
          if (cells.length !== header.length || !cells[0]) break;
          rows.push(cells);
          j++;
        }
        if (rows.length === 0) continue;
        const rewritten = rows.map(cells => `${cells[0]}：` + cells.slice(1).map((c, k) => `${header[k + 1]} ${c}`).join(' → '));
        step1.splice(i, 1 + rows.length, SOURCE_TITLE_MARK + header.join(' '), ...rewritten);
        i += rows.length;
      }
      // ④ 行に分かれた1つの文をつなぐ
      const out = [];
      for (let i = 0; i < step1.length; i++) {
        const cur = step1[i].trim();
        const nextIdx = k => { let j = k; while (j < step1.length && step1[j].trim() === '') j++; return j; };
        const endsWithComma = /、$/.test(cur) && cur.length <= 60 && !cur.startsWith(SOURCE_TITLE_MARK) && !cur.startsWith(SOAP_ASSESSMENT_MARK);
        const isQuoteOnly = QUOTE_ONLY_LINE_REGEX.test(cur);
        if (!endsWithComma && !isQuoteOnly) { out.push(step1[i]); continue; }
        let j = nextIdx(i + 1);
        let joined = cur;
        let last = i;
        let quotes = isQuoteOnly ? 1 : 0;
        while (j < step1.length && QUOTE_ONLY_LINE_REGEX.test(step1[j].trim()) && quotes < 6) {
          joined += step1[j].trim();
          quotes++;
          last = j;
          j = nextIdx(j + 1);
        }
        let followed = false;
        if (quotes > 0 && j < step1.length && SPEECH_FOLLOW_LINE_REGEX.test(step1[j].trim())) {
          joined += step1[j].trim();
          last = j;
          followed = true;
        }
        // 発言だけの行が続くときは、後に「と話す」の行が続く場合だけ1つにまとめる
        // （患者36：別々の発言を並べた行は今まで通り別のカード）
        if ((isQuoteOnly && !followed) || joined === cur) { out.push(step1[i]); continue; }
        out.push(joined);
        i = last;
      }
      // ⑤ 長い段落を文ごとの行に分ける（見出し「〜:」で始まる行・日時で始まる行は今まで通り）
      const result = [];
      out.forEach(line => {
        const t = line.trim();
        if (t.length > 100 && !/^[^:：「」。]{1,14}[:：]/.test(t) && !/^\d{1,2}[:時]\d{2}/.test(t) && !t.startsWith(SOURCE_TITLE_MARK) && !t.startsWith(SOAP_ASSESSMENT_MARK)) {
          const sentences = splitSentencesOutsideQuotes(t);
          if (sentences.length >= 3) { sentences.forEach(s => result.push(s)); return; }
        }
        result.push(line);
      });
      // ヘンダーソンの項目の見出しの下の行に、その項目の印（needHint）を付ける
      let currentNeed = null;
      return result.map(line => {
        const t = String(line).trim();
        const head = t.match(/^\u0002NEED(\d{1,2})\u0002(.*)$/);
        if (head) { currentNeed = Number(head[1]); return SOURCE_TITLE_MARK + head[2]; }
        if (/^[【\[＜<■●◆]/.test(t) || t.startsWith(SOURCE_TITLE_MARK)) currentNeed = null;
        return currentNeed && t && !t.startsWith(SOAP_ASSESSMENT_MARK) && t !== DAY_SAVE_MARK && t !== DAY_RESTORE_MARK ? `\u0003${currentNeed}\u0003${t}` : line;
      });
    }
    // 【Excelなどから貼った検査の表（タブ区切り）】実習生の記録のテストで発覚：「項目⇥基準値⇥10/2⇥10/7」の表を貼ると、
    // 基準値の「8〜20」の下限を値と読み違え「BUN 8 mg/dL」という記録に無い値のカードができ、実際の値（78・42）は
    // 意味の分からない断片のカードになっていた。基準値の列のある表は、行（項目）と列（日付）ごとに
    // 「BUN 78 mg/dL (基準値: 8〜20 mg/dL)」の形の行に直してから読む（列の見出しの日付・日の呼び方をその日時にする）。
    const TAB_TABLE_REF_HEADER_REGEX = /^(?:基準値|基準範囲|正常値|参考値|正常範囲)$/;
    function tabTableColumnDay(label) {
      const t = String(label || '').normalize('NFKC').trim();
      let m;
      if ((m = t.match(/^(\d{1,2})\s*[\/月]\s*(\d{1,2})\s*日?(?:\s*[(（][^)）]*[)）])?$/)) && Number(m[1]) >= 1 && Number(m[1]) <= 12 && Number(m[2]) >= 1 && Number(m[2]) <= 31) return `${Number(m[1])}月${Number(m[2])}日`;
      if (new RegExp(`^${DAY_HEADING_WORD_SOURCE}$`).test(t.replace(/\s+/g, '')) || /^(?:入院時|入院前|術前|手術当日)$/.test(t)) return normalizeDayLabel(t);
      return null;
    }
    function expandTabSeparatedLabTables(lines) {
      const out = [];
      for (let i = 0; i < lines.length; i++) {
        const cells = String(lines[i]).split('\t').map(c => c.trim());
        const refIdx = cells.findIndex(c => TAB_TABLE_REF_HEADER_REGEX.test(c.normalize('NFKC')));
        if (cells.length < 3 || refIdx < 1) { out.push(lines[i]); continue; }
        const valueCols = cells.map((c, k) => k).filter(k => k > 0 && k !== refIdx && cells[k]);
        const rows = [];
        let j = i + 1;
        for (; j < lines.length; j++) {
          const rc = String(lines[j]).split('\t').map(c => c.trim());
          if (rc.length < 2 || !rc[0]) break;
          rows.push(rc);
        }
        if (!rows.length || !valueCols.length) { out.push(lines[i]); continue; }
        const unitOf = ref => ((String(ref).normalize('NFKC').match(/\d\s*((?:[×x]\s*10\^?\d+\s*)?[\/A-Za-zμµ%][^\s]*)\s*$/) || [])[1] || '');
        const line = (row, k) => {
          const v = (row[k] || '').trim();
          if (!v || /^[-ー－―‐]+$/.test(v)) return null;
          const ref = (row[refIdx] || '').trim();
          const unit = /[A-Za-zμµ%]/.test(v) ? '' : unitOf(ref);
          // 表の「P」は脈拍ではなくリン（mg/dL）なので、分かるように「P(リン)」と書く（検査値の推移で脈拍の行に入らないように）
          const name = /^P$/i.test(row[0]) && /mg\/dL/i.test(unit || v) ? 'P(リン)' : row[0];
          return `${name} ${v}${unit ? ` ${unit}` : ''}${ref && !/^[-ー－―‐]+$/.test(ref) ? ` (基準値: ${ref})` : ''}`;
        };
        const days = valueCols.map(k => tabTableColumnDay(cells[k]));
        out.push(SOURCE_TITLE_MARK + cells.join(' '));
        if (days.every(Boolean)) {
          // 【レビューで発見】列の日付（「10/2」「10/7」）を日の区切りとして読んだ後、表の後ろの記録まで表の最後の列の日付
          // （10月7日）になっていた（10月5日の「14:00 透析後ふらつきあり」が「10月7日 14:00」になる）。
          // 表の前後に印を置き、表を読み終えたら表の前の日時に戻す（groupClinicalPhrasesWithTimestamps で読む）。
          out.push(DAY_SAVE_MARK);
          valueCols.forEach((k, n) => {
            const list = rows.map(r => line(r, k)).filter(Boolean);
            if (!list.length) return;
            out.push(days[n]);
            list.forEach(l => out.push(l));
          });
          out.push(DAY_RESTORE_MARK);
        } else {
          // 列の見出しが日付でないときは、1つの項目を1行にまとめる（「BUN 前回 78 → 今回 42 mg/dL (基準値: …)」）
          rows.forEach(r => {
            const parts = valueCols.map(k => ((r[k] || '').trim() && !/^[-ー－―‐]+$/.test(r[k].trim()) ? `${cells[k]} ${r[k].trim()}` : null)).filter(Boolean);
            if (!parts.length) return;
            const ref = (r[refIdx] || '').trim();
            out.push(`${r[0]} ${parts.join(' → ')}${unitOf(ref) ? ` ${unitOf(ref)}` : ''}${ref ? ` (基準値: ${ref})` : ''}`);
          });
        }
        i = j - 1;
      }
      return out;
    }
    function groupClinicalPhrasesWithTimestamps(text) {
      // 子どもの記録か・創部の書き方は、この文章から決める（extractionContext の説明を参照）
      return withExtractionContext(text, () => groupClinicalPhrasesWithTimestampsInner(text));
    }
    function groupClinicalPhrasesWithTimestampsInner(text) {
      const extracted = [];
      let globalTimestamp = "日時不明";
      // 【日付（術後日数）付きの日時】利用者からの指摘（患者36）：「12:00」「8:00」のように時刻だけで
      // 抽出していたため、手術当日・術後1日目・術後2日目の同じ時刻の記録が区別できなかった。
      // 「手術当日」「術後1日目」「翌日」「＜実習2日目…＞」のような日の区切りを dayLabel に覚えておき、
      // 時刻には「術後1日目 12:00」のように日を付ける。日の区切りが書かれていなくても、時刻が前の時刻より
      // 大きく戻った（22:00→8:00）ときは次の日に進んだとみなす（nextDayLabel）。
      let dayLabel = null;
      let lastClockMin = null;
      function applyTimeMarker(raw) {
        const clock = raw.match(/^(\d{1,2})(?::(\d{2})|時(?:(\d{2})分?)?)(?:ごろ|頃|過ぎ)?$/);
        if (clock) {
          const h = Number(clock[1]);
          const m = Number(clock[2] || clock[3] || 0);
          const min = h * 60 + m;
          if (dayLabel && lastClockMin !== null && min < lastClockMin - 180) {
            const next = nextDayLabel(dayLabel);
            if (next) dayLabel = next;
          }
          lastClockMin = min;
          const hhmm = `${h}:${String(m).padStart(2, '0')}`;
          return dayLabel ? `${dayLabel} ${hhmm}` : hhmm;
        }
        if (raw === '検査データ') return raw;
        if (raw === '翌日' || raw === '翌朝') {
          dayLabel = nextDayLabel(dayLabel) || raw;
          lastClockMin = null;
          return dayLabel;
        }
        dayLabel = normalizeDayLabel(raw);
        lastClockMin = null;
        return dayLabel;
      }
      // 見出しの中の日の手がかり（「＜実習3日目（入院3日目、手術当日・術直後）＞」→手術当日）で日を切り替える
      function setDayFromHeading(text) {
        const d = extractDayLabelFromHeading(text);
        if (!d) return false;
        dayLabel = d;
        lastClockMin = null;
        globalTimestamp = d;
        return true;
      }
      // ==========================================================================
      // 入院前／入院後の自動判定（利用者からの要望に基づく状態管理方式）
      // ------------------------------------------------------------------------
      // 【背景】総合アセスメント表の「前」「後」欄の初期振り分け（inferAssessmentColumn）は
      // 従来、そのカード自身のタイムスタンプ・見出しラベルだけを見て判定していたため、
      // 明確な時系列マーカー（術前・術後・日付・時刻等）を伴わない普通の文章（既往歴の説明の
      // 続きの文、等）は判定できずに「未分類」欄に残ってしまっていた。
      // 記録は基本的に時系列順に書かれているため、「今どの時期の記録を読んでいるか」を
      // 上から順に記憶しながら読み進めれば、明示的なマーカーが無い行にも前後の文脈から
      // 妥当な判定を補えるはず、という利用者の提案に基づき、以下の状態機械を追加する：
      //   ①最初は「入院前」と仮定して開始する（記録の冒頭は氏名・年齢・既往歴・生活歴等の
      //     受け持ち前の基本情報から始まることが多いため）。
      //   ②「入院」「実習」「術前」「術中」「術後」等の見出し・時系列マーカーを見つけたら、
      //     以降は「入院後」として記憶する（「＜実習1日目…＞」のような日数見出しも対象）。
      //   ③明示的に「入院前」と書かれたマーカーに戻ってきた場合は、その時点で「入院前」に
      //     戻す（既存のinferAssessmentColumnがタイムスタンプの「入院前」表記を最優先するのと
      //     同じ考え方）。
      // この状態はカードそのものの内容ではなく「今どの行を読んでいるか」という抽出処理側の
      // 一時的な文脈情報のため、抽出後の各カードに現在値をコピーして持たせる
      // （pushExtractedの説明を参照）。
      let admissionPhase = 'preadmission';
      function updateAdmissionPhase(text) {
        const signal = detectAdmissionPhaseSignal(text);
        if (signal) admissionPhase = signal;
      }
      // extracted.push(...)の代わりに必ずこちらを使うことで、その時点のadmissionPhaseを
      // 全てのカードに一律で持たせる（抽出処理内には十数か所のpush箇所があり、個別に
      // admissionPhaseを書き足すと見落としの恐れがあるため、共通の入口を1つにまとめる）。
      // 各カードが元の文章の何行目から作られたか（_line）。同じ行から「、」「・」の列挙で分割された
      // カード（例：「シャワー浴、弾性ストッキング着用」）を、下の短い断片の結合の対象から外すために使う。
      // 内部の判定用のため、この関数から返す前に取り除く（カードとしては保存しない）。
      let currentSourceLine = -1;
      let currentNeedHint = null;
      function pushExtracted(obj) {
        extracted.push({ ...obj, admissionPhase, _line: currentSourceLine, ...(currentNeedHint && !obj.isUnnecessaryBoilerplate ? { needHint: currentNeedHint } : {}) });
      }
      // detectFieldLabelHeadingOnlyLineで見出しラベルだけの行を検出した際、実際の値を持つ
      // 次の行にそのラベルを引き継ぐための一時変数（detectFieldLabelHeadingOnlyLineの説明を参照）。
      let pendingFieldLabelKeys = null;
      // 「検査項目／基準値／A氏(術前)／A氏(術後)」のような表のヘッダー行を読み取った際に、
      // 3列目以降（基準値の次）がそれぞれ何のタイムスタンプに対応する列かを記憶しておく。
      // ヘッダーが見つからない表（項目名→基準値→実測値、のような単純な形式）ではこの配列は
      // 空のままで、その場合は従来通りその時点のglobalTimestampをそのまま使う。
      let tableColumnPhases = [];
      // 何番目の表か（下のgroupComparisonLabTablesで、同じ表の行をまとめるために使う）
      let tableSerial = 0;
      // ヘッダーで「基準値」（または同義の「正常値」「基準範囲」等）の列があると分かった表では、
      // 各項目の値の1行目は必ず基準値の列（「ー」なら基準値なし）で、2行目以降が実測値の列になる。
      // 以前はこの列構成を使わず、値の1行目が「〜」を含むかどうかだけで基準値かを推測していたため、
      // 「8.1-9.0×10³/μL」（ハイフン区切り）や「<0.2mg/dl」（不等号）の基準値が実測値と誤認され、
      // 基準値だけのカードが作られていた（利用者からのアップロード文書で発覚：患者34の血液データ）。
      let tableHasRefColumn = false;
      const REFERENCE_HEADER_REGEX = /^(?:基準値|正常値|基準範囲|参考値|正常範囲)(?:[:：]|\s|$)/;
      // 表の中の値のセルとして扱える行か（通常の検査値・「ー」等の測定なし記号・「<0.2mg/dl」の
      // ような不等号付きの基準値）。表の項目名の行の直後の値を読み進める際に使う。
      const isLabPlaceholderCell = (line) => /^[-−ー―‐]$/.test(line || '');
      // 「<0.2mg/dl」のような不等号付きのほか、「18.4pg/mL以下」「0.14mg/dL以下」のような「以下・以上・未満」も基準値（心不全事例のBNP・CRP）
      const isComparatorRefCell = (line) => /^[<>≦≧≤≥＜＞]\s*[\d.,]+\s*[^\s]{0,12}$/.test(line || '') || /^[\d.,]+\s*[^\s\d]{0,12}?(?:以下|以上|未満)$/.test(line || '');
      const isTableValueCell = (line) => !!line && (isLabPlaceholderCell(line) || isComparatorRefCell(line) || BARE_LAB_VALUE_REGEX.test(line));
      // NFKC正規化で「10³」が「103」になってしまうため、「×103/μL」のような指数表記を「×10^3/μL」に戻す。
      const restoreExponent = (s) => s.replace(/×\s*10([2-9])(?=\s*\/)/g, '×10^$1');
      // 行が「基準値のような範囲表記（数値〜数値＋単位）」に見えるかどうかの判定。
      // 表の項目名の行を検出する際・ヘッダーの列ラベル行を読み終える境目を判断する際の
      // 両方で使う共通のヘルパー。
      const looksLikeReferenceRangeLine = (line) => /^[\d,]+(?:\.\d+)?\s*[〜\-~]\s*[\d,]+/.test(line || '') || isComparatorRefCell(line);

      // 「【検温】帰室時、15分、30分、1時間…」のように、バイタル再検の間隔を「、」で列挙した
      // 行が splitEnumeratedPhrases で1つずつの断片に分割された場合、「15分」「30分」のような
      // 数値＋単位だけの断片は、それ単体では検温の間隔を示す以外の意味を持たず、日付だけの
      // 断片（isDateOnlyText）と同種の「単独では意味が読み取れない断片」である。見出し語
      // （「【検温】帰室時」等）を含む直前のカードに戻し、1枚のまとまったカードにする
      // （利用者からのアップロード文書で発覚：「15分」「30分」等が見出し語を失った意味の無い
      // 単独カードとして残っていた）。
      const BARE_DURATION_REGEX = /^\d+(?:分|時間|秒|日)$/;
      // 「バイタルサインは血圧140/85mmHgに落ち着く。」のように、文中の検査値・バイタル部分
      // （血圧140/85mmHg等）は既にこの行の検査値抽出（labRegex）で個別のカードとして
      // 切り出されている。しかし残った「バイタルサインは」＋「に落ち着く。」等の言い回しの
      // 部分には、値が抜き取られた後は実質的な観察内容が何も残っておらず、それ単独では
      // ヘンダーソンのどの項目にも一致しないため「患者背景（基本情報／医学情報）」の受け皿に
      // 誤って振り分けられてしまっていた（利用者からのアップロード文書で発覚：「バイタルサインは
      // に落ち着く。」というカードが、値を含む本来の「血圧140/85mmHg」カードとは無関係な、
      // 意味の読み取れない別カードとして残っていた）。
      // 「バイタルサインは血圧140/85mmHgに落ち着く。」のように、値部分（血圧140/85mmHg）が
      // 既に同じ行の検査値抽出で個別のカードとして切り出された後に残る「バイタルサインは」＋
      // 接続の言い回しの断片は、値のカードと合わせて1つの所見として読むべき残骸であり、
      // 独立した別カードにする意味が無い（利用者からのアップロード文書で発覚）。
      // 「バイタルサイン」で始まる断片で、かつ同じ行から既に何らかのカードが切り出されている
      // 場合（＝値が既に別カードに切り出された後の残骸であることが確定している場合）に限り、
      // BARE_DURATION_REGEX等と同様に直前のカード（切り出された検査値・バイタルカード）へ
      // つなぎ戻す（「バイタルサインを測定した。」のように他に検査値を伴わない単独の文は
      // 同じ行にカードが無いためこの経路を通らず、誤って消えることはない）。
      const BARE_VITAL_LABEL_REMNANT_REGEX = /^バイタルサイン/;
      // 助詞・接続表現から始まる断片、および日付だけの断片は新規カードにしない。
      // 同じ行で直前に抜き出したカードがあれば、そこへ文章をつなぎ戻して1枚に統合する。
      // つなぎ戻す先がない場合は、情報として使えないので中途半端なカードとして残さずに捨てる。
      function pushOrMerge(fragmentText, lineStartIndex, extraProps) {
        // 見出し語（FIELD_LABELS）だけの断片は、他の抽出経路（isBareFieldHeaderOnlyを直接
        // 呼んでいるfieldMatches等）と同様にここでも一律で除外する（利用者からのアップロード
        // 文書で発覚：「氏名・年齢・性別・】」のような複合見出し行が「・」で列挙分割され、
        // 「氏名」「年齢」「性別」がそれぞれ値の無い意味の無い単独カードとして残っていた。
        // この経路はfieldMatches判定を経由しないため、既存のisBareFieldHeaderOnlyガードが
        // 効いていなかった）。
        if (isBareFieldHeaderOnly(fragmentText)) return;
        const isVitalLabelRemnantToMerge = extracted.length > lineStartIndex && BARE_VITAL_LABEL_REMNANT_REGEX.test(fragmentText);
        if (UNNATURAL_START_REGEX.test(fragmentText) || isDateOnlyText(fragmentText) || BARE_DURATION_REGEX.test(fragmentText) || isVitalLabelRemnantToMerge) {
          if (extracted.length > lineStartIndex) {
            // 【レビューで発見】「15分」のような時間だけの断片を、同じ行で最後に切り出したカードに無条件でつないでいたため、
            // それが検査値・バイタルのカードだと「血圧 130/80mmHg2分」のように値が壊れていた（値の切り出しの後に残った断片は、
            // 元の文章でそのカードの隣にあったとは限らない）。時間だけの断片は、同じ行の検査値・バイタル以外のカードにつなぎ、
            // 無ければ消さずに1枚のカードにする。
            let prev = extracted[extracted.length - 1];
            if (BARE_DURATION_REGEX.test(fragmentText) && prev.isLabOrVital) {
              prev = null;
              for (let k = extracted.length - 1; k >= lineStartIndex; k--) if (!extracted[k].isLabOrVital) { prev = extracted[k]; break; }
              if (!prev) { pushExtracted({ text: fragmentText, timestamp: globalTimestamp, ...extraProps }); return; }
            }
            prev.text = cleanExtractedPhrase(prev.text + fragmentText);
            return;
          }
          // つなぎ戻す先がない場合、日付・時間だけの断片は破棄するが、文として中身のあるもの（8文字以上）は
          // 捨てずに1枚のカードにする（本文が消えないように。7事例のテストで発覚）
          if (isDateOnlyText(fragmentText) || BARE_DURATION_REGEX.test(fragmentText) || fragmentText.replace(/[、。\s]/g, '').length < 8) return;
        }
        pushExtracted({ text: fragmentText, timestamp: globalTimestamp, ...extraProps });
      }

      // 「●左横隔膜下ドレーン」（コロン・値を伴わないまま行末で途切れている）の直後の行が
      // 「10ml、●挿入部異常なし。…」のように数値から始まっている場合がある。これは元の記録で
      // 単に排液量の数値部分が改行によって次の行に折り返されただけで、実際には
      // 「●左横隔膜下ドレーン：10ml」という1つの所見である。しかし行単位で処理する以降の
      // 抽出処理では、この改行の位置でそのまま別々の断片として切り離されてしまい、
      // 「●左横隔膜下ドレーン」（値の無い意味の無いラベルだけの断片）と「10ml、●挿入部
      // 異常なし…」（ラベルの無い数値だけで始まる断片）という、単体では意味を持たない
      // 2枚のカードに分断されていた（利用者からの報告事例）。
      // 「●」で始まる列挙項目がコロン・値を伴わずに改行で終わっており、直後の行が数値＋単位＋
      // 区切り（、,）で始まっている場合に限り、改行を全角コロンに置き換えて1行に結合し、
      // 後続の既存の列挙分割ロジック（●・「、」区切り）にそのまま委ねる（次の行の残り部分
      // 「●挿入部異常なし。…」はこの結合の対象にならず、そのまま後続の内容として残る）。
      // ●で始まらない通常の見出し語＋値の続き（「●吻合部背面ドレーン」の直後が別の見出し語
      // 「左横隔膜下ドレーン、…」から始まる場合等）は対象にしない（数値開始という条件が
      // 無ければ誤って結合してしまうリスクがあるため）。
      const WRAPPED_ENUM_VALUE_CONTINUATION_REGEX =
        /(●[^\n：:。、,]{1,20})\r?\n[ \t]*([0-9０-９]+(?:\.[0-9]+)?[^\s、,。\n]{0,10}[、,])/g;
      text = text.replace(WRAPPED_ENUM_VALUE_CONTINUATION_REGEX, '$1：$2');

      // 表やスプレッドシートのコピー貼り付けで、項目名と数値が別々の行に分かれてしまうことがある
      // （例:1行目「WBC」、2行目「11200」）ため、forEachではなく添字ループにして、項目名だけの行
      // を見つけたときに次の行（数値だけの行）を先読み・消費できるようにする。
      // 患者の発言（「…」）が改行をまたいで2行以上に書かれている場合（例：「体がべたべたして気持ちが悪い。
      // 髪も気持ち悪くなってきた。⏎早く動けるようになってお風呂には入れるといいんだけど・・・」）、行ごとに
      // 別々のカードにすると、どちらも括弧の閉じていない発言の断片になり、タグも付かなかった（利用者からの
      // アップロード文書で発覚：患者38）。開き括弧「の数が閉じ括弧」より多い行は、括弧が閉じるまで
      // （最大3行先まで）次の行とつなげて1行として扱う。
      // 「担当看護師より」「本人より」のように、話し手だけを書いた行の次の行から発言（「…」）が
      // 続く書き方がある（患者36）。行ごとに処理すると話し手の行が直前のカードの末尾にくっつき、
      // 発言のカードには誰の発言かが残らなかった（看護師の説明が患者の発言(S)と誤判定されていた）。
      // 話し手だけの行は、続く「…」で始まる行（最大5行）とつなげて1行として扱う。
      const SPEAKER_LEAD_ONLY_REGEX = /^(?:本人|患者|患者様|担当看護師|受け?持ち?看護師|看護師|Ns|主治医|担当医|執刀医|医師|Dr\.?|PT|OT|理学療法士|作業療法士|薬剤師|栄養士|家族|長男|長女|次男|次女|妻|夫|息子|娘|嫁)(?:さん|氏)?(?:より|から|が|は)?[:：]?$/;
      const lines = (() => {
        // 【レビューで発見】ヘンダーソンの項目の見出しの下の行には、行頭に項目の印（\u0003番号\u0003）が付いている。
        // 以前はこの印を付けたまま下の「話し手の行＋発言の行」「2行にまたがる発言」をつないでいたため、印が文の途中に
        // 残って「「最近食欲がなくて、\u00032\u0003ご飯が…」」のようにカードの本文に制御文字が入り、「本人より」の次の
        // 行の発言（行頭に印がある）ともつながらなかった。つなぐ前に印を外し、つないだ行には最初の行の印を付け直す。
        const rawWithHints = preprocessFreeFormLines(expandTabSeparatedLabTables(text.split(/\r?\n/)));
        const hints = rawWithHints.map(l => (String(l).trim().match(NEED_HINT_REGEX) || [''])[0]);
        const raw = rawWithHints.map((l, k) => (hints[k] ? String(l).trim().slice(hints[k].length) : l));
        const joined = [];
        let hintOfLine = '';
        const pushJoined = s => joined.push(hintOfLine && String(s).trim() ? hintOfLine + String(s).trim() : s);
        for (let i = 0; i < raw.length; i++) {
          hintOfLine = hints[i];
          let line = raw[i];
          if (SPEAKER_LEAD_ONLY_REGEX.test(line.trim()) && i + 1 < raw.length && /^「/.test(raw[i + 1].trim())) {
            line = line.trim().replace(/[:：]$/, '');
            let n = 0;
            while (n < 5 && i + 1 < raw.length && /^「/.test(raw[i + 1].trim())) {
              line += raw[i + 1].trim();
              i++;
              n++;
            }
            pushJoined(line);
            continue;
          }
          // 「…と話す。＜実習3日目（入院3日目、手術当日・術直後）＞＜カルテより手術の情報）」のように、日の区切りの
          // 見出しが前の行の末尾にくっついている場合（PDFやOCRからの貼り付けで改行が消えたもの）は、見出しを別の行に
          // 分ける（見出しで日を切り替えられるように。胃がん_A氏の記録）。
          const inlineDayHeading = line.match(/^(.*?[^\s<＜])\s*([<＜]?実習\s*\d+\s*日[目日][^<＜>＞]{0,40}[>＞)）]?)(.*)$/);
          if (inlineDayHeading && inlineDayHeading[1].trim().length >= 4) {
            pushJoined(inlineDayHeading[1]);
            pushJoined(inlineDayHeading[2].replace(/^(?![<＜])/, '<').replace(/[)）]$/, '>').replace(/(?<![>＞])$/, '>'));
            if (inlineDayHeading[3].trim()) pushJoined(inlineDayHeading[3].trim());
            continue;
          }
          // 「「体重をかけるのは痛みが増す」と話す。自尿あり。」のように、発言の後に同じ行で短い観察（看護師側の
          // 記録）が続く場合は、発言(S)と観察(O)を別の行として扱う（患者36：自尿ありは3.排泄の別カードにする）。
          const quoteThenObs = line.trim().match(/^(「[^「」]*」(?:「[^「」]*」)*と(?:話す|話される|話した|訴える|訴えあり|訴えた|発言あり|返答あり|言う|言われる)。)\s*([^「」。]{2,20}。?)$/);
          if (quoteThenObs && !/^(?:[がけどでもしかし]|ため|ので|から)/.test(quoteThenObs[2])) {
            pushJoined(quoteThenObs[1]);
            pushJoined(quoteThenObs[2]);
            continue;
          }
          const openCount = str => (str.match(/「/g) || []).length - (str.match(/」/g) || []).length;
          let extra = 0;
          while (openCount(line) > 0 && extra < 3 && i + 1 < raw.length && raw[i + 1].trim() !== '' && /」/.test(raw.slice(i + 1, i + 1 + (3 - extra)).join(''))) {
            line = line.replace(/\s+$/, '') + raw[i + 1].trim();
            i++;
            extra++;
          }
          pushJoined(line);
        }
        return joined;
      })();
      let markerOnlyRunCount = 0;
      let timestampBeforeMarkerRun = null;
      // 先の行を見るとき（表の値の行・見出しの次の行など）は、行頭のヘンダーソンの項目の印を外して見る
      const peekText = k => { const t = String(lines[k] || '').trim(); const hm = t.match(NEED_HINT_REGEX); return hm ? t.slice(hm[0].length).trim() : t; };
      // 表の日付の列を読む前の日時（DAY_SAVE_MARK／DAY_RESTORE_MARK。expandTabSeparatedLabTables の説明を参照）
      let savedDayState = null;
      for (let li = 0; li < lines.length; li++) {
        currentSourceLine = li;
        let cleanLine = lines[li].trim();
        if (!cleanLine) continue;
        const needHintMatch = cleanLine.match(NEED_HINT_REGEX);
        currentNeedHint = needHintMatch ? Number(needHintMatch[1]) : null;
        if (needHintMatch) cleanLine = cleanLine.slice(needHintMatch[0].length);
        if (cleanLine === DAY_SAVE_MARK) { savedDayState = { ts: globalTimestamp, day: dayLabel, clock: lastClockMin }; continue; }
        if (cleanLine === DAY_RESTORE_MARK) {
          if (savedDayState) { globalTimestamp = savedDayState.ts; dayLabel = savedDayState.day; lastClockMin = savedDayState.clock; }
          savedDayState = null;
          continue;
        }
        if (cleanLine.startsWith(SOAP_ASSESSMENT_MARK)) {
          pushExtracted({ text: cleanLine.slice(SOAP_ASSESSMENT_MARK.length).trim(), timestamp: globalTimestamp, isUnnecessaryBoilerplate: true });
          // 【レビューで発見】間に文章（A・P・考察など）がある日付の行どうしは、表の列見出しの並び（下の markerOnlyRunCount）ではない。
          // 数え直さないと「10月3日」「A：…」「10月4日」の2つ目の日付が取り消され、その下の記録が「日時不明」になっていた。
          markerOnlyRunCount = 0; timestampBeforeMarkerRun = null;
          continue;
        }
        if (cleanLine.startsWith(SOURCE_TITLE_MARK)) {
          pushExtracted({ text: cleanExtractedPhrase(cleanLine.slice(SOURCE_TITLE_MARK.length)), timestamp: globalTimestamp, isUnnecessaryBoilerplate: true });
          continue;
        }
        // 「入院当日の夜は咳が続き…」のように、日の語の直後に「の」が続く文は、日を切り替えるが文は削らない
        // （以前は「入院当日」を剥がした残りの「の夜は…」が助詞で始まる断片として捨てられ、文が丸ごと消えていた）
        // 【レビューで発見】「の」だけでなく「術後1日目にドレーン抜去。」「術後3日目は疼痛強く…」のように「に・は・で・も」が
        // 続く文も同じ。以前は日の語だけを剥がし、残りの「にドレーン抜去。」が助詞で始まる短い断片として捨てられ、文が丸ごと消えていた。
        // （「術後1日目の夜は…」も、以前は「術後1日目」が下で剥がされて「の夜は…」という文が残っていた）
        const dayOfSentence = cleanLine.match(/^(入院当日|入院前日|手術当日|手術前日|手術翌日|術後\s*\d+\s*日目|入院\s*\d+\s*日目|産褥\s*\d+\s*日目)(?:の|には|では|に|は|で|も)/);
        if (dayOfSentence) { globalTimestamp = applyTimeMarker(dayOfSentence[1].replace(/\s+/g, '')); updateAdmissionPhase(globalTimestamp); }
        // 【術中・術後詳細および指示】のように、時系列マーカー（術中・術後）とセクション見出し語
        // （詳細および指示）が同じ括弧内にまとめて書かれている行かどうかを、マーカーを剥がす前の
        // 元の行が「【」「[」で始まっているかどうかで記憶しておく（下のマーカー除去後に使う）。
        const startedWithBracket = /^[\[【]/.test(cleanLine);
        // Word・PowerPoint等からの箇条書き（「●【術前】」「○ 尿蛋白(-)」のような行頭の
        // ●○◎■◆等の記号）をコピー貼り付けした場合、これらの記号が行頭に残ったままだと、
        // 直後に続くマーカー（【術前】等）や本文が正しく認識できなくなる（マーカーの正規表現は
        // 行の絶対先頭からしかマッチしないため）ほか、本文カードにも記号がそのまま残ってしまう。
        // 実際の所見の一部として使われることのない記号のため、行頭にあれば安全に取り除く。
        // ■□◆◇は、●○・（個々の所見の箇条書き）と違い、記録用紙の中の区切り見出し
        // （「■ 嗜好品」「■ 活動・睡眠・清潔・更衣」等）に使われる記号のため、記号を取り除く前に
        // 見出し行かどうかの手がかりとして記憶しておく（下のHEADING_BULLET判定を参照）。
        const startedWithHeadingBullet = /^[■□◆◇▪]/.test(cleanLine);
        // 「1. 生活習慣・身体的機能（左ページ）」「4. 手術当日」のような、番号付きの章見出し。
        // 値（コロン）・句読点・所見を表す語を含まない短い行に限る（「1. 疼痛あり」のような
        // 番号付きの所見の列挙は見出しとみなさない）。
        // 【レビューで発見】以前は番号の後の空白が「数字でない最初の文字」として数えられ、「4. 38度台の発熱持続」
        // 「1. 食事は全粥5割摂取」「2. 夜間頻尿で3回覚醒」「3) 右下肢に浮腫を認める」のような番号付きの所見の列挙まで
        // 見出しとして「不要」になっていた。見出しの語は空白の後から見て、数値を含むもの（「術後1日目」等の日の語は除く）、
        // 所見を表す語（認める・摂取・覚醒・出現…）を含むものは見出しにしない。
        const numberedChapterHeadingMatch = cleanLine.match(/^\d{1,2}[.．)）]\s*([^\d\s:：。、,][^:：。、,]{0,29})$/);
        const isNumberedChapterHeading = !!numberedChapterHeadingMatch &&
          !/(なし|無し|あり|有り|良好|不良|痛|実施|施行|使用|↑|↓|認め|みられ|見られ|摂取|覚醒|出現|持続|訴え|増強|軽減|低下|上昇|改善|悪化|している|していた|した$|する$)/.test(numberedChapterHeadingMatch[1]) &&
          !/\d/.test(numberedChapterHeadingMatch[1].replace(/(?:術後|術前|入院|産褥)?\s*\d+\s*日目/g, ''));
        cleanLine = cleanLine.replace(/^(?:[・○●◯◎□■▪▫◆◇][\s　]*)+/, '');
        if (!cleanLine) continue;
        // 番号付きの章見出しは所見を含まないため「不要な情報」とする（利用者からのアップロード
        // 文書で発覚：「1. 生活習慣・身体的機能（左ページ）」が「・」で分割され、「1. 生活習慣」
        // 「身体的機能(左ページ)」という意味の無いOデータのカードになっていた）。
        // 「4. 手術当日」のように時期を表す見出しは、以降の所見の日時としても引き継ぐ。
        if (isNumberedChapterHeading) {
          pushExtracted({ text: cleanExtractedPhrase(cleanLine), timestamp: globalTimestamp, isUnnecessaryBoilerplate: true });
          const chapterPhase = numberedChapterHeadingMatch[1].match(/^(手術当日|手術前日|入院当日|入院\d+日目|術後\d+日目|術前|術後)/);
          if (chapterPhase) {
            globalTimestamp = applyTimeMarker(chapterPhase[1]);
            updateAdmissionPhase(globalTimestamp);
          }
          continue;
        }
        // 「γGTP」のギリシャ文字「γ」が、OCRで見た目の近いラテン文字「y」に誤認識され
        // 「y GTP」（間にスペースが入ることもある）になっている場合がある。項目名の一致判定
        // （BARE_LAB_KEY_REGEX等）はいずれも正式表記「γGTP」を前提にしているため、ここで
        // 正式表記に正規化しておく（利用者からのアップロード文書で発覚：「y GTP」の行が
        // 項目名として認識されず、直後の値「15U/L」が項目名の無いカードとして残っていた）。
        cleanLine = cleanLine.replace(/\by\s*GTP\b/i, 'γGTP');
        // 「＜バイタルサイン＞」「＜カルテ情報＞」のように、山括弧（全角＜＞・半角<>）で
        // 囲まれた区切り見出しだけの行がある。OCRで閉じ括弧が丸括弧「）」等に誤認識される
        // こともある（利用者からのアップロード文書で発覚：「＜バイタルサイン）」
        // 「＜カルテ情報）」等）。「【身長・体重】」等の全角鉤括弧の見出し行と同様、これ自体は
        // 所見を含まない区切りのため「不要な情報」として除外する。
        // 【原因と修正】以前は数字を含む行を対象外としていた（日付・時刻等の実質的な情報を
        // 巻き込む恐れがあるため）。しかし「＜実習2日目（入院2日目、手術前日）＞」のように、
        // この記録形式で頻出する山括弧見出しには「◯日目」という日数の数字が普通に含まれており、
        // この対象外条件のせいでこれらの見出し行が「不要な情報」と判定されず、通常の文章として
        // S/O未分類・タグ未設定のまま残ってしまっていた（利用者からのアップロード文書で発覚）。
        // 山括弧（＜＞・<>）で囲まれていること自体が強い見出しの手がかりであり、生年月日等の
        // 素の日付はこの記法では書かれない（TIME_MARKER_REGEX・DATE_ONLY_REGEX側で別途対応済み）
        // ため、数字の除外は不要と判断し、山括弧の中身であれば数字を含んでいても対象とする。
        // ただし「<0.2mg/dl」のように「<」の直後が数字の行は、見出しではなく不等号付きの検査値
        // （CRPの基準値等）のため対象外とする（利用者からのアップロード文書で発覚：基準値の
        // 「<0.2mg/dl」が山括弧見出しと誤認され、検査値が「不必要な情報」に入っていた）。
        if (/^[＜<][^＜<＞>]{1,40}[＞>）)]?$/.test(cleanLine) && !/^[＜<]\s*[\d.]/.test(cleanLine)) {
          pushExtracted({ text: cleanExtractedPhrase(cleanLine), timestamp: globalTimestamp, isUnnecessaryBoilerplate: true });
          setDayFromHeading(cleanLine);
          // 「＜実習1日目…＞」のような山括弧見出しは、以降の行が読み進める時期（入院前／入院後）
          // を示す強い手がかりのため、この行自体を読み終えた時点で状態を更新する
          // （updateAdmissionPhaseの説明を参照。以降の行から反映されればよいため、この行
          // 自身のpushExtractedより後で呼んでよい）。
          updateAdmissionPhase(cleanLine);
          continue;
        }
        // 「入院時の状況」「入院から手術までの経過」のような時期を表す区切り見出しは、以降の記録の日時にする
        // （「入院時」の語の後に「の」が続くため、上の日時の読み取りでは剥がさなくなったため）。
        const periodHeading = cleanLine.match(/^(入院時|入院前|術前|術中|術後|手術当日|手術前日)の(?:状況|様子|経過|状態|記録|情報)$/) ||
          (/^入院から手術(?:まで|前)の経過$/.test(cleanLine) ? [cleanLine, '術前'] : null);
        if (periodHeading) {
          globalTimestamp = applyTimeMarker(periodHeading[1]);
          updateAdmissionPhase(globalTimestamp);
          pushExtracted({ text: cleanExtractedPhrase(cleanLine), timestamp: globalTimestamp, isUnnecessaryBoilerplate: true });
          continue;
        }
        // 「看護記録（1日目〜翌日午後まで）」のような記録の区切りの見出しの後は、直前の時刻を引き継がない
        // （手術当日12:00の帰室の記録の後の指示・21時の記録が「12:00」にならないように、日だけにする）
        if (/^看護記録(?:[(（][^)）]{0,30}[)）])?$/.test(cleanLine) && dayLabel) {
          globalTimestamp = dayLabel;
          lastClockMin = null;
        }
        // 見出しラベルだけの行（値は次の行に別に書かれている）を検出し、次の非空白行に
        // ラベルを引き継ぐ（detectFieldLabelHeadingOnlyLineの説明を参照）。
        // 「嗜好品: タバコ なし 飲酒 なし」のように喫煙（1.呼吸）と飲酒（2.食事）が1行に並んでいる場合は、
        // どちらのタグがどちらの内容か分かるよう「嗜好品: タバコ なし」「嗜好品: 飲酒 なし」の2枚に分ける（患者36）。
        const tasteMatch = cleanLine.match(/^(嗜好品?|嗜好)\s*[:：]\s*(.+)$/);
        if (tasteMatch) {
          const body = tasteMatch[2];
          const parts = body.split(/[、,\s]+(?=(?:飲酒|アルコール|お酒|酒|タバコ|たばこ|煙草|喫煙)(?![ぁ-ん]{0,1}[、,]))/).map(p => p.trim()).filter(Boolean);
          const hasSmoke = parts.some(p => /^(?:タバコ|たばこ|煙草|喫煙)/.test(p));
          const hasDrink = parts.some(p => /^(?:飲酒|アルコール|お酒|酒)/.test(p));
          if (parts.length >= 2 && hasSmoke && hasDrink && parts.every(p => p.length <= 30 && !p.includes('。'))) {
            parts.forEach(p => pushExtracted({ text: cleanExtractedPhrase(`${tasteMatch[1]}: ${p}`), timestamp: globalTimestamp }));
            continue;
          }
        }
        const headingOnlyLabels = detectFieldLabelHeadingOnlyLine(cleanLine);
        if (headingOnlyLabels) {
          pendingFieldLabelKeys = headingOnlyLabels;
          continue;
        }
        if (pendingFieldLabelKeys) {
          const labels = pendingFieldLabelKeys;
          pendingFieldLabelKeys = null;
          // 複合見出し（例：氏名・年齢・性別）の場合、その中でFIELD_LABEL_DEFAULT_TAGSに
          // 初期提案タグを持つラベル（例：年齢→姿勢・環境）を優先して選ぶ。単一見出しの場合は
          // そのまま使う（診断名・既往歴は病名から推測するfieldLabelHintTags側の判定に委ねる）。
          const chosenLabel = labels.find(k => FIELD_LABEL_DEFAULT_TAGS[k]) || labels[0];
          const labeledContent = isBareStatusWord(cleanLine) ? `${chosenLabel}: ${cleanLine}` : cleanLine;
          pushExtracted({ text: cleanExtractedPhrase(labeledContent), timestamp: globalTimestamp, fieldLabel: chosenLabel });
          continue;
        }
        // 行頭の時刻・日付・「入院時」等のマーカーは複数連続することがある
        // （例:「11:46 7月3日(金)」のようなスクリーンショットの日時表示をOCRで取り込んだ場合）ので、
        // マッチしなくなるまで繰り返し剥がす。剥がした最後のものを、その行の日時として採用する。
        // 術前・術中・術後（周術期の記録によく使われる区切り。術前＝入院前〜手術前を指す）も、
        // 「入院時」と同様に前後の所見の時系列を示すマーカーとして扱う。
        // 「【術前】」「【術中・術後】」のように、括弧内に区切りが1つまたは「・」「、」でつながった
        // 複数個入り、かつ本文を伴わずその区切り単独で1行になっている場合（見出し行として
        // 独立し、以降の箇条書き項目がまとめてその区切りに属することを示す書式）にも対応する。
        // 半角の[ ]だけでなく、Wordのコピー貼り付けでよく使われる全角の【】にも対応する。
        const PHASE_MARKER_WORD = '(?:入院時|入院前|術前|術中|術後)';
        // 「【入院当日】」「【入院2日目】」のように、日付・時刻ではなく入院からの経過日数で
        // 区切りを表す見出し・時系列マーカーも、上の「術前」「術後」等と同様に扱う必要がある
        // （利用者からのアップロード文書で発覚：この形式の見出し行が時系列マーカーとして
        // 認識されず、見出し語だけの意味の無いカードとして残り、しかもヘンダーソンの
        // どの項目にも一致しないため「患者背景」に誤って振り分けられていた）。
        // 下の「\d+日目」だけでは「入院」の分だけ手前にずれてしまい一致できない
        // （「\d+日目」は行頭が直接数字であることを前提とするため）ため、「入院」を
        // 含めた形を別の候補として追加する。
        const ADMISSION_DAY_MARKER_WORD = '(?:入院当日|入院\\d+日目)(?!の)';
        const TIME_MARKER_REGEX = new RegExp(
          '^[\\[【]?(' +
            '\\d{1,2}[:時]\\d{2}(?:分)?' +
            // 「21時」のように分を伴わない時刻（直後が空白か行末の場合のみ。「3時間」等と区別するため）
            '|\\d{1,2}時(?=\\s|$)' +
            // 「14時ごろ、デイルームで…」のような、行頭の「〜時ごろ／頃／過ぎ」（実習記録のテスト）
            '|\\d{1,2}時(?:ごろ|頃|過ぎ)(?=[、,\\s]|$)' +
            '|(?:\\d{1,4}年)?\\d{1,2}月\\d{1,2}日(?:\\s*[\\(（][月火水木金土日][\\)）])?' +
            // 【レビューで発見】電子カルテでよく使う「2026/10/05 10:00」「10/6(火) 10:00」「10/7 14:00」の日付を日時として読んでいなかった
            // （前の日時のまま「10月4日 9:00」になり、本文に「10/6(火) 10:00」が残っていた）。年月日の「/」「-」区切りと、
            // 曜日付き、または後ろに時刻が続く「月/日」を日付として読む（「1/2量摂取」のような分数は時刻が続かないので読まない）。
            '|\\d{4}[\\/\\-]\\d{1,2}[\\/\\-]\\d{1,2}(?:\\s*[\\(（][月火水木金土日][\\)）])?(?=\\s|$|\\d{1,2}[:時]\\d{2})' +
            '|\\d{1,2}\\/\\d{1,2}(?:\\s*[\\(（][月火水木金土日][\\)）](?=\\s|$|\\d{1,2}[:時]\\d{2})|(?=\\s+\\d{1,2}[:時]\\d{2}))' +
            // 「術後1日目」は「術後」と「1日目」に分けずに1つの日として読む（以前は「1日目」だけが残っていた）
            '|(?:術後|術前|産褥)\\s*\\d+\\s*日目' +
            // 「手術当日」「翌日」だけの行も日の区切り（患者36）。「手術当日の様子」のように語が続くものは除く
            '|(?:手術当日|手術前日|手術翌日|入院前日)(?![ぁ-んァ-ヶ一-龠々])' +
            // 「翌朝6:00」「翌日10:00」のように時刻が直接続く書き方も日の区切り（【レビューで発見】以前は読めず前の日時のままだった）
            '|(?:翌日|翌朝)(?=\\s|$|\\d{1,2}[:時])' +
            // 「術後排便なし」「術前MMT:」「入院時の様子:」のように語が直接続くものは、その行だけの言い回しで
            // 以降の記録の日時ではないため、日時として剥がさない（以前は「入院時の様子」で以降の既往歴・生活習慣
            // まで「入院時」になり、「術後排便なし」で術後1日目10:00の記録が「術後」になっていた）
            // ただし「【術中・術後詳細および指示】」「【術前処置】」のように括弧の見出しの中は、これまで通り剥がす
            '|(?<=^[\\[【])' + PHASE_MARKER_WORD + '(?:\\s*[・、,\\/]\\s*' + PHASE_MARKER_WORD + ')*' +
            '|' + PHASE_MARKER_WORD + '(?:\\s*[・、,\\/]\\s*' + PHASE_MARKER_WORD + ')*(?![ぁ-んァ-ヶ一-龠々A-Za-z])' +
            '|' + ADMISSION_DAY_MARKER_WORD +
            // 「術後4〜5日目」のような日数の範囲（リハビリの予定表の列見出し等）も日数のマーカーとして扱う
            '|\\d+\\s*[〜~\\-]\\s*\\d+日目' +
            '|\\d+日目' +
            '|検査データ' +
          ')[\\]】]?\\s*'
        );
        let marker;
        let markerStripped = false;
        let strippedClockOnly = true; // 剥がしたのが時刻（「6:00」）だけか
        // 「術後1日目より受け持つ。」「入院時から〜」のように、行頭の時期の語の直後が「より」
        // 「から」「まで」で続く場合、その語は行の日時ではなく文の一部（起点・終点）である。
        // 剥がすと「より受け持つ。」のような意味の通らない文が残る（利用者からのアップロード
        // 文書で発覚）ため、この場合はマーカーとして扱わず、行全体をそのまま文章として残す。
        const timestampBeforeMarkers = { ts: globalTimestamp, day: dayLabel, clock: lastClockMin };
        const timePhraseIsPartOfSentence = /^[\[【]?(?:(?:入院時|入院前|入院当日|入院\d+日目|手術当日|術前|術中|術後|\d+日目)\s*)+[\]】]?\s*(?:より|から|まで)/.test(cleanLine)
          // 「10:30頃にお菓子を食べていたことを…」のように、行頭の時刻に「頃に・に・から・まで」が続く文も、時刻は文の一部
          // （実習生の記録のテストで発覚：時刻だけ剥がされ「頃にお菓子を…」という文が残っていた）
          || /^\d{1,2}[:時]\d{2}分?\s*(?:ごろ|頃|過ぎ)?\s*(?:に|から|まで|の)/.test(cleanLine)
          // 【レビューで発見】「6月10日に手術予定。」「2020年3月1日に胃がんで胃切除術を受けた。」「3日目に発熱」のように、日付の直後に
          // 助詞が続く文も、日付は文の一部（以前は日付だけ剥がして「に手術予定。」が捨てられ文が消えるか、「に胃がんで…」という
          // 壊れた文が残り、しかも過去の日付（2020年3月1日）が以降のすべての記録の日時になっていた）。文のまま残し、日時も変えない。
          || /^[\[【]?(?:(?:\d{1,4}年)?\d{1,2}月\d{1,2}日|\d+日目)(?:\s*[(（][月火水木金土日祝][)）])?[\]】]?\s*(?:に|で|の|は|が|を|も|頃|ごろ|まで|から|より)/.test(cleanLine)
          // 上の「術後1日目にドレーン抜去」のように、日を切り替えたうえで文のまま残すもの
          || !!dayOfSentence;
        while (!timePhraseIsPartOfSentence && (marker = cleanLine.match(TIME_MARKER_REGEX))) {
          let rawMarker = marker[1].replace(/[\[\]【】]/g, '').replace(/\s+/g, '');
          // 「2026/10/05」「10/6(火)」は「10月6日」の形にそろえる（日の順番・次の日の計算が使えるように）
          const slashMarker = rawMarker.match(/^(?:\d{4}[\/\-])?(\d{1,2})[\/\-](\d{1,2})(?:[(（][月火水木金土日][)）])?$/);
          if (slashMarker && Number(slashMarker[1]) >= 1 && Number(slashMarker[1]) <= 12 && Number(slashMarker[2]) >= 1 && Number(slashMarker[2]) <= 31) rawMarker = `${Number(slashMarker[1])}月${Number(slashMarker[2])}日`;
          if (!/^\d{1,2}(?::\d{2}|時(?:\d{2}分?)?)$/.test(rawMarker)) strippedClockOnly = false;
          globalTimestamp = applyTimeMarker(rawMarker);
          updateAdmissionPhase(globalTimestamp);
          cleanLine = cleanLine.slice(marker[0].length).trim();
          markerStripped = true;
        }
        // 「【術中・術後詳細および指示】」のように、時系列マーカーの直後に見出し語が続けて
        // 同じ括弧の中に書かれている場合、上のマーカー除去では「術中・術後」だけが剥がされ、
        // 「詳細および指示】」という中身の無い断片（閉じ括弧だけが残った見出し語）がそのまま
        // 文章として抽出されてしまっていた。元の行が「【」「[」で始まっていた場合に限り、
        // マーカーを剥がした残りの先頭にコロン・数字を含まない短い見出し語＋閉じ括弧が
        // 続いていれば、その部分は所見ではなく見出しの続きとみなして一緒に取り除く
        // （コロンや数字を含む場合は実際の所見の可能性があるため取り除かない）。
        //
        // 【修正】以前は「元の行が【で始まっている」という条件だけでこの除去を行っていたため、
        // 上のマーカー除去で何も剥がされなかった場合（＝見出し語がタイムマーカーではない、
        // 「【点滴】なし【内服】〜」のような通常の見出し付きの行）にまで誤って適用され、
        // 行頭の「【点滴】」がそのまま失われて「なし【内服】〜」という、何についての「なし」か
        // 分からない本文が残ってしまっていた（利用者からのアップロード文書で発覚。過去の
        // 「感染症：無」が「無」だけになる不具合＝isBareStatusWordと同種の、見出しの文脈が
        // 失われる問題）。この除去は、①実際にマーカーが剥がされていた場合（本来の想定通り、
        // 残った断片が見出しの続きであることが確定している場合）、②剥がす対象が行全体
        // （＝見出しだけで他に本文が無い行）である場合、のいずれかに限定し、本文を伴う
        // 見出し付きの行からラベルを奪わないようにする。
        if (startedWithBracket) {
          const strayBracketTail = cleanLine.match(/^([^\]】:：\d]{0,20})[\]】]\s*/);
          if (strayBracketTail && (markerStripped || strayBracketTail[0].length === cleanLine.length)) {
            cleanLine = cleanLine.slice(strayBracketTail[0].length).trim();
          }
        }
        // 時刻・日数だけの行（「術後1日目」「術後2日目」…）が2行以上続くのは、予定表などの表の列見出しを
        // 1列ずつ縦に貼り付けたもので、それぞれが後の記録の日時を表しているわけではない（利用者からの
        // アップロード文書で発覚：リハビリの予定表の「術後1日目〜術後4〜5日目」の列見出しで日時が上書きされ、
        // 「4〜5日目」がタグ未設定のカードとして残っていた）。この場合は、見出しが始まる前の日時に戻す。
        if (!cleanLine) {
          if (markerStripped) {
            // 【修正】「入院2日目」の行の次に「6:00」だけの行が来るのは、日の見出しと時刻（表の列見出しではない）。
            // 以前は「日時だけの行が2行続いた」として両方を取り消し、翌朝6:00の記録が前日21:00になっていた
            // （長文の事例でのテストで発覚）。時刻だけの行は、列見出しの並びとして数えない。
            if (strippedClockOnly) { markerOnlyRunCount = 0; timestampBeforeMarkerRun = null; continue; }
            if (markerOnlyRunCount === 0) timestampBeforeMarkerRun = timestampBeforeMarkers;
            markerOnlyRunCount++;
          }
          continue;
        }
        if (markerOnlyRunCount >= 2 && timestampBeforeMarkerRun !== null) {
          globalTimestamp = timestampBeforeMarkerRun.ts;
          dayLabel = timestampBeforeMarkerRun.day;
          lastClockMin = timestampBeforeMarkerRun.clock;
        }
        markerOnlyRunCount = 0;
        // 「術後肢位」（「術後」は日時として外れ「肢位」が残る）「安静度」「病室環境」のように、コロンの無い
        // 見出し語だけの行の下に、その見出しについての指示・所見の行が続く書き方がある。以前は「肢位」だけが
        // 次の1行とまとまり、残りの「軽度外転位で、内旋位は禁止」「側臥位時は外転枕使用すること」等が
        // 1行ずつ別のカードになっていた（利用者からの修正依頼：患者37「細かくなりすぎている」）。
        // 登録した見出し語（BARE_BLOCK_HEADING_REGEX）の行は「肢位:」のようなコロン付きの見出しと同じに扱い、
        // 下の短い行をまとめて1枚にする（「疼痛:」と同じ仕組み。isMergeableBlockLine参照）。
        // 「回診」「検温」のような出来事の語は、下に別々の観察が続くため対象にしない。
        if (BARE_BLOCK_HEADING_REGEX.test(cleanLine)) {
          pushExtracted({ text: `${cleanLine}:`, timestamp: globalTimestamp, isUnnecessaryBoilerplate: true });
          continue;
        }
        // 「■ 嗜好品」「■ 活動・睡眠・清潔・更衣」「■ 疾患に対する認識」のような■付きの区切り
        // 見出しは、それ自体に所見を含まない（実際の値は次の行以降の「タバコ: なし」等に書かれて
        // いる）ため「不要な情報」とする（利用者からのアップロード文書で発覚：これらが「嗜好品」
        // 「活動」「睡眠」…のような見出し語だけのOデータのカードになっていた）。コロン・句点を
        // 含む行（「■ 食事: 常食」等）は所見を含むため対象外。「■ 入院時の状況」のように時期を
        // 表す見出しは、上のマーカー除去で既に以降の日時として反映済み。
        if (startedWithHeadingBullet && cleanLine.length <= 30 && !/[:：。]/.test(cleanLine)) {
          const headingText = peekText(li).replace(/^(?:[□■▪◆◇][\s　]*)+/, '');
          pushExtracted({ text: cleanExtractedPhrase(headingText), timestamp: globalTimestamp, isUnnecessaryBoilerplate: true });
          continue;
        }

        // 「①手術前日指示」「③手術当日術後指示」のように、丸数字（①②③等。この関数の呼び出し元で
        // NFKC正規化されるため、ここに来る時点では半角数字1・2・3等に変換されている）に続けて、
        // 周術期の指示・処置をまとめた見出し語だけが1行になっているケースがある。この見出し行
        // 自体には実際の指示内容が含まれておらず、直後に【点滴】【食事】等の箇条書きが続く
        // （利用者からのアップロード文書で発覚：「1手術前日指示」「3手術当日術後指示」が、
        // 実際の指示内容を含まない意味の無いカードになっていた）。見出し語自体はカード化せず、
        // 「術前」「術後」と同様に時系列マーカーとして扱い、直後の箇条書きカードに引き継ぐ。
        // 誤って通常の文章まで巻き込まないよう、次の条件をすべて満たす場合だけを対象とする：
        // ①行全体が「数字1文字＋コロン・【】・数字を含まない2〜18文字」だけで構成されている
        // （実際の指示内容や検査値の断片でないことを、コロン・括弧・数字の不在で確認する）
        // ②直後の空行を除いた次の行が「【」「[」で始まっている（＝これから箇条書きの見出し付き
        // 内容が続くことを示す、この記録形式に特有の強い手がかり）。
        // 【レビューで発見】以前は「数字1文字＋2〜18文字」の行なら何でも見出しとみなしたため、「3回嘔吐あり。」「2日間排便なし」
        // 「5分間の歩行で息切れ」の次の行が【…】で始まると、所見の行が消え、「回嘔吐あり。」が以降のカードの日時になっていた。
        // 指示・処置などをまとめる見出しの語で終わる行だけにする。
        const numberedSectionHeaderMatch = cleanLine.match(/^[1-9]([^\d:：【\[\]】。、,]{2,18}(?:指示|処置|予定|準備|内容|オーダー))$/);
        if (numberedSectionHeaderMatch) {
          let peekIdx3 = li + 1;
          while (peekIdx3 < lines.length && peekText(peekIdx3) === '') peekIdx3++;
          const peekLine3 = peekIdx3 < lines.length ? peekText(peekIdx3) : '';
          if (/^[【\[]/.test(peekLine3)) {
            globalTimestamp = numberedSectionHeaderMatch[1];
            updateAdmissionPhase(globalTimestamp);
            continue;
          }
        }

        // 「(バイタルサイン)、脈拍72回/分、呼吸数18回/分、」のように、他の値と同じ行に
        // 括弧書きの見出し語だけが混ざっている場合、それ自体は所見を含まないため
        // 「不要な情報」として個別に切り出し、行から取り除く（残りの脈拍・呼吸数等の
        // 実際の値は、この後の通常の検査値・バイタル抽出でそれぞれ別カードにできるようにする）。
        const INLINE_UNNECESSARY_MARKER_REGEX = /[\(（](?:バイタルサイン|バイタル)[\)）]/g;
        let inlineMarkerMatch;
        while ((inlineMarkerMatch = INLINE_UNNECESSARY_MARKER_REGEX.exec(cleanLine)) !== null) {
          pushExtracted({ text: inlineMarkerMatch[0], timestamp: globalTimestamp, isUnnecessaryBoilerplate: true });
        }
        cleanLine = cleanLine.replace(INLINE_UNNECESSARY_MARKER_REGEX, '').replace(/^[、,]\s*/, '').trim();
        if (!cleanLine) continue;

        // 「身長」「体重」「BMI」は続けて別々の行に記載されることが多く、いずれも同じ身体計測に
        // 関する客観的な情報のため、連続していれば1枚のカードにまとめる（必須ではないが、
        // まとめておくとアセスメント表で見やすいため）。1行だけしか見つからない場合は、通常の
        // 文章抽出にそのまま進む（1行でも「身長」等の語自体がOデータ判定の手がかりになる）。
        const PHYSICAL_MEASUREMENT_KEY_REGEX = /^(身長|体重|BMI)(?:[:：]|\s|$)/;
        const physicalMeasurementMatch = cleanLine.match(PHYSICAL_MEASUREMENT_KEY_REGEX);
        if (physicalMeasurementMatch) {
          const seenKeys = new Set([physicalMeasurementMatch[1]]);
          const measurementLines = [cleanLine];
          let mIdx = li + 1;
          while (mIdx < lines.length && measurementLines.length < 3) {
            const candidate = peekText(mIdx);
            const m = candidate.match(PHYSICAL_MEASUREMENT_KEY_REGEX);
            if (!m || seenKeys.has(m[1])) break;
            seenKeys.add(m[1]);
            measurementLines.push(candidate);
            mIdx++;
          }
          if (measurementLines.length > 1) {
            const merged = cleanExtractedPhrase(measurementLines.join('、'));
            pushExtracted({ text: merged, timestamp: globalTimestamp });
            li = mIdx - 1; // forループのli++で次の未処理行へ進む
            continue;
          }
          // 直後に他の身体計測の行が続かない場合は、この行だけを通常の文章抽出に委ねる
        }

        // 「検査項目」の行の直後に「基準値」の行、続けて「A氏 (術前)」「A氏 (術後)」のような
        // 列ラベルの行が続く場合、検査結果の表のヘッダー行とみなす。以降のデータ行（項目名→
        // 基準値→実測値…）で、基準値の次に続く実測値の列がそれぞれ何のタイムスタンプに対応する
        // 列かを、ここで読み取って記憶しておく（例：1列目=術前、2列目=術後）。
        // 列ラベルの行は、次の行が基準値のような範囲表記になった時点（＝最初のデータ行に
        // 到達した時点）で読み終わったと判断する。
        if (/^検査項目(?:[:：]|\s|$)/.test(cleanLine)) {
          let hIdx = li + 1;
          while (hIdx < lines.length && peekText(hIdx) === '') hIdx++;
          const nextHeaderLine = hIdx < lines.length ? peekText(hIdx) : '';
          // 「正常値」「基準範囲」等も「基準値」と同じ列見出しとして扱う（利用者からのアップロード
          // 文書で発覚：「検査項目／正常値／入院時／術後1日目」の表がヘッダーとして認識されず、
          // 列見出し「術後1日目」が時系列マーカーとして以降のすべてのカードの日時を上書きしていた）。
          if (REFERENCE_HEADER_REGEX.test(nextHeaderLine)) {
            let cIdx = hIdx + 1;
            const phases = [];
            while (cIdx < lines.length) {
              while (cIdx < lines.length && peekText(cIdx) === '') cIdx++;
              const colLine = cIdx < lines.length ? peekText(cIdx) : '';
              if (!colLine) break;
              let peekIdx2 = cIdx + 1;
              while (peekIdx2 < lines.length && peekText(peekIdx2) === '') peekIdx2++;
              const peekLine2 = peekIdx2 < lines.length ? peekText(peekIdx2) : '';
              // 次の行が基準値のような範囲表記なら、この行はもう列ラベルではなく最初の
              // データ行（項目名）なので、ここでヘッダーの読み取りを止める。
              if (looksLikeReferenceRangeLine(peekLine2)) break;
              // 検査項目名（BNP等）の行に来たら、列見出しの読み取りを終える（項目名を列見出しとして飲み込まない）
              if (BARE_LAB_KEY_REGEX.test(colLine)) break;
              // 「術後1日目」「入院2日目」「POD1」のような経過日数の列見出しは数字を含むが、
              // 列見出しとして正当なため、時系列の語として読み取れる場合は数字があっても受け付ける。
              const phaseMatch = colLine.match(/(入院当日|入院\d+日目|手術当日|手術前日|術後\s*\d+\s*日目|POD\s*\d+|\d+日目|入院前|入院時|術前|術中|術後|入院後)/);
              if (colLine.length > 20 || (/\d/.test(colLine) && !phaseMatch)) break;
              phases.push(phaseMatch ? phaseMatch[1].replace(/\s+/g, '') : null);
              cIdx++;
            }
            if (phases.length > 0) {
              tableColumnPhases = phases;
              tableSerial++;
              tableHasRefColumn = true;
              pushExtracted({ text: cleanExtractedPhrase(cleanLine), timestamp: globalTimestamp, isUnnecessaryBoilerplate: true });
              pushExtracted({ text: cleanExtractedPhrase(nextHeaderLine), timestamp: globalTimestamp, isUnnecessaryBoilerplate: true });
              // 列ラベルの行自体は表の構造を示すだけで所見を含まないため、カード化せずそのまま読み飛ばす
              li = cIdx - 1; // forループのli++で最初のデータ行（項目名）へ進む
              continue;
            }
          }
        }

        // 「実習科目名：老年看護学実習」のような、事例プリント自体の見出し・提出情報は、
        // 値の内容が何であっても患者アセスメントとは無関係なため、行ごと「不要な情報」として
        // そのまま1枚のカードにする（検査値抽出・見出しラベル切り出し・通常の文章抽出は行わない）。
        if (isUnnecessaryBoilerplateText(cleanLine)) {
          pushExtracted({ text: cleanExtractedPhrase(cleanLine), timestamp: globalTimestamp, isUnnecessaryBoilerplate: true });
          continue;
        }

        // 「検査項目名だけの行」（表のコピー貼り付けで数値と別の行に分かれてしまったもの）は、
        // 次の行が「数値だけ（＋単位）」であれば1つの検査値カードとして結合する。
        // 次の行が数値でなければ、項目名だけでは意味のある情報にならないためカード化しない。
        // 英語の検査略語（WBC等、BARE_LAB_KEY_REGEX）だけでなく、日本語の検査項目名
        // （白血球・アルブミン(Alb)等）であっても、直後の行が基準値のような範囲表記になって
        // いれば同様に表の項目名の行とみなす（日本語の項目名を1件ずつ登録する代わりに、
        // 「範囲表記の行が続く」という表であることが明確な構造的手がかりで判定する）。
        const isKnownBareLabKey = BARE_LAB_KEY_REGEX.test(cleanLine);
        let genericKeyPeekIdx = li + 1;
        while (genericKeyPeekIdx < lines.length && peekText(genericKeyPeekIdx) === '') genericKeyPeekIdx++;
        const genericKeyPeekLine = genericKeyPeekIdx < lines.length ? peekText(genericKeyPeekIdx) : '';
        const isGenericTableKey = !isKnownBareLabKey && cleanLine.length <= 20 && !/\d/.test(cleanLine) &&
          !isUnnecessaryBoilerplateText(cleanLine) && looksLikeReferenceRangeLine(genericKeyPeekLine);
        // ヘッダー（検査項目／正常値／入院時／術後1日目 等）を読み取った表の中では、値の1行目が
        // 「ー」（基準値なし）や「100mg/dl」のように範囲表記でない項目（FBS・eGFR・PT%・APTT等）も
        // あるため、「数字で始まらない短い行の直後に値のセルが続く」ことだけで項目名の行とみなす。
        const isInTableKey = !isKnownBareLabKey && !isGenericTableKey && tableHasRefColumn &&
          cleanLine.length <= 25 && !/^[\d<>≦≧≤≥＜＞]/.test(cleanLine) && !isTableValueCell(cleanLine) &&
          isTableValueCell(genericKeyPeekLine);
        // 表の行として読めない行が現れたら、表はそこで終わったとみなす（列構成の記憶を引きずって
        // 表の後ろの無関係な行を誤って表の行として扱わないようにする）。
        if (tableHasRefColumn && !isKnownBareLabKey && !isGenericTableKey && !isInTableKey) {
          tableColumnPhases = [];
          tableHasRefColumn = false;
        }
        if (isKnownBareLabKey || isGenericTableKey || isInTableKey) {
          const keyName = cleanLine.replace(/[:：]\s*$/, '').trim();
          // 表のコピー貼り付けでは「項目名」の行の後に「基準値」の行、続けて「実測値」の行
          // （「A氏(術前)」「A氏(術後)」のように2列以上ある場合はその列数分）が続くことがある。
          // 値の行として認識できる限り（「-」は「その列の測定なし」を示す記号として扱う）、
          // 空行を挟みつつ連続して読み進めて全て消費する（暴走的な結合を避けるため最大6行まで）。
          // ヘッダーから列数が分かっている表では、基準値1列＋実測値の列数分だけを読む。
          const maxValueLines = tableHasRefColumn ? 1 + tableColumnPhases.length : 6;
          let nextIdx = li + 1;
          const valueLines = [];
          while (nextIdx < lines.length && valueLines.length < maxValueLines) {
            while (nextIdx < lines.length && peekText(nextIdx) === '') nextIdx++;
            const candidate = nextIdx < lines.length ? peekText(nextIdx) : null;
            if (!candidate || !isTableValueCell(candidate)) break;
            valueLines.push(candidate);
            nextIdx++;
          }
          if (valueLines.length > 0) {
            // ヘッダーで基準値の列があると分かっている表では、値の1行目は必ず基準値の列
            // （「ー」等なら基準値なし）。ヘッダーの無い表では従来通り、先頭の値が範囲表記
            // （「〜」「4.0-5.1」のようなハイフン区切り、「<0.2」のような不等号付き）で、かつ後続の
            // 値が1つ以上ある場合に限り先頭を「基準値」とみなす。
            const firstIsRange = tableHasRefColumn
              ? valueLines.length > 1
              : valueLines.length > 1 && (/[〜~]/.test(valueLines[0]) || /^[\d,]+(?:\.\d+)?\s*-\s*[\d,]/.test(valueLines[0]) || isComparatorRefCell(valueLines[0]));
            const refRangeLine = firstIsRange && !isLabPlaceholderCell(valueLines[0]) ? restoreExponent(valueLines[0]) : null;
            const measurementLines = firstIsRange ? valueLines.slice(1) : valueLines;
            if (measurementLines.length === 1 && !firstIsRange) {
              // 従来通りの単純な「項目名→実測値1件のみ」の形式（回帰確認用に体裁を維持）
              if (!isLabPlaceholderCell(measurementLines[0])) {
                const merged = cleanExtractedPhrase(`${keyName} ${measurementLines[0]}`);
                // ヘッダーの列が分かっている表の中で値が1つしか無い行は、1列目（多くは入院時）の日時にする（患者36のHbA1c）
                const singleTs = (tableHasRefColumn && tableColumnPhases.find(Boolean)) || globalTimestamp;
                if (merged.length >= 2) pushExtracted({ text: merged, timestamp: singleTs, isLabOrVital: true,
                  _lab: tableHasRefColumn ? { table: tableSerial, phases: tableColumnPhases.slice(), key: keyName, value: measurementLines[0], phase: singleTs } : undefined });
              }
            } else {
              // 表では2列目以降の実測値の単位が省略されることが多い（例：入院時「8100/μL」、
              // 術後1日目「10,200」）。単位の無い実測値には、同じ行の他の実測値の単位を、それも
              // 無ければ基準値の単位を補う（利用者からのアップロード文書で発覚：単位の無い数値だけの
              // カードになり、何の値か読み取りにくかった）。「380万/μL」の「万」も単位の一部として扱う。
              const splitNumberAndUnit = (s) => {
                const m = (s || '').match(/^[<>≦≧≤≥＜＞]?\s*[\d,]+(?:\.\d+)?(?:\s*[〜~\-]\s*[\d,]+(?:\.\d+)?)?\s*(.*)$/);
                // 末尾の↑↓（異常値の印）と、空白を挟んだH/L（High/Lowの印）だけを取り除く
                // （μL・dLの「L」は単位の一部なので取り除かない）。
                return m ? m[1].replace(/\s*[↑↓]$/, '').replace(/\s+[HLhl]$/, '').trim() : '';
              };
              const siblingUnit = measurementLines.map(v => isLabPlaceholderCell(v) ? '' : splitNumberAndUnit(restoreExponent(v))).find(u => u) || '';
              const rowUnit = siblingUnit || (refRangeLine ? splitNumberAndUnit(refRangeLine) : '');
              measurementLines.forEach((rawValLine, colIdx) => {
                if (isLabPlaceholderCell(rawValLine)) return; // その列の測定なしを示す記号はカード化しない
                let valLine = restoreExponent(rawValLine);
                if (rowUnit && /^[\d,]+(?:\.\d+)?\s*[↑↓]?$/.test(valLine)) {
                  const numMatch = valLine.match(/^([\d,]+(?:\.\d+)?)\s*([↑↓]?)$/);
                  valLine = `${numMatch[1]}${rowUnit}${numMatch[2] ? ' ' + numMatch[2] : ''}`;
                }
                const withRef = refRangeLine ? `${valLine} (基準値: ${refRangeLine})` : valLine;
                const merged = cleanExtractedPhrase(`${keyName} ${withRef}`);
                // ヘッダーから読み取った列ごとのタイムスタンプ（例：1列目=術前、2列目=術後）があれば
                // それを使い、無ければその時点のタイムスタンプ（globalTimestamp）をそのまま使う。
                // 列の数より値が少ない行（空欄の列がある行）では、どの列の値か分からないため、1列目（多くは入院時）の
                // 日時にする（以前は表の前の記録の時刻「12:00」がそのまま付いていた。患者36のHbA1c）。
                const colTimestamp = tableColumnPhases[colIdx] || tableColumnPhases.find(Boolean) || globalTimestamp;
                if (merged.length >= 2) pushExtracted({ text: merged, timestamp: colTimestamp, isLabOrVital: true,
                  _lab: tableHasRefColumn ? { table: tableSerial, phases: tableColumnPhases.slice(), key: keyName, value: valLine, ref: refRangeLine, phase: colTimestamp } : undefined });
              });
            }
            li = nextIdx - 1; // 消費した値の行の直前まで読み進める（forループのli++で次の未処理行へ進む）
          } else if (isKnownBareLabKey) {
            // 値の行が既知の形式（BARE_LAB_VALUE_REGEX）に一致しなかった場合でも、項目名の行
            // 自体を静かに消してしまうと、項目名だけが失われ、直後の値がラベルの無い意味不明な
            // 断片として残ってしまう（利用者からの報告事例：術前検査結果の表で「TP」＋「60g/21」
            // （おそらく「6.0g/dL」がOCRで小数点・単位を失った表記）の行の組で、値が単位として
            // 認識できず結合に失敗し、「TP」という項目名の行自体が丸ごと消えていた）。
            // 直後の行が数字から始まる短い行であれば、単位表記が破損したOCR起因の値である
            // 可能性が高いため、生の文字列のまま項目名と結合する（LAB_VALUE_TRAILING_UNIT_REGEXの
            // 説明の通り、formatLabValueStringは単位として説明できない残骸があれば数値を
            // 作り出さずそのまま残すため、誤った基準値付きの数値を作ってしまう心配は無い）。
            // 数字から始まらない・次の行が見つからない場合は値との結合自体を諦め、それでも
            // 項目名だけは（無かったことにせず）カードとして残す。
            let peekIdx = li + 1;
            while (peekIdx < lines.length && peekText(peekIdx) === '') peekIdx++;
            const rawCandidate = peekIdx < lines.length ? peekText(peekIdx) : '';
            if (rawCandidate && rawCandidate.length <= 15 && /^[0-9０-９]/.test(rawCandidate)) {
              const merged = cleanExtractedPhrase(`${keyName} ${rawCandidate}`);
              if (merged.length >= 2) pushExtracted({ text: merged, timestamp: globalTimestamp, isLabOrVital: true });
              li = peekIdx;
            } else {
              const aloneKey = cleanExtractedPhrase(keyName);
              if (aloneKey.length >= 2) pushExtracted({ text: aloneKey, timestamp: globalTimestamp, isLabOrVital: true });
            }
          }
          // 【レビューで発見】次の行が「2〜3日に1回、硬便傾向」「5〜6割摂取」「4-5時間で中途覚醒あり」のように数値の幅で
          // 始まるだけの普通の文だと、表の項目名の行とみなしたのに値のセルとして読めず、項目名の行（「排便習慣」「昼食」
          // 「睡眠状況」）が黙って消えていた（残った文も何についての記録か分からずタグが付かなかった）。
          // この場合は表ではなく「見出し＋その内容」なので、「排便習慣: 2〜3日に1回、硬便傾向」の1行として続けて読む。
          if (!valueLines.length && !isKnownBareLabKey && isGenericTableKey && genericKeyPeekLine) {
            cleanLine = `${keyName}: ${genericKeyPeekLine}`;
            li = genericKeyPeekIdx;
          } else {
            continue;
          }
        }

        const lineStartIndex = extracted.length;
        // 【レビューで発見】NFKC正規化で「×10³/μL」が「×103/μL」になり、「WBC 11.2×103/μL」のように103倍と読める
        // カードになっていた（表の読み取りでは restoreExponent で戻していたが、文中の検査値では戻していなかった）
        cleanLine = restoreExponent(cleanLine);

        // 検査データの個別抽出（SpO2は "(room air)" 等の直後の注記も含めて丸ごと1枚のカードにする。
        // 各項目の単位もLAB_REGEX_SOURCEにoptionalで含まれているため、「WBC 11200/μL」のように
        // 単位まで直接書かれていても、値と単位が分かれずに1つのカードとして抽出される）
        const labRegex = new RegExp(`(${LAB_REGEX_SOURCE})`, 'gi');
        let lMatch, lSubText = cleanLine;
        // 【文の途中の値は抜き出さない】長文の心不全事例のテストで発覚：「酸素2L開始し、SpO2 94%に上昇」から値だけを
        // 抜くと「酸素2L開始し、に上昇」、「歩行後SpO2 92%まで低下」が「歩行後まで低下」、「前後でSpO2 96%→94%」が
        // 「前後で→94%」のように、残りの文が壊れていた。値の直後が助詞・矢印・「維持/上昇/低下」等で文が続く場合や、
        // 直前が「歩行後」「前後で」のように文の途中の場合は、その行の値を抜き出さず、文ごと1枚にする。
        const embeddedLabInSentence = (() => {
          const re = new RegExp(`(${LAB_REGEX_SOURCE})`, 'gi');
          let m;
          while ((m = re.exec(cleanLine)) !== null) {
            if (!isPlausibleLabMatch(m[0], cleanLine.slice(m.index + m[0].length))) continue; // 検査値でない語（js/03 の説明を参照）
            const after = cleanLine.slice(m.index + m[0].length).replace(/^\s+/, '');
            const before = cleanLine.slice(0, m.index).replace(/\s+$/, '');
            if (/^(?:に|まで|へ|を|が|で|と|の|→|⇒|->|から|維持|上昇|低下|回復|改善|増加|減少|前後|程度|台)/.test(after)) return true;
            if (/^[〜~～]\s*\d/.test(after)) return true; // 「SpO2 95〜98%で経過」のような値の幅（以前は「SpO2 95」と「〜98%で経過」に分かれていた）
            if (/(?:後|前|で)$/.test(before) && !/(?:入院前|術前|術後|手術前)$/.test(before)) return true;
          }
          // 「透析前：体重 62.4kg、BP 168/92mmHg」「歩行後：SpO2 92%」のように、行の頭に「〜前・〜後・〜中」の見出しがある行は、
          // 値を抜き出すと、いつの値か（透析の前か後か）が分からなくなるので、行ごと1枚にする（実習生の記録のテストで発覚）
          if (/^(?!入院|術|手術)[^\d:：、。()（）\s]{1,8}(?:前|後|中)\s*[:：]/.test(cleanLine)) return true;
          if (/^(?:児|新生児)\s*[:：]/.test(cleanLine)) return true; // 児の値は、母親の値と分かれないよう行ごと1枚にする
          return false;
        })();
        // 「血液検査（10/8 6:00）：Na 133…」「バイタル 10:00 BT 37.4℃…」のように行の頭に書いた時刻は、その行の値の時刻にする
        // （以前は「血液検査(10/8 6:00):、」「バイタル 10:00」だけのカードが残り、値のカードには時刻が付かなかった）
        const leadLabelTime = !embeddedLabInSentence && cleanLine.match(/^(?:血液検査|採血|検査結果|バイタル(?:サイン)?|VS|V\/S|検温)\s*(?:[(（]\s*(?:(\d{1,2})\/(\d{1,2})\s*)?(\d{1,2}:\d{2})?\s*[)）]|(\d{1,2}:\d{2}))\s*[:：]?/i);
        if (leadLabelTime && (leadLabelTime[3] || leadLabelTime[4]) && new RegExp(`(${LAB_REGEX_SOURCE})`, 'i').test(cleanLine.slice(leadLabelTime[0].length))) {
          // 【レビューで発見】「血液検査（10/8 6:00）」の日付（10/8）を読み捨て、時刻だけを前の日に付けていた。日付があれば先に日を切り替える
          // （「入院3日目」のように日の呼び方で書いている記録では、同じ日が2つの呼び方に分かれないよう、今の日の呼び方のままにする）
          if (leadLabelTime[1] && (!dayLabel || /^(?:\d{1,4}年)?\d{1,2}月\d{1,2}日$/.test(dayLabel)) && Number(leadLabelTime[1]) >= 1 && Number(leadLabelTime[1]) <= 12 && Number(leadLabelTime[2]) >= 1 && Number(leadLabelTime[2]) <= 31) {
            applyTimeMarker(`${Number(leadLabelTime[1])}月${Number(leadLabelTime[2])}日`);
          }
          globalTimestamp = applyTimeMarker(leadLabelTime[3] || leadLabelTime[4]);
        }
        while (!embeddedLabInSentence && (lMatch = labRegex.exec(cleanLine)) !== null) {
          // 「1hr 100ml」「PT 2単位」「TP1」のような、検査値ではない語は切り出さない（isPlausibleLabMatch の説明を参照）
          if (!isPlausibleLabMatch(lMatch[0], cleanLine.slice(lMatch.index + lMatch[0].length))) continue;
          // 【記録に書かれた基準値を残す】繰り返し入力の確認で発覚：「WBC 12000/μL (基準値: 3300〜8600)」の
          // 値だけを抜き出していたため、カードにはアプリの基準値（4,000〜9,000）が付き、記録の基準値は
          // 「(基準値: 3300〜8600)」だけの別のカードになっていた。値の直後に書かれた基準値は、値と同じカードに入れる
          // （基準値が書いてあるので、アプリの基準値は付けない。formatLabValueString 参照）。
          // 基準値の後ろの「↑」「↓」（「Na 131 mEq/L（基準値：138〜145）↓」）も、値の印として同じカードに残す（値の直後に置く）。
          const writtenRef = cleanLine.slice(lMatch.index + lMatch[0].length).match(/^(\s*[↑↓]?)\s*[（(]\s*(?:基準値|基準範囲|正常値|基準)\s*[:：]?\s*([^)）]{1,40})[)）](\s*[↑↓])?/);
          let writtenRefText = null;
          if (writtenRef) {
            const valuePart = lMatch[0];
            const arrow = ((writtenRef[1] || '') + (writtenRef[3] || '')).replace(/\s+/g, '');
            const whole = valuePart + writtenRef[0];
            writtenRefText = `${valuePart.replace(/\s+$/, '')}${arrow && !/[↑↓]\s*$/.test(valuePart) ? arrow : ''} (基準値: ${writtenRef[2].trim()})`;
            lMatch = Object.assign([whole, ...lMatch.slice(1)], { index: lMatch.index, input: lMatch.input });
            labRegex.lastIndex = lMatch.index + whole.length;
          }
          // 値の直後のかっこ書きの注記（「HbA1c 7.8%（9/30 受診時）」「BP 146/82mmHg（家庭血圧手帳：朝 130〜140台）」）と、
          // 脈の「整」「不整」（「P 72回/分、整」）も、値と同じカードに残す（以前は注記だけのカードに分かれたり、「整」が消えたりしていた）
          if (!writtenRef) {
            const after = cleanLine.slice(lMatch.index + lMatch[0].length);
            const note = after.match(/^(\s*[↑↓]?)\s*[（(](?!\s*(?:基準|正常値|随時|早朝空腹時|空腹時|食前|食後|眠前|就寝前))([^()（）]{1,30})[)）]/);
            const rhythm = !note && /(?:回\/分|bpm)\s*$/i.test(lMatch[0]) ? after.match(/^\s*[、,]?\s*(不整|整)(?=$|[、,。\s])/) : null;
            if (note || rhythm) {
              const whole = lMatch[0] + (note || rhythm)[0];
              writtenRefText = note
                ? `${lMatch[0].replace(/\s+$/, '')}${(note[1] || '').trim()} (${note[2].trim()})`
                : `${lMatch[0].replace(/\s+$/, '')} ${rhythm[1]}`;
              lMatch = Object.assign([whole, ...lMatch.slice(1)], { index: lMatch.index, input: lMatch.input });
              labRegex.lastIndex = lMatch.index + whole.length;
            }
          }
          let lClean = cleanExtractedPhrase(writtenRefText || lMatch[0]);
          // 「随時血糖246」「空腹時血糖130」の「随時・空腹時・食後」は値の意味を変えるので、項目名に付けて残す。
          // 基準値（70〜109）は空腹時の値なので、随時・食後の血糖には付けない（7事例のテスト：糖尿病足病変）
          const glucoseQual = cleanLine.slice(0, lMatch.index).match(/(随時|早朝空腹時|空腹時|食後\s*\d*\s*時間?)\s*$/);
          if (glucoseQual && /^(?:血糖|BS|GLU|グルコース)/i.test(lClean)) {
            const qual = glucoseQual[1].replace(/\s+/g, '');
            lClean = lClean.replace(/^(血糖値?|BS|GLU|グルコース)/i, `$1(${qual})`);
            if (!/空腹/.test(qual)) lClean = lClean.replace(/\s*\(基準値:[^)]*\)/, '');
            lSubText = lSubText.replace(new RegExp(`${glucoseQual[1]}\\s*(?=${lMatch[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`), '');
          }
          // 「血糖 186mg/dL（食前）」のように値の後ろに書いた「（食前）」も項目名に付ける（残すと「(食前)、」だけの断片になっていた）
          const trailingQual = !glucoseQual && /^(?:血糖|BS|GLU|グルコース)/i.test(lClean)
            ? cleanLine.slice(lMatch.index + lMatch[0].length).match(/^\s*[（(]\s*(随時|早朝空腹時|空腹時|食前|食後\s*\d*\s*時間?|眠前|就寝前)\s*[)）]/) : null;
          if (trailingQual) {
            const qual = trailingQual[1].replace(/\s+/g, '');
            lClean = lClean.replace(/^(血糖値?|BS|GLU|グルコース)/i, `$1(${qual})`);
            if (!/空腹|食前/.test(qual)) lClean = lClean.replace(/\s*\(基準値:[^)]*\)/, '');
            lSubText = lSubText.replace(lMatch[0] + trailingQual[0], lMatch[0]);
          }
          if (lClean.length >= 2) pushExtracted({ text: lClean, timestamp: globalTimestamp, isLabOrVital: true });
          lSubText = lSubText.replace(lMatch[0], '');
        }
        // 値を抜いた後に残る空カッコや連続する読点・句点など、不自然な残骸を整える
        lSubText = lSubText
          .replace(/[\(（]\s*[\)）]/g, '')
          .replace(/[、。](?=[、。])/g, '')
          .trim();
        // 値を抜いた後に「血液検査では、」「帰室時、」「随時」のような前置きの語だけが残った文は捨てる（7事例のテスト）
        if (extracted.length > lineStartIndex) {
          lSubText = splitSentencesOutsideQuotes(lSubText).filter(sent => {
            const core = sent.replace(/[、。\s,]/g, '');
            // 「血液検査(10/8 6:00):」「バイタル 10:00」のような、見出しと日時だけが残ったものも捨てる
            const bare = core.replace(/[(（][\d\/:：〜~\-\s]*[)）]/g, '').replace(/\d{1,2}:\d{2}/g, '').replace(/[:：【】\[\]]/g, '');
            if (/^(?:血液検査|採血|検査|検査結果|血液データ|バイタル(?:サイン)?|VS|V\/S|検温)$/i.test(bare)) return false;
            return !(core.length <= 12 && !/\d/.test(core) && /(?:では|には|は|時|随時|空腹時|食後|結果|検査)$/.test(core));
          }).join('');
          // 「血液検査：、総ビリルビン 6.8 mg/dL」のように、値を抜いた後に見出しと「、」だけが頭に残ったら外す
          lSubText = lSubText.replace(/^[【\[]?(?:血液検査|採血|検査結果|検査|バイタル(?:サイン)?|検温)[】\]]?\s*(?:[(（][^)）]*[)）])?\s*[:：]?\s*[、,]\s*/, '');
        }

        // 現病歴・既往歴・診断名・保険・入院日・主訴・治療方針・治療内容などの見出しラベル付き項目を、
        // 日時と同様に構造化して切り出す。
        // 「現病歴：」のようなコロン付きだけでなく、「現病歴は」「現病歴」(コロンなし)でも検出する
        const fieldRegex = new RegExp(FIELD_LABEL_REGEX_SOURCE, 'g');
        const fieldMatches = [];
        let fMatch;
        while ((fMatch = fieldRegex.exec(lSubText)) !== null) {
          fieldMatches.push({ key: normalizeFieldLabelHeadingWord(fMatch[1]), start: fMatch.index, contentStart: fMatch.index + fMatch[0].length });
        }

        if (fieldMatches.length > 0) {
          // 最初のラベルより前にある文章はそのまま一般カードとして残す。この部分は見出しに
          // 属さない自由な文章であることが多く、句点ごとに機械的に分割すると麻酔覚醒後の
          // 観察のような継続した文脈を分断してしまうため、句点による分割は行わず、
          // 構造的に明確な「・」列挙だけを分割対象とする（不自然な始まりの文があれば
          // 直前カードへ統合）。
          const leading = lSubText.slice(0, fieldMatches[0].start).trim();
          if (leading) {
            const leadingRaw = leading.replace(/^(?:入院時(?:[、,]|\s+|(?=患者は|本日は)))?(?:患者は|本日は)?/, '');
            splitEnumeratedPhrases(leadingRaw).forEach(sentence => {
              const cleanedLeading = cleanExtractedPhrase(sentence);
              if (cleanedLeading.length >= 2) pushOrMerge(cleanedLeading, lineStartIndex, { isPhrase: true });
            });
          }
          fieldMatches.forEach((m, idx) => {
            const hardEnd = idx + 1 < fieldMatches.length ? fieldMatches[idx + 1].start : lSubText.length;
            // 見出しの内容は基本的に最初の句点「。」までとし、それ以降は無関係な別の文として切り離す
            // （読点「、」は同じ文の中の列挙とみなし、句点が出るまでは１つの内容として扱う）
            // 主訴は本人の訴えを並べたものなので、句点で切らずに行の終わりまで1枚にする（心不全事例：「足がむくんで
            // 靴が履けない。」だけが見出しの無いOのカードになっていた）
            const periodIdx = m.key === '主訴' ? -1 : lSubText.indexOf('。', m.contentStart);
            const segmentEnd = (periodIdx !== -1 && periodIdx < hardEnd) ? periodIdx + 1 : hardEnd;
            const content = cleanExtractedPhrase(lSubText.slice(m.contentStart, segmentEnd).replace(/[、。]\s*$/, ''));
            // 見出し（fieldLabel）が付いているからといって日付だけの内容を無条件に許可しない。
            // タグ・バッジの有無に関わらず、内容の文字列そのものを見て「日付だけ」かどうかを判定する。
            // 「入院日：2026年9月10日」のように見出しの内容が日付そのものだけの場合、それをそのまま
            // 情報カードとして残しても新しい所見・タグは何も得られないため、他の見出しと同様に除外する
            // （以前は「入院日」だけを対象外としていたが、単なる日付だけのカードが作られてしまうという
            // 指摘を受けたため、見出しの種類にかかわらず統一的に判定する）。
            const isDateOnlyContent = isDateOnlyText(content);
            if (content.length >= 1 && !isDateOnlyContent && !isBareFieldHeaderOnly(content)) {
              // 既往歴は「53歳 卵巣嚢腫、50歳代 胆石症 (症状がないため経過観察中)」のように
              // 「◯歳（代）＋病名」の組が読点で列挙されることが多く、これを1枚のカードに
              // まとめてしまうと個々の既往（診断）ごとのタグ付けができない。年齢表記が
              // 2回以上出てくる場合はこの列挙パターンとみなし、年齢の出現ごとに分割する
              // （1回だけの場合は単に発症年齢を含む1件の既往なので分割しない）。
              if (m.key === '生活歴' && splitLifeHistoryItems(content).length > 1) {
                splitLifeHistoryItems(content).forEach(part => {
                  const cleanedPart = cleanExtractedPhrase(part);
                  if (cleanedPart.length >= 1) pushExtracted({ text: cleanedPart, timestamp: globalTimestamp, fieldLabel: m.key });
                });
              } else if (m.key === '既往歴') {
                splitHistoryByAgeMarkers(content).forEach(part => {
                  const cleanedPart = cleanExtractedPhrase(part);
                  if (cleanedPart.length >= 1 && !isDateOnlyText(cleanedPart)) {
                    pushExtracted({ text: cleanedPart, timestamp: globalTimestamp, fieldLabel: m.key });
                  }
                });
              } else {
                // 本文が「無」「なし」のような一語の状態語だけの場合、バッジ（fieldLabel）だけに
                // 見出しの文脈を頼らず、本文にも見出し語を残しておく（isBareStatusWordの説明を参照）。
                const labeledContent = isBareStatusWord(content) ? `${m.key}: ${content}` : content;
                pushExtracted({ text: labeledContent, timestamp: globalTimestamp, fieldLabel: m.key });
              }
            }
            // 見出しの内容にも次の見出しにも属さない残りの文章は、句点ごとに文を分けて一般カードとして拾う
            // （例：「治療方針：〜を行う。シャワー浴、弾性ストッキング着用を実施。」のように見出しの後に
            // 別の文が続く場合、それぞれ独立したカードにする）
            if (segmentEnd < hardEnd) {
              const leftoverRaw = lSubText.slice(segmentEnd, hardEnd);
              splitIntoSentenceFragments(leftoverRaw).forEach(sentence => {
                const leftover = cleanExtractedPhrase(sentence);
                if (leftover.length >= 2) pushOrMerge(leftover, lineStartIndex, { isPhrase: true });
              });
            }
          });
          continue;
        }

        // 行全体の文脈（引用や「〜と話すが、〜」などの接続表現を含む塊）は1つのまとまりとして
        // 保持する。以前は句点「。」ごとに機械的に分割していたが、「麻酔からの覚醒も良好。
        // 声を掛けると「あ、あ」と短く返事するのみ。のどの痛みあり。…」のように、同じ出来事
        // （麻酔からの覚醒）について続けて観察所見を述べている一連の文章まで分断してしまう
        // という指摘を受けたため、見出しの付かない一般的な文章は句点では分割しないことにした。
        // 「シャワー浴・弾性ストッキング着用を実施」のように構造的に明確な「・」列挙だけは
        // 安全に分割できるため、そちらのみ分割対象とする（不自然な始まりの文があれば、
        // 同じ行で直前に抜き出したカード＝多くは検査値カードへ文章をつなぎ戻す）。
        let remainderText = lSubText.trim();
        remainderText = remainderText.replace(/^(?:入院時(?:[、,]|\s+|(?=患者は|本日は)))?(?:患者は|本日は)?/, '').trim();
        // 「身体的状態:」「身体的機能の状態:」のように見出し語＋コロンだけで終わり、値が同じ行に
        // 何も書かれていない行は、下のsplitByNakatenListに渡すと「・」を含む見出し
        // （例：「装着器具・自助具の有無:」）が中身の無い断片に分割されてしまう上、分割されなくても
        // 見出し語だけの意味のないカードになってしまう。実際の値は次の行以降の個別の見出しに
        // 書かれているため、この行自体は「不要な情報」として除外する（UNNECESSARY_BOILERPLATE_KEYS
        // に無い、未知の見出し語にも対応できる一般的な判定）。
        if (isEmptyColonHeaderLine(remainderText)) {
          if (remainderText.length >= 1) pushExtracted({ text: cleanExtractedPhrase(remainderText), timestamp: globalTimestamp, isUnnecessaryBoilerplate: true });
          continue;
        }
        splitEnumeratedPhrases(remainderText).forEach(sentence => {
          const remainder = cleanExtractedPhrase(sentence);
          if (remainder.length >= 2) pushOrMerge(remainder, lineStartIndex, { isPhrase: true });
        });
      }

      // 「不要な情報」として除外した見出し行のうち、「血液検査」「画像検査等」「身体的状態:」の
      // ように後続の情報の説明（章タイトル）になっているものは、単に捨てるのではなく、その内容を
      // 後続のカードすべてに書き込む（利用者からの指摘：説明になっているなら全部に反映してほしい）。
      // 「検査項目」「基準値」は血液検査等の表の中で頻出するサブ見出しのため、これらが現れても
      // その前に設定された章タイトルは変わらず有効とみなす（表の途中で章タイトルが失われない
      // ようにするため）。それ以外の「不要な情報」（学籍番号等の事務情報や、「(バイタルサイン)」の
      // ように別の話題への切り替わりを示すマーカー等）が現れた場合は、章タイトルの対象範囲が
      // そこで終わったとみなしてリセットする。
      // 【原因と修正】「＜帰室時の状況）」のような山括弧見出し（TIME_MARKER_REGEXとは別の、
      // ＜＞<>で囲まれた区切り見出し）は、山括弧・閉じ側の記号（＞>）)）を残したまま
      // item.textに格納される（山括弧見出しの検出処理はブラケットを剥がさないため）。
      // このため、SECTION_HEADER_KEYSに登録した見出し語（例：「帰室時の状況」）と文字列として
      // 一致せず、章タイトルとして認識できなかった（利用者からの報告：「帰室時の状況」の直後の
      // 「声を掛けると開眼し、「ああ」と短く返事をするのみ。」が、どの状況の観察か分からない
      // まま単独のカードとして残っていた）。末尾のコロンだけでなく、山括弧の開き・閉じの記号も
      // 剥がしてから比較することで、山括弧形式の見出しもSECTION_HEADER_KEYSと一致できるようにする。
      // 【細かく分割しすぎないための結合】（利用者からの修正依頼：「分割されすぎている」）
      // ①「疼痛:」のように値の無い見出し行の直後に、その見出しについての短い行が続く場合
      //   （例：「安静時ペインスケール「2-3」」「体位変換時「5-6」…」「「動かなかったら痛くないよ」」）は、
      //   1行ずつ別々のカードにせず、見出しごと1枚のカードにまとめる（下の章タイトル書き込み処理で
      //   「疼痛: 」が先頭に付く）。「血液検査」等の章タイトル（SECTION_HEADER_KEYS）は多数の独立した
      //   検査値をまとめる見出しのため対象外。自前のラベル（「血液型: A型」等）・見出しラベル・検査値の
      //   カード、日時の異なるカード、長い文章（60文字超）が現れたら、まとまりはそこで終わりとする。
      // ②発言だけの行・名詞だけの短い行の結合は、AI分類と共通のmergeShortFragmentCardsで行う。
      const isMergeableBlockLine = (it, timestamp) => !it.isUnnecessaryBoilerplate && !it.fieldLabel && !it.isLabOrVital &&
        it.timestamp === timestamp && !hasOwnFieldLabelPrefix(it.text) && it.text.length <= 60;
      for (let hi = 0; hi < extracted.length; hi++) {
        const header = extracted[hi];
        if (!header.isUnnecessaryBoilerplate || !isEmptyColonHeaderLine(header.text)) continue;
        const bareHeader = header.text.replace(/[:：]\s*$/, '').trim();
        if (SECTION_HEADER_KEYS.includes(bareHeader)) continue;
        let hj = hi + 1;
        while (hj < extracted.length && hj - hi <= 6 && isMergeableBlockLine(extracted[hj], header.timestamp)) hj++;
        if (hj - (hi + 1) >= 2) {
          const blockItems = extracted.slice(hi + 1, hj);
          const joined = blockItems.map(b => b.text).reduce((acc, t) => acc + (/[。、]$/.test(acc) ? '' : '、') + t);
          blockItems[0].text = cleanExtractedPhrase(joined);
          extracted.splice(hi + 2, blockItems.length - 1);
        }
      }
      // 医師からの説明の行の直後に、その説明の続き（「リハビリテーションスケジュールに沿って開始する。」
      // 「退院目標：杖歩行で自宅退院」のような方針・予定・目標）が行を分けて書かれている場合は、説明と
      // 同じ1枚のカードにまとめる（利用者からの修正依頼：患者37「しっかり文章の前後を確認。本人へ主治医より
      // 「経過良好」と説明あり、本日から離床開始許可あり が抜け落ちている」）。すぐ次の行で同じ日時の、
      // 短い（40文字以内）方針・予定・目標の行だけを、最大3行まで続けてつなぐ。
      mergeExplanationContinuations(extracted);
      mergeShortFragmentCards(extracted);

      let currentSectionLabel = null;
      // 「疼痛:」「肢位:」のような話題の見出しは、日時が変わったらそこで終わりにする（章タイトルの
      // 「血液検査」等は、日時に関係なく次の区切りまで続ける）
      let currentSectionTimestamp = null;
      extracted.forEach(item => {
        if (currentSectionLabel && currentSectionTimestamp !== null && item.timestamp !== currentSectionTimestamp) {
          currentSectionLabel = null;
          currentSectionTimestamp = null;
        }
        if (item.isUnnecessaryBoilerplate) {
          const bareText = item.text.replace(/[:：]\s*$/, '').replace(/^[＜<]\s*/, '').replace(/\s*[＞>）)]$/, '').trim();
          if (SECTION_HEADER_KEYS.includes(bareText) || isEmptyColonHeaderLine(item.text)) {
            currentSectionLabel = bareText;
            currentSectionTimestamp = SECTION_HEADER_KEYS.includes(bareText) ? null : item.timestamp;
          } else if (!SECTION_HEADER_PASSTHROUGH_KEYS.includes(bareText)) {
            currentSectionLabel = null;
          }
          return;
        }
        // カードの文章が既に「キーパーソン: 妻、50歳代...」「知的能力: 理解良好...」のように
        // 自分自身のラベルを持っている場合、章タイトルをさらに重ねて付けると、その章タイトルの
        // 語（特に「年齢・社会的・文化的状況」の「年齢」）が文中の無関係な数値・人物の情報と
        // 混同され不自然になる（利用者からの指摘：「二枚目の50歳代というのは妻のことを指しているため
        // 年齢・社会的・文化的状況: だと不自然になる」）。
        // 同様に、「職業」「保険」のようにfieldLabelとして登録済みの項目は、カード上に既に色付きの
        // バッジで見出しが表示されているため、章タイトルの文章まで重ねて付けると二重表示になり
        // 読みにくい。加えて、「年齢・社会的・文化的状況」のような複数の話題（年齢／社会的／文化的
        // 状況）をまとめた章タイトルは、実際には特定の一部（例：職業・保険は社会的な話題のみ）にしか
        // 対応していないことが多く、内容とタイトルの対応が不正確にもなる（利用者からの指摘：
        // 「年齢・社会的・文化的状況:のなかで二つとも社会の関係するものしかありませんよね？」
        // 「すべてに割り振ってくれるのはありがたいですが少し文章がみずらくなってしまっています」）。
        // このため、自分のラベル（自前の見出し、またはfieldLabelバッジ）を持たないカード
        // （「白血球 5.8...」のようにラベルの無い数値・所見のみの文章）だけが対象になる。
        // 「血液検査」「画像検査等」「治療方針・治療内容等」「帰室時の状況」等は単一の話題を
        // まとめた章タイトルで、そのまま前置きすることで逆に文脈が分かりやすくなる
        // （bracket-heading-split.test.js等で検証済みの既存の挙動）ため、これらは今まで通り
        // 章タイトルをそのまま前置きする。
        // 【修正】ただし「年齢・社会的・文化的状況」だけは、年齢／社会的状況／文化的状況という
        // 互いに無関係な複数の話題を1つの見出しにまとめたものであり、これをそのまま前置きすると
        // 内容と見出しが対応しなくなる、という利用者からの繰り返しの指摘があった（「年齢・社会的・
        // 文化的状況:のなかで二つとも社会の関係するものしかありませんよね？」「すべてに割り振って
        // くれるのはありがたいですが少し文章がみずらくなってしまっています」）。この見出しだけは
        // 生の文字列を本文に埋め込むのをやめ、家族構成・同居家族・キーパーソンに関する内容だと
        // 分かる場合だけ、既存の見出しラベル「家族関係」を付与する（AIプロンプト側の「短い見出し語を
        // 自分で考えてfieldLabelに入れる」という指示と同じ考え方を、ローカル抽出でも再現できる
        // 範囲で行う）。それ以外の内容は見出しを補わずそのままの文章として残す（情報を捨てるわけ
        // ではなく、単に対応の不正確な前置きを付けない）。
        if (currentSectionLabel && !item.fieldLabel && !hasOwnFieldLabelPrefix(item.text)) {
          if (currentSectionLabel === AMBIGUOUS_MULTI_TOPIC_SECTION_LABEL) {
            const inferredLabel = inferFieldLabelFromSectionContent(currentSectionLabel, item.text);
            if (inferredLabel) item.fieldLabel = inferredLabel;
          } else {
            item.text = cleanExtractedPhrase(`${currentSectionLabel}: ${item.text}`);
          }
        }
      });

      // 記録の冒頭の「事例紹介」（氏名・現病歴・既往歴・生活習慣など）は日時が書かれていないため「日時不明」に
      // なっていた（利用者からの指摘：患者36「現病歴や診断名は入院前や受傷時とする方が時系列として正確」）。
      // 後ろに日時の分かる記録がある場合に限り、最初の日時より前の「日時不明」のカードは「入院前」にする
      // （「入院日:」「入院時の〜」で始まるものは「入院時」）。記録全体に日時が1つも無い文章はそのままにする。
      const firstDatedIdx = extracted.findIndex(it => !it.isUnnecessaryBoilerplate && it.timestamp && it.timestamp !== '日時不明');
      // 冒頭が患者紹介（氏名・現病歴・既往歴・診断名などの見出し）のときだけにする（看護記録の途中から
      // 貼り付けた文章の冒頭の指示・所見まで「入院前」にしないため）
      const PROFILE_LABEL_REGEX = /^(?:氏名|年齢|性別|現病歴|既往歴|診断名|病名|生活歴|主訴|入院日|入院目的|家族構成|家族歴|職業)$/;
      const hasProfileIntro = firstDatedIdx > 0 && extracted.slice(0, firstDatedIdx).some(it => !it.isUnnecessaryBoilerplate &&
        ((it.fieldLabel && PROFILE_LABEL_REGEX.test(it.fieldLabel)) || /^(?:氏名|現病歴|既往歴|診断名|主訴|入院日)\s*[:：]/.test(it.text)));
      if (hasProfileIntro) {
        // 【改善点ファイル・患者36】主訴は受診・入院の際に聞き取った情報なので「入院時」。現病歴の中の「〜と診断され、
        // 入院となった」「入院後すぐに牽引開始」「手術予定」は入院前ではなく「入院時」（その文から同じ行の終わりまで）。
        let admittedLine = null;
        for (let k = 0; k < firstDatedIdx; k++) {
          const it = extracted[k];
          if (it.isUnnecessaryBoilerplate || (it.timestamp && it.timestamp !== '日時不明')) continue;
          let ts = /^(?:入院日|入院時|入院目的|入院の経緯)/.test(it.text) || it.fieldLabel === '入院日' ? '入院時' : '入院前';
          if (it.fieldLabel === '主訴' || /^主訴\s*[:：]/.test(it.text)) ts = '入院時';
          if (/と診断され|入院となっ|入院後|入院し(?:た|て)|手術の説明/.test(it.text)) { ts = '入院時'; admittedLine = it._line === undefined ? null : it._line; }
          else if (admittedLine !== null && it._line === admittedLine) ts = '入院時';
          it.timestamp = ts;
        }
      }
      // OCRで読み取れなかった検査値の残り（かな・漢字が無く「.」ばかりの行）は、検査値として切り出された行でも不要な情報にする
      extracted.forEach(it => { if (!it.isUnnecessaryBoilerplate && isOcrNoiseText((it.text || '').trim())) it.isUnnecessaryBoilerplate = true; });
      mergeSameTimeVitals(extracted);
      mergeVitalCheckHeadings(extracted);
      groupComparisonLabTables(extracted);
      attachStaffQuestions(extracted);
      splitFamilySpeechSentences(extracted);
      splitMixedSubjectiveObjective(extracted);
      mergeDanglingObservations(extracted);
      extracted.forEach(item => { delete item._line; delete item._lab; });
      return extracted;
    }

    // ローカル抽出（APIキー未設定時）でのS/O/不要判定ロジック。単体テストできるよう、分類ボタンの
    // クリックハンドラ内から独立した関数として切り出している。
    // 分類の優先順位: ①学習結果(完全一致 → 表記ゆれ類似) → ②見出しラベル → ③固定ルール
    // ①②は呼び出し側で解決済みのuserLearned・chunk.fieldLabelとして渡される。
    // ③のうち、事例プリント自体の見出し（基礎情報・実習科目名等）は、学習結果・見出しラベルによる
    // 上書きがない限り、内容を問わず「不要な情報」に分類する。
    // 表情・笑顔・顔色・様子などは、患者の発言そのものではなく看護師が客観的に観察・評価した所見なのでOデータとして扱う。
    // 身長・体重・BMIなどの身体計測値、知的能力・理解度の評価も、患者本人の発言ではなく
    // 医療従事者による客観的な測定・評価のため同様にOデータとして扱う。
    // 診断名・検査結果（病期・Stage等）、医療従事者の指示・処置内容（点滴・留置・ドレーン等）も、
    // 患者本人の発言ではなく記録上の客観情報のためOデータとして扱う（利用者からの指摘：
    // 「診断、検査の結果だからO」「指示もOデータ」）。また、章タイトル書き込み処理により
    // 血液検査・画像検査等・治療方針治療内容等・知的能力身体的能力等の章タイトルが先頭に
    // 付与されたカードも、患者の発言でない限り同様に客観的な記録情報としてOデータとする
    // （利用者からの指摘：「客観的にかかれているのでO」）。
    // 【原因と修正】以前は上のいずれの手がかり（見出しラベル・検査値/バイタル・特定のキーワード等）
    // にも一致しない文章を"unclassified"（S/O未分類）のまま残していた。しかしこのアプリ自身の
    // 分類基準（DEFAULT_NOTEBOOK_CONTENTの【S/O判定】: 「実習記録は基本的に記録者が客観的に
    // 記載したものであり、カギ括弧内の患者本人の発言や「訴え」「発言」等でない限りOデータとして
    // 扱う」）が示すとおり、患者本人の発言・訴えでない文章は原則すべてOデータであるべきで、
    // "unclassified"という第3の状態は本来存在しない。この結果、見出しラベルが（同じ見出しの
    // 続きの文でラベルを繰り返していない等の理由で）付いていない普通の観察記録の文章が
    // 大量にS/O未分類のまま残ってしまっていた（利用者からのアップロード文書で発覚：
    // 「昼食は外食が多く、仕事が忙しく短時間で済ませるようにしている。」「【検温時状況】朝食
    // 全量摂取…」等、多数の客観的な記録文がunclassifiedになっていた）。患者本人の発言・訴えの
    // 手がかりが無い文章は、キーワードの有無を問わず常に"o"を既定値とする。
    // 【背景】利用者からの指摘：「客観的な観察結果（Oデータ）と患者の発言（Sデータ）が
    // 1つの文に混在しているにもかかわらず、全体に[S]タグが付与されている」。
    // 例：「バイタルサインの測定。看護師から手術オリエンテーション(合併症とその予防方法)を
    // 受ける。(学生同席)トライボールによる呼吸訓練を実施。腹部を押さえた起き上がりの練習を
    // 行う。「安静にしていると良くないんですね。」「痛かったら、これ、自分でできるかな?」と
    // 話す。」のように、複数の客観的な看護行為・観察（バイタル測定、オリエンテーション実施、
    // 呼吸訓練実施、起き上がり練習）が続いた最後に患者の発言が添えられている文章は、
    // これまで「引用符や「話す」等の語が文中のどこかに1つでもあれば、それより前の内容の
    // 分量に関わらず全体をSと判定する」という単純な規則だったため、看護行為の記述が大半を
    // 占める文章まで丸ごとSになってしまっていた。
    // 「まとめる例」の方針（1つの場面についての続きの記述は分割せず1つのtextにまとめる）は
    // 維持したまま、S/Oの判定だけを「患者の発言・訴えの手がかり（引用符・「話す」等）が
    // 現れるより前に、実質的な内容を持つ文（句点区切りで4文字以上）がいくつあるか」で見る
    // ように変更する。このアプリ自身の分類基準（DEFAULT_NOTEBOOK_CONTENTの【S/O判定】）が
    // 定めるとおり、記録は原則Oであり患者本人の発言・訴えの部分だけが例外的にSなので、
    // 発言の手がかりの前に看護行為・観察の文が2文以上続いていれば、文章全体は看護行為の
    // 記録（O）が主体とみなす。0〜1文（＝「○○と話す。」のように発言そのものがほぼ全てを
    // 占める場合）は、これまで通りSのままとする（回帰確認テスト参照）。
    // 「」の中身が「2-3」「5-6」のように数字・記号だけの場合は、ペインスケール等の評価値を
    // 括弧で囲んだだけで、患者本人の発言ではない（利用者からのアップロード文書で発覚：
    // 「安静時ペインスケール「2-3」」がSデータになっていた）。中にかな・漢字を含む場合だけを発言とみなす。
    const S_QUOTE_REGEX = /["「][^"「」]*[ぁ-んァ-ヶ一-龠々][^"「」]*["」]/;
    // 「疼痛訴えなく」「呼吸困難訴えなし」のように、訴え・発言が「無い」ことは、看護師が
    // 観察・確認した客観的な所見であり、患者の発言（Sデータ）ではない（利用者からのアップロード
    // 文書で発覚：これらがSデータになっていた）。直後に否定が続く場合は発言の手がかりにしない。
    // 「話す」は「〜と話す」「」話す」のときだけ発言の手がかりにする（「2語文〜3語文で話す」「笑顔で話す」は様子の観察。実習生の記録のテスト）
    const S_KEYWORD_REGEX = /(?:訴え|発言|(?:と|」)\s*話す)(?!\s*(?:なし|無し|なく|無く|ない|無い|は(?:なし|無し|ない|無い|なく)|も(?:なし|なく|ない)))/;
    function countSubstantiveLeadSentences(leadText) {
      return leadText.split('。').map(s => s.trim()).filter(s => s.length >= 4).length;
    }
    // 医師・看護師等の医療者の言葉を「」で書いたもの（「本人へ主治医より「経過良好」と説明あり」
    // 「「順調です」と医師より説明」）は、患者本人の発言ではなくOデータ（利用者からの指摘：患者37。
    // この説明のカードがSデータの列に入り、Oデータの続きのカードから離れて見えなくなっていた）。
    // S/Oの判定では、医療者の言葉の「」を取り除いてから患者の発言があるかを見る。
    const STAFF_QUOTE_REGEXES = [
      /(?:夜勤|日勤|担当|受け持ち)?(?:主治医|担当医|執刀医|医師|Dr\.?|看護師|Ns\.?|NS\.?|理学療法士|作業療法士|PT|OT|薬剤師|栄養士)(?:さん)?(?:より|から|が|は)[^「」。]{0,15}(?:「[^」]*」[、・\s]*)+/g,
      /「[^」]*」と(?:主治医|担当医|執刀医|医師|Dr\.?|看護師|Ns|理学療法士|作業療法士|PT|OT)[^。]{0,6}(?:説明|言われ|伝え|指導)/g
    ];
    function stripStaffQuotes(text) {
      // 「看護師が声をかけると、「…」と話した」「看護師が尋ねると「…」」のように、看護師の働きかけへの本人の答えは
      // 看護師の発言ではない（7事例のテストで、本人の発言がOになっていた）
      return STAFF_QUOTE_REGEXES.reduce((t, re) => t.replace(re, m => (/(?:ると|たら|ところ|際に?|後)[、,]?\s*「/.test(m.slice(0, m.indexOf('「') + 1)) ? m : m.replace(/「[^」]*」/g, ''))), text);
    }
    function predictSOTypeFromNarrative(rawText) {
      const text = stripStaffQuotes(rawText);
      const quoteMatch = text.match(S_QUOTE_REGEX);
      const keywordMatch = text.match(S_KEYWORD_REGEX);
      if (!quoteMatch && !keywordMatch) return 'o';
      const firstIndex = Math.min(...[quoteMatch, keywordMatch].filter(Boolean).map(m => m.index));
      return countSubstantiveLeadSentences(text.slice(0, firstIndex)) >= 2 ? 'o' : 's';
    }
    function predictLocalItemType(chunk, cleanedText, userLearned) {
      return userLearned?.preferredType
        || (chunk.fieldLabel ? (FIELD_LABELS.find(f => f.key === chunk.fieldLabel)?.type || 'o') : null)
        || (chunk.isUnnecessaryBoilerplate ? 'unnecessary' : null)
        || predictSOTypeFromNarrative(cleanedText);
    }

    // 簡易ルール分類（AIを使わない分類）で、1枚のカードのタグとS/O/不要を決める。
    // 「分類開始」ボタンと、分類結果の自動チェック（classifyTextByRules・tests/golden-classification）で
    // 同じ処理を使う（2か所に同じ判定を書くと、片方だけ直して結果がずれるため）。
    function computeLocalTagsAndType(chunk, cleanedText, userLearned) {
      // タグは複数持てるため、固定キーワード辞書での判定結果と過去の学習結果のどちらかを切り捨てず、
      // 両方を合わせて採用する（固定ルールを土台に、学習結果で見つかったタグを積み増す統合方式。
      // AI抽出経路でのNotebookLM基準×学習結果の統合と同じ考え方）。
      const ruleHIds = detectMultipleHendersonTags(cleanedText);
      const detectedHIds = Array.from(new Set([...ruleHIds, ...(userLearned?.preferredHendersonIds || [])]));
      // 検査値・バイタルサインは、体力面の指標として原則ヘンダーソン2.食事（栄養・代謝状態）のタグも付与する
      // （この文章について既に学習結果がある場合は、あえて外した等のユーザーの判断を尊重してここでは追加しない）。
      // chunk.isLabOrVitalは項目名の直後に数値がある場合しか立たないため、数値を伴わず項目名だけが
      // 文章中に出てくる場合にも同様に付与できるよう、LAB_ITEM_NAME_REGEXでの判定も合わせて見る。
      if ((chunk.isLabOrVital || mentionsLabItemName(cleanedText)) && !hasLearnedSignal(userLearned)) labCategoryTags(cleanedText).forEach(h => { if (!detectedHIds.includes(h)) detectedHIds.push(h); });
      // 見出しラベル（家族関係・保険は固定、診断名は病名から推測）に応じた初期提案タグも同様に補う
      if (chunk.fieldLabel && !hasLearnedSignal(userLearned)) {
        fieldLabelHintTags(chunk.fieldLabel, cleanedText).forEach(hid => { if (!detectedHIds.includes(hid)) detectedHIds.push(hid); });
      }
      // 【タグ未設定の見直し】どの項目のキーワード・見出しにも当たらなかったときの補い
      //  ・「事例:B氏(65歳・女性)」「A氏 76歳 女性 血液型 A Rh+」のような年齢・性別の基本情報 → 年齢と同じ 9.環境
      //    （利用者からの指摘・患者36：「氏名・76歳・血液型」は4.姿勢には明らかに不要）
      //  ・「疾患: 右アテローム血栓性脳梗塞」のように病名が書かれた行 → 診断名と同じく病名から推測（DIAGNOSIS_TAG_HINTS）
      if (detectedHIds.length === 0 && !hasLearnedSignal(userLearned)) {
        // 子ども・妊婦の「生後5か月 男児」「3歳2か月 女児」「13歳 女子」「29歳 初妊婦」も年齢と性別の基本情報（実習生の記録のテスト）
        if (/\d{1,3}歳|生後\s*\d+\s*(?:か月|ヶ月|カ月|ケ月|日)|日齢\s*\d+|(?:ちゃん|くん)\s*[(（]/.test(cleanedText) && /(?:男性|女性|男児|女児|男子|女子|男の子|女の子|初妊婦|経妊婦|初産婦|経産婦|妊婦|褥婦)/.test(cleanedText) && cleanedText.length <= 40) FIELD_LABEL_DEFAULT_TAGS['年齢'].forEach(h => detectedHIds.push(h));
        // 同じ行に病名もあれば（「Qちゃん 4歳 女児 気管支肺炎」）、病名からの推測も合わせる
        detectDiagnosisTagHints(cleanedText).forEach(h => { if (!detectedHIds.includes(h)) detectedHIds.push(h); });
      }
      // 薬の名前が書かれたカード（「内服：アムロジピン 5mg」「リトドリン 持続点滴」）は、薬の分類から関係の深い項目も補う
      // （js/14 の薬の情報。学習結果がある場合は、利用者の判断を尊重して足さない）
      if (!hasLearnedSignal(userLearned) && typeof drugTagsForText === 'function' && /(?:内服|処方|点滴|注射|投与|持続|静注|使用|貼付|服薬|頓用|mg|単位|ml\/h)/i.test(cleanedText)) {
        drugTagsForText(cleanedText, { primaryOnly: true }).forEach(h => { if (!detectedHIds.includes(h)) detectedHIds.push(h); });
      }
      // 学生がヘンダーソンの項目の見出しの下に書いた情報には、その項目のタグも付ける
      if (chunk.needHint && !hasLearnedSignal(userLearned) && !detectedHIds.includes(chunk.needHint)) detectedHIds.push(chunk.needHint);
      let predictedType = predictLocalItemType(chunk, cleanedText, userLearned);
      // 発言と観察を分けたカードは、分けたときの役割（S／O）のとおりにする（学習結果があればそちらを優先）
      if (chunk.soRole && !hasLearnedSignal(userLearned)) predictedType = chunk.soRole;
      return { detectedHIds, predictedType };
    }
    // 学習結果を使わない、キーワード等の固定ルールだけでの分類結果（「分類開始」の簡易ルール分類で
    // 学習データが1件も無い場合と同じ結果）。分類結果の自動チェック（改善提案4）で、プログラムを
    // 直したときに前の結果から変わったカードを見つけるために使う。
    // 「肢位:」「疼痛:」のような見出しだけのもの（中身は下の行のカードに「肢位: 〜」として入る）は、
    // 何の情報も無い「不必要」のカードとして並べても邪魔なだけなので、カードにしない
    function isHeadingOnlyChunk(chunk, cleanedText) {
      return !!chunk.isUnnecessaryBoilerplate && isEmptyColonHeaderLine(cleanedText);
    }
    // 同じ場面（sceneId）から分けたS（発言）のカードに、話題のタグ（10以外）が1つも付かなかった場合は、
    // 同じ場面のO（観察）のカードのタグを付ける（「「動いてないからお腹が張っている」」だけではタグが付かないが、
    // 同じ場面の「排便なし…排ガスあり」から3.排泄と分かる）。総合アセスメント表の欄も同じ場面のカードに合わせる。
    function applySceneTagInheritance(items) {
      const byScene = new Map();
      items.forEach(it => { if (it.sceneId) { if (!byScene.has(it.sceneId)) byScene.set(it.sceneId, []); byScene.get(it.sceneId).push(it); } });
      byScene.forEach(group => {
        const objectiveTags = Array.from(new Set(group.filter(g => g.type === 'o').flatMap(g => g.hendersonIds || []))).filter(h => h !== 10);
        group.filter(g => g.type === 's').forEach(g => {
          const own = (g.hendersonIds || []).filter(h => h !== 10);
          if (own.length || !objectiveTags.length) return;
          const partner = group.find(x => x.type === 'o');
          objectiveTags.forEach(h => {
            if (!g.hendersonIds.includes(h)) g.hendersonIds.push(h);
            if (g.assessmentCols && partner && partner.assessmentCols) g.assessmentCols[h] = g.assessmentCols[h] || partner.assessmentCols[h] || 'unclassified';
          });
          g.hendersonIds.sort((a, b) => a - b);
        });
        // 反対に、観察（O）のカードにタグが1つも無い場合は、同じ場面の発言（S）のタグを付ける
        // （「入院時の様子: 初めての入院・手術で戸惑いも多い様子だった」＝10）
        const subjectiveTags = Array.from(new Set(group.filter(g => g.type === 's').flatMap(g => g.hendersonIds || [])));
        group.filter(g => g.type === 'o' && (!g.hendersonIds || g.hendersonIds.length === 0)).forEach(g => {
          const partner = group.find(x => x.type === 's');
          g.hendersonIds = subjectiveTags.slice().sort((a, b) => a - b);
          if (g.assessmentCols && partner && partner.assessmentCols) subjectiveTags.forEach(h => { g.assessmentCols[h] = partner.assessmentCols[h] || 'unclassified'; });
          if (g.hendersonIds.length) g.patientBackground = null;
        });
      });
      return items;
    }
    function classifyTextByRules(text) {
      const src = (text || '').trim().normalize('NFKC');
      const out = [];
      // カードの文章の整え（cleanExtractedPhrase）も、この文章を元に子どもの記録か等を決める（extractionContext）
      withExtractionContext(src, () => groupClinicalPhrasesWithTimestamps(src).forEach(chunk => {
        const cleanedText = cleanExtractedPhrase(chunk.text);
        if (cleanedText.length < 2 || isBareFieldHeaderOnly(cleanedText) || isHeadingOnlyChunk(chunk, cleanedText) || out.some(i => i.text === cleanedText && i.timestamp === (chunk.timestamp || '日時不明'))) return;
        const { detectedHIds, predictedType } = computeLocalTagsAndType(chunk, cleanedText, null);
        out.push({ text: cleanedText, timestamp: chunk.timestamp || '日時不明', type: predictedType, hendersonIds: detectedHIds.slice().sort((a, b) => a - b), fieldLabel: chunk.fieldLabel || null, ...(chunk.sceneId ? { sceneId: chunk.sceneId } : {}), ...(chunk.labRows ? { labRows: chunk.labRows } : {}) });
      }));
      return applySceneTagInheritance(out);
    }

    // 「分類開始」の分類方法（'rules'＝ルールで分類（AIなし）／'ai'＝AIで分類）。このブラウザに覚えておく。
    const CLASSIFY_MODE_STORAGE_KEY = 'nursing_classify_mode';
    function getClassifyMode() {
      try { return localStorage.getItem(CLASSIFY_MODE_STORAGE_KEY) === 'ai' ? 'ai' : 'rules'; } catch (e) { return 'rules'; }
    }
    function renderClassifyModeSwitch() {
      const mode = getClassifyMode();
      document.querySelectorAll('[data-classify-mode]').forEach(btn => {
        const on = btn.getAttribute('data-classify-mode') === mode;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      const note = document.getElementById('classify-mode-note');
      if (note) {
        note.textContent = mode === 'ai'
          ? (globalAppData.apiKey ? 'Gemini が基準ノートを根拠に分類します（個人情報は伏せ字にして送ります。失敗したらルールで分類）' : 'APIキーが未設定です。「API設定」でキーを保存してください')
          : 'AIを使わず、キーワード等のルールだけで分類します';
        note.classList.toggle('text-[var(--brick)]', mode === 'ai' && !globalAppData.apiKey);
      }
    }
    window.setClassifyMode = function(mode) {
      try { localStorage.setItem(CLASSIFY_MODE_STORAGE_KEY, mode === 'ai' ? 'ai' : 'rules'); } catch (e) { /* 保存できなくても今回は切り替える */ }
      renderClassifyModeSwitch();
    };
    renderClassifyModeSwitch();

    document.getElementById('btn-start-classify').addEventListener('click', async () => {
      // OCRやスクリーンショット由来のテキストは全角数字（０-９）で日付・時刻が書かれている場合があり、
      // \dベースの正規表現（TIME_MARKER_REGEX・DATE_ONLY_REGEX・LAB_REGEX_SOURCE等）が半角数字しか
      // マッチしないため、全角文字を半角に正規化してから抽出処理に渡す（NFKC正規化）。
      const text = DOM.sourceText.value.trim().normalize('NFKC');
      if (!text) return showToast('文章を入力してください', 'warn');
      if (typeof resetSourcePaneLayout === 'function') resetSourcePaneLayout();
      const cp = getCurrentPatient();
      // 「AIあり」でキーが無いときは、今のカードを置き換える前に案内する（以前は置き換えを選んだ後にやめてしまい、カードが消えていた）
      if (getClassifyMode() === 'ai' && !globalAppData.apiKey) {
        const st = await requireApiKey('AIありで分類', { fallbackLabel: 'AIなしで分類する' });
        if (st !== 'fallback') return;
        window.setClassifyMode('rules');
      }

      // 既にカードがある患者で分類し直す場合、以前は今のカードを残したまま新しいカードを「追加」する
      // だけだったため、分類ルールを直した後に分類し直しても、直す前の古いカード（例：「入室」だけの
      // カード）がそのまま残り、直っていないように見えていた（利用者からの修正依頼：「入室だけで情報
      // カードになってるのがおかしい」）。今のカードを置き換えるか、残したまま追加するかを選べるようにする。
      if (cp.items.length > 0) {
        // 分類し直す前のカードを記録しておく（「変更点の比較」で比べられる。js/13）
        if (typeof checkpointBeforeClassify === 'function') checkpointBeforeClassify(cp);
        const editedCount = cp.items.filter(i => (Array.isArray(i.editLog) && i.editLog.length > 0) || i.predictionSource === 'confirmed').length;
        const answer = await openDialog({
          title: '今あるカードをどうしますか？',
          message: `この患者には既に${cp.items.length}枚のカードがあります。\n` +
            `「置き換えて分類」：今のカードを消してから分類し直します。古い分類結果が残らないので、分類ルールの修正後はこちらがおすすめです。` +
            (editedCount ? `（うち${editedCount}枚は手で編集・確認したカードです。置き換えると本文の手直しは消えますが、S/O・タグの学習結果は次の分類に引き継がれます）` : '') +
            `\n「追加して分類」：今のカードを残したまま、新しく見つかった分だけ追加します。`,
          confirmLabel: '置き換えて分類',
          secondaryLabel: '追加して分類'
        });
        if (answer === null) return;
        if (answer === true) {
          cp.items.forEach(i => markItemDeleted(cp, i.id));
          cp.items = [];
          selectedCardIds.clear();
          if (highlightedSourceItemId != null) clearSourceHighlight(false);
        }
      }

      // 【利用者からの要望】「分類開始はAIあり・なしの二つの方法を使用するように」。「分類開始」ボタンの
      // 下の切り替え（getClassifyMode）で、
      //   ・ルールで分類（AIなし）：キーワード等のルールだけで分類する（既定。結果が毎回同じになる）
      //   ・AIで分類：Gemini に基準ノートを根拠に分類させる（APIキーが必要。失敗したらルールで分類する）
      // を選ぶ。AIに送る前の個人情報の伏せ字（callGeminiAI）は、AIで分類するときも同じく行う。
      const classifyMode = getClassifyMode();
      if (classifyMode === 'ai' && !globalAppData.apiKey) {
        return showToast('「AIあり」の分類にはAPIキーが必要です。右上の「︙」→「API設定」でキーを保存するか、「AIなし」を選んでください', 'warn');
      }
      if (classifyMode === 'ai' && globalAppData.apiKey && globalAppData.notebookContent) {
        showToast('登録された基準をもとに、AIで分類しています...', 'info');
        try {
          const prompt = `あなたは看護アセスメント支援AIです。以下の「基準ノート」（登録された分類基準）を根拠として、カルテ・記録から重要な所見、患者発言、検査値を抽出してJSON形式（配列）で返してください。
各要素には "text", "timestamp", "type" ("s" または "o" のいずれか。"unnecessary"は記録用紙自体の書式等、患者のアセスメントに使えない場合のみ), "hendersonIds" (1〜14の適切な複数タグ配列。関連する項目がない場合は空配列), "fieldLabel" (該当する場合のみ ${FIELD_LABEL_KEYS} のいずれか1つ、またはそれらに当てはまらなければあなた自身が内容から考えた2〜6文字程度の短い見出し語、いずれにも該当しなければ null) を含めてください。
※「〜と話すが、〜」などの接続表現や患者発言は分断せず、前後の文脈がつながった1つの自然な文章として抽出してください。
※血液検査データは正しい単位と基準値レンジを記載してください。
※「現病歴：」「既往歴：」「家族関係：」「生活歴：」「診断名：」「保険：」「治療方針：」「治療内容：」「学歴：」「アレルギー：」のように見出し付きで記載されている情報は、見出し部分を除いた本文のみを text とし、見出し名を fieldLabel に入れて1項目として切り出してください（日時の切り出しと同じ要領です）。治療方針・治療内容は前後に続く説明文も含めて、途中で切らずに1つのまとまった文章として抽出してください。「家族構成：」は「家族関係」の、「診断：」は「診断名」の言い換えとしてよく使われるため、見出し語自体は違っても fieldLabel はそれぞれ本来の表記（「家族関係」「診断名」）で統一してください。
※家族構成・同居家族・キーパーソン、家族歴（親族の病歴・死因等）、学歴、生活習慣（食生活・嗜好品・喫煙・飲酒・睡眠・運動習慣）、アレルギーの有無、ADLの基礎的な自立度など、入院中に日々変わるものではなく患者の背景として一度記録すれば足りる情報は、明示的な見出し語が無い地の文で書かれていても、内容から読み取れる場合は同様に fieldLabel を付けてください（家族構成・家族歴・キーパーソンは「家族関係」、学歴・生活習慣は該当する「学歴」「生活歴」、アレルギーは「アレルギー」）。ただし、その場のバイタルサイン・処置内容・患者の発言など、日々の観察記録として書かれている文はこの対象にせず、通常どおりhendersonIds・typeで判定してください。
※「7月3日(金)」「11:46」のような日付・時刻だけの断片は、それ単体では意味のある情報にならないため、text として抽出しないでください（その日時は前後の所見の timestamp として扱ってください）。前後の文章とつながらず日付・時刻しか残らない場合は、その項目自体を出力しないでください。
※血液検査データ・バイタルサイン（WBC, CRP, Hb, BUN, Cre, Na, K, 体温, 血圧, 脈拍, 呼吸数, SpO2 等）は、項目名と数値を1つのtextにまとめてください。hendersonIdsは、その検査が何を見る指標かで決めてください：SpO2・血圧・脈拍・呼吸数は1(呼吸)、Cre・BUN・eGFR・尿検査は3(排泄)、WBC・CRP・体温は7(体温)、PT・APTT・Dダイマー・血小板は9(環境：出血・血栓のリスク)、TP・ALB・Hb・RBC・Ht・血糖・HbA1c・肝機能・電解質などの栄養・代謝の指標は2(食事)。腎機能・炎症・凝固・酸素化の指標に2(食事)を付けないでください。項目名と数値が離れて書かれていても、同じ所見であれば1つのtextにまとめてください。ただし「K」「Na」等の英字・記号は、文中で「Kさん」「N氏」のように人物の頭文字（イニシャル）として使われている場合は検査値として扱わず、通常の文章の一部としてください。前後の文脈（数値が続くか、氏名の敬称が続くか等）から検査値か人物のイニシャルかを判断してください。
※hendersonIdsの判断の注意：疼痛（ペインスケール・創痛・鎮痛薬）は9(環境：安楽)、深部静脈血栓症の予防・観察（弾性ストッキング・フットポンプ・ホーマンズ徴候・足関節の底背屈運動）は9（弾性ストッキングは6も可）、脱臼予防の外転枕・肢位は4(姿勢)、創部の発赤・熱感・腫脹・排膿などの局所の所見は9（7の体温ではない）、出血量は9、リハビリの計画・訓練は4です。「体重をかける」は荷重（4）であり体重（2）ではありません。「安静時」は評価の条件であり安静度（4）ではありません。「不安定」はふらつき（4）であり不安（10）ではありません。患者の発言を含むだけで10(コミュニケーション)にせず、発言の中身が食事・排泄など別の項目についてならその項目にしてください。10は気持ち（怖い・不安・情けない等）や疑問・心配の表出、意思疎通そのものの情報に付けてください。
※「家族関係：」「保険：」は患者を取り巻く社会的・経済的環境の情報のため、hendersonIdsに9(環境)を含めてください。
※「職業：」は仕事・役割に関する情報のため、hendersonIdsに12(仕事)を含めてください。「デスクワーク」等、姿勢・活動量に影響する記載があれば4(姿勢)もあわせて含めてください。typeは患者本人の発言ではなく記録上の客観情報のため"o"としてください。
※身長・体重・BMI等の身体計測値、知的能力・理解度の評価（「理解良好」等）は、患者本人の発言ではなく医療従事者による客観的な測定・評価のため、typeを"o"としてください。身長・体重・BMIが続けて記載されている場合は1つのtextにまとめても構いません。
※「診断名：」「既往歴：」は、その病名が影響する身体機能に対応するヘンダーソンの項目をhendersonIdsに含めてください（例：糖尿病→2食事・14学び、高血圧や心疾患・呼吸器疾患→1呼吸、腎疾患→3排泄、認知症や精神疾患→10コミュニケーション、骨折や麻痺等の運動器・脳血管疾患→4姿勢、感染症→9環境、胆石症等の胆道・膵疾患→2食事）。当てはまらない場合は病名の内容から最も関連する項目を判断してください。
※「基礎情報」「実習・患者基本情報」「実習科目名」「実習期間」「学籍番号」「学生氏名」「指導者氏名」「提出日」「記載日」「(バイタルサイン)」など、記録用紙（事例プリント）自体の書式・提出情報や、値を伴わない単なる見出し語は、実際に書かれている値が何であっても患者のアセスメントに使える所見ではないため、type を必ず "unnecessary" としてください。「年齢・社会的・文化的状況」「知的能力・身体的ならびに身体的能力」「受け持つまでの経過と状態」「身体的状態:」のように、複数の項目名を「・」でつないだだけの中位の章タイトルや、見出し語の後にコロンだけがあって同じ行に値が無い行も同様です（実際の値は次の行以降の「職業：」「身長：」等の個別の見出しに書かれています）。この種の見出し行は、「年齢」「社会的」「文化的状況」のように「・」で区切って複数のtextに分割して出力しないでください（見出し全体をまとめて1件のunnecessaryとして出力するか、出力しないでください）。
※この種の中位の章タイトルが実際に後続の複数行の情報をまとめて説明している場合（例：「血液検査」の後に各検査値が続く、「年齢・社会的・文化的状況」の後に年齢・職業・家族構成等が続く）、章タイトルの文字列をそのまま後続の各項目のtextの先頭に付け加えるのはやめてください（「年齢・社会的・文化的状況: 」のような長く漠然とした前置きが並ぶと読みにくくなります）。代わりに、後続の各項目1件1件の内容を読み取り、その1件に最もふさわしい短い言葉（2〜6文字程度。例：「家族構成」「職業」「既往歴」「術前状態」「知的能力」）をあなた自身で考えて fieldLabel に入れてください。「現病歴」「既往歴」「家族関係」「生活歴」「診断名」「保険」「治療方針」「治療内容」「学歴」「アレルギー」に該当する内容であればそれらの表記をそのまま使い、どれにも当てはまらない場合のみ新しい短い言葉を作ってください（文章そのものや句読点を含む長い表現は fieldLabel にしないでください）。すでに個別の見出し（「職業：」等）を持つ項目には、章タイトルに基づく別の fieldLabel を重ねて付けないでください。章タイトル行自体は引き続きtype: "unnecessary"の1件として出力し、後続の各項目とは別に扱ってください。
※「患者背景」「基本情報」のような独立した type や分類は存在しません。抽出したすべての項目は、必ず type を "s"（患者本人の発言・訴え）か "o"（それ以外＝カルテ・記録上の客観情報）のどちらかにしてください。年齢・既往歴・診断名・家族構成・職業・保険のような、カルテやアナムネから得られる基本情報は、患者自身の発言ではなくカルテ情報としての客観的事実のため、原則すべて "o" としてください（例外：「俺は管理職だから」のように患者本人がその内容を自分の言葉で語っている場合のみ "s"）。
※「術前」「術中」「術後」「入院前」「入院時」は、周術期の記録でよく使われる時系列の区切りです。日付・時刻と同様にtimestampとして扱い、text本体には含めないでください。「術中・術後」のように複数の区切りがまとめて書かれている場合はそのままtimestampとしてください。また「【術前】」のように、区切りだけが独立した見出し行になっており、その下に箇条書き（・○●等の記号で始まる複数行）で所見が続く形式の場合、その箇条書きの各項目すべてに同じtimestampを適用してください（見出し行自体はtextとして抽出しないでください）。
※timestampには日も含めてください。「手術当日」「術後1日目」「翌日」「＜実習2日目（入院2日目、手術前日）＞」のような日の区切りの後の時刻は、「12:00」だけにせず「術後1日目 12:00」のように「日 時刻」の形にしてください（異なる日の同じ時刻を区別するため）。「翌日」は前の日の次の日（手術当日の翌日＝術後1日目、術後1日目の翌日＝術後2日目）です。日の区切りが無くても時刻が大きく戻った（22:00の次に8:00）ときは次の日です。「術後排便なし」「入院時の様子:」「術前MMT:」のように「術後」「入院時」「術前」の直後に語が続くものは文の一部なので、timestampにせずtextに残してください。記録の冒頭の事例紹介（氏名・現病歴・既往歴・診断名・生活習慣など、日時の書かれていない情報）はtimestampを「入院前」、入院日・入院時の様子・主訴、現病歴のうち「〜と診断され入院となった」「入院後すぐに〜開始」「手術予定」は「入院時」、「入院から手術までの経過」の下は「術前」としてください。「〜あるも」「〜ものの」で途切れた観察は、次の観察と1つのtextにまとめてください。
※患者の発言（「」）と看護師の観察が1つの文にまとめて書かれている場合（例：「ベッドアップし、昼食摂取「あまり食欲がない」と半分のみ摂取」）は、何の場面の発言か分かるように同じ文の観察を（場面：…）として添えた発言のtext（type "s"：「あまり食欲がない」（場面：ベッドアップし、昼食摂取、半分のみ摂取））と、発言を除いた観察のtext（type "o"：「ベッドアップし、昼食摂取、半分のみ摂取」）の2件に分け、同じtimestampにしてください（同じ場面の情報として並べて表示します）。医師・看護師の説明の「」や「ああ」のような短い返事は分けません。
※同じ時刻に1行で書かれたバイタルサイン（体温・血圧・脈拍・呼吸・SpO2）は1件のtextにまとめてください（例：「体温37.6度、血圧140/70mmHg、脈拍80回/分整、呼吸20回/分、SpO2 98%」）。「酸素OFF、硬膜外麻酔抜去、フットポンプOFF」のように同じ時刻の処置・指示の列挙も1件にまとめてください。
※箇条書きの記号（・○●◯◎■◆等）が行頭に付いている場合、それは所見の内容ではないため、textには含めないでください。
※「■ 嗜好品」「■ 活動・睡眠・清潔・更衣」のように■□◆で始まりコロン・値を伴わない区切り見出しや、「1. 生活習慣・身体的機能（左ページ）」「4. 手術当日」のような番号付きの章見出しは、所見を含まないため type: "unnecessary" としてください（「・」で分割して「活動」「睡眠」のような見出し語だけのtextにしないでください）。「術後1日目より受け持つ」のような学生の受け持ち開始の記述も "unnecessary" です。
※検査結果の表の列見出しが「基準値」ではなく「正常値」「基準範囲」と書かれている場合も同じ扱いです。基準値の列が「<0.2mg/dl」のような不等号付きや「8.1-9.0」のようなハイフン区切りでも、それは実測値ではなく基準値です。実測値の列で単位が省略されている場合（例：入院時「8100/μL」、術後1日目「10,200」）は、同じ行の単位を補ってください。検査値や基準値を "unnecessary" にしないでください。
※「疼痛:」のように値の無い見出しの下に短い行が続く場合（例：「安静時ペインスケール「2-3」」「体位変換時「5-6」」「「動かなかったら痛くないよ」」）は、1行ずつ分けずに「疼痛: 安静時ペインスケール「2-3」、体位変換時「5-6」…」のように見出しごと1つのtextにまとめてください。「「先生にお任せするしかない」」のように発言だけの行は、直前の患者の発言と同じtextにまとめてください。「帰室(個室301号室)」のように部屋の移動・部屋番号だけの行は type: "unnecessary" です。「入室」「全身麻酔」のように名詞だけの短い行は、それ単独のtextにせず、同じ時刻の前後の所見と1つのtextにまとめてください（例：「入室、右大腿骨人工骨頭置換術 後方アプローチ施行、全身麻酔」）。
※「嘔気・嘔吐なし」のように最後にだけ「なし」「あり」が付く列挙は、すべての項目にかかっているため分割しないでください（分割すると「嘔気」だけが残り、意味が逆になります）。
※「疼痛訴えなし」「呼吸困難の訴えなく」のように訴えが「無い」ことの記載や、「ペインスケール「2-3」」のように数字だけを「」で囲んだ評価値は、看護師による観察・評価のため type: "o" です。
※検査結果が表形式（項目名の行の次に基準値の行、さらに次に実測値の行、というように複数行やセル単位に分かれている場合を含む）で記載されている場合は、単なる前後の文章としてではなく表の構造として読み取り、同じ行・同じ列で対応する項目名・基準値・実測値を正しく結びつけて1つのtextにまとめてください（例：「RBC」「4.35〜5.55 ×10^6/μL」「4.1 ×10^6/μL ↓」の3行に分かれていても、まとめて「RBC 4.35〜5.55 ×10^6/μL 4.1 ×10^6/μL ↓」のように1項目として抽出する）。項目名が無いまま数値だけのtextを出力しないでください。
※血液検査の表で「検査項目」「基準値」に続けて「入院時」「術後1日目」のように複数の実測値列がある場合は、関連する項目（貧血・出血＝RBC・Hb・Ht、炎症＝WBC・CRP、栄養＝TP・Alb、凝固・血栓、血糖、腎機能、肝・胆道、電解質）ごとに1件のtextにまとめ、「貧血・出血（入院時→術後1日目）: Hb 14.0 g/dl→10.8 g/dl (基準値: 12.0-16.0g/dL)、…」のように時点の変化が分かる形にして、timestampは最後の列の時点にしてください。
※（まとめられない場合の書き方）血液検査の表で「検査項目」「基準値」に続けて「A氏(術前)」「A氏(術後)」のように複数の実測値列がある場合は、各項目について実測値列ごとに別々のtextとして抽出し、それぞれの列名（術前・術後等）をtimestampに設定してください（例：「白血球」の行が基準値「3.3〜8.6 ×10^3/μL」、術前列「5.8 ×10^3/μL」、術後列「-」なら、「白血球 5.8 ×10^3/μL (基準値: 3.3〜8.6 ×10^3/μL)」をtimestamp「術前」で1件だけ出力し、術後列が「-」（測定なし）の場合はその列のtextは出力しないでください）。日本語の検査項目名（白血球・赤血球・ヘモグロビン・ヘマトクリット・血小板・総蛋白(TP)・アルブミン(Alb)・アミラーゼ・ナトリウム・クロール・カリウム・総ビリルビン等）も同様に検査値として扱ってください。「検査項目」「基準値」自体の行、および「A氏(術前)」等の列見出し行はtype: "unnecessary"としてください。
※文章をいくつかのtextに分けるかどうかは、句点「。」の数や文の長さではなく、「1つの出来事・テーマについて続けて述べているか」「別々の独立した行為・事実が並んでいるか」で判断してください。
  - 【まとめる例】「麻酔からの覚醒も良好。声を掛けると「あ、あ」と短く返事するのみ。のどの痛みあり。「あ、あ」と声は出るが、苦悶の表情。悪心や嘔吐の兆候はなし。顔面蒼白や冷汗、息苦しさは無い。疼痛NRS 2。自主的では体動は困難。」は、いずれも「麻酔からの覚醒」という1つの出来事についての観察所見が続いているため、分割せず1つのtextにまとめてください。
  - 【分ける例】「シャワー浴を実施した。弾性ストッキングを着用した。」は、清潔ケアと循環ケアという別々の看護行為であるため、それぞれ別のtextに分けてください。
  - 【分ける例】既往歴の「53歳 卵巣嚢腫、50歳代 胆石症(症状がないため経過観察中)」のように「◯歳＋病名」の組が列挙されている場合は、それぞれ別の既往（診断）としてtext・fieldLabelを分けて出力してください（この例なら「53歳 卵巣嚢腫」と「50歳代 胆石症(症状がないため経過観察中)」の2項目）。

【基準ノート】
${buildEffectiveNotebookContent()}

【カルテ・記録テキスト】
${text}

出力は余計な解説を含めず、必ず有効なJSON配列のみを出力してください。`;

          // 【AI機能の評価で発見】以前はJSONの答えを指定せず、答えの最初の「[{」から最後の「}]」までを JSON.parse していた。
          // 長い記録で答えが途中で切れる・最後に余分な「,」がある・前後に説明が付くと読み取れず、何も知らせずに
          // AIなし（ルール）の分類に切り替わり「分類しました」と出ていた。JSONの答えを指定し、崩れを直して読み取り
          // （途中で切れたら読み取れた所まで使う）、読み取れずにルールで分類したときはそのことを知らせる。
          const aiText = await callGeminiAI([{ role: "user", parts: [{ text: prompt }] }], { json: true, quietTruncation: true });
          const parsedInfo = typeof parseAiJsonLooseInfo === 'function' ? parseAiJsonLooseInfo(aiText) : { value: undefined };
          const parsedArr = Array.isArray(parsedInfo.value) ? parsedInfo.value
            : (parsedInfo.value && typeof parsedInfo.value === 'object' ? Object.values(parsedInfo.value).find(v => Array.isArray(v) && v.some(x => x && typeof x === 'object')) : null);
          // 途中で切れた答えを使うと、記録の後ろの方がカードにならない。そのときは記録全体をルールで分類する
          const jsonMatch = parsedArr && parsedArr.length && !parsedInfo.truncated ? [JSON.stringify(parsedArr)] : null;
          if (!jsonMatch) showToast([parsedInfo.truncated ? 'AIの答えが長すぎて途中で切れていたため、記録全体をAIなし（ルール）で分類しました' : 'AIの答えを読み取れなかったため、AIなし（ルール）で分類しました', { text: parsedInfo.truncated ? '記録を何回かに分けて貼り付けると、AIで分類できます。' : 'もう一度「分類開始」を押すと、AIで分類し直せます。', detail: true }], 'warn', 9000);
          if (jsonMatch) {
            // 【レビューで発見】AIの結果の文章を整える（cleanExtractedPhrase）ときも、前に分類した別の患者ではなく
            // この文章を元に子どもの記録か等を決める（下の finally で元に戻す。extractionContext の説明を参照）
            extractionContextOverride = text;
            let added = 0;
            // ローカル抽出（groupClinicalPhrasesWithTimestamps）のadmissionPhaseと同じ考え方を
            // AI抽出経路にも適用する。AIが返す配列は元のカルテの記録順のまま返るため、上から
            // 順に読み進めながら同様に状態を記憶できる（detectAdmissionPhaseSignalの説明を参照）。
            let aiAdmissionPhase = 'preadmission';
            // AIが「入室」「全身麻酔」「「先生にお任せするしかない」」のような断片を1件ずつ返した場合も、
            // ローカル分類と同じ規則（mergeShortFragmentCards）で前後のカードにまとめる
            // （利用者からの修正依頼：「入室だけで情報カードになってるのがおかしい」）。
            const aiItems = JSON.parse(jsonMatch[0]).filter(pi => pi && typeof pi === 'object').map((pi, idx) => {
              const t = pi.text ? cleanExtractedPhrase(pi.text) : '';
              return {
                ...pi,
                text: t,
                timestamp: pi.timestamp || '日時不明',
                hendersonIds: Array.isArray(pi.hendersonIds) ? pi.hendersonIds : [],
                isUnnecessaryBoilerplate: !t || pi.type === 'unnecessary',
                isLabOrVital: !!t && LAB_VALUE_TEST_REGEX.test(t),
                _line: idx
              };
            });
            mergeShortFragmentCards(aiItems);
            aiItems.forEach(pi => {
              // 「＜実習1日目…＞」等の見出し行はAIがtype:"unnecessary"のtextとして返すため、
              // pi.text自体からも手がかりを拾う（pi.timestampには反映されない場合があるため）。
              // pi.timestampの方がより明示的な手がかりのため、pi.textより優先する。
              const aiPhaseSignal = detectAdmissionPhaseSignal(pi.timestamp) || detectAdmissionPhaseSignal(pi.text);
              if (aiPhaseSignal) aiAdmissionPhase = aiPhaseSignal;
              if (!pi.text) return;
              const cleanedText = cleanExtractedPhrase(pi.text);
              if (cleanedText.length < 2) return;
              // AIが表形式の見出し行（「氏名 年齢 性別」等）から値を見つけられず、見出し語
              // そのものをtextとして返してしまう場合がある。実質的な情報が無いため除外する
              // （isBareFieldHeaderOnlyの説明を参照）。
              if (isBareFieldHeaderOnly(cleanedText)) return;
              // pi.fieldLabelが既定のFIELD_LABELS一覧のいずれかと一致すればそれを正規のkeyとして
              // 使う。一致しない場合でも、プロンプトの指示によりAIが内容から自分で組み立てた
              // 短いラベル（例：「術前状態」「知的能力」）はそのまま採用する（利用者からの指摘：
              // 元のテキストの中位の章タイトル（「年齢・社会的・文化的状況」等）をそのまま本文に
              // 埋め込むのではなく、AI自身がその1件に適した短い見出しを作り直してfieldLabelとして
              // 付与するようにしてほしい）。ただし、見出しとして不自然な長い文章がそのまま
              // fieldLabelに紛れ込まないよう、文字数と句読点の有無で簡易にガードする。
              const canonicalFieldLabel = FIELD_LABELS.find(f => f.key === pi.fieldLabel)?.key || null;
              const aiFreeformFieldLabel = (!canonicalFieldLabel && typeof pi.fieldLabel === 'string' && pi.fieldLabel.trim() && pi.fieldLabel.trim().length <= 12 && !/[。、,.]/.test(pi.fieldLabel))
                ? pi.fieldLabel.trim()
                : null;
              const validFieldLabel = canonicalFieldLabel || aiFreeformFieldLabel;
              // 日付・時刻だけの断片はプロンプトで除外を指示しているが、AIが誤って出力した場合に備え、
              // ローカル抽出（groupClinicalPhrasesWithTimestamps）と同じ条件で二重にフィルタする。
              // タグ・バッジ（fieldLabel）の有無に関わらず内容の文字列自体で判定する
              // （「入院日」を対象外にすると「2026年9月10日」のような日付だけのカードがそのまま
              // 作られてしまうため、見出しの種類にかかわらず統一的に除外する）。
              if (isDateOnlyText(cleanedText)) return;
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
                // 【原因と修正】以前はAIが1件でもhendersonIdsを返した場合、固定キーワード辞書
                // （HENDERSON_NEEDSのkeywords。「感染症」→9環境 等）による判定を完全にスキップしていた。
                // そのため「感染症」を含む文章でもAIが他のタグ（例：1呼吸）しか返さなかった場合、
                // キーワードから機械的に分かるはずの9(環境)が補われずに漏れていた。
                // AIが空配列を返した場合の代替(フォールバック)としてではなく、常にキーワード辞書の
                // 判定結果もあわせて統合することで、AIが見落としたタグをキーワード側で補完できるようにする。
                const aiHIds = pi.hendersonIds?.length ? pi.hendersonIds : [];
                const keywordHIds = detectMultipleHendersonTags(cleanedText);
                const hIds = Array.from(new Set([...aiHIds, ...keywordHIds, ...(userLearned?.preferredHendersonIds || [])]));
                // 検査値・バイタルサインには原則食事(2)タグを補うが、この文章について既に学習結果がある場合は
                // （あえて外した、等の）ユーザーの判断を尊重してここでは追加しない。
                // 数値が直接続いていない「WBCが上昇傾向」のような項目名だけの言及にも同様に付与するため、
                // 値の有無を問わない広い判定(LAB_ITEM_NAME_REGEX)も合わせて見る。
                if (!hasLearnedSignal(userLearned) && (LAB_VALUE_TEST_REGEX.test(cleanedText) || mentionsLabItemName(cleanedText))) labCategoryTags(cleanedText).forEach(h => { if (!hIds.includes(h)) hIds.push(h); });
                // 見出しラベル（家族関係・保険は固定、診断名は病名から推測）に応じた初期提案タグも同様に補う
                if (!hasLearnedSignal(userLearned) && validFieldLabel) {
                  fieldLabelHintTags(validFieldLabel, cleanedText).forEach(hid => { if (!hIds.includes(hid)) hIds.push(hid); });
                }
                const aCols = {};
                // 学習結果が無い場合、タイムスタンプ・見出しラベルから入院前／入院後が明確なら
                // 総合アセスメント表の欄を最初から振り分けておく（分からない場合は従来通り未分類）。
                // ※ここも中身の無いスタブ登録（getEntry副作用）だけでは「学習済み」と誤認しないよう
                // hasLearnedSignalで判定する（!userLearnedのままだと初回抽出以降ずっと自動振り分けが止まる）。
                const inferredCol = hasLearnedSignal(userLearned) ? null : inferAssessmentColumn(validFieldLabel, itemTimestamp, aiAdmissionPhase);
                hIds.forEach(hid => aCols[hid] = userLearned?.preferredCols?.[hid] || inferredCol || 'unclassified');
                // AIがtypeを返さなかった場合の保険。見出しラベルが無くても、章タイトル文脈が
                // 付与されたカード（血液検査・画像検査等・治療方針治療内容等等）は、患者の発言でない限り
                // 客観的な記録情報のためOデータとする（ローカル抽出の同種の判定とロジックを揃える）。
                // predictLocalItemTypeと同様、患者本人の発言・訴えの手がかりが無い場合は
                // "unclassified"ではなく"o"を既定値とする（このアプリの分類基準ではS/O未分類という
                // 第3の状態は本来存在しないため）。
                const fallbackType = validFieldLabel ? (FIELD_LABELS.find(f => f.key === validFieldLabel)?.type || 'o') : 'o';
                // 「基礎情報」等の事例プリント自体の見出しはプロンプトでunnecessaryにするよう指示しているが、
                // AIが誤ってs/oを返した場合に備え、ローカル抽出と同じ条件で二重にフィルタする
                // （学習結果で明確に上書きされている場合のみ、その判断を優先する）。
                const isBoilerplate = !hasLearnedSignal(userLearned) && (isUnnecessaryBoilerplateText(cleanedText) || pi.isUnnecessaryBoilerplate);
                // 分類(S/O/不要)は複数の値を同時に持てないため統合はできない。完全一致する学習結果がある場合のみ
                // その判断を優先し、表記ゆれ類似(fuzzy)の場合は精度が落ちるため分類についてはAIの判定を基準のまま活かす
                // （タグは上でfuzzyの結果も含めて統合済み）。
                const itemType = (!isFuzzyMatch && userLearned?.preferredType) || (isBoilerplate ? 'unnecessary' : null) || pi.type || fallbackType;
                // ヘンダーソンタグが1件も付かなかった場合の受け皿（classifyPatientBackgroundの説明を参照）。
                const patientBackground = (itemType !== 'unnecessary' && hIds.length === 0)
                  ? classifyPatientBackground(validFieldLabel)
                  : null;
                cp.items.push({ id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6), text: cleanedText, timestamp: itemTimestamp, type: itemType, hendersonIds: hIds, assessmentCols: aCols, fieldLabel: validFieldLabel, patientBackground, admissionPhase: aiAdmissionPhase, predictionSource: predictionSource || undefined, _touchedAt: new Date().toISOString() });
                added++;
              }
            });
            // 結果が返る前に別の患者に切り替えていたら、その患者（頼んだ患者）に保存し、今の画面には出さない
            if (finishAiResult(cp, null, `AIでの分類（${added}件）`)) return showToast(`AIで${added}件を分類しました`, 'success');
            return;
          }
        } catch (e) {
          // 失敗の理由（キーが違う・回数の上限・通信できない など）も見せる
          showAiErrorToast('AIでの分類に失敗したため、簡易ルールで分類します。', e);
        } finally {
          extractionContextOverride = null;
        }
      }

      let addedCount = 0;
      const addedThisRun = [];
      withExtractionContext(text, () => groupClinicalPhrasesWithTimestamps(text).forEach(chunk => {
        const cleanedText = cleanExtractedPhrase(chunk.text);
        if (cleanedText.length < 2 || isBareFieldHeaderOnly(cleanedText) || isHeadingOnlyChunk(chunk, cleanedText) || cp.items.some(i => i.text === cleanedText && i.timestamp === chunk.timestamp)) return;
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
        const { detectedHIds, predictedType } = computeLocalTagsAndType(chunk, cleanedText, userLearned);
        if (!predictionSource) predictionSource = 'rule';
        const assessmentCols = {};
        // 学習結果が無い場合、タイムスタンプ・見出しラベル・admissionPhase（読み進めた位置から
        // 記憶している入院前／入院後の状態）から入院前／入院後が明確なら総合アセスメント表の
        // 欄を最初から振り分けておく（分からない場合は従来通り未分類）。
        const inferredCol = userLearned ? null : inferAssessmentColumn(chunk.fieldLabel, chunk.timestamp, chunk.admissionPhase);
        detectedHIds.forEach(hId => assessmentCols[hId] = userLearned?.preferredCols?.[hId] || inferredCol || 'unclassified');
        // ヘンダーソンタグが1件も付かなかった場合（＝どの基本的欲求にも当てはまらなかった場合）、
        // 「タグ未設定」の警告のまま残さず、患者背景（基本情報／医学情報）の受け皿に振り分ける
        // （classifyPatientBackgroundの説明を参照）。
        const patientBackground = (predictedType !== 'unnecessary' && detectedHIds.length === 0)
          ? classifyPatientBackground(chunk.fieldLabel)
          : null;

        const newItem = { id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6), text: cleanedText, timestamp: chunk.timestamp || "日時不明", type: predictedType, hendersonIds: detectedHIds, assessmentCols, fieldLabel: chunk.fieldLabel || null, patientBackground, admissionPhase: chunk.admissionPhase || 'preadmission', predictionSource, ...(chunk.sceneId ? { sceneId: chunk.sceneId } : {}), ...(chunk.labRows ? { labRows: chunk.labRows } : {}), _touchedAt: new Date().toISOString() };
        addedThisRun.push(newItem);
        cp.items.push(newItem);
        // どう自動抽出・自動分類されたかを事例ログに残す（研究用）
        reportLearningEvent(cleanedText, 'create', { type: predictedType, hendersonIds: detectedHIds, assessmentCols, fieldLabel: newItem.fieldLabel, predictionSource, fuzzyMatchedText: fuzzyMatchedText || undefined });
        addedCount++;
      }));
      applySceneTagInheritance(addedThisRun);
      saveDataAndSync();
      showToast(`${addedCount}件のデータを分類・カード化しました`, 'success');
    });
