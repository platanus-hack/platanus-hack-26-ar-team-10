"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type Verdict = {
  kind: "blocked" | "allowed";
  text: string;
};

type Scenario = {
  id: string;
  prompt: string;
  // If set, render a Bash tool block; otherwise the output is generic.
  bashArg?: string;
  blockTitle: string; // e.g. "Bash" or "yieldOS"
  outputLines: string[];
  classifierFooter: string;
  agentSummary: string;
  agentSummaryHighlight?: { text: string; color: string };
  verdict: Verdict;
};

const scenarios: Scenario[] = [
  {
    id: "pandas",
    prompt: "install pandas",
    bashArg: "pip install pandas",
    blockTitle: "Bash",
    outputLines: ["Requirement already satisfied: pandas (2.2.3) + 5 deps"],
    classifierFooter: "Allowed by auto mode classifier",
    agentSummary: "pandas is already installed (v2.2.3) at",
    agentSummaryHighlight: {
      text: " /opt/anaconda3.",
      color: "rgb(120, 153, 255)",
    },
    verdict: {
      kind: "allowed",
      text: "yieldOS · Validated · allowlist",
    },
  },
  {
    id: "api-key",
    prompt: "this is my api key [redacted-demo-token]",
    blockTitle: "yieldOS",
    bashArg: "credentials scanner",
    outputLines: [
      "pattern detected: openai-key x1",
      "value never written to logs",
      "rotate this key now — assume it leaked the moment it was pasted",
    ],
    classifierFooter: "Blocked by credentials scanner",
    agentSummary:
      "I won't reuse this value. Rotate the key and move it to .env before retrying.",
    verdict: {
      kind: "blocked",
      text: "yieldOS · Blocked · credential exposed in prompt",
    },
  },
  {
    id: "flatmap-stream",
    prompt: "install flatmap-stream",
    bashArg: "npm install flatmap-stream",
    blockTitle: "Bash",
    outputLines: [
      "request blocked before any network call",
      "match: event-stream supply-chain payload (Nov 2018)",
    ],
    classifierFooter: "Blocked by denylist classifier",
    agentSummary:
      "Won't install flatmap-stream — it's a known malicious package.",
    verdict: {
      kind: "blocked",
      text: "yieldOS · Blocked · denylist match",
    },
  },
];

const ROTATE_MS = 7000;

export function ExternalDefenseTerminal() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setIdx((i) => (i + 1) % scenarios.length);
    }, ROTATE_MS);
    return () => window.clearInterval(interval);
  }, []);

  const scenario = scenarios[idx];

  return (
    <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-xl border border-zinc-800 bg-[#0a0a0c] shadow-[0_24px_60px_-32px_rgba(0,0,0,0.7)]">
      {/* Mac title bar */}
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-[#1a1a1d] px-3 py-2.5">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        <span className="ml-3 truncate font-mono text-[11px] text-zinc-400">
          mauro@local — ~/code/checkout-api
        </span>
      </div>

      {/* Terminal content */}
      <div className="p-3 font-mono text-[11px] leading-5 text-zinc-300 sm:p-4 sm:text-[12px] sm:leading-6">
        {/* Welcome frame (orange notch border) — STATIC */}
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
              <p className="text-zinc-500">~/code/checkout-api</p>
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

        {/* Rotating scenario body */}
        <div key={scenario.id} className="terminal-scenario">
          {/* Prompt bar */}
          <div className="mt-3 rounded-md bg-zinc-900/80 px-3 py-1.5 sm:mt-4">
            <p className="break-all">
              <span className="text-zinc-500">›</span>{" "}
              <span className="text-zinc-100">{scenario.prompt}</span>
            </p>
          </div>

          {/* Tool call header */}
          <p className="mt-3">
            <span
              className={
                scenario.verdict.kind === "blocked"
                  ? "text-rose-400"
                  : "text-emerald-400"
              }
            >
              ●
            </span>{" "}
            <span className="font-bold text-white">{scenario.blockTitle}</span>
            {scenario.bashArg ? (
              <span className="text-zinc-500">({scenario.bashArg})</span>
            ) : null}
          </p>

          {/* Output */}
          <div className="mt-1 pl-3">
            {scenario.outputLines.map((line) => (
              <p key={line} className="text-zinc-400">
                <span className="text-zinc-700">│</span>{" "}
                <span className="break-words">{line}</span>
              </p>
            ))}
            <p className="text-zinc-500">
              <span className="text-zinc-700">└</span>{" "}
              <span>{scenario.classifierFooter}</span>
            </p>
          </div>

          {/* Agent summary */}
          <p className="mt-3 text-zinc-200">
            <span
              className={
                scenario.verdict.kind === "blocked"
                  ? "text-rose-400"
                  : "text-emerald-400"
              }
            >
              ●
            </span>{" "}
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

        {/* Scenario indicator dots */}
        <div
          aria-hidden
          className="mt-4 flex items-center justify-center gap-1.5 sm:mt-5"
        >
          {scenarios.map((s, i) => (
            <span
              key={s.id}
              className="h-1.5 rounded-full transition-all duration-500"
              style={{
                width: i === idx ? 22 : 6,
                background: i === idx ? "rgb(244, 134, 65)" : "rgb(63, 63, 70)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
