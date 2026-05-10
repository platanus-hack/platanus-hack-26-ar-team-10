"use client";

import { useEffect, useRef, useState } from "react";

type InstallCommandPillProps = {
  command: string;
};

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

export function InstallCommandPill({ command }: InstallCommandPillProps) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | null>(null);

  const compactCommand = command.replace(
    "https://raw.githubusercontent.com/platanus-hack/platanus-hack-26-ar-team-10/main",
    "...",
  );

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  async function handleCopy() {
    if (await copyText(command)) {
      setCopied(true);
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
      resetTimerRef.current = window.setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label="Copy install command"
      title="Click to copy"
      className="install-command-pill group inline-flex h-12 max-w-full cursor-pointer items-center gap-3 rounded-full border border-white/10 bg-[#0b0b0d] px-5 text-white shadow-[0_10px_30px_-18px_rgba(0,0,0,0.8)] transition-[border-color,transform,box-shadow] hover:border-white/25 hover:bg-[#111114] hover:shadow-[0_14px_36px_-18px_rgba(0,0,0,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fafafa] active:translate-y-px"
    >
      <span aria-hidden="true" className="font-mono text-[12px] text-white/45">
        $
      </span>
      <span className="truncate font-mono text-[13px] tracking-tight text-white/90 sm:text-[14px]">
        <span className="hidden sm:inline">{compactCommand}</span>
        <span className="sm:hidden">curl ... | sh</span>
      </span>
      <span
        aria-live="polite"
        className="ml-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45 transition-colors group-hover:text-white/75"
      >
        {copied ? "copied" : "copy"}
      </span>
    </button>
  );
}
