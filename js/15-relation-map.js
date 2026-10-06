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

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['15'] = '2026-10-06.4'; // 版（scripts/stamp-version.js が書き込む）

    // ---- 種類 ----
    const RM_TYPES = [
      { key: 'patient_fact', label: '患者情報・背景', shape: 'rect', fill: '#FFFFFF', stroke: '#4A4A4A' },
      { key: 'disease', label: '疾患', shape: 'rect', fill: '#FCE4E4', stroke: '#B5452F', bold: true },
      { key: 'pathophysiology', label: '病態生理', shape: 'rect', fill: '#FFFFFF', stroke: '#6B665C' },
      { key: 'symptom', label: '症状・徴候', shape: 'rect', fill: '#FFF7EC', stroke: '#B7791F' },
      { key: 'lab', label: '検査データ', shape: 'rect', fill: '#F3F7FD', stroke: '#3A6EA5', paren: true },
      { key: 'treatment', label: '治療・処置', shape: 'ellipse', fill: '#EEF3FF', stroke: '#1E3A8A' },
      { key: 'future_risk', label: '今後のリスク', shape: 'rect', fill: '#FFFFFF', stroke: '#7A7266' },
      { key: 'nursing_problem', label: '看護問題', shape: 'rect', fill: '#FBDDE3', stroke: '#B03A55', bold: true }
    ];
    const RM_TYPE_BY_KEY = new Map(RM_TYPES.map(t => [t.key, t]));
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

    const RM_RECT_W = 176, RM_ELLIPSE_W = 196;
    const RM_FONT = 12, RM_LINE_H = 16, RM_PAD = 8, RM_HEAD_H = 0;
    const RM_COL_GAP = 80, RM_ROW_GAP = 22;
    const RM_MAX_NODES = 60, RM_MAX_EDGES = 140, RM_TEXT_MAX = 120, RM_UNDO_MAX = 40;
    const RM_BRIDGE_R = 5;

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
      const lines = rmWrapText(rmDisplayLabel(n), ell ? 10.5 : 13);
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
          priority: type === 'nursing_problem' ? priority : 0,
          x: Number.isFinite(Number(n.x)) ? Number(n.x) : 0,
          y: Number.isFinite(Number(n.y)) ? Number(n.y) : 0,
          itemIds: Array.isArray(n.itemIds) ? n.itemIds.filter(x => rmSafeId(x)).slice(0, 20) : []
        });
      });
      const byId = new Map(nodes.map(n => [n.id, n]));
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
        source: String(raw.source || 'manual'), createdAt: raw.createdAt || null, updatedAt: raw.updatedAt || null };
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
      { key: 'fall', rank: 4.5, re: /転倒|転落|せん妄|混乱|身体損傷/ }, // 安全（せん妄・転倒）は疼痛の次、栄養より前
      { key: 'act', rank: 7, re: /セルフケア|活動|可動性|ADL|移動|入浴/ },
      { key: 'elim', rank: 7.5, re: /排泄|排便|排尿|便秘/ },
      { key: 'sleep', rank: 8, re: /睡眠/ },
      { key: 'comm', rank: 8.2, re: /コミュニケーション|言語/ },
      { key: 'anx', rank: 9, re: /不安|恐怖|心理|ボディイメージ|知識|自己管理|コーピング|役割|家族/ }
    ];
    function rmProblemCategory(label) { return RM_PROBLEM_CATEGORIES.find(c => c.re.test(String(label || ''))) || { key: 'other', rank: 8.5 }; }

    // ---- 並べ方：列（左→右の因果の深さ）と、列の中の上下（重要な看護問題の流れほど上）を決める ----
    function rmFlowEdges(map) {
      // 治療は「治療の対象」の右に置く（治療 → 対象 の矢印は左向きになる）
      return map.edges.map(e => e.relation === 'treats' ? { from: e.target, to: e.source } : { from: e.source, to: e.target });
    }
    function layoutRelationMap(map) {
      if (!map || !map.nodes.length) return map;
      const ids = map.nodes.map(n => n.id);
      const byId = new Map(map.nodes.map(n => [n.id, n]));
      const flows = rmFlowEdges(map).filter(f => byId.has(f.from) && byId.has(f.to));
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
      keep.forEach(f => { const k = `${f.from}>${f.to}`; if (uniq.has(k)) return; uniq.add(k); out.get(f.from).push(f.to); inn.get(f.to).push(f.from); });
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
        const r = Math.max(minRank(n), ...inn.get(id).map(p => (rank.get(p) ?? 0) + 1));
        rank.set(id, n.type === 'patient_fact' && !inn.get(id).length ? 0 : r);
      });
      // 矢印の入って来ない四角（検査データなど）は、つながる先のすぐ左に置く（遠くから長い線を引かない＝交差を減らす）
      const probIds = new Set(map.nodes.filter(n => n.type === 'nursing_problem').map(n => n.id));
      const maxNonProb = Math.max(0, ...map.nodes.filter(n => !probIds.has(n.id)).map(n => rank.get(n.id)));
      [...order].reverse().forEach(id => {
        const n = byId.get(id);
        if (n.type === 'patient_fact' || n.type === 'nursing_problem' || inn.get(id).length || !out.get(id).length) return;
        const succ = Math.min(...out.get(id).map(t => (probIds.has(t) ? maxNonProb + 1 : rank.get(t))));
        if (succ - 1 > rank.get(id)) rank.set(id, succ - 1);
      });
      // 看護問題はいちばん右の列にまとめる
      const nonProb = map.nodes.filter(n => n.type !== 'nursing_problem');
      const lastRank = (nonProb.length ? Math.max(...nonProb.map(n => rank.get(n.id))) : 0) + 1;
      map.nodes.forEach(n => { if (n.type === 'nursing_problem') rank.set(n.id, lastRank); });
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
      // 看護問題へ流れの続かない治療（鎮痛薬 → 創部痛 など）は、治療の対象と同じ帯に置く
      map.edges.forEach(e => { if (e.relation === 'treats' && band.get(e.source) === 999 && band.has(e.target)) band.set(e.source, band.get(e.target)); });
      const cols = [];
      ids.forEach((id, i) => { const r = rank.get(id); (cols[r] = cols[r] || []).push({ id, i }); });
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
        for (let r = 1; r < cols.length; r++) { sortCol(cols[r], id => inn.get(id), r === lastRank); setPos(); }
        for (let r = cols.length - 2; r >= 0; r--) { sortCol(cols[r], id => out.get(id), false); setPos(); }
      }
      // x：列ごとに、いちばん幅の広い四角に合わせる
      const colX = [];
      let x = 0;
      cols.forEach((c, r) => {
        colX[r] = x;
        const w = c.length ? Math.max(...c.map(e => rmNodeSize(byId.get(e.id)).w)) : RM_RECT_W;
        c.forEach(e => { const n = byId.get(e.id); n.x = Math.round(x + (w - rmNodeSize(n).w) / 2); });
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
        const colH = perCol.map(c => c.reduce((h, e) => h + rmNodeSize(byId.get(e.id)).h, 0) + Math.max(0, c.length - 1) * RM_ROW_GAP);
        const bandH = Math.max(0, ...colH);
        perCol.forEach((c, r) => {
          let y = top + (bandH - colH[r]) / 2;
          c.forEach(e => { const n = byId.get(e.id); n.y = Math.round(y); y += rmNodeSize(n).h + RM_ROW_GAP; });
        });
        if (bandH > 0) { stripes.push({ y1: top - RM_ROW_GAP * 0.9, y2: top + bandH + RM_ROW_GAP * 0.9, p: bv }); top += bandH + RM_ROW_GAP * 2.2; }
      });
      const minY = Math.min(...map.nodes.map(n => n.y));
      map.nodes.forEach(n => { n.y = Math.round(n.y - minY); });
      // 看護問題ごとの帯（背景に薄い色を交互に付け、どの流れがどの看護問題のものかを見分けやすくする）
      map.bands = stripes.filter(st => st.p !== 999).map(st => ({ y1: Math.round(st.y1 - minY), y2: Math.round(st.y2 - minY), p: st.p }));
      // 列の見出し（左：背景・要因／疾患・病態の発生／治療／治療後の身体の変化・症状・生活への影響／右端：看護問題）
      const colTypes = cols.map(c => new Set(c.map(e => byId.get(e.id).type)));
      const firstTreat = colTypes.findIndex((s, r) => r > 0 && r < lastRank && s.has('treatment'));
      const labelOf = r => {
        if (r === lastRank) return '看護問題';
        if (r === 0 && colTypes[0].has('patient_fact')) return '生活背景・既往・要因';
        if (firstTreat < 0) return '病態・症状・生活への影響';
        if (r < firstTreat) return '疾患・病態の発生・進行';
        if (r === firstTreat) return '治療';
        return '治療後の身体の変化・症状・生活への影響';
      };
      const headers = [];
      cols.forEach((c, r) => {
        if (!c.length) return;
        const label = labelOf(r);
        const w = Math.max(...c.map(e => rmNodeSize(byId.get(e.id)).w));
        const last = headers[headers.length - 1];
        if (last && last.label === label && last.r === r - 1) { last.x2 = colX[r] + w; last.r = r; }
        else headers.push({ x1: colX[r], x2: colX[r] + w, label, r });
      });
      map.headers = headers.map(h => ({ x1: h.x1, x2: h.x2, label: h.label }));
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
      map.edges.forEach(e => {
        const a = rectById.get(e.source), b = rectById.get(e.target);
        if (!a || !b) return;
        const d = dirOf(e);
        if (d) {
          const right = d > 0;
          const sx = right ? a.x2 : a.x1, tx = right ? b.x1 : b.x2;
          const sy = a.cy, ty = b.cy;
          if (Math.abs(sy - ty) < 2) { routes.push({ edge: e, pts: [[sx, sy], [tx, ty]] }); return; }
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
      (map.headers || []).forEach(h => { x1 = Math.min(x1, h.x1); x2 = Math.max(x2, h.x2); });
      (map.bands || []).forEach(st => { y1 = Math.min(y1, st.y1); y2 = Math.max(y2, st.y2); });
      const pad = 34;
      const top = (map.headers || []).length ? 40 : 0;
      return { x: x1 - pad, y: y1 - pad - top, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2 + top };
    }
    function rmEdgesSvg(map, { interactive }) {
      const { routes } = rmRouteEdges(map);
      return routes.map(r => {
        const e = r.edge;
        const d = rmRoutePath(r);
        const treat = e.relation === 'treats';
        const sel = interactive && rmState.selected && rmState.selected.type === 'edge' && rmState.selected.id === e.id;
        return `<g class="rm-link${treat ? ' is-treat' : ''}${sel ? ' is-selected' : ''}" data-link-id="${escapeHtml(e.id)}">
          ${interactive ? `<path class="rm-link-hit" d="${d}" fill="none" stroke="transparent" stroke-width="12"/>` : ''}
          <path class="rm-link-line" d="${d}" fill="none" stroke="${treat ? '#2563EB' : '#57534E'}" stroke-width="1.4"${e.predicted ? ' stroke-dasharray="6 4"' : ''} marker-end="url(#rm-arrow${treat ? '-blue' : ''})"/>
        </g>`;
      }).join('');
    }
    function rmNodeSvg(n, { interactive }) {
      const t = rmType(n);
      const s = rmNodeSize(n);
      const sel = interactive && rmState.selected && rmState.selected.type === 'node' && rmState.selected.id === n.id;
      const from = interactive && rmState.connectFrom === n.id;
      const dashed = n.observed === false;
      const shape = t.shape === 'ellipse'
        ? `<ellipse class="rm-box" cx="${s.w / 2}" cy="${s.h / 2}" rx="${s.w / 2}" ry="${s.h / 2}" fill="${t.fill}" stroke="${t.stroke}" stroke-width="1.6"${dashed ? ' stroke-dasharray="6 4"' : ''}/>`
        : `<rect class="rm-box" width="${s.w}" height="${s.h}" rx="${n.type === 'nursing_problem' ? 6 : 3}" fill="${t.fill}" stroke="${t.stroke}" stroke-width="${t.bold ? 1.8 : 1.3}"${dashed ? ' stroke-dasharray="6 4"' : ''}/>`;
      const ell = t.shape === 'ellipse';
      const textX = ell ? s.w / 2 : RM_PAD;
      const anchor = ell ? ' text-anchor="middle"' : '';
      const tag = [dashed ? '予測' : '', n.source === 'knowledge' ? '※知識' : ''].filter(Boolean).join(' ');
      const tagW = tag.length * 8.5 + 10;
      return `<g class="rm-node${sel ? ' is-selected' : ''}${from ? ' is-connect-from' : ''}" data-node-id="${escapeHtml(n.id)}" data-kind="${escapeHtml(n.type)}" transform="translate(${n.x},${n.y})"${interactive ? ` tabindex="0" role="button" aria-label="${escapeHtml(`${t.label}${dashed ? '（予測）' : ''}：${rmDisplayLabel(n)}`)}"` : ''}>
        ${shape}
        <title>${escapeHtml(`${t.label}${dashed ? '（予測）' : ''}${n.source === 'knowledge' ? '（医学知識で補った）' : ''}`)}</title>
        ${tag ? `<g class="rm-tag"><rect x="${s.w - tagW - 6}" y="-7" width="${tagW}" height="13" rx="6.5" fill="#FFFFFF" stroke="${t.stroke}" stroke-width="0.8"/><text class="rm-kind" x="${s.w - tagW / 2 - 6}" y="3" text-anchor="middle" font-size="8.5" fill="${t.stroke}" font-weight="700">${escapeHtml(tag)}</text></g>` : ''}
        <text class="rm-text" x="${textX}" y="${RM_PAD + RM_HEAD_H + RM_FONT + (ell ? 8 : 0)}"${anchor} font-size="${RM_FONT}" fill="#262420"${t.bold ? ' font-weight="700"' : ''}>${s.lines.map((line, i) => `<tspan x="${textX}" dy="${i ? RM_LINE_H : 0}">${escapeHtml(line)}</tspan>`).join('')}</text>
      </g>`;
    }
    function rmHeadersSvg(map, b) {
      return (map.headers || []).map(h => `<g class="rm-header"><rect x="${h.x1}" y="${b.y + 6}" width="${Math.max(10, h.x2 - h.x1)}" height="24" rx="3" fill="#ECEAE4"/><text x="${(h.x1 + h.x2) / 2}" y="${b.y + 22}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#3F3B35">${escapeHtml(h.label)}</text></g>`).join('');
    }
    function relationMapSvg(map, { interactive = false, zoom = 1, title = '' } = {}) {
      const b = rmBounds(map);
      const font = "'Noto Serif JP App','Noto Serif JP','Yu Mincho','Hiragino Mincho ProN',serif";
      const marker = (id, color) => `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${color}"/></marker>`;
      return `<svg xmlns="http://www.w3.org/2000/svg" class="rm-svg" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" width="${Math.round(b.w * zoom)}" height="${Math.round(b.h * zoom)}" font-family="${escapeHtml(font)}" role="img" aria-label="${escapeHtml(title || '関連図')}">
        <defs>${marker('rm-arrow', '#3F3B35')}${marker('rm-arrow-blue', '#2563EB')}${marker('rm-arrow-sel', '#C2410C')}</defs>
        <rect class="rm-bg" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${interactive ? 'transparent' : '#FFFFFF'}"/>
        <g class="rm-bands">${(map.bands || []).map((st, k) => `<rect class="rm-band${k % 2 ? ' is-odd' : ''}" x="${b.x}" y="${st.y1}" width="${b.w}" height="${Math.max(0, st.y2 - st.y1)}" fill="${k % 2 ? '#F4F1EA' : '#FBFAF6'}"/>`).join('')}</g>
        <g class="rm-headers">${rmHeadersSvg(map, b)}</g>
        <g class="rm-links">${rmEdgesSvg(map, { interactive })}</g>
        <g class="rm-nodes">${map.nodes.map(n => rmNodeSvg(n, { interactive })).join('')}</g>
      </svg>`;
    }
    function rmLegendHtml() {
      const sw = (t, extra = '') => `<span class="rm-legend-swatch${RM_TYPE_BY_KEY.get(t).shape === 'ellipse' ? ' is-ellipse' : ''}" data-kind="${t}" style="background:${RM_TYPE_BY_KEY.get(t).fill};border-color:${RM_TYPE_BY_KEY.get(t).stroke};${extra}"></span>`;
      const line = (color, dash) => `<svg width="34" height="10" aria-hidden="true"><line x1="0" y1="5" x2="28" y2="5" stroke="${color}" stroke-width="1.6"${dash ? ' stroke-dasharray="6 4"' : ''}/><path d="M27,1 L34,5 L27,9 z" fill="${color}"/></svg>`;
      return [
        `<span class="rm-legend-item">${sw('treatment')}治療・処置（楕円）</span>`,
        `<span class="rm-legend-item">${sw('pathophysiology')}現象・状態</span>`,
        `<span class="rm-legend-item">${sw('lab')}（ ）検査データ</span>`,
        `<span class="rm-legend-item">${sw('disease')}疾患</span>`,
        `<span class="rm-legend-item">${sw('nursing_problem')}看護問題（#＝優先順位）</span>`,
        `<span class="rm-legend-item">${line('#3F3B35')}原因 → 結果</span>`,
        `<span class="rm-legend-item">${line('#2563EB')}治療 → 治療の対象</span>`,
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
      if (map.nodes.length > 40) add('warn', 'too-many', `四角が${map.nodes.length}個あります。看護問題に関係の薄い情報を減らすと読みやすくなります`);
      const facts = map.nodes.filter(n => n.type === 'patient_fact').length;
      if (facts > 6) add('info', 'too-many-facts', `患者の背景の四角が${facts}個あります。看護問題につながらないプロフィールは省いてください`);
      if (!probs.length) add('warn', 'no-problem', '看護問題がありません。右端に #1〜 の看護問題を置いてください');
      // 11・12 線の交差（交差する所は飛び越えで描く）
      const { bridges } = rmRouteEdges(map);
      if (bridges) add('info', 'crossing', `線の交差が${bridges}か所あります（飛び越え∩で描いています）。「並べ直す」で減らせることがあります`, { fix: 'relayout' });
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
      const dmItem0 = items.find(i => /糖尿病|\bDM\b/.test(String(i.text).normalize('NFKC')));
      const o2Label = () => { const m = o2Item && String(o2Item.text).normalize('NFKC').match(/(?:鼻カニュ[ラー]|マスク|リザーバー[^\s]*|ネーザル)?\s*(?:酸素|O2)\s*\d+(?:\.\d+)?\s*L(?:\/分|\/min)?/); return m ? `酸素投与（${m[0].trim()}）` : '酸素投与'; };
      // カードの文は、要点（最初の一文）だけにする（長い文をそのまま載せると図が読みにくい）
      const short = (i, max = 34) => {
        let t = String(i.text).replace(/^【[^】]{1,10}】/, '').replace(/^\d{1,2}[:：]\d{2}\s*/, '').trim();
        const first = t.split(/。/)[0];
        if (first.length >= 6 && first.length < t.length) t = first;
        return rmShorten(t, max);
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
        const pResp = N('p_resp', 'nursing_problem', sputumItem ? '非効果的気道浄化（無気肺・肺炎のリスク状態）' : '術後呼吸器合併症のリスク状態（無気肺・肺炎）', { cat: 'resp' });
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
        const dysItem = findItem(/呼吸困難|起座呼吸|息切れ|息が苦し|横になれない/);
        let dys = null;
        if (dysItem) { dys = N('dyspnea', 'symptom', short(dysItem, 36), { items: [dysItem] }); E(hf, dys, 'causes', { evidence: '肺うっ血でガス交換が妨げられる' }); }
        if (spo2 && spo2.flag === 'low' || dys) {
          const hyp = N('hypoxia', 'pathophysiology', '酸素化の低下', { source: 'knowledge', observed: !!(spo2 && spo2.flag === 'low') || !!dys });
          E(hf, hyp, 'causes');
          if (spo2) E(labNode(spo2, 'lab_spo2'), hyp, 'supports', { evidence: 'SpO2の低下' });
          if (o2Item) E(N('o2', 'treatment', o2Label(), { items: [o2Item] }), hyp, 'treats', { evidence: '酸素化の維持' });
          const pGas = N('p_gas', 'nursing_problem', 'ガス交換障害', { cat: 'resp' });
          E(hyp, pGas, 'results_in'); if (dys) E(dys, pGas, 'results_in');
        }
        const edemaItem = findItem(/浮腫|むくみ|体重[^\n]{0,8}増加/);
        if (edemaItem) {
          const fluid = N('fluid', 'pathophysiology', '腎血流量の低下・体液の貯留', { source: 'knowledge' });
          E(hf, fluid, 'causes');
          const ed = N('edema', 'symptom', short(edemaItem, 36), { items: [edemaItem] });
          E(fluid, ed, 'causes');
          const pFluid = N('p_fluid', 'nursing_problem', '体液量過剰', { cat: 'circ' });
          E(ed, pFluid, 'results_in');
          if (diuretic) { const du = N('diuretic', 'treatment', `利尿薬（${diuretic.name}）`); E(du, fluid, 'treats', { evidence: '体液の貯留に対して' }); }
        }
      }
      // ⑤-2 肺炎など（手術の無い呼吸器の感染）：炎症 → 痰・ラ音 → 気道浄化／酸素化の低下 → ガス交換。抗菌薬・吸引・酸素は治療 → 対象
      if (!(surgery && surgeryDone) && /肺炎|気管支炎|COPD|慢性閉塞|呼吸不全|肺気腫/.test(dxLabel)) {
        const lung = N('lung_inflam', 'pathophysiology', '肺胞・気道の炎症・分泌物（滲出液）の増加', { source: 'knowledge' });
        if (disease) E(disease, lung, 'causes', { evidence: '病原体による炎症' });
        const fever = lab('体温');
        if ((wbcEarly && wbcEarly.flag === 'high') || (crpEarly && crpEarly.flag === 'high') || (fever && fever.flag === 'high')) {
          const sys = N('sys_inflam', 'pathophysiology', '全身の炎症反応（発熱・WBC・CRPの上昇）', { source: 'knowledge' });
          if (disease) E(disease, sys, 'causes');
          [wbcEarly, crpEarly, fever].filter(l => l && l.flag === 'high').forEach(l => E(labNode(l), sys, 'supports', { evidence: '炎症の強さを示す' }));
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
          E(dm, imm, 'contributes_to', { evidence: '高血糖による白血球機能の低下' });
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
        else if (disease) E(disease, low, 'contributes_to');
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
        const stasis = N('stasis', 'pathophysiology', '安静・下肢の手術による静脈血のうっ滞・凝固能の亢進', { source: 'knowledge' });
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
      const bedItem = findLast(/安静|臥床|ADL[^\n]{0,6}(?:低下|介助|一部)|車椅子|移乗|歩行[^\n]{0,8}(?:介助|困難|不安定)|トイレ[^\n]{0,8}介助/, i => !/食事|摂取|むせ/.test(i.text));
      if ((pain && painItem) || bedItem || nodes.has('paralysis')) {
        const mob = N('mobility', 'pathophysiology', '体動の制限・活動耐性の低下', { source: 'knowledge' });
        if (bedItem) E(N('bed', 'symptom', short(bedItem, 32), { items: [bedItem] }), mob, 'causes');
        if (pain && painItem) E(pain, mob, 'causes', { evidence: '痛みで動きにくい' });
        if (lineItem && nodes.has('lines')) E(nodes.get('lines'), mob, 'contributes_to', { evidence: '管があり動きにくい' });
        if (nodes.has('paralysis')) E(nodes.get('paralysis'), mob, 'causes', { evidence: '麻痺で体を動かしにくい' });
        E(mob, N('p_act', 'nursing_problem', 'セルフケア不足（活動制限・体力の低下）', { cat: 'act' }), 'results_in');
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
        E(fr, N('p_fall', 'nursing_problem', dislocation ? '身体損傷リスク状態（転倒転落・人工骨頭の脱臼）' : '転倒転落リスク状態', { cat: 'fall' }), 'results_in', { predicted: true });
        if (nodes.has('dislocation')) E(nodes.get('dislocation'), nodes.get('p_fall'), 'results_in', { predicted: true });
      } else if (dislocation) {
        const dis = N('dislocation', 'future_risk', '人工骨頭の脱臼の可能性（脱臼肢位：内転・内旋・過屈曲）', { source: 'knowledge', observed: false });
        E(surgery, dis, 'predicts', { predicted: true });
        E(dis, N('p_fall', 'nursing_problem', '身体損傷リスク状態（人工骨頭の脱臼）', { cat: 'fall' }), 'results_in', { predicted: true });
      }
      // ⑫ 睡眠
      const sleepItem = findItem(/眠れ(?:ない|なかった|ず)|不眠|中途覚醒/);
      if (sleepItem) {
        const sl = N('sleep', 'symptom', short(sleepItem, 32), { items: [sleepItem] });
        if (nodes.has('fall_sign') && /夜間|トイレ/.test(sleepItem.text + nodes.get('fall_sign').label)) E(nodes.get('fall_sign'), sl, 'causes');
        else if (pain && painItem) E(pain, sl, 'contributes_to');
        E(sl, N('p_sleep', 'nursing_problem', '睡眠パターン混乱', { cat: 'sleep' }), 'results_in');
      }
      // ⑬ 心理・社会（本人の不安の言葉 → 生活の変化 → 不安）
      // 本人の不安の言葉を先に、家族の心配の言葉も使う（家族だけのときは「家族の不安」とする）
      const anxAll = items.filter(i => i.type === 's' && /不安|心配|迷惑|仕事|戻れ|怖|どうなる|家族|歩ける/.test(i.text));
      const anxItems = [...anxAll.filter(i => !rmIsFamilySpeech(i.text)), ...anxAll.filter(i => rmIsFamilySpeech(i.text))].slice(0, 2);
      const familyOnly = anxItems.length && anxItems.every(i => rmIsFamilySpeech(i.text));
      if (anxItems.length) {
        const words = N('anx_words', 'patient_fact', `${anxItems.map(i => (String(i.text).match(/「[^」]{1,24}」/) || [short(i, 22)])[0]).join('')}（${familyOnly ? '家族の' : ''}不安の言動）`, { items: anxItems, max: 60 });
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
        if (plans.length) return plans.map(p => ({ label: p.problem, needs: p.relatedNeeds || [] }));
        const sel = new Set(cp.selectedDiagnosisIds || []);
        return (cp.diagnosisCandidates || []).filter(c => sel.has(c.id) && String(c.name || '').trim()).map(c => ({ label: c.name, needs: [] }));
      })();
      const tplProblems = [...nodes.values()].filter(n => n.type === 'nursing_problem');
      const usedTpl = new Set();
      const ordered = [];
      userProblems.forEach(up => {
        const cat = rmProblemCategory(up.label).key;
        const match = tplProblems.find(t => !usedTpl.has(t) && (t.cat === cat || (cat === 'resp' && t.cat === 'resp')));
        if (match) { usedTpl.add(match); match.label = rmShorten(String(up.label).replace(/^#\s*\d+\s*/, ''), 60); match.source = 'plan'; ordered.push(match); return; }
        // ひな形に無い看護問題：同じヘンダーソンの欲求のカードから根拠を探す
        const p = N(`p_user_${ordered.length}`, 'nursing_problem', String(up.label).replace(/^#\s*\d+\s*/, ''), { source: 'plan', max: 60 });
        const needs = new Set((up.needs || []).map(Number));
        const ev = items.find(i => (i.hendersonIds || []).some(h => needs.has(Number(h))) && (i.type === 's' || rmPositiveMatch(/なし|ない/, i.text) === null));
        if (ev) E(N(`evn_${p.id}`, 'symptom', `${ev.type === 's' ? 'S：' : ''}${short(ev, 34)}`, { items: [ev] }), p, 'results_in', { evidence: '看護計画の根拠になる記録' });
        else if (disease) E(disease, p, 'contributes_to', { evidence: '看護計画の看護問題（つながりを確かめてください）' });
        ordered.push(p);
      });
      // 看護計画に無いひな形の看護問題は「候補」として後ろに並べる（分類の目安の順）
      const rest = tplProblems.filter(t => !usedTpl.has(t)).sort((a, b) => rmProblemCategory(a.label).rank - rmProblemCategory(b.label).rank);
      rest.forEach(t => { if (userProblems.length) { t.label = `${t.label}（候補）`; t.evidence = '記録から考えられる候補（看護計画には未登録）'; } ordered.push(t); });
      // 看護問題は多くても7つ（看護計画の看護問題はすべて残す）。載せすぎると何が大事か分からなくなる
      const MAX_PROBLEMS = Math.max(7, ordered.filter(p => p.source === 'plan').length);
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
      return layoutRelationMap(map);
    }

    // ---- AIで作る（決まりを守った構造化データを1回で返してもらい、画面の中で確かめて描く） ----
    function rmParseAiJsonObject(text) {
      const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
      const a = t.indexOf('{'), b = t.lastIndexOf('}');
      if (a < 0 || b <= a) throw new Error('AIの答えから関連図の形（JSON）を読み取れませんでした');
      return JSON.parse(t.slice(a, b + 1));
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
          source: (n.k ?? n.knowledge) ? 'knowledge' : 'ai', priority: Number(n.p ?? n.priority) || 0, x: 0, y: 0, itemIds: [] });
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
      return layoutRelationMap(map);
    }
    // AIに送る記録はしぼる（入力のトークンを抑える）：項目名のあるカード・症状のS・異常のあるO・治療・不安の言葉
    function rmSelectCardsForAi(items, max = 70) {
      const score = i => {
        const t = String(i.text || '');
        if (i.fieldLabel && /診断|病名|主訴|現病歴|既往|手術|術式|生活歴|喫煙/.test(i.fieldLabel)) return 10;
        if (/術|麻酔|ドレーン|カテーテル|酸素|PCA|鎮痛|輸液|点滴/.test(t)) return 8;
        if (i.type === 's' && /痛|苦し|息|不安|心配|迷惑|眠れ|食|だる/.test(t)) return 7;
        if (/↑|↓|NRS|SpO2|WBC|CRP|Alb|BNP|Hb|体重|浮腫|痰|咳|発熱|ふらつ/.test(t)) return 6;
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
1 全部は載せない。優先：生命に関わる→今の看護問題につながる→病態の説明に必要→治療・処置→合併症の予測→ADL・心理社会。看護問題との関連が弱いプロフィールは省く。四角は全部で15〜35個。
2 病態の矢印は原因→結果。治療は「治療→治療の対象」（例：胃全摘出術→胃がん、鎮痛薬・硬膜外PCA→創部痛、酸素投与→酸素化の低下）でrはtreats。治療は1つずつ別の四角。同じ2つの間に両向きの矢印は禁止。
3 患者に実際に起きた事実はo=1。今後起こりうること・リスクはo=0、その矢印はx=1。記録に無いことを事実にしない。医学知識で補った中間過程はk=1。
4 検査データはt=labで値を書く（例：WBC 11600/μL、Alb 4.1→3.5g/dL）。値だけでなく、何を示すかの四角へつなぐ。術後のWBC・CRP上昇は手術侵襲による炎症反応との見分けが必要で、感染と断定しない。
5 看護問題（t=nursing_problem）はpに優先順位（1から）。生命→呼吸・循環→術後合併症→疼痛→栄養→活動→心理社会を目安に、この患者で判断。各看護問題へは、左の事実から矢印をたどって根拠に届くこと。複数の原因が1つの問題へ合流する形にする。${plans.length ? '看護問題は下の「看護計画の看護問題」を使う。' : dx.length ? '看護問題は下の「選んだ看護診断」を使う。' : ''}
6 どこにもつながらない四角・同じ内容の重複は作らない。同じ情報は1つの四角から枝分かれさせる。
7 各矢印のeに「なぜAからBか」を30字以内。各四角のeに記録の根拠を20字以内（知識で補ったものは空でよい）。
【形】JSONだけを返す：{"n":[{"i":"n1","t":"種類","l":"文字(30字以内)","o":1,"k":0,"p":0,"e":"根拠"}],"e":[{"s":"n1","d":"n2","r":"関係","x":0,"e":"理由"}]}
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
        rmShowCheck(validateRelationMap(map));
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

    // ---- 画面の状態 ----
    const rmState = { patientId: null, selected: null, connectFrom: null, zoom: 1, undo: [], redo: [], drag: null, lastTap: null };
    function rmMap(cp = getCurrentPatient()) {
      if (!cp) return null;
      if (cp.relationMap && !cp.relationMap.__normalized) {
        const m = normalizeRelationMap(cp.relationMap);
        if (!m) return null;
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
      rmShowCheck(validateRelationMap(map));
      showToast(`記録から関連図を作りました（${map.nodes.length}個）。※知識の四角は医学知識で補った過程です。病態のつながりを確かめて直してください`, 'success', 7000);
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
        wrap.innerHTML = has ? relationMapSvg(map, { interactive: true, zoom: rmState.zoom, title: `${cp.title || ''}の関連図` }) : '';
        wrap.scrollLeft = keep.left; wrap.scrollTop = keep.top;
        wrap.classList.toggle('is-connecting', !!rmState.connectFrom);
        if (has) rmApplySelectionClasses();
      }
      const legend = document.getElementById('rm-legend');
      if (legend && !legend.dataset.ready) { legend.innerHTML = rmLegendHtml(); legend.dataset.ready = '1'; }
      const info = document.getElementById('rm-info');
      if (info) info.textContent = has ? `${map.nodes.length}個の四角・${map.edges.length}本の矢印・看護問題${map.nodes.filter(n => n.type === 'nursing_problem').length}個${map.updatedAt ? `（最終更新 ${new Date(map.updatedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}）` : ''}` : '';
      rmRenderSelectionBar();
      rmRenderToolbarState();
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
      if (!map || !sel) { bar.innerHTML = '<span class="rm-sel-hint">四角を押すと、文字の編集・種類・事実／予測・矢印でつなぐ・削除ができます（2回続けて押すと文字の編集）。矢印を押すと、向き・種類・事実／予測・「なぜ？」が選べます。</span>'; return; }
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
          ${rmBtn('reverse', '<i class="fa-solid fa-right-left"></i> 向きを逆に')}
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
    async function rmAddNode(type) {
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
        // 「全体」は図全体が入る大きさ。作った直後（fit-readable）は、文字が読める大きさ（6割）より小さくしない
        if (wrap && map && map.nodes.length) { const b = rmBounds(map); rmState.zoom = Math.max(factor === 'fit' ? 0.25 : 0.62, Math.min(1.2, Math.min((wrap.clientWidth - 8) / b.w, (wrap.clientHeight - 8) / b.h))); }
        else rmState.zoom = 1;
      } else rmState.zoom = Math.max(0.25, Math.min(2, Math.round(rmState.zoom * factor * 100) / 100));
      renderRelationMap();
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
    function rmClientToMap(e) {
      const svg = document.querySelector('#rm-canvas-wrap svg');
      if (!svg) return { x: 0, y: 0 };
      const r = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      return { x: vb.x + (e.clientX - r.left) / rmState.zoom, y: vb.y + (e.clientY - r.top) / rmState.zoom };
    }
    function initRelationMapUi() {
      const view = document.getElementById('view-relation');
      if (!view || view.dataset.ready) return;
      view.dataset.ready = '1';
      view.addEventListener('click', e => {
        const btn = e.target.closest('[data-rm-action]');
        if (!btn || btn.tagName === 'SELECT') return;
        const act = btn.dataset.rmAction;
        const sel = rmState.selected;
        if (act === 'build-rules') rmBuild();
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
        else if (act === 'print') rmPrint();
        else if (act === 'png') rmSavePng();
        else if (act === 'clear') rmClearAll();
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
        else if (act === 'reverse') rmMutate(m => { const x = m.edges.find(y => y.id === sel.id); if (x) { const t = x.source; x.source = x.target; x.target = t; } });
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
      wrap.addEventListener('pointerdown', e => {
        if (e.button !== undefined && e.button !== 0) return;
        const g = e.target.closest('.rm-node');
        const lg = e.target.closest('.rm-link');
        if (g) {
          const map = rmMap();
          const node = map && rmNodeById(map, g.dataset.nodeId);
          if (!node) return;
          const p = rmClientToMap(e);
          rmState.drag = { id: node.id, dx: p.x - node.x, dy: p.y - node.y, sx: e.clientX, sy: e.clientY, moved: false, before: rmSnapshot(getCurrentPatient()), pointerId: e.pointerId };
          try { wrap.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
          e.preventDefault();
        } else if (lg) {
          if (!rmState.connectFrom) rmSelect({ type: 'edge', id: lg.dataset.linkId });
        } else if (e.target.closest('svg')) {
          if (rmState.connectFrom) { rmState.connectFrom = null; rmApplySelectionClasses(); rmRenderSelectionBar(); return; }
          if (rmState.selected) rmSelect(null);
        }
      });
      wrap.addEventListener('pointermove', e => {
        const d = rmState.drag;
        if (!d || d.pointerId !== e.pointerId) return;
        if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
        d.moved = true;
        const map = rmMap();
        const node = map && rmNodeById(map, d.id);
        if (!node) return;
        const p = rmClientToMap(e);
        node.x = Math.round(p.x - d.dx); node.y = Math.round(p.y - d.dy);
        const g = wrap.querySelector(`.rm-node[data-node-id="${rmCssEsc(node.id)}"]`);
        if (g) g.setAttribute('transform', `translate(${node.x},${node.y})`);
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; rmRenderEdgesOnly(map); });
      });
      const endDrag = e => {
        const d = rmState.drag;
        if (!d || (e && d.pointerId !== e.pointerId)) return;
        rmState.drag = null;
        const cp = getCurrentPatient();
        if (d.moved) {
          rmState.undo.push(d.before);
          if (rmState.undo.length > RM_UNDO_MAX) rmState.undo.shift();
          rmState.redo = [];
          rmCommit(cp, rmMap(cp));
        } else if (rmState.connectFrom) rmConnectTo(d.id);
        else {
          // 同じ四角を続けて2回押したら文字の編集（pointerdown で既定の動きを止めているため、dblclick は使わない）
          const now = Date.now();
          const last = rmState.lastTap;
          rmState.lastTap = { id: d.id, at: now };
          if (last && last.id === d.id && now - last.at < 450) { rmState.lastTap = null; rmSelect({ type: 'node', id: d.id }); rmEditNodeText(d.id); }
          else rmSelect({ type: 'node', id: d.id });
        }
      };
      wrap.addEventListener('pointerup', endDrag);
      wrap.addEventListener('pointercancel', endDrag);
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
  Object.assign(module.exports, { RM_TYPES, RM_RELATIONS, rmWrapText, rmDisplayLabel, normalizeRelationMap, layoutRelationMap, buildRelationMapFromRecord, relationMapFromAiJson, rmParseAiJsonObject, buildRelationMapPrompt, relationMapSvg, relationMapPrintHtml, rmRouteEdges, rmRoutePath, rmRect, validateRelationMap, rmApplyFixes, rmProblemCategory, rmSelectCardsForAi });
}
