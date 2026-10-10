// Board editing and source navigation. All views share the same saved cards.
// Preserve source ownership during selection, bulk actions, merges and Undo.

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['09'] = '2026-10-10.znavigation17'; // Version stamp (scripts/stamp-version.js)
    // ==========================================================================

    // ------------------------------------------------------------------------

    const SOURCE_MATCH_DASHES = /[−―‐–—]/g;
    function normalizeForSourceMatch(str) {
      return (str || '').normalize('NFKC').toLowerCase().replace(SOURCE_MATCH_DASHES, '-').replace(/[〜～]/g, '~');
    }
    function buildSourceMatchIndex(source) {
      let norm = '';
      const starts = [];
      const ends = [];
      for (let i = 0; i < source.length;) {
        const ch = String.fromCodePoint(source.codePointAt(i));
        const n = normalizeForSourceMatch(ch);
        for (const c of n) {
          if (/\s/.test(c)) continue;
          norm += c;
          // indexOf uses UTF-16 offsets, including both halves of emoji.
          for (let unit = 0; unit < c.length; unit++) {
            starts.push(i);
            ends.push(i + ch.length);
          }
        }
        i += ch.length;
      }
      return { norm, starts, ends };
    }
    function findAllOccurrences(haystack, needle) {
      const found = [];
      if (!needle) return found;
      let idx = haystack.indexOf(needle);
      while (idx !== -1) { found.push(idx); idx = haystack.indexOf(needle, idx + 1); }
      return found;
    }
    function findSourceExactMatches(source, cardText) {
      source=String(source||'');cardText=String(cardText||'').trim();
      if(cardText.length<2)return {kind:'none',ranges:[]};
      const literal=findAllOccurrences(source,cardText);
      if(literal.length)return {kind:'literal',ranges:literal.map(start=>[start,start+cardText.length])};
      const index=buildSourceMatchIndex(source),needle=normalizeForSourceMatch(cardText).replace(/\s+/g,'');
      if(needle.length<2)return {kind:'none',ranges:[]};
      const ranges=findAllOccurrences(index.norm,needle).map(start=>[index.starts[start],index.ends[start+needle.length-1]]);
      return {kind:ranges.length?'normalized':'none',ranges};
    }
    function findSourceHighlightRanges(source, cardText) {
      if (!source || !cardText) return [];
      const index = buildSourceMatchIndex(source);
      const norm = index.norm;

      const cardWithoutRef = cardText.replace(/\s*[（(]基準値[:：][^)）]*[)）]\s*/g, ' ');
      const toRanges = (spans) => {
        const sorted = spans.slice().sort((a, b) => a[0] - b[0]);
        const merged = [];
        sorted.forEach(([s, e]) => {
          const last = merged[merged.length - 1];

          if (last && s <= last[1] + 2) last[1] = Math.max(last[1], e);
          else merged.push([s, e]);
        });
        return merged.map(([s, e]) => [index.starts[s], index.ends[e - 1]]);
      };

      const wholeNorm = normalizeForSourceMatch(cardWithoutRef).replace(/\s+/g, '');
      if (wholeNorm.length >= 2) {
        const whole = norm.indexOf(wholeNorm);
        if (whole !== -1) return toRanges([[whole, whole + wholeNorm.length]]);
      }

      const UNIT_ONLY_TOKENS = new Set(['dl', 'ml', 'mg', 'μl', 'μg', 'kg', 'cm', 'mm', 'mmhg', 'kcal', 'ul']);
      const units = [];

      const numberFallbackOf = new Map();
      normalizeForSourceMatch(cardWithoutRef)
        .split(/[\s、。，:：;；()（）「」『』\[\]【】<>＜＞・\/]+/)
        .filter(Boolean)
        .forEach(phrase => {
          if (phrase === '基準値' || UNIT_ONLY_TOKENS.has(phrase)) return;
          if (phrase.length >= 2 && norm.includes(phrase)) {
            units.push(phrase);

            (phrase.match(/\d[\d.,]*\d|\d/g) || []).forEach(num => {
              if (num.length >= 2 && num !== phrase) { units.push(num); numberFallbackOf.set(num, phrase); }
            });
            return;
          }
          (phrase.match(/[\d.,]+|[a-zμ%]+|[^\d.,a-zμ%~\-×^]+/g) || []).forEach(tok => {
            const t = tok.replace(/^[.,]+|[.,]+$/g, '');
            if (t.length >= 2 && t !== '基準値' && !UNIT_ONLY_TOKENS.has(t)) units.push(t);
          });
        });
      const uniqueUnits = Array.from(new Set(units));
      const occ = new Map();
      uniqueUnits.forEach(u => { const o = findAllOccurrences(norm, u); if (o.length) occ.set(u, o); });
      if (occ.size === 0) return [];

      const anchorUnit = Array.from(occ.keys()).sort((a, b) => (occ.get(a).length - occ.get(b).length) || (b.length - a.length))[0];
      const windowSize = Math.max(80, wholeNorm.length * 2);
      let best = null;
      occ.get(anchorUnit).forEach(anchorPos => {
        const chosen = new Map();
        occ.forEach((positions, u) => {
          let bestPos = null;
          positions.forEach(p => {
            if (Math.abs(p - anchorPos) > windowSize) return;
            if (bestPos === null || Math.abs(p - anchorPos) < Math.abs(bestPos - anchorPos)) bestPos = p;
          });
          if (bestPos !== null) chosen.set(u, bestPos);
        });
        numberFallbackOf.forEach((phrase, num) => {
          if (!chosen.has(num) || !chosen.has(phrase)) return;
          const numDist = Math.abs(chosen.get(num) - anchorPos);
          const phraseDist = Math.abs(chosen.get(phrase) - anchorPos);
          chosen.delete(numDist < phraseDist ? phrase : num);
        });
        let score = 0;
        const picks = [];
        chosen.forEach((pos, u) => { score += u.length; picks.push([pos, pos + u.length]); });
        if (!best || score > best.score) best = { score, picks };
      });
      return best ? toRanges(best.picks) : [];
    }

    var highlightedSourceItemId = null;
    var highlightedSourceFirstOffset = null;
    function showSourceHighlight(item) {
      const view = document.getElementById('source-highlight-view');
      const bar = document.getElementById('source-highlight-bar');
      const label = document.getElementById('source-highlight-label');
      const source = DOM.sourceText.value || '';
      if (!source.trim()) {
        showToast('入力欄に元の文章が無いため、該当箇所を表示できません', 'info');
        return;
      }
      const ranges = findSourceHighlightRanges(source, item.text);
      if (!ranges.length) {
        clearSourceHighlight(false);
        showToast('元の文章の中に、このカードの該当箇所が見つかりませんでした（カードか入力欄の文章が後から編集された可能性があります）', 'info');
        return;
      }
      let html = '';
      let pos = 0;
      ranges.forEach(([start, end]) => {
        html += escapeHtml(source.slice(pos, start)) + `<mark class="src-hl">${escapeHtml(source.slice(start, end))}</mark>`;
        pos = end;
      });
      html += escapeHtml(source.slice(pos));

      if (!DOM.sourceText.classList.contains('hidden') && DOM.sourceText.offsetHeight > 0) {
        view.style.height = `${DOM.sourceText.offsetHeight}px`;
      }
      view.innerHTML = html;
      DOM.sourceText.classList.add('hidden');
      view.classList.remove('hidden');
      bar.classList.remove('hidden');
      const shortText = item.text.length > 18 ? `${item.text.slice(0, 18)}…` : item.text;
      label.textContent = `「${shortText}」の元の箇所`;
      highlightedSourceItemId = item.id;
      highlightedSourceFirstOffset = ranges[0][0];

      const firstMark = view.querySelector('mark.src-hl');
      if (firstMark) view.scrollTop = Math.max(0, firstMark.offsetTop - view.clientHeight / 3);

      const rect = view.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > (window.innerHeight || 0)) view.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    function clearSourceHighlight(focusAtMatch) {
      const view = document.getElementById('source-highlight-view');
      const bar = document.getElementById('source-highlight-bar');
      view.classList.add('hidden');
      bar.classList.add('hidden');
      DOM.sourceText.classList.remove('hidden');
      if (focusAtMatch && highlightedSourceFirstOffset !== null) {
        DOM.sourceText.focus();
        DOM.sourceText.setSelectionRange(highlightedSourceFirstOffset, highlightedSourceFirstOffset);
      }
      highlightedSourceItemId = null;
      highlightedSourceFirstOffset = null;
    }
    document.getElementById('source-highlight-view').addEventListener('click', () => clearSourceHighlight(true));
    document.getElementById('btn-source-highlight-close').addEventListener('click', () => clearSourceHighlight(true));

    function confidenceBadgeFor(predictionSource) {
      switch (predictionSource) {
        case 'fuzzy':
          return `<span class="confidence-badge confidence-fuzzy" title="表記ゆれが近い過去の学習内容から自動分類しました。内容を確認してください">類似</span>`;
        case 'tied':
          return `<span class="confidence-badge confidence-tied" title="過去の編集で票が同数のため、自動分類の確信度が低くなっています。内容を確認してください">?</span>`;
        case 'rule':
          return `<span class="confidence-badge confidence-rule" title="学習データがまだ無く、固定ルールで自動分類しました。内容を確認してください">仮</span>`;
        default:
          return '';
      }
    }

    function drugChipHtml(item) {
      if (typeof findDrugsInText !== 'function' || !item) return '';
      const found = findDrugsInText(item.text);
      if (!found.length) return '';
      const alert = found.some(x => x.drug.highAlert);
      const names = found.map(x => x.drug.name).join('・');
      return `<button type="button" class="drug-chip${alert ? ' drug-chip-alert' : ''}" onclick="event.stopPropagation(); openDrugInfo(${jsArg(item.id)})" title="薬の情報：${escapeHtml(names)}（押すと、看護で観ることと最新の添付文書へのリンクを表示）" aria-label="薬の情報：${escapeHtml(names)}"><i class="fa-solid fa-capsules"></i>薬${found.length > 1 ? found.length : ''}</button>`;
    }
    function createCardElement(item) {
      const card = document.createElement('div');
      card.id = item.id;
      card.draggable = true;
      const isUntagged = isUntaggedItem(item);
      const isSelected = selectedCardIds.has(item.id);
      card.className = `rec-card cursor-pointer active:cursor-grabbing relative group ${item.type === 'unnecessary' ? 'opacity-60 line-through text-[var(--ink-muted)]' : ''} ${isSelected ? 'card-selected' : ''}`;
      if (isUntagged && !isSelected) card.style.cssText = 'border:1.5px solid var(--brick);background:var(--brick-soft);';
      card.ondragstart = e => { e.dataTransfer.setData('text/plain', item.id); card.classList.add('card-dragging'); };
      card.ondragend = () => card.classList.remove('card-dragging');

      card.addEventListener('click', e => {
        if (e.target.closest('button, select, a, input')) return;
        toggleCardSelection(item.id);

        if (selectedCardIds.has(item.id)) showSourceHighlight(item);
        else if (highlightedSourceItemId === item.id) clearSourceHighlight(false);
      });

      const tagsHtml = (item.hendersonIds || []).map(hId => {
        const need = HENDERSON_NEEDS.find(n => n.id === hId);
        return need ? `<span class="tag-chip">${need.name} <button onclick="removeHendersonTag(${jsArg(item.id)}, ${need.id})" class="text-[var(--accent)]/60 hover:text-[var(--brick)] transition"><i class="fa-solid fa-times"></i></button></span>` : '';
      }).join('');
      const untaggedWarningHtml = isUntagged ? `<span class="field-chip" style="background:var(--brick);color:var(--on-fill);cursor:help;" title="${escapeHtml(untaggedReasonOf(item))}"><i class="fa-solid fa-triangle-exclamation mr-0.5"></i>タグ未設定 <i class="fa-regular fa-circle-question ml-0.5"></i></span>` : '';

      const familyChipHtml = isFamilySpeech(item.text) ? '<span class="field-chip" style="background:var(--gold-soft);color:var(--gold);" title="家族の発言です（本人の発言ではありません）"><i class="fa-solid fa-people-roof mr-0.5"></i>家族</span>' : '';
      const patientBackgroundHtml = familyChipHtml + (isOtherBasicInfoItem(item) ? `<span class="field-chip" style="background:var(--slate-soft);color:var(--slate);cursor:help;" title="ヘンダーソンの14項目に直接の項目が無い基本情報です（タグ未設定の警告にはしません）。どの項目に入れるか決めたい場合は、学習データ管理の「追加キーワード」で登録するか、下の「＋タグ追加」で選べます。"><i class="fa-solid fa-id-card mr-0.5"></i>基本情報（14項目外）</span>` : '');

      const fieldDef = item.fieldLabel ? FIELD_LABELS.find(f => f.key === item.fieldLabel) : null;
      const fieldChipHtml = fieldDef ? `<span class="field-chip" style="background:${fieldDef.bg};color:${fieldDef.color};"><i class="fa-solid ${fieldDef.icon} mr-0.5"></i>${escapeHtml(fieldDef.label)}</span>` : '';
      const timeChipHtml = item.timestamp && item.timestamp !== "日時不明" ? `<span class="time-chip"><i class="fa-regular fa-clock mr-0.5"></i>${escapeHtml(item.timestamp)}</span>` : '';
      const confidenceBadgeHtml = confidenceBadgeFor(item.predictionSource);

      const scenePartner = item.sceneId ? (getCurrentPatient().items || []).find(i => i.sceneId === item.sceneId && i.id !== item.id) : null;
      const sceneChipHtml = scenePartner ? `<button onclick="jumpToBoardCard(${jsArg(scenePartner.id)})" class="scene-chip" title="同じ場面の${scenePartner.type === 's' ? '発言（S）' : '観察（O）'}のカード：${escapeHtml(scenePartner.text.slice(0, 40))}"><i class="fa-solid fa-link mr-0.5"></i>同じ場面の${scenePartner.type === 's' ? 'S' : 'O'}</button>` : '';

      card.innerHTML = `
        <div class="flex items-center justify-between gap-1">
          <div class="flex items-center gap-1 flex-wrap">
            <label class="card-select-wrap" title="選択（複数選択の追加/解除。タップ操作のみで複数選択できます）">
              <input type="checkbox" class="card-select-checkbox" onchange="setCardSelected(${jsArg(item.id)}, this.checked)" ${isSelected ? 'checked' : ''}>
            </label>
            ${untaggedWarningHtml}${patientBackgroundHtml}${fieldChipHtml}${timeChipHtml}${sceneChipHtml}${drugChipHtml(item)}${confidenceBadgeHtml}
          </div>
          <div class="flex items-center gap-1 ml-auto shrink-0">
            ${item.type === 'unnecessary' ? `<button onclick="setItemType(${jsArg(item.id)}, 'unclassified')" class="type-btn type-btn-restore" title="未分類に戻す">復帰</button>` : ''}
            <button type="button" onclick="openCardMenu(event, ${jsArg(item.id)})" class="card-menu-btn" data-card-id="${escapeHtml(item.id)}" aria-haspopup="menu" aria-label="このカードの操作" title="操作（S/Oの変更・編集・不要・削除・報告）"><i class="fa-solid fa-ellipsis-vertical"></i></button>
          </div>
        </div>
        <p class="card-text font-medium leading-snug break-words text-[var(--ink)]">${cardTextWithLabFlagsHtml(item)}</p>
        <div class="flex flex-wrap gap-1 items-center">
          ${tagsHtml}
          <select onchange="addHendersonTagFromDropdown(${jsArg(item.id)}, this.value); this.value='';" aria-label="タグを追加" class="max-w-[92px] w-auto text-[9px] bg-[var(--paper)] hover:bg-[var(--line-soft)] border ${isUntagged ? 'border-[var(--brick)]' : 'border-[var(--line)]'} rounded-[var(--radius-sm)] px-1 py-0.5 text-[var(--ink-muted)] cursor-pointer focus:outline-none mt-0.5" style="max-width:92px;"><option value="">＋ タグ</option>${HENDERSON_NEEDS.map(n => `<option value="${n.id}">${n.name}</option>`).join('')}</select>
        </div>
      `;
      return card;
    }

    // ==========================================================================

    // ==========================================================================
    let cardMenuEl = null;
    let cardMenuReturnFocus = null;
    function closeCardMenu() {
      if (!cardMenuEl || cardMenuEl.classList.contains('hidden')) return;
      cardMenuEl.classList.add('hidden');

      if (cardMenuReturnFocus && !cardMenuReturnFocus.isConnected && cardMenuReturnFocus.dataset && cardMenuReturnFocus.dataset.cardId) {
        cardMenuReturnFocus = document.getElementById(cardMenuReturnFocus.dataset.cardId)?.querySelector('.card-menu-btn') || null;
      }
      if (cardMenuReturnFocus && typeof cardMenuReturnFocus.focus === 'function') cardMenuReturnFocus.focus();
      cardMenuReturnFocus = null;
    }
    window.openCardMenu = function(ev, id) {
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      const item = getCurrentPatient().items.find(i => i.id === id);
      if (!item) return;
      if (!cardMenuEl) {
        cardMenuEl = document.createElement('div');
        cardMenuEl.id = 'card-menu';
        cardMenuEl.className = 'card-menu hidden';
        cardMenuEl.setAttribute('role', 'menu');
        document.body.appendChild(cardMenuEl);
        document.addEventListener('click', e => { if (cardMenuEl && !cardMenuEl.contains(e.target)) closeCardMenu(); });
        cardMenuEl.addEventListener('keydown', e => {
          const btns = Array.from(cardMenuEl.querySelectorAll('button'));
          const k = btns.indexOf(document.activeElement);
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeCardMenu(); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); btns[(k + 1) % btns.length].focus(); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); btns[(k - 1 + btns.length) % btns.length].focus(); }
          else if (e.key === 'Tab') closeCardMenu();
        });
        window.addEventListener('scroll', () => closeCardMenu(), true);
      }
      const act = (label, icon, fn, cls = '') => `<button type="button" role="menuitem" class="${cls}" data-act="${fn}"><i class="fa-solid ${icon}"></i>${label}</button>`;
      const rows = [];
      if (item.type !== 's') rows.push(act('Sデータに移す', 'fa-comment', `type:s`));
      if (item.type !== 'o') rows.push(act('Oデータに移す', 'fa-eye', `type:o`));
      if (item.type !== 'unclassified') rows.push(act('未分類に戻す', 'fa-inbox', `type:unclassified`));
      rows.push('<hr>');
      rows.push(act('本文を編集', 'fa-pen', 'edit'));
      rows.push(act('カードを分ける', 'fa-scissors', 'split'));
      if (item.type !== 'unnecessary') rows.push(act('不要な情報にする', 'fa-ban', 'type:unnecessary'));
      rows.push(act('書き込みがおかしいと報告', 'fa-flag', 'report'));
      rows.push('<hr>');
      rows.push(act('完全に削除（直後なら元に戻せます）', 'fa-trash-can', 'delete', 'danger'));
      cardMenuEl.innerHTML = rows.join('');
      cardMenuEl.querySelectorAll('button').forEach(b => b.addEventListener('click', e => {
        e.stopPropagation();
        const a = b.dataset.act;
        cardMenuReturnFocus = null;
        closeCardMenu();
        if (a.startsWith('type:')) {
          setItemType(id, a.slice(5));

          if (e.detail === 0) document.getElementById(id)?.querySelector('.card-menu-btn')?.focus();
        }
        else if (a === 'edit') editItemText(id);
        else if (a === 'split') openSplitCard(id);
        else if (a === 'report') openCardReportModal(id);
        else if (a === 'delete') deleteItem(id);
      }));
      cardMenuReturnFocus = ev && ev.currentTarget ? ev.currentTarget : null;
      const r = (ev && ev.currentTarget && ev.currentTarget.getBoundingClientRect) ? ev.currentTarget.getBoundingClientRect() : { right: 200, bottom: 100, top: 100 };
      cardMenuEl.classList.remove('hidden');
      const w = cardMenuEl.offsetWidth || 220, h = cardMenuEl.offsetHeight || 260;
      const vw = window.innerWidth || 1024, vh = window.innerHeight || 768;
      cardMenuEl.style.left = `${Math.max(8, Math.min(vw - w - 8, r.right - w))}px`;
      cardMenuEl.style.top = `${r.bottom + 4 + h > vh ? Math.max(8, r.top - h - 4) : r.bottom + 4}px`;
      const first = cardMenuEl.querySelector('button');
      if (first) first.focus();
    };

    // ==========================================================================

    // ==========================================================================
    let selectedCardIds = new Set();
    let boardSearchTerm = '';

    function toggleCardSelection(id) {
      if (selectedCardIds.has(id)) selectedCardIds.delete(id); else selectedCardIds.add(id);
      renderSoBoard();
    }
    window.clearSelection = function() { selectedCardIds.clear(); clearSourceHighlight(false); renderSoBoard(); };

    window.setCardSelected = function(id, selected) {
      if (selected) selectedCardIds.add(id); else selectedCardIds.delete(id);
      renderSoBoard();
    };

    window.selectAllUntagged = function() {
      const cp = getCurrentPatient();
      const ids = (cp.items || []).filter(isUntaggedItem).map(i => i.id);
      if (!ids.length) return showToast('タグ未設定のカードはありません', 'success');
      ids.forEach(id => selectedCardIds.add(id));
      renderSoBoard();
      if (typeof refreshCardOverview === 'function' && document.getElementById('modal-card-overview') && !document.getElementById('modal-card-overview').classList.contains('hidden')) refreshCardOverview();
      showToast(`タグ未設定の${ids.length}枚をすべて選択しました`, 'success');
    };

    window.selectAllReviewTargets = function() {
      const cp = getCurrentPatient();
      const ids = reviewRequestTargets(cp).map(i => i.id);
      if (!ids.length) return showToast('対象のカード（手で編集したカード・タグ未設定のカード）はありません', 'success');
      ids.forEach(id => selectedCardIds.add(id));
      renderSoBoard();
      if (typeof refreshCardOverview === 'function' && document.getElementById('modal-card-overview') && !document.getElementById('modal-card-overview').classList.contains('hidden')) refreshCardOverview();
      showToast(`編集済み・タグ未設定の${ids.length}枚を選択しました（下の帯の「選択したカードを書き出し」でも書き出せます）`, 'success');
    };

    function renderBulkActionBar() {
      const bar = document.getElementById('bulk-action-bar');
      if (!bar) return;
      if (selectedCardIds.size === 0) { bar.classList.add('hidden'); return; }
      bar.classList.remove('hidden');
      document.getElementById('bulk-action-count').textContent = `${selectedCardIds.size}件選択中`;

      const mergeBtn = document.getElementById('btn-bulk-merge');
      if (mergeBtn) {
        const disabled = selectedCardIds.size < 2;
        mergeBtn.disabled = disabled;
        mergeBtn.style.opacity = disabled ? '0.45' : '1';
        mergeBtn.style.pointerEvents = disabled ? 'none' : '';
        mergeBtn.style.cursor = disabled ? 'not-allowed' : 'pointer';
      }
    }

    window.bulkSetType = function(type) {
      const cp = getCurrentPatient();
      let count = 0;
      cp.items.forEach(i => {
        if (selectedCardIds.has(i.id)) {
          if (i.type !== type) logItemEdit(i, { kind: 'type', from: i.type, to: type });
          i.type = type; touchItem(i); count++;
        }
      });
      selectedCardIds.clear();
      saveDataAndSync();
      showToast(`${count}件を変更しました`, 'success');
    };

    window.bulkAddTag = function(hIdStr) {
      if (!hIdStr) return;
      const hId = parseInt(hIdStr, 10);
      const cp = getCurrentPatient();
      let count = 0;
      cp.items.forEach(i => {
        if (selectedCardIds.has(i.id)) {
          if (!(i.hendersonIds || (i.hendersonIds = [])).includes(hId)) { i.hendersonIds.push(hId); (i.assessmentCols = i.assessmentCols || {})[hId] = 'unclassified'; logItemEdit(i, { kind: 'tagAdd', hId }); }
          touchItem(i);
          count++;
        }
      });

      selectedCardIds.clear();
      saveDataAndSync();
      showToast(`${count}件に「${HENDERSON_NEEDS.find(n => n.id === hId)?.name.replace(/^\d+\.\s*/, '')}」タグを追加しました`, 'success');
    };

    function itemMatchesSearch(item, term) {
      if (!term) return true;
      const t = term.toLowerCase();
      if ((item.text || '').toLowerCase().includes(t)) return true;
      if (item.timestamp && item.timestamp.toLowerCase().includes(t)) return true;
      const tagNames = (item.hendersonIds || []).map(hId => HENDERSON_NEEDS.find(n => n.id === hId)?.name || '').join(' ');
      return tagNames.toLowerCase().includes(t);
    }

    const boardSearchInput = document.getElementById('board-search');
    if (boardSearchInput) boardSearchInput.addEventListener('input', e => { boardSearchTerm = e.target.value.trim(); renderSoBoard(); });

    function searchBoardByWord(term) {
      term = String(term || '').replace(/\s+/g, ' ').trim();
      if (term.length < 2) return;
      boardSearchTerm = term;
      if (boardSearchInput) boardSearchInput.value = term;
      renderSoBoard();
      const cp = getCurrentPatient();
      const n = (cp.items || []).filter(i => itemMatchesSearch(i, term)).length;
      showToast(n ? `「${term.slice(0, 20)}」を含むカード ${n}枚を表示しました（検索欄を空にすると全部に戻ります）` : `「${term.slice(0, 20)}」を含むカードは見つかりませんでした`, n ? 'success' : 'info');
      if (boardSearchInput && boardSearchInput.scrollIntoView) boardSearchInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    window.searchBoardByWord = searchBoardByWord;
    (function setupSelectionSearch() {
      if (typeof document === 'undefined' || !document.body) return;
      let btn = null, pending = '';
      const hide = () => { if (btn) btn.style.display = 'none'; };
      const selectedWord = () => {
        const ta = document.getElementById('source-text');
        if (ta && document.activeElement === ta && ta.selectionEnd > ta.selectionStart) return ta.value.slice(ta.selectionStart, ta.selectionEnd);
        const sel = window.getSelection && window.getSelection();
        const view = document.getElementById('source-highlight-view');
        if (sel && !sel.isCollapsed && view && sel.anchorNode && view.contains(sel.anchorNode)) return sel.toString();
        return '';
      };
      const show = (x, y) => {
        const w = selectedWord().replace(/\s+/g, ' ').trim();
        if (w.length < 2 || w.length > 60) return hide();
        pending = w;
        if (!btn) {
          btn = document.createElement('button');
          btn.type = 'button';
          btn.id = 'sel-search-btn';
          btn.className = 'btn';
          btn.style.cssText = 'position:fixed;z-index:80;display:none;font-size:11px;padding:.25rem .6rem;background:var(--accent);color:var(--on-fill);border-radius:999px;box-shadow:0 2px 8px rgba(0,0,0,.25)';
          btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> このことばでカードを検索';
          btn.addEventListener('mousedown', e => e.preventDefault());
          btn.addEventListener('click', () => { const w2 = pending; hide(); searchBoardByWord(w2); });
          document.body.appendChild(btn);
        }
        btn.style.left = Math.max(8, Math.min(window.innerWidth - 220, x)) + 'px';
        btn.style.top = Math.max(8, y - 34) + 'px';
        btn.style.display = 'inline-flex';
      };
      document.addEventListener('mouseup', e => { if (e.target && e.target.id === 'sel-search-btn') return; setTimeout(() => show(e.clientX, e.clientY), 0); });
      document.addEventListener('keyup', e => { if (e.shiftKey) { const ta = document.getElementById('source-text'); const r = ta ? ta.getBoundingClientRect() : { left: 20, bottom: 60 }; show(r.left + 20, r.bottom); } });
      document.addEventListener('mousedown', e => { if (!e.target || e.target.id !== 'sel-search-btn') hide(); });
      document.addEventListener('scroll', hide, true);
    })();

    const bulkTagSelect = document.getElementById('bulk-tag-select');
    if (bulkTagSelect) HENDERSON_NEEDS.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n.id;
      opt.textContent = n.name;
      bulkTagSelect.appendChild(opt);
    });

    let keyBuffer = '';
    let keyBufferTimeout = null;
    document.addEventListener('keydown', e => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT' || document.activeElement?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if (!DOM.viewSoBoard || DOM.viewSoBoard.classList.contains('hidden')) return;

      if (document.querySelector('.fixed.inset-0:not(.hidden)')) return;
      if (e.key === 'Escape' && selectedCardIds.size > 0) { selectedCardIds.clear(); renderSoBoard(); return; }
      if (selectedCardIds.size !== 1) return;
      if (/^[0-9]$/.test(e.key)) {
        keyBuffer += e.key;
        clearTimeout(keyBufferTimeout);
        keyBufferTimeout = setTimeout(() => {
          const hId = parseInt(keyBuffer, 10);
          keyBuffer = '';
          if (hId >= 1 && hId <= 14) {
            const id = [...selectedCardIds][0];
            window.addHendersonTag(id, String(hId));
            showToast(`「${HENDERSON_NEEDS.find(n => n.id === hId)?.name.replace(/^\d+\.\s*/, '')}」タグを追加しました（数字キー）`, 'success');
          }
        }, 500);
        e.preventDefault();
      }
    });

    // ==========================================================================

    // ------------------------------------------------------------------------

    // ==========================================================================
    let mergeSourceItems = [];

    function joinTextsForMerge(items) {
      return joinWithPunctuation(items.map(i => (i.text || '').trim()));
    }

    function combineLearnedEntriesForMerge(sourceTexts) {
      const typeVotes = {}, hendersonVotes = {}, preferredCols = {};
      const seen = new Set();
      sourceTexts.forEach(t => {
        if (!t || seen.has(t)) return;
        seen.add(t);
        const e = globalAppData.learningUserDict[t];
        if (!e) return;
        Object.entries(e.typeVotes || {}).forEach(([k, v]) => { typeVotes[k] = (typeVotes[k] || 0) + v; });
        Object.entries(e.hendersonVotes || {}).forEach(([k, v]) => { hendersonVotes[k] = (hendersonVotes[k] || 0) + v; });
        Object.assign(preferredCols, e.preferredCols || {});
      });
      return { typeVotes, hendersonVotes, preferredCols };
    }

    window.openMergeModal = function() {
      const cp = getCurrentPatient();
      mergeSourceItems = cp.items.filter(i => selectedCardIds.has(i.id));
      if (mergeSourceItems.length < 2) return showToast('統合するカードを2件以上選択してください', 'info');

      document.getElementById('merge-source-count').textContent = String(mergeSourceItems.length);
      document.getElementById('merge-source-list').innerHTML = mergeSourceItems.map(i =>
        `<div class="text-[11px] text-[var(--ink-muted)] break-words p-1 border-b border-[var(--line-soft)] last:border-0">${escapeHtml(i.text)}</div>`
      ).join('');

      document.getElementById('merge-text').value = joinTextsForMerge(mergeSourceItems);

      const typeCounts = {};
      mergeSourceItems.forEach(i => { if (i.type !== 'unnecessary') typeCounts[i.type] = (typeCounts[i.type] || 0) + 1; });
      const defaultType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'o';
      document.querySelectorAll('input[name="merge-type"]').forEach(r => { r.checked = r.value === defaultType; });

      const unionTagIds = new Set();
      mergeSourceItems.forEach(i => (i.hendersonIds || []).forEach(hId => unionTagIds.add(hId)));
      document.getElementById('merge-tags-list').innerHTML = HENDERSON_NEEDS.map(n => `
        <label class="flex items-center gap-1 text-[11px] text-[var(--ink)] border border-[var(--line-soft)] rounded-[var(--radius-sm)] px-1.5 py-0.5 cursor-pointer">
          <input type="checkbox" class="merge-tag-checkbox" value="${n.id}" ${unionTagIds.has(n.id) ? 'checked' : ''}> ${escapeHtml(n.name)}
        </label>
      `).join('');

      document.getElementById('modal-merge').classList.remove('hidden');
    };

    window.closeMergeModal = function() {
      document.getElementById('modal-merge').classList.add('hidden');
      mergeSourceItems = [];
    };
    document.getElementById('btn-close-merge').addEventListener('click', closeMergeModal);
    document.getElementById('btn-cancel-merge').addEventListener('click', closeMergeModal);
    document.getElementById('modal-merge').addEventListener('click', e => { if (e.target === document.getElementById('modal-merge')) closeMergeModal(); });

    document.getElementById('btn-confirm-merge').addEventListener('click', () => {
      if (mergeSourceItems.length < 2) return closeMergeModal();
      const cp = getCurrentPatient();
      const mergedText = cleanExtractedPhrase(document.getElementById('merge-text').value);
      if (!mergedText) return showToast('統合後の内容を入力してください', 'warn');
      const finalType = document.querySelector('input[name="merge-type"]:checked')?.value || 'o';
      const finalHendersonIds = [...document.querySelectorAll('.merge-tag-checkbox:checked')].map(el => Number(el.value));

      const finalCols = {};
      finalHendersonIds.forEach(hId => {
        const src = mergeSourceItems.find(i => i.assessmentCols && i.assessmentCols[hId]);
        finalCols[hId] = src ? src.assessmentCols[hId] : 'unclassified';
      });

      const fieldLabels = new Set(mergeSourceItems.map(i => i.fieldLabel || null));
      const fieldLabel = fieldLabels.size === 1 ? [...fieldLabels][0] : null;
      const timestampCandidate = mergeSourceItems.find(i => i.timestamp && i.timestamp !== '日時不明')?.timestamp;

      const sourceTexts = mergeSourceItems.map(i => i.text);
      const sourceIds = new Set(mergeSourceItems.map(i => i.id));
      let insertIndex = Infinity;
      cp.items.forEach((i, idx) => { if (sourceIds.has(i.id) && idx < insertIndex) insertIndex = idx; });

      const mergedItem = {
        id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        editLog: [{ at: new Date().toISOString(), kind: 'merge', from: sourceTexts.slice() }],
        text: mergedText,
        timestamp: timestampCandidate || '日時不明',
        type: finalType,
        hendersonIds: finalHendersonIds,
        assessmentCols: finalCols,
        fieldLabel,
        _touchedAt: new Date().toISOString(),
        predictionSource: 'confirmed'
      };

      const combined = combineLearnedEntriesForMerge(sourceTexts);
      if (finalType !== 'unnecessary') combined.typeVotes[finalType] = (combined.typeVotes[finalType] || 0) + 1;
      const finalHendersonVotes = {};
      const finalPreferredCols = {};
      finalHendersonIds.forEach(hId => {
        finalHendersonVotes[hId] = (combined.hendersonVotes[hId] || 0) + 1;
        const col = finalCols[hId] || combined.preferredCols[hId];
        if (col) finalPreferredCols[hId] = col;
      });
      globalAppData.learningUserDict[mergedText] = {
        typeVotes: combined.typeVotes,
        hendersonVotes: finalHendersonVotes,
        preferredType: pickTopVote(combined.typeVotes) || finalType,
        preferredHendersonIds: Object.entries(finalHendersonVotes).filter(([, c]) => c > 0).map(([k]) => Number(k)),
        preferredCols: finalPreferredCols,
        lastMergedFrom: sourceTexts
      };

      const removedItems = cp.items.filter(i => sourceIds.has(i.id));
      cp.items = cp.items.filter(i => !sourceIds.has(i.id));
      sourceIds.forEach(sid => markItemDeleted(cp, sid));
      const clampedIndex = Math.min(insertIndex, cp.items.length);
      cp.items.splice(clampedIndex, 0, mergedItem);

      const patId = cp.id;
      selectedCardIds.clear();
      closeMergeModal();
      saveDataAndSync();
      showToast(`${removedItems.length}件のカードを1枚に統合しました`, 'success');
      reportLearningEvent(mergedText, 'merge', { sourceTexts, type: finalType, hendersonIds: finalHendersonIds, cols: finalCols });
      showUndoToast('カードの統合を取り消せます', () => {
        const p = globalAppData.patients.find(x => x.id === patId);
        if (!p) return;
        p.items = p.items.filter(i => i.id !== mergedItem.id);
        markItemDeleted(p, mergedItem.id);
        const idx = Math.min(clampedIndex, p.items.length);
        removedItems.forEach(i => { touchItem(i); unmarkItemDeleted(p, i.id); });
        p.items.splice(idx, 0, ...removedItems);
      }, { patientId: patId });
    });

    // ==========================================================================

    // ==========================================================================
    let cardReportTargetItem = null;
    window.openCardReportModal = function(id) {
      const item = getCurrentPatient().items.find(i => i.id === id);
      if (!item) return;
      cardReportTargetItem = item;
      document.getElementById('card-report-target-text').textContent = item.text;
      document.getElementById('card-report-comment').value = '';
      document.getElementById('modal-card-report').classList.remove('hidden');
      setTimeout(() => document.getElementById('card-report-comment').focus(), 30);
    };
    window.closeCardReportModal = function() {
      document.getElementById('modal-card-report').classList.add('hidden');
      cardReportTargetItem = null;
    };
    document.getElementById('btn-close-card-report').addEventListener('click', closeCardReportModal);
    document.getElementById('btn-cancel-card-report').addEventListener('click', closeCardReportModal);
    document.getElementById('modal-card-report').addEventListener('click', e => { if (e.target === document.getElementById('modal-card-report')) closeCardReportModal(); });

    document.getElementById('btn-confirm-card-report').addEventListener('click', async () => {
      if (!cardReportTargetItem) return closeCardReportModal();
      const cp = getCurrentPatient();
      const comment = document.getElementById('card-report-comment').value.trim();
      const cardText = cardReportTargetItem.text;
      closeCardReportModal();
      try {
        await fetch(`${API_BASE}/card-reports`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: cardReportSessionId, patientId: cp.id, patientTitle: cp.title, cardText, comment })
        });
        showToast('報告を送信しました。ご協力ありがとうございます', 'success');
      } catch (e) {
        console.warn('Card report send failed:', e);
        showToast(['報告を送れませんでした（共有先のサーバーにつながりません）', { text: 'サーバーが動いているか確かめてから、もう一度送ってください。', detail: true }], 'error');
      }
    });

    window.editItemText = async function(id) {
      const cp = getCurrentPatient();
      const item = cp.items.find(i => i.id === id);
      if (!item) return;
      const expected = JSON.stringify(cp.items);
      const oldText = item.text;
      const newText = await openDialog({ title: 'カードの内容を編集', inputValue: item.text, confirmLabel: '更新する' });

      if (newText === null) return false;
      if (getCurrentPatient().id !== cp.id || JSON.stringify(cp.items) !== expected) { showToast('確認中に患者やカードが更新されました。変更していません', 'warn'); return false; }
      const cleaned = cleanExtractedPhrase(newText);
      if (!cleaned) { showToast('空の内容にはできません。カードを消すときは「消去」を使ってください', 'warn'); return; }
      item.text = cleaned;
      {
        touchItem(item);
        saveDataAndSync(); showToast('カード内容を更新しました', 'success');
        if (item.text !== oldText) {
          logItemEdit(item, { kind: 'text', from: oldText, to: item.text });
          saveDataAndSync();

          reportLearningEvent(oldText, 'edit', { newText: item.text });
        }
      }
    };

    // ==========================================================================

    // ------------------------------------------------------------------------

    window.reapplyTagRulesToUntagged = function() {
      const cp = getCurrentPatient();
      let fixedTagCount = 0;
      let fixedRefCount = 0;
      let fixedTypeCount = 0;
      let fixedBackgroundCount = 0;
      let fixedAssessmentColCount = 0;

      let admissionPhase = 'preadmission';
      cp.items.forEach(item => {
        const phaseSignal = detectAdmissionPhaseSignal(item.timestamp) || detectAdmissionPhaseSignal(item.text);
        if (phaseSignal) admissionPhase = phaseSignal;

        if (item.type === 'unnecessary') return;

        const reformatted = formatLabValueString(item.text);
        if (reformatted !== item.text) {
          const oldText = item.text;
          item.text = reformatted;
          touchItem(item);
          fixedRefCount++;
          reportLearningEvent(oldText, 'edit', { newText: item.text });
        }

        const userLearned = globalAppData.learningUserDict[item.text];

        if (item.type === 'unclassified') {
          const pseudoChunk = { fieldLabel: item.fieldLabel, isUnnecessaryBoilerplate: isUnnecessaryBoilerplateText(item.text) };
          const newType = predictLocalItemType(pseudoChunk, item.text, userLearned);
          if (newType && newType !== item.type) {
            item.type = newType;
            touchItem(item);
            fixedTypeCount++;
          }
        }

        if (Array.isArray(item.hendersonIds) && item.hendersonIds.length > 0) {

          item.assessmentCols = item.assessmentCols || {};
          item.hendersonIds.forEach(hId => {
            if (userLearned?.preferredCols?.[hId]) return;
            if ((item.assessmentCols[hId] || 'unclassified') !== 'unclassified') return;
            const inferredCol = inferAssessmentColumn(item.fieldLabel, item.timestamp, admissionPhase);
            if (inferredCol) {
              item.assessmentCols[hId] = inferredCol;
              touchItem(item);
              fixedAssessmentColCount++;
            }
          });

          if (item.patientBackground) { item.patientBackground = null; touchItem(item); fixedBackgroundCount++; }
          return;
        }
        const suggested = suggestHendersonTagsForText(item.text, item.fieldLabel, userLearned);
        if (suggested.length > 0) {
          item.hendersonIds = suggested;
          item.assessmentCols = item.assessmentCols || {};
          suggested.forEach(hid => {
            if (!(hid in item.assessmentCols)) {
              item.assessmentCols[hid] = userLearned?.preferredCols?.[hid]
                || inferAssessmentColumn(item.fieldLabel, item.timestamp, admissionPhase)
                || 'unclassified';
            }
          });
          item.patientBackground = null;
          touchItem(item);
          fixedTagCount++;
          return;
        }

        if (item.type !== 'unnecessary') {
          const newBackground = classifyPatientBackground(item.fieldLabel);
          if (item.patientBackground !== newBackground) {
            item.patientBackground = newBackground;
            touchItem(item);
            fixedBackgroundCount++;
          }
        }
      });
      if (fixedTagCount > 0 || fixedRefCount > 0 || fixedTypeCount > 0 || fixedBackgroundCount > 0 || fixedAssessmentColCount > 0) {
        saveDataAndSync();
        const parts = [];
        if (fixedRefCount > 0) parts.push(`${fixedRefCount}件の検査値カードに基準値を反映`);
        if (fixedTypeCount > 0) parts.push(`${fixedTypeCount}件のS/O未分類カードを再分類`);
        if (fixedTagCount > 0) parts.push(`${fixedTagCount}件のタグ未設定カードにタグを再提案`);
        if (fixedBackgroundCount > 0) parts.push(`${fixedBackgroundCount}件の基本情報カードを確認`);
        if (fixedAssessmentColCount > 0) parts.push(`${fixedAssessmentColCount}件を総合アセスメント表の入院前／入院後に分類`);
        showToast(parts.join('、') + 'しました', 'success');
      } else {
        showToast('現在のルールで新たに反映できるカードはありませんでした', 'info');
      }
    };

    // ------------------------------------------------------------------------

    function findOtherCardsWithSameText(items, sourceItem, needsApply) {
      if (!sourceItem) return [];
      return (items || []).filter(i => i && i.id !== sourceItem.id && i.text === sourceItem.text && needsApply(i));
    }
    async function offerBulkApplySameText(cp, sourceItem, description, needsApply, apply) {
      if (!cp || !sourceItem) return;
      const others = findOtherCardsWithSameText(cp.items, sourceItem, needsApply);
      if (others.length === 0) return;
      const ok = await openDialog({
        title: '同じ文言の他のカードにも反映しますか？',
        message: `このカルテ内に同じ文言のカードが他に${others.length}件あります。${description}を、それらにも反映しますか？`,
        confirmLabel: `${others.length}件に反映する`
      });
      if (!ok) return;
      others.forEach(i => { apply(i); touchItem(i); });
      saveDataAndSync();
      showToast(`他${others.length}件のカードにも反映しました`, 'success');
    }

    window.addHendersonTag = function(id, hIdStr) {
      if (!hIdStr) return;
      const hId = parseInt(hIdStr, 10), cp = getCurrentPatient(), item = cp.items.find(i => i.id === id);
      if (item && !(item.hendersonIds || (item.hendersonIds = [])).includes(hId)) {

        item.hendersonIds.push(hId); (item.assessmentCols = item.assessmentCols || {})[hId] = 'unclassified';
        logItemEdit(item, { kind: 'tagAdd', hId });

        item.patientBackground = null;
        item.predictionSource = 'confirmed';

        const learned = globalAppData.learningUserDict[item.text] = { ...globalAppData.learningUserDict[item.text] };
        learned.hendersonVotes = { ...(learned.hendersonVotes || {}) };
        learned.hendersonVotes[hId] = (learned.hendersonVotes[hId] || 0) + 1;
        learned.preferredHendersonIds = Object.entries(learned.hendersonVotes).filter(([, c]) => c > 0).map(([k]) => Number(k));
        touchItem(item);
        saveDataAndSync();
        reportLearningEvent(item.text, 'tagAdd', { hendersonId: hId, voteCount: learned.hendersonVotes[hId] });
        offerBulkApplySameText(
          cp, item,
          `タグ「${hendersonNameOf(hId).replace(/^\d+\.\s*/, '')}」の追加`,
          i => !(i.hendersonIds || []).includes(hId),
          i => { (i.hendersonIds || (i.hendersonIds = [])).push(hId); (i.assessmentCols = i.assessmentCols || {})[hId] = 'unclassified'; i.patientBackground = null; i.predictionSource = 'confirmed'; }
        );
      }
    };

    window.addHendersonTagFromDropdown = function(id, hIdStr) {
      selectedCardIds.delete(id);
      window.addHendersonTag(id, hIdStr);
    };

    window.removeHendersonTag = function(id, hId) {
      const cp = getCurrentPatient(), item = cp.items.find(i => i.id === id);
      if (item?.hendersonIds) {
        item.hendersonIds = item.hendersonIds.filter(idNum => idNum !== hId);
        logItemEdit(item, { kind: 'tagRemove', hId });
        if (item.assessmentCols) delete item.assessmentCols[hId];
        item.predictionSource = 'confirmed';
        const learned = globalAppData.learningUserDict[item.text] = { ...globalAppData.learningUserDict[item.text] };
        learned.hendersonVotes = { ...(learned.hendersonVotes || {}) };
        learned.hendersonVotes[hId] = Math.max(0, (learned.hendersonVotes[hId] || 0) - 1);
        learned.preferredHendersonIds = Object.entries(learned.hendersonVotes).filter(([, c]) => c > 0).map(([k]) => Number(k));
        selectedCardIds.delete(id);
        touchItem(item);
        saveDataAndSync();
        reportLearningEvent(item.text, 'tagRemove', { hendersonId: hId, voteCount: learned.hendersonVotes[hId] });
        offerBulkApplySameText(
          cp, item,
          `タグ「${hendersonNameOf(hId).replace(/^\d+\.\s*/, '')}」の削除`,
          i => (i.hendersonIds || []).includes(hId),
          i => { i.hendersonIds = (i.hendersonIds || []).filter(idNum => idNum !== hId); if (i.assessmentCols) delete i.assessmentCols[hId]; i.predictionSource = 'confirmed'; }
        );
      }
    };

    window.setItemType = function(id, type) {
      const cp = getCurrentPatient(), item = cp.items.find(i => i.id === id);
      if (item) {
        const prevType = item.type;

        if (type === prevType) return;
        item.type = type;
        item.predictionSource = 'confirmed';
        logItemEdit(item, { kind: 'type', from: prevType, to: type });
        touchItem(item);
        if (type !== 'unnecessary') {

          const learned = globalAppData.learningUserDict[item.text] = { ...globalAppData.learningUserDict[item.text] };
          learned.typeVotes = { ...(learned.typeVotes || {}) };
          learned.typeVotes[type] = (learned.typeVotes[type] || 0) + 1;
          learned.preferredType = pickTopVote(learned.typeVotes);
          saveDataAndSync();
          const voteCount = learned.typeVotes[type];
          showToast(`分類(${type})を学習しました${voteCount > 1 ? `（×${voteCount}）` : ''}`);
          reportLearningEvent(item.text, 'type', { type, from: prevType, voteCount });
          offerBulkApplySameText(
            cp, item,
            `分類「${type === 's' ? 'S(主観的情報)' : 'O(客観的情報)'}」への変更`,
            i => i.type !== type,
            i => { i.type = type; i.predictionSource = 'confirmed'; }
          );
        } else {
          saveDataAndSync();
          const patId = getCurrentPatient().id;
          showUndoToast('不要判定にしました', () => {
            const p = globalAppData.patients.find(x => x.id === patId);
            const it = p?.items.find(i => i.id === id);
            if (it) { it.type = prevType; touchItem(it); }
          }, { patientId: patId });
        }
      }
    };

    window.deleteItem = function(id) {
      const cp = getCurrentPatient();
      const idx = cp.items.findIndex(i => i.id === id);
      if (idx === -1) return;
      const [removed] = cp.items.splice(idx, 1);
      markItemDeleted(cp, id);
      const patId = cp.id;
      selectedCardIds.delete(id);
      saveDataAndSync();
      const undoExpected = JSON.stringify(cp.items);
      showUndoToast('カードを削除しました', () => {
        const p = globalAppData.patients.find(x => x.id === patId);
        if (p && JSON.stringify(p.items) === undoExpected) {
          touchItem(removed);
          unmarkItemDeleted(p, id);
          p.items.splice(Math.min(idx, p.items.length), 0, removed);
        }
      }, { patientId: patId });
    };

    window.clearUnnecessary = async function() {
      const cp = getCurrentPatient();
      const removed = cp.items.filter(i => i.type === 'unnecessary');
      if (removed.length === 0) return showToast('不要な情報はありません', 'info');
      const expected = JSON.stringify(cp.items);

      const ok = await openDialog({ title: `不要な情報を${removed.length}枚消去しますか？`, message: `「不必要な情報」にあるカード${removed.length}枚を、このカルテから消します。消した直後に出る「元に戻す」を押せば戻せます。`, confirmLabel: `${removed.length}枚を消去`, danger: true });
      if (ok !== true) return false;
      if (getCurrentPatient().id !== cp.id || JSON.stringify(cp.items) !== expected) { showToast('確認中に患者やカードが更新されました。削除していません', 'warn'); return false; }
      cp.items = cp.items.filter(i => i.type !== 'unnecessary');
      removed.forEach(i => markItemDeleted(cp, i.id));
      const patId = cp.id;
      saveDataAndSync();
      const undoExpected = JSON.stringify(cp.items);
      showUndoToast(`不要な情報を${removed.length}件消去しました`, () => {
        const p = globalAppData.patients.find(x => x.id === patId);
        if (p && JSON.stringify(p.items) === undoExpected) {
          removed.forEach(i => { touchItem(i); unmarkItemDeleted(p, i.id); });
          p.items.push(...removed);
        }
      }, { patientId: patId });
    };

    window.allowDrop = e => e.preventDefault();
    window.handleDrop = (e, targetType) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      if (id && !id.startsWith('asc_')) setItemType(id, targetType);
    };

    function renderAssessmentTable() {
      if (typeof resetCardLabFlags === 'function') resetCardLabFlags();
      const cp = getCurrentPatient();

      cp.items.forEach(i => { if (!i.assessmentCols || typeof inferAssessmentColumn !== 'function') return; const col = inferAssessmentColumn(i.fieldLabel, i.timestamp, null); if (!col) return; Object.keys(i.assessmentCols).forEach(h => { if (i.assessmentCols[h] === 'unclassified') i.assessmentCols[h] = col; }); });
      const activeItems = cp.items.filter(i => i.type !== 'unnecessary');
      const selectedNeed = getSelectedAssessmentNeed();
      const frag = document.createDocumentFragment();

      const ownAsm = typeof renderMyAssessmentRowHtml === 'function';
      const focusBefore = ownAsm ? captureMyAssessmentFocus() : null;
      let singleHtml = '';

      HENDERSON_NEEDS.forEach(need => {
        const matching = activeItems.filter(i => i.hendersonIds?.includes(need.id));

        const seqLabels = assessmentSeqLabels(matching, need.id);

        const evidenceIds = ownAsm ? myEvidenceIdSet(cp, need.id) : new Set();

        const categorize = col => {
          const list = matching.filter(i => (i.assessmentCols?.[need.id] || 'unclassified') === col);

          const posInDay = new Map();
          groupItemsByDay(list).forEach(g => g.items.forEach((i, k) => posInDay.set(i.id, { k, len: g.items.length })));
          return assessmentDayGroups(col, list).map(g => {
            const heading = g.day ? `<div class="asc-day-heading${g.background ? ' asc-bg-heading' : ''}"${g.background ? ' title="診断名・現病歴などの背景情報（観察・ケアの記録とは分けて表示）"' : ''}>${g.background ? '<i class="fa-solid fa-book-medical"></i> ' : ''}${escapeHtml(g.day)}</div>` : '';
            const cardHtml = i => {
              const pos = posInDay.get(i.id);
              return renderAssessmentCellCard(i, need.id, seqLabels[i.id], pos.k === 0, pos.k === pos.len - 1, g.day, evidenceIds.has(i.id));
            };

            return heading + groupItemsByScene(g.items).map(sc => {
              if (!sc.paired) return sc.items.map(cardHtml).join('');
              const clock = timestampClockPart(sc.items[0].timestamp);
              const label = clock || (g.day ? '' : timestampDayPart(sc.items[0].timestamp));
              return `<div class="asc-scene" title="同じ場面の発言（S）と観察（O）">
                ${label ? `<div class="asc-scene-label"><i class="fa-solid fa-link"></i> ${escapeHtml(label)}</div>` : ''}
                <div class="asc-scene-grid"><div class="asc-scene-col">${sc.items.filter(i => i.type === 's').map(cardHtml).join('')}</div><div class="asc-scene-col">${sc.items.filter(i => i.type !== 's').map(cardHtml).join('')}</div></div>
              </div>`;
            }).join('');
          }).join('');
        };

        if (selectedNeed !== 'all') {
          if (Number(selectedNeed) === need.id) singleHtml = renderAssessmentSingleHtml(cp, need, matching, categorize);
          return;
        }
        const needLabel = need.name.replace(/^\d+\.\s*/, '');

        const phaseJudge = key => ownAsm && typeof sufficiencyPhaseHtml === 'function' ? sufficiencyPhaseHtml(cp, need.id, key) : '';

        const postJudge = () => (typeof isSurgicalPatient === 'function' && isSurgicalPatient(cp)) ? phaseJudge('preop') + phaseJudge('postop') : phaseJudge('post');
        const tr = document.createElement('tr');
        tr.className = "border-b border-[var(--line)] hover:bg-[var(--paper)]/60";
        tr.innerHTML = `
          <td class="need-cell border border-[var(--line)] p-3 bg-[var(--paper)] align-top w-56">
            <div class="flex items-start gap-2.5">
              <span class="need-number shrink-0 w-7 h-7 rounded-full bg-[var(--accent)] on-fill font-display font-semibold text-[13px] flex items-center justify-center">${need.id}</span>
              <div class="flex items-start gap-1.5 min-w-0 pt-0.5">
                <i class="fa-solid ${need.icon} text-[var(--accent)] text-[11px] shrink-0 mt-0.5"></i>
                <span class="text-[12.5px] leading-snug font-semibold text-[var(--ink)] break-words font-sans">${needLabel}</span>
              </div>
            </div>
            ${ownAsm && typeof sufficiencyMiniHtml === 'function' ? sufficiencyMiniHtml(cp, need.id) : ''}
          </td>
          <td class="border border-[var(--line)] p-1.5 align-top min-h-[60px]" ondragover="allowDrop(event)" ondrop="handleAssessmentDrop(event, ${need.id}, 'unclassified')"><div class="space-y-1.5">${categorize('unclassified')}</div></td>
          <td class="border border-[var(--line)] p-1.5 align-top bg-[var(--slate-soft)]/30 min-h-[60px]" ondragover="allowDrop(event)" ondrop="handleAssessmentDrop(event, ${need.id}, 'preadmission')"><div class="space-y-1.5">${categorize('preadmission')}</div>${phaseJudge('pre')}</td>
          <td class="border border-[var(--line)] p-1.5 align-top bg-[var(--accent-soft)]/40 min-h-[60px]" ondragover="allowDrop(event)" ondrop="handleAssessmentDrop(event, ${need.id}, 'postadmission')"><div class="space-y-1.5">${categorize('postadmission')}</div>${postJudge()}</td>
          <td class="border border-[var(--line)] p-1.5 align-top bg-[var(--brick-soft)]/40 min-h-[60px]" ondragover="allowDrop(event)" ondrop="handleAssessmentDrop(event, ${need.id}, 'missing')">
            <div class="space-y-1.5">${categorize('missing')}</div>
            <button onclick="openMissingModal(${need.id})" class="mt-1.5 text-[10px] text-[var(--brick)] hover:text-[var(--ink)] font-medium flex items-center w-full justify-center p-1 border border-dashed border-[var(--brick-line)] rounded-[var(--radius-sm)]"><i class="fa-solid fa-plus mr-1"></i> 追加</button>
          </td>
        `;
        tr.dataset.needId = String(need.id);
        const hiddenRow = selectedNeed !== 'all' && Number(selectedNeed) !== need.id;
        if (hiddenRow) tr.classList.add('hidden');
        frag.appendChild(tr);

        if (ownAsm && !hiddenRow && selectedNeed === 'all' && myAssessmentAlwaysShown()) {
          const own = document.createElement('tr');
          own.className = 'my-asm-row';
          own.dataset.needId = String(need.id);
          own.innerHTML = `<td colspan="5" class="my-asm-cell">${renderMyAssessmentRowHtml(cp, need, selectedNeed === 'all')}</td>`;
          frag.appendChild(own);
        }
      });
      document.getElementById('assessment-tbody').replaceChildren(frag);
      const sufSum = document.getElementById('suf-summary');
      if (sufSum && typeof sufficiencyMiniHtml === 'function') sufSum.innerHTML = sufficiencySummaryHtml(cp);

      const aiSufBtn = document.getElementById('btn-sufficiency-ai');
      if (aiSufBtn && typeof hasRuleSufficiency === 'function') aiSufBtn.classList.toggle('hidden', !hasRuleSufficiency(cp));
      const single = document.getElementById('assessment-single');
      const tableWrap = document.getElementById('assessment-table-wrap');
      if (single && single.classList) {
        const isSingle = selectedNeed !== 'all';
        single.classList.toggle('hidden', !isSingle);
        if (tableWrap && tableWrap.classList) tableWrap.classList.toggle('hidden', isSingle);
        single.innerHTML = isSingle ? singleHtml : '';
      }
      renderNeedNavigator(activeItems);
      if (focusBefore) restoreMyAssessmentFocus(focusBefore);
      if (typeof renderMissingCheckSummary === 'function') renderMissingCheckSummary(cp);
    }

    function renderAssessmentSingleHtml(cp, need, matching, categorize) {
      const count = col => matching.filter(i => (i.assessmentCols?.[need.id] || 'unclassified') === col).length;
      const nUnc = count('unclassified'), nPre = count('preadmission'), nPost = count('postadmission'), nMiss = count('missing');
      const missItems = matching.filter(i => (i.assessmentCols?.[need.id] || 'unclassified') === 'missing');
      const unchecked = typeof missingCheckStatus === 'function' ? missItems.filter(i => missingCheckStatus(cp, i.id) === 'unchecked').length : nMiss;
      const drop = col => `ondragover="allowDrop(event)" ondrop="handleAssessmentDrop(event, ${need.id}, '${col}')"`;
      const name = need.name.replace(/^\d+\.\s*/, '');
      const phaseJ = key => typeof sufficiencyPhaseHtml === 'function' ? sufficiencyPhaseHtml(cp, need.id, key) : '';

      const own = typeof renderMyAssessmentRowHtml === 'function' && myAssessmentAlwaysShown() ? `<div class="asm-own">${renderMyAssessmentRowHtml(cp, need, false)}</div>` : '';
      return `<div class="asm-single-head"><span class="need-number asm-single-no">${need.id}</span><i class="fa-solid ${need.icon} text-[var(--accent)]"></i><b>${escapeHtml(name)}</b><span class="my-asm-muted">カード ${matching.length}枚</span></div>${typeof sufficiencyReasonHtml === 'function' ? sufficiencyReasonHtml(cp, need.id) : ''}
        <section class="asm-aux asm-aux-unc${nUnc ? '' : ' is-empty'}" ${drop('unclassified')}>
          <div class="asm-aux-title"><span class="col-dot" style="background:var(--ink-muted)"></span>未分類 <b>${nUnc}</b><span class="my-asm-muted">${nUnc ? '入院前・入院後に振り分けてください（ドラッグ、またはカードの「前」「後」）' : '未分類のカードはありません'}</span></div>
          ${nUnc ? `<div class="asm-aux-body">${categorize('unclassified')}</div>` : ''}
        </section>
        <div class="asm-center">
          <section class="asm-col asm-col-pre" ${drop('preadmission')}><div class="asm-col-title">入院前 <b>${nPre}</b></div><div class="space-y-1.5">${categorize('preadmission') || '<p class="my-asm-muted">カードをここへドラッグできます</p>'}</div>${phaseJ('pre')}</section>
          <section class="asm-col asm-col-post" ${drop('postadmission')}><div class="asm-col-title">入院後 <b>${nPost}</b></div><div class="space-y-1.5">${categorize('postadmission') || '<p class="my-asm-muted">カードをここへドラッグできます</p>'}</div>${(typeof isSurgicalPatient === 'function' && isSurgicalPatient(cp)) ? phaseJ('preop') + phaseJ('postop') : phaseJ('post')}</section>
        </div>
        <section class="asm-aux asm-aux-miss" ${drop('missing')}>
          <div class="asm-aux-title"><i class="fa-solid fa-clipboard-question" style="color:var(--brick)"></i>不足情報 <b>${nMiss}</b>${nMiss ? `<span class="my-asm-muted">未確認 ${unchecked}</span>` : '<span class="my-asm-muted">まだありません</span>'}
            <button type="button" onclick="openMissingModal(${need.id})" class="asm-aux-add"><i class="fa-solid fa-plus"></i> 不足情報を追加</button></div>
          ${nMiss ? `<div class="asm-aux-body">${categorize('missing')}</div>` : ''}
        </section>
        ${own}`;
    }

    const ASSESSMENT_NEED_KEY = 'nursing_assessment_need';
    function getSelectedAssessmentNeed() {
      let v = null;
      try { v = localStorage.getItem(ASSESSMENT_NEED_KEY); } catch (e) {   }
      if (v === 'all') return 'all';
      const n = Number(v);
      return n >= 1 && n <= 14 ? n : 1;
    }

    function renderNeedNavigator(activeItems) {
      const nav = document.getElementById('assessment-need-nav');
      if (!nav) return;
      const selected = getSelectedAssessmentNeed();
      const btns = HENDERSON_NEEDS.map(need => {
        const matching = activeItems.filter(i => i.hendersonIds?.includes(need.id));
        const unclassified = matching.filter(i => (i.assessmentCols?.[need.id] || 'unclassified') === 'unclassified').length;
        const missingN = matching.filter(i => (i.assessmentCols?.[need.id] || 'unclassified') === 'missing' && (typeof missingCheckStatus !== 'function' || missingCheckStatus(getCurrentPatient(), i.id) === 'unchecked')).length;
        const active = Number(selected) === need.id;
        const name = need.name.replace(/^\d+\.\s*/, '');
        return `<button class="need-nav-btn${active ? ' active' : ''}${matching.length ? '' : ' empty'}" data-need-id="${need.id}" aria-pressed="${active}" onclick="selectAssessmentNeed(${need.id})" title="${escapeHtml(need.name)}（カード${matching.length}枚${unclassified ? `・未分類${unclassified}枚` : ''}）">
          <span class="need-nav-no">${need.id}</span><span class="need-nav-name">${escapeHtml(name)}</span><span class="need-nav-count">${matching.length}</span>${missingN ? `<span class="need-nav-miss" title="未確認の不足情報 ${missingN}件">欠${missingN}</span>` : ''}${unclassified ? '<span class="need-nav-dot" aria-label="未分類あり"></span>' : ''}
        </button>`;
      }).join('');
      const idx = selected === 'all' ? -1 : Number(selected);
      nav.innerHTML = `
        <button class="need-nav-step" onclick="stepAssessmentNeed(-1)" ${idx <= 1 ? 'disabled' : ''} aria-label="前の欲求" title="前の欲求（←キー）"><i class="fa-solid fa-chevron-left"></i></button>
        <div class="need-nav-list">${btns}</div>
        <button class="need-nav-step" onclick="stepAssessmentNeed(1)" ${idx === -1 || idx >= 14 ? 'disabled' : ''} aria-label="次の欲求" title="次の欲求（→キー）"><i class="fa-solid fa-chevron-right"></i></button>
        <button class="need-nav-all${selected === 'all' ? ' active' : ''}" data-need-id="all" aria-pressed="${selected === 'all'}" onclick="selectAssessmentNeed('all')" title="14項目すべてを縦に並べて表示">すべて</button>`;
    }
    window.selectAssessmentNeed = function(id) {
      try { localStorage.setItem(ASSESSMENT_NEED_KEY, String(id)); } catch (e) {   }
      renderAssessmentTable();

      const nav = document.getElementById('assessment-need-nav');
      if (nav) {
        const top = nav.getBoundingClientRect().top;
        const header = document.querySelector('header');
        const headerH = header ? header.getBoundingClientRect().height : 0;
        if (top < headerH || top > (window.innerHeight || 0) * 0.6) window.scrollBy({ top: top - headerH - 8, behavior: 'smooth' });
      }
    };
    window.stepAssessmentNeed = function(delta) {
      const cur = getSelectedAssessmentNeed();
      const next = cur === 'all' ? 1 : Math.min(14, Math.max(1, cur + delta));
      selectAssessmentNeed(next);
    };
    document.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      const nav = document.getElementById('assessment-need-nav');
      if (!nav || !nav.contains(e.target)) return;
      const view = document.getElementById('view-assessment');
      if (!view || view.classList.contains('hidden')) return;
      if (typeof isCardOverviewOpen === 'function' && isCardOverviewOpen()) return;
      if (document.querySelector('.fixed.inset-0:not(.hidden)')) return;
      if (/^(?:INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '') || (e.target && e.target.isContentEditable)) return;
      e.preventDefault();
      if (e.key === 'Home' || e.key === 'End') selectAssessmentNeed(e.key === 'Home' ? 1 : 14);
      else stepAssessmentNeed(e.key === 'ArrowLeft' ? -1 : 1);

      nav.querySelector(`[data-need-id="${getSelectedAssessmentNeed()}"]`)?.focus();
    });

    function renderAssessmentCellCard(item, hId, seqLabel, isFirst, isLast, dayHeading, isEvidence = false) {
      const currentCol = item.assessmentCols?.[hId] || 'unclassified';
      const isMissingCol = currentCol === 'missing';

      const isS = item.type === 's' && !isMissingCol;
      const isO = item.type === 'o' && !isMissingCol;

      const badge = isS
        ? `<span onclick="jumpToBoardCard(${jsArg(item.id)})" class="px-1.5 py-[1px] rounded-[var(--radius-sm)] font-bold text-[9px] tracking-tight cursor-pointer" title="分類ボードの該当カードを表示" style="background:var(--gold);color:var(--on-fill);">${seqLabel || 'S'}</span>`
        : (isO
          ? `<span onclick="jumpToBoardCard(${jsArg(item.id)})" class="px-1.5 py-[1px] rounded-[var(--radius-sm)] font-bold text-[9px] tracking-tight cursor-pointer" title="分類ボードの該当カードを表示" style="background:var(--slate);color:var(--on-fill);">${seqLabel || 'O'}</span>`
          : '');
      const familyMark = isFamilySpeech(item.text) ? '<span class="text-[8px] font-bold px-1 rounded-[var(--radius-sm)]" style="background:var(--gold-soft);color:var(--gold);" title="家族の発言">家族</span>' : '';
      const cardBg = isS ? 'var(--gold-soft)' : (isO ? 'var(--slate-soft)' : 'var(--surface)');
      const accentColor = isS ? 'var(--gold)' : (isO ? 'var(--slate)' : 'var(--line)');

      const shownTime = dayHeading && timestampDayPart(item.timestamp) === dayHeading ? timestampClockPart(item.timestamp) : item.timestamp;
      const time = shownTime && shownTime !== "日時不明" ? `<span class="text-[8px] text-[var(--ink-muted)] bg-[var(--line-soft)] px-1 rounded-[var(--radius-sm)] font-semibold">${escapeHtml(shownTime)}</span>` : '';
      const fieldDef = item.fieldLabel ? FIELD_LABELS.find(f => f.key === item.fieldLabel) : null;
      const fieldTag = fieldDef ? `<span class="text-[8px] px-1 rounded-[var(--radius-sm)] font-bold" style="background:${fieldDef.bg};color:${fieldDef.color};">${escapeHtml(fieldDef.label)}</span>` : '';
      const evidenceTag = isEvidence ? `<span class="asc-ev-tag" title="自分のアセスメントの根拠にしたカード"><i class="fa-solid fa-link"></i>根拠</span>` : '';
      const aiTag = item.aiSuggested ? `<span class="text-[8px] px-1 rounded-[var(--radius-sm)] font-bold" style="background:var(--brick-soft);color:var(--brick);"><i class="fa-solid fa-wand-magic-sparkles mr-0.5"></i>AI推定</span>` : '';

      const COL_COLORS = { unclassified: 'var(--ink-muted)', preadmission: 'var(--slate)', postadmission: 'var(--accent)', missing: 'var(--brick)' };
      const colBtn = (col, label) => {
        const c = COL_COLORS[col];
        const active = currentCol === col;
        return `<button onclick="setAssessmentCol(${jsArg(item.id)}, ${hId}, '${col}')" class="px-1 py-0.5 rounded-[var(--radius-sm)] text-[8px] font-bold border-2 transition" style="${active ? `background:${c};border-color:${c};color:var(--on-fill);` : `border-color:${c};color:${c};background:var(--surface);`}">${label}</button>`;
      };

      return `
        <div id="asc_${escapeHtml(item.id)}_${hId}" draggable="true"
          ondragstart="handleAssessmentDragStart(event, ${jsArg(item.id)})"
          ondragend="handleAssessmentDragEnd(event)"
          ondragover="event.preventDefault(); event.stopPropagation();"
          ondragenter="event.preventDefault(); event.currentTarget.classList.add('drag-over');"
          ondragleave="event.currentTarget.classList.remove('drag-over');"
          ondrop="handleAssessmentCardDrop(event, ${jsArg(item.id)}, ${hId})"
          class="asc-card px-1.5 py-1 rounded-[var(--radius-sm)] border ${item.aiSuggested ? 'border-dashed' : ''} border-[var(--line)] text-[10.5px] cursor-grab active:cursor-grabbing hover:border-[var(--accent)] transition" style="background:${cardBg};border-left-width:3px;border-left-color:${accentColor};">
          <div class="leading-snug break-words text-[var(--ink)]"><span class="inline-flex items-center gap-0.5 mr-1 align-[1px]">${badge}${evidenceTag}${familyMark}${aiTag}${fieldTag}${time}${drugChipHtml(item)}</span>${cardTextWithLabFlagsHtml(item)}</div>
          ${isMissingCol && typeof missingCheckCardHtml === 'function' ? `<div class="mc-in-card">${missingCheckCardHtml(getCurrentPatient(), item)}</div>` : ''}
          <div class="asc-actions">
            <button onclick="moveAssessmentCard(${jsArg(item.id)}, ${hId}, 'up')" ${isFirst ? 'disabled' : ''} class="icon-btn" title="この欄の中で1つ上へ移動" style="${isFirst ? 'opacity:.3;cursor:not-allowed;' : ''}"><i class="fa-solid fa-chevron-up text-[9px]"></i></button>
            <button onclick="moveAssessmentCard(${jsArg(item.id)}, ${hId}, 'down')" ${isLast ? 'disabled' : ''} class="icon-btn" title="この欄の中で1つ下へ移動" style="${isLast ? 'opacity:.3;cursor:not-allowed;' : ''}"><i class="fa-solid fa-chevron-down text-[9px]"></i></button>
            <button onclick="editItemText(${jsArg(item.id)})" class="icon-btn" title="内容を編集"><i class="fa-solid fa-pen text-[9px]"></i></button>
            <button onclick="setItemType(${jsArg(item.id)}, 'unnecessary')" class="icon-btn danger" title="不要判定"><i class="fa-solid fa-ban text-[9px]"></i></button>
            ${!isMissingCol && typeof toggleMyEvidence === 'function' ? `<button onclick="toggleMyEvidence(${hId}, ${jsArg(item.id)})" class="icon-btn${isEvidence ? ' active' : ''}" title="${isEvidence ? '自分のアセスメントの根拠から外す' : '自分のアセスメントの根拠にする'}"><i class="fa-solid fa-link${isEvidence ? '-slash' : ''} text-[9px]"></i></button>` : ''}
            <span class="asc-actions-sep"></span>
            ${colBtn('unclassified', '未')}${colBtn('preadmission', '前')}${colBtn('postadmission', '後')}${colBtn('missing', '欠')}
          </div>
        </div>
      `;
    }

    window.moveAssessmentCard = function(itemId, hId, direction) {
      const cp = getCurrentPatient();
      const activeItems = cp.items.filter(i => i.type !== 'unnecessary');
      const matching = activeItems.filter(i => i.hendersonIds?.includes(hId));
      const item = matching.find(i => i.id === itemId);
      if (!item) return;
      const col = item.assessmentCols?.[hId] || 'unclassified';

      const colList = matching.filter(i => (i.assessmentCols?.[hId] || 'unclassified') === col);
      const group = groupItemsByDay(colList).find(g => g.items.some(i => i.id === itemId)).items;
      const idx = group.findIndex(i => i.id === itemId);
      const neighborIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (neighborIdx < 0 || neighborIdx >= group.length) return;
      const neighbor = group[neighborIdx];

      const draggedIdx = cp.items.findIndex(i => i.id === itemId);
      const [draggedItem] = cp.items.splice(draggedIdx, 1);
      const neighborNewIdx = cp.items.findIndex(i => i.id === neighbor.id);
      const insertAt = direction === 'up' ? neighborNewIdx : neighborNewIdx + 1;
      cp.items.splice(insertAt, 0, draggedItem);
      saveDataAndSync();
    };

    window.handleAssessmentDragStart = (e, id) => { e.dataTransfer.setData('text/plain', 'asc_' + id); e.currentTarget.classList.add('card-dragging'); };
    window.handleAssessmentDragEnd = e => {
      e.currentTarget.classList.remove('card-dragging');

      document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    };
    window.handleAssessmentDrop = (e, hId, targetCol) => {
      e.preventDefault();
      const dragData = e.dataTransfer.getData('text/plain');
      if (dragData?.startsWith('asc_')) setAssessmentCol(dragData.replace('asc_', ''), hId, targetCol);
    };

    window.handleAssessmentCardDrop = (e, targetItemId, hId) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.classList.remove('drag-over');
      const dragData = e.dataTransfer.getData('text/plain');
      if (!dragData?.startsWith('asc_')) return;
      const draggedId = dragData.replace('asc_', '');
      if (draggedId === targetItemId) return;
      const cp = getCurrentPatient();
      const draggedIdx = cp.items.findIndex(i => i.id === draggedId);
      const targetItem = cp.items.find(i => i.id === targetItemId);
      if (draggedIdx === -1 || !targetItem) return;
      const targetCol = targetItem.assessmentCols?.[hId] || 'unclassified';
      const [draggedItem] = cp.items.splice(draggedIdx, 1);
      const prevCol = draggedItem.assessmentCols?.[hId] || 'unclassified';
      (draggedItem.assessmentCols = draggedItem.assessmentCols || {})[hId] = targetCol;

      if (prevCol !== targetCol) touchItem(draggedItem);
      const newTargetIdx = cp.items.findIndex(i => i.id === targetItemId);
      cp.items.splice(newTargetIdx, 0, draggedItem);
      saveDataAndSync();
      if (prevCol !== targetCol) {
        const dict = globalAppData.learningUserDict[draggedItem.text] = globalAppData.learningUserDict[draggedItem.text] || {};
        (dict.preferredCols = dict.preferredCols || {})[hId] = targetCol;
        reportLearningEvent(draggedItem.text, 'col', { hendersonId: hId, col: targetCol });
      }
    };

    window.setAssessmentCol = function(id, hId, colName) {
      const item = getCurrentPatient().items.find(i => i.id === id);
      if (item) {
        (item.assessmentCols = item.assessmentCols || {})[hId] = colName;
        touchItem(item);
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
        getCurrentPatient().items.push({ id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6), text, timestamp: "追記", type: 'o', hendersonIds: [hId], assessmentCols: { [hId]: 'missing' }, _touchedAt: new Date().toISOString() });
        saveDataAndSync(); closeMissingModal();
      }
    };
