    // 看護アセスメント支援システム：11-own-assessment.js（全11ファイルのうち 11 番目）
    // 自分で書くアセスメント：ヘンダーソン14項目ごとに「情報の解釈」「考えられる原因」「今後の見通し」を書き、
    // 根拠にしたS/Oカードを紐付ける。「確定」するたびに版として履歴に残し、そのあとに増えた情報・変わった根拠を
    // 知らせて「再評価」できるようにする。
    // （js/10 の起動の処理より後に読み込むため、最後に総合アセスメント表を描き直す）

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['11'] = '2026-10-06.14'; // 版（scripts/stamp-version.js が書き込む）

    // ==========================================================================
    // データの形（患者ごと。cp.myAssessments[欲求の番号]）
    // ------------------------------------------------------------------------
    //   interpretation / cause / outlook : 情報の解釈・考えられる原因・今後の見通し（書きかけも含む今の内容）
    //   evidenceIds    : 根拠にしたカードのID（並びは選んだ順）
    //   evidenceCache  : 根拠にしたカードの本文の控え（カードが消されても何を根拠にしていたか分かるように）
    //   revisionNote   : 再評価で変えたこと（任意。確定すると履歴に移る）
    //   acknowledged   : 「確認した（根拠にしない）」と押したカード {ID: そのときの本文}
    //   history        : 確定した版 [{version, confirmedAt, interpretation, cause, outlook, revisionNote,
    //                     evidence:[{id,type,text,label,removed}], knownItemIds}]（最大30版）
    //   aiFeedback / aiFeedbackAt : AIの助言（参考）
    //   updatedAt      : 最後に書き換えた日時（複数の端末で同時に書いたときは、欲求ごとに新しい方を使う。
    //                    server.js の mergeKeyedRecords・js/05 の mergeKeyedRecordsClient）
    // ==========================================================================
    const MY_ASSESSMENT_FIELDS = [
      { key: 'interpretation', label: '情報の解釈', icon: 'fa-magnifying-glass',
        placeholder: 'S/Oの情報から、この欲求が満たされているか・正常か異常かを判断して書きます。\n例：術後3日目まで排便がなく（O-2）、腸蠕動音も微弱（O-3）。「お腹が張る」（S-1）とあり、便秘の状態にある。' },
      { key: 'cause', label: '考えられる原因', icon: 'fa-diagram-project',
        placeholder: 'なぜその状態なのか、関係する要因（病気・治療・生活・気持ち）を書きます。\n例：床上安静による腸蠕動の低下、食事量の減少、看護師を呼ぶことへの遠慮。' },
      { key: 'outlook', label: '今後の見通し', icon: 'fa-route',
        placeholder: 'このままだとどうなりそうか、看護で何が必要かを書きます。\n例：便秘が続くと腹部膨満や食欲低下につながり、リハビリの意欲にも影響するおそれがある。排便のコントロールへの援助が必要。' }
    ];
    const MY_ASSESSMENT_HISTORY_MAX = 30;

    function getMyAssessment(cp, needId) {
      const all = cp && cp.myAssessments;
      return (all && typeof all === 'object' && all[needId]) || null;
    }
    function ensureMyAssessment(cp, needId) {
      if (!cp.myAssessments || typeof cp.myAssessments !== 'object' || Array.isArray(cp.myAssessments)) cp.myAssessments = {};
      let e = cp.myAssessments[needId];
      if (!e || typeof e !== 'object') e = cp.myAssessments[needId] = {};
      MY_ASSESSMENT_FIELDS.forEach(f => { if (typeof e[f.key] !== 'string') e[f.key] = ''; });
      if (!Array.isArray(e.evidenceIds)) e.evidenceIds = [];
      if (!e.evidenceCache || typeof e.evidenceCache !== 'object') e.evidenceCache = {};
      if (typeof e.revisionNote !== 'string') e.revisionNote = '';
      if (!e.acknowledged || typeof e.acknowledged !== 'object') e.acknowledged = {};
      if (!Array.isArray(e.history)) e.history = [];
      return e;
    }
    function myAssessmentHasContent(e) {
      return !!e && (MY_ASSESSMENT_FIELDS.some(f => String(e[f.key] || '').trim()) || (e.evidenceIds || []).length > 0 || (e.history || []).length > 0);
    }
    function lastConfirmedMyAssessment(e) {
      const h = e && Array.isArray(e.history) ? e.history : [];
      return h.length ? h[h.length - 1] : null;
    }
    // この欲求のカード（不要以外）と、そのうち実際の記録（「不足情報」欄以外）
    function myNeedItems(cp, needId) {
      return (cp.items || []).filter(i => i.type !== 'unnecessary' && (i.hendersonIds || []).includes(needId));
    }
    function myNeedRecordItems(cp, needId) {
      return myNeedItems(cp, needId).filter(i => (i.assessmentCols?.[needId] || 'unclassified') !== 'missing');
    }
    // 総合アセスメント表と同じ番号（S-1・O-2）
    function myEvidenceLabels(cp, needId) {
      return assessmentSeqLabels(myNeedItems(cp, needId), needId);
    }
    // 根拠のカード1枚の表示用の情報（カードが消された・不要にされたときは控えの本文を使う）
    function describeMyEvidence(cp, needId, id, labels, e) {
      const item = (cp.items || []).find(i => i.id === id);
      const cache = (e && e.evidenceCache && e.evidenceCache[id]) || {};
      if (!item || item.type === 'unnecessary') {
        return { id, removed: true, type: cache.type || '', text: cache.text || '（消されたカード）', label: cache.label || '', timestamp: cache.timestamp || '', otherNeeds: [] };
      }
      const inNeed = (item.hendersonIds || []).includes(needId);
      const label = (inNeed && labels[id]) || (item.type === 's' ? 'S' : item.type === 'o' ? 'O' : '未');
      return { id, removed: false, type: item.type, text: item.text, label, timestamp: item.timestamp || '', otherNeeds: inNeed ? [] : (item.hendersonIds || []).slice() };
    }
    function myEvidenceSortKey(cp, needId) {
      const order = new Map(assessmentDisplayOrder(myNeedItems(cp, needId)).map((i, k) => [i.id, k]));
      const pos = new Map((cp.items || []).map((i, k) => [i.id, k]));
      return id => (order.has(id) ? order.get(id) : 100000 + (pos.has(id) ? pos.get(id) : 100000));
    }

    // 根拠のカードを足す・外す（本文の控えも取っておく）
    function linkMyEvidenceIds(cp, needId, ids, now = new Date().toISOString()) {
      const e = ensureMyAssessment(cp, needId);
      const labels = myEvidenceLabels(cp, needId);
      let added = 0;
      ids.forEach(id => {
        const item = (cp.items || []).find(i => i.id === id);
        if (!item || item.type === 'unnecessary') return;
        if (!e.evidenceIds.includes(id)) { e.evidenceIds.push(id); added++; }
        e.evidenceCache[id] = { text: item.text, type: item.type, timestamp: item.timestamp || '', label: labels[id] || '' };
      });
      if (added) {
        const key = myEvidenceSortKey(cp, needId);
        e.evidenceIds.sort((a, b) => key(a) - key(b));
        e.updatedAt = now;
      }
      return added;
    }
    function unlinkMyEvidenceId(cp, needId, id, now = new Date().toISOString()) {
      const e = ensureMyAssessment(cp, needId);
      const before = e.evidenceIds.length;
      e.evidenceIds = e.evidenceIds.filter(x => x !== id);
      if (e.evidenceIds.length === before) return false;
      delete e.evidenceCache[id];
      e.updatedAt = now;
      return true;
    }
    function setMyEvidenceIds(cp, needId, ids, now = new Date().toISOString()) {
      const e = ensureMyAssessment(cp, needId);
      const keep = new Set(ids);
      const removed = e.evidenceIds.filter(id => !keep.has(id));
      removed.forEach(id => { delete e.evidenceCache[id]; });
      e.evidenceIds = e.evidenceIds.filter(id => keep.has(id));
      const added = linkMyEvidenceIds(cp, needId, ids, now);
      if (removed.length && !added) e.updatedAt = now;
      return { added, removed: removed.length };
    }

    // 前回確定した版と比べた、今の状態
    //   dirty            : 確定したあとに書き換えた（または一度も確定していない書きかけがある）
    //   newItems         : 前回の確定のあとにこの欲求に増えたカード（根拠にした・「確認した」を押したものは除く）
    //   changedEvidence  : 前回の確定のあとに本文が変わった根拠のカード
    //   removedEvidence  : 根拠にしているのに、消された・不要にされたカード
    function myAssessmentStatus(cp, needId) {
      const e = getMyAssessment(cp, needId);
      const last = lastConfirmedMyAssessment(e);
      const res = { version: last ? (last.version || (e.history || []).length) : 0, confirmedAt: last ? last.confirmedAt : null, dirty: false, newItems: [], changedEvidence: [], removedEvidence: [] };
      if (!e) return res;
      const byId = new Map((cp.items || []).map(i => [i.id, i]));
      const evIds = Array.isArray(e.evidenceIds) ? e.evidenceIds : [];
      const ack = e.acknowledged || {};
      evIds.forEach(id => {
        const item = byId.get(id);
        if (!item || item.type === 'unnecessary') res.removedEvidence.push({ id, text: (e.evidenceCache?.[id]?.text) || '（消されたカード）' });
      });
      if (!last) {
        res.dirty = myAssessmentHasContent(e);
        return res;
      }
      const same = MY_ASSESSMENT_FIELDS.every(f => String(e[f.key] || '').trim() === String(last[f.key] || '').trim())
        && JSON.stringify(evIds.slice().sort()) === JSON.stringify((last.evidence || []).map(x => x.id).sort());
      res.dirty = !same || !!String(e.revisionNote || '').trim();
      const known = new Set(last.knownItemIds || []);
      res.newItems = myNeedRecordItems(cp, needId).filter(i => !known.has(i.id) && !evIds.includes(i.id) && !(i.id in ack));
      (last.evidence || []).forEach(ev => {
        const item = byId.get(ev.id);
        if (!item || item.type === 'unnecessary' || !evIds.includes(ev.id)) return;
        if (item.text !== ev.text && ack[ev.id] !== item.text) res.changedEvidence.push({ id: ev.id, before: ev.text, after: item.text });
      });
      return res;
    }
    function myAssessmentNeedsReview(st) {
      return st.version > 0 && (st.newItems.length + st.changedEvidence.length + st.removedEvidence.length) > 0;
    }

    // 「確定」：今の内容を1つの版として履歴に残す（2回目からは「再評価」）
    function confirmMyAssessmentEntry(cp, needId, now = new Date().toISOString()) {
      const e = ensureMyAssessment(cp, needId);
      if (!MY_ASSESSMENT_FIELDS.some(f => e[f.key].trim()) && e.evidenceIds.length === 0) return null;
      const labels = myEvidenceLabels(cp, needId);
      const prev = lastConfirmedMyAssessment(e);
      const entry = {
        version: (prev ? (prev.version || e.history.length) : 0) + 1,
        confirmedAt: now,
        interpretation: e.interpretation.trim(),
        cause: e.cause.trim(),
        outlook: e.outlook.trim(),
        revisionNote: e.revisionNote.trim(),
        evidence: e.evidenceIds.map(id => {
          const d = describeMyEvidence(cp, needId, id, labels, e);
          return { id, type: d.type, text: d.text, label: d.label, removed: d.removed };
        }),
        knownItemIds: myNeedRecordItems(cp, needId).map(i => i.id)
      };
      e.history = [...e.history, entry].slice(-MY_ASSESSMENT_HISTORY_MAX);
      e.revisionNote = '';
      e.acknowledged = {};
      e.updatedAt = now;
      return entry;
    }
    // 履歴の版の内容を、今の書きかけに戻す（確定はしない）
    function restoreMyAssessmentFromHistory(cp, needId, version, now = new Date().toISOString()) {
      const e = ensureMyAssessment(cp, needId);
      const h = e.history.find(x => x.version === version);
      if (!h) return false;
      MY_ASSESSMENT_FIELDS.forEach(f => { e[f.key] = h[f.key] || ''; });
      e.evidenceIds = [];
      e.evidenceCache = {};
      (h.evidence || []).forEach(ev => {
        e.evidenceIds.push(ev.id);
        e.evidenceCache[ev.id] = { text: ev.text, type: ev.type, label: ev.label || '' };
      });
      e.updatedAt = now;
      return true;
    }
    // 版どうしで変わった所（履歴の表示用）
    function diffMyAssessmentVersions(prev, cur) {
      const changedFields = MY_ASSESSMENT_FIELDS.filter(f => String((prev && prev[f.key]) || '') !== String(cur[f.key] || '')).map(f => f.label);
      const prevIds = new Set(((prev && prev.evidence) || []).map(x => x.id));
      const curIds = new Set((cur.evidence || []).map(x => x.id));
      return {
        changedFields,
        addedEvidence: (cur.evidence || []).filter(x => !prevIds.has(x.id)),
        removedEvidence: ((prev && prev.evidence) || []).filter(x => !curIds.has(x.id))
      };
    }

    // 書いた内容の見直し（AIなし）：抜けやすい所を知らせる
    //   level: 'warn'（直した方がよい）/ 'info'（見直すとよい）/ 'ok'
    //   itemId があるものは「根拠に加える」ボタンを出す
    function reviewMyAssessment(cp, needId) {
      const e = getMyAssessment(cp, needId);
      const hints = [];
      const need = myNeedItems(cp, needId);
      const records = myNeedRecordItems(cp, needId);
      const labels = myEvidenceLabels(cp, needId);
      const filled = key => !!(e && String(e[key] || '').trim());
      if (!e || (!MY_ASSESSMENT_FIELDS.some(f => filled(f.key)) && !(e.evidenceIds || []).length)) {
        if (records.length) hints.push({ level: 'info', text: '表のS/Oのカードを見て、まず「情報の解釈」から書いてみましょう。根拠にしたカードは「根拠のカードを選ぶ」で紐付けます。' });
        else hints.push({ level: 'info', text: 'この項目にはまだカードがありません。情報が無いこと自体が「不足情報」です。何を確かめるとよいか考えてみましょう。' });
        return hints;
      }
      const evIds = new Set(e.evidenceIds || []);
      const byId = new Map((cp.items || []).map(i => [i.id, i]));
      if (!filled('interpretation')) hints.push({ level: 'warn', text: '「情報の解釈」が空です。S/Oの情報から、この欲求が満たされているかどうかを判断して書きましょう。' });
      else if (e.interpretation.trim().length < 20) hints.push({ level: 'info', text: '「情報の解釈」が短めです。「〇〇（S-1）や△△（O-2）から、□□と考える」のように、根拠と判断をつなげて書きましょう。' });
      if (!filled('cause')) hints.push({ level: 'info', text: '「考えられる原因」が空です（問題が無いと判断したときは、そう判断した理由を書きます）。' });
      if (!filled('outlook')) hints.push({ level: 'info', text: '「今後の見通し」が空です。このままだとどうなりそうか、看護で何が必要かを書きましょう。' });
      if (evIds.size === 0) hints.push({ level: 'warn', text: '根拠のカードが選ばれていません。解釈のもとにしたS/Oのカードを選びましょう。' });
      else {
        const types = new Set(Array.from(evIds).map(id => byId.get(id)?.type).filter(Boolean));
        const hasS = records.some(i => i.type === 's'), hasO = records.some(i => i.type === 'o');
        if (hasS && hasO && types.has('s') !== types.has('o')) {
          hints.push({ level: 'info', text: types.has('s') ? '根拠がSデータ（患者の言葉）だけです。観察・検査（Oデータ）も合わせると解釈に説得力が出ます。' : '根拠がOデータ（観察・検査）だけです。患者の言葉（Sデータ）も合わせると、本人の受け止めも踏まえた解釈になります。' });
        }
      }
      // 本文に書いた S-1・O-2 が根拠に入っているか
      const labelToId = new Map(Object.entries(labels).map(([id, l]) => [l, id]));
      const text = MY_ASSESSMENT_FIELDS.map(f => (e[f.key] || '')).join('\n');
      const cited = Array.from(new Set((text.normalize('NFKC').match(/[SO]\s*-\s*\d{1,3}/g) || []).map(s => s.replace(/\s+/g, ''))));
      cited.forEach(l => {
        const id = labelToId.get(l);
        if (id && !evIds.has(id)) hints.push({ level: 'info', text: `本文に書いた ${l}「${shortText(byId.get(id)?.text, 24)}」が根拠のカードに入っていません。`, itemId: id });
        else if (!id) hints.push({ level: 'info', text: `本文の ${l} はこの項目の表にありません（番号は表のカードの並びで変わります）。` });
      });
      // 基準値を外れた検査値の見落とし
      records.filter(i => i.type === 'o' && !evIds.has(i.id)).forEach(i => {
        let r = null;
        try { r = evaluateLabFindings([i]); } catch (err) { r = null; }
        (r && r.findings || []).forEach(f => {
          hints.push({ level: 'warn', text: `基準値を外れた検査値 ${labels[i.id] || 'O'}「${f.label} ${formatMyNumber(f.value)}${f.unit ? ' ' + f.unit : ''} ${f.direction === 'high' ? '↑' : '↓'}」が根拠に入っていません。`, itemId: i.id });
        });
      });
      const missing = need.filter(i => (i.assessmentCols?.[needId] || 'unclassified') === 'missing');
      const unchecked = missing.filter(i => typeof missingCheckStatus !== 'function' || missingCheckStatus(cp, i.id) === 'unchecked');
      const checked = missing.filter(i => typeof missingCheckStatus === 'function' && missingCheckStatus(cp, i.id) === 'checked');
      if (unchecked.length) hints.push({ level: 'info', text: `この項目には、まだ確かめていない不足情報が${unchecked.length}件あります。確かめられたら、解釈と見通しを見直しましょう。` });
      if (checked.length) hints.push({ level: 'info', text: `不足情報のうち${checked.length}件は確認済みです。確認結果を解釈・見通しに反映できているか見直しましょう。` });
      const st = myAssessmentStatus(cp, needId);
      st.removedEvidence.forEach(r => hints.push({ level: 'warn', text: `根拠にしていたカード「${shortText(r.text, 24)}」が消されたか、不要にされました。根拠から外すか、別のカードを選びましょう。` }));
      if (!hints.length) hints.push({ level: 'ok', text: '書くべき所はそろっています。' });
      return hints;
    }
    function shortText(s, n) {
      s = String(s || '');
      return s.length > n ? s.slice(0, n) + '…' : s;
    }
    function formatMyNumber(v) {
      if (!Number.isFinite(v)) return String(v);
      return Math.abs(v) >= 1000 ? v.toLocaleString('ja-JP') : String(Math.round(v * 100) / 100);
    }
    function formatMyDateTime(iso) {
      const d = iso ? new Date(iso) : null;
      if (!d || Number.isNaN(d.getTime())) return '';
      const pad = n => String(n).padStart(2, '0');
      return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    // AIの指示文・書き出し用：自分のアセスメントを文章にする（書いてある項目だけ）
    function buildMyAssessmentsText(cp, { withEvidence = true } = {}) {
      return HENDERSON_NEEDS.map(need => {
        const e = getMyAssessment(cp, need.id);
        if (!e || !MY_ASSESSMENT_FIELDS.some(f => String(e[f.key] || '').trim())) return null;
        const labels = myEvidenceLabels(cp, need.id);
        const lines = [`${need.id}. ${need.name.replace(/^\d+\.\s*/, '')}`];
        MY_ASSESSMENT_FIELDS.forEach(f => { if (String(e[f.key] || '').trim()) lines.push(`${f.label}：${e[f.key].trim()}`); });
        if (withEvidence && (e.evidenceIds || []).length) {
          lines.push('根拠：' + e.evidenceIds.map(id => { const d = describeMyEvidence(cp, need.id, id, labels, e); return `${d.label}「${d.text}」${d.removed ? '（消されたカード）' : ''}`; }).join('／'));
        }
        return lines.join('\n');
      }).filter(Boolean).join('\n\n');
    }

    // ==========================================================================
    // 画面：総合アセスメント表の各欲求の行の下に「自分のアセスメント」の行を出す（js/09 の renderAssessmentTable から呼ぶ）
    // ==========================================================================
    // 「すべて」を表示しているときは、書いていない項目は1行にたたむ（開いた項目は覚えておく）
    const myAsmExpandedInAll = new Set();
    // 【自分のアセスメントを毎回挟まない】利用者からの指摘：「総合アセスメント表のページに毎回『自分のアセスメント』が
    // 挟まっているのがうざい」。既定では、表（「すべて」）の各欲求の間には出さず、1つの欲求のページでも下に1行だけ
    // （押すと開く）にする。右上の「自分のアセスメント」ボタンで、常に表示する形に切り替えられる（このブラウザに覚える）。
    let myAsmAlwaysShown = false;
    try { myAsmAlwaysShown = localStorage.getItem('nursing_my_asm_show') === 'on'; } catch (e) { /* 覚えられなくても動く */ }
    function myAssessmentAlwaysShown() { return myAsmAlwaysShown; }
    function updateMyAsmShowButton() {
      const btn = document.getElementById('btn-my-asm-show');
      if (!btn) return;
      btn.setAttribute('aria-pressed', String(myAsmAlwaysShown));
      btn.classList.toggle('is-on', myAsmAlwaysShown);
      btn.title = myAsmAlwaysShown ? '自分のアセスメントを各欲求の下に表示しています（押すと1行だけにします）' : '自分のアセスメントは、1つの欲求のページの下に1行だけ出しています（押すと表の各欲求の下にも表示します）';
      const label = btn.querySelector('.my-asm-show-state');
      if (label) label.textContent = myAsmAlwaysShown ? '常に表示' : '1行だけ';
    }
    window.toggleMyAssessmentShown = function() {
      myAsmAlwaysShown = !myAsmAlwaysShown;
      try { localStorage.setItem('nursing_my_asm_show', myAsmAlwaysShown ? 'on' : 'off'); } catch (e) { /* 覚えられなくても動く */ }
      updateMyAsmShowButton();
      renderAssessmentTable();
    };
    const myAsmHistoryOpen = new Set();
    const myAsmReviewOpen = new Set();

    function renderMyAssessmentRowHtml(cp, need, isAllMode) {
      const needId = need.id;
      const e = getMyAssessment(cp, needId);
      const st = myAssessmentStatus(cp, needId);
      const labels = myEvidenceLabels(cp, needId);
      const needName = need.name.replace(/^\d+\.\s*/, '');
      const hasContent = myAssessmentHasContent(e);
      const collapsed = isAllMode && !myAsmExpandedInAll.has(needId);
      const stateHtml = myAssessmentStateHtml(st);
      const review = myAssessmentNeedsReview(st);

      if (collapsed) {
        const summary = hasContent
          ? escapeHtml(shortText(MY_ASSESSMENT_FIELDS.map(f => String(e[f.key] || '').trim()).filter(Boolean).join(' ／ '), 90)) || '（根拠のカードだけ選んであります）'
          : '<span class="my-asm-muted">まだ書いていません</span>';
        return `<div class="my-asm my-asm-collapsed${review ? ' my-asm-attn' : ''}">
          <button type="button" class="my-asm-toggle" onclick="toggleMyAssessment(${needId})" aria-expanded="false"><i class="fa-solid fa-chevron-right"></i> <i class="fa-solid fa-user-pen"></i> 自分のアセスメント</button>
          <span class="my-asm-summary">${summary}</span>
          <span id="my-asm-state-${needId}" class="my-asm-state">${stateHtml}</span>
        </div>`;
      }

      const fields = MY_ASSESSMENT_FIELDS.map(f => `
        <label class="my-asm-field">
          <span class="my-asm-label"><i class="fa-solid ${f.icon}"></i> ${f.label}</span>
          <textarea class="field my-asm-text" rows="4" data-my-asm-need="${needId}" data-my-asm-field="${f.key}" placeholder="${escapeHtml(f.placeholder)}" oninput="onMyAssessmentInput(${needId}, '${f.key}', this)">${escapeHtml((e && e[f.key]) || '')}</textarea>
        </label>`).join('');

      const evIds = (e && e.evidenceIds) || [];
      const chips = evIds.map(id => {
        const d = describeMyEvidence(cp, needId, id, labels, e);
        const other = d.otherNeeds.length ? `<span class="my-ev-other">${escapeHtml(d.otherNeeds.map(h => `${h}.${hendersonNameOf(h).replace(/^\d+\.\s*/, '')}`).join('・'))}</span>` : '';
        return `<span class="my-ev-chip my-ev-${d.removed ? 'removed' : escapeHtml(d.type || 'x')}" title="${escapeHtml((d.timestamp && d.timestamp !== '日時不明' ? `[${d.timestamp}] ` : '') + d.text)}">
          <button type="button" class="my-ev-main" onclick="flashAssessmentCard(${jsArg(id)}, ${needId})"><b>${escapeHtml(d.removed ? '消' : d.label)}</b>${other}<span class="my-ev-text">${escapeHtml(shortText(d.text, 28))}</span></button>
          <button type="button" class="my-ev-x" onclick="unlinkMyEvidence(${needId}, ${jsArg(id)})" title="根拠から外す" aria-label="根拠から外す"><i class="fa-solid fa-xmark"></i></button>
        </span>`;
      }).join('');

      const reviewHtml = st.version > 0 ? myAssessmentReviewHtml(cp, needId, st, labels, review) : '';
      const revisionField = st.version > 0 ? `
        <label class="my-asm-field my-asm-note">
          <span class="my-asm-label"><i class="fa-solid fa-rotate"></i> 再評価で変えたこと（任意）</span>
          <input type="text" class="field my-asm-text" data-my-asm-need="${needId}" data-my-asm-field="revisionNote" value="${escapeHtml((e && e.revisionNote) || '')}" placeholder="例：排便があり腹部膨満が消えたため、便秘の状態は改善したと判断を変えた" oninput="onMyAssessmentInput(${needId}, 'revisionNote', this)">
        </label>` : '';
      const confirmLabel = st.version > 0 ? `再評価として確定（第${st.version + 1}版）` : '評価を確定（第1版）';
      // 【レビューで発見】AIの助言は患者の記録にHTMLのまま保存され、共有先・ファイルから届いたものも表示するため、
      // 表示の前に sanitizeStoredHtml（js/05）で動く部品を取り除く（根拠のカードのIDを入れるボタンは jsArg で書く）。
      const ai = e && e.aiFeedback ? `
        <div class="my-asm-ai">
          <div class="my-asm-ai-head"><span><i class="fa-solid fa-wand-magic-sparkles"></i> AIの助言（参考）${e.aiFeedbackAt ? `・${escapeHtml(formatMyDateTime(e.aiFeedbackAt))}` : ''}</span><button type="button" class="my-asm-link" onclick="clearMyAssessmentAi(${needId})">閉じる</button></div>
          <div class="my-asm-ai-body">${sanitizeStoredHtml(e.aiFeedback)}</div>
        </div>` : '';
      const historyCount = (e && e.history || []).length;
      const history = historyCount && myAsmHistoryOpen.has(needId) ? myAssessmentHistoryHtml(cp, needId, e) : '';

      return `<div class="my-asm${review ? ' my-asm-attn' : ''}" ondragover="if(event.dataTransfer&&Array.from(event.dataTransfer.types||[]).includes('text/plain')){event.preventDefault();event.currentTarget.classList.add('my-asm-drop');}" ondragleave="event.currentTarget.classList.remove('my-asm-drop')" ondrop="handleMyAssessmentDrop(event, ${needId})">
        <div class="my-asm-head">
          ${isAllMode ? `<button type="button" class="my-asm-toggle" onclick="toggleMyAssessment(${needId})" aria-expanded="true"><i class="fa-solid fa-chevron-down"></i> <i class="fa-solid fa-user-pen"></i> 自分のアセスメント</button>` : `<span class="my-asm-title"><i class="fa-solid fa-user-pen"></i> 自分のアセスメント<small>${need.id}. ${escapeHtml(needName)}</small></span>`}
          <span id="my-asm-state-${needId}" class="my-asm-state">${stateHtml}</span>
          <span class="my-asm-tools">
            <button type="button" class="btn btn-outline my-asm-btn" onclick="askAiAboutMyAssessment(${needId})" title="書いたアセスメントと根拠のカードをAIに見てもらい、良い点・改善点の助言をもらいます（書き換えはしません）"><i class="fa-solid fa-wand-magic-sparkles"></i> AIに助言をもらう</button>
            ${historyCount ? `<button type="button" class="btn btn-outline my-asm-btn" onclick="toggleMyAssessmentHistory(${needId})" aria-expanded="${myAsmHistoryOpen.has(needId)}"><i class="fa-solid fa-clock-rotate-left"></i> 評価の履歴（${historyCount}）</button>` : ''}
          </span>
        </div>
        ${reviewHtml}
        <div class="my-asm-fields">${fields}</div>
        ${revisionField}
        <div class="my-asm-evidence">
          <span class="my-asm-label"><i class="fa-solid fa-link"></i> 根拠のカード（${evIds.length}）</span>
          <div class="my-ev-list">${chips || '<span class="my-asm-muted">まだ選んでいません。</span>'}</div>
          <div class="my-ev-actions">
            <button type="button" class="btn btn-outline my-asm-btn" onclick="openEvidencePicker(${needId})"><i class="fa-solid fa-plus"></i> 根拠のカードを選ぶ</button>
            <span class="my-asm-muted my-asm-hint-drag">表のカードをここへドラッグしても追加できます</span>
          </div>
        </div>
        <div id="my-asm-check-${needId}" class="my-asm-check">${myAssessmentCheckHtml(cp, needId)}</div>
        <div class="my-asm-foot">
          <button type="button" class="btn btn-primary my-asm-confirm" onclick="confirmMyAssessmentUI(${needId})" title="今の内容を1つの版として残します。あとで情報が増えたら、見直して再評価できます"><i class="fa-solid fa-check"></i> ${confirmLabel}</button>
          <span class="my-asm-muted">書いた内容は自動で保存されます。「確定」すると版として履歴に残ります。</span>
        </div>
        ${ai}
        ${history}
      </div>`;
    }

    function myAssessmentStateHtml(st) {
      const parts = [];
      if (st.version > 0) parts.push(`<span class="my-asm-badge ok"><i class="fa-solid fa-circle-check"></i> 第${st.version}版・${escapeHtml(formatMyDateTime(st.confirmedAt))} 確定</span>`);
      if (st.dirty) parts.push(`<span class="my-asm-badge draft"><i class="fa-solid fa-pen"></i> ${st.version > 0 ? '確定後に書き換えあり' : '書きかけ（未確定）'}</span>`);
      const n = st.version > 0 ? st.newItems.length + st.changedEvidence.length + st.removedEvidence.length : st.removedEvidence.length;
      if (n) parts.push(`<span class="my-asm-badge attn"><i class="fa-solid fa-bell"></i> ${st.version > 0 ? '再評価が必要' : '根拠の見直しが必要'}（${n}）</span>`);
      return parts.join('');
    }

    function myAssessmentCheckHtml(cp, needId) {
      const hints = reviewMyAssessment(cp, needId);
      const icon = { warn: 'fa-triangle-exclamation', info: 'fa-lightbulb', ok: 'fa-circle-check' };
      return `<div class="my-asm-label"><i class="fa-solid fa-list-check"></i> 見直しのポイント（AIなし）</div><ul>${hints.map(h => `<li class="my-hint my-hint-${h.level}"><i class="fa-solid ${icon[h.level]}"></i><span>${escapeHtml(h.text)}</span>${h.itemId ? `<button type="button" class="my-asm-link" onclick="linkMyEvidence(${needId}, ${jsArg(h.itemId)})">根拠に加える</button>` : ''}</li>`).join('')}</ul>`;
    }

    // 再評価のお知らせ：前回の確定のあとに増えた情報・変わった根拠を並べ、その場で根拠に加えられるようにする
    function myAssessmentReviewHtml(cp, needId, st, labels, review) {
      const e = getMyAssessment(cp, needId);
      const last = lastConfirmedMyAssessment(e);
      if (!review) return '';
      const open = myAsmReviewOpen.has(needId);
      const row = (i, extra = '') => `<li><span class="my-ev-chip my-ev-${escapeHtml(i.type || 'x')}"><button type="button" class="my-ev-main" onclick="flashAssessmentCard(${jsArg(i.id)}, ${needId})"><b>${escapeHtml(labels[i.id] || (i.type === 's' ? 'S' : 'O'))}</b><span class="my-ev-text">${escapeHtml(i.timestamp && i.timestamp !== '日時不明' ? `[${i.timestamp}] ` : '')}${escapeHtml(shortText(i.text, 60))}</span></button></span>${extra}
        <span class="my-review-actions"><button type="button" class="my-asm-link" onclick="linkMyEvidence(${needId}, ${jsArg(i.id)})">根拠に加える</button><button type="button" class="my-asm-link muted" onclick="acknowledgeMyAssessmentItem(${needId}, ${jsArg(i.id)})">確認した（根拠にしない）</button></span></li>`;
      const byId = new Map((cp.items || []).map(i => [i.id, i]));
      const newList = st.newItems.map(i => row(i)).join('');
      const changedList = st.changedEvidence.map(c => {
        const i = byId.get(c.id);
        return `<li><span class="my-ev-chip my-ev-${escapeHtml(i.type || 'x')}"><button type="button" class="my-ev-main" onclick="flashAssessmentCard(${jsArg(c.id)}, ${needId})"><b>${escapeHtml(labels[c.id] || 'O')}</b><span class="my-ev-text">${escapeHtml(shortText(c.after, 60))}</span></button></span><span class="my-review-before">前回：${escapeHtml(shortText(c.before, 40))}</span>
          <span class="my-review-actions"><button type="button" class="my-asm-link muted" onclick="acknowledgeMyAssessmentItem(${needId}, ${jsArg(c.id)})">確認した</button></span></li>`;
      }).join('');
      const removedList = st.removedEvidence.map(r => `<li><span class="my-ev-chip my-ev-removed"><span class="my-ev-main"><b>消</b><span class="my-ev-text">${escapeHtml(shortText(r.text, 60))}</span></span></span><span class="my-review-actions"><button type="button" class="my-asm-link" onclick="unlinkMyEvidence(${needId}, ${jsArg(r.id)})">根拠から外す</button></span></li>`).join('');
      const prevHtml = last ? `<details class="my-review-prev"${open ? ' open' : ''} ontoggle="toggleMyAssessmentReviewPrev(${needId}, this.open)"><summary>前回（第${last.version}版）の評価を見る</summary>${myAssessmentVersionBodyHtml(last)}</details>` : '';
      return `<div class="my-review">
        <div class="my-review-head"><i class="fa-solid fa-bell"></i> 前回の評価（第${st.version}版・${escapeHtml(formatMyDateTime(st.confirmedAt))}）のあとに、情報が変わりました。見直して再評価しましょう。</div>
        ${newList ? `<div class="my-review-sub">新しく増えた情報（${st.newItems.length}）</div><ul>${newList}</ul>` : ''}
        ${changedList ? `<div class="my-review-sub">内容が変わった根拠のカード（${st.changedEvidence.length}）</div><ul>${changedList}</ul>` : ''}
        ${removedList ? `<div class="my-review-sub">消された・不要にされた根拠のカード（${st.removedEvidence.length}）</div><ul>${removedList}</ul>` : ''}
        ${prevHtml}
      </div>`;
    }

    function myAssessmentVersionBodyHtml(h) {
      const f = MY_ASSESSMENT_FIELDS.map(x => h[x.key] ? `<div class="my-ver-field"><b>${x.label}</b><p>${escapeHtml(h[x.key])}</p></div>` : '').join('');
      const ev = (h.evidence || []).length ? `<div class="my-ver-field"><b>根拠</b><p>${(h.evidence || []).map(x => `${escapeHtml(x.label || (x.type === 's' ? 'S' : 'O'))}「${escapeHtml(shortText(x.text, 40))}」${x.removed ? '（消されたカード）' : ''}`).join('　')}</p></div>` : '';
      const note = h.revisionNote ? `<div class="my-ver-field"><b>再評価で変えたこと</b><p>${escapeHtml(h.revisionNote)}</p></div>` : '';
      return `<div class="my-ver-body">${note}${f}${ev}</div>`;
    }

    function myAssessmentHistoryHtml(cp, needId, e) {
      const hist = e.history || [];
      const items = hist.slice().reverse().map(h => {
        const idx = hist.indexOf(h);
        const d = diffMyAssessmentVersions(idx > 0 ? hist[idx - 1] : null, h);
        const changes = idx > 0 ? [
          d.changedFields.length ? `変えた所：${d.changedFields.join('・')}` : '文章の変更なし',
          d.addedEvidence.length ? `根拠を追加：${d.addedEvidence.map(x => x.label || x.type.toUpperCase()).join('・')}` : '',
          d.removedEvidence.length ? `根拠を外した：${d.removedEvidence.map(x => x.label || x.type.toUpperCase()).join('・')}` : ''
        ].filter(Boolean).join('／') : '最初の評価';
        return `<li class="my-ver">
          <div class="my-ver-head"><b>第${h.version}版</b><span>${escapeHtml(formatMyDateTime(h.confirmedAt))}</span><span class="my-asm-muted">${escapeHtml(changes)}</span>
            <button type="button" class="my-asm-link" onclick="restoreMyAssessmentVersion(${needId}, ${h.version})" title="この版の文章と根拠を、今の書きかけに写します（確定はしません）">この版の内容に戻す</button></div>
          ${myAssessmentVersionBodyHtml(h)}
        </li>`;
      }).join('');
      return `<div class="my-history"><div class="my-asm-label"><i class="fa-solid fa-clock-rotate-left"></i> 評価の履歴（新しい順）</div><ul>${items}</ul></div>`;
    }

    // ==========================================================================
    // 画面の操作
    // ==========================================================================
    // 書いたそばからデータに入れ、保存（この端末＋サーバー）は少し待ってまとめて行う。
    // 表を描き直さないので、書いている途中で入力欄がリセットされない。
    const myAsmSaveTimers = {};
    function saveMyAssessmentsSoon(patientId, delay = 700) {
      if (myAsmSaveTimers[patientId]) clearTimeout(myAsmSaveTimers[patientId]);
      myAsmSaveTimers[patientId] = setTimeout(() => { delete myAsmSaveTimers[patientId]; saveMyAssessmentsNow(patientId); }, delay);
    }
    function saveMyAssessmentsNow(patientId) {
      const cp = globalAppData.patients.find(p => p.id === patientId);
      if (!cp) return;
      cp.updatedAt = new Date().toISOString();
      savePatientsLocally();
      schedulePatientSync(patientId);
      if (getCurrentPatient().id === patientId) { updateSaveStatus('saving'); updateCurrentPatientMeta(); }
    }
    // 保存を待っている分があれば、すぐに保存する（患者の切り替え・ページを閉じる前）
    function flushMyAssessmentSaves() {
      Object.keys(myAsmSaveTimers).forEach(id => { clearTimeout(myAsmSaveTimers[id]); delete myAsmSaveTimers[id]; saveMyAssessmentsNow(id); });
    }
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('beforeunload', flushMyAssessmentSaves);

    function refreshMyAssessmentSideInfo(cp, needId) {
      const stEl = document.getElementById(`my-asm-state-${needId}`);
      if (stEl) stEl.innerHTML = myAssessmentStateHtml(myAssessmentStatus(cp, needId));
      const ck = document.getElementById(`my-asm-check-${needId}`);
      if (ck) ck.innerHTML = myAssessmentCheckHtml(cp, needId);
    }
    const myAsmCheckTimers = {};
    window.onMyAssessmentInput = function(needId, field, el) {
      const cp = getCurrentPatient();
      const e = ensureMyAssessment(cp, needId);
      e[field] = el.value;
      e.updatedAt = new Date().toISOString();
      saveMyAssessmentsSoon(cp.id);
      if (myAsmCheckTimers[needId]) clearTimeout(myAsmCheckTimers[needId]);
      myAsmCheckTimers[needId] = setTimeout(() => { delete myAsmCheckTimers[needId]; refreshMyAssessmentSideInfo(getCurrentPatient(), needId); }, 500);
    };
    // 表を描き直すとき、書いている途中の入力欄のカーソルの位置を保つ（js/09 の renderAssessmentTable から呼ぶ）
    function captureMyAssessmentFocus() {
      const a = document.activeElement;
      if (!a || !a.dataset || !a.dataset.myAsmField) return null;
      return { need: a.dataset.myAsmNeed, field: a.dataset.myAsmField, start: a.selectionStart, end: a.selectionEnd, scroll: a.scrollTop };
    }
    function restoreMyAssessmentFocus(f) {
      if (!f) return;
      const el = document.querySelector(`[data-my-asm-need="${f.need}"][data-my-asm-field="${f.field}"]`);
      if (!el || typeof el.focus !== 'function') return;
      el.focus();
      try { el.setSelectionRange(f.start, f.end); el.scrollTop = f.scroll; } catch (err) { /* 位置を戻せなくても入力は続けられる */ }
    }
    function rerenderMyAssessment() {
      renderAssessmentTable();
    }
    function commitMyAssessmentChange(cp) {
      saveMyAssessmentsSoon(cp.id, 0);
      rerenderMyAssessment();
    }

    window.toggleMyAssessment = function(needId) {
      if (myAsmExpandedInAll.has(needId)) myAsmExpandedInAll.delete(needId); else myAsmExpandedInAll.add(needId);
      rerenderMyAssessment();
    };
    window.toggleMyAssessmentHistory = function(needId) {
      if (myAsmHistoryOpen.has(needId)) myAsmHistoryOpen.delete(needId); else myAsmHistoryOpen.add(needId);
      rerenderMyAssessment();
    };
    window.toggleMyAssessmentReviewPrev = function(needId, open) {
      if (open) myAsmReviewOpen.add(needId); else myAsmReviewOpen.delete(needId);
    };
    window.linkMyEvidence = function(needId, itemId) {
      const cp = getCurrentPatient();
      if (linkMyEvidenceIds(cp, needId, [itemId])) {
        commitMyAssessmentChange(cp);
        showToast('根拠のカードに加えました', 'success');
      } else rerenderMyAssessment();
    };
    window.unlinkMyEvidence = function(needId, itemId) {
      const cp = getCurrentPatient();
      if (unlinkMyEvidenceId(cp, needId, itemId)) commitMyAssessmentChange(cp);
    };
    // 総合アセスメント表のカードの「根拠」ボタン：根拠に入っていれば外し、無ければ加える
    window.toggleMyEvidence = function(needId, itemId) {
      const e = getMyAssessment(getCurrentPatient(), needId);
      if (e && (e.evidenceIds || []).includes(itemId)) window.unlinkMyEvidence(needId, itemId);
      else window.linkMyEvidence(needId, itemId);
    };
    function myEvidenceIdSet(cp, needId) {
      const e = getMyAssessment(cp, needId);
      return new Set((e && e.evidenceIds) || []);
    }
    window.acknowledgeMyAssessmentItem = function(needId, itemId) {
      const cp = getCurrentPatient();
      const e = ensureMyAssessment(cp, needId);
      const item = (cp.items || []).find(i => i.id === itemId);
      e.acknowledged[itemId] = item ? item.text : '';
      e.updatedAt = new Date().toISOString();
      commitMyAssessmentChange(cp);
    };
    window.handleMyAssessmentDrop = function(ev, needId) {
      ev.preventDefault();
      ev.stopPropagation();
      ev.currentTarget.classList.remove('my-asm-drop');
      const data = ev.dataTransfer.getData('text/plain') || '';
      const id = data.startsWith('asc_') ? data.slice(4) : data;
      if (id) window.linkMyEvidence(needId, id);
    };
    window.confirmMyAssessmentUI = function(needId) {
      const cp = getCurrentPatient();
      const entry = confirmMyAssessmentEntry(cp, needId);
      if (!entry) return showToast('まだ何も書いていません。「情報の解釈」などを書いてから確定してください', 'warn');
      commitMyAssessmentChange(cp);
      showToast(entry.version > 1 ? `再評価として第${entry.version}版を確定しました` : '評価を確定しました（第1版）。あとで情報が増えたら、ここでお知らせします', 'success');
    };
    window.restoreMyAssessmentVersion = async function(needId, version) {
      const ok = await openDialog({ title: `第${version}版の内容に戻しますか？`, message: '今の書きかけの文章と根拠のカードが、その版の内容に置き換わります（確定はしません）。', confirmLabel: '戻す' });
      if (ok !== true) return;
      const cp = getCurrentPatient();
      if (restoreMyAssessmentFromHistory(cp, needId, version)) {
        commitMyAssessmentChange(cp);
        showToast(`第${version}版の内容を書きかけに写しました`, 'info');
      }
    };
    window.clearMyAssessmentAi = function(needId) {
      const cp = getCurrentPatient();
      const e = ensureMyAssessment(cp, needId);
      e.aiFeedback = '';
      e.aiFeedbackAt = null;
      e.updatedAt = new Date().toISOString();
      commitMyAssessmentChange(cp);
    };
    // 根拠のカードを、総合アセスメント表の中で光らせる（その欲求の行が隠れていれば表示を切り替える）
    window.flashAssessmentCard = function(itemId, needId) {
      const cp = getCurrentPatient();
      const item = (cp.items || []).find(i => i.id === itemId);
      if (!item || item.type === 'unnecessary') return showToast('このカードは消されたか、不要にされています', 'info');
      if (!(item.hendersonIds || []).includes(needId)) return jumpToBoardCard(itemId);
      const el = document.getElementById(`asc_${itemId}_${needId}`);
      if (!el) return jumpToBoardCard(itemId);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('card-flash');
      setTimeout(() => el.classList.remove('card-flash'), 1600);
    };

    // ---- 根拠のカードを選ぶ画面 ----
    let evidencePicker = null; // { needId, selected:Set }
    window.openEvidencePicker = function(needId) {
      const cp = getCurrentPatient();
      const e = getMyAssessment(cp, needId);
      evidencePicker = { needId, selected: new Set((e && e.evidenceIds) || []), filter: 'all', openDays: null };
      const title = document.getElementById('evidence-picker-title');
      if (title) title.textContent = `根拠にするカードを選ぶ：${hendersonNameOf(needId)}`;
      const search = document.getElementById('evidence-picker-search');
      if (search) search.value = '';
      const all = document.getElementById('evidence-picker-all');
      if (all) all.checked = false;
      renderEvidencePickerList();
      document.getElementById('modal-evidence-picker').classList.remove('hidden');
    };
    window.closeEvidencePicker = function() {
      evidencePicker = null;
      document.getElementById('modal-evidence-picker').classList.add('hidden');
    };
    // 選べるカードの一覧：この欲求のカード（表と同じ順・同じ番号）。「ほかの項目のカードも表示」でS/Oすべて
    function evidencePickerCandidates(cp, needId, { includeOthers = false, query = '' } = {}) {
      const labels = myEvidenceLabels(cp, needId);
      const own = assessmentDisplayOrder(myNeedRecordItems(cp, needId));
      const others = includeOthers ? (cp.items || []).filter(i => (i.type === 's' || i.type === 'o') && !(i.hendersonIds || []).includes(needId)) : [];
      const q = String(query || '').trim().toLowerCase();
      const match = i => !q || String(i.text || '').toLowerCase().includes(q) || String(i.timestamp || '').toLowerCase().includes(q);
      return [
        ...own.filter(match).map(i => ({ item: i, label: labels[i.id] || (i.type === 's' ? 'S' : i.type === 'o' ? 'O' : '未'), own: true })),
        ...others.filter(match).map(i => ({ item: i, label: i.type === 's' ? 'S' : 'O', own: false }))
      ];
    }
    // 【見やすさの改善】利用者から「根拠のカードを選ぶとき、多すぎて見づらい」。
    //   ・日ごとにまとめて、たためるようにする（最初は、選んだカード・おすすめのカードがある日と最後の日だけ開く）
    //   ・S／O／選んだカードだけ、で絞り込む
    //   ・本文は2行までにして、残りはマウスを重ねると全文
    //   ・選んだカードは上にまとめて表示し、そこから外せる
    //   ・本文に書いた番号（S-1など）のカードと、基準値を外れた検査値のカードに「おすすめ」の印
    function evidencePickerRecommended(cp, needId) {
      const out = new Map();
      const e = getMyAssessment(cp, needId);
      const labels = myEvidenceLabels(cp, needId);
      const labelToId = new Map(Object.entries(labels).map(([id, l]) => [l, id]));
      const text = e ? MY_ASSESSMENT_FIELDS.map(f => e[f.key] || '').join('\n').normalize('NFKC') : '';
      (text.match(/[SO]\s*-\s*\d{1,3}/g) || []).forEach(l => { const id = labelToId.get(l.replace(/\s+/g, '')); if (id) out.set(id, '本文で書いた番号'); });
      myNeedRecordItems(cp, needId).filter(i => i.type === 'o').forEach(i => {
        let r = null;
        try { r = evaluateLabFindings([i]); } catch (err) { r = null; }
        if (r && r.findings && r.findings.length && !out.has(i.id)) out.set(i.id, '基準値外');
      });
      return out;
    }
    window.setEvidencePickerFilter = function(f) {
      if (!evidencePicker) return;
      evidencePicker.filter = f;
      renderEvidencePickerList();
    };
    window.toggleEvidencePickerDay = function(day, open) {
      if (!evidencePicker) return;
      if (open) evidencePicker.openDays.add(day); else evidencePicker.openDays.delete(day);
    };
    window.renderEvidencePickerList = function() {
      if (!evidencePicker) return;
      const cp = getCurrentPatient();
      const includeOthers = !!document.getElementById('evidence-picker-all')?.checked;
      const query = document.getElementById('evidence-picker-search')?.value || '';
      const all = evidencePickerCandidates(cp, evidencePicker.needId, { includeOthers, query });
      const rec = evidencePickerRecommended(cp, evidencePicker.needId);
      const f = evidencePicker.filter || 'all';
      const sel = evidencePicker.selected;
      const list = all.filter(c => f === 'all' || (f === 'selected' ? sel.has(c.item.id) : f === 'recommended' ? rec.has(c.item.id) : c.item.type === f));
      const count = pred => all.filter(pred).length;
      const filters = document.getElementById('evidence-picker-filters');
      if (filters) {
        const b = (key, label, n) => `<button type="button" class="${f === key ? 'active' : ''}" onclick="setEvidencePickerFilter('${key}')">${label} <small>${n}</small></button>`;
        filters.innerHTML = b('all', 'すべて', all.length) + b('s', 'Sだけ', count(c => c.item.type === 's')) + b('o', 'Oだけ', count(c => c.item.type === 'o'))
          + (rec.size ? b('recommended', '<i class="fa-solid fa-star"></i> おすすめ', count(c => rec.has(c.item.id))) : '') + b('selected', '選んだカード', count(c => sel.has(c.item.id)));
      }
      // 選んだカード（上にまとめて表示・ここから外せる）
      const chosen = document.getElementById('evidence-picker-selected');
      if (chosen) {
        const byId = new Map(all.map(c => [c.item.id, c]));
        const e = getMyAssessment(cp, evidencePicker.needId);
        const labels = myEvidenceLabels(cp, evidencePicker.needId);
        chosen.innerHTML = sel.size ? Array.from(sel).map(id => {
          const c = byId.get(id);
          const d = c ? { label: c.label, text: c.item.text, type: c.item.type } : describeMyEvidence(cp, evidencePicker.needId, id, labels, e);
          return `<span class="my-ev-chip my-ev-${escapeHtml(d.type || 'x')}" title="${escapeHtml(d.text)}"><span class="my-ev-main"><b>${escapeHtml(d.label)}</b><span class="my-ev-text">${escapeHtml(shortText(d.text, 16))}</span></span><button type="button" class="my-ev-x" onclick="toggleEvidencePickerItem(${jsArg(id)}, false, true)" aria-label="外す"><i class="fa-solid fa-xmark"></i></button></span>`;
        }).join('') : '<span class="my-asm-muted">まだ選んでいません。下の一覧でカードに印を付けます。</span>';
      }
      const wrap = document.getElementById('evidence-picker-list');
      if (!list.length) {
        wrap.innerHTML = `<p class="my-asm-muted p-3">${query || f !== 'all' ? '当てはまるカードがありません。' : 'この項目のカードがありません。「ほかの項目のカードも表示」で選べます。'}</p>`;
        updateEvidencePickerCount();
        return;
      }
      // 日ごとにまとめる（ほかの項目のカードは最後にまとめる）
      const groups = [];
      const own = list.filter(c => c.own), others = list.filter(c => !c.own);
      groupItemsByDay(own.map(c => c.item)).forEach(g => groups.push({ day: g.day || '日時不明', items: g.items.map(i => own.find(c => c.item.id === i.id)) }));
      if (others.length) groups.push({ day: 'ほかの項目のカード', items: others });
      const filtering = !!query || f !== 'all';
      if (!evidencePicker.openDays) {
        evidencePicker.openDays = new Set(groups.filter(g => g.items.some(c => sel.has(c.item.id) || rec.has(c.item.id))).map(g => g.day));
        const lastOwn = groups.filter(g => g.day !== 'ほかの項目のカード').pop();
        if (lastOwn) evidencePicker.openDays.add(lastOwn.day);
        if (groups.length <= 2) groups.forEach(g => evidencePicker.openDays.add(g.day));
      }
      wrap.innerHTML = groups.map(g => {
        const nSel = g.items.filter(c => sel.has(c.item.id)).length;
        const nS = g.items.filter(c => c.item.type === 's').length, nO = g.items.filter(c => c.item.type === 'o').length;
        const open = filtering || evidencePicker.openDays.has(g.day);
        const rows = g.items.map(c => {
          const i = c.item;
          const tags = c.own ? '' : `<span class="my-ev-other">${escapeHtml((i.hendersonIds || []).map(h => `${h}.${hendersonNameOf(h).replace(/^\d+\.\s*/, '')}`).join('・') || 'タグなし')}</span>`;
          const clock = g.day === 'ほかの項目のカード' ? i.timestamp : timestampClockPart(i.timestamp);
          const star = rec.has(i.id) ? `<span class="ep-rec" title="${escapeHtml(rec.get(i.id))}"><i class="fa-solid fa-star"></i>${escapeHtml(rec.get(i.id))}</span>` : '';
          return `<label class="ep-row ep-${escapeHtml(i.type)}${sel.has(i.id) ? ' on' : ''}" title="${escapeHtml(i.text)}"><input type="checkbox" ${sel.has(i.id) ? 'checked' : ''} onchange="toggleEvidencePickerItem(${jsArg(i.id)}, this.checked)">
            <b class="ep-label">${escapeHtml(c.label)}</b>${tags}${clock && clock !== '日時不明' ? `<span class="ep-time">${escapeHtml(clock)}</span>` : ''}${star}<span class="ep-text">${escapeHtml(i.text)}</span></label>`;
        }).join('');
        return `<details class="ep-day"${open ? ' open' : ''} ontoggle="toggleEvidencePickerDay(${escapeHtml(JSON.stringify(g.day))}, this.open)">
          <summary><span class="ep-day-name">${escapeHtml(g.day)}</span><span class="ep-day-count">${nS ? `S ${nS}` : ''}${nS && nO ? '・' : ''}${nO ? `O ${nO}` : ''}</span>${nSel ? `<span class="ep-day-sel">選択 ${nSel}</span>` : ''}</summary>
          <div class="ep-day-rows">${rows}</div></details>`;
      }).join('');
      updateEvidencePickerCount();
    };
    window.toggleEvidencePickerItem = function(id, on, rerender = false) {
      if (!evidencePicker) return;
      if (on) evidencePicker.selected.add(id); else evidencePicker.selected.delete(id);
      // 印を付けた行の色・上の「選んだカード」・日ごとの選択数を描き直す（開いている日・スクロールの位置は保つ）
      const wrap = document.getElementById('evidence-picker-list');
      const top = wrap ? wrap.scrollTop : 0;
      renderEvidencePickerList();
      if (wrap) wrap.scrollTop = top;
      updateEvidencePickerCount();
    };
    function updateEvidencePickerCount() {
      const el = document.getElementById('evidence-picker-count');
      if (el && evidencePicker) el.textContent = `${evidencePicker.selected.size}枚を選んでいます`;
    }
    window.saveEvidencePicker = function() {
      if (!evidencePicker) return;
      const cp = getCurrentPatient();
      const { needId, selected } = evidencePicker;
      // 選び直した結果の並び：前からあったものは元の順、足したものは表の順
      const e = ensureMyAssessment(cp, needId);
      const ids = [...e.evidenceIds.filter(id => selected.has(id)), ...Array.from(selected).filter(id => !e.evidenceIds.includes(id))];
      setMyEvidenceIds(cp, needId, ids);
      closeEvidencePicker();
      commitMyAssessmentChange(cp);
    };

    // ---- AIに助言をもらう ----
    function buildMyAssessmentAiPrompt(cp, needId) {
      const need = HENDERSON_NEEDS.find(n => n.id === needId);
      const e = getMyAssessment(cp, needId);
      const evItems = (e.evidenceIds || []).map(id => (cp.items || []).find(i => i.id === id)).filter(i => i && i.type !== 'unnecessary');
      const evSet = new Set(evItems.map(i => i.id));
      const others = assessmentDisplayOrder(myNeedRecordItems(cp, needId)).filter(i => !evSet.has(i.id) && !isMissingInfoOnlyItem(i));
      const ev = buildEvidenceIndex([...evItems, ...others]);
      const missing = myNeedItems(cp, needId).filter(i => (i.assessmentCols?.[needId] || 'unclassified') === 'missing').map(i => `- ${i.text.replace(/^原因:\s*/, '')}`).join('\n');
      const field = key => String(e[key] || '').trim() || '（未記入）';
      return `あなたは看護学生の臨地実習を指導する、経験豊富な臨床指導者です。学生がヘンダーソンの基本的欲求「${need ? need.name : needId}」について書いたアセスメントを読み、良い点と改善点を具体的に助言してください。学生が自分で考えられるよう、書き直した全文は示さず、視点や問いかけで示してください。\n\n` +
        `観点：\n1) 根拠（S/Oデータ）と解釈がつながっているか、根拠から言えないことを言い過ぎていないか\n2) 見落としている情報・根拠にしていない重要な情報は無いか\n3) 考えられる原因が妥当か（病態・治療・生活・心理社会面）\n4) 今後の見通しが具体的か（起こりうるリスクと看護の必要性）\n\n` +
        `【学生のアセスメント】\n情報の解釈：${field('interpretation')}\n考えられる原因：${field('cause')}\n今後の見通し：${field('outlook')}\n\n` +
        `【学生が根拠に選んだカード】\n${evItems.map(i => evidenceLine(ev, i)).join('\n') || '（なし）'}\n\n` +
        `【この項目のほかのカード（学生は根拠にしていない）】\n${others.map(i => evidenceLine(ev, i)).join('\n') || '（なし）'}\n\n` +
        `【この項目の不足情報】\n${missing || '（なし）'}\n\n` +
        `出力：前置き・あいさつは書かないでください。最初に「### 要点」として、いちばん大事な助言を1〜2個の短い箇条書きで示し、そのあと「### 良い点」「### 改善点」「### 次に確かめるとよいこと」の3つの見出しで、それぞれ2〜4項目の「- 」の箇条書き（1項目1〜2文）にしてください。${EVIDENCE_INSTRUCTION}根拠のカードの番号は文の終わりの句点の後ろに付けてください。`;
    }
    window.askAiAboutMyAssessment = async function(needId) {
      const cp = getCurrentPatient();
      const e = getMyAssessment(cp, needId);
      if (!e || !MY_ASSESSMENT_FIELDS.some(f => String(e[f.key] || '').trim())) return showToast('先に「情報の解釈」などを書いてください。書いた内容にAIが助言します', 'warn');
      if (!(await requireApiKey('自分のアセスメントへのAIの助言'))) return;
      const patientId = cp.id;
      const evIndexItems = (() => {
        const evItems = (e.evidenceIds || []).map(id => (cp.items || []).find(i => i.id === id)).filter(i => i && i.type !== 'unnecessary');
        const evSet = new Set(evItems.map(i => i.id));
        return [...evItems, ...assessmentDisplayOrder(myNeedRecordItems(cp, needId)).filter(i => !evSet.has(i.id) && !isMissingInfoOnlyItem(i))];
      })();
      showToast('AIに助言を頼んでいます…', 'info');
      try {
        const text = await callGeminiAI([{ role: 'user', parts: [{ text: buildMyAssessmentAiPrompt(cp, needId) }] }]);
        const p = globalAppData.patients.find(x => x.id === patientId);
        if (!p) return;
        const entry = ensureMyAssessment(p, needId);
        entry.aiFeedback = formatAiResultHtml(text, 'AIから答えが返ってきませんでした。', buildEvidenceIndex(evIndexItems));
        entry.aiFeedbackAt = new Date().toISOString();
        entry.updatedAt = entry.aiFeedbackAt;
        saveMyAssessmentsSoon(patientId, 0);
        if (getCurrentPatient().id === patientId) rerenderMyAssessment();
        showToast('AIの助言を表示しました（参考です。最終的な判断はご自身で）', 'success');
      } catch (err) {
        console.warn('AIの助言の取得に失敗しました:', err);
        showToast(['AIの助言を受け取れませんでした', { text: `${err.message || '通信エラー'}　時間を置いてもう一度押してください。書いたアセスメントはそのまま残っています。`, detail: true }], 'error');
      }
    };

    // ---- 印刷・書き出し用（js/06 から呼ぶ） ----
    function buildMyAssessmentsPrintHtml(cp, startNo) {
      const rows = HENDERSON_NEEDS.map(need => {
        const e = getMyAssessment(cp, need.id);
        if (!e || !MY_ASSESSMENT_FIELDS.some(f => String(e[f.key] || '').trim())) return '';
        const labels = myEvidenceLabels(cp, need.id);
        const st = myAssessmentStatus(cp, need.id);
        const ev = (e.evidenceIds || []).map(id => { const d = describeMyEvidence(cp, need.id, id, labels, e); return `${escapeHtml(d.label)}${d.removed ? '（消）' : ''}`; }).join('・') || '—';
        const cell = key => String(e[key] || '').trim() ? escapeHtml(e[key].trim()).replace(/\n/g, '<br>') : '<span class="muted">—</span>';
        const ver = st.version ? `<br><span class="muted">第${st.version}版 ${escapeHtml(formatMyDateTime(st.confirmedAt))}${st.dirty ? '・確定後に変更あり' : ''}</span>` : '<br><span class="muted">未確定</span>';
        return `<tr><th scope="row" style="background:#f7f5f0;">${need.id}. ${escapeHtml(need.name.replace(/^\d+\.\s*/, ''))}${ver}</th><td>${cell('interpretation')}</td><td>${cell('cause')}</td><td>${cell('outlook')}</td><td>${ev}</td></tr>`;
      }).join('');
      if (!rows) return '';
      return `<h2>${startNo}. 自分のアセスメント</h2><table class="asm"><colgroup><col style="width:14%"><col style="width:30%"><col style="width:22%"><col style="width:24%"><col style="width:10%"></colgroup>
        <thead><tr><th>基本的欲求</th><th>情報の解釈</th><th>考えられる原因</th><th>今後の見通し</th><th>根拠</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="note">根拠の番号（S-1・O-1）は、総合アセスメント表の番号です。</p>`;
    }

    updateMyAsmShowButton();
    // 起動時：js/10 の起動の処理で一度描いた表を、自分のアセスメントの行つきで描き直す
    try { renderAssessmentTable(); } catch (err) { console.warn('総合アセスメント表を描き直せませんでした:', err); }

if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, {
    MY_ASSESSMENT_FIELDS,
    ensureMyAssessment, getMyAssessment, linkMyEvidenceIds, unlinkMyEvidenceId, setMyEvidenceIds,
    myAssessmentStatus, myAssessmentNeedsReview, confirmMyAssessmentEntry, restoreMyAssessmentFromHistory,
    diffMyAssessmentVersions, reviewMyAssessment, buildMyAssessmentsText, buildMyAssessmentsPrintHtml,
    renderMyAssessmentRowHtml, evidencePickerCandidates, buildMyAssessmentAiPrompt, myAssessmentAlwaysShown
  });
  if (module.exports.__testHooks) Object.assign(module.exports.__testHooks, { flushMyAssessmentSaves, saveMyAssessmentsSoon });
}
