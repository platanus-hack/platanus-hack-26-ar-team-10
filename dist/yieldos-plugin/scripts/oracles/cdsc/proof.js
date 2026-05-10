'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { pass, fail, unknown, hashObject } = require('../result');
const artifacts = require('../artifacts');
const replayRunner = require('./replay-runner');
const { parseRoute } = require('./missing-auth-contract');
const { hasRouteAuthGuard } = require('../../code-audit/red-team');

async function run(projectRoot, options = {}) {
  try {
    const contractPath = requireOption(options.contract, '--contract');
    const runtimePath = requireOption(options.runtime, '--runtime');
    const absoluteContract = replayRunner.resolveProjectPath(projectRoot, contractPath, { mustExist: true });
    const absoluteRuntime = replayRunner.resolveProjectPath(projectRoot, runtimePath, { mustExist: true });
    const contract = readJson(absoluteContract);
    const replay = readJson(path.join(path.dirname(absoluteContract), 'replay.json'));
    const runtime = readJson(absoluteRuntime);
    const sourceVerification = verifyContractSource(projectRoot, contract);
    const runtimeSourceBinding = verifyRuntimeSourceBinding(projectRoot, contract, runtime);

    const baseline = await replayRunner.runReplay(projectRoot, contract, replay, replayRunner.runtimeForMode(runtime, 'baseline'), options);
    const fixed = await replayRunner.runReplay(projectRoot, contract, replay, replayRunner.runtimeForMode(runtime, 'fixed'), options);
    const proofManifest = {
      version: '0.1',
      contract_hash: hashObject(contract),
      replay_hash: hashObject(replay),
      runtime_hash: hashObject(runtime),
      baseline: resultSummary(baseline),
      fixed: resultSummary(fixed),
      proof_status: proofStatus(baseline, fixed),
      source: sourceVerification,
      runtime_source_binding: runtimeSourceBinding,
      limits: ['This proves this route and replay only, not the whole repo.'],
    };
    const artifactSet = writeProofManifest(projectRoot, contract, proofManifest, baseline, fixed);

    if (baseline.status !== 'fail') {
      return unknown({
        id: 'cdsc-proof',
        kind: 'counterexample',
        subject: { type: 'http-route', ref: `${contract.subject.method} ${contract.subject.path}` },
        scope: { checked: ['baseline replay'], not_checked: ['fixed acceptance because baseline did not reproduce'] },
        evidence: proofEvidence(proofManifest, artifactSet),
        summary: 'CDSC proof could not reproduce the vulnerable baseline.',
        blocking_reason: 'cdsc-baseline-not-reproduced',
      });
    }

    if (fixed.status !== 'pass') {
      return fail({
        id: 'cdsc-proof',
        kind: 'counterexample',
        subject: { type: 'http-route', ref: `${contract.subject.method} ${contract.subject.path}` },
        scope: { checked: ['baseline replay', 'fixed replay'], not_checked: ['other routes or auth states'] },
        evidence: proofEvidence(proofManifest, artifactSet),
        summary: 'CDSC proof reproduced the baseline vulnerability but the fixed replay did not pass.',
        blocking_reason: 'cdsc-fixed-replay-failed',
      });
    }

    return pass({
      id: 'cdsc-proof',
      kind: 'counterexample',
      subject: { type: 'http-route', ref: `${contract.subject.method} ${contract.subject.path}` },
      scope: { checked: ['baseline fail', 'fixed pass', 'same replay contract'], not_checked: ['whole repo safety', 'other auth states'] },
      evidence: proofEvidence(proofManifest, artifactSet),
      summary: 'CDSC proof passed: baseline failed and fixed replay passed for this route.',
    });
  } catch (err) {
    return unknown({
      id: 'cdsc-proof',
      kind: 'counterexample',
      subject: { type: 'replay', ref: options.contract || 'unknown' },
      scope: { checked: [], not_checked: ['baseline fail and fixed pass proof'] },
      evidence: [{ type: 'error', value: err.message }],
      summary: `CDSC proof could not run: ${err.message}`,
      blocking_reason: 'cdsc-proof-runtime-error',
    });
  }
}

function proofStatus(baseline, fixed) {
  if (baseline.status !== 'fail') return 'unknown';
  if (fixed.status !== 'pass') return 'fail';
  return 'pass';
}

function resultSummary(result) {
  const observed = result.evidence?.find((item) => item.type === 'observed')?.value || null;
  return {
    status: result.status,
    observed,
    blocking_reason: result.blocking_reason || '',
  };
}

