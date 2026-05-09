#!/usr/bin/env node
'use strict';

// yieldOS Reality Check — bench harness for public, well-known vulnerable
// projects. Runs the adversarial pentest loop in dry-run mode (no patches
// applied so the cloned repo stays intact) and packages the artifacts that
// later get published on the website.
//
// Output, per target, lives in <bench-out>/<repo-name>/:
//   pentest-events.jsonl    every red/blue event the orchestrator emits
//   pentest-history.json    structured per-round log
//   pentest-memory.md       human-readable lessons
//   pentest-live.log        ANSI feed (`cat` it in a real TTY for color)
//   meta.json               { repo, commit, started_at, finished_at, summary }
//   findings.md             flat list of every red-team finding
//
// Usage:
//   yieldos-reality-check \
//     --target /tmp/yos-bench/nodejs-goof \
//     --name nodejs-goof \
//     --out  /tmp/yos-bench/results \
//     --rounds 10 --converge 3

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const orchestrator = require('../code-audit/pentest-loop/orchestrator');
const memory = require('../code-audit/pentest-loop/memory');

function parseArgs(argv) {
  const out = { rounds: 10, converge: 3, applyFixes: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--target') out.target = argv[++i];
    else if (a === '--name') out.name = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--rounds') out.rounds = parseInt(argv[++i], 10);
    else if (a === '--converge') out.converge = parseInt(argv[++i], 10);
    else if (a === '--apply') out.applyFixes = true;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function help() {
  process.stdout.write([
    'yieldos-reality-check — public bench harness',
    '',
    'usage:',
    '  yieldos-reality-check --target <dir> --name <slug> --out <dir>',
    '                        [--rounds N] [--converge N] [--apply]',
    '',
    '  --target    path to the cloned target repo to attack',
    '  --name      slug used for the per-target output folder',
    '  --out       directory where artifacts are written (must exist)',
    '  --rounds    max rounds (default 10)',
    '  --converge  consecutive clean rounds to terminate (default 3)',
    '  --apply     ALSO apply blue-team patches (default: dry-run)',
    '',
  ].join('\n'));
}

function gitInfo(target) {
  try {
    const commit = execSync('git rev-parse HEAD', { cwd: target }).toString().trim();
    const remote = execSync('git config --get remote.origin.url', { cwd: target }).toString().trim();
    return { commit, remote };
  } catch (_) { return { commit: null, remote: null }; }
}

function flatFindingsMd(history) {
  const lines = ['# yieldOS Reality Check — findings list', ''];
  let n = 0;
  for (const r of history.rounds || []) {
    if (!r.finding) continue;
    n++;
    lines.push(`## ${n}. ${r.finding.title || '(untitled)'}`);
    lines.push('');
    lines.push(`- round: ${r.round}  ·  strategy: \`${r.strategy}\``);
    lines.push(`- severity: **${(r.finding.severity || 'unknown').toUpperCase()}**`);
    lines.push(`- file: \`${r.finding.file || 'n/a'}\`${r.finding.line_hint ? '  ·  ' + r.finding.line_hint : ''}`);
    lines.push('');
    lines.push('**attack vector:**');
    lines.push('');
    lines.push('> ' + String(r.finding.attack_vector || '(no attack vector recorded)').replace(/\n/g, '\n> '));
    lines.push('');
    if (r.finding.exploit_evidence) {
      lines.push('**exploit evidence:**');
      lines.push('');
      lines.push('```');
      lines.push(String(r.finding.exploit_evidence));
      lines.push('```');
      lines.push('');
    }
    if (r.finding.fix_recommendation) {
      lines.push('**fix recommendation:**');
      lines.push('');
      lines.push('> ' + String(r.finding.fix_recommendation).replace(/\n/g, '\n> '));
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }
  if (n === 0) lines.push('_(no findings — the red team came up empty)_');
  return lines.join('\n');
}

function metaJson({ name, target, summary, started, finished }) {
  return {
    name,
    target,
    repo: gitInfo(target),
    started_at: started,
    finished_at: finished,
    summary,
    bench: 'yieldOS Reality Check',
    bench_version: 1,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.target || !args.name || !args.out) { help(); process.exit(args.help ? 0 : 2); }

  const target = path.resolve(args.target);
  if (!fs.existsSync(target)) {
    process.stderr.write(`target does not exist: ${target}\n`);
    process.exit(2);
  }
  fs.mkdirSync(args.out, { recursive: true });

  // The orchestrator writes its artifacts into <projectRoot>/security/.
  // We give it a freshly-emptied security/ inside the target so prior runs
  // do not bleed into this bench.
  const sec = path.join(target, 'security');
  if (fs.existsSync(sec)) {
    for (const f of ['pentest-events.jsonl', '.pentest-events-cursor', 'pentest-history.json', 'pentest-memory.md', 'pentest-live.log', 'pentest-state.json']) {
      try { fs.unlinkSync(path.join(sec, f)); } catch (_) {}
    }
  }
  fs.mkdirSync(sec, { recursive: true });

  const started = new Date().toISOString();
  process.stdout.write(`[reality-check] starting "${args.name}" at ${started}\n`);
  process.stdout.write(`[reality-check] target=${target}  rounds=${args.rounds}  converge=${args.converge}  apply=${args.applyFixes}\n`);

  const summary = await orchestrator.run(target, {
    maxRounds: args.rounds,
    convergenceClean: args.converge,
    applyFixes: !!args.applyFixes,
    log: (line) => process.stderr.write(line + '\n'),
  });

  const finished = new Date().toISOString();

  // Copy artifacts to the bench output folder.
  const dstRoot = path.join(args.out, args.name);
  fs.mkdirSync(dstRoot, { recursive: true });
  for (const f of ['pentest-events.jsonl', 'pentest-history.json', 'pentest-memory.md', 'pentest-live.log']) {
    const src = path.join(sec, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dstRoot, f));
  }

  const history = memory.readHistory(target);
  fs.writeFileSync(path.join(dstRoot, 'findings.md'), flatFindingsMd(history));
  fs.writeFileSync(path.join(dstRoot, 'meta.json'), JSON.stringify(metaJson({ name: args.name, target, summary, started, finished }), null, 2));

  process.stdout.write(`[reality-check] done. summary:\n${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`[reality-check] artifacts in ${dstRoot}\n`);
}

main().catch((err) => {
  process.stderr.write(`[reality-check] fatal: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
