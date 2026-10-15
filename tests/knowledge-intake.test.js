'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
// The pasted knowledge-pack intake was removed on request; this guards against it returning by accident.
test('knowledge-pack intake stays removed', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'js', '12-missing-checks-and-care-plan.js'), 'utf8');
  assert.ok(!/btn-knowledge-intake|openKnowledgeIntake/.test(html + js));
});
