"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type AgentsInstallButtonProps = {
  command: string;
  label?: string;
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

const agents = [
  { src: "/logos/claude-code.png", alt: "Claude Code" },
  { src: "/logos/codex.svg", alt: "Codex" },
  { src: "/logos/cursor.png", alt: "Cursor" },
];

export function AgentsInstallButton({
  command,
  label = "Install yieldOS",
}: AgentsInstallButtonProps) {
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
      resetTimerRef.current = window.setTimeout(() => setCopied(false), 1600);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`${label} — copy install command`}
      className="agents-install-button group inline-flex h-12 items-center gap-3 rounded-full border border-white/10 bg-[#0b0b0d] pl-2 pr-5 text-white shadow-[0_10px_30px_-18px_rgba(0,0,0,0.8)] transition-[border-color,transform,box-shadow] hover:border-white/20 hover:shadow-[0_14px_36px_-18px_rgba(0,0,0,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e0e10] active:translate-y-px"
    >
      <span className="flex items-center gap-1 pl-1">
        {agents.map((agent) => (
          <span
            key={agent.alt}
            className="agents-install-logo relative grid h-6 w-6 place-items-center"
          >
            <Image
              src={agent.src}
              alt={agent.alt}
              width={22}
              height={22}
              className="h-[18px] w-[18px] object-contain"
              unoptimized
            />
          </span>
        ))}
      </span>
      <span className="text-[14px] font-medium tracking-[-0.005em]">
        {copied ? "Copied" : label}
      </span>
    </button>
  );
}
