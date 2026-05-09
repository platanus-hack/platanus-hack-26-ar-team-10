'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const dashboardServer = require('../dashboard/server');
const launcher = require('../dashboard/launcher');

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yos-dash-'));
  fs.mkdirSync(path.join(dir, 'security'), { recursive: true });
  return dir;
}

function fetchOnce(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

function consumeSse(port, path, ms) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('error', reject);
      setTimeout(() => { req.destroy(); resolve(body); }, ms);
    });
    req.on('error', reject);
    req.end();
  });
}

test('server: GET / returns dashboard HTML', async () => {
  const root = tmpProject();
  const { server, port } = await dashboardServer.start({ projectRoot: root, port: 0 });
  try {
    const res = await fetchOnce(port, '/');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'] || '', /text\/html/);
    assert.match(res.body, /yieldOS · Pentest Live Battle/);
  } finally { server.close(); }
});

test('server: GET /history returns past events as JSON', async () => {
  const root = tmpProject();
  const eventsFile = path.join(root, 'security', 'pentest-events.jsonl');
  fs.writeFileSync(eventsFile,
    JSON.stringify({ type: 'red_attack', round: 1, title: 'IDOR', severity: 'high', file: 'a.js' }) + '\n' +
    JSON.stringify({ type: 'blue_defended', round: 1, fix_summary: 'fixed', edits_applied: 1 }) + '\n');
  const { server, port } = await dashboardServer.start({ projectRoot: root, port: 0 });
  try {
    const res = await fetchOnce(port, '/history');
    assert.equal(res.status, 200);
    const j = JSON.parse(res.body);
    assert.equal(j.events.length, 2);
    assert.equal(j.events[0].type, 'red_attack');
    assert.equal(j.events[1].type, 'blue_defended');
  } finally { server.close(); }
});

test('server: GET /events streams SSE with hello + history + new lines', async () => {
  const root = tmpProject();
  const eventsFile = path.join(root, 'security', 'pentest-events.jsonl');
  fs.writeFileSync(eventsFile, JSON.stringify({ type: 'red_attack', round: 1, title: 'a', severity: 'low', file: 'x.js' }) + '\n');
  const { server, port } = await dashboardServer.start({ projectRoot: root, port: 0 });
  try {
    const sseP = consumeSse(port, '/events', 800);
    // Append a new event after a small delay so we cross the watcher.
    setTimeout(() => fs.appendFileSync(eventsFile, JSON.stringify({ type: 'blue_defended', round: 1, fix_summary: 'ok', edits_applied: 1 }) + '\n'), 200);
    const body = await sseP;
    assert.match(body, /event: hello/);
    assert.match(body, /event: history/);
    assert.match(body, /"type":"red_attack"/);
    assert.match(body, /event: blue_defended/);
  } finally { server.close(); }
});

test('server: GET /healthz', async () => {
  const root = tmpProject();
  const { server, port } = await dashboardServer.start({ projectRoot: root, port: 0 });
  try {
    const res = await fetchOnce(port, '/healthz');
    assert.equal(res.status, 200);
    assert.equal(res.body, 'ok');
  } finally { server.close(); }
});

test('server: static asset path traversal is rejected', async () => {
  const root = tmpProject();
  const { server, port } = await dashboardServer.start({ projectRoot: root, port: 0 });
  try {
    const res = await fetchOnce(port, '/assets/../../../../etc/passwd');
    // Either 404 (path resolves outside public) or 403 — the file should NOT be served.
    assert.notEqual(res.status, 200);
    assert.doesNotMatch(res.body || '', /root:/);
  } finally { server.close(); }
});

test('launcher: idempotent + status + stop', async () => {
  const root = tmpProject();
  // Use a sleeper as a stand-in so we do not actually open a port in tests.
  const { spawn } = require('node:child_process');
  const sleeper = spawn('sleep', ['30'], { stdio: 'ignore', detached: true });
  sleeper.unref();
  fs.writeFileSync(launcher.lockPath(root), JSON.stringify({ pid: sleeper.pid, port: 5473, url: 'http://127.0.0.1:5473', started_at: new Date().toISOString() }));
  assert.equal(launcher.isAlreadyRunning(root), true);
  const s = launcher.status(root);
  assert.equal(s.running, true);
  assert.equal(s.port, 5473);
  const stopped = launcher.stop(root);
  assert.equal(stopped.status, 'stopped');
  assert.equal(stopped.pid, sleeper.pid);
});
