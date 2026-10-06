    // 看護アセスメント支援システム：09-board.js（全10ファイルのうち 9 番目）
    // 分類ボード：元の文章の該当箇所の表示、カードの表示・選択・一括操作・統合・報告。
    // index.html の <script> で 01〜10 の順に読み込み、1つのプログラムとして動きます
    // （順番を入れ替えないでください。以前の app.js を内容ごとに分けたものです）。

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['09'] = '2026-10-06.1'; // 版（scripts/stamp-version.js が書き込む）
    // ==========================================================================
    // 情報カード → 元の文章（カルテ・看護記録入力欄）の該当箇所を探す
    // ------------------------------------------------------------------------
    // 利用者からの要望：「情報カードをクリックすると元文章のどこにあったのかわかるように、
    // 文章の単語にマーカーをつけてわかるようにして」。
    // カードの文章は抽出時に書き換わっている（見出しラベルの除去、「疼痛: 」等の章タイトルの前置き、
    // 表の項目名・値・基準値の結合、単位や「(基準値: …)」の補足、改行の結合、NFKC正規化等）ため、
    // 元の文章をそのまま文字列検索しても見つからないことが多い。そこで次の手順で探す：
    //   ①空白・改行を無視し、全角/半角・大文字/小文字をそろえた「正規化した文字列」同士で比べる
    //     （正規化後の各文字が元の文章の何文字目に当たるかを記録し、最後に元の位置へ戻す）。
    //   ②カード全体がそのまま見つかればそこを示す（多くの文章カードはこれで見つかる）。
    //   ③見つからなければ、カードを句読点・括弧等で区切った語句（語句ごと見つからなければさらに
    //     数字／英字／日本語の塊）に分け、最も出現回数の少ない（＝場所を特定しやすい）語句を
    //     手がかりに、その周辺に他の語句が最も多く集まっている場所を選び、そこにある語句に印を付ける。
    // 見つからない語句（アプリが補った「基準値」や単位等）は単に無視する。
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
          starts.push(i);
          ends.push(i + ch.length);
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
    function findSourceHighlightRanges(source, cardText) {
      if (!source || !cardText) return [];
      const index = buildSourceMatchIndex(source);
      const norm = index.norm;
      // アプリが後から補った「(基準値: 4,000〜9,000 /μL)」は元の文章に無いことが多いため比較から外す
      // （表から読み取った基準値の場合は、下の語句単位の探索で改めて見つかる）。
      const cardWithoutRef = cardText.replace(/\s*[（(]基準値[:：][^)）]*[)）]\s*/g, ' ');
      const toRanges = (spans) => {
        const sorted = spans.slice().sort((a, b) => a[0] - b[0]);
        const merged = [];
        sorted.forEach(([s, e]) => {
          const last = merged[merged.length - 1];
          // 正規化後の位置で2文字以内の隙間（区切りの記号・括弧等）は1つの印にまとめて読みやすくする
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

      // 語句に分ける。語句ごと見つからないもの（例：単位を補った「10,200/μl」）は、
      // 数字・英字・日本語の塊に分けて改めて探す。
      // 「,」は「10,200」のような数値の桁区切りに使われるため、語句の区切りにはしない。
      // 「dl」「mg」「μl」等の単位だけの塊は、表のどの行にも現れるため手がかりにならず、
      // かえって隣の行の単位に印を付けてしまうので使わない（単位は語句ごと見つかった場合のみ含まれる）。
      const UNIT_ONLY_TOKENS = new Set(['dl', 'ml', 'mg', 'μl', 'μg', 'kg', 'cm', 'mm', 'mmhg', 'kcal', 'ul']);
      const units = [];
      // 数値＋単位の語句（例「10.8g」）と、そこから取り出した数値だけの代わりの候補（例「10.8」）の対応。
      // 両方が見つかった場合は、どちらか手がかりに近い方だけに印を付ける（同じ値に2か所の印を付けない）。
      const numberFallbackOf = new Map();
      normalizeForSourceMatch(cardWithoutRef)
        .split(/[\s、。，:：;；()（）「」『』\[\]【】<>＜＞・\/]+/)
        .filter(Boolean)
        .forEach(phrase => {
          if (phrase === '基準値' || UNIT_ONLY_TOKENS.has(phrase)) return;
          if (phrase.length >= 2 && norm.includes(phrase)) {
            units.push(phrase);
            // 「10.8g」のように数値＋単位の語句は、語句ごとでは別の場所（例：手術中の記録）にしか無く、
            // 本来の箇所（表のセル）では単位が省略されていることがあるため、数値だけでも探しておく。
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

      // 手がかり（アンカー）：出現回数が最も少なく、同数なら最も長い語句。
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

    // 入力欄（textarea）の中の文字には色を付けられないため、印を表示している間だけ、同じ文章を
    // 読み取り専用の表示（#source-highlight-view）に切り替え、該当箇所を<mark>で囲んで見せる。
    // 表示をクリックするか「編集に戻る」を押すと、該当箇所にカーソルを置いた状態で入力欄に戻る。
    // varにしているのは、患者切り替え処理（loadPatient付近）がこの行より前の起動時点でも
    // 参照するため（letだと宣言前の参照がエラーになる）。
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
      // 入力欄と同じ高さで表示する（別のカードの印に切り替える時は入力欄が既に隠れているため、今の高さを保つ）
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
      // 最初の印が見える位置まで表示の中だけをスクロールする（ページ全体は動かさない）。
      const firstMark = view.querySelector('mark.src-hl');
      if (firstMark) view.scrollTop = Math.max(0, firstMark.offsetTop - view.clientHeight / 3);
      // 画面幅が狭く入力欄がカードの一覧より上にある場合など、入力欄が画面外にあれば見える位置まで移動する。
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

    // 自動分類の確信度バッジ（学習結果が完全一致していない/割れている場合に、要確認であることを可視化する）
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

    // 【薬の印】カードの文章に薬の名前（一般名・商品名）があれば「薬」の印を付け、押すと薬の情報を出す（js/14）
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
      // カードクリックで選択（数字キーでのタグ追加対象にする）。既に他のカードを選択中でも、
      // 別のカードをクリックするだけで選択が消えてしまわないよう、常に「そのカード自身の
      // 選択/解除だけ」を切り替える（他のカードの選択状態はそのまま保つ）。
      // ボタン・セレクト等の操作要素の上でのクリックは選択に影響させない
      // （左上のチェックボックスもinput要素なのでここで除外され、setCardSelectedだけで処理される）。
      // まとめて選択を解除したいときは、一括操作バーの「選択解除」ボタンか、Escapeキーを使う。
      card.addEventListener('click', e => {
        if (e.target.closest('button, select, a, input')) return;
        toggleCardSelection(item.id);
        // 選択したカードが元の文章のどこにあったかを、入力欄に印を付けて示す（showSourceHighlight参照）。
        // 選択を外したら（そのカードの印を表示中なら）印も消して入力欄に戻す。
        if (selectedCardIds.has(item.id)) showSourceHighlight(item);
        else if (highlightedSourceItemId === item.id) clearSourceHighlight(false);
      });

      const tagsHtml = (item.hendersonIds || []).map(hId => {
        const need = HENDERSON_NEEDS.find(n => n.id === hId);
        return need ? `<span class="tag-chip">${need.name} <button onclick="removeHendersonTag(${jsArg(item.id)}, ${need.id})" class="text-[var(--accent)]/60 hover:text-[var(--brick)] transition"><i class="fa-solid fa-times"></i></button></span>` : '';
      }).join('');
      const untaggedWarningHtml = isUntagged ? `<span class="field-chip" style="background:var(--brick);color:var(--on-fill);cursor:help;" title="${escapeHtml(untaggedReasonOf(item))}"><i class="fa-solid fa-triangle-exclamation mr-0.5"></i>タグ未設定 <i class="fa-regular fa-circle-question ml-0.5"></i></span>` : '';
      // 「患者背景」という区分は廃止したため（renderSoBoardの説明を参照）、カード上にも表示しない。
      // ただし14項目に直接の項目が無い情報（生殖など）は「基本情報（14項目外）」として示す（isOtherBasicInfoItem参照）
      // 家族の発言（「妻「…」」など）は印を付けて本人の発言と見分けられるようにする（isFamilySpeech）
      const familyChipHtml = isFamilySpeech(item.text) ? '<span class="field-chip" style="background:var(--gold-soft);color:var(--gold);" title="家族の発言です（本人の発言ではありません）"><i class="fa-solid fa-people-roof mr-0.5"></i>家族</span>' : '';
      const patientBackgroundHtml = familyChipHtml + (isOtherBasicInfoItem(item) ? `<span class="field-chip" style="background:var(--slate-soft);color:var(--slate);cursor:help;" title="ヘンダーソンの14項目に直接の項目が無い基本情報です（タグ未設定の警告にはしません）。どの項目に入れるか決めたい場合は、学習データ管理の「追加キーワード」で登録するか、下の「＋タグ追加」で選べます。"><i class="fa-solid fa-id-card mr-0.5"></i>基本情報（14項目外）</span>` : '');

      const fieldDef = item.fieldLabel ? FIELD_LABELS.find(f => f.key === item.fieldLabel) : null;
      const fieldChipHtml = fieldDef ? `<span class="field-chip" style="background:${fieldDef.bg};color:${fieldDef.color};"><i class="fa-solid ${fieldDef.icon} mr-0.5"></i>${escapeHtml(fieldDef.label)}</span>` : '';
      const timeChipHtml = item.timestamp && item.timestamp !== "日時不明" ? `<span class="time-chip"><i class="fa-regular fa-clock mr-0.5"></i>${escapeHtml(item.timestamp)}</span>` : '';
      const confidenceBadgeHtml = confidenceBadgeFor(item.predictionSource);
      // 発言と観察を分けた同じ場面のもう1枚（押すとそのカードへ移動して光らせる）
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
    // カードの「︙」メニュー（利用者からの要望：カードは本文・日時・タグを中心に表示し、編集・報告などはメニューにまとめる）
    // 1つのメニューを使い回し、押したボタンのそばに出す。↑↓で移動、Enterで実行、Escか外側を押すと閉じる。
    // ==========================================================================
    let cardMenuEl = null;
    let cardMenuReturnFocus = null;
    function closeCardMenu() {
      if (!cardMenuEl || cardMenuEl.classList.contains('hidden')) return;
      cardMenuEl.classList.add('hidden');
      // メニューの操作でボードを描き直した後は、元のボタンが消えているので、同じカードの︙ボタンへ戻す
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
          // キーボードで操作しているとき、移したカードの︙ボタンへフォーカスを移す（続けて操作できるように）
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
    // 分類ボード：カード選択・数字キーでのタグ追加・複数選択一括操作
    // ==========================================================================
    let selectedCardIds = new Set();
    let boardSearchTerm = '';

    // 常にそのカード自身の選択/非選択だけを切り替える（他のカードの選択状態には影響しない）。
    // 以前は修飾キー無しのクリックだと選択中の他のカードが巻き添えで全解除されてしまい、
    // 複数選択した状態で別のカードを押すたびに選択がリセットされる不具合の原因になっていた。
    // 選択をまとめて解除したい場合はclearSelection()（一括操作バーの「選択解除」ボタン/Escapeキー）を使う。
    function toggleCardSelection(id) {
      if (selectedCardIds.has(id)) selectedCardIds.delete(id); else selectedCardIds.add(id);
      renderSoBoard();
    }
    window.clearSelection = function() { selectedCardIds.clear(); clearSourceHighlight(false); renderSoBoard(); };

    // カード左上のチェックボックスによる選択（PC以外の環境でもタップだけで複数選択できるようにするため）。
    // Ctrl/Cmd/Shiftキーが無いスマートフォン・タブレットでも、このチェックボックスなら
    // 他のカードの選択状態を保ったまま追加/解除できる。
    window.setCardSelected = function(id, selected) {
      if (selected) selectedCardIds.add(id); else selectedCardIds.delete(id);
      renderSoBoard();
    };

    function renderBulkActionBar() {
      const bar = document.getElementById('bulk-action-bar');
      if (!bar) return;
      if (selectedCardIds.size === 0) { bar.classList.add('hidden'); return; }
      bar.classList.remove('hidden');
      document.getElementById('bulk-action-count').textContent = `${selectedCardIds.size}件選択中`;
      // 統合は2件以上選んでいる時だけ実行できる（1件以下では押せないよう見た目も含めて無効化する）
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
      // 他の一括操作（bulkSetTypeなど）と同様、操作完了後は選択を解除する。
      // ここで解除しないと、タグ追加後も一括操作バーが開いたままになってしまう。
      selectedCardIds.clear();
      saveDataAndSync();
      showToast(`${count}件に「${HENDERSON_NEEDS.find(n => n.id === hId)?.name.replace(/^\d+\.\s*/, '')}」タグを追加しました`, 'success');
    };

    // 分類ボード内のカード検索（本文・時刻・付与済みタグ名で絞り込み）
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

    // タグ選択肢を一括操作バーに反映（ヘンダーソン14項目は固定なので起動時に一度だけ）
    const bulkTagSelect = document.getElementById('bulk-tag-select');
    if (bulkTagSelect) HENDERSON_NEEDS.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n.id;
      opt.textContent = n.name;
      bulkTagSelect.appendChild(opt);
    });

    // カードを1件だけ選択している状態で数字キーを押すと、その数字をヘンダーソン番号としてタグ付けする
    // （0.5秒以内に2桁目が来れば10〜14として扱う。入力欄にフォーカスがある間や、分類ボード非表示時は無効）
    let keyBuffer = '';
    let keyBufferTimeout = null;
    document.addEventListener('keydown', e => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT' || document.activeElement?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return; // Ctrl+1 などのブラウザの操作・日本語入力中は奪わない
      if (!DOM.viewSoBoard || DOM.viewSoBoard.classList.contains('hidden')) return;
      // 画面（ダイアログ）を開いている間は働かない。【レビューで発見】以前は Esc だけは通していたため、確認のダイアログ等を
      // 開いたまま Esc を押すと、画面は閉じずに後ろのカードの選択だけが消えていた（Esc で画面を閉じるのは js/05 がまとめて行う）
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
    // 複数カードの統合（選択した2件以上のカードの本文を1枚にまとめる）
    // ------------------------------------------------------------------------
    // 統合後のカードは通常のカードと同じように扱われ、統合という操作自体も他の編集
    // （分類・タグ付け）と同じく共有学習に記録する。統合元それぞれが持っていた学習結果
    // （票）は合算して統合後の文章の学習結果に引き継ぎ、さらにここで選んだ分類・タグにも
    // 1票加える（＝ユーザーが確定させた内容を優先して次回以降の自動分類に使うため）。
    // 統合元の文章自体の学習結果は、他のカードで同じ文章がそのまま使われる可能性を
    // 考慮して消さずに残す。
    // ==========================================================================
    let mergeSourceItems = [];

    function joinTextsForMerge(items) {
      return items.map(i => (i.text || '').trim()).filter(Boolean).join('。');
    }

    // 統合元それぞれのtypeVotes/hendersonVotes/preferredColsを合算する（サーバー側の'merge'処理と同じロジック）
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

      // 分類の初期値：「不要」以外の中で最も多い分類（同数ならO）。すべて「不要」だった場合もOを初期値にする。
      const typeCounts = {};
      mergeSourceItems.forEach(i => { if (i.type !== 'unnecessary') typeCounts[i.type] = (typeCounts[i.type] || 0) + 1; });
      const defaultType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'o';
      document.querySelectorAll('input[name="merge-type"]').forEach(r => { r.checked = r.value === defaultType; });

      // タグの初期値：選択したカードのヘンダーソンタグの和集合をチェック済みにする
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

      // 欄(未分類/入院前/入院後/不足情報)は、統合前にそのタグを持っていたカードの割り当てを踏襲する
      const finalCols = {};
      finalHendersonIds.forEach(hId => {
        const src = mergeSourceItems.find(i => i.assessmentCols && i.assessmentCols[hId]);
        finalCols[hId] = src ? src.assessmentCols[hId] : 'unclassified';
      });

      // 見出しラベル・時刻は、統合元が全て同じ場合のみ引き継ぐ（バラバラなら統合後は空にする）
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

      // 学習内容の引き継ぎ：統合元それぞれの学習結果(票)を合算し、さらに今回選んだ分類・タグにも票を1つ加える。
      // タグ・欄については、統合後に実際に選ばれたタグだけに絞り込む（統合の際にあえて外したタグの
      // 残り票をそのまま持ち越すと、次回このまったく同じ文章が出てきたときに復活してしまうため）。
      // 統合元自体の学習内容（typeVotes/hendersonVotes）はここでは変更せず、そのまま残す。
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

      // 統合元カードを削除し、統合後の1枚を元の並び位置に挿入する
      const removedItems = cp.items.filter(i => sourceIds.has(i.id));
      cp.items = cp.items.filter(i => !sourceIds.has(i.id));
      sourceIds.forEach(sid => markItemDeleted(cp, sid)); // 統合元は消費されて無くなるカードとして記録する
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
        markItemDeleted(p, mergedItem.id); // 統合後の1枚は取り消しにより消えるカードとして記録する
        const idx = Math.min(clampedIndex, p.items.length);
        removedItems.forEach(i => { touchItem(i); unmarkItemDeleted(p, i.id); }); // 統合元は復元された扱いにする
        p.items.splice(idx, 0, ...removedItems);
      }, { patientId: patId }); // 【レビューで発見】別の患者に切り替えてから押しても、その患者を共有先へ送り直す（showUndoToast）
    });

    // ==========================================================================
    // 情報カードの不具合報告：カード右上の旗アイコンから、「この内容の書き込みが変だ」という
    // 内容をサイト側（card-reports.json）へ送る。同じブラウザタブから送った複数件は、
    // サーバー側でcardReportSessionIdをキーに1人分の投稿としてまとめて記録される。
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
        console.warn('情報カードの報告送信に失敗しました:', e);
        showToast(['報告を送れませんでした（共有先のサーバーにつながりません）', { text: 'サーバーが動いているか確かめてから、もう一度送ってください。', detail: true }], 'error');
      }
    });

    window.editItemText = async function(id) {
      const item = getCurrentPatient().items.find(i => i.id === id);
      if (!item) return;
      const oldText = item.text;
      const newText = await openDialog({ title: 'カードの内容を編集', inputValue: item.text, confirmLabel: '更新する' });
      // 【レビューで発見】以前は代入を条件の中で行っていたため、空（や「。」だけ）で確定すると、元の文章が
      // 消えたまま保存もされず残っていた。空になるときは何も変えずに知らせる（消したいときは「消去」を使う）。
      if (newText === null) return;
      const cleaned = cleanExtractedPhrase(newText);
      if (!cleaned) { showToast('空の内容にはできません。カードを消すときは「消去」を使ってください', 'warn'); return; }
      item.text = cleaned;
      {
        touchItem(item);
        saveDataAndSync(); showToast('カード内容を更新しました', 'success');
        if (item.text !== oldText) {
          logItemEdit(item, { kind: 'text', from: oldText, to: item.text });
          saveDataAndSync();
          // 編集前→編集後の書き換えを、そのまま事例ログ・共有学習に記録する
          reportLearningEvent(oldText, 'edit', { newText: item.text });
        }
      }
    };

    // ==========================================================================
    // タグ未設定カードへの一括再提案（現在のルールで再度タグを算出し直す）＋
    // 検査値カードへの基準値の再反映
    // ------------------------------------------------------------------------
    // suggestHendersonTagsForTextの説明の通り、ルール改善は既存カードに自動反映されない。
    // 同様に、formatLabValueString（LAB_STANDARDS）に検査項目を追加・修正しても、既に
    // 抽出済みのカードのテキストには自動で基準値が反映されない（利用者からの報告：
    // 「RBC(赤血球数)」「Ht(ヘマトクリット)」「AST (GOT)」のように項目名の直後に
    // 日本語・英語の補足説明が挟まっている検査値カードに基準値が付いていなかった。
    // LAB_STANDARDS自体には既に該当する基準値が登録済みで、項目名の直後の補足説明で
    // 正規表現が一致できなかったのが原因だったため、formatLabValueString側を修正した
    // うえで、既存カードにも遡って反映できるようにする）。
    // このボタンは、今開いているカルテの中の「不要」判定でないカードすべてを対象に、
    // ①現在のformatLabValueStringで基準値を再計算し、変化があれば反映する
    // ②S/O未分類（type === 'unclassified'）のまま残っているカードを、現在の
    // predictLocalItemTypeの既定ルール（患者本人の発言・訴えの手がかりが無ければ
    // "unclassified"ではなく既定で"o"とする、見出しラベル・不要判定を優先する等）で
    // 再分類する。過去に作成されたカードは、当時のロジックの既定値バグ（"unclassified"
    // がフォールバックになっていた）やタグ未設定と同根のスタブ学習データ誤判定により、
    // このボタンをクリックするだけでは今まで直らなかった（typeそのものは元々このボタンの
    // 対象外だったため）。このため、今回のロジック修正を既存カードにも反映できるよう、
    // ここでtypeの再判定を追加する。
    // ③「タグ未設定」（hendersonIdsが空）のカードだけ、現在のルール（学習結果→
    // キーワード検出→検査値ヒント→見出しラベルヒントの順）で再度タグを算出し、
    // 見つかった分だけ反映する。誤って提案されたタグは、他のタグ付けと同様に
    // カード上から個別に削除できる。
    window.reapplyTagRulesToUntagged = function() {
      const cp = getCurrentPatient();
      let fixedTagCount = 0;
      let fixedRefCount = 0;
      let fixedTypeCount = 0;
      let fixedBackgroundCount = 0;
      let fixedAssessmentColCount = 0;
      // 総合アセスメント表の「入院前／入院後」の判定は、カルテ全体を通した記録の並び順
      // （cp.items自体の並び順）に沿って「今どちらの時期を記憶しているか」を1つの変数で
      // 追跡し直す（groupClinicalPhrasesWithTimestampsの抽出時と同じアルゴリズム。
      // detectAdmissionPhaseSignalの説明を参照）。個々のカードに「入院前／入院後」という
      // タグを新しく付けたり表示したりするのではなく、この状態を使って総合アセスメント表側の
      // 「未分類」欄をできる範囲で分類するためだけに使う（利用者からの要望：全カードを
      // 入院前／入院後に変えるのではなく、総合アセスメント表のページで分類できるように
      // してほしい、との趣旨）。
      // 「実習1日目」等の見出し行は「不要」判定（isUnnecessaryBoilerplate）になっているため、
      // 後ろの「不要」カード除外よりも前で判定・更新しないと、その後に続くカードの時期が
      // いつまでも「入院前」のまま切り替わらなくなってしまう。このため、この判定だけは
      // 「不要」カードも含めて全カードに対して行う（記憶の更新自体は「不要」カードにも必要）。
      let admissionPhase = 'preadmission';
      cp.items.forEach(item => {
        const phaseSignal = detectAdmissionPhaseSignal(item.timestamp) || detectAdmissionPhaseSignal(item.text);
        if (phaseSignal) admissionPhase = phaseSignal;

        if (item.type === 'unnecessary') return; // 「不要」判定済みのカードは対象外

        // ①検査値カードの基準値を、現在のLAB_STANDARDSの内容で反映し直す
        // （基準値が既に付いているカードはformatLabValueString内でそのまま返されるため
        // 何も変わらない。タグの有無は問わない）。
        const reformatted = formatLabValueString(item.text);
        if (reformatted !== item.text) {
          const oldText = item.text;
          item.text = reformatted;
          touchItem(item);
          fixedRefCount++;
          reportLearningEvent(oldText, 'edit', { newText: item.text });
        }

        const userLearned = globalAppData.learningUserDict[item.text];

        // ②S/O未分類のカードだけ、現在のpredictLocalItemTypeの既定ルールで再判定する。
        // タグの有無に関わらず対象とする（タグ未設定でなくてもtypeが未分類のままのカードはある）。
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
          // 総合アセスメント表で「未分類」欄のまま残っているタグを、今追跡している
          // 入院前／入院後の状態（inferAssessmentColumnの最終フォールバック）で分類できる
          // 場合は補う。学習結果（preferredCols）で既に欄が決まっている場合は上書きしない。
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

          // 既にタグがあるカードは対象外だが、過去に④の患者背景振り分けを受けた後に
          // 手動でタグが付けられた場合、患者背景の表示が残ったままになるため外す
          // （ヘンダーソンタグが1件でも付けば患者背景の受け皿は使わない、という原則を維持する）。
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
        // ④どのヘンダーソンタグにも一致しなかったカードは、「タグ未設定」の警告のまま残さず
        // 患者背景（基本情報／医学情報）の受け皿に振り分ける（classifyPatientBackgroundの説明を参照）。
        // 既に同じ判定が付いているカードは変更なしとみなし、件数に含めない。
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

    // 同じ文言への一括反映（このカルテ内の他のカードへの一括反映）
    // ------------------------------------------------------------------------
    // 同じ文言（本文が完全一致）のカードが同じカルテ内に複数ある場合、片方だけタグ・分類を
    // 修正して他のカードが古いままだと、学習結果（本来は同じ文言なら全カードで揃うはず）と
    // 実際の表示がバラバラになってしまう。タグ追加・削除・分類変更の直後に、同じ文言を持つ
    // 他のカードにも同じ修正を適用するか確認する（利用者からの要望：「分類の学習がしやすくなる
    // ようなアップデート案」として提示した案のうち採用されたものの1つ）。
    // 学習データ（learningUserDict）への投票は呼び出し元で既に1回分カウント済み（文言単位で
    // 共有されるため）なので、ここでは他のカードのフィールドをそのまま揃えるだけで、
    // 重複してカウントしない。
    // needsApply(item): まだその修正が反映されていないカードだけを対象にする（確認する数・
    // 適用対象を、既に同じ状態のカードを含めて過大に見せないため）。
    // 判定ロジック自体（findOtherCardsWithSameText）はダイアログ表示等のUIから独立させてあり、
    // 単体テスト（tests/bulk-apply-same-text.test.js）から直接検証できる。
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
        // 【レビューで発見】古いデータ・読み込んだデータで assessmentCols が無いカードだと、ここで止まり半端に変わっていた
        item.hendersonIds.push(hId); (item.assessmentCols = item.assessmentCols || {})[hId] = 'unclassified';
        logItemEdit(item, { kind: 'tagAdd', hId });
        // ヘンダーソンタグが手動で付けられたら、患者背景（基本情報／医学情報）の受け皿は
        // 使わない（「他のどのタグにも一致しなかった場合の最後の受け皿」という原則を維持する）。
        item.patientBackground = null;
        item.predictionSource = 'confirmed'; // 人が確認・編集したことを示し、自動分類バッジを消す
        // 「同じタグ付けが何回選ばれたか」を票として数え、票のあるタグ（0票超）を優先タグとして扱う
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

    // カード自身の「＋タグ追加」ドロップダウンから設定した場合専用の呼び出し口。数字キー
    // ショートカット（同じ1枚のカードに複数のタグを続けて素早く追加する用途があり、選択状態を
    // 保つ必要がある）は引き続きaddHendersonTagを直接呼ぶため、addHendersonTag自体には手を
    // 加えない。ドロップダウンでの操作は1回で完結する行為とみなし、追加後にそのカードの選択を
    // 解除する（deleteItemと同様の扱い。これが無いと、そのカード1枚だけを選んでいた場合に
    // 一括操作バーが開いたままになってしまう。複数選択中に他のカードも選んでいた場合、
    // そちらの選択は残る）。
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
        selectedCardIds.delete(id); // タグ追加時と同様、このカード自身の操作で選択を解除する
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
        // 実際には分類が変わっていない場合（例：ドラッグ＆ドロップで元と同じ列に戻した等）は
        // 何もしない。ここで学習させると「OからOに分類した」という実際には修正でも確認でもない
        // 操作まで票として数えてしまい、学習データを誤って汚染してしまうため。
        if (type === prevType) return;
        item.type = type;
        item.predictionSource = 'confirmed'; // 人が確認・編集したことを示し、自動分類バッジを消す
        logItemEdit(item, { kind: 'type', from: prevType, to: type });
        touchItem(item);
        if (type !== 'unnecessary') {
          // 「不要」判定は分類の学習には数えない（S/Oどちらでもない一時的な判断のため）。
          // 同じ文章に同じ分類（S/O等）が繰り返し選ばれた回数を票として数え、最多得票を優先分類にする。
          const learned = globalAppData.learningUserDict[item.text] = { ...globalAppData.learningUserDict[item.text] };
          learned.typeVotes = { ...(learned.typeVotes || {}) };
          learned.typeVotes[type] = (learned.typeVotes[type] || 0) + 1;
          learned.preferredType = pickTopVote(learned.typeVotes);
          saveDataAndSync();
          const voteCount = learned.typeVotes[type];
          showToast(`分類(${type})を学習しました${voteCount > 1 ? `（×${voteCount}）` : ''}`);
          reportLearningEvent(item.text, 'type', { type, from: prevType, voteCount }); // 全利用者で共有する学習データとして送信（研究用途のため本文も含む）
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
      markItemDeleted(cp, id); // 他端末との同時編集マージ時に、このカードが誤って復活しないようにする
      const patId = cp.id;
      selectedCardIds.delete(id);
      saveDataAndSync();
      showUndoToast('カードを削除しました', () => {
        const p = globalAppData.patients.find(x => x.id === patId);
        if (p) {
          touchItem(removed); // 「元に戻す」＝この端末が今このカードを復元したという印を残す
          unmarkItemDeleted(p, id);
          p.items.splice(Math.min(idx, p.items.length), 0, removed);
        }
      }, { patientId: patId });
    };

    window.clearUnnecessary = async function() {
      const cp = getCurrentPatient();
      const removed = cp.items.filter(i => i.type === 'unnecessary');
      if (removed.length === 0) return showToast('不要な情報はありません', 'info');
      // 消す前に、何枚消えるか・元に戻せる時間を明示する
      const ok = await openDialog({ title: `不要な情報を${removed.length}枚消去しますか？`, message: `「不必要な情報」にあるカード${removed.length}枚を、このカルテから消します。消した直後に出る「元に戻す」を押せば戻せます。`, confirmLabel: `${removed.length}枚を消去`, danger: true });
      if (ok !== true) return;
      cp.items = cp.items.filter(i => i.type !== 'unnecessary');
      removed.forEach(i => markItemDeleted(cp, i.id));
      const patId = cp.id;
      saveDataAndSync();
      showUndoToast(`不要な情報を${removed.length}件消去しました`, () => {
        const p = globalAppData.patients.find(x => x.id === patId);
        if (p) {
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
      const activeItems = cp.items.filter(i => i.type !== 'unnecessary');
      const selectedNeed = getSelectedAssessmentNeed();
      const frag = document.createDocumentFragment();
      // 「自分のアセスメント」（js/11）の入力欄で書いている途中なら、描き直した後もカーソルの位置を保つ。
      // js/11 は起動の処理（js/10）より後に読み込むので、読み込む前の最初の描画ではこの行を出さない（js/11 の最後で描き直す）。
      const ownAsm = typeof renderMyAssessmentRowHtml === 'function';
      const focusBefore = ownAsm ? captureMyAssessmentFocus() : null;
      let singleHtml = '';

      HENDERSON_NEEDS.forEach(need => {
        const matching = activeItems.filter(i => i.hendersonIds?.includes(need.id));

        // その欲求の行の中で、上から出てくる順にS/Oそれぞれ通し番号を振る（S-1, S-2 / O-1, O-2 ...）。
        // 「不足情報」欄はS/Oの区別を持たせないため、番号付けの対象からも除外する。
        // 番号は日の順番で上から付ける（assessmentSeqLabels。印刷・書き出しと同じ番号）
        const seqLabels = assessmentSeqLabels(matching, need.id);
        // 自分のアセスメントの根拠にしたカード（カードに「根拠」の印を付ける）
        const evidenceIds = ownAsm ? myEvidenceIdSet(cp, need.id) : new Set();

        // 同じ欄の中でのカードの並び順（上下移動ボタンの有効/無効の判定に使う。一番上/一番下のカードは
        // それぞれ上へ/下へのボタンを押せないようにする）
        // 【日ごとの区切り】「入院前」「入院後」の欄は、カードの日時の日の部分（手術当日・術後1日目…）が変わる
        // ところに小見出しを入れる（利用者からの指摘：患者36「入院後が1つの大きなくくりで、手術前・手術当日・
        // 術後1日目・術後2日目の変化を時系列で追えない」）。並び順は変えない（上下移動で入れ替えた順のまま）。
        const categorize = col => {
          const list = matching.filter(i => (i.assessmentCols?.[need.id] || 'unclassified') === col);
          // 上下移動は同じ日の中だけ（日をまたぐ並びは日の順番で決まるため）
          const posInDay = new Map();
          groupItemsByDay(list).forEach(g => g.items.forEach((i, k) => posInDay.set(i.id, { k, len: g.items.length })));
          return assessmentDayGroups(col, list).map(g => {
            const heading = g.day ? `<div class="asc-day-heading${g.background ? ' asc-bg-heading' : ''}"${g.background ? ' title="診断名・現病歴などの背景情報（観察・ケアの記録とは分けて表示）"' : ''}>${g.background ? '<i class="fa-solid fa-book-medical"></i> ' : ''}${escapeHtml(g.day)}</div>` : '';
            const cardHtml = i => {
              const pos = posInDay.get(i.id);
              return renderAssessmentCellCard(i, need.id, seqLabels[i.id], pos.k === 0, pos.k === pos.len - 1, g.day, evidenceIds.has(i.id));
            };
            // 同じ場面の発言（S）と観察（O）は、左にS・右にOを横に並べる（groupItemsByScene参照）
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

        // 1つの項目を選んでいるときは、表の行は作らず専用の並び（renderAssessmentSingleHtml）だけを作る（同じカードが2か所に出ないように）
        if (selectedNeed !== 'all') {
          if (Number(selectedNeed) === need.id) singleHtml = renderAssessmentSingleHtml(cp, need, matching, categorize);
          return;
        }
        const needLabel = need.name.replace(/^\d+\.\s*/, '');
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
          </td>
          <td class="border border-[var(--line)] p-1.5 align-top min-h-[60px]" ondragover="allowDrop(event)" ondrop="handleAssessmentDrop(event, ${need.id}, 'unclassified')"><div class="space-y-1.5">${categorize('unclassified')}</div></td>
          <td class="border border-[var(--line)] p-1.5 align-top bg-[var(--slate-soft)]/30 min-h-[60px]" ondragover="allowDrop(event)" ondrop="handleAssessmentDrop(event, ${need.id}, 'preadmission')"><div class="space-y-1.5">${categorize('preadmission')}</div></td>
          <td class="border border-[var(--line)] p-1.5 align-top bg-[var(--accent-soft)]/40 min-h-[60px]" ondragover="allowDrop(event)" ondrop="handleAssessmentDrop(event, ${need.id}, 'postadmission')"><div class="space-y-1.5">${categorize('postadmission')}</div></td>
          <td class="border border-[var(--line)] p-1.5 align-top bg-[var(--brick-soft)]/40 min-h-[60px]" ondragover="allowDrop(event)" ondrop="handleAssessmentDrop(event, ${need.id}, 'missing')">
            <div class="space-y-1.5">${categorize('missing')}</div>
            <button onclick="openMissingModal(${need.id})" class="mt-1.5 text-[10px] text-[var(--brick)] hover:text-[var(--ink)] font-medium flex items-center w-full justify-center p-1 border border-dashed border-[var(--brick-line)] rounded-[var(--radius-sm)]"><i class="fa-solid fa-plus mr-1"></i> 追加</button>
          </td>
        `;
        tr.dataset.needId = String(need.id);
        const hiddenRow = selectedNeed !== 'all' && Number(selectedNeed) !== need.id;
        if (hiddenRow) tr.classList.add('hidden');
        frag.appendChild(tr);

        // 自分のアセスメント（情報の解釈・考えられる原因・今後の見通し・根拠のカード）の行（「すべて」のとき）
        if (ownAsm && !hiddenRow && selectedNeed === 'all' && myAssessmentAlwaysShown()) {
          const own = document.createElement('tr');
          own.className = 'my-asm-row';
          own.dataset.needId = String(need.id);
          own.innerHTML = `<td colspan="5" class="my-asm-cell">${renderMyAssessmentRowHtml(cp, need, selectedNeed === 'all')}</td>`;
          frag.appendChild(own);
        }
      });
      document.getElementById('assessment-tbody').replaceChildren(frag);
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

    // 1つの項目を選んだときの画面：上に未分類、中央に入院前・入院後の2列、下に不足情報、その下に自分のアセスメント
    function renderAssessmentSingleHtml(cp, need, matching, categorize) {
      const count = col => matching.filter(i => (i.assessmentCols?.[need.id] || 'unclassified') === col).length;
      const nUnc = count('unclassified'), nPre = count('preadmission'), nPost = count('postadmission'), nMiss = count('missing');
      const missItems = matching.filter(i => (i.assessmentCols?.[need.id] || 'unclassified') === 'missing');
      const unchecked = typeof missingCheckStatus === 'function' ? missItems.filter(i => missingCheckStatus(cp, i.id) === 'unchecked').length : nMiss;
      const drop = col => `ondragover="allowDrop(event)" ondrop="handleAssessmentDrop(event, ${need.id}, '${col}')"`;
      const name = need.name.replace(/^\d+\.\s*/, '');
      // 既定では1行にたたんで出す（押すと開く）。「自分のアセスメント：表示中」のときは開いた形で出す（js/11）
      const own = typeof renderMyAssessmentRowHtml === 'function' ? `<div class="asm-own">${renderMyAssessmentRowHtml(cp, need, !myAssessmentAlwaysShown())}</div>` : '';
      return `<div class="asm-single-head"><span class="need-number asm-single-no">${need.id}</span><i class="fa-solid ${need.icon} text-[var(--accent)]"></i><b>${escapeHtml(name)}</b><span class="my-asm-muted">カード ${matching.length}枚</span></div>
        <section class="asm-aux asm-aux-unc${nUnc ? '' : ' is-empty'}" ${drop('unclassified')}>
          <div class="asm-aux-title"><span class="col-dot" style="background:var(--ink-muted)"></span>未分類 <b>${nUnc}</b><span class="my-asm-muted">${nUnc ? '入院前・入院後に振り分けてください（ドラッグ、またはカードの「前」「後」）' : '未分類のカードはありません'}</span></div>
          ${nUnc ? `<div class="asm-aux-body">${categorize('unclassified')}</div>` : ''}
        </section>
        <div class="asm-center">
          <section class="asm-col asm-col-pre" ${drop('preadmission')}><div class="asm-col-title">入院前 <b>${nPre}</b></div><div class="space-y-1.5">${categorize('preadmission') || '<p class="my-asm-muted">カードをここへドラッグできます</p>'}</div></section>
          <section class="asm-col asm-col-post" ${drop('postadmission')}><div class="asm-col-title">入院後 <b>${nPost}</b></div><div class="space-y-1.5">${categorize('postadmission') || '<p class="my-asm-muted">カードをここへドラッグできます</p>'}</div></section>
        </div>
        <section class="asm-aux asm-aux-miss" ${drop('missing')}>
          <div class="asm-aux-title"><i class="fa-solid fa-clipboard-question" style="color:var(--brick)"></i>不足情報 <b>${nMiss}</b>${nMiss ? `<span class="my-asm-muted">未確認 ${unchecked}</span>` : '<span class="my-asm-muted">まだありません</span>'}
            <button type="button" onclick="openMissingModal(${need.id})" class="asm-aux-add"><i class="fa-solid fa-plus"></i> 不足情報を追加</button></div>
          ${nMiss ? `<div class="asm-aux-body">${categorize('missing')}</div>` : ''}
        </section>
        ${own}`;
    }

    // 総合アセスメント表で表示している欲求（'all' か 1〜14）。このブラウザに覚えておく。
    const ASSESSMENT_NEED_KEY = 'nursing_assessment_need';
    function getSelectedAssessmentNeed() {
      let v = null;
      try { v = localStorage.getItem(ASSESSMENT_NEED_KEY); } catch (e) { /* 覚えていなければ既定 */ }
      if (v === 'all') return 'all';
      const n = Number(v);
      return n >= 1 && n <= 14 ? n : 1;
    }
    // 1〜14のボタン（カードの枚数つき。未分類の欄にカードがある欲求には印）と、前後の移動・すべて表示
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
        return `<button class="need-nav-btn${active ? ' active' : ''}${matching.length ? '' : ' empty'}" role="tab" aria-selected="${active}" onclick="selectAssessmentNeed(${need.id})" title="${escapeHtml(need.name)}（カード${matching.length}枚${unclassified ? `・未分類${unclassified}枚` : ''}）">
          <span class="need-nav-no">${need.id}</span><span class="need-nav-name">${escapeHtml(name)}</span><span class="need-nav-count">${matching.length}</span>${missingN ? `<span class="need-nav-miss" title="未確認の不足情報 ${missingN}件">欠${missingN}</span>` : ''}${unclassified ? '<span class="need-nav-dot" aria-label="未分類あり"></span>' : ''}
        </button>`;
      }).join('');
      const idx = selected === 'all' ? -1 : Number(selected);
      nav.innerHTML = `
        <button class="need-nav-step" onclick="stepAssessmentNeed(-1)" ${idx <= 1 ? 'disabled' : ''} title="前の欲求（←キー）"><i class="fa-solid fa-chevron-left"></i></button>
        <div class="need-nav-list">${btns}</div>
        <button class="need-nav-step" onclick="stepAssessmentNeed(1)" ${idx === -1 || idx >= 14 ? 'disabled' : ''} title="次の欲求（→キー）"><i class="fa-solid fa-chevron-right"></i></button>
        <button class="need-nav-all${selected === 'all' ? ' active' : ''}" onclick="selectAssessmentNeed('all')" title="14項目すべてを縦に並べて表示">すべて</button>`;
    }
    window.selectAssessmentNeed = function(id) {
      try { localStorage.setItem(ASSESSMENT_NEED_KEY, String(id)); } catch (e) { /* 覚えられなくても表示は切り替える */ }
      renderAssessmentTable();
      // 表の頭（ボタンの列）が画面の上に隠れていたら見える位置まで戻す
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
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const view = document.getElementById('view-assessment');
      if (!view || view.classList.contains('hidden')) return;
      if (typeof isCardOverviewOpen === 'function' && isCardOverviewOpen()) return;
      if (document.querySelector('.fixed.inset-0:not(.hidden)')) return; // ダイアログ等を開いているとき
      if (/^(?:INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '') || (e.target && e.target.isContentEditable)) return;
      e.preventDefault();
      stepAssessmentNeed(e.key === 'ArrowLeft' ? -1 : 1);
    });

    function renderAssessmentCellCard(item, hId, seqLabel, isFirst, isLast, dayHeading, isEvidence = false) {
      const currentCol = item.assessmentCols?.[hId] || 'unclassified';
      const isMissingCol = currentCol === 'missing';
      // 「不足情報」欄はS/Oの分類を必要としないため、この欄に置かれたカードにはS/Oのバッジ・色分けを付けない。
      const isS = item.type === 's' && !isMissingCol;
      const isO = item.type === 'o' && !isMissingCol;
      // Sは金、Oは藍と色分けし、通し番号(S-1/O-2等)を太字ラベルで表示。カード左端にも同色のバーを付けて色でも一目で判別できるようにする
      // バッジをクリックすると分類ボード側の該当カードへジャンプ・ハイライトする
      const badge = isS
        ? `<span onclick="jumpToBoardCard(${jsArg(item.id)})" class="px-1.5 py-[1px] rounded-[var(--radius-sm)] font-bold text-[9px] tracking-tight cursor-pointer" title="分類ボードの該当カードを表示" style="background:var(--gold);color:var(--on-fill);">${seqLabel || 'S'}</span>`
        : (isO
          ? `<span onclick="jumpToBoardCard(${jsArg(item.id)})" class="px-1.5 py-[1px] rounded-[var(--radius-sm)] font-bold text-[9px] tracking-tight cursor-pointer" title="分類ボードの該当カードを表示" style="background:var(--slate);color:var(--on-fill);">${seqLabel || 'O'}</span>`
          : '');
      const familyMark = isFamilySpeech(item.text) ? '<span class="text-[8px] font-bold px-1 rounded-[var(--radius-sm)]" style="background:var(--gold-soft);color:var(--gold);" title="家族の発言">家族</span>' : '';
      const cardBg = isS ? 'var(--gold-soft)' : (isO ? 'var(--slate-soft)' : 'var(--surface)');
      const accentColor = isS ? 'var(--gold)' : (isO ? 'var(--slate)' : 'var(--line)');
      // 日の小見出しの下では、日時は時刻だけを出す（「術後1日目」の見出しの下の「術後1日目 12:00」→「12:00」）
      const shownTime = dayHeading && timestampDayPart(item.timestamp) === dayHeading ? timestampClockPart(item.timestamp) : item.timestamp;
      const time = shownTime && shownTime !== "日時不明" ? `<span class="text-[8px] text-[var(--ink-muted)] bg-[var(--line-soft)] px-1 rounded-[var(--radius-sm)] font-semibold">${escapeHtml(shownTime)}</span>` : '';
      const fieldDef = item.fieldLabel ? FIELD_LABELS.find(f => f.key === item.fieldLabel) : null;
      const fieldTag = fieldDef ? `<span class="text-[8px] px-1 rounded-[var(--radius-sm)] font-bold" style="background:${fieldDef.bg};color:${fieldDef.color};">${escapeHtml(fieldDef.label)}</span>` : '';
      const evidenceTag = isEvidence ? `<span class="asc-ev-tag" title="自分のアセスメントの根拠にしたカード"><i class="fa-solid fa-link"></i>根拠</span>` : '';
      const aiTag = item.aiSuggested ? `<span class="text-[8px] px-1 rounded-[var(--radius-sm)] font-bold" style="background:var(--brick-soft);color:var(--brick);"><i class="fa-solid fa-wand-magic-sparkles mr-0.5"></i>AI推定</span>` : '';

      // 未・前・後・欠それぞれに専用色を持たせ、選択されていない時も枠線の色で見分けられるようにする
      const COL_COLORS = { unclassified: 'var(--ink-muted)', preadmission: 'var(--slate)', postadmission: 'var(--accent)', missing: 'var(--brick)' };
      const colBtn = (col, label) => {
        const c = COL_COLORS[col];
        const active = currentCol === col;
        return `<button onclick="setAssessmentCol(${jsArg(item.id)}, ${hId}, '${col}')" class="px-1 py-0.5 rounded-[var(--radius-sm)] text-[8px] font-bold border-2 transition" style="${active ? `background:${c};border-color:${c};color:var(--on-fill);` : `border-color:${c};color:${c};background:var(--surface);`}">${label}</button>`;
      };

      // 【UIの見直し】以前は、カードごとに本文の横に上下・編集・不要の4つのアイコン、下に未・前・後・欠の
      // 4つのボタンの段があり、本文の欄が狭く（数文字ごとに折り返し）カードの高さも倍になっていた。
      // 操作のボタンはまとめて1つの帯（asc-actions）にし、マウスを重ねたとき・キーボードで選んだときだけ
      // カードの右上に重ねて出す（タッチ操作の端末ではこれまで通り常に表示。style.css の .asc-actions）。
      // 印刷には出さない。
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

    // 総合アセスメント表：同じ欄（未分類/入院前/入院後/不足情報）の中でのカードの表示順を
    // ワンクリックで入れ替える（ドラッグ＆ドロップが難しいタッチ環境でも並べ替えしやすくするため）。
    // ドラッグ＆ドロップでの並べ替え（handleAssessmentCardDrop）と同じく、cp.items配列内の位置を
    // 直接入れ替えることで並び順を変える。欄をまたいでの移動はしない（同じ欄の中だけの移動）。
    window.moveAssessmentCard = function(itemId, hId, direction) {
      const cp = getCurrentPatient();
      const activeItems = cp.items.filter(i => i.type !== 'unnecessary');
      const matching = activeItems.filter(i => i.hendersonIds?.includes(hId));
      const item = matching.find(i => i.id === itemId);
      if (!item) return;
      const col = item.assessmentCols?.[hId] || 'unclassified';
      // 画面の並び（日の順番）の中で、同じ日のカードどうしだけを入れ替える
      const colList = matching.filter(i => (i.assessmentCols?.[hId] || 'unclassified') === col);
      const group = groupItemsByDay(colList).find(g => g.items.some(i => i.id === itemId)).items;
      const idx = group.findIndex(i => i.id === itemId);
      const neighborIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (neighborIdx < 0 || neighborIdx >= group.length) return; // 既に一番上/一番下なら何もしない
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
      // ドラッグ中にハイライトしたカードが残っていれば消しておく（drop先を通らずに終了した場合の保険）
      document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    };
    window.handleAssessmentDrop = (e, hId, targetCol) => {
      e.preventDefault();
      const dragData = e.dataTransfer.getData('text/plain');
      if (dragData?.startsWith('asc_')) setAssessmentCol(dragData.replace('asc_', ''), hId, targetCol);
    };
    // 総合アセスメント表内で、同じ欄・別の欄を問わずカードをカードの上にドロップした時の並べ替え。
    // ドロップ先カードの直前に移動させることで表示順を入れ替え、S-1/S-2やO-1/O-2の通し番号は
    // 再描画時（renderAssessmentTable）にその新しい並び順から自動的に振り直される。
    window.handleAssessmentCardDrop = (e, targetItemId, hId) => {
      e.preventDefault();
      e.stopPropagation(); // 親要素（欄セル）のondropで二重に処理されないようにする
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
      // 【レビューで発見】変更の時刻を付けないと、別の端末の古い保存で欄の移動が元に戻されることがあった
      if (prevCol !== targetCol) touchItem(draggedItem);
      const newTargetIdx = cp.items.findIndex(i => i.id === targetItemId);
      cp.items.splice(newTargetIdx, 0, draggedItem); // ドロップ先カードの直前に挿入し、その位置に応じてS-1/O-1等が振り直される
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
        touchItem(item); // 【レビューで発見】別の端末の古い保存で欄の移動が元に戻らないよう、変更の時刻を付ける
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
