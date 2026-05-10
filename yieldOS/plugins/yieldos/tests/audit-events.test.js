'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { appendAuditEvent, inspectAuditEventChain, redactEventPayload, verifyAuditEventChain } = require('../scripts/audit-events');
const auditEventCheckpoint = require('../scripts/audit-event-checkpoint');
const logger = require('../scripts/logger');
const selfDefense = require('../scripts/self-defense');

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-audit-events-'));
}

function withCheckpointRoot(fn) {
  const previous = process.env.YIELDOS_AUDIT_EVENTS_ROOT;
  process.env.YIELDOS_AUDIT_EVENTS_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-audit-checkpoints-'));
  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env.YIELDOS_AUDIT_EVENTS_ROOT;
    } else {
      process.env.YIELDOS_AUDIT_EVENTS_ROOT = previous;
    }
  }
}

function readEvents(root) {
  const filePath = path.join(root, 'security', 'yieldos-events.jsonl');
  return fs.readFileSync(filePath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
}

test('appendAuditEvent writes sequenced hash chained JSONL', () => {
  withCheckpointRoot(() => {
    const root = tmpProject();
    const first = appendAuditEvent({
      projectRoot: root,
      eventType: 'policy.decision',
      decision: 'block',
      subject: { kind: 'package', name: 'evil-package' },
      payload: { command: 'npm install evil-package' },
      now: '2026-05-10T00:00:00.000Z',
    });
    const second = appendAuditEvent({
      projectRoot: root,
      eventType: 'policy.decision',
      decision: 'allow',
      subject: { kind: 'package', name: 'safe-package' },
      payload: { command: 'npm install safe-package' },
      now: '2026-05-10T00:00:01.000Z',
    });

    assert.equal(first.sequence, 1);
    assert.equal(second.sequence, 2);
    assert.equal(second.prev_hash, first.event_hash);

    const events = readEvents(root);
    assert.equal(events.length, 2);
    assert.equal(events[1].prev_hash, first.event_hash);
    assert.deepEqual(verifyAuditEventChain(path.join(root, 'security', 'yieldos-events.jsonl')), { ok: true, events: 2 });
  });
});

test('checkpoint detection ignores benign prose and source-file commands', () => {
  withCheckpointRoot(() => {
    const runtimeRoot = process.env.YIELDOS_AUDIT_EVENTS_ROOT;
    const root = tmpProject();
    const checkpointPath = auditEventCheckpoint.checkpointPath({ projectRoot: root });
    assert.equal(auditEventCheckpoint.commandReferencesAuditEventCheckpoint('echo "yieldOS checkpoint design"', { runtimeRoot }), false);
    assert.equal(auditEventCheckpoint.commandReferencesAuditEventCheckpoint('node --test yieldOS/plugins/yieldos/tests/audit-events.test.js', { runtimeRoot }), false);
    assert.equal(
      auditEventCheckpoint.commandReferencesAuditEventCheckpoint(`cat ${checkpointPath}`, { runtimeRoot }),
      true,
    );
  });
});

test('redactEventPayload removes secrets from structured events', () => {
  const redacted = redactEventPayload({
    command: "curl -H 'Authorization: Bearer sk-test-secret' https://example.com",
    env: 'DATABASE_URL=postgres://user:pass@example/db',
    nested: { token: 'sk-proj-abcdefghijklmnopqrstuvwxyz1234567890ABCDE' },
    credentials: { raw: 'plain-secret-without-provider-prefix' },
  });

  const text = JSON.stringify(redacted);
  assert.equal(text.includes('sk-test-secret'), false);
  assert.equal(text.includes('postgres://user:pass'), false);
  assert.equal(text.includes('abcdefghijklmnopqrstuvwxyz1234567890ABCDE'), false);
  assert.equal(text.includes('plain-secret-without-provider-prefix'), false);
  assert.equal(text.includes('[REDACTED'), true);
});

test('appendAuditEvent refuses to append to a broken event chain', () => {
  withCheckpointRoot(() => {
    const root = tmpProject();
    appendAuditEvent({
      projectRoot: root,
      eventType: 'policy.decision',
      decision: 'block',
      subject: { kind: 'package', name: 'evil-package' },
      payload: { command: 'npm install evil-package' },
      now: '2026-05-10T00:00:00.000Z',
    });
    appendAuditEvent({
      projectRoot: root,
      eventType: 'policy.decision',
      decision: 'allow',
      subject: { kind: 'package', name: 'safe-package' },
      payload: { command: 'npm install safe-package' },
      now: '2026-05-10T00:00:01.000Z',
    });

    const filePath = path.join(root, 'security', 'yieldos-events.jsonl');
    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
    const first = JSON.parse(lines[0]);
    first.decision = 'allow';
    lines[0] = JSON.stringify(first);
    fs.writeFileSync(filePath, `${lines.join('\n')}\n`);

    assert.throws(
      () => appendAuditEvent({
        projectRoot: root,
        eventType: 'policy.decision',
        decision: 'allow',
        subject: { kind: 'package', name: 'later-package' },
        payload: { command: 'npm install later-package' },
      }),
      /audit event chain is invalid/,
    );
  });
});

test('appendAuditEvent refuses tail truncation after checkpointing', () => {
  withCheckpointRoot(() => {
    const root = tmpProject();
    appendAuditEvent({
      projectRoot: root,
      eventType: 'policy.decision',
      decision: 'block',
      subject: { kind: 'package', name: 'evil-package' },
      payload: { command: 'npm install evil-package' },
      now: '2026-05-10T00:00:00.000Z',
    });
    appendAuditEvent({
      projectRoot: root,
      eventType: 'policy.decision',
      decision: 'allow',
      subject: { kind: 'package', name: 'safe-package' },
      payload: { command: 'npm install safe-package' },
      now: '2026-05-10T00:00:01.000Z',
    });

    const filePath = path.join(root, 'security', 'yieldos-events.jsonl');
    const [firstLine] = fs.readFileSync(filePath, 'utf8').trim().split('\n');
    fs.writeFileSync(filePath, `${firstLine}\n`);

    assert.deepEqual(inspectAuditEventChain(filePath), { ok: true, events: 1, last_hash: JSON.parse(firstLine).event_hash });
    assert.deepEqual(verifyAuditEventChain(filePath, { projectRoot: root }), {
      ok: false,
      events: 1,
      reason: 'checkpoint-mismatch',
    });
    assert.throws(
      () => appendAuditEvent({
        projectRoot: root,
        eventType: 'policy.decision',
        decision: 'allow',
        subject: { kind: 'package', name: 'later-package' },
        payload: { command: 'npm install later-package' },
      }),
      /checkpoint mismatch/,
    );
  });
});

test('checkpoint identity survives symlinked project aliases', () => {
  if (process.platform === 'win32') return;
  withCheckpointRoot(() => {
    const root = tmpProject();
    const link = path.join(os.tmpdir(), `yieldos-audit-events-link-${Date.now()}-${process.pid}`);
    fs.symlinkSync(root, link, 'dir');

    appendAuditEvent({
      projectRoot: root,
      eventType: 'policy.decision',
      decision: 'block',
      subject: { kind: 'package', name: 'first-package' },
      payload: { command: 'npm install first-package' },
      now: '2026-05-10T00:00:00.000Z',
    });
    appendAuditEvent({
      projectRoot: link,
      eventType: 'policy.decision',
      decision: 'allow',
      subject: { kind: 'package', name: 'second-package' },
      payload: { command: 'npm install second-package' },
      now: '2026-05-10T00:00:01.000Z',
    });
    const third = appendAuditEvent({
      projectRoot: root,
      eventType: 'policy.decision',
      decision: 'allow',
      subject: { kind: 'package', name: 'third-package' },
      payload: { command: 'npm install third-package' },
      now: '2026-05-10T00:00:02.000Z',
    });

    assert.equal(third.sequence, 3);
    assert.equal(
      auditEventCheckpoint.checkpointPath({ projectRoot: root }),
      auditEventCheckpoint.checkpointPath({ projectRoot: link }),
    );
    assert.deepEqual(verifyAuditEventChain(path.join(root, 'security', 'yieldos-events.jsonl'), { projectRoot: root }), { ok: true, events: 3 });
  });
});

test('logger writes human markdown and structured audit event', () => {
  withCheckpointRoot(() => {
    const root = tmpProject();
    const markdownPath = logger.logBlocked(root, {
      type: 'library',
      name: 'event-stream',
      version: '3.3.6',
      source: 'npm',
      command: 'npm install event-stream@3.3.6',
    }, 'denylist-match');

    assert.equal(fs.readFileSync(markdownPath, 'utf8').includes('Blocked Install'), true);
    const [event] = readEvents(root);
    assert.equal(event.event_type, 'hook.decision');
    assert.equal(event.decision, 'block');
    assert.equal(event.subject.name, 'event-stream');
    assert.equal(event.payload.heading, 'Blocked Install');
  });
});

test('audit event writer rejects symlink traversal', () => {
  if (process.platform === 'win32') return;
  const root = tmpProject();
  const outside = tmpProject();
  fs.symlinkSync(outside, path.join(root, 'security'), 'dir');

  assert.throws(
    () => appendAuditEvent({
      projectRoot: root,
      eventType: 'policy.decision',
      decision: 'block',
      subject: { kind: 'package', name: 'event-stream' },
      payload: { command: 'npm install event-stream' },
    }),
    /audit event path must not traverse a symlink/,
  );
});

test('self defense protects structured audit events from agent writes', () => {
  withCheckpointRoot(() => {
    const root = tmpProject();
    const checkpointPath = auditEventCheckpoint.checkpointPath({ projectRoot: root });
    assert.equal(selfDefense.isProtectedPath('/proj/security/yieldos-events.jsonl'), true);
    assert.equal(selfDefense.isProtectedPath('/proj/security/.yieldos-events.lock'), true);
    assert.equal(selfDefense.isProtectedPath(checkpointPath), true);
  });
});

test('parallel audit event writers produce a valid sequence', async () => {
  const root = tmpProject();
  const checkpointRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-audit-checkpoints-'));
  const auditEventsPath = path.resolve(__dirname, '..', 'scripts', 'audit-events.js');
  const script = [
    `const { appendAuditEvent } = require(${JSON.stringify(auditEventsPath)});`,
    `appendAuditEvent({ projectRoot: ${JSON.stringify(root)}, eventType: 'race.test', decision: 'allow', subject: { kind: 'race' }, payload: { pid: process.pid } });`,
  ].join('\n');

  const results = await Promise.all(Array.from({ length: 8 }, () => new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', script], {
      encoding: 'utf8',
      env: { ...process.env, YIELDOS_AUDIT_EVENTS_ROOT: checkpointRoot },
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (status) => resolve({ status, stderr }));
  })));

  for (const result of results) {
    assert.equal(result.status, 0, result.stderr);
  }
  const events = readEvents(root);
  assert.deepEqual(events.map((event) => event.sequence), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(verifyAuditEventChain(path.join(root, 'security', 'yieldos-events.jsonl')), { ok: true, events: 8 });
});
