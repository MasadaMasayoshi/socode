// Checkpoints, Japanese reports and patient-scoped board history.
// Restore only matching post-operation state; imports use verified checkpoints, not blanket replacement.

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['13'] = 'v.189'; // Version stamp (scripts/stamp-version.js)

    // ==========================================================================

    // ==========================================================================
    const CHECKPOINT_MAX = 8;
    const CHECKPOINT_KIND_LABELS = { manual: '手で記録', classify: '分類し直す前', open: '画面を開いたとき' };
    function checkpointItemCopy(i) {
      const c = { id: i.id, type: i.type, text: i.text, timestamp: i.timestamp || '', hendersonIds: (i.hendersonIds || []).slice(), cols: { ...(i.assessmentCols || {}) } };
      if (i.fieldLabel) c.fieldLabel = i.fieldLabel;
      return c;
    }
    function checkpointList(cp) {
      const all = cp && cp.checkpoints && typeof cp.checkpoints === 'object' ? Object.values(cp.checkpoints) : [];
      return all.filter(c => c && c.id && !c.deleted && Array.isArray(c.items)).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    }
    function createCheckpoint(cp, { label = '', kind = 'manual' } = {}, now = new Date().toISOString()) {
      if (!cp.checkpoints || typeof cp.checkpoints !== 'object' || Array.isArray(cp.checkpoints)) cp.checkpoints = {};
      const id = `ckpt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const c = { id, label: String(label || '').trim(), kind, at: now, updatedAt: now, items: (cp.items || []).map(checkpointItemCopy) };
      cp.checkpoints[id] = c;

      const list = checkpointList(cp);
      if (list.length > CHECKPOINT_MAX) {
        const byAge = list.slice().reverse();
        const victims = [...byAge.filter(x => x.kind !== 'manual'), ...byAge.filter(x => x.kind === 'manual')].filter(x => x.id !== id).slice(0, list.length - CHECKPOINT_MAX);
        victims.forEach(v => { cp.checkpoints[v.id] = { id: v.id, deleted: true, updatedAt: now }; });
      }
      return c;
    }
    function deleteCheckpoint(cp, id, now = new Date().toISOString()) {
      if (!checkpointList(cp).some(c => c.id === id)) return false;
      cp.checkpoints[id] = { id, deleted: true, updatedAt: now };
      return true;
    }
    function checkpointLabel(c) {
      return `${formatMyDateTime(c.at)} ${c.label || CHECKPOINT_KIND_LABELS[c.kind] || ''}（${c.items.length}枚）`;
    }

    const CARD_TYPE_LABELS = { s: 'S', o: 'O', unclassified: '未分類', unnecessary: '不要' };
    const CARD_COL_LABELS = { unclassified: '未分類', preadmission: '入院前', postadmission: '入院後', missing: '不足情報' };
    function normCardText(t) { return String(t || '').normalize('NFKC').replace(/\s+/g, ''); }
    function diffCards(baseItems, curItems) {
      const base = (baseItems || []).map(b => ({ ...b, cols: b.cols || b.assessmentCols || {} }));
      const cur = (curItems || []).map(checkpointItemCopy);
      const pairs = [];
      const baseLeft = new Map(base.map(b => [b.id, b]));
      const curLeft = [];
      cur.forEach(c => {
        const b = baseLeft.get(c.id);
        if (b) { pairs.push([b, c]); baseLeft.delete(c.id); } else curLeft.push(c);
      });
      const byText = new Map();
      baseLeft.forEach(b => { const k = normCardText(b.text); if (!byText.has(k)) byText.set(k, []); byText.get(k).push(b); });
      const added = [];
      curLeft.forEach(c => {
        const list = byText.get(normCardText(c.text));
        if (list && list.length) { const b = list.shift(); baseLeft.delete(b.id); pairs.push([b, c]); } else added.push(c);
      });
      const removed = Array.from(baseLeft.values());
      const changed = [];
      let same = 0;
      pairs.forEach(([b, c]) => {
        const changes = cardChanges(b, c);
        if (changes.length) changed.push({ before: b, after: c, changes }); else same++;
      });
      return { added, removed, changed, same };
    }
    function cardChanges(b, c) {
      const out = [];
      if (b.text !== c.text) out.push({ field: 'text', label: '本文', from: b.text, to: c.text });
      if (b.type !== c.type) out.push({ field: 'type', label: '分類', from: CARD_TYPE_LABELS[b.type] || b.type, to: CARD_TYPE_LABELS[c.type] || c.type });
      if ((b.timestamp || '') !== (c.timestamp || '')) out.push({ field: 'timestamp', label: '日時', from: b.timestamp || '（なし）', to: c.timestamp || '（なし）' });
      const bt = new Set(b.hendersonIds || []), ct = new Set(c.hendersonIds || []);
      const plus = [...ct].filter(h => !bt.has(h)), minus = [...bt].filter(h => !ct.has(h));
      if (plus.length || minus.length) out.push({ field: 'tags', label: 'タグ', from: [...bt].sort((x, y) => x - y).join('・') || 'なし', to: [...ct].sort((x, y) => x - y).join('・') || 'なし', plus, minus });
      [...ct].filter(h => bt.has(h)).forEach(h => {
        const f = (b.cols || {})[h] || 'unclassified', t = (c.cols || {})[h] || 'unclassified';
        if (f !== t) out.push({ field: 'col', label: `欄（${h}.${hendersonNameOf(h).replace(/^\d+\.\s*/, '')}）`, from: CARD_COL_LABELS[f] || f, to: CARD_COL_LABELS[t] || t });
      });
      return out;
    }

    function inlineTextDiffHtml(a, b) {
      a = String(a || ''); b = String(b || '');
      let p = 0;
      while (p < a.length && p < b.length && a[p] === b[p]) p++;
      let s = 0;
      while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
      const mid = (t) => t.slice(p, t.length - s);
      return `${escapeHtml(a.slice(0, p))}${mid(a) ? `<del>${escapeHtml(mid(a))}</del>` : ''}${mid(b) ? `<ins>${escapeHtml(mid(b))}</ins>` : ''}${escapeHtml(a.slice(a.length - s))}`;
    }

    const checkpointOpenedThisSession = new Set();
    function maybeCheckpointOnOpen(cp, now = new Date()) {
      if (!cp || checkpointOpenedThisSession.has(cp.id)) return null;
      checkpointOpenedThisSession.add(cp.id);
      if (!(cp.items || []).length) return null;
      const last = checkpointList(cp)[0];
      if (last) {
        if (now.getTime() - new Date(last.at).getTime() < 30 * 60 * 1000) return null;
        const d = diffCards(last.items, cp.items);
        if (!d.added.length && !d.removed.length && !d.changed.length) return null;
      }
      const c = createCheckpoint(cp, { kind: 'open' }, now.toISOString());
      saveMyAssessmentsSoon(cp.id, 1500);
      return c;
    }

    function checkpointBeforeClassify(cp) {
      if (!cp || !(cp.items || []).length) return null;

      const latest = checkpointList(cp)[0];
      if (latest && JSON.stringify(latest.items) === JSON.stringify((cp.items || []).map(checkpointItemCopy))) return latest;
      return createCheckpoint(cp, { kind: 'classify' });
    }

    let compareState = { baseId: null, filter: 'all' };
    window.openCompare = function() {
      const cp = getCurrentPatient();
      const list = checkpointList(cp);
      if (!list.some(c => c.id === compareState.baseId)) compareState.baseId = list[0] ? list[0].id : null;
      compareState.filter = 'all';
      renderCompare();
      document.getElementById('modal-compare').classList.remove('hidden');
    };
    window.closeCompare = function() { document.getElementById('modal-compare').classList.add('hidden'); };
    function renderCompare() {
      const cp = getCurrentPatient();
      const list = checkpointList(cp);
      const sel = document.getElementById('compare-base');
      sel.innerHTML = list.length ? list.map(c => `<option value="${escapeHtml(c.id)}"${c.id === compareState.baseId ? ' selected' : ''}>${escapeHtml(checkpointLabel(c))}</option>`).join('') : '<option value="">（まだ記録がありません）</option>';
      const body = document.getElementById('compare-body');
      const base = list.find(c => c.id === compareState.baseId);
      document.getElementById('compare-delete').disabled = !base;
      if (!base) {
        body.innerHTML = '<p class="my-asm-muted p-3">比べる時点の記録がまだありません。「今の状態を記録」を押すと、その時点のカードを残しておき、あとで今のカードと比べられます（「分類開始」で分類し直す前と、画面を開いたときにも自動で記録します）。</p>';
        return;
      }
      const d = diffCards(base.items, cp.items);
      const f = compareState.filter;
      const chip = (key, label, n) => `<button type="button" class="cmp-filter cmp-${key}${f === key ? ' active' : ''}" onclick="setCompareFilter('${key}')">${label} <b>${n}</b></button>`;

      const cardLabel = c => `<span class="cmp-type cmp-type-${escapeHtml(c.type)}">${escapeHtml(CARD_TYPE_LABELS[c.type] || c.type)}</span>${c.timestamp && c.timestamp !== '日時不明' ? `<span class="ep-time">${escapeHtml(c.timestamp)}</span>` : ''}`;
      const exists = id => cp.items.some(i => i.id === id);
      const rows = [];
      if (f === 'all' || f === 'added') d.added.forEach(c => rows.push(`<li class="cmp-row cmp-added"><span class="cmp-kind">追加</span>${cardLabel(c)}<button type="button" class="cmp-text" onclick="jumpFromCompare('${safeDomId(c.id)}')">${escapeHtml(c.text)}</button></li>`));
      if (f === 'all' || f === 'changed') d.changed.forEach(x => rows.push(`<li class="cmp-row cmp-changed"><span class="cmp-kind">変更</span>${cardLabel(x.after)}<button type="button" class="cmp-text" onclick="jumpFromCompare('${safeDomId(x.after.id)}')">${x.changes.some(ch => ch.field === 'text') ? inlineTextDiffHtml(x.before.text, x.after.text) : escapeHtml(x.after.text)}</button>
        <ul class="cmp-changes">${x.changes.filter(ch => ch.field !== 'text').map(ch => `<li><b>${escapeHtml(ch.label)}</b>${ch.field === 'tags' ? `${ch.plus.map(h => `<span class="cmp-plus">＋${h}.${escapeHtml(hendersonNameOf(h).replace(/^\d+\.\s*/, ''))}</span>`).join('')}${ch.minus.map(h => `<span class="cmp-minus">－${h}.${escapeHtml(hendersonNameOf(h).replace(/^\d+\.\s*/, ''))}</span>`).join('')}` : `${escapeHtml(ch.from)} → ${escapeHtml(ch.to)}`}</li>`).join('')}</ul></li>`));
      if (f === 'all' || f === 'removed') d.removed.forEach(c => rows.push(`<li class="cmp-row cmp-removed"><span class="cmp-kind">削除</span>${cardLabel(c)}<span class="cmp-text">${escapeHtml(c.text)}</span>${exists(c.id) ? '' : `<button type="button" class="my-asm-link" onclick="restoreFromCompare('${safeDomId(c.id)}')">元に戻す</button>`}</li>`));
      body.innerHTML = `<div class="cmp-summary">${chip('all', 'すべて', d.added.length + d.changed.length + d.removed.length)}${chip('added', '追加', d.added.length)}${chip('changed', '変更', d.changed.length)}${chip('removed', '削除', d.removed.length)}<span class="my-asm-muted">変わらないカード ${d.same}枚</span></div>
        ${rows.length ? `<ul class="cmp-list">${rows.join('')}</ul>` : `<p class="my-asm-muted p-3">${f === 'all' ? 'この時点から変わったカードはありません。' : '当てはまるカードはありません。'}</p>`}`;
    }
    window.setCompareFilter = function(f) { compareState.filter = f; renderCompare(); };
    window.onCompareBaseChange = function(id) { compareState.baseId = id; compareState.filter = 'all'; renderCompare(); };
    window.recordCheckpointUI = async function() {
      const cp = getCurrentPatient();
      const label = await openDialog({ title: '今の状態を記録します', message: `今のカード（${cp.items.length}枚）を残しておき、あとで比べられるようにします。名前を付けられます（空欄でも構いません）。`, inputValue: '', placeholder: '例：実習2日目の提出前', confirmLabel: '記録する' });
      if (label === null) return;
      const c = createCheckpoint(cp, { label: typeof label === 'string' ? label : '', kind: 'manual' });
      compareState.baseId = c.id;
      saveMyAssessmentsSoon(cp.id, 0);
      renderCompare();
      showToast('今の状態を記録しました', 'success');
    };
    window.deleteCheckpointUI = async function() {
      const cp = getCurrentPatient();
      const c = checkpointList(cp).find(x => x.id === compareState.baseId);
      if (!c) return;
      const ok = await openDialog({ title: 'この記録を消しますか？', message: checkpointLabel(c), confirmLabel: '消す', danger: true });
      if (ok !== true) return;
      deleteCheckpoint(cp, c.id);
      compareState.baseId = (checkpointList(cp)[0] || {}).id || null;
      saveMyAssessmentsSoon(cp.id, 0);
      renderCompare();
    };
    window.jumpFromCompare = function(id) {
      const cp = getCurrentPatient();
      if (!cp.items.some(i => i.id === id)) return;
      closeCompare();
      jumpToBoardCard(id);
    };

    function restoreCardFromCheckpoint(cp, checkpointId, itemId) {
      const c = checkpointList(cp).find(x => x.id === checkpointId);
      const src = c && c.items.find(i => i.id === itemId);
      if (!src || cp.items.some(i => i.id === itemId)) return null;
      const item = { id: src.id, type: src.type, text: src.text, timestamp: src.timestamp, hendersonIds: src.hendersonIds.slice(), assessmentCols: { ...src.cols } };
      if (src.fieldLabel) item.fieldLabel = src.fieldLabel;
      touchItem(item);
      if (typeof unmarkItemDeleted === 'function') unmarkItemDeleted(cp, item.id);
      cp.items.push(item);
      return item;
    }
    window.restoreFromCompare = function(itemId) {
      const cp = getCurrentPatient();
      if (restoreCardFromCheckpoint(cp, compareState.baseId, itemId)) {
        saveDataAndSync();
        renderCompare();
        showToast('カードを元に戻しました', 'success');
      }
    };

    // ==========================================================================

    // ==========================================================================

    const REPORT_FORMATS = {
      soap: {
        label: 'SOAP形式',
        note: '看護問題ごと（看護計画が無ければ、自分のアセスメントを書いた項目ごと）に S・O・A・P をまとめます。',
        sections: [
          { key: 'S', label: 'S（主観的情報：患者の言葉）', on: true },
          { key: 'O', label: 'O（客観的情報：観察・検査）', on: true },
          { key: 'A', label: 'A（アセスメント：自分の解釈・原因・見通し）', on: true },
          { key: 'P', label: 'P（計画：目標・OP/TP/EP・計画の修正）', on: true },
          { key: 'I', label: 'I（実施：実施した内容・患者の反応）', on: false },
          { key: 'E', label: 'E（評価：目標の達成状況・評価）', on: false }
        ]
      },
      practicum: {
        label: '実習記録の様式',
        note: '実習記録でよく使う順番（患者の概要 → 14項目の情報とアセスメント → 看護問題 → 計画 → 実施・評価）でまとめます。',
        sections: [
          { key: 'profile', label: '患者の概要（診断名・既往歴・家族など）', on: true },
          { key: 'henderson', label: 'ヘンダーソン14項目の情報とアセスメント', on: true },
          { key: 'labs', label: '検査値の推移', on: true },
          { key: 'indices', label: '計算した指標（BMI・eGFRなど）', on: false },
          { key: 'missing', label: '不足情報と確認結果', on: true },
          { key: 'problems', label: '看護問題（優先順位）', on: true },
          { key: 'plans', label: '看護計画（目標・OP/TP/EP）', on: true },
          { key: 'records', label: '実施・評価', on: true }
        ]
      }
    };
    const REPORT_LAYOUT_KEY = 'nursing_report_layout';
    function defaultReportLayout(format) {
      return REPORT_FORMATS[format].sections.map(s => ({ key: s.key, on: s.on }));
    }
    function loadReportLayout() {
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(REPORT_LAYOUT_KEY) || 'null'); } catch (e) { saved = null; }
      const out = { format: saved && REPORT_FORMATS[saved.format] ? saved.format : 'soap', day: '', layouts: {} };
      Object.keys(REPORT_FORMATS).forEach(f => {
        const keys = REPORT_FORMATS[f].sections.map(s => s.key);
        const list = saved && saved.layouts && Array.isArray(saved.layouts[f]) ? saved.layouts[f].filter(x => x && keys.includes(x.key)) : [];
        keys.forEach(k => { if (!list.some(x => x.key === k)) list.push(defaultReportLayout(f).find(x => x.key === k)); });
        out.layouts[f] = list.map(x => ({ key: x.key, on: !!x.on }));
      });
      return out;
    }
    function saveReportLayout(st) {
      try { localStorage.setItem(REPORT_LAYOUT_KEY, JSON.stringify({ format: st.format, layouts: st.layouts })); } catch (e) {   }
    }

    function reportDayOptions(cp) {
      const active = (cp.items || []).filter(i => i.type === 's' || i.type === 'o');
      return groupItemsByDay(assessmentDisplayOrder(active)).map(g => g.day).filter(Boolean);
    }
    function reportCardsForDay(items, day) {
      if (!day) return items;
      const groups = groupItemsByDay(assessmentDisplayOrder(items));
      const g = groups.find(x => x.day === day);
      return g ? g.items : [];
    }

    function reportRecordFilter(day) {
      const m = day && String(day).normalize('NFKC').match(/^(\d{1,2})月(\d{1,2})日/);
      if (!m) return null;
      return r => { const d = new Date(r.at); return d.getMonth() + 1 === Number(m[1]) && d.getDate() === Number(m[2]); };
    }
    const cardLine = (i, label) => `${label ? `${label} ` : ''}${i.timestamp && i.timestamp !== '日時不明' ? `[${i.timestamp}] ` : ''}${i.fieldLabel ? `${i.fieldLabel}：` : ''}${i.text}`;
    const needName = h => `${h}.${hendersonNameOf(h).replace(/^\d+\.\s*/, '')}`;
    function myAssessmentLines(cp, needId) {
      const e = getMyAssessment(cp, needId);
      if (!e) return [];
      const out = [];
      MY_ASSESSMENT_FIELDS.forEach(f => { if (String(e[f.key] || '').trim()) out.push(`${f.label}：${e[f.key].trim()}`); });
      if (out.length && (e.evidenceIds || []).length) {
        const labels = myEvidenceLabels(cp, needId);
        out.push(`根拠：${e.evidenceIds.map(id => { const d = describeMyEvidence(cp, needId, id, labels, e); return d.label + (d.removed ? '（消）' : ''); }).join('・')}`);
      }
      return out;
    }

    function buildReport(cp, { format = 'soap', layout = null, day = '' } = {}) {
      const sections = (layout || defaultReportLayout(format)).filter(s => s.on).map(s => s.key);
      const active = (cp.items || []).filter(i => i.type !== 'unnecessary' && !i.diseaseGeneral);
      const recordFilter = reportRecordFilter(day);
      const dayNote = day ? `（${day}の記録）` : '';
      const blocks = [];
      if (format === 'soap') {
        const plans = carePlanList(cp);
        let units = plans.map((p, k) => ({ title: `#${k + 1} ${p.problem || '（無題）'}`, needs: p.relatedNeeds, plan: p }));
        if (!units.length) {
          units = HENDERSON_NEEDS.filter(n => myAssessmentLines(cp, n.id).length).map(n => ({ title: needName(n.id), needs: [n.id], plan: null }));
        }
        if (!units.length) units = [{ title: '全体', needs: [], plan: null }];
        units.forEach(u => {
          const inUnit = i => !u.needs.length || (i.hendersonIds || []).some(h => u.needs.includes(h));
          const cards = type => reportCardsForDay(assessmentDisplayOrder(active.filter(i => i.type === type && inUnit(i) && !isMissingInfoCard(i))), day);
          const recs = u.plan ? u.plan.records.filter(r => !recordFilter || recordFilter(r)) : [];
          const groups = sections.map(key => {
            if (key === 'S') return { title: 'S', lines: cards('s').map(i => cardLine(i)) };
            if (key === 'O') return { title: 'O', lines: cards('o').map(i => cardLine(i)) };
            if (key === 'A') {
              const needs = u.needs.length ? u.needs : HENDERSON_NEEDS.map(n => n.id);
              const lines = [];
              needs.forEach(h => { const l = myAssessmentLines(cp, h); if (l.length) lines.push(`【${needName(h)}】`, ...l); });
              const lastEval = recs.slice().reverse().find(r => r.evaluation);
              if (lastEval) lines.push(`評価（${formatMyDateTime(lastEval.at)}）：${lastEval.evaluation}`);
              return { title: 'A', lines };
            }
            if (key === 'P') {
              const p = u.plan;
              if (!p) return { title: 'P', lines: [] };
              const lines = [];
              if (p.goalLong) lines.push(`長期目標：${p.goalLong}`);
              if (p.goalShort) lines.push(`短期目標：${p.goalShort}`);
              CARE_PLAN_SECTIONS.forEach(s => p[s.key].forEach((t, n) => lines.push(`${s.short}${n + 1}. ${t}`)));
              const rev = recs.slice().reverse().find(r => r.revision);
              if (rev) lines.push(`計画の修正（${formatMyDateTime(rev.at)}）：${rev.revision}`);
              return { title: 'P', lines };
            }
            if (key === 'I') return { title: 'I', lines: recs.flatMap(r => [r.doneItems.length ? `【${formatMyDateTime(r.at)}】${r.doneItems.join('／')}` : `【${formatMyDateTime(r.at)}】`, ...(r.doneText ? [`実施内容：${r.doneText}`] : []), ...(r.response ? [`患者の反応：${r.response}`] : [])]).filter(l => !/^【[^】]*】$/.test(l) || recs.length) };
            if (key === 'E') return { title: 'E', lines: recs.filter(r => r.achievement || r.evaluation).map(r => `【${formatMyDateTime(r.at)}】${r.achievement ? `目標：${CARE_ACHIEVEMENTS.find(a => a.key === r.achievement).label}　` : ''}${r.evaluation}`) };
            return null;
          }).filter(Boolean);
          blocks.push({ title: u.title + (u.needs.length && u.plan ? `（${u.needs.map(needName).join('・')}）` : ''), groups });
        });
        return { title: `SOAP${dayNote}`, blocks };
      }

      sections.forEach(key => {
        if (key === 'profile') {
          const own = new Set(['確認結果', '患者の反応']);
          const lines = assessmentDisplayOrder(active.filter(i => i.fieldLabel && !own.has(i.fieldLabel))).map(i => `${i.fieldLabel}：${i.text}`);
          blocks.push({ title: '患者の概要', lines: [cp.title ? `患者：${cp.title}` : '', ...lines].filter(Boolean) });
        } else if (key === 'henderson') {
          const groups = HENDERSON_NEEDS.map(n => {
            const matching = active.filter(i => (i.hendersonIds || []).includes(n.id));
            const labels = assessmentSeqLabels(matching, n.id);
            const rec = reportCardsForDay(assessmentDisplayOrder(matching.filter(i => (i.assessmentCols?.[n.id] || 'unclassified') !== 'missing' && (i.type === 's' || i.type === 'o'))), day);
            const lines = [...rec.filter(i => i.type === 's').map(i => cardLine(i, labels[i.id])), ...rec.filter(i => i.type === 'o').map(i => cardLine(i, labels[i.id]))];
            const asm = myAssessmentLines(cp, n.id);
            if (asm.length) lines.push('（アセスメント）', ...asm);
            return lines.length ? { title: needName(n.id), lines } : null;
          }).filter(Boolean);
          blocks.push({ title: `ヘンダーソン14項目の情報とアセスメント${dayNote}`, groups });
        } else if (key === 'labs') {
          const table = buildLabTrendTable(active, { includeVitals: false });
          const lines = table.rows.length ? labTrendTableToTsv(table).split('\n').map(l => l.split('\t').map(x => x || '—').join(' ｜ ')) : [];
          blocks.push({ title: '検査値の推移', lines });
        } else if (key === 'indices') {
          let list = [];

          const idxText = cp.sourceText || active.map(i => i.text || '').join('\n');
          try { list = computeClinicalIndices(idxText, active).indices || []; } catch (e) { list = []; }
          blocks.push({ title: '計算した指標', lines: list.map(x => `${x.name}：${x.value}${x.unit ? ` ${x.unit}` : ''}（${x.detail}）${x.note ? `　${x.note}` : ''}`) });
        } else if (key === 'missing') {
          const lines = missingInfoItems(cp).map(i => {
            const st = missingCheckStatus(cp, i.id);
            const c = getMissingCheck(cp, i.id) || {};
            const needs = (i.hendersonIds || []).filter(h => (i.assessmentCols?.[h] || 'unclassified') === 'missing').map(needName).join('・');
            const head = `[${MISSING_CHECK_STATUSES.find(s => s.key === st).label}${c.checkedAt && st !== 'unchecked' ? ` ${formatMyDateTime(c.checkedAt)}` : ''}] ${needs ? `${needs}：` : ''}${i.text.replace(/^原因:\s*/, '')}`;
            return st === 'checked' && c.result ? `${head} → ${c.result}${c.method ? `（${c.method}）` : ''}` : head;
          });
          blocks.push({ title: '不足情報と確認結果', lines });
        } else if (key === 'problems') {
          blocks.push({ title: '看護問題（優先順位）', lines: carePlanList(cp).map((p, k) => `#${k + 1} ${p.problem || '（無題）'}（${CARE_PLAN_STATUSES.find(s => s.key === p.status).label}）`) });
        } else if (key === 'plans') {
          blocks.push({ title: '看護計画', lines: buildCarePlansText(cp, { withRecords: false }).split('\n') .filter((l, k, a) => l || (k > 0 && a[k - 1])) });
        } else if (key === 'records') {
          const groups = carePlanList(cp).map((p, k) => {
            const recs = p.records.filter(r => !recordFilter || recordFilter(r));
            return recs.length ? { title: `#${k + 1} ${p.problem || '（無題）'}`, lines: recs.flatMap(careRecordLines) } : null;
          }).filter(Boolean);
          blocks.push({ title: `実施・評価${recordFilter ? dayNote : ''}`, groups });
        }
      });
      return { title: `実習記録${dayNote}`, blocks };
    }

    function reportToText(cp, report) {
      const out = [`${report.title}：${cp.title || ''}`, `出力日時：${new Date().toLocaleString('ja-JP')}`, ''];
      report.blocks.forEach(b => {
        out.push(`■ ${b.title}`);
        (b.lines || []).forEach(l => out.push(l));
        if (b.lines && !b.lines.length && !b.groups) out.push('（なし）');
        (b.groups || []).forEach(g => {
          out.push(`${g.title}：`);
          if (g.lines.length) g.lines.forEach(l => out.push(`　${l}`)); else out.push('　（なし）');
        });
        if (b.groups && !b.groups.length) out.push('（なし）');
        out.push('');
      });
      return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
    }
    function reportToHtml(cp, report) {
      const body = report.blocks.map(b => {
        const lines = (b.lines || []).length ? `<div class="rp-lines">${b.lines.map(l => `<p>${escapeHtml(l)}</p>`).join('')}</div>` : (b.groups ? '' : '<p class="muted">（なし）</p>');
        const groups = (b.groups || []).map(g => `<div class="rp-group"><div class="rp-gt">${escapeHtml(g.title)}</div><div class="rp-lines">${g.lines.length ? g.lines.map(l => `<p>${escapeHtml(l)}</p>`).join('') : '<p class="muted">（なし）</p>'}</div></div>`).join('');
        return `<h2>${escapeHtml(b.title)}</h2>${lines}${groups}${b.groups && !b.groups.length ? '<p class="muted">（なし）</p>' : ''}`;
      }).join('');
      return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>${escapeHtml(`${cp.title || ''}_${report.title}`)}</title><style>${PRINT_BASE_CSS}
  @page { size: A4 portrait; }
  .rp-lines p { margin: 0 0 2pt; white-space: pre-wrap; }
  .rp-group { display: grid; grid-template-columns: minmax(2.2em, max-content) 1fr; gap: 6pt; margin: 3pt 0 6pt; }
  .rp-group .rp-gt { white-space: nowrap; }
  .rp-group .rp-gt { break-after: avoid; }
  .rp-lines p { break-inside: avoid; }
  .rp-group .rp-gt { font-weight: 700; }
  .rp-group:not(:has(.rp-gt:only-child)) .rp-gt { min-width: 0; }
</style></head><body>${printDocHead(report.title, cp)}${body}</body></html>`;
    }

    let reportState = null;
    window.openReport = function() {
      reportState = loadReportLayout();
      const cp = getCurrentPatient();
      const days = reportDayOptions(cp);
      document.getElementById('report-day').innerHTML = `<option value="">すべての日</option>${days.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('')}`;
      renderReportDialog();
      document.getElementById('modal-report').classList.remove('hidden');
    };
    window.closeReport = function() { document.getElementById('modal-report').classList.add('hidden'); };
    function renderReportDialog() {
      const st = reportState;
      document.querySelectorAll('#report-format [data-format]').forEach(b => b.classList.toggle('active', b.dataset.format === st.format));
      document.getElementById('report-format-note').textContent = REPORT_FORMATS[st.format].note;
      const layout = st.layouts[st.format];
      document.getElementById('report-sections').innerHTML = layout.map((s, k) => {
        const def = REPORT_FORMATS[st.format].sections.find(x => x.key === s.key);
        return `<li class="rp-sec${s.on ? '' : ' off'}"><label><input type="checkbox" ${s.on ? 'checked' : ''} onchange="toggleReportSection(${k}, this.checked)"> ${escapeHtml(def.label)}</label>
          <span class="rp-move"><button type="button" class="icon-btn" onclick="moveReportSection(${k}, -1)" ${k === 0 ? 'disabled' : ''} title="上へ"><i class="fa-solid fa-arrow-up"></i></button><button type="button" class="icon-btn" onclick="moveReportSection(${k}, 1)" ${k === layout.length - 1 ? 'disabled' : ''} title="下へ"><i class="fa-solid fa-arrow-down"></i></button></span></li>`;
      }).join('');
      document.getElementById('report-preview').textContent = currentReportText();
    }
    function currentReport() {
      const cp = getCurrentPatient();
      return buildReport(cp, { format: reportState.format, layout: reportState.layouts[reportState.format], day: document.getElementById('report-day').value });
    }
    function currentReportText() { return reportToText(getCurrentPatient(), currentReport()); }
    window.setReportFormat = function(f) { reportState.format = f; saveReportLayout(reportState); renderReportDialog(); };
    window.toggleReportSection = function(k, on) { reportState.layouts[reportState.format][k].on = on; saveReportLayout(reportState); renderReportDialog(); };
    window.moveReportSection = function(k, d) {
      const list = reportState.layouts[reportState.format];
      const j = k + d;
      if (j < 0 || j >= list.length) return;
      [list[k], list[j]] = [list[j], list[k]];
      saveReportLayout(reportState);
      renderReportDialog();
    };
    window.resetReportLayout = function() { reportState.layouts[reportState.format] = defaultReportLayout(reportState.format); saveReportLayout(reportState); renderReportDialog(); };
    window.onReportDayChange = function() { renderReportDialog(); };
    window.copyReport = async function() {
      try { await navigator.clipboard.writeText(currentReportText()); showToast('書き出した内容をコピーしました', 'success'); }
      catch (e) { showToast(['コピーできませんでした', { text: 'プレビューの文章を選んで Ctrl+C でコピーするか、「テキストで保存」を使ってください。', detail: true }], 'error'); }
    };
    window.downloadReport = async function() {
      const cp = getCurrentPatient();
      const blob = new Blob([currentReportText()], { type: 'text/plain;charset=utf-8' });

      if (!(await downloadTextBlob(blob, `${(cp.title || 'カルテ').replace(/[\\/:*?"<>|]/g, '_')}_${REPORT_FORMATS[reportState.format].label}.txt`))) return;
      showToast('テキストファイル（.txt）を保存しました', 'success');
    };
    window.printReport = function() {
      printHtmlDocument(reportToHtml(getCurrentPatient(), currentReport()));
      showToast(isMobilePrintTarget() ? '印刷用の見本を開きました。上の「印刷・PDFに保存」を押してください' : '印刷画面を開きます。「送信先」で「PDFに保存」を選ぶとPDFになります', 'info');
    };

    // ==========================================================================

    // ==========================================================================
    const UNDO_MAX = 30;
    const undoStacks = Object.create(null);
    const redoStacks = Object.create(null);
    function itemsSnapshot(cp) { return JSON.stringify(cp.items || []); }
    // Restoration updates synchronization timestamps; content and linked state must still match.
    function boardHistoryExpected(cp) {
      return JSON.stringify({items:(cp.items || []).map(item => ({...item, _touchedAt:undefined})),
        dependencies:{carePlans:cp.carePlans || {},myAssessments:cp.myAssessments || {},missingChecks:cp.missingChecks || {},relationMap:cp.relationMap || null}});
    }
    function pushUndo(patientId, before, label, target) {
      const cp = target || globalAppData.patients.find(p => p.id === patientId);
      if (!cp || cp.id !== patientId) return false;
      const st = undoStacks[patientId] || (undoStacks[patientId] = []);
      st.push({label, items:before, after:itemsSnapshot(cp), expected:boardHistoryExpected(cp), at:Date.now()});
      if (st.length > UNDO_MAX) st.shift();
      redoStacks[patientId] = [];
      renderUndoButton();
      return true;
    }
    function undoLabel(patientId) {
      const st = undoStacks[patientId] || [];
      return st.length ? st[st.length - 1].label : '';
    }
    function undoLast(cp, redo = false) {
      const st = (redo ? redoStacks : undoStacks)[cp.id] || [];
      const last = st[st.length - 1];
      if (!last) return null;
      if (boardHistoryExpected(cp) !== last.expected) {
        showToast('カードや根拠に後続の変更があります。現在の内容を保護するため変更しません', 'warn');
        return null;
      }
      const restored = JSON.parse(redo ? last.after : last.items);
      const keep = new Set(restored.map(i => i.id));
      (cp.items || []).forEach(i => { if (!keep.has(i.id)) markItemDeleted(cp, i.id); });
      restored.forEach(i => { touchItem(i); if (typeof unmarkItemDeleted === 'function') unmarkItemDeleted(cp, i.id); });
      cp.items = restored;
      st.pop();
      const to = (redo ? undoStacks : redoStacks)[cp.id] || ((redo ? undoStacks : redoStacks)[cp.id] = []);
      to.push({...last, expected:boardHistoryExpected(cp)});
      // Earlier entries retain their content preimages; only synchronization timestamps are ignored.
      return last;
    }
    function renderUndoButton() {
      const cp = getCurrentPatient();
      const btn = document.getElementById('btn-undo');
      if (btn) {
        const label = undoLabel(cp.id);
        btn.disabled = !label;
        btn.title = label ? `「${label}」を元に戻す（Ctrl+Z）` : '元に戻せる操作はありません';
      }
      const redo = document.getElementById('btn-redo');
      if (redo) redo.disabled = !(redoStacks[cp.id] || []).length;
    }
    window.undoLastEdit = function(redo = false) {
      const cp = getCurrentPatient();
      const last = undoLast(cp, redo);
      if (!last) return false;
      if (typeof selectedCardIds !== 'undefined') selectedCardIds.clear();
      saveDataAndSync();
      renderUndoButton();
      showToast(`「${last.label}」を${redo ? 'やり直しました' : '元に戻しました'}`, 'success');
      return true;
    };
    function wrapUndoable(name, label) {
      const orig = window[name];
      if (typeof orig !== 'function' || orig.__undoable) return;
      const wrapped = function(...args) {
        const cp = getCurrentPatient();
        const before = itemsSnapshot(cp);
        const res = orig.apply(this, args);
        const finish = () => {
          const p = globalAppData.patients.find(x => x.id === cp.id);
          if (p && itemsSnapshot(p) !== before) pushUndo(cp.id, before, typeof label === 'function' ? label(...args) : label);
        };
        if (res && typeof res.then === 'function') res.then(value => { if (value !== false) finish(); }, () => {}); else if (res !== false) finish();
        return res;
      };
      wrapped.__undoable = true;
      window[name] = wrapped;
    }
    const TYPE_LABEL_JA = { s: 'Sに移す', o: 'Oに移す', unclassified: '未分類に戻す', unnecessary: '不要にする' };
    wrapUndoable('setItemType', (id, type) => TYPE_LABEL_JA[type] || '分類の変更');
    wrapUndoable('bulkSetType', type => `まとめて${TYPE_LABEL_JA[type] || '分類の変更'}`);
    wrapUndoable('setItemMixed', (id, on) => on ? 'S/O混在にする' : 'S/O混在の解除');
    wrapUndoable('toggleCardCorrectionRequest', () => '修正依頼の追加・解除');
    wrapUndoable('deleteItem', () => 'カードの削除');
    wrapUndoable('clearUnnecessary', () => '不要カードの消去');
    wrapUndoable('saveMissingInfo', () => '不足情報カードの追加');
    wrapUndoable('bulkAddTag', () => 'まとめてタグを付ける');
    wrapUndoable('addHendersonTag', () => 'タグを付ける');
    wrapUndoable('removeHendersonTag', () => 'タグを外す');
    wrapUndoable('editItemText', () => '本文の編集');
    wrapUndoable('setAssessmentCol', () => '欄の移動');
    wrapUndoable('moveAssessmentCard', () => '並べ替え');
    wrapUndoable('handleAssessmentCardDrop', () => '並べ替え');
    wrapUndoable('reapplyTagRulesToUntagged', () => 'タグの付け直し');
    (() => {
      const btn = document.getElementById('btn-confirm-merge');
      if (!btn || !btn.addEventListener) return;
      let before = null, pid = null;
      btn.addEventListener('click', () => { const cp = getCurrentPatient(); before = itemsSnapshot(cp); pid = cp.id; setTimeout(() => {
        const p = globalAppData.patients.find(x => x.id === pid);
        if (p && before && itemsSnapshot(p) !== before) pushUndo(pid, before, 'カードの統合');
      }, 0); }, true);
    })();
    document.addEventListener('keydown', e => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || !['z','y'].includes(String(e.key).toLowerCase())) return;
      const redo = e.shiftKey || String(e.key).toLowerCase() === 'y';
      if (['view-relation', 'view-careplan', 'view-genogram'].some(id => { const view = document.getElementById(id); return view && !view.classList.contains('hidden'); })) return;
      const t = document.activeElement;
      if (t && (/^(?:INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (document.querySelector('.fixed.inset-0:not(.hidden)')) return;
      if (redo ? !(redoStacks[getCurrentPatient().id] || []).length : !undoLabel(getCurrentPatient().id)) return;
      e.preventDefault();
      window.undoLastEdit(redo);
    });

    function splitCardIntoParts(cp, id, parts, reason = '') {
      const idx = cp.items.findIndex(i => i.id === id);
      if (idx === -1) return null;
      let texts = parts.map(t => cleanExtractedPhrase(t)).filter(Boolean);

      if (texts.length >= 2 && texts.some(t => /。$/.test(t))) texts = texts.map(t => punctuateClause(t));
      if (texts.length < 2) return null;
      const src = cp.items[idx];
      const before = src.text;
      src.text = texts[0];
      const sourceCards = [JSON.parse(JSON.stringify(src))];
      sourceCards[0].text = before;
      const operationId = `split_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const entry = { kind: 'split', actor: 'user', operationId, from: before, parts: texts.slice(), sourceCards, reason: reason.trim() || null };
      logItemEdit(src, { ...entry, to: src.text });
      touchItem(src);
      const added = texts.slice(1).map(text => {
        const c = { ...JSON.parse(JSON.stringify(src)), id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, text, editLog: [{ at: new Date().toISOString(), ...entry, to: text }] };
        delete c.sceneId;
        touchItem(c);
        return c;
      });
      // A card made by a merge carries the union of its sources' tags. When it is split again, each piece keeps only the tags its own
      // text supports (or that the user added by hand); other splits keep the source tags as before. The union must not stay on a piece that no longer contains the evidence.
      const userAddedTags = new Set((src.editLog || []).filter(e => e && e.kind === 'tagAdd').map(e => Number(e.hId)));
      const fromMerge = (src.editLog || []).some(e => e && e.kind === 'merge');
      [src, ...added].forEach(piece => {
        if (!fromMerge || !(piece.hendersonIds || []).length || piece.contextTagEvidence) return;
        const own = new Set(isPatientIdentityLine(piece.text) ? [] : detectMultipleHendersonTags(piece.text));
        const keep = piece.hendersonIds.filter(h => own.has(h) || userAddedTags.has(h));
        if (keep.length === piece.hendersonIds.length) return;
        const cols = {};
        keep.forEach(h => { cols[h] = (piece.assessmentCols || {})[h] || 'unclassified'; });
        piece.hendersonIds = keep; piece.assessmentCols = cols;
      });
      const resultIds = [src, ...added].map(i => i.id);
      [src, ...added].forEach(i => { i.editLog[i.editLog.length - 1].resultIds = resultIds.slice(); });
      cp.items.splice(idx + 1, 0, ...added);
      return [src, ...added];
    }
    let splitEditingId = null;
    window.openSplitCard = function(id) {
      const item = getCurrentPatient().items.find(i => i.id === id);
      if (!item) return;
      splitEditingId = id;
      const ta = document.getElementById('split-text');
      ta.value = item.text;
      document.getElementById('split-reason').value = '';
      updateSplitPreview();
      document.getElementById('modal-split').classList.remove('hidden');
      ta.focus();
    };
    window.closeSplitCard = function() { splitEditingId = null; document.getElementById('modal-split').classList.add('hidden'); };
    window.splitAtSentences = function() {
      const ta = document.getElementById('split-text');

      ta.value = ta.value.replace(/\n+/g, '').replace(/(。|、(?=「)|」(?=[^。、」]))/g, '$1\n').replace(/\n+$/, '').split('\n').flatMap(line => splitCompoundSentences(line)).join('\n');
      updateSplitPreview();
    };
    function updateSplitPreview() {
      const parts = document.getElementById('split-text').value.split(/\n+/).map(s => s.trim()).filter(Boolean);
      const el = document.getElementById('split-count');
      if (el) el.textContent = parts.length >= 2 ? `${parts.length}枚のカードに分けます` : '分けたい所で改行してください（2行以上で分けられます）';
      const ok = document.getElementById('btn-split-confirm');
      if (ok) ok.disabled = parts.length < 2;
    }
    window.updateSplitPreview = updateSplitPreview;
    window.confirmSplitCard = function() {
      if (!splitEditingId) return;
      const cp = getCurrentPatient();
      const before = itemsSnapshot(cp);
      const parts = document.getElementById('split-text').value.split(/\n+/);
      const res = splitCardIntoParts(cp, splitEditingId, parts, document.getElementById('split-reason').value);
      if (!res) return showToast('分けたい所で改行してください（2行以上）', 'warn');
      pushUndo(cp.id, before, 'カードを分ける');
      closeSplitCard();
      saveDataAndSync();
      showToast(`${res.length}枚のカードに分けました`, 'success');
    };

    // ==========================================================================

    // ==========================================================================
    function workflowStatus(cp) {
      const items = cp.items || [];
      const active = items.filter(i => i.type !== 'unnecessary' && !i.diseaseGeneral);
      const unclassified = items.filter(i => i.type === 'unclassified').length;
      const untagged = active.filter(i => typeof isUntaggedItem === 'function' && isUntaggedItem(i)).length;
      const asm = cp.myAssessments && typeof cp.myAssessments === 'object' ? Object.values(cp.myAssessments).filter(Boolean) : [];
      const written = asm.filter(e => MY_ASSESSMENT_FIELDS.some(f => String(e[f.key] || '').trim())).length;
      const confirmed = asm.filter(e => (e.history || []).length).length;
      const plans = carePlanList(cp);
      const steps = [

        { key: 'collect', label: '情報収集', done: items.length > 0 && !unclassified && !untagged,
          note: [items.length ? `${items.length}枚` : '', unclassified ? `未分類${unclassified}` : '', untagged ? `タグなし${untagged}` : ''].filter(Boolean).join('・') },
        { key: 'assess', label: 'アセスメント', done: confirmed > 0, note: written ? `${written}項目${confirmed ? `（確定${confirmed}）` : ''}` : '' },
        { key: 'plan', label: '看護計画', done: plans.length > 0, note: plans.length ? `${plans.length}件` : '' },
        { key: 'export', label: '書き出し', done: false, note: '' }
      ];
      const next = steps.find(s => !s.done);
      steps.forEach(s => { s.current = s === next; });
      return steps;
    }
    function renderWorkflowSteps() {
      const nav = document.getElementById('workflow-steps');
      if (!nav) return;
      const cp = getCurrentPatient();
      const steps = workflowStatus(cp);
      const doneN = steps.filter(s => s.done).length;
      if (nav.setAttribute) nav.setAttribute('data-progress', `（${steps.length}段階のうち${doneN}つ済み）`);
      nav.innerHTML = `<span class="wf-patient" title="今表示しているカルテ"><i class="fa-solid fa-hospital-user"></i> ${escapeHtml(cp.title || '')}</span>` + steps.map((s, k) => `<button type="button" class="wf-step${s.done ? ' done' : ''}${s.current ? ' current' : ''}" onclick="goWorkflowStep('${s.key}')" ${s.current ? 'aria-current="step"' : ''}>
        <span class="wf-no">${s.done ? '<i class="fa-solid fa-check"></i>' : k + 1}</span><span class="wf-label">${s.label}</span>${s.note ? `<span class="wf-note">${escapeHtml(s.note)}</span>` : ''}${s.current ? '<span class="wf-next">次はここ</span>' : ''}</button>`).join('<i class="fa-solid fa-chevron-right wf-sep" aria-hidden="true"></i>');
      // Mirror step progress onto the grouped header navigation (done check / 次はここ badge).
      if (document.querySelectorAll) document.querySelectorAll('.nav-grp[data-step]').forEach(g => { const s = steps.find(x => x.key === g.getAttribute('data-step')); g.classList.toggle('is-done', !!(s && s.done)); g.classList.toggle('is-next', !!(s && s.current)); if (s && s.note) g.setAttribute('title', s.note); else g.removeAttribute('title'); });
    }
    window.goWorkflowStep = function(key) {

      if (key === 'collect') {
        const cp = getCurrentPatient(), items = cp.items || [];
        key = !items.length ? (String(cp.sourceText || '').trim() ? 'classify' : 'paste') : 'fix';
      }
      if (key === 'paste') { switchView('so'); DOM.sourceText.focus(); }
      else if (key === 'classify') { switchView('so'); document.getElementById('btn-start-classify')?.focus(); }
      else if (key === 'fix') {
        switchView('so');
        const first = (getCurrentPatient().items || []).find(i => i.type === 'unclassified') || (getCurrentPatient().items || []).find(i => i.type !== 'unnecessary' && isUntaggedItem(i));
        if (first) jumpToBoardCard(first.id);
      }
      else if (key === 'assess') switchView('assessment');
      else if (key === 'plan') switchView('careplan');
      else if (key === 'export') openReport();
    };

    function onPatientViewReloaded(cp) {
      renderCarePlans();
      renderUndoButton();
      renderWorkflowSteps();
      maybeCheckpointOnOpen(cp);
    }

    try { renderAssessmentTable(); renderCarePlans(); renderWorkflowSteps(); } catch (err) { console.warn('View render failed:', err); }

    // ==========================================================================

    // ==========================================================================
    window.aiPipelineStatus = { running: false, label: '' };
    function setAiPipelineStatus(running, label = '') {
      window.aiPipelineStatus = { running, label };
      if (typeof renderAiSteps === 'function') renderAiSteps(getCurrentPatient());
    }

    // ---- v.108 presentation layer (no data or logic changes): phone step nav, verdict dots, reference search ----
    (function v108Presentation() {
      if (typeof document === 'undefined' || !document.getElementById) return;
      const $ = id => document.getElementById(id);
      const VIEW_TABS = ['tab-so-board', 'tab-assessment', 'tab-labs', 'tab-relation', 'tab-genogram', 'tab-careplan', 'tab-reference'];
      const ASSESS_TABS = ['tab-assessment', 'tab-labs', 'tab-relation', 'tab-genogram'];
      const STEP_OF = { 'tab-so-board': 'collect', 'tab-assessment': 'assess', 'tab-labs': 'assess', 'tab-relation': 'assess', 'tab-genogram': 'assess', 'tab-careplan': 'plan', 'tab-reference': 'ref' };
      function currentTab() { return VIEW_TABS.find(id => $(id) && $(id).classList.contains('active')) || 'tab-so-board'; }
      function syncStepNav() {
        const cur = currentTab(), step = STEP_OF[cur];
        document.querySelectorAll('#mobile-step-nav button').forEach(b => {
          const k = b.getAttribute('data-step-key'), grp = document.querySelector('.nav-grp[data-step="' + k + '"]');
          b.classList.toggle('is-cur', k === step);
          if (k === step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
          b.classList.toggle('is-done', !!(grp && grp.classList.contains('is-done')));
          const no = b.querySelector('.msn-no'); if (no && k !== 'ref') no.textContent = b.classList.contains('is-done') && k !== step ? '✓' : ({ collect: '1', assess: '2', plan: '3' })[k];
        });
        const sub = $('assess-subnav');
        if (sub) {
          const show = ASSESS_TABS.includes(cur);
          sub.classList.toggle('is-shown', show); sub.hidden = !show;
          sub.querySelectorAll('button').forEach(b => { const on = b.getAttribute('data-tab-target') === cur; b.classList.toggle('is-cur', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
        }
      }
      document.addEventListener('click', e => {
        const b = e.target && e.target.closest ? e.target.closest('[data-tab-target]') : null;
        if (!b) return;
        const t = $(b.getAttribute('data-tab-target')); if (t) t.click();
      });
      // assessment: verdict dot on each need button and the 充足/未充足/情報不足 count line (read from the existing sufficiency state)
      function decorateNeedNav() {
        const nav = $('assessment-need-nav'); if (!nav || typeof getSufficiency !== 'function' || typeof getCurrentPatient !== 'function') return;
        let cp; try { cp = getCurrentPatient(); } catch (e) { return; }
        if (!cp || typeof sufficiencyUiPhases !== 'function') return;
        let met = 0, unmet = 0, na = 0;
        nav.querySelectorAll('.need-nav-btn').forEach(b => {
          const id = Number(b.getAttribute('data-need-id')); let v = 'na';
          try { const ph = sufficiencyUiPhases(cp).map(p => getSufficiency(cp, id, p.key)); v = ph.includes('unmet') ? 'unmet' : (ph.includes('met') ? 'met' : 'na'); } catch (e) { }
          if (b.getAttribute('data-verdict') !== v) b.setAttribute('data-verdict', v);
          if (v === 'met') met++; else if (v === 'unmet') unmet++; else na++;
        });
        const el = $('asm-verdict-summary');
        if (el) { const html = '14項目中 <b class="avs-ng">未充足 ' + unmet + '</b> ・ 充足 ' + met + ' ・ 情報不足 ' + na; if (el.innerHTML !== html) el.innerHTML = html; }
      }
      // reference: count chip and search over the rendered cards (display only)
      function applyReferenceFilter() {
        const list = $('reference-list'); if (!list) return;
        const q = String(($('reference-search') || {}).value || '').normalize('NFKC').toLowerCase().trim();
        const cards = Array.from(list.children); let shown = 0;
        cards.forEach(c => { const hit = !q || String(c.textContent || '').normalize('NFKC').toLowerCase().includes(q); c.style.display = hit ? '' : 'none'; if (hit) shown++; });
        const chip = $('reference-count'); if (chip) chip.textContent = (q ? '該当 ' + shown + ' / ' : 'すべて ') + cards.length;
      }
      // care plan: left priority list + one selected plan in detail (the existing cards stay in the DOM; only their visibility changes)
      let cpSel = null;
      function cpRebuild() {
        const list = $('careplan-list'), view = $('view-careplan'); if (!list || !view) return;
        const cards = Array.from(list.children).filter(c => c.classList && c.classList.contains('cp-card'));
        let nav = $('cp-prio');
        if (!nav) { nav = document.createElement('nav'); nav.id = 'cp-prio'; nav.className = 'cp-prio'; nav.setAttribute('aria-label', '看護問題の一覧'); list.parentNode.insertBefore(nav, list); }
        if (!cards.length) { nav.textContent = ''; view.classList.remove('cp-md'); return; }
        view.classList.add('cp-md');
        if (!cards.some(c => c.getAttribute('data-care-plan-id') === cpSel)) cpSel = cards[0].getAttribute('data-care-plan-id');
        const txt = (c, sel) => { const e = c.querySelector(sel); return e ? String(e.textContent || '').replace(/\s+/g, ' ').trim() : ''; };
        const idx = cards.findIndex(c => c.getAttribute('data-care-plan-id') === cpSel), cur = cards[idx];
        cards.forEach(c => { const on = c === cur; c.classList.toggle('cp-sel', on); if (on) c.classList.add('open'); });
        // a closed plan renders head-only: open the selected one so its body (goals, OP/TP/EP) is shown
        if (cur && !cur.querySelector('.cp-body') && typeof toggleCarePlan === 'function' && !cpRebuild.opening) { cpRebuild.opening = true; try { toggleCarePlan(cpSel); } finally { cpRebuild.opening = false; } return; }
        nav.textContent = '';
        const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'cp-prio-toggle'; toggle.setAttribute('aria-expanded', nav.classList.contains('is-open') ? 'true' : 'false');
        const t1 = document.createElement('span'); t1.textContent = '看護問題 ' + (idx + 1) + ' / ' + cards.length; const b = document.createElement('b'); b.textContent = txt(cur, '.cp-no') + ' ' + txt(cur, '.cp-title');
        toggle.append(t1, b); toggle.addEventListener('click', () => { const o = nav.classList.toggle('is-open'); toggle.setAttribute('aria-expanded', o ? 'true' : 'false'); });
        const lbl = document.createElement('p'); lbl.className = 'cp-prio-label'; lbl.textContent = '優先順位（上下の矢印で並べ替え）';
        const ul = document.createElement('div'); ul.className = 'cp-prio-list';
        cards.forEach(c => {
          const bt = document.createElement('button'); bt.type = 'button'; bt.className = 'cp-prio-btn'; const id = c.getAttribute('data-care-plan-id');
          if (id === cpSel) { bt.classList.add('is-cur'); bt.setAttribute('aria-current', 'true'); }
          const no = document.createElement('span'); no.className = 'cp-prio-no'; no.textContent = txt(c, '.cp-no');
          const body = document.createElement('span'); body.className = 'cp-prio-body'; const ti = document.createElement('b'); ti.textContent = txt(c, '.cp-title');
          const sub = document.createElement('span'); sub.textContent = [txt(c, '.cp-status'), txt(c, '.cp-meta .my-asm-muted')].filter(Boolean).join(' ・ ');
          body.append(ti, sub); bt.append(no, body);
          bt.addEventListener('click', () => { cpSel = id; nav.classList.remove('is-open'); cpRebuild(); });
          ul.appendChild(bt);
        });
        nav.append(toggle, lbl, ul);
      }
      // labs: counts of values outside the reference, and the evaluation panel kept open beside the table on wide screens
      function labSummary() { const old = $('lab-summary'); if (old) old.remove(); }
      // board: bar that leads on to the assessment table (counts read from the saved cards)
      function boardProceedBar() {
        const grid = $('so-board-grid'); if (!grid || typeof getCurrentPatient !== 'function') return;
        let cp; try { cp = getCurrentPatient(); } catch (e) { return; }
        const items = ((cp && cp.items) || []).filter(i => i && !i.deleted && i.type !== 'unnecessary');
        let bar = $('board-proceed-bar');
        if (!bar) { bar = document.createElement('div'); bar.id = 'board-proceed-bar'; bar.className = 'board-proceed-bar'; grid.parentNode.insertBefore(bar, grid.nextSibling); }
        bar.classList.toggle('hidden', !items.length);
        const n = items.filter(i => i.type === 'unclassified').length;
        const msg = n ? '未分類のカードが <b class="bpb-ng">' + n + '枚</b> あります。振り分けると次の段階に進めます。' : '分類が終わっています。次はアセスメント表です。';
        const html = '<span>' + msg + '</span><button type="button" class="btn btn-outline" data-tab-target="tab-assessment">アセスメント表へ進む →</button>';
        if (bar.getAttribute('data-sig') !== html) { bar.innerHTML = html; bar.setAttribute('data-sig', html); }
        boardCountChips(cp);
      }
      // board toolbar: 未分類 / 不必要 count chips that open and scroll to those sections
      function boardCountChips(cp) {
        const tb = $('board-toolbar'), more = $('board-actions'); if (!tb || !more) return;
        let wrap = $('board-count-chips');
        if (!wrap) {
          wrap = document.createElement('div'); wrap.id = 'board-count-chips'; wrap.className = 'board-count-chips'; tb.insertBefore(wrap, more);
          wrap.addEventListener('click', e => {
            const b = e.target.closest ? e.target.closest('[data-board-section]') : null; if (!b) return;
            const d = $(b.getAttribute('data-board-section')); if (!d) return;
            d.open = true; if (d.scrollIntoView) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        }
        const all = ((cp && cp.items) || []).filter(i => i && !i.deleted);
        const nU = all.filter(i => i.type === 'unclassified').length, nN = all.filter(i => i.type === 'unnecessary').length;
        const chip = (id, label, n, cls) => '<button type="button" class="board-count-chip' + (cls && n ? ' ' + cls : '') + '" data-board-section="' + id + '">' + label + ' <span class="badge-count">' + n + '</span></button>';
        const html = chip('board-unclassified', '未分類', nU, 'is-warn') + chip('board-unnecessary', '不必要', nN, '');
        if (wrap.getAttribute('data-sig') !== html) { wrap.innerHTML = html; wrap.setAttribute('data-sig', html); }
      }
      // genogram: sex as three buttons that drive the existing select
      function ggSexButtons() {
        ['gg-new-sex', 'gg-f-sex'].forEach(id => {
          const sel = $(id); if (!sel || sel.getAttribute('data-seg')) return; sel.setAttribute('data-seg', '1');
          const seg = document.createElement('div'); seg.className = 'gg-seg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', '性別');
          [['m', '男性'], ['f', '女性'], ['u', '不明']].forEach(([v, lab]) => {
            const b = document.createElement('button'); b.type = 'button'; b.textContent = lab; b.setAttribute('data-sex', v);
            b.addEventListener('click', () => { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); seg.querySelectorAll('button').forEach(x => x.classList.toggle('is-sel', x === b)); });
            seg.appendChild(b);
          });
          const mark = () => seg.querySelectorAll('button').forEach(x => x.classList.toggle('is-sel', x.getAttribute('data-sex') === sel.value)); mark();
          sel.addEventListener('change', mark); sel.classList.add('gg-sex-select'); sel.parentNode.insertBefore(seg, sel);
        });
      }
      function init() {
        VIEW_TABS.forEach(id => { const t = $(id); if (t && window.MutationObserver) new MutationObserver(syncStepNav).observe(t, { attributes: true, attributeFilter: ['class'] }); });
        document.querySelectorAll('.nav-grp[data-step]').forEach(g => { if (window.MutationObserver) new MutationObserver(syncStepNav).observe(g, { attributes: true, attributeFilter: ['class'] }); });
        const nav = $('assessment-need-nav'); if (nav && window.MutationObserver) new MutationObserver(decorateNeedNav).observe(nav, { childList: true });
        const rl = $('reference-list'); if (rl && window.MutationObserver) new MutationObserver(applyReferenceFilter).observe(rl, { childList: true });
        const rs = $('reference-search'); if (rs) rs.addEventListener('input', applyReferenceFilter);
        const cl = $('careplan-list'); if (cl && window.MutationObserver) new MutationObserver(cpRebuild).observe(cl, { childList: true });
        const lw = $('lab-trend-table-wrap'); if (lw && window.MutationObserver) new MutationObserver(labSummary).observe(lw, { childList: true });
        const lev = $('lab-evaluation-panel'); if (lev && window.MutationObserver) new MutationObserver(labSummary).observe(lev, { attributes: true, attributeFilter: ['class', 'open'] });
        ['col-s', 'col-o'].forEach(id => { const c = $(id); if (c && window.MutationObserver) new MutationObserver(boardProceedBar).observe(c, { childList: true }); });
        const gp = $('gg-panel'); if (gp && window.MutationObserver) new MutationObserver(ggSexButtons).observe(gp, { childList: true });
        const lg = $('rm-legend-wrap'); if (lg && window.matchMedia && window.matchMedia('(max-width: 640px)').matches) lg.open = false;
        syncStepNav(); decorateNeedNav(); applyReferenceFilter(); cpRebuild(); labSummary(); boardProceedBar(); ggSexButtons();
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { try { init(); } catch (e) { } }); else { try { init(); } catch (e) { } }
    })();

// Destination proposals for cards that are deliberately not forced into a Henderson need: where the information belongs instead.
// General layers: structure (headings/tables), specialty concept (kept separate from the 14 needs), background, subject-specific (newborn / family), incomplete fragment.
const CARD_DESTINATIONS = [
  { key: 'fragment', re: /^[^\s。、]{1,6}(?:時|後|前|中)(?:付|に|を|が|の)$/, label: '不完全な断片', to: '元の文章へ復元して照合（単独カードにしない）' },
  // 新分類先（2026-10-28 承認）: データ品質。一般条件=本人の状態ではなく「記録そのものの読み取りの確かさ」を述べた文。
  { key: 'dataquality', re: /原本(?:で)?(?:の)?確認|原文(?:が)?(?:不明瞭|不鮮明|読めない)|判読(?:不能|できない|困難)|読み取れ(?:ない|ず|なかった)|単位(?:が)?(?:不明|欠落|読めない)|転記(?:ミス|誤り)の可能性/, label: 'データ品質・根拠確度（メタ情報）', to: '情報の確かさを示すメタ情報として保持し、判定の根拠確度に反映する（患者の所見にしない）' },
  { key: 'overall', re: /(?:身体的)?異常(?:は)?(?:なし|みられ(?:ず|なかった)|を認めず)|問題なし/, label: '総合所見', to: '評価した範囲を明記した総合所見として保持（単独で充足判定に使わない）' },
  { key: 'puerperal', re: /子宮(?:底|復古|の硬さ|収縮)|悪露|後陣痛|会陰(?:切開|裂傷|創)|分娩(?:直後|後)\s*\d*時間後/, label: '産褥の回復（専門概念）', to: '専門概念タグ「産褥の回復」として保持。痛みで動けない・出血や発熱の徴候があるときだけ4・7・9へ対応づける' },
  { key: 'lactation', re: /乳房|乳頭|乳汁|乳管|初乳|授乳|母乳|哺乳|含ませ|吸着|吸啜/, label: '授乳・乳房（専門概念）', to: '専門概念タグ「授乳・乳房」として保持。母親の食事・水分は2、授乳技術の習得は14、不安の表出は10へ必要に応じて対応づける' },
  { key: 'newborn', re: /新生児|出生時体重|生後\s*\d+\s*日|児の(?:健康|哺乳|体重|様子)|胎児付属物|奇形なし|仮死なし/, label: '新生児の情報（対象：新生児）', to: '新生児の情報として別管理（母親の身体所見に混ぜない）。母親の授乳評価とは関連づけだけ行う' },
  { key: 'delivery', re: /陣痛|分娩(?:経過|所要|開始)|自然破水|子宮口全開|出産(?:する|した)|正常分娩|娩出|分娩時出血/, label: '分娩・出産の経過（背景）', to: '背景情報（時期＝分娩期）として保持。現在の症状と混ぜない' },
  { key: 'pregnancy', re: /妊娠\s*\d+\s*週|妊娠(?:経過|中)|初産婦|経産婦|妊娠分娩歴|母親学級/, label: '妊娠・出産歴（背景）', to: '背景情報（時期＝妊娠期・過去）として保持。妊娠中の検査値は産褥の現在値にしない' },
  { key: 'history', re: /\[?(?:既往歴|アレルギー|感染症|過去の出来事)\]?/, label: '既往・背景情報', to: '背景情報として保持。現在の問題の根拠にしない' },
  { key: 'goal', re: /(?:戻りたい|続けたい|再開したい|復帰したい|やりたい|してみたい|したい)(?:と(?:話|思|言)|です|ですが|。|$)/, label: '本人の希望・目標（横断）', to: '本人の希望として保持し、複数の欲求の判断とOP/TP/EPの選択に使う（制限の根拠にしない）。単独のヘンダーソン項目に固定しない' },
  // 新分類先（2026-10-28 承認）: 自己管理の工程。一般条件=本人が行う自己管理行為について、手技・理解・解釈・判断・実行・援助要請のどの工程の記述かを述べた文。
  { key: 'selfmgmt', re: /(?:自己(?:測定|注射|血糖測定|管理)|SMBG|インスリン(?:注射|自己注射)|補食|手技|服薬管理)[^。]{0,20}(?:確認|できる|できて|できない|練習|見守り|間違|誤|忘れ|相談|連絡|判断|理解|説明)|(?:困った|わからない|異常|低血糖|体調不良)(?:の)?(?:とき|時)(?:は|に)?[^。]{0,10}(?:連絡|相談|受診)/, label: '自己管理の工程（手技・理解・解釈・判断・実行・援助要請）', to: '自己管理の工程別の情報として保持し、どの工程に課題があるかを分けて示す（該当する欲求のタグは別に付ける）' },
  // 新分類先（2026-10-28 承認）: 支援の可用性（横断）。一般条件=支援者の有無ではなく「いつ・どれだけ頼れるか」（距離・時間・仕事・同居）を述べた文。
  { key: 'availability', re: /(?:実家|親|母|父|両親|夫|妻|家族|祖母|祖父|姉|妹|兄|弟|友人)[^。]{0,14}(?:車で|徒歩|分|時間|同市内|近く|近所|遠方|県外|残業|仕事|帰宅|不在|手伝(?:える|って))|(?:支援|協力)(?:者|体制)[^。]{0,10}(?:あり|なし|得られ|難し|限られ)|頼れる(?:人|家族)/, label: '支援の可用性（横断）', to: '支援の得られやすさ（距離・時間・仕事・同居）として保持し、ジェノグラム・関連図・退院後の支援計画に使う' },
  { key: 'family', re: /夫|妻|両親|実家|同居|付き添|面会|賃貸|住居|復職|産休|会社員|沐浴は自分/, label: '家族・社会背景', to: 'ジェノグラム・関連図・支援体制の情報として保持。家族の意向は産婦本人の所見と区別する' }
];
function proposeCardDestination(text) {
  const t = String(text || '').normalize('NFKC').trim();
  if (typeof isStructuralHeadingLine === 'function' && isStructuralHeadingLine(t)) return { key: 'structure', label: '見出し・表の参照（構造情報）', to: '見出しとして保持し、続く行の文脈にする（患者の所見にしない）' };
  const d = CARD_DESTINATIONS.find(x => x.re.test(t));
  return d ? { key: d.key, label: d.label, to: d.to } : null;
}
// Tag audit: compares every card's current Henderson tags with a fresh rule-based proposal. Read-only; it never edits a card or a user's tags.
function buildTagAuditRows(cp) {
  const rows = [];
  (cp.items || []).filter(i => !i.deleted && i.type !== 'unnecessary').forEach(i => {
    const cur = Array.from(new Set(i.hendersonIds || [])).sort((a, b) => a - b);
    const text = String(i.text || '');
    const structural = typeof isStructuralHeadingLine === 'function' && isStructuralHeadingLine(text);
    const prop = structural ? [] : Array.from(new Set(detectMultipleHendersonTags(text))).sort((a, b) => a - b);
    const missing = prop.filter(x => !cur.includes(x)), extra = cur.filter(x => !prop.includes(x));
    const noType = i.type === 'unclassified';
    const dest = (!prop.length || !cur.length) ? proposeCardDestination(text) : null;
    if (!missing.length && !extra.length && !noType && !(dest && !cur.length)) return;
    const reasons = [];
    if (structural) reasons.push('見出し・表の参照で、所見ではない');
    if (missing.length) reasons.push('文の意味から付くはずのタグが現在ない');
    if (extra.length && !structural) reasons.push('現在のタグが文の意味から支持されない');
    if (noType) reasons.push('S/Oが未決定');
    rows.push({
      id: i.id, text, destination: dest, currentTags: cur, proposedTags: prop, missingTags: missing, removeTags: extra, reason: reasons.join('／'),
      context: [i.timestamp, i.fieldLabel].filter(Boolean).join(' '), confidence: structural ? '高' : (missing.length && !extra.length ? '中' : '低'),
      // Only a pure addition to an untagged card is eligible; any removal or change may be a user edit, so it needs a person.
      autoFix: !cur.length && missing.length > 0 && !structural,
      manual: extra.length || noType ? '現在のタグ・S/Oは利用者の編集の可能性があるため、自動では変更しない' : '追加のみ（承認後に反映）'
    });
  });
  return rows;
}
function buildTagAuditText(cp) {
  const rows = buildTagAuditRows(cp);
  if (!rows.length) return '【タグ監査】修正候補はありません（未分類0件を、分類が正しい根拠にはしていません）';
  const nm = ids => ids.length ? ids.join('・') : 'なし';
  return '【タグ監査（候補。自動では変更しません）】\n' + rows.map(r => `・${r.id}｜${r.text}\n　現在=${nm(r.currentTags)}／提案=${nm(r.proposedTags)}／不足=${nm(r.missingTags)}／外す候補=${nm(r.removeTags)}／確度=${r.confidence}／自動反映=${r.autoFix ? '可（追加のみ）' : '不可'}${r.destination ? `\n　分類先の提案：${r.destination.label}（${r.destination.to}）` : ''}\n　理由：${r.reason}${r.context ? `／文脈：${r.context}` : ''}／確認：${r.manual}`).join('\n');
}

if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, {
    buildTagAuditRows, buildTagAuditText, proposeCardDestination, CHECKPOINT_MAX, createCheckpoint, deleteCheckpoint, checkpointList, diffCards, inlineTextDiffHtml, maybeCheckpointOnOpen,
    restoreCardFromCheckpoint, splitCardIntoParts, undoLast, pushUndo, workflowStatus, REPORT_FORMATS, defaultReportLayout, buildReport, reportToText, reportToHtml, reportDayOptions,

    calculateAndAddDerivedMetricCards, parseAiJsonArray, safeDomId, buildPrintAiSectionsHtml, formatEditLogEntry, storedAiHtml, isAiStepRunning
  });
}
