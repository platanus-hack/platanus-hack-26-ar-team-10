'use strict';

const https = require('node:https');

const lookup = require('./policy-lookup');
const rewriter = require('./rewriter');
const analyzers = require('./analyzers');

const VERDICT = {
  ALLOW_NATIVE: 'native-suggest',
  ALLOW_ALLOWLIST: 'allowlist-match',
  BLOCK_DENYLIST: 'denylist-match',
  ALLOW_SKILL: 'skill-approved',
  BLOCK_SKILL: 'skill-blocked',
  ALLOW_MCP: 'mcp-approved',
  BLOCK_MCP: 'mcp-blocked',
  BLOCK_CATEGORY_D: 'category-d-blocked',
  REWRITE_CATEGORY_A: 'category-a-rewrite',
  ALLOW_VERIFIED: 'verification-passed',
  BLOCK_VERIFICATION: 'verification-failed',
  BLOCK_BUILD_SCRIPT: 'build-script-not-approved',
};

function headRequest(url, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'HEAD', timeout: timeoutMs }, (res) => {
      resolve(res.statusCode);
      res.resume();
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

function hasConcreteRegistryVersion(candidate) {
  const version = candidate.version;
  if (!version || version === 'latest' || version === 'unspecified') return false;
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(candidate.manager)) {
    return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version);
  }
  if (['pip', 'poetry', 'uv'].includes(candidate.manager)) {
    return /^[0-9][A-Za-z0-9_.!+-]*$/.test(version) && !/[<>=~,]/.test(version);
  }
  return false;
}

async function versionExistsOnRegistry(candidate, timeoutMs = 4000) {
  if (!hasConcreteRegistryVersion(candidate)) return null;

  if (['npm', 'pnpm', 'yarn', 'bun'].includes(candidate.manager)) {
    const encodedName = candidate.name.startsWith('@')
      ? `@${encodeURIComponent(candidate.name.slice(1))}`
      : encodeURIComponent(candidate.name);
    const status = await headRequest(`https://registry.npmjs.org/${encodedName}/${encodeURIComponent(candidate.version)}`, timeoutMs);
    if (status === 200) return true;
    if (status === 404) return false;
    return null;
  }

  if (['pip', 'poetry', 'uv'].includes(candidate.manager)) {
    const status = await headRequest(`https://pypi.org/pypi/${encodeURIComponent(candidate.name)}/${encodeURIComponent(candidate.version)}/json`, timeoutMs);
    if (status === 200) return true;
    if (status === 404) return false;
    return null;
  }

  return null;
}

async function decide(candidate, policy, opts = {}) {
  if (candidate.type === 'skill' || candidate.manager === 'skills') {
    return decideSkill(candidate, policy['skills.json']);
  }

  if (candidate.type === 'mcp' || candidate.manager === 'mcp') {
    return decideMcp(candidate, policy['mcps.json']);
  }

  const denyEntry = lookup.isDenylisted(candidate, policy['denylist.json']);
  if (denyEntry) {
    return {
      verdict: VERDICT.BLOCK_DENYLIST,
      action: 'block',
      message: `yieldOS bloqueó ${candidate.name}: ${denyEntry.reason || 'denylist match'}`,
      meta: { denyEntry },
    };
  }

  const native = lookup.nativeEquivalent(candidate, policy['native-equivalents.json']);
  if (native) {
    return {
      verdict: VERDICT.ALLOW_NATIVE,
      action: 'block-with-suggestion',
      message: `yieldOS sustituyó ${candidate.name} por API nativa: ${native.native}`,
      meta: { native },
    };
  }

  if (lookup.isAllowlisted(candidate, policy['allowlist.json'])) {
    if (lookup.matchedByNameOnly(candidate, policy['allowlist.json']) && hasConcreteRegistryVersion(candidate)) {
      const exists = typeof opts.versionExists === 'function'
        ? await opts.versionExists(candidate)
        : await versionExistsOnRegistry(candidate, opts.registryTimeoutMs || 4000);
      if (exists === false) {
        return {
          verdict: VERDICT.BLOCK_VERIFICATION,
          action: 'block',
          message: `yieldOS bloqueó ${candidate.name}@${candidate.version}: la versión no existe en el registry`,
          meta: { reason: 'fake-version', candidate },
        };
      }
    }

    return {
      verdict: VERDICT.ALLOW_ALLOWLIST,
      action: 'allow',
      message: '🛡  Validado por yieldOS (allowlist)',
      meta: {},
    };
  }

  if (candidate.type === 'binary' || candidate.type === 'vendored-code' || candidate.exotic === true) {
    return {
      verdict: VERDICT.BLOCK_VERIFICATION,
      action: 'block',
      message: `yieldOS bloqueó ${candidate.name}: instalación de tipo ${candidate.type} no permitida sin allowlist explícita`,
      meta: { reason: 'untrusted-source', type: candidate.type, manager: candidate.manager },
    };
  }

  const categories = policy['categories.json'] || {};
  if (rewriter.isInCategoryD({ ...candidate }, categories)) {
    return {
      verdict: VERDICT.BLOCK_CATEGORY_D,
      action: 'block',
      message: `yieldOS bloqueó ${candidate.name}: categoría crítica, requiere aprobación del equipo de seguridad`,
      meta: { categoryD: true },
    };
  }

  let metadata = null;
  try { metadata = (await rewriter.describePackage(candidate)).metadata; }
  catch (_) { metadata = null; }

  const thresholds = opts.thresholds || {};
  const evalOutcome = rewriter.evaluate({ ...candidate }, normalizeMetadataForEval(metadata, candidate), { categories }, thresholds);

  if (evalOutcome.decision === 'block-category-d') {
    return {
      verdict: VERDICT.BLOCK_CATEGORY_D,
      action: 'block',
      message: `yieldOS bloqueó ${candidate.name}: categoría crítica, requiere aprobación del equipo de seguridad`,
      meta: evalOutcome,
    };
  }

  if (evalOutcome.decision === 'rewrite-category-a' || evalOutcome.decision === 'rewrite-by-threshold') {
    return {
      verdict: VERDICT.REWRITE_CATEGORY_A,
      action: 'block-and-rewrite',
      message: `yieldOS realizó una optimización de la instalación de ${candidate.name}`,
      meta: { ...evalOutcome, metadata },
    };
  }

  const analysis = await analyzers.analyzePackage(candidate, opts);

  if (analysis.tier === 'tier1') {
    return {
      verdict: VERDICT.BLOCK_VERIFICATION,
      action: 'block',
      message: `yieldOS detectó señales sospechosas en ${candidate.name} y bloqueó la instalación`,
      meta: analysis,
    };
  }

  if (analysis.tier === 'tier2') {
    if (lookup.isBuildScriptApproved(candidate, policy['build-scripts-allowed.json'])) {
      return {
        verdict: VERDICT.ALLOW_VERIFIED,
        action: 'allow',
        message: '🛡  Validado por yieldOS (build script aprobado)',
        meta: { ...analysis, build_script_approved: true },
      };
    }
    return {
      verdict: VERDICT.BLOCK_BUILD_SCRIPT,
      action: 'block',
      message: `yieldOS bloqueó ${candidate.name}: requiere aprobación de build scripts`,
      meta: analysis,
    };
  }

  if (analysis.tier === 'tier3') {
    return {
      verdict: VERDICT.ALLOW_VERIFIED,
      action: 'allow',
      message: '🛡  Validado por yieldOS (con advertencias; ver log)',
      meta: analysis,
    };
  }

  return {
    verdict: VERDICT.ALLOW_VERIFIED,
    action: 'allow',
    message: '🛡  Validado por yieldOS (análisis OK)',
    meta: analysis,
  };
}

