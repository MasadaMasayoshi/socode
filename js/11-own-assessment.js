// Own assessment and reevaluation. Keep evidence, interpretation and prediction separate.
// Field histories and delayed checks are patient/need-scoped; reject later conflicting edits.

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['11'] = 'v.93'; // Version stamp (scripts/stamp-version.js)

    // ==========================================================================

    // ------------------------------------------------------------------------

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

    function myNeedItems(cp, needId) {
      return (cp.items || []).filter(i => i.type !== 'unnecessary' && !i.diseaseGeneral && (i.hendersonIds || []).includes(needId));
    }
    function myNeedRecordItems(cp, needId) {
      return myNeedItems(cp, needId).filter(i => (i.assessmentCols?.[needId] || 'unclassified') !== 'missing');
    }

    function myEvidenceLabels(cp, needId) {
      return assessmentSeqLabels(myNeedItems(cp, needId), needId);
    }

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

      const labelToId = new Map(Object.entries(labels).map(([id, l]) => [l, id]));
      const text = MY_ASSESSMENT_FIELDS.map(f => (e[f.key] || '')).join('\n');
      const cited = Array.from(new Set((text.normalize('NFKC').match(/[SO]\s*-\s*\d{1,3}/g) || []).map(s => s.replace(/\s+/g, ''))));
      cited.forEach(l => {
        const id = labelToId.get(l);
        if (id && !evIds.has(id)) hints.push({ level: 'info', text: `本文に書いた ${l}「${shortText(byId.get(id)?.text, 24)}」が根拠のカードに入っていません。`, itemId: id });
        else if (!id) hints.push({ level: 'info', text: `本文の ${l} はこの項目の表にありません（番号は表のカードの並びで変わります）。` });
      });

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

    function buildMyAssessmentsText(cp, { withEvidence = true } = {}) {
      return HENDERSON_NEEDS.map(need => {
        const e = getMyAssessment(cp, need.id);
        if (!e || !(sufficiencyHasVerdict(cp, need.id) || MY_ASSESSMENT_FIELDS.some(f => String(e[f.key] || '').trim()))) return null;
        const labels = myEvidenceLabels(cp, need.id);
        const lines = [`${need.id}. ${need.name.replace(/^\d+\.\s*/, '')}`];
        if (sufficiencyHasVerdict(cp, need.id)) sufficiencyUiPhases(cp).forEach(ph => lines.push(`・${ph.label}：${SUFFICIENCY_LABELS[getSufficiency(cp, need.id, ph.key) || 'unknown']}　${sufficiencySentence(cp, need.id, ph.key)}`));
        MY_ASSESSMENT_FIELDS.forEach(f => { if (String(e[f.key] || '').trim()) lines.push(`${f.label}：${e[f.key].trim()}`); });
        if (withEvidence && (e.evidenceIds || []).length) {
          lines.push('根拠：' + e.evidenceIds.map(id => { const d = describeMyEvidence(cp, need.id, id, labels, e); return `${d.label}「${d.text}」${d.removed ? '（消されたカード）' : ''}`; }).join('／'));
        }
        return lines.join('\n');
      }).filter(Boolean).join('\n\n');
    }

    // ==========================================================================

    // ==========================================================================

    const myAsmExpandedInAll = new Set();

    let myAsmAlwaysShown = false;
    try { myAsmAlwaysShown = localStorage.getItem('nursing_my_asm_show') === 'on'; } catch (e) {   }
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
      try { localStorage.setItem('nursing_my_asm_show', myAsmAlwaysShown ? 'on' : 'off'); } catch (e) {   }
      updateMyAsmShowButton();
      renderAssessmentTable();
    };
    const myAsmHistoryOpen = new Set();
    const myAsmReviewOpen = new Set();

    // ==========================================================================

    // ==========================================================================
    const SUFFICIENCY_LABELS = { met: '充足', unmet: '未充足', conflict: '判定保留', unknown: '情報不足' };

    const SUFFICIENCY_PHASES = [
      { key: 'pre', label: '入院前', field: 'sufficiencyPre', by: 'sufficiencyPreBy' },
      { key: 'post', label: '入院後', field: 'sufficiencyPost', by: 'sufficiencyPostBy' },
      { key: 'all', label: '全体', field: 'sufficiency', by: 'sufficiencyBy' }
    ];

    const SUFFICIENCY_UI_PHASES = SUFFICIENCY_PHASES.filter(p => p.key !== 'all');

    const SUFFICIENCY_SURG_PHASES = [{ key: 'preop', label: '術前' }, { key: 'postop', label: '術後' }];
    const sourceSurgicalPeriods = new WeakMap();
    function surgPhaseOf(i, cp) {
      const ts = String(i.timestamp || '').normalize('NFKC');
      const head = String(i.text || '').normalize('NFKC').slice(0, 30);
      if (/術後|POD\s*\d|手術(?:翌日|後)|術直後|帰室/.test(ts) || /^[【\[]?術後/.test(head)) return 'post';
      if (/手術当日|術中|手術日|入室|OP当日/.test(ts) && !/術後|帰室/.test(ts)) return 'op';
      if (/術前|手術前|入院時|入院日|入院当日/.test(ts) || /^[【\[]?術前/.test(head)) return 'pre';
      if (cp && cp.sourceText) {
        let cached = sourceSurgicalPeriods.get(cp);
        if (!cached || cached.source !== cp.sourceText) {
          const periods = new Map();
          String(cp.sourceText).split(/\r?\n/).forEach(line => {
            if (!/^[＜<【]/.test(line.trim())) return;
            const day = extractDayLabelFromHeading(line);
            const phase = /術後|手術(?:後|翌日)/.test(line) ? 'post' : /手術当日|術中/.test(line) ? 'op' : /術前|手術前/.test(line) ? 'pre' : '';
            if (!day || !phase) return;
            if (!periods.has(day)) periods.set(day, new Set());
            periods.get(day).add(phase);
          });
          cached = {source:cp.sourceText, periods}; sourceSurgicalPeriods.set(cp,cached);
        }
        const phases = cached.periods.get(ts.split(' ')[0]);
        if (phases?.size === 1) return Array.from(phases)[0];
      }
      return '';
    }
    function isSurgicalPatient(cp) { return (cp.items || []).some(i => i && !i.deleted && !i.aiSuggested && i.type !== 'unnecessary' && !i.diseaseGeneral && surgPhaseOf(i) === 'post'); }
    function sufficiencyUiPhases(cp) {
      const base = SUFFICIENCY_UI_PHASES;
      return cp && isSurgicalPatient(cp) ? [base[0], ...SUFFICIENCY_SURG_PHASES] : base;
    }
    function sufficiencyPhase(key) { return SUFFICIENCY_PHASES.find(p => p.key === key) || SUFFICIENCY_PHASES[2]; }

    const sufficiencyCache = { sig: '', res: null, cp: null };
    function ruleSufficiencyFor(cp) {
      const sig = JSON.stringify([cp.sourceText, (cp.items || []).map(i => [i.id, i.type, i.text, i.hendersonIds, i.assessmentCols, i.timestamp, i.fieldLabel, i.admissionPhase, i.assessmentColumn, i.deleted, i.aiSuggested])]);
      if (sufficiencyCache.cp === cp && sufficiencyCache.sig === sig && sufficiencyCache.res) return sufficiencyCache.res;
      let res = {};
      try { res = judgeSufficiencyByRules(cp); } catch (err) { console.warn('Fulfillment evaluation failed:', err); }
      sufficiencyCache.cp = cp; sufficiencyCache.sig = sig; sufficiencyCache.res = res;
      return res;
    }
    function getSufficiency(cp, needId, phase = 'all') {
      const r = ruleSufficiencyFor(cp)[needId];
      const v = r && r[phase] && r[phase].verdict;
      return v === 'met' || v === 'unmet' ? v : '';
    }

    function sufficiencyHasVerdict(cp, needId) {
      return (cp.items || []).some(i => i.type !== 'unnecessary') && !!ruleSufficiencyFor(cp)[needId];
    }

    const SUFFICIENCY_RISKS = {
      1: '誤嚥・無気肺・肺炎などの呼吸器合併症', 2: '低栄養・脱水・創傷治癒の遅れ', 3: '便秘・尿閉・腸閉塞（イレウス）', 4: '廃用症候群・深部静脈血栓症・転倒',
      5: '睡眠不足による疼痛の増強・せん妄', 6: '更衣困難による皮膚トラブル・保温不足', 7: '感染による発熱・体温調節の乱れ', 8: '感染・皮膚トラブル（褥瘡）',
      9: '転倒・転落・感染・事故', 10: '不安の増強・ニーズの把握の遅れ', 11: '精神的な苦痛の増強', 12: '役割の喪失・自己効力感の低下', 13: '気分転換の不足・活動意欲の低下',
      14: '自己管理の不足・退院後の合併症（脱臼・再発など）'
    };

    function sufficiencyDimensions(cp, needId, phase) {
      const r = ruleSufficiencyFor(cp)[needId];
      const a = r && r[phase];
      if (!a || !a.verdict) return null;
      const byId = new Map((cp.items || []).map(i => [i.id, i]));
      const evItems = (a.evidence || []).map(id => byId.get(id)).filter(Boolean);
      const nz = x => String(x || '').normalize('NFKC').replace(/\s+/g, ' ');
      const txt = evItems.map(i => nz(i.text)).join(' ');
      const assist = (txt.match(/全介助|一部介助|軽介助|介助(?:が)?(?:必要|要)|見守り|自立|自分で[^\s。、]{1,8}/) || [])[0] || '';
      const sym = evItems.filter(i => /痛|苦|困難|不能|できない|悪心|嘔|膨満|浅|湿性|発熱|不眠|不安|ふらつ|息苦|絶飲食|絶食|カテーテル|床上安静|酸素/.test(nz(i.text))).slice(0, 2).map(i => { const t = nz(i.text).replace(/^「|」$/g, ''); return t.length > 22 ? t.slice(0, 22) + '…' : t; });
      const status = SUFFICIENCY_LABELS[a.verdict] || '';
      const n = evItems.length;
      let conf = '低（記録が少ない、または決め手がない）';
      if ((a.verdict === 'met' || a.verdict === 'unmet') && !a.restriction) conf = n >= 2 ? '高（複数の記録が同じ方向）' : n === 1 ? '中（根拠の記録が1つ）' : '低（根拠の記録が見当たらない）';
      else if (a.restriction) conf = '低（治療上の制限だけで、自立度・症状の記録が必要）';
      // Complication predictions need patient-specific evidence: an unmet/pending verdict backed by at least one record with a symptom or restriction cue.
      const hasRiskEvidence = (a.verdict === 'unmet' || a.verdict === 'conflict') && (sym.length > 0 || !!assist || evItems.length > 0 && a.verdict === 'unmet');
      const risk = hasRiskEvidence ? (SUFFICIENCY_RISKS[needId] || '') : '';
      return { status, independence: assist || '記録なし', symptoms: sym.join('、') || '記録なし', complications: risk ? `${risk}（確定ではなく、予防のための観察対象）` : '記録なし（この患者の記録から根拠が確認できないため記載しません）', confidence: conf };
    }
    function sufficiencyDimensionLines(cp, needId, phase) {
      const d = sufficiencyDimensions(cp, needId, phase);
      return d ? [`現在の充足状況：${d.status}`, `自立度・介助：${d.independence}`, `現在の症状・制限：${d.symptoms}`, `起こりうる合併症：${d.complications}`, `根拠の確かさ：${d.confidence}`] : [];
    }
    // v.93 (user-authorised 2026-10-16): the rationale integrates the recorded findings of the phase:
    // 「<所見>は〜であるが、<補う/悪化させる記録>なので、<ニード>は充足している／未充足である／判定保留／情報不足。」
    function sufficiencySentence(cp, needId, phase, labelMap) {
      labelMap = labelMap || myEvidenceLabels(cp, needId);
      const r = ruleSufficiencyFor(cp)[needId];
      const a = r && r[phase];
      if (!a || !a.verdict) return '';
      const need = HENDERSON_NEEDS.find(n => n.id === needId);
      const name = need ? need.name.replace(/^\d+\.\s*/, '') : '';
      const byId = new Map((cp.items || []).map(i => [i.id, i]));
      const ref = id => { const lb = (labelMap || {})[id]; return lb ? (lb.match(/^[SO]-\d+/) || [lb])[0] : ''; };
      const one = f => { const r0 = ref(f.id), t = cleanSheetRecordText(f.text).replace(/\s+/g, ' ').trim(); return r0 ? `${r0}（${t}）` : t; };
      const sum = list => list.slice(0, 3).map(one).join('・');
      const labs = (a.evidence || []).slice(0, 3).map(id => {
        const lb = (labelMap || {})[id]; if (!lb) return '';
        const it = byId.get(id); if (!it) return lb;
        const t = cleanSheetRecordText(it.text).replace(/\s+/g, ' ').trim();
        const when = it.timestamp && it.timestamp !== '日時不明' ? `${it.timestamp}：` : '';
        return `${lb}（${when}${t}）`;
      }).filter(Boolean);
      const f = a.facts || { against: [], for: [] };
      const ag = (f.against || []).filter(x => x && x.text), fo = (f.for || []).filter(x => x && x.text);
      const agVal = ag.some(x => x.kind === 'value'), foVal = fo.some(x => x.kind === 'value');
      const basis = labs.length ? labs.join('・') : String(a.reason || '');
      // v.93: the wording is chosen to fit the evidence (compensated, contradicted, one-sided, state-based, missing);
      // the only fixed rule is the ending: a definite verdict phrase that matches the label.
      if (a.verdict === 'met') {
        if (ag.length && fo.length) return agVal ? `${sum(ag)}は参考基準の範囲外であるが、${sum(fo)}なので、${name}は充足している。` : `${sum(ag)}がみられるものの、${sum(fo)}ため、${name}は充足している。`;
        if (fo.length > 1) return `${sum(fo)}がそろっており、${name}は充足している。`;
        if (fo.length) return `${sum(fo)}のため、${name}は充足している。`;
        return `${basis}から、${name}は充足している。`;
      }
      if (a.verdict === 'unmet') {
        if (ag.length && fo.length) return foVal ? `${sum(fo)}は基準内であるが、${sum(ag)}の記録があるため、${name}は未充足である。` : `${sum(fo)}は良好な一方、${sum(ag)}の記録があり、${name}は未充足である。`;
        if (ag.length > 1) return `${sum(ag)}がみられ、${name}は未充足である。`;
        if (ag.length) return `${sum(ag)}のため、${name}は未充足である。`;
        return `${basis}から、${name}は未充足である。`;
      }
      if (a.verdict === 'conflict' && a.restriction) return `${labs.length ? labs.join('・') + 'により、' : ''}治療上の制限（${String(a.reason).replace(/（.*$/, '')}）は確認できるが、実際の自立度・介助の必要・症状の記録がないので、${name}は判定保留。`;
      if (a.verdict === 'conflict') {
        if (ag.length && fo.length) return `${sum(fo)}がある一方で${sum(ag)}もあり、どちらとも決められないため、${name}は判定保留。`;
        return a.needsConfirmation ? `${labs.length ? labs.join('・') + 'で、' : ''}${String(a.reason || '').replace(/[。\s]+$/, '')}ため、${name}は判定保留。` : `${basis}が並んでおり、どちらとも決められないため、${name}は判定保留。`;
      }
      return `${a.need ? a.need.replace(/ため$/, '') : '記録が少なく判断できない'}ので、${name}は情報不足。`;
    }

    function phaseVerdictOf(cp, needId, phaseKey) {
      const r = ruleSufficiencyFor(cp)[needId];
      const v = r && r[phaseKey] && r[phaseKey].verdict;
      return v === 'met' || v === 'unmet' || v === 'conflict' ? v : 'unknown';
    }

    function sufficiencyPhaseHtml(cp, needId, phaseKey) {
      if (!sufficiencyHasVerdict(cp, needId)) return '';
      const ph = sufficiencyUiPhases(cp).find(p => p.key === phaseKey);
      if (!ph) return '';
      const v = phaseVerdictOf(cp, needId, phaseKey);
      const a = ruleSufficiencyFor(cp)[needId][phaseKey] || {};
      const labels = myEvidenceLabels(cp, needId);
      const ev = [...new Set(a.evidence || [])].filter(id => labels[id]).map(id => `<button type="button" class="suf-evidence-chip" onclick="jumpToBoardCard(${jsArg(id)})" title="${escapeHtml(labels[id])}">${escapeHtml(labels[id].match(/^[SO]-\d+/)?.[0] || labels[id])}</button>`).join('');
      const icon = v === 'met' ? 'fa-circle-check' : v === 'unmet' ? 'fa-triangle-exclamation' : v === 'conflict' ? 'fa-scale-unbalanced' : 'fa-circle-question';

      const head = `<span class="suf-phase-name">${ph.label}</span><span class="suf-badge suf-${v}"><i class="fa-solid ${icon}"></i> ${SUFFICIENCY_LABELS[v]}</span>`;
      const reason = sufficiencySentence(cp, needId, phaseKey, labels);
      const why = `<div class="suf-phase-why"><span class="suf-reason-label">判定理由</span><p>${escapeHtml(reason)}</p>${ev ? `<div class="suf-ev"><span>根拠カード</span>${ev}</div>` : ''}</div>`;
      return `<section class="suf-phase-block suf-expanded suf-b-${v}" data-suf-phase="${phaseKey}"><div class="suf-phase-head">${head}</div>${why}</section>`;
    }

    function sufficiencyMiniHtml(cp, needId) {
      if (!sufficiencyHasVerdict(cp, needId)) return '';
      const rows = sufficiencyUiPhases(cp).map(ph => {
        const v = phaseVerdictOf(cp, needId, ph.key);
        return `<span class="suf-mini suf-mini-${v}"><span class="suf-mini-ph">${ph.label}</span><span class="suf-mini-v">${SUFFICIENCY_LABELS[v]}</span></span>`;
      }).join('');
      return `<div class="suf-mini-wrap" aria-label="充足状況の一覧">${rows}</div>`;
    }

    function sufficiencyPhaseText(cp, needId, phaseKey) {
      if (!sufficiencyHasVerdict(cp, needId)) return '';
      return `判定：${SUFFICIENCY_LABELS[phaseVerdictOf(cp, needId, phaseKey)]}／判定根拠：${sufficiencySentence(cp, needId, phaseKey)}`;
    }
    function sufficiencyTextOf(cp, needId) {
      if (!sufficiencyHasVerdict(cp, needId)) return '';
      return sufficiencyUiPhases(cp).map(ph => `${ph.label}：${SUFFICIENCY_LABELS[phaseVerdictOf(cp, needId, ph.key)]}`).join('／');
    }
    function sufficiencyControlHtml(cp, needId) {
      const rows = sufficiencyUiPhases(cp).map(ph => {
        const cur = getSufficiency(cp, needId, ph.key);
        const label = SUFFICIENCY_LABELS[cur || 'unknown'];
        return `<span class="suf-line"><span class="suf-phase">${ph.label}</span><span class="suf-badge suf-${cur || 'unknown'}"><i class="fa-solid ${cur === 'met' ? 'fa-circle-check' : cur === 'unmet' ? 'fa-triangle-exclamation' : 'fa-circle-question'}"></i> ${label}</span></span>`;
      }).join('');
      return `<div class="suf-ctl" role="group" aria-label="充足・未充足">${rows}</div>`;
    }

    function sufficiencyHeaderHtml(cp, needId) {
      if (!sufficiencyHasVerdict(cp, needId)) return '';
      const labels = myEvidenceLabels(cp, needId);
      const rows = sufficiencyUiPhases(cp).map(ph => {
        const v = phaseVerdictOf(cp, needId, ph.key);
        const icon = v === 'met' ? 'fa-circle-check' : v === 'unmet' ? 'fa-triangle-exclamation' : v === 'conflict' ? 'fa-scale-unbalanced' : 'fa-circle-question';
        return `<div class="suf-hline suf-b-${v}"><span class="suf-line"><span class="suf-phase">${ph.label}</span><span class="suf-badge suf-${v}"><i class="fa-solid ${icon}"></i> ${SUFFICIENCY_LABELS[v]}</span></span><span class="suf-hwhy">${escapeHtml(sufficiencySentence(cp, needId, ph.key, labels)).replace(/([SO])-(\d+)（([^）]*)）/g, (m, t, n, rest) => `<span class="suf-cref suf-cref-${t}"><b>${t}-${n}</b>（${rest}）</span>`).replace(/(未充足である|充足している|情報不足|判定保留)。$/, (m0, w) => `<b class="suf-end suf-end-${w.replace(/である$|している$/, '')}">${w}</b>。`)}</span></div>`;
      }).join('');
      return `<div class="suf-header" role="group" aria-label="充足・未充足">${rows}</div>`;
    }
    function sufficiencySummaryHtml(cp) {
      return `<span class="suf-sum">${sufficiencyUiPhases(cp).map(ph => {
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

      const ai = ''; // Stored AI feedback from older data is kept silently but no longer shown.
      const historyCount = (e && e.history || []).length;
      const history = historyCount && myAsmHistoryOpen.has(needId) ? myAssessmentHistoryHtml(cp, needId, e) : '';

      return `<div class="my-asm${review ? ' my-asm-attn' : ''}" ondragover="if(event.dataTransfer&&Array.from(event.dataTransfer.types||[]).includes('text/plain')){event.preventDefault();event.currentTarget.classList.add('my-asm-drop');}" ondragleave="event.currentTarget.classList.remove('my-asm-drop')" ondrop="handleMyAssessmentDrop(event, ${needId})">
        <div class="my-asm-head">
          ${isAllMode ? `<button type="button" class="my-asm-toggle" onclick="toggleMyAssessment(${needId})" aria-expanded="true"><i class="fa-solid fa-chevron-down"></i> <i class="fa-solid fa-user-pen"></i> 自分のアセスメント</button>` : `<span class="my-asm-title"><i class="fa-solid fa-user-pen"></i> 自分のアセスメント<small>${need.id}. ${escapeHtml(needName)}</small></span>`}
          <span id="my-asm-state-${needId}" class="my-asm-state">${stateHtml}</span>
          <span class="my-asm-tools">
            <button type="button" class="btn btn-outline my-asm-btn" onclick="undoMyAssessmentEdit(${needId},false)" title="この欲求の文章編集を元に戻す（この画面を開いている間）">元に戻す</button>
            <button type="button" class="btn btn-outline my-asm-btn" onclick="undoMyAssessmentEdit(${needId},true)">やり直す</button>
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
      return `<div class="my-asm-label"><i class="fa-solid fa-list-check"></i> 見直しのポイント</div><ul>${hints.map(h => `<li class="my-hint my-hint-${h.level}"><i class="fa-solid ${icon[h.level]}"></i><span>${escapeHtml(h.text)}</span>${h.itemId ? `<button type="button" class="my-asm-link" onclick="linkMyEvidence(${needId}, ${jsArg(h.itemId)})">根拠に加える</button>` : ''}</li>`).join('')}</ul>`;
    }

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

    // ==========================================================================

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
    const myAssessmentEditHistories = new Map();
    function myAssessmentEditHistory(cp, needId) {
      if(!myAssessmentEditHistories.has(cp.id)) myAssessmentEditHistories.set(cp.id,new Map());
      const needs=myAssessmentEditHistories.get(cp.id);
      if(!needs.has(needId)) needs.set(needId,{undo:[],redo:[]});
      return needs.get(needId);
    }
    function rememberMyAssessmentEdit(cp,needId,field,before,after) {
      if(!['interpretation','cause','outlook','revisionNote'].includes(field) || before===after)return;
      const history=myAssessmentEditHistory(cp,needId),last=history.undo[history.undo.length-1],now=Date.now();
      if(last && last.field===field && last.after===before && now-last.at<750){last.after=after;last.at=now;}
      else history.undo.push({field,before,after,at:now});
      if(history.undo.length>40)history.undo.shift();history.redo=[];
    }
    window.undoMyAssessmentEdit = function(needId,redo=false) {
      const cp=getCurrentPatient(),history=myAssessmentEditHistory(cp,needId),from=redo?history.redo:history.undo,to=redo?history.undo:history.redo,entry=from[from.length-1];
      if(!entry){showToast('戻せるアセスメントの編集はありません','info');return false;}
      const e=getMyAssessment(cp,needId);
      if(!e || String(e[entry.field]||'')!==(redo?entry.before:entry.after)){
        showToast('アセスメントが削除・更新されています。現在の内容を保持しました','warn');return false;
      }
      e[entry.field]=redo?entry.after:entry.before;e.updatedAt=new Date().toISOString();
      from.pop();to.push(entry);if(to.length>40)to.shift();
      commitMyAssessmentChange(cp);
      showToast(redo?'アセスメントの編集をやり直しました':'アセスメントの編集を元に戻しました','info');return true;
    };
    const myAsmCheckTimers = {};
    window.onMyAssessmentInput = function(needId, field, el) {
      const cp = getCurrentPatient();
      const e = ensureMyAssessment(cp, needId);
      rememberMyAssessmentEdit(cp,needId,field,String(e[field]||''),el.value);
      e[field] = el.value;
      e.updatedAt = new Date().toISOString();
      saveMyAssessmentsSoon(cp.id);
      const timerKey=JSON.stringify([cp.id,needId]);
      if (myAsmCheckTimers[timerKey]) clearTimeout(myAsmCheckTimers[timerKey]);
      myAsmCheckTimers[timerKey] = setTimeout(() => {
        delete myAsmCheckTimers[timerKey];
        const current=getCurrentPatient();
        if(current?.id===cp.id)refreshMyAssessmentSideInfo(current, needId);
      }, 500);
    };

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
      try { el.setSelectionRange(f.start, f.end); el.scrollTop = f.scroll; } catch (err) {   }
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
      const cp=getCurrentPatient(),expected=JSON.stringify(getMyAssessment(cp,needId));
      const ok = await openDialog({ title: `第${version}版の内容に戻しますか？`, message: '今の書きかけの文章と根拠のカードが、その版の内容に置き換わります（確定はしません）。', confirmLabel: '戻す' });
      if (ok !== true) return;
      const current=getCurrentPatient();
      if(current?.id!==cp.id || JSON.stringify(getMyAssessment(current,needId))!==expected){showToast('確認中に患者またはアセスメントが更新されました。現在の内容を保持しました','warn');return;}
      if (restoreMyAssessmentFromHistory(current, needId, version)) {
        commitMyAssessmentChange(current);
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

      const e = ensureMyAssessment(cp, needId);
      const ids = [...e.evidenceIds.filter(id => selected.has(id)), ...Array.from(selected).filter(id => !e.evidenceIds.includes(id))];
      setMyEvidenceIds(cp, needId, ids);
      closeEvidencePicker();
      commitMyAssessmentChange(cp);
    };

    function sufficiencyReferenceText() {
      let t = '';
      try { t = buildEffectiveNotebookContent(); } catch (err) { t = ''; }
      const i = t.indexOf('■ 充足・未充足の判断');
      return i >= 0 ? t.slice(i, i + 1800) : '判断視点：①正常値・基準値・日常性との比較 ②各ニード固有の達成基準との照合 ③個別性の評価 ④将来的なリスクの予測';
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
        if (verdict !== 'unknown' && !evidence.length) verdict = 'unknown';
        return { verdict, reason: String(n.reason || '').trim(), evidence: Array.from(new Set(evidence)), need: String(n.need || '').trim(), agree: typeof n.agree === 'boolean' ? n.agree : null };
      };
      (Array.isArray(obj.needs) ? obj.needs : []).forEach(n => {
        const id = Number(n && n.id);
        if (!Number.isInteger(id) || id < 1 || id > 14) return;
        const mineIds = new Set((cp.items || []).filter(i => i.type !== 'unnecessary' && !i.diseaseGeneral && (i.hendersonIds || []).includes(id)).map(i => i.id));
        const r = {};
        SUFFICIENCY_PHASES.forEach(ph => {

          const src = n[ph.key] || (ph.key === 'all' && n.verdict ? n : null);
          const one = cleanOne(src, id, mineIds);
          if (one) r[ph.key] = one;
        });
        if (Object.keys(r).length) out[id] = r;
      });
      return out;
    }

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
      const rvHtml = '';
      if (!lines && !rvHtml) return '';
      return `<div class="suf-reason">${lines}${rvHtml}</div>`;
    }
    let sufficiencyAiRunning = false;

    const SUF_NEG_AFTER = '(?:[^、。,]{0,6})(?:なし|ない|無|訴えず|みられず|見られず|認めず|なく|ありません)';
    const SUF_UNMET_CUES = ['痛み|疼痛|創痛|痛い|NRS\\s*[:：]?\\s*[3-9]|ペインスケール\\s*[「:：]?\\s*[3-9]', '眠れ[なず]|不眠|睡眠(?:不足|障害)|寝つけ', '全介助|要介助|介助(?:が必要|を要|にて|で)|見守りが必要|できない|困難|不可|禁止|制限', '不安|怖い|恐怖|心配|戸惑|情けない|申し訳', '食欲(?:低下|不振|がない|ない)|摂取量(?:半分|減)|半分のみ|おなかすかない|嘔気|嘔吐', '排便(?:なし|なく)|便秘|下痢|腹部膨満|お腹が張', 'べたべた|べたつき|気持ちが悪い|汚れ|悪臭|掻痒', '発赤|腫脹|熱感|発熱|排膿|浮腫|褥瘡', '呼吸困難(?:感)?(?:あり|を訴)|息苦しい|息切れ|チアノーゼ|喘鳴|SpO2\\s*[:：]?\\s*(?:[0-8]\\d|9[0-3])\\s*%', '転倒|ふらつき|不安定|せん妄|不穏|混乱|拒否', '体温[^\\d。、]{0,3}3[89]|3[89](?:\\.\\d)?\\s*度', '[↑↓]', '(?:旅行|趣味|外出|散歩|余暇)[^。]{0,20}(?:したい|できず|できない|行けない|行きたい)|早く治して', '(?:わから|分から)ない|教えて(?:ほしい|欲しい|ください)|大丈夫(?:か|なの|でしょうか)|ずれ(?:たり)?しないか|気を付け(?:れば|ること)', '仕事[^。]{0,10}(?:できない|できず|休)|復職[^。]{0,10}(?:不安|心配|難)|働けな', '体重[^。、]{0,8}(?:減|低下)|[0-9.]+\\s*kg\\s*(?:減|低下)|やせ|朝食[^。、]{0,6}(?:抜|食べない|とらない|欠食|ほとんど食べ)|欠食|野菜嫌い|嫌い|苦手|外食|早食い|偏食|短時間で済ま|早く食べ', '難聴|聞こえ(?:にくい|ない|が悪)|聴力(?:低下|障害)|(?:説明|話|内容)[^。、]{0,8}(?:ほとんど|あまり)?伝わ(?:らない|りにくい)|意思疎通(?:が)?(?:困難|難しい|図れ(?:ない|ず))|失語|構音障害'];
    const SUF_MET_CUES = ['自立|自力|自分で|一人で|問題なし|良好|清明|規則的|正常|普通食|常食|整|障害なし|異常なし|理解(?:力)?(?:あり|良好)|前向き|頑張|楽しみ|きれい好き', '睡眠[^\\d。、]{0,3}[6-9](?:\\s*[~〜～-]\\s*[6-9])?\\s*時間|眠れた|よく眠れ', '食欲(?:良好|あり)|全量摂取|摂取量\\s*(?:良好|十分)', 'SpO2\\s*[:：]?\\s*(?:9[4-9]|100)\\s*%', 'ペインスケール\\s*[「:：]?\\s*[0-2]|NRS\\s*[:：]?\\s*[0-2](?!\\d)|痛みなし|疼痛なし', '体温[^\\d。、]{0,3}(?:3[67]|35\\.[5-9])', '排便\\s*[:：]?\\s*\\d\\s*回/日|排尿\\s*[:：]?\\s*\\d+\\s*回/日', '呼吸困難感(?:の)?訴えなし|肺Air入り(?:が)?良好', '意思疎通(?:は)?(?:良好|可能|図れ)|言葉にで|希望を(?:伝え|話)|質問(?:が)?でき|ナースコール[^。]{0,6}(?:使用|押|できる)|コミュニケーション[^。]{0,6}(?:良好|障害なし)', '理解(?:力)?(?:が)?良好|現状認識(?:が)?良好|理解できて|理解している', '(?:旅行|趣味|友人|外出)[^。]{0,12}(?:楽しむ|楽しん|行って|している)', '信仰[^。]{0,8}なし|宗教[^。]{0,8}なし|特別な宗教', '(?:RR|呼吸数)[^\\d。、]{0,3}(?:1[2-9]|20)(?!\\d)|%(?:VC|肺活量)\\s*(?:[89]\\d|1\\d\\d)|胸部[^。、]{0,8}(?:明らかな)?(?:異常|病変)[^。、]{0,4}(?:なし|認めず|ない)|呼吸困難(?:感)?(?:は)?(?:なし|ない|無)', '趣味|テニス|ゴルフ|ジム|ウォーキング|ジョギング|旅行|友人[^。]{0,6}(?:会|食事)'];

    const SUF_UNMET_SCOPE = [[4, 5, 6, 8, 13, 14], [5], null, [13], [2, 3], [3], [8], [7, 8], [1], [4, 9, 10, 13, 14], [7], null, [13], [14], [12], [2], [10]];
    const SUF_MET_SCOPE = [null, [5], [2], [1], [4, 5, 6, 8, 10, 12, 13, 14], [7], [3], [1], [10], [14], [13], [11], [1], [13]];

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
      let t = String(clause || '').normalize('NFKC');
      // Eating habits (eating out, fast eating, food preference) are risk factors, not an unmet need by themselves; only outcome cues (weight loss, low intake) may decide.
      // Preventive measures (転倒防止策など) are interventions, not a fall event.
      if (needId === 9) t = t.replace(/(?:転倒|転落)(?=防止|予防|対策)/g, ' ');
      if (needId === 2) t = t.replace(/外食|早食い|偏食|野菜嫌い|短時間で済ま[^。、]*|早く食べ[^。、]*/g, ' ');
      if (needId === 1 && /トライボール|ボール|呼吸訓練/.test(t) && !/呼吸困難|息苦|息切れ|チアノーゼ|SpO2|呼吸数/.test(t)) return { v: '', hit: '' };

      if (needId === 12 && !/仕事|職|復職|達成|役割|家事|意欲|生きがい|就労|勤務|主婦/.test(t)) return { v: '', hit: '' };
      const metOk = sufficiencyMetAllowed(t, needId, speech);
      if (needId === 8 && metOk && /(?:シャワー浴|入浴|清拭|洗髪|口腔ケア)(?:を)?(?:する|した|実施|済|行った|できた)/.test(t) && !/予定|禁止|中止|できな/.test(t)) return { v: 'met', hit: '清潔ケアの実施' };
      if (needId === 14 && !speech && /(?:説明|オリエンテーション)[^。]{0,30}(?:受ける|受けた|実施|行った|あり)|(?:呼吸訓練|起き上がり)[^。]{0,15}(?:練習|実施)/.test(t) && !/予定|未実施|中止/.test(t) && !/理解(?:して|でき|良好)|自立|自分で/.test(t)) return { v: 'pending', hit: '説明・練習の実施' };
      // Voicing worry is evidence that the person CAN express it; it does not by itself show unmet communication. Only communication-specific cues count for need 10.
      if (needId === 10 && /不安|心配|怖い|恐怖/.test(t) && !/話せ|話さ|伝え(?:られ|にく)|伝わ|会話|意思疎通|聞こえ|言葉が出|構音|失語|難聴|表出|相談(?:でき|しな)|話したくな/.test(t)) return { v: 'pending', hit: '不安を言葉にできている（コミュニケーションの未充足とは別に評価）' };
      if (needId === 9 && INFECTION_SCREEN_REGEX.test(t)) return { v: 'pending', hit: (t.match(INFECTION_SCREEN_REGEX) || [''])[0] }; // quote the record itself, never a canned phrase
      let unmet = '', met = '';
      for (let k = 0; k < SUF_UNMET_CUES.length; k++) {
        const src = SUF_UNMET_CUES[k], sc = SUF_UNMET_SCOPE[k];
        if (needId && sc && !sc.includes(needId)) continue;
        if (needId === 10 && k === 2 && !/話|伝|会話|言葉|意思|聞|声|表情|相談/.test(t)) continue;
        const m = t.match(new RegExp(`(${src})(${SUF_NEG_AFTER})?`));
        if (!m) continue;
        const negated = m[2] && !/^[↑↓]/.test(m[1]);
        if (negated) { if (metOk) met = met || m[0]; continue; }
        unmet = m[0]; break;
      }

      if (unmet && metOk && /自立|自力/.test(t) && !/全介助|要介助|介助|できない|困難|不可|禁止|制限|見守り/.test(t) && /気持ち|不安|心配|戸惑|申し訳|情けない/.test(unmet)) return { v: 'met', hit: '自立' };
      if (unmet) return { v: 'unmet', hit: unmet };
      if (met) return { v: 'met', hit: met };
      if (!metOk) return { v: '', hit: '' };
      for (let k = 0; k < SUF_MET_CUES.length; k++) { const sc = SUF_MET_SCOPE[k]; if (needId && sc && !sc.includes(needId)) continue; const m = t.match(new RegExp(SUF_MET_CUES[k])); if (m) return { v: 'met', hit: m[0] }; }
      return { v: '', hit: '' };
    }
    const SUF_LEARN_PROBLEM = /(?:通院|受診|外来|治療|服薬|内服|投薬)[^。、]{0,6}(?:を)?(?:自己)?中断|自己中断|(?:内服|服薬|薬)[^。、]{0,8}(?:不規則|不良|不十分|不定期)|アドヒアランス(?:不良|低下)|(?:自己注射|自己血糖測定|血糖測定|吸入|手技|単位)[^。]{0,24}(?:間違|誤|できな|不十分|不正確|忘れ)|(?:観察|管理|セルフケア|測定|記録|注射|服薬)[^。]{0,12}[「『]?(?:面倒|めんどう)/;
    const SUF_SKIN_LESION = /潰瘍|褥瘡|びらん|壊疽|水疱|発赤|熱感|滲出|排膿|膿|腫脹|浸軟|皮膚(?:トラブル|障害|損傷)/g;
    const SUF_PROBLEM_CUE = /痛|苦しい|できない|困難|不能|悪心|嘔|膨満|不眠|眠れ|不安|ふらつ|発熱|発赤|腫脹|熱感|排膿|潰瘍|低下|増強|悪化|拒否|不規則|中断|間違/;
    const SUF_SEVERE = /難聴|伝わらない|全介助|要介助|できない|不可|禁止|不眠|眠れ[なず]|転倒|せん妄|不穏|チアノーゼ|呼吸困難(?:感)?(?:あり|を訴)|息苦しい|SpO2/;
    const SUF_MILD = /やや|軽度|少量|わずか|軽い|軽度/;
    function sufficiencyCardVerdict(item, needId, phase) {
      if (needId === 1 && /トライボール|呼吸訓練/.test(String(item.text || '')) && !/呼吸困難|息苦|息切れ|チアノーゼ|SpO2|呼吸数/.test(String(item.text || ''))) return { v: '', hit: '', clause: '' };

      if (needId === 11 && /記載なし|情報なし|不明|未確認|聴取(?:して)?(?:い)?ない|確認(?:でき|して)ない/.test(String(item.text || '').normalize('NFKC'))) return { v: '', hit: '', clause: '' };
      // v.90: verdict-choice rules (the sufficiency sentences are untouched).
      const whole = String(item.text || '').normalize('NFKC');
      const isOrder = item.fieldLabel === '治療' || /^(?:治療|処方|指示|オーダー|治療方針)[:：]/.test(whole);
      const parts0 = whole.split(/[。\n、,，]|\s{2,}|(?<=[)）])/).map(s => s.trim()).filter(Boolean);
      if (needId === 14 && !isOrder) {
        const m = whole.match(SUF_LEARN_PROBLEM);
        if (m) return { v: 'unmet', hit: m[0], clause: (parts0.find(p => SUF_LEARN_PROBLEM.test(p)) || m[0]), severe: false };
      }
      if (needId === 8 && !isOrder) {
        const m = [...whole.matchAll(SUF_SKIN_LESION)].find(x => !new RegExp('^' + SUF_NEG_AFTER).test(whole.slice(x.index + x[0].length)));
        if (m) return { v: 'unmet', hit: m[0], clause: (parts0.find(p => p.includes(m[0])) || m[0]), severe: false };
      }
      const parts = String(item.text || '').normalize('NFKC').split(/[。\n、,，]|\s{2,}|(?<=[)）])/).map(s => s.trim()).filter(Boolean);
      let met = null, unmet = null, pending = null;

      const speech = /[「」]/.test(String(item.text || ''));
      for (const p of parts) {

        if (phase === 'pre' && /^(?:現在|今回|今は|入院後|術後)/.test(p)) continue;
        const r = sufficiencyClauseVerdict(p, needId, { speech });
        if (r.v === 'unmet') {

          if (SUF_MILD.test(p) || /^[↑↓]$/.test(r.hit)) continue;
          if (!unmet) unmet = { v: 'unmet', hit: r.hit, clause: p, severe: SUF_SEVERE.test(p) };
          else if (SUF_SEVERE.test(p)) unmet.severe = true;
        }
        if (r.v === 'met' && !met) met = { v: 'met', hit: r.hit, clause: p };
        if (r.v === 'pending' && !pending) pending = { v: 'pending', hit: r.hit, clause: p };
      }

      if (!unmet && !met && needId === 10 && speech) {
        const q = (String(item.text || '').match(/「[^」]{4,}」/) || [String(item.text || '')])[0];
        if (/不安|心配|怖い|恐怖/.test(String(item.text || ''))) pending = { v: 'pending', hit: '不安を言葉にできている', clause: q.slice(0, 30) };
        else met = { v: 'met', hit: '発言', clause: q.slice(0, 30) };
      }
      if (isOrder) {
        // A treatment/order line is an intervention, not a patient state: only a stated problem may make it unmet, and it never shows 充足.
        if (unmet && !SUF_PROBLEM_CUE.test(unmet.clause)) unmet = null;
        met = null; pending = null;
      }
      return unmet || met || pending || { v: '', hit: '', clause: '' };
    }
    function placeByDate(i) {
      return typeof inferAssessmentColumn === 'function' ? inferAssessmentColumn(i.fieldLabel, i.timestamp, null) : null;
    }

    const SUF_STATE_RULES = [
      { need: 2, re: /絶飲食|禁飲食|絶食|飲水(?:も)?禁止|禁食|NPO/, lift: /(?:絶飲食|絶食|禁飲食|NPO)[^。、]{0,4}解除|(?:食事|飲水|経口摂取|水分)[^。、]{0,4}(?:開始|再開)|流動食|五分粥|全粥|粥食|全量摂取|[0-9]割摂取/, label: '術後の絶飲食（治療のため、通常の食事・水分摂取ができていない）',

        exempt: (hit, all) => hit.every(t => /(?:絶食|絶飲食|禁飲食|NPO)[^。、]{0,4}[0-9]+\s*時間|術前|前日/.test(t)) && /補液|輸液|補給|点滴|水分(?:補給|摂取)(?:の)?(?:予定|計画)/.test(all) && !/不足|低下|脱水|減少|摂取(?:でき|困難)|悪心|嘔/.test(all) },
      { need: 3, re: /留置カテーテル|膀胱留置|尿道留置|バルーンカテーテル|尿道バルーン|尿道カテーテル|導尿/, lift: /(?:カテーテル|バルーン)[^。、]{0,4}(?:抜去|抜い|除去)|自尿|自排尿/, label: '膀胱留置カテーテル（排尿を管に頼っており、通常の排泄を自力で満たせていない）',

        exempt: (hit, all) => /流出(?:は)?(?:良好|あり)|尿量[^。、]{0,8}(?:良好|十分|[0-9]{3,}\s*m[lL])/.test(all) && !/閉塞|流出(?:不良|なし|不|悪)|尿量(?:減少|少な)|乏尿|無尿|血尿|混濁|膀胱刺激|疼痛|痛み/.test(all) },
      { need: 4, re: /床上安静|ベッド上安静|絶対安静|ベッド安静/, lift: /安静(?:度)?[^。、]{0,4}(?:解除|拡大|フリー)|歩行(?:が)?可能|自力歩行|室内歩行|トイレ歩行|病棟歩行|離床(?:した|でき|を開始|開始)/, label: '術後の床上安静（治療のため、動くこと・姿勢を保つことが制限されている）' }
    ];
    const SUF_RESP_DIRECT = /酸素\s*[0-9]|酸素(?:投与|吸入)|(?<![A-Za-z])O2\s*[0-9]|湿性咳嗽|息遣い(?:は)?浅|浅い呼吸|呼吸(?:が)?浅|浅表性|顔色(?:やや)?(?:不良|蒼白)|蒼白|チアノーゼ|喘鳴|呼吸困難(?:感)?(?:あり|を訴|が強)|痰(?:が)?(?:多|絡)/g;
    // v.91 reference-document rules (参考資料 2026-10-16, 出典未確認). Recorded scores/values only; thresholds are 参考基準, never a diagnosis.
    // Missing or unreadable values change nothing; normal values never make a need 未充足.
    function sufficiencyScoreRules(text) {
      const t = String(text || '').normalize('NFKC');
      const out = [];
      const num = re => { const m = t.match(re); return m ? Number(m[1]) : null; };
      const bi = num(/(?:バーセル(?:インデックス)?|Barthel(?:\s*Index)?|(?<![A-Za-z])BI)\s*[:：=は]?\s*(\d{1,3})\s*(?:点|\/\s*100)?/i);
      if (bi !== null && bi <= 100) {
        const hit = (t.match(/(?:バーセル(?:インデックス)?|Barthel(?:\s*Index)?|(?<![A-Za-z])BI)\s*[:：=は]?\s*\d{1,3}\s*(?:点|\/\s*100)?/i) || [''])[0];
        [3, 4, 6, 8].forEach(n => out.push({ need: n, v: bi >= 100 ? 'met' : bi < 60 ? 'unmet' : bi < 85 ? 'partial' : '', hit, ref: 'Barthel Index：100点＝自立、60点未満＝要介助、60〜84点＝部分自立（参考基準）' }));
      }
      const br = num(/(?:ブレーデン(?:スケール)?|Braden(?:\s*Scale)?)\s*[:：=は]?\s*(\d{1,2})\s*点?/i);
      if (br !== null && br >= 6 && br <= 23) {
        const home = /在宅|訪問|施設/.test(t);
        if (br <= (home ? 17 : 14)) out.push({ need: 8, v: 'unmet', hit: (t.match(/(?:ブレーデン(?:スケール)?|Braden(?:\s*Scale)?)\s*[:：=は]?\s*\d{1,2}\s*点?/i) || [''])[0], ref: `Braden：${home ? '在宅17点以下' : '病院14点以下'}は褥瘡の高リスク（参考基準）` });
      }
      const sp = num(/SpO2\s*[:：=]?\s*(\d{2,3})\s*%/i);
      if (sp !== null && sp <= 100) out.push({ need: 1, v: sp < 90 ? 'unmet' : sp >= 95 ? 'met' : '', hit: (t.match(/SpO2\s*[:：=]?\s*\d{2,3}\s*%/i) || [''])[0], ref: 'SpO2：90%未満は呼吸の未充足を疑う、95%以上は通常範囲（参考基準）' });
      if (/頻呼吸|呼吸数\s*[:：]?\s*(?:2[5-9]|[3-9]\d)\s*回/.test(t) && !/頻呼吸(?:なし|ない)/.test(t)) out.push({ need: 1, v: 'unmet', hit: (t.match(/頻呼吸|呼吸数\s*[:：]?\s*\d+\s*回/) || [''])[0], ref: '頻呼吸（参考基準）' });
      const wl = t.match(/(?:体重)[^。、\d]{0,6}(\d+(?:\.\d+)?)\s*%\s*(?:以上の)?(?:減少|減|低下)|(\d+(?:\.\d+)?)\s*%\s*(?:の)?体重(?:減少|減)/);
      const wlp = wl ? Number(wl[1] || wl[2]) : null;
      const bmi = num(/BMI\s*[:：=]?\s*(\d{1,2}(?:\.\d+)?)/i), alb = num(/(?:Alb|アルブミン)\s*[:：=]?\s*(\d(?:\.\d+)?)/i);
      if (wlp !== null && wlp >= 5 && /(?:6\s*か月|6\s*ヶ月|半年|6\s*カ月)/.test(t)) out.push({ need: 2, v: 'unmet', hit: wl[0], ref: '体重減少5%以上/6か月（参考基準）' });
      if (bmi !== null && bmi > 0 && bmi < 18.5) out.push({ need: 2, v: 'unmet', hit: `BMI ${bmi}`, ref: 'BMI18.5未満は低体重（参考基準）' });
      if (alb !== null && alb > 0 && alb < 3.5 && !/Alb\s*[:：=]?\s*\d(?:\.\d+)?\s*(?:mg|μ)/i.test(t)) out.push({ need: 2, v: 'unmet', hit: (t.match(/(?:Alb|アルブミン)\s*[:：=]?\s*\d(?:\.\d+)?/i) || [''])[0], ref: 'Alb低値は栄養状態の参考（参考基準）' });
      const a1c = num(/HbA1c\s*(?:\(NGSP\))?\s*[:：=]?\s*(\d{1,2}(?:\.\d+)?)\s*%?/i);
      if (a1c !== null && a1c >= 9 && a1c <= 20) [2, 14].forEach(n => out.push({ need: n, v: 'unmet', hit: (t.match(/HbA1c\s*(?:\(NGSP\))?\s*[:：=]?\s*\d{1,2}(?:\.\d+)?\s*%?/i) || [''])[0], ref: 'HbA1c 9%以上は血糖管理不良の目安。食事・自己管理（学習）の確認が必要（参考基準）' }));
      return out;
    }
    // Value rules (not tag-gated) + per-need criteria (only on cards tagged for that need), evaluated together so supporting and problematic findings are weighed in one place.
    function sufficiencyAllRules(text) { return [...(/[「」]/.test(String(text || '')) ? [] : sufficiencyScoreRules(text)), ...sufficiencyPerNeedRules(text).map(x => ({ ...x, tag: true }))]; }
    const SUF_SOFT_REF = /HbA1c|Alb|Hb低値|eGFR|BMI|体重減少/;
    const SUF_COMPENSATE = /改善傾向|改善(?:して)?(?:いる|した|あり)|コントロール良好|管理良好|安定している|治療により|内服により|症状(?:は)?(?:なし|ない)|自覚症状(?:は)?(?:なし|ない)|無症状|問題なく|支障なし/;
    const sufNums = t => String(t || '').normalize('NFKC').match(/\d+(?:\.\d+)?/g) || [];
    // Same observation? (a compensating fact must be a different record/clause than the problem itself.)
    const sufSameFact = (a, b) => { const x = sufNums(a), y = sufNums(b); return (!!a && !!b && (String(a).includes(String(b)) || String(b).includes(String(a)))) || x.some(n => y.includes(n)); };
    // v.93: integrate the recorded value rules with the card-level findings of the same phase (supporting vs problematic).
    function sufficiencyScoreOverrides(items, res, isPre, rulesFn, tagged, subOf) {
      const rulesOf = rulesFn || sufficiencyScoreRules;
      const okCard = i => tagged || !/[「」]/.test(String(i.text || ''));
      const post = items.filter(i => !isPre(i) && okCard(i));
      const pre = items.filter(i => isPre(i) && okCard(i));
      const apply = (list, phaseKeys) => {
        const byNeed = {};
        list.forEach(i => rulesOf(i.text).forEach(r => { if (r.v && (!r.tag || (i.hendersonIds || []).includes(r.need))) (byNeed[r.need] = byNeed[r.need] || []).push({ ...r, id: i.id }); }));
        Object.keys(byNeed).forEach(n => {
          const r = res[n]; if (!r) return;
          const rs = byNeed[n];
          const um = rs.filter(x => x.v === 'unmet'), mt = rs.filter(x => x.v === 'met'), pt = rs.filter(x => x.v === 'partial');
          const pick = um.length ? um : (!um.length && pt.length) ? pt : mt;
          let verdict = um.length ? 'unmet' : pt.length ? 'conflict' : 'met';
          const g = pick[0];
          const cur = phaseKeys.map(k => r[k]).find(Boolean) || {};
          const mkFact = x => ({ id: x.id, text: x.hit, kind: /\d/.test(x.hit) ? 'value' : 'obs', ref: x.ref });
          const newAgainst = um.map(mkFact).concat(pt.map(mkFact));
          const newFor = mt.map(mkFact);
          const curF = cur.facts || { against: [], for: [] };
          const dedupe = arr => { const seen = new Set(); return arr.filter(f => { const k = f.id + '|' + f.text; if (seen.has(k)) return false; seen.add(k); return true; }); };
          const cleanFor = (fors, ag) => fors.filter(f => !ag.some(a => sufSameFact(f.text, a.text)));
          const ag = dedupe([...newAgainst, ...(curF.against || [])]);
          const facts = { against: ag, for: cleanFor(dedupe([...newFor, ...(curF.for || [])]), ag) };
          let compensated = null;
          // Compensation: only soft laboratory/anthropometric values, outweighed by a recorded compensating fact of another clause.
          if (verdict === 'unmet' && um.every(x => /\d/.test(x.hit) && SUF_SOFT_REF.test(x.ref || '')) && !(cur.verdict === 'unmet' && !cur.restriction)) {
            let comp = cleanFor([...newFor, ...(cur.verdict === 'met' ? (curF.for || []) : [])], newAgainst)[0];
            if (!comp) {
              const hit = list.filter(i => (i.hendersonIds || []).includes(Number(n))).map(i => ({ i, m: String(i.text || '').normalize('NFKC').split(/[。\n、,，]/).find(c => SUF_COMPENSATE.test(c) && !um.some(x => sufSameFact(c, x.hit))) })).find(x => x.m);
              if (hit) comp = { id: hit.i.id, text: hit.m.trim().slice(0, 40), kind: 'obs' };
            }
            if (comp) { compensated = comp; verdict = 'met'; if (!facts.for.some(f => f.id === comp.id && f.text === comp.text)) facts.for.push(comp); }
          }
          // never overwrite a verdict that already rests on other recorded evidence unless a problem is recorded over a 充足
          const keep = () => { if (cur.verdict) cur.facts = facts; };
          if (cur.verdict === 'unmet' && !cur.restriction && verdict !== 'unmet') return keep();
          if (cur.verdict === 'met' && verdict === 'met' && !compensated) return keep();
          if (cur.verdict && cur.verdict !== 'unknown' && cur.verdict !== 'met' && verdict === 'met' && !compensated) return keep();
          if (cur.verdict === 'unmet' && !cur.restriction && verdict === 'unmet') return keep();
          const evidence = compensated ? Array.from(new Set([...um.map(x => x.id), compensated.id])).slice(0, 5) : pick.map(x => x.id).slice(0, 5);
          const v = { verdict, reason: `「${g.hit}」`, evidence, need: '', refStandard: g.ref, facts, ...(compensated ? { compensated: true } : {}), ...(verdict === 'conflict' ? { needsConfirmation: true } : {}) };
          phaseKeys.forEach(k => { if (r[k] || k === 'all') r[k] = v; });
        });
      };
      apply(post, ['post', 'all']);
      apply(pre, ['pre', 'all']);
      if (typeof subOf === 'function') {
        apply(post.filter(i => subOf(i) === 'pre'), ['preop']);
        apply(post.filter(i => ['post', 'op'].includes(subOf(i))), ['postop']);
      }
    }
    // v.92 per-need criteria (参考資料 2026-10-16b, 出典未確認). Recorded observations/values only; no inference from disease name, age or comorbidity.
    // Unmet cues are skipped when negated (なし/ない). 'met' cues are ignored inside quotes. Missing -> no verdict (情報不足).
    const PN = {
      unmetNeg: new RegExp('^' + SUF_NEG_AFTER),
      consc: /昏睡|意識(?:消失|障害|なし|レベル低下)|JCS\s*[1-3]00|GCS\s*[3-8](?!\d)/
    };
    const PN_UNMET = [
      [1, /喘鳴|努力呼吸|陥没呼吸|(?:湿性|断続性|副)?ラ音|呼吸困難(?:感)?(?:あり|を訴|が強|の訴えあり)|息苦しさ?を訴/, '喘鳴・努力呼吸・副雑音・呼吸困難の訴えのいずれか（参考基準）'],
      [2, /(?:即席|カップ麺|カップラーメン|インスタント|弁当|コンビニ|菓子パン|ファストフード)[^。]{0,8}(?:中心|ばかり|ばっかり|が多い|のみ|主)/, '食事内容の偏り（血糖の異常値と合わせて判断）'],
      [3, /便秘|下痢|失禁|濃縮尿|水分(?:を)?控え|水分摂取(?:量)?(?:不足|少な|低下)|(?:飲水|水分摂取)量\s*[:：]?\s*(?:[1-4]\d\d|500)\s*mL(?:\/日)?/, '便秘・下痢・失禁・水分摂取不足'],
      [4, /座位(?:保持)?(?:が)?(?:困難|不能|できな)|体位(?:保持|変換)(?:が)?(?:困難|不能|できな)|(?:麻痺|骨折|疼痛)(?:の|で|のため)[^。]{0,8}(?:保持|座位|体位)[^。]{0,6}(?:できな|困難)|同一(?:体位|姿勢)[^。]{0,6}(?:長時間|続)/, '体位・座位の保持困難'],
      [5, /睡眠[^\d。、]{0,3}[0-4](?:\.\d)?\s*時間|(?:頻回(?:の|な)?|中途)覚醒|早朝覚醒|熟眠感(?:なし|がない|得られ)|不眠(?:を訴|あり)/, '睡眠5時間未満・頻回覚醒・不眠の訴え'],
      [6, /(?:更衣|着脱|着替え|ボタン(?:操作)?)[^。]{0,8}(?:介助(?!は?(?:不要|なし|いらない))|困難|できな|要する|手伝)|(?:衣類|服)[^。]{0,6}(?:暑すぎ|寒すぎ|不適|合って(?:い)?ない|サイズが合わ)/, '更衣の介助・困難、衣類の不適合'],
      [8, /(?:入浴|シャワー浴?)[^。]{0,4}(?:未実施|できて(?:い)?ない|できず|介助(?:が)?(?:必要|要))|口腔(?:内)?(?:不潔|汚染)|舌苔(?:あり|が)/, '入浴未実施・口腔不潔'],
      [9, /せん妄|見当識障害|(?:点滴|ルート|ドレーン|チューブ)[^。]{0,4}(?:の)?自己抜去|自己抜去|病室[^。]{0,4}(?:を)?出(?:て|よう)|徘徊|離院|(?:転倒|転落)(?:対策|防止)[^。]{0,6}(?:未実施|なし|不十分|できて(?:い)?ない)|手すり[^。]{0,4}(?:なし|ない)|(?:誤嚥|感染)(?:対策|予防)[^。]{0,6}(?:不十分|未実施)/, 'せん妄・見当識障害・抜去行動・徘徊・安全対策の不足'],
      [10, /無反応|意思疎通(?:が)?(?:不能|困難|できな)|(?:言語|聴覚)障害|構音障害|補聴器[^。]{0,6}(?:なし|未装着|使用せず|使っていない)/, '意思疎通の障害・補助具なし'],
      [11, /(?:宗教|信仰|信条|礼拝|祈り|お祈り|断食|ラマダン|ハラール|エホバ|仏教|キリスト教|イスラム)[^。]{0,16}(?:制限|できな|できず|反する|困難|拒否|苦痛|守れ|禁|妨げ)|輸血(?:を)?拒否|宗教(?:的)?(?:理由|上)[^。]{0,8}(?:拒否|断|できな)/, '信仰上の制限・拒否・苦痛の明示的な記載'],
      [12, /役割(?:を)?(?:失|喪失)|仕事(?:が)?でき(?:ず|ない)|休職[^。]{0,6}(?:不安|心配)|生きがい(?:を)?(?:失|なくし)/, '役割喪失・仕事への不安'],
      [13, /趣味[^。]{0,10}(?:できな|やめ|失|諦め|行けな|なくなっ)|気分転換[^。]{0,6}(?:できな|なし|ない)|退屈|やることがない/, '趣味の喪失・気分転換なし・退屈'],
      [14, /(?:全然|まったく|ほとんど)(?:わから|分から)な|(?:わから|分から)なかった|理解不足|知識不足|無関心|学習意欲(?:低下|なし|が(?:ない|低))|病識(?:なし|欠如|乏し)/, '理解不足・無関心・学習意欲の低下']
    ];
    const PN_MET = [
      [2, /(?:食事|摂取)(?:量)?[^。、]{0,6}(?:全量|10割|9割|8割|良好|十分)|食欲(?:も)?(?:良好|旺盛)|嚥下(?:は)?(?:良好|問題なし)/, '食事摂取・食欲・嚥下の良好な記録'],
      [3, /(?:排便|排尿)[^。]{0,8}(?:順調|問題なし|普通|正常|規則的)/, '排便・排尿の回数・性状の良好な記録'],
      [4, /自力で(?:体位変換|寝返り|座位)|座位(?:保持)?(?:が)?(?:可能|安定|良好|できる)|端座位(?:保持)?(?:が)?(?:可能|安定|良好)/, '自力での体位変換・座位保持'],
      [5, /熟眠感(?:あり|を得)|ぐっすり眠れ|睡眠[^\d。、]{0,3}[6-8]\s*時間/, '睡眠時間・熟眠感'],
      [6, /(?:更衣|着脱|着替え)[^。]{0,6}(?:自立|自分で|可能|できる)|季節に(?:合った|適した)(?:衣類|服)/, '更衣の自立・衣類の適合'],
      [9, /(?:転倒|転落)(?:防止|予防)(?:策|対策)?[^。]{0,8}(?:実施|施行|済|行っ)|(?:手すり|滑り止め|履物|ベッド柵|センサー|ナースコール)[^。]{0,8}(?:設置|使用|装着|実施|確認)|(?:感染対策|感染予防)[^。]{0,6}(?:実施|徹底)|見当識(?:は)?(?:良好|保たれ)|認知機能(?:は)?(?:正常|保たれ)/, '安全対策の実施・見当識の保持'],
      [10, /補聴器[^。]{0,6}(?:使用|装着)[^。]{0,10}(?:会話|聞こえ|意思疎通)|筆談(?:で)?(?:は)?(?:可能|できる|意思疎通)|意思疎通(?:は)?(?:良好|可能)/, '意思疎通の良好な記録・補助具の使用'],
      [11, /(?:宗教|信仰|信条|礼拝|祈り|お祈り)[^。]{0,16}(?:支障なし|問題なし|尊重|配慮|継続|実践でき|守られ|行えて|できて|可能)|礼拝[^。]{0,4}(?:している|できている|行っている)/, '信仰・宗教習慣の実践に支障がない明示的な記載'],
      [12, /仕事[^。]{0,8}(?:達成感|やりがい|充実)|社会参加|役割[^。]{0,6}(?:果たせ|持って|ある)|ボランティア/, '仕事・社会的役割での達成感'],
      [13, /(?:趣味|レクリエーション|レク|散歩|読書|園芸|カラオケ)[^。]{0,12}(?:続けて|楽しん|楽しみ|している|行っている|参加)|楽しみ(?:が)?ある/, '趣味・レクリエーションの継続・楽しみ'],
      [14, /(?:病状|病気|治療)[^。]{0,8}理解(?:して|でき|良好)|質問(?:が)?でき|自分の言葉で説明/, '病状・治療の理解、質問できる']
    ];
    function sufficiencyPerNeedRules(text) {
      const t = String(text || '').normalize('NFKC');
      const out = [], quoted = /[「」]/.test(t);
      const find = (re, flags) => { const g = new RegExp(re.source, 'g'); return [...t.matchAll(g)].find(m => !PN.unmetNeg.test(t.slice(m.index + m[0].length))); };
      PN_UNMET.forEach(([need, re, ref]) => {
        if (need === 10 && PN.consc.test(t)) return; // unconscious / no speech: not observable -> 情報不足, not 未充足
        const m = find(re);
        if (m) out.push({ need, v: 'unmet', hit: m[0], ref });
      });
      if (!quoted) PN_MET.forEach(([need, re, ref]) => {
        if (out.some(x => x.need === need && x.v === 'unmet')) return;
        const m = t.match(re);
        if (m) out.push({ need, v: 'met', hit: m[0], ref });
      });
      const num = re => { const m = t.match(re); return m ? Number(m[1]) : null; };
      // 呼吸: 充足 needs gas exchange AND comfortable breathing
      const sp = num(/SpO2\s*[:：=]?\s*(\d{2,3})\s*%/i), rr = num(/(?:RR|呼吸数)\s*[:：=]?\s*(\d{1,2})(?!\d)/);
      const comfort = /呼吸困難(?:感)?(?:の訴え)?(?:は)?(?:なし|ない|無)|息苦しさ(?:は)?(?:なし|ない)|呼吸音(?:は)?(?:清|正常|良好)|副雑音(?:なし|を認めず)|肺Air入り(?:が)?良好/.test(t);
      if (sp !== null && sp >= 95 && sp <= 100 && (comfort || (rr !== null && rr >= 12 && rr <= 20)) && !out.some(x => x.need === 1 && x.v === 'unmet')) out.push({ need: 1, v: 'met', hit: `SpO2 ${sp}%`, ref: 'SpO2 95%以上かつ呼吸困難なし／呼吸数12〜20（ガス交換と安楽な呼吸の両方）' });
      if (rr !== null && rr > 20 && rr < 60 && /(?:RR|呼吸数)/.test(t) && sp === null) out.push({ need: 1, v: 'partial', hit: `呼吸数 ${rr}`, ref: '呼吸数が12〜20の外（判定保留。症状・SpO2と合わせて確認）' });
      // 体温: 36.0〜37.2 充足（36.5〜37.2が基準、36.0〜37.4を通常域として偽の未充足を避ける）、37.3〜37.5 判定保留、37.5超または35.0未満 未充足
      const bt = t.match(/(?:体温|BT|KT)\s*[:：=]?\s*(3[3-9](?:\.\d)?|4[0-2](?:\.\d)?)/);
      if (bt) {
        const v = Number(bt[1]), hit = bt[0];
        const row = v > 37.5 || v < 35.0 ? 'unmet' : v >= 37.3 ? 'partial' : v < 36.0 ? 'partial' : 'met';
        out.push({ need: 7, v: row, hit, ref: '体温 36.0〜37.2は通常（36.5〜37.2が基準）、37.3〜37.5は判定保留、37.5超または35.0未満は未充足' });
      }
      if (/(?:寒気|悪寒|震え|熱感)(?:を訴|あり|が強)/.test(t) && !/(?:寒気|悪寒|震え|熱感)(?:なし|はない)/.test(t)) out.push({ need: 7, v: 'unmet', hit: (t.match(/(?:寒気|悪寒|震え|熱感)(?:を訴|あり|が強)/) || [''])[0], ref: '寒気・震え・熱感の訴え' });
      // 栄養・検査: BMI 18.5〜24.9 は充足の支えのみ、25以上は判定保留。Alb 3.5以上、Hb低値。腎機能 eGFR<60。
      const bmi = num(/BMI\s*[:：=]?\s*(\d{1,2}(?:\.\d+)?)/i), alb = num(/(?:Alb|アルブミン)\s*[:：=]?\s*(\d(?:\.\d+)?)(?!\d)/i), hb = num(/(?:Hb(?!A1c)|ヘモグロビン)\s*[:：=]?\s*(\d{1,2}(?:\.\d+)?)/i), egfr = num(/eGFR\s*[:：=]?\s*(\d{1,3}(?:\.\d+)?)/i);
      if (bmi !== null && bmi >= 25 && bmi < 60) out.push({ need: 2, v: 'partial', hit: `BMI ${bmi}`, ref: 'BMI 25以上は判定保留（他の所見と合わせて確認）' });
      else if (bmi !== null && bmi >= 18.5 && bmi < 25 && !/体重(?:減少|が減)/.test(t)) out.push({ need: 2, v: 'met', hit: `BMI ${bmi}`, ref: 'BMI 18.5〜25未満（体重減少がない場合の支え）' });
      if (alb !== null && alb >= 3.5 && alb <= 6 && !/(?:Alb|アルブミン)[^。、]{0,6}\d\s*(?:mg|μ)/i.test(t)) out.push({ need: 2, v: 'met', hit: `Alb ${alb}`, ref: 'Alb 3.5以上（支え）' });
      if (hb !== null && hb > 0 && hb < 10) out.push({ need: 2, v: 'unmet', hit: `Hb ${hb}`, ref: 'Hb低値（貧血の参考）' });
      if (egfr !== null && egfr > 0 && egfr < 60) out.push({ need: 3, v: 'unmet', hit: `eGFR ${egfr}`, ref: 'eGFR 60未満は腎機能低下の目安' });
      const a1c = num(/HbA1c\s*(?:\(NGSP\))?\s*[:：=]?\s*(\d{1,2}(?:\.\d+)?)/i), glu = num(/血糖(?:値)?\s*[:：=]?\s*(\d{2,4})/);
      if (out.some(x => x.need === 2 && x.v === 'unmet' && /食事内容の偏り/.test(x.ref)) && !((a1c !== null && a1c >= 6.5) || (glu !== null && glu >= 200) || /血糖(?:値)?(?:が|は)?高/.test(t))) {
        for (let k = out.length - 1; k >= 0; k--) if (out[k].need === 2 && /食事内容の偏り/.test(out[k].ref)) out.splice(k, 1);
      }
      return out;
    }
    const SUF_CAUSE_RULES = [['体力', /喘鳴|努力呼吸|座位|体位|着脱|麻痺|筋力|痛|創|安静|息苦|息切れ|疲|倦怠|全介助|要介助|困難|ふらつ|低下|SpO2|Barthel|バーセル|ブレーデン|Braden/i], ['意思力', /無関心|学習意欲|退屈|役割|意欲|不安|恐怖|面倒|めんどう|拒否|気兼ね|羞恥|やる気|中断|落ち込|抑うつ/], ['知識', /偏り|即席|カップ麺|水分(?:を)?控え|知識不足|理解不足|知らな|わからな|分からな|理解|間違|誤|手技|指導|説明|不規則|自己判断|HbA1c/i]];
    // Optional hint for 未充足 (体力／意思力／知識 の不足). Shown beside the verdict, never inside the sufficiency sentences.
    function sufficiencyCauseHint(text) {
      const t = String(text || '').normalize('NFKC');
      return SUF_CAUSE_RULES.filter(([, re]) => re.test(t)).map(([n]) => n);
    }
    function sufficiencyStateOverrides(items, res, isPre) {
      const post = items.filter(i => !isPre(i) && !/[「」]/.test(String(i.text || '')));
      const nz = x => String(x || '').normalize('NFKC');
      const idx = new Map(items.map((i, n) => [i, n]));

      const set = (needId, reason, ev, direct) => {
        const r = res[needId]; if (!r) return;
        const evIds = ev.slice(0, 5).map(i => i.id);
        if (!direct) {
          const cur = r.post;
          if (cur && cur.verdict === 'unmet' && !cur.restriction) return;
          const v0 = { verdict: 'conflict', reason, evidence: evIds, need: '', restriction: true };
          r.post = v0; if (r.postop) r.postop = v0; if (!r.all || r.all.verdict !== 'unmet') r.all = v0;
          return;
        }
        const v = { verdict: 'unmet', reason, evidence: evIds, need: '', facts: { against: ev.slice(0, 5).map(i => ({ id: i.id, text: nz(i.text).slice(0, 40), kind: 'obs' })), for: [] } };
        r.post = v; if (r.postop) r.postop = v; if (!r.all || r.all.verdict !== 'unmet') r.all = v;
      };
      SUF_STATE_RULES.forEach(rule => {
        const hit = post.filter(i => rule.re.test(nz(i.text)));
        if (!hit.length) return;
        const lastAt = Math.max(...hit.map(i => idx.get(i)));

        if (post.some(i => idx.get(i) > lastAt && rule.lift.test(nz(i.text)))) return;
        if (rule.exempt && rule.exempt(hit.map(i => nz(i.text)), post.map(i => nz(i.text)).join(' '))) return;
        set(rule.need, rule.label, hit);
      });

      const found = [], evs = [];

      const allPost = post.map(i => nz(i.text)).join(' ');
      const stable = /呼吸困難(?:感)?(?:の訴え)?(?:は)?(?:なし|ない|無)|訴えなし/.test(allPost) && /SpO2\s*[:：]?\s*(?:9[4-9]|100)/.test(allPost);
      const OXY_ONLY = /^(?:酸素|O2)/;
      post.forEach(i => { const m = nz(i.text).match(SUF_RESP_DIRECT); if (m) { const mm = stable ? m.filter(x => !OXY_ONLY.test(x)) : m; if (!mm.length) return; mm.forEach(x => { if (!found.includes(x)) found.push(x); }); evs.push(i); } });
      if (found.length) set(1, `術後の直接の所見（${found.slice(0, 5).join('・')}）`, evs, true);
    }
    function judgeSufficiencyByRules(cp) {

      const HISTORY_LABELS = ['現病歴', '診断名', '既往歴', '手術術式', '氏名', '年齢', '性別'];
      const items = (cp.items || []).filter(i => i && !i.deleted && !i.aiSuggested && i.type !== 'unnecessary' && !isMissingInfoOnlyItem(i) && !HISTORY_LABELS.includes(i.fieldLabel));
      const out = {};
      const surgical = isSurgicalPatient(cp);
      HENDERSON_NEEDS.forEach(need => {
        const mine = items.filter(i => !i.diseaseGeneral && (i.hendersonIds || []).includes(need.id));
        const colOf = i => (i.assessmentCols && i.assessmentCols[need.id]) || 'unclassified';

        const effCol = i => { const x = colOf(i); return x === 'unclassified' ? (placeByDate(i) || x) : x; };

        const judge = (cards, label, phaseKey) => {

          const rs = cards.map(i => {
            let r = sufficiencyCardVerdict(i, need.id, phaseKey);
            if (isPreop(i) && ((phaseKey === 'pre' && r.v === 'unmet') || (phaseKey === 'post' && r.v === 'met'))) r = { v: '', hit: '', clause: '' };
            return { i, r };
          });
          const um = rs.filter(x => x.r.v === 'unmet'), mt = rs.filter(x => x.r.v === 'met');
          const short = x => { const c = x.r.clause.slice(0, 30); return /^「.*」$/.test(c) ? c : `「${c}」`; };

          const fct = list => list.slice(0, 5).map(x => ({ id: x.i.id, text: String(x.r.clause || x.r.hit || '').replace(/^[「『]|[」』]$/g, '').slice(0, 40), kind: 'obs' }));
          const facts = () => ({ against: fct(um), for: fct(mt) });
          if (um.length && mt.length && um.length === mt.length && !um.some(x => x.r.severe)) return { verdict: 'conflict', facts: facts(), reason: `充足を示す${mt.slice(0, 2).map(short).join('')}と、未充足を示す${um.slice(0, 2).map(short).join('')}`, evidence: [...mt.slice(0, 3), ...um.slice(0, 3)].map(x => x.i.id), need: '' };
          if (um.length && (um.some(x => x.r.severe) || um.length * 2 >= mt.length)) return { verdict: 'unmet', facts: facts(), reason: `${um.slice(0, 3).map(short).join('')}`, evidence: um.slice(0, 5).map(x => x.i.id), need: '' };
          if (mt.length) return { verdict: 'met', facts: facts(), reason: `${mt.slice(0, 3).map(short).join('')}`, evidence: mt.slice(0, 5).map(x => x.i.id), need: '' };
          const pending = rs.filter(x => x.r.v === 'pending');
          if (pending.length) return { verdict: 'conflict', needsConfirmation: true, reason: need.id === 14 ? '説明・練習は実施されているが、理解の程度や自分で実施できるかの確認が必要' : need.id === 10 ? '不安や思いを言葉にできているが、伝達上の困りごとがないかは別に確認する必要がある' : '感染症検査の陰性結果は確認できるが、転倒など他の安全面は別に確認する必要がある', evidence: pending.slice(0, 5).map(x => x.i.id), need: '' };
          if (need.id === 11 && cards.some(i => /宗教|信仰|信条|祈|礼拝/.test(String(i.text || '')) && !/記載なし|情報なし|不明|未確認/.test(String(i.text || '')))) return { verdict: 'met', reason: '信仰による問題の記載なし', evidence: cards.slice(0, 3).map(i => i.id), need: '' };
          return { verdict: 'unknown', reason: '', evidence: [], need: cards.length ? `${label}の記録が少なく、満たされているか判断できない` : `${label}の記録がない` };
        };
        const res = {};

        const isPreop = () => false;
        const phases = { pre: ['入院前', (c, i) => c === 'preadmission' || (c === 'postadmission' && isPreop(i))], post: ['入院後', c => c === 'postadmission'], all: ['全体', c => c !== 'missing'] };
        if (surgical) {
          phases.preop = ['術前', (c, i) => c === 'postadmission' && surgPhaseOf(i, cp) === 'pre'];
          phases.postop = ['術後', (c, i) => c === 'postadmission' && (surgPhaseOf(i, cp) === 'post' || surgPhaseOf(i, cp) === 'op')];
        }
        Object.keys(phases).forEach(k => { res[k] = judge(mine.filter(i => phases[k][1](effCol(i), i)), phases[k][0], k === 'preop' ? 'pre' : k === 'postop' ? 'post' : k); });
        out[need.id] = res;
      });
      try { sufficiencyStateOverrides(items, out, i => /^入院前/.test(String(i.timestamp || '')) || (Object.values(i.assessmentCols || {}).length > 0 && Object.values(i.assessmentCols).every(c => c === 'preadmission'))); } catch (e) { console.warn('Restriction check failed:', e); }
      try { sufficiencyScoreOverrides(items, out, i => /^入院前/.test(String(i.timestamp || '')) || (Object.values(i.assessmentCols || {}).length > 0 && Object.values(i.assessmentCols).every(c => c === 'preadmission')), sufficiencyAllRules, true, surgical ? (i => surgPhaseOf(i, cp)) : null); } catch (err) { console.warn('score/per-need rules failed:', err); }
      // v.91: a 充足 verdict must rest on a recorded basis; without evidence it is 情報不足 (the need text is kept, only the verdict changes).
      Object.keys(out).forEach(n => Object.keys(out[n]).forEach(k => { const v = out[n][k]; if (v && v.verdict === 'met' && !(v.evidence || []).length) out[n][k] = { verdict: 'unknown', reason: '', evidence: [], need: v.need || '記録に基づく根拠がなく、満たされているか判断できない' }; }));
      return out;
    }
    window.runSufficiencyRules = function() {
      const cp = getCurrentPatient();
      if (!(cp.items || []).some(i => i.type !== 'unnecessary')) return showToast('カードがありません。先に「分類開始」で分類してください', 'warn');
      const r = applySufficiencyResult(cp, judgeSufficiencyByRules(cp), new Date().toISOString(), 'rules');
      try { finishAiResult(cp, () => renderAssessmentTable(), '充足・未充足の判定'); } catch (e) { renderAssessmentTable(); }
      showToast(`記録を基に判定しました：${r.set}欄に入れました` + (r.kept ? `／自分で選んだ${r.kept}欄はそのまま` : '') + (r.unknown ? `／${r.unknown}欄は記録が足りず判定できません` : '') + '。根拠の言葉を見て、自分で直してください', 'success', 8000);
    };

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

    try { renderAssessmentTable(); } catch (err) { console.warn('Assessment render failed:', err); }

