'use strict';
// Read-only chart audit. Findings are advisory and never change clinical records.
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NursingPatientQuality = api;
})(typeof window === 'undefined' ? null : window, function() {
  const text = v => String(v ?? '').trim();
  const norm = v => text(v).normalize('NFKC').replace(/\s+/g, '');
  const active = x => x && !x.deleted && x.type !== 'unnecessary' && !x.aiSuggested;
  const array = v => Array.isArray(v) ? v : [];
  function cardState(c) {
    return JSON.stringify([text(c.text), text(c.timestamp), c.type, array(c.hendersonIds).map(Number).sort((a,b)=>a-b), c.admissionPhase || '', c.assessmentCols || {}]);
  }
  function audit(patient, options = {}) {
    const cards = array(patient?.items).filter(active), plans = Object.values(patient?.carePlans || {}).filter(p=>p&&!p.deleted);
    const byId = new Map(cards.map(c=>[String(c.id),c]));
    const findings = [], seen = new Set();
    const add = (code,message,id,links=[]) => {
      const key = JSON.stringify([code,id,links]);
      if (seen.has(key)) return;
      seen.add(key); findings.push({code,message,id,evidenceIds:links});
    };
    for (const card of cards) {
      if (!array(card.hendersonIds).length && !card.tagNotNeeded && !card.otherBasicInfo && (!options.isUntagged || options.isUntagged(card))) {
        const reason = options.untaggedReason?.(card,patient);
        if (reason?.kind !== 'none') add('untagged', 'ヘンダーソン分類を確認してください' + (reason?.reason ? '：'+reason.reason : ''),card.id,[String(card.id)]);
      }
    }
    const checkRefs = (refs, owner) => {
      for (const ref of array(refs)) {
        if (!ref || !ref.sourceId) continue;
        if (ref.patientId && String(ref.patientId) !== String(patient.id)) {
          add('foreign-evidence','根拠参照が別の患者を指しています',owner,[String(ref.sourceId)]);
          continue;
        }
        if (ref.sourceType === 'card' && !byId.has(String(ref.sourceId))) add('broken-evidence','根拠カードが削除・除外されています',owner,[String(ref.sourceId)]);
      }
    };
    for (const plan of plans) {
      checkRefs(plan.mapEvidenceRefs,plan.id);
      const ids = array(plan.evidenceIds).map(String);
      for (const id of ids) if (!byId.has(id)) add('broken-evidence','看護計画の根拠カードが削除・除外されています',plan.id,[id]);
      for (const snapshot of array(plan.evidenceSnapshot)) {
        const current = byId.get(String(snapshot.id));
        if (current && cardState(current) !== cardState(snapshot)) add('evidence-updated','根拠カードの文章・日時・分類が変更されています。看護計画を再確認してください',plan.id,[String(snapshot.id)]);
      }
      // Old plans have text-only evidence; require full correspondence, never a short prefix.
      const bodies = cards.map(c=>norm(c.text));
      for (const entry of array(plan.evidence)) {
        const needle = norm(entry);
        if (needle.length >= 4 && !bodies.some(body=>body.includes(needle))) add('evidence-text-review','根拠の文章が現在のカードと一致しません。省略・編集・時期を確認してください',plan.id);
      }
      if (!ids.length && !array(plan.evidence).some(e=>text(e)) && !array(plan.mapEvidenceRefs).some(r=>r?.sourceType==='card' && (!r.patientId || String(r.patientId)===String(patient.id)) && byId.has(String(r.sourceId)))) add('missing-evidence','看護問題の根拠情報がありません',plan.id);
      for(const record of array(plan.records).filter(r=>r&&!r.deleted&&r.responseCardId)){
        const card=byId.get(String(record.responseCardId));
        const owner=String(plan.id)+'/'+String(record.id);
        if(!card)add('record-response-missing','実施・評価記録の患者反応カードが削除・除外されています',owner,[String(record.responseCardId)]);
        else if(norm(record.response) && !norm(card.text).includes(norm(record.response)))add('record-response-changed','実施記録の患者反応と情報カードの文章が一致しません。編集内容を確認してください',owner,[String(record.responseCardId)]);
      }
      const lines = new Map();
      for (const section of ['op','tp','ep']) for (const [index,line] of array(plan[section]).entries()) {
        const key = norm(line);
        if (!key) continue;
        if (lines.has(key)) add('plan-duplicate','看護計画の内容が重複しています（'+lines.get(key)+'・'+section.toUpperCase()+' '+(index+1)+'）',plan.id);
        else lines.set(key,section.toUpperCase()+' '+(index+1));
      }
    }
    const map = patient?.relationMap;
    if (map && array(map.nodes).length) {
      const nodes = new Map(array(map.nodes).map(n=>[String(n.id),n]));
      for (const node of array(map.nodes)) {
        checkRefs(node.sourceRefs,node.id);
        for (const id of array(node.itemIds).map(String)) if (!byId.has(id)) add('broken-evidence','関連図の根拠カードが削除・除外されています',node.id,[id]);
      }
      for (const edge of array(map.edges)) {
        checkRefs(edge.sourceRefs,edge.id);
        const from=String(edge.source??edge.from??''),to=String(edge.target??edge.to??'');
        const source=nodes.get(from),target=nodes.get(to);
        if (!source || !target) continue;
        for (const id of array(edge.evidenceIds).map(String)) if (!byId.has(id)) add('arrow-evidence','矢印の根拠カードが見つかりません',edge.id,[id]);
        if (['causes','contributes_to','results_in','increases_risk_of','may_contribute_to'].includes(edge.relation) && (source.observed===false || target.observed===false || source.epistemicStatus==='inferred' || target.epistemicStatus==='inferred') && !text(edge.evidence) && !array(edge.evidenceIds).length) add('causal-basis','推論を含む因果関係に根拠の説明がありません',edge.id);
      }
      const problems=array(map.nodes).filter(n=>['nursing_problem','nursing-problem','nursingProblem','problem'].includes(n.type));
      const names=new Set(problems.map(n=>norm(n.label)));
      if (problems.length) for (const plan of plans) if (norm(plan.problem) && !names.has(norm(plan.problem))) add('plan-map-review','看護計画と関連図の看護問題名が一致しません。表現の違いを確認してください',plan.id);
    }
    return {findings,checked:{cards:cards.length,plans:plans.length}};
  }
  return Object.freeze({audit,cardState});
});
