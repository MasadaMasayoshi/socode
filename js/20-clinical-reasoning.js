// 問題の推論 → 理論的裏付け → 患者固有の原因分析 を、症状ごとの知識表から共通の手順で行う。
// 一般的な知識（定義・病態・典型的な原因）は、患者に実際に起きた事実とは分けて扱う。
// 記録にない原因（水分摂取不足など）は作らず、「記録がない」「可能性がある」と書く。
    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['20'] = 'v.257'; // Version stamp (scripts/stamp-version.js)

    const CR_TOPICS = [
      { id: 'bowel', label: '便秘', needs: [3], plan: /便秘|排便|イレウス|腸管|消化管運動/,
        definition: '便が腸内にとどまり、排便の回数や量が減る、または出しにくくなった状態',
        patho: '腸内に便が長くとどまると水分が吸収されて硬くなり、排出しにくくなる。安静・術後・麻酔・オピオイドなどで腸の動きが落ちる、水分や食事の量が減る、腹圧をかけにくいといった要因が重なると起こりやすい。排便がない日数だけでは便秘とは決められず、腹部症状や腸蠕動、排ガスと合わせて判断する',
        triggers: [{ label: '排便がない', re: /排便(?:は|が)?\s*(?:なし|ない|なかった|みられず)|\d+日(?:目)?(?:なし|間.{0,3}なし|排便なし)|便(?:が|は)出(?:ない|ていない)|便秘/, absence: true }],
        findings: [{ label: '腹部の張り・膨満', re: /腹部膨満|お腹が張|おなかが張|腹満|膨満感/ }, { label: '排便時の苦痛・残便感', re: /残便感|いきむ|硬便|兎糞|排便困難/ }],
        causes: [{ label: '安静・活動量の低下', re: /安静|臥床|ベッド上|動けない|動いてない|歩行.{0,4}(?:不可|困難)|離床.{0,4}(?:できず|困難)/ },
          { label: '術後・麻酔による腸蠕動の低下', re: /術後|麻酔|腸蠕動.{0,3}(?:低下|弱|減弱)/ },
          { label: 'オピオイドなどの薬剤', re: /オピオイド|フェンタニル|モルヒネ|オキシコドン|麻薬|トラマドール|抗コリン/ },
          { label: '食事量の低下', re: /(?:食事|摂取|食欲)[^。]{0,8}(?:半分|少な|低下|減|ない)|おなかすかない/ },
          { label: '水分摂取量の低下', re: /水分[^。]{0,8}(?:少な|低下|減|控え|摂れ)/ },
          { label: '床上排泄や人に頼ることへの抵抗', re: /尿器|便器|床上排泄|ポータブル|羞恥|恥ずかし|遠慮|頼れ/ }],
        counter: [{ label: '排ガスがある', re: /排ガス(?:は)?\s*(?:あり|有|認め)/, bearing: '腸管の通過は保たれていると考えられる' }, { label: '腸蠕動がある', re: /腸蠕動(?:は)?\s*(?:あり|聴取|良好|正常)/, bearing: '腸の動きは保たれていると考えられる' }],
        info: [{ label: '入院前の排便習慣', re: /普段|排便習慣|便通|毎日.{0,3}排便|\d回\/(?:日|週)/ }, { label: '便の性状', re: /硬便|軟便|普通便|兎糞|性状|ブリストル/ }, { label: '腸蠕動音', re: /腸蠕動|腸音/ }, { label: '排ガスの有無', re: /排ガス/ }, { label: '水分摂取量', re: /水分[^。]{0,6}(?:\d|量)|飲水|輸液/ }, { label: '下剤・整腸薬の使用', re: /下剤|酸化マグネシウム|センノシド|ラキソ|緩下|整腸/ }],
        note: '排便がない日数だけで、便秘やイレウスとは判断しない。' },
      { id: 'pain', label: '疼痛', needs: [4], plan: /疼痛|痛み/,
        definition: '組織の損傷やその刺激によって生じる、不快な感覚や情動の体験',
        patho: '手術や外傷で組織が傷つくと発痛物質が放出されて痛みが生じ、動かす・荷重するなどの刺激で強まりやすい。痛みは動作の拒否、睡眠や食欲の低下、不安の増強につながり、回復に必要な離床を妨げる',
        triggers: [{ label: '痛みの訴え', re: /痛(?:い|み|くて)|疼痛|NRS|ペインスケール|苦痛表情/ }],
        findings: [{ label: '痛みの強さの数値化', re: /NRS\s*\d|ペインスケール\s*[「]?\d|VAS/ }, { label: '動作による増強', re: /動(?:く|かす|き始め|かし始め)[^。]{0,8}痛|体位変換時|荷重[^。]{0,6}痛/ }],
        causes: [{ label: '手術による組織損傷', re: /術後|手術|創部|骨折/ }, { label: '体動・荷重の刺激', re: /動(?:く|かす)|体位変換|荷重|移乗|リハ/ }, { label: '痛みへの不安・恐怖', re: /怖|不安|こわ|ずれ/ }],
        counter: [{ label: '鎮痛薬で緩和している', re: /鎮痛[^。]{0,8}(?:効|軽減|落ち着)|痛み[^。]{0,6}(?:軽減|落ち着|改善)/, bearing: '痛みは薬で調整できている部分がある' }],
        info: [{ label: '痛みの部位・性質', re: /部位|ズキ|鈍痛|創部痛|右.{0,4}痛/ }, { label: '鎮痛薬の使用と効果', re: /鎮痛|ロキソ|アセリオ|カロナール|レペタン|坐薬/ }, { label: '安静時と動作時の違い', re: /安静時|体位変換時|動作時|体動時/ }],
        note: '痛みの訴えは主観であり、数値・表情・行動と合わせて判断する。' },
      { id: 'nutrition', label: '栄養摂取量の不足', needs: [2], plan: /栄養|摂取|食事/,
        definition: '体が必要とする量の食事・水分を摂れていない状態',
        patho: '食事量が必要量を下回る状態が続くと、体内に蓄えられたエネルギーやたんぱく質が使われ、創傷治癒や筋力の回復が遅れる。ただし食事量が一時的に減っただけでは低栄養とは言えず、期間・体重・検査値を合わせて見る',
        triggers: [{ label: '食事量が少ない', re: /(?:食事|摂取|食欲)[^。]{0,10}(?:半分|少な|低下|減|ない)|おなかすかない|残(?:す|した|食)/ }],
        findings: [{ label: '体重の減少', re: /体重[^。]{0,8}(?:減|低下)/ }, { label: '嚥下・むせ', re: /むせ|嚥下[^。]{0,4}(?:困難|障害|低下)/ }],
        causes: [{ label: '活動量が少なく食欲が出ない', re: /動いてない|おなかすかない|安静/ }, { label: '痛みによる食欲低下', re: /痛[^。]{0,10}食|食[^。]{0,10}痛/ }, { label: '悪心・嘔吐', re: /悪心|嘔気|嘔吐|吐き気/ }, { label: '食事内容・味が合わない', re: /味[^。]{0,6}(?:が薄い|がしない|が合わ)|おいしくない/ }],
        counter: [{ label: '自力で食事を摂取できる', re: /自力摂取|自分で(?:食べ|摂取)|摂取でき/, bearing: '食べる動作は保たれている' }],
        info: [{ label: '摂取量の経過', re: /\d割|全量|半分|摂取量/ }, { label: '体重・BMI', re: /体重|BMI/ }, { label: '嚥下の状態', re: /嚥下|むせ/ }, { label: '入院前の食習慣', re: /食習慣|普段|偏食|1日\d食/ }],
        note: '食事量の低下だけで低栄養とは判断せず、検査値（Albなど）単独でも判断しない。' },
      { id: 'sleep', label: '睡眠の障害', needs: [5], plan: /睡眠/,
        definition: '十分な休息が得られる睡眠がとれていない状態',
        patho: '痛み・不安・環境の変化（音や明るさ、処置）などで入眠や睡眠の維持が妨げられると、回復や痛みの感じ方、日中の活動にも影響する',
        triggers: [{ label: '眠れない', re: /眠れ(?:ない|なかった|ず)|不眠|睡眠[^。]{0,6}(?:不足|とれ(?:ない|ず))/ }],
        findings: [{ label: '夜間の覚醒', re: /夜間[^。]{0,6}(?:覚醒|目が覚め)|中途覚醒/ }],
        causes: [{ label: '痛み', re: /痛[^。]{0,8}眠|眠[^。]{0,8}痛|痛みのため/ }, { label: '不安', re: /不安|心配/ }, { label: '環境の変化', re: /環境|音|明る|ライン|ドレーン|夜間.{0,4}処置/ }],
        counter: [{ label: '眠れている', re: /(?:よく|ぐっすり|十分)?眠れた|(?:よく|ぐっすり|十分)眠れ|睡眠(?:は)?(?:良好|とれ)/, bearing: '睡眠は確保できている' }],
        info: [{ label: '入院前の睡眠習慣', re: /就寝|睡眠時間|睡眠薬/ }, { label: '日中の様子', re: /日中|傾眠|昼寝/ }],
        note: '前日に眠れなくても、最新の記録で眠れていれば現在は改善している。' },
      { id: 'mobility', label: '移動・活動の制限', needs: [4], plan: /可動|廃用|転倒|活動|移動/,
        definition: '体位を変える、移乗する、歩くといった動作を自分の力で安全に行うことが制限された状態',
        patho: '骨折や手術で動かせる範囲や荷重に制限が生じ、痛みや不安が重なると動く機会が減る。動かない状態が続くと筋力低下や関節拘縮、血栓などの合併症が起こりやすい',
        triggers: [{ label: '動作の制限や介助の必要性', re: /介助|見守り|動けない|制限|禁止|免荷|安静|中止|不可/ }],
        findings: [{ label: '移乗・歩行の実施', re: /移乗|歩行訓練|端坐位|車いす|車椅子/ }],
        causes: [{ label: '痛み', re: /動[^。]{0,8}痛|痛[^。]{0,8}動|疼痛/ }, { label: '脱臼や転倒への不安', re: /ずれ|脱臼|怖|不安|転倒/ }, { label: '治療による制限', re: /股関節|屈曲禁止|荷重|牽引|固定|安静/ }, { label: '入院前からの筋力・バランスの低下', re: /筋力|バランス|ふらつき|MMT/ }],
        counter: [{ label: '自力で動作ができる', re: /自力で|自分で[^。]{0,6}(?:動|移|立)|ひとりで/, bearing: '自分で行える動作を足がかりに離床を進められる' }],
        info: [{ label: '入院前のADL', re: /ADL|自立|入院前/ }, { label: '筋力（MMT）', re: /MMT|筋力/ }, { label: '退院後の住環境', re: /階段|2階|段差|住居|布団/ }],
        note: '動作の改善は、動作そのものの記録で確かめ、他の側面の改善とは分けて見る。' },
      // Scope: need 14 in any phase. A question or 「わからない」 about daily life, movement or drugs shows a knowledge gap; it is
      // expected before teaching, so the problem is the gap itself plus readiness to learn, never a lack of will.
      { id: 'knowledge', label: '療養生活に関する知識の不足', needs: [14], plan: /知識|指導|理解|学習/,
        definition: '回復や退院後の生活に必要な知識・技術を、まだ十分に持てていない状態',
        patho: '初めての手術や入院では、動いてよい範囲や生活上の注意を知らないことが不安や行動の控えにつながる。説明や練習を重ねることで、自分で判断して行動できるようになる',
        triggers: [{ label: '知りたいこと・わからないことの表明', re: /わから(?:ない|ず)|教えて|知りたい|どうすれば|気を付け(?:ないと|る)[^。]{0,8}(?:か|わから)/ }],
        findings: [{ label: '術後の動作や治療についての質問', re: /いいの[?？]|大丈夫なの[?？]|しないかしら|ですか[?？]|でしょうか|のかな/ }],
        causes: [{ label: '初めての入院・手術', re: /初めて/ }, { label: '鎮痛薬の使い方の思い込み', re: /我慢できなくなってから|痛み止め[^。]{0,10}我慢/ }, { label: '生活上の注意の指導が未実施', re: /指導を行う予定|今後指導|(?:説明|指導)(?:は)?(?:未|まだ)/ }, { label: '脱臼・転倒への不安', re: /ずれ|脱臼|怖|転倒/ }],
        counter: [{ label: '理解力が保たれている', re: /理解(?:力)?(?:あり|良好)|理解している|理解できている/, bearing: '説明を受け止めて活かす力がある' }],
        info: [{ label: '理解力', re: /理解/ }, { label: '退院後の生活環境', re: /階段|2階|布団|一人暮らし|独居|住居|家の中/ }, { label: '学習への意欲', re: /頑張|教えて|知りたい|よくなって帰りたい/ }],
        note: '知識の不足は、意欲や意思の弱さとは区別する。説明を受ける前の不足は当然であり、本人の関心と理解力を手がかりに指導の時期と内容を決める。' },
      // Scope: self-care of cleanliness/dressing after surgery or fracture (needs 6 and 8); the cause is read from the record, not assumed.
      { id: 'selfcare', label: 'セルフケア不足（清潔・更衣）', needs: [6, 8], plan: /清潔|更衣|入浴|清拭|セルフケア/,
        definition: '入浴・清拭・更衣などの動作を、必要な水準まで自分で行えない状態',
        patho: '動作の制限や痛み、ライン類があると、体を動かして洗う・着替える動作が難しくなり、清潔の保持を介助に頼ることになる',
        triggers: [{ label: '清潔・更衣への介助', re: /清拭|陰部洗浄|全介助|入浴(?:不可|できない|禁止)|更衣[^。]{0,6}介助|介助[^。]{0,6}更衣/ }, { label: '体が清潔に保てないことによる不快感', re: /べたつき|べたべた|気持ち(?:が)?悪|お風呂に入りたい/ }],
        findings: [{ label: '清拭・更衣の実施', re: /清拭|更衣|陰部洗浄|洗髪/ }],
        causes: [{ label: '痛み', re: /疼痛|痛[^。]{0,8}(?:動|増強)|動[^。]{0,8}痛/ }, { label: '動作の制限', re: /屈曲禁止|荷重|安静|牽引|固定|ベッド上|禁止/ }, { label: 'ラインやドレーン', re: /ドレーン|SBチューブ|カテーテル|ルート|点滴/ }, { label: '脱臼や転倒への不安', re: /怖|不安|ずれ|脱臼/ }],
        counter: [{ label: '一部は自分で行える', re: /自分で[^。]{0,8}(?:洗|拭|着替|更衣|歯磨)|洗面[^。]{0,6}自立|歯磨き[^。]{0,6}(?:自立|自分)/, bearing: '行える動作が残っている' }],
        info: [{ label: '入院前の清潔習慣', re: /入浴|洗髪|歯磨き|きれい好き/ }, { label: '皮膚の状態', re: /皮膚|発赤|掻痒|湿疹/ }, { label: '本人の希望', re: /お風呂に入りたい|さっぱり|気持ち(?:が)?悪/ }],
        note: '清潔の保持（皮膚の状態）と、清潔動作を自分で行える度合いは分けて評価する。入院前の自立は、術後の自立を意味しない。' }
    ];

    function crCards(cp) { return (cp.items || []).filter(i => i && !i.deleted && !i.aiSuggested && i.type !== 'unnecessary' && !i.diseaseGeneral && i.text); }
    function crScan(cards, list, mode) {
      const out = [];
      list.forEach(def => {
        const ids = [];
        cards.forEach(c => String(c.text).normalize('NFKC').split(/[。\n]/).forEach(cl => {
          if (!def.re.test(cl)) return;
          const aff = def.absence || mode === 'info' ? true : (typeof cvAffirmed === 'function' ? !!cvAffirmed(def.re, cl) : true);
          if (mode === 'contra') { if (aff) ids.push(c.id); }
          else if (mode === 'neg') { if (!aff) ids.push(c.id); }
          else if (aff) ids.push(c.id);
        }));
        if (ids.length) out.push({ label: def.label, bearing: def.bearing, ids: [...new Set(ids)].slice(0, 3) });
      });
      return out;
    }
    // 1つのテーマについて、記録に基づく推論の結果を返す（創作はしない）
    function crAnalyzeTopic(cp, topic) {
      // Pre-admission records are the baseline: they inform what is missing, but are not signs of the present problem.
      const all = crCards(cp); const cur = all.filter(c => String(c.timestamp || '').trim() && !/^入院前/.test(String(c.timestamp))); const cards = cur.length ? cur : all.filter(c => !/^入院前/.test(String(c.timestamp || '')));
      const trig = crScan(cards, topic.triggers, 'pos');
      const finds = crScan(cards, topic.findings, 'pos');
      const supported = crScan(cards, topic.causes, 'pos');
      const contradictedCause = crScan(cards, topic.causes, 'neg');
      const counter = crScan(cards, topic.counter, 'contra');
      const infoHave = crScan(all, topic.info, 'info').map(x => x.label);
      const missing = topic.info.map(x => x.label).filter(l => !infoHave.includes(l));
      const have = new Set(supported.map(x => x.label));
      const contradicted = contradictedCause.filter(x => !have.has(x.label));
      const possible = topic.causes.map(x => x.label).filter(l => !have.has(l) && !contradicted.some(x => x.label === l));
      const dx = all.some(c => new RegExp(topic.label + '(?:と診断|あり|症|が続|傾向)').test(String(c.text).normalize('NFKC')) && !/疑い|可能性|なし/.test(String(c.text)));
      let status = 'none';
      // Resolved: a counter-finding recorded on the latest day that any trigger appears (e.g. 「眠れた」 the day after 「眠れなかった」).
      const dayOf = id => { const c = all.find(x => x.id === id); return c && typeof suffDayOf === 'function' ? suffDayOf(c) : null; };
      const trigDays = trig.flatMap(x => x.ids.map(dayOf)), ctrDays = counter.flatMap(x => x.ids.map(dayOf));
      const resolved = trig.length && ctrDays.length && ctrDays.every(d => d !== null) && trigDays.every(d => d !== null) && Math.max(...ctrDays) > Math.max(...trigDays);
      if (trig.length) status = (dx || (trig.length && finds.length >= 1 && supported.length >= 1)) ? 'supported' : (finds.length || supported.length ? 'suspected' : 'insufficient');
      if (dx) status = 'confirmed';
      if (resolved && status !== 'confirmed') status = 'resolved';
      return { topic, status, triggers: trig, findings: finds, supported, contradicted, counter, possible, missing };
    }
    function crTopicsForNeed(cp, needId) {
      return CR_TOPICS.filter(t => t.needs.includes(needId)).map(t => crAnalyzeTopic(cp, t)).filter(r => r.status !== 'none' && r.status !== 'resolved');
    }
    // A finding label used as a noun in a sentence: 「食事量が少ない」→「食事量が少ないこと」, 「介助が必要」→「介助が必要なこと」.
    function crNoun(label) {
      const l = String(label || '');
      if (/(?:必要|可能|困難|不十分|不安定|不良)$/.test(l)) return l + 'なこと';
      if (/[いるたずう]$|ない$/.test(l)) return l + 'こと';
      return l;
    }
    // 文章にする。labels は 記録のカードIDからS-1/O-2を引く辞書。
    function crNarrative(r, labels) {
      const L = ids => { const o = [...new Set((ids || []).map(id => labels && labels[id]).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'ja', { numeric: true })); return o.length ? `（${o.join('・')}）` : ''; };
      const t = r.topic, out = [];
      const fact = [...r.triggers, ...r.findings].map(x => `${crNoun(x.label)}${L(x.ids)}`);
      const lead = fact.length > 1 ? `${fact.slice(0, -1).join('、')}、${fact[fact.length - 1]}` : fact[0];
      const w = { confirmed: `${t.label}があると記録されている。`, supported: `${t.label}があると考える。`, suspected: `${t.label}の可能性を考える。ただし、これだけで${t.label}とは言えない。`, insufficient: `${t.label}の可能性はあるが、判断できる情報が足りない。` }[r.status];
      out.push(`${lead}から、${w}`);
      // The general explanation is kept to the definition and its first mechanism sentence; the patient's own record carries the rest.
      out.push(`一般に、${t.label}とは${t.definition}。${String(t.patho || '').split('。')[0]}。`);
      const parts = [];
      if (r.supported.length) parts.push(`A氏の場合は、${r.supported.map(x => `${x.label}${L(x.ids)}`).join('、')}が関係していると考えられる`.replace(/^A氏の場合は/, 'この患者では'));
      if (r.contradicted.length) parts.push(`${r.contradicted.map(x => `${x.label}${L(x.ids)}`).join('、')}は記録上みられない`);
      if (r.counter.length) parts.push(`一方で、${r.counter.map(x => `${crNoun(x.label)}${L(x.ids)}`).join('、')}から、${r.counter[0].bearing || '判断の材料になる'}`);
      if (parts.length) out.push(parts.join('。') + '。');
      const nonDoc = r.possible.filter(l => !r.supported.some(x => x.label === l));
      const ask = [];
      if (nonDoc.length && r.status !== 'none') ask.push(`${nonDoc.slice(0, 3).join('・')}が関わっているかは記録からはわからない`);
      if (r.missing.length) ask.push(`${r.missing.slice(0, 4).join('・')}の記録がないため、確認して判断を確かにする`);
      if (ask.length) out.push(ask.join('。') + '。');
      if (t.note) out.push(t.note);
      return out;
    }
    function crProblemLine(r) {
      const t = r.topic;
      const fac = r.supported.slice(0, 2).map(x => crNoun(x.label));
      const base = fac.length ? `${fac.join('、')}に関連した${t.label}` : `${t.label}`;
      return r.status === 'confirmed' || r.status === 'supported' ? base : `（候補）${base}の疑い：追加のアセスメントで確かめる`;
    }
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { crNoun, CR_TOPICS, crAnalyzeTopic, crTopicsForNeed, crNarrative, crProblemLine });
