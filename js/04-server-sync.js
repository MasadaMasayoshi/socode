    // 看護アセスメント支援システム：04-server-sync.js（全10ファイルのうち 4 番目）
    // サーバーとのやりとり：共有学習データ、カルテの共有保存、分類基準・参照元リンク、同時接続人数。
    // index.html の <script> で 01〜10 の順に読み込み、1つのプログラムとして動きます
    // （順番を入れ替えないでください。以前の app.js を内容ごとに分けたものです）。

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['04'] = '2026-09-29.5'; // 版（scripts/stamp-version.js が書き込む）
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

    function schedulePatientSync(patientId) {
      if (!patientId) return;
      if (patientSyncTimers[patientId]) clearTimeout(patientSyncTimers[patientId]);
      patientSyncTimers[patientId] = setTimeout(() => syncPatientToServer(patientId), PATIENT_SYNC_DEBOUNCE_MS);
    }
    async function syncPatientToServer(patientId) {
      const patient = globalAppData.patients.find(p => p.id === patientId);
      if (!patient) return;
      try {
        const res = await fetch(`${API_BASE}/patients/${encodeURIComponent(patientId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patient)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // サーバー側は、他端末が同じ患者を同時に編集していた場合、カード単位で
        // マージした結果（他端末だけが持っていたカードを消さずに残した結果）を返す。
        // それをこの端末にも反映しておかないと、次にこの端末が保存するまで
        // 他端末のカードが画面に出てこないままになってしまう。入力中の欄
        // （カルテ本文=sourceText等）には触れず、カード一覧とその削除記録だけを合わせる。
        const result = await res.json().catch(() => null);
        if (result && result.patient && Array.isArray(result.patient.items)) {
          const current = globalAppData.patients.find(p => p.id === patientId);
          if (current) {
            const changed = JSON.stringify(current.items) !== JSON.stringify(result.patient.items);
            current.items = result.patient.items;
            current.deletedItemIds = Array.isArray(result.patient.deletedItemIds) ? result.patient.deletedItemIds : [];
            if (result.patient.updatedAt) current.updatedAt = result.patient.updatedAt;
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
        }
        // 表示中の患者ページのサーバー保存が完了した場合のみ、保存状態表示を「保存済み」に更新する
        // （バックグラウンドで別の患者ページの同期が完了した場合は、今表示中の状態表示には影響させない）。
        if (getCurrentPatient().id === patientId) updateSaveStatus('saved');
      } catch (e) {
        console.warn('患者カルテのサーバーへの保存に失敗しました（この端末内には保存されています。サーバー未接続の場合は他端末と共有されません）:', e);
        if (getCurrentPatient().id === patientId) updateSaveStatus('error');
      }
    }
    async function deletePatientFromServer(patientId) {
      try {
        const res = await fetch(`${API_BASE}/patients/${encodeURIComponent(patientId)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (e) {
        console.warn('患者カルテのサーバーからの削除に失敗しました:', e);
      }
    }
    // 起動時に一度、サーバー側の共有カルテを取得し、このブラウザ内のカルテとマージする。
    // 同じ患者IDが両方に存在する場合は、更新日時(updatedAt)が新しい方を採用する
    // （他端末での更新が新しければそちらを取り込み、このタブでの未送信の変更が新しければそれを残す）。
    async function loadSharedPatients() {
      try {
        const res = await fetch(`${API_BASE}/patients`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const serverPatientsDict = await res.json();
        // 【修正】以前はここで「患者カルテをまるごと」比較し、updatedAtが新しい方をそのまま
        // 採用していたため、サーバー側が新しいと判定されるとこのブラウザだけが知っている
        // カードごと丸ごと消えてしまうことがあった。mergePatientRecordClientでカード単位に
        // マージすることで、どちらか一方にしか無いカードも（削除記録＝tombstoneが無い限り）
        // 両方とも残るようにする（詳しい経緯はmergePatientRecordClientの説明を参照）。
        const merged = {};
        (globalAppData.patients || []).forEach(p => { merged[p.id] = p; });
        Object.entries(serverPatientsDict).forEach(([id, serverPatient]) => {
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
    async function loadNotebookContent() {
      try {
        const res = await fetch(`${API_BASE}/notebook-content`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        // サーバーに保存されている基準ノートが統合版より前のもの（版の印が無い）なら、古い版は使わず統合版を使う
        // （利用者からの指摘：「前回の変更が更新されてない」。以前に保存された古い版が、新しい統合版の代わりに
        // 使われ続けていた）。共有の保存内容は、分類基準タブで「保存」を押すと統合版に置き換わる。
        if (typeof data?.text === 'string' && data.text) {
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

    window.saveNotebookContent = async function() {
      const textarea = document.getElementById('input-notebook-content');
      const text = textarea ? textarea.value.trim() : '';
      if (!text) return showToast('内容を入力してください', 'error');
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
        showToast('保存に失敗しました（サーバーが起動していない可能性があります）', 'error');
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

    async function addExtraCriteria(text) {
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
        showToast('サーバーに保存できませんでした（サーバーが起動していない可能性があります）', 'error');
        return false;
      }
    }

    window.deleteExtraCriteria = async function(id) {
      try {
        const res = await fetch(`${API_BASE}/extraction-criteria/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        globalAppData.additionalCriteria = await res.json();
        if (editingCriteriaId === id) editingCriteriaId = null;
        renderExtraCriteriaList();
        showToast('追加の要望を削除しました', 'success');
      } catch (e) {
        console.warn('追加の抽出基準の削除に失敗しました:', e);
        showToast('削除に失敗しました（サーバーが起動していない可能性があります）', 'error');
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
      if (!text) return showToast('内容を入力してください', 'error');
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
        showToast('更新に失敗しました（サーバーが起動していない可能性があります）', 'error');
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
      try {
        const res = await fetch(`${API_BASE}/reference-sources/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        globalAppData.referenceSources = await res.json();
        if (editingReferenceSourceId === id) editingReferenceSourceId = null;
        renderReferenceSourcesList();
        showToast('参照元を削除しました', 'success');
      } catch (e) {
        console.warn('参照元リンクの削除に失敗しました:', e);
        showToast('削除に失敗しました（サーバーが起動していない可能性があります）', 'error');
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
      if (!title) return showToast('名前を入力してください', 'error');
      if (!url) return showToast('リンク（URL）を入力してください', 'error');

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
        showToast('更新に失敗しました（サーバーが起動していない可能性があります）', 'error');
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
              <a href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer" class="font-semibold text-[var(--accent-dark)] break-words hover:underline"><i class="fa-solid fa-link text-[9px] mr-1"></i>${escapeHtml(r.title)}</a>
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
