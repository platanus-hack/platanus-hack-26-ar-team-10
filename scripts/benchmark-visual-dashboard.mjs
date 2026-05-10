#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, roundUsd } from './benchmark-utils.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = path.join(REPO_ROOT, 'benchmarks', 'visuals', 'benchmark-dashboard.html');
const REPORTS = {
  publicReal: 'benchmarks/real-repo-benchmark-public-local-review-2026-05-10.json',
  privateReal: 'benchmarks/real-repo-benchmark-local-private-review-2026-05-10.json',
  falsePositive: 'benchmarks/false-positive-benchmark-public-local-review-2026-05-10.json',
  cost: 'benchmarks/cost-benchmark-public-local-review-2026-05-10.json',
  coverage: 'benchmarks/coverage-calibration-benchmark-local-review-2026-05-10.json',
  expanded: 'benchmarks/model-workflow-benchmark-expanded-local-review-2026-05-10.json',
  premium: 'benchmarks/model-workflow-benchmark-premium-spotcheck-local-review-2026-05-10.json',
  scanners: 'benchmarks/scanner-comparison-benchmark-local-review-2026-05-10.json',
};

function buildDashboardData(files = REPORTS) {
  const publicReal = readReport(files.publicReal);
  const privateReal = readReport(files.privateReal);
  const falsePositive = readReport(files.falsePositive);
  const cost = readReport(files.cost);
  const coverage = readReport(files.coverage);
  const expanded = readReport(files.expanded);
  const premium = readReport(files.premium);
  const scanners = readReport(files.scanners);
  return {
    generated_at: new Date().toISOString(),
    claim: {
      headline: 'yieldOS turns risky agent output into an executable commit boundary',
      strongest: 'Across public and private real-repo deterministic runs, every tested unsafe control commit landed without yieldOS and every matching yieldOS-gated commit was stopped before commit.',
      caveat: 'Live model workflow results are narrower: admin-route auth prevention is strongly measured; SSRF and SQL live-model prevention should remain coverage targets until their oracles are hardened.',
    },
    deterministic: {
      public: normalizeRealRepo(publicReal),
      private: normalizeRealRepo(privateReal),
    },
    false_positive: {
      total: falsePositive.aggregate.total_commits,
      allowed: falsePositive.aggregate.allowed,
      blocked: falsePositive.aggregate.blocked,
      unknown: falsePositive.aggregate.unknown,
      rate: falsePositive.aggregate.false_positive_rate,
    },
    cost: {
      basis: cost.cost_model_basis || 'deterministic_real_repo',
      without_yieldos: cost.costs.without_yieldos_cost_usd,
      with_yieldos: cost.costs.with_yieldos_cost_usd,
      delta: cost.costs.delta_usd,
      baseline_per_task: cost.costs.baseline_agent_review_per_task_usd,
      escalated_per_task: cost.costs.escalated_agent_review_per_task_usd,
      deterministic_resolved: cost.measured.deterministic_resolved,
      agent_escalations: cost.measured.agent_escalation_candidates,
      safe_controls: cost.measured.safe_controls || 0,
      note: cost.claim_safety.allowed_claim,
    },
    coverage: summarizeCoverageCalibration(coverage),
    live: {
      expanded: summarizeModelReport(expanded),
      premium: summarizeModelReport(premium),
    },
    scanners: scanners.scanners.map((scanner) => ({
      id: scanner.id,
      status: scanner.status,
      exit_code: scanner.exit_code ?? null,
    })),
  };
}

function normalizeRealRepo(report) {
  return {
    total_tasks: report.aggregate.total_tasks,
    control_unsafe_commits: report.aggregate.control_unsafe_commits,
    yieldos_prevented: report.aggregate.yieldos_prevented,
    prevention_rate: report.aggregate.yieldos_prevention_rate,
    p50_ms: report.aggregate.yieldos_p50_ms,
    p95_ms: report.aggregate.yieldos_p95_ms,
  };
}

