    // 看護アセスメント支援システム：10-reference-page-and-startup.js（全10ファイルのうち 10 番目）
    // 参考データのページと、起動時の処理（テスト用の module.exports を含む）。
    // index.html の <script> で 01〜10 の順に読み込み、1つのプログラムとして動きます
    // （順番を入れ替えないでください。以前の app.js を内容ごとに分けたものです）。

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['10'] = '2026-09-28.25'; // 版（scripts/stamp-version.js が書き込む）
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
              <button onclick="openReferenceModal('${note.id}')" class="icon-btn" title="編集"><i class="fa-solid fa-pen"></i></button>
              <button onclick="deleteReferenceEntry('${note.id}')" class="icon-btn danger" title="削除"><i class="fa-solid fa-trash-can"></i></button>
            </div>
          </div>
          <p class="text-[var(--ink-muted)] leading-relaxed whitespace-pre-wrap break-words">${escapeHtml(note.text || '')}</p>
        `;
        frag.appendChild(card);
      });
      listEl.replaceChildren(frag);
    }

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
      if (!text) return showToast('内容を入力してください', 'error');
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
      });
    };

    const referenceOcrInput = document.getElementById('reference-ocr-input');
    document.getElementById('btn-reference-ocr').addEventListener('click', e => { e.preventDefault(); referenceOcrInput.click(); });
    referenceOcrInput.addEventListener('change', e => { if (e.target.files[0]) doReferenceOcr(e.target.files[0]); e.target.value = ''; });

    async function doReferenceOcr(file) {
      if (!globalAppData.apiKey) return showToast('API設定からキーを入力してください', 'error');
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
      a.href = URL.createObjectURL(new Blob([JSON.stringify(globalAppData, null, 2)], { type: 'application/json' }));
      a.download = `nursing_assessment_all_patients_${Date.now()}.json`;
      a.click(); showToast('全患者データを保存しました', 'success');
    });

    document.getElementById('input-load-data').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const parsed = JSON.parse(ev.target.result);
          if (parsed.patients && Array.isArray(parsed.patients)) {
            globalAppData.patients = parsed.patients;
            globalAppData.currentPatientId = parsed.currentPatientId || parsed.patients[0].id;
            if (parsed.learningUserDict) globalAppData.learningUserDict = parsed.learningUserDict;
            // notebookContent はサーバー側で全利用者共有・管理されるため、読み込みファイル（他端末の古い保存分の可能性がある）の値では上書きしない
          } else if (Array.isArray(parsed)) {
            globalAppData.patients = [{ id: 'patient_1', title: '読み込みデータ', items: parsed, sourceText: '', labEvaluationResult: '', referenceNotes: [], archived: false, updatedAt: null }];
            globalAppData.currentPatientId = 'patient_1';
          }
          persistData(); loadLocalState(); showToast('データを読み込みました', 'success');
        } catch (err) { showToast('ファイル形式が不正です', 'error'); }
      };
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
        const r = await testGeminiConnection(tested);
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
      localStorage.setItem('gemini_api_key', globalAppData.apiKey);
      try { localStorage.setItem(MASK_TERMS_STORAGE_KEY, document.getElementById('input-mask-terms').value); } catch (e) { /* 保存できなくても続ける */ }
      renderClassifyModeSwitch(); // 「AIで分類」の説明（APIキーの有無）を描き直す
      document.getElementById('modal-settings').classList.add('hidden');
      showToast('設定を保存しました', 'success');
    });
    document.getElementById('btn-add-extra-criteria').addEventListener('click', async () => {
      const input = document.getElementById('input-extra-criteria');
      const text = input.value.trim();
      if (!text) return showToast('内容を入力してください', 'error');
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
      if (!title) return showToast('名前を入力してください', 'error');
      if (!url) return showToast('リンク（URL）を入力してください', 'error');
      const result = await addReferenceSource(title, url, content);
      if (result === 'server') {
        titleInput.value = ''; urlInput.value = ''; contentInput.value = '';
        showToast('参照元を追加しました（全員に共有されます）', 'success');
      } else {
        showToast('サーバーに接続できなかったため保存できませんでした。時間を置いて再度お試しください', 'error');
      }
    });
    window.resetLearningData = async () => {
      const confirmed = await openDialog({ title: '今の画面の学習内容をリセットしますか？', message: '現在表示されているS/O振り分け等の学習内容をこの画面上から消去します（元に戻すにはページを再度開いてください）。', confirmLabel: 'リセットする', danger: true });
      if (confirmed) {
        const old = globalAppData.learningUserDict;
        globalAppData.learningUserDict = {};
        saveDataAndSync();
        showUndoToast('学習データをリセットしました', () => { globalAppData.learningUserDict = old; });
      }
    };

    const ocrDropzone = document.getElementById('ocr-dropzone'), ocrFileInput = document.getElementById('ocr-file-input');
    ocrDropzone.addEventListener('click', () => ocrFileInput.click());
    ocrDropzone.addEventListener('dragover', e => { e.preventDefault(); ocrDropzone.classList.add('drag-over'); });
    ocrDropzone.addEventListener('dragleave', () => ocrDropzone.classList.remove('drag-over'));
    ocrDropzone.addEventListener('drop', e => { e.preventDefault(); ocrDropzone.classList.remove('drag-over'); if(e.dataTransfer.files[0]) doOcr(e.dataTransfer.files[0]); });
    ocrFileInput.addEventListener('change', e => { if(e.target.files[0]) doOcr(e.target.files[0]); });

    async function doOcr(file) {
      if (!globalAppData.apiKey) return showToast('API設定からキーを入力してください', 'error');
      document.getElementById('ocr-status').classList.remove('hidden');
      const reader = new FileReader();
      reader.onload = async e => {
        try {
          const ocrText = await callGeminiAI([{ parts: [{ text: "画像に含まれるカルテ記載や検査データ結果（WBC, CRP, Hb, クレアチニン等）を正確に文字起こししてください。" }, { inline_data: { mime_type: file.type || "image/jpeg", data: e.target.result.split(',')[1] } }] }]);
          if (!ocrText) throw new Error('文字起こし結果が空でした');
          DOM.sourceText.value += (DOM.sourceText.value ? '\n' : '') + ocrText;
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
        showToast('保存できるカルテの内容がありません', 'error');
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
        showToast('スナップショットの保存に失敗しました（サーバーに接続できません）', 'error');
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
        globalAppData.patients.forEach(p => { patientsById[p.id] = p; });
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
      if (hasData) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    loadLocalState();
    loadSharedLearningDict(); // 起動時に一度、共有学習データ（全利用者分）を取得してローカル学習にマージ
    loadSharedPatients().then(() => loadLocalState()); // 起動時に一度、共有カルテ（他端末分）を取得してマージし、画面を再描画する
    loadSharedCriteria(); // 起動時に一度、AI抽出・分類基準への追加の要望（全利用者分）を取得しておく
    loadNotebookContent(); // 起動時に一度、NotebookLM基準ノート本体（他端末での編集分）を取得しておく
    loadCustomTagRules(); // 起動時に一度、全員で共有している追加キーワードを取得しておく

    // 版の確認（scripts/stamp-version.js の説明を参照）。index.html の版と、js/01〜10 の各ファイルの版が
    // そろっていなければ、OneDrive の同期などで一部のファイルが古い版に戻っているので画面の上に警告を出す。
    function checkAppFileVersions() {
      const meta = document.querySelector('meta[name="app-version"]');
      const expected = meta && meta.getAttribute('content');
      if (!expected) return [];
      const label = document.getElementById('app-version-label');
      if (label) label.textContent = expected;
      if (expected === 'dev') return [];
      const versions = window.APP_FILE_VERSIONS || {};
      const ids = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'];
      const mismatched = ids.filter(id => versions[id] !== expected);
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
    checkAppFileVersions();
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
    isUntaggedItem, isOtherBasicInfoItem,
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
    buildExportPlainText,
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
    buildEffectiveNotebookContent,
    normalizeCustomTagRules,
    isBuiltInKeywordOf,
    computeRuleReviewCandidates,
    buildRuleReviewReportText,
    setCustomTagRulesForTest: rules => { globalAppData.customTagRules = normalizeCustomTagRules(rules); }
  };
}

