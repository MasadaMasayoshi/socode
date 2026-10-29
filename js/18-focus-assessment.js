// 重点アセスメント：欲求ごとに、S・O（入院前／入院後）→ 情報の分析・解釈 → 統合 → 看護問題の明確化を一画面で書く。
// S・Oは分類ボードの内容から自動で並べ、分析・統合・看護問題は患者ごと・欲求ごとに保存する（myAssessments の追加項目）。

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['18'] = 'v.236'; // Version stamp (scripts/stamp-version.js)

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

    function renderFocusAssessment() {
      const root = document.getElementById('focus-assessment-body');
      if (!root) return;
      const cp = getCurrentPatient();
      const needId = focusSelectedNeed(cp);
      focusNeedId = needId;
      const need = HENDERSON_NEEDS.find(n => n.id === needId);
      const data = focusItemsByColumn(cp, needId);
      const e = focusEntry(cp, needId) || {};
      const pills = HENDERSON_NEEDS.map(n => {
        const cnt = myNeedRecordItems(cp, n.id).length;
        return `<button type="button" class="fa-pill${n.id === needId ? ' active' : ''}${cnt ? '' : ' fa-none'}" onclick="focusSelectNeed(${n.id})">${n.id}. ${escapeHtml(n.name)}${focusHasText(cp, n.id) ? '<span class="fa-dot" title="書き込みあり"></span>' : ''}<small>${cnt}</small></button>`;
      }).join('');
      const fields = FOCUS_FIELDS.map(f => `<div class="fa-col fa-edit"><div class="fa-head">${f.label}</div><textarea class="field fa-text" data-fa-need="${needId}" data-fa-field="${f.key}" placeholder="${escapeHtml(f.ph)}" oninput="onFocusInput(${needId}, '${f.key}', this)">${escapeHtml(e[f.key] || '')}</textarea></div>`).join('');
      root.innerHTML = `
        <div class="fa-pills" role="tablist" aria-label="項目（ヘンダーソンの14の欲求）">${pills}</div>
        <div class="fa-title">項目：${needId}. ${escapeHtml(need.name)}</div>
        <div class="fa-grid">
          <div class="fa-col"><div class="fa-head">主観的情報（S）</div><div class="fa-cell">${focusCellHtml(needId, 's', data)}</div></div>
          <div class="fa-col"><div class="fa-head">客観的情報（O）</div><div class="fa-cell">${focusCellHtml(needId, 'o', data)}</div></div>
          ${fields}
        </div>`;
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

if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, { renderFocusAssessment, focusItemsByColumn, focusCellHtml, FOCUS_FIELDS });
}
