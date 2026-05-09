#!/usr/bin/env node
'use strict';

// Walk every per-target folder under <bench-out>/, read meta.json +
// pentest-history.json + pentest-memory.md, and produce a single
// REPORT.md that summarizes the whole "yieldOS Reality Check" run.
//
// Usage:
//   yieldos-bench-report --out /tmp/yos-bench/results

const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') out.out = argv[++i];
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function readJson(fp) {
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (_) { return null; }
}

function severityHistogram(rounds) {
  const h = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
  for (const r of rounds) {
    if (!r.finding) continue;
    const s = (r.finding.severity || 'unknown').toLowerCase();
    if (h[s] != null) h[s]++; else h.unknown++;
  }
  return h;
}

function strategiesUsed(rounds) {
  const counts = {};
  for (const r of rounds) {
    const k = r.strategy || 'unknown';
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}

function fmtDuration(ms) {
  if (!ms || ms < 0) return 'n/a';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function reportForTarget(name, dir) {
  const meta = readJson(path.join(dir, 'meta.json'));
  const hist = readJson(path.join(dir, 'pentest-history.json'));
  if (!meta || !hist) return null;
  const rounds = hist.rounds || [];
  const findings = rounds.filter((r) => r.finding);
  const sev = severityHistogram(rounds);
  const strats = strategiesUsed(rounds);
  const startedMs = meta.started_at ? Date.parse(meta.started_at) : null;
  const finishedMs = meta.finished_at ? Date.parse(meta.finished_at) : null;
  const elapsedMs = (startedMs && finishedMs) ? (finishedMs - startedMs) : null;

  const lines = [];
  lines.push(`## ${name}`);
  lines.push('');
  if (meta.repo && meta.repo.remote) {
    const remote = meta.repo.remote.replace(/\.git$/, '');
    lines.push(`- repo: [${remote}](${remote})`);
    if (meta.repo.commit) lines.push(`- commit: \`${meta.repo.commit.slice(0, 12)}\``);
  }
  lines.push(`- bench started: ${meta.started_at || 'n/a'}`);
  lines.push(`- bench finished: ${meta.finished_at || 'n/a'}`);
  lines.push(`- elapsed: ${fmtDuration(elapsedMs)}`);
  lines.push('');
  lines.push('### Outcome');
  lines.push('');
  lines.push('| metric | value |');
  lines.push('| --- | --- |');
  lines.push(`| rounds | ${rounds.length} |`);
  lines.push(`| findings | **${findings.length}** |`);
  lines.push(`| fixes applied | ${(meta.summary && meta.summary.fixes_applied) || 0} |`);
  lines.push(`| terminated | ${(meta.summary && meta.summary.terminated) || 'n/a'} |`);
  lines.push('');
  lines.push('### Severity histogram');
  lines.push('');
  lines.push('| critical | high | medium | low | unknown |');
  lines.push('| --- | --- | --- | --- | --- |');
  lines.push(`| ${sev.critical} | ${sev.high} | ${sev.medium} | ${sev.low} | ${sev.unknown} |`);
  lines.push('');
  lines.push('### Strategies that produced rounds');
  lines.push('');
  for (const [k, v] of Object.entries(strats).sort((a, b) => b[1] - a[1])) {
    lines.push(`- \`${k}\` × ${v}`);
  }
  lines.push('');
  if (findings.length > 0) {
    lines.push('### Top findings');
    lines.push('');
    const top = findings
      .slice()
      .sort((a, b) => severityRank(a.finding.severity) - severityRank(b.finding.severity))
      .slice(0, 8);
    for (const r of top) {
      const f = r.finding;
      lines.push(`- **[${(f.severity || '?').toUpperCase()}]** ${f.title || '(untitled)'} — \`${f.file || 'n/a'}\`  · round ${r.round} · \`${r.strategy}\``);
    }
    lines.push('');
    lines.push(`See [\`${name}/findings.md\`](./${name}/findings.md) for the full list with attack vectors and fix recommendations.`);
    lines.push('');
  }
  return { name, lines: lines.join('\n'), findings: findings.length, severity: sev, elapsedMs };
}

function severityRank(s) {
  return { critical: 0, high: 1, medium: 2, low: 3 }[(s || '').toLowerCase()] ?? 4;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.out) {
    process.stdout.write('usage: yieldos-bench-report --out <bench-results-dir>\n'); process.exit(args.help ? 0 : 2);
  }
  const root = path.resolve(args.out);
  if (!fs.existsSync(root)) { process.stderr.write(`bench dir does not exist: ${root}\n`); process.exit(2); }

  const targets = fs.readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const sections = [];
  let totalFindings = 0;
  const totalSev = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
  for (const name of targets) {
    const dir = path.join(root, name);
    const r = reportForTarget(name, dir);
    if (!r) continue;
    sections.push(r);
    totalFindings += r.findings;
    for (const k of Object.keys(totalSev)) totalSev[k] += r.severity[k];
  }

  const out = [];
  out.push('# yieldOS · Reality Check');
  out.push('');
  out.push('> Adversarial pentest of well-known intentionally-vulnerable projects');
  out.push('> with the yieldOS red/blue agent loop. Dry-run by default — no patches');
  out.push('> were applied to the target repos. This report is auto-generated.');
  out.push('');
  out.push('## Cross-target summary');
  out.push('');
  out.push('| target | findings | critical | high | medium | low |');
  out.push('| --- | --- | --- | --- | --- | --- |');
  for (const s of sections) {
    out.push(`| **${s.name}** | ${s.findings} | ${s.severity.critical} | ${s.severity.high} | ${s.severity.medium} | ${s.severity.low} |`);
  }
  out.push(`| **total** | **${totalFindings}** | ${totalSev.critical} | ${totalSev.high} | ${totalSev.medium} | ${totalSev.low} |`);
  out.push('');
  out.push('---');
  out.push('');
  out.push('## Per-target detail');
  out.push('');
  for (const s of sections) { out.push(s.lines); out.push('---'); out.push(''); }
  out.push('## How to reproduce');
  out.push('');
  out.push('```bash');
  out.push('git clone https://github.com/snyk-labs/nodejs-goof /tmp/yos-bench/targets/nodejs-goof');
  out.push('git clone https://github.com/juice-shop/juice-shop /tmp/yos-bench/targets/juice-shop');
  out.push('node yieldOS/plugins/yieldos/scripts/bench/reality-check.js \\');
  out.push('  --target /tmp/yos-bench/targets/nodejs-goof \\');
  out.push('  --name nodejs-goof \\');
  out.push('  --out /tmp/yos-bench/results \\');
  out.push('  --rounds 10 --converge 3');
  out.push('# (idem for juice-shop)');
  out.push('node yieldOS/plugins/yieldos/scripts/bench/aggregate-report.js \\');
  out.push('  --out /tmp/yos-bench/results');
  out.push('```');
  out.push('');

  const reportPath = path.join(root, 'REPORT.md');
  fs.writeFileSync(reportPath, out.join('\n'));
  process.stdout.write(`wrote ${reportPath}\n`);
}

main();
