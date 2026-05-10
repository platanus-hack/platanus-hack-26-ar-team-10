'use strict';

const { pass, fail, unknown } = require('../result');

function fromDecision(candidate, decision) {
  const subject = {
    type: 'dependency',
    ref: candidate ? `${candidate.manager || 'unknown'}:${candidate.name || 'unknown'}@${candidate.version || 'unspecified'}` : 'unknown',
  };
  if (!decision || typeof decision.action !== 'string') {
    return unknown({
      id: 'dependency-policy',
      kind: 'policy',
      subject,
      scope: { checked: [], not_checked: ['canonical dependency decision'] },
      summary: 'Dependency policy decision was unavailable or incomplete.',
      blocking_reason: 'dependency-policy-unavailable',
    });
  }

  const input = {
    id: 'dependency-policy',
    kind: 'policy',
    subject,
    scope: { checked: ['canonical decision.action'], not_checked: ['full transitive dependency behavior'] },
    evidence: [
      { type: 'action', value: decision.action },
      { type: 'verdict', value: decision.verdict || '' },
      { type: 'message', value: decision.message || '' },
    ],
  };

  if (decision.action === 'block') {
    return fail({
      ...input,
      summary: 'Dependency policy blocked this candidate.',
      blocking_reason: decision.verdict || 'dependency-policy-block',
    });
  }
  if (decision.action === 'allow' || decision.action === 'block-and-rewrite') {
    return pass({
      ...input,
      summary: decision.action === 'block-and-rewrite'
        ? 'Dependency policy accepted this candidate through a local rewrite path.'
        : 'Dependency policy allowed this candidate.',
    });
  }
  if (decision.action === 'block-with-suggestion') {
    return fail({
      ...input,
      summary: 'Dependency policy requires a safer native equivalent before continuing.',
      blocking_reason: decision.verdict || 'native-equivalent-required',
    });
  }
  return unknown({
    ...input,
    summary: `Dependency policy returned an unmapped action: ${decision.action}.`,
    blocking_reason: 'dependency-policy-unmapped-action',
  });
}

module.exports = { fromDecision };
