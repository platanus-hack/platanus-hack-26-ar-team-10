'use strict';

function scan(text, patterns) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const findings = [];
  for (const p of patterns || []) {
    let regex;
    try {
      const m = String(p.regex).match(/^\(\?([imsux]+)\)(.*)$/);
      if (m) {
        regex = new RegExp(m[2], m[1].replace('s', ''));
      } else {
        regex = new RegExp(p.regex);
      }
    } catch (_) { continue; }
    const matches = text.match(regex);
    if (matches && matches.length > 0) {
      findings.push({
        id: p.id,
        severity: p.severity || 'high',
        sample: matches[0].slice(0, 200),
      });
    }
  }
  return findings;
}

function tierFromInjectionFindings(findings) {
  if (!findings || findings.length === 0) return 'clean';
  if (findings.some((f) => f.severity === 'critical')) return 'tier1';
  if (findings.some((f) => f.severity === 'high')) return 'tier2';
  return 'tier3';
}

module.exports = { scan, tierFromInjectionFindings };
