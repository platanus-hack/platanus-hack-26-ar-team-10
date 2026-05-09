#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const CONCURRENCY = parseInt(process.env.YIELDOS_BENCH_CONCURRENCY || '16', 10);
const HOOK_PATH = process.env.YIELDOS_BENCH_HOOK || path.resolve(process.argv[2] || path.join(__dirname, '..', 'plugins', 'yieldos', 'scripts', 'pre-install-gate.js'));
const OUT_DIR = process.env.YIELDOS_BENCH_OUT || path.resolve(__dirname, 'results');
const RUN_TAG = process.env.YIELDOS_BENCH_TAG || 'run';
const DATASETS_DIR = path.resolve(__dirname, 'datasets');

if (!fs.existsSync(HOOK_PATH)) {
  console.error('Hook not found:', HOOK_PATH);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

function loadDatasets() {
  const cases = [];

  const npm = JSON.parse(fs.readFileSync(path.join(DATASETS_DIR, 'npm-top.json'), 'utf8'));
  for (const name of npm.packages) {
    cases.push({
      id: `npm:${name}`,
      tool_name: 'Bash',
      tool_input: { command: `npm install ${name}` },
      expected: 'auto',
      dataset: 'npm-top',
      manager: 'npm',
      package: name,
    });
  }

  const py = JSON.parse(fs.readFileSync(path.join(DATASETS_DIR, 'pypi-top.json'), 'utf8'));
  for (const name of py.packages) {
    cases.push({
      id: `pip:${name}`,
      tool_name: 'Bash',
      tool_input: { command: `pip install ${name}` },
      expected: 'auto',
      dataset: 'pypi-top',
      manager: 'pip',
      package: name,
    });
  }

  const mal = JSON.parse(fs.readFileSync(path.join(DATASETS_DIR, 'malicious.json'), 'utf8'));
  for (const m of mal.packages) {
    const cmd = m.manager === 'pip'
      ? (m.version ? `pip install ${m.name}==${m.version}` : `pip install ${m.name}`)
      : (m.version ? `npm install ${m.name}@${m.version}` : `npm install ${m.name}`);
    cases.push({
      id: `mal:${m.manager}:${m.name}@${m.version || 'latest'}`,
      tool_name: 'Bash',
      tool_input: { command: cmd },
      expected: 'denylist-match',
      dataset: 'malicious',
      manager: m.manager,
      package: m.name,
      incident: m.incident,
    });
  }

  const edge = JSON.parse(fs.readFileSync(path.join(DATASETS_DIR, 'edge-cases.json'), 'utf8'));
  for (let i = 0; i < edge.cases.length; i++) {
    const c = edge.cases[i];
    cases.push({
      id: `edge:${i}:${c.command.slice(0, 40)}`,
      tool_name: 'Bash',
      tool_input: { command: c.command },
      expected: c.expected,
      dataset: 'edge-cases',
      manager: 'mixed',
      package: c.command,
    });
  }

  return cases;
}

function runOne(testCase, projectRoot) {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn('node', [HOOK_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    });

    let stderr = '';
    let stdout = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      const ms = Date.now() - start;
      const verdict = extractVerdict(stderr) || (code === 0 ? 'passthrough-or-allow' : 'unknown-block');
      const message = extractMessage(stderr);
      resolve({
        ...testCase,
        exit_code: code,
        verdict,
        message,
        duration_ms: ms,
        stderr: stderr.slice(0, 1000),
      });
    });

    child.on('error', (err) => {
      resolve({
        ...testCase,
        exit_code: -1,
        verdict: 'spawn-error',
        message: err.message,
        duration_ms: Date.now() - start,
        stderr: '',
      });
    });

    const payload = JSON.stringify({
      tool_name: testCase.tool_name,
      tool_input: testCase.tool_input,
      cwd: projectRoot,
    });
    child.stdin.write(payload);
    child.stdin.end();
  });
}

function extractVerdict(stderr) {
  const m = stderr.match(/\[yieldOS:verdict\]\s+(\S+)/);
  return m ? m[1] : null;
}

function extractMessage(stderr) {
  const m = stderr.match(/\[yieldOS\]\s+([^\n]+)/);
  return m ? m[1].slice(0, 250) : '';
}

async function runPool(cases, concurrency) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yieldos-bench-'));
  fs.mkdirSync(path.join(projectRoot, 'security'), { recursive: true });
  console.log('Project root for runs:', projectRoot);

  const results = [];
  let nextIdx = 0;
  let completed = 0;
  const total = cases.length;

  const workers = Array.from({ length: concurrency }, () => (async () => {
    while (true) {
      const idx = nextIdx++;
      if (idx >= total) break;
      const result = await runOne(cases[idx], projectRoot);
      results.push(result);
      completed++;
      if (completed % 50 === 0 || completed === total) {
        process.stderr.write(`progress ${completed}/${total} (${(completed/total*100).toFixed(1)}%)\n`);
      }
    }
  })());

  await Promise.all(workers);
  return { results, projectRoot };
}

