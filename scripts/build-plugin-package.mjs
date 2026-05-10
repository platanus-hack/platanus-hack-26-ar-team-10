#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = path.join(REPO_ROOT, 'yieldOS/plugins/yieldos');
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, 'dist/yieldos-plugin');

const EXCLUDED_PATHS = new Set([
  'bin/yieldos-oracle-demo',
  'commands/oracle-demo.md',
  'scripts/oracles/bench.js',
  'scripts/oracles/demo-command.js',
]);

const EXCLUDED_DIRS = new Set([
  'fixtures',
  'node_modules',
  'tests',
]);

function buildPluginPackage({ repoRoot = REPO_ROOT, outDir = DEFAULT_OUT_DIR } = {}) {
  const sourceDir = path.join(repoRoot, 'yieldOS/plugins/yieldos');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  copyTree(sourceDir, outDir, '');
  return { sourceDir, outDir };
}

function copyTree(source, target, relativePath) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    const name = path.basename(relativePath);
    if (EXCLUDED_DIRS.has(name)) return;
    fs.mkdirSync(target, { recursive: true, mode: stat.mode });
    for (const entry of fs.readdirSync(source)) {
      const nextRelative = relativePath ? `${relativePath}/${entry}` : entry;
      copyTree(path.join(source, entry), path.join(target, entry), nextRelative);
    }
    return;
  }
  if (!stat.isFile()) return;
  if (EXCLUDED_PATHS.has(relativePath)) return;
  if (relativePath.endsWith('.test.js') || relativePath.endsWith('.test.mjs')) return;
  fs.copyFileSync(source, target);
  fs.chmodSync(target, stat.mode);
}

function parseArgs(argv = process.argv.slice(2)) {
  const parsed = { outDir: DEFAULT_OUT_DIR };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') parsed.outDir = path.resolve(requireValue(arg, argv[++i]));
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
    'Usage: node scripts/build-plugin-package.mjs [--out dist/yieldos-plugin]',
    '',
    'Builds the installable yieldOS plugin runtime without tests, fixtures, demos, or benchmark-only files.',
  ].join('\n');
}

function main() {
  try {
    const args = parseArgs();
    if (args.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const result = buildPluginPackage({ outDir: args.outDir });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (err) {
    process.stderr.write(`build-plugin-package: ${err.message}\n`);
    process.exit(2);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  buildPluginPackage,
  parseArgs,
};
