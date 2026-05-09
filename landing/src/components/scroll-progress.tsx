"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

const sections = [
  { label: "Hero", id: "hero" },
  { label: "Demo", id: "demo-flow" },
  { label: "Coverage", id: "gated-vectors" },
  { label: "Policy", id: "policy-flow" },
  { label: "Audit", id: "audit-trail" },
  { label: "Proof", id: "proof" },
];

export function ScrollProgress() {
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const scaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <>
      <aside
        aria-label="Scroll progress"
        className="scroll-progress fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 2xl:block"
      >
        <div className="scroll-progress-track" aria-hidden="true">
          <motion.span
            className="scroll-progress-fill"
            style={{
              scaleY: reduceMotion ? 1 : scaleY,
              transformOrigin: "top",
            }}
          />
        </div>
        <ol className="scroll-progress-labels">
          {sections.map((section, index) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="scroll-progress-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
              >
                <span className="scroll-progress-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{section.label}</span>
              </a>
            </li>
          ))}
        </ol>
      </aside>

      <div className="scroll-progress-mobile fixed inset-x-0 bottom-0 z-40 h-px bg-black/10 2xl:hidden">
        <motion.span
          className="block h-px origin-left bg-[linear-gradient(90deg,var(--signal-bright),var(--signal-muted))]"
          style={{ scaleX: reduceMotion ? 1 : scaleX }}
        />
      </div>
    </>
  );
}
