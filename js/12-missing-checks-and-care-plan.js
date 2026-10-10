    // 看護アセスメント支援システム：12-missing-checks-and-care-plan.js（全13ファイルのうち 12 番目）
    // ②不足情報の確認状況：総合アセスメント表の「不足情報」の欄のカードごとに「未確認・確認済み・該当なし」、
    //   確かめた方法・日時・結果を残し、結果を情報カード（S/O）として足せるようにする。
    // ③看護計画の編集・実施・評価：看護問題ごとに目標・OP/TP/EPを書き、日々の実施内容・患者の反応・目標の達成状況・
    //   評価・計画の修正を記録する（「看護計画」のページ）。

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['12'] = '2026-10-10.znavigation2'; // 版（scripts/stamp-version.js が書き込む）

    // 日時を、カードの日時欄と同じ書き方（「9月29日 14:05」）にする
    function formatCardTimestamp(value) {
      const d = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(d.getTime())) return '日時不明';
      const pad = n => String(n).padStart(2, '0');
      return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${pad(d.getMinutes())}`;
    }
    // <input type="datetime-local"> の値（その端末の時刻）⇔ ISO
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
    // 自分で書いた記録から情報カードを作る（不足情報の確認結果・看護計画の実施のときの患者の反応）
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
    // ② 不足情報の確認状況（cp.missingChecks[カードのID] = { status, method, result, checkedAt, resultItemId, updatedAt }）
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
    // 確認状況を書き込む。addCard=true で確認結果を情報カードとして足す（足したカードがあれば書き換える）
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

    // 総合アセスメント表の「不足情報」の欄のカードに付ける、確認状況の印と結果（js/09 の renderAssessmentCellCard から呼ぶ）
    function missingCheckCardHtml(cp, item) {
      const st = missingCheckStatus(cp, item.id);
      const c = getMissingCheck(cp, item.id);
      const def = MISSING_CHECK_STATUSES.find(s => s.key === st);
      const detail = c && st !== 'unchecked'
        ? `<div class="mc-result">${c.result ? `<i class="fa-solid fa-arrow-turn-down fa-rotate-270"></i> ${escapeHtml(c.result)}` : ''}${c.method ? `<span class="mc-method">（${escapeHtml(c.method)}）</span>` : ''}${c.checkedAt ? `<span class="mc-when">${escapeHtml(formatMyDateTime(c.checkedAt))}</span>` : ''}${c.resultItemId && cp.items.some(i => i.id === c.resultItemId && i.type !== 'unnecessary') ? '<span class="mc-card-added" title="確認結果を情報カードとして追加しました"><i class="fa-solid fa-id-card"></i>カード追加済み</span>' : ''}</div>`
        : '';
      return `<button type="button" class="mc-badge mc-${st}" onclick="openMissingCheck('${safeDomId(item.id)}')" title="確認状況を記録する（未確認・確認済み・該当なし）"><i class="fa-solid ${def.icon}"></i>${def.label}</button>${detail}`;
    }

    // 表の上の「不足情報の確認」の集計と一覧
    let missingSummaryOpen = false;
    let missingSummaryFilter = 'unchecked';
    function renderMissingCheckSummary(cp) {
      const el = document.getElementById('missing-check-summary');
      if (!el) return;
      applyUntaggedReviews(cp);
      const counts = missingCheckCounts(cp);
      const utHtml = untaggedSectionHtml(cp);
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

    // 確認状況を記録する画面
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
    // ④ ヘンダーソンタグ未設定の理由（cp.untaggedReviews[文章の鍵] = { decision, tagIds, note, text, updatedAt }）
    // ------------------------------------------------------------------------
    // タグが付いていない＝誤り、とは限らない（社会保険・病期のように14項目に直接の根拠が無い情報、原本が読めない情報など）。
    // 未設定のカードごとに「推定理由・確からしさ・分類候補・確認事項」を示し、利用者が確定する。原文は書き換えない。
    // 確定した内容はその患者（cp）の中だけに残し、文章の鍵で結びつけるので、再生成でカードのIDが変わっても引き継ぐ。
    // 他の患者には自動で当てはめない。
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
    // 痛みの記載が「何に影響しているか」を、前後の記録（同じ日時のカード、前後2枚）を読んで推定する（患者36）
    const UNTAGGED_EFFECT_RULES = [
      { id: 5, re: /眠れ|眠れず|睡眠|不眠|夜間覚醒|寝つ|寝れ/, label: '睡眠' },
      { id: 4, re: /動く|動かす|動け|動き|体位|体動|荷重|移乗|リハ|離床|歩行|歩く|起立|起き|端坐|車椅子|車いす|立位|訓練|可動域|ROM|SLR|運動|ベッド上|床上/, label: '動作・姿勢' },
      { id: 2, re: /食欲|食事|摂取|昼食|夕食|朝食|嘔気|嘔吐/, label: '食事' },
      { id: 3, re: /トイレ|排尿|排便|尿|便/, label: '排泄' },
      { id: 8, re: /清拭|入浴|洗髪|清潔ケア|陰部洗浄/, label: '清潔' },
      { id: 6, re: /更衣|着替/, label: '更衣' }
    ];
    function untaggedContextEffects(cp, item) {
      const items = (cp && cp.items) || [];
      const idx = items.findIndex(i => i.id === item.id);
      if (idx < 0) return [];
      const near = items.filter((i, k) => i.id !== item.id && i.type !== 'unnecessary' && (Math.abs(k - idx) <= 2 || (item.timestamp && item.timestamp !== '日時不明' && i.timestamp === item.timestamp && Math.abs(k - idx) <= 8)));
      const found = [];
      UNTAGGED_EFFECT_RULES.forEach(rule => {
        const hit = near.find(i => rule.re.test(String(i.text || '')));
        if (hit) found.push({ id: rule.id, label: rule.label, evidence: String(hit.text).slice(0, 40) });
      });
      return found;
    }
    // 未設定のカード1枚について、理由を推定する（確からしさは根拠の強さを表す語で、数値の確率ではない）
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
        return set('none', 'アレルギーの有無は、基準では9.環境・薬剤の項目にしない背景情報です（アレルギーがある場合は、その内容を別の項目の根拠として確認します）。', '中', [], ['「あり」の場合は原因物質と症状を確認し、必要な項目に別のカードで記録してください']);
      }
      if (UNTAGGED_PATHOLOGY_RE.test(text)) {
        return set('none', '疾患の分類・病理所見で、患者の学び（理解・学習）の根拠ではありません。「説明すると今後必要になる」だけでは14.学びにしません。臨床背景として残します。', '中', [], ['患者の病状理解や説明への反応が書かれていれば、それを別のカードにして14.学びの根拠にしてください']);
      }
      if (typeof OUTSIDE_14_NEEDS_REGEX !== 'undefined' && OUTSIDE_14_NEEDS_REGEX.test(text)) {
        return set('none', '生殖・月経など、14項目に直接の項目が無い基本情報です。', '中', [], ['必要なら学習データ管理の「追加キーワード」でどの項目に入れるか決めてください']);
      }
      if (typeof PAIN_TEXT_REGEX !== 'undefined' && PAIN_TEXT_REGEX.test(text)) {
        const eff = cp ? untaggedContextEffects(cp, item) : [];
        if (eff.length) {
          out.fromContext = true;
          return set('classify', `痛みの記載そのものには影響先が書かれていませんが、前後の記録から${eff.map(e => `「${e.evidence}」→${e.label}（${e.id}）`).join('、')}に関係すると読み取れます。`, '中', eff.map(e => e.id), ['前後の記録を読み、痛みが本当にその項目に影響しているか確認してから付けてください']);
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
    // 確定済みの判断を、現在のカードに反映し直す（再生成でIDが変わっても文章が同じなら引き継ぐ）
    function applyUntaggedReviews(cp) {
      if (!cp || !cp.untaggedReviews) return;
      (cp.items || []).forEach(i => {
        const r = untaggedReviewOf(cp, i);
        if (r && r.decision === 'none' && !(i.hendersonIds || []).length) { if (!i.tagNotNeeded) i.tagNotNeeded = true; }
        else if (i.tagNotNeeded && !r) i.tagNotNeeded = false;
      });
    }
    // 画面に出す対象：不要でなく、タグが無く、タグ不要と確定していないカード（確定済みも一覧には残して見直せる）
    function untaggedReviewItems(cp) {
      return (cp.items || []).filter(i => i.type !== 'unnecessary' && !(i.hendersonIds || []).length);
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
    function untaggedStatusLabel(r) {
      if (!r) return '未確認';
      return { accept: '理由を了承済み', assign: 'タグ付け済み', none: 'タグ不要（確認済み）', source: '原本確認待ち' }[r.decision] || '確認済み';
    }
    function untaggedReviewRowHtml(cp, item) {
      const inf = inferUntaggedReason(item, cp), r = untaggedReviewOf(cp, item);
      const cand = inf.candidates.length ? inf.candidates.map(h => `${h}.${hendersonNameOf(h).replace(/^\d+\.\s*/, '')}`).join('・') : 'なし';
      const id = jsArg(item.id);
      const opts = HENDERSON_NEEDS.map(n => `<option value="${n.id}">${n.id}. ${escapeHtml(n.name)}</option>`).join('');
      const parts = inf.parts.length ? `<div class="ut-parts">${inf.parts.map(p => `<div>・${escapeHtml(p.text)} <span class="my-asm-muted">→ ${p.tagIds.map(h => hendersonNameOf(h).replace(/^\d+\.\s*/, '')).join('・')}</span></div>`).join('')}</div>` : '';
      return `<li class="ut-item ut-${r ? 'done' : 'open'}">
        <div class="ut-line"><span class="ut-kind ut-k-${inf.kind}">${escapeHtml(inf.kindLabel)}</span><span class="mc-text">${escapeHtml(item.text)}</span><span class="ut-status">${escapeHtml(untaggedStatusLabel(r))}</span></div>
        <div class="ut-meta">原文：${escapeHtml(item.text.slice(0, 60))}／タグ：未設定／推定理由：${escapeHtml(inf.reason)}／推定の確からしさ：${inf.confidence}／分類候補：${escapeHtml(cand)}／確認事項：${escapeHtml(inf.checks.join('・') || '—')}</div>${parts}
        <div class="ut-actions">
          <button type="button" class="mc-filter" onclick="untaggedAction(${id},'accept')">理由を了承</button>
          ${inf.candidates.length ? `<button type="button" class="mc-filter" onclick="untaggedAction(${id},'assign')">候補のタグを付ける</button>` : ''}
          ${inf.parts.length ? `<button type="button" class="mc-filter" onclick="untaggedSplit(${id})">分けてタグを付ける</button>` : ''}
          <select class="field ut-sel" onchange="untaggedAssignOther(${id}, this)"><option value="">別の項目を選ぶ</option>${opts}</select>
          <button type="button" class="mc-filter" onclick="untaggedAction(${id},'none')">タグ不要にする</button>
          <button type="button" class="mc-filter" onclick="untaggedAction(${id},'source')">原本確認を依頼</button>
        </div></li>`;
    }
    function untaggedCountNotNeeded(cp) { return untaggedReviewItems(cp).filter(i => i.tagNotNeeded).length; }
    function untaggedContextCandidates(cp) {
      return untaggedReviewItems(cp).filter(i => !untaggedReviewOf(cp, i)).map(i => ({ item: i, inf: inferUntaggedReason(i, cp) })).filter(x => x.inf.fromContext && x.inf.candidates.length);
    }
    function untaggedContextCandidateCount(cp) { return untaggedContextCandidates(cp).length; }
    window.untaggedApplyAllCandidates = function() {
      const cp = getCurrentPatient();
      const list = untaggedContextCandidates(cp);
      list.forEach(x => setUntaggedReview(cp, x.item.id, { decision: 'assign', tagIds: x.inf.candidates }));
      saveDataAndSync(); renderMissingCheckSummary(cp);
      showToast(`${list.length}枚に、前後の記録から読み取れたタグを付けました（取り消しは各カードのタグの×）`, 'success');
    };
    let untaggedListOpen = false;
    function untaggedSectionHtml(cp) {
      const c = untaggedReviewCounts(cp);
      if (!c.total) return '';
      const list = untaggedListOpen ? `<ul class="mc-list ut-list">${untaggedReviewItems(cp).map(i => untaggedReviewRowHtml(cp, i)).join('')}</ul>` : '';
      return `<div class="mc-summary-head"><span class="mc-summary-title"><i class="fa-solid fa-tag"></i> ヘンダーソンタグ未設定の理由</span>
        <button type="button" class="mc-filter mc-unchecked${untaggedListOpen ? ' active' : ''}" onclick="toggleUntaggedList()">未確認 <b>${c.open}</b></button>
        <button type="button" class="mc-filter mc-checked" onclick="toggleUntaggedList()">確認済み <b>${c.done}</b></button>
        <button type="button" class="mc-filter" onclick="selectAllUntagged()" title="タグ未設定のカードをすべて選択します（選択後、下の帯の「＋タグ追加」などでまとめて操作できます）"><i class="fa-regular fa-square-check"></i> 未設定を全選択 <b>${c.total - untaggedCountNotNeeded(cp)}</b></button>
        <button type="button" class="mc-filter" onclick="selectAllReviewTargets()" title="手で編集したカード（統合・分割を含む）とタグ未設定のカードをすべて選択します"><i class="fa-regular fa-square-check"></i> 編集済み＋未設定を選択</button>
        <button type="button" class="mc-filter" onclick="exportReviewRequestText()" title="問題の説明と直し方つきでテキストに書き出します"><i class="fa-solid fa-file-export"></i> 修正依頼を書き出す</button>
        ${untaggedContextCandidateCount(cp) ? `<button type="button" class="mc-filter" onclick="untaggedApplyAllCandidates()" title="前後の記録から影響先が読み取れたカードに、候補のタグをまとめて付けます">前後の記録から候補をまとめて付ける <b>${untaggedContextCandidateCount(cp)}</b></button>` : ''}
        ${untaggedListOpen ? '<button type="button" class="my-asm-link" onclick="toggleUntaggedList()">一覧を閉じる</button>' : ''}</div>${list}`;
    }
    window.toggleUntaggedList = function() { untaggedListOpen = !untaggedListOpen; renderMissingCheckSummary(getCurrentPatient()); };
    window.untaggedAction = function(itemId, decision) {
      const cp = getCurrentPatient(), item = cp.items.find(i => i.id === itemId);
      if (!item) return;
      const inf = inferUntaggedReason(item, cp);
      setUntaggedReview(cp, itemId, { decision, tagIds: decision === 'assign' ? inf.candidates : [] });
      saveDataAndSync(); renderMissingCheckSummary(cp);
      showToast(decision === 'source' ? '原本確認が必要として記録しました（原文はそのままです）' : '記録しました', 'success');
    };
    window.untaggedAssignOther = function(itemId, sel) {
      const h = parseInt(sel.value, 10); if (!h) return;
      const cp = getCurrentPatient();
      setUntaggedReview(cp, itemId, { decision: 'assign', tagIds: [h] });
      saveDataAndSync(); renderMissingCheckSummary(cp);
      showToast('タグを付けました', 'success');
    };
    window.untaggedSplit = function(itemId) {
      const cp = getCurrentPatient(), item = cp.items.find(i => i.id === itemId);
      if (!item) return;
      const inf = inferUntaggedReason(item);
      const segs = item.text.split(/(?<=[。\n；;])/).map(s => s.trim()).filter(Boolean);
      const res = splitCardIntoParts(cp, itemId, segs);
      if (!res) return showToast('分けられませんでした', 'warn');
      res.forEach(c => {
        const ids = typeof detectMultipleHendersonTags === 'function' ? Array.from(detectMultipleHendersonTags(c.text)) : [];
        c.hendersonIds = ids; c.assessmentCols = {}; ids.forEach(h => { c.assessmentCols[h] = 'unclassified'; });
        c.predictionSource = 'auto'; touchItem(c);
      });
      saveDataAndSync(); renderMissingCheckSummary(cp);
      showToast(`${res.length}枚に分けて、内容ごとにタグを付けました`, 'success');
    };

    // ==========================================================================
    // ③ 看護計画（cp.carePlans[計画のID] = { id, problem, relatedNeeds, goalLong, goalShort, op, tp, ep, status,
    //    order, createdAt, updatedAt, records:[{ id, at, doneItems, doneText, response, responseCardId,
    //    achievement, evaluation, revision }] }。消した計画は { id, deleted:true, updatedAt } を残す）
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
      ['problem', 'goalLong', 'goalShort'].forEach(k => { if (typeof p[k] !== 'string') p[k] = ''; });
      CARE_PLAN_SECTIONS.forEach(s => { if (!Array.isArray(p[s.key])) p[s.key] = []; });
      if (!Array.isArray(p.relatedNeeds)) p.relatedNeeds = [];
      if (!Array.isArray(p.records)) p.records = [];
      // 関連図から引き継いだ根拠データ・「この患者に必要な理由」（2026-10-07.5）
      if (!Array.isArray(p.evidence)) p.evidence = [];
      if (!Array.isArray(p.reasons)) p.reasons = [];
      if (!Array.isArray(p.refs)) p.refs = [];
      if (!CARE_PLAN_STATUSES.some(s => s.key === p.status)) p.status = 'planned'; // 作っただけの計画を「実施中」にしない
      return p;
    }
    // Only exact, unique text matches establish a link; never infer a card ID from a substring.
    function captureCarePlanEvidence(cp, plan) {
      const cards = (cp.items || []).filter(i => i && !i.deleted && i.type !== 'unnecessary' && !i.aiSuggested);
      const ids = new Set((Array.isArray(plan.evidenceIds) ? plan.evidenceIds : []).map(String));
      for (const text of plan.evidence || []) {
        const matches = cards.filter(i => String(i.text || '').trim() === String(text).trim());
        if (matches.length === 1) ids.add(String(matches[0].id));
      }
      plan.evidenceIds = [...ids];
      plan.evidenceSnapshot = cards.filter(i => ids.has(String(i.id))).map(i => ({ id: String(i.id), text: String(i.text || ''), timestamp: String(i.timestamp || ''), type: i.type, hendersonIds: [...(i.hendersonIds || [])], admissionPhase: i.admissionPhase || '', assessmentCols: { ...(i.assessmentCols || {}) } }));
    }
    function carePlanEvidenceChanges(cp, plan) {
      const cards = new Map((cp.items || []).filter(i => i && !i.deleted && i.type !== 'unnecessary' && !i.aiSuggested).map(i => [String(i.id), i]));
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
      if (Object.prototype.hasOwnProperty.call(patch, 'evidence') || Object.prototype.hasOwnProperty.call(patch, 'evidenceIds')) captureCarePlanEvidence(cp, p);
      return p;
    }
    function carePlanProblemKey(problem) { return String(problem || '').replace(/\s+/g, ''); }
    function deleteCarePlan(cp, id, now = new Date().toISOString()) {
      if (!getCarePlan(cp, id)) return false;
      // 自動作成で同じ看護問題が戻ってこないよう、消した計画の看護問題を覚えておく
      cp.carePlans[id] = { id, deleted: true, updatedAt: now, problemKey: carePlanProblemKey(cp.carePlans[id].problem), canonKey: cpPlanKey(cp.carePlans[id]) };
      return true;
    }
    function moveCarePlan(cp, id, dir, now = new Date().toISOString()) {
      const list = carePlanList(cp);
      const k = list.findIndex(p => p.id === id);
      const j = k + (dir === 'up' ? -1 : 1);
      if (k < 0 || j < 0 || j >= list.length) return false;
      list.forEach((p, n) => { p.order = n + 1; });
      list[k].orderLocked = true; list[j].orderLocked = true; // 自分で動かした順番は、自動の並べ替えで戻さない
      [list[k].order, list[j].order] = [list[j].order, list[k].order];
      list[k].updatedAt = now; list[j].updatedAt = now;
      return true;
    }
    // テキストの欄（1行に1つ）⇔ 項目の一覧。行頭の「・」「1.」「①」などの印は外す
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
      if (p.status === 'planned' || p.status === 'scheduled') p.status = 'active'; // 実施の記録ができたときだけ「実施中」にする
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

    // AIの看護計画（「■看護問題」・目標・OP/TP/EP の文章）を、看護計画の形に読み取る
    // 【レビューで発見】以前は見出しの語の直後に何が来てもよかったため、OPの項目「TPN刺入部の発赤を観察する」が
    // TPの見出し（「N刺入部…」）に、「目標SpO2 94%以上を保てているか観察する」が目標に読まれていた。
    // 見出しの語の直後は、行の終わり・空白・かっこ・「:」・「】」のときだけ見出しとする。
    const CARE_SECTION_HEAD_REGEX = /^[【\[]?\s*(長期目標|短期目標|目標|期待される成果|O-?P|観察計画|T-?P|援助計画|ケア計画|E-?P|教育計画|指導計画)(?=$|[\s（(:：】\]])\s*(?:[（(][^）)]*[）)])?\s*[】\]]?\s*[:：]?\s*(.*)$/i;
    // 看護問題の見出し：「■…」「◆…」「#1 …」に加えて、「1. ■…」「看護問題1：…」の形も読む
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
      // 【AI機能の評価で発見】AIは最初の「### 要点」に「#1 活動耐性低下：…」のような優先順位の一覧を書く。以前は
      // これも看護問題の見出しとして読み、中身の無い看護計画が2件余分に取り込まれていた。要点の中の行は読まない
      // （「■…」「看護問題1：…」の見出しが来たら要点は終わり）。
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
      // 観察・把握だけのTPはOPへ移す（TPには看護師が実施する援助だけを書く）
      plans.forEach(pl => {
        const obs = cpObservationLines(pl.tp);
        if (!obs.length) return;
        pl.tp = pl.tp.filter(l => !obs.includes(l));
        obs.forEach(l => { if (!pl.op.includes(l)) pl.op.push(l); });
      });
      // 中身（目標・OP・TP・EP）のある計画があるときは、名前だけの計画は取り込まない
      const named = plans.filter(p => p.problem);
      const hasBody = p => p.goalLong || p.goalShort || p.op.length || p.tp.length || p.ep.length;
      return named.some(hasBody) ? named.filter(hasBody) : named;
    }
    // 看護診断候補（選んだもの）の名前
    function selectedDiagnosisNames(cp) {
      const cands = Array.isArray(cp.diagnosisCandidates) ? cp.diagnosisCandidates : [];
      const sel = new Set(cp.selectedDiagnosisIds || []);
      return cands.filter(c => sel.has(c.id)).map(c => String(c.name || '').trim()).filter(Boolean);
    }
    // 看護問題の名前・計画の文章から、関係するヘンダーソンの項目を推定する（タグ付けのキーワードを使う）
    function guessPlanNeeds(plan) {
      const text = [plan.problem, plan.goalShort, plan.goalLong, ...(plan.op || []), ...(plan.tp || [])].join('\n');
      try { return Array.from(detectMultipleHendersonTags(text)).slice(0, 4); } catch (e) { return []; }
    }

    // ---- 看護計画のページ ----
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
    // 看護問題の下に小さく：関連図の補足・根拠データ・「この患者に必要な理由」（AIの案・関連図から取り込んだ計画は、理由を書くまで案内を出す）
    function carePlanBasisHtml(p, cp) {
      const pid = safeDomId(p.id);
      const parts = [];
      const changedEvidence = cp ? carePlanEvidenceChanges(cp, p) : [];
      if (changedEvidence.length) parts.push(`<div class="cp-qa cp-qa-warn"><b>根拠カードに変更があります</b><ul>${changedEvidence.map(x => `<li>${escapeHtml(x.before.text)} → ${x.after ? escapeHtml(x.after.text) : '削除・除外済み'}（日時・分類も確認してください）</li>`).join('')}</ul><button type="button" class="btn btn-outline" onclick="reviewCarePlanEvidenceUI('${pid}')">変更内容を確認して根拠を更新</button></div>`);
      if (p.note) parts.push(`<p class="cp-note">${escapeHtml(p.note)}</p>`);
      if (p.evidence && p.evidence.length) parts.push(`<div class="cp-ev"><span class="my-asm-label"><i class="fa-solid fa-diagram-project"></i> 根拠データ（関連図から）</span><div class="cpr-ev">${p.evidence.map(e => `<span>${escapeHtml(e)}</span>`).join('')}</div></div>`);
      if(cp&&(p.evidenceIds||[]).length)parts.push(`<div class="cp-ev"><b>根拠の情報カードを確認</b><div style="display:flex;gap:6px;flex-wrap:wrap">${[...new Set(p.evidenceIds.map(String))].map(id=>carePlanLinkedCardHtml(cp,p,id)).join('')}</div><small>現在のカードを表示します。計画作成時からの変更は上の点検で確認してください。</small></div>`);
      const reasons = Array.isArray(p.reasons) ? p.reasons : [];
      if (p.reasonNeeded && !reasons.length) parts.push(`<div class="cp-reason-need"><i class="fa-solid fa-graduation-cap"></i> ${p.source === 'map' ? '関連図から取り込んだ' : p.source === 'rules' ? 'このサイトのルールで作った' : 'AIの案から取り込んだ'}看護問題です。そのまま使わず、この患者に必要な理由を記録のデータで確かめましょう <button type="button" class="my-asm-link" onclick="writeCareReasonUI('${pid}')">理由を書く</button></div>`);
      if (reasons.length) parts.push(`<div class="cp-reasons"><span class="my-asm-label"><i class="fa-solid fa-graduation-cap"></i> この患者に必要な理由</span><ul>${reasons.slice(-5).map(r => `<li>${r.about ? `<b>${escapeHtml(r.about)}</b>：` : ''}${escapeHtml(r.text)}</li>`).join('')}</ul><button type="button" class="my-asm-link" onclick="writeCareReasonUI('${pid}')">理由を足す</button></div>`);
      // 優先順位の理由・別の問題として残した理由・根拠の検証・計画どうしの参照・自動チェックの結果
      if (p.priorityReason) parts.push(`<p class="cp-note"><b>優先順位：</b>${escapeHtml(p.priorityReason)}</p>`);
      if (p.distinct) parts.push(`<p class="cp-note">${escapeHtml(p.distinct)}</p>`);
      const vmsg = (p.validation && p.validation.msgs || []).filter(Boolean);
      if (vmsg.length) parts.push(`<div class="cp-qa cp-qa-warn"><i class="fa-solid fa-magnifying-glass-chart"></i> <b>根拠の確認</b><ul>${vmsg.map(m => `<li>${escapeHtml(m)}</li>`).join('')}</ul></div>`);
      const refs = cp ? (p.refs || []).map(r => { const id = cpResolvePlanId(cp, r.id); const q = id && getCarePlan(cp, id); const n = q ? carePlanList(cp).findIndex(x => x.id === q.id) + 1 : 0; return q ? `<li>#${n} ${escapeHtml(q.problem)}：${escapeHtml(r.why)}</li>` : ''; }).join('') : '';
      if (refs) parts.push(`<div class="cp-note"><b>関連する計画：</b><ul>${refs}</ul></div>`);
      const qa = p.qa || [];
      if (qa.length) parts.push(`<div class="cp-qa ${qa.some(q => q.level === 'error') ? 'cp-qa-err' : 'cp-qa-warn'}"><i class="fa-solid fa-clipboard-check"></i> <b>表示前の自動チェック</b><ul>${qa.map(q => `<li>${escapeHtml(q.msg)}</li>`).join('')}</ul></div>`);
      return parts.length ? `<div class="cp-basis">${parts.join('')}</div>` : '';
    }
    function carePlanCardHtml(cp, p, k, n) {
      // 【レビューで発見】計画のIDを onclick="…('…')" に入れるので、アプリが作る形のIDだけを使う（safeDomId）
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
            <button type="button" class="btn btn-outline my-asm-btn${carePlanReviewOpen.has(p.id) ? ' active' : ''}" onclick="toggleCarePlanReview('${pid}')" aria-expanded="${carePlanReviewOpen.has(p.id)}" title="目標・OP/TP/EPを7つの項目で確かめます（AIなし）"><i class="fa-solid fa-clipboard-list"></i> 計画をチェック</button>
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
      try { el.setSelectionRange(f.start, f.end); } catch (e) { /* 位置を戻せなくても続ける */ }
    }
    function commitCarePlanChange(cp, rerender = true) {
      saveMyAssessmentsSoon(cp.id, 0);
      if (rerender) renderCarePlans();
    }

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
      if (key !== 'problem') p.userEdited = true; // 自分で書いた計画は、自動の作り直しで上書きしない
      // 書いている途中の空行・行頭の印は入力欄のまま残したいので、欄は描き直さない（見出しだけ直す）
      p.updatedAt = new Date().toISOString();
      saveMyAssessmentsSoon(cp.id);
      if (key === 'problem') {
        const t = document.querySelector(`.cp-card [onclick="toggleCarePlan('${id}')"]`);
        if (t) t.innerHTML = `<i class="fa-solid fa-chevron-down"></i> ${escapeHtml(el.value || '（看護問題を書いてください）')}`;
      }
    };
    // 看護問題の名前を書き換え終えたとき：自分で目標などを書いていない計画は、新しい問題に合わせて作り直す
    window.onCarePlanProblemCommit = function(id) {
      const cp = getCurrentPatient();
      const p = getCarePlan(cp, id);
      if (!p) return;
      if (!p.userEdited) { applyCarePlanValidation(cp, p); if (!p.goalShort && !p.op.length || cpPlanIncoherent(p) || p.genKey !== cpPlanKey(p)) regenerateCarePlanSections(cp, p); }
      refineCarePlans(cp);
      commitCarePlanChange(cp, true);
      if (p.userEdited) showToast('看護問題が変わりました。目標・OP/TP/EPが古い問題のままになっていないか確認し、必要なら「この問題で作り直す」を押してください', 'info', 7000);
    };
    window.regenerateCarePlanUI = function(id) {
      const cp = getCurrentPatient();
      const p = getCarePlan(cp, id);
      if (!p) return;
      regenerateCarePlanSections(cp, p);
      refineCarePlans(cp);
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
      if (moveCarePlan(cp, id, dir)) commitCarePlanChange(cp);
    };
    window.addCarePlanUI = function() {
      const cp = getCurrentPatient();
      const p = createCarePlan(cp, {});
      carePlanOpen.add(p.id);
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
      deleteCarePlan(current, id);
      commitCarePlanChange(current);
      showToast('看護計画を消しました', 'info');
    };
    // 旧AIの結果からの看護計画取り込みは廃止。手動作成と関連図からの取り込みを使用する。
    // 従来の外部呼び出しとの互換性のため関数名のみ残し、AIの生成結果は読み込まない。
    function importCarePlans(cp, source, now = new Date().toISOString()) {
      return [];
    }
    window.importCarePlansUI = function() {
      showToast('AIの結果からの取り込みは廃止しました。「＋看護計画を追加」または「関連図から取り込む」を使用してください', 'info');
    };

    // ---- 実施・評価の記録の画面 ----
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
      const beforeRecord=recId?JSON.parse(JSON.stringify(p.records.find(r=>r.id===recId))):null;
      let card = null;
      if (rec.response && document.getElementById('care-record-add-card').checked) {
        card = createOwnInfoCard(cp, { text: rec.response, type: document.getElementById('care-record-card-type').value, needs: p.relatedNeeds, at: rec.at, fieldLabel: '患者の反応' });
        rec.responseCardId = card.id;
      }
      if (recId) { updateCareRecord(cp, planId, recId, rec); rememberCareRecordEdit(cp,planId,beforeRecord,p.records.find(r=>r.id===recId)); } else addCareRecord(cp, planId, rec);
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
      if (deleteCareRecord(current, planId, recId)) commitCarePlanChange(current);
    };


    // ==========================================================================
    // ④ 看護計画の評価（利用者の要望：2026-10-07.5）
    //   ・「計画をチェック」（AIなし・すぐ出る）と「AIで評価」（Gemini）。評価の7項目：
    //     看護問題との整合性／目標の具体性・評価可能性／OPの不足／TPの具体性／EPの適切さ／患者の個別性／根拠データとの一致
    //   ・目標は「いつまでに」「患者が」「どうなる」「何をもって達成と判断するか」の4つを確かめ、抽象的な目標
    //     （例：疼痛が軽減する）には、この患者の記録の値を使った目標の例を出す（例をそのまま入れず、自分で直してから入れる）
    //   ・関連図の看護問題と根拠データを、看護計画へ引き継ぐ（「関連図から取り込む」）
    //   ・AIの案・関連図から取り込んだ計画・評価の提案は、「この患者に必要な理由」を書いてから使う（学習の支え）
    //   ・新しい入力欄は増やさない（理由・根拠は計画の中に小さく表示し、入力はダイアログで行う）
    // ==========================================================================
    const CP_REVIEW_ITEMS = [
      { key: 'fit', label: '看護問題との整合性' },
      { key: 'goal', label: '目標の具体性・評価可能性' },
      { key: 'op', label: 'OP（観察計画）の不足' },
      { key: 'tp', label: 'TP（援助計画）の具体性' },
      { key: 'ep', label: 'EP（教育計画）の適切さ' },
      { key: 'individual', label: '患者の個別性' },
      { key: 'evidence', label: '根拠データとの一致' }
    ];
    // 看護問題の種類ごとに、OPで見ておきたいこと（不足の確認に使う）・計画の中に出てきてほしい言葉・目標の例
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
    // 「睡眠パターン混乱」がせん妄（混乱）の型に読まれないよう、睡眠をせん妄より前に置く
    { const sd = CP_DOMAINS.splice(CP_DOMAINS.findIndex(d => d.key === 'sleep'), 1)[0]; CP_DOMAINS.splice(CP_DOMAINS.findIndex(d => d.key === 'delirium'), 0, sd); }
    // 糖尿病の足潰瘍・家族の知識不足は、褥瘡・知識不足とは観察・目標が違うので、それぞれの前に入れる（2026-10-07.8）
    CP_DOMAINS.splice(CP_DOMAINS.findIndex(d => d.key === 'skin'), 0, { key: 'dmfoot', re: /足潰瘍|足病変|糖尿病性足|足壊疽/, words: /足|潰瘍|滲出|免荷|発赤|靴/,
      op: [['潰瘍の大きさ・深さ・滲出液・発赤・熱感・臭い', /大きさ|深さ|滲出|発赤|熱感|臭/], ['足趾・足底の感覚（モノフィラメント）と足背動脈の触知', /感覚|モノフィラメント|足背|触知/], ['足の皮膚（乾燥・亀裂・胼胝・水疱）と靴・靴下', /乾燥|亀裂|胼胝|水疱|靴/], ['血糖値・WBC・CRP', /血糖|WBC|CRP/], ['免荷（荷重制限）が守れているか', /免荷|荷重/]],
      goal: () => '1週間後までに、潰瘍が直径1.5cm以下となり、滲出液・発赤が見られない' });
    CP_DOMAINS.splice(CP_DOMAINS.findIndex(d => d.key === 'know'), 0, { key: 'fam', re: /家族/, words: /家族|妻|夫|食事|指導|説明/,
      op: [['家族の言葉・不安・負担', /言葉|不安|負担/], ['家族が理解していること・できていること', /理解|できて/], ['面会時の様子・協力の状況', /面会|協力/]],
      goal: () => '退院までに、家族が患者の食事・服薬・症状が出たときの対応を、自分の言葉で説明できる' });
    // 手本（この患者の記録を使った、実習中に実施・評価できる計画の例）。学生に考えさせすぎず、まず見本を示す
    // 鎮痛の援助：薬の種類・投与経路・効果が出る時間・すでに行われている鎮痛（PCA・硬膜外）で変わるので、「30分前」のような一律の時間は書かない
    function cpAnalgesiaTp(c, act) {
      if (c && c.pca) return `すでに${c.epidural ? '硬膜外' : ''}PCAなどで鎮痛が行われているため、追加の鎮痛薬は医師・麻酔科の指示を確認してから使う。${act}の前に、痛みが抑えられているか、PCAを患者が必要なときに自分で使えているかを確認する`;
      return `鎮痛薬は、薬の種類・投与経路（内服・坐薬・注射など）ごとに効果が出る時間が違うため、医師の指示と薬剤情報で確認し、効果が出る時間に合わせて${act}ができるよう調整し、効果を再評価する`;
    }
    function cpAnalgesiaSafetyOp(c) {
      return c && c.opioid ? `鎮痛薬（オピオイド${c.epidural ? '・硬膜外' : ''}）の安全面：呼吸数・SpO2、眠気・鎮静の程度、血圧低下、悪心・かゆみ${c.epidural ? '、下肢のしびれ・脱力' : ''}を観察する` : '';
    }
    const CP_MODELS = {
      pain: c => ({ goalLong: `退院までに、${c.painSite || '痛み'}がNRS3以下で、痛みを我慢せずに自分から看護師へ伝えながら、トイレまで歩ける`,
        // すでにNRS3以下なら、数値の目標は達成済みなので、体動時の機能の目標にする（記録にない基準値は作らない）
        goalShort: c.nrs != null && c.nrs <= 3 ? '2日後までに、体動時の疼痛が患者と相談した許容範囲に収まり、必要な深呼吸や体位変換を実施できる'
          : `2日後までに、安静時の${c.painSite || '痛み'}が${c.nrs != null ? `NRS${c.nrs}から` : ''}NRS3以下となり、苦痛なく休息できる`,
        opExtra: [cpAnalgesiaSafetyOp(c)].filter(Boolean),
        tp: [cpAnalgesiaTp(c, '体動・清拭・歩行'), '創部を圧迫しないよう、枕を使って膝を軽く曲げた体位に整える', '起き上がるときは創部を手で支えられるよう、ゆっくり一緒に動く'],
        ep: ['痛みは我慢せず、0〜10の数字（NRS）で伝えてよいことを説明し、今の痛みを数字で答えてもらって確認する', '創部を手で支えて起き上がる方法を実演し、1回やってもらう'] }),
      inf: c => {
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
        goalShort: `3日後までに、${/低血糖/.test(c.text || '') ? '低血糖への心配' : '心配なこと'}を自分の言葉で看護師に話せ、${/低血糖/.test(c.text || '') ? '心配への対処（ブドウ糖を手元に置く・症状が出たら知らせる）を言える' : '心配への対処を1つ言える'}`,
        tp: ['日勤・夜勤の看護師が1日1回、決まった時間に5分以上、気持ちを聞く時間をとる', ...(/低血糖/.test(c.text || '') ? ['低血糖が起きたときの対処の手順を一緒に紙に書き、枕元に置く'] : ['心配なことを一緒に紙に書き出し、答えられるものから説明する'])],
        ep: ['不安なときは我慢せず、いつでも看護師を呼んでよいことを説明し、呼び方を言ってもらって確認する'],
        opFirst: '睡眠の状況（眠れているか・途中で目が覚めるか）を、まず確認する' }),
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
      nutr: c => ({ goalLong: '退院までに、必要な摂取量を維持し、体重が減らない', goalShort: '1週間後までに、食事を毎食7割以上食べられ、体重が今より減らない',
        opExtra: [c.weightLoss ? `術前からの体重減少（${c.weightLoss}）と、術前の食習慣・食事量を踏まえて、栄養状態の弱さを評価する` : ''].filter(Boolean),
        op: ['食事・水分の摂取量（割・mL）と、摂取できない理由（悪心・疼痛・嚥下・食欲）', '体重の推移（同じ条件で測る）', 'Alb・TPなどの検査値（絶飲食・手術の影響を考えて、経過で評価する）', '絶飲食・食事開始の指示と、輸液など栄養補給の内容', '口腔内の状態・義歯・食形態が合っているか'],
        tp: ['食事開始・食上げの指示を確認し、段階に合わせた食形態・一口量で介助する', '食事の前に口腔ケアと座位の体位調整を行い、痛みや吐き気があれば、指示の範囲で鎮痛・制吐を調整してから摂取を促す', '摂取量が少ないときは医師・栄養士へ報告し、補助食品などの導入を相談する'],
        ep: ['手術後の食事の進め方（量・速さ・よく噛む）と、むかつき・膨満が出たときの知らせ方を説明し、自分の言葉で言ってもらう', ...(c.gastric ? ['食事が始まってから退院前までの回復の段階に合わせて、少量を回数多く食べること・ダンピング症候群の症状と対処・栄養外来などでの経過観察・（胃全摘の場合）ビタミンB12補充の必要性を、医師・栄養士から指示・説明があった範囲で一緒に確認する'] : [])] }),
      act: c => c.risk ? ({ goalLong: '', goalShort: '',
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
    function cpModelFor(plan, ctx) {
      const d = cpDomainOf(plan);
      if (!d || !CP_MODELS[d.key]) return null;
      const risk = cpIsRisk(plan);
      const m = CP_MODELS[d.key]({ ...(ctx || {}), risk });
      const op = m.op ? [...m.op] : (d.op || []).slice(0, 5).map(([l]) => `${l}を観察する`);
      if (m.opFirst) op.unshift(m.opFirst);
      if (m.opExtra) op.push(...m.opExtra);
      // ドレーン・カテーテルの記録が無い患者に、ドレーン排液・尿の観察を出さない（傷の滲出液にする）
      if (d.key === 'inf' && !/ドレーン|カテーテル|バルーン|膀胱留置/.test((ctx && ctx.text) || '')) { const k = op.findIndex(t => /ドレーン/.test(t)); if (k >= 0) op[k] = '傷の滲出液の量・色・においを観察する'; }
      if (d.key === 'inf' && /糖尿病/.test((ctx && ctx.text) || '')) op.push('血糖値の推移（高血糖は傷が治りにくく、感染しやすい）を観察する');
      const out = { ...m, op };
      // リスクの問題は、起きていない合併症の「予防・早期発見」の目標にする（回復の目標と同じ型にしない）
      if (risk) { const g = cpRiskGoalFor(plan, ctx || {}); out.goalLong = g.long; out.goalShort = g.short; }
      // 患者が実際に質問・心配した内容を、教育計画の先頭に入れる
      const edu = cpEducationLines((ctx && ctx.text) || '').filter(e => e.dom === d.key).map(e => e.line);
      if (edu.length) out.ep = cpUnionLines(edu, out.ep || []);
      return out;
    }
    function cpDomainOf(plan) {
      const head = String((plan && plan.problem) || '').normalize('NFKC');
      return CP_DOMAINS.find(d => d.re.test(head)) || null;
    }
    // 記録の中の、目標の例に使う値（いちばん新しいもの）
    function cpRecordContext(cp) {
      const items = ((cp && cp.items) || []).filter(i => i && !i.deleted && !i.aiSuggested && i.text && i.type !== 'unnecessary');
      const text = [String((cp && cp.sourceText) || ''), ...items.map(i => i.text)].join('\n').normalize('NFKC');
      const last = (re) => { const all = [...text.matchAll(re)]; return all.length ? all[all.length - 1] : null; };
      const nrs = last(/NRS\s*[:：]?\s*(\d{1,2})(?!\d)/g);
      const spo2 = last(/SpO2\s*[:：]?\s*(\d{2,3})\s*%/g);
      const site = /創部痛|創痛|創部/.test(text) ? '創部痛' : /腰痛/.test(text) ? '腰痛' : '';
      const skin = (text.match(/(仙骨部|踵部?|大転子部|尾骨部)[^\n]{0,6}発赤/) || [])[1];
      return { nrs: nrs ? Number(nrs[1]) : null, spo2: spo2 ? Number(spo2[1]) : null, painSite: site, skin: skin ? `${skin}の発赤` : '',
        stoma: /ストーマ|ストマ|人工肛門/.test(text), urinary: /膀胱留置|バルーン|尿道カテーテル/.test(text), text,
        // 鎮痛・手術・体重の変化など、計画の書き分けに使う記録の事実
        pca: /PCA|硬膜外/.test(text), epidural: /硬膜外/.test(text), opioid: /フェンタニル|モルヒネ|オピオイド|オキシコドン|ペンタゾシン|トラマドール|PCA|硬膜外/.test(text),
        gastric: /胃(?:全摘|切除|亜全摘)/.test(text), gastricTotal: /胃全摘|胃を全摘/.test(text),
        weightLoss: ((text.match(/(\d+\s*(?:か月|ヶ月|カ月|週間?)(?:で|間に|間で)?\s*(?:体重(?:が)?)?\s*\d+(?:\.\d+)?\s*kg\s*(?:減|低下|やせ|減少))/) || text.match(/(体重(?:が)?\s*\d+(?:\.\d+)?\s*kg\s*(?:減|低下|減少))/) || [])[1] || '').replace(/\s+/g, '') };
    }
    // 目標の4つの要素（いつまでに・患者が・どうなる・何をもって達成と判断するか）
    const CP_GOAL_DEADLINE = /\d+\s*(?:日|週間?|時|か月|ヶ月|カ月)(?:後|間|目|以内|まで)?|本日|今日|明日|今週|退院(?:時|まで|後)|術後\s*\d+\s*日|離床まで|入院中|勤務終了|\d{1,2}\/\d{1,2}/;
    const CP_GOAL_MEASURE = /\d|NRS|VAS|SpO2|回|割|％|%|mL|kg|自立|できる|言える|話せる|説明でき|見られない|起こらず|起こらない|ない$|なく|がない|以内|以下|以上|未満/;
    const CP_GOAL_NURSE = /(?:させる|させない|を行う|行う$|を促す|を指導する|指導する|援助する|観察する|を図る|に努める|ケアする)/;
    const CP_GOAL_ABSTRACT = /(?:軽減|改善|安定|緩和|減少|増加|向上|保持|維持|解消|消失|安心|理解)(?:する|される|できる|が図れる|を図る|している)?。?$/;
    // 実習中（数日〜2週間）に評価できない期限：時刻・本日中・数時間後など
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
      // 「理解する」「イメージを持つ」だけで、何ができればよいかが書かれていない目標
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
    // 計画の中で「1行が短く、いつ・どのように・どのくらいが書かれていない」TP（例：安楽な体位にする）
    const CP_TP_SPECIFIC = /\d|時|毎|ごと|前|後|まで|ように|方法|回|分|枕|クッション|側臥位|ファーラー|座位|〜|から|ずつ|一緒|見守|介助|声をかけ|確認し|調整|使い|使って/;
    // 観察・把握・確認だけのTPは、OP（観察計画）に書く内容
    const CP_TP_OBS = /(?:状況|状態|様子|程度|有無|変化|症状|反応|経過|値|量)(?:を|の)?(?:把握|観察|確認|測定|チェック)(?:する|します)?。?$|(?:を|の)(?:把握|観察|モニタリング|モニター|チェック)(?:する|します)?。?$/;
    function cpObservationLines(lines) { return (lines || []).filter(l => CP_TP_OBS.test(String(l).normalize('NFKC').trim())); }
    const CP_EP_VAGUE = /(?:方法|対応|注意点|必要性|重要性|内容|こと|仕方)(?:を|について)?(?:伝える|説明する|指導する|話す|教える)。?$/;
    const CP_EP_CHECK = /復唱|説明してもら|説明できる|実演|デモ|やってもら|言ってもら|話してもら|理解(?:度|を確認)|確認する|確認し|質問|チェックリスト|テスト|ティーチバック/;
    function cpVagueLines(lines) {
      return (lines || []).filter(l => { const t = String(l).normalize('NFKC'); return t.length < 16 && !CP_TP_SPECIFIC.test(t); });
    }
    // 関連図の同じ看護問題（名前が同じか、種類が同じ）と、そこへたどれる記録の事実（症状・検査・患者の情報）
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
      // 疾患の成り立ちの背景（喫煙歴など、疾患より手前の情報）は、看護問題の根拠データには入れない
      const dz = new Set();
      const dstack = map.nodes.filter(n => n.type === 'disease').map(n => n.id);
      dstack.forEach(id => dz.add(id));
      while (dstack.length) { const id = dstack.pop(); map.edges.forEach(e => { if (e.target === id && !dz.has(e.source)) { dz.add(e.source); dstack.push(e.source); } }); }
      return map.nodes.filter(n => seen.has(n.id) && n.id !== node.id && !dz.has(n.id) && n.observed !== false && n.source !== 'knowledge'
        && !/^治療[:：]/.test(String(n.label)) && !map.nodes.some(d => d.type === 'disease' && String(d.label).slice(0, 10) === String(n.label).slice(0, 10)) && ['symptom', 'lab', 'vital', 'medication', 'assessment', 'patient_fact'].includes(n.type)).map(n => { const t = String(n.label); return /^[（(].*[)）]$/.test(t) ? t.slice(1, -1) : t; }).slice(0, 8);
    }
    // 根拠データの値（「NRS 6」「SpO2 92%」「WBC 12800」など）が、計画（目標・OP）の中で見る値になっているか
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
    // 計画をチェックする（AIなし）。戻り値：{ domain, items:[{ key, label, level:'ok'|'warn'|'info', msgs:[] , add?:[] }], goalExample, evidence }
    function reviewCarePlan(cp, plan) {
      const p = normalizeCarePlan({ ...plan });
      const dom = cpDomainOf(p);
      const ctx = cpRecordContext(cp);
      const goal = p.goalShort || p.goalLong;
      const body = [p.goalShort, p.goalLong, ...p.op, ...p.tp, ...p.ep].join('\n').normalize('NFKC');
      const opText = p.op.join('\n').normalize('NFKC');
      const out = [];
      const push = (key, msgs, { level, ...extra } = {}) => out.push({ key, label: CP_REVIEW_ITEMS.find(i => i.key === key).label, level: msgs.length ? (level || 'warn') : 'ok', msgs, ...extra });
      // 1 看護問題との整合性
      const fit = [];
      if (!p.problem.trim()) fit.push('看護問題が書かれていません');
      else if (!dom) fit.push('看護問題の種類を読み取れませんでした（計画の内容が看護問題に合っているか、自分で確かめてください）');
      else if (body && !dom.words.test(body)) fit.push(`「${p.problem}」の計画ですが、目標・OP・TP・EPに、この問題に関係する言葉（${String(dom.words.source).split('|').slice(0, 4).join('・')}など）が見当たりません`);
      push('fit', fit, { level: !dom && p.problem.trim() ? 'info' : 'warn' });
      // 2 目標
      const gc = cpGoalCheck(goal);
      const goalExample = dom && dom.goal ? dom.goal(ctx) : '';
      const goalMsgs = [...gc.msgs];
      if (!String(p.goalLong || '').trim()) goalMsgs.push('長期目標が空欄です。退院時・退院後にどうなっていてほしいか（期限つき）を書き、短期目標はそこへ向かう途中の段階にします');
      push('goal', goalMsgs, { goal: gc, example: goalMsgs.length ? goalExample : '' });
      // 3 OPの不足
      const opMsgs = [], add = [];
      if (!p.op.length) opMsgs.push('OP（観察計画）がまだありません');
      if (dom && dom.op) {
        const miss = dom.op.filter(([, re]) => !re.test(opText)).map(([l]) => l);
        if (miss.length) { opMsgs.push(`${p.problem || 'この'}の計画ですが、OPに「${miss.join('」「')}」が不足していないか確認してください`); add.push(...miss); }
      }
      const vagueVital = p.op.filter(l => /^(?:バイタル(?:サイン)?(?:を|の)?(?:観察|測定|確認)(?:する)?|全身状態(?:を|の)?観察(?:する)?)$/.test(String(l).normalize('NFKC').replace(/[。\s]/g, '')));
      if (vagueVital.length) opMsgs.push(`「${vagueVital[0]}」だけでは、何を何のために見るのかがわかりません。見る値と、どうなったら報告するか（例：体温38℃以上・SpO2 93%以下で報告）を書いてみましょう`);
      push('op', opMsgs, { add });
      // 4 TPの具体性
      const tpMsgs = [];
      if (!p.tp.length) tpMsgs.push('TP（援助計画）がまだありません');
      cpVagueLines(p.tp).forEach(l => tpMsgs.push(`「${l}」：いつ・どのように・どのくらい行うかを書いてみましょう（例：${/体位/.test(l) ? '創部を圧迫しないよう、枕を使って膝を軽く曲げた側臥位にする。2時間ごとに体位を変える' : /清拭|清潔/.test(l) ? '午前中の鎮痛薬が効いている時間に、背部・下肢の清拭を介助する' : /歩行|離床|リハビリ/.test(l) ? '鎮痛薬を使って30分後に、看護師が付き添って病棟の廊下を1往復歩く' : '誰が・いつ・何を使って・どこまで行うか'}）`));
      const obsTp = cpObservationLines(p.tp);
      obsTp.forEach(l => tpMsgs.push(`「${l}」は観察・把握なので、TPではなくOP（観察計画）に書きます。TPには、看護師が実施する援助（例：一緒に手技を行う、体位を整える、介助する）を書きます`));
      push('tp', tpMsgs, { moveToOp: obsTp });
      // 5 EPの適切さ
      const epMsgs = [];
      if (!p.ep.length) epMsgs.push('EP（教育計画）がまだありません。患者・家族に何を伝え、何ができるようになってほしいかを書いてみましょう');
      p.ep.filter(l => /説明する|指導する|伝える/.test(l) && String(l).length < 14).forEach(l => epMsgs.push(`「${l}」：何を説明するのか（内容）を書いてみましょう`));
      if (dom && dom.key === 'pain' && p.ep.length && !/我慢|伝え|知らせ|ナースコール/.test(p.ep.join(''))) epMsgs.push('痛みを我慢せずに伝えてよいこと（伝え方）がEPに入っているか確認してください');
      if (dom && ['fall', 'bleed', 'glu'].includes(dom.key) && p.ep.length && !/ナースコール|伝え|知らせ|呼/.test(p.ep.join(''))) epMsgs.push('危ないとき・症状が出たときに、看護師をどう呼ぶか（伝えるか）がEPに入っているか確認してください');
      p.ep.filter(l => CP_EP_VAGUE.test(String(l).normalize('NFKC').trim()) && String(l).length < 24 && !/[：:（(、]/.test(l)).forEach(l => epMsgs.push(`「${l}」：何を説明するのか（具体的な内容。例：症状・そのときの行動・連絡の仕方）と、理解をどう確認するか（自分の言葉で説明してもらう・実演してもらう）まで書いてみましょう`));
      if (p.ep.length && !CP_EP_CHECK.test(p.ep.join('\n').normalize('NFKC'))) epMsgs.push('理解をどう確認するか（例：自分の言葉で説明してもらう、実演してもらう、パンフレットを見ながら質問を聞く）がEPに入っていません');
      push('ep', epMsgs);
      // 6 患者の個別性（記録にある値・言葉・治療が計画に入っているか）
      const indMsgs = [];
      const specific = [/\d/, /創部|仙骨部|下肢|右|左/, ctx.stoma ? /ストーマ|パウチ/ : null, /「[^」]+」/].filter(Boolean);
      const own = (typeof findDrugsInText === 'function' ? findDrugsInText(ctx.text).map(x => x.drug && x.drug.name).filter(Boolean) : []).filter(nm => body.includes(nm));
      if (body.trim() && !own.length && !specific.some(re => re.test(body))) indMsgs.push('この患者の記録にある値・言葉・治療（NRSの値、部位、使っている薬、本人の言葉など）が計画に入っていません。どの患者にも当てはまる計画になっていないか確認してください');
      push('individual', indMsgs);
      // 7 根拠データとの一致（関連図の同じ看護問題へたどれる記録の事実）
      const mp = cpMapProblemFor(cp, p);
      const evidence = (p.evidence && p.evidence.length ? p.evidence : (mp ? mp.evidence : []));
      const evMsgs = [];
      if (!evidence.length) push('evidence', ['関連図にこの看護問題が無いため、根拠データと照らし合わせられません（関連図を作るか、根拠を自分で確かめてください）'], { level: 'info' });
      else {
        const keys = cpEvidenceKeys(evidence).filter(k => !new RegExp(k === '体温' ? '体温|℃|熱' : k === '排便' ? '排便|便' : k.replace(/[-]/g, '.?'), 'i').test(body));
        if (keys.length) evMsgs.push(`根拠データの「${keys.join('」「')}」が、目標・OPで見る値になっていません（根拠になった値の変化を追えるようにしましょう）`);
        // 目標の中のいちばん後ろのNRS（「NRS5からNRS3以下」なら3）を、目指す値とする
        const goalNrs = [...String(goal || '').normalize('NFKC').matchAll(/NRS\s*(\d+)/g)].map(m => Number(m[1])).pop();
        if (dom && dom.key === 'pain' && ctx.nrs != null && goalNrs != null && goalNrs >= ctx.nrs) evMsgs.push(`目標のNRSが、今の記録（NRS${ctx.nrs}）より下がっていません`);
        push('evidence', evMsgs, { evidence });
      }
      return { domain: dom ? dom.key : null, items: out, goalExample, evidence, model: cpModelFor(p, ctx) };
    }
    function cpReviewCount(review) { return review.items.filter(i => i.level === 'warn').length; }

    // ==========================================================================
    // 看護計画の品質管理（2026-10-08.24）
    //   記録 → 看護問題 → 根拠の検証 → 重複の統合 → 優先順位 → 目標・OP/TP/EP → 実施 → 評価 → 修正
    //   ・同じ意味の看護問題は1つにまとめる（言い回しが違っても。リスクと現在の問題は別）
    //  ・現在の問題として言い切れる根拠がなければ、リスク状態にする／判断するための情報が不足していると示す
    //  ・計画どうしの参照は、計画のID（番号は表示だけ）で持ち、消した・まとめた計画は自動で外す
    //   ・表示する前の自動チェック（cpQualityGate）で、問題のある計画に印をつける
    //   ・実施や評価の記録は、利用者が書いたものだけ（自動では作らない）
    // ==========================================================================
    const CP_RISK_RE = /リスク|可能性|おそれ|危険/;
    function cpNorm(t) { return String(t || '').normalize('NFKC'); }
    function cpIsRisk(plan) { return CP_RISK_RE.test(cpNorm(plan && plan.problem)); }
    // 看護問題の「意味の鍵」：種類（domain）＋細かい種類＋リスクかどうか。名前の言い回しが違っても同じ鍵になる
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
    // 重複の統合：同じ鍵の計画を1つにまとめ、それぞれにしかない観察・援助・教育・根拠・記録を残す。まとめた計画は印（mergedInto）だけ残す
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
    // 同じ種類・同じ意味でも、別の問題として残す場合（現在の問題とリスクなど）は、違いを計画に書く
    function cpExplainDistinct(cp) {
      const list = carePlanList(cp);
      list.forEach(p => {
        const k = cpPlanKey(p).split(':')[0];
        const other = list.find(q => q.id !== p.id && cpPlanKey(q).split(':')[0] === k);
        if (other) p.distinct = `「${other.problem}」とは別の問題です：${cpIsRisk(p) ? 'こちらはまだ起きていない合併症の予防（リスク）' : 'こちらはすでに現れている問題への援助'}として分けています`;
        else delete p.distinct;
      });
    }
    // ---- 根拠の検証：その看護問題を「いま起きている問題」と言える所見があるか ----
    // actual＝現在の問題を直接示す所見／riskRe＝リスクの要因／contra＝反対の所見／riskName＝言い切れないときの名前
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
    // 時期：入院前の所見だけで「いまの問題」と決めないよう、現在の問題の判定には入院後（または時期不明）の記録を使う
    function cpEvidenceTexts(cp) {
      const items = ((cp && cp.items) || []).filter(i => i && !i.deleted && !i.aiSuggested && i.text && i.type !== 'unnecessary');
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
    // 自動で作った計画は、言い切れないとき（リスクと判断できるとき）にリスク状態へ直す。自分で書いた計画の名前は変えず、印だけつける
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
    // ---- 優先順位：決まった順番ではなく、生命・ABC・緊急度・合併症の重大さ・痛みと機能・患者の訴え・時期で決める ----
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
      if (list.some(p => p.orderLocked)) return; // 利用者が順番を動かした計画があるときは、並べ替えない（理由だけ更新）
      scored.sort((a, b) => b.score - a.score || (Number(a.p.order) || 0) - (Number(b.p.order) || 0));
      scored.forEach((x, n) => { x.p.order = n + 1; });
    }
    // ---- 目標：問題の種類（現在の問題／リスク）と記録の値に合わせる ----
    const CP_RISK_GOALS = {
      resp: c => ({ long: '退院までに、呼吸器合併症（肺炎・無気肺）の徴候（発熱・SpO2低下・呼吸音の変化・痰の増加）を認めず、自分で深呼吸と咳嗽を行える', short: `${c.post ? '術後3日目まで' : '3日後までの観察期間中'}、発熱・SpO2低下（${c.spo2 && c.spo2 < 95 ? '現在の値から低下しない' : '95%未満になる'}ことなく）・呼吸音の変化を認めず、創部を保護しながら深呼吸と咳嗽を自分で実施できる` }),
      ileus: () => ({ long: '退院までに、消化管運動の回復が順調に経過し、食事が進められる', short: '3日後までの観察期間中、腹部膨満・反復する嘔吐・排ガス停止などの異常を認めず、異常が起きたときにすぐに対応できる' }),
      inf: () => ({ long: '退院まで、創部・刺入部に感染の徴候（発赤・腫脹・熱感・滲出液・においの増加）を認めない', short: '3日後までの観察期間中、創部・刺入部の所見が初回の記録より悪化せず、発熱が持続せず、異常があればすぐに報告・対応できる' }),
      vte: () => ({ long: '離床が進むまで、下肢の腫脹・痛み・左右差や肺塞栓の徴候（胸痛・呼吸困難）を認めない', short: '3日後までの観察期間中、下肢の腫脹・痛みがなく、許可された範囲で足関節運動・離床を行える' }),
      bleed: () => ({ long: '入院中、出血の徴候を認めない', short: '3日後までの観察期間中、出血の徴候（創部・ドレーン排液・皮下出血・血便など）を認めず、気づいたときに看護師へ伝えられる' }),
      nutr: c => ({
        // 全摘後などは、食事の量・進め方は術後の指示と耐えられる程度で決まるので、「5割以上」のような一律の割合は目標にしない。早期の食事の耐性と、長期の栄養の確保を分ける
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
    // 患者の質問・心配から、教育計画に入れる内容（記録にあるときだけ。「分かりました」だけで習得とはしない）
    function cpEducationLines(text) {
      const t = cpNorm(text);
      const out = [];
      if (/呼吸(?:訓練|練習|リハ)|スパイロ|インセンティブ/.test(t) && /目的|なぜ|何のため|やり方|方法|合って|どう(?:すれ|やっ)|質問|わから|分から/.test(t)) out.push({ dom: 'resp', line: '呼吸訓練の目的（無気肺・肺炎の予防）と正しい方法を説明し、患者自身に実施してもらい、手技と理解を確認する（「分かりました」の返事だけで習得したとはみなさず、実施する様子を見て確認する）' });
      if (/食事|食べ|食べて|飲水|飲んで/.test(t) && /いつから|いつ(?:から)?食べ|食べてい?い|大丈夫|質問|どのくらい/.test(t)) out.push({ dom: 'ileus', line: '術後の食事の開始時期・進め方・食べるときの注意（少量ずつ・ゆっくり・腹部症状が出たら知らせる）を説明し、患者の疑問に答えたうえで、自分の言葉で言ってもらい理解を確認する' });
      if (/合併症|イレウス|感染|縫合不全/.test(t) && /心配|不安|怖|大丈夫か/.test(t)) out.push({ dom: 'anx', line: '患者が心配している術後合併症について、予防の方法と、早期に知らせてほしい症状を説明し、質問を聞いて理解を確認する' });
      return out;
    }
    // 記録にない手術・処置・薬の言葉が、計画に出ていないか（別の患者の計画の流用を防ぐ）
    const CP_CASE_TERMS = [[/ストーマ|パウチ/, 'ストーマ'], [/股関節|脱臼肢位|人工骨頭/, '股関節'], [/インスリン/, 'インスリン'], [/胃管|NGチューブ|経鼻胃管/, '胃管'], [/膀胱留置|バルーン|尿道カテーテル/, '尿道カテーテル'], [/ドレーン/, 'ドレーン'], [/酸素(?:投与|吸入|カニュ)/, '酸素投与'], [/CV|中心静脈/, '中心静脈カテーテル'], [/弾性ストッキング|フットポンプ/, '弾性ストッキング']];
    function cpForeignTerms(cp, plan) {
      const text = cpEvidenceTexts(cp).all;
      const body = cpNorm([plan.problem, plan.goalLong, plan.goalShort, ...plan.op, ...plan.tp, ...plan.ep].join('\n'));
      return CP_CASE_TERMS.filter(([re]) => re.test(body) && !re.test(text)).map(([, name]) => name);
    }
    // ---- 計画どうしの参照（計画のIDで持つ）----
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
        // 文章の中の「「〇〇」の計画」のうち、この患者の計画にないものは取り除く
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
    // 計画の関連づけ：低血糖への不安など、関係する計画があるときだけ、IDで参照を持つ
    function cpLinkRelatedPlans(cp) {
      const list = carePlanList(cp);
      const gluPlan = list.find(p => (cpDomainOf(p) || {}).key === 'glu');
      const anx = list.find(p => (cpDomainOf(p) || {}).key === 'anx');
      if (gluPlan && anx && /低血糖/.test(cpEvidenceTexts(cp).all) && !(anx.refs || []).some(r => r.id === gluPlan.id)) anx.refs = [...(anx.refs || []), { id: gluPlan.id, why: '低血糖が起きたときの対処手順の説明は、この計画で行う' }];
    }
    // ---- 表示前の自動チェック ----
    const CP_PLACEHOLDER = /患者の状態に合わせて|を和らげる援助|(?:状態|様子)を観察する。?$|経過を(?:見る|みる)。?$|検査値を確認する。?$|(?:状態|経過)を確認する。?$|数日以内に/;
    function cpQualityGate(cp) {
      const list = carePlanList(cp);
      const all = [];
      const seen = new Map();
      list.forEach((p, k) => {
        const qa = [];
        const add = (code, level, msg) => qa.push({ code, level, msg });
        const key = cpPlanKey(p);
        if (seen.has(key)) add('duplicate', 'warn', `「${seen.get(key)}」と同じ意味の看護問題です。1つにまとめてください`); else seen.set(key, p.problem);
        if (p.caseId && cp.id && p.caseId !== cp.id) add('foreign', 'error', '別の患者の計画が混ざっています。この患者の記録で確かめてください');
        cpForeignTerms(cp, p).forEach(t => add('foreign-term', 'warn', `この患者の記録にない「${t}」が計画に出ています。別の患者の計画の流用ではないか確認してください`));
        const v = validateCarePlanEvidence(cp, p); // Recheck current evidence; a saved validation may be stale.
        if (v.kind === 'insufficient') add('unsupported', 'warn', (v.msgs[0] || '現時点では判断するための情報が不足しています'));
        if (v.kind === 'conflict') add('conflict', 'warn', v.msgs[0]);
        if (v.kind === 'risk' && v.msgs[0] && !cpIsRisk(p)) add('should-be-risk', 'warn', v.msgs[0]);
        if (!(p.evidence && p.evidence.length) && p.source !== 'manual' && p.source) add('no-evidence', 'info', '根拠データ（記録の事実）が紐づいていません');
        // 記録の根拠（観察事実）と医学文献に裏付けられた介入の根拠は別。
        // 医学的介入を含むAI生成案には専門的な妥当性・適用条件の照合を促す。
        // 計画そのものを根拠なく確定したり、自動的に消したりしない。
        if (p.source === 'ai' && Array.isArray(p.tp) && p.tp.length > 0) {
          add('clinical-guidance-review', 'info',
            'AI生成のTPは記録との一致だけでは医学的妥当性を保証できません。公的ガイドライン等の出典、適用条件、禁忌、実施権限を確認してください');
        }
        if (p.evidence && p.evidence.length) {
          const text = cpEvidenceTexts(cp).all.replace(/\s/g, '');
          (p.evidence || []).forEach(e => { const s = cpNorm(e).replace(/\s/g, ''); if (s.length >= 4 && !text.includes(s.slice(0, Math.min(s.length, 12)))) add('evidence-missing', 'warn', `根拠「${e}」がこの患者の記録に見当たりません`); });
        }
        const goals = [p.goalLong, p.goalShort].join('\n');
        if (cpIsRisk(p) && /(?:リスク(?:状態)?|おそれ)が?(?:改善|軽減|解消|低下)|(?:イレウス|肺炎|感染|血栓)が?(?:改善|軽快|治癒)/.test(cpNorm(goals))) add('risk-as-treatment', 'warn', 'リスクの計画なのに、すでに起きた合併症の回復のような目標になっています（予防・早期発見・安全の維持で書きます）');
        const ctx = cpRecordContext(cp);
        const gNrs = [...cpNorm(p.goalShort || p.goalLong).matchAll(/NRS\s*(\d+)/g)].map(m => Number(m[1])).pop();
        if ((cpDomainOf(p) || {}).key === 'pain' && ctx.nrs != null && gNrs != null && gNrs >= ctx.nrs) add('goal-achieved', 'warn', `目標のNRS${gNrs}以下は、記録の値（NRS${ctx.nrs}）ですでに達成されています。機能・生活に関わる目標にします`);
        const body = [p.goalLong, p.goalShort, ...p.op, ...p.tp, ...p.ep];
        const ph = body.filter(l => CP_PLACEHOLDER.test(cpNorm(l)));
        if (ph.length) add('placeholder', 'warn', `定型文のままの項目があります：「${String(ph[0]).slice(0, 24)}…」`);
        if (!p.goalShort && !p.goalLong && p.source) add('no-goal', 'info', '目標が未記入です');
        // 目標：曖昧な言い方・評価できない目標（期限・測れる基準・患者が主語）
        [['goalLong', '長期目標'], ['goalShort', '短期目標']].forEach(([f, label]) => {
          const g = cpNorm(p[f]);
          if (!g.trim()) return;
          if (/数日以内|観察の値が改善に向かう|欲求が自分で満たせる|改善に向かう$/.test(g)) add('vague-goal', 'warn', `${label}が曖昧です（「${g.slice(0, 20)}…」）。いつまでに・どうなれば達成かを書きます`);
          else { const gc = cpGoalCheck(g); if (!gc.deadline || !gc.measure) add('goal-weak', 'info', `${label}：${gc.msgs[0] || '期限か達成の基準が足りません'}`); }
        });
        if (p.genKey && p.genKey !== key) add('regen-needed', 'warn', '看護問題が変わっています。目標・OP/TP/EPが古い問題のままではないか確認し、「この問題で作り直す」で作り直せます');
        // OP：何を見るか／TP：何をどの条件でするか／EP：何を伝え、どう理解を確かめるか
        p.op.filter(l => cpNorm(l).replace(/[\s。]/g, '').length < 12 || /^(?:状態|経過|程度|様子)(?:を|の).{0,6}(?:観察|確認)(?:する)?。?$/.test(cpNorm(l).replace(/\s/g, ''))).forEach(l => add('op-vague', 'warn', `OPが具体的ではありません：「${l}」（何を・どんな変化に注意して見るかを書きます）`));
        p.tp.filter(l => cpNorm(l).length < 18 || !/指示|許可|範囲|確認|中止|報告|前後|再評価|評価|一緒|介助|調整|整える|行う|使/.test(l)).forEach(l => add('tp-vague', 'warn', `TPが具体的ではありません：「${l}」（行う援助・条件・安全上の注意・反応の確かめ方を書きます）`));
        if (p.ep.length && p.ep.some(l => !CP_EP_CHECK.test(cpNorm(l)))) add('ep-no-check', 'warn', 'EPに、理解や手技をどう確かめるか（実施してもらう・自分の言葉で言ってもらう等）がない項目があります。「分かりました」だけで習得とはしません');
        if (!p.op.length && p.source) add('no-op', 'info', 'OP（観察計画）が未記入です'); if (!p.tp.length && p.source) add('no-tp', 'info', 'TP（援助計画）が未記入です'); if (!p.ep.length && p.source) add('no-ep', 'info', 'EP（教育計画）が未記入です');
        // 医師の指示・安静度に反する援助
        if (/ベッド上安静|床上安静|安静度[:：]?\s*ベッド上|離床(?:不可|禁止)/.test(cpEvidenceTexts(cp).now) && p.tp.some(l => /歩行|端座位|立位|離床を進め/.test(cpNorm(l)) && !/許可|指示|範囲/.test(l))) add('order-conflict', 'warn', '安静度の指示がある記録です。離床・歩行の援助には「医師の指示・許可の範囲で」と書き、指示を確認してください');
        // 実施・評価の記録は、日時と内容がそろっているものだけ（自動作成はしない）
        p.records.forEach(r => { if (!r.at || !(r.doneText || r.doneItems.length || r.evaluation)) add('record-empty', 'info', '日時または内容が足りない実施・評価の記録があります'); });
        if (p.status === 'active' && !p.records.length) add('active-without-record', 'info', '「実施中」ですが、実施の記録がまだありません');
        if ((Number(p.order) || 0) !== k + 1) add('order', 'info', '優先順位の番号がずれています');
        all.push({ id: p.id, qa });
        p.qa = qa;
      });
      return all;
    }
    // 看護問題から、目標・OP/TP/EPの案を作る。手本が無いときは、問題の種類の観察項目と目標の型だけを使い、援助・教育は定型文にしない
    function cpModelOrFallback(cp, p) {
      let m = reviewCarePlan(cp, p).model;
      const dm = !m && cpDomainOf(p);
      if (dm && dm.op) { const c0 = cpRecordContext(cp); m = { goalLong: '', goalShort: dm.goal ? dm.goal(c0) : '', op: dm.op.slice(0, 5).map(([l]) => `${l}を観察する`), tp: [], ep: [] }; }
      if (cpIsRisk(p)) { const g = cpRiskGoalFor(p, cpRecordContext(cp)); m = { goalLong: g.long, goalShort: g.short, op: (m && m.op) || [], tp: (m && m.tp) || [], ep: (m && m.ep) || [] }; }
      return m;
    }
    // 看護問題が変わったとき（名前だけでなく）、目標・OP・TP・EPを新しい問題に合わせて作り直す。古い問題の記述は残さない
    function regenerateCarePlanSections(cp, plan) {
      const m = cpModelOrFallback(cp, plan);
      plan.goalLong = (m && m.goalLong) || ''; plan.goalShort = (m && m.goalShort) || '';
      ['op', 'tp', 'ep'].forEach(k => { plan[k] = m && m[k] ? [...m[k]] : []; });
      plan.genKey = cpPlanKey(plan);
      plan.userEdited = false;
      plan.updatedAt = new Date().toISOString();
      return plan;
    }
    // 現在の問題にしか当てはまらない記述（活動耐性・毎食7割など）が、リスクの計画に残っている・定型文が残っている、など
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
    // 周術期に見落としやすい問題（出血・血栓塞栓）が、記録の状況に合うのに計画に無いときの検討の候補
    function cpMissingProblemCandidates(cp) {
      const t = cpEvidenceTexts(cp).all;
      const keys = new Set(carePlanList(cp).map(p => (cpDomainOf(p) || {}).key));
      const out = [];
      if (/術後|手術/.test(t) && /ドレーン|出血|抗凝固|創部/.test(t) && !keys.has('bleed')) out.push('検討する問題（計画にまだありません）：術後出血リスク状態。ドレーン排液の量・性状、創部、血圧・脈拍、Hbの推移を確かめて、必要か判断してください');
      if (/術後|手術|臥床|安静/.test(t) && !keys.has('vte')) out.push('検討する問題（計画にまだありません）：静脈血栓塞栓症リスク状態。術後の臥床・安静、下肢の腫脹・痛み、弾性ストッキングなどの指示を確かめて、必要か判断してください');
      return out;
    }
    // ---- 計画の仕上げ：重複の統合 → 根拠の検証 → 参照の整理 → 優先順位 → 表示前のチェック ----

    // 【根拠の選び方】リスク状態の計画は、「実際にその危険を高めている要因（手術の内容・処置・デバイス・直近の変化）」を先に示し、
    // 検査値や痛みなどの間接的な情報は「参考」として後ろに置く。炎症反応は感染の確定ではなく、手術後の炎症と区別して評価する
    function cpRecSnip(cp, re, max = 36, skipRe = null) {
      const items = ((cp && cp.items) || []).filter(i => i && !i.deleted && !i.aiSuggested && i.text && i.type !== 'unnecessary');
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
    // 【同じ意味の行をまとめる】1つの計画の中で、同じ観察・同じ援助を言い換えて並べない（別々の観察は、同じ領域でも残す）
    function cpLineKey(t) {
      const x = cpNorm(t).replace(/[（(][^）)]*[）)]/g, '').replace(/\s+/g, '');
      return x;
    }
    function cpSimilar(a, b) {
      const ka = cpLineKey(a), kb = cpLineKey(b);
      if (!ka || !kb) return false;
      if (ka === kb || ka.includes(kb) || kb.includes(ka)) return true;
      // 検査値の観察（WBC・CRPなど）は、同じ項目を2回挙げない
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
        else if (cpNorm(l).length > cpNorm(out[k]).length) out[k] = l;   // 詳しいほうを残す
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
      carePlanList(cp).forEach(p => { if (!p.caseId && cp.id) p.caseId = cp.id; });
      carePlanList(cp).forEach(p => applyCarePlanValidation(cp, p));
      // 診断（問題）が変わった・矛盾した古い記述が残る自動作成の計画は、目標・OP/TP/EPを作り直す（自分で書き直した計画は触らない）
      let regenerated = 0;
      carePlanList(cp).forEach(p => {
        const auto = ['rules', 'map', 'import', 'ai'].includes(p.source) && !p.userEdited;
        const empty = !p.goalShort && !p.goalLong && !p.op.length && !p.tp.length && !p.ep.length;
        if (auto && (cpPlanIncoherent(p) || (empty && p.validation && p.validation.kind === 'risk'))) { regenerateCarePlanSections(cp, p); regenerated++; }
        else if (!p.genKey && (p.goalShort || p.op.length)) p.genKey = cpPlanKey(p);
        // 作っただけ（実施の記録がない）の計画が「実施中」になっていたら、「計画作成済み」に戻す
        if (p.status === 'active' && !p.records.length && ['rules', 'map', 'import', 'ai'].includes(p.source)) p.status = 'planned';
      });
      carePlanList(cp).forEach(p => { if (['rules', 'map', 'import', 'ai'].includes(p.source)) { cpApplyRiskEvidence(cp, p); cpDedupePlanLines(p); } });
      cpLinkRelatedPlans(cp);
      const refsRemoved = cpSanitizeRefs(cp);
      cpExplainDistinct(cp);
      prioritizeCarePlans(cp);
      carePlanList(cp).forEach((p, n) => { p.order = n + 1; });
      const gate = cpQualityGate(cp);
      // 計画にまだ無い、周術期に見落としやすい問題の「検討の候補」（自動では作らない。最優先の計画の自動チェックに添える）
      const cand = cpMissingProblemCandidates(cp);
      const first = carePlanList(cp)[0];
      if (first && cand.length) first.qa = [...(first.qa || []), ...cand.map(c => ({ code: 'candidate', level: 'info', msg: c }))];
      return { merged, refsRemoved, gate, regenerated, candidates: cand };
    }
    // 評価：記録した目標・実施・反応と比べる。記録がなければ「評価不能」（実施・反応は作らない）
    function evaluateCarePlanFromRecords(plan) {
      const last = latestCareRecord(plan);
      if (!last) return { result: 'unevaluable', basis: '実施・評価の記録がないため、評価できません' };
      if (last.achievement) return { result: last.achievement, basis: `${formatMyDateTime(last.at)}の記録（${(CARE_ACHIEVEMENTS.find(a => a.key === last.achievement) || {}).label}）` };
      return { result: 'unevaluable', basis: '最新の記録に、目標の達成状況の評価がありません' };
    }

    // ---- 関連図の看護問題を看護計画へ引き継ぐ ----
    function importCarePlansFromMap(cp, now = new Date().toISOString(), mapArg = null) {
      const map = mapArg || (typeof normalizeRelationMap === 'function' && cp.relationMap ? normalizeRelationMap(cp.relationMap) : null);
      if (!map) return [];
      const existing = new Set(carePlanList(cp).map(p => p.problem.replace(/\s+/g, '')));
      // 言い回しが違っても同じ意味の看護問題（消した・まとめた計画を含む）は、作り直さない
      const existingCanon = new Set([...carePlanList(cp).map(p => cpPlanKey(p)), ...Object.values(cp.carePlans || {}).filter(p => p && p.deleted && p.canonKey).map(p => p.canonKey)]);
      const fresh = [];
      map.nodes.filter(n => n.type === 'nursing_problem').sort((a, b) => (a.priority || 99) - (b.priority || 99)).forEach(n => {
        const problem = String(n.label).replace(/（候補）$/, '').trim();
        const key = problem.replace(/\s+/g, '');
        if (!key || existing.has(key) || existingCanon.has(cpPlanKey({ problem }))) return;
        existing.add(key);
        const plan = createCarePlan(cp, { caseId: cp.id || '', problem, evidence: cpMapEvidence(map, n), note: n.note || '', source: 'map', reasonNeeded: true }, now);
        plan.relatedNeeds = guessPlanNeeds(plan);
        if (typeof findRelationEvidence === 'function') plan.mapEvidenceRefs = findRelationEvidence(map, n.id, cp).sourceRefs;
        fresh.push(plan);
      });
      return fresh;
    }
    // 記録から看護計画をAIなしで作る：関連図の作り方（記録→看護問題）と、手本（目標・OP/TP/EP）をそのまま使う。
    // 関連図がまだ無くても、その場で作った図から看護問題を取り込む（図は保存しない）。書き終えたら、必要な理由を書いて使う。
    // 記録から看護計画をAIなしで作る本体。消した計画の看護問題は作り直さない（skipDeleted）。作った計画の数などを返す
    function buildCarePlansByRules(cp, { skipDeleted = false } = {}) {
      if (!(cp.items || []).some(i => i.type !== 'unnecessary')) return { fresh: [], withModel: 0, noCards: true };
      let map = cp.relationMap && typeof normalizeRelationMap === 'function' ? normalizeRelationMap(cp.relationMap) : null;
      if (!map || !map.nodes.some(n => n.type === 'nursing_problem')) map = typeof buildRelationMapFromRecord === 'function' ? buildRelationMapFromRecord(cp) : null;
      const deletedKeys = new Set(Object.values(cp.carePlans || {}).filter(p => p && p.deleted && p.problemKey).map(p => p.problemKey));
      if (map && skipDeleted && deletedKeys.size) map = { ...map, nodes: map.nodes.filter(n => n.type !== 'nursing_problem' || !deletedKeys.has(carePlanProblemKey(String(n.label).replace(/（候補）$/, '').trim()))) };
      const fresh0 = map ? importCarePlansFromMap(cp, new Date().toISOString(), map) : [];
      // 言い切れる根拠のない問題はリスク状態に直し、同じ意味の問題は1つにまとめてから、目標・OP/TP/EPを作る
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
    // 看護計画は、記録から自動で作る（「看護計画」のページを開いたとき・分類のあと）。AIは作るためではなく、できた計画を評価するために使う。
    // 手で消した計画は作り直さない。作れる看護問題が増えたときだけ、足りない分を足す
    function autoBuildCarePlans(cp, { notify = true } = {}) {
      if (!cp) return 0;
      let r;
      try { r = buildCarePlansByRules(cp, { skipDeleted: true }); } catch (err) { console.warn('看護計画の自動作成に失敗:', err); return 0; }
      if (!r.fresh.length) {
        // 新しく作る計画がなくても、すでにある計画の重複・無効な参照は整理する（何度作っても重複しない）
        try { const ref = refineCarePlans(cp); if (ref.merged || ref.refsRemoved || ref.regenerated) commitCarePlanChange(cp, false); } catch (err) { console.warn('看護計画の整理に失敗:', err); }
        return 0;
      }
      commitCarePlanChange(cp, false);
      if (notify) showToast(`記録から看護計画を${r.fresh.length}件、自動で作りました。この患者に合うか確かめて、理由を書いて直してください。内容は「計画をチェック」で確かめられます`, 'success', 7000);
      return r.fresh.length;
    }
    window.buildCarePlansByRulesUI = function() {
      const cp = getCurrentPatient();
      if (!(cp.items || []).some(i => i.type !== 'unnecessary')) return showToast('カードがありません。先に「分類開始」で分類してください', 'warn');
      const { fresh, withModel } = buildCarePlansByRules(cp);
      if (!fresh.length) return showToast('作れる看護問題が記録から見つからないか、すべて看護計画にあります', 'info');
      commitCarePlanChange(cp);
      showToast(`看護計画を${fresh.length}件作りました（うち${withModel}件に目標・OP/TP/EPの手本を入れました）。この患者に合うか確かめて、理由を書いて直してください`, 'success', 7000);
    };
    window.importCarePlansFromMapUI = function() {
      const cp = getCurrentPatient();
      if (!cp.relationMap) return showToast('関連図がまだありません。「関連図」のページで作ってから取り込んでください', 'warn', 6000);
      const fresh = importCarePlansFromMap(cp);
      if (!fresh.length) return showToast('関連図の看護問題は、すべて看護計画にあります', 'info');
      fresh.forEach(p => carePlanOpen.add(p.id));
      commitCarePlanChange(cp);
      showToast(`関連図から看護問題を${fresh.length}件取り込みました（根拠データつき）。目標・OP/TP/EPはこの患者に合わせて書きましょう`, 'success', 6000);
    };

    // ---- 学習の支え：AIの案・関連図から取り込んだ計画・提案は「この患者に必要な理由」を書いてから使う ----
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
      const p = getCarePlan(cp, id);
      if (!p) return;
      const t = await askCareReason(`「${p.problem || '（無題）'}」がこの患者に必要な理由`, '');
      if (!t) return;
      addCareReason(p, t, 'この看護問題');
      commitCarePlanChange(cp);
    };
    // チェックの提案を使う：目標の例（自分で直してから入れる）・OPの不足（理由を書いてから足す）
    window.useGoalExampleUI = async function(id) {
      const cp = getCurrentPatient();
      const p = getCarePlan(cp, id);
      if (!p) return;
      const r = reviewCarePlan(cp, p);
      const ex = (r.items.find(i => i.key === 'goal') || {}).example || r.goalExample;
      const v = await openDialog({ title: '短期目標を書き直す', message: '例は、この患者の記録の値を使った「書き方の見本」です。そのまま使わず、期限・数値・患者の状態をこの患者に合わせて直してください。\n「いつまでに」「患者が」「どうなる」「何をもって達成と判断するか」', inputValue: ex, placeholder: '例：2日後までに、安静時の創部痛がNRS5からNRS3以下となり、苦痛なく休息できる', confirmLabel: '短期目標にする' });
      if (v === null || v === undefined || !String(v).trim()) return;
      if (String(v).trim() === ex) {
        const ok = await openDialog({ title: '例のままですが、よいですか？', message: '期限や数値が、この患者に合っているか確かめましたか？（例のまま使うときは、理由を書きます）', confirmLabel: '理由を書いて使う', secondaryLabel: '直す' });
        if (ok !== true) return;
        const why = await askCareReason('この目標にした理由', ex);
        if (!why) return;
        addCareReason(p, why, '短期目標');
      }
      updateCarePlan(cp, id, { goalShort: String(v).trim() });
      commitCarePlanChange(cp);
      showToast('短期目標を書き直しました', 'success');
    };
    window.addMissingOpUI = async function(id, idx) {
      const cp = getCurrentPatient();
      const p = getCarePlan(cp, id);
      if (!p) return;
      const r = reviewCarePlan(cp, p);
      const label = ((r.items.find(i => i.key === 'op') || {}).add || [])[idx];
      if (!label) return;
      const why = await askCareReason('OPに足す理由', `${label}を観察する`);
      if (!why) return;
      updateCarePlan(cp, id, { op: [...p.op, `${label}を観察する`] });
      addCareReason(p, why, `OP：${label}`);
      commitCarePlanChange(cp);
    };

    // 手本を、空欄のところだけ入れる（書いてある所は変えない）。入れたあとは「この患者に必要な理由」を書いてもらう
    window.applyCareModelUI = function(id) {
      const cp = getCurrentPatient();
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
      commitCarePlanChange(cp);
      showToast('手本を空欄に入れました。この患者に合うか確かめて、直してください', 'success');
    };
    window.moveTpToOpUI = function(id, idx) {
      const cp = getCurrentPatient();
      const p = getCarePlan(cp, id);
      if (!p) return;
      const line = cpObservationLines(p.tp)[idx];
      if (!line) return;
      updateCarePlan(cp, id, { tp: p.tp.filter(l => l !== line), op: p.op.includes(line) ? p.op : [...p.op, line] });
      commitCarePlanChange(cp);
    };

    // ---- 評価の表示（計画のカードの中。開いた計画だけ） ----
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
      return `<div class="cpr" id="cpr-${pid}"><div class="cpr-title"><i class="fa-solid fa-clipboard-list"></i> 計画のチェック（AIなし）<span class="my-asm-muted">要確認 ${cpReviewCount(r)}件</span></div><ul class="cpr-list">${rows}</ul>${modelHtml}</div>`;
    }

    // ---- 全計画をまとめて評価（計画どうしの重複・補完・不足） ----
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
    // AIなしの全体チェック。戻り値：{ dups:[{title,msg}], overlaps:[], gaps:[], covered:[] }
    function reviewCarePlanSet(cp) {
      const plans = carePlanList(cp).map(p => normalizeCarePlan({ ...p }));
      const out = { dups: [], overlaps: [], gaps: [], covered: [] };
      if (plans.length < 2) return out;
      const name = p => `「${p.problem || '無題'}」`;
      const act = p => [p.goalShort, p.goalLong, ...p.tp, ...p.ep].join('\n').normalize('NFKC');
      // 同じ説明（EP）が、同じ相手（患者／家族）に向けて複数の計画に入っている。TPは計画ごとの役割があるので見ない。
      // 家族への説明と患者への説明は、相手が違うので重複としない。ナースコール・手洗いのような共通の説明も見ない
      const epOf = (p, fam) => p.ep.filter(l => !!/家族|妻|夫|娘|息子/.test(l) === fam).join('\n').normalize('NFKC');
      CP_SET_TOPICS.filter(([label]) => !/ナースコール|感染予防|服薬|転倒/.test(label)).forEach(([label, re]) => {
        [false, true].forEach(fam => {
          const hit = plans.filter(p => re.test(epOf(p, fam)));
          if (hit.length >= 2) out.dups.push({ title: label, msg: `「${label}」の${fam ? '家族への' : ''}説明が${hit.map(name).join('と')}の教育計画（EP）に書かれています。同じ説明・理解確認を2回書かず、片方にまとめるか、問題ごとに目的（何を解決するか）と達成条件を分けましょう` });
        });
      });
      // ほとんど同じ文が別の計画にある
      const seen = new Set();
      for (let i = 0; i < plans.length; i++) for (let j = i + 1; j < plans.length; j++) {
        ['tp', 'ep'].forEach(k => plans[i][k].forEach(a => plans[j][k].forEach(b => {
          const key = `${i}-${j}-${a}`;
          if (!seen.has(key) && cpSimilar(a, b)) { seen.add(key); out.dups.push({ title: '似た文', msg: `${name(plans[i])}と${name(plans[j])}に、ほぼ同じ${k.toUpperCase()}があります：「${String(a).slice(0, 40)}」` }); }
        })));
      }
      // 同じ種類の看護問題が並んでいる
      const byDom = {};
      plans.forEach(p => { const d = cpDomainOf(p); if (d) (byDom[d.key] = byDom[d.key] || []).push(p); });
      Object.values(byDom).filter(a => a.length >= 2).forEach(a => out.overlaps.push({ title: '同じ種類の問題', msg: `${a.map(name).join('と')}は同じ種類の問題です。別の問題として残すなら、目的と達成条件を分けましょう` }));
      // 記録にあるのに、どの計画にも入っていないこと（家族・仕事）／入っている計画
      const ctxText = cpRecordContext(cp).text;
      [['家族への指導・支援', /キーパーソン|妻|夫|家族|娘|息子/, /家族|妻|夫|娘|息子|キーパーソン/], ['仕事・生活への配慮', /仕事|勤務|職場|通勤|復職/, /仕事|勤務|職場|通勤|復職/]].forEach(([label, recRe, planRe]) => {
        if (!recRe.test(ctxText)) return;
        const hit = plans.filter(p => planRe.test(act(p)));
        if (hit.length) out.covered.push({ title: label, msg: `${label}は${hit.map(name).join('・')}に書かれています（1つの計画に無くても、全体では入っています）` });
        else out.gaps.push({ title: label, msg: `記録に出てくる${label}が、どの計画にも書かれていません` });
      });
      return out;
    }
    // 全体の評価の表示（計画の一覧の上）。AIの結果はこの画面を開いている間だけ覚える
    const carePlanSetState = { open: false };
    function carePlanSetReviewHtml(cp) {
      if (!carePlanSetState.open) return '';
      const local = reviewCarePlanSet(cp);
      const group = (title, icon, cls, arr) => arr.length ? `<div class="cps-group ${cls}"><b><i class="fa-solid ${icon}"></i> ${title}</b><ul>${arr.map(x => `<li>${escapeHtml(x.msg || [x.title ? `${x.title}：` : '', x.comment || ''].join(''))}${x.suggestion ? `<span class="cpr-sugg">提案：${escapeHtml(x.suggestion)}</span>` : ''}</li>`).join('')}</ul></div>` : '';
      const n = carePlanList(cp).length;
      let h = `<div class="cps"><div class="cpr-title"><i class="fa-solid fa-layer-group"></i> 全計画のチェック（AIなし）<span class="my-asm-muted">計画どうしの重複・補完・不足を見ます</span><button type="button" class="my-asm-link" onclick="closeCarePlanSetReview()">閉じる</button></div>`;
      if (n < 2) h += '<p class="my-asm-muted">計画が2件以上あると、重複や補完を確かめられます。</p>';
      else {
        const any = local.dups.length || local.overlaps.length || local.gaps.length;
        h += group('重複', 'fa-clone', 'warn', [...local.dups, ...local.overlaps]) + group('全体では入っている', 'fa-circle-check', 'ok', local.covered) + group('どの計画にも無い', 'fa-triangle-exclamation', 'warn', local.gaps);
        if (!any) h += '<p class="my-asm-muted">計画どうしの重複・不足は見つかりませんでした。</p>';
      }
      h += '</div>';
      return h;
    }
    function renderCarePlanSetReview() {
      const el = document.getElementById('careplan-set-review');
      if (el) el.innerHTML = carePlanSetReviewHtml(getCurrentPatient());
    }
    window.openCarePlanSetReview = function() { carePlanSetState.open = true; renderCarePlanSetReview(); const el = document.getElementById('careplan-set-review'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); };
    window.closeCarePlanSetReview = function() { carePlanSetState.open = false; renderCarePlanSetReview(); };


    // 書き出し・AI用：看護計画を文章にする
    function buildCarePlansText(cp, { withRecords = true, recordFilter = null } = {}) {
      return carePlanList(cp).map((p, k) => {
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

    // 看護計画の印刷・PDF／テキストの書き出し（「看護計画」タブのボタンから。実施・評価の記録も含める）
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
    window.exportCarePlansText = function() {
      const cp = getCurrentPatient();
      if (!carePlanList(cp).length) return showToast('書き出す看護計画がありません。先に看護計画を作成してください', 'warn');
      const safeTitle = String(cp.title || '患者').replace(/[\\/:*?"<>|]/g, '_');
      const text = `看護計画・実施・評価：${cp.title || ''}\n出力日時: ${new Date().toLocaleString('ja-JP')}\n\n${buildCarePlansText(cp)}\n`;
      downloadTextBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${safeTitle}_看護計画.txt`);
      showToast('看護計画をテキストで書き出しました', 'success');
    };

    // 「看護計画」のページへ切り替えたとき・患者を切り替えたとき（js/05 の switchView・loadLocalState から呼ぶ）
    function onCarePlanViewShown() { try { autoBuildCarePlans(getCurrentPatient()); } catch (e) { console.warn(e); } renderCarePlans(); }

if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, {
    inferUntaggedReason, untaggedContextEffects, untaggedTextKey, untaggedReviewOf, setUntaggedReview, applyUntaggedReviews, untaggedReviewItems, untaggedReviewCounts, untaggedSectionHtml,
    buildCarePlansPrintHtml, buildCarePlansText, buildCarePlansByRules, autoBuildCarePlans, carePlanList, deleteCarePlan,
    formatCardTimestamp, MISSING_CHECK_STATUSES, missingInfoItems, missingCheckStatus, missingCheckCounts, setMissingCheck, missingCheckCardHtml,
    captureCarePlanEvidence, carePlanEvidenceChanges, refreshCarePlanEvidence, CARE_PLAN_SECTIONS, carePlanList, createCarePlan, getCarePlan, updateCarePlan, deleteCarePlan, moveCarePlan, carePlanLinesToList,
    addCareRecord, updateCareRecord, deleteCareRecord, parseCarePlanText, buildMissingInfoText, importCarePlans, guessPlanNeeds, buildCarePlansText, carePlanCardHtml,
    cpModelFor, CP_REVIEW_ITEMS, CP_DOMAINS, cpDomainOf,
    CARE_PLAN_STATUSES, CARE_ACHIEVEMENTS, cpMissingProblemCandidates, cpPlanKey, cpIsRisk, cpPlanIncoherent, regenerateCarePlanSections, cpModelOrFallback, mergeDuplicateCarePlans, validateCarePlanEvidence, applyCarePlanValidation, prioritizeCarePlans, cpPriorityOf, cpRiskGoalFor,
    cpEducationLines, cpForeignTerms, cpSanitizeRefs, cpResolvePlanId, cpQualityGate, refineCarePlans, evaluateCarePlanFromRecords, cpGoalCheck, cpRecordContext, reviewCarePlan, importCarePlansFromMap, carePlanReviewHtml, carePlanBasisHtml, cpObservationLines, reviewCarePlanSet, carePlanSetReviewHtml, carePlanSetState
  });
}
