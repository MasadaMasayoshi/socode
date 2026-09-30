    // 看護アセスメント支援システム：05-app-state-and-ui.js（全10ファイルのうち 5 番目）
    // アプリ全体の状態（globalAppData）、画面部品（ダイアログ・通知）、患者ページ一覧、学習データ管理画面、Gemini AI の呼び出しなど。
    // index.html の <script> で 01〜10 の順に読み込み、1つのプログラムとして動きます
    // （順番を入れ替えないでください。以前の app.js を内容ごとに分けたものです）。

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['05'] = '2026-09-30.2'; // 版（scripts/stamp-version.js が書き込む）
    // ==========================================================================
    // 情報カードの不具合報告：カードごとの「報告」ボタンから送る内容を、
    // 同じブラウザタブ（＝ページを閉じるまで）の間は同じsessionIdで送ることで、
    // サーバー側で1人分の投稿としてまとめて記録できるようにする（presenceの仕組みと同様、
    // sessionStorageを使うのでタブを閉じれば次回は新しいsessionIdになる）。
    // ==========================================================================
    const CARD_REPORT_SESSION_KEY = 'nursing_card_report_session_id';
    let cardReportSessionId = null;
    try { cardReportSessionId = sessionStorage.getItem(CARD_REPORT_SESSION_KEY); } catch (e) { /* noop */ }
    if (!cardReportSessionId) {
      cardReportSessionId = 'rpt_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      try { sessionStorage.setItem(CARD_REPORT_SESSION_KEY, cardReportSessionId); } catch (e) { /* noop */ }
    }

    // 学習によって「何がどう変わったか」をユーザー自身が確認できるよう、サーバーへの送信とは別に
    // このブラウザ内にも変更履歴を保存しておく（サーバー未接続でも履歴が見られるようにするため）。
    const LEARNING_HISTORY_KEY = 'nursing_learning_history';
    const LEARNING_HISTORY_MAX = 300;
    let learningHistory = [];
    try { learningHistory = JSON.parse(localStorage.getItem(LEARNING_HISTORY_KEY) || '[]'); } catch (e) { learningHistory = []; }
    function addLearningHistoryEntry(text, action, payload) {
      learningHistory.push({ at: new Date().toISOString(), text, action, payload });
      if (learningHistory.length > LEARNING_HISTORY_MAX) learningHistory = learningHistory.slice(-LEARNING_HISTORY_MAX);
      try { localStorage.setItem(LEARNING_HISTORY_KEY, JSON.stringify(learningHistory)); } catch (e) { console.warn('学習履歴の保存に失敗しました:', e); }
    }

    // action: 'create' | 'type' | 'tagAdd' | 'tagRemove' | 'col' | 'edit' | 'delete'
    async function reportLearningEvent(text, action, payload) {
      addLearningHistoryEntry(text, action, payload); // サーバーの成否によらず、必ずローカル履歴には残す
      try {
        const res = await fetch(`${API_BASE}/learning-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, action, payload, at: new Date().toISOString() })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const updated = await res.json();
        if (updated && updated.dict) sharedLearningDict = updated.dict;
      } catch (e) {
        console.warn('共有学習イベントの送信に失敗しました（サーバー未接続の場合はローカル学習のみで動作します）:', e);
      }
    }

    // 患者カルテ一式は、サーバーへの共有保存（schedulePatientSync）とは別に、このブラウザにも
    // localStorageで保存しておく。以前はタブを閉じると消えるsessionStorageを使っていたが、
    // サーバーに接続できない・保存が間に合わなかった場合にタブやブラウザを閉じると内容が
    // 失われてしまうため、ブラウザを閉じても残るlocalStorageに変更した
    // （共用端末で使う場合は、各ブラウザの設定から消去できる）。
    const PATIENTS_STORAGE_KEY = 'nursing_patients_data';
    function loadPersistedPatients() {
      try {
        const raw = localStorage.getItem(PATIENTS_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.patients) && parsed.patients.length) return parsed;
      } catch (e) {
        console.warn('保存済みのカルテデータの読み込みに失敗しました:', e);
      }
      return null;
    }
    const persistedPatients = loadPersistedPatients();

    // 学習データ（learningUserDict）も同様に、サーバー側の学習専用ファイルへの保存とは別に、
    // このブラウザにもlocalStorageでバックアップを残す（サーバー未接続時でも、このブラウザ内では
    // 学習結果が引き続き活用され、ブラウザ／タブを閉じても消えないようにするため）。
    // サーバーから取得した共有学習データ（sharedLearningDict）は起動時に別途マージされる。
    const LEARNING_DICT_STORAGE_KEY = 'nursing_learning_dict';
    function loadPersistedLearningDict() {
      try {
        const raw = localStorage.getItem(LEARNING_DICT_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      } catch (e) {
        console.warn('保存済みの学習データの読み込みに失敗しました:', e);
      }
      return null;
    }
    const persistedLearningDict = loadPersistedLearningDict();

    let globalAppData = {
      patients: persistedPatients?.patients || [
        { id: 'patient_1', title: '患者A', items: [], sourceText: '', labEvaluationResult: '', referenceNotes: [], archived: false, updatedAt: null, deletedItemIds: [] }
      ],
      currentPatientId: persistedPatients?.currentPatientId || 'patient_1',
      // このブラウザにlocalStorageで保存されている学習データを起動直後の初期値とする
      // （無ければ空のまま）。この後、起動時に loadSharedLearningDict() がサーバー側の
      // 学習専用ファイル（data/learning-dict.json）の内容を取得し、ここへマージする
      // （サーバー未起動時は、このブラウザ内の学習データだけで動作する）。
      learningUserDict: persistedLearningDict || {},
      apiKey: normalizeApiKey(localStorage.getItem('gemini_api_key') || ''), // 前後の空白・引用符などは取り除いて使う
      notebookContent: DEFAULT_NOTEBOOK_CONTENT, // 起動直後の初期値。loadNotebookContent()でサーバー側の保存内容（あれば）に置き換わる
      // NotebookLM基準ノート本体は「学習データ管理」画面の「分類基準」タブから編集でき、
      // サーバー側 data/notebook-content.json に保存され全利用者で共有される。それに加えて、
      // 現場からの「こう抽出・分類してほしい」という追加の要望はここに積み上げる
      // （サーバー側 data/extraction-criteria.json に保存され、全利用者で共有）。
      additionalCriteria: [],
      // 利用者が登録した追加キーワード（detectMultipleHendersonTagsの下の「追加キーワード」の説明を参照）。
      // 分類のファイル（js/07-classification.js）の読み込み時にこのブラウザの写しが入り、
      // 起動後に loadCustomTagRules() でサーバーの共有内容に置き換わる。
      customTagRules: [],
      // 参照元リンク（NotebookLM等）。名前＋URL＋（任意で）貼り付けた内容の一覧。
      // サーバー側 data/reference-sources.json に保存され、全利用者で共有される。
      referenceSources: []
    };

    const DOM = {
      tabSoBoard: document.getElementById('tab-so-board'),
      tabAssessment: document.getElementById('tab-assessment'),
      tabReference: document.getElementById('tab-reference'),
      tabLabs: document.getElementById('tab-labs'),
      viewLabs: document.getElementById('view-labs'),
      viewSoBoard: document.getElementById('view-so-board'),
      viewAssessment: document.getElementById('view-assessment'),
      viewReference: document.getElementById('view-reference'),
      sourceText: document.getElementById('source-text'),
      toastContainer: document.getElementById('toast-container'),
      patientTabs: document.getElementById('patient-tabs-container'),
      labEvalContent: document.getElementById('lab-evaluation-content'),
      currentPatientTitle: document.getElementById('current-patient-title-label')
    };

    // ダークモード切り替え（夜勤帯向け）。この設定自体は学習データではなく個人の画面設定なので、
    // これまで通りlocalStorageに保存する（学習内容とは別の話）。
    const THEME_KEY = 'nursing_theme';
    function applyThemeIcon() {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const icon = document.querySelector('#btn-toggle-theme i');
      if (icon) icon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }
    // ヘッダーの「書き出し」「︙」メニュー。ボタンで開閉し、メニューの項目を選んだとき・外側を押したとき・Escで閉じる。
    function closeHeaderMenus(except) {
      document.querySelectorAll('.hdr-menu').forEach(m => {
        if (m.id === except) return;
        m.classList.add('hidden');
        const btn = document.querySelector(`[data-menu-toggle="${m.id}"]`);
        if (btn) btn.setAttribute('aria-expanded', 'false');
      });
    }
    document.addEventListener('click', e => {
      const toggle = e.target.closest('[data-menu-toggle]');
      if (toggle) {
        const menu = document.getElementById(toggle.getAttribute('data-menu-toggle'));
        const willOpen = menu.classList.contains('hidden');
        closeHeaderMenus(menu.id);
        menu.classList.toggle('hidden', !willOpen);
        toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        return;
      }
      // 項目を選んだら閉じる（ファイル選択の「読込」はファイルの画面が開くので同じく閉じてよい）
      if (e.target.closest('.hdr-menu-item') || !e.target.closest('.hdr-menu')) closeHeaderMenus();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeHeaderMenus(); });
    // 文字の書体（明朝＝Noto Serif JP が既定／ゴシック）。このブラウザに覚えておく
    function currentAppFont() { return document.documentElement.getAttribute('data-font') === 'gothic' ? 'gothic' : 'serif'; }
    function setAppFont(font) {
      document.documentElement.setAttribute('data-font', font === 'gothic' ? 'gothic' : 'serif');
      try { localStorage.setItem('nursing_font', font === 'gothic' ? 'gothic' : 'serif'); } catch (e) { /* 覚えられなくても今回は切り替える */ }
      const label = document.getElementById('font-current-label');
      if (label) label.textContent = font === 'gothic' ? 'ゴシック' : '明朝';
    }
    window.toggleAppFont = function() { setAppFont(currentAppFont() === 'gothic' ? 'serif' : 'gothic'); };
    setAppFont(currentAppFont());
    document.getElementById('btn-toggle-theme').addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* 保存できなくても表示上の切り替えは有効 */ }
      applyThemeIcon();
    });
    applyThemeIcon(); // <head>の先読みスクリプトが設定したテーマに合わせて、アイコンを起動時から一致させる

    function getCurrentPatient() {
      let p = globalAppData.patients.find(x => x.id === globalAppData.currentPatientId);
      if (!p) { p = globalAppData.patients.find(x => !x.archived) || globalAppData.patients[0]; globalAppData.currentPatientId = p.id; }
      if (!p.referenceNotes) p.referenceNotes = []; // 古い保存データとの互換性維持
      if (p.archived === undefined) p.archived = false;
      return p;
    }

    // 「n分前」「n時間前」のような相対時刻表示（患者一覧・ヘッダーの最終更新表示用）
    function formatRelativeTime(iso) {
      if (!iso) return '';
      const diffMs = Date.now() - new Date(iso).getTime();
      const min = Math.floor(diffMs / 60000);
      if (min < 1) return 'たった今';
      if (min < 60) return `${min}分前`;
      const hr = Math.floor(min / 60);
      if (hr < 24) return `${hr}時間前`;
      const day = Math.floor(hr / 24);
      if (day < 7) return `${day}日前`;
      const d = new Date(iso);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    }

    // 自動保存の状態表示。従来はローカル保存（sessionStorage）を行った時点で即座に「保存済み」と
    // 表示していたが、これはサーバーへの共有保存（schedulePatientSync）が実際に成功したかどうかを
    // 反映しておらず、サーバーが起動していない／通信できない場合でも常に「保存済み」と表示されてしまう
    // 問題があった（この端末内には保存されていても、他端末とは共有されていない状態を見分けられない）。
    // 'saving'＝サーバーへの保存を試行中、'saved'＝サーバーへの保存が確認できた、
    // 'error'＝サーバーへの保存に失敗した（この端末内のみ保存）、の3状態を表示に反映する。
    // 【保存先と状態を分けて表示】利用者からの指摘：「保存済み」「サーバー未接続」では、どこに保存できたのか分からない。
    // このブラウザへの保存（書いた後に読み直して確かめる：writeLocalVerified）と、共有先（サーバー）への保存
    // （サーバーの応答で確かめる：js/04 の syncPatientToServer）を分けて表示する。
    //   'saving'       … このブラウザに保存済み・共有先へ送っているところ
    //   'saved'        … 共有先に保存済み（サーバーが受け取ったことを確認した）
    //   'error'        … 共有先への保存に失敗（このブラウザには保存済み。押すと送り直す）
    //   'local-only'   … このブラウザに保存済み（HTMLファイルを直接開いていて共有先が無い）
    //   'local-failed' … このブラウザにも保存できなかった（容量不足など）
    let lastLocalSaveOk = true;
    let sourcePaneManual = null; // 記録メモの入力欄の広さ（updateSourcePaneLayout）
    let lastSharedSaveAt = null;
    function writeLocalVerified(key, value) {
      try {
        localStorage.setItem(key, value);
        const back = localStorage.getItem(key);
        return typeof back === 'string' ? back.length === value.length : true;
      } catch (e) {
        console.warn('このブラウザへの保存に失敗しました（保存容量が不足している可能性があります）:', e);
        return false;
      }
    }
    function updateSaveStatus(state = 'saved') {
      const el = document.getElementById('save-status-time');
      const iconEl = document.querySelector('#save-status i');
      const box = document.getElementById('save-status');
      if (!el) return;
      const hhmm = d => d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      if (!lastLocalSaveOk && state !== 'saved') state = 'local-failed';
      if (typeof IS_FILE_PROTOCOL !== 'undefined' && IS_FILE_PROTOCOL && (state === 'saving' || state === 'error')) state = 'local-only';
      const set = (icon, text, title) => { if (iconEl) iconEl.className = icon; el.textContent = text; if (box) { box.title = title; box.dataset.state = state; } };
      if (state === 'saving') set('fa-solid fa-circle-notch fa-spin text-[var(--ink-muted)] text-[9px]', 'このブラウザに保存済み・共有先へ保存中…', 'このブラウザには保存しました。共有先（サーバー）へ送っています');
      else if (state === 'error') set('fa-solid fa-triangle-exclamation text-[var(--brick)] text-[9px]', '共有先への保存に失敗（このブラウザには保存済み・押すと再送）', '共有先（サーバー）に保存できていません。このブラウザには残っています。自動で送り直します。押すとすぐに送り直します');
      else if (state === 'local-only') set('fa-solid fa-laptop text-[var(--ink-muted)] text-[9px]', 'このブラウザに保存済み（共有先なし）', 'HTMLファイルを直接開いているため、このブラウザだけに保存しています。他の端末とは共有されません');
      else if (state === 'local-failed') set('fa-solid fa-triangle-exclamation text-[var(--brick)] text-[9px]', 'このブラウザに保存できませんでした', 'ブラウザの保存容量が足りない可能性があります。「︙」→「データをファイルに保存」でバックアップを取ってください');
      else {
        lastSharedSaveAt = state === 'saved-earlier' ? lastSharedSaveAt : new Date();
        set('fa-solid fa-circle-check text-[var(--accent)] text-[9px]', `共有先に保存済み${lastSharedSaveAt && state !== 'saved-earlier' ? ` ${hhmm(lastSharedSaveAt)}` : ''}`, '共有先（サーバー）に保存したことを確認しました（このブラウザにも保存しています）');
      }
    }

    // 「未保存」の表示を押すと、保存できていないカルテをすぐに送り直す
    (() => {
      const box = document.getElementById('save-status');
      if (!box) return;
      box.style.cursor = 'pointer';
      box.title = '保存できていないときは、押すとすぐにサーバーへ送り直します';
      box.addEventListener('click', () => {
        if (!unsyncedPatientIds.size) return;
        updateSaveStatus('saving');
        retryUnsyncedPatients();
      });
    })();

    function updateCurrentPatientMeta() {
      const cp = getCurrentPatient();
      const el = document.getElementById('current-patient-updated');
      if (el) el.textContent = cp.updatedAt ? `(更新: ${formatRelativeTime(cp.updatedAt)})` : '';
    }

    // AIの失敗を、理由つきで長めに表示する（理由は callGeminiAI が日本語で付ける。Googleの説明文を含むので文字は変換して表示）
    function showAiErrorToast(prefix, err) {
      const reason = err && err.message ? err.message : '理由は分かりませんでした';
      console.warn(prefix, err);
      showToast([prefix, { text: reason, detail: true }], 'error', 9000);
    }
    // 【通知の出し方】利用者からの指摘により整理した：
    //   success … 短く、数秒（2.5秒）で消える
    //   info    … 少し長め（既定3.5秒）で消える
    //   warn    … 入力の不足など、その場で直せること（5秒で消える）
    //   error   … できなかったこと。「何ができなかったか・次に何をするか」を書き、×を押すまで残す
    function showToast(message, type = 'info', duration = null) {
      const toast = document.createElement('div');
      const styles = {
        success: 'background:var(--accent-soft);color:var(--accent-dark);border-color:var(--accent-line);',
        error: 'background:var(--brick-soft);color:var(--brick);border-color:var(--brick-line);pointer-events:auto;',
        warn: 'background:var(--gold-soft);color:var(--ink);border-color:var(--gold-line);',
        info: 'background:var(--surface);color:var(--ink);border-color:var(--line);'
      };
      const sticky = type === 'error';
      if (type === 'success') duration = Math.min(duration || 2500, 3000);
      else if (type === 'warn') duration = duration || 5000;
      else if (!sticky) duration = duration || 3500;
      toast.className = `toast-enter p-3 rounded-[var(--radius-sm)] border text-xs font-medium flex items-${Array.isArray(message) ? 'start' : 'center'} gap-2 panel-shadow toast-${type}`;
      toast.style.cssText = styles[type] || styles.info;
      toast.setAttribute('role', sticky ? 'alert' : 'status');
      const icon = type === 'success' ? 'fa-check' : type === 'error' ? 'fa-circle-exclamation' : type === 'warn' ? 'fa-triangle-exclamation' : 'fa-info-circle';
      // 【HTML注入の防止】通知の本文は textContent で入れる。以前は innerHTML に文字列をそのまま入れていたため、
      // 患者名（「「<img src=x onerror=…>」のカルテに切り替えました」など）がHTMLとして解釈され、
      // スクリプトが動く経路になっていた。複数行にしたいときは、行の配列を渡す（{ text, detail } は小さめの説明行）。
      const iconEl = document.createElement('i');
      iconEl.className = `fa-solid ${icon}`;
      const body = document.createElement('span');
      (Array.isArray(message) ? message : [message]).forEach((line, idx) => {
        const text = line && typeof line === 'object' ? String(line.text ?? '') : String(line ?? '');
        const row = document.createElement(idx === 0 ? 'span' : 'span');
        row.textContent = text;
        if (idx > 0) { row.style.display = 'block'; row.style.whiteSpace = 'pre-wrap'; }
        if (line && typeof line === 'object' && line.detail) row.style.fontWeight = '400';
        body.appendChild(row);
      });
      toast.append(iconEl, body);
      const dismiss = () => { toast.classList.replace('toast-enter', 'toast-exit'); setTimeout(() => toast.remove(), 300); };
      if (sticky) {
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'toast-close';
        close.setAttribute('aria-label', '閉じる');
        close.title = '確認したら閉じる';
        close.textContent = '×';
        close.addEventListener('click', dismiss);
        toast.append(close);
        // 同じ失敗の通知が重なって並ばないようにする
        const key = body.textContent;
        Array.from(DOM.toastContainer.children || []).forEach(t => { if (t.dataset && t.dataset.key === key) t.remove(); });
        if (toast.dataset) toast.dataset.key = key;
      }
      DOM.toastContainer.appendChild(toast);
      // 消える通知が増えすぎないようにする（古いものから消す）
      const transient = Array.from(DOM.toastContainer.children || []).filter(t => t.classList && !t.classList.contains('toast-error'));
      if (transient.length > 3) transient.slice(0, transient.length - 3).forEach(t => t.remove());
      if (!sticky) setTimeout(dismiss, duration);
    }

    // 削除・リセット系の操作の直後に「元に戻す」ボタン付きトーストを出す共通処理。
    // undoFn は元に戻す処理そのもの（呼び出し側でsaveDataAndSync等の再描画も行う）。
    function showUndoToast(message, undoFn) {
      const toast = document.createElement('div');
      toast.className = 'toast-enter p-3 rounded-[var(--radius-sm)] border text-xs font-medium flex items-center gap-3 panel-shadow';
      toast.style.cssText = 'background:var(--surface);color:var(--ink);border-color:var(--line);pointer-events:auto;';
      const undoIcon = document.createElement('i');
      undoIcon.className = 'fa-solid fa-clock-rotate-left text-[var(--ink-muted)]';
      const undoText = document.createElement('span');
      undoText.className = 'flex-1';
      undoText.textContent = message;
      const undoBtn = document.createElement('button');
      undoBtn.className = 'font-bold text-[var(--accent)] hover:underline whitespace-nowrap';
      undoBtn.textContent = '元に戻す';
      toast.append(undoIcon, undoText, undoBtn);
      let dismissed = false;
      const dismiss = () => { if (dismissed) return; dismissed = true; toast.classList.replace('toast-enter', 'toast-exit'); setTimeout(() => toast.remove(), 300); };
      undoBtn.addEventListener('click', () => {
        undoFn();
        saveDataAndSync();
        dismiss();
        showToast('元に戻しました', 'info');
      });
      DOM.toastContainer.appendChild(toast);
      setTimeout(dismiss, 6000);
    }

    // 汎用ダイアログ（window.prompt / window.confirm の代替。見た目をアプリ全体と統一する）
    const dialogEl = document.getElementById('modal-dialog');
    const dialogTitleEl = document.getElementById('dialog-title');
    const dialogMessageEl = document.getElementById('dialog-message');
    const dialogInputEl = document.getElementById('dialog-input');
    const dialogCancelBtn = document.getElementById('dialog-cancel');
    const dialogConfirmBtn = document.getElementById('dialog-confirm');
    // 「含めて書き出す／含めずに書き出す／キャンセル」のように、はい・いいえに加えて中止も選べる
    // 確認が必要な場合のための2つ目の選択ボタン（openDialogのsecondaryLabel。押すと'secondary'を返す）。
    const dialogSecondaryBtn = document.getElementById('dialog-secondary');
    let dialogResolve = null;

    function openDialog({ title, message = '', inputValue, placeholder = '', confirmLabel = 'OK', danger = false, secondaryLabel = null }) {
      return new Promise(resolve => {
        dialogResolve = resolve;
        dialogTitleEl.textContent = title;
        if (message) { dialogMessageEl.textContent = message; dialogMessageEl.classList.remove('hidden'); } else { dialogMessageEl.classList.add('hidden'); }
        if (inputValue !== undefined) {
          dialogInputEl.classList.remove('hidden');
          dialogInputEl.value = inputValue;
          dialogInputEl.placeholder = placeholder;
        } else {
          dialogInputEl.classList.add('hidden');
        }
        dialogConfirmBtn.textContent = confirmLabel;
        if (dialogSecondaryBtn) {
          dialogSecondaryBtn.textContent = secondaryLabel || '';
          dialogSecondaryBtn.classList.toggle('hidden', !secondaryLabel);
        }
        dialogConfirmBtn.style.cssText = danger ? 'background:var(--brick);border-color:var(--brick);color:var(--on-fill);' : '';
        dialogEl.classList.remove('hidden');
        if (inputValue !== undefined) setTimeout(() => { dialogInputEl.focus(); dialogInputEl.select(); }, 30);
      });
    }
    function closeDialog(result) {
      dialogEl.classList.add('hidden');
      if (dialogResolve) { dialogResolve(result); dialogResolve = null; }
    }
    dialogCancelBtn.addEventListener('click', () => closeDialog(null));
    if (dialogSecondaryBtn) dialogSecondaryBtn.addEventListener('click', () => closeDialog('secondary'));
    dialogConfirmBtn.addEventListener('click', () => closeDialog(dialogInputEl.classList.contains('hidden') ? true : dialogInputEl.value.trim()));
    dialogInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); dialogConfirmBtn.click(); } });
    dialogEl.addEventListener('click', e => { if (e.target === dialogEl) closeDialog(null); });

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }

    // ---- Gemini AI呼び出しの共通処理 ----
    // アプリ内の全AI機能（分類抽出・検査値評価・矛盾チェック・看護診断候補・経時変化サマリー・
    // 看護計画生成・不足情報推定・報告要約・OCR）が、この1つの関数を通してGemini APIを呼び出す。
    // contentsにはGemini APIの"contents"配列をそのまま渡す（通常のテキストプロンプトは
    // [{ role: "user", parts: [{ text: prompt }] }]、画像を含むOCRの場合は
    // [{ parts: [{ text }, { inline_data }] }] の形）。成功時は応答テキストをそのまま返し、
    // HTTPエラー時は分かりやすいメッセージで例外を投げる（呼び出し側のtry/catchで拾う想定）。
    // ==========================================================================
    // AIに送る前の個人情報の伏せ字（改善案F）
    // ------------------------------------------------------------------------
    // カルテの文章はGemini（外部のAI）へそのまま送られていた。以前アップロードされた文書には学籍番号・
    // 学生の氏名が入っていたこともあるため、送る直前に個人情報らしい語句を〈伏せ字1〉のような記号に
    // 置き換え、AIの答えが返ってきたら記号を元の語句に戻す（カードの本文などは元のまま残る）。
    // 伏せる対象：
    //   ①設定画面で登録した語句（このブラウザだけに保存し、サーバーには送らない）
    //   ②「氏名：」「学籍番号：」「病院名：」「住所：」「電話：」「生年月日：」等の見出しの後の値
    //   ③メールアドレス・電話番号・郵便番号・7桁以上の番号（学籍番号・ID等）
    //   ④「〇〇病院」「〇〇クリニック」等の固有の施設名（「総合病院」等の一般的な言い方は除く）
    //   ⑤「田中さん」「山田先生」等の敬称付きの名前（「息子さん」「看護師さん」等の続柄・職種は除く）
    // 画像（OCR）は伏せ字にできないため、送る前に一度だけ確認する（callGeminiAI参照）。
    // ==========================================================================
    const MASK_TERMS_STORAGE_KEY = 'nursing_ai_mask_terms';
    function loadUserMaskTerms() {
      try {
        return (localStorage.getItem(MASK_TERMS_STORAGE_KEY) || '').split(/\r?\n/)
          .map(s => s.normalize('NFKC').trim()).filter(s => s.length >= 2).slice(0, 300);
      } catch (e) { return []; }
    }
    const MASK_LABEL_REGEX = /((?:学生|患者|本人|家族|担当(?:教員|指導者|看護師|医)?|指導者|教員|キーパーソン)?(?:氏名|名前|姓名)|学籍番号|学生番号|学籍|患者ID|カルテ番号|診察券番号|(?:実習)?(?:病院名|施設名)|実習病院|実習施設|現?住所|電話番号|電話|TEL|携帯(?:番号)?|メールアドレス|メール|生年月日)(\s*[:：]\s*)((?:(?!\s+(?:学生|患者)?(?:氏名|名前|学籍番号|学生番号|電話番号|電話|住所|生年月日|実習病院|実習施設)\s*[:：])[^\n、。,，(（]){1,40})/gi;
    // すでに匿名になっている値（A氏・B様など）や、中身の無い値は伏せない
    const MASK_ALREADY_ANONYMOUS_REGEX = /^(?:[A-Za-zＡ-Ｚａ-ｚ]{1,2}\s*(?:氏|さん|様)?|なし|無し|不明|記載なし|-|ー|―)$/;
    const MASK_PATTERN_REGEXES = [
      /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,                 // メールアドレス
      /〒\s?\d{3}-?\d{4}/g,                              // 郵便番号
      /(?<![\d.])0\d{1,4}-\d{1,4}-\d{3,4}(?![\d.])/g,   // 電話番号（ハイフン付き）
      /(?<![\d.])0[5789]0\d{8}(?![\d.])/g,               // 携帯電話番号（ハイフン無し）
      /(?<![\d.])\d{7,}(?![\d.])/g                        // 7桁以上の番号（学籍番号・ID等。検査値にはまず現れない）
    ];
    const MASK_FACILITY_REGEX = /([一-龠々ァ-ヶーA-Za-z]{1,15})(大学(?:医学部)?附属病院|医療センター|クリニック|診療所|病院|医院)/g;
    // 施設名の前半がこれらだけなら一般的な言い方なので伏せない（「総合病院」「整形外科クリニック」等）
    const MASK_GENERIC_FACILITY_PREFIXES = new Set(['総合', '大学', '市民', '県立', '市立', '町立', '村立', '国立', '公立', '私立', '急性期', '回復期', '療養型', '療養', '精神科', '一般', '転院先', '転院', '前', '当', '同', '他', '近隣', '地域', '地元', 'かかりつけ', '専門', 'リハビリ', 'リハビリテーション', '整形外科', '内科', '外科', '歯科', '眼科', '皮膚科', '耳鼻科', '耳鼻咽喉科', '産婦人科', '婦人科', '小児科', '脳外科', '脳神経外科', '循環器', '消化器', '在宅', '訪問']);
    // 「様」は「苦悶様」「発作様」のような医学の言い回しと区別できないため対象にしない。「氏名」の「氏」も除く。
    const MASK_HONORIFIC_NAME_REGEX = /([一-龠々]{1,4}|[ァ-ヶー]{2,10})(さん|先生|医師|看護師|氏(?!名))/g;
    // 敬称の前がこれらで終わるなら、名前ではなく続柄・職種なので伏せない（「息子さん」「看護師長さん」等）
    const MASK_ROLE_WORDS = ['患者', '息子', '娘', '奥', '旦那', '孫', '嫁', '婿', '妻', '夫', '兄', '姉', '弟', '妹', '母', '父', '祖母', '祖父', '叔父', '叔母', '伯父', '伯母', '家族', '本人', '友人', '隣人', '同室者', '同室', '担当', '主治', '主治医', '受持', '受け持ち', '看護', '看護師', '師長', '主任', '部長', '院長', '医', '研修医', '担当医', '皆', '各位', '先輩', '後輩', '学生', '実習生', '指導者', '教員', '薬剤師', '栄養士', '技師', '保健師', '助産師', '介護士', '職員', '親戚', '親族', '義母', '義父', '長男', '次男', '三男', '長女', '次女', '三女', '訪問', '病棟', '外来', '専任', '認定', '専門', '夜勤', '日勤', '准', '同', '当', '本', '両', '彼', '某', '故',
      'ヘルパー', 'ケアマネ', 'ケアマネージャー', 'ケアマネジャー', 'ソーシャルワーカー', 'ワーカー', 'スタッフ', 'セラピスト', 'ナース', 'ドクター', 'リハビリ', 'ボランティア', '退院支援', '支援', '緩和ケア', '認定看護', '専門看護', '感染管理', '病棟担当'];
    function isRoleWord(word) { return MASK_ROLE_WORDS.some(r => word.endsWith(r)); }

    // text の中の個人情報らしい語句を〈伏せ字N〉に置き換える。ctx は1回のAI呼び出しの中で共有し、
    // 同じ語句には同じ記号を使う（ctx.originals[N] = 元の語句）。
    function createMaskContext(extraTerms) {
      return { originals: [], index: new Map(), extraTerms: (extraTerms || []).slice().sort((a, b) => b.length - a.length) };
    }
    function maskToken(ctx, original) {
      const key = original.trim();
      if (!key || key.includes('〈伏せ字')) return original;
      if (!ctx.index.has(key)) { ctx.originals.push(key); ctx.index.set(key, ctx.originals.length); }
      return original.replace(key, `〈伏せ字${ctx.index.get(key)}〉`);
    }
    function maskPersonalInfo(text, ctx) {
      if (typeof text !== 'string' || !text) return text;
      let out = text;
      ctx.extraTerms.forEach(term => { if (out.includes(term)) out = out.split(term).join(maskToken(ctx, term)); });
      out = out.replace(MASK_LABEL_REGEX, (m, label, sep, value) => {
        const v = value.replace(/\s+$/, '');
        // 「氏名： A氏 76歳 女性」のように匿名化済みの呼び方の後に年齢・性別等が続く場合も伏せない
        const firstToken = v.trim().split(/\s+/)[0];
        // 「学籍番号：********」のように、すでに＊などで伏せてある値はそのまま
        if (/^[*＊×✕xX〇○●■□\-－]+$/.test(firstToken)) return m;
        if (!v.trim() || MASK_ALREADY_ANONYMOUS_REGEX.test(v.trim()) || MASK_ALREADY_ANONYMOUS_REGEX.test(firstToken) || v.includes('〈伏せ字')) return m;
        return label + sep + maskToken(ctx, v) + value.slice(v.length);
      });
      MASK_PATTERN_REGEXES.forEach(re => { out = out.replace(re, m => maskToken(ctx, m)); });
      // 「B病院」のようにアルファベット1〜2文字だけの施設名は匿名化済みなので伏せない
      out = out.replace(MASK_FACILITY_REGEX, (m, name) => (MASK_GENERIC_FACILITY_PREFIXES.has(name) || isRoleWord(name) || /^[A-Za-z]{1,2}$/.test(name)) ? m : maskToken(ctx, m));
      out = out.replace(MASK_HONORIFIC_NAME_REGEX, (m, name) => isRoleWord(name) ? m : maskToken(ctx, name) + m.slice(name.length));
      return out;
    }
    function restoreMaskedText(text, ctx) {
      if (typeof text !== 'string' || !ctx || ctx.originals.length === 0) return text;
      return text.replace(/〈\s*伏せ字\s*(\d+)\s*〉/g, (m, n) => ctx.originals[Number(n) - 1] ?? m);
    }
    // 設定画面の「今の文章で伏せ字を確認」：入力欄の文章（無ければカード）に伏せ字を当てて、何が伏せられるかを見せる
    window.previewAiMasking = async function() {
      const termsBox = document.getElementById('input-mask-terms');
      const terms = termsBox ? termsBox.value.split(/\r?\n/).map(x => x.normalize('NFKC').trim()).filter(x => x.length >= 2) : loadUserMaskTerms();
      const cp = getCurrentPatient();
      const text = (DOM.sourceText.value || cp.sourceText || (cp.items || []).map(i => i.text).join('\n')).normalize('NFKC');
      if (!text.trim()) return showToast('確認する文章がありません（入力欄に文章を入れてください）', 'info');
      const ctx = createMaskContext(terms);
      maskPersonalInfo(text, ctx);
      const list = ctx.originals.map((o, k) => `〈伏せ字${k + 1}〉← ${o}`).join('\n');
      await openDialog({ title: `伏せ字になる語句：${ctx.originals.length}件`, message: ctx.originals.length ? `${list}\n\n伏せられていない個人情報があれば、「AIに送る前に伏せる語句」に追加してください。` : '個人情報らしい語句は見つかりませんでした。伏せたい語句があれば「AIに送る前に伏せる語句」に追加してください。', confirmLabel: '閉じる' });
    };
    // 画像（OCR）を送ってよいかの確認は、ページを開いている間に一度だけ
    let imageSendConfirmed = false;

    // 【改善案F】送る前に、文章の部分の個人情報らしい語句を伏せ字にし（maskPersonalInfo）、
    // 返ってきた答えの伏せ字を元の語句に戻す（restoreMaskedText）。画像を含む場合は送る前に確認する。
    // options.json=true：答えをJSONだけで返させる（AIで分類を評価する機能など、決まった形で受け取りたいとき）
    async function callGeminiAI(contents, options = {}) {
      const hasImage = contents.some(c => (c.parts || []).some(p => p.inline_data));
      if (hasImage && !imageSendConfirmed) {
        const ok = await openDialog({ title: '画像をAIに送りますか？', message: '画像はそのままAI（Gemini）に送られ、文字のように自動で伏せ字にすることはできません。\n氏名・学籍番号・病院名・患者さんを特定できる情報が写っていないか確認してから送ってください。', confirmLabel: '確認したので送る' });
        if (ok !== true) throw new Error('画像の送信を取りやめました');
        imageSendConfirmed = true;
      }
      const ctx = createMaskContext(loadUserMaskTerms());
      const maskedContents = contents.map(c => ({ ...c, parts: (c.parts || []).map(p => (typeof p.text === 'string' ? { ...p, text: maskPersonalInfo(p.text, ctx) } : p)) }));
      const body = { contents: maskedContents, ...(options.json ? { generationConfig: { responseMimeType: 'application/json' } } : {}) };
      const data = await requestGemini(globalAppData.apiKey, body);
      if (ctx.originals.length > 0) showToast(`AIに送る前に、個人情報らしい語句を${ctx.originals.length}件伏せ字にしました`, 'info');
      return restoreMaskedText(extractGeminiText(data), ctx);
    }

    // ---- Gemini への接続（キーの種類の見分け・送り先とモデルの選択・エラーの日本語化） ----
    // HTMLファイルを直接開いて（file://）使っても、AIはブラウザから直接Googleに送るので動く。
    // 【AQ.のキーへの対応】Google AI Studio で作るキーは、2026年から「AIza…」ではなく「AQ.…」で始まる新しい形式に
    // なった。以前はAQ.をGoogle Cloud（Vertex AI）のキーとみなして Vertex AI に先に送っていたため、「Agent Platform API
    // has not been used in project…」と断られていた。今は AQ. も AIza と同じ Gemini API（generativelanguage）に送り、
    // キーはURLに付けず x-goog-api-key ヘッダーで渡す（Googleの推奨。新しいキーでも確実に通る）。
    // 【モデルの提供終了への対応】固定の古いモデル（gemini-2.5-flash など）は提供が終わると 404 や
    // 「ACCESS_TOKEN_TYPE_UNSUPPORTED」（認証の失敗に見える紛らわしいエラー）になる。既定は常に最新の Flash を指す
    // 「gemini-flash-latest」を使い、モデルが使えないと言われたら、そのキーで使えるモデルの一覧を取得して
    // いちばん新しい Flash に切り替えて送り直す。つながったモデルは覚えておく。
    const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
    const GEMINI_DEFAULT_MODEL = 'gemini-flash-latest';
    // 一覧が取れないときに順に試すモデル（新しい順）
    const GEMINI_FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'];
    const GEMINI_ENDPOINTS = {
      // Gemini API（Google AI Studio のキー：AQ.… / AIza…）。キーはヘッダーで渡す
      studio: (key, model = GEMINI_DEFAULT_MODEL) => ({ url: `${GEMINI_API_BASE}/models/${model}:generateContent`, headers: { 'x-goog-api-key': key } }),
      // Google Cloud の Vertex AI（エクスプレスモード）。AI Studio で断られたときだけ試す
      vertex: (key, model = GEMINI_FALLBACK_MODELS[GEMINI_FALLBACK_MODELS.length - 1]) => ({ url: `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${encodeURIComponent(key)}`, headers: {} })
    };
    function storageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function storageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 保存できなくても動作には影響しない */ } }
    function currentGeminiModel() { return storageGet('gemini_model') || GEMINI_DEFAULT_MODEL; }

    // 貼り付けたときに付きやすい余分な文字（前後の空白・改行・引用符・「key=」など）を取り除く
    function normalizeApiKey(raw) {
      let k = String(raw || '').replace(/[\s　​﻿]+/g, '');
      k = k.replace(/^(?:GEMINI_API_KEY|GOOGLE_API_KEY|API_KEY|key)[=:]/i, '');
      k = k.replace(/^["'“”‘’「『]+|["'“”‘’」』]+$/g, '');
      return k;
    }

    // キーの形からどこで作ったキーかを見分ける
    function detectApiKeyKind(key) {
      const k = normalizeApiKey(key);
      if (!k) return { kind: 'empty', label: '未入力' };
      if (/^AIza[0-9A-Za-z_\-]{30,}$/.test(k)) return { kind: 'studio', label: 'Google AI Studio のキー（以前の形式 AIza…）' };
      if (/^AQ\.[0-9A-Za-z_\-.]{20,}$/.test(k)) return { kind: 'studio_aq', label: 'Google AI Studio のキー（新しい形式 AQ.…）' };
      if (/^ya29\./.test(k)) return { kind: 'oauth', label: '一時的なアクセストークン（ya29.…）※APIキーではありません' };
      return { kind: 'unknown', label: '見慣れない形式のキー' };
    }

    // 試す送り先の順番。AI Studio（Gemini API）を先に、AQ.や見慣れない形式のキーは Vertex AI も後で試す。
    // 前回つながった送り先を覚えておき、次からはそれを先に使う。
    function geminiEndpointOrder(key) {
      const kind = detectApiKeyKind(key).kind;
      let order = kind === 'studio' ? ['studio'] : ['studio', 'vertex'];
      const saved = storageGet('gemini_api_endpoint');
      if (saved && order.includes(saved)) order = [saved, ...order.filter(x => x !== saved)];
      return order;
    }

    // モデルが使えない（提供終了・名前が違う）ことを表すエラーか
    function isGeminiModelProblem(status, apiMessage) {
      const m = String(apiMessage || '');
      if (/ACCESS_TOKEN_TYPE_UNSUPPORTED|is not found for API version|models\/[\w.\-]+ is not found|not supported for generateContent|no longer (?:available|supported)|deprecated|has been (?:retired|shut ?down|discontinued)/i.test(m)) return true;
      return status === 404;
    }

    // HTTPのエラーを、利用者が次に何をすればよいか分かる日本語にする
    function describeGeminiError(status, apiMessage, kind, model) {
      const m = String(apiMessage || '');
      const detail = m ? `\n（Googleからの説明：${m.slice(0, 200)}）` : '';
      if (isGeminiModelProblem(status, m)) return `AIのモデル（${model || currentGeminiModel()}）が使えませんでした。新しいモデルへの自動の切り替えも失敗しています。少し時間をおいてもう一度「接続テスト」を押してください。${detail}`;
      if (/API key not valid|API_KEY_INVALID|invalid api key/i.test(m) || status === 401) {
        return `APIキーが正しくありません。Google AI Studio（aistudio.google.com）の「Get API key」でキーをもう一度コピーして「API設定」に貼り直してください。${detail}`;
      }
      if (/expired/i.test(m)) return `APIキーの有効期限が切れています。新しいキーを作り直してください。${detail}`;
      if (/leaked|reported as leaked/i.test(m)) return `このAPIキーは「外部に漏れた」とGoogleに判断され、止められています。新しいキーを作り直してください。${detail}`;
      if (status === 403) {
        if (/referer|referrer/i.test(m)) return `APIキーに「使ってよいWebサイト」の制限がかかっています。HTMLファイルを直接開くと制限に当てはまらないため、キーの制限を外すか、制限のないキーを使ってください。${detail}`;
        if (/not been used|disabled|SERVICE_DISABLED|has not been enabled/i.test(m)) return `このキーのプロジェクトで Gemini のAPIが有効になっていません。Google AI Studio（aistudio.google.com）の「Get API key」から作ったキーを使うか、Googleの説明にあるリンクを開いてAPIを有効にしてください。${detail}`;
        if (/billing/i.test(m)) return `このキーのプロジェクトで支払い（請求先アカウント）の設定が必要です。${detail}`;
        return `このAPIキーには Gemini を使う権限がありません。${detail}`;
      }
      if (status === 429) {
        if (isGeminiDailyQuota(m)) return `今日のAIの利用回数の上限（無料枠）に達しました。別のモデルへの切り替えも試しましたが使えませんでした。回数は太平洋時間の0時（日本時間の16時ごろ、冬は17時ごろ）に戻ります。すぐに使いたい場合は、Google AI Studio で支払いの設定（有料枠）をすると上限が大きく上がります。${detail}`;
        return `AIの利用回数の上限に達しました（送り直しと別のモデルへの切り替えも試しました）。1分ほど待ってからもう一度試してください（無料枠は1分あたり・1日あたりの回数に上限があります）。${detail}`;
      }
      if (status === 400) {
        if (/location|region|not supported/i.test(m)) return `この地域・このキーではAIが使えません。${detail}`;
        return `AIへの依頼の形が受け付けられませんでした（HTTP 400）。${detail}`;
      }
      if (status >= 500) return `Google側のAIが混み合っています（HTTP ${status}）。自動で3回送り直し、別のモデルへの切り替えも試しましたが、どれも混雑していました。数分おいてからもう一度試してください。${detail}`;
      return `AIの呼び出しに失敗しました（HTTP ${status}）。${detail}`;
    }

    // 送り先を切り替えて試すべきエラーか（キーと送り先が合っていないときに出るもの）
    function isEndpointMismatch(status, apiMessage) {
      if (status === 404) return true;
      if (status === 400 || status === 401 || status === 403) {
        return /API key not valid|API_KEY_INVALID|invalid api key|UNAUTHENTICATED|ACCESS_TOKEN_TYPE_UNSUPPORTED|not been used|SERVICE_DISABLED|has not been enabled|express mode|API keys are not supported|CREDENTIALS_MISSING/i.test(String(apiMessage || '')) || status === 401;
      }
      return false;
    }

    // そのキーで使えるモデルの一覧から、いちばん新しい安定版の Flash を選ぶ（lite・音声・画像・プレビュー版は除く）
    function chooseBestFlashModel(models) {
      const usable = (models || []).filter(m => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
        .map(m => String(m.name || '').replace(/^models\//, '')).filter(Boolean);
      const version = n => (n.match(/gemini-(\d+(?:\.\d+)?)/) || [0, '0'])[1].split('.').map(Number);
      const newerFirst = (a, b) => { const va = version(a), vb = version(b); return (vb[0] - va[0]) || ((vb[1] || 0) - (va[1] || 0)); };
      const stable = usable.filter(n => /^gemini-\d+(?:\.\d+)?-flash$/.test(n)).sort(newerFirst);
      if (stable.length) return stable[0];
      const anyFlash = usable.filter(n => /flash/.test(n) && !/lite|tts|image|live|audio|transcribe|embedding|omni/.test(n)).sort(newerFirst);
      return anyFlash[0] || null;
    }
    async function fetchGeminiModelList(key) {
      try {
        const res = await fetch(`${GEMINI_API_BASE}/models?pageSize=1000`, { headers: { 'x-goog-api-key': key } });
        if (!res.ok) return null;
        const j = await res.json();
        return (j && j.models) || null;
      } catch (e) { return null; }
    }
    async function discoverGeminiModel(key) {
      return chooseBestFlashModel(await fetchGeminiModelList(key));
    }

    // 【混雑・回数の上限への対応】利用者からの報告：「AIを使いたいのにずっと混雑していて…となる」。
    // 以前は 503（Google側の混雑）や 429（回数の上限）が1回返るとすぐにエラーにしていた。
    //  ①同じモデルで少し待って2回まで送り直す（1日の上限に達したときは待っても同じなので送り直さない）
    //  ②それでもだめなら、同じキーで使える別の Flash（軽量版の Flash-Lite や1つ前の版）に切り替える。
    //    モデルごとに混雑の状況と回数の上限が別なので、別のモデルなら通ることが多い。
    //    切り替え先はその回だけ使い、次からはまた普段のモデルを先に試す。
    const GEMINI_BUSY_ALTERNATIVES = ['gemini-flash-lite-latest'];
    function isGeminiTransientError(status) { return status === 429 || status === 500 || status === 502 || status === 503 || status === 504; }
    function isGeminiDailyQuota(apiMessage) { return /per ?day|PerDay|daily/i.test(String(apiMessage || '')); }
    function geminiRetryDelaysMs() { return Array.isArray(window.__geminiRetryDelaysMs) ? window.__geminiRetryDelaysMs : [2000, 5000]; }
    const geminiSleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    // 混雑しているときに切り替える別のモデル（そのキーで使える Flash の新しい順＋軽量版）
    async function geminiBusyAlternatives(key, tried) {
      const list = await fetchGeminiModelList(key);
      const names = (list || []).filter(m => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
        .map(m => String(m.name || '').replace(/^models\//, ''));
      const version = n => (n.match(/gemini-(\d+(?:\.\d+)?)/) || [0, '0'])[1].split('.').map(Number);
      const newerFirst = (a, b) => { const va = version(a), vb = version(b); return (vb[0] - va[0]) || ((vb[1] || 0) - (va[1] || 0)); };
      // 「-latest」はプレビュー版を指すことがあり（Googleの説明）、新しい版ほど混みやすい。
      // 安定版の Flash-Lite（新しい順）→ 1つ前の版の Flash → Flash-Lite の最新、の順に試す
      const lite = names.filter(n => /^gemini-\d+(?:\.\d+)?-flash-lite$/.test(n)).sort(newerFirst);
      const flash = names.filter(n => /^gemini-\d+(?:\.\d+)?-flash$/.test(n)).sort(newerFirst);
      const olderFlash = flash.slice(1);
      return [...lite, ...olderFlash, ...GEMINI_BUSY_ALTERNATIVES, ...flash.slice(0, 1), ...GEMINI_FALLBACK_MODELS.slice(1)]
        .filter((m, i, a) => a.indexOf(m) === i && !tried.has(m));
    }
    // 混雑のときにつながったモデルは30分だけ覚えておき、その間は最初から使う（毎回待たされないように）
    const GEMINI_BUSY_MODEL_KEY = 'gemini_busy_model';
    const GEMINI_BUSY_MODEL_TTL_MS = 30 * 60 * 1000;
    function recentBusyModel() {
      try {
        const v = JSON.parse(storageGet(GEMINI_BUSY_MODEL_KEY) || 'null');
        return v && v.model && Date.now() - v.at < GEMINI_BUSY_MODEL_TTL_MS ? v.model : null;
      } catch (e) { return null; }
    }
    // 利用者が「API設定」で選ぶモデルの好み：auto（おすすめ）／lite（軽くて混みにくい）／flash（標準）
    const GEMINI_MODEL_PREFS = { auto: null, lite: 'gemini-flash-lite-latest', flash: GEMINI_DEFAULT_MODEL };
    function geminiModelPref() { const v = storageGet('gemini_model_pref'); return Object.prototype.hasOwnProperty.call(GEMINI_MODEL_PREFS, v) ? v : 'auto'; }
    function firstStudioModel() {
      const pref = geminiModelPref();
      if (pref === 'lite') return recentBusyModel() && /lite/.test(recentBusyModel()) ? recentBusyModel() : GEMINI_MODEL_PREFS.lite;
      return recentBusyModel() || (pref === 'flash' ? GEMINI_DEFAULT_MODEL : currentGeminiModel());
    }

    function extractGeminiText(data) {
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const text = parts.map(p => (p.thought ? '' : (p.text || ''))).join('');
      if (!text) {
        const reason = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason;
        if (reason && reason !== 'STOP') throw new Error(`AIが答えを返しませんでした（理由：${reason}）。内容を短くするか、もう一度試してください。`);
      }
      return text;
    }

    const GEMINI_NETWORK_ERROR = 'AI（Google）に接続できませんでした。インターネット接続、広告ブロックなどの拡張機能、学校・病院のネットワーク制限（googleapis.com への通信が止められていないか）を確認してください。';
    async function postGemini(ep, key, model, body) {
      const { url, headers } = GEMINI_ENDPOINTS[ep](key, model);
      let res;
      try {
        res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
      } catch (e) {
        throw new Error(GEMINI_NETWORK_ERROR);
      }
      if (res.ok) return { ok: true, data: await res.json(), model };
      let apiMessage = '';
      try {
        const j = await res.json();
        const e = (Array.isArray(j) ? j[0]?.error : j?.error) || {};
        apiMessage = e.message || '';
        if (e.status && !apiMessage.includes(e.status)) apiMessage = `${e.status}: ${apiMessage}`;
        // 理由（ACCESS_TOKEN_TYPE_UNSUPPORTED・API_KEY_INVALID など）は details に入っていることがあるので添える
        const reasons = (Array.isArray(e.details) ? e.details : []).map(d => d && d.reason).filter(r => r && !apiMessage.includes(r));
        if (reasons.length) apiMessage += ` [${reasons.join(', ')}]`;
      } catch (e) { apiMessage = ''; }
      return { ok: false, status: res.status, apiMessage, model };
    }
    // 1つの送り先で、モデルが使えなければ別のモデルに切り替えて試す（最大4回）
    async function tryGeminiEndpoint(ep, key, body) {
      const tried = new Set();
      const first = ep === 'studio' ? firstStudioModel() : (storageGet('gemini_model') && storageGet('gemini_model') !== GEMINI_DEFAULT_MODEL ? storageGet('gemini_model') : GEMINI_FALLBACK_MODELS[0]);
      let queue = [first];
      let discovered = false;
      let last = null;
      let busyFallback = false;
      while (queue.length && tried.size < 5) {
        const model = queue.shift();
        if (tried.has(model)) continue;
        tried.add(model);
        let r = await postGemini(ep, key, model, body);
        // ①混雑・回数の上限：少し待って同じモデルに送り直す
        if (!r.ok && isGeminiTransientError(r.status) && !isGeminiDailyQuota(r.apiMessage)) {
          for (const wait of geminiRetryDelaysMs()) {
            await geminiSleep(wait);
            r = await postGemini(ep, key, model, body);
            if (r.ok || !isGeminiTransientError(r.status)) break;
          }
        }
        if (r.ok) {
          if (busyFallback && ep === 'studio') storageSet(GEMINI_BUSY_MODEL_KEY, JSON.stringify({ model, at: Date.now() }));
          return busyFallback || model === recentBusyModel() || geminiModelPref() !== 'auto' ? { ...r, viaBusyFallback: true } : r;
        }
        // 覚えていた混雑回避のモデルがだめになったら忘れる
        if (model === recentBusyModel()) { try { localStorage.removeItem(GEMINI_BUSY_MODEL_KEY); } catch (e) { /* 無視 */ } }
        last = r;
        // ②それでも混雑・上限なら、別のモデルに切り替える（AI Studio のみ）
        if (isGeminiTransientError(r.status)) {
          if (ep !== 'studio') return r;
          if (!busyFallback) { busyFallback = true; queue = await geminiBusyAlternatives(key, tried); }
          continue;
        }
        if (!isGeminiModelProblem(r.status, r.apiMessage)) return r;
        // モデルが使えない：一覧から最新の Flash を探し（AI Studio のみ）、だめなら既知のモデルを順に試す
        if (ep === 'studio' && !discovered) {
          discovered = true;
          const best = await discoverGeminiModel(key);
          if (best) queue.unshift(best);
        }
        if (!queue.length) queue = GEMINI_FALLBACK_MODELS.filter(m => !tried.has(m));
      }
      return last;
    }

    // キーと依頼内容を受け取り、合う送り先・モデルに送って応答（JSON）を返す。失敗時は日本語のエラーを投げる。
    let lastGeminiModelUsed = null;
    async function requestGemini(rawKey, body) {
      const key = normalizeApiKey(rawKey);
      if (!key) throw new Error('APIキーが設定されていません。右上の︙→「API設定」でキーを保存してください。');
      const kind = detectApiKeyKind(key).kind;
      if (kind === 'oauth') throw new Error('入力されているのはAPIキーではなく一時的なアクセストークン（ya29.…）です。Google AI Studio の「Get API key」でAPIキーを作って貼ってください。');
      const order = geminiEndpointOrder(key);
      let firstError = null;
      for (let i = 0; i < order.length; i++) {
        const ep = order[i];
        const r = await tryGeminiEndpoint(ep, key, body);
        if (r.ok) {
          lastGeminiModelUsed = r.model;
          storageSet('gemini_api_endpoint', ep);
          // 混雑のために一時的に切り替えたモデルは覚えない（次からはまた普段のモデルを先に使う）
          if (ep === 'studio' && !r.viaBusyFallback) storageSet('gemini_model', r.model);
          return r.data;
        }
        const err = new Error(describeGeminiError(r.status, r.apiMessage, kind, r.model));
        err.status = r.status; err.endpoint = ep; err.apiMessage = r.apiMessage;
        // 最初の送り先（AI Studio）のエラーを優先して見せる
        if (!firstError) firstError = err;
        if (i < order.length - 1 && isEndpointMismatch(r.status, r.apiMessage)) continue;
        if (firstError !== err) {
          const other = err.endpoint === 'studio' ? 'Google AI Studio 側' : 'Vertex AI 側';
          firstError.message += `\n［${other}でも失敗：HTTP ${err.status}${err.apiMessage ? ' ' + err.apiMessage.slice(0, 120) : ''}］`;
        }
        throw firstError;
      }
      throw firstError;
    }

    // 「API設定」の接続テスト：入力中のキーで短い依頼を送り、結果を文章で返す（キーは保存しない）
    async function testGeminiConnection(rawKey) {
      const info = detectApiKeyKind(rawKey);
      if (info.kind === 'empty') return { ok: false, kindLabel: info.label, message: 'APIキーを入力してください。' };
      try {
        const data = await requestGemini(rawKey, { contents: [{ role: 'user', parts: [{ text: '接続テストです。「OK」とだけ答えてください。' }] }] });
        const ep = storageGet('gemini_api_endpoint');
        const where = ep === 'vertex' ? 'Vertex AI' : `Gemini API・モデル ${lastGeminiModelUsed || currentGeminiModel()}`;
        return { ok: true, kindLabel: info.label, message: `接続できました（${where}）。AIの機能が使えます。${extractGeminiText(data) ? '' : '（応答は空でした）'}` };
      } catch (e) {
        return { ok: false, kindLabel: info.label, message: e.message };
      }
    }

    // AIの応答テキスト（改行と**強調**だけを使う簡易マークダウン形式で返ってくる想定）を
    // 表示用HTMLに変換する共通処理。応答が空だった場合はfallbackの文言を使う。
    // AIの答えに「<」等が含まれても表示が崩れないよう、先に文字をHTML用に変換してから整える。
    // evidence（改善案A。buildEvidenceIndex参照）を渡すと、〔C3〕のような根拠のカードの番号を、
    // 押すとそのカードへ移動できる小さなボタンに置き換える。
    // 【読みやすさの改善】利用者からの要望：「AIが作成した文章をもう少し読みやすく、要点を分かりやすく」。
    // 以前は改行と**太字**しか整えていなかったため、AIが使う見出し（###）・箇条書き（* - 1.）・引用（>）・区切り線（---）が
    // 記号のまま表示され、「〜の視点から…まとめました」のような前置きも残っていた。また根拠のカード〔C3〕の後ろの「。」が
    // 次の行に取り残されていた。ここで次のように整える：
    //   ・前置き（「ご提示いただいた…作成しました」等）と区切り線を取り除く
    //   ・見出し・箇条書き（入れ子も）・番号付きの箇条書き・引用を、表示用の形にする
    //   ・【要点】の見出しの下は、枠で囲んで目立たせる（AIへの指示文で、最初に要点を書かせている：AI_STYLE_INSTRUCTION）
    //   ・「根拠：」「理由：」などのラベルを太字にする
    //   ・根拠のカードの番号は句点の後ろにまとめ、同じ番号が続いたら1つにする
    function cleanAiText(text) {
      let s = String(text || '').replace(/\r/g, '');
      // 根拠のカードの番号の後ろの句読点を、番号の前に移す（「…推移〔C3〕〔C5〕。」→「…推移。〔C3〕〔C5〕」）
      s = s.replace(/((?:[ \t]*[〔【\[]\s*C\s*\d{1,4}(?:\s*[、,，・\/]?\s*C?\s*\d{1,4})*\s*[〕】\]])+)[ \t]*([。、．，])/g, '$2$1');
      // 同じ番号が続けて付いていたら1つにする
      s = s.replace(/([〔【\[]\s*C\s*(\d{1,4})\s*[〕】\]])(?:\s*[〔【\[]\s*C\s*\2\s*[〕】\]])+/g, '$1');
      const lines = s.split('\n');
      const PREAMBLE = /(?:視点から|視点より|に基づき|に基づいて|をもとに|を踏まえ)[^。]*(?:まとめ|作成|評価|指摘|提案|整理|解説)[^。]*[。.:：]?$|(?:まとめました|作成しました|指摘します|提案します|記載しています|示します|整理しました|解説します)[。.:：]?$|^(?:はい|承知しました|かしこまりました)[、。]/;
      let head = 0, dropped = 0;
      while (head < lines.length && dropped < 3) {
        const l = lines[head].trim();
        if (!l || /^(?:-{3,}|\*{3,}|_{3,}|━{3,})$/.test(l)) { head++; continue; }
        if (l.length <= 180 && PREAMBLE.test(l) && !/^[#■【*\-・\d]/.test(l)) { head++; dropped++; continue; }
        break;
      }
      return lines.slice(head).join('\n').trim();
    }
    function aiInlineHtml(t) {
      return escapeHtml(t)
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/^(根拠|理由|不足情報|目標|長期目標|短期目標|評価|注意|ポイント|結論|良い点|改善点|臨床的意味|検査値|所見)([：:])/, '<b class="ai-label">$1</b>$2');
    }
    function aiMarkdownToHtml(text) {
      const out = [];
      const lists = []; // { tag, indent }
      let para = [];
      let inKey = false;
      const flushPara = () => { if (para.length) { out.push(`<p>${para.join('<br>')}</p>`); para = []; } };
      const closeLists = (indent = -1) => { while (lists.length && lists[lists.length - 1].indent > indent) out.push(`</li></${lists.pop().tag}>`); };
      const closeKey = () => { if (inKey) { flushPara(); closeLists(); out.push('</div>'); inKey = false; } };
      String(text || '').split('\n').forEach(raw => {
        const line = raw.replace(/\t/g, '  ').replace(/\s+$/, '');
        const t = line.trim();
        let m;
        if (!t) { flushPara(); closeLists(); return; }
        if (/^(?:-{3,}|\*{3,}|_{3,}|━{3,})$/.test(t)) { flushPara(); closeLists(); return; }
        const heading = (m = t.match(/^#{1,6}\s*(.+)$/)) ? m[1] : (m = t.match(/^\*\*\s*(■.+?|【[^】]+】)\s*\*\*\s*$/)) ? m[1] : (m = t.match(/^(■\s*.+|【[^】]{1,20}】)$/)) ? m[1] : null;
        if (heading !== null) {
          flushPara(); closeLists();
          const title = heading.replace(/\*\*/g, '').trim();
          if (/^【?\s*要点\s*】?$|^要点[：:]?$/.test(title.replace(/^■\s*/, ''))) { closeKey(); out.push('<div class="ai-key"><div class="ai-key-title"><i class="fa-solid fa-thumbtack"></i> 要点</div>'); inKey = true; return; }
          closeKey();
          out.push(`<h4 class="ai-h">${aiInlineHtml(title.replace(/^【(.+)】$/, '$1'))}</h4>`);
          return;
        }
        if ((m = t.match(/^>\s?(.*)$/))) { flushPara(); closeLists(); if (m[1].trim()) out.push(`<blockquote class="ai-quote">${aiInlineHtml(m[1])}</blockquote>`); return; }
        const indent = (line.match(/^\s*/) || [''])[0].length;
        const ul = t.match(/^(?:[-*・•●]|\+)\s+(.+)$/);
        const ol = !ul && t.match(/^(\d{1,2})[.．)）]\s+(.+)$/);
        if (ul || ol) {
          flushPara();
          const tag = ul ? 'ul' : 'ol';
          const top = lists[lists.length - 1];
          if (!top || indent > top.indent) { out.push(`<${tag} class="ai-list">`); lists.push({ tag, indent }); }
          else {
            closeLists(indent);
            const cur = lists[lists.length - 1];
            if (cur && cur.tag !== tag && cur.indent === indent) { out.push(`</li></${lists.pop().tag}><${tag} class="ai-list">`); lists.push({ tag, indent }); }
            else if (!cur) { out.push(`<${tag} class="ai-list">`); lists.push({ tag, indent }); }
            else out.push('</li>');
          }
          out.push(`<li>${aiInlineHtml(ul ? ul[1] : ol[2])}`);
          return;
        }
        // 箇条書きのすぐ後ろの字下げした行は、その項目の続き
        if (lists.length && indent > 0) { out.push(`<br>${aiInlineHtml(t)}`); return; }
        closeLists();
        para.push(aiInlineHtml(t));
      });
      flushPara(); closeLists(); closeKey();
      return out.join('');
    }
    function formatAiResultHtml(text, fallback = '結果を取得できませんでした。', evidence = null) {
      const cleaned = cleanAiText(text);
      let html = cleaned ? aiMarkdownToHtml(cleaned) : `<p>${escapeHtml(fallback)}</p>`;
      if (evidence) html = linkEvidenceCodes(html, evidence);
      return `<div class="ai-text">${html}</div>`;
    }
    // AIへの指示文に付ける、書き方の指示（最初に要点、前置きなし、短い箇条書き、根拠の番号は文の終わり）
    const AI_STYLE_INSTRUCTION = '【書き方】前置き・あいさつ・「〜の視点から」「〜をまとめました」のような説明は書かず、すぐ本題から書いてください。最初に「### 要点」の見出しを置き、結論を2〜3個の短い箇条書き（1つ40字程度まで）で示してください。そのあと詳細を「### 見出し」と「- 」の箇条書きで書き、1つの箇条書きは1〜2文にしてください。根拠のカードの番号は、文の終わりの句点の後ろにまとめて付けてください。';

    function persistData() {
      const cp = getCurrentPatient();
      cp.sourceText = DOM.sourceText.value;
      cp.updatedAt = new Date().toISOString();
      // 患者カルテ・学習データのいずれも、サーバー側への保存（共有・研究用途）とは別に、
      // このブラウザのlocalStorageにも保存しておく。サーバーに接続できない場合や保存が
      // 間に合わなかった場合でも、このブラウザ内には確実に残るようにするため。
      // 書いた後に読み直して、このブラウザに確かに保存できたかを確かめる（容量超過などで保存できない場合も画面表示は続ける）
      const wasOk = lastLocalSaveOk;
      lastLocalSaveOk = writeLocalVerified(PATIENTS_STORAGE_KEY, JSON.stringify({ patients: globalAppData.patients, currentPatientId: globalAppData.currentPatientId }));
      if (!lastLocalSaveOk && wasOk) showToast(['このブラウザにカルテを保存できませんでした', { text: '保存容量が足りない可能性があります。「︙」→「データをファイルに保存」でバックアップを取り、使っていないカルテをアーカイブ・削除してください。', detail: true }], 'error');
      try {
        localStorage.setItem(LEARNING_DICT_STORAGE_KEY, JSON.stringify(globalAppData.learningUserDict));
      } catch (e) {
        console.warn('学習データのブラウザ内保存に失敗しました（ブラウザの保存容量が不足している可能性があります）:', e);
      }
      // 学習専用ファイル（data/learning-dict.json）へのサーバー側の反映は、変更のたびに
      // reportLearningEvent() が個別に、ページを閉じる時に beforeunload の sendBeacon がまとめて、
      // それぞれサーバーへ送ることで行う（このブラウザ内の保存とは別経路）。
      schedulePatientSync(cp.id); // 複数端末で共有できるよう、この患者カルテをサーバー側にも保存する（連続入力時は少し待ってまとめて送る）
      // この時点ではサーバーへの保存はまだ完了していない（schedulePatientSyncは少し待ってから送信するため）。
      // 実際に「保存済み」と表示するのは、syncPatientToServer()がサーバーからの成功応答を受け取った後。
      updateSaveStatus('saving');
      updateCurrentPatientMeta();
    }

    // 【患者の切り替えの順番】利用者からの報告：患者Aをアーカイブすると、切り替え先の患者Bの本文がAの本文で
    // 上書きされた。以前は「患者IDを切り替える → persistData()」の順だったため、persistData() が入力欄に
    // まだ表示されている患者Aの本文を、切り替え先の患者Bに書き込んでいた（新規作成・完全削除も同じ）。
    // 必ず ①今の患者を保存（入力欄の本文は今の患者に書き戻す） ②患者IDを切り替える ③画面を読み直す
    // ④どの患者を開いているかだけを保存（本文には触れない）の順にする。
    function savePatientsLocally() {
      lastLocalSaveOk = writeLocalVerified(PATIENTS_STORAGE_KEY, JSON.stringify({ patients: globalAppData.patients, currentPatientId: globalAppData.currentPatientId }));
      return lastLocalSaveOk;
    }
    function changeCurrentPatient(nextId, { saveCurrent = true } = {}) {
      const currentExists = globalAppData.patients.some(p => p.id === globalAppData.currentPatientId);
      if (saveCurrent && currentExists) persistData(); // ①入力欄の本文は、今表示している患者に保存する
      globalAppData.currentPatientId = nextId;          // ②
      loadLocalState();                                  // ③入力欄に切り替え先の本文を読み込む
      savePatientsLocally();                             // ④本文は書き換えず、開いている患者だけを覚える
      updateCurrentPatientMeta();
    }

    function saveDataAndSync() {
      persistData();
      renderSoBoard();
      renderAssessmentTable();
      renderReferenceList();
    }

    // ---- 複数端末での同時編集マージ用のしるし ----
    // 同じ患者カルテを複数端末が同時に編集すると、片方の端末が送った「カード一覧まるごと」が
    // もう片方の端末だけが知っている新しいカードを消してしまうことがある。これを防ぐため、
    // サーバー側（server.js の mergePatientRecord）はカード単位でマージする。その判断材料として、
    // 「このカードが最後にいつ書き換えられたか」(touchItem)と「このカードがいつ削除されたか」
    // (markItemDeleted、一定期間だけ保持する削除の記録＝tombstone)をカード操作のたびに付与する。
    function touchItem(item) {
      if (item) item._touchedAt = new Date().toISOString();
    }
    // カードを手で編集した履歴（何を・どう変えたか）をカード自身に記録する。
    // 利用者からの要望：「テキストを書き出すときに、何かしら編集されていた場合、何がどう編集されたか
    // わかるように書き出しをするようにしてください」。書き出し（buildCardsReportText）で
    // 「手で編集した履歴」として一覧にする。古い履歴から消して最大30件まで保持する。
    //   kind: 'text'（本文の編集 from→to）/ 'type'（分類の変更 from→to）/
    //         'tagAdd'・'tagRemove'（タグの追加・削除 hId）/ 'merge'（統合 from=[統合元の本文]）
    function logItemEdit(item, entry) {
      if (!item) return;
      const log = Array.isArray(item.editLog) ? item.editLog.slice() : [];
      log.push({ at: new Date().toISOString(), ...entry });
      item.editLog = log.slice(-30);
    }
    function markItemDeleted(cp, itemId) {
      if (!cp || !itemId) return;
      if (!Array.isArray(cp.deletedItemIds)) cp.deletedItemIds = [];
      cp.deletedItemIds = cp.deletedItemIds.filter(t => t && t.id !== itemId);
      cp.deletedItemIds.push({ id: itemId, at: new Date().toISOString() });
    }
    function unmarkItemDeleted(cp, itemId) {
      if (!cp || !Array.isArray(cp.deletedItemIds)) return;
      cp.deletedItemIds = cp.deletedItemIds.filter(t => t && t.id !== itemId);
    }

    // ---- 起動時（loadSharedPatients）のカード単位マージ ----
    // 【原因と修正】起動時にサーバー側の共有カルテとこのブラウザのカルテを統合する処理
    // （loadSharedPatients）は、これまで「患者カルテをまるごと」比較し、updatedAt（最終更新日時）が
    // 新しい方をそのまま採用していた。しかしserver.js側の通常の保存（PUT /api/patients/:id）は
    // 既にカード単位でマージしており（サーバー側のmergePatientRecord参照）、起動時だけこの
    // 「まるごと置き換え」方式になっていたのが食い違いの原因になっていた。
    // 例えば、①タブを開いたまま分類・カード追加をした直後（次回このタブを開き直すまでの間）に、
    // 別端末・別ブラウザで同じ患者を編集してサーバー側のupdatedAtがこのブラウザより新しくなった
    // 場合、②Render無料枠のサーバー起動待ち等でこの起動時マージが完了するより前に操作を始めて
    // しまった場合等に、サーバー側のカルテのほうが「新しい」と判定され、このブラウザだけが
    // 知っている新しいカードごと丸ごと消えてしまうことがあった（利用者からの報告：
    // 「たまに情報カードがリセットされてしまう」）。
    // server.js のmergePatientRecordと全く同じ考え方（カードの生死はID単位・_touchedAt／
    // tombstoneの新旧で判定し、タイトル・カルテ本文等それ以外の項目だけをupdatedAtの新しい方で
    // 採用する）をこのブラウザ側でも行うことで、起動時のマージでも片方だけが知っているカードを
    // 誤って消さないようにする。
    const ITEM_TOMBSTONE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 3日：server.js側と同じ保持期間
    function pruneTombstonesClient(list, now) {
      if (!Array.isArray(list)) return [];
      return list.filter(t => t && typeof t.id === 'string' && typeof t.at === 'string' && (now - new Date(t.at).getTime()) <= ITEM_TOMBSTONE_WINDOW_MS);
    }
    function itemEffectiveTimeClient(item, wholePatientUpdatedAt) {
      if (item && typeof item._touchedAt === 'string') {
        const t = new Date(item._touchedAt).getTime();
        if (!Number.isNaN(t)) return t;
      }
      if (wholePatientUpdatedAt) {
        const t = new Date(wholePatientUpdatedAt).getTime();
        if (!Number.isNaN(t)) return t;
      }
      return 0;
    }
    // 欲求ごとの自分のアセスメント（myAssessments）など「キー → { …, updatedAt }」の記録は、キーごとに新しい方を使う
    // （server.js の mergeKeyedRecords と同じ考え方）
    const PATIENT_KEYED_RECORD_FIELDS = ['myAssessments', 'missingChecks', 'carePlans', 'checkpoints'];
    function mergeKeyedRecordsClient(a, b) {
      const isMap = v => v && typeof v === 'object' && !Array.isArray(v);
      const time = r => { const t = r && typeof r.updatedAt === 'string' ? new Date(r.updatedAt).getTime() : NaN; return Number.isNaN(t) ? 0 : t; };
      if (!isMap(a)) return isMap(b) ? b : a;
      if (!isMap(b)) return a;
      const out = { ...a };
      Object.keys(b).forEach(k => { if (!(k in out) || time(b[k]) > time(out[k])) out[k] = b[k]; });
      return out;
    }
    function mergeKeyedPatientFieldsClient(first, second) {
      const out = {};
      PATIENT_KEYED_RECORD_FIELDS.forEach(f => {
        if ((first && f in first) || (second && f in second)) out[f] = mergeKeyedRecordsClient(first && first[f], second && second[f]);
      });
      return out;
    }
    function mergePatientRecordClient(local, server, now = Date.now()) {
      if (!server) return local;
      if (!local) return server;

      const localTime = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
      const serverTime = server.updatedAt ? new Date(server.updatedAt).getTime() : 0;
      // items・deletedItemIds以外の項目（タイトル・カルテ本文・検査値評価結果等）は、
      // 従来通りupdatedAtが新しい方をまるごと採用する（server.js側のisNotStale相当）。
      const base = localTime >= serverTime ? local : server;

      const localItems = Array.isArray(local.items) ? local.items : [];
      const serverItems = Array.isArray(server.items) ? server.items : [];
      const localById = new Map(localItems.filter(i => i && i.id).map(i => [i.id, i]));
      const serverById = new Map(serverItems.filter(i => i && i.id).map(i => [i.id, i]));

      const tombstonesById = new Map();
      [...pruneTombstonesClient(local.deletedItemIds, now), ...pruneTombstonesClient(server.deletedItemIds, now)].forEach(t => {
        const prev = tombstonesById.get(t.id);
        if (!prev || new Date(t.at).getTime() > new Date(prev.at).getTime()) tombstonesById.set(t.id, t);
      });
      const survivingTombstoneIds = new Set(tombstonesById.keys());

      // 並び順はローカル（このブラウザで今見えている順）を基本にし、サーバーだけが持つカードは末尾に足す
      const orderedIds = localItems.filter(i => i && i.id).map(i => i.id);
      serverItems.forEach(i => { if (i && i.id && !localById.has(i.id)) orderedIds.push(i.id); });

      const mergedItems = [];
      const seen = new Set();
      orderedIds.forEach(id => {
        if (seen.has(id)) return;
        seen.add(id);
        const localItem = localById.get(id);
        const serverItem = serverById.get(id);
        const tombstone = tombstonesById.get(id);

        if (tombstone) {
          const tombstoneTime = new Date(tombstone.at).getTime();
          if (localItem && itemEffectiveTimeClient(localItem, local.updatedAt) > tombstoneTime) {
            mergedItems.push(localItem);
            survivingTombstoneIds.delete(id); // 削除より後に書き換えられている＝復元されたとみなす
            return;
          }
          if (serverItem && itemEffectiveTimeClient(serverItem, server.updatedAt) > tombstoneTime) {
            mergedItems.push(serverItem);
            survivingTombstoneIds.delete(id);
            return;
          }
          return; // 削除が有効。カードは含めない
        }

        if (localItem && serverItem) {
          const lt = itemEffectiveTimeClient(localItem, local.updatedAt);
          const st = itemEffectiveTimeClient(serverItem, server.updatedAt);
          mergedItems.push(lt >= st ? localItem : serverItem);
        } else {
          mergedItems.push(localItem || serverItem);
        }
      });

      const mergedTombstones = [...tombstonesById.values()].filter(t => survivingTombstoneIds.has(t.id));

      return {
        ...base,
        ...mergeKeyedPatientFieldsClient(local, server),
        items: mergedItems,
        deletedItemIds: mergedTombstones,
        updatedAt: (localTime >= serverTime ? local.updatedAt : server.updatedAt) || new Date(now).toISOString()
      };
    }

    function loadLocalState() {
      const cp = getCurrentPatient();
      DOM.sourceText.value = cp.sourceText || '';
      // 別の患者に切り替えたら、前の患者の文章に付けた印の表示は閉じて入力欄に戻す。
      if (highlightedSourceItemId != null) clearSourceHighlight(false);
      DOM.labEvalContent.innerHTML = cp.labEvaluationResult || '「検査値AI総合評価」ボタンを押すと、Oデータの検査値を登録された基準で確認し、臨床的意味を評価します。';
      DOM.currentPatientTitle.textContent = cp.title;

      // 前回のAI分析結果（矛盾チェック・看護診断候補・経時変化サマリー）があれば患者切り替え時にも復元する
      const contradictionPanel = document.getElementById('contradiction-panel');
      if (cp.contradictionResult) { contradictionPanel.classList.remove('hidden'); document.getElementById('contradiction-content').innerHTML = cp.contradictionResult; }
      else { contradictionPanel.classList.add('hidden'); document.getElementById('contradiction-content').innerHTML = ''; }
      // 看護診断候補は、1件ずつ選べる形で表示する（改善案D。js/08 の renderDiagnosisPanel）。
      // 「AIでアセスメントを進める順番」の案内も、この患者の進み具合で描き直す（renderAiSteps）。
      if (typeof renderDiagnosisPanel === 'function') renderDiagnosisPanel(cp);
      if (typeof renderAiSteps === 'function') renderAiSteps(cp);
      const timelinePanel = document.getElementById('timeline-panel');
      if (cp.timelineResult) { timelinePanel.classList.remove('hidden'); document.getElementById('timeline-content').innerHTML = cp.timelineResult; }
      else { timelinePanel.classList.add('hidden'); document.getElementById('timeline-content').innerHTML = ''; }
      const carePlanPanel = document.getElementById('careplan-panel');
      if (cp.carePlanResult) { carePlanPanel.classList.remove('hidden'); document.getElementById('careplan-content').innerHTML = cp.carePlanResult; }
      else { carePlanPanel.classList.add('hidden'); document.getElementById('careplan-content').innerHTML = ''; }

      sourcePaneManual = null; // 患者を切り替えたら入力欄の大きさは自動に戻す
      // 看護計画のページの描き直し・画面を開いたときの自動の記録（js/13。読み込む前の最初の表示では呼ばない）
      if (typeof onPatientViewReloaded === 'function') onPatientViewReloaded(cp);

      selectedCardIds.clear();
      boardSearchTerm = '';
      const searchInput = document.getElementById('board-search');
      if (searchInput) searchInput.value = '';

      renderPatientTabs();
      renderSoBoard();
      renderAssessmentTable();
      renderReferenceList();
      updateCurrentPatientMeta();
      // 患者ページを切り替えた直後は、切り替え先の患者の保存状態を表示する（共有先に送れていない患者なら「失敗」のまま）
      updateSaveStatus(typeof unsyncedPatientIds !== 'undefined' && unsyncedPatientIds.has(cp.id) ? 'error' : 'saved-earlier');
    }

    // ヘッダー左上のカルテの切り替え（今のカルテの名前のボタン＋押すと開く一覧。index.htmlのpatient-menu参照）。
    // 一覧は最近更新した順。アーカイブ済みのページは出さない（「すべてのページ・アーカイブ」から確認・復元できる）。
    function renderPatientTabs() {
      const visible = globalAppData.patients.filter(pat => !pat.archived);
      const current = getCurrentPatient();
      const label = document.getElementById('patient-switcher-label');
      if (label) label.textContent = current ? current.title : '-';
      const count = document.getElementById('patient-switcher-count');
      if (count) count.textContent = visible.length > 1 ? `${visible.length}` : '';
      const searchBox = document.getElementById('patient-menu-search');
      const q = (searchBox && searchBox.value || '').trim().toLowerCase();
      if (searchBox) searchBox.classList.toggle('hidden', visible.length < 6); // 少ないうちは検索欄を出さない
      const sorted = visible.slice().sort((a, b) => (a.id === globalAppData.currentPatientId ? -1 : b.id === globalAppData.currentPatientId ? 1 : String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))));
      const frag = document.createDocumentFragment();
      const shown = sorted.filter(pat => !q || (pat.title || '').toLowerCase().includes(q));
      shown.forEach(pat => {
        const isActive = pat.id === globalAppData.currentPatientId;
        const row = document.createElement('div');
        row.className = `patient-menu-row${isActive ? ' active' : ''}`;
        const cardCount = (pat.items || []).filter(i => i.type !== 'unnecessary').length;
        row.innerHTML = `
          <button class="patient-menu-name hdr-menu-item" role="menuitem" onclick="switchPatient('${pat.id}')">
            <i class="fa-solid ${isActive ? 'fa-check' : 'fa-user-injured'}"></i><span class="truncate">${escapeHtml(pat.title)}<small>カード ${cardCount}枚</small></span>
          </button>
          ${visible.length > 1 ? `<button onclick="deletePatient('${pat.id}', event)" class="icon-btn danger" title="アーカイブする（「すべてのページ・アーカイブ」からいつでも復元できます）"><i class="fa-solid fa-box-archive text-[9px]"></i></button>` : ''}
        `;
        frag.appendChild(row);
      });
      if (!shown.length) {
        const empty = document.createElement('p');
        empty.className = 'text-[11px] text-[var(--ink-muted)] px-2 py-1.5';
        empty.textContent = '見つかりません';
        frag.appendChild(empty);
      }
      DOM.patientTabs.replaceChildren(frag);
    }
    (() => {
      const box = document.getElementById('patient-menu-search');
      if (!box) return;
      box.addEventListener('input', () => renderPatientTabs());
      box.addEventListener('click', e => e.stopPropagation());
    })();

    window.switchPatient = function(patId) {
      if (typeof closeHeaderMenus === 'function') closeHeaderMenus();
      if (patId === globalAppData.currentPatientId) return;
      changeCurrentPatient(patId);
      showToast(`「${getCurrentPatient().title}」のカルテに切り替えました`, 'info');
    };

    document.getElementById('btn-new-patient').addEventListener('click', async () => {
      const title = await openDialog({ title: '新しい患者ページを作成', inputValue: `患者${globalAppData.patients.length + 1}`, placeholder: '患者名またはページ名', confirmLabel: '作成する' });
      if (!title) return;
      createNewPatientPage(title);
      showToast(`新規ページ「${title}」を作成しました`, 'success');
    });
    function createNewPatientPage(title) {
      const newId = 'patient_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      if (globalAppData.patients.some(p => p.id === globalAppData.currentPatientId)) persistData(); // 先に今の患者を保存する
      globalAppData.patients.push({ id: newId, title: String(title).trim(), items: [], sourceText: '', labEvaluationResult: '', referenceNotes: [], archived: false, updatedAt: new Date().toISOString(), deletedItemIds: [] });
      changeCurrentPatient(newId, { saveCurrent: false });
      schedulePatientSync(newId);
      return newId;
    }

    document.getElementById('btn-rename-patient').addEventListener('click', async () => {
      const cp = getCurrentPatient();
      const newTitle = await openDialog({ title: 'ページ名を変更', inputValue: cp.title, confirmLabel: '変更する' });
      if (newTitle && newTitle.trim()) {
        cp.title = newTitle.trim();
        saveDataAndSync();
        DOM.currentPatientTitle.textContent = cp.title;
        renderPatientTabs();
        showToast('ページ名を変更しました', 'success');
      }
    });

    // タブ上の「アーカイブ」ボタンは、誤操作でも「一覧」からすぐ復元できるようアーカイブ扱いにする
    // （完全な削除は「一覧」モーダルの削除ボタンからのみ行う）
    window.deletePatient = function(patId, e) {
      e.stopPropagation();
      archivePatient(patId);
    };

    window.archivePatient = function(id) {
      const p = globalAppData.patients.find(x => x.id === id);
      if (!p) return;
      const nonArchivedCount = globalAppData.patients.filter(x => !x.archived).length;
      if (!p.archived && nonArchivedCount <= 1) return showToast('最後のページはアーカイブできません', 'warn');
      const wasCurrent = globalAppData.currentPatientId === id;
      // ①アーカイブする前に、今表示している患者（アーカイブする患者のこともある）の本文を保存する
      persistData();
      p.archived = true;
      p.updatedAt = new Date().toISOString();
      schedulePatientSync(id); // アーカイブしたページ自身も明示的に同期する（現在のページと異なる場合、persistDataだけでは同期されないため）
      if (wasCurrent) {
        const next = globalAppData.patients.find(x => !x.archived);
        if (next) changeCurrentPatient(next.id, { saveCurrent: false }); // ②③④（今の患者は①で保存済み）
      } else {
        savePatientsLocally();
        renderPatientTabs();
      }
      renderPatientListModal();
      showUndoToast(`「${p.title}」をアーカイブしました`, () => {
        p.archived = false;
        p.updatedAt = new Date().toISOString();
        schedulePatientSync(id);
        if (wasCurrent) changeCurrentPatient(id); // 今表示している患者（切り替え先）を保存してから戻る
        else { savePatientsLocally(); renderPatientTabs(); }
        renderPatientListModal();
      });
    };

    window.unarchivePatient = function(id) {
      const p = globalAppData.patients.find(x => x.id === id);
      if (!p) return;
      p.archived = false;
      p.updatedAt = new Date().toISOString();
      persistData(); // 今表示している患者の本文を保存（復元した患者の本文には触れない）
      schedulePatientSync(id);
      renderPatientTabs();
      renderPatientListModal();
      showToast(`「${p.title}」を復元しました`, 'success');
    };

    window.switchPatientFromList = function(id) {
      switchPatient(id);
      renderPatientListModal();
    };

    window.hardDeletePatientFromList = async function(id) {
      const target = globalAppData.patients.find(p => p.id === id);
      if (globalAppData.patients.length <= 1) return showToast('最後のページは削除できません', 'warn');
      const confirmed = await openDialog({ title: '完全に削除しますか？', message: `「${target ? target.title : ''}」のデータを完全に削除します。アーカイブと違い、この操作は元に戻せません。`, confirmLabel: '完全に削除する', danger: true });
      if (!confirmed) return;
      const idx = globalAppData.patients.findIndex(p => p.id === id);
      if (idx === -1) return;
      const deletingCurrent = globalAppData.currentPatientId === id;
      // 削除するのが別の患者なら、先に今表示している患者の本文を保存する（削除する患者の本文は保存しない）
      if (!deletingCurrent) persistData();
      globalAppData.patients.splice(idx, 1);
      if (patientSyncTimers[id]) { clearTimeout(patientSyncTimers[id]); delete patientSyncTimers[id]; }
      rememberDeletedPatient(id);
      deletePatientFromServer(id); // サーバー側の共有カルテからも削除する（他端末にも削除が反映される）
      if (deletingCurrent) {
        const next = globalAppData.patients.find(x => !x.archived) || globalAppData.patients[0];
        changeCurrentPatient(next.id, { saveCurrent: false });
      } else {
        savePatientsLocally();
        renderPatientTabs();
      }
      renderPatientListModal();
      showToast('完全に削除しました', 'info');
    };

    // ==========================================================================
    // 患者ページ一覧モーダル：検索・並び替え・アーカイブ表示切り替え
    // ==========================================================================
    function renderPatientListModal() {
      const body = document.getElementById('patient-list-body');
      if (!body) return;
      const term = (document.getElementById('patient-list-search').value || '').trim().toLowerCase();
      const showArchived = document.getElementById('patient-list-show-archived').checked;
      const sortMode = document.getElementById('patient-list-sort').value;
      let list = globalAppData.patients.filter(p => showArchived || !p.archived);
      if (term) list = list.filter(p => p.title.toLowerCase().includes(term));
      list = list.slice().sort((a, b) => sortMode === 'name' ? a.title.localeCompare(b.title, 'ja') : (b.updatedAt || '').localeCompare(a.updatedAt || ''));

      if (list.length === 0) {
        const p = document.createElement('p');
        p.className = 'text-xs text-[var(--ink-muted)] text-center py-6';
        p.textContent = '該当する患者ページがありません。';
        body.replaceChildren(p);
        return;
      }
      const frag = document.createDocumentFragment();
      list.forEach(pat => {
        const row = document.createElement('div');
        row.className = `flex items-center justify-between gap-2 p-2 rounded-[var(--radius-sm)] border ${pat.id === globalAppData.currentPatientId ? 'border-[var(--accent)]' : 'border-[var(--line)]'}`;
        row.style.background = pat.id === globalAppData.currentPatientId ? 'var(--accent-soft)' : 'var(--surface)';
        row.innerHTML = `
          <div class="min-w-0 flex-1 cursor-pointer" onclick="switchPatientFromList('${pat.id}')">
            <div class="text-xs font-semibold text-[var(--ink)] truncate">${escapeHtml(pat.title)}${pat.archived ? ' <span class="text-[9px] text-[var(--ink-muted)] font-normal">(アーカイブ済み)</span>' : ''}</div>
            <div class="text-[10px] text-[var(--ink-muted)]">${pat.updatedAt ? formatRelativeTime(pat.updatedAt) : '更新履歴なし'}・${(pat.items || []).length}件のカード</div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            ${pat.archived
              ? `<button onclick="unarchivePatient('${pat.id}')" class="icon-btn-outline" title="復元"><i class="fa-solid fa-box-open"></i></button>`
              : `<button onclick="archivePatient('${pat.id}')" class="icon-btn-outline" title="アーカイブ"><i class="fa-solid fa-box-archive"></i></button>`}
            <button onclick="hardDeletePatientFromList('${pat.id}')" class="icon-btn-outline danger" title="完全に削除"><i class="fa-solid fa-trash-can"></i></button>
          </div>
        `;
        frag.appendChild(row);
      });
      body.replaceChildren(frag);
    }

    document.getElementById('btn-patient-list').addEventListener('click', () => {
      document.getElementById('patient-list-search').value = '';
      document.getElementById('patient-list-show-archived').checked = false;
      renderPatientListModal();
      document.getElementById('modal-patient-list').classList.remove('hidden');
    });
    document.getElementById('btn-close-patient-list').addEventListener('click', () => document.getElementById('modal-patient-list').classList.add('hidden'));
    document.getElementById('patient-list-search').addEventListener('input', renderPatientListModal);
    document.getElementById('patient-list-sort').addEventListener('change', renderPatientListModal);
    document.getElementById('patient-list-show-archived').addEventListener('change', renderPatientListModal);
    document.getElementById('modal-patient-list').addEventListener('click', e => { if (e.target.id === 'modal-patient-list') document.getElementById('modal-patient-list').classList.add('hidden'); });

    // ===== 学習データ管理（パスワード保護） =====
    // 分類ボード／総合アセスメント表とは別の入り口（ヘッダーの「学習データ管理」ボタン）から、
    // 全利用者共有の学習内容（learningUserDict）を一覧・編集・削除できるようにする。
    // 保存・読み込みは個別ファイルを都度作るのではなく、サーバー側の学習専用ファイル
    // （data/learning-dict.json）に自動で反映される（ページを開いた時に自動読込／変更のたびに自動保存）。
    const ADMIN_PASSWORD = '1739';
    // 一度パスワードを通したら、このタブを閉じて新しくページを開き直すまでは再入力を求めない。
    // （sessionStorageなので、リロードでは保持され、新しいタブ/ウィンドウで開き直すと消える＝再度パスワードが必要）
    const ADMIN_UNLOCK_KEY = 'nursing_admin_unlocked';
    const adminPasswordModal = document.getElementById('modal-admin-password');
    const adminPasswordInput = document.getElementById('input-admin-password');
    const adminPasswordError = document.getElementById('admin-password-error');
    const adminModal = document.getElementById('modal-admin');

    function openAdminPasswordModal() {
      adminPasswordInput.value = '';
      adminPasswordError.classList.add('hidden');
      adminPasswordModal.classList.remove('hidden');
      setTimeout(() => adminPasswordInput.focus(), 30);
    }
    function closeAdminPasswordModal() { adminPasswordModal.classList.add('hidden'); }
    // 学習データ管理のタブ（ボタンの id は admin-tab-btn-〇〇、中身は admin-panel-〇〇）
    const ADMIN_TABS = ['list', 'history', 'caselog', 'trends', 'review', 'customrules', 'reports', 'criteria', 'snapshots'];
    function switchAdminTab(tab) {
      ADMIN_TABS.forEach(t => {
        const on = t === tab;
        document.getElementById(`admin-tab-btn-${t}`).classList.toggle('active', on);
        const panel = document.getElementById(`admin-panel-${t}`);
        panel.classList.toggle('hidden', !on);
        panel.classList.toggle('flex', on);
      });
      if (tab === 'history') renderAdminHistoryList();
      if (tab === 'caselog') loadAndRenderCaseLog();
      if (tab === 'trends') renderLearningTrendsList();
      if (tab === 'review') renderRuleReviewPanel();
      // 追加キーワードは、開くたびに再取得して他の人が登録した分も見えるようにする
      if (tab === 'customrules') loadCustomTagRules();
      if (tab === 'reports') loadAndRenderCardReports();
      // 分類基準タブを開くたびに再取得し、他端末が編集した基準ノート本体・追加の要望も見えるようにする
      if (tab === 'criteria') { editingCriteriaId = null; editingReferenceSourceId = null; loadNotebookContent(); loadSharedCriteria(); loadReferenceSources(); }
      // カルテスナップショットタブを開くたびに再取得し、他端末がタブを閉じた分も見えるようにする
      if (tab === 'snapshots') loadAndRenderPatientSnapshots();
    }
    // HTMLファイルを直接開いている（file://）か。サーバーが要る機能の案内に使う
    const IS_FILE_PROTOCOL = typeof location !== 'undefined' && location.protocol === 'file:';
    // サーバーが要るタブ（事例ログ・報告・スナップショット）で読み込めなかったときの案内
    function adminServerNoticeHtml(featureName) {
      const why = IS_FILE_PROTOCOL ? 'HTMLファイルを直接開いているため' : 'サーバー（server.js）に接続できないため';
      return `<div class="text-xs text-[var(--ink)] leading-relaxed p-3 rounded-[var(--radius-sm)]" style="background:var(--gold-soft);border:1px solid var(--line);">
        <div class="font-semibold mb-1"><i class="fa-solid fa-plug-circle-xmark mr-1" style="color:var(--gold);"></i>${escapeHtml(featureName)}は、サーバーで開いたときだけ使えます</div>
        <div class="text-[11px] text-[var(--ink-muted)]">全員で共有する記録なので、サーバーに保存されています。今は${why}表示できません。見るには、公開しているページから開くか、アプリのフォルダで「npm start」を実行してブラウザで http://localhost:3000 を開いてください。</div>
      </div>`;
    }
    // 学習データ管理の上部に、全員の学習データが見えているかを表示する
    function renderAdminServerStatus() {
      const el = document.getElementById('admin-server-status');
      if (!el) return;
      if (learningServerState === 'online') {
        el.innerHTML = '<i class="fa-solid fa-circle text-[7px]" style="color:var(--accent);"></i> サーバーに接続中：全員で共有している学習データを表示しています';
      } else if (learningServerState === 'offline') {
        el.innerHTML = `<i class="fa-solid fa-circle text-[7px]" style="color:var(--brick);"></i> サーバー未接続${IS_FILE_PROTOCOL ? '（HTMLファイルを直接開いています）' : ''}：このブラウザの学習データだけを表示しています。事例ログ・報告・スナップショットは見られません`;
      } else {
        el.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin text-[8px]"></i> サーバーへの接続を確認しています…';
      }
    }
    async function openAdminPanel() {
      document.getElementById('admin-learning-search').value = '';
      document.getElementById('admin-history-search').value = '';
      adminLearningEditing.clear();
      adminLearningLimit = ADMIN_LEARNING_PAGE;
      renderAdminServerStatus();
      renderAdminLearningList();
      switchAdminTab('list');
      adminModal.classList.remove('hidden');
      // 開くたびに全員共有の学習データを取り直し、他の人の修正も見えるようにする
      await loadSharedLearningDict();
      renderAdminServerStatus();
      renderAdminLearningList();
    }
    function submitAdminPassword() {
      if (adminPasswordInput.value === ADMIN_PASSWORD) {
        try { sessionStorage.setItem(ADMIN_UNLOCK_KEY, '1'); } catch (e) { /* 保存できなくても今回のパスワード確認自体は成立させる */ }
        closeAdminPasswordModal();
        openAdminPanel();
      } else {
        adminPasswordError.classList.remove('hidden');
        adminPasswordInput.value = '';
        adminPasswordInput.focus();
      }
    }

    document.getElementById('btn-open-admin').addEventListener('click', () => {
      let unlocked = false;
      try { unlocked = sessionStorage.getItem(ADMIN_UNLOCK_KEY) === '1'; } catch (e) { unlocked = false; }
      if (unlocked) openAdminPanel(); else openAdminPasswordModal();
    });
    document.getElementById('btn-close-admin-password').addEventListener('click', closeAdminPasswordModal);
    document.getElementById('btn-cancel-admin-password').addEventListener('click', closeAdminPasswordModal);
    document.getElementById('btn-submit-admin-password').addEventListener('click', submitAdminPassword);
    adminPasswordInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submitAdminPassword(); } });
    adminPasswordModal.addEventListener('click', e => { if (e.target === adminPasswordModal) closeAdminPasswordModal(); });

    document.getElementById('btn-close-admin').addEventListener('click', () => adminModal.classList.add('hidden'));
    adminModal.addEventListener('click', e => { if (e.target === adminModal) adminModal.classList.add('hidden'); });
    document.getElementById('admin-learning-search').addEventListener('input', () => { adminLearningLimit = ADMIN_LEARNING_PAGE; renderAdminLearningList(); });
    document.getElementById('admin-tab-btn-list').addEventListener('click', () => switchAdminTab('list'));
    document.getElementById('admin-tab-btn-history').addEventListener('click', () => switchAdminTab('history'));
    document.getElementById('admin-tab-btn-caselog').addEventListener('click', () => switchAdminTab('caselog'));
    document.getElementById('admin-tab-btn-trends').addEventListener('click', () => switchAdminTab('trends'));
    document.getElementById('admin-tab-btn-review').addEventListener('click', () => switchAdminTab('review'));
    document.getElementById('admin-tab-btn-customrules').addEventListener('click', () => switchAdminTab('customrules'));
    document.getElementById('admin-tab-btn-reports').addEventListener('click', () => switchAdminTab('reports'));
    document.getElementById('admin-tab-btn-criteria').addEventListener('click', () => switchAdminTab('criteria'));
    document.getElementById('admin-tab-btn-snapshots').addEventListener('click', () => switchAdminTab('snapshots'));
    document.getElementById('admin-history-search').addEventListener('input', renderAdminHistoryList);
    document.getElementById('admin-caselog-search').addEventListener('input', renderCaseLogList);
    document.getElementById('admin-caselog-action-filter').addEventListener('change', renderCaseLogList);
    document.getElementById('admin-trends-search').addEventListener('input', renderLearningTrendsList);
    document.getElementById('admin-reports-search').addEventListener('input', renderCardReportsList);
    document.getElementById('btn-summarize-reports').addEventListener('click', summarizeCardReportsAI);

    // 【見直し】以前は1行ごとに票の＋−ボタンと14項目の選択欄を全部作っていたため、件数が増えると重く、
    // 見た目もごちゃごちゃしていた。ふだんは「どう学習したか」だけを表示し、「編集」を押した行だけ票を直せる。
    // 絞り込み・並べ替えを付け、100件ずつ表示する。
    const ADMIN_LEARNING_PAGE = 100;
    let adminLearningLimit = ADMIN_LEARNING_PAGE;
    const adminLearningEditing = new Set(); // 「編集」中の文章
    const learningTypeColorOf = t => t === 's' ? 'var(--gold)' : (t === 'o' ? 'var(--slate)' : (t === 'unnecessary' ? 'var(--brick)' : 'var(--ink-muted)'));
    const learningTypeLabelOf = t => t === 's' ? 'S' : (t === 'o' ? 'O' : (t === 'unnecessary' ? '不要' : t));
    // 1件の学習内容を、表示・絞り込み・並べ替えに使う形にまとめる
    function summarizeLearningEntry(text, learned) {
      const typeVotes = learned?.typeVotes || {};
      const typeEntries = Object.keys(typeVotes).length > 0
        ? Object.entries(typeVotes).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1])
        : (learned?.preferredType ? [[learned.preferredType, 1]] : []);
      const hendersonVotes = learned?.hendersonVotes || {};
      const tagEntries = Object.keys(hendersonVotes).length > 0
        ? Object.entries(hendersonVotes).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1])
        : (learned?.preferredHendersonIds || []).map(hId => [String(hId), 1]);
      const counts = [...typeEntries, ...tagEntries].map(([, c]) => c);
      return {
        text, learned, typeVotes, typeEntries, tagEntries,
        topType: pickTopVote(typeVotes) || learned?.preferredType || null,
        totalVotes: counts.reduce((a, c) => a + c, 0),
        maxVotes: counts.length ? Math.max(...counts) : 0,
        updatedAt: learned?.updatedAt ? Date.parse(learned.updatedAt) || 0 : 0
      };
    }
    function filterAndSortLearningEntries(dict, { term = '', filter = '', sort = 'votes' } = {}) {
      let rows = Object.entries(dict || {}).filter(([text]) => !!text).map(([text, learned], i) => ({ ...summarizeLearningEntry(text, learned), order: i }));
      const t = term.trim().toLowerCase();
      if (t) rows = rows.filter(r => r.text.toLowerCase().includes(t));
      if (filter === 's' || filter === 'o' || filter === 'unnecessary') rows = rows.filter(r => r.topType === filter);
      else if (filter === 'tags') rows = rows.filter(r => r.tagEntries.length > 0);
      else if (filter === 'trend') rows = rows.filter(r => r.maxVotes >= 2);
      if (sort === 'text') rows.sort((a, b) => a.text.localeCompare(b.text, 'ja'));
      else if (sort === 'recent') rows.sort((a, b) => (b.updatedAt - a.updatedAt) || (b.order - a.order));
      else rows.sort((a, b) => (b.totalVotes - a.totalVotes) || (b.order - a.order));
      return rows;
    }
    function renderAdminLearningList() {
      const listEl = document.getElementById('admin-learning-list');
      const countEl = document.getElementById('admin-learning-count');
      const dict = globalAppData.learningUserDict || {};
      const total = Object.keys(dict).filter(Boolean).length;
      const rows = filterAndSortLearningEntries(dict, {
        term: document.getElementById('admin-learning-search').value || '',
        filter: document.getElementById('admin-learning-filter')?.value || '',
        sort: document.getElementById('admin-learning-sort')?.value || 'votes'
      });
      countEl.textContent = `${rows.length}件（全${total}件）`;

      if (total === 0) {
        // 空のときは、何をすると溜まるのか・なぜ空なのかを説明する
        const offline = learningServerState === 'offline'
          ? `<p class="mt-2 text-[11px]" style="color:var(--brick);"><i class="fa-solid fa-plug-circle-xmark"></i> ${IS_FILE_PROTOCOL ? 'HTMLファイルを直接開いている' : 'サーバーに接続できない'}ため、全員で共有している学習データは読み込まれていません。このブラウザで直した分だけが表示されます。</p>`
          : '';
        listEl.innerHTML = `<div class="text-xs text-[var(--ink-muted)] text-center py-6 px-4 leading-relaxed">
          <p class="font-semibold text-[var(--ink)] mb-1">まだ学習データがありません</p>
          <p>分類ボードでカードの S／O／不要 や、ヘンダーソンのタグを手で直すと、その文章と直した内容がここに記録されます。<br>次に同じ文章を分類するとき、記録した内容が優先されます。</p>${offline}</div>`;
        return;
      }
      if (rows.length === 0) {
        listEl.innerHTML = '<p class="text-xs text-[var(--ink-muted)] text-center py-6">条件に一致する学習データがありません。</p>';
        return;
      }

      const frag = document.createDocumentFragment();
      rows.slice(0, adminLearningLimit).forEach(r => {
        const { text } = r;
        const editing = adminLearningEditing.has(text);
        const esc = escapeHtml(text);
        let chipsHtml;
        if (!editing) {
          // ふだんの表示：どう学習したかだけ（票の多い分類を色付き、タグは名前と回数）
          const typeChips = r.typeEntries.map(([t, c]) => {
            const isTop = t === r.topType;
            return `<span class="field-chip" style="background:${isTop ? learningTypeColorOf(t) : 'var(--line-soft)'};color:${isTop ? 'var(--on-fill)' : 'var(--ink-muted)'};">${escapeHtml(learningTypeLabelOf(t))}${c > 1 ? ` ×${c}` : ''}</span>`;
          }).join('');
          const tagChips = r.tagEntries.map(([h, c]) => `<span class="tag-chip">${escapeHtml(hendersonNameOf(Number(h)))}${c > 1 ? ` ×${c}` : ''}</span>`).join('');
          chipsHtml = (typeChips || tagChips) ? typeChips + tagChips : '<span class="field-chip" style="background:var(--ink-muted);color:var(--on-fill);">未設定</span>';
        } else {
          // 編集中：票の＋−と、票の無い分類・タグの追加
          const typeChips = r.typeEntries.map(([t, c]) => {
            const isTop = t === r.topType;
            return `<span class="field-chip" style="background:${isTop ? learningTypeColorOf(t) : 'var(--line-soft)'};color:${isTop ? 'var(--on-fill)' : 'var(--ink-muted)'};gap:.3rem;">${escapeHtml(learningTypeLabelOf(t))}${c > 1 ? ` ×${c}` : ''}
                <button class="vote-adjust-btn admin-vote-btn" data-text="${esc}" data-kind="type" data-value="${escapeHtml(t)}" data-delta="-1" title="この分類の票を1つ減らす" style="background:transparent;border-color:currentColor;color:inherit;">−</button>
                <button class="vote-adjust-btn admin-vote-btn" data-text="${esc}" data-kind="type" data-value="${escapeHtml(t)}" data-delta="1" title="この分類の票を1つ増やす" style="background:transparent;border-color:currentColor;color:inherit;">＋</button>
              </span>`;
          }).join('');
          const typeAdd = ['s', 'o', 'unnecessary'].filter(t => !(r.typeVotes[t] > 0)).map(t =>
            `<button class="vote-adjust-btn admin-vote-btn" data-text="${esc}" data-kind="type" data-value="${t}" data-delta="1" title="「${learningTypeLabelOf(t)}」の票を追加" style="width:auto;min-width:0;padding:0 5px;white-space:nowrap;">＋${learningTypeLabelOf(t)}</button>`).join('');
          const tagChips = r.tagEntries.map(([h, c]) => `<span class="tag-chip" style="gap:.3rem;">${escapeHtml(hendersonNameOf(Number(h)))}${c > 1 ? ` ×${c}` : ''}
              <button class="vote-adjust-btn admin-vote-btn" data-text="${esc}" data-kind="tag" data-value="${h}" data-delta="-1" title="このタグの票を1つ減らす">−</button>
              <button class="vote-adjust-btn admin-vote-btn" data-text="${esc}" data-kind="tag" data-value="${h}" data-delta="1" title="このタグの票を1つ増やす">＋</button>
            </span>`).join('');
          const existing = new Set(r.tagEntries.map(([h]) => Number(h)));
          const tagAdd = `<select class="admin-vote-add-tag-select text-[9px] bg-[var(--paper)] border border-[var(--line)] rounded-[var(--radius-sm)] px-1 py-0.5 text-[var(--ink-muted)] cursor-pointer" data-text="${esc}"><option value="">＋タグの票を追加</option>${HENDERSON_NEEDS.filter(n => !existing.has(n.id)).map(n => `<option value="${n.id}">${n.name}</option>`).join('')}</select>`;
          chipsHtml = typeChips + typeAdd + tagChips + tagAdd;
        }
        const row = document.createElement('div');
        row.className = 'flex items-start justify-between gap-2 p-2 rounded-[var(--radius-sm)] border border-[var(--line)]';
        row.innerHTML = `
          <div class="min-w-0 flex-1">
            <div class="text-xs text-[var(--ink)] break-words">${esc}</div>
            <div class="flex items-center flex-wrap gap-1 mt-1">${chipsHtml}</div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button class="icon-btn-outline admin-edit-learning-btn" data-text="${esc}" title="${editing ? '編集を終える' : '票（回数）を直す'}"><i class="fa-solid ${editing ? 'fa-check' : 'fa-pen'}"></i></button>
            <button class="icon-btn-outline danger admin-delete-learning-btn" data-text="${esc}" title="この学習内容を削除"><i class="fa-solid fa-trash-can"></i></button>
          </div>
        `;
        frag.appendChild(row);
      });
      if (rows.length > adminLearningLimit) {
        const more = document.createElement('button');
        more.className = 'btn btn-outline text-[11px] py-1 self-center admin-learning-more-btn';
        more.textContent = `さらに表示（残り${rows.length - adminLearningLimit}件）`;
        frag.appendChild(more);
      }
      listEl.replaceChildren(frag);
    }
    // 検索・絞り込み・並べ替えを変えたら、表示件数を最初の100件に戻す
    ['admin-learning-filter', 'admin-learning-sort'].forEach(id => document.getElementById(id)?.addEventListener('change', () => { adminLearningLimit = ADMIN_LEARNING_PAGE; renderAdminLearningList(); }));
    document.getElementById('admin-learning-list').addEventListener('click', e => {
      if (e.target.closest('.admin-learning-more-btn')) { adminLearningLimit += ADMIN_LEARNING_PAGE; renderAdminLearningList(); return; }
      const edit = e.target.closest('.admin-edit-learning-btn');
      if (edit) {
        const t = edit.dataset.text;
        if (adminLearningEditing.has(t)) adminLearningEditing.delete(t); else adminLearningEditing.add(t);
        renderAdminLearningList();
      }
    });

    // ---- 学習データの書き出し（バックアップ）・読み込み ----
    // 読み込むときは、同じ文章の票は多い方を採用する（同じファイルを2回読み込んでも票が増えない）。
    function mergeLearningDicts(base, incoming) {
      const out = { ...(base || {}) };
      let added = 0, updated = 0;
      Object.entries(incoming || {}).forEach(([text, inc]) => {
        if (!text || !inc || typeof inc !== 'object' || Array.isArray(inc)) return;
        const cur = out[text];
        if (!cur) { out[text] = mergeOne({}, inc); added++; return; }
        const merged = mergeOne(cur, inc);
        // キーの並び順の違いは変更とみなさない
        const stable = o => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((r, key) => { r[key] = v[key]; return r; }, {}) : v));
        if (stable(merged) !== stable(cur)) { out[text] = merged; updated++; }
      });
      return { dict: out, added, updated };
      function mergeOne(cur, inc) {
        const maxVotes = (a = {}, b = {}) => {
          const r = { ...a };
          Object.entries(b).forEach(([k, v]) => { if (typeof v === 'number' && v > (r[k] || 0)) r[k] = v; });
          return r;
        };
        const merged = { ...inc, ...cur };
        merged.typeVotes = maxVotes(cur.typeVotes, inc.typeVotes);
        merged.hendersonVotes = maxVotes(cur.hendersonVotes, inc.hendersonVotes);
        merged.preferredType = pickTopVote(merged.typeVotes) || cur.preferredType || inc.preferredType || null;
        const tagIds = Object.entries(merged.hendersonVotes).filter(([, c]) => c > 0).map(([k]) => Number(k));
        merged.preferredHendersonIds = tagIds.length ? tagIds : Array.from(new Set([...(cur.preferredHendersonIds || []), ...(inc.preferredHendersonIds || [])]));
        return merged;
      }
    }
    function exportLearningData() {
      const dict = globalAppData.learningUserDict || {};
      const count = Object.keys(dict).length;
      if (!count) { showToast('書き出す学習データがありません', 'info'); return false; }
      const payload = { kind: 'nursing-learning-dict', version: 1, exportedAt: new Date().toISOString(), learningUserDict: dict };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `学習データ_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      showToast(`学習データ${count}件を書き出しました`, 'success');
      return true;
    }
    window.exportLearningData = exportLearningData;
    async function importLearningDataFile(file) {
      let parsed;
      try { parsed = JSON.parse(await file.text()); } catch (e) { return showToast('ファイルを読み込めませんでした（学習データの書き出しファイル .json を選んでください）', 'warn'); }
      const incoming = parsed && parsed.learningUserDict && typeof parsed.learningUserDict === 'object' ? parsed.learningUserDict : parsed;
      if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return showToast('学習データの形式ではありません', 'warn');
      const { dict, added, updated } = mergeLearningDicts(globalAppData.learningUserDict, incoming);
      if (!added && !updated) return showToast('新しく取り込む学習データはありませんでした', 'info');
      const ok = await openDialog({ title: '学習データを読み込みますか？', message: `新しい学習 ${added}件、票を更新する学習 ${updated}件を取り込みます。\n同じ文章の票（回数）は、多い方を残します。サーバーにつながっていれば全員に共有されます。`, confirmLabel: '読み込む' });
      if (ok !== true) return;
      globalAppData.learningUserDict = dict;
      saveDataAndSync();
      try {
        const blob = new Blob([JSON.stringify(dict)], { type: 'application/json' });
        await fetch(`${API_BASE}/learning-dict/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: blob });
      } catch (e) { /* サーバー未接続でも、このブラウザには取り込み済み */ }
      renderAdminLearningList();
      showToast(`学習データを読み込みました（新規${added}件・更新${updated}件）`, 'success');
    }
    document.getElementById('btn-export-learning')?.addEventListener('click', exportLearningData);
    document.getElementById('btn-import-learning')?.addEventListener('click', () => document.getElementById('input-import-learning')?.click());
    document.getElementById('input-import-learning')?.addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (f) importLearningDataFile(f);
      e.target.value = '';
    });

    // 学習データ管理：票数の手動修正（自動分類が明らかに間違っている/古い場合に、票を直接調整できるようにする）
    window.adjustAdminTypeVote = function(text, type, delta) {
      const learned = globalAppData.learningUserDict[text] = { ...globalAppData.learningUserDict[text] };
      learned.typeVotes = { ...(learned.typeVotes || {}) };
      learned.typeVotes[type] = Math.max(0, (learned.typeVotes[type] || 0) + delta);
      learned.preferredType = pickTopVote(learned.typeVotes);
      learned.updatedAt = new Date().toISOString();
      saveDataAndSync();
      reportLearningEvent(text, 'adjustTypeVote', { type, delta, voteCount: learned.typeVotes[type] });
      renderAdminLearningList();
    };
    window.adjustAdminHendersonVote = function(text, hId, delta) {
      const learned = globalAppData.learningUserDict[text] = { ...globalAppData.learningUserDict[text] };
      learned.hendersonVotes = { ...(learned.hendersonVotes || {}) };
      learned.hendersonVotes[hId] = Math.max(0, (learned.hendersonVotes[hId] || 0) + delta);
      learned.preferredHendersonIds = Object.entries(learned.hendersonVotes).filter(([, c]) => c > 0).map(([k]) => Number(k));
      learned.updatedAt = new Date().toISOString();
      saveDataAndSync();
      reportLearningEvent(text, 'adjustHendersonVote', { hendersonId: hId, delta, voteCount: learned.hendersonVotes[hId] });
      renderAdminLearningList();
    };
    document.getElementById('admin-learning-list').addEventListener('click', e => {
      const btn = e.target.closest('.admin-vote-btn');
      if (!btn) return;
      const { text, kind, value, delta } = btn.dataset;
      if (kind === 'type') adjustAdminTypeVote(text, value, Number(delta));
      else if (kind === 'tag') adjustAdminHendersonVote(text, Number(value), Number(delta));
    });
    document.getElementById('admin-learning-list').addEventListener('change', e => {
      const sel = e.target.closest('.admin-vote-add-tag-select');
      if (sel && sel.value) { adjustAdminHendersonVote(sel.dataset.text, Number(sel.value), 1); }
    });

    async function deleteAdminLearningEntry(text) {
      const confirmed = await openDialog({ title: 'この学習内容を削除しますか？', message: text, confirmLabel: '削除する', danger: true });
      if (!confirmed) return;
      delete globalAppData.learningUserDict[text];
      saveDataAndSync();
      reportLearningEvent(text, 'delete', {}); // フォルダ内の学習専用ファイル（data/learning-dict.json）からも削除する
      renderAdminLearningList();
      showToast('学習内容を削除しました', 'success');
    }
    // クリックされた削除ボタンのdata-text属性から対象を判定する（イベント委譲）。
    // テキストに引用符等の特殊文字が含まれてもHTML属性が壊れないよう、inline onclickではなくこちらを使う。
    document.getElementById('admin-learning-list').addEventListener('click', e => {
      const btn = e.target.closest('.admin-delete-learning-btn');
      if (btn) deleteAdminLearningEntry(btn.dataset.text);
    });

    // 学習データの保存・読み込みは、都度ファイルを作る／選ぶのではなく自動化されている：
    //   ・ページを開いた時：起動時に loadSharedLearningDict() がフォルダ内の学習専用ファイル
    //     （data/learning-dict.json）からすべてのデータを自動で読み込む。
    //   ・変更のたびに：分類・タグ付け・削除などの操作ごとに reportLearningEvent() が
    //     即座にその1ファイルへ反映する（新しいファイルは作らず、同じファイルに追加・削除する）。
    //   ・ページを閉じる時：beforeunloadで念のためまとめて同期する（通信できていなかった分の保険）。

    // 変更履歴（学習した結果、何がどう変わったか）の表示
    const ADMIN_ACTION_LABELS = { create: '新規登録', type: '分類変更', tagAdd: 'タグ追加', tagRemove: 'タグ削除', col: '欄の変更', edit: 'テキスト編集', delete: '削除', adjustTypeVote: '票の手動修正(分類)', adjustHendersonVote: '票の手動修正(タグ)', merge: 'カード統合' };
    const ADMIN_TYPE_LABELS = { s: 'S', o: 'O', unnecessary: '不要', unclassified: '未分類', undefined: '未設定' };
    function hendersonNameOf(hId) { return HENDERSON_NEEDS.find(n => n.id === hId)?.name || `項目${hId}`; }
    function assessmentColLabel(col) { return col === 'preadmission' ? '入院前' : (col === 'postadmission' ? '入院後' : (col === 'missing' ? '不足情報' : '未分類')); }
    function formatHistoryDetail(entry) {
      const p = entry.payload || {};
      switch (entry.action) {
        case 'type': return `${ADMIN_TYPE_LABELS[p.from] || '未設定'} → ${ADMIN_TYPE_LABELS[p.type] || p.type}${p.voteCount > 1 ? `（この選択は${p.voteCount}回目・×${p.voteCount}）` : ''}`;
        case 'tagAdd': return `「${hendersonNameOf(p.hendersonId)}」を追加${p.voteCount > 1 ? `（×${p.voteCount}）` : ''}`;
        case 'tagRemove': return `「${hendersonNameOf(p.hendersonId)}」を削除${typeof p.voteCount === 'number' ? `（残り×${p.voteCount}）` : ''}`;
        case 'col': return `「${hendersonNameOf(p.hendersonId)}」の欄 → ${assessmentColLabel(p.col)}`;
        case 'edit': return `「${entry.text || ''}」→「${p.newText || ''}」`;
        case 'sync': return 'まとめて同期';
        case 'create': return `初期分類: ${ADMIN_TYPE_LABELS[p.type] || p.type}${(p.hendersonIds || []).length ? ' / タグ: ' + p.hendersonIds.map(hendersonNameOf).join('、') : ''}`;
        case 'delete': return '学習内容を削除';
        case 'adjustTypeVote': return `${ADMIN_TYPE_LABELS[p.type] || p.type} の票を${p.delta > 0 ? '+1' : '-1'}（管理画面で手動修正・現在×${p.voteCount}）`;
        case 'adjustHendersonVote': return `「${hendersonNameOf(p.hendersonId)}」の票を${p.delta > 0 ? '+1' : '-1'}（管理画面で手動修正・現在×${p.voteCount}）`;
        case 'merge': return `${(p.sourceTexts || []).length}件のカードを統合 → 分類:${ADMIN_TYPE_LABELS[p.type] || p.type}${(p.hendersonIds || []).length ? ' / タグ: ' + p.hendersonIds.map(hendersonNameOf).join('、') : ''}`;
        default: return JSON.stringify(p);
      }
    }
    function renderAdminHistoryList() {
      const listEl = document.getElementById('admin-history-list');
      const countEl = document.getElementById('admin-history-count');
      const term = (document.getElementById('admin-history-search').value || '').trim().toLowerCase();
      let entries = learningHistory.slice().reverse(); // 新しい変更を上に表示
      if (term) entries = entries.filter(e =>
        e.text.toLowerCase().includes(term) ||
        formatHistoryDetail(e).toLowerCase().includes(term) ||
        (ADMIN_ACTION_LABELS[e.action] || e.action).toLowerCase().includes(term)
      );
      countEl.textContent = `${entries.length}件（全${learningHistory.length}件）`;

      if (entries.length === 0) {
        listEl.innerHTML = '<p class="text-xs text-[var(--ink-muted)] text-center py-6">まだ変更履歴がありません。カードのタイプやタグを変更すると、ここに記録されていきます。</p>';
        return;
      }
      const frag = document.createDocumentFragment();
      entries.forEach(entry => {
        const time = new Date(entry.at).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        const row = document.createElement('div');
        row.className = 'flex flex-col gap-0.5 p-2 rounded-[var(--radius-sm)] border border-[var(--line)]';
        row.innerHTML = `
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="time-chip">${escapeHtml(time)}</span>
            <span class="tag-chip">${escapeHtml(ADMIN_ACTION_LABELS[entry.action] || entry.action)}</span>
          </div>
          <div class="text-[11px] text-[var(--ink-muted)] break-words">${escapeHtml(entry.text)}</div>
          <div class="text-xs text-[var(--ink)] break-words">${escapeHtml(formatHistoryDetail(entry))}</div>
        `;
        frag.appendChild(row);
      });
      listEl.replaceChildren(frag);
    }
    document.getElementById('btn-admin-clear-history').addEventListener('click', async () => {
      const confirmed = await openDialog({ title: 'このブラウザに保存されている変更履歴を消去しますか？', message: '現在の学習内容（タグ・分類の状態）自体は消えません。', confirmLabel: '消去する', danger: true });
      if (!confirmed) return;
      learningHistory = [];
      try { localStorage.setItem(LEARNING_HISTORY_KEY, JSON.stringify(learningHistory)); } catch (e) { /* noop */ }
      renderAdminHistoryList();
      showToast('変更履歴を消去しました', 'success');
    });

    // ===== 事例ログ（case-log.json）ビューア（分析・研究用途） =====
    // サーバー側に蓄積された「いつ・何が・どう変わったか」の生ログをそのまま検索・閲覧できるようにする。
    // 変更履歴（learningHistory）はこのブラウザだけの簡易ログだが、事例ログは全利用者共有の記録。
    let cachedCaseLog = null;
    async function loadAndRenderCaseLog() {
      const listEl = document.getElementById('admin-caselog-list');
      listEl.innerHTML = `<div class="flex items-center text-[var(--ink-muted)] text-xs p-2"><i class="fa-solid fa-spinner fa-spin mr-2"></i> 事例ログを読み込み中...</div>`;
      try {
        const res = await fetch(`${API_BASE}/case-log`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        cachedCaseLog = await res.json();
      } catch (e) {
        cachedCaseLog = null;
        listEl.innerHTML = adminServerNoticeHtml('事例ログ');
        document.getElementById('admin-caselog-count').textContent = '';
        document.getElementById('admin-caselog-stats').textContent = '';
        return;
      }
      renderCaseLogList();
    }
    function renderCaseLogList() {
      const listEl = document.getElementById('admin-caselog-list');
      const countEl = document.getElementById('admin-caselog-count');
      const statsEl = document.getElementById('admin-caselog-stats');
      if (!Array.isArray(cachedCaseLog)) return;
      const term = (document.getElementById('admin-caselog-search').value || '').trim().toLowerCase();
      const actionFilter = document.getElementById('admin-caselog-action-filter').value;

      // 操作種別ごとの件数（全体の傾向をひと目で把握できるように）
      const actionCounts = {};
      cachedCaseLog.forEach(e => { actionCounts[e.action] = (actionCounts[e.action] || 0) + 1; });
      statsEl.textContent = `全${cachedCaseLog.length}件　` + Object.entries(actionCounts).map(([a, c]) => `${ADMIN_ACTION_LABELS[a] || a}:${c}`).join('　');

      let entries = cachedCaseLog.slice().reverse(); // 新しいものを上に
      if (actionFilter) entries = entries.filter(e => e.action === actionFilter);
      if (term) entries = entries.filter(e =>
        (e.text || '').toLowerCase().includes(term) ||
        (ADMIN_ACTION_LABELS[e.action] || e.action || '').toLowerCase().includes(term) ||
        formatHistoryDetail(e).toLowerCase().includes(term)
      );
      countEl.textContent = `${entries.length}件（全${cachedCaseLog.length}件）`;

      const MAX_RENDER = 500; // 大量ログでも画面が重くならないよう表示件数に上限を設ける
      const shown = entries.slice(0, MAX_RENDER);
      if (shown.length === 0) {
        listEl.innerHTML = '<p class="text-xs text-[var(--ink-muted)] text-center py-6">条件に一致する事例ログがありません。</p>';
        return;
      }
      const frag = document.createDocumentFragment();
      shown.forEach(entry => {
        const time = entry.at ? new Date(entry.at).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '(日時不明)';
        const row = document.createElement('div');
        row.className = 'flex flex-col gap-0.5 p-2 rounded-[var(--radius-sm)] border border-[var(--line)]';
        row.innerHTML = `
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="time-chip">${escapeHtml(time)}</span>
            <span class="tag-chip">${escapeHtml(ADMIN_ACTION_LABELS[entry.action] || entry.action || '不明')}</span>
          </div>
          <div class="text-[11px] text-[var(--ink-muted)] break-words">${escapeHtml(entry.text || '')}</div>
          <div class="text-xs text-[var(--ink)] break-words">${escapeHtml(formatHistoryDetail(entry))}</div>
        `;
        frag.appendChild(row);
      });
      if (entries.length > MAX_RENDER) {
        const note = document.createElement('p');
        note.className = 'text-[10px] text-[var(--ink-muted)] text-center py-2';
        note.textContent = `※ 表示件数が多いため最新${MAX_RENDER}件のみ表示しています（検索・絞り込みで対象を狭めてください）`;
        frag.appendChild(note);
      }
      listEl.replaceChildren(frag);
    }

    // ===== 学習傾向レポート（学習データから見えている傾向の可視化） =====
    // これまでは同じ文言への修正が繰り返された「傾向」（computeLearningTrendRows）は
    // AIへの指示文（buildEffectiveNotebookContent経由）に自動で織り込まれるだけで、
    // 実際に何が・どれだけ繰り返し確認されているのかを人が見て確かめる場所が無かった。
    // このタブでは、そのまま画面上に一覧表示し、AIへの指示文に実際に反映される
    // 上位LEARNING_TREND_MAX_FOR_PROMPT件かどうかも分かるようにする。
    // ※データ源は他タブ（現在の学習内容）と同じ globalAppData.learningUserDict のため、
    //   サーバーへの再取得は不要（学習データ管理を開いた時点で既に読み込み済み）。
    function renderLearningTrendsList() {
      const listEl = document.getElementById('admin-trends-list');
      const countEl = document.getElementById('admin-trends-count');
      const term = (document.getElementById('admin-trends-search').value || '').trim().toLowerCase();

      const allRows = computeLearningTrendRows();
      let rows = allRows;
      if (term) rows = rows.filter(r => r.text.toLowerCase().includes(term));
      countEl.textContent = `${rows.length}件（全${allRows.length}件・AIの指示に使われるのは得票の多い上位${LEARNING_TREND_MAX_FOR_PROMPT}件まで）`;

      if (rows.length === 0) {
        listEl.innerHTML = '<p class="text-xs text-[var(--ink-muted)] text-center py-6">まだ、同じ文言への同じ修正が2回以上繰り返されて確立した傾向がありません。</p>';
        return;
      }
      const frag = document.createDocumentFragment();
      rows.forEach(r => {
        const rankInAll = allRows.indexOf(r);
        const usedInPrompt = rankInAll >= 0 && rankInAll < LEARNING_TREND_MAX_FOR_PROMPT;
        const row = document.createElement('div');
        row.className = 'flex flex-col gap-1 p-2 rounded-[var(--radius-sm)] border border-[var(--line)]';
        row.innerHTML = `
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="time-chip">合計${r.totalVotes}回の一致</span>
            ${r.typeLabel ? `<span class="tag-chip">分類: ${escapeHtml(r.typeLabel)}</span>` : ''}
            ${!usedInPrompt ? '<span class="field-chip" style="background:var(--ink-muted);color:var(--on-fill);">件数が多いためAIの指示には未反映</span>' : ''}
          </div>
          <div class="text-xs text-[var(--ink)] break-words">${escapeHtml(r.text)}</div>
          ${r.tagNames.length ? `<div class="flex items-center gap-1 flex-wrap">${r.tagNames.map(n => `<span class="field-chip">${escapeHtml(n)}</span>`).join('')}</div>` : ''}
        `;
        frag.appendChild(row);
      });
      listEl.replaceChildren(frag);
    }

    // ===== ルール見直し候補（改善提案5）=====
    // 利用者への改善提案5：「手直しの記録を集計して、『このキーワードは何回もタグを直されている』という
    // 候補を一覧にする。そうすると、1件ずつ報告してもらわなくても改善点が見つかる」。
    // データ源は、各カードに残っている手で編集した履歴（item.editLog。logItemEdit参照）。
    //   ①外されたタグ：最後の操作が「タグ削除」で、今も付いていないタグ。そのタグを付けた原因と
    //     考えられる既定のキーワード（本文に含まれる、そのタグのキーワード）ごとに数える。
    //   ②手で追加されたタグ：最後の操作が「タグ追加」で、今も付いているタグ（キーワードが足りない候補）。
    //   ③S/O・不要の手直し：最初の自動分類と今の分類が違うカード。
    // 削除したカードは履歴も残らないため数えられない。
    const RULE_REVIEW_TYPE_LABELS = { s: 'Sデータ', o: 'Oデータ', unnecessary: '不必要', unclassified: '未分類' };
    function netTagEdits(item) {
      const last = new Map();
      (Array.isArray(item.editLog) ? item.editLog : []).forEach(e => {
        if ((e.kind === 'tagAdd' || e.kind === 'tagRemove') && Number.isInteger(Number(e.hId))) last.set(Number(e.hId), e.kind);
      });
      const current = new Set(item.hendersonIds || []);
      const removed = [], added = [];
      last.forEach((kind, h) => {
        if (kind === 'tagRemove' && !current.has(h)) removed.push(h);
        if (kind === 'tagAdd' && current.has(h)) added.push(h);
      });
      return { removed, added };
    }
    function computeRuleReviewCandidates(patients) {
      const removedMap = new Map(), addedMap = new Map(), typeMap = new Map();
      const pushExample = (entry, text) => { if (!entry.examples.includes(text) && entry.examples.length < 5) entry.examples.push(text); };
      (patients || []).forEach(p => (p.items || []).forEach(item => {
        if (!Array.isArray(item.editLog) || item.editLog.length === 0) return;
        const text = item.text || '';
        const { removed, added } = netTagEdits(item);
        removed.forEach(h => {
          const need = HENDERSON_NEEDS.find(n => n.id === h);
          const hits = need ? need.keywords.filter(kw => text.includes(kw)) : [];
          // 長いキーワードに含まれる短いキーワード（「呼吸数」の中の「呼吸」等）は、長い方にまとめる
          const keywords = hits.filter(kw => !hits.some(o => o !== kw && o.includes(kw)));
          (keywords.length ? keywords : ['']).forEach(kw => {
            const key = `${h}\u0000${kw}`;
            const entry = removedMap.get(key) || { hendersonId: h, keyword: kw, count: 0, examples: [], movedTo: {} };
            entry.count++;
            pushExample(entry, text);
            added.forEach(a => { entry.movedTo[a] = (entry.movedTo[a] || 0) + 1; });
            removedMap.set(key, entry);
          });
        });
        added.forEach(h => {
          const entry = addedMap.get(h) || { hendersonId: h, count: 0, examples: [] };
          entry.count++;
          pushExample(entry, text);
          addedMap.set(h, entry);
        });
        const firstType = item.editLog.find(e => e.kind === 'type');
        if (firstType && firstType.from && item.type && firstType.from !== item.type) {
          const key = `${firstType.from}->${item.type}`;
          const entry = typeMap.get(key) || { from: firstType.from, to: item.type, count: 0, examples: [] };
          entry.count++;
          pushExample(entry, text);
          typeMap.set(key, entry);
        }
      }));
      const byCount = (a, b) => b.count - a.count;
      return {
        removedKeywords: Array.from(removedMap.values()).sort(byCount),
        addedTags: Array.from(addedMap.values()).sort(byCount),
        typeChanges: Array.from(typeMap.values()).sort(byCount)
      };
    }
    function buildRuleReviewReportText(candidates, generatedAt) {
      const name = h => hendersonNameOf(h).replace(/^\d+\.\s*/, '');
      const lines = ['ルール見直し候補（手直しの記録の集計）', `出力日時: ${generatedAt || new Date().toLocaleString('ja-JP')}`, ''];
      lines.push('■ 外されることが多いタグとキーワード');
      if (!candidates.removedKeywords.length) lines.push('（なし）');
      candidates.removedKeywords.forEach(r => {
        const moved = Object.entries(r.movedTo).sort((a, b) => b[1] - a[1]).map(([h, c]) => `${h}.${name(Number(h))}（${c}回）`).join('、');
        lines.push(`・${r.hendersonId}.${name(r.hendersonId)} ／ キーワード「${r.keyword || '（キーワード以外：検査値・見出し・発言など）'}」：${r.count}回外された${moved ? ` → 付け直し先: ${moved}` : ''}`);
        r.examples.forEach(t => lines.push(`    例）${t}`));
      });
      lines.push('', '■ 手で追加されることが多いタグ（キーワードが足りない候補）');
      if (!candidates.addedTags.length) lines.push('（なし）');
      candidates.addedTags.forEach(r => {
        lines.push(`・${r.hendersonId}.${name(r.hendersonId)}：${r.count}回追加された`);
        r.examples.forEach(t => lines.push(`    例）${t}`));
      });
      lines.push('', '■ S/O・不要の手直し');
      if (!candidates.typeChanges.length) lines.push('（なし）');
      candidates.typeChanges.forEach(r => {
        lines.push(`・${RULE_REVIEW_TYPE_LABELS[r.from] || r.from} → ${RULE_REVIEW_TYPE_LABELS[r.to] || r.to}：${r.count}回`);
        r.examples.forEach(t => lines.push(`    例）${t}`));
      });
      return lines.join('\n');
    }
    let lastRuleReviewCandidates = null;
    function renderRuleReviewPanel() {
      const listEl = document.getElementById('admin-review-list');
      const countEl = document.getElementById('admin-review-count');
      const c = computeRuleReviewCandidates(globalAppData.patients);
      lastRuleReviewCandidates = c;
      const total = c.removedKeywords.length + c.addedTags.length + c.typeChanges.length;
      countEl.textContent = `全患者の手直しから ${total}件の候補`;
      const name = h => hendersonNameOf(h).replace(/^\d+\.\s*/, '');
      const examplesHtml = ex => ex.map(t => `<div class="text-[11px] text-[var(--ink-muted)] break-words">例）${escapeHtml(t)}</div>`).join('');
      const countChip = n => `<span class="field-chip" style="background:${n >= 2 ? 'var(--brick)' : 'var(--ink-muted)'};color:var(--on-fill);">${n}回</span>`;
      const section = (title, rowsHtml) => `<div class="text-xs font-semibold text-[var(--ink)] mt-1">${title}</div>${rowsHtml || '<p class="text-[11px] text-[var(--ink-muted)] pl-1">（まだありません）</p>'}`;
      const removedHtml = c.removedKeywords.map((r, i) => {
        const moved = Object.entries(r.movedTo).sort((a, b) => b[1] - a[1]).map(([h, n]) => `${h}.${escapeHtml(name(Number(h)))}（${n}回）`).join('、');
        const alreadyExcluded = r.keyword && (globalAppData.customTagRules || []).some(x => x.mode === 'exclude' && x.keyword === r.keyword && x.hendersonIds.includes(r.hendersonId));
        const btn = !r.keyword ? '' : alreadyExcluded
          ? '<span class="text-[10px] text-[var(--ink-muted)]">登録済み（付けない）</span>'
          : `<button class="btn btn-outline text-[10px] py-0.5" onclick="excludeKeywordFromReview(${i})" title="「追加キーワード」に、このキーワードではこのタグを付けないルールを登録します">このキーワードでは付けない</button>`;
        return `<div class="flex flex-col gap-1 p-2 rounded-[var(--radius-sm)] border border-[var(--line)]">
          <div class="flex items-center gap-1.5 flex-wrap">${countChip(r.count)}<span class="tag-chip">${r.hendersonId}.${escapeHtml(name(r.hendersonId))}</span>
          <span class="text-xs">キーワード「<b>${escapeHtml(r.keyword || '（キーワード以外：検査値・見出し・発言など）')}</b>」で付いたタグが外された</span>${btn}</div>
          ${moved ? `<div class="text-[11px] text-[var(--ink)]">付け直し先：${moved}</div>` : ''}${examplesHtml(r.examples)}</div>`;
      }).join('');
      const addedHtml = c.addedTags.map(r => `<div class="flex flex-col gap-1 p-2 rounded-[var(--radius-sm)] border border-[var(--line)]">
          <div class="flex items-center gap-1.5 flex-wrap">${countChip(r.count)}<span class="tag-chip">${r.hendersonId}.${escapeHtml(name(r.hendersonId))}</span><span class="text-xs">を手で追加（キーワードが足りない可能性）</span>
          <button class="btn btn-outline text-[10px] py-0.5" onclick="openCustomRuleFormFor(${r.hendersonId})" title="「追加キーワード」タブで、このタグを付けるキーワードを登録します">キーワードを登録</button></div>${examplesHtml(r.examples)}</div>`).join('');
      const typeHtml = c.typeChanges.map(r => `<div class="flex flex-col gap-1 p-2 rounded-[var(--radius-sm)] border border-[var(--line)]">
          <div class="flex items-center gap-1.5 flex-wrap">${countChip(r.count)}<span class="text-xs">${escapeHtml(RULE_REVIEW_TYPE_LABELS[r.from] || r.from)} → <b>${escapeHtml(RULE_REVIEW_TYPE_LABELS[r.to] || r.to)}</b> に手直し</span></div>${examplesHtml(r.examples)}</div>`).join('');
      listEl.innerHTML = section('① 外されることが多いタグとキーワード', removedHtml) + section('② 手で追加されることが多いタグ', addedHtml) + section('③ S/O・不要の手直し', typeHtml);
    }
    window.excludeKeywordFromReview = async function(index) {
      const r = lastRuleReviewCandidates?.removedKeywords?.[index];
      if (!r || !r.keyword) return;
      const tagName = hendersonNameOf(r.hendersonId).replace(/^\d+\.\s*/, '');
      const ok = await openDialog({ title: 'このキーワードではタグを付けないようにしますか？', message: `キーワード「${r.keyword}」では、${r.hendersonId}.${tagName} のタグを自動で付けないようにします（他のキーワードで付く場合は付きます）。\n全員に共有され、次に分類したときから反映されます。`, confirmLabel: '登録する' });
      if (ok !== true) return;
      await saveCustomTagRules([...(globalAppData.customTagRules || []), { keyword: r.keyword, mode: 'exclude', hendersonIds: [r.hendersonId], note: `ルール見直し候補から登録（${r.count}回外されていた）`, updatedAt: new Date().toISOString() }]);
      renderRuleReviewPanel();
    };
    window.exportRuleReviewText = function() {
      const c = lastRuleReviewCandidates || computeRuleReviewCandidates(globalAppData.patients);
      const blob = new Blob([buildRuleReviewReportText(c)], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ルール見直し候補.txt';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      showToast('ルール見直し候補をテキストファイル（.txt）に書き出しました', 'success');
    };

    // ===== 追加キーワード（改善提案6。detectMultipleHendersonTagsの下の説明を参照）=====
    let customRulesOffline = false;
    async function loadCustomTagRules() {
      try {
        const res = await fetch(`${API_BASE}/custom-tag-rules`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        globalAppData.customTagRules = normalizeCustomTagRules(data?.rules);
        try { localStorage.setItem(CUSTOM_TAG_RULES_CACHE_KEY, JSON.stringify(globalAppData.customTagRules)); } catch (e) { /* 保存できなくても動作は続ける */ }
        customRulesOffline = false;
      } catch (e) {
        customRulesOffline = true;
        console.warn('追加キーワードの読み込みに失敗しました（このブラウザに保存されている写しで動作します）:', e);
      }
      renderCustomTagRulesPanel();
    }
    async function saveCustomTagRules(rules) {
      const normalized = normalizeCustomTagRules(rules);
      globalAppData.customTagRules = normalized;
      try { localStorage.setItem(CUSTOM_TAG_RULES_CACHE_KEY, JSON.stringify(normalized)); } catch (e) { /* 保存できなくても動作は続ける */ }
      renderCustomTagRulesPanel();
      try {
        const res = await fetch(`${API_BASE}/custom-tag-rules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: normalized }) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        globalAppData.customTagRules = normalizeCustomTagRules(data?.rules);
        try { localStorage.setItem(CUSTOM_TAG_RULES_CACHE_KEY, JSON.stringify(globalAppData.customTagRules)); } catch (e) { /* 同上 */ }
        renderCustomTagRulesPanel();
        showToast('追加キーワードを保存しました（全員に共有されます。今のカードに反映するには「分類開始」→「置き換えて分類」）', 'success');
      } catch (e) {
        console.warn('追加キーワードの保存に失敗しました:', e);
        showToast(['共有先に保存できませんでした', { text: 'このブラウザでは使えますが、他の人には共有されていません。サーバーが動いているか確かめてから、もう一度登録してください。', detail: true }], 'error');
      }
    }
    function renderCustomTagRulesPanel() {
      const listEl = document.getElementById('admin-customrules-list');
      if (!listEl) return;
      const select = document.getElementById('customrule-need');
      if (select && select.options && select.options.length <= 1) select.innerHTML = '<option value="">タグを選択</option>' + HENDERSON_NEEDS.map(n => `<option value="${n.id}">${n.id}. ${escapeHtml(n.name)}</option>`).join('');
      const rules = globalAppData.customTagRules || [];
      document.getElementById('admin-customrules-count').textContent = `${rules.length}件`;
      // サーバーにつながらないときは、このブラウザの写しを表示していることを伝える（他の人の登録は見えない）
      const offlineNote = customRulesOffline ? `<p class="text-[10.5px] text-[var(--brick)] px-1 pb-1"><i class="fa-solid fa-triangle-exclamation"></i> ${IS_FILE_PROTOCOL ? 'HTMLファイルを直接開いている' : 'サーバーに接続できない'}ため、このブラウザに保存されている写しを表示しています（他の人の登録は見えず、ここで登録した分も共有されません）。</p>` : '';
      if (!rules.length) {
        listEl.innerHTML = offlineNote + '<p class="text-xs text-[var(--ink-muted)] text-center py-6">まだ登録はありません。上の欄から登録すると、次に分類したときから反映されます。</p>';
        return;
      }
      const cp = getCurrentPatient();
      listEl.innerHTML = offlineNote + rules.map(r => {
        const tags = r.hendersonIds.map(h => `<span class="tag-chip">${h}.${escapeHtml(hendersonNameOf(h).replace(/^\d+\.\s*/, ''))}</span>`).join('');
        const hits = (cp.items || []).filter(i => (i.text || '').includes(r.keyword)).length;
        return `<div class="flex items-center gap-1.5 flex-wrap p-2 rounded-[var(--radius-sm)] border border-[var(--line)]">
          <span class="field-chip" style="background:${r.mode === 'exclude' ? 'var(--ink-muted)' : 'var(--accent)'};color:var(--on-fill);">${r.mode === 'exclude' ? '付けない' : '付ける'}</span>
          <span class="text-xs">「<b>${escapeHtml(r.keyword)}</b>」を含むとき</span>${tags}
          <span class="text-[10px] text-[var(--ink-muted)]">今の患者で該当 ${hits}枚</span>
          ${r.note ? `<span class="text-[10px] text-[var(--ink-muted)] break-words">メモ：${escapeHtml(r.note)}</span>` : ''}
          <button class="icon-btn-outline danger ml-auto" onclick="deleteCustomTagRule('${r.id}')" title="このルールを削除"><i class="fa-solid fa-times"></i></button>
        </div>`;
      }).join('');
    }
    window.addCustomTagRuleFromForm = async function() {
      const keyword = (document.getElementById('customrule-keyword').value || '').normalize('NFKC').trim();
      const mode = document.getElementById('customrule-mode').value === 'exclude' ? 'exclude' : 'add';
      const hId = Number(document.getElementById('customrule-need').value);
      const note = (document.getElementById('customrule-note').value || '').trim();
      if (!keyword) return showToast('キーワードを入力してください', 'warn');
      if (!(hId >= 1 && hId <= 14)) return showToast('タグを選んでください', 'warn');
      const tagName = hendersonNameOf(hId).replace(/^\d+\.\s*/, '');
      if (mode === 'exclude' && !isBuiltInKeywordOf(hId, keyword)) {
        return showToast(`「${keyword}」は ${hId}.${tagName} の既定のキーワードに無いため、「付けない」を登録しても変わりません（別のキーワードで付いている可能性があります）`, 'warn');
      }
      if (mode === 'add' && isBuiltInKeywordOf(hId, keyword)) {
        return showToast(`「${keyword}」は既に ${hId}.${tagName} のキーワードとして登録されています`, 'info');
      }
      const rules = globalAppData.customTagRules || [];
      if (rules.some(r => r.keyword === keyword && r.mode === mode && r.hendersonIds.includes(hId))) return showToast('同じルールが既に登録されています', 'info');
      if (!(await confirmSharedChange(`追加キーワード「${keyword}」で ${hId}.${tagName} のタグを${mode === 'exclude' ? '付けない' : '付ける'}ルールを登録します。`))) return;
      await saveCustomTagRules([...rules, { keyword, mode, hendersonIds: [hId], note, updatedAt: new Date().toISOString() }]);
      document.getElementById('customrule-keyword').value = '';
      document.getElementById('customrule-note').value = '';
    };
    window.deleteCustomTagRule = async function(id) {
      const rule = (globalAppData.customTagRules || []).find(r => r.id === id);
      if (!rule) return;
      const ok = await openDialog({ title: 'このルールを削除しますか？', message: `「${rule.keyword}」のルールを削除します（全員から消えます）。`, confirmLabel: '削除', danger: true });
      if (ok !== true) return;
      await saveCustomTagRules((globalAppData.customTagRules || []).filter(r => r.id !== id));
    };
    window.openCustomRuleFormFor = function(hId) {
      switchAdminTab('customrules');
      document.getElementById('customrule-mode').value = 'add';
      document.getElementById('customrule-need').value = String(hId);
      document.getElementById('customrule-keyword').focus();
    };

    // ===== カルテスナップショットビューア（patient-snapshots.json）=====
    // 自分やほかの利用者がタブを閉じた（＝編集を終えた）瞬間の患者カルテ（S/Oカードの内容一式）を
    // そのまま振り返れる、閲覧専用の履歴（beforeunloadのsendBeaconで記録される。app.js側は
    // window.addEventListener('beforeunload', ...) 内の /api/patient-snapshot 送信を参照）。
    // patients.json（PUT /api/patients/:id）は他端末のカードとマージされ続ける「最新の共有カルテ」
    // だが、ここは上書きせずそのまま積み重ねる点が異なる。事例ログ等と同様、削除機能は無い。
    let cachedPatientSnapshots = null;
    const expandedSnapshotIds = new Set(); // どの行を展開表示中か（タブを開き直すとリセットされる）

    async function loadAndRenderPatientSnapshots() {
      const listEl = document.getElementById('admin-snapshots-list');
      listEl.innerHTML = `<div class="flex items-center text-[var(--ink-muted)] text-xs p-2"><i class="fa-solid fa-spinner fa-spin mr-2"></i> カルテスナップショットを読み込み中...</div>`;
      try {
        const res = await fetch(`${API_BASE}/patient-snapshots`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        cachedPatientSnapshots = await res.json();
      } catch (e) {
        cachedPatientSnapshots = null;
        listEl.innerHTML = adminServerNoticeHtml('カルテスナップショット');
        document.getElementById('admin-snapshots-count').textContent = '';
        return;
      }
      renderPatientSnapshotsList();
    }

    function renderPatientSnapshotsList() {
      const listEl = document.getElementById('admin-snapshots-list');
      const countEl = document.getElementById('admin-snapshots-count');
      if (!Array.isArray(cachedPatientSnapshots)) return;
      const term = (document.getElementById('admin-snapshots-search').value || '').trim().toLowerCase();

      let entries = cachedPatientSnapshots.slice().reverse(); // 新しいものを上に
      if (term) entries = entries.filter(e => (e.patientTitle || '').toLowerCase().includes(term));
      countEl.textContent = `${entries.length}件（全${cachedPatientSnapshots.length}件）`;

      const MAX_RENDER = 200; // カード一式を含み1件が大きくなりやすいため、他のログより控えめな上限にする
      const shown = entries.slice(0, MAX_RENDER);
      if (shown.length === 0) {
        listEl.innerHTML = '<p class="text-xs text-[var(--ink-muted)] text-center py-6">条件に一致するカルテスナップショットがありません（タブを閉じるたびに、ここに記録されていきます）。</p>';
        return;
      }
      const typeLabelOf = t => t === 's' ? 'S' : (t === 'o' ? 'O' : (t === 'unnecessary' ? '不要' : t || '未分類'));
      const frag = document.createDocumentFragment();
      shown.forEach(entry => {
        const time = entry.closedAt ? new Date(entry.closedAt).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '(日時不明)';
        // ログイン機能が無いため「誰が」を実名では特定できない。せめて同じタブ（clientId）による
        // 複数回のクローズを見分けられるよう、識別子の末尾だけを短く表示する。
        const clientShort = entry.clientId ? entry.clientId.slice(-6) : '不明';
        const items = Array.isArray(entry.items) ? entry.items : [];
        // 「不要」判定済みのカードはタグが無くて当然のため対象外とし、患者背景（基本情報／
        // 医学情報）に振り分けられたカードも意図的にタグが無いカードのため対象外とする。
        // それ以外でhendersonIdsが空のものだけを数える。折りたたんだ状態でも件数が分かるよう、
        // 展開しなくても一覧の見出し行に表示する。
        const untaggedCount = items.filter(it => it.type !== 'unnecessary' && !(Array.isArray(it.hendersonIds) && it.hendersonIds.length > 0)).length;
        const isExpanded = expandedSnapshotIds.has(entry.id);
        const row = document.createElement('div');
        row.className = 'flex flex-col gap-1.5 p-2 rounded-[var(--radius-sm)] border border-[var(--line)]';
        row.innerHTML = `
          <button class="snapshot-toggle-btn flex items-center gap-1.5 flex-wrap text-left" data-id="${escapeHtml(entry.id)}" style="cursor:pointer;">
            <i class="fa-solid ${isExpanded ? 'fa-chevron-down' : 'fa-chevron-right'} text-[10px] text-[var(--ink-muted)]"></i>
            <span class="time-chip">${escapeHtml(time)}</span>
            ${entry.patientTitle ? `<span class="tag-chip">${escapeHtml(entry.patientTitle)}</span>` : ''}
            <span class="field-chip" style="background:var(--accent-soft);color:var(--accent-dark);">${items.length}件のカード</span>
            ${untaggedCount > 0 ? `<span class="field-chip font-semibold" style="background:var(--brick-soft);color:var(--brick);"><i class="fa-solid fa-triangle-exclamation"></i> タグ未設定${untaggedCount}件</span>` : ''}
            <span class="text-[10px] text-[var(--ink-muted)]">タブ識別子: …${escapeHtml(clientShort)}</span>
          </button>
          ${isExpanded ? `
            <div class="flex flex-col gap-1 pl-4 border-l-2 border-[var(--line-soft)]">
              ${items.length === 0 ? '<p class="text-[11px] text-[var(--ink-muted)]">カードはありませんでした。</p>' : items.map(it => {
                // 【原因と修正】タグが付いている場合は括弧書きでタグ名を表示していたが、タグが
                // 付いていない場合は何も表示されず、ぱっと見ただけではタグ未設定のカードを
                // 見分けられなかった（利用者からの指摘：「スナップショットからもタグが
                // 付いていないものがわかるようにしてほしい」）。「不要」判定済みのカードは
                // タグが無くて当然のため対象外とし、それ以外でhendersonIdsが空のものには
                // 目立つ「タグ未設定」バッジを表示する。
                const hasTags = Array.isArray(it.hendersonIds) && it.hendersonIds.length > 0;
                const tagBadge = hasTags
                  ? `<span class="text-[10px] text-[var(--ink-muted)] shrink-0">(${it.hendersonIds.map(hendersonNameOf).join('/')})</span>`
                  : (it.type !== 'unnecessary' ? `<span class="text-[10px] shrink-0 font-semibold" style="color:var(--brick);"><i class="fa-solid fa-triangle-exclamation"></i> タグ未設定</span>` : '');
                return `
                <div class="text-[11px] text-[var(--ink)] flex items-start gap-1.5">
                  <span class="field-chip shrink-0" style="background:var(--line-soft);color:var(--ink-muted);">${escapeHtml(typeLabelOf(it.type))}</span>
                  <span class="break-words">${escapeHtml(it.text || '')}</span>
                  ${tagBadge}
                </div>
              `;
              }).join('')}
              ${entry.sourceText ? `<p class="text-[10px] text-[var(--ink-muted)] mt-1">元の文章:</p><pre class="text-[11px] text-[var(--ink)] whitespace-pre-wrap break-words font-sans bg-[var(--paper)] border border-[var(--line-soft)] rounded-[var(--radius-sm)] p-2" style="max-height:150px; overflow-y:auto;">${escapeHtml(entry.sourceText)}</pre>` : ''}
            </div>
          ` : ''}
        `;
        frag.appendChild(row);
      });
      if (entries.length > MAX_RENDER) {
        const note = document.createElement('p');
        note.className = 'text-[10px] text-[var(--ink-muted)] text-center py-2';
        note.textContent = `※ 表示件数が多いため最新${MAX_RENDER}件のみ表示しています（検索で対象を狭めてください）`;
        frag.appendChild(note);
      }
      listEl.replaceChildren(frag);
    }
    document.getElementById('admin-snapshots-search').addEventListener('input', renderPatientSnapshotsList);
    document.getElementById('admin-snapshots-list').addEventListener('click', e => {
      const btn = e.target.closest('.snapshot-toggle-btn');
      if (!btn) return;
      const id = btn.dataset.id;
      if (expandedSnapshotIds.has(id)) expandedSnapshotIds.delete(id); else expandedSnapshotIds.add(id);
      renderPatientSnapshotsList();
    });

    // ===== 情報カードの不具合報告ビューア（card-reports.json）=====
    // カード右上の旗アイコンから送られた「この情報カードの書き込みが変だ」という内容の一覧。
    // 事例ログ・抽出前の文章と同様、全利用者共有・閲覧のみ（削除機能は無い）。
    // 同じ人がページを閉じるまでに送った複数件は、サーバー側で1つのレコード（items配列）にまとめられている。
    let cachedCardReports = null;
    async function loadAndRenderCardReports() {
      const listEl = document.getElementById('admin-reports-list');
      listEl.innerHTML = `<div class="flex items-center text-[var(--ink-muted)] text-xs p-2"><i class="fa-solid fa-spinner fa-spin mr-2"></i> 報告を読み込み中...</div>`;
      document.getElementById('admin-reports-summary').classList.add('hidden');
      cachedReportSummaryLines = []; // タブを開き直したら前回の要約結果（行番号）は破棄する
      try {
        const res = await fetch(`${API_BASE}/card-reports`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        cachedCardReports = await res.json();
      } catch (e) {
        cachedCardReports = null;
        listEl.innerHTML = adminServerNoticeHtml('情報カードの報告');
        document.getElementById('admin-reports-count').textContent = '';
        return;
      }
      renderCardReportsList();
    }

    function renderCardReportsList() {
      const listEl = document.getElementById('admin-reports-list');
      const countEl = document.getElementById('admin-reports-count');
      if (!Array.isArray(cachedCardReports)) return;
      const term = (document.getElementById('admin-reports-search').value || '').trim().toLowerCase();

      let groups = cachedCardReports.slice().reverse(); // 新しい投稿を上に
      if (term) groups = groups.filter(g =>
        (g.patientTitle || '').toLowerCase().includes(term) ||
        (g.items || []).some(it => (it.cardText || '').toLowerCase().includes(term) || (it.comment || '').toLowerCase().includes(term))
      );
      const totalItems = cachedCardReports.reduce((sum, g) => sum + (g.items?.length || 0), 0);
      countEl.textContent = `${groups.length}件の投稿（全${cachedCardReports.length}件・報告${totalItems}件）`;

      if (groups.length === 0) {
        listEl.innerHTML = '<p class="text-xs text-[var(--ink-muted)] text-center py-6">条件に一致する報告がありません（カードの旗アイコンから送ると、ここに記録されていきます）。</p>';
        return;
      }
      const frag = document.createDocumentFragment();
      groups.forEach(group => {
        const time = group.updatedAt ? new Date(group.updatedAt).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '(日時不明)';
        const row = document.createElement('div');
        row.className = 'flex flex-col gap-1.5 p-2 rounded-[var(--radius-sm)] border border-[var(--line)]';
        const itemsHtml = (group.items || []).map(it => `
          <div class="pl-2 border-l-2 border-[var(--brick-soft)] flex flex-col gap-0.5">
            <p class="text-xs text-[var(--ink)] break-words">${escapeHtml(it.cardText || '')}</p>
            ${it.comment ? `<p class="text-[11px] text-[var(--brick)] break-words"><i class="fa-solid fa-comment-dots mr-1"></i>${escapeHtml(it.comment)}</p>` : ''}
          </div>
        `).join('');
        row.innerHTML = `
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="time-chip">${escapeHtml(time)}</span>
            ${group.patientTitle ? `<span class="tag-chip">${escapeHtml(group.patientTitle)}</span>` : ''}
            <span class="field-chip" style="background:var(--brick-soft);color:var(--brick);">${(group.items || []).length}件の報告（1人分の投稿）</span>
          </div>
          <div class="flex flex-col gap-1.5">${itemsHtml}</div>
        `;
        frag.appendChild(row);
      });
      listEl.replaceChildren(frag);
    }

    // 「AIで要約」：寄せられた報告全体をGeminiに渡し、不具合パターンごとの修正指示を1行1件で
    // 生成する。各行はそのまま「抽出・分類基準への追加の要望」として単体で意味が通る文にしてもらい、
    // 行ごとに「基準に追加」ボタンを添えることで、報告→要約→ワンクリックでの基準反映まで
    // その場で完結できるようにする（extraction-criteria.jsonへの追加はaddExtraCriteria()を再利用）。
    let cachedReportSummaryLines = [];
    async function summarizeCardReportsAI() {
      if (!Array.isArray(cachedCardReports) || cachedCardReports.length === 0) return showToast('要約できる報告がありません', 'warn');
      if (!globalAppData.apiKey) return showToast('API設定からGemini APIキーを入力してください', 'warn');

      const summaryEl = document.getElementById('admin-reports-summary');
      summaryEl.classList.remove('hidden');
      summaryEl.innerHTML = `<div class="flex items-center text-[var(--brick)]"><i class="fa-solid fa-spinner fa-spin mr-2"></i> 寄せられた報告をAIで要約中...</div>`;

      const reportTexts = cachedCardReports.flatMap(g => (g.items || []).map(it =>
        `カード内容: ${it.cardText}${it.comment ? ` ／ 報告コメント: ${it.comment}` : ''}`
      )).join('\n');

      try {
        const text = await callGeminiAI([{ role: "user", parts: [{ text: `あなたはこの看護アセスメント支援システムの開発者です。以下は現場の利用者から寄せられた、情報カードの抽出・分類（S/O判定、ヘンダーソンタグ、検査値と単位の切り分けなど）に関する不具合報告の一覧です。よくある不具合のパターンごとに、「どう直すべきか」の指示文を1パターンにつき1行で書いてください。それぞれの行は、抽出・分類AIへの指示文としてその1行だけを渡しても意味が通るように、具体的かつ自己完結した文にしてください。出力は1行1パターンの指示文のみとし、見出し・番号・記号・前置きや説明文は付けないでください。\n【報告一覧】\n${reportTexts}` }] }]);
        // 番号・記号・空行を取り除き、1行=1件の指示文として扱う
        cachedReportSummaryLines = text.split('\n')
          .map(line => line.replace(/^[\s・\-*0-9.、）)]+/, '').trim())
          .filter(line => line.length > 0);
        renderReportSummaryLines();
      } catch (err) {
        console.warn('報告の要約エラー:', err);
        cachedReportSummaryLines = [];
        summaryEl.innerHTML = `<span class="text-[var(--brick)]">要約中にエラーが発生しました（${escapeHtml(err.message || '通信エラー')}）。APIキーや通信状況をご確認ください。</span>`;
      }
    }

    function renderReportSummaryLines() {
      const summaryEl = document.getElementById('admin-reports-summary');
      if (cachedReportSummaryLines.length === 0) {
        summaryEl.innerHTML = `<p class="text-xs text-[var(--ink-muted)]">要約結果を生成できませんでした。もう一度お試しください。</p>`;
        return;
      }
      summaryEl.innerHTML = `
        <p class="text-[10px] text-[var(--ink-muted)] mb-1.5">パターンごとの修正指示です。「基準に追加」を押すと、その行がそのまま「分類基準への追加の要望」として登録され、全員に共有されます。</p>
        <div class="flex flex-col gap-1.5">
          ${cachedReportSummaryLines.map((line, i) => `
            <div class="flex items-start gap-2 p-1.5 rounded-[var(--radius-sm)] border border-[var(--line-soft)]" style="background:var(--surface);">
              <span class="flex-1 text-xs text-[var(--ink)] break-words">${escapeHtml(line)}</span>
              <button id="btn-add-summary-line-${i}" onclick="addSummaryLineToCriteria(${i})" class="btn btn-outline shrink-0" style="padding:2px 8px;font-size:10px;"><i class="fa-solid fa-plus mr-1"></i>基準に追加</button>
            </div>
          `).join('')}
        </div>
      `;
    }

    // 要約結果の1行を、抽出・分類基準への追加の要望としてそのまま登録する（addExtraCriteriaを再利用）。
    // 登録後はボタンを「追加済み」表示に変え、誤って同じ内容を二重登録しないようにする。
    window.addSummaryLineToCriteria = async function(idx) {
      const line = cachedReportSummaryLines[idx];
      if (!line) return;
      const btn = document.getElementById(`btn-add-summary-line-${idx}`);
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
      const ok = await addExtraCriteria(line);
      if (ok) {
        showToast('分類基準への追加の要望として登録しました', 'success');
        if (btn) { btn.innerHTML = '<i class="fa-solid fa-check mr-1"></i>追加済み'; btn.style.opacity = '0.6'; btn.style.cursor = 'default'; }
      } else if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-plus mr-1"></i>基準に追加';
      }
    };

    DOM.tabSoBoard.addEventListener('click', () => switchView('so'));
    DOM.tabAssessment.addEventListener('click', () => switchView('assessment'));
    DOM.tabReference.addEventListener('click', () => switchView('reference'));
    DOM.tabLabs.addEventListener('click', () => switchView('labs'));
    document.getElementById('tab-careplan')?.addEventListener('click', () => switchView('careplan'));

    // 総合アセスメント表の欲求の切り替えボタンは、上のヘッダーのすぐ下に貼り付ける（ヘッダーの高さに合わせる）
    function updateNeedNavTop() {
      const header = document.querySelector('header');
      if (header) document.documentElement.style.setProperty('--need-nav-top', `${Math.ceil(header.getBoundingClientRect().height) + 6}px`);
    }
    window.addEventListener('resize', updateNeedNavTop);
    function switchView(viewName) {
      updateNeedNavTop();
      DOM.viewSoBoard.classList.toggle('hidden', viewName !== 'so');
      DOM.viewAssessment.classList.toggle('hidden', viewName !== 'assessment');
      DOM.viewReference.classList.toggle('hidden', viewName !== 'reference');
      DOM.viewLabs.classList.toggle('hidden', viewName !== 'labs');
      DOM.tabLabs.className = `tab-pill ${viewName === 'labs' ? 'active' : ''}`;
      DOM.tabSoBoard.className = `tab-pill ${viewName === 'so' ? 'active' : ''}`;
      DOM.tabAssessment.className = `tab-pill ${viewName === 'assessment' ? 'active' : ''}`;
      DOM.tabReference.className = `tab-pill ${viewName === 'reference' ? 'active' : ''}`;
      // 看護計画のページ（js/12）
      const viewCarePlan = document.getElementById('view-careplan');
      if (viewCarePlan) viewCarePlan.classList.toggle('hidden', viewName !== 'careplan');
      const tabCarePlan = document.getElementById('tab-careplan');
      if (tabCarePlan) tabCarePlan.className = `tab-pill ${viewName === 'careplan' ? 'active' : ''}`;
      if (viewName === 'careplan' && typeof renderCarePlans === 'function') renderCarePlans();
      if (viewName === 'assessment') renderAssessmentTable();
      if (viewName === 'reference') renderReferenceList();
      if (viewName === 'labs') renderLabTrend();
    }

    // 【記録メモの全画面表示】利用者からの要望：「記録メモを貼り付けたボックスが見づらいときに全画面表示したい」。
    // 入力欄（と、カードを選んだときの該当箇所の表示）を包む枠ごと画面いっぱいに広げる。入力欄そのものを
    // 動かさないので、入力中の文字・保存・該当箇所の表示はそのまま使える。Escキーか「元に戻す」で戻る。
    function updateSourceEditorCount() {
      const el = document.getElementById('source-editor-count');
      if (el) el.textContent = DOM.sourceText.value ? `（${DOM.sourceText.value.length.toLocaleString()}文字）` : '';
    }
    window.toggleSourceFullscreen = function(force) {
      const box = document.getElementById('source-editor');
      if (!box) return;
      const on = typeof force === 'boolean' ? force : !box.classList.contains('is-fullscreen');
      box.classList.toggle('is-fullscreen', on);
      document.body.classList.toggle('source-fullscreen-open', on);
      const btn = document.getElementById('btn-source-fullscreen');
      if (btn) {
        btn.innerHTML = on ? '<i class="fa-solid fa-compress"></i><span>元に戻す</span>' : '<i class="fa-solid fa-expand"></i><span>全画面</span>';
        btn.title = on ? '元の大きさに戻します（Esc）' : '入力欄を画面いっぱいに広げます（Escで戻る）';
      }
      updateSourceEditorCount();
      if (on && !DOM.sourceText.classList.contains('hidden')) DOM.sourceText.focus();
    };
    // 【分類の前と後で入力欄の大きさを変える】利用者からの要望：分類前は記録の入力欄を広く、分類後はカードを広く。
    // カードが無いうちは入力欄を横いっぱいにし、分類してカードができたら入力欄を左の細い列に戻す。
    // 「広げる／狭める」で手動でも切り替えられる（患者を切り替える・分類し直すと自動に戻る）。
    // sourcePaneManual（null＝自動 / 'wide' / 'narrow'）は、起動の途中の描画からも使うので先頭の方で宣言している
    function updateSourcePaneLayout() {
      const view = DOM.viewSoBoard;
      if (!view || !view.classList) return;
      const hasCards = (getCurrentPatient().items || []).length > 0;
      const wide = sourcePaneManual ? sourcePaneManual === 'wide' : !hasCards;
      view.classList.toggle('input-wide', wide);
      view.classList.toggle('no-cards', !hasCards);
      const btn = document.getElementById('btn-source-wide');
      if (btn) {
        btn.innerHTML = wide ? '<i class="fa-solid fa-down-left-and-up-right-to-center"></i><span>狭める</span>' : '<i class="fa-solid fa-left-right"></i><span>広げる</span>';
        btn.classList.toggle('hidden', !hasCards);
      }
    }
    function resetSourcePaneLayout() { sourcePaneManual = null; updateSourcePaneLayout(); }
    window.toggleSourcePaneWidth = function() {
      sourcePaneManual = DOM.viewSoBoard.classList.contains('input-wide') ? 'narrow' : 'wide';
      updateSourcePaneLayout();
    };
    // 【AIの結果は「要約＋詳細」】利用者からの指摘：検査値評価・矛盾チェック・診断候補・看護計画の結果が全部開くと、
    // 表まで遠くなる。各結果は1行の要約だけを出し、「詳細を開く」で読む。AIに頼んで結果が届いたときは、その結果を開く。
    const aiPanelOpen = new Set();
    function aiPanelSummaryText(body) {
      // 【要点】があれば、その1つ目を要約として出す
      const key = body && body.querySelector ? body.querySelector('.ai-key li') : null;
      if (key && key.textContent && key.textContent.trim()) {
        const k = key.textContent.replace(/\s+/g, ' ').replace(/〔[^〕]*〕/g, '').trim();
        return k.length > 70 ? `${k.slice(0, 70)}…` : k;
      }
      const text = String((body && body.textContent) || '').replace(/\s+/g, ' ').trim();
      if (!text) return '';
      const first = text.split(/(?<=。)|(?=・)|(?=■)/)[0] || text;
      return first.length > 70 ? `${first.slice(0, 70)}…` : first;
    }
    function refreshAiPanel(panel) {
      if (!panel || !panel.querySelector) return;
      const body = panel.querySelector('.ai-panel-body');
      const head = panel.querySelector('.ai-panel-head');
      const sum = panel.querySelector('.ai-panel-summary');
      const toggle = panel.querySelector('.ai-panel-toggle');
      const open = aiPanelOpen.has(panel.id);
      panel.classList.toggle('is-open', open);
      if (head) head.setAttribute('aria-expanded', String(open));
      if (sum) sum.textContent = open ? '' : aiPanelSummaryText(body);
      if (toggle) toggle.textContent = open ? '閉じる' : '詳細を開く';
    }
    window.toggleAiPanel = function(btn) {
      const panel = btn.closest('.ai-panel');
      if (!panel) return;
      if (aiPanelOpen.has(panel.id)) aiPanelOpen.delete(panel.id); else aiPanelOpen.add(panel.id);
      refreshAiPanel(panel);
    };
    (() => {
      if (typeof MutationObserver === 'undefined' || !document.querySelectorAll) return;
      document.querySelectorAll('.ai-panel').forEach(panel => {
        const body = panel.querySelector('.ai-panel-body');
        if (!body) return;
        new MutationObserver(() => {
          // 処理中の表示（くるくる）が出たら開く＝利用者が今頼んだ結果
          if (body.querySelector('.fa-spinner')) aiPanelOpen.add(panel.id);
          refreshAiPanel(panel);
        }).observe(body, { childList: true, subtree: true, characterData: true });
        refreshAiPanel(panel);
      });
    })();

    // 操作方法（画面の説明文を短くし、詳しい使い方はここにまとめる）
    window.openHelp = function(section = 'flow') {
      const modal = document.getElementById('modal-help');
      if (!modal) return;
      modal.querySelectorAll('[data-help]').forEach(b => b.classList.toggle('active', b.dataset.help === section));
      modal.querySelectorAll('[data-help-section]').forEach(s => s.classList.toggle('hidden', s.dataset.helpSection !== section));
      modal.classList.remove('hidden');
      const active = modal.querySelector(`[data-help="${section}"]`);
      if (active) active.focus();
    };
    window.closeHelp = function() { document.getElementById('modal-help')?.classList.add('hidden'); };

    window.classifyFromFullscreen = function() {
      toggleSourceFullscreen(false);
      document.getElementById('btn-start-classify').click();
    };
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.getElementById('source-editor')?.classList.contains('is-fullscreen')) toggleSourceFullscreen(false);
    });
    DOM.sourceText.addEventListener('input', updateSourceEditorCount);

    // 総合アセスメント表のS/Oバッジから、分類ボード側の同じカードへジャンプして一瞬ハイライトする
    window.jumpToBoardCard = function(itemId) {
      switchView('so');
      requestAnimationFrame(() => {
        const el = document.getElementById(itemId);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('card-flash');
        setTimeout(() => el.classList.remove('card-flash'), 1600);
      });
    };

    DOM.sourceText.addEventListener('input', () => saveDataAndSync());
    document.getElementById('btn-load-sample').addEventListener('click', () => { DOM.sourceText.value = SAMPLE_TEXT; saveDataAndSync(); });
