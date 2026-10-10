// Local record extraction. Preserve source wording, units, timestamps and admission context.
// Headings supply context; narrative numbers are not automatically laboratory measurements.

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['03'] = '2026-10-10.znavigation17'; // Version stamp (scripts/stamp-version.js)
    // ==========================================================================

    // ------------------------------------------------------------------------

    // ==========================================================================
    function escapeRegExp(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    const LAB_KEY_NUM_PATTERNS = [
      ['WBC', '\\d+[\\d,]*'], ['CRP', '\\d+\\.?\\d*'], ['HbA1c', '\\d+\\.?\\d*'], ['Hb', '\\d+\\.?\\d*'],
      ['RBC', '\\d+[\\d,]*'], ['Plt', '\\d+[\\d,]*'], ['BUN', '\\d+\\.?\\d*'], ['Cre', '\\d+\\.?\\d*'],
      ['Na', '\\d+'], ['K', '\\d+\\.?\\d*'], ['Cl', '\\d+'], ['AST', '\\d+'], ['ALT', '\\d+'],

      ['Cr', '\\d+\\.?\\d*'],
      ['Dダイマー', '\\d+\\.?\\d*'], ['BNP', '\\d+\\.?\\d*'], ['PT-INR', '\\d+\\.?\\d*'],

      ['TP', '\\d+\\.?\\d*'], ['Alb', '\\d+\\.?\\d*'], ['γGTP', '\\d+\\.?\\d*'],

      ['Ht', '\\d+\\.?\\d*'], ['PT', '\\d+\\.?\\d*'],

      ['ALP', '\\d+\\.?\\d*'], ['T-Bil', '\\d+\\.?\\d*'], ['血糖', '\\d+\\.?\\d*'], ['アミラーゼ', '\\d+\\.?\\d*']
    ];

    const LAB_NUMBER_SOURCE = '\\d(?:[\\d,]*\\d)?(?:\\.\\d+)?';
    const LAB_UNIT_WORDS = ['mL/min/1.73m2', 'mL/分/1.73m2', '×10^6/μL', '×10^4/μL', '×10^3/μL', '×10^2/μL', '×10^4/uL', '×10^3/uL', 'x10^4/μL', 'x10^3/μL',
      '×10⁴/μL', '×10³/μL', '万/μL', '万/uL', '万/µL', '万/mm3', '万/mm³', '千/μL', '千/uL', '/μL', '/uL', '/µL', '/mm3', '/mm³',
      'μg/mL', 'ug/mL', 'µg/mL', 'μg/dL', 'ng/mL', 'pg/mL', 'mg/dL', 'mg/L', 'g/dL', 'g/L', 'mEq/L', 'mmol/L', 'μmol/L', 'umol/L', 'µmol/L',
      'IU/L', 'U/L', 'fL', '%', '秒', '万', '/mL',

      '万/从L', '/从L', '万u/L', '万μ/L', 'mEa/L'];
    const LAB_UNIT_SOURCE = LAB_UNIT_WORDS.slice().sort((a, b) => b.length - a.length)
      .map(u => escapeRegExp(u).replace(/\\\^/g, '\\s*\\^?\\s*').replace(/\//g, '\\s*\\/\\s*')).join('|');
    const LAB_REGEX_SOURCE = LAB_KEY_NUM_PATTERNS.map(([key]) => {
      const numPattern = LAB_NUMBER_SOURCE;
      const unitSuffix = `(?:\\s*(?:${LAB_UNIT_SOURCE}))?`;

      const guard = /^[A-Za-z]/.test(key) ? '(?<![A-Za-zァ-ヶー])' : '';

      const flagSuffix = '(?:\\s*[↑↓]|\\s+[HL](?![A-Za-z0-9]))?';
      return `${guard}${escapeRegExp(key)}\\s*${numPattern}${unitSuffix}${flagSuffix}`;
    }).concat([

      '体温\\s*\\d{2}(?:\\.\\d)?\\s*(?:℃|°C|°c|度(?:\\s*\\d\\s*分)?)?(?:\\s*[(（](?:腋窩|腋下|口腔|鼓膜|直腸|耳)[)）])?',
      '血圧\\s*\\d{2,3}\\/\\d{2,3}(?:\\s*mmHg)?(?![\\d])',
      'SpO2\\s*\\d{2,3}\\s*%?(?:\\s*[\\(（][^)）]{0,20}[\\)）])?',

      '脈拍\\s*\\d{2,3}\\s*回\\s*\\/\\s*分(?:\\s*[(（]?(?:整|不整)(?:あり|なし)?[)）]?|[、,]\\s*不整(?:あり|なし)?)?',
      '呼吸数?\\s*\\d{1,3}\\s*回\\s*\\/\\s*分',

      '(?<![A-Za-z])BP\\s*\\d{2,3}\\/\\d{2,3}\\s*(?:mmHg)?',
      '(?<![A-Za-z])P\\s*\\d{2,3}\\s*回\\s*\\/\\s*分',
      '(?<![A-Za-z])R\\s*\\d{1,2}\\s*回\\s*\\/\\s*分',
      '(?<![A-Za-z])T\\s*\\d{2}(?:\\.\\d)?\\s*(?:℃|°C|°c|度(?:\\s*\\d\\s*分)?)',

      '(?<![A-Za-z])BT\\s*\\d{2}(?:\\.\\d)?\\s*(?:℃|°C|°c|度(?:\\s*\\d\\s*分)?)?',
      '(?<![A-Za-z])(?:HR|PR)\\s*\\d{2,3}(?:\\s*回\\s*\\/\\s*分|\\s*bpm)?(?![\\d.])',
      '(?<![A-Za-z])RR\\s*\\d{1,2}(?:\\s*回\\s*\\/\\s*分)?(?![\\d.])'
    ]).join('|');

    const LAB_VALUE_TEST_REGEX = new RegExp(LAB_REGEX_SOURCE, 'i');

    const LAB_COUNTER_WORD_AFTER_REGEX = /^\s*(?:単位|分間?|回(?!\s*\/)|名|人|日間?|週間?|か月|ヶ月|カ月|時間|歩|セット|本|枚|個|錠|包|m(?![A-Za-zμ\/²2]))/;
    function isPlausibleLabMatch(matchText, afterText) {
      const m = String(matchText || '');
      const lead = (m.match(/^[A-Za-z][A-Za-z\-]*/) || [''])[0];
      if (lead && lead.length <= 2 && /^[a-z]+$/.test(lead)) return false;
      if (LAB_COUNTER_WORD_AFTER_REGEX.test(String(afterText || ''))) return false;
      if (/^(?:TP|PT)\s*\d{1,2}$/i.test(m.trim()) && !/^\s*(?:[.,]\d|%|秒|g\/)/.test(String(afterText || ''))) {

        if (!/\s/.test(m.trim())) return false;
        if (/^\s*[:：]?\s*[^\d\s.,、。)）]/.test(String(afterText || '')) && /^(?:TP|PT)\s*\d$/i.test(m.trim())) return false;
      }
      return true;
    }

    //

    // 「RBC4587」「Hb12.2g/dl」「Ht37.2%」「Plt23」「AST2」「ALT250U/L」「Na140mEq/L」

    const LAB_KEY_HAS_NON_ASCII_RE = /[^A-Za-z0-9\-]/;
    const LAB_ITEM_ASCII_KEYS = LAB_KEY_NUM_PATTERNS.filter(([k]) => !LAB_KEY_HAS_NON_ASCII_RE.test(k)).map(([k]) => k);
    const LAB_ITEM_NON_ASCII_KEYS = LAB_KEY_NUM_PATTERNS.filter(([k]) => LAB_KEY_HAS_NON_ASCII_RE.test(k)).map(([k]) => k);
    const LAB_ITEM_NAME_REGEX = new RegExp(

      '(?:(?<![ァ-ヶー])\\b(?:' + LAB_ITEM_ASCII_KEYS.map(escapeRegExp).join('|') + ')(?![A-Za-z])(?!\\s*(?:さん|様|氏|君|ちゃん|とともに|と一緒|による|の介入|の訓練|の指導|の計画|の説明|の評価|の方針|訓練|室|より|から|が|介入|実施|と共に|見守り|[)）、,]|[:：]\\s*(?![\\d.])))' +
      (LAB_ITEM_NON_ASCII_KEYS.length ? '|(?:' + LAB_ITEM_NON_ASCII_KEYS.map(escapeRegExp).join('|') + ')' : '') + ')', 'i'
    );

    function mentionsLabItemName(text) {
      const t = String(text || '').replace(/(?<![A-Za-z])(?:Pt|pt)(?![A-Za-z])(?!\s*[-\d%(（.])/g, '');
      return LAB_ITEM_NAME_REGEX.test(t);
    }

    const LAB_CATEGORY_TAG_RULES = [

      { tags: [1], regex: /(SpO2|SpO₂|SPO2|酸素飽和度|PaO2|PaCO2|呼吸数|呼吸\s*\d|血圧|脈拍|心拍|\bBNP\b|NT-proBNP|\bBP\s*\d|(?<![A-Za-z])[PR]\s*\d+\s*回|(?<![A-Za-z])(?:HR|PR|RR)\s*\d)/i },
      { tags: [3], regex: /(\bCre\b|クレアチニン|\bBUN\b|尿素窒素|eGFR|尿酸|尿蛋白|尿糖|尿比重)/i },
      { tags: [7], regex: /(\bWBC\b|白血球|\bCRP\b|C反応性|体温|(?<![A-Za-z])B?T\s*\d{2})/i },

      { tags: [2], regex: /(APTT|PT-INR|PT%|\bPT(?=\s*[\d%(（])|プロトロンビン|Dダイマー|D-ダイマー|\bFDP\b|フィブリノ|\bPLT\b|血小板)/i }
    ];
    function labCategoryTags(text) {
      if (typeof isLabTextUnreliable === 'function' && isLabTextUnreliable(text)) return [];
      const tags = [];
      LAB_CATEGORY_TAG_RULES.forEach(rule => { if (rule.regex.test(text)) rule.tags.forEach(t => { if (!tags.includes(t)) tags.push(t); }); });
      return tags.length ? tags : [2];
    }

    // ==========================================================================

    // ==========================================================================
    function detectAgeGroupFromText(text) {
      const t = String(text || '').normalize('NFKC').slice(0, 1500);
      if (/日齢\s*\d+|修正\s*\d+\s*週|NICU|GCU|早産児|低出生体重児|新生児(?:期|室)?(?:[:：]|\s|を|の受け持ち)/.test(t) && !/(?:褥婦|産褥|初産婦|経産婦)/.test(t.slice(0, 300))) return 'neonate';
      const who = '(?:患児|受け?持ち?児?|患者|対象|本児|利用者|[A-ZＡ-Ｚ]\\s*(?:ちゃん|くん|君|さん|氏))';

      const gap = '(?:(?!妻|夫|孫|息子|娘|長男|長女|次男|次女|三男|三女|兄|姉|弟|妹|父|母|祖父|祖母|家族|嫁|婿|甥|姪)[^。\\n]){0,20}?';
      if (new RegExp(`${who}${gap}生後\\s*\\d+\\s*(?:か月|ヶ月|カ月|ケ月)`).test(t)) return 'infant';
      const m = t.match(new RegExp(`${who}${gap}(\\d{1,3})\\s*歳`));
      if (!m) return null;
      const age = Number(m[1]);
      if (age < 1) return 'infant';
      if (age <= 5) return 'toddler';
      if (age <= 12) return 'school';
      return null;
    }

    const CHILD_VITAL_GUIDES = {
      neonate: { label: '新生児', pulse: [120, 160], resp: [40, 60] },
      infant: { label: '乳児', pulse: [110, 140], resp: [30, 40] },
      toddler: { label: '幼児', pulse: [90, 120], resp: [20, 30] },
      school: { label: '学童', pulse: [70, 110], resp: [18, 25] }
    };

    const CHILD_SAFE_LAB_REFERENCE_KEYS = new Set(['CRP', 'Na', 'Cl']);

    // ==========================================================================

    // ==========================================================================

    //

    const BARE_LAB_KEY_REGEX = new RegExp(
      '^(?:' + LAB_KEY_NUM_PATTERNS.map(([k]) => escapeRegExp(k)).join('|') + '|体温|血圧|脈拍|SpO2)\\s*(?:[（(｛{][^）)｝}]*[）)｝}])?[:：]?\\s*$', 'i'
    );

    //

    const BARE_LAB_VALUE_REGEX = /^[\d,]+(?:\.\d+)?\s*万?\s*(?:[〜\-~]\s*[\d,]+(?:\.\d+)?\s*万?)?\s*(?:×\s*10\s*\^?\s*\d+)?\s*(?:\/[μu从µ]L|\/mm3|\/mm³|\/μl|\/mL|g\/dL|mg\/dL|U\/L|\/L|mE[qa]\/L|mmol\/L|μg\/mL|pg\/mL|fL|%|℃|°C|°c|mmHg|回\/分|秒)?\s*[↑↓HLhl]?\.?$/i;

    const UNNATURAL_START_REGEX = /^(の|は|が|を|に|で|と|も|へ|や|し|って|といった|という|ため|により|による|たり|して|しつつ|つつ|なり|ながら|とともに|において|に対して|について|よって)/;

    const DATE_WEEKDAY_SUFFIX_SOURCE = '(?:\\s*[\\(（][月火水木金土日祝][\\)）])?';
    const DATE_ONLY_REGEX = new RegExp(
      '^(?:\\d{1,4}年|(?:令和|平成|昭和|大正)\\d{1,2}年)?\\d{1,2}月\\d{1,2}日' + DATE_WEEKDAY_SUFFIX_SOURCE + '$' +
      '|^\\d{1,2}[\\/／]\\d{1,2}' + DATE_WEEKDAY_SUFFIX_SOURCE + '$' +
      '|^\\d{4}[-\\/]\\d{1,2}[-\\/]\\d{1,2}' + DATE_WEEKDAY_SUFFIX_SOURCE + '$'
    );

    function isDateOnlyText(str) {
      if (!str) return false;
      const trimmed = str.trim().replace(/[。、.\s]+$/, '');
      return DATE_ONLY_REGEX.test(trimmed);
    }

    const UNNECESSARY_ADMIN_KEYS = [
      "実習・患者基本情報", "患者基本情報", "実習基本情報", "基礎情報",
      "実習科目名", "実習期間", "実習施設名", "実習施設",
      "学籍番号", "学生氏名", "指導者氏名", "提出日", "記載日", "記録日"
    ];

    const SECTION_HEADER_PASSTHROUGH_KEYS = [
      "検査項目", "基準値", "正常値", "基準範囲", "項目", "種類", "正常・異常",
      "受け持つまでの経過", "受け持つまでの状態", "知的能力", "身体的ならびに身体的能力"
    ];

    const SECTION_HEADER_KEYS = [
      "年齢・社会的・文化的状況", "知的能力・身体的ならびに身体的能力", "受け持つまでの経過と状態",
      "血液検査", "画像検査等", "治療方針・治療内容等",

      "帰室時の状況"
    ];
    const UNNECESSARY_BOILERPLATE_KEYS = [...UNNECESSARY_ADMIN_KEYS, ...SECTION_HEADER_PASSTHROUGH_KEYS, ...SECTION_HEADER_KEYS];
    const UNNECESSARY_BOILERPLATE_REGEX = new RegExp(
      '^(?:' + UNNECESSARY_BOILERPLATE_KEYS.join('|') + ')(?:[:：]|\\s|$)'
    );

    const BARE_PATIENT_HONORIFIC_REGEX = /^[A-Za-zＡ-Ｚａ-ｚ]氏$/;

    const STUDENT_CARE_START_REGEX = /^(?:.{0,15}(?:より|から)受け?持(?:つ|ち)[^。]{0,10}|受け?持ち?(?:開始|初日))。?$/;

    const SCHEDULE_COLUMN_HEADER_REGEX = /^退院目標\s*[(（][^)）]{1,12}[)）]$/;

    const ROOM_MOVE_ONLY_REGEX = /^(?:帰室|入室|転室|転棟|入院)?\s*[(（]?\s*(?:個室|大部屋|\d+床室)?\s*(?:\d+\s*号室)\s*[)）]?\s*(?:へ|に)?\s*(?:帰室|入室|転室|転棟|入院)?\s*(?:する|した)?[。]?$/;

    const SECTION_TITLE_ONLY_REGEX = /^(?:[^、。「」:：\d]{1,14}について|[^、。「」:：\d]{1,10}の(?:状態|状況|経過)|疾患に対する認識|入院から[^、。]{1,10}までの経過|手術当日|事例紹介\s*[>＞]?|看護記録(?:[(（][^)）]{0,30}[)）])?|(?:血液|検査)データ(?:[(（][^)）]{0,40}[)）])?)$/;

    const COURSE_INFO_REGEX = /^(?:科目|実習科目名?|授業|担当教員)\s*[:：]/;

    function isOcrNoiseText(t) {
      if (!t || /[ぁ-んァ-ヶ一-龠々]/.test(t)) return false;
      const dots = (t.match(/\./g) || []).length;
      const alnum = (t.match(/[A-Za-z0-9]/g) || []).length;
      return t.length >= 8 && dots >= 6 && dots * 3 >= alnum && !/[A-Za-z]{2,}\s*\d+(?:\.\d+)?\s*[a-zA-Z%/]+\.\s*[A-Za-z]{2,}\s*\d/.test(t);
    }

    const CARE_START_ONLY_REGEX = /^(?:[^、。]{0,12}(?:より|から))?受け?持(?:ち)?(?:開始|つ|ちを開始する)。?$/;

    const LAB_TABLE_TITLE_ONLY_REGEX = /^[【\[]?(?:(?:入院時|術前|術後|手術前|入院\d+日目|術後\d+日目)の?)?(?:血液|採血|検査)(?:データ|結果|所見)?(?:一覧)?[】\]]?[:：]?$/;

    const SECTION_TITLE_WITH_VALUES_REGEX = new RegExp('^(?:' + [...SECTION_HEADER_PASSTHROUGH_KEYS, ...SECTION_HEADER_KEYS].join('|') + ')\\s*[:：]\\s*(.+)$');
    function isSectionTitleWithValues(trimmed) {
      const m = trimmed.match(SECTION_TITLE_WITH_VALUES_REGEX);
      return !!(m && /\d/.test(m[1]));
    }
    function isUnnecessaryBoilerplateText(str) {
      if (!str) return false;
      const trimmed = str.trim();
      return LAB_TABLE_TITLE_ONLY_REGEX.test(trimmed) || (UNNECESSARY_BOILERPLATE_REGEX.test(trimmed) && !isSectionTitleWithValues(trimmed)) || BARE_PATIENT_HONORIFIC_REGEX.test(trimmed) ||
        STUDENT_CARE_START_REGEX.test(trimmed) || ROOM_MOVE_ONLY_REGEX.test(trimmed) || SCHEDULE_COLUMN_HEADER_REGEX.test(trimmed) ||
        SECTION_TITLE_ONLY_REGEX.test(trimmed) || COURSE_INFO_REGEX.test(trimmed) || CARE_START_ONLY_REGEX.test(trimmed) || isOcrNoiseText(trimmed);
    }

    const OBJECTIVE_FIELD_PREFIX_REGEX = /^[^\d:：]{1,40}[:：]\s*\S/;
    function hasOwnFieldLabelPrefix(str) {
      if (!str) return false;
      return OBJECTIVE_FIELD_PREFIX_REGEX.test(str);
    }

    const AMBIGUOUS_MULTI_TOPIC_SECTION_LABEL = "年齢・社会的・文化的状況";
    const SECTION_FAMILY_CONTENT_KEYWORDS = [
      "妻", "夫", "長男", "長女", "次男", "次女", "三男", "三女", "息子", "娘",
      "同居", "人家族", "キーパーソン"
    ];
    function inferFieldLabelFromSectionContent(sectionLabel, text) {
      if (sectionLabel !== AMBIGUOUS_MULTI_TOPIC_SECTION_LABEL) return null;
      return SECTION_FAMILY_CONTENT_KEYWORDS.some(kw => text.includes(kw)) ? "家族関係" : null;
    }

    const EMPTY_COLON_HEADER_REGEX = /^[^\d:：]{1,40}[:：]\s*$/;
    function isEmptyColonHeaderLine(str) {
      if (!str) return false;
      return EMPTY_COLON_HEADER_REGEX.test(str.trim());
    }

    const BARE_STATUS_WORD_REGEX = /^(無|なし|あり|有り|特になし|特記なし|不明|良好|不良|普通|軽度|中等度|重度|陰性|陽性)(?:[\s　]*[（(][^）)]*[）)])?$/;
    function isBareStatusWord(str) {
      if (!str) return false;
      return BARE_STATUS_WORD_REGEX.test(str.trim());
    }

    const FIELD_LABELS = [

      { key: "氏名", label: "氏名", color: "var(--slate)", bg: "var(--slate-soft)", icon: "fa-id-card", type: "o" },
      { key: "年齢", label: "年齢", color: "var(--slate)", bg: "var(--slate-soft)", icon: "fa-calendar-days", type: "o" },

      { key: "性別", label: "性別", color: "var(--slate)", bg: "var(--slate-soft)", icon: "fa-venus-mars", type: "o" },
      { key: "現病歴", label: "現病歴", color: "var(--slate)", bg: "var(--slate-soft)", icon: "fa-notes-medical", type: "o" },
      { key: "既往歴", label: "既往歴", color: "var(--slate)", bg: "var(--slate-soft)", icon: "fa-clock-rotate-left", type: "o" },
      { key: "家族関係", label: "家族関係", color: "var(--slate)", bg: "var(--slate-soft)", icon: "fa-people-roof", type: "o" },
      { key: "生活歴", label: "生活歴", color: "var(--slate)", bg: "var(--slate-soft)", icon: "fa-shoe-prints", type: "o" },
      { key: "診断名", label: "診断名", color: "var(--brick)", bg: "var(--brick-soft)", icon: "fa-stethoscope", type: "o" },
      { key: "手術術式", label: "手術術式", color: "var(--brick)", bg: "var(--brick-soft)", icon: "fa-syringe", type: "o" },
      { key: "感染症", label: "感染症", color: "var(--accent-dark)", bg: "var(--accent-soft)", icon: "fa-virus", type: "o" },
      { key: "保険", label: "保険", color: "var(--gold)", bg: "var(--gold-soft)", icon: "fa-file-shield", type: "o" },
      { key: "入院日", label: "入院日", color: "var(--accent-dark)", bg: "var(--accent-soft)", icon: "fa-calendar-check", type: "o" },
      { key: "主訴", label: "主訴", color: "var(--gold)", bg: "var(--gold-soft)", icon: "fa-comment-medical", type: "s" },

      { key: "治療方針", label: "治療方針", color: "var(--slate)", bg: "var(--slate-soft)", icon: "fa-clipboard-list", type: "o" },
      { key: "治療内容", label: "治療内容", color: "var(--slate)", bg: "var(--slate-soft)", icon: "fa-pills", type: "o" },

      { key: "職業", label: "職業", color: "var(--slate)", bg: "var(--slate-soft)", icon: "fa-briefcase", type: "o" },

      { key: "学歴", label: "学歴", color: "var(--slate)", bg: "var(--slate-soft)", icon: "fa-graduation-cap", type: "o" },

      { key: "アレルギー", label: "アレルギー", color: "var(--slate)", bg: "var(--slate-soft)", icon: "fa-triangle-exclamation", type: "o" }
    ];

    const FIELD_LABEL_HEADING_ALIASES = { "診断": "診断名", "家族構成": "家族関係" };
    function normalizeFieldLabelHeadingWord(word) {
      return FIELD_LABEL_HEADING_ALIASES[word] || word;
    }

    const FIELD_LABEL_KEYS = FIELD_LABELS.map(f => f.key).join('|');
    const FIELD_LABEL_MATCH_KEYS = Array.from(new Set([...FIELD_LABELS.map(f => f.key), ...Object.keys(FIELD_LABEL_HEADING_ALIASES)])).join('|');
    const FIELD_LABEL_REGEX_SOURCE = `(?:^|[、。\\s])(${FIELD_LABEL_MATCH_KEYS})(?!・)(?!として|について)(?:[:：]\\s*|は)?`;

    const FIELD_LABEL_DEFAULT_TAGS = {

      "学歴": [14],
      "入院日": [9],
      "家族関係": [9],
      "保険": [9],
      "職業": [12],

      "年齢": [9]
    };

    // ==========================================================================

    // ------------------------------------------------------------------------

    const PATIENT_BACKGROUND_BASIC_FIELD_LABELS = new Set(["氏名", "性別", "生活歴", "入院日", "学歴", "アレルギー"]);
    function classifyPatientBackground(fieldLabel) {
      return PATIENT_BACKGROUND_BASIC_FIELD_LABELS.has(fieldLabel) ? '基本情報' : '医学情報';
    }

    const DIAGNOSIS_TAG_HINTS = [
      { pattern: /糖尿病/, tagIds: [2, 14] },

      { pattern: /大腸がん|大腸癌|結腸がん|結腸癌|直腸がん|直腸癌|結腸切除|大腸切除/, tagIds: [2, 3] },
      { pattern: /脂質異常症|高脂血症/, tagIds: [2] },

      { pattern: /高血圧/, tagIds: [2] },
      { pattern: /心不全|不整脈|狭心症|心筋梗塞|動脈硬化/, tagIds: [1] },
      { pattern: /肺炎|COPD|喘息|気管支炎|呼吸不全/, tagIds: [1] },
      { pattern: /腎不全|腎症|透析/, tagIds: [3] },
      { pattern: /認知症|せん妄|統合失調症|うつ病|不安障害/, tagIds: [10] },
      { pattern: /骨折|変形性|関節症|パーキンソン病|脳梗塞|脳出血|麻痺/, tagIds: [4] },
      { pattern: /褥瘡|皮膚炎/, tagIds: [8] },
      { pattern: /感染症|敗血症/, tagIds: [9] },

      { pattern: /胆石症|胆結石|胆嚢炎|胆管炎|膵炎/, tagIds: [2] },

      { pattern: /膵がん|膵癌|膵臓がん|膵臓癌|膵頭部がん|膵頭部癌|膵体部がん|膵尾部がん/, tagIds: [2] },

      { pattern: /卵巣嚢腫/, tagIds: [3, 4] },
      { pattern: /卵巣腫瘍|子宮筋腫|子宮内膜症|子宮頸癌|卵巣癌/, tagIds: [4] },

      { pattern: /胃がん|胃癌|胃切除|胃全摘|幽門側胃切除/, tagIds: [1, 2, 3, 4, 9] },

      { pattern: /大腿骨(?:近位部|頸部|転子部|転子下)?骨折|人工骨頭置換術|人工股関節全置換術|\bBHA\b|\bTHA\b/, tagIds: [4, 9] },

      { pattern: /誤嚥性肺炎/, tagIds: [1, 2, 7, 9, 14] },
      { pattern: /市中肺炎|院内肺炎|医療[・]?介護関連肺炎|\bCAP\b|\bHAP\b|\bNHCAP\b|\bVAP\b/, tagIds: [1, 7, 9] },

      { pattern: /帝王切開|骨盤位|前置胎盤|常位胎盤早期剥離|切迫早産|切迫流産|妊娠高血圧|妊娠糖尿病|早産/, tagIds: [9] }
    ];
    function detectDiagnosisTagHints(text) {
      const ids = new Set();
      DIAGNOSIS_TAG_HINTS.forEach(({ pattern, tagIds }) => { if (pattern.test(text)) tagIds.forEach(id => ids.add(id)); });
      return Array.from(ids);
    }

    function fieldLabelHintTags(fieldLabel, text) {

      if (fieldLabel === '既往歴' && /^\s*(?:特に|とくに)?(?:なし|無し|ない|特記事項なし|特記すべきことなし)\s*[。.]?\s*$/.test(String(text || '').normalize('NFKC'))) return [9];

      if (fieldLabel === '診断名' || fieldLabel === '既往歴') return [];
      return FIELD_LABEL_DEFAULT_TAGS[fieldLabel] || [];
    }

    // ==========================================================================

    // ------------------------------------------------------------------------

    function hasLearnedSignal(userLearned) {
      if (!userLearned) return false;
      if (userLearned.preferredType) return true;
      if (Array.isArray(userLearned.preferredHendersonIds) && userLearned.preferredHendersonIds.length > 0) return true;
      if (userLearned.typeVotes && Object.keys(userLearned.typeVotes).length > 0) return true;
      if (userLearned.hendersonVotes && Object.keys(userLearned.hendersonVotes).length > 0) return true;
      return false;
    }

    // ==========================================================================

    // ------------------------------------------------------------------------

    function suggestHendersonTagsForText(text, fieldLabel, userLearned) {
      const ruleHIds = detectMultipleHendersonTags(text);
      const ids = Array.from(new Set([...ruleHIds, ...(userLearned?.preferredHendersonIds || [])]));
      if (typeof isLabTextUnreliable === 'function' && isLabTextUnreliable(text)) return [];
      if (mentionsLabItemName(text) && !hasLearnedSignal(userLearned)) labCategoryTags(text).forEach(h => { if (!ids.includes(h)) ids.push(h); });
      if (fieldLabel && !hasLearnedSignal(userLearned)) {
        fieldLabelHintTags(fieldLabel, text).forEach(hid => { if (!ids.includes(hid)) ids.push(hid); });
      }
      return ids;
    }

    const BARE_FIELD_HEADER_WORDS = new Set(FIELD_LABELS.map(f => f.key));
    function isBareFieldHeaderOnly(str) {
      const trimmed = normalizeFieldLabelHeadingWord((str || '').replace(/[:：]\s*$/, '').trim());
      return BARE_FIELD_HEADER_WORDS.has(trimmed);
    }

    //

    function detectFieldLabelHeadingOnlyLine(rawLine) {
      const trimmed = (rawLine || '').trim();
      if (!trimmed) return null;

      const bracketed = trimmed.match(/^[【\[]\s*([^\d:：()（）\[\]【】]{1,12})\s*[\]】)）]?\s*$/);
      if (bracketed) {
        const key = normalizeFieldLabelHeadingWord(bracketed[1].trim());
        return BARE_FIELD_HEADER_WORDS.has(key) ? [key] : null;
      }

      if (trimmed.includes('・')) {
        const rawTokens = trimmed.split('・').map(t => t.trim());
        const isJunkToken = t => t.length === 0 || /^[\[【\]】]+$/.test(t);
        const labelTokens = rawTokens.filter(t => !isJunkToken(t)).map(normalizeFieldLabelHeadingWord);
        if (labelTokens.length >= 2 && labelTokens.every(t => BARE_FIELD_HEADER_WORDS.has(t))) {
          return labelTokens;
        }
      }
      return null;
    }

    // ==========================================================================

    // ------------------------------------------------------------------------

    // ==========================================================================

    // ------------------------------------------------------------------------

    function normalizeDayLabel(raw) {
      const t = (raw || '').replace(/\s+/g, '');
      if (t === '手術翌日') return '術後1日目';
      return t;
    }

    function nextDayLabel(label) {
      const t = normalizeDayLabel(label);
      let m;
      if (t === '手術当日') return '術後1日目';
      if (t === '手術前日') return '手術当日';
      if (t === '入院当日') return '入院2日目';
      if ((m = t.match(/^術後(\d+)日目$/))) return `術後${Number(m[1]) + 1}日目`;
      if ((m = t.match(/^入院(\d+)日目$/))) return `入院${Number(m[1]) + 1}日目`;
      if ((m = t.match(/^産褥(\d+)日目$/))) return `産褥${Number(m[1]) + 1}日目`;

      if (t === '入院前日') return '入院当日';

      if (t === '翌日' || t === '翌朝') return '翌々日';
      if (t === '翌々日') return '3日後';
      if ((m = t.match(/^(\d+)日後$/))) return `${Number(m[1]) + 1}日後`;
      if ((m = t.match(/^(\d+)日目$/))) return `${Number(m[1]) + 1}日目`;
      if ((m = t.match(/^(?:(\d{1,4})年)?(\d{1,2})月(\d{1,2})日/))) {

        if (!m[1] && Number(m[2]) === 2 && Number(m[3]) === 29) return '3月1日';
        const year = m[1] ? Number(m[1]) : 2001;
        const d = new Date(year, Number(m[2]) - 1, Number(m[3]) + 1);
        return `${m[1] ? `${d.getFullYear()}年` : ''}${d.getMonth() + 1}月${d.getDate()}日`;
      }
      return null;
    }

    function extractDayLabelFromHeading(text) {
      const t = (text || '').normalize('NFKC');
      const m = t.match(/術後\s*\d+\s*日目/) || t.match(/手術当日|手術翌日|手術前日/) || t.match(/入院\s*\d+\s*日目|入院当日/) ||
        t.match(/術前|入院時/);
      return m ? normalizeDayLabel(m[0]) : null;
    }

    function timestampDayPart(ts) {
      const t = (ts || '').trim();
      if (!t || t === '日時不明') return '';
      const m = t.match(/^(.*?)\s*\d{1,2}:\d{2}$/);
      return m ? m[1].trim() : t;
    }

    function timestampClockPart(ts) {
      const m = (ts || '').trim().match(/(\d{1,2}:\d{2})$/);
      return m ? m[1] : '';
    }

    function dayRank(day) {
      const t = normalizeDayLabel(day);
      let m;
      if (!t) return null;
      if (t === '入院前') return 0;
      if (t === '入院時' || t === '入院当日') return 10;
      if ((m = t.match(/^入院(\d+)日目$/))) return 10 + Number(m[1]) - 1;
      if (t === '術前') return 30;
      if (t === '手術前々日') return 38;
      if (t === '手術前日') return 39;
      if (t === '手術当日') return 40;
      if (t === '術中') return 40.5;

      if (t === '入院前日') return 9;
      if ((m = t.match(/^産褥(\d+)日目$/))) return 60 + Number(m[1]);
      if (t === '術後') return 41;
      if ((m = t.match(/^術後(\d+)日目$/))) return 41 + Number(m[1]);
      if ((m = t.match(/^(?:(\d{1,4})年)?(\d{1,2})月(\d{1,2})日$/))) return 100000 + (Number(m[1] || 0) * 400) + Number(m[2]) * 32 + Number(m[3]);
      return null;
    }

    function groupItemsByDay(list) {
      const order = [];
      const byDay = new Map();
      let prevDay = '';
      (list || []).forEach(item => {
        const day = timestampDayPart(item.timestamp) || prevDay;
        prevDay = day;
        if (!byDay.has(day)) { byDay.set(day, []); order.push(day); }
        byDay.get(day).push(item);
      });

      const rankOf = new Map();
      let yearOffset = 0, prevMonth = null;
      order.forEach(d => {
        const dm = normalizeDayLabel(d).match(/^(\d{1,2})月(\d{1,2})日$/);
        if (dm) {
          const month = Number(dm[1]);
          if (prevMonth !== null && month + 6 < prevMonth) yearOffset++;
          prevMonth = month;
          rankOf.set(d, 100000 + yearOffset * 400 + month * 32 + Number(dm[2]));
        } else rankOf.set(d, dayRank(d));
      });
      const knownSlots = order.map((d, i) => (rankOf.get(d) !== null ? i : -1)).filter(i => i >= 0);
      const knownSorted = knownSlots.map(i => order[i]).sort((a, b) => rankOf.get(a) - rankOf.get(b));
      knownSlots.forEach((slot, k) => { order[slot] = knownSorted[k]; });
      return order.map(day => ({ day, items: byDay.get(day) }));
    }

    function assessmentDayGroups(col, list) {

      const background = (list || []).filter(isAssessmentBackgroundItem);
      const bgGroup = background.length ? [{ day: ASSESSMENT_BACKGROUND_LABEL, items: background, background: true }] : [];
      const groups = groupItemsByDay((list || []).filter(i => !isAssessmentBackgroundItem(i)));
      if (groups.length === 0) return bgGroup;

      const flat = () => [...bgGroup, { day: bgGroup.length ? '観察・ケアの記録' : '', items: groups.flatMap(g => g.items) }];
      if (col !== 'preadmission' && col !== 'postadmission') return flat();
      if (groups.length === 1 && (groups[0].day === '' || groups[0].day === '入院前')) return flat();
      return [...bgGroup, ...groups];
    }

    const ASSESSMENT_BACKGROUND_LABEL = '背景（診断名・現病歴など）';
    const ASSESSMENT_BACKGROUND_FIELD_LABELS = new Set(['診断名', '病名', '現病歴', '既往歴', '手術術式', '術式', '主訴', '入院目的', '入院の経緯', '氏名', '年齢', '性別']);
    function isAssessmentBackgroundItem(item) {
      if (!item || item.aiSuggested) return false;
      if (item.fieldLabel && ASSESSMENT_BACKGROUND_FIELD_LABELS.has(item.fieldLabel)) return true;
      return /と診断され|と診断を受け|の診断で入院/.test(item.text || '');
    }

    function assessmentSceneKey(item) {
      if (item.sceneId) return `id:${item.sceneId}`;
      return timestampClockPart(item.timestamp) ? `ts:${item.timestamp}` : null;
    }
    function groupItemsByScene(list) {
      const scenes = [];
      const byKey = new Map();
      (list || []).forEach(item => {
        const key = assessmentSceneKey(item);
        if (key && byKey.has(key)) { byKey.get(key).items.push(item); return; }
        const scene = { key, items: [item] };
        if (key) byKey.set(key, scene);
        scenes.push(scene);
      });

      return scenes.map(sc => ({ ...sc, paired: sc.items.some(i => i.type === 's') && sc.items.some(i => i.type === 'o') }));
    }

    function assessmentDisplayOrder(list) {
      return groupItemsByDay(list).flatMap(g => g.items);
    }

    function detectAdmissionPhaseSignal(text) {
      const t = (text || '').trim();
      if (!t) return null;
      if (/入院前/.test(t)) return 'preadmission';
      if (/入院|実習|術前|術中|術後|手術当日|手術前日|翌日|日目|検査データ/.test(t)) return 'postadmission';
      return null;
    }

    // ==========================================================================

    // ------------------------------------------------------------------------

    //

    function inferAssessmentColumn(fieldLabel, timestamp, admissionPhase) {
      const ts = (timestamp || '').trim();

      if (ts.includes('入院前')) return 'preadmission';
      if (ts.includes('入院時') || ts.includes('検査データ') || ts.includes('術前') || ts.includes('術中') || ts.includes('術後')) return 'postadmission';
      if (/^\d{1,2}[:時]\d{2}/.test(ts)) return 'postadmission';
      if (/手術当日|手術前日|翌日|\d{1,2}:\d{2}$/.test(ts)) return 'postadmission';
      if (/日目$/.test(ts)) return 'postadmission';
      if (/^(?:\d{1,4}年)?\d{1,2}月\d{1,2}日/.test(ts)) return 'postadmission';

      if (fieldLabel === '現病歴' || fieldLabel === '既往歴' || fieldLabel === '生活歴'
        || fieldLabel === '氏名' || fieldLabel === '年齢' || fieldLabel === '性別' || fieldLabel === '診断名'
        || fieldLabel === '手術術式' || fieldLabel === '感染症') return 'preadmission';
      if (fieldLabel === '治療方針' || fieldLabel === '治療内容') return 'postadmission';
      if (admissionPhase === 'postadmission' || admissionPhase === 'preadmission') return admissionPhase;
      return null;
    }
