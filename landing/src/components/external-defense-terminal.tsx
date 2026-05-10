import Image from "next/image";

export function ExternalDefenseTerminal() {
  return (
    <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-xl border border-zinc-800 bg-[#0a0a0c] shadow-[0_24px_60px_-32px_rgba(0,0,0,0.7)]">
      {/* Mac title bar */}
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-[#1a1a1d] px-3 py-2.5">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        <span className="ml-3 truncate font-mono text-[11px] text-zinc-400">
          mauro@local — ~/Desktop/tensorflow-demo
        </span>
      </div>

      {/* Terminal content */}
      <div className="p-3 font-mono text-[11px] leading-5 text-zinc-300 sm:p-4 sm:text-[12px] sm:leading-6">
        {/* Welcome frame (orange notch border) */}
        <div className="relative mt-2 rounded-lg border border-orange-500/45 px-3 pb-3 pt-4 sm:px-4 sm:pb-4 sm:pt-5">
          <div className="absolute left-3 top-0 -translate-y-1/2 bg-[#0a0a0c] px-2 text-[10px] uppercase tracking-[0.18em] text-orange-400">
            Claude Code v2.1.111
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1.05fr]">
            <div>
              <p className="text-center font-semibold text-white">
                Welcome back, Mauro!
              </p>
              <div className="mt-2 flex justify-center">
                <Image
                  src="/logos/claude-code.png"
                  alt="Claude Code"
                  width={48}
                  height={48}
                  className="block"
                  priority
                />
              </div>
              <p className="mt-3 text-zinc-400">
                <span className="text-white">Opus 4.7 (1M context)</span> ·
                API Usage Billing
              </p>
              <p className="text-zinc-500">· Mauro&rsquo;s Individual Org</p>
              <p className="text-zinc-500">~/Desktop/tensorflow-demo</p>
            </div>

            <div className="border-zinc-800 sm:border-l sm:pl-4">
              <p className="text-orange-400">Tips for getting started</p>
              <p className="mt-1 text-zinc-200">
                Run <span className="text-white">/init</span> to create a{" "}
                <span className="text-white">CLAUDE.md</span> file with instr…
              </p>
              <p className="mt-3 text-orange-400">Recent activity</p>
              <p className="mt-1 text-zinc-500">No recent activity</p>
            </div>
          </div>
        </div>

        {/* Prompt bar */}
        <div className="mt-3 rounded-md bg-zinc-900/80 px-3 py-1.5 sm:mt-4">
          <p>
            <span className="text-zinc-500">›</span>{" "}
            <span className="text-zinc-100">install pandas</span>
          </p>
        </div>

        {/* Bash tool call */}
        <p className="mt-3">
          <span className="text-emerald-400">●</span>{" "}
          <span className="font-bold text-white">Bash</span>
          <span className="text-zinc-500">(pip install pandas)</span>
        </p>

        {/* Pipe-indented output */}
        <div className="mt-1 pl-3">
          <p className="text-zinc-400">
            <span className="text-zinc-700">│</span>{" "}
            <span className="break-words">
              Requirement already satisfied: pandas (2.2.3) + 5 deps
            </span>
          </p>
          <p className="text-zinc-500">
            <span className="text-zinc-700">└</span>{" "}
            <span>Allowed by auto mode classifier</span>
          </p>
        </div>

        {/* Agent summary */}
        <p className="mt-3 text-zinc-200">
          <span className="text-emerald-400">●</span>{" "}
          pandas is already installed (v2.2.3) at{" "}
          <span style={{ color: "rgb(120, 153, 255)" }}>/opt/anaconda3.</span>
        </p>

        {/* yieldOS validation line */}
        <p className="mt-3 flex flex-wrap items-center gap-2 text-emerald-400">
          <span className="font-bold">+</span>
          <span className="text-zinc-700">│</span>
          <span aria-hidden>🛡</span>
          <span>yieldOS · Validated · allowlist</span>
        </p>
      </div>
    </div>
  );
}
