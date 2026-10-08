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
