'use strict';

const { sanitize } = require('../logger');

const DEFAULT_STRING_CAP = 2 * 1024;

function redactValue(value, options = {}) {
  const cap = options.stringCap || DEFAULT_STRING_CAP;
  if (typeof value === 'string') return capString(sanitize(value), cap);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, options));
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).reduce((out, key) => {
    out[key] = redactValue(value[key], options);
    return out;
  }, {});
}

function capString(value, cap) {
  if (Buffer.byteLength(value, 'utf8') <= cap) return value;
  const marker = '\n[truncated by yieldOS oracle artifact cap]';
  const markerBytes = Buffer.byteLength(marker, 'utf8');
  if (markerBytes >= cap) return marker.slice(0, cap);
  const bodyLimit = cap - markerBytes;
  let out = '';
  for (const char of value) {
    if (Buffer.byteLength(`${out}${char}`, 'utf8') > bodyLimit) break;
    out += char;
  }
  return `${out}${marker}`;
}

module.exports = {
  DEFAULT_STRING_CAP,
  redactValue,
};