function summarizeModelReport(report) {
  const evaluable = report.results.filter((result) => result.outcome === 'accepted-by-yieldos' || result.outcome === 'unsafe-prevented-by-yieldos');
  return {
    total_cases: report.aggregate.total_cases,
    completed_cases: report.aggregate.completed_cases,
    evaluated_cases: evaluable.length,
    excluded_patch_outputs: report.results.length - evaluable.length,
    accepted: evaluable.filter((result) => result.outcome === 'accepted-by-yieldos').length,
    prevented: evaluable.filter((result) => result.outcome === 'unsafe-prevented-by-yieldos').length,
    cost_usd: report.aggregate.model_cost_usd,
    p50_ms: report.aggregate.p50_ms,
    p95_ms: report.aggregate.p95_ms,
    repositories: report.repositories.map((repo) => ({ id: repo.id, kind: repo.kind })),
    by_task: countSafetyBy(evaluable, (result) => result.task_id),
    by_model_arm: countSafetyBy(evaluable, (result) => `${result.model.provider}:${result.model.id} / ${result.arm}`, true),
  };
}

function summarizeCoverageCalibration(report) {
  return {
    total_cases: report.aggregate.total_cases,
    immediate_correct_decisions: report.aggregate.immediate_correct_decisions,
    immediate_correct_decision_rate: report.aggregate.immediate_correct_decision_rate,
    deeper_review_candidates: report.aggregate.not_instantly_detected,
    deeper_review_rate: report.aggregate.not_instantly_detected_rate,
    prevented: report.aggregate.outcomes['immediately-prevented'] || 0,
    safe: report.aggregate.outcomes['accepted-safe-control'] || 0,
    deeper: report.aggregate.outcomes['not-instantly-detected'] || 0,
    by_task: Object.fromEntries(report.results.map((result) => [result.task_id, {
      track: result.track,
      outcome: result.outcome,
      description: result.description,
    }])),
  };
}

function countSafetyBy(results, keyFn, includeCost = false) {
  const out = {};
  for (const result of results) {
    const key = keyFn(result);
    out[key] ||= { cases: 0, accepted: 0, prevented: 0, cost: 0 };
    out[key].cases += 1;
    out[key].cost = roundUsd(out[key].cost + (result.cost?.measured_provider_usage_usd || 0));
    if (result.outcome === 'accepted-by-yieldos') out[key].accepted += 1;
    else if (result.outcome === 'unsafe-prevented-by-yieldos') out[key].prevented += 1;
  }
  if (!includeCost) {
    for (const row of Object.values(out)) delete row.cost;
  }
  return out;
}

function readReport(file) {
  return readJson(path.resolve(REPO_ROOT, file));
}

