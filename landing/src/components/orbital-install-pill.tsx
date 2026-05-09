"use client";

import { useEffect, useRef, useState } from "react";

type OrbitalInstallPillProps = {
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

export function OrbitalInstallPill({ command }: OrbitalInstallPillProps) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | null>(null);

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
      className="orbital-install-pill"
      onClick={handleCopy}
      aria-label="Copy yieldOS install command"
    >
      <span className="orbital-pill-aura" aria-hidden="true">
        <span className="orbital-dot orbital-dot-blue" />
        <span className="orbital-dot orbital-dot-red" />
        <span className="orbital-dot orbital-dot-quiet" />
      </span>
      <span className="orbital-pill-core">
        <span className="orbital-pill-prompt" aria-hidden="true">
          $
        </span>
        <span className="orbital-pill-command">
          <span className="hidden sm:inline">
            claude plugin install yieldos@yieldos-marketplace
          </span>
          <span className="sm:hidden">claude plugin install yieldos</span>
        </span>
        <span className="orbital-pill-copy" aria-live="polite">
          {copied ? "copied" : "copy"}
        </span>
      </span>
    </button>
  );
}
