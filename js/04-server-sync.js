// Shared patient and learning persistence. Keep patient identity, per-card merge and map revisions.
// Only deliberate corrections vote; source snapshots and raw research history remain shared.

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['04'] = '2026-10-10.znavigation17'; // Version stamp (scripts/stamp-version.js)
    // ==========================================================================

    // ------------------------------------------------------------------------

    // ==========================================================================

    const RENDER_ORIGIN = (document.querySelector('meta[name="api-origin"]') || {}).content || 'https://socode.onrender.com';
    const API_BASE = (typeof location !== 'undefined' && /\.github\.io$/i.test(location.hostname || '')) ? `${RENDER_ORIGIN.replace(/\/+$/, '')}/api` : '/api';
    // { [text]: { preferredType, preferredCols, preferredHendersonIds, typeVotes, hendersonVotes, lastEditedFrom, updatedAt } }

    let sharedLearningDict = {};

    let learningServerState = 'unknown';

    function pickTopVote(votes) {
      if (!votes) return null;
      let best = null, bestCount = 0;
      for (const [key, count] of Object.entries(votes)) {
        if (count > bestCount) { best = key; bestCount = count; }
      }
      return best;
    }

    async function loadSharedLearningDict() {
      try {
        const res = await fetch(`${API_BASE}/learning-dict`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        sharedLearningDict = await res.json();
        learningServerState = 'online';

        globalAppData.learningUserDict = { ...sharedLearningDict, ...globalAppData.learningUserDict };
      } catch (e) {
        learningServerState = 'offline';
        console.warn('Learning load failed; offline changes are session-only:', e);
      }
    }

    // ==========================================================================

    // ------------------------------------------------------------------------

    // ==========================================================================
    const patientSyncTimers = {};
    const PATIENT_SYNC_DEBOUNCE_MS = 800;

    const patientLocalRev = {};
    const patientSyncState = {}; // { inFlight, pending, retryTimer, retryCount }
    const PATIENT_SYNC_RETRY_MS = [3000, 10000, 30000, 60000, 120000];
    const unsyncedPatientIds = new Set();

    const DELETED_PATIENTS_STORAGE_KEY = 'nursing_deleted_patient_ids';
    const deletedPatientIds = new Set((() => {
      try { const v = JSON.parse(localStorage.getItem(DELETED_PATIENTS_STORAGE_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
    })());
    function rememberDeletedPatient(id) {
      if (!id) return;
      deletedPatientIds.add(id);
      unsyncedPatientIds.delete(id);
      try { localStorage.setItem(DELETED_PATIENTS_STORAGE_KEY, JSON.stringify(Array.from(deletedPatientIds).slice(-500))); } catch (e) {   }
    }

    function schedulePatientSync(patientId) {
      if (!patientId || deletedPatientIds.has(patientId)) return;
      patientLocalRev[patientId] = (patientLocalRev[patientId] || 0) + 1;
      unsyncedPatientIds.add(patientId);
      if (patientSyncTimers[patientId]) clearTimeout(patientSyncTimers[patientId]);
      patientSyncTimers[patientId] = setTimeout(() => { delete patientSyncTimers[patientId]; syncPatientToServer(patientId); }, PATIENT_SYNC_DEBOUNCE_MS);
    }

    function mergeItemsAfterInFlightEdits(local, base, server) {
      const key = it => JSON.stringify(it);
      const byId = list => new Map((Array.isArray(list) ? list : []).filter(i => i && i.id).map(i => [i.id, i]));
      const baseById = byId(base && base.items);
      const serverById = byId(server && server.items);
      const localItems = Array.isArray(local && local.items) ? local.items : [];
      const localById = byId(localItems);
      const localTombstones = new Set((local && local.deletedItemIds || []).map(t => t && t.id).filter(Boolean));
      const items = [];
      localItems.forEach(L => {
        if (!L || !L.id) { items.push(L); return; }
        const B = baseById.get(L.id);
        const R = serverById.get(L.id);
        if (!B) items.push(L);
        else if (key(L) !== key(B)) items.push(L);
        else if (R) items.push(R);

      });
      serverById.forEach((R, id) => {
        if (localById.has(id)) return;
        if (baseById.has(id)) return;
        if (localTombstones.has(id)) return;
        items.push(R);
      });
      const tombs = new Map();
      [...(server && server.deletedItemIds || []), ...(local && local.deletedItemIds || [])].forEach(t => {
        if (!t || !t.id) return;
        const prev = tombs.get(t.id);
        if (!prev || String(t.at) > String(prev.at)) tombs.set(t.id, t);
      });
      return { items, deletedItemIds: Array.from(tombs.values()) };
    }

    function applyServerPatientResult(patientId, serverPatient, sentSnapshot, sentRev) {
      const current = globalAppData.patients.find(p => p.id === patientId);
      if (!current || !serverPatient || !Array.isArray(serverPatient.items)) return;
      const editedWhileSending = (patientLocalRev[patientId] || 0) !== sentRev;
      const merged = editedWhileSending
        ? mergeItemsAfterInFlightEdits(current, sentSnapshot, serverPatient)
        : { items: serverPatient.items, deletedItemIds: Array.isArray(serverPatient.deletedItemIds) ? serverPatient.deletedItemIds : [] };

      const keyed = mergeKeyedPatientFieldsClient(current, serverPatient);
      const keyedChanged = Object.keys(keyed).some(f => JSON.stringify(current[f]) !== JSON.stringify(keyed[f]));
      const oldMap = JSON.stringify(current.relationMap || null), oldMapRevision = current.relationMapRevision;
      let changed = keyedChanged || JSON.stringify(current.items) !== JSON.stringify(merged.items);
      Object.assign(current, keyed);

      if (Number.isSafeInteger(serverPatient.relationMapRevision)) current.relationMapRevision = serverPatient.relationMapRevision;
      if (JSON.stringify(current.relationMap || null) === JSON.stringify(sentSnapshot?.relationMap || null) && Object.hasOwn(serverPatient, 'relationMap')) current.relationMap = serverPatient.relationMap;
      changed = changed || oldMap !== JSON.stringify(current.relationMap || null) || oldMapRevision !== current.relationMapRevision;
      current.items = merged.items;
      current.deletedItemIds = merged.deletedItemIds;
      if (!editedWhileSending && serverPatient.updatedAt) current.updatedAt = serverPatient.updatedAt;
      if (changed) {
        try {
          localStorage.setItem(PATIENTS_STORAGE_KEY, JSON.stringify({ patients: globalAppData.patients, currentPatientId: globalAppData.currentPatientId }));
        } catch (e) {   }
        if (getCurrentPatient().id === patientId) {
          renderSoBoard();
          renderAssessmentTable();
          if (typeof renderRelationMap === 'function') renderRelationMap();
        }
      }
    }

    async function resolveRelationMapConflict(patientId = getCurrentPatient().id) {
      const cp = globalAppData.patients.find(p => p.id === patientId);
      if (!cp) return;
      try {
        const res = await fetch(`${API_BASE}/patients/${encodeURIComponent(patientId)}/relation-map`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const latest = await res.json();
        if (latest.relationMap?.patientId && latest.relationMap.patientId !== patientId) throw new Error('患者情報が一致しません');
        const ok = await openDialog({ title: '関連図の更新が競合しています', message: '最新の図を読み込みますか？手元の図はこのブラウザに控えを保存します。取り消すと未保存の図をそのまま保持します。', confirmLabel: '最新の図を読み込む' });
        if (ok !== true || !globalAppData.patients.includes(cp)) return;

        const key = `nursing_relation_map_conflict_${patientId}`;
        const previous = JSON.parse(localStorage.getItem(key) || '[]');
        const backups = Array.isArray(previous) ? previous : [previous];
        backups.push({ patientId, relationMap: cp.relationMap || null, savedAt: new Date().toISOString() });
        localStorage.setItem(key, JSON.stringify(backups));
        cp.relationMap = latest.relationMap;
        cp.relationMapRevision = latest.relationMapRevision;
        const st = patientSyncState[patientId];
        if (st) st.rejectedStatus = null;
        if (typeof savePatientsLocally === 'function') savePatientsLocally();
        schedulePatientSync(patientId);
        if (getCurrentPatient().id === patientId && typeof renderRelationMap === 'function') renderRelationMap();
      } catch (e) { showToast(`関連図を読み込めませんでした。手元の図を保持しています：${e.message}`, 'error'); }
    }
    function hasRelationMapConflict(patientId) { return patientSyncState[patientId]?.rejectedStatus === 412; }

    function handlePatientDeletedElsewhere(patientId) {
      const idx = globalAppData.patients.findIndex(p => p.id === patientId);
      rememberDeletedPatient(patientId);
      if (patientSyncTimers[patientId]) { clearTimeout(patientSyncTimers[patientId]); delete patientSyncTimers[patientId]; }
      if (idx === -1) return;
      const [removed] = globalAppData.patients.splice(idx, 1);
      if (globalAppData.patients.length === 0) {
        globalAppData.patients.push({ id: 'patient_' + Date.now(), title: '患者1', items: [], sourceText: '', labEvaluationResult: '', referenceNotes: [], archived: false, updatedAt: new Date().toISOString(), deletedItemIds: [] });
      }
      if (globalAppData.currentPatientId === patientId) {
        const next = globalAppData.patients.find(x => !x.archived) || globalAppData.patients[0];
        changeCurrentPatient(next.id, { saveCurrent: false });
      } else {
        savePatientsLocally();
        renderPatientTabs();
      }
      showToast(`「${removed ? removed.title : ''}」は別の端末で完全に削除されたため、この端末からも消しました`, 'info', 6000);
    }

    function schedulePatientSyncRetry(patientId) {
      const st = patientSyncState[patientId] || (patientSyncState[patientId] = {});
      if (st.retryTimer) clearTimeout(st.retryTimer);
      const wait = PATIENT_SYNC_RETRY_MS[Math.min(st.retryCount || 0, PATIENT_SYNC_RETRY_MS.length - 1)];
      st.retryCount = (st.retryCount || 0) + 1;
      st.retryTimer = setTimeout(() => { st.retryTimer = null; syncPatientToServer(patientId); }, wait);
    }

    function retryUnsyncedPatients() {
      Array.from(unsyncedPatientIds).forEach(id => {
        const st = patientSyncState[id];
        if (st && st.retryTimer) { clearTimeout(st.retryTimer); st.retryTimer = null; }
        syncPatientToServer(id);
      });
    }
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('online', () => retryUnsyncedPatients());

    async function syncPatientToServer(patientId) {
      const patient = globalAppData.patients.find(p => p.id === patientId);
      if (!patient || deletedPatientIds.has(patientId)) return;
      const st = patientSyncState[patientId] || (patientSyncState[patientId] = {});
      if (st.inFlight) { st.pending = true; return; }
      st.inFlight = true;
      st.pending = false;
      const sentRev = patientLocalRev[patientId] || 0;
      const body = JSON.stringify(patient);
      const sentSnapshot = JSON.parse(body);
      let ok = false;
      try {
        const res = await fetch(`${API_BASE}/patients/${encodeURIComponent(patientId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...(Object.hasOwn(patient, 'relationMap') ? { 'If-Match': `"relation-map-${patient.relationMapRevision || 0}"` } : {}) },
          body
        });
        if (res.status === 410) { handlePatientDeletedElsewhere(patientId); ok = true; return; }
        const result = await res.json().catch(() => null);
        if (!res.ok || !result || result.ok === false) {
          const err = new Error((result && result.error) || `HTTP ${res.status}`);
          err.status = res.status;
          throw err;
        }

        if (result.patient && result.patient.id && result.patient.id !== patientId) throw new Error('共有先の応答が別の患者のものでした');

        applyServerPatientResult(patientId, result.patient, sentSnapshot, sentRev);
        ok = true;
        st.retryCount = 0;
        st.rejectedStatus = null;

        if (st.retryTimer) { clearTimeout(st.retryTimer); st.retryTimer = null; }
        if ((patientLocalRev[patientId] || 0) === sentRev) unsyncedPatientIds.delete(patientId);

        if (getCurrentPatient().id === patientId && (patientLocalRev[patientId] || 0) === sentRev) updateSaveStatus('saved');
      } catch (e) {
        console.warn('Patient server save failed; local copy retained, retry pending:', e);
        unsyncedPatientIds.add(patientId);
        if (getCurrentPatient().id === patientId) updateSaveStatus('error');

        const status = e && typeof e.status === 'number' ? e.status : 0;
        if (status === 412) {
          if (st.retryTimer) { clearTimeout(st.retryTimer); st.retryTimer = null; }
          st.rejectedStatus = 412;
          showToast('ほかの端末で関連図が更新されています。手元の図は保持しています。関連図の「最新の図を確認」から確認してください', 'error');
          if (getCurrentPatient().id === patientId && typeof renderRelationMap === 'function') renderRelationMap();
          return;
        }
        if (status >= 400 && status < 500 && ![408, 409, 429].includes(status)) {
          if (st.retryTimer) { clearTimeout(st.retryTimer); st.retryTimer = null; }
          if (st.rejectedStatus !== status && !(typeof IS_FILE_PROTOCOL !== 'undefined' && IS_FILE_PROTOCOL)) {
            const p = globalAppData.patients.find(x => x.id === patientId);
            showToast([`「${p ? p.title : ''}」を共有先に保存できませんでした（共有先が受け付けませんでした：HTTP ${status}）`, { text: `このブラウザには保存されています。${status === 413 ? 'カルテが大きすぎる可能性があります。使っていないカード・カルテ本文を減らしてから、右上の「共有先への保存に失敗」を押してください。' : '自動の送り直しはしません。内容を確かめてから、右上の「共有先への保存に失敗」を押してください。'}`, detail: true }], 'error');
          }
          st.rejectedStatus = status;
          return;
        }

        if (!(st.retryCount > 0) && !(typeof IS_FILE_PROTOCOL !== 'undefined' && IS_FILE_PROTOCOL)) {
          const p = globalAppData.patients.find(x => x.id === patientId);
          showToast([`「${p ? p.title : ''}」を共有先に保存できませんでした`, { text: 'このブラウザには保存されています。自動で送り直します。すぐ送り直すときは右上の「共有先への保存に失敗」を押してください。続くときはサーバーが動いているか確かめてください。', detail: true }], 'error');
        }
        schedulePatientSyncRetry(patientId);
      } finally {
        st.inFlight = false;

        if (ok && (st.pending || ((patientLocalRev[patientId] || 0) !== sentRev && !patientSyncTimers[patientId]))) {
          st.pending = false;
          syncPatientToServer(patientId);
        }
      }
    }

    const PENDING_PATIENT_DELETES_KEY = 'nursing_pending_patient_deletes';
    function pendingPatientDeletes() {
      try { const v = JSON.parse(localStorage.getItem(PENDING_PATIENT_DELETES_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
    }
    function setPendingPatientDeletes(list) {
      try { localStorage.setItem(PENDING_PATIENT_DELETES_KEY, JSON.stringify(Array.from(new Set(list)))); } catch (e) {   }
    }
    async function deletePatientFromServer(patientId) {
      setPendingPatientDeletes([...pendingPatientDeletes(), patientId]);
      try {
        const res = await fetch(`${API_BASE}/patients/${encodeURIComponent(patientId)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setPendingPatientDeletes(pendingPatientDeletes().filter(id => id !== patientId));
        return true;
      } catch (e) {
        console.warn('Patient server deletion failed; local deletion retained, retry on reload:', e);
        return false;
      }
    }
    async function retryPendingPatientDeletes() {
      for (const id of pendingPatientDeletes()) await deletePatientFromServer(id);
    }

    async function loadSharedPatients() {
      await retryPendingPatientDeletes();
      try {
        const res = await fetch(`${API_BASE}/patients`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const serverPatientsDict = await res.json();

        try {
          const delRes = await fetch(`${API_BASE}/patient-deletions`);
          if (delRes.ok) {
            const deletions = await delRes.json();
            Object.keys(deletions || {}).forEach(id => rememberDeletedPatient(id));
          }
        } catch (e) {   }

        const merged = {};
        (globalAppData.patients || []).forEach(p => { if (!deletedPatientIds.has(p.id)) merged[p.id] = p; });
        Object.entries(serverPatientsDict).forEach(([id, serverPatient]) => {
          if (deletedPatientIds.has(id) || !serverPatient || serverPatient.deleted) return;
          merged[id] = mergePatientRecordClient(merged[id], serverPatient);
        });

        try { if (typeof SERVER_IS_PRIMARY !== 'undefined' && SERVER_IS_PRIMARY) localStorage.setItem(PAGES_FIRST_SYNC_KEY, '1'); } catch (e) {   }
        const mergedList = Object.values(merged);
        if (mergedList.length > 0) {
          globalAppData.patients = mergedList;
          if (!globalAppData.patients.some(p => p.id === globalAppData.currentPatientId)) {
            globalAppData.currentPatientId = (globalAppData.patients.find(p => !p.archived) || globalAppData.patients[0]).id;
          }
        }
      } catch (e) {
        console.warn('Shared patient load failed; using local records:', e);
      }
    }

    // ==========================================================================

    // ------------------------------------------------------------------------

    // ==========================================================================

    function buildAssessmentNotebookContent() {
      const full = buildEffectiveNotebookContent();
      const ch1 = full.search(/━+\s*\n\s*第1章/);
      const ch5 = full.search(/━+\s*\n\s*第5章/);
      if (ch1 < 0 || ch5 <= ch1) return full;
      return `${full.slice(0, ch1)}（第1〜4章：カードの作り方・S/O・タグ付けのルールは、この判断では使わないため省略）\n\n${full.slice(ch5)}`;
    }
    function buildEffectiveNotebookContent() {
      const extras = (globalAppData.additionalCriteria || []).map(c => `- ${c.text}`).join('\n');
      const trend = buildLearningTrendSummary();

      const referenceSourcesText = (globalAppData.referenceSources || [])
        .filter(r => (r.content || '').trim())
        .map(r => `【参照元: ${r.title}${r.url ? ` (${r.url})` : ''}】\n${r.content.trim()}`)
        .join('\n\n');
      let content = globalAppData.notebookContent;

      const customRules = (globalAppData.customTagRules || []).map(r => `- 「${r.keyword}」${r.mode === 'exclude' ? 'では' : 'を含むとき'}、${r.hendersonIds.map(h => hendersonNameOf(h).replace(/^\d+\.\s*/, '')).map((n, i) => `${r.hendersonIds[i]}.${n}`).join('・')} のタグを${r.mode === 'exclude' ? '付けない' : '付ける'}${r.note ? `（${r.note}）` : ''}`).join('\n');
      if (customRules) content += `\n\n【追加キーワード（学習データ管理で登録したタグ付けのルール・全員共有）】\n${customRules}`;
      if (extras) content += `\n\n【利用者からの追加の抽出・分類基準（現場からの要望・全員共有）】\n${extras}`;
      if (referenceSourcesText) content += `\n\n【学習データ管理から登録された参照元（全員共有）】\n${referenceSourcesText}`;
      if (trend) content += `\n\n【学習データから見えている傾向（過去の修正で繰り返し確認された分類・タグの傾向。参考情報として、基準ノート・追加の分類基準を優先しつつ判断してください）】\n${trend}`;
      return content;
    }

    const LEARNING_TREND_MAX_FOR_PROMPT = 60;

    function computeLearningTrendRows(dictOverride) {
      const dict = dictOverride || globalAppData.learningUserDict || {};
      const rows = [];
      Object.entries(dict).forEach(([text, learned]) => {
        if (!text || !learned) return;
        const typeVotes = learned.typeVotes || {};
        const hendersonVotes = learned.hendersonVotes || {};
        const typeVoteTotal = Object.values(typeVotes).reduce((a, c) => a + c, 0);
        const tagVoteTotal = Object.values(hendersonVotes).reduce((a, c) => a + c, 0);
        const totalVotes = typeVoteTotal + tagVoteTotal;

        if (totalVotes < 2) return;
        const topType = pickTopVote(typeVotes);
        const typeLabel = topType === 's' ? 'S(主観的情報)' : topType === 'o' ? 'O(客観的情報)' : topType === 'unnecessary' ? '不要（カード化しない）' : null;
        const tagNames = Object.entries(hendersonVotes).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).map(([hIdStr]) => hendersonNameOf(Number(hIdStr)));
        if (!typeLabel && tagNames.length === 0) return;
        rows.push({ text, totalVotes, typeVoteTotal, tagVoteTotal, typeLabel, tagNames });
      });
      return rows.sort((a, b) => b.totalVotes - a.totalVotes);
    }

    function buildLearningTrendSummary() {
      const rows = computeLearningTrendRows();
      if (rows.length === 0) return '';
      return rows.slice(0, LEARNING_TREND_MAX_FOR_PROMPT).map(r => {
        const parts = [];
        if (r.typeLabel) parts.push(`分類=${r.typeLabel}`);
        if (r.tagNames.length) parts.push(`タグ=${r.tagNames.join('/')}`);
        return `- 「${r.text}」→ ${parts.join('、')}`;
      }).join('\n');
    }

    let notebookServerCopyIsOutdated = false;
    let notebookServerText = '';
    async function loadNotebookContent() {
      try {
        const res = await fetch(`${API_BASE}/notebook-content`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (typeof data?.text === 'string' && data.text) {
          notebookServerText = data.text;
          if (data.text.includes(NOTEBOOK_CONTENT_VERSION_MARK)) {
            globalAppData.notebookContent = data.text;
            notebookServerCopyIsOutdated = false;
          } else {
            globalAppData.notebookContent = DEFAULT_NOTEBOOK_CONTENT;
            notebookServerCopyIsOutdated = true;
          }
        }
        renderNotebookContentEditor();
      } catch (e) {
        console.warn('Reference note load failed; session-only operation:', e);
        renderNotebookContentEditor();
      }
    }

    function renderNotebookContentEditor() {
      const el = document.getElementById('input-notebook-content');
      if (el) el.value = globalAppData.notebookContent || '';

      const notice = document.getElementById('notebook-upgrade-notice');
      if (notice) notice.classList.toggle('hidden', !notebookServerCopyIsOutdated);
    }

    window.useLatestNotebookContent = async function() {
      const el = document.getElementById('input-notebook-content');
      if (!el) return;
      const ok = await openDialog({ title: '基準ノートを統合版に置き換えますか？', message: '今の基準ノートの内容は、入力欄の中で統合版に置き換わります。「保存」を押すまでは共有されません。\n今の内容に書き足した部分がある場合は、置き換える前に控えを取ってください。', confirmLabel: '置き換える' });
      if (ok !== true) return;
      const previous = el.value;
      el.value = DEFAULT_NOTEBOOK_CONTENT;
      showUndoToast('入力欄を統合版に置き換えました。内容を確認して「保存」を押してください', () => { el.value = previous; });
    };

    // ==========================================================================

    // ------------------------------------------------------------------------

    // ==========================================================================
    function notebookLineKey(s) { return String(s || '').normalize('NFKC').replace(/\s+/g, ''); }
    function notebookLineHash(k) { let x = 5381; for (const c of k) x = ((x * 33) ^ c.codePointAt(0)) >>> 0; return x.toString(36); }
    const NOTEBOOK_CHAPTER_RULES = [
      { no: 2, re: /S\s*\/\s*O|Sデータ|Oデータ|主観|客観|不必要|不要|unnecessary/i },
      { no: 4, re: /タグ|項目|検査値|基準値|(?:^|[^\d])(?:1[0-4]|[1-9])\s*[.．](?:呼吸|食事|排泄|姿勢|睡眠|衣服|体温|清潔|環境|コミュニケーション|信仰|仕事|余暇|学び)|呼吸|食事|排泄|姿勢|睡眠|衣服|体温|清潔|環境|信仰|仕事|余暇|学び/ },
      { no: 1, re: /カード|1枚|一枚|まとめ|分け|区切|日時|時刻|見出し|抽出|切り出|表の/ },
      { no: 8, re: /看護計画|看護診断|アセスメント|SOAP|評価|関連図|目標/ }
    ];
    function notebookChapterFor(text) {
      const hit = NOTEBOOK_CHAPTER_RULES.find(r => r.re.test(String(text || '')));
      return hit ? hit.no : 9;
    }

    function userAddedNotebookLines(serverText, baseText = DEFAULT_NOTEBOOK_CONTENT) {
      if (!serverText) return [];
      const base = new Set(String(baseText).split('\n').map(notebookLineKey).filter(Boolean));
      const out = [];
      String(serverText).split('\n').forEach(raw => {
        const line = raw.trim();
        const k = notebookLineKey(line);
        if (!k || /^━+$/.test(k) || /^【看護アセスメント基準ノート/.test(k) || /^第\d+章/.test(k) || /^■追加された基準/.test(k)) return;
        if (base.has(k) || NOTEBOOK_PREVIOUS_LINE_HASHES.has(notebookLineHash(k))) return;
        out.push(line.replace(/^[・\-*]\s*/, ''));
      });
      return out;
    }
    function buildIntegratedNotebook({ serverText = '', extras = [], baseText = DEFAULT_NOTEBOOK_CONTENT, today = new Date() } = {}) {
      const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const baseKey = notebookLineKey(baseText);
      const seen = new Set();
      const merged = [], skipped = [];
      const take = (text, source, extraId) => {
        const t = String(text || '').trim();
        const k = notebookLineKey(t).replace(/^[・\-*]/, '');
        if (!k) return;
        if (seen.has(k) || baseKey.includes(k)) { skipped.push({ text: t, source, extraId, reason: seen.has(k) ? '重複' : '最新の統合版に同じ内容があります' }); return; }
        seen.add(k);
        merged.push({ text: t, source, extraId, chapter: notebookChapterFor(t) });
      };
      userAddedNotebookLines(serverText, baseText).forEach(t => take(t, 'notebook'));
      (extras || []).forEach(c => take(c && c.text, 'extra', c && c.id));
      const lines = String(baseText).split('\n');
      const chapterStarts = [];
      lines.forEach((l, i) => { const m = l.match(/^第(\d+)章/); if (m) chapterStarts.push({ no: Number(m[1]), i }); });
      const insertAt = {};
      chapterStarts.forEach((c, k) => {

        let end = k + 1 < chapterStarts.length ? chapterStarts[k + 1].i - 1 : lines.length;
        while (end > c.i && !lines[end - 1].trim()) end--;
        if (k + 1 < chapterStarts.length && /^━+$/.test(lines[end - 1] || '')) { end--; while (end > c.i && !lines[end - 1].trim()) end--; }
        insertAt[c.no] = end;
      });
      const byChapter = {};
      merged.forEach(m => { const no = insertAt[m.chapter] !== undefined ? m.chapter : 9; m.chapter = no; (byChapter[no] = byChapter[no] || []).push(m); });
      const out = lines.slice();
      Object.keys(byChapter).map(Number).filter(no => no !== 9).sort((a, b) => insertAt[b] - insertAt[a]).forEach(no => {
        out.splice(insertAt[no], 0, `■ 追加された基準（現場からの要望・統合 ${stamp}）`, ...byChapter[no].map(m => `・${m.text}`));
      });
      let text = out.join('\n');
      if (byChapter[9]) {
        text = text.replace(/\s+$/, '') + `\n\n━━━━━━━━━━━━━━━━━━━━\n第9章 そのほかの追加の基準（統合 ${stamp}）\n━━━━━━━━━━━━━━━━━━━━\n` + byChapter[9].map(m => `・${m.text}`).join('\n') + '\n';
      }
      return { text, merged, skipped };
    }

    let integrationResult = null;
    window.openCriteriaIntegration = function() {
      integrationResult = buildIntegratedNotebook({ serverText: notebookServerText || (document.getElementById('input-notebook-content')?.value || ''), extras: globalAppData.additionalCriteria || [] });
      const r = integrationResult;
      const chapterName = no => ({ 1: '第1章 カードの作り方', 2: '第2章 S/O・不必要の判定', 4: '第4章 タグ付け・検査値', 8: '第8章 記録・計画の型', 9: '第9章 そのほか' })[no] || `第${no}章`;
      const fromExtra = r.merged.filter(m => m.source === 'extra').length;
      const fromNote = r.merged.filter(m => m.source === 'notebook').length;
      const rules = (globalAppData.customTagRules || []).length;
      const groups = {};
      r.merged.forEach(m => { (groups[m.chapter] = groups[m.chapter] || []).push(m); });
      document.getElementById('integrate-summary').innerHTML = `
        <p>最新の統合版（${escapeHtml(NOTEBOOK_CONTENT_VERSION_MARK)}）を土台に、<b>追加の分類基準 ${fromExtra}件</b>と、共有の基準ノートに<b>書き足されていた ${fromNote}行</b>を、内容に合う章に入れます。${r.skipped.length ? `最新版と同じ・重複している ${r.skipped.length}件は入れません。` : ''}</p>
        <p class="my-asm-muted">追加キーワード（${rules}件）は、ルールによる分類がそのまま使う決まりなので統合せずに残します（AIへの指示文には今までどおり付きます）。参照元リンクもそのまま残します。</p>
        ${r.merged.length ? Object.keys(groups).sort((a, b) => a - b).map(no => `<div class="ig-group"><b>${escapeHtml(chapterName(Number(no)))}</b><ul>${groups[no].map(m => `<li><span class="ig-src">${m.source === 'extra' ? '追加の分類基準' : '書き足し'}</span>${escapeHtml(m.text)}</li>`).join('')}</ul></div>`).join('') : '<p class="my-asm-muted">入れ直す追加の基準はありません（基準ノートを最新の統合版にそろえます）。</p>'}
        ${r.skipped.length ? `<details class="ig-skipped"><summary>入れないもの（${r.skipped.length}件）</summary><ul>${r.skipped.map(s => `<li>${escapeHtml(s.text)}（${escapeHtml(s.reason)}）</li>`).join('')}</ul></details>` : ''}`;
      document.getElementById('integrate-preview').value = r.text;
      const rm = document.getElementById('integrate-remove-extras');
      rm.checked = true;
      rm.closest('label').classList.toggle('hidden', !(globalAppData.additionalCriteria || []).length);
      document.getElementById('modal-integrate-criteria').classList.remove('hidden');
    };
    window.closeCriteriaIntegration = function() { document.getElementById('modal-integrate-criteria').classList.add('hidden'); };
    window.saveCriteriaIntegration = async function() {
      if (!integrationResult) return;
      const text = document.getElementById('integrate-preview').value.trim();
      if (!text) return showToast('統合した基準ノートが空です', 'warn');
      const removeExtras = document.getElementById('integrate-remove-extras').checked;
      const extraIds = Array.from(new Set([...integrationResult.merged, ...integrationResult.skipped].filter(m => m.source === 'extra' && m.extraId).map(m => m.extraId)));
      if (!(await confirmSharedChange(`基準ノートを統合した内容で保存します${removeExtras && extraIds.length ? `（統合した追加の分類基準 ${extraIds.length}件は一覧から外します）` : ''}。`))) return;
      try {
        const res = await fetch(`${API_BASE}/notebook-content`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        globalAppData.notebookContent = data.text;
        notebookServerText = data.text;
        notebookServerCopyIsOutdated = !data.text.includes(NOTEBOOK_CONTENT_VERSION_MARK);
      } catch (e) {
        console.warn('Merged reference note save failed:', e);
        return showToast(['統合した基準ノートを保存できませんでした（共有先のサーバーにつながりません）', { text: 'サーバーが動いているか確かめてから、もう一度「統合して保存」を押してください。今の基準はそのまま使えます。', detail: true }], 'error');
      }
      let removed = 0, failed = 0;
      if (removeExtras) {
        for (const id of extraIds) {
          try {
            const r = await fetch(`${API_BASE}/extraction-criteria/${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            globalAppData.additionalCriteria = await r.json();
            removed++;
          } catch (e) { failed++; }
        }
      }
      renderNotebookContentEditor();
      renderExtraCriteriaList();
      closeCriteriaIntegration();
      if (failed) showToast(['基準ノートは統合しましたが、追加の分類基準の一部を一覧から外せませんでした', { text: `外せなかった ${failed}件は一覧に残っています（中身は基準ノートに入っています）。あとで一覧の削除ボタンで外してください。`, detail: true }], 'error');
      else showToast(`分類基準を統合しました（${integrationResult.merged.length}件を基準ノートに入れました${removed ? `・追加の分類基準 ${removed}件を一覧から外しました` : ''}）`, 'success');
    };

    window.saveNotebookContent = async function() {
      const textarea = document.getElementById('input-notebook-content');
      const text = textarea ? textarea.value.trim() : '';
      if (!text) return showToast('内容を入力してください', 'warn');
      if (!(await confirmSharedChange('基準ノートを書き換えて保存します。'))) return;
      try {
        const res = await fetch(`${API_BASE}/notebook-content`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        globalAppData.notebookContent = data.text;
        notebookServerCopyIsOutdated = !data.text.includes(NOTEBOOK_CONTENT_VERSION_MARK);
        renderNotebookContentEditor();
        showToast('基準ノート本体を更新しました（全員に共有されます）', 'success');
      } catch (e) {
        console.warn('Reference note save failed:', e);
        showToast(['保存できませんでした（共有先のサーバーにつながりません）', { text: 'サーバー（node server.js）が動いているか確かめてから、もう一度保存してください。入力した内容はこの画面に残っています。', detail: true }], 'error');
      }
    };

    async function loadSharedCriteria() {
      try {
        const res = await fetch(`${API_BASE}/extraction-criteria`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        globalAppData.additionalCriteria = await res.json();
        renderExtraCriteriaList();
      } catch (e) {
        console.warn('Extraction criteria load failed; session-only operation:', e);
      }
    }

    async function confirmSharedChange(what, { danger = false } = {}) {
      const ok = await openDialog({ title: '全員に共有される変更です', message: `${what}\nこの変更は、このアプリを使う全員の分類・AIの基準に反映されます。`, confirmLabel: danger ? '削除して全員に反映' : '全員に反映する', danger });
      return ok === true;
    }
    async function addExtraCriteria(text) {
      if (!(await confirmSharedChange(`追加の分類基準を登録します：「${String(text).slice(0, 60)}」`))) return;
      try {
        const res = await fetch(`${API_BASE}/extraction-criteria`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        globalAppData.additionalCriteria = await res.json();
        renderExtraCriteriaList();
        return true;
      } catch (e) {
        console.warn('Extraction criteria save failed:', e);
        showToast(['共有先に保存できませんでした（サーバーにつながりません）', { text: 'サーバーが動いているか確かめてから、もう一度保存してください。', detail: true }], 'error');
        return false;
      }
    }

    window.deleteExtraCriteria = async function(id) {
      if (!(await confirmSharedChange('追加の分類基準を1件削除します。', { danger: true }))) return;
      try {
        const res = await fetch(`${API_BASE}/extraction-criteria/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        globalAppData.additionalCriteria = await res.json();
        if (editingCriteriaId === id) editingCriteriaId = null;
        renderExtraCriteriaList();
        showToast('追加の要望を削除しました', 'success');
      } catch (e) {
        console.warn('Extraction criteria deletion failed:', e);
        showToast(['削除できませんでした（共有先のサーバーにつながりません）', { text: 'サーバーが動いているか確かめてから、もう一度削除してください。', detail: true }], 'error');
      }
    };

    let editingCriteriaId = null;
    window.startEditExtraCriteria = function(id) {
      editingCriteriaId = id;
      renderExtraCriteriaList();
    };
    window.cancelEditExtraCriteria = function() {
      editingCriteriaId = null;
      renderExtraCriteriaList();
    };
    window.saveEditExtraCriteria = async function(id) {
      const textarea = document.getElementById(`edit-extra-criteria-${id}`);
      const text = textarea ? textarea.value.trim() : '';
      if (!text) return showToast('内容を入力してください', 'warn');
      if (!(await confirmSharedChange('追加の分類基準を書き換えます。'))) return;
      try {
        const res = await fetch(`${API_BASE}/extraction-criteria/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        globalAppData.additionalCriteria = await res.json();
        editingCriteriaId = null;
        renderExtraCriteriaList();
        showToast('分類基準を更新しました（全員に共有されます）', 'success');
      } catch (e) {
        console.warn('Extraction criteria update failed:', e);
        showToast(['更新できませんでした（共有先のサーバーにつながりません）', { text: 'サーバーが動いているか確かめてから、もう一度保存してください。入力した内容はこの画面に残っています。', detail: true }], 'error');
      }
    };

    function renderExtraCriteriaList() {
      const el = document.getElementById('list-extra-criteria');
      if (!el) return;
      const items = globalAppData.additionalCriteria || [];
      if (items.length === 0) {
        el.innerHTML = `<p class="text-[10px] text-[var(--ink-muted)]">まだ追加された要望はありません。</p>`;
        return;
      }
      el.innerHTML = items.map(c => {
        if (c.id === editingCriteriaId) {
          return `
            <div class="flex flex-col gap-1.5 p-1.5 rounded-[var(--radius-sm)] border border-[var(--accent)] text-[11px]" style="background:var(--surface);">
              <textarea id="edit-extra-criteria-${c.id}" rows="2" class="field resize-none text-[11px]">${escapeHtml(c.text)}</textarea>
              <div class="flex justify-end gap-1.5">
                <button onclick="cancelEditExtraCriteria()" class="btn btn-ghost" style="padding:2px 8px;font-size:10px;">キャンセル</button>
                <button onclick="saveEditExtraCriteria('${c.id}')" class="btn btn-primary" style="padding:2px 8px;font-size:10px;">保存</button>
              </div>
            </div>
          `;
        }
        return `
          <div class="flex items-start justify-between gap-2 p-1.5 rounded-[var(--radius-sm)] border border-[var(--line-soft)] text-[11px]" style="background:var(--surface);">
            <span class="flex-1 break-words text-[var(--ink)]">${escapeHtml(c.text)}</span>
            <div class="flex items-center gap-1 shrink-0">
              <button onclick="startEditExtraCriteria('${c.id}')" class="icon-btn" title="この要望を編集"><i class="fa-solid fa-pen text-[9px]"></i></button>
              <button onclick="deleteExtraCriteria('${c.id}')" class="icon-btn danger" title="この要望を削除"><i class="fa-solid fa-trash text-[9px]"></i></button>
            </div>
          </div>
        `;
      }).join('');
    }

    // ==========================================================================

    // ------------------------------------------------------------------------

    // ==========================================================================
    async function loadReferenceSources() {
      try {
        const res = await fetch(`${API_BASE}/reference-sources`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        globalAppData.referenceSources = await res.json();
      } catch (e) {
        console.warn('Source links load failed:', e);
      } finally {
        renderReferenceSourcesList();
      }
    }

    async function addReferenceSource(title, url, content) {
      if (!(await confirmSharedChange(`参照元「${String(title).slice(0, 40)}」を登録します。`))) return 'cancelled';
      try {
        const res = await fetch(`${API_BASE}/reference-sources`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, url, content })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        globalAppData.referenceSources = await res.json();
        renderReferenceSourcesList();
        return 'server';
      } catch (e) {
        console.warn('Source link server save failed:', e);
        return 'error';
      }
    }

    window.deleteReferenceSource = async function(id) {
      if (!(await confirmSharedChange('参照元を1件削除します。', { danger: true }))) return;
      try {
        const res = await fetch(`${API_BASE}/reference-sources/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        globalAppData.referenceSources = await res.json();
        if (editingReferenceSourceId === id) editingReferenceSourceId = null;
        renderReferenceSourcesList();
        showToast('参照元を削除しました', 'success');
      } catch (e) {
        console.warn('Source link deletion failed:', e);
        showToast(['削除できませんでした（共有先のサーバーにつながりません）', { text: 'サーバーが動いているか確かめてから、もう一度削除してください。', detail: true }], 'error');
      }
    };

    let editingReferenceSourceId = null;
    window.startEditReferenceSource = function(id) {
      editingReferenceSourceId = id;
      renderReferenceSourcesList();
    };
    window.cancelEditReferenceSource = function() {
      editingReferenceSourceId = null;
      renderReferenceSourcesList();
    };
    window.saveEditReferenceSource = async function(id) {
      const titleEl = document.getElementById(`edit-reference-source-title-${id}`);
      const urlEl = document.getElementById(`edit-reference-source-url-${id}`);
      const contentEl = document.getElementById(`edit-reference-source-content-${id}`);
      const title = titleEl ? titleEl.value.trim() : '';
      const url = urlEl ? urlEl.value.trim() : '';
      const content = contentEl ? contentEl.value.trim() : '';
      if (!title) return showToast('名前を入力してください', 'warn');
      if (!url) return showToast('リンク（URL）を入力してください', 'warn');
      if (!/^https?:\/\//i.test(url)) return showToast('リンクは http:// か https:// で始まる形で入力してください', 'warn');
      if (!(await confirmSharedChange(`参照元「${title.slice(0, 40)}」を書き換えます。`))) return;

      try {
        const res = await fetch(`${API_BASE}/reference-sources/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, url, content })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        globalAppData.referenceSources = await res.json();
        editingReferenceSourceId = null;
        renderReferenceSourcesList();
        showToast('参照元を更新しました（全員に共有されます）', 'success');
      } catch (e) {
        console.warn('Source link update failed:', e);
        showToast(['更新できませんでした（共有先のサーバーにつながりません）', { text: 'サーバーが動いているか確かめてから、もう一度保存してください。入力した内容はこの画面に残っています。', detail: true }], 'error');
      }
    };

    function renderReferenceSourcesList() {
      const el = document.getElementById('list-reference-sources');
      if (!el) return;
      const items = globalAppData.referenceSources || [];
      if (items.length === 0) {
        el.innerHTML = `<p class="text-[10px] text-[var(--ink-muted)]">まだ参照元リンクは登録されていません。</p>`;
        return;
      }
      el.innerHTML = items.map(r => {
        if (r.id === editingReferenceSourceId) {
          return `
            <div class="flex flex-col gap-1.5 p-1.5 rounded-[var(--radius-sm)] border border-[var(--accent)] text-[11px]" style="background:var(--surface);">
              <input type="text" id="edit-reference-source-title-${r.id}" class="field text-[11px]" value="${escapeHtml(r.title)}" placeholder="名前">
              <input type="text" id="edit-reference-source-url-${r.id}" class="field text-[11px]" value="${escapeHtml(r.url)}" placeholder="リンク（URL）">
              <textarea id="edit-reference-source-content-${r.id}" rows="3" class="field resize-y text-[11px]" placeholder="（任意）内容をコピーして貼り付け">${escapeHtml(r.content || '')}</textarea>
              <div class="flex justify-end gap-1.5">
                <button onclick="cancelEditReferenceSource()" class="btn btn-ghost" style="padding:2px 8px;font-size:10px;">キャンセル</button>
                <button onclick="saveEditReferenceSource('${r.id}')" class="btn btn-primary" style="padding:2px 8px;font-size:10px;">保存</button>
              </div>
            </div>
          `;
        }
        const contentPreview = (r.content || '').trim();
        return `
          <div class="flex items-start justify-between gap-2 p-1.5 rounded-[var(--radius-sm)] border border-[var(--line-soft)] text-[11px]" style="background:var(--surface);">
            <div class="flex-1 min-w-0">
              ${/^https?:\/\//i.test(String(r.url || '').trim())
                ? `<a href="${escapeHtml(String(r.url).trim())}" target="_blank" rel="noopener noreferrer" class="font-semibold text-[var(--accent-dark)] break-words hover:underline"><i class="fa-solid fa-link text-[9px] mr-1"></i>${escapeHtml(r.title)}</a>`
                : `<span class="font-semibold text-[var(--accent-dark)] break-words"><i class="fa-solid fa-link text-[9px] mr-1"></i>${escapeHtml(r.title)}</span>`  }
              <div class="text-[9px] text-[var(--ink-muted)] break-all mt-0.5">${escapeHtml(r.url)}</div>
              ${contentPreview ? `<div class="text-[10px] text-[var(--ink)] break-words mt-1 line-clamp-2" style="opacity:.8;">${escapeHtml(contentPreview.slice(0, 200))}${contentPreview.length > 200 ? '…' : ''}</div>` : `<div class="text-[9px] text-[var(--ink-muted)] mt-1"><i class="fa-solid fa-triangle-exclamation"></i> 内容が未貼付のため、分類には反映されません（リンクのみ）</div>`}
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button onclick="startEditReferenceSource('${r.id}')" class="icon-btn" title="この参照元を編集"><i class="fa-solid fa-pen text-[9px]"></i></button>
              <button onclick="deleteReferenceSource('${r.id}')" class="icon-btn danger" title="この参照元を削除"><i class="fa-solid fa-trash text-[9px]"></i></button>
            </div>
          </div>
        `;
      }).join('');
    }

    // ==========================================================================

    // ==========================================================================
    const PRESENCE_ID_KEY = 'nursing_presence_id';
    let presenceClientId = null;
    try { presenceClientId = sessionStorage.getItem(PRESENCE_ID_KEY); } catch (e) { /* noop */ }
    if (!presenceClientId) {
      presenceClientId = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      try { sessionStorage.setItem(PRESENCE_ID_KEY, presenceClientId); } catch (e) { /* noop */ }
    }
    function updatePresenceUI(count) {
      const el = document.getElementById('presence-count');
      if (!el) return;
      el.textContent = typeof count === 'number' ? String(count) : '?';
    }
    async function sendPresenceHeartbeat() {
      try {
        const res = await fetch(`${API_BASE}/presence/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: presenceClientId })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        updatePresenceUI(data.count);
      } catch (e) {
        updatePresenceUI(null);
      }
    }
    sendPresenceHeartbeat();
    setInterval(sendPresenceHeartbeat, 20000);
