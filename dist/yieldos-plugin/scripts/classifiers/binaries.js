'use strict';

const PIPED_INSTALL = [
  /(?:^|\s)curl\s+[^|;]*\|\s*(?:sh|bash|zsh)\b/,
  /(?:^|\s)wget\s+[^|;]*\|\s*(?:sh|bash|zsh)\b/,
  /(?:^|\s)curl\s+[^|;]*\|\s*sudo\s+(?:sh|bash|zsh)\b/,
];

const URL_RE = /https?:\/\/[^\s|;]+/;

function extractUrl(cmd) {
  const m = cmd.match(URL_RE);
  return m ? m[0] : 'unknown';
}

function hostFrom(url) {
  try {
    return new URL(url).host;
  } catch (_) {
    return 'unknown';
  }
}

function match(cmd) {
  const out = [];
  for (const re of PIPED_INSTALL) {
    if (re.test(cmd)) {
      const url = extractUrl(cmd);
      out.push({
        type: 'binary',
        name: hostFrom(url),
        version: 'unknown',
        source: url,
        manager: 'curl-pipe-shell',
        exotic: true,
      });
      break;
    }
  }
  return out;
}

module.exports = { match };
