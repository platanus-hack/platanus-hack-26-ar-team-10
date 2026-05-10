'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { redactDocsExampleSecrets } = require('./doc-secrets');
const { restageFiles } = require('./git');

function blueTeam(projectRoot, findings) {
  const fixable = findings.filter((f) => f.fixStrategy === 'remove-line' || f.fixStrategy === 'replace-redirect-root' || f.fixStrategy === 'redact-doc-secret');

  for (const finding of fixable) {
    const file = finding.file;
    if (!file || file === 'unknown') continue;
    const absolute = path.join(projectRoot, file);
    if (!fs.existsSync(absolute)) continue;

    const before = fs.readFileSync(absolute, 'utf8');
    const after = applyLineFix(before, finding);
    if (after !== before) {
      fs.writeFileSync(absolute, after);
      restageFiles(projectRoot, [file]);
      return {
        fixed: true,
        files: [file],
        appliedFindings: [finding.ruleId],
      };
    }
  }

  return {
    fixed: false,
    files: [],
    appliedFindings: [],
  };
}

function applyLineFix(content, finding) {
  const lines = content.split(/\n/);
  const target = String(finding.line || '').trim();

  if (finding.fixStrategy === 'remove-line') {
    let removed = false;
    return lines.filter((line) => {
      if (!removed && line.trim() === target) {
        removed = true;
        return false;
      }
      return true;
    }).join('\n');
  }

  if (finding.fixStrategy === 'replace-redirect-root') {
    let replaced = false;
    return lines.map((line) => {
      if (replaced) return line;
      if (line.trim() !== target) return line;
      replaced = true;
      return line.replace(/res\.redirect\s*\([^)]*\)/, "res.redirect('/')");
    }).join('\n');
  }

  if (finding.fixStrategy === 'redact-doc-secret') {
    let replaced = false;
    return lines.map((line) => {
      if (replaced) return line;
      if (line.trim() !== target) return line;
      const redacted = redactDocsExampleSecrets(line);
      if (redacted === line) return line;
      replaced = true;
      return redacted;
    }).join('\n');
  }

  return content;
}

module.exports = { blueTeam, applyLineFix };
