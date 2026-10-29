// Structured clinical facts, shared timeline, evidence objects and cross-output audit (v.203).
// Derived layer only: it never edits or deletes original cards (item.text, tags, editLog stay as they are).

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['17'] = 'v.203'; // Version stamp (scripts/stamp-version.js)
    const CF_SCHEMA_VERSION = 1;
    // ---- tracks and condition-specific phase definitions (shared timeline engine) ----
    const CF_TRACKS = [
      { key: 'obstetric', re: /妊娠(?!歴なし)|産褥|褥婦|産後|悪露|陣痛|分娩第?[1-3一二三]期|後陣痛/ },
      { key: 'surgical', re: /術前|術中|術後|手術|POD\s*\d|全摘|切除術|開腹|腹腔鏡|帝王切開/ },
      { key: 'diabetes', re: /糖尿病|インスリン|血糖自己測定|HbA1c/ },
      { key: 'acute', re: /川崎病|肺炎|急性|発熱|嘔吐|入院/ }
    ];
    const CF_PHASES = {
      obstetric: [['pregnancy', /妊娠\s*\d+\s*週|妊娠中|妊娠経過|妊婦健診/], ['labor', /陣痛|分娩第?[1-3一二三]期|子宮口/], ['delivery', /分娩|出産|娩出|帝王切開(?!後)/], ['postpartum', /産褥|産後|褥婦|授乳|悪露|後陣痛/]],
      surgical: [['intraoperative', /術中|手術中/], ['postoperative', /術後|POD\s*\d|手術後/], ['preoperative', /術前|手術前|手術予定/]],
      diabetes: [['initial_diagnosis', /診断時|初発|発症時|初診/], ['inpatient_education', /指導|教育|手技の練習|自己注射の練習/], ['outpatient_followup', /外来|退院後|通院/]],
      general: [['discharge', /退院(?:時|指導|後|予定)|転院/], ['recovery', /軽快|改善|消失|解熱(?:した|し)|回復|落ち着いて/], ['prehospital', /入院前|既往|受診前|発症前|普段|いつも|以前/], ['admission', /入院時|入院当日|入院日|救急外来|紹介され/], ['acute', /入院\s*\d+\s*日目|治療開始|投与|点滴|安静/]]
    };
    function cfTracks(text) { const t = String(text || '').normalize('NFKC'); return CF_TRACKS.filter(x => x.re.test(t)).map(x => x.key); }
    function cfTimeExpr(text) {
      const t = String(text || '').normalize('NFKC'); let m;
      if ((m = t.match(/入院\s*(\d+)\s*日目/))) return { kind: 'hospital_day', n: +m[1] };
      if ((m = t.match(/術後\s*(\d+)\s*日(?:目)?|POD\s*(\d+)/i))) return { kind: 'postop_day', n: +(m[1] || m[2]) };
      if ((m = t.match(/産褥\s*(\d+)\s*日(?:目)?/))) return { kind: 'postpartum_day', n: +m[1] };
      if ((m = t.match(/(\d{1,2})月(\d{1,2})日/))) return { kind: 'date', month: +m[1], day: +m[2] };
      return null;
    }
    // Phase of a statement: the statement's own wording first (event time), the documentation time only as a fallback.
    function cfPhaseOf(text, timestamp, trackHint) {
      const t = String(text || '').normalize('NFKC');
      const tracks = (trackHint && trackHint.length) ? trackHint : cfTracks(t);
      const order = [...tracks.filter(k => CF_PHASES[k]), 'general'];
      for (const tr of order) for (const [ph, re] of CF_PHASES[tr]) if (re.test(t)) return { phase: ph, track: tr, source: 'text' };
      const ts = String(timestamp || '').normalize('NFKC');
      for (const tr of order) for (const [ph, re] of CF_PHASES[tr]) if (re.test(ts)) return { phase: ph, track: tr, source: 'documentation' };
      return { phase: 'unknown', track: order[0] || 'general', source: 'none' };
    }
    function cfSubject(text, track, sp) {
      const t = String(text || '').normalize('NFKC');
      if (sp && sp.role && sp.role !== 'patient') {
        if (/^(?:physician|nurse)$/.test(sp.role)) return 'clinician';
        return /mother|father|family|sibling|grand|other/.test(sp.role) ? 'family' : 'other';
      }
      if (track === 'obstetric' && /新生児|赤ちゃん|乳児|児の|児は|哺乳|臍帯|黄疸|出生体重/.test(t)) return 'newborn';
      return 'patient';
    }
    function cfStatementType(text) {
      const t = String(text || '').normalize('NFKC');
      if (/(?:と|で)診断|診断された|確定診断/.test(t)) return 'diagnosis';
      if (/疑い|鑑別|可能性/.test(t) && /診断|病|症/.test(t)) return 'differential_diagnosis';
      if (/指示|オーダー|処方|予定|開始予定|投与予定|[^　-鿿]?考慮/.test(t)) return 'order';
      if (/実施|施行|投与(?:した|し|中)|開始した|交換した|行った|使用した|吸入した/.test(t)) return 'actual_intervention';
      if (/既往|歴|歳時|幼少期|入院前|以前|過去/.test(t)) return 'history';
      if (/軽快|消失|改善|治癒|退院|回復/.test(t)) return 'outcome';
      if (/「|訴え|痛い|つらい|しんどい|かゆい|眠れな|食べたくない|気持ち悪い/.test(t)) return 'reported_symptom';
      return 'observation';
    }
    function cfNegationUncertainty(text) {
      const t = String(text || '').normalize('NFKC');
      const negated = []; let m; const re = /([^\s、。が，,]{1,8}?)(?:は|も)?(?:なし|ない|なかった|認めず|みられず|見られず)(?=[、。が,\s]|$)/g;
      while ((m = re.exec(t))) negated.push(m[1].replace(/^(?:昨日まであった|昨日まで)/, ''));
      return { negated, uncertain: /疑い|可能性|かも|と思われ|思われる|不明|[？?]|か$|はず/.test(t) };
    }
    // Atomic statements: split at sentence ends and ；, never inside 「」 quotations.
    function cfAtoms(text) {
      const s = String(text || ''); const out = []; let depth = 0, start = 0;
      for (let k = 0; k < s.length; k++) {
        const c = s[k];
        if (c === '「' || c === '『') depth++; else if (c === '」' || c === '』') depth = Math.max(0, depth - 1);
        else if (depth === 0 && (c === '。' || c === '；' || c === '\n')) { if (s.slice(start, k + 1).trim()) out.push([start, k + 1]); start = k + 1; }
      }
      if (s.slice(start).trim()) out.push([start, s.length]);
      return out.length ? out : [[0, s.length]];
    }
    const cfCache = new WeakMap();
    function cfItemFacts(item, trackHint) {
      const txt = String(item.text || '');
      const sp = typeof cardSpeaker === 'function' ? cardSpeaker(txt) : { role: '', label: '', also: [] };
      const edited = Array.isArray(item.editLog) && item.editLog.length > 0;
      return cfAtoms(txt).map(([a, b], k) => {
        const seg = txt.slice(a, b); const tracks = trackHint && trackHint.length ? trackHint : cfTracks(seg + ' ' + (item.timestamp || ''));
        const ph = cfPhaseOf(seg, item.timestamp, tracks); const expr = cfTimeExpr(seg), doc = cfTimeExpr(item.timestamp || '');
        const nu = cfNegationUncertainty(seg);
        const conflict = !!(expr && doc && expr.kind === doc.kind && expr.kind !== 'date' && expr.n !== doc.n);
        let hs = []; try { hs = Array.from(new Set(detectMultipleHendersonTags(seg))); } catch (e) { hs = []; }
        if ((item.hendersonIds || []).length && !hs.length) hs = item.hendersonIds.slice();
        return {
          id: `${item.id}#${k}`, sourceId: item.id, original: seg, span: [a, b],
          subject: cfSubject(seg, ph.track, sp), speaker: sp.role || (/^「/.test(seg.trim()) ? 'unknown' : null), observer: null,
          eventTime: expr, documentationTime: item.timestamp ? { raw: String(item.timestamp), ...(doc || {}) } : null,
          timeConflict: conflict, phase: ph.phase, phaseSource: ph.source, track: ph.track,
          negated: nu.negated, uncertain: nu.uncertain, statementType: cfStatementType(seg),
          henderson: hs, userEdited: edited, classification: { source: edited || item.manualTags ? 'manual' : 'auto', history: edited ? item.editLog.slice(-5) : [] }
        };
      });
    }
    // Backward-compatible: facts are derived from existing records on demand (nothing is written into the saved patient).
    function buildClinicalFacts(cp) {
      const items = (cp && cp.items || []).filter(i => i && !i.deleted && i.text);
      const tracks = cfTracks(String(cp && cp.sourceText || '') + ' ' + items.map(i => i.text).join(' '));
      const key = items.map(i => i.id + '|' + i.text + '|' + (i.timestamp || '')).join('\n') + '|' + tracks.join();
      const hit = cfCache.get(cp); if (hit && hit.key === key) return hit.facts;
      const facts = []; items.forEach(i => cfItemFacts(i, tracks).forEach(f => facts.push(f)));
      const out = { schema: CF_SCHEMA_VERSION, tracks, facts };
      cfCache.set(cp, { key, facts: out }); return out;
    }
    function migrateClinicalFacts(cp) { const f = buildClinicalFacts(cp); return { schema: f.schema, migrated: f.facts.length, originalsUntouched: true, unknownSubject: f.facts.filter(x => !x.subject).length }; }

    // ---- card split proposals (review-gated, reversible, never overwrite edited cards) ----
    const CF_SPEAKER_LEAD = /(?:^|[\n。」])\s*(?=(?:母親|母|父親|父|祖母|祖父|本人|患児|医師|主治医|看護師|Ns)\s*[：:「])/;
    function proposeCardSplits(cp) {
      const out = [];
      (cp && cp.items || []).forEach(i => {
        if (!i || i.deleted || !i.text || i.splitFrom || i.autoSplit) return;
        if (Array.isArray(i.editLog) && i.editLog.length) return; // 手で直したカードには触れない
        const t = String(i.text); const idx = []; let m; const re = new RegExp(CF_SPEAKER_LEAD.source, 'g');
        while ((m = re.exec(t))) { if (m[0] === '') re.lastIndex++; const p = m.index + m[0].length; if (p > 0 && p < t.length && !idx.includes(p)) idx.push(p); }
        const cuts = [0, ...idx.filter(p => p > 0)]; if (cuts.length < 2) return;
        const parts = cuts.map((c, k) => t.slice(c, cuts[k + 1] === undefined ? t.length : cuts[k + 1]));
        if (parts.join('') !== t || parts.some(p => p.trim().length < 3)) return;
        const roles = parts.map(p => (cardSpeaker(p).role || 'unknown'));
        if (new Set(roles).size < 2) return;
        out.push({ itemId: i.id, parts: parts.map((p, k) => ({ text: p, speaker: roles[k] })), reason: '1枚のカードに複数の発言者の発言が入っているため、発言者の境界で分ける', confidence: roles.includes('unknown') ? 'review' : 'high' });
      });
      return out;
    }
    // The original card stays (flagged); children carry the split. Everything is logged and can be reverted.
    function applyCardSplit(cp, proposal) {
      if (!proposal || proposal.confidence !== 'high') return { applied: false, reason: '確信度が足りないため確認待ち' };
      const o = (cp.items || []).find(i => i.id === proposal.itemId); if (!o || o.autoSplit || (o.editLog || []).length) return { applied: false, reason: '手で編集済みまたは分割済み' };
      const kids = proposal.parts.map((p, k) => ({ ...JSON.parse(JSON.stringify({ type: o.type, timestamp: o.timestamp, hendersonIds: o.hendersonIds || [], assessmentCols: o.assessmentCols || {} })), id: `${o.id}-s${k + 1}`, text: p.text, splitFrom: o.id, splitReason: proposal.reason, speakerRole: p.speaker }));
      const logId = `chg-${(cp.cardChangeLog || []).length + 1}`;
      o.autoSplit = { logId, children: kids.map(k => k.id), reason: proposal.reason };
      const at = cp.items.indexOf(o); cp.items.splice(at + 1, 0, ...kids);
      (cp.cardChangeLog = cp.cardChangeLog || []).push({ id: logId, kind: 'split', source: o.id, children: kids.map(k => k.id), reason: proposal.reason, reverted: false });
      return { applied: true, logId, children: kids.map(k => k.id) };
    }
    function revertCardChange(cp, logId) {
      const e = (cp.cardChangeLog || []).find(x => x.id === logId && !x.reverted); if (!e) return { reverted: false };
      cp.items = cp.items.filter(i => !e.children.includes(i.id));
      const o = cp.items.find(i => i.id === e.source); if (o) delete o.autoSplit;
      e.reverted = true; return { reverted: true };
    }

    // ---- evidence objects (built before any narrative sentence) ----
    function evidenceObjectsFor(cp, needId, phase) {
      const r = (typeof ruleSufficiencyFor === 'function' ? ruleSufficiencyFor(cp)[needId] : null) || {};
      const a = r[phase] || {}; const fx = a.facts || { for: [], against: [] };
      const byId = new Map((cp.items || []).map(i => [i.id, i]));
      const facts = buildClinicalFacts(cp).facts.filter(f => f.henderson.includes(needId));
      const ref = x => ({ id: x.id, text: x.text, exists: byId.has(x.id) });
      const ctxTypes = ['history', 'order', 'diagnosis', 'differential_diagnosis'];
      const ev = {
        need: needId, phase, state: typeof sufficiencyEvidenceState === 'function' ? sufficiencyEvidenceState(cp, needId, phase) : 'no_relevant_evidence',
        fulfilment: (fx.for || []).map(ref), unmet: (fx.against || []).map(ref), contradictory: a.verdict === 'conflict' ? [...(fx.for || []), ...(fx.against || [])].map(ref) : [],
        context: facts.filter(f => ctxTypes.includes(f.statementType)).map(f => ({ id: f.sourceId, text: f.original, type: f.statementType })),
        functionalImpact: (fx.against || []).filter(x => /できない|できず|困難|眠れ|食べられ|摂れ|歩けない|動けない|痛くて/.test(x.text || '')).map(ref),
        missing: []
      };
      try { const ind = individualizedAssessment(cp, needId, phase); ev.missing = (ind && ind.ctx && ind.ctx.missing) || []; } catch (e) { /* optional */ }
      return ev;
    }

    // ---- cross-output audit ----
    function auditClinicalOutputs(cp, outputs) {
      const findings = []; const add = (code, detail, ids) => findings.push({ code, detail, ids: ids || [] });
      const items = (cp.items || []).filter(i => i && !i.deleted); const ids = new Set((cp.items || []).map(i => i.id));
      const all = String(cp.sourceText || '') + '\n' + items.map(i => i.text).join('\n');
      // nonexistent source ids / duplicated evidence
      for (let n = 1; n <= 14; n++) {
        ['pre', 'post'].forEach(ph => {
          let ev; try { ev = evidenceObjectsFor(cp, n, ph); } catch (e) { return; }
          const seen = new Set();
          [...ev.fulfilment, ...ev.unmet].forEach(x => { if (!x.exists) add('missing_source_id', `欲求${n}の根拠 ${x.id} が記録に存在しない`, [x.id]); const k = String(x.text).normalize('NFKC').replace(/\s+/g, ''); if (seen.has(k)) add('duplicated_evidence', `欲求${n}で同じ内容の根拠が重複`, [x.id]); seen.add(k); });
        });
      }
      const facts = buildClinicalFacts(cp);
      facts.facts.forEach(f => {
        if (f.timeConflict) add('date_conflict', `「${f.original.slice(0, 30)}」の事象時刻と記録時刻が食い違う。原本で確認が必要`, [f.sourceId]);
        if ((f.subject === 'family' || f.subject === 'clinician') && f.henderson.some(h => [10, 11].includes(h)) && !(items.find(i => i.id === f.sourceId) || {}).familyVoice) add('speaker_mismatch', `${f.speaker || f.subject}の発言が本人の欲求${f.henderson.join('・')}の根拠に使われうる`, [f.sourceId]);
        const it = items.find(i => i.id === f.sourceId); const col = it && it.assessmentCols ? f.henderson.map(h => it.assessmentCols[h]).find(Boolean) : null;
        if (f.phaseSource === 'text' && col === 'preadmission' && /^(?:recovery|discharge|acute|postoperative|postpartum)$/.test(f.phase)) add('phase_mismatch', `「${f.original.slice(0, 24)}」は${f.phase}の記載だが入院前の欄にある`, [f.sourceId]);
        if (f.phaseSource === 'text' && col === 'postadmission' && f.phase === 'pregnancy' && /検査|Hb|値/.test(f.original)) add('phase_mismatch', `妊娠中の検査値が産後の値として扱われうる`, [f.sourceId]);
      });
      // lab unit/value pairing
      try { (buildLabAssessment(cp).labs || []).forEach(l => { if (l.valueStd != null && l.value !== l.valueStd && l.originalValue === undefined && l.unit === l.stdUnit) add('lab_unit', `${l.key}: 値と単位の組が合わない`, [l.itemId]); }); } catch (e) { /* no labs */ }
      // template / diagnosis checks against supplied text
      const child = typeof detectAgeGroupFromText === 'function' && !!detectAgeGroupFromText(all);
      const hasObst = /妊娠|分娩|産褥|産後|褥婦/.test(all), hasSurg = /術前|術後|手術|切除術|開腹|腹腔鏡|帝王切開/.test(all);
      const hasDx = re => re.test(all);
      (outputs || []).forEach((o, k) => {
        const t = String(o || '');
        if (!hasObst && /産褥|授乳|母性|悪露|沐浴指導/.test(t)) add('template_mismatch', `出力${k + 1}に産褥・母性の文言があるが記録に該当なし`);
        if (child && /褥婦|産褥/.test(t) && !hasObst) add('template_mismatch', `小児の出力${k + 1}に産科の文言`);
        if (!hasSurg && /術後合併症|創部感染|縫合不全|イレウス|腸閉塞/.test(t)) add('template_mismatch', `出力${k + 1}に手術のない記録で術後の文言`);
        [['川崎病', /川崎病/], ['糖尿病', /糖尿病/], ['心不全', /心不全/], ['肺炎', /肺炎/]].forEach(([nm, re]) => { if (re.test(t) && !hasDx(re)) add('unsupported_diagnosis', `出力${k + 1}が記録にない診断「${nm}」を含む`); });
      });
      try { const g = genogramText(cp, x => x); if (child && /・(?:妻|夫|配偶者)／/.test(g)) add('unsupported_relationship', '小児の患者に配偶者が載っている'); } catch (e) { /* no genogram */ }
      return { ok: findings.length === 0, findings, withheld: Array.from(new Set(findings.map(f => f.code))) };
    }
    // Withhold only the affected sentences; the original record is untouched and the reason is shown.
    function auditedOutput(cp, text) {
      const a = auditClinicalOutputs(cp, [text]); const bad = a.findings.filter(f => /^(template_mismatch|unsupported_diagnosis)$/.test(f.code));
      if (!bad.length) return { text: String(text), audit: a };
      const lines = String(text).split('\n').map(l => {
        const one = auditClinicalOutputs(cp, [l]).findings.filter(f => /^(template_mismatch|unsupported_diagnosis)$/.test(f.code));
        return one.length ? `【保留】${one[0].detail.replace(/^出力\d+/, 'この記述')}のため、結論を出力しない（原本の記録は変更していません）` : l;
      });
      return { text: lines.join('\n'), audit: a };
    }

if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, { CF_SCHEMA_VERSION, cfTracks, cfTimeExpr, cfPhaseOf, cfSubject, cfStatementType, cfNegationUncertainty, cfAtoms, buildClinicalFacts, migrateClinicalFacts, proposeCardSplits, applyCardSplit, revertCardChange, evidenceObjectsFor, auditClinicalOutputs, auditedOutput });
}
