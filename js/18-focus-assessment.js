// 重点アセスメント：欲求ごとに、S・O（入院前／入院後）→ 情報の分析・解釈 → 統合 → 看護問題の明確化を一画面で書く。
// S・Oは分類ボードの内容から自動で並べ、分析・解釈／統合／看護問題の明確化も、記録・充足判定・看護計画（関連図の看護問題）から自動で下書きする。手で直した欄は自動では上書きしない（myAssessments の追加項目に保存）。

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['18'] = 'v.259'; // Version stamp (scripts/stamp-version.js)

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
    // A record turned into a clause for the narrative. Unlike focusClip it keeps quotation marks and turns a field label into
    // 「labelは」 (タバコ：なし → タバコはなし); scene labels (検温・回診・昼食 ...) and heading words left at the edge of a card by the
    // layout (…理解良好、趣味) are dropped from the sentence only — the card itself is unchanged.
    const FOCUS_HEAD_WORD = '(?:性格|宗教|理解力|趣味|嗜好品?|清潔|更衣|身体的特徴|食事|排泄|活動|睡眠|職業|家族構成|家族歴|既往歴|生活様式|夕食|昼食|朝食)';
    function focusFact(t, n = 50, item) {
      const PROFILE = /^(?:保険|介護保険|職業|家族構成|趣味|性格|宗教|嗜好品?|生活様式)$/;
      if (item && item.fieldLabel && PROFILE.test(item.fieldLabel) && !String(t || '').startsWith(item.fieldLabel)) t = `${item.fieldLabel}：${t}`;
      t = String(t || '').replace(/^([^\t:：「」、。]{1,8})\t+/, '$1：');
      let x = String(t || '').normalize('NFKC').replace(/\s+/g, ' ').replace(/^\[[^\]]{1,10}\]\s*/, '').trim();
      x = x.replace(new RegExp('[、。]\\s*' + FOCUS_HEAD_WORD + '$'), '').replace(new RegExp('^' + FOCUS_HEAD_WORD + '[、]\\s*'), '');
      x = x.replace(/^(?:検温|回診|ケア|RH|リハビリ|昼食|夕食|朝食|処置|観察)\s*[:：。、]\s*/, '');
      x = x.replace(/^([^:：「」、。]{1,8})\s*[:：]\s*(?=\S)/, '$1は').replace(/、([^:：「」、。]{1,6})\s*[:：]\s*(?=\S)/g, '、$1');
      x = x.replace(/[。.]+$/, '');
      if (x.length <= n * 1.8) return x;
      const lim = x.slice(0, Math.floor(n * 1.8)); const k = Math.max(lim.lastIndexOf('、'), lim.lastIndexOf('。'));
      let out = k >= n * 0.5 ? x.slice(0, k) : lim;
      if ((out.match(/「/g) || []).length > (out.match(/」/g) || []).length) out += '…」';
      return out;
    }
    function focusIsHeadingCard(i) { return new RegExp('^' + FOCUS_HEAD_WORD + '$').test(String(i && i.text || '').normalize('NFKC').trim()); }
    // The need a problem is explained under (usual nursing convention); falls back to the first related need.
    const FOCUS_HOME_RULES = [[/気道|ガス交換|換気|無気肺|肺炎|呼吸/, 1], [/清潔|入浴|皮膚|褥瘡|更衣/, 8], [/栄養|摂取|嚥下|体液量|脱水|血糖/, 2], [/便秘|排尿|排便|尿閉|イレウス|失禁/, 3], [/睡眠/, 5], [/体温|発熱|低体温/, 7], [/感染|転倒|転落|血栓|塞栓|出血|せん妄|脱臼|損傷リスク/, 9], [/知識|自己管理|指導|学習/, 14], [/不安|恐怖|コミュニケーション/, 10], [/役割|家族/, 12], [/可動|移動|活動|疼痛|痛み|廃用|離床|セルフケア/, 4]];
    function focusHomeNeed(p) {
      const rel = (p && p.relatedNeeds) || [];
      const hit = FOCUS_HOME_RULES.find(([re, n]) => re.test(String(p && p.problem || '')) && (!rel.length || rel.includes(n)));
      if (!rel.length) return hit ? hit[1] : null;
      return hit ? hit[1] : rel[0];
    }
    // A recorded finding turned into a sentence ending (past for earlier days, present for the latest):
    // 「皮膚トラブル見られず」→「皮膚トラブルは見られなかった」, 「べたつきあり」→「べたつきがある」, 「…を実施」→「…を実施した」.
    function focusPredicate(t, present, label = '') {
      const x = String(t || '').replace(/[。.、\s]+$/, '').replace(/^([^:：「」、。]{1,8})\s*[:：]\s*(?=\S)/, '$1は').replace(/^(.{1,10}は)(不可|禁止)\s+/, '$1$2で、');
      let m;
      if ((m = x.match(/^(.*?)(?:は|も)?(?:見られず|みられず|認めず|認められず)$/))) return `${m[1]}は${present ? '見られない' : '見られなかった'}${label}`;
      if ((m = x.match(/^(.*?)(?:は|も)?(?:なし|無し)$/))) return `${m[1]}は${present ? 'ない' : 'なかった'}${label}`;
      if ((m = x.match(/^(.*?)(?:が)?(?:あり|有り)$/))) return `${m[1]}が${present ? 'ある' : 'あった'}${label}`;
      if ((m = x.match(/^(.*?)(?:を)?(?:実施|施行)$/))) return `${m[1]}を${present ? '実施している' : '実施した'}${label}`;
      if (!present && /ていない$/.test(x)) return `${x.replace(/^(?:現在|今)は/, '').replace(/ていない$/, 'ていなかった')}${label}`;
      if (/(?:る|た|い|だ|ない|ず)$/.test(x)) return `${x}${label}`;
      return `${x}${present ? 'である' : 'であった'}${label}`;
    }
    function focusNeedName(needId) { return String((HENDERSON_NEEDS.find(n => n.id === needId) || {}).name || '').replace(/^\d+\.\s*/, ''); }
    function focusPlansForNeed(cp, needId, itemIds) {
      const list = typeof carePlanList === 'function' ? carePlanList(cp) : [];
      // この欲求に関係すると決まっている看護問題だけを出す。関係する欲求が未設定の問題だけ、根拠カードの重なりで補う（他の欲求の問題が混ざらないように）。
      return list.filter(p => (p.relatedNeeds || []).length ? p.relatedNeeds.includes(needId) : (p.evidenceIds || []).some(id => itemIds.has(id)));
    }
    function focusLabelsOf(ids, labels) {
      const out = [...new Set((ids || []).map(id => labels[id]).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'ja', { numeric: true }));
      return out.length ? `（${out.join('・')}）` : '';
    }
    function focusQuoteList(facts, items, labels) {
      // Inner quotation marks become 『』 so a quoted remark inside the evidence stays readable.
      const bal = t => { let x = t; if (x.includes('』') && !x.includes('『')) x = x.replace(/』/g, ''); if (x.includes('『') && !x.includes('』')) x = x.replace(/『/g, ''); return x; };
      const clipQ = t => { const full = String(t || '').replace(/「/g, '『').replace(/」/g, '』'); const c = focusClip(full, 30); return focusClip(full, 1000).length > c.length || full.length >= 40 ? c + '…' : c; };
      // The same card or the same wording is quoted once.
      const seen = new Set();
      return (facts || []).filter(f => { const k = String(f.id); const w = String(f.text || '').replace(/[(（][^)）]*[)）]/g, '').trim(); if (seen.has(k) || seen.has(w)) return false; seen.add(k); seen.add(w); return true; }).slice(0, 3).map(f => `「${bal(clipQ(f.text))}」${focusLabelsOf([f.id], labels)}`).join('、');
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
          // A symptom predicted from general knowledge (排痰困難 when 自力排痰可能 is recorded) is not a symptom of this patient.
          if (n.type === 'symptom') { if (n.observed !== false && n.source !== 'knowledge') out.symptoms.push(label); }
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
      // The judgment describes the latest state: after surgery the post-operative phase, otherwise the in-hospital phase;
      // the whole-stay result is used only when those phases cannot be judged (progress is computed on the whole stay).
      const surgicalNow = typeof isSurgicalPatient === 'function' && isSurgicalPatient(cp);
      const phKey = surgicalNow && res.postop && res.postop.verdict && res.postop.verdict !== 'unknown' ? 'postop' : res.post && res.post.verdict && res.post.verdict !== 'unknown' ? 'post' : 'all';
      const a = phKey === 'all' ? (res.all || {}) : { ...(res[phKey] || {}), progress: (res.all || {}).progress, dimensions: (res[phKey] || {}).dimensions || (res.all || {}).dimensions };
      const verdict = a.verdict === 'met' ? 'met' : a.verdict === 'unmet' ? 'unmet' : a.verdict === 'conflict' ? 'hold' : 'unknown';
      const prog = a.progress || { value: 'unknown' };
      const dims = a.dimensions || null;
      const plans = focusPlansForNeed(cp, needId, itemIds);
      const stat = p => (typeof cvProblemStatus === 'function' ? cvProblemStatus(cp, p) : { kind: 'actual', label: '' });
      // A problem belongs to its main need (the first related need). In the other related needs it is only referred to, so the
      // same problem is not judged, summarised and listed again under every need.
      const isHomeP = p => { const h = focusHomeNeed(p); return h === null || h === needId; };
      const establishedAll = plans.filter(p => stat(p).kind !== 'candidate').slice(0, 6);
      const established = establishedAll.filter(isHomeP).slice(0, 4);
      const awayP = establishedAll.filter(p => !isHomeP(p)).slice(0, 3);
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
      const vWord = { met: '概ね満たされている', unmet: '満たされていない', hold: '判定保留の段階にある', unknown: '判断できる情報が足りない' }[verdict];
      const quoteOf = list => focusQuoteList(list, all, data.labels);
      const reasons = typeof crTopicsForNeed === 'function' ? crTopicsForNeed(cp, needId) : [];
      const para = [];
      const lab = i => focusLabelsOf([i.id], data.labels);
      const cl = (t, n) => focusClip(t, n);
      const sMeaning = t => needId === 14 && /わから|教えて|知りたい|気を付け/.test(t) ? '退院後の生活で何に気を付ければよいかを知りたいという関心があり、指導の手がかりになる'
        : needId === 14 && /[?？]|かしら|のかな|ですか/.test(t) ? '術後の動き方について確かな情報を求めており、不安の背景に知識の不足がある'
        : /不安|怖|こわ|ずれ|脱臼/.test(t) ? '動くことへの不安が、動作や荷重を控えさせている可能性がある'
        : /遠慮|迷惑|負担|頼れ|申し訳|情けな/.test(t) ? '他者に頼ることへの遠慮や自尊心の揺らぎがあり、援助を求めにくい可能性がある'
        : /早く|したい|行きたい|会いたい|帰りたい|頑張/.test(t) ? '回復や自立への意欲があり、これが関わりの手がかりになる'
        : /眠れた|楽になっ|ひどくなく|軽くなっ|和らい/.test(t) ? (/痛/.test(t) ? '痛みが和らぐとともに休息がとれるようになってきている' : '休息がとれるようになってきている')
        : /痛|つら|苦し/.test(t) ? '苦痛が本人の行動や休息に影響している'
        : /眠れ(?:な|ず)/.test(t) ? '十分な休息がとれていない' : '';
      if (!all.length) {
        para.push(`この欲求に分類された情報がまだない。${name}について、入院前の生活と入院後の状態を確認する必要がある。`);
      } else {
        const EVENT_RE = /骨折|救急車|搬送|受傷|診断|術式|手術|人工|置換/;
        // Admission-day records (主訴・受傷の経緯・診断) describe why the patient came in, not the life before admission.
        const atAdmission = i => /入院時|入院日|入院当日/.test(String(i.timestamp || '')) || i.fieldLabel === '主訴' || i.fieldLabel === '診断名';
        const events = preSet.filter(i => (EVENT_RE.test(i.text) || atAdmission(i)) && !/既往|通院|^氏名[:：]/.test(String(i.text).normalize('NFKC')) && !focusIsHeadingCard(i)).sort((x, y) => (x.fieldLabel === '診断名') - (y.fieldLabel === '診断名')).slice(0, 3);
        const preAll = preSet.filter(i => (i.type === 'o' || i.type === 's') && !events.includes(i) && !focusIsHeadingCard(i) && !/^氏名[:：]/.test(String(i.text).normalize('NFKC')) && !(typeof cvOffTopic === 'function' && cvOffTopic(needId, i.text)) && !(EVENT_RE.test(i.text) && !/既往|通院/.test(i.text))).slice(0, 5);
        const dayOf = i => (typeof suffDayOf === 'function' ? suffDayOf(i) : null);
        const postRows = postAll.filter(i => !/[〜~]\s*術後\d+日目まで/.test(i.text) && !(typeof isAssessmentBackgroundItem === 'function' && isAssessmentBackgroundItem(i)) && !(typeof cvHeadingOnly === 'function' && cvHeadingOnly(i)) && !(typeof cvOffTopic === 'function' && cvOffTopic(needId, i.text)));
        // 1. 入院前の生活
        if (preAll.length) para.push(`入院前は、${preAll.map(i => `${focusFact(i.text, 50, i)}${lab(i)}`).join('、')}。`);
        // No pre-admission record: say nothing here; the judgment sentence names what is missing when it matters.

        if (events.length) para.push(`今回は、${events.map(i => `${focusFact(i.text, 50)}${i.fieldLabel === '診断名' ? 'と診断された' : ''}${lab(i)}`).join('。')}。`);
        // 2. 疾患・治療と身体への影響（患者の記録に根拠があるものだけ）
        // A problem is explained once, in its main need (the first related need); other needs refer to it instead of repeating it.
        const isHome = p => !(p.relatedNeeds || []).length || p.relatedNeeds[0] === needId;
        // When the reasoning step below already explains the same problem from the record, the map chain is not repeated.
        const byTopic = p => reasons.slice(0, 2).some(r => r.topic.plan.test(p.problem));
        const chains = established.filter(p => isHome(p) && !byTopic(p)).slice(0, 2).map(p => ({ p, ch: focusMapChainRoles(cp, focusMapNodeOf(cp, p)).causes })).filter(x => x.ch.length);
        if (chains.length) para.push(chains.map(x => `${cl(x.p.problem, 30)}の背景には、${x.ch.slice().reverse().join('、')}がある`).join('。また、') + '。');
        const away = awayP;
        if (away.length) para.push(`${away.map(p => `${cl(p.problem, 30)}は「${focusNeedName(focusHomeNeed(p))}」`).join('、')}の項で述べたとおりで、この欲求にも影響している。`);
        reasons.slice(0, 2).forEach(r => crNarrative(r, data.labels).forEach(x => para.push(x)));
        // Pain is read in the need whose function it disturbs (owner rule): outside 姿勢, where the pain itself is reasoned out,
        // one sentence says how pain affects this need, citing the records.
        let painHits = [];
        if (needId !== 4 && typeof detectMultipleHendersonTags === 'function') {
          const PAIN_WORD = /疼痛|痛み(?!止め|どめ)|痛い|痛く|痛かった|創痛|ペインスケール|NRS/;
          const NO_PAIN = /(?:痛み|疼痛|創痛)(?:は|も)?(?:なし|ない|なく|ひどくな|みられず|見られず|落ち着)|疼痛増強(?:なし|なく|見られず)/;
          const hits = [];
          postAll.forEach(i => String(i.text || '').normalize('NFKC').split(/[。\n]/).forEach(cl => {
            if (!PAIN_WORD.test(cl) || NO_PAIN.test(cl)) return;
            const ok = [2, 5, 6, 8].includes(needId) ? Array.from(detectMultipleHendersonTags(cl)).includes(needId) : (typeof painEffectNeeds === 'function' && painEffectNeeds(cl).includes(needId));
            if (ok) hits.push({ i, cl: cl.replace(/^[^「]*?[:：]\s*/, '').trim() });
          }));
          painHits = hits;
        }
        // 3. 入院後の変化（日ごと。新しい所見ほど後ろ）
        // Rows used in the day-by-day narrative: drop lab lines with reference ranges and, when the need has a domain vocabulary,
        // prefer the records that speak about this need (an antibiotic order is not part of the cleanliness course).
        const DOM = typeof SUF_MET_DOMAIN !== 'undefined' ? SUF_MET_DOMAIN[needId] : null;
        const narr0 = postRows.filter(i => !/[(（]基準値[:：]/.test(String(i.text).normalize('NFKC')) && !focusIsHeadingCard(i));
        const narrRows = DOM && narr0.some(i => DOM.test(String(i.text))) ? narr0.filter(i => DOM.test(String(i.text)) || i.type === 's') : narr0;
        const dated = narrRows.filter(i => dayOf(i) !== null).sort((x, y) => dayOf(x) - dayOf(y));
        const byDay = new Map(); dated.forEach(i => { if (!byDay.has(dayOf(i))) byDay.set(dayOf(i), []); byDay.get(dayOf(i)).push(i); });
        const dayKeys = [...byDay.keys()].slice(-3);
        // The day is named the way the record names it (術後2日目・産褥2日目・入院3日目); a bare number only when nothing says.
        const dayWord = d => { const ts = (byDay.get(d) || []).map(i => String(i.timestamp || '').normalize('NFKC').match(/(術後|産褥|入院|病日|治療)\s*(?:第)?\s*\d+\s*日目?/)).find(Boolean); return ts ? `${ts[1]}${d}日目` : (typeof isSurgicalPatient === 'function' && isSurgicalPatient(cp) ? `術後${d}日目` : `${d}日目`); };
        // The course is told through the findings the judgment rests on (one or two per day, oldest first), joined by how
        // they changed, instead of listing every record of the day.
        const byId = new Map(all.map(i => [String(i.id), i]));
        const STAGE_NAME = { '-3': '入院時', '-2': '術前', '-1': '手術当日' };
        const stageOf = i => { const d = dayOf(i); if (d !== null) return d; const ts = String(i.timestamp || '').normalize('NFKC'); return /入院時|入院日|入院当日/.test(ts) ? -3 : /術前|手術前/.test(ts) ? -2 : /手術当日|術中/.test(ts) ? -1 : null; };
        // Every dated in-hospital record that shows the need met or unmet (the same card-level reading the judgment uses), so an
        // earlier unmet day stays visible next to a later improvement.
        const cardVerdict = i => { try { return typeof sufficiencyCardVerdict === 'function' ? sufficiencyCardVerdict(i, needId, 'post') : null; } catch (e) { return null; } };
        const fromCards = postAll.map(i => ({ i, r: cardVerdict(i) })).filter(x => x.r && (x.r.v === 'met' || x.r.v === 'unmet') && x.r.clause).map(x => ({ id: x.i.id, text: x.r.clause, pol: x.r.v === 'unmet' ? 'ng' : 'ok' }));
        const fromFacts = [...((a.facts && a.facts.against) || []).map(f => ({ ...f, pol: 'ng' })), ...((a.facts && a.facts.for) || []).map(f => ({ ...f, pol: 'ok' }))];
        const evList = [...fromCards, ...fromFacts]
          .map(f => ({ ...f, item: byId.get(String(f.id)) })).filter(f => f.item && stageOf(f.item) !== null && f.text)
          .filter((f, k, arr) => arr.findIndex(g => String(g.id) === String(f.id)) === k);
        const evDays = [...new Set(evList.map(f => stageOf(f.item)))].sort((x, y) => x - y).slice(-3);
        const citedIds = new Set();
        const dayName = d => { if (STAGE_NAME[String(d)]) return STAGE_NAME[String(d)]; const ts = evList.filter(f => stageOf(f.item) === d).map(f => String(f.item.timestamp || '').normalize('NFKC').match(/(術後|産褥|入院|病日|治療)\s*(?:第)?\s*\d+\s*日目?/)).find(Boolean); return ts ? `${ts[1]}${d}日目` : (typeof isSurgicalPatient === 'function' && isSurgicalPatient(cp) ? `術後${d}日目` : `${d}日目`); };
        // Present tense only for the latest day on record; earlier days are told in the past.
        const latestStage = Math.max(-9, ...postAll.map(i => stageOf(i)).filter(v => v !== null));
        let evNarr = '';
        // A series of one vital sign is told as its trend (体温は術後1日目37.0度・36.8度、術後2日目36.7度と推移している).
        const VITAL = /^(?:検温[:：]\s*)?(体温|脈拍|SpO2|呼吸数|血圧)/;
        const VITAL_NEED = { 体温: [7], 脈拍: [1], 血圧: [1], SpO2: [1], 呼吸数: [1] };
        let vName = evList.length && evList.every(f => VITAL.test(String(f.text))) ? String(evList[0].text).match(VITAL)[1] : '';
        if (vName && !(VITAL_NEED[vName] || []).includes(needId)) vName = '';
        if (vName && evList.every(f => String(f.text).match(VITAL)[1] === vName)) {
          const valOf = f => (String(f.item.text).normalize('NFKC').match(new RegExp(vName + '[^\\d]{0,3}([\\d.\\/]+\\s*(?:度|℃|%|回\\/分|mmHg)?)')) || [])[1] || '';
          evNarr = `${vName}は${evDays.map(d => `${dayName(d)}${evList.filter(f => stageOf(f.item) === d).map(f => { citedIds.add(String(f.id)); return `${valOf(f)}${lab(f.item)}`; }).join('・')}`).join('、')}と推移している。`;
        } else if (evDays.length) {
          const polOf = d => evList.some(f => stageOf(f.item) === d && f.pol === 'ng') ? 'ng' : 'ok';
          const frag = (f, last) => {
            citedIds.add(String(f.id)); const l = lab(f.item);
            const clause = String(f.text).replace(/^[「『]|[」』]$/g, '');
            // A patient's words are quoted as spoken: the quotation in the card that contains the evidence clause.
            const quotes = String(f.item.text || '').normalize('NFKC').match(/「[^」]{2,60}」/g) || [];
            const key = clause.replace(/[「」『』]/g, '').slice(0, 6);
            const quote = quotes.find(q => q.includes(key)) || (f.item.type === 's' && quotes.length === 1 ? quotes[0] : '');
            if (quote) return `${quote}${l}と${last ? '話している' : '話していた'}`;
            return `${focusPredicate(clause.replace(/[「」]/g, ''), last, l)}`;
          };
          const sentences = evDays.map((d, k) => { const fs = evList.filter(f => stageOf(f.item) === d).sort((x, y) => (x.pol === polOf(d) ? 0 : 1) - (y.pol === polOf(d) ? 0 : 1)).slice(0, 2); const last = k === evDays.length - 1 && d === latestStage; return `${dayName(d)}は${fs.map((f, n) => frag(f, last && n === fs.length - 1)).join('。また、').replace(/。また、([^。]*)$/, '。また、$1')}`; });
          let turns = 0;
          evNarr = sentences.reduce((acc, cur, k) => !k ? cur : acc + (polOf(evDays[k - 1]) !== polOf(evDays[k]) ? (turns++ ? '。しかし、' : '。一方、') : '。') + cur, '') + '。';
          if (evDays.length > 1 && polOf(evDays[0]) === 'ng' && polOf(evDays[evDays.length - 1]) === 'ok') evNarr += '経過とともに改善している。';
          // 「悪化」 is said of body functions; for understanding, communication, roles and the like a new issue has appeared instead.
          else if (evDays.length > 1 && polOf(evDays[0]) === 'ok' && polOf(evDays[evDays.length - 1]) === 'ng') evNarr += [1, 2, 3, 4, 5, 6, 7, 8, 9].includes(needId) ? '経過とともに悪化している。' : (typeof isSurgicalPatient === 'function' && isSurgicalPatient(cp) ? '術後になって新たな課題が出てきている。' : '入院後に新たな課題が出てきている。');
        }
        if (evNarr) para.push(evNarr);
        else if (dayKeys.length) para.push(dayKeys.map(d => `${dayWord(d)}は、${byDay.get(d).filter(i => !focusIsHeadingCard(i)).slice(0, 2).map(i => `${focusFact(i.text, 45)}${lab(i)}`).join('、')}`).join('。') + `。${prog.value === 'improving' ? '前の日と比べて改善がみられる。' : prog.value === 'worsening' ? '前の日と比べて悪化がみられる。' : ''}`);
        else if (narrRows.length) para.push(`入院後は、${narrRows.slice(0, 3).map(i => `${focusFact(i.text, 45)}${lab(i)}`).join('、')}。`);
        // Pain that disturbs this need and is not already part of the course above.
        const painPick = painHits.filter(h => !citedIds.has(String(h.i.id))).slice(-2);
        if (painPick.length) para.push(`${evNarr ? 'また、' : ''}${painPick.map(h => `${focusFact(h.cl, 40)}${lab(h.i)}`).join('、')}と、痛みが${name}にも影響している。`);
        // 4. 個別的な解釈（患者の言葉の意味・強み）
        const words = postAll.concat(preSet).filter(i => i.type === 's').map(i => { const q = String(i.text).match(/「([^」]{3,60})」/); return q ? { i, q: q[1], m: sMeaning(q[1]) } : null; }).filter(x => x && x.m).slice(0, 3);
        // One sentence per meaning: several quotes with the same meaning are cited together instead of repeating the interpretation.
        const byMeaning = [];
        words.forEach(x => { const g = byMeaning.find(b => b.m === x.m); if (g) g.list.push(x); else byMeaning.push({ m: x.m, list: [x] }); });
        byMeaning.forEach((g, k) => { const fresh = g.list.filter(x => !citedIds.has(String(x.i.id))); const ref = g.list.filter(x => citedIds.has(String(x.i.id))); const parts = [...(fresh.length ? [`${fresh.map(x => `「${cl(x.q, 40)}」${lab(x.i)}`).join('、')}という言葉`] : []), ...(ref.length ? [`${ref.map(x => lab(x.i)).join('')}の言葉`] : [])]; para.push(`${k === 0 ? '' : 'また、'}${parts.join('や')}から、${g.m}と考える。`); });
        const okDims = (dims || []).filter(d => d.state === 'ok').map(d => d.label);
        const strengths = (a.facts && a.facts.for || []).filter(f => postIds.has(f.id) && /自立|可能|できて|できた|自力|保たれ|良好|問題な|不具合はない/.test(f.text)).slice(0, 2);
        if (okDims.length) para.push(`${okDims.join('・')}は保たれている。`);
        else if (strengths.length) para.push(`${strengths.map(f => `「${cl(f.text, 40)}」${focusLabelsOf([f.id], data.labels)}`).join('、')}は保たれている。`);
        // 5. 判断と根拠
        const evFacts = verdict === 'met' ? a.facts && a.facts.for : a.facts && a.facts.against;
        const ev = quoteOf(evFacts);
        if (verdict === 'unknown') { const why = [...new Set([res.pre && res.pre.need, res.post && res.post.need].filter(Boolean))]; para.push(why.length ? `${name}は、${why.join('うえ、')}ため、現時点では判断できない。` : `${name}の充足を判断するには情報が足りない。`); }
        else if (a.dimensionConflict) para.push(`${a.reason}ため、${name}は${vWord}と判断する。`);
        else if (verdict === 'hold') para.push(`${evNarr ? '' : (ev ? ev + 'という記録があり、' : '')}${name}が満たされているかは、現時点では判断を保留する。`);
        // When every piece of evidence is a pre-admission record already cited above, say so instead of quoting it again.
        else if (evFacts && evFacts.length && evFacts.every(f => preAll.some(i => i.id === f.id)) && phKey === 'all') para.push(`入院前の${name}は${vWord}と判断する。入院後の${name}の状態は記録からは確認できないため、入院による変化を確かめる。`);
        else if (evNarr && (evFacts || []).some(f => citedIds.has(String(f.id)))) para.push(`以上から、${name}は${vWord}と判断する。`);
        else para.push(`${ev ? ev + 'という記録から、' : ''}${name}は${vWord}と判断する。`);
        // 6. 回復を妨げる要因と将来のリスク
        established.filter(p => stat(p).kind !== 'risk').slice(0, 3).forEach(p => { if (p.note) para.push(`${cl(p.note, 60)}${focusLabelsOf(p.evidenceIds, data.labels)}ため、${cl(p.problem, 30)}が現在の問題である。`); });
        const riskP = established.filter(p => stat(p).kind === 'risk').slice(0, 3);
        const comp = typeof complicationCandidates === 'function' ? complicationCandidates(cp, needId, all.map(i => i.text).join(' ')).slice(0, 2) : [];
        if (riskP.length || comp.length) para.push(`今後は${(() => { const rs = riskP.map(p => cl(p.problem, 30)); const root = t => String(t).replace(/リスク状態.*$|（.*$/, '').replace(/^.*の/, '').replace(/[・･]/g, '').slice(0, 4); const extra = comp.map(c => String(c).replace(/（.*$/, '')).filter(c => !rs.some(r => root(r) && c.replace(/[・･]/g, '').includes(root(r).replace(/[・･]/g, '')))); return [...rs, ...extra].filter((v, k, arr) => arr.indexOf(v) === k); })().join('、')}が起こるおそれがあるため、予防と早期発見のための観察を続ける。`);
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
          if (actualP.length) t += `今ある問題は${actualP.map(p => focusClip(p.problem, 24)).join('、')}で、`;
          if (riskP2.length) t += `${actualP.length ? '加えて' : ''}${riskP2.map(p => focusClip(p.problem, 24)).join('、')}を予防する必要がある。`;
          else if (actualP.length) t += '解消に向けた援助が要る。';
          if (established.length && [2, 3, 4, 6, 8].includes(needId) && actualP.length) t += `行える動作は本人に任せ、できない部分を補う援助を${established.length > 1 ? '優先順位をつけて' : ''}進める。`;
          else if (verdict === 'met') t += '現時点で看護問題は挙がらない。';
        }
        integration.push(t);
      }
      let problem = established.length
        ? `よって、${established.map(p => focusClip(p.problem, 34)).join('、')}が、この欲求の看護問題として挙がる。\n` + established.map((p, i) => { if (focusHomeNeed(p) !== null && focusHomeNeed(p) !== needId) return `#${i + 1} ${p.problem}（${stat(p).label}・詳しくは「${focusNeedName(focusHomeNeed(p))}」の項）`; const rl = focusMapChainRoles(cp, focusMapNodeOf(cp, p)); const ch = rl.causes; const evl = [...new Set((p.evidenceIds || []).map(id => data.labels[id]).filter(Boolean))]; const oth = (p.relatedNeeds || []).filter(n => n !== needId).map(n => focusNeedName(n)); return `#${i + 1} ${p.problem}（${stat(p).label}）${ch.length ? `\n　関連要因：${ch.slice().reverse().join('、')}` : ''}${rl.symptoms.length ? `\n　症状・状態：${rl.symptoms.join('、')}` : ''}${rl.interventions.length ? `\n　実施中の介入：${rl.interventions.join('、')}` : ''}${p.note ? `\n　状態：${focusClip(p.note, 70)}` : ''}${evl.length ? `\n　根拠：${evl.join('・')}` : ''}${oth.length ? `\n　関連する欲求：${oth.join('・')}` : ''}`; }).join('\n') + (candidates.length ? `\n（根拠を確かめる候補：${candidates.map(p => focusClip(p.problem, 24)).join('、')}）` : '')
        : (all.length ? 'この欲求から明確になる看護問題は、現時点ではない。' : '');
      const cand2 = reasons.filter(r => r.status !== 'confirmed' && !established.some(p => r.topic.plan.test(p.problem)));
      const sup2 = cand2.filter(r => r.status === 'supported'), weak2 = cand2.filter(r => r.status !== 'supported');
      if (cand2.length && !established.length) problem = sup2.length ? '' : '現時点で確定できる看護問題はないが、次の候補を追加のアセスメントで確かめる。';
      if (cand2.length) problem += (problem ? '\n' : '') + sup2.map(r => `（候補）${crProblemLine(r)}（記録から原因と症状が確認できる）`).concat(weak2.map(r => crProblemLine(r))).join('\n');
      if (awayP.length) problem += (problem ? '\n' : '') + awayP.map(p => `関連する問題：${p.problem}（詳しくは「${focusNeedName(focusHomeNeed(p))}」の項）`).join('\n');
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
  Object.assign(module.exports, { focusPrintSection, focusAssessmentText, focusHomeNeed, focusFact, focusPredicate, buildFocusDraft, applyFocusDraft, renderFocusAssessment, focusItemsByColumn, focusCellHtml, FOCUS_FIELDS });
}
