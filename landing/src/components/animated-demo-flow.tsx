"use client";

import { motion, useReducedMotion } from "motion/react";

const decisions = [
  {
    command: "npm install colors",
    verdict: "denylist-match",
    result: "blocked",
    tone: "block",
  },
  {
    command: "npm install node-fetch",
    verdict: "native-suggest",
    result: "use fetch",
    tone: "native",
  },
  {
    command: "npm install clsx",
    verdict: "category-a-rewrite",
    result: "rewrite local",
    tone: "rewrite",
  },
  {
    command: "Write AGENTS.md",
    verdict: "injection-blocked",
    result: "blocked",
    tone: "block",
  },
];

const logLines = [
  "## Blocked Install",
  "- Type: library",
  "- Name: colors",
  "- Verdict: denylist-match",
  "",
  "## Rewritten Locally",
  "- Name: clsx",
  "- Path: src/lib/yieldos/clsx",
];

function toneClass(tone: string) {
  if (tone === "rewrite") {
    return "border-[rgba(232,255,0,0.34)] bg-[rgba(232,255,0,0.055)] text-[var(--acid)]";
  }
  if (tone === "native") {
    return "border-white/10 bg-white/[0.04] text-zinc-200";
  }
  return "border-red-300/20 bg-red-400/[0.055] text-red-100";
}

export function AnimatedDemoFlow() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className="demo-cinema mt-4 grid min-w-0 grid-cols-1 gap-2 sm:mt-6 sm:gap-3 lg:grid-cols-[1.18fr_0.82fr]"
      initial={reduceMotion ? false : { opacity: 0, y: 24 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-15% 0px -10% 0px" }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="rounded-lg border border-white/10 bg-white/[0.04] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-3">
        <div className="relative overflow-hidden rounded-md border border-white/10 bg-[#151517]">
          <div className="scan-sweep" aria-hidden="true" />
          <div className="grid grid-cols-[1fr_auto] border-b border-white/10 px-3 py-2.5 font-mono text-xs text-zinc-500 sm:px-4 sm:py-3">
            <span>PreToolUse verdicts</span>
            <span className="hidden text-[var(--acid)] sm:inline">exit 0 / exit 2</span>
          </div>
          <div className="divide-y divide-white/10">
            {decisions.map((decision, index) => (
              <motion.article
                key={decision.command}
                className="decision-row grid grid-cols-[minmax(0,1fr)_124px] items-center gap-2 p-2.5 sm:grid-cols-[1fr_150px] sm:gap-3 sm:p-4 lg:grid-cols-[1.1fr_170px]"
                initial={reduceMotion ? false : { opacity: 0, x: -12 }}
                whileInView={reduceMotion ? undefined : { opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{
                  duration: 0.48,
                  delay: 0.12 + index * 0.08,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <div className="min-w-0">
                  <p className="break-words font-mono text-xs text-zinc-300 sm:text-sm">
                    {decision.command}
                  </p>
                  <p className="mt-1 hidden text-xs leading-5 text-zinc-500 sm:block sm:text-sm">
                    {decision.result}
                  </p>
                </div>
                <span
                  className={`verdict-token inline-flex h-7 items-center justify-center whitespace-nowrap rounded border px-1.5 font-mono text-[8px] uppercase tracking-normal sm:h-8 sm:px-2 sm:text-[10px] sm:tracking-[0.12em] ${toneClass(
                    decision.tone,
                  )}`}
                >
                  {decision.verdict}
                </span>
              </motion.article>
            ))}
          </div>
        </div>
      </div>

      <div className="hidden rounded-lg border border-white/10 bg-white/[0.04] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-3 lg:block">
        <div className="relative overflow-hidden rounded-md border border-white/10 bg-[#f4f3ef] text-zinc-950">
          <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--acid),transparent)]" />
          <div className="border-b border-zinc-200 px-3 py-2.5 font-mono text-xs text-zinc-500 sm:px-4 sm:py-3">
            audit trail
          </div>
          <pre className="audit-console max-w-full whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-5 text-zinc-700 sm:p-4 sm:text-[12px]">
            <code>{logLines.join("\n")}</code>
          </pre>
          <div className="border-t border-zinc-200 p-3 sm:p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500 sm:text-[11px]">
              Machine-readable stderr
            </p>
            <p className="mt-2 break-words rounded border border-zinc-200 bg-white px-3 py-2 font-mono text-[11px] leading-5 text-zinc-700 sm:text-[12px]">
              [yieldOS:verdict] category-a-rewrite
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
