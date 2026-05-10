#!/usr/bin/env node
'use strict';

const { verifyAuditState } = require('./state');

function parseArgs(argv) {
  const options = { mode: 'pr' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--mode') {
      options.mode = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--base') {
      options.baseRef = argv[i + 1];
      i += 1;
    }
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = verifyAuditState(process.cwd(), options);
  if (result.ok) {
    process.stderr.write('[yieldOS] code-audit state verified\n');
    process.exit(0);
  }

  process.stderr.write(`[yieldOS] code-audit state verification failed: ${result.reason}\n`);
  process.stderr.write('[yieldOS:verdict] code-audit-verification-failed\n');
  process.exit(2);
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs };
