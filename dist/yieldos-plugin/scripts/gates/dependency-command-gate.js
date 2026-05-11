'use strict';

const path = require('node:path');

const logger = require('../logger');
const ui = require('../ui');

const DEFAULTS = require(path.join(__dirname, '..', '..', 'config', 'defaults.json'));

function getDecide() {
  return require('../decide').decide;
}

async function processCandidates(candidates, projectRoot, policy, options = {}) {
  let anyBlocked = false;
  const interventions = [];
  const decide = getDecide();

  for (const candidate of candidates) {
    const decision = await decide(candidate, policy, {
      thresholds: DEFAULTS.thresholds,
      minAgeDays: DEFAULTS.audit.transitive_min_age_days,
      osv: true,
      ttlSeconds: DEFAULTS.audit.osv_cache_ttl_seconds,
      runtimeConfig: options.runtimeConfig,
    });

    interventions.push({ candidate, decision });

    switch (decision.action) {
      case 'allow':
        if (decision.verdict === 'allowlist-match') logger.logAllowed(projectRoot, candidate);
        else logger.logVerified(projectRoot, candidate, decision.meta?.findings || []);
        if (options.runtimeConfig?.ui?.verbosity === 'verbose') {
          ui.writeDecision(decision);
        }
        break;

      case 'block-with-suggestion':
      case 'block':
        logger.logBlocked(projectRoot, candidate, decision.verdict, { findings: decision.meta?.findings });
        ui.writeDecision({ ...decision, message: decision.message || 'blocked' });
        anyBlocked = true;
        break;

      case 'block-and-rewrite': {
        const sourceUrl = decision.meta?.metadata?.repository?.url || decision.meta?.metadata?.homepage || null;
        const rewriter = require('../rewriter');
        try {
          const scaffold = rewriter.writeScaffold(projectRoot, candidate, sourceUrl);
          rewriter.updateRewriteIndex(projectRoot, candidate, sourceUrl, [scaffold.indexPath], scaffold.contentHash);
          logger.logRewritten(projectRoot, candidate, {
            justification: decision.meta?.reason || 'category A',
            files: [scaffold.indexPath],
            api: 'see scaffold; agent must populate via dependency-gate skill',
            marker: scaffold.indexPath,
          });
          ui.writeDecision(decision);
          process.stderr.write(`${ui.formatRewriteTarget(scaffold.dir)}\n`);
        } catch (err) {
          ui.writeMessage(`error generating rewrite scaffold: ${err.message}`);
        }
        anyBlocked = true;
        break;
      }

      case 'review':
        logger.appendEntry(projectRoot, 'Review Required', {
          Type: candidate.type,
          Name: candidate.name,
          Version: candidate.version,
          Source: candidate.source,
          'Requested by': candidate.requested_by || 'agent',
          Command: candidate.command,
          Verdict: decision.verdict,
          Reason: decision.message,
          Mode: options.runtimeConfig?.mode || 'standard',
        });
        ui.writeDecision({ ...decision, message: decision.message || 'review required' });
        break;
    }
  }
  return { anyBlocked, interventions };
}

module.exports = { processCandidates };