function summarize(results) {
  const byVerdict = {};
  const byDataset = {};
  const byManager = {};
  let totalDuration = 0;

  for (const r of results) {
    byVerdict[r.verdict] = (byVerdict[r.verdict] || 0) + 1;
    if (!byDataset[r.dataset]) byDataset[r.dataset] = {};
    byDataset[r.dataset][r.verdict] = (byDataset[r.dataset][r.verdict] || 0) + 1;
    if (!byManager[r.manager]) byManager[r.manager] = {};
    byManager[r.manager][r.verdict] = (byManager[r.manager][r.verdict] || 0) + 1;
    totalDuration += r.duration_ms;
  }

  return {
    total: results.length,
    durationSeconds: (totalDuration / 1000).toFixed(1),
    byVerdict,
    byDataset,
    byManager,
  };
}

function detectFalsePositives(results) {
  // Legitimate top packages that got blocked unexpectedly.
  const fps = [];
  for (const r of results) {
    if (r.dataset === 'npm-top' || r.dataset === 'pypi-top') {
      const isBlocked = String(r.verdict).startsWith('verification-failed') ||
                        r.verdict === 'denylist-match' ||
                        r.verdict === 'unknown-block';
      if (isBlocked) fps.push(r);
    }
  }
  return fps;
}

function detectFalseNegatives(results) {
  // Malicious packages that got allowed.
  const fns = [];
  for (const r of results) {
    if (r.dataset === 'malicious') {
      const isAllowed = r.verdict === 'allowlist-match' ||
                        r.verdict === 'verification-passed' ||
                        r.verdict === 'passthrough-or-allow' ||
                        r.exit_code === 0;
      if (isAllowed) fns.push(r);
    }
  }
  return fns;
}

function detectEdgeMismatches(results) {
  const mismatches = [];
  for (const r of results) {
    if (r.dataset !== 'edge-cases') continue;
    if (r.expected === 'auto' || r.expected.includes('-or-')) continue;
    if (r.expected !== r.verdict && !r.verdict.includes(r.expected)) {
      mismatches.push(r);
    }
  }
  return mismatches;
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function writeCsv(filepath, results) {
  const headers = ['id', 'dataset', 'manager', 'package', 'verdict', 'exit_code', 'duration_ms', 'message', 'expected', 'incident'];
  const rows = [headers.join(',')];
  for (const r of results) {
    rows.push([
      csvEscape(r.id),
      csvEscape(r.dataset),
      csvEscape(r.manager),
      csvEscape(r.package),
      csvEscape(r.verdict),
      csvEscape(r.exit_code),
      csvEscape(r.duration_ms),
      csvEscape(r.message),
      csvEscape(r.expected),
      csvEscape(r.incident || ''),
    ].join(','));
  }
  fs.writeFileSync(filepath, rows.join('\n'));
}

(async () => {
  const start = Date.now();
  const cases = loadDatasets();
  console.log(`Loaded ${cases.length} cases`);
  console.log(`Hook: ${HOOK_PATH}`);
  console.log(`Concurrency: ${CONCURRENCY}`);

  const { results } = await runPool(cases, CONCURRENCY);
  const summary = summarize(results);
  const fps = detectFalsePositives(results);
  const fns = detectFalseNegatives(results);
  const mismatches = detectEdgeMismatches(results);

  const csvPath = path.join(OUT_DIR, `${RUN_TAG}.csv`);
  writeCsv(csvPath, results);

  const reportPath = path.join(OUT_DIR, `${RUN_TAG}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({
    run: RUN_TAG,
    timestamp: new Date().toISOString(),
    duration_seconds: ((Date.now() - start) / 1000).toFixed(1),
    hook: HOOK_PATH,
    concurrency: CONCURRENCY,
    summary,
    falsePositives: fps.map((r) => ({ id: r.id, package: r.package, verdict: r.verdict, message: r.message })),
    falseNegatives: fns.map((r) => ({ id: r.id, package: r.package, verdict: r.verdict, incident: r.incident })),
    edgeMismatches: mismatches.map((r) => ({ id: r.id, command: r.tool_input.command, expected: r.expected, got: r.verdict })),
  }, null, 2));

  console.log('---');
  console.log('Total cases:', results.length);
  console.log('Wall time:', ((Date.now() - start) / 1000).toFixed(1), 's');
  console.log('By verdict:', summary.byVerdict);
  console.log('FPs (legitimate blocked):', fps.length);
  console.log('FNs (malicious allowed):', fns.length);
  console.log('Edge mismatches:', mismatches.length);
  console.log('CSV:', csvPath);
  console.log('JSON:', reportPath);
})();
