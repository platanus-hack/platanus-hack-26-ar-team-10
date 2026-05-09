"use client";

import { motion, useReducedMotion } from "motion/react";

const surfaces = ["npm", "MCP", "Skills", "AGENTS.md", "curl | sh"];

const flows = [
  {
    label: "Denied path",
    command: "npm install colors",
    candidate: "denylist package",
    decision: "denylist-match",
    verdict: "Block",
    detail: "before install runs",
    tone: "denied",
  },
  {
    label: "Approved path",
    command: "npm install nanoid",
    candidate: "approved package",
    decision: "allowlist-match",
    verdict: "Allow",
    detail: "safe to continue",
    tone: "allowed",
  },
];

export function AnimatedSecurityMockup() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className="gate-frame relative min-w-0 rounded-lg border border-white/10 bg-white/[0.035] p-2 sm:p-3"
      initial={false}
      animate={reduceMotion ? undefined : { opacity: 1, y: [0, -3, 0] }}
      transition={{
        duration: 7,
        repeat: Infinity,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <div className="gate-shell relative overflow-hidden rounded-md border border-white/10 bg-[#141416]">
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5 sm:px-4 sm:py-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            Gate timeline
          </span>
          <span className="rounded border border-[rgba(232,255,0,0.28)] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--acid)] sm:text-[10px]">
            before execution
          </span>
        </div>

        <div className="p-3 sm:p-5">
          <div className="gate-surface-cloud mb-4 flex flex-wrap gap-2 sm:mb-6">
            {surfaces.map((surface, index) => (
              <motion.span
                key={surface}
                className="gate-surface rounded border border-white/10 bg-white/[0.035] px-2.5 py-1 font-mono text-[10px] text-zinc-400"
                initial={false}
                animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                transition={{
                  duration: 0.44,
                  delay: 0.16 + index * 0.05,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                {surface}
              </motion.span>
            ))}
          </div>

          <div className="gate-flow-stack grid gap-3">
            {flows.map((flow, index) => (
              <motion.article
                key={flow.label}
                className={`gate-flow is-${flow.tone} grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_0.72fr] sm:gap-3 sm:p-4`}
                initial={false}
                animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                transition={{
                  duration: 0.52,
                  delay: 0.2 + index * 0.12,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <div className="gate-step gate-step-call rounded border border-white/10 bg-white/[0.035] p-3">
                  <p className="gate-step-kicker">{flow.label}</p>
                  <p className="mt-4 font-mono text-sm text-zinc-100">
                    {flow.command}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-zinc-500">
                    {flow.candidate}
                  </p>
                </div>

                <div className="gate-step gate-step-policy rounded border border-[rgba(232,255,0,0.24)] bg-[rgba(232,255,0,0.04)] p-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                    PreToolUse gate
                  </p>
                  <p className="mt-4 font-mono text-sm text-[var(--acid)]">
                    {flow.decision}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-zinc-500">
                    deterministic policy
                  </p>
                </div>

                <div className="gate-step gate-step-verdict rounded border p-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                    Verdict
                  </p>
                  <h3 className="mt-4 text-2xl font-semibold leading-none text-white">
                    {flow.verdict}
                  </h3>
                  <p className="mt-2 text-xs leading-5 text-zinc-500">
                    {flow.detail}
                  </p>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
