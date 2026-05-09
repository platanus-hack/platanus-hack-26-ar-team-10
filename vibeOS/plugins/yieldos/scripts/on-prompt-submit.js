#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const policyFetcher = require('./policy-fetcher');

function readStdinSync() {
  try { return fs.readFileSync(0, 'utf8'); }
  catch (_) { return ''; }
}

async function main() {
  readStdinSync();
  if (policyFetcher.isRuntimeCacheStale()) {
    try {
      await policyFetcher.refreshFromOrigin();
    } catch (_) { /* ignore */ }
  }
  process.exit(0);
}

main().catch(() => process.exit(0));
