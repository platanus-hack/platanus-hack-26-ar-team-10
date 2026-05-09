'use strict';

const KNOWN_BINARY_EXTS = new Set([
  '.node', '.so', '.dylib', '.dll', '.exe',
  '.wasm', '.a', '.lib', '.framework', '.bin',
]);

function isLikelyBinaryFilename(filename) {
  if (typeof filename !== 'string') return false;
  const lower = filename.toLowerCase();
  for (const ext of KNOWN_BINARY_EXTS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

function isLikelyBinaryContent(buffer) {
  if (!buffer || buffer.length === 0) return false;
  const sample = buffer.slice(0, Math.min(buffer.length, 4096));
  let nonText = 0;
  for (const b of sample) {
    if (b === 0) return true;
    if (b < 9 || (b > 13 && b < 32) || b === 127) nonText++;
  }
  return nonText / sample.length > 0.3;
}

function detectBinariesInFileList(fileList) {
  if (!Array.isArray(fileList)) return { binaries: [], suspicious: false };
  const binaries = fileList.filter((f) => isLikelyBinaryFilename(f));
  return { binaries, suspicious: binaries.length > 0 };
}

function tierForBinaries(result) {
  if (!result || !result.suspicious) return 'clean';
  return 'tier2';
}

module.exports = { isLikelyBinaryFilename, isLikelyBinaryContent, detectBinariesInFileList, tierForBinaries };
