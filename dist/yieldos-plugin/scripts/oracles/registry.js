'use strict';

const ORACLES = [
  { id: 'code-audit-state', kind: 'evidence', maturity: 'active-adapter', description: 'Verifies committed code-audit state for the current diff.' },
  { id: 'agent-pack-lock', kind: 'policy', maturity: 'active-adapter', description: 'Verifies generated agent-pack files against yield.agent-pack.lock.json.' },
  { id: 'instruction-policy', kind: 'policy', maturity: 'active-adapter', description: 'Scans instruction files for policy-downgrade and prompt-injection patterns.' },
  { id: 'dependency-policy', kind: 'policy', maturity: 'internal-adapter', public: false, packAllowed: false, description: 'Maps dependency gate decisions into pass/fail/unknown evidence.' },
  { id: 'project-tests', kind: 'test', maturity: 'active-adapter', description: 'Runs detected project checks in commit/push/manual oracle contexts.' },
  { id: 'cdsc-replay', kind: 'counterexample', maturity: 'active-demo', description: 'Replays scoped counterexamples for supported security contracts.' },
  { id: 'cdsc-proof', kind: 'counterexample', maturity: 'active-demo', description: 'Requires baseline fail plus fixed pass for supported CDSC contracts.' },
];

function listOracles() {
  return ORACLES.filter((oracle) => oracle.public !== false).map((oracle) => ({ ...oracle }));
}

function getOracle(id) {
  return ORACLES.find((oracle) => oracle.id === id) || null;
}

function knownOracleIds() {
  return new Set(ORACLES.filter((oracle) => oracle.public !== false && oracle.packAllowed !== false).map((oracle) => oracle.id));
}

module.exports = {
  ORACLES,
  listOracles,
  getOracle,
  knownOracleIds,
};
