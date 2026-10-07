    // 看護アセスメント支援システム：08-assessment-tools.js（全10ファイルのうち 8 番目）
    // BMI等の自動算出、検査値の評価、不足情報の推定、総合アセスメント表・カード一覧の表示。
    // index.html の <script> で 01〜10 の順に読み込み、1つのプログラムとして動きます
    // （順番を入れ替えないでください。以前の app.js を内容ごとに分けたものです）。

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['08'] = '2026-10-07.8'; // 版（scripts/stamp-version.js が書き込む）
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
      if (!(await requireApiKey('検査値の評価', { fallbackLabel: 'AIなしで簡易チェック' }))) return;
      const cp = getCurrentPatient();
      const prevResult = cp.labEvaluationResult;
      const addedMetrics = calculateAndAddDerivedMetricCards();
      if (addedMetrics > 0) showToast(`${addedMetrics}件の指標（BMI・ブリンクマン指数等）を自動算出してカードに追加しました`, 'info');
      const oItems = cp.items.filter(i => i.type === 'o');
      if (oItems.length === 0) return showToast('Oデータ（検査値やバイタル）がありません。先に分類してください', 'warn');

      const labTexts = oItems.map(i => `[${i.timestamp}] ${i.text}`).join('\n');
      document.getElementById('lab-evaluation-panel')?.classList.remove('hidden');
      DOM.labEvalContent.innerHTML = `<div class="flex items-center text-[var(--accent-dark)]"><i class="fa-solid fa-spinner fa-spin mr-2"></i> 登録された基準で検査値を確認しています...</div>`;

      if (!globalAppData.apiKey) {
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

      try {
        const text = await callGeminiAI([{ role: "user", parts: [{ text: `あなたは熟練した看護師長・指導者です。以下の「基準ノート」（登録された基準）の検査値評価規則を根拠にして、患者のOデータに含まれる検査値やバイタルの臨床的意味を評価し、総合評価欄向けに分かりやすく解説・アセスメント文章を作成してください。\n【基準ノート】\n${buildAssessmentNotebookContent()}\n【患者のOデータ一覧】\n${labTexts}\n${typeof drugPromptSection === 'function' ? drugPromptSection(cp) : ''}要点では、基準を外れた値と、看護で最も注意すべきことを示してください。詳細は系統ごと（呼吸・循環／炎症・感染／栄養・代謝／腎機能 など）の見出しにし、各値は「項目 値（基準値）：意味」の形で1行にしてください。最後に「### まとめ（アセスメント文）」として、記録にそのまま使える3〜4文の文章を付けてください。${AI_STYLE_INSTRUCTION}` }] }]);
        cp.labEvaluationResult = formatAiResultHtml(text, '評価の生成に失敗しました。');
        if (finishAiResult(cp, () => { DOM.labEvalContent.innerHTML = cp.labEvaluationResult; }, '検査値の評価')) showToast('検査値の評価を表示しました', 'success');
      } catch (err) {
        console.warn('Lab evaluation error:', err);
        showAiErrorKeepingPrevious(DOM.labEvalContent, cp, `評価中にエラーが発生しました（${err.message || '通信エラー'}）。APIキーや通信状況をご確認ください。`, prevResult);
        showToast(['検査値の評価を表示できませんでした', { text: '理由は「検査データ臨床評価」の欄に出しています。時間を置いてもう一度押すか、APIキーを外すとAIを使わない簡易チェックになります。', detail: true }], 'warn');
      }
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

    window.evaluateMissingInfoAI = guardAiStep('missing', async function() {
      if (!(await requireApiKey('不足情報の推定', { fallbackLabel: 'AIなしで簡易チェック' }))) return;
      const cp = getCurrentPatient();
      const activeItems = cp.items.filter(i => i.type !== 'unnecessary');
      if (activeItems.length === 0) return showToast('カードがありません。先にカルテを分類してください', 'warn');

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

      if (perNeedSummary.length === 0) return showToast('ヘンダーソンタグが付いたカードがありません。先にタグ付けしてください', 'warn');

      showToast('入院前後の記録・医学的所見から不足情報を推定中...', 'info');

      if (!globalAppData.apiKey) {
        // ローカル簡易ルール：①入院前後どちらかの記録が欠けている項目 ②異常検査値があるのに関連項目の入院後記録がない場合
        // 【レビューで発見】以前はAIの経路と違って前回の結果を置き換えず、押すたびに同じ不足情報のカードが増えていた
        // （3回押すと 7→9→11件）。AIの経路と同じく、前回推定したまま手を付けていないカードは今回の結果に置き換え、
        // 確認済み・該当なし・手で直したカードと同じ内容のものは足さない。また、診断名別のチェックは、不足情報のカード
        // （「ドレーン排液…の記録が見当たらない」）を「記録がある」と数えないよう、実際の記録だけで調べる。
        const replacedLocal = cp.items.filter(i => isUntouchedAiMissing(cp, i));
        replacedLocal.forEach(i => markItemDeleted(cp, i.id));
        cp.items = cp.items.filter(i => !isUntouchedAiMissing(cp, i));
        const keptLocal = new Set(cp.items.filter(i => isMissingInfoOnlyItem(i)).map(i => missingInfoKey((i.hendersonIds || []).join(','), i.text)));
        const recordItems = activeItems.filter(i => !isMissingInfoOnlyItem(i));
        let added = 0;
        const addLocal = (hId, text) => {
          const key = missingInfoKey(hId, text);
          if (keptLocal.has(key)) return;
          keptLocal.add(key);
          pushMissingInfoCard(hId, text, cp);
          added++;
        };
        perNeedSummary.forEach(n => {
          if (n.pre.length > 0 && n.post.length === 0) {
            addLocal(n.id, `原因: 入院前の記録はあるが入院後「${n.name.replace(/^\d+\.\s*/, '')}」に関する再評価の記録が見当たらない → 入院後の状態を再アセスメントして追記する必要があると考えられる`);
          } else if (n.post.length > 0 && n.pre.length === 0) {
            addLocal(n.id, `原因: 入院後の記録はあるが入院前のベースラインが確認できない → 入院前の状態を家族・本人へ確認し追記する必要があると考えられる`);
          }
        });
        // 白血球・CRP等の炎症所見は日本語表記でも検出できるよう、WBC/CRPの決め打ち英語表記だけでなく
        // extractAbnormalLabFindings（項目名の完全一致に頼らない汎用検出）の結果を利用する。
        const hasInflammationFinding = extractAbnormalLabFindings(oItems).some(f => /WBC|白血球|CRP/i.test(f.label));
        if (hasInflammationFinding) {
          const need1 = perNeedSummary.find(n => n.id === 1);
          if (need1 && need1.post.length === 0) {
            addLocal(1, `原因: WBC・CRP等の炎症所見があるが呼吸状態の入院後の記録が不足している → 呼吸数・SpO2・喘鳴の有無等の観察記録が必要と考えられる`);
          }
        }
        // 胃がん（胃切除術）患者の場合、以前アップロードいただいた周術期看護の判断基準に基づく
        // 代表的な術後観察項目（ドレーン管理・尿道カテーテル管理・下肢血栓予防・術後せん妄・疼痛管理）
        // を確認し、記録に一切現れないものがあれば提案する。入院後の記録が全く無い（まだ手術前の
        // 段階）と思われる場合は、術後観察が未記載でも自然なため対象外とする。
        const hasAnyPostRecord = perNeedSummary.some(n => n.post.length > 0);
        if (hasAnyPostRecord) {
          detectGastricPostopMissingChecks(recordItems).forEach(check => addLocal(check.hendersonId, `原因: ${check.reason}`));
          // 大腿骨近位部骨折（人工骨頭置換術・骨接合術）患者の場合も、同様に代表的な
          // 術後観察項目（ドレーン管理・尿道カテーテル管理・DVT予防・疼痛管理・脱臼予防・
          // 術後せん妄）を確認し、記録に一切現れないものがあれば提案する。
          detectHipFracturePostopMissingChecks(recordItems).forEach(check => addLocal(check.hendersonId, `原因: ${check.reason}`));
          // 肺炎（CAP/HAP/NHCAP・誤嚥性肺炎）患者の場合も、同様に代表的な観察項目
          // （酸素療法・排痰援助・誤嚥/嚥下機能評価・口腔ケア・体温・ワクチン接種）を確認し、
          // 記録に一切現れないものがあれば提案する。
          detectPneumoniaMissingChecks(recordItems).forEach(check => addLocal(check.hendersonId, `原因: ${check.reason}`));
        }
        markAiRun(cp, 'missing');
        saveDataAndSync();
        renderAiSteps(cp);
        showToast(added > 0 ? `${added}件の不足情報を推定しました（簡易ルール）${replacedLocal.length ? `（前回の推定のうち未確認の${replacedLocal.length}件は置き換えました）` : ''}` : '簡易チェックでは不足情報を検出できませんでした。すべての項目を判定できるわけではありません', added > 0 ? 'success' : 'info');
        return;
      }

      try {
        const prompt = `あなたは熟練した看護師長・指導者です。以下の患者情報をもとに、ヘンダーソン14の基本的欲求ごとに「不足している可能性が高い情報」を推定してください。
判断材料は次の3点です。
①入院前後の記録を比較し、どちらかにしか記録がない項目（記録の欠落）
②Oデータに含まれる医学的所見・検査値と、それに対応する記録の有無
③参考データ（看護基準・プロトコル等）に照らして通常確認すべきだが記録がない項目

【基準ノート】
${buildAssessmentNotebookContent()}

【参考データ】
${referenceText || '(登録なし)'}

【ヘンダーソン項目ごとの入院前後の記録】
${perNeedSummary.map(n => `${n.name}\n入院前: ${n.pre.join(' / ') || '(記録なし)'}\n入院後: ${n.post.join(' / ') || '(記録なし)'}`).join('\n\n')}

【Oデータ（検査値・バイタル等）一覧】
${labTexts || '(なし)'}

${typeof drugPromptSection === 'function' ? drugPromptSection(cp) : ''}
挙げる順番は優先度の高い順にし、アセスメントや安全に直結するもの（例：肺炎なら呼吸数・酸素投与の量・喀痰・意識・水分出納、糖尿病なら血糖）を先にしてください。信仰・余暇のようにどの患者にも当てはまる一般的な項目は、この患者で確かめる理由が記録から読み取れるときだけ挙げてください。記録に無い治療（例：利尿薬）があるものとして書かないでください。
各不足情報は必ず "原因: <不足に至った理由> → <補足すべき内容>と考えられる" という文言そのものを text とし、対応するヘンダーソン番号(1〜14の整数)を hendersonId とするJSON配列のみを出力してください。該当がなければ空配列 [] を返してください。余計な説明やMarkdown記号は出力しないでください。
例: [{"hendersonId":1,"text":"原因: 入院後のSpO2測定記録がない → 呼吸状態の再アセスメントが必要と考えられる"}]
text は読みやすさのため全体で70字程度までにし、「→」の後ろは「何を確かめるか」を具体的に書いてください（「〜の把握が必要」のような言い方の繰り返しは避ける）。1つの項目につき、本当に大事なものを1〜2件までにしてください。すでに「不足情報」欄にある内容と同じものは出さないでください。
【すでにある不足情報（残すもの）】
${cp.items.filter(i => i.type !== 'unnecessary' && isMissingInfoOnlyItem(i) && !isUntouchedAiMissing(cp, i)).map(i => `- ${(i.hendersonIds || []).join('・')}：${i.text.replace(/^原因:\s*/, '')}`).join('\n') || '(なし)'}`;

        // 【レビューで発見】以前は JSON の指定をせずに頼み、答えの最初の「[」から最後の「]」までを JSON.parse していたため、
        // 後ろに「※[参考]…」のような説明が付く・前に「[JSON形式]」と書かれる・null が混ざるだけで失敗していた
        // （まとめて実行も①で止まる）。JSONの答えを指定し、読み取りは parseAiJsonArray で崩れに強くする。
        const aiText = await callGeminiAI([{ role: "user", parts: [{ text: prompt }] }], { json: true });
        const suggestions = parseAiJsonArray(aiText, ['suggestions', 'items', 'missing', 'results']);
        if (!suggestions) throw new Error('AI応答からJSONを取得できませんでした');
        // 【重複を防ぐ】以前は推定するたびに同じような不足情報が足され、3回押すと42件になっていた（利用者の記録）。
        // 前回AIが推定した不足情報のうち、まだ手を付けていないもの（未確認・編集していない）は今回の結果に置き換え、
        // 今回の結果の中でも、同じ項目で同じ内容のものは1つにする。確認済み・該当なし・手で直したものは残す。
        const untouchedAi = i => isUntouchedAiMissing(cp, i);
        const replaced = cp.items.filter(untouchedAi);
        replaced.forEach(i => markItemDeleted(cp, i.id));
        cp.items = cp.items.filter(i => !untouchedAi(i));
        const keptKeys = new Set(cp.items.filter(i => isMissingInfoOnlyItem(i)).map(i => missingInfoKey((i.hendersonIds || []).join(','), i.text)));
        let added = 0;
        suggestions.forEach(s => {
          // 項目の形でないもの（null・文字列だけ等）や、text が文字でないものは飛ばす
          if (!s || typeof s !== 'object' || Array.isArray(s)) return;
          const text = typeof s.text === 'string' ? s.text.trim() : '';
          const hId = parseInt(s.hendersonId, 10);
          if (!text || !HENDERSON_NEEDS.some(n => n.id === hId)) return;
          const key = missingInfoKey(hId, text);
          if (keptKeys.has(key)) return;
          keptKeys.add(key);
          pushMissingInfoCard(hId, text, cp);
          added++;
        });
        markAiRun(cp, 'missing');
        if (finishAiResult(cp, () => renderAiSteps(cp), '不足情報の推定')) showToast(added > 0 ? `${added}件の不足情報をAIが推定しました${replaced.length ? `（前回のAI推定のうち未確認の${replaced.length}件は置き換えました）` : ''}` : 'AIは不足情報を挙げませんでした。すべての項目を判定できるわけではありません', added > 0 ? 'success' : 'info');
      } catch (err) {
        showAiErrorToast('不足情報の推定に失敗しました。', err);
      }
    });
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
        { key: 'careplan', label: '③ 看護計画', done: !!run.careplan || !!cp.carePlanResult, detail: run.careplan ? `済（${formatAiStepTime(run.careplan)}）` : (cp.carePlanResult ? '済' : '未') }
      ];
      const next = steps.find(s => !s.done);
      if (next) next.next = true;
      return steps;
    }
    const AI_STEP_ACTIONS = { missing: 'evaluateMissingInfoAI()', diagnosis: 'suggestNursingDiagnosesAI()', careplan: 'generateCarePlanAI()' };
    // 【AIのボタンを使いやすく】利用者からの要望：「AIのボタンをもう少し使いやすく」「AIを実行すると総合アセスメント表の
    // ページがごちゃごちゃする」。以前は、右上の「AI分析ツール」の中に7つのボタンが隠れ、その下に「AIで進める順番」の
    // 案内が別にあり、AIを実行するたびに結果の欄が表の上へ1つずつ積み重なっていた。
    //  ・AIのボタンは1列にまとめて常に見せる（左：①不足情報→②看護診断→③看護計画の順番、右：そのほかの確認）。
    //    済んだものには✓と件数、実行中はくるくるを出す。
    //  ・結果は「AIの結果」の欄に種類ごとのタブで1つだけ表示し、表の上に積み重ねない（refreshAiResults）。
    const AI_EXTRA_TOOLS = [
      { key: 'lab', label: '検査値の評価', icon: 'fa-flask-vial', action: 'evaluateLabValuesAI()', panel: 'lab-evaluation-panel', title: '検査値を登録された基準で確認し、臨床的な意味をまとめます' },
      { key: 'contradiction', label: 'S/O矛盾', icon: 'fa-triangle-exclamation', action: 'checkContradictionsAI()', panel: 'contradiction-panel', title: 'S（発言）とO（観察）の食い違いを探します' },
      { key: 'timeline', label: '経時変化サマリー', icon: 'fa-clock-rotate-left', action: 'generateTimelineSummaryAI()', panel: 'timeline-panel', title: '日ごとの変化をまとめます' },
      { key: 'review', label: '分類の評価', icon: 'fa-list-check', action: 'openAiReview()', panel: null, title: 'S/O・タグの分類をAIに見てもらい、改善点を一覧にします（別の画面で開きます）' }
    ];
    const AI_STEP_PANELS = { missing: null, diagnosis: 'diagnosis-panel', careplan: 'careplan-panel' };
    function aiPanelRunning(panelId) {
      const body = panelId && document.getElementById(panelId)?.querySelector?.('.ai-panel-body');
      return !!(body && body.querySelector && body.querySelector('.fa-spinner'));
    }
    function renderAiSteps(cp) {
      const el = document.getElementById('ai-steps');
      if (!el) return;
      // 【レビューで発見】「まとめて実行」の途中でも①②③を押せ、同じ機能が重なって走っていた。実行中は押せなくする
      const pipeRunning = !!(window.aiPipelineStatus && window.aiPipelineStatus.running);
      const steps = computeAiStepStatus(cp).map((s, k) => {
        const running = aiPanelRunning(AI_STEP_PANELS[s.key]) || isAiStepRunning(cp, s.key);
        const status = running ? '<i class="fa-solid fa-spinner fa-spin"></i> 実行中' : escapeHtml(s.detail);
        return `${k ? '<i class="fa-solid fa-chevron-right ai-steps-arrow" aria-hidden="true"></i>' : ''}<button type="button" class="ai-step${s.done ? ' done' : ''}${s.next ? ' next' : ''}" onclick="${AI_STEP_ACTIONS[s.key]}" title="${pipeRunning ? '「看護計画までまとめて実行」の途中です' : s.done ? 'もう一度実行します' : '押すとAIが実行します'}"${pipeRunning || running ? ' disabled' : ''}>${s.done ? '<i class="fa-solid fa-check"></i>' : ''}<span class="ai-step-label">${s.label}</span><span class="ai-step-status">${status}</span></button>`;
      }).join('');
      const extras = AI_EXTRA_TOOLS.map(t => {
        const running = aiPanelRunning(t.panel) || isAiStepRunning(cp, t.key);
        const done = t.key === 'lab' ? !!cp.labEvaluationResult : t.key === 'contradiction' ? !!cp.contradictionResult : t.key === 'timeline' ? !!cp.timelineResult : false;
        return `<button type="button" class="ai-tool${done ? ' done' : ''}" onclick="${t.action}" title="${escapeHtml(t.title)}"><i class="fa-solid ${running ? 'fa-spinner fa-spin' : done ? 'fa-check' : t.icon}"></i>${t.label}</button>`;
      }).join('');
      // 「看護計画までまとめて実行」（js/13 の runAiPipelineToCarePlan）。実行中は今どこまで進んだかを出す
      const pipe = window.aiPipelineStatus;
      const runAll = pipe && pipe.running
        ? `<span class="ai-run-all is-running" role="status"><i class="fa-solid fa-spinner fa-spin"></i> ${escapeHtml(pipe.label || '実行中')}</span>`
        : `<button type="button" class="ai-run-all" onclick="runAiPipelineToCarePlan()" title="①不足情報の推定 → ②看護診断候補（優先度の高い順に選ぶ）→ ③看護計画 → 「看護計画」タブへの取り込み までを、順番に自動で行います"><i class="fa-solid fa-forward"></i> 看護計画までまとめて実行</button>`;
      el.innerHTML = `<span class="ai-steps-title"><i class="fa-solid fa-wand-magic-sparkles"></i> AI</span>
        ${runAll}
        <div class="ai-bar-group ai-bar-steps" aria-label="AIで順番に進める">${steps}</div>
        <div class="ai-bar-group ai-bar-tools" aria-label="そのほかのAIの確認">${extras}</div>`;
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
      content.innerHTML = '<p class="dx-hint">看護計画を立てたい診断にチェックを入れて、下の「選んだ診断で看護計画を作る」を押してください。</p>' +
        cands.map(c => `<div class="dx-candidate${sel.has(c.id) ? ' dx-selected' : ''}">
          <label class="dx-name"><input type="checkbox" ${sel.has(c.id) ? 'checked' : ''} onchange="toggleDiagnosisSelection('${safeDomId(c.id)}', this.checked)"> ${escapeHtml(c.name)}</label>
          ${c.bodyHtml ? `<div class="dx-body">${storedAiHtml(c.bodyHtml)}</div>` : ''}
        </div>`).join('') +
        `<div class="dx-actions"><span>${sel.size}件を選択中</span><button type="button" class="btn btn-primary text-[11px] py-1" onclick="generateCarePlanAI()" ${sel.size ? '' : 'disabled style="opacity:.5;cursor:not-allowed;"'}><i class="fa-solid fa-notes-medical"></i> 選んだ診断で看護計画を作る</button></div>`;
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

    // 「S/O矛盾チェック」：SデータとOデータの間で内容が食い違っていないかをAIに確認してもらう
    window.checkContradictionsAI = guardAiStep('contradiction', async function() {
      if (!(await requireApiKey('S/O矛盾チェック'))) return;
      const cp = getCurrentPatient();
      const prevResult = cp.contradictionResult;
      const activeItems = cp.items.filter(i => (i.type === 's' || i.type === 'o') && !isMissingInfoOnlyItem(i));
      const panel = document.getElementById('contradiction-panel');
      const content = document.getElementById('contradiction-content');
      if (activeItems.length < 2) return showToast('S/Oのカードが少ないためチェックできません', 'warn');
      panel.classList.remove('hidden');
      content.innerHTML = `<div class="flex items-center text-[var(--ink-muted)]"><i class="fa-solid fa-spinner fa-spin mr-2"></i> S/Oデータの矛盾を確認中...</div>`;
      if (!globalAppData.apiKey) {
        content.innerHTML = `<span class="text-[var(--ink-muted)]">この機能はAPIキー設定時のみ利用できます（「API設定」からGemini APIキーを登録してください）。</span>`;
        return;
      }
      const ev = buildEvidenceIndex(activeItems);
      const list = activeItems.map(i => evidenceLine(ev, i)).join('\n');
      try {
        const text = await callGeminiAI([{ role: "user", parts: [{ text: `あなたは熟練した看護師長です。以下は患者のSデータ（主観的情報＝患者の発言）とOデータ（客観的情報＝観察所見・検査値）の一覧です。SデータとOデータの間で内容が食い違っている、あるいは併せて考えると注意が必要な組み合わせがあれば指摘してください。本当に食い違っているもの（同じ時点の訴えと観察が合わない等）だけを挙げ、別々の事柄を並べただけのものは挙げないでください。訴えを確かめるための同じ時点の客観データ（SpO2・呼吸数など）が記録に無いときは、そのことを書いてください。矛盾が見当たらない場合はその旨を一言述べてください。\n\n【S/Oデータ一覧】\n${list}\n\n指摘ごとに根拠となった発言・所見のカードを示してください。${EVIDENCE_INSTRUCTION}${AI_STYLE_INSTRUCTION}要点には、食い違いの有無と一番確かめるべきことを書いてください。` }] }]);
        const resultText = formatAiResultHtml(text, undefined, ev);
        cp.contradictionResult = resultText;
        if (finishAiResult(cp, () => { content.innerHTML = resultText; }, 'S/O矛盾チェック')) showToast('矛盾チェックが完了しました', 'success');
      } catch (err) {
        console.warn('Contradiction check error:', err);
        showAiErrorKeepingPrevious(content, cp, `チェック中にエラーが発生しました（${err.message || '通信エラー'}）。`, prevResult);
        showToast(['S/O矛盾チェックができませんでした', { text: '理由は結果の欄に出しています。時間を置いてもう一度押してください。ほかの作業はそのまま続けられます。', detail: true }], 'warn');
      }
    });

    // 「看護診断候補を提案」：ヘンダーソン項目別のアセスメント内容から看護診断の候補をAIに挙げてもらう
    // （改善案D：候補を1件ずつ選べる形にし、①の不足情報も判断材料として渡す）
    window.suggestNursingDiagnosesAI = guardAiStep('diagnosis', async function() {
      if (!(await requireApiKey('看護診断候補'))) return;
      const cp = getCurrentPatient();
      const activeItems = cp.items.filter(i => i.type !== 'unnecessary' && !isMissingInfoOnlyItem(i));
      const panel = document.getElementById('diagnosis-panel');
      const content = document.getElementById('diagnosis-content');
      if (activeItems.length === 0) return showToast('カードがありません。先にカルテを分類してください', 'warn');
      panel.classList.remove('hidden');
      content.innerHTML = `<div class="flex items-center text-[var(--ink-muted)]"><i class="fa-solid fa-spinner fa-spin mr-2"></i> アセスメント内容から看護診断候補を検討中...</div>`;
      if (!globalAppData.apiKey) {
        content.innerHTML = `<span class="text-[var(--ink-muted)]">この機能はAPIキー設定時のみ利用できます（「API設定」からGemini APIキーを登録してください）。</span>`;
        return;
      }
      const ev = buildEvidenceIndex(activeItems);
      const perNeedText = buildPerNeedEvidenceText(activeItems, ev);
      if (!perNeedText) { content.innerHTML = `<span class="text-[var(--ink-muted)]">ヘンダーソンタグが付いたカードがありません。先にタグ付けしてください。</span>`; return; }
      const missingText = buildMissingInfoText(cp);
      try {
        const text = await callGeminiAI([{ role: "user", parts: [{ text: `あなたは熟練した看護師長・指導者です。以下はヘンダーソン14の基本的欲求ごとに整理された患者のアセスメント情報です。この内容から、想定される看護診断の候補を優先度が高いと思われる順に2〜4個程度提案してください。看護診断名はNANDA-I看護診断（日本語版）の正式な名称を使い、その診断の定義と、記録にある診断指標（症状・所見）が合うものを選んでください（例：SpO2の低下などの低酸素ならガス交換障害、咳・痰・喘鳴なら非効果的気道浄化。呼吸数や呼吸のリズムの記録が無いのに非効果的呼吸パターンを選ばない）。ほかの問題の結果として起こる問題（例：息苦しさによる不眠）は、原因の問題の計画で扱えるなら別の候補にしないでください。既往・治療から起こりうるリスク型の診断（例：糖尿病と感染があれば血糖不安定リスク、発熱と摂取不足があれば体液量不足リスク）も検討してください。${AI_ACCURACY_RULES}\n\n【ヘンダーソン項目別アセスメント情報】\n${perNeedText}\n\n【不足している情報（まだ記録が無く、確認が必要なもの）】\n${missingText || '(なし)'}\n\n${ownAssessmentPromptSection(cp)}${typeof drugPromptSection === 'function' ? drugPromptSection(cp) : ''}出力は次の形式を必ず守ってください（候補ごとに「■」で始め、候補の間は空行で区切る）。\n■ 看護診断名\n根拠：アセスメント根拠の要約（${EVIDENCE_INSTRUCTION}）\n理由：この診断を挙げた理由\n不足情報：この診断を確かめるために追加で確認したい情報（あれば）\n\n前置き・あいさつは書かず、最初の行から「■」で始めてください。根拠・理由・不足情報は、それぞれ1〜2文で簡潔に書いてください。太字(**語**)以外の記号は使わないでください。` }] }]);
        const cands = parseDiagnosisCandidates(text).map((c, k) => ({ id: `dx_${Date.now().toString(36)}_${k}`, name: c.name, bodyHtml: formatAiResultHtml(c.body, '', ev) }));
        // 【AI機能の評価で発見】答えから候補を1つも読み取れなかったとき、以前は前の候補と選んだチェックを消して
        // 「完了しました」と出していた。前の候補があるときは消さずに残し、失敗として知らせる。
        if (!cands.length && (cp.diagnosisCandidates || []).length) throw new Error('AIの答えから看護診断の候補を読み取れませんでした（前の候補と選んだチェックはそのまま残しています）');
        cp.diagnosisCandidates = cands;
        cp.selectedDiagnosisIds = [];
        cp.diagnosisResult = formatAiResultHtml(text, undefined, ev); // 書き出し・形式が崩れた場合の表示用
        markAiRun(cp, 'diagnosis');
        if (finishAiResult(cp, () => { renderDiagnosisPanel(cp); renderAiSteps(cp); }, '看護診断候補')) showToast(cands.length ? `看護診断候補を${cands.length}件提案しました。計画を立てたい診断を選んでください` : '看護診断候補の提案が完了しました', 'success');
      } catch (err) {
        console.warn('Diagnosis suggestion error:', err);
        // 前の候補（と選んだチェック）は消さずに表示し直し、その上にエラーを出す
        if (getCurrentPatient().id === cp.id) {
          renderDiagnosisPanel(cp);
          const had = (cp.diagnosisCandidates || []).length || cp.diagnosisResult;
          if (had) content.insertAdjacentHTML('afterbegin', `<span class="text-[var(--brick)]">${escapeHtml(`生成中にエラーが発生しました（${err.message || '通信エラー'}）。`)}${/前の結果/.test(err.message || '') ? '' : '（前の結果をそのまま残しています）'}</span>`);
          else { document.getElementById('diagnosis-panel')?.classList.remove('hidden'); content.innerHTML = `<span class="text-[var(--brick)]">生成中にエラーが発生しました（${escapeHtml(err.message || '通信エラー')}）。</span>`; }
        }
        showToast(['看護診断候補を作れませんでした', { text: '理由は結果の欄に出しています。時間を置いてもう一度押してください。自分のアセスメント・看護計画はAIなしでも書けます。', detail: true }], 'warn');
      }
    });

    // 「経時変化サマリー」：入院前後で記録がどう変化したかをヘンダーソン項目ごとにAIが要約する
    window.generateTimelineSummaryAI = guardAiStep('timeline', async function() {
      if (!(await requireApiKey('経時変化サマリー'))) return;
      const cp = getCurrentPatient();
      const prevResult = cp.timelineResult;
      const activeItems = cp.items.filter(i => i.type !== 'unnecessary' && !isMissingInfoOnlyItem(i));
      const panel = document.getElementById('timeline-panel');
      const content = document.getElementById('timeline-content');
      panel.classList.remove('hidden');
      content.innerHTML = `<div class="flex items-center text-[var(--ink-muted)]"><i class="fa-solid fa-spinner fa-spin mr-2"></i> 入院前後の変化を要約中...</div>`;
      if (!globalAppData.apiKey) {
        content.innerHTML = `<span class="text-[var(--ink-muted)]">この機能はAPIキー設定時のみ利用できます（「API設定」からGemini APIキーを登録してください）。</span>`;
        return;
      }
      const ev = buildEvidenceIndex(activeItems);
      const perNeedText = HENDERSON_NEEDS.map(need => {
        const matching = activeItems.filter(i => i.hendersonIds?.includes(need.id));
        const pre = matching.filter(i => (i.assessmentCols?.[need.id] || 'unclassified') === 'preadmission').map(i => evidenceLine(ev, i));
        const post = matching.filter(i => (i.assessmentCols?.[need.id] || 'unclassified') === 'postadmission').map(i => evidenceLine(ev, i));
        if (pre.length === 0 && post.length === 0) return null;
        return `${need.id}. ${need.name}\n入院前:\n${pre.map(l => `- ${l}`).join('\n') || '(記録なし)'}\n入院後:\n${post.map(l => `- ${l}`).join('\n') || '(記録なし)'}`;
      }).filter(Boolean).join('\n\n');
      if (!perNeedText) { content.innerHTML = `<span class="text-[var(--ink-muted)]">入院前・入院後に振り分けられたカードがありません。総合アセスメント表で「前」「後」に分類してください。</span>`; return; }
      try {
        const text = await callGeminiAI([{ role: "user", parts: [{ text: `あなたは熟練した看護師です。以下はヘンダーソン14の基本的欲求ごとの、入院前と入院後の記録の比較です。項目ごとに入院前後でどのように変化したかを簡潔にまとめてください。変化が読み取れない項目は省略して構いません。入院前の記録が無い項目は、入院後の日ごと・時刻ごとの変化を中心に書いてください。記録に無い解釈（例：内服していることを「学び」とみなす）はしないでください。\n\n${perNeedText}\n\n詳細は項目ごとに「### 1. 呼吸」のような見出しを付け、変化を「- 」の箇条書き（1〜2文）で書いてください。要点には、入院前後で大きく変わった項目を書いてください。${EVIDENCE_INSTRUCTION}${AI_STYLE_INSTRUCTION}` }] }]);
        const resultText = formatAiResultHtml(text, undefined, ev);
        cp.timelineResult = resultText;
        if (finishAiResult(cp, () => { content.innerHTML = resultText; }, '経時変化サマリー')) showToast('経時変化サマリーを生成しました', 'success');
      } catch (err) {
        console.warn('Timeline summary error:', err);
        showAiErrorKeepingPrevious(content, cp, `生成中にエラーが発生しました（${err.message || '通信エラー'}）。`, prevResult);
        showToast(['経時変化サマリーを作れませんでした', { text: '理由は結果の欄に出しています。時間を置いてもう一度押してください。', detail: true }], 'warn');
      }
    });

    // 「看護計画を自動生成」：ヘンダーソン項目別のアセスメント内容から、観察計画(OP)・援助計画(TP)・
    // 教育計画(EP)の形で看護計画の叩き台をAIに作成してもらう。
    // 【改善案D】看護診断候補でチェックした診断があれば、その診断ごとに計画を作る。①の不足情報は
    // OPで確認する項目に含めてもらう。診断を選んでいない場合は、先に選ぶか・このまま作るかを尋ねる。
    window.generateCarePlanAI = guardAiStep('careplan', async function() {
      if (!(await requireApiKey('看護計画の叩き台'))) return;
      const cp = getCurrentPatient();
      const prevResult = cp.carePlanResult;
      const activeItems = cp.items.filter(i => i.type !== 'unnecessary' && !isMissingInfoOnlyItem(i));
      if (activeItems.length === 0) return showToast('カードがありません。先にカルテを分類してください', 'warn');
      const cands = cp.diagnosisCandidates || [];
      const selected = cands.filter(c => (cp.selectedDiagnosisIds || []).includes(c.id));
      if (selected.length === 0) {
        if (cands.length > 0) {
          const answer = await openDialog({ title: '看護診断が選ばれていません', message: '看護診断候補の中から、計画を立てたい診断にチェックを入れると、その診断に合わせた看護計画を作れます。\n選ばずに作ると、AIが看護問題を選んで作ります。', confirmLabel: 'このまま作る', secondaryLabel: '診断を選ぶ' });
          if (answer === null) return;
          if (answer === 'secondary') { document.getElementById('diagnosis-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
        } else {
          const answer = await openDialog({ title: '先に看護診断候補を出しますか？', message: '「① 不足情報の推定 → ② 看護診断候補 → ③ 看護計画」の順に進めると、自分で選んだ診断に合わせた看護計画を作れます。', confirmLabel: 'このまま看護計画を作る', secondaryLabel: '看護診断候補を先に出す' });
          if (answer === null) return;
          if (answer === 'secondary') return window.suggestNursingDiagnosesAI();
        }
      }
      const panel = document.getElementById('careplan-panel');
      const content = document.getElementById('careplan-content');
      panel.classList.remove('hidden');
      content.innerHTML = `<div class="flex items-center text-[var(--ink-muted)]"><i class="fa-solid fa-spinner fa-spin mr-2"></i> アセスメント内容から看護計画を作成中...</div>`;
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (!globalAppData.apiKey) {
        content.innerHTML = `<span class="text-[var(--ink-muted)]">この機能はAPIキー設定時のみ利用できます（「API設定」からGemini APIキーを登録してください）。</span>`;
        return;
      }
      const ev = buildEvidenceIndex(activeItems);
      const perNeedText = buildPerNeedEvidenceText(activeItems, ev);
      if (!perNeedText) { content.innerHTML = `<span class="text-[var(--ink-muted)]">ヘンダーソンタグが付いたカードがありません。先にタグ付けしてください。</span>`; return; }
      const missingText = buildMissingInfoText(cp);
      const plain = html => (html || '').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
      const target = selected.length
        ? `次の看護診断（学生が選んだもの）それぞれについて、看護計画を作成してください。これ以外の看護問題は追加しないでください。\n${selected.map((c, k) => `${k + 1}. ${c.name}\n${plain(c.bodyHtml)}`).join('\n\n')}`
        : 'この内容から、優先度の高い看護問題を1〜3個選び、それぞれについて看護計画を作成してください。';
      try {
        const text = await callGeminiAI([{ role: "user", parts: [{ text: `あなたは熟練した看護師・看護計画の指導者です。以下はヘンダーソン14の基本的欲求ごとに整理された患者のアセスメント情報です。${target}\n\n【ヘンダーソン項目別アセスメント情報】\n${perNeedText}\n\n【不足している情報（まだ記録が無く、確認が必要なもの）】\n${missingText || '(なし)'}\n\n${ownAssessmentPromptSection(cp)}${typeof drugPromptSection === 'function' ? drugPromptSection(cp) : ''}各看護問題について、長期目標・短期目標と、観察計画OP・援助計画TP・教育計画EPの3区分（各3〜5項目程度）を具体的に作成してください。\n【目標の書き方】長期目標・短期目標のどちらも必ず書き、空欄にしないでください。患者を主語にし、「いつまでに（日付・退院時など。『数日後』『近いうちに』『早期に』は不可。例：術後3日目までに、退院までに）」「何が・どうなる」「何をもって達成と判断するか（数値、できる行動、患者が言える内容）」の3つを入れます。期限は、学生が実習中に評価できる範囲（2日後・1週間後・実習最終日・退院まで）にし、『18時までに』『本日中に』『数時間後』のような時刻・当日の期限は使わないでください。『理解する』『イメージを持つ』『意識する』だけで終わらせず、『自分の言葉で説明できる』『看護師の前で実演できる』のように観察できる行動にしてください（検査値の改善のような医師の治療の成果だけを目標にしない）。\n【OPとTPの区別】OPは観察・測定・確認・状況の把握（見るもの）だけを書きます。TPは看護師が実施する援助（体位を整える、介助する、一緒に行う、環境を調整する、薬を準備するなど）だけを書きます。『〜の状況を把握する』『〜を観察する』『〜を確認する』はTPに書かず、OPに書いてください。\n【EPの書き方】『症状が現れた際の対応方法を伝える』のように一言で終わらせず、①何を説明するか（具体的な内容。例：低血糖の症状は冷や汗・手の震え・動悸で、その時はブドウ糖10gを摂り、ナースコールで知らせる）、②誰に（患者・家族）、③理解をどう確認するか（自分の言葉で説明してもらう、実演してもらう、パンフレットを見ながら一緒に確認する）までを1項目に書いてください。\n【看護問題の重複】複数の看護問題で同じ内容（例：分割食の説明と理解確認）を重ねないでください。似た問題が並ぶときは、問題ごとに目的（何を解決したいか）と達成条件を分けます（例：栄養摂取の問題は『食事量・摂取内容』、自己管理の問題は『血糖測定・インスリン調整を自分で行う力』）。同じ内容は片方の計画に書き、もう片方には書かないか『（○○の問題の計画で実施）』と書いてください。\n【予定・予防・発症済みの区別】すでに予定されている指導（栄養士の指導など）は『予定の確認・同席・補足』の計画にします。まだ起きていない合併症の予防のための計画は、発症を前提にせず『予防』の計画として書きます。すでに起きている問題は『実際の問題』として書きます。発熱時のクーリングは悪寒のあるときは避けて保温する、転倒・誤嚥を防ぐなどの安全上の注意も必要に応じて含めてください。${AI_ACCURACY_RULES}「不足している情報」のうちその問題に関係するものは、OPで確認する項目に必ず含めてください。個別性のある具体的な内容にし、一般論だけで終わらせないでください。${EVIDENCE_INSTRUCTION}\n\n出力形式：前置きは書かず、最初に「### 要点」として看護問題の優先順位と一番大事なケアを2〜3個の短い箇条書きで示してください。そのあと看護問題ごとに「### ■看護問題名」の見出しを付け、その下に「#### 長期目標」「#### 短期目標」「#### OP（観察計画）」「#### TP（援助計画）」「#### EP（教育計画）」の見出しと、番号付きの箇条書き（1項目1文）を続けてください。根拠のカードの番号は文の終わりの句点の後ろに付けてください。` }] }]);
        const resultText = formatAiResultHtml(text, undefined, ev);
        cp.carePlanResult = resultText;
        cp.carePlanDiagnoses = selected.map(c => c.name);
        markAiRun(cp, 'careplan');
        if (finishAiResult(cp, () => { content.innerHTML = resultText; renderAiSteps(cp); }, '看護計画の叩き台')) showToast(selected.length ? `選んだ${selected.length}件の看護診断で看護計画を作りました` : '看護計画を生成しました', 'success');
      } catch (err) {
        console.warn('Care plan generation error:', err);
        showAiErrorKeepingPrevious(content, cp, `生成中にエラーが発生しました（${err.message || '通信エラー'}）。`, prevResult);
        showToast(['看護計画の叩き台を作れませんでした', { text: '理由は結果の欄に出しています。時間を置いてもう一度押すか、「看護計画」タブで直接書いてください。', detail: true }], 'warn');
      }
    });

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
      return item.type !== 'unnecessary' && (!item.hendersonIds || item.hendersonIds.length === 0) && !isOtherBasicInfoItem(item);
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
    // 【AIで分類を評価（Gemini）】利用者からの要望：これまで「テキスト書き出し」をGeminiに貼って評価してもらい、
    // その結果をClaudeに伝えてプログラムを直していた。これをページの中でできるようにする。
    // 次の4つをまとめてGeminiに尋ね、決まった形（JSON）で答えを受け取る：
    //   1. ヘンダーソンの分類で間違っているところ（適切なタグは複数あってよい）
    //   2. 分類前の文章と照らし合わせて、時系列（日時）が正しく整理できているか
    //   3. 情報の抜き出しでおかしいところ（まとめたほうがいい・分けたほうがいい・抜けている）
    //   4. タグ未設定のカードに付けるべきタグ
    // 結果は1件ずつ「適用」でき、未設定のタグはまとめて適用できる。また「改善点ファイル」（Markdown）として
    // 保存でき、そのファイルをClaudeに渡すとプログラム側（自動分類のルール）の修正に使える。
    // APIキーはこのブラウザの中だけで使い、送る文章は他のAI機能と同じく個人情報を伏せ字にしてから送る。
    // ==========================================================================
    const AI_REVIEW_KINDS = { merge: 'まとめる', split: '分ける', missing: '抜けている', type: 'S/Oの誤り', unnecessary: '不要', other: 'その他' };
    function buildAiReviewPrompt(cp, ev, items) {
      const needList = HENDERSON_NEEDS.map(n => `${n.id}.${n.name.replace(/^\d+\.\s*/, '')}`).join(' / ');
      const cardLines = items.map(i => {
        const tags = (i.hendersonIds || []).slice().sort((a, b) => a - b);
        const tagText = tags.length ? tags.join(',') : 'タグ未設定';
        return `${evidenceLine(ev, i)} {タグ:${tagText}}`;
      }).join('\n');
      let notebook = '';
      try { notebook = buildEffectiveNotebookContent(); } catch (e) { notebook = ''; }
      return `あなたは看護教育に精通した看護師です。看護学生が患者の記録（分類前の文章）を、アプリで情報カードに分けて、S（患者の発言）／O（観察・測定値・記録）とヘンダーソンの14の基本的欲求のタグに分類しました。この分類を評価してください。

【ヘンダーソンの14項目】${needList}

【この授業での分類の基準（基準ノート）】
${notebook.slice(0, 12000)}

【分類前の文章】
${(cp.sourceText || '').slice(0, 20000)}

【分類後の情報カード】（〔C番号〕[S/O][日時] 本文 {タグ:番号}）
${cardLines}

次の4つを評価し、指定のJSONだけを出力してください（前置き・コードブロックの記号は不要）。看護学生が読んで納得できるよう、やさしく具体的な日本語で書いてください。
1. tagIssues：ヘンダーソンの分類（タグ）が間違っている、または足りないカード。適切なタグは複数あってよい。suggestedはそのカードに付けるべきタグの番号の全体（今のタグも含めて最終的な形）。
2. timeline：分類前の文章と照らし合わせて、時系列（カードの日時）が正しく整理できているか。issuesに日時が間違っているカード（suggestedTimestampは「術後1日目 12:00」のように日＋時刻、または「入院前」「入院時」「術前」等）。
3. extractionIssues：情報の抜き出しの問題。kindは merge（複数のカードを1つにまとめるべき。mergedTextにまとめた文）／split（1つのカードを分けるべき。partsに分けた後の文を{"type":"s"か"o","text":"…"}の配列で）／missing（分類前の文章にあるのにカードに無い情報。textに抜けている文）／type（SとOの誤り。suggestedTypeに"s"か"o"）／unnecessary（不要な情報なのにカードになっている）／other。SとOに分けるときは、発言だけでは何の場面か分からなくならないよう、Sの文に（場面：…）を添えてください。
4. untagged：{タグ:タグ未設定}のカードすべてについて、付けるべきタグ。14項目にどうしても当てはまらない場合はsuggestedを空にしてreasonに理由を書く。

各項目には次の文章も付けてください。
・overview：全体の総評（2〜4文。よくできている点と、主な課題）。
・各項目の summary：その項目の評価のまとめ（1〜3文。問題が無ければ「問題ありません」とその理由）。
・各指摘の title：何についての指摘か分かる短い見出し（例：「術後1日目の昼食」「入院時の様子」）。
・各指摘の current：今どうなっているか（現状）を1文で。
・各指摘の reason：なぜそう直すと良いのか（アセスメントの観点から）を1〜2文で。
・advice：時系列の整理・S/Oの分け方・情報のまとめ方などについての、改善のためのアドバイス（箇条書き3つ程度）。
問題が無い項目は items を空の配列にしてください。cardsやcardには一覧の〔C番号〕の番号（"C12"の形）だけを使い、一覧に無い番号は作らないでください。

{"overview":"",
 "tagIssues":{"summary":"","items":[{"card":"C1","title":"","current":"","currentTags":[1],"suggested":[1,9],"reason":""}]},
 "timeline":{"summary":"","items":[{"card":"C5","title":"","current":"12:00","suggestedTimestamp":"術後1日目 12:00","reason":""}]},
 "extractionIssues":{"summary":"","items":[{"kind":"split","cards":["C3"],"title":"","current":"","mergedText":"","parts":[{"type":"s","text":""},{"type":"o","text":""}],"text":"","suggestedType":"","reason":""}]},
 "untagged":{"summary":"","items":[{"card":"C9","title":"","suggested":[9],"reason":""}]},
 "advice":[""]}`;
    }
    function parseAiReviewJson(text) {
      const raw = (text || '').replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start === -1 || end <= start) throw new Error('AIの答えを読み取れませんでした（JSONではありません）');
      let obj;
      try { obj = JSON.parse(raw.slice(start, end + 1)); } catch (e) {
        obj = typeof parseAiJsonLoose === 'function' ? parseAiJsonLoose(raw) : undefined;
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('AIの答えを読み取れませんでした（JSONの形が崩れています）');
      }
      const tagList = v => (Array.isArray(v) ? v : []).map(Number).filter(n => n >= 1 && n <= 14);
      const code = v => (String(v || '').match(/C\s*\d{1,4}/i) || [''])[0].replace(/\s+/g, '').toUpperCase();
      const str = v => String(v || '').trim();
      // 各項目は {summary, items:[...]} の形（以前の形＝配列だけ、にも対応する）
      const sec = v => (Array.isArray(v) ? { summary: '', items: v } : { summary: str(v && v.summary), items: (v && (v.items || v.issues)) || [] });
      const tagSec = sec(obj.tagIssues), timeSec = sec(obj.timeline), extSec = sec(obj.extractionIssues), untagSec = sec(obj.untagged);
      return {
        overview: str(obj.overview),
        advice: (Array.isArray(obj.advice) ? obj.advice : [obj.advice]).map(str).filter(Boolean),
        tagIssues: tagSec.items.map(x => ({ card: code(x.card), title: str(x.title), currentText: typeof x.current === 'string' ? str(x.current) : '', current: tagList(x.currentTags || (Array.isArray(x.current) ? x.current : [])), suggested: tagList(x.suggested), reason: str(x.reason) })).filter(x => x.card),
        tagSummary: tagSec.summary,
        timeline: {
          summary: timeSec.summary,
          issues: timeSec.items.map(x => ({ card: code(x.card), title: str(x.title), current: str(x.current), suggestedTimestamp: str(x.suggestedTimestamp), reason: str(x.reason) })).filter(x => x.card && x.suggestedTimestamp)
        },
        extractionIssues: extSec.items.map(x => ({
          kind: AI_REVIEW_KINDS[x.kind] ? x.kind : 'other',
          cards: (Array.isArray(x.cards) ? x.cards : [x.card]).map(code).filter(Boolean),
          title: str(x.title), current: str(x.current),
          mergedText: str(x.mergedText),
          parts: (Array.isArray(x.parts) ? x.parts : []).map(p => (typeof p === 'string' ? { type: '', text: str(p) } : { type: p && (p.type === 's' || p.type === 'o') ? p.type : '', text: str(p && p.text) })).filter(p => p.text),
          text: str(x.text), suggestedType: x.suggestedType === 's' || x.suggestedType === 'o' ? x.suggestedType : '', reason: str(x.reason)
        })),
        extractionSummary: extSec.summary,
        untagged: untagSec.items.map(x => ({ card: code(x.card), title: str(x.title), suggested: tagList(x.suggested), reason: str(x.reason) })).filter(x => x.card),
        untaggedSummary: untagSec.summary
      };
    }
    // 評価したときのカードの一覧（〔C番号〕→カードのid）。カードが後で消えた・変わった場合は「適用」できない
    function aiReviewItemOf(cp, review, codeStr) {
      const id = review && review.codes ? review.codes[codeStr] : null;
      return id ? (cp.items || []).find(i => i.id === id) : null;
    }
    const tagNamesOf = ids => (ids || []).length ? ids.slice().sort((a, b) => a - b).map(h => `${h}.${hendersonNameOf(h).replace(/^\d+\.\s*/, '')}`).join('・') : '（なし）';

    window.openAiReview = function() {
      document.getElementById('modal-ai-review').classList.remove('hidden');
      renderAiReview();
    };
    window.closeAiReview = function() {
      document.getElementById('modal-ai-review').classList.add('hidden');
      renderSoBoard();
      if (!document.getElementById('view-assessment').classList.contains('hidden')) renderAssessmentTable();
    };
    window.runAiReview = guardAiStep('review', async function() {
      const cp = getCurrentPatient();
      const items = (cp.items || []).filter(i => i.type !== 'unnecessary' && !isMissingInfoOnlyItem(i));
      if (!items.length) return showToast('カードがありません。先に「分類開始」で分類してください', 'warn');
      if (!(cp.sourceText || '').trim()) return showToast('分類前の文章がありません（入力欄の文章と照らし合わせて評価します）', 'warn');
      if (!globalAppData.apiKey) { requireApiKey('分類をAIで評価'); return; }
      const body = document.getElementById('ai-review-body');
      body.innerHTML = `<div class="flex items-center gap-2 text-[var(--ink-muted)] text-xs p-4"><i class="fa-solid fa-spinner fa-spin"></i> Geminiが分類を評価しています（1〜2分かかることがあります）…</div>`;
      const ev = buildEvidenceIndex(items);
      try {
        const text = await callGeminiAI([{ role: 'user', parts: [{ text: buildAiReviewPrompt(cp, ev, items) }] }], { json: true });
        const result = parseAiReviewJson(text);
        const codes = {};
        ev.byCode.forEach((c, k) => { codes[k] = c.id; });
        cp.aiReview = { at: new Date().toISOString(), result, codes, applied: {} };
        // 【レビューで発見】以前は評価の途中で患者を切り替えると、結果は元の患者に入るのに、保存・共有先への送信は
        // 切り替え先の患者の分だけ行われていた。ほかのAIと同じく finishAiResult で、頼んだ患者に保存する。
        if (finishAiResult(cp, () => renderAiReview(), '分類の評価')) showToast('評価が完了しました', 'success');
      } catch (err) {
        console.warn('AI review error:', err);
        if (getCurrentPatient().id === cp.id) body.innerHTML = `<div class="text-[var(--brick)] text-xs p-4">評価中にエラーが発生しました（${escapeHtml(err.message || '通信エラー')}）。もう一度お試しください。</div>`;
        else showToast(`「${cp.title || ''}」の分類の評価ができませんでした（${err.message || '通信エラー'}）`, 'warn');
      }
    });
    // 1件ずつの「適用」。key は結果の中の位置（'tag:3' 'time:0' 'ext:2' 'untag:5'）
    function markAiReviewApplied(cp, key) {
      if (!cp.aiReview) return;
      cp.aiReview.applied = { ...(cp.aiReview.applied || {}), [key]: true };
    }
    // タグを提案どおりにする（学習にも「この文章にはこのタグ」として反映する。手で付け外ししたときと同じ）
    function setItemTagsFromAi(item, tags) {
      const before = (item.hendersonIds || []).slice();
      const next = Array.from(new Set(tags)).sort((a, b) => a - b);
      const learned = globalAppData.learningUserDict[item.text] = { ...globalAppData.learningUserDict[item.text] };
      learned.hendersonVotes = { ...(learned.hendersonVotes || {}) };
      item.assessmentCols = item.assessmentCols || {};
      const col = inferAssessmentColumn(item.fieldLabel, item.timestamp, item.admissionPhase) || 'unclassified';
      next.filter(h => !before.includes(h)).forEach(h => {
        item.assessmentCols[h] = col;
        learned.hendersonVotes[h] = (learned.hendersonVotes[h] || 0) + 1;
        reportLearningEvent(item.text, 'tagAdd', { hendersonId: h, voteCount: learned.hendersonVotes[h], source: 'aiReview' });
      });
      before.filter(h => !next.includes(h)).forEach(h => {
        delete item.assessmentCols[h];
        learned.hendersonVotes[h] = Math.max(0, (learned.hendersonVotes[h] || 0) - 1);
        reportLearningEvent(item.text, 'tagRemove', { hendersonId: h, voteCount: learned.hendersonVotes[h], source: 'aiReview' });
      });
      learned.preferredHendersonIds = Object.entries(learned.hendersonVotes).filter(([, c]) => c > 0).map(([k]) => Number(k));
      item.hendersonIds = next;
      item.patientBackground = null;
      item.predictionSource = 'confirmed';
      logItemEdit(item, { kind: 'aiReviewTags', from: before, to: next });
      touchItem(item);
    }
    window.applyAiReviewItem = function(key, silent) {
      const cp = getCurrentPatient();
      const review = cp.aiReview;
      if (!review) return false;
      const [kind, idxStr] = key.split(':');
      const idx = Number(idxStr);
      const r = review.result;
      let ok = false;
      if (kind === 'tag' || kind === 'untag') {
        const s = (kind === 'tag' ? r.tagIssues : r.untagged)[idx];
        const item = s && aiReviewItemOf(cp, review, s.card);
        if (item && s.suggested.length) { setItemTagsFromAi(item, s.suggested); ok = true; }
      } else if (kind === 'time') {
        const s = r.timeline.issues[idx];
        const item = s && aiReviewItemOf(cp, review, s.card);
        if (item) {
          logItemEdit(item, { kind: 'aiReviewTimestamp', from: item.timestamp, to: s.suggestedTimestamp });
          item.timestamp = s.suggestedTimestamp;
          touchItem(item);
          ok = true;
        }
      } else if (kind === 'ext') {
        ok = applyAiExtractionIssue(cp, review, r.extractionIssues[idx]);
      }
      if (ok) {
        markAiReviewApplied(cp, key);
        saveDataAndSync();
        if (!silent) { renderAiReview(); showToast('提案を適用しました（元に戻すときは、カードを直接編集してください）', 'success'); }
      } else if (!silent) {
        showToast('このカードは評価の後に消えたか変わったため、適用できません', 'warn');
      }
      return ok;
    };
    function applyAiExtractionIssue(cp, review, s) {
      if (!s) return false;
      const targets = s.cards.map(c => aiReviewItemOf(cp, review, c)).filter(Boolean);
      const newCard = (text, base) => {
        const chunk = { text, timestamp: base.timestamp, fieldLabel: base.fieldLabel, admissionPhase: base.admissionPhase };
        const { detectedHIds, predictedType } = computeLocalTagsAndType(chunk, text, null);
        const col = inferAssessmentColumn(base.fieldLabel, base.timestamp, base.admissionPhase) || 'unclassified';
        const cols = {};
        detectedHIds.forEach(h => { cols[h] = col; });
        return { id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6), text, timestamp: base.timestamp || '日時不明', type: predictedType === 'unnecessary' ? (base.type || 'o') : predictedType,
          hendersonIds: detectedHIds, assessmentCols: cols, fieldLabel: base.fieldLabel || null, admissionPhase: base.admissionPhase, predictionSource: 'confirmed',
          editLog: [{ at: new Date().toISOString(), kind: 'aiReview', from: targets.map(t => t.text) }], _touchedAt: new Date().toISOString() };
      };
      if (s.kind === 'merge' && targets.length >= 2 && s.mergedText) {
        const first = targets[0];
        const merged = newCard(s.mergedText, first);
        merged.type = targets.some(t => t.type === 's') && targets.every(t => t.type === 's') ? 's' : merged.type;
        merged.hendersonIds = Array.from(new Set([...merged.hendersonIds, ...targets.flatMap(t => t.hendersonIds || [])])).sort((a, b) => a - b);
        targets.forEach(t => Object.entries(t.assessmentCols || {}).forEach(([h, c]) => { if (merged.hendersonIds.includes(Number(h))) merged.assessmentCols[h] = c; }));
        const at = cp.items.indexOf(first);
        cp.items = cp.items.filter(i => !targets.includes(i));
        targets.forEach(t => markItemDeleted(cp, t.id));
        cp.items.splice(Math.min(at, cp.items.length), 0, merged);
        reportLearningEvent(merged.text, 'merge', { sourceTexts: targets.map(t => t.text), source: 'aiReview' });
        return true;
      }
      if (s.kind === 'split' && targets.length === 1 && s.parts.length >= 2) {
        const base = targets[0];
        const parts = s.parts.map(p => { const c = newCard(p.text, base); if (p.type) c.type = p.type; return c; });
        const at = cp.items.indexOf(base);
        cp.items.splice(at, 1, ...parts);
        markItemDeleted(cp, base.id);
        reportLearningEvent(base.text, 'edit', { splitInto: s.parts.map(p => p.text), source: 'aiReview' });
        return true;
      }
      if (s.kind === 'missing' && s.text) {
        const base = targets[0] || { timestamp: '日時不明', type: 'o' };
        const card = newCard(s.text, base);
        const at = targets[0] ? cp.items.indexOf(targets[0]) + 1 : cp.items.length;
        cp.items.splice(at, 0, card);
        return true;
      }
      if (s.kind === 'type' && targets.length && s.suggestedType) {
        targets.forEach(t => { logItemEdit(t, { kind: 'aiReviewType', from: t.type, to: s.suggestedType }); t.type = s.suggestedType; t.predictionSource = 'confirmed'; touchItem(t); reportLearningEvent(t.text, 'type', { type: s.suggestedType, source: 'aiReview' }); });
        return true;
      }
      if (s.kind === 'unnecessary' && targets.length) {
        targets.forEach(t => { logItemEdit(t, { kind: 'aiReviewType', from: t.type, to: 'unnecessary' }); t.type = 'unnecessary'; touchItem(t); reportLearningEvent(t.text, 'type', { type: 'unnecessary', source: 'aiReview' }); });
        return true;
      }
      return false;
    }
    // 「まとめて適用」（section: 'untag'＝未設定のタグ／'tag'＝タグの誤り／'time'＝日時）
    window.applyAiReviewSection = async function(section) {
      const cp = getCurrentPatient();
      const r = cp.aiReview && cp.aiReview.result;
      if (!r) return;
      const list = section === 'untag' ? r.untagged : section === 'tag' ? r.tagIssues : r.timeline.issues;
      const keys = list.map((x, k) => `${section}:${k}`).filter(k => !(cp.aiReview.applied || {})[k]);
      if (!keys.length) return showToast('適用できる提案はもうありません', 'info');
      const label = section === 'untag' ? '未設定のタグ' : section === 'tag' ? 'タグの修正' : '日時の修正';
      const okd = await openDialog({ title: `${label}をまとめて適用`, message: `${keys.length}件の提案をまとめて適用します。適用した内容は学習にも反映されます。よろしいですか？`, confirmLabel: 'まとめて適用' });
      if (okd !== true) return;
      let n = 0;
      keys.forEach(k => { if (applyAiReviewItem(k, true)) n++; });
      saveDataAndSync();
      renderAiReview();
      showToast(`${n}件の提案を適用しました`, 'success');
    };

    function renderAiReview() {
      const body = document.getElementById('ai-review-body');
      const cp = getCurrentPatient();
      const review = cp.aiReview;
      const meta = document.getElementById('ai-review-meta');
      if (meta) meta.textContent = review ? `前回の評価：${new Date(review.at).toLocaleString('ja-JP')}` : '';
      document.getElementById('btn-ai-review-download').disabled = !review;
      if (!review) {
        body.innerHTML = `<div class="ai-review-empty">
          <p><b>「評価する」</b>を押すと、Geminiに次の4つをまとめて尋ねます。</p>
          <ol><li>ヘンダーソンの分類（タグ）で間違っているところ</li><li>分類前の文章と照らし合わせた時系列（日時）の整理</li><li>情報の抜き出しでおかしいところ（まとめる・分ける・抜け）</li><li>タグ未設定のカードに付けるタグ</li></ol>
          <p class="note">結果は1件ずつ、またはまとめて適用できます。「改善点ファイルを保存」で保存したファイルをClaudeに渡すと、自動分類のルールそのものを直せます。送る文章は個人情報を伏せ字にしてから送ります。</p></div>`;
        return;
      }
      const r = review.result;
      const applied = review.applied || {};
      const itemOf = c => aiReviewItemOf(cp, review, c);
      const chip = codeStr => {
        const item = itemOf(codeStr);
        if (!item) return `<span class="ai-review-chip gone" title="評価の後に消えたか変わったカード">${escapeHtml(codeStr)}</span>`;
        const label = item.type === 's' ? 'S' : (item.type === 'o' ? 'O' : '・');
        return `<button class="ai-review-chip" onclick="closeAiReview(); jumpToBoardCard('${safeDomId(item.id)}')" title="分類ボードのこのカードへ移動">${label} ${escapeHtml(codeStr)}</button>`;
      };
      const quoteCard = codeStr => { const item = itemOf(codeStr); return item ? `<div class="ai-review-quote">${chip(codeStr)}${item.timestamp && item.timestamp !== '日時不明' ? `<span class="ai-review-time">[${escapeHtml(item.timestamp)}]</span>` : ''}${escapeHtml(item.text)}</div>` : `<div class="ai-review-quote">${chip(codeStr)}</div>`; };
      const applyBtn = (key, enabled = true) => applied[key]
        ? '<span class="ai-review-done"><i class="fa-solid fa-check"></i> 適用済み</span>'
        : (enabled ? `<button class="ai-review-apply" onclick="applyAiReviewItem('${key}')"><i class="fa-solid fa-check"></i> この修正案を適用</button>` : '');
      // 1件の指摘：見出し → 現状（カードの本文）→ 修正案 → 理由（Geminiの文章に近い、読み物としての並び）
      const block = ({ title, current, proposal, reason, key, canApply }) => `<li class="ai-review-item">
        ${title ? `<div class="ai-review-title">${escapeHtml(title)}</div>` : ''}
        <div class="ai-review-row"><span class="ai-review-label">現状</span><div>${current}</div></div>
        <div class="ai-review-row"><span class="ai-review-label fix">修正案</span><div>${proposal}</div></div>
        ${reason ? `<div class="ai-review-row"><span class="ai-review-label why">理由</span><div class="ai-review-reason">${escapeHtml(reason)}</div></div>` : ''}
        <div class="ai-review-actions">${applyBtn(key, canApply)}</div>
      </li>`;
      const tagDiff = (from, to) => {
        const added = to.filter(h => !from.includes(h)), removed = from.filter(h => !to.includes(h));
        const keep = to.filter(h => from.includes(h));
        const nm = h => `${h}.${escapeHtml(hendersonNameOf(h).replace(/^\d+\.\s*/, ''))}`;
        return [...keep.map(h => `<span class="tg">${nm(h)}</span>`), ...added.map(h => `<span class="tg add">＋${nm(h)}</span>`), ...removed.map(h => `<span class="tg del">－${nm(h)}</span>`)].join(' ') || '（なし）';
      };
      const section = (no, title, count, summary, inner, bulk) => `<section class="ai-review-sec">
        <h3><span class="no">${no}</span>${title}<span class="count">指摘 ${count}件</span>${bulk || ''}</h3>
        ${summary ? `<p class="ai-review-summary">${escapeHtml(summary)}</p>` : ''}
        ${inner ? `<ul>${inner}</ul>` : (summary ? '' : '<p class="ai-review-none">指摘はありません。</p>')}
      </section>`;
      const bulkBtn = (sec, list) => list.length ? `<button class="ai-review-bulk" onclick="applyAiReviewSection('${sec}')"><i class="fa-solid fa-check-double"></i> まとめて適用</button>` : '';
      const tagHtml = r.tagIssues.map((x, k) => {
        const item = itemOf(x.card);
        const cur = x.current.length ? x.current : ((item && item.hendersonIds) || []);
        return block({ title: x.title, key: `tag:${k}`, canApply: x.suggested.length > 0, reason: x.reason,
          current: `${quoteCard(x.card)}${x.currentText ? `<div class="ai-review-note">${escapeHtml(x.currentText)}</div>` : ''}<div class="ai-review-tags">今のタグ：${tagDiff(cur, cur)}</div>`,
          proposal: `<div class="ai-review-tags">${tagDiff(cur, x.suggested)}</div>` });
      }).join('');
      const timeHtml = r.timeline.issues.map((x, k) => block({ title: x.title, key: `time:${k}`, reason: x.reason,
        current: `${quoteCard(x.card)}<div class="ai-review-note">日時：${escapeHtml(x.current || '（日時なし）')}</div>`,
        proposal: `日時を <b>${escapeHtml(x.suggestedTimestamp)}</b> にする` })).join('');
      const extHtml = r.extractionIssues.map((x, k) => {
        const soLabel = t => (t === 's' ? '<span class="so s">Sデータ</span>' : t === 'o' ? '<span class="so o">Oデータ</span>' : '');
        const proposal = x.kind === 'merge' && x.mergedText ? `次の1枚にまとめる：<div class="ai-review-new">${escapeHtml(x.mergedText)}</div>`
          : x.kind === 'split' && x.parts.length ? `次のように分ける：${x.parts.map(p => `<div class="ai-review-new">${soLabel(p.type)}${escapeHtml(p.text)}</div>`).join('')}`
          : x.kind === 'missing' && x.text ? `次のカードを追加する：<div class="ai-review-new">${escapeHtml(x.text)}</div>`
          : x.kind === 'type' && x.suggestedType ? `${soLabel(x.suggestedType)}にする`
          : x.kind === 'unnecessary' ? '不要な情報にする' : '（下の理由を参考に、手で直してください）';
        const canApply = (x.kind === 'merge' && x.mergedText && x.cards.length >= 2) || (x.kind === 'split' && x.parts.length >= 2) || (x.kind === 'missing' && x.text) || (x.kind === 'type' && x.suggestedType) || x.kind === 'unnecessary';
        return block({ title: `【${AI_REVIEW_KINDS[x.kind]}】${x.title || ''}`, key: `ext:${k}`, canApply, reason: x.reason,
          current: `${x.cards.map(quoteCard).join('')}${x.current ? `<div class="ai-review-note">${escapeHtml(x.current)}</div>` : ''}`, proposal });
      }).join('');
      const untagHtml = r.untagged.map((x, k) => block({ title: x.title, key: `untag:${k}`, canApply: x.suggested.length > 0, reason: x.reason,
        current: `${quoteCard(x.card)}<div class="ai-review-tags">今のタグ：（未設定）</div>`,
        proposal: x.suggested.length ? `<div class="ai-review-tags">${tagDiff([], x.suggested)}</div>` : '14項目に当てはまらない（「追加キーワード」で決める）' })).join('');
      body.innerHTML =
        (r.overview ? `<div class="ai-review-overview"><div class="ai-review-overview-title"><i class="fa-solid fa-comment-medical"></i> 総評</div>${escapeHtml(r.overview)}</div>` : '') +
        section(1, 'ヘンダーソンの分類で間違っているところ', r.tagIssues.length, r.tagSummary, tagHtml, bulkBtn('tag', r.tagIssues)) +
        section(2, '時系列の整理', r.timeline.issues.length, r.timeline.summary, timeHtml, bulkBtn('time', r.timeline.issues)) +
        section(3, '情報の抜き出し（分けたほうがいい・まとめたほうがいいところ）', r.extractionIssues.length, r.extractionSummary, extHtml) +
        section(4, 'タグ未設定のカード', r.untagged.length, r.untaggedSummary, untagHtml, bulkBtn('untag', r.untagged)) +
        ((r.advice || []).length ? `<section class="ai-review-sec"><h3><span class="no"><i class="fa-solid fa-lightbulb"></i></span>改善のためのアドバイス</h3><ul class="ai-review-advice">${r.advice.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul></section>` : '');
    }

    // 「改善点ファイル」：Geminiの評価をClaudeに渡すためのMarkdown。カードの本文・今の分類・提案・理由をまとめ、
    // 分類前の文章も付ける（Claudeはこれを読んで、自動分類のルールそのもの＝プログラムを直す）
    function buildAiReviewMarkdown(cp) {
      const review = cp.aiReview;
      if (!review) return '';
      const r = review.result;
      const line = codeStr => {
        const item = aiReviewItemOf(cp, review, codeStr);
        return item ? `${codeStr} [${(item.type || '').toUpperCase()}][${item.timestamp || '日時不明'}] ${item.text} {タグ:${tagNamesOf(item.hendersonIds)}}` : `${codeStr}（評価の後に消えたカード）`;
      };
      const done = key => ((review.applied || {})[key] ? '（アプリで適用済み）' : '');
      let md = `# 改善点ファイル：${cp.title || ''}\n\n- 評価：Gemini（${new Date(review.at).toLocaleString('ja-JP')}）\n- アプリの版：${(document.querySelector('meta[name="app-version"]') || {}).content || '-'}\n- このファイルをClaudeに渡すと、自動分類のルール（プログラム）の修正に使えます。\n\n`;
      if (r.overview) md += `## 総評\n\n${r.overview}\n\n`;
      const item = (title, cards, currentNote, proposal, reason, key) => `### ${title || cards.join('・')}${done(key)}\n\n- 現状：\n${cards.map(c => `  - ${line(c)}`).join('\n')}${currentNote ? `\n  - ${currentNote}` : ''}\n- 修正案：${proposal}\n- 理由：${reason}\n`;
      md += `## 1. ヘンダーソンの分類で間違っているところ\n\n${r.tagSummary ? `${r.tagSummary}\n\n` : ''}${r.tagIssues.map((x, k) => item(x.title, [x.card], x.currentText, `${tagNamesOf(x.current)} → ${tagNamesOf(x.suggested)}`, x.reason, `tag:${k}`)).join('\n') || '指摘なし\n'}\n`;
      md += `## 2. 時系列の整理\n\n${r.timeline.summary ? `${r.timeline.summary}\n\n` : ''}${r.timeline.issues.map((x, k) => item(x.title, [x.card], `日時：${x.current || '（日時なし）'}`, `日時を「${x.suggestedTimestamp}」にする`, x.reason, `time:${k}`)).join('\n') || '指摘なし\n'}\n`;
      md += `## 3. 情報の抜き出し\n\n${r.extractionSummary ? `${r.extractionSummary}\n\n` : ''}${r.extractionIssues.map((x, k) => item(`【${AI_REVIEW_KINDS[x.kind]}】${x.title || ''}`, x.cards, x.current,
        x.mergedText ? `次の1枚にまとめる：${x.mergedText}` : x.parts.length ? `次のように分ける：${x.parts.map(p => `${p.type ? `【${p.type === 's' ? 'Sデータ' : 'Oデータ'}】` : ''}${p.text}`).join(' ／ ')}` : x.text ? `次のカードを追加する：${x.text}` : x.suggestedType ? `${x.suggestedType.toUpperCase()}にする` : x.kind === 'unnecessary' ? '不要な情報にする' : '（理由を参照）',
        x.reason, `ext:${k}`)).join('\n') || '指摘なし\n'}\n`;
      md += `## 4. タグ未設定のカード\n\n${r.untaggedSummary ? `${r.untaggedSummary}\n\n` : ''}${r.untagged.map((x, k) => item(x.title, [x.card], '', tagNamesOf(x.suggested), x.reason, `untag:${k}`)).join('\n') || '指摘なし\n'}\n`;
      if ((r.advice || []).length) md += `## 改善のためのアドバイス\n\n${r.advice.map(a => `- ${a}`).join('\n')}\n\n`;
      md += `## 分類前の文章\n\n\`\`\`\n${cp.sourceText || ''}\n\`\`\`\n`;
      return md;
    }
    window.downloadAiReview = function() {
      const cp = getCurrentPatient();
      const md = buildAiReviewMarkdown(cp);
      if (!md) return showToast('先に「評価する」を押してください', 'warn');
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
      a.download = `改善点_${(cp.title || 'カルテ').replace(/[\\/:*?"<>|]/g, '_')}_${stamp}.md`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      showToast('改善点ファイルを保存しました。このファイルをClaudeに渡すとプログラムを直せます', 'success');
    };

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
