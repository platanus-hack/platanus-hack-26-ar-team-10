import { AgentPackBuilder } from "@/components/agent-pack-builder";
import Link from "next/link";

export default function AgentPacksPage() {
  return (
    <main className="min-h-dvh bg-[#f4f3ef] text-zinc-950">
      <header className="border-b border-zinc-200 bg-[#0e0e10] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link
            href="/"
            className="rounded-sm text-lg font-semibold leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
          >
            yieldOS
          </Link>
          <Link
            href="/#agent-packs"
            className="rounded-md border border-white/15 bg-white/[0.06] px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
          >
            Pack overview
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="grid grid-cols-1 gap-7 lg:grid-cols-[0.7fr_1.3fr] lg:items-end">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 sm:text-[11px]">
              Team agent packs
            </p>
            <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-tight text-balance sm:text-6xl">
              Build an agent pack.
            </h1>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base sm:leading-7">
            Select the agents, skills, MCPs, safety profiles, playbooks, and
            approved oracles your team wants. The download is only a source
            manifest; the yieldOS CLI validates it before writing repo files,
            and oracles run through yieldos-oracle, hooks, or CI.
          </p>
        </div>

        <div className="mt-8">
          <AgentPackBuilder />
        </div>
      </section>
    </main>
  );
}
