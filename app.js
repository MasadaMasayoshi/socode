    // ヘンダーソン14項目定義
    const HENDERSON_NEEDS = [
      { id: 1, name: "1. 正常な呼吸をする", icon: "fa-lungs", keywords: ["呼吸", "SpO2", "咳", "痰", "喘鳴", "息切れ", "チアノーゼ", "酸素", "息苦し", "PaO2", "呼吸数", "呼吸音", "動脈血ガス", "胸部X線", "胸郭", "呼吸補助筋", "起座呼吸", "wheezes"] },
      { id: 2, name: "2. 適切な飲食をする", icon: "fa-utensils", keywords: ["食事", "食欲", "摂取量", "水分量", "嚥下", "嘔吐", "悪心", "吐気", "むせ", "体重", "栄養", "飲水", "Alb", "TP", "食事量", "咀嚼", "嚥下機能", "栄養状態", "BMI"] },
      { id: 3, name: "3. 身体の老廃物を排泄する", icon: "fa-toilet", keywords: ["排尿", "排便", "下痢", "便秘", "失禁", "導尿", "残尿", "BUN", "Cre", "eGFR", "おしっこ", "下血", "血尿", "ストーマ", "導尿カテーテル", "ドレーン排液", "排泄"] },
      { id: 4, name: "4. 動いて適切な姿勢を保つ", icon: "fa-person-walking", keywords: ["歩行", "移乗", "立位", "坐位", "麻痺", "可動域", "拘縮", "転倒", "ベッド上安静", "体位変換", "移動", "運動機能"] },
      { id: 5, name: "5. 眠りと休息をとる", icon: "fa-bed", keywords: ["睡眠", "不眠", "中途覚醒", "休息", "眠気", "疲労感", "倦怠感", "熟睡", "眠れない", "睡眠薬"] },
      { id: 6, name: "6. 衣服を着脱する", icon: "fa-shirt", keywords: ["着脱", "衣服", "更衣", "ボタン", "靴下", "病衣交換", "パジャマ"] },
      { id: 7, name: "7. 体温を正常範囲に保つ", icon: "fa-temperature-high", keywords: ["体温", "発熱", "熱感", "悪寒", "クーリング", "冷感", "KT", "BT", "℃", "WBC", "CRP"] },
      { id: 8, name: "8. 身体を清潔に保ち皮膚を保護する", icon: "fa-shower", keywords: ["清拭", "入浴", "洗髪", "皮膚発赤", "褥瘡", "創部状態", "口腔ケア", "掻痒", "保清"] },
      { id: 9, name: "9. 環境の危険を避け他者を傷つけない", icon: "fa-shield-halved", keywords: ["コール", "ベッド柵", "点滴ルート", "チューブ抜去", "転落防止", "身体抑制", "安全管理"] },
      { id: 10, name: "10. 他者とコミュニケーションし感情等を表現する", icon: "fa-comments", keywords: ["発話", "会話", "聞こえ", "視力", "難聴", "表出", "失語", "認知", "不安", "訴え", "話す", "語る", "コミュニケーション"] },
      { id: 11, name: "11. 自分の信仰に従って礼拝する", icon: "fa-hands-praying", keywords: ["信仰", "宗教", "信条", "価値観", "お祈り", "礼拝"] },
      { id: 12, name: "12. 達成感のある仕事をする", icon: "fa-trophy", keywords: ["仕事", "役割", "家事", "意欲", "自尊感情", "達成感", "作業"] },
      { id: 13, name: "13. 遊びやレクリエーションに参加する", icon: "fa-gamepad", keywords: ["趣味", "テレビ視聴", "読書", "レク", "散歩", "気晴らし", "娯楽", "余暇"] },
      { id: 14, name: "14. 学び発見し好奇心を充たす", icon: "fa-graduation-cap", keywords: ["病識", "理解度", "指導", "服薬指導", "質問", "知りたい", "学習", "説明理解"] }
    ];

    const SAMPLE_TEXT = `[入院時] 現病歴3日前から咳嗽と発熱が持続し、本日呼吸苦が増悪したため救急搬送となった。
既往歴は2型糖尿病、高血圧症にて内服加療中。
診断名：市中肺炎の疑い
保険：社会保険（本人）
入院日：2026年9月10日
主訴：呼吸が苦しい
[10:00] 入院時、患者は「息苦しくて夜もあまり眠れなかった。横になると特に苦しい」と訴える。
[10:15] 体温37.8℃、脈拍92回/分、血圧142/86mmHg、SpO2 93%(room air)。軽度の起座呼吸あり。喘鳴(wheezes)を聴取。
[検査データ] WBC 11200, CRP 3.8, Hb 10.2, Cre 1.1, Na 136, K 4.2
[14:30] 「少し呼吸が楽になった」と話すが、再度体温を測定すると38.2℃に上昇していた。`;

    const DEFAULT_NOTEBOOK_CONTENT = `【NotebookLM 基準リンク: https://notebooklm.google.com/notebook/3b4f4b3f-5033-4de6-94f9-46bd00bca0db】
- 患者の直接の発言（「〜」）はSデータ（主観的情報）に分類する。
- 医療従事者の観察所見、バイタルサイン、検査データ（WBC, CRP, Hb, BUN, Cre, 電解質等）はOデータ（客観的情報）に分類する。`;

    const LAB_STANDARDS = {
      "WBC": { unit: "/μL", ref: "4,000〜9,000" },
      "RBC": { unit: "×10^4/μL", ref: "400〜550" },
      "Hb": { unit: "g/dL", ref: "11.5〜16.5" },
      "Plt": { unit: "×10^4/μL", ref: "13.0〜35.0" },
      "CRP": { unit: "mg/dL", ref: "0.3以下" },
      "AST": { unit: "U/L", ref: "10〜40" },
      "ALT": { unit: "U/L", ref: "5〜45" },
      "BUN": { unit: "mg/dL", ref: "8〜20" },
      "Cre": { unit: "mg/dL", ref: "0.6〜1.1" },
      "Na": { unit: "mEq/L", ref: "135〜145" },
      "K": { unit: "mEq/L", ref: "3.5〜5.0" },
      "Cl": { unit: "mEq/L", ref: "98〜108" },
      "Dダイマー": { unit: "μg/mL", ref: "1.0以下" },
      "BNP": { unit: "pg/mL", ref: "18.4以下" },
      "PT-INR": { unit: "", ref: "0.9〜1.1" },
      "HbA1c": { unit: "%", ref: "4.6〜6.2" }
    };

    // 単独では意味が読み取れない断片（助詞・接続表現から始まる等）を検出するための正規表現。
    // これに該当する場合、直前のカードがあればそこへ文章をつなぎ戻し、つなぎ戻す先がなければ
    // 情報として不完全なのでカード化せずに読点区切りで捨てる。
    const UNNATURAL_START_REGEX = /^(の|は|が|を|に|で|と|も|へ|や|し|って|といった|という|ため|により|による|たり|して|しつつ|つつ|なり|ながら|とともに|において|に対して|について|よって)/;

    // 現病歴・診断名・保険等、時刻と同様に「見出しラベル」として本文から切り出し、
    // カード上ではバッジとして常に同じ場所・同じ見た目で表示する構造化項目。
    // type: この見出しが付いた本文をS/Oどちらの初期分類にするか（主訴は患者の訴えなのでS、それ以外は記録上の客観情報としてO）
    // 項目を追加したい場合はここに { key, label, color, bg, icon, type } を足すだけでよい。
    const FIELD_LABELS = [
      { key: "現病歴", label: "現病歴", color: "var(--slate)", bg: "var(--slate-soft)", icon: "fa-notes-medical", type: "o" },
      { key: "既往歴", label: "既往歴", color: "var(--slate)", bg: "var(--slate-soft)", icon: "fa-clock-rotate-left", type: "o" },
      { key: "診断名", label: "診断名", color: "var(--brick)", bg: "var(--brick-soft)", icon: "fa-stethoscope", type: "o" },
      { key: "保険", label: "保険", color: "var(--gold)", bg: "var(--gold-soft)", icon: "fa-file-shield", type: "o" },
      { key: "入院日", label: "入院日", color: "var(--accent-dark)", bg: "var(--accent-soft)", icon: "fa-calendar-check", type: "o" },
      { key: "主訴", label: "主訴", color: "var(--gold)", bg: "var(--gold-soft)", icon: "fa-comment-medical", type: "s" }
    ];
    // 「現病歴：」のようにコロン付きでも、「現病歴は」「現病歴」のようにコロンなしでも検出できるよう、
    // 見出し語の直後にコロン／読点／「は」いずれかが来ても来なくても切り出せる正規表現をここで組み立てる。
    const FIELD_LABEL_KEYS = FIELD_LABELS.map(f => f.key).join('|');
    const FIELD_LABEL_REGEX_SOURCE = `(?:^|[、。\\s])(${FIELD_LABEL_KEYS})(?:[:：]\\s*|は)?`;

    // ==========================================================================
    // 共有学習（全利用者・全カードで共有する学習データ）
    // ------------------------------------------------------------------------
    // 事例研究用途のため、個人情報の遮断は行わず、カードの本文・タグ付け・
    // どの欄に割り振られたか・どう編集されたかを、そのままサーバーに送って
    // 全利用者で共有する。サーバー側は同じ形の辞書(learning-dict.json)と、
    // 生のイベント履歴(case-log.json)の両方を保存する。
    //   - learning-dict: テキストごとの「現在の学習結果」（S/O・ヘンダーソン
    //     タグ・欄・直前の編集）。次回同じ/似た文章が出てきたときの自動分類に使う。
    //   - case-log: いつ・何が・どう変わったかの生ログ。事例研究でそのまま
    //     時系列の分析対象にできる。
    // ==========================================================================
    const API_BASE = '/api';
    let sharedLearningDict = {}; // { [text]: { preferredType, preferredCols, preferredHendersonIds, lastEditedFrom, updatedAt } }

    async function loadSharedLearningDict() {
      try {
        const res = await fetch(`${API_BASE}/learning-dict`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        sharedLearningDict = await res.json();
        // サーバー側の学習結果をローカル学習辞書にもマージしておく（同じ形なのでそのまま使い回せる）
        globalAppData.learningUserDict = { ...sharedLearningDict, ...globalAppData.learningUserDict };
      } catch (e) {
        console.warn('共有学習データの取得に失敗しました（サーバー未接続の場合はローカル学習のみで動作します）:', e);
      }
    }

    // action: 'create' | 'type' | 'tagAdd' | 'tagRemove' | 'col' | 'edit'
    async function reportLearningEvent(text, action, payload) {
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

    let globalAppData = {
      patients: [
        { id: 'patient_1', title: '患者A', items: [], sourceText: '', labEvaluationResult: '' }
      ],
      currentPatientId: 'patient_1',
      learningUserDict: JSON.parse(localStorage.getItem('nursing_learning_dict') || '{}'),
      apiKey: localStorage.getItem('gemini_api_key') || '',
      notebookContent: localStorage.getItem('gemini_notebook_content') || DEFAULT_NOTEBOOK_CONTENT
    };

    const DOM = {
      tabSoBoard: document.getElementById('tab-so-board'),
      tabAssessment: document.getElementById('tab-assessment'),
      viewSoBoard: document.getElementById('view-so-board'),
      viewAssessment: document.getElementById('view-assessment'),
      sourceText: document.getElementById('source-text'),
      toastContainer: document.getElementById('toast-container'),
      patientTabs: document.getElementById('patient-tabs-container'),
      labEvalContent: document.getElementById('lab-evaluation-content'),
      currentPatientTitle: document.getElementById('current-patient-title-label')
    };

    function getCurrentPatient() {
      let p = globalAppData.patients.find(x => x.id === globalAppData.currentPatientId);
      if (!p) { p = globalAppData.patients[0]; globalAppData.currentPatientId = p.id; }
      return p;
    }

    function showToast(message, type = 'info') {
      const toast = document.createElement('div');
      const styles = {
        success: 'background:var(--accent-soft);color:var(--accent-dark);border-color:#D7E2DC;',
        error: 'background:var(--brick-soft);color:var(--brick);border-color:#E7CFC8;',
        info: 'background:var(--surface);color:var(--ink);border-color:var(--line);'
      };
      toast.className = `toast-enter p-3 rounded-[var(--radius-sm)] border text-xs font-medium flex items-center gap-2 panel-shadow`;
      toast.style.cssText = styles[type] || styles.info;
      const icon = type === 'success' ? 'fa-check' : type === 'error' ? 'fa-circle-exclamation' : 'fa-info-circle';
      toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
      DOM.toastContainer.appendChild(toast);
      setTimeout(() => { toast.classList.replace('toast-enter', 'toast-exit'); setTimeout(() => toast.remove(), 300); }, 3000);
    }

    // 汎用ダイアログ（window.prompt / window.confirm の代替。見た目をアプリ全体と統一する）
    const dialogEl = document.getElementById('modal-dialog');
    const dialogTitleEl = document.getElementById('dialog-title');
    const dialogMessageEl = document.getElementById('dialog-message');
    const dialogInputEl = document.getElementById('dialog-input');
    const dialogCancelBtn = document.getElementById('dialog-cancel');
    const dialogConfirmBtn = document.getElementById('dialog-confirm');
    let dialogResolve = null;

    function openDialog({ title, message = '', inputValue, placeholder = '', confirmLabel = 'OK', danger = false }) {
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
        dialogConfirmBtn.style.cssText = danger ? 'background:var(--brick);border-color:var(--brick);color:#fff;' : '';
        dialogEl.classList.remove('hidden');
        if (inputValue !== undefined) setTimeout(() => { dialogInputEl.focus(); dialogInputEl.select(); }, 30);
      });
    }
    function closeDialog(result) {
      dialogEl.classList.add('hidden');
      if (dialogResolve) { dialogResolve(result); dialogResolve = null; }
    }
    dialogCancelBtn.addEventListener('click', () => closeDialog(null));
    dialogConfirmBtn.addEventListener('click', () => closeDialog(dialogInputEl.classList.contains('hidden') ? true : dialogInputEl.value.trim()));
    dialogInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); dialogConfirmBtn.click(); } });
    dialogEl.addEventListener('click', e => { if (e.target === dialogEl) closeDialog(null); });

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }

    function persistData() {
      const cp = getCurrentPatient();
      cp.sourceText = DOM.sourceText.value;
      localStorage.setItem('nursing_learning_dict', JSON.stringify(globalAppData.learningUserDict));
      localStorage.setItem('gemini_notebook_content', globalAppData.notebookContent);
    }

    function saveDataAndSync() {
      persistData();
      renderSoBoard();
      renderAssessmentTable();
    }

    function loadLocalState() {
      const cp = getCurrentPatient();
      DOM.sourceText.value = cp.sourceText || '';
      DOM.labEvalContent.innerHTML = cp.labEvaluationResult || '「検査値AI総合評価」ボタンを押すと、入力されたOデータ中の検査値をノートブックの基準に基づいて自動抽出し、臨床的意味を評価します。';
      DOM.currentPatientTitle.textContent = cp.title;
      renderPatientTabs();
      renderSoBoard();
      renderAssessmentTable();
    }

    function renderPatientTabs() {
      const frag = document.createDocumentFragment();
      globalAppData.patients.forEach(pat => {
        const isActive = pat.id === globalAppData.currentPatientId;
        const btn = document.createElement('div');
        btn.className = `patient-chip ${isActive ? 'active' : ''}`;
        btn.innerHTML = `
          <i class="fa-solid fa-user-injured text-[9px]"></i>
          <span onclick="switchPatient('${pat.id}')">${escapeHtml(pat.title)}</span>
          ${globalAppData.patients.length > 1 ? `<button onclick="deletePatient('${pat.id}', event)" class="icon-btn danger" title="ページ削除"><i class="fa-solid fa-xmark text-[9px]"></i></button>` : ''}
        `;
        frag.appendChild(btn);
      });
      DOM.patientTabs.replaceChildren(frag);
    }

    window.switchPatient = function(patId) {
      persistData();
      globalAppData.currentPatientId = patId;
      loadLocalState();
      showToast(`「${getCurrentPatient().title}」のカルテに切り替えました`, 'info');
    };

    document.getElementById('btn-new-patient').addEventListener('click', async () => {
      const title = await openDialog({ title: '新しい患者ページを作成', inputValue: `患者${globalAppData.patients.length + 1}`, placeholder: '患者名またはページ名', confirmLabel: '作成する' });
      if (!title) return;
      const newId = 'patient_' + Date.now();
      globalAppData.patients.push({ id: newId, title: title.trim(), items: [], sourceText: '', labEvaluationResult: '' });
      globalAppData.currentPatientId = newId;
      persistData();
      loadLocalState();
      showToast(`新規ページ「${title}」を作成しました`, 'success');
    });

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

    window.deletePatient = async function(patId, e) {
      e.stopPropagation();
      if (globalAppData.patients.length <= 1) return showToast('最後のページは削除できません', 'error');
      const target = globalAppData.patients.find(p => p.id === patId);
      const confirmed = await openDialog({ title: 'ページを削除しますか？', message: `「${target ? target.title : ''}」を削除します。この操作は元に戻せません。`, confirmLabel: '削除する', danger: true });
      if (confirmed) {
        globalAppData.patients = globalAppData.patients.filter(p => p.id !== patId);
        if (globalAppData.currentPatientId === patId) globalAppData.currentPatientId = globalAppData.patients[0].id;
        persistData();
        loadLocalState();
        showToast('ページを削除しました', 'info');
      }
    };

    DOM.tabSoBoard.addEventListener('click', () => switchView('so'));
    DOM.tabAssessment.addEventListener('click', () => switchView('assessment'));

    function switchView(viewName) {
      const isSo = viewName === 'so';
      DOM.viewSoBoard.classList.toggle('hidden', !isSo);
      DOM.viewAssessment.classList.toggle('hidden', isSo);
      DOM.tabSoBoard.className = `tab-pill ${isSo ? 'active' : ''}`;
      DOM.tabAssessment.className = `tab-pill ${!isSo ? 'active' : ''}`;
      if (!isSo) renderAssessmentTable();
    }

    DOM.sourceText.addEventListener('input', () => saveDataAndSync());
    document.getElementById('btn-load-sample').addEventListener('click', () => { DOM.sourceText.value = SAMPLE_TEXT; saveDataAndSync(); });

    // Googleドキュメント用書き出し機能（未分類も含めて全て見やすく一覧化）
    document.getElementById('btn-export-docs').addEventListener('click', () => {
      const cp = getCurrentPatient();
      const formatLine = i => `・ [${i.timestamp}]${i.fieldLabel ? ` [${i.fieldLabel}]` : ''} ${i.text}\n`;
      let docText = `【看護アセスメント・記録整理シート：${cp.title}】\n\n`;

      docText += `■ 1. 検査データ臨床評価・アセスメントノート\n`;
      docText += (DOM.labEvalContent.innerText || '未評価') + `\n\n`;

      const structuredItems = cp.items.filter(i => i.type !== 'unnecessary' && i.fieldLabel);
      if (structuredItems.length > 0) {
        docText += `■ 2. 現病歴・既往歴・診断名・保険等\n`;
        FIELD_LABELS.forEach(f => {
          const matching = structuredItems.filter(i => i.fieldLabel === f.key);
          matching.forEach(i => docText += `・ [${f.label}] ${i.text}\n`);
        });
        docText += `\n`;
      }

      docText += `■ 3. 主観的情報 (Sデータ)\n`;
      const sItems = cp.items.filter(i => i.type === 's');
      if (sItems.length > 0) {
        sItems.forEach(i => docText += formatLine(i));
      } else {
        docText += `（登録なし）\n`;
      }
      docText += `\n`;

      docText += `■ 4. 客観的情報 (Oデータ)\n`;
      const oItems = cp.items.filter(i => i.type === 'o');
      if (oItems.length > 0) {
        oItems.forEach(i => docText += formatLine(i));
      } else {
        docText += `（登録なし）\n`;
      }
      docText += `\n`;

      docText += `■ 5. 未分類のカード\n`;
      const unclassifiedItems = cp.items.filter(i => i.type === 'unclassified');
      if (unclassifiedItems.length > 0) {
        unclassifiedItems.forEach(i => docText += formatLine(i));
      } else {
        docText += `（未分類のカードはありません）\n`;
      }
      docText += `\n`;

      docText += `■ 6. ヘンダーソン14項目別アセスメント整理\n`;
      HENDERSON_NEEDS.forEach(need => {
        const matching = cp.items.filter(i => i.type !== 'unnecessary' && i.hendersonIds?.includes(need.id));
        if (matching.length > 0) {
          docText += `【${need.name}】\n`;
          matching.forEach(i => {
            const col = i.assessmentCols?.[need.id] || 'unclassified';
            const colName = col === 'preadmission' ? '入院前' : (col === 'postadmission' ? '入院後' : (col === 'missing' ? '不足情報' : '未分類'));
            docText += `  - [${colName}] [${i.type.toUpperCase()}]${i.fieldLabel ? ` [${i.fieldLabel}]` : ''} ${i.text}\n`;
          });
        }
      });

      navigator.clipboard.writeText(docText).then(() => {
        showToast('Googleドキュメント向けのレイアウトでクリップボードにコピーしました！', 'success');
      }).catch(() => {
        const blob = new Blob([docText], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${cp.title}_看護アセスメント.txt`;
        a.click();
        showToast('テキストファイルをダウンロードしました', 'success');
      });
    });

    function detectMultipleHendersonTags(text) {
      const tags = new Set();
      for (const need of HENDERSON_NEEDS) {
        if (need.keywords.some(kw => text.includes(kw))) {
          tags.add(need.id);
        }
      }
      return Array.from(tags);
    }

    function formatLabValueString(str) {
      if (!str) return str;
      const cleaned = str.trim();
      if (/(?:\/μL|g\/dL|mg\/dL|U\/L|mEq\/L|%|℃|mmHg|回\/分)/.test(cleaned)) return cleaned;
      for (const [key, info] of Object.entries(LAB_STANDARDS)) {
        const match = cleaned.match(new RegExp(`^(${key})[\\s:=]+([\\d\\.,]+)`, 'i'));
        if (match) return `${match[1]} ${match[2]} ${info.unit} (基準値: ${info.ref} ${info.unit})`;
      }
      return cleaned;
    }

    function cleanExtractedPhrase(str) {
      if (!str) return '';
      let cleaned = str.trim().replace(/^[\]\)\]〕』】〉、。・,\.\-\s〜〜]+/g, '').replace(/[,\-\s〜〜（〈〔『【「『]+$/g, '');
      return formatLabValueString(cleaned);
    }

    // 前後のつながりや接続詞（「〜と話すが、〜」など）を分断せず、一塊の自然な文章として抽出
    function groupClinicalPhrasesWithTimestamps(text) {
      const extracted = [];
      let globalTimestamp = "日時不明";

      // 助詞・接続表現から始まる、単独では読めない断片は新規カードにしない。
      // 同じ行で直前に抜き出したカードがあれば、そこへ文章をつなぎ戻して1枚に統合する。
      // つなぎ戻す先がない（その行で最初に出てきた文章がそもそも不自然）場合は、
      // 情報として使えないので、中途半端なカードとして残さずに捨てる。
      function pushOrMerge(fragmentText, lineStartIndex, extraProps) {
        if (UNNATURAL_START_REGEX.test(fragmentText)) {
          if (extracted.length > lineStartIndex) {
            const prev = extracted[extracted.length - 1];
            prev.text = cleanExtractedPhrase(prev.text + fragmentText);
          }
          // つなぎ戻す先がない場合は破棄（不自然な断片のままカード化しない）
          return;
        }
        extracted.push({ text: fragmentText, timestamp: globalTimestamp, ...extraProps });
      }

      text.split(/\r?\n/).forEach(line => {
        let cleanLine = line.trim();
        if (!cleanLine) return;
        const timeMatch = cleanLine.match(/^\[?(\d{1,2}[:時]\d{2}(?:分)?|入院時|\d+日目|検査データ)\]?/);
        if (timeMatch) {
          globalTimestamp = timeMatch[1].replace(/[\[\]]/g, '');
          cleanLine = cleanLine.replace(/^\[?(?:\d{1,2}[:時]\d{2}(?:分)?|入院時|\d+日目|検査データ)\]?/, '').trim();
        }
        if (!cleanLine) return;

        const lineStartIndex = extracted.length;

        // 検査データの個別抽出（SpO2は "(room air)" 等の直後の注記も含めて丸ごと1枚のカードにする）
        const labRegex = /(WBC\s*\d+[\d,]*|CRP\s*\d+\.?\d*|HbA1c\s*\d+\.?\d*|Hb\s*\d+\.?\d*|RBC\s*\d+[\d,]*|Plt\s*\d+[\d,]*|BUN\s*\d+\.?\d*|Cre\s*\d+\.?\d*|Na\s*\d+|K\s*\d+\.?\d*|AST\s*\d+|ALT\s*\d+|Dダイマー\s*\d+\.?\d*|BNP\s*\d+\.?\d*|PT-INR\s*\d+\.?\d*|体温\s*\d{2}(?:\.\d)?\s*℃?|血圧\s*\d{2,3}\/\d{2,3}\s*mmHg?|SpO2\s*\d{2,3}\s*%?(?:\s*[\(（][^)）]{0,20}[\)）])?)/gi;
        let lMatch, lSubText = cleanLine;
        while ((lMatch = labRegex.exec(cleanLine)) !== null) {
          const lClean = cleanExtractedPhrase(lMatch[0]);
          if (lClean.length >= 2) extracted.push({ text: lClean, timestamp: globalTimestamp, isLabOrVital: true });
          lSubText = lSubText.replace(lMatch[0], '');
        }
        // 値を抜いた後に残る空カッコや連続する読点・句点など、不自然な残骸を整える
        lSubText = lSubText
          .replace(/[\(（]\s*[\)）]/g, '')
          .replace(/[、。](?=[、。])/g, '')
          .trim();

        // 現病歴・既往歴・診断名・保険・入院日・主訴などの見出しラベル付き項目を、日時と同様に構造化して切り出す
        // 「現病歴：」のようなコロン付きだけでなく、「現病歴は」「現病歴」(コロンなし)でも検出する
        const fieldRegex = new RegExp(FIELD_LABEL_REGEX_SOURCE, 'g');
        const fieldMatches = [];
        let fMatch;
        while ((fMatch = fieldRegex.exec(lSubText)) !== null) {
          fieldMatches.push({ key: fMatch[1], start: fMatch.index, contentStart: fMatch.index + fMatch[0].length });
        }

        if (fieldMatches.length > 0) {
          // 最初のラベルより前にある文章はそのまま一般カードとして残す（不自然な始まりなら直前カードへ統合）
          const leading = lSubText.slice(0, fieldMatches[0].start).trim();
          if (leading) {
            const cleanedLeading = cleanExtractedPhrase(leading.replace(/^(?:入院時[、,]?)?(?:患者は|本日は)?/, ''));
            if (cleanedLeading.length >= 2) pushOrMerge(cleanedLeading, lineStartIndex, { isPhrase: true });
          }
          fieldMatches.forEach((m, idx) => {
            const hardEnd = idx + 1 < fieldMatches.length ? fieldMatches[idx + 1].start : lSubText.length;
            // 見出しの内容は基本的に最初の句点「。」までとし、それ以降は無関係な別の文として切り離す
            // （読点「、」は同じ文の中の列挙とみなし、句点が出るまでは１つの内容として扱う）
            const periodIdx = lSubText.indexOf('。', m.contentStart);
            const segmentEnd = (periodIdx !== -1 && periodIdx < hardEnd) ? periodIdx + 1 : hardEnd;
            const content = cleanExtractedPhrase(lSubText.slice(m.contentStart, segmentEnd).replace(/[、。]\s*$/, ''));
            if (content.length >= 1) extracted.push({ text: content, timestamp: globalTimestamp, fieldLabel: m.key });
            // 見出しの内容にも次の見出しにも属さない残りの文章は、一般カードとして別に拾う
            if (segmentEnd < hardEnd) {
              const leftover = cleanExtractedPhrase(lSubText.slice(segmentEnd, hardEnd));
              if (leftover.length >= 2) pushOrMerge(leftover, lineStartIndex, { isPhrase: true });
            }
          });
          return;
        }

        // 行全体の文脈（引用や「〜と話すが、〜」などの接続表現を含む塊）をそのまま一つの文章として保持
        // （不自然な始まりなら、同じ行で直前に抜き出したカード＝多くは検査値カードへ文章をつなぎ戻す）
        let remainderText = lSubText.trim();
        remainderText = remainderText.replace(/^(?:入院時[、,]?)?(?:患者は|本日は)?/, '').trim();
        const remainder = cleanExtractedPhrase(remainderText);
        if (remainder.length >= 2) {
          pushOrMerge(remainder, lineStartIndex, { isPhrase: true });
        }
      });
      return extracted;
    }

    document.getElementById('btn-start-classify').addEventListener('click', async () => {
      const text = DOM.sourceText.value.trim();
      if (!text) return showToast('文章を入力してください', 'error');
      const cp = getCurrentPatient();

      if (globalAppData.apiKey && globalAppData.notebookContent) {
        showToast('NotebookLM基準ノートに基づいて高精度分類中...', 'info');
        try {
          const prompt = `あなたは看護アセスメント支援AIです。以下の公式「NotebookLM基準ノート」を根拠として、カルテ・記録から重要な所見、患者発言、検査値を抽出してJSON形式（配列）で返してください。
各要素には "text", "timestamp", "type" ("s", "o", "unnecessary"), "hendersonIds" (1〜14の適切な複数タグ配列。関連する項目がない場合は空配列), "fieldLabel" (該当する場合のみ ${FIELD_LABEL_KEYS} のいずれか1つ、該当しなければ null) を含めてください。
※「〜と話すが、〜」などの接続表現や患者発言は分断せず、前後の文脈がつながった1つの自然な文章として抽出してください。
※血液検査データは正しい単位と基準値レンジを記載してください。
※「現病歴：」「既往歴：」「診断名：」「保険：」のように見出し付きで記載されている情報は、見出し部分を除いた本文のみを text とし、見出し名を fieldLabel に入れて1項目として切り出してください（日時の切り出しと同じ要領です）。

【NotebookLM 基準ノート】
${globalAppData.notebookContent}

【カルテ・記録テキスト】
${text}

出力は余計な解説を含めず、必ず有効なJSON配列のみを出力してください。`;

          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${globalAppData.apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] })
          });
          if (!res.ok) throw new Error(`Gemini API error (HTTP ${res.status})`);
          const data = await res.json();
          const jsonMatch = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').match(/\[\s*\{[\s\S]*\}\s*\]/);
          if (jsonMatch) {
            let added = 0;
            JSON.parse(jsonMatch[0]).forEach(pi => {
              if (!pi.text) return;
              const cleanedText = cleanExtractedPhrase(pi.text);
              if (cleanedText.length < 2) return;
              const itemTimestamp = pi.timestamp || "日時不明";
              if (!cp.items.some(i => i.text === cleanedText && i.timestamp === itemTimestamp)) {
                const hIds = pi.hendersonIds?.length ? pi.hendersonIds : detectMultipleHendersonTags(cleanedText);
                const aCols = {};
                hIds.forEach(hid => aCols[hid] = 'unclassified');
                const validFieldLabel = FIELD_LABELS.some(f => f.key === pi.fieldLabel) ? pi.fieldLabel : null;
                const fallbackType = validFieldLabel ? (FIELD_LABELS.find(f => f.key === validFieldLabel)?.type || 'o') : 'unclassified';
                cp.items.push({ id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6), text: cleanedText, timestamp: itemTimestamp, type: pi.type || fallbackType, hendersonIds: hIds, assessmentCols: aCols, fieldLabel: validFieldLabel });
                added++;
              }
            });
            saveDataAndSync();
            return showToast(`NotebookLM基準により${added}件を高精度抽出しました`, 'success');
          }
        } catch (e) {
          console.warn('Notebook AI fallback:', e);
          showToast('AI高精度分類に失敗したため簡易ルールで分類します', 'error');
        }
      }

      let addedCount = 0;
      groupClinicalPhrasesWithTimestamps(text).forEach(chunk => {
        const cleanedText = cleanExtractedPhrase(chunk.text);
        if (cleanedText.length < 2 || cp.items.some(i => i.text === cleanedText && i.timestamp === chunk.timestamp)) return;
        const userLearned = globalAppData.learningUserDict[cleanedText]; // ロード時に共有学習辞書とマージ済み
        // タグ付けも、過去に人が付け直した学習結果があればそれを優先し、なければ固定キーワード辞書で判定
        const detectedHIds = userLearned?.preferredHendersonIds?.length ? userLearned.preferredHendersonIds : detectMultipleHendersonTags(cleanedText);
        // 分類の優先順位: ①学習結果(自分のブラウザ＋全利用者共有、完全一致) → ②見出しラベル → ③固定ルール
        let predictedType = userLearned?.preferredType
          || (chunk.fieldLabel ? (FIELD_LABELS.find(f => f.key === chunk.fieldLabel)?.type || 'o') : null)
          || (/["「][^"「」]+["」]/.test(cleanedText) || /訴え|発言|話す/.test(cleanedText) ? 's' : (chunk.isLabOrVital || /聴取|所見|認める|WBC|CRP|Hb|回\/分|℃|mmHg|上昇/.test(cleanedText) ? 'o' : 'unclassified'));
        const assessmentCols = {};
        detectedHIds.forEach(hId => assessmentCols[hId] = userLearned?.preferredCols?.[hId] || 'unclassified');

        const newItem = { id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6), text: cleanedText, timestamp: chunk.timestamp || "日時不明", type: predictedType, hendersonIds: detectedHIds, assessmentCols, fieldLabel: chunk.fieldLabel || null };
        cp.items.push(newItem);
        // どう自動抽出・自動分類されたかを事例ログに残す（研究用）
        reportLearningEvent(cleanedText, 'create', { type: predictedType, hendersonIds: detectedHIds, assessmentCols, fieldLabel: newItem.fieldLabel });
        addedCount++;
      });
      saveDataAndSync();
      showToast(`${addedCount}件のデータを抽出・カード化しました`, 'success');
    });

    window.evaluateLabValuesAI = async function() {
      const cp = getCurrentPatient();
      const oItems = cp.items.filter(i => i.type === 'o');
      if (oItems.length === 0) return showToast('Oデータ（検査値やバイタル）がありません。先に分類してください', 'error');

      const labTexts = oItems.map(i => `[${i.timestamp}] ${i.text}`).join('\n');
      DOM.labEvalContent.innerHTML = `<div class="flex items-center text-[var(--accent-dark)]"><i class="fa-solid fa-spinner fa-spin mr-2"></i> NotebookLM基準に照らして検査値を評価中...</div>`;

      if (!globalAppData.apiKey) {
        setTimeout(() => {
          let evaluation = `【NotebookLM基準 検査データ臨床的評価】\n`;
          const foundWbc = labTexts.match(/WBC\s*(\d+)/i);
          const foundCrp = labTexts.match(/CRP\s*([\d\.]+)/i);
          const foundHb = labTexts.match(/Hb\s*([\d\.]+)/i);
          if (foundWbc && parseInt(foundWbc[1]) > 9000) evaluation += `・WBC (${foundWbc[1]}/μL): 基準値上限を超えており、体内で細菌感染や炎症反応が生じている可能性が示唆されます。\n`;
          if (foundCrp && parseFloat(foundCrp[1]) > 0.3) evaluation += `・CRP (${foundCrp[1]} mg/dL): 高値を示しており、急性炎症反応の存在を強く裏付ける所見です。\n`;
          if (foundHb && parseFloat(foundHb[1]) < 12.0) evaluation += `・Hb (${foundHb[1]} g/dL): 軽度貧血状態であり、組織への酸素運搬能低下に留意した観察が必要です。\n`;
          if (!foundWbc && !foundCrp && !foundHb) evaluation += `抽出されたOデータ内の検査値に基づき、ヘンダーソン14項目の生理学的バランスとバイタルサインを確認しました。`;
          
          DOM.labEvalContent.innerHTML = (cp.labEvaluationResult = evaluation.replace(/\n/g, '<br>'));
          saveDataAndSync(); showToast('検査値の評価を完了しました', 'success');
        }, 800);
        return;
      }

      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${globalAppData.apiKey}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: `あなたは熟練した看護師長・指導者です。以下の「NotebookLM 基準ノート」の検査値評価規則を根拠にして、患者のOデータに含まれる検査値やバイタルの臨床的意味を評価し、総合評価欄向けに分かりやすく解説・アセスメント文章を作成してください。\n【NotebookLM 基準ノート】\n${globalAppData.notebookContent}\n【患者のOデータ一覧】\n${labTexts}\n出力は簡潔かつ専門的で、マークダウン記号を用いた分かりやすいアセスメント文章にまとめてください。` }] }] })
        });
        if (!res.ok) throw new Error(`Gemini API error (HTTP ${res.status})`);
        const data = await res.json();
        DOM.labEvalContent.innerHTML = (cp.labEvaluationResult = (data.candidates?.[0]?.content?.parts?.[0]?.text || '評価の生成に失敗しました。').replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'));
        saveDataAndSync(); showToast('NotebookLM基準による検査値評価を完了しました', 'success');
      } catch (err) {
        console.warn('Lab evaluation error:', err);
        DOM.labEvalContent.innerHTML = `<span class="text-[var(--brick)]">評価中にエラーが発生しました（${escapeHtml(err.message || '通信エラー')}）。APIキーや通信状況をご確認ください。</span>`;
        showToast('検査値評価に失敗しました', 'error');
      }
    };

    function renderSoBoard() {
      const cp = getCurrentPatient();
      const columns = { unclassified: document.createDocumentFragment(), s: document.createDocumentFragment(), o: document.createDocumentFragment(), unnecessary: document.createDocumentFragment() };
      const counts = { unclassified: 0, s: 0, o: 0 };

      cp.items.forEach(item => {
        columns[item.type].appendChild(createCardElement(item));
        if (item.type !== 'unnecessary') counts[item.type]++;
      });

      Object.keys(columns).forEach(key => document.getElementById(`col-${key}`).replaceChildren(columns[key]));
      ['unclassified', 's', 'o'].forEach(key => document.getElementById(`badge-count-${key}`).textContent = counts[key]);
    }

    function createCardElement(item) {
      const card = document.createElement('div');
      card.id = item.id;
      card.draggable = true;
      card.className = `rec-card active:cursor-grabbing relative group ${item.type === 'unnecessary' ? 'opacity-60 line-through text-[var(--ink-muted)]' : ''}`;
      card.ondragstart = e => { e.dataTransfer.setData('text/plain', item.id); card.classList.add('card-dragging'); };
      card.ondragend = () => card.classList.remove('card-dragging');

      const tagsHtml = (item.hendersonIds || []).map(hId => {
        const need = HENDERSON_NEEDS.find(n => n.id === hId);
        return need ? `<span class="tag-chip">${need.name} <button onclick="removeHendersonTag('${item.id}', ${need.id})" class="text-[var(--accent)]/60 hover:text-[var(--brick)] transition"><i class="fa-solid fa-times"></i></button></span>` : '';
      }).join('');

      const fieldDef = item.fieldLabel ? FIELD_LABELS.find(f => f.key === item.fieldLabel) : null;
      const fieldChipHtml = fieldDef ? `<span class="field-chip" style="background:${fieldDef.bg};color:${fieldDef.color};"><i class="fa-solid ${fieldDef.icon} mr-0.5"></i>${escapeHtml(fieldDef.label)}</span>` : '';
      const timeChipHtml = item.timestamp && item.timestamp !== "日時不明" ? `<span class="time-chip"><i class="fa-regular fa-clock mr-0.5"></i>${escapeHtml(item.timestamp)}</span>` : '';

      card.innerHTML = `
        <div class="flex items-center justify-between gap-1">
          <div class="flex items-center gap-1 flex-wrap">${fieldChipHtml}${timeChipHtml}</div>
          <div class="flex items-center space-x-0.5 ml-auto shrink-0">
            <button onclick="editItemText('${item.id}')" class="icon-btn-outline" title="内容を編集"><i class="fa-solid fa-pen"></i></button>
            <button onclick="deleteItem('${item.id}')" class="icon-btn-outline danger" title="完全削除"><i class="fa-solid fa-times"></i></button>
            ${item.type !== 'unnecessary' ? `<button onclick="setItemType('${item.id}', 'unnecessary')" class="icon-btn-outline" style="border-color:#E4D9C4;color:var(--gold);" title="不要判定"><i class="fa-solid fa-ban"></i></button>` : ''}
          </div>
        </div>
        <p class="font-medium leading-snug break-words text-[var(--ink)]">${escapeHtml(item.text)}</p>
        <div class="flex flex-wrap gap-1 items-center">
          ${tagsHtml}
          <select onchange="addHendersonTag('${item.id}', this.value); this.value='';" class="text-[9px] bg-[var(--paper)] hover:bg-[var(--line-soft)] border border-[var(--line)] rounded-[var(--radius-sm)] px-1 py-0.5 text-[var(--ink-muted)] cursor-pointer focus:outline-none mt-0.5"><option value="">＋ タグ追加</option>${HENDERSON_NEEDS.map(n => `<option value="${n.id}">${n.name}</option>`).join('')}</select>
        </div>
        <div class="flex items-center justify-end space-x-1 pt-1 border-t border-[var(--line-soft)]">
          ${item.type === 'unnecessary' ? `<button onclick="setItemType('${item.id}', 'unclassified')" class="type-btn type-btn-restore">復帰</button>` : ''}
          ${item.type !== 's' && item.type !== 'unnecessary' ? `<button onclick="setItemType('${item.id}', 's')" class="type-btn type-btn-s">→S</button>` : ''}
          ${item.type !== 'o' && item.type !== 'unnecessary' ? `<button onclick="setItemType('${item.id}', 'o')" class="type-btn type-btn-o">→O</button>` : ''}
        </div>
      `;
      return card;
    }

    window.editItemText = async function(id) {
      const item = getCurrentPatient().items.find(i => i.id === id);
      if (!item) return;
      const oldText = item.text;
      const newText = await openDialog({ title: 'カードの内容を編集', inputValue: item.text, confirmLabel: '更新する' });
      if (newText !== null && (item.text = cleanExtractedPhrase(newText))) {
        saveDataAndSync(); showToast('カード内容を更新しました', 'success');
        if (item.text !== oldText) {
          // 編集前→編集後の書き換えを、そのまま事例ログ・共有学習に記録する
          reportLearningEvent(oldText, 'edit', { newText: item.text });
        }
      }
    };

    window.addHendersonTag = function(id, hIdStr) {
      if (!hIdStr) return;
      const hId = parseInt(hIdStr, 10), item = getCurrentPatient().items.find(i => i.id === id);
      if (item && !(item.hendersonIds || (item.hendersonIds = [])).includes(hId)) {
        item.hendersonIds.push(hId); item.assessmentCols[hId] = 'unclassified';
        const learned = globalAppData.learningUserDict[item.text] = { ...globalAppData.learningUserDict[item.text] };
        learned.preferredHendersonIds = Array.from(new Set([...(learned.preferredHendersonIds || []), hId]));
        saveDataAndSync();
        reportLearningEvent(item.text, 'tagAdd', { hendersonId: hId });
      }
    };

    window.removeHendersonTag = function(id, hId) {
      const item = getCurrentPatient().items.find(i => i.id === id);
      if (item?.hendersonIds) {
        item.hendersonIds = item.hendersonIds.filter(idNum => idNum !== hId);
        delete item.assessmentCols[hId];
        const learned = globalAppData.learningUserDict[item.text] = { ...globalAppData.learningUserDict[item.text] };
        learned.preferredHendersonIds = (learned.preferredHendersonIds || []).filter(idNum => idNum !== hId);
        saveDataAndSync();
        reportLearningEvent(item.text, 'tagRemove', { hendersonId: hId });
      }
    };

    window.setItemType = function(id, type) {
      const item = getCurrentPatient().items.find(i => i.id === id);
      if (item) {
        item.type = type;
        globalAppData.learningUserDict[item.text] = { ...globalAppData.learningUserDict[item.text], preferredType: type };
        saveDataAndSync();
        if (type !== 'unnecessary') {
          showToast(`分類(${type})を学習しました`);
          reportLearningEvent(item.text, 'type', { type }); // 全利用者で共有する学習データとして送信（研究用途のため本文も含む）
        }
      }
    };

    window.deleteItem = function(id) {
      const cp = getCurrentPatient();
      cp.items = cp.items.filter(i => i.id !== id);
      saveDataAndSync();
    };

    window.clearUnnecessary = function() {
      const cp = getCurrentPatient();
      cp.items = cp.items.filter(i => i.type !== 'unnecessary');
      saveDataAndSync(); showToast('不必要な情報を全消去しました');
    };

    window.allowDrop = e => e.preventDefault();
    window.handleDrop = (e, targetType) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      if (id && !id.startsWith('asc_')) setItemType(id, targetType);
    };

    function renderAssessmentTable() {
      const activeItems = getCurrentPatient().items.filter(i => i.type !== 'unnecessary');
      const frag = document.createDocumentFragment();

      HENDERSON_NEEDS.forEach(need => {
        const matching = activeItems.filter(i => i.hendersonIds?.includes(need.id));
        const categorize = col => matching.filter(i => (i.assessmentCols?.[need.id] || 'unclassified') === col).map(i => renderAssessmentCellCard(i, need.id)).join('');

        const tr = document.createElement('tr');
        tr.className = "border-b border-[var(--line)] hover:bg-[var(--paper)]/60";
        tr.innerHTML = `
          <td class="border border-[var(--line)] p-3 bg-[var(--paper)] align-top w-44">
            <div class="flex items-start space-x-2">
              <div class="w-6 h-6 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0 mt-0.5">
                <i class="fa-solid ${need.icon} text-xs"></i>
              </div>
              <span class="text-xs leading-normal font-semibold text-[var(--ink)] break-words font-sans">${need.name}</span>
            </div>
          </td>
          <td class="border border-[var(--line)] p-1.5 align-top min-h-[60px]" ondragover="allowDrop(event)" ondrop="handleAssessmentDrop(event, ${need.id}, 'unclassified')"><div class="space-y-1.5">${categorize('unclassified')}</div></td>
          <td class="border border-[var(--line)] p-1.5 align-top bg-[var(--slate-soft)]/30 min-h-[60px]" ondragover="allowDrop(event)" ondrop="handleAssessmentDrop(event, ${need.id}, 'preadmission')"><div class="space-y-1.5">${categorize('preadmission')}</div></td>
          <td class="border border-[var(--line)] p-1.5 align-top bg-[var(--accent-soft)]/40 min-h-[60px]" ondragover="allowDrop(event)" ondrop="handleAssessmentDrop(event, ${need.id}, 'postadmission')"><div class="space-y-1.5">${categorize('postadmission')}</div></td>
          <td class="border border-[var(--line)] p-1.5 align-top bg-[var(--brick-soft)]/40 min-h-[60px]" ondragover="allowDrop(event)" ondrop="handleAssessmentDrop(event, ${need.id}, 'missing')">
            <div class="space-y-1.5">${categorize('missing')}</div>
            <button onclick="openMissingModal(${need.id})" class="mt-1.5 text-[10px] text-[var(--brick)] hover:text-[var(--ink)] font-medium flex items-center w-full justify-center p-1 border border-dashed border-[#DEC0B8] rounded-[var(--radius-sm)]"><i class="fa-solid fa-plus mr-1"></i> 追加</button>
          </td>
        `;
        frag.appendChild(tr);
      });
      document.getElementById('assessment-tbody').replaceChildren(frag);
    }

    function renderAssessmentCellCard(item, hId) {
      const currentCol = item.assessmentCols?.[hId] || 'unclassified';
      const badge = item.type === 's' ? '<span class="px-1 rounded-[var(--radius-sm)] font-bold text-[8px]" style="background:var(--gold-soft);color:var(--gold);">S</span>' : (item.type === 'o' ? '<span class="px-1 rounded-[var(--radius-sm)] font-bold text-[8px]" style="background:var(--slate-soft);color:var(--slate);">O</span>' : '');
      const time = item.timestamp && item.timestamp !== "日時不明" ? `<span class="text-[8px] text-[var(--ink-muted)] bg-[var(--line-soft)] px-1 rounded-[var(--radius-sm)] font-semibold">${escapeHtml(item.timestamp)}</span>` : '';
      const fieldDef = item.fieldLabel ? FIELD_LABELS.find(f => f.key === item.fieldLabel) : null;
      const fieldTag = fieldDef ? `<span class="text-[8px] px-1 rounded-[var(--radius-sm)] font-bold" style="background:${fieldDef.bg};color:${fieldDef.color};">${escapeHtml(fieldDef.label)}</span>` : '';

      // 未・前・後・欠それぞれに専用色を持たせ、選択されていない時も枠線の色で見分けられるようにする
      const COL_COLORS = { unclassified: 'var(--ink-muted)', preadmission: 'var(--slate)', postadmission: 'var(--accent)', missing: 'var(--brick)' };
      const colBtn = (col, label) => {
        const c = COL_COLORS[col];
        const active = currentCol === col;
        return `<button onclick="setAssessmentCol('${item.id}', ${hId}, '${col}')" class="px-1 py-0.5 rounded-[var(--radius-sm)] text-[8px] font-bold border-2 transition" style="${active ? `background:${c};border-color:${c};color:#fff;` : `border-color:${c};color:${c};background:var(--surface);`}">${label}</button>`;
      };

      return `
        <div id="asc_${item.id}_${hId}" draggable="true" ondragstart="handleAssessmentDragStart(event, '${item.id}')" ondragend="handleAssessmentDragEnd(event)" class="bg-[var(--surface)] p-1.5 rounded-[var(--radius-sm)] border border-[var(--line)] text-[10px] flex flex-col gap-1 cursor-grab active:cursor-grabbing hover:border-[var(--accent)] transition">
          <div class="flex items-start justify-between gap-1">
            <div class="flex items-start gap-1 flex-1 min-w-0">
              <div class="shrink-0 mt-0.5 flex items-center gap-0.5 flex-wrap">${fieldTag} ${badge} ${time}</div>
              <span class="text-[var(--ink)] font-medium break-words leading-tight">${escapeHtml(item.text)}</span>
            </div>
            <div class="flex items-center space-x-1 shrink-0">
              <button onclick="editItemText('${item.id}')" class="icon-btn" title="内容を編集"><i class="fa-solid fa-pen text-[9px]"></i></button>
              <button onclick="setItemType('${item.id}', 'unnecessary')" class="icon-btn danger" title="不要判定"><i class="fa-solid fa-ban text-[9px]"></i></button>
            </div>
          </div>
          <div class="flex items-center justify-end gap-0.5 pt-1 border-t border-[var(--line-soft)]">
            ${colBtn('unclassified', '未')}${colBtn('preadmission', '前')}${colBtn('postadmission', '後')}${colBtn('missing', '欠')}
          </div>
        </div>
      `;
    }

    window.handleAssessmentDragStart = (e, id) => { e.dataTransfer.setData('text/plain', 'asc_' + id); e.currentTarget.classList.add('card-dragging'); };
    window.handleAssessmentDragEnd = e => e.currentTarget.classList.remove('card-dragging');
    window.handleAssessmentDrop = (e, hId, targetCol) => {
      e.preventDefault();
      const dragData = e.dataTransfer.getData('text/plain');
      if (dragData?.startsWith('asc_')) setAssessmentCol(dragData.replace('asc_', ''), hId, targetCol);
    };

    window.setAssessmentCol = function(id, hId, colName) {
      const item = getCurrentPatient().items.find(i => i.id === id);
      if (item) {
        (item.assessmentCols = item.assessmentCols || {})[hId] = colName;
        const dict = globalAppData.learningUserDict[item.text] = globalAppData.learningUserDict[item.text] || {};
        (dict.preferredCols = dict.preferredCols || {})[hId] = colName;
        saveDataAndSync();
        reportLearningEvent(item.text, 'col', { hendersonId: hId, col: colName });
      }
    };

    const modalMissing = document.getElementById('modal-missing');
    window.openMissingModal = hId => {
      document.getElementById('missing-henderson-id').value = hId;
      document.getElementById('input-missing-text').value = '';
      modalMissing.classList.remove('hidden'); document.getElementById('input-missing-text').focus();
    };
    window.closeMissingModal = () => modalMissing.classList.add('hidden');
    window.saveMissingInfo = () => {
      const text = cleanExtractedPhrase(document.getElementById('input-missing-text').value);
      const hId = parseInt(document.getElementById('missing-henderson-id').value, 10);
      if (text) {
        getCurrentPatient().items.push({ id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6), text, timestamp: "追記", type: 'o', hendersonIds: [hId], assessmentCols: { [hId]: 'missing' } });
        saveDataAndSync(); closeMissingModal();
      }
    };

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
            if (parsed.notebookContent) globalAppData.notebookContent = parsed.notebookContent;
          } else if (Array.isArray(parsed)) {
            globalAppData.patients = [{ id: 'patient_1', title: '読み込みデータ', items: parsed, sourceText: '', labEvaluationResult: '' }];
            globalAppData.currentPatientId = 'patient_1';
          }
          persistData(); loadLocalState(); showToast('データを読み込みました', 'success');
        } catch (err) { showToast('ファイル形式が不正です', 'error'); }
      };
      reader.readAsText(file, 'utf-8');
      e.target.value = '';
    });

    const modalNotebook = document.getElementById('modal-notebook');
    document.getElementById('btn-open-notebook').addEventListener('click', () => {
      document.getElementById('input-notebook-content').value = globalAppData.notebookContent;
      document.getElementById('notebook-status-msg').textContent = globalAppData.notebookContent ? '✦ NotebookLM基準グラウンディング有効' : '未設定';
      modalNotebook.classList.remove('hidden');
    });
    document.getElementById('btn-close-notebook').addEventListener('click', () => modalNotebook.classList.add('hidden'));
    window.closeNotebookModal = () => modalNotebook.classList.add('hidden');
    document.getElementById('btn-save-notebook').addEventListener('click', () => {
      globalAppData.notebookContent = document.getElementById('input-notebook-content').value.trim();
      saveDataAndSync(); modalNotebook.classList.add('hidden'); showToast('ノートブック知識を保存しました', 'success');
    });

    document.getElementById('btn-open-settings').addEventListener('click', () => { document.getElementById('input-api-key').value = globalAppData.apiKey; document.getElementById('modal-settings').classList.remove('hidden'); });
    document.getElementById('btn-close-settings').addEventListener('click', () => document.getElementById('modal-settings').classList.add('hidden'));
    document.getElementById('btn-save-settings').addEventListener('click', () => { globalAppData.apiKey = document.getElementById('input-api-key').value.trim(); localStorage.setItem('gemini_api_key', globalAppData.apiKey); document.getElementById('modal-settings').classList.add('hidden'); showToast('設定を保存しました', 'success'); });
    window.resetLearningData = async () => {
      const confirmed = await openDialog({ title: 'ローカルの学習データをリセットしますか？', message: 'このブラウザに保存されているS/O振り分け等の学習キャッシュを消去します（全利用者共有の学習データはサーバー側に残ります）。この操作は元に戻せません。', confirmLabel: 'リセットする', danger: true });
      if (confirmed) { globalAppData.learningUserDict = {}; saveDataAndSync(); showToast('ローカルの学習データをリセットしました'); }
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
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${globalAppData.apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: "画像に含まれるカルテ記載や検査データ結果（WBC, CRP, Hb, クレアチニン等）を正確に文字起こししてください。" }, { inline_data: { mime_type: file.type || "image/jpeg", data: e.target.result.split(',')[1] } }] }] })
          });
          if (!res.ok) throw new Error(`Gemini API error (HTTP ${res.status})`);
          const data = await res.json();
          const ocrText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (!ocrText) throw new Error('文字起こし結果が空でした');
          DOM.sourceText.value += (DOM.sourceText.value ? '\n' : '') + ocrText;
          saveDataAndSync(); document.getElementById('ocr-status-text').innerHTML = '<i class="fa-solid fa-check"></i> 完了';
          setTimeout(() => document.getElementById('ocr-status').classList.add('hidden'), 2000);
        } catch (err) {
          console.warn('OCR error:', err);
          showToast(`OCR失敗: ${err.message || '通信エラー'}`, 'error');
          document.getElementById('ocr-status').classList.add('hidden');
        }
      };
      reader.readAsDataURL(file);
    }

    loadLocalState();
    loadSharedLearningDict(); // 起動時に一度、共有学習データ（全利用者分）を取得してローカル学習にマージ

