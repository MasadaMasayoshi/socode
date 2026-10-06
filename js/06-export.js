    // 看護アセスメント支援システム：06-export.js（全10ファイルのうち 6 番目）
    // 書き出し：テキスト・Word・PDF、選択したカードの書き出し、総合アセスメント表の書き出し。
    // index.html の <script> で 01〜10 の順に読み込み、1つのプログラムとして動きます
    // （順番を入れ替えないでください。以前の app.js を内容ごとに分けたものです）。

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['06'] = '2026-10-06.9'; // 版（scripts/stamp-version.js が書き込む）
    // ==========================================================================
    // 書式付き書き出し（Word / PDF）
    // ------------------------------------------------------------------------
    // 以前はプレーンテキスト(.txt)での書き出しのみだったが、提出物としてそのまま使える
    // よう、見出し・箇条書きなどの書式を保った1つのHTML文書を組み立て、それを
    // 「Word書き出し」ではWordが直接開けるHTML形式の.docファイルとしてダウンロードし、
    // 「PDF書き出し」では新しいタブで開いてブラウザの印刷ダイアログ（PDFとして保存）を
    // 自動で呼び出す、という2通りの出口で使い回す。ライブラリ等を追加せず、ブラウザ標準の
    // 機能だけで完結する（オフラインでも動作する）。
    // AI分析結果は元々<br>や<b>タグを含むHTMLとして保持しているため、そのまま埋め込む。
    // 【レビューで発見】患者の記録に保存されたAIの結果のHTML（検査値の評価・矛盾チェック・看護診断候補・経時変化・看護計画）は、
    // 共有先（サーバー）やファイルの読み込みから届くこともあり、そのまま画面・印刷用の文書に入れると <img onerror=…> などが
    // 動いた。画面・印刷・PDFに入れる前に、必ずここ（js/05 の sanitizeStoredHtml）を通して動く部品を取り除く。
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
    // 出力シートのセクション構成（HTML書き出し・プレーンテキスト書き出し共通）
    // ------------------------------------------------------------------------
    // 【経緯】以前は見出しラベル（FIELD_LABELS）付きの項目やヘンダーソン14項目のどれにも
    // 一致しなかった患者背景フォールバック項目（item.patientBackground、
    // classifyPatientBackgroundの説明を参照）を「2. 患者背景」という独立したセクションに
    // まとめ、S/O/未分類（3・4・5）からは除外する形にしていた。
    // しかし利用者からの指摘：看護記録の原則では、年齢・既往歴・診断名・家族構成・職業・
    // 保険等のカルテ・アナムネ由来の基本情報も、患者本人の発言でない限りすべて客観的事実
    // （Oデータ）であり、「患者背景」というS/Oのどちらでもない第三の区分を作るべきではない。
    // 出力シートも独立したセクションに逃がすのではなく、Sデータ・Oデータの一覧の中に
    // 「・[家族構成] 夫、長男と同居」のように見出し語（fieldLabel）付きの1行として
    // 並べる方が、看護記録としての原則にも合い、見た目もすっきりする。
    // 【修正】独立した患者背景セクションは廃止し、見出しラベル付きの項目・患者背景
    // フォールバック項目も他の項目と同様にtype（s/o/unclassified）でそのままS/O/未分類の
    // 一覧に含める（=元々の、このセクションが無かった頃の構成に戻す）。見出しラベルが
    // あれば、formatLineHtml/formatLineが従来通り行頭に「[見出し語]」を付けて表示するため、
    // 「・[家族構成] 夫、長男と同居」のような表示は変わらず得られる。セクション番号は
    // 「2. 患者背景」が無くなった分、以降すべて1つずつ繰り上がる
    // （3→2 Sデータ、4→3 Oデータ、5→4 未分類、6→5 ヘンダーソン14項目別、7〜11→6〜10）。

    // ==========================================================================
    // 印刷・PDF用の文書（利用者からの要望：「印刷pdfでもっと見やすくpdf化するように。サイト上での
    // 編集ボタンとかいりませんよね」）
    // ------------------------------------------------------------------------
    // 以前の「印刷 / PDF」は画面をそのまま印刷していたため、カードごとの未・前・後・欠のボタンや
    // 上下・編集のアイコンまで印刷され、列が狭く文字が数文字ごとに折り返し、19ページにもなっていた。
    // 画面とは別に、印刷専用の文書（ボタン類を含まない）を組み立てて印刷する。
    //   ・「印刷 / PDF」（総合アセスメント表の上）：buildAssessmentPrintHtml … A4横の総合アセスメント表
    //   ・「PDF書き出し」（画面右上）：buildExportDocument … A4縦の記録整理シート
    // どちらも同じ見た目の決まり（PRINT_BASE_CSS）を使い、ブラウザの印刷画面で「PDFに保存」を選ぶとPDFになる。
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
      if (item.aiSuggested) return '<span class="lb lb-x">AI推定</span>';
      if (item.type === 's') return `<span class="lb lb-s">${escapeHtml(seqLabel || 'S')}${isFamilySpeech(item.text) ? '（家族）' : ''}</span>`;
      if (item.type === 'o') return `<span class="lb lb-o">${escapeHtml(seqLabel || 'O')}</span>`;
      return '';
    }
    function printTime(item, dayHeading) {
      const ts = dayHeading && timestampDayPart(item.timestamp) === dayHeading ? timestampClockPart(item.timestamp) : item.timestamp;
      return ts && ts !== '日時不明' && ts !== 'AI推定' ? `<span class="tm">${escapeHtml(ts)}</span>` : '';
    }
    // 総合アセスメント表の1つの欄のカードの一覧（入院前・入院後の欄は日ごとの小見出しで区切る。画面と同じ）
    function printAssessmentCellList(col, list, labels) {
      const line = (i, day) => `${printTypeLabel(i, labels[i.id])}${printTime(i, day)}${printFieldLabel(i)}${escapeHtml(i.text)}`;
      return `<ul class="cards">${assessmentDayGroups(col, list).map(g =>
        (g.day ? `<li class="day${g.background ? ' bg' : ''}">${escapeHtml(g.day)}</li>` : '') +
        // 同じ場面の発言（S）と観察（O）は左右に並べる（画面と同じ）
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
    // 画面の総合アセスメント表と同じ番号（項目ごとに上から S-1, S-2 / O-1, O-2 …。不足情報欄は番号なし）
    // S-1・O-1の番号は、日の順番（assessmentDisplayOrder）で上から付ける（画面・印刷・テキスト書き出しで共通）
    // 【番号は画面に並ぶ順】利用者からの指摘：「O-1、O-2の順番が時系列に整理しても整理されていない」。以前は欲求の中の
    // 全カードを日の順に並べて番号を付けていたが、画面では欄（未分類→入院前→入院後）ごとに、しかも各欄の一番上に
    // 「背景（診断名・現病歴など）」をまとめて出すため、「O-1 O-2 O-5 O-3」のように番号が飛んで見えていた。
    // 画面・印刷と同じ並び（欄の順 → 欄の中の背景 → 日の順）で番号を付ける。
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
    // AI分析ツールの結果（実施済みのものだけ）。看護診断候補は、看護計画に使った（選んだ）ものに印を付ける。
    function buildPrintAiSectionsHtml(cp, startNo) {
      let n = startNo;
      let out = '';
      // sec に渡すHTMLは、保存された部分を storedAiHtml で安全にしたもの
      const sec = (title, html) => { out += `<h2>${n++}. ${escapeHtml(title)}</h2><div class="ai">${html}</div>`; };
      if (cp.labEvaluationResult) sec('検査データ臨床評価（AI・参考）', storedAiHtml(cp.labEvaluationResult));
      if (cp.contradictionResult) sec('S/O矛盾チェック（AI・参考）', storedAiHtml(cp.contradictionResult));
      const cands = cp.diagnosisCandidates || [];
      if (cands.length) {
        const sel = new Set(cp.selectedDiagnosisIds || []);
        out += `<h2>${n++}. 看護診断候補（AI・参考）</h2>` + cands.map(c => `<div class="dx${sel.has(c.id) ? ' sel' : ''}"><div class="dx-name">${sel.has(c.id) ? '✓ ' : ''}${escapeHtml(c.name)}${sel.has(c.id) ? '<span class="tags">　（看護計画に使用）</span>' : ''}</div>${c.bodyHtml ? `<div>${storedAiHtml(c.bodyHtml)}</div>` : ''}</div>`).join('');
      } else if (cp.diagnosisResult) sec('看護診断候補（AI・参考）', storedAiHtml(cp.diagnosisResult));
      if (cp.timelineResult) sec('経時変化サマリー（AI・参考）', storedAiHtml(cp.timelineResult));
      if (cp.carePlanResult) sec('看護計画（AI・叩き台）', (cp.carePlanDiagnoses?.length ? `<p><b>選んだ看護診断：</b>${escapeHtml(cp.carePlanDiagnoses.join('／'))}</p>` : '') + storedAiHtml(cp.carePlanResult));
      if (out) out += '<p class="note">AIによる結果は参考情報です。最終的な判断・看護診断・看護計画の決定は必ず医療従事者が行ってください。〔S …〕〔O …〕は根拠にしたカードです。</p>';
      return out;
    }

    // 「印刷 / PDF」用：総合アセスメント表（A4横）
    function buildAssessmentPrintHtml(cp) {
      const active = (cp.items || []).filter(i => i.type !== 'unnecessary');
      const colOf = (i, id) => i.assessmentCols?.[id] || 'unclassified';
      // 未分類の欄は、未分類のカードが1枚でもあるときだけ表に出す（空の列で表が狭くならないように）
      const hasUnclassified = active.some(i => (i.hendersonIds || []).some(h => colOf(i, h) === 'unclassified'));
      const cols = [...(hasUnclassified ? ['unclassified'] : []), 'preadmission', 'postadmission', 'missing'];
      const widths = hasUnclassified ? ['12%', '19%', '23%', '27%', '19%'] : ['13%', '26%', '37%', '24%'];
      const rows = HENDERSON_NEEDS.map(need => {
        const matching = active.filter(i => i.hendersonIds?.includes(need.id));
        const labels = assessmentSeqLabels(matching, need.id);
        const cells = cols.map(col => {
          const list = matching.filter(i => colOf(i, need.id) === col);
          if (!list.length) return '<td class="empty">—</td>';
          return `<td>${printAssessmentCellList(col, list, labels)}</td>`;
        }).join('');
        return `<tr><th scope="row" style="background:#f7f5f0;">${need.id}. ${escapeHtml(need.name.replace(/^\d+\.\s*/, ''))}</th>${cells}</tr>`;
      }).join('');
      // 自分のアセスメント（js/11）があれば、表の次のページに載せる
      const own = typeof buildMyAssessmentsPrintHtml === 'function' ? buildMyAssessmentsPrintHtml(cp, 1) : '';
      const ai = buildPrintAiSectionsHtml(cp, own ? 2 : 1);
      const title = `${cp.title || ''}_総合アセスメント表`;
      return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${PRINT_BASE_CSS}
  @page { size: A4 landscape; }
  /* 行（項目）の途中でもページを分けてよい（カードの途中では分けない）。行ごとに次のページへ送ると空白が多くなる */
  table.asm tr { break-inside: auto; page-break-inside: auto; }
  table.asm th[scope="row"] { font-size: 8.6pt; }
  table.asm td { font-size: 8.4pt; }
</style></head><body>
${printDocHead('総合アセスメント表（ヘンダーソン14項目）', cp)}
<p class="legend"><span class="lb lb-s">S</span>主観的情報（患者の発言）　<span class="lb lb-o">O</span>客観的情報（観察・検査）　<span class="lb lb-x">AI推定</span>不足している可能性のある情報　／　番号（S-1・O-1）は画面の総合アセスメント表と同じです。</p>
<table class="asm"><colgroup>${widths.map(w => `<col style="width:${w}">`).join('')}</colgroup>
<thead><tr><th>基本的欲求</th>${cols.map(c => `<th>${PRINT_COL_LABELS[c]}</th>`).join('')}</tr></thead>
<tbody>${rows}</tbody></table>
${own ? `<div class="page-break"></div>${own}` : ''}
${ai ? `<div class="page-break"></div>${ai}` : ''}
</body></html>`;
    }

    // 印刷専用の文書を、画面に見えない枠（iframe）に読み込んで印刷画面を開く（新しいタブを開かないので
    // ポップアップのブロックにもかからない）。印刷画面の「送信先」で「PDFに保存」を選ぶとPDFになる。
    // 印刷・PDFの文書も、画面と同じ書体（明朝＝Noto Serif JP／ゴシック）にする
    function printFontCss() {
      if (typeof currentAppFont === 'function' && currentAppFont() === 'gothic') return '';
      let url = 'vendor/fonts/NotoSerifJP-subset.woff2';
      try { url = new URL(url, document.baseURI).href; } catch (e) { /* 相対のまま */ }
      return `@font-face { font-family: 'Noto Serif JP App'; src: url('${url}') format('woff2'); font-weight: 200 900; }
  body, body * { font-family: 'Noto Serif JP App', 'Noto Serif JP', 'Yu Mincho', 'Hiragino Mincho ProN', serif !important; }`;
    }
    // 【スマホでPDF】利用者からの指摘：「PDFがスマホでできない」。スマホ（iPhone・Android）のブラウザは、画面に見えない
    // 枠（iframe）の中だけを印刷できず、何も起きなかったり、アプリの画面そのものが印刷されたりしていた。
    // スマホでは、印刷用のページを新しいタブとして開き、そのページで印刷（＝PDFに保存）する。ページの上に
    // 「印刷・PDFに保存」のボタンと、iPhone／Android それぞれのPDFの保存のしかたを出す（印刷のときは隠れる）。
    function isMobilePrintTarget() {
      try {
        const ua = navigator.userAgent || '';
        if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;
        if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true; // iPadOS（デスクトップ表示）
        return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 900);
      } catch (e) { return false; }
    }
    // 【スマホのPDFは同じ画面の中で】前の版（2026-09-30.5）では、スマホは印刷用のページを新しいタブ（blob:のURL）で
    // 開いていたが、利用者から「PDF保存できなくなっている」との指摘があった。ホーム画面に追加したアプリ・LINEなどの
    // アプリ内ブラウザでは新しいタブが開けなかったり、別のブラウザで開かれてページが空になったりし、アプリを
    // 切り替えて戻るとタブが読み込み直されて空になることもあった。
    // 今は新しいタブを開かず、印刷用の文書をアプリの画面の上に全画面で重ねて表示し（見本を兼ねる）、上の
    // 「印刷・PDFに保存」でアプリのページそのものを印刷する（印刷のときは重ねた文書だけが出る）。
    // 文書の見た目の決まり（PRINT_BASE_CSS）がアプリの画面に混ざらないよう、文書は shadow DOM の中に入れる。
    function splitPrintCss(css) {
      // @page（A4の向き・余白）はページ全体の決まりなので shadow DOM の外に出す。@font-face はアプリで読み込み済み。
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
      // html / body に向けた決まりは、shadow DOM の中の文書の入れ物（.pv-body）に向ける
      rest = rest.replace(/(^|[\s,{}])(?:html|body)(?=[\s,{.:#\[*>])/g, '$1.pv-body');
      return { pageRules: pageRules.join('\n'), bodyCss: rest };
    }
    // keepSvg：関連図（js/15）のように、アプリが自分で組み立てた図（SVG）を載せる文書のときは図を残す
    // （その場合も、図の中の script・foreignObject・アニメーション・外部の参照は取り除く）。
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
      // 【レビューで発見】この見本はアプリの画面そのものに入れるので、文書の中の動く部品（script・on〜の属性・
      // javascript: のリンク）を取り除いてから入れる（AIの結果の部分は組み立てるときに storedAiHtml を通している）。
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
      // 書体の読み込みを待ってから印刷画面を開く（待たないと、最初の印刷だけ別の書体になることがある）
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

    // 「PDF書き出し」用：記録整理シート（A4縦）の本文。S/Oデータは表で、14項目別は入院前・入院後・不足情報に分けて載せる。
    function buildExportBodyHtml(cp) {
      const items = cp.items || [];
      const dataTable = list => list.length === 0 ? '<p class="muted">（登録なし）</p>' :
        `<table><colgroup><col style="width:15%"><col><col style="width:22%"></colgroup><thead><tr><th>日時</th><th>内容</th><th>タグ</th></tr></thead><tbody>${list.map(i => `<tr><td class="tm">${escapeHtml(i.timestamp && i.timestamp !== '日時不明' ? i.timestamp : '—')}</td><td>${printFieldLabel(i)}${escapeHtml(i.text)}</td><td class="tags">${escapeHtml(printTagNames(i)) || '<span class="muted">タグ未設定</span>'}</td></tr>`).join('')}</tbody></table>`;
      let n = 1;
      let body = printDocHead('看護アセスメント・記録整理シート', cp);
      // 不足情報（まだ記録が無く確かめたい情報）は、実際の記録（S/O）の表には混ぜず、別の節に確認状況とまとめる
      const isMissingOnly = i => typeof isMissingInfoOnlyItem === 'function' && isMissingInfoOnlyItem(i);
      body += `<h2>${n++}. 主観的情報（Sデータ）</h2>` + dataTable(items.filter(i => i.type === 's' && !isMissingOnly(i)));
      body += `<h2>${n++}. 客観的情報（Oデータ）</h2>` + dataTable(items.filter(i => i.type === 'o' && !isMissingOnly(i)));
      const missingOnly = items.filter(i => i.type !== 'unnecessary' && isMissingOnly(i));
      if (missingOnly.length) {
        const status = i => (typeof missingCheckStatus === 'function' ? ({ unchecked: '未確認', checked: '確認済み', na: '該当なし' })[missingCheckStatus(cp, i.id)] : '未確認');
        const result = i => { const c = typeof getMissingCheck === 'function' ? getMissingCheck(cp, i.id) : null; return c && c.result ? `<br><span class="muted">→ ${escapeHtml(c.result)}${c.method ? `（${escapeHtml(c.method)}）` : ''}</span>` : ''; };
        body += `<h2>${n++}. 不足情報と確認状況</h2><table><colgroup><col style="width:14%"><col><col style="width:20%"></colgroup><thead><tr><th>状況</th><th>確かめたい情報</th><th>項目</th></tr></thead><tbody>${missingOnly.map(i => `<tr><td>${escapeHtml(status(i))}${i.aiSuggested ? '<br><span class="lb lb-x">AI推定</span>' : ''}</td><td>${escapeHtml(i.text.replace(/^原因:\s*/, ''))}${result(i)}</td><td class="tags">${escapeHtml(printTagNames(i))}</td></tr>`).join('')}</tbody></table>`;
      }
      const unclassified = items.filter(i => i.type === 'unclassified');
      if (unclassified.length) body += `<h2>${n++}. 未分類のカード</h2>` + dataTable(unclassified);
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
          return list.length ? `<td>${printAssessmentCellList(col, list, labels)}</td>` : '<td class="empty">—</td>';
        }).join('')}</tr></tbody></table>`;
      });
      if (!anyNeed) body += '<p class="muted">（タグが付いたカードがありません）</p>';
      const own = typeof buildMyAssessmentsPrintHtml === 'function' ? buildMyAssessmentsPrintHtml(cp, n) : '';
      if (own) { body += own; n++; }
      // 【レビューで発見】「看護計画」のページで自分で立てた看護計画（目標・OP/TP/EP）と実施・評価の記録が、
      // 書き出し（PDF・テキスト）に載っていなかった（AIの叩き台だけが載っていた）。
      const plansText = typeof buildCarePlansText === 'function' ? buildCarePlansText(cp, { withRecords: true }) : '';
      if (plansText) body += `<h2>${n++}. 看護計画と実施・評価</h2><p style="white-space:pre-wrap;margin:0;">${escapeHtml(plansText)}</p>`;
      body += buildPrintAiSectionsHtml(cp, n);
      const notes = cp.referenceNotes || [];
      if (notes.length > 0) {
        body += '<h2>参考データ</h2>';
        notes.forEach(note => { body += `<h3>${escapeHtml(note.title)}</h3><p style="white-space:pre-wrap;margin:0;">${escapeHtml(note.text)}</p>`; });
      }
      return body;
    }

    // ==========================================================================
    // プレーンテキスト書き出し（元「Word書き出し」）
    // ------------------------------------------------------------------------
    // 【背景】利用者からの要望：「ワード書き出しをテキストとして出力するようにしてください」。
    // 従来は「Word書き出し」ボタンがWordで直接開けるHTML形式の.docファイルを生成していたが、
    // ここではそのまま編集・コピーしやすいプレーンテキスト(.txt)を出力するよう変更する。
    // AI分析結果（S/O矛盾チェック・看護診断候補・経時変化サマリー・看護計画）は元々<br>・<b>
    // タグを含むHTMLとして保持しているため、改行・太字タグを取り除いてプレーンテキスト
    // 相当の見た目（改行はそのまま改行、強調は記号を付けず素のテキストのまま）に変換してから
    // 埋め込む。PDF書き出し（buildExportDocument・buildExportBodyHtml）は従来通り書式付きの
    // HTMLのまま変更しない（印刷・PDF保存では見出し・箇条書きの書式が引き続き役立つため）。
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
    function plainSectionTitle(title) {
      return `\n【${title}】\n`;
    }
    function plainList(lines) {
      if (lines.length === 0) return '（登録なし）\n';
      return lines.map(t => `・${t}`).join('\n') + '\n';
    }

    // buildExportBodyHtmlと同じ構成・同じ項目の並び順を、プレーンテキストで組み立てる。
    // 構成を分けて重複させているのは、HTML版（見出しタグ・エスケープ・スタイル付き<li>）と
    // プレーンテキスト版（記号による見出し・「・」による箇条書き・エスケープ不要）とで
    // 組み立て方そのものが異なり、無理に1つの関数にまとめるとどちらも読みにくくなるため。
    function buildExportPlainText(cp) {
      const formatLine = i => `[${i.timestamp}]${i.fieldLabel ? ` [${i.fieldLabel}]` : ''} ${i.text}`;

      let out = `看護アセスメント・記録整理シート：${cp.title}\n`;
      out += `出力日時: ${new Date().toLocaleString('ja-JP')}\n`;

      out += plainSectionTitle('1. 検査データ臨床評価・アセスメントノート');
      out += htmlToPlainText(cp.labEvaluationResult || '（検査値の評価はまだ行っていません）') + '\n';

      const isMissingOnly = i => typeof isMissingInfoOnlyItem === 'function' && isMissingInfoOnlyItem(i);
      out += plainSectionTitle('2. 主観的情報（Sデータ）');
      out += plainList(cp.items.filter(i => i.type === 's' && !isMissingOnly(i)).map(formatLine));

      out += plainSectionTitle('3. 客観的情報（Oデータ）');
      out += plainList(cp.items.filter(i => i.type === 'o' && !isMissingOnly(i)).map(formatLine));
      const missingOnly = cp.items.filter(i => i.type !== 'unnecessary' && isMissingOnly(i));
      if (missingOnly.length) {
        out += plainSectionTitle('不足情報と確認状況');
        out += plainList(missingOnly.map(i => {
          const st = typeof missingCheckStatus === 'function' ? ({ unchecked: '未確認', checked: '確認済み', na: '該当なし' })[missingCheckStatus(cp, i.id)] : '未確認';
          const c = typeof getMissingCheck === 'function' ? getMissingCheck(cp, i.id) : null;
          return `[${st}]${i.aiSuggested ? ' [AI推定]' : ''} ${i.text.replace(/^原因:\s*/, '')}${c && c.result ? ` → ${c.result}` : ''}`;
        }));
      }

      out += plainSectionTitle('4. 未分類のカード');
      out += plainList(cp.items.filter(i => i.type === 'unclassified').map(formatLine));

      out += plainSectionTitle('5. ヘンダーソン14項目別アセスメント整理');
      HENDERSON_NEEDS.forEach(need => {
        const matching = cp.items.filter(i => i.type !== 'unnecessary' && i.hendersonIds?.includes(need.id));
        if (matching.length === 0) return;
        out += `\n${need.id}. ${need.name}\n`;
        out += plainList(matching.map(i => {
          const col = i.assessmentCols?.[need.id] || 'unclassified';
          const colName = col === 'preadmission' ? '入院前' : (col === 'postadmission' ? '入院後' : (col === 'missing' ? '不足情報' : '未分類'));
          return `[${colName}] [${i.type.toUpperCase()}]${i.fieldLabel ? ` [${i.fieldLabel}]` : ''}${i.aiSuggested ? ' [AI推定]' : ''} ${i.text}`;
        }));
      });

      const own = typeof buildMyAssessmentsText === 'function' ? buildMyAssessmentsText(cp) : '';
      if (own) { out += plainSectionTitle('自分のアセスメント'); out += own + '\n'; }
      // 【レビューで発見】自分で立てた看護計画と実施・評価の記録も載せる（以前はAIの叩き台だけだった）
      const plansText = typeof buildCarePlansText === 'function' ? buildCarePlansText(cp, { withRecords: true }) : '';
      if (plansText) { out += plainSectionTitle('看護計画と実施・評価'); out += plansText + '\n'; }

      if (cp.contradictionResult) { out += plainSectionTitle('6. S/O矛盾チェック結果（AI）'); out += htmlToPlainText(cp.contradictionResult) + '\n'; }
      if (cp.diagnosisResult) { out += plainSectionTitle('7. 看護診断候補（AI提案）'); out += htmlToPlainText(cp.diagnosisResult) + '\n'; }
      if (cp.timelineResult) { out += plainSectionTitle('8. 経時変化サマリー（AI）'); out += htmlToPlainText(cp.timelineResult) + '\n'; }
      if (cp.carePlanResult) { out += plainSectionTitle('9. 看護計画（AI自動生成）'); if (cp.carePlanDiagnoses?.length) out += `選んだ看護診断：${cp.carePlanDiagnoses.join('／')}\n`; out += htmlToPlainText(cp.carePlanResult) + '\n'; }

      const notes = cp.referenceNotes || [];
      if (notes.length > 0) {
        out += plainSectionTitle('10. 参考データ');
        notes.forEach(n => { out += `\n${n.title}\n${n.text}\n`; });
      }
      return out;
    }

    // ==========================================================================
    // 選択したカードだけのテキスト書き出し（修正依頼用メモ）
    // ------------------------------------------------------------------------
    // 利用者からの要望：「修正してほしいところだけをテキスト書き出ししたいので、情報カードを
    // 複数選択した後、選択した情報だけテキスト書き出しする機能を作ってください」。
    // 修正を頼む相手（または後で見直す自分）が、どのカードがどう分類され、元の文章では何と
    // 書かれていたかを1か所で確認できるよう、カードごとに次をまとめる：
    //   分類（S/O/未分類/不要）・日時・見出し・ヘンダーソンタグ／カードの内容／
    //   元の文章の該当箇所（findSourceHighlightRangesで探した行）／修正してほしい内容（記入欄）
    // 並び順は分類ボードの並び（cp.itemsの順）に合わせる（クリックした順より元の文章の流れに近いため）。
    const SELECTED_EXPORT_TYPE_LABELS = { s: 'Sデータ', o: 'Oデータ', unclassified: '未分類', unnecessary: '不必要な情報' };
    function sourceExcerptForCard(sourceText, cardText) {
      const ranges = findSourceHighlightRanges(sourceText || '', cardText);
      if (!ranges.length) return null;
      // 印を付けた範囲を含む行全体を、元の文章の改行を「 / 」に置き換えて1行にまとめる
      // （表から作ったカードは項目名・基準値・実測値が別々の行にあるため）。
      const start = sourceText.lastIndexOf('\n', ranges[0][0] - 1) + 1;
      const endNewline = sourceText.indexOf('\n', ranges[ranges.length - 1][1]);
      const end = endNewline === -1 ? sourceText.length : endNewline;
      const excerpt = sourceText.slice(start, end).split(/\r?\n/).map(l => l.trim()).filter(Boolean).join(' / ');
      return excerpt.length > 300 ? `${excerpt.slice(0, 300)}…` : excerpt;
    }
    // 元の文章の該当箇所 → カードの文章で、アプリが自動で書き換えた点を、読んで分かる言葉で説明する。
    // 利用者からの要望：「何かしら編集されていた場合、何がどう編集されたかわかるように書き出して」。
    // アプリの書き換えは決まった種類しかないため、まずそれぞれを見分けて説明する：
    //   ①表の項目名・基準値・実測値など、元の文章の複数の行を1枚にまとめた
    //   ②行頭の日時（「9:00」等）を日時欄に移した
    //   ③「(基準値: …)」を付けた（表の基準値の列から／アプリが補った）
    //   ④単位の省略された値に単位を補った
    //   ⑤見出し（「疼痛」等）を先頭に付けた／行の見出し（「家族構成：」等）を本文から外した
    // 1行だけから作られたカードは、残りの違いを文字単位の差分（追加・削除・置き換え）で示す。
    // 同じ行の一部が別のカードになっている場合は「別のカードに分けた」と示す。
    // 全角/半角・大文字/小文字・空白・区切りの記号だけの違いは書き換えとして挙げない。
    // 戻り値：null＝元の文章に見つからない／[]＝書き換え無し／説明の文字列の配列
    const REWRITE_TRIVIAL_REGEX = /^[\s、。,，.．:：;；・\/()（）「」\-~〜]*$/;
    const rewriteNorm = s => (s || '').normalize('NFKC').toLowerCase().replace(SOURCE_MATCH_DASHES, '-').replace(/[〜～]/g, '~').replace(/\s+/g, '');
    function diffTextRuns(a, b) {
      // 文字単位の最長共通部分列（LCS）で、a（元）→ b（カード）の差分を「追加・削除・置き換え」にまとめる
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
      // 空白・区切り記号だけ、または1文字だけの偶然の一致は、前後の変更をつないで1つの変更として扱う
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
      const ranges = findSourceHighlightRanges(sourceText || '', cardText);
      if (!ranges.length) return null;
      const notes = [];
      const lineStart = sourceText.lastIndexOf('\n', ranges[0][0] - 1) + 1;
      const endNl = sourceText.indexOf('\n', ranges[ranges.length - 1][1]);
      const lineEnd = endNl === -1 ? sourceText.length : endNl;
      const lines = sourceText.slice(lineStart, lineEnd).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const linesNorm = rewriteNorm(lines.join(''));
      let body = cardText.trim();

      // ③ 基準値
      const refMatch = body.match(/\s*[(（]基準値[:：]\s*([^)）]*)[)）]\s*$/);
      if (refMatch) {
        const ref = refMatch[1].trim();
        notes.push(linesNorm.includes(rewriteNorm(ref).replace(/\^/g, ''))
          ? `表の基準値の列「${ref}」を「(基準値: …)」として後ろに付けた`
          : `基準値「${ref}」をアプリが補った（元の文章には無い）`);
        body = body.slice(0, refMatch.index).trim();
      }
      // ① 複数行をまとめた
      if (lines.length > 1) notes.push(`元の文章の${lines.length}行（${lines.map(l => `「${l.length > 20 ? l.slice(0, 20) + '…' : l}」`).join('')}）を1枚にまとめた`);
      // ② 行頭の日時
      const ts = item && item.timestamp && item.timestamp !== '日時不明' ? item.timestamp : null;
      let firstLine = lines[0] || '';
      firstLine = firstLine.replace(/^(?:[・○●◯◎□■▪▫◆◇][\s　]*)+/, '');
      if (ts) {
        const tsIdx = firstLine.normalize('NFKC').indexOf(ts);
        if (tsIdx !== -1 && tsIdx <= 2 && !rewriteNorm(body).startsWith(rewriteNorm(ts))) {
          notes.push(`行頭の「${ts}」を本文から外し、日時として記録した`);
          firstLine = firstLine.normalize('NFKC').slice(tsIdx + ts.length).replace(/^[\]】\s]+/, '');
        }
      }
      // ⑤ 見出しの付け外し
      const cardLabel = (body.match(/^([^\d:：「」]{1,20})[:：]\s*/) || [])[1];
      const lineLabel = (firstLine.normalize('NFKC').match(/^([^\d:：「」]{1,20})[:：]\s*/) || [])[1];
      if (cardLabel && rewriteNorm(cardLabel) !== rewriteNorm(lineLabel || '') && !rewriteNorm(firstLine).startsWith(rewriteNorm(cardLabel))) {
        notes.push(`見出し「${cardLabel.trim()}」を先頭に付けた（直前の見出し行から）`);
        body = body.replace(/^([^\d:：「」]{1,20})[:：]\s*/, '');
      }
      // 行の見出しを外したと言えるのは、見出しの直後の本文がこのカードの本文である場合だけ
      // （「輸液量：2,320ml、Hb 10.8g/dl」の「Hb 10.8」のカードでは、見出しは別のカードの側のもの）
      const lineAfterLabel = lineLabel ? firstLine.normalize('NFKC').replace(/^([^\d:：「」]{1,20})[:：]\s*/, '') : '';
      if (lineLabel && !cardLabel && !rewriteNorm(body).startsWith(rewriteNorm(lineLabel)) &&
          rewriteNorm(lineAfterLabel).startsWith(rewriteNorm(body).slice(0, 4))) {
        notes.push(`行の見出し「${lineLabel.trim()}」を本文から外した${item && item.fieldLabel ? `（[${item.fieldLabel}]として表示）` : ''}`);
        firstLine = firstLine.normalize('NFKC').replace(/^([^\d:：「」]{1,20})[:：]\s*/, '');
      }
      if (lines.length > 1) {
        // ④ 単位の補完（表の2列目以降で単位が省略された値）
        // 「23.5×10^4/μL」のような指数表記の単位も1つの単位として扱う
        (body.match(/\d[\d,.]*\s*(?:×\s*10\^?\d+)?[^\s\d(（、,]*/g) || []).forEach(tok => {
          const m = tok.match(/^(\d[\d,.]*)\s*(.+)$/);
          if (!m) return;
          if (!linesNorm.includes(rewriteNorm(tok)) && linesNorm.includes(rewriteNorm(m[1]))) notes.push(`「${m[1]}」に単位「${m[2]}」を補った（同じ行の値から）`);
        });
        return notes;
      }
      // 1行だけのカード：残りの違いを文字単位の差分で示す
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
          case 'merge': return `${(e.from || []).length}枚のカードを統合: ${(e.from || []).map(t => `「${t}」`).join('＋')}`;
          // 【レビューで発見】AIの分類の評価で適用した編集（js/08）は、以前は「aiReviewTags」のような内部の名前だけが出ていた
          case 'aiReviewTags': return `AIの評価でタグを変更: ${tagNamesForLog(e.from)} → ${tagNamesForLog(e.to)}`;
          case 'aiReviewTimestamp': return `AIの評価で日時を変更: ${e.from || '日時不明'} → ${e.to || '日時不明'}`;
          case 'aiReviewType': return `AIの評価で分類を変更: ${EDIT_LOG_TYPE_LABELS[e.from] || e.from || '未設定'} → ${EDIT_LOG_TYPE_LABELS[e.to] || e.to}`;
          case 'aiReview': return Array.isArray(e.from) && e.from.length ? `AIの評価で作り直したカード（元: ${e.from.map(t => `「${t}」`).join('＋')}）` : 'AIの評価で作ったカード';
          default: return e.kind || '不明な編集';
        }
      })();
      return when ? `${when} ${body}` : body;
    }
    // 選択したカード／タグを指摘したカードに共通の書き出し本文。
    // 利用者からの要望により、カードごとに「アプリによる書き換え」「手で編集した履歴」を、
    // 最後に「分類前の文章」（入力欄の文章全体）を添える。
    function buildCardsReportText(cp, items, sourceText, headline, includeSourceText = true, assessmentText = null) {
      let out = `${headline}\n`;
      out += `出力日時: ${new Date().toLocaleString('ja-JP')}\n`;
      out += `※「アプリによる書き換え」は元の文章とカードの文章の違い、「手で編集した履歴」は画面上で行った編集です（手での編集の記録は2026/9/27の機能追加以降の分のみ）。\n`;
      items.forEach((i, idx) => {
        const tags = (i.hendersonIds || []).map(hendersonNameOf).join('、');
        const meta = [
          `分類: ${SELECTED_EXPORT_TYPE_LABELS[i.type] || i.type || '未分類'}`,
          `日時: ${i.timestamp || '日時不明'}`,
          i.fieldLabel ? `見出し: ${i.fieldLabel}` : null,
          `タグ: ${tags || 'なし'}`
        ].filter(Boolean).join(' ／ ');
        const excerpt = sourceExcerptForCard(sourceText, i.text);
        out += `\n■ ${idx + 1}件目\n`;
        out += `${meta}\n`;
        out += `カードの内容: ${i.text}\n`;
        out += `元の文章: ${excerpt || '（元の文章の中に見つかりませんでした）'}\n`;
        const edits = Array.isArray(i.editLog) ? i.editLog : [];
        // アプリによる書き換えは、手で編集する前の文章（最初の本文編集の「編集前」）と元の文章を比べる
        // （手で書き足した部分まで「アプリによる書き換え」として挙げないようにするため）。
        const firstTextEdit = edits.find(e => e.kind === 'text' && typeof e.from === 'string');
        const textBeforeManualEdits = firstTextEdit ? firstTextEdit.from : i.text;
        const rewrite = describeAutoRewrite(sourceText, textBeforeManualEdits, { ...i, text: textBeforeManualEdits }, cp.items || []);
        if (rewrite) out += `アプリによる書き換え: ${rewrite.length ? rewrite.join('、') : 'なし（元の文章のまま）'}\n`;
        if (edits.length) {
          out += `手で編集した履歴:\n`;
          edits.forEach(e => { out += `  ・${formatEditLogEntry(e)}\n`; });
        } else {
          out += `手で編集した履歴: なし\n`;
        }
        out += `修正してほしい内容: \n`;
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
    function buildSelectedCardsExportText(cp, selectedIds, sourceText, includeSourceText = true, includeAssessment = false) {
      const ids = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
      const items = (cp.items || []).filter(i => ids.has(i.id));
      return buildCardsReportText(cp, items, sourceText, `修正依頼メモ：${cp.title}（選択したカード ${items.length}件）`, includeSourceText,
        includeAssessment ? buildAssessmentTableText(cp, ids) : null);
    }
    // 総合アセスメント表のページの内容をテキストにする（利用者からの要望：「テキスト書き出しの選択項目に
    // 総合アセスメント表のページを選べるようにしてください」）。画面（renderAssessmentTable）と同じく、
    // 14項目ごとに「未分類／入院前／入院後／不足情報」の欄に分け、S-1・O-1のような通し番号を付ける。
    // 通し番号は常にその項目のすべてのカードで数える（画面と同じ番号にするため）。onlyIds を渡した場合は、
    // そのカードだけを書き出す（選択したカードの書き出し用）。
    const ASSESSMENT_COL_ORDER = [['unclassified', '未分類'], ['preadmission', '入院前'], ['postadmission', '入院後'], ['missing', '不足情報']];
    function buildAssessmentTableText(cp, onlyIds = null) {
      const activeItems = (cp.items || []).filter(i => i.type !== 'unnecessary');
      const include = i => !onlyIds || onlyIds.has(i.id);
      let out = '';
      HENDERSON_NEEDS.forEach(need => {
        const matching = activeItems.filter(i => i.hendersonIds?.includes(need.id));
        const seqLabels = assessmentSeqLabels(matching, need.id);
        const shown = matching.filter(include);
        if (onlyIds && shown.length === 0) return; // 選択したカードの書き出しでは、該当するカードの無い項目は省く
        out += `\n■ ${need.id}. ${need.name.replace(/^\d+\.\s*/, '')}\n`;
        if (shown.length === 0) { out += '  （カードなし）\n'; return; }
        ASSESSMENT_COL_ORDER.forEach(([col, label]) => {
          const inCol = shown.filter(i => (i.assessmentCols?.[need.id] || 'unclassified') === col);
          if (inCol.length === 0) return;
          out += `  [${label}]\n`;
          const dayGroups = assessmentDayGroups(col, inCol);
          dayGroups.forEach(g => { if (g.day) out += `   〈${g.day}〉\n`; g.items.forEach(i => {
            const seq = seqLabels[i.id] ? `${seqLabels[i.id]} ` : '';
            const time = i.timestamp && i.timestamp !== '日時不明' ? `[${i.timestamp}] ` : '';
            const label = (i.fieldLabel ? `[${i.fieldLabel}] ` : '') + (isFamilySpeech(i.text) ? '[家族] ' : '');
            out += `    ・${seq}${time}${label}${i.text}${i.aiSuggested ? '（AI推定）' : ''}\n`;
          }); });
        });
      });
      return out;
    }
    // 書き出す内容を選ぶ（総合アセスメント表・分類前の文章を含めるか）。前回選んだ内容を覚えておく。
    // 戻り値：{ includeAssessment, includeSourceText }／キャンセルした場合は null
    const EXPORT_OPTIONS_STORAGE_KEY = 'export_options_v1';
    function askExportOptions(title) {
      return new Promise(resolve => {
        const modal = document.getElementById('modal-export-options');
        const optAssessment = document.getElementById('export-opt-assessment');
        const optSource = document.getElementById('export-opt-source');
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem(EXPORT_OPTIONS_STORAGE_KEY) || '{}') || {}; } catch (e) { saved = {}; }
        optAssessment.checked = !!saved.includeAssessment;
        optSource.checked = !!saved.includeSourceText;
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
          try { localStorage.setItem(EXPORT_OPTIONS_STORAGE_KEY, JSON.stringify(result)); } catch (e) { /* 保存できなくても書き出しは続ける */ }
          finish(result);
        };
        document.getElementById('btn-cancel-export-options').onclick = () => finish(null);
        document.getElementById('btn-close-export-options').onclick = () => finish(null);
        modal.onclick = e => { if (e.target === modal) finish(null); };
      });
    }
    function downloadTextBlob(blob, filename) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    window.exportSelectedCardsText = async function() {
      const cp = getCurrentPatient();
      if (selectedCardIds.size === 0) return showToast('書き出すカードを選択してください', 'warn');
      const options = await askExportOptions(`選択したカード（${selectedCardIds.size}件）を書き出し`);
      if (!options) return;
      const text = buildSelectedCardsExportText(cp, selectedCardIds, DOM.sourceText.value || cp.sourceText || '', options.includeSourceText, options.includeAssessment);
      const safeTitle = (cp.title || 'カルテ').replace(/[\\/:*?"<>|]/g, '_');
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${safeTitle}_修正依頼_${selectedCardIds.size}件.txt`;
      // ページに一時的に追加してからクリックする（追加しないままだとファイル名が反映されない環境があるため）。
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      // 書き出した後も選択はそのまま残す（続けて選択を追加・解除して書き出し直せるようにするため）。
      showToast(`選択した${selectedCardIds.size}件をテキストファイル（.txt）に書き出しました`, 'success');
    };

    // Word・PDFのどちらでも使う、文書全体（<html>〜</html>）を組み立てる。
    // MS Office独自の名前空間(xmlns:o/xmlns:w)を付けておくと、Wordがこれを見て
    // 「Word文書として開く」を自然に選べるようになる（.docファイルとして保存した場合）。
    // 【注記】このHTML版は現在PDF書き出し（btn-export-pdf）専用。「Word書き出し」ボタンは
    // 上のbuildExportPlainText（プレーンテキスト）を使うよう変更済み（利用者からの要望）。
    function buildExportDocument(cp) {
      const title = escapeHtml(`${cp.title || ''}_看護アセスメント`);
      return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>${title}</title><style>${PRINT_BASE_CSS}
  @page { size: A4 portrait; }
  tr { break-inside: auto; page-break-inside: auto; }
  td { break-inside: auto; }
</style></head><body>${buildExportBodyHtml(cp)}</body></html>`;
    }

    document.getElementById('btn-export-docs').addEventListener('click', async () => {
      const cp = getCurrentPatient();
      const options = await askExportOptions('テキスト書き出し');
      if (!options) return;
      const includeSourceText = options.includeSourceText;
      const safeTitle = (cp.title || 'カルテ').replace(/[\\/:*?"<>|]/g, '_');
      // 【変更】利用者からの要望により、Word用HTML(.doc)ではなくプレーンテキスト(.txt)を
      // 出力するようにした（buildExportPlainTextの説明を参照）。
      const sourceForExport = (DOM.sourceText.value || cp.sourceText || '').trim();
      const sheet = buildExportPlainText(cp) +
        (options.includeAssessment ? `\n【総合アセスメント表】\n${buildAssessmentTableText(cp)}` : '') +
        (includeSourceText
        ? `\n【分類前の文章（カルテ・看護記録入力欄）】\n${sourceForExport || '（入力欄に文章がありません）'}\n`
        : '');
      const blob = new Blob([sheet], { type: 'text/plain;charset=utf-8' });
      // 【レビューで発見】ページに追加しないまま押すと、ファイル名が反映されない・何も起きない環境がある。
      // 選択したカードの書き出しと同じく、一時的に追加してから押し、URLも後で解放する
      downloadTextBlob(blob, `${safeTitle}_看護アセスメント.txt`);
      showToast('テキストファイル（.txt）を自動ダウンロードしました', 'success');
    });

    document.getElementById('btn-export-pdf').addEventListener('click', () => {
      const cp = getCurrentPatient();
      // 以前は新しいタブを開いて印刷していた（ポップアップのブロックで開けないことがあった）。
      // 「印刷 / PDF」と同じく、見えない枠に読み込んで印刷画面を開く。
      printHtmlDocument(buildExportDocument(cp));
      showToast(isMobilePrintTarget() ? '印刷用の見本を開きました。上の「印刷・PDFに保存」を押してください' : '印刷画面を開きます。「送信先」で「PDFに保存」を選ぶとPDFになります', 'info');
    });
