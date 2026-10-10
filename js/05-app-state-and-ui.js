// Patient-owned UI and learning state. Preserve Japanese display/export text.
// Confirmations and Undo verify the captured patient/target; local writes require full readback.
// AI transport accepts image OCR only; classification and clinical generation stay local.

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['05'] = '2026-10-10.znavigation17'; // Version stamp (scripts/stamp-version.js)
    // ==========================================================================

    // ==========================================================================
    const CARD_REPORT_SESSION_KEY = 'nursing_card_report_session_id';
    let cardReportSessionId = null;
    try { cardReportSessionId = sessionStorage.getItem(CARD_REPORT_SESSION_KEY); } catch (e) { /* noop */ }
    if (!cardReportSessionId) {
      cardReportSessionId = 'rpt_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      try { sessionStorage.setItem(CARD_REPORT_SESSION_KEY, cardReportSessionId); } catch (e) { /* noop */ }
    }

    const LEARNING_HISTORY_KEY = 'nursing_learning_history';
    const LEARNING_HISTORY_MAX = 300;
    let learningHistory = [];
    try { learningHistory = JSON.parse(localStorage.getItem(LEARNING_HISTORY_KEY) || '[]'); } catch (e) { learningHistory = []; }
    function addLearningHistoryEntry(text, action, payload) {
      learningHistory.push({ at: new Date().toISOString(), text, action, payload });
      if (learningHistory.length > LEARNING_HISTORY_MAX) learningHistory = learningHistory.slice(-LEARNING_HISTORY_MAX);
      try { localStorage.setItem(LEARNING_HISTORY_KEY, JSON.stringify(learningHistory)); } catch (e) { console.warn('Learning history save failed:', e); }
    }

    // action: 'create' | 'type' | 'tagAdd' | 'tagRemove' | 'col' | 'edit' | 'delete'
    async function reportLearningEvent(text, action, payload) {
      addLearningHistoryEntry(text, action, payload);
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
        console.warn('Shared learning send failed; offline learning remains local:', e);
      }
    }

    const PATIENTS_STORAGE_KEY = 'nursing_patients_data';
    function loadPersistedPatients() {
      try {
        const raw = localStorage.getItem(PATIENTS_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.patients) && parsed.patients.length) {

          const r = repairPatientsList(parsed.patients);
          if (!r.patients.length) return null;
          parsed.patients = r.patients;
          if (r.idMap[parsed.currentPatientId]) parsed.currentPatientId = r.idMap[parsed.currentPatientId];
          return parsed;
        }
      } catch (e) {
        console.warn('Stored patient load failed:', e);
      }
      return null;
    }
    const persistedPatients = loadPersistedPatients();

    const LEARNING_DICT_STORAGE_KEY = 'nursing_learning_dict';
    function loadPersistedLearningDict() {
      try {
        const raw = localStorage.getItem(LEARNING_DICT_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      } catch (e) {
        console.warn('Stored learning load failed:', e);
      }
      return null;
    }
    const persistedLearningDict = loadPersistedLearningDict();

    let globalAppData = {
      patients: persistedPatients?.patients || [
        { id: 'patient_1', title: '患者A', items: [], sourceText: '', labEvaluationResult: '', referenceNotes: [], archived: false, updatedAt: null, deletedItemIds: [] }
      ],
      currentPatientId: persistedPatients?.currentPatientId || 'patient_1',

      learningUserDict: persistedLearningDict || {},

      apiKey: normalizeApiKey(storageGet('gemini_api_key') || ''),
      notebookContent: DEFAULT_NOTEBOOK_CONTENT,

      additionalCriteria: [],

      customTagRules: [],

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

    const THEME_KEY = 'nursing_theme';
    function applyThemeIcon() {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const icon = document.querySelector('#btn-toggle-theme i');
      if (icon) icon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }

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

      if (e.target.closest('.hdr-menu-item') || !e.target.closest('.hdr-menu')) closeHeaderMenus();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeHeaderMenus(); });

    function topmostOpenModal() {
      const open = Array.from(document.querySelectorAll('.fixed.inset-0:not(.hidden)'));
      let best = null, bestZ = -Infinity;
      open.forEach(el => {
        let z = 0;
        try { z = parseInt((window.getComputedStyle ? window.getComputedStyle(el).zIndex : '') || '0', 10) || 0; } catch (err) { z = 0; }
        if (z >= bestZ) { best = el; bestZ = z; }
      });
      return best;
    }
    function closeModalByEscape(modal) {
      if (!modal || modal.id === 'modal-api-required') return false;
      const btn = modal.querySelector('#dialog-cancel, [id^="btn-close"], [id^="btn-cancel"], button[onclick^="close"]');
      if (btn && typeof btn.click === 'function') btn.click();
      if (!modal.classList.contains('hidden')) modal.classList.add('hidden');
      return true;
    }
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || e.isComposing) return;
      const modal = topmostOpenModal();
      if (!modal || modal.id === 'modal-api-required') return;
      e.preventDefault();
      e.stopPropagation();
      closeModalByEscape(modal);
    }, true);
    // Shared keyboard containment for all modal surfaces. Dedicated dialogs keep their own handlers.
    if (typeof MutationObserver !== 'undefined') {
      let trackedModal = null;
      let lastFocused = document.activeElement;
      const modalReturnTargets = new WeakMap();
      const modalFocusable = modal => Array.from(modal.querySelectorAll(
        'button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]'
      )).filter(el => el.getClientRects().length && !el.closest('[inert]'));
      const syncModalFocus = () => {
        const next = topmostOpenModal();
        if (next === trackedModal) return;
        const previous = trackedModal;
        trackedModal = next;
        if (previous) {
          const target = modalReturnTargets.get(previous);
          if (target && target.isConnected && target.getClientRects().length && (!next || next.contains(target))) target.focus();
        }
        if (next) {
          if (!modalReturnTargets.has(next) || !previous) modalReturnTargets.set(next, lastFocused);
          next.setAttribute('role', 'dialog');
          next.setAttribute('aria-modal', 'true');
          if (!next.hasAttribute('aria-label') && !next.hasAttribute('aria-labelledby')) {
            const title = next.querySelector('h1,h2,h3');
            next.setAttribute('aria-label', title?.textContent.trim() || '入力・確認');
          }
          if (!next.contains(document.activeElement)) (modalFocusable(next)[0] || next).focus();
        }
      };
      document.addEventListener('focusin', event => {
        const next = topmostOpenModal();
        if (next && next !== trackedModal) modalReturnTargets.set(next, lastFocused);
        syncModalFocus();
        lastFocused = event.target;
      });
      new MutationObserver(syncModalFocus).observe(document.body, {subtree:true, attributes:true, attributeFilter:['class']});
      document.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const modal = topmostOpenModal();
        if (!modal || modal.id === 'modal-dialog' || modal.id === 'modal-api-required') return;
        const focusable = modalFocusable(modal);
        if (!focusable.length) { event.preventDefault(); return; }
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (!modal.contains(document.activeElement) || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }, true);
    }

    function currentAppFont() { return document.documentElement.getAttribute('data-font') === 'gothic' ? 'gothic' : 'serif'; }
    function setAppFont(font) {
      document.documentElement.setAttribute('data-font', font === 'gothic' ? 'gothic' : 'serif');
      try { localStorage.setItem('nursing_font', font === 'gothic' ? 'gothic' : 'serif'); } catch (e) {   }
      const label = document.getElementById('font-current-label');
      if (label) label.textContent = font === 'gothic' ? 'ゴシック' : '明朝';
    }
    window.toggleAppFont = function() { setAppFont(currentAppFont() === 'gothic' ? 'serif' : 'gothic'); };
    setAppFont(currentAppFont());
    document.getElementById('btn-toggle-theme').addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {   }
      applyThemeIcon();
    });
    applyThemeIcon();

    function getCurrentPatient() {
      let p = globalAppData.patients.find(x => x.id === globalAppData.currentPatientId);
      if (!p) { p = globalAppData.patients.find(x => !x.archived) || globalAppData.patients[0]; globalAppData.currentPatientId = p.id; }
      if (!p.referenceNotes) p.referenceNotes = [];
      if (p.archived === undefined) p.archived = false;
      return p;
    }

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

    let lastLocalSaveOk = true;
    let sourcePaneManual = null;
    let lastSharedSaveAt = null;
    function writeLocalVerified(key, value) {
      try {
        localStorage.setItem(key, value);
        const back = localStorage.getItem(key);
        return typeof back === 'string' && back === value;
      } catch (e) {
        console.warn('Browser save failed; storage may be full:', e);
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

    function showAiErrorToast(prefix, err) {
      const reason = err && err.message ? err.message : '理由は分かりませんでした';
      console.warn(prefix, err);
      showToast([prefix, { text: reason, detail: true }], 'error', 9000);
    }

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

        const key = body.textContent;
        Array.from(DOM.toastContainer.children || []).forEach(t => { if (t.dataset && t.dataset.key === key) t.remove(); });
        if (toast.dataset) toast.dataset.key = key;
      }
      DOM.toastContainer.appendChild(toast);

      const transient = Array.from(DOM.toastContainer.children || []).filter(t => t.classList && !t.classList.contains('toast-error'));
      if (transient.length > 3) transient.slice(0, transient.length - 3).forEach(t => t.remove());
      if (!sticky) setTimeout(dismiss, duration);
    }

    function markPatientChanged(patientId) {
      const p = globalAppData.patients.find(x => x.id === patientId);
      if (!p) return;
      p.updatedAt = new Date().toISOString();
      if (typeof schedulePatientSync === 'function') schedulePatientSync(patientId);
    }
    function showUndoToast(message, undoFn, options = {}) {
      const owner = options.patientId ? globalAppData.patients.find(p => p.id === options.patientId) : null;
      const expectedOwner = owner ? JSON.stringify({ ...owner, updatedAt: undefined }) : null;
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
      let dismissed = false, attempted = false;
      const dismiss = () => { if (dismissed) return; dismissed = true; toast.classList.replace('toast-enter', 'toast-exit'); setTimeout(() => toast.remove(), 300); };
      undoBtn.addEventListener('click', () => {
        if (attempted) return;
        attempted = true;
        if (options.patientId && (!owner || globalAppData.patients.find(p => p.id === options.patientId) !== owner || JSON.stringify({ ...owner, updatedAt: undefined }) !== expectedOwner)) {
          dismiss(); showToast('後から追加された変更を保護するため、元に戻していません', 'warn'); return;
        }
        if (undoFn() === false) { dismiss(); showToast('元に戻せませんでした。現在の内容を確認してください', 'warn'); return; }
        if (options && options.patientId) markPatientChanged(options.patientId);
        saveDataAndSync();
        dismiss();
        showToast('元に戻しました', 'info');
      });
      DOM.toastContainer.appendChild(toast);
      setTimeout(dismiss, 6000);
    }

    const dialogEl = document.getElementById('modal-dialog');
    const dialogTitleEl = document.getElementById('dialog-title');
    const dialogMessageEl = document.getElementById('dialog-message');
    const dialogInputEl = document.getElementById('dialog-input');
    const dialogCancelBtn = document.getElementById('dialog-cancel');
    const dialogConfirmBtn = document.getElementById('dialog-confirm');

    const dialogSecondaryBtn = document.getElementById('dialog-secondary');
    let dialogResolve = null;
    let dialogReturnFocus = null;

    function openDialog({ title, message = '', inputValue, placeholder = '', confirmLabel = 'OK', danger = false, secondaryLabel = null }) {
      if (dialogResolve) { const pending = dialogResolve; dialogResolve = null; pending(null); }
      else dialogReturnFocus = document.activeElement || null;
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
        else if (typeof dialogConfirmBtn.focus === 'function') dialogConfirmBtn.focus();
      });
    }
    function closeDialog(result) {
      dialogEl.classList.add('hidden');
      if (dialogResolve) { const r = dialogResolve; dialogResolve = null; r(result); }
      const back = dialogReturnFocus;
      dialogReturnFocus = null;
      if (back && back.isConnected && typeof back.focus === 'function' && dialogEl.classList.contains('hidden')) {
        try { back.focus(); } catch (e) {   }
      }
    }
    dialogCancelBtn.addEventListener('click', () => closeDialog(null));
    if (dialogSecondaryBtn) dialogSecondaryBtn.addEventListener('click', () => closeDialog('secondary'));
    dialogConfirmBtn.addEventListener('click', () => closeDialog(dialogInputEl.classList.contains('hidden') ? true : dialogInputEl.value.trim()));
    dialogInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); dialogConfirmBtn.click(); } });
    dialogEl.addEventListener('click', e => { if (e.target === dialogEl) closeDialog(null); });
    dialogEl.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); closeDialog(null); return; }
      if (e.key !== 'Tab') return;
      const focusable = Array.from(dialogEl.querySelectorAll('button, input')).filter(el=>!el.disabled && !el.classList.contains('hidden'));
      if (!focusable.length) return;
      const first=focusable[0], last=focusable[focusable.length-1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }

    function jsArg(v) {
      return escapeHtml(JSON.stringify(v == null ? '' : String(v)));
    }

    function isSafeRecordId(id) { return typeof id === 'string' && /^[\w.:-]{1,120}$/.test(id); }

    function repairPatientsList(patients) {
      const idMap = {};
      let fixed = 0;
      const seen = new Set();
      const list = (Array.isArray(patients) ? patients : []).filter(p => p && typeof p === 'object').filter(p => {
        if (!isSafeRecordId(p.id)) {
          const nid = repairedRecordId('patient', p.id);
          if (typeof p.id === 'string') idMap[p.id] = nid;
          p.id = nid;
          fixed++;
        }
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        fixed += repairPatientRecordIds(p);
        return true;
      });
      return { patients: list, idMap, fixed };
    }
    function repairedRecordId(prefix, badId) {
      const s = String(badId == null ? '' : badId);
      let h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
      return `${prefix}_fix_${h.toString(36)}_${s.length.toString(36)}`;
    }

    function repairPatientRecordIds(p) {
      if (!p || typeof p !== 'object') return 0;
      let fixed = 0;
      const now = new Date().toISOString();
      if (Array.isArray(p.items)) {
        const seen = new Set();
        p.items = p.items.filter(i => i && typeof i === 'object').filter(i => {
          if (!isSafeRecordId(i.id)) {
            const bad = i.id;
            i.id = repairedRecordId('item', bad);
            fixed++;
            if (typeof bad === 'string' && bad) {
              if (!Array.isArray(p.deletedItemIds)) p.deletedItemIds = [];
              if (!p.deletedItemIds.some(t => t && t.id === bad)) p.deletedItemIds.push({ id: bad, at: now });
            }
            if (!i._touchedAt) i._touchedAt = now;
          }
          if (seen.has(i.id)) return false;
          seen.add(i.id);
          return true;
        });
      }
      if (Array.isArray(p.referenceNotes)) {
        p.referenceNotes = p.referenceNotes.filter(n => n && typeof n === 'object');
        p.referenceNotes.forEach(n => { if (!isSafeRecordId(n.id)) { n.id = repairedRecordId('ref', n.id); fixed++; } });
      }
      return fixed;
    }

    function sanitizeStoredHtml(html) {
      if (html == null || html === '') return '';
      const src = String(html);
      const DROP_TAGS = ['script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'link', 'meta', 'base', 'form', 'input', 'button', 'textarea', 'select', 'option', 'svg', 'math', 'template', 'noscript', 'applet', 'audio', 'video', 'source', 'track', 'img', 'picture'];
      const URL_ATTRS = ['href', 'src', 'xlink:href', 'action', 'formaction', 'srcset', 'poster', 'background', 'data', 'ping', 'cite'];
      const EVIDENCE_ONCLICK = /^\s*jumpToEvidenceCard\(\s*(['"])([\w.:-]{1,120})\1\s*\)\s*;?\s*$/;
      if (typeof DOMParser === 'undefined') {

        const text = src.replace(/<(script|style)[\s\S]*?<\/\1\s*>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
        return escapeHtml(text).replace(/\n/g, '<br>');
      }
      let doc;
      try { doc = new DOMParser().parseFromString(`<!DOCTYPE html><html><body>${src}</body></html>`, 'text/html'); } catch (e) { return escapeHtml(src); }
      const body = doc && doc.body;
      if (!body) return escapeHtml(src);
      body.querySelectorAll(DROP_TAGS.join(',')).forEach(el => el.remove());
      body.querySelectorAll('*').forEach(el => {
        Array.from(el.attributes).forEach(attr => {
          const name = attr.name.toLowerCase();
          if (name.startsWith('on')) {
            const m = name === 'onclick' ? attr.value.match(EVIDENCE_ONCLICK) : null;
            if (m) el.setAttribute('data-evidence-id', m[2]);
            el.removeAttribute(attr.name);
            return;
          }
          if (name === 'style' || name === 'srcdoc') { el.removeAttribute(attr.name); return; }
          if (URL_ATTRS.includes(name)) {
            const v = String(attr.value || '').replace(/[\u0000- \u007f-\u009f]+/g, '').toLowerCase();
            if (/^(?:javascript|data|vbscript):/.test(v)) el.removeAttribute(attr.name);
          }
        });
      });
      return body.innerHTML;
    }

    if (typeof document !== 'undefined' && document.addEventListener) {
      const openEvidenceChip = el => { if (typeof window.jumpToEvidenceCard === 'function') window.jumpToEvidenceCard(el.getAttribute('data-evidence-id')); };
      document.addEventListener('click', e => {
        const chip = e.target && e.target.closest ? e.target.closest('[data-evidence-id]') : null;
        if (chip && !chip.hasAttribute('onclick')) openEvidenceChip(chip);
      });
      document.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const chip = e.target && e.target.closest ? e.target.closest('[data-evidence-id]') : null;
        if (chip && !chip.hasAttribute('onclick')) { e.preventDefault(); openEvidenceChip(chip); }
      });
    }

    // ==========================================================================

    // ------------------------------------------------------------------------

    // ==========================================================================
    const MASK_TERMS_STORAGE_KEY = 'nursing_ai_mask_terms';
    function loadUserMaskTerms() {
      try {
        return (localStorage.getItem(MASK_TERMS_STORAGE_KEY) || '').split(/\r?\n/)
          .map(s => s.normalize('NFKC').trim()).filter(s => s.length >= 2).slice(0, 300);
      } catch (e) { return []; }
    }
    const MASK_LABEL_REGEX = /((?:学生|患者|本人|家族|担当(?:教員|指導者|看護師|医)?|指導者|教員|キーパーソン)?(?:氏名|名前|姓名)|学籍番号|学生番号|学籍|患者ID|カルテ番号|診察券番号|(?:実習)?(?:病院名|施設名)|実習病院|実習施設|現?住所|電話番号|電話|TEL|携帯(?:番号)?|メールアドレス|メール|生年月日)(\s*[:：]\s*)((?:(?!\s+(?:学生|患者)?(?:氏名|名前|学籍番号|学生番号|電話番号|電話|住所|生年月日|実習病院|実習施設)\s*[:：])[^\n、。,，(（]){1,40})/gi;

    const MASK_ALREADY_ANONYMOUS_REGEX = /^(?:[A-Za-zＡ-Ｚａ-ｚ]{1,2}\s*(?:氏|さん|様)?|なし|無し|不明|記載なし|-|ー|―)$/;
    const MASK_PATTERN_REGEXES = [
      /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
      /〒\s?\d{3}-?\d{4}/g,
      /(?<![\d.])0\d{1,4}-\d{1,4}-\d{3,4}(?![\d.])/g,
      /(?<![\d.])0[5789]0\d{8}(?![\d.])/g,
      /(?<![\d.])\d{7,}(?![\d.])/g
    ];
    const MASK_FACILITY_REGEX = /([一-龠々ァ-ヶーA-Za-z]{1,15})(大学(?:医学部)?附属病院|医療センター|クリニック|診療所|病院|医院)/g;

    const MASK_GENERIC_FACILITY_PREFIXES = new Set(['総合', '大学', '市民', '県立', '市立', '町立', '村立', '国立', '公立', '私立', '急性期', '回復期', '療養型', '療養', '精神科', '一般', '転院先', '転院', '前', '当', '同', '他', '近隣', '地域', '地元', 'かかりつけ', '専門', 'リハビリ', 'リハビリテーション', '整形外科', '内科', '外科', '歯科', '眼科', '皮膚科', '耳鼻科', '耳鼻咽喉科', '産婦人科', '婦人科', '小児科', '脳外科', '脳神経外科', '循環器', '消化器', '在宅', '訪問']);

    const MASK_HONORIFIC_NAME_REGEX = /([一-龠々]{1,4}|[ァ-ヶー]{2,10})(さん|先生|医師|看護師|氏(?!名))/g;

    const MASK_ROLE_WORDS = ['患者', '息子', '娘', '奥', '旦那', '孫', '嫁', '婿', '妻', '夫', '兄', '姉', '弟', '妹', '母', '父', '祖母', '祖父', '叔父', '叔母', '伯父', '伯母', '家族', '本人', '友人', '隣人', '同室者', '同室', '担当', '主治', '主治医', '受持', '受け持ち', '看護', '看護師', '師長', '主任', '部長', '院長', '医', '研修医', '担当医', '皆', '各位', '先輩', '後輩', '学生', '実習生', '指導者', '教員', '薬剤師', '栄養士', '技師', '保健師', '助産師', '介護士', '職員', '親戚', '親族', '義母', '義父', '長男', '次男', '三男', '長女', '次女', '三女', '訪問', '病棟', '外来', '専任', '認定', '専門', '夜勤', '日勤', '准', '同', '当', '本', '両', '彼', '某', '故',
      'ヘルパー', 'ケアマネ', 'ケアマネージャー', 'ケアマネジャー', 'ソーシャルワーカー', 'ワーカー', 'スタッフ', 'セラピスト', 'ナース', 'ドクター', 'リハビリ', 'ボランティア', '退院支援', '支援', '緩和ケア', '認定看護', '専門看護', '感染管理', '病棟担当'];
    function isRoleWord(word) { return MASK_ROLE_WORDS.some(r => word.endsWith(r)); }

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

        const firstToken = v.trim().split(/\s+/)[0];

        if (/^[*＊×✕xX〇○●■□\-－]+$/.test(firstToken)) return m;
        if (!v.trim() || MASK_ALREADY_ANONYMOUS_REGEX.test(v.trim()) || MASK_ALREADY_ANONYMOUS_REGEX.test(firstToken) || v.includes('〈伏せ字')) return m;
        return label + sep + maskToken(ctx, v) + value.slice(v.length);
      });
      MASK_PATTERN_REGEXES.forEach(re => { out = out.replace(re, m => maskToken(ctx, m)); });

      out = out.replace(MASK_FACILITY_REGEX, (m, name) => (MASK_GENERIC_FACILITY_PREFIXES.has(name) || isRoleWord(name) || /^[A-Za-z]{1,2}$/.test(name)) ? m : maskToken(ctx, m));
      out = out.replace(MASK_HONORIFIC_NAME_REGEX, (m, name) => isRoleWord(name) ? m : maskToken(ctx, name) + m.slice(name.length));
      return out;
    }
    function restoreMaskedText(text, ctx) {
      if (typeof text !== 'string' || !ctx || ctx.originals.length === 0) return text;
      return text.replace(/〈\s*伏せ字\s*(\d+)\s*〉/g, (m, n) => ctx.originals[Number(n) - 1] ?? m);
    }

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

    let imageSendConfirmed = false;

    const AI_PENDING_KEY = 'nursing_ai_pending';
    const AI_PENDING_STALE_MS = 3 * 60 * 1000;
    let aiRequestsRunning = 0;
    function readAiPending() {
      try { const v = JSON.parse(localStorage.getItem(AI_PENDING_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
    }
    function writeAiPending(list) {
      try { if (list.length) localStorage.setItem(AI_PENDING_KEY, JSON.stringify(list.slice(-20))); else localStorage.removeItem(AI_PENDING_KEY); } catch (e) {   }
    }
    function notifyLostAiRequests(now = Date.now()) {
      const list = readAiPending();
      const lost = list.filter(p => now - new Date(p.at).getTime() > AI_PENDING_STALE_MS);
      if (!lost.length) return 0;
      writeAiPending(list.filter(p => !lost.includes(p)));
      const last = lost[lost.length - 1];
      const d = new Date(last.at);
      const when = isNaN(d) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const who = Array.from(new Set(lost.map(p => p.patient).filter(Boolean))).map(t => `「${t}」`).join('・');
      showToast([`前回${when ? `（${when}）` : ''}AIの処理の途中でページを閉じたため、結果は届いていません`, { text: `${who ? `${who}で` : ''}実行していたAIの処理 ${lost.length}件。必要なら、もう一度AIのボタンを押してください。`, detail: true }], 'warn', 9000);
      return lost.length;
    }

    function requireApiKey(featureName, { fallbackLabel = '' } = {}) {
      if (globalAppData.apiKey) return Promise.resolve('ok');
      const modal = document.getElementById('modal-api-required');
      if (!modal || !modal.querySelector) {
        showToast(`「${featureName}」はAIを使います。右上の「︙」→「API設定」でGemini APIキーを設定してください`, 'warn');
        return Promise.resolve(false);
      }
      document.getElementById('api-required-feature').textContent = `「${featureName}」はAI（Gemini）を使います。まだAPIキーが設定されていません。次の手順で設定してください。`;
      const fb = document.getElementById('api-required-fallback');
      fb.textContent = fallbackLabel;
      fb.classList.toggle('hidden', !fallbackLabel);
      modal.classList.remove('hidden');
      modal.querySelector('[data-api-req="settings"]').focus();
      return new Promise(resolve => {
        const done = (value, openSettings) => {
          modal.classList.add('hidden');
          modal.removeEventListener('click', onClick);
          document.removeEventListener('keydown', onKey, true);
          if (openSettings) document.getElementById('btn-open-settings')?.click();
          resolve(value);
        };
        const onClick = e => {
          const b = e.target.closest('[data-api-req]');
          if (e.target === modal) return done(false);
          if (!b) return;
          if (b.dataset.apiReq === 'settings') done(false, true);
          else if (b.dataset.apiReq === 'fallback') done('fallback');
          else done(false);
        };
        const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
        modal.addEventListener('click', onClick);
        document.addEventListener('keydown', onKey, true);
      });
    }
    window.requireApiKey = requireApiKey;
    async function callGeminiAI(contents, options = {}) {
      const pendingId = 'ai_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      let patientTitle = '';
      try { patientTitle = getCurrentPatient().title || ''; } catch (e) {   }
      writeAiPending(readAiPending().concat([{ id: pendingId, at: new Date().toISOString(), patient: patientTitle }]));
      aiRequestsRunning++;
      try {
        return await callGeminiAIOnce(contents, options);
      } finally {
        aiRequestsRunning = Math.max(0, aiRequestsRunning - 1);
        writeAiPending(readAiPending().filter(p => p.id !== pendingId));
      }
    }
    async function callGeminiAIOnce(contents, options = {}) {

      const hasImage = Array.isArray(contents) && contents.some(c => (c.parts || []).some(p => p.inline_data || p.file_data));
      if (!hasImage || options.ocr !== true) throw new Error('AI機能は画像の文字認識（OCR）のみに限定されています。分類・評価・計画にはAIを使用しません。');

      const textParts = contents.flatMap(c => c.parts || []).filter(p => typeof p.text === 'string').map(p => p.text.trim());

      const OCR_ALLOWED_INSTRUCTIONS = new Set([
        'Transcribe all nursing reference text in the image verbatim, in its original language. Return text only.',
        'Transcribe all clinical notes and laboratory results in the image verbatim, in their original language. Return text only.'
      ]);
      const hasOnlyOcrInstructions = textParts.length === 1 && OCR_ALLOWED_INSTRUCTIONS.has(textParts[0]);
      if (!hasOnlyOcrInstructions) throw new Error('OCR以外のAIへの依頼は許可されていません。');

      const parts = contents.flatMap(c => c.parts || []);
      const images = parts.filter(p => p.inline_data || p.file_data);
      if (contents.length !== 1 || parts.length !== 2 || images.length !== 1 || textParts.length !== 1) {
        throw new Error('OCRの入力形式が不正です。画像1枚と文字起こし指示だけを送信してください。');
      }
      const imagePart = images[0].inline_data || images[0].file_data;
      if (!/^image\/(?:jpeg|png|webp|gif)$/i.test(String(imagePart.mime_type || ''))) {
        throw new Error('OCRで対応していない画像形式です。JPEG・PNG・WebP・GIFを使用してください。');
      }
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
      const text = extractGeminiText(data);

      if (!String(text || '').trim()) throw new Error('AIの答えが空でした。少し待ってから、もう一度試してください（前の結果はそのまま残しています）。');

      const finish = data?.candidates?.[0]?.finishReason;
      let out = restoreMaskedText(text, ctx);
      if (finish === 'MAX_TOKENS') {
        if (options.json) { if (!options.quietTruncation) showToast('AIの答えが長すぎて途中で切れていました。読み取れた所までを使っています', 'warn', 6000); }
        else out += '\n\n※AIの答えが長すぎて、ここで途中で切れています。必要なら、もう一度実行してください。';
      }
      return out;
    }

    function removeJsonTrailingCommas(s) {
      let out = '', inStr = false, esc = false;
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (inStr) { out += c; if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
        if (c === '"') { inStr = true; out += c; continue; }
        if (c === ',') { const rest = s.slice(i + 1).match(/^\s*([\]}])/); if (rest) continue; }
        out += c;
      }
      return out;
    }
    function parseAiJsonLooseInfo(text) {
      const raw = String(text || '').replace(/```(?:json)?/gi, '').trim();
      const tryParse = s => { try { return JSON.parse(s); } catch (e) { try { return JSON.parse(removeJsonTrailingCommas(s)); } catch (e2) { return undefined; } } };
      let v = tryParse(raw);
      if (v !== undefined && v !== null && typeof v === 'object') return { value: v, truncated: false };
      for (let i = 0; i < raw.length; i++) {
        if (raw[i] !== '[' && raw[i] !== '{') continue;

        const stack = []; let inStr = false, esc = false, end = -1, lastCut = -1, lastStack = null;
        for (let j = i; j < raw.length; j++) {
          const c = raw[j];
          if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
          if (c === '"') inStr = true;
          else if (c === '[' || c === '{') stack.push(c);
          else if (c === ']' || c === '}') {
            stack.pop();
            if (!stack.length) { end = j; break; }
            lastCut = j + 1; lastStack = stack.slice();
          }
        }
        if (end >= 0) {
          v = tryParse(raw.slice(i, end + 1));
          if (v !== undefined && v !== null && typeof v === 'object') return { value: v, truncated: false };
          continue;
        }
        if (lastCut > 0) {
          const close = lastStack.slice().reverse().map(c => (c === '[' ? ']' : '}')).join('');
          v = tryParse(raw.slice(i, lastCut) + close);
          if (v !== undefined && v !== null && typeof v === 'object') return { value: v, truncated: true };
        }
        break;
      }
      return { value: undefined, truncated: false };
    }
    function parseAiJsonLoose(text) { return parseAiJsonLooseInfo(text).value; }

    const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
    const GEMINI_DEFAULT_MODEL = 'gemini-flash-latest';

    const GEMINI_FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'];
    const GEMINI_ENDPOINTS = {

      studio: (key, model = GEMINI_DEFAULT_MODEL) => ({ url: `${GEMINI_API_BASE}/models/${model}:generateContent`, headers: { 'x-goog-api-key': key } }),

      vertex: (key, model = GEMINI_FALLBACK_MODELS[GEMINI_FALLBACK_MODELS.length - 1]) => ({ url: `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${encodeURIComponent(key)}`, headers: {} })
    };
    function storageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function storageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {   } }
    function currentGeminiModel() { return storageGet('gemini_model') || GEMINI_DEFAULT_MODEL; }

    function normalizeApiKey(raw) {
      let k = String(raw || '').replace(/[\s　​﻿]+/g, '');
      k = k.replace(/^(?:GEMINI_API_KEY|GOOGLE_API_KEY|API_KEY|key)[=:]/i, '');
      k = k.replace(/^["'“”‘’「『]+|["'“”‘’」』]+$/g, '');
      return k;
    }

    function detectApiKeyKind(key) {
      const k = normalizeApiKey(key);
      if (!k) return { kind: 'empty', label: '未入力' };
      if (/^AIza[0-9A-Za-z_\-]{30,}$/.test(k)) return { kind: 'studio', label: 'Google AI Studio のキー（以前の形式 AIza…）' };
      if (/^AQ\.[0-9A-Za-z_\-.]{20,}$/.test(k)) return { kind: 'studio_aq', label: 'Google AI Studio のキー（新しい形式 AQ.…）' };
      if (/^ya29\./.test(k)) return { kind: 'oauth', label: '一時的なアクセストークン（ya29.…）※APIキーではありません' };
      return { kind: 'unknown', label: '見慣れない形式のキー' };
    }

    function geminiEndpointOrder(key) {
      const kind = detectApiKeyKind(key).kind;
      let order = kind === 'studio' ? ['studio'] : ['studio', 'vertex'];
      const saved = storageGet('gemini_api_endpoint');
      if (saved && order.includes(saved)) order = [saved, ...order.filter(x => x !== saved)];
      return order;
    }

    function isGeminiModelProblem(status, apiMessage) {
      const m = String(apiMessage || '');
      if (/ACCESS_TOKEN_TYPE_UNSUPPORTED|is not found for API version|models\/[\w.\-]+ is not found|not supported for generateContent|no longer (?:available|supported)|deprecated|has been (?:retired|shut ?down|discontinued)/i.test(m)) return true;
      return status === 404;
    }

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

    function isEndpointMismatch(status, apiMessage) {
      if (status === 404) return true;
      if (status === 400 || status === 401 || status === 403) {
        return /API key not valid|API_KEY_INVALID|invalid api key|UNAUTHENTICATED|ACCESS_TOKEN_TYPE_UNSUPPORTED|not been used|SERVICE_DISABLED|has not been enabled|express mode|API keys are not supported|CREDENTIALS_MISSING/i.test(String(apiMessage || '')) || status === 401;
      }
      return false;
    }

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

    const GEMINI_BUSY_ALTERNATIVES = ['gemini-flash-lite-latest'];
    function isGeminiTransientError(status) { return status === 429 || status === 500 || status === 502 || status === 503 || status === 504; }
    function isGeminiDailyQuota(apiMessage) { return /per ?day|PerDay|daily/i.test(String(apiMessage || '')); }
    function geminiRetryDelaysMs() { return Array.isArray(window.__geminiRetryDelaysMs) ? window.__geminiRetryDelaysMs : [2000, 5000]; }
    const geminiSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    async function geminiBusyAlternatives(key, tried) {
      const list = await fetchGeminiModelList(key);
      const names = (list || []).filter(m => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
        .map(m => String(m.name || '').replace(/^models\//, ''));
      const version = n => (n.match(/gemini-(\d+(?:\.\d+)?)/) || [0, '0'])[1].split('.').map(Number);
      const newerFirst = (a, b) => { const va = version(a), vb = version(b); return (vb[0] - va[0]) || ((vb[1] || 0) - (va[1] || 0)); };

      const lite = names.filter(n => /^gemini-\d+(?:\.\d+)?-flash-lite$/.test(n)).sort(newerFirst);
      const flash = names.filter(n => /^gemini-\d+(?:\.\d+)?-flash$/.test(n)).sort(newerFirst);
      const olderFlash = flash.slice(1);
      return [...lite, ...olderFlash, ...GEMINI_BUSY_ALTERNATIVES, ...flash.slice(0, 1), ...GEMINI_FALLBACK_MODELS.slice(1)]
        .filter((m, i, a) => a.indexOf(m) === i && !tried.has(m));
    }

    const GEMINI_BUSY_MODEL_KEY = 'gemini_busy_model';
    const GEMINI_BUSY_MODEL_TTL_MS = 30 * 60 * 1000;
    function recentBusyModel() {
      try {
        const v = JSON.parse(storageGet(GEMINI_BUSY_MODEL_KEY) || 'null');
        return v && v.model && Date.now() - v.at < GEMINI_BUSY_MODEL_TTL_MS ? v.model : null;
      } catch (e) { return null; }
    }

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

        const reasons = (Array.isArray(e.details) ? e.details : []).map(d => d && d.reason).filter(r => r && !apiMessage.includes(r));
        if (reasons.length) apiMessage += ` [${reasons.join(', ')}]`;
      } catch (e) { apiMessage = ''; }
      return { ok: false, status: res.status, apiMessage, model };
    }

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

        if (model === recentBusyModel()) { try { localStorage.removeItem(GEMINI_BUSY_MODEL_KEY); } catch (e) {   } }
        last = r;

        if (isGeminiTransientError(r.status)) {
          if (ep !== 'studio') return r;
          if (!busyFallback) { busyFallback = true; queue = await geminiBusyAlternatives(key, tried); }
          continue;
        }
        if (!isGeminiModelProblem(r.status, r.apiMessage)) return r;

        if (ep === 'studio' && !discovered) {
          discovered = true;
          const best = await discoverGeminiModel(key);
          if (best) queue.unshift(best);
        }
        if (!queue.length) queue = GEMINI_FALLBACK_MODELS.filter(m => !tried.has(m));
      }
      return last;
    }

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

          if (ep === 'studio' && !r.viaBusyFallback) storageSet('gemini_model', r.model);
          return r.data;
        }
        const err = new Error(describeGeminiError(r.status, r.apiMessage, kind, r.model));
        err.status = r.status; err.endpoint = ep; err.apiMessage = r.apiMessage;

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

    function cleanAiText(text) {
      let s = String(text || '').replace(/\r/g, '');

      s = s.replace(/((?:[ \t]*[〔【\[]\s*C\s*\d{1,4}(?:\s*[、,，・\/]?\s*C?\s*\d{1,4})*\s*[〕】\]])+)[ \t]*([。、．，])/g, '$2$1');

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

    const AI_ACCURACY_RULES = '【正確さの決まり】記録に書かれていない事実（手術・使っている薬・既往など）を前提にしないでください。数値の程度を誇張しないでください（「著明」「重度」は基準値を大きく外れるときだけ使い、基準値内の値を「低下」「異常」と書かないでください）。アセスメントに必要なのに記録に無い値（例：肺炎なら呼吸数・意識・血糖など）は「記録がない」と書いてください。医学用語・看護技術の名前は教科書で使われる正確なものだけを使い、確かでない言葉は使わないでください。薬の量や治療を変える提案はしないでください。根拠のカードの番号は、その文に直接関係するカードだけに付け、同じカードを繰り返し付けないでください。';
    const AI_STYLE_INSTRUCTION = '【書き方】前置き・あいさつ・「〜の視点から」「〜をまとめました」のような説明は書かず、すぐ本題から書いてください。最初に「### 要点」の見出しを置き、結論を2〜3個の短い箇条書き（1つ40字程度まで）で示してください。そのあと詳細を「### 見出し」と「- 」の箇条書きで書き、1つの箇条書きは1〜2文にしてください。根拠のカードの番号は、文の終わりの句点の後ろにまとめて付けてください。' + AI_ACCURACY_RULES;

    function persistData() {
      const cp = getCurrentPatient();
      cp.sourceText = DOM.sourceText.value;
      cp.updatedAt = new Date().toISOString();

      const wasOk = lastLocalSaveOk;
      lastLocalSaveOk = writeLocalVerified(PATIENTS_STORAGE_KEY, JSON.stringify({ patients: globalAppData.patients, currentPatientId: globalAppData.currentPatientId }));
      if (!lastLocalSaveOk && wasOk) showToast(['このブラウザにカルテを保存できませんでした', { text: '保存容量が足りない可能性があります。「︙」→「データをファイルに保存」でバックアップを取り、使っていないカルテをアーカイブ・削除してください。', detail: true }], 'error');
      try {
        localStorage.setItem(LEARNING_DICT_STORAGE_KEY, JSON.stringify(globalAppData.learningUserDict));
      } catch (e) {
        console.warn('Local learning save failed; storage may be full:', e);
      }

      schedulePatientSync(cp.id);

      updateSaveStatus('saving');
      updateCurrentPatientMeta();
    }

    function savePatientsLocally() {
      lastLocalSaveOk = writeLocalVerified(PATIENTS_STORAGE_KEY, JSON.stringify({ patients: globalAppData.patients, currentPatientId: globalAppData.currentPatientId }));
      return lastLocalSaveOk;
    }
    function changeCurrentPatient(nextId, { saveCurrent = true } = {}) {
      window.clearCarePlanEvidenceNavigation?.();

      cancelSourceTextSave();
      const currentExists = globalAppData.patients.some(p => p.id === globalAppData.currentPatientId);
      if (saveCurrent && currentExists) persistData();
      globalAppData.currentPatientId = nextId;          // ②
      loadLocalState();
      savePatientsLocally();
      updateCurrentPatientMeta();
    }

    function saveDataAndSync() {
      persistData();
      renderSoBoard();
      renderAssessmentTable();
      renderReferenceList();
    }

    function touchItem(item) {
      if (item) item._touchedAt = new Date().toISOString();
    }

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

    const ITEM_TOMBSTONE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
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

    const PATIENT_KEYED_RECORD_FIELDS = ['myAssessments', 'missingChecks', 'untaggedReviews', 'carePlans', 'checkpoints'];
    function fillMissingFieldsClient(primary, secondary) {

      const isMap = v => v && typeof v === 'object' && !Array.isArray(v);
      const isEmpty = v => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
      if (!isMap(primary) || !isMap(secondary)) return primary;
      const out = { ...primary };
      Object.keys(secondary).forEach(k => {
        if (k === 'id' || k === 'updatedAt' || k === '_touchedAt' || k === 'deleted') return;
        if (isEmpty(out[k])) { if (!isEmpty(secondary[k])) out[k] = secondary[k]; }
        else if (isMap(out[k]) && isMap(secondary[k])) out[k] = fillMissingFieldsClient(out[k], secondary[k]);
      });
      return out;
    }
    function mergeKeyedRecordsClient(a, b) {
      const isMap = v => v && typeof v === 'object' && !Array.isArray(v);
      const time = r => { const t = r && typeof r.updatedAt === 'string' ? new Date(r.updatedAt).getTime() : NaN; return Number.isNaN(t) ? 0 : t; };
      if (!isMap(a)) return isMap(b) ? b : a;
      if (!isMap(b)) return a;
      const out = { ...a };
      Object.keys(b).forEach(k => {
        if (!(k in out)) out[k] = b[k];
        else if (SERVER_IS_PRIMARY || time(b[k]) > time(out[k])) out[k] = fillMissingFieldsClient(b[k], out[k]);
        else out[k] = fillMissingFieldsClient(out[k], b[k]);
      });
      return out;
    }
    function mergeKeyedPatientFieldsClient(first, second) {
      const out = {};
      PATIENT_KEYED_RECORD_FIELDS.forEach(f => {
        if ((first && f in first) || (second && f in second)) out[f] = mergeKeyedRecordsClient(first && first[f], second && second[f]);
      });
      return out;
    }

    const PAGES_FIRST_SYNC_KEY = 'pagesFirstSyncDone';
    const SERVER_IS_PRIMARY = (() => {
      if (typeof location === 'undefined' || !/\.github\.io$/i.test(location.hostname || '')) return false;
      try { return !localStorage.getItem(PAGES_FIRST_SYNC_KEY); } catch (e) { return false; }
    })();
    const CASE_DERIVED_FIELDS = ['myAssessments', 'missingChecks', 'untaggedReviews', 'carePlans', 'checkpoints', 'relationMap'];

    function applyCaseResetClient(a, b) {
      const t = r => (r && r.caseResetAt ? new Date(r.caseResetAt).getTime() || 0 : 0);
      const reset = Math.max(t(a), t(b));
      if (!reset) return [a, b, null];
      const strip = r => {
        if (!r || t(r) >= reset) return r;
        const c = { ...r };
        CASE_DERIVED_FIELDS.forEach(f => { delete c[f]; });
        return c;
      };
      return [strip(a), strip(b), new Date(reset).toISOString()];
    }
    function mergePatientRecordClient(local, server, now = Date.now()) {

      if (server) repairPatientRecordIds(server);
      if (!server) return local;
      if (!local) return server;
      repairPatientRecordIds(local);
      const __cr = applyCaseResetClient(local, server);
      local = __cr[0]; server = __cr[1];

      const localTime = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
      const serverTime = server.updatedAt ? new Date(server.updatedAt).getTime() : 0;

      const localWins = !SERVER_IS_PRIMARY && localTime >= serverTime;
      const base = localWins ? fillMissingFieldsClient(local, server) : fillMissingFieldsClient(server, local);

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
            survivingTombstoneIds.delete(id);
            return;
          }
          if (serverItem && itemEffectiveTimeClient(serverItem, server.updatedAt) > tombstoneTime) {
            mergedItems.push(serverItem);
            survivingTombstoneIds.delete(id);
            return;
          }
          return;
        }

        if (localItem && serverItem) {
          const lt = itemEffectiveTimeClient(localItem, local.updatedAt);
          const st = itemEffectiveTimeClient(serverItem, server.updatedAt);
          mergedItems.push(!SERVER_IS_PRIMARY && lt >= st ? fillMissingFieldsClient(localItem, serverItem) : fillMissingFieldsClient(serverItem, localItem));
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
        ...(__cr[2] ? { caseResetAt: __cr[2] } : {}),
        updatedAt: (localWins ? local.updatedAt : server.updatedAt) || new Date(now).toISOString()
      };
    }

    function loadLocalState() {
      const cp = getCurrentPatient();
      DOM.sourceText.value = cp.sourceText || '';

      if (highlightedSourceItemId != null) clearSourceHighlight(false);

      DOM.labEvalContent.innerHTML = sanitizeStoredHtml(cp.labEvaluationResult);

      document.getElementById('lab-evaluation-panel')?.classList.toggle('hidden', !cp.labEvaluationResult);

      if (!cp.labEvaluationResult && typeof window.refreshLabAssessmentPanel === 'function') window.refreshLabAssessmentPanel();
      DOM.currentPatientTitle.textContent = cp.title;

      const contradictionPanel = document.getElementById('contradiction-panel');
      if (cp.contradictionResult) { contradictionPanel.classList.remove('hidden'); document.getElementById('contradiction-content').innerHTML = sanitizeStoredHtml(cp.contradictionResult); }
      else { contradictionPanel.classList.add('hidden'); document.getElementById('contradiction-content').innerHTML = ''; }

      if (typeof renderDiagnosisPanel === 'function') renderDiagnosisPanel(cp);
      if (typeof renderAiSteps === 'function') renderAiSteps(cp);
      const timelinePanel = document.getElementById('timeline-panel');
      if (cp.timelineResult) { timelinePanel.classList.remove('hidden'); document.getElementById('timeline-content').innerHTML = sanitizeStoredHtml(cp.timelineResult); }
      else { timelinePanel.classList.add('hidden'); document.getElementById('timeline-content').innerHTML = ''; }
      const carePlanPanel = document.getElementById('careplan-panel');
      if (cp.carePlanResult) { carePlanPanel.classList.remove('hidden'); document.getElementById('careplan-content').innerHTML = sanitizeStoredHtml(cp.carePlanResult); }
      else { carePlanPanel.classList.add('hidden'); document.getElementById('careplan-content').innerHTML = ''; }
      if (typeof refreshAiResults === 'function') refreshAiResults(false);

      if (typeof onPatientViewReloaded === 'function') onPatientViewReloaded(cp);
      if (typeof onRelationMapPatientReloaded === 'function') onRelationMapPatientReloaded(cp);

      selectedCardIds.clear();
      boardSearchTerm = '';
      const searchInput = document.getElementById('board-search');
      if (searchInput) searchInput.value = '';

      renderPatientTabs();
      renderSoBoard();
      renderAssessmentTable();
      renderReferenceList();
      updateCurrentPatientMeta();

      updateSaveStatus(typeof unsyncedPatientIds !== 'undefined' && unsyncedPatientIds.has(cp.id) ? 'error' : 'saved-earlier');
    }

    function renderPatientTabs() {
      const visible = globalAppData.patients.filter(pat => !pat.archived);
      const current = getCurrentPatient();
      const label = document.getElementById('patient-switcher-label');
      if (label) label.textContent = current ? current.title : '-';
      const count = document.getElementById('patient-switcher-count');
      if (count) count.textContent = visible.length > 1 ? `${visible.length}` : '';
      const searchBox = document.getElementById('patient-menu-search');
      const q = (searchBox && searchBox.value || '').trim().toLowerCase();
      if (searchBox) searchBox.classList.toggle('hidden', visible.length < 6);
      const sorted = visible.slice().sort((a, b) => (a.id === globalAppData.currentPatientId ? -1 : b.id === globalAppData.currentPatientId ? 1 : String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))));
      const frag = document.createDocumentFragment();
      const shown = sorted.filter(pat => !q || (pat.title || '').toLowerCase().includes(q));
      shown.forEach(pat => {
        const isActive = pat.id === globalAppData.currentPatientId;
        const row = document.createElement('div');
        row.className = `patient-menu-row${isActive ? ' active' : ''}`;
        const cardCount = (pat.items || []).filter(i => i.type !== 'unnecessary').length;
        row.innerHTML = `
          <button class="patient-menu-name hdr-menu-item" role="menuitem" data-patient-action="switch" data-patient-id="${escapeHtml(pat.id)}">
            <i class="fa-solid ${isActive ? 'fa-check' : 'fa-user-injured'}"></i><span class="truncate">${escapeHtml(pat.title)}<small>カード ${cardCount}枚</small></span>
          </button>
          ${visible.length > 1 ? `<button data-patient-action="archive" data-patient-id="${escapeHtml(pat.id)}" class="icon-btn danger" title="アーカイブする（「すべてのページ・アーカイブ」からいつでも復元できます）"><i class="fa-solid fa-box-archive text-[9px]"></i></button>` : ''}
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

    function handlePatientActionClick(e) {
      const el = e.target && e.target.closest ? e.target.closest('[data-patient-action]') : null;
      if (!el) return;
      const id = el.getAttribute('data-patient-id');
      const action = el.getAttribute('data-patient-action');
      if (action === 'switch') window.switchPatient(id);
      else if (action === 'archive') window.deletePatient(id, e);
      else if (action === 'switch-from-list') window.switchPatientFromList(id);
      else if (action === 'unarchive') window.unarchivePatient(id);
      else if (action === 'archive-from-list') window.archivePatient(id);
      else if (action === 'hard-delete') window.hardDeletePatientFromList(id);
    }
    if (DOM.patientTabs && DOM.patientTabs.addEventListener) DOM.patientTabs.addEventListener('click', handlePatientActionClick);
    document.getElementById('patient-list-body')?.addEventListener('click', handlePatientActionClick);

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
      if (globalAppData.patients.some(p => p.id === globalAppData.currentPatientId)) persistData();
      globalAppData.patients.push({ id: newId, title: String(title).trim(), items: [], sourceText: '', labEvaluationResult: '', referenceNotes: [], archived: false, updatedAt: new Date().toISOString(), deletedItemIds: [] });
      changeCurrentPatient(newId, { saveCurrent: false });
      schedulePatientSync(newId);
      return newId;
    }

    document.getElementById('btn-rename-patient').addEventListener('click', async () => {
      const cp = getCurrentPatient();
      const expected = JSON.stringify(cp);
      const newTitle = await openDialog({ title: 'ページ名を変更', inputValue: cp.title, confirmLabel: '変更する' });
      if (newTitle && newTitle.trim()) {
        if (getCurrentPatient() !== cp || JSON.stringify(cp) !== expected) { showToast('確認中に患者やページが更新されました。名前を変更していません', 'warn'); return; }
        cp.title = newTitle.trim();
        saveDataAndSync();
        DOM.currentPatientTitle.textContent = cp.title;
        renderPatientTabs();
        showToast('ページ名を変更しました', 'success');
      }
    });

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

      persistData();
      p.archived = true;
      p.updatedAt = new Date().toISOString();
      schedulePatientSync(id);
      if (wasCurrent) {
        const next = globalAppData.patients.find(x => !x.archived);
        if (next) changeCurrentPatient(next.id, { saveCurrent: false });
      } else {
        savePatientsLocally();
        renderPatientTabs();
      }
      renderPatientListModal();
      showUndoToast(`「${p.title}」をアーカイブしました`, () => {
        p.archived = false;
        p.updatedAt = new Date().toISOString();
        schedulePatientSync(id);
        if (wasCurrent) changeCurrentPatient(id);
        else { savePatientsLocally(); renderPatientTabs(); }
        renderPatientListModal();
      }, { patientId: id });
    };

    window.unarchivePatient = function(id) {
      const p = globalAppData.patients.find(x => x.id === id);
      if (!p) return;
      p.archived = false;
      p.updatedAt = new Date().toISOString();
      persistData();
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
      if (!target) return;
      const expected = JSON.stringify(target), currentId = globalAppData.currentPatientId;
      if (globalAppData.patients.length <= 1) return showToast('最後のページは削除できません', 'warn');
      const confirmed = await openDialog({ title: '完全に削除しますか？', message: `「${target ? target.title : ''}」のデータを完全に削除します。アーカイブと違い、この操作は元に戻せません。`, confirmLabel: '完全に削除する', danger: true });
      if (confirmed !== true) return;
      if (globalAppData.currentPatientId !== currentId || globalAppData.patients.length <= 1 || globalAppData.patients.find(p => p.id === id) !== target || JSON.stringify(target) !== expected) { showToast('確認中に患者やページが更新されました。削除していません', 'warn'); return; }
      const idx = globalAppData.patients.findIndex(p => p.id === id);
      if (idx === -1) return;
      const deletingCurrent = globalAppData.currentPatientId === id;

      if (!deletingCurrent) persistData();
      globalAppData.patients.splice(idx, 1);
      if (patientSyncTimers[id]) { clearTimeout(patientSyncTimers[id]); delete patientSyncTimers[id]; }
      rememberDeletedPatient(id);
      deletePatientFromServer(id);
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
          <div class="min-w-0 flex-1 cursor-pointer" data-patient-action="switch-from-list" data-patient-id="${escapeHtml(pat.id)}">
            <div class="text-xs font-semibold text-[var(--ink)] truncate">${escapeHtml(pat.title)}${pat.archived ? ' <span class="text-[9px] text-[var(--ink-muted)] font-normal">(アーカイブ済み)</span>' : ''}</div>
            <div class="text-[10px] text-[var(--ink-muted)]">${pat.updatedAt ? formatRelativeTime(pat.updatedAt) : '更新履歴なし'}・${(pat.items || []).length}件のカード</div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            ${pat.archived
              ? `<button data-patient-action="unarchive" data-patient-id="${escapeHtml(pat.id)}" class="icon-btn-outline" title="復元"><i class="fa-solid fa-box-open"></i></button>`
              : `<button data-patient-action="archive-from-list" data-patient-id="${escapeHtml(pat.id)}" class="icon-btn-outline" title="アーカイブ"><i class="fa-solid fa-box-archive"></i></button>`}
            <button data-patient-action="hard-delete" data-patient-id="${escapeHtml(pat.id)}" class="icon-btn-outline danger" title="完全に削除"><i class="fa-solid fa-trash-can"></i></button>
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

    const ADMIN_PASSWORD = '1739';

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

      if (tab === 'customrules') loadCustomTagRules();
      if (tab === 'reports') loadAndRenderCardReports();

      if (tab === 'criteria') { editingCriteriaId = null; editingReferenceSourceId = null; loadNotebookContent(); loadSharedCriteria(); loadReferenceSources(); }

      if (tab === 'snapshots') loadAndRenderPatientSnapshots();
    }

    const IS_FILE_PROTOCOL = typeof location !== 'undefined' && location.protocol === 'file:';

    function adminServerNoticeHtml(featureName) {
      const why = IS_FILE_PROTOCOL ? 'HTMLファイルを直接開いているため' : 'サーバー（server.js）に接続できないため';
      return `<div class="text-xs text-[var(--ink)] leading-relaxed p-3 rounded-[var(--radius-sm)]" style="background:var(--gold-soft);border:1px solid var(--line);">
        <div class="font-semibold mb-1"><i class="fa-solid fa-plug-circle-xmark mr-1" style="color:var(--gold);"></i>${escapeHtml(featureName)}は、サーバーで開いたときだけ使えます</div>
        <div class="text-[11px] text-[var(--ink-muted)]">全員で共有する記録なので、サーバーに保存されています。今は${why}表示できません。見るには、公開しているページから開くか、アプリのフォルダで「npm start」を実行してブラウザで http://localhost:3000 を開いてください。</div>
      </div>`;
    }

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

      await loadSharedLearningDict();
      renderAdminServerStatus();
      renderAdminLearningList();
    }
    function submitAdminPassword() {
      if (adminPasswordInput.value === ADMIN_PASSWORD) {
        try { sessionStorage.setItem(ADMIN_UNLOCK_KEY, '1'); } catch (e) {   }
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

    const ADMIN_LEARNING_PAGE = 100;
    let adminLearningLimit = ADMIN_LEARNING_PAGE;
    const adminLearningEditing = new Set();
    const learningTypeColorOf = t => t === 's' ? 'var(--gold)' : (t === 'o' ? 'var(--slate)' : (t === 'unnecessary' ? 'var(--brick)' : 'var(--ink-muted)'));
    const learningTypeLabelOf = t => t === 's' ? 'S' : (t === 'o' ? 'O' : (t === 'unnecessary' ? '不要' : t));

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

          const typeChips = r.typeEntries.map(([t, c]) => {
            const isTop = t === r.topType;
            return `<span class="field-chip" style="background:${isTop ? learningTypeColorOf(t) : 'var(--line-soft)'};color:${isTop ? 'var(--on-fill)' : 'var(--ink-muted)'};">${escapeHtml(learningTypeLabelOf(t))}${c > 1 ? ` ×${c}` : ''}</span>`;
          }).join('');
          const tagChips = r.tagEntries.map(([h, c]) => `<span class="tag-chip">${escapeHtml(hendersonNameOf(Number(h)))}${c > 1 ? ` ×${c}` : ''}</span>`).join('');
          chipsHtml = (typeChips || tagChips) ? typeChips + tagChips : '<span class="field-chip" style="background:var(--ink-muted);color:var(--on-fill);">未設定</span>';
        } else {

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

    function mergeLearningDicts(base, incoming) {
      const out = { ...(base || {}) };
      let added = 0, updated = 0;
      Object.entries(incoming || {}).forEach(([text, inc]) => {
        if (!text || !inc || typeof inc !== 'object' || Array.isArray(inc)) return;
        const cur = out[text];
        if (!cur) { out[text] = mergeOne({}, inc); added++; return; }
        const merged = mergeOne(cur, inc);

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
      } catch (e) {   }
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
      reportLearningEvent(text, 'delete', {});
      renderAdminLearningList();
      showToast('学習内容を削除しました', 'success');
    }

    document.getElementById('admin-learning-list').addEventListener('click', e => {
      const btn = e.target.closest('.admin-delete-learning-btn');
      if (btn) deleteAdminLearningEntry(btn.dataset.text);
    });

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
      let entries = learningHistory.slice().reverse();
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

      const actionCounts = {};
      cachedCaseLog.forEach(e => { actionCounts[e.action] = (actionCounts[e.action] || 0) + 1; });
      statsEl.textContent = `全${cachedCaseLog.length}件　` + Object.entries(actionCounts).map(([a, c]) => `${ADMIN_ACTION_LABELS[a] || a}:${c}`).join('　');

      let entries = cachedCaseLog.slice().reverse();
      if (actionFilter) entries = entries.filter(e => e.action === actionFilter);
      if (term) entries = entries.filter(e =>
        (e.text || '').toLowerCase().includes(term) ||
        (ADMIN_ACTION_LABELS[e.action] || e.action || '').toLowerCase().includes(term) ||
        formatHistoryDetail(e).toLowerCase().includes(term)
      );
      countEl.textContent = `${entries.length}件（全${cachedCaseLog.length}件）`;

      const MAX_RENDER = 500;
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

    let customRulesOffline = false;
    async function loadCustomTagRules() {
      try {
        const res = await fetch(`${API_BASE}/custom-tag-rules`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        globalAppData.customTagRules = normalizeCustomTagRules(data?.rules);
        try { localStorage.setItem(CUSTOM_TAG_RULES_CACHE_KEY, JSON.stringify(globalAppData.customTagRules)); } catch (e) {   }
        customRulesOffline = false;
      } catch (e) {
        customRulesOffline = true;
        console.warn('Custom rules load failed; using local copy:', e);
      }
      renderCustomTagRulesPanel();
    }
    async function saveCustomTagRules(rules) {
      const normalized = normalizeCustomTagRules(rules);
      globalAppData.customTagRules = normalized;
      try { localStorage.setItem(CUSTOM_TAG_RULES_CACHE_KEY, JSON.stringify(normalized)); } catch (e) {   }
      renderCustomTagRulesPanel();
      try {
        const res = await fetch(`${API_BASE}/custom-tag-rules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: normalized }) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        globalAppData.customTagRules = normalizeCustomTagRules(data?.rules);
        try { localStorage.setItem(CUSTOM_TAG_RULES_CACHE_KEY, JSON.stringify(globalAppData.customTagRules)); } catch (e) {   }
        renderCustomTagRulesPanel();
        showToast('追加キーワードを保存しました（全員に共有されます。今のカードに反映するには「分類開始」→「置き換えて分類」）', 'success');
      } catch (e) {
        console.warn('Custom rules save failed:', e);
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
          <button class="icon-btn-outline danger ml-auto" onclick="deleteCustomTagRule(${jsArg(r.id)})" title="このルールを削除"><i class="fa-solid fa-times"></i></button>
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

    let cachedPatientSnapshots = null;
    const expandedSnapshotIds = new Set();

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

      let entries = cachedPatientSnapshots.slice().reverse();
      if (term) entries = entries.filter(e => (e.patientTitle || '').toLowerCase().includes(term));
      countEl.textContent = `${entries.length}件（全${cachedPatientSnapshots.length}件）`;

      const MAX_RENDER = 200;
      const shown = entries.slice(0, MAX_RENDER);
      if (shown.length === 0) {
        listEl.innerHTML = '<p class="text-xs text-[var(--ink-muted)] text-center py-6">条件に一致するカルテスナップショットがありません（タブを閉じるたびに、ここに記録されていきます）。</p>';
        return;
      }
      const typeLabelOf = t => t === 's' ? 'S' : (t === 'o' ? 'O' : (t === 'unnecessary' ? '不要' : t || '未分類'));
      const frag = document.createDocumentFragment();
      shown.forEach(entry => {
        const time = entry.closedAt ? new Date(entry.closedAt).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '(日時不明)';

        const clientShort = entry.clientId ? entry.clientId.slice(-6) : '不明';
        const items = Array.isArray(entry.items) ? entry.items : [];

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

    let cachedCardReports = null;
    async function loadAndRenderCardReports() {
      const listEl = document.getElementById('admin-reports-list');
      listEl.innerHTML = `<div class="flex items-center text-[var(--ink-muted)] text-xs p-2"><i class="fa-solid fa-spinner fa-spin mr-2"></i> 報告を読み込み中...</div>`;
      document.getElementById('admin-reports-summary').classList.add('hidden');
      cachedReportSummaryLines = [];
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

      let groups = cachedCardReports.slice().reverse();
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

    let cachedReportSummaryLines = [];

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
    document.getElementById('tab-relation')?.addEventListener('click', () => switchView('relation'));

    function updateNeedNavTop() {
      const header = document.querySelector('header');
      if (header) document.documentElement.style.setProperty('--need-nav-top', getComputedStyle(header).position === 'sticky' ? `${Math.ceil(header.getBoundingClientRect().height) + 6}px` : '6px');
    }
    window.addEventListener('resize', updateNeedNavTop);
    function switchView(viewName, { buildPlans = true } = {}) {
      updateNeedNavTop();
      DOM.viewSoBoard.classList.toggle('hidden', viewName !== 'so');
      DOM.viewAssessment.classList.toggle('hidden', viewName !== 'assessment');
      DOM.viewReference.classList.toggle('hidden', viewName !== 'reference');
      DOM.viewLabs.classList.toggle('hidden', viewName !== 'labs');
      DOM.tabLabs.className = `tab-pill ${viewName === 'labs' ? 'active' : ''}`;
      DOM.tabSoBoard.className = `tab-pill ${viewName === 'so' ? 'active' : ''}`;
      DOM.tabAssessment.className = `tab-pill ${viewName === 'assessment' ? 'active' : ''}`;
      DOM.tabReference.className = `tab-pill ${viewName === 'reference' ? 'active' : ''}`;

      const viewCarePlan = document.getElementById('view-careplan');
      if (viewCarePlan) viewCarePlan.classList.toggle('hidden', viewName !== 'careplan');
      const tabCarePlan = document.getElementById('tab-careplan');
      if (tabCarePlan) tabCarePlan.className = `tab-pill ${viewName === 'careplan' ? 'active' : ''}`;
      if (viewName === 'careplan' && typeof renderCarePlans === 'function') { if (buildPlans && typeof autoBuildCarePlans === 'function') autoBuildCarePlans(getCurrentPatient()); renderCarePlans(); }

      document.getElementById('view-relation')?.classList.toggle('hidden', viewName !== 'relation');

      document.body.classList.toggle('is-relation-view', viewName === 'relation');
      if (viewName !== 'relation' && typeof window.rmSetFullscreen === 'function') window.rmSetFullscreen(false);
      const tabRelation = document.getElementById('tab-relation');
      if (tabRelation) tabRelation.className = `tab-pill ${viewName === 'relation' ? 'active' : ''}`;
      if (viewName === 'relation' && typeof renderRelationMap === 'function') renderRelationMap();
      if (viewName === 'assessment') renderAssessmentTable();
      if (viewName === 'reference') renderReferenceList();
      if (viewName === 'labs') renderLabTrend();
    }

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

    function updateSourcePaneLayout() {
      const view = DOM.viewSoBoard;
      if (!view || !view.classList) return;
      const wide = sourcePaneManual === 'wide';
      view.classList.toggle('input-wide', wide);
      view.classList.remove('no-cards');
      const btn = document.getElementById('btn-source-wide');
      if (btn) {
        btn.innerHTML = wide ? '<i class="fa-solid fa-down-left-and-up-right-to-center"></i><span>狭める</span>' : '<i class="fa-solid fa-left-right"></i><span>広げる</span>';
        btn.classList.remove('hidden');
      }
    }

    function resetSourcePaneLayout() { updateSourcePaneLayout(); }
    window.toggleSourcePaneWidth = function() {
      sourcePaneManual = sourcePaneManual === 'wide' ? null : 'wide';
      updateSourcePaneLayout();
    };

    const aiPanelOpen = new Set();
    function aiPanelSummaryText(body) {

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

    const AI_RESULT_TABS = [
      { panel: 'lab-evaluation-panel', label: '検査値の評価' }
    ];
    let aiResultsActive = null;
    function refreshAiResults(keepActive = true) {
      const box = document.getElementById('ai-results');
      const tabs = document.getElementById('ai-results-tabs');
      if (!box || !tabs) return;
      const avail = AI_RESULT_TABS.filter(t => { const p = document.getElementById(t.panel); return p && !p.classList.contains('hidden'); });
      if (!keepActive || !avail.some(t => t.panel === aiResultsActive)) aiResultsActive = null;
      if (box.classList.contains('hidden') !== !avail.length) box.classList.toggle('hidden', !avail.length);
      tabs.innerHTML = avail.map(t => {
        const body = document.getElementById(t.panel).querySelector('.ai-panel-body');
        const running = !!(body && body.querySelector && body.querySelector('.fa-spinner'));
        const active = t.panel === aiResultsActive;
        return `<button type="button" role="tab" class="ai-results-tab${active ? ' active' : ''}" aria-selected="${active}" onclick="showAiResult('${t.panel}')">${running ? '<i class="fa-solid fa-spinner fa-spin"></i> ' : ''}${t.label}</button>`;
      }).join('');
      AI_RESULT_TABS.forEach(t => {
        const p = document.getElementById(t.panel);
        if (!p) return;
        const hide = t.panel !== aiResultsActive;
        if (p.classList.contains('ai-tab-hidden') !== hide) p.classList.toggle('ai-tab-hidden', hide);
      });
      document.getElementById('ai-results-close')?.classList.toggle('hidden', !aiResultsActive);
      if (typeof renderAiSteps === 'function') renderAiSteps(getCurrentPatient());
    }
    window.showAiResult = function(panelId) {
      aiResultsActive = panelId && panelId !== aiResultsActive ? panelId : null;
      refreshAiResults();
    };
    (() => {
      if (typeof MutationObserver === 'undefined' || !document.querySelectorAll) return;
      document.querySelectorAll('.ai-panel').forEach(panel => {
        const body = panel.querySelector('.ai-panel-body');
        if (!body) return;
        let wasHidden = panel.classList.contains('hidden');
        new MutationObserver(() => {

          if (body.querySelector('.fa-spinner')) { aiPanelOpen.add(panel.id); aiResultsActive = panel.id; }
          refreshAiPanel(panel);
          refreshAiResults();
        }).observe(body, { childList: true, subtree: true, characterData: true });

        new MutationObserver(() => {
          const nowHidden = panel.classList.contains('hidden');
          if (nowHidden === wasHidden) return;
          wasHidden = nowHidden;
          refreshAiResults();
        }).observe(panel, { attributes: true, attributeFilter: ['class'] });
        refreshAiPanel(panel);
      });
      refreshAiResults(false);
    })();

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

    window.jumpToBoardCard = function(itemId) {
      const cp=getCurrentPatient();
      const item=(cp?.items||[]).find(i=>String(i.id)===String(itemId)&&!i.deleted&&i.type!=='unnecessary'&&!i.aiSuggested);
      if(!item){showToast('参照先のカードは削除・除外されたか、この患者にはありません','warn');return false;}
      boardSearchTerm='';
      const search=document.getElementById('board-search');
      if(search)search.value='';
      renderSoBoard();
      switchView('so');
      requestAnimationFrame(() => {
        if(getCurrentPatient()?.id!==cp.id)return;
        const current=(getCurrentPatient()?.items||[]).find(i=>String(i.id)===String(itemId)&&!i.deleted&&i.type!=='unnecessary'&&!i.aiSuggested);
        if(!current)return;
        const el = document.getElementById(String(itemId));
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.setAttribute('tabindex','-1');el.focus({preventScroll:true});
        el.classList.add('card-flash');
        setTimeout(() => el.classList.remove('card-flash'), 1600);
      });
      return true;
    };

    var sourceTextSaveTimer = null;
    const SOURCE_TEXT_SAVE_DELAY_MS = 600;
    function cancelSourceTextSave() {
      if (sourceTextSaveTimer) { clearTimeout(sourceTextSaveTimer); sourceTextSaveTimer = null; }
    }
    function flushSourceTextSave() {
      if (!sourceTextSaveTimer) return false;
      cancelSourceTextSave();
      saveDataAndSync();
      return true;
    }
    function scheduleSourceTextSave() {
      const cp = getCurrentPatient();
      cp.sourceText = DOM.sourceText.value;
      cp.updatedAt = new Date().toISOString();
      cancelSourceTextSave();
      sourceTextSaveTimer = setTimeout(() => { sourceTextSaveTimer = null; saveDataAndSync(); }, SOURCE_TEXT_SAVE_DELAY_MS);
    }
    DOM.sourceText.addEventListener('input', scheduleSourceTextSave);
    document.getElementById('btn-start-classify')?.addEventListener('click', flushSourceTextSave, true);
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('beforeunload', flushSourceTextSave);
      window.addEventListener('pagehide', flushSourceTextSave);
    }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSourceTextSave(); });
    document.getElementById('btn-load-sample').addEventListener('click', () => { cancelSourceTextSave(); DOM.sourceText.value = SAMPLE_TEXT; saveDataAndSync(); });

    (function setupSampleCases() {
      const sel = document.getElementById('sample-case-select');
      if (!sel || typeof SAMPLE_CASES === 'undefined') return;
      SAMPLE_CASES.forEach((c, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = c.label; sel.appendChild(o); });
      const load = () => {
        const c = SAMPLE_CASES[Number(sel.value)];
        if (!c) { sel.focus(); return false; }
        if (DOM.sourceText.value.trim() && DOM.sourceText.value.trim() !== c.text.trim() && !confirm('いまの記録メモを、選んだ事例に入れ替えます。よろしいですか？')) return false;
        cancelSourceTextSave(); DOM.sourceText.value = c.text; saveDataAndSync(); return true;
      };
      document.getElementById('btn-load-sample-case')?.addEventListener('click', load);
      document.getElementById('btn-load-sample-classify')?.addEventListener('click', () => { if (load()) document.getElementById('btn-start-classify')?.click(); });
    })();

    window.clearSourceText = async function() {
      const text = DOM.sourceText.value;
      if (!text.trim()) { showToast('記録メモはすでに空です', 'info'); return; }
      const ok = await openDialog({
        title: '記録メモを空にしますか？',
        message: `記録メモの文章（${text.length.toLocaleString()}文字）をすべて消します。\n分類ボードのカード・総合アセスメント表・看護計画などは消えません。\n消したあと少しの間は「元に戻す」で戻せます。`,
        confirmLabel: '空にする', danger: true
      });
      if (ok !== true) return;
      const patId = getCurrentPatient().id;
      cancelSourceTextSave();
      if (highlightedSourceItemId != null) clearSourceHighlight(false);
      DOM.sourceText.value = '';
      updateSourceEditorCount();
      saveDataAndSync();
      showUndoToast('記録メモを空にしました', () => {
        const p = globalAppData.patients.find(x => x.id === patId);
        if (!p) return;
        if (getCurrentPatient().id === patId) { DOM.sourceText.value = text; updateSourceEditorCount(); }
        else p.sourceText = text;
      }, { patientId: patId });
      DOM.sourceText.focus();
    };
