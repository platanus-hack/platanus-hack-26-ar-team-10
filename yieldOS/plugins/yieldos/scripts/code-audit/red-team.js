'use strict';

const {
  hasExploitEvidence,
  parseAddedLines,
  parseChangedLines,
  stripQuotedStrings,
  stripRegexLiterals,
} = require('./rules/shared');
const {
  docsExampleSecret,
  hardcodedSecret,
  sensitiveLogging,
} = require('./rules/secrets');
const {
  hasRouteAuthGuard,
  missingAuthz,
  removedValidation,
} = require('./rules/authz');
const {
  openRedirect,
  pathTraversal,
  shellInjection,
  sqlInjection,
  ssrf,
  unboundedBodyRead,
  unsafeErrorResponse,
  unsafeFileMutation,
} = require('./rules/egress');
const { dangerousInstructionEdit } = require('./rules/injection');

const FINDERS = [
  docsExampleSecret,
  sensitiveLogging,
  hardcodedSecret,
  missingAuthz,
  sqlInjection,
  shellInjection,
  pathTraversal,
  unsafeFileMutation,
  ssrf,
  openRedirect,
  unsafeErrorResponse,
  unboundedBodyRead,
  removedValidation,
  dangerousInstructionEdit,
];

function redTeam(input) {
  const lines = parseChangedLines(input.diff || '');
  const findings = [];
  for (const item of lines) {
    if (isAuditExemptFile(item.file)) {
      const finding = docsExampleSecret(item);
      if (finding && hasExploitEvidence(finding)) findings.push(finding);
      continue;
    }
    for (const finder of FINDERS) {
      const finding = finder(item, input, lines);
      if (finding && hasExploitEvidence(finding)) findings.push(finding);
    }
  }
  return findings;
}

function isAuditExemptFile(file) {
  const normalized = String(file || '').replace(/\\/g, '/');
  if (/(?:^|\/)(?:AGENTS|CLAUDE)\.md$/i.test(normalized) || /\.cursorrules$/i.test(normalized)) return false;
  if (normalized.startsWith('dist/yieldos-plugin/')) return true;
  return /(?:^|\/)(?:tests?|__tests__|fixtures?)\//.test(normalized)
    || /\.test\.[cm]?[jt]sx?$/.test(normalized)
    || /\.(?:md|mdx|txt)$/i.test(normalized);
}

module.exports = {
  redTeam,
  parseAddedLines,
  parseChangedLines,
  hasExploitEvidence,
  hasRouteAuthGuard,
  isAuditExemptFile,
  stripQuotedStrings,
  stripRegexLiterals,
};
