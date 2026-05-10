'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { pass, fail, unknown } = require('../result');

const DEFAULT_RESPONSE_BODY_LIMIT_BYTES = 64 * 1024;
const MAX_READY_TIMEOUT_MS = 30000;
const MAX_REQUEST_TIMEOUT_MS = 10000;
const MAX_RESPONSE_BODY_LIMIT_BYTES = 64 * 1024;

async function run(projectRoot, options = {}) {
  try {
    const contractPath = requireOption(options.contract, '--contract');
    const runtimePath = requireOption(options.runtime, '--runtime');
    const contract = readJson(resolveProjectPath(projectRoot, contractPath));
    const replayPath = options.replay
      ? resolveProjectPath(projectRoot, options.replay)
      : path.join(path.dirname(resolveProjectPath(projectRoot, contractPath)), 'replay.json');
    const replay = readJson(replayPath);
    const runtime = runtimeForMode(readJson(resolveProjectPath(projectRoot, runtimePath)), options.runtimeMode || options.mode);
    return await runReplay(projectRoot, contract, replay, runtime, options);
  } catch (err) {
    return unknown({
      id: 'cdsc-replay',
      kind: 'counterexample',
      subject: { type: 'replay', ref: options.contract || 'unknown' },
      scope: { checked: [], not_checked: ['runtime replay'] },
      evidence: [{ type: 'error', value: err.message }],
      summary: `CDSC replay could not run: ${err.message}`,
      blocking_reason: 'cdsc-replay-runtime-error',
    });
  }
}

async function runReplay(projectRoot, contract, replay, runtime, options = {}) {
  const port = options.port || await freePort();
  let child = null;
  try {
    const resolvedRuntime = resolveRuntime(runtime, port, projectRoot);
    validateReplay(replay);
    child = startRuntime(projectRoot, resolvedRuntime);
    await waitForHealth(resolvedRuntime.health_url, resolvedRuntime.ready_timeout_ms, resolvedRuntime.health_expect_status);
    const observed = await requestHttp(resolvedRuntime.base_url, replay.request, {
      timeoutMs: resolvedRuntime.request_timeout_ms,
      maxBodyBytes: resolvedRuntime.response_body_limit_bytes,
    });
    const expected = replay.expect?.status || contract.expect?.status || [];
    const accepted = expected.includes(observed.status);
    if (accepted) {
      return pass({
        id: 'cdsc-replay',
        kind: 'counterexample',
        subject: {
          type: 'http-route',
          ref: `${replay.request.method || 'GET'} ${replay.request.path}`,
        },
        scope: { checked: ['HTTP method', 'HTTP path', 'unauthenticated response status'], not_checked: ['handler reachability unless sentinel is configured'] },
        evidence: [
          { type: 'observed', value: observed },
          { type: 'expected-status', value: expected },
        ],
        summary: `Replay received expected denied status ${observed.status}.`,
      });
    }
    return fail({
      id: 'cdsc-replay',
      kind: 'counterexample',
      subject: {
        type: 'http-route',
        ref: `${replay.request.method || 'GET'} ${replay.request.path}`,
      },
      scope: { checked: ['HTTP method', 'HTTP path', 'unauthenticated response status'], not_checked: ['full auth policy beyond this replay'] },
      evidence: [
        { type: 'observed', value: observed },
        { type: 'expected-status', value: expected },
      ],
      summary: `Replay expected ${expected.join('/')} but received ${observed.status}.`,
      blocking_reason: 'cdsc-replay-counterexample',
    });
  } catch (err) {
    return unknown({
      id: 'cdsc-replay',
      kind: 'counterexample',
      subject: {
        type: 'http-route',
        ref: replay?.request ? `${replay.request.method || 'GET'} ${replay.request.path || ''}` : 'unknown',
      },
      scope: { checked: [], not_checked: ['HTTP replay completed with evidence'] },
      evidence: [{ type: 'error', value: err.message }],
      summary: `Replay runtime error: ${err.message}`,
      blocking_reason: 'cdsc-replay-runtime-error',
    });
  } finally {
    await stopRuntime(child);
  }
}

