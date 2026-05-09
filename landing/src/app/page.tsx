import { AnimatedDemoFlow } from "@/components/animated-demo-flow";
import { AnimatedDemoStory } from "@/components/animated-demo-story";
import { CopyCommandButton } from "@/components/copy-command-button";
import { MotionReveal } from "@/components/motion-reveal";
import { ScrollAwareHeader } from "@/components/scroll-aware-header";
import { ScrollProgress } from "@/components/scroll-progress";
import { TerminalInstallCommand } from "@/components/terminal-install-command";
import { TypewriterHeroTitle } from "@/components/typewriter-hero-title";

const installCommand =
  "claude plugin marketplace add /path/to/vibeOS\nclaude plugin install yieldos@yieldos-marketplace";
const heroTitle = "Unlock coding for non technical talent";

const gatedVectors = [
  { title: "Packages", detail: "9 managers." },
  { title: "Skills", detail: "Approved instructions." },
  { title: "MCPs", detail: "Scoped tools." },
  { title: "Instructions", detail: "AGENTS.md / CLAUDE.md." },
  { title: "Vendoring", detail: "Block clone." },
  { title: "Binaries", detail: "Block curl | sh." },
  { title: "Manifests", detail: "Pass data." },
];

const policySteps = [
  { step: "01", title: "Native", copy: "Prefer platform APIs." },
  { step: "02", title: "Allow", copy: "Curated versions pass." },
  { step: "03", title: "Deny", copy: "Known bad stops." },
  { step: "04", title: "Exotic", copy: "Binaries and vendoring block." },
  { step: "05", title: "Analyze", copy: "Rewrite tiny. Block risky." },
];

const auditItems = [
  {
    label: "Append-only log",
    value: "security/dependency-events.md",
  },
  {
    label: "Self-defense",
    value: "agent cannot edit protected yieldOS files",
  },
  {
    label: "Fresh policy",
    value: "online, runtime cache, shipped fallback",
  },
];

const proofStats = [
  { value: "122/122", label: "tests passing" },
  { value: "7", label: "gated vectors" },
  { value: "9", label: "package managers detected" },
  { value: "1163", label: "benchmark cases" },
];

