import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

test("home page pivots to the yieldOS source-of-truth story", () => {
  const page = read("src/app/page.tsx");
  const agentPackSection = read("src/components/agent-pack-section.tsx");
  const oracleFlow = read("src/components/oracle-demo-flow.tsx");
  const agentsInstall = read("src/components/agents-install-button.tsx");
  const scrollAwareHeader = read("src/components/scroll-aware-header.tsx");
  const scrollProgress = read("src/components/scroll-progress.tsx");
  const source = [
    page,
    agentPackSection,
    oracleFlow,
    agentsInstall,
    scrollAwareHeader,
    scrollProgress,
  ].join("\n");

  [
    "yieldOS",
    "Unlock safe coding for technical and non-technical talent",
    "contracts, counterexamples, and proof-of-fix evidence",
    "Oracle-driven",
    "security harness",
    "oracle-driven security harness",
    "the model can propose, but the oracle decides",
    "Install yieldOS",
    "View contract demo",
    "curl -fsSL https://raw.githubusercontent.com/platanus-hack/platanus-hack-26-ar-team-10/main/install.sh | sh",
    "AgentsInstallButton",
    "copy install command",
    "AGENTS.md",
    "curl | sh",
    "Contract proof demo",
    "Counterexample killed. Fix proven.",
    "CONTRACT created",
    "REPLAY baseline got 200",
    "REPLAY fixed got 401",
    "security/dependency-events.md",
    "ScrollProgress",
    "ScrollAwareHeader",
    "Hero",
    "Demo",
    "Coverage",
    "Policy",
    "Packs",
    "Audit",
    "Proof",
    "FAIL missing-authz",
    "PASS scoped acceptance",
    "No unproven fixes.",
    "Give agents a contract boundary.",
  ].forEach((text) => {
    assert.ok(source.includes(text), `Expected landing source to include: ${text}`);
  });

  [
    "Packages",
    "Skills",
    "MCPs",
    "Instructions",
    "Vendoring",
    "Binaries",
    "Manifests",
    "Five-check policy flow",
    "Native",
    "Allow",
    "Deny",
    "Exotic",
    "Analyze",
    "0",
    "CI model calls in verifier",
    "3",
    "oracle result states",
    "2",
    "CDSC proof sides",
    "7",
    "Team agent packs",
    "Package company rules once.",
    "Choose approved skills, MCPs, safety profiles, playbooks, and",
    "oracles. Packs distribute company rules; run yieldos-oracle,",
    "installed hooks, or CI verification to execute checks.",
    "yield.agent-pack.yaml",
    "yield.agent-pack.lock.json",
    "code-audit-state + cdsc-proof",
    ".yield/pack-report.md",
    "Preview pack",
    "yieldos-pack preview --pack yield.agent-pack.yaml",
    "Target agents",
    "Claude Code",
    "Codex",
    "Cursor",
    "Copilot",
    "Windsurf",
    "enforced via hooks",
    "guidance",
  ].forEach((text) => {
    assert.ok(source.includes(text), `Expected yieldOS proof/capability copy: ${text}`);
  });

  [
    "hero",
    "demo-flow",
    "gated-vectors",
    "policy-flow",
    "agent-packs",
    "audit-trail",
    "proof",
    "final-cta",
  ].forEach((id) => {
    assert.ok(source.includes(`id="${id}"`), `Expected section id: ${id}`);
  });

  const demoIndex = page.indexOf('id="demo-flow"');
  const coverageIndex = page.indexOf('id="gated-vectors"');
  const policyIndex = page.indexOf('id="policy-flow"');
  assert.ok(demoIndex < coverageIndex, "Expected demo to appear after hero");
  assert.ok(coverageIndex < policyIndex, "Expected coverage before policy flow");

  [
    "npx anon scan",
    "Run anon",
    "How anon works",
    "Security for software built with AI agents.",
    "Agent PR",
    "anon scan",
    "patch preview",
    "pre-merge security guardrail",
    "Decision path",
    "SessionStart",
    "UserPromptSubmit",
    "PostToolUse",
    "Claude gate",
    "View demo",
    "Gate timeline",
    "Denied path",
    "Approved path",
    "PreToolUse gate",
    "allowlist-match",
    "npm install nanoid",
    "A security gate for AI agent installs.",
    "Claude Code tries to run something. yieldOS decides first.",
    "Working prototype",
    "AI supply-chain",
    "Live decision demo",
    "Verdict before execution.",
    "Tool call captured",
    "Candidate classified",
    "Policy checks run",
    "Verdict returned",
    "Machine-readable stderr",
    "Blocked Install",
    "Hash-approved agent instructions",
    "A security gate before your AI agent runs anything.",
    "AI agent actions, gated.",
    "Claude Code asks to install, edit or run tooling. yieldOS decides first.",
    "Safe coding for non-tech people.",
    "Unlock coding for non technical talent",
    "Safe coding for non technical talent",
    "claude plugin marketplace add /path/to/vibeOS",
    "claude plugin install yieldos@yieldos-marketplace",
    "$ claude plugin install yieldos@yieldos-marketplace",
    "PH26 Buenos Aires",
    "AI Security",
    "SAFE -&gt;",
    "Decision demo",
    "Before it runs.",
    "npm install colors",
    "denylist-match",
    "npm install node-fetch",
    "native-suggest",
    "npm install clsx",
    "category-a-rewrite",
    "Write AGENTS.md",
    "injection-blocked",
    "[yieldOS:verdict] category-a-rewrite",
  ].forEach((text) => {
    assert.ok(!source.includes(text), `Expected old anon copy to be removed: ${text}`);
  });

  [
    "InstructionGenerator",
    "Generate CLAUDE.md and AGENTS.md.",
    "Generate agent instructions.",
    "yieldos-init --agent",
    "--scope",
    "--profile",
    "--write",
  ].forEach((text) => {
    assert.ok(!source.includes(text), `Expected init implementation detail to stay off the landing page: ${text}`);
  });

  assert.ok(
    !existsSync(join(root, "src/components/instruction-generator.tsx")),
    "Instruction generator should stay out of the landing page until the feature is ready",
  );
});

