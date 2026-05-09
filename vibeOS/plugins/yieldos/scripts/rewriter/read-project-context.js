'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function readGlobalClaudeMd() {
  const fp = path.join(os.homedir(), '.claude', 'CLAUDE.md');
  try { return fs.readFileSync(fp, 'utf8'); }
  catch (_) { return null; }
}

function readProjectClaudeMd(projectRoot) {
  const fp = path.join(projectRoot, 'CLAUDE.md');
  try { return fs.readFileSync(fp, 'utf8'); }
  catch (_) { return null; }
}

function readProjectAgentsMd(projectRoot) {
  const fp = path.join(projectRoot, 'AGENTS.md');
  try { return fs.readFileSync(fp, 'utf8'); }
  catch (_) { return null; }
}

function readProjectManifest(projectRoot) {
  for (const candidate of ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod']) {
    const fp = path.join(projectRoot, candidate);
    if (fs.existsSync(fp)) {
      return { file: candidate, content: fs.readFileSync(fp, 'utf8') };
    }
  }
  return null;
}

function detectStack(projectRoot) {
  const stack = { language: null, framework: null, testRunner: null, typescript: false, esm: false };
  const pkgPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    stack.language = 'javascript';
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const all = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      stack.typescript = 'typescript' in all || fs.existsSync(path.join(projectRoot, 'tsconfig.json'));
      if (stack.typescript) stack.language = 'typescript';
      stack.esm = pkg.type === 'module';
      if ('next' in all) stack.framework = 'next';
      else if ('react' in all) stack.framework = 'react';
      else if ('vue' in all) stack.framework = 'vue';
      else if ('express' in all) stack.framework = 'express';
      if ('vitest' in all) stack.testRunner = 'vitest';
      else if ('jest' in all) stack.testRunner = 'jest';
    } catch (_) { /* ignore */ }
  } else if (fs.existsSync(path.join(projectRoot, 'pyproject.toml')) || fs.existsSync(path.join(projectRoot, 'requirements.txt'))) {
    stack.language = 'python';
  } else if (fs.existsSync(path.join(projectRoot, 'Cargo.toml'))) {
    stack.language = 'rust';
  } else if (fs.existsSync(path.join(projectRoot, 'go.mod'))) {
    stack.language = 'go';
  }
  return stack;
}

function projectStructureSummary(projectRoot, depth = 2) {
  const summary = [];
  function walk(dir, rel, level) {
    if (level > depth) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (_) { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.npmrc' && entry.name !== '.env.example') continue;
      if (['node_modules', 'dist', 'build', '.next', '__pycache__', 'target', 'vendor'].includes(entry.name)) continue;
      const childRel = path.posix.join(rel, entry.name);
      summary.push(entry.isDirectory() ? `${childRel}/` : childRel);
      if (entry.isDirectory()) walk(path.join(dir, entry.name), childRel, level + 1);
    }
  }
  walk(projectRoot, '.', 0);
  return summary.slice(0, 200);
}

function gatherContext(projectRoot) {
  return {
    globalClaudeMd: readGlobalClaudeMd(),
    projectClaudeMd: readProjectClaudeMd(projectRoot),
    projectAgentsMd: readProjectAgentsMd(projectRoot),
    manifest: readProjectManifest(projectRoot),
    stack: detectStack(projectRoot),
    structure: projectStructureSummary(projectRoot, 2),
  };
}

module.exports = { gatherContext, readGlobalClaudeMd, readProjectClaudeMd, readProjectAgentsMd, detectStack, projectStructureSummary };
