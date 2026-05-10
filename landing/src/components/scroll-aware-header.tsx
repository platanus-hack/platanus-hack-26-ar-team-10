"use client";

import { useEffect, useRef, useState } from "react";

const githubUrl = "https://github.com/yieldos/yieldos";

export function ScrollAwareHeader() {
  const [scrolled, setScrolled] = useState(false);
  const tickingRef = useRef(false);

  useEffect(() => {
    function update() {
      setScrolled(window.scrollY > 12);
      tickingRef.current = false;
    }

    function handleScroll() {
      if (!tickingRef.current) {
        window.requestAnimationFrame(update);
        tickingRef.current = true;
      }
    }

    update();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className="site-header fixed inset-x-0 top-0 z-50"
      data-scrolled={scrolled}
    >
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <a
          href="#hero"
          className="text-[18px] font-semibold tracking-[-0.015em] text-zinc-950 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fafafa]"
          aria-label="yieldOS home"
        >
          yieldOS
        </a>

        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="yieldOS on GitHub"
          className="inline-grid h-10 w-10 place-items-center rounded-full text-zinc-600 transition-colors hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fafafa]"
        >
          <svg
            viewBox="0 0 24 24"
            width="24"
            height="24"
            aria-hidden="true"
            fill="currentColor"
          >
            <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.575.106.79-.25.79-.555 0-.275-.012-1.19-.018-2.16-3.2.695-3.875-1.36-3.875-1.36-.523-1.33-1.278-1.685-1.278-1.685-1.045-.715.08-.7.08-.7 1.156.082 1.764 1.187 1.764 1.187 1.027 1.76 2.695 1.252 3.353.957.103-.745.402-1.252.73-1.54-2.555-.29-5.243-1.278-5.243-5.687 0-1.256.45-2.282 1.187-3.087-.12-.292-.515-1.46.112-3.043 0 0 .967-.31 3.17 1.18a11.02 11.02 0 0 1 5.77 0c2.2-1.49 3.166-1.18 3.166-1.18.63 1.583.235 2.751.116 3.043.74.805 1.185 1.831 1.185 3.087 0 4.42-2.692 5.392-5.255 5.677.412.355.78 1.057.78 2.13 0 1.54-.014 2.78-.014 3.158 0 .308.21.668.795.554A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
          </svg>
        </a>
      </div>
    </header>
  );
}
