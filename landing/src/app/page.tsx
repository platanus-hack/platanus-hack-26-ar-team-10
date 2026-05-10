import { AgentsInstallButton } from "@/components/agents-install-button";
import { DefenseLayers } from "@/components/defense-layers";
import { ExternalDefenseTerminal } from "@/components/external-defense-terminal";
import { HeroGridAccents } from "@/components/hero-grid-accents";
import { InstallCommandPill } from "@/components/install-command-pill";
import { MotionReveal } from "@/components/motion-reveal";
import { OracleBenchmarks } from "@/components/oracle-benchmarks";
import { ScrollAwareHeader } from "@/components/scroll-aware-header";
import { ViewReadmeButton } from "@/components/view-readme-button";

const installCommand =
  "curl -fsSLO https://github.com/yieldos/yieldos/releases/download/yieldos--v0.12.0/install.sh && curl -fsSLO https://github.com/yieldos/yieldos/releases/download/yieldos--v0.12.0/checksums.txt && shasum -a 256 -c checksums.txt --ignore-missing && sh install.sh";
const repoUrl =
  "https://github.com/yieldos/yieldos";
const readmeUrl = `${repoUrl}#readme`;
const heroTitle = "Unlock safe coding for technical and non-technical talent";

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
                yieldOS sits between your AI coding agent and your project. It blocks policy-covered risky actions before sensitive steps, verifies selected fixes with scoped oracle contracts, and escalates uncovered cases instead of trusting the AI&rsquo;s opinion.
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
        id="external-attacks"
        className="pitch-section bg-[#0a0a0c] text-white"
      >
        <div className="pitch-shell mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8 lg:py-24">
          <div className="max-w-2xl">
            <MotionReveal>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-orange-400 sm:text-[11px]">
                External defense
              </p>
              <h2 className="mt-3 text-balance text-3xl font-semibold leading-[1.08] tracking-tight text-white sm:mt-4 sm:text-4xl md:text-5xl lg:text-[3.4rem] xl:text-6xl">
                Live in your editor.
              </h2>
            </MotionReveal>

            <MotionReveal delay={0.05}>
              <p className="mt-5 text-[15px] leading-[1.65] text-zinc-400 sm:mt-6 sm:text-base sm:leading-7 lg:text-lg lg:leading-8">
                Every risky action your AI agent tries gets intercepted before
                it touches your repo. Here&rsquo;s what you actually see.
              </p>
            </MotionReveal>
          </div>

          <MotionReveal className="mt-8 sm:mt-12" delay={0.1} y={18}>
            <ExternalDefenseTerminal />
          </MotionReveal>
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
                Internal defense · benchmarks
              </p>
              <h2 className="mt-3 text-balance text-3xl font-semibold leading-[1.08] tracking-tight text-zinc-950 sm:mt-4 sm:text-4xl md:text-5xl lg:text-[3.4rem] xl:text-6xl">
                Agent vs oracle.
              </h2>
            </MotionReveal>

            <MotionReveal delay={0.05}>
              <p className="mt-5 text-[15px] leading-[1.65] text-zinc-600 sm:mt-6 sm:text-base sm:leading-7 lg:text-lg lg:leading-8">
                Same security checks, two routing paths:{" "}
                <strong className="font-semibold text-zinc-950">
                  Claude Opus 4.7
                </strong>{" "}
                review candidates vs the{" "}
                <strong className="font-semibold text-zinc-950">
                  Oracle
                </strong>{" "}
                running deterministic rules. The current numbers are local-review
                evidence, not provider billing proof.
              </p>
            </MotionReveal>
          </div>

          <MotionReveal className="mt-8 sm:mt-12" delay={0.1} y={18}>
            <OracleBenchmarks />
          </MotionReveal>

          <MotionReveal className="mt-6 sm:mt-8" delay={0.15}>
            <p className="max-w-3xl text-xs leading-5 text-zinc-500 sm:text-[13px] sm:leading-6">
              Time is wall-clock latency per check. Cost is an assumption-based
              routing estimate from the local-review reports. The oracle path
              does not call a model for deterministic checks.
            </p>
          </MotionReveal>
        </div>
      </section>

      <footer className="theme-surface-light border-t border-zinc-200/80">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8 lg:py-14">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-[1fr_auto] sm:items-end sm:gap-10">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-500 sm:text-[11px]">
                Security suite for your AI agent
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-zinc-950 sm:text-4xl">
                yieldOS
              </p>
              <p className="mt-3 max-w-md text-sm leading-6 text-zinc-600 sm:text-base sm:leading-7">
                Deterministic checks before risky changes touch your repo. The
                model can propose. The oracle decides.
              </p>
            </div>
            <nav
              aria-label="Footer"
              className="flex flex-wrap items-center gap-x-6 gap-y-3 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500 sm:text-xs"
            >
              <a
                href={repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-zinc-950"
              >
                GitHub
              </a>
              <a
                href={readmeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-zinc-950"
              >
                README
              </a>
              <a
                href="#hero"
                className="transition-colors hover:text-zinc-950"
              >
                Top
              </a>
              <span aria-label="License">MIT</span>
            </nav>
          </div>
          <div className="mt-10 flex flex-col gap-2 border-t border-zinc-200/80 pt-6 font-mono text-[11px] text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:text-xs">
            <p>© 2026 yieldOS · Oracle-driven security harness</p>
            <p>Local-first security contracts for coding agents</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
