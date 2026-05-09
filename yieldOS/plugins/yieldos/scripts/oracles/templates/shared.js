'use strict';

const COMMON_EVIDENCE = [
  'source file and exact changed line',
  'attacker-controlled input or untrusted source',
  'security-sensitive sink or protected action',
  'concrete exploit path and impact',
];

const COMMON_METRICS = [
  'detection_latency_ms',
  'result_status_accuracy',
  'false_positive_control_pass_rate',
  'evidence_bytes',
];

function template(input) {
  return {
    id: input.id,
    title: input.title,
    severity: input.severity || 'high',
    kind: input.kind || 'static-diff',
    summary: input.summary,
    standards: input.standards,
    signals: input.signals || [],
    evidence: {
      required: [...COMMON_EVIDENCE, ...(input.evidence || [])],
      optional: input.optionalEvidence || [],
    },
    acceptance: {
      pass: input.pass,
      fail: input.fail,
      unknown: input.unknown || [
        'source binding is missing',
        'the oracle cannot prove attacker input reaches the sink',
      ],
    },
    negativeControls: input.negativeControls,
    benchmark: {
      fixtures: input.fixtures,
      metrics: [...COMMON_METRICS, ...(input.metrics || [])],
    },
    fixPatterns: input.fixPatterns || [],
    limits: input.limits || ['Template evidence is scoped to the changed code and does not prove whole-repo safety.'],
  };
}

function standard(family, id, url) {
  return { family, id, url };
}

module.exports = { template, standard };
