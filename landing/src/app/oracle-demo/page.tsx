import { OracleDemoFlow } from "@/components/oracle-demo-flow";
import Link from "next/link";

export default function OracleDemoPage() {
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
            href="/agent-packs"
            className="rounded-md border border-white/15 bg-white/[0.06] px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
          >
            Agent packs
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="grid grid-cols-1 gap-7 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 sm:text-[11px]">
              Contract proof demo
            </p>
            <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight text-balance sm:text-6xl">
              Contract. Counterexample. Proof of fix.
            </h1>
          </div>
          <div className="max-w-2xl">
            <p className="text-sm leading-6 text-zinc-600 sm:text-base sm:leading-7">
              A vulnerable admin route is accepted only after a deterministic
              counterexample proves the baseline violated the contract and the
              fixed runtime passes the same replay.
            </p>
            <p className="mt-4 rounded-md border border-zinc-300 bg-white px-4 py-3 font-mono text-xs leading-5 text-zinc-700">
              This proves this route and replay, not the whole repo.
            </p>
          </div>
        </div>

        <div className="mt-8">
          <OracleDemoFlow />
        </div>
      </section>
    </main>
  );
}
