import { CopyCommandButton } from "@/components/copy-command-button";
import { MotionReveal } from "@/components/motion-reveal";
import Link from "next/link";

const previewCommand = "yieldos-pack preview --pack yield.agent-pack.yaml";

const packOutputs = [
  ["Source", "yield.agent-pack.yaml"],
  ["Instructions", "AGENTS.md + CLAUDE.md"],
  ["Adapters", ".cursor + .github + .windsurf"],
  ["Skills", ".claude + .agents + .cursor + .windsurf"],
  ["Evidence", "yield.agent-pack.lock.json"],
  ["Report", ".yield/pack-report.md"],
];

const targetAgents = [
  ["Claude Code", "enforced via hooks"],
  ["Codex", "instructions + approvals"],
  ["Cursor", "guidance-only rules"],
  ["Copilot", "repository instructions"],
  ["Windsurf", "rules + skills guidance"],
];

export function AgentPackSection() {
  return (
    <section
      id="agent-packs"
      className="pitch-section border-b border-zinc-200 bg-[#f4f3ef]"
    >
      <div className="pitch-shell mx-auto max-w-7xl px-5 py-7 sm:px-8">
        <div className="grid grid-cols-1 gap-7 lg:grid-cols-[0.72fr_1.28fr] lg:items-center lg:gap-12">
          <MotionReveal>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 sm:text-[11px]">
              Team agent packs
            </p>
            <h2 className="mt-4 max-w-xl text-4xl font-semibold leading-tight text-balance sm:text-6xl">
              Package company rules once.
            </h2>
            <p className="mt-5 max-w-xl text-sm leading-6 text-zinc-600 sm:text-base sm:leading-7">
              Choose approved skills, MCPs, safety profiles, and playbooks.
              yieldOS compiles them into reviewable agent files and records what
              was generated and verified.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <CopyCommandButton
                command={previewCommand}
                label="Preview pack"
                variant="dark"
              />
              <Link
                href="/agent-packs"
                className="inline-flex h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-950 transition hover:border-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/30 active:translate-y-px"
              >
                Open builder
              </Link>
            </div>
          </MotionReveal>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[0.9fr_1.1fr]">
            <MotionReveal y={16}>
              <div className="rounded-lg border border-zinc-200 bg-white p-4 sm:p-5">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                  Pack compiler
                </p>
                <div className="mt-4 divide-y divide-zinc-200">
                  {packOutputs.map(([label, value]) => (
                    <div
                      key={label}
                      className="grid gap-2 py-3 text-sm sm:grid-cols-[108px_1fr]"
                    >
                      <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                        {label}
                      </span>
                      <code className="break-all font-mono text-zinc-800">
                        {value}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
            </MotionReveal>

            <MotionReveal delay={0.06} y={16}>
              <div className="rounded-lg border border-zinc-200 bg-[#0e0e10] p-4 text-white sm:p-5">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  Target agents
                </p>
                <div className="mt-4 grid grid-cols-1 gap-2">
                  {targetAgents.map(([agent, strength]) => (
                    <div
                      key={agent}
                      className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border border-white/10 bg-white/[0.055] px-3 py-2"
                    >
                      <span className="text-sm font-medium">{agent}</span>
                      <span className="rounded border border-[rgba(232,255,0,0.28)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#e8ff00]">
                        {strength}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-sm leading-6 text-zinc-400">
                  One reviewed source of truth. Strongest enforcement where the
                  host exposes hooks, CI, or managed policy controls.
                </p>
              </div>
            </MotionReveal>
          </div>
        </div>
      </div>
    </section>
  );
}
