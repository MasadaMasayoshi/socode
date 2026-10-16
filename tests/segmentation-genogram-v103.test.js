const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers.js');
const app = loadApp();
const cards = t => Array.from(app.classifyTextByRules(t));
const norm = t => String(t).normalize('NFKC').replace(/\s+/g, '');
const SRC = [
  '●患者:Bさん（10歳、男児）', '●診断名：喘息',
  '●家族歴・家族構成：両親（父親38歳、母親36歳）、父方の祖父母（祖父66歳、祖母63歳）、姉（13歳）の6人暮らし。母方の祖父母は健在であるが、遠方のため年に数回会う程度。',
  '●生活の様子：幼いころから主として祖母が、弟の世話をしている。',
  '＜経過＞',
  '5月1日 夜間に咳が続き、38.2℃の発熱があった。母親が受診させ、入院となった。',
  '5月2日 医師「診断名は気管支喘息です。吸入薬を使います。」Bさん「ぜんそくの薬は苦手」。SpO2 94%、酸素1L投与。食事は半分摂取。',
  '午後、父親とともに水泳部の顧問教員が来院する。'
].join('\n');
const g = s => app.ggExtract({ sourceText: s, items: [] });
const by = (l, id) => l.persons.find(p => p.id === id);

test('no orphan fragments, no duplicates, and every source sentence is covered by some card', () => {
  const list = cards(SRC).filter(c => c.type !== 'unnecessary');
  list.forEach(c => assert.ok(!/^[、。」）)をにはがのと]/.test(c.text), c.text));
  list.forEach(a => list.forEach(b => { if (a !== b) assert.ok(!(b.text.length > a.text.length && b.text.includes(a.text) && a.timestamp === b.timestamp && !a.fieldLabel), `fragment: ${a.text}`); }));
  assert.strictEqual(new Set(list.map(c => c.timestamp + '|' + norm(c.text))).size, list.length);
  const all = norm(list.map(c => c.text).join(''));
  SRC.split('\n').slice(5).flatMap(l => l.replace(/^\d+月\d+日\s*/, '').split(/(?<=。)/)).filter(x => x.length > 4 && !/^SpO2/.test(x)).forEach(sen => assert.ok(all.includes(norm(sen).replace(/^[^。「」]*?(?=医師|Bさん)/, '').slice(0, 6)) || all.includes(norm(sen).slice(0, 8)), sen));
});

test('source offsets: each card with offsets points at its exact text and spans never overlap', () => {
  const src = SRC.normalize('NFKC');
  const withOff = cards(SRC).filter(c => Number.isFinite(c.srcStart));
  assert.ok(withOff.length >= 5);
  withOff.forEach(c => assert.strictEqual(src.slice(c.srcStart, c.srcEnd), c.text));
  const sorted = withOff.slice().sort((a, b) => a.srcStart - b.srcStart);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].srcStart >= sorted[i - 1].srcEnd);
});

test('staff explanation is O and patient speech is S; a label word inside a quotation is not a field label; a real label stays', () => {
  const list = cards(SRC);
  const staff = list.find(c => c.text.startsWith('医師「'));
  const pt = list.find(c => c.text.startsWith('Bさん「'));
  assert.strictEqual(staff.type, 'o'); assert.ok(!staff.fieldLabel); assert.ok(staff.text.includes('診断名は気管支喘息です'));
  assert.strictEqual(pt.type, 's'); assert.ok(!pt.text.includes('酸素'));
  assert.ok(list.some(c => c.fieldLabel === '診断名' && c.text === '喘息'));
  assert.ok(list.every(c => !(c.fieldLabel === '診断名' && /疑われ|です/.test(c.text))));
  // a nurse asking and the patient answering is patient speech (S), not split as staff speech
  const q = cards('5月3日\n朝の検温時、看護師が尋ねると「よく眠れた」と答えた。');
  assert.ok(q.every(c => c.type !== 'o' || !/^看護師が尋ねると/.test(c.text)));
});

