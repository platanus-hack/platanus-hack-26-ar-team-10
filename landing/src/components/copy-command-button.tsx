"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

type CopyCommandButtonProps = {
  command: string;
  label: string;
  scrollTargetId?: string;
  variant?: "primary" | "light" | "quiet" | "dark";
  className?: string;
  prefix?: ReactNode;
};

const variants = {
  primary:
    "border-zinc-950 bg-zinc-950 text-white hover:bg-zinc-800 active:translate-y-px",
  light:
    "border-white bg-white text-zinc-950 hover:bg-zinc-100 active:translate-y-px",
  quiet:
    "border-zinc-200 bg-white text-zinc-950 hover:border-zinc-950 active:translate-y-px",
  dark: "border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.1] active:translate-y-px",
};

const focusStyle =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e0e10]";

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      return document.execCommand("copy");
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

export function CopyCommandButton({
  command,
  label,
  scrollTargetId,
  variant = "primary",
  className = "",
  prefix,
}: CopyCommandButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  async function handleClick() {
    if (scrollTargetId) {
      document
        .getElementById(scrollTargetId)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    if (await copyText(command)) {
      setCopied(true);
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
      resetTimerRef.current = window.setTimeout(() => setCopied(false), 1400);
    } else {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium transition ${focusStyle} ${variants[variant]} ${className}`}
      aria-label={`${label}: copy ${command}`}
    >
      {prefix}
      <span aria-live="polite">{copied ? "Copied" : label}</span>
      <span className="font-mono text-xs" aria-hidden="true">
        -&gt;
      </span>
    </button>
  );
}