function validateReplay(replay) {
  if (!replay || replay.type !== 'http') throw new Error('replay.type must be http');
  if (!replay.request || typeof replay.request.path !== 'string') throw new Error('replay.request.path is required');
  if (!replay.request.path.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(replay.request.path)) {
    throw new Error('replay.request.path must be a root-relative path');
  }
  if (!replay.expect || !Array.isArray(replay.expect.status) || replay.expect.status.length === 0) {
    throw new Error('replay.expect.status must list accepted status codes');
  }
}

function runtimeForMode(runtime, mode) {
  if (mode && runtime[mode]) return runtime[mode];
  if (runtime.fixed && mode !== 'baseline') return runtime.fixed;
  if (runtime.baseline) return runtime.baseline;
  throw new Error('runtime manifest needs baseline/fixed entries or a selected runtime mode');
}

function resolveRuntime(runtime, port, projectRoot) {
  const envAllowlist = runtime.env_allowlist || ['NODE_ENV', 'PORT'];
  const env = {};
  for (const key of envAllowlist) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  env.PORT = String(port);
  const cwd = runtime.cwd ? resolveProjectPath(projectRoot, runtime.cwd, { mustExist: true, allowDirectory: true }) : path.resolve(projectRoot);
  const command = resolveCommand(runtime.command);
  const args = resolveArgs(runtime.args || [], cwd, port);
  return {
    cwd,
    command,
    args,
    health_url: validateLoopbackUrl(replacePlaceholders(requireOption(runtime.health_url, 'runtime.health_url'), port), port, 'runtime.health_url'),
    base_url: validateLoopbackUrl(replacePlaceholders(requireOption(runtime.base_url, 'runtime.base_url'), port), port, 'runtime.base_url'),
    health_expect_status: runtime.health_expect_status || [200],
    ready_timeout_ms: boundedPositive(runtime.ready_timeout_ms, 10000, MAX_READY_TIMEOUT_MS),
    request_timeout_ms: boundedPositive(runtime.request_timeout_ms, 5000, MAX_REQUEST_TIMEOUT_MS),
    response_body_limit_bytes: boundedPositive(runtime.response_body_limit_bytes, DEFAULT_RESPONSE_BODY_LIMIT_BYTES, MAX_RESPONSE_BODY_LIMIT_BYTES),
    env,
  };
}

function replacePlaceholders(value, port) {
  return String(value)
    .replace(/\$\{PORT\}/g, String(port))
    .replace(/\$\{NODE\}/g, process.execPath);
}

function resolveCommand(command) {
  const resolved = replacePlaceholders(requireOption(command, 'runtime.command'), '');
  if (resolved !== process.execPath) {
    throw new Error('runtime.command must be ${NODE}; arbitrary executables are not allowed in CDSC v0');
  }
  return resolved;
}

function resolveArgs(args, cwd, port) {
  if (!Array.isArray(args) || args.length === 0) throw new Error('runtime.args must include a Node script path');
  return args.map((arg, index) => {
    const value = replacePlaceholders(String(arg), port);
    if (index === 0) {
      if (value.startsWith('-') || path.isAbsolute(value) || !value.endsWith('.js')) {
        throw new Error('runtime.args[0] must be a relative .js file');
      }
      const script = path.resolve(cwd, value);
      const prefix = cwd.endsWith(path.sep) ? cwd : `${cwd}${path.sep}`;
      if (script !== cwd && !script.startsWith(prefix)) throw new Error('runtime script must stay inside runtime cwd');
      if (!fs.existsSync(script)) throw new Error(`runtime script not found: ${value}`);
      assertNoSymlinkTraversal(cwd, script, 'runtime script');
      return value;
    }
    if (value.startsWith('-')) throw new Error('runtime args may not pass Node flags in CDSC v0');
    return value;
  });
}

function startRuntime(projectRoot, runtime) {
  return spawn(runtime.command, runtime.args, {
    cwd: runtime.cwd || projectRoot,
    shell: false,
    detached: false,
    stdio: ['ignore', 'ignore', 'ignore'],
    env: runtime.env,
  });
}

async function stopRuntime(child) {
  if (!child || child.killed) return;
  const exited = waitForExit(child);
  try { child.kill('SIGTERM'); } catch (_) { /* best effort */ }
  const stopped = await Promise.race([exited.then(() => true), delay(500).then(() => false)]);
  if (!stopped) {
    try { child.kill('SIGKILL'); } catch (_) { /* best effort */ }
    await Promise.race([exited, delay(500)]);
  }
}