test("copy-to-clipboard behavior is isolated in a client component", () => {
  const componentPath = "src/components/copy-command-button.tsx";
  assert.ok(existsSync(join(root, componentPath)), "Expected copy component");

  const component = read(componentPath);

  assert.ok(component.startsWith('"use client";'), "Expected client boundary");
  assert.ok(component.includes('aria-live="polite"'), "Expected live status");
  assert.ok(
    component.includes("focus-visible:ring-2"),
    "Expected keyboard focus styles",
  );
  assert.ok(
    component.includes("navigator.clipboard.writeText"),
    "Expected clipboard write behavior",
  );
  assert.ok(component.includes("-&gt;"), "Expected install button arrow rendering");
  assert.ok(component.includes("rounded-full"), "Expected softer install button corners");
  assert.ok(!component.includes("prefix?: ReactNode"), "Expected navbar-only prefix experiment to be removed");
  assert.ok(!component.includes("showArrow"), "Expected arrow toggle experiment to be removed");
});

test("agent packs page provides a downloadable pack builder", () => {
  const page = read("src/app/agent-packs/page.tsx");
  const builder = read("src/components/agent-pack-builder.tsx");
  const source = `${page}\n${builder}`;

  [
    "Build an agent pack",
    "Download yield.agent-pack.yaml",
    "yield.agent-pack.yaml",
    "Safety presets",
    "Non-technical safe",
    "Engineering team",
    "Security review",
    "non-technical-safe",
    "Claude Code",
    "Codex",
    "Cursor",
    "GitHub Copilot",
    "Windsurf",
    "secrets-safe",
    "dependency-safe",
    "code-audit",
    "read-only",
    "network-safe",
    "db-safe",
    "production-safe",
    "git-safe",
    "testing-discipline",
    "cost-aware",
    "skill:init",
    "skill:review",
    "skill:dependency-gate",
    "skill:security-review",
    "skill:think",
    "skill:feature",
    "skill:conductor",
    "skill:compound",
    "Custom skills require policy review",
    "source URL",
    "content hash",
    "mcp:filesystem",
    "Approved oracles",
    "code-audit-state",
    "agent-pack-lock",
    "instruction-policy",
    "project-tests",
    "cdsc-proof",
    "yieldos-oracle",
    "URL.createObjectURL",
    "download",
  ].forEach((text) => {
    assert.ok(source.includes(text), `Expected agent-pack builder copy/code: ${text}`);
  });

  assert.ok(
    !source.includes("skill:security-audit"),
    "Builder should not emit skills missing from policy/skills.json",
  );
  assert.ok(
    !source.includes('type="file"'),
    "Builder should not accept unvalidated skill uploads in the browser",
  );
});