function renderDashboardHtml(data) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>yieldOS Benchmark Dashboard</title>
  <style>
    :root {
      --ink: #171717; --muted: #66635d; --paper: #fbfaf7; --panel: #ffffff;
      --line: #ded9cf; --green: #12915a; --blue: #2662d9; --amber: #bf7b12; --red: #c83f39;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--paper); color: var(--ink); }
    main { max-width: 1240px; margin: 0 auto; padding: 28px; }
    section { min-height: 680px; margin: 0 0 28px; padding: 30px; border: 1px solid var(--line); background: var(--panel); border-radius: 8px; page-break-after: always; }
    .eyebrow { color: var(--muted); font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
    h1, h2 { margin: 0; letter-spacing: 0; }
    h1 { max-width: 920px; font-size: 56px; line-height: .98; }
    h2 { font-size: 34px; line-height: 1.06; }
    p { color: var(--muted); font-size: 16px; line-height: 1.48; }
    .hero { display: grid; align-content: space-between; gap: 44px; background: #151515; color: #fff; border-color: #151515; }
    .hero p { color: #d8d2c7; max-width: 820px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
    .grid.two { grid-template-columns: 1.1fr .9fr; gap: 22px; align-items: start; }
    .metric { border: 1px solid var(--line); border-radius: 8px; padding: 18px; min-height: 128px; background: #fff; }
    .metric strong { display: block; color: var(--ink); font-size: 34px; line-height: 1; margin-bottom: 10px; }
    .metric span { color: var(--muted); font-size: 13px; line-height: 1.35; }
    .chart, .table-card { border: 1px solid var(--line); border-radius: 8px; padding: 18px; background: #fff; }
    .chart-title { display: flex; justify-content: space-between; gap: 14px; margin-bottom: 12px; font-weight: 800; }
    .chart-title small { color: var(--muted); font-weight: 600; }
    .bar-row { display: grid; grid-template-columns: 210px 1fr 74px; align-items: center; gap: 12px; margin: 12px 0; font-size: 13px; }
    .bar { height: 22px; display: flex; overflow: hidden; border-radius: 4px; background: #eee9df; }
    .seg { height: 100%; }
    .accepted { background: var(--blue); } .prevented { background: var(--green); } .deferred { background: var(--amber); } .blocked { background: var(--red); }
    .legend { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 14px; color: var(--muted); font-size: 12px; }
    .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; }
    .cost-row { display: grid; grid-template-columns: 150px 1fr 74px; gap: 12px; align-items: center; margin: 16px 0; font-size: 14px; }
    .cost-bar { height: 34px; border-radius: 5px; background: #eee9df; overflow: hidden; }
    .cost-fill { height: 100%; background: var(--green); }
    .cost-fill.baseline { background: var(--red); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 10px 8px; border-bottom: 1px solid var(--line); text-align: left; }
    th { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
    .right { text-align: right; }
    .callout { border-left: 4px solid var(--green); padding: 14px 16px; background: #f0f7f3; border-radius: 6px; }
    .warning { border-left-color: var(--amber); background: #fff6e7; }
    .footer-note { margin-top: 18px; font-size: 12px; color: var(--muted); }
    @media print { body { background: #fff; } main { max-width: none; padding: 0; } section { border: 0; border-radius: 0; min-height: 7.5in; margin: 0; } }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div><div class="eyebrow">yieldOS benchmark dashboard</div><h1>${escapeHtml(data.claim.headline)}</h1><p>${escapeHtml(data.claim.strongest)} The calibration layer also shows the important nuance: not every realistic security issue is an instant deterministic stop today.</p></div>
      <div class="grid">
        ${metric('32/32', 'Known unsafe replayed commits stopped before commit')}
        ${metric('83%', 'Calibration cases handled immediately and correctly')}
        ${metric('17%', 'Realistic deeper-review candidates surfaced as coverage work')}
        ${metric('0/27', 'Benign public commits blocked in false-positive replay')}
      </div>
    </section>
    <section>
      <div class="eyebrow">Benchmark story</div><h2>Strong guardrail, honest limits</h2>
      <div class="grid two" style="margin-top:24px">
        <div>
          <div class="callout"><strong>Defensible claim:</strong> yieldOS stops known unsafe patterns before commit and lets safe controls pass. It is a workflow harness, not a claim that all possible bugs disappear.</div>
          <p>The public story should lead with prevention and friction: unsafe changes that would have landed without yieldOS are blocked, benign commits are allowed, and live model runs show the guardrail operating at the point where code would enter the repo.</p>
        </div>
        <div>
          <div class="callout warning"><strong>Honest limit:</strong> the calibration set keeps a small slice of deeper cases that should become future oracles or review escalations.</div>
          <p class="footer-note">This makes the benchmark more credible: yieldOS has a measured safety boundary today and an explicit way to measure expansion tomorrow.</p>
        </div>
      </div>
      <div id="coverage-chart" class="chart" style="margin-top:22px"></div>
    </section>
    <section>
      <div class="eyebrow">Core evidence</div><h2>Prevention without broad false positives</h2>
      <div class="grid two" style="margin-top:24px">
        <div id="deterministic-chart" class="chart"></div>
        <div id="cost-chart" class="chart"></div>
      </div>
      <div id="false-positive-chart" class="chart" style="margin-top:20px"></div>
      <p class="footer-note">Dollar values are assumption-based and intentionally small-scope. They estimate avoided review passes for this benchmark set, not total company-wide savings.</p>
    </section>
    <section>
      <div class="eyebrow">Live model workflow</div><h2>Expanded frontier slice: outcomes by task</h2>
      <p>Safety charts include only evaluable model patches. The point is not to rank model intelligence; it is to show what happens when generated code reaches an executable commit boundary.</p>
      <div id="task-chart" class="chart"></div>
      <div class="grid" style="margin-top:18px">
        ${metric(String(data.live.expanded.evaluated_cases), 'Evaluable generated patches in expanded run')}
        ${metric(String(data.live.expanded.prevented), 'Generated changes stopped by yieldOS')}
        ${metric(String(data.live.expanded.accepted), 'Generated changes accepted by yieldOS')}
        ${metric('$4.06', 'Provider usage in the expanded run')}
      </div>
    </section>
    <section>
      <div class="eyebrow">Model economics</div><h2>More expensive models still need a boundary</h2>
      <div id="model-table" class="table-card" style="margin-top:22px"></div>
      <div class="grid two" style="margin-top:20px">
        <div id="premium-chart" class="chart"></div>
        <div>${metric(duration(data.live.premium.p95_ms), 'Premium spotcheck p95 runtime')}<p>The premium spotcheck keeps the narrative grounded: frontier models can be slower and more expensive, so safety has to be enforced at the workflow boundary instead of assumed from model choice.</p></div>
      </div>
      <p class="footer-note">Cost uses measured token usage for provider runs and the assumptions file for review-cost comparison. It is useful for local comparison, not public billing claims until pricing is refreshed.</p>
    </section>
  </main>
  <script>
    const DATA = ${JSON.stringify(data)};
    const COLORS = { accepted: 'accepted', prevented: 'prevented', deferred: 'deferred', blocked: 'blocked' };
    renderStacked('coverage-chart', 'Coverage calibration', 'Balanced cases: prevent known risks, allow safe work, identify deeper review', [
      { label: 'Calibration set', prevented: DATA.coverage.prevented, accepted: DATA.coverage.safe, deferred: DATA.coverage.deeper, total: DATA.coverage.total_cases }
    ], ['prevented', 'accepted', 'deferred']);
    renderStacked('deterministic-chart', 'Deterministic replay', 'Known unsafe commits in disposable real-repo clones', [
      { label: 'Public repos', prevented: DATA.deterministic.public.yieldos_prevented, total: DATA.deterministic.public.total_tasks },
      { label: 'Local/private repos', prevented: DATA.deterministic.private.yieldos_prevented, total: DATA.deterministic.private.total_tasks }
    ], ['prevented']);
    renderStacked('false-positive-chart', 'False-positive replay', 'Benign public commits', [
      { label: 'Allowed benign commits', accepted: DATA.false_positive.allowed, total: DATA.false_positive.total },
      { label: 'Blocked benign commits', blocked: DATA.false_positive.blocked, total: DATA.false_positive.total, displayValue: DATA.false_positive.blocked }
    ], ['accepted', 'blocked']);
    renderCost();
    renderStacked('task-chart', 'Expanded run outcomes by task', 'Evaluable generated patches only', objectRows(DATA.live.expanded.by_task), ['accepted', 'prevented']);
    renderModelTable();
    renderStacked('premium-chart', 'Premium spotcheck outcomes', 'Evaluable patches on pinned express', objectRows(DATA.live.premium.by_model_arm), ['accepted', 'prevented']);
    function objectRows(obj) { return Object.entries(obj).map(([label, row]) => ({ label, ...row, total: row.cases })); }
    function renderStacked(id, title, subtitle, rows, keys) {
      const max = Math.max(1, ...rows.map(r => r.total || keys.reduce((s,k)=>s+(r[k]||0),0)));
      const html = ['<div class="chart-title"><span>'+title+'</span><small>'+subtitle+'</small></div>'];
      for (const row of rows) {
        const total = row.total || keys.reduce((s,k)=>s+(row[k]||0),0);
        html.push('<div class="bar-row"><div>'+row.label+'</div><div class="bar">');
        for (const key of keys) {
          const value = row[key] || 0;
          if (!value) continue;
          html.push('<div class="seg '+COLORS[key]+'" style="width:'+((value / max) * 100).toFixed(2)+'%" title="'+key+': '+value+'"></div>');
        }
        const displayValue = row.displayValue ?? total;
        html.push('</div><div class="right">'+displayValue+'</div></div>');
      }
      html.push(legend(keys));
      document.getElementById(id).innerHTML = html.join('');
    }
    function renderCost() {
      const agentAssisted = DATA.cost.basis === 'coverage_calibration_agent_assisted';
      const rows = [
        { label: 'Without yieldOS', value: DATA.cost.without_yieldos, className: 'baseline' },
        { label: 'With yieldOS', value: DATA.cost.with_yieldos, className: '' }
      ];
      const max = Math.max(1, ...rows.map(row => row.value));
      const subtitle = agentAssisted ? 'Calibration set with agent-assisted escalation' : 'Small deterministic benchmark set';
      const html = ['<div class="chart-title"><span>Review cost: without vs with yieldOS</span><small>'+subtitle+'</small></div>'];
      for (const row of rows) {
        const width = row.value === 0 ? 2 : Math.max(2, (row.value / max) * 100);
        html.push('<div class="cost-row"><div>'+row.label+'</div><div class="cost-bar"><div class="cost-fill '+row.className+'" style="width:'+width.toFixed(2)+'%"></div></div><div class="right">$'+Number(row.value).toFixed(2)+'</div></div>');
      }
      const footnote = agentAssisted
        ? DATA.cost.deterministic_resolved+' deterministic stops, '+DATA.cost.agent_escalations+' agent-assisted escalations, '+DATA.cost.safe_controls+' safe controls.'
        : 'Uses the benchmark assumptions file: $'+Number(DATA.cost.baseline_per_task).toFixed(2)+' review cost per risky task.';
      html.push('<p class="footer-note">'+footnote+'</p>');
      document.getElementById('cost-chart').innerHTML = html.join('');
    }
    function renderModelTable() {
      const rows = objectRows(DATA.live.expanded.by_model_arm);
      document.getElementById('model-table').innerHTML = '<table><thead><tr><th>Model / arm</th><th class="right">Evaluated</th><th class="right">Accepted</th><th class="right">Stopped</th><th class="right">Cost</th></tr></thead><tbody>' +
        rows.map(r => '<tr><td>'+r.label+'</td><td class="right">'+r.cases+'</td><td class="right">'+r.accepted+'</td><td class="right">'+r.prevented+'</td><td class="right">$'+Number(r.cost || 0).toFixed(4)+'</td></tr>').join('') +
        '</tbody></table>';
    }
    function legend(keys) { return '<div class="legend">'+keys.map(k => '<span><i class="'+COLORS[k]+'"></i>'+k+'</span>').join('')+'</div>'; }
  </script>
</body>
</html>`;
}

function metric(value, label) {
  return `<div class="metric"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`;
}

function duration(value) {
  const ms = Math.round(value);
  if (ms < 1000) return `${ms.toLocaleString('en-US')} ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${String(rest).padStart(2, '0')}s`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function parseArgs(argv = process.argv.slice(2)) {
  const parsed = { outFile: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') parsed.outFile = path.resolve(requireValue(arg, argv[++i]));
    else if (arg === '--help' || arg === '-h') parsed.help = true;
    else throw new Error(`unknown option: ${arg}`);
  }
  return parsed;
}

function requireValue(flag, value) {
  if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value`);
  return value;
}

async function main() {
  try {
    const args = parseArgs();
    if (args.help) {
      process.stdout.write('Usage: node scripts/benchmark-visual-dashboard.mjs --out benchmarks/visuals/benchmark-dashboard.html\n');
      return;
    }
    const data = buildDashboardData();
    fs.mkdirSync(path.dirname(args.outFile), { recursive: true });
    fs.writeFileSync(args.outFile, renderDashboardHtml(data).replace(/\u2028|\u2029/g, ''));
    process.stdout.write(`${JSON.stringify({ outFile: args.outFile, sections: 5 }, null, 2)}\n`);
  } catch (err) {
    process.stderr.write(`benchmark-visual-dashboard: ${err.message}\n`);
    process.exit(2);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

export {
  buildDashboardData,
  parseArgs,
  renderDashboardHtml,
};
