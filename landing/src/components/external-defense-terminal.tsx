type Verdict = {
  kind: "blocked" | "allowed";
  text: string;
};

type Scenario = {
  prompt: string;
  tool: string;
  toolArg: string;
  output: string[];
  classifierFooter: string;
  agentSummary: string;
  agentSummaryHighlight?: { text: string; color: string };
  verdict: Verdict;
};

const scenarios: Scenario[] = [
  {
    prompt: "instala flatmap-stream",
    tool: "Bash",
    toolArg: "npm install flatmap-stream",
    output: [
      "request blocked before any network call",
      "match: event-stream payload (Nov 2018)",
    ],
    classifierFooter: "Blocked by denylist classifier",
    agentSummary: "No instalo flatmap-stream — está en la denylist.",
    verdict: {
      kind: "blocked",
      text: "yieldOS · Bloqueado · denylist match",
    },
  },
  {
    prompt: "instala pandas",
    tool: "Bash",
    toolArg: "pip install pandas",
    output: [
      "Requirement already satisfied: pandas in /opt/anaconda3/lib/python3.12/site-packages (2.2.3)",
      "Requirement already satisfied: numpy>=1.26.0 in /opt/anaconda3/lib/python3.12/site-packages (from pandas) (2.4.2)",
      "Requirement already satisfied: python-dateutil>=2.8.2 in /opt/anaconda3/lib/python3.12/site-packages (from pandas) (2.9.0.post0)",
    ],
    classifierFooter: "Allowed by auto mode classifier",
    agentSummary: "pandas ya está instalado (versión 2.2.3) en",
    agentSummaryHighlight: {
      text: " /opt/anaconda3.",
      color: "rgb(120, 153, 255)",
    },
    verdict: {
      kind: "allowed",
      text: "yieldOS · Validado · allowlist",
    },
  },
];

function PixelRobot() {
  // Robot pixelado tipo Claude Code, color heredado de currentColor.
  return (
    <svg
      viewBox="0 0 40 48"
      width="36"
      height="44"
      aria-hidden="true"
      className="text-orange-400"
    >
      {/* head */}
      <rect x="6" y="0" width="28" height="22" fill="currentColor" />
      {/* eyes */}
      <rect x="12" y="6" width="5" height="5" fill="#0a0a0c" />
      <rect x="23" y="6" width="5" height="5" fill="#0a0a0c" />
      {/* mouth */}
      <rect x="13" y="16" width="14" height="2" fill="#0a0a0c" />
      {/* body */}
      <rect x="2" y="24" width="36" height="14" fill="currentColor" />
      {/* legs */}
      <rect x="6" y="40" width="8" height="8" fill="currentColor" />
      <rect x="26" y="40" width="8" height="8" fill="currentColor" />
    </svg>
  );
}

export function ExternalDefenseTerminal() {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#0a0a0c] p-3 font-mono text-[12px] leading-6 text-zinc-300 shadow-[0_24px_60px_-32px_rgba(0,0,0,0.7)] sm:p-4 sm:text-[13px] sm:leading-7">
      {/* Welcome frame (orange notch border) */}
      <div className="relative overflow-hidden rounded-xl border border-orange-500/45 px-4 pb-4 pt-5 sm:px-5 sm:pb-5 sm:pt-6">
        <div className="absolute left-4 top-0 -translate-y-1/2 bg-[#0a0a0c] px-2 text-[11px] uppercase tracking-[0.2em] text-orange-400">
          Claude Code v2.1.111
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[1fr_1.05fr]">
          {/* Left col: welcome + robot + model context */}
          <div>
            <p className="text-center font-semibold text-white">
              Welcome back Mauro!
            </p>
            <div className="mt-3 flex justify-center">
              <PixelRobot />
            </div>
            <p className="mt-3 text-zinc-400">
              <span className="text-white">Opus 4.7 (1M context)</span> with hi…
              · API Usage Billing
            </p>
            <p className="text-zinc-500">· Mauro&rsquo;s Individual Org</p>
            <p className="text-zinc-500">~/Desktop/tensorflow-demo</p>
          </div>

          {/* Right col: tips + recent activity */}
          <div className="border-zinc-800 sm:border-l sm:pl-5">
            <p className="text-orange-400">Tips for getting started</p>
            <p className="mt-1 text-zinc-200">
              Run <span className="text-white">/init</span> to create a{" "}
              <span className="text-white">CLAUDE.md</span> file with instr…
            </p>
            <p className="mt-4 text-orange-400">Recent activity</p>
            <p className="mt-1 text-zinc-500">No recent activity</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mt-4 px-1 sm:mt-5 sm:px-2">
        {scenarios.map((scenario, i) => (
          <div key={scenario.prompt} className={i > 0 ? "mt-7 sm:mt-8" : ""}>
            {/* Prompt bar */}
            <div className="rounded-md bg-zinc-900/80 px-3 py-1.5">
              <p>
                <span className="text-zinc-500">›</span>{" "}
                <span className="text-zinc-100">{scenario.prompt}</span>
              </p>
            </div>

            {/* Tool call header */}
            <p className="mt-3">
              <span className="text-emerald-400">●</span>{" "}
              <span className="font-bold text-white">{scenario.tool}</span>
              <span className="text-zinc-500">({scenario.toolArg})</span>
            </p>

            {/* Output (pipe-indented) */}
            <div className="mt-1 pl-3">
              {scenario.output.map((line) => (
                <p key={line} className="text-zinc-400">
                  <span className="text-zinc-700">│</span>{" "}
                  <span>{line}</span>
                </p>
              ))}
              <p className="text-zinc-500">
                <span className="text-zinc-700">└</span>{" "}
                <span>{scenario.classifierFooter}</span>
              </p>
            </div>

            {/* Agent summary */}
            <p className="mt-3 text-zinc-200">
              <span className="text-emerald-400">●</span>{" "}
              {scenario.agentSummary}
              {scenario.agentSummaryHighlight ? (
                <span style={{ color: scenario.agentSummaryHighlight.color }}>
                  {scenario.agentSummaryHighlight.text}
                </span>
              ) : null}
            </p>

            {/* yieldOS verdict line */}
            <p
              className={`mt-3 flex flex-wrap items-center gap-2 ${
                scenario.verdict.kind === "blocked"
                  ? "text-rose-400"
                  : "text-emerald-400"
              }`}
            >
              <span className="font-bold">
                {scenario.verdict.kind === "blocked" ? "−" : "+"}
              </span>
              <span className="text-zinc-700">│</span>
              <span aria-hidden>🛡</span>
              <span>{scenario.verdict.text}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
