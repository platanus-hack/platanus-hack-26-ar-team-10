'use strict';

// Background launcher for the dashboard server. Same lock-file pattern as
// the pentest-loop launcher: idempotent, survives session end, dead PIDs are
// auto-cleared. SessionStart only uses this when explicitly opted in.

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DEFAULT_PORT = parsePort(process.env.YIELDOS_DASHBOARD_PORT || '5473');

function parsePort(value) {
  const port = Number.parseInt(String(value), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return 5473;
  return port;
}

function securityDir(projectRoot) {
  const dir = path.join(projectRoot, 'security');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function lockPath(projectRoot) { return path.join(securityDir(projectRoot), 'dashboard-lock.json'); }
function logPath(projectRoot) { return path.join(securityDir(projectRoot), 'dashboard.log'); }

function pidIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (_) { return false; }
}

function readLock(projectRoot) {
  try { return JSON.parse(fs.readFileSync(lockPath(projectRoot), 'utf8')); } catch (_) { return null; }
}
function writeLock(projectRoot, payload) {
  fs.writeFileSync(lockPath(projectRoot), `${JSON.stringify(payload, null, 2)}\n`);
}
function clearLock(projectRoot) {
  try { fs.unlinkSync(lockPath(projectRoot)); } catch (_) {}
}

function isAlreadyRunning(projectRoot) {
  const lock = readLock(projectRoot);
  if (!lock) return false;
  if (pidIsAlive(lock.pid)) return true;
  clearLock(projectRoot);
  return false;
}

function launch(projectRoot, opts = {}) {
  if (isAlreadyRunning(projectRoot)) {
    const lock = readLock(projectRoot);
    return { status: 'already-running', pid: lock.pid, port: lock.port, url: lock.url };
  }
  const serverEntry = path.resolve(__dirname, 'server.js');
  if (!fs.existsSync(serverEntry)) {
    return { status: 'failed', reason: `dashboard server not found at ${serverEntry}` };
  }
  const port = parsePort(opts.port || DEFAULT_PORT);
  const log = logPath(projectRoot);
  fs.appendFileSync(log, `\n=== dashboard auto-launcher ${new Date().toISOString()} ===\n`);
  const out = fs.openSync(log, 'a');
  const err = fs.openSync(log, 'a');

  let child;
  try {
    child = spawn(process.execPath, [serverEntry, projectRoot], {
      cwd: projectRoot,
      stdio: ['ignore', out, err],
      detached: true,
      env: {
        ...process.env,
        YIELDOS_DASHBOARD_PORT: String(port),
        CLAUDE_PROJECT_DIR: projectRoot,
      },
    });
    child.unref();
  } finally {
    try { fs.closeSync(out); } catch (_) { /* best effort */ }
    try { fs.closeSync(err); } catch (_) { /* best effort */ }
  }

  const url = `http://127.0.0.1:${port}`;
  writeLock(projectRoot, { pid: child.pid, port, url, started_at: new Date().toISOString(), log });
  return { status: 'launched', pid: child.pid, port, url, log };
}

function stop(projectRoot) {
  const lock = readLock(projectRoot);
  if (!lock) return { status: 'not-running' };
  if (!pidIsAlive(lock.pid)) { clearLock(projectRoot); return { status: 'stale-lock-cleared' }; }
  try { process.kill(lock.pid, 'SIGTERM'); clearLock(projectRoot); return { status: 'stopped', pid: lock.pid }; }
  catch (e) { return { status: 'failed', reason: e.message }; }
}

function status(projectRoot) {
  const lock = readLock(projectRoot);
  if (!lock) return { running: false };
  return { running: pidIsAlive(lock.pid), ...lock };
}

module.exports = { launch, stop, status, isAlreadyRunning, lockPath, logPath, DEFAULT_PORT, parsePort, pidIsAlive };
