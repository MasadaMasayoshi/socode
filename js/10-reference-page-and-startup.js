// Startup, references and image OCR. Validate image MIME/size; capture patient before async prompts.
// Reference notes are not automatic classification rules; file versions detect mixed/reverted assets.

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['10'] = '2026-10-10.znavigation17'; // Version stamp (scripts/stamp-version.js)
    // ==========================================================================

    // ==========================================================================
    function renderReferenceList() {
      const cp = getCurrentPatient();
      const notes = cp.referenceNotes || [];
      const listEl = document.getElementById('reference-list');
      const emptyEl = document.getElementById('reference-empty');
      emptyEl.classList.toggle('hidden', notes.length > 0);
      const frag = document.createDocumentFragment();
      notes.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).forEach(note => {
        const card = document.createElement('div');
        card.className = 'rec-card';
        card.innerHTML = `
          <div class="flex items-start justify-between gap-1">
            <span class="font-semibold text-[var(--ink)] text-xs break-words">${escapeHtml(note.title || '(無題)')}</span>
            <div class="flex items-center space-x-0.5 shrink-0">
              <button data-ref-action="edit" data-ref-id="${escapeHtml(note.id)}" class="icon-btn" title="編集"><i class="fa-solid fa-pen"></i></button>
              <button data-ref-action="delete" data-ref-id="${escapeHtml(note.id)}" class="icon-btn danger" title="削除"><i class="fa-solid fa-trash-can"></i></button>
            </div>
          </div>
          <p class="text-[var(--ink-muted)] leading-relaxed whitespace-pre-wrap break-words">${escapeHtml(note.text || '')}</p>
        `;
        frag.appendChild(card);
      });
      listEl.replaceChildren(frag);
    }

    document.getElementById('reference-list')?.addEventListener('click', e => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-ref-action]') : null;
      if (!btn) return;
      const id = btn.getAttribute('data-ref-id');
      if (btn.getAttribute('data-ref-action') === 'edit') window.openReferenceModal(id);
      else window.deleteReferenceEntry(id);
    });

    let referenceOcrPrefill = '';
    window.openReferenceModal = (id, prefillText) => {
      const cp = getCurrentPatient();
      const note = id ? (cp.referenceNotes || []).find(n => n.id === id) : null;
      document.getElementById('reference-editing-id').value = id || '';
      document.getElementById('reference-modal-title').textContent = note ? '参考データを編集' : '参考データを追加';
      document.getElementById('input-reference-title').value = note ? note.title : '';
      document.getElementById('input-reference-text').value = note ? note.text : (prefillText || referenceOcrPrefill || '');
      referenceOcrPrefill = '';
      document.getElementById('modal-reference-entry').classList.remove('hidden');
      setTimeout(() => document.getElementById('input-reference-title').focus(), 30);
    };
    window.closeReferenceModal = () => document.getElementById('modal-reference-entry').classList.add('hidden');
    document.getElementById('btn-close-reference').addEventListener('click', closeReferenceModal);
    document.getElementById('btn-reference-add').addEventListener('click', () => openReferenceModal(null));
    document.getElementById('btn-save-reference').addEventListener('click', () => {
      const cp = getCurrentPatient();
      const id = document.getElementById('reference-editing-id').value;
      const title = document.getElementById('input-reference-title').value.trim() || '(無題)';
      const text = document.getElementById('input-reference-text').value.trim();
      if (!text) return showToast('内容を入力してください', 'warn');
      cp.referenceNotes = cp.referenceNotes || [];
      const now = new Date().toISOString();
      if (id) {
        const note = cp.referenceNotes.find(n => n.id === id);
        if (note) { note.title = title; note.text = text; note.updatedAt = now; }
      } else {
        cp.referenceNotes.push({ id: 'ref_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6), title, text, updatedAt: now });
      }
      saveDataAndSync(); closeReferenceModal(); showToast('参考データを保存しました', 'success');
    });
    window.deleteReferenceEntry = async (id) => {
      const confirmed = await openDialog({ title: '参考データを削除しますか？', confirmLabel: '削除する', danger: true });
      if (!confirmed) return;
      const cp = getCurrentPatient();
      cp.referenceNotes = cp.referenceNotes || [];
      const idx = cp.referenceNotes.findIndex(n => n.id === id);
      if (idx === -1) return;
      const [removed] = cp.referenceNotes.splice(idx, 1);
      const patId = cp.id;
      saveDataAndSync();
      showUndoToast('参考データを削除しました', () => {
        const p = globalAppData.patients.find(x => x.id === patId);
        if (p) { p.referenceNotes = p.referenceNotes || []; p.referenceNotes.splice(Math.min(idx, p.referenceNotes.length), 0, removed); }
      }, { patientId: patId });
    };

    const referenceOcrInput = document.getElementById('reference-ocr-input');
    document.getElementById('btn-reference-ocr').addEventListener('click', e => { e.preventDefault(); referenceOcrInput.click(); });
    referenceOcrInput.addEventListener('change', e => { if (e.target.files[0]) doReferenceOcr(e.target.files[0]); e.target.value = ''; });

    async function doReferenceOcr(file) {
      if (!(await requireApiKey('写真の文字起こし'))) return;
      showToast('画像から文字起こし中...', 'info');
      const reader = new FileReader();
      reader.onload = async e => {
        try {
          const ocrText = await callGeminiAI([{ parts: [{ text: "Transcribe all nursing reference text in the image verbatim, in its original language. Return text only." }, { inline_data: { mime_type: file.type || "image/jpeg", data: e.target.result.split(',')[1] } }] }], { ocr: true });
          if (!ocrText) throw new Error('文字起こし結果が空でした');
          referenceOcrPrefill = ocrText;
          openReferenceModal(null, ocrText);
          showToast('文字起こしが完了しました。内容を確認して保存してください', 'success');
        } catch (err) {
          showAiErrorToast('写真の文字起こし（OCR）に失敗しました。', err);
        }
      };
      reader.readAsDataURL(file);
    }

    document.getElementById('btn-save-data').addEventListener('click', () => {
      saveDataAndSync();
      const a = document.createElement('a');

      const backup = { schemaVersion: 1, exportedAt: new Date().toISOString(), patients: globalAppData.patients, currentPatientId: globalAppData.currentPatientId, learningUserDict: globalAppData.learningUserDict };
      a.href = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      a.download = `nursing_assessment_all_patients_${Date.now()}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      showToast('全患者データを保存しました', 'success');
    });

    // ==========================================================================

    // ------------------------------------------------------------------------

    const IMPORT_ITEM_TYPES = ['s', 'o', 'unclassified', 'unnecessary'];
    const IMPORT_COL_VALUES = ['unclassified', 'preadmission', 'postadmission', 'missing'];
    function normalizeImportedItem(raw) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      if (typeof raw.text !== 'string') return null;
      const item = { ...raw };
      if (!isSafeRecordId(item.id)) item.id = raw.id ? repairedRecordId('item', raw.id) : 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      if (!IMPORT_ITEM_TYPES.includes(item.type)) item.type = 'unclassified';
      item.hendersonIds = Array.from(new Set((Array.isArray(raw.hendersonIds) ? raw.hendersonIds : []).map(Number).filter(h => Number.isInteger(h) && h >= 1 && h <= 14)));
      const cols = {};
      const rawCols = raw.assessmentCols && typeof raw.assessmentCols === 'object' && !Array.isArray(raw.assessmentCols) ? raw.assessmentCols : {};
      item.hendersonIds.forEach(h => { cols[h] = IMPORT_COL_VALUES.includes(rawCols[h]) ? rawCols[h] : 'unclassified'; });
      item.assessmentCols = cols;
      if (typeof item.timestamp !== 'string') item.timestamp = '日時不明';
      return item;
    }
    function normalizeImportedPatient(raw, k) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      const p = { ...raw };
      if (!isSafeRecordId(p.id)) p.id = raw.id ? repairedRecordId('patient', raw.id) : `patient_import_${Date.now()}_${k}`;
      p.title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : `読み込みデータ${k + 1}`;
      p.items = (Array.isArray(raw.items) ? raw.items : []).map(normalizeImportedItem).filter(Boolean);
      p.sourceText = typeof raw.sourceText === 'string' ? raw.sourceText : '';
      p.referenceNotes = (Array.isArray(raw.referenceNotes) ? raw.referenceNotes : []).filter(n => n && typeof n === 'object' && typeof n.text === 'string');
      p.archived = raw.archived === true;
      p.deletedItemIds = Array.isArray(raw.deletedItemIds) ? raw.deletedItemIds.filter(t => t && typeof t.id === 'string' && typeof t.at === 'string') : [];
      ['labEvaluationResult', 'contradictionResult', 'timelineResult', 'carePlanResult'].forEach(f => { if (p[f] != null && typeof p[f] !== 'string') delete p[f]; });
      repairPatientRecordIds(p);
      return p;
    }

    function parseImportedDataText(text) {
      let parsed;
      try { parsed = JSON.parse(String(text || '').replace(/^\uFEFF/, '')); } catch (e) { throw new Error('JSONとして読めませんでした（「データをファイルに保存」で書き出した .json を選んでください）'); }
      let rawPatients, currentPatientId = null, learningUserDict = null;
      if (Array.isArray(parsed)) {

        rawPatients = [{ id: `patient_import_${Date.now()}`, title: '読み込みデータ', items: parsed }];
      } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.patients)) {
        rawPatients = parsed.patients;
        currentPatientId = typeof parsed.currentPatientId === 'string' ? parsed.currentPatientId : null;
        if (parsed.learningUserDict && typeof parsed.learningUserDict === 'object' && !Array.isArray(parsed.learningUserDict)) learningUserDict = parsed.learningUserDict;
      } else {
        throw new Error('カルテのデータの形ではありません（patients の一覧がありません）');
      }
      const idMap = {};
      const seen = new Set();
      const patients = [];
      rawPatients.forEach((raw, k) => {
        const p = normalizeImportedPatient(raw, k);
        if (!p || seen.has(p.id)) return;
        if (raw && typeof raw.id === 'string') idMap[raw.id] = p.id;
        seen.add(p.id);
        patients.push(p);
      });
      if (!patients.length) throw new Error('読み込めるカルテ（患者ページ）が1件もありませんでした');
      if (Array.isArray(parsed) && !patients[0].items.length) throw new Error('読み込めるカードが1枚もありませんでした');
      const mapped = currentPatientId && idMap[currentPatientId];
      const current = patients.find(p => p.id === mapped && !p.archived) || patients.find(p => !p.archived) || patients[0];
      return { patients, currentPatientId: current.id, learningUserDict };
    }
    const IMPORT_CHECKPOINT_KEY = 'nursing_import_checkpoints_v1';
    function saveImportCheckpoint(snapshot) {
      try {
        let previous;
        try { previous = JSON.parse(localStorage.getItem(IMPORT_CHECKPOINT_KEY) || '[]'); } catch (e) { previous = []; }
        if (!Array.isArray(previous)) previous = [];
        const next = [snapshot, ...previous].slice(0, 3);
        return writeLocalVerified(IMPORT_CHECKPOINT_KEY, JSON.stringify(next));
      } catch (e) { return false; }
    }
    window.restoreImportCheckpoint = async function() {
      let snapshots;
      try { snapshots = JSON.parse(localStorage.getItem(IMPORT_CHECKPOINT_KEY) || '[]'); } catch (e) { snapshots = []; }
      let index = 0;
      if (Array.isArray(snapshots) && snapshots.length > 1) {
        const choice = await openDialog({ title: '読み込む控えを選ぶ', message: snapshots.map((x,i)=>`${i+1}：${x.exportedAt || '日時不明'}（${Array.isArray(x.patients)?x.patients.length:0}件）`).join('\n'), inputValue: '1', placeholder: '控えの番号', confirmLabel: '内容を確認' });
        if (choice === null) return false;
        index = Number(String(choice).trim()) - 1;
        if (!Number.isInteger(index) || index < 0 || index >= snapshots.length) { showToast('一覧にある控えの番号を入力してください', 'warn'); return false; }
      }
      const snapshot = Array.isArray(snapshots) && snapshots[index];
      if (!snapshot) { showToast('このブラウザに読込前の控えはありません', 'info'); return false; }
      // Uses the same validation and replacement preview as file imports.
      return importPatientsDataText(JSON.stringify(snapshot));
    };
    function importCardChanges(existing, incoming) {
      const before = new Map((existing?.items || []).filter(x=>!x.deleted).map(x=>[x.id,x]));
      const after = new Map((incoming.items || []).filter(x=>!x.deleted).map(x=>[x.id,x]));
      let added=0, removed=0, changed=0;
      for (const [id,item] of after) {
        if (!before.has(id)) added++;
        else if (JSON.stringify(before.get(id)) !== JSON.stringify(item)) changed++;
      }
      for (const id of before.keys()) if (!after.has(id)) removed++;
      return {added,removed,changed};
    }
    async function importPatientsDataText(text) {
      let data;
      try { data = parseImportedDataText(text); } catch (err) { showToast(['ファイルを読み込めませんでした', { text: err.message, detail: true }], 'warn'); return false; }
      const existingIds = new Set(globalAppData.patients.map(p => p.id));
      const replacing = data.patients.filter(p => existingIds.has(p.id)).length;
      const importTargetIds = data.patients.map(p=>p.id);
      const beforePreview = JSON.stringify(globalAppData.patients.filter(p=>importTargetIds.includes(p.id)));
      const changes = data.patients.reduce((sum,p)=>{ const old=globalAppData.patients.find(x=>x.id===p.id); if(old){const d=importCardChanges(old,p); for(const key of Object.keys(sum))sum[key]+=d[key];} return sum; },{added:0,removed:0,changed:0});
      const cardCount = data.patients.reduce((n, p) => n + p.items.length, 0);
      const ok = await openDialog({
        title: `${data.patients.length}件のカルテを読み込みますか？`,
        message: `カード ${cardCount}枚を含む ${data.patients.length}件のカルテを読み込みます。` +
          (replacing ? `\nそのうち ${replacing}件は、今ある同じカルテを読み込んだ内容で置き換えます。\n置換対象のカード：追加 ${changes.added}枚・削除 ${changes.removed}枚・変更 ${changes.changed}枚。` : '') +
          '\nほかの今のカルテはそのまま残ります。' + (data.learningUserDict ? '\n学習データは、同じ文章の票（回数）の多い方を残して取り込みます。' : ''),
        confirmLabel: '読み込む'
      });
      if (ok !== true) return false;
      if (beforePreview !== JSON.stringify(globalAppData.patients.filter(p=>importTargetIds.includes(p.id)))) {
        showToast('確認中にカルテが更新されました。最新の内容を確認してから読み込み直してください', 'warn');
        return false;
      }

      if (typeof cancelSourceTextSave === 'function') cancelSourceTextSave();
      if (globalAppData.patients.some(p => p.id === globalAppData.currentPatientId)) persistData();
      if (replacing > 0) {
        // Preserve a user-managed local copy before the same-ID records are replaced.
        const snapshot = {
          schemaVersion: 1, exportedAt: new Date().toISOString(), reason: 'before-import-conflict',
          patients: globalAppData.patients, currentPatientId: globalAppData.currentPatientId,
          learningUserDict: globalAppData.learningUserDict
        };
        if (!saveImportCheckpoint(snapshot)) {
          showToast('読込前の控えを保存できません。容量を確認してください。今のカルテは置き換えていません', 'warn');
          return false;
        }
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
        link.download = 'nursing_before_import_' + Date.now() + '.json';
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 10000);
        showToast('置換前のバックアップを保存してください', 'warn');
      }
      const byId = new Map(data.patients.map(p => [p.id, p]));
      const kept = globalAppData.patients.filter(p => !byId.has(p.id));
      globalAppData.patients = [...kept, ...data.patients];
      if (data.learningUserDict) globalAppData.learningUserDict = mergeLearningDicts(globalAppData.learningUserDict, data.learningUserDict).dict;

      globalAppData.currentPatientId = data.currentPatientId;
      loadLocalState();
      savePatientsLocally();
      if (data.learningUserDict) { try { localStorage.setItem(LEARNING_DICT_STORAGE_KEY, JSON.stringify(globalAppData.learningUserDict)); } catch (e) {   } }
      data.patients.forEach(p => schedulePatientSync(p.id));
      updateSaveStatus('saving');
      showToast(`${data.patients.length}件のカルテを読み込みました`, 'success');
      return true;
    }
    document.getElementById('input-load-data').addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => { importPatientsDataText(ev.target.result).catch(err => showToast(['ファイルを読み込めませんでした', { text: (err && err.message) || '', detail: true }], 'warn')); };
      reader.onerror = () => showToast('ファイルを読み込めませんでした', 'warn');
      reader.readAsText(file, 'utf-8');
      e.target.value = '';
    });

    let apiTestedOkKey = null;
    const lastTestedApiKeyOk = key => apiTestedOkKey !== null && apiTestedOkKey === key;

    function renderApiKeyKind() {
      const el = document.getElementById('api-key-kind');
      if (!el) return;
      const info = detectApiKeyKind(document.getElementById('input-api-key').value);
      el.textContent = info.kind === 'empty' ? 'Google AI Studio（aistudio.google.com）の「Get API key」で作ったキーを貼ってください（AQ.… でも AIza… でも使えます）。' : `キーの種類：${info.label}`;
      el.style.color = (info.kind === 'unknown' || info.kind === 'oauth') ? 'var(--brick)' : '';
    }
    function showApiTestResult(ok, text) {
      const el = document.getElementById('api-test-result');
      if (!el) return;
      el.classList.remove('hidden');
      el.textContent = text;
      el.style.borderColor = ok ? 'var(--accent)' : 'var(--brick)';
      el.style.color = ok ? 'var(--accent)' : 'var(--brick)';
    }
    document.getElementById('btn-open-settings').addEventListener('click', () => {
      document.getElementById('input-api-key').value = globalAppData.apiKey;
      document.getElementById('input-mask-terms').value = loadUserMaskTerms().join('\n');
      document.getElementById('select-gemini-model').value = geminiModelPref();
      document.getElementById('api-test-result')?.classList.add('hidden');
      renderApiKeyKind();
      document.getElementById('modal-settings').classList.remove('hidden');
    });
    document.getElementById('input-api-key').addEventListener('input', renderApiKeyKind);
    document.getElementById('btn-test-api').addEventListener('click', async () => {
      const btn = document.getElementById('btn-test-api');
      btn.disabled = true;
      showApiTestResult(true, '接続を確認しています…');
      document.getElementById('api-test-result').style.color = 'var(--ink-muted)';
      try {
        const tested = normalizeApiKey(document.getElementById('input-api-key').value);

        let prevPref = null;
        try { prevPref = localStorage.getItem('gemini_model_pref'); localStorage.setItem('gemini_model_pref', document.getElementById('select-gemini-model').value); } catch (e) {   }
        const r = await testGeminiConnection(tested);
        try { if (prevPref === null) localStorage.removeItem('gemini_model_pref'); else localStorage.setItem('gemini_model_pref', prevPref); } catch (e) {   }
        apiTestedOkKey = r.ok ? tested : null;
        showApiTestResult(r.ok, `${r.ok ? '✓' : '✕'} ${r.message}\nキーの種類：${r.kindLabel}${r.ok ? '\n「保存」を押すと、このキーで各AI機能が使えます。' : ''}`);
      } finally {
        btn.disabled = false;
      }
    });
    document.getElementById('btn-close-settings').addEventListener('click', () => document.getElementById('modal-settings').classList.add('hidden'));
    document.getElementById('btn-save-settings').addEventListener('click', () => {
      const newKey = normalizeApiKey(document.getElementById('input-api-key').value);

      if (newKey !== globalAppData.apiKey && !lastTestedApiKeyOk(newKey)) { try { localStorage.removeItem('gemini_api_endpoint'); } catch (e) {   } }
      globalAppData.apiKey = newKey;

      try { localStorage.setItem('gemini_api_key', globalAppData.apiKey); } catch (e) { showToast(['APIキーをこのブラウザに保存できませんでした', { text: 'このページを開いている間は使えますが、閉じると消えます。保存容量やブラウザの設定を確かめてください。', detail: true }], 'warn'); }
      try { localStorage.setItem(MASK_TERMS_STORAGE_KEY, document.getElementById('input-mask-terms').value); } catch (e) {   }
      try { localStorage.setItem('gemini_model_pref', document.getElementById('select-gemini-model').value); } catch (e) {   }
      renderClassifyModeSwitch();
      document.getElementById('modal-settings').classList.add('hidden');
      showToast('設定を保存しました', 'success');
    });
    document.getElementById('btn-add-extra-criteria').addEventListener('click', async () => {
      const input = document.getElementById('input-extra-criteria');
      const text = input.value.trim();
      if (!text) return showToast('内容を入力してください', 'warn');
      const ok = await addExtraCriteria(text);
      if (ok) { input.value = ''; showToast('追加の要望を保存しました（全員に共有されます）', 'success'); }
    });
    document.getElementById('btn-save-notebook-content').addEventListener('click', () => window.saveNotebookContent());
    document.getElementById('btn-add-reference-source').addEventListener('click', async () => {
      const titleInput = document.getElementById('input-reference-source-title');
      const urlInput = document.getElementById('input-reference-source-url');
      const contentInput = document.getElementById('input-reference-source-content');
      const title = titleInput.value.trim();
      const url = urlInput.value.trim();
      const content = contentInput.value.trim();
      if (!title) return showToast('名前を入力してください', 'warn');
      if (!url) return showToast('リンク（URL）を入力してください', 'warn');

      if (!/^https?:\/\//i.test(url)) return showToast('リンクは http:// か https:// で始まる形で入力してください', 'warn');
      const result = await addReferenceSource(title, url, content);
      if (result === 'cancelled') return;
      if (result === 'server') {
        titleInput.value = ''; urlInput.value = ''; contentInput.value = '';
        showToast('参照元を追加しました（全員に共有されます）', 'success');
      } else {
        showToast(['共有先に保存できませんでした（サーバーにつながりません）', { text: '時間を置いてもう一度保存してください。入力した内容はこの画面に残っています。', detail: true }], 'error');
      }
    });

    window.resetLearningData = async () => {
      const count = Object.keys(globalAppData.learningUserDict || {}).length;
      if (!count) return showToast('消去する学習データはありません', 'info');
      const choice = await openDialog({
        title: `このブラウザの学習内容（${count}件）を消去しますか？`,
        message: 'このブラウザに保存されている S/O・タグの学習内容を消去します。\n全員で共有している学習ファイル（サーバー）は消えないため、サーバーにつながった状態でページを開き直すと、共有の分は再び読み込まれます。\n念のため、消す前に書き出し（バックアップ）しておくことをおすすめします。',
        confirmLabel: '消去する', danger: true, secondaryLabel: '書き出してから消去'
      });
      if (choice !== true && choice !== 'secondary') return;
      if (choice === 'secondary' && !exportLearningData()) return;
      const old = globalAppData.learningUserDict;
      globalAppData.learningUserDict = {};
      saveDataAndSync();
      if (typeof renderAdminLearningList === 'function') renderAdminLearningList();
      showUndoToast('このブラウザの学習内容を消去しました', () => { globalAppData.learningUserDict = old; saveDataAndSync(); if (typeof renderAdminLearningList === 'function') renderAdminLearningList(); });
    };

    const ocrDropzone = document.getElementById('ocr-dropzone'), ocrFileInput = document.getElementById('ocr-file-input');
    ocrDropzone.addEventListener('click', () => ocrFileInput.click());
    ocrDropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ocrFileInput.click(); } });
    ocrDropzone.addEventListener('dragover', e => { e.preventDefault(); ocrDropzone.classList.add('drag-over'); });
    ocrDropzone.addEventListener('dragleave', () => ocrDropzone.classList.remove('drag-over'));
    ocrDropzone.addEventListener('drop', e => { e.preventDefault(); ocrDropzone.classList.remove('drag-over'); if(e.dataTransfer.files[0]) doOcr(e.dataTransfer.files[0]); });
    ocrFileInput.addEventListener('change', e => { const file = e.target.files[0]; e.target.value = ''; if (file) doOcr(file); });

    async function doOcr(file) {
      // Validate before opening credentials or reading an image; retain the initiating patient.
      if (!file || !/^image\/(?:jpeg|png|webp|gif)$/i.test(file.type || '')) return showToast('JPEG・PNG・WebP・GIFの画像を選んでください', 'warn');
      if (!file.size || file.size > 10 * 1024 * 1024) return showToast('画像は空でない10MB以下のファイルを選んでください', 'warn');
      const ocrPatientId = getCurrentPatient().id;
      if (!(await requireApiKey('写真の文字起こし'))) return;
      document.getElementById('ocr-status').classList.remove('hidden');
      const reader = new FileReader();

      reader.onerror = reader.onabort = () => {
        document.getElementById('ocr-status').classList.add('hidden');
        showToast('画像を読み込めませんでした。元の記録は変更していません。画像を選び直してください', 'error');
      };
      reader.onload = async e => {
        try {
          const ocrText = await callGeminiAI([{ parts: [{ text: "Transcribe all clinical notes and laboratory results in the image verbatim, in their original language. Return text only." }, { inline_data: { mime_type: file.type || "image/jpeg", data: e.target.result.split(',')[1] } }] }], { ocr: true });
          if (!ocrText) throw new Error('文字起こし結果が空でした');
          const target = globalAppData.patients.find(p => p.id === ocrPatientId);
          if (!target) throw new Error('文字起こしを頼んだ患者が見つかりません（削除された可能性があります）');
          if (getCurrentPatient().id === ocrPatientId) {
            DOM.sourceText.value += (DOM.sourceText.value ? '\n' : '') + ocrText;
          } else {
            target.sourceText = (target.sourceText || '') + (target.sourceText ? '\n' : '') + ocrText;
            target.updatedAt = new Date().toISOString();
            if (typeof schedulePatientSync === 'function') schedulePatientSync(target.id);
            showToast(`文字起こしの結果を「${target.title || '頼んだ患者'}」の入力欄に足しました`, 'info');
          }
          saveDataAndSync(); document.getElementById('ocr-status-text').innerHTML = '<i class="fa-solid fa-check"></i> 完了';
          setTimeout(() => document.getElementById('ocr-status').classList.add('hidden'), 2000);
        } catch (err) {
          showAiErrorToast('写真の文字起こし（OCR）に失敗しました。', err);
          document.getElementById('ocr-status').classList.add('hidden');
        }
      };
      reader.readAsDataURL(file);
    }

    function captureAndSendPatientSnapshot(useBeacon) {

      const hasAnyItems = globalAppData.patients.some(p => p.items && p.items.length > 0);
      if (!hasAnyItems) return;
      const snapshotPatients = globalAppData.patients.map(p => ({
        patientId: p.id, patientTitle: p.title, items: p.items, sourceText: p.sourceText
      }));
      const payload = JSON.stringify({ clientId: presenceClientId, patients: snapshotPatients });
      if (useBeacon) {
        try {
          const blob = new Blob([payload], { type: 'application/json' });

          const queued = navigator.sendBeacon(`${API_BASE}/patient-snapshot`, blob);
          if (!queued) {
            fetch(`${API_BASE}/patient-snapshot`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: payload,
              keepalive: true
            }).catch(() => {   });
          }
        } catch (err) {   }
      } else {
        fetch(`${API_BASE}/patient-snapshot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload
        }).catch(() => {   });
      }
    }

    setInterval(() => captureAndSendPatientSnapshot(false), 5 * 60 * 1000);

    window.syncCurrentPatientSnapshotNow = async function() {
      const btn = document.getElementById('btn-sync-snapshot-now');
      const hasAnyItems = globalAppData.patients.some(p => p.items && p.items.length > 0);
      if (!hasAnyItems) {
        showToast('保存できるカルテの内容がありません', 'warn');
        return;
      }
      const originalHtml = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 同期中...';
      }
      try {
        const snapshotPatients = globalAppData.patients.map(p => ({
          patientId: p.id, patientTitle: p.title, items: p.items, sourceText: p.sourceText
        }));
        const res = await fetch(`${API_BASE}/patient-snapshot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: presenceClientId, patients: snapshotPatients })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        showToast('今開いているカルテをスナップショットとして保存しました', 'success');

        const panel = document.getElementById('admin-panel-snapshots');
        if (panel && !panel.classList.contains('hidden')) {
          await loadAndRenderPatientSnapshots();
        }
      } catch (err) {
        console.warn('Manual snapshot sync error:', err);
        showToast(['スナップショットを保存できませんでした（共有先のサーバーにつながりません）', { text: 'サーバーが動いているか確かめてから、もう一度押してください。カルテ自体はこのブラウザに保存されています。', detail: true }], 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalHtml;
        }
      }
    };

    window.addEventListener('beforeunload', e => {
      try {
        const blob = new Blob([JSON.stringify(globalAppData.learningUserDict)], { type: 'application/json' });
        navigator.sendBeacon(`${API_BASE}/learning-dict/sync`, blob);
      } catch (err) {   }
      try {

        const leaveBlob = new Blob([JSON.stringify({ clientId: presenceClientId })], { type: 'application/json' });
        navigator.sendBeacon(`${API_BASE}/presence/leave`, leaveBlob);
      } catch (err) { /* noop */ }
      try {

        const patientsById = {};
        globalAppData.patients.forEach(p => { if (!deletedPatientIds.has(p.id)) patientsById[p.id] = p; });
        const patientsBlob = new Blob([JSON.stringify(patientsById)], { type: 'application/json' });
        navigator.sendBeacon(`${API_BASE}/patients/sync`, patientsBlob);
      } catch (err) {   }

      captureAndSendPatientSnapshot(true);

      const hasData = globalAppData.patients.some(p =>
        (p.items && p.items.length > 0) ||
        (p.referenceNotes && p.referenceNotes.length > 0) ||
        (p.sourceText && p.sourceText.trim().length > 0)
      );

      if (hasData || aiRequestsRunning > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    loadLocalState();
    setTimeout(() => notifyLostAiRequests(), 1200);
    loadSharedLearningDict();
    loadSharedPatients().then(() => loadLocalState());
    loadSharedCriteria();
    loadNotebookContent();
    loadCustomTagRules();

    function checkAppFileVersions() {
      const meta = document.querySelector('meta[name="app-version"]');
      const expected = meta && meta.getAttribute('content');
      if (!expected) return [];
      const label = document.getElementById('app-version-label');
      if (label) label.textContent = expected;
      if (expected === 'dev') return [];
      const versions = window.APP_FILE_VERSIONS || {};
      const ids = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15'];

      const perFile = {};
      const fvMeta = document.querySelector('meta[name="app-file-versions"]');
      String((fvMeta && fvMeta.getAttribute('content')) || '').split(',').forEach(pair => { const k = pair.indexOf(':'); if (k > 0) perFile[pair.slice(0, k).trim()] = pair.slice(k + 1).trim(); });
      const mismatched = ids.filter(id => versions[id] !== (perFile[id] || expected));
      if (mismatched.length) {
        const warn = document.getElementById('app-version-warning');
        if (warn) {
          warn.textContent = `⚠ プログラムのファイルの版がそろっていません（js フォルダの ${mismatched.map(id => `${id}（${versions[id] || '読み込めず'}）`).join('・')} が 版${expected} と違います）。` +
            'OneDrive の同期などで古いファイルに戻った可能性があります。最新のファイルを入れ直してから Ctrl+F5 で再読み込みしてください。';
          warn.classList.remove('hidden');
        }
        console.warn('Asset version mismatch:', { expected, versions });
      }
      return mismatched;
    }

    if (document.readyState === 'complete') setTimeout(checkAppFileVersions, 0);
    else window.addEventListener('load', () => checkAppFileVersions());
    loadReferenceSources();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    HENDERSON_NEEDS,
    DIAGNOSIS_TAG_HINTS,
    FIELD_LABELS,
    PATIENT_BACKGROUND_BASIC_FIELD_LABELS,
    classifyPatientBackground,
    evaluateLabFindings, analyzeLabCard, analyzeLabData, buildLabAssessment, isLabTextUnreliable, buildLabTrendTable, computeClinicalIndices, extractSmoking, extractClinicalBasics, parseLabTrendEntries, parseLabReferenceRange, labTrendTableToTsv,
    isUntaggedItem, isOtherBasicInfoItem, isFamilySpeech, mergeLearningDicts, filterAndSortLearningEntries, formatHistoryDetail,
    detectAdmissionPhaseSignal,
    inferAssessmentColumn,
    FIELD_LABEL_DEFAULT_TAGS,
    GASTRIC_POSTOP_EXPECTED_CHECKS,
    LAB_ALIAS_FALLBACK_TESTS,
    LAB_ITEM_NAME_REGEX,
    normalizeApiKey, detectApiKeyKind, geminiEndpointOrder, describeGeminiError, isEndpointMismatch, requestGemini, testGeminiConnection, GEMINI_ENDPOINTS, chooseBestFlashModel, isGeminiModelProblem,
    nextDayLabel, normalizeDayLabel, extractDayLabelFromHeading, timestampDayPart, timestampClockPart, groupItemsByDay, assessmentDayGroups, isAssessmentBackgroundItem, assessmentDisplayOrder, dayRank, groupItemsByScene, assessmentSceneKey, applySceneTagInheritance, expandCombinedLabItems,
    LAB_VALUE_TEST_REGEX,
    LAB_STANDARDS,
    formatLabValueString,
    mergePatientRecordClient,
    computeLearningTrendRows,
    buildLearningTrendSummary,
    findOtherCardsWithSameText,
    suggestHendersonTagsForText,
    hasLearnedSignal,
    hasBalancedBrackets,
    groupClinicalPhrasesWithTimestamps,
    detectMultipleHendersonTags,
    detectDiagnosisTagHints,
    fieldLabelHintTags,
    cleanExtractedPhrase, punctuateClause, splitCompoundSentences, joinWithPunctuation,
    isUnnecessaryBoilerplateText,
    isEmptyColonHeaderLine,
    hasOwnFieldLabelPrefix,
    isBareStatusWord,
    isBareFieldHeaderOnly,
    splitByNakatenList,
    splitIndependentActionPhrases,
    splitEnumeratedPhrases,
    predictLocalItemType,
    predictSOTypeFromNarrative,
    extractAbnormalLabFindings,
    detectGastricPostopMissingChecks,
    HIP_FRACTURE_POSTOP_EXPECTED_CHECKS,
    detectHipFracturePostopMissingChecks,
    PNEUMONIA_EXPECTED_CHECKS,
    detectPneumoniaMissingChecks,
    normalizeFieldLabelHeadingWord,
    FIELD_LABEL_HEADING_ALIASES,
    buildExportPlainText, htmlToPlainText, isUntouchedAiMissing, cleanAiText, notifyLostAiRequests, cardTextWithLabFlagsHtml, resetCardLabFlags, detectAgeGroupFromText,
    buildExportBodyHtml,
    findSourceHighlightRanges,
    buildSelectedCardsExportText, buildReviewRequestText, reviewRequestTargets, isEditedCard,
    buildAssessmentTableText,
    describeAutoRewrite,
    mergeShortFragmentCards,
    labCategoryTags,
    classifyTextByRules,
    maskPersonalInfo,
    restoreMaskedText,
    createMaskContext,
    buildEvidenceIndex,
    linkEvidenceCodes,
    formatAiResultHtml,
    parseDiagnosisCandidates,
    computeAiStepStatus,
    isMissingInfoOnlyItem,
    SAMPLE_TEXT,
    DEFAULT_NOTEBOOK_CONTENT,
    buildAssessmentPrintHtml,
    buildExportDocument,
    NOTEBOOK_CONTENT_VERSION_MARK,
    buildIntegratedNotebook, userAddedNotebookLines, notebookChapterFor,
    buildEffectiveNotebookContent, buildAssessmentNotebookContent,
    parseAiJsonLoose, parseAiJsonLooseInfo, parseAiJsonArray, parseDiagnosisCandidates,
    normalizeCustomTagRules,
    isBuiltInKeywordOf,
    computeRuleReviewCandidates,
    buildRuleReviewReportText,

    __testHooks: {
      state: () => globalAppData, DOM, persistData, changeCurrentPatient, createNewPatientPage,
      switchPatient: id => window.switchPatient(id), archivePatient: id => window.archivePatient(id),
      unarchivePatient: id => window.unarchivePatient(id),
      syncPatientToServer, schedulePatientSync, mergeItemsAfterInFlightEdits, loadSharedPatients,
      unsyncedPatientIds, deletedPatientIds, patientLocalRev, showToast
    },
    setCustomTagRulesForTest: rules => { globalAppData.customTagRules = normalizeCustomTagRules(rules); }
  };
}
