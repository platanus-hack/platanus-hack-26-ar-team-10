'use strict';

function parseManifest(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('pack file is empty');
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    throw new Error('pack manifests must use YAML, not JSON');
  }

  const lines = trimmed.split(/\r?\n/)
    .map((raw, index) => ({ ...parseLine(raw), number: index + 1 }))
    .filter((line) => line.text.length > 0 && !line.text.startsWith('#'));

  const [value, next] = parseBlock(lines, 0, lines[0]?.indent || 0);
  if (next < lines.length) throw new Error(`unexpected YAML content on line ${lines[next].number}`);
  return value;
}

function parseLine(raw) {
  const indent = raw.match(/^ */)[0].length;
  if (/\t/.test(raw.slice(0, indent))) throw new Error('tabs are not supported in pack YAML');
  return { indent, text: raw.trim() };
}

function parseBlock(lines, index, indent) {
  const line = lines[index];
  if (!line) return [null, index];
  if (line.indent !== indent) throw new Error(`unexpected indentation on line ${line.number}`);
  if (line.text.startsWith('- ')) return parseList(lines, index, indent);
  return parseMap(lines, index, indent);
}

function parseMap(lines, index, indent) {
  const out = {};
  let i = index;

  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < indent) break;
    if (line.indent > indent) throw new Error(`unexpected indentation on line ${line.number}`);
    if (line.text.startsWith('- ')) break;

    const { key, value } = parsePair(line.text, line.number);
    i += 1;
    if (value !== '') {
      setMapValue(out, key, parseScalar(value), line.number);
      continue;
    }

    if (i < lines.length && lines[i].indent > indent) {
      const [child, next] = parseBlock(lines, i, lines[i].indent);
      setMapValue(out, key, child, line.number);
      i = next;
    } else {
      setMapValue(out, key, null, line.number);
    }
  }

  return [out, i];
}

function parseList(lines, index, indent) {
  const out = [];
  let i = index;

  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < indent) break;
    if (line.indent !== indent || !line.text.startsWith('- ')) break;

    const item = line.text.slice(2).trim();
    i += 1;

    if (item === '') {
      if (i >= lines.length || lines[i].indent <= indent) {
        out.push(null);
        continue;
      }
      const [child, next] = parseBlock(lines, i, lines[i].indent);
      out.push(child);
      i = next;
      continue;
    }

    if (/^[A-Za-z0-9_.-]+:/.test(item)) {
      const { key, value } = parsePair(item, line.number);
      const obj = {};
      setMapValue(obj, key, value === '' ? null : parseScalar(value), line.number);
      if (i < lines.length && lines[i].indent > indent) {
        const [child, next] = parseBlock(lines, i, lines[i].indent);
        for (const [childKey, childValue] of Object.entries(child || {})) {
          setMapValue(obj, childKey, childValue, lines[i].number);
        }
        i = next;
      }
      out.push(obj);
      continue;
    }

    out.push(parseScalar(item));
  }

  return [out, i];
}

function parsePair(text, lineNumber) {
  const idx = text.indexOf(':');
  if (idx <= 0) throw new Error(`expected key/value pair on line ${lineNumber}`);
  const key = text.slice(0, idx).trim();
  validateKey(key, lineNumber);
  return {
    key,
    value: text.slice(idx + 1).trim(),
  };
}

function validateKey(key, lineNumber) {
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
    throw new Error(`dangerous key on line ${lineNumber}: ${key}`);
  }
}

function setMapValue(target, key, value, lineNumber) {
  if (Object.hasOwn(target, key)) {
    throw new Error(`duplicate key on line ${lineNumber}: ${key}`);
  }
  target[key] = value;
}

function parseScalar(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((item) => parseScalar(item.trim()));
  }
  return value;
}

module.exports = { parseManifest };
