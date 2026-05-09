'use strict';

function shannonEntropy(s) {
  if (!s || s.length === 0) return 0;
  const counts = new Map();
  for (const ch of s) counts.set(ch, (counts.get(ch) || 0) + 1);
  let entropy = 0;
  for (const c of counts.values()) {
    const p = c / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function detectObfuscation(code, opts = {}) {
  if (typeof code !== 'string' || code.length === 0) {
    return { suspicious: false, reasons: [], metrics: {} };
  }
  const reasons = [];

  const lines = code.split(/\r?\n/);
  const longLines = lines.filter((l) => l.length > 500).length;
  const longLineRatio = longLines / Math.max(1, lines.length);

  const shortIdMatches = code.match(/\b[a-zA-Z_$][a-zA-Z0-9_$]{0,1}\b/g) || [];
  const totalIds = code.match(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g) || [];
  const shortIdRatio = totalIds.length === 0 ? 0 : shortIdMatches.length / totalIds.length;

  const hexStrings = code.match(/0x[0-9a-fA-F]{8,}/g) || [];
  const longBase64 = code.match(/['"`][A-Za-z0-9+/]{200,}={0,2}['"`]/g) || [];

  const unicodeEscapes = code.match(/\\u\{?[0-9a-fA-F]{4,6}\}?/g) || [];

  const evalConcat = /eval\s*\(\s*(?:['"`]|\w+\s*\+)/.test(code);

  const entropy = shannonEntropy(code.slice(0, Math.min(code.length, 5000)));

  if (longLineRatio > 0.2 && lines.length > 10) {
    reasons.push(`long-lines-ratio=${longLineRatio.toFixed(2)}`);
  }
  if (shortIdRatio > 0.6 && totalIds.length > 100) {
    reasons.push(`short-identifiers-ratio=${shortIdRatio.toFixed(2)}`);
  }
  if (hexStrings.length > 30) {
    reasons.push(`hex-string-count=${hexStrings.length}`);
  }
  if (longBase64.length > 0) {
    reasons.push(`long-base64-strings=${longBase64.length}`);
  }
  if (unicodeEscapes.length > 50) {
    reasons.push(`unicode-escape-count=${unicodeEscapes.length}`);
  }
  if (evalConcat) {
    reasons.push('eval-with-concatenation');
  }
  if (entropy > 5.5 && code.length > 2000) {
    reasons.push(`high-entropy=${entropy.toFixed(2)}`);
  }

  const suspicious = reasons.length >= 2 || /eval\s*\(\s*atob\s*\(/.test(code);
  return {
    suspicious,
    reasons,
    metrics: { longLineRatio, shortIdRatio, hexCount: hexStrings.length, base64Count: longBase64.length, unicodeCount: unicodeEscapes.length, entropy },
  };
}

function tierForObfuscation(result) {
  if (!result || !result.suspicious) return 'clean';
  return 'tier1';
}

module.exports = { detectObfuscation, shannonEntropy, tierForObfuscation };
