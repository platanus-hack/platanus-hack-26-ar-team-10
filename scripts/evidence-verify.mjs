#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAW_LOG_KEYS = new Set([
  'full_output',
  'output_text',
  'raw_log',
  'raw_logs',
  'raw_output',
  'raw_stderr',
  'raw_stdout',
  'stderr',
  'stdout',
]);

function sourceCommit(report) {
  return report.source_commit
    || report.benchmark_runner?.source?.commit
    || report.benchmark?.source_commit
    || null;
}

function checkoutDirty(report) {
  return report.checkout_dirty === true
    || report.benchmark_runner?.source?.dirty === true
    || report.benchmark_runner?.dirty === true;
}

function deterministicCommand(report) {
  if (typeof report.deterministic_command === 'string' && report.deterministic_command.trim()) {
    return report.deterministic_command;
  }
  if (typeof report.reproduction_command === 'string' && report.reproduction_command.trim()) {
    return report.reproduction_command;
  }
  if (typeof report.command === 'string' && report.command.trim()) {
    return report.command;
  }
  if (typeof report.benchmark_runner?.command === 'string' && report.benchmark_runner.command.trim()) {
    return report.benchmark_runner.command;
  }
  if (Array.isArray(report.commands) && report.commands.some((command) => typeof command === 'string' && command.trim())) {
    return report.commands.find((command) => typeof command === 'string' && command.trim());
  }
  return null;
}

function reportFlagState(report, key) {
  const values = [
    report[key],
    report.benchmark_runner?.[key],
    report.benchmark?.[key],
  ].filter((value) => value !== undefined);
  if (values.includes(true)) return 'included';
  if (values.includes(false)) return 'excluded';
  return 'missing';
}

function containsLocalAbsolutePath(text) {
  return /(?:\/Users\/|\/home\/|\/tmp\/|\/private\/tmp\/|\/var\/folders\/|[A-Za-z]:\\)/.test(text);
}

function containsRawLogPayload(value) {
  if (Array.isArray(value)) return value.some((entry) => containsRawLogPayload(entry));
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => {
    const normalizedKey = key.toLowerCase();
    if (RAW_LOG_KEYS.has(normalizedKey) && typeof child === 'string' && child.length > 0) return true;
    return containsRawLogPayload(child);
  });
}

function repositoriesPinned(report) {
  if (!Array.isArray(report.repositories)) return true;
  return report.repositories.every((repo) => {
    const source = repo.source || repo;
    return typeof source.git_url === 'string'
      && source.git_url.length > 0
      && /^[a-f0-9]{40}$/.test(source.commit || '');
  });
}

async function classifyEvidenceFile(filePath) {
  const text = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(text);
  const name = path.basename(filePath);

  if (name.includes('local-review') || parsed.measurement_type === 'local-review') {
    return classification(filePath, false, 'local-review evidence is internal only');
  }
  if (checkoutDirty(parsed)) {
    return classification(filePath, false, 'dirty checkout evidence is internal only');
  }
  if (parsed.measurement_type !== 'measured') {
    return classification(filePath, false, 'evidence is not measured');
  }
  if (!/^[a-f0-9]{40}$/.test(sourceCommit(parsed) || '')) {
    return classification(filePath, false, 'missing source commit');
  }
  const rawLogState = reportFlagState(parsed, 'raw_logs_included');
  if (rawLogState === 'included' || containsRawLogPayload(parsed)) {
    return classification(filePath, false, 'raw logs included');
  }
  if (rawLogState === 'missing') {
    return classification(filePath, false, 'raw log boundary missing');
  }
  const localPathState = reportFlagState(parsed, 'local_paths_included');
  if (localPathState === 'included' || containsLocalAbsolutePath(text)) {
    return classification(filePath, false, 'local absolute paths included');
  }
  if (localPathState === 'missing') {
    return classification(filePath, false, 'local path boundary missing');
  }
  if (!deterministicCommand(parsed)) {
    return classification(filePath, false, 'missing deterministic command');
  }
  if (!repositoriesPinned(parsed)) {
    return classification(filePath, false, 'repository evidence is not pinned');
  }
  return classification(filePath, true, 'measured clean evidence');
}

function classification(filePath, publicProof, reason) {
  return {
    file_path: filePath,
    public_proof: publicProof,
    reason,
  };
}

async function classifyEvidenceFiles(files) {
  const results = [];
  for (const file of files) {
    results.push(await classifyEvidenceFile(file));
  }
  return results;
}

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    throw new Error('usage: node scripts/evidence-verify.mjs <report.json>...');
  }
  const results = await classifyEvidenceFiles(files);
  for (const result of results) {
    const label = result.public_proof ? 'PUBLIC' : 'INTERNAL';
    process.stdout.write(`${label} ${result.file_path} - ${result.reason}\n`);
  }
  if (results.some((result) => !result.public_proof)) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}

export {
  classifyEvidenceFile,
  classifyEvidenceFiles,
  containsLocalAbsolutePath,
  containsRawLogPayload,
  checkoutDirty,
  deterministicCommand,
  repositoriesPinned,
  sourceCommit,
};
