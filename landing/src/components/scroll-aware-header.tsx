"use client";

import { useEffect, useRef, useState } from "react";

const navItems = [
  ["Coverage", "#gated-vectors"],
  ["Policy", "#policy-flow"],
  ["Proof", "#proof"],
];

export function ScrollAwareHeader() {
  const [visible, setVisible] = useState(true);
  const lastYRef = useRef(0);
  const tickingRef = useRef(false);

  useEffect(() => {
    lastYRef.current = window.scrollY;

    function update() {
      const currentY = window.scrollY;
      const delta = currentY - lastYRef.current;

      if (currentY < 24) {
        setVisible(true);
      } else if (Math.abs(delta) > 6) {
        setVisible(delta < 0);
      }

      lastYRef.current = currentY;
      tickingRef.current = false;
    }

    function handleScroll() {
      if (!tickingRef.current) {
        window.requestAnimationFrame(update);
        tickingRef.current = true;
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className="site-header intro-header fixed inset-x-0 top-0 z-50 px-3 py-3 text-white"
      data-visible={visible}
    >
      <div className="command-bar liquid-glass-nav mx-auto grid h-14 w-full max-w-[min(940px,calc(100vw-2rem))] grid-cols-[1fr_auto_1fr] items-center gap-3 overflow-hidden rounded-[23px] border border-white/15 bg-white/[0.075] px-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-xl sm:h-[58px] sm:px-4">
        <nav
          className="intro-nav nav-left hidden items-center gap-1 text-xs font-semibold sm:flex"
          aria-label="Primary navigation"
        >
          {navItems.map(([label, href]) => (
            <a
              key={href}
              className="rounded-full px-2.5 py-1.5 transition hover:bg-zinc-950/[0.06] hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20"
              href={href}
            >
              {label}
            </a>
          ))}
        </nav>
        <a
          href="#hero"
          className="intro-brand nav-brand text-base font-semibold tracking-[-0.04em] transition hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20 sm:text-lg"
          aria-label="yieldOS home"
        >
          yieldOS
        </a>
        <div className="intro-status nav-right">
          <a
            href="#demo-flow"
            className="nav-demo-button inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20"
          >
            Demo
            <span aria-hidden="true">-&gt;</span>
          </a>
        </div>
      </div>
    </header>
  );
}
