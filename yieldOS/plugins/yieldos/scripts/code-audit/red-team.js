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
  failOpenWebhookSignature,
  hardcodedSecret,
  sensitiveLogging,
  weakSecretDefault,
} = require('./rules/secrets');
const {
  agentCallbackWithoutAuth,
  hasRouteAuthGuard,
  missingAuthz,
  publicSecurityDefiner,
  removedValidation,
  unauthenticatedAgentRuntimeProxy,
  unauthenticatedBinaryObjectRoute,
  unauthenticatedServiceRouteMutation,
  unscopedBulkDelete,
} = require('./rules/authz');
const {
  cookieTokenExposure,
  electronRendererControlledFetch,
  electronSecurityMisconfiguration,
  generatedSqlToSensitiveSink,
  mobileDebugLoggingTree,
  openRedirect,
  pathTraversal,
  shellInjection,
  sqlInjection,
  ssrf,
  unboundedBodyRead,
  unboundedUploadFileRead,
  unsafeErrorResponse,
  unsafeFileMutation,
  unsafeHtmlSink,
} = require('./rules/egress');
const { dangerousInstructionEdit } = require('./rules/injection');

const FINDERS = [
  docsExampleSecret,
  sensitiveLogging,
  hardcodedSecret,
  weakSecretDefault,
  failOpenWebhookSignature,
  missingAuthz,
  unauthenticatedAgentRuntimeProxy,
  unauthenticatedBinaryObjectRoute,
  unauthenticatedServiceRouteMutation,
  unscopedBulkDelete,
  generatedSqlToSensitiveSink,
  sqlInjection,
  shellInjection,
  pathTraversal,
  unsafeFileMutation,
  ssrf,
  openRedirect,
  unsafeErrorResponse,
  unsafeHtmlSink,
  cookieTokenExposure,
  agentCallbackWithoutAuth,
  publicSecurityDefiner,
  electronSecurityMisconfiguration,
  electronRendererControlledFetch,
  mobileDebugLoggingTree,
  unboundedUploadFileRead,
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
