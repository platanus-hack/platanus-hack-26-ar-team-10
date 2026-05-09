'use strict';

// Terminal-native rendering helpers — zero npm dependencies.
//
// Two surfaces:
//   (a) Inline rendering for hook output. Output goes through the agent's
//       reply, so we use markdown code blocks (`diff` for color) plus Unicode
//       box-drawing. ANSI escape codes are NOT used here because they don't
//       render in the agent's text reply.
//   (b) Standalone widgets for future CLI tools (e.g. tools/yieldos-status).
//       Those CAN use ANSI directly via process.stdout.write.
//
// All ASCII art is intentionally short (max ~8 lines) to fit in narrow terminals.

const ALERT_ARTS = [
  // 1) Pirate skull + crossbones
  [
    "       _____",
    "      /     \\",
    "     | x   x |",
    "      \\  ^  /",
    "       \\___/",
    "      ╳     ╳",
    "    ╳         ╳",
  ].join('\n'),

  // 2) Hooded thief
  [
    "      .--.",
    "     /    \\",
    "    | o  o |",
    "    |  __  |",
    "     \\____/",
    "    /|    |\\",
    "   /_|____|_\\",
  ].join('\n'),

  // 3) Open padlock (broken)
  [
    "      .-.",
    "     /   \\",
    "    |     |",
    "    |  ╳  |",
    "  ┌─┴─────┴─┐",
    "  │  ! ! !  │",
    "  └─────────┘",
  ].join('\n'),

  // 4) Bandit mask + dollar
  [
    "    ┌─────────┐",
    "    │  o o    │",
    "    │ ─███─   │",
    "    │  o o    │",
    "    │   $$$   │",
    "    └─────────┘",
  ].join('\n'),

  // 5) Pirate flag (Jolly Roger)
  [
    "  ╔═══════════╗",
    "  ║   ⚑       ║",
    "  ║   _____   ║",
    "  ║  / x x \\  ║",
    "  ║ |   v   | ║",
    "  ║  \\_____/  ║",
    "  ║   ╳ ╳     ║",
    "  ╚═══════════╝",
  ].join('\n'),

  // 6) Eyes in the dark (surveillance)
  [
    "    ░░░░░░░░░░░░░",
    "    ░  ▓     ▓  ░",
    "    ░  █     █  ░",
    "    ░  ▓     ▓  ░",
    "    ░░░░░░░░░░░░░",
    "      L E A K",
  ].join('\n'),

  // 7) Trojan horse
  [
    "      _,---._",
    "    /  ╳   ╳  \\",
    "   |    ___    |",
    "   |   / ! \\   |",
    "    \\__\\___/__/",
    "    | |   | |",
    "    '_'   '_'",
  ].join('\n'),

  // 8) Phishing hook
  [
    "         |",
    "         |",
    "        /|",
    "       / |",
    "      /__|",
    "     ──╮ ",
    "       ╰─◯  $$$",
  ].join('\n'),

  // 9) Bomb / payload
  [
    "         ✶",
    "        / ",
    "      ┌─┴─┐",
    "     /     \\",
    "    │   ●   │",
    "     \\     /",
    "      └───┘",
  ].join('\n'),

  // 10) Skull (classic)
  [
    "      ╔═════╗",
    "     ╔╝ ▄ ▄ ╚╗",
    "     ║  ─v─  ║",
    "     ║  | |  ║",
    "     ╚╗ ╲╱  ╔╝",
    "      ╚═════╝",
  ].join('\n'),
];

function randomAlertArt() {
  return ALERT_ARTS[Math.floor(Math.random() * ALERT_ARTS.length)];
}

function allAlertArts() {
  return ALERT_ARTS.slice();
}

// Redact a credential value, keeping only the first and last 2 chars.
//   sk-proj-abc...xyz → sk************yz
//   AKIAIOSFODNN7EXAMPLE → AK***************LE
function redactCredential(value) {
  if (typeof value !== 'string' || value.length === 0) return '[REDACTED]';
  if (value.length <= 6) return '*'.repeat(value.length);
  return value.slice(0, 2) + '*'.repeat(Math.max(8, value.length - 4)) + value.slice(-2);
}

