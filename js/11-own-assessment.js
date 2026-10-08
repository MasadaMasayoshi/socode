    // 看護アセスメント支援システム：11-own-assessment.js（全11ファイルのうち 11 番目）
    // 自分で書くアセスメント：ヘンダーソン14項目ごとに「情報の解釈」「考えられる原因」「今後の見通し」を書き、
    // 根拠にしたS/Oカードを紐付ける。「確定」するたびに版として履歴に残し、そのあとに増えた情報・変わった根拠を
    // 知らせて「再評価」できるようにする。
    // （js/10 の起動の処理より後に読み込むため、最後に総合アセスメント表を描き直す）

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['11'] = '2026-10-08.19'; // 版（scripts/stamp-version.js が書き込む）

    // ==========================================================================
    // データの形（患者ごと。cp.myAssessments[欲求の番号]）
    // ------------------------------------------------------------------------
    //   interpretation / cause / outlook : 情報の解釈・考えられる原因・今後の見通し（書きかけも含む今の内容）
    //   evidenceIds    : 根拠にしたカードのID（並びは選んだ順）
    //   evidenceCache  : 根拠にしたカードの本文の控え（カードが消されても何を根拠にしていたか分かるように）
    //   sufficiency    : この欲求が「met（充足）」「unmet（未充足）」か、'' は未判定（総合アセスメント表の見出しで選ぶ）
    //   sufficiencyPre / sufficiencyPost : 入院前・入院後の充足・未充足（By も同じ形：sufficiencyPreBy / sufficiencyPostBy）
    //   sufficiencyBy  : 'user'（自分で選んだ）／'ai'（AIが入れた。AIの再判定で入れ替わる）
    //   aiSufficiency  : AIの判定 {verdict(met/unmet/unknown), reason, evidence:[カードID], need, at}
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
      ['sufficiency', 'sufficiencyPre', 'sufficiencyPost'].forEach(k => { if (e[k] !== 'met' && e[k] !== 'unmet') e[k] = ''; });
      if (typeof e.revisionNote !== 'string') e.revisionNote = '';
      if (!e.acknowledged || typeof e.acknowledged !== 'object') e.acknowledged = {};
      if (!Array.isArray(e.history)) e.history = [];
      return e;
    }
    function myAssessmentHasContent(e) {
      return !!e && (['sufficiency', 'sufficiencyPre', 'sufficiencyPost'].some(k => e[k] === 'met' || e[k] === 'unmet') || MY_ASSESSMENT_FIELDS.some(f => String(e[f.key] || '').trim()) || (e.evidenceIds || []).length > 0 || (e.history || []).length > 0);
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
        if (!e || !(sufficiencyHasVerdict(cp, need.id) || MY_ASSESSMENT_FIELDS.some(f => String(e[f.key] || '').trim()))) return null;
        const labels = myEvidenceLabels(cp, need.id);
        const lines = [`${need.id}. ${need.name.replace(/^\d+\.\s*/, '')}`];
        if (sufficiencyHasVerdict(cp, need.id)) SUFFICIENCY_UI_PHASES.forEach(ph => lines.push(`・${ph.label}：${SUFFICIENCY_LABELS[getSufficiency(cp, need.id, ph.key) || 'unknown']}　${sufficiencySentence(cp, need.id, ph.key)}`));
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
    // 2026-10-06.15：利用者からの要望「表示か非表示だけでいい」で、「1行だけ」をやめ「表示／非表示」の2つにした。
    let myAsmAlwaysShown = false;
    try { myAsmAlwaysShown = localStorage.getItem('nursing_my_asm_show') === 'on'; } catch (e) { /* 覚えられなくても動く */ }
    function myAssessmentAlwaysShown() { return myAsmAlwaysShown; }
    function updateMyAsmShowButton() {
      const btn = document.getElementById('btn-my-asm-show');
      if (!btn) return;
      btn.setAttribute('aria-pressed', String(myAsmAlwaysShown));
      btn.classList.toggle('is-on', myAsmAlwaysShown);
      btn.title = myAsmAlwaysShown ? '自分のアセスメントを各欲求の下に表示しています（押すと非表示にします）' : '自分のアセスメントを非表示にしています（押すと各欲求の下に表示します）';
      const label = btn.querySelector('.my-asm-show-state');
      if (label) label.textContent = myAsmAlwaysShown ? '表示' : '非表示';
    }
    window.toggleMyAssessmentShown = function() {
      myAsmAlwaysShown = !myAsmAlwaysShown;
      try { localStorage.setItem('nursing_my_asm_show', myAsmAlwaysShown ? 'on' : 'off'); } catch (e) { /* 覚えられなくても動く */ }
      updateMyAsmShowButton();
      renderAssessmentTable();
    };
    const myAsmHistoryOpen = new Set();
    const myAsmReviewOpen = new Set();

    // ==========================================================================
    // 充足・未充足：14項目ごとに「充足／未充足／未判定」を選ぶ（総合アセスメント表の各項目の見出しに出す。
    // 「自分のアセスメント」を非表示にしていても選べる）。結論を最初に明言する（参考データの「充足・未充足の判断」）ための印。
    // ==========================================================================
    const SUFFICIENCY_LABELS = { met: '充足', unmet: '未充足', conflict: '判定保留', unknown: '情報不足' };
    // 入院前・入院後・全体（総合）の3つについて、それぞれ充足／未充足を持つ。
    //   pre ：入院前（発症・入院の前の状態）／post：入院後（入院・手術・治療のあとの状態）／all：全体
    const SUFFICIENCY_PHASES = [
      { key: 'pre', label: '入院前', field: 'sufficiencyPre', by: 'sufficiencyPreBy' },
      { key: 'post', label: '入院後', field: 'sufficiencyPost', by: 'sufficiencyPostBy' },
      { key: 'all', label: '全体', field: 'sufficiency', by: 'sufficiencyBy' }
    ];
    // 画面・書き出しには「入院前」「入院後」を分けて出す（利用者の要望。全体は内部の集計とAIの評価だけに使う）
    const SUFFICIENCY_UI_PHASES = SUFFICIENCY_PHASES.filter(p => p.key !== 'all');
    function sufficiencyPhase(key) { return SUFFICIENCY_PHASES.find(p => p.key === key) || SUFFICIENCY_PHASES[2]; }
    // 充足・未充足はサイトが決める（記録の言葉と看護の基準だけ。AIなし）。利用者が選ぶ欄は無い
    const sufficiencyCache = { sig: '', res: null, cp: null };
    function ruleSufficiencyFor(cp) {
      const sig = (cp.items || []).map(i => `${i.id}|${i.type}|${String(i.text || '').length}|${(i.hendersonIds || []).join(',')}|${JSON.stringify(i.assessmentCols || {})}`).join(';');
      if (sufficiencyCache.cp === cp && sufficiencyCache.sig === sig && sufficiencyCache.res) return sufficiencyCache.res;
      let res = {};
      try { res = judgeSufficiencyByRules(cp); } catch (err) { console.warn('充足・未充足の判定に失敗しました:', err); }
      sufficiencyCache.cp = cp; sufficiencyCache.sig = sig; sufficiencyCache.res = res;
      return res;
    }
    function getSufficiency(cp, needId, phase = 'all') {
      const r = ruleSufficiencyFor(cp)[needId];
      const v = r && r[phase] && r[phase].verdict;
      return v === 'met' || v === 'unmet' ? v : '';
    }
    // 記録が足りない欄も「情報不足」と明示して出す（空欄にしない）ので、カードが1枚でもあれば、どの欲求にも結果がある
    function sufficiencyHasVerdict(cp, needId) {
      return (cp.items || []).some(i => i.type !== 'unnecessary') && !!ruleSufficiencyFor(cp)[needId];
    }
    // 書き出し・印刷用の短い文：「入院前：充足／入院後：未充足／全体：未充足」（選んである所だけ）
    // 教員の指導：「充足or未充足と言い切る」「何のリスクが考えられるかまで書く」。欲求ごとの、満たされないときに考えられる主なリスク
    const SUFFICIENCY_RISKS = {
      1: '誤嚥・無気肺・肺炎などの呼吸器合併症', 2: '低栄養・脱水・創傷治癒の遅れ', 3: '便秘・尿閉・腸閉塞（イレウス）', 4: '廃用症候群・深部静脈血栓症・転倒',
      5: '睡眠不足による疼痛の増強・せん妄', 6: '更衣困難による皮膚トラブル・保温不足', 7: '感染による発熱・体温調節の乱れ', 8: '感染・皮膚トラブル（褥瘡）',
      9: '転倒・転落・感染・事故', 10: '不安の増強・ニーズの把握の遅れ', 11: '精神的な苦痛の増強', 12: '役割の喪失・自己効力感の低下', 13: '気分転換の不足・活動意欲の低下',
      14: '自己管理の不足・退院後の合併症（脱臼・再発など）'
    };
    function sufficiencySentence(cp, needId, phase) {
      const r = ruleSufficiencyFor(cp)[needId];
      const a = r && r[phase];
      if (!a || !a.verdict) return '';
      const need = HENDERSON_NEEDS.find(n => n.id === needId);
      const name = need ? need.name.replace(/^\d+\.\s*/, '') : '';
      if (a.verdict === 'met') return `${a.reason}より、${name}は満たされているため、充足。`;
      if (a.verdict === 'unmet') {
        // 9.環境は、直接の根拠がある危険だけを書く（不安や痛みだけから、転倒と感染の両方を推測しない）
        let risk = SUFFICIENCY_RISKS[needId] || '合併症';
        if (needId === 9) {
          const rs = [];
          if (/転倒|転落|ふらつき|不安定|せん妄|不穏|めまい|介助|見守り|安静/.test(a.reason)) rs.push('転倒・転落');
          if (/ドレーン|チューブ|創部|ガーゼ|刺入部|挿入部|発赤|発熱|排膿|感染/.test(a.reason)) rs.push('感染');
          risk = rs.join('・');
        }
        return risk ? `${a.reason}より、${risk}のリスクが考えられるため、未充足。` : `${a.reason}より、環境面の問題があるため、未充足。`;
      }
      if (a.verdict === 'conflict') return `${a.reason}が並んでおり、どちらとも決められないため、判定保留。`;
      return a.need ? `${a.need}ため、情報不足。` : '記録が少なく判断できないため、情報不足。';
    }
    // 期間ごとの判定の表示用：met / unmet / conflict / unknown
    function phaseVerdictOf(cp, needId, phaseKey) {
      const r = ruleSufficiencyFor(cp)[needId];
      const v = r && r[phaseKey] && r[phaseKey].verdict;
      return v === 'met' || v === 'unmet' || v === 'conflict' ? v : 'unknown';
    }
    // 入院前・入院後それぞれの区画の中に出す判定（バッジ＋判定根拠＋根拠カードの番号）。カードが1枚も無い患者には出さない
    function sufficiencyPhaseHtml(cp, needId, phaseKey) {
      if (!sufficiencyHasVerdict(cp, needId)) return '';
      const ph = SUFFICIENCY_UI_PHASES.find(p => p.key === phaseKey);
      if (!ph) return '';
      const v = phaseVerdictOf(cp, needId, phaseKey);
      const a = ruleSufficiencyFor(cp)[needId][phaseKey] || {};
      const labels = myEvidenceLabels(cp, needId);
      // 判定は「カード」にせず、記録カードを引用して説明する文章として、区画の下に書く（情報カードと見分けがつくよう、枠・背景は付けない）
      const byId = new Map((cp.items || []).map(i => [i.id, i]));
      const refs = (a.evidence || []).map(id => {
        const it = byId.get(id); if (!it || !labels[id]) return '';
        const t = String(it.text || '').replace(/\s+/g, ' ').trim();
        const when = it.timestamp && it.timestamp !== '日時不明' ? `（${it.timestamp}）` : '';
        return `<span class="suf-ref"><b>${escapeHtml(labels[id])}</b>${escapeHtml(when)}「${escapeHtml(t.length > 36 ? t.slice(0, 36) + '…' : t)}」</span>`;
      }).filter(Boolean).join('');
      return `<div class="suf-explain suf-b-${v}" data-suf-phase="${phaseKey}"><div class="suf-explain-head">${ph.label}の説明：<span class="suf-word suf-${v}">${SUFFICIENCY_LABELS[v]}</span></div><p class="suf-explain-body">${escapeHtml(sufficiencySentence(cp, needId, phaseKey))}</p>${refs ? `<div class="suf-explain-refs"><span class="suf-explain-label">使ったカード</span>${refs}</div>` : ''}</div>`;
    }
    // 書き出し用：期間ごとの判定と根拠を1つの文にする
    function sufficiencyPhaseText(cp, needId, phaseKey) {
      if (!sufficiencyHasVerdict(cp, needId)) return '';
      return `判定：${SUFFICIENCY_LABELS[phaseVerdictOf(cp, needId, phaseKey)]}／判定根拠：${sufficiencySentence(cp, needId, phaseKey)}`;
    }
    function sufficiencyTextOf(cp, needId) {
      if (!sufficiencyHasVerdict(cp, needId)) return '';
      return SUFFICIENCY_UI_PHASES.map(ph => `${ph.label}：${SUFFICIENCY_LABELS[phaseVerdictOf(cp, needId, ph.key)]}`).join('／');
    }
    function sufficiencyControlHtml(cp, needId) {
      const rows = SUFFICIENCY_UI_PHASES.map(ph => {
        const cur = getSufficiency(cp, needId, ph.key);
        const label = SUFFICIENCY_LABELS[cur || 'unknown'];
        return `<span class="suf-line"><span class="suf-phase">${ph.key === 'pre' ? '入院前' : '入院後'}</span><span class="suf-badge suf-${cur || 'unknown'}"><i class="fa-solid ${cur === 'met' ? 'fa-circle-check' : cur === 'unmet' ? 'fa-triangle-exclamation' : 'fa-circle-question'}"></i> ${label}</span></span>`;
      }).join('');
      return `<div class="suf-ctl" role="group" aria-label="充足・未充足">${rows}</div>`;
    }
    function sufficiencySummaryHtml(cp) {
      return `<span class="suf-sum">${SUFFICIENCY_UI_PHASES.map(ph => {
        let met = 0, unmet = 0;
        HENDERSON_NEEDS.forEach(n => { const v = getSufficiency(cp, n.id, ph.key); if (v === 'met') met++; else if (v === 'unmet') unmet++; });
        return `<span class="suf-sum-grp"><span>${ph.label}</span><b class="suf-met-n">充足 ${met}</b><b class="suf-unmet-n">未充足 ${unmet}</b><span>情報不足 ${HENDERSON_NEEDS.length - met - unmet}</span></span>`;
      }).join('')}</span>`;
    }
    window.setSufficiency = function(needId, val, phase = 'all') {
      const cp = getCurrentPatient();
      const ph = sufficiencyPhase(phase);
      const e = ensureMyAssessment(cp, needId);
      e[ph.field] = e[ph.field] === val ? '' : val;
      e[ph.by] = e[ph.field] ? 'user' : '';
      e.updatedAt = new Date().toISOString();
      saveMyAssessmentsSoon(cp.id, 0);
      rerenderMyAssessment();
    };

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

    // ---- AIによる充足・未充足の判定（14項目まとめて） ----
    // 【方針】判断はS/Oの根拠があるものだけ（根拠のカードが無い・原文に無い番号なら「判定できない」に落とす）。
    // 利用者が自分で選んだ項目（sufficiencyBy='user'）は上書きしない。AIが決めた項目は sufficiencyBy='ai' の印を付け、
    // 理由と根拠のカードを見出しの下に出す。利用者が押し直せば 'user' になる。
    function sufficiencyReferenceText() {
      let t = '';
      try { t = buildEffectiveNotebookContent(); } catch (err) { t = ''; }
      const i = t.indexOf('■ 充足・未充足の判断');
      return i >= 0 ? t.slice(i, i + 1800) : '判断視点：①正常値・基準値・日常性との比較 ②各ニード固有の達成基準との照合 ③個別性の評価 ④将来的なリスクの予測';
    }
    function buildSufficiencyPrompt(cp, ev, items) {
      // 【プロンプトを小さく】以前は項目ごとにカードを書き並べていたため、複数の項目に付いたカードが何度も入り、
      // 長い記録では送る文章が大きくなりすぎた。カードは1回だけ書き、{タグ:番号} で項目に結びつける。不足情報は項目ごとに短く書く。
      const cardLines = assessmentDisplayOrder(items.filter(i => (i.hendersonIds || []).length && !(i.hendersonIds || []).every(h => (i.assessmentCols?.[h] || 'unclassified') === 'missing')))
        .map(i => `${evidenceLine(ev, i).slice(0, 400)} {タグ:${(i.hendersonIds || []).slice().sort((x, y) => x - y).map(h => { const c = i.assessmentCols?.[h] || 'unclassified'; return `${h}${c === 'preadmission' ? '前' : c === 'postadmission' ? '後' : c === 'missing' ? '不足' : '？'}`; }).join(',')}}`).join('\n');
      const missLines = HENDERSON_NEEDS.map(need => {
        const miss = items.filter(i => (i.hendersonIds || []).includes(need.id) && (i.assessmentCols?.[need.id] || 'unclassified') === 'missing');
        return miss.length ? `${need.id}.${need.name.replace(/^\d+\.\s*/, '')}：${miss.map(i => i.text.replace(/^原因:\s*/, '').slice(0, 80)).join(' / ')}` : '';
      }).filter(Boolean).join('\n');
      const needList = HENDERSON_NEEDS.map(n => `${n.id}.${n.name.replace(/^\d+\.\s*/, '')}`).join(' / ');
      const ruleSummary = sufficiencyRuleSummaryForPrompt(cp);
      return `あなたは看護教育に精通した臨床指導者です。ヘンダーソンの14の基本的欲求ごとに、患者の欲求が「充足」か「未充足」かをアセスメントしてください。${ruleSummary ? '\nこのサイトのルール（AIなし）が先に判定した結果が下にあります。その結果が正しいかを評価してください。各欄に "agree"（ルールの判定に賛成なら true、反対なら false）も入れる。' : ''}
${ruleSummary ? `【ルールが先に出した判定】\n${ruleSummary}\n` : ''}【判断の基準】
${sufficiencyReferenceText()}
【守るルール】
1. 判断はカードのS（患者の発言）・O（客観的データ）に書かれた事実だけに基づく。カードに無い影響・原因の推測はしない。
2. 各項目に verdict を付ける：met＝充足（自力で満たせている・基準内）／unmet＝未充足（基準から外れる・援助が必要・放置で悪化が予測される）／unknown＝判定できない（カードが少ない・足りない情報がある）。
3. met・unmet には、根拠にしたカードの番号を evidence に必ず入れる（〔C3〕なら "C3"）。番号は下の一覧にあるものだけ。根拠が出せないときは unknown。
4. reason は結論を最初に書き、「根拠データ→基準値・日常性との比較→結論」の順に1〜3文で書く。将来の予測で未充足とするときは「予測」と明記する。
5. 同じ項目に充足の面と未充足の面があるときは、援助が必要な面があれば unmet とし、reason に両方を書く。
6. unknown のときは、判断に足りない情報を need に書く。
7. 入院前（pre）＝入院・受傷・手術の前の状態（日常の生活・既往・入院前の様子）、入院後（post）＝入院・手術・治療のあとの状態。各カードの {タグ} には、その項目の欄を 前（入院前）／後（入院後）／？（未分類。日時と内容で判断）で付けてある。その時期のカードが1枚も無い／少ないときは、その時期は unknown にして need に「入院前の情報が無い」などと書く（入院後の情報から入院前を推測しない）。all は、入院前と入院後を合わせた全体の結論（入院前は充足でも入院後に援助が必要なら unmet）。
【14項目】${needList}
【情報カード】（〔C番号〕[S/O][日時] 本文 {タグ:項目の番号＋欄（前＝入院前／後＝入院後／？＝未分類）}）。各項目の判断には、タグにその番号が入っているカードだけを使う。
${cardLines}
【不足情報（まだ確認できていない情報）】
${missLines || '（なし）'}
【出力】JSONだけを返す（前置き・説明・コードブロックは不要）。各項目について、入院前（pre）・入院後（post）・全体（all）の3つを別々に判定する。
{"needs":[{"id":1,"pre":{"verdict":"met|unmet|unknown","agree":true,"reason":"","evidence":["C1"],"need":""},"post":{"verdict":"","reason":"","evidence":[],"need":""},"all":{"verdict":"","reason":"","evidence":[],"need":""}}]}
14項目すべて（id 1〜14）を出力すること。reason は各1〜2文に短くする。`;
    }
    function parseSufficiencyJson(text, ev, cp) {
      const raw = (text || '').replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
      const s = raw.indexOf('{'), t = raw.lastIndexOf('}');
      if (s === -1 || t <= s) throw new Error('AIの答えを読み取れませんでした（JSONではありません）');
      let obj;
      try { obj = JSON.parse(raw.slice(s, t + 1)); } catch (err) {
        obj = typeof parseAiJsonLoose === 'function' ? parseAiJsonLoose(raw) : undefined;
        if (!obj || typeof obj !== 'object') throw new Error('AIの答えを読み取れませんでした（JSONの形が崩れています）');
      }
      const out = {};
      const cleanOne = (n, id, mineIds) => {
        if (!n || typeof n !== 'object') return null;
        let verdict = String(n.verdict || '').toLowerCase();
        verdict = verdict === 'met' || /^充足/.test(verdict) ? 'met' : verdict === 'unmet' || /未充足/.test(verdict) ? 'unmet' : 'unknown';
        const evidence = (Array.isArray(n.evidence) ? n.evidence : []).map(c => (String(c).match(/C\s*\d{1,4}/i) || [''])[0].replace(/\s+/g, '').toUpperCase())
          .map(c => ev.byCode.get(c)).filter(c => c && mineIds.has(c.id)).map(c => c.id);
        if (verdict !== 'unknown' && !evidence.length) verdict = 'unknown'; // 根拠のカードが出せない判断は採用しない
        return { verdict, reason: String(n.reason || '').trim(), evidence: Array.from(new Set(evidence)), need: String(n.need || '').trim(), agree: typeof n.agree === 'boolean' ? n.agree : null };
      };
      (Array.isArray(obj.needs) ? obj.needs : []).forEach(n => {
        const id = Number(n && n.id);
        if (!Number.isInteger(id) || id < 1 || id > 14) return;
        const mineIds = new Set((cp.items || []).filter(i => i.type !== 'unnecessary' && (i.hendersonIds || []).includes(id)).map(i => i.id));
        const r = {};
        SUFFICIENCY_PHASES.forEach(ph => {
          // 以前の形（verdict が項目の直下にある）は「全体」として読む
          const src = n[ph.key] || (ph.key === 'all' && n.verdict ? n : null);
          const one = cleanOne(src, id, mineIds);
          if (one) r[ph.key] = one;
        });
        if (Object.keys(r).length) out[id] = r;
      });
      return out;
    }
    // 結果を各項目に入れる。利用者が自分で選んだ欄は上書きしない。戻り値は {set, kept, unknown}（欄の数）
    function applySufficiencyResult(cp, result, now = new Date().toISOString(), source = 'ai') {
      let set = 0, kept = 0, unknown = 0;
      HENDERSON_NEEDS.forEach(need => {
        const res = result[need.id];
        if (!res) return;
        const e = ensureMyAssessment(cp, need.id);
        const saved = {};
        SUFFICIENCY_PHASES.forEach(ph => {
          const r = res[ph.key];
          if (!r) return;
          saved[ph.key] = { verdict: r.verdict, reason: r.reason, evidence: r.evidence, need: r.need, at: now, source };
          if (r.verdict === 'unknown') { unknown++; if (e[ph.by] === 'ai' || e[ph.by] === 'rules') { e[ph.field] = ''; e[ph.by] = ''; } return; }
          if (e[ph.field] && e[ph.by] !== 'ai' && e[ph.by] !== 'rules') { kept++; return; }
          e[ph.field] = r.verdict; e[ph.by] = source; set++;
        });
        e.aiSufficiency = { ...(e.aiSufficiency && !e.aiSufficiency.verdict ? e.aiSufficiency : {}), ...saved };
        e.updatedAt = now;
      });
      return { set, kept, unknown };
    }
    function hasRuleSufficiency(cp) {
      return (cp.items || []).some(i => i.type !== 'unnecessary');
    }
    // AIの評価：ルールの判定は書き換えない。AIが賛成か反対か・AIの判断・理由を、各項目に添える
    function applySufficiencyReview(cp, result, now = new Date().toISOString()) {
      let agree = 0, disagree = 0;
      HENDERSON_NEEDS.forEach(need => {
        const res = result[need.id];
        if (!res) return;
        const e = ensureMyAssessment(cp, need.id);
        const saved = {};
        SUFFICIENCY_PHASES.forEach(ph => {
          const r = res[ph.key];
          if (!r) return;
          const rr = ruleSufficiencyFor(cp)[need.id]; const ruleV = rr && rr[ph.key] && rr[ph.key].verdict;
          const same = ruleV ? (r.agree === null ? r.verdict === ruleV : r.agree) : null;
          if (same === true) agree++; else if (same === false) disagree++;
          saved[ph.key] = { verdict: r.verdict, reason: r.reason, evidence: r.evidence, need: r.need, agree: same, at: now };
        });
        e.aiReview = { ...(e.aiReview || {}), ...saved };
        e.updatedAt = now;
      });
      return { agree, disagree };
    }
    function sufficiencyRuleSummaryForPrompt(cp) {
      const all = ruleSufficiencyFor(cp);
      return HENDERSON_NEEDS.map(need => {
        const a = all[need.id] && all[need.id].all;
        if (!a) return '';
        return `${need.id}.${need.name.replace(/^\d+\.\s*/, '')}：${a.verdict === 'met' ? '充足' : a.verdict === 'unmet' ? '未充足' : '情報不足'}${a.reason ? `（${a.reason.slice(0, 80)}）` : ''}`;
      }).filter(Boolean).join('\n');
    }
    function sufficiencyReasonHtml(cp, needId) {
      const e = getMyAssessment(cp, needId);
      const r = ruleSufficiencyFor(cp)[needId];
      if (!r) return '';
      const lines = '';
      const rv = e && e.aiReview && e.aiReview.all;
      const rvHtml = rv ? `<span class="suf-ev"><b>AIの評価：${rv.agree === true ? '賛成' : rv.agree === false ? `反対（AIは${SUFFICIENCY_LABELS[rv.verdict] || '情報不足'}と判断）` : SUFFICIENCY_LABELS[rv.verdict] || '情報不足'}</b> ${escapeHtml(rv.reason || rv.need || '')}</span>` : '';
      if (!lines && !rvHtml) return '';
      return `<div class="suf-reason">${lines}${rvHtml}</div>`;
    }
    let sufficiencyAiRunning = false;
    window.runSufficiencyAi = async function() {
      const cp = getCurrentPatient();
      const items = (cp.items || []).filter(i => i.type !== 'unnecessary' && !isMissingInfoOnlyItem(i));
      if (!items.length) return showToast('カードがありません。先に「分類開始」で分類してください', 'warn');
      if (sufficiencyAiRunning) return showToast('充足・未充足の判定は実行中です。終わるまでお待ちください', 'info');
      if (!(await requireApiKey('充足・未充足のAI判定'))) return;
      sufficiencyAiRunning = true;
      // まずサイト内のルールで判定し（まだ無ければ）、AIはその結果を評価する
      const btn = document.getElementById('btn-sufficiency-ai');
      if (btn) { btn.disabled = true; btn.dataset.label = btn.innerHTML; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 判定中…'; }
      showToast('ルールの判定結果を、AIが評価しています…（1分ほどかかります）', 'info');
      try {
        const ev = buildEvidenceIndex(items);
        const text = await callGeminiAI([{ role: 'user', parts: [{ text: buildSufficiencyPrompt(cp, ev, items) }] }], { json: true });
        const result = parseSufficiencyJson(text, ev, cp);
        if (!Object.keys(result).length) throw new Error('AIの答えに判定が入っていませんでした');
        const r = applySufficiencyReview(cp, result);
        // 画面に出す（この端末に保存）のと、共有先への保存は別。共有先の保存が失敗しても、判定の結果は画面に残る
        try { finishAiResult(cp, () => renderAssessmentTable(), '充足・未充足の判定'); } catch (saveErr) { console.warn('判定の保存に失敗:', saveErr); renderAssessmentTable(); }
        showToast(`AIが評価しました：ルールの判定に賛成${r.agree}欄・反対${r.disagree}欄。反対の欄は理由を読んで、自分で判断してください`, 'success', 9000);
      } catch (err) {
        console.warn('充足・未充足のAI判定に失敗しました:', err);
        showToast(['充足・未充足を判定できませんでした', { text: `${err.message || '通信エラー'}　時間を置いてもう一度押してください。`, detail: true }], 'error', 12000);
      } finally {
        sufficiencyAiRunning = false;
        if (btn) { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
      }
    };


    // ---- 充足・未充足をAIなしで判定する（記録の言葉と、看護で決まっている基準だけを使う） ----
    // 考え方：カードの文を1文ずつ見て、「基準から外れる・援助が必要」を示す言葉（未充足）と「自力でできている・基準内」を示す言葉（充足）を探す。
    // 否定（「痛みの訴えなし」「障害なし」）は反対の意味にする。未充足の面が1つでもあれば未充足（援助が必要な面を優先）。どちらも無ければ「判定できない」。
    const SUF_NEG_AFTER = '(?:[^、。,]{0,6})(?:なし|ない|無|訴えず|みられず|見られず|認めず|なく|ありません)';
    const SUF_UNMET_CUES = ['痛み|疼痛|創痛|痛い|NRS\\s*[:：]?\\s*[3-9]|ペインスケール\\s*[「:：]?\\s*[3-9]', '眠れ[なず]|不眠|睡眠(?:不足|障害)|寝つけ', '全介助|要介助|介助(?:が必要|を要|にて|で)|見守りが必要|できない|困難|不可|禁止|制限', '不安|怖い|恐怖|心配|戸惑|情けない|申し訳', '食欲(?:低下|不振|がない|ない)|摂取量(?:半分|減)|半分のみ|おなかすかない|嘔気|嘔吐', '排便(?:なし|なく)|便秘|下痢|腹部膨満|お腹が張', 'べたべた|べたつき|気持ちが悪い|汚れ|悪臭|掻痒', '発赤|腫脹|熱感|発熱|排膿|浮腫|褥瘡', '呼吸困難(?:感)?(?:あり|を訴)|息苦しい|息切れ|チアノーゼ|喘鳴|SpO2\\s*[:：]?\\s*(?:[0-8]\\d|9[0-3])\\s*%', '転倒|ふらつき|不安定|せん妄|不穏|混乱|拒否', '体温[^\\d。、]{0,3}3[89]|3[89](?:\\.\\d)?\\s*度', '[↑↓]', '(?:旅行|趣味|外出|散歩|余暇)[^。]{0,20}(?:したい|できず|できない|行けない|行きたい)|早く治して', '(?:わから|分から)ない|教えて(?:ほしい|欲しい|ください)|大丈夫(?:か|なの|でしょうか)|ずれ(?:たり)?しないか|気を付け(?:れば|ること)', '仕事[^。]{0,10}(?:できない|できず|休)|復職[^。]{0,10}(?:不安|心配|難)|働けな', '体重[^。、]{0,8}(?:減|低下)|[0-9.]+\\s*kg\\s*(?:減|低下)|やせ|朝食[^。、]{0,6}(?:抜|食べない|とらない|欠食|ほとんど食べ)|欠食|野菜嫌い|嫌い|苦手|外食|早食い|偏食|短時間で済ま|早く食べ', '難聴|聞こえ(?:にくい|ない|が悪)|聴力(?:低下|障害)|(?:説明|話|内容)[^。、]{0,8}(?:ほとんど|あまり)?伝わ(?:らない|りにくい)|意思疎通(?:が)?(?:困難|難しい|図れ(?:ない|ず))|失語|構音障害'];
    const SUF_MET_CUES = ['自立|自力|自分で|一人で|問題なし|良好|清明|規則的|正常|普通食|常食|整|障害なし|異常なし|理解(?:力)?(?:あり|良好)|前向き|頑張|楽しみ|きれい好き', '睡眠[^\\d。、]{0,3}[6-9](?:\\s*[~〜～-]\\s*[6-9])?\\s*時間|眠れた|よく眠れ', '食欲(?:良好|あり)|全量摂取|摂取量\\s*(?:良好|十分)', 'SpO2\\s*[:：]?\\s*(?:9[4-9]|100)\\s*%', 'ペインスケール\\s*[「:：]?\\s*[0-2]|NRS\\s*[:：]?\\s*[0-2](?!\\d)|痛みなし|疼痛なし', '体温[^\\d。、]{0,3}(?:3[67]|35\\.[5-9])', '排便\\s*[:：]?\\s*\\d\\s*回/日|排尿\\s*[:：]?\\s*\\d+\\s*回/日', '呼吸困難感(?:の)?訴えなし|肺Air入り(?:が)?良好', '意思疎通(?:は)?(?:良好|可能|図れ)|言葉にで|希望を(?:伝え|話)|質問(?:が)?でき|ナースコール[^。]{0,6}(?:使用|押|できる)|コミュニケーション[^。]{0,6}(?:良好|障害なし)', '理解(?:力)?(?:が)?良好|現状認識(?:が)?良好|理解できて|理解している', '(?:旅行|趣味|友人|外出)[^。]{0,12}(?:楽しむ|楽しん|行って|している)', '信仰[^。]{0,8}なし|宗教[^。]{0,8}なし|特別な宗教', '(?:RR|呼吸数)[^\\d。、]{0,3}(?:1[2-9]|20)(?!\\d)|%(?:VC|肺活量)\\s*(?:[89]\\d|1\\d\\d)|胸部[^。、]{0,8}(?:明らかな)?(?:異常|病変)[^。、]{0,4}(?:なし|認めず|ない)|禁煙|呼吸困難(?:感)?(?:は)?(?:なし|ない|無)', '趣味|テニス|ゴルフ|ジム|ウォーキング|ジョギング|旅行|友人[^。]{0,6}(?:会|食事)'];
    // 言葉の種類ごとに、関係する欲求の番号（null＝どの欲求でも）。痛みは動く・休む・清潔など広く、体温は体温調節だけ、のように限る
    const SUF_UNMET_SCOPE = [[4, 5, 6, 8, 13, 14], [5], null, [13, 14], [2, 3], [3], [8], [7, 8], [1], [4, 9, 10, 13, 14], [7], null, [13], [14], [12], [2], [10]];
    const SUF_MET_SCOPE = [null, [5], [2], [1], [4, 5, 6, 8, 10, 12, 13, 14], [7], [3], [1], [10], [14], [13], [11], [1], [13]];
    // 根拠として使えるかの確認（言葉だけで充足にしない）：
    //  ・発言や疑問・不安の言い方（「自分でできるかな？」「大丈夫？」「分かりました」）は、できている証拠にしない
    //  ・ドレーン・挿入部・創部の所見は、排泄や姿勢などの充足の根拠にしない（清潔・体温の根拠にだけ使う）
    //  ・排泄・姿勢の充足は、その欲求に関する言葉（排便・排尿・歩行・ADLなど）がある記載だけを根拠にする
    const SUF_UNCERTAIN = /[？?]|かな$|かも|だっけ|だよね|んですね|でしょうか|ですか|分かりました|わかりました|大丈夫|問題ない|できる(?:かな|と思|はず)/;
    const SUF_DEVICE_SITE = /挿入部|刺入部|ドレーン|ルート|チューブ|カテーテル|ライン|創部|ガーゼ/;
    const SUF_MET_DOMAIN = { 3: /排便|排尿|排泄|便|尿|トイレ|下痢|便秘|ガス|腸蠕動|オムツ|ポータブル|ADL/, 4: /歩行|移動|ADL|体位|寝返|離床|立位|座位|起き上|筋力|ふらつき|歩く|運動|テニス|スポーツ|自立/, 2: /食|摂取|嚥下|咀嚼|栄養|水分|飲/ };
    function sufficiencyMetAllowed(clause, needId, speech) {
      if (speech || SUF_UNCERTAIN.test(clause)) return false;
      if (SUF_DEVICE_SITE.test(clause) && ![7, 8].includes(needId)) return false;
      const dom = SUF_MET_DOMAIN[needId];
      if (dom && !dom.test(clause)) return false;
      return true;
    }
    function sufficiencyClauseVerdict(clause, needId, opts) {
      const speech = !!(opts && opts.speech);
      const t = String(clause || '').normalize('NFKC');
      // 12.仕事・達成感は、仕事・役割・達成感に関する言葉が無い記載（動作の自立など）では決めない（教員・利用者の指摘：情報が弱いときは判定保留）
      if (needId === 12 && !/仕事|職|復職|達成|役割|家事|意欲|生きがい|就労|勤務|主婦/.test(t)) return { v: '', hit: '' };
      const metOk = sufficiencyMetAllowed(t, needId, speech);
      let unmet = '', met = '';
      for (let k = 0; k < SUF_UNMET_CUES.length; k++) {
        const src = SUF_UNMET_CUES[k], sc = SUF_UNMET_SCOPE[k];
        if (needId && sc && !sc.includes(needId)) continue;
        const m = t.match(new RegExp(`(${src})(${SUF_NEG_AFTER})?`));
        if (!m) continue;
        const negated = m[2] && !/^[↑↓]/.test(m[1]);
        if (negated) { if (metOk) met = met || m[0]; continue; }
        unmet = m[0]; break;
      }
      // 自立してできている記載（「自立」「自力」）に、好みや気持ちの言葉（「毎日入らないと気持ちが悪い」）が添えられているだけなら、満たされていると見る
      if (unmet && metOk && /自立|自力/.test(t) && !/全介助|要介助|介助|できない|困難|不可|禁止|制限|見守り/.test(t) && /気持ち|不安|心配|戸惑|申し訳|情けない/.test(unmet)) return { v: 'met', hit: '自立' };
      if (unmet) return { v: 'unmet', hit: unmet };
      if (met) return { v: 'met', hit: met };
      if (!metOk) return { v: '', hit: '' };
      for (let k = 0; k < SUF_MET_CUES.length; k++) { const sc = SUF_MET_SCOPE[k]; if (needId && sc && !sc.includes(needId)) continue; const m = t.match(new RegExp(SUF_MET_CUES[k])); if (m) return { v: 'met', hit: m[0] }; }
      return { v: '', hit: '' };
    }
    const SUF_SEVERE = /難聴|伝わらない|全介助|要介助|できない|不可|禁止|不眠|眠れ[なず]|転倒|せん妄|不穏|チアノーゼ|呼吸困難(?:感)?(?:あり|を訴)|息苦しい|SpO2/;
    const SUF_MILD = /やや|軽度|少量|わずか|軽い|軽度/;
    function sufficiencyCardVerdict(item, needId, phase) {
      // 信仰：「記載なし・不明」は情報が無いだけなので、充足とも未充足とも決めない（情報不足）
      if (needId === 11 && /記載なし|情報なし|不明|未確認|聴取(?:して)?(?:い)?ない|確認(?:でき|して)ない/.test(String(item.text || '').normalize('NFKC'))) return { v: '', hit: '', clause: '' };
      const parts = String(item.text || '').normalize('NFKC').split(/[。\n、,，]|\s{2,}|(?<=[)）])/).map(s => s.trim()).filter(Boolean);
      let met = null, unmet = null;
      // 「」の発言のカードは、本人の気持ちや質問であって、できている証拠ではない
      const speech = /[「」]/.test(String(item.text || ''));
      for (const p of parts) {
        // 入院前の評価では、「現在は痛みのため眠れていない」のように今の状態を述べた節は入院後の情報なので使わない
        if (phase === 'pre' && /^(?:現在|今回|今は|入院後|術後)/.test(p)) continue;
        const r = sufficiencyClauseVerdict(p, needId, { speech });
        if (r.v === 'unmet') {
          // 「やや〜」「軽度」や検査値の矢印だけは、問題の重さが小さいので数えない（正常な所見が十分あれば充足と見る）
          if (SUF_MILD.test(p) || /^[↑↓]$/.test(r.hit)) continue;
          if (!unmet) unmet = { v: 'unmet', hit: r.hit, clause: p, severe: SUF_SEVERE.test(p) };
          else if (SUF_SEVERE.test(p)) unmet.severe = true;
        }
        if (r.v === 'met' && !met) met = { v: 'met', hit: r.hit, clause: p };
      }
      // コミュニケーション：本人が気持ち・疑問・要望を言葉にして伝えられている発言は、「伝える力がある」根拠になる（発言のカードが10に入っているのは、この種類のもの）
      if (!unmet && !met && needId === 10 && speech) {
        const q = (String(item.text || '').match(/「[^」]{4,}」/) || [String(item.text || '')])[0];
        met = { v: 'met', hit: '発言', clause: q.slice(0, 30) };
      }
      return unmet || met || { v: '', hit: '', clause: '' };
    }
    function placeByDate(i) {
      return typeof inferAssessmentColumn === 'function' ? inferAssessmentColumn(i.fieldLabel, i.timestamp, null) : null;
    }
    // 治療のための制限（絶飲食・留置カテーテル・床上安静）や、術後の直接の所見は、「治療が代わりに満たしている」だけで、その欲求を通常の方法では満たせていない状態。
    // 入院後の判定では、古い正常所見（術前の「朝食全量摂取」など）より、今も続いている制限・所見を優先する（あとで解除された記載があれば、制限は終わったと見る）
    const SUF_STATE_RULES = [
      { need: 2, re: /絶飲食|禁飲食|絶食|飲水(?:も)?禁止|禁食|NPO/, lift: /(?:絶飲食|絶食|禁飲食|NPO)[^。、]{0,4}解除|(?:食事|飲水|経口摂取|水分)[^。、]{0,4}(?:開始|再開)|流動食|五分粥|全粥|粥食|全量摂取|[0-9]割摂取/, label: '術後の絶飲食（治療のため、通常の食事・水分摂取ができていない）',
        // 短時間（○時間）の絶食で、補液などの補給の計画・実施があり、不足の所見が無いときは、絶食の指示だけで未充足にしない
        exempt: (hit, all) => hit.every(t => /(?:絶食|絶飲食|禁飲食|NPO)[^。、]{0,4}[0-9]+\s*時間|術前|前日/.test(t)) && /補液|輸液|補給|点滴|水分(?:補給|摂取)(?:の)?(?:予定|計画)/.test(all) && !/不足|低下|脱水|減少|摂取(?:でき|困難)|悪心|嘔/.test(all) },
      { need: 3, re: /留置カテーテル|膀胱留置|尿道留置|バルーンカテーテル|尿道バルーン|尿道カテーテル|導尿/, lift: /(?:カテーテル|バルーン)[^。、]{0,4}(?:抜去|抜い|除去)|自尿|自排尿/, label: '膀胱留置カテーテル（排尿を管に頼っており、通常の排泄を自力で満たせていない）',
        // カテーテルがあっても尿の排出が良好で、閉塞・混濁・血尿などの問題が無ければ、排泄の機能は保たれている（自力排泄かどうかとは別に見る）
        exempt: (hit, all) => /流出(?:は)?(?:良好|あり)|尿量[^。、]{0,8}(?:良好|十分|[0-9]{3,}\s*m[lL])/.test(all) && !/閉塞|流出(?:不良|なし|不|悪)|尿量(?:減少|少な)|乏尿|無尿|血尿|混濁|膀胱刺激|疼痛|痛み/.test(all) },
      { need: 4, re: /床上安静|ベッド上安静|絶対安静|ベッド安静/, lift: /安静(?:度)?[^。、]{0,4}(?:解除|拡大|フリー)|歩行(?:が)?可能|自力歩行|室内歩行|トイレ歩行|病棟歩行|離床(?:した|でき|を開始|開始)/, label: '術後の床上安静（治療のため、動くこと・姿勢を保つことが制限されている）' }
    ];
    const SUF_RESP_DIRECT = /酸素\s*[0-9]|酸素(?:投与|吸入)|(?<![A-Za-z])O2\s*[0-9]|湿性咳嗽|息遣い(?:は)?浅|浅い呼吸|呼吸(?:が)?浅|浅表性|顔色(?:やや)?(?:不良|蒼白)|蒼白|チアノーゼ|喘鳴|呼吸困難(?:感)?(?:あり|を訴|が強)|痰(?:が)?(?:多|絡)/g;
    function sufficiencyStateOverrides(items, res, isPre) {
      const post = items.filter(i => !isPre(i) && !/[「」]/.test(String(i.text || '')));
      const nz = x => String(x || '').normalize('NFKC');
      const idx = new Map(items.map((i, n) => [i, n]));
      const set = (needId, reason, ev) => {
        const r = res[needId]; if (!r) return;
        const v = { verdict: 'unmet', reason, evidence: ev.slice(0, 5).map(i => i.id), need: '' };
        r.post = v; if (!r.all || r.all.verdict !== 'unmet') r.all = v;
      };
      SUF_STATE_RULES.forEach(rule => {
        const hit = post.filter(i => rule.re.test(nz(i.text)));
        if (!hit.length) return;
        const lastAt = Math.max(...hit.map(i => idx.get(i)));
        // あとで解除・再開の記載があれば、制限は終わったので上書きしない
        if (post.some(i => idx.get(i) > lastAt && rule.lift.test(nz(i.text)))) return;
        if (rule.exempt && rule.exempt(hit.map(i => nz(i.text)), post.map(i => nz(i.text)).join(' '))) return;
        set(rule.need, rule.label, hit);
      });
      // 呼吸：術後の直接の所見（酸素・湿性咳嗽・浅い呼吸・顔色）を最優先の根拠にする。訓練の成績（ボールが維持できない）は根拠の中心にしない
      const found = [], evs = [];
      // 酸素の使用だけは治療の記載なので、呼吸困難が無く酸素化が保たれている（SpO2 94%以上）ときは、問題の根拠にしない（自立度・補助の有無とは別に評価する）
      const allPost = post.map(i => nz(i.text)).join(' ');
      const stable = /呼吸困難(?:感)?(?:の訴え)?(?:は)?(?:なし|ない|無)|訴えなし/.test(allPost) && /SpO2\s*[:：]?\s*(?:9[4-9]|100)/.test(allPost);
      const OXY_ONLY = /^(?:酸素|O2)/;
      post.forEach(i => { const m = nz(i.text).match(SUF_RESP_DIRECT); if (m) { const mm = stable ? m.filter(x => !OXY_ONLY.test(x)) : m; if (!mm.length) return; mm.forEach(x => { if (!found.includes(x)) found.push(x); }); evs.push(i); } });
      if (found.length) set(1, `術後の直接の所見（${found.slice(0, 5).join('・')}）`, evs);
    }
    function judgeSufficiencyByRules(cp) {
      // 現病歴・診断名・既往歴などは、受傷の経緯や病名の記載で、その欲求が満たされているかを示す記録ではないので判定に使わない
      const HISTORY_LABELS = ['現病歴', '診断名', '既往歴', '手術術式', '氏名', '年齢', '性別', '感染症'];
      const items = (cp.items || []).filter(i => i.type !== 'unnecessary' && !isMissingInfoOnlyItem(i) && !HISTORY_LABELS.includes(i.fieldLabel));
      const out = {};
      HENDERSON_NEEDS.forEach(need => {
        const mine = items.filter(i => (i.hendersonIds || []).includes(need.id));
        const colOf = i => (i.assessmentCols && i.assessmentCols[need.id]) || 'unclassified';
        // 日時が読み取れているカードは「未分類」にせず、日時から入院前／入院後に振り分ける
        const effCol = i => { const x = colOf(i); return x === 'unclassified' ? (placeByDate(i) || x) : x; };
        // 「問題を示す言葉が1つでもあれば未充足」ではなく、正常な所見と問題の所見を比べて、その欲求が満たされているかを見る：
        //   ・重い問題（全介助・できない・不眠・転倒など）が1つでもあれば未充足
        //   ・それ以外は、問題のカードの数が正常なカードの数の半分以上なら未充足、そうでなければ充足
        //   ・正常も問題も読み取れなければ「判定保留」（無理に決めない）。信仰は、問題の記載が無ければ充足とする
        const judge = (cards, label, phaseKey) => {
          // 術前の記録は、入院前の基準になる状態（できていること＝充足の根拠）としては入院前で、問題の記載は入院後で見る
          const rs = cards.map(i => {
            let r = sufficiencyCardVerdict(i, need.id, phaseKey);
            if (isPreop(i) && ((phaseKey === 'pre' && r.v === 'unmet') || (phaseKey === 'post' && r.v === 'met'))) r = { v: '', hit: '', clause: '' };
            return { i, r };
          });
          const um = rs.filter(x => x.r.v === 'unmet'), mt = rs.filter(x => x.r.v === 'met');
          const short = x => { const c = x.r.clause.slice(0, 30); return /^「.*」$/.test(c) ? c : `「${c}」`; };
          // 充足を示す記録と未充足を示す記録が同じ数だけあり、重い問題も無いときは、どちらとも決めずに「判定保留」にする
          if (um.length && mt.length && um.length === mt.length && !um.some(x => x.r.severe)) return { verdict: 'conflict', reason: `充足を示す${mt.slice(0, 2).map(short).join('')}と、未充足を示す${um.slice(0, 2).map(short).join('')}`, evidence: [...mt.slice(0, 3), ...um.slice(0, 3)].map(x => x.i.id), need: '' };
          if (um.length && (um.some(x => x.r.severe) || um.length * 2 >= mt.length)) return { verdict: 'unmet', reason: `${um.slice(0, 3).map(short).join('')}`, evidence: um.slice(0, 5).map(x => x.i.id), need: '' };
          if (mt.length) return { verdict: 'met', reason: `${mt.slice(0, 3).map(short).join('')}`, evidence: mt.slice(0, 5).map(x => x.i.id), need: '' };
          if (need.id === 11 && cards.some(i => /宗教|信仰|信条|祈|礼拝|価値観/.test(String(i.text || '')) && !/記載なし|情報なし|不明|未確認/.test(String(i.text || '')))) return { verdict: 'met', reason: '信仰による問題の記載なし', evidence: cards.slice(0, 3).map(i => i.id), need: '' };
          return { verdict: 'unknown', reason: '', evidence: [], need: cards.length ? `${label}の記録が少なく、満たされているか判断できない` : `${label}の記録がない` };
        };
        const res = {};
        // 術前（手術前の基準になる状態）の記録は、充足の判定では入院前の側で見る（表の欄は入院後のまま）
        const isPreop = () => false; // 術前・手術前日などは入院後（入院前／入院後の2つに分ける）
        const phases = { pre: ['入院前', (c, i) => c === 'preadmission' || (c === 'postadmission' && isPreop(i))], post: ['入院後', c => c === 'postadmission'], all: ['全体', c => c !== 'missing'] };
        Object.keys(phases).forEach(k => { res[k] = judge(mine.filter(i => phases[k][1](effCol(i), i)), phases[k][0], k); });
        out[need.id] = res;
      });
      try { sufficiencyStateOverrides(items, out, i => /^入院前/.test(String(i.timestamp || '')) || (Object.values(i.assessmentCols || {}).length > 0 && Object.values(i.assessmentCols).every(c => c === 'preadmission'))); } catch (e) { console.warn('制限の確認に失敗:', e); }
      return out;
    }
    window.runSufficiencyRules = function() {
      const cp = getCurrentPatient();
      if (!(cp.items || []).some(i => i.type !== 'unnecessary')) return showToast('カードがありません。先に「分類開始」で分類してください', 'warn');
      const r = applySufficiencyResult(cp, judgeSufficiencyByRules(cp), new Date().toISOString(), 'rules');
      try { finishAiResult(cp, () => renderAssessmentTable(), '充足・未充足の判定（AIなし）'); } catch (e) { renderAssessmentTable(); }
      showToast(`AIなしで判定しました：${r.set}欄に入れました` + (r.kept ? `／自分で選んだ${r.kept}欄はそのまま` : '') + (r.unknown ? `／${r.unknown}欄は記録が足りず判定できません` : '') + '。根拠の言葉を見て、自分で直してください', 'success', 8000);
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
    ensureMyAssessment, getMyAssessment, ruleSufficiencyFor, linkMyEvidenceIds, unlinkMyEvidenceId, setMyEvidenceIds,
    myAssessmentStatus, myAssessmentNeedsReview, confirmMyAssessmentEntry, restoreMyAssessmentFromHistory,
    buildSufficiencyPrompt, hasRuleSufficiency, applySufficiencyReview, judgeSufficiencyByRules, sufficiencyCardVerdict, sufficiencyHasVerdict, sufficiencySentence, parseSufficiencyJson, applySufficiencyResult, sufficiencyReasonHtml, sufficiencyPhaseHtml, sufficiencyPhaseText, phaseVerdictOf, sufficiencyTextOf, myAssessmentHasContent, getSufficiency, sufficiencyControlHtml, sufficiencySummaryHtml, diffMyAssessmentVersions, reviewMyAssessment, buildMyAssessmentsText, buildMyAssessmentsPrintHtml,
    renderMyAssessmentRowHtml, evidencePickerCandidates, buildMyAssessmentAiPrompt, myAssessmentAlwaysShown
  });
  if (module.exports.__testHooks) Object.assign(module.exports.__testHooks, { flushMyAssessmentSaves, saveMyAssessmentsSoon });
}
