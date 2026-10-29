// Local record extraction. Preserve source wording, units, timestamps and admission context.
// Headings supply context; narrative numbers are not automatically laboratory measurements.

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['03'] = 'v.203'; // Version stamp (scripts/stamp-version.js)
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

      ['ALP', '\\d+\\.?\\d*'], ['T-Bil', '\\d+\\.?\\d*'], ['血糖', '\\d+\\.?\\d*'], ['アミラーゼ', '\\d+\\.?\\d*'],
      ['D-Bil', '\\d+\\.?\\d*'], ['MCHC', '\\d+\\.?\\d*'], ['MCH', '\\d+\\.?\\d*'], ['MCV', '\\d+\\.?\\d*'],
      ['γ-GT', '\\d+\\.?\\d*'], ['AMY', '\\d+\\.?\\d*'], ['LD', '\\d+\\.?\\d*'], ['e-GFR', '\\d+\\.?\\d*'],
      ['UN', '\\d+\\.?\\d*'], ['UA', '\\d+\\.?\\d*'], ['血小板', '\\d+\\.?\\d*'],
      ['LDH', '\\d+\\.?\\d*'], ['Ca', '\\d+\\.?\\d*'], ['好中球数', '\\d+[\\d,]*']
    ];

    const LAB_NUMBER_SOURCE = '\\d(?:[\\d,]*\\d)?(?:\\.\\d+)?';
    const LAB_UNIT_WORDS = ['×10²/mm³', '×10^2/mm3', '×10²/μL', '×10²/uL', '×10^2/μL', 'mIU/mL', 'mIU/L', 'μIU/mL', 'uIU/mL', 'mL/min/1.73m2', 'mL/分/1.73m2', '×10^6/μL', '×10^4/μL', '×10^3/μL', '×10^2/μL', '×10^4/uL', '×10^3/uL', 'x10^4/μL', 'x10^3/μL',
      '×10⁴/μL', '×10³/μL', '万/μL', '万/uL', '万/µL', '万/mm3', '万/mm³', '千/μL', '千/uL', '/μL', '/uL', '/µL', '/mm3', '/mm³',
      'μg/mL', 'ug/mL', 'µg/mL', 'μg/dL', 'ng/mL', 'pg/mL', 'mg/dL', 'mg/L', 'g/dL', 'g/L', 'mEq/L', 'mmol/L', 'μmol/L', 'umol/L', 'µmol/L',
      'IU/L', 'U/L', 'fL', 'pg', '%', '秒', '万', '/mL',

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
      '(?<![A-Za-z])P\\s*\\d+\\.?\\d*\\s*mg\\/dL',
      '(?<![A-Za-z])P\\s*\\d{2,3}\\s*回\\s*\\/\\s*分',
      '(?<![A-Za-z])R\\s*\\d{1,2}\\s*回\\s*\\/\\s*分',
      '(?<![A-Za-z])T\\s*\\d{2}(?:\\.\\d)?\\s*(?:℃|°C|°c|度(?:\\s*\\d\\s*分)?)',

      '(?<![A-Za-z])BT\\s*\\d{2}(?:\\.\\d)?\\s*(?:℃|°C|°c|度(?:\\s*\\d\\s*分)?)?',
      '(?<![A-Za-z])(?:HR|PR)\\s*\\d{2,3}(?:\\s*回\\s*\\/\\s*分|\\s*bpm)?(?![\\d.])',
      '(?<![A-Za-z])RR\\s*\\d{1,2}(?:\\s*回\\s*\\/\\s*分)?(?![\\d.])'
    ]).join('|');


    const LAB_COUNTER_WORD_AFTER_REGEX = /^\s*(?:単位|分間?|回(?!\s*\/)|名|人|日間?|週間?|か月|ヶ月|カ月|時間|歩|セット|本|枚|個|錠|包|m(?![A-Za-zμ\/²2]))/;
    function isPlausibleLabMatch(matchText, afterText) {
      const m = String(matchText || '');
      const lead = (m.match(/^[A-Za-z][A-Za-z\-]*/) || [''])[0];
      if (lead && lead.length <= 2 && /^[a-z]+$/.test(lead)) return false;
      if (LAB_COUNTER_WORD_AFTER_REGEX.test(String(afterText || ''))) return false;
      if (/^\s*(?:mg|g|kcal)(?![A-Za-z\/])/.test(String(afterText || ''))) return false;
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
      { tags: [3], regex: /(\bCr(?:e)?\b|クレアチニン|\bBUN\b|\bUN\b|尿素窒素|e-?GFR|尿酸|\bUA\b|尿蛋白|尿糖|尿比重)/i },
      { tags: [7], regex: /(\bWBC\b|白血球|\bCRP\b|C反応性|体温|(?<![A-Za-z])B?T\s*\d{2})/i },

      { tags: [9], regex: /(APTT|PT-INR|PT%|\bPT(?=\s*[\d%(（])|プロトロンビン|Dダイマー|D-ダイマー|\bFDP\b|フィブリノ|\bPLT\b|血小板)/i }
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
    // Detect formatting before sentence splitting; never consume a row with a value.
    // Generic test-explanation memo: "<sign/test name>: <how the maneuver is done>" with no documented result.
    const TEST_MEMO_LABEL_REGEX = /(?:徴候|兆候|サイン|テスト|試験|反射|ホーマンズ|Homans|test)$/i;
    const TEST_MEMO_RESULT_REGEX = /陽性|陰性|[(（][+＋\-－−][)）]|あり|なし|認め|出現|疼痛|痛みあ|異常|所見/;
    function isTestExplanationMemo(str, allowIncomplete) {
      const m = String(str || '').trim().match(/^([^\s:：]{2,20})[:：]\s*(.*)$/);
      if (!m || !TEST_MEMO_LABEL_REGEX.test(m[1]) || TEST_MEMO_RESULT_REGEX.test(m[2])) return false;
      return allowIncomplete ? true : /(?:とき|場合|際)[。.]?$/.test(m[2]);
    }
    // Generic symptom enumeration copied from a disease description ("A、B、C など、D など"): not evidence about this patient until confirmed.
    function isGenericSymptomList(str) {
      const t = String(str || '').normalize('NFKC').trim();
      if (!t || t.length > 90 || !/など/.test(t)) return false;
      if (/[「」。]|あり|なし|ない|認め|訴|みられ|見られ|です|ます|[はがをにへ]/.test(t.replace(/[(][^)]*[)]/g, ''))) return false;
      const items = t.split(/、(?![^(]*\))/).map(s => s.trim()).filter(Boolean);
      const hasParen = /\([^)]*\)/.test(t);
      return items.length >= 3 || (items.length >= 2 && (hasParen || (t.match(/など/g) || []).length >= 2));
    }
    // Report header/footer metadata (document ids, institution/department labels, collection/reception/report dates, signer, billing points).
    function isReportMetadataLine(str) {
      const t = String(str || '').normalize('NFKC').replace(/^[・･\s]+/, '').trim();
      if (!t || t.length > 40) return false;
      const LABELS = '担当医|主治医|依頼医|病棟|診療科|依頼科|依頼元|備考|外来|責任者|検査者|報告者|技師|カルテNo\\.?|受付No\\.?';
      if (/^\d{5,}$/.test(t)) return true;
      if (/^[^\s、。:：\d]{1,24}(?:クリニック|病院|医院|診療所|医師会|検査センター|医療センター|健診センター|研究所)$/.test(t)) return true;
      if (new RegExp(`^(?:${LABELS})$`).test(t)) return true;
      if (/^(?:カルテ|診察券|患者|受付|検体|依頼|整理|オーダー)\s*(?:No\.?|NO\.?|番号|ID)\s*[:：]?\s*\S.*$/i.test(t)) return true;
      if (/^(?:採取|採血|受付|報告|依頼|発行|印刷|提出)日(?:時)?\s*[:：]?\s*\S*$/.test(t)) return true;
      if (/^(?:診療科|病棟|担当医|主治医|依頼医|責任者|検査者|報告者|技師)\s*[:：]?\s+(?!(?:より|から|に|は|が|の|と|を|も))[^\s。、「」\d]{1,12}(?:\s[^\s。、「」\d]{1,12})?$/.test(t)) return true;
      if (/^完了(?:\s*\d+)?$/.test(t)) return true;
      if (/^[内外小児産婦人眼耳鼻咽喉皮膚泌尿器精神神経循環器消化器呼吸器整形脳形成放射線麻酔歯口腔]{1,8}科$/.test(t)) return true;
      return /^[^\s、。:：]{2,24}\s*\d{1,4}点$/.test(t);
    }
    // "family given 様": a bare patient-name line from a report header.
    function isBareHonorificName(str) {
      return /^[^\s\d、。:：「」]{1,10}[\s　][^\s\d、。:：「」]{1,10}\s*(?:様|殿|さん)$/.test(String(str || '').normalize('NFKC').trim());
    }
    // Worksheet/assignment instruction lines ("※以下の内容を…完成する", numbered task items, struck-through items).
    function isWorksheetInstructionText(t) {
      // OCR/PDF leaves a stray check-mark glyph (v, ✓, ☑, □) after a task line; it is not part of the instruction.
      t = String(t || '').replace(/(?:\s+|(?<=[。.]))[vV✓✔☑☐□×]$/, '');
      if (/^※\s*以下の[^。]{0,20}(?:完成|記入|作成)する/.test(t)) return true;
      if (/^~~.*~~$/.test(t)) return true;
      return /^\d{1,2}[.．)）]\s*(?:~~)?[^。]{2,40}?(?:を|は)?(?:記入|作成|立案|明確化)(?:し[、,][^。]{0,20})?する。?(?:[(（][^)）]{0,30}[)）])?(?:~~)?$/.test(t) && /(?:アセスメント|関連図|看護計画|基礎情報|看護問題)/.test(t);
    }
    // Section titles of a worksheet/record, not findings: numbered titles (「3 乳房状態・授乳」), numbered viewpoint questions without a quote
    // (「1)出産後の生活の変化を理解しているか」) and table pointers (「上記表参照」). Their context stays with the lines that follow; they never become cards.
    function isSectionHeadingText(str) {
      const x = String(str || '').normalize('NFKC').trim().replace(/^[・･]\s*/, '');
      if (!x || x.length > 40 || /[「」]/.test(x)) return false;
      if (/^(?:上記|以下|下記)?(?:の)?表(?:を)?参照$/.test(x)) return true;
      if (/^\d{1,2}[\s　.)）]*[^\d\s。、：:]{2,16}(?:状態|復古|回復|心理|関係|環境|状況|経過|情報|歴|評価|計画|背景|既往|アセスメント|ケア|機能|役割|授乳)(?:[・/][^\s。、：:]{1,10})*$/.test(x)) return true;
      return /^\d{1,2}[.．)）]\s*[^。、：:\d][^。：:]{2,34}(?:か|ですか|どうか|はないか)$/.test(x);
    }
    // Table captions/references and header-only label rows ("表1 …", "…を表1に示す", short header words).
    function isTableCaptionOrHeaderText(t) {
      if (/^[表図]\s*\d{1,2}[\s　]+\S[^。]{0,30}$/.test(t)) return true;
      if (/[表図]\s*\d{1,2}(?:\([^)]{0,20}\))?\s*に示す。?$/.test(t)) return true;
      if (/^(?:反応|経過|備考|日時|月日|医療者による説明など|家族の言動)$/.test(t)) return true;
      const toks = t.split(/[\s　]+/).filter(Boolean);
      return toks.length >= 2 && toks.length <= 6 && !/[。、「」]/.test(t) && toks.every(w => /^(?:月日|日時|反応|医療者による説明など|家族の言動|[^\s]{1,6}の言動|[^\s]{1,6}の反応|備考|経過)$/.test(w));
    }
    // Generic statements about patients in general (not this patient).
    function isGenericOtherPatientStatement(t) {
      return /患者(?:さん|様)(?:も|は)?(?:おおぜい|大勢|たくさん|多く|何人も)(?:います|いる|いらっしゃいます)/.test(t) && !/[「」]/.test(t);
    }
    // Raw HTML artifacts (stray tags / character entities from copy-paste) are removed; Japanese angle-bracket headings such as <入院時の状況> are not HTML and stay.
    function stripHtmlArtifacts(str) {
      return String(str || '')
        .replace(/<\s*\/?\s*(?:br|p|div|li|tr|tbody|thead|table|ul|ol|h[1-6])\b[^>]*>/gi, '\n')
        .replace(/<\s*\/?\s*(?:span|b|i|u|strong|em|font|a|td|th|small|sup|sub|mark|code|pre)\b[^>]*>/gi, ' ')
        .replace(/&nbsp;|&#160;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&amp;/gi, '&')
        .replace(/[ \t]{2,}/g, ' ');
    }
    // ---- v.105: broken source text (wrapped-cell fragments, dropped characters, OCR/PDF artifacts) ----------------------------------------------
    // Local, rule-based. The source is never changed here: each finding carries the original line, the neighbouring lines and, only when a rule can
    // justify it, a labelled restoration candidate (推定・要確認). Where nothing can be inferred the candidate is null (確認不能).
    const BROKEN_TERMINAL_REGEX = /[。！？!?)）」』】〕:：;；.]$|\d\s*(?:%|％|mg|g|kg|mL|ml|L|cm|mm|回|度|℃|°C|mmHg|bpm|点|日|時|分|歳)?$/;
    // 「異常なし」「陰性」「(-)」など、それだけで完結する所見の終わり方。語尾の「し」「い」が途中切れに見えても壊れた文ではない。
    const BROKEN_COMPLETE_FINDING_REGEX = /(?:異常|問題|変化|所見|障害|症状|出血|浮腫|黄疸|発赤|腫脹|疼痛|雑音|嘔吐|下痢|なし|無し|ない|ありません|認めず|認めない|みられず|陰性|陽性|正常|良好|著明|軽度|中等度|高度|なし。?)$|[(（]\s*[-－+＋±]\s*[)）]$/;
    const BROKEN_CONT_END_REGEX = /(?:の|を|に|へ|が|は|も|や|と|で|から|まで|より|など|ため|ので|ながら|し|して|され|され、|、|・|[毎各約再未不非第当両諸])$/;
    const BROKEN_CONT_START_REGEX = /^(?:[、。，．)）」』】〕ぁぃぅぇぉっゃゅょゎー゛゜]|(?:の|を|に|へ|が|は|も|と|で|から|まで|より|など|ため|ので|ながら|して|され|して)(?![一-龥ァ-ヶ]{0,1}[:：]))/;
    const BROKEN_MOJIBAKE_REGEX = /[�□■◆◇▯]|[ÃÂ][\u0080-¿]|縺[぀-ヿ一-龥]|繧[぀-ヿ一-龥]|郢[぀-ヿ一-龥]|(.)\1{6,}|[?？]{3,}|[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;
    const BROKEN_STRUCT_START_REGEX = /^(?:[\d０-９]{1,2}[\/月:：.]|[【\[<＜(（●○◎■□・\-–—＊*▶▷◆◇※]|[^\s:：「」、。]{1,12}[:：]|\|)/;
    function detectBrokenTextLines(text, opts) {
      const lines = String(text || '').normalize('NFKC').split(/\r?\n/);
      const max = (opts && opts.max) || 30;
      const out = [];
      const norm = x => String(x || '').replace(/\s+/g, '');
      const nonEmpty = lines.map((t, i) => ({ t: t.trim(), i })).filter(x => x.t);
      const bal = t => ({ q: (t.match(/「/g) || []).length - (t.match(/」/g) || []).length, b: (t.match(/[（(]/g) || []).length - (t.match(/[）)]/g) || []).length });
      nonEmpty.forEach((ln, k) => {
        const t = ln.t, prev = k ? nonEmpty[k - 1] : null, next = k + 1 < nonEmpty.length ? nonEmpty[k + 1] : null;
        if (/^\|?\s*:?-{3,}/.test(t) || (typeof isSourceStructureText === 'function' && isSourceStructureText(t))) return;
        const reasons = []; let cand = null, basis = '', conf = '';
        const setCand = (c, b, cf) => { if (!cand && c) { cand = c; basis = b; conf = cf; } };
        if (BROKEN_MOJIBAKE_REGEX.test(t)) reasons.push('文字化け・欠落記号・異常な文字の並び');
        const b = bal(t);
        if (b.q !== 0 || b.b !== 0) {
          reasons.push('かっこ・引用の閉じ忘れ／開き忘れ');
          if (next && bal(t + next.t).q === 0 && bal(t + next.t).b === 0) setCand(t + next.t, '次の行を連結するとかっこが閉じる', '中');
          else if (prev && bal(prev.t + t).q === 0 && bal(prev.t + t).b === 0) setCand(prev.t + t, '前の行を連結するとかっこが閉じる', '中');
        }
        // short unterminated line contained in another line: a wrapped-cell fragment
        if (t.length >= 4 && t.length <= 30 && !BROKEN_TERMINAL_REGEX.test(t)) {
          const host = nonEmpty.find(o => o !== ln && o.t.length > t.length && norm(o.t).includes(norm(t)));
          if (host) { reasons.push('他の行に含まれる断片（折り返しの重複）'); setCand(host.t, 'この行を含む別の行', '高'); }
        }
        // starts in the middle of a word/phrase
        if (BROKEN_CONT_START_REGEX.test(t) && !BROKEN_STRUCT_START_REGEX.test(t)) {
          reasons.push('語や文の途中から始まる');
          if (prev && !BROKEN_TERMINAL_REGEX.test(prev.t)) setCand(prev.t + t, '前の行の続きとして連結', '中');
        }
        // ends in the middle of a phrase and the next line is not a new entry
        if (next && t.length >= 6 && !BROKEN_TERMINAL_REGEX.test(t) && BROKEN_CONT_END_REGEX.test(t) && !BROKEN_COMPLETE_FINDING_REGEX.test(t) && !BROKEN_STRUCT_START_REGEX.test(next.t)) {
          reasons.push('文の途中で終わる（次の行に続く可能性）');
          setCand(t + next.t, '次の行を連結', next.t.length <= 30 ? '中' : '低');
        }
        // number / unit split across lines
        if (next && /\d\s*[.,，]?$/.test(t) && /^(?:\d|mg|g|kg|mL|ml|L|cm|mm|回|度|℃|%|％|mmHg|bpm|\/)/.test(next.t) && !BROKEN_STRUCT_START_REGEX.test(next.t)) {
          reasons.push('数値と単位（または桁）が行をまたぐ');
          setCand(t + next.t, '数値と続きを連結', '中');
        }
        if (/\d\s+\d{3}(?!\d)/.test(t) && !/\d{1,2}[\/:]\d/.test(t)) reasons.push('数値の桁の間に空白');
        if (!reasons.length) return;
        out.push({ line: ln.i + 1, text: t, reasons, prev: prev ? prev.t : '', next: next ? next.t : '', candidate: cand, basis, confidence: cand ? conf : '確認不能' });
      });
      return out.slice(0, max);
    }
    // Conservative join for OCR output: only a line that stops in the middle of a phrase and a next line that is plainly its continuation. Returns the text and a record of every join.
    function repairOcrWrappedLines(text) {
      const lines = String(text || '').split(/\r?\n/);
      const out = [], joins = [];
      for (let i = 0; i < lines.length; i++) {
        let cur = lines[i];
        while (i + 1 < lines.length) {
          const t = cur.trim(), n = lines[i + 1].trim();
          if (!t || !n || t.length < 6 || /^\|/.test(t) || BROKEN_TERMINAL_REGEX.test(t) || !BROKEN_CONT_END_REGEX.test(t) || BROKEN_STRUCT_START_REGEX.test(n) || n.length > 40) break;
          joins.push({ from: t, next: n }); cur = t + n; i++;
        }
        out.push(cur);
      }
      return { text: out.join('\n'), joins };
    }
    // v.106: a markdown-like table whose cells wrapped onto the next physical lines (a line without its leading pipe) is re-joined cell by cell, then every filled cell becomes
    // one line "<date> <cell>" and the column meaning (医療者の説明／家族の言動／本人の言動) is returned for S/O. A table without such broken rows is left untouched.
    function normalizeBrokenTableRows(src) {
      const lines = String(src || '').split(/\r?\n/);
      const roles = [];
      const out = [];
      const cellsOf = l => { const t = l.trim().replace(/^\|/, '').replace(/\|$/, ''); return t.split('|').map(c => c.trim()); };
      const roleOf = h => /医療者|説明|指導|看護/.test(h) ? 'staff' : /家族|両親|母|父/.test(h) ? 'family' : /本人|患者|さん/.test(h) ? 'patient' : '';
      const isDateCell = c => /^\d{1,2}\s*月\s*\d{1,2}\s*日/.test(c);
      let i = 0;
      while (i < lines.length) {
        const sepNext = lines[i + 1] && /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(lines[i + 1].trim());
        if (!(/^\s*\|/.test(lines[i]) && sepNext)) { out.push(lines[i]); i++; continue; }
        const header = cellsOf(lines[i]), N = header.length;
        let j = i + 2; const rows = []; let broken = false;
        while (j < lines.length && lines[j].trim() && lines[j].includes('|')) {
          const l = lines[j], starts = /^\s*\|/.test(l), cells = cellsOf(l);
          if (starts) rows.push({ cells: cells.slice(), raw: l });
          else if (rows.length && !isDateCell(cells[0] || '') && cells[0] !== '' ) {
            // continuation of the previous row: segment k continues the k-th cell after the row's first filled cell
            broken = true; const prev = rows[rows.length - 1].cells; const f = Math.max(1, prev.findIndex((c, k) => k > 0 && c));
            cells.forEach((c, k) => { if (c && f + k < N) prev[f + k] = (prev[f + k] || '') + c; });
          } else { broken = true; rows.push({ cells: ('|' + l).split('|').slice(1).map(c => c.trim()), raw: l }); }
          j++;
        }
        if (!broken || N < 3) { for (let k = i; k < j; k++) out.push(lines[k]); i = j; continue; }
        let date = '';
        out.push(lines[i], lines[i + 1]);
        rows.forEach(r => {
          const c = r.cells.map(x => x.replace(/<br\s*\/?>/gi, ' ').trim());
          if (c[0] && isDateCell(c[0])) date = c[0];
          for (let k = 1; k < N; k++) if (c[k]) { out.push(`${date} ${c[k]}`.trim()); roles.push({ text: c[k], role: roleOf(header[k] || '') }); }
        });
        i = j;
      }
      return { text: out.join('\n'), roles };
    }
    // v.106: the reason shown for an excluded structure-like line must match the real cause.
    function structureExclusionReason(str) {
      const t = String(str || '').normalize('NFKC').trim();
      if (isGenericOtherPatientStatement(t)) return { ruleId: 'source.general-explanation', reason: '一般的な説明（患者さん全般についての文）で、この患者個別の所見ではないため除外。説明の内容そのものは資料として残す。' };
      if (isWorksheetInstructionText(t)) return { ruleId: 'source.worksheet-instruction', reason: '課題・記入の指示文で、患者の所見ではないため除外。' };
      if (isSectionHeadingText(t)) return { ruleId: 'source.section-heading', reason: '番号付きの節見出し・観点の問い・表の参照で、患者の所見ではないため除外。続く記録の文脈として使い、配下の記録は別に分類。' };
      if (isTableCaptionOrHeaderText(t)) return { ruleId: 'source.table-caption', reason: '表の題名・参照・見出しの語で、患者の所見や測定値を含まないため除外。配下の記録は別に分類。' };
      return { ruleId: 'source.structure', reason: '資料の表題・節見出し・表の項目名で、患者の所見や測定値を含まないため除外。配下の記録は別に分類。' };
    }
    function isSourceStructureText(str) {
      const t = String(str || '').normalize('NFKC').trim();
      if (isWorksheetInstructionText(t) || isSectionHeadingText(t) || isTableCaptionOrHeaderText(t) || isGenericOtherPatientStatement(t)) return true;
      if (isReportMetadataLine(t)) return true;
      if (/^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(t)) return true;
      if (t.includes('|') && /項目/.test(t) && /基準値|正常・異常/.test(t) && !/\d/.test(t)) return true;
      if (/^\d+\s*期生\s+[^。:：]{0,60}(?:看護過程|援助技術)[^。:：]*$/.test(t)) return true;
      return /^(?:《(?:術前検査結果|カルテより手術の情報|帰室時の状況|カルテ情報)》\s*)+(?:【血液検査データ[ー]?】)?$/.test(t);
    }
    function isUnnecessaryBoilerplateText(str) {
      if (!str) return false;
      const trimmed = str.trim();
      return isSourceStructureText(trimmed) || LAB_TABLE_TITLE_ONLY_REGEX.test(trimmed) || (UNNECESSARY_BOILERPLATE_REGEX.test(trimmed) && !isSectionTitleWithValues(trimmed)) || BARE_PATIENT_HONORIFIC_REGEX.test(trimmed) ||
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

    const BARE_STATUS_WORD_REGEX = /^(無|なし|ない|あり|有り|特になし|特記なし|不明|良好|不良|普通|軽度|中等度|重度|陰性|陽性)(?:[\s　]*[（(][^）)]*[）)])?$/;
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

    const FIELD_LABEL_MATCH_KEYS = Array.from(new Set([...FIELD_LABELS.map(f => f.key), ...Object.keys(FIELD_LABEL_HEADING_ALIASES)])).join('|');
    const FIELD_LABEL_REGEX_SOURCE = `(?:^|[、。\\s])(${FIELD_LABEL_MATCH_KEYS})(?!・)(?!として|について)(?:[:：]\\s*|は|(?=なし|無し|あり|有り|特に|とくに|特記|不明)|(?![ぁ-ゟ゠-ヿ一-鿿]))`;

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
      { pattern: /エリテマトーデス|\bSLE\b|膠原病|強皮症|皮膚筋炎|多発性筋炎|シェーグレン/, tagIds: [5, 7, 8] },
      { pattern: /関節リウマチ/, tagIds: [4, 5] },
      { pattern: /感染症|敗血症/, tagIds: [9] },
      { pattern: /白血病|悪性リンパ腫|多発性骨髄腫|骨髄異形成/, tagIds: [1, 9] },

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
      if (!ids.length && typeof needReferenceFallbackTags === 'function' && !(typeof isDeliberatelyUntaggedLine === 'function' && isDeliberatelyUntaggedLine(text))) needReferenceFallbackTags(text).forEach(h => ids.push(h));
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
