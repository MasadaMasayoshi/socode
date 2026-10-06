    // 看護アセスメント支援システム：04-server-sync.js（全10ファイルのうち 4 番目）
    // サーバーとのやりとり：共有学習データ、カルテの共有保存、分類基準・参照元リンク、同時接続人数。
    // index.html の <script> で 01〜10 の順に読み込み、1つのプログラムとして動きます
    // （順番を入れ替えないでください。以前の app.js を内容ごとに分けたものです）。

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['04'] = '2026-10-06.4'; // 版（scripts/stamp-version.js が書き込む）
    // ==========================================================================
    // 共有学習（全利用者・全カードで共有する学習データ）
    // ------------------------------------------------------------------------
    // 事例研究用途のため、個人情報の遮断は行わず、カードの本文・タグ付け・
    // どの欄に割り振られたか・どう編集されたかを、そのままサーバーに送って
    // 全利用者で共有する。学習内容はこのブラウザ（localStorage）には保存せず、
    // フォルダ内にあらかじめ用意された学習専用ファイルだけに保存・蓄積していく。
    // サーバー側は同じ形の辞書(learning-dict.json)と、生のイベント履歴
    // (case-log.json)の両方をこの1組のファイルに保存する（都度新しいファイルは作らない）。
    //   - learning-dict: テキストごとの「現在の学習結果」（S/O・ヘンダーソン
    //     タグ・欄・直前の編集）。次回同じ/似た文章が出てきたときの自動分類に使う。
    //     ページを開いた時に自動で全件読み込み、変更のたびに自動でこのファイルへ反映される。
    //   - case-log: いつ・何が・どう変わったかの生ログ。事例研究でそのまま
    //     時系列の分析対象にできる。
    // サーバー（server.js）を起動していない場合は学習専用ファイルに触れられないため、
    // 学習内容はその場限り（画面を離れると失われる）になる。
    // ==========================================================================
    const API_BASE = '/api';
    // { [text]: { preferredType, preferredCols, preferredHendersonIds, typeVotes, hendersonVotes, lastEditedFrom, updatedAt } }
    // typeVotes / hendersonVotes は「同じ文章に対して同じ編集が何回行われたか」のカウント（例:｛s:2, o:1｝）。
    // 新規の自動振り分け（'create'）は投票に数えず、ユーザーが実際に選び直した場合だけ加算することで、
    // 自動振り分けよりユーザーの編集を優先し、さらに票数が多いものほど次回の抽出で優先されるようにする。
    let sharedLearningDict = {};
    // サーバー（学習専用ファイル）に届いたか：'unknown' | 'online' | 'offline'（学習データ管理の表示に使う）
    let learningServerState = 'unknown';

    // 投票（typeVotes / hendersonVotes）の中から最多得票の値を選ぶ。同数の場合は先に記録された方を優先する。
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
        // このブラウザのlocalStorageから読み込んだ学習データ（起動直後の初期値）と、サーバー側の
        // 学習専用ファイルの内容をキー単位でマージする。同じキーが両方にある場合は、このブラウザ側
        // （より最近このタブで確認・編集された可能性がある）を優先する。
        globalAppData.learningUserDict = { ...sharedLearningDict, ...globalAppData.learningUserDict };
      } catch (e) {
        learningServerState = 'offline';
        console.warn('学習専用ファイルの読み込みに失敗しました（サーバーが起動していないか、通信できません。学習内容はこの表示中のみ有効で、保存されません）:', e);
      }
    }

    // ==========================================================================
    // 患者カルテ本体の共有保存（複数端末での共有用）
    // ------------------------------------------------------------------------
    // 患者ごとの分類ボード・総合アセスメント表の中身、および分類の抽出元になった
    // カルテ本文(sourceText)を、学習データと同じ考え方でサーバー側の1ファイル
    // （data/patients.json、患者IDをキーにしたオブジェクト）へ保存する。
    // これにより、ある端末で入力した内容を別の端末・別のブラウザからも同じ内容で開ける。
    // 全患者を毎回まるごと置き換えるのではなく、変更のあった患者だけをPUTすることで、
    // 複数人が別々の患者を同時に編集していても互いのデータを消し合わないようにしている。
    // さらに同じ患者をほぼ同時に編集した場合に備え、サーバー側はカード一覧(items)をカード単位で
    // マージする（server.js の mergePatientRecord）。そのための印として、カードの内容を書き換える
    // 操作のたびに touchItem() でカードへ _touchedAt（最後に書き換えた時刻）を付与し、カードを
    // 削除する操作のたびに markItemDeleted() で patient.deletedItemIds へ削除の記録を残す
    // （「元に戻す」の場合は unmarkItemDeleted() で取り消す）。PUT成功時にサーバーから返る
    // マージ後の内容は syncPatientToServer() がこの端末にも反映し、他端末だけが持っていた
    // カードが画面から消えたままにならないようにしている。
    // サーバー未接続の場合はこのブラウザのタブ内（sessionStorage）だけで、これまで通り動作する。
    // ==========================================================================
    const patientSyncTimers = {};
    const PATIENT_SYNC_DEBOUNCE_MS = 800; // カルテ本文の入力中など、変更のたびに毎回送らないよう少し待ってまとめて送る
    // 【保存待ちの間の編集を守る】利用者からの報告：保存の通信中に編集・追加したカードが、サーバーの応答で
    // 元に戻った。以前は応答のカード一覧で無条件に置き換えていたため。
    //  ・患者ごとに「変更の番号」（patientLocalRev）を数え、送った時点の番号と中身（送った写し）を覚えておく。
    //  ・応答が返ったとき、番号が変わっていなければ（通信中に編集が無ければ）サーバーの結果をそのまま使う。
    //    変わっていれば、送った写しを基準に3者で比べ、通信中に手元で変えたカード・足したカード・消したカードは
    //    手元のまま残し、手元で触っていないカードだけをサーバーの結果（他の端末の変更を含む）にする。
    //  ・同じ患者の送信は1本ずつにし（通信中に次の変更があれば、終わってからもう一度送る）、応答の順番の入れ替わりを防ぐ。
    // 【保存の失敗】サーバーが保存に失敗したとき（500・ok:false）や通信できないときは「未保存」のままにし、
    // 少しずつ間隔を空けて自動で送り直す（画面右上の表示を押すとすぐ送り直す）。
    const patientLocalRev = {};
    const patientSyncState = {}; // { inFlight, pending, retryTimer, retryCount }
    const PATIENT_SYNC_RETRY_MS = [3000, 10000, 30000, 60000, 120000];
    const unsyncedPatientIds = new Set();

    // 完全に削除した患者（この端末で削除した／別の端末で削除されたとサーバーから聞いた）。
    // 古い同期や起動時の読み込みで、削除した患者が復活しないようにする。
    const DELETED_PATIENTS_STORAGE_KEY = 'nursing_deleted_patient_ids';
    const deletedPatientIds = new Set((() => {
      try { const v = JSON.parse(localStorage.getItem(DELETED_PATIENTS_STORAGE_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
    })());
    function rememberDeletedPatient(id) {
      if (!id) return;
      deletedPatientIds.add(id);
      unsyncedPatientIds.delete(id);
      try { localStorage.setItem(DELETED_PATIENTS_STORAGE_KEY, JSON.stringify(Array.from(deletedPatientIds).slice(-500))); } catch (e) { /* 保存できなくても続ける */ }
    }

    function schedulePatientSync(patientId) {
      if (!patientId || deletedPatientIds.has(patientId)) return;
      patientLocalRev[patientId] = (patientLocalRev[patientId] || 0) + 1;
      unsyncedPatientIds.add(patientId);
      if (patientSyncTimers[patientId]) clearTimeout(patientSyncTimers[patientId]);
      patientSyncTimers[patientId] = setTimeout(() => { delete patientSyncTimers[patientId]; syncPatientToServer(patientId); }, PATIENT_SYNC_DEBOUNCE_MS);
    }

    // 送った写し（base）・手元（local）・サーバーの結果（server）の3つを比べて、カード一覧をまとめる
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
        if (!B) items.push(L);                       // 送った後に手元で足したカード
        else if (key(L) !== key(B)) items.push(L);   // 送った後に手元で書き換えたカード
        else if (R) items.push(R);                   // 手元で触っていない → サーバーの結果
        // 手元で触っておらず、サーバーの結果に無い（別の端末で削除された）カードは消す
      });
      serverById.forEach((R, id) => {
        if (localById.has(id)) return;
        if (baseById.has(id)) return;                // 送った後に手元で消したカード → 消したまま
        if (localTombstones.has(id)) return;
        items.push(R);                               // 別の端末で足されたカード
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
      // 自分のアセスメントなど、欲求ごとの記録は、欲求ごとに新しい方を使う（別の端末で書いた分を取り込む）
      const keyed = mergeKeyedPatientFieldsClient(current, serverPatient);
      const keyedChanged = Object.keys(keyed).some(f => JSON.stringify(current[f]) !== JSON.stringify(keyed[f]));
      const changed = keyedChanged || JSON.stringify(current.items) !== JSON.stringify(merged.items);
      Object.assign(current, keyed);
      current.items = merged.items;
      current.deletedItemIds = merged.deletedItemIds;
      if (!editedWhileSending && serverPatient.updatedAt) current.updatedAt = serverPatient.updatedAt;
      if (changed) {
        try {
          localStorage.setItem(PATIENTS_STORAGE_KEY, JSON.stringify({ patients: globalAppData.patients, currentPatientId: globalAppData.currentPatientId }));
        } catch (e) { /* 容量超過などは無視して表示だけ更新する */ }
        if (getCurrentPatient().id === patientId) {
          renderSoBoard();
          renderAssessmentTable();
        }
      }
    }

    // 別の端末で完全に削除された患者：この端末からも外す（削除より古い同期で復活させない）
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
    // 保存できていない患者をすぐに送り直す（画面右上の「未保存」を押したとき・ネットにつながり直したとき）
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
      if (st.inFlight) { st.pending = true; return; } // 通信中は待って、終わってからもう一度送る
      st.inFlight = true;
      st.pending = false;
      const sentRev = patientLocalRev[patientId] || 0;
      const body = JSON.stringify(patient);
      const sentSnapshot = JSON.parse(body);
      let ok = false;
      try {
        const res = await fetch(`${API_BASE}/patients/${encodeURIComponent(patientId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body
        });
        if (res.status === 410) { handlePatientDeletedElsewhere(patientId); ok = true; return; }
        const result = await res.json().catch(() => null);
        if (!res.ok || !result || result.ok === false) {
          const err = new Error((result && result.error) || `HTTP ${res.status}`);
          err.status = res.status;
          throw err;
        }
        // 共有先が確かにこの患者を受け取ったかを確かめる（別の患者の応答や空の応答は保存できたとみなさない）
        if (result.patient && result.patient.id && result.patient.id !== patientId) throw new Error('共有先の応答が別の患者のものでした');
        // サーバー側は、他端末が同じ患者を同時に編集していた場合、カード単位でマージした結果を返す。
        // それをこの端末にも反映する（通信中に手元で編集したカードは applyServerPatientResult が守る）。
        applyServerPatientResult(patientId, result.patient, sentSnapshot, sentRev);
        ok = true;
        st.retryCount = 0;
        st.rejectedStatus = null;
        // 【レビューで発見】以前は保存できた後も、前の失敗で予約した送り直しのタイマーが残り、余分な保存（PUT）が1回走っていた
        if (st.retryTimer) { clearTimeout(st.retryTimer); st.retryTimer = null; }
        if ((patientLocalRev[patientId] || 0) === sentRev) unsyncedPatientIds.delete(patientId);
        // 表示中の患者の保存が終わり、その後の変更も無いときだけ「保存済み」にする
        if (getCurrentPatient().id === patientId && (patientLocalRev[patientId] || 0) === sentRev) updateSaveStatus('saved');
      } catch (e) {
        console.warn('患者カルテのサーバーへの保存に失敗しました（この端末内には保存されています。自動で送り直します）:', e);
        unsyncedPatientIds.add(patientId);
        if (getCurrentPatient().id === patientId) updateSaveStatus('error');
        // 【レビューで発見】以前は、送り直しても結果が変わらない断り（413＝大きすぎる・400＝形が正しくない など）でも、
        // 2分おきに同じ内容を永遠に送り直していた（毎回最大5MBの通信）。408（時間切れ）・409（保存の競合）・
        // 429（送信の集中）以外の4xxは自動では送り直さず、「未保存」のまま残して知らせる
        // （次にカルテを編集したとき・右上の「共有先への保存に失敗」を押したときには、もう一度送る）。
        const status = e && typeof e.status === 'number' ? e.status : 0;
        if (status >= 400 && status < 500 && ![408, 409, 429].includes(status)) {
          if (st.retryTimer) { clearTimeout(st.retryTimer); st.retryTimer = null; }
          if (st.rejectedStatus !== status && !(typeof IS_FILE_PROTOCOL !== 'undefined' && IS_FILE_PROTOCOL)) {
            const p = globalAppData.patients.find(x => x.id === patientId);
            showToast([`「${p ? p.title : ''}」を共有先に保存できませんでした（共有先が受け付けませんでした：HTTP ${status}）`, { text: `このブラウザには保存されています。${status === 413 ? 'カルテが大きすぎる可能性があります。使っていないカード・カルテ本文を減らしてから、右上の「共有先への保存に失敗」を押してください。' : '自動の送り直しはしません。内容を確かめてから、右上の「共有先への保存に失敗」を押してください。'}`, detail: true }], 'error');
          }
          st.rejectedStatus = status;
          return;
        }
        // 失敗し始めたときに1回だけ知らせる（何ができなかったか・次に何をするか）。直るまで右上の表示でも分かる
        if (!(st.retryCount > 0) && !(typeof IS_FILE_PROTOCOL !== 'undefined' && IS_FILE_PROTOCOL)) {
          const p = globalAppData.patients.find(x => x.id === patientId);
          showToast([`「${p ? p.title : ''}」を共有先に保存できませんでした`, { text: 'このブラウザには保存されています。自動で送り直します。すぐ送り直すときは右上の「共有先への保存に失敗」を押してください。続くときはサーバーが動いているか確かめてください。', detail: true }], 'error');
        }
        schedulePatientSyncRetry(patientId);
      } finally {
        st.inFlight = false;
        // 通信中に次の変更があったら、続けて送る（待ち時間のタイマーが残っていればそちらに任せる）
        if (ok && (st.pending || ((patientLocalRev[patientId] || 0) !== sentRev && !patientSyncTimers[patientId]))) {
          st.pending = false;
          syncPatientToServer(patientId);
        }
      }
    }
    // サーバーに届かなかった削除は覚えておき、次に起動したときにもう一度送る（他の端末に削除を伝えるため）
    const PENDING_PATIENT_DELETES_KEY = 'nursing_pending_patient_deletes';
    function pendingPatientDeletes() {
      try { const v = JSON.parse(localStorage.getItem(PENDING_PATIENT_DELETES_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
    }
    function setPendingPatientDeletes(list) {
      try { localStorage.setItem(PENDING_PATIENT_DELETES_KEY, JSON.stringify(Array.from(new Set(list)))); } catch (e) { /* 保存できなくても続ける */ }
    }
    async function deletePatientFromServer(patientId) {
      setPendingPatientDeletes([...pendingPatientDeletes(), patientId]);
      try {
        const res = await fetch(`${API_BASE}/patients/${encodeURIComponent(patientId)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setPendingPatientDeletes(pendingPatientDeletes().filter(id => id !== patientId));
        return true;
      } catch (e) {
        console.warn('患者カルテのサーバーからの削除に失敗しました（この端末では削除済みとして扱い、次に開いたときにもう一度送ります）:', e);
        return false;
      }
    }
    async function retryPendingPatientDeletes() {
      for (const id of pendingPatientDeletes()) await deletePatientFromServer(id);
    }
    // 起動時に一度、サーバー側の共有カルテを取得し、このブラウザ内のカルテとマージする。
    // 同じ患者IDが両方に存在する場合は、更新日時(updatedAt)が新しい方を採用する
    // （他端末での更新が新しければそちらを取り込み、このタブでの未送信の変更が新しければそれを残す）。
    async function loadSharedPatients() {
      await retryPendingPatientDeletes();
      try {
        const res = await fetch(`${API_BASE}/patients`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const serverPatientsDict = await res.json();
        // 別の端末で完全に削除された患者（サーバーの削除の記録）は、この端末からも外す
        try {
          const delRes = await fetch(`${API_BASE}/patient-deletions`);
          if (delRes.ok) {
            const deletions = await delRes.json();
            Object.keys(deletions || {}).forEach(id => rememberDeletedPatient(id));
          }
        } catch (e) { /* 削除の記録が読めなくても、読み込み自体は続ける */ }
        // 【修正】以前はここで「患者カルテをまるごと」比較し、updatedAtが新しい方をそのまま
        // 採用していたため、サーバー側が新しいと判定されるとこのブラウザだけが知っている
        // カードごと丸ごと消えてしまうことがあった。mergePatientRecordClientでカード単位に
        // マージすることで、どちらか一方にしか無いカードも（削除記録＝tombstoneが無い限り）
        // 両方とも残るようにする（詳しい経緯はmergePatientRecordClientの説明を参照）。
        const merged = {};
        (globalAppData.patients || []).forEach(p => { if (!deletedPatientIds.has(p.id)) merged[p.id] = p; });
        Object.entries(serverPatientsDict).forEach(([id, serverPatient]) => {
          if (deletedPatientIds.has(id) || !serverPatient || serverPatient.deleted) return;
          merged[id] = mergePatientRecordClient(merged[id], serverPatient);
        });
        const mergedList = Object.values(merged);
        if (mergedList.length > 0) {
          globalAppData.patients = mergedList;
          if (!globalAppData.patients.some(p => p.id === globalAppData.currentPatientId)) {
            globalAppData.currentPatientId = (globalAppData.patients.find(p => !p.archived) || globalAppData.patients[0]).id;
          }
        }
      } catch (e) {
        console.warn('患者カルテの共有ファイルの読み込みに失敗しました（サーバーが起動していないか、通信できません。このブラウザ内のカルテのみで動作します）:', e);
      }
    }

    // ==========================================================================
    // AIによる抽出・分類基準への「追加の要望」（全利用者共有）
    // ------------------------------------------------------------------------
    // NotebookLM基準ノート（notebookContent）は「学習データ管理」画面（パスワード保護）の
    // 「分類基準」タブから編集でき、サーバー側の data/notebook-content.json に保存され、
    // 全利用者・全端末で共有される。それに加えて、コードを触らずに現場からの
    // 「こういう場合はこう抽出／分類してほしい」という要望を追加・編集・削除できる
    // 「追加の分類基準」（data/extraction-criteria.json）も同じタブにある。
    // AIへの指示文（プロンプト）を組み立てる際は、必ず buildEffectiveNotebookContent()
    // 経由でこれらと結合したものを使う。
    // ==========================================================================
    function buildEffectiveNotebookContent() {
      const extras = (globalAppData.additionalCriteria || []).map(c => `- ${c.text}`).join('\n');
      const trend = buildLearningTrendSummary();
      // 参照元リンクは、内容（content）が貼り付けられているものだけをAIへの指示文に統合する
      // （リンクだけで内容が未貼付のものは、利用者が後で見返すための一覧としては表示するが、
      // 　AIが根拠として参照できる文章が無いため、指示文には含めない）。
      const referenceSourcesText = (globalAppData.referenceSources || [])
        .filter(r => (r.content || '').trim())
        .map(r => `【参照元: ${r.title}${r.url ? ` (${r.url})` : ''}】\n${r.content.trim()}`)
        .join('\n\n');
      let content = globalAppData.notebookContent;
      // 学習データ管理の「追加キーワード」（ルール分類で使うタグ付けのルール）も、AIが同じ基準で判断できるよう
      // 指示文に入れる（基準ノートとの統合。第4章「14項目に当てはまりにくい情報」を参照）。
      const customRules = (globalAppData.customTagRules || []).map(r => `- 「${r.keyword}」${r.mode === 'exclude' ? 'では' : 'を含むとき'}、${r.hendersonIds.map(h => hendersonNameOf(h).replace(/^\d+\.\s*/, '')).map((n, i) => `${r.hendersonIds[i]}.${n}`).join('・')} のタグを${r.mode === 'exclude' ? '付けない' : '付ける'}${r.note ? `（${r.note}）` : ''}`).join('\n');
      if (customRules) content += `\n\n【追加キーワード（学習データ管理で登録したタグ付けのルール・全員共有）】\n${customRules}`;
      if (extras) content += `\n\n【利用者からの追加の抽出・分類基準（現場からの要望・全員共有）】\n${extras}`;
      if (referenceSourcesText) content += `\n\n【学習データ管理から登録された参照元（全員共有）】\n${referenceSourcesText}`;
      if (trend) content += `\n\n【学習データから見えている傾向（過去の修正で繰り返し確認された分類・タグの傾向。参考情報として、基準ノート・追加の分類基準を優先しつつ判断してください）】\n${trend}`;
      return content;
    }

    // これまでの学習データ（learningUserDict）の中から、一度限りの修正ではなく複数回繰り返されて
    // 確立した傾向（票数2以上）だけを抜き出す。AIへの指示文（buildLearningTrendSummary）と、
    // 学習データ管理画面の「学習傾向レポート」タブ（renderLearningTrendsList）の両方から使う
    // 共通ロジック。確立度（総得票数）の高いものから優先する。
    const LEARNING_TREND_MAX_FOR_PROMPT = 60; // 全件をAIへの指示文に載せるとプロンプトが肥大化するための上限
    // dictOverrideはテスト用（学習傾向レポート・AIへの指示文いずれも実際の呼び出しでは省略し、
    // globalAppData.learningUserDictをそのまま使う）。
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
        // 投票の記録がない古い形式のデータ（preferredType/preferredHendersonIdsのみ）は、
        // 繰り返し確認されたかどうかを判定できないため反映対象に含めない。
        if (totalVotes < 2) return;
        const topType = pickTopVote(typeVotes);
        const typeLabel = topType === 's' ? 'S(主観的情報)' : topType === 'o' ? 'O(客観的情報)' : topType === 'unnecessary' ? '不要（カード化しない）' : null;
        const tagNames = Object.entries(hendersonVotes).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).map(([hIdStr]) => hendersonNameOf(Number(hIdStr)));
        if (!typeLabel && tagNames.length === 0) return;
        rows.push({ text, totalVotes, typeVoteTotal, tagVoteTotal, typeLabel, tagNames });
      });
      return rows.sort((a, b) => b.totalVotes - a.totalVotes);
    }

    // 上位（LEARNING_TREND_MAX_FOR_PROMPT件まで）の傾向を、AIへの指示文に統合するための
    // 簡潔なダイジェスト（テキスト）にする。
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

    // NotebookLM基準ノート本体（notebookContent）を読み込む。サーバー側にまだ誰も保存していない
    // 場合（data/notebook-content.jsonのtextがnull）は、コード側のDEFAULT_NOTEBOOK_CONTENTを
    // そのまま使う（=初回は今までと同じ内容のまま、誰かが編集して保存すればそれ以降はサーバー側の
    // 内容が全利用者・全端末で共有される）。
    // サーバーに保存されている基準ノートが古い版だったか（分類基準タブの案内に使う）
    let notebookServerCopyIsOutdated = false;
    let notebookServerText = ''; // 共有先に保存されている基準ノート（古い版でもそのまま。統合のときに書き足した行を拾う）
    async function loadNotebookContent() {
      try {
        const res = await fetch(`${API_BASE}/notebook-content`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        // サーバーに保存されている基準ノートが統合版より前のもの（版の印が無い）なら、古い版は使わず統合版を使う
        // （利用者からの指摘：「前回の変更が更新されてない」。以前に保存された古い版が、新しい統合版の代わりに
        // 使われ続けていた）。共有の保存内容は、分類基準タブで「保存」を押すと統合版に置き換わる。
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
        console.warn('基準ノート本体の読み込みに失敗しました（サーバーが起動していないか、通信できません。この表示中のみで動作します）:', e);
        renderNotebookContentEditor(); // 取得できなくても、今使っている基準ノート（初期値）を入力欄に表示する
      }
    }

    function renderNotebookContentEditor() {
      const el = document.getElementById('input-notebook-content');
      if (el) el.value = globalAppData.notebookContent || '';
      // 保存されている基準ノートが統合版より前のものなら、置き換えを案内する（js/02 の NOTEBOOK_CONTENT_VERSION_MARK）
      const notice = document.getElementById('notebook-upgrade-notice');
      if (notice) notice.classList.toggle('hidden', !notebookServerCopyIsOutdated);
    }
    // 「統合版に置き換える」：入力欄に統合版を入れる（保存を押すまでは共有されない。元に戻すこともできる）
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
    // 分類基準の統合（利用者からの依頼「分類基準を統合してください」）
    // ------------------------------------------------------------------------
    // 分類基準は、①基準ノート本体 ②追加の分類基準（現場からの要望）③追加キーワード ④参照元 に分かれて増えてきた。
    // ①②を1つの基準ノート（最新の統合版）にまとめ直す：
    //   ・最新の統合版（js/02 の DEFAULT_NOTEBOOK_CONTENT）を土台にする
    //   ・共有の基準ノートに利用者が書き足した行（最新版にも以前の版にも無い行）を拾う
    //   ・追加の分類基準を1件ずつ拾う
    //   ・拾ったものは内容から章を決め（カードの作り方→第1章、S/O→第2章、タグ・検査値→第4章、
    //     アセスメント・計画→第8章、それ以外→第9章）、その章の終わりの「■ 追加された基準」に入れる
    //   ・最新版に同じ内容があるもの・重なっているものは入れない
    // ③追加キーワードはルール分類がそのまま使う決まりなので統合せずに残す（AIへの指示文には従来どおり自動で付く）。
    // ④参照元もそのまま残す。統合の結果は画面で確かめてから保存し、統合した②は一覧から外せる。
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
    // 共有の基準ノートのうち、利用者が書き足した行（最新の統合版にも、以前の統合版にも無い行）
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
        // 次の章の見出しの前の区切り線（━━━）の手前＝この章の終わり
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

    // ---- 画面：分類基準タブの「分類基準を統合」 ----
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
        console.warn('統合した基準ノートの保存に失敗しました:', e);
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
        console.warn('基準ノート本体の保存に失敗しました:', e);
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
        console.warn('追加の抽出基準の読み込みに失敗しました（サーバーが起動していないか、通信できません。この表示中のみで動作します）:', e);
      }
    }

    // 全員に共有される変更は、反映する直前に確かめる（利用者からの指摘：共有される変更は操作の直前に明示する）
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
        console.warn('追加の抽出基準の保存に失敗しました:', e);
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
        console.warn('追加の抽出基準の削除に失敗しました:', e);
        showToast(['削除できませんでした（共有先のサーバーにつながりません）', { text: 'サーバーが動いているか確かめてから、もう一度削除してください。', detail: true }], 'error');
      }
    };

    // 既存の要望を編集する（追加・削除だけでなく、内容そのものを直接書き換えられるようにする）。
    // 編集中は該当行だけがテキストエリア表示に切り替わる（editingCriteriaIdで管理）。
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
        console.warn('追加の抽出基準の更新に失敗しました:', e);
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
    // 参照元リンク（NotebookLM等）の管理
    // ------------------------------------------------------------------------
    // NotebookLMには個人利用者が取得できる公開APIが無く（2026年9月時点、企業向けの
    // Gemini Enterprise版のみで組織のライセンスが必要）、「APIキーを取得してリンクを
    // 貼るだけで内容を自動取得する」という連携は技術的に作れない。そのため、名前＋リンク
    // （NotebookLMのURLに限らず、他の参照元のURLでも可）を登録し、内容はコピー＆ペーストで
    // 貼り付けてもらう方式にする。貼り付けた内容は基準ノート本体・追加の分類基準と同様に
    // buildEffectiveNotebookContent()経由でAIへの指示文に統合され、分類に反映される。
    // 保存・共有の仕組みは追加の分類基準（extraCriteria）と全く同じパターン
    // （サーバー側の data/reference-sources.json に保存され、全利用者・全端末で共有される）。
    // ==========================================================================
    async function loadReferenceSources() {
      try {
        const res = await fetch(`${API_BASE}/reference-sources`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        globalAppData.referenceSources = await res.json();
      } catch (e) {
        console.warn('参照元リンクの読み込みに失敗しました（サーバーが起動していないか、通信できません）:', e);
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
        console.warn('参照元リンクをサーバーへ保存できませんでした:', e);
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
        console.warn('参照元リンクの削除に失敗しました:', e);
        showToast(['削除できませんでした（共有先のサーバーにつながりません）', { text: 'サーバーが動いているか確かめてから、もう一度削除してください。', detail: true }], 'error');
      }
    };

    // 編集中は該当行だけが入力欄表示に切り替わる（editingReferenceSourceIdで管理。追加の分類基準と同じ方式）。
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
        console.warn('参照元リンクの更新に失敗しました:', e);
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
                : `<span class="font-semibold text-[var(--accent-dark)] break-words"><i class="fa-solid fa-link text-[9px] mr-1"></i>${escapeHtml(r.title)}</span>` /* 【レビューで発見】http(s) 以外（javascript: など）はリンクにしない */}
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
    // 同時接続人数の表示：複数人で使うことを踏まえ、今このシステムを開いている人数の
    // 目安をヘッダーに表示する（タブごとに固有のIDを持ち、定期的にサーバーへ生存報告する）。
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
        updatePresenceUI(null); // サーバー未接続時は人数不明として表示する（エラー扱いにはしない）
      }
    }
    sendPresenceHeartbeat();
    setInterval(sendPresenceHeartbeat, 20000);
