'use strict';

const users = [{ id: 1, email: 'admin@example.com' }];
const app = {
  get(route, handler) {
    return { route, handler };
  },
};

app.get('/admin/users', (req, res) => res.json(users));

module.exports = app;
