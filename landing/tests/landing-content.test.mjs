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
  const animatedDemo = read("src/components/animated-demo-flow.tsx");
  const animatedStory = read("src/components/animated-demo-story.tsx");
  const orbitalInstall = read("src/components/orbital-install-pill.tsx");
  const scrollAwareHeader = read("src/components/scroll-aware-header.tsx");
  const scrollProgress = read("src/components/scroll-progress.tsx");
  const typewriterTitle = read("src/components/typewriter-hero-title.tsx");
  const source = [
    page,
    agentPackSection,
    animatedDemo,
    animatedStory,
    orbitalInstall,
    scrollAwareHeader,
    scrollProgress,
    typewriterTitle,
  ].join("\n");

  [
    "yieldOS",
    "Safe coding for AI agent teams",
    "Safe coding for",
    "AI agent teams",
    "hero-safe-label",
    "hero-safe-arrow",
    "yieldOS checks what AI agents install, edit, and run before anything happens.",
    "AI-agent security gate",
    "Install yieldOS",
    "View decision demo",
    "curl -fsSL https://raw.githubusercontent.com/platanus-hack/platanus-hack-26-ar-team-10/main/install.sh | sh",
    "curl ... | sh",
    "OrbitalInstallPill",
    "Copy yieldOS install command",
    "Verdict",
    "Allow",
    "Block",
    "Rewrite",
    "AGENTS.md",
    "curl | sh",
    "Decision demo",
    "Before it runs.",
    "Call",
    "Classify",
    "Policy",
    "Verdict",
    "npm install colors",
    "denylist-match",
    "npm install node-fetch",
    "native-suggest",
    "npm install clsx",
    "category-a-rewrite",
    "Write AGENTS.md",
    "injection-blocked",
    "security/dependency-events.md",
    "[yieldOS:verdict] category-a-rewrite",
    "ScrollProgress",
    "ScrollAwareHeader",
    "Hero",
    "Demo",
    "Coverage",
    "Policy",
    "Packs",
    "Audit",
    "Proof",
    "TypewriterHeroTitle",
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
    "250+",
    "7",
    "9",
    "1163",
    "Team agent packs",
    "Package company rules once.",
    "Choose approved skills, MCPs, safety profiles, and playbooks.",
    "yield.agent-pack.yaml",
    "yield.agent-pack.lock.json",
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
    "Custom skills require policy review",
    "source URL",
    "content hash",
    "mcp:filesystem",
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

test("cinematic motion components and reduced motion styles are configured", () => {
  const packageJson = read("package.json");
  const page = read("src/app/page.tsx");
  const reveal = read("src/components/motion-reveal.tsx");
  const demo = read("src/components/animated-demo-flow.tsx");
  const story = read("src/components/animated-demo-story.tsx");
  const orbitalInstall = read("src/components/orbital-install-pill.tsx");
  const scrollAwareHeader = read("src/components/scroll-aware-header.tsx");
  const scrollProgress = read("src/components/scroll-progress.tsx");
  const typewriterTitle = read("src/components/typewriter-hero-title.tsx");
  const globals = read("src/app/globals.css");

  assert.ok(packageJson.includes('"motion"'), "Expected motion dependency");
  [reveal, demo, story, scrollProgress, typewriterTitle].forEach((source) => {
    assert.ok(source.startsWith('"use client";'), "Expected client boundary");
    assert.ok(source.includes('"motion/react"'), "Expected Motion import");
    assert.ok(source.includes("useReducedMotion"), "Expected reduced motion hook");
  });
  assert.ok(
    typewriterTitle.includes("setVisibleCharacters"),
    "Expected typewriter character reveal",
  );
  assert.ok(
    typewriterTitle.includes("speedMs = 52"),
    "Expected calmer typewriter timing",
  );
  assert.ok(
    page.includes("startDelayMs={900}"),
    "Expected hero typewriter to wait for the intro hierarchy",
  );
  assert.ok(
    typewriterTitle.includes('displayLines.join("\\n")'),
    "Expected stable pre-defined typewriter lines",
  );
  assert.ok(
    reveal.includes("animate={reduceMotion || !immediate ? undefined : { opacity: 1, y: 0 }}"),
    "Expected immediate reveals to animate on page load",
  );
  assert.ok(
    globals.includes(".hero-typewriter-line"),
    "Expected fixed line styling for hero typewriter",
  );
  assert.ok(typewriterTitle.includes("hero-safe-marker"), "Expected SAFE marker in hero title");
  assert.ok(globals.includes(".hero-safe-word"), "Expected SAFE marker word anchor styling");
  assert.ok(globals.includes(".hero-safe-marker"), "Expected SAFE marker visual styling");
  assert.ok(scrollProgress.includes("useScroll"), "Expected scroll-driven progress");
  assert.ok(
    scrollProgress.includes("useTransform"),
    "Expected transformed progress value",
  );
  assert.ok(scrollAwareHeader.startsWith('"use client";'), "Expected scroll-aware header client boundary");
  assert.ok(orbitalInstall.startsWith('"use client";'), "Expected orbital install pill client boundary");
  assert.ok(
    orbitalInstall.includes("navigator.clipboard.writeText"),
    "Expected orbital install pill to copy the command",
  );
  assert.ok(
    orbitalInstall.includes('aria-live="polite"'),
    "Expected orbital install pill copied state announcement",
  );
  assert.ok(
    scrollAwareHeader.includes('data-visible={visible}'),
    "Expected scroll-aware header visibility state",
  );
  assert.ok(
    scrollAwareHeader.includes("window.requestAnimationFrame(update)"),
    "Expected requestAnimationFrame scroll direction handling",
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
    globals.includes(".pitch-section::before"),
    "Expected section-level grid layer across every section",
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
    demo.includes("grid-cols-[minmax(0,1fr)_124px]"),
    "Expected compact mobile demo verdict rows",
  );
  assert.ok(globals.includes(".command-bar"), "Expected command bar styling");
  assert.ok(globals.includes(".site-header"), "Expected transparent header styling");
  assert.ok(scrollAwareHeader.includes("intro-header"), "Expected staged topbar intro class");
  assert.ok(!scrollAwareHeader.includes("brand-mark"), "Expected capsule nav letter mark to be removed");
  assert.ok(scrollAwareHeader.includes("yieldOS home"), "Expected centered yieldOS brand in panoramic nav");
  assert.ok(scrollAwareHeader.includes("nav-left"), "Expected left nav region");
  assert.ok(scrollAwareHeader.includes("nav-brand"), "Expected centered brand region");
  assert.ok(scrollAwareHeader.includes("nav-right"), "Expected right nav action region");
  assert.ok(scrollAwareHeader.includes("nav-demo-button"), "Expected compact right-side demo CTA");
  assert.ok(
    globals.includes(".nav-demo-button {\n  border: 1px solid"),
    "Expected demo nav CTA to be outline-only",
  );
  assert.ok(globals.includes(".nav-demo-button {\n  border: 1px solid") && globals.includes("background: transparent;"), "Expected demo nav CTA background to be removed");
  assert.ok(scrollAwareHeader.includes("liquid-glass-nav"), "Expected liquid glass nav styling hook");
  assert.ok(scrollAwareHeader.includes("max-w-[min(940px"), "Expected less dominant panoramic nav width");
  assert.ok(scrollAwareHeader.includes("h-14"), "Expected more compact panoramic nav height");
  assert.ok(!scrollAwareHeader.includes("Install plugin"), "Expected install plugin CTA removed from navbar");
  assert.ok(!scrollAwareHeader.includes("CopyCommandButton"), "Expected navbar copy button removed");
  assert.ok(globals.includes('.site-header[data-visible="false"]'), "Expected nav to hide while scrolling down");
  assert.ok(!globals.includes(".install-marks"), "Expected install pill mark styling to be removed");
  assert.ok(page.includes("<OrbitalInstallPill"), "Expected orbital install pill in hero");
  assert.ok(!page.includes("$ claude plugin install yieldos@yieldos-marketplace"), "Expected raw hero command text to be replaced");
  assert.ok(globals.includes(".orbital-install-pill"), "Expected orbital install pill styling");
  assert.ok(!orbitalInstall.includes("orbital-pill-aura"), "Expected rotating orbit layer to be removed");
  assert.ok(!globals.includes(".orbital-pill-aura"), "Expected rotating orbit styles to be removed");
  assert.ok(!orbitalInstall.includes("orbital-dot"), "Expected endpoint orbit dots to be removed");
  assert.ok(!globals.includes(".orbital-dot"), "Expected endpoint orbit dot styling to be removed");
  assert.ok(!globals.includes("@keyframes orbital-roll"), "Expected roll-axis orbit animation to be removed");
  assert.ok(!globals.includes("rotateX(66deg)"), "Expected tilted roll-axis rotation to be removed");
  assert.ok(globals.includes("@keyframes orbital-color-pan"), "Expected monochrome pill sheen cycling");
  assert.ok(
    globals.includes("rgba(var(--signal-bright-rgb), 0.34) 0%"),
    "Expected liquid glass nav to start with a bright monochrome edge",
  );
  assert.ok(
    globals.includes("transparent 50%"),
    "Expected liquid glass nav to stay transparent in the center",
  );
  assert.ok(
    globals.includes("rgba(var(--signal-muted-rgb), 0.34) 100%"),
    "Expected liquid glass nav to end with a muted monochrome edge",
  );
  assert.ok(globals.includes("-webkit-backdrop-filter: blur(34px)"), "Expected Safari liquid glass blur");
  assert.ok(globals.includes("contrast(1.08)"), "Expected refractive liquid glass contrast");
  assert.ok(globals.includes(".command-bar::before"), "Expected liquid glass refractive highlight");
  assert.ok(globals.includes(".command-bar::after"), "Expected liquid glass specular edge");
  assert.ok(globals.includes(".intro-header .command-bar"), "Expected topbar entry animation");
  assert.ok(globals.includes("@keyframes intro-topbar"), "Expected topbar keyframes");
  assert.ok(
    globals.includes("backdrop-filter: blur"),
    "Expected glass topbar backdrop blur",
  );
  assert.ok(globals.includes(".snap-deck"), "Expected snap deck wrapper");
  assert.ok(
    globals.includes("scroll-snap-type: y proximity"),
    "Expected softer scroll snap",
  );
  assert.ok(
    globals.includes("scroll-snap-align: start"),
    "Expected section snap alignment",
  );
  assert.ok(
    !globals.includes("scroll-snap-stop: always"),
    "Expected scroll snap stops to be softened",
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
  assert.ok(
    globals.includes(".hero-typewriter"),
    "Expected hero typewriter styling",
  );
  assert.ok(
    globals.includes(".hero-typewriter-caret"),
    "Expected hero typewriter caret",
  );
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
  assert.ok(globals.includes(".scan-sweep"), "Expected scanner visual");
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

test("layout metadata and Geist theme are configured for yieldOS", () => {
  const layout = read("src/app/layout.tsx");
  const globals = read("src/app/globals.css");

  assert.ok(layout.includes("yieldOS - security gate for AI agent installs"));
  assert.ok(
    layout.includes(
      "yieldOS allows, blocks, rewrites, and audits Claude Code actions before execution.",
    ),
  );
  assert.ok(globals.includes('"Geist"'));
  assert.ok(globals.includes('"Geist Mono"'));
});
