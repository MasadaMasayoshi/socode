// 重点アセスメント：欲求ごとに、S・O（入院前／入院後）→ 情報の分析・解釈 → 統合 → 看護問題の明確化を一画面で書く。
// S・Oは分類ボードの内容から自動で並べ、分析・解釈／統合／看護問題の明確化も、記録・充足判定・看護計画（関連図の看護問題）から自動で下書きする。手で直した欄は自動では上書きしない（myAssessments の追加項目に保存）。

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['18'] = 'v.248'; // Version stamp (scripts/stamp-version.js)

    const FOCUS_FIELDS = [
      { key: 'focusAnalysis', label: '情報の分析・解釈', ph: 'S・Oの情報から、なぜその状態なのか（原因・関連要因）、今後どうなりそうかを書きます。\n例：術後は疼痛（O-3）と荷重への不安（S-2）から、歩行を避けて活動量が低下している。' },
      { key: 'focusIntegration', label: '統合', ph: '分析・解釈をまとめ、この欲求の全体像（満たされている／いない、その理由）を書きます。' },
      { key: 'focusProblem', label: '看護問題の明確化', ph: '例：右大腿骨人工骨頭置換術後、疼痛と荷重への不安により歩行が困難である。' }
    ];
    let focusNeedId = null;

    function focusSelectedNeed(cp) {
      if (focusNeedId && HENDERSON_NEEDS.some(n => n.id === focusNeedId)) return focusNeedId;
      const withData = HENDERSON_NEEDS.find(n => myNeedRecordItems(cp, n.id).length);
      return (withData || HENDERSON_NEEDS[0]).id;
    }
    function focusEntry(cp, needId) { return (cp.myAssessments && cp.myAssessments[needId]) || null; }
    function focusHasText(cp, needId) {
      const e = focusEntry(cp, needId);
      return !!e && FOCUS_FIELDS.some(f => String(e[f.key] || '').trim());
    }

    function focusItemsByColumn(cp, needId) {
      const items = myNeedRecordItems(cp, needId);
      const labels = assessmentSeqLabels(items, needId);
      const cols = { preadmission: [], postadmission: [], unclassified: [] };
      items.forEach(i => { const c = i.assessmentCols?.[needId] || 'unclassified'; (cols[c] || cols.unclassified).push(i); });
      return { labels, cols };
    }

    function focusCellHtml(needId, type, data) {
      const COLS = [['preadmission', '入院前'], ['postadmission', '入院後'], ['unclassified', '未分類']];
      let html = '';
      COLS.forEach(([col, title]) => {
        let list = data.cols[col].filter(i => i.type === type);
        if (!list.length) return;
        if (typeof collapseVitalCards === 'function') list = collapseLabCards(collapseVitalCards(list, needId), needId);
        html += `<div class="fa-sub">${title}</div>`;
        assessmentDayGroups(col, list).forEach(g => {
          if (g.day) html += `<div class="fa-day${g.background ? ' fa-bg' : ''}">${escapeHtml(g.day)}</div>`;
          g.items.forEach(i => {
            const ts = i.timestamp && !['日時不明', '自動推定', 'AI推定'].includes(i.timestamp) ? `<span class="fa-ts">${escapeHtml(i.timestamp)}</span>` : '';
            html += `<div class="fa-card"><b>${escapeHtml(data.labels[i.id] || '')}</b> ${ts}${escapeHtml(i.text).replace(/\n/g, '<br>')}</div>`;
          });
        });
      });
      return html || '<div class="fa-empty">この欲求に分類された情報はありません</div>';
    }


    // ---- 自動作成：記録・充足判定・看護計画（関連図由来の看護問題）から、分析・解釈／統合／看護問題を下書きする ----
    function focusClip(t, n = 40) {
      const x = String(t || '').replace(/\s+/g, ' ').replace(/^\[[^\]]{1,10}\]\s*/, '').replace(/^[^:：「]{1,10}[:：]\s*/, '').replace(/[「」]/g, '').replace(/[。.]+$/, '').trim();
      if (x.length <= n * 1.8) return x; const lim = x.slice(0, Math.floor(n * 1.8)); const k = Math.max(lim.lastIndexOf('、'), lim.lastIndexOf(' '), lim.lastIndexOf('。')); return k >= n * 0.5 ? x.slice(0, k) : (x.length <= 100 ? x : lim);
    }
    function focusNeedName(needId) { return String((HENDERSON_NEEDS.find(n => n.id === needId) || {}).name || '').replace(/^\d+\.\s*/, ''); }
    function focusPlansForNeed(cp, needId, itemIds) {
      const list = typeof carePlanList === 'function' ? carePlanList(cp) : [];
      // この欲求に関係すると決まっている看護問題だけを出す。関係する欲求が未設定の問題だけ、根拠カードの重なりで補う（他の欲求の問題が混ざらないように）。
      return list.filter(p => (p.relatedNeeds || []).length ? p.relatedNeeds.includes(needId) : (p.evidenceIds || []).some(id => itemIds.has(id)));
    }
    function focusLabelsOf(ids, labels) {
      const out = [...new Set((ids || []).map(id => labels[id]).filter(Boolean))];
      return out.length ? `（${out.join('・')}）` : '';
    }
    function focusQuoteList(facts, items, labels) {
      return (facts || []).slice(0, 3).map(f => `「${focusClip(f.text, 30)}」${focusLabelsOf([f.id], labels)}`).join('、');
    }

    // ---- 関連図・看護計画との連動 ----
    function focusProbKey(t) { return String(t || '').replace(/（候補）$/, '').replace(/\s+/g, ''); }
    function focusMapNodeOf(cp, plan) {
      const nodes = cp.relationMap && Array.isArray(cp.relationMap.nodes) ? cp.relationMap.nodes : [];
      const key = focusProbKey(plan.problem);
      return nodes.find(n => n.type === 'nursing_problem' && focusProbKey(n.label) === key) || null;
    }
    // 関連図で、その看護問題へ入ってくる矢印をさかのぼり、病態・症状・治療の四角を最大3つ拾う
    // 関連図の上流のノードを、役割（原因・関連要因／症状・状態／実施中の介入）に分ける。介入や症状を「原因」として並べない。
    const FOCUS_INTERVENTION_RE = /鎮痛薬?|鎮痛剤|投与|内服|点滴|見守り|介助(?:で|下|により)|訓練|リハビリ(?!室)|移乗し|指導|ストッキング|ドレナージ/;
    const FOCUS_RESTRICT_RE = /安静|固定|制限|禁止|荷重|牽引|術式|麻酔|手術|カテーテル|ライン|ドレーン/;
    function focusMapChainRoles(cp, node) {
      const map = cp.relationMap; const out = { causes: [], symptoms: [], interventions: [] };
      if (!map || !node || !Array.isArray(map.edges)) return out;
      const byId = new Map(map.nodes.map(n => [n.id, n]));
      const seen = new Set([node.id]); let frontier = [node.id];
      for (let depth = 0; depth < 3 && frontier.length; depth++) {
        const next = [];
        frontier.forEach(id => map.edges.filter(e => e.target === id).forEach(e => {
          const n = byId.get(e.source);
          if (!n || seen.has(n.id)) return;
          seen.add(n.id); next.push(n.id);
          const label = focusClip(n.label, 30);
          if (n.type === 'symptom') out.symptoms.push(label);
          else if (FOCUS_INTERVENTION_RE.test(n.label) && !FOCUS_RESTRICT_RE.test(n.label)) out.interventions.push(label);
          else if (['pathophysiology', 'treatment', 'disease'].includes(n.type)) out.causes.push(label);
        }));
        frontier = next;
      }
      Object.keys(out).forEach(k => { out[k] = [...new Set(out[k])].slice(0, 3); });
      return out;
    }
    function focusMapChain(cp, node) {
      const map = cp.relationMap;
      if (!map || !node || !Array.isArray(map.edges)) return [];
      const byId = new Map(map.nodes.map(n => [n.id, n]));
      const out = [], seen = new Set([node.id]);
      let frontier = [node.id];
      for (let depth = 0; depth < 3 && frontier.length && out.length < 3; depth++) {
        const next = [];
        frontier.forEach(id => map.edges.filter(e => e.target === id).forEach(e => {
          const n = byId.get(e.source);
          if (!n || seen.has(n.id)) return;
          seen.add(n.id); next.push(n.id);
          if (['pathophysiology', 'symptom', 'treatment', 'disease'].includes(n.type) && out.length < 3) out.push(focusClip(n.label, 26));
        }));
        frontier = next;
      }
      return out;
    }
    function focusLinksHtml(cp, plans) {
      if (!plans.length) return '';
      return `<div class="fa-links"><div class="fa-sub">関連図・看護計画で開く</div>${plans.slice(0, 8).map(p => {
        const node = focusMapNodeOf(cp, p);
        return `<div class="fa-link-row"><span>${escapeHtml(focusClip(p.problem, 28))}</span>${node ? `<button type="button" class="btn btn-outline" onclick="focusOpenMap('${node.id}')">関連図</button>` : ''}<button type="button" class="btn btn-outline" onclick="focusOpenPlan('${p.id}')">看護計画</button></div>`;
      }).join('')}</div>`;
    }
    window.focusOpenMap = function(nodeId) {
      if (typeof rmFocusProblems !== 'function') return;
      switchView('relation');
      rmFocusProblems([nodeId]);
    };
    window.focusOpenPlan = function(planId) {
      switchView('careplan');
      if (typeof carePlanOpen !== 'undefined') carePlanOpen.add(planId);
      if (typeof renderCarePlans === 'function') renderCarePlans();
      setTimeout(() => { [...document.querySelectorAll('.cp-card[data-care-plan-id]')].find(el => el.dataset.carePlanId === planId)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 60);
    };
    window.openFocusForNeed = function(needId) { focusNeedId = Number(needId); switchView('focus'); };
    window.openFocusForProblem = function(label) {
      const cp = getCurrentPatient();
      const plan = (typeof carePlanList === 'function' ? carePlanList(cp) : []).find(p => focusProbKey(p.problem) === focusProbKey(label));
      const need = plan && (plan.relatedNeeds || [])[0];
      focusNeedId = need || focusNeedId;
      switchView('focus');
    };
    // 指定した日の記録のうち、判定（充足／未充足）の根拠になった一文を拾う
    function focusDayClause(cp, needId, day, v) {
      const rows = (cp.items || []).filter(i => i && !i.deleted && i.type !== 'unnecessary' && (i.hendersonIds || []).includes(needId) && typeof suffDayOf === 'function' && suffDayOf(i) === day);
      for (const i of rows) {
        let r = null; try { r = sufficiencyCardVerdict(i, needId, 'post'); } catch (e) { r = null; }
        if (r && r.v === v && r.clause) return { text: String(r.clause).replace(/^[「『]|[」』]$/g, ''), id: i.id };
      }
      return null;
    }
    function buildFocusDraft(cp, needId) {
      const data = focusItemsByColumn(cp, needId);
      const all = [...data.cols.preadmission, ...data.cols.postadmission, ...data.cols.unclassified];
      const name = focusNeedName(needId);
      const itemIds = new Set(all.map(i => i.id));
      const res = (typeof ruleSufficiencyFor === 'function' ? ruleSufficiencyFor(cp)[needId] : null) || {};
      const a = res.all || {};
      const verdict = a.verdict === 'met' ? 'met' : a.verdict === 'unmet' ? 'unmet' : a.verdict === 'conflict' ? 'hold' : 'unknown';
      const prog = a.progress || { value: 'unknown' };
      const dims = a.dimensions || null;
      const plans = focusPlansForNeed(cp, needId, itemIds);
      const stat = p => (typeof cvProblemStatus === 'function' ? cvProblemStatus(cp, p) : { kind: 'actual', label: '' });
      const established = plans.filter(p => stat(p).kind !== 'candidate').slice(0, 4);
      const candidates = plans.filter(p => stat(p).kind === 'candidate').slice(0, 3);
      const subj = /^[A-ZＡ-Ｚ][氏さん]|氏$|さん$/.test(String(cp.title || '').trim()) ? String(cp.title).trim() : '患者';
      const first = (list, type) => list.filter(i => i.type === type).slice(0, 2);
      const phrase = list => list.map(i => `${focusClip(i.text, 36)}${focusLabelsOf([i.id], data.labels)}`).join('、');
      const nonBg = list => list.filter(i => !(typeof isAssessmentBackgroundItem === 'function' && isAssessmentBackgroundItem(i)));
      const pre = [...first(nonBg(data.cols.preadmission), 'o'), ...first(nonBg(data.cols.preadmission), 's')].slice(0, 3);
      const phaseOf = i => { const c = i.assessmentCols && i.assessmentCols[needId]; if (c === 'preadmission' || c === 'postadmission') return c; const ts = String(i.timestamp || ''); if (/入院前|術前の/.test(ts)) return 'preadmission'; if (ts || (typeof suffDayOf === 'function' && suffDayOf(i) !== null)) return 'postadmission'; return 'preadmission'; };
      const preSet = all.filter(i => phaseOf(i) === 'preadmission');
      const postAll = all.filter(i => phaseOf(i) === 'postadmission');
      const days = postAll.map(i => (typeof suffDayOf === 'function' ? suffDayOf(i) : null));
      const lastDay = days.length && days.every(d => d !== null) ? Math.max(...days) : null;
      const postLatest = lastDay === null ? postAll : postAll.filter(i => suffDayOf(i) === lastDay);
      const post = [...first(nonBg(postLatest), 'o'), ...first(nonBg(postLatest), 's')].slice(0, 3);
      const postIds = new Set(postLatest.map(i => i.id));
      const vWord = { met: '概ね満たされている', unmet: '満たされていない', hold: '判定を保留する状態', unknown: '判断できる情報が足りない' }[verdict];
      const quoteOf = list => focusQuoteList(list, all, data.labels);
      const reasons = typeof crTopicsForNeed === 'function' ? crTopicsForNeed(cp, needId) : [];
      const para = [];
      const lab = i => focusLabelsOf([i.id], data.labels);
      const cl = (t, n) => focusClip(t, n);
      const sMeaning = t => /不安|怖|こわ|ずれ|脱臼/.test(t) ? '動くことへの不安が、動作や荷重を控えさせている可能性がある'
        : /遠慮|迷惑|負担|頼れ|申し訳|情けな/.test(t) ? '他者に頼ることへの遠慮や自尊心の揺らぎがあり、援助を求めにくい可能性がある'
        : /早く|したい|行きたい|会いたい|帰りたい|頑張/.test(t) ? '回復や自立への意欲があり、これが関わりの手がかりになる'
        : /痛|つら|眠れ|苦し/.test(t) ? '苦痛が本人の行動や休息に影響している' : '';
      if (!all.length) {
        para.push(`この欲求に分類された情報がまだない。${name}について、入院前の生活と入院後の状態を確認する必要がある。`);
      } else {
        const EVENT_RE = /骨折|救急車|搬送|受傷|診断|術式|手術|人工|置換/;
        const events = preSet.filter(i => EVENT_RE.test(i.text) && !/既往|通院/.test(i.text)).slice(0, 2);
        const preAll = preSet.filter(i => (i.type === 'o' || i.type === 's') && !events.includes(i)).slice(0, 5);
        const dayOf = i => (typeof suffDayOf === 'function' ? suffDayOf(i) : null);
        const postRows = postAll.filter(i => !/[〜~]\s*術後\d+日目まで/.test(i.text) && !(typeof isAssessmentBackgroundItem === 'function' && isAssessmentBackgroundItem(i)) && !(typeof cvHeadingOnly === 'function' && cvHeadingOnly(i)) && !(typeof cvOffTopic === 'function' && cvOffTopic(needId, i.text)));
        // 1. 入院前の生活
        if (preAll.length) para.push(`${subj}の入院前の状況は、${preAll.map(i => `${cl(i.text, 60)}${lab(i)}`).join('、')}。`);
        else para.push(`入院前の${name}の状況は、記録からは確認できない。`);
        if (events.length) para.push(`今回は${events.map(i => `${cl(i.text, 50)}${lab(i)}`).join('、')}という経過で入院している。`);
        // 2. 疾患・治療と身体への影響（患者の記録に根拠があるものだけ）
        const chains = established.slice(0, 2).map(p => ({ p, ch: focusMapChainRoles(cp, focusMapNodeOf(cp, p)).causes })).filter(x => x.ch.length);
        if (chains.length) para.push(chains.map(x => `${x.ch.slice().reverse().join('、')}が背景にあり、${cl(x.p.problem, 30)}につながりやすい状態にある`).join('。また、') + '。');
        reasons.slice(0, 2).forEach(r => crNarrative(r, data.labels).forEach(x => para.push(x)));
        // 3. 入院後の変化（日ごと。新しい所見ほど後ろ）
        const dated = postRows.filter(i => dayOf(i) !== null).sort((x, y) => dayOf(x) - dayOf(y));
        const byDay = new Map(); dated.forEach(i => { if (!byDay.has(dayOf(i))) byDay.set(dayOf(i), []); byDay.get(dayOf(i)).push(i); });
        const dayKeys = [...byDay.keys()].slice(-3);
        if (dayKeys.length) para.push(dayKeys.map(d => `${d}日目は${byDay.get(d).slice(0, 2).map(i => `${cl(i.text, 50)}${lab(i)}`).join('、')}`).join('。') + `。${prog.value === 'improving' ? '前の日と比べて改善がみられる。' : prog.value === 'worsening' ? '前の日と比べて悪化がみられる。' : ''}`);
        else if (postRows.length) para.push(`入院後は${postRows.slice(0, 3).map(i => `${cl(i.text, 50)}${lab(i)}`).join('、')}。`);
        // 4. 個別的な解釈（患者の言葉の意味・強み）
        const words = postAll.concat(preSet).filter(i => i.type === 's').map(i => { const q = String(i.text).match(/「([^」]{3,60})」/); return q ? { i, q: q[1], m: sMeaning(q[1]) } : null; }).filter(x => x && x.m).slice(0, 3);
        words.forEach((x, k) => para.push(`${k === 0 ? '' : 'また、'}「${cl(x.q, 40)}」${lab(x.i)}という言葉から、${x.m}と考える。`));
        const okDims = (dims || []).filter(d => d.state === 'ok').map(d => d.label);
        const strengths = (a.facts && a.facts.for || []).filter(f => postIds.has(f.id) && /自立|可能|できて|できた|自力|保たれ|良好|問題な|不具合はない/.test(f.text)).slice(0, 2);
        if (okDims.length) para.push(`${okDims.join('・')}は保たれており、残存能力として活かす。`);
        else if (strengths.length) para.push(`${strengths.map(f => `「${cl(f.text, 40)}」${focusLabelsOf([f.id], data.labels)}`).join('、')}という状況は保たれており、これを活かして自立を促す。`);
        // 5. 判断と根拠
        const evFacts = verdict === 'met' ? a.facts && a.facts.for : a.facts && a.facts.against;
        const ev = quoteOf(evFacts);
        if (verdict === 'unknown') para.push(`${name}の充足を判断するには情報が足りない。${[res.pre && res.pre.need, res.post && res.post.need].filter(Boolean).join('、')}`.replace(/、$/, '') + '。');
        else if (a.dimensionConflict) para.push(`${a.reason}ことから、${name}は${vWord}と判断する。`);
        else para.push(`${ev ? ev + 'ことから、' : ''}${name}は${vWord}と判断する。`);
        // 6. 回復を妨げる要因と将来のリスク
        established.filter(p => stat(p).kind !== 'risk').slice(0, 3).forEach(p => { if (p.note) para.push(`${cl(p.note, 60)}${focusLabelsOf(p.evidenceIds, data.labels)}ため、${cl(p.problem, 30)}が現在の問題である。`); });
        const riskP = established.filter(p => stat(p).kind === 'risk').slice(0, 3);
        const comp = typeof complicationCandidates === 'function' ? complicationCandidates(cp, needId, all.map(i => i.text).join(' ')).slice(0, 2) : [];
        if (riskP.length || comp.length) para.push(`今後は${(() => { const rs = riskP.map(p => cl(p.problem, 30)); const root = t => String(t).replace(/リスク状態.*$|（.*$/, '').replace(/^.*の/, '').replace(/[・･]/g, '').slice(0, 4); const extra = comp.map(c => String(c).replace(/（.*$/, '')).filter(c => !rs.some(r => root(r) && c.replace(/[・･]/g, '').includes(root(r).replace(/[・･]/g, '')))); return [...rs, ...extra].filter((v, k, arr) => arr.indexOf(v) === k); })().join('、')}の可能性があり、起こるとは限らないが予防的な観察が必要である。`);
        const life = preSet.concat(postAll).find(i => /階段|2階|二階|一人暮らし|独居|段差|エレベーター|布団をひ/.test(i.text) && !/痛/.test(i.text));
        if (life && verdict !== 'met') para.push(`退院後は「${cl(life.text, 40)}」${lab(life)}という生活環境に合わせて、安全な動作と移動の方法を身につける必要がある。`);
        // 7. 必要な看護
        const ops = [...new Set(established.flatMap(p => (p.op || []).slice(0, 1)).map(t => cl(t, 40).replace(/(?:を|について)?(?:観察|確認|測定|把握)(?:する)?$/, '')))].filter(Boolean).slice(0, 3);
        if (ops.length && verdict !== 'met') para.push(`優先して${ops.join('、')}を観察し、本人の力で行える部分は見守り、できない部分を補う。`);
        const lack = (dims || []).filter(d => d.state === 'none').map(d => d.label);
        if (lack.length && verdict !== 'unknown') para.push(`${lack.join('・')}の記録がないため、確認して判断を確かにする。`);
        if (candidates.length) para.push(`${candidates.map(p => cl(p.problem, 24)).join('、')}は、根拠となる記録がそろっておらず、確認が必要である。`);
      }
      const analysis = para;
      const integration = [];
      if (all.length) {
        const prgW = prog.label && prog.value !== 'unknown' ? `（${prog.label}）` : '';
        const ngDims = (dims || []).filter(d => d.state === 'ng').map(d => d.label);
        const okD = (dims || []).filter(d => d.state === 'ok').map(d => d.label);
        const actualP = established.filter(p => stat(p).kind !== 'risk'), riskP2 = established.filter(p => stat(p).kind === 'risk');
        let t = `${name}は${vWord}${prgW}。`;
        if (verdict !== 'unknown') {
          if (ngDims.length) t += `主な未充足の要因は${ngDims.join('・')}である。`;
          if (okD.length) t += `一方、${okD.join('・')}は保たれている。`;
          if (actualP.length) t += `現在残る問題は${actualP.map(p => focusClip(p.problem, 24)).join('、')}で、`;
          if (riskP2.length) t += `${actualP.length ? '加えて' : ''}${riskP2.map(p => focusClip(p.problem, 24)).join('、')}を予防する必要がある。`;
          else if (actualP.length) t += '解消に向けた援助が要る。';
          if (established.length) t += `残存能力を活かし、${established.length > 1 ? '優先順位をつけて' : ''}自立に向けた援助を進める。`;
          else if (verdict === 'met') t += '現時点で看護問題は挙がらない。';
        }
        integration.push(t);
      }
      let problem = established.length
        ? `よって、${established.map(p => focusClip(p.problem, 34)).join('、')}が、この欲求から明確になる看護問題である。\n` + established.map((p, i) => { const rl = focusMapChainRoles(cp, focusMapNodeOf(cp, p)); const ch = rl.causes; const evl = [...new Set((p.evidenceIds || []).map(id => data.labels[id]).filter(Boolean))]; const oth = (p.relatedNeeds || []).filter(n => n !== needId).map(n => focusNeedName(n)); return `#${i + 1} ${p.problem}（${stat(p).label}）${ch.length ? `\n　関連要因：${ch.slice().reverse().join('、')}` : ''}${rl.symptoms.length ? `\n　症状・状態：${rl.symptoms.join('、')}` : ''}${rl.interventions.length ? `\n　実施中の介入：${rl.interventions.join('、')}` : ''}${p.note ? `\n　状態：${focusClip(p.note, 70)}` : ''}${evl.length ? `\n　根拠：${evl.join('・')}` : ''}${oth.length ? `\n　関連する欲求：${oth.join('・')}` : ''}`; }).join('\n') + (candidates.length ? `\n（根拠を確かめる候補：${candidates.map(p => focusClip(p.problem, 24)).join('、')}）` : '')
        : (all.length ? 'この欲求から明確になる看護問題は、現時点ではない。' : '');
      const cand2 = reasons.filter(r => r.status !== 'confirmed' && !established.some(p => r.topic.plan.test(p.problem)));
      if (cand2.length && !established.length) problem = '現時点で確定できる看護問題はないが、次の候補を追加のアセスメントで確かめる。';
      if (cand2.length) problem += (problem ? '\n' : '') + cand2.map(r => `（候補）${crProblemLine(r)}`).join('\n');
      return { focusAnalysis: analysis.join('\n'), focusIntegration: integration.join(''), focusProblem: problem };
    }

    // 空欄、または前回の自動作成のまま（自分で手を入れていない）の欄だけ、最新の下書きに更新する。手で直した欄は変えない。
    function applyFocusDraft(cp, needId, force = false) {
      if (!(cp.items || []).some(i => i.type !== 'unnecessary')) return false;
      const draft = buildFocusDraft(cp, needId);
      if (!cp.myAssessments || typeof cp.myAssessments !== 'object' || Array.isArray(cp.myAssessments)) cp.myAssessments = {};
      const e = cp.myAssessments[needId] || (cp.myAssessments[needId] = {});
      const auto = e.focusAuto && typeof e.focusAuto === 'object' ? e.focusAuto : (e.focusAuto = {});
      let changed = false;
      FOCUS_FIELDS.forEach(f => {
        const cur = String(e[f.key] || '');
        if (force || !cur.trim() || cur === auto[f.key]) {
          if (cur !== draft[f.key]) { e[f.key] = draft[f.key]; changed = true; }
          auto[f.key] = draft[f.key];
        }
      });
      if (changed) { e.updatedAt = new Date().toISOString(); saveMyAssessmentsSoon(cp.id); }
      return changed;
    }
    window.regenerateFocusAssessment = function() {
      const cp = getCurrentPatient();
      applyFocusDraft(cp, focusSelectedNeed(cp), true);
      renderFocusAssessment();
      showToast('記録から作り直しました', 'info');
    };

    function renderFocusAssessment() {
      const root = document.getElementById('focus-zoom');
      const pillBox = document.getElementById('focus-pills');
      if (!root) return;
      const cp = getCurrentPatient();
      const needId = focusSelectedNeed(cp);
      focusNeedId = needId;
      const need = HENDERSON_NEEDS.find(n => n.id === needId);
      applyFocusDraft(cp, needId);
      const data = focusItemsByColumn(cp, needId);
      const e = focusEntry(cp, needId) || {};
      const pills = HENDERSON_NEEDS.map(n => {
        const cnt = myNeedRecordItems(cp, n.id).length;
        return `<button type="button" class="fa-pill${n.id === needId ? ' active' : ''}${cnt ? '' : ' fa-none'}" onclick="focusSelectNeed(${n.id})">${n.id}. ${escapeHtml(n.name)}${focusHasText(cp, n.id) ? '<span class="fa-dot" title="書き込みあり"></span>' : ''}<small>${cnt}</small></button>`;
      }).join('');
      const fields = FOCUS_FIELDS.map(f => `<div class="fa-col fa-edit"><div class="fa-head">${f.label}</div><textarea class="field fa-text" data-fa-need="${needId}" data-fa-field="${f.key}" placeholder="${escapeHtml(f.ph)}" oninput="onFocusInput(${needId}, '${f.key}', this)">${escapeHtml(e[f.key] || '')}</textarea>${f.key === 'focusProblem' ? focusLinksHtml(cp, focusPlansForNeed(cp, needId, new Set([...data.cols.preadmission, ...data.cols.postadmission, ...data.cols.unclassified].map(i => i.id)))) : ''}</div>`).join('');
      if (pillBox) pillBox.innerHTML = pills;
      root.innerHTML = `
        <div class="fa-title">項目：${needId}. ${escapeHtml(need.name)}</div>
        <div class="fa-grid">
          <div class="fa-col fa-s-col"><div class="fa-head">主観的情報（S）</div><div class="fa-cell">${focusCellHtml(needId, 's', data)}</div></div>
          <div class="fa-col fa-o-col"><div class="fa-head">客観的情報（O）</div><div class="fa-cell">${focusCellHtml(needId, 'o', data)}</div></div>
          ${fields}
        </div>`;
      focusApplyZoom();
    }

    window.focusSelectNeed = function(id) { focusNeedId = Number(id); renderFocusAssessment(); };
    const focusSaveTimers = {};
    window.onFocusInput = function(needId, field, el) {
      const cp = getCurrentPatient();
      if (!cp.myAssessments || typeof cp.myAssessments !== 'object' || Array.isArray(cp.myAssessments)) cp.myAssessments = {};
      const e = cp.myAssessments[needId] || (cp.myAssessments[needId] = {});
      e[field] = el.value;
      e.updatedAt = new Date().toISOString();
      if (focusSaveTimers[cp.id]) clearTimeout(focusSaveTimers[cp.id]);
      focusSaveTimers[cp.id] = setTimeout(() => { delete focusSaveTimers[cp.id]; saveMyAssessmentsNow(cp.id); }, 700);
    };
    window.copyFocusAssessment = function() {
      const cp = getCurrentPatient();
      const needId = focusSelectedNeed(cp);
      const need = HENDERSON_NEEDS.find(n => n.id === needId);
      const data = focusItemsByColumn(cp, needId);
      const e = focusEntry(cp, needId) || {};
      const lines = [`重点アセスメント　項目：${needId}. ${need.name}`];
      [['s', '主観的情報（S）'], ['o', '客観的情報（O）']].forEach(([t, title]) => {
        lines.push('', `■${title}`);
        ['preadmission', 'postadmission', 'unclassified'].forEach(col => {
          const list = data.cols[col].filter(i => i.type === t);
          if (list.length) { lines.push(`［${{ preadmission: '入院前', postadmission: '入院後', unclassified: '未分類' }[col]}］`); list.forEach(i => lines.push(`${data.labels[i.id] || ''} ${i.text}`)); }
        });
      });
      FOCUS_FIELDS.forEach(f => lines.push('', `■${f.label}`, String(e[f.key] || '')));
      const text = lines.join('\n');
      const done = () => showToast('重点アセスメントをコピーしました', 'info');
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => showToast('コピーできませんでした', 'warn')); else showToast('コピーできませんでした', 'warn');
    };

    // ---- 拡大・縮小（ピンチ／Ctrl+ホイール／ボタン）。縦横のスワイプは標準のスクロールで動かす ----
    const FOCUS_ZOOM_MIN = 0.4, FOCUS_ZOOM_MAX = 2.5;
    let focusZoom = 1;
    function focusApplyZoom() {
      const z = document.getElementById('focus-zoom');
      if (z) z.style.zoom = String(focusZoom);
      const l = document.getElementById('focus-zoom-label');
      if (l) l.textContent = `${Math.round(focusZoom * 100)}%`;
    }
    function focusSetZoom(v) {
      focusZoom = Math.min(FOCUS_ZOOM_MAX, Math.max(FOCUS_ZOOM_MIN, Math.round(v * 100) / 100));
      focusApplyZoom();
    }
    window.focusZoomBy = function(f) { focusSetZoom(focusZoom * f); };
    window.focusZoomFit = function() {
      const wrap = document.getElementById('focus-assessment-body'), z = document.getElementById('focus-zoom');
      if (!wrap || !z) return;
      const prev = z.style.zoom; z.style.zoom = '1';
      const need = z.scrollWidth || 1; z.style.zoom = prev;
      focusSetZoom(Math.min(1, (wrap.clientWidth - 4) / need));
    };
    window.focusZoomReset = function() { focusSetZoom(1); };
    function initFocusZoom() {
      const wrap = document.getElementById('focus-assessment-body');
      if (!wrap || wrap.dataset.faReady) return;
      wrap.dataset.faReady = '1';
      let d0 = 0, z0 = 1;
      const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) || 1;
      wrap.addEventListener('touchstart', e => { if (e.touches.length === 2) { d0 = dist(e.touches); z0 = focusZoom; } }, { passive: true });
      wrap.addEventListener('touchmove', e => { if (e.touches.length === 2 && d0) { e.preventDefault(); focusSetZoom(z0 * dist(e.touches) / d0); } }, { passive: false });
      wrap.addEventListener('touchend', e => { if (e.touches.length < 2) d0 = 0; }, { passive: true });
      wrap.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); focusSetZoom(focusZoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); } }, { passive: false });
    }
    try { if (typeof document !== 'undefined' && document.getElementById) initFocusZoom(); } catch (err) { /* offline test sandbox */ }

    // ---- 書き出し（印刷／PDF・テキスト） ----
    function focusExportNeeds(cp) {
      return HENDERSON_NEEDS.map(n => {
        const data = focusItemsByColumn(cp, n.id);
        const has = [...data.cols.preadmission, ...data.cols.postadmission, ...data.cols.unclassified].length > 0;
        const e = focusEntry(cp, n.id) || {};
        const draft = has ? buildFocusDraft(cp, n.id) : {};
        const vals = {}; FOCUS_FIELDS.forEach(f => { vals[f.key] = String(e[f.key] || '').trim() || draft[f.key] || ''; });
        return { need: n, data, has, vals };
      }).filter(r => r.has || FOCUS_FIELDS.some(f => r.vals[f.key]));
    }
    function focusPrintSection(cp, n) {
      const rows = focusExportNeeds(cp);
      if (!rows.length) return '';
      const cell = (type, r) => focusCellHtml(r.need.id, type, r.data).replace(/class="fa-/g, 'class="pfa-');
      const nl = t => escapeHtml(t).replace(/\n/g, '<br>');
      return `<h2>${n}. 重点アセスメント</h2>` + rows.map(r => `<h3>項目：${r.need.id}. ${escapeHtml(focusNeedName(r.need.id))}</h3><table class="pfa-table"><thead><tr><th>主観的情報（S）</th><th>客観的情報（O）</th><th>情報の分析・解釈</th><th>統合</th><th>看護問題の明確化</th></tr></thead><tbody><tr><td>${cell('s', r)}</td><td>${cell('o', r)}</td><td>${nl(r.vals.focusAnalysis)}</td><td>${nl(r.vals.focusIntegration)}</td><td>${nl(r.vals.focusProblem)}</td></tr></tbody></table>`).join('');
    }
    function focusAssessmentText(cp) {
      const rows = focusExportNeeds(cp);
      return rows.map(r => {
        const lines = [`【${r.need.id}. ${focusNeedName(r.need.id)}】`];
        [['s', '主観的情報（S）'], ['o', '客観的情報（O）']].forEach(([t, title]) => {
          lines.push(`■${title}`);
          ['preadmission', 'postadmission', 'unclassified'].forEach(col => {
            const list = r.data.cols[col].filter(i => i.type === t);
            if (list.length) { lines.push(`［${{ preadmission: '入院前', postadmission: '入院後', unclassified: '未分類' }[col]}］`); list.forEach(i => lines.push(`${r.data.labels[i.id] || ''} ${i.text}`)); }
          });
        });
        FOCUS_FIELDS.forEach(f => lines.push(`■${f.label}`, r.vals[f.key]));
        return lines.join('\n');
      }).join('\n\n');
    }

if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, { focusPrintSection, focusAssessmentText, buildFocusDraft, applyFocusDraft, renderFocusAssessment, focusItemsByColumn, focusCellHtml, FOCUS_FIELDS });
}
