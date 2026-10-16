// Local missing-information checks, care plans and implementation/evaluation records.
// Current problems require current source evidence; pre-admission data or plan prose alone is insufficient.
// Evidence IDs require unique same-patient matches; snapshots detect changed/deleted/excluded cards.
// Patient-scoped field/structural histories protect later dependent edits and confirmed targets.

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['12'] = 'v.103'; // Version stamp (scripts/stamp-version.js)

    function formatCardTimestamp(value) {
      const d = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(d.getTime())) return '日時不明';
      const pad = n => String(n).padStart(2, '0');
      return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${pad(d.getMinutes())}`;
    }

    function toLocalInputValue(iso) {
      const d = iso ? new Date(iso) : new Date();
      if (Number.isNaN(d.getTime())) return '';
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    function fromLocalInputValue(v) {
      const d = v ? new Date(v) : null;
      return d && !Number.isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString();
    }
    function newRecordId(prefix) {
      return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function createOwnInfoCard(cp, { text, type, needs, col, at, fieldLabel }) {
      const ids = (needs || []).filter(n => n >= 1 && n <= 14);
      const item = {
        id: newRecordId('item'), text: cleanExtractedPhrase(text), timestamp: formatCardTimestamp(at || new Date()),
        type: type === 's' ? 's' : 'o', hendersonIds: ids,
        assessmentCols: Object.fromEntries(ids.map(h => [h, col === 'preadmission' ? 'preadmission' : 'postadmission'])),
        fieldLabel: fieldLabel || undefined, predictionSource: 'confirmed', _touchedAt: new Date().toISOString()
      };
      if (!item.fieldLabel) delete item.fieldLabel;
      cp.items.push(item);
      return item;
    }

    // ==========================================================================

    // ==========================================================================
    const MISSING_CHECK_STATUSES = [
      { key: 'unchecked', label: '未確認', icon: 'fa-circle-question' },
      { key: 'checked', label: '確認済み', icon: 'fa-circle-check' },
      { key: 'na', label: '該当なし', icon: 'fa-circle-minus' }
    ];
    function isMissingInfoCard(i) {
      return i && i.type !== 'unnecessary' && (i.hendersonIds || []).some(h => (i.assessmentCols?.[h] || 'unclassified') === 'missing');
    }
    function missingInfoItems(cp) {
      return (cp.items || []).filter(isMissingInfoCard);
    }
    function getMissingCheck(cp, itemId) {
      const c = cp && cp.missingChecks && cp.missingChecks[itemId];
      return c && typeof c === 'object' && !c.deleted ? c : null;
    }
    function missingCheckStatus(cp, itemId) {
      const c = getMissingCheck(cp, itemId);
      return c && MISSING_CHECK_STATUSES.some(s => s.key === c.status) ? c.status : 'unchecked';
    }
    function missingCheckCounts(cp) {
      const counts = { unchecked: 0, checked: 0, na: 0, total: 0 };
      missingInfoItems(cp).forEach(i => { counts[missingCheckStatus(cp, i.id)]++; counts.total++; });
      return counts;
    }

    function setMissingCheck(cp, itemId, { status, method = '', result = '', checkedAt = null, addCard = false, cardType = 'o', cardCol = 'postadmission' } = {}, now = new Date().toISOString()) {
      const item = (cp.items || []).find(i => i.id === itemId);
      if (!item) return null;
      if (!MISSING_CHECK_STATUSES.some(s => s.key === status)) status = 'unchecked';
      if (!cp.missingChecks || typeof cp.missingChecks !== 'object' || Array.isArray(cp.missingChecks)) cp.missingChecks = {};
      const prev = getMissingCheck(cp, itemId) || {};
      const check = {
        status, method: String(method || '').trim(), result: String(result || '').trim(),
        checkedAt: status === 'unchecked' ? null : (checkedAt || prev.checkedAt || now),
        resultItemId: prev.resultItemId || null, updatedAt: now
      };
      let card = null;
      if (addCard && status === 'checked' && check.result) {
        const needs = (item.hendersonIds || []).filter(h => (item.assessmentCols?.[h] || 'unclassified') === 'missing');
        const existing = check.resultItemId && cp.items.find(i => i.id === check.resultItemId && i.type !== 'unnecessary');
        const text = check.method ? `${check.result}（${check.method}）` : check.result;
        if (existing) {
          if (existing.text !== text) { logItemEdit(existing, { kind: 'text', from: existing.text, to: text }); existing.text = text; }
          existing.type = cardType === 's' ? 's' : 'o';
          existing.timestamp = formatCardTimestamp(check.checkedAt);
          touchItem(existing);
          card = existing;
        } else {
          card = createOwnInfoCard(cp, { text, type: cardType, needs: needs.length ? needs : item.hendersonIds, col: cardCol, at: check.checkedAt, fieldLabel: '確認結果' });
          check.resultItemId = card.id;
        }
      }
      cp.missingChecks[itemId] = check;
      return { check, card };
    }

    function missingCheckCardHtml(cp, item) {
      const st = missingCheckStatus(cp, item.id);
      const c = getMissingCheck(cp, item.id);
      const def = MISSING_CHECK_STATUSES.find(s => s.key === st);
      const detail = c && st !== 'unchecked'
        ? `<div class="mc-result">${c.result ? `<i class="fa-solid fa-arrow-turn-down fa-rotate-270"></i> ${escapeHtml(c.result)}` : ''}${c.method ? `<span class="mc-method">（${escapeHtml(c.method)}）</span>` : ''}${c.checkedAt ? `<span class="mc-when">${escapeHtml(formatMyDateTime(c.checkedAt))}</span>` : ''}${c.resultItemId && cp.items.some(i => i.id === c.resultItemId && i.type !== 'unnecessary') ? '<span class="mc-card-added" title="確認結果を情報カードとして追加しました"><i class="fa-solid fa-id-card"></i>カード追加済み</span>' : ''}</div>`
        : '';
      return `<button type="button" class="mc-badge mc-${st}" onclick="openMissingCheck('${safeDomId(item.id)}')" title="確認状況を記録する（未確認・確認済み・該当なし）"><i class="fa-solid ${def.icon}"></i>${def.label}</button>${detail}`;
    }

    let missingSummaryOpen = false;
    let missingSummaryFilter = 'unchecked';
    function renderMissingCheckSummary(cp) {
      const el = document.getElementById('missing-check-summary');
      if (!el) return;
      applyUntaggedReviews(cp);
      const counts = missingCheckCounts(cp);
      const utHtml = '';
      if (!counts.total && !utHtml) { el.classList.add('hidden'); el.innerHTML = ''; return; }
      el.classList.remove('hidden');
      const chip = s => `<button type="button" class="mc-filter mc-${s.key}${missingSummaryOpen && missingSummaryFilter === s.key ? ' active' : ''}" onclick="showMissingCheckList('${s.key}')"><i class="fa-solid ${s.icon}"></i>${s.label} <b>${counts[s.key]}</b></button>`;
      let list = '';
      if (missingSummaryOpen) {
        const items = missingInfoItems(cp).filter(i => missingSummaryFilter === 'all' || missingCheckStatus(cp, i.id) === missingSummaryFilter);
        list = `<ul class="mc-list">${items.map(i => {
          const needs = (i.hendersonIds || []).filter(h => (i.assessmentCols?.[h] || 'unclassified') === 'missing');
          return `<li><span class="mc-need">${escapeHtml(needs.map(h => `${h}.${hendersonNameOf(h).replace(/^\d+\.\s*/, '')}`).join('・'))}</span><span class="mc-text">${escapeHtml(i.text.replace(/^原因:\s*/, ''))}</span>${missingCheckCardHtml(cp, i)}</li>`;
        }).join('') || '<li class="my-asm-muted">当てはまる不足情報はありません。</li>'}</ul>`;
      }
      const mcHtml = !counts.total ? '' : `<div class="mc-summary-head"><span class="mc-summary-title"><i class="fa-solid fa-clipboard-question"></i> 不足情報の確認</span>
        ${MISSING_CHECK_STATUSES.map(chip).join('')}
        <button type="button" class="mc-filter${missingSummaryOpen && missingSummaryFilter === 'all' ? ' active' : ''}" onclick="showMissingCheckList('all')">すべて <b>${counts.total}</b></button>
        ${missingSummaryOpen ? '<button type="button" class="my-asm-link" onclick="showMissingCheckList(null)">一覧を閉じる</button>' : ''}</div>${list}`;
      el.innerHTML = mcHtml + utHtml;
    }
    window.showMissingCheckList = function(filter) {
      if (!filter || (missingSummaryOpen && missingSummaryFilter === filter)) missingSummaryOpen = false;
      else { missingSummaryOpen = true; missingSummaryFilter = filter; }
      renderMissingCheckSummary(getCurrentPatient());
    };

    let missingCheckEditing = null;
    window.openMissingCheck = function(itemId) {
      const cp = getCurrentPatient();
      const item = cp.items.find(i => i.id === itemId);
      if (!item) return;
      missingCheckEditing = itemId;
      const c = getMissingCheck(cp, itemId) || {};
      document.getElementById('missing-check-target').textContent = item.text.replace(/^原因:\s*/, '');
      setMissingCheckStatusUI(missingCheckStatus(cp, itemId) === 'unchecked' ? 'checked' : missingCheckStatus(cp, itemId));
      document.getElementById('missing-check-at').value = toLocalInputValue(c.checkedAt);
      document.getElementById('missing-check-method').value = c.method || '';
      document.getElementById('missing-check-result').value = c.result || '';
      const hasCard = c.resultItemId && cp.items.some(i => i.id === c.resultItemId && i.type !== 'unnecessary');
      document.getElementById('missing-check-add-card').checked = hasCard || !c.status;
      document.getElementById('missing-check-add-card-label').textContent = hasCard ? '追加した情報カードも書き換える' : '確認結果を情報カードとして追加する';
      const resultCard = hasCard ? cp.items.find(i => i.id === c.resultItemId) : null;
      document.getElementById('missing-check-card-type').value = resultCard ? resultCard.type : 'o';
      document.getElementById('modal-missing-check').classList.remove('hidden');
      setTimeout(() => document.getElementById('missing-check-result').focus(), 30);
    };
    function setMissingCheckStatusUI(status) {
      document.querySelectorAll('#missing-check-status [data-status]').forEach(b => b.classList.toggle('active', b.dataset.status === status));
      document.getElementById('missing-check-status').dataset.value = status;
      document.getElementById('missing-check-fields').classList.toggle('hidden', status === 'unchecked');
      document.getElementById('missing-check-card-row').classList.toggle('hidden', status !== 'checked');
    }
    window.setMissingCheckStatusUI = setMissingCheckStatusUI;
    window.closeMissingCheck = function() {
      missingCheckEditing = null;
      document.getElementById('modal-missing-check').classList.add('hidden');
    };
    window.saveMissingCheckUI = function() {
      if (!missingCheckEditing) return;
      const cp = getCurrentPatient();
      const status = document.getElementById('missing-check-status').dataset.value || 'unchecked';
      const result = document.getElementById('missing-check-result').value;
      if (status === 'checked' && !result.trim()) return showToast('「確認結果」を書いてください', 'warn');
      const r = setMissingCheck(cp, missingCheckEditing, {
        status, result,
        method: document.getElementById('missing-check-method').value,
        checkedAt: fromLocalInputValue(document.getElementById('missing-check-at').value),
        addCard: document.getElementById('missing-check-add-card').checked,
        cardType: document.getElementById('missing-check-card-type').value,
        cardCol: 'postadmission'
      });
      closeMissingCheck();
      saveDataAndSync();
      if (r && r.card) showToast('確認結果を記録し、情報カードとして追加しました（入院後の欄）', 'success');
      else showToast(`「${MISSING_CHECK_STATUSES.find(s => s.key === status).label}」にしました`, 'success');
    };

    // ==========================================================================

    // ------------------------------------------------------------------------

    // ==========================================================================
    const UNTAGGED_KINDS = {
      none: 'タグ不要', source: '原本確認', classify: '分類要確認', insufficient: '情報不足', unset: 'タグ未設定'
    };
    const UNTAGGED_DECISIONS = [
      { key: 'accept', label: '理由を了承' }, { key: 'assign', label: 'タグを付ける' },
      { key: 'none', label: 'タグ不要にする' }, { key: 'source', label: '原本確認を依頼' }
    ];
    const UNTAGGED_ADMIN_RE = /社会保険|国民健康保険|健康保険|後期高齢者医療|保険証|介護保険証|医療費|限度額|生活保護|入院形態|診察券|保証人|住所|電話番号|郵便番号|保険[:：]/;
    const UNTAGGED_ADMIN_STRONG_RE = /社会保険|国民健康保険|健康保険|保険証|診察券/;
    const UNTAGGED_PATHOLOGY_RE = /Stage\s*[0-4IV]|ステージ|病期|TNM|[pc][TN][0-4x]|病理|組織型|分化度|腺癌|扁平上皮癌|腫瘍マーカー/i;
    const UNTAGGED_NOINFO_RE = /不明|未記載|記載なし|未確認|聴取できず|情報なし/;
    function untaggedTextKey(text) {
      const s = String(text || '').normalize('NFKC').replace(/\s+/g, '');
      let h = 5381;
      for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
      return 'u' + (h >>> 0).toString(36) + s.length;
    }
    function untaggedOcrSuspect(text) {
      const t = String(text || '').normalize('NFKC');
      if (typeof isLabTextUnreliable === 'function' && isLabTextUnreliable(t)) return { level: '高', why: '検査値の項目名・数値・単位が崩れている可能性があります' };
      if (typeof analyzeLabCard === 'function') {
        let r = null; try { r = analyzeLabCard(t, null); } catch (e) { r = null; }
        if (r && r.kind === 'lab' && r.quality !== 'valid') return { level: '高', why: '検査値の桁・単位が通常の範囲と合わず、原本の確認が必要な値です', lab: true };
      }
      const hasParticle = /[のをはがにでともへや]|あり|なし|ない|する|した|いる|です|ます|。/.test(t);
      if (t.length <= 25 && /[A-Za-z]{1,4}[ァ-ヶー]{2,}/.test(t) && !hasParticle) return { level: '中', why: '英字とカタカナが不自然に連なり、文として読み取れません' };
      if (t.length < 12 && !/[A-Za-z0-9ぁ-んァ-ヶ一-龥]/.test(t.replace(/[:：].*$/, ''))) return { level: '中', why: '文字が短く、意味を読み取れません' };
      return null;
    }
    function untaggedSegmentTags(text) {
      const segs = String(text || '').split(/[。\n；;]+/).map(s => s.trim()).filter(s => s.length >= 4);
      if (segs.length < 2 || typeof detectMultipleHendersonTags !== 'function') return [];
      return segs.map(s => ({ text: s, tagIds: Array.from(detectMultipleHendersonTags(s)) })).filter(p => p.tagIds.length);
    }

    function untaggedContextEffects(cp, item) {
      const items = (cp && cp.items) || [];
      const idx = items.indexOf(item) >= 0 ? items.indexOf(item) : items.findIndex(i => item.id && i.id === item.id);
      if (idx < 0) return [];
      const near = items.filter((i, k) => k !== idx && !i.deleted && i.type !== 'unnecessary' && item.timestamp && item.timestamp !== '日時不明' && i.timestamp === item.timestamp && Math.abs(k - idx) <= 2);
      const found = painContextTagEvidence(items, item);
      PAIN_EFFECT_RULES.filter(rule => !found.some(e => e.id === rule.id)).forEach(rule => {
        let evidence = '';
        near.some(i => painContextClauses(i.text).some(text => {
          if (!rule.re.test(text)) return false;
          const linked = i.sceneId && i.sceneId === item.sceneId;
          const explicitPain = PAIN_TEXT_REGEX.test(text) && !/疼痛増強(?:なし|見られず)|痛みなし|疼痛なし/.test(text);
          const movement = rule.id === 4 && PAIN_SCORE_REGEX.test(item.text) && POSTURE_ACTIVITY_REGEX.test(text);
          if (!linked && !explicitPain && !movement) return false;
          evidence = text;
          return true;
        }));
        if (evidence) found.push({ id: rule.id, label: rule.label, evidence: evidence.slice(0, 40) });
      });
      return found;
    }

    function inferUntaggedReason(item, cp) {
      const text = String((item && item.text) || '');
      const out = { text, kind: 'unset', kindLabel: UNTAGGED_KINDS.unset, reason: '理由を特定できないため確認が必要', confidence: '低', candidates: [], parts: [], checks: ['この情報がどの基本的欲求の根拠になるか、原文と前後の記録から確認してください'] };
      const set = (kind, reason, confidence, candidates, checks) => Object.assign(out, { kind, kindLabel: UNTAGGED_KINDS[kind], reason, confidence, candidates: candidates || [], checks: checks || [] });
      const log = (item && item.editLog) || [];
      const removed = log.filter(e => e.kind === 'tagRemove').map(e => e.hendersonId || e.hId).filter(Boolean);
      const ocr = untaggedOcrSuspect(text);
      if (ocr) {
        return set('source', `${ocr.why}。意味を推測して分類すると誤るため、原文のまま残しています。`, ocr.level, [], ['原本（元の記録）で文字・数値・単位を確認してください', '確認できるまで、臨床的な根拠として使わないでください']);
      }
      if (/^[A-ZＡ-Ｚ]\s*氏[、・,\s]+\d{1,3}\s*歳[、・,\s]+(?:男性|女性)[。.]?$/.test(text.trim())) {
        return set('none', '氏名・年齢・性別の患者基本情報です。この情報だけで特定の基本的欲求や未充足を決めません。', '高', [], ['基本情報として保持し、年齢・性別の意味を実際の生活・症状と合わせて評価してください']);
      }
      if (/^(?:【血液型】|血液型[:：]\s*)[ABOＡＢＯ型\sRhRH+\-()（）陰陽性]+$/.test(text.trim())) {
        return set('none', '血液型は医学情報として保持します。血液型単独では呼吸・飲食・安全の欲求や患者の理解を判断できないため、タグは付けません。', '高', [], ['輸血の実施・反応などが記録された場合は、その別の所見を根拠に分類してください']);
      }
      if (item?.type === 'unnecessary') {
        return set('none', item.ruleDecision?.reason || item.ruleCorrectionReason || '資料の表題・見出し・教材の管理情報として患者所見から除外されています。過去の処理理由は、保存された履歴がなければ理由未記録です。', '高', [], ['現在の除外基準と、過去の処理主体・理由を区別して確認してください']);
      }
      if (FAMILY_HISTORY_DISEASE_CONTEXT_REGEX.test(text)) {
        const context = cp?.sourceText ? classifyTextByRules(cp.sourceText) : cp?.items || [];
        const evidence = familyScreeningEvidence(context, item);
        if (evidence.length) return set('classify', `家族のがんの記録と、同じ時期の本人の検診利用行動「${evidence[0].evidence}」が対応しています。健康管理行動の背景として14.学びへ関連付けます。`, '高', [14], ['家族の疾患を本人の疾患に置き換えず、検診を受けた行動と理解度の判定を分けてください']);
        return set('none', '家族の病歴として保持します。家族のがんや死亡だけでは、本人の疾患・悲嘆・学習行動は判断できません。', '高', [], ['本人の検診利用行動や気持ちが記録されている場合に、その明示された内容と関連付けてください']);
      }
      if (isSourceStructureText(text) || isTestExplanationMemo(text.trim())) {
        return set('none', '資料の見出し・表構造・説明メモで、患者の観察所見ではありません。日時や項目の文脈は保持します。', '高', [], ['患者所見と分け、配下の数値・観察結果を除外しないでください']);
      }
      if (item?.fieldLabel === 'アレルギー' && /^(?:ない|なし)[。.]?$/.test(text.trim())) {
        return set('classify', 'アレルギー欄の陰性所見です。本文の短い語だけでなく項目名を合わせて9.環境に分類します。', '高', [9], ['原文のアレルギー欄と照合し、別の「症状がない」を出典にしないでください']);
      }
      if (/^着があり剥離/.test(text.trim()) || /の着があり剥離/.test(text)) {
        const known = text.match(GALLBLADDER_OPERATIVE_FINDING_REGEX)?.[0];
        return set('source', known ? `一部に文字欠落の可能性がありますが、「${known}」は読み取れます。この消化器の治療記録には2.食事を付け、欠落部分の意味は保留します。` : '原文に文字が欠けた可能性のある手術記録です。前後を接続しても欠けた文字は確定できません。', '高', known ? [2] : [], ['読める所見と確認待ちの部分を区別し、欠けた文字を推測で補わないでください']);
      }
      if (/胆嚢結石/.test(text) && /症状がない|無症状/.test(text)) {
        return set('none', '無症状の既往歴です。医学情報として保持し、後日の胆嚢摘出の記録と照合します。この記載だけで飲食・排泄の障害は判断しません。', '高', [], ['症状・摂取・排泄への影響が別に記録されていれば、時期を分けて評価してください']);
      }
      if (/精密検査/.test(text) && /がん|癌/.test(text) && /入院/.test(text) && !GASTRIC_FINDING_REGEX.test(text)) {
        return set('none', '検査で判明した診断と入院目的です。医学情報として保持し、胃カメラ・予定手術・実施手術と照合します。患者の理解を示す記録ではありません。', '高', [], ['症状や生活への影響、説明への反応は別の根拠として確認してください']);
      }
      const semanticTags = detectMultipleHendersonTags(text).filter(id => [1, 2, 9, 14].includes(id));
      if (semanticTags.length && (HEALTH_SCREEN_USE_REGEX.test(text) || CHEST_IMAGE_REGEX.test(text) || GASTRIC_FINDING_REGEX.test(text) || INFECTION_SCREEN_REGEX.test(text))) {
        return set('classify', '検診の利用行動または検査の対象・所見から、基本的欲求との関係を確認できます。陰性所見も評価の根拠として保持します。', '高', semanticTags, ['タグの付与と充足・未充足の判定を分け、所見一つで総合判定しないでください']);
      }
      const parts = untaggedSegmentTags(text);
      if (parts.length) {
        out.parts = parts;
        const ids = Array.from(new Set(parts.flatMap(p => p.tagIds)));
        return set('classify', '複数の内容が1枚に混ざっており、一部の文にはタグの候補があります。全体に付けず、内容ごとに分けて付けるのが適切です。', '中', ids, ['「分けてタグを付ける」で内容ごとに分割できます', '関係のない内容にまでタグが付かないよう、分けた後に確認してください']);
      }
      if (removed.length) {
        return set('none', `以前に利用者がタグ（${removed.map(h => hendersonNameOf(h)).join('・')}）を外した履歴があります。意図的な除外の可能性があります。`, '中', [], ['外した理由を確認し、不要ならこのまま「タグ不要」にしてください']);
      }
      if (UNTAGGED_ADMIN_RE.test(text)) {
        return set('none', '事務的・管理的な背景情報で、特定のヘンダーソンの基本的欲求との直接の関係が弱い情報です。', UNTAGGED_ADMIN_STRONG_RE.test(text) ? '高' : '中', [], ['支援体制（9.環境）に関わる内容が含まれていないか確認してください']);
      }
      if (/アレルギー/.test(text)) {
        if (ALLERGY_ABSENT_REGEX.test(text)) return set('classify', '「アレルギーなし」は分類基準で9.環境に分類します。タグが未設定なら付与漏れです。', '高', [9], ['「アレルギーなし」に9.環境が付くよう分類ルールと分類基準を揃えてください']);
        return set('none', 'アレルギーがある場合は、原因物質・症状・安全上の対応を確認し、内容に合う項目へ分類します。「アレルギーなし」は9.環境に分類します。', '中', [], ['「あり」の場合は原因物質と症状を確認し、必要な項目に別のカードで記録してください']);
      }
      if (/^(?:回診[:：]\s*)?硬膜外(?:麻酔|カテーテル)(?:の)?(?:抜去|中止|終了)[。.]?$/.test(text.trim())) {
        return set('insufficient', '硬膜外麻酔の抜去・終了という治療経過です。この記載だけでは基本的欲求への影響が判断できないため、タグを付けていません。', '高', [], ['抜去後の痛み・睡眠・動作などへの影響が記録されている場合は、その所見を根拠に分類してください']);
      }
      if (UNTAGGED_PATHOLOGY_RE.test(text)) {
        const key = value => String(value || '').normalize('NFKC').replace(/\s+/g, '');
        const comparable = value => key(value).replace(/([NPH])O(?=[NPHM、,]|Stage|$)/g, (_, prefix) => prefix + '0');
        const variants = (cp?.items || []).filter(other => other !== item && !other.deleted && other.type !== 'unnecessary' && other.timestamp === item.timestamp && UNTAGGED_PATHOLOGY_RE.test(other.text) && key(other.text) !== key(text) && comparable(other.text) === comparable(text));
        if (variants.length) return set('source', '同じ日時の病理結果に数字の0と英字のOが異なる表記があります。どちらが正しいかこの資料だけでは確定できないため、両方を残して原本確認待ちにします。', '高', [], ['原本でN・P・Hに続く文字を確認してください。自動置換や同一記録としての統合はしないでください']);
        return set('none', '疾患の分類・病理所見で、患者の学び（理解・学習）の根拠ではありません。「説明すると今後必要になる」だけでは14.学びにしません。臨床背景として残します。', '中', [], ['患者の病状理解や説明への反応が書かれていれば、それを別のカードにして14.学びの根拠にしてください']);
      }
      if (typeof OUTSIDE_14_NEEDS_REGEX !== 'undefined' && OUTSIDE_14_NEEDS_REGEX.test(text)) {
        return set('none', '生殖・月経など、14項目に直接の項目が無い基本情報です。', '中', [], ['必要なら学習データ管理の「追加キーワード」でどの項目に入れるか決めてください']);
      }
      if (typeof PAIN_TEXT_REGEX !== 'undefined' && PAIN_TEXT_REGEX.test(text)) {
        const eff = cp ? untaggedContextEffects(cp, item) : [];
        if (eff.length) {
          out.fromContext = true;
          return set('classify', `痛みの記載そのものには影響先が書かれていません。前後の記録の${eff.map(e => `「${e.evidence}」→${e.label}（${e.id}）`).join('、')}が候補ですが、痛みとの関係を確認する必要があります。`, '中', eff.map(e => e.id), ['前後の記録を読み、痛みが本当にその項目に影響しているか確認してから付けてください']);
        }
        return set('insufficient', '痛み・鎮痛薬の記載で、何に影響しているか（睡眠・動作・食事・排泄など）が書かれていないため、基準（痛みは影響している項目へ）に従い、どの項目にも付けていません。9.環境にも付けません。', '高', [], ['痛みで眠れない→5、動くと痛い→4、食事・排泄・清潔への影響→2・3・8のように、影響を確認して別のカードに記録するか、「タグを付ける」で項目を選んでください']);
      }
      if (UNTAGGED_NOINFO_RE.test(text)) {
        return set('insufficient', '「不明」「未記載」など、情報そのものが得られていない記載です。', '中', [], ['本人・家族・カルテで聴取し、得られたら情報カードとして追加してください']);
      }
      return out;
    }
    function untaggedReviewOf(cp, item) {
      const m = cp && cp.untaggedReviews;
      const r = m && item ? m[untaggedTextKey(item.text)] : null;
      return r && typeof r === 'object' && !r.deleted ? r : null;
    }

    function applyUntaggedReviews(cp) {
      if (!cp || !cp.untaggedReviews) return;
      (cp.items || []).forEach(i => {
        const r = untaggedReviewOf(cp, i);
        if (r && r.decision === 'none' && !(i.hendersonIds || []).length) { if (!i.tagNotNeeded) i.tagNotNeeded = true; }
        else if (i.tagNotNeeded && !r) i.tagNotNeeded = false;
      });
    }

    function untaggedReviewItems(cp) {
      return (cp.items || []).filter(i => i.type !== 'unnecessary' && !(i.hendersonIds || []).length && !(typeof isBasicInfoItem === 'function' && isBasicInfoItem(i)));
    }
    function untaggedReviewCounts(cp) {
      const c = { open: 0, done: 0, total: 0 };
      untaggedReviewItems(cp).forEach(i => { c.total++; if (untaggedReviewOf(cp, i)) c.done++; else c.open++; });
      return c;
    }
    function setUntaggedReview(cp, itemId, { decision, tagIds = [], note = '' } = {}, now = new Date().toISOString()) {
      const item = (cp.items || []).find(i => i.id === itemId);
      if (!item || !UNTAGGED_DECISIONS.some(d => d.key === decision)) return null;
      if (!cp.untaggedReviews || typeof cp.untaggedReviews !== 'object' || Array.isArray(cp.untaggedReviews)) cp.untaggedReviews = {};
      const inf = inferUntaggedReason(item, cp);
      const ids = Array.from(new Set((tagIds || []).map(Number).filter(n => n >= 1 && n <= 14)));
      cp.untaggedReviews[untaggedTextKey(item.text)] = { decision, tagIds: decision === 'assign' ? ids : [], kind: decision === 'none' ? 'none' : (decision === 'source' ? 'source' : inf.kind), note: String(note || '').trim(), text: item.text.slice(0, 200), updatedAt: now };
      if (decision === 'assign') {
        ids.forEach(h => {
          if (!(item.hendersonIds || (item.hendersonIds = [])).includes(h)) {
            item.hendersonIds.push(h); (item.assessmentCols = item.assessmentCols || {})[h] = 'unclassified';
            logItemEdit(item, { kind: 'tagAdd', hId: h });
          }
        });
        item.patientBackground = null; item.predictionSource = 'confirmed'; item.tagNotNeeded = false;
        touchItem(item);
      } else {
        item.tagNotNeeded = decision === 'none';
        touchItem(item);
      }
      return cp.untaggedReviews[untaggedTextKey(item.text)];
    }
    function untaggedSectionHtml(cp) {
      if (!reviewRequestTargets(cp).length) return '';
      return `<div class="flex justify-end"><button type="button" class="btn btn-outline text-[11px]" onclick="exportReviewRequestText()" title="編集したカードとタグ未設定のカードを、分類基準の修正指示つきで書き出します"><i class="fa-solid fa-file-export"></i> 修正依頼を書き出す</button></div>`;
    }

    // ==========================================================================

    //    order, createdAt, updatedAt, records:[{ id, at, doneItems, doneText, response, responseCardId,

    // ==========================================================================
    const CARE_PLAN_SECTIONS = [
      { key: 'op', label: 'OP（観察計画）', short: 'OP', placeholder: '1行に1つずつ書きます\n例：疼痛の部位・程度（NRS）・出現する場面' },
      { key: 'tp', label: 'TP（援助計画）', short: 'TP', placeholder: '1行に1つずつ書きます\n例：リハビリの30分前に鎮痛薬を使えるよう調整する' },
      { key: 'ep', label: 'EP（教育計画）', short: 'EP', placeholder: '1行に1つずつ書きます\n例：痛みを我慢せずに伝えるよう説明する' }
    ];
    const CARE_PLAN_STATUSES = [
      { key: 'planned', label: '計画作成済み' }, { key: 'scheduled', label: '実施予定' }, { key: 'active', label: '実施中' }, { key: 'done', label: '実施済み' }, { key: 'evaluating', label: '評価待ち' },
      { key: 'continue', label: '継続' }, { key: 'revise', label: '修正' }, { key: 'ended', label: '終了' }, { key: 'resolved', label: '解決' }, { key: 'paused', label: '中止・保留' }
    ];
    const CARE_ACHIEVEMENTS = [
      { key: 'achieved', label: '達成' }, { key: 'partial', label: '一部達成' }, { key: 'not', label: '未達成' }, { key: 'unevaluable', label: '評価不能' }, { key: '', label: '評価しない' }
    ];
    function carePlanList(cp) {
      const all = cp && cp.carePlans && typeof cp.carePlans === 'object' ? Object.values(cp.carePlans) : [];
      return all.filter(p => p && p.id && !p.deleted)
        .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    }
    function normalizeCarePlan(p) {
      delete p.qa; // Discard saved warnings from the removed automatic checker.
      ['problem', 'goalLong', 'goalShort'].forEach(k => { if (typeof p[k] !== 'string') p[k] = ''; });
      CARE_PLAN_SECTIONS.forEach(s => { if (!Array.isArray(p[s.key])) p[s.key] = []; });
      if (!Array.isArray(p.relatedNeeds)) p.relatedNeeds = [];
      if (!Array.isArray(p.records)) p.records = [];

      if (!Array.isArray(p.evidence)) p.evidence = [];
      if (!Array.isArray(p.reasons)) p.reasons = [];
      if (!Array.isArray(p.refs)) p.refs = [];
      if (!CARE_PLAN_STATUSES.some(s => s.key === p.status)) p.status = 'planned';
      return p;
    }
    // Text links require exact, unique matches. Native map links require explicit same-patient card IDs.
    function captureCarePlanEvidence(cp, plan) {
      const cards = (cp.items || []).filter(i => i && !i.deleted && i.type !== 'unnecessary' && !i.diseaseGeneral && !i.aiSuggested);
      const ids = new Set((Array.isArray(plan.evidenceIds) ? plan.evidenceIds : []).map(String));

      if (cp.id && plan.caseId === cp.id) {
        for (const ref of Array.isArray(plan.mapEvidenceRefs) ? plan.mapEvidenceRefs : []) {
          if (ref && ref.sourceType === 'card' && ref.patientId === cp.id && cards.some(i => String(i.id) === String(ref.sourceId))) ids.add(String(ref.sourceId));
        }
      }
      for (const text of plan.evidence || []) {
        const matches = cards.filter(i => String(i.text || '').trim() === String(text).trim());
        if (matches.length === 1) ids.add(String(matches[0].id));
      }
      plan.evidenceIds = [...ids];
      plan.evidenceSnapshot = cards.filter(i => ids.has(String(i.id))).map(i => ({ id: String(i.id), text: String(i.text || ''), timestamp: String(i.timestamp || ''), type: i.type, hendersonIds: [...(i.hendersonIds || [])], admissionPhase: i.admissionPhase || '', assessmentCols: { ...(i.assessmentCols || {}) } }));
    }
    function carePlanEvidenceChanges(cp, plan) {
      const cards = new Map((cp.items || []).filter(i => i && !i.deleted && i.type !== 'unnecessary' && !i.diseaseGeneral && !i.aiSuggested).map(i => [String(i.id), i]));
      return (plan.evidenceSnapshot || []).map(before => ({ before, after: cards.get(String(before.id)) || null })).filter(x => {
        if (!x.after) return true;
        const state = c => JSON.stringify([c.text, c.timestamp || '', c.type, c.hendersonIds || [], c.admissionPhase || '', c.assessmentCols || {}]);
        return state(x.before) !== state(x.after);
      });
    }
    function refreshCarePlanEvidence(cp, id, expected, now = new Date().toISOString()) {
      const plan = getCarePlan(cp, id);
      if (!plan) return false;
      const changes = carePlanEvidenceChanges(cp, plan);
      // Preview and commit must refer to the same evidence state.
      if (!changes.length || JSON.stringify(changes) !== expected || changes.some(x => !x.after)) return false;
      const evidence = (plan.evidence || []).map(line => {
        const changed = changes.find(x => String(x.before.text).trim() === String(line).trim());
        return changed ? String(changed.after.text || '') : line;
      });
      const history = [...(plan.evidenceReviewHistory || []), { at: now, before: plan.evidenceSnapshot, changes: changes.map(x => ({ id: x.before.id, before: x.before.text, after: x.after.text })) }].slice(-20);
      updateCarePlan(cp, id, { evidence, evidenceReviewHistory: history }, now);
      return true;
    }
    window.reviewCarePlanEvidenceUI = function(id) {
      const cp = getCurrentPatient(), p = getCarePlan(cp, id);
      if (!p) return;
      const changes = carePlanEvidenceChanges(cp, p);
      if (!changes.length) return showToast('根拠カードに変更はありません', 'info');
      if (changes.some(x => !x.after)) return showToast('削除・除外された根拠があります。計画に必要な根拠を見直してください', 'warn');
      const expected = JSON.stringify(changes);
      const preview = changes.map(x => `変更前：${x.before.text} [${x.before.timestamp || '日時不明'}]\n現在：${x.after.text} [${x.after.timestamp || '日時不明'}]`).join('\n\n');
      if (!confirm(preview + '\n\n計画の根拠を現在のカードに更新しますか？目標・OP・TP・EPは更新後に見直してください。')) return;
      if (getCurrentPatient() !== cp || !refreshCarePlanEvidence(cp, id, expected)) return showToast('情報が変わったため更新を中止しました。再度確認してください', 'warn');
      commitCarePlanChange(cp);
      showToast('根拠を更新しました。目標・OP・TP・EPを再確認してください', 'info');
    };
    function createCarePlan(cp, fields = {}, now = new Date().toISOString()) {
      if (!cp.carePlans || typeof cp.carePlans !== 'object' || Array.isArray(cp.carePlans)) cp.carePlans = {};
      const order = carePlanList(cp).reduce((m, p) => Math.max(m, Number(p.order) || 0), 0) + 1;
      const plan = normalizeCarePlan({ ...fields, id: newRecordId('plan'), order, createdAt: now, updatedAt: now });
      plan.patientId = cp.id; plan.sourceRev = sourceRevisionOf(cp);
      captureCarePlanEvidence(cp, plan);
      cp.carePlans[plan.id] = plan;
      return plan;
    }
    function getCarePlan(cp, id) {
      const p = cp && cp.carePlans && cp.carePlans[id];
      return p && !p.deleted ? normalizeCarePlan(p) : null;
    }
    function updateCarePlan(cp, id, patch, now = new Date().toISOString()) {
      const p = getCarePlan(cp, id);
      if (!p) return null;
      Object.assign(p, patch, { updatedAt: now });
      if (Object.prototype.hasOwnProperty.call(patch, 'evidence') || Object.prototype.hasOwnProperty.call(patch, 'evidenceIds') || Object.prototype.hasOwnProperty.call(patch, 'mapEvidenceRefs')) captureCarePlanEvidence(cp, p);
      return p;
    }
    function carePlanProblemKey(problem) { return String(problem || '').replace(/\s+/g, ''); }
    function deleteCarePlan(cp, id, now = new Date().toISOString()) {
      if (!getCarePlan(cp, id)) return false;

      cp.carePlans[id] = { id, deleted: true, updatedAt: now, problemKey: carePlanProblemKey(cp.carePlans[id].problem), canonKey: cpPlanKey(cp.carePlans[id]) };
      return true;
    }
    function moveCarePlan(cp, id, dir, now = new Date().toISOString()) {
      const list = carePlanList(cp);
      const k = list.findIndex(p => p.id === id);
      const j = k + (dir === 'up' ? -1 : 1);
      if (k < 0 || j < 0 || j >= list.length) return false;
      list.forEach((p, n) => { p.order = n + 1; });
      list[k].orderLocked = true; list[j].orderLocked = true;
      [list[k].order, list[j].order] = [list[j].order, list[k].order];
      list[k].updatedAt = now; list[j].updatedAt = now;
      return true;
    }

    function carePlanLinesToList(text) {
      return String(text || '').split(/\r?\n/)
        .map(l => l.replace(/^\s*(?:[・\-‐−–—*＊●○◯◎■□◆◇▶►→]|\(?\d{1,2}[).．、]|[①-⑳]|(?:OP|TP|EP)[-‐−]?\d{1,2}[.．:：、)]?)\s*/i, '').trim())
        .filter(Boolean);
    }
    function addCareRecord(cp, planId, rec, now = new Date().toISOString()) {
      const p = getCarePlan(cp, planId);
      if (!p) return null;
      const r = { id: newRecordId('rec'), at: rec.at || now, doneItems: Array.isArray(rec.doneItems) ? rec.doneItems.slice() : [],
        doneText: String(rec.doneText || '').trim(), response: String(rec.response || '').trim(), responseCardId: rec.responseCardId || null,
        achievement: CARE_ACHIEVEMENTS.some(a => a.key === rec.achievement) ? rec.achievement : '',
        evaluation: String(rec.evaluation || '').trim(), revision: String(rec.revision || '').trim(), createdAt: now };
      p.records = [...p.records, r].sort((a, b) => String(a.at).localeCompare(String(b.at)));
      if (p.status === 'planned' || p.status === 'scheduled') p.status = 'active';
      p.updatedAt = now;
      return r;
    }
    function updateCareRecord(cp, planId, recId, patch, now = new Date().toISOString()) {
      const p = getCarePlan(cp, planId);
      const r = p && p.records.find(x => x.id === recId);
      if (!r) return null;
      Object.assign(r, patch);
      p.records.sort((a, b) => String(a.at).localeCompare(String(b.at)));
      p.updatedAt = now;
      return r;
    }
    function deleteCareRecord(cp, planId, recId, now = new Date().toISOString()) {
      const p = getCarePlan(cp, planId);
      if (!p || !p.records.some(r => r.id === recId)) return false;
      p.records = p.records.filter(r => r.id !== recId);
      p.updatedAt = now;
      return true;
    }
    function latestCareRecord(plan) {
      const recs = (plan && plan.records) || [];
      return recs.length ? recs[recs.length - 1] : null;
    }

    const CARE_SECTION_HEAD_REGEX = /^[【\[]?\s*(長期目標|短期目標|目標|期待される成果|O-?P|観察計画|T-?P|援助計画|ケア計画|E-?P|教育計画|指導計画)(?=$|[\s（(:：】\]])\s*(?:[（(][^）)]*[）)])?\s*[】\]]?\s*[:：]?\s*(.*)$/i;

    const CARE_PROBLEM_HEAD_REGEX = /^(?:\d{1,2}\s*[.．)）、]\s*)?(?:■|◆|#\s*\d+[.．:：]?)\s*(.+)$|^(?:看護問題|看護診断)\s*#?\s*\d+\s*[:：.．]\s*(.+)$/;
    function parseCarePlanText(text) {
      const plans = [];
      let cur = null, sec = null;
      const lines = String(text || '').normalize('NFKC').replace(/\*\*/g, '').replace(/〔[^〕]*〕/g, '').split(/\r?\n/);
      const keyOf = h => {
        const t = h.toUpperCase().replace(/-/g, '');
        if (t === '長期目標') return 'goalLong';
        if (t === '短期目標' || t === '目標' || t === '期待される成果') return 'goalShort';
        if (t === 'OP' || t === '観察計画') return 'op';
        if (t === 'TP' || t === '援助計画' || t === 'ケア計画') return 'tp';
        return 'ep';
      };
      const addTo = (key, v) => {
        v = v.trim();
        if (!v || !cur) return;
        if (key === 'goalLong' || key === 'goalShort') cur[key] = cur[key] ? `${cur[key]}\n${v}` : v;
        else cur[key].push(...carePlanLinesToList(v));
      };

      let inSummary = false;
      lines.forEach(raw => {
        const line = raw.trim();
        if (!line) return;
        if (/^#*\s*(?:【\s*)?(?:要点|まとめ|優先順位)(?:\s*】)?\s*$/.test(line)) { inSummary = true; cur = null; sec = null; return; }
        if (inSummary && !/^(?:\d{1,2}\s*[.．)）、]\s*)?(?:■|◆)|^(?:看護問題|看護診断)\s*#?\s*\d+\s*[:：.．]/.test(line)) return;
        inSummary = false;
        const head = line.match(CARE_PROBLEM_HEAD_REGEX);
        if (head) {
          const problem = (head[1] || head[2]).replace(/^#\s*\d+[.．:：]?\s*/, '').replace(/^(?:看護問題|看護診断)\s*\d*\s*[:：]?\s*/, '').trim();
          cur = { problem, goalLong: '', goalShort: '', op: [], tp: [], ep: [] };
          plans.push(cur);
          sec = null;
          return;
        }
        const bare = line.replace(/^[・\-‐*●○]\s*/, '');
        const m = bare.match(CARE_SECTION_HEAD_REGEX);
        if (m && cur) { sec = keyOf(m[1]); addTo(sec, m[2]); return; }
        if (cur && sec) addTo(sec, line);
      });

      plans.forEach(pl => {
        const obs = cpObservationLines(pl.tp);
        if (!obs.length) return;
        pl.tp = pl.tp.filter(l => !obs.includes(l));
        obs.forEach(l => { if (!pl.op.includes(l)) pl.op.push(l); });
      });

      const named = plans.filter(p => p.problem);
      const hasBody = p => p.goalLong || p.goalShort || p.op.length || p.tp.length || p.ep.length;
      return named.some(hasBody) ? named.filter(hasBody) : named;
    }

    function selectedDiagnosisNames(cp) {
      const cands = Array.isArray(cp.diagnosisCandidates) ? cp.diagnosisCandidates : [];
      const sel = new Set(cp.selectedDiagnosisIds || []);
      return cands.filter(c => sel.has(c.id)).map(c => String(c.name || '').trim()).filter(Boolean);
    }

    function guessPlanNeeds(plan) {
      const text = [plan.problem, plan.goalShort, plan.goalLong, ...(plan.op || []), ...(plan.tp || [])].join('\n');
      try { return Array.from(detectMultipleHendersonTags(text)).slice(0, 4); } catch (e) { return []; }
    }

    const carePlanOpen = new Set();
    // Read-only card navigation retains the originating patient and plan.
    let carePlanEvidenceOrigin=null;
    window.clearCarePlanEvidenceNavigation=function(){
      carePlanEvidenceOrigin=null;
      const bar=document.getElementById('careplan-evidence-navigation'),label=document.getElementById('careplan-evidence-origin');
      if(bar)bar.style.display='none';if(label)label.textContent='';
    };
    function carePlanLinkedCardHtml(cp,p,itemId,recordId=null){
      if(!cp||!itemId)return '';
      const card=(cp.items||[]).find(i=>String(i.id)===String(itemId)&&!i.deleted&&i.type!=='unnecessary'&&!i.aiSuggested);
      if(!card)return `<span class="my-asm-muted">参照先のカードがありません（削除・除外・別患者の可能性）</span>`;
      return `<button type="button" class="btn btn-outline" style="white-space:normal;text-align:left;max-width:100%;overflow-wrap:anywhere" data-care-evidence-card="${escapeHtml(String(itemId))}" onclick="openCarePlanEvidenceCard(${jsArg(cp.id)},${jsArg(p.id)},${jsArg(itemId)},${recordId===null?'null':jsArg(recordId)})" title="この患者の情報カードを表示">情報カード：${escapeHtml(String(card.text||'（本文なし）'))}</button>`;
    }
    window.openCarePlanEvidenceCard=function(patientId,planId,itemId,recordId=null){
      const cp=getCurrentPatient(),p=cp&&getCarePlan(cp,planId);
      const owned=recordId===null?(p?.evidenceIds||[]).some(id=>String(id)===String(itemId)):(p?.records||[]).some(r=>String(r.id)===String(recordId)&&String(r.responseCardId)===String(itemId));
      if(String(cp?.id)!==String(patientId)||!p||p.deleted||!owned){showToast('患者または計画の参照が変わりました。現在の計画から選び直してください','warn');return false;}
      if(!jumpToBoardCard(itemId))return false;
      carePlanEvidenceOrigin={patientId:cp.id,planId:p.id};
      const bar=document.getElementById('careplan-evidence-navigation');
      if(bar)bar.style.display='block';
      const label=document.getElementById('careplan-evidence-origin');
      if(label)label.textContent='戻り先：'+String(p.problem||'（看護問題未記入）');
      return true;
    };
    window.returnToCarePlanEvidenceOrigin=function(){
      const origin=carePlanEvidenceOrigin,cp=getCurrentPatient(),p=cp&&origin&&getCarePlan(cp,origin.planId);
      window.clearCarePlanEvidenceNavigation();
      if(!origin||cp?.id!==origin.patientId||!p||p.deleted){showToast('戻り先の患者または計画が変わりました。現在の画面で選び直してください','warn');return false;}
      carePlanOpen.add(p.id);switchView('careplan',{buildPlans:false});
      const target=document.querySelector(`[data-care-plan-id="${safeDomId(p.id)}"] .cp-title`);
      if(target){target.scrollIntoView({block:'center',behavior:'smooth'});target.focus({preventScroll:true});}
      return true;
    };
    document.getElementById('careplan-evidence-return')?.addEventListener('click',window.returnToCarePlanEvidenceOrigin);
    function renderCarePlans() {
      const wrap = document.getElementById('careplan-list');
      if (!wrap) return;
      const cp = getCurrentPatient();
      const plans = carePlanList(cp);
      const importInfo = document.getElementById('careplan-import-info');
      if (importInfo) importInfo.textContent = '';
      if (!plans.length) {
        wrap.innerHTML = `<div class="cp-empty"><i class="fa-solid fa-notes-medical"></i><p>まだ看護計画がありません。「＋看護計画を追加」から看護問題・目標・OP・TP・EPを入力できます。</p></div>`;
        return;
      }
      const focus = captureCarePlanFocus();
      wrap.innerHTML = plans.map((p, k) => carePlanCardHtml(cp, p, k, plans.length)).join('');
      restoreCarePlanFocus(focus);
      renderCarePlanSetReview();
    }

    function carePlanBasisHtml(p, cp) {
      const pid = safeDomId(p.id);
      const parts = [];
      if (p.note) parts.push(`<p class="cp-note">${escapeHtml(p.note)}</p>`);
      if (p.evidence && p.evidence.length) parts.push(`<div class="cp-ev"><span class="my-asm-label"><i class="fa-solid fa-diagram-project"></i> 根拠データ（関連図から）</span><div class="cpr-ev">${p.evidence.map(e => `<span>${escapeHtml(e)}</span>`).join('')}</div></div>`);
      if(cp&&(p.evidenceIds||[]).length)parts.push(`<div class="cp-ev"><b>根拠の情報カードを確認</b><div style="display:flex;gap:6px;flex-wrap:wrap">${[...new Set(p.evidenceIds.map(String))].map(id=>carePlanLinkedCardHtml(cp,p,id)).join('')}</div></div>`);
      const reasons = Array.isArray(p.reasons) ? p.reasons : [];
      if (reasons.length) parts.push(`<div class="cp-reasons"><span class="my-asm-label"><i class="fa-solid fa-graduation-cap"></i> この患者に必要な理由</span><ul>${reasons.slice(-5).map(r => `<li>${r.about ? `<b>${escapeHtml(r.about)}</b>：` : ''}${escapeHtml(r.text)}</li>`).join('')}</ul><button type="button" class="my-asm-link" onclick="writeCareReasonUI('${pid}')">理由を足す</button></div>`);

      if (p.distinct) parts.push(`<p class="cp-note">${escapeHtml(p.distinct)}</p>`);
      const refs = cp ? (p.refs || []).map(r => { const id = cpResolvePlanId(cp, r.id); const q = id && getCarePlan(cp, id); const n = q ? carePlanList(cp).findIndex(x => x.id === q.id) + 1 : 0; return q ? `<li>#${n} ${escapeHtml(q.problem)}：${escapeHtml(r.why)}</li>` : ''; }).join('') : '';
      if (refs) parts.push(`<div class="cp-note"><b>関連する計画：</b><ul>${refs}</ul></div>`);
      return parts.length ? `<div class="cp-basis">${parts.join('')}</div>` : '';
    }
    function carePlanCardHtml(cp, p, k, n) {

      const pid = safeDomId(p.id);
      const open = carePlanOpen.has(p.id);
      const last = latestCareRecord(p);
      const ach = last && last.achievement ? CARE_ACHIEVEMENTS.find(a => a.key === last.achievement) : null;
      const status = CARE_PLAN_STATUSES.find(s => s.key === p.status);
      const needs = p.relatedNeeds.map(h => `<span class="cp-need">${h}.${escapeHtml(hendersonNameOf(h).replace(/^\d+\.\s*/, ''))}</span>`).join('');
      const head = `<div class="cp-head">
        <span class="cp-no">#${k + 1}</span>
        <button type="button" class="cp-title" onclick="toggleCarePlan('${pid}')" aria-expanded="${open}"><i class="fa-solid fa-chevron-${open ? 'down' : 'right'}"></i> ${escapeHtml(p.problem || '（看護問題を書いてください）')}</button>
        <span class="cp-status cp-status-${p.status}">${status.label}</span>
        ${ach ? `<span class="cp-ach cp-ach-${ach.key}" title="最新の評価（${escapeHtml(formatMyDateTime(last.at))}）">${ach.label}</span>` : ''}
        <span class="cp-meta">${needs}<span class="my-asm-muted">記録 ${p.records.length}件</span></span>
        <span class="cp-order"><button type="button" class="icon-btn" onclick="moveCarePlanUI('${pid}','up')" ${k === 0 ? 'disabled' : ''} title="優先順位を上げる"><i class="fa-solid fa-arrow-up"></i></button><button type="button" class="icon-btn" onclick="moveCarePlanUI('${pid}','down')" ${k === n - 1 ? 'disabled' : ''} title="優先順位を下げる"><i class="fa-solid fa-arrow-down"></i></button></span>
      </div>`;
      if (!open) return `<section class="cp-card">${head}</section>`;
      const field = (key, label, rows, placeholder) => `<label class="cp-field"><span class="my-asm-label">${label}</span><textarea class="field my-asm-text" rows="${rows}" data-cp-plan="${pid}" data-cp-field="${key}" placeholder="${escapeHtml(placeholder)}" oninput="onCarePlanInput('${pid}','${key}',this)">${escapeHtml(Array.isArray(p[key]) ? p[key].join('\n') : p[key])}</textarea></label>`;
      const needBtns = HENDERSON_NEEDS.map(nd => `<button type="button" class="cp-need-btn${p.relatedNeeds.includes(nd.id) ? ' active' : ''}" onclick="toggleCarePlanNeed('${pid}', ${nd.id})" title="${escapeHtml(nd.name)}">${nd.id}.${escapeHtml(nd.name.replace(/^\d+\.\s*/, ''))}</button>`).join('');
      const records = p.records.slice().reverse().map(r => careRecordHtml(p, r, cp)).join('');
      return `<section class="cp-card open" data-care-plan-id="${pid}">${head}
        <div class="cp-body">
          <label class="cp-field"><span class="my-asm-label"><i class="fa-solid fa-triangle-exclamation"></i> 看護問題（看護診断）</span><input type="text" class="field my-asm-text" data-cp-plan="${pid}" data-cp-field="problem" value="${escapeHtml(p.problem)}" placeholder="例：術後の創部痛に関連した急性疼痛" oninput="onCarePlanInput('${pid}','problem',this)" onchange="onCarePlanProblemCommit('${pid}')"></label>
          ${carePlanBasisHtml(p, cp)}
          <div class="cp-row"><span class="my-asm-label"><i class="fa-solid fa-table-cells"></i> 関係する項目</span><div class="cp-need-btns">${needBtns}</div></div>
          <div class="cp-grid2">${field('goalLong', '<i class="fa-solid fa-flag-checkered"></i> 長期目標', 2, '例：退院までに歩行器で病棟内を自立して移動できる')}${field('goalShort', '<i class="fa-solid fa-flag"></i> 短期目標', 2, '例：3日後までに、痛みがNRS3以下でリハビリに参加できる')}</div>
          <div class="cp-grid3">${CARE_PLAN_SECTIONS.map(s => field(s.key, `<i class="fa-solid fa-list-ol"></i> ${s.label}`, 5, s.placeholder)).join('')}</div>
          <div class="cp-actions">
            <label class="cp-status-select"><span class="my-asm-label">状態</span><select class="field" onchange="setCarePlanStatus('${pid}', this.value)">${CARE_PLAN_STATUSES.map(s => `<option value="${s.key}"${p.status === s.key ? ' selected' : ''}>${s.label}</option>`).join('')}</select></label>
            <button type="button" class="btn btn-outline my-asm-btn${carePlanReviewOpen.has(p.id) ? ' active' : ''}" onclick="toggleCarePlanReview('${pid}')" aria-expanded="${carePlanReviewOpen.has(p.id)}" title="目標・OP/TP/EPを7つの項目で確かめます"><i class="fa-solid fa-clipboard-list"></i> 計画をチェック</button>
            <button type="button" class="btn btn-outline my-asm-btn" onclick="regenerateCarePlanUI('${pid}')" title="目標・OP/TP/EPを、いまの看護問題に合わせて作り直します（書いた内容は置き換わります）"><i class="fa-solid fa-rotate"></i> この問題で作り直す</button>
            <button type="button" class="btn btn-primary my-asm-btn" onclick="openCareRecord('${pid}')"><i class="fa-solid fa-plus"></i> 実施・評価を記録</button>
            <button type="button" class="btn btn-outline my-asm-btn cp-delete" onclick="deleteCarePlanUI('${pid}')"><i class="fa-solid fa-trash-can"></i> この計画を消す</button>
          </div>
          ${carePlanReviewOpen.has(p.id) ? carePlanReviewHtml(cp, p) : ''}
          <div class="cp-records"><div class="my-asm-label"><i class="fa-solid fa-clipboard-check"></i> 実施・評価の記録（新しい順）</div>${records || '<p class="my-asm-muted">まだ記録がありません。「実施・評価を記録」から、実施した内容・患者の反応・目標の達成状況を残します。</p>'}</div>
        </div>
      </section>`;
    }
    function careRecordHtml(p, r, cp) {
      const pid = safeDomId(p.id);
      const ach = CARE_ACHIEVEMENTS.find(a => a.key === r.achievement);
      const row = (label, v) => v ? `<div class="cr-row"><b>${label}</b><p>${escapeHtml(v)}</p></div>` : '';
      return `<div class="cr">
        <div class="cr-head"><span class="cr-when"><i class="fa-regular fa-calendar"></i> ${escapeHtml(formatMyDateTime(r.at))}</span>${ach && ach.key ? `<span class="cp-ach cp-ach-${ach.key}">${ach.label}</span>` : ''}
          <span class="cr-tools"><button type="button" class="my-asm-link" onclick="openCareRecord('${pid}','${safeDomId(r.id)}')">編集</button><button type="button" class="my-asm-link muted" onclick="deleteCareRecordUI('${pid}','${safeDomId(r.id)}')">削除</button></span></div>
        ${r.doneItems.length ? `<div class="cr-row"><b>実施した計画</b><ul>${r.doneItems.map(d => `<li>${escapeHtml(d)}</li>`).join('')}</ul></div>` : ''}
        ${row('実施内容', r.doneText)}${row('患者の反応', r.response)}${row('評価', r.evaluation)}${row('今後の方針・計画の修正', r.revision)}
        ${r.responseCardId?`<div class="cr-row"><b>患者反応の情報カード</b>${carePlanLinkedCardHtml(cp,p,r.responseCardId,r.id)}</div>`:''}
      </div>`;
    }
    function captureCarePlanFocus() {
      const a = document.activeElement;
      if (!a || !a.dataset || !a.dataset.cpField) return null;
      return { plan: a.dataset.cpPlan, field: a.dataset.cpField, start: a.selectionStart, end: a.selectionEnd };
    }
    function restoreCarePlanFocus(f) {
      if (!f) return;
      const el = document.querySelector(`[data-cp-plan="${f.plan}"][data-cp-field="${f.field}"]`);
      if (!el) return;
      el.focus();
      try { el.setSelectionRange(f.start, f.end); } catch (e) {   }
    }
    function commitCarePlanChange(cp, rerender = true) {
      saveMyAssessmentsSoon(cp.id, 0);
      if (rerender) renderCarePlans();
    }

    // Structural operations include response cards; later edits must never be overwritten.
    const careOperationHistories = new Map();
    function careOperationSnapshot(cp) {
      return JSON.stringify({carePlans: cp.carePlans || {}, items: cp.items || [], dependencies: {myAssessments: cp.myAssessments || {}, missingChecks: cp.missingChecks || {}, relationMap: cp.relationMap || null}});
    }
    function rememberCareOperation(cp, before) {
      const after = careOperationSnapshot(cp);
      if (before === after) return;
      const history = careOperationHistories.get(cp.id) || {undo: [], redo: []};
      history.undo.push({before, after});
      if (history.undo.length > 40) history.undo.shift();
      history.redo = [];
      careOperationHistories.set(cp.id, history);
    }
    function careOperationStillCurrent(cp, snapshot) {
      if (getCurrentPatient()?.id === cp.id && careOperationSnapshot(cp) === snapshot) return true;
      showToast('確認中に患者・計画・根拠が更新されました。変更を適用せず現在の内容を保持しました', 'warn');
      return false;
    }
    window.undoCareOperation = function(redo = false) {
      const cp = getCurrentPatient();
      const history = careOperationHistories.get(cp.id);
      const from = history && (redo ? history.redo : history.undo);
      const entry = from && from[from.length - 1];
      if (!entry) { showToast('戻せる計画・記録の操作はありません', 'info'); return false; }
      if (careOperationSnapshot(cp) !== (redo ? entry.before : entry.after)) {
        showToast('計画やカードに後続の変更があります。現在の内容を保護するため変更しません', 'warn');
        return false;
      }
      const restored = JSON.parse(redo ? entry.after : entry.before);
      cp.carePlans = restored.carePlans;
      cp.items = restored.items;
      from.pop();
      (redo ? history.undo : history.redo).push(entry);
      saveDataAndSync();
      renderCarePlans();
      showToast(redo ? '計画・記録の操作をやり直しました' : '計画・記録の操作を元に戻しました', 'info');
      return true;
    };

    const carePlanFieldHistories = new Map();
    const carePlanUndoFields = new Set(['problem','goalShort','goalLong','op','tp','ep','status','relatedNeeds','reason']);
    const cpHistoryClone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    function carePlanFieldHistory(cp) {
      if (!carePlanFieldHistories.has(cp.id)) carePlanFieldHistories.set(cp.id,{undo:[],redo:[]});
      return carePlanFieldHistories.get(cp.id);
    }
    function rememberCarePlanField(cp,id,key,before,after) {
      if (!carePlanUndoFields.has(key) || JSON.stringify(before)===JSON.stringify(after)) return;
      const history=carePlanFieldHistory(cp), last=history.undo[history.undo.length-1], now=Date.now();
      if (last && last.id===id && last.key===key && now-last.at<750 && JSON.stringify(last.after)===JSON.stringify(before)) {
        last.after=cpHistoryClone(after); last.at=now;
      } else history.undo.push({id,key,before:cpHistoryClone(before),after:cpHistoryClone(after),at:now});
      if(history.undo.length>40) history.undo.shift();
      history.redo=[];
    }
    window.undoCarePlanField = function(redo=false) {
      const cp=getCurrentPatient(), history=carePlanFieldHistory(cp), from=redo?history.redo:history.undo, to=redo?history.undo:history.redo;
      const entry=from[from.length-1];
      if(!entry){showToast('戻せる看護計画の編集はありません','info');return false;}
      const plan=getCarePlan(cp,entry.id), expected=redo?entry.before:entry.after;
      if(!plan || JSON.stringify(plan[entry.key])!==JSON.stringify(expected)) {
        showToast('計画が削除・更新されています。現在の内容を保護するため変更しません','warn');return false;
      }
      updateCarePlan(cp,entry.id,{[entry.key]:cpHistoryClone(redo?entry.after:entry.before),userEdited:true});
      from.pop();to.push(entry);if(to.length>40)to.shift();
      commitCarePlanChange(cp);
      showToast(redo?'看護計画の編集をやり直しました':'看護計画の編集を元に戻しました','info');return true;
    };
    window.toggleCarePlan = function(id) {
      if (carePlanOpen.has(id)) carePlanOpen.delete(id); else carePlanOpen.add(id);
      renderCarePlans();
    };
    window.onCarePlanInput = function(id, key, el) {
      const cp = getCurrentPatient();
      const p = getCarePlan(cp, id);
      if (!p) return;
      const before = cpHistoryClone(p[key]);
      p[key] = CARE_PLAN_SECTIONS.some(s => s.key === key) ? carePlanLinesToList(el.value) : el.value;
      rememberCarePlanField(cp,id,key,before,p[key]);
      if (key !== 'problem') p.userEdited = true;

      p.updatedAt = new Date().toISOString();
      saveMyAssessmentsSoon(cp.id);
      if (key === 'problem') {
        const t = document.querySelector(`.cp-card [onclick="toggleCarePlan('${id}')"]`);
        if (t) t.innerHTML = `<i class="fa-solid fa-chevron-down"></i> ${escapeHtml(el.value || '（看護問題を書いてください）')}`;
      }
    };

    window.onCarePlanProblemCommit = function(id) {
      const cp = getCurrentPatient();
      const operationBefore = careOperationSnapshot(cp);
      const p = getCarePlan(cp, id);
      if (!p) return;
      if (!p.userEdited) { applyCarePlanValidation(cp, p); if (!p.goalShort && !p.op.length || cpPlanIncoherent(p) || p.genKey !== cpPlanKey(p)) regenerateCarePlanSections(cp, p); }
      refineCarePlans(cp);
      rememberCareOperation(cp, operationBefore);
      commitCarePlanChange(cp, true);
      if (p.userEdited) showToast('看護問題が変わりました。目標・OP/TP/EPが古い問題のままになっていないか確認し、必要なら「この問題で作り直す」を押してください', 'info', 7000);
    };
    window.regenerateCarePlanUI = function(id) {
      const cp = getCurrentPatient();
      const operationBefore = careOperationSnapshot(cp);
      const p = getCarePlan(cp, id);
      if (!p) return;
      regenerateCarePlanSections(cp, p);
      refineCarePlans(cp);
      rememberCareOperation(cp, operationBefore);
      commitCarePlanChange(cp, true);
      showToast('この看護問題に合わせて、目標・OP/TP/EPを作り直しました', 'success');
    };
    window.toggleCarePlanNeed = function(id, needId) {
      const cp = getCurrentPatient();
      const p = getCarePlan(cp, id);
      if (!p) return;
      const needs = p.relatedNeeds.includes(needId) ? p.relatedNeeds.filter(h => h !== needId) : [...p.relatedNeeds, needId].sort((a, b) => a - b);
      rememberCarePlanField(cp,id,'relatedNeeds',p.relatedNeeds,needs);
      updateCarePlan(cp, id, { relatedNeeds: needs });
      commitCarePlanChange(cp);
    };
    window.setCarePlanStatus = function(id, status) {
      const cp = getCurrentPatient();
      const p=getCarePlan(cp,id);if(!p)return;
      rememberCarePlanField(cp,id,'status',p.status,status);
      updateCarePlan(cp, id, { status });
      commitCarePlanChange(cp);
    };
    window.moveCarePlanUI = function(id, dir) {
      const cp = getCurrentPatient();
      const operationBefore = careOperationSnapshot(cp);
      if (moveCarePlan(cp, id, dir)) { rememberCareOperation(cp, operationBefore); commitCarePlanChange(cp); }
    };
    window.addCarePlanUI = function() {
      const cp = getCurrentPatient();
      const operationBefore = careOperationSnapshot(cp);
      const p = createCarePlan(cp, {});
      carePlanOpen.add(p.id);
      rememberCareOperation(cp, operationBefore);
      commitCarePlanChange(cp);
      setTimeout(() => { const el = document.querySelector(`[data-cp-plan="${p.id}"][data-cp-field="problem"]`); if (el) el.focus(); }, 30);
    };
    window.deleteCarePlanUI = async function(id) {
      const cp = getCurrentPatient();
      const p = getCarePlan(cp, id);
      if (!p) return;
      const expected = JSON.stringify(p);
      const ok = await openDialog({ title: 'この看護計画を消しますか？', message: `「${p.problem || '（無題）'}」と、その実施・評価の記録${p.records.length}件を消します。`, confirmLabel: '消す', danger: true });
      if (ok !== true) return;
      const current=getCurrentPatient();
      if(current?.id!==cp.id || JSON.stringify(getCarePlan(current,id))!==expected){showToast('確認中に患者または計画が更新されました。削除せず、現在の内容を保持しました','warn');return;}
      const operationBefore = careOperationSnapshot(current);
      deleteCarePlan(current, id);
      rememberCareOperation(current, operationBefore);
      commitCarePlanChange(current);
      showToast('看護計画を消しました', 'info');
    };

    function importCarePlans(cp, source, now = new Date().toISOString()) {
      return [];
    }
    window.importCarePlansUI = function() {
      showToast('AIの結果からの取り込みは廃止しました。「＋看護計画を追加」または「関連図から取り込む」を使用してください', 'info');
    };

    const careRecordEditHistories=new Map();
    function careRecordEditHistory(cp){
      if(!careRecordEditHistories.has(cp.id))careRecordEditHistories.set(cp.id,{undo:[],redo:[]});
      return careRecordEditHistories.get(cp.id);
    }
    function rememberCareRecordEdit(cp,planId,before,after){
      if(!before || !after || JSON.stringify(before)===JSON.stringify(after))return;
      const history=careRecordEditHistory(cp);history.redo=[];
      // Creating a separate information card is a separate operation, not undone here.
      if(before.responseCardId!==after.responseCardId)return;
      history.undo.push({planId,recId:before.id,before:JSON.parse(JSON.stringify(before)),after:JSON.parse(JSON.stringify(after))});
      if(history.undo.length>40)history.undo.shift();
    }
    window.undoCareRecordEdit=function(redo=false){
      const cp=getCurrentPatient(),history=careRecordEditHistory(cp),from=redo?history.redo:history.undo,to=redo?history.undo:history.redo,entry=from[from.length-1];
      if(!entry){showToast('戻せる実施・評価記録の編集はありません','info');return false;}
      const record=getCarePlan(cp,entry.planId)?.records.find(r=>r.id===entry.recId&&!r.deleted);
      if(!record || JSON.stringify(record)!==JSON.stringify(redo?entry.before:entry.after)){
        showToast('記録が削除・更新されています。現在の内容を保持しました','warn');return false;
      }
      updateCareRecord(cp,entry.planId,entry.recId,JSON.parse(JSON.stringify(redo?entry.after:entry.before)));
      from.pop();to.push(entry);if(to.length>40)to.shift();
      commitCarePlanChange(cp);showToast(redo?'記録の編集をやり直しました':'記録の編集を元に戻しました','info');return true;
    };
    function careRecordPlanState(p){return JSON.stringify([p.problem,p.relatedNeeds,p.goalShort,p.goalLong,p.op,p.tp,p.ep]);}
    let careRecordEditing = null; // { planId, recId }
    window.openCareRecord = function(planId, recId = null) {
      const cp = getCurrentPatient();
      const p = getCarePlan(cp, planId);
      if (!p) return;
      const r = recId ? p.records.find(x => x.id === recId) : null;
      careRecordEditing = { patientId:cp.id, planId, recId:r?r.id:null, expectedPlan:careRecordPlanState(p), expectedRecord:r?JSON.stringify(r):null };
      document.getElementById('care-record-title').textContent = `${r ? '実施・評価の記録を直す' : '実施・評価を記録'}：${p.problem || '（無題）'}`;
      document.getElementById('care-record-at').value = toLocalInputValue(r ? r.at : null);
      const done = new Set(r ? r.doneItems : []);
      const items = CARE_PLAN_SECTIONS.flatMap(s => p[s.key].map((t, k) => `${s.short}${k + 1} ${t}`));
      document.getElementById('care-record-items').innerHTML = items.length
        ? items.map(t => `<label class="cr-item"><input type="checkbox" value="${escapeHtml(t)}"${done.has(t) ? ' checked' : ''}> ${escapeHtml(t)}</label>`).join('')
        : '<p class="my-asm-muted">OP/TP/EPがまだありません（下の「実施内容」に書けます）。</p>';
      document.getElementById('care-record-done').value = r ? r.doneText : '';
      document.getElementById('care-record-response').value = r ? r.response : '';
      document.getElementById('care-record-evaluation').value = r ? r.evaluation : '';
      document.getElementById('care-record-revision').value = r ? r.revision : '';
      document.querySelectorAll('#care-record-achievement input').forEach(i => { i.checked = i.value === (r ? r.achievement : ''); });
      const hasCard = r && r.responseCardId && cp.items.some(i => i.id === r.responseCardId && i.type !== 'unnecessary');
      document.getElementById('care-record-add-card').checked = false;
      document.getElementById('care-record-card-row').classList.toggle('hidden', !!hasCard);
      document.getElementById('care-record-goal').textContent = p.goalShort || p.goalLong ? `目標：${p.goalShort || p.goalLong}` : '';
      document.getElementById('modal-care-record').classList.remove('hidden');
    };
    window.closeCareRecord = function() {
      careRecordEditing = null;
      document.getElementById('modal-care-record').classList.add('hidden');
    };
    window.saveCareRecordUI = function() {
      if (!careRecordEditing) return;
      const cp = getCurrentPatient();
      const { planId, recId } = careRecordEditing;
      const p = getCarePlan(cp, planId);
      if (!p || cp.id!==careRecordEditing.patientId || careRecordPlanState(p)!==careRecordEditing.expectedPlan || (recId && JSON.stringify(p.records.find(r=>r.id===recId&&!r.deleted))!==careRecordEditing.expectedRecord)) {
        showToast('記録を開いた後に患者・計画・記録が更新されています。入力は保持しました。現在の内容を確認してから開き直してください','warn');return;
      }
      const rec = {
        at: fromLocalInputValue(document.getElementById('care-record-at').value),
        doneItems: Array.from(document.querySelectorAll('#care-record-items input:checked')).map(i => i.value),
        doneText: document.getElementById('care-record-done').value.trim(),
        response: document.getElementById('care-record-response').value.trim(),
        evaluation: document.getElementById('care-record-evaluation').value.trim(),
        revision: document.getElementById('care-record-revision').value.trim(),
        achievement: (document.querySelector('#care-record-achievement input:checked') || {}).value || ''
      };
      if (!rec.doneItems.length && !rec.doneText && !rec.response && !rec.evaluation && !rec.revision) return showToast('実施した内容・患者の反応・評価のどれかを書いてください', 'warn');
      const operationBefore = careOperationSnapshot(cp);
      const beforeRecord=recId?JSON.parse(JSON.stringify(p.records.find(r=>r.id===recId))):null;
      let card = null;
      if (rec.response && document.getElementById('care-record-add-card').checked) {
        card = createOwnInfoCard(cp, { text: rec.response, type: document.getElementById('care-record-card-type').value, needs: p.relatedNeeds, at: rec.at, fieldLabel: '患者の反応' });
        rec.responseCardId = card.id;
      }
      if (recId) { updateCareRecord(cp, planId, recId, rec); rememberCareRecordEdit(cp,planId,beforeRecord,p.records.find(r=>r.id===recId)); } else addCareRecord(cp, planId, rec);
      rememberCareOperation(cp, operationBefore);
      closeCareRecord();
      saveDataAndSync();
      renderCarePlans();
      showToast(card ? '記録しました。患者の反応を情報カードとしても追加しました' : '実施・評価を記録しました', 'success');
    };
    window.deleteCareRecordUI = async function(planId, recId) {
      const cp=getCurrentPatient(),record=getCarePlan(cp,planId)?.records.find(r=>r.id===recId&&!r.deleted);
      if(!record)return;
      const expected=JSON.stringify(record);
      const ok = await openDialog({ title: 'この記録を削除しますか？', confirmLabel: '削除', danger: true });
      if (ok !== true) return;
      const current=getCurrentPatient(),latest=getCarePlan(current,planId)?.records.find(r=>r.id===recId&&!r.deleted);
      if(current?.id!==cp.id || JSON.stringify(latest)!==expected){showToast('確認中に患者または記録が更新されました。削除していません','warn');return;}
      const operationBefore = careOperationSnapshot(current);
      if (deleteCareRecord(current, planId, recId)) { rememberCareOperation(current, operationBefore); commitCarePlanChange(current); }
    };

    // ==========================================================================

    // ==========================================================================
    // Care-plan knowledge table: standard nursing points per symptom/problem (general guidance, not a diagnosis).
    // Used only to show non-binding suggestions in the plan review and to count as existing knowledge; it never edits a plan.
    // Each point is [short text, regex that recognises the point already written in that section].
    const CPK_SRC = { nanbyo: '難病情報センター 指定難病49（全身性エリテマトーデス）', sle: '2025 ACR SLE guideline', ln: '2024 ACR/KDIGO lupus nephritis', raynaud: '2025 ACR Raynaud', pericarditis: '2025 ESC pericarditis' };
    // v.78 site research ingestion (docs/knowledge-guideline.md ledger). General nursing points, not diagnoses; each row carries its check date and next review.
    const CPK_SRC78 = { epidural: '日本臨床麻酔学会誌 2017 区域麻酔と抗血栓療法', pmda: 'PMDA 添付文書', dm: '日本糖尿病学会 診療ガイドライン2024', cdc: 'CDC SSI 予防ガイドライン', pain: '日本緩和医療学会 がん疼痛の薬物療法GL2020', gastric: '胃癌治療ガイドライン第7版2025', colon: '大腸癌治療ガイドライン2026年版', femur: '大腿骨頚部/転子部骨折診療GL2021（改訂第3版）', gyn: '産婦人科診療ガイドライン婦人科外来編2023', htn: '高血圧管理・治療ガイドライン2025', lipid: '動脈硬化性疾患予防ガイドライン2022', eye: '日本眼科学会' };
    const CPK78_META = { checked: '2026-10-15', next: '2027-10' };
    const CARE_PLAN_KNOWLEDGE = [
      { key: 'arthralgia', re: /関節痛|関節炎/, label: '関節痛', source: [CPK_SRC.nanbyo, CPK_SRC.sle],
        op: [['痛みの部位・程度（NRS）と朝のこわばり', /NRS|部位|程度|こわばり/], ['腫脹・熱感・可動域', /腫脹|熱感|可動/]],
        tp: [['鎮痛薬の与薬と効果の確認', /鎮痛|与薬|効果/], ['痛みの少ない動作・体位の工夫、温めるなどの援助', /動作|体位|温|罨法|安静/]],
        ep: [['痛みを我慢せず伝えること', /我慢|伝え|知らせ/], ['関節に負担の少ない動き方', /関節|負担|無理|動き方/]] },
      { key: 'alopecia', re: /脱毛|抜け毛/, label: '脱毛', source: [CPK_SRC.nanbyo, CPK_SRC.sle],
        op: [['脱毛の範囲・進み方と頭皮の発赤・皮疹', /範囲|進|頭皮|発赤|皮疹/]],
        tp: [['頭皮を刺激しない洗髪・ブラッシングの援助', /洗髪|ブラッシング|頭皮|刺激/], ['外見の変化への気持ちの傾聴（帽子・ウィッグの相談）', /傾聴|気持ち|ウィッグ|帽子|相談/]],
        ep: [['脱毛は病気や治療で起こりうること、不安は相談してよいこと', /病気|治療|相談|不安/]] },
      { key: 'photosensitivity', re: /光線過敏|日光過敏|紫外線/, label: '光線過敏症', source: [CPK_SRC.nanbyo, CPK_SRC.sle],
        op: [['日光にあたった状況と、発疹が出るまでの時間・分布・全身症状（発熱・倦怠感）', /日光|紫外線|曝露|分布|発疹|全身症状/]],
        tp: [['日焼け止め・帽子・長袖など遮光の援助と皮膚の保護', /遮光|日焼け|帽子|長袖|保護/]],
        ep: [['季節を問わない継続した遮光', /継続|季節|遮光|日焼け/], ['日光にあたったあとの症状の記録', /記録|メモ|日誌/]] },
      { key: 'chilblain', re: /凍瘡様|しもやけ|凍瘡/, label: '凍瘡様紅斑', source: [CPK_SRC.nanbyo, CPK_SRC.sle],
        op: [['紅斑の部位・色調・痛みやかゆみ、寒冷との関係', /部位|色調|紅斑|痛み|かゆみ|寒冷/]],
        tp: [['手袋・靴下などの保温と皮膚の保護', /保温|手袋|靴下|保護/]],
        ep: [['寒冷を避けること、悪化したら知らせること', /寒冷|冷|知らせ|悪化/]] },
      { key: 'raynaud', re: /レイノー/, label: 'レイノー現象', source: [CPK_SRC.raynaud, CPK_SRC.nanbyo],
        op: [['指趾の色調変化（白→紫→赤）と誘因（寒冷・ストレス）、しびれ・潰瘍', /色調|誘因|寒冷|しびれ|潰瘍/]],
        tp: [['手袋・靴下による保温と、冷水に触れないための援助', /保温|手袋|靴下|冷水/]],
        ep: [['寒冷や喫煙を避けること、潰瘍や痛みが続くときは知らせること', /寒冷|喫煙|潰瘍|知らせ|受診/]] },
      { key: 'nephritis', re: /ループス腎炎|腎炎|蛋白尿/, label: 'ループス腎炎', source: [CPK_SRC.ln, CPK_SRC.nanbyo],
        op: [['尿量・尿の性状（泡立ち・血尿）・体重・浮腫・血圧', /尿量|尿の|血尿|体重|浮腫|血圧/], ['尿蛋白・腎機能の検査値', /尿蛋白|蛋白尿|腎機能|Cre|eGFR|検査値/]],
        tp: [['指示された塩分・水分の管理の援助', /塩分|水分|食事/]],
        ep: [['むくみ・尿の変化に気づいたら知らせること、服薬を続けること', /むくみ|浮腫|尿の変化|服薬|内服/]] },
      { key: 'bleeding', re: /出血傾向|出血|紫斑|点状出血/, label: '出血傾向・出血', source: [CPK_SRC.nanbyo, CPK_SRC.sle],
        op: [['出血部位・量、紫斑、血小板・凝固の検査値', /部位|量|紫斑|血小板|凝固|検査値/]],
        tp: [['やわらかい歯ブラシ・電動シェーバーなど出血予防と、出血時の圧迫止血', /歯ブラシ|シェーバー|予防|圧迫|止血/]],
        ep: [['出血したときの対応と受診の目安、自己判断で薬を中止しないこと', /対応|受診|自己判断|中止|知らせ/]] },
      { key: 'anemia', re: /貧血/, label: '貧血', source: [CPK_SRC.nanbyo, CPK_SRC.sle],
        op: [['顔色・めまい・動悸・息切れとHb値', /顔色|めまい|動悸|息切れ|Hb/]],
        tp: [['立ち上がりをゆっくりにする、活動と休息の調整、転倒予防', /ゆっくり|休息|転倒|活動/]],
        ep: [['ふらつき・動悸が強いときは動かず知らせること', /ふらつき|動悸|知らせ|ナースコール/]] },
      { key: 'dyspnea', re: /息切れ|呼吸困難|労作時呼吸/, label: '息切れ', source: [CPK_SRC.nanbyo, CPK_SRC.sle],
        op: [['呼吸数・SpO2・息切れの程度（動作との関係）・胸痛・咳', /呼吸数|SpO2|程度|動作|胸痛|咳/]],
        tp: [['楽な体位と、休息をはさんだ動作の援助', /体位|ファウラー|休息|ゆっくり/]],
        ep: [['動作をゆっくり行うこと、息苦しさが増したらすぐ知らせること', /ゆっくり|知らせ|ナースコール/]] },
      { key: 'pleuritis', re: /胸膜炎|胸水|胸膜痛/, label: '胸膜炎', source: [CPK_SRC.nanbyo, CPK_SRC.sle],
        op: [['深呼吸や咳で強まる胸痛・呼吸数・SpO2・呼吸音・発熱', /胸痛|深呼吸|呼吸数|SpO2|呼吸音|発熱/]],
        tp: [['痛みの少ない体位と、鎮痛・深呼吸の援助', /体位|鎮痛|深呼吸/]],
        ep: [['痛みを我慢せず伝えること、息苦しさが悪化したら知らせること', /我慢|伝え|知らせ/]] },
      { key: 'pericarditis', re: /心外膜炎|心膜炎|心膜液/, label: '心外膜炎', source: [CPK_SRC.pericarditis, CPK_SRC.nanbyo],
        op: [['前かがみで和らぐ胸痛・発熱・脈拍・血圧・息苦しさ', /胸痛|発熱|脈拍|血圧|息苦|前かがみ/]],
        tp: [['安静と楽な体位（前傾位など）・鎮痛の援助', /安静|体位|前傾|鎮痛/]],
        ep: [['胸痛・息苦しさ・動悸が強まったらすぐ知らせること、指示された期間の安静や運動制限', /知らせ|安静|運動|制限/]] },
      { key: 'neuro', re: /神経症状|けいれん|痙攣|しびれ|意識障害|精神症状/, label: '神経症状', source: [CPK_SRC.nanbyo, CPK_SRC.sle],
        op: [['意識レベル・頭痛・けいれん・しびれ・麻痺・気分や言動の変化', /意識|頭痛|けいれん|痙攣|しびれ|麻痺|言動|気分/]],
        tp: [['転倒・けいれん時に備えた安全な環境の調整', /安全|転倒|環境|ベッド柵/]],
        ep: [['症状が出たら知らせること、家族への変化の気づき方', /知らせ|家族|変化/]] },
      { key: 'headache', re: /頭痛/, label: '頭痛', source: [CPK_SRC.nanbyo, CPK_SRC.sle],
        op: [['痛みの部位・程度・持続と、嘔気・発熱・視覚の異常・意識の変化', /部位|程度|持続|嘔気|発熱|視覚|意識/]],
        tp: [['静かで暗い環境での安静と、与薬・効果の確認', /安静|環境|与薬|鎮痛|効果/]],
        ep: [['我慢せず伝えること、強い頭痛やけいれん・意識の変化はすぐ知らせること', /我慢|伝え|知らせ|すぐ/]] },
      { key: 'rash', re: /蝶形紅斑|円板状|頬部紅斑|皮疹/, label: '蝶形紅斑・円板状皮疹', source: [CPK_SRC.nanbyo, CPK_SRC.sle],
        op: [['皮疹の部位・範囲・色調・かゆみや痛み、日光との関係', /部位|範囲|色調|かゆみ|痛み|日光/]],
        tp: [['遮光と、刺激の少ない洗顔・保湿など皮膚の保護', /遮光|保湿|洗顔|保護|刺激/]],
        ep: [['継続した遮光と、皮疹の変化を伝えること', /遮光|継続|変化|伝え|知らせ/]] },
      { key: 'myalgia', re: /筋肉痛|筋痛|筋力低下/, label: '筋肉痛', source: [CPK_SRC.nanbyo, CPK_SRC.sle],
        op: [['痛みの部位・程度、筋力低下、動作との関係、CKなどの検査値', /部位|程度|筋力|動作|CK|検査値/]],
        tp: [['無理のない動作の援助と、休息・鎮痛', /動作|休息|安静|鎮痛|温/]],
        ep: [['無理をせず休むこと、痛みや脱力が強まったら知らせること', /無理|休|知らせ|伝え/]] },
      { key: 'infection', re: /感染リスク|易感染|免疫抑制/, label: '感染リスク', source: [CPK_SRC.nanbyo, CPK_SRC.sle],
        op: [['体温・倦怠感・咳・排尿時痛・皮膚粘膜の変化・WBC/CRP', /体温|倦怠|咳|排尿|皮膚|WBC|CRP/]],
        tp: [['手洗い・口腔ケア・清潔の援助', /手洗い|手指|口腔|清潔/]],
        ep: [['発熱時は自己判断せず連絡すること（感染か病気の再燃かは医師が判断）、自己判断で薬を止めないこと', /発熱|連絡|知らせ|自己判断|中止/]] },
      { key: 'aps', re: /抗リン脂質|血栓|塞栓|DVT/, label: '抗リン脂質抗体・血栓', source: [CPK_SRC.nanbyo, CPK_SRC.sle],
        op: [['下肢の腫脹・痛み・左右差、突然の息苦しさ・胸痛・神経症状', /下肢|腫脹|左右差|息苦|胸痛|神経/]],
        tp: [['早期離床・下肢の運動・弾性ストッキングなどの血栓予防の援助', /離床|運動|弾性|ストッキング|フットポンプ|予防/]],
        ep: [['片側のはれ・痛み、突然の息苦しさや麻痺はすぐ知らせること、抗凝固薬服用中の出血に注意すること', /知らせ|すぐ|受診|出血/]] },
      // ---- v.78 rows
      { key: 'epidural-removal', re: /硬膜外(?:カテーテル)?.{0,6}(?:抜去|抜管|除去)|硬膜外.{0,4}カテ.{0,4}抜去/, label: '硬膜外カテーテル抜去', source: [CPK_SRC78.epidural], ...CPK78_META,
        op: [['抜去時刻と、抗血栓薬の薬剤名・最終投与／再開の時刻', /抜去時刻|時刻|抗血栓|抗凝固|最終投与|再開/], ['穿刺部の出血・背部痛・新規のしびれ／筋力低下・排尿障害', /穿刺部|出血|背部痛|しびれ|筋力|排尿/]],
        tp: [['施設の手順に沿った抜去後の観察と、神経の異常があれば速やかに報告', /手順|抜去後|観察|報告/]],
        ep: [['背中の痛み・しびれ・足の動かしにくさ・排尿のしにくさをすぐ知らせること', /背中|背部痛|しびれ|足|排尿|知らせ/]] },
      { key: 'flomoxef', re: /フルマリン|フロモキセフ/, label: 'フルマリン（フロモキセフ）', source: [CPK_SRC78.pmda], ...CPK78_META,
        op: [['投与直後の呼吸困難・喘鳴・発疹・血圧、体温・感染局所', /呼吸困難|喘鳴|発疹|血圧|体温|感染/], ['便回数・血便・尿量、Cr/BUN・AST/ALT・CBC', /便|血便|尿量|Cr|BUN|AST|ALT|CBC|検査値/]],
        tp: [['アレルギー歴の照合・投与速度の確認、異常時は中止して報告', /アレルギー|速度|中止|報告/]],
        ep: [['呼吸の苦しさ・発疹・強い下痢や血便を知らせること', /呼吸|発疹|下痢|血便|知らせ/]] },
      { key: 'oxycodone', re: /オキシコドン|オキシコンチン|オキノーム|オキファスト|オキシコンチン/, label: 'オキシコドン', source: [CPK_SRC78.pmda, CPK_SRC78.pain], ...CPK78_META,
        op: [['疼痛（投与前後）・レスキュー回数・呼吸数／SpO2・意識／傾眠', /疼痛|痛み|NRS|レスキュー|呼吸数|SpO2|意識|傾眠/], ['悪心・排便・尿閉・転倒', /悪心|嘔気|排便|便秘|尿閉|転倒/]],
        tp: [['鎮痛と副作用をセットで評価し、便秘対策を行う', /副作用|便秘|緩下|排便/]],
        ep: [['自己判断で増量・中止しないこと、他の人に譲らないこと、保管の仕方（追加服用の自己判断も禁止）', /自己判断|増量|中止|譲|保管|追加/]] },
      { key: 'insulin', re: /インスリン/, label: 'インスリン', source: [CPK_SRC78.dm], ...CPK78_META,
        op: [['製剤名・単位・投与時刻（製剤が未特定なら作用時間は推定しない）、血糖・食事摂取量', /製剤|単位|時刻|血糖|摂取量|食事/], ['発汗・振戦・動悸・意識の変化（低血糖症状）', /発汗|振戦|動悸|意識|低血糖/]],
        tp: [['患者・薬剤・単位・タイミングの照合、食事がとれないときは指示を確認', /照合|確認|指示|単位/]],
        ep: [['低血糖症状・自己測定・手技・携帯する糖質・シックデイの対応', /低血糖|自己測定|手技|糖質|シックデイ/]] },
      { key: 'diabetes', re: /糖尿病/, label: '糖尿病', source: [CPK_SRC78.dm], ...CPK78_META,
        op: [['血糖・食事・低血糖症状・口渇／尿量', /血糖|食事|低血糖|口渇|尿量/], ['足の皮膚・感染・腎機能', /足|皮膚|感染|腎機能|Cr|eGFR/]],
        tp: [['食事・内服／注射の確認と、低血糖時の対応の準備', /食事|内服|注射|低血糖|対応/]],
        ep: [['シックデイの対応と、足の観察・血糖測定の習慣', /シックデイ|足|血糖測定|自己測定/]] },
      { key: 'wound-redness', re: /(?:手術創|創部|創).{0,6}(?:発赤|熱感|腫脹)|(?:発赤|熱感).{0,6}(?:手術創|創部)|SSI|創感染/, label: '手術創の発赤（感染評価）', source: [CPK_SRC78.cdc], ...CPK78_META,
        op: [['発赤・熱感・腫脹・疼痛、排液の量・性状・臭い、創の離開、体温（発赤だけで感染と決めず、他の原因も含めて評価）', /発赤|熱感|腫脹|疼痛|排液|離開|体温/]],
        tp: [['手指衛生と創処置、異常があれば報告', /手指|手洗い|創処置|処置|報告/]],
        ep: [['創を清潔に保つこと、発熱・膿のような排液・痛みの悪化があれば受診すること', /清潔|発熱|排液|痛み|受診|知らせ/]] },
      { key: 'dull-pain', re: /鈍痛|突出痛/, label: '鈍痛・突出痛', source: [CPK_SRC78.pain], ...CPK78_META,
        op: [['NRS・部位・性状・安静時／体動時、突出痛・睡眠・ADLへの影響', /NRS|部位|性状|安静|体動|突出痛|睡眠|ADL/], ['鎮痛薬の効果・副作用と、投薬後の再評価', /効果|副作用|再評価/]],
        tp: [['安楽な体位・非薬物的な援助と、再評価', /体位|非薬物|罨法|再評価/]],
        ep: [['痛みを我慢せず伝えること、定時薬とレスキュー薬の役割の違い', /我慢|伝え|知らせ|定時|レスキュー/]] },
      { key: 'gastrectomy', re: /胃全摘|胃切除|幽門側胃/, label: '胃切除後', source: [CPK_SRC78.gastric], ...CPK78_META,
        op: [['バイタル・腹痛・創・ドレーン・呼吸、排ガス・排便・悪心', /バイタル|腹痛|創|ドレーン|呼吸|排ガス|排便|悪心/], ['摂食量・食後症状・体重', /摂食|摂取|食後|体重/]],
        tp: [['早期離床・呼吸ケアと、少量頻回の食事の援助', /離床|呼吸|少量|頻回/]],
        ep: [['食事の方法・体重の測り方・食後症状・受診の目安', /食事|体重|食後|受診/]] },
      { key: 'sigmoid', re: /S状結腸(?:がん|癌)|結腸(?:がん|癌)|大腸(?:がん|癌)/, label: '結腸がん（術後）', source: [CPK_SRC78.colon], ...CPK78_META,
        op: [['排便・血便・腹満・嘔吐、Hb、術後の経過', /排便|血便|腹満|嘔吐|Hb|術後/]],
        tp: [['腹部症状の観察と、排便状況に合わせた援助', /腹部|観察|排便|援助/]],
        ep: [['持続する腹痛・膨満・嘔吐・排便排ガスの停止は早めに申告すること', /腹痛|膨満|嘔吐|排ガス|申告|知らせ/]] },
      { key: 'femoral-neck', re: /大腿骨頸部骨折|大腿骨頚部骨折|大腿骨転子部骨折/, label: '大腿骨近位部骨折', source: [CPK_SRC78.femur], ...CPK78_META,
        op: [['疼痛・患肢の神経血管所見・移動能力・せん妄', /疼痛|痛み|神経|血管|しびれ|移動|せん妄/], ['呼吸・排泄・栄養・創・深部静脈血栓の徴候', /呼吸|排泄|栄養|創|血栓|腫脹/]],
        tp: [['疼痛管理・安全な移乗・早期離床・転倒予防', /疼痛|移乗|離床|転倒/]],
        ep: [['荷重制限・補助具の使い方、再転倒・二次骨折の予防', /荷重|補助具|杖|歩行器|転倒|骨折/]] },
      { key: 'pancreatic-head', re: /膵頭部(?:がん|癌)|膵(?:がん|癌)/, label: '膵頭部がん', source: [CPK_SRC78.pain], ...CPK78_META,
        op: [['黄疸・掻痒・尿便の色・発熱・腹背部痛', /黄疸|掻痒|かゆみ|尿|便の色|発熱|腹痛|背部痛/], ['食欲・体重・血糖・肝胆道系の検査値', /食欲|体重|血糖|AST|ALT|Bil|検査値/]],
        tp: [['疼痛・掻痒・栄養・血糖の援助と、胆道感染が疑われるときの早期報告', /疼痛|掻痒|栄養|血糖|報告/]],
        ep: [['発熱と黄疸・痛みの悪化・食べられないときは申告すること', /発熱|黄疸|痛み|申告|知らせ/]] },
      { key: 'fibroid', re: /子宮筋腫|過多月経/, label: '子宮筋腫（過多月経）', source: [CPK_SRC78.gyn], ...CPK78_META,
        op: [['出血量、Hb／MCV、めまい、排尿症状', /出血量|出血|Hb|MCV|めまい|排尿/]],
        tp: [['立ち上がりをゆっくりにするなど貧血時の安全の援助', /ゆっくり|転倒|安全|休息/]],
        ep: [['出血が多いとき・ふらつきが強いときは知らせること', /出血|ふらつき|めまい|知らせ|受診/]] },
      { key: 'hypertension', re: /高血圧/, label: '高血圧症', source: [CPK_SRC78.htn], ...CPK78_META,
        op: [['血圧と測定条件、起立時の症状、服薬、体重・浮腫（単回の高値で診断としない）', /血圧|測定|起立|服薬|内服|体重|浮腫/]],
        tp: [['降圧薬による血圧低下（起立性低血圧）と転倒の予防', /起立|転倒|ゆっくり|ふらつき/]],
        ep: [['服薬を続けること、家庭血圧の測り方、ふらつきを知らせること', /服薬|内服|家庭血圧|ふらつき|知らせ/]] },
      { key: 'dyslipidemia', re: /脂質異常症|高脂血症|高コレステロール/, label: '脂質異常症', source: [CPK_SRC78.lipid], ...CPK78_META,
        op: [['食事・運動・服薬と、検査値の推移（一律の目標値は用いない）', /食事|運動|服薬|内服|検査値|推移/]],
        tp: [['食事・運動の継続を支える援助', /食事|運動|援助/]],
        ep: [['食事・運動・服薬の継続の意味を本人の生活に合わせて説明すること', /食事|運動|服薬|内服|継続/]] },
      { key: 'cataract', re: /白内障/, label: '白内障手術', source: [CPK_SRC78.eye], ...CPK78_META,
        op: [['視力の変化・眼痛・発赤・分泌物、転倒、点眼', /視力|眼痛|発赤|分泌物|転倒|点眼/]],
        tp: [['点眼の確認と転倒予防の援助', /点眼|転倒/]],
        ep: [['急な視力低下や強い眼痛があればすぐ連絡すること、点眼の方法', /視力|眼痛|連絡|知らせ|点眼/]] }
    ];
    // v.79 ingestion of docs/research-notes/2026-10-15-sitewide.md. No source gating: unnamed sources carry the provenance label below.
    // Every row has source, edition, checked, next. Wording stays conditional; rows are reference suggestions, never diagnoses.
    const CPK_PROV79 = '深層調査 2026-10-15（出典未確認）';
    const CPK79_META = { edition: '2026-10-15 深層調査メモ（docs/research-notes/2026-10-15-sitewide.md）', checked: '2026-10-15', next: '2027-10' };
    const CPK_JUDGE = ['悪化・改善とみなす基準（いつ・何をもって）を決めて記録すること', /基準|悪化|改善|目標値|いつ|経時|推移/];
    const cp79 = (key, re, label, source, op, tp, ep) => ({ key, re, label, source: source.length ? source : [CPK_PROV79], ...CPK79_META, op, tp, ep });
    const CPK_ROWS_79 = [
      // ---- Part A rows skipped in v.78
      cp79('liver-meta', /肝転移/, '肝転移', [],
        [['倦怠感・食欲／体重・右上腹部痛・黄疸・浮腫／腹水・意識変化', /倦怠|食欲|体重|右上腹部|黄疸|浮腫|腹水|意識/], ['AST/ALT/ALP/γ-GTP/ビリルビン/Alb/凝固', /AST|ALT|ALP|GTP|ビリルビン|Bil|Alb|凝固|検査値/]],
        [['疼痛・栄養・皮膚・腹水に対する症状緩和の援助（原発性肝癌の知識は流用しない）', /疼痛|栄養|皮膚|腹水|緩和|援助/]],
        [['黄疸・腹部膨満・意識の変化・出血しやすさを報告すること', /黄疸|腹部|膨満|意識|出血|報告|知らせ/]]),
      cp79('peritoneal', /腹膜播種/, '腹膜播種', [],
        [['腹囲・腹満・疼痛・悪心嘔吐・食事量・排便排ガス・尿量・体重・脱水', /腹囲|腹満|疼痛|悪心|嘔吐|食事量|摂取|排便|排ガス|尿量|体重|脱水/]],
        [['少量頻回などは指示に応じて行い、閉塞が疑われるときは経口摂取を促さず報告する（播種があれば必ず腹水・腸閉塞とは判断しない）', /少量|指示|経口|閉塞|報告/]],
        [['嘔吐の増加・排便排ガスの停止・腹満の急な増加を報告すること', /嘔吐|排便|排ガス|腹満|報告|知らせ/]]),
      cp79('old-mi', /陳旧性心筋梗塞|陳旧性MI/, '陳旧性心筋梗塞', ['日本循環器学会 安定冠動脈疾患GL'],
        [['胸部症状・呼吸困難・浮腫・体重・脈拍の不整・血圧・活動耐容能・処方薬（急性心筋梗塞とは決めつけず、新規の胸痛・呼吸困難は別に評価）', /胸部|胸痛|呼吸困難|浮腫|体重|脈|血圧|活動|処方|内服/]],
        [['心負荷に配慮した活動の支援と、二次予防薬の服薬確認', /活動|負荷|二次予防|服薬|内服/]],
        [['新規の胸痛・呼吸困難は自己判断せず早めに申告すること', /胸痛|呼吸困難|自己判断|申告|知らせ/]]),
      // ---- Part B: cross-cutting areas
      cp79('postop-complication', /無気肺|術後肺炎|術後合併症|深部静脈血栓|肺塞栓|肺血栓|DVT|イレウス|腸閉塞|術後せん妄/, '急性期術後合併症（無気肺・肺炎・SSI・イレウス・せん妄・DVT/PE）', ['日本循環器学会2025 PE/DVT GL'],
        [['呼吸数・SpO2・呼吸音・咳痰（麻酔・疼痛→浅呼吸→無気肺・肺炎）', /呼吸数|SpO2|呼吸音|痰|咳/], ['下肢の腫脹・痛み・左右差、突然の呼吸困難（不動→血栓）', /下肢|腫脹|左右差|呼吸困難|胸痛/], ['創部・排ガス・腹満・悪心（創→感染、麻酔→腸運動低下）、意識・見当識（せん妄）', /創|排ガス|腹満|悪心|意識|見当識/]],
        [['疼痛管理を行いながら深呼吸・咳嗽・早期離床・弾性ストッキング等を援助する', /深呼吸|咳|離床|弾性|疼痛/]],
        [['深呼吸・咳の方法と、下肢の腫れ・突然の息苦しさをすぐ知らせること', /深呼吸|咳|下肢|息苦|知らせ/]]),
      cp79('heart-failure', /心不全/, '心不全', ['日本循環器学会／日本心不全学会 2025改訂'],
        [['呼吸困難・体重・浮腫・体液量（水分出納）・活動耐容能・服薬・増悪の兆候', /呼吸困難|体重|浮腫|水分|出納|活動|服薬|内服|増悪/]],
        [['塩分・水分の管理、活動と休息の調整、服薬の確認', /塩分|水分|活動|休息|服薬|内服/]],
        [['毎日の体重測定、むくみ・息苦しさの悪化の兆候、服薬の継続をまとめて説明すること', /体重|むくみ|浮腫|息苦|服薬|内服|増悪/]]),
      cp79('copd', /COPD|慢性閉塞性肺疾患/, 'COPD', ['日本呼吸器学会 COPD GL第6版2022'],
        [['息切れの程度・活動との関係・SpO2・呼吸数・痰（息切れ→活動制限→廃用→耐容能低下の循環）', /息切れ|活動|SpO2|呼吸数|痰/]],
        [['口すぼめ呼吸・動作の工夫・段階的な活動とリハビリの援助', /口すぼめ|動作|段階|リハ|活動/]],
        [['息切れ時の対処と、増悪（痰の増加・発熱）を知らせること', /息切れ|対処|増悪|痰|発熱|知らせ/]]),
      cp79('ckd', /CKD|慢性腎臓病|腎機能低下|腎不全/, '慢性腎臓病', ['日本腎臓学会 CKD診療ガイド2024／GL2023'],
        [['eGFR・蛋白尿・血圧・電解質・貧血・体液状態（尿量・浮腫・体重）', /eGFR|蛋白尿|血圧|電解質|K|貧血|尿量|浮腫|体重/], ['薬物の排泄への影響（腎機能と薬剤の関係）', /薬|排泄|腎機能/]],
        [['指示された塩分・水分・たんぱくの管理の援助', /塩分|水分|たんぱく|食事/]],
        [['血圧・体重の自己管理と、腎臓に負担のある薬を自己判断で使わないこと', /血圧|体重|自己判断|薬/]]),
      cp79('stroke', /脳梗塞|脳出血|脳卒中|くも膜下/, '脳卒中', ['脳卒中治療GL2021（改訂2025）'],
        [['意識・運動麻痺・嚥下・構音・認知・排泄・転倒の危険', /意識|麻痺|嚥下|構音|認知|排泄|転倒/]],
        [['誤嚥・転倒の予防、早期からのリハビリと日常動作の援助', /誤嚥|転倒|リハ|離床|援助/]],
        [['再発予防（血圧・服薬・生活習慣）と、症状が出たらすぐ知らせること', /再発|血圧|服薬|内服|知らせ|受診/]]),
      cp79('parkinson', /パーキンソン/, 'パーキンソン病', ['日本神経学会 2018（鮮度要確認）'],
        [['運動症状（振戦・固縮・歩行）に加え、嚥下・便秘・起立性低血圧・睡眠などの非運動症状', /振戦|固縮|歩行|嚥下|便秘|起立性|睡眠/]],
        [['服薬時刻の確認、転倒・誤嚥の予防、排便の援助', /服薬|内服|時刻|転倒|誤嚥|排便/]],
        [['薬を決まった時間に続けること、立ちくらみ・むせを知らせること', /時間|続け|立ちくらみ|むせ|知らせ/]]),
      cp79('cancer-fatigue', /悪液質|(?:がん|癌).{0,8}倦怠|倦怠.{0,8}(?:がん|癌)|がん関連疲労/, 'がんに伴う倦怠感・悪液質', ['国立がん研究センター'],
        [['倦怠感の原因候補を横断して確認（疼痛・貧血・不眠・栄養状態・筋力低下・感染・脱水・電解質異常・悪液質・不安）', /疼痛|貧血|不眠|栄養|筋力|感染|脱水|電解質|悪液質|不安/]],
        [['休息と活動の配分、原因に応じた症状緩和と栄養の援助', /休息|活動|配分|栄養|緩和/]],
        [['エネルギーの温存の工夫と、つらさを我慢せず伝えること', /温存|工夫|我慢|伝え|知らせ/]]),
      cp79('opioid-set', /オピオイド|麻薬性鎮痛|モルヒネ|フェンタニル|トラマドール/, 'オピオイド使用時の副作用セット', ['日本緩和医療学会 がん疼痛の薬物療法GL2020'],
        [['疼痛だけでなく、便秘・悪心・鎮静（傾眠）・呼吸（数・SpO2）を必ず一緒に確認', /便秘|排便|悪心|嘔気|鎮静|傾眠|呼吸数|SpO2/]],
        [['便秘対策・制吐・転倒予防を鎮痛とセットで行う', /便秘|緩下|制吐|転倒/]],
        [['副作用（眠気・吐き気・便秘）を我慢せず伝えること、自己判断で増減しないこと', /副作用|眠気|吐き気|便秘|自己判断|伝え/]]),
      cp79('geriatric-drug', /高齢者.{0,10}(?:薬|転倒|多剤)|ポリファーマシー|多剤併用|ベンゾジアゼピン|睡眠薬|眠剤|せん妄/, '高齢者の薬剤・転倒・せん妄', ['日本老年医学会 高齢者の安全な薬物療法GL2025'],
        [['薬剤数・睡眠薬／鎮静薬・降圧薬・利尿薬と、ふらつき・起立時症状・認知・夜間の状態', /薬剤|睡眠薬|鎮静|降圧|利尿|ふらつき|起立|認知|夜間/]],
        [['転倒予防（環境・移動介助・夜間のトイレ）と、薬の見直しの相談', /転倒|環境|介助|トイレ|見直し|相談/]],
        [['薬の飲み方・ふらつきの知らせ方、ナースコールの使い方', /薬|ふらつき|知らせ|ナースコール/]]),
      cp79('pediatric-asthma', /小児喘息|小児気管支喘息/, '小児喘息', ['JPGL2023'],
        [['年齢別の正常値（呼吸数・脈拍）・喘鳴・咳・SpO2・発達段階・生活への影響', /呼吸数|脈拍|喘鳴|咳|SpO2|年齢|発達|生活/]],
        [['発作時の体位・吸入の援助と、発達段階に合わせた関わり', /体位|吸入|発達|関わり/]],
        [['家族への教育（発作の見分け方・吸入・環境整備・受診の目安）', /家族|発作|吸入|環境|受診/]]),
      cp79('psychiatric', /うつ病|統合失調症|不安障害|精神科|抑うつ|幻覚|妄想/, '精神状態の看護（症状から診断名を逆推定しない）', [],
        [['気分・思考・睡眠・安全（自傷他害の危険）・社会機能・コミュニケーション（診断名は医師が判断し、症状から逆推定しない）', /気分|思考|睡眠|安全|自傷|社会|コミュニケーション/]],
        [['安全な環境と信頼関係をつくる関わり、睡眠・休息の援助', /安全|信頼|関わり|傾聴|睡眠|休息/]],
        [['不安や困りごとを話してよいこと、服薬の意味と継続', /話し|相談|服薬|内服|不安/]]),
      cp79('drug-class', /降圧薬|利尿薬|抗凝固薬|ステロイド|睡眠薬|眠剤|抗血小板薬/, '薬の分類（薬剤→作用→有害事象→観察）', [],
        [['薬剤名を直接1つの項目に結ばず、「作用→起こりうる有害事象→観察項目」の順に確認（降圧薬：血圧低下・ふらつき、利尿薬：脱水・電解質、抗凝固薬：出血、ステロイド：感染・血糖、睡眠薬：転倒・せん妄）', /作用|有害事象|副作用|血圧|ふらつき|脱水|電解質|出血|感染|血糖|転倒|せん妄/]],
        [['与薬前後の観察と、有害事象が出たときの報告', /与薬|観察|報告/]],
        [['薬の目的と副作用、自己判断で中止しないこと', /目的|副作用|自己判断|中止/]]),
      // ---- common nursing problems: cause chain + OP/TP/EP + commonly missed points
      cp79('activity-intolerance', /活動耐性|耐容能低下/, '活動耐性低下', [],
        [['HR・BP・RR・SpO2・息切れ・疲労・活動量（安静時だけで判断しない。労作時と回復時間も見る）', /HR|脈|BP|血圧|RR|呼吸数|SpO2|息切れ|疲労|労作|活動量/], CPK_JUDGE],
        [['段階的な活動と休息の配分、リハビリとの連携', /段階|休息|リハ/]],
        [['負荷の調整と、症状が出たら中止して知らせること', /負荷|中止|知らせ/]]),
      cp79('infection-general', /感染リスク|術後感染|易感染/, '感染リスク（一般）', [],
        [['体温・局所の徴候・WBC・デバイスの刺入部（発熱だけを監視しない）', /体温|局所|発赤|WBC|刺入部|デバイス|カテーテル/], CPK_JUDGE],
        [['手指衛生と、創・デバイスの管理', /手指|手洗い|創|デバイス|管理/]],
        [['感染の徴候を自分で観察し、気づいたら知らせること', /徴候|観察|知らせ|気づ/]]),
      cp79('fall-risk', /転倒/, '転倒リスク', [],
        [['歩行・筋力・視力・起立時症状・薬剤（鎮静薬・降圧薬など。薬剤と起立性低血圧を見落とさない）', /歩行|筋力|視力|起立|薬剤|鎮静|降圧/], CPK_JUDGE],
        [['環境の整備と移動の介助', /環境|整備|介助|ベッド柵/]],
        [['ナースコールの使い方と補助具の使用', /ナースコール|補助具|杖|歩行器/]]),
      cp79('pressure-injury', /褥瘡/, '褥瘡リスク', [],
        [['皮膚・圧迫やずれ・湿潤・栄養・可動性（皮膚だけで栄養を見落とさない）', /皮膚|圧迫|ずれ|湿潤|栄養|可動/], CPK_JUDGE],
        [['体位の工夫と除圧、皮膚の管理', /体位|除圧|体圧|皮膚|スキンケア/]],
        [['体位変換の必要性と、皮膚の変化を知らせること', /体位変換|変化|知らせ/]]),
      cp79('nutrition-deficit', /栄養摂取|低栄養|栄養不足|栄養障害/, '栄養摂取不足', [],
        [['摂取量・体重・嚥下・悪心・口腔（Alb単独で判定しない）', /摂取|体重|嚥下|悪心|口腔/], CPK_JUDGE],
        [['食形態と症状の調整、栄養士など多職種との連携', /食形態|形態|症状|栄養士|多職種/]],
        [['少量頻回など食べ方の工夫', /少量|頻回|工夫/]]),
      cp79('urinary-disorder', /排尿障害|尿閉|尿失禁|残尿|排尿困難/, '排尿障害', [],
        [['尿量・回数・残尿感・膀胱症状（尿量だけで評価しない）', /尿量|回数|残尿|膀胱|症状/], CPK_JUDGE],
        [['排尿しやすい環境と、必要時の測定', /環境|測定|導尿|プライバシー/]],
        [['水分のとり方と排尿記録', /水分|記録|排尿日誌/]]),
      cp79('pain-general', /疼痛|急性痛|慢性痛/, '疼痛（一般）', ['日本緩和医療学会 がん疼痛の薬物療法GL2020'],
        [['強度（NRS）に加え、部位・性状・日常生活への影響', /NRS|強度|部位|性状|影響|ADL|睡眠/], ['投薬後の再評価（再評価が抜けやすい）', /再評価|投薬後|効果/]],
        [['薬物・非薬物の援助と再評価', /薬物|非薬物|体位|罨法|再評価/]],
        [['痛みを早く伝えること、薬の使い方', /早|伝え|申告|知らせ|使い方|レスキュー/]]),
      cp79('anxiety', /不安/, '不安', [],
        [['不安の内容・強さ・睡眠・理解度・支えとなる人（「不安あり」で終わらせない）', /内容|強さ|程度|睡眠|理解|支え|家族/], CPK_JUDGE],
        [['傾聴と情報の整理、意思決定の支援', /傾聴|情報|意思決定/]],
        [['質問や相談の仕方を伝えること', /質問|相談|聞|伝え/]]),
      // ---- perioperative timeline (events, not day counts)
      cp79('periop-timeline', /周術期|術前|麻酔覚醒|麻酔後|離床開始|初回離床|経口(?:摂取)?再開|食事再開|飲水開始|創経過|退院移行|退院準備/, '周術期の時期（出来事ごとの観察）', [],
        [['術前：基礎疾患・抗凝固／抗血小板薬・栄養・血糖・感染・呼吸機能・ADL', /基礎疾患|抗凝固|抗血小板|栄養|血糖|感染|呼吸機能|ADL/], ['麻酔直後〜早期：気道・呼吸・循環・意識・疼痛・出血・悪心嘔吐・尿量', /気道|呼吸|循環|意識|疼痛|出血|悪心|嘔吐|尿量/], ['離床開始期：疼痛・起立時の変化・呼吸状態・DVT・転倒・せん妄', /起立|呼吸|DVT|血栓|転倒|せん妄/], ['経口摂取再開期：嚥下・悪心・腸蠕動・排ガス排便・摂取量・血糖', /嚥下|悪心|蠕動|排ガス|排便|摂取|血糖/], ['創経過観察期：発赤・熱感・腫脹・排液・離開・発熱', /発赤|熱感|腫脹|排液|離開|発熱/], ['退院移行期：ADL・服薬・創管理・食事・再受診の徴候・自己管理能力', /ADL|服薬|内服|創管理|食事|受診|自己管理/]],
        [['時期は日数ではなく、離床・食事再開・創の経過などの出来事で区切って援助を選ぶ', /離床|食事|創|経過|出来事|時期/]],
        [['退院後の服薬・創の管理・食事・再受診の目安を、自己管理できる形で説明すること', /服薬|創|食事|受診|自己管理/]])
    ];
    CARE_PLAN_KNOWLEDGE.push(...CPK_ROWS_79);

    // v.100 (docs/research-notes/2026-10-16-insulin-diabetes.md): 中耳炎・インスリン皮下注射・セルフケア・診断名・在宅療法・嘔吐下痢症・インスリン・DKA・血糖自己測定。
    // 各行の scope は適用範囲（その外には使わない）。出典欄が「未確認」の行は由来を明示する。数値の基準はこの回答にないため足さない。
    const CPK_PROV100 = '深層調査 2026-10-16d（出典未確認）';
    const CPK100_META = { edition: '2026-10-16d 深層調査メモ（docs/research-notes/2026-10-16-insulin-diabetes.md）', checked: '2026-10-16', next: '2027-10' };
    const cp100 = (key, re, label, source, scope, op, tp, ep) => ({ key, re, label, source: [...source, CPK_PROV100], scope, ...CPK100_META, op, tp, ep });
    const CPK_ROWS_100 = [
      cp100('otitis-media-acute', /(?<!滲出性)(?<!慢性)中耳炎/, '急性中耳炎', ['看護roo!（急性中耳炎, 2018）'], '急性中耳炎のみ。滲出性・慢性中耳炎、外耳炎・内耳炎などの耳疾患には使わない',
        [['体温・耳痛の訴え・鼓膜所見（発赤・膨隆・耳漏）、聴力や言語理解の変化', /体温|耳痛|鼓膜|発赤|膨隆|耳漏|聴力|言語|聞こえ/]],
        [['鎮痛薬・抗菌薬・鼓膜切開排膿は医師の指示に応じて行い、安静と安眠の環境を整える', /鎮痛|抗菌|切開|指示|安静|安眠/]],
        [['服薬を続けること、耳の清潔（入浴時に水が入らないように）、高熱や耳漏が増えたときは受診すること', /服薬|内服|清潔|入浴|水|高熱|耳漏|受診/]]),
      cp100('insulin-injection-technique', /インスリン.{0,8}(?:皮下)?注射|自己注射|ペン型注射器|サイトローテーション|注射部位(?:の)?ローテーション/, 'インスリン皮下注射（手技）', ['日本糖尿病協会『インスリン自己注射ガイド』(2014)', '岸田裕治「インスリンの副作用と注意点」(2026)'], 'インスリンの皮下注射に限る。他の注射や経口療法には使わない',
        [['血糖値と低血糖の徴候（冷汗・手の震え・動悸）、注射部位の皮膚所見', /血糖|低血糖|冷汗|震え|動悸|注射部位|皮膚/]],
        [['器具の準備、目盛りと投与量の確認、針は使い捨てにして速やかに捨てる、注射部位を替える（サイトローテーション）', /器具|目盛り|投与量|針|廃棄|サイトローテーション|部位/]],
        [['注射の手技とサイトローテーションを患者・家族に伝えること、低血糖時はブドウ糖など糖分をとる対処', /手技|サイトローテーション|低血糖|ブドウ糖|糖分/]]),
      cp100('self-care-chronic', /セルフケア|(?:糖尿病|インスリン|血糖).{0,20}自己管理|自己管理.{0,20}(?:糖尿病|インスリン|血糖)/, 'セルフケア（自己管理が必要な慢性疾患）', ['中村伸枝編著『1型糖尿病のこどもと家族の生活 改訂3版』(2022)'], '1型糖尿病など自己管理が必要な慢性疾患。精神発達の障害などでセルフケアが難しい場合は個別に判断する',
        [['血糖測定や注射など自己管理の行動と理解度、心理的な抵抗や不安', /血糖測定|注射|自己管理|理解|抵抗|不安/]],
        [['できることに参加してもらい自立を促し、達成したことを認める', /参加|自立|褒|認め|意欲/]],
        [['注射・測定・食事の方法と大切さ、低血糖時の対処と緊急連絡先、親には見守りと支援のポイント', /注射|測定|食事|低血糖|連絡先|見守り|支援/]]),
      cp100('diagnosis-explained', /診断名.{0,10}(?:説明|告知|理解|伝え)|病名.{0,6}(?:説明|告知)/, '診断名の説明と理解', [], '特定の疾病に限らない。この行は出典が未確認で、因果の鎖はない。診断名そのものからは判定しない',
        [['患者・家族の診断名の理解度と、動揺や拒否感などの様子', /理解|動揺|拒否|不安|受け止め/]],
        [['診断の内容を分かりやすく説明し、不安には共感して支える', /説明|不安|共感|支え/]],
        [['診断名の意味・経過・治療の必要性を伝え、質問に答える', /意味|経過|治療|質問/]]),
      cp100('home-therapy', /在宅療法|在宅療養|退院後.{0,10}(?:自宅|在宅).{0,10}(?:インスリン|注射|血糖|療養|継続)/, '在宅療法（退院後の自宅での治療・管理）', [], '退院後に自宅で療養する患者。入院中の治療や通院だけの管理には使わない。この行は出典が未確認で、因果の鎖はない',
        [['自宅での生活（血糖の記録・服薬や注射の状況・家族の支援）', /生活|血糖|記録|服薬|注射|家族|支援/]],
        [['退院計画に沿って治療・検査を続け、訪問看護や外来の受診を調整する', /退院計画|治療|検査|訪問看護|外来/]],
        [['家庭でのインスリンの投与方法・低血糖時の対応・自己管理の計画、生活リズムの整え方', /インスリン|投与|低血糖|自己管理|生活リズム/]]),
      cp100('viral-gastroenteritis', /嘔吐下痢症|ウイルス性胃腸炎|急性胃腸炎|ロタウイルス|ノロウイルス/, '嘔吐下痢症（ウイルス性胃腸炎）', ['信愛記念病院小児科『「冬の嘔吐下痢症」の家庭看護』（年不明）'], '主にウイルス性胃腸炎。細菌性下痢症・食中毒など他の原因は別に扱う',
        [['嘔吐・下痢の量、摂取した水分量、尿量、脱水の徴候（皮膚乾燥・眼球陥凹・体重減少）、バイタルサイン', /嘔吐|下痢|水分|尿量|脱水|皮膚|眼球|体重|バイタル|体温/]],
        [['経口補水液などで水分と電解質を補う、解熱剤・制吐剤は医師の指示に応じて行う、手洗いなど感染予防', /補水|水分|電解質|解熱|制吐|指示|手洗い|感染/]],
        [['こまめな水分補給と食事を少しずつ戻す方法、手洗いなどの感染予防、ぐったりする・尿が減るときは早めに受診すること', /水分|食事|離乳食|手洗い|ぐったり|尿量|受診/]]),
      cp100('insulin-therapy', /インスリン/, 'インスリン療法', ['岸田裕治「インスリンの副作用と注意点」(2026)', '日本糖尿病学会『糖尿病治療ガイドライン2024』'], 'インスリン療法を行っているときのみ。経口血糖降下薬だけの2型糖尿病や、インスリンを使っていない人には使わない',
        [['血糖値と、低血糖・高血糖の徴候（冷や汗・震え・動悸）、注射部位の皮膚の状態（紅斑・硬結）', /血糖|低血糖|高血糖|冷や?汗|震え|動悸|注射部位|皮膚|紅斑|硬結/]],
        [['指示どおりの量を決められた時刻に投与する、緊急時に備えてブドウ糖などを用意する', /指示|投与|時刻|ブドウ糖|緊急/]],
        [['作用時間と低血糖の症状、低血糖時の応急対処、注射部位の替え方、血糖自己測定の大切さ', /作用|低血糖|応急|部位|血糖自己測定|血糖測定/]]),
      cp100('dka', /ケトアシドーシス|\bDKA\b|クスマウル|アセトン臭/, '糖尿病性ケトアシドーシス（DKA）', ['日本糖尿病学会『糖尿病診療ガイドライン2024』', '「ポンコツ看護師の勉強ログ」(2025)'], '1型糖尿病などインスリン欠乏による急性合併症。高血糖高浸透圧症候群（HHS）や乳酸アシドーシスは別の病態として扱う',
        [['血糖値・尿ケトン体・血液ガス・電解質（特にカリウム）の動き、呼吸の様式（クスマウル呼吸）、意識レベル', /血糖|ケトン|血液ガス|pH|電解質|カリウム|K|呼吸|クスマウル|意識/]],
        [['輸液・インスリンの持続静注・カリウムの補正は医師の指示に応じて行う', /輸液|インスリン|カリウム|補正|指示/]],
        [['インスリンの中断・不足が原因になること、発熱や感染のとき（シックデイ）の自己管理、脱水や傾眠が見られたら早く受診すること', /インスリン|中断|不足|シックデイ|脱水|傾眠|受診/]]),
      cp100('smbg', /血糖(?:自己)?測定|自己血糖測定|SMBG/, '血糖自己測定', [], '血糖の自己管理が必要な患者（インスリン療法中など）。追加提案であり、出典は示されていない',
        [['測定の実施状況・記録・手技', /測定|記録|手技/]],
        [['測定する時間と記録のしかたを一緒に確認する', /測定|時間|記録/]],
        [['測定の方法と記録のしかた、低血糖・高血糖を早く見つけるための目的', /測定|記録|低血糖|高血糖/]])
    ];
    CARE_PLAN_KNOWLEDGE.push(...CPK_ROWS_100);
    function cpKnowledgeRowsFor(text) {
      const t = String(text || '').normalize('NFKC');
      return CARE_PLAN_KNOWLEDGE.filter(r => r.re.test(t));
    }
    // Non-binding suggestions: points of a matching row that the plan's own OP/TP/EP do not yet contain.
    function cpKnowledgeSuggestions(plan) {
      const p = plan || {};
      const trigger = [p.problem, ...(Array.isArray(p.evidence) ? p.evidence : [p.evidence]), p.note].join('\n');
      const out = [];
      cpKnowledgeRowsFor(trigger).forEach(row => {
        [['op', 'OP'], ['tp', 'TP'], ['ep', 'EP']].forEach(([sec, short]) => {
          const have = (p[sec] || []).join('\n').normalize('NFKC');
          const miss = row[sec].filter(([, has]) => !has.test(have)).map(([text]) => text);
          if (miss.length) out.push({ row: row.key, label: row.label, section: short, points: miss, source: row.source,
            msg: `知識（参考）：「${row.label}」の計画では、${short}に「${miss.join('」「')}」を加えることを検討できます（出典：${row.source.join('／')}。一般的な案内であり、診断ではありません。計画は自動では変わりません）` });
        });
      });
      return out;
    }

    // v.78 high-risk combinations (reference only; they outrank single-word hints and never change a plan). Every pattern must match.
    const CP_HIGH_RISK_COMBOS = [
      { key: 'opioid-resp', all: [/オキシコドン|オピオイド|モルヒネ|フェンタニル|オキノーム|オキシコンチン/, /呼吸数.{0,6}(?:低下|減少)|傾眠|SpO2.{0,6}低下/], msg: 'オピオイドと呼吸数低下／傾眠の記載があります。呼吸抑制の可能性を考え、呼吸数・SpO2・意識を続けて観察し、基準に沿って報告できるようにしましょう（参考）。' },
      { key: 'insulin-poor-intake', all: [/インスリン/, /摂取(?:量)?(?:不良|低下|減少)|食事.{0,4}(?:摂れ|とれ|摂取).{0,4}(?:ない|少)|食欲(?:不振|低下)|低血糖|冷汗|振戦|動悸/], msg: 'インスリンと摂取不良／低血糖症状の記載があります。血糖・摂取量を確認し、投与の可否は指示を確認しましょう（参考）。' },
      { key: 'epidural-anticoag-neuro', all: [/硬膜外/, /抜去/, /抗凝固|抗血小板|ヘパリン|ワルファリン|ワーファリン|エドキサバン|リクシアナ|アピキサバン|エリキュース|リバーロキサバン|イグザレルト|アスピリン|バイアスピリン|クロピドグレル|プラビックス/, /しびれ|筋力低下|背部痛|麻痺|排尿障害/], msg: '硬膜外カテーテル抜去と抗血栓薬と神経症状の記載があります。硬膜外血腫の可能性があるため、速やかに報告して判断を仰ぎましょう（参考）。' },
      { key: 'wound-infection', all: [/手術創|創部|創/, /発赤/, /膿|排液.{0,4}(?:混濁|増)|発熱|熱感/], msg: '創部の発赤に、熱感・膿性排液・発熱のいずれかが加わっています。感染の評価を優先して、報告を検討しましょう（参考。発赤だけで感染とは決めません）。' },
      { key: 'immobile-leg-swelling', all: [/不動|臥床|離床(?:低下|困難)|安静/, /(?:片側|左|右).{0,4}下肢.{0,6}(?:腫脹|腫れ|はれ)|下肢.{0,6}(?:左右差|片側)/], msg: '不動と片側の下肢腫脹の記載があります。深部静脈血栓の可能性があるため、突然の息苦しさ・胸痛とあわせて報告を検討しましょう（参考）。' },
      { key: 'pancreatic-jaundice-fever', all: [/膵頭部(?:がん|癌)/, /黄疸/, /発熱/], msg: '膵頭部がんと黄疸と発熱の記載があります。胆道感染の可能性があるため、早めの報告を検討しましょう（参考）。' },
      { key: 'dvt-sudden-dyspnea', all: [/DVT|深部静脈血栓|血栓/, /突然の?呼吸困難|突然の?息苦しさ|急な息苦しさ/], msg: 'DVTのリスクに突然の呼吸困難の記載があります。肺塞栓の可能性を考え、すぐ報告しましょう（参考）。' },
      { key: 'postop-immobile-leg', all: [/手術|術後/, /不動|臥床|安静/, /下肢.{0,6}(?:腫脹|腫れ|はれ|疼痛|痛み)/], msg: '手術後・不動に下肢の腫れや痛みの記載があります。深部静脈血栓の可能性があるため、左右差を確認して報告を検討しましょう（参考）。' }
    ];
    // Negated clauses ("呼吸数低下なし") and history-only wording must not fire a warning; suspected/risk wording is marked, not dropped.
    function cpStripNegated(text) {
      return String(text || '').normalize('NFKC').replace(/[^。、,\n]{1,16}?(?:は|を|も|が)?(?:なし|ない|認めず|認めない|みられず|見られず|否定|なかった|ありません|(?:-|－))(?=[。、,\n\s]|$)/g, '');
    }
    function cpEvidenceKind(text) {
      const t = String(text || '').normalize('NFKC');
      if (/疑い|可能性|r\/o|否定できない/i.test(t)) return 'suspected';
      if (/リスク|危険|予防|おそれ|恐れ/.test(t)) return 'risk';
      return 'present';
    }
    function cpHighRiskCombos(text) {
      const t = cpStripNegated(text);
      const out = CP_HIGH_RISK_COMBOS.filter(c => c.all.every(re => re.test(t))).map(c => ({ key: c.key, level: 'info', certainty: cpEvidenceKind(t), msg: c.msg }));
      // 陳旧性 (old) myocardial infarction is history: only a NEW chest symptom raises a reference note, never an acute-MI warning.
      if (/陳旧性心筋梗塞|陳旧性MI/.test(t) && /新規.{0,4}(?:胸痛|胸部症状|呼吸困難)|(?:胸痛|胸部圧迫感).{0,4}(?:出現|あり|訴え|増悪)|突然の呼吸困難/.test(t)) out.push({ key: 'old-mi-new-symptom', level: 'info', certainty: cpEvidenceKind(t), msg: '陳旧性心筋梗塞の既往に、新しい胸の症状や呼吸困難の記載があります。急性の病態を含めて別に評価し、早めに報告しましょう（参考）。' });
      return out;
    }
    // Words that are not standard terms must not be silently replaced; they are reported for checking against the source text.
    const KR_UNKNOWN_TERMS = [{ re: /今検査/, reason: '標準用語として特定できません。「検査」へ置き換えず、原文を確認してください（知識リクエストの対象外としても理由を報告できます）。' }];
    function krUnknownTerms(text) {
      const t = String(text || '').normalize('NFKC');
      return KR_UNKNOWN_TERMS.filter(u => u.re.test(t)).map(u => ({ term: (t.match(u.re) || [''])[0], kind: 'unknown_term', reason: u.reason }));
    }
    const CP_REVIEW_ITEMS = [
      { key: 'fit', label: '看護問題との整合性' },
      { key: 'goal', label: '目標の具体性・評価可能性' },
      { key: 'op', label: 'OP（観察計画）の不足' },
      { key: 'tp', label: 'TP（援助計画）の具体性' },
      { key: 'ep', label: 'EP（教育計画）の適切さ' },
      { key: 'individual', label: '患者の個別性' },
      { key: 'evidence', label: '根拠データとの一致' },
      { key: 'knowledge', label: '知識からの提案（参考）' }
    ];

    // Infection risk under immunosuppression with no wound/line documented. Does not invent wound or line observations.
    function CP_INF_IMMUNO() {
      return { goalLong: '退院までに、感染の徴候（発熱・咽頭痛・咳・口腔内や皮膚の発赤など）を認めず、感染予防の行動を自分の言葉で説明できる',
        goalShort: '計画開始から3日以内に、感染の徴候が出ていないことが確認でき、手洗い・うがいなどの予防行動を実演できる',
        op: ['体温・発熱の有無と推移（発熱時は悪寒・発汗・随伴症状とあわせて、感染か疾患の活動性かを医師と評価する）', '咽頭痛・咳・口腔内の状態・皮膚の発赤など、感染の徴候', 'WBC・好中球・CRPの推移（原本で確認できた値のみ使い、単位や桁が不明な値は確認してから評価する）', 'ステロイド・免疫抑制薬の薬剤名・用量・開始日と、副作用の有無'],
        tp: ['手洗い・うがい・口腔ケア・清潔保持を支援し、環境を整える', '人混みや面会の制限が必要かを医師と相談し、本人・家族と調整する', '発熱や感染の徴候があれば、院内の報告基準に沿って医師へ報告する'],
        ep: ['手洗い・うがい・マスクの方法を説明し、実際にやってもらって確認する', '発熱・のどの痛み・咳などが出たら我慢せずすぐ伝えること、ステロイド・免疫抑制薬は自己判断で中止しないことを説明し、本人の言葉で言ってもらう'] };
    }
    // Nutrition model for patients with no documented surgery/fasting. No intake or weight targets are invented: they are set after confirming current values.
    function CP_NUTR_NONSURGICAL(c) {
      return { goalLong: '退院までに、現在の食事摂取量・体重を確認したうえで、本人に合った食事の整え方を看護師と一緒に決め、自分の言葉で説明できる',
        goalShort: '計画開始から3日以内に、食事摂取量・食欲・体重の現在値が確認でき、摂取量と体重の目標を医療者と決められる',
        op: ['食事・水分の摂取量（割・mL）・食欲と、摂取できない理由（症状・薬剤・口腔・疲労）', '体重の推移（同じ条件で測る）。入院前の体重・体重減少が本人の記録で確認できるか', 'Alb・TPなどの検査値（原本で確認できた値のみ使う）', '食習慣（外食の頻度・内容・食事の時間）と、治療薬（ステロイドなど）による食欲・血糖・体重の変化'],
        tp: ['食事摂取量を確認し、少ないときは医師・栄養士へ報告して食事内容・補助食品などを相談する', '食欲や疲労に合わせて、食べやすい形態・量・時間を調整する'],
        ep: ['退院後の食事（外食の選び方・食事の時間・治療薬との関係）を、本人の生活に合わせて一緒に整理し、自分の言葉で説明してもらう'] };
    }
    const CP_DOMAINS = [
      { key: 'inf', re: /感染/, words: /感染|発熱|体温|創部|刺入部|発赤|WBC|CRP/,
        op: [['体温・熱型', /体温|発熱|熱型|℃/], ['創部・刺入部の発赤・腫脹・熱感・痛み', /発赤|腫脹|熱感|創部|刺入部/], ['滲出液・ドレーン排液・尿の性状', /滲出|排液|ドレーン|尿の(?:性状|色|混濁)|性状/], ['WBC・CRPなどの検査値', /WBC|CRP|白血球|検査/]],
        goal: c => `退院まで、発熱が続かず、${c.urinary ? '尿の混濁がなく、' : ''}創部に発赤・腫脹・滲出液が見られない` },
      { key: 'vte', re: /血栓|塞栓|DVT/, words: /下肢|腫脹|ホーマンズ|ダイマー|弾性|フットポンプ|足関節/,
        op: [['下肢の腫脹・痛み・色・左右差', /下肢|腫脹|左右差|ふくらはぎ|下腿/], ['ホーマンズ徴候', /ホーマンズ/], ['Dダイマー', /ダイマー|D-?dimer/i], ['胸痛・呼吸困難・SpO2の急な低下（肺塞栓）', /胸痛|呼吸困難|SpO2|肺塞栓/]],
        goal: () => '離床するまで、下肢の腫脹・痛み・左右差がなく、胸痛・呼吸困難などの肺塞栓の徴候が見られない' },
      { key: 'bleed', re: /出血/, words: /出血|皮下出血|血便|INR|抗凝固/,
        op: [['皮下出血・歯肉出血・血尿・血便などの出血の徴候', /皮下出血|歯肉|血尿|血便|出血/], ['PT-INR などの検査値', /INR|凝固|検査/], ['血圧・脈拍', /血圧|脈拍|バイタル/]],
        goal: () => '入院中、出血の徴候がなく、出血に気づいたときにすぐ看護師に伝えられる' },
      { key: 'glu', re: /血糖/, words: /血糖|低血糖|インスリン/,
        op: [['血糖値（測る時間）', /血糖/], ['低血糖症状（冷汗・手のふるえ・意識の変化）', /低血糖|冷汗|ふるえ/], ['食事摂取量', /摂取量|食事/], ['インスリン・内服の量と時間', /インスリン|内服|血糖降下/]],
        goal: () => '入院中、血糖値が70〜200mg/dLの範囲を保ち、低血糖の症状が出たときに自分で看護師に伝えられる' },
      { key: 'swallow', re: /嚥下|誤嚥/, words: /嚥下|むせ|誤嚥|食形態|とろみ/,
        op: [['むせ・咳込み（いつ・何で）', /むせ|咳込/], ['食事の形態・姿勢・一口量', /形態|姿勢|一口|とろみ/], ['口の中の食べ残し', /口腔|残渣|食べ残し/], ['発熱・呼吸音・痰（誤嚥性肺炎の徴候）', /発熱|体温|呼吸音|痰/]],
        goal: () => '1週間後までに、むせ込みなく嚥下調整食を全量食べられ、発熱がない' },
      { key: 'resp', re: /気道|呼吸|ガス交換|換気|無気肺|肺炎|排痰/, words: /呼吸|SpO2|痰|喀痰|深呼吸|酸素/,
        op: [['SpO2', /SpO2|酸素飽和/], ['呼吸数・呼吸の深さ・リズム', /呼吸数|呼吸の(?:深さ|様式|リズム)|呼吸状態/], ['呼吸音（副雑音）', /呼吸音|副雑音|ラ音|聴診/], ['痰の量・性状・自分で出せるか', /痰|喀痰|分泌物/], ['息苦しさ（呼吸困難感）', /息苦し|呼吸困難|息切れ/]],
        goal: c => `3日後までに、自分で痰を出すことができ、SpO2 ${c.spo2 && c.spo2 < 95 ? 94 : 95}%以上を保てる（呼吸音の副雑音が減る）` },
      { key: 'pain', re: /疼痛|痛/, words: /痛|NRS|鎮痛/,
        op: [['痛みの強さ（NRSなど）', /NRS|VAS|フェイス|スケール|強さ|程度/], ['痛みの部位', /部位|場所/], ['痛みの性質（ズキズキ・鈍いなど）', /性質|性状|ズキズキ|鈍い|鋭い/], ['持続時間・出現する時間', /持続|時間|いつ|出現/], ['体動・咳・深呼吸との関連', /体動|動く|動作|離床|咳|深呼吸|体位/], ['鎮痛薬の使用と使用後の変化', /鎮痛|PCA|使用後|効果|頓用/], ['表情・睡眠・活動への影響', /表情|睡眠|眠|活動|ADL/]],
        goal: c => `2日後までに、安静時の${c.painSite || '痛み'}が${c.nrs != null ? `NRS${c.nrs}から` : ''}NRS${c.nrs != null ? Math.max(0, Math.min(3, c.nrs - 2)) : 3}以下となり、苦痛なく休息できる` },
      { key: 'fall', re: /転倒|転落/, words: /転倒|転落|ふらつ|ナースコール|履物|ベッド柵/,
        op: [['ふらつき・歩行の状態', /ふらつ|歩行|歩き方/], ['夜間の行動・トイレの回数', /夜間|トイレ|排尿/], ['転倒に関係する薬（睡眠薬・降圧薬・利尿薬）', /睡眠薬|降圧|利尿|薬/], ['認知・せん妄の有無', /認知|せん妄|見当識/], ['ベッド周りの環境・履物', /環境|ベッド|柵|履物|靴/]],
        goal: () => '入院中、転倒・転落が起こらず、トイレに行くときはナースコールで看護師を呼べる' },
      { key: 'delirium', re: /せん妄|混乱/, words: /せん妄|見当識|昼夜|夜間/,
        op: [['意識・見当識（日時・場所）', /意識|見当識/], ['夜間の言動・睡眠', /夜間|睡眠|眠/], ['点滴・ドレーンを抜こうとする行動', /自己抜去|抜こう|ルート|ドレーン/], ['痛み・脱水・低酸素などの誘因', /痛|脱水|酸素|SpO2/]],
        goal: () => '術後3日目まで、日時・場所がわかり、夜は眠ることができる' },
      { key: 'skin', re: /褥瘡|皮膚/, words: /褥瘡|発赤|体位変換|除圧|DESIGN/,
        op: [['皮膚の発赤の部位・大きさ（DESIGN-R）', /発赤|DESIGN|部位|大きさ/], ['圧迫・ずれ・湿潤', /圧迫|ずれ|湿潤|汗|失禁/], ['体位変換の状況', /体位変換|除圧/], ['栄養状態（Alb・摂取量）', /Alb|アルブミン|栄養|摂取/]],
        goal: c => `1週間後までに、${c.skin || '圧迫部位の発赤'}が消え、新しい発赤ができない` },
      { key: 'ileus', re: /消化管運動|イレウス|腸閉塞/, words: /腸蠕動|排ガス|腹部膨満|離床/,
        op: [['腸蠕動音', /蠕動/], ['排ガス・排便', /排ガス|排便/], ['腹部膨満・腹痛', /膨満|腹痛|お腹/], ['悪心・嘔吐', /悪心|嘔吐|吐き気/]],
        goal: () => '術後3日目までに排ガスがあり、腹部膨満・嘔吐が見られない' },
      { key: 'const', re: /便秘/, words: /排便|便|腹部|水分/,
        op: [['排便の回数・最後の排便', /排便|最終/], ['便の性状', /性状|硬さ|ブリストル/], ['腹部膨満・腸蠕動音・排ガス', /膨満|蠕動|排ガス/], ['食事・水分の量・活動量', /食事|水分|活動/]],
        goal: () => '3日後までに自然排便があり、お腹の張りの訴えがない' },
      { key: 'urine', re: /排尿|尿閉/, words: /尿|排尿|導尿/,
        op: [['尿量・排尿の回数', /尿量|排尿|回数/], ['残尿感・下腹部の張り', /残尿|下腹部|膀胱/], ['尿の性状', /性状|混濁|色/]],
        goal: () => '2日後までに、自分で排尿でき、残尿感・下腹部の張りの訴えがない' },
      { key: 'nausea', re: /悪心|嘔気|吐き気/, words: /悪心|嘔吐|吐き気|制吐/,
        op: [['悪心・嘔吐の有無・回数・出る時間', /悪心|嘔吐|吐き気|回数/], ['食事・水分がとれているか', /食事|水分|摂取/], ['原因になる薬', /薬|オピオイド|麻薬/]],
        goal: () => '2日後までに、吐き気の訴えがなく、食事を5割以上食べられる' },
      { key: 'fluidEx', re: /体液量過剰/, words: /体重|浮腫|水分|IN|OUT|出納/,
        op: [['体重（毎日同じ条件で）', /体重/], ['浮腫の部位・程度', /浮腫|むくみ/], ['水分出納（IN/OUT）・尿量', /出納|IN|OUT|尿量/], ['息苦しさ・SpO2・呼吸音', /息苦し|SpO2|呼吸音|呼吸困難/]],
        goal: () => '3日後までに、体重が入院時より1kg以上減り、下腿の浮腫が軽くなる（息苦しさの訴えがない）' },
      { key: 'fluidLow', re: /体液量不足|脱水/, words: /尿量|出納|口渇|水分|皮膚の乾燥/,
        op: [['水分出納（IN/OUT）・尿量・尿の色', /出納|IN|OUT|尿量|尿の色/], ['口の中・皮膚の乾燥・口渇', /乾燥|口渇|ツルゴール/], ['血圧・脈拍・ふらつき', /血圧|脈拍|ふらつ/], ['BUN・Cr・Na・Kなどの検査値', /BUN|Cr|Na|K\b|電解質|検査/]],
        goal: () => '2日後までに、1日の尿量が1000mL以上となり、口渇の訴えがない' },
      { key: 'nutr', re: /栄養/, words: /摂取|食事|体重|Alb|栄養/,
        op: [['食事摂取量（何割）', /摂取量|割|食事/], ['体重の変化', /体重/], ['Alb・TPなどの検査値', /Alb|アルブミン|TP|検査/], ['食べられない理由（悪心・痛み・嚥下・食欲）', /悪心|食欲|嚥下|理由/]],
        goal: () => '1週間後までに、食事を毎食7割以上食べられ、体重が今より減らない' },
      { key: 'mobility', re: /可動性|移動/, words: /麻痺|MMT|移乗|寝返り|関節/,
        op: [['麻痺・筋力（MMT）', /麻痺|MMT|筋力/], ['寝返り・起き上がり・移乗の介助量', /寝返り|起き上が|移乗|介助/], ['関節の動く範囲・痛み', /関節|可動域|ROM|痛/], ['皮膚の圧迫（同じ姿勢が続くか）', /圧迫|体位|発赤/]],
        goal: () => '2週間後までに、介助を受けながら車椅子へ移乗できる' },
      { key: 'act', re: /活動|セルフケア|ADL|廃用/, words: /活動|歩行|ADL|清潔|更衣|息切れ|疲労/,
        op: [['活動の前後のバイタル（脈拍・SpO2・血圧）', /前後|脈拍|SpO2|血圧|バイタル/], ['息切れ・疲れ', /息切れ|疲|倦怠/], ['歩行・移動の状態', /歩行|移動|離床/], ['ADL（清潔・更衣・排泄）のできる所・介助が要る所', /ADL|清潔|更衣|排泄|入浴|自立/]],
        goal: () => '1週間後までに、休憩を入れながら病棟のトイレまで歩いて行け、歩行後もSpO2 90%以上を保てる' },
      { key: 'sleep', re: /睡眠|眠/, words: /睡眠|眠|覚醒/,
        op: [['睡眠時間・途中で目が覚めた回数', /睡眠時間|中途覚醒|覚醒|回数|眠/], ['眠れない理由（痛み・トイレ・不安・環境）', /理由|痛|トイレ|不安|環境|音/], ['日中の様子（眠気・活動）', /日中|眠気|昼/]],
        goal: () => '3日後までに、夜に5時間以上続けて眠れたと言える' },
      { key: 'comm', re: /コミュニケーション|言語/, words: /文字盤|筆談|ジェスチャー|理解|表出/,
        op: [['言葉の理解・表出の程度', /理解|表出|言葉/], ['使える伝え方（文字盤・筆談・ジェスチャー）', /文字盤|筆談|ジェスチャー|手段/], ['伝わらないときの表情・いらだち', /表情|いらだ|イライラ/]],
        goal: () => '3日後までに、文字盤などを使って、自分の要望を看護師に伝えられる' },
      { key: 'mgmt', re: /自主管理|健康管理|自己管理/, words: /塩分|内服|服薬|体重測定|理解/,
        op: [['病気・治療の理解（自分の言葉で説明できるか）', /理解|説明でき/], ['入院前の生活（食事・塩分・内服の習慣）', /生活|食事|塩分|内服|服薬|習慣/], ['家族の支援・協力', /家族|支援/]],
        goal: () => '退院までに、1日の塩分の目安と毎日の体重測定の理由を自分の言葉で説明できる' },
      { key: 'know', re: /知識/, words: /理解|説明|パンフレット/,
        op: [['今わかっていること・わからないこと（質問の内容）', /理解|質問|わから/], ['説明を聞く準備（体調・意欲）', /意欲|体調|準備/], ['家族の理解', /家族/]],
        goal: () => '退院までに、退院後の内服・生活の注意点を自分の言葉で説明できる' },
      { key: 'body', re: /ボディイメージ|障害受容/, words: /ストーマ|受け止め|言動|表情|気持ち/,
        op: [['体の変化についての言動・表情', /言動|表情|発言|気持ち/], ['患部・ストーマを見る・触るか', /見る|触|ストーマ|患部/], ['セルフケアへの参加', /セルフケア|参加|交換|自分で/], ['家族の反応・支援', /家族/]],
        goal: c => c.stoma ? '2週間後までに、ストーマを自分で見ることができ、パウチ交換の手順を1つ以上自分で行える' : '2週間後までに、体の変化について自分の気持ちを看護師に話すことができる' },
      { key: 'anx', re: /不安|恐怖/, words: /不安|表情|言動|睡眠|説明/,
        op: [['表情・言動（不安の言葉）', /表情|言動|発言|言葉/], ['不安の内容（何が心配か）', /内容|何が|心配/], ['睡眠・食欲', /睡眠|眠|食欲/], ['家族の支援', /家族/]],
        goal: () => '3日後までに、心配なことを自分の言葉で看護師に話せ、夜は眠れたと言える' }
    ];

    CP_DOMAINS.unshift({ key: 'fatigue', re: /^(?!.*(?:活動耐性|息切れ|セルフケア|廃用))[^]*?(?:疲労|倦怠)/, words: /疲労|倦怠|活動|休息|睡眠|ADL|更衣|清潔/,
      op: [['疲労の強さ・時間帯・活動との関係・休息後の変化', /疲労|倦怠|休息|回復/], ['日常生活（更衣・清潔・移動・食事）の負担', /ADL|日常生活|更衣|清潔|移動/], ['睡眠・日中の休息', /睡眠|眠|休息/], ['疲労に伴う症状（発熱・関節痛）', /発熱|関節|痛み|症状/]],
      goal: () => '計画開始から3日以内に、疲労が強くなる活動を把握し、休息を取り入れた過ごし方を看護師と一緒に決められる' });
    // 教科書の看護計画（診断ごとのOP/TP/EP・看護目標の指標）から一般化した領域。固有の患者・語句には依存しない
    CP_DOMAINS.unshift(
      { key: 'perfusion', re: /脳組織灌流|脳血流|末梢組織灌流|組織灌流|心拍出量/, words: /血圧|意識|麻痺|NIHSS|MMT|抗凝固|服薬|頭痛|瞳孔|構音/,
        op: [['意識レベル（JCS/GCS）・瞳孔・神経症状（NIHSS・麻痺・構音障害・視野）の変化', /意識|JCS|GCS|瞳孔|NIHSS|麻痺|構音|視野|神経/], ['血圧・脈拍（不整脈の有無）・体温', /血圧|脈拍|不整脈|心電図|バイタル/], ['頭痛・嘔気・めまいなど頭蓋内圧亢進や再発を疑う症状', /頭痛|嘔気|嘔吐|めまい|頭蓋内/], ['抗凝固薬・降圧薬の服薬状況（飲み忘れ・自己中断）と出血の徴候', /服薬|内服|抗凝固|飲み忘れ|出血/], ['PT-INR・Dダイマー・脱水などの検査値', /INR|ダイマー|検査|脱水|Hb|Ht/]],
        goal: () => '入院中、新たな神経症状（意識の低下・麻痺の進行・言葉の出にくさ）が出現せず、血圧が医師の指示範囲内に保たれる' },
      { key: 'drugAE', re: /副作用|有害事象|薬物療法|化学療法|分子標的|抗がん剤/, words: /副作用|皮疹|下痢|間質性|呼吸困難|肝機能|内服|皮膚/,
        op: [['薬の副作用症状の出現時期・程度（皮疹・下痢・口内炎・倦怠感・咳や息切れなど）', /皮疹|下痢|口内炎|倦怠|咳|息切れ|副作用/], ['検査値（肝機能・腎機能・白血球・好中球など）', /肝機能|腎機能|AST|ALT|Cr|WBC|好中球|検査/], ['SpO2・呼吸状態（間質性肺炎など重い副作用の早期発見）', /SpO2|呼吸/], ['服薬状況（飲み忘れ・自己中断）と本人の副作用の受け止め', /服薬|内服|飲み忘れ|受け止め/], ['日常生活への影響（食事・睡眠・仕事）', /食事|睡眠|生活|仕事/]],
        goal: () => '退院までに、薬の主な副作用と受診が必要な症状を自分の言葉で説明でき、副作用が重症化せず内服を継続できる' },
      { key: 'renal', re: /腎機能|腎不全|腎臓|高カリウム|電解質|透析/, words: /Cr|eGFR|尿量|K|カリウム|リン|体重|浮腫|透析|食事|塩分/,
        op: [['尿量・体重・浮腫（水分出納）と血圧', /尿量|体重|浮腫|出納|血圧/], ['検査値（Cr・BUN・eGFR・K・P・Hb）の推移', /Cr|BUN|eGFR|K|カリウム|リン|Hb|検査/], ['高カリウムの徴候（脈の乱れ・しびれ・脱力）と心電図', /カリウム|脈|不整脈|心電図|しびれ|脱力/], ['食事内容（塩分・たんぱく質・カリウム・リン・水分）の摂取状況', /塩分|たんぱく|カリウム|リン|水分|食事/], ['（透析・腹膜透析の場合）排液の性状・出口部・シャントの状態', /排液|出口部|シャント|透析/]],
        goal: () => '退院までに、1日の塩分・水分・カリウムの目安を自分の言葉で説明でき、体重増加が指示範囲内に保たれる' },
      { key: 'selfesteem', re: /自尊感情|自己概念|役割遂行|無力/, words: /気持ち|言動|表情|役割|家族|仕事|できる/,
        op: [['自分についての発言（できない・迷惑をかけている等）と表情・意欲', /発言|言動|表情|意欲|気持ち/], ['できていること・できるようになったこと（小さな変化）', /できて|できる|変化/], ['家族・周囲の関わり方と本人の役割', /家族|役割|周囲/], ['リハビリ・セルフケアへの参加', /リハビリ|セルフケア|参加/]],
        goal: () => '退院までに、できるようになったことを1つ以上自分の言葉で話せ、今後の生活について前向きな発言が聞かれる' }
    );
    CP_DOMAINS.unshift(
      { key: 'pd', re: /腹膜透析|PD|在宅透析|透析.{0,6}(?:自己管理|セルフケア|手技)|バッグ交換/, words: /バッグ交換|出口部|排液|無菌|手洗い|手指衛生|混濁|腹膜炎|連絡/,
        op: [['手指の巧緻性・視力・理解力・学び方（手技を安全に行えるか）', /巧緻|視力|理解|学び|学習|認知/], ['出口部の発赤・腫脹・疼痛・浸出液（膿の有無）', /出口部|発赤|腫脹|疼痛|浸出|膿/], ['排液の量・色・透明度（混濁）・腹痛・注排液時の痛み', /排液|混濁|透明|腹痛|注排液/], ['体重・血圧・浮腫・尿量・正味除水量の記録', /体重|血圧|浮腫|尿量|除水|記録/], ['自宅の交換場所・勤務時間・家族の支援（実施できる環境か）', /自宅|交換場所|勤務|家族|支援|環境/], ['排便状況（便秘はカテーテルの機能に影響する）', /排便|便秘/]],
        goal: () => '退院までに、手洗いから接続・排液観察・記録までを決められた手順どおりに1人で実施でき、排液の混濁・腹痛・接続部の汚染があったときはPD施設へ連絡すると説明できる' }
    );
    { const sd = CP_DOMAINS.splice(CP_DOMAINS.findIndex(d => d.key === 'sleep'), 1)[0]; CP_DOMAINS.splice(CP_DOMAINS.findIndex(d => d.key === 'delirium'), 0, sd); }

    CP_DOMAINS.splice(CP_DOMAINS.findIndex(d => d.key === 'skin'), 0, { key: 'dmfoot', re: /足潰瘍|足病変|糖尿病性足|足壊疽/, words: /足|潰瘍|滲出|免荷|発赤|靴/,
      op: [['潰瘍の大きさ・深さ・滲出液・発赤・熱感・臭い', /大きさ|深さ|滲出|発赤|熱感|臭/], ['足趾・足底の感覚（モノフィラメント）と足背動脈の触知', /感覚|モノフィラメント|足背|触知/], ['足の皮膚（乾燥・亀裂・胼胝・水疱）と靴・靴下', /乾燥|亀裂|胼胝|水疱|靴/], ['血糖値・WBC・CRP', /血糖|WBC|CRP/], ['免荷（荷重制限）が守れているか', /免荷|荷重/]],
      goal: () => '1週間後までに、潰瘍が直径1.5cm以下となり、滲出液・発赤が見られない' });
    CP_DOMAINS.splice(CP_DOMAINS.findIndex(d => d.key === 'know'), 0, { key: 'fam', re: /家族/, words: /家族|妻|夫|食事|指導|説明/,
      op: [['家族の言葉・不安・負担', /言葉|不安|負担/], ['家族が理解していること・できていること', /理解|できて/], ['面会時の様子・協力の状況', /面会|協力/]],
      goal: () => '退院までに、家族が患者の食事・服薬・症状が出たときの対応を、自分の言葉で説明できる' });

    function cpAnalgesiaTp(c, act) {
      if (c && c.pca) return `すでに${c.epidural ? '硬膜外' : ''}PCAなどで鎮痛が行われているため、追加の鎮痛薬は医師・麻酔科の指示を確認してから使う。${act}の前に、痛みが抑えられているか、PCAを患者が必要なときに自分で使えているかを確認する`;
      return `鎮痛薬は、薬の種類・投与経路（内服・坐薬・注射など）ごとに効果が出る時間が違うため、医師の指示と薬剤情報で確認し、効果が出る時間に合わせて${act}ができるよう調整し、効果を再評価する`;
    }
    function cpAnalgesiaSafetyOp(c) {
      return c && c.opioid ? `鎮痛薬（オピオイド${c.epidural ? '・硬膜外' : ''}）の安全面：呼吸数・SpO2、眠気・鎮静の程度、血圧低下、悪心・かゆみ${c.epidural ? '、下肢のしびれ・脱力' : ''}を観察する` : '';
    }
    const CP_MODELS = {
      pain: c => ({ goalLong: `退院までに、${c.painSite || '痛み'}がNRS3以下で、痛みを我慢せずに自分から看護師へ伝えながら、トイレまで歩ける`,

        goalShort: c.nrs != null && c.nrs <= 3 ? '2日後までに、体動時の疼痛が患者と相談した許容範囲に収まり、必要な深呼吸や体位変換を実施できる'
          : `2日後までに、安静時の${c.painSite || '痛み'}が${c.nrs != null ? `NRS${c.nrs}から` : ''}NRS3以下となり、苦痛なく休息できる`,
        opExtra: [cpAnalgesiaSafetyOp(c)].filter(Boolean),
        tp: [cpAnalgesiaTp(c, '体動・清拭・歩行'), '創部を圧迫しないよう、枕を使って膝を軽く曲げた体位に整える', '起き上がるときは創部を手で支えられるよう、ゆっくり一緒に動く'],
        ep: ['痛みは我慢せず、0〜10の数字（NRS）で伝えてよいことを説明し、今の痛みを数字で答えてもらって確認する', '創部を手で支えて起き上がる方法を実演し、1回やってもらう'] }),
      inf: c => {
        if (c && c.immunoOnly) return CP_INF_IMMUNO();
        const line = /ドレーン|カテーテル|バルーン|膀胱留置/.test((c && c.text) || '');
        return { goalLong: '退院まで、発熱が続かず、傷に感染の徴候（発赤・腫脹・熱感・滲出液・においの増加）が出ない',
        goalShort: '3日後までに、傷のまわりの発赤・腫脹・熱感・滲出液が、初回の記録（初回所見）より増えず、発熱が続かない',
        tp: [`処置の前後に手指消毒を行い、傷${line ? '・刺入部' : ''}は清潔な操作で処置する`, '医師の指示（洗浄の方法・使う軟膏や被覆材・回数）を確認し、指示どおりに処置する', '体温の上昇や、初回所見より傷の悪化があれば、院内の報告基準・医師の指示に従って報告する'],
        ep: ['傷を触らない、食事前・トイレ後に手を洗うことを説明し、自分で手洗いをしてもらって確認する'],
        opExtra: ['WBC・CRPの推移（術後の炎症反応との区別のため、体温・創部所見・排液と合わせて評価する）'],
        opFirst: '初回所見（傷の大きさ・発赤・腫脹・熱感・滲出液・におい）を記録して、経過を比べる基準にする' }; },
      glu: () => ({ goalLong: '退院までに、低血糖の症状と安全な対処を自分の言葉で説明・実演でき、症状が出たときは自分から知らせられる',
        goalShort: '3日後までに、①低血糖の症状に気づいたらナースコールで知らせられる ②ブドウ糖の摂り方を看護師の前で実演できる ③注射の前に食事がとれるかを確認する理由を自分の言葉で言える',
        tp: ['インスリンは、製剤の種類（持効型・超速効型など）・投与時刻・直前の血糖値・食事の摂取状況を確認し、医師の指示・院内の手順に沿って実施する（食事がとれないとき・血糖が低いときの確認条件は、指示を確認してから書く）',
          '低血糖の症状があれば、すぐ血糖を測る。意識がはっきりして安全に飲み込めるときだけ、指示のブドウ糖を摂ってもらい、15分後に再測定する。まだ低いときは、手順に沿ってもう一度対応し、医師へ報告して、症状（冷や汗・手の震え・意識）を再評価する',
          '意識がはっきりしない・飲み込めないときは、口からは与えず、すぐ人を呼んで緊急対応にし、医師へ報告する'],
        ep: ['低血糖の症状（冷や汗・手の震え・動悸・ふらつき）と、意識がはっきりして飲み込めるときだけブドウ糖を摂ること、症状が強い・飲み込めないときは自分で対処せず周りの人に人を呼んでもらうこと（院内は緊急対応、自宅は119番）を説明し、ブドウ糖の摂り方を実演してもらって確認する',
          '15分後も低いとき・症状が続くときは、もう一度摂って連絡することを説明し、自分の言葉で言ってもらう', 'ブドウ糖は常に手元に置くよう伝え、置き場所を一緒に決める'] }),
      dmfoot: () => ({ goalLong: '退院までに、足の潰瘍が悪くならずに経過し、毎日自分で足の裏を観察して、傷・赤みに気づいたらすぐ受診できる',
        goalShort: '①1週間後までに、潰瘍が初回の記録より広がらず・深くならず、周りの皮膚の発赤・腫脹・熱感・滲出液が悪化しない ②3日後までに、鏡を使った足の裏の観察を実演でき、傷・赤みを見つけたら看護師に知らせると言える',
        tp: ['医師の指示（洗浄の方法・軟膏の種類・回数・免荷の方法）を確認し、指示どおりに処置して、清潔な操作で潰瘍を保護する', '免荷が指示されているときは、歩くときの靴・補助具を一緒に確認し、病室外の移動は付き添う', '足を毎日洗い、指の間までよく拭いて乾かす方法を一緒に行う'],
        ep: ['痛くなくても毎日、足の裏・指の間を鏡で見ること（傷・赤み・水疱・靴ずれ）を説明し、実際に鏡で見てもらって確認する', '足に合った靴を選ぶこと、素足・湯たんぽなど熱いものを避けることを説明し、理由を自分の言葉で言ってもらう'],
        opFirst: '初回所見（潰瘍の大きさ・深さ・周りの皮膚・滲出液）を記録して、経過を比べる基準にする' }),
      mgmt: c => /インスリン|糖尿病/.test(c.text || '') ? ({ goalLong: '退院までに、食事・インスリン・受診を続ける具体的な計画（外食時の選び方・注射の時間・受診日）を自分で立てて説明できる',
        goalShort: '5日後までに、インスリンの単位を、手順表を見ながら3回続けて正しく設定でき、外食・コンビニでの食品の選び方の例を2つ言える',
        op: ['通院を中断した理由・内服が不規則だった理由（費用・仕事・病気の理解・負担）を本人から聞いて確認する', 'インスリンの単位設定を間違えた原因（視力・手指の操作・理解）を確認し、正しく設定できるかを複数回観察する', '血糖測定の実施と記録の状況を観察する', '食事の内容・時間・間食・飲酒の状況を観察する', '病気・治療の理解（自分の言葉で説明できるか）と、妻の関わり・協力の状況を観察する'],
        tp: ['インスリン注射の手技を、手順表を使って毎日一緒に行い、できた点とできなかった点をその場で伝える', '栄養士の指導の日時を確認して同席し、指導の内容（外食・菓子パン中心、夕食が21時以降の生活に合わせた、昼食の選び方・夕食の時間と量・間食）を、患者さんの1日の流れに当てはめて一緒に整理する', '仕事に戻った後の1日の流れ（昼食・注射・測定）を一緒に書き出し、続けられそうな方法を選んでもらう'],
        ep: ['インスリンの打ち方（単位・部位をかえること・保管）を実演してもらい、間違いを一緒に確認する', '外食・コンビニでの食品の選び方と、夕食が遅くなるときの工夫を、栄養士の指導内容に合わせて補足し、翌日、自分の言葉で言ってもらう', ...(/喫煙|タバコ/.test(c.text || '') ? ['喫煙・飲酒の習慣が血糖・血管・足の血流に関係することを説明し、本人が続けられそうな目標を1つ決める'] : ['飲酒が血糖に関係することを説明し、本人が続けられそうな目標を1つ決める'])] })
        : ({ goalLong: '退院までに、1日の塩分の目安・毎日の体重測定の理由・内服を続ける方法を自分の言葉で説明できる',
        goalShort: '5日後までに、毎朝の体重測定を1人で行って記録でき、塩分の多い食品を3つ挙げられる',
        tp: ['体重測定の手順（排尿後・同じ時間・同じ服装）を一緒に行い、記録表に書く', '内服の管理方法（お薬カレンダー・1回分ずつの分包）を一緒に選ぶ', '食事の場面で、塩分の少ない選び方を一緒に確認する'],
        ep: ['体重が増えたとき・息苦しいときは受診することを説明し、自分の言葉で言ってもらう', '漬物・汁物などの塩分の多い食品を示し、減らし方を本人と一緒に決める'] }),
      fam: () => ({ goalLong: '退院までに、家族が患者の食事・服薬・症状が出たときの対応を、自分の言葉で説明できる',
        goalShort: '5日後までに、家族が低血糖の症状と安全な対応（意識の確認・飲み込めるときだけブドウ糖・飲み込めなければ119番）を自分の言葉で説明できる',
        tp: ['面会時に10分ほど時間をとり、困っていることを聞く', '栄養士の指導の日時を家族に伝え、同席できるよう調整する'],
        ep: ['低血糖の症状と、意識がはっきりして飲み込めるときだけブドウ糖を飲ませること、意識がおかしい・飲み込めないときは口に入れず119番に連絡すること、15分後も低いときはもう一度対応して連絡することを説明し、同じ内容を自分の言葉で言ってもらう', '献立は栄養士の指導で説明されるので、看護師は「飲酒の相談の仕方（責めずに本人の目標を一緒に決める）」と「仕事復帰後の昼食・注射の工夫」を一緒に考える'] }),
      anx: c => ({ goalLong: '退院までに、不安を感じたときに自分から看護師に話し、対処の方法を使える',
        goalShort: `計画開始から3日以内に、${/低血糖/.test(c.text || '') ? '低血糖への心配' : '心配なこと'}を自分の言葉で看護師に話せ、${/低血糖/.test(c.text || '') ? '心配への対処（ブドウ糖を手元に置く・症状が出たら知らせる）を言える' : '心配への対処を1つ言える'}`,
        tp: ['疲労の程度や本人の希望に合わせて、安心して話せる機会を確保し、不安を否定せずに聴く（時間を守ることより、安心して話せることを優先する）', ...(/低血糖/.test(c.text || '') ? ['低血糖が起きたときの対処の手順を一緒に紙に書き、枕元に置く'] : ['心配なことを一緒に紙に書き出し、答えられるものから説明する'])],
        ep: ['不安なときは我慢せず、いつでも看護師を呼んでよいことを説明し、呼び方を言ってもらって確認する', '不安の内容（病気・再燃・治療・仕事・退院後の生活など）のうち、本人が知りたいことを確認し、説明が必要なことは医師・多職種と共有して、療養や退院後の生活を一緒に整理する'],
        op: ['不安の内容（何が心配か）・強さ・強くなる場面と、睡眠・食欲・療養への影響を、まず確認する', '表情・言動（不安の言葉）を観察する', '病気・再燃・治療・仕事について、理解していることと分からないことを確認する', 'これまでの対処方法と、家族など相談できる人の有無・支援を確認する'] }),
      resp: c => ({ goalLong: '退院までに、自分で痰を出せ、SpO2 95%以上を保って病棟内を歩ける',
        goalShort: '3日後までに、深呼吸と咳で痰を自分で出すことができ、SpO2 95%以上を保てる',
        op: ['SpO2・呼吸数・呼吸の深さ（低下・増加は無気肺や肺炎の早期のサイン）', '呼吸音（副雑音・左右差・減弱）', '痰の量・性状と、自分で喀出できているか', '咳嗽の強さ（創部痛で咳を我慢していないか）と、体温・熱型', '疼痛の程度（NRS）と、深呼吸・咳嗽・体位変換への影響'],
        opExtra: [cpAnalgesiaSafetyOp(c)].filter(Boolean),
        tp: [cpAnalgesiaTp(c, '深呼吸・咳嗽・離床'), '咳嗽のときは枕・バスタオルで創部を保護し、深呼吸3回のあとに咳をしてもらう（創部痛・循環動態が許す範囲で）', '許可された安静度の範囲で、体位調整・離床（ベッド上座位→端座位→立位）を進め、実施の前後でSpO2・呼吸状態を確認する', '呼吸訓練器具を使うときは、医師の指示と使用方法に従い回数・頻度を決めて一緒に行う。SpO2低下・呼吸困難が出たら中止し、医師へ報告する'],
        ep: ['呼吸訓練の目的（無気肺・肺炎の予防）と正しい方法（深呼吸→咳嗽）を説明し、患者自身に実施してもらい、手技と理解を確認する（「分かりました」の返事だけで習得したとはみなさない）', '痛みを我慢せず、痛くて深呼吸・咳ができないときは伝えてよいこと（鎮痛の方法は医師の指示で決まること）を伝え、痛みの伝え方（NRS）を確認する'] }),
      ileus: c => ({ goalLong: '退院までに、排ガス・排便があり、腹部症状なく食事を摂れる', goalShort: '術後3日目までに排ガスがあり、腹部膨満・嘔吐が見られない',
        opExtra: [cpAnalgesiaSafetyOp(c)].filter(Boolean),
        op: ['腹部膨満・腹痛の有無と程度（腸管運動の回復の遅れの早期のサイン）', '悪心・嘔吐の有無・回数・性状', '排ガス・排便の有無と時期（排ガスがないことだけでイレウスとは判断せず、腹部症状・嘔吐・痛み・術後経過と合わせて評価する）', '腸蠕動音（他の所見と合わせて評価する）', ...(/胃管|NGチューブ|ドレーン/.test(c.text || '') ? ['胃管・ドレーンの排液の量・性状'] : []), ...(/点滴|出納|絶飲食|飲水|水分/.test(c.text || '') ? ['水分出納（IN/OUT）と、飲水・食事の摂取状況'] : []), '術後経過（離床の進み具合・鎮痛薬やオピオイドの使用）'],
        tp: ['医師の許可の範囲で早期離床（端座位・歩行）を進め、実施の前後に腹部症状（膨満・腹痛・悪心）を確認する', '指示された食事開始・食上げの段階を確認し、腹部症状がなければ、一口量・食べる速さを調整して介助する', '腹部膨満・反復する嘔吐・強い腹痛などが出たら、次の食事・飲水を進めず、院内の報告基準に従って速やかに医師へ報告し、食事・補液・検査などの指示を確認する（食事の中止・変更・再開は医師の指示による）', '痛みで体動が制限されているときは、' + cpAnalgesiaTp(c, '離床')],
        ep: ['歩くことが腸の動きの回復に役立つことを説明し、離床のしかたを一緒に確認する', '腹部の張り・吐き気・痛みが出たら我慢せずすぐ知らせること、食事は看護師と確認しながら進めることを説明し、自分の言葉で言ってもらう'] }),
      nutr: c => c.surgical === false ? CP_NUTR_NONSURGICAL(c) : ({ goalLong: '退院までに、必要な摂取量を維持し、体重が減らない', goalShort: '1週間後までに、食事を毎食7割以上食べられ、体重が今より減らない',
        opExtra: [c.weightLoss ? `術前からの体重減少（${c.weightLoss}）と、術前の食習慣・食事量を踏まえて、栄養状態の弱さを評価する` : ''].filter(Boolean),
        op: ['食事・水分の摂取量（割・mL）と、摂取できない理由（悪心・疼痛・嚥下・食欲）', '体重の推移（同じ条件で測る）', 'Alb・TPなどの検査値（絶飲食・手術の影響を考えて、経過で評価する）', '絶飲食・食事開始の指示と、輸液など栄養補給の内容', '口腔内の状態・義歯・食形態が合っているか'],
        tp: ['食事開始・食上げの指示を確認し、段階に合わせた食形態・一口量で介助する', '食事の前に口腔ケアと座位の体位調整を行い、痛みや吐き気があれば、指示の範囲で鎮痛・制吐を調整してから摂取を促す', '摂取量が少ないときは医師・栄養士へ報告し、補助食品などの導入を相談する'],
        ep: ['手術後の食事の進め方（量・速さ・よく噛む）と、むかつき・膨満が出たときの知らせ方を説明し、自分の言葉で言ってもらう', ...(c.gastric ? ['食事が始まってから退院前までの回復の段階に合わせて、少量を回数多く食べること・ダンピング症候群の症状と対処・栄養外来などでの経過観察・（胃全摘の場合）ビタミンB12補充の必要性を、医師・栄養士から指示・説明があった範囲で一緒に確認する'] : [])] }),
      act: c => (!c.risk && /疲労|倦怠/.test(c.text || '') && !/息切れ|呼吸困難|COPD|心不全|肺炎/.test(c.text || '')) ? CP_MODELS.fatigue(c) : c.risk ? ({ goalLong: '', goalShort: '',
        op: ['安静度の指示（ベッド上安静・離床許可の範囲）と、実際の活動状況', '離床・体位変換の前後の脈拍・血圧・SpO2と、自覚症状（息切れ・めまい・疲労）', '筋力・関節の動く範囲・ADL（できる所・介助が要る所）', '下肢の腫脹・痛み（廃用・血栓の早期発見）'],
        tp: ['医師が指示した安静度の範囲で、体位変換・関節運動・離床（ベッド上座位→端座位→立位）を段階的に進める', cpAnalgesiaTp(c, '離床') + '。離床の前に脈拍・血圧・SpO2を確認してから始める。ふらつき・息切れ・SpO2低下があれば中止し、医師へ報告する', 'ADLは、できる部分は自分で行ってもらい、介助が必要な動作を見きわめて介助する'],
        ep: ['体を動かす目的（筋力低下・肺炎・血栓の予防）と、動くときに痛みやつらさがあれば伝えてよいこと、無理せず休むことを説明し、自分の言葉で言ってもらう'] })
        : ({ goalLong: '退院までに、休憩を入れながら病棟内を歩け、活動後のSpO2・脈拍が安定している', goalShort: '1週間後までに、休憩を入れながら病棟のトイレまで歩け、歩行後もSpO2 90%以上を保てる',
        tp: ['活動（歩行・清拭）は短い距離・短い時間から始め、休憩を入れながら進め、活動の前後で脈拍・SpO2・息切れを確認する', '活動中に息切れ・SpO2低下・脈拍の急な上昇があれば、中止して休息をとり、医師へ報告する', '活動と休息の時間配分を、患者と一緒に決める'],
        ep: ['息切れを感じたら休むこと、無理せずに伝えることを説明し、自分の言葉で言ってもらう'] }),
      fall: () => ({ goalLong: '入院中、転倒・転落が起こらず、トイレや移動のときは自分から看護師を呼べる',
        goalShort: '3日後までに、トイレに行くときは毎回ナースコールを押して看護師を呼べる',
        tp: ['ナースコールを手の届く位置に置き、ベッド周りの床・履物を整える', '夜間のトイレは、就寝前に誘導し、起きるときは見守って付き添う', 'ふらつきのある日は、歩行時に腕を支えて一緒に歩く'],
        ep: ['なぜ呼んでよいか（ふらつきで転ぶと骨折する）を説明し、ナースコールの押し方を実際に押してもらって確認する'] })
    };
    // Fatigue / activity-rest model (general). Target values are never invented; activity and rest are balanced from observed fatigue.
    CP_MODELS.fatigue = c => ({ goalLong: '退院までに、疲労の程度に合わせて活動と休息を調整し、必要な日常生活を無理なく行う方法を説明できる',
      goalShort: '計画開始から3日以内に、疲労が強くなる活動を把握し、休息を取り入れた過ごし方を看護師と一緒に決められる',
      op: ['疲労の強さ、時間帯、活動との関係、休息後の変化を確認する', '更衣・清潔・移動・食事など、日常生活のどこに負担があるかを確認する', '睡眠時間・眠りの質、日中の休息と、休んだ後の回復感を確認する', '発熱・関節痛など、疲労に伴う症状と、治療開始後の変化を確認する'],
      tp: ['本人が優先したい活動を確認し、負担の大きい活動の前後に休息を組み込む', '疲労が強い場面では必要な援助を行い、本人が無理なくできる部分は継続できるようにする', '疲労や症状の変化を医療チームと共有し、その時点の状態に合わせて活動量を調整する'],
      ep: ['疲労や痛みを我慢して活動を続けず、早めに伝えるよう説明する', '退院後の仕事・家事について、活動を分ける、途中で休む、周囲に援助を頼む方法を一緒に考え、本人の言葉で説明してもらう', ...(/光線過敏|紫外線|蝶形紅斑/.test((c && c.text) || '') ? ['日光（紫外線）で症状が悪化しやすいことを説明し、帽子・長袖・日焼け止めなどの対策を、本人の生活に合わせて続けられる方法として一緒に確認する'] : [])] });
    function cpModelFor(plan, ctx) {
      const d = cpDomainOf(plan);
      if (!d || !CP_MODELS[d.key]) return null;
      const risk = cpIsRisk(plan);
      const m = CP_MODELS[d.key]({ ...(ctx || {}), risk });
      const op = m.op ? [...m.op] : (d.op || []).slice(0, 5).map(([l]) => `${l}を観察する`);
      if (m.opFirst) op.unshift(m.opFirst);
      if (m.opExtra) op.push(...m.opExtra);

      if (d.key === 'inf' && !/ドレーン|カテーテル|バルーン|膀胱留置/.test((ctx && ctx.text) || '')) { const k = op.findIndex(t => /ドレーン/.test(t)); if (k >= 0) op[k] = '傷の滲出液の量・色・においを観察する'; }
      if (d.key === 'inf' && /糖尿病/.test((ctx && ctx.text) || '')) op.push('血糖値の推移（高血糖は傷が治りにくく、感染しやすい）を観察する');
      const out = { ...m, op };

      if (risk) { const g = cpRiskGoalFor(plan, ctx || {}); out.goalLong = g.long; out.goalShort = g.short; }

      const edu = cpEducationLines((ctx && ctx.text) || '').filter(e => e.dom === d.key).map(e => e.line);
      if (edu.length) out.ep = cpUnionLines(edu, out.ep || []);
      return out;
    }
    function cpDomainOf(plan) {
      const head = String((plan && plan.problem) || '').normalize('NFKC');
      return CP_DOMAINS.find(d => d.re.test(head)) || null;
    }

    function cpRecordContext(cp) {
      const items = ((cp && cp.items) || []).filter(i => i && !i.deleted && !i.aiSuggested && !i.diseaseGeneral && i.text && i.type !== 'unnecessary');
      const text = [String((cp && cp.sourceText) || ''), ...items.map(i => i.text)].join('\n').normalize('NFKC');
      const last = (re) => { const all = [...text.matchAll(re)]; return all.length ? all[all.length - 1] : null; };
      const nrs = last(/NRS\s*[:：]?\s*(\d{1,2})(?!\d)/g);
      const spo2 = last(/SpO2\s*[:：]?\s*(\d{2,3})\s*%/g);
      const site = /創部痛|創痛|創部/.test(text) ? '創部痛' : /腰痛/.test(text) ? '腰痛' : '';
      const skin = (text.match(/(仙骨部|踵部?|大転子部|尾骨部)[^\n]{0,6}発赤/) || [])[1];
      return { nrs: nrs ? Number(nrs[1]) : null, spo2: spo2 ? Number(spo2[1]) : null, painSite: site, skin: skin ? `${skin}の発赤` : '',
        stoma: /ストーマ|ストマ|人工肛門/.test(text), urinary: /膀胱留置|バルーン|尿道カテーテル/.test(text), text,

        pca: /PCA|硬膜外/.test(text), epidural: /硬膜外/.test(text), opioid: /フェンタニル|モルヒネ|オピオイド|オキシコドン|ペンタゾシン|トラマドール|PCA|硬膜外/.test(text),
        surgical: /術後|術前|手術|術式|全摘|切除|開腹|腹腔鏡|オペ/.test(text), immunoOnly: /免疫抑制|ステロイド|プレドニゾロン|PSL|白血球(?:減少|低下)/.test(text) && !/創|傷口|ドレーン|カテーテル|褥瘡|潰瘍|刺入/.test(text.replace(/口腔潰瘍/g, '')), gastric: /胃(?:全摘|切除|亜全摘)/.test(text), gastricTotal: /胃全摘|胃を全摘/.test(text),
        weightLoss: ((text.match(/(\d+\s*(?:か月|ヶ月|カ月|週間?)(?:で|間に|間で)?\s*(?:体重(?:が)?)?\s*\d+(?:\.\d+)?\s*kg\s*(?:減|低下|やせ|減少))/) || text.match(/(体重(?:が)?\s*\d+(?:\.\d+)?\s*kg\s*(?:減|低下|減少))/) || [])[1] || '').replace(/\s+/g, '') };
    }

    const CP_GOAL_DEADLINE = /\d+\s*(?:日|週間?|時|か月|ヶ月|カ月)(?:後|間|目|以内|まで)?|本日|今日|明日|今週|退院(?:時|まで|後)|術後\s*\d+\s*日|離床まで|入院中|勤務終了|\d{1,2}\/\d{1,2}/;
    const CP_GOAL_MEASURE = /\d|NRS|VAS|SpO2|回|割|％|%|mL|kg|自立|できる|言える|話せる|説明でき|見られない|起こらず|起こらない|ない$|なく|がない|以内|以下|以上|未満/;
    const CP_GOAL_NURSE = /(?:させる|させない|を行う|行う$|を促す|を指導する|指導する|援助する|観察する|を図る|に努める|ケアする)/;
    const CP_GOAL_ABSTRACT = /(?:軽減|改善|安定|緩和|減少|増加|向上|保持|維持|解消|消失|安心|理解)(?:する|される|できる|が図れる|を図る|している)?。?$/;

    const CP_GOAL_UNREALISTIC = /\d{1,2}\s*時(?:まで|に|頃)|本日(?:中|まで)|今日(?:中|まで)|今夜|当日中|\d+\s*時間(?:後|以内)|数時間/;
    const CP_GOAL_VAGUE_DEADLINE = /数日|数週間?|数か月|近日|近いうち|早期|早め|しばらく|なるべく早く|そのうち|入院中のどこか/;
    const CP_GOAL_VAGUE_VERB = /(?:理解|イメージ|意識|認識|把握|知識|関心|自覚)\s*(?:を持つ|を持てる|が持てる|を深める|が深まる|を得る|を高める|する|できる|している|できている)(?=[。\s]|$)|イメージを持/;
    const CP_GOAL_CONCRETE_ACT = /説明(?:でき|する|して)|実演|復唱|言える|話せる|述べ|挙げ|示せ|行える|自分で(?:測定|注射|交換|行)|\d+\s*(?:つ|項目|回|個)/;
    function cpGoalCheck(goal) {
      const g = String(goal || '').normalize('NFKC').trim();
      if (!g) return { empty: true, deadline: false, subject: false, change: false, measure: false, abstract: false, msgs: ['目標がまだ書かれていません。「いつまでに」「患者が」「どうなる」「何をもって達成と判断するか」を入れて書いてみましょう'] };
      const unrealistic = CP_GOAL_UNREALISTIC.test(g);
      const vagueDeadline = CP_GOAL_VAGUE_DEADLINE.test(g);
      const deadline = CP_GOAL_DEADLINE.test(g) && !vagueDeadline && !unrealistic;
      const nurse = CP_GOAL_NURSE.test(g);
      const measure = CP_GOAL_MEASURE.test(g.replace(CP_GOAL_DEADLINE, ''));
      const abstract = CP_GOAL_ABSTRACT.test(g) && !/\d/.test(g.replace(CP_GOAL_DEADLINE, ''));
      const change = g.length >= 6;

      const vagueVerb = CP_GOAL_VAGUE_VERB.test(g) && !CP_GOAL_CONCRETE_ACT.test(g);
      const msgs = [];
      if (unrealistic) msgs.push(`「${(g.match(CP_GOAL_UNREALISTIC) || [''])[0]}」は、実習中に評価しにくい期限です。実習の日数で評価できる期限（例：2日後までに、実習最終日までに、退院までに）に直します`);
      if (vagueDeadline) msgs.push(`「${(g.match(CP_GOAL_VAGUE_DEADLINE) || [''])[0]}」では、いつ評価するのかがわかりません。日付・術後〇日目・退院までに、のように期限をはっきり書きます`);
      if (vagueVerb) msgs.push(`「${(g.match(CP_GOAL_VAGUE_VERB) || [''])[0]}」だけでは、できたかどうかを見て判断できません。「自分の言葉で〇〇を説明できる」「看護師の前で〇〇を実演できる」のように、観察できる行動で書きます`);
      if (abstract || (!deadline && !measure)) msgs.push('目標が抽象的です。いつまでに・どの程度まで改善するかを設定してみてください');
      if (!deadline && !vagueDeadline && !unrealistic) msgs.push('「いつまでに」がありません（例：2日後までに、実習最終日までに、退院までに）');
      if (nurse) msgs.push('看護師がすることの書き方になっています。目標は「患者が」どうなるかで書きます（看護師がすることはTPへ）');
      if ((!measure || abstract) && !vagueVerb) msgs.push('何をもって達成と判断するかがわかりません（例：NRS3以下、SpO2 95%以上、トイレまで歩ける、自分の言葉で説明できる）');
      return { empty: false, deadline, subject: !nurse, change, measure: measure && !abstract && !vagueVerb, abstract: abstract || vagueVerb, msgs };
    }

    const CP_TP_SPECIFIC = /\d|時|毎|ごと|前|後|まで|ように|方法|回|分|枕|クッション|側臥位|ファーラー|座位|〜|から|ずつ|一緒|見守|介助|声をかけ|確認し|調整|使い|使って/;

    const CP_TP_OBS = /(?:状況|状態|様子|程度|有無|変化|症状|反応|経過|値|量)(?:を|の)?(?:把握|観察|確認|測定|チェック)(?:する|します)?。?$|(?:を|の)(?:把握|観察|モニタリング|モニター|チェック)(?:する|します)?。?$/;
    function cpObservationLines(lines) { return (lines || []).filter(l => CP_TP_OBS.test(String(l).normalize('NFKC').trim())); }
    const CP_EP_VAGUE = /(?:方法|対応|注意点|必要性|重要性|内容|こと|仕方)(?:を|について)?(?:伝える|説明する|指導する|話す|教える)。?$/;
    const CP_EP_CHECK = /復唱|説明してもら|説明できる|実演|デモ|やってもら|言ってもら|話してもら|理解(?:度|を確認)|確認する|確認し|質問|チェックリスト|テスト|ティーチバック/;
    function cpVagueLines(lines) {
      return (lines || []).filter(l => { const t = String(l).normalize('NFKC'); return t.length < 16 && !CP_TP_SPECIFIC.test(t); });
    }

    function cpMapProblemFor(cp, plan) {
      const map = typeof normalizeRelationMap === 'function' && cp && cp.relationMap ? normalizeRelationMap(cp.relationMap) : null;
      if (!map || !map.nodes) return null;
      const probs = map.nodes.filter(n => n.type === 'nursing_problem');
      const key = s => String(s || '').normalize('NFKC').replace(/[\s（）()]/g, '');
      const dom = cpDomainOf(plan);
      const node = probs.find(n => key(n.label) === key(plan.problem))
        || probs.find(n => key(n.label).includes(key(plan.problem)) || key(plan.problem).includes(key(n.label)))
        || (dom && probs.find(n => cpDomainOf({ problem: n.label }) === dom));
      if (!node) return null;
      return { node, evidence: cpMapEvidence(map, node) };
    }
    function cpMapEvidence(map, node) {
      const seen = new Set(typeof findRelationEvidence === 'function' ? findRelationEvidence(map, node.id).nodeIds : [node.id]);
      const stack = [node.id];
      while (stack.length) {
        const id = stack.pop();
        map.edges.forEach(e => { if (e.target === id && !['contradicts', 'related_to', 'preceded_by', 'managed_by', 'addresses'].includes(e.relation) && !seen.has(e.source)) { seen.add(e.source); stack.push(e.source); } });
      }

      const dz = new Set();
      const dstack = map.nodes.filter(n => n.type === 'disease').map(n => n.id);
      dstack.forEach(id => dz.add(id));
      while (dstack.length) { const id = dstack.pop(); map.edges.forEach(e => { if (e.target === id && !dz.has(e.source)) { dz.add(e.source); dstack.push(e.source); } }); }
      return map.nodes.filter(n => seen.has(n.id) && n.id !== node.id && !dz.has(n.id) && n.observed !== false && n.source !== 'knowledge'
        && !/^治療[:：]/.test(String(n.label)) && !map.nodes.some(d => d.type === 'disease' && String(d.label).slice(0, 10) === String(n.label).slice(0, 10)) && ['symptom', 'lab', 'vital', 'medication', 'assessment', 'patient_fact'].includes(n.type)).map(n => { const t = String(n.label); return /^[（(].*[)）]$/.test(t) ? t.slice(1, -1) : t; }).slice(0, 8);
    }

    function cpEvidenceKeys(evidence) {
      const keys = new Set();
      (evidence || []).forEach(t => {
        const s = String(t).normalize('NFKC');
        [['NRS', /NRS/], ['SpO2', /SpO2/], ['WBC', /WBC/], ['CRP', /CRP/], ['体温', /体温|℃/], ['血糖', /血糖|HbA1c/], ['Alb', /Alb/], ['体重', /体重/], ['浮腫', /浮腫|むくみ/],
          ['痰', /痰/], ['発赤', /発赤/], ['排便', /排便|便/], ['排ガス', /排ガス/], ['腹部膨満', /膨満/], ['むせ', /むせ/], ['麻痺', /麻痺|MMT/], ['睡眠', /眠/], ['Dダイマー', /ダイマー/], ['PT-INR', /INR/]]
          .forEach(([k, re]) => { if (re.test(s)) keys.add(k); });
      });
      return [...keys];
    }

    function reviewCarePlan(cp, plan) {
      const p = normalizeCarePlan({ ...plan });
      const dom = cpDomainOf(p);
      const ctx = cpRecordContext(cp);
      const goal = p.goalShort || p.goalLong;
      const body = [p.goalShort, p.goalLong, ...p.op, ...p.tp, ...p.ep].join('\n').normalize('NFKC');
      const opText = p.op.join('\n').normalize('NFKC');
      const out = [];
      const push = (key, msgs, { level, ...extra } = {}) => out.push({ key, label: CP_REVIEW_ITEMS.find(i => i.key === key).label, level: msgs.length ? (level || 'warn') : 'ok', msgs, ...extra });

      const fit = [];
      if (!p.problem.trim()) fit.push('看護問題が書かれていません');
      else if (!dom) fit.push('看護問題の種類を読み取れませんでした（計画の内容が看護問題に合っているか、自分で確かめてください）');
      else if (body && !dom.words.test(body)) fit.push(`「${p.problem}」の計画ですが、目標・OP・TP・EPに、この問題に関係する言葉（${String(dom.words.source).split('|').slice(0, 4).join('・')}など）が見当たりません`);
      push('fit', fit, { level: !dom && p.problem.trim() ? 'info' : 'warn' });

      const gc = cpGoalCheck(goal);
      const goalExample = dom && dom.goal ? dom.goal(ctx) : '';
      const goalMsgs = [...gc.msgs];
      if (!String(p.goalLong || '').trim()) goalMsgs.push('長期目標が空欄です。退院時・退院後にどうなっていてほしいか（期限つき）を書き、短期目標はそこへ向かう途中の段階にします');
      const inline = carePlanInlineNotes(cp, p);
      goalMsgs.push(...inline.goal);
      push('goal', goalMsgs, { goal: gc, example: goalMsgs.length ? goalExample : '' });

      const opMsgs = [], add = [];
      if (!p.op.length) opMsgs.push('OP（観察計画）がまだありません');
      if (dom && dom.op) {
        const miss = dom.op.filter(([, re]) => !re.test(opText)).map(([l]) => l);
        if (miss.length) { opMsgs.push(`${p.problem || 'この'}の計画ですが、OPに「${miss.join('」「')}」が不足していないか確認してください`); add.push(...miss); }
      }
      const vagueVital = p.op.filter(l => /^(?:バイタル(?:サイン)?(?:を|の)?(?:観察|測定|確認)(?:する)?|全身状態(?:を|の)?観察(?:する)?)$/.test(String(l).normalize('NFKC').replace(/[。\s]/g, '')));
      if (vagueVital.length) opMsgs.push(`「${vagueVital[0]}」だけでは、何を何のために見るのかがわかりません。見る値と、どうなったら報告するか（例：体温38℃以上・SpO2 93%以下で報告）を書いてみましょう`);
      opMsgs.push(...inline.op);
      push('op', opMsgs, { add });

      const tpMsgs = [];
      if (!p.tp.length) tpMsgs.push('TP（援助計画）がまだありません');
      cpVagueLines(p.tp).forEach(l => tpMsgs.push(`「${l}」：いつ・どのように・どのくらい行うかを書いてみましょう（例：${/体位/.test(l) ? '創部を圧迫しないよう、枕を使って膝を軽く曲げた側臥位にする。2時間ごとに体位を変える' : /清拭|清潔/.test(l) ? '午前中の鎮痛薬が効いている時間に、背部・下肢の清拭を介助する' : /歩行|離床|リハビリ/.test(l) ? '鎮痛薬を使って30分後に、看護師が付き添って病棟の廊下を1往復歩く' : '誰が・いつ・何を使って・どこまで行うか'}）`));
      const obsTp = cpObservationLines(p.tp);
      obsTp.forEach(l => tpMsgs.push(`「${l}」は観察・把握なので、TPではなくOP（観察計画）に書きます。TPには、看護師が実施する援助（例：一緒に手技を行う、体位を整える、介助する）を書きます`));
      push('tp', tpMsgs, { moveToOp: obsTp });

      const epMsgs = [];
      if (!p.ep.length) epMsgs.push('EP（教育計画）がまだありません。患者・家族に何を伝え、何ができるようになってほしいかを書いてみましょう');
      p.ep.filter(l => /説明する|指導する|伝える/.test(l) && String(l).length < 14).forEach(l => epMsgs.push(`「${l}」：何を説明するのか（内容）を書いてみましょう`));
      if (dom && dom.key === 'pain' && p.ep.length && !/我慢|伝え|知らせ|ナースコール/.test(p.ep.join(''))) epMsgs.push('痛みを我慢せずに伝えてよいこと（伝え方）がEPに入っているか確認してください');
      if (dom && ['fall', 'bleed', 'glu'].includes(dom.key) && p.ep.length && !/ナースコール|伝え|知らせ|呼/.test(p.ep.join(''))) epMsgs.push('危ないとき・症状が出たときに、看護師をどう呼ぶか（伝えるか）がEPに入っているか確認してください');
      p.ep.filter(l => CP_EP_VAGUE.test(String(l).normalize('NFKC').trim()) && String(l).length < 24 && !/[：:（(、]/.test(l)).forEach(l => epMsgs.push(`「${l}」：何を説明するのか（具体的な内容。例：症状・そのときの行動・連絡の仕方）と、理解をどう確認するか（自分の言葉で説明してもらう・実演してもらう）まで書いてみましょう`));
      if (p.ep.length && !CP_EP_CHECK.test(p.ep.join('\n').normalize('NFKC'))) epMsgs.push('理解をどう確認するか（例：自分の言葉で説明してもらう、実演してもらう、パンフレットを見ながら質問を聞く）がEPに入っていません');
      push('ep', epMsgs);

      const indMsgs = [];
      const specific = [/\d/, /創部|仙骨部|下肢|右|左/, ctx.stoma ? /ストーマ|パウチ/ : null, /「[^」]+」/].filter(Boolean);
      const own = (typeof findDrugsInText === 'function' ? findDrugsInText(ctx.text).map(x => x.drug && x.drug.name).filter(Boolean) : []).filter(nm => body.includes(nm));
      if (body.trim() && !own.length && !specific.some(re => re.test(body))) indMsgs.push('この患者の記録にある値・言葉・治療（NRSの値、部位、使っている薬、本人の言葉など）が計画に入っていません。どの患者にも当てはまる計画になっていないか確認してください');
      push('individual', indMsgs);

      const mp = cpMapProblemFor(cp, p);
      const evidence = (p.evidence && p.evidence.length ? p.evidence : (mp ? mp.evidence : []));
      const evMsgs = [];
      if (!evidence.length) push('evidence', ['関連図にこの看護問題が無いため、根拠データと照らし合わせられません（関連図を作るか、根拠を自分で確かめてください）'], { level: 'info' });
      else {
        const keys = cpEvidenceKeys(evidence).filter(k => !new RegExp(k === '体温' ? '体温|℃|熱' : k === '排便' ? '排便|便' : k.replace(/[-]/g, '.?'), 'i').test(body));
        if (keys.length) evMsgs.push(`根拠データの「${keys.join('」「')}」が、目標・OPで見る値になっていません（根拠になった値の変化を追えるようにしましょう）`);

        const goalNrs = [...String(goal || '').normalize('NFKC').matchAll(/NRS\s*(\d+)/g)].map(m => Number(m[1])).pop();
        if (dom && dom.key === 'pain' && ctx.nrs != null && goalNrs != null && goalNrs >= ctx.nrs) evMsgs.push(`目標のNRSが、今の記録（NRS${ctx.nrs}）より下がっていません`);
        evMsgs.push(...inline.evidence);
        push('evidence', evMsgs, { evidence });
      }
      const kn = cpKnowledgeSuggestions({ ...p, evidence });
      if (kn.length) push('knowledge', kn.map(k => k.msg), { level: 'info', knowledge: kn });
      const hr = cpHighRiskCombos([p.problem, ...(Array.isArray(evidence) ? evidence : [evidence]), p.note, ...(p.op || []), ...(p.tp || [])].join('\n'));
      if (hr.length) push('knowledge', hr.map(h => h.msg), { level: 'info', highRisk: hr });
      return { domain: dom ? dom.key : null, items: out, goalExample, evidence, model: cpModelFor(p, ctx) };
    }
    // Review notes shown next to the plan text (never rewrites the user's wording).
    function carePlanInlineNotes(cp, plan) {
      const p = normalizeCarePlan({ ...plan });
      const t = cpEvidenceTexts(cp);
      const norm = a => (a || []).map(x => cpNorm(x));
      const out = { goal: [], op: [], evidence: [] };
      const evLines = norm(p.evidence);
      const planLines = [...norm(p.op), ...norm(p.tp), ...norm(p.ep)];
      const dom = cpDomainOf(p);
      const key = dom ? dom.key : '';
      if (key === 'inf') {
        const bad = [...evLines, ...planLines].filter(l => /(?:血管内|ライン|ルート|点滴|硬膜外)[^\n]{0,24}(?:HCV|HBV|抗体|梅毒|感染症)|(?:HCV|HBV|抗体|梅毒)[^\n]{0,24}(?:血管内|ライン|ルート)/.test(l));
        if (bad.length) out.evidence.push(`「${bad[0].slice(0, 36)}」：感染症検査（HCV・HBVなど）の結果は、ラインの感染リスクの根拠ではありません。A・Vライン、末梢静脈ライン、硬膜外チューブ、膀胱留置カテーテルなど、実際の挿入物の記録に置き換えてください`);
        const wc = planLines.filter(l => /WBC|白血球|CRP/.test(l));
        if (wc.length > 1) out.op.push('WBC・CRPの観察が複数の項目に分かれています。1つのOPにまとめられます');
      }
      if (key === 'act') {
        const bad = [...evLines, ...planLines].filter(l => /済ませる|外食|朝食|昼食|夕食|食事|間食/.test(l) && !/ADL|歩行|移動|離床|活動|体動|テニス|自立/.test(l));
        if (bad.length) out.evidence.push(`「${bad[0].slice(0, 36)}」は食事の記録で、ADL・活動の根拠ではありません。術前の「ADLすべて自立」「週末にテニス」と、術後の「自主的な体動なし」などを比べて使ってください`);
      }
      if (/胃管/.test(planLines.join('\n')) && /胃管[^\n]{0,24}抜去|抜去[^\n]{0,12}胃管/.test(t.all)) out.op.push('記録では胃管は退室時に抜去されています。胃管排液の観察が、いまの計画に残っていないか確認してください');
      if (/予定術式/.test(evLines.join('\n')) && /実施|腹腔鏡下[^\n]{0,30}実施|術式名/.test(t.all)) out.evidence.push('「予定術式」より、手術当日の実施術式（術式名）を優先して根拠にしてください');
      const goals = [p.goalShort, p.goalLong].filter(Boolean).map(cpNorm);
      goals.forEach(g => {
        if (/SpO2\s*\d{2}\s*%/i.test(g) && !/酸素|室内気|RA|L\s*\/\s*分|経鼻/.test(g)) out.goal.push('SpO2の目標に、酸素の投与条件（酸素○L/分で、または室内気で）が書かれていません。酸素投与中の値と室内気の値は分けて評価します');
        if (/(?:異常|症状)[^。\n]{0,6}(?:時|とき)[^。\n]{0,10}(?:対応できる|対処できる|対応する)/.test(g)) out.goal.push('「異常時に対応できる」は援助する側の行動です。患者が症状を伝えられる・伝えた内容に看護師が対応する、の2つに分けて書いてください');
        if (/\d+\s*日後/.test(g) && !/術後|入院|開始|から|起点/.test(g)) out.goal.push('「○日後」の起点（術後何日目から・計画開始日から）が書かれていません');
        if (/必要量|見込み以上|十分/.test(g) && !/\d/.test(g)) out.goal.push('「必要量」「見込み以上」は判断の基準が曖昧です。数値の目標は医師・栄養士に確認して設定してください（資料にない数値は補いません）');
        if (key === 'pain' && /NRS\s*[3-9]\s*以下/.test(g) && /NRS\s*[0-3]\b/.test(t.now) && !/安静時|体動時|動作時|起き上がり|深呼吸/.test(g)) out.goal.push('現在すでにNRSが低いため、「NRS以下」だけでは改善を捉えにくいです。安静時と体動時を分け、深呼吸・起き上がりなど実施したい動作ができたかも目標に入れてください');
      });
      // 教科書の補足資料から一般化した確認メモ（計画の文面は書き換えない）
      const allPlan = planLines.join('\n') + '\n' + goals.join('\n');
      if (/180\s*\/\s*105/.test(allPlan) && /脳梗塞|脳塞栓|脳卒中/.test(t.all + allPlan)) out.goal.push('血圧「180/105mmHg以下」は再灌流治療直後の急性期の管理目標です。3日目以降は一律の目標ではなく、医師が設定した個別の目標に従い、急な上げ下げを避ける視点で書いてください');
      if (/知識不足/.test(p.problem || '') && /飲み忘れ|服薬(?:でき|を)?(?:て)?いな|内服(?:を)?(?:中断|中止)/.test(t.all)) out.evidence.push('服薬の飲み忘れがある場合は「知識不足」と決めつけず、いつ・どんな場面（多忙・外出など）で忘れたかを確認し、生活に合う服薬の仕組みづくりまで計画に含めてください');
      if (/失語/.test(allPlan) && /構音障害/.test(t.all) && !/失語|呼称|復唱|言語理解/.test(t.all)) out.op.push('記録は「構音障害」で、失語の評価（言葉の理解・呼称・復唱）は見当たりません。失語と構音障害は別のもので、失語の評価が未記載なら確認が必要と書いてください');
      if (/嚥下|誤嚥/.test(allPlan) === false && /自力摂取|自分で食べ/.test(t.all) && /脳梗塞|脳出血|脳卒中/.test(t.all) && !/嚥下|むせ/.test(allPlan)) out.op.push('脳卒中では「自分で食べられる」ことが嚥下の安全を意味しません。嚥下スクリーニング・むせ・湿性嗄声の観察が計画に見当たりません');
      if (/体液量過剰/.test(p.problem || '') && !/体重|浮腫|尿量|肺音|呼吸困難/.test(t.all)) out.evidence.push('体液量過剰の根拠になる体重・浮腫・尿量・肺音・呼吸困難の記録が見当たりません。評価が必要な「リスク」として書くか、先にそれらのデータを集めてください');
      if (/eGFR|腎機能/.test(allPlan) && /透析|腹膜透析|PD/.test(allPlan) && /eGFR\s*[0-9.]+[^\n]{0,12}(?:だから|のため|ので)[^\n]{0,10}透析/.test(allPlan)) out.evidence.push('透析の開始は、eGFRの値だけでなく症状・体液量・検査値の異常・栄養・本人の希望を合わせて判断します。根拠にそれらを加えてください');
      if (key === 'drugAE' && !/呼吸困難|息切れ|咳|発熱|間質性/.test(allPlan)) out.op.push('分子標的薬などの副作用では、頻度が低くても重い間質性肺疾患を見逃さないため、新しい息切れ・乾いた咳・発熱・SpO2の低下の観察と、出たらすぐ連絡する指導が必要です');
      if (key === 'drugAE' && /副作用|症状/.test(allPlan) && !/自分の言葉|説明できる|連絡|相談/.test(allPlan)) out.goal.push('副作用の目標は「ゼロにする」ではなく、患者が重くなる前に症状に気づき、自己判断で休薬せず連絡・相談できること（自分の言葉で説明できる）にしてください');
      if (key === 'pd' && !/混濁|腹膜炎/.test(allPlan)) out.op.push('腹膜透析では、排液の混濁や腹痛は腹膜炎を疑う最優先のサインです。排液の色・透明度の観察と、「濁ったら次の受診まで待たず施設へ連絡する」指導が計画に見当たりません');
      if (key === 'pd' && /接続|バッグ交換|無菌/.test(allPlan) && !/汚染|触れ|外れ|漏れ/.test(allPlan)) out.op.push('接続部に触れた・外れた・漏れたなど汚染が疑われるときの対応（操作を続けず施設へ連絡）が計画（教育）に見当たりません');
      if (key === 'renal' && !/尿蛋白|アルブミン|ACR|蛋白尿/.test(allPlan)) out.op.push('腎機能は、Cr・eGFRだけでなく尿蛋白（アルブミン尿）とその経過も合わせて観察します');
      if (key === 'renal' && /血圧/.test(allPlan) && !/家庭血圧|起立|ふらつ|K|カリウム/.test(allPlan)) out.op.push('CKDの血圧は、数値だけでなく家庭血圧、立ちくらみ・転倒、体重・浮腫、K値、服薬状況（ACE阻害薬・ARBなど）も一緒に見ます');
      if (/血圧|降圧/.test(allPlan) === false && key === 'perfusion') out.op.push('血圧・脈拍（不整脈の有無）の観察が計画に見当たりません');
      return out;
    }
    function carePlanInlineNotesHtml(cp, p) {
      let n;
      try { n = carePlanInlineNotes(cp, p); } catch (e) { return ''; }
      const block = (label, list) => list.length ? `<div class="cp-inline"><b>${label}</b><ul>${list.map(m => `<li>${escapeHtml(m)}</li>`).join('')}</ul></div>` : '';
      const html = block('目標への見直し点', n.goal) + block('根拠への見直し点', n.evidence) + block('観察計画への見直し点', n.op);
      return html ? `<div class="cp-inline-notes" role="note"><span class="my-asm-label"><i class="fa-solid fa-lightbulb"></i> 文章はそのままです。見直す点だけ添えています</span>${html}</div>` : '';
    }
    function cpReviewCount(review) { return review.items.filter(i => i.level === 'warn').length; }

    // ==========================================================================

    // ==========================================================================
    const CP_RISK_RE = /リスク|可能性|おそれ|危険/;
    function cpNorm(t) { return String(t || '').normalize('NFKC'); }
    function cpIsRisk(plan) { return CP_RISK_RE.test(cpNorm(plan && plan.problem)); }

    const CP_SUBTYPES = {
      resp: [[/気道浄化|排痰|喀痰/, 'clear'], [/ガス交換|換気/, 'gas'], [/合併症|無気肺|肺炎|呼吸器/, 'comp']],
      pain: [[/慢性/, 'chronic']], nutr: [[/過剰/, 'over']], inf: [[/創|手術部位|SSI/, 'wound'], [/尿路|カテーテル/, 'uti']], anx: [[/死/, 'death']]
    };
    function cpPlanKey(plan) {
      const head = cpNorm(plan && plan.problem);
      const dom = cpDomainOf(plan);
      const risk = cpIsRisk(plan) ? 'R' : 'A';
      if (dom) {
        const sub = ((CP_SUBTYPES[dom.key] || []).find(([re]) => re.test(head)) || [null, ''])[1];
        return `${dom.key}${sub ? '.' + sub : ''}:${risk}`;
      }
      return 'x:' + risk + ':' + head.replace(/[\s（）()]/g, '').replace(/に関連した|による|に伴う|リスク状態|（候補）/g, '');
    }

    function cpUnionLines(a, b) {
      const out = [...(a || [])];
      (b || []).forEach(l => { if (!out.some(x => cpNorm(x).replace(/\s/g, '') === cpNorm(l).replace(/\s/g, '') || cpSimilar(x, l))) out.push(l); });
      return out;
    }
    function mergeDuplicateCarePlans(cp, now = new Date().toISOString()) {
      const groups = new Map();
      carePlanList(cp).forEach(p => { const k = cpPlanKey(p); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); });
      let merged = 0;
      groups.forEach(g => {
        if (g.length < 2) return;
        g.sort((a, b) => (b.records.length - a.records.length) || ((Number(a.order) || 0) - (Number(b.order) || 0)));
        const keep = g[0];
        g.slice(1).forEach(d => {
          ['op', 'tp', 'ep', 'evidence'].forEach(f => { keep[f] = cpUnionLines(keep[f], d[f]); });
          keep.relatedNeeds = [...new Set([...(keep.relatedNeeds || []), ...(d.relatedNeeds || [])])];
          keep.reasons = [...(keep.reasons || []), ...(d.reasons || [])];
          keep.records = [...keep.records, ...d.records].sort((a, b) => String(a.at).localeCompare(String(b.at)));
          ['goalLong', 'goalShort', 'note'].forEach(f => { if (!String(keep[f] || '').trim() && String(d[f] || '').trim()) keep[f] = d[f]; });
          keep.mergedFrom = [...(keep.mergedFrom || []), d.id];
          cp.carePlans[d.id] = { id: d.id, deleted: true, updatedAt: now, problemKey: carePlanProblemKey(d.problem), canonKey: cpPlanKey(d), mergedInto: keep.id };
          merged++;
        });
        keep.updatedAt = now;
      });
      return merged;
    }

    function cpExplainDistinct(cp) {
      const list = carePlanList(cp);
      list.forEach(p => {
        const k = cpPlanKey(p).split(':')[0];
        const other = list.find(q => q.id !== p.id && cpPlanKey(q).split(':')[0] === k);
        if (other) p.distinct = `「${other.problem}」とは別の問題です：${cpIsRisk(p) ? 'こちらはまだ起きていない合併症の予防（リスク）' : 'こちらはすでに現れている問題への援助'}として分けています`;
        else delete p.distinct;
      });
    }

    const CP_EVID_RULES = [
      { key: 'resp', sub: 'clear', actual: /排痰困難|喀出(?:困難|不良|できな)|痰(?:が)?(?:貯留|絡|多量|粘稠|出せな)|副雑音(?!なし|は聴取されず|なく|を認めず|なし)|ラ音(?!なし)|咳(?:嗽)?(?:が)?弱|咳(?:が)?出せ|SpO2\s*(?:[0-8]\d|9[0-3])\s*%/, riskRe: /術後|全身麻酔|開腹|喫煙|COPD|創部痛|疼痛|臥床|安静|咳嗽|痰/, contra: /(?:自己)?喀出(?:良好|可能|できて|できている)|副雑音(?:なし|は聴取されず|なく)/, riskName: '術後呼吸器合併症リスク状態', why: '湿性咳嗽・痰の記載だけでは、気道浄化が非効果的とは言えません（咳の強さ・痰の貯留・呼吸音・酸素化の確認が必要）' },
      { key: 'resp', sub: 'gas', actual: /SpO2\s*(?:[0-8]\d|9[0-3])\s*%|酸素(?:投与|吸入)|PaO2|チアノーゼ|呼吸困難|頻呼吸|努力呼吸/, riskRe: /術後|全身麻酔|COPD|喫煙|肺/, contra: /SpO2\s*9[5-9]\s*%|SpO2\s*100\s*%/, riskName: '術後呼吸器合併症リスク状態', why: '酸素化の低下や呼吸困難などの所見がないため、ガス交換障害とは言えません' },
      { key: 'act', actual: /息切れ|動悸|労作時|易疲労|疲労感|倦怠感|(?:歩行|活動|離床|労作)(?:後|時|中)(?:に)?[^。\n]{0,10}(?:SpO2|脈拍|息切れ|めまい|ふらつ)|脈拍(?:が)?上昇/, riskRe: /安静|臥床|離床|術後|活動制限/, riskName: '廃用症候群リスク状態', why: '術後の床上安静（医学的な指示）だけでは、活動耐性の低下とは言えません（労作時の症状・バイタルの変化など、実際の耐性低下の所見が必要）。安静度の指示による制限と、身体の活動耐性の低下は分けて考えます' },
      { key: 'nutr', actual: /摂取量(?:が)?(?:低下|減少|少な|[0-4]\s*割)|(?:食事|食べ)(?:が)?(?:とれ|摂れ|食べられ)(?:ない|ず)|食欲(?:不振|低下)|体重(?:が)?(?:減少|減った)|BMI\s*(?:1[0-7]|18\.[0-4])|摂取不足|[0-4]\s*割(?:摂取|程度)/, riskRe: /絶飲食|絶食|禁食|NPO|術後|摂取制限/, riskName: '栄養摂取量不足リスク状態', why: '絶飲食（医学的な指示）やAlb低下だけでは、栄養摂取量不足や低栄養状態とは言えません（実際の摂取量・体重の変化などの確認が必要）' },
      { key: 'ileus', actual: /腹部膨満(?:が|あり|著明|強)|嘔吐(?:あり|を認|\d+\s*回)|排ガス(?:なし|停止|無し|なく)|腸蠕動(?:音)?(?:低下|減弱|消失)|イレウス(?:と診断|を発症)/, riskRe: /術後|開腹|腹部手術|麻薬|オピオイド|絶飲食|消化管/, riskName: '消化管運動機能障害リスク状態', why: '腹部膨満・嘔吐・排ガス停止などの所見がないため、消化管運動機能障害（イレウス）が起きているとは言えません' },
      { key: 'inf', actual: /発熱|熱発|3[7-9](?:\.\d)?\s*℃|創部(?:の)?(?:発赤|腫脹|熱感|滲出|膿|排膿)|排膿|膿性|尿(?:の)?混濁|感染徴候(?:あり|を認|が見られ)/, riskRe: /創|ドレーン|カテーテル|バルーン|膀胱留置|点滴|ルート|刺入|術後|糖尿病/, riskName: '感染リスク状態', why: 'WBC・CRPの上昇だけでは感染とは言えません（術後の炎症反応との区別のため、発熱・創部所見・排液・検査値の推移を合わせて評価します）' },
      { key: 'pain', actual: /痛|NRS|疼痛|苦痛表情|顔をしかめ/, riskRe: /術後|創/, riskName: '', why: '痛みの訴え・NRSなどの記録が見当たりません' },
      { key: 'anx', actual: /不安|心配|緊張|恐怖|眠れ|落ち着かな/, riskRe: /術後|手術|入院/, riskName: '', why: '不安を示す言動・訴えの記録が見当たりません' }
    ];

    function cpEvidenceTexts(cp) {
      const items = ((cp && cp.items) || []).filter(i => i && !i.deleted && !i.aiSuggested && !i.diseaseGeneral && i.text && i.type !== 'unnecessary');
      const all = [String((cp && cp.sourceText) || ''), ...items.map(i => i.text)].join('\n');
      const now = items.length ? items.filter(i => i.admissionPhase !== 'preadmission' && i.assessmentColumn !== 'preadmission' && !(Object.values(i.assessmentCols || {}).length && Object.values(i.assessmentCols).every(c => c === 'preadmission')) && !/^入院前/.test(String(i.timestamp || ''))).map(i => i.text).join('\n') : all;
      return { all: cpNorm(all), now: cpNorm(now) }; // No fallback from historical-only cards into the current period.
    }
    function cpEvidenceNotes(rule, t) {
      const msgs = [];
      if (rule.key === 'resp') {
        const found = [[/浅/, '浅い呼吸'], [/酸素\s*\d+\s*L|酸素(?:投与|吸入)/, '酸素投与'], [/湿性咳嗽/, '湿性咳嗽'], [/FEV1?\.?0?%?|1秒率/, '1秒率'], [/頻呼吸|呼吸困難/, '呼吸困難・頻呼吸']].filter(([re]) => re.test(t.now)).map(([, n]) => n);
        if (found.length) msgs.push(`呼吸の所見（${found.join('・')}）があるため、呼吸状態のさらなるアセスメント（咳の強さ・痰の喀出・呼吸音・SpO2）が必要です。肺炎・無気肺・気道浄化の障害と確定するものではありません（疑い・リスクとして扱います）`);
        if (/酸素/.test(t.now) && /SpO2/.test(t.now)) msgs.push('SpO2は、酸素投与中の値と室内気の値を分けて評価します（酸素投与中の値から、室内気での酸素化を推測しません）');
      }
      if (rule.key === 'inf') {
        const dev = [[/ドレーン/, 'ドレーン'], [/膀胱留置|バルーン|尿道カテーテル/, '尿道カテーテル'], [/CV|中心静脈|末梢ライン|点滴|ルート/, '血管内ライン'], [/創|手術/, '手術創']].filter(([re]) => re.test(t.all)).map(([, n]) => n);
        if (dev.length) msgs.push(`感染のリスク要因（${dev.join('・')}）と、実際の感染の徴候（発熱・創部の発赤や腫脹・排液の性状の変化）は分けて評価します`);
      }
      return msgs;
    }
    function validateCarePlanEvidence(cp, plan) {
      const dom = cpDomainOf(plan);
      const head = cpNorm(plan.problem);
      const t = cpEvidenceTexts(cp);
      // A plan's own evidence text cannot establish a current observation unless it is present in current records.
      const ev = cpNorm((plan.evidence || []).filter(e => t.now.includes(cpNorm(e))).join('\n'));
      const sub = dom ? ((CP_SUBTYPES[dom.key] || []).find(([re]) => re.test(head)) || [null, ''])[1] : '';
      const rule = dom && (CP_EVID_RULES.find(r => r.key === dom.key && r.sub === sub) || CP_EVID_RULES.find(r => r.key === dom.key && !r.sub));
      if (!rule) return { kind: 'unchecked', msgs: [] };
      const actual = rule.actual.test(t.now + '\n' + ev);
      const risk = rule.riskRe.test(t.all + '\n' + ev);
      const contra = rule.contra && rule.contra.test(t.now);
      const asRisk = cpIsRisk(plan);
      if (asRisk) return risk ? { kind: 'risk', msgs: cpEvidenceNotes(rule, t) } : { kind: 'insufficient', msgs: ['リスクの要因（手術・処置・既往など）が記録から読み取れません。現時点では判断するための情報が不足しています'] };
      if (actual && contra) return { kind: 'conflict', msgs: ['この問題を示す所見と、打ち消す所見の両方があります。判定を保留し、最新の所見で確かめてください'] };
      if (actual) return { kind: 'existing', msgs: [] };
      if (risk && rule.riskName) {
        const msgs = [`${rule.why}。いま起きている問題としてではなく、「${rule.riskName}」として扱うのが妥当と考えられます`];
        msgs.push(...cpEvidenceNotes(rule, t));
        return { kind: 'risk', msgs, riskName: rule.riskName };
      }
      return { kind: 'insufficient', msgs: [`${rule.why}。現時点では判断するための情報が不足しています`] };
    }

    function applyCarePlanValidation(cp, plan) {
      const v = validateCarePlanEvidence(cp, plan);
      plan.validation = { kind: v.kind, msgs: v.msgs };
      if (v.kind === 'risk' && v.riskName && !cpIsRisk(plan) && ['rules', 'map', 'import', 'ai'].includes(plan.source)) {
        plan.problemOriginal = plan.problem;
        plan.problem = v.riskName;
        plan.validation = { kind: 'risk', msgs: [`「${plan.problemOriginal}」は、いま起きている問題と言える所見がないため、「${v.riskName}」にしました。${v.msgs[0] || ''}`] };
        plan.goalLong = ''; plan.goalShort = ''; plan.op = []; plan.tp = []; plan.ep = [];
      }
      return plan.validation;
    }

    const CP_PRIORITY_BASE = { resp: 90, bleed: 88, vte: 80, swallow: 76, glu: 78, delirium: 70, pain: 72, fluidLow: 68, fluidEx: 68, ileus: 66, inf: 64, fall: 60, nausea: 55, nutr: 50, urine: 50, act: 48, mobility: 46, skin: 46, const: 45, anx: 40, sleep: 35, dmfoot: 62, mgmt: 38, know: 36, fam: 34, comm: 42, body: 40 };
    function cpPriorityOf(cp, plan) {
      const dom = cpDomainOf(plan);
      const ctx = cpRecordContext(cp);
      const k = dom ? dom.key : '';
      const why = [];
      let s = CP_PRIORITY_BASE[k] || 30;
      if (['resp', 'bleed', 'vte', 'swallow'].includes(k)) why.push('気道・呼吸・循環に関わる');
      const risk = cpIsRisk(plan);
      if (!risk) { s += 8; why.push('すでに現れている問題である'); } else if (s >= 60) why.push('起きると重大な合併症のリスク');
      if (k === 'resp' && ctx.spo2 != null && ctx.spo2 < 94) { s += 15; why.push(`SpO2 ${ctx.spo2}%の記録`); }
      if (k === 'pain' && ctx.nrs != null) { if (ctx.nrs >= 7) { s += 10; why.push(`NRS${ctx.nrs}の強い痛み`); } else if (ctx.nrs <= 3) { s -= 10; why.push(`NRS${ctx.nrs}で現在は落ち着いている`); } else why.push(`NRS${ctx.nrs}`); }
      if (/術後/.test(ctx.text) && ['resp', 'ileus', 'vte', 'inf'].includes(k)) { s += 5; why.push('術後の時期に起こりやすい'); }
      if (k === 'pain' && /痛(?:い|み)(?:が)?(?:強|つらい|辛い)|我慢できない/.test(ctx.text)) { s += 6; why.push('患者の痛みの訴え'); }
      if (k === 'anx' && /不安|心配/.test(ctx.text)) { s += 6; why.push('患者の不安の訴え'); }
      if (['act', 'mobility'].includes(k) && /安静|ベッド上|床上/.test(ctx.text)) { s -= 5; why.push('現在は安静度の指示がある'); }
      return { score: s, reason: why.length ? why.join('・') + 'ため' + '、この順番にしました' : '記録上の緊急度から、この順番にしました' };
    }
    function prioritizeCarePlans(cp) {
      const list = carePlanList(cp);
      if (!list.length) return;
      const scored = list.map(p => ({ p, ...cpPriorityOf(cp, p) }));
      scored.forEach(x => { x.p.priorityReason = x.reason; });
      if (list.some(p => p.orderLocked)) return;
      scored.sort((a, b) => b.score - a.score || (Number(a.p.order) || 0) - (Number(b.p.order) || 0));
      scored.forEach((x, n) => { x.p.order = n + 1; });
    }

    const CP_RISK_GOALS = {
      resp: c => ({ long: '退院までに、呼吸器合併症（肺炎・無気肺）の徴候（発熱・SpO2低下・呼吸音の変化・痰の増加）を認めず、自分で深呼吸と咳嗽を行える', short: `${c.post ? '術後3日目まで' : '3日後までの観察期間中'}、発熱・SpO2低下（${c.spo2 && c.spo2 < 95 ? '現在の値から低下しない' : '95%未満になる'}ことなく）・呼吸音の変化を認めず、創部を保護しながら深呼吸と咳嗽を自分で実施できる` }),
      ileus: () => ({ long: '退院までに、消化管運動の回復が順調に経過し、食事が進められる', short: '3日後までの観察期間中、腹部膨満・反復する嘔吐・排ガス停止などの異常を認めず、異常が起きたときにすぐに対応できる' }),
      inf: c => c && c.immunoOnly ? { long: CP_INF_IMMUNO().goalLong, short: CP_INF_IMMUNO().goalShort } : ({ long: '退院まで、創部・刺入部に感染の徴候（発赤・腫脹・熱感・滲出液・においの増加）を認めない', short: '3日後までの観察期間中、創部・刺入部の所見が初回の記録より悪化せず、発熱が持続せず、異常があればすぐに報告・対応できる' }),
      vte: () => ({ long: '離床が進むまで、下肢の腫脹・痛み・左右差や肺塞栓の徴候（胸痛・呼吸困難）を認めない', short: '3日後までの観察期間中、下肢の腫脹・痛みがなく、許可された範囲で足関節運動・離床を行える' }),
      bleed: () => ({ long: '入院中、出血の徴候を認めない', short: '3日後までの観察期間中、出血の徴候（創部・ドレーン排液・皮下出血・血便など）を認めず、気づいたときに看護師へ伝えられる' }),
      nutr: c => ({

        long: c.gastric ? '退院までに、指示された食事内容で栄養士の示す必要量をめざして摂れ、体重が術後の見込み以上に減らず、少量頻回の食べ方とダンピング症状への対処を自分の言葉で説明できる' : '退院までに、指示された食事内容で必要量を摂り、体重の減少を認めない',
        short: '食事再開後3日以内に、医師が指示した食事の段階（食種・量）を、悪心・嘔吐・膨満感を伴わずに進められ、毎食の摂取量と水分量が記録で確認できる' }),
      act: () => ({ long: '退院までに、廃用による筋力・歩行能力の低下を認めず、ADLを自立（または術前の水準）まで戻す', short: '3日後までに、許可された安静度の範囲で離床が進み、離床時にふらつき・息切れ・SpO2低下を認めない' }),
      glu: () => ({ long: '入院中、血糖値が大きく変動せず、低血糖の症状に自分で気づいて知らせられる', short: '3日後までの観察期間中、低血糖（70mg/dL未満）を認めず、症状が出たときはすぐ看護師に知らせられる' }),
      fall: () => ({ long: '入院中、転倒・転落を起こさない', short: '3日後までの観察期間中、転倒・転落がなく、移動時は看護師を呼べる' })
    };
    function cpRiskGoalFor(plan, ctx) {
      const dom = cpDomainOf(plan);
      const c = { ...ctx, post: /術後/.test((ctx && ctx.text) || '') };
      if (dom && CP_RISK_GOALS[dom.key]) return CP_RISK_GOALS[dom.key](c);
      const label = (dom && dom.op && dom.op[0] && dom.op[0][0]) || '関連する観察項目';
      const prob = String(plan.problem || '').replace(/リスク状態$/, '').replace(/^.*に関連した/, '');
      return { long: `入院中、${prob}の徴候を認めず、安全に経過する`, short: `3日後までの観察期間中、${label}などの異常を認めず、異常があればすぐに報告・対応できる` };
    }

    function cpEducationLines(text) {
      const t = cpNorm(text);
      const out = [];
      if (/呼吸(?:訓練|練習|リハ)|スパイロ|インセンティブ/.test(t) && /目的|なぜ|何のため|やり方|方法|合って|どう(?:すれ|やっ)|質問|わから|分から/.test(t)) out.push({ dom: 'resp', line: '呼吸訓練の目的（無気肺・肺炎の予防）と正しい方法を説明し、患者自身に実施してもらい、手技と理解を確認する（「分かりました」の返事だけで習得したとはみなさず、実施する様子を見て確認する）' });
      if (/食事|食べ|食べて|飲水|飲んで/.test(t) && /いつから|いつ(?:から)?食べ|食べてい?い|大丈夫|質問|どのくらい/.test(t)) out.push({ dom: 'ileus', line: '術後の食事の開始時期・進め方・食べるときの注意（少量ずつ・ゆっくり・腹部症状が出たら知らせる）を説明し、患者の疑問に答えたうえで、自分の言葉で言ってもらい理解を確認する' });
      if (/合併症|イレウス|感染|縫合不全/.test(t) && /心配|不安|怖|大丈夫か/.test(t)) out.push({ dom: 'anx', line: '患者が心配している術後合併症について、予防の方法と、早期に知らせてほしい症状を説明し、質問を聞いて理解を確認する' });
      return out;
    }

    const CP_CASE_TERMS = [[/ストーマ|パウチ/, 'ストーマ'], [/股関節|脱臼肢位|人工骨頭/, '股関節'], [/インスリン/, 'インスリン'], [/胃管|NGチューブ|経鼻胃管/, '胃管'], [/膀胱留置|バルーン|尿道カテーテル/, '尿道カテーテル'], [/ドレーン/, 'ドレーン'], [/酸素(?:投与|吸入|カニュ)/, '酸素投与'], [/CV|中心静脈/, '中心静脈カテーテル'], [/弾性ストッキング|フットポンプ/, '弾性ストッキング']];
    function cpForeignTerms(cp, plan) {
      const text = cpEvidenceTexts(cp).all;
      const body = cpNorm([plan.problem, plan.goalLong, plan.goalShort, ...plan.op, ...plan.tp, ...plan.ep].join('\n'));
      return CP_CASE_TERMS.filter(([re]) => re.test(body) && !re.test(text)).map(([, name]) => name);
    }

    // ==========================================================================
    // Generated-result provenance: every stored generated result (diagnosis, plan, summary, evaluation)
    // is bound to the patient ID and the source revision it was produced from. A result whose binding
    // does not match the patient being shown or exported is excluded until it is regenerated.
    // The patient's original records and manual edits are never touched by this check.
    // ==========================================================================
    const GENERATED_RESULT_FIELDS = [
      { key: 'labEvaluationResult', label: '検査データ臨床評価' },
      { key: 'contradictionResult', label: 'S/O矛盾チェック' },
      { key: 'diagnosisResult', label: '看護診断候補' },
      { key: 'timelineResult', label: '経時変化サマリー' },
      { key: 'carePlanResult', label: '看護計画（AI）' }
    ];
    // Case-specific clinical terms. A generated text that contains them while the patient's own records do not is treated as foreign.
    const GEN_FOREIGN_TERMS = [
      [/大腿骨|人工骨頭|人工股関節|BHA|THA|股関節/, '大腿骨・股関節の手術'],
      [/酸化マグネシウム|マグミット/, '酸化マグネシウム'],
      [/歩行訓練|歩行器|荷重/, '歩行訓練・荷重'],
      [/NRS|ペインスケール|VAS/, '疼痛スケール'],
      [/術後\s*\d+\s*日|POD\s*\d|術後\s*[一二三四五六七八九十]+日/, '術後日数'],
      [/長男|次男|長女|次女|キーパーソン/, '家族の支援者'],
      [/創部痛|手術創|術創|ドレーン|PCA|硬膜外/, '術後の創部・ドレーン管理'],
      [/ストーマ|パウチ/, 'ストーマ'],
      [/インスリン|血糖測定/, 'インスリン'],
      [/HBs|HCV|HBV|梅毒|感染症検査/, '感染症検査']
    ];
    function sourceRevisionOf(cp) {
      const t = String((cp && cp.sourceText) || '').replace(/\s+/g, '');
      let h = 2166136261;
      for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
      return `r${t.length}-${h.toString(16)}`;
    }
    // Keyword proposals derived only from this patient's manual tag additions; the user approves each one before it becomes a shared rule.
    const IMPROVEMENT_STOP_WORDS = /^(?:患者|本人|状況|入院|退院|現在|以前|普段|最近|症状|状態|生活|記録|訴え|食事|睡眠|排泄|発言|様子)$/;
    function buildImprovementProposals(cp) {
      const items = ((cp && cp.items) || []).filter(i => i && !i.deleted && !i.diseaseGeneral && i.text);
      const rules = (typeof globalAppData !== 'undefined' && globalAppData.customTagRules) || [];
      const byKey = new Map();
      items.forEach(i => {
        const added = Array.from(new Set((i.editLog || []).filter(e => e && e.kind === 'tagAdd' && e.hId).map(e => Number(e.hId))));
        added.filter(h => (i.hendersonIds || []).includes(h) && !(detectMultipleHendersonTags(i.text) || []).includes(h)).forEach(h => {
          const text = String(i.text).normalize('NFKC');
          const runs = (text.match(/[一-龥ァ-ヶー]{2,8}/g) || []).filter(r => !IMPROVEMENT_STOP_WORDS.test(r));
          const keyword = runs.sort((a, b) => b.length - a.length)[0];
          if (!keyword) return;
          if (isBuiltInKeywordOf(h, keyword) || rules.some(r => r.keyword === keyword && r.hendersonIds.includes(h))) return;
          const key = `${h}:${keyword}`;
          const cur = byKey.get(key) || { keyword, hendersonId: h, count: 0, example: text.slice(0, 40) };
          cur.count++; byKey.set(key, cur);
        });
      });
      // A keyword whose tag the user also removed from a card containing it is contested and is never proposed.
      return Array.from(byKey.values()).filter(pr => !items.some(i => String(i.text).normalize('NFKC').includes(pr.keyword) && (i.editLog || []).some(e => e && e.kind === 'tagRemove' && Number(e.hId) === pr.hendersonId))).slice(0, 10);
    }
    // Knowledge requests: the app inspects where its own rules fall short for this patient and asks the user for the missing medical knowledge.
    // Only medical terms are listed (never whole patient sentences, names or dates).
    const KR_STOP = /^(?:患者|本人|状況|入院|退院|現在|以前|普段|最近|記録|様子|自分|家族|今日|昨日|明日|病院|病棟|看護師|医師|午前|午後|生活|仕事|必要|確認|予定|女性|男性|長女|次女|長男|次男|三男|三女|母親|父親|両親|息子|友達|友人|先生|一人|先週|今週|来週|夜中|自宅|学校|準備|大丈夫|返答|心配|希望|気分|笑顔|問題|完全|往復|回診|安静時|帰室時|外来|診療科|担当医|備考)$/;
    // Fragments cut out of a verb/time phrase ("毎日飲", "分後") and timing words are not medical terms.
    const KR_STOP_SHAPE = /^(?:毎日|毎回|毎朝|毎晩|先週|今週|来週|数日|何日|日内|分後|時間後|日後|週間)|(?:時|頃|ごろ)$/;
    // Lab-table vocabulary (item names, table headings, units) is handled by the lab tools, not by knowledge requests.
    const KR_LAB_VOCAB = /^(?:項目名|基準値|単位|結果|定性|定量|白血球|赤血球|血小板|血色素|網状赤血球|ヘマトクリット|ヘモグロビン|ダイマー|コレステロール|中性脂肪|ビリルビン|グロブリン|アルブミン|アミラーゼ|コリンエステラーゼ|ウロビリノーゲン|クレアチニン|ナトリウム|カリウム|クロール|カルシウム|マグネシウム|無機リン|フィブリノゲン|プロトロンビン|グルコース|尿素窒素|尿酸|総蛋白|蛋白定性|比重|潜血反応)(?:数|量|値)?$|(?:定性|定量|基準値|検査値|検査結果|検査センター)$/;
    const KR_NON_DRUG = /^(?:ビール|ワイン|ウイスキー|焼酎|コーヒー|ジュース|コーラ|ミルク|ヨーグルト|アイス|ダイマー)$/;
    const KR_HONORIFIC = '(?:様|さん|殿|氏)';
    // Person names on a labelled line ("氏名 ヤマモト ヒカル 様") or a bare "family given 様" line: the whole value and each token.
    function krNames(cp) {
      const values = [];
      const fromLine = l => {
        const t = String(l || '').normalize('NFKC').trim();
        const lab = t.match(/^(?:氏名|名前|患者名|お名前|ふりがな|フリガナ)\s*[:：]?\s*(.+)$/);
        if (lab) { values.push(lab[1]); return; }
        const bare = t.match(new RegExp(`^([^\\s\\d、。:：「」]{1,10}[\\s　][^\\s\\d、。:：「」]{1,10})\\s*${KR_HONORIFIC}$`));
        if (bare) values.push(bare[1]);
      };
      String((cp && cp.sourceText) || '').split(/\r?\n/).forEach(fromLine);
      ((cp && cp.items) || []).forEach(i => { if (i && i.text) { fromLine(i.text); if (/^氏名$/.test(i.fieldLabel || '')) values.push(String(i.text)); } });
      const names = new Set();
      values.forEach(v => {
        const clean = String(v).normalize('NFKC').replace(new RegExp(`\\s*${KR_HONORIFIC}$`), '').trim();
        if (clean.length >= 2) names.add(clean);
        clean.split(/[\s　・]+/).forEach(tok => { if (tok.length >= 2) names.add(tok); });
      });
      return Array.from(names).sort((a, b) => b.length - a.length);
    }
    // A word is worth a knowledge request only if it is a medical term: a known disease/symptom/drug/test/plan-knowledge entry,
    // or shaped like one (disease, symptom, procedure, drug-form endings). Plain nouns, body parts and feeling words are not.
    const KR_MEDICAL_SHAPE = /(?:症|炎|痛|障害|不全|腫|癌|がん|病|疹|熱|血|圧|麻痺|浮腫|出血|閉塞|梗塞|狭窄|潰瘍|術|錠|薬|療法|検査|麻酔|注射|吐|嘔|咳|痰|便秘|下痢|黄疸|脱水|褥瘡|感染|発作|ショック|低下|異常|徐放|カプセル|ドレーン|カテーテル|ストーマ|症候群)$/;
    function krIsMedicalTerm(term) {
      const t = String(term || '').normalize('NFKC');
      if (KR_MEDICAL_SHAPE.test(t)) return true;
      if (typeof DIAGNOSIS_TAG_HINTS !== 'undefined' && DIAGNOSIS_TAG_HINTS.some(h => h.pattern.test(t))) return true;
      if (typeof DISEASE_SYMPTOM_NEEDS !== 'undefined' && DISEASE_SYMPTOM_NEEDS.some(([re]) => re.test(t))) return true;
      if (typeof RM_BRIDGE_RULES !== 'undefined' && RM_BRIDGE_RULES.some(r => r.s.test(t) || r.t.test(t))) return true;
      if (cpKnowledgeRowsFor(t).length) return true;
      if (typeof findDrugsInText === 'function' && findDrugsInText(t).length) return true;
      return typeof mentionsLabItemName === 'function' && mentionsLabItemName(t);
    }
    function krTerms(text) {
      return Array.from(new Set((String(text || '').normalize('NFKC').match(/[一-龥ァ-ヶー]{2,12}/g) || []).filter(t => !KR_STOP.test(t) && !KR_STOP_SHAPE.test(t) && !KR_LAB_VOCAB.test(t))));
    }
    // De-identified context so an AI answering the request can see how a term was used, without names or dates.
    function krDeidentify(text, cp, limit) {
      let t = String(text || '').normalize('NFKC');
      // Names: whole labelled value (family and given name with a space, honorific) and every name token, wherever they appear.
      t = t.replace(new RegExp(`(氏名|名前|患者名|お名前|ふりがな|フリガナ)\\s*[:：]?[ \\t　]*[^\\n]*`, 'g'), '$1: (患者)');
      krNames(cp).forEach(n => { t = t.split(n).join('(患者)'); });
      t = t.replace(new RegExp(`\\(患者\\)(?:[ \\t　]*\\(患者\\))*[ \\t　]*${KR_HONORIFIC}?`, 'g'), '(患者)');
      // A kanji name just before an age ("山田 26歳"); sex words are not names.
      t = t.replace(/(^|[\s　:：])(?!男性|女性|男児|女児)[一-龥]{2,4}(?=[\s　]*\d{1,3}\s*(?:歳|才))/g, '$1(患者)');
      return t.replace(/(?:19|20)\d{2}[\/年.-]\d{1,2}(?:[\/月.-]\d{1,2}日?)?|'?\d{2}\/\d{1,2}\/\d{1,2}|\d{1,2}月\d{1,2}日|\d{1,2}\/\d{1,2}/g, '(日付)')
        .replace(/[一-龥]{1,4}(?:さん|様|氏)/g, '(人物)').replace(/\d{2,4}-\d{2,4}-\d{3,4}/g, '(番号)').slice(0, limit || 160);
    }
    // The record as it was before classification, de-identified, so an outside AI can see the real context.
    function krSourceText(cp) {
      const raw = String((cp && cp.sourceText) || '').trim() || ((cp && cp.items) || []).filter(i => i && !i.deleted && !i.diseaseGeneral && i.text).map(i => i.text).join('\n');
      // Document header/footer lines (institution, staff and signer names, ids, report dates) carry no clinical context and can identify people.
      const kept = raw.split('\n').filter(l => !(typeof isReportMetadataLine === 'function' && isReportMetadataLine(l.trim())) && !/(?:責任者|担当医|主治医|検査技師|報告者|記載者|執刀医|検査者)/.test(l)).join('\n');
      return kept ? krDeidentify(kept, cp, 6000) : '';
    }
    function krPatientSummary(cp) {
      const items = ((cp && cp.items) || []).filter(i => i && !i.deleted && i.text);
      const idLine = items.map(i => String(i.text).normalize('NFKC')).find(t => /\d{1,3}歳/.test(t)) || '';
      const age = (idLine.match(/(\d{1,3})歳/) || [])[1];
      const sex = /女性|女/.test(idLine) ? '女性' : /男性|男/.test(idLine) ? '男性' : '';
      const dx = items.filter(i => /^(?:診断|診断名|病名)$/.test(i.fieldLabel || '')).map(i => String(i.text).replace(/^[^:：]{1,6}[:：]\s*/, '')).join('、');
      return `${age ? `${Math.floor(Number(age) / 10) * 10}代` : '年代不明'}${sex ? `・${sex}` : ''}${dx ? `／診断: ${dx}` : ''}`;
    }
    // How much the app already knows about a term: tag hints, relation-map mechanisms and symptom-need rows that touch it. Very little is treated like nothing.
    const KR_THIN = 2;
    function krCoverage(term) {
      const t = String(term || '').normalize('NFKC');
      const hints = typeof DIAGNOSIS_TAG_HINTS !== 'undefined' ? DIAGNOSIS_TAG_HINTS.filter(h => h.pattern.test(t)).length : 0;
      const bridges = typeof RM_BRIDGE_RULES !== 'undefined' ? RM_BRIDGE_RULES.filter(r => r.s.test(t) || r.t.test(t)).length : 0;
      const symptoms = typeof DISEASE_SYMPTOM_NEEDS !== 'undefined' ? DISEASE_SYMPTOM_NEEDS.filter(([re]) => re.test(t)).length : 0;
      const plans = cpKnowledgeRowsFor(t).length;
      return { hints, bridges, symptoms, plans, total: hints + bridges + symptoms + plans };
    }
    function buildKnowledgeRequests(cp) {
      const all = ((cp && cp.items) || []).filter(i => i && !i.deleted && i.text);
      const items = all.filter(i => !(typeof isPatientIdentityLine === 'function' && isPatientIdentityLine(i.text)) && !/^(?:氏名|年齢|性別)$/.test(i.fieldLabel || '') &&
        !(typeof isReportMetadataLine === 'function' && isReportMetadataLine(i.text)) && !(typeof isBareHonorificName === 'function' && isBareHonorificName(i.text)));
      const reqs = [], byKey = new Map();
      const ctxOf = i => { const k = items.indexOf(i); return items.slice(Math.max(0, k - 1), k + 2).filter(x => x.type !== 'unnecessary').map(x => krDeidentify(x.text, cp)); };
      const pnames = krNames(cp);
      const add = (purpose, kind, term, question, context = []) => {
        if (pnames.some(n => term.includes(n) || n.includes(term))) return;
        const key = `${kind}|${term}`;
        const cur = byKey.get(key);
        if (cur) { cur.count++; context.forEach(c => { if (cur.context.length < 3 && !cur.context.includes(c)) cur.context.push(c); }); return; }
        const r = { key, purpose, kind, term, question, context: context.slice(0, 3), count: 1 };
        byKey.set(key, r); reqs.push(r);
      };
      const mapText = cp && cp.relationMap && Array.isArray(cp.relationMap.nodes) ? cp.relationMap.nodes.map(n => `${n.label || ''} ${n.text || ''}`).join('\n').normalize('NFKC') : '';
      const plans = typeof carePlanList === 'function' ? carePlanList(cp || {}) : [];
      // Tagging: words no rule could tag, and disease-list symptoms without a need.
      items.filter(i => i.type !== 'unnecessary' && !(i.hendersonIds || []).length && !i.tagNotNeeded && !(typeof isBasicInfoItem === 'function' && isBasicInfoItem(i)))
        .forEach(i => krTerms(i.text).filter(t => !(detectMultipleHendersonTags(t) || []).length && (i.diseaseGeneral || krIsMedicalTerm(t))).slice(0, 2)
          .forEach(t => add('tag', i.diseaseGeneral ? 'symptom' : 'term', t, `「${t}」は看護でどんな意味がありますか？ ヘンダーソンの14項目のどれに関係しますか（番号と理由）？ 観察すべき点も教えてください。`, ctxOf(i))));
      // Words that are not standard terms: reported with their context for human review, never replaced.
      items.forEach(i => krUnknownTerms(i.text).forEach(u => add('tag', 'unknown_term', u.term, `「${u.term}」は標準用語として特定できません。${u.reason}（前後の文脈：原文を確認し、意味を教えてください）`, ctxOf(i))));
      // Diagnoses: what the rules, care plan and relation map need to know about each one.
      const dxList = [];
      items.filter(i => /^(?:診断|診断名|病名|既往歴)$/.test(i.fieldLabel || '')).forEach(i => String(i.text).normalize('NFKC').replace(/^[^:：]{1,6}[:：]\s*/, '').split(/[、,・\/]/).map(x => x.replace(/[()（）].*$/, '').replace(/^\d{1,3}歳\s*/, '').trim()).filter(x => x.length >= 2 && x.length <= 20 && !/(?:なし|無し|ない|あり|中|ため|いる|ます|です)$/.test(x) && !/指摘|されて|していた|ている|^[のにをがはで]|を.|たが$|が$/.test(x)).forEach(d => dxList.push({ d, i })));
      dxList.forEach(({ d, i }) => {
        const cov = krCoverage(d);
        if (cov.hints > 0 && cov.total <= KR_THIN) add('tag', 'thin-diagnosis', d, `「${d}」について登録済みの知識が少なめです（項目の目安 ${cov.hints}件・関連図の仕組み ${cov.bridges}件・症状の対応 ${cov.symptoms}件）。看護で注目する項目、典型的な症状・合併症・治療とその副作用、関連図でつなげる仕組みを補ってください。`, ctxOf(i));
        if (!DIAGNOSIS_TAG_HINTS.some(h => h.pattern.test(d))) add('tag', 'diagnosis', d, `「${d}」で看護が注目する14項目（番号）と、よく見られる症状・検査所見を教えてください。`, ctxOf(i));
        if (mapText && !mapText.includes(d.slice(0, 4))) add('map', 'map-diagnosis', d, `関連図に「${d}」がありません。この疾患の病態（原因→体の変化→症状）と、起こりうる合併症・看護問題へのつながりを教えてください。`, ctxOf(i));
      });
      // Drugs on the record: known drugs missing from the relation map; unknown drug-like words.
      items.forEach(i => {
        const found = typeof findDrugsInText === 'function' ? findDrugsInText(i.text) : [];
        found.forEach(({ drug, term }) => { if (mapText && !mapText.includes(term)) add('map', 'map-drug', term, `「${term}」（${drug.name || drug.id || '薬剤'}）の作用・主な副作用と、関連図・看護計画で観察すべきことを教えてください。`, ctxOf(i)); });
        (String(i.text).normalize('NFKC').match(/[ァ-ヶー]{3,12}(?=\s*(?:錠|カプセル|散|注|\d+(?:\.\d+)?\s*(?:mg|g|mL|μg|単位)))/g) || [])
          .filter(t => !found.some(f => f.term.includes(t) || t.includes(f.term)) && !KR_NON_DRUG.test(t) && !KR_LAB_VOCAB.test(t) && !(typeof mentionsLabItemName === 'function' && mentionsLabItemName(i.text)))
          .forEach(t => add('map', 'drug', t, `薬剤「${t}」は何の薬ですか？ 作用・主な副作用・看護で観察することを教えてください。`, ctxOf(i)));
      });
      // Relation map: nursing problems whose reasoning chain is too short.
      if (cp && cp.relationMap && typeof rmChainReport === 'function') {
        try { rmChainReport(cp.relationMap).filter(r => r.kind === 'short').forEach(r => add('map', 'mechanism', String(r.label).replace(/^#\s*[\d?？]*[.．:：]?\s*/, ''), `看護問題「${String(r.label).replace(/^#\s*[\d?？]*[.．:：]?\s*/, '')}」はどんな原因から、どんな仕組みで起こりますか（原因→途中の変化→結果）？ この患者で確認すべき情報も教えてください。`, [krPatientSummary(cp)])); } catch (e) {  }
      }
      // Care plans: problems without a plan, and plans with an empty OP/TP/EP section.
      if (cp && cp.relationMap && Array.isArray(cp.relationMap.nodes)) {
        cp.relationMap.nodes.filter(n => n.type === 'nursing_problem').forEach(n => {
          const label = String(n.label || '').trim();
          if (label && !cpKnowledgeRowsFor(label).length && !plans.some(p => String(p.problem || '').includes(label.slice(0, 6)))) add('plan', 'plan-missing', label, `看護問題「${label}」の看護計画を立てるために、目標の目安と、OP（観察）・TP（援助）・EP（教育）の要点を教えてください。`, [krPatientSummary(cp)]);
        });
      }
      if (cp && cp.relationMap && Array.isArray(cp.relationMap.nodes) && typeof RM_BRIDGE_RULES !== 'undefined') {
        cp.relationMap.nodes.filter(n => n.type === 'nursing_problem').forEach(n => {
          const label = String(n.label || '').trim();
          if (label && RM_BRIDGE_RULES.filter(r => r.t.test(label)).length <= 1) add('map', 'thin-problem', label, `看護問題「${label}」につながる原因や途中の仕組みの知識が少なめです。原因→途中の変化→結果の流れと、関連図に足すべき要因（疾患・薬・生活）を教えてください。`, [krPatientSummary(cp)]);
        });
      }
      plans.forEach(p => {
        const empty = CARE_PLAN_SECTIONS.filter(sec => !(p[sec.key] || []).length).map(sec => sec.short);
        if (p.problem && empty.length && !cpKnowledgeRowsFor(p.problem).length) add('plan', 'plan-section', p.problem, `看護計画「${p.problem}」の ${empty.join('・')} が空です。この問題で一般的に行う内容と、その根拠を教えてください。`, [krPatientSummary(cp)]);
      });
      const order = { tag: 0, plan: 1, map: 2 };
      return reqs.sort((a, b) => order[a.purpose] - order[b.purpose] || b.count - a.count).slice(0, 50);
    }
    // One entry per term: several kinds of need for the same term are merged into a single compact line so the file stays short.
    const KR_ASPECT = { term: '14項目のどれに関係するか（番号・理由）と観察点', symptom: '14項目のどれに関係するか（番号・理由）と観察点', diagnosis: '注目する14項目・典型症状・検査所見', 'thin-diagnosis': '登録済みの知識を補う：注目項目・合併症・治療と副作用', 'map-diagnosis': '病態（原因→体の変化→症状）・合併症・看護問題への流れ', 'map-drug': '作用・主な副作用・観察点', drug: '薬の種類・作用・主な副作用・観察点', mechanism: '原因→途中の変化→結果、患者で確認すべき情報', 'thin-problem': '原因→途中の変化→結果、関連図に足す要因', 'plan-missing': '目標の目安とOP・TP・EPの要点', unknown_term: '標準用語として特定できない語（置き換えず、原文と前後の文脈を人が確認）' };
    function krAspect(r) {
      if (r.kind === 'plan-section') { const m = /の ([OPTE・]+) が空/.exec(r.question); return `${m ? m[1] : ''}が空：一般的な内容と根拠`; }
      return KR_ASPECT[r.kind] || '看護での意味と観察点';
    }
    function knowledgeRequestText(cp, reqs) {
      const label = { tag: 'タグ付け・分類', plan: '看護計画', map: '関連図' };
      const groups = new Map();
      reqs.forEach(r => {
        const g = groups.get(r.term) || { term: r.term, purpose: r.purpose, aspects: [], context: [], count: 0 };
        if (({ tag: 0, plan: 1, map: 2 })[r.purpose] < ({ tag: 0, plan: 1, map: 2 })[g.purpose]) g.purpose = r.purpose;
        const asp = krAspect(r);
        if (!g.aspects.includes(asp)) g.aspects.push(asp);
        r.context.forEach(c => { const short = c.slice(0, 70); if (g.context.length < 2 && !g.context.includes(short)) g.context.push(short); });
        g.count += r.count;
        groups.set(r.term, g);
      });
      let out = `知識リクエスト：${cp && cp.title || ''}（${new Date().toLocaleDateString('ja-JP')}）\n`;
      out += '[Purpose] This is a research request to raise the quality of a Japanese nursing-assessment support website as a whole. The topics below are only points where the site could not decide by its own rules (or held very little knowledge); they were found in one case. Do NOT answer for that case alone: collect general nursing and medical knowledge that applies to any patient.\n';
      out += `[Trigger case, as an example only] ${krPatientSummary(cp)}. No personal information is included.\n`;
      out += '[How to research] For each topic, also look at its surroundings (same disease group, same symptom group, related drugs and lab tests, commonly co-occurring problems). If you find knowledge useful to the site that was not requested, add it, with one line on why you thought it was needed (なぜ必要と考えたか).\n';
      out += '[Sources] Prefer textbooks (title, edition, page) and official guidelines (name, year). Mark anything you cannot verify as 未確認 but still include it; missing sources are not a reason to leave something out.\n';
      out += '[Language] Write the answers in Japanese. Keep nursing terms as they are (看護問題, ヘンダーソンの14項目, OP/TP/EP).\n';
      out += '[Answer format] Use exactly this template, once per topic, in the same order as the topic list. Be concise; do not pad.\n';
      out += '  Topic: 「term」\n';
      out += '  1. 内容: 1-3 sentences, general facts only.\n';
      out += '  2. ヘンダーソン14項目: item numbers with a short reason for each.\n';
      out += '  3. 因果: cause → intermediate change → result (only if known).\n';
      out += '  4. 看護: OP (observe) / TP (care) / EP (educate), a few short points each.\n';
      out += '  5. 出典: title, edition, page / guideline name, year.\n';
      out += '  6. 範囲: conditions or exceptions where it does not apply.\n';
      out += '  Write 不明 where unknown. Never fill gaps with guesses. Put added topics last, under the heading 追加提案.\n';
      const src = krSourceText(cp);
      if (src) out += `\n[Original record before classification (names and dates masked)]\nUse it only to understand the context of the topics; do not answer about this patient.\n\n${src}\n`;
      out += '\n[Topics] 記録 shows how the term was used in the record (names and dates masked).\n';
      let n = 0;
      Object.keys(label).forEach(k => {
        const list = Array.from(groups.values()).filter(g => g.purpose === k).slice(0, 30);
        if (!list.length) return;
        out += `\n【${label[k]}】\n`;
        list.forEach(g => {
          out += `${++n}. 「${g.term}」${g.count > 1 ? `（${g.count}か所）` : ''}：${g.aspects.join(' ／ ')}\n`;
          if (g.context.length) out += `   記録: ${g.context.join(' | ')}\n`;
        });
      });
      return out;
    }
    function patientOwnText(cp) {
      const items = ((cp && cp.items) || []).filter(i => i && !i.deleted && !i.diseaseGeneral && i.text).map(i => i.text);
      const notes = ((cp && cp.referenceNotes) || []).map(n => `${n.title || ''}\n${n.text || ''}`);
      return [String((cp && cp.sourceText) || ''), ...items, ...notes].join('\n').normalize('NFKC');
    }
    function foreignTermsInText(cp, text) {
      const own = patientOwnText(cp);
      const body = String(text || '').replace(/<[^>]*>/g, ' ').normalize('NFKC');
      return GEN_FOREIGN_TERMS.filter(([re]) => re.test(body) && !re.test(own)).map(([, name]) => name);
    }
    // Start a generation for a patient. The ticket pins patient ID and source revision at request time.
    function beginGeneration(cp, step) {
      return { patientId: cp.id, sourceRev: sourceRevisionOf(cp), step: String(step || ''), startedAt: new Date().toISOString() };
    }
    // Commit a (possibly late) response. It is written only to the patient that requested it, only if that patient's
    // source is unchanged, and never to whichever patient happens to be current.
    function commitGeneratedResult(ticket, field, value) {
      const patients = (typeof globalAppData !== 'undefined' && globalAppData.patients) || [];
      const target = ticket && patients.find(p => p.id === ticket.patientId);
      if (!target) return { ok: false, reason: 'patient-missing', message: '生成を依頼した患者が見つからないため、結果を保存しませんでした' };
      if (sourceRevisionOf(target) !== ticket.sourceRev) return { ok: false, reason: 'source-changed', message: '生成中に元の記録が変わったため、結果を保存しませんでした。もう一度生成してください' };
      const foreign = foreignTermsInText(target, value);
      if (foreign.length >= 2) return { ok: false, reason: 'foreign-terms', message: 'この患者の記録にない内容が含まれるため、結果を保存しませんでした' };
      target[field] = value;
      if (!target.generatedMeta || typeof target.generatedMeta !== 'object') target.generatedMeta = {};
      target.generatedMeta[field] = { patientId: target.id, sourceRev: ticket.sourceRev, at: new Date().toISOString() };
      return { ok: true };
    }
    // Status of one stored generated result for the patient being shown or exported.
    function generatedResultStatus(cp, field) {
      const value = cp && cp[field];
      if (!value || (typeof value === 'string' && !value.trim())) return { ok: false, empty: true };
      const meta = cp.generatedMeta && cp.generatedMeta[field];
      if (meta) {
        if (meta.patientId !== cp.id) return { ok: false, reason: 'patient-mismatch', message: '別の患者向けに作られた結果です' };
        if (meta.sourceRev !== sourceRevisionOf(cp)) return { ok: false, reason: 'source-changed', message: '作成後に元の記録が変わっています' };
      }
      const foreign = foreignTermsInText(cp, typeof value === 'string' ? value : JSON.stringify(value));
      if (foreign.length >= 2) return { ok: false, reason: 'foreign-terms', message: 'この患者の記録にない内容が含まれています', terms: foreign };
      return { ok: true, unbound: !meta };
    }
    function activeGeneratedResult(cp, field) {
      const st = generatedResultStatus(cp, field);
      return st.ok ? cp[field] : '';
    }
    function quarantinedGeneratedResults(cp) {
      return GENERATED_RESULT_FIELDS.map(f => ({ ...f, status: generatedResultStatus(cp, f.key) })).filter(f => !f.status.ok && !f.status.empty);
    }
    function quarantineNoticeText(cp) {
      const q = quarantinedGeneratedResults(cp);
      return q.length ? `※患者の記録と合わない生成結果（${q.map(f => `${f.label}：${f.status.message}`).join('／')}）は、再生成するまで出力から除外しました。元の記録と手編集は変更していません。` : '';
    }
    // Diagnosis candidates: keep only candidates whose name/evidence do not rely on another patient's findings.
    function activeDiagnosisCandidates(cp) {
      return ((cp && cp.diagnosisCandidates) || []).filter(c => foreignTermsInText(cp, [c && c.name, c && c.reason, ...(Array.isArray(c && c.evidence) ? c.evidence : [c && c.evidence])].join('\n')).length < 2);
    }
    // A care plan is active unless it is bound to a different patient or relies on findings absent from this patient's records.
    function carePlanProvenance(cp, plan) {
      if (plan && plan.patientId && plan.patientId !== cp.id) return { ok: false, message: '別の患者の看護計画です' };
      const foreign = cpForeignTermsAny(cp, plan);
      if (foreign.length >= 2) return { ok: false, message: 'この患者の記録にない内容が含まれています' };
      return { ok: true };
    }
    function cpForeignTermsAny(cp, plan) {
      const body = [plan.problem, plan.goalLong, plan.goalShort, ...(plan.op || []), ...(plan.tp || []), ...(plan.ep || []), ...(plan.evidence || []), ...(plan.reasons || []).map(r => r && r.text)].join('\n');
      return foreignTermsInText(cp, body);
    }

    function cpResolvePlanId(cp, id) {
      let cur = id, n = 0;
      while (cp.carePlans && cp.carePlans[cur] && cp.carePlans[cur].deleted && cp.carePlans[cur].mergedInto && n++ < 5) cur = cp.carePlans[cur].mergedInto;
      return getCarePlan(cp, cur) ? cur : null;
    }
    function cpSanitizeRefs(cp) {
      const list = carePlanList(cp);
      let removed = 0;
      list.forEach(p => {
        const refs = [];
        (p.refs || []).forEach(r => {
          const id = r && cpResolvePlanId(cp, r.id);
          if (!id || id === p.id || !String(r.why || '').trim()) { removed++; return; }
          if (!refs.some(x => x.id === id)) refs.push({ id, why: r.why });
        });
        p.refs = refs;

        ['op', 'tp', 'ep'].forEach(f => {
          p[f] = p[f].map(line => line.replace(/[（(][^（）()]*「([^」]+)」の計画[^（）()]*[）)]/g, (m, name) => {
            const key = cpNorm(name).replace(/\s/g, '');
            const ok = list.some(q => q.id !== p.id && (cpNorm(q.problem).replace(/\s/g, '').includes(key) || key.includes(cpNorm(q.problem).replace(/\s/g, '').replace(/リスク状態$/, ''))));
            if (!ok) removed++;
            return ok ? m : '';
          }).trim());
        });
      });
      return removed;
    }

    function cpLinkRelatedPlans(cp) {
      const list = carePlanList(cp);
      const gluPlan = list.find(p => (cpDomainOf(p) || {}).key === 'glu');
      const anx = list.find(p => (cpDomainOf(p) || {}).key === 'anx');
      if (gluPlan && anx && /低血糖/.test(cpEvidenceTexts(cp).all) && !(anx.refs || []).some(r => r.id === gluPlan.id)) anx.refs = [...(anx.refs || []), { id: gluPlan.id, why: '低血糖が起きたときの対処手順の説明は、この計画で行う' }];
    }

    const CP_PLACEHOLDER = /患者の状態に合わせて|を和らげる援助|(?:状態|様子)を観察する。?$|経過を(?:見る|みる)。?$|検査値を確認する。?$|(?:状態|経過)を確認する。?$|数日以内に/;
    function cpModelOrFallback(cp, p) {
      let m = reviewCarePlan(cp, p).model;
      const dm = !m && cpDomainOf(p);
      if (dm && dm.op) {
        const c0 = cpRecordContext(cp);
        const topic = dm.op[0]?.[0] || p.problem;
        const care = (cp.items || []).find(i => !i.deleted && i.type === 'o' && dm.words.test(i.text || '') && /介助|見守|清拭|更衣|練習|ケア.*実施/.test(i.text || '') && !/明日|予定|禁止|中止|抜去|OFF/.test(i.text || ''));
        m = { goalLong: '', goalShort: dm.goal ? dm.goal(c0) : '', op: dm.op.slice(0, 5).map(([l]) => `${l}を観察する`),
          tp: [care ? `現在の指示・制限を確認して、記録にある「${care.text}」の援助を行い、実施前後の症状・反応を記録する` : `「${p.problem}」で援助を必要とする場面と本人の希望を確認し、現在の治療・活動上の制限を担当看護師と照合して、本日行う援助の手順・タイミングを決める`, `「${topic}」の変化があったときは、本人の訴えと観察内容を担当看護師に共有し、対応後の反応を確認する`],
          ep: [`「${topic}」について気になる変化があれば看護師に伝えることを説明し、いつ・どのように知らせるか本人の言葉で確認する`, '実施する援助の目的と現在の注意点を説明し、本人・家族に自分の言葉で言い返してもらい、不明な点を確認する'],
          fallback: true };
      }
      if (cpIsRisk(p)) { const g = cpRiskGoalFor(p, cpRecordContext(cp)); m = { goalLong: g.long, goalShort: g.short, op: (m && m.op) || [], tp: (m && m.tp) || [], ep: (m && m.ep) || [] }; }
      return m;
    }

    function regenerateCarePlanSections(cp, plan) {
      const m = cpModelOrFallback(cp, plan);
      plan.goalLong = (m && m.goalLong) || ''; plan.goalShort = (m && m.goalShort) || '';
      ['op', 'tp', 'ep'].forEach(k => { plan[k] = m && m[k] ? [...m[k]] : []; });
      plan.genKey = cpPlanKey(plan);
      plan.userEdited = false;
      plan.updatedAt = new Date().toISOString();
      return plan;
    }

    const CP_ACTUAL_MARKERS = { nutr: /毎食7割以上/, act: /活動耐性|病棟のトイレまで歩け|休憩を入れながら/, ileus: /排ガスがあり、腹部膨満・嘔吐が見られない/ };
    function cpPlanIncoherent(plan) {
      const body = cpNorm([plan.goalLong, plan.goalShort, ...plan.op, ...plan.tp, ...plan.ep].join('\n'));
      const dom = cpDomainOf(plan);
      if (cpIsRisk(plan) && dom && CP_ACTUAL_MARKERS[dom.key] && CP_ACTUAL_MARKERS[dom.key].test(body)) return true;
      if (cpIsRisk(plan) && /(?:リスク(?:状態)?|おそれ)が?(?:改善|軽減|解消)|(?:観察|検査|記録)の?値が?改善に向かう|欲求が自分で満たせる/.test(body)) return true;
      if (CP_PLACEHOLDER.test(body)) return true;
      if (plan.genKey && plan.genKey !== cpPlanKey(plan)) return true;
      return false;
    }

    function cpRecSnip(cp, re, max = 36, skipRe = null) {
      const items = ((cp && cp.items) || []).filter(i => i && !i.deleted && !i.aiSuggested && !i.diseaseGeneral && i.text && i.type !== 'unnecessary');
      for (const i of items) {
        if (skipRe && skipRe.test(`${i.fieldLabel || ''}${i.text}`)) continue;
        const t = cpNorm(i.text).replace(/\s+/g, ' ');
        const m = t.match(new RegExp('[^。\\n、「」]{0,' + Math.floor(max / 2) + '}(?:' + re.source + ')[^。\\n、「」]{0,' + Math.floor(max / 2) + '}'));
        if (m) return m[0].trim();
      }
      return '';
    }
    function cpRiskEvidence(cp, plan) {
      const d = cpDomainOf(plan);
      if (!d) return [];
      const fam = /家族|祖父|祖母/;
      const S = (re, label, max) => { const t = cpRecSnip(cp, re, max || 36, fam); return t ? `${label}：${t}` : ''; };
      let list = [];
      if (d.key === 'ileus') list = [S(/胃(?:全摘|切除|亜全摘)[^\s。]{0,16}|(?:開腹|腹腔鏡下)[^\s。、]{0,14}(?:術|切除)/, '手術の内容', 44), S(/再建|R-?Y|吻合/, '再建・吻合'), S(/全身麻酔|挿管/, '麻酔'), S(/PCA|硬膜外|フェンタニル|モルヒネ|オピオイド|オキシコドン/, '術後の鎮痛（オピオイドなど）'), S(/床上安静|ベッド上安静|安静度/, '術後の活動の指示')];
      else if (d.key === 'inf') list = [S(/創部|手術創|ガーゼ|ドレッシング/, '手術創'), S(/ドレーン/, 'ドレーン（排液の経路）', 40), S(/点滴|CV|中心静脈|末梢ライン|ルート|硬膜外カテーテル/, '血管内・硬膜外のライン'), S(/膀胱留置|バルーン|尿道カテーテル/, '尿道カテーテル')];
      else if (d.key === 'nutr') list = [S(/体重[^。\n]{0,6}\d+(?:\.\d+)?\s*kg\s*(?:減|低下|減少)|\d+\s*(?:か月|ヶ月|週間?)[^。\n]{0,8}\d+(?:\.\d+)?\s*kg\s*(?:減|低下)/, '術前からの体重の変化', 40), S(/食習慣|間食|偏食|嗜好品?[^。\n]{0,4}(?:甘|菓子|間食)|食欲|食事[^。\n]{0,6}(?:回数|量|時間|不規則)/, '術前の食事の状況', 40), S(/絶飲食|絶食|NPO|禁食/, '術前後の絶飲食（指示。栄養不良の証拠ではない）')];
      else if (d.key === 'act') list = [S(/床上安静|ベッド上安静|安静度|臨時指示/, '指示された安静度', 40), S(/ADL[^。\n]{0,10}自立|自立[^。\n]{0,6}(?:歩行|生活)|仕事|家事|歩行|運動習慣/, '術前の活動レベル（ADL）', 40), S(/離床|術後\s*\d+\s*日目まで/, '離床の予定・期間', 36)];
      else if (d.key === 'resp') list = [S(/全身麻酔|挿管/, '麻酔'), S(/喫煙|タバコ/, '喫煙'), S(/浅い|浅呼吸/, '呼吸の様子'), S(/酸素/, '酸素'), S(/FEV1?|1秒率|呼吸機能/, '呼吸機能検査')];
      return list.filter(Boolean);
    }
    function cpApplyRiskEvidence(cp, plan) {
      if (!plan || plan.userEdited || plan.evRefined) return;
      const rk = cpRiskEvidence(cp, plan);
      if (!rk.length) return;
      const d = cpDomainOf(plan);
      const keep = (plan.evidence || []).filter(e => {
        const x = cpNorm(e);
        if (d && d.key === 'ileus' && /^創部痛/.test(x) && rk.length >= 2) return false;
        if (d && d.key === 'nutr' && /^身長/.test(x) && x.length > 36) return false;
        return true;
      }).map(e => /^(?:WBC|CRP|Alb|TP)\b/.test(cpNorm(e)) ? `参考：${e}（術後の影響を受けるため、単独では判断しない）` : e);
      const seen = new Set();
      plan.evidence = [...rk, ...keep].filter(e => { const k = cpNorm(e).replace(/\s+/g, ''); if (seen.has(k)) return false; seen.add(k); return true; });
      plan.evRefined = true;
    }

    function cpLineKey(t) {
      const x = cpNorm(t).replace(/[（(][^）)]*[）)]/g, '').replace(/\s+/g, '');
      return x;
    }
    function cpSimilar(a, b) {
      const ka = cpLineKey(a), kb = cpLineKey(b);
      if (!ka || !kb) return false;
      if (ka === kb || ka.includes(kb) || kb.includes(ka)) return true;

      const lab = /WBC|CRP|白血球|炎症反応/;
      if (lab.test(a) && lab.test(b) && /観察|推移|検査値|評価/.test(a) && /観察|推移|検査値|評価/.test(b)) return true;
      const bg = s => { const o = new Set(); for (let i = 0; i < s.length - 1; i++) o.add(s.slice(i, i + 2)); return o; };
      const A = bg(ka), B = bg(kb); let inter = 0; A.forEach(g => { if (B.has(g)) inter++; });
      return inter / Math.max(1, Math.min(A.size, B.size)) >= 0.8;
    }
    function cpDedupeLines(lines) {
      const out = [];
      (lines || []).forEach(l => {
        const k = out.findIndex(o => cpSimilar(o, l));
        if (k < 0) out.push(l);
        else if (cpNorm(l).length > cpNorm(out[k]).length) out[k] = l;
      });
      return out;
    }
    function cpDedupePlanLines(plan) {
      if (!plan || plan.userEdited) return 0;
      let n = 0;
      ['op', 'tp', 'ep'].forEach(k => { const a = plan[k] || []; const b = cpDedupeLines(a); if (b.length < a.length) { n += a.length - b.length; plan[k] = b; } });
      return n;
    }
    function refineCarePlans(cp) {
      const now = new Date().toISOString();
      const merged = mergeDuplicateCarePlans(cp, now);
      carePlanList(cp).forEach(p => { delete p.qa; if (!p.caseId && cp.id) p.caseId = cp.id; });
      carePlanList(cp).forEach(p => applyCarePlanValidation(cp, p));

      let regenerated = 0;
      carePlanList(cp).forEach(p => {
        const auto = ['rules', 'map', 'import', 'ai'].includes(p.source) && !p.userEdited;
        const empty = !p.goalShort && !p.goalLong && !p.op.length && !p.tp.length && !p.ep.length;
        if (auto && (cpPlanIncoherent(p) || (empty && p.validation && p.validation.kind === 'risk'))) { regenerateCarePlanSections(cp, p); regenerated++; }
        else if (auto && (!p.tp.length || !p.ep.length)) {
          const model = cpModelOrFallback(cp, p);
          if (model) ['tp', 'ep'].forEach(k => { if (!p[k].length && model[k]?.length) { p[k] = [...model[k]]; p.reasonNeeded = true; } });
        }
        else if (!p.genKey && (p.goalShort || p.op.length)) p.genKey = cpPlanKey(p);

        if (p.status === 'active' && !p.records.length && ['rules', 'map', 'import', 'ai'].includes(p.source)) p.status = 'planned';
      });
      carePlanList(cp).forEach(p => { if (['rules', 'map', 'import', 'ai'].includes(p.source)) { cpApplyRiskEvidence(cp, p); cpDedupePlanLines(p); } });
      cpLinkRelatedPlans(cp);
      const refsRemoved = cpSanitizeRefs(cp);
      cpExplainDistinct(cp);
      prioritizeCarePlans(cp);
      carePlanList(cp).forEach((p, n) => { p.order = n + 1; });
      return { merged, refsRemoved, regenerated };
    }

    function evaluateCarePlanFromRecords(plan) {
      const last = latestCareRecord(plan);
      if (!last) return { result: 'unevaluable', basis: '実施・評価の記録がないため、評価できません' };
      if (last.achievement) return { result: last.achievement, basis: `${formatMyDateTime(last.at)}の記録（${(CARE_ACHIEVEMENTS.find(a => a.key === last.achievement) || {}).label}）` };
      return { result: 'unevaluable', basis: '最新の記録に、目標の達成状況の評価がありません' };
    }

    function importCarePlansFromMap(cp, now = new Date().toISOString(), mapArg = null) {
      const map = mapArg || (typeof normalizeRelationMap === 'function' && cp.relationMap ? normalizeRelationMap(cp.relationMap) : null);
      if (!map) return [];
      const existing = new Set(carePlanList(cp).map(p => p.problem.replace(/\s+/g, '')));

      const existingCanon = new Set([...carePlanList(cp).map(p => cpPlanKey(p)), ...Object.values(cp.carePlans || {}).filter(p => p && p.deleted && p.canonKey).map(p => p.canonKey)]);
      const fresh = [];
      map.nodes.filter(n => n.type === 'nursing_problem').sort((a, b) => (a.priority || 99) - (b.priority || 99)).forEach(n => {
        const problem = String(n.label).replace(/（候補）$/, '').trim();
        const key = problem.replace(/\s+/g, '');
        if (!key || existing.has(key) || existingCanon.has(cpPlanKey({ problem }))) return;
        existing.add(key);
        const mapEvidenceRefs = typeof findRelationEvidence === 'function' ? findRelationEvidence(map, n.id, cp).sourceRefs : [];
        const plan = createCarePlan(cp, { caseId: cp.id || '', problem, evidence: cpMapEvidence(map, n), mapEvidenceRefs, note: n.note || '', source: 'map', reasonNeeded: true }, now);
        plan.relatedNeeds = guessPlanNeeds(plan);
        fresh.push(plan);
      });
      return fresh;
    }

    function buildCarePlansByRules(cp, { skipDeleted = false } = {}) {
      if (!(cp.items || []).some(i => i.type !== 'unnecessary')) return { fresh: [], withModel: 0, noCards: true };
      let map = cp.relationMap && typeof normalizeRelationMap === 'function' ? normalizeRelationMap(cp.relationMap) : null;
      if (!map || !map.nodes.some(n => n.type === 'nursing_problem')) map = typeof buildRelationMapFromRecord === 'function' ? buildRelationMapFromRecord(cp) : null;
      const deletedKeys = new Set(Object.values(cp.carePlans || {}).filter(p => p && p.deleted && p.problemKey).map(p => p.problemKey));
      if (map && skipDeleted && deletedKeys.size) map = { ...map, nodes: map.nodes.filter(n => n.type !== 'nursing_problem' || !deletedKeys.has(carePlanProblemKey(String(n.label).replace(/（候補）$/, '').trim()))) };
      const fresh0 = map ? importCarePlansFromMap(cp, new Date().toISOString(), map) : [];

      fresh0.forEach(p => applyCarePlanValidation(cp, p));
      mergeDuplicateCarePlans(cp);
      const fresh = fresh0.filter(p => getCarePlan(cp, p.id));
      let withModel = 0;
      fresh.forEach(p => {
        carePlanOpen.add(p.id);
        const m = cpModelOrFallback(cp, p);
        if (!m) return;
        const patch = {};
        if (!String(p.goalLong || '').trim()) patch.goalLong = m.goalLong;
        if (!String(p.goalShort || '').trim()) patch.goalShort = m.goalShort;
        ['op', 'tp', 'ep'].forEach(k => { if (!p[k].length && m[k] && m[k].length) patch[k] = [...m[k]]; });
        if (Object.keys(patch).length) { updateCarePlan(cp, p.id, { ...patch, reasonNeeded: true, source: 'rules' }); withModel++; }
      });
      refineCarePlans(cp);
      return { fresh, withModel };
    }

    function autoBuildCarePlans(cp, { notify = true } = {}) {
      if (!cp) return 0;
      const before = JSON.stringify(cp.carePlans || {});
      let r;
      try { r = buildCarePlansByRules(cp, { skipDeleted: true }); } catch (err) { console.warn('Care plan generation failed:', err); return 0; }
      if (!r.fresh.length) {

        try {
          refineCarePlans(cp);
          if (JSON.stringify(cp.carePlans || {}) !== before) commitCarePlanChange(cp, false);
        } catch (err) { console.warn('Care plan refinement failed:', err); }
        return 0;
      }
      commitCarePlanChange(cp, false);
      if (notify) showToast(`記録から看護計画を${r.fresh.length}件、自動で作りました。この患者に合うか確かめて、理由を書いて直してください。内容は「計画をチェック」で確かめられます`, 'success', 7000);
      return r.fresh.length;
    }
    window.buildCarePlansByRulesUI = function() {
      const cp = getCurrentPatient();
      const operationBefore = careOperationSnapshot(cp);
      if (!(cp.items || []).some(i => i.type !== 'unnecessary')) return showToast('カードがありません。先に「分類開始」で分類してください', 'warn');
      const { fresh, withModel } = buildCarePlansByRules(cp);
      if (!fresh.length) return showToast('作れる看護問題が記録から見つからないか、すべて看護計画にあります', 'info');
      rememberCareOperation(cp, operationBefore);
      commitCarePlanChange(cp);
      showToast(`看護計画を${fresh.length}件作りました（うち${withModel}件に目標・OP/TP/EPの手本を入れました）。この患者に合うか確かめて、理由を書いて直してください`, 'success', 7000);
    };
    window.importCarePlansFromMapUI = function() {
      const cp = getCurrentPatient();
      const operationBefore = careOperationSnapshot(cp);
      if (!cp.relationMap) return showToast('関連図がまだありません。「関連図」のページで作ってから取り込んでください', 'warn', 6000);
      const fresh = importCarePlansFromMap(cp);
      if (!fresh.length) return showToast('関連図の看護問題は、すべて看護計画にあります', 'info');
      fresh.forEach(p => carePlanOpen.add(p.id));
      rememberCareOperation(cp, operationBefore);
      commitCarePlanChange(cp);
      showToast(`関連図から看護問題を${fresh.length}件取り込みました（根拠データつき）。目標・OP/TP/EPはこの患者に合わせて書きましょう`, 'success', 6000);
    };

    async function askCareReason(title, suggestion) {
      const v = await openDialog({ title, message: `${suggestion ? `提案：${suggestion}\n\n` : ''}この患者に必要な理由を、記録のデータ（値・言葉・状態）を使って書いてください。書くと計画に入ります。`, inputValue: '', placeholder: '例：術後1日目で創部痛NRS6、痛みで深呼吸できていないため', confirmLabel: '理由を書いて使う' });
      if (v === null || v === undefined) return null;
      const t = String(v).trim();
      if (t.length < 6) { showToast('理由を、記録のデータを使って書いてください（短すぎます）', 'warn'); return null; }
      return t;
    }
    function addCareReason(p, text, about, now = new Date().toISOString()) {
      p.reasons = [...(Array.isArray(p.reasons) ? p.reasons : []), { text, about: about || '', at: now }].slice(-30);
      p.reasonNeeded = false;
      p.updatedAt = now;
    }
    window.writeCareReasonUI = async function(id) {
      const cp = getCurrentPatient();
      const operationBefore = careOperationSnapshot(cp);
      const p = getCarePlan(cp, id);
      if (!p) return;
      const t = await askCareReason(`「${p.problem || '（無題）'}」がこの患者に必要な理由`, '');
      if (!t) return;
      if (!careOperationStillCurrent(cp, operationBefore)) return;
      addCareReason(p, t, 'この看護問題');
      rememberCareOperation(cp, operationBefore);
      commitCarePlanChange(cp);
    };

    window.useGoalExampleUI = async function(id) {
      const cp = getCurrentPatient();
      const operationBefore = careOperationSnapshot(cp);
      const p = getCarePlan(cp, id);
      if (!p) return;
      const r = reviewCarePlan(cp, p);
      const ex = (r.items.find(i => i.key === 'goal') || {}).example || r.goalExample;
      const v = await openDialog({ title: '短期目標を書き直す', message: '例は、この患者の記録の値を使った「書き方の見本」です。そのまま使わず、期限・数値・患者の状態をこの患者に合わせて直してください。\n「いつまでに」「患者が」「どうなる」「何をもって達成と判断するか」', inputValue: ex, placeholder: '例：2日後までに、安静時の創部痛がNRS5からNRS3以下となり、苦痛なく休息できる', confirmLabel: '短期目標にする' });
      if (v === null || v === undefined || !String(v).trim()) return;
      let goalReason = '';
      if (String(v).trim() === ex) {
        const ok = await openDialog({ title: '例のままですが、よいですか？', message: '期限や数値が、この患者に合っているか確かめましたか？（例のまま使うときは、理由を書きます）', confirmLabel: '理由を書いて使う', secondaryLabel: '直す' });
        if (ok !== true) return;
        const why = await askCareReason('この目標にした理由', ex);
        if (!why) return;
        goalReason = why;
      }
      if (!careOperationStillCurrent(cp, operationBefore)) return;
      if (goalReason) addCareReason(p, goalReason, '短期目標');
      updateCarePlan(cp, id, { goalShort: String(v).trim() });
      rememberCareOperation(cp, operationBefore);
      commitCarePlanChange(cp);
      showToast('短期目標を書き直しました', 'success');
    };
    window.addMissingOpUI = async function(id, idx) {
      const cp = getCurrentPatient();
      const operationBefore = careOperationSnapshot(cp);
      const p = getCarePlan(cp, id);
      if (!p) return;
      const r = reviewCarePlan(cp, p);
      const label = ((r.items.find(i => i.key === 'op') || {}).add || [])[idx];
      if (!label) return;
      const why = await askCareReason('OPに足す理由', `${label}を観察する`);
      if (!why) return;
      if (!careOperationStillCurrent(cp, operationBefore)) return;
      updateCarePlan(cp, id, { op: [...p.op, `${label}を観察する`] });
      addCareReason(p, why, `OP：${label}`);
      rememberCareOperation(cp, operationBefore);
      commitCarePlanChange(cp);
    };

    window.applyCareModelUI = function(id) {
      const cp = getCurrentPatient();
      const operationBefore = careOperationSnapshot(cp);
      const p = getCarePlan(cp, id);
      if (!p) return;
      const m = reviewCarePlan(cp, p).model;
      if (!m) return;
      const patch = {};
      if (!String(p.goalLong || '').trim()) patch.goalLong = m.goalLong;
      if (!String(p.goalShort || '').trim()) patch.goalShort = m.goalShort;
      ['op', 'tp', 'ep'].forEach(k => { if (!p[k].length && m[k] && m[k].length) patch[k] = [...m[k]]; });
      if (!Object.keys(patch).length) return showToast('空欄がないので、手本は入れませんでした（書いてある内容はそのままです）', 'info');
      updateCarePlan(cp, id, { ...patch, reasonNeeded: true });
      rememberCareOperation(cp, operationBefore);
      commitCarePlanChange(cp);
      showToast('手本を空欄に入れました。この患者に合うか確かめて、直してください', 'success');
    };
    window.moveTpToOpUI = function(id, idx) {
      const cp = getCurrentPatient();
      const operationBefore = careOperationSnapshot(cp);
      const p = getCarePlan(cp, id);
      if (!p) return;
      const line = cpObservationLines(p.tp)[idx];
      if (!line) return;
      updateCarePlan(cp, id, { tp: p.tp.filter(l => l !== line), op: p.op.includes(line) ? p.op : [...p.op, line] });
      rememberCareOperation(cp, operationBefore);
      commitCarePlanChange(cp);
    };

    const carePlanReviewOpen = new Set();
    window.toggleCarePlanReview = function(id) {
      if (carePlanReviewOpen.has(id)) carePlanReviewOpen.delete(id); else carePlanReviewOpen.add(id);
      renderCarePlans();
    };
    function cpModelBlockHtml(m, title) {
      if (!m) return '';
      const list = (label, arr) => arr && arr.length ? `<div><b>${label}</b><ul>${arr.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul></div>` : '';
      const one = (label, t) => t ? `<div><b>${label}</b><p>${escapeHtml(t)}</p></div>` : '';
      return `<div class="cpr-model"><span><i class="fa-solid fa-book-open"></i> ${title}<small>この患者の記録を使った例です。そのまま写さず、この患者に合わせて直して使います</small></span>${one('長期目標', m.goalLong)}${one('短期目標', m.goalShort)}${list('OP（観察）', m.op)}${list('TP（援助）', m.tp)}${list('EP（教育）', m.ep)}</div>`;
    }
    function carePlanReviewHtml(cp, p) {
      const pid = safeDomId(p.id);
      const r = reviewCarePlan(cp, p);
      const icon = l => l === 'ok' ? '<i class="fa-solid fa-circle-check"></i>' : l === 'info' ? '<i class="fa-solid fa-circle-info"></i>' : '<i class="fa-solid fa-triangle-exclamation"></i>';
      const rows = r.items.map(it => {
        let extra = '';
        if (it.key === 'goal' && it.goal && !it.goal.empty) {
          const dot = (ok, l) => `<span class="cpr-dot${ok ? ' ok' : ''}">${ok ? '✓' : '—'} ${l}</span>`;
          extra += `<div class="cpr-goal4">${dot(it.goal.deadline, 'いつまでに')}${dot(it.goal.subject, '患者が')}${dot(it.goal.change, 'どうなる')}${dot(it.goal.measure, '達成の判断')}</div>`;
        }
        if (it.key === 'goal' && it.example) extra += `<div class="cpr-ex"><span>この患者の記録を使った目標の例</span><p>${escapeHtml(it.example)}</p><button type="button" class="my-asm-link" onclick="useGoalExampleUI('${pid}')"><i class="fa-solid fa-pen"></i> 例を見ながら書き直す</button></div>`;
        if (it.key === 'op' && it.add && it.add.length) extra += `<div class="cpr-adds">${it.add.map((a, k) => `<button type="button" class="cpr-add" onclick="addMissingOpUI('${pid}', ${k})" title="理由を書いてからOPに足します"><i class="fa-solid fa-plus"></i> ${escapeHtml(a)}</button>`).join('')}</div>`;
        if (it.key === 'tp' && it.moveToOp && it.moveToOp.length) extra += `<div class="cpr-adds">${it.moveToOp.map((a, k) => `<button type="button" class="cpr-add" onclick="moveTpToOpUI('${pid}', ${k})" title="このTPをOP（観察計画）へ移します"><i class="fa-solid fa-arrow-right-arrow-left"></i> OPへ移す：${escapeHtml(String(a).slice(0, 24))}</button>`).join('')}</div>`;
        if (it.key === 'evidence' && it.evidence && it.evidence.length) extra += `<div class="cpr-ev">${it.evidence.map(e => `<span>${escapeHtml(e)}</span>`).join('')}</div>`;
        return `<li class="cpr-item cpr-${it.level}"><div class="cpr-head">${icon(it.level)} <b>${escapeHtml(it.label)}</b>${it.level === 'ok' ? '<span class="cpr-okt">問題なし</span>' : ''}</div>${it.msgs.map(m => `<p>${escapeHtml(m)}</p>`).join('')}${extra}</li>`;
      }).join('');
      const modelHtml = r.model ? cpModelBlockHtml(r.model, 'この看護問題の手本') + `<button type="button" class="my-asm-link" onclick="applyCareModelUI('${pid}')"><i class="fa-solid fa-wand-magic-sparkles"></i> 手本を空欄に入れる（書いてある所はそのまま）</button>` : '';
      return `<div class="cpr" id="cpr-${pid}"><div class="cpr-title"><i class="fa-solid fa-clipboard-list"></i> 計画のチェック<span class="my-asm-muted">要確認 ${cpReviewCount(r)}件</span></div><ul class="cpr-list">${rows}</ul>${modelHtml}</div>`;
    }

    const CP_SET_TOPICS = [
      ['分割食', /分割食/], ['栄養士の指導・食事療法', /栄養士|栄養指導|食事療法|カロリー制限|エネルギー/], ['低血糖の対応', /低血糖|ブドウ糖/],
      ['インスリン手技', /インスリン|自己注射/], ['血糖測定', /血糖測定|SMBG|血糖値/], ['フットケア', /フットケア|足の観察|足趾/],
      ['ナースコール・症状の伝え方', /ナースコール|症状.{0,6}伝え|知らせ/], ['服薬の指導', /服薬|内服/], ['転倒予防', /転倒|転落/], ['感染予防（手洗い・清潔）', /手洗い|手指衛生|清潔|感染予防/]
    ];
    function cpBigrams(t) { const s = String(t).normalize('NFKC').replace(/[\s。、，,.・]/g, ''); const set = new Set(); for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2)); return set; }
    function cpSimilar(a, b) {
      const x = cpBigrams(a), y = cpBigrams(b);
      if (x.size < 6 || y.size < 6) return false;
      let inter = 0; x.forEach(g => { if (y.has(g)) inter++; });
      return inter / (x.size + y.size - inter) >= 0.6;
    }

    function reviewCarePlanSet(cp) {
      const plans = carePlanList(cp).map(p => normalizeCarePlan({ ...p }));
      const out = { dups: [], overlaps: [], gaps: [], covered: [] };
      if (plans.length < 2) return out;
      const name = p => `「${p.problem || '無題'}」`;
      const act = p => [p.goalShort, p.goalLong, ...p.tp, ...p.ep].join('\n').normalize('NFKC');

      const epOf = (p, fam) => p.ep.filter(l => !!/家族|妻|夫|娘|息子/.test(l) === fam).join('\n').normalize('NFKC');
      CP_SET_TOPICS.filter(([label]) => !/ナースコール|感染予防|服薬|転倒/.test(label)).forEach(([label, re]) => {
        [false, true].forEach(fam => {
          const hit = plans.filter(p => re.test(epOf(p, fam)));
          if (hit.length >= 2) out.dups.push({ title: label, msg: `「${label}」の${fam ? '家族への' : ''}説明が${hit.map(name).join('と')}の教育計画（EP）に書かれています。同じ説明・理解確認を2回書かず、片方にまとめるか、問題ごとに目的（何を解決するか）と達成条件を分けましょう` });
        });
      });

      const seen = new Set();
      for (let i = 0; i < plans.length; i++) for (let j = i + 1; j < plans.length; j++) {
        ['tp', 'ep'].forEach(k => plans[i][k].forEach(a => plans[j][k].forEach(b => {
          const key = `${i}-${j}-${a}`;
          if (!seen.has(key) && cpSimilar(a, b)) { seen.add(key); out.dups.push({ title: '似た文', msg: `${name(plans[i])}と${name(plans[j])}に、ほぼ同じ${k.toUpperCase()}があります：「${String(a).slice(0, 40)}」` }); }
        })));
      }

      const byDom = {};
      plans.forEach(p => { const d = cpDomainOf(p); if (d) (byDom[d.key] = byDom[d.key] || []).push(p); });
      Object.values(byDom).filter(a => a.length >= 2).forEach(a => out.overlaps.push({ title: '同じ種類の問題', msg: `${a.map(name).join('と')}は同じ種類の問題です。別の問題として残すなら、目的と達成条件を分けましょう` }));

      const ctxText = cpRecordContext(cp).text;
      [['家族への指導・支援', /キーパーソン|妻|夫|家族|娘|息子/, /家族|妻|夫|娘|息子|キーパーソン/], ['仕事・生活への配慮', /仕事|勤務|職場|通勤|復職/, /仕事|勤務|職場|通勤|復職/]].forEach(([label, recRe, planRe]) => {
        if (!recRe.test(ctxText)) return;
        const hit = plans.filter(p => planRe.test(act(p)));
        if (hit.length) out.covered.push({ title: label, msg: `${label}は${hit.map(name).join('・')}に書かれています（1つの計画に無くても、全体では入っています）` });
        else out.gaps.push({ title: label, msg: `記録に出てくる${label}が、どの計画にも書かれていません` });
      });
      return out;
    }

    const carePlanSetState = { open: false };
    function carePlanSetReviewHtml(cp) {
      if (!carePlanSetState.open) return '';
      const local = reviewCarePlanSet(cp);
      const group = (title, icon, cls, arr) => arr.length ? `<div class="cps-group ${cls}"><b><i class="fa-solid ${icon}"></i> ${title}</b><ul>${arr.map(x => `<li>${escapeHtml(x.msg || [x.title ? `${x.title}：` : '', x.comment || ''].join(''))}${x.suggestion ? `<span class="cpr-sugg">提案：${escapeHtml(x.suggestion)}</span>` : ''}</li>`).join('')}</ul></div>` : '';
      const n = carePlanList(cp).length;
      let h = `<div class="cps"><div class="cpr-title"><i class="fa-solid fa-layer-group"></i> 全計画のチェック<span class="my-asm-muted">計画どうしの重複・補完・不足を見ます</span><button type="button" class="my-asm-link" onclick="closeCarePlanSetReview()">閉じる</button></div>`;
      if (n < 2) h += '<p class="my-asm-muted">計画が2件以上あると、重複や補完を確かめられます。</p>';
      else {
        const any = local.dups.length || local.overlaps.length || local.gaps.length;
        h += group('重複', 'fa-clone', 'warn', [...local.dups, ...local.overlaps]) + group('全体では入っている', 'fa-circle-check', 'ok', local.covered) + group('どの計画にも無い', 'fa-triangle-exclamation', 'warn', local.gaps);
        if (!any) h += '<p class="my-asm-muted">計画どうしの重複・不足は見つかりませんでした。</p>';
      }
      const actions = carePlanSetNextSteps(cp, local);
      h += `<div class="cps-next"><h4>次に行うこと</h4><ol>${actions.map(action => `<li>${escapeHtml(action.text)}${action.planId ? ` <button type="button" class="btn btn-outline" onclick="openCarePlanFromReview(${jsArg(action.planId)})">この計画を見直す</button>${action.missing ? ` <button type="button" class="btn btn-outline" onclick="fillMissingCareSectionsUI(${jsArg(action.planId)})">空欄に追記案を入れる</button>` : ''}` : ''}</li>`).join('')}</ol></div>`;
      h += '</div>';
      return h;
    }
    function renderCarePlanSetReview() {
      const el = document.getElementById('careplan-set-review');
      if (el) el.innerHTML = carePlanSetReviewHtml(getCurrentPatient());
    }
    window.openCarePlanSetReview = function() { carePlanSetState.open = true; renderCarePlanSetReview(); const el = document.getElementById('careplan-set-review'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); };
    window.closeCarePlanSetReview = function() { carePlanSetState.open = false; renderCarePlanSetReview(); };
    function carePlanSetNextSteps(cp, review = reviewCarePlanSet(cp)) {
      const actions = [];
      if (!carePlanList(cp).length) return [{ text: '原文と分類したカードを確認し、看護問題・目標・OP・TP・EPを作成してください。計画を作成してから、重複や不足を見直してください。' }];
      carePlanList(cp).forEach(plan => {
        if (['ended', 'resolved', 'paused'].includes(plan.status)) {
          actions.push({ planId: plan.id, text: `「${plan.problem}」は${CARE_PLAN_STATUSES.find(s => s.key === plan.status).label}です。その判断の根拠と患者の反応、再評価・再開が必要になる条件を記録してください。` });
          return;
        }
        const last = latestCareRecord(plan);
        const outcome = evaluateCarePlanFromRecords(plan).result;
        const followUp = !last ? '' : outcome === 'achieved'
          ? '目標の達成が記録されています。患者の現状を確認し、計画を継続するか終了するか判断して、その理由を記録してください。'
          : ['partial', 'not'].includes(outcome)
            ? `${outcome === 'partial' ? '一部達成' : '未達成'}の理由を患者の反応と原文から確認し、援助内容・回数・タイミングの修正案と再評価の時期を記録してください。`
            : '最新の実施記録では目標の達成状況を確認できません。患者の反応を目標と照合し、評価できない場合は不足する情報と確認する時期を記録してください。';
        let action;
        const missing = ['op', 'tp', 'ep'].filter(k => !plan[k]?.length);
        if (missing.length) action = { planId: plan.id, missing: true, text: `「${plan.problem}」の${missing.map(k => k.toUpperCase()).join('・')}を補い、誰が・いつ・どのように行うか、患者の記録と現在の指示に合わせて具体化してください。` };
        else {
          const warnings = reviewCarePlan(cp, plan).items.filter(check => check.level === 'warn');
          if (warnings.length) action = { planId: plan.id, text: `「${plan.problem}」：${warnings.map(check => check.label).join('・')}を見直してください。${warnings[0].msgs[0] || ''}` };
        }
        if (followUp) {
          if (action) action.text += followUp;
          else action = { planId: plan.id, text: `「${plan.problem}」：${followUp}` };
        }
        if (action) actions.push(action);
      });
      if (review.dups.length || review.overlaps.length) actions.push({ text: '重複する援助・説明は主に担当する計画を決め、他の計画はその計画を参照してください。問題の目的が違うものは、目標と達成条件を分けて残してください。' });
      review.gaps.forEach(gap => actions.push({ text: `${gap.msg}。担当する計画を決め、援助内容・説明内容と理解の確認方法をTP・EPへ追記してください。` }));
      if (!actions.length) actions.push({ text: '実施後の患者の反応と目標の達成状況を記録してください。未達成の場合は原因を確認し、援助の内容・回数・タイミングを再評価してください。' });
      return actions;
    }
    window.openCarePlanFromReview = function(id) {
      carePlanOpen.add(id); carePlanReviewOpen.add(id); renderCarePlans();
      [...document.querySelectorAll('.cp-card[data-care-plan-id]')].find(el => el.dataset.carePlanId === id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    };
    window.fillMissingCareSectionsUI = function(id) {
      const cp = getCurrentPatient(), plan = getCarePlan(cp, id);
      if (!plan) return;
      const model = cpModelOrFallback(cp, plan);
      if (!model) return showToast('追記案の根拠が不足しています。原文を確認して作成してください', 'warn');
      const before = careOperationSnapshot(cp), patch = {};
      ['op', 'tp', 'ep'].forEach(k => { if (!plan[k]?.length && model[k]?.length) patch[k] = [...model[k]]; });
      if (!Object.keys(patch).length) return showToast('空欄に入れられる追記案がありません。原文・現在の指示を確認し、この看護問題に必要な内容を入力してください', 'warn');
      updateCarePlan(cp, id, { ...patch, reasonNeeded: true });
      rememberCareOperation(cp, before); commitCarePlanChange(cp);
      showToast('空欄に追記案を入れました。原文・現在の指示と照合し、具体的な援助に整えてください', 'success');
    };

    function buildCarePlansText(cp, { withRecords = true, recordFilter = null } = {}) {
      return carePlanList(cp).filter(p => carePlanProvenance(cp, p).ok).map((p, k) => {
        const lines = [`#${k + 1} ${p.problem || '（無題）'}（${CARE_PLAN_STATUSES.find(s => s.key === p.status).label}）`];
        if (p.relatedNeeds.length) lines.push(`関係する項目：${p.relatedNeeds.map(h => `${h}.${hendersonNameOf(h).replace(/^\d+\.\s*/, '')}`).join('・')}`);
        if (p.evidence && p.evidence.length) lines.push(`根拠データ：${p.evidence.join('／')}`);
        if (p.reasons && p.reasons.length) lines.push(`この患者に必要な理由：${p.reasons.map(r => `${r.about ? `（${r.about}）` : ''}${r.text}`).join('／')}`);
        if (p.goalLong) lines.push(`長期目標：${p.goalLong}`);
        if (p.goalShort) lines.push(`短期目標：${p.goalShort}`);
        CARE_PLAN_SECTIONS.forEach(s => { if (p[s.key].length) lines.push(`${s.label}`, ...p[s.key].map((t, n) => `  ${s.short}${n + 1}. ${t}`)); });
        const recs = withRecords ? p.records.filter(r => !recordFilter || recordFilter(r)) : [];
        if (recs.length) {
          lines.push('実施・評価');
          recs.forEach(r => lines.push(...careRecordLines(r).map(l => `  ${l}`)));
        }
        return lines.join('\n');
      }).join('\n\n');
    }
    function careRecordLines(r) {
      const ach = CARE_ACHIEVEMENTS.find(a => a.key === r.achievement);
      const out = [`【${formatMyDateTime(r.at)}】${ach && ach.key ? `目標：${ach.label}` : ''}`];
      if (r.doneItems.length) out.push(`実施した計画：${r.doneItems.join('／')}`);
      if (r.doneText) out.push(`実施内容：${r.doneText}`);
      if (r.response) out.push(`患者の反応：${r.response}`);
      if (r.evaluation) out.push(`評価：${r.evaluation}`);
      if (r.revision) out.push(`計画の修正：${r.revision}`);
      return out;
    }

    function buildCarePlansPrintHtml(cp, { withRecords = true } = {}) {
      const plans = carePlanList(cp);
      const esc = t => escapeHtml(String(t == null ? '' : t));
      const row = (label, html) => html ? `<tr><th scope="row" style="width:17%;background:#f7f5f0;">${label}</th><td>${html}</td></tr>` : '';
      const list = arr => arr.length ? `<ol style="margin:0;padding-left:1.4em;">${arr.map(t => `<li>${esc(t)}</li>`).join('')}</ol>` : '';
      const body = plans.map((p, k) => {
        const st = CARE_PLAN_STATUSES.find(x => x.key === p.status);
        const needs = p.relatedNeeds.map(h => `${h}.${hendersonNameOf(h).replace(/^\d+\.\s*/, '')}`).join('・');
        const recs = withRecords ? p.records : [];
        const recTable = recs.length ? `<table style="margin-top:4pt;"><thead><tr><th style="width:15%">日時</th><th>実施内容</th><th style="width:20%">患者の反応</th><th style="width:22%">評価</th><th style="width:16%">計画の修正</th></tr></thead><tbody>${recs.map(r => {
          const ach = CARE_ACHIEVEMENTS.find(a => a.key === r.achievement);
          const done = [r.doneItems.length ? `【実施した計画】${r.doneItems.map(esc).join('／')}` : '', esc(r.doneText)].filter(Boolean).join('<br>');
          return `<tr><td>${esc(formatMyDateTime(r.at))}${ach && ach.key ? `<br><b>${ach.label}</b>` : ''}</td><td>${done || '—'}</td><td>${esc(r.response) || '—'}</td><td>${esc(r.evaluation) || '—'}</td><td>${esc(r.revision) || '—'}</td></tr>`;
        }).join('')}</tbody></table>` : '';
        return `<h2>#${k + 1} ${esc(p.problem || '（無題）')}　<span style="font-weight:400;font-size:9pt;">［${esc(st ? st.label : '')}］</span></h2>
<table style="break-inside:auto;"><tbody>${row('関係する項目', esc(needs))}${row('根拠データ', esc((p.evidence || []).join('／')))}${row('この患者に必要な理由', (p.reasons || []).map(r => `${r.about ? `（${esc(r.about)}）` : ''}${esc(r.text)}`).join('<br>'))}${row('長期目標', esc(p.goalLong))}${row('短期目標', esc(p.goalShort))}${CARE_PLAN_SECTIONS.map(s => row(esc(s.label), list(p[s.key]))).join('')}</tbody></table>
${recs.length ? `<div style="font-weight:700;margin:6pt 0 0;">実施・評価の記録</div>${recTable}` : ''}`;
      }).join('');
      const title = `${cp.title || ''}_看護計画`;
      return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_BASE_CSS}
  @page { size: A4 portrait; }
  table { width: 100%; border-collapse: collapse; } th, td { border: .6pt solid #8a8375; padding: 2.5pt 4pt; vertical-align: top; text-align: left; font-size: 8.8pt; }
  tr { break-inside: avoid; page-break-inside: avoid; }
</style></head><body>
${printDocHead('看護計画・実施・評価', cp, `看護計画 ${plans.length}件`)}
${body}
<p class="note">利用者が作成・編集した看護計画です。最終的な判断は医療従事者が行ってください。</p>
</body></html>`;
    }
    window.printCarePlans = function() {
      const cp = getCurrentPatient();
      if (!carePlanList(cp).length) return showToast('書き出す看護計画がありません。先に看護計画を作成してください', 'warn');
      printHtmlDocument(buildCarePlansPrintHtml(cp));
      showToast(isMobilePrintTarget() ? '印刷用の見本を開きました。上の「印刷・PDFに保存」を押してください' : '印刷画面を開きます。「送信先」で「PDFに保存」を選ぶとPDFになります', 'info');
    };
    window.exportCarePlansText = async function() {
      const cp = getCurrentPatient();
      if (!carePlanList(cp).length) return showToast('書き出す看護計画がありません。先に看護計画を作成してください', 'warn');
      const safeTitle = String(cp.title || '患者').replace(/[\\/:*?"<>|]/g, '_');
      const text = `看護計画・実施・評価：${cp.title || ''}\n出力日時: ${new Date().toLocaleString('ja-JP')}\n\n${buildCarePlansText(cp)}\n`;
      if (!(await downloadTextBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${safeTitle}_看護計画.txt`))) return;
      showToast('看護計画をテキストで書き出しました', 'success');
    };

    function onCarePlanViewShown() { try { autoBuildCarePlans(getCurrentPatient()); } catch (e) { console.warn(e); } renderCarePlans(); }

