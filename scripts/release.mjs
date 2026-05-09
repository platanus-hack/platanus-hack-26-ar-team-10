#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  bumpVersion,
  extractReleaseNotes,
  getCurrentVersion,
  updateReleaseFiles,
} from './versioning.mjs';

const repoRoot = process.cwd();

function usage() {
  process.stdout.write(`yieldOS release helper

Usage:
  node scripts/release.mjs current
  node scripts/release.mjs bump <patch|minor|major|x.y.z> --note "Change note" [--date YYYY-MM-DD]
  node scripts/release.mjs notes <vX.Y.Z|yieldos--vX.Y.Z>

Examples:
  node scripts/release.mjs bump patch --note "Fix manifest edit validation"
  node scripts/release.mjs bump 0.3.0 --note "Add policy channel support"
  git add . && git commit -m "Release yieldOS v0.2.8"
  git tag yieldos--v0.2.8
  git push origin main yieldos--v0.2.8
`);
}

function die(message) {
  process.stderr.write(`yieldOS release: ${message}\n`);
  process.exit(1);
}

function parseOptions(args) {
  const options = { notes: [] };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--note':
      case '--notes':
        if (!args[i + 1]) die(`${arg} needs a value`);
        options.notes.push(args[i + 1]);
        i += 1;
        break;
      case '--date':
        if (!args[i + 1]) die('--date needs a value');
        options.date = args[i + 1];
        i += 1;
        break;
      case '-h':
      case '--help':
        usage();
        process.exit(0);
        break;
      default:
        die(`unknown option: ${arg}`);
    }
  }

  return options;
}

const [command, target, ...rest] = process.argv.slice(2);

try {
  switch (command) {
    case 'current': {
      process.stdout.write(`${getCurrentVersion(repoRoot)}\n`);
      break;
    }

    case 'bump': {
      if (!target) die('bump needs patch, minor, major, or x.y.z');
      const options = parseOptions(rest);
      const current = getCurrentVersion(repoRoot);
      const version = bumpVersion(current, target);

      updateReleaseFiles(repoRoot, {
        version,
        date: options.date,
        notes: options.notes,
      });

      process.stdout.write(`yieldOS ${current} -> ${version}\n`);
      process.stdout.write(`Tag this release with: yieldos--v${version}\n`);
      break;
    }

    case 'notes': {
      if (!target) die('notes needs a tag or version');
      const changelog = fs.readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8');
      process.stdout.write(`${extractReleaseNotes(changelog, target)}\n`);
      break;
    }

    case '-h':
    case '--help':
    case undefined:
      usage();
      break;

    default:
      die(`unknown command: ${command}`);
  }
} catch (error) {
  die(error.message);
}
