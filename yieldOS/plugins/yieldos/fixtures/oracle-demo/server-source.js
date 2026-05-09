'use strict';

const http = require('node:http');

const port = Number(process.env.PORT || 0);
const users = [{ id: 1, email: 'admin@example.com' }];
const routes = [];
const app = {
  get(route, ...handlers) {
    routes.push({ method: 'GET', route, handlers });
  },
};

function requireAuth(req, res, next) {
  if (req.headers.authorization === 'Bearer demo-token') {
    next();
    return;
  }
  res.writeHead(401, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'unauthorized' }));
}

app.get('/admin/users', requireAuth, (req, res) => res.json(users));

function withJson(res) {
  res.json = (value) => {
    if (res.writableEnded) return;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(value));
  };
  return res;
}

function runHandlers(handlers, req, res) {
  let index = 0;
  const next = () => {
    const handler = handlers[index];
    index += 1;
    if (!handler || res.writableEnded) return;
    if (handler.length >= 3) handler(req, res, next);
    else handler(req, res);
  };
  next();
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  const route = routes.find((item) => item.method === req.method && item.route === req.url);
  if (route) {
    runHandlers(route.handlers, req, withJson(res));
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(port, '127.0.0.1');

module.exports = app;
