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
  const animatedDemo = read("src/components/animated-demo-flow.tsx");
  const animatedStory = read("src/components/animated-demo-story.tsx");
  const scrollAwareHeader = read("src/components/scroll-aware-header.tsx");
  const scrollProgress = read("src/components/scroll-progress.tsx");
  const typewriterTitle = read("src/components/typewriter-hero-title.tsx");
  const source = [
    page,
    animatedDemo,
    animatedStory,
    scrollAwareHeader,
    scrollProgress,
    typewriterTitle,
  ].join("\n");

  [
    "yieldOS",
    "AI agent actions, gated.",
    "Claude Code asks to install, edit or run tooling. yieldOS decides first.",
    "PH26 Buenos Aires",
    "Install yieldOS",
    "View decision demo",
    "$ claude plugin install yieldos@yieldos-marketplace",
    "claude plugin marketplace add /path/to/vibeOS",
    "claude plugin install yieldos@yieldos-marketplace",
    "AI Security",
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
    "122/122",
    "7",
    "9",
    "1163",
  ].forEach((text) => {
    assert.ok(source.includes(text), `Expected yieldOS proof/capability copy: ${text}`);
  });

  [
    "hero",
    "demo-flow",
    "gated-vectors",
    "policy-flow",
    "audit-trail",
    "proof",
    "final-cta",
  ].forEach((id) => {
    assert.ok(page.includes(`id="${id}"`), `Expected section id: ${id}`);
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
  ].forEach((text) => {
    assert.ok(!source.includes(text), `Expected old anon copy to be removed: ${text}`);
  });
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
  assert.ok(!component.includes("prefix?: ReactNode"), "Expected prefix-only install experiment to be removed");
  assert.ok(!component.includes("showArrow"), "Expected arrow toggle experiment to be removed");
});

test("cinematic motion components and reduced motion styles are configured", () => {
  const packageJson = read("package.json");
  const page = read("src/app/page.tsx");
  const reveal = read("src/components/motion-reveal.tsx");
  const demo = read("src/components/animated-demo-flow.tsx");
  const story = read("src/components/animated-demo-story.tsx");
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
  assert.ok(scrollProgress.includes("useScroll"), "Expected scroll-driven progress");
  assert.ok(
    scrollProgress.includes("useTransform"),
    "Expected transformed progress value",
  );
  assert.ok(scrollAwareHeader.startsWith('"use client";'), "Expected scroll-aware header client boundary");
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
  assert.ok(globals.includes("--signal-blue: #168cff"), "Expected blue security accent");
  assert.ok(globals.includes("--signal-red: #ff2d45"), "Expected red security accent");
  assert.ok(!globals.includes("--acid"), "Expected old acid accent variable to be removed");
  assert.ok(!globals.includes("e8ff00"), "Expected old acid yellow value to be removed");
  assert.ok(globals.includes(".pitch-section"), "Expected full-screen sections");
  assert.ok(page.includes("theme-surface-blue"), "Expected blue-tinted surface sections");
  assert.ok(page.includes("theme-surface-red"), "Expected red-tinted surface sections");
  assert.ok(globals.includes(".snap-deck::before"), "Expected page-wide grid layer");
  assert.ok(
    globals.includes(".pitch-section:not(.security-hero)::before"),
    "Expected section-level grid layer",
  );
  assert.ok(
    globals.includes("background-size: 72px 72px"),
    "Expected extended square grid rhythm",
  );
  assert.ok(
    existsSync(join(root, "public/yieldos-ascii-bg.webp")),
    "Expected optimized ascii background asset",
  );
  assert.ok(page.includes("ascii-backdrop"), "Expected decorative ascii background layer");
  assert.ok(
    globals.includes('url("/yieldos-ascii-bg.webp")'),
    "Expected ascii asset to be used as background",
  );
  assert.ok(globals.includes("@keyframes ascii-presence"), "Expected static ascii background reveal");
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
  assert.ok(!scrollAwareHeader.includes("yieldOS home"), "Expected capsule nav home mark to be removed");
  assert.ok(scrollAwareHeader.includes("!h-11"), "Expected previous compact topbar install button");
  assert.ok(scrollAwareHeader.includes("!w-[166px]"), "Expected previous fixed install pill");
  assert.ok(globals.includes('.site-header[data-visible="false"]'), "Expected nav to hide while scrolling down");
  assert.ok(!globals.includes(".install-marks"), "Expected install pill mark styling to be removed");
  assert.ok(
    globals.includes("linear-gradient(90deg, rgba(var(--signal-blue-rgb), 0.12), rgba(var(--signal-red-rgb), 0.075))"),
    "Expected capsule glass nav to use blue/red theme",
  );
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

  assert.ok(layout.includes("yieldOS — security gate for AI agent actions"));
  assert.ok(
    layout.includes(
      "yieldOS allows, blocks or rewrites Claude Code dependency actions before execution.",
    ),
  );
  assert.ok(globals.includes('"Geist"'));
  assert.ok(globals.includes('"Geist Mono"'));
});
