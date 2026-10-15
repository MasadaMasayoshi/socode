// Local semantic classification. S quotations are not automatically communication.
// Source structure and identity rules precede learned preferences; creation does not vote.
// Preserve meaningful source fragments, S/O context, dates and separate admission periods.

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['07'] = 'v.78'; // Version stamp (scripts/stamp-version.js)

    const FAMILY_HISTORY_DISEASE_CONTEXT_REGEX =
      /(祖父|祖母|父|母|兄|姉|弟|妹|叔父|叔母|伯父|伯母)を?[^。、]{0,20}(がん|癌)[^。]{0,15}(亡くな|亡くし|他界|死去)/;
    const OWN_DIAGNOSIS_ONLY_KEYWORDS = new Set(["胃がん", "胃癌"]);
    const NEGATABLE_SPEECH_KEYWORDS = new Set(["訴え", "話す", "語る"]);

    const KEYWORD_FOLLOWING_EXCLUSIONS = {
      "体重": /^\s*(?:を|が|は|も)?\s*(?:かけ|掛け|のせ|乗せ|負荷|支持|免荷)/,
      "安静": /^時/,

      "朝食": /^(?:後|前|時|まで|より|から|[、:：]\s*(?:点滴|抗|内服|投与|与薬|検温|処置))/,
      "昼食": /^(?:後|前|時|まで|より|から|[、:：]\s*(?:点滴|抗|内服|投与|与薬|検温|処置))/,
      "夕食": /^(?:後|前|時|まで|より|から|[、:：]\s*(?:点滴|抗|内服|投与|与薬|検温|処置))/,
      "不安": /^定/,

      "活動": /^的/,

      "仕事": /^を休ませ/,
      "TP": /^\s*[:：]\s*[^\d\s.]|^\s*[（(]\s*援助/
    };

    const KEYWORD_PRECEDING_EXCLUSIONS = {
      "歯": /義$/,

      "座位": /起$/,

      "目が覚め": /麻酔から[^。」]{0,5}$/,
      "血圧": /高$/,

      "会社員": /(?:息子|娘|夫|妻|嫁|婿|長男|次男|三男|長女|次女|三女|主人|旦那|孫|兄|姉|弟|妹|父|母)[^。]{0,10}$/,
      "退職": /(?:息子|娘|夫|妻|嫁|婿|長男|次男|三男|長女|次女|三女|主人|旦那|孫|兄|姉|弟|妹|父|母)[^。]{0,10}$/,
      "パート": /(?:息子|娘|夫|妻|嫁|婿|長男|次男|三男|長女|次女|三女|主人|旦那|孫|兄|姉|弟|妹|父|母)[^。]{0,14}$/,
      "勤務": /(?:息子|娘|夫|妻|嫁|婿|長男|次男|三男|長女|次女|三女|主人|旦那|孫|兄|姉|弟|妹|父|母)[^。]{0,14}$/,
      "教員": /(?:息子|娘|夫|妻|嫁|婿|長男|次男|三男|長女|次女|三女|主人|旦那|孫|兄|姉|弟|妹|父|母)[^。]{0,14}$/,
      "定年": /(?:息子|娘|夫|妻|嫁|婿|長男|次男|三男|長女|次女|三女|主人|旦那|孫|兄|姉|弟|妹|父|母)[^。]{0,10}$/,
      "仕事": /(?:息子|娘|夫|妻|嫁|婿|家族|長男|次男|三男|長女|次女|三女|主人|旦那|孫|兄|姉|弟|妹|子ども|子供|親|父|母)(?:さん|たち|達)?(?:は|も|が|の|には|にも)?[^。、」「]{0,6}$/
    };

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

    function hasOccurrenceNotFollowedBy(text, kw, excludeRegex) {
      let idx = text.indexOf(kw);
      while (idx !== -1) {
        if (!excludeRegex.test(text.slice(idx + kw.length))) return true;
        idx = text.indexOf(kw, idx + 1);
      }
      return false;
    }

    const LEARNING_NEED_IN_QUOTE_REGEX = /(?:気を付け|気をつけ|注意し)(?:ないと|ないといけない|れば|たらいい|ること)|(?:わから|分から)ない(?:ので|から)?.{0,8}(?:教えて|知りたい)|教えて(?:ください|ほしい|欲しい)|知りたい|どうしたら(?:いい|よい)の?|何に気を/;

    const TREATMENT_QUESTION_IN_QUOTE_REGEX = /(?:ても|でも)(?:大丈夫|いい|平気)な(?:の|のかな|んですか|んでしょうか)|もう(?:起きて|動いて|歩いて)(?:も)?(?:いい|大丈夫)|ずれたりしない|外れたりしない/;
    const PATIENT_EDUCATION_REGEX = /(?:看護師|Ns|ナース|理学療法士|作業療法士|PT|OT|担当者)(?:より|から|が|は)[^。]{0,40}(?:説明|指導|伝え|練習)|(?:よう|ように)(?:に)?(?:説明|指導|伝え|声かけ|声掛け)|気をつけ(?:る|て|ましょう)|注意点|生活上の注意|退院指導|生活指導|パンフレット|(?<![A-Za-z])EP\s*[:：]/;

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

    const LABEL_PRIMARY_NEEDS = {
      '睡眠': [5], '休息': [5], '食事': [2], '嚥下・咀嚼障害': [2], '嚥下': [2], '咀嚼': [2], '体格': [2], '栄養': [2],
      '排泄': [3], '排尿': [3], '排便': [3], '清潔': [8], '入浴': [8], '更衣': [6], '活動': [4], '歩行': [4], '運動': [4], '移動': [4],
      '趣味': [13], '余暇': [13], '宗教': [11], '信仰': [11], '性格': [10], 'コミュニケーション障害': [10], '聴覚': [10], '視覚': [10],
      '平衡感覚': [9], '触覚': [9], '呼吸状態': [1], '呼吸機能検査結果': [1], '循環動態': [1], '理解力': [14]
    };
    function labelPrimaryNeeds(text) {
      const m = (text || '').match(/^([^:：「」、。\s]{1,14})\s*[:：]/);
      if (!m || !LABEL_PRIMARY_NEEDS[m[1]]) return null;
      // Explicit additional fields on the same line retain their own domains.
      const ids = [...LABEL_PRIMARY_NEEDS[m[1]]];
      for (const field of text.matchAll(/\s+([^:：「」、。\s]{1,14})\s*[:：]/g)) {
        (LABEL_PRIMARY_NEEDS[field[1]] || []).forEach(id => { if (!ids.includes(id)) ids.push(id); });
      }
      return ids;
    }

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

    const PAIN_TEXT_REGEX = /疼痛|痛み|痛い|痛く|痛かった|創痛|ペインスケール|NRS|VAS|鎮痛|ロキソ|レスキュー/;
    const PAIN_SCORE_REGEX = /ペインスケール|NRS|VAS|フェイススケール/;
    const ALLERGY_ABSENT_REGEX = /アレルギー(?:[:：\s]*|は|が)(?:特に)?(?:なし|ない|ありません|認めない)/;
    const INFECTION_SCREEN_REGEX = /(?:HBV\s*抗原|HCV\s*抗体|梅毒)\s*[:：]?\s*[(（]\s*[-−－ー一→‐–—]\s*[)）]/i;
    const GALLBLADDER_OPERATIVE_FINDING_REGEX = /胆[嚢囊][^。]{0,50}結石[^。]{0,50}摘出した/;
    const HEALTH_SCREEN_USE_REGEX = /(?:検診|健診)[^。]{0,18}(?:欠かさ|定期的に受け|毎年受け|受けている|受けていた)/;
    const CHEST_IMAGE_REGEX = /胸部\s*(?:X\s*線|レントゲン|CT)/i;
    const GASTRIC_FINDING_REGEX = /(?:精密検査|胃カメラ|内視鏡)[^。]{0,40}胃[^。]{0,20}(?:腫瘍|病変|がん|癌)/;
    const POSTURE_ACTIVITY_REGEX = /体動|荷重|移乗|歩行|歩く|歩け|リハビリ|離床|端坐位|立位|移動|ROM|SLR|可動域|起立/;
    const LEARN_CONTENT_IN_QUOTE_REGEX = /んですね|んだよね|んだったよね|だったよね|なきゃ|なくちゃ|やらなくちゃ|やらなきゃ|大丈夫[?？]|でいいの|いいの[?？]|できるかな|やり方|方法|なりにくく|合併症|良くない|いけないの|教えて/;
    const LEARN_KNOWLEDGE_FIRST_REGEX = /なりにくく|やり方|方法|合併症|良くない|予防|教えて/;
    const QUOTE_EMOTION_WORD_REGEX = /怖|恐|不安|心配|嫌|つら|辛|悲し|寂し|情けな|びっくり|嬉し|うれし|かしら/;
    const COMM_ABILITY_REGEX = /聞こえ|聞き取|言葉(?:が|を)|話せ|伝え(?:られ|たい|にく)|意思疎通|難聴|筆談|声が出|会話/;
    const NOT_ENV_REGEX = /PCA|点滴|輸液|疼痛|痛み|痛い|鎮痛|ペインスケール|NRS|\bPLT\b|Plt|血小板|(?<![A-Za-z])PT(?![A-Za-z])|プロトロンビン|アミラーゼ|HBV|HCV|梅毒|HIV|病理|Stage|病期|T[0-9]\s*N[0-9O]|術式|手術時間|出血量|inout|バランス|怖い|不安|心配|フィブリノ|APTT|Dダイマー|感染症|血液型|麻酔科/;
    const ENV_EVIDENCE_REGEX = /ヘパリンロック|点滴終了|点滴ルート|保険|家族|妻|夫|長男|長女|次男|次女|娘|息子|同居|独居|一人暮らし|キーパーソン|サポート|支援者|経済|生活(?:の)?場|自宅|家屋|階段|段差|転倒|転落|転ぶ|ふらつき|歩行不安定|安全|危険|事故|感染予防|感染対策|手洗い|環境|ベッド柵|ナースコール|居室|病室|個室|退院先|施設|介護|ドレーン|チューブ|ガーゼ|創部|刺入部|挿入部|抜去|せん妄|不穏|ADL|見守り|ストッキング|フットポンプ|ホーマンズ|DVT|血栓|外転枕|脱臼|牽引|けん引|骨折|人工骨頭|人工関節|麻酔|知覚|しびれ|痺れ|足背動脈|患肢|聴力|聴覚|視力|視覚|平衡感覚|触覚|感覚|傷|悪露|子宮底|褥瘡|Homans|入院歴|手術歴|既往|手術室|退院|家に帰|圧迫装置|空気圧迫|弾性|住居|住まい|アパート|マンション|一戸建|自宅|医療費|職場/;

    const HENDERSON_IRRELEVANT = {
      1: { when: /病理|Stage|病期|腫瘍マーカー|CEA|CA19|血液型|鎮痛薬?|オピオイド|内視鏡|胃カメラ|ガストロ|GIF|上部消化管/, anchor: /呼吸|SpO2|酸素|痰|咳|喘|ラ音|肺|気道|吸入|FEV|胸部|喫煙|たばこ|タバコ|息|換気/ },
      2: { when: /RBC|赤血球|Hb|ヘモグロビン|Ht|ヘマトクリット|PLT|血小板|WBC|白血球|CRP|PT|APTT|INR|フィブリノゲン|Dダイマー|D-?dimer|血液型|凝固/, anchor: /食|摂取|栄養|体重|BMI|Alb|アルブミン|TP|総蛋白|水分|嚥下|口腔|義歯|胃管|経管|輸液|絶飲|血糖|HbA1c|コレステロール|中性脂肪|悪心|嘔|カロリー|塩分/ },
      3: { when: /呼吸(?:訓練|練習)|スパイロ|ドレーン|ドレナージ/, anchor: /排尿|排便|尿|便|排ガス|腸|下痢|便秘|おむつ|オムツ|トイレ|膀胱|カテーテル|バルーン|ストーマ|腹部膨満|残尿/ }
    };
    const HENDERSON_NOT_COMMUNICATED = /病理|組織診|診断書|検査結果|結果は/;
    const HENDERSON_COMMUNICATION_WORDS = /説明|理解|質問|知りたい|伝え|聞|指導|パンフ|同意|不安|心配|納得|希望/;
    function hendersonRelevanceFilter(text, ids) {
      const t = String(text || '').normalize('NFKC');
      if (!ids || ids.length < 2) return ids;
      const keep = ids.filter(h => {
        const r = HENDERSON_IRRELEVANT[h];
        if (r && r.when.test(t) && !r.anchor.test(t)) return false;
        if (h === 14 && HENDERSON_NOT_COMMUNICATED.test(t) && !HENDERSON_COMMUNICATION_WORDS.test(t)) return false;
        if (h === 9 && /^[^。\n]*(?:血液型|年齢|性別|生年月日)/.test(t) && !/環境|転倒|安全|自宅|住/.test(t)) return false;
        return true;
      });
      return keep.length ? keep : ids;
    }
    function detectMultipleHendersonTags(text) {
      if (isPatientIdentityLine(text)) return [];
      const raw = detectMultipleHendersonTagsRaw(text);
      return hendersonRelevanceFilter(String(text || '').replace(/（問い：[^）]*）/g, ''), raw);
    }
    function detectMultipleHendersonTagsRaw(text) {

      text = String(text || '').replace(/（問い：[^）]*）/g, '');
      // 意識 as attention/awareness (意識して・意識的・意識づけ) is not the level of consciousness, so it must not trigger 1.呼吸.
      text = text.replace(/意識(?=して|し(?:た|て|ない|ませ)|的|づけ|付け|する|させ|が(?:高|低)い人)/g, '気に留め');
      if (typeof isLabTextUnreliable === 'function' && isLabTextUnreliable(text)) return [];
      const tags = new Set();
      const skipOwnDiagnosisKeywords = FAMILY_HISTORY_DISEASE_CONTEXT_REGEX.test(text);

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
          if (custom.excluded.has(`${need.id}\u0000${kw}`)) return false;
          if (skipOwnDiagnosisKeywords && OWN_DIAGNOSIS_ONLY_KEYWORDS.has(kw)) return false;

          if (NEGATABLE_SPEECH_KEYWORDS.has(kw)) return false;
          return hasValidKeywordOccurrence(text, kw);
        });
        if (hits.length) {
          tags.add(need.id);
          const weakList = WEAK_WHEN_NEGATED[need.id];
          if (weakList && hits.every(kw => weakList.includes(kw) && isNegatedEverywhere(text, kw))) weakNeeds.push(need.id);
        }
      }

      const patientText = stripStaffQuotes(text);
      const QUOTED_SPEECH_REGEX = /「[^」]{0,300}[ぁ-んァ-ヶ一-龠々][^」]{0,300}」/;
      if (QUOTED_SPEECH_REGEX.test(patientText)) {
        const quotes = (patientText.match(/「[^」]*」/g) || []).join('');
        if (QUOTE_FEELING_OR_QUESTION_REGEX.test(quotes)) tags.add(10);
      }

      const isPainText = PAIN_TEXT_REGEX.test(text) && !/痛みなし|疼痛なし|疼痛(?:の)?訴え(?:なし|なく)|疼痛増強(?:なし|なく|見られず)/.test(text);
      if (ALLERGY_ABSENT_REGEX.test(text) || INFECTION_SCREEN_REGEX.test(text)) tags.add(9);
      if (HEALTH_SCREEN_USE_REGEX.test(text)) tags.add(14);
      if (CHEST_IMAGE_REGEX.test(text)) tags.add(1);
      // Sun/UV protection habits and awareness belong to 9.環境 (living conditions) and 14.学び (health knowledge), not to a body-system need.
      if (/紫外線|日焼け|日光(?:対策|曝露|を避)|遮光/.test(text) && /対策|予防|日焼け止め|日傘|帽子|意識|知識|知らな|避け|浴び/.test(text)) { tags.add(9); tags.add(14); }
      if (GASTRIC_FINDING_REGEX.test(text) || GALLBLADDER_OPERATIVE_FINDING_REGEX.test(text)) tags.add(2);

      if (/動かなければ|動かさなければ|動かさない(?:と|限り)/.test(text) && /疼痛|痛/.test(text)) tags.add(4);
      if (isPainText) {
        if (/床上|布団|臥床|臥位|上半身|支え|端坐|体動/.test(text)) tags.add(4);
        if (/眠|睡眠|寝/.test(text)) tags.add(5);
        if (/動|歩|立|起き|体位|リハ|離床|荷重|体重|座/.test(text)) tags.add(4);
        if (/食事|食欲|摂取/.test(text)) tags.add(2);
        if (/排便|排尿|トイレ/.test(text)) tags.add(3);
        if (/入浴|清拭|洗/.test(text)) tags.add(8);
        if (/着替|更衣/.test(text)) tags.add(6);
      }
      if (tags.size === 0 && !isPainText && Array.from(NEGATABLE_SPEECH_KEYWORDS).some(kw => hasNonNegatedOccurrence(text, kw))) tags.add(10);
      if (PATIENT_EDUCATION_REGEX.test(text) || /(?:手術|術前)オリエンテーション/.test(text) && !/(?:手術|術前)オリエンテーション[^。]{0,20}(?:予定なし|未実施|中止)/.test(text)) tags.add(14);

      const patientQuotes = (patientText.match(/「[^」]*」/g) || []).join('');
      if (LEARNING_NEED_IN_QUOTE_REGEX.test(patientQuotes)) {
        tags.add(14);

        if (/退院|家に帰|自宅|家の中|帰って/.test(patientQuotes)) tags.add(9);
      }

      if (patientQuotes) {
        if (TREATMENT_QUESTION_IN_QUOTE_REGEX.test(patientQuotes)) tags.add(14);
        if (/人工骨頭|人工関節|脱臼|ずれたり/.test(patientQuotes)) { tags.add(4); tags.add(9); tags.add(14); }
        if (/体重を?かけ(?:て|ても)(?:も)?大丈夫|(?:足を)?つい(?:て|ても)大丈夫/.test(patientQuotes)) { tags.add(4); tags.add(9); tags.add(14); }

        if (/情けな|思うように(?:動け|でき|なら)な/.test(patientQuotes)) tags.add(12);
        if (/(?:動ける|歩ける|できる|立てる)ように(?:なって|なっ)き/.test(patientQuotes)) { tags.add(12); if (/動け|歩け|立て/.test(patientQuotes)) tags.add(4); }

        const aboutMedicine = /薬|飲み|飲ま|飲ませ|内服|服薬/.test(patientQuotes);
        if (/旅行|趣味|遊びに/.test(patientQuotes) || (/出かけ/.test(patientQuotes) && !aboutMedicine)) tags.add(13);

        if (aboutMedicine && /飲みたくない|飲まない|飲まなかった|飲ませて(?:い)?(?:ない|ません)|やめ|知らない|わからない|分からない/.test(patientQuotes)) tags.add(14);

        if (/知らなかった|初めて知った|知りませんでした/.test(patientQuotes)) tags.add(14);

        if (/体重計|測る(?:の)?(?:は|が)?面倒|記録(?:する|を)|手帳/.test(patientQuotes)) tags.add(14);

        if (/と聞いて(?:いる|いて|いた)|と言われて(?:いる|いて|いた)|と説明され/.test(patientQuotes)) tags.add(14);

        if (/(?:痛み止め|鎮痛(?:剤|薬)|薬)[^」]{0,24}(?:もの|の)(?:でしょう|なの|じゃない|かしら)|我慢(?:でき)?なくなってから/.test(patientQuotes)) tags.add(14);

        if (/動けな(?:い|く)|動けん/.test(patientQuotes)) tags.add(4);
      }

      if (/足背動脈/.test(text)) tags.add(9);
      if ((tags.has(4) && /骨折|人工骨頭|置換術|(?<![A-Za-z])(?:BHA|THA)(?![A-Za-z])|牽引|けん引|キルシュナー|外転枕|脱臼|内旋|屈曲禁止/.test(text))) tags.add(9);

      if (/(?:動く|動かす|歩く|立つ|起き上が(?:る|り)|体重をかけ)(?:と|時|とき)[^。、]{0,8}痛/.test(text)) tags.add(4);

      if (/薬/.test(text) && /忘れ/.test(text)) tags.add(14);

      if (/(?:手術|治療|病状)の説明を(?:う|受)け/.test(text)) tags.add(14);

      if (/貧血|RBC|赤血球|ヘモグロビン|ヘマトクリット|(?<![A-Za-z])(?:Hb|Hgb|Ht|Hct)(?![A-Za-z0-9])/.test(text) && /\d/.test(text)) tags.add(1);

      if (tags.has(7) && /知覚|しびれ|痺れ|足背動脈|患肢|末梢|チアノーゼ|感覚/.test(text) && !/体温|発熱|悪寒|熱感|℃|°C|検温|(?<![A-Za-z])(?:KT|BT)(?![A-Za-z])/.test(text)) {
        tags.delete(7); tags.add(9);
      }

      weakNeeds.forEach(h => { if (tags.size > 1) tags.delete(h); });

      if (tags.has(4) && tags.has(9) && PAIN_SCORE_REGEX.test(text) && !POSTURE_ACTIVITY_REGEX.test(text)) tags.delete(4);

      if (tags.has(12) && new RegExp(`^${FAMILY_SPEAKER_WORD}(?:さん)?(?:[:：]|より|から|は|が)?\\s*「`).test(text.trim()) &&
        !/(?:本人|患者|[母父]|祖[母父])(?:さん)?(?:は|の|が|も)?[^。」]{0,8}(?:仕事|勤務|退職|会社|職場)/.test(text)) tags.delete(12);

      let learnFirst = false, learnAdded = false;
      if (patientQuotes && LEARN_CONTENT_IN_QUOTE_REGEX.test(patientQuotes)) {
        tags.add(14);
        if (!QUOTE_EMOTION_WORD_REGEX.test(patientQuotes) && !COMM_ABILITY_REGEX.test(patientQuotes)) tags.delete(10);
        learnFirst = LEARN_KNOWLEDGE_FIRST_REGEX.test(patientQuotes);
        learnAdded = true;

        if (/食べ|たべ|食事|飲み|飲む/.test(patientQuotes)) tags.add(2);
        if (/肺炎|痰|咳|深呼吸|呼吸/.test(patientQuotes)) tags.add(1);

        if (/安静|動|自分でできる|歩|起き/.test(patientQuotes) && !tags.has(4) && /安静|動|歩|起き/.test(patientQuotes)) tags.add(4);
      }

      if (tags.has(9) && NOT_ENV_REGEX.test(text) && !ENV_EVIDENCE_REGEX.test(text) && !ALLERGY_ABSENT_REGEX.test(text) && !INFECTION_SCREEN_REGEX.test(text)) tags.delete(9);
      custom.add.forEach(r => { if (text.includes(r.keyword)) r.hendersonIds.forEach(h => tags.add(h)); });
      const out = Array.from(tags);
      // A physical report or treatment-effect speculation is not communication evidence.
      // Keep explicit emotions, support needs and communication ability separately.
      if (out.includes(10) && out.some(h => [1, 2, 3, 4, 5, 6, 7, 8].includes(h)) &&
        patientQuotes && !custom.add.some(r => text.includes(r.keyword) && r.hendersonIds.includes(10)) &&
        !QUOTE_EMOTION_WORD_REGEX.test(patientQuotes) && !COMM_ABILITY_REGEX.test(patientQuotes) &&
        !/緊張|迷惑|遠慮|気兼ね|申し訳|頼れ|頼り|お願い|してほしい|したい|なりたい|といい|いいんだけど|寂|悲|イライラ|恥|悔|嬉|うれし|楽しみ|ありがと|すみません|嫌|いや|困|悩|落ち込|不満/.test(patientQuotes)) {
        out.splice(out.indexOf(10), 1);
      }
      if (learnFirst && out.includes(14)) return [14, ...out.filter(h => h !== 14)];

      if (learnAdded && out.length > 1 && out.includes(14)) return [...out.filter(h => h !== 14), 14];
      return out;
    }

    // ==========================================================================

    // ------------------------------------------------------------------------

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

    globalAppData.customTagRules = loadCachedCustomTagRules();

    var customTagRuleSetsCache = null;
    function customTagRuleSets() {
      const rules = (typeof globalAppData !== 'undefined' && globalAppData && globalAppData.customTagRules) || [];
      if (customTagRuleSetsCache && customTagRuleSetsCache.source === rules) return customTagRuleSetsCache;
      const excluded = new Set();
      rules.filter(r => r.mode === 'exclude').forEach(r => r.hendersonIds.forEach(h => excluded.add(`${h}\u0000${r.keyword}`)));
      customTagRuleSetsCache = { source: rules, add: rules.filter(r => r.mode === 'add'), excluded };
      return customTagRuleSetsCache;
    }

    function isBuiltInKeywordOf(hendersonId, keyword) {
      const need = HENDERSON_NEEDS.find(n => n.id === hendersonId);
      return !!need && need.keywords.includes(keyword);
    }

    // ==========================================================================

    // ------------------------------------------------------------------------

    // ==========================================================================
    const FUZZY_MATCH_THRESHOLD = 0.82;
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

    function findFuzzyLearnedMatch(text, dict = globalAppData.learningUserDict || {}) {
      let bestKey = null, bestScore = 0;
      for (const key of Object.keys(dict)) {
        if (!key || key === text) continue;
        const score = textSimilarity(text, key);
        if (score > bestScore) { bestScore = score; bestKey = key; }
      }
      return bestScore >= FUZZY_MATCH_THRESHOLD ? { key: bestKey, score: bestScore, learned: dict[bestKey] } : null;
    }

    function isVoteTied(votes) {
      if (!votes) return false;
      const counts = Object.values(votes).filter(c => c > 0);
      if (counts.length < 2) return false;
      const max = Math.max(...counts);
      return counts.filter(c => c === max).length > 1;
    }

    const LAB_VALUE_TRAILING_UNIT_REGEX =
      /^\s*万?\s*(?:[×xX]\s*10\s*(?:\^?\s*\d+|[⁰¹²³⁴⁵⁶⁷⁸⁹]+))?\s*(?:千|万)?\s*(?:\/\s*[μu从µ]L|\/mm3|\/mm³|\/μl|\/mL|[μuµmnp]?g\/(?:dL|L|mL)|I?U\/L|\/L|mE[qa]\/L|[mμuµ]mol\/L|fL|%|℃|°C|°c|mmHg|回\/分|秒)?\s*[↑↓HLhl]?\.?\s*$/i;

    function formatLabValueString(str) {
      if (!str) return str;
      const cleaned = str.trim();

      if (/基準値/.test(cleaned)) return cleaned;
      for (const [key, info] of Object.entries(LAB_STANDARDS)) {

        const match = cleaned.match(new RegExp(`^(${escapeRegExp(key)})(\\s*[（(｛{][^）)｝}]*[）)｝}])?[\\s:=]*([\\d.,]+)`, 'i'));
        if (match) {

          const trailing = cleaned.slice(match[0].length);
          if (!LAB_VALUE_TRAILING_UNIT_REGEX.test(trailing)) continue;
          const alias = match[2] || '';

          const written = trailing.replace(/[↑↓]/g, '').replace(/\s+[HLhl]\s*$/, '').replace(/\.\s*$/, '').trim();

          const hlFlag = trailing.match(/\s([HLhl])\s*\.?\s*$/);
          const flag = (trailing.match(/[↑↓]/) || [''])[0] || (hlFlag ? ` ${hlFlag[1].toUpperCase()}` : '');
          const unitInfo = resolveLabUnit(key, match[3], written);

          if (!unitInfo) return cleaned;
          const { value, unit, note } = unitInfo;
          const shownUnit = unit || info.unit;
          const noteText = note ? ` (${note})` : '';

          if (/随時|食後/.test(alias)) return `${match[1]}${alias} ${value} ${shownUnit}${flag}${noteText}`;

          if (extractionContext().child && !CHILD_SAFE_LAB_REFERENCE_KEYS.has(key)) return `${match[1]}${alias} ${value} ${shownUnit}${flag}${noteText}`;
          return `${match[1]}${alias} ${value} ${shownUnit}${flag}${noteText} (基準値: ${info.ref} ${shownUnit})`;
        }
      }
      return cleaned;
    }

    function normalizeLabUnit(u) {
      return String(u || '').replace(/\s+/g, '').replace(/从/g, 'μ').replace(/mEa\/L/i, 'mEq/L').replace(/万[uμµ]\/L/i, '万/μL').replace(/[µu](?=[gLl]|mol)/g, 'μ').replace(/^x(?=10)/i, '×')
        .replace(/10⁴/g, '10^4').replace(/10³/g, '10^3').replace(/10²/g, '10^2')
        .replace(/dl$/, 'dL').replace(/ml$/, 'mL').replace(/μl$/, 'μL').replace(/(^|\/)l$/, '$1L').replace(/mm³/g, 'mm3')
        .replace(/meq\/l/i, 'mEq/L').replace(/mmol\/l/i, 'mmol/L').replace(/iu\/l/i, 'IU/L').replace(/^u\/l$/i, 'U/L');
    }

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

    const LAB_PLAUSIBLE_WITHOUT_UNIT = { WBC: [100, 300000], Plt: [0.1, 200], RBC: [50, 1000], Hb: [1, 30], CRP: [0, 60] };
    function formatConvertedNumber(v) {
      const abs = Math.abs(v);
      const digits = abs >= 1000 ? 0 : abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
      if (abs >= 1000) return Math.round(v).toLocaleString('en-US');
      return v.toFixed(digits);
    }

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

      if ((/^\/ML$/.test(String(writtenUnit).replace(/\s+/g, '')) && /\/μL$/.test(std)) || (u === '/L' && std === 'U/L')) {
        return { value: rawValue, unit: LAB_STANDARDS[key].unit, note: `単位「${String(writtenUnit).trim()}」を${LAB_STANDARDS[key].unit}と読み替え` };
      }

      if ((LAB_UNIT_EQUIVALENTS[key] || []).includes(u)) return { value: rawValue, unit: LAB_STANDARDS[key].unit };
      const factor = (LAB_UNIT_CONVERSIONS[key] || {})[u];
      if (factor) return { value: formatConvertedNumber(num * factor), unit: LAB_STANDARDS[key].unit, note: `${rawValue} ${u}から換算` };
      return null;
    }

    const BARE_WOUND_LABEL_REGEX = /^創部[:：]/;

    const NON_ABDOMINAL_SURGERY_REGEX = /骨折|骨接合|人工骨頭|人工関節|γネイル|ガンマネイル|BHA|THA|TKA|椎弓|脊椎|開頭|乳房切除|甲状腺/;

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
    // ==========================================================================

    // ==========================================================================
    const CLAUSE_TERMINAL_RE = /[。！？!?」』）)]$/;
    const CLAUSE_PREDICATE_RE = /[ぁ-ん]$/;
    const CLAUSE_CHUUSHI_RE = /(?:て|で|し|ながら|ので|ため|から|が|けど|けれど|ものの)$/;
    const CLAUSE_CONNECTIVE_RE = /(?:が|けれども|けれど|けど|ものの|のに|ので|ため|から)$/;
    function punctuateClause(piece) {
      let t = String(piece || '').trim();
      if (!t) return t;
      t = t.replace(/[、,，\s]+$/, '');
      if (!t || CLAUSE_TERMINAL_RE.test(t)) return t;
      const m = t.match(/^(.*?(?:した|った|いた|れた|んだ|えた|ている|いる|ある|ない|なし|あり|です|ます|ました|する|できる|だ|い|る|た))(?:が|けれども|けれど|けど|ものの|のに)$/);
      if (m) return m[1] + '。';
      if (CLAUSE_CHUUSHI_RE.test(t)) return t;
      if (CLAUSE_PREDICATE_RE.test(t)) return t + '。';
      return t;
    }

    function splitCompoundSentences(text) {
      const src = String(text || '');
      const cut = src.replace(/((?:した|った|いた|れた|んだ|えた|ている|いる|ある|ない|なし|あり|です|ます|ました|する|できる|だ))(が|けれども|けれど|けど|ものの)、(?![^「]*」)/g, '$1$2\n');
      return cut.split('\n').map(punctuateClause).filter(Boolean);
    }

    function joinWithPunctuation(texts) {
      const list = (texts || []).map(t => String(t || '').trim()).filter(Boolean);
      return list.map((t, i) => {
        if (i === list.length - 1) return CLAUSE_TERMINAL_RE.test(t) ? t : punctuateClause(t) || t;
        if (CLAUSE_TERMINAL_RE.test(t)) return t;
        if (/[、,]$/.test(t)) return t;
        if (CLAUSE_CHUUSHI_RE.test(t)) return t + '、';
        return (CLAUSE_PREDICATE_RE.test(t) ? t + '。' : t + '、');
      }).join('');
    }
    function cleanExtractedPhrase(str) {
      if (!str) return '';

      let cleaned = str.trim().replace(/^[\]\)\]〕』】〉、。・,\.\-\s〜〜:：]+/g, '').replace(/[,\-\s〜〜（〈〔『【「『、]+$/g, '');
      cleaned = formatLabValueString(cleaned);
      if (BARE_WOUND_LABEL_REGEX.test(cleaned)) cleaned = cleaned.replace(BARE_WOUND_LABEL_REGEX, extractionContext().wound);

      cleaned = cleaned.replace(/[ \t　]{2,}/g, ' ');

      if (/バイタル(?:サイン)?は(?=[にで。、]|$)/.test(cleaned)) {
        cleaned = cleaned.replace(/バイタル(?:サイン)?は(?=[にで。、]|$)/g, '').replace(/。{2,}/g, '。').replace(/^[。、\s]+/, '').trim();
      }

      if (/^(?:バイタル(?:サイン)?|VS|V\/S)\s*[:：]?[、。,\s]*$/i.test(cleaned)) cleaned = '';
      return cleaned;
    }

    function splitIntoSentenceFragments(text) {
      if (!text) return [];

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

    const BRACKET_PAIRS = [['<', '>'], ['＜', '＞'], ['(', ')'], ['（', '）'], ['[', ']'], ['【', '】']];
    function hasBalancedBrackets(str) {
      return BRACKET_PAIRS.every(([open, close]) => str.split(open).length === str.split(close).length);
    }
    function splitByNakatenList(text) {
      if (!text) return [];
      const trimmed = text.trim();
      if (!trimmed) return [];
      if (!trimmed.includes('・')) return [trimmed];

      if (/[:：]/.test(trimmed)) return [trimmed];
      const parts = trimmed.split('・').map(s => s.trim()).filter(Boolean);

      if (parts.length < 2 || parts.some(p => p.includes('。'))) return [trimmed];
      if (parts.some(p => !hasBalancedBrackets(p))) return [trimmed];

      if (parts.some(p => /[、,]/.test(p) || p.length > 30)) return [trimmed];

      const SHARED_STATUS_SUFFIX_REGEX = /(なし|無し|なく|ない|無|あり|有り|有|良好|不良|陰性|陽性|認めず|みられず|見られず|\([-+±]\)|（[-+±]）)$/;
      const lastPart = parts[parts.length - 1];

      const tailOf = p => p.split(/[、。,]/).pop().trim();
      if (SHARED_STATUS_SUFFIX_REGEX.test(lastPart) && parts.slice(0, -1).every(p => !SHARED_STATUS_SUFFIX_REGEX.test(tailOf(p)) && tailOf(p).length <= 10)) {
        return [trimmed];
      }
      return parts;
    }

    const HIRAGANA_REGEX = /[ぁ-ゖ]/;
    function splitIndependentActionPhrases(text) {
      if (!text) return [text];
      const trimmed = text.trim();
      if (!trimmed.includes('、')) return [trimmed];
      if (/[:：]/.test(trimmed)) return [trimmed];
      const parts = trimmed.split('、').map(s => s.trim()).filter(Boolean);
      if (parts.length < 2 || parts.some(p => p.length < 2 || p.length > 20 || p.includes('。') || HIRAGANA_REGEX.test(p))) return [trimmed];

      if (/^(?:入院後|入院時|入院前|術後|術前|帰室後|帰室時|翌日|翌朝|その後|食後|食前|夜間|日中|朝|夕方)$/.test(parts[0])) return [trimmed];

      if (parts.every(p => /(?:OFF|ON|オフ|オン|off|on|抜去|抜針|中止|終了|開始|再開|装着|除去|解除)$/.test(p))) return [trimmed];

      if (parts.some(p => !hasBalancedBrackets(p))) return [trimmed];
      return parts;
    }

    function isPatientIdentityLine(text) {
      const compact = String(text || '').normalize('NFKC').replace(/\s+/g, '');
      return /^[^・、,。:：\d\n]{1,20}(?:氏|さん|様)[・、,]?\d{1,3}歳[・、,]?(?:男性|女性|男児|女児)[。.]?$/.test(compact);
    }
    function splitEnumeratedPhrases(text) {
      if (isPatientIdentityLine(text)) return [text.trim()];
      const byNakaten = splitByNakatenList(text);
      if (byNakaten.length > 1) return byNakaten;
      return splitIndependentActionPhrases(byNakaten[0]);
    }

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

    const BARE_BLOCK_HEADING_REGEX = /^(?:術後肢位|肢位|良肢位|禁忌肢位|安静度|安静度指示|指示|指示事項|注意事項|禁止事項|禁忌事項|病室環境|観察項目|観察ポイント|生活上の注意|日常生活の注意|退院指導)$/;
    function splitLifeHistoryItems(content) {
      if (!content || !/[、,]/.test(content) || content.includes('。')) return [content];
      const parts = content.split(/[、,]/).map(p => p.trim()).filter(Boolean);
      if (parts.length < 2) return [content];

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

    const FRAGMENT_QUOTE_WITH_WORDS_REGEX = /「[^」]*[ぁ-んァ-ヶ一-龠々][^」]*」/;
    const BARE_NOUN_FRAGMENT_STATUS_REGEX = /(なし|無し|あり|有り|良好|不良|可能|不可|困難|清明|クリア|自立|介助|禁止|陰性|陽性|著明|軽度|中等度|重度|みられ|認め)/;

    const VITAL_SIGN_CARD_REGEX = /^(?:血圧|脈拍|心拍数?|呼吸(?:数)?|体温|SpO2|SPO2|Spo2|SpO₂|酸素飽和度|HR|BP|RR|BT|KT|P\s*\d|R\s*\d|T\s*\d)/;
    const VITAL_ORDER = [/^(?:体温|BT|KT|T\s*\d)/, /^(?:血圧|BP)/, /^(?:脈拍|心拍|HR|P\s*\d)/, /^(?:呼吸|RR|R\s*\d)/, /^(?:SpO2|SPO2|Spo2|SpO₂|酸素飽和度)/];
    const vitalOrderOf = t => { const k = VITAL_ORDER.findIndex(re => re.test(t)); return k === -1 ? VITAL_ORDER.length : k; };

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

      const groups = new Map();
      let lastVital = null;
      list.forEach((it, idx) => {

        const valueOnly = /^(?:血圧|脈拍|心拍数?|呼吸数?|体温|SpO2|SPO2|Spo2|BP|HR|RR|BT|KT|[TPR](?=\s*\d))\s*[\d〜~\-\/.,()（）\s]+(?:mmHg|回\/分|度|°C|℃|%|bpm)?[^、。「」]{0,8}$/.test(it.text);
        if (!(it.isLabOrVital || valueOnly) || it.isUnnecessaryBoilerplate || it._lab || it.fieldLabel || it._line === undefined || !VITAL_SIGN_CARD_REGEX.test(it.text)) return;

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
        if (phases.length < 2) return;
        if (!tables.has(it._lab.table)) tables.set(it._lab.table, []);
        tables.get(it._lab.table).push(idx);
      });
      const remove = new Set();
      const inserts = [];
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

        groups.forEach((gRows, name) => {
          // One regular form per item: "name a→b unit（reference）"; the unit is written once when all values share it.
          const parts = gRows.map(row => {
            const present = phases.filter(ph => row.values[ph] !== undefined);
            const split = ph => { const m = String(row.values[ph]).match(/^(-?\d[\d,]*(?:\.\d+)?)\s*(.*)$/); return m ? { n: m[1], u: m[2].trim() } : null; };
            const sp = present.map(split);
            const sameUnit = sp.every(Boolean) && sp.every(s => s.u === sp[0].u);
            const valueText = sameUnit ? `${sp.map(s => s.n).join('→')}${sp[0].u ? `${/^[A-Za-z]/.test(sp[0].u) ? ' ' : ''}${sp[0].u}` : ''}` : present.map(ph => row.values[ph]).join('→');
            const unit = sameUnit ? sp[0].u : '';
            const ref = row.ref ? String(row.ref).trim().replace(/^基準値[:：]\s*/, '') : '';
            const refText = ref ? (unit && ref.endsWith(unit) && ref.length > unit.length && !/[×^]/.test(ref) ? ref.slice(0, -unit.length).trim() : ref) : '';
            const notes = [present.length === 1 ? `${present[0]}のみ` : '', refText ? `基準 ${refText}` : ''].filter(Boolean);
            return `${row.key} ${valueText}${notes.length ? `（${notes.join('、')}）` : ''}`;
          });

          const labRows = gRows.map(row => ({ key: row.key, ref: row.ref || null, values: phases.filter(ph => row.values[ph] !== undefined).map(ph => ({ phase: ph, value: row.values[ph] })) }));
          cards.push({ text: `${cleanExtractedPhrase(`${name}（${phases.join('→')}）`)}\n${parts.map(s => `・${cleanExtractedPhrase(s)}`).join('\n')}`, timestamp: lastPhase, isLabOrVital: true, labRows, admissionPhase: list[idxs[0]].admissionPhase, _line: list[idxs[0]]._line });
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

    const SPEECH_TAIL_REGEX = /^\s*(?:と(?:本人|患者)(?:は|が)?|との(?:言葉|発言)(?:も|が)?(?:聞かれる|聞かれた|あり)?|と?(?:も)?(?:(?:本人|患者)(?:は|が)?)?(?:言|話|訴え|答え|返答|回答|質問|尋ね|希望|発言|相談|つぶや|呟|頼)[ぁ-ん]{0,8}|と?の(?:こと|発言)(?:あり|である|です|だった|だ)?)?/;
    const PATIENT_WORD_QUOTE_REGEX = /「[^「」]*[ぁ-んァ-ヶ一-龠々][^「」]*」/g;
    const DANGLING_CLAUSE_END_REGEX = /(?:には|では|に対して|に|へ|から|より|は|が|も|の|と)$/;

    const FAMILY_SPEAKER_WORD = '(?:妻|夫|長女|長男|次女|次男|三女|三男|娘|息子|嫁|婿|家族|母親?|父親?|孫|姉|妹|兄|弟|姪|甥|義母|義父|叔母|叔父|伯母|伯父)';
    const FAMILY_QUOTE_REGEX = new RegExp(`(?:^|[:：、。\\s])${FAMILY_SPEAKER_WORD}(?:さん)?(?:[:：]|からは|より|から|は|が|も)?(?:、)?(?:面会(?:時)?(?:に)?[。、]?)?\\s*「`);
    function isFamilySpeech(text) { return FAMILY_QUOTE_REGEX.test(text || ''); }

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

    const DANGLING_OBSERVATION_END_REGEX = /(?:あるも|するも|したが|ものの|けれど|けれども|けど|だが)$/;
    const SAME_ACTION_TERM_REGEX = /荷重|移乗|歩行|体重|離床|リハビリ|端坐位|立位|起立/g;
    function mergeDanglingObservations(list) {
      const isSpeech = t => /「[^」]{5,}」/.test(t);
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        const text = (it.text || '').trim();
        if (it.isUnnecessaryBoilerplate || it.diseaseGeneral || it.isLabOrVital || it.fieldLabel || !text || isSpeech(text)) continue;
        const dangling = DANGLING_OBSERVATION_END_REGEX.test(text);
        const shortZu = text.length <= 20 && /ず$/.test(text);
        if (!dangling && !shortZu) continue;
        for (let j = i + 1; j < Math.min(list.length, i + 4); j++) {
          const n = list[j];
          if (n.timestamp !== it.timestamp) break;
          if (n.isUnnecessaryBoilerplate || n.diseaseGeneral || isSpeech(n.text || '')) continue;
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
    function splitMixedSubjectiveObjective(list, forceSplit = false) {
      let serial = 0;
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        if (it.isUnnecessaryBoilerplate || it.isLabOrVital || it.sceneId || (it.soMixed && !forceSplit)) continue;
        const text = it.text;
        if (stripStaffQuotes(text) !== text) continue;
        if (isFamilySpeech(text)) continue;
        if (/（問い：[^）]*）$/.test(text)) continue;
        const quotes = text.match(PATIENT_WORD_QUOTE_REGEX);
        if (!quotes) continue;

        if (quotes.every(q => q.length - 2 <= 4)) continue;

        if (/」\s*と(?:聞いて|聞いた|聞いている|思って|思う|思い|考えて|考え)/.test(text)) continue;
        const labelMatch = text.match(/^([^:：「」、。\s]{1,14})\s*[:：]\s*/);
        const label = labelMatch ? labelMatch[1] : '';
        const body = labelMatch ? text.slice(labelMatch[0].length) : text;

        const quoteList = [];
        const masked = body.replace(PATIENT_WORD_QUOTE_REGEX, q => `\u0001${quoteList.push(q) - 1}\u0002`);
        const MARK_REGEX = /\u0001\d+\u0002/;
        const unmask = t => t.replace(/\u0001(\d+)\u0002/g, (m, k) => quoteList[Number(k)]);
        const sentences = masked.split(/(?<=。)/).map(x => x.trim()).filter(Boolean);

        const removeSpeech = part => {
          const segs = part.split(/(?:\u0001\d+\u0002)+/);
          let rest = segs.map((seg, k) => (k === 0 ? seg : seg.replace(SPEECH_TAIL_REGEX, '').replace(/^\s*と(?:も)?(?=[^\s、。]|$)/, ''))).map(x => x.trim()).filter(Boolean).join('、');
          rest = rest.replace(/(?:^|、)(?:本人|患者)(?:より|から|が|は)(?=、|$)/g, '').replace(/^、/, '');
          const core = rest.replace(/[、。\s]+$/g, '');
          if (!core || DANGLING_CLAUSE_END_REGEX.test(core)) return '';
          return rest;
        };

        const kept = [];
        const subjectiveParts = [];
        sentences.forEach(sentence => {
          if (!MARK_REGEX.test(sentence)) { kept.push(sentence); return; }

          const clauses = sentence.split(/(?<=(?:が|けど|けれど|ものの|ながら))、/);
          if (clauses.length > 1) {
            clauses.filter(c => MARK_REGEX.test(c)).forEach(c => subjectiveParts.push(unmask(c).replace(/(?:が|けど|けれど|ものの|ながら)$/, '').replace(/[、。\s]+$/, '') + '。'));
          } else {

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

          parts[parts.length - 1] = parts[parts.length - 1].replace(/(?:が|けど|けれど|ものの)$/, '');
          kept.push(parts.join('、') + (/。$/.test(sentence) ? '。' : ''));
        });
        let objective = unmask(kept.join('')).replace(/\s*、\s*/g, '、').replace(/、{2,}/g, '、').replace(/、。/g, '。').replace(/^[、。\s]+|[、\s]+$/g, '').trim();

        const meaningful = objective.replace(/[、。\s]/g, '');
        if (meaningful.length < 10 || /^(?:と|とも)?(?:話す|話した|訴える|訴えあり|言う|言っていた|返答あり|発言あり|本人より|患者より|本人|患者)+$/.test(meaningful)) continue;
        if (!forceSplit) {
          // Same situation with both speech and observation: keep one mixed card instead of forcing a split.
          const mixedCard = { ...it, soMixed: true, soRole: 's' };
          delete mixedCard.sceneId;
          list.splice(i, 1, mixedCard);
          continue;
        }
        // Projection only (relation map): separate speech and observation without changing the saved card.
        const prefix = label ? `${label}: ` : '';
        const subjectiveText = subjectiveParts.join('').replace(/。{2,}/g, '。');
        const subjectiveCard = { ...it, text: cleanExtractedPhrase(`${prefix}${subjectiveText}`), soMixed: false, soRole: 's', type: 's', projectedFrom: it, sceneId: `proj_${it.id || serial}`, ...(it.id ? { id: `${it.id}#s` } : {}) };
        const objectiveCard = { ...it, text: cleanExtractedPhrase(`${prefix}${objective}`), soMixed: false, soRole: 'o', type: 'o', projectedFrom: it, sceneId: `proj_${it.id || serial}`, ...(it.id ? { id: `${it.id}#o` } : {}) };
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

        const prevIsBareQuote = /^「[^「」]*」(?:「[^「」]*」)*$/.test(prev.text.trim());
        const topicTags = t => detectMultipleHendersonTags(t).filter(h => h !== 10);
        const sameTopic = () => {
          const a = topicTags(prev.text), b = topicTags(cur.text);

          return (a.length === 0 && b.length === 0) || a.some(h => b.includes(h));
        };

        const prevIsStaffSpeech = stripStaffQuotes(prev.text) !== prev.text || STAFF_QUESTION_LINE_REGEX.test(prev.text.trim());
        const canMerge = isBareQuote && !prevIsStaffSpeech && !cur.isUnnecessaryBoilerplate && !cur.diseaseGeneral && !prev.isUnnecessaryBoilerplate &&
          !prev.fieldLabel && !prev.isLabOrVital && prev.timestamp === cur.timestamp && FRAGMENT_QUOTE_WITH_WORDS_REGEX.test(prev.text) &&
          (!prevIsBareQuote ? (!/(?:訴え|話|言)[^「」]{0,6}$/.test(prev.text) || sameTopic()) : sameTopic());
        if (canMerge) {
          absorb(prev, cur, prev.text + cur.text);
          list.splice(qi, 1);
        } else {
          qi++;
        }
      }
      const cardsPerLine = new Map();
      list.forEach(it => { if (!it.isUnnecessaryBoilerplate && it._line !== undefined) cardsPerLine.set(it._line, (cardsPerLine.get(it._line) || 0) + 1); });
      const isBareNounFragment = it => !it.isUnnecessaryBoilerplate && !it.diseaseGeneral && !it.fieldLabel && !it.isLabOrVital &&
        (it._line === undefined || (cardsPerLine.get(it._line) || 0) <= 1) &&
        it.text.length <= 6 && !/[\d:：「」。、]/.test(it.text) && !BARE_NOUN_FRAGMENT_STATUS_REGEX.test(it.text);

      const canAbsorbFragment = (target, frag) => !!target && !target.isUnnecessaryBoilerplate && !target.diseaseGeneral && !target.fieldLabel && !target.isLabOrVital &&
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

          absorb(nextItem, frag, `${frag.text}${SCENE_EVENT_WORD_REGEX.test(frag.text) ? ': ' : '、'}${nextItem.text}`);
          list.splice(fi, 1);
        } else {
          fi++;
        }
      }

      for (let ci = 1; ci < list.length;) {
        const cur = list[ci];
        const prev = list[ci - 1];
        const isOrphan = !cur.isUnnecessaryBoilerplate && !cur.diseaseGeneral && !cur.fieldLabel && !cur.isLabOrVital &&
          cur.text.length <= 15 && !/[「」]/.test(cur.text) && (detectMultipleHendersonTags(cur.text).length === 0 || /^ガーゼ[^。、]{0,6}汚染[^。、]{0,4}$/.test(cur.text.trim()));
        const isAdjacentLine = cur._line === undefined || prev._line === undefined || cur._line - prev._line <= 1;
        const prevCanContinue = !prev.isUnnecessaryBoilerplate && !prev.diseaseGeneral && !prev.fieldLabel && !prev.isLabOrVital &&
          prev.timestamp === cur.timestamp && isAdjacentLine && !/^「[^」]*」$/.test(prev.text.trim()) &&
          detectMultipleHendersonTags(prev.text).length > 0;
        if (isOrphan && prevCanContinue) {
          absorb(prev, cur, `${prev.text}${/[。、]$/.test(prev.text) ? '' : '、'}${cur.text}`);
          list.splice(ci, 1);
        } else {
          ci++;
        }
      }

      list.forEach(it => {
        if (!it.isUnnecessaryBoilerplate && /^(?:入室|退室|帰室|入院|転棟|転室|手術室入室)$/.test((it.text || '').trim())) {
          it.isUnnecessaryBoilerplate = true;
        }
      });
      return list;
    }

    // ==========================================================================

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

    const SOAP_PREFIX_REGEX = /^(?:([SO])\s*[)）:：]|([AP])\s*(?:[)）]|[:：](?!\s*\d)))\s*/;
    const SOAP_ASSESSMENT_MARK = '\u0002SOAP\u0002';
    const GENERIC_LIST_MARK = '\u0002GLIST\u0002';

    const STUDENT_SECTION_HEADING_REGEX = /^[【\[＜<■●◆]\s*(?:本日の|今日の|明日の|実習|学生の)?(?:目標|行動計画|看護計画|計画|考察|評価|自己評価|課題|学び|感想|振り返り|反省|気づき|明日への課題|今後の課題|指導者(?:から|より)?の?(?:助言|コメント|指導)|指導者より|助言|情報の整理)(?:[・と][^】\]＞>]{0,12})?\s*(?:[(（]\s*(?:学生|自分)[^)）]{0,6}[)）])?\s*[】\]＞>]?\s*$/;
    const STUDENT_NOTE_LINE_REGEX = /^(?:学生の(?:関わりの)?)?(?:アセスメント|考察|振り返り|感想|反省|今日の学び|学び|明日の課題|今後の課題|自己評価|看護問題|看護計画|目標|場面を選んだ理由|この場面を選んだ理由|気づいたこと|気付いたこと)\s*[:：]/;

    const PROCESS_RECORD_STUDENT_REGEX = /^\d{0,2}\s*(?:私|学生|自分)(?:が|の)?(?:感じたこと|考えたこと|思ったこと|言動|行動|かかわり|関わり|対応)[^:：]{0,12}[:：]/;
    const PROCESS_RECORD_PATIENT_REGEX = /^\d{0,2}\s*(?:患者|本人|対象者?|[A-ZＡ-Ｚ]さん|[A-ZＡ-Ｚ]氏)(?:さん)?の(?:言動|反応|言葉|様子)\s*[:：]\s*/;

    const BULLET_HEADING_REGEX = /^[〇○◎]\s*([^。:：\d「」]{1,15})$/;
    const BULLET_MARK_REGEX = /^[〇○◎]\s*/;

    const BULLET_OBSERVATION_WORD_REGEX = /なし|無し|あり|有り|良好|不良|可能|不可|困難|自立|介助|認め|みられ|見られ|摂取|低下|上昇|増強|軽減|著明|軽度|中等度|重度|陰性|陽性|[(（][-+±][)）]|[、,]/;

    const DAY_BOUNDARY_LINE_REGEX = new RegExp(
      `^[【\\[<＜■●◆]?\\s*(?:(?:\\d{1,4}年)?\\d{1,2}月\\d{1,2}日(?:\\s*[(（][月火水木金土日祝](?:曜日?)?[)）])?|\\d{4}[\\/\\-]\\d{1,2}[\\/\\-]\\d{1,2}|\\d{1,2}\\/\\d{1,2}(?:\\s*[(（][月火水木金土日祝][)）])?|${DAY_HEADING_WORD_SOURCE})\\s*[】\\]>＞]?(?=\\s*$|\\s*\\d{1,2}[:時]\\d{0,2})`
    );

    const DAY_SAVE_MARK = '\u0002DAYSAVE\u0002';
    const DAY_RESTORE_MARK = '\u0002DAYRESTORE\u0002';
    const STUDENT_ADVICE_LINE_REGEX = /^(?:臨床)?(?:実習)?(?:指導者|担当教員|教員|指導ナース|指導看護師)(?:さん|の[^、。]{0,6})?(?:より|から|に|が)/;

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

      if (/\d/.test(m[2])) return null;
      const hit = HENDERSON_HEADING_WORDS.find(([id]) => id === n);
      return hit && hit[1].test(m[2]) ? n : null;
    }

    const STUDENT_TITLE_WORD_REGEX = /実習|記録|用紙|アセスメント|情報収集|看護過程|ケーススタディ|事例|症例/;

    const SPEAKER_HEADING_REGEX = /^(本人|患者|担当看護師|受け持ち看護師|受持ち看護師|看護師|主治医|医師|担当医|理学療法士|PT|作業療法士|OT|家族|妻|夫|長男|次男|長女|次女|息子|娘|嫁)\s*(?:より|から)\s*[:：]?$/;
    function carrySpeakerAndJoinQuotes(raw) {
      const count = (t, c) => (t.match(new RegExp(c, 'g')) || []).length;
      const lines = Array.from(raw);

      const joined = [];
      for (let i = 0; i < lines.length; i++) {
        const t = String(lines[i]).trim();
        if (t && count(t, '「') > count(t, '」')) {
          let j = i + 1;
          while (j < lines.length && j <= i + 3 && String(lines[j]).trim() === '') j++;
          const next = j < lines.length ? String(lines[j]).trim() : '';
          if (next && count(next, '」') > count(next, '「') && count(t + next, '「') === count(t + next, '」')) { joined.push(t + next); i = j; continue; }
        }
        joined.push(lines[i]);
      }

      const out = [];
      for (let i = 0; i < joined.length; i++) {
        const t = String(joined[i]).trim();
        out.push(joined[i]);
        if (!SPEAKER_HEADING_REGEX.test(t)) continue;
        let j = i + 1;
        const run = [];
        for (; j < joined.length; j++) {
          const u = String(joined[j]).trim();
          if (u === '') { if (run.length && !/^「/.test(String(joined[j + 1] || '').trim())) break; continue; }
          if (!/^「/.test(u)) break;
          run.push(joined[j]);
        }
        if (!run.length) continue;
        run.forEach(b => out.push(b));
        i = j - 1;
      }
      return out;
    }
    // OCR'd report tables letter-space item names ("M C V", "白 血 球 数"): join single-character tokens back together.
    function squeezeSpacedLabName(str) {
      const toks = String(str || '').normalize('NFKC').trim().split(/\s+/).filter(Boolean);
      let out = toks[0] || '';
      for (let i = 1; i < toks.length; i++) out += (toks[i - 1].length === 1 || toks[i].length === 1 ? '' : ' ') + toks[i];
      return out;
    }
    function labSexFromLines(lines) {
      for (const l of lines) {
        const m = String(l).normalize('NFKC').trim().match(/^(?:性別\s*[:：]?\s*)?(男性|女性)$|^\d{1,3}歳\s*(男性|女性)$/);
        if (m) return (m[1] || m[2]) === '男性' ? 'M' : 'F';
      }
      return null;
    }
    // A reference like "M 83~101 F 80~101" is sex-specific: use the patient's range when the record states the sex, otherwise show both.
    function labReferenceText(ref, sex) {
      let t = String(ref || '').normalize('NFKC').replace(/\s+/g, ' ').trim().replace(/^参考値\s*[(（]\s*(.*?)\s*[)）]$/, '$1').replace(/[~～]/g, '〜').replace(/\s*〜\s*/g, '〜');
      if (!t || /^[-ー－―‐]+$/.test(t)) return '';
      const mf = t.match(/^M\s*(.+?)\s+F\s*(.+)$/);
      if (mf) return sex === 'M' ? mf[1].trim() : sex === 'F' ? mf[2].trim() : `男性 ${mf[1].trim()}／女性 ${mf[2].trim()}`;
      return t;
    }
    const LAB_STANDALONE_NUMBER_REGEX = /(?<![A-Za-z\d.])[<>]?\d[\d,]*(?:\.\d+)?(?![A-Za-z])/;
    const LAB_TEMPLATE_MARK = '\u0004TPL\u0004';
    function normalizeMarkdownLabTables(lines) {
      const out = [];
      let header = null;
      let emittedHeader = false;
      const seenValueRows = new Set();
      const sex = labSexFromLines(lines);
      for (const original of lines) {
        const line = String(original).trim();
        if ((line.match(/\|/g) || []).length < 2) { header = null; emittedHeader = false; out.push(original); continue; }
        const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
        if (cells.every(c => !c || /^:?-{2,}:?$/.test(c))) { out.push(SOURCE_TITLE_MARK + line); continue; }
        // Report layout: item | reference | unit | result. Only a row whose result cell holds a measured number is a finding;
        // rows with a blank result or just an abbreviation echo are unfilled template rows.
        const flat = cells.map(c => c.normalize('NFKC').replace(/\s+/g, ''));
        if (/^(?:項目名?|検査項目名?|検査名)$/.test(flat[0]) && flat.some(c => /^結果$/.test(c)) && flat.some(c => /^基準値/.test(c))) {
          header = cells; emittedHeader = false; out.push(SOURCE_TITLE_MARK + cells.join(' '));
          header.reportLayout = { ref: flat.findIndex(c => /^基準値/.test(c)), unit: flat.findIndex(c => /^単位$/.test(c)), res: flat.findIndex(c => /^結果$/.test(c)) };
          continue;
        }
        if (header && header.reportLayout) {
          const lay = header.reportLayout;
          const name = squeezeSpacedLabName(cells[0]);
          if (!name || !cells.slice(1).some(Boolean)) continue;
          const res = String(cells[lay.res] || '').normalize('NFKC').trim();
          const num = res.match(LAB_STANDALONE_NUMBER_REGEX);
          if (!num) { out.push(SOURCE_TITLE_MARK + LAB_TEMPLATE_MARK + cells.join(' ').replace(/\s+/g, ' ')); continue; }
          const abbr = res.slice(0, num.index).trim() || name;
          const arrow = (res.slice(num.index + num[0].length).match(/[↑↓]/) || [''])[0];
          const unit = lay.unit >= 0 ? String(cells[lay.unit] || '').normalize('NFKC').replace(/\s+/g, '') : '';
          const ref = labReferenceText(cells[lay.ref], sex);
          const row = `${abbr} ${num[0]}${unit ? ` ${unit}` : ''}${arrow ? ` ${arrow}` : ''}${ref ? ` (基準値: ${ref})` : ''}`;
          if (!seenValueRows.has(row)) { seenValueRows.add(row); out.push(row); }
          continue;
        }
        if (/^(?:項目|検査項目)$/.test(cells[0])) { header = cells; emittedHeader = false; out.push(SOURCE_TITLE_MARK + cells.join(' ')); continue; }
        const keep = header ? header.map((c, k) => k).filter(k => k === 0 || !/^(?:種類|正常・異常|正常|異常)$/.test(header[k])) : cells.map((c, k) => k);
        const values = keep.filter(k => k > 0 && cells[k]);
        if (!cells[0] || !values.length) continue;
        const ref = header?.findIndex(c => TAB_TABLE_REF_HEADER_REGEX.test(c.normalize('NFKC'))) ?? -1;
        const patientValues = values.filter(k => k !== ref);
        if (patientValues.length > 1 && header) {
          if (!emittedHeader) { out.push(header.map((c,k) => keep.includes(k) ? c : '').join('\t')); emittedHeader = true; }
          out.push(cells.map((c,k) => keep.includes(k) ? c : '').join('\t'));
        } else out.push(`${cells[0]} ${values.map(k => k === ref ? `(基準値: ${cells[k]})` : cells[k]).join(' ')}`);
      }
      return out;
    }
    // Hard-wrapped lines (a line cut mid-sentence by the source layout) are rejoined, and short
    // noun-only section headings without a colon are marked as headings so they do not leak into cards.
    function repairSourceLineLayout(raw) {
      const lines = Array.from(raw).map(l => String(l));
      const out = [];
      const TERMINAL = /[。.！!？?」』）)、，,:：;；]$/;
      for (let i = 0; i < lines.length; i++) {
        let cur = lines[i];
        const t = cur.trim();
        while (i + 1 < lines.length && t.length >= 20 && cur.trim().length >= 20 && !TERMINAL.test(cur.trim()) &&
          lines[i + 1].trim() && /^[のがをにでとはもへやか]/.test(lines[i + 1].trim()) && !/^(?:か[らも]?)?[:：]/.test(lines[i + 1].trim())) {
          cur = cur.replace(/\s+$/, '') + lines[i + 1].trim();
          i++;
        }
        out.push(cur);
      }
      const res = [];
      const headLike = [];
      out.forEach((l, i) => {
        const t = l.trim();
        const prevBlank = i === 0 || !out[i - 1].trim();
        const next = (out[i + 1] || '').trim();
        const isHead = prevBlank && next && t.length >= 2 && t.length <= 10 && !/[、。,.:：「」()（）\d%％\u0002【】\[\]<>＜＞■●◆◇□○]/.test(t) && !DAY_HEADING_ONLY_REGEX.test(t.replace(/\s+/g, '')) && !/^(?:入院前|入院時|入院後|術前|術中|術後)$/.test(t) &&
          !t.startsWith(SOURCE_TITLE_MARK) && !/[ぁ-ん]$/.test(t) && !Array.from(detectMultipleHendersonTagsRaw(t) || []).length;
        headLike[i] = !!isHead;
        // A noun-only heading is dropped from card text only when a labelled field follows it; other headings keep the existing
        // heading-with-its-lines grouping unless they sit inside a generic symptom list (handled below).
        res.push(isHead && (/[:：]/.test(next) || /(?:症状|状況|所見|情報|経過)$/.test(t)) ? SOURCE_TITLE_MARK + t : l);
      });
      // A section whose block is a generic symptom list (e.g. a textbook list ending in 「など」) continues through the
      // following noun-only blocks (no sentence, quote, digit, colon or case particle); those lines are the same list.
      const blocks = [];
      let curBlock = null;
      res.forEach((l, i) => {
        if (!l.trim()) { curBlock = null; return; }
        if (!curBlock) { curBlock = []; blocks.push(curBlock); }
        curBlock.push(i);
      });
      const bodyOf = idxs => idxs.filter(i => !res[i].startsWith(SOURCE_TITLE_MARK) && !headLike[i]).map(i => res[i].trim());
      const listLike = idxs => { const b = bodyOf(idxs); return b.length > 0 && b.every(x => !/[。「」\d:：]/.test(x) && !/[はがをにへ]/.test(x.replace(/[（(][^）)]*[）)]/g, ''))); };
      let inRegion = false;
      blocks.forEach(idxs => {
        const body = bodyOf(idxs);
        if (!inRegion && body.length && isGenericSymptomList(body.join(''))) inRegion = true;
        else if (inRegion && !listLike(idxs)) inRegion = false;
        if (inRegion) idxs.forEach(i => { if (headLike[i] && !res[i].startsWith(SOURCE_TITLE_MARK) && /(?:症状|状況|所見|項目|情報|経過|歴)\s*[:：]?$/.test(res[i].trim())) res[i] = SOURCE_TITLE_MARK + res[i].trim(); else if (!res[i].startsWith(SOURCE_TITLE_MARK)) res[i] = GENERIC_LIST_MARK + res[i].trim(); });
      });
      return res;
    }

    function preprocessFreeFormLines(raw) {
      raw = repairSourceLineLayout(carrySpeakerAndJoinQuotes(raw));
      const step1 = [];
      const firstIdx = raw.findIndex(l => String(l).trim() !== '');
      let soapPart = null;
      let babySection = false;
      let lastDayHeading = null;
      raw.forEach((original, idx) => {
        const line = original.trim();

        if (/^担当[:：]/.test(line) && raw.slice(Math.max(0, idx - 3), idx).some(l => /^\d+\s*期生/.test(String(l).trim()) && isSourceStructureText(l))) {
          step1.push(SOURCE_TITLE_MARK + line); return;
        }
        if (line === DAY_SAVE_MARK || line === DAY_RESTORE_MARK) { step1.push(line); return; }

        if (idx === firstIdx && line.length <= 80 && !/[。「]/.test(line) && !/\d+\s*歳|男性|女性/.test(line) &&
          (/^[◆■●◇□○＜<【]?\s*(?:事例|症例|ケース|紙上事例)\s*[A-Za-zＡ-Ｚ0-9０-９一二三四五六七八九十]*(?:[\s　:：・]|$)/.test(line) ||
            (/実習|記録用紙|アセスメント用紙|情報収集|看護過程|ケーススタディ/.test(line) && !/[:：]/.test(line) && !/^[<＜【\[(（]/.test(line)))) {
          step1.push(SOURCE_TITLE_MARK + line);

          const titleDate = line.match(/(?:^|[^\d])(\d{1,2})[\/月](\d{1,2})日?(?![\d])/);
          if (titleDate && Number(titleDate[1]) >= 1 && Number(titleDate[1]) <= 12 && Number(titleDate[2]) >= 1 && Number(titleDate[2]) <= 31) step1.push(`${Number(titleDate[1])}月${Number(titleDate[2])}日`);
          return;
        }

        const dayNHeading = line.match(/^[【\[<＜]?\s*(?:Day|DAY|day)\s*(\d{1,2})\s*(?:[(（]([^)）]*)[)）])?\s*[】\]>＞]?$/);
        if (dayNHeading) {
          const inner = (dayNHeading[2] || '').replace(/\s+/g, '');
          const innerDay = inner.match(new RegExp(DAY_HEADING_WORD_SOURCE));
          step1.push(SOURCE_TITLE_MARK + line);

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

        const bulletHeadingRaw = line.match(BULLET_HEADING_REGEX);

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

        const slashDate = line.match(/^(\d{1,2})\/(\d{1,2})(?:\s*[\(（][月火水木金土日][\)）])?$/);
        if (slashDate && Number(slashDate[1]) >= 1 && Number(slashDate[1]) <= 12 && Number(slashDate[2]) >= 1 && Number(slashDate[2]) <= 31) {
          step1.push(`${Number(slashDate[1])}月${Number(slashDate[2])}日`);
          soapPart = null;
          return;
        }

        const soap = line.match(SOAP_PREFIX_REGEX);
        if (soap) {
          soapPart = soap[1] || soap[2];
          const body = line.slice(soap[0].length);
          if (/[AP]/.test(soapPart)) step1.push(SOAP_ASSESSMENT_MARK + `${soapPart}) ${body}`);
          else if (body) step1.push(body);
          return;
        }

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

      const out = [];
      for (let i = 0; i < step1.length; i++) {
        const cur = step1[i].trim();
        const nextIdx = k => { let j = k; while (j < step1.length && step1[j].trim() === '') j++; return j; };
        const endsWithComma = /、$/.test(cur) && cur.length <= 60 && !cur.startsWith(SOURCE_TITLE_MARK) && !cur.startsWith(SOAP_ASSESSMENT_MARK) && !cur.startsWith(GENERIC_LIST_MARK);
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

        if ((isQuoteOnly && !followed) || joined === cur) { out.push(step1[i]); continue; }
        out.push(joined);
        i = last;
      }

      const result = [];
      out.forEach(line => {
        const t = line.trim();
        if (t.length > 100 && !/^[^:：「」。]{1,14}[:：]/.test(t) && !/^\d{1,2}[:時]\d{2}/.test(t) && !t.startsWith(SOURCE_TITLE_MARK) && !t.startsWith(SOAP_ASSESSMENT_MARK) && !t.startsWith(GENERIC_LIST_MARK)) {
          const sentences = splitSentencesOutsideQuotes(t);
          if (sentences.length >= 3) { sentences.forEach(s => result.push(s)); return; }
        }
        result.push(line);
      });

      let currentNeed = null;
      return result.map(line => {
        const t = String(line).trim();
        const head = t.match(/^\u0002NEED(\d{1,2})\u0002(.*)$/);
        if (head) { currentNeed = Number(head[1]); return SOURCE_TITLE_MARK + head[2]; }
        if (/^[【\[＜<■●◆]/.test(t) || t.startsWith(SOURCE_TITLE_MARK)) currentNeed = null;
        return currentNeed && t && !t.startsWith(SOAP_ASSESSMENT_MARK) && !t.startsWith(GENERIC_LIST_MARK) && t !== DAY_SAVE_MARK && t !== DAY_RESTORE_MARK ? `\u0003${currentNeed}\u0003${t}` : line;
      });
    }

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

          const name = /^P$/i.test(row[0]) && /mg\/dL/i.test(unit || v) ? 'P(リン)' : row[0];
          return `${name} ${v}${unit ? ` ${unit}` : ''}${ref && !/^[-ー－―‐]+$/.test(ref) ? ` (基準値: ${ref})` : ''}`;
        };
        const days = valueCols.map(k => tabTableColumnDay(cells[k]));
        out.push(SOURCE_TITLE_MARK + cells.join(' '));
        if (days.every(Boolean)) {

          out.push(DAY_SAVE_MARK);
          valueCols.forEach((k, n) => {
            const list = rows.map(r => line(r, k)).filter(Boolean);
            if (!list.length) return;
            out.push(days[n]);
            list.forEach(l => out.push(l));
          });
          out.push(DAY_RESTORE_MARK);
        } else {

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

      return withExtractionContext(text, () => groupClinicalPhrasesWithTimestampsInner(text));
    }
    function groupClinicalPhrasesWithTimestampsInner(text) {
      const extracted = [];
      let globalTimestamp = "日時不明";

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
        if (raw === '翌日' || raw === '翌朝') {
          dayLabel = nextDayLabel(dayLabel) || raw;
          lastClockMin = null;
          return dayLabel;
        }
        dayLabel = normalizeDayLabel(raw);
        lastClockMin = null;
        return dayLabel;
      }

      function setDayFromHeading(text) {
        const d = extractDayLabelFromHeading(text);
        if (!d) return false;
        dayLabel = d;
        lastClockMin = null;
        globalTimestamp = d;
        return true;
      }
      // ==========================================================================

      // ------------------------------------------------------------------------

      let admissionPhase = 'unknown'; // Unknown stays unknown: do not default undated records to pre-admission
      function updateAdmissionPhase(text) {
        const signal = detectAdmissionPhaseSignal(text);
        if (signal) admissionPhase = signal;
      }

      let currentSourceLine = -1;
      let currentNeedHint = null;
      // A disease's general symptom list is split per symptom so each can be tagged by meaning; the pieces stay flagged as disease background, never patient evidence.
      function splitDiseaseGeneralList(str) {
        return String(str || '').normalize('NFKC').split(/[、,・](?![^(]*\))/).map(x => x.replace(/など$/, '').trim()).filter(x => x.length >= 2);
      }
      function pushExtracted(obj) {
        // Background fields (name, age, history, diagnosis) are pre-admission by nature; everything else stays unknown until a dated heading says otherwise.
        const prevSameLine = extracted.length && extracted[extracted.length - 1]._line === currentSourceLine ? extracted[extracted.length - 1] : null;
        const phaseNow = admissionPhase === 'unknown' && prevSameLine && prevSameLine.admissionPhase === 'preadmission' ? 'preadmission' : admissionPhase === 'unknown' && (/^(?:氏名|年齢|性別|既往歴|現病歴|生活歴|家族構成|家族関係|職業|診断名|手術術式|感染症)$/.test(obj.fieldLabel || '') || (!obj.isLabOrVital && typeof isPatientIdentityLine === 'function' && isPatientIdentityLine(obj.text))) ? 'preadmission' : admissionPhase;
        extracted.push({ ...obj, admissionPhase: phaseNow, _line: currentSourceLine, ...(currentNeedHint && !obj.isUnnecessaryBoilerplate ? { needHint: currentNeedHint } : {}) });
      }

      let pendingFieldLabelKeys = null;

      let tableColumnPhases = [];

      let tableSerial = 0;

      let tableHasRefColumn = false;
      const REFERENCE_HEADER_REGEX = /^(?:基準値|正常値|基準範囲|参考値|正常範囲)(?:[:：]|\s|$)/;

      const isLabPlaceholderCell = (line) => /^[-−ー―‐]$/.test(line || '');

      const isComparatorRefCell = (line) => /^[<>≦≧≤≥＜＞]\s*[\d.,]+\s*[^\s]{0,12}$/.test(line || '') || /^[\d.,]+\s*[^\s\d]{0,12}?(?:以下|以上|未満)$/.test(line || '');
      const isTableValueCell = (line) => !!line && (isLabPlaceholderCell(line) || isComparatorRefCell(line) || BARE_LAB_VALUE_REGEX.test(line));

      const restoreExponent = (s) => s.replace(/×\s*10([2-9])(?=\s*\/)/g, '×10^$1');

      const looksLikeReferenceRangeLine = (line) => /^[\d,]+(?:\.\d+)?\s*[〜\-~]\s*[\d,]+/.test(line || '') || isComparatorRefCell(line);

      const BARE_DURATION_REGEX = /^\d+(?:分|時間|秒|日)$/;

      const BARE_VITAL_LABEL_REMNANT_REGEX = /^バイタルサイン/;

      function pushOrMerge(fragmentText, lineStartIndex, extraProps) {

        if (isBareFieldHeaderOnly(fragmentText)) return;
        const isVitalLabelRemnantToMerge = extracted.length > lineStartIndex && BARE_VITAL_LABEL_REMNANT_REGEX.test(fragmentText);
        if (UNNATURAL_START_REGEX.test(fragmentText) || isDateOnlyText(fragmentText) || BARE_DURATION_REGEX.test(fragmentText) || isVitalLabelRemnantToMerge) {
          if (extracted.length > lineStartIndex) {

            let prev = extracted[extracted.length - 1];
            if (BARE_DURATION_REGEX.test(fragmentText) && prev.isLabOrVital) {
              prev = null;
              for (let k = extracted.length - 1; k >= lineStartIndex; k--) if (!extracted[k].isLabOrVital) { prev = extracted[k]; break; }
              if (!prev) { pushExtracted({ text: fragmentText, timestamp: globalTimestamp, ...extraProps }); return; }
            }
            prev.text = cleanExtractedPhrase(prev.text + fragmentText);
            return;
          }

          if (isDateOnlyText(fragmentText) || BARE_DURATION_REGEX.test(fragmentText) || fragmentText.replace(/[、。\s]/g, '').length < 8) return;
        }
        pushExtracted({ text: fragmentText, timestamp: globalTimestamp, ...extraProps });
      }

      const WRAPPED_ENUM_VALUE_CONTINUATION_REGEX =
        /(●[^\n：:。、,]{1,20})\r?\n[ \t]*([0-9０-９]+(?:\.[0-9]+)?[^\s、,。\n]{0,10}[、,])/g;
      text = text.replace(WRAPPED_ENUM_VALUE_CONTINUATION_REGEX, '$1：$2');

      const SPEAKER_LEAD_ONLY_REGEX = /^(?:本人|患者|患者様|担当看護師|受け?持ち?看護師|看護師|Ns|主治医|担当医|執刀医|医師|Dr\.?|PT|OT|理学療法士|作業療法士|薬剤師|栄養士|家族|長男|長女|次男|次女|妻|夫|息子|娘|嫁)(?:さん|氏)?(?:より|から|が|は)?[:：]?$/;
      const lines = (() => {

        const rawWithHints = preprocessFreeFormLines(expandTabSeparatedLabTables(normalizeMarkdownLabTables(text.split(/\r?\n/))));
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

          if (/の\s*$/.test(line) && /^(?:癒?着があり剥離)/.test(String(raw[i + 1] || '').trim())) {
            line = line.trimEnd() + raw[++i].trim();
          }
          const inlineDayHeading = line.match(/^(.*?[^\s<＜])\s*([<＜]?実習\s*\d+\s*日[目日][^<＜>＞]{0,40}[>＞)）]?)(.*)$/);
          if (inlineDayHeading && inlineDayHeading[1].trim().length >= 4) {
            pushJoined(inlineDayHeading[1]);
            pushJoined(inlineDayHeading[2].replace(/^(?![<＜])/, '<').replace(/[)）]$/, '>').replace(/(?<![>＞])$/, '>'));
            if (inlineDayHeading[3].trim()) pushJoined(inlineDayHeading[3].trim());
            continue;
          }

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

      const peekText = k => { const t = String(lines[k] || '').trim(); const hm = t.match(NEED_HINT_REGEX); return hm ? t.slice(hm[0].length).trim() : t; };

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
        if (cleanLine.startsWith(GENERIC_LIST_MARK)) {
          splitDiseaseGeneralList(cleanLine.slice(GENERIC_LIST_MARK.length).trim()).forEach(sym => pushExtracted({ text: cleanExtractedPhrase(sym), timestamp: globalTimestamp, diseaseGeneral: true }));
          markerOnlyRunCount = 0; timestampBeforeMarkerRun = null;
          continue;
        }
        if (cleanLine.startsWith(SOAP_ASSESSMENT_MARK)) {
          pushExtracted({ text: cleanLine.slice(SOAP_ASSESSMENT_MARK.length).trim(), timestamp: globalTimestamp, isUnnecessaryBoilerplate: true });

          markerOnlyRunCount = 0; timestampBeforeMarkerRun = null;
          continue;
        }
        if (cleanLine.startsWith(SOURCE_TITLE_MARK)) {
          const afterMark = cleanLine.slice(SOURCE_TITLE_MARK.length);
          const isLabTemplate = afterMark.startsWith(LAB_TEMPLATE_MARK);
          pushExtracted({ text: cleanExtractedPhrase(isLabTemplate ? afterMark.slice(LAB_TEMPLATE_MARK.length) : afterMark), timestamp: globalTimestamp, isUnnecessaryBoilerplate: true, ...(isLabTemplate ? { unnecessaryKind: 'lab-template' } : {}) });
          continue;
        }

        const dayOfSentence = cleanLine.match(/^(入院当日|入院前日|手術当日|手術前日|手術翌日|術後\s*\d+\s*日目|入院\s*\d+\s*日目|産褥\s*\d+\s*日目)(?:の|には|では|に|は|で|も)/);
        if (dayOfSentence) { globalTimestamp = applyTimeMarker(dayOfSentence[1].replace(/\s+/g, '')); updateAdmissionPhase(globalTimestamp); }

        const startedWithBracket = /^[\[【]/.test(cleanLine);

        const startedWithHeadingBullet = /^[■□◆◇▪]/.test(cleanLine);

        const numberedChapterHeadingMatch = cleanLine.match(/^\d{1,2}[.．)）]\s*([^\d\s:：。、,][^:：。、,]{0,29})$/);
        const isNumberedChapterHeading = !!numberedChapterHeadingMatch &&
          !/(なし|無し|あり|有り|良好|不良|痛|実施|施行|使用|↑|↓|認め|みられ|見られ|摂取|覚醒|出現|持続|訴え|増強|軽減|低下|上昇|改善|悪化|している|していた|した$|する$)/.test(numberedChapterHeadingMatch[1]) &&
          !/\d/.test(numberedChapterHeadingMatch[1].replace(/(?:術後|術前|入院|産褥)?\s*\d+\s*日目/g, ''));
        cleanLine = cleanLine.replace(/^(?:[・○●◯◎□■▪▫◆◇][\s　]*)+/, '');

        const beforeSheetPrefix = cleanLine;
        cleanLine = cleanLine.replace(/^[SO]-\d+\s+(?=[\[【])/, '').replace(/^\[(?:未分類|入院前|入院後|不足情報)\]\s*(?=\[[SO]\])/, '').replace(/^\[[SO]\]\s+/, '');
        // Re-imported sheet line: a leading background label in brackets ("[既往歴] 60歳 …") is the field label, so it stays pre-admission.
        if (cleanLine !== beforeSheetPrefix) cleanLine = cleanLine.replace(/^\[(氏名|年齢|性別|既往歴|現病歴|生活歴|家族構成|家族関係|職業|診断名)\]\s*/, '$1: ');
        if (!cleanLine) continue;

        if (/^【\d+\.\s*[^】]{1,40}】/.test(cleanLine)) { globalTimestamp = '日時不明'; dayLabel = null; lastClockMin = null; admissionPhase = 'unknown'; }

        if (isNumberedChapterHeading) {
          pushExtracted({ text: cleanExtractedPhrase(cleanLine), timestamp: globalTimestamp, isUnnecessaryBoilerplate: true });
          const chapterPhase = numberedChapterHeadingMatch[1].match(/^(手術当日|手術前日|入院当日|入院\d+日目|術後\d+日目|術前|術後)/);
          if (chapterPhase) {
            globalTimestamp = applyTimeMarker(chapterPhase[1]);
            updateAdmissionPhase(globalTimestamp);
          }
          continue;
        }

        cleanLine = cleanLine.replace(/\by\s*GTP\b/i, 'γGTP');

        if (/^[＜<][^＜<＞>]{1,40}[＞>）)]?$/.test(cleanLine) && !/^[＜<]\s*[\d.]/.test(cleanLine)) {
          setDayFromHeading(cleanLine);
          updateAdmissionPhase(cleanLine);
          pushExtracted({ text: cleanExtractedPhrase(cleanLine), timestamp: globalTimestamp, isUnnecessaryBoilerplate: true });
          continue;
        }

        const periodHeading = cleanLine.match(/^(入院時|入院前|術前|術中|術後|手術当日|手術前日)の(?:状況|様子|経過|状態|記録|情報)$/) ||
          (/^入院から手術(?:まで|前)の経過$/.test(cleanLine) ? [cleanLine, '術前'] : null);
        if (periodHeading) {
          globalTimestamp = applyTimeMarker(periodHeading[1]);
          updateAdmissionPhase(globalTimestamp);
          pushExtracted({ text: cleanExtractedPhrase(cleanLine), timestamp: globalTimestamp, isUnnecessaryBoilerplate: true });
          continue;
        }

        if (/^看護記録(?:[(（][^)）]{0,30}[)）])?$/.test(cleanLine) && dayLabel) {
          globalTimestamp = dayLabel;
          lastClockMin = null;
        }

        if (/^【病理結果】/.test(cleanLine)) {
          pushExtracted({ text: cleanExtractedPhrase(cleanLine), timestamp: globalTimestamp });
          continue;
        }
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
        if (isSourceStructureText(cleanLine)) {
          pendingFieldLabelKeys = null;
          pushExtracted({ text: cleanExtractedPhrase(cleanLine), timestamp: globalTimestamp, isUnnecessaryBoilerplate: true });
          continue;
        }
        if (pendingFieldLabelKeys) {
          const labels = pendingFieldLabelKeys;
          pendingFieldLabelKeys = null;

          const chosenLabel = labels.find(k => FIELD_LABEL_DEFAULT_TAGS[k]) || labels[0];
          const labeledContent = isBareStatusWord(cleanLine) ? `${chosenLabel}: ${cleanLine}` : cleanLine;
          pushExtracted({ text: cleanExtractedPhrase(labeledContent), timestamp: globalTimestamp, fieldLabel: chosenLabel });
          continue;
        }

        const PHASE_MARKER_WORD = '(?:入院時|入院前|術前|術中|術後)';

        const ADMISSION_DAY_MARKER_WORD = '(?:入院当日|入院\\d+日目)(?!の)';
        const TIME_MARKER_REGEX = new RegExp(
          '^[\\[【]?(' +
            '\\d{1,2}[:時]\\d{2}(?:分)?' +

            '|\\d{1,2}時(?=\\s|$)' +

            '|\\d{1,2}時(?:ごろ|頃|過ぎ)(?=[、,\\s]|$)' +
            '|(?:\\d{1,4}年)?\\d{1,2}月\\d{1,2}日(?:\\s*[\\(（][月火水木金土日][\\)）])?' +

            '|\\d{4}[\\/\\-]\\d{1,2}[\\/\\-]\\d{1,2}(?:\\s*[\\(（][月火水木金土日][\\)）])?(?=\\s|$|\\d{1,2}[:時]\\d{2})' +
            '|\\d{1,2}\\/\\d{1,2}(?:\\s*[\\(（][月火水木金土日][\\)）](?=\\s|$|\\d{1,2}[:時]\\d{2})|(?=\\s+\\d{1,2}[:時]\\d{2}))' +

            '|(?:術後|術前|産褥)\\s*\\d+\\s*日目' +

            '|(?:手術当日|手術前日|手術翌日|入院前日)(?![ぁ-んァ-ヶ一-龠々])' +

            '|(?:翌日|翌朝)(?=\\s|$|\\d{1,2}[:時])' +

            '|(?<=^[\\[【])' + PHASE_MARKER_WORD + '(?:\\s*[・、,\\/]\\s*' + PHASE_MARKER_WORD + ')*' +
            '|' + PHASE_MARKER_WORD + '(?:\\s*[・、,\\/]\\s*' + PHASE_MARKER_WORD + ')*(?![ぁ-んァ-ヶ一-龠々A-Za-z])' +
            '|' + ADMISSION_DAY_MARKER_WORD +

            '|\\d+\\s*[〜~\\-]\\s*\\d+日目' +
            '|\\d+日目' +
          ')[\\]】]?\\s*'
        );
        let marker;
        let markerStripped = false;
        let strippedClockOnly = true;

        const timestampBeforeMarkers = { ts: globalTimestamp, day: dayLabel, clock: lastClockMin };
        const timePhraseIsPartOfSentence = /^[\[【]?(?:(?:入院時|入院前|入院当日|入院\d+日目|手術当日|術前|術中|術後|\d+日目)\s*)+[\]】]?\s*(?:より|から|まで)/.test(cleanLine)

          || /^\d{1,2}[:時]\d{2}分?\s*(?:ごろ|頃|過ぎ)?\s*(?:に|から|まで|の)/.test(cleanLine)

          || /^[\[【]?(?:(?:\d{1,4}年)?\d{1,2}月\d{1,2}日|\d+日目)(?:\s*[(（][月火水木金土日祝][)）])?[\]】]?\s*(?:に|で|の|は|が|を|も|頃|ごろ|まで|から|より)/.test(cleanLine)

          || !!dayOfSentence;
        while (!timePhraseIsPartOfSentence && (marker = cleanLine.match(TIME_MARKER_REGEX))) {
          let rawMarker = marker[1].replace(/[\[\]【】]/g, '').replace(/\s+/g, '');

          const slashMarker = rawMarker.match(/^(?:\d{4}[\/\-])?(\d{1,2})[\/\-](\d{1,2})(?:[(（][月火水木金土日][)）])?$/);
          if (slashMarker && Number(slashMarker[1]) >= 1 && Number(slashMarker[1]) <= 12 && Number(slashMarker[2]) >= 1 && Number(slashMarker[2]) <= 31) rawMarker = `${Number(slashMarker[1])}月${Number(slashMarker[2])}日`;
          if (!/^\d{1,2}(?::\d{2}|時(?:\d{2}分?)?)$/.test(rawMarker)) strippedClockOnly = false;
          globalTimestamp = applyTimeMarker(rawMarker);
          updateAdmissionPhase(globalTimestamp);
          cleanLine = cleanLine.slice(marker[0].length).trim();
          markerStripped = true;
        }

        //

        if (startedWithBracket) {
          const strayBracketTail = cleanLine.match(/^([^\]】:：\d]{0,20})[\]】]\s*/);
          if (strayBracketTail && (markerStripped || strayBracketTail[0].length === cleanLine.length)) {
            cleanLine = cleanLine.slice(strayBracketTail[0].length).trim();
          }
        }

        if (!cleanLine) {
          if (markerStripped) {

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

        if (BARE_BLOCK_HEADING_REGEX.test(cleanLine)) {
          pushExtracted({ text: `${cleanLine}:`, timestamp: globalTimestamp, isUnnecessaryBoilerplate: true });
          continue;
        }

        if (startedWithHeadingBullet && cleanLine.length <= 30 && !/[:：。]/.test(cleanLine)) {
          const headingText = peekText(li).replace(/^(?:[□■▪◆◇][\s　]*)+/, '');
          pushExtracted({ text: cleanExtractedPhrase(headingText), timestamp: globalTimestamp, isUnnecessaryBoilerplate: true });
          continue;
        }

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

        const INLINE_UNNECESSARY_MARKER_REGEX = /[\(（](?:バイタルサイン|バイタル)[\)）]/g;
        let inlineMarkerMatch;
        while ((inlineMarkerMatch = INLINE_UNNECESSARY_MARKER_REGEX.exec(cleanLine)) !== null) {
          pushExtracted({ text: inlineMarkerMatch[0], timestamp: globalTimestamp, isUnnecessaryBoilerplate: true });
        }
        cleanLine = cleanLine.replace(INLINE_UNNECESSARY_MARKER_REGEX, '').replace(/^[、,]\s*/, '').trim();
        if (!cleanLine) continue;

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
            li = mIdx - 1;
            continue;
          }

        }

        if (/^検査項目(?:[:：]|\s|$)/.test(cleanLine)) {
          let hIdx = li + 1;
          while (hIdx < lines.length && peekText(hIdx) === '') hIdx++;
          const nextHeaderLine = hIdx < lines.length ? peekText(hIdx) : '';

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

              if (looksLikeReferenceRangeLine(peekLine2)) break;

              if (BARE_LAB_KEY_REGEX.test(colLine)) break;

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

              li = cIdx - 1;
              continue;
            }
          }
        }

        if (!isUnnecessaryBoilerplateText(cleanLine) && !isTestExplanationMemo(cleanLine) && isGenericSymptomList(cleanLine)) {
          splitDiseaseGeneralList(cleanLine).forEach(sym => pushExtracted({ text: cleanExtractedPhrase(sym), timestamp: globalTimestamp, diseaseGeneral: true }));
          continue;
        }
        if (isUnnecessaryBoilerplateText(cleanLine) || isTestExplanationMemo(cleanLine) || isGenericSymptomList(cleanLine)) {
          pushExtracted({ text: cleanExtractedPhrase(cleanLine), timestamp: globalTimestamp, isUnnecessaryBoilerplate: true });
          continue;
        }

        const isKnownBareLabKey = BARE_LAB_KEY_REGEX.test(cleanLine);
        let genericKeyPeekIdx = li + 1;
        while (genericKeyPeekIdx < lines.length && peekText(genericKeyPeekIdx) === '') genericKeyPeekIdx++;
        const genericKeyPeekLine = genericKeyPeekIdx < lines.length ? peekText(genericKeyPeekIdx) : '';
        const isGenericTableKey = !isKnownBareLabKey && cleanLine.length <= 20 && !/\d/.test(cleanLine) &&
          !isUnnecessaryBoilerplateText(cleanLine) && looksLikeReferenceRangeLine(genericKeyPeekLine);

        const isInTableKey = !isKnownBareLabKey && !isGenericTableKey && tableHasRefColumn &&
          cleanLine.length <= 25 && !/^[\d<>≦≧≤≥＜＞]/.test(cleanLine) && !isTableValueCell(cleanLine) &&
          isTableValueCell(genericKeyPeekLine);

        if (tableHasRefColumn && !isKnownBareLabKey && !isGenericTableKey && !isInTableKey) {
          tableColumnPhases = [];
          tableHasRefColumn = false;
        }
        if (isKnownBareLabKey || isGenericTableKey || isInTableKey) {
          const keyName = cleanLine.replace(/[:：]\s*$/, '').trim();

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

            const firstIsRange = tableHasRefColumn
              ? valueLines.length > 1
              : valueLines.length > 1 && (/[〜~]/.test(valueLines[0]) || /^[\d,]+(?:\.\d+)?\s*-\s*[\d,]/.test(valueLines[0]) || isComparatorRefCell(valueLines[0]));
            const refRangeLine = firstIsRange && !isLabPlaceholderCell(valueLines[0]) ? restoreExponent(valueLines[0]) : null;
            const measurementLines = firstIsRange ? valueLines.slice(1) : valueLines;
            if (measurementLines.length === 1 && !firstIsRange) {

              if (!isLabPlaceholderCell(measurementLines[0])) {
                const merged = cleanExtractedPhrase(`${keyName} ${measurementLines[0]}`);

                const singleTs = (tableHasRefColumn && tableColumnPhases.find(Boolean)) || globalTimestamp;
                if (merged.length >= 2) pushExtracted({ text: merged, timestamp: singleTs, isLabOrVital: true,
                  _lab: tableHasRefColumn ? { table: tableSerial, phases: tableColumnPhases.slice(), key: keyName, value: measurementLines[0], phase: singleTs } : undefined });
              }
            } else {

              const splitNumberAndUnit = (s) => {
                const m = (s || '').match(/^[<>≦≧≤≥＜＞]?\s*[\d,]+(?:\.\d+)?(?:\s*[〜~\-]\s*[\d,]+(?:\.\d+)?)?\s*(.*)$/);

                return m ? m[1].replace(/\s*[↑↓]$/, '').replace(/\s+[HLhl]$/, '').trim() : '';
              };
              const siblingUnit = measurementLines.map(v => isLabPlaceholderCell(v) ? '' : splitNumberAndUnit(restoreExponent(v))).find(u => u) || '';
              const rowUnit = siblingUnit || (refRangeLine ? splitNumberAndUnit(refRangeLine) : '');
              measurementLines.forEach((rawValLine, colIdx) => {
                if (isLabPlaceholderCell(rawValLine)) return;
                let valLine = restoreExponent(rawValLine);
                if (rowUnit && /^[\d,]+(?:\.\d+)?\s*[↑↓]?$/.test(valLine)) {
                  const numMatch = valLine.match(/^([\d,]+(?:\.\d+)?)\s*([↑↓]?)$/);
                  valLine = `${numMatch[1]}${rowUnit}${numMatch[2] ? ' ' + numMatch[2] : ''}`;
                }
                const withRef = refRangeLine ? `${valLine} (基準値: ${refRangeLine})` : valLine;
                const merged = cleanExtractedPhrase(`${keyName} ${withRef}`);

                const colTimestamp = tableColumnPhases[colIdx] || tableColumnPhases.find(Boolean) || globalTimestamp;
                if (merged.length >= 2) pushExtracted({ text: merged, timestamp: colTimestamp, isLabOrVital: true,
                  _lab: tableHasRefColumn ? { table: tableSerial, phases: tableColumnPhases.slice(), key: keyName, value: valLine, ref: refRangeLine, phase: colTimestamp } : undefined });
              });
            }
            li = nextIdx - 1;
          } else if (isKnownBareLabKey) {

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

          if (!valueLines.length && !isKnownBareLabKey && isGenericTableKey && genericKeyPeekLine) {
            cleanLine = `${keyName}: ${genericKeyPeekLine}`;
            li = genericKeyPeekIdx;
          } else {
            continue;
          }
        }

        const lineStartIndex = extracted.length;

        cleanLine = restoreExponent(cleanLine);

        const labRegex = new RegExp(`(${LAB_REGEX_SOURCE})`, 'gi');
        let lMatch, lSubText = cleanLine;

        const embeddedLabInSentence = (() => {
          const re = new RegExp(`(${LAB_REGEX_SOURCE})`, 'gi');
          let m;
          while ((m = re.exec(cleanLine)) !== null) {
            if (!isPlausibleLabMatch(m[0], cleanLine.slice(m.index + m[0].length))) continue;
            const after = cleanLine.slice(m.index + m[0].length).replace(/^\s+/, '');
            const before = cleanLine.slice(0, m.index).replace(/\s+$/, '');
            if (/^(?:に|まで|へ|を|が|で|と|の|→|⇒|->|から|維持|上昇|低下|回復|改善|増加|減少|前後|程度|台)/.test(after)) return true;
            if (/^[〜~～]\s*\d/.test(after)) return true;
            if (/(?:後|前|で)$/.test(before) && !/(?:入院前|術前|術後|手術前)$/.test(before)) return true;
          }

          if (/^(?!入院|術|手術)[^\d:：、。()（）\s]{1,8}(?:前|後|中)\s*[:：]/.test(cleanLine)) return true;
          if (/^(?:児|新生児)\s*[:：]/.test(cleanLine)) return true;
          return false;
        })();

        const leadLabelTime = !embeddedLabInSentence && cleanLine.match(/^(?:血液検査|採血|検査結果|バイタル(?:サイン)?|VS|V\/S|検温)\s*(?:[(（]\s*(?:(\d{1,2})\/(\d{1,2})\s*)?(\d{1,2}:\d{2})?\s*[)）]|(\d{1,2}:\d{2}))\s*[:：]?/i);
        if (leadLabelTime && (leadLabelTime[3] || leadLabelTime[4]) && new RegExp(`(${LAB_REGEX_SOURCE})`, 'i').test(cleanLine.slice(leadLabelTime[0].length))) {

          if (leadLabelTime[1] && (!dayLabel || /^(?:\d{1,4}年)?\d{1,2}月\d{1,2}日$/.test(dayLabel)) && Number(leadLabelTime[1]) >= 1 && Number(leadLabelTime[1]) <= 12 && Number(leadLabelTime[2]) >= 1 && Number(leadLabelTime[2]) <= 31) {
            applyTimeMarker(`${Number(leadLabelTime[1])}月${Number(leadLabelTime[2])}日`);
          }
          globalTimestamp = applyTimeMarker(leadLabelTime[3] || leadLabelTime[4]);
        }
        while (!embeddedLabInSentence && (lMatch = labRegex.exec(cleanLine)) !== null) {

          if (!isPlausibleLabMatch(lMatch[0], cleanLine.slice(lMatch.index + lMatch[0].length))) continue;

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

          const glucoseQual = cleanLine.slice(0, lMatch.index).match(/(随時|早朝空腹時|空腹時|食後\s*\d*\s*時間?)\s*$/);
          if (glucoseQual && /^(?:血糖|BS|GLU|グルコース)/i.test(lClean)) {
            const qual = glucoseQual[1].replace(/\s+/g, '');
            lClean = lClean.replace(/^(血糖値?|BS|GLU|グルコース)/i, `$1(${qual})`);
            if (!/空腹/.test(qual)) lClean = lClean.replace(/\s*\(基準値:[^)]*\)/, '');
            lSubText = lSubText.replace(new RegExp(`${glucoseQual[1]}\\s*(?=${lMatch[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`), '');
          }

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

        lSubText = lSubText
          .replace(/[\(（]\s*[\)）]/g, '')
          .replace(/[、。](?=[、。])/g, '')
          .trim();

        if (extracted.length > lineStartIndex) {
          lSubText = splitSentencesOutsideQuotes(lSubText).filter(sent => {
            const core = sent.replace(/[、。\s,]/g, '');

            const bare = core.replace(/[(（][\d\/:：〜~\-\s]*[)）]/g, '').replace(/\d{1,2}:\d{2}/g, '').replace(/[:：【】\[\]]/g, '');
            if (/^(?:血液検査|採血|検査|検査結果|血液データ|バイタル(?:サイン)?|VS|V\/S|検温)$/i.test(bare)) return false;
            return !(core.length <= 12 && !/\d/.test(core) && /(?:では|には|は|時|随時|空腹時|食後|結果|検査)$/.test(core));
          }).join('');

          lSubText = lSubText.replace(/^[【\[]?(?:血液検査|採血|検査結果|検査|バイタル(?:サイン)?|検温)[】\]]?\s*(?:[(（][^)）]*[)）])?\s*[:：]?\s*[、,]\s*/, '');
        }

        const fieldRegex = new RegExp(FIELD_LABEL_REGEX_SOURCE, 'g');
        const fieldMatches = [];
        let fMatch;
        while ((fMatch = fieldRegex.exec(lSubText)) !== null) {
          fieldMatches.push({ key: normalizeFieldLabelHeadingWord(fMatch[1]), start: fMatch.index, contentStart: fMatch.index + fMatch[0].length });
        }

        if (fieldMatches.length > 0) {

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

            const periodIdx = m.key === '主訴' ? -1 : lSubText.indexOf('。', m.contentStart);
            const segmentEnd = (periodIdx !== -1 && periodIdx < hardEnd) ? periodIdx + 1 : hardEnd;
            const content = cleanExtractedPhrase(lSubText.slice(m.contentStart, segmentEnd).replace(/[、。]\s*$/, ''));

            const isDateOnlyContent = isDateOnlyText(content);
            if (content.length >= 1 && !isDateOnlyContent && !isBareFieldHeaderOnly(content)) {

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

                const labeledContent = isBareStatusWord(content) ? `${m.key}: ${content}` : content;
                pushExtracted({ text: labeledContent, timestamp: globalTimestamp, fieldLabel: m.key });
              }
            }

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

        let remainderText = lSubText.trim();
        remainderText = remainderText.replace(/^(?:入院時(?:[、,]|\s+|(?=患者は|本日は)))?(?:患者は|本日は)?/, '').trim();

        if (isEmptyColonHeaderLine(remainderText)) {
          if (remainderText.length >= 1) pushExtracted({ text: cleanExtractedPhrase(remainderText), timestamp: globalTimestamp, isUnnecessaryBoilerplate: true });
          continue;
        }
        splitEnumeratedPhrases(remainderText).forEach(sentence => {
          const remainder = cleanExtractedPhrase(sentence);
          if (remainder.length >= 2) pushOrMerge(remainder, lineStartIndex, { isPhrase: true });
        });
      }

      const isMergeableBlockLine = (it, timestamp) => !it.isUnnecessaryBoilerplate && !it.diseaseGeneral && !it.fieldLabel && !it.isLabOrVital &&
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

      mergeExplanationContinuations(extracted);
      mergeShortFragmentCards(extracted);

      let currentSectionLabel = null;

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

        if (currentSectionLabel && !item.fieldLabel && !hasOwnFieldLabelPrefix(item.text)) {
          if (currentSectionLabel === AMBIGUOUS_MULTI_TOPIC_SECTION_LABEL) {
            const inferredLabel = inferFieldLabelFromSectionContent(currentSectionLabel, item.text);
            if (inferredLabel) item.fieldLabel = inferredLabel;
          } else {
            item.text = cleanExtractedPhrase(`${currentSectionLabel}: ${item.text}`);
          }
        }
      });

      const firstDatedIdx = extracted.findIndex(it => !it.isUnnecessaryBoilerplate && it.timestamp && it.timestamp !== '日時不明');

      const PROFILE_LABEL_REGEX = /^(?:氏名|年齢|性別|現病歴|既往歴|診断名|病名|生活歴|主訴|入院日|入院目的|家族構成|家族歴|職業)$/;
      const hasProfileIntro = firstDatedIdx > 0 && extracted.slice(0, firstDatedIdx).some(it => !it.isUnnecessaryBoilerplate &&
        ((it.fieldLabel && PROFILE_LABEL_REGEX.test(it.fieldLabel)) || /^(?:氏名|現病歴|既往歴|診断名|主訴|入院日)\s*[:：]/.test(it.text)));
      if (hasProfileIntro) {

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

      extracted.forEach(it => { if (!it.isUnnecessaryBoilerplate && isOcrNoiseText((it.text || '').trim())) it.isUnnecessaryBoilerplate = true; });
      splitHistoricalCurrentStatements(extracted, text);
      mergeSameTimeVitals(extracted);
      mergeVitalCheckHeadings(extracted);
      groupComparisonLabTables(extracted);
      splitIndependentCareChanges(extracted);
      mergeClinicalEpisodeCards(extracted);
      attachStaffQuestions(extracted);
      splitFamilySpeechSentences(extracted);
      splitMixedSubjectiveObjective(extracted);
      mergeDanglingObservations(extracted);
      extracted.forEach(item => {
        if (!item.diseaseGeneral && (isSourceStructureText(item.text) || isTestExplanationMemo(item.text) || isGenericSymptomList(item.text))) item.isUnnecessaryBoilerplate = true;
        delete item._line; delete item._lab;
      });
      return extracted;
    }

    function splitHistoricalCurrentStatements(list, source) {
      const admitted = /入院日|入院時の(?:状況|様子)|入院となった/.test(source);
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        if (it.isUnnecessaryBoilerplate || it.timestamp !== '入院前' || !labelPrimaryNeeds(it.text)) continue;
        const m = it.text.match(/^(.+?)[。\s]*(現在は|今は)(.+)$/);
        if (!m) continue;
        const label = it.text.match(/^([^:：]+)[:：]/)?.[1];
        list.splice(i, 1,
          { ...it, text: cleanExtractedPhrase(m[1]), admissionPhase: 'preadmission' },
          { ...it, text: cleanExtractedPhrase(`${label}: ${m[2]}${m[3]}`), timestamp: admitted ? '入院時' : '現在（日時不明）', admissionPhase: admitted ? 'postadmission' : 'unknown' });
        i++;
      }
    }

    function splitIndependentCareChanges(list) {
      const domain = t => /酸素/.test(t) ? 'oxygen' : /硬膜外/.test(t) ? 'analgesia' : /フットポンプ/.test(t) ? 'compression' : null;
      for (let i = 0; i < list.length; i++) {
        const it = list[i], m = it.text.match(/^(回診[:：]\s*)?(.*)$/);
        if (it.isUnnecessaryBoilerplate || !m) continue;
        const parts = m[2].split(/[、,]/).map(p => p.trim()).filter(Boolean);
        if (parts.length < 2 || parts.some(p => !domain(p) || !/(?:OFF|ON|中止|終了|抜去|開始|装着)$/.test(p)) || new Set(parts.map(domain)).size < 2) continue;
        list.splice(i, 1, ...parts.map(text => ({ ...it, text: (m[1] || '') + text })));
        i += parts.length - 1;
      }
    }

    function mergeClinicalEpisodeCards(list) {
      const domain = t => {
        if (/膀胱|カテーテル|排尿|排便|尿量|医師.*説明|主治医.*説明|明日|予定|翌日|今後|(?:昨日|前日).*?(?:本日|今日|現在)/.test(t)) return null;
        if (/リハビリ|(?:^|\s|:)RH\b|可動域|ROM|SLR|荷重|移乗|立位保持|歩行訓練|セッティング|体重(?:を)?かけ|動かし始め/.test(t)) return 'rehab';
        if (/創部|ガーゼ/.test(t) && !PAIN_TEXT_REGEX.test(t)) return 'wound';
        if (/呼吸困難|肺Air|排痰|痰の性状/.test(t)) return 'respiratory';
        if (/一人暮らし|長男|次男|別世帯|同町内/.test(t) && !/キーパーソン|援助者|「|頼れ|迷惑/.test(t)) return 'household';
        if (/足背動脈|知覚異常|冷感|しびれ|感覚異常/.test(t)) return 'peripheral';
        return null;
      };
      for (let i = 1; i < list.length;) {
        const prev = list[i - 1], cur = list[i], topic = domain(prev.text);
        const sameTopic = topic && (domain(cur.text) === topic || topic === 'rehab' && PAIN_SCORE_REGEX.test(cur.text));
        const adjacent = prev._line !== undefined && cur._line !== undefined && cur._line >= prev._line && cur._line - prev._line <= 2;
        const safe = sameTopic && adjacent && prev.timestamp === cur.timestamp && (/\d{1,2}:\d{2}/.test(cur.timestamp) || topic === 'household' && cur.timestamp === '入院前') &&
          prev.admissionPhase === cur.admissionPhase && prev.needHint === cur.needHint &&
          !prev.isUnnecessaryBoilerplate && !cur.isUnnecessaryBoilerplate && !prev.diseaseGeneral && !cur.diseaseGeneral && !prev.isLabOrVital && !cur.isLabOrVital &&
          (!prev.fieldLabel || topic === 'household' && prev.fieldLabel === '家族関係') && !cur.fieldLabel && !PATIENT_EDUCATION_REGEX.test(cur.text) &&
          prev.text.length + cur.text.length <= 600;
        if (!safe) { i++; continue; }
        prev.text = cleanExtractedPhrase(prev.text.replace(/[、\s]+$/, '') + (/。$/.test(prev.text) ? '' : /(?:ず|あるも)$/.test(prev.text) ? '、' : '。') + cur.text);
        prev._line = cur._line;
        list.splice(i, 1);
      }
    }

    const S_QUOTE_REGEX = /["「][^"「」]*[ぁ-んァ-ヶ一-龠々][^"「」]*["」]/;

    const S_KEYWORD_REGEX = /(?:訴え|発言|(?:と|」)\s*話す)(?!\s*(?:なし|無し|なく|無く|ない|無い|は(?:なし|無し|ない|無い|なく)|も(?:なし|なく|ない)))/;
    function countSubstantiveLeadSentences(leadText) {
      return leadText.split('。').map(s => s.trim()).filter(s => s.length >= 4).length;
    }

    const STAFF_QUOTE_REGEXES = [
      /(?:夜勤|日勤|担当|受け持ち)?(?:主治医|担当医|執刀医|医師|Dr\.?|看護師|Ns\.?|NS\.?|理学療法士|作業療法士|PT|OT|薬剤師|栄養士)(?:さん)?(?:より|から|が|は)[^「」。]{0,15}(?:「[^」]*」[、・\s]*)+/g,
      /「[^」]*」と(?:主治医|担当医|執刀医|医師|Dr\.?|看護師|Ns|理学療法士|作業療法士|PT|OT)[^。]{0,6}(?:説明|言われ|伝え|指導)/g
    ];
    function stripStaffQuotes(text) {

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
      return (chunk.isUnnecessaryBoilerplate ? 'unnecessary' : null)
        || userLearned?.preferredType
        || (chunk.fieldLabel ? (FIELD_LABELS.find(f => f.key === chunk.fieldLabel)?.type || 'o') : null)
        || (chunk.isUnnecessaryBoilerplate ? 'unnecessary' : null)
        || predictSOTypeFromNarrative(cleanedText);
    }

    // Symptoms named in a disease's general description map to needs by meaning; these cards stay flagged as disease background.
    const DISEASE_SYMPTOM_NEEDS = [
      [/発熱|熱型/, [7]], [/倦怠|疲れやす|易疲労|疲労/, [4, 5]], [/体重減少|食欲/, [2]], [/脱毛|光線過敏|凍瘡|レイノー|紅斑|皮疹|発疹|潰瘍/, [8]],
      [/光線過敏/, [8, 9]], [/関節痛|筋肉痛|筋痛|関節炎/, [4]], [/むくみ|浮腫|腎炎|蛋白尿|腎/, [3]], [/出血|貧血|めまい|けいれん|痙攣/, [9]],
      [/息切れ|呼吸困難|胸膜炎|胸水|咳/, [1]], [/頭痛/, [4, 5]], [/不安|抑うつ|うつ/, [10]],
      // v.71 knowledge ingestion (SLE research brief; see docs/knowledge-guideline.md ledger). Numbers are nursing-assessment associations, not a source table.
      [/関節痛|関節炎|筋肉痛|筋痛/, [5, 12]], [/脱毛|蝶形紅斑|円板状|瘢痕/, [8, 10]], [/光線過敏/, [14]], [/凍瘡/, [8, 9]], [/レイノー/, [4, 8, 9]],
      [/ループス腎炎|腎炎|蛋白尿/, [2, 9, 14]], [/出血傾向|出血/, [8, 9]], [/貧血/, [1, 4, 5, 12]], [/息切れ|呼吸困難|胸膜炎|胸水/, [4, 5]],
      [/心外膜炎|心膜炎|心膜液|タンポナーデ/, [1, 4, 5, 9]], [/蝶形紅斑|円板状/, [9]], [/神経精神|NPSLE|精神神経|神経症状|^神経|神経[、,・]/, [4, 9, 10, 14]],
      [/頭痛/, [9, 10]], [/感染|日和見/, [7, 9, 14]], [/抗リン脂質|血栓|APS/, [9]],
      // v.78 site research (ledger): disease-level associations only; drug names are not pasted onto one item.
      [/膵頭部(?:がん|癌)|膵(?:がん|癌)/, [2, 3, 4, 9, 14]], [/胃全摘|胃切除/, [2, 3, 4, 8, 9, 14]], [/S状結腸(?:がん|癌)|結腸(?:がん|癌)/, [2, 3, 4, 9, 14]],
      [/大腿骨(?:頸|頚)部骨折/, [3, 4, 5, 9, 14]], [/糖尿病/, [2, 3, 4, 8, 9, 14]], [/高血圧/, [4, 9, 14]], [/脂質異常症/, [2, 4, 14]],
      [/陳旧性心筋梗塞/, [1, 4, 9, 14]], [/子宮筋腫|過多月経/, [3, 9, 12]], [/白内障/, [4, 9, 14]]
    ];
    function diseaseSymptomNeeds(text) {
      const t = String(text || '').normalize('NFKC');
      return Array.from(new Set(DISEASE_SYMPTOM_NEEDS.filter(([re]) => re.test(t)).flatMap(([, ids]) => ids))).sort((a, b) => a - b);
    }
    function computeLocalTagsAndType(chunk, cleanedText, userLearned) {
      if (chunk.diseaseGeneral && !chunk.isUnnecessaryBoilerplate) {
        const ids = diseaseSymptomNeeds(cleanedText);
        if (ids.length) return { detectedHIds: ids, predictedType: 'o' };
      }

      if (chunk.isUnnecessaryBoilerplate || isPatientIdentityLine(cleanedText)) {
        return { detectedHIds: [], predictedType: chunk.isUnnecessaryBoilerplate ? 'unnecessary' : 'o' };
      }
      if (hasLearnedSignal(userLearned)) {
        // Type/column learning must not disable current field and context evidence.
        const base = computeLocalTagsAndType(chunk, cleanedText, null);
        const detectedHIds = Array.from(new Set([...base.detectedHIds, ...(userLearned.preferredHendersonIds || [])]))
          .filter(id => !Object.hasOwn(userLearned.hendersonVotes || {}, id) || userLearned.hendersonVotes[id] > 0);
        return { detectedHIds, predictedType: predictLocalItemType(chunk, cleanedText, userLearned) };
      }

      const semanticText = chunk.fieldLabel === 'アレルギー' && isBareStatusWord(cleanedText) ? `アレルギー: ${cleanedText}` : cleanedText;
      const ruleHIds = detectMultipleHendersonTags(semanticText);
      const detectedHIds = Array.from(new Set([...ruleHIds, ...(userLearned?.preferredHendersonIds || [])]));

      if ((chunk.isLabOrVital || mentionsLabItemName(cleanedText)) && !hasLearnedSignal(userLearned)) labCategoryTags(cleanedText).forEach(h => { if (!detectedHIds.includes(h)) detectedHIds.push(h); });

      if (chunk.fieldLabel && !hasLearnedSignal(userLearned)) {
        fieldLabelHintTags(chunk.fieldLabel, cleanedText).forEach(hid => { if (!detectedHIds.includes(hid)) detectedHIds.push(hid); });
      }

      if (detectedHIds.length === 0 && !hasLearnedSignal(userLearned)) {

        if (/\d{1,3}歳|生後\s*\d+\s*(?:か月|ヶ月|カ月|ケ月|日)|日齢\s*\d+|(?:ちゃん|くん)\s*[(（]/.test(cleanedText) && /(?:男性|女性|男児|女児|男子|女子|男の子|女の子|初妊婦|経妊婦|初産婦|経産婦|妊婦|褥婦)/.test(cleanedText) && cleanedText.length <= 40) FIELD_LABEL_DEFAULT_TAGS['年齢'].forEach(h => detectedHIds.push(h));

        (FAMILY_HISTORY_DISEASE_CONTEXT_REGEX.test(cleanedText) ? [] : detectDiagnosisTagHints(cleanedText)).forEach(h => { if (!detectedHIds.includes(h)) detectedHIds.push(h); });
      }

      if (!hasLearnedSignal(userLearned) && typeof drugTagsForText === 'function' && /(?:内服|処方|点滴|注射|投与|持続|静注|使用|貼付|服薬|頓用|mg|単位|ml\/h)/i.test(cleanedText)) {
        drugTagsForText(cleanedText, { primaryOnly: true }).forEach(h => { if (h !== 9 && !detectedHIds.includes(h)) detectedHIds.push(h); });
      }

      if (chunk.needHint && !hasLearnedSignal(userLearned) && !detectedHIds.includes(chunk.needHint)) detectedHIds.push(chunk.needHint);
      let predictedType = predictLocalItemType(chunk, cleanedText, userLearned);

      if (chunk.soRole && !hasLearnedSignal(userLearned)) predictedType = chunk.soRole;
      return { detectedHIds: hasLearnedSignal(userLearned) ? detectedHIds : hendersonRelevanceFilter(cleanedText, detectedHIds), predictedType };
    }

    function isHeadingOnlyChunk(chunk, cleanedText) {
      return !!chunk.isUnnecessaryBoilerplate && isEmptyColonHeaderLine(cleanedText);
    }

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
    const PAIN_EFFECT_RULES = [
      { id: 5, re: /眠れ|睡眠|不眠|夜間覚醒|寝つ|寝れ/, label: '睡眠' },
      { id: 4, re: /動く|動かす|動け|動き|体位|体動|荷重|移乗|リハ|離床|歩行|歩く|起立|起き|端坐|車椅子|車いす|立位|訓練|可動域|ROM|SLR|運動|ベッド上|床上/, label: '動作・姿勢' },
      { id: 2, re: /食欲|食事|摂取|昼食|夕食|朝食|嘔気|嘔吐/, label: '食事' },
      { id: 3, re: /トイレ|排尿|排便|尿|便/, label: '排泄' },
      { id: 8, re: /清拭|入浴|洗髪|清潔ケア|陰部洗浄/, label: '清潔' },
      { id: 6, re: /更衣|着替/, label: '更衣' }
    ];
    function painCurrentContextText(text) {
      const source = String(text || '');
      const transition = source.search(/本日|今日|現在|今は/);
      return transition > 0 && /昨日|前日|術前|入院前/.test(source.slice(0, transition)) ? source.slice(transition) : source;
    }
    function painContextClauses(text) {
      return painCurrentContextText(text)
        .replace(/((?:痛み|疼痛)(?:のため|で)|痛くて)[、,]\s*/g, '$1')
        .replace(/((?:荷重|移乗|体位変換|歩行|歩く|動かす)[^。、,]{0,25})[、,]\s*(?=疼痛|痛み|ペインスケール|NRS)/g, '$1')
        .split(/[。\n；;、,]+/).map(s => s.trim()).filter(Boolean);
    }
    function painContextTagEvidence(items, item) {
      if (!item || !PAIN_TEXT_REGEX.test(item.text || '') || /疼痛増強(?:なし|なく|見られず)|(?:痛み|疼痛|創痛)(?:は)?(?:なし|ない|なく)/.test(item.text || '') || !item.timestamp || item.timestamp === '日時不明') return [];
      const index = items.indexOf(item);
      if (index < 0) return [];
      const near = items.filter((other, n) => other !== item && !other.deleted && other.type !== 'unnecessary' && other.timestamp === item.timestamp && Math.abs(n - index) <= 4);
      const positivePain = t => PAIN_TEXT_REGEX.test(t) && !/疼痛増強(?:なし|なく|見られず)|痛みなし|疼痛なし|疼痛(?:の)?訴え(?:なし|なく)/.test(t);
      return PAIN_EFFECT_RULES.flatMap(rule => {
        for (const other of near) {
          const text = painCurrentContextText(other.text);
          let evidence = painContextClauses(text).find(clause => rule.re.test(clause) && positivePain(clause) && detectMultipleHendersonTags(clause).includes(rule.id));
          // An extracted S/O scene preserves the explicit sequence across its sentences.
          if (!evidence && (other.sceneId || other.soMixed) && positivePain(text) && rule.re.test(text) && POSTURE_ACTIVITY_REGEX.test(text) && detectMultipleHendersonTags(text).includes(rule.id)) evidence = text;
          if (evidence) return [{ id: rule.id, label: rule.label, timestamp: other.timestamp, evidence }];
        }
        return [];
      });
    }
    function applyPainContextTags(items, cp) {
      items.forEach(item => {
        const review = cp && typeof untaggedReviewOf === 'function' ? untaggedReviewOf(cp, item) : null;
        if (item.deleted || item.type === 'unnecessary' || item.tagNotNeeded || (item.hendersonIds || []).length ||
            item.predictionSource && item.predictionSource !== 'rule' || ['none', 'accept'].includes(review?.decision) ||
            (item.editLog || []).some(e => e.kind === 'tagRemove')) return;
        const evidence = painContextTagEvidence(items, item);
        if (!evidence.length) return;
        item.hendersonIds = evidence.map(e => e.id).sort((a, b) => a - b);
        item.contextTagEvidence = evidence;
        item.patientBackground = null;
        if (item.assessmentCols) item.hendersonIds.forEach(id => { item.assessmentCols[id] = inferAssessmentColumn(item.fieldLabel, item.timestamp, item.admissionPhase) || 'unclassified'; });
      });
      return items;
    }
    function familyScreeningEvidence(items, item) {
      if (!FAMILY_HISTORY_DISEASE_CONTEXT_REGEX.test(item.text) || !item.timestamp || item.timestamp === '日時不明') return [];
      for (const other of items || []) {
        if (other === item || other.deleted || other.type === 'unnecessary' || other.timestamp !== item.timestamp) continue;
        for (const clause of splitIntoSentenceFragments(other.text)) {
          if (!/(?:がん|癌)(?:家系|の家族歴)(?:なので|のため|があるので)[^。]{0,40}(?:検診|健診)/.test(clause)) continue;
          if (/^(?:父|母|祖父|祖母|妻|夫|兄|姉|弟|妹)(?:は|が)/.test(clause) || /受け(?:ていない|ない|なかった)|受診(?:しない|していない)|予定|勧め/.test(clause)) continue;
          if (!/欠かさないようにしていた|欠かさず|受けている|受けた|受診している|受診した/.test(clause)) continue;
          return [{ id: 14, label: '学び', timestamp: other.timestamp, evidence: clause }];
        }
      }
      return [];
    }
    function applyFamilyScreeningContext(items, context = items, learningDict = {}) {
      items.forEach(item => {
        if (item.type === 'unnecessary' || item.deleted || item.tagNotNeeded || item.predictionSource === 'confirmed' || (item.editLog || []).length) return;
        const learned = learningDict[item.text] || (['fuzzy', 'tied'].includes(item.predictionSource) ? findFuzzyLearnedMatch(item.text, learningDict)?.learned : null);
        if (Object.hasOwn(learned?.hendersonVotes || {}, 14) && learned.hendersonVotes[14] <= 0) return;
        const evidence = familyScreeningEvidence(context, item);
        if (!evidence.length) return;
        item.hendersonIds = Array.from(new Set([...(item.hendersonIds || []), 14])).sort((a, b) => a - b);
        item.contextTagEvidence = [...(item.contextTagEvidence || []).filter(e => e.id !== 14), ...evidence];
        item.ruleDecision = { ruleId: 'context.family-screening', version: window.APP_FILE_VERSIONS['07'], reason: '家族のがんの記録を、同じ時期に明記された本人の検診利用行動の背景として14.学びへ関連付けた。家族の診断を本人の疾患や未充足とは扱わない。' };
        item.patientBackground = null;
        if (item.assessmentCols && !item.assessmentCols[14]) item.assessmentCols[14] = inferAssessmentColumn(item.fieldLabel, item.timestamp, item.admissionPhase) || 'unclassified';
      });
      return items;
    }
    function automaticRuleDecision(chunk, text, type) {
      let ruleId, reason;
      if (type === 'unnecessary' && chunk.isUnnecessaryBoilerplate) {
        if (/^\|?\s*:?-{3,}/.test(text)) { ruleId = 'source.table-separator'; reason = '表の列を区切る罫線で、患者の測定値や所見を含まないため除外。原文の罫線は照合用に保持。'; }
        else if (/^[<＜]/.test(text) && extractDayLabelFromHeading(text)) { ruleId = 'source.date-heading'; reason = '実習日・入院日・手術時期の見出し。日時の整理に用い、患者の所見カードから除外。'; }
        else if (/^担当[:：]/.test(text)) { ruleId = 'source.course-staff'; reason = '直前の教材表題に続く担当者名で、患者の担当者や支援者を示す記録ではないため除外。'; }
        else if (isGenericSymptomList(text) || chunk.genericListRegion) { ruleId = 'source.generic-symptom-list'; reason = '疾患の一般的な症状の列挙で、この患者に認められた所見と確認できないため除外。本人の所見として別に記載されていれば、その記録を使う。'; }
        else if (chunk.unnecessaryKind === 'lab-template') { ruleId = 'source.lab-template-row'; reason = '検査表の項目名・基準値・単位だけで測定値の無い行（未記入の様式の行）で、患者の所見ではないため除外。測定値のある行は別に検査値のカードにする。'; }
        else if (isReportMetadataLine(text)) { ruleId = 'source.report-metadata'; reason = '検査・報告書の見出しや末尾の事務情報（書類番号・施設名・担当医や診療科などの欄名・採取/受付/報告日・責任者・点数）で、患者の所見ではないため除外。'; }
        else if (isTestExplanationMemo(text, true)) { ruleId = 'source.incomplete-explanation'; reason = '検査の説明途中の文章で、患者の検査結果は書かれていないため除外。結果が別に記載されていれば、その結果は残す。'; }
        else { ruleId = 'source.structure'; reason = '資料の表題・節見出し・表の項目名で、患者の所見や測定値を含まないため除外。配下の記録は別に分類。'; }
      } else if (chunk.diseaseGeneral) { ruleId = 'source.disease-general-info'; reason = '疾患の一般的な症状の列挙の1項目。内容でタグを付けるが、この患者に認められた所見とは確認できないため、充足判定・看護計画・診断の根拠には使わない。'; }
      else if (isPatientIdentityLine(text)) { ruleId = 'background.identity'; reason = '氏名・年齢・性別を1枚の患者基本情報として保持。この紹介だけでは特定の欲求タグを付けない。'; }
      return ruleId ? { ruleId, reason, version: window.APP_FILE_VERSIONS['07'] } : null;
    }
    function removeCoveredCompositeCards(items) {
      return items.filter(item => {
        if (item.deleted || item.type === 'unnecessary' || item.predictionSource === 'confirmed' || item.tagNotNeeded || (item.editLog || []).length) return true;
        const others = items.filter(other => other !== item && other.type === item.type && (other.fieldLabel || null) === (item.fieldLabel || null) && (other.sceneId || null) === (item.sceneId || null) && rewriteNorm(other.text).length < rewriteNorm(item.text).length);
        return !hasCompleteSavedSourceCoverage(others, item.text, item.timestamp);
      });
    }
    function clinicalCardDuplicateKey(text, timestamp) {
      return `${String(timestamp || '日時不明').normalize('NFKC').replace(/\s+/g, '')}\u0000${String(text || '').normalize('NFKC').replace(/\s+/g, '').replace(/[。．.]+$/, '')}`;
    }
    // A card whose only manual edit was taking it out of 不必要 (no tag chosen, no 「タグ不要」, nothing typed) records a rejected exclusion,
    // not a classification decision: the latest rules may add tags, and nothing is lost if the card cannot be matched again.
    function isRejectedExclusionOnly(item) {
      if (!item || item.deleted || item.tagNotNeeded || item.aiSuggested || (item.hendersonIds || []).length || item.type === 'unnecessary') return false;
      const edits = (item.editLog || []).filter(e => e && e.kind !== 'create');
      return edits.length > 0 && edits.every(e => e.kind === 'type' && e.from === 'unnecessary' && e.to !== 'unnecessary');
    }
    function savedUntaggedProtection(item, cp) {
      if (item.deleted || item.type === 'unnecessary' || item.aiSuggested) return '更新対象外のカード';
      if (item.tagNotNeeded) return 'タグ不要の指定';
      if (isRejectedExclusionOnly(item)) {
        if (item.predictionSource && !['rule', 'learned', 'fuzzy', 'tied', 'confirmed'].includes(item.predictionSource)) return '分類経路の確認が必要';
        const review = typeof untaggedReviewOf === 'function' ? untaggedReviewOf(cp, item) : null;
        return review && ['none', 'accept', 'assign'].includes(review.decision) ? '了承済みのレビュー' : '';
      }
      if ((item.editLog || []).length || item.predictionSource === 'confirmed') return '手で編集・確認した分類';
      if (item.predictionSource && !['rule', 'learned', 'fuzzy', 'tied'].includes(item.predictionSource)) return '分類経路の確認が必要';
      if (typeof untaggedReviewOf !== 'function' && Object.keys(cp?.untaggedReviews || {}).length) return 'レビューの読込待ち';
      const review = typeof untaggedReviewOf === 'function' ? untaggedReviewOf(cp, item) : null;
      if (review && ['none', 'accept', 'assign'].includes(review.decision)) return '了承済みのレビュー';
      return '';
    }
    // A manual edit still belongs to the same record when only the date was resolved (or lost) between rule versions.
    function isUnknownTimestamp(ts) { return !ts || ts === '日時不明'; }
    function sameCardIgnoringUnknownTime(a, b) {
      if (!a || !b || !(isUnknownTimestamp(a.timestamp) || isUnknownTimestamp(b.timestamp))) return false;
      const k = x => String(x || '').normalize('NFKC').replace(/\s+/g, '').replace(/[。．.]+$/, '');
      return k(a.text).length >= 4 && k(a.text) === k(b.text);
    }
    function currentRuleCardForSavedItem(sourceCards, item) {
      const key = clinicalCardDuplicateKey(item.text, item.timestamp);
      const direct = sourceCards.find(i => clinicalCardDuplicateKey(i.text, i.timestamp) === key);
      if (direct) return direct;
      const relaxed = sourceCards.filter(i => sameCardIgnoringUnknownTime(i, item));
      if (relaxed.length === 1) return relaxed[0];
      if (item.fieldLabel === 'アレルギー' && /^(?:ない|なし)$/.test(item.text)) {
        const labeled = sourceCards.find(i => i.fieldLabel === item.fieldLabel && i.timestamp === item.timestamp &&
          clinicalCardDuplicateKey(i.text.replace(/^アレルギー[:：]\s*/, ''), i.timestamp) === key);
        if (labeled) return { ...labeled, text: item.text, _sourceMatchKind: 'field', sourceParentText: labeled.text };
      }
      const needle = rewriteNorm(item.text).replace(/[。．.]+$/, '');
      if (needle.length < 8 && !/^Stage\s*[IVX]+[ABC]?$/i.test(String(item.text).trim())) return null;
      const parents = sourceCards.filter(i => i.type !== 'unnecessary' && i.timestamp === item.timestamp && rewriteNorm(i.text).includes(needle));
      const parent = parents[0];
      if (!parent) return null;
      const ids = detectMultipleHendersonTags(item.text).sort((a, b) => a - b);
      const known = String(item.text).match(GALLBLADDER_OPERATIVE_FINDING_REGEX)?.[0];
      return { ...item, hendersonIds: ids, _sourceMatchKind: 'fragment', sourceParentText: parent.text, _sourceMatchAmbiguous: new Set(parents.map(p => rewriteNorm(p.text))).size > 1,
        ...(known && ids.includes(2) ? { contextTagEvidence: [{ id: 2, label: '食事', timestamp: item.timestamp, evidence: known }] } : {}) };
    }
    function hasCompleteSavedSourceCoverage(items, text, timestamp) {
      const norm = rewriteNorm(text);
      if (norm.length < 20) return false;
      const covered = new Uint8Array(norm.length);
      let fragments = 0;
      items.filter(i => !i.deleted && i.type !== 'unnecessary' && !i.aiSuggested && i.timestamp === timestamp).forEach(i => {
        const part = rewriteNorm(i.text).replace(/[。．.]+$/, '');
        if (part.length < 8) return;
        const start = norm.indexOf(part);
        if (start < 0) return;
        covered.fill(1, start, start + part.length); fragments++;
      });
      return fragments >= 2 && norm.split('').every((ch, n) => covered[n] || /[。、,．.・:：]/.test(ch));
    }
    // Reuse complete source context; append runs may omit every surrounding duplicate card.
    function refreshSavedUntaggedCards(cp, sourceText = cp?.sourceText, now = new Date().toISOString(), learningDict = globalAppData.learningUserDict) {
      if (!cp || !String(sourceText || '').trim()) return 0;
      const targets = (cp.items || []).filter(i => !savedUntaggedProtection(i, cp) || i.type === 'unnecessary' && !savedUntaggedProtection({ ...i, type: 'o' }, cp) &&
          (/^[<＜]/.test(i.text) && extractDayLabelFromHeading(i.text) || i.timestamp === '検査データ' && isTestExplanationMemo(i.text)));

      if (!targets.length) return 0;
      const sourceCards = classifyTextByRules(sourceText);
      let updated = 0;
      targets.forEach(item => {
        if (item.type === 'unnecessary') {
          const matches = sourceCards.filter(i => i.type === 'unnecessary' && rewriteNorm(i.text) === rewriteNorm(item.text));
          const heading = new Set(matches.map(i => i.timestamp)).size === 1 ? matches[0] : null;
          if (heading && heading.timestamp !== item.timestamp) {
            item.timestamp = heading.timestamp;
            item.ruleCorrectionReason = '原文で日時・場面を一意に照合し、直前の時刻や項目名ではなく該当する記録の日付へ補正。除外の判断・ID・本文は保持。';
            item.ruleTagUpdatedAt = now; item._touchedAt = now; updated++;
          }
          return;
        }
        const original = currentRuleCardForSavedItem(sourceCards, item);
        if (/^(?:ない|なし)$/.test(item.text) && item.fieldLabel !== 'アレルギー') return;
        const tableFragment = /^(?:\|[^\n]*\|\s*正常|異常\s*\|)$/.test(item.text) &&
          sourceCards.some(i => i.type === 'unnecessary' && i.timestamp === item.timestamp && i.text.includes('正常・異常') && (rewriteNorm(i.text.replace(/\|/g, '')).startsWith(rewriteNorm(item.text.replace(/\|/g, ''))) || /異常\s*\|$/.test(item.text)));
        const structureMatch = !item.diseaseGeneral && (isSourceStructureText(item.text) || isTestExplanationMemo(item.text) || isGenericSymptomList(item.text)) &&
          sourceCards.some(i => i.type === 'unnecessary' && rewriteNorm(i.text) === rewriteNorm(item.text));
        if (original?.type === 'unnecessary' || tableFragment || structureMatch) {
          item.type = 'unnecessary';
          item.hendersonIds = [];
          item.assessmentCols = {};
          if (item.timestamp === '検査データ') {
            const matches = sourceCards.filter(i => i.type === 'unnecessary' && rewriteNorm(i.text) === rewriteNorm(item.text));
            if (new Set(matches.map(i => i.timestamp)).size === 1) item.timestamp = matches[0].timestamp;
          }
          item.ruleCorrectionReason = '原文で確認した資料の見出し・表構造・説明メモ。患者所見から除外し、原文とカードIDを保持。';
          item.ruleTagUpdatedAt = now; item._touchedAt = now; updated++; return;
        }
        if (!original || original.type === 'unnecessary' || !original.hendersonIds.length) return;
        const learned = learningDict?.[item.text] || (['fuzzy', 'tied'].includes(item.predictionSource) ? findFuzzyLearnedMatch(item.text, learningDict || {})?.learned : null);
        const additions = original.hendersonIds.filter(id => !(item.hendersonIds || []).includes(id) &&
          (!Object.hasOwn(learned?.hendersonVotes || {}, id) || learned.hendersonVotes[id] > 0));
        if (!additions.length) return;
        item.hendersonIds = Array.from(new Set([...(item.hendersonIds || []), ...additions])).sort((a, b) => a - b);
        if (isRejectedExclusionOnly({ ...item, hendersonIds: [] }) && item.type === 'unclassified' && (original.type === 'o' || original.type === 's')) item.type = original.type;
        item.patientBackground = null;
        item.assessmentCols = { ...(item.assessmentCols || {}) };
        item.hendersonIds.forEach(id => {
          if (!item.assessmentCols[id]) item.assessmentCols[id] = inferAssessmentColumn(item.fieldLabel, item.timestamp, item.admissionPhase) || 'unclassified';
        });
        if (original.contextTagEvidence) item.contextTagEvidence = original.contextTagEvidence.filter(e => item.hendersonIds.includes(e.id)).map(e => ({ ...e }));
        item.ruleCorrectionReason = '同じ原文・日時で確認できた最新ルールのタグ不足を補正。学習したS/O・既存タグ・手書き評価は保持し、明示的に外したタグは戻さない。';
        if (original.sourceParentText) item.sourceContextText = original.sourceParentText;
        if (original._sourceMatchKind === 'fragment') item.ruleCorrectionReason = '最新の原文カードに含まれる保存済みの分割片を、同じ日時と本文で照合。分割片自身の明示的な所見だけを根拠にタグを補正し、親カードの別内容のタグは引き継がない。';
        item.ruleTagUpdatedAt = now;
        item._touchedAt = now;
        updated++;
      });
      return updated;
    }
    function classifyTextByRules(text) {
      const src = (text || '').trim().normalize('NFKC');
      const out = [];

      withExtractionContext(src, () => groupClinicalPhrasesWithTimestamps(src).forEach(chunk => {
        const cleanedText = cleanExtractedPhrase(chunk.text);
        if (cleanedText.length < 2 || isBareFieldHeaderOnly(cleanedText) || isHeadingOnlyChunk(chunk, cleanedText) || out.some(i => clinicalCardDuplicateKey(i.text, i.timestamp) === clinicalCardDuplicateKey(cleanedText, chunk.timestamp))) return;
        const { detectedHIds, predictedType } = computeLocalTagsAndType(chunk, cleanedText, null);
        out.push({ text: cleanedText, timestamp: chunk.timestamp || '日時不明', type: predictedType, hendersonIds: detectedHIds.slice().sort((a, b) => a - b), fieldLabel: chunk.fieldLabel || null, ruleDecision: automaticRuleDecision(chunk, cleanedText, predictedType), ...(chunk.diseaseGeneral ? { diseaseGeneral: true } : {}), ...(chunk.sceneId ? { sceneId: chunk.sceneId } : {}), ...(chunk.soMixed ? { soMixed: true } : {}), ...(chunk.labRows ? { labRows: chunk.labRows } : {}) });
      }));
      return removeCoveredCompositeCards(applyFamilyScreeningContext(applyPainContextTags(applySceneTagInheritance(out))));
    }

    function manualClassificationLineage(item, path = new Set()) {
      if (!item || path.has(item) || path.size >= 100) return null;
      const nextPath = new Set(path).add(item);
      const operation = (item.editLog || []).slice().reverse().find(e => ['merge', 'split'].includes(e.kind));
      const sources = operation?.sourceCards?.length ? operation.sourceCards
        : operation?.kind === 'merge' && Array.isArray(operation.from) ? operation.from.map(text => ({ text, timestamp: item.timestamp })) : null;
      const ids = new Set(item.id == null ? [] : [item.id]);
      const groups = operation?.kind === 'split' ? [operation.resultIds || []] : [];
      if (!sources) {
        if (operation) return null;
        const edit = (item.editLog || []).find(e => e.kind === 'text' && typeof e.from === 'string');
        return { ids, groups, sources: [{ ...item, text: edit?.from || item.text }] };
      }
      const leaves = [];
      for (const source of sources) {
        const lineage = manualClassificationLineage(source, nextPath);
        if (!lineage) return null;
        lineage.ids.forEach(id => ids.add(id));
        groups.push(...lineage.groups); leaves.push(...lineage.sources);
      }
      return { ids, groups, sources: leaves };
    }
    function manualClassificationTextKey(text) {
      return rewriteNorm(text).replace(/[。、,.，・:：【】「」()（）]/g, '');
    }
    function manualSourcesMatch(sources, sourceCards) {
      if (!sources.length) return false;
      if (sources.every(source => currentRuleCardForSavedItem(sourceCards, source))) return true;
      if (sources.length < 2 || !sources.every(s => s.timestamp === sources[0].timestamp)) return false;
      const joined = manualClassificationTextKey(sources.map(s => s.text).join(''));
      return sourceCards.some(s => s.timestamp === sources[0].timestamp && manualClassificationTextKey(s.text) === joined);
    }
    function completeManualLineages(items) {
      let entries = items.filter(item => !item.deleted && (item.predictionSource === 'confirmed' || item.tagNotNeeded || (item.editLog || []).some(e => !e.actor || e.actor === 'user')))
        .map(item => ({ item, lineage: manualClassificationLineage(item) })).filter(e => e.lineage);
      // Split siblings may now exist inside subsequent merges. Reject incomplete groups transitively.
      for (;;) {
        const represented = new Set(entries.flatMap(e => Array.from(e.lineage.ids)));
        const complete = entries.filter(e => e.lineage.groups.every(group => group.length && group.every(id => represented.has(id))));
        if (complete.length === entries.length) return complete;
        entries = complete;
      }
    }
    function preservedUserCardsForClassification(items, sourceCards) {
      const matching = items.filter(item => {
        const lineage = manualClassificationLineage(item);
        return lineage && manualSourcesMatch(lineage.sources, sourceCards);
      });
      return completeManualLineages(matching).map(e => e.item);
    }
    function coveredByManualClassification(item, existing) {
      return completeManualLineages(existing).some(({ item: saved, lineage }) => {
        if (!(saved.editLog || []).some(e => ['merge', 'split'].includes(e.kind))) return false;
        const sources = lineage.sources;
        if (sources.some(s => clinicalCardDuplicateKey(s.text, s.timestamp) === clinicalCardDuplicateKey(item.text, item.timestamp))) return true;
        return sources.length > 1 && sources.every(s => s.timestamp === item.timestamp) && manualClassificationTextKey(item.text) === manualClassificationTextKey(sources.map(s => s.text).join(''));
      });
    }
    const CLASSIFY_MODE_STORAGE_KEY = 'nursing_classify_mode';
    function getClassifyMode() {
      return 'rules';
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
          : '原文と前後の記録をもとに、S/O・14項目のタグを整理します';
        note.classList.toggle('text-[var(--brick)]', mode === 'ai' && !globalAppData.apiKey);
      }
    }
    window.setClassifyMode = function(mode) {
      try { localStorage.setItem(CLASSIFY_MODE_STORAGE_KEY, mode === 'ai' ? 'ai' : 'rules'); } catch (e) {   }
      renderClassifyModeSwitch();
    };
    renderClassifyModeSwitch();

    document.getElementById('btn-start-classify').addEventListener('click', async () => {

      const text = DOM.sourceText.value.trim().normalize('NFKC');
      if (!text) return showToast('文章を入力してください', 'warn');
      if (typeof resetSourcePaneLayout === 'function') resetSourcePaneLayout();
      const cp = getCurrentPatient();
      const sourceCardsForRun = classifyTextByRules(text);

      if (getClassifyMode() === 'ai' && !globalAppData.apiKey) {
        const st = await requireApiKey('AIありで分類', { fallbackLabel: '記録を基に分類する' });
        if (st !== 'fallback') return;
        window.setClassifyMode('rules');
      }

      if (cp.items.length > 0) {

        if (typeof checkpointBeforeClassify === 'function') checkpointBeforeClassify(cp);
        const editedCount = cp.items.filter(i => (Array.isArray(i.editLog) && i.editLog.length > 0) || i.predictionSource === 'confirmed').length;
        const answer = await openDialog({
          title: '今あるカードをどうしますか？',
          message: `この患者には既に${cp.items.length}枚のカードがあります。\n` +
            `「置き換えて分類」：自動分類カードを作り直します。` +
            (editedCount ? `手で編集・統合・不要判定した${editedCount}枚は、今回の原文と同じ記録・日時で照合できるものを保持します。原文からなくなった記録や別の日時の判断は引き継ぎません。` : '') +
            `\n「追加して分類」：今のカードを残し、新しく見つかった分を追加します。手で編集していない自動分類カードのタグ付与漏れも、原文と最新ルールを照合して更新します。`,
          confirmLabel: '置き換えて分類',
          secondaryLabel: '追加して分類'
        });
        if (answer === null) return;
        if (answer === true) {
          const preserved = preservedUserCardsForClassification(cp.items, sourceCardsForRun);
          const keepIds = new Set(preserved.map(i => i.id));
          const droppedManual = cp.items.filter(i => !keepIds.has(i.id) && !i.deleted && !isRejectedExclusionOnly(i) && ((i.editLog || []).some(e => e && e.kind !== 'create') || i.predictionSource === 'confirmed' || i.tagNotNeeded));
          if (droppedManual.length) {
            cp.droppedManualEdits = [...(cp.droppedManualEdits || []), ...droppedManual.map(i => ({ at: new Date().toISOString(), text: i.text, timestamp: i.timestamp, type: i.type, hendersonIds: (i.hendersonIds || []).slice(), tagNotNeeded: !!i.tagNotNeeded }))].slice(-60);
            if (typeof showToast === 'function') showToast(`原文の変更で引き継げなかった手動修正が${droppedManual.length}件あります（修正依頼に記録します）`);
          }
          cp.items.filter(i => !keepIds.has(i.id)).forEach(i => markItemDeleted(cp, i.id));
          cp.items = preserved;

          if (!preserved.length) ['myAssessments', 'missingChecks', 'carePlans', 'checkpoints', 'relationMap'].forEach(f => { delete cp[f]; });
          cp.caseResetAt = new Date().toISOString();
          preserved.forEach(item => { touchItem(item); unmarkItemDeleted(cp, item.id); });
          selectedCardIds.clear();
          if (highlightedSourceItemId != null) clearSourceHighlight(false);
        }
      }

      let addedCount = 0;
      const addedThisRun = [];
      const fuzzyMatches = new Map();
      const userCardsForRun = preservedUserCardsForClassification(cp.items, sourceCardsForRun);
      withExtractionContext(text, () => groupClinicalPhrasesWithTimestamps(text).forEach(chunk => {
        const cleanedText = cleanExtractedPhrase(chunk.text);
        if (cleanedText.length < 2 || isBareFieldHeaderOnly(cleanedText) || isHeadingOnlyChunk(chunk, cleanedText) || cp.items.some(i => !i.deleted && (clinicalCardDuplicateKey(i.text, i.timestamp) === clinicalCardDuplicateKey(cleanedText, chunk.timestamp) || (((i.editLog || []).length || i.predictionSource === 'confirmed') && sameCardIgnoringUnknownTime(i, { text: cleanedText, timestamp: chunk.timestamp })))) || coveredByManualClassification({ text: cleanedText, timestamp: chunk.timestamp }, userCardsForRun) || hasCompleteSavedSourceCoverage(cp.items, cleanedText, chunk.timestamp)) return;
        let userLearned = globalAppData.learningUserDict[cleanedText];
        let predictionSource = null;
        let fuzzyMatchedText = null;
        if (userLearned && (userLearned.preferredType || userLearned.preferredHendersonIds?.length)) {
          predictionSource = isVoteTied(userLearned.typeVotes) ? 'tied' : 'learned';
        } else {

          const fuzzy = findFuzzyLearnedMatch(cleanedText);
          if (fuzzy && fuzzy.learned && (fuzzy.learned.preferredType || fuzzy.learned.preferredHendersonIds?.length)) {
            userLearned = fuzzy.learned;
            fuzzyMatchedText = fuzzy.key;
            predictionSource = isVoteTied(userLearned.typeVotes) ? 'tied' : 'fuzzy';
          }
        }
        const { detectedHIds, predictedType } = computeLocalTagsAndType(chunk, cleanedText, userLearned);
        if (!predictionSource || chunk.isUnnecessaryBoilerplate || isPatientIdentityLine(cleanedText)) { predictionSource = 'rule'; fuzzyMatchedText = null; }
        const assessmentCols = {};

        const inferredCol = userLearned ? null : inferAssessmentColumn(chunk.fieldLabel, chunk.timestamp, chunk.admissionPhase);
        detectedHIds.forEach(hId => assessmentCols[hId] = userLearned?.preferredCols?.[hId] || inferredCol || 'unclassified');

        const patientBackground = (predictedType !== 'unnecessary' && detectedHIds.length === 0)
          ? classifyPatientBackground(chunk.fieldLabel)
          : null;

        const newItem = { id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6), text: cleanedText, timestamp: chunk.timestamp || "日時不明", type: predictedType, hendersonIds: detectedHIds, assessmentCols, fieldLabel: chunk.fieldLabel || null, patientBackground, ...(chunk.diseaseGeneral ? { diseaseGeneral: true } : {}), admissionPhase: chunk.admissionPhase || 'preadmission', predictionSource, ruleDecision: automaticRuleDecision(chunk, cleanedText, predictedType), ...(chunk.sceneId ? { sceneId: chunk.sceneId } : {}), ...(chunk.soMixed ? { soMixed: true } : {}), ...(chunk.labRows ? { labRows: chunk.labRows } : {}), _touchedAt: new Date().toISOString() };
        addedThisRun.push(newItem);
        cp.items.push(newItem);

        if (fuzzyMatchedText) fuzzyMatches.set(newItem.id, fuzzyMatchedText);
        addedCount++;
      }));
      const retainedNew = new Set(removeCoveredCompositeCards(cp.items));
      const redundantNew = new Set(addedThisRun.filter(item => !retainedNew.has(item)));
      cp.items = cp.items.filter(item => !redundantNew.has(item));
      addedThisRun.splice(0, addedThisRun.length, ...addedThisRun.filter(item => !redundantNew.has(item)));
      addedCount = addedThisRun.length;
      applySceneTagInheritance(addedThisRun);
      applyPainContextTags(addedThisRun, cp);
      applyFamilyScreeningContext(addedThisRun, sourceCardsForRun, globalAppData.learningUserDict);
      const updatedCount = refreshSavedUntaggedCards(cp, text);
      if (typeof applyUntaggedReviews === 'function') applyUntaggedReviews(cp);
      addedThisRun.forEach(item => reportLearningEvent(item.text, 'create', { type: item.type, hendersonIds: item.hendersonIds, assessmentCols: item.assessmentCols, fieldLabel: item.fieldLabel, predictionSource: item.predictionSource, fuzzyMatchedText: fuzzyMatches.get(item.id) }));
      saveDataAndSync();
      queueClassificationDelivery(cp);
      showToast(`${addedCount}件のデータを分類・カード化しました${userCardsForRun.length ? `／${userCardsForRun.length}枚の手編集判断を保持しました` : ''}${updatedCount ? `／${updatedCount}枚のタグを更新しました` : ''}`, 'success');
      try {
        const health = classificationHealth(cp.items);
        cp.classificationHealth = { at: new Date().toISOString(), total: health.total, untagged: health.untagged, degraded: health.degraded };
        if (health.degraded) setTimeout(() => showToast(`タグ未設定のカードが${health.untagged}/${health.total}枚と多くなっています。分類ルールの不具合の可能性があるため、修正依頼を書き出して確認してください`, 'warn'), 1500);
      } catch (e) {  }
    });

    // Initial patient rendering can precede the review module; retry after all scripts load.
    window.addEventListener('load', () => {
      if (refreshSavedUntaggedCards(getCurrentPatient())) saveDataAndSync();
    });
