    // 看護アセスメント支援システム：12-missing-checks-and-care-plan.js（全13ファイルのうち 12 番目）
    // ②不足情報の確認状況：総合アセスメント表の「不足情報」の欄のカードごとに「未確認・確認済み・該当なし」、
    //   確かめた方法・日時・結果を残し、結果を情報カード（S/O）として足せるようにする。
    // ③看護計画の編集・実施・評価：看護問題ごとに目標・OP/TP/EPを書き、日々の実施内容・患者の反応・目標の達成状況・
    //   評価・計画の修正を記録する（「看護計画」のページ）。

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['12'] = '2026-10-07.9'; // 版（scripts/stamp-version.js が書き込む）

    // 日時を、カードの日時欄と同じ書き方（「9月29日 14:05」）にする
    function formatCardTimestamp(value) {
      const d = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(d.getTime())) return '日時不明';
      const pad = n => String(n).padStart(2, '0');
      return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${pad(d.getMinutes())}`;
    }
    // <input type="datetime-local"> の値（その端末の時刻）⇔ ISO
    function toLocalInputValue(iso) {
      const d = iso ? new Date(iso) : new Date();
      if (Number.isNaN(d.getTime())) return '';
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    function fromLocalInputValue(v) {
      const d = v ? new Date(v) : null;
      return d && !Number.isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString();
    }
    function newRecordId(prefix) {
      return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    // 自分で書いた記録から情報カードを作る（不足情報の確認結果・看護計画の実施のときの患者の反応）
    function createOwnInfoCard(cp, { text, type, needs, col, at, fieldLabel }) {
      const ids = (needs || []).filter(n => n >= 1 && n <= 14);
      const item = {
        id: newRecordId('item'), text: cleanExtractedPhrase(text), timestamp: formatCardTimestamp(at || new Date()),
        type: type === 's' ? 's' : 'o', hendersonIds: ids,
        assessmentCols: Object.fromEntries(ids.map(h => [h, col === 'preadmission' ? 'preadmission' : 'postadmission'])),
        fieldLabel: fieldLabel || undefined, predictionSource: 'confirmed', _touchedAt: new Date().toISOString()
      };
      if (!item.fieldLabel) delete item.fieldLabel;
      cp.items.push(item);
      return item;
    }

    // ==========================================================================
    // ② 不足情報の確認状況（cp.missingChecks[カードのID] = { status, method, result, checkedAt, resultItemId, updatedAt }）
    // ==========================================================================
    const MISSING_CHECK_STATUSES = [
      { key: 'unchecked', label: '未確認', icon: 'fa-circle-question' },
      { key: 'checked', label: '確認済み', icon: 'fa-circle-check' },
      { key: 'na', label: '該当なし', icon: 'fa-circle-minus' }
    ];
    function isMissingInfoCard(i) {
      return i && i.type !== 'unnecessary' && (i.hendersonIds || []).some(h => (i.assessmentCols?.[h] || 'unclassified') === 'missing');
    }
    function missingInfoItems(cp) {
      return (cp.items || []).filter(isMissingInfoCard);
    }
    function getMissingCheck(cp, itemId) {
      const c = cp && cp.missingChecks && cp.missingChecks[itemId];
      return c && typeof c === 'object' && !c.deleted ? c : null;
    }
    function missingCheckStatus(cp, itemId) {
      const c = getMissingCheck(cp, itemId);
      return c && MISSING_CHECK_STATUSES.some(s => s.key === c.status) ? c.status : 'unchecked';
    }
    function missingCheckCounts(cp) {
      const counts = { unchecked: 0, checked: 0, na: 0, total: 0 };
      missingInfoItems(cp).forEach(i => { counts[missingCheckStatus(cp, i.id)]++; counts.total++; });
      return counts;
    }
    // 確認状況を書き込む。addCard=true で確認結果を情報カードとして足す（足したカードがあれば書き換える）
    function setMissingCheck(cp, itemId, { status, method = '', result = '', checkedAt = null, addCard = false, cardType = 'o', cardCol = 'postadmission' } = {}, now = new Date().toISOString()) {
      const item = (cp.items || []).find(i => i.id === itemId);
      if (!item) return null;
      if (!MISSING_CHECK_STATUSES.some(s => s.key === status)) status = 'unchecked';
      if (!cp.missingChecks || typeof cp.missingChecks !== 'object' || Array.isArray(cp.missingChecks)) cp.missingChecks = {};
      const prev = getMissingCheck(cp, itemId) || {};
      const check = {
        status, method: String(method || '').trim(), result: String(result || '').trim(),
        checkedAt: status === 'unchecked' ? null : (checkedAt || prev.checkedAt || now),
        resultItemId: prev.resultItemId || null, updatedAt: now
      };
      let card = null;
      if (addCard && status === 'checked' && check.result) {
        const needs = (item.hendersonIds || []).filter(h => (item.assessmentCols?.[h] || 'unclassified') === 'missing');
        const existing = check.resultItemId && cp.items.find(i => i.id === check.resultItemId && i.type !== 'unnecessary');
        const text = check.method ? `${check.result}（${check.method}）` : check.result;
        if (existing) {
          if (existing.text !== text) { logItemEdit(existing, { kind: 'text', from: existing.text, to: text }); existing.text = text; }
          existing.type = cardType === 's' ? 's' : 'o';
          existing.timestamp = formatCardTimestamp(check.checkedAt);
          touchItem(existing);
          card = existing;
        } else {
          card = createOwnInfoCard(cp, { text, type: cardType, needs: needs.length ? needs : item.hendersonIds, col: cardCol, at: check.checkedAt, fieldLabel: '確認結果' });
          check.resultItemId = card.id;
        }
      }
      cp.missingChecks[itemId] = check;
      return { check, card };
    }

    // 総合アセスメント表の「不足情報」の欄のカードに付ける、確認状況の印と結果（js/09 の renderAssessmentCellCard から呼ぶ）
    function missingCheckCardHtml(cp, item) {
      const st = missingCheckStatus(cp, item.id);
      const c = getMissingCheck(cp, item.id);
      const def = MISSING_CHECK_STATUSES.find(s => s.key === st);
      const detail = c && st !== 'unchecked'
        ? `<div class="mc-result">${c.result ? `<i class="fa-solid fa-arrow-turn-down fa-rotate-270"></i> ${escapeHtml(c.result)}` : ''}${c.method ? `<span class="mc-method">（${escapeHtml(c.method)}）</span>` : ''}${c.checkedAt ? `<span class="mc-when">${escapeHtml(formatMyDateTime(c.checkedAt))}</span>` : ''}${c.resultItemId && cp.items.some(i => i.id === c.resultItemId && i.type !== 'unnecessary') ? '<span class="mc-card-added" title="確認結果を情報カードとして追加しました"><i class="fa-solid fa-id-card"></i>カード追加済み</span>' : ''}</div>`
        : '';
      return `<button type="button" class="mc-badge mc-${st}" onclick="openMissingCheck('${safeDomId(item.id)}')" title="確認状況を記録する（未確認・確認済み・該当なし）"><i class="fa-solid ${def.icon}"></i>${def.label}</button>${detail}`;
    }

    // 表の上の「不足情報の確認」の集計と一覧
    let missingSummaryOpen = false;
    let missingSummaryFilter = 'unchecked';
    function renderMissingCheckSummary(cp) {
      const el = document.getElementById('missing-check-summary');
      if (!el) return;
      const counts = missingCheckCounts(cp);
      if (!counts.total) { el.classList.add('hidden'); el.innerHTML = ''; return; }
      el.classList.remove('hidden');
      const chip = s => `<button type="button" class="mc-filter mc-${s.key}${missingSummaryOpen && missingSummaryFilter === s.key ? ' active' : ''}" onclick="showMissingCheckList('${s.key}')"><i class="fa-solid ${s.icon}"></i>${s.label} <b>${counts[s.key]}</b></button>`;
      let list = '';
      if (missingSummaryOpen) {
        const items = missingInfoItems(cp).filter(i => missingSummaryFilter === 'all' || missingCheckStatus(cp, i.id) === missingSummaryFilter);
        list = `<ul class="mc-list">${items.map(i => {
          const needs = (i.hendersonIds || []).filter(h => (i.assessmentCols?.[h] || 'unclassified') === 'missing');
          return `<li><span class="mc-need">${escapeHtml(needs.map(h => `${h}.${hendersonNameOf(h).replace(/^\d+\.\s*/, '')}`).join('・'))}</span><span class="mc-text">${escapeHtml(i.text.replace(/^原因:\s*/, ''))}</span>${missingCheckCardHtml(cp, i)}</li>`;
        }).join('') || '<li class="my-asm-muted">当てはまる不足情報はありません。</li>'}</ul>`;
      }
      el.innerHTML = `<div class="mc-summary-head"><span class="mc-summary-title"><i class="fa-solid fa-clipboard-question"></i> 不足情報の確認</span>
        ${MISSING_CHECK_STATUSES.map(chip).join('')}
        <button type="button" class="mc-filter${missingSummaryOpen && missingSummaryFilter === 'all' ? ' active' : ''}" onclick="showMissingCheckList('all')">すべて <b>${counts.total}</b></button>
        ${missingSummaryOpen ? '<button type="button" class="my-asm-link" onclick="showMissingCheckList(null)">一覧を閉じる</button>' : ''}</div>${list}`;
    }
    window.showMissingCheckList = function(filter) {
      if (!filter || (missingSummaryOpen && missingSummaryFilter === filter)) missingSummaryOpen = false;
      else { missingSummaryOpen = true; missingSummaryFilter = filter; }
      renderMissingCheckSummary(getCurrentPatient());
    };

    // 確認状況を記録する画面
    let missingCheckEditing = null;
    window.openMissingCheck = function(itemId) {
      const cp = getCurrentPatient();
      const item = cp.items.find(i => i.id === itemId);
      if (!item) return;
      missingCheckEditing = itemId;
      const c = getMissingCheck(cp, itemId) || {};
      document.getElementById('missing-check-target').textContent = item.text.replace(/^原因:\s*/, '');
      setMissingCheckStatusUI(missingCheckStatus(cp, itemId) === 'unchecked' ? 'checked' : missingCheckStatus(cp, itemId));
      document.getElementById('missing-check-at').value = toLocalInputValue(c.checkedAt);
      document.getElementById('missing-check-method').value = c.method || '';
      document.getElementById('missing-check-result').value = c.result || '';
      const hasCard = c.resultItemId && cp.items.some(i => i.id === c.resultItemId && i.type !== 'unnecessary');
      document.getElementById('missing-check-add-card').checked = hasCard || !c.status;
      document.getElementById('missing-check-add-card-label').textContent = hasCard ? '追加した情報カードも書き換える' : '確認結果を情報カードとして追加する';
      const resultCard = hasCard ? cp.items.find(i => i.id === c.resultItemId) : null;
      document.getElementById('missing-check-card-type').value = resultCard ? resultCard.type : 'o';
      document.getElementById('modal-missing-check').classList.remove('hidden');
      setTimeout(() => document.getElementById('missing-check-result').focus(), 30);
    };
    function setMissingCheckStatusUI(status) {
      document.querySelectorAll('#missing-check-status [data-status]').forEach(b => b.classList.toggle('active', b.dataset.status === status));
      document.getElementById('missing-check-status').dataset.value = status;
      document.getElementById('missing-check-fields').classList.toggle('hidden', status === 'unchecked');
      document.getElementById('missing-check-card-row').classList.toggle('hidden', status !== 'checked');
    }
    window.setMissingCheckStatusUI = setMissingCheckStatusUI;
    window.closeMissingCheck = function() {
      missingCheckEditing = null;
      document.getElementById('modal-missing-check').classList.add('hidden');
    };
    window.saveMissingCheckUI = function() {
      if (!missingCheckEditing) return;
      const cp = getCurrentPatient();
      const status = document.getElementById('missing-check-status').dataset.value || 'unchecked';
      const result = document.getElementById('missing-check-result').value;
      if (status === 'checked' && !result.trim()) return showToast('「確認結果」を書いてください', 'warn');
      const r = setMissingCheck(cp, missingCheckEditing, {
        status, result,
        method: document.getElementById('missing-check-method').value,
        checkedAt: fromLocalInputValue(document.getElementById('missing-check-at').value),
        addCard: document.getElementById('missing-check-add-card').checked,
        cardType: document.getElementById('missing-check-card-type').value,
        cardCol: 'postadmission'
      });
      closeMissingCheck();
      saveDataAndSync();
      if (r && r.card) showToast('確認結果を記録し、情報カードとして追加しました（入院後の欄）', 'success');
      else showToast(`「${MISSING_CHECK_STATUSES.find(s => s.key === status).label}」にしました`, 'success');
    };

    // ==========================================================================
    // ③ 看護計画（cp.carePlans[計画のID] = { id, problem, relatedNeeds, goalLong, goalShort, op, tp, ep, status,
    //    order, createdAt, updatedAt, records:[{ id, at, doneItems, doneText, response, responseCardId,
    //    achievement, evaluation, revision }] }。消した計画は { id, deleted:true, updatedAt } を残す）
    // ==========================================================================
    const CARE_PLAN_SECTIONS = [
      { key: 'op', label: 'OP（観察計画）', short: 'OP', placeholder: '1行に1つずつ書きます\n例：疼痛の部位・程度（NRS）・出現する場面' },
      { key: 'tp', label: 'TP（援助計画）', short: 'TP', placeholder: '1行に1つずつ書きます\n例：リハビリの30分前に鎮痛薬を使えるよう調整する' },
      { key: 'ep', label: 'EP（教育計画）', short: 'EP', placeholder: '1行に1つずつ書きます\n例：痛みを我慢せずに伝えるよう説明する' }
    ];
    const CARE_PLAN_STATUSES = [
      { key: 'active', label: '実施中' }, { key: 'resolved', label: '解決' }, { key: 'paused', label: '中止・保留' }
    ];
    const CARE_ACHIEVEMENTS = [
      { key: 'achieved', label: '達成' }, { key: 'partial', label: '一部達成' }, { key: 'not', label: '未達成' }, { key: '', label: '評価しない' }
    ];
    function carePlanList(cp) {
      const all = cp && cp.carePlans && typeof cp.carePlans === 'object' ? Object.values(cp.carePlans) : [];
      return all.filter(p => p && p.id && !p.deleted)
        .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    }
    function normalizeCarePlan(p) {
      ['problem', 'goalLong', 'goalShort'].forEach(k => { if (typeof p[k] !== 'string') p[k] = ''; });
      CARE_PLAN_SECTIONS.forEach(s => { if (!Array.isArray(p[s.key])) p[s.key] = []; });
      if (!Array.isArray(p.relatedNeeds)) p.relatedNeeds = [];
      if (!Array.isArray(p.records)) p.records = [];
      // 関連図から引き継いだ根拠データ・「この患者に必要な理由」（2026-10-07.5）
      if (!Array.isArray(p.evidence)) p.evidence = [];
      if (!Array.isArray(p.reasons)) p.reasons = [];
      if (!CARE_PLAN_STATUSES.some(s => s.key === p.status)) p.status = 'active';
      return p;
    }
    function createCarePlan(cp, fields = {}, now = new Date().toISOString()) {
      if (!cp.carePlans || typeof cp.carePlans !== 'object' || Array.isArray(cp.carePlans)) cp.carePlans = {};
      const order = carePlanList(cp).reduce((m, p) => Math.max(m, Number(p.order) || 0), 0) + 1;
      const plan = normalizeCarePlan({ ...fields, id: newRecordId('plan'), order, createdAt: now, updatedAt: now });
      cp.carePlans[plan.id] = plan;
      return plan;
    }
    function getCarePlan(cp, id) {
      const p = cp && cp.carePlans && cp.carePlans[id];
      return p && !p.deleted ? normalizeCarePlan(p) : null;
    }
    function updateCarePlan(cp, id, patch, now = new Date().toISOString()) {
      const p = getCarePlan(cp, id);
      if (!p) return null;
      Object.assign(p, patch, { updatedAt: now });
      return p;
    }
    function deleteCarePlan(cp, id, now = new Date().toISOString()) {
      if (!getCarePlan(cp, id)) return false;
      cp.carePlans[id] = { id, deleted: true, updatedAt: now };
      return true;
    }
    function moveCarePlan(cp, id, dir, now = new Date().toISOString()) {
      const list = carePlanList(cp);
      const k = list.findIndex(p => p.id === id);
      const j = k + (dir === 'up' ? -1 : 1);
      if (k < 0 || j < 0 || j >= list.length) return false;
      list.forEach((p, n) => { p.order = n + 1; });
      [list[k].order, list[j].order] = [list[j].order, list[k].order];
      list[k].updatedAt = now; list[j].updatedAt = now;
      return true;
    }
    // テキストの欄（1行に1つ）⇔ 項目の一覧。行頭の「・」「1.」「①」などの印は外す
    function carePlanLinesToList(text) {
      return String(text || '').split(/\r?\n/)
        .map(l => l.replace(/^\s*(?:[・\-‐−–—*＊●○◯◎■□◆◇▶►→]|\(?\d{1,2}[).．、]|[①-⑳]|(?:OP|TP|EP)[-‐−]?\d{1,2}[.．:：、)]?)\s*/i, '').trim())
        .filter(Boolean);
    }
    function addCareRecord(cp, planId, rec, now = new Date().toISOString()) {
      const p = getCarePlan(cp, planId);
      if (!p) return null;
      const r = { id: newRecordId('rec'), at: rec.at || now, doneItems: Array.isArray(rec.doneItems) ? rec.doneItems.slice() : [],
        doneText: String(rec.doneText || '').trim(), response: String(rec.response || '').trim(), responseCardId: rec.responseCardId || null,
        achievement: CARE_ACHIEVEMENTS.some(a => a.key === rec.achievement) ? rec.achievement : '',
        evaluation: String(rec.evaluation || '').trim(), revision: String(rec.revision || '').trim(), createdAt: now };
      p.records = [...p.records, r].sort((a, b) => String(a.at).localeCompare(String(b.at)));
      p.updatedAt = now;
      return r;
    }
    function updateCareRecord(cp, planId, recId, patch, now = new Date().toISOString()) {
      const p = getCarePlan(cp, planId);
      const r = p && p.records.find(x => x.id === recId);
      if (!r) return null;
      Object.assign(r, patch);
      p.records.sort((a, b) => String(a.at).localeCompare(String(b.at)));
      p.updatedAt = now;
      return r;
    }
    function deleteCareRecord(cp, planId, recId, now = new Date().toISOString()) {
      const p = getCarePlan(cp, planId);
      if (!p || !p.records.some(r => r.id === recId)) return false;
      p.records = p.records.filter(r => r.id !== recId);
      p.updatedAt = now;
      return true;
    }
    function latestCareRecord(plan) {
      const recs = (plan && plan.records) || [];
      return recs.length ? recs[recs.length - 1] : null;
    }

    // AIの看護計画（「■看護問題」・目標・OP/TP/EP の文章）を、看護計画の形に読み取る
    // 【レビューで発見】以前は見出しの語の直後に何が来てもよかったため、OPの項目「TPN刺入部の発赤を観察する」が
    // TPの見出し（「N刺入部…」）に、「目標SpO2 94%以上を保てているか観察する」が目標に読まれていた。
    // 見出しの語の直後は、行の終わり・空白・かっこ・「:」・「】」のときだけ見出しとする。
    const CARE_SECTION_HEAD_REGEX = /^[【\[]?\s*(長期目標|短期目標|目標|期待される成果|O-?P|観察計画|T-?P|援助計画|ケア計画|E-?P|教育計画|指導計画)(?=$|[\s（(:：】\]])\s*(?:[（(][^）)]*[）)])?\s*[】\]]?\s*[:：]?\s*(.*)$/i;
    // 看護問題の見出し：「■…」「◆…」「#1 …」に加えて、「1. ■…」「看護問題1：…」の形も読む
    const CARE_PROBLEM_HEAD_REGEX = /^(?:\d{1,2}\s*[.．)）、]\s*)?(?:■|◆|#\s*\d+[.．:：]?)\s*(.+)$|^(?:看護問題|看護診断)\s*#?\s*\d+\s*[:：.．]\s*(.+)$/;
    function parseCarePlanText(text) {
      const plans = [];
      let cur = null, sec = null;
      const lines = String(text || '').normalize('NFKC').replace(/\*\*/g, '').replace(/〔[^〕]*〕/g, '').split(/\r?\n/);
      const keyOf = h => {
        const t = h.toUpperCase().replace(/-/g, '');
        if (t === '長期目標') return 'goalLong';
        if (t === '短期目標' || t === '目標' || t === '期待される成果') return 'goalShort';
        if (t === 'OP' || t === '観察計画') return 'op';
        if (t === 'TP' || t === '援助計画' || t === 'ケア計画') return 'tp';
        return 'ep';
      };
      const addTo = (key, v) => {
        v = v.trim();
        if (!v || !cur) return;
        if (key === 'goalLong' || key === 'goalShort') cur[key] = cur[key] ? `${cur[key]}\n${v}` : v;
        else cur[key].push(...carePlanLinesToList(v));
      };
      // 【AI機能の評価で発見】AIは最初の「### 要点」に「#1 活動耐性低下：…」のような優先順位の一覧を書く。以前は
      // これも看護問題の見出しとして読み、中身の無い看護計画が2件余分に取り込まれていた。要点の中の行は読まない
      // （「■…」「看護問題1：…」の見出しが来たら要点は終わり）。
      let inSummary = false;
      lines.forEach(raw => {
        const line = raw.trim();
        if (!line) return;
        if (/^#*\s*(?:【\s*)?(?:要点|まとめ|優先順位)(?:\s*】)?\s*$/.test(line)) { inSummary = true; cur = null; sec = null; return; }
        if (inSummary && !/^(?:\d{1,2}\s*[.．)）、]\s*)?(?:■|◆)|^(?:看護問題|看護診断)\s*#?\s*\d+\s*[:：.．]/.test(line)) return;
        inSummary = false;
        const head = line.match(CARE_PROBLEM_HEAD_REGEX);
        if (head) {
          const problem = (head[1] || head[2]).replace(/^#\s*\d+[.．:：]?\s*/, '').replace(/^(?:看護問題|看護診断)\s*\d*\s*[:：]?\s*/, '').trim();
          cur = { problem, goalLong: '', goalShort: '', op: [], tp: [], ep: [] };
          plans.push(cur);
          sec = null;
          return;
        }
        const bare = line.replace(/^[・\-‐*●○]\s*/, '');
        const m = bare.match(CARE_SECTION_HEAD_REGEX);
        if (m && cur) { sec = keyOf(m[1]); addTo(sec, m[2]); return; }
        if (cur && sec) addTo(sec, line);
      });
      // 観察・把握だけのTPはOPへ移す（TPには看護師が実施する援助だけを書く）
      plans.forEach(pl => {
        const obs = cpObservationLines(pl.tp);
        if (!obs.length) return;
        pl.tp = pl.tp.filter(l => !obs.includes(l));
        obs.forEach(l => { if (!pl.op.includes(l)) pl.op.push(l); });
      });
      // 中身（目標・OP・TP・EP）のある計画があるときは、名前だけの計画は取り込まない
      const named = plans.filter(p => p.problem);
      const hasBody = p => p.goalLong || p.goalShort || p.op.length || p.tp.length || p.ep.length;
      return named.some(hasBody) ? named.filter(hasBody) : named;
    }
    // 看護診断候補（選んだもの）の名前
    function selectedDiagnosisNames(cp) {
      const cands = Array.isArray(cp.diagnosisCandidates) ? cp.diagnosisCandidates : [];
      const sel = new Set(cp.selectedDiagnosisIds || []);
      return cands.filter(c => sel.has(c.id)).map(c => String(c.name || '').trim()).filter(Boolean);
    }
    // 看護問題の名前・計画の文章から、関係するヘンダーソンの項目を推定する（タグ付けのキーワードを使う）
    function guessPlanNeeds(plan) {
      const text = [plan.problem, plan.goalShort, plan.goalLong, ...(plan.op || []), ...(plan.tp || [])].join('\n');
      try { return Array.from(detectMultipleHendersonTags(text)).slice(0, 4); } catch (e) { return []; }
    }

    // ---- 看護計画のページ ----
    const carePlanOpen = new Set();
    function renderCarePlans() {
      const wrap = document.getElementById('careplan-list');
      if (!wrap) return;
      const cp = getCurrentPatient();
      const plans = carePlanList(cp);
      const importInfo = document.getElementById('careplan-import-info');
      if (importInfo) {
        const ai = cp.carePlanResult ? parseCarePlanText(htmlToPlainText(cp.carePlanResult)).length : 0;
        const dx = selectedDiagnosisNames(cp).length;
        importInfo.textContent = ai || dx ? `取り込める内容：${[ai ? `AIの看護計画 ${ai}件` : '', dx ? `選んだ看護診断候補 ${dx}件` : ''].filter(Boolean).join('・')}` : '';
      }
      if (!plans.length) {
        wrap.innerHTML = `<div class="cp-empty"><i class="fa-solid fa-notes-medical"></i><p>まだ看護計画がありません。「＋看護計画を追加」から書くか、総合アセスメント表の「AI分析ツール」で作った看護計画・看護診断候補を「AIの結果から取り込む」で取り込めます。</p></div>`;
        return;
      }
      const focus = captureCarePlanFocus();
      wrap.innerHTML = plans.map((p, k) => carePlanCardHtml(cp, p, k, plans.length)).join('');
      restoreCarePlanFocus(focus);
      renderCarePlanSetReview();
    }
    // 看護問題の下に小さく：関連図の補足・根拠データ・「この患者に必要な理由」（AIの案・関連図から取り込んだ計画は、理由を書くまで案内を出す）
    function carePlanBasisHtml(p) {
      const pid = safeDomId(p.id);
      const parts = [];
      if (p.note) parts.push(`<p class="cp-note">${escapeHtml(p.note)}</p>`);
      if (p.evidence && p.evidence.length) parts.push(`<div class="cp-ev"><span class="my-asm-label"><i class="fa-solid fa-diagram-project"></i> 根拠データ（関連図から）</span><div class="cpr-ev">${p.evidence.map(e => `<span>${escapeHtml(e)}</span>`).join('')}</div></div>`);
      const reasons = Array.isArray(p.reasons) ? p.reasons : [];
      if (p.reasonNeeded && !reasons.length) parts.push(`<div class="cp-reason-need"><i class="fa-solid fa-graduation-cap"></i> ${p.source === 'map' ? '関連図から取り込んだ' : 'AIの案から取り込んだ'}看護問題です。そのまま使わず、この患者に必要な理由を記録のデータで確かめましょう <button type="button" class="my-asm-link" onclick="writeCareReasonUI('${pid}')">理由を書く</button></div>`);
      if (reasons.length) parts.push(`<div class="cp-reasons"><span class="my-asm-label"><i class="fa-solid fa-graduation-cap"></i> この患者に必要な理由</span><ul>${reasons.slice(-5).map(r => `<li>${r.about ? `<b>${escapeHtml(r.about)}</b>：` : ''}${escapeHtml(r.text)}</li>`).join('')}</ul><button type="button" class="my-asm-link" onclick="writeCareReasonUI('${pid}')">理由を足す</button></div>`);
      return parts.length ? `<div class="cp-basis">${parts.join('')}</div>` : '';
    }
    function carePlanCardHtml(cp, p, k, n) {
      // 【レビューで発見】計画のIDを onclick="…('…')" に入れるので、アプリが作る形のIDだけを使う（safeDomId）
      const pid = safeDomId(p.id);
      const open = carePlanOpen.has(p.id);
      const last = latestCareRecord(p);
      const ach = last && last.achievement ? CARE_ACHIEVEMENTS.find(a => a.key === last.achievement) : null;
      const status = CARE_PLAN_STATUSES.find(s => s.key === p.status);
      const needs = p.relatedNeeds.map(h => `<span class="cp-need">${h}.${escapeHtml(hendersonNameOf(h).replace(/^\d+\.\s*/, ''))}</span>`).join('');
      const head = `<div class="cp-head">
        <span class="cp-no">#${k + 1}</span>
        <button type="button" class="cp-title" onclick="toggleCarePlan('${pid}')" aria-expanded="${open}"><i class="fa-solid fa-chevron-${open ? 'down' : 'right'}"></i> ${escapeHtml(p.problem || '（看護問題を書いてください）')}</button>
        <span class="cp-status cp-status-${p.status}">${status.label}</span>
        ${ach ? `<span class="cp-ach cp-ach-${ach.key}" title="最新の評価（${escapeHtml(formatMyDateTime(last.at))}）">${ach.label}</span>` : ''}
        <span class="cp-meta">${needs}<span class="my-asm-muted">記録 ${p.records.length}件</span></span>
        <span class="cp-order"><button type="button" class="icon-btn" onclick="moveCarePlanUI('${pid}','up')" ${k === 0 ? 'disabled' : ''} title="優先順位を上げる"><i class="fa-solid fa-arrow-up"></i></button><button type="button" class="icon-btn" onclick="moveCarePlanUI('${pid}','down')" ${k === n - 1 ? 'disabled' : ''} title="優先順位を下げる"><i class="fa-solid fa-arrow-down"></i></button></span>
      </div>`;
      if (!open) return `<section class="cp-card">${head}</section>`;
      const field = (key, label, rows, placeholder) => `<label class="cp-field"><span class="my-asm-label">${label}</span><textarea class="field my-asm-text" rows="${rows}" data-cp-plan="${pid}" data-cp-field="${key}" placeholder="${escapeHtml(placeholder)}" oninput="onCarePlanInput('${pid}','${key}',this)">${escapeHtml(Array.isArray(p[key]) ? p[key].join('\n') : p[key])}</textarea></label>`;
      const needBtns = HENDERSON_NEEDS.map(nd => `<button type="button" class="cp-need-btn${p.relatedNeeds.includes(nd.id) ? ' active' : ''}" onclick="toggleCarePlanNeed('${pid}', ${nd.id})" title="${escapeHtml(nd.name)}">${nd.id}.${escapeHtml(nd.name.replace(/^\d+\.\s*/, ''))}</button>`).join('');
      const records = p.records.slice().reverse().map(r => careRecordHtml(p, r)).join('');
      return `<section class="cp-card open">${head}
        <div class="cp-body">
          <label class="cp-field"><span class="my-asm-label"><i class="fa-solid fa-triangle-exclamation"></i> 看護問題（看護診断）</span><input type="text" class="field my-asm-text" data-cp-plan="${pid}" data-cp-field="problem" value="${escapeHtml(p.problem)}" placeholder="例：術後の創部痛に関連した急性疼痛" oninput="onCarePlanInput('${pid}','problem',this)"></label>
          ${carePlanBasisHtml(p)}
          <div class="cp-row"><span class="my-asm-label"><i class="fa-solid fa-table-cells"></i> 関係する項目</span><div class="cp-need-btns">${needBtns}</div></div>
          <div class="cp-grid2">${field('goalLong', '<i class="fa-solid fa-flag-checkered"></i> 長期目標', 2, '例：退院までに歩行器で病棟内を自立して移動できる')}${field('goalShort', '<i class="fa-solid fa-flag"></i> 短期目標', 2, '例：3日後までに、痛みがNRS3以下でリハビリに参加できる')}</div>
          <div class="cp-grid3">${CARE_PLAN_SECTIONS.map(s => field(s.key, `<i class="fa-solid fa-list-ol"></i> ${s.label}`, 5, s.placeholder)).join('')}</div>
          <div class="cp-actions">
            <label class="cp-status-select"><span class="my-asm-label">状態</span><select class="field" onchange="setCarePlanStatus('${pid}', this.value)">${CARE_PLAN_STATUSES.map(s => `<option value="${s.key}"${p.status === s.key ? ' selected' : ''}>${s.label}</option>`).join('')}</select></label>
            <button type="button" class="btn btn-outline my-asm-btn${carePlanReviewOpen.has(p.id) ? ' active' : ''}" onclick="toggleCarePlanReview('${pid}')" aria-expanded="${carePlanReviewOpen.has(p.id)}" title="目標・OP/TP/EPを7つの項目で確かめます（AIなし）"><i class="fa-solid fa-clipboard-list"></i> 計画をチェック</button>
            <button type="button" class="btn btn-outline my-asm-btn" onclick="reviewCarePlanAiUI('${pid}')" ${carePlanAiRunning.has(p.id) ? 'disabled' : ''}>${carePlanAiRunning.has(p.id) ? '<i class="fa-solid fa-spinner fa-spin"></i> AIで評価中…' : '<i class="fa-solid fa-wand-magic-sparkles"></i> AIで看護計画を評価'}</button>
            <button type="button" class="btn btn-primary my-asm-btn" onclick="openCareRecord('${pid}')"><i class="fa-solid fa-plus"></i> 実施・評価を記録</button>
            <button type="button" class="btn btn-outline my-asm-btn cp-delete" onclick="deleteCarePlanUI('${pid}')"><i class="fa-solid fa-trash-can"></i> この計画を消す</button>
          </div>
          ${carePlanReviewOpen.has(p.id) ? carePlanReviewHtml(cp, p) : ''}
          <div class="cp-records"><div class="my-asm-label"><i class="fa-solid fa-clipboard-check"></i> 実施・評価の記録（新しい順）</div>${records || '<p class="my-asm-muted">まだ記録がありません。「実施・評価を記録」から、実施した内容・患者の反応・目標の達成状況を残します。</p>'}</div>
        </div>
      </section>`;
    }
    function careRecordHtml(p, r) {
      const pid = safeDomId(p.id);
      const ach = CARE_ACHIEVEMENTS.find(a => a.key === r.achievement);
      const row = (label, v) => v ? `<div class="cr-row"><b>${label}</b><p>${escapeHtml(v)}</p></div>` : '';
      return `<div class="cr">
        <div class="cr-head"><span class="cr-when"><i class="fa-regular fa-calendar"></i> ${escapeHtml(formatMyDateTime(r.at))}</span>${ach && ach.key ? `<span class="cp-ach cp-ach-${ach.key}">${ach.label}</span>` : ''}
          <span class="cr-tools"><button type="button" class="my-asm-link" onclick="openCareRecord('${pid}','${safeDomId(r.id)}')">編集</button><button type="button" class="my-asm-link muted" onclick="deleteCareRecordUI('${pid}','${safeDomId(r.id)}')">削除</button></span></div>
        ${r.doneItems.length ? `<div class="cr-row"><b>実施した計画</b><ul>${r.doneItems.map(d => `<li>${escapeHtml(d)}</li>`).join('')}</ul></div>` : ''}
        ${row('実施内容', r.doneText)}${row('患者の反応', r.response)}${row('評価', r.evaluation)}${row('計画の修正', r.revision)}
      </div>`;
    }
    function captureCarePlanFocus() {
      const a = document.activeElement;
      if (!a || !a.dataset || !a.dataset.cpField) return null;
      return { plan: a.dataset.cpPlan, field: a.dataset.cpField, start: a.selectionStart, end: a.selectionEnd };
    }
    function restoreCarePlanFocus(f) {
      if (!f) return;
      const el = document.querySelector(`[data-cp-plan="${f.plan}"][data-cp-field="${f.field}"]`);
      if (!el) return;
      el.focus();
      try { el.setSelectionRange(f.start, f.end); } catch (e) { /* 位置を戻せなくても続ける */ }
    }
    function commitCarePlanChange(cp, rerender = true) {
      saveMyAssessmentsSoon(cp.id, 0);
      if (rerender) renderCarePlans();
    }

    window.toggleCarePlan = function(id) {
      if (carePlanOpen.has(id)) carePlanOpen.delete(id); else carePlanOpen.add(id);
      renderCarePlans();
    };
    window.onCarePlanInput = function(id, key, el) {
      const cp = getCurrentPatient();
      const p = getCarePlan(cp, id);
      if (!p) return;
      p[key] = CARE_PLAN_SECTIONS.some(s => s.key === key) ? carePlanLinesToList(el.value) : el.value;
      // 書いている途中の空行・行頭の印は入力欄のまま残したいので、欄は描き直さない（見出しだけ直す）
      p.updatedAt = new Date().toISOString();
      saveMyAssessmentsSoon(cp.id);
      if (key === 'problem') {
        const t = document.querySelector(`.cp-card [onclick="toggleCarePlan('${id}')"]`);
        if (t) t.innerHTML = `<i class="fa-solid fa-chevron-down"></i> ${escapeHtml(el.value || '（看護問題を書いてください）')}`;
      }
    };
    window.toggleCarePlanNeed = function(id, needId) {
      const cp = getCurrentPatient();
      const p = getCarePlan(cp, id);
      if (!p) return;
      const needs = p.relatedNeeds.includes(needId) ? p.relatedNeeds.filter(h => h !== needId) : [...p.relatedNeeds, needId].sort((a, b) => a - b);
      updateCarePlan(cp, id, { relatedNeeds: needs });
      commitCarePlanChange(cp);
    };
    window.setCarePlanStatus = function(id, status) {
      const cp = getCurrentPatient();
      updateCarePlan(cp, id, { status });
      commitCarePlanChange(cp);
    };
    window.moveCarePlanUI = function(id, dir) {
      const cp = getCurrentPatient();
      if (moveCarePlan(cp, id, dir)) commitCarePlanChange(cp);
    };
    window.addCarePlanUI = function() {
      const cp = getCurrentPatient();
      const p = createCarePlan(cp, {});
      carePlanOpen.add(p.id);
      commitCarePlanChange(cp);
      setTimeout(() => { const el = document.querySelector(`[data-cp-plan="${p.id}"][data-cp-field="problem"]`); if (el) el.focus(); }, 30);
    };
    window.deleteCarePlanUI = async function(id) {
      const cp = getCurrentPatient();
      const p = getCarePlan(cp, id);
      if (!p) return;
      const ok = await openDialog({ title: 'この看護計画を消しますか？', message: `「${p.problem || '（無題）'}」と、その実施・評価の記録${p.records.length}件を消します。`, confirmLabel: '消す', danger: true });
      if (ok !== true) return;
      deleteCarePlan(cp, id);
      commitCarePlanChange(cp);
      showToast('看護計画を消しました', 'info');
    };
    // AIの看護計画・選んだ看護診断候補から取り込む（同じ看護問題の計画が既にあれば足さない）
    function importCarePlans(cp, source, now = new Date().toISOString()) {
      const existing = new Set(carePlanList(cp).map(p => p.problem.replace(/\s+/g, '')));
      const fresh = [];
      const add = fields => {
        const key = fields.problem.replace(/\s+/g, '');
        if (!key || existing.has(key)) return;
        existing.add(key);
        const plan = createCarePlan(cp, fields, now);
        if (!plan.relatedNeeds.length) plan.relatedNeeds = guessPlanNeeds(plan);
        fresh.push(plan);
      };
      if (source === 'ai') parseCarePlanText(htmlToPlainText(cp.carePlanResult || '')).forEach(f => add({ ...f, source: 'ai', reasonNeeded: true }));
      else selectedDiagnosisNames(cp).forEach(name => add({ problem: name }));
      return fresh;
    }
    window.importCarePlansUI = async function() {
      const cp = getCurrentPatient();
      const aiCount = cp.carePlanResult ? parseCarePlanText(htmlToPlainText(cp.carePlanResult)).length : 0;
      const dxCount = selectedDiagnosisNames(cp).length;
      if (!aiCount && !dxCount) return showToast('取り込める内容がありません。総合アセスメント表の「AI分析ツール」で看護診断候補を選ぶか、看護計画を自動生成してください', 'warn', 6000);
      let source = aiCount ? 'ai' : 'dx';
      if (aiCount && dxCount) {
        const ans = await openDialog({ title: '何から取り込みますか？', message: `AIの看護計画（看護問題${aiCount}件、目標・OP/TP/EPつき）か、選んだ看護診断候補（${dxCount}件、看護問題の名前だけ）から取り込みます。取り込んだあと、自由に書き直せます。`, confirmLabel: 'AIの看護計画から', secondaryLabel: '看護診断候補から' });
        if (ans === null) return;
        source = ans === 'secondary' ? 'dx' : 'ai';
      }
      const fresh = importCarePlans(cp, source);
      if (!fresh.length) return showToast('同じ看護問題の計画が既にあるため、取り込むものはありませんでした', 'info');
      fresh.forEach(p => carePlanOpen.add(p.id));
      commitCarePlanChange(cp);
      showToast(`看護計画を${fresh.length}件取り込みました。自分の言葉で書き直しましょう`, 'success');
    };

    // ---- 実施・評価の記録の画面 ----
    let careRecordEditing = null; // { planId, recId }
    window.openCareRecord = function(planId, recId = null) {
      const cp = getCurrentPatient();
      const p = getCarePlan(cp, planId);
      if (!p) return;
      const r = recId ? p.records.find(x => x.id === recId) : null;
      careRecordEditing = { planId, recId: r ? r.id : null };
      document.getElementById('care-record-title').textContent = `${r ? '実施・評価の記録を直す' : '実施・評価を記録'}：${p.problem || '（無題）'}`;
      document.getElementById('care-record-at').value = toLocalInputValue(r ? r.at : null);
      const done = new Set(r ? r.doneItems : []);
      const items = CARE_PLAN_SECTIONS.flatMap(s => p[s.key].map((t, k) => `${s.short}${k + 1} ${t}`));
      document.getElementById('care-record-items').innerHTML = items.length
        ? items.map(t => `<label class="cr-item"><input type="checkbox" value="${escapeHtml(t)}"${done.has(t) ? ' checked' : ''}> ${escapeHtml(t)}</label>`).join('')
        : '<p class="my-asm-muted">OP/TP/EPがまだありません（下の「実施内容」に書けます）。</p>';
      document.getElementById('care-record-done').value = r ? r.doneText : '';
      document.getElementById('care-record-response').value = r ? r.response : '';
      document.getElementById('care-record-evaluation').value = r ? r.evaluation : '';
      document.getElementById('care-record-revision').value = r ? r.revision : '';
      document.querySelectorAll('#care-record-achievement input').forEach(i => { i.checked = i.value === (r ? r.achievement : ''); });
      const hasCard = r && r.responseCardId && cp.items.some(i => i.id === r.responseCardId && i.type !== 'unnecessary');
      document.getElementById('care-record-add-card').checked = false;
      document.getElementById('care-record-card-row').classList.toggle('hidden', !!hasCard);
      document.getElementById('care-record-goal').textContent = p.goalShort || p.goalLong ? `目標：${p.goalShort || p.goalLong}` : '';
      document.getElementById('modal-care-record').classList.remove('hidden');
    };
    window.closeCareRecord = function() {
      careRecordEditing = null;
      document.getElementById('modal-care-record').classList.add('hidden');
    };
    window.saveCareRecordUI = function() {
      if (!careRecordEditing) return;
      const cp = getCurrentPatient();
      const { planId, recId } = careRecordEditing;
      const p = getCarePlan(cp, planId);
      if (!p) return closeCareRecord();
      const rec = {
        at: fromLocalInputValue(document.getElementById('care-record-at').value),
        doneItems: Array.from(document.querySelectorAll('#care-record-items input:checked')).map(i => i.value),
        doneText: document.getElementById('care-record-done').value.trim(),
        response: document.getElementById('care-record-response').value.trim(),
        evaluation: document.getElementById('care-record-evaluation').value.trim(),
        revision: document.getElementById('care-record-revision').value.trim(),
        achievement: (document.querySelector('#care-record-achievement input:checked') || {}).value || ''
      };
      if (!rec.doneItems.length && !rec.doneText && !rec.response && !rec.evaluation && !rec.revision) return showToast('実施した内容・患者の反応・評価のどれかを書いてください', 'warn');
      let card = null;
      if (rec.response && document.getElementById('care-record-add-card').checked) {
        card = createOwnInfoCard(cp, { text: rec.response, type: document.getElementById('care-record-card-type').value, needs: p.relatedNeeds, at: rec.at, fieldLabel: '患者の反応' });
        rec.responseCardId = card.id;
      }
      if (recId) updateCareRecord(cp, planId, recId, rec); else addCareRecord(cp, planId, rec);
      closeCareRecord();
      saveDataAndSync();
      renderCarePlans();
      showToast(card ? '記録しました。患者の反応を情報カードとしても追加しました' : '実施・評価を記録しました', 'success');
    };
    window.deleteCareRecordUI = async function(planId, recId) {
      const ok = await openDialog({ title: 'この記録を削除しますか？', confirmLabel: '削除', danger: true });
      if (ok !== true) return;
      const cp = getCurrentPatient();
      if (deleteCareRecord(cp, planId, recId)) commitCarePlanChange(cp);
    };


    // ==========================================================================
    // ④ 看護計画の評価（利用者の要望：2026-10-07.5）
    //   ・「計画をチェック」（AIなし・すぐ出る）と「AIで評価」（Gemini）。評価の7項目：
    //     看護問題との整合性／目標の具体性・評価可能性／OPの不足／TPの具体性／EPの適切さ／患者の個別性／根拠データとの一致
    //   ・目標は「いつまでに」「患者が」「どうなる」「何をもって達成と判断するか」の4つを確かめ、抽象的な目標
    //     （例：疼痛が軽減する）には、この患者の記録の値を使った目標の例を出す（例をそのまま入れず、自分で直してから入れる）
    //   ・関連図の看護問題と根拠データを、看護計画へ引き継ぐ（「関連図から取り込む」）
    //   ・AIの案・関連図から取り込んだ計画・評価の提案は、「この患者に必要な理由」を書いてから使う（学習の支え）
    //   ・新しい入力欄は増やさない（理由・根拠は計画の中に小さく表示し、入力はダイアログで行う）
    // ==========================================================================
    const CP_REVIEW_ITEMS = [
      { key: 'fit', label: '看護問題との整合性' },
      { key: 'goal', label: '目標の具体性・評価可能性' },
      { key: 'op', label: 'OP（観察計画）の不足' },
      { key: 'tp', label: 'TP（援助計画）の具体性' },
      { key: 'ep', label: 'EP（教育計画）の適切さ' },
      { key: 'individual', label: '患者の個別性' },
      { key: 'evidence', label: '根拠データとの一致' }
    ];
    // 看護問題の種類ごとに、OPで見ておきたいこと（不足の確認に使う）・計画の中に出てきてほしい言葉・目標の例
    const CP_DOMAINS = [
      { key: 'inf', re: /感染/, words: /感染|発熱|体温|創部|刺入部|発赤|WBC|CRP/,
        op: [['体温・熱型', /体温|発熱|熱型|℃/], ['創部・刺入部の発赤・腫脹・熱感・痛み', /発赤|腫脹|熱感|創部|刺入部/], ['滲出液・ドレーン排液・尿の性状', /滲出|排液|ドレーン|尿の(?:性状|色|混濁)|性状/], ['WBC・CRPなどの検査値', /WBC|CRP|白血球|検査/]],
        goal: c => `退院まで、体温37.5℃未満が続き、${c.urinary ? '尿の混濁がなく、' : ''}創部に発赤・腫脹・滲出液が見られない` },
      { key: 'vte', re: /血栓|塞栓|DVT/, words: /下肢|腫脹|ホーマンズ|ダイマー|弾性|フットポンプ|足関節/,
        op: [['下肢の腫脹・痛み・色・左右差', /下肢|腫脹|左右差|ふくらはぎ|下腿/], ['ホーマンズ徴候', /ホーマンズ/], ['Dダイマー', /ダイマー|D-?dimer/i], ['胸痛・呼吸困難・SpO2の急な低下（肺塞栓）', /胸痛|呼吸困難|SpO2|肺塞栓/]],
        goal: () => '離床するまで、下肢の腫脹・痛み・左右差がなく、胸痛・呼吸困難などの肺塞栓の徴候が見られない' },
      { key: 'bleed', re: /出血/, words: /出血|皮下出血|血便|INR|抗凝固/,
        op: [['皮下出血・歯肉出血・血尿・血便などの出血の徴候', /皮下出血|歯肉|血尿|血便|出血/], ['PT-INR などの検査値', /INR|凝固|検査/], ['血圧・脈拍', /血圧|脈拍|バイタル/]],
        goal: () => '入院中、出血の徴候がなく、出血に気づいたときにすぐ看護師に伝えられる' },
      { key: 'glu', re: /血糖/, words: /血糖|低血糖|インスリン/,
        op: [['血糖値（測る時間）', /血糖/], ['低血糖症状（冷汗・手のふるえ・意識の変化）', /低血糖|冷汗|ふるえ/], ['食事摂取量', /摂取量|食事/], ['インスリン・内服の量と時間', /インスリン|内服|血糖降下/]],
        goal: () => '入院中、血糖値が70〜200mg/dLの範囲を保ち、低血糖の症状が出たときに自分で看護師に伝えられる' },
      { key: 'swallow', re: /嚥下|誤嚥/, words: /嚥下|むせ|誤嚥|食形態|とろみ/,
        op: [['むせ・咳込み（いつ・何で）', /むせ|咳込/], ['食事の形態・姿勢・一口量', /形態|姿勢|一口|とろみ/], ['口の中の食べ残し', /口腔|残渣|食べ残し/], ['発熱・呼吸音・痰（誤嚥性肺炎の徴候）', /発熱|体温|呼吸音|痰/]],
        goal: () => '1週間後までに、むせ込みなく嚥下調整食を全量食べられ、発熱がない' },
      { key: 'resp', re: /気道|呼吸|ガス交換|換気|無気肺|肺炎|排痰/, words: /呼吸|SpO2|痰|喀痰|深呼吸|酸素/,
        op: [['SpO2', /SpO2|酸素飽和/], ['呼吸数・呼吸の深さ・リズム', /呼吸数|呼吸の(?:深さ|様式|リズム)|呼吸状態/], ['呼吸音（副雑音）', /呼吸音|副雑音|ラ音|聴診/], ['痰の量・性状・自分で出せるか', /痰|喀痰|分泌物/], ['息苦しさ（呼吸困難感）', /息苦し|呼吸困難|息切れ/]],
        goal: c => `3日後までに、自分で痰を出すことができ、SpO2 ${c.spo2 && c.spo2 < 95 ? 94 : 95}%以上を保てる（呼吸音の副雑音が減る）` },
      { key: 'pain', re: /疼痛|痛/, words: /痛|NRS|鎮痛/,
        op: [['痛みの強さ（NRSなど）', /NRS|VAS|フェイス|スケール|強さ|程度/], ['痛みの部位', /部位|場所/], ['痛みの性質（ズキズキ・鈍いなど）', /性質|性状|ズキズキ|鈍い|鋭い/], ['持続時間・出現する時間', /持続|時間|いつ|出現/], ['体動・咳・深呼吸との関連', /体動|動く|動作|離床|咳|深呼吸|体位/], ['鎮痛薬の使用と使用後の変化', /鎮痛|PCA|使用後|効果|頓用/], ['表情・睡眠・活動への影響', /表情|睡眠|眠|活動|ADL/]],
        goal: c => `2日後までに、安静時の${c.painSite || '痛み'}が${c.nrs != null ? `NRS${c.nrs}から` : ''}NRS${c.nrs != null ? Math.max(0, Math.min(3, c.nrs - 2)) : 3}以下となり、苦痛なく休息できる` },
      { key: 'fall', re: /転倒|転落/, words: /転倒|転落|ふらつ|ナースコール|履物|ベッド柵/,
        op: [['ふらつき・歩行の状態', /ふらつ|歩行|歩き方/], ['夜間の行動・トイレの回数', /夜間|トイレ|排尿/], ['転倒に関係する薬（睡眠薬・降圧薬・利尿薬）', /睡眠薬|降圧|利尿|薬/], ['認知・せん妄の有無', /認知|せん妄|見当識/], ['ベッド周りの環境・履物', /環境|ベッド|柵|履物|靴/]],
        goal: () => '入院中、転倒・転落が起こらず、トイレに行くときはナースコールで看護師を呼べる' },
      { key: 'delirium', re: /せん妄|混乱/, words: /せん妄|見当識|昼夜|夜間/,
        op: [['意識・見当識（日時・場所）', /意識|見当識/], ['夜間の言動・睡眠', /夜間|睡眠|眠/], ['点滴・ドレーンを抜こうとする行動', /自己抜去|抜こう|ルート|ドレーン/], ['痛み・脱水・低酸素などの誘因', /痛|脱水|酸素|SpO2/]],
        goal: () => '術後3日目まで、日時・場所がわかり、夜は眠ることができる' },
      { key: 'skin', re: /褥瘡|皮膚/, words: /褥瘡|発赤|体位変換|除圧|DESIGN/,
        op: [['皮膚の発赤の部位・大きさ（DESIGN-R）', /発赤|DESIGN|部位|大きさ/], ['圧迫・ずれ・湿潤', /圧迫|ずれ|湿潤|汗|失禁/], ['体位変換の状況', /体位変換|除圧/], ['栄養状態（Alb・摂取量）', /Alb|アルブミン|栄養|摂取/]],
        goal: c => `1週間後までに、${c.skin || '圧迫部位の発赤'}が消え、新しい発赤ができない` },
      { key: 'ileus', re: /消化管運動|イレウス|腸閉塞/, words: /腸蠕動|排ガス|腹部膨満|離床/,
        op: [['腸蠕動音', /蠕動/], ['排ガス・排便', /排ガス|排便/], ['腹部膨満・腹痛', /膨満|腹痛|お腹/], ['悪心・嘔吐', /悪心|嘔吐|吐き気/]],
        goal: () => '術後3日目までに排ガスがあり、腹部膨満・嘔吐が見られない' },
      { key: 'const', re: /便秘/, words: /排便|便|腹部|水分/,
        op: [['排便の回数・最後の排便', /排便|最終/], ['便の性状', /性状|硬さ|ブリストル/], ['腹部膨満・腸蠕動音・排ガス', /膨満|蠕動|排ガス/], ['食事・水分の量・活動量', /食事|水分|活動/]],
        goal: () => '3日後までに自然排便があり、お腹の張りの訴えがない' },
      { key: 'urine', re: /排尿|尿閉/, words: /尿|排尿|導尿/,
        op: [['尿量・排尿の回数', /尿量|排尿|回数/], ['残尿感・下腹部の張り', /残尿|下腹部|膀胱/], ['尿の性状', /性状|混濁|色/]],
        goal: () => '2日後までに、自分で排尿でき、残尿感・下腹部の張りの訴えがない' },
      { key: 'nausea', re: /悪心|嘔気|吐き気/, words: /悪心|嘔吐|吐き気|制吐/,
        op: [['悪心・嘔吐の有無・回数・出る時間', /悪心|嘔吐|吐き気|回数/], ['食事・水分がとれているか', /食事|水分|摂取/], ['原因になる薬', /薬|オピオイド|麻薬/]],
        goal: () => '2日後までに、吐き気の訴えがなく、食事を5割以上食べられる' },
      { key: 'fluidEx', re: /体液量過剰/, words: /体重|浮腫|水分|IN|OUT|出納/,
        op: [['体重（毎日同じ条件で）', /体重/], ['浮腫の部位・程度', /浮腫|むくみ/], ['水分出納（IN/OUT）・尿量', /出納|IN|OUT|尿量/], ['息苦しさ・SpO2・呼吸音', /息苦し|SpO2|呼吸音|呼吸困難/]],
        goal: () => '3日後までに、体重が入院時より1kg以上減り、下腿の浮腫が軽くなる（息苦しさの訴えがない）' },
      { key: 'fluidLow', re: /体液量不足|脱水/, words: /尿量|出納|口渇|水分|皮膚の乾燥/,
        op: [['水分出納（IN/OUT）・尿量・尿の色', /出納|IN|OUT|尿量|尿の色/], ['口の中・皮膚の乾燥・口渇', /乾燥|口渇|ツルゴール/], ['血圧・脈拍・ふらつき', /血圧|脈拍|ふらつ/], ['BUN・Cr・Na・Kなどの検査値', /BUN|Cr|Na|K\b|電解質|検査/]],
        goal: () => '2日後までに、1日の尿量が1000mL以上となり、口渇の訴えがない' },
      { key: 'nutr', re: /栄養/, words: /摂取|食事|体重|Alb|栄養/,
        op: [['食事摂取量（何割）', /摂取量|割|食事/], ['体重の変化', /体重/], ['Alb・TPなどの検査値', /Alb|アルブミン|TP|検査/], ['食べられない理由（悪心・痛み・嚥下・食欲）', /悪心|食欲|嚥下|理由/]],
        goal: () => '1週間後までに、食事を毎食7割以上食べられ、体重が今より減らない' },
      { key: 'mobility', re: /可動性|移動/, words: /麻痺|MMT|移乗|寝返り|関節/,
        op: [['麻痺・筋力（MMT）', /麻痺|MMT|筋力/], ['寝返り・起き上がり・移乗の介助量', /寝返り|起き上が|移乗|介助/], ['関節の動く範囲・痛み', /関節|可動域|ROM|痛/], ['皮膚の圧迫（同じ姿勢が続くか）', /圧迫|体位|発赤/]],
        goal: () => '2週間後までに、介助を受けながら車椅子へ移乗できる' },
      { key: 'act', re: /活動|セルフケア|ADL/, words: /活動|歩行|ADL|清潔|更衣|息切れ|疲労/,
        op: [['活動の前後のバイタル（脈拍・SpO2・血圧）', /前後|脈拍|SpO2|血圧|バイタル/], ['息切れ・疲れ', /息切れ|疲|倦怠/], ['歩行・移動の状態', /歩行|移動|離床/], ['ADL（清潔・更衣・排泄）のできる所・介助が要る所', /ADL|清潔|更衣|排泄|入浴|自立/]],
        goal: () => '1週間後までに、休憩を入れながら病棟のトイレまで歩いて行け、歩行後もSpO2 90%以上を保てる' },
      { key: 'sleep', re: /睡眠|眠/, words: /睡眠|眠|覚醒/,
        op: [['睡眠時間・途中で目が覚めた回数', /睡眠時間|中途覚醒|覚醒|回数|眠/], ['眠れない理由（痛み・トイレ・不安・環境）', /理由|痛|トイレ|不安|環境|音/], ['日中の様子（眠気・活動）', /日中|眠気|昼/]],
        goal: () => '3日後までに、夜に5時間以上続けて眠れたと言える' },
      { key: 'comm', re: /コミュニケーション|言語/, words: /文字盤|筆談|ジェスチャー|理解|表出/,
        op: [['言葉の理解・表出の程度', /理解|表出|言葉/], ['使える伝え方（文字盤・筆談・ジェスチャー）', /文字盤|筆談|ジェスチャー|手段/], ['伝わらないときの表情・いらだち', /表情|いらだ|イライラ/]],
        goal: () => '3日後までに、文字盤などを使って、自分の要望を看護師に伝えられる' },
      { key: 'mgmt', re: /自主管理|健康管理|自己管理/, words: /塩分|内服|服薬|体重測定|理解/,
        op: [['病気・治療の理解（自分の言葉で説明できるか）', /理解|説明でき/], ['入院前の生活（食事・塩分・内服の習慣）', /生活|食事|塩分|内服|服薬|習慣/], ['家族の支援・協力', /家族|支援/]],
        goal: () => '退院までに、1日の塩分の目安と毎日の体重測定の理由を自分の言葉で説明できる' },
      { key: 'know', re: /知識/, words: /理解|説明|パンフレット/,
        op: [['今わかっていること・わからないこと（質問の内容）', /理解|質問|わから/], ['説明を聞く準備（体調・意欲）', /意欲|体調|準備/], ['家族の理解', /家族/]],
        goal: () => '退院までに、退院後の内服・生活の注意点を自分の言葉で説明できる' },
      { key: 'body', re: /ボディイメージ|障害受容/, words: /ストーマ|受け止め|言動|表情|気持ち/,
        op: [['体の変化についての言動・表情', /言動|表情|発言|気持ち/], ['患部・ストーマを見る・触るか', /見る|触|ストーマ|患部/], ['セルフケアへの参加', /セルフケア|参加|交換|自分で/], ['家族の反応・支援', /家族/]],
        goal: c => c.stoma ? '2週間後までに、ストーマを自分で見ることができ、パウチ交換の手順を1つ以上自分で行える' : '2週間後までに、体の変化について自分の気持ちを看護師に話すことができる' },
      { key: 'anx', re: /不安|恐怖/, words: /不安|表情|言動|睡眠|説明/,
        op: [['表情・言動（不安の言葉）', /表情|言動|発言|言葉/], ['不安の内容（何が心配か）', /内容|何が|心配/], ['睡眠・食欲', /睡眠|眠|食欲/], ['家族の支援', /家族/]],
        goal: () => '3日後までに、心配なことを自分の言葉で看護師に話せ、夜は眠れたと言える' }
    ];
    // 糖尿病の足潰瘍・家族の知識不足は、褥瘡・知識不足とは観察・目標が違うので、それぞれの前に入れる（2026-10-07.8）
    CP_DOMAINS.splice(CP_DOMAINS.findIndex(d => d.key === 'skin'), 0, { key: 'dmfoot', re: /足潰瘍|足病変|糖尿病性足|足壊疽/, words: /足|潰瘍|滲出|免荷|発赤|靴/,
      op: [['潰瘍の大きさ・深さ・滲出液・発赤・熱感・臭い', /大きさ|深さ|滲出|発赤|熱感|臭/], ['足趾・足底の感覚（モノフィラメント）と足背動脈の触知', /感覚|モノフィラメント|足背|触知/], ['足の皮膚（乾燥・亀裂・胼胝・水疱）と靴・靴下', /乾燥|亀裂|胼胝|水疱|靴/], ['血糖値・WBC・CRP', /血糖|WBC|CRP/], ['免荷（荷重制限）が守れているか', /免荷|荷重/]],
      goal: () => '1週間後までに、潰瘍が直径1.5cm以下となり、滲出液・発赤が見られない' });
    CP_DOMAINS.splice(CP_DOMAINS.findIndex(d => d.key === 'know'), 0, { key: 'fam', re: /家族/, words: /家族|妻|夫|食事|指導|説明/,
      op: [['家族の言葉・不安・負担', /言葉|不安|負担/], ['家族が理解していること・できていること', /理解|できて/], ['面会時の様子・協力の状況', /面会|協力/]],
      goal: () => '退院までに、家族が患者の食事・服薬・症状が出たときの対応を、自分の言葉で説明できる' });
    // 手本（この患者の記録を使った、実習中に実施・評価できる計画の例）。学生に考えさせすぎず、まず見本を示す
    const CP_MODELS = {
      pain: c => ({ goalLong: `退院までに、${c.painSite || '痛み'}がNRS3以下で、痛みを我慢せずに自分から看護師へ伝えながら、トイレまで歩ける`,
        goalShort: `2日後までに、安静時の${c.painSite || '痛み'}が${c.nrs != null ? `NRS${c.nrs}から` : ''}NRS3以下となり、苦痛なく休息できる`,
        tp: ['体動・清拭・歩行の前に、医師の指示の範囲で鎮痛薬を使えるよう調整し、効果が出る時間に合わせて動く', '創部を圧迫しないよう、枕を使って膝を軽く曲げた体位に整える', '起き上がるときは創部を手で支えられるよう、ゆっくり一緒に動く'],
        ep: ['痛みは我慢せず、0〜10の数字（NRS）で伝えてよいことを説明し、今の痛みを数字で答えてもらって確認する', '創部を手で支えて起き上がる方法を実演し、1回やってもらう'] }),
      inf: c => ({ goalLong: '退院まで、体温37.5℃未満が続き、創部・傷に発赤・腫脹・滲出液が増えない',
        goalShort: `3日後までに、${c.text && /潰瘍/.test(c.text) ? '傷のまわりの発赤・滲出液が減り、' : ''}体温37.5℃未満で、WBC・CRPが下がる`,
        tp: ['処置の前後に手指消毒を行い、傷・刺入部は清潔な操作で処置する', '指示に従って洗浄・被覆を行い、清潔に保つ', '発熱（37.5℃以上）や傷の悪化があれば、すぐ医師へ報告する'],
        ep: ['傷を触らない、食事前・トイレ後に手を洗うことを説明し、自分で手洗いをしてもらって確認する'] }),
      glu: () => ({ goalLong: '退院までに、低血糖の症状と対処（ブドウ糖を摂る・知らせる）を自分の言葉で説明でき、血糖の目標範囲を言える',
        goalShort: '3日後までに、低血糖の症状を3つ言え、ふらふら・手の震えが出たときはナースコールで知らせてブドウ糖を摂れる',
        tp: ['血糖測定とインスリン注射の前に、その食事を食べられるか（摂取量）を確認してから行う', '低血糖の症状があればすぐ血糖を測り、指示のブドウ糖を摂れるよう援助して、15分後にもう一度測る', '食事が半分以下のときは、インスリンを打つ前に医師へ確認する'],
        ep: ['低血糖の症状（冷や汗・手の震え・動悸・ふらつき）と、そのときはブドウ糖を摂ってすぐ知らせることを説明し、自分の言葉で言ってもらう', 'ブドウ糖は常に手元に置くよう伝え、置き場所を一緒に決める'] }),
      dmfoot: () => ({ goalLong: '退院までに、足の潰瘍が縮小し、毎日自分で足の裏を観察して、傷・赤みに気づいたらすぐ受診できる',
        goalShort: '1週間後までに、潰瘍が直径1.5cm以下となり、滲出液・発赤がなく、鏡を使って足の裏を自分で観察できる',
        tp: ['指示の洗浄・軟膏処置を毎日行い、清潔な操作で潰瘍を保護する', '免荷のため、歩くときは指示の靴・補助具を使えるよう一緒に確認し、病室外の移動は付き添う', '足を毎日洗い、指の間までよく拭いて乾かす方法を一緒に行う'],
        ep: ['痛くなくても毎日、足の裏・指の間を鏡で見ること（傷・赤み・水疱・靴ずれ）を説明し、実際に鏡で見てもらって確認する', '足に合った靴を選ぶこと、素足・湯たんぽなど熱いものを避けることを説明し、理由を自分の言葉で言ってもらう'] }),
      mgmt: c => /インスリン|糖尿病/.test(c.text || '') ? ({ goalLong: '退院までに、食事療法・インスリン・受診を続ける具体的な計画（昼食の選び方・注射の時間・受診日）を自分で立てて説明できる',
        goalShort: '5日後までに、インスリン注射を手順表を見ながら1人で正しく行え（単位合わせ・部位の変更）、1日の食事の組み合わせの例を2つ言える',
        tp: ['インスリン注射の手技を、手順表を使って毎日一緒に行い、できた点とできなかった点をその場で伝える', '栄養士の指導の日時を確認して同席し、指導の内容を患者さんの生活（外回りの昼食）に当てはめて一緒に整理する', '仕事に戻った後の1日の流れ（昼食・注射・測定）を一緒に書き出し、続けられそうな方法を選んでもらう'],
        ep: ['インスリンの打ち方（単位・部位をかえること・保管）を実演してもらい、間違いを一緒に確認する', '分割食の目的と進め方を、患者さんと妻にいっしょに説明し、翌日、自分の言葉で言ってもらう', '禁煙・節酒が血糖と足の血流に関係することを説明し、本人が続けられそうな目標を1つ決める'] })
        : ({ goalLong: '退院までに、1日の塩分の目安・毎日の体重測定の理由・内服を続ける方法を自分の言葉で説明できる',
        goalShort: '5日後までに、毎朝の体重測定を1人で行って記録でき、塩分の多い食品を3つ挙げられる',
        tp: ['体重測定の手順（排尿後・同じ時間・同じ服装）を一緒に行い、記録表に書く', '内服の管理方法（お薬カレンダー・1回分ずつの分包）を一緒に選ぶ', '食事の場面で、塩分の少ない選び方を一緒に確認する'],
        ep: ['体重が増えたとき・息苦しいときは受診することを説明し、自分の言葉で言ってもらう', '漬物・汁物などの塩分の多い食品を示し、減らし方を本人と一緒に決める'] }),
      fam: () => ({ goalLong: '退院までに、家族が患者の食事・服薬・症状が出たときの対応を、自分の言葉で説明できる',
        goalShort: '5日後までに、家族が低血糖の症状と対応（ブドウ糖を飲ませる・受診の目安）を自分の言葉で説明できる',
        tp: ['面会時に10分ほど時間をとり、困っていることを聞く', '栄養士の指導の日時を家族に伝え、同席できるよう調整する'],
        ep: ['低血糖の症状と対応（ブドウ糖を飲ませる・救急要請の目安）を家族に説明し、同じ内容を自分の言葉で言ってもらう', '献立は栄養士の指導で説明されるので、看護師は「飲酒の相談の仕方（責めずに本人の目標を一緒に決める）」と「仕事復帰後の昼食・注射の工夫」を一緒に考える'] }),
      anx: c => ({ goalLong: '退院までに、不安を感じたときに自分から看護師に話し、対処の方法を使える',
        goalShort: `3日後までに、${/低血糖/.test(c.text || '') ? '低血糖への心配' : '心配なこと'}を自分の言葉で看護師に話せ、夜は眠れたと言える`,
        tp: ['日勤・夜勤の看護師が1日1回、決まった時間に5分以上、気持ちを聞く時間をとる', ...(/低血糖/.test(c.text || '') ? ['低血糖が起きたときの対処の手順を一緒に紙に書き、枕元に置く'] : ['心配なことを一緒に紙に書き出し、答えられるものから説明する'])],
        ep: [/低血糖/.test(c.text || '') ? '不安なときは我慢せず、いつでも看護師を呼んでよいことを説明し、呼び方を言ってもらって確認する（対処手順の説明は「血糖不安定」の計画で行う）' : '不安なときは我慢せず看護師を呼んでよいことを説明し、呼び方を言ってもらって確認する'] }),
      resp: () => ({ goalLong: '退院までに、自分で痰を出せ、SpO2 95%以上を保って病棟内を歩ける',
        goalShort: '3日後までに、深呼吸と咳で痰を自分で出すことができ、SpO2 95%以上を保てる',
        tp: ['起きる・体位を変えるたびに、深呼吸を3回行ってから咳をするよう声をかけ、一緒に行う', '創部・胸を軽く手で支えて咳ができるよう、枕を渡して援助する', '食事の前後は上体を起こして過ごせるよう体位を整える'],
        ep: ['痰を出す理由（肺炎を防ぐ）と、咳のしかた（深呼吸→腹から咳）を説明し、実演してもらう'] }),
      fall: () => ({ goalLong: '入院中、転倒・転落が起こらず、トイレや移動のときは自分から看護師を呼べる',
        goalShort: '3日後までに、トイレに行くときは毎回ナースコールを押して看護師を呼べる',
        tp: ['ナースコールを手の届く位置に置き、ベッド周りの床・履物を整える', '夜間のトイレは、就寝前に誘導し、起きるときは見守って付き添う', 'ふらつきのある日は、歩行時に腕を支えて一緒に歩く'],
        ep: ['なぜ呼んでよいか（ふらつきで転ぶと骨折する）を説明し、ナースコールの押し方を実際に押してもらって確認する'] })
    };
    function cpModelFor(plan, ctx) {
      const d = cpDomainOf(plan);
      if (!d || !CP_MODELS[d.key]) return null;
      const m = CP_MODELS[d.key](ctx || {});
      const op = (d.op || []).slice(0, 5).map(([l]) => `${l}を観察する`);
      if (d.key === 'inf' && /糖尿病/.test((ctx && ctx.text) || '')) op.push('血糖値の推移（高血糖は傷が治りにくく、感染しやすい）を観察する');
      return { ...m, op };
    }
    function cpDomainOf(plan) {
      const head = String((plan && plan.problem) || '').normalize('NFKC');
      return CP_DOMAINS.find(d => d.re.test(head)) || null;
    }
    // 記録の中の、目標の例に使う値（いちばん新しいもの）
    function cpRecordContext(cp) {
      const items = ((cp && cp.items) || []).filter(i => i && i.text && i.type !== 'unnecessary');
      const text = [String((cp && cp.sourceText) || ''), ...items.map(i => i.text)].join('\n').normalize('NFKC');
      const last = (re) => { const all = [...text.matchAll(re)]; return all.length ? all[all.length - 1] : null; };
      const nrs = last(/NRS\s*[:：]?\s*(\d{1,2})(?!\d)/g);
      const spo2 = last(/SpO2\s*[:：]?\s*(\d{2,3})\s*%/g);
      const site = /創部痛|創痛|創部/.test(text) ? '創部痛' : /腰痛/.test(text) ? '腰痛' : '';
      const skin = (text.match(/(仙骨部|踵部?|大転子部|尾骨部)[^\n]{0,6}発赤/) || [])[1];
      return { nrs: nrs ? Number(nrs[1]) : null, spo2: spo2 ? Number(spo2[1]) : null, painSite: site, skin: skin ? `${skin}の発赤` : '',
        stoma: /ストーマ|ストマ|人工肛門/.test(text), urinary: /膀胱留置|バルーン|尿道カテーテル/.test(text), text };
    }
    // 目標の4つの要素（いつまでに・患者が・どうなる・何をもって達成と判断するか）
    const CP_GOAL_DEADLINE = /\d+\s*(?:日|週間?|時|か月|ヶ月|カ月)(?:後|間|目|以内|まで)?|本日|今日|明日|今週|退院(?:時|まで|後)|術後\s*\d+\s*日|離床まで|入院中|勤務終了|\d{1,2}\/\d{1,2}/;
    const CP_GOAL_MEASURE = /\d|NRS|VAS|SpO2|回|割|％|%|mL|kg|自立|できる|言える|話せる|説明でき|見られない|起こらず|起こらない|ない$|なく|がない|以内|以下|以上|未満/;
    const CP_GOAL_NURSE = /(?:させる|させない|を行う|行う$|を促す|を指導する|指導する|援助する|観察する|を図る|に努める|ケアする)/;
    const CP_GOAL_ABSTRACT = /(?:軽減|改善|安定|緩和|減少|増加|向上|保持|維持|解消|消失|安心|理解)(?:する|される|できる|が図れる|を図る|している)?。?$/;
    // 実習中（数日〜2週間）に評価できない期限：時刻・本日中・数時間後など
    const CP_GOAL_UNREALISTIC = /\d{1,2}\s*時(?:まで|に|頃)|本日(?:中|まで)|今日(?:中|まで)|今夜|当日中|\d+\s*時間(?:後|以内)|数時間/;
    const CP_GOAL_VAGUE_DEADLINE = /数日|数週間?|数か月|近日|近いうち|早期|早め|しばらく|なるべく早く|そのうち|入院中のどこか/;
    const CP_GOAL_VAGUE_VERB = /(?:理解|イメージ|意識|認識|把握|知識|関心|自覚)\s*(?:を持つ|を持てる|が持てる|を深める|が深まる|を得る|を高める|する|できる|している|できている)(?=[。\s]|$)|イメージを持/;
    const CP_GOAL_CONCRETE_ACT = /説明(?:でき|する|して)|実演|復唱|言える|話せる|述べ|挙げ|示せ|行える|自分で(?:測定|注射|交換|行)|\d+\s*(?:つ|項目|回|個)/;
    function cpGoalCheck(goal) {
      const g = String(goal || '').normalize('NFKC').trim();
      if (!g) return { empty: true, deadline: false, subject: false, change: false, measure: false, abstract: false, msgs: ['目標がまだ書かれていません。「いつまでに」「患者が」「どうなる」「何をもって達成と判断するか」を入れて書いてみましょう'] };
      const unrealistic = CP_GOAL_UNREALISTIC.test(g);
      const vagueDeadline = CP_GOAL_VAGUE_DEADLINE.test(g);
      const deadline = CP_GOAL_DEADLINE.test(g) && !vagueDeadline && !unrealistic;
      const nurse = CP_GOAL_NURSE.test(g);
      const measure = CP_GOAL_MEASURE.test(g.replace(CP_GOAL_DEADLINE, ''));
      const abstract = CP_GOAL_ABSTRACT.test(g) && !/\d/.test(g.replace(CP_GOAL_DEADLINE, ''));
      const change = g.length >= 6;
      // 「理解する」「イメージを持つ」だけで、何ができればよいかが書かれていない目標
      const vagueVerb = CP_GOAL_VAGUE_VERB.test(g) && !CP_GOAL_CONCRETE_ACT.test(g);
      const msgs = [];
      if (unrealistic) msgs.push(`「${(g.match(CP_GOAL_UNREALISTIC) || [''])[0]}」は、実習中に評価しにくい期限です。実習の日数で評価できる期限（例：2日後までに、実習最終日までに、退院までに）に直します`);
      if (vagueDeadline) msgs.push(`「${(g.match(CP_GOAL_VAGUE_DEADLINE) || [''])[0]}」では、いつ評価するのかがわかりません。日付・術後〇日目・退院までに、のように期限をはっきり書きます`);
      if (vagueVerb) msgs.push(`「${(g.match(CP_GOAL_VAGUE_VERB) || [''])[0]}」だけでは、できたかどうかを見て判断できません。「自分の言葉で〇〇を説明できる」「看護師の前で〇〇を実演できる」のように、観察できる行動で書きます`);
      if (abstract || (!deadline && !measure)) msgs.push('目標が抽象的です。いつまでに・どの程度まで改善するかを設定してみてください');
      if (!deadline && !vagueDeadline && !unrealistic) msgs.push('「いつまでに」がありません（例：2日後までに、実習最終日までに、退院までに）');
      if (nurse) msgs.push('看護師がすることの書き方になっています。目標は「患者が」どうなるかで書きます（看護師がすることはTPへ）');
      if ((!measure || abstract) && !vagueVerb) msgs.push('何をもって達成と判断するかがわかりません（例：NRS3以下、SpO2 95%以上、トイレまで歩ける、自分の言葉で説明できる）');
      return { empty: false, deadline, subject: !nurse, change, measure: measure && !abstract && !vagueVerb, abstract: abstract || vagueVerb, msgs };
    }
    // 計画の中で「1行が短く、いつ・どのように・どのくらいが書かれていない」TP（例：安楽な体位にする）
    const CP_TP_SPECIFIC = /\d|時|毎|ごと|前|後|まで|ように|方法|回|分|枕|クッション|側臥位|ファーラー|座位|〜|から|ずつ|一緒|見守|介助|声をかけ|確認し|調整|使い|使って/;
    // 観察・把握・確認だけのTPは、OP（観察計画）に書く内容
    const CP_TP_OBS = /(?:状況|状態|様子|程度|有無|変化|症状|反応|経過|値|量)(?:を|の)?(?:把握|観察|確認|測定|チェック)(?:する|します)?。?$|(?:を|の)(?:把握|観察|モニタリング|モニター|チェック)(?:する|します)?。?$/;
    function cpObservationLines(lines) { return (lines || []).filter(l => CP_TP_OBS.test(String(l).normalize('NFKC').trim())); }
    const CP_EP_VAGUE = /(?:方法|対応|注意点|必要性|重要性|内容|こと|仕方)(?:を|について)?(?:伝える|説明する|指導する|話す|教える)。?$/;
    const CP_EP_CHECK = /復唱|説明してもら|説明できる|実演|デモ|やってもら|言ってもら|話してもら|理解(?:度|を確認)|確認する|確認し|質問|チェックリスト|テスト|ティーチバック/;
    function cpVagueLines(lines) {
      return (lines || []).filter(l => { const t = String(l).normalize('NFKC'); return t.length < 16 && !CP_TP_SPECIFIC.test(t); });
    }
    // 関連図の同じ看護問題（名前が同じか、種類が同じ）と、そこへたどれる記録の事実（症状・検査・患者の情報）
    function cpMapProblemFor(cp, plan) {
      const map = typeof normalizeRelationMap === 'function' && cp && cp.relationMap ? normalizeRelationMap(cp.relationMap) : null;
      if (!map || !map.nodes) return null;
      const probs = map.nodes.filter(n => n.type === 'nursing_problem');
      const key = s => String(s || '').normalize('NFKC').replace(/[\s（）()]/g, '');
      const dom = cpDomainOf(plan);
      const node = probs.find(n => key(n.label) === key(plan.problem))
        || probs.find(n => key(n.label).includes(key(plan.problem)) || key(plan.problem).includes(key(n.label)))
        || (dom && probs.find(n => cpDomainOf({ problem: n.label }) === dom));
      if (!node) return null;
      return { node, evidence: cpMapEvidence(map, node) };
    }
    function cpMapEvidence(map, node) {
      const seen = new Set([node.id]);
      const stack = [node.id];
      while (stack.length) {
        const id = stack.pop();
        map.edges.forEach(e => { if (e.target === id && !seen.has(e.source)) { seen.add(e.source); stack.push(e.source); } });
      }
      // 疾患の成り立ちの背景（喫煙歴など、疾患より手前の情報）は、看護問題の根拠データには入れない
      const dz = new Set();
      const dstack = map.nodes.filter(n => n.type === 'disease').map(n => n.id);
      dstack.forEach(id => dz.add(id));
      while (dstack.length) { const id = dstack.pop(); map.edges.forEach(e => { if (e.target === id && !dz.has(e.source)) { dz.add(e.source); dstack.push(e.source); } }); }
      return map.nodes.filter(n => seen.has(n.id) && n.id !== node.id && !dz.has(n.id) && n.observed !== false && n.source !== 'knowledge'
        && !/^治療[:：]/.test(String(n.label)) && !map.nodes.some(d => d.type === 'disease' && String(d.label).slice(0, 10) === String(n.label).slice(0, 10)) && ['symptom', 'lab', 'patient_fact'].includes(n.type)).map(n => { const t = String(n.label); return /^[（(].*[)）]$/.test(t) ? t.slice(1, -1) : t; }).slice(0, 8);
    }
    // 根拠データの値（「NRS 6」「SpO2 92%」「WBC 12800」など）が、計画（目標・OP）の中で見る値になっているか
    function cpEvidenceKeys(evidence) {
      const keys = new Set();
      (evidence || []).forEach(t => {
        const s = String(t).normalize('NFKC');
        [['NRS', /NRS/], ['SpO2', /SpO2/], ['WBC', /WBC/], ['CRP', /CRP/], ['体温', /体温|℃/], ['血糖', /血糖|HbA1c/], ['Alb', /Alb/], ['体重', /体重/], ['浮腫', /浮腫|むくみ/],
          ['痰', /痰/], ['発赤', /発赤/], ['排便', /排便|便/], ['排ガス', /排ガス/], ['腹部膨満', /膨満/], ['むせ', /むせ/], ['麻痺', /麻痺|MMT/], ['睡眠', /眠/], ['Dダイマー', /ダイマー/], ['PT-INR', /INR/]]
          .forEach(([k, re]) => { if (re.test(s)) keys.add(k); });
      });
      return [...keys];
    }
    // 計画をチェックする（AIなし）。戻り値：{ domain, items:[{ key, label, level:'ok'|'warn'|'info', msgs:[] , add?:[] }], goalExample, evidence }
    function reviewCarePlan(cp, plan) {
      const p = normalizeCarePlan({ ...plan });
      const dom = cpDomainOf(p);
      const ctx = cpRecordContext(cp);
      const goal = p.goalShort || p.goalLong;
      const body = [p.goalShort, p.goalLong, ...p.op, ...p.tp, ...p.ep].join('\n').normalize('NFKC');
      const opText = p.op.join('\n').normalize('NFKC');
      const out = [];
      const push = (key, msgs, { level, ...extra } = {}) => out.push({ key, label: CP_REVIEW_ITEMS.find(i => i.key === key).label, level: msgs.length ? (level || 'warn') : 'ok', msgs, ...extra });
      // 1 看護問題との整合性
      const fit = [];
      if (!p.problem.trim()) fit.push('看護問題が書かれていません');
      else if (!dom) fit.push('看護問題の種類を読み取れませんでした（計画の内容が看護問題に合っているか、自分で確かめてください）');
      else if (body && !dom.words.test(body)) fit.push(`「${p.problem}」の計画ですが、目標・OP・TP・EPに、この問題に関係する言葉（${String(dom.words.source).split('|').slice(0, 4).join('・')}など）が見当たりません`);
      push('fit', fit, { level: !dom && p.problem.trim() ? 'info' : 'warn' });
      // 2 目標
      const gc = cpGoalCheck(goal);
      const goalExample = dom && dom.goal ? dom.goal(ctx) : '';
      const goalMsgs = [...gc.msgs];
      if (!String(p.goalLong || '').trim()) goalMsgs.push('長期目標が空欄です。退院時・退院後にどうなっていてほしいか（期限つき）を書き、短期目標はそこへ向かう途中の段階にします');
      push('goal', goalMsgs, { goal: gc, example: goalMsgs.length ? goalExample : '' });
      // 3 OPの不足
      const opMsgs = [], add = [];
      if (!p.op.length) opMsgs.push('OP（観察計画）がまだありません');
      if (dom && dom.op) {
        const miss = dom.op.filter(([, re]) => !re.test(opText)).map(([l]) => l);
        if (miss.length) { opMsgs.push(`${p.problem || 'この'}の計画ですが、OPに「${miss.join('」「')}」が不足していないか確認してください`); add.push(...miss); }
      }
      const vagueVital = p.op.filter(l => /^(?:バイタル(?:サイン)?(?:を|の)?(?:観察|測定|確認)(?:する)?|全身状態(?:を|の)?観察(?:する)?)$/.test(String(l).normalize('NFKC').replace(/[。\s]/g, '')));
      if (vagueVital.length) opMsgs.push(`「${vagueVital[0]}」だけでは、何を何のために見るのかがわかりません。見る値と、どうなったら報告するか（例：体温38℃以上・SpO2 93%以下で報告）を書いてみましょう`);
      push('op', opMsgs, { add });
      // 4 TPの具体性
      const tpMsgs = [];
      if (!p.tp.length) tpMsgs.push('TP（援助計画）がまだありません');
      cpVagueLines(p.tp).forEach(l => tpMsgs.push(`「${l}」：いつ・どのように・どのくらい行うかを書いてみましょう（例：${/体位/.test(l) ? '創部を圧迫しないよう、枕を使って膝を軽く曲げた側臥位にする。2時間ごとに体位を変える' : /清拭|清潔/.test(l) ? '午前中の鎮痛薬が効いている時間に、背部・下肢の清拭を介助する' : /歩行|離床|リハビリ/.test(l) ? '鎮痛薬を使って30分後に、看護師が付き添って病棟の廊下を1往復歩く' : '誰が・いつ・何を使って・どこまで行うか'}）`));
      const obsTp = cpObservationLines(p.tp);
      obsTp.forEach(l => tpMsgs.push(`「${l}」は観察・把握なので、TPではなくOP（観察計画）に書きます。TPには、看護師が実施する援助（例：一緒に手技を行う、体位を整える、介助する）を書きます`));
      push('tp', tpMsgs, { moveToOp: obsTp });
      // 5 EPの適切さ
      const epMsgs = [];
      if (!p.ep.length) epMsgs.push('EP（教育計画）がまだありません。患者・家族に何を伝え、何ができるようになってほしいかを書いてみましょう');
      p.ep.filter(l => /説明する|指導する|伝える/.test(l) && String(l).length < 14).forEach(l => epMsgs.push(`「${l}」：何を説明するのか（内容）を書いてみましょう`));
      if (dom && dom.key === 'pain' && p.ep.length && !/我慢|伝え|知らせ|ナースコール/.test(p.ep.join(''))) epMsgs.push('痛みを我慢せずに伝えてよいこと（伝え方）がEPに入っているか確認してください');
      if (dom && ['fall', 'bleed', 'glu'].includes(dom.key) && p.ep.length && !/ナースコール|伝え|知らせ|呼/.test(p.ep.join(''))) epMsgs.push('危ないとき・症状が出たときに、看護師をどう呼ぶか（伝えるか）がEPに入っているか確認してください');
      p.ep.filter(l => CP_EP_VAGUE.test(String(l).normalize('NFKC').trim()) && String(l).length < 24 && !/[：:（(、]/.test(l)).forEach(l => epMsgs.push(`「${l}」：何を説明するのか（具体的な内容。例：症状・そのときの行動・連絡の仕方）と、理解をどう確認するか（自分の言葉で説明してもらう・実演してもらう）まで書いてみましょう`));
      if (p.ep.length && !CP_EP_CHECK.test(p.ep.join('\n').normalize('NFKC'))) epMsgs.push('理解をどう確認するか（例：自分の言葉で説明してもらう、実演してもらう、パンフレットを見ながら質問を聞く）がEPに入っていません');
      push('ep', epMsgs);
      // 6 患者の個別性（記録にある値・言葉・治療が計画に入っているか）
      const indMsgs = [];
      const specific = [/\d/, /創部|仙骨部|下肢|右|左/, ctx.stoma ? /ストーマ|パウチ/ : null, /「[^」]+」/].filter(Boolean);
      const own = (typeof findDrugsInText === 'function' ? findDrugsInText(ctx.text).map(x => x.drug && x.drug.name).filter(Boolean) : []).filter(nm => body.includes(nm));
      if (body.trim() && !own.length && !specific.some(re => re.test(body))) indMsgs.push('この患者の記録にある値・言葉・治療（NRSの値、部位、使っている薬、本人の言葉など）が計画に入っていません。どの患者にも当てはまる計画になっていないか確認してください');
      push('individual', indMsgs);
      // 7 根拠データとの一致（関連図の同じ看護問題へたどれる記録の事実）
      const mp = cpMapProblemFor(cp, p);
      const evidence = (p.evidence && p.evidence.length ? p.evidence : (mp ? mp.evidence : []));
      const evMsgs = [];
      if (!evidence.length) push('evidence', ['関連図にこの看護問題が無いため、根拠データと照らし合わせられません（関連図を作るか、根拠を自分で確かめてください）'], { level: 'info' });
      else {
        const keys = cpEvidenceKeys(evidence).filter(k => !new RegExp(k === '体温' ? '体温|℃|熱' : k === '排便' ? '排便|便' : k.replace(/[-]/g, '.?'), 'i').test(body));
        if (keys.length) evMsgs.push(`根拠データの「${keys.join('」「')}」が、目標・OPで見る値になっていません（根拠になった値の変化を追えるようにしましょう）`);
        // 目標の中のいちばん後ろのNRS（「NRS5からNRS3以下」なら3）を、目指す値とする
        const goalNrs = [...String(goal || '').normalize('NFKC').matchAll(/NRS\s*(\d+)/g)].map(m => Number(m[1])).pop();
        if (dom && dom.key === 'pain' && ctx.nrs != null && goalNrs != null && goalNrs >= ctx.nrs) evMsgs.push(`目標のNRSが、今の記録（NRS${ctx.nrs}）より下がっていません`);
        push('evidence', evMsgs, { evidence });
      }
      return { domain: dom ? dom.key : null, items: out, goalExample, evidence, model: cpModelFor(p, ctx) };
    }
    function cpReviewCount(review) { return review.items.filter(i => i.level === 'warn').length; }

    // ---- 関連図の看護問題を看護計画へ引き継ぐ ----
    function importCarePlansFromMap(cp, now = new Date().toISOString()) {
      const map = typeof normalizeRelationMap === 'function' && cp.relationMap ? normalizeRelationMap(cp.relationMap) : null;
      if (!map) return [];
      const existing = new Set(carePlanList(cp).map(p => p.problem.replace(/\s+/g, '')));
      const fresh = [];
      map.nodes.filter(n => n.type === 'nursing_problem').sort((a, b) => (a.priority || 99) - (b.priority || 99)).forEach(n => {
        const problem = String(n.label).replace(/（候補）$/, '').trim();
        const key = problem.replace(/\s+/g, '');
        if (!key || existing.has(key)) return;
        existing.add(key);
        const plan = createCarePlan(cp, { problem, evidence: cpMapEvidence(map, n), note: n.note || '', source: 'map', reasonNeeded: true }, now);
        plan.relatedNeeds = guessPlanNeeds(plan);
        fresh.push(plan);
      });
      return fresh;
    }
    window.importCarePlansFromMapUI = function() {
      const cp = getCurrentPatient();
      if (!cp.relationMap) return showToast('関連図がまだありません。「関連図」のページで作ってから取り込んでください', 'warn', 6000);
      const fresh = importCarePlansFromMap(cp);
      if (!fresh.length) return showToast('関連図の看護問題は、すべて看護計画にあります', 'info');
      fresh.forEach(p => carePlanOpen.add(p.id));
      commitCarePlanChange(cp);
      showToast(`関連図から看護問題を${fresh.length}件取り込みました（根拠データつき）。目標・OP/TP/EPはこの患者に合わせて書きましょう`, 'success', 6000);
    };

    // ---- 学習の支え：AIの案・関連図から取り込んだ計画・提案は「この患者に必要な理由」を書いてから使う ----
    async function askCareReason(title, suggestion) {
      const v = await openDialog({ title, message: `${suggestion ? `提案：${suggestion}\n\n` : ''}この患者に必要な理由を、記録のデータ（値・言葉・状態）を使って書いてください。書くと計画に入ります。`, inputValue: '', placeholder: '例：術後1日目で創部痛NRS6、痛みで深呼吸できていないため', confirmLabel: '理由を書いて使う' });
      if (v === null || v === undefined) return null;
      const t = String(v).trim();
      if (t.length < 6) { showToast('理由を、記録のデータを使って書いてください（短すぎます）', 'warn'); return null; }
      return t;
    }
    function addCareReason(p, text, about, now = new Date().toISOString()) {
      p.reasons = [...(Array.isArray(p.reasons) ? p.reasons : []), { text, about: about || '', at: now }].slice(-30);
      p.reasonNeeded = false;
      p.updatedAt = now;
    }
    window.writeCareReasonUI = async function(id) {
      const cp = getCurrentPatient();
      const p = getCarePlan(cp, id);
      if (!p) return;
      const t = await askCareReason(`「${p.problem || '（無題）'}」がこの患者に必要な理由`, '');
      if (!t) return;
      addCareReason(p, t, 'この看護問題');
      commitCarePlanChange(cp);
    };
    // チェックの提案を使う：目標の例（自分で直してから入れる）・OPの不足（理由を書いてから足す）
    window.useGoalExampleUI = async function(id) {
      const cp = getCurrentPatient();
      const p = getCarePlan(cp, id);
      if (!p) return;
      const r = reviewCarePlan(cp, p);
      const ex = (r.items.find(i => i.key === 'goal') || {}).example || r.goalExample;
      const v = await openDialog({ title: '短期目標を書き直す', message: '例は、この患者の記録の値を使った「書き方の見本」です。そのまま使わず、期限・数値・患者の状態をこの患者に合わせて直してください。\n「いつまでに」「患者が」「どうなる」「何をもって達成と判断するか」', inputValue: ex, placeholder: '例：2日後までに、安静時の創部痛がNRS5からNRS3以下となり、苦痛なく休息できる', confirmLabel: '短期目標にする' });
      if (v === null || v === undefined || !String(v).trim()) return;
      if (String(v).trim() === ex) {
        const ok = await openDialog({ title: '例のままですが、よいですか？', message: '期限や数値が、この患者に合っているか確かめましたか？（例のまま使うときは、理由を書きます）', confirmLabel: '理由を書いて使う', secondaryLabel: '直す' });
        if (ok !== true) return;
        const why = await askCareReason('この目標にした理由', ex);
        if (!why) return;
        addCareReason(p, why, '短期目標');
      }
      updateCarePlan(cp, id, { goalShort: String(v).trim() });
      commitCarePlanChange(cp);
      showToast('短期目標を書き直しました', 'success');
    };
    window.addMissingOpUI = async function(id, idx) {
      const cp = getCurrentPatient();
      const p = getCarePlan(cp, id);
      if (!p) return;
      const r = reviewCarePlan(cp, p);
      const label = ((r.items.find(i => i.key === 'op') || {}).add || [])[idx];
      if (!label) return;
      const why = await askCareReason('OPに足す理由', `${label}を観察する`);
      if (!why) return;
      updateCarePlan(cp, id, { op: [...p.op, `${label}を観察する`] });
      addCareReason(p, why, `OP：${label}`);
      commitCarePlanChange(cp);
    };

    // 手本を、空欄のところだけ入れる（書いてある所は変えない）。入れたあとは「この患者に必要な理由」を書いてもらう
    window.applyCareModelUI = function(id) {
      const cp = getCurrentPatient();
      const p = getCarePlan(cp, id);
      if (!p) return;
      const m = reviewCarePlan(cp, p).model;
      if (!m) return;
      const patch = {};
      if (!String(p.goalLong || '').trim()) patch.goalLong = m.goalLong;
      if (!String(p.goalShort || '').trim()) patch.goalShort = m.goalShort;
      ['op', 'tp', 'ep'].forEach(k => { if (!p[k].length && m[k] && m[k].length) patch[k] = [...m[k]]; });
      if (!Object.keys(patch).length) return showToast('空欄がないので、手本は入れませんでした（書いてある内容はそのままです）', 'info');
      updateCarePlan(cp, id, { ...patch, reasonNeeded: true });
      commitCarePlanChange(cp);
      showToast('手本を空欄に入れました。この患者に合うか確かめて、直してください', 'success');
    };
    window.moveTpToOpUI = function(id, idx) {
      const cp = getCurrentPatient();
      const p = getCarePlan(cp, id);
      if (!p) return;
      const line = cpObservationLines(p.tp)[idx];
      if (!line) return;
      updateCarePlan(cp, id, { tp: p.tp.filter(l => l !== line), op: p.op.includes(line) ? p.op : [...p.op, line] });
      commitCarePlanChange(cp);
    };

    // ---- 評価の表示（計画のカードの中。開いた計画だけ） ----
    const carePlanReviewOpen = new Set();
    window.toggleCarePlanReview = function(id) {
      if (carePlanReviewOpen.has(id)) carePlanReviewOpen.delete(id); else carePlanReviewOpen.add(id);
      renderCarePlans();
    };
    function cpModelBlockHtml(m, title) {
      if (!m) return '';
      const list = (label, arr) => arr && arr.length ? `<div><b>${label}</b><ul>${arr.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul></div>` : '';
      const one = (label, t) => t ? `<div><b>${label}</b><p>${escapeHtml(t)}</p></div>` : '';
      return `<div class="cpr-model"><span><i class="fa-solid fa-book-open"></i> ${title}<small>この患者の記録を使った例です。そのまま写さず、この患者に合わせて直して使います</small></span>${one('長期目標', m.goalLong)}${one('短期目標', m.goalShort)}${list('OP（観察）', m.op)}${list('TP（援助）', m.tp)}${list('EP（教育）', m.ep)}</div>`;
    }
    function carePlanReviewHtml(cp, p) {
      const pid = safeDomId(p.id);
      const r = reviewCarePlan(cp, p);
      const icon = l => l === 'ok' ? '<i class="fa-solid fa-circle-check"></i>' : l === 'info' ? '<i class="fa-solid fa-circle-info"></i>' : '<i class="fa-solid fa-triangle-exclamation"></i>';
      const rows = r.items.map(it => {
        let extra = '';
        if (it.key === 'goal' && it.goal && !it.goal.empty) {
          const dot = (ok, l) => `<span class="cpr-dot${ok ? ' ok' : ''}">${ok ? '✓' : '—'} ${l}</span>`;
          extra += `<div class="cpr-goal4">${dot(it.goal.deadline, 'いつまでに')}${dot(it.goal.subject, '患者が')}${dot(it.goal.change, 'どうなる')}${dot(it.goal.measure, '達成の判断')}</div>`;
        }
        if (it.key === 'goal' && it.example) extra += `<div class="cpr-ex"><span>この患者の記録を使った目標の例</span><p>${escapeHtml(it.example)}</p><button type="button" class="my-asm-link" onclick="useGoalExampleUI('${pid}')"><i class="fa-solid fa-pen"></i> 例を見ながら書き直す</button></div>`;
        if (it.key === 'op' && it.add && it.add.length) extra += `<div class="cpr-adds">${it.add.map((a, k) => `<button type="button" class="cpr-add" onclick="addMissingOpUI('${pid}', ${k})" title="理由を書いてからOPに足します"><i class="fa-solid fa-plus"></i> ${escapeHtml(a)}</button>`).join('')}</div>`;
        if (it.key === 'tp' && it.moveToOp && it.moveToOp.length) extra += `<div class="cpr-adds">${it.moveToOp.map((a, k) => `<button type="button" class="cpr-add" onclick="moveTpToOpUI('${pid}', ${k})" title="このTPをOP（観察計画）へ移します"><i class="fa-solid fa-arrow-right-arrow-left"></i> OPへ移す：${escapeHtml(String(a).slice(0, 24))}</button>`).join('')}</div>`;
        if (it.key === 'evidence' && it.evidence && it.evidence.length) extra += `<div class="cpr-ev">${it.evidence.map(e => `<span>${escapeHtml(e)}</span>`).join('')}</div>`;
        return `<li class="cpr-item cpr-${it.level}"><div class="cpr-head">${icon(it.level)} <b>${escapeHtml(it.label)}</b>${it.level === 'ok' ? '<span class="cpr-okt">問題なし</span>' : ''}</div>${it.msgs.map(m => `<p>${escapeHtml(m)}</p>`).join('')}${extra}</li>`;
      }).join('');
      const ai = p.aiReview && Array.isArray(p.aiReview.items) ? p.aiReview : null;
      const aiHtml = ai ? `<div class="cpr-ai"><div class="cpr-ai-head"><i class="fa-solid fa-wand-magic-sparkles"></i> AIの評価（${escapeHtml(formatMyDateTime(ai.at))}）<span class="my-asm-muted">AIの評価は参考です。採り入れるときは、この患者に必要な理由を確かめてください</span></div>
        <ul class="cpr-list">${ai.items.map(it => `<li class="cpr-item cpr-${it.level === 'ok' ? 'ok' : 'warn'}"><div class="cpr-head">${icon(it.level === 'ok' ? 'ok' : 'warn')} <b>${escapeHtml(it.label)}</b></div>${it.comment ? `<p>${escapeHtml(it.comment)}</p>` : ''}${it.suggestion ? `<p class="cpr-sugg">提案：${escapeHtml(it.suggestion)}</p>` : ''}</li>`).join('')}</ul>
        ${ai.goal ? `<div class="cpr-ex"><span>AIの目標の案</span><p>${escapeHtml(ai.goal)}</p></div>` : ''}
        ${cpModelBlockHtml(ai.model, 'AIの手本')}
        ${ai.questions && ai.questions.length ? `<div class="cpr-q"><span><i class="fa-solid fa-graduation-cap"></i> この患者に必要な理由の手本（自分の言葉に直して書く）</span><ul>${ai.questions.map(q => `<li>${escapeHtml(q)}</li>`).join('')}</ul><button type="button" class="my-asm-link" onclick="writeCareReasonUI('${pid}')"><i class="fa-solid fa-pen"></i> 理由を書く</button></div>` : ''}</div>` : '';
      const modelHtml = r.model ? cpModelBlockHtml(r.model, 'この看護問題の手本') + `<button type="button" class="my-asm-link" onclick="applyCareModelUI('${pid}')"><i class="fa-solid fa-wand-magic-sparkles"></i> 手本を空欄に入れる（書いてある所はそのまま）</button>` : '';
      return `<div class="cpr" id="cpr-${pid}"><div class="cpr-title"><i class="fa-solid fa-clipboard-list"></i> 計画のチェック（AIなし）<span class="my-asm-muted">要確認 ${cpReviewCount(r)}件</span></div><ul class="cpr-list">${rows}</ul>${modelHtml}${aiHtml}</div>`;
    }

    // ---- AIで看護計画を評価 ----
    // この計画以外の計画の要約（個別の評価で、別の計画に書かれた内容を見落とさないため）
    function cpOtherPlansBrief(cp, exceptId) {
      const others = carePlanList(cp).filter(o => o.id !== exceptId);
      if (!others.length) return '（なし）';
      const cut = (arr, n) => (arr || []).slice(0, n).map(t => String(t).slice(0, 70)).join(' / ');
      return others.map(o => `■${o.problem || '（無題）'}\n  短期目標：${String(o.goalShort || '（なし）').slice(0, 80)}\n  TP：${cut(o.tp, 6) || '（なし）'}\n  EP：${cut(o.ep, 6) || '（なし）'}`).join('\n');
    }
    function buildCarePlanReviewPrompt(cp, p) {
      const r = reviewCarePlan(cp, p);
      const items = ((cp.items || []).filter(i => i && i.text && i.type !== 'unnecessary')).slice(-60).map(i => `[${i.type === 's' ? 'S' : 'O'}] ${String(i.text).slice(0, 90)}`).join('\n');
      const plan = [`看護問題：${p.problem || '（無題）'}`, `長期目標：${p.goalLong || '（なし）'}`, `短期目標：${p.goalShort || '（なし）'}`,
        ...CARE_PLAN_SECTIONS.map(s => `${s.label}：\n${p[s.key].map((t, k) => `  ${s.short}${k + 1}. ${t}`).join('\n') || '  （なし）'}`)].join('\n');
      return `あなたは看護教員です。看護学生が書いた看護計画を、次の7項目で評価してください。答えは学生が自分で考えて直せるように、具体的な書き直しの方向を示します（完成した計画を丸ごと書き換えない）。
${typeof AI_ACCURACY_RULES === 'string' ? AI_ACCURACY_RULES : ''}
【評価の7項目（keyと見ること）】
fit 看護問題との整合性：目標・OP・TP・EPがこの看護問題を解決する内容か
goal 目標の具体性・評価可能性：「いつまでに」「患者が」「どうなる」「何をもって達成と判断するか」が入っているか。抽象的なら（例：疼痛が軽減する）、記録の値を使った評価できる目標の例（例：2日後までに、安静時の創部痛がNRS5からNRS3以下となり、苦痛なく休息できる）。期限は実習中（数日〜2週間）に評価できる範囲にし、『○時までに』『本日中に』『数時間後』は使わない
op OPの不足：この看護問題で観察すべき項目が抜けていないか（例：疼痛ならNRS・部位・性質・持続時間・体動との関連・鎮痛薬使用後の変化）
tp TPの具体性：いつ・どのように・どのくらい行うかが書かれているか
ep EPの適切さ：患者・家族に何を伝え、何ができるようになるかが書かれているか
individual 患者の個別性：この患者の値・言葉・治療・生活に合わせた計画か
evidence 根拠データとの一致：下の根拠データと目標・OPが合っているか
【形】JSONだけを返す：{"items":[{"key":"fit","ok":true,"comment":"評価（60字以内）","suggestion":"直す方向（60字以内。良ければ空）"}],"goal":"評価できる短期目標の例（この患者の記録の値を使う。80字以内）","reasons":["この患者にこの計画が必要な理由の手本（3つ。『〜という記録があるので、〜のために〜が必要』の形。各60字以内）"],"model":{"goalLong":"長期目標の手本（期限つき）","goalShort":"短期目標の手本","tp":["看護師が実施する援助の手本（3つ。いつ・どのように）"],"ep":["何を説明し、理解をどう確認するかまで書いた教育の手本（2つ）"]}}
itemsは7項目すべて、上の順で。
【手本を示す】学生に問いかけて考えさせるだけで終わらず、suggestion・reasons・modelには、そのまま参考にできる具体的な文を書く。期限は実習中（数日〜2週間）に評価できる範囲にし、『○時までに』『本日中に』『数時間後』は使わない。

【評価するときの約束（誤った指摘をしない）】
・計画の種類を区別する。「予定された指導・検査の確認」（例：明日の栄養士の指導を確認する・同席する）は、未来の予定でも正しい計画で、「未来だから不適切」と指摘しない。確認する内容（いつ・誰が・何を）が書かれているかだけを見る。
・「予防」の計画（例：低血糖・転倒・感染の予防教育）は、発症を前提にした計画ではない。「すでに起きている」と読んで指摘しない。起きていない問題の予防か、すでに起きている問題への対応かを区別して評価する。
・その看護問題の計画に書かれていない内容でも、下の「他の看護計画」に書かれていれば不足とは指摘しない（例：家族への指導、仕事への配慮が別の計画にある）。他の計画との重複・分担は「提案」で触れる。
・OPには観察・把握、TPには看護師が実施する援助を書く。観察の内容がTPに書かれていたら、OPへ移すよう提案する。
・目標が「数日後」のような曖昧な期限、「理解する」「イメージを持つ」のような観察できない行動なら、期限と達成条件（説明できる・実演できる）を示す。

【看護計画】
${plan}

【他の看護計画（この計画以外。参考）】
${cpOtherPlansBrief(cp, p.id)}

【根拠データ（関連図の同じ看護問題へたどれる記録の事実）】
${r.evidence.length ? r.evidence.map(e => `・${e}`).join('\n') : '（なし）'}

【AIなしのチェックで出た指摘（参考）】
${r.items.filter(i => i.level === 'warn').map(i => `・${i.label}：${i.msgs.join(' / ')}`).join('\n') || '（なし）'}

【記録（[S/O] 本文）】
${items}`;
    }
    function parseCarePlanReview(text) {
      const obj = typeof parseAiJsonLoose === 'function' ? parseAiJsonLoose(text) : (() => { try { return JSON.parse(text); } catch (e) { return null; } })();
      if (!obj || typeof obj !== 'object') return null;
      const raw = Array.isArray(obj.items) ? obj.items : [];
      const items = CP_REVIEW_ITEMS.map(def => {
        const x = raw.find(r => r && r.key === def.key) || null;
        if (!x) return null;
        const ok = x.ok === true || x.ok === 'true' || x.ok === 1;
        return { key: def.key, label: def.label, level: ok ? 'ok' : 'warn', comment: String(x.comment || '').slice(0, 200), suggestion: ok ? '' : String(x.suggestion || '').slice(0, 200) };
      }).filter(Boolean);
      if (!items.length) return null;
      return { items, goal: String(obj.goal || '').slice(0, 200), questions: (Array.isArray(obj.reasons) ? obj.reasons : (Array.isArray(obj.questions) ? obj.questions : [])).map(q => String(q || '').slice(0, 140)).filter(Boolean).slice(0, 5),
        model: obj.model && typeof obj.model === 'object' ? { goalLong: String(obj.model.goalLong || '').slice(0, 200), goalShort: String(obj.model.goalShort || '').slice(0, 200), tp: (Array.isArray(obj.model.tp) ? obj.model.tp : []).map(t => String(t || '').slice(0, 160)).filter(Boolean).slice(0, 5), ep: (Array.isArray(obj.model.ep) ? obj.model.ep : []).map(t => String(t || '').slice(0, 200)).filter(Boolean).slice(0, 4) } : null };
    }
    // ---- 全計画をまとめて評価（計画どうしの重複・補完・不足） ----
    const CP_SET_TOPICS = [
      ['分割食', /分割食/], ['栄養士の指導・食事療法', /栄養士|栄養指導|食事療法|カロリー制限|エネルギー/], ['低血糖の対応', /低血糖|ブドウ糖/],
      ['インスリン手技', /インスリン|自己注射/], ['血糖測定', /血糖測定|SMBG|血糖値/], ['フットケア', /フットケア|足の観察|足趾/],
      ['ナースコール・症状の伝え方', /ナースコール|症状.{0,6}伝え|知らせ/], ['服薬の指導', /服薬|内服/], ['転倒予防', /転倒|転落/], ['感染予防（手洗い・清潔）', /手洗い|手指衛生|清潔|感染予防/]
    ];
    function cpBigrams(t) { const s = String(t).normalize('NFKC').replace(/[\s。、，,.・]/g, ''); const set = new Set(); for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2)); return set; }
    function cpSimilar(a, b) {
      const x = cpBigrams(a), y = cpBigrams(b);
      if (x.size < 6 || y.size < 6) return false;
      let inter = 0; x.forEach(g => { if (y.has(g)) inter++; });
      return inter / (x.size + y.size - inter) >= 0.6;
    }
    // AIなしの全体チェック。戻り値：{ dups:[{title,msg}], overlaps:[], gaps:[], covered:[] }
    function reviewCarePlanSet(cp) {
      const plans = carePlanList(cp).map(p => normalizeCarePlan({ ...p }));
      const out = { dups: [], overlaps: [], gaps: [], covered: [] };
      if (plans.length < 2) return out;
      const name = p => `「${p.problem || '無題'}」`;
      const act = p => [p.goalShort, p.goalLong, ...p.tp, ...p.ep].join('\n').normalize('NFKC');
      // 同じ説明（EP）が、同じ相手（患者／家族）に向けて複数の計画に入っている。TPは計画ごとの役割があるので見ない。
      // 家族への説明と患者への説明は、相手が違うので重複としない。ナースコール・手洗いのような共通の説明も見ない
      const epOf = (p, fam) => p.ep.filter(l => !!/家族|妻|夫|娘|息子/.test(l) === fam).join('\n').normalize('NFKC');
      CP_SET_TOPICS.filter(([label]) => !/ナースコール|感染予防|服薬|転倒/.test(label)).forEach(([label, re]) => {
        [false, true].forEach(fam => {
          const hit = plans.filter(p => re.test(epOf(p, fam)));
          if (hit.length >= 2) out.dups.push({ title: label, msg: `「${label}」の${fam ? '家族への' : ''}説明が${hit.map(name).join('と')}の教育計画（EP）に書かれています。同じ説明・理解確認を2回書かず、片方にまとめるか、問題ごとに目的（何を解決するか）と達成条件を分けましょう` });
        });
      });
      // ほとんど同じ文が別の計画にある
      const seen = new Set();
      for (let i = 0; i < plans.length; i++) for (let j = i + 1; j < plans.length; j++) {
        ['tp', 'ep'].forEach(k => plans[i][k].forEach(a => plans[j][k].forEach(b => {
          const key = `${i}-${j}-${a}`;
          if (!seen.has(key) && cpSimilar(a, b)) { seen.add(key); out.dups.push({ title: '似た文', msg: `${name(plans[i])}と${name(plans[j])}に、ほぼ同じ${k.toUpperCase()}があります：「${String(a).slice(0, 40)}」` }); }
        })));
      }
      // 同じ種類の看護問題が並んでいる
      const byDom = {};
      plans.forEach(p => { const d = cpDomainOf(p); if (d) (byDom[d.key] = byDom[d.key] || []).push(p); });
      Object.values(byDom).filter(a => a.length >= 2).forEach(a => out.overlaps.push({ title: '同じ種類の問題', msg: `${a.map(name).join('と')}は同じ種類の問題です。別の問題として残すなら、目的と達成条件を分けましょう` }));
      // 記録にあるのに、どの計画にも入っていないこと（家族・仕事）／入っている計画
      const ctxText = cpRecordContext(cp).text;
      [['家族への指導・支援', /キーパーソン|妻|夫|家族|娘|息子/, /家族|妻|夫|娘|息子|キーパーソン/], ['仕事・生活への配慮', /仕事|勤務|職場|通勤|復職/, /仕事|勤務|職場|通勤|復職/]].forEach(([label, recRe, planRe]) => {
        if (!recRe.test(ctxText)) return;
        const hit = plans.filter(p => planRe.test(act(p)));
        if (hit.length) out.covered.push({ title: label, msg: `${label}は${hit.map(name).join('・')}に書かれています（1つの計画に無くても、全体では入っています）` });
        else out.gaps.push({ title: label, msg: `記録に出てくる${label}が、どの計画にも書かれていません` });
      });
      return out;
    }
    function buildAllCarePlansReviewPrompt(cp) {
      const items = ((cp.items || []).filter(i => i && i.text && i.type !== 'unnecessary')).slice(-60).map(i => `[${i.type === 's' ? 'S' : 'O'}] ${String(i.text).slice(0, 90)}`).join('\n');
      const local = reviewCarePlanSet(cp);
      const loc = [...local.dups, ...local.overlaps, ...local.gaps].map(x => `・${x.msg}`).join('\n') || '（なし）';
      return `あなたは看護教員です。看護学生が立てた看護計画の全体（すべての看護問題の計画）を、まとめて評価してください。1つの計画だけを見ると、別の計画に書かれた内容を見落とします。必ず全部の計画を横断して見てください。
${typeof AI_ACCURACY_RULES === 'string' ? AI_ACCURACY_RULES : ''}
【見ること】
1 重複：同じ説明・指導・観察が複数の計画に書かれていないか。重複があれば、どの計画に残し、もう片方はどうするか（目的と達成条件を分ける／一方に統合する）を示す。
2 補完：ある計画に足りなく見える内容が、別の計画に書かれていないか（例：家族への指導、仕事への配慮、栄養士の指導）。別の計画にあるものは「不足」とせず、補完されていると書く。
3 不足：全体を通しても書かれていない大事なこと（記録の問題・リスクに対して、観察・援助・教育のどれが無いか）。
4 優先順位：看護問題の順番が、記録の状態（急ぎ・安全・本人の希望）に合っているか。
【評価するときの約束（誤った指摘をしない）】
・「予定された指導・検査の確認」（例：栄養士の指導の予定を確認する）は、未来の予定でも正しい計画。「未来だから不適切」と言わない。
・「予防」の計画は、発症を前提にした計画ではない。予防・予定の確認・すでに起きている問題への対応を区別する。
・OPは観察、TPは看護師が実施する援助。観察がTPに書かれていたら移すよう示す。
【形】JSONだけを返す：{"summary":"全体の評価（100字以内）","duplicates":[{"title":"話題","comment":"どの計画とどの計画で重なるか（80字以内）","suggestion":"直す方向（80字以内）"}],"complements":[{"title":"話題","comment":"どの計画のどこが補っているか（80字以内）"}],"gaps":[{"title":"話題","comment":"何が書かれていないか（80字以内）","suggestion":"どの計画に何を足すか（80字以内）"}],"priority":"優先順位についての一言（60字以内。問題なければ空）"}
各配列は、無ければ空配列。

【全ての看護計画】
${buildCarePlansText(cp, { withRecords: false })}

【AIなしのチェックで出た指摘（参考）】
${loc}

【記録（[S/O] 本文）】
${items}`;
    }
    function parseAllCarePlansReview(text) {
      const obj = typeof parseAiJsonLoose === 'function' ? parseAiJsonLoose(text) : (() => { try { return JSON.parse(text); } catch (e) { return null; } })();
      if (!obj || typeof obj !== 'object') return null;
      const list = a => (Array.isArray(a) ? a : []).filter(x => x && typeof x === 'object').map(x => ({ title: String(x.title || '').slice(0, 60), comment: String(x.comment || '').slice(0, 200), suggestion: String(x.suggestion || '').slice(0, 200) })).filter(x => x.title || x.comment).slice(0, 8);
      const res = { summary: String(obj.summary || '').slice(0, 300), duplicates: list(obj.duplicates), complements: list(obj.complements), gaps: list(obj.gaps), priority: String(obj.priority || '').slice(0, 200) };
      return res.summary || res.duplicates.length || res.complements.length || res.gaps.length ? res : null;
    }
    // 全体の評価の表示（計画の一覧の上）。AIの結果はこの画面を開いている間だけ覚える
    const carePlanSetState = { open: false, ai: {}, running: false };
    function carePlanSetReviewHtml(cp) {
      if (!carePlanSetState.open) return '';
      const local = reviewCarePlanSet(cp);
      const group = (title, icon, cls, arr) => arr.length ? `<div class="cps-group ${cls}"><b><i class="fa-solid ${icon}"></i> ${title}</b><ul>${arr.map(x => `<li>${escapeHtml(x.msg || [x.title ? `${x.title}：` : '', x.comment || ''].join(''))}${x.suggestion ? `<span class="cpr-sugg">提案：${escapeHtml(x.suggestion)}</span>` : ''}</li>`).join('')}</ul></div>` : '';
      const n = carePlanList(cp).length;
      let h = `<div class="cps"><div class="cpr-title"><i class="fa-solid fa-layer-group"></i> 全計画のチェック（AIなし）<span class="my-asm-muted">計画どうしの重複・補完・不足を見ます</span><button type="button" class="my-asm-link" onclick="closeCarePlanSetReview()">閉じる</button></div>`;
      if (n < 2) h += '<p class="my-asm-muted">計画が2件以上あると、重複や補完を確かめられます。</p>';
      else {
        const any = local.dups.length || local.overlaps.length || local.gaps.length;
        h += group('重複', 'fa-clone', 'warn', [...local.dups, ...local.overlaps]) + group('全体では入っている', 'fa-circle-check', 'ok', local.covered) + group('どの計画にも無い', 'fa-triangle-exclamation', 'warn', local.gaps);
        if (!any) h += '<p class="my-asm-muted">計画どうしの重複・不足は見つかりませんでした。</p>';
      }
      const ai = carePlanSetState.ai[cp.id];
      if (ai) h += `<div class="cpr-ai"><div class="cpr-ai-head"><i class="fa-solid fa-wand-magic-sparkles"></i> AIの評価（全計画）<span class="my-asm-muted">AIの評価は参考です。採り入れる前に、この患者に必要な理由を確かめてください</span></div>${ai.summary ? `<p>${escapeHtml(ai.summary)}</p>` : ''}${group('重複', 'fa-clone', 'warn', ai.duplicates)}${group('補完されている', 'fa-circle-check', 'ok', ai.complements)}${group('不足', 'fa-triangle-exclamation', 'warn', ai.gaps)}${ai.priority ? `<p class="cpr-sugg">優先順位：${escapeHtml(ai.priority)}</p>` : ''}</div>`;
      h += `<div class="cps-actions"><button type="button" class="btn btn-outline text-[11px] py-1" onclick="reviewAllCarePlansAiUI()" ${carePlanSetState.running || n < 1 ? 'disabled' : ''}><i class="fa-solid fa-wand-magic-sparkles"></i> ${carePlanSetState.running ? 'AIが評価中…' : 'AIで全計画を評価'}</button></div></div>`;
      return h;
    }
    function renderCarePlanSetReview() {
      const el = document.getElementById('careplan-set-review');
      if (el) el.innerHTML = carePlanSetReviewHtml(getCurrentPatient());
    }
    window.openCarePlanSetReview = function() { carePlanSetState.open = true; renderCarePlanSetReview(); const el = document.getElementById('careplan-set-review'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); };
    window.closeCarePlanSetReview = function() { carePlanSetState.open = false; renderCarePlanSetReview(); };
    window.reviewAllCarePlansAiUI = async function() {
      const cp = getCurrentPatient();
      if (!carePlanList(cp).length) return showToast('看護計画がありません', 'info');
      if (carePlanSetState.running) return;
      const ok = await requireApiKey('AIで全計画を評価', { fallbackLabel: '全計画をチェック（AIなし）' });
      if (ok === 'fallback') return window.openCarePlanSetReview();
      if (ok !== 'ok') return;
      carePlanSetState.open = true; carePlanSetState.running = true; renderCarePlanSetReview();
      showToast('全ての看護計画をまとめてAIで評価しています（30秒ほどかかります）', 'info');
      try {
        const text = await callGeminiAI([{ role: 'user', parts: [{ text: buildAllCarePlansReviewPrompt(cp) }] }], { json: true });
        const res = parseAllCarePlansReview(text);
        if (!res) throw new Error('AIの答えを読み取れませんでした');
        carePlanSetState.ai[cp.id] = res;
        if (finishAiResult(cp, () => {}, '全計画の評価')) showToast('全計画の評価ができました', 'success');
      } catch (err) {
        showAiErrorToast('全計画をAIで評価できませんでした。', err);
      } finally {
        carePlanSetState.running = false;
        renderCarePlanSetReview();
      }
    };

    const carePlanAiRunning = new Set();
    window.reviewCarePlanAiUI = async function(id) {
      const cp = getCurrentPatient();
      const p = getCarePlan(cp, id);
      if (!p) return;
      if (carePlanAiRunning.has(id)) return showToast('この計画をAIで評価しています。終わるまでお待ちください', 'info');
      const ok = await requireApiKey('AIで看護計画を評価', { fallbackLabel: '計画をチェック（AIなし）' });
      if (ok === 'fallback') { carePlanReviewOpen.add(id); renderCarePlans(); return; }
      if (ok !== 'ok') return;
      carePlanAiRunning.add(id);
      carePlanReviewOpen.add(id);
      renderCarePlans();
      showToast('看護計画をAIで評価しています（30秒ほどかかります）', 'info');
      try {
        const text = await callGeminiAI([{ role: 'user', parts: [{ text: buildCarePlanReviewPrompt(cp, p) }] }], { json: true });
        const res = parseCarePlanReview(text);
        if (!res) throw new Error('AIの答えを読み取れませんでした');
        const plan = getCarePlan(cp, id);
        if (plan) { plan.aiReview = { at: new Date().toISOString(), ...res }; plan.updatedAt = new Date().toISOString(); }
        saveMyAssessmentsSoon(cp.id, 0);
        if (finishAiResult(cp, () => renderCarePlans(), '看護計画の評価')) showToast('看護計画の評価ができました', 'success');
      } catch (err) {
        showAiErrorToast('看護計画をAIで評価できませんでした。', err);
      } finally {
        carePlanAiRunning.delete(id);
        if (getCurrentPatient().id === cp.id) renderCarePlans();
      }
    };

    // 書き出し・AI用：看護計画を文章にする
    function buildCarePlansText(cp, { withRecords = true, recordFilter = null } = {}) {
      return carePlanList(cp).map((p, k) => {
        const lines = [`#${k + 1} ${p.problem || '（無題）'}（${CARE_PLAN_STATUSES.find(s => s.key === p.status).label}）`];
        if (p.relatedNeeds.length) lines.push(`関係する項目：${p.relatedNeeds.map(h => `${h}.${hendersonNameOf(h).replace(/^\d+\.\s*/, '')}`).join('・')}`);
        if (p.evidence && p.evidence.length) lines.push(`根拠データ：${p.evidence.join('／')}`);
        if (p.reasons && p.reasons.length) lines.push(`この患者に必要な理由：${p.reasons.map(r => `${r.about ? `（${r.about}）` : ''}${r.text}`).join('／')}`);
        if (p.goalLong) lines.push(`長期目標：${p.goalLong}`);
        if (p.goalShort) lines.push(`短期目標：${p.goalShort}`);
        CARE_PLAN_SECTIONS.forEach(s => { if (p[s.key].length) lines.push(`${s.label}`, ...p[s.key].map((t, n) => `  ${s.short}${n + 1}. ${t}`)); });
        const recs = withRecords ? p.records.filter(r => !recordFilter || recordFilter(r)) : [];
        if (recs.length) {
          lines.push('実施・評価');
          recs.forEach(r => lines.push(...careRecordLines(r).map(l => `  ${l}`)));
        }
        return lines.join('\n');
      }).join('\n\n');
    }
    function careRecordLines(r) {
      const ach = CARE_ACHIEVEMENTS.find(a => a.key === r.achievement);
      const out = [`【${formatMyDateTime(r.at)}】${ach && ach.key ? `目標：${ach.label}` : ''}`];
      if (r.doneItems.length) out.push(`実施した計画：${r.doneItems.join('／')}`);
      if (r.doneText) out.push(`実施内容：${r.doneText}`);
      if (r.response) out.push(`患者の反応：${r.response}`);
      if (r.evaluation) out.push(`評価：${r.evaluation}`);
      if (r.revision) out.push(`計画の修正：${r.revision}`);
      return out;
    }

    // 「看護計画」のページへ切り替えたとき・患者を切り替えたとき（js/05 の switchView・loadLocalState から呼ぶ）
    function onCarePlanViewShown() { renderCarePlans(); }

if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, {
    formatCardTimestamp, MISSING_CHECK_STATUSES, missingInfoItems, missingCheckStatus, missingCheckCounts, setMissingCheck, missingCheckCardHtml,
    CARE_PLAN_SECTIONS, carePlanList, createCarePlan, getCarePlan, updateCarePlan, deleteCarePlan, moveCarePlan, carePlanLinesToList,
    addCareRecord, updateCareRecord, deleteCareRecord, parseCarePlanText, buildMissingInfoText, importCarePlans, guessPlanNeeds, buildCarePlansText, carePlanCardHtml,
    cpModelFor, CP_REVIEW_ITEMS, CP_DOMAINS, cpDomainOf, cpGoalCheck, cpRecordContext, reviewCarePlan, importCarePlansFromMap, buildCarePlanReviewPrompt, parseCarePlanReview, carePlanReviewHtml, carePlanBasisHtml, cpObservationLines, reviewCarePlanSet, buildAllCarePlansReviewPrompt, parseAllCarePlansReview, carePlanSetReviewHtml, carePlanSetState
  });
}
