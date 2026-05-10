"use client";

import { useEffect, useRef } from "react";

const sections = [
  { label: "Hero", id: "hero" },
  { label: "Demo", id: "demo-flow" },
  { label: "Coverage", id: "gated-vectors" },
  { label: "Policy", id: "policy-flow" },
  { label: "Audit", id: "audit-trail" },
  { label: "Proof", id: "proof" },
];

export function ScrollProgress() {
  const fillRef = useRef<HTMLSpanElement | null>(null);
  const mobileFillRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    let ticking = false;

    function update() {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const progress = max > 0 ? Math.min(1, Math.max(0, doc.scrollTop / max)) : 0;
      if (fillRef.current) {
        fillRef.current.style.transform = `scaleY(${progress})`;
      }
      if (mobileFillRef.current) {
        mobileFillRef.current.style.transform = `scaleX(${progress})`;
      }
      ticking = false;
    }

    function onScroll() {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <>
      <aside
        aria-label="Scroll progress"
        className="scroll-progress fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 2xl:block"
      >
        <div className="scroll-progress-track" aria-hidden="true">
          <span
            ref={fillRef}
            className="scroll-progress-fill"
            style={{ transformOrigin: "top", transform: "scaleY(0)" }}
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
        <span
          ref={mobileFillRef}
          className="block h-px origin-left bg-[linear-gradient(90deg,var(--signal-bright),var(--signal-muted))]"
          style={{ transform: "scaleX(0)" }}
        />
      </div>
    </>
  );
}