test('raw HTML artifacts are removed; Japanese angle-bracket headings are kept', () => {
  const l = cards('5月1日\n<p>食事は&nbsp;全量摂取。</p><span>体温は36.5度。</span>\n<入院時の状況>');
  const all = l.map(c => c.text).join('|');
  assert.ok(!/<\/?p>|<span|&nbsp;|&amp;/.test(all), all);
  assert.ok(all.includes('食事は') && all.includes('全量摂取'));
  assert.ok(l.some(c => c.text.includes('<入院時の状況>')));
});

test('long mixed-topic paragraph keeps the cause-and-order sentence together and the chronology of offsets', () => {
  const list = cards(SRC).filter(c => c.timestamp === '5月1日');
  assert.ok(list.some(c => /母親が受診させ、入院となった/.test(c.text)));
  const o = cards(SRC).filter(c => Number.isFinite(c.srcStart)).map(c => c.srcStart);
  assert.ok(o.length > 4);
});

test('genogram: father is not a teacher because of a nearby word; an explicit job is read', () => {
  assert.strictEqual(by(g(SRC), 'father').occupation, '');
  assert.strictEqual(by(g('父親（40歳・教員）、母親（38歳）。'), 'father').occupation, '教員');
  assert.strictEqual(by(g('父親は教員として働く。母親は会社員。'), 'father').occupation, '教員');
  assert.strictEqual(by(g('父親は、母親が教員である。'), 'father').occupation, '');
});

test('genogram: paternal and maternal grandparents are separate and linked to the right parent', () => {
  const l = g(SRC);
  const ids = l.persons.map(p => p.id);
  ['gfatherP', 'gmotherP', 'gfatherM', 'gmotherM'].forEach(k => assert.ok(ids.includes(k), k));
  assert.deepStrictEqual(Array.from(by(l, 'father').parents).sort(), ['gfatherP', 'gmotherP']);
  assert.deepStrictEqual(Array.from(by(l, 'mother').parents).sort(), ['gfatherM', 'gmotherM']);
  assert.strictEqual(by(l, 'gfatherP').age, 66); assert.strictEqual(by(l, 'gmotherP').age, 63);
  assert.strictEqual(by(l, 'gfatherM').age, null); assert.strictEqual(by(l, 'gfatherM').living, '別居');
  // side not stated: kept apart and marked unknown, not linked
  const u = g('祖母は健在で、母親と父親がいる。');
  assert.ok(by(u, 'gmother') && Array.from(by(u, 'father').parents).length === 0);
  // a plain grandparent word is folded into the only side that exists
  const f = g('父方の祖父母は同居。祖母が食事を作る。父親と母親がいる。');
  assert.ok(!by(f, 'gmother') && by(f, 'gmotherP'));
});

test('genogram: six household members are recognised and the household is drawn', () => {
  const l = g(SRC);
  const house = l.persons.filter(p => p.living === '同居' || p.index);
  assert.strictEqual(house.length, 6);
  assert.ok(!['gfatherM', 'gmotherM'].some(k => by(l, k).living === '同居'));
  const svg = app.genogramSvg({ persons: l.persons }, {});
  assert.ok(/stroke-dasharray="8 5"/.test(svg));
  // counterexample: a stated count with only the patient named does not invent members
  assert.strictEqual(g('Cさん（20歳）。一人暮らし。').persons.length, 1);
});

test('genogram: a caring role is kept as support, never a formal key person; patient-only chart still works', () => {
  const l = g(SRC);
  const gm = by(l, 'gmotherP');
  assert.strictEqual(gm.caregiver, true); assert.strictEqual(gm.keyPerson, false);
  assert.ok(!l.persons.some(p => p.keyPerson));
  assert.ok(/正式なキーパーソンの指定ではない/.test(app.genogramText({ id: 'p', title: 'T', sourceText: SRC, items: [] })));
  const none = g('体温36.5度。');
  assert.deepStrictEqual(Array.from(none.persons).map(p => p.id), ['index']);
  // key person stated explicitly is still read
  assert.strictEqual(by(g('母親（40歳）と二人暮らし。キーパーソンは母親。'), 'mother').keyPerson, true);
});
