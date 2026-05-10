#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { commandOutputEvidence, writeJson } from './benchmark-utils.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_SCANNERS = [
  { id: 'semgrep', command: 'semgrep', args: ['scan', '--config', 'auto', '--json'] },
  { id: 'gitleaks', command: 'gitleaks', args: ['detect', '--no-banner', '--redact'] },
  { id: 'codeql', command: 'codeql', args: ['database', 'analyze', '--help'] },
  { id: 'snyk', command: 'snyk', args: ['test', '--json'] },
];

function runScannerComparison(options = {}) {
  const repoRoot = options.repoRoot || REPO_ROOT;
  const env = options.env || process.env;
  const scanners = options.scanners || DEFAULT_SCANNERS;
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    benchmark: {
      id: 'optional-scanner-comparison',
      note: 'Scanners are run only when installed locally. yieldOS value is workflow prevention before commit, not scanner replacement.',
    },
    scanners: scanners.map((scanner) => runScanner(repoRoot, scanner, env)),
  };
}

function runScanner(repoRoot, scanner, env) {
  const available = spawnSync(scanner.command, ['--version'], { encoding: 'utf8', env, timeout: 10000 });
  if (available.error && available.error.code === 'ENOENT') {
    return { id: scanner.id, command: scanner.command, status: 'not_installed' };
  }
  const result = spawnSync(scanner.command, scanner.args || [], {
    cwd: repoRoot,
    encoding: 'utf8',
    env,
    timeout: scanner.timeout || 60000,
  });
  if (result.error && result.error.code === 'ENOENT') {
    return { id: scanner.id, command: scanner.command, status: 'not_installed' };
  }
  return {
    id: scanner.id,
    command: scanner.command,
    status: 'ran',
    exit_code: result.status,
    output: commandOutputEvidence(result),
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const parsed = {
    outFile: path.join(REPO_ROOT, 'benchmarks', `scanner-comparison-benchmark-${new Date().toISOString().replace(/[:.]/g, '-')}.json`),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') parsed.outFile = path.resolve(requireValue(arg, argv[++i]));
    else if (arg === '--help' || arg === '-h') parsed.help = true;
    else throw new Error(`unknown option: ${arg}`);
  }
  return parsed;
}

function requireValue(flag, value) {
  if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value`);
  return value;
}

function usage() {
  return [
    'Usage: node scripts/scanner-comparison-benchmark.mjs --out benchmarks/<file>.json',
    '',
    'Runs optional local scanners when installed and records not_installed otherwise.',
  ].join('\n');
}

async function main() {
  try {
    const args = parseArgs();
    if (args.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const report = runScannerComparison();
    writeJson(args.outFile, report);
    process.stdout.write(`${JSON.stringify({ outFile: args.outFile, scanners: report.scanners.map(({ id, status }) => ({ id, status })) }, null, 2)}\n`);
  } catch (err) {
    process.stderr.write(`scanner-comparison-benchmark: ${err.message}\n`);
    process.exit(2);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

export {
  parseArgs,
  runScannerComparison,
};
