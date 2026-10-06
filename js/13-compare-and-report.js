    // 看護アセスメント支援システム：13-compare-and-report.js（全13ファイルのうち 13 番目）
    // ④変更点の比較：記録した時点（手で記録した時点・分類し直す前・画面を開いたとき）のカードと今のカードを比べ、
    //   追加・変更・削除したカードを並べる。消したカードは元に戻せる。
    // ⑤提出・報告用の書き出し：SOAP形式・実習記録の様式で、載せる項目とその順番を選んで書き出す
    //   （コピー・テキストファイル・印刷／PDF）。
    // （js/10 の起動の処理より後に読み込む。最後に総合アセスメント表などを描き直す）

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['13'] = '2026-10-06.3'; // 版（scripts/stamp-version.js が書き込む）

    // ==========================================================================
    // ④ 記録した時点（cp.checkpoints[ID] = { id, label, kind, at, updatedAt, items:[カードの写し] }。
    //    消したものは { id, deleted:true, updatedAt }。1人の患者につき新しい方から CHECKPOINT_MAX 件まで）
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
      // 古いものから消す（手で記録したものは、自動の記録より後まで残す）
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

    // カードの比べ方：同じIDどうし → 残りは本文が同じものどうし（分類し直すとIDが変わるため）
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
    // 本文の変わった所だけを印にする（前後の同じ部分は印を付けない）
    function inlineTextDiffHtml(a, b) {
      a = String(a || ''); b = String(b || '');
      let p = 0;
      while (p < a.length && p < b.length && a[p] === b[p]) p++;
      let s = 0;
      while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
      const mid = (t) => t.slice(p, t.length - s);
      return `${escapeHtml(a.slice(0, p))}${mid(a) ? `<del>${escapeHtml(mid(a))}</del>` : ''}${mid(b) ? `<ins>${escapeHtml(mid(b))}</ins>` : ''}${escapeHtml(a.slice(a.length - s))}`;
    }

    // 画面を開いたときの自動の記録（その患者を開くのがこの画面で初めてで、前の記録から変わっていて、前の記録から30分以上たっているとき）
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
    // 分類し直す前の自動の記録（js/07 の「分類開始」から呼ぶ）
    function checkpointBeforeClassify(cp) {
      if (!cp || !(cp.items || []).length) return null;
      // 同じ内容のまま続けて分類し直したときは、同じ記録を増やさない（繰り返し入力の確認で発覚）
      const latest = checkpointList(cp)[0];
      if (latest && JSON.stringify(latest.items) === JSON.stringify((cp.items || []).map(checkpointItemCopy))) return latest;
      return createCheckpoint(cp, { kind: 'classify' });
    }

    // ---- 変更点の比較の画面 ----
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
      // 【レビューで発見】カードのIDを onclick="…('…')" に入れるので、アプリが作る形のIDだけを使う（safeDomId、js/08）
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
    // 消したカードを、記録した時点の内容で元に戻す
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
    // ⑤ 提出・報告用の書き出し
    // ==========================================================================
    // 書き出しの形式と、載せられる項目（既定で載せるか）
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
          { key: 'records', label: '実施・評価', on: true },
          { key: 'ai', label: 'AIの結果（参考）', on: false }
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
      try { localStorage.setItem(REPORT_LAYOUT_KEY, JSON.stringify({ format: st.format, layouts: st.layouts })); } catch (e) { /* 覚えられなくても書き出しはできる */ }
    }
    // 選べる「日」（カードの日時の日の部分。日の順番）
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
    // 実施・評価の記録を「日」で絞る（日が「9月29日」のような日付のときだけ。「術後3日目」などでは絞らない）
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

    // 書き出しの中身を組み立てる：[{ title, lines:[…], groups:[{ title, lines }] }]
    function buildReport(cp, { format = 'soap', layout = null, day = '' } = {}) {
      const sections = (layout || defaultReportLayout(format)).filter(s => s.on).map(s => s.key);
      const active = (cp.items || []).filter(i => i.type !== 'unnecessary');
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
      // 実習記録の様式
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
          // 【レビューで発見】computeClinicalIndices は { basics, indices, missing } を返す（.items は無い）ため、
          // 以前はこの節が常に空だった。画面の「計算した指標」と同じく、カルテ本文が空ならカードの文章から計算する。
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
        } else if (key === 'ai') {
          const lines = [];
          const add = (label, html) => { if (html) lines.push(`【${label}】`, ...htmlToPlainText(html).split('\n')); };
          add('看護診断候補', cp.diagnosisResult); add('看護計画（AIの叩き台）', cp.carePlanResult); add('経時変化サマリー', cp.timelineResult);
          blocks.push({ title: 'AIの結果（参考）', lines });
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

    // ---- 書き出しの画面 ----
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
    window.downloadReport = function() {
      const cp = getCurrentPatient();
      const blob = new Blob([currentReportText()], { type: 'text/plain;charset=utf-8' });
      // 【レビューで発見】ページに追加しないまま押していた（ファイル名が反映されない環境がある）。js/06 の downloadTextBlob を使う
      downloadTextBlob(blob, `${(cp.title || 'カルテ').replace(/[\\/:*?"<>|]/g, '_')}_${REPORT_FORMATS[reportState.format].label}.txt`);
      showToast('テキストファイル（.txt）を保存しました', 'success');
    };
    window.printReport = function() {
      printHtmlDocument(reportToHtml(getCurrentPatient(), currentReport()));
      showToast(isMobilePrintTarget() ? '印刷用の見本を開きました。上の「印刷・PDFに保存」を押してください' : '印刷画面を開きます。「送信先」で「PDFに保存」を選ぶとPDFになります', 'info');
    };

    // ==========================================================================
    // 手直しを楽にする：①元に戻す（S/O・タグ・欄・本文・統合・分割を、1つずつ戻す。Ctrl+Z でも）
    //                   ②カードを分ける（1枚のカードを改行の所で複数のカードに分ける）
    // ==========================================================================
    const UNDO_MAX = 30;
    const undoStacks = {}; // 患者ID → [{ label, items(JSON), at }]
    function itemsSnapshot(cp) { return JSON.stringify(cp.items || []); }
    function pushUndo(patientId, before, label) {
      const st = undoStacks[patientId] || (undoStacks[patientId] = []);
      st.push({ label, items: before, at: Date.now() });
      if (st.length > UNDO_MAX) st.shift();
      renderUndoButton();
    }
    function undoLabel(patientId) {
      const st = undoStacks[patientId] || [];
      return st.length ? st[st.length - 1].label : '';
    }
    function undoLast(cp) {
      const st = undoStacks[cp.id] || [];
      const last = st.pop();
      if (!last) return null;
      const restored = JSON.parse(last.items);
      const keep = new Set(restored.map(i => i.id));
      (cp.items || []).forEach(i => { if (!keep.has(i.id)) markItemDeleted(cp, i.id); });
      restored.forEach(i => { touchItem(i); if (typeof unmarkItemDeleted === 'function') unmarkItemDeleted(cp, i.id); });
      cp.items = restored;
      return last;
    }
    function renderUndoButton() {
      const btn = document.getElementById('btn-undo');
      if (!btn) return;
      const label = undoLabel(getCurrentPatient().id);
      btn.disabled = !label;
      btn.title = label ? `「${label}」を元に戻す（Ctrl+Z）` : '元に戻せる操作はありません';
    }
    window.undoLastEdit = function() {
      const cp = getCurrentPatient();
      const last = undoLast(cp);
      if (!last) return showToast('元に戻せる操作はありません', 'info');
      if (typeof selectedCardIds !== 'undefined') selectedCardIds.clear();
      saveDataAndSync();
      renderUndoButton();
      showToast(`「${last.label}」を元に戻しました`, 'success');
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
        if (res && typeof res.then === 'function') res.then(finish, finish); else finish();
        return res;
      };
      wrapped.__undoable = true;
      window[name] = wrapped;
    }
    const TYPE_LABEL_JA = { s: 'Sに移す', o: 'Oに移す', unclassified: '未分類に戻す', unnecessary: '不要にする' };
    wrapUndoable('setItemType', (id, type) => TYPE_LABEL_JA[type] || '分類の変更');
    wrapUndoable('bulkSetType', type => `まとめて${TYPE_LABEL_JA[type] || '分類の変更'}`);
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
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || String(e.key).toLowerCase() !== 'z') return;
      const t = document.activeElement;
      if (t && (/^(?:INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return; // 文字を打っている所では、ブラウザの「元に戻す」に任せる
      if (document.querySelector('.fixed.inset-0:not(.hidden)')) return;
      if (!undoLabel(getCurrentPatient().id)) return;
      e.preventDefault();
      window.undoLastEdit();
    });

    // カードを分ける：改行の所で分け、1行目は元のカード（ID・学習の記録を引き継ぐ）、2行目からは新しいカード。
    // 日時・タグ・欄・S/O は元のカードと同じにする（分けた後に、それぞれ直せる）
    function splitCardIntoParts(cp, id, parts) {
      const idx = cp.items.findIndex(i => i.id === id);
      if (idx === -1) return null;
      const texts = parts.map(t => cleanExtractedPhrase(t)).filter(Boolean);
      if (texts.length < 2) return null;
      const src = cp.items[idx];
      const before = src.text;
      src.text = texts[0];
      logItemEdit(src, { kind: 'text', from: before, to: src.text });
      touchItem(src);
      const added = texts.slice(1).map(text => {
        const c = { ...JSON.parse(JSON.stringify(src)), id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, text, editLog: [{ at: new Date().toISOString(), kind: 'text', from: before, to: text }] };
        delete c.sceneId;
        touchItem(c);
        return c;
      });
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
      updateSplitPreview();
      document.getElementById('modal-split').classList.remove('hidden');
      setTimeout(() => { ta.focus(); }, 30);
    };
    window.closeSplitCard = function() { splitEditingId = null; document.getElementById('modal-split').classList.add('hidden'); };
    window.splitAtSentences = function() {
      const ta = document.getElementById('split-text');
      ta.value = ta.value.replace(/\n+/g, '').replace(/(。|、(?=「)|」(?=[^。、」]))/g, '$1\n').replace(/\n+$/, '');
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
      const res = splitCardIntoParts(cp, splitEditingId, parts);
      if (!res) return showToast('分けたい所で改行してください（2行以上）', 'warn');
      pushUndo(cp.id, before, 'カードを分ける');
      closeSplitCard();
      saveDataAndSync();
      showToast(`${res.length}枚のカードに分けました`, 'success');
    };

    // ==========================================================================
    // 作業の流れ（利用者の確認項目：「記録を貼り付ける→分類→手直し→アセスメント→書き出し」で次に押すボタンが分かるか）
    // ==========================================================================
    function workflowStatus(cp) {
      const items = cp.items || [];
      const active = items.filter(i => i.type !== 'unnecessary');
      const unclassified = items.filter(i => i.type === 'unclassified').length;
      const untagged = active.filter(i => typeof isUntaggedItem === 'function' && isUntaggedItem(i)).length;
      const asm = cp.myAssessments && typeof cp.myAssessments === 'object' ? Object.values(cp.myAssessments).filter(Boolean) : [];
      const written = asm.filter(e => MY_ASSESSMENT_FIELDS.some(f => String(e[f.key] || '').trim())).length;
      const confirmed = asm.filter(e => (e.history || []).length).length;
      const plans = carePlanList(cp);
      const steps = [
        { key: 'paste', label: '記録を貼る', done: !!String(cp.sourceText || '').trim() || items.length > 0, note: '' },
        { key: 'classify', label: '分類', done: items.length > 0, note: items.length ? `${items.length}枚` : '' },
        { key: 'fix', label: '手直し', done: items.length > 0 && !unclassified && !untagged, note: unclassified || untagged ? [unclassified ? `未分類${unclassified}` : '', untagged ? `タグなし${untagged}` : ''].filter(Boolean).join('・') : '' },
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
      if (nav.setAttribute) nav.setAttribute('data-progress', `（6段階のうち${doneN}つ済み）`);
      nav.innerHTML = `<span class="wf-patient" title="今表示しているカルテ"><i class="fa-solid fa-hospital-user"></i> ${escapeHtml(cp.title || '')}</span>` + steps.map((s, k) => `<button type="button" class="wf-step${s.done ? ' done' : ''}${s.current ? ' current' : ''}" onclick="goWorkflowStep('${s.key}')" ${s.current ? 'aria-current="step"' : ''}>
        <span class="wf-no">${s.done ? '<i class="fa-solid fa-check"></i>' : k + 1}</span><span class="wf-label">${s.label}</span>${s.note ? `<span class="wf-note">${escapeHtml(s.note)}</span>` : ''}${s.current ? '<span class="wf-next">次はここ</span>' : ''}</button>`).join('<i class="fa-solid fa-chevron-right wf-sep" aria-hidden="true"></i>');
    }
    window.goWorkflowStep = function(key) {
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

    // 患者を切り替えた・読み込んだとき（js/05 の loadLocalState から呼ぶ）
    function onPatientViewReloaded(cp) {
      renderCarePlans();
      renderUndoButton();
      renderWorkflowSteps();
      maybeCheckpointOnOpen(cp);
    }
    // 起動時：js/10 の起動の処理で一度描いた画面を、js/11〜13 の分も入れて描き直す
    try { renderAssessmentTable(); renderCarePlans(); renderWorkflowSteps(); } catch (err) { console.warn('画面を描き直せませんでした:', err); }

    // ==========================================================================
    // 【ボタン1つで看護計画まで】利用者からの要望：「ボタン一つで順番に処理して看護計画立案」。
    // ①不足情報の推定 → ②看護診断候補 → 優先度の高い候補（AIが優先順に挙げた上から2件）を選ぶ → ③看護計画の叩き台
    // → 「看護計画」タブへ取り込み、までを順番に行う。途中で患者を切り替えたり、どこかで失敗したりしたら、そこで止める。
    // 選んだ診断・計画は、あとから自由に選び直し・書き直しできる（AIの参考案であることは各結果の欄に表示）。
    // ==========================================================================
    window.aiPipelineStatus = { running: false, label: '' };
    const AI_PIPELINE_SELECT_COUNT = 2;
    function setAiPipelineStatus(running, label = '') {
      window.aiPipelineStatus = { running, label };
      if (typeof renderAiSteps === 'function') renderAiSteps(getCurrentPatient());
    }
    window.runAiPipelineToCarePlan = async function() {
      if (window.aiPipelineStatus.running) return;
      if (!(await requireApiKey('看護計画までまとめて実行'))) return;
      const cp = getCurrentPatient();
      if (!(cp.items || []).some(i => i.type !== 'unnecessary')) return showToast('カードがありません。先に分類ボードで「分類開始」を押してください', 'warn');
      const same = () => getCurrentPatient().id === cp.id;
      const stop = msg => { setAiPipelineStatus(false); if (msg) showToast(msg, 'warn', 6000); };
      try {
        setAiPipelineStatus(true, '① 不足情報を推定しています…（1/3）');
        const before1 = (cp.aiRunAt || {}).missing;
        await window.evaluateMissingInfoAI();
        if (!same()) return stop('患者を切り替えたため、まとめて実行を止めました');
        if ((cp.aiRunAt || {}).missing === before1) return stop('不足情報の推定ができなかったため、ここで止めました（理由は通知・結果の欄をご覧ください）');
        setAiPipelineStatus(true, '② 看護診断候補を考えています…（2/3）');
        const before2 = (cp.aiRunAt || {}).diagnosis;
        await window.suggestNursingDiagnosesAI();
        if (!same()) return stop('患者を切り替えたため、まとめて実行を止めました');
        const cands = cp.diagnosisCandidates || [];
        if ((cp.aiRunAt || {}).diagnosis === before2 || !cands.length) return stop('看護診断候補を作れなかったため、ここで止めました');
        cp.selectedDiagnosisIds = cands.slice(0, AI_PIPELINE_SELECT_COUNT).map(c => c.id);
        persistData();
        if (typeof renderDiagnosisPanel === 'function') renderDiagnosisPanel(cp);
        setAiPipelineStatus(true, '③ 看護計画を作っています…（3/3）');
        const before3 = (cp.aiRunAt || {}).careplan;
        await window.generateCarePlanAI();
        if (!same()) return stop('患者を切り替えたため、まとめて実行を止めました');
        if ((cp.aiRunAt || {}).careplan === before3 || !cp.carePlanResult) return stop('看護計画を作れなかったため、ここで止めました');
        const fresh = typeof importCarePlans === 'function' ? importCarePlans(cp, 'ai') : [];
        if (fresh.length && typeof commitCarePlanChange === 'function') commitCarePlanChange(cp);
        setAiPipelineStatus(false);
        // 【レビューで発見】AIの看護計画の形を読み取れず1件も取り込めなかったときも「できました」と出ていた。
        // 読み取れなかったときは、そのことを伝える（同じ看護問題が既にあって取り込まなかったときは従来どおり）。
        const readable = parseCarePlanText(htmlToPlainText(cp.carePlanResult)).length;
        if (!fresh.length && !readable) {
          if (typeof showAiResult === 'function') { window.showAiResult(null); window.showAiResult('careplan-panel'); }
          return showToast(['看護計画の叩き台はできましたが、「看護計画」タブに取り込める形で読み取れませんでした', { text: '「AIの結果」の看護計画を見て、「看護計画」タブで書き写すか、もう一度「③ 看護計画」を押してください。', detail: true }], 'warn', 8000);
        }
        if (typeof showAiResult === 'function') { window.showAiResult(null); window.showAiResult('careplan-panel'); }
        showToast([`看護計画までできました（看護診断 ${cp.selectedDiagnosisIds.length}件・看護計画 ${fresh.length}件を「看護計画」タブに取り込み）`, { text: '優先度の高い順に上から2件の看護診断を選んでいます。選び直すときは「看護診断候補」のチェックを変えて「③ 看護計画」を押してください。取り込んだ計画は自分の言葉で書き直しましょう。', detail: true }], 'success', 8000);
      } catch (err) {
        console.warn('AI pipeline error:', err);
        stop(`まとめて実行の途中で止まりました（${err && err.message ? err.message : 'エラー'}）`);
      }
    };

if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, {
    CHECKPOINT_MAX, createCheckpoint, deleteCheckpoint, checkpointList, diffCards, inlineTextDiffHtml, maybeCheckpointOnOpen,
    restoreCardFromCheckpoint, splitCardIntoParts, undoLast, pushUndo, workflowStatus, REPORT_FORMATS, defaultReportLayout, buildReport, reportToText, reportToHtml, reportDayOptions,
    // レビューで見つけた不具合の確認用（tests/review-fixes-ai-export.test.js）
    calculateAndAddDerivedMetricCards, parseAiJsonArray, safeDomId, buildPrintAiSectionsHtml, formatEditLogEntry, storedAiHtml, isAiStepRunning
  });
}
