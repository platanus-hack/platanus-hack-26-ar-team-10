'use strict';

const fs = require('node:fs');
const path = require('node:path');

const LOCKFILES = {
  npm: 'package-lock.json',
  pnpm: 'pnpm-lock.yaml',
  yarn: 'yarn.lock',
  bun: 'bun.lockb',
  pip: null,
  poetry: 'poetry.lock',
  uv: 'uv.lock',
  cargo: 'Cargo.lock',
  go: 'go.sum',
};

function lockfileExists(projectRoot, manager) {
  const filename = LOCKFILES[manager];
  if (!filename) return null;
  return fs.existsSync(path.join(projectRoot, filename));
}

function tierForMissingLockfile(manager) {
  return manager && LOCKFILES[manager] ? 'tier3' : 'clean';
}

module.exports = { lockfileExists, tierForMissingLockfile, LOCKFILES };
