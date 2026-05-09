"use client";

import { useEffect, useRef, useState } from "react";

import { CopyCommandButton } from "@/components/copy-command-button";

type ScrollAwareHeaderProps = {
  installCommand: string;
};

const navItems = [
  ["Demo", "#demo-flow"],
  ["Coverage", "#gated-vectors"],
  ["Policy", "#policy-flow"],
];

export function ScrollAwareHeader({ installCommand }: ScrollAwareHeaderProps) {
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
      <div className="command-bar mx-auto flex h-16 w-fit max-w-[calc(100vw-1.5rem)] items-center gap-2 overflow-hidden rounded-[22px] border border-white/15 bg-white/[0.075] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-xl sm:gap-4 sm:px-2.5">
        <nav
          className="intro-nav hidden items-center gap-5 px-2 text-sm font-semibold text-zinc-300 md:flex"
          aria-label="Primary navigation"
        >
          {navItems.map(([label, href]) => (
            <a
              key={href}
              className="rounded px-1 py-2 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
              href={href}
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="intro-install flex items-center">
          <CopyCommandButton
            command={installCommand}
            label="Install plugin"
            variant="dark"
            showArrow={false}
            prefix={
              <span className="install-marks" aria-hidden="true">
                <span>y</span>
                <span>cc</span>
                <span>!</span>
              </span>
            }
            className="install-copy-button command-pill command-pulse !h-12 !w-[190px] max-w-none !gap-3 overflow-hidden whitespace-nowrap !rounded-full !border-white/10 bg-[#050711] !px-3.5 !py-0 font-sans !text-[14px] font-semibold leading-none text-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] hover:bg-[#090d1a] [&>span]:whitespace-nowrap"
          />
        </div>
      </div>
    </header>
  );
}
