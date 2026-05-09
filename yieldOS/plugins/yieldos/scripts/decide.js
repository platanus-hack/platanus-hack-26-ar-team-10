'use strict';

const https = require('node:https');

const lookup = require('./policy-lookup');
const rewriter = require('./rewriter');
const analyzers = require('./analyzers');

const VERDICT = {
  ALLOW_NATIVE: 'native-suggest',
  ALLOW_ALLOWLIST: 'allowlist-match',
  BLOCK_DENYLIST: 'denylist-match',
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
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

async function versionExistsOnRegistry(candidate) {
  // Returns true if version exists, false if confirmed missing, null if check unknown.
  try {
    if (['npm', 'pnpm', 'yarn', 'bun'].includes(candidate.manager)) {
      const encoded = candidate.name.startsWith('@')
        ? `@${encodeURIComponent(candidate.name.slice(1))}`
        : encodeURIComponent(candidate.name);
      const status = await headRequest(`https://registry.npmjs.org/${encoded}/${encodeURIComponent(candidate.version)}`);
      if (status === 200) return true;
      if (status === 404) return false;
      return null;
    }
    if (['pip', 'poetry', 'uv'].includes(candidate.manager)) {
      const status = await headRequest(`https://pypi.org/pypi/${encodeURIComponent(candidate.name)}/${encodeURIComponent(candidate.version)}/json`);
      if (status === 200) return true;
      if (status === 404) return false;
      return null;
    }
  } catch (_) { /* ignore */ }
  return null;
}

async function decide(candidate, policy, opts = {}) {
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
    // Name-only allowlist match with a pinned version: validate the version actually
    // exists in the registry before allowing. This catches fake versions like
    // 999.999.999 of an otherwise trusted package.
    const noVersion = !candidate.version || candidate.version === 'latest' || candidate.version === 'unspecified';
    const isNameOnly = lookup.matchedByNameOnly(candidate, policy['allowlist.json']);
    if (isNameOnly && !noVersion) {
      const exists = await versionExistsOnRegistry(candidate);
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
      message: `🛡  Validado por yieldOS (allowlist)`,
      meta: {},
    };
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
        message: `🛡  Validado por yieldOS (build script aprobado)`,
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
      message: `🛡  Validado por yieldOS (con advertencias — ver log)`,
      meta: analysis,
    };
  }

  return {
    verdict: VERDICT.ALLOW_VERIFIED,
    action: 'allow',
    message: `🛡  Validado por yieldOS (análisis OK)`,
    meta: analysis,
  };
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

module.exports = { decide, VERDICT };
