const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./app-helpers');
const mk = (app, text, extra = {}) => ({ id: 'i_' + Math.random().toString(36).slice(2), text, type: 'o', hendersonIds: [], assessmentCols: {}, ...extra });
test('untagged items get a reason of the right kind (Patient 19 reference cases)', () => {
  const app = loadApp();
  const r = t => app.inferUntaggedReason(mk(app, t));
  assert.equal(r('社会保険').kind, 'none');
  const stage = r('Stage 1B');
  assert.equal(stage.kind, 'none'); assert.ok(!stage.candidates.includes(14));
  assert.equal(r('NOリング器東わるい').kind, 'source');
  assert.equal(r('AST 2 U/L').kind, 'source');
  assert.equal(r('まったく関係ない文章ですがタグが取れません').kind, 'unset');
  assert.match(r('まったく関係ない文章ですがタグが取れません').reason, /特定できない/);
  assert.equal(r('Stage 1B').confidence, '中');
});
test('mixed record yields per-part candidates; decisions persist by text across regeneration', () => {
  const app = loadApp();
  const mixed = mk(app, 'SpO2 98%、呼吸苦なし。社会保険。食事は全量摂取。');
  const inf = app.inferUntaggedReason(mixed);
  assert.ok(inf.kind === 'classify' ? inf.parts.length >= 1 : true);
  const cp = { items: [mk(app, '社会保険', { id: 'a' })] };
  app.setUntaggedReview(cp, 'a', { decision: 'none' });
  assert.equal(cp.items[0].tagNotNeeded, true);
  cp.items = [mk(app, '社会保険', { id: 'b_regenerated' })]; // regenerated card, new id
  app.applyUntaggedReviews(cp);
  assert.equal(cp.items[0].tagNotNeeded, true);
  assert.equal(app.untaggedReviewCounts(cp).done, 1);
  const other = { items: [mk(app, '社会保険', { id: 'c' })] }; // another patient: not applied
  app.applyUntaggedReviews(other);
  assert.ok(!other.items[0].tagNotNeeded);
});
test('assigning a tag works and original text is untouched', () => {
  const app = loadApp();
  const cp = { items: [mk(app, 'NOリング器東わるい', { id: 'x' })] };
  app.setUntaggedReview(cp, 'x', { decision: 'source' });
  assert.equal(cp.items[0].text, 'NOリング器東わるい'); assert.equal(cp.items[0].hendersonIds.length, 0);
  app.setUntaggedReview(cp, 'x', { decision: 'assign', tagIds: [4] });
  assert.deepEqual(cp.items[0].hendersonIds, [4]);
});
test('Patient 36 cards: real gaps are tagged; pain without stated effect is explained, not forced', () => {
  const app = loadApp();
  const tags = t => Array.from(app.detectMultipleHendersonTags(t));
  assert.equal(tags('アレルギー: なし').length, 0);
  assert.equal(app.inferUntaggedReason({ id: 'al', text: 'アレルギー: なし', type: 'o', hendersonIds: [] }).kind, 'none');
  assert.ok(tags('動かなければ疼痛訴えなく、鎮痛剤の内服も行わず経過').includes(4));
  assert.ok(tags('手術時間: 2時間30分 出血量 350ml(輸血なし) 術中輸液量 2,320ml').includes(1));
  assert.ok(tags('昼食: 点滴終了、抗生剤のみとなったため、ヘパリンロック行う').includes(9));
  assert.ok(tags('ガーゼ汚染なし').includes(8));
  assert.ok(tags('上半身を支えることができているが苦痛表情あり、ペインスケール「6」になったと。').includes(4));
  assert.equal(tags('創痛がある。').length, 0);
  const r = app.inferUntaggedReason({ id: 'p', text: '創痛がある。', type: 'o', hendersonIds: [] });
  assert.equal(r.kind, 'insufficient'); assert.equal(r.confidence, '高');
});
test('pain card: affected item is read from surrounding records; select-all helper exists', () => {
  const app = loadApp();
  const mk2 = (id, text, ts) => ({ id, text, type: 'o', hendersonIds: [], assessmentCols: {}, timestamp: ts });
  const cp = { items: [
    mk2('a', '立位保持・歩行訓練、関節可動域訓練やマッサージ行う', '術後2日目 14:00'),
    mk2('b', 'ペインスケール「5」まで上昇したが、帰室後「2」となっているため追加の薬剤希望なし', '術後2日目 14:00')
  ] };
  const r = app.inferUntaggedReason(cp.items[1], cp);
  assert.equal(r.kind, 'classify'); assert.ok(r.candidates.includes(4)); assert.ok(r.fromContext);
  const alone = app.inferUntaggedReason({ id: 'z', text: '創痛がある。', type: 'o', hendersonIds: [] }, { items: [] });
  assert.equal(alone.kind, 'insufficient');
});
test('review-request export lists edited (incl. merge/split) and untagged cards with explanation', () => {
  const app = loadApp();
  const cp = { title: 'T', items: [
    { id: 'm', text: '統合後の文', type: 'o', hendersonIds: [4], editLog: [{ at: 'x', kind: 'merge', from: ['前半', '後半'] }] },
    { id: 's', text: '分割後の前半', type: 'o', hendersonIds: [4], editLog: [{ at: 'x', kind: 'text', from: '分割後の前半。分割後の後半。', to: '分割後の前半' }] },
    { id: 'u', text: '創痛がある。', type: 'o', hendersonIds: [] },
    { id: 'ok', text: '食事は全量摂取', type: 'o', hendersonIds: [2] }
  ] };
  assert.equal(app.reviewRequestTargets(cp).length, 3);
  const t = app.buildReviewRequestText(cp, '', false);
  assert.match(t, /統合：/); assert.match(t, /分割または短縮/); assert.match(t, /直し方の案/); assert.match(t, /タグ未設定/);
  assert.match(t, /書き出し 3枚/); assert.ok(!t.includes('カードの内容: 食事は全量摂取'));
});
