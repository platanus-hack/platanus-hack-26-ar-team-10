'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { hashObject } = require('../result');
const artifacts = require('../artifacts');

function groundMissingAuthFinding(projectRoot, finding, input = {}) {
  if (!finding || finding.ruleId !== 'missing-authz') {
    return { ok: false, reason: 'finding is not missing-authz' };
  }
  if (!finding.file || finding.file === 'unknown') return { ok: false, reason: 'finding file missing' };
  const file = safeProjectPath(projectRoot, finding.file);
  if (!fs.existsSync(file)) return { ok: false, reason: 'finding file not found' };
  const content = fs.readFileSync(file, 'utf8');
  const line = String(finding.line || '').trim();
  const matchedLine = content.split(/\r?\n/).find((candidate) => candidate.trim() === line);
  if (!matchedLine) return { ok: false, reason: 'finding line is not present in current file content' };
  const route = parseRoute(matchedLine);
  if (!route) return { ok: false, reason: 'route could not be parsed from current file content' };
  const source = finding.source || 'deterministic';
  if (!['deterministic', 'agent-grounded'].includes(source)) {
    return { ok: false, reason: 'finding source is not deterministic or agent-grounded' };
  }

  const fileHash = hashText(content);
  const id = `missing-authz-${shortHash(`${finding.file}:${route.method}:${route.path}`)}`;
  const contract = {
    version: '0.1',
    id,
    source: {
      rule_id: 'missing-authz',
      source,
      file: finding.file,
      file_hash: fileHash,
      diff_hash: input.diffHash || finding.diffHash || 'unknown',
      line,
    },
    subject: {
      type: 'http-route',
      method: route.method,
      path: route.path,
    },
    observable_must: 'Unauthenticated request must receive 401 or 403.',
    expect: {
      status: [401, 403],
    },
  };
  const replay = {
    version: '0.1',
    id,
    type: 'http',
    request: {
      method: route.method,
      path: route.path,
      headers: {},
    },
    expect: {
      status: [401, 403],
    },
  };

  return { ok: true, id, contract, replay };
}

function writeMissingAuthArtifacts(projectRoot, finding, input = {}) {
  const grounded = groundMissingAuthFinding(projectRoot, finding, input);
  if (!grounded.ok) return grounded;
  const written = artifacts.writeArtifactSet(projectRoot, {
    id: grounded.id,
    manifest: {
      version: '0.1',
      id: grounded.id,
      oracle: 'cdsc-replay',
      contract_hash: hashObject(grounded.contract),
      replay_hash: hashObject(grounded.replay),
      limits: ['This proves only this route and unauthenticated replay.'],
    },
    contract: grounded.contract,
    replay: grounded.replay,
  });
  return { ...grounded, artifactSet: written, artifacts: written.artifacts };
}

function attachCdscArtifacts(projectRoot, audit) {
  if (!audit || audit.mode !== 'commit') return audit;
  if (audit.action !== 'block') return audit;
  const findings = audit.findings || [];
  const target = findings.find((finding) => finding.ruleId === 'missing-authz' && finding.severity === 'high');
  if (!target) return audit;
  const grounded = writeMissingAuthArtifacts(projectRoot, target, { diffHash: audit.diffHash });
  if (!grounded.ok) {
    return {
      ...audit,
      oracleArtifacts: [],
      oracleUnknowns: [{
        id: 'missing-authz-cdsc',
        reason: grounded.reason,
      }],
    };
  }
  return {
    ...audit,
    oracleArtifacts: grounded.artifacts,
    oracleContracts: [{
      id: grounded.id,
      type: 'missing-authz',
      path: `security/oracles/${grounded.id}/contract.json`,
    }],
  };
}

function parseRoute(line) {
  const match = /\b(?:app|router)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/i.exec(line);
  if (!match) return null;
  return { method: match[1].toUpperCase(), path: match[2] };
}

function safeProjectPath(projectRoot, relativePath) {
  if (path.isAbsolute(relativePath)) throw new Error('finding file must stay inside the project');
  const root = path.resolve(projectRoot);
  const target = path.resolve(root, relativePath);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (target !== root && !target.startsWith(prefix)) throw new Error('finding file must stay inside the project');
  return target;
}

function hashText(text) {
  return hashObject({ text });
}

function shortHash(value) {
  return hashObject({ value }).slice('sha256:'.length, 'sha256:'.length + 12);
}

module.exports = {
  attachCdscArtifacts,
  groundMissingAuthFinding,
  writeMissingAuthArtifacts,
  parseRoute,
};
