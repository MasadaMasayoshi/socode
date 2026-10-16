// Japanese document exports. Preserve source/evidence distinctions and printable patient ownership.

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['06'] = 'v.98'; // Version stamp (scripts/stamp-version.js)
    // ==========================================================================

    // ------------------------------------------------------------------------

    function storedAiHtml(html) {
      if (!html) return '';
      return typeof sanitizeStoredHtml === 'function' ? sanitizeStoredHtml(html) : escapeHtml(String(html).replace(/<[^>]*>/g, ''));
    }
    function exportHtmlOrPlaceholder(htmlStr) {
      return htmlStr ? htmlStr : '<p style="color:#776F62;">（未実施）</p>';
    }
    function exportSectionTitle(title) {
      return `<h2 style="font-size:14px;font-weight:700;border-bottom:1.5px solid #262420;padding-bottom:4px;margin:20px 0 8px;">${escapeHtml(title)}</h2>`;
    }
    function exportList(htmlLines) {
      if (htmlLines.length === 0) return `<p style="color:#776F62;">（登録なし）</p>`;
      return `<ul style="margin:0 0 8px 22px;padding:0;">${htmlLines.map(t => `<li style="margin-bottom:4px;">${t}</li>`).join('')}</ul>`;
    }

    // ==========================================================================

    // ------------------------------------------------------------------------

    // ==========================================================================

    // ------------------------------------------------------------------------

    // ==========================================================================
    const PRINT_BASE_CSS = `
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; background: #fff; }
  body { font-family: "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", "Meiryo", "IBM Plex Sans JP", sans-serif; color: #1f1d1a; font-size: 9.5pt; line-height: 1.55; }
  @page { margin: 11mm 10mm 13mm; @bottom-center { content: counter(page) " / " counter(pages); font-size: 8pt; color: #8a8375; } }
  .doc-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12pt; border-bottom: 2pt solid #2c4a3e; padding-bottom: 4pt; margin-bottom: 6pt; }
  .doc-title { font-size: 15pt; font-weight: 700; margin: 0; letter-spacing: .02em; }
  .doc-meta { font-size: 8.3pt; color: #4a463f; text-align: right; line-height: 1.45; }
  .legend { font-size: 7.8pt; color: #6b665c; margin: 0 0 6pt; }
  h2 { font-size: 11pt; margin: 12pt 0 5pt; padding: 2pt 0 2pt 6pt; border-left: 3.5pt solid #2c4a3e; background: #f3f1ec; break-after: avoid; page-break-after: avoid; }
  h3 { font-size: 9.8pt; margin: 9pt 0 3pt; break-after: avoid; page-break-after: avoid; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th, td { border: .6pt solid #bdb6a8; padding: 2.5pt 4pt; vertical-align: top; text-align: left; }
  th { background: #efece5; font-size: 8.3pt; font-weight: 700; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  .lb { display: inline-block; min-width: 2.2em; text-align: center; font-weight: 700; font-size: 7.3pt; padding: 0 2.5pt; border-radius: 2pt; margin-right: 3pt; line-height: 1.55; vertical-align: 1pt; }
  .lb-s { background: #f4e8c8; color: #6a4d00; border: .5pt solid #c9a64a; }
  .lb-o { background: #dde7f1; color: #22405e; border: .5pt solid #7f9cbd; }
  .lb-x { background: #f6dfda; color: #8a2f1d; border: .5pt solid #d49a8c; }
  .tm { color: #6b665c; font-size: 7.6pt; margin-right: 3pt; white-space: nowrap; }
  .fl { color: #2c4a3e; font-size: 7.6pt; font-weight: 700; margin-right: 3pt; }
  .tags { color: #5d5a52; font-size: 7.6pt; }
  .muted, .empty { color: #a39c8e; }
  ul.cards { margin: 0; padding: 0; list-style: none; }
  ul.cards li { margin: 0; padding: 1.5pt 0 2pt; border-bottom: .4pt dotted #d8d2c5; break-inside: avoid; page-break-inside: avoid; }
  ul.cards li:last-child { border-bottom: none; }
  ul.cards li.scene { padding: 1pt 0; }
  table.so { width: 100%; border-collapse: collapse; margin: 0; }
  table.so td { width: 50%; vertical-align: top; border: .4pt solid #d8d2c5; padding: 1.5pt 3pt; font-size: inherit; }
  table.so td:first-child { background: #fbf6ea; }
  ul.cards li.day { font-weight: 700; font-size: 7.8pt; color: #22405e; background: #eef2f6; padding: 1pt 3pt; margin-top: 2pt; border-bottom: none; break-after: avoid; page-break-after: avoid; }
  ul.cards li.day.bg { color: #6b6457; background: #f5f3ee; border: 0.5pt dashed #bbb; }
  .ai { border: .6pt solid #d5cfc2; border-radius: 3pt; padding: 5pt 7pt; background: #fbfaf7; font-size: 9pt; }
  .ai-evidence-chip { color: #6b665c; font-size: .8em; white-space: nowrap; }
  .ai-text p { margin: 0 0 3pt; }
  .ai-text .ai-h { font-size: 9.6pt; font-weight: 700; margin: 6pt 0 2pt; padding-left: 4pt; border-left: 2.5pt solid #2c4a3e; break-after: avoid; page-break-after: avoid; }
  .ai-text .ai-list { margin: 1pt 0 3pt; padding-left: 14pt; }
  .ai-text .ai-list li { margin-bottom: 1.5pt; }
  .ai-text .ai-quote { margin: 3pt 0; padding: 3pt 6pt; border-left: 2pt solid #b9b2a3; background: #f6f4ef; }
  .ai-text .ai-key { border: .8pt solid #9dbbb0; background: #eef4f1; border-radius: 3pt; padding: 4pt 6pt; margin-bottom: 4pt; break-inside: avoid; }
  .ai-text .ai-key-title { font-weight: 700; color: #24473d; font-size: 8.6pt; }
  .ai-text .ai-key i { display: none; }
  .dx { margin: 0 0 5pt; padding: 4pt 6pt; border: .6pt solid #d5cfc2; border-radius: 3pt; break-inside: avoid; }
  .dx.sel { border: 1.2pt solid #22405e; background: #f1f5f9; }
  .dx-name { font-weight: 700; }
  .note { font-size: 7.6pt; color: #6b665c; margin-top: 4pt; }
  .page-break { break-before: page; page-break-before: always; }
`;
    const PRINT_COL_LABELS = { unclassified: '未分類', preadmission: '入院前', postadmission: '入院後', missing: '不足情報' };
    function printTypeLabel(item, seqLabel) {
      if (item.aiSuggested) return '<span class="lb lb-x">自動推定</span>';
      if (item.soMixed && (item.type === 's' || item.type === 'o')) return `<span class="lb lb-s">${escapeHtml(seqLabel || 'S/O')}</span>`;
      if (item.type === 's') return `<span class="lb lb-s">${escapeHtml(seqLabel || 'S')}${isFamilySpeech(item.text) ? '（家族）' : ''}</span>`;
      if (item.type === 'o') return `<span class="lb lb-o">${escapeHtml(seqLabel || 'O')}</span>`;
      return '';
    }
    function printTime(item, dayHeading) {
      const ts = dayHeading && timestampDayPart(item.timestamp) === dayHeading ? timestampClockPart(item.timestamp) : item.timestamp;
      return ts && ts !== '日時不明' && ts !== '自動推定' && ts !== 'AI推定' ? `<span class="tm">${escapeHtml(ts)}</span>` : '';
    }

    function printAssessmentCellList(col, list, labels, needId) {
      const line = (i, day) => `${printTypeLabel(i, labels[i.id])}${printTime(i, day)}${printFieldLabel(i)}${escapeHtml(i.text).replace(/\n/g, '<br>')}`;
      return `<ul class="cards">${assessmentDayGroups(col, typeof collapseVitalCards === 'function' && needId ? collapseLabCards(collapseVitalCards(list, needId), needId) : list).map(g =>
        (g.day ? `<li class="day${g.background ? ' bg' : ''}">${escapeHtml(g.day)}</li>` : '') +

        groupItemsByScene(g.items).map(sc => (sc.paired
          ? `<li class="scene"><table class="so"><tr><td>${sc.items.filter(i => i.type === 's').map(i => `<div>${line(i, g.day)}</div>`).join('')}</td><td>${sc.items.filter(i => i.type !== 's').map(i => `<div>${line(i, g.day)}</div>`).join('')}</td></tr></table></li>`
          : sc.items.map(i => `<li>${line(i, g.day)}</li>`).join(''))).join('')).join('')}</ul>`;
    }
    function printFieldLabel(item) {
      return item.fieldLabel ? `<span class="fl">[${escapeHtml(item.fieldLabel)}]</span>` : '';
    }
    function printTagNames(item) {
      return (item.hendersonIds || []).slice().sort((a, b) => a - b).map(h => `${h}.${hendersonNameOf(h).replace(/^\d+\.\s*/, '')}`).join('・');
    }
    function printDocHead(title, cp, extra) {
      const counts = t => (cp.items || []).filter(i => i.type === t).length;
      return `<div class="doc-head"><h1 class="doc-title">${escapeHtml(title)}</h1>
        <div class="doc-meta">患者：<b>${escapeHtml(cp.title || '')}</b>　Sデータ ${counts('s')}件・Oデータ ${counts('o')}件<br>出力日時：${escapeHtml(new Date().toLocaleString('ja-JP'))}${extra ? `<br>${extra}` : ''}</div></div>`;
    }

    function assessmentSeqLabels(matching, needId) {
      let sSeq = 0, oSeq = 0;
      const labels = {};
      ['unclassified', 'preadmission', 'postadmission'].forEach(col => {
        const list = (matching || []).filter(i => (i.assessmentCols?.[needId] || 'unclassified') === col);
        assessmentDayGroups(col, list).forEach(g => g.items.forEach(i => {
          if (i.type === 's') labels[i.id] = `S-${++sSeq}`;
          else if (i.type === 'o') labels[i.id] = `O-${++oSeq}`;
        }));
      });
      return labels;
    }

    function buildPrintAiSectionsHtml(cp, startNo, want) {
      const on = k => exportSectionOn(want, k);
      let n = startNo;
      let out = '';

      const sec = (title, html) => { out += `<h2>${n++}. ${escapeHtml(title)}</h2><div class="ai">${html}</div>`; };
      if (on('labs') && activeGeneratedResult(cp, 'labEvaluationResult')) sec('検査データ臨床評価', storedAiHtml(activeGeneratedResult(cp, 'labEvaluationResult')));
      else if (on('labs') && typeof labAssessmentHtmlFor === 'function' && labAssessmentHtmlFor(cp, { forPrint: true })) sec('検査データ臨床評価', labAssessmentHtmlFor(cp, { forPrint: true }));
      return out;
    }

    function buildAssessmentPrintHtml(cp) {
      cp = { ...cp, items: sheetRecordItems(cp) };
      const active = (cp.items || []).filter(i => i.type !== 'unnecessary');
      const colOf = (i, id) => i.assessmentCols?.[id] || 'unclassified';

      const hasUnclassified = active.some(i => (i.hendersonIds || []).some(h => colOf(i, h) === 'unclassified'));
      const cols = [...(hasUnclassified ? ['unclassified'] : []), 'preadmission', 'postadmission', 'missing'];
      const widths = hasUnclassified ? ['12%', '19%', '23%', '27%', '19%'] : ['13%', '26%', '37%', '24%'];
      const rows = HENDERSON_NEEDS.map(need => {
        const matching = active.filter(i => i.hendersonIds?.includes(need.id));
        const labels = assessmentSeqLabels(matching, need.id);
        const judgeHtml = (key, label) => {
          const x = typeof sufficiencyPhaseText === 'function' ? sufficiencyPhaseText(cp, need.id, key) : '';
          if (!x) return '';
          const m = x.match(/^判定：(.*?)／判定根拠：([\s\S]*)$/);
          return `<div class="pj"><b>▶${label}の判定：${escapeHtml(m ? m[1] : x)}</b>${m ? `<br>説明：${escapeHtml(m[2])}` : ''}${typeof sufficiencyDimensionLines === 'function' ? sufficiencyDimensionLines(cp, need.id, key).map(l => `<br>・${escapeHtml(l)}`).join('') : ''}</div>`;
        };
        const cells = cols.map(col => {
          const list = matching.filter(i => colOf(i, need.id) === col);
          if (!list.length) return '<td class="empty">—</td>';

          return `<td>${assessmentPeriodGroups(cp, col, list).map(pg => (pg.label ? `<div class="pg"><b>${escapeHtml(pg.label)}</b></div>` : '') + (pg.items.length ? printAssessmentCellList(col, pg.items, labels) : '<div class="pjn">（記録なし）</div>') + pg.judge.map(([k, l]) => judgeHtml(k, l)).join('')).join('')}</td>`;
        }).join('');
        return `<tr><th scope="row" style="background:#f7f5f0;">${need.id}. ${escapeHtml(need.name.replace(/^\d+\.\s*/, ''))}</th>${cells}</tr>`;
      }).join('');

      const own = typeof buildMyAssessmentsPrintHtml === 'function' ? buildMyAssessmentsPrintHtml(cp, 1) : '';
      const ai = buildPrintAiSectionsHtml(cp, own ? 2 : 1);
      const title = `${cp.title || ''}_総合アセスメント表`;
      return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${PRINT_BASE_CSS}
  @page { size: A4 landscape; }
  /* 行（項目）の途中でもページを分けてよい（カードの途中では分けない）。行ごとに次のページへ送ると空白が多くなる */
  table.asm tr { break-inside: auto; page-break-inside: auto; }
  table.asm th[scope="row"] { font-size: 8.6pt; }
  table.asm td { font-size: 8.4pt; }
  table.asm .pj { margin:3px 0 4px; padding:2px 4px; border-left:2px solid #8a9a8e; font-size:7.8pt; }
  table.asm .pg { margin:4px 0 1px; font-size:8pt; color:#555; }
  table.asm .pjn { font-size:7.8pt; color:#888; }
</style></head><body>
${printDocHead('総合アセスメント表（ヘンダーソン14項目）', cp)}
<p class="legend"><span class="lb lb-s">S</span>主観的情報（患者の発言）　<span class="lb lb-o">O</span>客観的情報（観察・検査）　<span class="lb lb-x">自動推定</span>不足している可能性のある情報　／　番号（S-1・O-1）は画面の総合アセスメント表と同じです。</p>
<table class="asm"><colgroup>${widths.map(w => `<col style="width:${w}">`).join('')}</colgroup>
<thead><tr><th>基本的欲求</th>${cols.map(c => `<th>${PRINT_COL_LABELS[c]}</th>`).join('')}</tr></thead>
<tbody>${rows}</tbody></table>
${own ? `<div class="page-break"></div>${own}` : ''}
${ai ? `<div class="page-break"></div>${ai}` : ''}
</body></html>`;
    }

    function printFontCss() {
      if (typeof currentAppFont === 'function' && currentAppFont() === 'gothic') return '';
      let url = 'vendor/fonts/NotoSerifJP-subset.woff2';
      try { url = new URL(url, document.baseURI).href; } catch (e) {   }
      return `@font-face { font-family: 'Noto Serif JP App'; src: url('${url}') format('woff2'); font-weight: 200 900; }
  body, body * { font-family: 'Noto Serif JP App', 'Noto Serif JP', 'Yu Mincho', 'Hiragino Mincho ProN', serif !important; }`;
    }

    function isMobilePrintTarget() {
      try {
        const ua = navigator.userAgent || '';
        if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;
        if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
        return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 900);
      } catch (e) { return false; }
    }

    function splitPrintCss(css) {

      const pageRules = [];
      let rest = '';
      let i = 0;
      while (i < css.length) {
        const m = /@(page|font-face)\b/.exec(css.slice(i));
        if (!m) { rest += css.slice(i); break; }
        const start = i + m.index;
        rest += css.slice(i, start);
        const open = css.indexOf('{', start);
        if (open < 0) { rest += css.slice(start); break; }
        let depth = 0, j = open;
        for (; j < css.length; j++) {
          if (css[j] === '{') depth++;
          else if (css[j] === '}') { depth--; if (depth === 0) break; }
        }
        if (m[1] === 'page') pageRules.push(css.slice(start, j + 1));
        i = j + 1;
      }

      rest = rest.replace(/(^|[\s,{}])(?:html|body)(?=[\s,{.:#\[*>])/g, '$1.pv-body');
      return { pageRules: pageRules.join('\n'), bodyCss: rest };
    }

    function stripActivePrintContent(root, { keepSvg = false } = {}) {
      if (!root || !root.querySelectorAll) return;
      root.querySelectorAll(`script,iframe,frame,object,embed,link,meta,base,form,${keepSvg ? 'foreignObject,animate,set,animateTransform,animateMotion,use,image' : 'svg'},math,template,noscript,img`).forEach(el => el.remove());
      root.querySelectorAll('*').forEach(el => Array.from(el.attributes || []).forEach(a => {
        const name = a.name.toLowerCase();
        if (name.startsWith('on') || name === 'srcdoc') el.removeAttribute(a.name);
        else if (/^(?:href|src|action|formaction|xlink:href)$/.test(name) && /^\s*(?:javascript|data|vbscript):/i.test(a.value || '')) el.removeAttribute(a.name);
      }));
    }
    function closeMobilePrintView() {
      document.getElementById('print-view')?.remove();
      document.getElementById('print-view-style')?.remove();
      document.documentElement.classList.remove('print-view-open');
    }
    function showMobilePrintView(html, options = {}) {
      closeMobilePrintView();
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const css = Array.from(parsed.querySelectorAll('style')).map(s => s.textContent).join('\n');

      stripActivePrintContent(parsed.body, { keepSvg: !!options.keepSvg });
      const { pageRules, bodyCss } = splitPrintCss(css);
      const docStyle = document.createElement('style');
      docStyle.id = 'print-view-style';
      docStyle.textContent = `${pageRules}
  html.print-view-open, html.print-view-open body { overflow: hidden !important; }
  #print-view { position: fixed; inset: 0; z-index: 10000; background: #fff; overflow: auto; -webkit-overflow-scrolling: touch; color: #1f1d1a; }
  #print-view .pv-bar { position: sticky; top: 0; z-index: 2; background: #1F4E45; color: #fff; padding: 10px 12px; font: 14px/1.6 sans-serif; display: flex; flex-direction: column; gap: 6px; }
  #print-view .pv-bar button { display: block !important; font: 700 16px sans-serif; padding: 10px 14px; border-radius: 8px; border: 0; background: #fff; color: #1F4E45; }
  #print-view .pv-bar button.pv-close { font: 13px sans-serif; padding: 6px; border: 1px solid #fff; background: transparent; color: #fff; }
  #print-view .pv-note { font-size: 12.5px; }
  #print-view .pv-doc { padding: 10px 10px 24px; }
  @media print {
    html.print-view-open body > *:not(#print-view) { display: none !important; }
    html.print-view-open, html.print-view-open body { overflow: visible !important; height: auto !important; background: #fff !important; }
    #print-view { position: static !important; overflow: visible !important; inset: auto; }
    #print-view .pv-bar { display: none !important; }
    #print-view .pv-doc { padding: 0; }
  }`;
      document.head.appendChild(docStyle);
      const view = document.createElement('div');
      view.id = 'print-view';
      view.setAttribute('role', 'dialog');
      view.setAttribute('aria-modal', 'true');
      view.setAttribute('aria-label', '印刷・PDFの見本');
      view.innerHTML = `<div class="pv-bar">
        <button type="button" class="pv-print">印刷・PDFに保存</button>
        <div class="pv-note">iPhone：ボタン →（プリンタを選ばずに）右上の共有ボタン →「"ファイル"に保存」でPDFになります。<br>Android：ボタン → プリンタで「PDFとして保存」を選び、ダウンロードのボタンを押します。</div>
        <button type="button" class="pv-close">閉じてアプリに戻る</button>
      </div><div class="pv-doc"></div>`;
      const host = view.querySelector('.pv-doc');
      const root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
      root.innerHTML = `<style>${bodyCss}
  @media screen { .pv-body table { width: 100% !important; } }</style><div class="pv-body">${parsed.body.innerHTML}</div>`;
      view.querySelector('.pv-print').addEventListener('click', () => {
        try { window.print(); } catch (e) { showToast(['印刷画面を開けませんでした', { text: 'ブラウザのメニュー（共有・︙）から「印刷」を選んでください。', detail: true }], 'error'); }
      });
      view.querySelector('.pv-close').addEventListener('click', closeMobilePrintView);
      view.addEventListener('keydown', e => { if (e.key === 'Escape') closeMobilePrintView(); });
      document.body.appendChild(view);
      document.documentElement.classList.add('print-view-open');
      view.querySelector('.pv-print').focus();
      return true;
    }
    window.closeMobilePrintView = closeMobilePrintView;
    function printHtmlDocument(html, options = {}) {
      const fontCss = printFontCss();
      if (fontCss) html = html.replace('</head>', `<style>${fontCss}</style></head>`);
      if (isMobilePrintTarget()) return showMobilePrintView(html, options);
      const old = document.getElementById('print-frame');
      if (old) old.remove();
      const frame = document.createElement('iframe');
      frame.id = 'print-frame';
      frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';

      frame.onload = () => {
        const doc = frame.contentDocument;
        const ready = doc && doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve();
        Promise.race([ready, new Promise(r => setTimeout(r, 3000))]).then(() => setTimeout(() => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { showToast(['印刷画面を開けませんでした', { text: 'ブラウザの印刷やポップアップの設定を確かめて、もう一度押してください。', detail: true }], 'error'); } }, 200));
      };
      document.body.appendChild(frame);
      frame.srcdoc = html;
    }
    window.printAssessmentSheet = function() {
      const cp = getCurrentPatient();
      if (!(cp.items || []).some(i => i.type !== 'unnecessary')) return showToast('印刷するカードがありません。先に「分類開始」で分類してください', 'warn');
      printHtmlDocument(buildAssessmentPrintHtml(cp));
      showToast(isMobilePrintTarget() ? '印刷用の見本を開きました。上の「印刷・PDFに保存」を押してください' : '印刷画面を開きます。「送信先」で「PDFに保存」を選ぶとPDFになります', 'info');
    };

    function buildExportBodyHtml(cp, want) {
      const on = k => exportSectionOn(want, k);
      cp = { ...cp, items: sheetRecordItems(cp) };
      const items = cp.items || [];
      const dataTable = list => list.length === 0 ? '<p class="muted">（登録なし）</p>' :
        `<table><colgroup><col style="width:15%"><col><col style="width:22%"></colgroup><thead><tr><th>日時</th><th>内容</th><th>タグ</th></tr></thead><tbody>${list.map(i => `<tr><td class="tm">${escapeHtml(i.timestamp && i.timestamp !== '日時不明' ? i.timestamp : '—')}</td><td>${printFieldLabel(i)}${escapeHtml(i.text)}</td><td class="tags">${escapeHtml(printTagNames(i)) || '<span class="muted">タグ未設定</span>'}</td></tr>`).join('')}</tbody></table>`;
      let n = 1;
      let body = printDocHead('看護アセスメント・記録整理シート', cp);

      const isMissingOnly = i => typeof isMissingInfoOnlyItem === 'function' && isMissingInfoOnlyItem(i);
      if (on('s')) body += `<h2>${n++}. 主観的情報（Sデータ）</h2>` + dataTable(items.filter(i => i.type === 's' && !isMissingOnly(i)));
      if (on('o')) body += `<h2>${n++}. 客観的情報（Oデータ）</h2>` + dataTable(items.filter(i => i.type === 'o' && !isMissingOnly(i)));
      const missingOnly = items.filter(i => i.type !== 'unnecessary' && isMissingOnly(i));
      if (on('missing') && missingOnly.length) {
        const status = i => (typeof missingCheckStatus === 'function' ? ({ unchecked: '未確認', checked: '確認済み', na: '該当なし' })[missingCheckStatus(cp, i.id)] : '未確認');
        const result = i => { const c = typeof getMissingCheck === 'function' ? getMissingCheck(cp, i.id) : null; return c && c.result ? `<br><span class="muted">→ ${escapeHtml(c.result)}${c.method ? `（${escapeHtml(c.method)}）` : ''}</span>` : ''; };
        body += `<h2>${n++}. 不足情報と確認状況</h2><table><colgroup><col style="width:14%"><col><col style="width:20%"></colgroup><thead><tr><th>状況</th><th>確かめたい情報</th><th>項目</th></tr></thead><tbody>${missingOnly.map(i => `<tr><td>${escapeHtml(status(i))}${i.aiSuggested ? '<br><span class="lb lb-x">自動推定</span>' : ''}</td><td>${escapeHtml(i.text.replace(/^原因:\s*/, ''))}${result(i)}</td><td class="tags">${escapeHtml(printTagNames(i))}</td></tr>`).join('')}</tbody></table>`;
      }
      const unclassified = items.filter(i => i.type === 'unclassified');
      if (on('unclassified') && unclassified.length) body += `<h2>${n++}. 未分類のカード</h2>` + dataTable(unclassified);
      if (on('henderson')) {
      body += `<h2>${n++}. ヘンダーソン14項目別アセスメント整理</h2>`;
      const active = items.filter(i => i.type !== 'unnecessary');
      let anyNeed = false;
      HENDERSON_NEEDS.forEach(need => {
        const matching = active.filter(i => i.hendersonIds?.includes(need.id));
        if (matching.length === 0) return;
        anyNeed = true;
        const labels = assessmentSeqLabels(matching, need.id);
        const cols = ['unclassified', 'preadmission', 'postadmission', 'missing'].filter(col => col !== 'unclassified' || matching.some(i => (i.assessmentCols?.[need.id] || 'unclassified') === 'unclassified'));
        body += `<h3>${need.id}. ${escapeHtml(need.name.replace(/^\d+\.\s*/, ''))}</h3><table><thead><tr>${cols.map(c => `<th style="width:${Math.floor(100 / cols.length)}%">${PRINT_COL_LABELS[c]}</th>`).join('')}</tr></thead><tbody><tr>${cols.map(col => {
          const list = matching.filter(i => (i.assessmentCols?.[need.id] || 'unclassified') === col);
          return list.length ? `<td>${printAssessmentCellList(col, list, labels, need.id)}</td>` : '<td class="empty">—</td>';
        }).join('')}</tr></tbody></table>`;
      });
      if (!anyNeed) body += '<p class="muted">（タグが付いたカードがありません）</p>';
      }
      const own = typeof buildMyAssessmentsPrintHtml === 'function' ? buildMyAssessmentsPrintHtml(cp, n) : '';
      if (on('own') && own) { body += own; n++; }

      const plansText = typeof buildCarePlansText === 'function' ? buildCarePlansText(cp, { withRecords: true }) : '';
      if (on('plans') && plansText) body += `<h2>${n++}. 看護計画と実施・評価</h2><p style="white-space:pre-wrap;margin:0;">${escapeHtml(plansText)}</p>`;
      if (on('planEval')) { const pe = buildPlanEvaluationHtml(cp, n); if (pe) { body += pe; n++; } }
      body += buildPrintAiSectionsHtml(cp, n, want);
      if (on('drugs') && typeof drugInfoSectionText === 'function') { const dt = drugInfoSectionText(cp); if (dt) body += `<h2>${n++}. 薬剤の情報</h2><p style="white-space:pre-wrap;margin:0;">${escapeHtml(dt)}</p>`; }
      const notes = cp.referenceNotes || [];
      if (notes.length > 0 && on('notes')) {
        body += '<h2>参考データ</h2>';
        notes.forEach(note => { body += `<h3>${escapeHtml(note.title)}</h3><p style="white-space:pre-wrap;margin:0;">${escapeHtml(note.text)}</p>`; });
      }
      return body;
    }

    // ==========================================================================

    // ------------------------------------------------------------------------

    function htmlToPlainText(htmlStr) {
      if (!htmlStr) return '（未実施）';
      const text = htmlStr
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .split('\n').map(line => line.trim()).join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      return text || '（未実施）';
    }
    // Export section selection. A selection is a Set of keys, or null/undefined for "everything" (the default, so output is unchanged).
    const EXPORT_SECTIONS_STORAGE_KEY = 'export_sections_v1';
    const EXPORT_SECTIONS = [
      { key: 'labs', label: '検査データ臨床評価' },
      { key: 's', label: '主観的情報（Sデータ）' },
      { key: 'o', label: '客観的情報（Oデータ）' },
      { key: 'missing', label: '不足情報と確認状況' },
      { key: 'unclassified', label: '未分類のカード' },
      { key: 'henderson', label: 'ヘンダーソン14項目別アセスメント整理' },
      { key: 'own', label: '自分のアセスメント' },
      { key: 'plans', label: '看護計画と実施・評価' },
      { key: 'planEval', label: '全計画の評価' },
      { key: 'drugs', label: '薬剤の情報' },
      { key: 'notes', label: '参考データ' }
    ];
    function exportSectionOn(want, key) { return !want || (typeof want.has === 'function' ? want.has(key) : Array.from(want).includes(key)); }
    function exportSelectionFromKeys(keys) {
      const valid = new Set(EXPORT_SECTIONS.map(x => x.key));
      return new Set(Array.from(keys || []).filter(k => valid.has(k)));
    }
    // Remembered as the keys switched OFF, so a section added later is on by default.
    function loadExportSectionsOff() {
      try { const a = JSON.parse(localStorage.getItem(EXPORT_SECTIONS_STORAGE_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
    }
    function saveExportSectionsOff(keys) { try { localStorage.setItem(EXPORT_SECTIONS_STORAGE_KEY, JSON.stringify(keys)); } catch (e) { } }
    // Evaluation across all care plans: one block per plan with every evaluation record (date, achievement, evaluation, revision).
    function planEvaluationEntries(cp) {
      if (typeof carePlanList !== 'function') return [];
      return carePlanList(cp).filter(p => typeof carePlanProvenance !== 'function' || carePlanProvenance(cp, p).ok).map((p, k) => {
        const st = (CARE_PLAN_STATUSES.find(x => x.key === p.status) || {}).label || '';
        const recs = (p.records || []).filter(r => r.evaluation || r.achievement || r.revision).map(r => {
          const ach = CARE_ACHIEVEMENTS.find(a => a.key === r.achievement);
          return { at: typeof formatMyDateTime === 'function' ? formatMyDateTime(r.at) : String(r.at || ''), achievement: ach && ach.key ? ach.label : '', evaluation: r.evaluation || '', revision: r.revision || '' };
        });
        return { no: k + 1, problem: p.problem || '（無題）', status: st, goalShort: p.goalShort || '', records: recs, evalStatus: peEvalStatus(p).label };
      });
    }
    function buildPlanEvaluationText(cp) {
      const list = planEvaluationEntries(cp);
      if (!list.length) return '';
      let out = plainSectionTitle('全計画の評価');
      out += list.map(e => {
        const lines = [`#${e.no} ${e.problem}（${e.status}）`];
        if (e.goalShort) lines.push(`短期目標：${e.goalShort}`);
        if (!e.records.length) lines.push('  （評価の記録なし）');
        e.records.forEach(r => {
          lines.push(`  【${r.at}】${r.achievement ? `目標：${r.achievement}` : ''}`);
          if (r.evaluation) lines.push(`    評価：${r.evaluation}`);
          if (r.revision) lines.push(`    計画の修正：${r.revision}`);
        });
        lines.push(`  評価状態：${e.evalStatus}`);
        return lines.join('\n');
      }).join('\n\n') + '\n';
      out += peQualityText(cp);
      return out;
    }
    function buildPlanEvaluationHtml(cp, no) {
      const list = planEvaluationEntries(cp);
      if (!list.length) return '';
      const esc = t => escapeHtml(String(t == null ? '' : t));
      return `<h2>${no}. 全計画の評価</h2>` + list.map(e => `<h3>#${e.no} ${esc(e.problem)}（${esc(e.status)}）</h3>${e.goalShort ? `<p style="margin:0 0 4px;">短期目標：${esc(e.goalShort)}</p>` : ''}` + (e.records.length
        ? `<table><thead><tr><th style="width:20%">日時・目標</th><th>評価</th><th style="width:28%">計画の修正</th></tr></thead><tbody>${e.records.map(r => `<tr><td>${esc(r.at)}${r.achievement ? `<br><b>${esc(r.achievement)}</b>` : ''}</td><td style="white-space:pre-wrap;">${esc(r.evaluation) || '—'}</td><td style="white-space:pre-wrap;">${esc(r.revision) || '—'}</td></tr>`).join('')}</tbody></table>`
        : '<p class="muted">（評価の記録なし）</p>') + `<p style="margin:2px 0 6px;">評価状態：${esc(e.evalStatus)}</p>`).join('') + peQualityHtml(cp);
    }
    // ---- v.89 care-plan evaluation quality (local, generic, warnings only; never changes saved data) ----
    const PE_UNEVAL = '評価不能（情報不足）';
    const PE_NUM = { '１': 1, '２': 2, '３': 3, '四': 4, '二': 2, '三': 3, '五': 5, '一': 1 };
    // Number of successes a goal asks for (consecutive / repeated). 0 = no repetition required.
    function peRepeatNeed(goal) {
      const t = String(goal || '').normalize('NFKC');
      let m = t.match(/(\d+)\s*(?:回|日|度)\s*(?:連続|続けて|継続)/) || t.match(/連続\s*(\d+)\s*(?:回|日)/);
      if (m) return Math.max(2, Number(m[1]));
      m = t.match(/([二三四五])\s*(?:回|日)\s*(?:連続|続けて)/);
      if (m) return PE_NUM[m[1]] || 2;
      if (/毎日|毎回|常に|continu|続けて|連続/.test(t)) return 2;
      return 0;
    }
    const PE_SELF = /できる|言える|話せる|説明でき|実演|実施でき|自分で|自己|観察でき|示せる|選べる|連絡でき|相談でき|理解でき/;
    const PE_COND = /創(?:部)?(?:の)?(?:サイズ|大きさ|面積|縮小|治癒)|CRP|白血球|WBC|Hb|血糖|体温|血圧|脈拍|SpO2|検査値|数値|改善傾向|縮小|低下|下降|軽快|消退/;
    function peEvalStatus(plan, nowHint) {
      const recs = ((plan && plan.records) || []).filter(r => r && r.achievement);
      const goal = String((plan && (plan.goalShort || plan.goalLong)) || '');
      if (!recs.length) return { label: PE_UNEVAL, key: 'unevaluable', evidence: [], reason: '評価の記録がないため、達成とは判定できません' };
      const last = recs[recs.length - 1];
      const ev = recs.map(r => `${typeof formatMyDateTime === 'function' ? formatMyDateTime(r.at) : r.at}：${(CARE_ACHIEVEMENTS.find(a => a.key === r.achievement) || {}).label || ''}${r.evaluation ? `（${String(r.evaluation).slice(0, 30)}）` : ''}`);
      if (last.achievement === 'unevaluable') return { label: PE_UNEVAL, key: 'unevaluable', evidence: ev, reason: '最新の評価が評価不能です' };
      if (last.achievement === 'not') return { label: '未達成', key: 'not', evidence: ev, reason: '' };
      if (last.achievement === 'partial') return { label: '一部達成', key: 'partial', evidence: ev, reason: '' };
      const need = peRepeatNeed(goal), ok = recs.filter(r => r.achievement === 'achieved').length;
      if (need && ok < need) return { label: '一部達成', key: 'partial', unconfirmed: true, evidence: ev, reason: `目標は${need}回以上の継続・連続を求めていますが、達成の記録は${ok}件です（達成未確認）` };
      return { label: '達成', key: 'achieved', evidence: ev, reason: '' };
    }
    // Lab series: "CRP 5/1 12.0 5/3 8.0" style. Returns warnings for reversed order, contradictory trend words, and infection claims.
    const PE_LOW_BETTER = /CRP|WBC|白血球|PCT|プロカルシトニン|体温|LDH|BUN|Cr|クレアチニン|血糖|HbA1c|AST|ALT/i;
    const PE_HIGH_BETTER = /Alb|アルブミン|Hb|ヘモグロビン|SpO2|Plt|血小板/i;
    function peLabSeriesWarnings(text) {
      const out = [];
      String(text || '').normalize('NFKC').split(/\r?\n/).forEach(line => {
        const pts = [...line.matchAll(/(\d{1,2})\/(\d{1,2})\s*[:：(（]?\s*(-?\d+(?:\.\d+)?)/g)].map(m => ({ d: Number(m[1]) * 100 + Number(m[2]), s: `${m[1]}/${m[2]}`, v: Number(m[3]) }));
        const head = line.slice(0, line.search(/\d{1,2}\/\d{1,2}/) < 0 ? 20 : line.search(/\d{1,2}\/\d{1,2}/)).trim();
        const name = (head.match(/[A-Za-z0-9ぁ-んァ-ヶ一-龥]+/g) || [head]).slice(-1)[0] || '検査値';
        let sorted = pts;
        if (pts.length >= 2) {
          const asc = pts.every((p, i) => !i || p.d >= pts[i - 1].d), desc = pts.every((p, i) => !i || p.d <= pts[i - 1].d);
          if (desc && !asc) { out.push({ kind: 'labReversed', where: line.trim().slice(0, 60), basis: `日付が新しい順に並んでいます（${pts.map(p => `${p.s} ${p.v}`).join(' → ')}）`, fix: '古い日付から新しい日付の順に並べ直して、変化の向きを読み直してください', need: '各検査の採取日の確認' }); sorted = pts.slice().reverse(); }
          else if (!asc) sorted = pts.slice().sort((a, b) => a.d - b.d);
          const first = sorted[0], lastp = sorted[sorted.length - 1];
          const better = PE_LOW_BETTER.test(head) ? lastp.v < first.v : PE_HIGH_BETTER.test(head) ? lastp.v > first.v : null;
          const worse = PE_LOW_BETTER.test(head) ? lastp.v > first.v : PE_HIGH_BETTER.test(head) ? lastp.v < first.v : null;
          if ((/改善|軽快|良好/.test(line) && worse) || (/悪化|増悪/.test(line) && better)) out.push({ kind: 'labTrend', where: line.trim().slice(0, 60), basis: `値は ${first.s} ${first.v} から ${lastp.s} ${lastp.v} です。書かれた向きと数値が合いません`, fix: '数値の向きに合わせて「改善」「悪化」を書き直す、または日付の順序を確認してください', need: `${name}の採取日と基準値` });
        }
        if (/(?:CRP|WBC|白血球|炎症|PCT)[^。\n]{0,20}(?:改善|低下|下降|正常化)/i.test(line) && /感染[^。\n]{0,6}(?:否定|除外|なし|ない|消失|治癒)/.test(line)) out.push({ kind: 'infectionRuledOut', where: line.trim().slice(0, 60), basis: '炎症反応の改善だけでは感染の否定にはなりません', fix: '「炎症反応は改善傾向。感染の有無は症状・培養・画像と合わせて判断」のように書き分けてください', need: '発熱・創部所見・培養・画像' });
      });
      return out;
    }
    // Problem name -> findings that define it. If none of the words appear in the records, the problem has no support.
    const PE_PROBLEM_BASIS = [
      [/急性疼痛|疼痛|痛み/, /痛|NRS|VAS|疼痛|鎮痛/, '痛みの訴え・NRS/VASなど'],
      [/便秘/, /排便|便(?:通|秘|回数|性状)|下剤|腹部膨満|ブリストル/, '排便回数・性状・最終排便日'],
      [/感染/, /発熱|熱|CRP|白血球|WBC|発赤|腫脹|排膿|培養|膿/, '体温・炎症反応・創部所見'],
      [/嚥下|誤嚥/, /嚥下|むせ|誤嚥|経口|食事/, '嚥下・むせ・食事の記録'],
      [/不眠|睡眠/, /睡眠|眠|不眠|入眠|中途覚醒/, '睡眠時間・入眠の状況']
    ];
    function peQualityWarnings(cp) {
      const out = [], add = (kind, where, basis, fix, need) => out.push({ kind, where, basis, fix, need });
      if (typeof carePlanList !== 'function' || !cp) return out;
      const ctx = typeof cpRecordContext === 'function' ? cpRecordContext(cp) : { text: '' };
      const rec = ctx.text || '';
      const plans = carePlanList(cp);
      const seenProblem = {};
      plans.forEach(p => {
        const nm = `「${p.problem || '無題'}」`;
        const st = peEvalStatus(p);
        const recs = p.records || [];
        if (st.unconfirmed) add('repeatGoal', nm, st.reason + `。根拠：${st.evidence.join(' / ')}`, '連続・継続の条件を満たす記録が揃うまで「一部達成」または「達成未確認」として扱ってください', '各回の日時と結果');
        // condition improvement vs self-care goal
        const goal = String(p.goalShort || p.goalLong || '');
        const lastAch = recs.filter(r => r.achievement === 'achieved').slice(-1)[0];
        if (lastAch && PE_SELF.test(goal)) {
          const evalText = [lastAch.evaluation, lastAch.response, lastAch.doneText].filter(Boolean).join(' ').normalize('NFKC');
          if (PE_COND.test(evalText) && !PE_SELF.test(evalText) && !/実演|説明|確認|自分で|できた|言えた/.test(evalText)) add('conditionVsSelfCare', nm, '目標は患者ができること（セルフケア）ですが、達成の根拠が状態の改善（検査値・創の状態など）だけです', '状態の改善と、患者が観察・実演・説明できたことを分けて評価に書いてください', '患者が自分でできたことの観察記録');
        }
        // done without implementation record
        if (p.status === 'done' && !recs.some(r => (r.doneItems && r.doneItems.length) || r.doneText)) add('noImplementation', nm, '状態は「実施済み」ですが、実施した内容の記録がありません', '実施日時と内容を記録するか、状態を「実施予定」などに戻してください', '実施の記録');
        recs.filter(r => r.achievement === 'achieved' && !(r.doneItems && r.doneItems.length) && !r.doneText && !r.evaluation).forEach(r => add('noImplementation', nm, `${typeof formatMyDateTime === 'function' ? formatMyDateTime(r.at) : r.at}に「達成」とありますが、実施内容も評価の文もありません`, '何を実施し何が確認できたかを記録してください', '実施内容と確認した事実'));
        // problem without support
        const pb = PE_PROBLEM_BASIS.find(([re]) => re.test(p.problem || '') && !/リスク|risk/i.test(p.problem || ''));
        if (pb && rec) {
          const painZero = /疼痛|痛み/.test(p.problem) && ctx.nrs === 0 && !/痛い|痛む|痛み(?:が|を)?(?:訴|強|あり)/.test(rec.replace(/痛みなし|痛みはない|痛みの訴えなし/g, ''));
          if (!pb[1].test(rec) || painZero) add('noSupport', nm, `記録に、この問題を支える所見（${pb[2]}）が${painZero ? '見当たりません（NRSは0で、痛みの訴えもありません）' : '見当たりません'}`, '所見がそろうまでは「根拠不足」として扱うか、リスク型の問題に書き換えを検討してください', pb[2]);
        }
        // plan mentions findings absent from records
        const body = [p.goalShort, p.goalLong, ...(p.op || []), ...(p.tp || []), ...(p.ep || [])].join('\n').normalize('NFKC');
        [[/創部痛|創痛/, /創/, '創部の痛み'], [/ドレーン排液/, /ドレーン/, 'ドレーンの記録'], [/ストーマ/, /ストーマ|ストマ|人工肛門/, 'ストーマの記録']].forEach(([bre, rre, label]) => {
          if (rec && bre.test(body) && !(rre.test(rec) && (label !== '創部の痛み' || /創.{0,6}痛|痛.{0,6}創/.test(rec)))) add('planBeyondRecords', nm, `計画に「${label}」への内容がありますが、記録に${label}が見当たりません`, '記録にある所見に合わせて計画を見直すか、所見を確認して記録に追加してください', label);
        });
        // duplicates within plan / across plans
        const lines = [...(p.op || []), ...(p.tp || []), ...(p.ep || [])].map(l => String(l).normalize('NFKC').replace(/[\s。、]/g, ''));
        if (lines.some((l, i) => l && lines.indexOf(l) !== i)) add('duplicate', nm, '同じ内容の行が同じ計画内に重複しています', '重複を1つにまとめてください', '');
        const key = String(p.problem || '').normalize('NFKC').replace(/\s/g, '');
        if (key && seenProblem[key]) add('duplicate', nm, '同じ名前の看護問題が複数あります', '1つにまとめるか、目的と達成条件を分けてください', '');
        seenProblem[key] = 1;
        const days = {};
        recs.forEach(r => { if (r.achievement && r.at) { const d = String(r.at).slice(0, 10); (days[d] = days[d] || new Set()).add(r.achievement); } });
        Object.keys(days).forEach(d => { if (days[d].has('achieved') && days[d].has('not')) add('contradiction', nm, `${d}に「達成」と「未達成」の両方の評価があります`, 'どちらが正しいか確認し、片方を直してください', '当日の観察記録'); });
      });
      peLabSeriesWarnings(rec).forEach(w => out.push(w));
      // sufficiency "met" with no evidence
      if (typeof ruleSufficiencyFor === 'function' && typeof HENDERSON_NEEDS !== 'undefined') {
        let suf = {};
        try { suf = ruleSufficiencyFor(cp) || {}; } catch (e) { suf = {}; }
        HENDERSON_NEEDS.forEach(need => Object.keys(suf[need.id] || {}).forEach(ph => {
          const x = suf[need.id][ph];
          if (x && x.verdict === 'met' && !((x.evidence || []).length)) add('metWithoutEvidence', `${need.id}. ${String(need.name).replace(/^\d+\.\s*/, '')}`, '充足と判定されていますが、根拠になるカードがありません（情報不足の可能性）', '根拠カードを確認し、なければ「情報不足」として扱ってください', '該当項目の記録');
        }));
      }
      return out;
    }
    function peQualityHtml(cp) {
      const w = peQualityWarnings(cp);
      if (!w.length) return '';
      const esc = t => escapeHtml(String(t == null ? '' : t));
      return `<h3>評価の質の確認（自動・看護師の確認用）</h3><table><thead><tr><th>種類</th><th>問題箇所</th><th>根拠</th><th>修正案</th><th>確認が必要な情報</th></tr></thead><tbody>${w.map(x => `<tr><td>${esc(PE_KIND_LABEL[x.kind] || x.kind)}</td><td>${esc(x.where)}</td><td>${esc(x.basis)}</td><td>${esc(x.fix)}</td><td>${esc(x.need)}</td></tr>`).join('')}</tbody></table>`;
    }
    const PE_KIND_LABEL = { repeatGoal: '目標と記録のずれ', conditionVsSelfCare: '状態の改善とセルフケアの混同', noImplementation: '実施記録なし', noSupport: '根拠不足', planBeyondRecords: '記録にない内容', duplicate: '重複', contradiction: '矛盾', labReversed: '検査値の並び順', labTrend: '検査値の向き', infectionRuledOut: '感染の否定の言い過ぎ', metWithoutEvidence: '情報不足の充足判定' };
    function peQualityText(cp) {
      const w = peQualityWarnings(cp);
      if (!w.length) return '';
      return '\n【評価の質の確認（自動・看護師の確認用）】\n' + w.map(x => `・${PE_KIND_LABEL[x.kind] || x.kind}\n  問題箇所：${x.where}\n  根拠：${x.basis}\n  修正案：${x.fix}\n  確認が必要な情報：${x.need || '（なし）'}`).join('\n') + '\n';
    }
    function plainSectionTitle(title) {
      return `\n【${title}】\n`;
    }
    function plainList(lines) {
      if (lines.length === 0) return '（登録なし）\n';
      return lines.map(t => `・${t}`).join('\n') + '\n';
    }

    function cleanSheetRecordText(text) {
      return String(text || '').split(/\r?\n/).map(line => {
        if (!line.includes('|')) return line;
        const cells = line.split('|').map(c => c.trim()).filter(Boolean);
        if (!cells.length || cells.every(c => /^:?-{2,}:?$/.test(c)) || /^(?:項目|検査項目)$/.test(cells[0])) return '';
        return cells.join(' ');
      }).filter(Boolean).join('\n');
    }
    function sheetRecordItems(cp) {
      const seen = new Set();
      return removeCoveredCompositeCards(cp.items || []).filter(i => !i.deleted).filter(i => {
        const text = cleanSheetRecordText(i.text);
        if (!text) return false;
        const key = `${i.type}\0${i.timestamp || ''}\0${i.fieldLabel || ''}\0${JSON.stringify(i.assessmentCols || {})}\0${(i.hendersonIds || []).slice().sort((a,b)=>a-b).join(',')}\0${text.normalize('NFKC').replace(/\s+/g, '')}`;
        if (seen.has(key)) return false;
        seen.add(key); return true;
      }).map(i => ({ ...i, text: cleanSheetRecordText(i.text) }));
    }
    function buildExportPlainText(cp, want) {
      const on = k => exportSectionOn(want, k);
      cp = { ...cp, items: sheetRecordItems(cp) };
      const formatLine = i => `[${i.timestamp}]${i.fieldLabel ? ` [${i.fieldLabel}]` : ''} ${i.text}`;

      let out = `看護アセスメント・記録整理シート：${cp.title}\n`;
      out += `出力日時: ${new Date().toLocaleString('ja-JP')}\n`;

      if (on('labs')) {
      out += plainSectionTitle('1. 検査データ臨床評価・アセスメントノート');
      out += htmlToPlainText(activeGeneratedResult(cp, 'labEvaluationResult') || (typeof labAssessmentTextFor === 'function' && labAssessmentTextFor(cp)) || '（評価できる検査値がありません）') + '\n';
      }

      const isMissingOnly = i => typeof isMissingInfoOnlyItem === 'function' && isMissingInfoOnlyItem(i);
      if (on('s')) {
      out += plainSectionTitle('2. 主観的情報（Sデータ）');
      out += plainList(cp.items.filter(i => i.type === 's' && !isMissingOnly(i)).map(formatLine));
      }

      if (on('o')) {
      out += plainSectionTitle('3. 客観的情報（Oデータ）');
      out += plainList(cp.items.filter(i => i.type === 'o' && !isMissingOnly(i)).map(formatLine));
      }
      const missingOnly = cp.items.filter(i => i.type !== 'unnecessary' && isMissingOnly(i));
      if (on('missing') && missingOnly.length) {
        out += plainSectionTitle('不足情報と確認状況');
        out += plainList(missingOnly.map(i => {
          const st = typeof missingCheckStatus === 'function' ? ({ unchecked: '未確認', checked: '確認済み', na: '該当なし' })[missingCheckStatus(cp, i.id)] : '未確認';
          const c = typeof getMissingCheck === 'function' ? getMissingCheck(cp, i.id) : null;
          return `[${st}]${i.aiSuggested ? ' [自動推定]' : ''} ${i.text.replace(/^原因:\s*/, '')}${c && c.result ? ` → ${c.result}` : ''}`;
        }));
      }

      if (on('unclassified')) {
      out += plainSectionTitle('4. 未分類のカード');
      out += plainList(cp.items.filter(i => i.type === 'unclassified').map(formatLine));
      }

      if (on('henderson')) {
      out += plainSectionTitle('5. ヘンダーソン14項目別アセスメント整理');
      HENDERSON_NEEDS.forEach(need => {
        const matching = cp.items.filter(i => i.type !== 'unnecessary' && i.hendersonIds?.includes(need.id));
        if (matching.length === 0) return;
        out += `\n${need.id}. ${need.name}\n`;
        out += plainList(collapseLabCards(collapseVitalCards(matching, need.id), need.id).map(i => {
          const col = i.assessmentCols?.[need.id] || 'unclassified';
          const colName = col === 'preadmission' ? '入院前' : (col === 'postadmission' ? '入院後' : (col === 'missing' ? '不足情報' : '未分類'));
          return `[${colName}] [${i.type.toUpperCase()}]${i.fieldLabel ? ` [${i.fieldLabel}]` : ''}${i.aiSuggested ? ' [自動推定]' : ''} ${i.text}`;
        }));
      });
      }

      const own = typeof buildMyAssessmentsText === 'function' ? buildMyAssessmentsText(cp) : '';
      if (on('own') && own) { out += plainSectionTitle('自分のアセスメント'); out += own + '\n'; }

      const plansText = typeof buildCarePlansText === 'function' ? buildCarePlansText(cp, { withRecords: true }) : '';
      if (on('plans') && plansText) { out += plainSectionTitle('看護計画と実施・評価'); out += plansText + '\n'; }
      if (on('planEval')) out += buildPlanEvaluationText(cp);
      if (on('drugs') && typeof drugInfoSectionText === 'function') { const dt = drugInfoSectionText(cp); if (dt) { out += plainSectionTitle('薬剤の情報'); out += dt + '\n'; } }


      const notes = cp.referenceNotes || [];
      if (notes.length > 0 && on('notes')) {
        out += plainSectionTitle('10. 参考データ');
        notes.forEach(n => { out += `\n${n.title}\n${n.text}\n`; });
      }
      return out;
    }

    // ==========================================================================

    // ------------------------------------------------------------------------

    const SELECTED_EXPORT_TYPE_LABELS = { s: 'Sデータ', o: 'Oデータ', unclassified: '未分類', unnecessary: '不必要な情報' };
    function sourceRangesForCard(sourceText, cardText, item) {
      if (item?.fieldLabel && /^(?:ない|なし|あり|陰性|陽性)[。.]?$/.test(String(cardText).trim())) {
        const label = escapeRegExp(item.fieldLabel);
        const value = escapeRegExp(String(cardText).trim().replace(/[。.]$/, ''));
        const re = new RegExp(`${label}(?:は|が|[:：\\s]+)${value}`, 'g');
        const match = re.exec(sourceText || '');
        return match ? [[match.index, match.index + match[0].length]] : [];
      }
      if (/^(?:ない|なし|あり)[。.]?$/.test(String(cardText).trim())) return [];
      return findSourceHighlightRanges(sourceText || '', cardText);
    }
    function sourceExcerptForCard(sourceText, cardText, item) {
      const ranges = sourceRangesForCard(sourceText, cardText, item);
      if (!ranges.length) return null;

      const start = sourceText.lastIndexOf('\n', ranges[0][0] - 1) + 1;
      const endNewline = sourceText.indexOf('\n', ranges[ranges.length - 1][1]);
      const end = endNewline === -1 ? sourceText.length : endNewline;
      const excerpt = sourceText.slice(start, end).split(/\r?\n/).map(l => l.trim()).filter(Boolean).join(' / ');
      return excerpt.length > 300 ? `${excerpt.slice(0, 300)}…` : excerpt;
    }

    const REWRITE_TRIVIAL_REGEX = /^[\s、。,，.．:：;；・\/()（）「」\-~〜]*$/;
    const rewriteNorm = s => (s || '').normalize('NFKC').toLowerCase().replace(SOURCE_MATCH_DASHES, '-').replace(/[〜～]/g, '~').replace(/\s+/g, '');
    function diffTextRuns(a, b) {

      if (a.length * b.length > 250000) return [{ kind: 'change', from: a, to: b }];
      const la = a.toLowerCase(), lb = b.toLowerCase();
      const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
      for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) {
          dp[i][j] = la[i] === lb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
      const runs = [];
      const pushOp = (kind, ch) => {
        const last = runs[runs.length - 1];
        if (last && last.kind === kind) last.text += ch; else runs.push({ kind, text: ch });
      };
      let i = 0, j = 0;
      while (i < a.length || j < b.length) {
        if (i < a.length && j < b.length && la[i] === lb[j]) { pushOp('same', b[j]); i++; j++; }
        else if (j < b.length && (i >= a.length || dp[i][j + 1] >= dp[i + 1][j])) { pushOp('add', b[j]); j++; }
        else { pushOp('del', a[i]); i++; }
      }

      const merged = [];
      runs.forEach((r, k) => {
        const between = k > 0 && k < runs.length - 1 && runs[k - 1].kind !== 'same' && runs[k + 1].kind !== 'same';
        if (r.kind === 'same' && between && (REWRITE_TRIVIAL_REGEX.test(r.text) || r.text.length <= 1)) {
          merged.push({ kind: 'del', text: r.text }, { kind: 'add', text: r.text });
        } else merged.push({ ...r });
      });
      const changes = [];
      let pendingDel = '', pendingAdd = '';
      const flush = () => {
        const del = pendingDel.trim(), add = pendingAdd.trim();
        const delReal = del && !REWRITE_TRIVIAL_REGEX.test(del);
        const addReal = add && !REWRITE_TRIVIAL_REGEX.test(add);
        if (delReal && addReal) changes.push({ kind: 'change', from: del, to: add });
        else if (delReal) changes.push({ kind: 'del', from: del });
        else if (addReal) changes.push({ kind: 'add', to: add });
        pendingDel = ''; pendingAdd = '';
      };
      merged.forEach(r => {
        if (r.kind === 'same') flush();
        else if (r.kind === 'del') pendingDel += r.text;
        else pendingAdd += r.text;
      });
      flush();
      return changes;
    }
    function describeAutoRewrite(sourceText, cardText, item, otherItems) {
      const ranges = sourceRangesForCard(sourceText, cardText, item);
      if (!ranges.length) return null;
      const notes = [];
      const lineStart = sourceText.lastIndexOf('\n', ranges[0][0] - 1) + 1;
      const endNl = sourceText.indexOf('\n', ranges[ranges.length - 1][1]);
      const lineEnd = endNl === -1 ? sourceText.length : endNl;
      const lines = sourceText.slice(lineStart, lineEnd).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const linesNorm = rewriteNorm(lines.join(''));
      let body = cardText.trim();

      const refMatch = body.match(/\s*[(（]基準値[:：]\s*([^)）]*)[)）]\s*$/);
      if (refMatch) {
        const ref = refMatch[1].trim();
        notes.push(linesNorm.includes(rewriteNorm(ref).replace(/\^/g, ''))
          ? `表の基準値の列「${ref}」を「(基準値: …)」として後ろに付けた`
          : `基準値「${ref}」をアプリが補った（元の文章には無い）`);
        body = body.slice(0, refMatch.index).trim();
      }

      const ts = item && item.timestamp && item.timestamp !== '日時不明' ? item.timestamp : null;
      let firstLine = lines[0] || '';
      firstLine = firstLine.replace(/^(?:[・○●◯◎□■▪▫◆◇][\s　]*)+/, '');
      if (ts) {
        const sourceTs = firstLine.normalize('NFKC').includes(ts) ? ts : (ts.match(/\d{1,2}:\d{2}$/) || [])[0];
        const tsIdx = sourceTs ? firstLine.normalize('NFKC').indexOf(sourceTs) : -1;
        if (tsIdx !== -1 && tsIdx <= 2 && !rewriteNorm(body).startsWith(rewriteNorm(sourceTs))) {
          notes.push(`行頭の「${sourceTs}」を本文から外し、日時として記録した`);
          firstLine = firstLine.normalize('NFKC').slice(tsIdx + sourceTs.length).replace(/^[\]】\s]+/, '');
        }
      }

      const cardLabel = (body.match(/^([^\d:：「」]{1,20})[:：]\s*/) || [])[1];
      const lineLabel = (firstLine.normalize('NFKC').match(/^([^\d:：「」]{1,20})[:：]\s*/) || [])[1];
      const separateHeading = cardLabel && lines.length > 1 && rewriteNorm(firstLine).replace(/[:：]$/, '') === rewriteNorm(cardLabel);
      if (separateHeading || (cardLabel && rewriteNorm(cardLabel) !== rewriteNorm(lineLabel || '') && !rewriteNorm(firstLine).startsWith(rewriteNorm(cardLabel)))) {
        notes.push(`見出し「${cardLabel.trim()}」を先頭に付けた（直前の見出し行から）`);
        body = body.replace(/^([^\d:：「」]{1,20})[:：]\s*/, '');
      }

      const lineAfterLabel = lineLabel ? firstLine.normalize('NFKC').replace(/^([^\d:：「」]{1,20})[:：]\s*/, '') : '';
      if (lineLabel && !cardLabel && !rewriteNorm(body).startsWith(rewriteNorm(lineLabel)) &&
          rewriteNorm(lineAfterLabel).startsWith(rewriteNorm(body).slice(0, 4))) {
        notes.push(`行の見出し「${lineLabel.trim()}」を本文から外した${item && item.fieldLabel ? `（[${item.fieldLabel}]として表示）` : ''}`);
        firstLine = firstLine.normalize('NFKC').replace(/^([^\d:：「」]{1,20})[:：]\s*/, '');
      }
      // A heading and a fragment on the next line do not prove that whole lines were merged.
      const bodyNorm = rewriteNorm(body);
      const bodyLine = lines.length > 1 && bodyNorm ? lines.find(l => rewriteNorm(l).includes(bodyNorm)) : null;
      if (bodyLine) firstLine = bodyLine;
      if (lines.length > 1 && !bodyLine) {
        notes.push(`元の文章の${lines.length}行（${lines.map(l => `「${l.length > 20 ? l.slice(0, 20) + '…' : l}」`).join('')}）を1枚にまとめた`);

        (body.match(/\d[\d,.]*\s*(?:×\s*10\^?\d+)?[^\s\d(（、,]*/g) || []).forEach(tok => {
          const m = tok.match(/^(\d[\d,.]*)\s*(.+)$/);
          if (!m) return;
          if (!linesNorm.includes(rewriteNorm(tok)) && linesNorm.includes(rewriteNorm(m[1]))) notes.push(`「${m[1]}」に単位「${m[2]}」を補った（同じ行の値から）`);
        });
        return notes;
      }

      const others = (otherItems || []).filter(o => o !== item && o.text).map(o => rewriteNorm(o.text));
      diffTextRuns(firstLine.normalize('NFKC').replace(SOURCE_MATCH_DASHES, '-').replace(/[〜～]/g, '~').replace(/\s+/g, ' ').trim(), body.replace(/\s+/g, ' ')).slice(0, 6).forEach(c => {
        if (c.kind === 'del') {
          const core = rewriteNorm(c.from).replace(/^[、。,.:：;；・]+|[、。,.:：;；・]+$/g, '');
          const splitOff = core.length > 0 && others.some(o => o.includes(core));
          notes.push(splitOff ? `同じ行の「${c.from}」は別のカードに分けた` : `「${c.from}」を削除`);
        } else if (c.kind === 'add') notes.push(`「${c.to}」を追加`);
        else notes.push(`「${c.from}」→「${c.to}」に変更`);
      });
      return notes;
    }
    const EDIT_LOG_TYPE_LABELS = { s: 'Sデータ', o: 'Oデータ', unclassified: '未分類', unnecessary: '不必要な情報' };
    const tagNamesForLog = ids => (Array.isArray(ids) && ids.length ? ids.map(h => `${h}.${hendersonNameOf(h).replace(/^\d+\.\s*/, '')}`).join('・') : 'なし');
    function formatEditLogEntry(e) {
      const when = e.at ? new Date(e.at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      const body = (() => {
        switch (e.kind) {
          case 'text': return `本文を編集: 「${e.from}」→「${e.to}」`;
          case 'type': return `分類を変更: ${EDIT_LOG_TYPE_LABELS[e.from] || e.from || '未設定'} → ${EDIT_LOG_TYPE_LABELS[e.to] || e.to}`;
          case 'tagAdd': return `タグを追加: ${hendersonNameOf(e.hId)}`;
          case 'tagRemove': return `タグを削除: ${hendersonNameOf(e.hId)}`;
          case 'split': return `カードを分割: 「${e.from}」→${(e.parts || []).map(t => `「${t}」`).join(' ／ ')}（このカード: 「${e.to}」）`;
          case 'merge': return `${(e.from || []).length}枚のカードを統合: ${(e.from || []).map(t => `「${t}」`).join('＋')}`;

          case 'aiReviewTags': return `AIの評価でタグを変更: ${tagNamesForLog(e.from)} → ${tagNamesForLog(e.to)}`;
          case 'aiReviewTimestamp': return `AIの評価で日時を変更: ${e.from || '日時不明'} → ${e.to || '日時不明'}`;
          case 'aiReviewType': return `AIの評価で分類を変更: ${EDIT_LOG_TYPE_LABELS[e.from] || e.from || '未設定'} → ${EDIT_LOG_TYPE_LABELS[e.to] || e.to}`;
          case 'aiReview': return Array.isArray(e.from) && e.from.length ? `AIの評価で作り直したカード（元: ${e.from.map(t => `「${t}」`).join('＋')}）` : 'AIの評価で作ったカード';
          default: return e.kind || '不明な編集';
        }
      })();
      const reason = typeof e.reason === 'string' && e.reason.trim() ? e.reason : '理由未記録（調査してください）';
      const provenance = e.actor === 'user' ? '手編集' : e.actor === 'automatic' ? '自動処理' : '処理主体の明示記録なし';
      const links = Array.isArray(e.sourceCards) ? `／元カード・履歴: ${JSON.stringify(e.sourceCards)}` : '';
      const results = Array.isArray(e.resultIds) ? `／変更後カードID: ${e.resultIds.join('・')}` : '';
      return `${when ? when + ' ' : ''}${body}／処理主体: ${provenance}／編集理由: ${reason}${e.ruleId ? `／処理ルール: ${e.ruleId}` : ''}${links}${results}`;
    }

    function buildCardsReportText(cp, items, sourceText, headline, includeSourceText = true, assessmentText = null, instructions = '') {
      const replayed = items.some(i => !i.ruleDecision) ? classifyTextByRules(sourceText) : [];
      let out = `${headline}\n`;
      out += `出力日時: ${new Date().toLocaleString('ja-JP')}\n`;
      out += instructions ? 'Auto rewrite compares source/card text; manual history records UI edits since 2026-09-27.\n' : `※「アプリによる書き換え」は元の文章とカードの文章の違い、「手で編集した履歴」は画面上で行った編集です（手での編集の記録は2026/9/27の機能追加以降の分のみ）。\n`;
      out += instructions;
      items.forEach((i, idx) => {
        const tags = (i.hendersonIds || []).map(hendersonNameOf).join('、');
        const meta = [
          `分類: ${SELECTED_EXPORT_TYPE_LABELS[i.type] || i.type || '未分類'}`,
          `日時: ${i.timestamp || '日時不明'}`,
          i.fieldLabel ? `見出し: ${i.fieldLabel}` : null,
          `タグ: ${tags || (typeof isBasicInfoItem === 'function' && isBasicInfoItem(i) ? '基礎情報（14項目外）' : 'なし')}`
        ].filter(Boolean).join(' ／ ');
        const excerpt = sourceExcerptForCard(sourceText, i.text, i);
        out += `\n■ ${idx + 1}件目\n`;
        out += `${meta}\n`;
        out += `カードID: ${i.id || '記録なし'}／保存済みの分類経路: ${i.predictionSource || '記録なし'}\n`;
        const review = typeof untaggedReviewOf === 'function' ? untaggedReviewOf(cp, i) : null;
        if (review) out += `保存済みのレビュー判断: ${review.decision}／理由: ${review.note || '理由未記録（調査してください）'}\n`;
        out += i.ruleDecision ? `自動処理の理由・ルール: ${i.ruleDecision.reason}／ルール: ${i.ruleDecision.ruleId}／版: ${i.ruleDecision.version}\n` : i.ruleCorrectionReason ? `自動処理の理由・ルール: ${i.ruleCorrectionReason}\n` : '自動処理の理由・ルール: 記録なし（差分や分類経路だけでは原因を断定できません。原文で再現して調査してください）\n';
        if (!i.ruleDecision) {
          const current = currentRuleCardForSavedItem(replayed, i);
          if (current?.ruleDecision) out += `現在のルールによる再照合（過去の実行理由とは別）: ${current.ruleDecision.reason}／ルール: ${current.ruleDecision.ruleId}\n`;
        }
        out += `カードの内容: ${i.text}\n`;
        if (Array.isArray(i.contextTagEvidence) && i.contextTagEvidence.length) {
          out += `タグを付けた根拠（原文の文脈）:\n${i.contextTagEvidence.map(e => `  ・${hendersonNameOf(e.id)}：［${e.timestamp}］${e.evidence}`).join('\n')}\n`;
        }
        out += `元の文章: ${excerpt || '（元の文章の中に見つかりませんでした）'}\n`;
        const edits = Array.isArray(i.editLog) ? i.editLog : [];

        const firstTextEdit = edits.find(e => ['text', 'split'].includes(e.kind) && typeof e.from === 'string');
        const textBeforeManualEdits = firstTextEdit ? firstTextEdit.from : i.text;
        const rewrite = describeAutoRewrite(sourceText, textBeforeManualEdits, { ...i, text: textBeforeManualEdits }, cp.items || []);
        out += '書き換えの判定方法: 原文との比較による推定（実行時の処理記録ではありません）\n';
        if (rewrite) out += `アプリによる書き換え: ${rewrite.length ? rewrite.join('、') : 'なし（元の文章のまま）'}\n`;
        if (edits.length) {
          out += `手で編集した履歴:\n`;
          edits.forEach(e => { out += `  ・${formatEditLogEntry(e)}\n`; });
        } else {
          out += `手で編集した履歴: なし\n`;
        }
        out += `修正してほしい内容: ${i.requestedCorrection || (i.correctionRequested ? '原文・前後の記録と分類結果を照合し、このカードを調査してください。' : '')}\n`;
      });
      if (assessmentText !== null) {
        out += `\n【総合アセスメント表（選択したカードのみ）】\n`;
        out += assessmentText || '（選択したカードは総合アセスメント表にありません）\n';
      }
      if (includeSourceText) {
        out += `\n【分類前の文章（カルテ・看護記録入力欄）】\n`;
        out += (sourceText && sourceText.trim()) ? `${sourceText.trim()}\n` : '（入力欄に文章がありません）\n';
      }
      return out;
    }
    function buildPatientBackupData(now = new Date().toISOString()) {
      return { schemaVersion: 1, exportedAt: now, patients: globalAppData.patients,
        currentPatientId: globalAppData.currentPatientId, learningUserDict: globalAppData.learningUserDict };
    }
    // Background factors the app already holds as labelled cards (field label → value), names masked, for comparison with the source.
    const BACKGROUND_FACTOR_LABELS = new Set(['年齢', '性別', '職業', '家族構成', '家族関係', '家族歴', '同居者', '既往歴', '現病歴', '生活歴', '喫煙', '飲酒', '食習慣', 'アレルギー', '内服薬', '常用薬', '入院の経緯', '入院目的', '診断名', '病名', 'ADL', '社会資源', '保険', '学歴']);
    // v.90: background factors written without a field label (職業・飲酒・喫煙・運動・食習慣・同居) are named by their words, for pre-admission/undated cards only.
    const BACKGROUND_FACTOR_WORDS = [['職業', /営業職|事務職|会社員|職業|外回り|自営|農業|主婦|無職|教員|看護師として|勤務(?:先|形態)|仕事(?:は|が|を)/], ['飲酒', /飲酒|アルコール|晩酌|お酒|ビール|日本酒/], ['喫煙', /喫煙|タバコ|煙草|ブリンクマン/], ['運動', /運動(?:習慣|は|を)|ウォーキング|スポーツ習慣/], ['食習慣', /食習慣|間食|外食|早食い|偏食|甘いもの/], ['同居・家族', /(?:妻|夫|子|娘|息子|母|父)と(?:二人|2人|同居|暮らし)|独居|一人暮らし|二人暮らし|同居/]];
    function backgroundFactorName(i) {
      if (i.fieldLabel && BACKGROUND_FACTOR_LABELS.has(i.fieldLabel)) return i.fieldLabel;
      if (i.fieldLabel || !/^(?:入院前|日時不明)$/.test(String(i.timestamp || '日時不明'))) return '';
      const t = String(i.text || '').normalize('NFKC');
      const names = BACKGROUND_FACTOR_WORDS.filter(([, re]) => re.test(t)).map(([n]) => n);
      return names.length ? `生活歴（${names.join('・')}）` : '';
    }
    function backgroundFactorsText(cp) {
      const rows = ((cp && cp.items) || []).filter(i => i && !i.deleted && i.type !== 'unnecessary' && String(i.text || '').trim() && backgroundFactorName(i));
      if (!rows.length) return '';
      const mask = t => typeof krDeidentify === 'function' ? krDeidentify(t, cp, 80) : String(t).slice(0, 80);
      const kind = i => typeof classifyPatientBackground === 'function' ? classifyPatientBackground(backgroundFactorName(i).replace(/（.*）$/, '')) : '';
      return '\n【アプリが抽出済みの患者背景の因子】項目名 → 内容｜保存済みの区分｜付いているタグ（原文と比べて、足りない因子・区分やタグの誤りを確認してください。氏名は含めません）\n' +
        rows.map(i => `  ・${backgroundFactorName(i)} → ${mask(i.text)}｜${i.patientBackground || kind(i)}｜${(i.hendersonIds || []).length ? (i.hendersonIds || []).join('・') : 'タグなし'}`).join('\n') + '\n';
    }
    // The app's current sufficiency judgments, in the existing exported wording (sufficiencyPhaseText), with evidence references and missing-information items.
    // v.96: sentences of the original record (分類前文章) that bear on a need but are not cited as evidence in that need/phase verdict.
    // Developer-facing candidates for new generic criteria; shown as separate lines, never inside the verdict sentence.
    function sufficiencySourceCandidates(cp, limits) {
      const out = { byKey: new Map(), omitted: 0 };
      const src = String((cp && cp.sourceText) || '');
      if (!src.trim() || typeof sufficiencyUiPhases !== 'function' || typeof ruleSufficiencyFor !== 'function') return out;
      const perNeed = (limits && limits.perNeed) || 5, total = (limits && limits.total) || 40;
      const nz = x => String(x || '').normalize('NFKC').replace(/\s+/g, '');
      const sentences = src.split(/\r?\n/).flatMap(l => l.split(/(?<=。)/)).map(s => s.trim()).filter(s => s.length >= 6
        && !/^[＜<【\[].*[＞>】\]]$/.test(s) && !(typeof isDateOnlyText === 'function' && isDateOnlyText(s)) && !(typeof isSourceStructureText === 'function' && isSourceStructureText(s)));
      const items = ((cp.items) || []).filter(i => i && !i.deleted && i.type !== 'unnecessary');
      const phases = sufficiencyUiPhases(cp), phaseKeys = phases.map(p => p.key);
      const surgical = typeof isSurgicalPatient === 'function' && isSurgicalPatient(cp);
      const res = ruleSufficiencyFor(cp);
      const phaseOfItem = i => {
        const pre = /^入院前/.test(String(i.timestamp || '')) || (Object.values(i.assessmentCols || {}).length > 0 && Object.values(i.assessmentCols).every(c => c === 'preadmission'));
        if (pre) return 'pre';
        if (surgical && typeof surgPhaseOf === 'function') { const sp = surgPhaseOf(i, cp); if (sp === 'pre') return 'preop'; if (sp === 'post' || sp === 'op') return 'postop'; }
        return 'post';
      };
      let used = 0;
      const seen = new Set();
      sentences.forEach(s0 => {
        // leading clock times / bullet marks are record layout, not content
        const s = s0.replace(/^(?:\d{1,2}\s*[:：]\s*\d{2}\s*|[〇○◯・●■◆▶\-－]\s*)+/, '').trim();
        if (s.length < 6) return;
        const sn = nz(s);
        if (seen.has(sn)) return; seen.add(sn);
        const card = items.find(i => { const t = nz(i.text); return t.length >= 6 && (t.includes(sn) || sn.includes(t)); });
        let phase = card ? phaseOfItem(card) : (/^(?:入院前|半年前|以前)/.test(s) ? 'pre' : 'post');
        if (!phaseKeys.includes(phase)) phase = phaseKeys.includes('post') ? 'post' : phaseKeys[phaseKeys.length - 1];
        // needs the sentence bears on: criteria that exist (cue tables, scales, labs, symptoms) or the classification helpers
        const cue = new Set(), cueDir = new Map();
        const addCue = (need, v) => { cue.add(need); (cueDir.get(need) || cueDir.set(need, new Set()).get(need)).add(v || ''); };
        const addAll = list => list.forEach(r => { if (r && r.need) addCue(r.need, r.v); });
        try { addAll(sufficiencyPerNeedRules(s)); addAll(sufficiencyScoreRules(s)); addAll(sufficiencyScaleRules(s)); addAll(sufficiencyLabRules(s)); } catch (e) { /* ignore */ }
        let tags = [];
        try { tags = Array.from(detectMultipleHendersonTags(s)); } catch (e) { tags = []; }
        const cardTags = new Set(card ? Array.from(card.hendersonIds || []) : []);
        // clause cues are broad words (自立 / 痛み ...): count them only for needs the sentence is actually tagged with
        HENDERSON_NEEDS.filter(n => cardTags.has(n.id) || tags.includes(n.id)).forEach(n => { try { const parts = s.normalize('NFKC').split(/[。\n、,，]/).map(x => x.trim()).filter(Boolean); parts.forEach(p => { const v = sufficiencyClauseVerdict(p, n.id, { speech: /[「」]/.test(s) }); if (v && (v.v === 'unmet' || v.v === 'met')) addCue(n.id, v.v); }); } catch (e) { /* ignore */ } });
        if (typeof DISEASE_SYMPTOM_NEEDS !== 'undefined') DISEASE_SYMPTOM_NEEDS.forEach(([re, ids]) => { if (re.test(s.normalize('NFKC'))) ids.forEach(id => addCue(id, 'partial')); });
        // the same sentence is listed only under its best-matching need(s): cue + the card's own tag > cue > tag the card also has > other tag
        const score = nid => (cue.has(nid) ? 2 : 0) + (cardTags.has(nid) ? 1 : 0);
        const ranked = Array.from(new Set([...cue, ...tags])).sort((a, b) => score(b) - score(a) || a - b);
        const top = ranked.length ? score(ranked[0]) : 0;
        const needs = ranked.filter(n => score(n) === top).slice(0, top === 0 ? 1 : 2);
        needs.sort((a, b) => a - b).forEach(nid => {
          const r = res[nid]; if (!r) return;
          const a = r[phase] || {};
          const cited = (a.evidence || []).some(id => { const it = items.find(x => x.id === id); const t = it ? nz(it.text) : ''; return t.length >= 6 && (t.includes(sn) || sn.includes(t)); });
          if (cited) return;
          // a recorded cue that points the same way as the verdict is just more support, not a gap
          const dirs = cueDir.get(nid);
          if (dirs && ((a.verdict === 'met' && dirs.has('met')) || (a.verdict === 'unmet' && (dirs.has('unmet') || dirs.has('partial'))))) return;
          const state = a.verdict === 'unknown' || !a.verdict ? '原文に記載あり（判定に未反映）' : (cue.has(nid) ? '判定に未使用' : '基準に未登録');
          const key = `${nid}|${phase}`;
          const list = out.byKey.get(key) || [];
          if (list.length >= perNeed || used >= total) { out.omitted++; return; }
          const need = HENDERSON_NEEDS.find(n => n.id === nid);
          list.push({ text: s.length > 60 ? s.slice(0, 60) + '…' : s, need: `${nid}. ${need ? need.name.replace(/^\d+\.\s*/, '') : ''}`, state });
          out.byKey.set(key, list); used++;
        });
      });
      return out;
    }
    function sufficiencyCandidateLines(cand, needId, phaseKey, mask) {
      return ((cand.byKey.get(`${needId}|${phaseKey}`)) || []).map(c => `　　・分類前文章の未使用記録（判断基準の追加候補）：${mask(c.text)}｜関係しそうな欲求：${c.need}｜状態：${c.state}`);
    }
    // v.98: drug extraction for the 修正依頼 (names masked; the dictionary is unreviewed, so the developer is asked to verify it).
    function drugCorrectionText(cp) {
      if (!cp || typeof drugOverview !== 'function') return '';
      const names = typeof krNames === 'function' ? krNames(cp) : [];
      const mask = t => names.reduce((acc, n) => acc.split(n).join('(患者)'), String(t));
      const body = drugInfoSectionText(cp, mask);
      if (!body) return '';
      const rows = [];
      ((cp.items) || []).filter(i => i && !i.deleted && i.type !== 'unnecessary').forEach(i => drugsOfItem(i).forEach(d => { if (rows.length < 30) rows.push(`　・${mask(drugLineText(d))}｜原文：${mask(String(d.raw).slice(0, 40))}`); }));
      return '【薬剤の情報（薬剤の抽出と正規化の確認）】\n'
        + 'Developer instruction: verify the drug extraction and brand-to-generic normalisation below against the source record (dose, route, frequency, timing, status), list every word under 未登録薬剤候補 that is a real drug, and add it to the drug dictionary with generic name, class, needs and observation points. The dictionary is built in and has not been clinically reviewed: do not add dosing advice, and do not rewrite the record text.\n'
        + body + (rows.length ? '【カードごとの抽出結果】\n' + rows.join('\n') + '\n' : '') + '\n';
    }
    function sufficiencyJudgmentsText(cp) {
      if (!cp || typeof sufficiencyPhaseText !== 'function' || typeof sufficiencyHasVerdict !== 'function' || typeof sufficiencyUiPhases !== 'function') return '';
      // Only patient names are masked; the sentences themselves must stay exactly as the app shows them (no normalisation).
      const names = typeof krNames === 'function' ? krNames(cp) : [];
      const mask = t => names.reduce((acc, n) => acc.split(n).join('(患者)'), String(t));
      const lines = [], allUnknown = [], unknownChecks = [];
      let cand = { byKey: new Map(), omitted: 0 };
      try { cand = sufficiencySourceCandidates(cp); } catch (e) { cand = { byKey: new Map(), omitted: 0 }; }
      HENDERSON_NEEDS.forEach(need => {
        if (!sufficiencyHasVerdict(cp, need.id)) return;
        const missingItems = (cp.items || []).filter(i => i && !i.deleted && i.type !== 'unnecessary' && (i.hendersonIds || []).includes(need.id) && (i.assessmentCols || {})[need.id] === 'missing' && String(i.text || '').trim());
        if (!missingItems.length && sufficiencyUiPhases(cp).every(ph => (typeof phaseVerdictOf === 'function' ? phaseVerdictOf(cp, need.id, ph.key) : '') === 'unknown')) { allUnknown.push(need.id); const kc = typeof sufficiencyKnowledgeChecks === 'function' ? sufficiencyKnowledgeChecks(cp, need.id) : []; if (kc.length) unknownChecks.push(`  ・${need.id}. ${need.name.replace(/^\d+\.\s*/, '')}｜知識の利用：確認したい情報（${kc[0].label}）＝${kc[0].points.join('・')}`); const cl = sufficiencyUiPhases(cp).flatMap(ph => sufficiencyCandidateLines(cand, need.id, ph.key, mask).map(l => `${l}（${ph.label}）`)); if (cl.length) { unknownChecks.push(`  ■ ${need.id}. ${need.name.replace(/^\d+\.\s*/, '')}（記録なし・情報不足）`); cl.forEach(l => unknownChecks.push(l)); } return; }
        const labels = typeof myEvidenceLabels === 'function' ? myEvidenceLabels(cp, need.id) : {};
        const r = typeof ruleSufficiencyFor === 'function' ? (ruleSufficiencyFor(cp)[need.id] || {}) : {};
        lines.push(`  ■ ${need.id}. ${need.name.replace(/^\d+\.\s*/, '')}`);
        sufficiencyUiPhases(cp).forEach(ph => {
          const text = sufficiencyPhaseText(cp, need.id, ph.key);
          if (!text) return;
          const refs = Array.from(new Set(((r[ph.key] || {}).evidence || []).map(id => (labels[id] || '').match(/^[SO]-\d+/)?.[0]).filter(Boolean)));
          lines.push(`    ・${ph.label}｜${mask(text)}${refs.length ? `｜根拠カード：${refs.join('・')}` : ''}`);
          const ph0 = r[ph.key] || {};
          if (ph0.verdict === 'unmet' && typeof sufficiencyCauseHint === 'function') {
            const byId = new Map((cp.items || []).map(i => [i.id, i]));
            const hint = sufficiencyCauseHint((ph0.evidence || []).map(id => (byId.get(id) || {}).text || '').join(' '));
            if (hint.length) lines.push(`      原因のヒント（参考）：${hint.join('／')}の不足の可能性`);
          }
          if (ph0.refStandard) lines.push(`      参考基準：${ph0.refStandard}`);
          if (typeof sufficiencyKnowledgeLine === 'function') { const kl = sufficiencyKnowledgeLine(cp, need.id, ph.key); if (kl) lines.push(`      知識の利用：${mask(kl)}`); }
          sufficiencyCandidateLines(cand, need.id, ph.key, mask).forEach(l => lines.push(l));
        });
        missingItems.forEach(i => lines.push(`    ・不足情報／確認したい情報：${mask(i.text)}`));
      });
      if (allUnknown.length) lines.push(`  ・記録がなく、すべての時期が情報不足の項目：${allUnknown.join('・')}`);
      unknownChecks.forEach(l => lines.push(mask(l)));
      if (cand.omitted) lines.push(`　　・分類前文章の未使用記録：他${cand.omitted}件省略`);
      return lines.length ? '\n【アプリの充足状態の判定】項目ごと・時期ごとの現在の判定と理由（アプリの表示・書き出しと同じ文章）、根拠カード、不足情報（原文と比べて、判定の妥当性を評価してください。氏名は含めません）\n' + lines.join('\n') + '\n' : '';
    }
    function correctionRequestInstructionsText() {
      return [
        "",
        "[Developer instructions]",
        "原文・前後の記録・編集履歴を照合し、なぜカードが分割・統合されたのか、なぜタグが付与・除外されたのかを調査してください。アプリの自動処理と利用者の手編集を区別し、該当する処理を原文で再現して原因を確認してください。意図した処理か不具合かを判断し、根拠・原因・修正方針を示してください。確認できない理由は推測で断定せず『確認不能』としてください。特定の患者だけに合わせず、同じ種類の記録にも適用できる規則として修正してください。",
        "",
        "【依頼対象：サイトのコード修正】",
        "この依頼は、添付シートやカードの文章を訂正して返す作業ではありません。サイトのコードを修正し、次回の分類・判定・表示・書き出しで同じ問題が再発しないようにしてください。添付資料は再現用の検証資料です。",
        "",
        "0. Generalize: the attached case is only a reproduction sample, never the criterion. Do not hard-code patient names, case wording, exact values, dates or device names into rules; write conditions that apply to any patient and test them with the sample plus counterexamples from other situations (planned/performed/cancelled, present/removed/uncertain, resting/movement, before/after). Do not copy this case into the notebook or tests as the rule; use short generic examples. Remove any existing rule that only matches one case's wording.",
        "1. Reproduce: compare source, surrounding records, saved cards and edit history; separate automatic processing from manual edits; trace splits/merges, tag changes, dates and output defects to the responsible code. Explicit split/merge records show actions, not proof of their justification. Mark missing evidence 『理由未記録』/『確認不能』; never invent causes or clinical facts.",
        "2. Implement: fix the actual extraction (js/03), classification (js/01, js/07), sufficiency (js/11), export (js/06) and saved-data/learning paths. Rewriting a sample report, prompt or one patient is not completion. Keep Japanese clinical text intact; classify Henderson needs by meaning, not S/O; assess pre/post admission separately; classification stays local (AI is OCR only).",
        "3. Generalize: apply confirmed rules to similar records (including normal/negative findings and chronology). When criteria change, update 学習データ管理 → 分類基準 and the js/02 notebook with conditions, positive examples and counterexamples, remove conflicting rules and advance the criteria version.",
        "【タグ未設定】抽出・原文対応・S/O・ヘンダーソンの意味・時期・否定や正常所見・前後の記録・本人と家族・手編集履歴の観点で調査し、根拠が確認できた分類漏れをコードで修正してください。付与可能・タグ不要・確認待ちを区別し、一般則を分類処理と分類基準に反映してください。",
        "【患者背景の因子】",
        "B. Background factors: also extract the PATIENT BACKGROUND FACTORS from the source record (年齢・性別・職業・家族構成・同居者・既往歴・生活歴（喫煙・飲酒・食習慣）・アレルギー・内服薬・入院の経緯／現病歴・ADL・社会資源 etc.) and check that each factor written in the source is captured as a card or field, with the right 基本情報／医学情報 classification (classifyPatientBackground) and, where appropriate, Henderson tags by meaning. List every factor that is missing or misclassified together with its source line. Do not infer factors that are not written; compare with the 「アプリが抽出済みの患者背景の因子」 list below when it is present; keep name masking intact.",
        "",
        "【充足・未充足の評価】",
        "C. Sufficiency evaluation: also EVALUATE the app's sufficiency judgments (充足 / 未充足 / 判定保留 / 情報不足) per Henderson need and per phase (入院前／入院後), listed under 「アプリの充足状態の判定」 below, against the source record and the surrounding cards. For each verdict check: is it supported by the source; is any evidence card missing or wrongly used; is each 不足情報／確認したい情報 item truly missing in the source. Where a verdict is wrong, state the generic rule change that fixes it (no case-specific wording). Do not invent facts; write 確認不能 where the evidence is absent. Do not reword the existing sufficiency sentences. Also review the 分類前文章-based candidates listed under each phase (「分類前文章の未使用記録（判断基準の追加候補）」) and add generic judgment criteria (cue words / values / scales) for 基準に未登録 items and fix the tagging for 判定に未使用 items; judgments must still end with a definite verdict (…充足している／未充足である／判定保留／情報不足), the sentence wording must not be changed except per the user's rule, and no patient-specific wording may be added. Judgments are comprehensive per phase (入院前／入院後, and 術前／術後 for surgical patients): all recorded findings of that phase are weighed together, the wording is chosen to fit the evidence (e.g. 「<所見・数値>は〜であるが、<補う記録>なので…」 for compensated mixed evidence, a plain 「〜のため…」 for one-sided evidence, what to confirm for 判定保留), and the sentence always ends with a definite verdict (充足している／未充足である／判定保留／情報不足) that matches the label — check that a problematic value is only outweighed by a recorded compensating fact, and that a normal value does not hide a recorded problem. Check that each 充足 verdict shows a recorded basis (a value or an observation; 'no problem' without evidence is 情報不足), and for each 未充足 give a cause hint (体力 / 意思力 / 知識 shortfall) and keep the need-specific judgment (ADL independence does not make self-management 充足). Do not evaluate goal deadlines or evaluation start points (「〇日後までに」「起点」 etc.); judge only sufficiency of information.",
        "",
        "4. Preserve: repair untouched automatic saved cards without replacing IDs, source text, S/O, assessments or care plans. Preserve manual edits, learned decisions and approved『タグ不要』/『理由を了承』decisions; a correction request may challenge them, but never overwrite silently.",
        "5. Verify: test fresh classification, existing saved data after reload and append classification with duplicate records, plus displayed judgments and exported text, on the actual corrected code. Use the attached failure and positive/counterexamples; never derive expected answers from app output or hide failures. Check stale saved results, learning and asset/cache versions.",
        "6. Finish: report changed files, cause, before/after behavior, tests and unresolved ambiguities. If publication is authorized, push the tested commit to GitHub and verify the deployed code; do not claim completion from local-only edits or unverified deployment.",
        ""
      ].join('\n');
    }
    function buildSelectedCardsExportText(cp, selectedIds, sourceText, includeSourceText = true, includeAssessment = false) {
      const ids = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
      const items = (cp.items || []).filter(i => ids.has(i.id));
      return buildCardsReportText(cp, items, sourceText, `修正依頼メモ：${cp.title}（選択したカード ${items.length}件）`, includeSourceText,
        includeAssessment ? buildAssessmentTableText(cp, ids) : null, correctionRequestInstructionsText() + backgroundFactorsText(cp) + sufficiencyJudgmentsText(cp) + drugCorrectionText(cp));
    }

    function assessmentPeriodGroups(cp, col, list) {
      const surg = typeof isSurgicalPatient === 'function' && isSurgicalPatient(cp);
      if (col === 'preadmission') return [{ label: '', items: list, judge: [['pre', '入院前']] }];
      if (col !== 'postadmission') return [{ label: '', items: list, judge: [] }];
      if (!surg) return [{ label: '', items: list, judge: [['post', '入院後']] }];
      const by = k => list.filter(i => surgPhaseOf(i, cp) === k);
      const groups = [];
      const rest = list.filter(i => !surgPhaseOf(i, cp));
      if (rest.length) groups.push({ label: '時期未確認', items: rest, judge: [] });
      groups.push({ label: '術前', items: by('pre'), judge: [['preop', '術前']] });
      if (by('op').length) groups.push({ label: '手術当日', items: by('op'), judge: [] });
      groups.push({ label: '術後', items: by('post'), judge: [['postop', '術後']] });
      return groups;
    }
    function periodJudgeText(cp, needId, key, label) {
      if (typeof sufficiencyPhaseText !== 'function') return '';
      const x = sufficiencyPhaseText(cp, needId, key);
      if (!x) return '';
      const m = x.match(/^判定：(.*?)／判定根拠：([\s\S]*)$/);
      const dims = typeof sufficiencyDimensionLines === 'function' ? sufficiencyDimensionLines(cp, needId, key).map(l => `      ・${l}\n`).join('') : '';
      return (m ? `    ▶${label}の判定：${m[1]}\n    ▶説明：${m[2]}\n` : `    ▶${label}の判定：${x}\n`) + dims;
    }
    const ASSESSMENT_COL_ORDER = [['unclassified', '未分類'], ['preadmission', '入院前'], ['postadmission', '入院後'], ['missing', '不足情報']];
    // Display/export only: vital-sign cards of the same tag, period and day become ONE card.
    // Each vital is written in one regular form: "name first→last unit（time→time）", so changes read left to right.
    const VITAL_NAME_MAP = [[/^(?:体温|BT|KT|T)$/i, '体温', 0], [/^(?:血圧|BP)$/i, '血圧', 1], [/^(?:脈拍|心拍数?|HR|P)$/i, '脈拍', 2], [/^(?:呼吸数?|RR|R)$/i, '呼吸数', 3], [/^(?:SpO2|SPO2|Spo2|SpO₂|酸素飽和度)$/i, 'SpO2', 4]];
    function parseVitalPart(part, time) {
      const m = String(part).trim().match(/^(体温|血圧|脈拍|心拍数?|呼吸数?|酸素飽和度|SpO2|SPO2|Spo2|SpO₂|HR|BP|RR|BT|KT|T|P|R)\s*[:：]?\s*(\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?)\s*(mmHg|回\/分|分|度|°C|℃|%|％|bpm)?\s*([(（][^)）]*[)）])?\s*$/i);
      if (!m) return null;
      const def = VITAL_NAME_MAP.find(d => d[0].test(m[1]));
      if (!def) return null;
      return { name: def[1], order: def[2], v: m[2], unit: (m[3] || '').replace('度', '°C').replace('℃', '°C').replace('％', '%'), note: (m[4] || '').replace(/[（]/, '(').replace(/[）]/, ')'), time };
    }
    function formatVitalSeries(cards, timeOf) {
      const series = new Map(); const rest = [];
      cards.forEach(c => String(c.text).split(/、(?![^(（]*[)）])/).map(s => s.replace(/[。\s]+$/, '')).filter(Boolean).forEach(part => {
        const v = parseVitalPart(part, timeOf(c));
        if (!v) { const s = `${timeOf(c) ? `[${timeOf(c)}] ` : ''}${part}`; if (!rest.includes(s)) rest.push(s); return; }
        if (!series.has(v.name)) series.set(v.name, { order: v.order, pts: [] });
        const pts = series.get(v.name).pts;
        if (!pts.some(p => p.v === v.v && p.time === v.time && p.note === v.note)) pts.push(v);
      }));
      const out = [...series.entries()].sort((a, b) => a[1].order - b[1].order).map(([name, s]) => {
        const pts = s.pts;
        const sameUnit = pts.every(p => p.unit === pts[0].unit) && pts.every(p => !p.note);
        const vals = sameUnit ? pts.map(p => p.v).join('→') + pts[0].unit : pts.map(p => `${p.v}${p.unit}${p.note}`).join('→');
        const times = pts.map(p => p.time).filter(Boolean);
        return `${name} ${vals}${times.length ? `（${times.join('→')}）` : ''}`;
      });
      return [...out, ...rest].join('／');
    }
    function isVitalOnlyCard(i) {
      const t = String((i && i.text) || '').trim();
      return !!i && i.type === 'o' && !i.fieldLabel && !i.aiSuggested && typeof VITAL_SIGN_CARD_REGEX !== 'undefined' && VITAL_SIGN_CARD_REGEX.test(t) && !/[。「」]/.test(t);
    }
    function collapseVitalCards(list, needId) {
      const dayOf = i => String(i.timestamp || '').replace(/\s*\d{1,2}[:：]\d{2}.*$/, '');
      const timeOf = i => (String(i.timestamp || '').match(/(\d{1,2}[:：]\d{2})/) || [])[1] || '';
      const groups = new Map();
      list.forEach((i, idx) => { if (isVitalOnlyCard(i)) { const k = `${(i.assessmentCols && i.assessmentCols[needId]) || ''}|${dayOf(i)}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(idx); } });
      const drop = new Set(), repl = new Map();
      groups.forEach(idxs => {
        if (idxs.length < 2) return;
        const cards = idxs.map(k => list[k]);
        repl.set(idxs[0], { ...cards[0], text: formatVitalSeries(cards, timeOf), _mergedIds: cards.map(c => c.id) });
        idxs.slice(1).forEach(k => drop.add(k));
      });
      return list.map((i, idx) => repl.get(idx) || i).filter((_, idx) => !drop.has(idx));
    }
    // Display/export only: the same lab item recorded at several times (same tag and period column) is written once as
    // "name first→...→last unit（time→...→time）（基準値）" so changes read left to right. Items with different units are never merged.
    const LAB_SERIES_REGEX = /^([A-Za-zα-ωΑ-Ω][A-Za-z0-9α-ωΑ-Ω\-]{0,9}|[ぁ-んァ-ヶー一-龥]{1,8})\s+(-?\d[\d,]*(?:\.\d+)?)\s*([^\s(（]*)\s*(?:[(（]基準値[:：]\s*([^)）]*)[)）])?\s*$/;
    function collapseLabCards(list, needId) {
      const groups = new Map();
      list.forEach((i, idx) => {
        const t = String((i && i.text) || '').trim();
        if (!i || i.type !== 'o' || i.fieldLabel || i.aiSuggested || /[。「」]/.test(t) || (typeof VITAL_SIGN_CARD_REGEX !== 'undefined' && VITAL_SIGN_CARD_REGEX.test(t))) return;
        const m = t.match(LAB_SERIES_REGEX);
        if (!m || !(typeof LAB_GROUP_DEFS !== 'undefined' && LAB_GROUP_DEFS.some(([, re]) => re.test(m[1])))) return;
        const key = `${m[1].toUpperCase()}|${m[3]}|${(i.assessmentCols && i.assessmentCols[needId]) || ''}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ idx, name: m[1], v: m[2], unit: m[3], ref: m[4] || '', ts: i.timestamp && i.timestamp !== '日時不明' ? i.timestamp : '' });
      });
      const drop = new Set(), repl = new Map();
      groups.forEach(pts => {
        if (pts.length < 2) return;
        const refs = [...new Set(pts.map(p => p.ref).filter(Boolean))];
        const times = pts.map(p => p.ts).filter(Boolean);
        const text = `${pts[0].name} ${pts.map(p => p.v).join('→')}${pts[0].unit ? ` ${pts[0].unit}` : ''}${times.length ? `（${times.join('→')}）` : ''}${refs.length ? `（基準値: ${refs.join(' / ')}）` : ''}`;
        repl.set(pts[0].idx, { ...list[pts[0].idx], text, _mergedIds: pts.map(p => list[p.idx].id) });
        pts.slice(1).forEach(p => drop.add(p.idx));
      });
      return list.map((i, idx) => repl.get(idx) || i).filter((_, idx) => !drop.has(idx));
    }
    function buildAssessmentTableText(cp, onlyIds = null) {
      if (!onlyIds) cp = { ...cp, items: sheetRecordItems(cp) };
      const activeItems = (cp.items || []).filter(i => i.type !== 'unnecessary');
      const include = i => !onlyIds || onlyIds.has(i.id);
      let out = '';
      HENDERSON_NEEDS.forEach(need => {
        const matching = activeItems.filter(i => i.hendersonIds?.includes(need.id));
        const seqLabels = assessmentSeqLabels(matching, need.id);
        const shown = matching.filter(include);
        if (onlyIds && shown.length === 0) return;
        out += `\n■ ${need.id}. ${need.name.replace(/^\d+\.\s*/, '')}\n`;

        if (shown.length === 0) { out += '  （カードなし）\n'; return; }
        ASSESSMENT_COL_ORDER.forEach(([col, label]) => {
          const inCol = collapseLabCards(shown.filter(i => (i.assessmentCols?.[need.id] || 'unclassified') === col), need.id);
          if (inCol.length === 0) return;
          out += `  [${label}]\n`;
          assessmentPeriodGroups(cp, col, inCol).forEach(pg => {
            if (pg.label) out += `   ―${pg.label}―\n`;
            if (!pg.items.length) out += '    （記録なし）\n';
            assessmentDayGroups(col, pg.items).forEach(g => { if (g.day) out += `   〈${g.day}〉\n`; collapseVitalCards(g.items, need.id).forEach(i => {
              const seq = seqLabels[i.id] ? `${seqLabels[i.id]} ` : '';
              const time = i.timestamp && i.timestamp !== '日時不明' ? `[${i.timestamp}] ` : '';
              const label = (i.fieldLabel ? `[${i.fieldLabel}] ` : '') + (isFamilySpeech(i.text) ? '[家族] ' : '');
              out += `    ・${seq}${time}${label}${cleanSheetRecordText(i.text)}${i.aiSuggested ? '（自動推定）' : ''}\n`;
            }); });
            if (!onlyIds) pg.judge.forEach(([k, l]) => { out += periodJudgeText(cp, need.id, k, l); });
          });
        });
      });
      return out;
    }

    const EXPORT_OPTIONS_STORAGE_KEY = 'export_options_v1';
    function askExportOptions(title, allowSource = true, opts = {}) {
      return new Promise(resolve => {
        const modal = document.getElementById('modal-export-options');
        const optAssessment = document.getElementById('export-opt-assessment');
        const optSource = document.getElementById('export-opt-source');
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem(EXPORT_OPTIONS_STORAGE_KEY) || '{}') || {}; } catch (e) { saved = {}; }
        optAssessment.checked = !!saved.includeAssessment;
        optSource.checked = allowSource && !!saved.includeSourceText;
        if (optSource.closest) optSource.closest('label').hidden = !allowSource || !!opts.sectionsOnly;
        if (optAssessment.closest) optAssessment.closest('label').hidden = !!opts.sectionsOnly;
        let box = document.getElementById('export-sections-box');
        if (!box) {
          box = document.createElement('div');
          box.id = 'export-sections-box';
          box.className = 'flex flex-col gap-1 text-xs border-t border-[var(--line-soft)] pt-2';
          const actions = document.getElementById('btn-confirm-export-options').parentNode;
          actions.parentNode.insertBefore(box, actions);
        }
        box.hidden = !opts.sections;
        if (opts.sections) {
          const off = new Set(loadExportSectionsOff());
          box.innerHTML = '<div class="flex items-center justify-between"><b>書き出す項目</b><span><button type="button" class="btn btn-outline text-[11px] py-0.5" data-export-all="1">全選択</button> <button type="button" class="btn btn-outline text-[11px] py-0.5" data-export-all="0">全解除</button></span></div><div class="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1" style="max-height:38vh;overflow-y:auto;">' + EXPORT_SECTIONS.map(x => `<label class="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" data-export-section="${x.key}"${off.has(x.key) ? '' : ' checked'}><span>${escapeHtml(x.label)}</span></label>`).join('') + '</div>';
          box.querySelectorAll('[data-export-all]').forEach(b => { b.onclick = () => box.querySelectorAll('input[data-export-section]').forEach(c => { c.checked = b.getAttribute('data-export-all') === '1'; }); });
        }
        document.getElementById('export-options-title').textContent = title;
        modal.classList.remove('hidden');
        const finish = (result) => {
          modal.classList.add('hidden');
          document.getElementById('btn-confirm-export-options').onclick = null;
          document.getElementById('btn-cancel-export-options').onclick = null;
          document.getElementById('btn-close-export-options').onclick = null;
          modal.onclick = null;
          resolve(result);
        };
        document.getElementById('btn-confirm-export-options').onclick = () => {
          const result = { includeAssessment: optAssessment.checked, includeSourceText: optSource.checked };
          if (opts.sections) {
            const boxes = Array.from(box.querySelectorAll('input[data-export-section]'));
            const on = boxes.filter(c => c.checked).map(c => c.getAttribute('data-export-section'));
            if (!on.length) { showToast('書き出す項目を1つ以上選んでください', 'warn'); return; }
            saveExportSectionsOff(boxes.filter(c => !c.checked).map(c => c.getAttribute('data-export-section')));
            result.sections = exportSelectionFromKeys(on);
          }
          if (!opts.sectionsOnly) { try { localStorage.setItem(EXPORT_OPTIONS_STORAGE_KEY, JSON.stringify(result)); } catch (e) {   } }
          finish(result);
        };
        document.getElementById('btn-cancel-export-options').onclick = () => finish(null);
        document.getElementById('btn-close-export-options').onclick = () => finish(null);
        modal.onclick = e => { if (e.target === modal) finish(null); };
      });
    }
    async function chooseExportFile(filename) {
      if (typeof window.showSaveFilePicker !== 'function') return null;
      return window.showSaveFilePicker({ suggestedName: filename });
    }
    let mobileExportUrl = null;
    async function openMobileTextExport(blob, filename) {
      const modal = document.getElementById('modal-mobile-export'), text = document.getElementById('mobile-export-text');
      if (mobileExportUrl) URL.revokeObjectURL(mobileExportUrl);
      mobileExportUrl = URL.createObjectURL(blob);
      text.value = await blob.text();
      const download = document.getElementById('mobile-export-download');
      download.href = mobileExportUrl;download.download = filename;
      document.getElementById('mobile-export-title').textContent = filename;
      const share = document.getElementById('mobile-export-share');
      let file = null, canShare = false;
      try { file = new File([blob], filename, { type: blob.type || 'text/plain' });canShare = !!navigator.share && !!navigator.canShare && navigator.canShare({ files: [file] }); } catch (e) { }
      share.classList.toggle('hidden', !canShare);
      share.onclick = async () => {
        try { await navigator.share({ files: [file] });showToast('選択した保存先・共有先へ渡しました', 'success'); }
        catch (error) { if (error.name !== 'AbortError') showToast('保存・共有を開けません。ダウンロードまたは全文コピーを使ってください', 'warn'); }
      };
      document.getElementById('mobile-export-copy').onclick = async () => {
        try { await navigator.clipboard.writeText(text.value);showToast('全文をコピーしました', 'success'); }
        catch (e) { text.focus();text.select();text.setSelectionRange(0, text.value.length);if (document.execCommand && document.execCommand('copy')) showToast('全文をコピーしました', 'success');else showToast('全文を選択しました。長押ししてコピーしてください', 'info'); }
      };
      document.getElementById('mobile-export-close').onclick = () => {
        modal.classList.add('hidden');text.value = '';download.removeAttribute('href');
        if (mobileExportUrl) URL.revokeObjectURL(mobileExportUrl);mobileExportUrl = null;
      };
      modal.classList.remove('hidden');document.getElementById('mobile-export-copy').focus();
    }
    async function downloadTextBlob(blob, filename, handlePromise = null) {
      if (typeof window.showSaveFilePicker === 'function' || handlePromise) {
        try {
          const handle = await (handlePromise || chooseExportFile(filename));
          if (!handle) return false;
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          return true;
        } catch (error) {
          if (error.name === 'AbortError') return false;
          showToast('保存先を開けないため、別の書き出し方法を表示します', 'info');
        }
      }
      if (isMobilePrintTarget()) { await openMobileTextExport(blob, filename);return false; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
      showToast('保存先を選ぶ画面が出ない場合は、ブラウザの「ダウンロード前に保存場所を確認」を有効にしてください', 'info', 7000);
      return true;
    }
    window.exportSelectedCardsText = async function() {
      const cp = getCurrentPatient();
      if (selectedCardIds.size === 0) return showToast('書き出すカードを選択してください', 'warn');
      const options = await askExportOptions(`選択したカード（${selectedCardIds.size}件）を書き出し`);
      if (!options) return;
      const text = buildSelectedCardsExportText(cp, selectedCardIds, DOM.sourceText.value || cp.sourceText || '', options.includeSourceText, options.includeAssessment);
      const safeTitle = (cp.title || 'カルテ').replace(/[\\/:*?"<>|]/g, '_');
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      if (await downloadTextBlob(blob, `${safeTitle}_修正依頼_${selectedCardIds.size}件.txt`)) showToast(`選択した${selectedCardIds.size}件を書き出しました`, 'success');
    };

    // ==========================================================================

    // ==========================================================================
    function isEditedCard(i) {
      return Array.isArray(i.editLog) && i.editLog.some(e => e && e.kind !== 'create');
    }
    // Drops boilerplate that repeats on every card so the request stays short.
    function compactReviewCardBlock(block) {
      const lines = String(block).split('\n');
      const text = (lines.find(l => l.startsWith('カードの内容: ')) || '').slice('カードの内容: '.length);
      return lines.filter(l => {
        if (l.startsWith('書き換えの判定方法: ') || l === '手で編集した履歴: なし' || l === 'アプリによる書き換え: なし（元の文章のまま）') return false;
        if (l.startsWith('元の文章: ') && l.slice('元の文章: '.length).replace(/\s+/g, '') === text.replace(/\s+/g, '')) return false;
        return true;
      }).map(l => {
        if (!l.startsWith('アプリによる書き換え: ')) return l;
        const parts = [...new Set(l.slice('アプリによる書き換え: '.length).split('、'))];
        return `アプリによる書き換え: ${parts.join('、')}`;
      }).join('\n');
    }
    function reviewRequestTargets(cp) {
      const items = cp.items || [];
      return items.filter(i => !i.deleted && ((i.type === 'unnecessary' && (i.correctionRequested || !/^source\.(?:structure|date-heading|table-separator|course-staff)$/.test(i.ruleDecision?.ruleId || ''))) || i.correctionRequested || String(i.requestedCorrection || '').trim() || isEditedCard(i) || (typeof isUntaggedItem === 'function' && isUntaggedItem(i))));
    }
    function describeEditHistoryForRequest(i) {
      const log = Array.isArray(i.editLog) ? i.editLog.filter(e => e && e.kind !== 'create') : [];
      const lines = [];
      const merges = log.filter(e => e.kind === 'merge');
      log.filter(e => e.kind === 'split').forEach(e => lines.push(`分割（操作記録）：「${e.from}」→${(e.parts || []).map(t => `「${t}」`).join(' ／ ')}（詳細は以下の履歴）`));
      const textEdits = log.filter(e => e.kind === 'text');
      const tagEdits = log.filter(e => e.kind === 'tagAdd' || e.kind === 'tagRemove');
      merges.forEach(e => lines.push(`統合：${(Array.isArray(e.from) ? e.from : [e.from]).filter(Boolean).map(t => `「${String(t).slice(0, 60)}」`).join(' ＋ ')} を1枚にした`));

      textEdits.forEach(e => {
        if (typeof e.from === 'string' && typeof e.to === 'string' && e.from.length > e.to.length && e.from.includes(e.to.slice(0, Math.min(8, e.to.length)))) lines.push(`分割または短縮（本文差分からの推定・分割操作かは確認不能）：「${e.from.slice(0, 80)}」→「${e.to.slice(0, 80)}」`);
        else lines.push(`本文の編集：「${String(e.from).slice(0, 80)}」→「${String(e.to).slice(0, 80)}」`);
      });
      if (tagEdits.length) lines.push(`タグの手直し：${tagEdits.map(e => formatEditLogEntry(e)).join('、')}`);
      const others = log.filter(e => !['split', 'merge', 'text', 'tagAdd', 'tagRemove'].includes(e.kind));
      if (others.length) lines.push(`その他の編集：${others.map(e => formatEditLogEntry(e)).join('、')}`);
      return lines;
    }
    // v.90: the lost-manual-edit store lives on the patient record and can hold edits from an earlier, different source text; list only edits that belong to the current source.
    function droppedEditsForCase(cp, sourceText) {
      const list = (cp && cp.droppedManualEdits) || [];
      const src = String(sourceText || (cp && cp.sourceText) || '').normalize('NFKC').replace(/[\s、。,.・「」（）()]/g, '');
      if (!src) return list.slice();
      return list.filter(d => {
        const t = String((d && d.text) || '').normalize('NFKC').replace(/[\s、。,.・「」（）()]/g, '');
        if (t.length < 4) return true;
        if (src.includes(t)) return true;
        const grams = []; for (let k = 0; k + 2 <= t.length; k++) grams.push(t.slice(k, k + 2));
        return grams.filter(g => src.includes(g)).length / grams.length >= 0.6;
      });
    }
    function buildReviewRequestText(cp, sourceText, includeSourceText = true) {
      const items = reviewRequestTargets(cp);
      const untaggedN = items.filter(i => typeof isUntaggedItem === 'function' && isUntaggedItem(i)).length;
      const editedN = items.filter(isEditedCard).length;
      const unnecessaryN = items.filter(i => i.type === 'unnecessary').length;
      let out = `修正依頼：${cp.title}（手で編集したカード ${editedN}件・タグ未設定のカード ${untaggedN}件・不必要のカード ${unnecessaryN}件／書き出し ${items.length}枚）\n`;
      out += `出力日時: ${new Date().toLocaleString('ja-JP')}\n\n`;
      out += `分類プログラム版: ${window.APP_FILE_VERSIONS?.['07'] || '確認不能'}／分類基準版: ${NOTEBOOK_CONTENT_VERSION_MARK}\n`;
      out += correctionRequestInstructionsText() + backgroundFactorsText(cp) + sufficiencyJudgmentsText(cp) + drugCorrectionText(cp);
      out += '【対象】タグ未設定・不必要・手編集のカード。誤りの証拠ではなく調査対象です。原文全体と同じ場面の前後を読み、安静時と動作時・昨日と本日を区別し、根拠があるものは分類ルールと分類基準を修正、不足は必要な確認事項を示してください。理由の記録がなければ「理由未記録」と明記します。除外は妥当なら根拠を示し、誤りなら分類処理と分類基準を修正してください。\n';
      const originalItems = sourceText && sourceText.trim() && typeof classifyTextByRules === 'function' ? classifyTextByRules(sourceText) : [];
      const dropped = droppedEditsForCase(cp, sourceText).slice(-30);
      if (dropped.length) {
        out += `\n【引き継げなかった手動修正】分類のやり直しで、原文の変更により同じ記録として照合できず失われた手動修正です。原因（分割・統合・日時判定の変更）を調べ、引き継げるようにしてください。\n`;
        dropped.forEach(d => { out += `  ・${d.timestamp || '日時不明'}｜${d.text}｜分類: ${d.tagNotNeeded ? 'タグ不要' : d.type === 'unnecessary' ? '不必要' : `タグ ${(d.hendersonIds || []).join('・') || 'なし'}`}\n`; });
      }
      const kwCandidates = [];
      items.forEach(o => {
        const added = Array.from(new Set((o.editLog || []).filter(e => e && e.kind === 'tagAdd' && e.hId).map(e => Number(e.hId))));
        if (!added.length || typeof detectMultipleHendersonTags !== 'function') return;
        const auto = detectMultipleHendersonTags(o.text) || [];
        const missing = added.filter(h => (o.hendersonIds || []).includes(h) && !auto.includes(h));
        if (missing.length) kwCandidates.push(`  ・${o.text}｜手動で付けたタグ ${missing.join('・')}（自動では付かない）`);
      });
      if (kwCandidates.length) out += `\n【手動タグから見つかった追加キーワード候補】自動判定で付かず、手動で付けたタグです。語句と意味の関係を一般ルール（キーワード・文脈規則）として反映できるか検討してください。特定の症例の語だけに合わせないこと。\n${kwCandidates.slice(0, 30).join('\n')}\n`;
      const ruleCounts = {};
      items.forEach(o => { const r = o.ruleDecision?.ruleId; if (r) ruleCounts[r] = (ruleCounts[r] || 0) + 1; });
      items.forEach((i, idx) => {
        const edited = isEditedCard(i), untagged = typeof isUntaggedItem === 'function' && isUntaggedItem(i);
        const kinds = [i.correctionRequested || i.requestedCorrection ? '利用者が修正依頼に追加' : null, i.type === 'unnecessary' ? '不必要に分類' : null, edited ? '手で編集済み' : null, untagged ? 'タグ未設定' : null].filter(Boolean).join('＋');
        out += `\n────────────────────────\n■ ${idx + 1}件目　問題の種類: ${kinds}\n`;
        if (i.ruleDecision?.ruleId) out += `適用された自動ルール: ${i.ruleDecision.ruleId}（この書き出し内で同じルールのカード ${ruleCounts[i.ruleDecision.ruleId]}件）。個別に直さず、このルールの判定条件を見直してください。\n`;
        out += `修正の方向: ${i.type === 'unnecessary' ? '除外が妥当か、本人の所見として残すべきか、原文の前後で判断' : edited ? '手編集の内容を一般ルールに反映（同じ種類の記録でも同様に直る形）' : '内容の意味でタグ・S/Oを決定'}。他の患者の記録や特定の症例の語に依存したルールにしないでください。\n`;
        let request = '原文・編集履歴と分類結果を比較し、確認できた誤りを同じ種類の記録でも直るよう修正してください。';
        if (i.type === 'unnecessary') {
          request = 'なぜ不必要に分類されたか、原文・前後の記録・編集履歴と該当ルールを照合して再現してください。理由未記録ならその旨を示し、除外の妥当性を判断してください。確認できた誤りだけを分類処理と分類基準で修正してください。';
        }
        if (i.type === 'unnecessary' && typeof inferUntaggedReason === 'function') {
          out += `現在の除外判断（過去の処理理由とは区別）: ${inferUntaggedReason(i, cp).reason}\n`;
          const origU = typeof currentRuleCardForSavedItem === 'function' ? currentRuleCardForSavedItem(originalItems, i) : null;
          const manualU = Array.isArray(i.editLog) && i.editLog.some(e => e && e.actor === 'user');
          out += `保存済みの分類経路: ${i.predictionSource || '記録なし'}／不必要にした主体: ${manualU ? '手編集の履歴あり（理由未記録の場合は確認不能）' : i.ruleDecision ? '自動ルール' : i.predictionSource === 'confirmed' ? '利用者の確認（理由未記録）' : '確認不能（理由未記録）'}\n`;
          out += `原文を最新ルールで再分類した結果: ${origU ? (origU.type === 'unnecessary' ? `不必要（${origU.ruleDecision?.ruleId || 'ルール記録なし'}）` : `不必要ではない（${origU.type === 's' ? 'S' : origU.type === 'o' ? 'O' : origU.type}／タグ ${origU.hendersonIds?.length ? origU.hendersonIds.map(h => hendersonNameOf(h)).join('・') : 'なし'}）→保存済みの除外と食い違うため、除外の保持か更新かを確認`) : '対応する原文カードを特定できず確認不能'}\n`;
          const termsU = Array.from(new Set(String(i.text || '').split(/[、,・，\s（）()「」など]+/).map(t => t.trim()).filter(t => t.length >= 2)));
          const sameU = termsU.length ? items.filter(o => o !== i && o.type !== 'unnecessary' && termsU.some(t => String(o.text || '').includes(t))).slice(0, 5) : [];
          out += sameU.length ? `この患者の記録として別に残っている同じ語のカード（除外の妥当性の照合用）:\n${sameU.map(o => `  ・[${o.type === 's' ? 'S' : 'O'}] ${o.text}`).join('\n')}\n` : '同じ語を含む他のカード: なし（この除外で患者本人の情報が失われていないか、原文で確認してください）\n';
          if (origU) {
            const srcIdxU = originalItems.indexOf(origU);
            const ctxU = originalItems.filter((o, n) => o !== origU && o.type !== 'unnecessary' && Math.abs(n - srcIdxU) <= 4);
            if (ctxU.length) out += `原文の前後で除外されていない記録:\n${ctxU.map(o => `  ・${o.text}`).join('\n')}\n`;
          }
        }
        if (!['s', 'o', 'unnecessary'].includes(i.type)) {
          const origN = typeof currentRuleCardForSavedItem === 'function' ? currentRuleCardForSavedItem(originalItems, i) : null;
          const typeChange = (Array.isArray(i.editLog) ? i.editLog : []).filter(e => e && e.actor === 'user' && /分類を変更|type/.test(`${formatEditLogEntry(e)} ${e.kind}`)).map(e => formatEditLogEntry(e));
          out += `未分類の理由: ${typeChange.length ? `利用者の手編集で分類を変更（${typeChange.join('、')}）。理由は${i.editLog.some(e => e && e.reason) ? '記録あり' : '理由未記録'}` : i.ruleDecision ? '自動ルールで分類が確定せず未分類（ルール記録あり）' : '分類の記録なし（確認不能）'}\n`;
          if (i.ruleDecision) out += `変更前の自動除外: ${i.ruleDecision.reason}／ルール: ${i.ruleDecision.ruleId}／版: ${i.ruleDecision.version}。このルールが見出し・列挙の判定である場合、この文が患者本人の所見かどうかを原文の前後で確認してください\n`;
          out += `原文を最新ルールで再分類した結果: ${origN ? (origN.type === 'unnecessary' ? `不必要（${origN.ruleDecision?.ruleId || 'ルール記録なし'}）` : `${origN.type === 's' ? 'S' : 'O'}データ／タグ ${origN.hendersonIds?.length ? origN.hendersonIds.map(h => hendersonNameOf(h)).join('・') : 'なし'}`) : '対応する原文カードを特定できず確認不能'}\n`;
          out += '未分類のままの扱い: S/O・タグが決まるまで、総合アセスメントでは「未分類のカード」に入り、ヘンダーソン14項目には入りません。利用者が分類を決めるか、タグ不要にするまで残ります\n';
          const termsN = Array.from(new Set(String(i.text || '').split(/[、,・，\s（）()「」など]+/).map(t => t.trim()).filter(t => t.length >= 2)));
          const sameN = termsN.length ? items.filter(o => o !== i && ['s', 'o'].includes(o.type) && termsN.some(t => String(o.text || '').includes(t))).slice(0, 5) : [];
          out += sameN.length ? `この患者の記録として別に残っている同じ語のカード:\n${sameN.map(o => `  ・[${o.type === 's' ? 'S' : 'O'}] ${o.text}`).join('\n')}\n` : '同じ語を含む他のカード: なし\n';
        }
        if (untagged && i.type !== 'unnecessary') {
          const inf = typeof inferUntaggedReason === 'function' ? inferUntaggedReason(i, cp) : null;
          const original = currentRuleCardForSavedItem(originalItems, i);
          const protection = savedUntaggedProtection(i, cp);
          if (original?._sourceMatchAmbiguous) out += '原文対応の注意: 同じ日時の複数の原文カードに一致します。親カードの一意な特定は確認不能ですが、分割片自身の所見は保持します。\n';
          if (original?._sourceMatchKind) out += `原文対応: ${original._sourceMatchKind === 'fragment' ? '最新ルールでは統合された原文カードの一部に一致（分割片自身の内容だけでタグを判定）' : '項目名と短い値を合わせて一致'}\n対応する原文カード: ${original.sourceParentText}\n`;
          out += `保存済みの分類経路: ${i.predictionSource || '記録なし'}／自動タグ更新: ${protection ? `対象外（${protection}）` : '対象'}\n`;
          out += `原文を最新ルールで再分類したタグ: ${original ? (original.hendersonIds.length ? original.hendersonIds.map(h => hendersonNameOf(h)).join('・') : 'なし（この記録だけでは分類の根拠が不足する場合があります）') : '確認不能（本文と日時が一致する原文カードなし）'}\n`;
          if (original?.hendersonIds.length && !protection) out += '確認できた差分: 最新ルールではタグが付きますが、保存済みカードには反映されていません。既存カードの更新経路を確認してください。\n';
          if (inf && protection) Object.assign(inf, { kind: 'none', kindLabel: '保存済みの判断を保持', reason: `${protection}を保持しています。${inf.kind === 'none' ? inf.reason : '最新ルールとの差だけで誤りと決めつけず、意図を確認してください。'}`, candidates: [], checks: ['利用者の編集・学習・レビューの意図を確認し、了承済みの判断を自動で上書きしないでください'] });
          const evidence = original ? painContextTagEvidence(originalItems, original) : [];
          if (original) {
            const sourceIndex = originalItems.findIndex(o => o === original || original.sourceParentText === o.text && o.timestamp === original.timestamp);
            const context = originalItems.filter((o, n) => o !== original && o.type !== 'unnecessary' && o.timestamp === original.timestamp && Math.abs(n - sourceIndex) <= 4);
            if (context.length) out += `原文から再抽出した周辺記録（${original.timestamp}）:\n${context.map(o => `  ・${o.text}`).join('\n')}\n`;
          }
          if (inf && evidence.length && !protection) {
            Object.assign(inf, { kind: 'classify', kindLabel: '原文の文脈から分類可能', confidence: '中', candidates: evidence.map(e => e.id), reason: 'カード本文には影響先がなくても、同じ場面の原文に影響が明記されています。', checks: ['以下の原文の根拠を用いてタグ付与漏れを再現し、文脈を読む分類ルールを修正してください'] });
            out += `原文から確認できるタグの根拠:\n${evidence.map(e => `  ・${hendersonNameOf(e.id)}：［${e.timestamp}］${e.evidence}`).join('\n')}\n`;
            request = `同じ場面の原文を根拠に${evidence.map(e => hendersonNameOf(e.id)).join('・')}を付けてください。本文だけの判定でタグが落ちないよう分類ルールと分類基準を修正してください。`;
          } else if (inf) {
            request = inf.kind === 'classify' && inf.candidates.length && !inf.fromContext ? `${inf.reason} ${inf.candidates.map(h => hendersonNameOf(h)).join('・')}を付ける分類ルールと分類基準に修正してください。` : inf.kind === 'none' ? `${inf.reason} 原文から基本的欲求との関係を再確認し、関連が確認できた場合は根拠を示して分類してください。` : `${inf.reason} 原文全体を読み直し、影響先と同じ場面の根拠が確認できる場合はタグを付けてください。確認できなければ、不足している情報を具体的に示してください。`;
          }
          if (inf) {
            out += `状況（タグ未設定）: ${inf.kindLabel}／推定理由：${inf.reason}／推定の確からしさ：${inf.confidence}／分類候補：${inf.candidates.length ? inf.candidates.map(h => hendersonNameOf(h)).join('・') : 'なし'}\n`;
            out += `Fix checks: ${inf.checks.join('／') || 'Check source/context before tagging'}. ` +
              (inf.kind === 'none' ? 'Exclusion may be intended.' : (inf.kind === 'source' ? 'Verify the original before classifying.' : 'Fix matching/context rules for similar records.')) + '\n';
          }
        }
        if (edited) {
          const hist = describeEditHistoryForRequest(i);
          out += `状況（手で編集済み）:\n${hist.map(h => `  ・${h}`).join('\n')}\n`;
          out += 'Fix checks: Reproduce the original result; use manual corrections as evidence, not automatic proof of a bug.\n';
        }
        const block = buildCardsReportText(cp, [i], sourceText, '', false);
        const at = block.indexOf('\n■ ');
        out += compactReviewCardBlock(at >= 0 ? block.slice(at).replace(/^\n■ [^\n]*\n/, '').replace(`修正してほしい内容: ${i.requestedCorrection || (i.correctionRequested ? '原文・前後の記録と分類結果を照合し、このカードを調査してください。' : '')}\n`, `修正してほしい内容: ${request}${i.requestedCorrection ? '\n追加の修正依頼（利用者）: ' + i.requestedCorrection : ''}\n`) : '');
      });
      if (includeSourceText) {
        out += `\n【分類前の文章（カルテ・看護記録入力欄）】\n`;
        out += (sourceText && sourceText.trim()) ? `${sourceText.trim()}\n` : '（入力欄に文章がありません）\n';
      }
      return out;
    }
    window.exportKnowledgeRequest = async function() {
      const cp = getCurrentPatient();
      const reqs = buildKnowledgeRequests(cp);
      if (!reqs.length) return showToast('今の患者について、サイトが判断できなかった知識はありません', 'success');
      const safeTitle = (cp.title || 'カルテ').replace(/[\\/:*?"<>|]/g, '_');
      const blob = new Blob([knowledgeRequestText(cp, reqs)], { type: 'text/plain;charset=utf-8' });
      if (await downloadTextBlob(blob, `${safeTitle}_知識リクエスト_${reqs.length}件.txt`)) showToast(`サイトが知りたい知識${reqs.length}件を書き出しました`, 'success');
    };
    window.exportReviewRequestText = async function() {
      const cp = getCurrentPatient();
      const targets = reviewRequestTargets(cp);
      if (!targets.length) return showToast('書き出す対象（手で編集したカード・タグ未設定・不必要のカード）はありません', 'success');
      const text = buildReviewRequestText(cp, DOM.sourceText.value || cp.sourceText || '', true);
      const safeTitle = (cp.title || 'カルテ').replace(/[\\/:*?"<>|]/g, '_');
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      if (await downloadTextBlob(blob, `${safeTitle}_修正依頼_編集済み・未設定_${targets.length}枚.txt`)) showToast(`編集済み・タグ未設定の${targets.length}枚を、問題の説明つきで書き出しました`, 'success');
    };

    function buildExportDocument(cp, want) {
      const title = escapeHtml(`${cp.title || ''}_看護アセスメント`);
      return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>${title}</title><style>${PRINT_BASE_CSS}
  @page { size: A4 portrait; }
  tr { break-inside: auto; page-break-inside: auto; }
  td { break-inside: auto; }
</style></head><body>${buildExportBodyHtml(cp, want)}</body></html>`;
    }

    document.getElementById('btn-export-docs').addEventListener('click', async () => {
      const cp = getCurrentPatient();
      const options = await askExportOptions('テキスト書き出し', false, { sections: true });
      if (!options) return;
      const safeTitle = (cp.title || 'カルテ').replace(/[\\/:*?"<>|]/g, '_');

      const sheet = buildExportPlainText(cp, options.sections) +
        (options.includeAssessment ? `\n【総合アセスメント表】\n${buildAssessmentTableText(cp)}` : '');
      const blob = new Blob([sheet], { type: 'text/plain;charset=utf-8' });

      if (await downloadTextBlob(blob, `${safeTitle}_看護アセスメント.txt`)) showToast('看護アセスメントを書き出しました', 'success');
    });

    document.getElementById('btn-export-pdf').addEventListener('click', async () => {
      const cp = getCurrentPatient();
      const options = await askExportOptions('PDF書き出し', false, { sections: true, sectionsOnly: true });
      if (!options) return;

      printHtmlDocument(buildExportDocument(cp, options.sections));
      showToast(isMobilePrintTarget() ? '印刷用の見本を開きました。上の「印刷・PDFに保存」を押してください' : '印刷画面を開きます。「送信先」で「PDFに保存」を選ぶとPDFになります', 'info');
    });