// Wrap a multi-line block with a Unicode box. Width auto-detects from content.
function boxPanel(title, lines, opts = {}) {
  const padding = opts.padding ?? 1;
  const all = (Array.isArray(lines) ? lines : String(lines).split('\n'));
  const innerWidth = Math.max(
    title ? title.length : 0,
    ...all.map((l) => visibleLength(l)),
  ) + padding * 2;
  const top    = '┌' + '─'.repeat(innerWidth) + '┐';
  const bottom = '└' + '─'.repeat(innerWidth) + '┘';
  const sep    = '├' + '─'.repeat(innerWidth) + '┤';
  const out = [top];
  if (title) {
    out.push('│' + ' '.repeat(padding) + padRight(title, innerWidth - padding * 2) + ' '.repeat(padding) + '│');
    out.push(sep);
  }
  for (const line of all) {
    out.push('│' + ' '.repeat(padding) + padRight(line, innerWidth - padding * 2) + ' '.repeat(padding) + '│');
  }
  out.push(bottom);
  return out.join('\n');
}

function padRight(s, width) {
  const visible = visibleLength(s);
  if (visible >= width) return s;
  return s + ' '.repeat(width - visible);
}

// Approximate visible length for ASCII + box drawing + emoji.
// Emojis are usually 2 cells wide in terminals; many of our ASCII arts use 1-cell chars.
function visibleLength(s) {
  if (typeof s !== 'string') return 0;
  let len = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (code >= 0x1F300 && code <= 0x1FAFF) len += 2;
    else if (code >= 0x2600 && code <= 0x27BF) len += 2;
    else len += 1;
  }
  return len;
}

// ── Standalone widget helpers (for future CLI tools) ───────────────────────────
// These DO use ANSI escape codes. Only call them from a process that owns its
// terminal (not from a hook that returns control to Claude Code).

const ANSI = {
  reset:        '\x1b[0m',
  bold:         '\x1b[1m',
  dim:          '\x1b[2m',
  red:          '\x1b[31m',
  green:        '\x1b[32m',
  yellow:       '\x1b[33m',
  cyan:         '\x1b[36m',
  hideCursor:   '\x1b[?25l',
  showCursor:   '\x1b[?25h',
  clearLine:    '\x1b[2K',
  cursorUp:     (n) => `\x1b[${n}A`,
  cursorDown:   (n) => `\x1b[${n}B`,
  saveCursor:   '\x1b[s',
  restoreCursor:'\x1b[u',
};

function termWidth() {
  return Math.max(20, process.stdout.columns || 80);
}

function termHeight() {
  return Math.max(5, process.stdout.rows || 24);
}

function color(state, text) {
  const map = { idle: ANSI.dim, thinking: ANSI.cyan, running: ANSI.yellow, success: ANSI.green, error: ANSI.red };
  const c = map[state] || '';
  return `${c}${text}${ANSI.reset}`;
}

function renderStatus(message, state = 'idle') {
  const line = `${color(state, '●')} ${message}`;
  process.stdout.write(`${ANSI.clearLine}\r${line}\n`);
}

function renderPanel(title, lines) {
  const text = boxPanel(title, lines);
  process.stdout.write(text + '\n');
}

let widgetLineCount = 0;

function clearWidget() {
  if (widgetLineCount === 0) return;
  for (let i = 0; i < widgetLineCount; i++) {
    process.stdout.write(ANSI.cursorUp(1) + ANSI.clearLine);
  }
  widgetLineCount = 0;
}

function cleanupTerminal() {
  process.stdout.write(ANSI.showCursor);
}

function installCleanup() {
  process.on('exit', cleanupTerminal);
  process.on('SIGINT',  () => { cleanupTerminal(); process.exit(130); });
  process.on('SIGTERM', () => { cleanupTerminal(); process.exit(143); });
}

module.exports = {
  // hook-side rendering (text-only)
  randomAlertArt,
  allAlertArts,
  redactCredential,
  boxPanel,
  // standalone CLI helpers (ANSI-using)
  renderStatus,
  renderPanel,
  clearWidget,
  cleanupTerminal,
  installCleanup,
  termWidth,
  termHeight,
  ANSI,
};