export default function Home() {
  return (
    <main className="snap-deck min-h-dvh bg-[#0e0e10] text-zinc-950">
      <ScrollAwareHeader />
      <ScrollProgress />

      <section
        id="hero"
        className="pitch-section security-hero relative overflow-hidden bg-[#0e0e10] text-white"
      >
        <div className="pitch-shell mx-auto max-w-7xl px-5 py-7 sm:px-8">
          <div className="mx-auto flex min-w-0 max-w-5xl flex-col items-center text-center">
            <TypewriterHeroTitle
              text={heroTitle}
              lines={["Unlock coding for", "non technical talent"]}
              className="hero-title font-semibold leading-[0.92]"
              startDelayMs={900}
            />
            <MotionReveal delay={3.05} immediate y={12}>
              <p className="mx-auto mt-5 w-full max-w-[34ch] text-sm leading-6 text-zinc-400 sm:mt-7 sm:max-w-2xl sm:text-lg sm:leading-7">
                yieldOS checks what AI agents install, edit, and run before anything happens.
              </p>
            </MotionReveal>
            <MotionReveal
              className="mt-6 flex items-center justify-center sm:mt-8"
              delay={3.28}
              immediate
              y={14}
            >
              <TerminalInstallCommand command={installCommand} />
            </MotionReveal>
          </div>
        </div>
      </section>

      <section
        id="demo-flow"
        className="pitch-section bg-[#0e0e10] text-white"
      >
        <div className="pitch-shell mx-auto max-w-7xl px-5 py-7 sm:px-8">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[0.64fr_1.36fr] lg:items-end lg:gap-10">
            <MotionReveal>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 sm:text-[11px]">
                Decision demo
              </p>
              <h2 className="mt-3 max-w-md text-3xl font-semibold leading-tight text-balance sm:mt-5 sm:text-5xl">
                Before it runs.
              </h2>
            </MotionReveal>
            <AnimatedDemoStory />
          </div>

          <AnimatedDemoFlow />
        </div>
      </section>

      <section
        id="gated-vectors"
        className="pitch-section theme-surface-light border-y border-zinc-200/80"
      >
        <div className="pitch-shell mx-auto max-w-7xl px-5 py-7 sm:px-8">
          <div className="grid grid-cols-1 gap-7 lg:grid-cols-[0.74fr_1.26fr] lg:items-center lg:gap-12">
            <MotionReveal>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 sm:text-[11px]">
                What yieldOS gates
              </p>
              <h2 className="mt-4 max-w-xl text-4xl font-semibold leading-tight text-balance sm:text-6xl">
                Seven gated vectors.
              </h2>
            </MotionReveal>
            <div className="vector-grid grid grid-cols-1 gap-2 sm:grid-cols-2">
              {gatedVectors.map((vector, index) => (
                <MotionReveal key={vector.title} delay={index * 0.04} y={14}>
                  <article
                    className={`surface-scan-card vector-card min-h-28 rounded-lg border border-zinc-200 bg-white p-4 ${
                      index === 0 || index === 3 ? "is-dominant" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-medium text-zinc-950">
                        {vector.title}
                      </h3>
                      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-zinc-600">
                      {vector.detail}
                    </p>
                  </article>
                </MotionReveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        id="policy-flow"
        className="pitch-section theme-surface-smoke border-b border-zinc-200/80"
      >
        <div className="pitch-shell mx-auto max-w-7xl px-5 py-7 sm:px-8">
          <div className="grid grid-cols-1 gap-7 lg:grid-cols-[0.7fr_1.3fr] lg:items-center lg:gap-12">
            <MotionReveal>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 sm:text-[11px]">
                Five-check policy flow
              </p>
              <h2 className="mt-4 max-w-lg text-4xl font-semibold leading-tight text-balance sm:text-6xl">
                Five checks. No prompts.
              </h2>
            </MotionReveal>
            <div className="policy-path review-path relative rounded-lg border border-zinc-200/80 bg-white/80">
              {policySteps.map((item, index) => (
                <MotionReveal key={item.step} delay={index * 0.05} y={18}>
                  <article className="relative grid gap-3 border-b border-zinc-200 p-4 last:border-b-0 sm:grid-cols-4 sm:p-5">
                    <p className="review-step font-mono text-xs uppercase tracking-[0.2em] text-zinc-400">
                      {item.step}
                    </p>
                    <div className="sm:col-span-3">
                      <h3 className="text-base font-medium sm:text-lg">
                        {item.title}
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-zinc-600">
                        {item.copy}
                      </p>
                    </div>
                  </article>
                </MotionReveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        id="audit-trail"
        className="pitch-section theme-surface-light"
      >
        <div className="pitch-shell mx-auto max-w-7xl px-5 py-7 sm:px-8">
          <div className="grid grid-cols-1 gap-7 lg:grid-cols-[0.76fr_1.24fr] lg:items-center lg:gap-12">
            <MotionReveal>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 sm:text-[11px]">
                Audit + self-defense
              </p>
              <h2 className="mt-4 max-w-lg text-4xl font-semibold leading-tight text-balance sm:text-6xl">
                Logs. Cache. Self-defense.
              </h2>
            </MotionReveal>
            <div className="incident-ledger divide-y divide-zinc-200/80 rounded-lg border border-zinc-200/80 bg-white/85">
              {auditItems.map((item, index) => (
                <MotionReveal key={item.label} delay={index * 0.06} y={18}>
                  <article className="log-row grid gap-3 p-4 sm:grid-cols-[150px_1fr] sm:p-5">
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                      {item.label}
                    </p>
                    <p className="text-sm leading-6 text-zinc-700 sm:text-base">
                      {item.value}
                    </p>
                  </article>
                </MotionReveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        id="proof"
        className="pitch-section theme-surface-smoke border-y border-zinc-200/80"
      >
        <div className="pitch-shell mx-auto max-w-7xl px-5 py-7 sm:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[0.68fr_1.32fr] lg:items-center lg:gap-12">
            <MotionReveal>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 sm:text-[11px]">
                Prototype proof
              </p>
              <h2 className="mt-4 max-w-lg text-4xl font-semibold leading-tight text-balance sm:text-6xl">
                Working, not hypothetical.
              </h2>
            </MotionReveal>
            <div className="proof-grid grid grid-cols-2 gap-3">
              {proofStats.map((stat, index) => (
                <MotionReveal key={stat.label} delay={index * 0.05} y={16}>
                  <article className="metric-tile proof-card rounded-lg border border-zinc-200/80 bg-white/80 p-4 sm:p-6">
                    <p className="font-mono text-3xl font-semibold leading-none tracking-tight text-zinc-950 sm:text-5xl">
                      {stat.value}
                    </p>
                    <p className="mt-3 text-sm leading-5 text-zinc-500">
                      {stat.label}
                    </p>
                  </article>
                </MotionReveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        id="final-cta"
        className="pitch-section theme-surface-light"
      >
        <div className="pitch-shell mx-auto max-w-7xl px-5 py-7 sm:px-8">
          <div className="audit-stamp relative overflow-hidden rounded-lg border border-zinc-200 bg-[#0e0e10] px-5 py-14 text-center text-white sm:px-8">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 sm:text-[11px]">
              No silent installs.
            </p>
            <h2 className="mx-auto mt-5 max-w-2xl text-4xl font-semibold leading-tight text-balance sm:text-6xl">
              Give agents a boundary they cannot bypass.
            </h2>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <CopyCommandButton
                command={installCommand}
                label="Install yieldOS"
                variant="light"
              />
              <a
                href="#demo-flow"
                className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-white/[0.06] px-4 text-sm font-medium text-white transition hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e0e10] active:translate-y-px"
              >
                View decision demo
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="theme-surface-light border-t border-zinc-200/80 py-5">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 px-5 font-mono text-xs text-zinc-500 sm:flex-row sm:px-8">
          <p>yieldOS</p>
          <p>Safe coding for non technical talent</p>
        </div>
      </footer>
    </main>
  );
}
