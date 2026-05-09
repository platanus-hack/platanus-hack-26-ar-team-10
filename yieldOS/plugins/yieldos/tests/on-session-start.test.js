'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sessionStart = require('../scripts/on-session-start');
const instructionWatcher = require('../scripts/instruction-watcher');

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-session-'));
}

test('safe instruction changes are accepted after being logged', () => {
  const root = tmpProject();
  const agentsPath = path.join(root, 'AGENTS.md');

  fs.writeFileSync(agentsPath, '# original\n');
  instructionWatcher.checkAll(root);

  fs.writeFileSync(agentsPath, '# updated\n');
  const result = sessionStart.handleInstructionChanges(root, {
    'injection-patterns.json': { patterns: [] },
  });
  const next = instructionWatcher.checkAll(root);

  assert.equal(result.logged.length, 1);
  assert.equal(result.logged[0].action, 'auto-accepted');
  assert.equal(next.find((entry) => entry.file === agentsPath).status, 'unchanged');
});
