"use client";

import { useEffect, useRef, useState } from "react";

type TerminalInstallCommandProps = {
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

export function TerminalInstallCommand({ command }: TerminalInstallCommandProps) {
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
    <div className="hero-terminal" role="group" aria-label="yieldOS install terminal">
      <div className="hero-terminal-chrome">
        <div className="hero-terminal-controls" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="hero-terminal-title">yieldOS install - zsh</p>
        <button
          type="button"
          className="hero-terminal-copy"
          onClick={handleCopy}
          aria-label="Copy yieldOS install command"
        >
          <span aria-live="polite">{copied ? "copied" : "copy"}</span>
        </button>
      </div>
      <pre className="hero-terminal-screen" aria-label="Install yieldOS command">
        <code>
          <span className="hero-terminal-line">
            <span className="hero-terminal-prompt">%</span>
            <span>claude plugin marketplace add /path/to/vibeOS</span>
          </span>
          <span className="hero-terminal-line">
            <span className="hero-terminal-prompt">%</span>
            <span>claude plugin install yieldos@yieldos-marketplace</span>
          </span>
          <span className="hero-terminal-output">yieldOS gate ready before tool execution</span>
        </code>
      </pre>
    </div>
  );
}
