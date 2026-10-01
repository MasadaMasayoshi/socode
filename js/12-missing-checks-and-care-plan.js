    // 看護アセスメント支援システム：12-missing-checks-and-care-plan.js（全13ファイルのうち 12 番目）
    // ②不足情報の確認状況：総合アセスメント表の「不足情報」の欄のカードごとに「未確認・確認済み・該当なし」、
    //   確かめた方法・日時・結果を残し、結果を情報カード（S/O）として足せるようにする。
    // ③看護計画の編集・実施・評価：看護問題ごとに目標・OP/TP/EPを書き、日々の実施内容・患者の反応・目標の達成状況・
    //   評価・計画の修正を記録する（「看護計画」のページ）。

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['12'] = '2026-10-01.1'; // 版（scripts/stamp-version.js が書き込む）

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
      lines.forEach(raw => {
        const line = raw.trim();
        if (!line) return;
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
      return plans.filter(p => p.problem);
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
          <div class="cp-row"><span class="my-asm-label"><i class="fa-solid fa-table-cells"></i> 関係する項目</span><div class="cp-need-btns">${needBtns}</div></div>
          <div class="cp-grid2">${field('goalLong', '<i class="fa-solid fa-flag-checkered"></i> 長期目標', 2, '例：退院までに歩行器で病棟内を自立して移動できる')}${field('goalShort', '<i class="fa-solid fa-flag"></i> 短期目標', 2, '例：3日後までに、痛みがNRS3以下でリハビリに参加できる')}</div>
          <div class="cp-grid3">${CARE_PLAN_SECTIONS.map(s => field(s.key, `<i class="fa-solid fa-list-ol"></i> ${s.label}`, 5, s.placeholder)).join('')}</div>
          <div class="cp-actions">
            <label class="cp-status-select"><span class="my-asm-label">状態</span><select class="field" onchange="setCarePlanStatus('${pid}', this.value)">${CARE_PLAN_STATUSES.map(s => `<option value="${s.key}"${p.status === s.key ? ' selected' : ''}>${s.label}</option>`).join('')}</select></label>
            <button type="button" class="btn btn-primary my-asm-btn" onclick="openCareRecord('${pid}')"><i class="fa-solid fa-plus"></i> 実施・評価を記録</button>
            <button type="button" class="btn btn-outline my-asm-btn cp-delete" onclick="deleteCarePlanUI('${pid}')"><i class="fa-solid fa-trash-can"></i> この計画を消す</button>
          </div>
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
      if (source === 'ai') parseCarePlanText(htmlToPlainText(cp.carePlanResult || '')).forEach(add);
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

    // 書き出し・AI用：看護計画を文章にする
    function buildCarePlansText(cp, { withRecords = true, recordFilter = null } = {}) {
      return carePlanList(cp).map((p, k) => {
        const lines = [`#${k + 1} ${p.problem || '（無題）'}（${CARE_PLAN_STATUSES.find(s => s.key === p.status).label}）`];
        if (p.relatedNeeds.length) lines.push(`関係する項目：${p.relatedNeeds.map(h => `${h}.${hendersonNameOf(h).replace(/^\d+\.\s*/, '')}`).join('・')}`);
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
    addCareRecord, updateCareRecord, deleteCareRecord, parseCarePlanText, buildMissingInfoText, importCarePlans, guessPlanNeeds, buildCarePlansText, carePlanCardHtml
  });
}