function decideSkill(candidate, skillPolicy = {}) {
  const entry = findSkillEntry(candidate, skillPolicy);
  if (!entry) {
    return {
      verdict: VERDICT.BLOCK_SKILL,
      action: 'block',
      message: `yieldOS bloqueó ${candidate.name}: skill no aprobada en policy/skills.json`,
      meta: { reason: 'skill-unlisted' },
    };
  }

  return {
    verdict: VERDICT.ALLOW_SKILL,
    action: 'allow',
    message: `yieldOS aprobó ${candidate.name}: skill listada en policy/skills.json`,
    meta: {
      category: entry.category || 'unknown',
      vendor: entry.vendor || 'unknown',
    },
  };
}

function findSkillEntry(candidate, skillPolicy = {}) {
  if (!skillPolicy || !Array.isArray(skillPolicy.entries)) return null;
  const key = candidate.name && candidate.name.startsWith('skill:')
    ? candidate.name
    : `skill:${candidate.name}`;
  return skillPolicy.entries.find((entry) => entry.key === key || entry.key?.startsWith(`${key}@`)) || null;
}

function decideMcp(candidate, mcpPolicy = {}) {
  const entry = findMcpEntry(candidate, mcpPolicy);
  if (!entry) {
    return {
      verdict: VERDICT.BLOCK_MCP,
      action: 'block',
      message: `yieldOS bloqueó ${candidate.name}: MCP no aprobado en policy/mcps.json`,
      meta: { reason: 'mcp-unlisted' },
    };
  }

  if (entry.scope === 'blocked-by-default') {
    return {
      verdict: VERDICT.BLOCK_MCP,
      action: 'block',
      message: `yieldOS bloqueó ${candidate.name}: MCP bloqueado por policy/mcps.json`,
      meta: { reason: 'mcp-blocked-by-default', scope: entry.scope },
    };
  }

  if (!entry.allow_direct_add) {
    return {
      verdict: VERDICT.BLOCK_MCP,
      action: 'block',
      message: `yieldOS bloqueó ${candidate.name}: MCP requiere validación de fuente y tool surface vía yieldos-pack`,
      meta: {
        reason: 'mcp-direct-add-requires-tool-surface-verification',
        scope: entry.scope || 'unknown',
      },
    };
  }

  return {
    verdict: VERDICT.ALLOW_MCP,
    action: 'allow',
    message: `yieldOS aprobó ${candidate.name}: MCP listado en policy/mcps.json`,
    meta: {
      approved_tools: entry.approved_tools || [],
      scope: entry.scope || 'unknown',
    },
  };
}

function findMcpEntry(candidate, mcpPolicy = {}) {
  if (!mcpPolicy || !Array.isArray(mcpPolicy.entries)) return null;
  const key = candidate.name && candidate.name.startsWith('mcp:')
    ? candidate.name
    : `mcp:${candidate.name}`;
  return mcpPolicy.entries.find((entry) => entry.key === key) || null;
}

function normalizeMetadataForEval(metadata, candidate) {
  if (!metadata) return null;
  if (metadata.versions && candidate.version && candidate.version !== 'latest') {
    return metadata.versions[candidate.version] || metadata;
  }
  if (metadata.versions && metadata['dist-tags'] && metadata['dist-tags'].latest) {
    return metadata.versions[metadata['dist-tags'].latest];
  }
  return metadata;
}

module.exports = { decide, VERDICT, hasConcreteRegistryVersion, versionExistsOnRegistry, decideSkill, decideMcp };