if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, {
    inferUntaggedReason, untaggedContextEffects, untaggedTextKey, untaggedReviewOf, setUntaggedReview, applyUntaggedReviews, untaggedReviewItems, untaggedReviewCounts, untaggedSectionHtml,
    buildCarePlansPrintHtml, buildCarePlansText, buildCarePlansByRules, autoBuildCarePlans, carePlanList, deleteCarePlan,
    formatCardTimestamp, MISSING_CHECK_STATUSES, missingInfoItems, missingCheckStatus, missingCheckCounts, setMissingCheck, missingCheckCardHtml,
    carePlanInlineNotes, captureCarePlanEvidence, carePlanEvidenceChanges, refreshCarePlanEvidence, CARE_PLAN_SECTIONS, carePlanList, createCarePlan, getCarePlan, updateCarePlan, deleteCarePlan, moveCarePlan, carePlanLinesToList,
    addCareRecord, updateCareRecord, deleteCareRecord, parseCarePlanText, buildMissingInfoText, importCarePlans, guessPlanNeeds, buildCarePlansText, carePlanCardHtml,
    cpModelFor, CP_REVIEW_ITEMS, CP_DOMAINS, cpDomainOf, collapseVitalCards, collapseLabCards,
    globalAppData, GENERATED_RESULT_FIELDS, sourceRevisionOf, foreignTermsInText, krTerms, krNames, krIsMedicalTerm, CARE_PLAN_KNOWLEDGE, cpKnowledgeSuggestions, CP_HIGH_RISK_COMBOS, cpHighRiskCombos, cpStripNegated, cpEvidenceKind, krUnknownTerms, CPK_ROWS_79, CPK_ROWS_100, beginGeneration, commitGeneratedResult, generatedResultStatus, activeGeneratedResult, quarantinedGeneratedResults, quarantineNoticeText, activeDiagnosisCandidates, carePlanProvenance, classificationHealth, buildKnowledgeRequests, knowledgeRequestText, buildImprovementProposals, diseaseSymptomNeeds, CARE_PLAN_STATUSES, CARE_ACHIEVEMENTS, cpPlanKey, cpIsRisk, cpPlanIncoherent, regenerateCarePlanSections, cpModelOrFallback, mergeDuplicateCarePlans, validateCarePlanEvidence, applyCarePlanValidation, prioritizeCarePlans, cpPriorityOf, cpRiskGoalFor,
    cpEducationLines, cpForeignTerms, cpSanitizeRefs, cpResolvePlanId, refineCarePlans, evaluateCarePlanFromRecords, cpGoalCheck, cpRecordContext, reviewCarePlan, importCarePlansFromMap, carePlanReviewHtml, carePlanBasisHtml, cpObservationLines, reviewCarePlanSet, carePlanSetReviewHtml, carePlanSetState, carePlanSetNextSteps
  });
}
