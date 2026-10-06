    // 看護アセスメント支援システム：10-reference-page-and-startup.js（全10ファイルのうち 10 番目）
    // 参考データのページと、起動時の処理（テスト用の module.exports を含む）。
    // index.html の <script> で 01〜10 の順に読み込み、1つのプログラムとして動きます
    // （順番を入れ替えないでください。以前の app.js を内容ごとに分けたものです）。

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['10'] = '2026-10-06.15'; // 版（scripts/stamp-version.js が書き込む）
    // ==========================================================================
    // 参考データ ページ：看護基準・院内プロトコル等をユーザーが自由に登録・編集できる。
    // 「不足情報をAI推定」の判断材料としても使われる（evaluateMissingInfoAI 参照）。
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
    // 【レビューで発見】以前は押したときの処理（onclick）の中に、IDを引用符で囲んでそのまま書いていた
    // （' を含むIDの参考データが共有先・ファイルから届くと、押したときにスクリプトが動く）。data-ref-id に入れてここで受け取る。
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
      }, { patientId: patId }); // 【レビューで発見】別の患者を表示中に押しても、その患者を共有先へ送り直す
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
          const ocrText = await callGeminiAI([{ parts: [{ text: "画像に含まれる看護基準・プロトコル・参考資料の内容を正確に文字起こししてください。" }, { inline_data: { mime_type: file.type || "image/jpeg", data: e.target.result.split(',')[1] } }] }]);
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
      // 【レビューで発見】以前は globalAppData をまるごと書き出していたため、ファイルに Gemini の APIキーまで入っていた
      // （先生や友だちにファイルを渡すとキーも渡ってしまう）。キーは入れず、カルテと学習内容だけを書き出す。
      const backup = { patients: globalAppData.patients, currentPatientId: globalAppData.currentPatientId, learningUserDict: globalAppData.learningUserDict };
      a.href = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      a.download = `nursing_assessment_all_patients_${Date.now()}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      showToast('全患者データを保存しました', 'success');
    });

    // ==========================================================================
    // 「ファイルから読込」（「データをファイルに保存」で書き出した .json を読み込む）
    // ------------------------------------------------------------------------
    // 【レビューで発見】以前は次の問題があった：
    //   ①読み込んだ直後に persistData() を呼んでいたため、入力欄に残っていた「前の患者」の記録メモが、
    //     読み込んだ患者の記録メモに上書きされていた（患者の切り替えと同じ順番の誤り）。
    //   ②中身を確かめずに今のカルテを置き換えていたため、患者が0人のファイルなどで画面全体が動かなくなった。
    //     カードの配列だけのファイルは、確認なしに今のカルテ全部を「読み込みデータ」1件に置き換えていた。
    //   ③IDやカードの形を確かめていなかった（タグの欄の記録が無いカードでタグの追加が失敗する等）。
    // 今は ①ファイルの中身を先に全部確かめて整える（この間は何も書き換えない） ②何人分を読み込むか確認する
    // ③今表示している患者の記録メモを今の患者に保存してから、読み込んだ患者を加える（同じIDの患者は置き換え、
    // ほかの患者はそのまま残す） ④入力欄に読み込んだ患者を表示し、保存・共有先への送信を予約する、の順にする。
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
      repairPatientRecordIds(p); // 同じIDのカードをまとめ、参考データのIDも確かめる
      return p;
    }
    // ファイルの文章を確かめて、読み込む内容を返す（globalAppData には触らない）。形が違えば日本語の理由で例外を投げる。
    function parseImportedDataText(text) {
      let parsed;
      try { parsed = JSON.parse(String(text || '').replace(/^\uFEFF/, '')); } catch (e) { throw new Error('JSONとして読めませんでした（「データをファイルに保存」で書き出した .json を選んでください）'); }
      let rawPatients, currentPatientId = null, learningUserDict = null;
      if (Array.isArray(parsed)) {
        // カードの配列だけのファイル（古い形式）は、1人分の新しい患者ページとして読み込む
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
    async function importPatientsDataText(text) {
      let data;
      try { data = parseImportedDataText(text); } catch (err) { showToast(['ファイルを読み込めませんでした', { text: err.message, detail: true }], 'warn'); return false; }
      const existingIds = new Set(globalAppData.patients.map(p => p.id));
      const replacing = data.patients.filter(p => existingIds.has(p.id)).length;
      const cardCount = data.patients.reduce((n, p) => n + p.items.length, 0);
      const ok = await openDialog({
        title: `${data.patients.length}件のカルテを読み込みますか？`,
        message: `カード ${cardCount}枚を含む ${data.patients.length}件のカルテを読み込みます。` +
          (replacing ? `\nそのうち ${replacing}件は、今ある同じカルテを読み込んだ内容で置き換えます。` : '') +
          '\nほかの今のカルテはそのまま残ります。' + (data.learningUserDict ? '\n学習データは、同じ文章の票（回数）の多い方を残して取り込みます。' : ''),
        confirmLabel: '読み込む'
      });
      if (ok !== true) return false;
      // ③今表示している患者の記録メモは、切り替える前に今の患者へ保存する
      if (typeof cancelSourceTextSave === 'function') cancelSourceTextSave();
      if (globalAppData.patients.some(p => p.id === globalAppData.currentPatientId)) persistData();
      const byId = new Map(data.patients.map(p => [p.id, p]));
      const kept = globalAppData.patients.filter(p => !byId.has(p.id));
      globalAppData.patients = [...kept, ...data.patients];
      if (data.learningUserDict) globalAppData.learningUserDict = mergeLearningDicts(globalAppData.learningUserDict, data.learningUserDict).dict;
      // notebookContent はサーバー側で全利用者共有・管理されるため、読み込みファイル（他端末の古い保存分の可能性がある）の値では上書きしない
      globalAppData.currentPatientId = data.currentPatientId;
      loadLocalState();            // ④入力欄に読み込んだ患者の記録メモを表示する（本文は書き換えない）
      savePatientsLocally();
      if (data.learningUserDict) { try { localStorage.setItem(LEARNING_DICT_STORAGE_KEY, JSON.stringify(globalAppData.learningUserDict)); } catch (e) { /* 保存できなくても画面では使える */ } }
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

    // globalAppData.notebookContent（学習データ管理画面の「分類基準」タブから編集・共有される）を
    // 裏側で常時グラウンディングに使用する（evaluateLabValuesAI / evaluateMissingInfoAI / 分類抽出プロンプト参照）。

    // 接続テストで成功したキー（保存時に、そのとき覚えた送り先を消さないため）
    let apiTestedOkKey = null;
    const lastTestedApiKeyOk = key => apiTestedOkKey !== null && apiTestedOkKey === key;
    // 入力中のキーの種類（AI Studio / Vertex AI など）を入力欄の下に表示する
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
        // 選んでいるモデルで試す（「保存」を押す前でも、選んだモデルで接続を確かめられるように）
        let prevPref = null;
        try { prevPref = localStorage.getItem('gemini_model_pref'); localStorage.setItem('gemini_model_pref', document.getElementById('select-gemini-model').value); } catch (e) { /* 無視 */ }
        const r = await testGeminiConnection(tested);
        try { if (prevPref === null) localStorage.removeItem('gemini_model_pref'); else localStorage.setItem('gemini_model_pref', prevPref); } catch (e) { /* 無視 */ }
        apiTestedOkKey = r.ok ? tested : null;
        showApiTestResult(r.ok, `${r.ok ? '✓' : '✕'} ${r.message}\nキーの種類：${r.kindLabel}${r.ok ? '\n「保存」を押すと、このキーで各AI機能が使えます。' : ''}`);
      } finally {
        btn.disabled = false;
      }
    });
    document.getElementById('btn-close-settings').addEventListener('click', () => document.getElementById('modal-settings').classList.add('hidden'));
    document.getElementById('btn-save-settings').addEventListener('click', () => {
      const newKey = normalizeApiKey(document.getElementById('input-api-key').value);
      // キーを替えたら、前のキーで覚えた送り先は使わない（接続テストで覚えた直後なら残す）
      if (newKey !== globalAppData.apiKey && !lastTestedApiKeyOk(newKey)) { try { localStorage.removeItem('gemini_api_endpoint'); } catch (e) { /* 無視 */ } }
      globalAppData.apiKey = newKey;
      // 【レビューで発見】保存容量がいっぱいだとここで止まり、画面が閉じず他の設定も保存されなかった
      try { localStorage.setItem('gemini_api_key', globalAppData.apiKey); } catch (e) { showToast(['APIキーをこのブラウザに保存できませんでした', { text: 'このページを開いている間は使えますが、閉じると消えます。保存容量やブラウザの設定を確かめてください。', detail: true }], 'warn'); }
      try { localStorage.setItem(MASK_TERMS_STORAGE_KEY, document.getElementById('input-mask-terms').value); } catch (e) { /* 保存できなくても続ける */ }
      try { localStorage.setItem('gemini_model_pref', document.getElementById('select-gemini-model').value); } catch (e) { /* 保存できなくても続ける */ }
      renderClassifyModeSwitch(); // 「AIで分類」の説明（APIキーの有無）を描き直す
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
      // 【レビューで発見】サーバーは http(s) 以外のリンクを受け付けないため、送る前に知らせる
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
    // 【見直し】以前は「すべての学習履歴を消去」という名前だったが、実際に消えるのはこのブラウザの分だけで、
    // 全員で共有している学習ファイル（サーバー）は消えない（ページを開き直すと戻る）。名前と説明を実際の動きに
    // 合わせ、消す前に書き出し（バックアップ）を選べるようにした。
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
    ocrFileInput.addEventListener('change', e => { if(e.target.files[0]) doOcr(e.target.files[0]); });

    async function doOcr(file) {
      if (!(await requireApiKey('写真の文字起こし'))) return;
      document.getElementById('ocr-status').classList.remove('hidden');
      const reader = new FileReader();
      // 【レビューで発見】文字起こしは数秒〜かかるため、その間に別の患者に切り替えると、以前は結果が
      // 切り替えた先の患者の入力欄に足されていた。頼んだときの患者に足す（その患者を表示中なら入力欄にも）。
      const ocrPatientId = getCurrentPatient().id;
      reader.onload = async e => {
        try {
          const ocrText = await callGeminiAI([{ parts: [{ text: "画像に含まれるカルテ記載や検査データ結果（WBC, CRP, Hb, クレアチニン等）を正確に文字起こししてください。" }, { inline_data: { mime_type: file.type || "image/jpeg", data: e.target.result.split(',')[1] } }] }]);
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

    // カルテスナップショットは、以前はタブを閉じた瞬間（beforeunload）だけに記録していたが、
    // ブラウザ・タブが正常に閉じられなかった場合（強制終了・クラッシュ・スマホでタブが
    // バックグラウンドのまま自動的に破棄される場合等）はbeforeunloadが発火せず、記録が
    // 全く残らないことがある（利用者からの要望：「ユーザーがタブを閉じなくても定期的に
    // 記録（バックアップを取るように）して」）。タブを開いている間も一定間隔で同じ内容を
    // 記録しておくことで、閉じ忘れ・クラッシュ時にも直近の状態に近いバックアップが残るようにする。
    // useBeacon=true（タブを閉じる瞬間）はnavigator.sendBeaconを使う（ページ遷移中でも送信が
    // 保証されるため）。それ以外（タブを開いている間の定期記録）は通常のfetchを使う
    // （ページが開いている間はsendBeaconである必要が無く、通常のfetchの方がエラーハンドリングもしやすい）。
    function captureAndSendPatientSnapshot(useBeacon) {
      // カード（items）が1件も無い患者ページばかりの場合、記録しても意味の無い空のスナップショットが
      // 積み重なるだけなので送らない（新規作成しただけで何も分類していないページ等が対象）。
      const hasAnyItems = globalAppData.patients.some(p => p.items && p.items.length > 0);
      if (!hasAnyItems) return;
      const snapshotPatients = globalAppData.patients.map(p => ({
        patientId: p.id, patientTitle: p.title, items: p.items, sourceText: p.sourceText
      }));
      const payload = JSON.stringify({ clientId: presenceClientId, patients: snapshotPatients });
      if (useBeacon) {
        try {
          const blob = new Blob([payload], { type: 'application/json' });
          // sendBeaconは戻り値(false)で「送信できなかった」ことを教えてくれるが、
          // 従来はこれを見ていなかった（ペイロードが大きすぎる等で失敗しても気付けなかった）。
          // falseの場合はkeepalive付きfetchでもう一度だけ試す（ページ遷移中でも送信を継続できる）。
          const queued = navigator.sendBeacon(`${API_BASE}/patient-snapshot`, blob);
          if (!queued) {
            fetch(`${API_BASE}/patient-snapshot`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: payload,
              keepalive: true
            }).catch(() => { /* こちらも失敗した場合は諦める（ブラウザ内のカルテには影響なし） */ });
          }
        } catch (err) { /* サーバー未接続などの場合は何もしない（ブラウザ内のカルテには影響なし） */ }
      } else {
        fetch(`${API_BASE}/patient-snapshot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload
        }).catch(() => { /* サーバー未接続時は定期バックアップをスキップするだけで、通常の利用には影響しない */ });
      }
    }
    // 間隔は短すぎるとサーバー負荷・記録件数の増加につながるため、「閉じ忘れ・クラッシュ対策の
    // バックアップ」として妥当な頻度（5分）にする。タブを開いている間、ページを離れなくても
    // この間隔で自動的にバックアップが積み重なっていく。
    setInterval(() => captureAndSendPatientSnapshot(false), 5 * 60 * 1000);

    // ===== カルテスナップショットの手動同期（「今すぐ同期」ボタン）=====
    // 通常は5分おきの定期バックアップとタブを閉じた瞬間にしか記録されないため、「今、この場で」
    // 今開いているカルテページの最新状態を確認・保存したい場合は待たされる（利用者からの要望：
    // 「今開いてるカルテページを学習データ管理のページのスナップショットからすぐに同期して
    // 保存できるボタンを作って」）。定期バックアップ（captureAndSendPatientSnapshot）と同じ
    // 送信内容（このブラウザタブが知っている全患者分のカード・カルテ本文）をその場で送信し、
    // 成功・失敗をトーストで知らせる。「学習データ管理」画面の「カルテスナップショット」タブが
    // 開いていれば、保存した内容がすぐ見えるよう一覧も自動で再取得する。
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
        // 「カルテスナップショット」タブが開いている場合は、保存した内容がすぐ見えるよう一覧を再取得する
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

    // カルテ内容・学習データはこのブラウザのlocalStorageに保存されるため、タブを閉じても
    // このブラウザ内では消えない。ただしサーバー側（他端末との共有・研究用途のファイル）への
    // 送信がまだ済んでいない可能性があるため、何か入力・登録済みの状態でタブを閉じよう／
    // 離脱しようとした場合は、ブラウザ標準の確認ダイアログで一声かける。
    // あわせて、学習内容（learningUserDict）をフォルダ内の学習専用ファイル（data/learning-dict.json）に
    // 念のためまとめて同期しておく。通常は変更のたびに即座に送信済みだが、通信できていなかった分の保険。
    window.addEventListener('beforeunload', e => {
      try {
        const blob = new Blob([JSON.stringify(globalAppData.learningUserDict)], { type: 'application/json' });
        navigator.sendBeacon(`${API_BASE}/learning-dict/sync`, blob);
      } catch (err) { /* サーバー未接続などの場合は何もしない（ブラウザ内学習には影響なし） */ }
      try {
        // 同時接続人数の表示から即座に外れるよう、タイムアウトを待たず退出を伝える
        const leaveBlob = new Blob([JSON.stringify({ clientId: presenceClientId })], { type: 'application/json' });
        navigator.sendBeacon(`${API_BASE}/presence/leave`, leaveBlob);
      } catch (err) { /* noop */ }
      try {
        // 患者カルテも、個別の同期（schedulePatientSync）が間に合っていなかった場合の保険として
        // このタブが知っている全患者分をまとめて送っておく（他の患者のデータを消すことはない）
        const patientsById = {};
        globalAppData.patients.forEach(p => { if (!deletedPatientIds.has(p.id)) patientsById[p.id] = p; });
        const patientsBlob = new Blob([JSON.stringify(patientsById)], { type: 'application/json' });
        navigator.sendBeacon(`${API_BASE}/patients/sync`, patientsBlob);
      } catch (err) { /* サーバー未接続などの場合は何もしない（ブラウザ内のカルテには影響なし） */ }
      // 上の /patients/sync は他端末のカードとマージされ続ける「最新の共有カルテ」を更新するためのもの。
      // それとは別に、「自分やほかの人がタブを閉じた（＝編集を終えた）瞬間、実際に何が入っていたか」を
      // 上書きせずそのまま記録として残す（学習データ管理画面の「カルテスナップショット」タブから閲覧できる）。
      captureAndSendPatientSnapshot(true);

      const hasData = globalAppData.patients.some(p =>
        (p.items && p.items.length > 0) ||
        (p.referenceNotes && p.referenceNotes.length > 0) ||
        (p.sourceText && p.sourceText.trim().length > 0)
      );
      // AIの処理の途中も、閉じる前に確かめる（閉じると結果が届かない）
      if (hasData || aiRequestsRunning > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    loadLocalState();
    setTimeout(() => notifyLostAiRequests(), 1200); // 前回、AIの処理の途中でページを閉じていたら知らせる
    loadSharedLearningDict(); // 起動時に一度、共有学習データ（全利用者分）を取得してローカル学習にマージ
    loadSharedPatients().then(() => loadLocalState()); // 起動時に一度、共有カルテ（他端末分）を取得してマージし、画面を再描画する
    loadSharedCriteria(); // 起動時に一度、AI抽出・分類基準への追加の要望（全利用者分）を取得しておく
    loadNotebookContent(); // 起動時に一度、NotebookLM基準ノート本体（他端末での編集分）を取得しておく
    loadCustomTagRules(); // 起動時に一度、全員で共有している追加キーワードを取得しておく

    // 版の確認（scripts/stamp-version.js の説明を参照）。index.html の版と、js/01〜13 の各ファイルの版が
    // そろっていなければ、OneDrive の同期などで一部のファイルが古い版に戻っているので画面の上に警告を出す。
    function checkAppFileVersions() {
      const meta = document.querySelector('meta[name="app-version"]');
      const expected = meta && meta.getAttribute('content');
      if (!expected) return [];
      const label = document.getElementById('app-version-label');
      if (label) label.textContent = expected;
      if (expected === 'dev') return [];
      const versions = window.APP_FILE_VERSIONS || {};
      const ids = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15'];
      // 2026-10-06.15 から、版は中身が変わったファイルだけ上げる（scripts/stamp-version.js）。index.html の
      // app-file-versions（「01:版,02:版,…」）に書いた各ファイルの版と比べる。無い古い index.html では全体の版と比べる。
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
        console.warn('ファイルの版がそろっていません:', { expected, versions });
      }
      return mismatched;
    }
    // js/11〜13 はこのファイルより後に読み込むので、すべてのファイルを読み込み終わってから確かめる
    if (document.readyState === 'complete') setTimeout(checkAppFileVersions, 0);
    else window.addEventListener('load', () => checkAppFileVersions());
    loadReferenceSources(); // 起動時に一度、参照元リンク（他端末での登録分）を取得しておく

// ブラウザでは `module` は存在しないため、このブロックは常に無視される（安全）。
// Node.js (node:test など) からこのファイルを読み込んでテストする場合にのみ、
// 分類ロジックの主要な関数・データをエクスポートする。
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    HENDERSON_NEEDS,
    DIAGNOSIS_TAG_HINTS,
    FIELD_LABELS,
    PATIENT_BACKGROUND_BASIC_FIELD_LABELS,
    classifyPatientBackground,
    evaluateLabFindings, buildLabTrendTable, computeClinicalIndices, extractSmoking, extractClinicalBasics, parseLabTrendEntries, parseLabReferenceRange, labTrendTableToTsv,
    isUntaggedItem, isOtherBasicInfoItem, isFamilySpeech, mergeLearningDicts, filterAndSortLearningEntries, formatHistoryDetail,
    detectAdmissionPhaseSignal,
    inferAssessmentColumn,
    FIELD_LABEL_DEFAULT_TAGS,
    GASTRIC_POSTOP_EXPECTED_CHECKS,
    LAB_ALIAS_FALLBACK_TESTS,
    LAB_ITEM_NAME_REGEX,
    parseAiReviewJson, buildAiReviewPrompt, buildAiReviewMarkdown,
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
    cleanExtractedPhrase,
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
    buildSelectedCardsExportText,
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
    // テスト用：画面の状態と、患者の切り替え・保存の処理を直接呼ぶ（tests/patient-switch-and-sync.test.js）
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

