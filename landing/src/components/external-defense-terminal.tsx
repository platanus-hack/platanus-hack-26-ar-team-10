type Verdict = {
  kind: "blocked" | "allowed";
  text: string;
};

type Scenario = {
  prompt: string;
  tool: string;
  toolArg: string;
  output: string[];
  verdict: Verdict;
};

const scenarios: Scenario[] = [
  {
    prompt: "instala flatmap-stream",
    tool: "Bash",
    toolArg: "npm install flatmap-stream",
    output: [
      "request blocked before any network call",
      "match: event-stream supply-chain payload (2018)",
    ],
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
      "Requirement already satisfied: pandas (2.2.3)",
      "Allowed by curated policy classifier",
    ],
    verdict: {
      kind: "allowed",
      text: "yieldOS · Validado · allowlist",
    },
  },
];

export function ExternalDefenseTerminal() {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#0e0e10] p-3 shadow-[0_24px_60px_-32px_rgba(0,0,0,0.7)] sm:p-4">
      {/* Header (orange-bordered, like Claude Code's welcome frame) */}
      <div className="relative overflow-hidden rounded-xl border border-orange-500/40 px-4 py-4 sm:px-5 sm:py-5">
        <div className="absolute left-4 top-0 -translate-y-1/2 bg-[#0e0e10] px-2 font-mono text-[10px] uppercase tracking-[0.2em] text-orange-400 sm:text-[11px]">
          Claude Code v2.1.111
        </div>
        <div className="grid grid-cols-1 gap-3 font-mono text-[12px] leading-5 sm:grid-cols-[1fr_1fr] sm:gap-5 sm:text-[13px] sm:leading-6">
          <div>
            <p className="font-semibold text-white">Welcome back, Mauro</p>
            <p className="mt-1 text-zinc-500">
              Opus 4.7 · Mauro&rsquo;s Individual Org
            </p>
            <p className="text-zinc-500">~/Desktop/checkout-api</p>
          </div>
          <div className="hidden sm:block">
            <p className="text-orange-400">Tips for getting started</p>
            <p className="mt-1 text-zinc-400">
              Run /init to create a CLAUDE.md file with instructions.
            </p>
          </div>
        </div>
      </div>

      {/* Body — scenarios */}
      <div className="mt-4 space-y-6 px-2 pb-2 font-mono text-[12px] leading-6 text-zinc-300 sm:mt-5 sm:space-y-7 sm:px-3 sm:text-[13px] sm:leading-7">
        {scenarios.map((scenario, i) => (
          <div key={scenario.prompt}>
            {i > 0 ? (
              <div className="mb-6 h-px w-full bg-zinc-800/80 sm:mb-7" />
            ) : null}

            {/* User prompt */}
            <p>
              <span className="text-orange-400">›</span>{" "}
              <span className="text-white">{scenario.prompt}</span>
            </p>

            {/* Tool call */}
            <div className="mt-3 border-l border-zinc-800 pl-4">
              <p className="text-zinc-200">
                <span className="text-cyan-400">●</span>{" "}
                <span className="font-bold text-white">{scenario.tool}</span>
                <span className="text-zinc-500">({scenario.toolArg})</span>
              </p>
              <ul className="mt-1 space-y-0.5 text-zinc-500">
                {scenario.output.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>

            {/* yieldOS verdict line */}
            <p
              className={`mt-3 flex items-center gap-2 ${
                scenario.verdict.kind === "blocked"
                  ? "text-rose-400"
                  : "text-emerald-400"
              }`}
            >
              <span className="font-bold">
                {scenario.verdict.kind === "blocked" ? "−" : "+"}
              </span>
              <span className="text-zinc-600">│</span>
              <span aria-hidden>🛡</span>
              <span>{scenario.verdict.text}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
