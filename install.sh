#!/usr/bin/env bash
set -euo pipefail

# Install as a symlink so edits in this checkout are picked up by /reload.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$SCRIPT_DIR/src/index.ts"
EXTENSIONS_DIR="${PRIME_AGENT_DIR:-$HOME/.prime/agent/extensions}"
TARGET="$EXTENSIONS_DIR/kiconnect.ts"

mkdir -p "$EXTENSIONS_DIR"
rm -f "$TARGET"
ln -s "$SOURCE" "$TARGET"
printf '✓ Symlinked %s -> %s\n' "$TARGET" "$SOURCE"
printf 'Restart Prime Agent or run /reload to activate.\n'
