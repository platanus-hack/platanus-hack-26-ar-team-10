'use strict';

// HTTP + SSE server for the yieldOS pentest dashboard.
//
// Listens on YIELDOS_DASHBOARD_PORT (default 5473 — "SAFE" on a phone keypad).
//
// Endpoints:
//   GET  /                serve dashboard HTML
//   GET  /assets/<file>   serve static assets (js, css, etc.)
//   GET  /history         JSON dump of every event written so far
//   GET  /events          Server-Sent Events: live tail of pentest-events.jsonl
//   GET  /healthz         "ok"
//
// Multiple browsers can connect to /events at the same time — each gets its
// own watcher attached to the same JSONL file. When the file grows we read
// the new bytes, split on newline, JSON.parse each line, and write
// `data: {...}\n\n` for every event.

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const url = require('node:url');

const DEFAULT_PORT = parseInt(process.env.YIELDOS_DASHBOARD_PORT || '5473', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

function eventsPath(projectRoot) {
  return path.join(projectRoot, 'security', 'pentest-events.jsonl');
}

function safeJoinPublic(reqPath) {
  const cleaned = reqPath.replace(/\.\.+/g, '.').replace(/^\/+/, '');
  const abs = path.resolve(PUBLIC_DIR, cleaned);
  if (!abs.startsWith(path.resolve(PUBLIC_DIR))) return null;
  return abs;
}

function serveStatic(res, abs, fallbackContentType) {
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(abs).toLowerCase();
    // The dashboard is served from a long-running detached process and we
    // ship updates by editing files in place — never let the browser cache
    // a stale copy.
    res.writeHead(200, {
      'Content-Type': MIME[ext] || fallbackContentType || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    fs.createReadStream(abs).pipe(res);
  });
}

function readAllEvents(file) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const events = [];
  for (const l of lines) { try { events.push(JSON.parse(l)); } catch (_) {} }
  return events;
}

function attachLiveTail(file, onEvent) {
  // Track our own byte cursor so we never re-emit lines.
  let cursor = fs.existsSync(file) ? fs.statSync(file).size : 0;
  let watcher = null;

  function pump() {
    if (!fs.existsSync(file)) return;
    const stat = fs.statSync(file);
    if (stat.size < cursor) cursor = 0;          // file was truncated
    if (stat.size === cursor) return;
    const fd = fs.openSync(file, 'r');
    try {
      const len = stat.size - cursor;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, cursor);
      cursor = stat.size;
      const lines = buf.toString('utf8').split('\n').filter(Boolean);
      for (const l of lines) {
        try { onEvent(JSON.parse(l)); } catch (_) { /* skip malformed */ }
      }
    } finally { try { fs.closeSync(fd); } catch (_) {} }
  }

  function startWatch() {
    if (watcher) return;
    try {
      watcher = fs.watch(path.dirname(file), { persistent: true }, (_eventType, fname) => {
        if (fname && fname !== path.basename(file)) return;
        pump();
      });
    } catch (_) { /* fallback to interval below */ }
  }

  startWatch();
  // Belt-and-suspenders: poll every 500ms in case fs.watch misses an append
  // (it is platform-dependent and node_modules-y).
  const poll = setInterval(pump, 500);

  // Initial flush of anything that arrived between attach and first watcher tick.
  pump();

  return () => {
    if (watcher) { try { watcher.close(); } catch (_) {} }
    clearInterval(poll);
  };
}

function handleEvents(req, res, projectRoot) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`retry: 2000\n\n`);

  // Send a hello so the client knows it's connected.
  res.write(`event: hello\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`);

  // Replay history first so a fresh tab does not look empty.
  const past = readAllEvents(eventsPath(projectRoot));
  if (past.length > 0) {
    res.write(`event: history\ndata: ${JSON.stringify(past)}\n\n`);
  }

  const detach = attachLiveTail(eventsPath(projectRoot), (ev) => {
    res.write(`event: ${ev.type || 'event'}\ndata: ${JSON.stringify(ev)}\n\n`);
  });

  // Heartbeat every 15s (some proxies kill idle SSE connections).
  const hb = setInterval(() => {
    try { res.write(`: heartbeat ${Date.now()}\n\n`); } catch (_) {}
  }, 15000);

  req.on('close', () => { clearInterval(hb); detach(); try { res.end(); } catch (_) {} });
}

function createServer(projectRoot) {
  return http.createServer((req, res) => {
    const u = url.parse(req.url, true);
    const pathname = u.pathname || '/';

    if (pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return;
    }
    if (pathname === '/history') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ events: readAllEvents(eventsPath(projectRoot)) }));
      return;
    }
    if (pathname === '/events') return handleEvents(req, res, projectRoot);
    if (pathname === '/' || pathname === '/index.html') {
      return serveStatic(res, path.join(PUBLIC_DIR, 'index.html'), 'text/html');
    }
    if (pathname.startsWith('/assets/')) {
      const abs = safeJoinPublic(pathname.replace(/^\/assets/, ''));
      if (!abs) { res.writeHead(403); res.end('forbidden'); return; }
      return serveStatic(res, abs);
    }
    res.writeHead(404); res.end('not found');
  });
}

function start({ projectRoot, port = DEFAULT_PORT, log } = {}) {
  const server = createServer(projectRoot);
  return new Promise((resolve, reject) => {
    server.once('error', (err) => reject(err));
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      if (log) log(`yieldos dashboard listening on http://127.0.0.1:${addr.port}`);
      resolve({ server, port: addr.port });
    });
  });
}

if (require.main === module) {
  const root = process.argv[2] || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  start({ projectRoot: root, log: (l) => process.stdout.write(l + '\n') }).catch((err) => {
    process.stderr.write(`dashboard fatal: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = { createServer, start, eventsPath, readAllEvents, attachLiveTail };
