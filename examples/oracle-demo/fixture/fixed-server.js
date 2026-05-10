'use strict';

const http = require('node:http');

const port = Number(process.env.PORT || 0);
const users = [{ id: 1, email: 'admin@example.com' }];

function requireAuth(req, res) {
  if (req.headers.authorization === 'Bearer demo-token') return true;
  res.writeHead(401, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'unauthorized' }));
  return false;
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.method === 'GET' && req.url === '/admin/users') {
    if (!requireAuth(req, res)) return;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(users));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

server.listen(port, '127.0.0.1');
