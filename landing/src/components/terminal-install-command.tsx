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
    <button
      type="button"
      className="hero-terminal"
      onClick={handleCopy}
      aria-label="Copy yieldOS install command"
    >
      <div className="hero-terminal-chrome">
        <div className="hero-terminal-controls" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="hero-terminal-title">
          <span>yieldOS install - zsh</span>
          <span className="hero-terminal-status" aria-live="polite">
            {copied ? "copied" : "click to copy"}
          </span>
        </p>
      </div>
      <pre className="hero-terminal-screen" aria-label="Install yieldOS command">
        <code>
          <span className="hero-terminal-line">
            <span className="hero-terminal-prompt">%</span>
            <span className="terminal-cmd">curl</span>{" "}
            <span className="terminal-flag">-fsSL</span>{" "}
            <span className="terminal-url">
              https://raw.githubusercontent.com/platanus-hack/platanus-hack-26-ar-team-10/main/install.sh
            </span>{" "}
            <span className="terminal-continuation">\</span>
          </span>
          <span className="hero-terminal-line hero-terminal-line-indent">
            <span className="terminal-pipe">|</span>{" "}
            <span className="terminal-cmd">sh</span>
          </span>
          <span className="hero-terminal-output">
            <span className="terminal-success">ready</span> yieldOS installs for any AI coding agent
          </span>
        </code>
      </pre>
    </button>
  );
}
