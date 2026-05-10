type ViewReadmeButtonProps = {
  href: string;
  label?: string;
};

export function ViewReadmeButton({
  href,
  label = "View README.md",
}: ViewReadmeButtonProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-12 items-center gap-2.5 rounded-full border border-zinc-300 bg-zinc-50 px-5 text-[14px] font-medium text-zinc-800 shadow-[0_8px_22px_-18px_rgba(0,0,0,0.6)] transition-[border-color,background-color,transform] hover:border-zinc-400 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e0e10] active:translate-y-px"
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="13" y2="17" />
      </svg>
      <span className="tracking-[-0.005em]">{label}</span>
    </a>
  );
}
