import { AgentPackSection } from "@/components/agent-pack-section";
import { AgentsInstallButton } from "@/components/agents-install-button";
import { CopyCommandButton } from "@/components/copy-command-button";
import { DefenseLayers } from "@/components/defense-layers";
import { HeroGridAccents } from "@/components/hero-grid-accents";
import { InstallCommandPill } from "@/components/install-command-pill";
import { MotionReveal } from "@/components/motion-reveal";
import { OracleBenchmarks } from "@/components/oracle-benchmarks";
import { OracleDemoFlow } from "@/components/oracle-demo-flow";
import { ScrollAwareHeader } from "@/components/scroll-aware-header";
import { ViewReadmeButton } from "@/components/view-readme-button";

const installCommand =
  "curl -fsSL https://raw.githubusercontent.com/platanus-hack/platanus-hack-26-ar-team-10/main/install.sh | sh";
const readmeUrl =
  "https://github.com/platanus-hack/platanus-hack-26-ar-team-10#readme";
const heroTitle = "Unlock safe coding for technical and non-technical talent";

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
  { value: "0", label: "CI model calls in verifier" },
  { value: "3", label: "oracle result states" },
  { value: "2", label: "CDSC proof sides" },
  { value: "7", label: "gated vectors" },
];

export default function Home() {
  return (
    <main className="snap-deck min-h-dvh bg-[#0e0e10] text-zinc-950">
      <ScrollAwareHeader />

      <section
        id="hero"
        className="pitch-section security-hero relative overflow-hidden bg-[#fafafa] text-zinc-950"
      >
        <HeroGridAccents />
        <div className="pitch-shell relative z-10 mx-auto w-full max-w-7xl px-4 py-7 sm:px-6">
          <div className="ml-0 mr-auto flex max-w-3xl flex-col items-start text-left">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-500 sm:text-[11px]">
              Security suite for your AI agent
            </p>
            <h1 className="hero-title mt-3 text-left font-semibold leading-[0.95] tracking-[-0.025em] text-zinc-950 sm:mt-4">
              {heroTitle}
            </h1>
            <MotionReveal className="self-stretch text-left" delay={0.05} immediate y={12}>
              <p className="mt-5 w-full max-w-[58ch] text-left text-base leading-7 text-zinc-600 sm:mt-6 sm:text-lg sm:leading-8">
                yieldOS sits between your AI coding agent and your project. It automatically blocks malicious packages, prompt injections, and unsafe code changes before they reach your repo — with deterministic checks, not the AI&rsquo;s opinion.
              </p>
            </MotionReveal>
            <MotionReveal
              className="mt-7 flex flex-col items-start gap-3 self-start sm:mt-8 sm:flex-row sm:items-center"
              delay={0.12}
              immediate
              y={14}
            >
              <AgentsInstallButton command={installCommand} />
              <ViewReadmeButton href={readmeUrl} />
            </MotionReveal>
            <MotionReveal
              className="mt-4 flex items-start self-start sm:mt-5"
              delay={0.18}
              immediate
              y={10}
            >
              <InstallCommandPill command={installCommand} />
            </MotionReveal>
          </div>
        </div>
      </section>

      <section
        id="defenses"
        className="pitch-section theme-surface-light border-y border-zinc-200/80"
      >
        <div className="pitch-shell mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8 lg:py-24">
          <div className="grid grid-cols-1 gap-8 sm:gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-16 xl:gap-20">
            <div className="w-full max-w-xl">
              <MotionReveal>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 sm:text-[11px]">
                  How yieldOS protects you
                </p>
                <h2 className="mt-3 text-balance text-3xl font-semibold leading-[1.08] tracking-tight text-zinc-950 sm:mt-4 sm:text-4xl md:text-5xl lg:text-[3.4rem] xl:text-6xl">
                  Two layers of defense, one job: keep your project safe.
                </h2>
              </MotionReveal>

              <MotionReveal delay={0.05}>
                <div className="mt-6 space-y-4 text-[15px] leading-[1.65] text-zinc-600 sm:mt-8 sm:space-y-5 sm:text-base sm:leading-7 lg:text-lg lg:leading-8">
                  <p>
                    yieldOS works on two fronts at once: what comes IN to your
                    project, and what goes OUT every commit.
                  </p>
                  <p>
                    <strong className="font-semibold text-zinc-950">
                      External defense.
                    </strong>{" "}
                    The Claude Code plugin runs live in your editor and
                    intercepts every package, command, file edit, MCP, or skill
                    the agent tries &mdash; before it touches your repo.
                  </p>
                  <p>
                    <strong className="font-semibold text-zinc-950">
                      Internal defense.
                    </strong>{" "}
                    Before each commit, the oracle scans your code for missing
                    auth, leaked secrets, and unsafe edits. If a check fails, the
                    commit is blocked with proof.
                  </p>
                </div>
              </MotionReveal>
            </div>

            <MotionReveal delay={0.1} y={20}>
              <DefenseLayers />
            </MotionReveal>
          </div>
        </div>
      </section>

      <section
        id="benchmarks"
        className="pitch-section theme-surface-smoke border-b border-zinc-200/80"
      >
        <div className="pitch-shell mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8 lg:py-24">
          <div className="max-w-2xl">
            <MotionReveal>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 sm:text-[11px]">
                Benchmarks
              </p>
              <h2 className="mt-3 text-balance text-3xl font-semibold leading-[1.08] tracking-tight text-zinc-950 sm:mt-4 sm:text-4xl md:text-5xl lg:text-[3.4rem] xl:text-6xl">
                Agent vs oracle.
              </h2>
            </MotionReveal>

            <MotionReveal delay={0.05}>
              <p className="mt-5 text-[15px] leading-[1.65] text-zinc-600 sm:mt-6 sm:text-base sm:leading-7 lg:text-lg lg:leading-8">
                Same security checks, two ways:{" "}
                <strong className="font-semibold text-zinc-950">
                  Claude Opus 4.7
                </strong>{" "}
                reviewing your changes vs the{" "}
                <strong className="font-semibold text-zinc-950">
                  Oracle
                </strong>{" "}
                running deterministic rules. Same task, very different bill.
              </p>
            </MotionReveal>
          </div>

          <MotionReveal className="mt-8 sm:mt-12" delay={0.1} y={18}>
            <OracleBenchmarks />
          </MotionReveal>

          <MotionReveal className="mt-6 sm:mt-8" delay={0.15}>
            <p className="max-w-3xl text-xs leading-5 text-zinc-500 sm:text-[13px] sm:leading-6">
              Time is wall-clock latency per check. Cost is the model spend
              per risky review. The oracle never calls a model &mdash; that&rsquo;s
              where every saved second and every saved cent comes from.
            </p>
          </MotionReveal>
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
                Contract proof demo
              </p>
              <h2 className="mt-3 max-w-lg text-3xl font-semibold leading-tight text-balance sm:mt-5 sm:text-5xl">
                Counterexample killed. Fix proven.
              </h2>
            </MotionReveal>
          </div>

          <div className="mt-6">
            <OracleDemoFlow />
          </div>
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

      <AgentPackSection />

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
                Prototype contract
              </p>
              <h2 className="mt-4 max-w-lg text-4xl font-semibold leading-tight text-balance sm:text-6xl">
                Baseline fail. Fixed pass.
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
              No unproven fixes.
            </p>
            <h2 className="mx-auto mt-5 max-w-2xl text-4xl font-semibold leading-tight text-balance sm:text-6xl">
              Give agents a contract boundary.
            </h2>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <CopyCommandButton
                command={installCommand}
                label="Install yieldOS"
                variant="light"
              />
              <a
                href="/oracle-demo"
                className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-white/[0.06] px-4 text-sm font-medium text-white transition hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e0e10] active:translate-y-px"
              >
                View contract demo
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="theme-surface-light border-t border-zinc-200/80 py-5">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 px-5 font-mono text-xs text-zinc-500 sm:flex-row sm:px-8">
          <p>yieldOS</p>
          <p>Oracle-driven security harness</p>
        </div>
      </footer>
    </main>
  );
}
