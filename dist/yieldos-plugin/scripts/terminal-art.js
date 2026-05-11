'use strict';

const ui = require('./ui');

const ALERT_ARTS = [
  [
    '       _____',
    '      /     \\',
    '     | x   x |',
    '      \\  ^  /',
    '       \\___/',
    '      /     \\',
  ].join('\n'),
  [
    '      .--.',
    '     /    \\',
    '    | o  o |',
    '    |  __  |',
    '     \\____/',
    '    /|____|\\',
  ].join('\n'),
  [
    '      .-.',
    '     /   \\',
    '    |     |',
    '  .-+--!--+-.',
    '  |  LOCKED |',
    '  `--------`',
  ].join('\n'),
  [
    '       ____',
    '     / BOOM\\',
    '    |  ()  |',
    '     \\____/',
    '       ||',
    '      _||_',
  ].join('\n'),
  [
    '       \\   /',
    '        \\ /',
    '      ---*---',
    '        / \\',
    '       /   \\',
    '    SECRET LEAK',
  ].join('\n'),
];

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  brightBlue: '\x1b[94m',
  cyan: '\x1b[36m',
  clearLine: '\x1b[2K',
  showCursor: '\x1b[?25h',
  hideCursor: '\x1b[?25l',
};

function randomAlertArt() {
  return ALERT_ARTS[Math.floor(Math.random() * ALERT_ARTS.length)];
}

function allAlertArts() {
  return ALERT_ARTS.slice();
}

function redactCredential(value) {
  if (typeof value !== 'string' || value.length === 0) return '[REDACTED]';

  const envMatch = value.match(/^([^=:\s]+[\s:=]+)(.+)$/s);
  if (envMatch) {
    return `${envMatch[1]}${redactCredential(envMatch[2].trim())}`;
  }

  const bearerMatch = value.match(/^(Bearer\s+)(.+)$/i);
  if (bearerMatch) {
    return `${bearerMatch[1]}${redactCredential(bearerMatch[2])}`;
  }

  if (value.length <= 6) return '*'.repeat(value.length);
  return `${value.slice(0, 2)}${'*'.repeat(Math.max(8, value.length - 4))}${value.slice(-2)}`;
}

function visibleLength(value) {
  if (typeof value !== 'string') return 0;
  let length = 0;
  for (const char of value) {
    const code = char.codePointAt(0);
    length += code >= 0x1F300 && code <= 0x1FAFF ? 2 : 1;
  }
  return length;
}

function padRight(value, width) {
  const visible = visibleLength(value);
  return visible >= width ? value : `${value}${' '.repeat(width - visible)}`;
}

function boxPanel(title, lines) {
  const body = Array.isArray(lines) ? lines : String(lines).split('\n');
  const width = Math.max(visibleLength(title || ''), ...body.map(visibleLength)) + 2;
  const out = [`┌${'─'.repeat(width)}┐`];

  if (title) {
    out.push(`│ ${padRight(title, width - 2)} │`);
    out.push(`├${'─'.repeat(width)}┤`);
  }

  for (const line of body) {
    out.push(`│ ${padRight(line, width - 2)} │`);
  }

  out.push(`└${'─'.repeat(width)}┘`);
  return out.join('\n');
}

function color(state, text, options = {}) {
  const stream = options.stream || process.stderr;
  const env = options.env || process.env;
  if (!ui.shouldColor(stream, env)) return text;
  const prefix = {
    idle: ANSI.dim,
    running: ANSI.yellow,
    success: ANSI.green,
    error: ANSI.red,
    info: ANSI.cyan,
  }[state] || '';
  return `${prefix}${text}${ANSI.reset}`;
}

function colorText(state, text) {
  return color(state, text);
}

function statusLine(message, state = 'info') {
  const symbol = {
    idle: '○',
    running: '◐',
    success: '●',
    error: '●',
    info: '●',
  }[state] || '●';
  return `${color(state, symbol)} ${message}`;
}

function alertLine(message, options = {}) {
  const stream = options.stream || process.stderr;
  const env = options.env || process.env;
  if (!ui.shouldColor(stream, env)) return `yieldOS · ${message}`;
  return color('error', `${ANSI.bold}🛡  yieldOS${ANSI.reset}${ANSI.red} · ${message}`, { stream, env });
}

function renderStatus(message, state = 'idle') {
  process.stdout.write(`${ui.shouldColor(process.stdout) ? ANSI.clearLine : ''}\r${color(state, '●', { stream: process.stdout })} ${message}\n`);
}

function renderPanel(title, lines) {
  process.stdout.write(`${boxPanel(title, lines)}\n`);
}

function cleanupTerminal() {
  process.stdout.write(ANSI.showCursor);
}

function installCleanup() {
  process.on('exit', cleanupTerminal);
  process.on('SIGINT', () => {
    cleanupTerminal();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    cleanupTerminal();
    process.exit(143);
  });
}

module.exports = {
  ANSI,
  allAlertArts,
  boxPanel,
  alertLine,
  cleanupTerminal,
  colorText,
  installCleanup,
  randomAlertArt,
  redactCredential,
  renderPanel,
  renderStatus,
  statusLine,
};
