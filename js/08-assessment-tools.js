    // 看護アセスメント支援システム：08-assessment-tools.js（全10ファイルのうち 8 番目）
    // BMI等の自動算出、検査値の評価、不足情報の推定、総合アセスメント表・カード一覧の表示。
    // index.html の <script> で 01〜10 の順に読み込み、1つのプログラムとして動きます
    // （順番を入れ替えないでください。以前の app.js を内容ごとに分けたものです）。

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['08'] = '2026-10-08.2023'; // 版（scripts/stamp-version.js が書き込む）
    // ==========================================================================
    // BMI・ブリンクマン指数の自動算出
    // ------------------------------------------------------------------------
    // 身長・体重、あるいは喫煙本数・喫煙年数の情報カードはあるのに、BMI・ブリンクマン指数
    // そのものの情報カードが無い場合、計算に必要な数値が記録内に揃っていれば自動で算出して
    // カードとして追加する（看護学生が自分で電卓を叩かなくても済むようにするため）。
    // 「検査値AI総合評価」ボタンを押すたびに毎回チェックし、既にあれば何もしない。
    // ==========================================================================
    function pushCalculatedMetricCard(hendersonId, text) {
      const cp = getCurrentPatient();
      cp.items.push({
        id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        text, timestamp: "AI算出", type: 'o',
        hendersonIds: [hendersonId],
        assessmentCols: { [hendersonId]: 'unclassified' },
        aiSuggested: true,
        _touchedAt: new Date().toISOString()
      });
    }

    // 【レビューで発見】HTMLの onclick="fn('…')" に入れるID。escapeHtml では「'」が属性の中で元に戻り、JSの文字列から
    // 抜け出せてしまう（共有先やファイルの読み込みから届いた記録のIDに「');…//」を入れると、押したときにスクリプトが動く）。
    // アプリが作るID（item_…・dx_…・plan_…・rec_… など）の形だけを通し、それ以外は空にする（押しても何も起きない）。
    function safeDomId(id) {
      const s = String(id == null ? '' : id);
      return /^[\w.:-]{1,160}$/.test(s) ? s : '';
    }
    // 喫煙の記録が「なし」と書かれているか（非喫煙・喫煙歴なし・吸わない）
    const SMOKING_WORD_REGEX = /喫煙|タバコ|たばこ|煙草|シガレット/;
    const NON_SMOKER_REGEX = /(?:喫煙(?:歴)?|タバコ|たばこ|煙草)\s*[:：]?\s*(?:なし|無し|無|ない|吸わない)|非喫煙|吸わない|喫煙しない/;

    function calculateAndAddDerivedMetricCards() {
      const cp = getCurrentPatient();
      const allText = cp.items.map(i => i.text).join('\n');
      let added = 0;

      // BMI: 身長(cm)・体重(kg)の両方が記録にあり、BMIそのもののカードがまだ無い場合に算出する。
      if (!/BMI/i.test(allText)) {
        const heightMatch = allText.match(/身長[:：]?\s*(\d+(?:\.\d+)?)\s*cm/);
        const weightMatch = allText.match(/体重[:：]?\s*(\d+(?:\.\d+)?)\s*kg/);
        if (heightMatch && weightMatch) {
          const heightM = parseFloat(heightMatch[1]) / 100;
          const weightKg = parseFloat(weightMatch[1]);
          if (heightM > 0) {
            const bmi = Math.round((weightKg / (heightM * heightM)) * 10) / 10;
            pushCalculatedMetricCard(2, `BMI ${bmi} (身長${heightMatch[1]}cm・体重${weightMatch[1]}kgより自動算出)`);
            added++;
          }
        }
      }

      // ブリンクマン指数(喫煙指数) = 1日の喫煙本数 × 喫煙年数。肺がん等のリスク評価に使われる。
      // 「20本/日×30年」「1日20本を30年間」のような表記から本数・年数を読み取る（順序が
      // 逆でも対応できるよう2パターン試す）。ブリンクマン指数そのもののカードがまだ無い場合のみ算出する。
      // 【レビューで発見】以前は「n本/日 … m年」を記録全体から探していたため、「輸液 3本/日、2年前から糖尿病」のような
      // 薬・点滴の本数と別の話の年数を組み合わせ、「喫煙歴なし」の患者にも「ブリンクマン指数 6」のカードを作っていた。
      // また説明にある「1日20本を30年間」は読めなかった。喫煙の語を含むカードだけを、「記録から自動で計算する指標」と同じ
      // 読み取り（extractSmoking）で読み、「喫煙なし・非喫煙」と書かれていれば計算しない。
      if (!/ブリンクマン/.test(allText) && !NON_SMOKER_REGEX.test(allText.normalize('NFKC'))) {
        const smokingText = cp.items.map(i => String(i.text || '')).filter(t => SMOKING_WORD_REGEX.test(t)).join('\n');
        const smoking = smokingText ? extractSmoking(smokingText, extractClinicalBasics(allText).age) : null;
        const perDay = smoking && !smoking.partial ? smoking.perDay : null;
        const years = smoking && !smoking.partial ? smoking.years : null;
        if (perDay && years) {
          const index = perDay * years;
          pushCalculatedMetricCard(1, `ブリンクマン指数 ${index} (喫煙${perDay}本/日×${years}年より自動算出)`);
          added++;
        }
      }

      if (added > 0) saveDataAndSync();
      return added;
    }

    // ==========================================================================
    // 検査値の異常値検出（APIキー未設定時のローカル簡易評価用）
    // ------------------------------------------------------------------------
    // 以前は「WBC」「CRP」「Hb」という決め打ちの英語表記でしか検査値を検出できず、実際の
    // 記録が「白血球」「ヘモグロビン」等の日本語表記や、それ以外の検査項目（AST・ALT・
    // 総蛋白・アルブミン・ヘマトクリット等）で書かれていると何も反映されない不具合があった
    // （利用者からの指摘：「検査値名が全く同じものでないと反映されてないと思います。
    // 似たようなものだと反映するようにしてください」「違う名称でも同じ検査値のことを
    // 指しているものも該当するように」）。
    // 抽出パイプライン（groupClinicalPhrasesWithTimestamps）は表形式の検査値を
    // 「項目名 実測値 (基準値: 低〜高)」という形に整えて1枚のカードにまとめており、
    // 記録自体に異常値を示す↑↓が付いていることも多い。この「実測値と基準値」「↑↓」を
    // 検査項目名や日本語／英語の別名を問わず汎用的に読み取ることで、項目名の完全一致に
    // 頼らずどんな検査項目でも異常値を検出できるようにする（別名一覧を保守し続ける必要がない）。
    const LAB_RANGE_CARD_REGEX = /^(.*?)([\d]+(?:\.\d+)?)\s*([^\s(（↑↓]*)\s*([↑↓])?\s*\(基準値[:：]\s*([\d]+(?:\.\d+)?)\s*[〜～\-~]\s*([\d]+(?:\.\d+)?)\s*([^)]*)\)\s*$/;
    // 基準値が記録に無く、文中に検査項目名と数値だけが書かれている場合（例：「WBCが上昇傾向」
    // 「CRP 3.8」のような一文形式）向けの最小限のフォールバック。上のLAB_RANGE_CARD_REGEXで
    // 読み取れなかった場合の保険として、主要な項目だけ日本語・英語どちらの表記でも拾えるようにする。
    const LAB_ALIAS_FALLBACK_TESTS = [
      { names: ['WBC', '白血球'], display: 'WBC(白血球)', unit: '/μL', isAbnormal: v => v > 9000, direction: 'high', comment: '基準値上限を超えており、体内で細菌感染や炎症反応が生じている可能性が示唆されます。' },
      { names: ['CRP'], display: 'CRP', unit: 'mg/dL', isAbnormal: v => v > 0.3, direction: 'high', comment: '高値を示しており、急性炎症反応の存在を強く裏付ける所見です。' },
      { names: ['Hb', 'ヘモグロビン'], display: 'Hb(ヘモグロビン)', unit: 'g/dL', isAbnormal: v => v < 12.0, direction: 'low', comment: '軽度貧血状態であり、組織への酸素運搬能低下に留意した観察が必要です。' }
    ];
    // 「貧血・出血（入院時→術後1日目）: …」のように時点ごとの値をまとめた検査データのカード（labRows付き）は、
    // 項目・時点ごとの1件ずつに戻してから異常値を調べる
    function expandCombinedLabItems(items) {
      return (items || []).flatMap(item => {
        if (!Array.isArray(item.labRows) || !item.labRows.length) return [item];
        return item.labRows.flatMap(row => (row.values || []).map(v => ({ ...item, labRows: undefined, timestamp: v.phase || item.timestamp,
          text: `${row.key} ${v.value}${row.ref ? ` (基準値: ${row.ref})` : ''}` })));
      });
    }
    // 【異常値の見落とし】利用者からの報告：「WBC 2000」「WBC 12,000」「Dダイマー 10」「BNP 500」が、アプリ自身の
    // 基準値を外れていても検出されず、「異常なし」と表示された。以前は基準値を「下限〜上限」の形でしか読めず
    // （「4,000〜9,000」のカンマ、「1.0以下」「18.4以下」の書き方を読めなかった）、基準値の無い値は WBC・CRP・Hb の
    // 3項目の、しかも片側（WBCは高いときだけ）しか調べていなかったため。
    //  ・値と基準値はカンマ付き・「以下／未満／以上」も読む（parseLabReferenceRange）。
    //  ・基準値の書かれていない値は、アプリの基準値（LAB_STANDARDS）と比べる。単位が違えば換算し
    //    （resolveLabUnit）、換算できない・読めないときは「判定できません」として一覧に出す（異常なしにしない）。
    const LAB_JAPANESE_ALIASES = { '白血球': 'WBC', '赤血球': 'RBC', 'ヘモグロビン': 'Hb', '血色素': 'Hb', '血小板': 'Plt', 'PLT': 'Plt',
      'クレアチニン': 'Cre', '尿素窒素': 'BUN', 'ナトリウム': 'Na', 'カリウム': 'K', 'クロール': 'Cl', '総蛋白': 'TP', 'アルブミン': 'Alb', 'ALB': 'Alb',
      'D-ダイマー': 'Dダイマー', 'Dダイマ': 'Dダイマー', '血糖値': '血糖', 'BS': '血糖', 'GOT': 'AST', 'GPT': 'ALT', 'γ-GTP': 'γGTP' };
    const LAB_FIND_KEYS = Array.from(new Set([...Object.keys(LAB_STANDARDS), ...Object.keys(LAB_JAPANESE_ALIASES)])).sort((a, b) => b.length - a.length);
    // 項目名の前が英字・カタカナのとき（「セファゾリンNa 1g」の薬の名前）は検査値ではない
    const LAB_FIND_REGEX = new RegExp(`(?<![A-Za-zＡ-Ｚａ-ｚァ-ヶー])(${LAB_FIND_KEYS.map(escapeRegExp).join('|')})(?![A-Za-z])\\s*(?:[(（][^)）]{0,12}[)）])?\\s*[:：=]?\\s*(${LAB_NUMBER_SOURCE})\\s*((?:${LAB_UNIT_SOURCE}))?\\s*([↑↓])?`, 'gi');
    const LAB_REF_CARD_REGEX = /^(.*?)(\d(?:[\d,]*\d)?(?:\.\d+)?)\s*([^\s(（↑↓]*)\s*([↑↓])?\s*((?:[(（](?!基準値)[^)）]*[)）]\s*)*)[(（]基準値[:：]?\s*([^)）]*)[)）]\s*$/;
    const LAB_FALLBACK_COMMENTS = Object.fromEntries(LAB_ALIAS_FALLBACK_TESTS.map(t => [t.names[0], t]));
    const toNumber = v => Number(String(v).replace(/,/g, ''));
    function labDirection(value, range, arrow) {
      if (arrow === '↑') return 'high';
      if (arrow === '↓') return 'low';
      if (!range) return null;
      if (range.high !== null && range.high !== undefined && (range.highExclusive ? value >= range.high : value > range.high)) return 'high';
      if (range.low !== null && range.low !== undefined && (range.lowExclusive ? value <= range.low : value < range.low)) return 'low';
      return '';
    }
    // 基準値の文字（「350-500×10^4/μL」「18.4pg/mL以下」「0.3以下 mg/dL」）から単位だけを取り出す
    function refUnitOf(refText) {
      return normalizeLabUnit(String(refText || '').replace(/^\s*(?:[<＜≦≤>＞≧≥]=?)?\s*[\d.,]+\s*(?:[〜～~\-－]\s*[\d.,]+)?/, '').replace(/以下|未満|以上|超/g, '').trim());
    }
    // 値と基準値の単位が違っても、同じ種類（数・重さ）の単位なら換算して比べる（「WBC 8100/μL（基準値 8.1-9.0×10^3/μL）」）
    const LAB_UNIT_SCALE = {
      '/μL': ['count', 1], '/mm3': ['count', 1], '千/μL': ['count', 1e3], '×10^3/μL': ['count', 1e3], '×10^4/μL': ['count', 1e4], '万/μL': ['count', 1e4], '万/mm3': ['count', 1e4], '×10^6/μL': ['count', 1e6],
      'g/dL': ['mass', 10], 'g/L': ['mass', 1], 'mg/dL': ['mass', 1e-2], 'mg/L': ['mass', 1e-3], 'μg/mL': ['mass', 1e-3], 'μg/dL': ['mass', 1e-5], 'ng/mL': ['mass', 1e-6], 'pg/mL': ['mass', 1e-9]
    };
    function labUnitRatio(fromUnit, toUnit) {
      const a = LAB_UNIT_SCALE[normalizeLabUnit(fromUnit)], b = LAB_UNIT_SCALE[normalizeLabUnit(toUnit)];
      return a && b && a[0] === b[0] ? a[1] / b[1] : null;
    }
    // 同じ意味の単位をそろえて比べる（万/μL＝×10^4/μL、IU/L＝U/L、/mm3＝/μL）
    function sameLabUnit(a, b) {
      const canon = u => normalizeLabUnit(u).replace(/^万\/μL$|^万\/mm3$/, '×10^4/μL').replace(/^IU\/L$/, 'U/L').replace(/^\/mm3$/, '/μL');
      return canon(a) === canon(b);
    }
    // 検査値を調べる。findings＝基準値を外れた値、undetermined＝判定できなかった値、checked＝判定できた値の数
    function evaluateLabFindings(oItems) {
      const findings = [];
      const undetermined = [];
      let checked = 0;
      expandCombinedLabItems(oItems).forEach(item => {
        const text = String(item.text || '').normalize('NFKC');
        if (/基準値/.test(text)) {
          const m = LAB_REF_CARD_REGEX.exec(text);
          const name = m ? (m[1].replace(/^.*[:：]\s*/, '').trim() || '検査値') : (text.split(/\s/)[0] || '検査値');
          if (!m) { undetermined.push({ label: name, text, reason: '値や基準値の書き方を読み取れませんでした', timestamp: item.timestamp }); return; }
          const value = toNumber(m[2]);
          const unit = (m[3] || '').trim();
          const range = parseLabReferenceRange(m[6]);
          const refUnit = refUnitOf(m[6]);
          if (!Number.isFinite(value) || (!range && !m[4])) { undetermined.push({ label: name, text, reason: '基準値の書き方を読み取れませんでした', timestamp: item.timestamp }); return; }
          let compared = value;
          if (!m[4] && unit && refUnit && !sameLabUnit(unit, refUnit)) {
            const ratio = labUnitRatio(unit, refUnit);
            if (!ratio) { undetermined.push({ label: name, text, reason: `値の単位（${unit}）と基準値の単位（${refUnit}）が違い、換算できません`, timestamp: item.timestamp }); return; }
            compared = value * ratio;
          }
          checked++;
          const direction = labDirection(compared, range, m[4]);
          if (direction) findings.push({ label: name, value, unit, refLow: range ? range.low ?? NaN : NaN, refHigh: range ? range.high ?? NaN : NaN, refText: m[6].trim(), direction, timestamp: item.timestamp, sourceText: text });
          return;
        }
        // 基準値の書かれていない値：文中の検査項目を全部探して、アプリの基準値と比べる
        LAB_FIND_REGEX.lastIndex = 0;
        let mm;
        while ((mm = LAB_FIND_REGEX.exec(text)) !== null) {
          const written = mm[1];
          const key = LAB_STANDARDS[written] ? written : (LAB_JAPANESE_ALIASES[written] || Object.keys(LAB_STANDARDS).find(k => k.toLowerCase() === written.toLowerCase()));
          const std = key && LAB_STANDARDS[key];
          if (!std) continue;
          // 文の途中の値（「CRPが3.8に上昇」など）も値として扱う。単位は換算してから比べる
          const resolved = resolveLabUnit(key, mm[2], mm[3] || '');
          if (!resolved) { undetermined.push({ label: written, text, reason: mm[3] ? `単位（${mm[3]}）を基準値の単位（${std.unit}）に換算できません` : '単位が書かれておらず、値の大きさから単位を決められません', timestamp: item.timestamp }); continue; }
          const value = toNumber(resolved.value);
          const range = parseLabReferenceRange(std.ref);
          if (!Number.isFinite(value) || !range) { undetermined.push({ label: written, text, reason: '値を読み取れませんでした', timestamp: item.timestamp }); continue; }
          checked++;
          const direction = labDirection(value, range, mm[4]);
          if (!direction) continue;
          const fb = LAB_FALLBACK_COMMENTS[key] || LAB_FALLBACK_COMMENTS[written];
          findings.push({ label: written, value, unit: resolved.unit || std.unit, refLow: range.low ?? NaN, refHigh: range.high ?? NaN, refText: `${std.ref} ${std.unit}`.trim(), direction,
            comment: fb && fb.direction === direction ? fb.comment : undefined, converted: resolved.note || '', timestamp: item.timestamp, sourceText: text });
        }
      });
      return { findings, undetermined, checked };
    }
    function extractAbnormalLabFindings(oItems) {
      return evaluateLabFindings(oItems).findings;
    }

    window.evaluateLabValuesAI = guardAiStep('lab', async function() {
      // AIは使わない（v.27）：検査値の評価は、いつもサイト内のルール（登録された基準との比較）で出す
      const cp = getCurrentPatient();
      const prevResult = cp.labEvaluationResult;
      const addedMetrics = calculateAndAddDerivedMetricCards();
      if (addedMetrics > 0) showToast(`${addedMetrics}件の指標（BMI・ブリンクマン指数等）を自動算出してカードに追加しました`, 'info');
      const oItems = cp.items.filter(i => i.type === 'o');
      if (oItems.length === 0) return showToast('Oデータ（検査値やバイタル）がありません。先に分類してください', 'warn');

      const labTexts = oItems.map(i => `[${i.timestamp}] ${i.text}`).join('\n');
      document.getElementById('lab-evaluation-panel')?.classList.remove('hidden');
      DOM.labEvalContent.innerHTML = `<div class="flex items-center text-[var(--accent-dark)]"><i class="fa-solid fa-spinner fa-spin mr-2"></i> 登録された基準で検査値を確認しています...</div>`;

      if (true) { // AIは使わない（v.27）
        // AIなしでは、原文を残したまま、OCRの疑い・基準値・推移・考察を出す（buildLabAssessment）。読み取れる検査値が無いときだけ従来の簡易チェック
        const rule = buildLabAssessment(cp);
        if (rule.has) {
          DOM.labEvalContent.innerHTML = rule.html;
          if (typeof refreshAiResults === 'function') refreshAiResults(true);
          showToast('検査値の評価を表示しました（AIなし）。要確認の値は原本で確かめてください', 'success');
          return;
        }
        setTimeout(() => {
          let evaluation = `【検査値の簡易チェック（AIなし・登録された基準値との比較）】\n`;
          const { findings, undetermined, checked } = evaluateLabFindings(oItems);
          if (findings.length > 0) {
            findings.forEach(f => {
              const rangeText = f.refText ? `基準値 ${f.refText} に対し` : '';
              const levelLabel = f.direction === 'high' ? '高値' : '低値';
              const comment = f.comment || (f.direction === 'high'
                ? '基準値を上回っており、何らかの異常所見や炎症・臓器への負荷等の可能性が示唆されます。'
                : '基準値を下回っており、機能低下や消耗状態等の可能性が示唆されます。');
              evaluation += `・${f.label} (${f.value}${f.unit || ''}${f.timestamp ? '／' + f.timestamp : ''}): ${rangeText}${levelLabel}を示しており、${comment}\n`;
            });
          } else if (checked > 0) {
            evaluation += `簡易チェックでは異常値を検出できませんでした（基準値と比べられた検査値 ${checked}件）。すべての項目を判定できるわけではありません。`;
          } else {
            evaluation += `基準値と比べて判定できる検査値が見つかりませんでした（「異常なし」という意味ではありません）。すべての項目を判定できるわけではありません。`;
          }
          if (undetermined.length > 0) {
            evaluation += `\n【判定できません】次の値は、単位や基準値を読み取れなかったため、異常かどうかを判定していません。記録を確認してください。\n`;
            undetermined.forEach(u => { evaluation += `・${u.label}${u.timestamp ? '（' + u.timestamp + '）' : ''}：${u.reason}（記録：${u.text.slice(0, 60)}）\n`; });
          }

          // 記録の文章（患者名・検査値の原文）を含むので、HTMLとして解釈されないよう文字を変換してから改行だけを<br>にする
          cp.labEvaluationResult = escapeHtml(evaluation).replace(/\n/g, '<br>');
          if (finishAiResult(cp, () => { DOM.labEvalContent.innerHTML = cp.labEvaluationResult; }, '検査値の評価')) showToast('検査値の評価を表示しました', 'success');
        }, 800);
        return;
      }

      // Geminiによる検査値の文章生成機能は廃止。評価は上記の登録基準による処理のみ。

    });

    // 「不足情報をAI推定」：入院前後の記録の差分・Oデータの医学的所見・参考データを根拠に、
    // ヘンダーソン各項目の「不足情報」欄へ "原因: ... → ...と考えられる" の形式でカードを追加する。
    // ==========================================================================
    // 「不足情報をAI推定」のローカル簡易ルール（APIキー未設定時）向けの診断名別チェック項目
    // ------------------------------------------------------------------------
    // 以前アップロードいただいた「胃がん周術期看護 判断基準」の資料をもとに、胃がん（胃切除術）
    // 患者で術後に確認すべき代表的な観察項目を登録しておく（利用者からの指摘：「AIの不足情報の
    // 推定では以前テキストで渡したものを基準にアップデートしてください」）。AIキーを使ったAI経路は
    // 既にbuildEffectiveNotebookContent()経由でこの資料全体を参照して判断しているが、APIキー未設定時の
    // ローカル簡易ルールは単純な入院前後の記録有無チェックのみだったため、同じ資料の内容を
    // 主要ポイントに絞って反映する。記録内にキーワードが一つも見当たらない場合のみ提案する
    // （既に記録があるのに重ねて提案しないようにするため）。
    const GASTRIC_POSTOP_EXPECTED_CHECKS = [
      { hendersonId: 9, keywords: ['ドレーン', '排液', '吻合部ドレーン', '腹腔ドレーン'],
        reason: 'ドレーン排液の性状（血性→淡血性→淡黄色）・量の観察は縫合不全・膵液漏・腹腔内出血の早期発見に重要だが、その記録が見当たらない → ドレーン排液の性状・量の経時的な観察記録が必要と考えられる' },
      { hendersonId: 3, keywords: ['尿道カテーテル', '膀胱留置カテーテル', '尿量', '自尿'],
        reason: '膀胱留置カテーテルによる尿量・尿性状のモニタリングは循環動態・腎機能評価に重要だが、その記録が見当たらない → 尿量（目安30mL/h以上）・尿性状、抜去後は自尿の有無の観察記録が必要と考えられる' },
      { hendersonId: 1, keywords: ['弾性ストッキング', 'DVT', 'PTE', '深部静脈血栓', '間歇的空気圧迫', 'IPC', 'フットポンプ'],
        reason: '早期離床・弾性ストッキング等によるDVT/PTE予防は周術期の重要な介入だが、その実施・観察記録が見当たらない → 弾性ストッキングの装着状況、下肢の皮膚障害・循環障害（冷感・チアノーゼ）の観察記録が必要と考えられる' },
      { hendersonId: 10, keywords: ['せん妄', '不穏', '見当識', 'リアリティ・オリエンテーション'],
        reason: '全身麻酔下の消化器手術は術後せん妄の誘発・促進要因（疼痛・ライン類による拘束感・環境変化等）が多いが、せん妄の有無に関する観察記録が見当たらない → 意識レベル・見当識、過活動型（興奮・不穏）／低活動型（活気低下・傾眠）の有無の観察記録が必要と考えられる' },
      { hendersonId: 1, keywords: ['疼痛', 'NRS', 'PCA', '鎮痛'],
        reason: '十分な鎮痛は離床・排痰・咳嗽を促す前提として重要だが、術後の疼痛評価に関する記録が見当たらない → NRS等の疼痛スケールでの評価、鎮痛薬（PCA等）の効果の観察記録が必要と考えられる' }
    ];
    function detectGastricPostopMissingChecks(activeItems) {
      const allText = activeItems.map(i => i.text).join('\n');
      // 診断名・手術術式に限らず記録全体から胃がん（胃切除術）の患者かどうかを判定する
      // （DIAGNOSIS_TAG_HINTSの胃がんパターンと同じ語を用いる）。
      if (!/胃がん|胃癌|胃切除|胃全摘|幽門側胃切除/.test(allText)) return [];
      return GASTRIC_POSTOP_EXPECTED_CHECKS.filter(check => !check.keywords.some(kw => allText.includes(kw)));
    }

    // 大腿骨近位部骨折（人工骨頭置換術・骨接合術）患者向けの同種チェック
    // ------------------------------------------------------------------------
    // 利用者からアップロードいただいた「大腿骨近位部骨折の解剖・基礎知識・周術期看護」の
    // 資料をもとに、胃がんと同じ考え方で術後に確認すべき代表的な観察項目を登録する。
    // 胃がんには無い「脱臼予防（禁忌肢位）」は、BHA・THA施行後に特有かつ見落とすと
    // 重大な合併症（再脱臼・再手術）につながるため、独立した項目として追加する。
    const HIP_FRACTURE_POSTOP_EXPECTED_CHECKS = [
      { hendersonId: 9, keywords: ['ドレーン', '排液', '関節腔ドレーン'],
        reason: '関節腔内ドレーンの排液の性状（血性→淡血性→漿液性）・量の観察は血腫形成・創部感染の早期発見に重要だが、その記録が見当たらない → ドレーン排液の性状・量の経時的な観察記録が必要と考えられる' },
      { hendersonId: 3, keywords: ['尿道カテーテル', '膀胱留置カテーテル', '尿量', '自尿'],
        reason: '尿道カテーテル留置中の尿量・尿性状の観察、早期抜去の評価は尿路感染（CAUTI）予防に重要だが、その記録が見当たらない → 尿量・尿性状、抜去後は自尿の有無の観察記録が必要と考えられる' },
      { hendersonId: 1, keywords: ['弾性ストッキング', 'DVT', 'PTE', '深部静脈血栓', '肺塞栓症', '間欠的空気圧迫', '間歇的空気圧迫', 'IPC', 'フットポンプ'],
        reason: '受傷後の不動化・手術侵襲によるDVT/PTEリスクが高いが、弾性ストッキング・間欠的空気圧迫装置（フットポンプ）等の予防的介入や下肢の観察記録が見当たらない → 弾性ストッキングの装着状況、下肢の腫脹・把握痛（Homans徴候）の観察記録が必要と考えられる' },
      { hendersonId: 1, keywords: ['疼痛', 'NRS', '鎮痛', '神経ブロック'],
        reason: '骨折部・術創部の疼痛は離床・リハビリの妨げやせん妄の誘発因子となるが、術後の疼痛評価に関する記録が見当たらない → NRS等の疼痛スケールでの評価、鎮痛薬・神経ブロックの効果の観察記録が必要と考えられる' },
      { hendersonId: 4, keywords: ['脱臼', '禁忌肢位', '外転枕', '良肢位'],
        reason: '人工骨頭置換術（BHA）・人工股関節全置換術（THA）後は禁忌肢位（屈曲・内転・内旋等）逸脱による脱臼のリスクがあるが、良肢位保持・禁忌肢位に関する観察・指導の記録が見当たらない → 外転枕による良肢位保持の状況、体位変換・移乗時の禁忌肢位逸脱の有無の観察記録が必要と考えられる' },
      { hendersonId: 10, keywords: ['せん妄', '不穏', '見当識', 'リアリティ・オリエンテーション'],
        reason: '高齢の骨折患者は術後せん妄の準備・誘発要因（高齢・侵襲・疼痛・環境変化・身体拘束等）が多いが、せん妄の有無に関する観察記録が見当たらない → 意識レベル・見当識、過活動型（興奮・不穏）／低活動型（活気低下・傾眠）の有無の観察記録が必要と考えられる' }
    ];
    function detectHipFracturePostopMissingChecks(activeItems) {
      const allText = activeItems.map(i => i.text).join('\n');
      // 診断名・手術術式に限らず記録全体から大腿骨近位部骨折の患者かどうかを判定する
      // （DIAGNOSIS_TAG_HINTSの大腿骨近位部骨折パターンと同じ語を用いる）。
      if (!/大腿骨(?:近位部|頸部|転子部|転子下)?骨折|人工骨頭置換術|人工股関節全置換術|\bBHA\b|\bTHA\b/.test(allText)) return [];
      return HIP_FRACTURE_POSTOP_EXPECTED_CHECKS.filter(check => !check.keywords.some(kw => allText.includes(kw)));
    }

    // 肺炎（CAP/HAP/NHCAP・誤嚥性肺炎）患者向けの同種チェック
    // ------------------------------------------------------------------------
    // 利用者からアップロードいただいた「呼吸器系の解剖生理・肺炎の基礎知識・治療管理・
    // 退院支援」の資料をもとに、胃がん・大腿骨近位部骨折と同じ考え方で確認すべき代表的な
    // 観察項目を登録する。誤嚥性肺炎に特有の「口腔ケア」「嚥下機能評価」は見落とすと再発・
    // 重症化に直結するため、独立した項目として追加する。
    const PNEUMONIA_EXPECTED_CHECKS = [
      { hendersonId: 1, keywords: ['SpO2', '酸素', '鼻カニューレ', '酸素マスク', 'ベンチュリマスク', 'HFNC', 'NPPV'],
        reason: '酸素療法デバイスの選択・流量管理とSpO2の推移観察（労作時含む）は低酸素血症・CO2ナルコーシスの早期発見に重要だが、その記録が見当たらない → 使用デバイス・流量・安静時/労作時のSpO2推移の観察記録が必要と考えられる' },
      { hendersonId: 1, keywords: ['排痰', '体位ドレナージ', 'スクイージング', 'ハフィング', '気道吸引', 'ネブライザー'],
        reason: '気道クリアランス（排痰援助）は無気肺・低酸素血症の予防に重要だが、体位ドレナージ・スクイージング・気道吸引等の実施・観察記録が見当たらない → 痰の性状・量、排痰援助の実施状況の観察記録が必要と考えられる' },
      { hendersonId: 2, keywords: ['誤嚥', 'むせ', '嚥下機能', 'RSST', 'VF', 'VE', '嚥下調整食', 'とろみ'],
        reason: '高齢者の肺炎（特に誤嚥性肺炎）では嚥下機能の評価と誤嚥予防が再発防止に不可欠だが、その記録が見当たらない → 嚥下機能評価（RSST等）の結果、食事中のむせ・湿性嗄声の有無、食形態・とろみの調整状況の観察記録が必要と考えられる' },
      { hendersonId: 8, keywords: ['口腔ケア', 'バイオフィルム', '義歯ブラシ', '粘膜ブラシ', '舌苔'],
        reason: '口腔内常在菌の減少は誤嚥性肺炎の初回発症・重症化予防の最重要策だが、口腔ケアの実施状況に関する記録が見当たらない → 口腔ケアの実施頻度・方法（歯ブラシ・義歯ブラシ・粘膜ブラシ等）、口腔内の汚染状況の観察記録が必要と考えられる' },
      { hendersonId: 7, keywords: ['体温', '発熱', '解熱', 'KT', 'BT'],
        reason: '発熱の程度・解熱傾向は治療効果判定や全身状態評価に重要だが、体温に関する記録が見当たらない → 体温の経時的な推移、解熱薬使用時の効果の観察記録が必要と考えられる' },
      { hendersonId: 14, keywords: ['肺炎球菌ワクチン', 'PPSV23', 'インフルエンザワクチン', 'ワクチン接種'],
        reason: '再発予防にはワクチン接種歴の確認・啓発が重要だが、ワクチン接種に関する記録が見当たらない → 肺炎球菌ワクチン・インフルエンザワクチンの接種歴の確認、退院指導での啓発の記録が必要と考えられる' }
    ];
    function detectPneumoniaMissingChecks(activeItems) {
      const allText = activeItems.map(i => i.text).join('\n');
      // 診断名・記録全体から肺炎（CAP/HAP/NHCAP・誤嚥性肺炎）の患者かどうかを判定する
      // （DIAGNOSIS_TAG_HINTSの肺炎パターンと同じ語に加え、一般的な「肺炎」表記も含める）。
      if (!/肺炎|\bCAP\b|\bHAP\b|\bNHCAP\b|\bVAP\b/.test(allText)) return [];
      return PNEUMONIA_EXPECTED_CHECKS.filter(check => !check.keywords.some(kw => allText.includes(kw)));
    }

    // 不足情報のカードを同じものとみなす目印（項目の番号と、空白を除いた本文の先頭24字）
    function missingInfoKey(hIds, text) {
      return `${hIds}|${String(text || '').replace(/\s+/g, '').slice(0, 24)}`;
    }
    // AIの答えから JSON の配列を取り出す。```json の囲み・前後の説明・配列を包んだオブジェクト（{"items":[…]}）に対応し、
    // 読み取れなければ null を返す（呼んだ側でエラーにする）
    function parseAiJsonArray(text, keys = []) {
      const raw = String(text || '').replace(/```(?:json)?/gi, '').trim();
      const pick = v => {
        if (Array.isArray(v)) return v;
        if (v && typeof v === 'object') {
          for (const k of keys) if (Array.isArray(v[k])) return v[k];
          const arr = Object.values(v).find(Array.isArray);
          if (arr) return arr;
        }
        return null;
      };
      try { const v = pick(JSON.parse(raw)); if (v) return v; } catch (e) { /* 前後に説明があるときは下で探す */ }
      // 「[」または「{」から始まり、括弧の対応が取れる所までを順に試す（文字列の中の括弧は数えない）
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (ch !== '[' && ch !== '{') continue;
        let depth = 0, inStr = false, esc = false, end = -1;
        for (let j = i; j < raw.length; j++) {
          const c = raw[j];
          if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
          if (c === '"') inStr = true;
          else if (c === '[' || c === '{') depth++;
          else if (c === ']' || c === '}') { depth--; if (depth === 0) { end = j; break; } }
        }
        if (end < 0) continue;
        try { const v = pick(JSON.parse(raw.slice(i, end + 1))); if (v) return v; } catch (e) { /* 次の括弧から試す */ }
      }
      // 最後の「,」・答えの途中切れなどの崩れを直して読む（parseAiJsonLoose の説明を参照）
      return typeof parseAiJsonLoose === 'function' ? pick(parseAiJsonLoose(raw)) : null;
    }

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

    // ==========================================================================
    // 改善案A：AIの答えに「根拠のカード」を付ける
    // ------------------------------------------------------------------------
    // AIに渡すカードの一覧の各行の先頭に〔C1〕〔C2〕…の番号を付け、答えの中で根拠にしたカードを
    // その番号で書いてもらう。画面では番号を、押すと分類ボードのそのカードへ移動できる小さなボタン
    // （カードの冒頭の文字を表示。マウスを重ねると全文）に置き換える（formatAiResultHtml・linkEvidenceCodes）。
    // これで、AIがどのカードを根拠にしたのかを確かめられ、根拠の無い・間違った指摘にも気づきやすくなる。
    // ==========================================================================
    function buildEvidenceIndex(items) {
      const byCode = new Map(), byId = new Map();
      items.forEach((i, k) => {
        const code = `C${k + 1}`;
        byCode.set(code, { id: i.id, type: i.type, text: i.text, timestamp: i.timestamp });
        byId.set(i.id, code);
      });
      return { byCode, byId };
    }
    function evidenceLine(ev, i) {
      const time = i.timestamp && i.timestamp !== '日時不明' ? `[${i.timestamp}]` : '';
      return `〔${ev.byId.get(i.id)}〕[${(i.type || '').toUpperCase()}]${time} ${i.text}`;
    }
    const EVIDENCE_INSTRUCTION = '根拠にしたカードは、文中に必ず〔C番号〕の形（例：〔C3〕〔C12〕）で書いてください。番号は一覧の各行の先頭にあるものを使い、一覧に無い番号は作らないでください。';
    const EVIDENCE_CODE_REGEX = /[〔【\[]\s*(C\s*\d{1,4}(?:\s*[、,，・\/]?\s*C?\s*\d{1,4})*)\s*[〕】\]]/g;
    // html（escapeHtml済み）の中の〔C3〕〔C3、C5〕を、根拠のカードへのボタンに置き換える
    function linkEvidenceCodes(html, ev) {
      return html.replace(EVIDENCE_CODE_REGEX, (m, inner) => {
        const nums = inner.match(/\d{1,4}/g) || [];
        if (!nums.some(n => ev.byCode.has(`C${n}`))) return m;
        return nums.map(n => {
          const c = ev.byCode.get(`C${n}`);
          if (!c) return '';
          const label = c.type === 's' ? 'S' : (c.type === 'o' ? 'O' : '・');
          const snippet = c.text.length > 12 ? `${c.text.slice(0, 12)}…` : c.text;
          const title = `${label}データ${c.timestamp && c.timestamp !== '日時不明' ? `（${c.timestamp}）` : ''}：${c.text}\n（クリックで分類ボードのこのカードへ移動）`;
          // 【レビューで発見】以前は onclick="jumpToEvidenceCard('…')" にIDを入れていた（IDに「'」があるとスクリプトが動く）。
          // IDは data-evidence-id に入れ、js/05 の document のクリックの処理（sanitizeStoredHtml と共通）で移動する。
          return `<span role="button" tabindex="0" class="ai-evidence-chip ai-ev-${escapeHtml(c.type || 'x')}" data-evidence-id="${escapeHtml(safeDomId(c.id))}" title="${escapeHtml(title)}">〔${label} ${escapeHtml(snippet)}〕</span>`;
        }).join('');
      });
    }
    window.jumpToEvidenceCard = function(itemId) {
      const cp = getCurrentPatient();
      if (!(cp.items || []).some(i => i.id === itemId)) {
        return showToast('このカードは見つかりません（削除されたか、分類し直された可能性があります。AIの結果を作り直してください）', 'info');
      }
      jumpToBoardCard(itemId);
    };

    // 「不足情報」欄だけに置かれたカード（不足情報をAI推定などで追加したもの）は、実際の記録ではないため
    // 根拠の一覧からは除き、「不足している情報」として別に渡す（改善案D）。
    // 利用者が自分で書いたアセスメント（js/11）を、看護診断・看護計画のAIへの指示文に入れる
    function ownAssessmentPromptSection(cp) {
      const t = typeof buildMyAssessmentsText === 'function' ? buildMyAssessmentsText(cp) : '';
      return t ? `【利用者（学生）自身が書いたアセスメント】\n${t}\n\n利用者自身のアセスメントを尊重し、それと食い違う判断をするときは理由を短く添えてください。\n\n` : '';
    }
    // 前回AIが推定した不足情報のうち、まだ手を付けていないもの（未確認・編集していない）。推定し直すと置き換える
    function isUntouchedAiMissing(cp, i) {
      return !!i.aiSuggested && isMissingInfoOnlyItem(i) && !(i.editLog && i.editLog.length) && (typeof missingCheckStatus !== 'function' || missingCheckStatus(cp, i.id) === 'unchecked');
    }
    function isMissingInfoOnlyItem(i) {
      const ids = i.hendersonIds || [];
      return ids.length > 0 && ids.every(h => (i.assessmentCols?.[h] || 'unclassified') === 'missing');
    }
    function buildMissingInfoText(cp) {
      // 「確認済み」「該当なし」にした不足情報（js/12）は、もう不足していないので渡さない
      return (cp.items || []).filter(i => i.type !== 'unnecessary' && isMissingInfoOnlyItem(i) && (typeof missingCheckStatus !== 'function' || missingCheckStatus(cp, i.id) === 'unchecked'))
        .map(i => `- ${(i.hendersonIds || []).map(h => hendersonNameOf(h).replace(/^\d+\.\s*/, '')).join('・')}：${i.text.replace(/^原因:\s*/, '')}`).join('\n');
    }
    function buildPerNeedEvidenceText(items, ev) {
      return HENDERSON_NEEDS.map(need => {
        const matching = items.filter(i => i.hendersonIds?.includes(need.id));
        if (matching.length === 0) return null;
        return `${need.id}. ${need.name}\n` + matching.map(i => `- ${evidenceLine(ev, i)}`).join('\n');
      }).filter(Boolean).join('\n\n');
    }
    function markAiRun(cp, step) {
      cp.aiRunAt = { ...(cp.aiRunAt || {}), [step]: new Date().toISOString() };
    }
    // 【レビューで発見】AIのボタンには「実行中」の印が無く、続けて2回押すと同じ依頼が2つ走っていた（看護診断候補は
    // 後から届いた答えが、選び始めたチェックを消していた）。患者ごと・機能ごとに実行中かを覚え、実行中は受け付けない。
    const aiStepRunning = new Set();
    const AI_STEP_LABELS = { lab: '検査値の評価', missing: '不足情報の推定', contradiction: 'S/O矛盾チェック', diagnosis: '看護診断候補', timeline: '経時変化サマリー', careplan: '看護計画', review: '分類の評価' };
    function isAiStepRunning(cp, step) { return !!cp && aiStepRunning.has(`${cp.id}|${step}`); }
    function guardAiStep(step, fn) {
      return async function(...args) {
        const cp = getCurrentPatient();
        const key = `${cp.id}|${step}`;
        if (aiStepRunning.has(key)) { showToast(`「${AI_STEP_LABELS[step] || 'AI'}」は実行中です。終わるまでお待ちください`, 'info'); return; }
        aiStepRunning.add(key);
        if (typeof renderAiSteps === 'function') renderAiSteps(cp);
        try {
          return await fn.apply(this, args);
        } finally {
          aiStepRunning.delete(key);
          if (getCurrentPatient().id === cp.id && typeof renderAiSteps === 'function') renderAiSteps(getCurrentPatient());
        }
      };
    }
    // 【レビューで発見】AIの失敗（空の答え・通信の失敗）のときは、結果の欄をエラーの文だけにせず、前の結果も残して見せる
    // （保存してある前の結果は書き換えない）。表示している患者が変わっていたら何もしない。
    function showAiErrorKeepingPrevious(el, cp, message, prevHtml) {
      if (!el || getCurrentPatient().id !== cp.id) return;
      message = String(message || '').replace(/。）/g, '）'); // 「（…しています。）。」のような句点の重なりを防ぐ
      el.innerHTML = `<span class="text-[var(--brick)]">${escapeHtml(message)}${prevHtml && !/前の結果/.test(message) ? '（前の結果をそのまま残しています）' : ''}</span>` + (prevHtml ? storedAiHtml(prevHtml) : '');
    }

    // ==========================================================================
    // 改善案D：不足情報 → 看護診断 → 看護計画 を順番につなげる
    // ------------------------------------------------------------------------
    // ・総合アセスメント表の上に「①不足情報の推定 → ②看護診断候補 → ③看護計画」の案内を出し、
    //   どこまで済んだか・次にどれを押せばよいかが分かるようにする（renderAiSteps）。
    // ・看護診断候補は1件ずつチェックできる形で表示し（renderDiagnosisPanel）、チェックした診断だけで
    //   看護計画を作る（generateCarePlanAI）。
    // ・①で推定した不足情報は、②③のAIへの指示にも「不足している情報」として渡し、③では観察計画（OP）で
    //   確認する項目に含めてもらう。
    // ==========================================================================
    function formatAiStepTime(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      return isNaN(d) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    function computeAiStepStatus(cp) {
      const run = cp.aiRunAt || {};
      const missingCount = (cp.items || []).filter(i => i.type !== 'unnecessary' && isMissingInfoOnlyItem(i)).length;
      const cands = cp.diagnosisCandidates || [];
      const selectedCount = cands.filter(c => (cp.selectedDiagnosisIds || []).includes(c.id)).length;
      const steps = [
        { key: 'missing', label: '① 不足情報を推定', done: !!run.missing, detail: run.missing ? `済・${missingCount}件（${formatAiStepTime(run.missing)}）` : '未' },
        { key: 'diagnosis', label: '② 看護診断候補', done: !!run.diagnosis || !!cp.diagnosisResult, detail: cands.length ? `済・${cands.length}件中 ${selectedCount}件を選択` : (cp.diagnosisResult ? '済' : '未') },
        // 看護計画は記録から自動で作る（js/12 autoBuildCarePlans）。AIは作るためではなく、できた計画を評価するために使う
        { key: 'careplan', label: '③ 看護計画を評価', done: typeof carePlanSetState !== 'undefined' && !!(carePlanSetState.ai && carePlanSetState.ai[cp.id]), detail: (() => { const n = typeof carePlanList === 'function' ? carePlanList(cp).length : 0; const ev = typeof carePlanSetState !== 'undefined' && carePlanSetState.ai && carePlanSetState.ai[cp.id]; return ev ? `済・計画${n}件を評価` : (n ? `計画${n}件（自動作成）・未評価` : '計画は「看護計画」タブで自動作成'); })() }
      ];
      const next = steps.find(s => !s.done);
      if (next) next.next = true;
      return steps;
    }
    // 【AIのボタンを使いやすく】利用者からの要望：「AIのボタンをもう少し使いやすく」「AIを実行すると総合アセスメント表の
    // ページがごちゃごちゃする」。以前は、右上の「AI分析ツール」の中に7つのボタンが隠れ、その下に「AIで進める順番」の
    // 案内が別にあり、AIを実行するたびに結果の欄が表の上へ1つずつ積み重なっていた。
    //  ・AIのボタンは1列にまとめて常に見せる（左：①不足情報→②看護診断→③看護計画の順番、右：そのほかの確認）。
    //    済んだものには✓と件数、実行中はくるくるを出す。
    //  ・結果は「AIの結果」の欄に種類ごとのタブで1つだけ表示し、表の上に積み重ねない（refreshAiResults）。
    const AI_EXTRA_TOOLS = [
      { key: 'lab', label: '検査値の評価', icon: 'fa-flask-vial', action: 'evaluateLabValuesAI()', panel: 'lab-evaluation-panel', title: '検査値を登録された基準で確認し、臨床的な意味をまとめます' },
    ];
    const AI_STEP_PANELS = { missing: null, diagnosis: 'diagnosis-panel', careplan: null };
    function aiPanelRunning(panelId) {
      const body = panelId && document.getElementById(panelId)?.querySelector?.('.ai-panel-body');
      return !!(body && body.querySelector && body.querySelector('.fa-spinner'));
    }
    function renderAiSteps(cp) {
      // AIは使わない（v.27）：ここには、サイト内のルールだけで出せる「検査値の評価」だけを置く
      const el = document.getElementById('ai-steps');
      if (!el) return;
      const t = AI_EXTRA_TOOLS.find(x => x.key === 'lab');
      const running = aiPanelRunning(t.panel) || isAiStepRunning(cp, t.key);
      const done = !!cp.labEvaluationResult;
      el.innerHTML = `<div class="ai-bar-group ai-bar-tools" aria-label="確認"><button type="button" class="ai-tool${done ? ' done' : ''}" onclick="${t.action}" title="${escapeHtml(t.title)}"><i class="fa-solid ${running ? 'fa-spinner fa-spin' : done ? 'fa-check' : t.icon}"></i>${t.label}</button></div>`;
    }
    function renderDiagnosisPanel(cp) {
      const panel = document.getElementById('diagnosis-panel');
      const content = document.getElementById('diagnosis-content');
      if (!panel || !content) return;
      const cands = cp.diagnosisCandidates || [];
      if (!cp.diagnosisResult && cands.length === 0) { panel.classList.add('hidden'); content.innerHTML = ''; return; }
      panel.classList.remove('hidden');
      // 【レビューで発見】保存された結果のHTMLは、表示の前に動く部品を取り除く（storedAiHtml）
      if (cands.length === 0) { content.innerHTML = storedAiHtml(cp.diagnosisResult); return; }
      const sel = new Set(cp.selectedDiagnosisIds || []);
      content.innerHTML = '<p class="dx-hint">看護計画は記録から自動で作られます（「看護計画」タブ）。ここでは、計画の根拠にしたい診断にチェックを入れておくと、AIの評価で参考にします。</p>' +
        cands.map(c => `<div class="dx-candidate${sel.has(c.id) ? ' dx-selected' : ''}">
          <label class="dx-name"><input type="checkbox" ${sel.has(c.id) ? 'checked' : ''} onchange="toggleDiagnosisSelection('${safeDomId(c.id)}', this.checked)"> ${escapeHtml(c.name)}</label>
          ${c.bodyHtml ? `<div class="dx-body">${storedAiHtml(c.bodyHtml)}</div>` : ''}
        </div>`).join('') +
        `<div class="dx-actions"><span>${sel.size}件を選択中</span><button type="button" class="btn btn-primary text-[11px] py-1" onclick="switchView('careplan')"><i class="fa-solid fa-notes-medical"></i> 看護計画を見る（自動作成）</button></div>`;
    }
    window.toggleDiagnosisSelection = function(id, on) {
      const cp = getCurrentPatient();
      const set = new Set(cp.selectedDiagnosisIds || []);
      if (on) set.add(id); else set.delete(id);
      cp.selectedDiagnosisIds = (cp.diagnosisCandidates || []).map(c => c.id).filter(x => set.has(x));
      persistData();
      renderDiagnosisPanel(cp);
      renderAiSteps(cp);
    };
    // AIの答え（「■ 診断名」で始まる段落の並び）を、1件ずつの候補に分ける。形式が崩れていて
    // 分けられなければ空の配列を返す（その場合は答えをそのまま表示する）。
    function parseDiagnosisCandidates(text) {
      const blocks = [];
      let cur = null;
      (text || '').split('\n').forEach(line => {
        // 【レビューで発見】「### ■ 診断名」（見出しの記号付き）や「1. ■ 診断名」（番号付き）は候補として読めず、
        // 候補が0件になって選べなかった（まとめて実行も②で止まった）。見出しの # と番号を許し、
        // 「看護診断名：」「診断名：」のような書き出しは名前から外す。
        const m = line.match(/^\s*(?:#{1,6}\s*)?(?:\d{1,2}\s*[.．)）、]\s*)?(?:[-*・]\s*)?(?:\*\*)?\s*■\s*(.+?)\s*$/);
        if (m) {
          const name = m[1].replace(/\*\*/g, '').replace(EVIDENCE_CODE_REGEX, '').replace(/^(?:看護診断名?|診断名)\s*\d*\s*[:：]\s*/, '').trim();
          cur = { name, lines: [] }; blocks.push(cur);
        }
        else if (cur) cur.lines.push(line);
      });
      // 【AI機能の評価で発見】AIが「■」を付けずに「## 1. **心拍出量減少**」「1. 活動耐性低下」のような見出しで返すと、
      // 候補が0件になり、まとめて実行も②で止まっていた。「■」の候補が1つも無いときは、次の行が「根拠：」で
      // 始まる見出しの行を候補の名前として読む。
      if (!blocks.length) {
        const lines = (text || '').split('\n');
        const nextText = k => { for (let j = k + 1; j < lines.length; j++) if (lines[j].trim()) return lines[j].trim(); return ''; };
        lines.forEach((line, k) => {
          const t = line.trim();
          if (t && /^(?:\*\*)?根拠(?:\*\*)?\s*[:：]/.test(nextText(k)) && !/^(?:\*\*)?(?:根拠|理由|不足情報)/.test(t)) {
            const name = t.replace(/^#{1,6}\s*/, '').replace(/\*\*/g, '').replace(/^(?:\d{1,2}\s*[.．)）、]\s*)/, '').replace(/^[-*・]\s*/, '')
              .replace(EVIDENCE_CODE_REGEX, '').replace(/^(?:看護診断名?|診断名)\s*\d*\s*[:：]\s*/, '').trim();
            if (name && name.length <= 40) { cur = { name, lines: [] }; blocks.push(cur); return; }
          }
          if (cur) cur.lines.push(line);
        });
      }
      return blocks.filter(b => b.name).map(b => ({ name: b.name, body: b.lines.join('\n').trim() }));
    }





    // 【患者の取り違えを防ぐ】AIの結果が返ってくる前に別の患者に切り替えていたら、結果は頼んだ患者に保存し、
    // 今表示している患者の画面には出さない（以前は、切り替え先の患者の画面に前の患者の結果が表示されていた）。
    function finishAiResult(cp, applyToScreen, label) {
      const same = getCurrentPatient().id === cp.id;
      if (same) {
        if (applyToScreen) applyToScreen();
        saveDataAndSync();
      } else {
        cp.updatedAt = new Date().toISOString();
        savePatientsLocally();
        schedulePatientSync(cp.id);
        showToast(`「${cp.title || ''}」の${label || 'AIの結果'}が届きました（その患者に保存しました。今の画面には出していません）`, 'info', 6000);
      }
      return same;
    }
    // 不足情報欄にAI推定カードを1件追加する共通処理（AI推定であることが分かるよう aiSuggested フラグを付ける）
    function pushMissingInfoCard(hendersonId, text, target = null) {
      const cp = target || getCurrentPatient();
      cp.items.push({
        id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        text, timestamp: "AI推定", type: 'o',
        hendersonIds: [hendersonId],
        assessmentCols: { [hendersonId]: 'missing' },
        aiSuggested: true,
        _touchedAt: new Date().toISOString()
      });
    }

    // ヘンダーソンタグが1つも付いていない（かつ「不要」判定でもない）カードを判定するヘルパー。
    // 【変更】以前は患者背景（item.patientBackground）の目印が付いたカードを「意図的にタグが無いカード」
    // として対象外にしていたが、患者背景の列・表示は廃止済みのため、それらのカードはタグも警告も無い
    // まま見分けがつかなくなっていた（利用者からの指摘：「タグが未設定のものがわかりにくい」。
    // 「受持ち開始」「4〜5日目」等）。「不要」でないカードでタグが1つも無ければ、すべて「タグ未設定」とする。
    function isUntaggedItem(item) {
      return item.type !== 'unnecessary' && (!item.hendersonIds || item.hendersonIds.length === 0) && !item.tagNotNeeded && !isOtherBasicInfoItem(item);
    }
    // 【基本情報（14項目外）】利用者からの指摘（患者36）：「生殖：特に問題なし、出産歴2回、閉経50歳」は
    // 「基本情報／その他」を推奨。ヘンダーソンの14項目に直接の項目が無い情報（生殖・出産歴・閉経など）で、
    // タグが1つも無いカードは「タグ未設定」の警告にせず、「基本情報（14項目外）」として表示する。
    // 学習データ管理の「追加キーワード」で項目を決めれば、タグが付いて通常のカードになる。
    function isOtherBasicInfoItem(item) {
      return !!item && item.type !== 'unnecessary' && (!item.hendersonIds || item.hendersonIds.length === 0) && OUTSIDE_14_NEEDS_REGEX.test(item.text || '');
    }
    // タグ未設定になっている理由（「タグ未設定」の印にマウスを重ねると出す。利用者からの要望：「タグ未設定のものが
    // なぜそうなっているのか」）。ヘンダーソンの14項目に無い情報（生殖など）は、基準ノートのとおり学習データ管理の
    // 「追加キーワード」でどの項目に入れるかを決める。
    const OUTSIDE_14_NEEDS_REGEX = /生殖|出産歴|閉経|月経|妊娠|性生活|性機能/;
    function untaggedReasonOf(item) {
      const text = (item && item.text) || '';
      if (typeof isLabTextUnreliable === 'function' && isLabTextUnreliable(text)) return '検査値の項目名・数値・単位がOCRで崩れている可能性があるため、原本を確認するまで分類していません（原文はそのまま残しています。検査値の評価の欄に「要確認」「原文不明瞭」として出しています）。';
      if (OUTSIDE_14_NEEDS_REGEX.test(text)) {
        const word = text.match(OUTSIDE_14_NEEDS_REGEX)[0];
        return `「${word}」はヘンダーソンの14項目に直接の項目が無いため、自動ではタグを付けていません。学習データ管理の「追加キーワード」で「${word}」を入れる項目を決めると、次から自動で付きます（このカードは下の「＋タグ追加」で選べます）。`;
      }
      if (!/[ぁ-んァ-ヶ]/.test(text.replace(/[:：].*$/, '')) && text.length < 30) return '文字の読み取り（OCR）が乱れているか、短すぎて内容が読み取れないため、どの項目のキーワードにも当たりませんでした。元の文章を確認し、不要なら「不要判定」にしてください。';
      return 'どの項目のキーワードにも当たりませんでした。「＋タグ追加」で項目を選んでください（選んだ結果は学習され、次から同じ文章に付きます）。';
    }

    // カードの一覧表示（画面いっぱい）。利用者からの要望：「情報カードがスクロールしないと見えないのが
    // 見づらいので一覧で見えるように」「一覧表示でも結局スクロールしてる、画面いっぱいで見れるように変更」。
    // 分類ボードの列を伸ばすだけではページ全体のスクロールが必要だったため、画面全体を使う表示に切り替え、
    // 段組みで横幅いっぱいに並べたうえで、すべてのカードが1画面に収まるまで文字を小さくする（fitCardOverview）。
    // 最小の文字の大きさでも収まりきらない場合だけ、スクロールで残りを見る。
    const CARD_OVERVIEW_GROUPS = [['s', 'Sデータ', 'var(--gold)'], ['o', 'Oデータ', 'var(--slate)'], ['unclassified', '未分類', 'var(--ink-muted)'], ['unnecessary', '不必要な情報', 'var(--ink-muted)']];
    const CARD_OVERVIEW_FONT_MAX = 13;
    const CARD_OVERVIEW_FONT_MIN = 8.5;
    // 一覧表示で「タグ未設定のカードだけ」を表示しているか（ヘッダーの「タグ未設定 N枚」ボタンで切り替え）
    let cardOverviewUntaggedOnly = false;
    // 【ページ切り替え】最小の文字の大きさでも1画面に収まらないほどカードが多い場合（患者36：217枚）は、
    // スクロールではなくページに分けて「前へ／次へ」で切り替える（利用者からの要望：「一覧表示したときに
    // すべて見れないので全部が映らない場合はページ切り替えで見れるようにしてください」）。
    // ページに分けるときは読みやすい文字の大きさ（CARD_OVERVIEW_PAGED_FONT）に固定し、1画面に入る枚数ずつに区切る。
    const CARD_OVERVIEW_PAGED_FONT = 11;
    let cardOverviewPage = 0;
    let cardOverviewPageRanges = null; // [[開始, 終了), ...]（overviewOrderedItemsの並びの位置）。1ページならnull
    // 一覧に並べる順（S→O→未分類→不必要）のカード
    // 【日時ごとの区切り】利用者からの要望：「一覧表示後も日時で分かりやすく区切られたほうがいい」。
    // 並べ方は「日時ごと」（入院前・入院時・術前・手術当日・術後1日目…の帯で区切り、その中にS・Oを時刻の順に並べる）と
    // 「S・Oごと」（これまでの並べ方）を、一覧の上のボタンで切り替えられる。既定は日時ごと。このブラウザに覚えておく。
    const OVERVIEW_MODE_KEY = 'nursing_overview_mode';
    function getCardOverviewMode() {
      try { return localStorage.getItem(OVERVIEW_MODE_KEY) === 'type' ? 'type' : 'day'; } catch (e) { return 'day'; }
    }
    window.toggleCardOverviewMode = function() {
      try { localStorage.setItem(OVERVIEW_MODE_KEY, getCardOverviewMode() === 'day' ? 'type' : 'day'); } catch (e) { /* 覚えられなくても切り替えは無視 */ }
      cardOverviewPage = 0;
      cardOverviewPageRanges = null;
      refreshCardOverview();
    };
    // 一覧の区切り（見出し）ごとのカード。日時ごとの場合、不必要な情報は最後にまとめる
    function overviewSections(cp) {
      const items = (cp.items || []).filter(i => !cardOverviewUntaggedOnly || isUntaggedItem(i));
      if (getCardOverviewMode() === 'type') {
        return CARD_OVERVIEW_GROUPS.map(([type, label, color]) => ({ key: type, label, color, day: '', items: items.filter(i => (i.type || 'unclassified') === type) }))
          .filter(sec => sec.items.length);
      }
      const active = items.filter(i => i.type !== 'unnecessary');
      const sections = groupItemsByDay(active).map(g => ({ key: `day:${g.day}`, label: g.day || '日時不明', color: 'var(--accent-dark, var(--accent))', day: g.day, isDay: true, items: g.items }));
      const unnecessary = items.filter(i => i.type === 'unnecessary');
      if (unnecessary.length) sections.push({ key: 'unnecessary', label: '不必要な情報', color: 'var(--ink-muted)', day: '', items: unnecessary });
      return sections;
    }
    function overviewOrderedItems(cp) {
      return overviewSections(cp).flatMap(sec => sec.items);
    }
    // range を渡すと、そのページのカードだけを並べる（見出しの枚数はその区切りの全体の枚数。前のページから
    // 続いている区切りは見出しに「（続き）」を付ける）
    function buildCardOverviewHtml(cp, range) {
      const sections = overviewSections(cp);
      const ordered = sections.flatMap(sec => sec.items);
      const onPage = new Set(range ? ordered.slice(range[0], range[1]) : ordered);
      return sections.map(sec => {
        const group = sec.items.filter(i => onPage.has(i));
        if (group.length === 0) return '';
        const continued = group[0] !== sec.items[0] ? '（続き）' : '';
        const cardsHtml = group.map(i => {
          const type = i.type || 'unclassified';
          const typeColor = (CARD_OVERVIEW_GROUPS.find(g => g[0] === type) || [])[2];
          const badge = type === 's' ? `<span class="ov-badge" style="background:${typeColor}">S</span>` : (type === 'o' ? `<span class="ov-badge" style="background:${typeColor}">O</span>` : '');
          // 日時ごとの区切りの中では、日は見出しにあるので時刻だけを出す
          const shownTime = sec.isDay && sec.day && timestampDayPart(i.timestamp) === sec.day ? timestampClockPart(i.timestamp) : i.timestamp;
          const time = shownTime && shownTime !== '日時不明' ? `<span class="ov-meta">${escapeHtml(shownTime)}</span>` : '';
          const field = (i.fieldLabel ? `<span class="ov-meta">[${escapeHtml(i.fieldLabel)}]</span>` : '') + (isFamilySpeech(i.text) ? '<span class="ov-meta">[家族]</span>' : '');
          const tags = (i.hendersonIds || []).map(h => hendersonNameOf(h).replace(/^\d+\.\s*/, '')).join('・');
          const untagged = isUntaggedItem(i);
          const selected = selectedCardIds.has(i.id);
          // タグ未設定のカードは、赤い背景・枠と先頭の「⚠タグ未設定」で一目で分かるようにする
          // （利用者からの要望：「タグが未設定のものがわかりにくいのでわかりやすくしてください」）
          const untaggedBadge = untagged ? `<span class="ov-untagged-badge" title="${escapeHtml(untaggedReasonOf(i))}"><i class="fa-solid fa-triangle-exclamation"></i> タグ未設定</span>` : '';
          const tagsHtml = (type === 'unnecessary' || untagged || !tags) ? '' : ` <span class="ov-tags">〔${escapeHtml(tags)}〕</span>`;
          // 分類ボードと同じ選択用のチェックボックス（利用者からの要望：「チェックできるボックスも欲しい」）。
          // 選択する（チェックを入れる/カードをクリックする）と、一覧をいったん閉じて元の文章の該当箇所を
          // 表示する（selectCardFromOverview参照）。チェックを外したときは一覧を開いたまま選択だけ外す。
          const check = `<input type="checkbox" class="ov-check" ${selected ? 'checked' : ''} onclick="event.stopPropagation()" onchange="selectCardFromOverview('${safeDomId(i.id)}', this.checked)" title="選択して元の文章の該当箇所を表示（選択は保持されます）">`;
          return `<div class="ov-card ov-${type}${untagged ? ' ov-untagged' : ''}${selected ? ' ov-selected' : ''}" onclick="selectCardFromOverview('${safeDomId(i.id)}', true)" title="クリックで選択し、一覧を閉じて元の文章の該当箇所を表示（選択は保持されます）">${check}${untaggedBadge}${badge}${time}${field}${escapeHtml(i.text)}${tagsHtml}</div>`;
        }).join('');
        // 日時の見出しは段組みの全幅の帯にして、日が変わるところが一目で分かるようにする
        const counts = sec.isDay ? `S ${sec.items.filter(i => i.type === 's').length}・O ${sec.items.filter(i => i.type === 'o').length}${sec.items.some(i => i.type === 'unclassified') ? `・未分類 ${sec.items.filter(i => i.type === 'unclassified').length}` : ''}` : `${sec.items.length}`;
        return `<div class="ov-heading${sec.isDay ? ' ov-day-heading' : ''}" style="color:${sec.color}">${sec.isDay ? '<i class="fa-regular fa-calendar"></i> ' : ''}${escapeHtml(sec.label)}（${counts}）${continued}</div>${cardsHtml}`;
      }).join('');
    }
    const CARD_OVERVIEW_EMPTY_HTML = '<p class="text-xs text-[var(--ink-muted)] p-4">カードがありません。</p>';
    // 段組みは高さが決まっていると入りきらない分が横（右）に段として増えるため、縦・横の両方ではみ出しを見る
    function cardOverviewOverflows(body) {
      return body.scrollHeight > body.clientHeight + 1 || body.scrollWidth > body.clientWidth + 1;
    }
    function fitCardOverview() {
      const body = document.getElementById('card-overview-body');
      if (!body || body.offsetParent === null) return;
      const cp = getCurrentPatient();
      const ordered = overviewOrderedItems(cp);
      // ①まず全部を1画面に：大きい文字から順に試し、はみ出さなくなった大きさで止める（段数は横幅で自動）
      body.innerHTML = buildCardOverviewHtml(cp) || CARD_OVERVIEW_EMPTY_HTML;
      let size = CARD_OVERVIEW_FONT_MAX;
      body.style.setProperty('--ov-font', `${size}px`);
      while (size > CARD_OVERVIEW_FONT_MIN && cardOverviewOverflows(body)) {
        size = Math.round((size - 0.5) * 10) / 10;
        body.style.setProperty('--ov-font', `${size}px`);
      }
      if (!cardOverviewOverflows(body) || ordered.length <= 1) {
        cardOverviewPageRanges = null;
        cardOverviewPage = 0;
        updateCardOverviewPager(ordered.length);
        return;
      }
      // ②最小の文字でも収まらない：読みやすい大きさに戻し、1画面に入る枚数ずつページに分ける。
      // ページ切り替えのボタンを出すとヘッダーの高さが変わる（狭い画面では折り返す）ことがあるため、
      // 先にボタンを出した状態にしてから測る。
      body.style.setProperty('--ov-font', `${CARD_OVERVIEW_PAGED_FONT}px`);
      const pager = document.getElementById('card-overview-pager');
      if (pager && pager.classList.contains('hidden')) {
        pager.classList.remove('hidden');
        document.getElementById('card-overview-page-label').textContent = `1 / 1ページ（1〜${ordered.length}枚目／全${ordered.length}枚）`;
      }
      const fits = (s, e) => { body.innerHTML = buildCardOverviewHtml(cp, [s, e]); return !cardOverviewOverflows(body); };
      const ranges = [];
      let start = 0;
      while (start < ordered.length) {
        // 入る最大の枚数を二分探索で探す（最低1枚は載せる）
        let lo = start + 1, hi = ordered.length;
        while (lo < hi) {
          const mid = Math.floor((lo + hi + 1) / 2);
          if (fits(start, mid)) lo = mid; else hi = mid - 1;
        }
        ranges.push([start, lo]);
        start = lo;
      }
      cardOverviewPageRanges = ranges;
      cardOverviewPage = Math.min(Math.max(0, cardOverviewPage), ranges.length - 1);
      renderCardOverviewPage();
    }
    function renderCardOverviewPage() {
      const body = document.getElementById('card-overview-body');
      const cp = getCurrentPatient();
      const total = overviewOrderedItems(cp).length;
      if (!cardOverviewPageRanges) { updateCardOverviewPager(total); return; }
      body.innerHTML = buildCardOverviewHtml(cp, cardOverviewPageRanges[cardOverviewPage]) || CARD_OVERVIEW_EMPTY_HTML;
      body.scrollTop = 0;
      updateCardOverviewPager(total);
    }
    // ヘッダーの「前へ／次へ」とページ番号。1ページに収まっているときは隠す。
    function updateCardOverviewPager(total) {
      const pager = document.getElementById('card-overview-pager');
      if (!pager) return;
      const ranges = cardOverviewPageRanges;
      pager.classList.toggle('hidden', !ranges);
      if (!ranges) return;
      const [s, e] = ranges[cardOverviewPage];
      document.getElementById('card-overview-page-label').textContent = `${cardOverviewPage + 1} / ${ranges.length}ページ（${s + 1}〜${e}枚目／全${total}枚）`;
      document.getElementById('btn-ov-prev').disabled = cardOverviewPage === 0;
      document.getElementById('btn-ov-next').disabled = cardOverviewPage >= ranges.length - 1;
    }
    window.changeCardOverviewPage = function(delta) {
      if (!cardOverviewPageRanges) return;
      const next = Math.min(Math.max(0, cardOverviewPage + delta), cardOverviewPageRanges.length - 1);
      if (next === cardOverviewPage) return;
      cardOverviewPage = next;
      renderCardOverviewPage();
    };
    function isCardOverviewOpen() {
      const modal = document.getElementById('modal-card-overview');
      return !!modal && !modal.classList.contains('hidden');
    }
    // 一覧の中身を今のカードの状態で描き直す（選択・分類・タグが変わったとき、renderSoBoardからも呼ぶ）
    function refreshCardOverview() {
      const cp = getCurrentPatient();
      const body = document.getElementById('card-overview-body');
      const untaggedCount = (cp.items || []).filter(isUntaggedItem).length;
      if (untaggedCount === 0) cardOverviewUntaggedOnly = false;
      // 1ページ分にしておく（fitCardOverviewで1画面に収まるか・何ページに分けるかを決め直す）
      body.innerHTML = buildCardOverviewHtml(cp, cardOverviewPageRanges ? cardOverviewPageRanges[cardOverviewPage] : null) || CARD_OVERVIEW_EMPTY_HTML;
      const count = t => (cp.items || []).filter(i => (i.type || 'unclassified') === t).length;
      document.getElementById('card-overview-counts').textContent = `全${(cp.items || []).length}枚（S ${count('s')}・O ${count('o')}・未分類 ${count('unclassified')}・不必要 ${count('unnecessary')}）`;
      const modeBtn = document.getElementById('btn-overview-mode');
      if (modeBtn) modeBtn.innerHTML = getCardOverviewMode() === 'day'
        ? '<i class="fa-regular fa-calendar"></i> 日時ごと <span class="ov-mode-sub">→ S・Oごとに切替</span>'
        : '<i class="fa-solid fa-layer-group"></i> S・Oごと <span class="ov-mode-sub">→ 日時ごとに切替</span>';
      const filterBtn = document.getElementById('btn-overview-untagged');
      filterBtn.innerHTML = untaggedCount === 0
        ? '<i class="fa-solid fa-check"></i> タグ未設定なし'
        : (cardOverviewUntaggedOnly ? `<i class="fa-solid fa-xmark"></i> タグ未設定 ${untaggedCount}枚だけ表示中（すべて表示に戻す）` : `<i class="fa-solid fa-triangle-exclamation"></i> タグ未設定 ${untaggedCount}枚`);
      filterBtn.className = `ov-untagged-filter${untaggedCount === 0 ? ' none' : ''}${cardOverviewUntaggedOnly ? ' active' : ''}`;
      filterBtn.disabled = untaggedCount === 0;
      // 下の一括操作の帯が出ている間は、最後のカードが帯に隠れないように下に余白を取る
      body.style.paddingBottom = selectedCardIds.size > 0 ? '64px' : '';
      requestAnimationFrame(fitCardOverview);
    }
    window.toggleCardOverviewUntaggedOnly = function() {
      cardOverviewUntaggedOnly = !cardOverviewUntaggedOnly;
      cardOverviewPage = 0;
      cardOverviewPageRanges = null;
      refreshCardOverview();
    };
    // 一覧でカードを選択して元の文章を見に行ったときの一覧の状態（「タグ未設定だけ表示」・スクロール位置）。
    // 「一覧に戻る」で同じ状態の一覧を開き直すために覚えておく。一覧に戻ったら・普通に閉じたら消す。
    let cardOverviewReturnState = null;
    window.openCardOverview = function(restore) {
      const state = restore ? cardOverviewReturnState : null;
      cardOverviewUntaggedOnly = state ? state.untaggedOnly : false;
      cardOverviewPage = state ? (state.page || 0) : 0;
      cardOverviewPageRanges = null;
      cardOverviewReturnState = null;
      document.getElementById('modal-card-overview').classList.remove('hidden');
      refreshCardOverview();
      updateCardOverviewReturnButtons();
      if (state) requestAnimationFrame(() => { document.getElementById('card-overview-body').scrollTop = state.scrollTop; });
    };
    window.closeCardOverview = function() {
      document.getElementById('modal-card-overview').classList.add('hidden');
      updateCardOverviewReturnButtons();
    };
    // 「一覧に戻る」ボタン（元の文章の印の帯と、下の一括操作の帯）は、一覧から来たときだけ表示する
    function updateCardOverviewReturnButtons() {
      const show = !!cardOverviewReturnState && !isCardOverviewOpen();
      ['btn-source-back-to-overview', 'btn-bulk-back-to-overview'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.classList.toggle('hidden', !show);
      });
    }
    // 一覧表示でカードを選択したとき（利用者からの要望：「一覧表示の時に選択すると一度一覧が閉じて
    // 元文章が見えるようにする、ただし選択している状態は保持されるように」）。
    //  ・選択する（カードのクリック／チェックを入れる）：選択に加え（既に選択中ならそのまま）、一覧を
    //    いったん閉じて、分類ボードの入力欄にそのカードの元の文章の該当箇所を印付きで表示する。
    //    それまでに選択していたカードの選択はすべてそのまま残る（下の帯で一括操作・書き出しができる）。
    //  ・チェックを外す：選択だけを外し、一覧は開いたまま（外したカードの元の文章を見る必要は無いため）。
    // 元の文章を確認したら「一覧に戻る」で、同じ表示状態（タグ未設定だけ表示・スクロール位置）の一覧に戻れる。
    window.selectCardFromOverview = function(id, selected) {
      const cp = getCurrentPatient();
      const item = (cp.items || []).find(i => i.id === id);
      if (!item) return;
      if (!selected) {
        selectedCardIds.delete(id);
        if (highlightedSourceItemId === id) clearSourceHighlight(false);
        renderSoBoard();
        return;
      }
      selectedCardIds.add(id);
      const body = document.getElementById('card-overview-body');
      cardOverviewReturnState = { untaggedOnly: cardOverviewUntaggedOnly, scrollTop: body ? body.scrollTop : 0, page: cardOverviewPage };
      document.getElementById('modal-card-overview').classList.add('hidden');
      switchView('so');
      renderSoBoard();
      showSourceHighlight(item);
      updateCardOverviewReturnButtons();
      // 元の文章の表示が画面に入るように移動し、分類ボード上の同じカードは一瞬光らせて場所を示す
      // （ボード側へスクロールすると元の文章が画面から外れることがあるため、ボードはスクロールしない）。
      requestAnimationFrame(() => {
        const view = document.getElementById('source-highlight-view');
        const target = view && !view.classList.contains('hidden') ? view : DOM.sourceText;
        const bar = document.getElementById('source-highlight-bar');
        const rect = (bar && !bar.classList.contains('hidden') ? bar : target).getBoundingClientRect();
        if (rect.top < 0 || rect.top > (window.innerHeight || 0) * 0.5) window.scrollBy({ top: rect.top - 80, behavior: 'smooth' });
        const el = document.getElementById(id);
        if (el) { el.classList.add('card-flash'); setTimeout(() => el.classList.remove('card-flash'), 1600); }
      });
    };
    window.addEventListener('resize', () => {
      const modal = document.getElementById('modal-card-overview');
      if (modal && !modal.classList.contains('hidden')) fitCardOverview();
    });
    document.addEventListener('keydown', e => {
      // 一覧がページに分かれているときは ←／→（PageUp／PageDown）でもページを切り替えられる
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'PageUp' || e.key === 'PageDown') && isCardOverviewOpen() && cardOverviewPageRanges &&
        !(/^(?:INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '') && e.target.type !== 'checkbox')) {
        e.preventDefault();
        changeCardOverviewPage(e.key === 'ArrowLeft' || e.key === 'PageUp' ? -1 : 1);
        return;
      }
      if (e.key !== 'Escape') return;
      const modal = document.getElementById('modal-card-overview');
      if (modal && !modal.classList.contains('hidden')) {
        // 一覧を閉じるだけにする。分類ボード側のEscape（選択をすべて解除）まで動くと、
        // 一覧で選んだカードの選択が消えてしまうため、後ろの処理には渡さない。
        e.stopImmediatePropagation();
        closeCardOverview();
      }
    });

    // 未分類の補助枠を自分で閉じたか（閉じたときは、カードが増えても勝手に開かない）
    let boardAuxClosedByUser = false;
    window.rememberBoardAuxToggle = function(el) {
      const cp = getCurrentPatient();
      if (!el.open && cp.items.some(i => i.type === 'unclassified')) boardAuxClosedByUser = true;
      if (el.open) boardAuxClosedByUser = false;
    };
    // 【キーボードだけで使えるように】カードの選択（チェックボックス）・︙メニュー・タグの選択の後は、ボードを描き直すため
    // それまで選んでいた場所（フォーカス）が消え、Tabキーで最初からたどり直しになっていた。描き直した後も、
    // 同じカードの同じ部品へフォーカスを戻す（カードがほかの列へ移っても、そのカードの部品へ戻す）。
    function captureBoardFocus() {
      const el = document.activeElement;
      const card = el && el.closest ? el.closest('.rec-card') : null;
      if (!card || !card.id) return null;
      const part = el.classList.contains('card-select-checkbox') ? '.card-select-checkbox' : el.classList.contains('card-menu-btn') ? '.card-menu-btn' : el.tagName === 'SELECT' ? 'select' : null;
      return part ? { id: card.id, part } : null;
    }
    function restoreBoardFocus(f) {
      if (!f) return;
      const card = document.getElementById(f.id);
      const el = card && card.querySelector ? card.querySelector(f.part) : null;
      if (el && typeof el.focus === 'function' && document.activeElement !== el) el.focus({ preventScroll: false });
    }
    function renderSoBoard() {
      try { if (typeof window.refreshLabAssessmentPanel === 'function') window.refreshLabAssessmentPanel(); } catch (e) { /* 検査値の評価の更新に失敗しても、ボードは描く */ }
      resetCardLabFlags();
      const focusBefore = captureBoardFocus();
      const cp = getCurrentPatient();
      // 【修正】以前は患者背景（item.patientBackground）の付いたカードを専用の「患者背景」列に
      // 表示していたが、利用者からの指摘（看護記録の原則では、年齢・既往歴・家族構成等の基本情報も
      // 患者本人の発言でない限りOデータであり、S/Oのどちらでもない第三の区分を作るべきではない。
      // 「患者背景に落ちてしまった情報をSとOに振り分けるようにして」）により、この列は廃止した。
      // すべてのカードはtype（未分類/S/O/不要）どおりの列に表示する。item.patientBackground自体は、
      // タグが無くて当然の基本情報カードに「タグ未設定」の警告を出さないための内部的な目印としてのみ残す。
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
      if (isCardOverviewOpen()) refreshCardOverview();
      ['unclassified', 's', 'o'].forEach(key => {
        document.getElementById(`badge-count-${key}`).textContent = boardSearchTerm ? `${shownCounts[key]}/${totalCounts[key]}` : totalCounts[key];
      });
      // 未分類の補助枠：カードがあれば開く（自分で閉じたときはそのまま）。不要の枠は件数だけ出してたたんでおく
      const unnecessaryCount = cp.items.filter(i => i.type === 'unnecessary').length;
      const badgeUnn = document.getElementById('badge-count-unnecessary');
      if (badgeUnn) badgeUnn.textContent = unnecessaryCount;
      const auxUnc = document.getElementById('board-unclassified');
      if (auxUnc && typeof auxUnc.setAttribute === 'function') {
        const hint = document.getElementById('board-unclassified-hint');
        if (hint) hint.textContent = totalCounts.unclassified ? 'S・O に振り分けてください（ドラッグ、またはカードの︙）' : '未分類のカードはありません';
        auxUnc.classList.toggle('is-empty', !totalCounts.unclassified);
        if (totalCounts.unclassified && !boardAuxClosedByUser) auxUnc.open = true;
        if (!totalCounts.unclassified) auxUnc.open = false;
      }
      // 入力欄の広さ（分類の前も後も同じ並び。js/05 の updateSourcePaneLayout）
      if (typeof updateSourcePaneLayout === 'function') updateSourcePaneLayout();
      if (typeof renderWorkflowSteps === 'function') renderWorkflowSteps();
      renderBulkActionBar();
      restoreBoardFocus(focusBefore);
    }


    // ==========================================================================
    // 【検査値の推移】検査値・バイタルサインを「項目 × 日時」の表にするページ（利用者からの要望：
    // 「検査値を日付と各項目がわかりやすい表を、分類ボードや総合アセスメント表とは違うページに作ってほしい」）。
    // 分類済みのカードのうち、先頭が検査項目名・バイタルの名前で始まるもの（「Hb 11.8 g/dL (基準値: …)」
    // 「BT 37.1°C、BP 138/80mmHg、HR 82回/分、SpO2 97%(RA)」）だけを読み、項目ごと・日時ごとに並べる。
    // 「酸素2L開始し、SpO2 94%に上昇」のような文の中の値は、文の意味が変わるので表には入れない。
    // ==========================================================================
    const LAB_TREND_VITALS = [
      { key: '体温', unit: '°C', names: ['体温', 'BT', 'KT', 'T'], high: 37.5 },
      { key: '脈拍', unit: '回/分', names: ['脈拍', '心拍数', '心拍', 'HR', 'PR', 'P'], low: 60, high: 100 },
      { key: '血圧', unit: 'mmHg', names: ['血圧', 'BP'], bp: true },
      { key: '呼吸数', unit: '回/分', names: ['呼吸数', '呼吸', 'RR', 'R'], low: 12, high: 20 },
      { key: 'SpO2', unit: '%', names: ['SpO2', 'SPO2', 'SpO₂', '酸素飽和度'], low: 95 },
      // 体重の変化（心不全の利尿・栄養状態）も日ごとに見たいので、身体計測として同じ表に並べる（基準は付けない）
      { key: '体重', unit: 'kg', names: ['体重'], body: true },
      { key: '身長', unit: 'cm', names: ['身長'], body: true },
      { key: 'BMI', unit: '', names: ['BMI'], body: true }
    ];
    const LAB_TREND_ALIASES = {
      '白血球': 'WBC', '赤血球': 'RBC', 'ヘモグロビン': 'Hb', 'Hgb': 'Hb', 'ヘマトクリット': 'Ht', 'Hct': 'Ht', '血小板': 'Plt', 'PLT': 'Plt',
      '総蛋白': 'TP', '総タンパク': 'TP', 'アルブミン': 'Alb', 'ALB': 'Alb', 'クレアチニン': 'Cre', 'Cr': 'Cre', '尿素窒素': 'BUN',
      'ナトリウム': 'Na', 'カリウム': 'K', 'クロール': 'Cl', '血糖値': '血糖', 'BS': '血糖', 'GLU': '血糖', 'グルコース': '血糖', 'FBS': '血糖',
      'GOT': 'AST', 'GPT': 'ALT', 'γ-GTP': 'γGTP', 'AMY': 'アミラーゼ', 'D-ダイマー': 'Dダイマー'
    };
    const LAB_TREND_EXTRA_KEYS = ['NT-proBNP', 'eGFR', 'LDH', 'CK-MB', 'CK', 'トロポニンT', 'トロポニンI', 'LDL-C', 'HDL-C', '総ビリルビン', 'T-Bil', 'UA', 'Ca', 'Mg', 'TG', 'LDL', 'HDL', 'T-Cho', 'APTT', 'FDP', 'PT%', 'INR',
      'pH', 'PaO2', 'PaCO2', 'HCO3', 'BE', 'Lac', '乳酸', 'D-Bil', 'CPK', 'Fe', 'フェリチン', 'プロカルシトニン', 'PCT'];
    const LAB_TREND_VITAL_BY_NAME = new Map();
    LAB_TREND_VITALS.forEach(v => v.names.forEach(n => LAB_TREND_VITAL_BY_NAME.set(n.toLowerCase(), v)));
    const LAB_TREND_KEYS = Array.from(new Set([
      ...LAB_TREND_VITALS.flatMap(v => v.names),
      ...LAB_KEY_NUM_PATTERNS.map(([k]) => k), ...Object.keys(LAB_STANDARDS), ...Object.keys(LAB_TREND_ALIASES), ...LAB_TREND_EXTRA_KEYS
    ])).sort((a, b) => b.length - a.length);
    // 項目名の直後に数字（「Hb 11.8」「BT37.1」「血糖(随時) 246」「BP 138/80」）。英字の項目名の途中（HbA1c の Hb）には一致させない
    const LAB_TREND_ITEM_REGEX = new RegExp(`(?:^|(?<=[、,。\\s]))(${LAB_TREND_KEYS.map(escapeRegExp).join('|')})(?![A-Za-z])(\\s*[(（][^)）]{1,12}[)）])?\\s*[:：=]?\\s*(\\d[\\d,]*(?:\\.\\d+)?(?:\\s*\\/\\s*\\d{1,3})?)`, 'gi');

    function labTrendCanonicalKey(name, qualifier) {
      // 「P(リン)」は脈拍ではなくリン
      if (/^P$/i.test(name) && /リン/.test(qualifier || '')) return { key: 'P(リン)', vital: null };
      const vital = LAB_TREND_VITAL_BY_NAME.get(String(name).toLowerCase());
      if (vital) return { key: vital.key, vital };
      const base = LAB_TREND_ALIASES[name] || LAB_TREND_ALIASES[String(name).toUpperCase()] || name;
      const q = (qualifier || '').replace(/[()（）\s]/g, '');
      return { key: q ? `${base}(${q})` : base, vital: null };
    }
    // 「4,000〜9,000」「0.3以下」「18.4pg/mL以下」「3.6-4.8」から下限・上限を読む
    function parseLabReferenceRange(ref) {
      const t = String(ref || '').replace(/,/g, '');
      let m = t.match(/(\d+(?:\.\d+)?)\s*[^\d〜～~\-－]*\s*[〜～~\-－]\s*(\d+(?:\.\d+)?)/);
      if (m) return { low: Number(m[1]), high: Number(m[2]) };
      // 「<0.2」「≦0.3」「>60」のような記号の書き方
      m = t.match(/^\s*([<＜≦≤]|<=)\s*(\d+(?:\.\d+)?)/);
      if (m) return { low: null, high: Number(m[2]), highExclusive: m[1] === '<' || m[1] === '＜' };
      m = t.match(/^\s*([>＞≧≥]|>=)\s*(\d+(?:\.\d+)?)/);
      if (m) return { low: Number(m[2]), high: null, lowExclusive: m[1] === '>' || m[1] === '＞' };
      m = t.match(/(\d+(?:\.\d+)?)[^\d]*(以下|未満)/);
      if (m) return { low: null, high: Number(m[1]), highExclusive: m[2] === '未満' };
      m = t.match(/(\d+(?:\.\d+)?)[^\d]*(以上|超)/);
      if (m) return { low: Number(m[1]), high: null, lowExclusive: m[2] === '超' };
      return null;
    }
    // 1枚のカードの文章から、項目ごとの値を読み取る。文の途中の値（「…に上昇」）が混ざるカードは読まない（null）
    function parseLabTrendEntries(text) {
      let t = String(text || '').normalize('NFKC').trim()
        // 「【検査】CK 1850 U/L…」「【バイタルサイン】BT…」のような括弧の見出しは外して読む（実習生の記録のテスト：心筋梗塞）
        .replace(/^【[^】]{1,12}】\s*/, '')
        // 「食前血糖 186mg/dL」「空腹時血糖 130」は「血糖(食前)」として読む（実習生の記録のテスト：1型糖尿病）
        .replace(/^(朝食前|昼食前|夕食前|食前|食後\s*\d*\s*時間?|空腹時|早朝空腹時|随時|眠前|就寝前)\s*(血糖値?)/, (x, q, k) => `${k}(${q.replace(/\s+/g, '')})`);
      // 「検温: 体温36.6度、…」「体格: 身長 165cm …」のような前置きの見出しは外して読む
      const lead = t.match(/^([^:：、。「」\d]{1,10})[:：]\s*/);
      // 「透析前：」「歩行後：」のような時期の見出しは、値の注記として残す（同じ日の前と後の値を見分けられるように）
      let phaseNote = '';
      if (lead) {
        LAB_TREND_ITEM_REGEX.lastIndex = 0;
        const after = t.slice(lead[0].length);
        const first = LAB_TREND_ITEM_REGEX.exec(after);
        if (first && first.index === 0) t = after;
        else if (/(?:前|後|中)$/.test(lead[1].trim()) && !/^(?:入院|術|手術)/.test(lead[1].trim())) {
          // 「透析前：体重 62.4kg、BP …」：見出しの後ろの最初の項目から読む（見出しと項目の間の言葉は、値の注記として扱わない）
          LAB_TREND_ITEM_REGEX.lastIndex = 0;
          const firstAny = LAB_TREND_ITEM_REGEX.exec(after);
          if (firstAny) { t = after.slice(firstAny.index); phaseNote = lead[1].trim(); }
        }
        if (!phaseNote && t === after && /(?:前|後|中)$/.test(lead[1].trim()) && !/^(?:入院|術|手術)/.test(lead[1].trim())) phaseNote = lead[1].trim();
      }
      const matches = [];
      LAB_TREND_ITEM_REGEX.lastIndex = 0;
      let m;
      while ((m = LAB_TREND_ITEM_REGEX.exec(t)) !== null) matches.push(m);
      if (!matches.length || matches[0].index !== 0) return null;
      const entries = [];
      for (let i = 0; i < matches.length; i++) {
        const mm = matches[i];
        const end = i + 1 < matches.length ? matches[i + 1].index : t.length;
        let rest = t.slice(mm.index + mm[0].length, end);
        const refM = rest.match(/[(（]\s*基準値?\s*[:：]?\s*([^)）]*)[)）]/);
        const ref = refM ? refM[1].trim() : '';
        if (refM) rest = rest.replace(refM[0], ' ');
        const unitM = rest.match(/^\s*([^\s(（↑↓、,。]*)/);
        let unit = unitM ? unitM[1] : '';
        // 「体重 1か月で2.0kg減少」の「1」は期間（1か月）で、体重の値ではない（検査値の推移に「体重 1」と出ていた）
        if (/^(?:か月|ヶ月|ヵ月|カ月|ケ月|週|日間|日で|年|時間)/.test(unit)) return null;
        rest = rest.slice(unitM ? unitM[0].length : 0);
        let flag = '';
        // かっこの注記の中（「(10/5 最大 4200 U/L)」の U/L の L）は、低い値の印「L」と読まない（実習生の記録のテスト：心筋梗塞）
        const flagText = rest.replace(/[(（][^)）]*[)）]/g, ' ');
        if (/↑|(?<![\/A-Za-z])H(?![A-Za-z])/.test(flagText)) flag = 'high';
        else if (/↓|(?<![\/A-Za-z])L(?![A-Za-z])/.test(flagText)) flag = 'low';
        const notes = [];
        rest = rest.replace(/[(（]([^)）]{1,40})[)）]/g, (x, inner) => { notes.push(inner.trim()); return ' '; });
        rest = rest.replace(/[↑↓]|(?<![\/A-Za-z])[HL](?![A-Za-z])/g, ' ');
        const leftover = rest.replace(/[、,。\s]/g, '');
        if (leftover && !/^(?:不?整(?:あり|なし)?|あり|なし)$/.test(leftover)) return null; // 文の途中の値
        if (leftover) notes.push(leftover);
        // 単位が「度」「回」だけのものは表記をそろえる
        if (unit === '度' || unit === '℃') unit = '°C';
        let { key, vital } = labTrendCanonicalKey(mm[1], mm[2]);
        // 【レビューで発見】「P 3.5 mg/dL (基準値: 2.5〜4.5)」のリン（無機リン）が脈拍（P）の行に入り、その基準値で
        // 脈拍 72・88 に「↑」が付いていた。単位が mg/dL のとき・値が20未満（脈拍としてありえない）のときはリンとして扱う。
        if (vital && vital.key === '脈拍' && /^P$/i.test(mm[1]) && (/mg\/?d?l/i.test(unit) || Number(String(mm[3]).replace(/,/g, '')) < 20)) {
          key = 'P(リン)'; vital = null;
        }
        entries.push({ key, name: mm[1], value: mm[3].replace(/\s+/g, ''), unit, ref, flag, note: [phaseNote, ...notes].filter(Boolean).join(' '), vital });
      }
      return entries;
    }
    // childGuide：子どもの記録のときの年齢の区分の目安（js/03 の CHILD_VITAL_GUIDES）。脈拍・呼吸数は子どもの目安で判定し、
    // 血圧は年齢で目安が大きく違うので判定しない（大人の目安で「高い・低い」を付けない）
    function labTrendFlag(entry, refRange, childGuide = null) {
      if (entry.flag) return entry.flag;
      const v = entry.vital;
      if (v && v.body) return '';
      if (v && v.bp && childGuide) return '';
      if (v && childGuide && !refRange && (v.key === '脈拍' || v.key === '呼吸数')) {
        const [low, high] = v.key === '脈拍' ? childGuide.pulse : childGuide.resp;
        return labTrendFlag({ ...entry, vital: { ...v, low, high } }, null, null);
      }
      if (v && v.bp) {
        const bp = entry.value.match(/(\d+)\s*\/\s*(\d+)/);
        if (!bp) return '';
        const sys = Number(bp[1]), dia = Number(bp[2]);
        if (sys >= 140 || dia >= 90) return 'high';
        if (sys < 90) return 'low';
        return '';
      }
      const num = Number(String(entry.value).replace(/,/g, ''));
      if (!Number.isFinite(num)) return '';
      const range = refRange || (v ? { low: v.low ?? null, high: v.high ?? null } : null);
      if (!range) return '';
      // 体温は「37.5以上」を高いとする（目安の37.5未満に合わせる）。ほかは上限を超えたら高い
      const overHigh = v && v.key === '体温' ? num >= range.high : num > range.high;
      if (range.high !== null && range.high !== undefined && overHigh) return 'high';
      if (range.low !== null && range.low !== undefined && num < range.low) return 'low';
      return '';
    }
    function labTrendGroupOf(key) {
      const vital = LAB_TREND_VITALS.find(v => v.key === key);
      if (vital) return vital.body ? '身体計測' : 'バイタルサイン';
      const hit = LAB_GROUP_DEFS.find(([, re]) => re.test(key));
      return hit ? hit[0] : 'その他の検査';
    }
    const LAB_TREND_GROUP_ORDER = ['バイタルサイン', '身体計測', ...LAB_GROUP_DEFS.map(([n]) => n), 'その他の検査'];
    // カードの一覧から表を作る。columns：日時（日ごと・時刻順）、rows：項目（グループ順）、cells：rows[r].cells[columnKey] = [{value, flag, note, itemId}]
    function buildLabTrendTable(items, options = {}) {
      const includeVitals = options.includeVitals !== false;
      // 「児：」の付いたカード（母性の記録の新生児の値）は、受け持ちの患者（母親）の表に入れない
      const expanded = expandCombinedLabItems((items || []).filter(i => i && i.type !== 'unnecessary' && !/^(?:児|新生児)\s*[:：]/.test(String(i.text || '').normalize('NFKC'))));
      const parsed = [];
      expanded.forEach(item => {
        const entries = parseLabTrendEntries(item.text);
        if (!entries) return;
        const usable = entries.filter(e => includeVitals || !e.vital);
        if (usable.length) parsed.push({ item, entries: usable });
      });
      // 日時の列：日ごとにまとめて日の順に並べ、同じ日の中は時刻の順（時刻の無いものは先）
      const dayGroups = groupItemsByDay(parsed.map(p => ({ timestamp: p.item.timestamp, _p: p })));
      const columns = [];
      const columnIndex = new Map();
      dayGroups.forEach(g => {
        const stamps = [];
        g.items.forEach(x => { const ts = (x.timestamp || '').trim() || '日時不明'; if (!stamps.includes(ts)) stamps.push(ts); });
        const clockMin = ts => { const c = timestampClockPart(ts); if (!c) return -1; const [h, mi] = c.split(':').map(Number); return h * 60 + mi; };
        stamps.map((ts, i) => ({ ts, i })).sort((a, b) => (clockMin(a.ts) - clockMin(b.ts)) || (a.i - b.i)).forEach(({ ts }) => {
          if (columnIndex.has(ts)) return;
          columnIndex.set(ts, columns.length);
          columns.push({ key: ts, day: g.day || (ts === '日時不明' ? '日時不明' : ''), time: timestampClockPart(ts) });
        });
      });
      const rowsByKey = new Map();
      parsed.forEach(({ item, entries }) => {
        const col = (item.timestamp || '').trim() || '日時不明';
        entries.forEach(e => {
          if (!rowsByKey.has(e.key)) rowsByKey.set(e.key, { key: e.key, group: labTrendGroupOf(e.key), units: new Map(), ref: '', vital: e.vital, cells: {} });
          const row = rowsByKey.get(e.key);
          if (e.unit) row.units.set(e.unit, (row.units.get(e.unit) || 0) + 1);
          if (!row.ref && e.ref) { row.ref = e.ref; row.refEntryUnit = e.unit || ''; }
          (row.cells[col] = row.cells[col] || []).push({ value: e.value, unit: e.unit, flag: '', note: e.note, itemId: item.id || null, text: item.text, _e: e });
        });
      });
      // 子どもの記録なら、脈拍・呼吸数は年齢の区分の目安で判定する（実習生の記録のテスト：乳児の脈拍140が「高い」になっていた）
      const ageGroup = options.ageGroup !== undefined ? options.ageGroup
        : detectAgeGroupFromText([options.sourceText || '', ...(items || []).slice(0, 40).map(i => (i && i.text) || '')].join('\n'));
      const childGuide = ageGroup ? CHILD_VITAL_GUIDES[ageGroup] : null;
      const vitalRefText = key => {
        if (!childGuide) return LAB_TREND_VITAL_REF_TEXT[key] || '';
        if (key === '脈拍') return `${childGuide.pulse[0]}〜${childGuide.pulse[1]}（${childGuide.label}）`;
        if (key === '呼吸数') return `${childGuide.resp[0]}〜${childGuide.resp[1]}（${childGuide.label}）`;
        if (key === '血圧') return `（${childGuide.label}は判定しません）`;
        return LAB_TREND_VITAL_REF_TEXT[key] || '';
      };
      const rows = Array.from(rowsByKey.values()).map(row => {
        const unit = Array.from(row.units.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || (row.vital ? row.vital.unit : '');
        const range = parseLabReferenceRange(row.ref);
        // 【レビューで発見】以前は行の最初の基準値だけで、その行のすべての値を判定していた。そのため
        // 「WBC 8100 /μL (基準値: 3300〜8600)」と「WBC 12.5 ×10^3/μL」が同じ行にあると、12.5 を 3300 と比べて「↓」にしていた。
        // 値ごとに、①その値のカードに書かれた基準値、②無ければ行の基準値、の順に使い、値と基準値の単位が違えば換算する。
        // 換算できない単位どうしは判定しない（印を付けない）。
        const rowRefUnit = refUnitOf(row.ref) || row.refEntryUnit || '';
        Object.values(row.cells).forEach(list => list.forEach(c => {
          const e = c._e;
          const ownRange = e.ref ? parseLabReferenceRange(e.ref) : null;
          const useRange = ownRange || range;
          const refUnit = ownRange ? (refUnitOf(e.ref) || e.unit || '') : rowRefUnit;
          let entry = e;
          if (useRange && !e.flag && !e.vital && e.unit && refUnit && !sameLabUnit(e.unit, refUnit)) {
            const ratio = labUnitRatio(e.unit, refUnit);
            const num = Number(String(e.value).replace(/,/g, ''));
            if (!ratio || !Number.isFinite(num)) { c.flag = ''; delete c._e; return; }
            entry = { ...e, value: String(num * ratio) };
          }
          c.flag = labTrendFlag(entry, useRange, childGuide);
          delete c._e;
        }));
        return { key: row.key, group: row.group, unit, ref: row.ref || (row.vital ? vitalRefText(row.key) : ''), refIsGuide: !row.ref && !!row.vital, cells: row.cells };
      });
      const vitalOrder = k => LAB_TREND_VITALS.findIndex(v => v.key === k);
      rows.sort((a, b) => (LAB_TREND_GROUP_ORDER.indexOf(a.group) - LAB_TREND_GROUP_ORDER.indexOf(b.group)) ||
        (a.group === 'バイタルサイン' || a.group === '身体計測' ? vitalOrder(a.key) - vitalOrder(b.key) : 0));
      // 値の無い列（バイタルを隠したときなど）は出さない
      const used = columns.filter(c => rows.some(r => r.cells[c.key]));
      return { columns: used, rows };
    }
    const LAB_TREND_VITAL_REF_TEXT = { '体温': '37.5未満', '脈拍': '60〜100', '血圧': '上90〜139・下90未満', '呼吸数': '12〜20', 'SpO2': '95以上' };

    // 【カードの検査値の色分け】利用者からの要望：「検査値の推移の色分けがよかったので、分類ボードのカードにも」。
    // 検査値の推移の表と同じ判定（同じ項目の基準値・バイタルの目安）で、カードの文章の中の値に
    // 高い値＝赤（↑）・低い値＝青（↓）の色を付ける。表と判定をそろえるため、表を作る処理（buildLabTrendTable）の結果を使う。
    let cardLabFlagCache = null;
    function resetCardLabFlags() { cardLabFlagCache = null; }
    function cardLabFlagsFor(itemId) {
      if (!cardLabFlagCache) {
        cardLabFlagCache = new Map();
        try {
          const cp = getCurrentPatient();
          const table = buildLabTrendTable((cp && cp.items) || [], { includeVitals: true, sourceText: (cp && cp.sourceText) || '' });
          table.rows.forEach(r => Object.values(r.cells).forEach(list => list.forEach(c => {
            if (!c.itemId || !c.flag) return;
            if (!cardLabFlagCache.has(c.itemId)) cardLabFlagCache.set(c.itemId, []);
            cardLabFlagCache.get(c.itemId).push({ value: c.value, flag: c.flag, key: r.key });
          })));
        } catch (e) { /* 色分けできなくてもカードはそのまま表示する */ }
      }
      return cardLabFlagCache.get(itemId) || [];
    }
    // カードの文章を、検査値の色分けを付けたHTMLにする（色の付く値が無ければ、ふつうに文字を安全な形にするだけ）
    function cardTextWithLabFlagsHtml(item) {
      const text = String((item && item.text) || '');
      const flags = item && item.id ? cardLabFlagsFor(item.id) : [];
      if (!flags.length) return escapeHtml(text);
      // 値の位置を先に探し（同じ値が2回あれば順に別の場所を使う）、文章の順に並べてから色を付ける
      const hits = [];
      flags.forEach(f => {
        const pattern = String(f.value).split('/').map(escapeRegExp).join('\\s*\\/\\s*');
        const re = new RegExp(`(?<![\\d.,])${pattern}(?![\\d])`, 'g');
        let m;
        while ((m = re.exec(text)) !== null) {
          const start = m.index, end = m.index + m[0].length;
          if (hits.some(h => start < h.end && end > h.start)) continue;
          hits.push({ start, end, f });
          break;
        }
      });
      hits.sort((a, b) => a.start - b.start);
      let html = '', pos = 0;
      hits.forEach(({ start, end, f }) => {
        const hasArrow = /^\s*[^\s\d(（、,。↑↓]{0,12}\s*[↑↓]/.test(text.slice(end));
        const label = f.flag === 'high' ? '基準より高い値' : '基準より低い値';
        html += escapeHtml(text.slice(pos, start)) +
          `<span class="lt-val lt-${f.flag} card-lab-flag" title="${escapeHtml(f.key)}：${label}（検査値の推移と同じ判定）">${escapeHtml(text.slice(start, end))}${hasArrow ? '' : `<span class="lt-arrow">${f.flag === 'high' ? '↑' : '↓'}</span>`}</span>`;
        pos = end;
      });
      return html + escapeHtml(text.slice(pos));
    }

    // 表をExcelなどに貼れる形（タブ区切り）にする
    function labTrendTableToTsv(table) {
      const head = ['項目', '単位', '基準値', ...table.columns.map(c => [c.day, c.time].filter(Boolean).join(' ') || '日時不明')];
      const lines = [head.join('\t')];
      table.rows.forEach(r => lines.push([r.key, r.unit, r.ref, ...table.columns.map(c => (r.cells[c.key] || [])
        .map(x => `${x.value}${x.flag === 'high' ? '↑' : x.flag === 'low' ? '↓' : ''}${x.note ? `(${x.note})` : ''}`).join(' / '))].join('\t')));
      return lines.join('\n');
    }

    let labTrendIncludeVitals = true;
    try { labTrendIncludeVitals = localStorage.getItem('nursing_lab_trend_vitals') !== 'off'; } catch (e) { /* 保存できなくても動作には影響しない */ }
    function renderLabTrend() {
      const wrap = document.getElementById('lab-trend-table-wrap');
      if (!wrap) return;
      const cp = getCurrentPatient();
      const table = buildLabTrendTable(cp.items || [], { includeVitals: labTrendIncludeVitals, sourceText: cp.sourceText || '' });
      const toggle = document.getElementById('lab-trend-show-vitals');
      if (toggle) toggle.checked = labTrendIncludeVitals;
      window.__labTrendLast = table;
      renderClinicalIndices();
      if (!table.rows.length) {
        wrap.innerHTML = `<div class="lab-trend-empty"><i class="fa-solid fa-flask-vial"></i><p>検査値${labTrendIncludeVitals ? 'やバイタルサイン' : ''}のカードがありません。</p><p>分類ボードで記録を「分類開始」すると、ここに日付ごとの表ができます。</p></div>`;
        return;
      }
      // 見出し1段目：日（同じ日の列はまとめる）、2段目：時刻
      const dayCells = [];
      table.columns.forEach(c => {
        const last = dayCells[dayCells.length - 1];
        if (last && last.day === c.day) last.span++;
        else dayCells.push({ day: c.day, span: 1 });
      });
      const hasTimes = table.columns.some(c => c.time);
      let html = '<table class="lab-trend-table"><thead><tr><th class="lt-item" rowspan="' + (hasTimes ? 2 : 1) + '">項目</th>';
      html += dayCells.map(d => `<th class="lt-day" colspan="${d.span}">${escapeHtml(d.day || '日時不明')}</th>`).join('') + '</tr>';
      if (hasTimes) html += '<tr>' + table.columns.map(c => `<th class="lt-time">${escapeHtml(c.time || '—')}</th>`).join('') + '</tr>';
      html += '</thead><tbody>';
      let group = null;
      table.rows.forEach(r => {
        if (r.group !== group) {
          group = r.group;
          html += `<tr class="lt-group"><th colspan="${table.columns.length + 1}">${escapeHtml(group)}</th></tr>`;
        }
        html += `<tr><th class="lt-item"><span class="lt-name">${escapeHtml(r.key)}</span>${r.unit ? `<span class="lt-unit">${escapeHtml(r.unit)}</span>` : ''}${r.ref ? `<span class="lt-ref">${r.refIsGuide ? '目安 ' : '基準 '}${escapeHtml(r.ref)}</span>` : ''}</th>`;
        html += table.columns.map(c => {
          const list = r.cells[c.key];
          if (!list) return '<td class="lt-empty"></td>';
          return `<td>${list.map(x => `<button type="button" class="lt-val ${x.flag ? 'lt-' + x.flag : ''}" ${x.itemId ? `onclick="jumpToBoardCard('${safeDomId(x.itemId)}')"` : ''} title="${escapeHtml(x.text || '')}${x.itemId ? '（クリックで分類ボードのカードへ）' : ''}">${escapeHtml(x.value)}${x.unit && x.unit !== r.unit ? `<small>${escapeHtml(x.unit)}</small>` : ''}${x.flag === 'high' ? '<span class="lt-arrow">↑</span>' : x.flag === 'low' ? '<span class="lt-arrow">↓</span>' : ''}${x.note ? `<span class="lt-note">${escapeHtml(x.note)}</span>` : ''}</button>`).join('')}</td>`;
        }).join('') + '</tr>';
      });
      html += '</tbody></table>';
      wrap.innerHTML = html;
    }
    window.renderLabTrend = renderLabTrend;
    window.toggleLabTrendVitals = function(on) {
      labTrendIncludeVitals = !!on;
      try { localStorage.setItem('nursing_lab_trend_vitals', on ? 'on' : 'off'); } catch (e) { /* 保存できなくても動作には影響しない */ }
      renderLabTrend();
    };
    window.copyLabTrendTable = async function() {
      const table = window.__labTrendLast;
      if (!table || !table.rows.length) return showToast('表にする検査値がありません', 'warn');
      try {
        await navigator.clipboard.writeText(labTrendTableToTsv(table));
        showToast('表をコピーしました。Excelやスプレッドシートにそのまま貼り付けられます', 'success');
      } catch (e) {
        showToast(['表をコピーできませんでした', { text: 'ブラウザがクリップボードへの書き込みを許可していない可能性があります。表を選んで Ctrl+C でコピーしてください。', detail: true }], 'error');
      }
    };

    // ==========================================================================
    // 【記録から自動で計算する指標】利用者からの要望：「BMIやブリンクマン指数を自動で算出したい。似たもので
    // おすすめがあれば追加してほしい」。記録の文章（身長・体重・年齢・性別・喫煙・飲酒）と検査値（Cre）から、
    // BMI・標準体重・体重の変化・ブリンクマン指数・パックイヤー・純アルコール量・eGFR・基礎エネルギー消費量を計算する。
    // 値の読み取りに使った記録の部分も一緒に表示し、どこから計算したか確かめられるようにする。
    // ==========================================================================
    const INDEX_FAMILY_WORD_REGEX = /(?:妻|夫|長男|長女|次男|次女|三男|三女|息子|娘|嫁|婿|母|父|祖母|祖父|兄|姉|弟|妹|孫|姪|甥|家族|キーパーソン)/;
    function firstPatientMatch(t, re) {
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      let m;
      while ((m = g.exec(t)) !== null) {
        const before = t.slice(Math.max(0, m.index - 10), m.index);
        const lineStart = t.lastIndexOf('\n', m.index) + 1;
        if (!INDEX_FAMILY_WORD_REGEX.test(before) && !/家族構成|家族関係|家族歴/.test(t.slice(lineStart, m.index))) return m;
      }
      return null;
    }
    const round1 = v => Math.round(v * 10) / 10;
    function extractClinicalBasics(text) {
      const t = String(text || '').normalize('NFKC');
      const ageM = firstPatientMatch(t, /(\d{1,3})\s*歳(?!\s*(?:から|より|で|頃|ごろ|の時|時))/);
      const sexM = firstPatientMatch(t, /(男性|女性|男児|女児)/);
      const heightM = t.match(/身長\s*[:：は]?\s*(\d{2,3}(?:\.\d+)?)\s*cm/i);
      const weights = [];
      const wRe = /体重\s*[:：は]?\s*(\d{1,3}(?:\.\d+)?)\s*kg/gi;
      let m;
      while ((m = wRe.exec(t)) !== null) weights.push({ value: Number(m[1]), src: t.slice(m.index, Math.min(t.length, m.index + m[0].length + 12)).split('\n')[0] });
      const usualM = t.match(/(?:普段|通常|平常時?|元々|もともと|以前|病前|健常時|半年前|\d{1,2}\s*(?:か月|ヶ月|カ月|ケ月|年)前)(?:は|の体重は?|体重は?)?\s*(\d{1,3}(?:\.\d+)?)\s*kg/);
      // 乳児・新生児（「生後5か月」「日齢14」）は0歳として扱う（大人の BMI ではなくカウプ指数で見るため）
      const infantAge = !ageM && /生後\s*\d+\s*(?:か月|ヶ月|カ月|ケ月|日)|日齢\s*\d+|修正\s*\d+\s*週/.test(t) ? 0 : null;
      return {
        age: ageM ? Number(ageM[1]) : infantAge,
        sex: sexM ? (/男/.test(sexM[1]) ? 'male' : 'female') : null,
        height: heightM ? Number(heightM[1]) : null,
        weight: weights.length ? weights[0].value : null,
        weights,
        usualWeight: usualM ? Number(usualM[1]) : null,
        heightSrc: heightM ? heightM[0] : '',
        usualSrc: usualM ? usualM[0] : '',
        usualLabel: usualM ? (usualM[0].match(/半年前|\d{1,2}\s*(?:か月|ヶ月|カ月|ケ月|年)前/) || ['普段'])[0].replace(/\s+/g, '') : ''
      };
    }
    // 喫煙：「20本/日×40年」「1日20本を40年」「40年間、1日20本」「20歳から喫煙(20本/日)…10年前に禁煙」
    function extractSmoking(text, age) {
      const t = String(text || '').normalize('NFKC');
      let m;
      if ((m = t.match(/(\d{1,3})\s*本\s*[\/／]\s*日\s*[×xX✕*]\s*(\d{1,2})\s*年/))) return { perDay: Number(m[1]), years: Number(m[2]), src: m[0] };
      if ((m = t.match(/1日\s*(\d{1,3})\s*本\s*(?:を|、|程度|くらい|ぐらい)?\s*(\d{1,2})\s*年/))) return { perDay: Number(m[1]), years: Number(m[2]), src: m[0] };
      if ((m = t.match(/(\d{1,2})\s*年間?\s*[、,]?\s*1日\s*(\d{1,3})\s*本/))) return { perDay: Number(m[2]), years: Number(m[1]), src: m[0] };
      const perM = t.match(/(\d{1,3})\s*本\s*[\/／]\s*日|1日\s*(\d{1,3})\s*本/);
      const startM = t.match(/(\d{1,2})\s*歳(?:から|より)[^。\n]{0,15}?(?:喫煙|たばこ|タバコ|煙草)/) || t.match(/(?:喫煙|たばこ|タバコ|煙草)[^。\n]{0,10}?(\d{1,2})\s*歳(?:から|より)/);
      if (perM && startM) {
        const perDay = Number(perM[1] || perM[2]);
        const start = Number(startM[1]);
        const quitAgeM = t.match(/(\d{1,3})\s*歳で?禁煙/);
        const quitAgoM = t.match(/(\d{1,2})\s*年前(?:に|から)?禁煙/);
        let end = null;
        if (quitAgeM) end = Number(quitAgeM[1]);
        else if (quitAgoM && age) end = age - Number(quitAgoM[1]);
        else if (age && !/禁煙/.test(t)) end = age;
        if (end === null && !age && /禁煙/.test(t) && quitAgoM) return { partial: true, perDay, start };
        if (end !== null && end > start) return { perDay, years: end - start, src: `${startM[0]}…${perM[0]}${quitAgeM ? `…${quitAgeM[0]}` : quitAgoM ? `…${quitAgoM[0]}` : ''}` };
      }
      return null;
    }
    // 飲酒：「ビール350ml/日」「日本酒2合」「焼酎100ml」「ワイン200ml」→ 純アルコール量（g）＝量(mL)×度数×0.8
    const ALCOHOL_DRINKS = [
      { name: 'ビール', re: /ビール\s*(\d{2,4})\s*(?:ml|mL|ミリリットル)/i, abv: 0.05 },
      { name: '発泡酒', re: /発泡酒\s*(\d{2,4})\s*(?:ml|mL)/i, abv: 0.05 },
      { name: 'チューハイ', re: /(?:チューハイ|酎ハイ)\s*(\d{2,4})\s*(?:ml|mL)/i, abv: 0.07 },
      { name: 'ワイン', re: /ワイン\s*(\d{2,4})\s*(?:ml|mL)/i, abv: 0.12 },
      { name: '焼酎', re: /焼酎\s*(\d{2,4})\s*(?:ml|mL)/i, abv: 0.25 },
      { name: '日本酒', re: /日本酒\s*(\d+(?:\.\d+)?)\s*合/, abv: 0.15, perUnitMl: 180 },
      { name: 'ウイスキー', re: /ウイスキー\s*(\d{2,4})\s*(?:ml|mL)/i, abv: 0.4 }
    ];
    function extractAlcohol(text) {
      const t = String(text || '').normalize('NFKC');
      for (const d of ALCOHOL_DRINKS) {
        const m = t.match(d.re);
        if (!m) continue;
        const ml = Number(m[1]) * (d.perUnitMl || 1);
        const after = t.slice(m.index, m.index + m[0].length + 8);
        const freq = /[\/／]\s*日|毎日|1日/.test(after) ? '1日あたり' : ((after.match(/週\s*\d+\s*回/) || [])[0] || '1回あたり');
        return { name: d.name, ml, grams: round1(ml * d.abv * 0.8), abv: d.abv, freq, src: m[0] + (after.slice(m[0].length).match(/^\s*[\/／]\s*日/) || [''])[0] };
      }
      return null;
    }
    function latestLabValue(table, key) {
      const row = table && table.rows.find(r => r.key === key);
      if (!row) return null;
      for (let i = table.columns.length - 1; i >= 0; i--) {
        const c = row.cells[table.columns[i].key];
        if (c && c.length) {
          const v = Number(String(c[c.length - 1].value).replace(/,/g, ''));
          if (Number.isFinite(v)) return { value: v, when: table.columns[i].key };
        }
      }
      return null;
    }
    function bmiCategory(bmi) {
      if (bmi < 18.5) return '低体重';
      if (bmi < 25) return '普通体重';
      if (bmi < 30) return '肥満（1度）';
      if (bmi < 35) return '肥満（2度）';
      if (bmi < 40) return '肥満（3度）';
      return '肥満（4度）';
    }
    function egfrStage(v) {
      if (v >= 90) return 'G1（正常または高値）';
      if (v >= 60) return 'G2（正常または軽度低下）';
      if (v >= 45) return 'G3a（軽度〜中等度低下）';
      if (v >= 30) return 'G3b（中等度〜高度低下）';
      if (v >= 15) return 'G4（高度低下）';
      return 'G5（末期腎不全）';
    }
    // 計算結果：{ key, name, value, unit, detail（計算に使った値）, note（判定・目安）, level（'warn'｜''）}
    function computeClinicalIndices(text, items) {
      const basics = extractClinicalBasics(text);
      const table = buildLabTrendTable(items || [], { includeVitals: true });
      const out = [];
      const missing = [];
      const { age, sex, height, weight } = basics;
      const h = height ? height / 100 : null;
      if (h && weight) {
        const bmi = round1(weight / (h * h)); // 表示と判定をそろえるため、小数第1位に丸めてから判定する
        if (age !== null && age < 6) {
          out.push({ key: 'kaup', name: 'カウプ指数', value: round1(bmi), unit: '', detail: `体重${weight}kg ÷ 身長${height}cm²（m）`, note: '乳幼児：15〜19が普通の目安', level: bmi < 15 || bmi > 19 ? 'warn' : '' });
        } else if (age !== null && age < 16) {
          const rohrer = weight / Math.pow(height, 3) * 1e7;
          out.push({ key: 'rohrer', name: 'ローレル指数', value: Math.round(rohrer), unit: '', detail: `体重${weight}kg ÷ 身長${height}cm³ × 10⁷`, note: '学童：115〜145が普通の目安', level: rohrer < 115 || rohrer > 145 ? 'warn' : '' });
        } else {
          out.push({ key: 'bmi', name: 'BMI', value: bmi.toFixed(1), unit: 'kg/m²', detail: `体重${weight}kg ÷（身長${height}cm）²`, note: `${bmiCategory(bmi)}（日本肥満学会の基準：18.5以上25未満が普通体重）`, level: bmi < 18.5 || bmi >= 25 ? 'warn' : '' });
          const ibw = 22 * h * h;
          const pct = weight / ibw * 100;
          out.push({ key: 'ibw', name: '標準体重（BMI 22）', value: round1(ibw), unit: 'kg', detail: `22 ×（身長${height}cm）²`, note: `今の体重は標準体重の${Math.round(pct)}%（%IBW）${pct < 80 ? '：80%未満は中等度以上の栄養障害の目安' : pct > 120 ? '：120%を超えている' : ''}`, level: pct < 80 || pct > 120 ? 'warn' : '' });
        }
      } else if (height || weight) missing.push({ name: age !== null && age < 6 ? 'カウプ指数' : age !== null && age < 16 ? 'ローレル指数' : 'BMI・標準体重', need: !height ? '身長' : '体重' });
      if (weight && basics.usualWeight && basics.usualWeight !== weight) {
        const diff = weight - basics.usualWeight;
        const pct = diff / basics.usualWeight * 100;
        out.push({ key: 'wchange', name: `${basics.usualLabel === '普段' ? '普段' : basics.usualLabel}からの体重の変化`, value: `${diff > 0 ? '+' : ''}${round1(diff)}`, unit: 'kg', detail: `${basics.usualLabel}${basics.usualWeight}kg → ${weight}kg`, note: `${pct > 0 ? '+' : ''}${round1(pct)}%${pct <= -5 ? '：5%以上の減少は栄養状態の悪化に注意（1か月5%・6か月10%以上が目安）' : pct >= 5 ? '：急な増加は体液の貯留（むくみ・心不全）にも注意' : ''}`, level: Math.abs(pct) >= 5 ? 'warn' : '' });
      }
      const wRow = table.rows.find(r => r.key === '体重');
      if (wRow) {
        const seq = table.columns.map(c => (wRow.cells[c.key] || [])[0]).filter(Boolean).map(x => Number(x.value)).filter(Number.isFinite);
        if (seq.length >= 2 && seq[0] !== seq[seq.length - 1]) {
          const d = seq[seq.length - 1] - seq[0];
          out.push({ key: 'wtrend', name: '記録の期間の体重の変化', value: `${d > 0 ? '+' : ''}${round1(d)}`, unit: 'kg', detail: `${seq[0]}kg → ${seq[seq.length - 1]}kg（${seq.length}回の測定）`, note: '検査値の推移の表の体重の行から計算', level: '' });
        }
      }
      const smoking = extractSmoking(text, age);
      if (smoking && smoking.partial) {
        missing.push({ name: 'ブリンクマン指数', need: `年齢（${smoking.start}歳から${smoking.perDay}本/日の喫煙年数を出すのに必要）` });
      } else if (smoking) {
        const bi = smoking.perDay * smoking.years;
        const py = smoking.perDay / 20 * smoking.years;
        out.push({ key: 'brinkman', name: 'ブリンクマン指数', value: bi, unit: '', detail: `${smoking.perDay}本/日 × ${smoking.years}年（記録：${smoking.src}）`, note: bi >= 400 ? '400以上：肺がん・COPDなどのリスクが高いとされる目安' : '400未満', level: bi >= 400 ? 'warn' : '' });
        out.push({ key: 'packyears', name: 'パックイヤー（箱・年）', value: round1(py), unit: '', detail: `${smoking.perDay}本 ÷ 20本 × ${smoking.years}年`, note: '1日1箱（20本）を1年吸って1パックイヤー', level: '' });
      } else if (/喫煙|タバコ|たばこ|煙草/.test(String(text || '')) && !/(?:喫煙(?:歴)?|タバコ|たばこ|煙草)\s*[:：]?\s*(?:なし|無し|無|吸わない)|非喫煙|吸わない|喫煙しない/.test(String(text || '').normalize('NFKC'))) {
        missing.push({ name: 'ブリンクマン指数', need: '1日の本数と喫煙した年数（例：20本/日×40年）' });
      }
      const alcohol = extractAlcohol(text);
      if (alcohol) {
        out.push({ key: 'alcohol', name: '純アルコール量', value: alcohol.grams, unit: `g（${alcohol.freq}）`, detail: `${alcohol.name} ${alcohol.ml}mL × ${Math.round(alcohol.abv * 100)}% × 0.8（記録：${alcohol.src}）`, note: '節度ある適度な飲酒は1日平均 約20gまで（厚生労働省）', level: alcohol.freq === '1日あたり' && alcohol.grams > 20 ? 'warn' : '' });
      }
      const cre = latestLabValue(table, 'Cre');
      if (cre && age !== null && age >= 18 && sex) {
        const egfr = 194 * Math.pow(cre.value, -1.094) * Math.pow(age, -0.287) * (sex === 'female' ? 0.739 : 1);
        out.push({ key: 'egfr', name: 'eGFR（推算糸球体ろ過量）', value: round1(egfr), unit: 'mL/分/1.73m²', detail: `Cre ${cre.value}mg/dL（${cre.when}）・${age}歳・${sex === 'female' ? '女性' : '男性'}（日本人の推算式）`, note: `${egfrStage(egfr)}。高齢者・筋肉量の少ない人では高めに出ることがある`, level: egfr < 60 ? 'warn' : '' });
      } else if (cre) missing.push({ name: 'eGFR', need: age === null ? '年齢' : !sex ? '性別' : '18歳以上であること' });
      if (h && weight && age !== null && age >= 18 && sex) {
        const bee = sex === 'male' ? 66.47 + 13.75 * weight + 5.0 * height - 6.76 * age : 655.1 + 9.56 * weight + 1.85 * height - 4.68 * age;
        out.push({ key: 'bee', name: '基礎エネルギー消費量（Harris-Benedict式）', value: Math.round(bee), unit: 'kcal/日', detail: `${sex === 'female' ? '女性' : '男性'}・${age}歳・身長${height}cm・体重${weight}kg`, note: '必要エネルギー量 ＝ 基礎エネルギー消費量 × 活動係数 × ストレス係数（病状に合わせて係数を選ぶ）', level: '' });
      }
      return { basics, indices: out, missing };
    }
    function renderClinicalIndices() {
      const box = document.getElementById('clinical-indices');
      if (!box) return;
      const cp = getCurrentPatient();
      const text = (DOM.sourceText.value || cp.sourceText || (cp.items || []).map(i => i.text).join('\n'));
      const { indices, missing } = computeClinicalIndices(text, cp.items || []);
      if (!indices.length && !missing.length) { box.innerHTML = ''; box.classList.add('hidden'); return; }
      box.classList.remove('hidden');
      box.innerHTML = `<div class="ci-head"><i class="fa-solid fa-calculator"></i> 記録から自動で計算した指標</div>
        <div class="ci-grid">${indices.map(x => `<div class="ci-card ${x.level ? 'ci-warn' : ''}">
          <div class="ci-name">${escapeHtml(x.name)}</div>
          <div class="ci-value">${escapeHtml(String(x.value))}<span class="ci-unit">${escapeHtml(x.unit || '')}</span></div>
          <div class="ci-note">${escapeHtml(x.note || '')}</div>
          <div class="ci-detail">${escapeHtml(x.detail || '')}</div>
        </div>`).join('')}</div>
        ${missing.length ? `<p class="ci-missing"><i class="fa-solid fa-circle-info"></i> 計算できなかった指標：${missing.map(m => `${escapeHtml(m.name)}（${escapeHtml(m.need)}が記録に見つかりません）`).join('、')}</p>` : ''}
        <p class="ci-caution">記録の文章から自動で読み取って計算しています。読み取りが正しいか、計算に使った値（各欄の下）を確かめてから使ってください。</p>`;
    }
    window.renderClinicalIndices = renderClinicalIndices;

    // ==========================================================================
    // 検査値の確認（原文を残す → OCRの疑いを調べる → 基準値と比べる → 推移 → 考察・予測）
    // 【利用者の要望】
    //  ・原文は絶対に書き換えない。崩れていそうな値は「要確認」とし、別に「〜ではないかと予想されます」と予想を出す
    //    （原文・正規化した値・予想・確度・理由を分けて持つ。予想は事実のように書かない。確度が中以上のときだけ具体的な値を出す）
    //  ・基準値は「原文にあった基準値」と「アプリ内蔵の一般的な基準値」を混ぜない（内蔵のものは一般的な目安と明記）
    //  ・呼吸機能・バイタルサインも基準で見る。考察は、直接の所見＋もっともらしい関係＋反対の証拠が無いときだけ「〜ではないかと考えられる」と書く
    //  ・読み取れない値（原文不明瞭）はヘンダーソンの分類に入れない（isLabTextUnreliable）
    // 内部の状態：valid（確認済み）／suspicious（要確認）／corrupted（原文不明瞭）／insufficient_context（判定不可）
    // ==========================================================================
    const LAB_VAL_KEY_REGEX_SOURCE = LAB_FIND_KEYS.map(escapeRegExp).join('|');
    const LAB_VAL_START_REGEX = new RegExp(`^(?:【[^】]{0,12}】\\s*)?(${LAB_VAL_KEY_REGEX_SOURCE})(?![A-Za-z])\\s*(?:[(（{][^)）}]{0,16}[)）}])?\\s*[:：=]?\\s*([-+]?\\d[\\d,]*(?:\\.\\d+)?)\\s*([^\\s(（↑↓]*)\\s*([↑↓])?(.*)$`);
    const LAB_VAL_CHANGE_EXEMPT = ['CRP', 'BNP', 'Dダイマー'];
    const LAB_VAL_RELATED_NEEDS = { Hb: '1.呼吸（酸素の運搬）・4.姿勢（活動時のふらつき）', Ht: '1.呼吸（酸素の運搬）・4.姿勢', RBC: '1.呼吸（酸素の運搬）・4.姿勢', Alb: '2.食事（栄養状態）', TP: '2.食事（栄養状態）',
      WBC: '7.体温・8.清潔（創部の感染予防）', CRP: '7.体温・8.清潔（創部の感染予防）', BUN: '3.排泄・2.食事（水分）', Cre: '3.排泄', Cr: '3.排泄', Na: '2.食事（水分・電解質）', K: '2.食事（水分・電解質）', Cl: '2.食事（水分・電解質）' };
    function labValNum(v) { return Number(String(v).replace(/,/g, '')); }
    function labValFmt(v) {
      if (!Number.isFinite(v)) return '';
      const a = Math.abs(v);
      return a >= 1000 ? Math.round(v).toLocaleString('en-US') : a >= 100 ? String(Math.round(v * 10) / 10) : a >= 10 ? String(Math.round(v * 10) / 10) : String(Math.round(v * 100) / 100);
    }
    // 単位の崩れ（OCR）を、似た文字に直した場合の単位（予想にだけ使う。原文は書き換えない）
    function labValRepairUnit(u, stdUnit) {
      const s = String(u || '').replace(/\s+/g, '');
      if (!s || !stdUnit) return '';
      const cands = [s.replace(/\/21$/, '/dL').replace(/\/2l$/i, '/dL').replace(/\/d1$/i, '/dL').replace(/\/dl$/i, '/dL'), s.replace(/\/1$/, '/L').replace(/\/l$/, '/L'), s.replace(/\/ML$/, '/μL').replace(/\/uL$/i, '/μL')];
      return cands.map(normalizeLabUnit).find(c => c === normalizeLabUnit(stdUnit)) || '';
    }
    // 1つのカードの文章から、検査値1件を読んで確認する。previous＝同じ項目のそれまでの確認済みの値（変化の確認に使う）
    function analyzeLabCard(text, previous) {
      const src = String(text || '').trim();
      const t = src.normalize('NFKC');
      const m = LAB_VAL_START_REGEX.exec(t);
      if (!m) {
        // 項目名か数値が崩れた検査値らしい文字列は、検査値として扱わない（原文不明瞭）
        const looksLab = /\d\s*(?:U\/L|mg\/dL|g\/dL|mEq\/L|\/[μu]L|×\s*10)/i.test(t);
        const hasKnownKey = new RegExp(`(?<![A-Za-z])(?:${LAB_VAL_KEY_REGEX_SOURCE})(?![A-Za-z])`).test(t);
        if (looksLab && !hasKnownKey) return { kind: 'broken', source: src, quality: 'corrupted', reasons: ['検査項目名または数値がOCRで崩れている可能性があります'], reasonKinds: ['broken'] };
        return null;
      }
      const written = m[1];
      const key = LAB_STANDARDS[written] ? written : (LAB_JAPANESE_ALIASES[written] || Object.keys(LAB_STANDARDS).find(k => k.toLowerCase() === written.toLowerCase()));
      const std = key && LAB_STANDARDS[key];
      if (!std) return null;
      const rest = m[5] || '';
      const refM = rest.match(/[(（]基準値[:：]?\s*([^)）]*)[)）]/);
      const unitNote = rest.match(/単位[「『]([^」』]*)[」』]を([^と]*)と読み替え/);
      const rec = { kind: 'lab', key, written, source: src, valueRaw: m[2], unitRaw: m[3] || '', arrow: m[4] || '', quality: 'valid', reasons: [], reasonKinds: [], notes: [], prediction: null, ref: null, status: 'unknown', value: labValNum(m[2]), unit: '' };
      if (unitNote) rec.notes.push(`単位は原文「${unitNote[1]}」を${unitNote[2]}と読み替えて比べています`);
      const stdUnit = normalizeLabUnit(std.unit);
      const u = normalizeLabUnit(m[3] || '');
      // 単位と値の確認
      let valueStd = null, unitOk = true;
      if (!u) { valueStd = rec.value; rec.unit = ''; }
      else {
        const resolved = resolveLabUnit(key, m[2], m[3] || '');
        if (resolved) { valueStd = labValNum(resolved.value); rec.unit = resolved.unit || std.unit; }
        else {
          const ratio = labUnitRatio(u, std.unit);
          if (ratio) { valueStd = rec.value * ratio; rec.unit = u; rec.convertNote = `単位が${std.unit}と違うため換算して比べています`; }
          else { unitOk = false; }
        }
      }
      if (!unitOk) { rec.quality = 'suspicious'; rec.reasons.push(`単位「${m[3]}」が読み取れません`); rec.reasonKinds.push('unit'); }
      const range = parseLabReferenceRange(std.ref);
      if (valueStd !== null && range) {
        const lowB = range.low !== null && range.low !== undefined ? range.low * 0.3 : 0;
        const highB = range.high !== null && range.high !== undefined ? (range.low === null || range.low === undefined ? range.high * 100 : range.high * 10) : Infinity;
        if (valueStd < lowB || valueStd > highB) {
          const off = valueStd < lowB ? (range.low || 1) / Math.max(valueStd, 1e-9) : valueStd / (range.high || 1);
          rec.quality = 'suspicious';
          rec.reasons.push(valueStd < lowB ? '一般的な範囲に比べて極端に小さい値です' : '一般的な範囲に比べて極端に大きい値です');
          rec.reasonKinds.push(off >= 50 ? 'digits' : 'magnitude');
        }
      }
      // 基準値：原文にあるものを優先。内蔵の一般的な基準値と同じ文字なら「一般的な基準値」と区別する
      if (refM) {
        const given = refM[1].trim();
        const generic = `${std.ref}${std.unit}`.replace(/\s+/g, '') === given.replace(/\s+/g, '') || std.ref.replace(/\s+/g, '') === given.replace(/\s+/g, '');
        rec.ref = { text: given, origin: generic ? 'general' : 'source', range: parseLabReferenceRange(given), unit: refUnitOf(given) };
      } else if (range) rec.ref = { text: `${std.ref} ${std.unit}`.trim(), origin: 'general', range, unit: std.unit };
      // 変化の確認（同じ項目の前の確認済みの値と比べる）
      if (previous && Number.isFinite(previous.valueStd) && valueStd !== null && previous.valueStd > 0 && valueStd >= 0 && !LAB_VAL_CHANGE_EXEMPT.includes(key)) {
        const ratio = valueStd / previous.valueStd;
        if (ratio >= 8 || ratio <= 1 / 8) {
          rec.quality = 'suspicious'; rec.reasons.push(`${previous.phase ? previous.phase + 'の' : '前の'}値（${labValFmt(previous.valueStd)}）との変化が大きく、実際の変化かOCRの誤読かを原本で確認する必要があります`);
          rec.reasonKinds.push('change'); rec.changeRatio = ratio;
        }
      }
      rec.valueStd = valueStd; rec.stdUnit = std.unit;
      if (rec.quality === 'valid' && rec.convertNote) rec.notes.push(rec.convertNote);
      // 判定：要確認でなければ、基準値と比べる
      if (rec.quality === 'valid') {
        const r = rec.ref && rec.ref.range;
        if (valueStd === null || !r) rec.status = 'unknown';
        else {
          let cmp = valueStd;
          if (rec.ref.origin === 'source' && rec.ref.unit && u && !sameLabUnit(rec.ref.unit, u)) { const ratio2 = labUnitRatio(u, rec.ref.unit); cmp = ratio2 ? rec.value * ratio2 : null; }
          const d = cmp === null ? null : labDirection(cmp, r, rec.arrow);
          rec.status = d === null ? 'unknown' : d === 'high' ? 'high' : d === 'low' ? 'low' : 'normal';
        }
      } else rec.status = 'review';
      // 要確認の値でも、仮に原文どおりだった場合の臨床的な意味を、条件つきで残す（OCRの注意で、本物の異常値の重要性を消さない）
      // この値は「確定した根拠」としては使わない（status は review のまま）
      if (rec.quality === 'suspicious' && range && valueStd !== null && valueStd !== undefined && !rec.reasonKinds.includes('unit') && !rec.reasonKinds.includes('digits')) {
        const dw = labDirection(valueStd, range, rec.arrow);
        rec.asWritten = dw === 'high' ? '高値' : dw === 'low' ? '低値' : dw === 'normal' ? '基準範囲内' : '';
      }
      // 予想（単位・桁が崩れた疑いのときだけ。確度が中以上のときだけ具体的な値を出す）
      if (rec.quality === 'suspicious' && (rec.reasonKinds.includes('digits') || rec.reasonKinds.includes('unit')) && !rec.valueRaw.includes('.') && range) {
        const digits = rec.valueRaw.replace(/[,\-+]/g, '');
        const lowW = range.low !== null && range.low !== undefined ? range.low * 0.6 : 0, highW = range.high !== null && range.high !== undefined ? range.high * 1.6 : Infinity;
        const cands = [], places = [];
        for (let j = 0; j <= 4; j++) { const v = Number(digits) / Math.pow(10, j); if (v >= lowW && v <= highW) { cands.push(v); places.push(j); } }
        const unitFixed = labValRepairUnit(m[3] || '', std.unit);
        if (cands.length === 1) {
          const cand = cands[0];
          const prevOk = previous && Number.isFinite(previous.valueStd) && Math.abs(cand / previous.valueStd - 1) <= 0.3;
          const conf = prevOk ? 'high' : (rec.reasonKinds.includes('unit') && !unitFixed ? 'low' : 'medium');
          const why = [];
          if (rec.reasonKinds.includes('unit')) why.push(unitFixed ? `単位「${m[3]}」が「${std.unit}」の読み間違いではないか` : `単位「${m[3]}」が崩れている`);
          if (rec.reasonKinds.includes('digits')) why.push('単位または小数点が崩れた可能性');
          if (prevOk) why.push(`${previous.phase ? previous.phase + 'の' : '前の'}値 ${labValFmt(previous.valueStd)} ${std.unit} との表記・桁の整合性`); else why.push(`${std.unit}で一般的な範囲に収まる読み方が1つだけ`);
          rec.prediction = { confidence: conf, value: conf === 'low' ? null : cand, text: conf === 'low' ? '' : `${key} ${cand.toFixed(places[0])} ${std.unit}`, reason: why.join('、') };
        } else rec.prediction = { confidence: 'low', value: null, text: '', reason: cands.length ? '読み方の候補が複数あり、1つに絞れません' : '一般的な範囲に収まる読み方が見つかりません' };
      }
      return rec;
    }
    // 呼吸機能（%肺活量・1秒率）。目安は一般的なもの（年齢・性別・施設・判定法で異なる）
    const LAB_RESP_DEFS = [
      { key: '%肺活量', regex: /(%\s*肺活量|%\s*VC|％\s*VC)\D{0,4}(\d+(?:\.\d+)?)\s*%/i, low: 80, ref: '80%以上' },
      { key: '1秒率', regex: /((?:一|1)秒率|FEV\s*1(?:\.0)?\s*%?)\D{0,4}(\d+(?:\.\d+)?)\s*%/i, low: 70, ref: '70%以上' }
    ];
    const LAB_VITAL_DEFS = [
      { key: '体温', regex: /体温\D{0,3}(\d{2}(?:\.\d)?)\s*(?:°C|℃|度)?/, unit: '℃', judge: v => v >= 37.5 ? 'high' : v < 35.5 ? 'low' : 'normal', ref: '35.5〜37.4℃' },
      { key: '脈拍', regex: /(?:脈拍|脈)\D{0,3}(\d{2,3})\s*回/, unit: '回/分', judge: v => v > 100 ? 'high' : v < 60 ? 'low' : 'normal', ref: '60〜100回/分' },
      { key: '呼吸数', regex: /呼吸数\D{0,3}(\d{1,2})\s*回/, unit: '回/分', judge: v => v > 20 ? 'high' : v < 12 ? 'low' : 'normal', ref: '12〜20回/分' },
      { key: 'SpO2', regex: /(?:SpO2|SPO2|Spo2|SpO₂)\D{0,3}(\d{2,3})\s*%/i, unit: '%', judge: v => v < 95 ? 'low' : 'normal', ref: '95%以上' }
    ];
    const LAB_STATUS_LABEL = { high: '高値', low: '低値', normal: '基準範囲内', review: '要確認', unknown: '判定不可' };
    // 取り出した全部：検査値・呼吸機能・バイタルサイン・読み取れない文字列
    function analyzeLabData(cp) {
      const items = expandCombinedLabItems((cp.items || []).filter(i => i.type !== 'unnecessary'));
      const labs = [], broken = [], resp = [], vitals = [];
      const lastValid = {};
      items.forEach(item => {
        const text = String(item.text || '');
        const t = text.normalize('NFKC');
        const phase = String(item.timestamp || '').replace(/\s*\d{1,2}[:：]\d{2}.*$/, '').trim();
        LAB_RESP_DEFS.forEach(d => { const mm = t.match(d.regex); if (mm) { const v = Number(mm[2]); resp.push({ key: d.key, source: text.trim(), value: v, raw: mm[2], ref: d.ref, status: v >= d.low ? 'normal' : 'low', phase, def: d }); } });
        LAB_VITAL_DEFS.forEach(d => { const mm = t.match(d.regex); if (mm) { const v = Number(mm[1]); vitals.push({ key: d.key, source: text.trim(), value: v, raw: mm[1], unit: d.unit, ref: d.ref, status: d.judge(v), phase, oxygen: d.key === 'SpO2' && /酸素|(?:^|[^Sp])O2\s*\d|\d\s*L\s*\/?\s*分|カニュ|マスク|ネーザル/i.test(t.replace(/Sp[O0]2|SPO2|SpO₂/gi, '')) && !/室内気|room air|\bRA\b/i.test(t), roomAir: d.key === 'SpO2' && /室内気|room air|\bRA\b/i.test(t) }); } });
        const bp = t.match(/血圧\D{0,3}(\d{2,3})\s*[/／]\s*(\d{2,3})/);
        if (bp) { const s = Number(bp[1]), dd = Number(bp[2]); vitals.push({ key: '血圧', source: text.trim(), value: `${s}/${dd}`, unit: 'mmHg', ref: '収縮期100〜139・拡張期60〜89mmHg', status: (s >= 140 || dd >= 90) ? 'high' : (s < 90 || dd < 50) ? 'low' : 'normal', phase }); }
        const r = analyzeLabCard(text, null);
        if (!r) return;
        if (r.kind === 'broken') { r.phase = phase; r.itemId = item.id; broken.push(r); return; }
        // 変化の確認は、前の確認済みの値と比べる（もう一度解析して previous を渡す）
        const withPrev = analyzeLabCard(text, lastValid[r.key] || null);
        withPrev.phase = phase; withPrev.itemId = item.id;
        labs.push(withPrev);
        if (withPrev.quality === 'valid') lastValid[r.key] = { valueStd: withPrev.valueStd, phase };
      });
      // 壊れた文字列の項目名の予想：同じ単位の検査で、その時点にまだ無い項目のうち、前の値に近いもの（低い確度）
      broken.forEach(b => {
        const mm = b.source.normalize('NFKC').match(/(\d+(?:\.\d+)?)\s*(U\/L|mg\/dL|g\/dL)/i);
        if (!mm) return;
        const v = Number(mm[1]), unit = normalizeLabUnit(mm[2]);
        const seenHere = new Set(labs.filter(l => l.phase === b.phase).map(l => l.key));
        const cands = Object.keys(LAB_STANDARDS).filter(k => normalizeLabUnit(LAB_STANDARDS[k].unit) === unit && !seenHere.has(k)).map(k => ({ k, prev: lastValid[k] })).filter(x => x.prev && x.prev.valueStd > 0 && Math.abs(v / x.prev.valueStd - 1) <= 0.35);
        if (cands.length === 1) b.prediction = { confidence: 'low', key: cands[0].k, text: `${cands[0].k} ${mm[1]} ${LAB_STANDARDS[cands[0].k].unit}`, reason: `同じ単位で、この時点にまだ記録が無く、前の値（${labValFmt(cands[0].prev.valueStd)}）に近い項目は${cands[0].k}だけです` };
      });
      // AST・ALTの両方が大きく変化したときの注意（数値の欠落・入れ替わりの疑い）
      const ast = labs.find(l => l.key === 'AST' && l.reasonKinds.includes('change')), alt = labs.find(l => l.key === 'ALT' && l.reasonKinds.includes('change'));
      if (ast && alt) { const note = '数値の欠落・入れ替わりではないかと予想されますが、原文だけでは確定できません（確度：低）'; ast.notes.push(note); alt.notes.push(note); }
      return { labs, broken, resp, vitals };
    }
    // 検査値の文字が読めないか（ヘンダーソンの分類に入れない）。単位・桁の崩れ（TP 60g/21、RBC4587/uL）も含む。変化が大きいだけの値は含めない
    function isLabTextUnreliable(text) {
      let r = null;
      try { r = analyzeLabCard(text, null); } catch (e) { return false; }
      if (!r) return false;
      return r.kind === 'broken' || (r.quality === 'suspicious' && (r.reasonKinds.includes('unit') || r.reasonKinds.includes('digits')));
    }
    // 事実と、考察・予測を分けて文章にする
    function buildLabAssessment(cp) {
      const { labs, broken, resp, vitals } = analyzeLabData(cp);
      const allText = (cp.items || []).filter(i => i.type !== 'unnecessary').map(i => String(i.text || '')).join('\n').normalize('NFKC');
      const ctx = {
        surgery: /術後|手術|術式|全摘|切除|開腹|腹腔鏡|オペ/.test(allText), fasting: /絶飲食|絶食|禁食|NPO/.test(allText),
        bleeding: /出血|血性|ドレーン/.test(allText), infection: /発熱|膿|発赤|腫脹|熱感|排膿|悪寒|感染徴候/.test(allText), smoking: /喫煙|煙草|タバコ|ブリンクマン/.test(allText),
        fever: vitals.some(v => v.key === '体温' && v.status === 'high')
      };
      const basics = extractClinicalBasics(String(cp.sourceText || '') + '\n' + allText);
      const facts = [], reviews = [], thoughts = [];
      const byKey = {};
      labs.forEach(l => { (byKey[l.key] = byKey[l.key] || []).push(l); });
      const phaseText = l => l.phase ? `（${l.phase}）` : '';
      Object.keys(byKey).forEach(key => {
        const list = byKey[key];
        const std = LAB_STANDARDS[key];
        const valid = list.filter(l => l.quality === 'valid');
        const seq = valid.map(l => labValFmt(l.value)).join(' → ');
        const lines = [];
        if (valid.length) {
          const last = valid[valid.length - 1];
          lines.push(`${key}：${seq} ${last.unit || (std ? std.unit : '')}`.trim());
          if (last.ref) lines.push(`　判定：${LAB_STATUS_LABEL[last.status]}${last.ref.text ? `（基準値 ${last.ref.text}・${last.ref.origin === 'source' ? '原文の基準値' : 'アプリ内蔵の一般的な基準値（性別・年齢・施設で異なります）'}）` : ''}`);
          else lines.push(`　判定：${LAB_STATUS_LABEL[last.status]}`);
          // 推移（基準値の判定とは分けて書く）
          if (valid.length >= 2) {
            const first = valid[0], pct = (last.valueStd - first.valueStd) / (first.valueStd || 1);
            const dir = pct <= -0.05 ? '低下' : pct >= 0.05 ? '上昇' : '';
            if (dir) lines.push(`　推移：${first.phase ? first.phase + 'より' : '以前より'}${dir}しています${last.status === 'normal' ? '（基準範囲内の変化）' : ''}。`);
            else lines.push('　推移：大きな変化はありません。');
            last.trend = dir ? (dir === '低下' ? 'down' : 'up') : 'flat'; last.trendPct = pct;
          }
          last.notes.forEach(n => lines.push(`　注：${n}`));
          if (basics.sex === 'male' && (key === 'Hb' || key === 'Ht') && last.status === 'normal' && Number.isFinite(last.valueStd) && last.valueStd < (key === 'Hb' ? 13.5 : 40)) lines.push(`　注：男性の一般的な目安（${key === 'Hb' ? '13.5〜17.5 g/dL' : '40〜52%'}）より低めです。男女共通の広い基準範囲の中でも、男性としては低めの可能性があります。施設の男性用の基準値があれば、それで確認してください。`);
          if (key === 'ALP' && !(last.ref && last.ref.origin === 'source')) lines.push('　注：ALPの基準値は測定法（JSS法・IFCC法）で大きく異なります（目安：JSS法 約100〜340 U/L、IFCC法 約38〜113 U/L）。原文の基準値・測定法を確認し、内蔵の基準との比較は参考にとどめてください。');
        }
        list.filter(l => l.quality !== 'valid').forEach(l => {
          lines.push(`${key}：原文「${l.source}」${phaseText(l)}`);
          lines.push('　データ確認：原本確認が必要');
          lines.push(l.reasonKinds.includes('unit') || l.reasonKinds.includes('digits') ? '　判定：要確認（判定不可：単位・桁の確認が必要。この値では低値・高値を判断しません）' : '　判定：要確認');
          if (l.asWritten && l.asWritten !== '基準範囲内') lines.push(`　仮に原文どおりなら：${l.asWritten}（原本で確認できるまで、看護問題・看護計画の根拠には使いません）`);
          if (l.prediction && l.prediction.value !== null && l.prediction.value !== undefined && ['medium', 'high'].includes(l.prediction.confidence)) {
            lines.push(`　推定候補：${l.prediction.text} 前後ではないかと予想されます（推定確度：${l.prediction.confidence === 'high' ? '高' : '中'}）。原文の値は書き換えていません。`);
            lines.push(`　理由：${l.prediction.reason}。OCRで単位または小数点が崩れた可能性があります。原本確認が必要です。`);
          } else {
            lines.push(`　${l.reasons.join('。')}。OCR誤読の可能性があります。原本確認が必要です。`);
          }
          l.notes.forEach(n => lines.push(`　注：${n}`));
          if (l.reasonKinds.includes('change')) lines.push('　（要確認の値は、基準値の判定と推移には使っていません）');
          reviews.push(`${key}${phaseText(l)}`);
        });
        facts.push(lines.join('\n'));
        // 考察・予測（直接の所見＋もっともらしい関係＋反対の証拠が無いときだけ）
        if (valid.length) {
          const last = valid[valid.length - 1];
          const abnormal = last.status === 'high' || last.status === 'low';
          const down = last.trend === 'down', up = last.trend === 'up';
          let th = '';
          if (['Hb', 'Ht', 'RBC'].includes(key) && (down || last.status === 'low')) th = ctx.surgery ? `${key}が${down ? '術前より低下している' : '低値である'}ため、手術に伴う出血や周術期の影響ではないかと考えられる。ふらつき・顔色・活動時の息切れなどの確認が必要。` : `${key}が${down ? '低下' : '低値'}しているが、原因は現時点の情報だけでは判断できません。追加情報が必要です。`;
          else if (['Alb', 'TP'].includes(key) && (down || last.status === 'low')) th = (ctx.surgery || ctx.fasting) ? `${key}が${down ? '低下している' : '低値である'}ため、手術侵襲や摂取制限（絶飲食など）の影響がある可能性が考えられる。栄養状態や創傷治癒への影響を経過で確認する必要がある。` : `${key}が${down ? '低下' : '低値'}しているが、原因は現時点の情報だけでは判断できません。追加情報が必要です。`;
          else if (['WBC', 'CRP'].includes(key) && last.status === 'high') th = ctx.surgery ? `${key}の上昇は術後の炎症反応によるものではないかと考えられるが、${ctx.infection || ctx.fever ? '発熱や創部などの感染徴候の記載があるため、感染の可能性も含めて' : '感染徴候（発熱・創部・ドレーン排液など）との区別のため'}経過観察が必要である。` : `${key}が高値だが、原因は現時点の情報だけでは判断できません。感染徴候などの追加情報が必要です。`;
          else if (['AST', 'ALT', 'ALP', 'γGTP', 'T-Bil'].includes(key) && last.status === 'high') th = `${key}が高値のため、肝胆道系への影響の可能性が考えられるが、手術・薬剤などの影響も含め、現時点の情報だけでは判断できません。経過の確認が必要です。`;
          else if (['BUN', 'Cre', 'Cr'].includes(key) && last.status === 'high') th = `${key}が高値のため、脱水や腎機能の変化の可能性が考えられる。尿量・水分出納と合わせて確認が必要である。`;
          else if (['Na', 'K', 'Cl'].includes(key) && abnormal) th = `${key}が${last.status === 'high' ? '高値' : '低値'}のため、摂取状況・輸液・症状（嘔気・倦怠感・不整脈など）と合わせて確認が必要である。`;
          else if (abnormal) th = `${key}が${last.status === 'high' ? '高値' : '低値'}ですが、現時点の情報だけでは判断できません。追加情報が必要です。`;
          if (th) thoughts.push({ key, text: th, needs: LAB_VAL_RELATED_NEEDS[key] || '' });
        }
      });
      broken.forEach(b => {
        const lines = [`原文「${b.source}」${phaseText(b)}`, '　判定：原文不明瞭', '　検査項目名または数値がOCRで崩れている可能性があります。原本確認が必要です。（検査値としては扱わず、ヘンダーソンの分類にも入れていません）'];
        if (b.prediction) lines.push(`　推定候補：${b.prediction.text} の検査値ではないかと予想されます（推定確度：低）。理由：${b.prediction.reason}。`);
        facts.push(lines.join('\n'));
        reviews.push('読み取れない文字列');
      });
      // 呼吸機能
      const respLines = [];
      resp.forEach(r => {
        respLines.push(`${r.key}：${r.raw}%${r.phase ? `（${r.phase}）` : ''}\n　判定：${r.status === 'normal' ? '基準範囲内' : '低値'}（一般的な目安 ${r.ref}。年齢・性別・施設・判定法で基準が異なるため、参考として見てください）${r.key === '1秒率' ? '\n　注：1秒率だけで慢性閉塞性肺疾患（COPD）とは診断できません（気管支拡張薬後の測定・症状・画像などを合わせた医師の判断です）。年齢とともに低下しやすく、固定の70%では評価が難しい場合があります。' : ''}`);
        if (r.key === '1秒率' && r.status === 'low') thoughts.push({ key: '1秒率', text: `1秒率が一般的な目安（70%）を下回っているため、閉塞性の換気パターンの可能性が考えられるが、年齢・基準の違いもあり、診断は医師の判断です。${ctx.smoking ? '喫煙歴の影響の可能性も考えられるが、現時点では推測に留まります。' : ''}術後の呼吸器合併症のリスク評価として、呼吸状態の観察が必要です。`, needs: '1.呼吸' });
        if (r.key === '%肺活量' && r.status === 'low') thoughts.push({ key: '%肺活量', text: '%肺活量が一般的な目安（80%）を下回っているため、拡張しにくい（拘束性の）換気パターンの可能性が考えられるが、診断は医師の判断です。', needs: '1.呼吸' });
      });
      if (resp.some(r => r.status === 'normal') && !resp.some(r => r.status === 'low')) thoughts.push({ key: '呼吸機能', text: '術前の呼吸機能は、一般的な目安では保たれていると考えられる。', needs: '1.呼吸' });
      // バイタルサイン
      const vitalLines = [];
      vitals.forEach(v => {
        vitalLines.push(`${v.key}：${v.raw || v.value}${v.unit}${v.phase ? `（${v.phase}）` : ''}　判定：${LAB_STATUS_LABEL[v.status]}（一般的な目安 ${v.ref}）${v.roomAir ? '　（室内気の値）' : ''}${v.oxygen ? '　※酸素投与下の値のため、室内気の状態とは評価できません' : ''}`);
      });
      const hasAny = labs.length || broken.length || resp.length || vitals.length;
      if (!hasAny) return { has: false, text: '', html: '', labs, broken, resp, vitals, checks: [] };
      // 最終確認（表示の前に、原文を残したか・予想を事実にしていないか・読めない文字列を検査値にしていないかを確かめる）
      const checks = [];
      labs.forEach(l => { if (!l.source) checks.push('原文が残っていません'); if (l.quality !== 'valid' && l.status !== 'review') checks.push(`${l.key}：要確認の値に判定が付いています`); if (l.prediction && l.prediction.value != null && !['medium', 'high'].includes(l.prediction.confidence)) checks.push(`${l.key}：確度が低い予想に値が付いています`); });
      broken.forEach(b => { if (labs.some(l => l.source === b.source)) checks.push('読めない文字列が検査値になっています'); });
      let out = '【検査データ臨床評価・アセスメントノート】\n（AIなし：記録と、登録された基準との比較です。「事実」と「考察・予測」を分けています。予想は原文の値を書き換えるものではありません）\n';
      if (facts.length) out += `\n■ 検査値（事実：原文・基準との比較）\n${facts.join('\n')}\n`;
      if (respLines.length) out += `\n■ 呼吸機能（事実）\n${respLines.join('\n')}\n`;
      if (vitalLines.length) out += `\n■ バイタルサイン（事実：検査値とは別に評価）\n${vitalLines.join('\n')}\n`;
      if (thoughts.length) out += `\n■ 考察・予測（根拠のある所見だけ。事実ではなく、看護師の推論です）\n${thoughts.map(x => `・${x.text}${x.needs ? `（関連しうる基本的欲求：${x.needs}）` : ''}`).join('\n')}\n`;
      else out += '\n■ 考察・予測\n・基準を外れた値や、大きな変化の記録が無いため、現時点で追加の考察はありません。\n';
      if (reviews.length) out += `\n■ 原本の確認が必要な値\n・${Array.from(new Set(reviews)).join('、')}（原文をそのまま残しています。確認できるまで、判定や分類には使わないでください）\n`;
      const html = escapeHtml(out).replace(/\n/g, '<br>');
      return { has: true, text: out, html, labs, broken, resp, vitals, thoughts, checks };
    }
    // 画面と書き出しで使う：保存されたAIの結果があればそれを、無ければ今の記録から作った評価を出す
    function labAssessmentHtmlFor(cp) {
      if (cp.labEvaluationResult) return cp.labEvaluationResult;
      try { return buildLabAssessment(cp).html || ''; } catch (e) { console.warn('検査値の評価を作れませんでした:', e); return ''; }
    }
    function labAssessmentTextFor(cp) {
      try { return buildLabAssessment(cp).text || ''; } catch (e) { return ''; }
    }
    // 画面の「検査値の評価」の欄：保存されたAIの結果が無いときは、今の記録から作った評価を出す（記録が変わるたびに更新）
    window.refreshLabAssessmentPanel = function() {
      const panel = document.getElementById('lab-evaluation-panel');
      if (!panel || !DOM.labEvalContent) return;
      const cp = getCurrentPatient();
      if (cp.labEvaluationResult) return;
      const html = labAssessmentHtmlFor(cp);
      if (DOM.labEvalContent.innerHTML !== html) DOM.labEvalContent.innerHTML = html;
      const hide = !html;
      if (panel.classList.contains('hidden') !== hide) { panel.classList.toggle('hidden', hide); if (typeof refreshAiResults === 'function') refreshAiResults(true); }
    };
