// 重点アセスメント：欲求ごとに、S・O（入院前／入院後）→ 情報の分析・解釈 → 統合 → 看護問題の明確化を一画面で書く。
// S・Oは分類ボードの内容から自動で並べ、分析・解釈／統合／看護問題の明確化も、記録・充足判定・看護計画（関連図の看護問題）から自動で下書きする。手で直した欄は自動では上書きしない（myAssessments の追加項目に保存）。

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['18'] = 'v.239'; // Version stamp (scripts/stamp-version.js)

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
      const x = String(t || '').replace(/\s+/g, ' ').replace(/[。.]+$/, '').trim();
      return x.length > n ? x.slice(0, n) + '…' : x;
    }
    function focusNeedName(needId) { return String((HENDERSON_NEEDS.find(n => n.id === needId) || {}).name || '').replace(/^\d+\.\s*/, ''); }
    function focusPlansForNeed(cp, needId, itemIds) {
      const list = typeof carePlanList === 'function' ? carePlanList(cp) : [];
      return list.filter(p => (p.relatedNeeds || []).includes(needId) || (p.evidenceIds || []).some(id => itemIds.has(id)));
    }
    function focusLabelsOf(ids, labels) {
      const out = [...new Set((ids || []).map(id => labels[id]).filter(Boolean))];
      return out.length ? `（${out.join('・')}）` : '';
    }
    function focusQuoteList(facts, items, labels) {
      return (facts || []).slice(0, 3).map(f => `「${focusClip(f.text, 30)}」${focusLabelsOf([f.id], labels)}`).join('、');
    }
    function buildFocusDraft(cp, needId) {
      const data = focusItemsByColumn(cp, needId);
      const all = [...data.cols.preadmission, ...data.cols.postadmission, ...data.cols.unclassified];
      const name = focusNeedName(needId);
      const itemIds = new Set(all.map(i => i.id));
      const res = (typeof ruleSufficiencyFor === 'function' ? ruleSufficiencyFor(cp)[needId] : null) || {};
      const a = res.all || {};
      const verdict = a.verdict === 'met' ? 'met' : a.verdict === 'unmet' ? 'unmet' : 'unknown';
      const plans = focusPlansForNeed(cp, needId, itemIds);
      const subj = /^[A-ZＡ-Ｚ][氏さん]|氏$|さん$/.test(String(cp.title || '').trim()) ? String(cp.title).trim() : '患者';
      const first = (list, type) => list.filter(i => i.type === type).slice(0, 2);
      const phrase = list => list.map(i => `${focusClip(i.text, 36)}${focusLabelsOf([i.id], data.labels)}`).join('、');
      const pre = [...first(data.cols.preadmission, 'o'), ...first(data.cols.preadmission, 's')].slice(0, 3);
      const post = [...first(data.cols.postadmission, 'o'), ...first(data.cols.postadmission, 's')].slice(0, 3);
      const vWord = verdict === 'met' ? '概ね満たされている' : verdict === 'unmet' ? '満たされていない' : '判断できる情報が足りない';
      const para = [];
      if (!all.length) {
        para.push(`この欲求に分類された情報がまだない。${name}について、入院前の生活と入院後の状態を確認する必要がある。`);
      } else {
        if (pre.length) para.push(`${subj}は、入院前は${phrase(pre)}。`);
        if (post.length) {
          const ev = verdict === 'unmet' ? focusQuoteList(a.facts && a.facts.against, all, data.labels) : verdict === 'met' ? focusQuoteList(a.facts && a.facts.for, all, data.labels) : '';
          para.push(`入院後は${phrase(post)}。${ev ? `${subj}は、${ev}ことから、${name}は${vWord}と考える。` : `${name}は${vWord}。${[res.pre && res.pre.need, res.post && res.post.need].filter(Boolean).join('、')}`.replace(/、$/, '') + '。'}`.replace(/。。/g, '。'));
        } else if (verdict !== 'unknown') {
          const ev = focusQuoteList(verdict === 'unmet' ? a.facts && a.facts.against : a.facts && a.facts.for, all, data.labels);
          para.push(`${ev ? `${subj}は、${ev}ことから、` : ''}${name}は${vWord}と考える。`);
        } else para.push(`${name}の充足を判断するには情報が足りない。${[res.pre && res.pre.need, res.post && res.post.need].filter(Boolean).join('、')}`.replace(/、$/, '') + '。');
        plans.slice(0, 3).forEach((p, k) => { if (p.note) para.push(`${k === 0 ? 'また、' : 'さらに、'}${focusClip(p.note, 60)}${focusLabelsOf(p.evidenceIds, data.labels)}ことが、${focusClip(p.problem, 30)}につながっていると考える。`); });
        const comp = typeof complicationCandidates === 'function' ? complicationCandidates(cp, needId, all.map(i => i.text).join(' ')).slice(0, 2) : [];
        if (comp.length) para.push(`今後は${comp.map(c => String(c).replace(/（.*$/, '')).join('、')}にも注意が必要である。`);
        if (plans.length) para.push(`したがって、${plans.slice(0, 3).map(p => focusClip(p.problem, 30)).join('、')}への援助が必要な状態であると考える。`);
      }
      const analysis = para;
      const integration = [];
      if (all.length) {
        integration.push(`以上より、${name}は${vWord}。`);
        if (plans.length) integration.push(`${plans.slice(0, 3).map(p => focusClip(p.problem, 30)).join('、')}があり、継続した観察と援助が必要である。`);
        else if (verdict === 'met') integration.push('現時点で、この欲求に関する看護問題は挙がらない。経過に合わせて再評価する。');
        else if (verdict === 'unmet') integration.push('満たされていない状態だが、看護問題として明確にするには、原因や関連要因の情報をさらに集める必要がある。');
      }
      const problem = plans.length
        ? `よって、${plans.slice(0, 5).map(p => focusClip(p.problem, 34)).join('、')}がある。\n` + plans.slice(0, 5).map((p, i) => `#${i + 1} ${p.problem}${p.note ? `\n　${focusClip(p.note, 70)}` : ''}`).join('\n')
        : (all.length ? 'この欲求から明確になる看護問題は、現時点ではない。' : '');
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
      const fields = FOCUS_FIELDS.map(f => `<div class="fa-col fa-edit"><div class="fa-head">${f.label}</div><textarea class="field fa-text" data-fa-need="${needId}" data-fa-field="${f.key}" placeholder="${escapeHtml(f.ph)}" oninput="onFocusInput(${needId}, '${f.key}', this)">${escapeHtml(e[f.key] || '')}</textarea></div>`).join('');
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
