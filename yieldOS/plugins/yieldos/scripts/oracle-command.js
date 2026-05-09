#!/usr/bin/env node
'use strict';

const path = require('node:path');

const { listOracles, getOracle } = require('./oracles/registry');

function parseArgs(argv = []) {
  const args = [...argv];
  const command = args.shift() || 'list';
  const parsed = { command, oracleId: null, options: {}, help: false };
  if (command === '--help' || command === '-h' || command === 'help') {
    parsed.command = 'help';
    parsed.help = true;
    return parsed;
  }
  if (command === 'run') parsed.oracleId = args.shift();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--mode') parsed.options.mode = requireValue(arg, args[++i]);
    else if (arg === '--base') parsed.options.baseRef = requireValue(arg, args[++i]);
    else if (arg === '--pack') parsed.options.packPath = requireValue(arg, args[++i]);
    else if (arg === '--file') parsed.options.file = requireValue(arg, args[++i]);
    else if (arg === '--context') parsed.options.context = requireValue(arg, args[++i]);
    else if (arg === '--contract') parsed.options.contract = requireValue(arg, args[++i]);
    else if (arg === '--runtime') parsed.options.runtime = requireValue(arg, args[++i]);
    else if (arg === '--project-root') parsed.options.projectRoot = path.resolve(requireValue(arg, args[++i]));
    else if (arg === '--allow-runtime') parsed.options.allowRuntime = true;
    else if (arg === '--json') parsed.options.json = true;
    else throw new Error(`unknown oracle option: ${arg}`);
  }
  return parsed;
}

function requireValue(flag, value) {
  if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value`);
  return value;
}

async function runOracleCommand(projectRoot, argv = process.argv.slice(2), options = {}) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    return { exitCode: 2, message: `yieldOS oracle error: ${err.message}` };
  }
  const root = parsed.options.projectRoot || projectRoot;
  if (parsed.command === 'help') return { exitCode: 0, message: usage() };
  if (parsed.command === 'list') return { exitCode: 0, message: renderList(listOracles(), parsed.options), oracles: listOracles() };
  if (parsed.command !== 'run') return { exitCode: 2, message: `yieldOS oracle error: unknown command: ${parsed.command}` };
  if (!parsed.oracleId) return { exitCode: 2, message: 'yieldOS oracle error: run needs an oracle id' };
  const oracle = getOracle(parsed.oracleId);
  if (!oracle || oracle.public === false) return { exitCode: 2, message: `yieldOS oracle error: unknown oracle id: ${parsed.oracleId}` };

  const result = await runKnownOracle(root, parsed.oracleId, { ...parsed.options, ...options });
  const exitCode = result.status === 'pass' && !result.blocking ? 0 : result.status === 'fail' ? 1 : 2;
  return {
    exitCode,
    message: parsed.options.json ? `${JSON.stringify(result, null, 2)}\n` : renderResult(result),
    result,
  };
}

async function runKnownOracle(projectRoot, oracleId, options = {}) {
  if (oracleId === 'code-audit-state') return require('./oracles/adapters/code-audit-state').run(projectRoot, options);
  if (oracleId === 'agent-pack-lock') return require('./oracles/adapters/agent-pack-lock').run(projectRoot, options);
  if (oracleId === 'instruction-policy') return require('./oracles/adapters/instruction-policy').run(projectRoot, options);
  if (oracleId === 'project-tests') return require('./oracles/adapters/project-tests').run(projectRoot, options);
  if (oracleId === 'cdsc-replay' || oracleId === 'cdsc-proof') {
    if (!options.allowRuntime && process.env.YIELDOS_ORACLE_ALLOW_RUNTIME !== '1') {
      return require('./oracles/result').unknown({
        id: oracleId,
        kind: 'counterexample',
        summary: `${oracleId} starts a local runtime and requires --allow-runtime or YIELDOS_ORACLE_ALLOW_RUNTIME=1.`,
        blocking_reason: 'runtime-oracle-requires-explicit-approval',
        scope: { checked: [], not_checked: ['runtime execution'] },
      });
    }
  }
  if (oracleId === 'cdsc-replay') return require('./oracles/cdsc/replay-runner').run(projectRoot, options);
  if (oracleId === 'cdsc-proof') return require('./oracles/cdsc/proof').run(projectRoot, options);
  return require('./oracles/result').unknown({
    id: oracleId,
    kind: getOracle(oracleId)?.kind || 'policy',
    summary: `${oracleId} is registered but has no runnable adapter yet.`,
    blocking_reason: 'oracle-adapter-missing',
    scope: { checked: [], not_checked: [oracleId] },
  });
}

function renderList(oracles, options = {}) {
  if (options.json) return `${JSON.stringify(oracles, null, 2)}\n`;
  return [
    'yieldOS security oracles',
    '',
    ...oracles.map((oracle) => `- ${oracle.id} (${oracle.kind}, ${oracle.maturity}) - ${oracle.description}`),
    '',
    'Run with: yieldos-oracle run <id> [--json]',
  ].join('\n');
}

function renderResult(result) {
  return [
    `yieldOS oracle ${result.id}: ${result.status}`,
    `blocking: ${result.blocking ? 'yes' : 'no'}`,
    result.blocking_reason ? `reason: ${result.blocking_reason}` : '',
    `summary: ${result.summary}`,
    `result_hash: ${result.hashes?.result || ''}`,
  ].filter(Boolean).join('\n');
}

function usage() {
  return [
    'yieldos-oracle — run scoped security oracles',
    '',
    'usage:',
    '  yieldos-oracle list [--json]',
    '  yieldos-oracle run code-audit-state [--mode commit|push|pr] [--base origin/main] [--json]',
    '  yieldos-oracle run agent-pack-lock --pack yield.agent-pack.yaml [--json]',
    '  yieldos-oracle run instruction-policy --file AGENTS.md [--json]',
    '  yieldos-oracle run project-tests [--context commit|manual] [--json]',
    '  yieldos-oracle run cdsc-replay --contract security/oracles/<id>/contract.json --runtime yieldos.oracle-runtime.json --allow-runtime [--json]',
    '  yieldos-oracle run cdsc-proof --contract security/oracles/<id>/contract.json --runtime yieldos.oracle-runtime.json --allow-runtime [--json]',
    '',
    'Exit codes: 0 pass, 1 fail, 2 unknown/error.',
  ].join('\n');
}

async function main() {
  const result = await runOracleCommand(process.cwd());
  const stream = result.exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`${result.message.trimEnd()}\n`);
  process.exit(result.exitCode);
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`yieldOS oracle fatal: ${err.message}\n`);
    process.exit(2);
  });
}

module.exports = {
  parseArgs,
  runKnownOracle,
  runOracleCommand,
  renderList,
  renderResult,
};
