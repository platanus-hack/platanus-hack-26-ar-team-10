'use strict';

function parseAddedLines(diff) {
  return parseChangedLines(diff).filter((item) => item.sign === '+');
}

function parseChangedLines(diff) {
  const out = [];
  let file = null;
  for (const raw of diff.split(/\r?\n/)) {
    if (raw.startsWith('+++ b/')) {
      file = raw.slice(6);
      continue;
    }
    if ((!raw.startsWith('+') && !raw.startsWith('-')) || raw.startsWith('+++') || raw.startsWith('---')) continue;
    out.push({ file, code: raw.slice(1), sign: raw[0], raw });
  }
  return out;
}

function hasExploitEvidence(finding) {
  return Boolean(
    finding.attackerControlledInput &&
    finding.vulnerableSink &&
    finding.exploitPath &&
    finding.impact
  );
}

function makeFinding(item, ruleId, severity, title, details) {
  return {
    ruleId,
    severity,
    title,
    file: item.file || 'unknown',
    line: item.code.trim(),
    ...details,
  };
}

function codeShape(code) {
  return stripRegexLiterals(stripQuotedStrings(String(code || '')));
}

function addedTextForFile(input, file) {
  return parseChangedLines(input?.diff || '')
    .filter((candidate) => candidate.file === file && candidate.sign === '+')
    .map((candidate) => candidate.code)
    .join('\n');
}

function isJavaScriptLikeFile(file) {
  return /\.(?:[cm]?[jt]sx?)$/i.test(String(file || ''));
}

function isPythonFile(file) {
  return /\.py$/i.test(String(file || ''));
}

function isRuntimeCodeFile(file) {
  return /\.(?:py|[cm]?[jt]sx?)$/i.test(String(file || ''));
}

function stripQuotedStrings(code) {
  return code.replace(/(['"])(?:\\.|(?!\1)[\s\S])*\1/g, '$1$1');
}

function stripRegexLiterals(code) {
  return code.replace(/(^|[=(:,\[{!&|?;]\s*|\breturn\s+)\/(?:\\.|[^/\\\n])+\/[dgimsuy]*/g, '$1//');
}

module.exports = {
  addedTextForFile,
  codeShape,
  hasExploitEvidence,
  isJavaScriptLikeFile,
  isPythonFile,
  isRuntimeCodeFile,
  makeFinding,
  parseAddedLines,
  parseChangedLines,
  stripQuotedStrings,
  stripRegexLiterals,
};