async function waitForHealth(url, timeoutMs, expectedStatus = [200]) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await simpleRequest(url, { method: 'GET', timeoutMs: 1000 });
      if (expectedStatus.includes(result.status)) return;
      lastError = new Error(`health returned ${result.status}`);
    } catch (err) {
      lastError = err;
    }
    await delay(100);
  }
  throw new Error(`health check did not pass within ${timeoutMs}ms: ${lastError?.message || 'timeout'}`);
}

async function requestHttp(baseUrl, request, options = {}) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(request.path)) throw new Error('replay.request.path must be relative to the runtime base URL');
  const base = new URL(baseUrl);
  const url = new URL(request.path, baseUrl);
  if (url.origin !== base.origin) throw new Error('replay request must stay on the runtime origin');
  return simpleRequest(url.toString(), {
    method: request.method || 'GET',
    headers: safeHeaders(request.headers || {}),
    timeoutMs: options.timeoutMs,
    maxBodyBytes: boundedPositive(request.max_body_bytes || options.maxBodyBytes, DEFAULT_RESPONSE_BODY_LIMIT_BYTES, MAX_RESPONSE_BODY_LIMIT_BYTES),
  });
}

function simpleRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const maxBodyBytes = boundedPositive(options.maxBodyBytes, DEFAULT_RESPONSE_BODY_LIMIT_BYTES, MAX_RESPONSE_BODY_LIMIT_BYTES);
    const req = http.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeoutMs || 5000,
    }, (res) => {
      const chunks = [];
      let bytes = 0;
      let truncated = false;
      res.on('data', (chunk) => {
        if (bytes >= maxBodyBytes) {
          truncated = true;
          return;
        }
        const remaining = maxBodyBytes - bytes;
        const kept = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
        if (kept.length < chunk.length) truncated = true;
        chunks.push(kept);
        bytes += kept.length;
      });
      res.on('end', () => resolve({
        status: res.statusCode,
        body_bytes: bytes,
        body_sha256: sha256(Buffer.concat(chunks)),
        body_truncated: truncated,
      }));
    });
    req.on('timeout', () => {
      req.destroy(new Error('request timed out'));
    });
    req.on('error', reject);
    req.end();
  });
}

function boundedPositive(value, fallback, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(Math.floor(number), max);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForExit(child) {
  return new Promise((resolve) => {
    child.once('exit', () => resolve());
  });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function resolveProjectPath(projectRoot, relativePath, options = {}) {
  if (path.isAbsolute(relativePath)) throw new Error('path must be relative and stay inside the project');
  const root = path.resolve(projectRoot);
  const target = path.resolve(root, relativePath);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (target !== root && !target.startsWith(prefix)) throw new Error('path must stay inside the project');
  if (options.mustExist && !fs.existsSync(target)) throw new Error(`path does not exist: ${relativePath}`);
  assertNoSymlinkTraversal(root, target, 'path');
  if (options.allowDirectory !== true && fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    throw new Error('path must be a file');
  }
  return target;
}

function validateLoopbackUrl(value, port, label) {
  const url = new URL(value);
  if (url.protocol !== 'http:') throw new Error(`${label} must use http`);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error(`${label} must use loopback host`);
  if (Number(url.port) !== Number(port)) throw new Error(`${label} must use the selected runtime port`);
  url.expectedStatus = [200];
  return url.toString();
}

function safeHeaders(headers) {
  const out = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const lower = key.toLowerCase();
    if (['authorization', 'cookie', 'host', 'proxy-authorization'].includes(lower)) {
      throw new Error(`replay header is not allowed: ${key}`);
    }
    if (!/^[a-z0-9-]+$/i.test(key)) throw new Error(`invalid replay header: ${key}`);
    out[key] = String(value);
  }
  return out;
}

function assertNoSymlinkTraversal(root, target, label) {
  const relative = path.relative(root, target);
  if (!relative) return;
  let current = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`${label} must not traverse a symlink`);
    } catch (err) {
      if (err.code === 'ENOENT') break;
      throw err;
    }
  }
}

function sha256(buffer) {
  return `sha256:${crypto.createHash('sha256').update(buffer).digest('hex')}`;
}

function requireOption(value, label) {
  if (!value) throw new Error(`${label} is required`);
  return value;
}

module.exports = {
  run,
  runReplay,
  runtimeForMode,
  resolveRuntime,
  resolveProjectPath,
  validateReplay,
  boundedPositive,
};
