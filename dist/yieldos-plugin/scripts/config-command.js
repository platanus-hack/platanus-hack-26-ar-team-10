#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const runtimeConfig = require('./runtime-config');

function parseArgs(argv = []) {
  const parsed = {
    command: argv[0] && !argv[0].startsWith('--') ? argv[0] : 'show',
    write: false,
    force: false,
    help: false,
  };
  if (parsed.command === 'help') parsed.help = true;

  const args = [...argv];
  if (args[0] && !args[0].startsWith('--')) args.shift();
  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--write') parsed.write = true;
    else if (arg === '--force') parsed.force = true;
    else if (arg === '-h' || arg === '--help') parsed.help = true;
    else throw new Error(`unknown config option: ${arg}`);
  }
  return parsed;
}

function runConfigCommand(projectRoot = process.cwd(), argv = process.argv.slice(2), options = {}) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    return { exitCode: 2, message: `yieldOS config error: ${err.message}` };
  }

  if (parsed.help) return { exitCode: 0, message: usage() };
  try {
    if (parsed.command === 'init') return initConfig(projectRoot, parsed);
    if (parsed.command === 'show') return showConfig(projectRoot, options);
    if (parsed.command === 'validate') return validateConfig(projectRoot);
    return { exitCode: 2, message: `yieldOS config error: unknown command: ${parsed.command}` };
  } catch (err) {
    return { exitCode: 2, message: `yieldOS config error: ${err.message}` };
  }
}

function initConfig(projectRoot, parsed) {
  const target = path.join(projectRoot, runtimeConfig.CONFIG_FILE);
  const content = `${JSON.stringify(runtimeConfig.DEFAULT_RUNTIME_CONFIG, null, 2)}\n`;
  if (!parsed.write) {
    return {
      exitCode: 0,
      message: [
        'yieldOS config preview',
        '',
        `--- ${runtimeConfig.CONFIG_FILE} ---`,
        content.trimEnd(),
        '',
        'Rerun with `yieldos-config init --write` to create it.',
      ].join('\n'),
      path: target,
      content,
    };
  }
  if (fs.existsSync(target) && !parsed.force) {
    return {
      exitCode: 2,
      message: `yieldOS config refused to overwrite ${runtimeConfig.CONFIG_FILE}. Rerun with --force after reviewing it.`,
    };
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return { exitCode: 0, message: `yieldOS config wrote ${runtimeConfig.CONFIG_FILE}`, path: target, content };
}

function showConfig(projectRoot, options = {}) {
  const resolved = runtimeConfig.resolveRuntimeConfig(projectRoot, options);
  const overlay = resolved.config.orgOverlay;
  const lines = [
    'yieldOS runtime config',
    `source: ${resolved.source}`,
    `effective mode: ${resolved.config.mode}`,
    `locale: ${resolved.config.locale}`,
    `verbosity: ${resolved.config.ui.verbosity}`,
    `json: ${resolved.config.ui.json}`,
    `org overlay: ${overlay?.sha256 || overlay?.path || 'none'}`,
  ];
  for (const warning of resolved.warnings) lines.push(`warning: ${warning}`);
  return { exitCode: 0, message: lines.join('\n'), config: resolved.config };
}

function validateConfig(projectRoot) {
  const target = path.join(projectRoot, runtimeConfig.CONFIG_FILE);
  if (!fs.existsSync(target)) return { exitCode: 0, message: 'yieldOS config valid: default standard config' };

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch (err) {
    return { exitCode: 2, message: `yieldOS config error: invalid ${runtimeConfig.CONFIG_FILE}: ${err.message}` };
  }
  const validation = runtimeConfig.validateRuntimeConfig(parsed, { projectRoot });
  if (!validation.ok) {
    return { exitCode: 2, message: `yieldOS config error: ${validation.errors.join('; ')}` };
  }
  return { exitCode: 0, message: `yieldOS config valid: ${runtimeConfig.CONFIG_FILE}`, config: validation.config };
}

function usage() {
  return [
    'Usage: yieldos-config init|show|validate [--write] [--force]',
    '',
    'init previews .yieldos/config.json by default. Add --write to create it.',
    'show prints the effective runtime mode after env, repo config, and org overlay resolution.',
    'validate fails closed for invalid repo config.',
  ].join('\n');
}

function main() {
  const result = runConfigCommand(process.cwd());
  const stream = result.exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`${result.message}\n`);
  process.exit(result.exitCode);
}

if (require.main === module) main();

module.exports = {
  parseArgs,
  runConfigCommand,
  usage,
};
