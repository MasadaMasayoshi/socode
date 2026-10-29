// 臨床の根拠の検証（疾患・年齢・診療科に依存しない共通の仕組み）。
// ① 欲求ごとの判定が引用する根拠が、本当に元のカードに書かれているかを確かめる（出典のないものは根拠に使わない）
// ② 経過（改善傾向・悪化傾向・変化なし・経過不明）を、日ごとの記録から別の属性として付ける
// ③ 食事・排泄・清潔などを「できること／実際の状態／不快・安全」の側面に分けて見る
// ④ 看護問題の根拠が、その問題に関係する記録かを確かめる（否定された所見・無関係なカードは根拠にしない）
// ⑤ 検査値の単位の誤りを見つける（元の値は直さない）
// 元の表示カードは変えない。判定の4区分（充足・未充足・判定保留・情報不足）も増やさない。

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['19'] = 'v.245'; // Version stamp (scripts/stamp-version.js)

    const cvNorm = t => String(t || '').normalize('NFKC');
    const cvPlain = t => cvNorm(t).replace(/[「」『』\s]/g, '');

    // 否定された所見（「嘔気・嘔吐なし」など）は、あるものとして数えない
    function cvAffirmed(re, text) {
      if (typeof rmPositiveMatch === 'function') return !!rmPositiveMatch(re, text);
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'); const t = cvNorm(text); let m;
      while ((m = g.exec(t)) !== null) { const rest = t.slice(m.index + m[0].length).split(/[。\n]/)[0]; if (!/^[^、。]{0,6}?(?:なし|無し|ない|認めず|みられず|陰性)/.test(rest)) return m; }
      return null;
    }

    // ---- ① 根拠の出典確認 ----
    function cvTraceable(factText, item) {
      const f = cvPlain(factText), t = cvPlain(item && item.text);
      if (!f || !t) return false;
      if (t.includes(f)) return true;
      if (f.length <= 2) return false;
      const grams = []; for (let k = 0; k < f.length - 1; k++) grams.push(f.slice(k, k + 2));
      return grams.filter(g => t.includes(g)).length / grams.length >= 0.5 || t.includes(f.slice(0, 3));
    }
    // 「貧血・出血（入院時→術後1日目）」のような表の見出しだけのカードは、所見ではない
    function cvHeadingOnly(item) {
      const t = cvNorm(item && item.text).trim();
      return /^[^\d]{1,30}[（(](?:入院時|術前|術後|入院前)[^）)]{0,12}→[^）)]{0,16}[）)]$/.test(t);
    }
    // その欲求とは別の領域の動作・状態を述べた一文は、その欲求の判定根拠にしない（例：食事の判定に「端坐位になり」を使わない）
    const CV_CLAUSE_OFFTOPIC = {
      2: { off: /端坐位|起き上が|起立|歩行|移乗|立位|寝返り|ADL/, need: /摂取|食べ|食欲|食事量|割|嚥下|むせ|栄養|水分/ },
      3: { off: /端坐位|起き上が|歩行|移乗|立位|寝返り/, need: /排尿|排便|尿|便|トイレ|排泄|ガス|腸/ },
      8: { off: /端坐位|起き上が|歩行|立位/, need: /入浴|清拭|更衣|洗髪|皮膚|創|発赤|清潔|整容|口腔/ }
    };
    function cvOffTopic(needId, text) { const r = CV_CLAUSE_OFFTOPIC[needId]; const t = cvNorm(text); return !!r && r.off.test(t) && !r.need.test(t); }
    function cvTraceableNeedWord(needId, text) { const r = CV_CLAUSE_OFFTOPIC[needId]; return !r || r.need.test(cvNorm(text)); }
    function cvValidateSufficiency(cp, res) {
      const by = new Map((cp.items || []).map(i => [String(i.id), i]));
      Object.keys(res || {}).forEach(nid => Object.keys(res[nid] || {}).forEach(ph => {
        const r = res[nid][ph];
        if (!r || !r.facts || (!(r.facts.against || []).length && !(r.facts.for || []).length)) return;
        const bad = [];
        const keep = list => (list || []).filter(f => {
          const it = by.get(String(f.id));
          const why = !it ? '元のカードが見つからない' : cvOffTopic(Number(nid), f.text) ? 'その欲求とは別の領域の記述' : cvOffTopic(Number(nid), it.text) && !cvTraceableNeedWord(Number(nid), f.text) ? 'その欲求とは別の領域の記述' : cvHeadingOnly(it) ? '表の見出しだけで所見ではない' : (!f.ref && !cvTraceable(f.text, it)) ? '引用した語が元のカードに書かれていない' : '';
          if (why) bad.push({ id: f.id, text: f.text, why });
          return !why;
        });
        r.facts.against = keep(r.facts.against); r.facts.for = keep(r.facts.for);
        if (!bad.length) return;
        r.invalidatedEvidence = bad;
        const A = r.facts.against.length, F = r.facts.for.length;
        const quote = l => l.slice(0, 3).map(f => `「${String(f.text).slice(0, 30)}」`).join('');
        if (!A && !F) { r.verdict = 'unknown'; r.reason = ''; r.evidence = []; r.need = '判定の根拠として使える記録が確認できない'; delete r.needsConfirmation; return; }
        if (r.verdict === 'unmet' && !A) r.verdict = F ? 'met' : 'unknown';
        else if (r.verdict === 'met' && !F) r.verdict = A ? 'unmet' : 'unknown';
        else if (r.verdict === 'conflict') { if (A && !F) r.verdict = 'unmet'; else if (F && !A) r.verdict = 'met'; }
        const use = r.verdict === 'met' ? r.facts.for : r.facts.against;
        r.reason = quote(use.length ? use : r.facts.for.concat(r.facts.against));
        r.evidence = (use.length ? use : r.facts.for.concat(r.facts.against)).slice(0, 5).map(f => f.id);
      }));
      return res;
    }

    // ---- ② 経過（別の属性。4つの判定区分は変えない） ----
    function cvProgress(cp, needId) {
      const rows = (cp.items || []).filter(i => i && !i.deleted && !i.aiSuggested && i.type !== 'unnecessary' && !i.diseaseGeneral && (i.hendersonIds || []).includes(needId) && (i.assessmentCols?.[needId] || '') !== 'preadmission');
      const pts = [];
      rows.forEach(i => {
        let v = null; try { v = sufficiencyCardVerdict(i, needId, 'post'); } catch (e) { v = null; }
        const d = typeof suffDayOf === 'function' ? suffDayOf(i) : null;
        if (v && (v.v === 'met' || v.v === 'unmet') && d !== null) pts.push({ id: i.id, day: d, v: v.v });
      });
      const days = [...new Set(pts.map(p => p.day))].sort((a, b) => a - b);
      if (days.length < 2) return { value: 'unknown', label: '経過不明', days: days.length };
      const at = d => { const g = pts.filter(p => p.day === d); return g.some(p => p.v === 'unmet') ? 'unmet' : 'met'; };
      const first = at(days[0]), last = at(days[days.length - 1]);
      const value = first === 'unmet' && last === 'met' ? 'improving' : first === 'met' && last === 'unmet' ? 'worsening' : 'unchanged';
      return { value, label: { improving: '改善傾向', worsening: '悪化傾向', unchanged: '変化なし' }[value], from: first, to: last, firstDay: days[0], lastDay: days[days.length - 1], evidence: pts.map(p => p.id) };
    }

    // ---- ③ 側面ごとの評価（できること／実際の状態／不快・安全） ----
    const CV_DIMENSIONS = {
      2: [
        { key: 'ability', label: '自分で食べられるか', ok: /自力(?:で)?摂取|自分で(?:食|摂)|セッティング後[^。]{0,8}摂取/, ng: /摂取介助|食べさせ|自力摂取(?:でき|不能)|手が(?:動かず|使えず)/ },
        { key: 'appetite', label: '食欲', ok: /食欲(?:あり|良好|が出|旺盛)|おいしい|美味/, ng: /食欲(?:なし|がない|低下|不振)|食べたくない|あまり食欲がない/ },
        { key: 'intake', label: '実際の摂取量', ok: /全量|[89]割|10割|完食/, ng: /(?:^|[^0-9])[0-5]割|半分|摂取量(?:低下|減少)|少量のみ|残す/ },
        { key: 'swallow', label: '嚥下', ok: /むせ(?:なし|ない)|嚥下(?:良好|問題なし)/, ng: /むせ(?:あり|込む)|嚥下(?:障害|困難|低下)/ }
      ],
      3: [
        { key: 'urine', label: '排尿の状態', ok: /排尿(?:あり|良好|自立|問題なし)|尿量(?:良好|十分)|自尿あり/, ng: /尿閉|頻尿|排尿(?:困難|痛)|残尿|失禁|尿量(?:減少|少な)|乏尿/ },
        { key: 'bowel', label: '排便の状態', ok: /排便(?:あり|あった|良好|\d回)/, ng: /便秘|排便(?:なし|がない|ない)|硬便|下痢|排ガス(?:なし|なく)/ },
        { key: 'toileting', label: '自分でトイレに行けるか', ok: /トイレ(?:まで)?(?:歩行|自立|自分で)|排泄[^。]{0,6}自立/, ng: /(?:トイレ|排泄)[^。]{0,12}(?:全介助|介助|おむつ|ポータブル|ベッド上)|膀胱留置カテーテル|尿道留置カテーテル/ },
        { key: 'comfort', label: '不快感', ok: /(?!)/, ng: /腹部?膨満|腹痛|残便感|排尿時痛|腹満/ }
      ],
      8: [
        { key: 'ability', label: '自分で清潔にできるか', ok: /(?:入浴|洗髪|清拭|更衣|整容)[^。]{0,8}自立/, ng: /(?:全介助|一部介助)|(?:入浴|清拭|更衣|洗髪)[^。]{0,8}介助/ },
        { key: 'skin', label: '皮膚の状態', ok: /皮膚(?:問題なし|良好|異常なし)/, ng: /発赤|褥瘡|びらん|皮膚トラブル|創[^。]{0,4}(?:腫脹|熱感|滲出)/ },
        { key: 'comfort', label: '本人の快・好み', ok: /さっぱり|気持ちよ/, ng: /ベタベタ|かゆい|不快|気持ちが悪い/ }
      ]
    };
    function cvDimensions(cp, needId) {
      const defs = CV_DIMENSIONS[needId]; if (!defs) return null;
      const cards = (cp.items || []).filter(i => i && !i.deleted && !i.aiSuggested && i.type !== 'unnecessary' && !i.diseaseGeneral && (i.hendersonIds || []).includes(needId) && (i.assessmentCols?.[needId] || '') !== 'preadmission' && !cvHeadingOnly(i));
      return defs.map(d => {
        const hits = cards.map(i => ({ i, ng: !!cvAffirmed(d.ng, i.text), ok: !!cvAffirmed(d.ok, i.text) })).filter(x => x.ng || x.ok);
        const days = hits.map(x => suffDayOf(x.i));
        const lastDay = days.every(x => x !== null) && days.length ? Math.max(...days) : null;
        const latest = lastDay === null ? hits : hits.filter(x => suffDayOf(x.i) === lastDay);
        const state = !latest.length ? 'none' : latest.some(x => x.ng) ? 'ng' : 'ok';
        return { key: d.key, label: d.label, state, evidence: latest.map(x => x.i.id) };
      });
    }
    // 1つの側面が良くても、他の側面に課題が残るなら、その欲求全体を「満たされている」とは判定しない（判定保留）
    function cvApplyDimensions(cp, res) {
      Object.keys(CV_DIMENSIONS).forEach(nid => {
        const r = res && res[nid]; if (!r) return;
        const dims = cvDimensions(cp, Number(nid)); if (!dims) return;
        Object.keys(r).forEach(ph => { r[ph].dimensions = dims; });
        const all = r.all; if (!all || all.verdict !== 'met') return;
        const ng = dims.filter(d => d.state === 'ng');
        if (ng.length) {
          all.verdict = 'conflict'; all.dimensionConflict = true;
          all.reason = `${dims.filter(d => d.state === 'ok').map(d => d.label).join('・') || '一部の側面'}は保たれているが、${ng.map(d => d.label).join('・')}に課題が残る`;
        }
      });
      return res;
    }

    // ---- ③' 進み具合を付ける ----
    function cvAttachProgress(cp, res) {
      Object.keys(res || {}).forEach(nid => { if (res[nid] && res[nid].all) res[nid].all.progress = cvProgress(cp, Number(nid)); });
      return res;
    }
    function cvPostProcessSufficiency(cp, res) {
      try { cvValidateSufficiency(cp, res); } catch (e) { console.warn('evidence validation failed', e); }
      try { cvApplyDimensions(cp, res); } catch (e) { console.warn('dimension evaluation failed', e); }
      try { cvAttachProgress(cp, res); } catch (e) { console.warn('progress evaluation failed', e); }
      return res;
    }

    // ---- ④ 看護問題の根拠の関連性 ----
    const CV_FAMILIES = [
      { id: 'nausea', label: /悪心|嘔気|嘔吐/, ev: /悪心|嘔気|嘔吐|吐き気|吐気|むかむか|制吐|オピオイド|腸蠕動|排ガス|食欲/, symptom: /悪心|嘔気|嘔吐|吐き気|吐気|むかむか/ },
      { id: 'pain', label: /疼痛|痛み/, ev: /痛|NRS|ペインスケール|鎮痛|表情|苦痛|ロキソ|アセリオ|レペタン/, symptom: /痛|疼痛/ },
      { id: 'resp', label: /呼吸|肺|無気肺|気道|排痰|ガス交換/, ev: /呼吸|SpO2|酸素|咳|痰|肺|喫煙|%VC|FEV|麻酔|挿管|疼痛|離床|体位|深呼吸|胸|術/ },
      { id: 'vte', label: /血栓|塞栓|DVT/, ev: /下肢|腫脹|ホーマンズ|Dダイマー|ヘパリン|抗凝固|弾性|ストッキング|フットポンプ|安静|離床|術|骨折|ベッド上|歩行|臥床|しびれ|肥満|BMI|喫煙/ },
      { id: 'delirium', label: /混乱|せん妄/, ev: /せん妄|混乱|見当識|認知|夜間|睡眠|不穏|\d+歳|高齢|ここはどこ|環境|入院|麻酔|疼痛|薬|ライン|カテーテル/ },
      { id: 'infection', label: /感染/, ev: /創|ドレーン|カテーテル|ライン|点滴|発熱|体温|℃|CRP|WBC|白血球|排液|発赤|腫脹|熱感|滲出|糖尿|栄養|Alb|術/ },
      { id: 'fall', label: /転倒|転落/, ev: /転倒|転落|ふらつ|歩行|移乗|立位|筋力|MMT|バランス|めまい|貧血|Hb|ヘモグロビン|鎮痛|睡眠薬|下肢|しびれ|認知|せん妄|夜間|トイレ|車椅子|車いす|ベッド上|離床|ライン|ドレーン|カテーテル|視力|\d+歳|高齢/ },
      { id: 'dislocation', label: /脱臼/, ev: /脱臼|股関節|屈曲|内旋|内転|禁忌肢位|後方|体位|術式|人工骨頭|BHA|THA|外転枕|体動|移乗|リハ|筋力|荷重/ },
      { id: 'nutrition', label: /栄養|摂取/, ev: /食|摂取|食欲|体重|BMI|Alb|TP|嚥下|悪心|口腔|歯|義歯|水分|点滴|禁食|絶食|割/ },
      { id: 'disuse', label: /廃用|可動|活動|ADL|セルフケア/, ev: /安静|臥床|離床|歩行|移乗|ADL|介助|筋力|MMT|活動|リハ|免荷|固定|牽引|車椅子|車いす|清拭|更衣|入浴|排泄|痛|不安|怖/ },
      { id: 'constipation', label: /便秘|排便/, ev: /排便|便|腸蠕動|排ガス|オピオイド|安静|水分|食事|腹部|膨満|下剤/ },
      { id: 'urine', label: /排尿|尿/, ev: /尿|カテーテル|膀胱|残尿|排尿|腎|Cr|BUN|eGFR/ },
      { id: 'skin', label: /皮膚|褥瘡|圧迫/, ev: /皮膚|発赤|褥瘡|圧迫|Braden|ずれ|体位|栄養|Alb|浮腫|創|湿潤|体動|寝返り/ },
      { id: 'sleep', label: /睡眠/, ev: /睡眠|眠|覚醒|夜間|不眠|疼痛|環境|音/ },
      { id: 'anxiety', label: /不安|恐怖|ストレス|対処/, ev: /不安|怖|心配|恐|緊張|眠れ|戸惑|ストレス|説明|手術|家族|今後|退院/ }
    ];
    function cvFamilyOf(problemLabel) { const l = cvNorm(problemLabel); return CV_FAMILIES.find(f => f.label.test(l)) || null; }
    // その看護問題の根拠として使ってよい記録か。無関係な記録・否定された所見は使わない。
    // 「ないこと」自体が所見になる語（排便なし・摂取量の低下など）は、否定として捨てない
    const CV_ABSENCE_IS_FINDING = /(?:排便|排ガス|排尿|自尿|尿量|摂取|睡眠|食欲|食事)[^、。]{0,4}(?:なし|ない|なく|低下|減少)|眠れ(?:ない|なかった)/;
    function cvEvidenceRelevant(problemLabel, text) {
      const fam = cvFamilyOf(problemLabel);
      if (!fam) return true;
      // 根拠の文字列は「項目名：内容」の形が多い。項目名だけが一致しても関係あるとは言えないので、内容の側で確かめる。
      const raw = cvNorm(text); const pm = raw.match(/^([^:\d][^:]{0,24}):\s*/); const t = pm && raw.length - pm[0].length > 6 ? raw.slice(pm[0].length) : raw;
      const hit = cvAffirmed(fam.ev, t) || (CV_ABSENCE_IS_FINDING.test(t) && fam.ev.test(t));
      if (!hit) return false;
      const risk = /リスク|おそれ|可能性/.test(cvNorm(problemLabel));
      if (!risk && fam.symptom && !cvAffirmed(fam.symptom, t)) return false; // 実際に起きている問題は、症状が「ある」記録だけを根拠にする
      return true;
    }
    function cvFilterEvidenceTexts(problemLabel, list) { return (list || []).filter(x => cvEvidenceRelevant(problemLabel, typeof x === 'string' ? x : (x && x.text) || '')); }

    // 看護問題の区分：実際／リスク／改善中／根拠が足りない候補
    function cvProblemStatus(cp, plan) {
      const label = cvNorm(plan && plan.problem);
      const cards = new Map((cp.items || []).map(i => [String(i.id), i]));
      const ev = (plan.evidenceIds || []).map(id => cards.get(String(id))).filter(Boolean);
      if (/（候補）|\(候補\)/.test(label) || !ev.length) return { kind: 'candidate', label: '根拠を確かめる候補' };
      if (/リスク|おそれ|可能性/.test(label)) return { kind: 'risk', label: 'リスク' };
      const withDay = ev.map(i => ({ i, d: typeof suffDayOf === 'function' ? suffDayOf(i) : null })).filter(x => x.d !== null);
      if (withDay.length >= 2) {
        const last = Math.max(...withDay.map(x => x.d)), latest = withDay.filter(x => x.d === last);
        if (latest.length && latest.every(x => typeof SUF_IMPROVED !== 'undefined' && SUF_IMPROVED.test(cvNorm(x.i.text)))) return { kind: 'improving', label: '改善中' };
      }
      return { kind: 'actual', label: '実際の問題' };
    }

    // ---- ⑤ 検査値の単位の確認（元の値は直さない） ----
    const CV_LAB_UNITS = [
      { re: /^eGFR$/i, ok: /mL\/min|ml\/min|mL\/分/i, name: 'eGFR' },
      { re: /^(?:Cre|Cr|クレアチニン)$/i, ok: /mg\/dL/i, name: 'クレアチニン' },
      { re: /^(?:BUN|尿素窒素)$/i, ok: /mg\/dL/i, name: 'BUN' },
      { re: /^(?:Alb|アルブミン|TP|総蛋白)$/i, ok: /g\/dL/i, name: 'Alb/TP' },
      { re: /^(?:Hb|ヘモグロビン)$/i, ok: /g\/dL/i, name: 'Hb' },
      { re: /^(?:WBC|白血球)$/i, ok: /\/μL|\/uL|\/µL|×10|10\^|\/mm3|\/mm³|10\*3|千/i, name: 'WBC' },
      { re: /^CRP$/i, ok: /mg\/dL|mg\/L/i, name: 'CRP' }
    ];
    function cvCheckLabUnits(cp) {
      const issues = [];
      (cp.items || []).filter(i => i && !i.deleted && i.text).forEach(i => {
        cvNorm(i.text).split(/\n/).forEach(line => {
          const m = line.trim().match(/^([A-Za-zぁ-んァ-ヶ一-龥]{1,8})\s*[:：]?\s*(-?\d+(?:\.\d+)?)\s*([^\s（(,，、。]{0,14})/);
          if (!m) return;
          const rule = CV_LAB_UNITS.find(r => r.re.test(m[1])); const unit = m[3] || '';
          if (rule && unit && /[A-Za-z%μµ\/]/.test(unit) && !rule.ok.test(unit)) issues.push({ id: i.id, analyte: rule.name, value: m[2], unit, text: line.trim().slice(0, 60), msg: `${rule.name}の単位「${unit}」が通常の単位と合わない（元の記録は直していません。原本で確認してください）` });
        });
      });
      return issues;
    }

if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, { cvAffirmed, cvTraceable, cvHeadingOnly, cvValidateSufficiency, cvProgress, cvDimensions, cvApplyDimensions, cvPostProcessSufficiency, cvFamilyOf, cvEvidenceRelevant, cvFilterEvidenceTexts, cvProblemStatus, cvCheckLabUnits, CV_DIMENSIONS });
}