function writeProofManifest(projectRoot, contract, proofManifest, baseline, fixed) {
  return artifacts.writeArtifactSet(projectRoot, {
    id: contract.id,
    baselineResult: baseline,
    fixedResult: fixed,
    proofManifest,
  });
}

function proofEvidence(proofManifest, artifactSet) {
  return [
    { type: 'proof-manifest', value: proofManifest },
    { type: 'artifacts', value: artifactSet.artifacts },
  ];
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function verifyContractSource(projectRoot, contract) {
  const source = contract.source || {};
  const required = ['rule_id', 'file', 'file_hash', 'diff_hash', 'line'];
  const missing = required.filter((key) => !source[key]);
  if (missing.length > 0) {
    throw new Error(`cdsc contract missing source grounding: ${missing.join(', ')}`);
  }
  if (!['deterministic', 'agent-grounded'].includes(source.source || 'deterministic')) {
    throw new Error('cdsc contract source must be deterministic or agent-grounded');
  }
  const sourceFile = replayRunner.resolveProjectPath(projectRoot, contract.source.file, { mustExist: true });
  const content = fs.readFileSync(sourceFile, 'utf8');
  const currentHash = hashObject({ text: content });
  const sourceLine = String(source.line || '').trim();
  const sourceRoute = parseRoute(sourceLine);
  const expected = contract.subject || {};
  if (!sourceRoute || sourceRoute.method !== expected.method || sourceRoute.path !== expected.path) {
    throw new Error('cdsc contract source line route does not match the replay subject');
  }

  const lines = content.split(/\r?\n/).map((line) => line.trim());
  const exactLinePresent = lines.includes(sourceLine);
  const currentRouteLine = lines.find((line) => {
    const route = parseRoute(line);
    return route && route.method === expected.method && route.path === expected.path;
  });

  if (currentHash === source.file_hash && !exactLinePresent) {
    throw new Error('cdsc contract source line is not present in the grounded file');
  }
  if (currentHash !== source.file_hash && (!currentRouteLine || !hasRouteAuthGuard(currentRouteLine))) {
    throw new Error('cdsc contract source drift is not tied to an authenticated version of the same route');
  }

  return {
    file: source.file,
    rule_id: source.rule_id,
    diff_hash: source.diff_hash,
    contract_file_hash: source.file_hash,
    current_file_hash: currentHash,
    current_source_matches_contract: currentHash === source.file_hash,
    source_semantics: currentHash === source.file_hash ? 'original-line-present' : 'same-route-auth-guard-added',
  };
}

function verifyRuntimeSourceBinding(projectRoot, contract, runtime) {
  const fixedRuntime = replayRunner.runtimeForMode(runtime, 'fixed');
  const source = contract.source || {};
  const contractSourceFile = replayRunner.resolveProjectPath(projectRoot, source.file, { mustExist: true });
  const runtimeCwd = fixedRuntime.cwd
    ? replayRunner.resolveProjectPath(projectRoot, fixedRuntime.cwd, { mustExist: true, allowDirectory: true })
    : path.resolve(projectRoot);
  const sourceFile = requireOption(fixedRuntime.source_file, 'fixed runtime source_file');
  const entrypoint = Array.isArray(fixedRuntime.args) ? fixedRuntime.args[0] : null;
  if (!entrypoint) throw new Error('fixed runtime is not bound to a Node entrypoint');
  const runtimeSourceFile = replayRunner.resolveProjectPath(runtimeCwd, sourceFile, { mustExist: true });
  const runtimeEntrypoint = replayRunner.resolveProjectPath(runtimeCwd, entrypoint, { mustExist: true });

  if (runtimeSourceFile !== contractSourceFile || runtimeEntrypoint !== contractSourceFile) {
    throw new Error('fixed runtime is not bound to the grounded source file');
  }

  return {
    source_file: relativeProjectPath(projectRoot, runtimeSourceFile),
    entrypoint: relativeProjectPath(projectRoot, runtimeEntrypoint),
  };
}

function relativeProjectPath(projectRoot, target) {
  return path.relative(path.resolve(projectRoot), target).split(path.sep).join('/');
}

function requireOption(value, label) {
  if (!value) throw new Error(`${label} is required`);
  return value;
}

module.exports = {
  proofStatus,
  run,
  verifyContractSource,
  verifyRuntimeSourceBinding,
};