test("oracle demo page explains baseline fail plus fixed pass proof", () => {
  const page = read("src/app/oracle-demo/page.tsx");
  const flow = read("src/components/oracle-demo-flow.tsx");
  const source = `${page}\n${flow}`;

  [
    "Contract proof demo",
    "Contract. Counterexample. Proof of fix.",
    "baseline violated the contract and the",
    "FAIL missing-authz",
    "CONTRACT created",
    "REPLAY baseline got 200",
    "FIX applied",
    "REPLAY fixed got 401",
    "PASS scoped acceptance",
    "This proves this route and replay, not the whole repo.",
    "Unauthenticated GET /admin/users returns 200",
    "Unauthenticated request must receive 401 or 403.",
    "observes denial",
  ].forEach((text) => {
    assert.ok(source.includes(text), `Expected oracle demo copy: ${text}`);
  });
});

test("cinematic motion components and reduced motion styles are configured", () => {
  const packageJson = read("package.json");
  const page = read("src/app/page.tsx");
  const reveal = read("src/components/motion-reveal.tsx");
  const oracleFlow = read("src/components/oracle-demo-flow.tsx");
  const agentsInstall = read("src/components/agents-install-button.tsx");
  const scrollAwareHeader = read("src/components/scroll-aware-header.tsx");
  const scrollProgress = read("src/components/scroll-progress.tsx");
  const globals = read("src/app/globals.css");

  assert.ok(packageJson.includes('"motion"'), "Expected motion dependency");
  assert.ok(reveal.startsWith('"use client";'), "Expected client boundary");
  assert.ok(reveal.includes('"motion/react"'), "Expected Motion import");
  assert.ok(reveal.includes("useReducedMotion"), "Expected reduced motion hook");
  assert.ok(scrollProgress.startsWith('"use client";'), "Expected scroll progress client boundary");
  assert.ok(
    reveal.includes("animate={reduceMotion || !immediate ? undefined : { opacity: 1, y: 0 }}"),
    "Expected immediate reveals to animate on page load",
  );
  assert.ok(!existsSync(join(root, "src/components/typewriter-hero-title.tsx")), "Expected unused typewriter hero component to stay removed");
  assert.ok(!globals.includes(".hero-typewriter"), "Expected unused typewriter CSS to stay removed");
  assert.ok(
    scrollProgress.includes("requestAnimationFrame"),
    "Expected scroll progress to throttle updates with rAF",
  );
  assert.ok(
    scrollProgress.includes("scaleY") && scrollProgress.includes("scaleX"),
    "Expected scroll progress to drive transforms directly",
  );
  assert.ok(scrollAwareHeader.startsWith('"use client";'), "Expected scroll-aware header client boundary");
  assert.ok(agentsInstall.startsWith('"use client";'), "Expected agents install button client boundary");
  assert.ok(
    agentsInstall.includes("navigator.clipboard.writeText"),
    "Expected install button to copy the command",
  );
  assert.ok(
    scrollAwareHeader.includes('data-scrolled={scrolled}'),
    "Expected scroll-aware header to expose scrolled state",
  );
  assert.ok(
    scrollAwareHeader.includes("window.requestAnimationFrame(update)"),
    "Expected requestAnimationFrame-throttled scroll updates",
  );
  assert.ok(!scrollAwareHeader.includes("showArrow={false}"), "Expected install button arrow to be restored");
  assert.ok(!scrollAwareHeader.includes("install-marks"), "Expected icon marks to be removed from the install pill");
  assert.ok(globals.includes("--signal-bright: #f4f4f5"), "Expected monochrome bright accent");
  assert.ok(globals.includes("--signal-muted: #a1a1aa"), "Expected monochrome muted accent");
  assert.ok(!globals.includes("#168cff"), "Expected blue accent value to be removed");
  assert.ok(!globals.includes("#ff2d45"), "Expected red accent value to be removed");
  assert.ok(!globals.includes("--signal-blue"), "Expected old blue variable names to be removed");
  assert.ok(!globals.includes("--signal-red"), "Expected old red variable names to be removed");
  assert.ok(!globals.includes("--acid"), "Expected old acid accent variable to be removed");
  assert.ok(!globals.includes("e8ff00"), "Expected old acid yellow value to be removed");
  assert.ok(globals.includes(".pitch-section"), "Expected full-screen sections");
  assert.ok(page.includes("theme-surface-light"), "Expected monochrome light surface sections");
  assert.ok(page.includes("theme-surface-smoke"), "Expected monochrome smoke surface sections");
  assert.ok(!page.includes("theme-surface-blue"), "Expected blue-tinted surface classes to be removed");
  assert.ok(!page.includes("theme-surface-red"), "Expected red-tinted surface classes to be removed");
  assert.ok(globals.includes(".snap-deck::before"), "Expected page-wide grid layer");
  assert.ok(!globals.includes(".snap-deck::after"), "Expected page-wide random color grid cells to be removed");
  assert.ok(
    globals.includes(".security-hero::before"),
    "Expected dedicated grid layer in the light hero",
  );
  assert.ok(
    globals.includes(".pitch-section.text-white::before"),
    "Expected dark-section grid layer for sections that opt in",
  );
  assert.ok(
    !globals.includes(".pitch-section:not(.security-hero)::after"),
    "Expected section-level random color grid cells to be removed",
  );
  assert.ok(
    globals.includes("background-size: 72px 72px"),
    "Expected extended square grid rhythm",
  );
  assert.ok(
    !globals.includes("144px 72px"),
    "Expected varied active grid cell sizes to be removed",
  );
  assert.ok(!page.includes("ascii-backdrop"), "Expected hero ascii background layer to be removed");
  assert.ok(
    !globals.includes('url("/yieldos-ascii-bg.webp")'),
    "Expected hero ascii asset to be removed from CSS",
  );
  assert.ok(!globals.includes("@keyframes ascii-presence"), "Expected ascii reveal keyframes to be removed");
  assert.ok(!globals.includes("ascii-drift"), "Expected lateral ascii background drift to be removed");
  assert.ok(
    globals.includes("min-height: max(100vh, 100dvh)"),
    "Expected desktop full-screen section height",
  );
  assert.ok(
    globals.includes("min-height: max(100vh, 100svh, 100dvh)"),
    "Expected mobile full-screen section height",
  );
  assert.ok(
    globals.includes("grid-template-columns: repeat(2, minmax(0, 1fr))"),
    "Expected compact mobile coverage grid",
  );
  assert.ok(
    globals.includes(".policy-path article"),
    "Expected compact mobile policy rows",
  );
  assert.ok(
    oracleFlow.includes("PASS scoped acceptance"),
    "Expected compact oracle proof flow",
  );
  assert.ok(globals.includes(".site-header"), "Expected transparent header styling");
  assert.ok(!scrollAwareHeader.includes("brand-mark"), "Expected capsule nav letter mark to be removed");
  assert.ok(scrollAwareHeader.includes("yieldOS home"), "Expected yieldOS brand in nav");
  assert.ok(scrollAwareHeader.includes("h-14"), "Expected compact navbar height");
  assert.ok(!scrollAwareHeader.includes("Install plugin"), "Expected install plugin CTA removed from navbar");
  assert.ok(!scrollAwareHeader.includes("CopyCommandButton"), "Expected navbar copy button removed");
  assert.ok(!scrollAwareHeader.includes("liquid-glass-nav"), "Expected liquid glass nav styling to be removed");
  assert.ok(!scrollAwareHeader.includes("nav-demo-button"), "Expected pill demo CTA to be removed");
  assert.ok(!scrollAwareHeader.includes("intro-header"), "Expected staged intro animation to be removed");
  assert.ok(!globals.includes(".command-bar"), "Expected liquid glass command bar styling to be removed");
  assert.ok(!globals.includes(".nav-demo-button"), "Expected demo CTA pill styling to be removed");
  assert.ok(!globals.includes("@keyframes intro-topbar"), "Expected topbar entry animation to be removed");
  assert.ok(!globals.includes("@keyframes orbital-color-pan"), "Expected orbital pill sheen animation to be removed");
  assert.ok(!globals.includes('.site-header[data-visible="false"]'), "Expected nav to remain visible at all times");
  assert.ok(globals.includes('.site-header[data-scrolled="true"]'), "Expected nav to gain a subtle backdrop on scroll");
  assert.ok(scrollAwareHeader.includes("data-scrolled"), "Expected nav to expose scroll state");
  assert.ok(!globals.includes(".install-marks"), "Expected install pill mark styling to be removed");
  assert.ok(page.includes("<AgentsInstallButton"), "Expected agents install button in hero");
  assert.ok(!page.includes("$ claude plugin install yieldos@yieldos-marketplace"), "Expected raw hero command text to be replaced");
  assert.ok(agentsInstall.includes("/logos/claude-code.png"), "Expected Claude Code logo in install button");
  assert.ok(agentsInstall.includes("/logos/codex.svg"), "Expected Codex logo in install button");
  assert.ok(!agentsInstall.includes("/logos/opencode.png"), "Expected OpenCode logo to be removed");
  assert.ok(agentsInstall.includes("/logos/cursor.png"), "Expected Cursor logo in install button");
  assert.ok(agentsInstall.includes("Install yieldOS"), "Expected install yieldOS label");
  assert.ok(agentsInstall.includes("navigator.clipboard.writeText"), "Expected install button to copy command");
  assert.ok(globals.includes(".agents-install-logo img"), "Expected install button logo styling");
  assert.ok(globals.includes("brightness(0) invert(1)"), "Expected logos to be normalized to white");
  assert.ok(
    globals.includes("backdrop-filter: blur"),
    "Expected scrolled-nav backdrop blur",
  );
  assert.ok(globals.includes(".snap-deck"), "Expected snap deck wrapper");
  assert.ok(
    !globals.includes("scroll-snap-type"),
    "Expected scroll snap to be removed for smoother scrolling",
  );
  assert.ok(
    globals.includes("content-visibility: auto"),
    "Expected sections to use content-visibility for off-screen pruning",
  );
  assert.ok(
    globals.includes(".scroll-progress"),
    "Expected scroll progress rail styling",
  );
  assert.ok(
    !existsSync(join(root, "src/components/animated-security-mockup.tsx")),
    "Expected temporary hero gate mockup to be removed",
  );
  assert.ok(!page.includes("AnimatedSecurityMockup"), "Expected hero mockup render removed");
  assert.ok(!globals.includes(".hero-typewriter"), "Expected unused hero typewriter styling to stay removed");
  assert.ok(!globals.includes(".hero-typewriter-caret"), "Expected unused hero typewriter caret to stay removed");
  assert.ok(!globals.includes(".gate-flow"), "Expected removed gate flow CSS");
  assert.ok(
    !globals.includes(".gate-pulse"),
    "Expected old horizontal gate pulse to be removed",
  );
  assert.ok(
    !globals.includes(".gate-scan"),
    "Expected old horizontal gate scanner to be removed",
  );
  assert.ok(
    !globals.includes(".gate-lane::before"),
    "Expected old center policy line to be removed",
  );
  assert.ok(globals.includes(".demo-cinema"), "Expected staged demo choreography");
  assert.ok(globals.includes(".decision-row"), "Expected verdict row choreography");
  assert.ok(globals.includes(".policy-path"), "Expected policy path styling");
  assert.ok(
    !globals.includes(".policy-path::after"),
    "Expected yellow policy connector line to be removed",
  );
  assert.ok(
    !globals.includes("policy-draw"),
    "Expected animated policy connector to be removed",
  );
  assert.ok(globals.includes(".metric-tile"), "Expected proof metric timing");
  assert.ok(globals.includes(".vector-card"), "Expected source-truth coverage cards");
  assert.ok(globals.includes(".proof-card"), "Expected prototype proof cards");
  assert.ok(
    globals.includes("@media (prefers-reduced-motion: reduce)"),
    "Expected reduced motion CSS fallback",
  );
});

test("layout metadata and offline-safe font theme are configured for yieldOS", () => {
  const layout = read("src/app/layout.tsx");
  const globals = read("src/app/globals.css");

  assert.ok(layout.includes("yieldOS - executable security contracts"));
  assert.ok(
    layout.includes("yieldOS turns risky AI coding-agent changes into executable security contracts, counterexamples, and oracle-verified proof."),
  );
  assert.ok(!layout.includes("next/font/google"));
  assert.ok(globals.includes("ui-sans-serif"));
  assert.ok(globals.includes("ui-monospace"));
});