if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, {
    MY_ASSESSMENT_FIELDS,
    ensureMyAssessment, getMyAssessment, ruleSufficiencyFor, linkMyEvidenceIds, unlinkMyEvidenceId, setMyEvidenceIds,
    myAssessmentStatus, myAssessmentNeedsReview, confirmMyAssessmentEntry, restoreMyAssessmentFromHistory,
    hasRuleSufficiency, sufficiencyDimensions, sufficiencyDimensionLines, phaseVerdictOf, sufficiencyUiPhases, isSurgicalPatient, surgPhaseOf, applySufficiencyReview, judgeSufficiencyByRules, sufficiencyScoreRules, sufficiencyPerNeedRules, sufficiencyCauseHint, sufficiencyCardVerdict, sufficiencyHasVerdict, sufficiencySentence, parseSufficiencyJson, applySufficiencyResult, sufficiencyReasonHtml, sufficiencyPhaseHtml, sufficiencyPhaseText, sufficiencyHeaderHtml, phaseVerdictOf, sufficiencyTextOf, myAssessmentHasContent, getSufficiency, sufficiencyControlHtml, sufficiencySummaryHtml, sufficiencyMiniHtml, diffMyAssessmentVersions, reviewMyAssessment, buildMyAssessmentsText, buildMyAssessmentsPrintHtml,
    renderMyAssessmentRowHtml, evidencePickerCandidates, myAssessmentAlwaysShown
  });
  if (module.exports.__testHooks) Object.assign(module.exports.__testHooks, { flushMyAssessmentSaves, saveMyAssessmentsSoon });
}
