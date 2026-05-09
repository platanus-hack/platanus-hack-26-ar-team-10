#!/usr/bin/env sh
set -eu

MARKETPLACE_SOURCE="${YIELDOS_MARKETPLACE_SOURCE:-platanus-hack/platanus-hack-26-ar-team-10}"
PLUGIN_ID="${YIELDOS_PLUGIN_ID:-yieldos@yieldos}"
SCOPE="${YIELDOS_INSTALL_SCOPE:-user}"
DRY_RUN=0
FORCE_REFRESH=0

usage() {
  cat <<'EOF'
Install yieldOS as a Claude Code plugin.

Usage:
  sh install.sh [options]

Options:
  --scope <user|project|local>  Install scope passed to Claude Code (default: user)
  --source <repo|url|path>      Marketplace source (default: platanus-hack/platanus-hack-26-ar-team-10)
  --plugin <plugin@marketplace> Plugin id to install (default: yieldos@yieldos)
  --force                      Refresh the marketplace before installing
  --dry-run                    Print commands without running them
  -h, --help                   Show this help

Examples:
  curl -fsSL https://raw.githubusercontent.com/platanus-hack/platanus-hack-26-ar-team-10/main/install.sh | sh
  sh install.sh --scope project
  sh install.sh --source /path/to/platanus-hack-26-ar-team-10 --dry-run
EOF
}

die() {
  printf 'yieldOS installer: %s\n' "$*" >&2
  exit 1
}

has() {
  command -v "$1" >/dev/null 2>&1
}

print_cmd() {
  printf '+'
  for arg in "$@"; do
    printf ' %s' "$arg"
  done
  printf '\n'
}

run() {
  if [ "$DRY_RUN" = "1" ]; then
    print_cmd "$@"
  else
    "$@"
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --scope)
      [ "$#" -ge 2 ] || die "--scope needs a value"
      SCOPE="$2"
      shift 2
      ;;
    --source)
      [ "$#" -ge 2 ] || die "--source needs a value"
      MARKETPLACE_SOURCE="$2"
      shift 2
      ;;
    --plugin)
      [ "$#" -ge 2 ] || die "--plugin needs a value"
      PLUGIN_ID="$2"
      shift 2
      ;;
    --force)
      FORCE_REFRESH=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown option: $1"
      ;;
  esac
done

case "$SCOPE" in
  user|project|local) ;;
  *) die "--scope must be one of: user, project, local" ;;
esac

has claude || die "Claude Code CLI is required. Install Claude Code first, then rerun this script."
claude plugins --help >/dev/null 2>&1 || die "This Claude Code CLI does not expose plugin commands. Update Claude Code first."

has node || die "Node.js 18+ is required because yieldOS hooks run with node."
NODE_MAJOR="$(node -e "process.stdout.write(process.versions.node.split('.')[0])" 2>/dev/null || printf '0')"
case "$NODE_MAJOR" in
  ''|*[!0-9]*) die "Could not detect Node.js version. Node.js 18+ is required." ;;
esac
[ "$NODE_MAJOR" -ge 18 ] || die "Node.js 18+ is required. Current major version: $NODE_MAJOR"

printf 'yieldOS installer\n'
printf '  source: %s\n' "$MARKETPLACE_SOURCE"
printf '  plugin: %s\n' "$PLUGIN_ID"
printf '  scope: %s\n' "$SCOPE"
[ "$DRY_RUN" = "1" ] && printf '  mode: dry-run\n'
printf '\n'

run claude plugins marketplace add --scope "$SCOPE" "$MARKETPLACE_SOURCE"

if [ "$FORCE_REFRESH" = "1" ]; then
  run claude plugins marketplace update yieldos
fi

run claude plugins install --scope "$SCOPE" "$PLUGIN_ID"

printf '\n'
if [ "$DRY_RUN" = "1" ]; then
  printf 'Dry run complete. No changes were made.\n'
else
  printf 'yieldOS installed. Restart Claude Code so the plugin hooks load in new sessions.\n'
  printf 'Verify with: claude plugins list\n'
fi
