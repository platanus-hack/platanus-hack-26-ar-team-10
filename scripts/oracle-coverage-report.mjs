#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { CODE_AUDIT_CASES } from './code-audit-benchmark.mjs';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const oracleTemplates = require('../yieldOS/plugins/yieldos/scripts/oracles/templates');
const registry = require('../yieldOS/plugins/yieldos/scripts/oracles/registry');

const BENCHMARKED_TEMPLATE_IDS = new Set(CODE_AUDIT_CASES
  .filter((item) => item.expected !== 'allowed')
  .map((item) => item.id));

const ACTIVE_DEMO_TEMPLATE_IDS = new Set(['missing-authz']);
const ACTIVE_ADAPTER_TEMPLATE_IDS = new Set([
  'dangerous-instruction-edit',
  'prompt-injection',
  'vulnerable-outdated-component',
  'software-integrity-postinstall',
]);

function parseArgs(argv = process.argv.slice(2)) {
  const parsed = { outFile: null };
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

function buildCoverageReport() {
  const templates = oracleTemplates.listTemplates().map((item) => {
    const status = coverageStatus(item.id);
    return {
      id: item.id,
      title: item.title,
      severity: item.severity,
      kind: item.kind,
      status,
      standards: item.standards.map((standard) => `${standard.family}:${standard.id}`),
      benchmark_case: BENCHMARKED_TEMPLATE_IDS.has(item.id),
    };
  });

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    summary: {
      total_templates: templates.length,
      by_status: countBy(templates.map((item) => item.status)),
      by_kind: countBy(templates.map((item) => item.kind)),
    },
    runnable_oracles: registry.listOracles().map((oracle) => ({
      id: oracle.id,
      kind: oracle.kind,
      maturity: oracle.maturity,
      description: oracle.description,
    })),
    templates,
    limits: [
      'benchmarked means covered by a committed benchmark case, not whole-class proof',
      'active-demo means there is a runnable demo/proof path for at least one fixture',
      'active-adapter means a policy/evidence adapter exists, but not every template in that family is benchmarked',
      'template-only means the oracle contract is defined but needs an executable fixture or adapter before product claims',
    ],
  };
}

function coverageStatus(id) {
  if (BENCHMARKED_TEMPLATE_IDS.has(id)) return 'benchmarked';
  if (ACTIVE_DEMO_TEMPLATE_IDS.has(id)) return 'active-demo';
  if (ACTIVE_ADAPTER_TEMPLATE_IDS.has(id)) return 'active-adapter';
  return 'template-only';
}

function writeReport(outFile, report) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
}

function countBy(items) {
  return items.reduce((out, item) => {
    out[item] = (out[item] || 0) + 1;
    return out;
  }, {});
}

function usage() {
  return [
    'Usage: node scripts/oracle-coverage-report.mjs --out benchmarks/<file>.json',
    '',
    'Writes a template-to-evidence coverage report for yieldOS oracle claims.',
  ].join('\n');
}

async function main() {
  try {
    const args = parseArgs();
    if (args.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const outFile = args.outFile || path.join(REPO_ROOT, 'benchmarks', `oracle-coverage-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    const report = buildCoverageReport();
    writeReport(outFile, report);
    process.stdout.write(`${JSON.stringify({ outFile, summary: report.summary }, null, 2)}\n`);
  } catch (err) {
    process.stderr.write(`oracle-coverage-report: ${err.message}\n`);
    process.exit(2);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

export {
  buildCoverageReport,
  coverageStatus,
  parseArgs,
};
