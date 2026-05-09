import fs from 'node:fs';
import path from 'node:path';

export const VERSION_FILES = [
  {
    path: '.claude-plugin/marketplace.json',
    type: 'marketplace',
  },
  {
    path: 'yieldOS/.claude-plugin/marketplace.json',
    type: 'marketplace',
  },
  {
    path: 'yieldOS/plugins/yieldos/.claude-plugin/plugin.json',
    type: 'plugin',
  },
];

const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function absolute(root, relativePath) {
  return path.join(root, relativePath);
}

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(absolute(root, relativePath), 'utf8'));
}

function writeJson(root, relativePath, value) {
  fs.writeFileSync(absolute(root, relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

function parseSemver(version) {
  const match = SEMVER_RE.exec(version);
  if (!match) {
    throw new Error(`invalid semver: ${version}`);
  }
  return match.slice(1).map((part) => Number(part));
}

function compareSemver(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return 1;
    if (a[i] < b[i]) return -1;
  }
  return 0;
}

function normalizeTag(versionOrTag) {
  return versionOrTag
    .replace(/^yieldos--v/, '')
    .replace(/^v/, '');
}

export function bumpVersion(current, target) {
  const [major, minor, patch] = parseSemver(current);
  let next;

  switch (target) {
    case 'patch':
      next = `${major}.${minor}.${patch + 1}`;
      break;
    case 'minor':
      next = `${major}.${minor + 1}.0`;
      break;
    case 'major':
      next = `${major + 1}.0.0`;
      break;
    default:
      if (!SEMVER_RE.test(target)) {
        throw new Error('expected patch, minor, major, or semver x.y.z');
      }
      next = target;
      break;
  }

  if (compareSemver(next, current) <= 0) {
    throw new Error(`next version ${next} must be greater than current ${current}`);
  }

  return next;
}

export function collectVersions(root) {
  const versions = {};

  for (const file of VERSION_FILES) {
    const manifest = readJson(root, file.path);
    if (file.type === 'plugin') {
      versions[file.path] = manifest.version;
      continue;
    }

    const entry = manifest.plugins?.find((plugin) => plugin.name === 'yieldos');
    versions[file.path] = entry?.version;
  }

  return versions;
}

export function getCurrentVersion(root) {
  const versions = collectVersions(root);
  const unique = [...new Set(Object.values(versions))];
  if (unique.length !== 1 || !unique[0]) {
    throw new Error(`yieldOS versions are out of sync: ${JSON.stringify(versions)}`);
  }
  parseSemver(unique[0]);
  return unique[0];
}

function updateManifestVersion(root, file, version) {
  const manifest = readJson(root, file.path);
  if (file.type === 'plugin') {
    manifest.version = version;
    writeJson(root, file.path, manifest);
    return;
  }

  const entry = manifest.plugins?.find((plugin) => plugin.name === 'yieldos');
  if (!entry) {
    throw new Error(`${file.path} does not contain a yieldos plugin entry`);
  }
  entry.version = version;
  writeJson(root, file.path, manifest);
}

function normalizeNotes(notes) {
  const values = Array.isArray(notes) ? notes : [notes].filter(Boolean);
  const cleaned = values
    .flatMap((note) => String(note).split('\n'))
    .map((note) => note.trim())
    .filter(Boolean)
    .map((note) => note.replace(/^-\s*/, ''));

  return cleaned.length > 0 ? cleaned : ['Release maintenance.'];
}

function changelogWithEntry(existing, { version, date, notes }) {
  const body = existing.replace(/^# Changelog\s*\n*/i, '').trim();
  const lines = [
    '# Changelog',
    '',
    `## yieldOS v${version} - ${date}`,
    '',
    ...normalizeNotes(notes).map((note) => `- ${note}`),
    '',
  ];

  if (body.length > 0) {
    lines.push(body, '');
  }

  return lines.join('\n');
}

function updateChangelog(root, relativePath, entry) {
  const filePath = absolute(root, relativePath);
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '# Changelog\n';
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, changelogWithEntry(existing, entry));
}

export function updateReleaseFiles(root, { version, date, notes }) {
  parseSemver(version);
  const releaseDate = date || new Date().toISOString().slice(0, 10);

  for (const file of VERSION_FILES) {
    updateManifestVersion(root, file, version);
  }

  const entry = { version, date: releaseDate, notes };
  updateChangelog(root, 'CHANGELOG.md', entry);
  updateChangelog(root, 'yieldOS/plugins/yieldos/CHANGELOG.md', entry);
}

export function extractReleaseNotes(changelog, versionOrTag) {
  const version = normalizeTag(versionOrTag);
  parseSemver(version);

  const heading = new RegExp(`^##\\s+yieldOS\\s+v${version.replaceAll('.', '\\.')}\\b.*$`, 'm');
  const match = heading.exec(changelog);
  if (!match) {
    throw new Error(`CHANGELOG.md has no section for yieldOS v${version}`);
  }

  const start = match.index + match[0].length;
  const rest = changelog.slice(start).replace(/^\s*\n/, '');
  const next = rest.search(/^##\s+/m);
  return (next >= 0 ? rest.slice(0, next) : rest).trim();
}
