// Genogram (家族構成図): built from the record, then editable. Mirrors the relation map pattern (auto build -> edit -> save with the patient -> export).
// Kinship words are a built-in dictionary (内蔵辞書 2026-10-16（出典未確認）). Nothing is invented: only members, ages and notes written in the record are drawn.

    (window.APP_FILE_VERSIONS = window.APP_FILE_VERSIONS || {})['16'] = 'v.107'; // Version stamp (scripts/stamp-version.js)

    const GG_PROVENANCE = '内蔵辞書 2026-10-16（出典未確認）';
    // canonical key -> [role label, sex, generation, order within the row]
    const GG_KIN = {
      father: ['父', 'm', -1, 1], mother: ['母', 'f', -1, 2], fil: ['義父', 'm', -1, 3], mil: ['義母', 'f', -1, 4],
      gfather: ['祖父', 'm', -2, 1], gmother: ['祖母', 'f', -2, 2], gfatherP: ['祖父（父方）', 'm', -2, 1], gmotherP: ['祖母（父方）', 'f', -2, 2], gfatherM: ['祖父（母方）', 'm', -2, 3], gmotherM: ['祖母（母方）', 'f', -2, 4],
      brotherO: ['兄', 'm', 0, 1], sisterO: ['姉', 'f', 0, 2], brotherY: ['弟', 'm', 0, 5], sisterY: ['妹', 'f', 0, 6], sibling: ['きょうだい', 'u', 0, 5.5],
      wife: ['妻', 'f', 0, 4], husband: ['夫', 'm', 0, 4], spouse: ['配偶者', 'u', 0, 4], partner: ['パートナー', 'u', 0, 4],
      son1: ['長男', 'm', 1, 1], son2: ['次男', 'm', 1, 2], son3: ['三男', 'm', 1, 3], daughter1: ['長女', 'f', 1, 5], daughter2: ['次女', 'f', 1, 6], daughter3: ['三女', 'f', 1, 7],
      son: ['息子', 'm', 1, 4], daughter: ['娘', 'f', 1, 8], child: ['子', 'u', 1, 9], grandchild: ['孫', 'u', 2, 1], other: ['同居人', 'u', 0, 9]
    };
    const GG_WORDS = [
      ['義父母', ['fil', 'mil']], ['両親', ['father', 'mother']], ['父母', ['father', 'mother']],
      ['義父', 'fil'], ['義母', 'mil'], ['祖父母', ['gfather', 'gmother']], ['祖父', 'gfather'], ['祖母', 'gmother'],
      ['長男', 'son1'], ['次男', 'son2'], ['三男', 'son3'], ['長女', 'daughter1'], ['次女', 'daughter2'], ['三女', 'daughter3'],
      ['息子', 'son'], ['娘', 'daughter'], ['子ども', 'child'], ['子供', 'child'], ['こども', 'child'], ['お子さん', 'child'], ['お子様', 'child'],
      ['兄弟', 'sibling'], ['姉妹', 'sibling'], ['きょうだい', 'sibling'],
      ['お父さん', 'father'], ['父親', 'father'], ['お母さん', 'mother'], ['母親', 'mother'],
      ['配偶者', 'spouse'], ['パートナー', 'partner'], ['内縁の妻', 'wife'], ['内縁の夫', 'husband'],
      ['父', 'father'], ['母', 'mother'], ['兄', 'brotherO'], ['姉', 'sisterO'], ['弟', 'brotherY'], ['妹', 'sisterY'], ['妻', 'wife'], ['夫', 'husband'], ['孫', 'grandchild']
    ];
    const GG_WORD_RE = new RegExp(GG_WORDS.map(w => w[0]).sort((a, b) => b.length - a.length).join('|'), 'g');
    const GG_AFTER_BAD = { 母: /^[乳子体性校国語方]/, 父: /^[兄性方]/, 弟: /^子/, 夫: /^婦/, 娘: /^[心]/ };
    const GG_BEFORE_BAD = { 夫: /[丈工大]$/, 孫: /子$/, 母: /(?:保|助産|祖父)$/ };
    const GG_DISEASES = /糖尿病|高血圧|認知症|アルツハイマー|胃がん|大腸がん|肺がん|乳がん|肝臓がん|がん|癌|心筋梗塞|狭心症|脳梗塞|脳出血|脳卒中|心不全|心疾患|喘息|腎不全|腎臓病|肝硬変|白血病|うつ病|統合失調症|パーキンソン病|骨折|難聴|寝たきり|要介護\d?|要支援\d?|障害/g;
    const GG_JOBS = /会社員|公務員|自営業|主婦|無職|教員|農業|パート|年金生活|学生|看護師|医師|漁業|大工|運転手/;
    const GG_DECEASED = /死亡|他界|逝去|亡くな|死去|死別|故人|永眠/;
    const GG_NEG = /^(?:は|も|が)?(?:いない|いません|なし|無し|おらず|いなかった|はいない)/;

    function ggNorm(t) { return String(t || '').normalize('NFKC'); }
    function ggTrim(s, n = 60) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; }
    function ggTokens(sentence) {
      const out = [];
      GG_WORD_RE.lastIndex = 0;
      let m, gp = null;
      while ((m = GG_WORD_RE.exec(sentence)) !== null) {
        const w = m[0], after = sentence.slice(m.index + w.length), before = sentence.slice(0, m.index);
        if (GG_AFTER_BAD[w] && GG_AFTER_BAD[w].test(after)) continue;
        if (GG_BEFORE_BAD[w] && GG_BEFORE_BAD[w].test(before)) continue;
        // v.101: generic child words need an explicit count (or a negation); talk about children in general is not a family member.
        if (/^(?:子ども|子供|こども|お子さん|お子様)$/.test(w) && !(/^(?:が|は|も)?\s*\d\s*人/.test(after) || /\d\s*人の$/.test(before) || GG_NEG.test(after))) continue;
        let keys = [].concat(GG_WORDS.find(x => x[0] === w)[1]);
        // v.103: grandparents are told apart by side (父方の/母方の); a later 祖父/祖母 in the same list (e.g. in brackets) keeps the side. Without any side word the key stays unspecified.
        if (/^(?:祖父|祖母|祖父母)$/.test(w)) {
          let side = (/(父方|母方)の?$/.exec(before) || [])[1] || '';
          if (!side && gp && m.index - gp.end <= 14 && !/[。]/.test(sentence.slice(gp.end, m.index)) && !/(?:母方|父方)/.test(sentence.slice(gp.end, m.index))) side = gp.side;
          if (side) keys = keys.map(k => k + (side === '父方' ? 'P' : 'M'));
          gp = side ? { side, end: m.index + w.length } : null;
        } else if (gp && m.index - gp.end > 14) gp = null;
        out.push({ word: w, keys, index: m.index, end: m.index + w.length, after, before });
      }
      return out;
    }
    function ggSentences(cp) {
      const seen = new Set(), out = [];
      const add = t => String(t || '').split(/\r?\n/).forEach(line => ggNorm(line).replace(/「[^」]*」/g, '「」').split(/(?<=。)/).forEach(s => { s = s.trim(); const k = s.replace(/\s+/g, ''); if (s.length >= 2 && !seen.has(k)) { seen.add(k); out.push(s); } }));
      add(cp && cp.sourceText);
      ((cp && cp.items) || []).filter(i => i && !i.deleted && i.type !== 'unnecessary').forEach(i => add(i.text));
      return out;
    }
    // ---- extraction -------------------------------------------------------
    function ggExtract(cp) {
      const sentences = ggSentences(cp);
      const people = new Map(), none = new Set(), order = [];
      let generic = null, householdSize = 0;
      const get = (key, extra) => {
        if (!people.has(key)) {
          const base = key.replace(/#\d+$/, ''), k = GG_KIN[base] || GG_KIN.other;
          people.set(key, Object.assign({ id: key, role: k[0], sex: k[1], gen: k[2], ord: k[3], age: null, ageText: '', deceased: false, index: false, occupation: '', notes: [], living: '', keyPerson: false, caregiver: false, quality: '', partner: null, partnerStatus: '', parents: [], sibGroup: '', src: [], manual: false }, extra || {}));
          order.push(key);
        }
        return people.get(key);
      };
      const note = (p, s) => { if (s && !p.notes.includes(s)) p.notes.push(s); };
      const src = (p, s) => { const t = ggTrim(s); if (t && !p.src.includes(t) && p.src.length < 3) p.src.push(t); };
      sentences.forEach(sent => {
        const toks = ggTokens(sent);
        const clauses = sent.split(/[、，,;；]/);
        let pos = 0, prevKeys = [];
        clauses.forEach(clause => {
          const cStart = sent.indexOf(clause, pos); pos = cStart + clause.length;
          const ct = toks.filter(t => t.index >= cStart && t.index < cStart + clause.length);
          const keysHere = [], tokIds = [];
          ct.forEach(t => {
            const before0 = keysHere.length;
            // negation: 子どもはいない / 兄弟なし
            if (GG_NEG.test(t.after)) { tokIds.push([]); t.keys.forEach(k => none.add(/^son|^daughter|^child/.test(k) ? 'child' : /^brother|^sister|^sibling/.test(k) ? 'sibling' : /^wife|^husband|^spouse|^partner/.test(k) ? 'spouse' : k)); return; }
            // possessive spouse: 長男の妻 / 長男夫婦
            const poss = /(長男|次男|三男|長女|次女|三女|息子|娘|兄|姉|弟|妹)(?:の)?$/.exec(t.before);
            const couple = /^夫婦/.test(t.after) && !/^(?:妻|夫|配偶者|パートナー)$/.test(t.word);
            t.keys.forEach(k => {
              let key = k, p;
              const cnt = (new RegExp('^(?:が|は|も)?\\s*(\\d)\\s*人').exec(t.after) || [])[1];
              if (poss && /^(?:wife|husband|spouse)$/.test(k)) {
                const ownerKey = GG_WORDS.find(x => x[0] === poss[1])[1];
                const owner = get(Array.isArray(ownerKey) ? ownerKey[0] : ownerKey); src(owner, sent);
                key = `${poss[1]}の${GG_KIN[k][0]}`;
                p = get(key, { role: key, sex: GG_KIN[k][1], gen: owner.gen, ord: owner.ord + 0.5, partner: owner.id, partnerStatus: '' });
                owner.partner = owner.partner || p.id;
              } else if (cnt && /^(?:son|daughter|child|sibling|brother|sister|grandchild)/.test(k) && Number(cnt) > 1 && Number(cnt) <= 8) {
                for (let n = 1; n <= Number(cnt); n++) { const q = get(`${k}#${n}`, { role: `${GG_KIN[k][0]}${n}` }); src(q, sent); keysHere.push(q.id); }
                tokIds.push(keysHere.slice(before0)); return;
              } else { p = get(key); }
              src(p, sent); keysHere.push(p.id);
              if (couple && !/^(?:wife|husband|spouse|partner)/.test(k)) {
                const sp = get(`${GG_KIN[k][0]}の配偶者`, { role: `${GG_KIN[k][0]}の配偶者`, sex: 'u', gen: p.gen, ord: p.ord + 0.5, partner: p.id });
                p.partner = p.partner || sp.id; src(sp, sent); keysHere.push(sp.id);
              }
              const a = new RegExp('^[^、。\\d]{0,4}?[（(]?(\\d{1,3})\\s*[歳才]').exec(t.after) || new RegExp('(\\d{1,3})\\s*[歳才](?:の|で)?$').exec(t.before.slice(-8));
              if (a && t.word !== '祖父母') p.age = Number(a[1]);
              else { const d = new RegExp('^[^、。\\d]{0,4}?(\\d0)代').exec(t.after); if (d) p.ageText = `${d[1]}代`; }
              if (/^(?:内縁)/.test(t.word)) p.partnerStatus = 'cohabiting';
            });
            tokIds.push(keysHere.slice(before0));
          });
          const ids = Array.from(new Set(keysHere));
          if (!ids.length) {
            // a following clause that only adds a disease to the previous member ("父は糖尿病、高血圧")
            const dz = clause.match(GG_DISEASES);
            // a following clause about distance/separation applies to the members of the previous clause ("母方の祖父母は健在だが、遠方のため…")
            if (prevKeys.length && /遠方|遠く|離れて/.test(clause) && !/同居/.test(clause)) prevKeys.forEach(k => { const q = people.get(k); if (q && !q.living) q.living = '別居'; });
            if (dz && prevKeys.length === 1 && clause.trim().length <= 14 && !/本人|患者|教室|指導|診断|療養|入院|説明|治療/.test(clause)) dz.forEach(d => note(people.get(prevKeys[0]), d));
            return;
          }
          prevKeys = ids;
          const dec = GG_DECEASED.test(clause);
          // attributes of one member (age, disease, job) come from the text between its word and the next member word
          ct.forEach((t, ti) => {
            const segStart = ti === 0 ? Math.max(0, t.index - cStart - 6) : t.index - cStart, segEnd = ti + 1 < ct.length ? ct[ti + 1].index - cStart : clause.length;
            const seg = clause.slice(segStart, Math.min(segEnd, segStart + 24)), jseg = seg.slice(0, 14).replace(/^(.*?)(?:うえ|ほか|さらに|一方|のみならず).*$/, '$1');
            (tokIds[ti] || []).forEach(id => {
              const p = people.get(id); if (!p) return;
              (seg.replace(/(?:糖尿病|高血圧|がん|癌)(?=教室|指導|療養|療法|外来|病棟|食)/g, ' ').match(GG_DISEASES) || []).forEach(d => note(p, d));
              const j = seg.match(GG_JOBS); if (j) { const jr = j[0]; if (new RegExp('^[^、。と]{0,3}[（(][^）)]{0,14}' + jr).test(seg) || new RegExp('^[^、。とのを]{1,4}(?:は|が|も)[^、。とのを]{0,5}' + jr + '(?!の|部|顧問)').test(seg)) { if (!/^(?:看護師|医師)$/.test(jr) || new RegExp('^.{1,5}?(?:は|が)?.{0,3}' + jr + '(?:として|である|です|で働|をして|だ)|[（(][^）)]{0,14}' + jr).test(seg)) p.occupation = jr; } }
            });
          });
          ids.forEach(id => {
            const p = people.get(id);
            if (dec) p.deceased = true;
            if (/同居|二人暮らし|2人暮らし|同じ家/.test(clause) && !/別居/.test(clause)) p.living = '同居';
            if (/別居|別世帯|遠方/.test(clause)) p.living = '別居';
            if (/施設|ホーム|入所/.test(clause)) p.living = '施設';
            if (/離婚|元妻|元夫/.test(clause)) p.partnerStatus = 'divorced';
            else if (/別居(?:中|婚)?/.test(clause) && /夫婦|妻|夫/.test(p.role)) p.partnerStatus = 'separated';
            if (/内縁|事実婚/.test(clause)) p.partnerStatus = 'cohabiting';
            if (/仲(?:が)?(?:良|よ)|良好/.test(clause)) p.quality = 'close';
            if (/疎遠|交流(?:が)?(?:ない|少な)|連絡(?:を)?(?:とって|取って)いない|絶縁/.test(clause)) p.quality = 'distant';
            if (/不仲|仲(?:が)?悪|折り合い(?:が)?悪|対立/.test(clause)) p.quality = 'conflict';
            const al = GG_WORDS.filter(w => [].concat(w[1]).includes(p.id.replace(/#\d+$/, ''))).map(w => w[0]).concat(p.role.replace(/[()]/g, ''));
            if (/介護/.test(clause) && new RegExp(`(?:${al.join('|')})の介護`).test(clause)) note(p, '介護の記載あり（誰が誰を介護するかは原文で確認）');
            if (new RegExp(`(?:${al.join('|')})(?:が|による|に)(?:主に|主として)?(?:介護|世話|面倒|付き添)`).test(clause)) p.caregiver = true;
          });
        });
        // "AとBと同居": a living-together clause covers the member words listed before it in the same sentence (unless the sentence is about death, illness or separation)
        if (/同居|二人暮らし|[2-9二三四五六七八九]人暮らし/.test(sent) && !/別居|別世帯/.test(sent) && !GG_DECEASED.test(sent) && !GG_DISEASES.test(sent)) {
          GG_DISEASES.lastIndex = 0;
          toks.forEach(t => t.keys.forEach(k => { const p = people.get(k); if (p && !p.living && !GG_NEG.test(t.after)) p.living = '同居'; }));
        }
        GG_DISEASES.lastIndex = 0;
        { const hs = /([2-9２-９]|[二三四五六七八九十])\s*人暮らし/.exec(sent); if (hs && !householdSize) householdSize = '二三四五六七八九十'.includes(hs[1]) ? '二三四五六七八九十'.indexOf(hs[1]) + 2 : Number(hs[1]); }
        // v.103: a documented caring role ("祖母が、きょうだいの世話をしている") is kept as caregiver/support; it never makes a formal key person.
        toks.forEach((t, ti) => {
          if (GG_NEG.test(t.after) || /^(?:の|と|や)/.test(t.after)) return;
          const nx = toks.slice(ti + 1).find(u => /^(?:が|は)/.test(u.after)), nextIdx = nx ? nx.index : sent.length;
          const seg = sent.slice(t.end, nextIdx);
          const cm = /^(?:が|は)[、，]?[^。]{0,24}?(?:([^。、]{1,10})の)?(?:世話|介護|面倒を見|付き添)(?:を|は)?(?:して|している|する|担)/.exec(seg);
          if (!cm) return;
          t.keys.forEach(k => { const q = people.get(k); if (!q) return; q.caregiver = true; src(q, sent); if (cm[1]) note(q, `${cm[1]}の世話の記載あり`); });
        });
        // key person / caregiver statements ("キーパーソンは長男の妻")
        const kp = /キーパーソン(?:は|:|：)?\s*([^。、]*)/.exec(sent);
        if (kp && !/^(?:なし|不在|不明|未定)/.test(kp[1])) ggTokens(kp[1]).filter(t => !/^の(?:妻|夫|配偶者)/.test(t.after)).forEach(t => t.keys.forEach(k => {
          const poss = /(長男|次男|三男|長女|次女|三女|息子|娘|兄|姉|弟|妹)の$/.exec(kp[1].slice(0, t.index));
          const key = poss && /^(?:wife|husband|spouse)$/.test(k) ? `${poss[1]}の${GG_KIN[k][0]}` : k;
          const p = people.get(key); if (p) { p.keyPerson = true; src(p, sent); }
        }));
        const cg = /(?:主)?介護者(?:は|:|：)?\s*([^。、]*)/.exec(sent);
        if (cg && !/^(?:なし|不在|不明)/.test(cg[1])) ggTokens(cg[1]).filter(t => !/^の(?:妻|夫|配偶者)/.test(t.after)).forEach(t => t.keys.forEach(k => { const poss = /(長男|次男|三男|長女|次女|三女|息子|娘|兄|姉|弟|妹)の$/.exec(cg[1].slice(0, t.index)); const p = people.get(poss && /^(?:wife|husband|spouse)$/.test(k) ? `${poss[1]}の${GG_KIN[k][0]}` : k); if (p) { p.caregiver = true; src(p, sent); } }));
        // other co-residents (friend etc.)
        const fr = /(?:同居(?:している|の)?|と同居)\s*(友人|知人|ルームメイト|同居人)|(友人|知人)と(?:二人暮らし|同居)/.exec(sent);
        if (fr) { const p = get('other', { role: fr[1] || fr[2], living: '同居' }); src(p, sent); }
        if (/一人暮らし|ひとり暮らし|独居/.test(sent) && !/^$/.test(sent)) generic = generic || { alone: true, s: sent };
        else if (/家族/.test(sent) && /同居|構成|キーパーソン|介護|支援|サポート|面会|来院|付き添/.test(sent) && !ggTokens(sent).length && !generic) generic = { s: sent };
      });
      // resolve generic child words against specific ones
      const keys = Array.from(people.keys());
      const spec = keys.filter(k => /^(?:son|daughter)[123]$/.test(k));
      ['son', 'daughter', 'child'].forEach(g => {
        if (people.has(g) && (spec.some(k => g === 'child' || k.startsWith(g)))) { const q = people.get(g); const t = people.get(spec.find(k => g === 'child' || k.startsWith(g))); q.notes.forEach(n => note(t, n)); people.delete(g); }
        if (none.has('child') && !keys.some(k => /^(?:son|daughter|child)/.test(k) && people.has(k) && people.get(k).src.length)) { /* nothing */ }
      });
      // v.101: a generic sibling word is dropped when specific siblings (兄・姉・弟・妹) are present.
      if (Array.from(people.keys()).some(k => /^(?:brother|sister)[OY]$/.test(k))) people.delete('sibling');
      if (none.has('child')) Array.from(people.keys()).filter(k => /^(?:son|daughter|child)/.test(k) && !/^(?:son|daughter)[123]$/.test(k)).forEach(k => { if (people.get(k).src.every(s => /いない|なし|いません/.test(s))) people.delete(k); });
      if (none.has('sibling')) Array.from(people.keys()).filter(k => /^(?:sibling|brother|sister)/.test(k)).forEach(k => { if (people.get(k).src.every(s => /いない|なし|いません/.test(s))) people.delete(k); });
      if (none.has('spouse')) Array.from(people.keys()).filter(k => /^(?:wife|husband|spouse|partner)$/.test(k)).forEach(k => { if (people.get(k).src.every(s => /いない|なし|いません/.test(s))) people.delete(k); });
      // v.103: an unspecified 祖父/祖母 is folded into the same-sex grandparent when the record leaves only one possible side (or only one side lives in the household); otherwise it stays separate and says the side is unknown.
      [['gfather', 'gfatherP', 'gfatherM'], ['gmother', 'gmotherP', 'gmotherM']].forEach(([u, a1, b1]) => {
        const q = people.get(u); if (!q) return;
        const cand = [a1, b1].filter(k => people.has(k));
        if (!cand.length) return;
        const live = cand.filter(k => people.get(k).living === '同居');
        const target = cand.length === 1 ? cand[0] : live.length === 1 ? live[0] : '';
        if (target) {
          const t = people.get(target);
          q.notes.forEach(n => note(t, n)); q.src.forEach(x => src(t, x));
          t.caregiver = t.caregiver || q.caregiver; t.keyPerson = t.keyPerson || q.keyPerson; t.deceased = t.deceased || q.deceased;
          if (!t.occupation) t.occupation = q.occupation; if (t.age === null) t.age = q.age;
          people.delete(u);
        } else note(q, '父方・母方のどちらか不明（原文で確認）');
      });
      let list = Array.from(people.values());
      if (!list.length && generic && !generic.alone) {
        const f = { id: 'family', role: '家族', sex: 'u', gen: 0, ord: 9, age: null, ageText: '', deceased: false, index: false, occupation: '', notes: [], living: /同居/.test(generic.s) && !/別居/.test(generic.s) ? '同居' : '', keyPerson: /キーパーソン/.test(generic.s), caregiver: false, quality: '', partner: null, partnerStatus: '', parents: [], sibGroup: '', src: [ggTrim(generic.s)], manual: false };
        list = [f];
      }
      // v.102: with no family recorded the chart still shows the patient alone (nothing is invented).
      // index patient (age / sex only when written in a sentence without a kinship word)
      const idx = { id: 'index', role: '本人', sex: 'u', gen: 0, ord: 3, age: null, ageText: '', deceased: false, index: true, occupation: '', notes: [], living: '', keyPerson: false, caregiver: false, quality: '', partner: null, partnerStatus: '', parents: [], sibGroup: '', src: [], manual: false };
      for (const s of sentences) {
        if (ggTokens(s).length) continue;
        const a = /(\d{1,3})\s*[歳才歲]/.exec(s), sx = /(男性|女性|男児|女児)/.exec(s) || /性別\s*[:：]?\s*(男|女)/.exec(s);
        if (a || sx) { if (a && idx.age === null) { idx.age = Number(a[1]); idx.src.push(ggTrim(s)); } if (sx && idx.sex === 'u') { idx.sex = /男/.test(sx[1]) ? 'm' : 'f'; if (!idx.src.length) idx.src.push(ggTrim(s)); } if (idx.age !== null && idx.sex !== 'u') break; }
      }
      if (sentences.some(s => /一人暮らし|ひとり暮らし|独居/.test(s))) idx.living = '独居';
      else if (list.some(p => p.living === '同居')) idx.living = '同居';
      list.unshift(idx);
      // links
      const by = k => people.get(k) || null;
      list.forEach(p => {
        if (p.index || p.id === 'family' || p.id === 'other') return;
        const base = p.id.replace(/#\d+$/, '');
        if (/^(?:wife|husband|spouse|partner)$/.test(base)) { p.partner = 'index'; idx.partner = idx.partner || p.id; }
        else if (/^(?:son|daughter|child)/.test(base)) { p.parents = ['index']; }
        else if (/^(?:father|mother)$/.test(base)) { /* parents of the index: linked below */ }
        else if (/^(?:fil|mil)$/.test(base)) { const sp = list.find(q => /^(?:wife|husband|spouse|partner)$/.test(q.id)); if (!sp) { /* in-laws without a stated spouse stay unlinked */ } }
        else if (/^(?:brother|sister|sibling)/.test(base)) { p.sibGroup = 'index'; }
      });
      const sp = list.find(q => /^(?:wife|husband|spouse|partner)$/.test(q.id));
      list.forEach(p => { if (p.parents && p.parents[0] === 'index' && sp) p.parents = ['index', sp.id]; });
      // v.103: grandparents of a stated side are linked to that parent (and as a couple); unspecified grandparents stay unlinked.
      [['father', 'gfatherP', 'gmotherP'], ['mother', 'gfatherM', 'gmotherM']].forEach(([pk, a1, b1]) => {
        const pp = by(pk), ga = by(a1), gb = by(b1);
        const gs = [ga, gb].filter(Boolean);
        if (pp && gs.length) { pp.parents = gs.map(q => q.id); if (ga && gb) { ga.partner = gb.id; gb.partner = ga.id; } }
      });
      const par = ['father', 'mother'].filter(k => by(k)).map(k => k);
      if (par.length === 2) { by('father').partner = 'mother'; by('mother').partner = 'father'; }
      const fm = par.slice();
      if (fm.length) { idx.parents = fm; list.forEach(p => { if (/^(?:brother|sister|sibling)/.test(p.id)) p.parents = fm, p.sibGroup = ''; }); }
      if (sp) { const inl = ['fil', 'mil'].filter(k => by(k)); if (inl.length) { sp.parents = inl; if (inl.length === 2) { by('fil').partner = 'mil'; by('mil').partner = 'fil'; } } }
      list.forEach(p => { p.partnerStatus = p.partnerStatus || ''; });
      return { persons: list, none: Array.from(none), alone: false };
    }

    // ---- model (cp.genogram), merge, normalisation -------------------------
    // cp.genogram = { version, persons: [...], updatedAt, built: ISO, notice }  (undefined on legacy patients)
    function ggNormalize(raw) {
      const g = { version: 1, persons: [], updatedAt: raw && raw.updatedAt || '', built: raw && raw.built || '', notice: raw && raw.notice || '' };
      const ids = new Set();
      ((raw && raw.persons) || []).forEach(p => {
        if (!p || typeof p !== 'object' || !p.id || ids.has(String(p.id))) return;
        ids.add(String(p.id));
        g.persons.push({
          id: String(p.id), role: String(p.role || ''), sex: ['m', 'f', 'u'].includes(p.sex) ? p.sex : 'u', gen: Number.isFinite(p.gen) ? p.gen : 0, ord: Number.isFinite(p.ord) ? p.ord : 9,
          age: Number.isFinite(p.age) ? p.age : null, ageText: String(p.ageText || ''), deceased: !!p.deceased, index: !!p.index, occupation: String(p.occupation || ''),
          notes: Array.isArray(p.notes) ? p.notes.map(String) : [], living: String(p.living || ''), keyPerson: !!p.keyPerson, caregiver: !!p.caregiver, quality: String(p.quality || ''),
          partner: p.partner ? String(p.partner) : null, partnerStatus: String(p.partnerStatus || ''), parents: Array.isArray(p.parents) ? p.parents.map(String) : [], sibGroup: String(p.sibGroup || ''),
          src: Array.isArray(p.src) ? p.src.map(String) : [], manual: !!p.manual, deleted: !!p.deleted, x: Number.isFinite(p.x) ? p.x : undefined, y: Number.isFinite(p.y) ? p.y : undefined
        });
      });
      g.persons.forEach(p => { // drop links to people that do not exist (or were deleted)
        const live = id => g.persons.some(q => q.id === id && !q.deleted);
        if (p.partner && !live(p.partner)) p.partner = null;
        p.parents = p.parents.filter(live);
      });
      return g;
    }
    function ggLive(g) { return (g && g.persons || []).filter(p => !p.deleted); }
    function ggBuild(cp) {
      const ex = ggExtract(cp);
      return ggNormalize({ persons: ex.persons, built: new Date().toISOString(), notice: ex.persons.length > 1 ? '' : '家族の記載なし（患者のみ）' });
    }
    // Regenerate from the records without silently overwriting manual work: manual persons keep their values (sources are added), deleted ones stay deleted.
    function ggMerge(old, fresh) {
      const out = ggNormalize({ persons: [], built: fresh.built });
      const oldBy = new Map((old && old.persons || []).map(p => [p.id, p]));
      const report = { kept: 0, added: 0, skippedDeleted: 0, updated: 0 };
      const seen = new Set();
      fresh.persons.forEach(f => {
        seen.add(f.id);
        const o = oldBy.get(f.id);
        if (!o) { out.persons.push(f); report.added++; return; }
        if (o.deleted) { out.persons.push(o); report.skippedDeleted++; return; }
        if (o.manual) { const m = Object.assign({}, o); f.src.forEach(s => { if (!m.src.includes(s) && m.src.length < 3) m.src.push(s); }); out.persons.push(m); report.kept++; return; }
        out.persons.push(Object.assign({}, f, { x: o.x, y: o.y })); report.updated++;
      });
      oldBy.forEach((o, id) => { if (!seen.has(id) && (o.manual || o.deleted)) { out.persons.push(o); report.kept++; } });
      out.notice = report.skippedDeleted ? `削除した${report.skippedDeleted}人は、再び追加しませんでした。` : '';
      return { genogram: ggNormalize(out), report };
    }
    // the graph shown / exported: the saved one, or a fresh build when none was saved (nothing is stored by merely viewing)
    function ggFor(cp) { return cp && cp.genogram ? ggNormalize(cp.genogram) : ggBuild(cp || {}); }

    // ---- layout ------------------------------------------------------------
    const GG_W = 140, GG_ROW = 190, GG_S = 48, GG_PAD = 64;
    function ggLayout(g) {
      const live = ggLive(g), pos = new Map();
      const gens = Array.from(new Set(live.map(p => p.gen))).sort((a, b) => a - b);
      const rows = new Map();
      gens.forEach(gen => {
        const list = live.filter(p => p.gen === gen).sort((a, b) => (a.index ? a.ord : a.ord) - b.ord || live.indexOf(a) - live.indexOf(b));
        const placed = [], used = new Set();
        list.forEach(p => {
          if (used.has(p.id)) return;
          placed.push(p); used.add(p.id);
          const q = p.partner && list.find(x => x.id === p.partner);
          if (q && !used.has(q.id)) { placed.push(q); used.add(q.id); }
          list.filter(x => x.partner === p.id && !used.has(x.id)).forEach(x => { placed.push(x); used.add(x.id); });
        });
        rows.set(gen, placed);
        placed.forEach((p, i) => pos.set(p.id, { x: i * GG_W, y: gens.indexOf(gen) * GG_ROW }));
      });
      // v.104: each parent's own parents sit centred straight above that parent (paternal side above the father, maternal above the mother), so descent lines never cross.
      let lineagePlaced = false;
      { const upper = rows.get(-2), mid1 = rows.get(-1);
        if (upper && mid1) {
          const withGp = mid1.filter(q => q.parents.some(id => upper.some(u => u.id === id))).sort((a, b) => pos.get(a.id).x - pos.get(b.id).x);
          if (withGp.length) {
            if (withGp.length === 2 && withGp[0].partner === withGp[1].id) {
              const lx = pos.get(withGp[0].id).x, oldR = pos.get(withGp[1].id).x, delta = 2 * GG_W - (oldR - lx);
              mid1.forEach(q => { if (pos.get(q.id).x >= oldR) pos.get(q.id).x += delta; });
            }
            const done = new Set(); let maxX = -Infinity;
            withGp.forEach(q => {
              const ps = q.parents.map(id => upper.find(u => u.id === id)).filter(u => u && !done.has(u.id)), cx = pos.get(q.id).x;
              ps.forEach((u, i) => { pos.get(u.id).x = ps.length === 2 ? cx + (i ? 1 : -1) * GG_W / 2 : cx; done.add(u.id); maxX = Math.max(maxX, pos.get(u.id).x); });
            });
            let nx = maxX + GG_W;
            upper.filter(u => !done.has(u.id)).forEach(u => { pos.get(u.id).x = nx; nx += GG_W; });
            lineagePlaced = true;
          }
        }
      }
      // shift each row as a block toward the row it connects to (no overlap can arise: rows are only translated)
      const mid = ids => { const xs = ids.filter(id => pos.has(id)).map(id => pos.get(id).x); return xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : null; };
      const shift = (gen, dx) => rows.get(gen).forEach(p => { pos.get(p.id).x += dx; });
      const idx = live.find(p => p.index);
      if (idx) {
        const anchor = (() => { const sp = idx.partner && pos.has(idx.partner) ? [idx.id, idx.partner] : [idx.id]; return mid(sp); })();
        [1, 2].forEach(gen => { if (rows.has(gen)) { const c = mid(rows.get(gen).map(p => p.id)); if (c !== null && anchor !== null) shift(gen, anchor - c); } });
        if (rows.has(-1)) { const kids = live.filter(p => p.gen === 0 && p.parents.some(id => rows.get(-1).some(q => q.id === id))).map(p => p.id); const c = mid(rows.get(-1).filter(p => idx.parents.includes(p.id)).map(p => p.id)), t = mid(kids.length ? kids : [idx.id]); if (c !== null && t !== null) { shift(-1, t - c); if (lineagePlaced && rows.has(-2)) shift(-2, t - c); } }
        if (rows.has(-2) && !lineagePlaced) { const c = mid(rows.get(-2).map(p => p.id)), t = rows.has(-1) ? mid(rows.get(-1).map(p => p.id)) : anchor; if (c !== null && t !== null) shift(-2, t - c); }
      }
      let minX = Infinity, minY = Infinity;
      pos.forEach(v => { minX = Math.min(minX, v.x); minY = Math.min(minY, v.y); });
      if (!pos.size) return { pos, w: 0, h: 0 };
      const out = new Map();
      pos.forEach((v, id) => out.set(id, { x: v.x - minX + GG_PAD + GG_W / 2 - 20, y: v.y - minY + GG_PAD }));
      // manual positions (absolute, in the same space) override the automatic ones
      live.forEach(p => { if (Number.isFinite(p.x) && Number.isFinite(p.y)) out.set(p.id, { x: Math.max(GG_S, p.x), y: Math.max(GG_S, p.y) }); });
      let maxX = 0, maxY = 0; out.forEach(v => { maxX = Math.max(maxX, v.x); maxY = Math.max(maxY, v.y); });
      return { pos: out, w: maxX + GG_PAD + GG_W / 2, h: maxY + GG_PAD + GG_S + 30 };
    }
    function ggOverlaps(g) {
      const L = ggLayout(g), ids = Array.from(L.pos.keys()), bad = [];
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const a = L.pos.get(ids[i]), b = L.pos.get(ids[j]); if (Math.abs(a.x - b.x) < GG_S + 8 && Math.abs(a.y - b.y) < GG_S + 8) bad.push([ids[i], ids[j]]); }
      return bad;
    }

    // ---- SVG ---------------------------------------------------------------
    const GG_INK = '#1f1d1a', GG_LINE = '#3a362f';
    function ggAgeLabel(p) { return p.age !== null ? String(p.age) : (p.ageText || '年齢不明'); }
    function ggSymbol(p, cx, cy, selected) {
      const r = GG_S / 2, st = `fill="#fff" stroke="${selected ? '#B03A55' : GG_INK}" stroke-width="${selected ? 3.2 : 2}"`;
      const shape = (grow) => p.sex === 'm' ? `<rect x="${cx - r - grow}" y="${cy - r - grow}" width="${GG_S + 2 * grow}" height="${GG_S + 2 * grow}" ${st}/>`
        : p.sex === 'f' ? `<circle cx="${cx}" cy="${cy}" r="${r + grow}" ${st}/>`
        : `<polygon points="${cx},${cy - r - grow - 4} ${cx + r + grow + 4},${cy} ${cx},${cy + r + grow + 4} ${cx - r - grow - 4},${cy}" ${st}/>`;
      let s = shape(p.index ? 4 : 0);
      if (p.index) s += shape(0).replace('fill="#fff"', 'fill="none"');
      if (p.deceased) s += `<line x1="${cx - r - 5}" y1="${cy - r - 5}" x2="${cx + r + 5}" y2="${cy + r + 5}" stroke="${GG_INK}" stroke-width="1.8"/><line x1="${cx + r + 5}" y1="${cy - r - 5}" x2="${cx - r - 5}" y2="${cy + r + 5}" stroke="${GG_INK}" stroke-width="1.8"/>`;
      return s;
    }
    // ---- drawing (v.104): geometry first (segments, label boxes, household outline), then one serialiser; the same geometry is used by the tests ----
    function ggTextW(str, size) { return Array.from(String(str)).reduce((w, ch) => w + (ch.charCodeAt(0) > 255 ? size : size * 0.58), 0); }
    function ggWrap(str, n, maxLines) {
      const a = Array.from(String(str)), out = [];
      for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n).join(''));
      if (out.length > maxLines) { out.length = maxLines; out[maxLines - 1] = out[maxLines - 1].slice(0, -1) + '…'; }
      return out;
    }
    const GG_NOTE_INK = '#7a3b1d';
    function ggGeometry(g, mask) {
      mask = mask || (x => x);
      const live = ggLive(g), L = ggLayout(g), P = id => L.pos.get(id), r = GG_S / 2;
      const segs = [], marks = [], people = new Map();
      const seg = (x1, y1, x2, y2, o) => segs.push(Object.assign({ x1, y1, x2, y2, w: 1.8, dash: '', color: GG_LINE }, o || {}));
      // label block under each symbol: role, age/living, then short notes (care role, health memo) in a readable colour
      live.forEach(p => {
        const c = P(p.id);
        const sub = [ggAgeLabel(p) === '年齢不明' ? '年齢不明' : (p.deceased && p.age !== null ? `享年${p.age}` : `${ggAgeLabel(p)}${p.age !== null ? '歳' : ''}`), p.living ? p.living : ''].filter(Boolean).join('・');
        const noteTexts = (p.notes.length ? [mask(p.notes.slice(0, 2).join('・'))] : []);
        const lines = [{ t: mask(p.index ? '本人' : p.role), size: 14, bold: true, fill: GG_INK, dy: r + 21 }, { t: sub, size: 11.5, bold: false, fill: '#3f3b35', dy: r + 38 }];
        let dy = r + 54;
        noteTexts.forEach(n => ggWrap(n, 10, 3).forEach(t => { lines.push({ t, size: 11, bold: false, fill: GG_NOTE_INK, dy }); dy += 14; }));
        const boxes = lines.map(l => { const w = ggTextW(l.t, l.size); return { x1: c.x - w / 2, x2: c.x + w / 2, y1: c.y + l.dy - l.size * 0.95, y2: c.y + l.dy + l.size * 0.3 }; });
        const sym = { x1: c.x - r - 6, x2: c.x + r + 6, y1: c.y - r - 6, y2: c.y + r + 6 };
        const badge = { x1: c.x - r, x2: c.x + r + 16, y1: c.y - r - 14, y2: c.y + r + 6 };
        const all = boxes.concat([sym], p.caregiver || p.keyPerson ? [badge] : []);
        people.set(p.id, { p, c, lines, boxes, sym, bbox: { x1: Math.min(...all.map(b => b.x1)), x2: Math.max(...all.map(b => b.x2)), y1: Math.min(...all.map(b => b.y1)), y2: Math.max(...all.map(b => b.y2)) } });
      });
      const labelBottom = id => Math.max(...people.get(id).boxes.map(b => b.y2));
      // couples
      const doneC = new Set(), coupleMid = new Map();
      live.forEach(p => {
        const q = p.partner && live.find(x => x.id === p.partner); if (!q) return;
        const key = [p.id, q.id].sort().join('|'); if (doneC.has(key)) return; doneC.add(key);
        const a = P(p.id), b = P(q.id), l = a.x <= b.x ? [a, b] : [b, a], st = p.partnerStatus || q.partnerStatus, dx = (p.deceased || q.deceased ? 8 : 2);
        const y = l[0].y, mx = (l[0].x + l[1].x) / 2;
        seg(l[0].x + r + dx, y, l[1].x - r - dx, y, { w: 2.2, dash: st === 'cohabiting' ? '6 4' : '' });
        coupleMid.set(key, { x: mx, y }); coupleMid.set(p.id, { x: mx, y }); coupleMid.set(q.id, { x: mx, y });
        if (st === 'divorced') marks.push({ x: mx, y, n: 2 }); else if (st === 'separated') marks.push({ x: mx, y, n: 1 });
      });
      // children: one drop from the couple line (or below the single parent's label), a sibship bar over the children, drops to each child
      const groups = new Map();
      live.forEach(c => { const ps = c.parents.filter(id => P(id)); if (ps.length) { const k = ps.slice().sort().join('|'); (groups.get(k) || groups.set(k, { ps, kids: [] }).get(k)).kids.push(c); } });
      groups.forEach(gr => {
        const pp = gr.ps.map(P), couple = gr.ps.length > 1, px = couple ? (coupleMid.get(gr.ps[0]) ? coupleMid.get(gr.ps[0]).x : (pp[0].x + pp[1].x) / 2) : pp[0].x;
        const top = couple ? Math.max(...pp.map(a => a.y)) : Math.max(...gr.ps.map(labelBottom)) + 6;
        const kidTop = Math.min(...gr.kids.map(k => P(k.id).y)) - r - (gr.kids.some(k => k.index) ? 10 : 5), barY = kidTop - 28;
        const xs = gr.kids.map(k => P(k.id).x).concat([px]);
        seg(px, top, px, barY); if (Math.max(...xs) - Math.min(...xs) > 0.5) seg(Math.min(...xs), barY, Math.max(...xs), barY);
        gr.kids.forEach(k => seg(P(k.id).x, barY, P(k.id).x, kidTop, { dash: k.quality === 'distant' ? '6 4' : k.quality === 'conflict' ? '2 3' : '', color: k.quality === 'conflict' ? '#B03A55' : GG_LINE }));
      });
      // siblings without stated parents: a bar over them
      const sib = live.filter(p => p.sibGroup && !p.parents.length);
      if (sib.length) {
        const all = live.filter(p => p.index).concat(sib), xs = all.map(p => P(p.id).x), y = P(all[0].id).y - r - 30;
        seg(Math.min(...xs), y, Math.max(...xs), y);
        all.forEach(p => seg(P(p.id).x, y, P(p.id).x, P(p.id).y - r - (p.index ? 10 : 5)));
      }
      // household: the dashed outline follows the rows of the 同居 members only (symbols and labels fully inside; members living apart stay outside)
      const hh = live.filter(p => p.index ? ['同居', '独居'].includes(p.living) && live.some(q => q.living === '同居') : p.living === '同居');
      const outline = [];
      if (hh.length > 1 || (hh.length === 1 && !hh[0].index)) {
        const PADX = 16, rowsY = Array.from(new Set(hh.map(p => Math.round(P(p.id).y)))).sort((a, b) => a - b);
        const rects = rowsY.map(y => { const m = hh.filter(p => Math.round(P(p.id).y) === y).map(p => people.get(p.id).bbox); return { y, x1: Math.min(...m.map(b => b.x1)) - PADX, x2: Math.max(...m.map(b => b.x2)) + PADX, top: Math.min(...m.map(b => b.y1)) - 10, bot: Math.max(...m.map(b => b.y2)) + 10 }; });
        let run = [];
        const flush = () => { if (run.length) outline.push(run); run = []; };
        rects.forEach((rc, i) => { if (run.length && rc.y - run[run.length - 1].y > GG_ROW * 1.5) flush(); run.push(rc); });
        flush();
        outline.forEach(rs => rs.forEach((rc, i) => { rc.t = i ? (rs[i - 1].bot + rc.top) / 2 : rc.top; rc.b = i + 1 < rs.length ? (rc.bot + rs[i + 1].top) / 2 : rc.bot; }));
      }
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const grow = b => { x0 = Math.min(x0, b.x1); y0 = Math.min(y0, b.y1); x1 = Math.max(x1, b.x2); y1 = Math.max(y1, b.y2); };
      people.forEach(v => grow(v.bbox)); segs.forEach(sg => grow({ x1: Math.min(sg.x1, sg.x2), x2: Math.max(sg.x1, sg.x2), y1: Math.min(sg.y1, sg.y2), y2: Math.max(sg.y1, sg.y2) }));
      outline.forEach(rs => rs.forEach(rc => grow({ x1: rc.x1, x2: rc.x2, y1: rc.t, y2: rc.b })));
      return { live, L, people, segs, marks, outline, hh, bounds: { x0, y0, x1, y1 }, r };
    }
    function genogramSvg(g, { interactive = false, selected = '', title = '', mask = x => x } = {}) {
      const live = ggLive(g);
      if (!live.length) return '';
      const geo = ggGeometry(g, mask), r = geo.r, M = 28;
      const vx = Math.floor(geo.bounds.x0 - M), vy = Math.floor(geo.bounds.y0 - M), W = Math.ceil(geo.bounds.x1 - geo.bounds.x0 + 2 * M), H = Math.ceil(geo.bounds.y1 - geo.bounds.y0 + 2 * M);
      const esc = typeof escapeHtml === 'function' ? escapeHtml : x => String(x);
      const f = n => Math.round(n * 10) / 10;
      let lines = '', marks = '', boxes = '', nodes = '';
      geo.segs.forEach(sg => { lines += `<line x1="${f(sg.x1)}" y1="${f(sg.y1)}" x2="${f(sg.x2)}" y2="${f(sg.y2)}" stroke="${sg.color}" stroke-width="${sg.w}"${sg.dash ? ` stroke-dasharray="${sg.dash}"` : ''}/>`; });
      geo.marks.forEach(m => { for (let i = 0; i < m.n; i++) marks += `<line x1="${f(m.x - 6 + i * 8)}" y1="${f(m.y + 11)}" x2="${f(m.x + 2 + i * 8)}" y2="${f(m.y - 11)}" stroke="${GG_INK}" stroke-width="1.8"/>`; });
      geo.outline.forEach(rs => {
        const left = [], right = [];
        rs.forEach(rc => { left.push([rc.x1, rc.t], [rc.x1, rc.b]); right.unshift([rc.x2, rc.b], [rc.x2, rc.t]); });
        boxes += `<polygon points="${left.concat(right).map(q => `${f(q[0])},${f(q[1])}`).join(' ')}" fill="none" stroke="#5E7458" stroke-width="1.6" stroke-dasharray="8 5" stroke-linejoin="round"/>`;
      });
      const halo = 'paint-order="stroke" stroke="#fff" stroke-width="4" stroke-linejoin="round"';
      live.forEach(p => {
        const v = geo.people.get(p.id), c = v.c, sel = selected === p.id;
        nodes += `<g class="gg-person${sel ? ' is-selected' : ''}" data-gg-id="${esc(p.id)}"${interactive ? ' style="cursor:grab;"' : ''}>`
          + ggSymbol(p, c.x, c.y, sel)
          + `<text x="${f(c.x)}" y="${f(c.y + 6)}" text-anchor="middle" font-size="17" fill="${GG_INK}">${esc(p.age !== null ? p.age : '?')}</text>`
          + v.lines.map(l => `<text x="${f(c.x)}" y="${f(c.y + l.dy)}" text-anchor="middle" font-size="${l.size}"${l.bold ? ' font-weight="700"' : ''} fill="${l.fill}" ${halo}>${esc(l.t)}</text>`).join('')
          + (p.notes.length ? `<circle cx="${f(c.x - r + 3)}" cy="${f(c.y - r + 3)}" r="5" fill="#E08A2E"/>` : '')
          + (p.keyPerson ? `<g><rect x="${f(c.x + r - 6)}" y="${f(c.y - r - 14)}" width="26" height="14" rx="3" fill="#2c4a3e"/><text x="${f(c.x + r + 7)}" y="${f(c.y - r - 3)}" text-anchor="middle" font-size="10" fill="#fff">KP</text></g>` : '')
          + (p.caregiver ? `<g><circle cx="${f(c.x + r + 9)}" cy="${f(c.y + r - 2)}" r="9" fill="#7C3AED"/><text x="${f(c.x + r + 9)}" y="${f(c.y + r + 2)}" text-anchor="middle" font-size="11" fill="#fff">介</text></g>` : '')
          + `</g>`;
      });
      // Cap on-screen zoom so a small family is not blown up (never above the 980px container cap).
      const size = interactive ? ` style="max-width:${Math.min(980, Math.round(W * 1.5))}px"` : ` width="${W}" height="${H}"`;
      return `<svg xmlns="http://www.w3.org/2000/svg" class="gg-svg" viewBox="${vx} ${vy} ${W} ${H}"${size} preserveAspectRatio="xMidYMin meet" role="img" aria-label="${esc(title || 'ジェノグラム')}" font-family="Hiragino Kaku Gothic ProN, Yu Gothic, Meiryo, sans-serif"><rect x="${vx}" y="${vy}" width="${W}" height="${H}" fill="#fff"/>${boxes}${lines}${marks}${nodes}</svg>`;
    }
    function genogramLegendHtml() {
      return '<span>□ 男性</span><span>○ 女性</span><span>◇ 性別の記載なし</span><span>二重線＝本人</span><span>×＝死亡</span><span>点線の枠＝同居</span><span>二重斜線＝離婚／斜線＝別居／点線＝内縁</span><span>橙の点＝健康上のメモ</span><span>KP＝キーパーソン</span><span>介＝世話・介護の担い手</span>';
    }

    // ---- text outline / exports -------------------------------------------
    const GG_STATUS = { divorced: '離婚', separated: '別居', cohabiting: '内縁' };
    function ggMaskFor(cp) { const names = typeof krNames === 'function' ? krNames(cp) : []; return t => names.reduce((acc, n) => acc.split(n).join('(患者)'), String(t)); }
    function ggPersonLine(p, mask) {
      const bits = [p.index ? '本人' : p.role, `${p.sex === 'm' ? '男性' : p.sex === 'f' ? '女性' : '性別の記載なし'}`, p.age !== null ? (p.deceased ? `享年${p.age}歳` : `${p.age}歳`) : (p.ageText || '年齢不明')];
      if (p.deceased) bits.push('死亡');
      if (p.living) bits.push(p.living);
      if (p.occupation) bits.push(`職業：${p.occupation}`);
      if (p.keyPerson) bits.push('キーパーソン');
      if (p.caregiver) bits.push('世話・介護の担い手');
      if (p.quality) bits.push({ close: '関係：良好', distant: '関係：疎遠', conflict: '関係：不仲' }[p.quality] || '');
      if (p.notes.length) bits.push(`メモ：${p.notes.join('・')}`);
      return mask(bits.filter(Boolean).join('／'));
    }
    function ggRelationLines(g, mask) {
      const live = ggLive(g), out = [], name = id => { const p = live.find(x => x.id === id); return p ? (p.index ? '本人' : p.role) : id; };
      const done = new Set();
      live.forEach(p => { const q = p.partner && live.find(x => x.id === p.partner); if (!q) return; const k = [p.id, q.id].sort().join('|'); if (done.has(k)) return; done.add(k); out.push(`${name(p.id)}と${name(q.id)}：${GG_STATUS[p.partnerStatus || q.partnerStatus] || '婚姻'}`); });
      const gr = new Map(); live.forEach(c => { if (c.parents.length) { const k = c.parents.join('|'); (gr.get(k) || gr.set(k, []).get(k)).push(c); } });
      gr.forEach((kids, k) => out.push(`${k.split('|').map(name).join('・')}の子：${kids.map(c => name(c.id)).join('・')}`));
      const sib = live.filter(p => p.sibGroup && !p.parents.length); if (sib.length) out.push(`本人のきょうだい（親の記載なし）：${sib.map(p => name(p.id)).join('・')}`);
      return out.map(mask);
    }
    function ggSupportLine(g, mask) {
      const live = ggLive(g), names = f => live.filter(f).map(p => p.index ? '本人' : p.role);
      const kp = names(p => p.keyPerson), co = names(p => p.living === '同居' && !p.index), cg = names(p => p.caregiver);
      return mask(`キーパーソン：${kp.join('・') || '記載なし'}／同居者：${co.join('・') || '記載なし'}／世話・介護の担い手（記載された範囲。正式なキーパーソンの指定ではない）：${cg.join('・') || '記載なし'}`);
    }
    function genogramText(cp, mask) {
      const g = ggFor(cp), live = ggLive(g);
      if (!live.length) return '';
      const m = typeof mask === 'function' ? mask : ggMaskFor(cp);
      let out = `ジェノグラム（${GG_PROVENANCE}）\n■ 家族の構成\n`;
      live.forEach(p => { out += `　・${ggPersonLine(p, m)}\n`; });
      out += '■ 関係\n';
      const rel = ggRelationLines(g, m); out += rel.length ? rel.map(x => `　・${x}`).join('\n') + '\n' : '　・（関係の記載なし）\n';
      if (live.length <= 1) out += '　・家族の記載なし（患者のみ）\n';
      out += `■ ${ggSupportLine(g, m)}\n※ジェノグラムから充足・未充足は判定しない。記載された家族のみを示す。\n`;
      return out;
    }
    function genogramPrintSection(cp, n) {
      const g = ggFor(cp); if (!ggLive(g).length) return '';
      const esc = typeof escapeHtml === 'function' ? escapeHtml : x => String(x), m = ggMaskFor(cp);
      return `<h2>${n}. ジェノグラム</h2><div class="ai">${genogramSvg(g, { mask: m, title: 'ジェノグラム' })}<p style="white-space:pre-wrap;margin:4pt 0 0;">${esc(genogramText(cp, m))}</p></div>`;
    }
    function genogramCorrectionText(cp) {
      const g = ggFor(cp), live = ggLive(g);
      if (!cp || !live.length) return '';
      const m = ggMaskFor(cp);
      let out = '【アプリが作成したジェノグラム】\n'
        + 'Developer instruction: compare the family members, ages, sex, living situation, key person and caregiver below with the source record, and list any family member that is missing, invented or wrong (with the source sentence), and any kinship wording the extraction misreads. Do not add patient-specific rules; propose generic extraction rules only.\n'
        + `（${GG_PROVENANCE}）\n`;
      live.forEach(p => { out += `　・${ggPersonLine(p, m)}｜原文：${m(p.src.join(' ／ ') || '（手で追加）')}${p.manual ? '｜手で編集' : ''}\n`; });
      if (live.length <= 1) out += '　・家族の記載なし（患者のみ。家族は記録にないため作っていない）\n';
      ggRelationLines(g, m).forEach(x => { out += `　・関係：${x}\n`; });
      return out + `　・${ggSupportLine(g, m)}\n\n`;
    }

    // ---- editing UI (mirrors the relation map: build -> edit -> save with the patient) -----------
    const ggState = { selected: '', patientId: '', undo: [], redo: [], text: false };
    function ggSnap(cp) { return JSON.stringify(cp.genogram || null); }
    function ggCommit(cp, g, { push = true } = {}) {
      if (push) { ggState.undo.push(ggSnap(cp)); if (ggState.undo.length > 30) ggState.undo.shift(); ggState.redo = []; }
      g.updatedAt = new Date().toISOString();
      cp.genogram = g;
      if (typeof persistData === 'function') persistData();
      renderGenogram();
    }
    function ggUndoRedo(redo) {
      const cp = getCurrentPatient(), from = redo ? ggState.redo : ggState.undo, to = redo ? ggState.undo : ggState.redo;
      if (!from.length) return;
      to.push(ggSnap(cp)); const v = JSON.parse(from.pop());
      if (v) cp.genogram = v; else delete cp.genogram;
      if (typeof persistData === 'function') persistData();
      renderGenogram();
    }
    function ggWorking(cp) { return cp.genogram ? ggNormalize(cp.genogram) : null; }
    function genogramBuildFromRecord() {
      const cp = getCurrentPatient(), fresh = ggBuild(cp), old = ggWorking(cp);
      if (!old) { if (!fresh.persons.length) { showToast('人物を作れませんでした', 'warn'); return; } ggCommit(cp, fresh); showToast(fresh.persons.length > 1 ? `記録から家族${fresh.persons.length - 1}人の図を作りました` : '家族の記載なし（患者のみ）の図を作りました', 'success'); return; }
      const { genogram, report } = ggMerge(old, fresh);
      ggCommit(cp, genogram);
      showToast(`記録から更新しました（追加${report.added}人・更新${report.updated}人・手で編集した人は変更しません${report.skippedDeleted ? `・削除済みの${report.skippedDeleted}人は追加しません` : ''}）`, 'success');
    }
    function ggMutate(fn) {
      const cp = getCurrentPatient(); let g = ggWorking(cp) || ggBuild(cp);
      if (!g.persons.length) g = ggNormalize({ persons: [{ id: 'index', role: '本人', index: true, gen: 0, ord: 3, manual: true }] });
      fn(g); ggCommit(cp, ggNormalize(g));
    }
    function genogramAddPerson() {
      const role = (document.getElementById('gg-new-role') || {}).value || '', sex = (document.getElementById('gg-new-sex') || {}).value || 'u', gen = Number((document.getElementById('gg-new-gen') || {}).value || 0);
      if (!role.trim()) { showToast('続柄（例：妻・長男）を入れてください', 'warn'); return; }
      ggMutate(g => {
        if (!g.persons.some(p => p.index)) g.persons.unshift({ id: 'index', role: '本人', index: true, gen: 0, ord: 3, manual: true, notes: [], parents: [], src: [] });
        const id = `manual_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
        g.persons.push({ id, role: role.trim().slice(0, 12), sex, gen, ord: 20 + g.persons.length, manual: true, notes: [], parents: [], src: [] });
        ggState.selected = id;
      });
    }
    function genogramApplyEdit() {
      const id = ggState.selected; if (!id) return;
      const v = k => (document.getElementById(`gg-f-${k}`) || {}).value;
      const c = k => !!(document.getElementById(`gg-f-${k}`) || {}).checked;
      ggMutate(g => {
        const p = g.persons.find(x => x.id === id); if (!p) return;
        if (!p.index) p.role = String(v('role') || p.role).slice(0, 12);
        p.sex = ['m', 'f', 'u'].includes(v('sex')) ? v('sex') : 'u';
        const a = String(v('age') || '').trim(); p.age = /^\d{1,3}$/.test(a) ? Number(a) : null; p.ageText = p.age === null ? a.slice(0, 8) : '';
        p.deceased = c('deceased'); p.keyPerson = c('kp'); p.caregiver = c('cg'); p.living = v('living') || '';
        p.occupation = String(v('job') || '').slice(0, 20); p.notes = String(v('notes') || '').split(/[、,，\n]/).map(x => x.trim()).filter(Boolean).slice(0, 6);
        p.quality = v('quality') || ''; p.gen = Number(v('gen')); p.partnerStatus = v('pstatus') || '';
        const set = (x, y) => { const q = x && g.persons.find(z => z.id === x); if (q) q.partner = y; };
        const np = v('partner') || null; if (p.partner && p.partner !== np) set(p.partner, null);
        p.partner = np && np !== p.id ? np : null; if (p.partner) { set(p.partner, p.id); const q = g.persons.find(z => z.id === p.partner); if (q) q.partnerStatus = p.partnerStatus; }
        p.parents = [v('par1'), v('par2')].filter(x => x && x !== p.id); p.sibGroup = p.parents.length ? '' : p.sibGroup;
        p.manual = true;
      });
    }
    function genogramDeleteSelected() {
      const id = ggState.selected; if (!id) return;
      ggMutate(g => {
        const p = g.persons.find(x => x.id === id); if (!p || p.index) return;
        if (p.manual && /^manual_/.test(p.id)) g.persons = g.persons.filter(x => x.id !== id); else { p.deleted = true; p.manual = true; }
        g.persons.forEach(q => { if (q.partner === id) q.partner = null; q.parents = q.parents.filter(x => x !== id); });
        ggState.selected = '';
      });
    }
    function genogramRelayout() { ggMutate(g => { g.persons.forEach(p => { delete p.x; delete p.y; }); }); }
    function genogramClear() { const cp = getCurrentPatient(); if (!cp.genogram) return; ggState.undo.push(ggSnap(cp)); delete cp.genogram; ggState.selected = ''; if (typeof persistData === 'function') persistData(); renderGenogram(); showToast('ジェノグラムを消しました（元に戻せます）', 'info'); }
    function ggPanelHtml(g) {
      const p = ggLive(g).find(x => x.id === ggState.selected), esc = typeof escapeHtml === 'function' ? escapeHtml : x => String(x);
      const opts = (arr, cur) => arr.map(([val, lab]) => `<option value="${esc(val)}"${val === cur ? ' selected' : ''}>${esc(lab)}</option>`).join('');
      const add = `<div class="rm-group" aria-label="人物を追加"><input id="gg-new-role" class="field text-[12px]" placeholder="続柄（例：妻・長男）" maxlength="12" style="width:9rem;"> <select id="gg-new-sex" class="field text-[12px]">${opts([['u', '性別不明'], ['m', '男性'], ['f', '女性']], 'u')}</select> <select id="gg-new-gen" class="field text-[12px]">${opts([['-2', '祖父母の世代'], ['-1', '親の世代'], ['0', '本人と同じ世代'], ['1', '子の世代'], ['2', '孫の世代']], '0')}</select> <button type="button" class="btn btn-outline text-[11px] py-1" data-gg-action="add">人物を追加</button></div>`;
      if (!p) return add + '<p class="text-[11px] text-[var(--ink-muted)]">図の人物を押すと、ここで直せます（ドラッグで動かせます）。</p>';
      const others = ggLive(g).filter(x => x.id !== p.id).map(x => [x.id, x.index ? '本人' : x.role]);
      const sel = (id, list, cur, none) => `<select id="${id}" class="field text-[12px]">${opts([['', none], ...list], cur || '')}</select>`;
      return add + `<div class="gg-edit rm-group" style="flex-wrap:wrap;gap:.4rem .6rem;align-items:center;">
        <b class="text-[12px]">${esc(p.index ? '本人' : p.role)}</b>
        ${p.index ? '' : `<input id="gg-f-role" class="field text-[12px]" value="${esc(p.role)}" maxlength="12" style="width:7rem;" aria-label="続柄">`}
        <select id="gg-f-sex" class="field text-[12px]" aria-label="性別">${opts([['u', '性別不明'], ['m', '男性'], ['f', '女性']], p.sex)}</select>
        <input id="gg-f-age" class="field text-[12px]" value="${esc(p.age !== null ? p.age : p.ageText)}" placeholder="年齢" style="width:4.5rem;" aria-label="年齢">
        <label class="text-[11px]"><input type="checkbox" id="gg-f-deceased"${p.deceased ? ' checked' : ''}> 死亡</label>
        <select id="gg-f-living" class="field text-[12px]" aria-label="同居">${opts([['', '同居の記載なし'], ['同居', '同居'], ['別居', '別居'], ['施設', '施設'], ['独居', '独居']], p.living)}</select>
        <label class="text-[11px]"><input type="checkbox" id="gg-f-kp"${p.keyPerson ? ' checked' : ''}> キーパーソン</label>
        <label class="text-[11px]"><input type="checkbox" id="gg-f-cg"${p.caregiver ? ' checked' : ''}> 介護者</label>
        <input id="gg-f-job" class="field text-[12px]" value="${esc(p.occupation)}" placeholder="職業" style="width:6rem;" aria-label="職業">
        <input id="gg-f-notes" class="field text-[12px]" value="${esc(p.notes.join('、'))}" placeholder="健康上のメモ（、区切り）" style="width:12rem;" aria-label="健康上のメモ">
        <select id="gg-f-gen" class="field text-[12px]" aria-label="世代">${opts([['-2', '祖父母の世代'], ['-1', '親の世代'], ['0', '本人と同じ世代'], ['1', '子の世代'], ['2', '孫の世代']], String(p.gen))}</select>
        ${sel('gg-f-partner', others, p.partner, '配偶者・パートナーなし')}
        <select id="gg-f-pstatus" class="field text-[12px]" aria-label="婚姻の状態">${opts([['', '婚姻'], ['divorced', '離婚'], ['separated', '別居'], ['cohabiting', '内縁']], p.partnerStatus)}</select>
        ${sel('gg-f-par1', others, p.parents[0], '親1なし')}${sel('gg-f-par2', others, p.parents[1], '親2なし')}
        <select id="gg-f-quality" class="field text-[12px]" aria-label="関係">${opts([['', '関係の記載なし'], ['close', '良好'], ['distant', '疎遠'], ['conflict', '不仲']], p.quality)}</select>
        <button type="button" class="btn btn-primary text-[11px] py-1" data-gg-action="apply">反映</button>
        ${p.index ? '' : '<button type="button" class="btn btn-outline text-[11px] py-1" data-gg-action="delete">この人を消す</button>'}
        ${p.src.length ? `<span class="text-[10.5px] text-[var(--ink-muted)] w-full">原文：${esc(p.src.join(' ／ '))}${p.manual ? '（手で編集済み）' : ''}</span>` : ''}</div>`;
    }
    function renderGenogram() {
      const view = document.getElementById('view-genogram'); if (!view) return;
      const cp = getCurrentPatient(); if (!cp) return;
      if (ggState.patientId !== cp.id) { ggState.patientId = cp.id; ggState.selected = ''; ggState.undo = []; ggState.redo = []; }
      const saved = ggWorking(cp), g = saved || ggBuild(cp), has = ggLive(g).length > 0;
      const set = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };
      set('gg-empty', el => { el.classList.toggle('hidden', has); el.textContent = saved || !g.notice ? 'まだジェノグラムがありません。「記録から作る」または「人物を追加」で作れます。' : g.notice; });
      set('gg-canvas', el => { el.classList.toggle('hidden', !has || ggState.text); el.innerHTML = has ? genogramSvg(g, { interactive: true, selected: ggState.selected, title: 'ジェノグラム' }) : ''; });
      set('gg-text-view', el => { el.classList.toggle('hidden', !has || !ggState.text); el.textContent = has ? genogramText(Object.assign({}, cp, { genogram: g })) : ''; });
      set('gg-panel', el => { el.innerHTML = ggPanelHtml(g); });
      set('gg-legend', el => { el.innerHTML = genogramLegendHtml(); });
      set('gg-info', el => { el.textContent = has ? `${ggLive(g).length}人${saved ? '（保存済み）' : '（記録から自動で作った案。「記録から作る」で保存）'}｜${GG_PROVENANCE}` : ''; });
    }
    function genogramSavePng() {
      const cp = getCurrentPatient(), g = ggFor(cp); if (!ggLive(g).length) { showToast('保存するジェノグラムがありません', 'warn'); return; }
      const svg = genogramSvg(g, { title: 'ジェノグラム' }).replace('<svg ', '<svg ');
      const filename = `${String(cp.title || '患者').replace(/[\\/:*?"<>|]/g, '_')}_ジェノグラム.png`;
      const handlePromise = typeof window.showSaveFilePicker === 'function' && typeof chooseExportFile === 'function' ? chooseExportFile(filename).catch(e => { if (e.name !== 'AbortError') showToast('保存先を開けませんでした', 'error'); return null; }) : null;
      const img = new Image(), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      const fail = () => showToast('画像を作れませんでした。「印刷 / PDF」を使ってください', 'error');
      img.onload = () => { try { const cv = document.createElement('canvas'); cv.width = (img.naturalWidth || img.width) * 2; cv.height = (img.naturalHeight || img.height) * 2; const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); c.drawImage(img, 0, 0, cv.width, cv.height); cv.toBlob(async blob => { if (!blob) return fail(); if (await downloadTextBlob(blob, filename, handlePromise)) showToast('ジェノグラムを画像（PNG）で保存しました', 'success'); }, 'image/png'); } catch (e) { fail(); } finally { URL.revokeObjectURL(url); } };
      img.onerror = () => { URL.revokeObjectURL(url); fail(); };
      img.src = url;
    }
    function genogramPrint() {
      const cp = getCurrentPatient(), g = ggFor(cp); if (!ggLive(g).length) { showToast('印刷するジェノグラムがありません', 'warn'); return; }
      const esc = typeof escapeHtml === 'function' ? escapeHtml : x => String(x);
      const w = window.open('', '_blank'); if (!w) { showToast('印刷用のウィンドウを開けませんでした', 'error'); return; }
      w.document.write(`<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>${esc(`${cp.title || '患者'}_ジェノグラム`)}</title><style>@page{size:A4 landscape;margin:8mm}body{font-family:"Hiragino Kaku Gothic ProN","Yu Gothic",Meiryo,sans-serif;font-size:9pt;color:#1f1d1a}svg{max-width:100%;height:auto}.legend span{margin-right:10pt}</style></head><body><h1 style="font-size:14pt">ジェノグラム</h1>${genogramSvg(g, { title: 'ジェノグラム' })}<div class="legend">${genogramLegendHtml()}</div><pre style="white-space:pre-wrap">${esc(genogramText(Object.assign({}, cp, { genogram: g })))}</pre></body></html>`);
      w.document.close(); w.focus(); setTimeout(() => { try { w.print(); } catch (e) { /* ignore */ } }, 300);
    }
    function initGenogramUi() {
      const view = document.getElementById('view-genogram'); if (!view || view.dataset.ggReady) return;
      view.dataset.ggReady = '1';
      view.addEventListener('click', e => {
        const btn = e.target.closest && e.target.closest('[data-gg-action]');
        if (btn) {
          const a = btn.dataset.ggAction;
          ({ build: genogramBuildFromRecord, add: genogramAddPerson, apply: genogramApplyEdit, delete: genogramDeleteSelected, relayout: genogramRelayout, clear: genogramClear, png: genogramSavePng, print: genogramPrint,
            undo: () => ggUndoRedo(false), redo: () => ggUndoRedo(true), text: () => { ggState.text = !ggState.text; btn.setAttribute('aria-pressed', String(ggState.text)); btn.textContent = ggState.text ? '図で表示' : '一覧表示'; renderGenogram(); } }[a] || (() => {}))();
          return;
        }
        const node = e.target.closest && e.target.closest('[data-gg-id]');
        if (node && !ggState.dragMoved) { ggState.selected = node.dataset.ggId; renderGenogram(); }
      });
      // drag to reposition (saved as manual positions; "並べ直す" clears them)
      let drag = null;
      view.addEventListener('pointerdown', e => {
        const node = e.target.closest && e.target.closest('[data-gg-id]'); const svg = node && node.ownerSVGElement; if (!node || !svg || !svg.getScreenCTM) return;
        const m = svg.getScreenCTM(); if (!m) return;
        drag = { id: node.dataset.ggId, node, svg, inv: m.inverse(), sx: e.clientX, sy: e.clientY, moved: false };
        ggState.dragMoved = false;
      });
      window.addEventListener('pointermove', e => {
        if (!drag) return; const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        if (!drag.moved && Math.hypot(dx, dy) < 4) return; drag.moved = true; ggState.dragMoved = true;
        drag.node.setAttribute('transform', `translate(${dx * drag.inv.a},${dy * drag.inv.d})`);
      });
      window.addEventListener('pointerup', e => {
        if (!drag) return; const d = drag; drag = null;
        if (d.moved) {
          const dx = (e.clientX - d.sx) * d.inv.a, dy = (e.clientY - d.sy) * d.inv.d, cp = getCurrentPatient(), g = ggWorking(cp) || ggBuild(cp), L = ggLayout(g), p = g.persons.find(x => x.id === d.id), c = L.pos.get(d.id);
          if (p && c) { p.x = Math.round(c.x + dx); p.y = Math.round(c.y + dy); p.manual = true; ggCommit(cp, g); }
        }
        setTimeout(() => { ggState.dragMoved = false; }, 0);
      });
    }
    function onGenogramPatientReloaded() { ggState.patientId = ''; if (!document.getElementById('view-genogram')?.classList.contains('hidden')) renderGenogram(); }
    try { if (typeof document !== 'undefined' && document.getElementById && document.getElementById('view-genogram')) initGenogramUi(); } catch (e) { /* ignore */ }

if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, { GG_PROVENANCE, GG_KIN, ggExtract, ggNormalize, ggBuild, ggMerge, ggFor, ggLayout, ggGeometry, ggOverlaps, genogramSvg, genogramLegendHtml, genogramText, genogramPrintSection, genogramCorrectionText, ggSupportLine, renderGenogram, onGenogramPatientReloaded });
}
